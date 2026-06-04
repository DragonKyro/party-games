import { create } from 'zustand';
import { bindRoom, type RoomBindings } from '@/platform/net/room';
import {
  generateRoomCode,
  getOrCreateUuid,
  getSavedDisplayName,
  saveDisplayName,
} from '@/platform/net/identity';
import type {
  ChatMessage,
  ConnectionState,
  GameSettingsBlob,
  LobbyState,
  LocalRole,
  Seat,
} from '@/platform/net/types';
import { useLobbyStore } from './lobbyStore';
import { useGameStore } from './gameStore';
import { getGame } from '@/platform/game/registry';
import { unpackReduce } from '@/platform/game/types';
import { freshSeed } from '@/platform/game/rng';

interface NetworkStoreState {
  myUuid: string;
  displayName: string;
  setDisplayName: (name: string) => void;

  roomCode: string;
  connection: ConnectionState;
  role: LocalRole;
  // Trystero peerIds for everyone in the room (including self is not in this
  // list — Trystero doesn't surface self as a peer).
  peers: Map<string, { uuid: string; displayName: string }>;
  chat: ChatMessage[];

  // The latest private payload host has staged for each peer. Host-only;
  // used to re-send on snapshot requests so a late joiner can recover their
  // hidden info.
  hostPrivateLog: Map<string, unknown>;

  // Lifecycle. `host` and `join` open a new room; `leave` tears it down.
  host(): Promise<void>;
  join(code: string): Promise<void>;
  leave(): void;

  // Host-only: end lobby and start the game.
  startSelectedGame(): void;

  // Chat. Local-first then broadcast.
  sendChat(text: string): void;

  // Solo (no network) — single-player mode against AI when implemented.
  // Kept as a stub for now since the platform doesn't ship any AI yet.
  startSolo(): void;

  // Host-only. Lobby UI calls this after mutating lobbyStore so guests get
  // the updated state. No-op for guests.
  broadcastLobby(): void;
}

let bindings: RoomBindings | null = null;
let chatCounter = 0;

function uuidForPeer(
  peers: Map<string, { uuid: string; displayName: string }>,
  peerId: string,
): string | null {
  return peers.get(peerId)?.uuid ?? null;
}

function peerForUuid(
  peers: Map<string, { uuid: string; displayName: string }>,
  uuid: string,
): string | null {
  for (const [peerId, info] of peers) {
    if (info.uuid === uuid) return peerId;
  }
  return null;
}

export const useNetworkStore = create<NetworkStoreState>((set, get) => {
  const myUuid = getOrCreateUuid();
  const displayName = getSavedDisplayName();

  // Wire gameStore's broadcast sink. The host applies actions locally first
  // (already done by dispatch), then emits the public envelope + any privates.
  useGameStore.getState().registerBroadcast({
    broadcastAction: (action, privates) => {
      const { myUuid: uuid, role } = get();
      if (role === 'solo') return;
      bindings?.sendAction({ action, byUuid: uuid });
      if (role === 'host' && privates && privates.length > 0) {
        for (const p of privates) {
          // Stash so future snapshots can replay it for late joiners.
          set((s) => {
            const next = new Map(s.hostPrivateLog);
            next.set(p.target, p.payload);
            return { hostPrivateLog: next };
          });
          if (p.target === uuid) {
            useGameStore.getState().setPrivateForMe(p.payload);
            continue;
          }
          const peerId = peerForUuid(get().peers, p.target);
          if (peerId) {
            bindings?.sendPrivate({ target: peerId, payload: p.payload });
          }
        }
      }
    },
  });

  function pushSystemChat(text: string) {
    const msg: ChatMessage = {
      id: `c${++chatCounter}-${Date.now()}`,
      senderUuid: '',
      senderName: 'System',
      text,
      timestamp: Date.now(),
      kind: 'system',
    };
    set((s) => ({ chat: [...s.chat, msg] }));
  }

  function openRoom(code: string, role: LocalRole) {
    bindings?.leave();
    bindings = bindRoom(code);
    set({
      roomCode: code,
      connection: 'connecting',
      role,
      peers: new Map(),
      chat: [],
      hostPrivateLog: new Map(),
    });

    const self = { uuid: get().myUuid, displayName: get().displayName };

    bindings.onPeerJoin((peerId) => {
      // Greet new peer with our hello so they learn our uuid.
      bindings?.sendHello(
        { uuid: self.uuid, displayName: self.displayName },
        peerId,
      );
      // If we're the host, also send the current lobby state and (if the
      // game is in progress) a snapshot.
      const role = get().role;
      if (role === 'host') {
        const lobby = useLobbyStore.getState().lobby;
        if (lobby) bindings?.sendLobby(lobby, peerId);
      }
    });

    bindings.onPeerLeave((peerId) => {
      const info = get().peers.get(peerId);
      set((s) => {
        const next = new Map(s.peers);
        next.delete(peerId);
        return { peers: next };
      });
      if (info) {
        pushSystemChat(`${info.displayName} left`);
        // Host updates lobby seats so leavers don't keep their slot.
        const role = get().role;
        if (role === 'host') {
          const lobby = useLobbyStore.getState().lobby;
          if (lobby) {
            const seats = lobby.seats.filter((s) => s.uuid !== info.uuid);
            const next = useLobbyStore.getState().setSeats(seats);
            if (next) bindings?.sendLobby(next);
          }
        }
      }
    });

    bindings.recvHello((msg, peerId) => {
      set((s) => {
        const next = new Map(s.peers);
        next.set(peerId, { uuid: msg.uuid, displayName: msg.displayName });
        return { peers: next };
      });
      pushSystemChat(`${msg.displayName} joined`);

      // Host-side: add the newcomer to seats if not already present and
      // broadcast the updated lobby.
      const role = get().role;
      if (role === 'host') {
        const lobby = useLobbyStore.getState().lobby;
        if (lobby && !lobby.seats.some((s) => s.uuid === msg.uuid)) {
          const seats: Seat[] = [
            ...lobby.seats,
            { uuid: msg.uuid, name: msg.displayName },
          ];
          const next = useLobbyStore.getState().setSeats(seats);
          if (next) bindings?.sendLobby(next);
        }
        // If a game is in progress, send a snapshot to the newcomer.
        const game = useGameStore.getState();
        if (game.gameId && game.state != null) {
          bindings?.sendSnapshot(
            {
              gameId: game.gameId,
              publicState: game.state,
              settings: game.settings,
              seats: game.seats,
              hostUuid: self.uuid,
              seed: 0,
              chat: get().chat,
              privateForRequester: get().hostPrivateLog.get(msg.uuid),
            },
            peerId,
          );
        }
      }
    });

    bindings.recvLobby((lobby) => {
      // Guests trust the host's broadcast.
      useLobbyStore.getState().setLobby(lobby);
      set({ connection: 'lobby' });
    });

    bindings.recvStart((msg) => {
      // Everyone (including the host's other tabs) initializes from the
      // start payload. Re-derives the role by checking if our uuid is on a
      // seat.
      const role: LocalRole = (() => {
        if (msg.hostUuid === self.uuid) return 'host';
        if (msg.seats.some((s) => s.uuid === self.uuid)) return 'guest';
        return 'spectator';
      })();
      useGameStore.getState().startGame({
        gameId: msg.gameId,
        publicState: msg.publicState,
        settings: msg.settings,
        seats: msg.seats,
        privateForMe: undefined,
      });
      set({ connection: 'in-game', role });
    });

    bindings.recvAction((env, peerId) => {
      const senderUuid = uuidForPeer(get().peers, peerId);
      if (!senderUuid || senderUuid !== env.byUuid) {
        // Drop spoofed actions — sender's wire uuid must match envelope.
        return;
      }
      useGameStore.getState().applyLocal(env.action, env.byUuid, Date.now());
    });

    bindings.recvPrivate((msg) => {
      // Host-issued. We trust whoever sent it because Trystero ensures only
      // the addressed peer receives a unicast.
      if (msg.target === self.uuid) {
        useGameStore.getState().setPrivateForMe(msg.payload);
      }
    });

    bindings.recvSnapshotRequest((_msg, peerId) => {
      const role = get().role;
      if (role !== 'host') return;
      const game = useGameStore.getState();
      const requesterInfo = get().peers.get(peerId);
      if (!game.gameId || game.state == null || !requesterInfo) return;
      bindings?.sendSnapshot(
        {
          gameId: game.gameId,
          publicState: game.state,
          settings: game.settings,
          seats: game.seats,
          hostUuid: self.uuid,
          seed: 0,
          chat: get().chat,
          privateForRequester: get().hostPrivateLog.get(requesterInfo.uuid),
        },
        peerId,
      );
    });

    bindings.recvSnapshot((msg) => {
      const role: LocalRole = (() => {
        if (msg.hostUuid === self.uuid) return 'host';
        if (msg.seats.some((s) => s.uuid === self.uuid)) return 'guest';
        return 'spectator';
      })();
      useGameStore.getState().startGame({
        gameId: msg.gameId,
        publicState: msg.publicState,
        settings: msg.settings,
        seats: msg.seats,
        privateForMe: msg.privateForRequester,
      });
      set({ connection: 'in-game', role, chat: msg.chat });
    });

    bindings.recvChat((msg) => {
      set((s) => ({ chat: [...s.chat, msg] }));
    });
  }

  return {
    myUuid,
    displayName,
    setDisplayName: (name: string) => {
      saveDisplayName(name);
      set({ displayName: name });
    },

    roomCode: '',
    connection: 'disconnected',
    role: 'solo',
    peers: new Map(),
    chat: [],
    hostPrivateLog: new Map(),

    host: async () => {
      const code = generateRoomCode();
      const seats: Seat[] = [
        { uuid: get().myUuid, name: get().displayName || 'Player' },
      ];
      const initialLobby: LobbyState = {
        seats,
        hostUuid: get().myUuid,
        selectedGameId: '',
        gameSettings: {},
        seed: freshSeed(),
      };
      useLobbyStore.getState().setLobby(initialLobby);
      openRoom(code, 'host');
      set({ connection: 'lobby' });
    },

    join: async (code: string) => {
      openRoom(code.toUpperCase(), 'guest');
      // Lobby state arrives via host's broadcast — we just sit in
      // 'connecting' until then.
    },

    leave: () => {
      bindings?.leave();
      bindings = null;
      useLobbyStore.getState().setLobby(null);
      useGameStore.getState().endGame();
      set({
        connection: 'disconnected',
        role: 'solo',
        roomCode: '',
        peers: new Map(),
        chat: [],
        hostPrivateLog: new Map(),
      });
    },

    startSelectedGame: () => {
      const role = get().role;
      if (role !== 'host' && role !== 'solo') return;
      const lobby = useLobbyStore.getState().lobby;
      if (!lobby || !lobby.selectedGameId) return;
      const mod = getGame(lobby.selectedGameId);
      if (!mod) return;
      const settings: GameSettingsBlob =
        lobby.gameSettings[lobby.selectedGameId] ?? {
          ...(mod.manifest.defaultSettings as object),
        };
      const ret = mod.createInitialState({
        seats: lobby.seats,
        settings: settings as never,
        seed: lobby.seed,
      });
      const { state: publicState, privates } = unpackReduce(ret);

      // Self-start the game first so our store is consistent before sending.
      useGameStore.getState().startGame({
        gameId: lobby.selectedGameId,
        publicState,
        settings,
        seats: lobby.seats,
        privateForMe: privates?.find((p) => p.target === get().myUuid)?.payload,
      });
      set({ connection: 'in-game' });

      if (role === 'host') {
        bindings?.sendStart({
          gameId: lobby.selectedGameId,
          publicState,
          settings,
          seats: lobby.seats,
          hostUuid: get().myUuid,
          seed: lobby.seed,
        });
        if (privates) {
          for (const p of privates) {
            set((s) => {
              const next = new Map(s.hostPrivateLog);
              next.set(p.target, p.payload);
              return { hostPrivateLog: next };
            });
            if (p.target === get().myUuid) continue;
            const peerId = peerForUuid(get().peers, p.target);
            if (peerId) {
              bindings?.sendPrivate({ target: peerId, payload: p.payload });
            }
          }
        }
      }
    },

    sendChat: (text) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      const msg: ChatMessage = {
        id: `c${++chatCounter}-${Date.now()}`,
        senderUuid: get().myUuid,
        senderName: get().displayName || 'Player',
        text: trimmed,
        timestamp: Date.now(),
        kind: 'user',
      };
      set((s) => ({ chat: [...s.chat, msg] }));
      if (get().role !== 'solo') bindings?.sendChat(msg);
    },

    broadcastLobby: () => {
      if (get().role !== 'host') return;
      const lobby = useLobbyStore.getState().lobby;
      if (lobby) bindings?.sendLobby(lobby);
    },

    startSolo: () => {
      const seats: Seat[] = [
        { uuid: get().myUuid, name: get().displayName || 'Player' },
      ];
      useLobbyStore.getState().setLobby({
        seats,
        hostUuid: get().myUuid,
        selectedGameId: '',
        gameSettings: {},
        seed: freshSeed(),
      });
      set({
        connection: 'lobby',
        role: 'solo',
        roomCode: '',
        peers: new Map(),
      });
    },
  };
});
