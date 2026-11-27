import { create } from 'zustand';
import { getGame } from '@/engine/registry';
import { randomSeed } from '@/engine/rng';
import type { GameConfig, GameId, SeatIndex } from '@/engine/types';
import { generateRoomCode, getDisplayName, normalizeRoomCode, setDisplayName as persistDisplayName } from '@/net/identity';
import { setRoomInUrl } from '@/net/roomLink';
import type { GuestConnection, GuestEvents, HostConnection, HostEvents, RoomTransport } from '@/net/transport';
import type {
  ChatMessage,
  ConnectionState,
  InboxMessage,
  LobbyState,
  LocalRole,
  Presence,
  RoomMeta,
  ViewRecord,
} from '@/net/types';
import { resolveLists } from '@/words/library';
import { useBoardStore } from './boardStore';
import { serverNow, setServerOffset } from './clock';
import { useGameStore } from './gameStore';
import {
  applyJoin,
  applyLeave,
  buildViews,
  cleanName,
  isStaleView,
  moveSeat,
  removeSeat,
  seatOf,
  stampChangedViews,
  vetInboundAction,
  type LedgerEntry,
} from './hostLogic';

// ============================================================================
// networkStore — online play over Firebase Realtime Database
// ============================================================================
//
// Host-authoritative. The host's device owns the lobby and the only copy of
// the private game state:
//   - guests write join requests and actions to the room inbox; the database
//     stamps each with the sender's uid; the host vets them (`hostLogic.ts`)
//     and applies actions through `gameStore.hostApply`;
//   - after every applied action (human or timer) the host writes each
//     connected device its own redacted view to `views/{uid}`, which the
//     security rules let only that device read. Peers never receive anyone
//     else's view, never the seed, never the host's word lists.
//   - Sketch & Guess strokes stream through the room's board channel; the
//     host decides who may draw (`GameModule.liveBoard`).
//
// The host also saves its private state (debounced) to a host-only node so a
// reload resumes the match (`?room=CODE` in the URL rejoins on load).
//
// Party rooms are open tables and outlive matches: everyone who joins sits
// down, and between matches the host can switch to another game.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyAction = any;

const SAVE_DEBOUNCE_MS = 900;

export interface JoinOptions {
  /** Join without a seat (a shared TV screen, or just watching). */
  watch?: boolean;
  /** Reopen as host even though the host seems connected elsewhere (another tab). */
  takeover?: boolean;
}

interface NetworkStore {
  connection: ConnectionState;
  role: LocalRole;
  /** This device's uid while online. */
  uuid: string | null;
  displayName: string;
  hostUuid: string | null;
  lobby: LobbyState | null;
  chat: ChatMessage[];
  /** uid → number of live connections. */
  onlinePeers: Record<string, number>;
  /** Display names of everyone present (for spectators in the lobby list). */
  present: Presence[];
  roomCode: string | null;
  /** Last user-facing problem (room not found, server unreachable, …). */
  error: string | null;
  linkUp: boolean;
  /** Guest: a match is running but this device stepped out to the lobby. */
  matchHidden: boolean;
  /** Guest: joined as a watcher (doesn't take a seat automatically). */
  watching: boolean;
  /**
   * This browser is the host of room X, which is already open in another
   * tab or window. Opening it here too would make two hosts, so we ask first.
   */
  hostElsewhere: string | null;

  hostRoom: (gameId: GameId, options?: Record<string, unknown>) => Promise<void>;
  joinRoom: (roomCode: string, opts?: JoinOptions) => Promise<void>;
  leaveRoom: () => void;

  // Host-only.
  setLobbyGameId: (gameId: GameId, options?: Record<string, unknown>) => void;
  setLobbyOptions: (options: Record<string, unknown>) => void;
  removePlayer: (index: SeatIndex) => void;
  movePlayer: (index: SeatIndex, delta: -1 | 1) => void;
  /** Start a match (or, mid-match, deal a fresh one with the same players). */
  startGame: () => void;
  /** End the running match for everyone (back to the lobby). */
  endMatch: () => void;

  // Guest-only.
  takeSeat: () => void;
  standUp: () => void;
  /** Return to the running match after stepping out. */
  resumeMatch: () => void;

  setLocalName: (name: string) => void;
  sendChat: (text: string) => void;
  clearError: () => void;
  reset: () => void;
}

// ----------------------------------------------------------------------------
// Module state (connections aren't serialisable, so they stay out of Zustand)
// ----------------------------------------------------------------------------

let transportOverride: RoomTransport | null = null;
/** Tests: run against `fakeTransport` instead of Firebase. */
export function setTransportForTests(t: RoomTransport | null): void {
  transportOverride = t;
}

async function transport(watch = false): Promise<RoomTransport> {
  if (transportOverride) return transportOverride;
  // Lazy: the Firebase SDK only downloads when someone goes online.
  const mod = await import('@/net/firebaseRoom');
  return mod.getTransport(watch);
}

/** How long a host reload's previous connection may linger in presence. */
const STALE_PRESENCE_MS = 2500;

function newSessionId(): string {
  return Math.random().toString(36).slice(2, 10);
}

let hostConn: HostConnection | null = null;
let guestConn: GuestConnection | null = null;
// Bumped on every create / join / leave so late async results from an
// abandoned attempt are ignored.
let generation = 0;
// Host: uids connected now; what each device was last sent this match; the
// live board last granted; the pending debounced save.
let presentUids: string[] = [];
let ledger = new Map<string, LedgerEntry>();
let boardKey: string | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
// This host page load's id, stamped on every view (see ViewRecord.session).
let hostSession = newSessionId();
// Guest: the latest view record, which match / host session is applied
// locally, and which lobby match we last asked to sit down for.
let latestView: ViewRecord | null = null;
let appliedMatch = -1;
let appliedSession: string | undefined;
let joinAskedFor: number | null = null;

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** Lobby options are world-readable in the room: never let a seed or list entries in. */
export function sanitizeOptions(options: Record<string, unknown>): Record<string, unknown> {
  const out = { ...options };
  delete out.seed;
  delete out.lists;
  return out;
}

function countPresence(people: Presence[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of people) out[p.uid] = (out[p.uid] ?? 0) + 1;
  return out;
}

function uniquePresence(people: Presence[]): Presence[] {
  const seen = new Set<string>();
  return people.filter((p) => (seen.has(p.uid) ? false : (seen.add(p.uid), true)));
}

function cancelSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
}

function teardownConnections(deleteRoom: boolean) {
  generation++;
  cancelSave();
  if (hostConn) hostConn.close({ deleteRoom });
  if (guestConn) guestConn.close();
  hostConn = null;
  guestConn = null;
  presentUids = [];
  ledger = new Map();
  boardKey = null;
  latestView = null;
  appliedMatch = -1;
  appliedSession = undefined;
  joinAskedFor = null;
  const gs = useGameStore.getState();
  gs.registerBroadcastHandler(null);
  gs.registerHostAppliedListener(null);
  gs.registerExitHandler(null);
  gs.registerReplayHandler(null);
  const bs = useBoardStore.getState();
  bs.setSender(null);
  bs.reset(null);
}

export const useNetworkStore = create<NetworkStore>((set, get) => {
  // --------------------------------------------------------------------------
  // Shared events
  // --------------------------------------------------------------------------

  function commonEvents(gen: number) {
    const live = () => gen === generation;
    return {
      presence: (people: Presence[]) => {
        if (!live()) return;
        set({ onlinePeers: countPresence(people), present: uniquePresence(people) });
      },
      chat: (msg: ChatMessage) => {
        if (!live()) return;
        set((s) => (s.chat.some((m) => m.id === msg.id) ? s : { chat: [...s.chat, msg] }));
      },
      connected: (up: boolean) => {
        if (live()) set({ linkUp: up });
      },
      clock: (offset: number) => {
        if (live()) setServerOffset(offset);
      },
      board: (meta: { id: string } | null) => {
        if (live()) useBoardStore.getState().reset(meta?.id ?? null);
      },
      boardOps: (boardId: string, payload: string) => {
        if (live()) useBoardStore.getState().receive(boardId, payload);
      },
    };
  }

  function installBoardSender(conn: HostConnection | GuestConnection) {
    useBoardStore.getState().setSender((id, payload) => conn.pushBoard(id, payload));
  }

  // --------------------------------------------------------------------------
  // Host internals
  // --------------------------------------------------------------------------

  function commitLobby(next: LobbyState) {
    set({ lobby: next });
    hostConn?.setLobby(next).catch((e: Error) => console.warn('[host] lobby write failed:', e.message));
  }

  function seatedUids(lobby: LobbyState): string[] {
    return lobby.seats.filter((s) => s.uuid).map((s) => s.uuid!);
  }

  /** Grant the live board to its drawer before the views that ask them to draw. */
  function syncBoard(state: unknown, lobby: LobbyState) {
    const { module } = useGameStore.getState();
    if (!hostConn || !module?.liveBoard) return;
    const b = module.liveBoard(state);
    const owner = b ? lobby.seats[b.drawerSeat]?.uuid : null;
    const key = b && owner ? `${b.id}|${owner}` : null;
    if (key === boardKey) return;
    boardKey = key;
    hostConn
      .setBoard(b && owner ? { id: b.id, owner } : null)
      .catch((e: Error) => console.warn('[host] board write failed:', e.message));
  }

  function scheduleSave() {
    if (saveTimer) return;
    saveTimer = setTimeout(() => {
      saveTimer = null;
      const { lobby } = get();
      const { module, privateState, tick } = useGameStore.getState();
      if (!hostConn || !lobby?.inGame || !module || privateState === null) return;
      const viewSeq: Record<string, number> = {};
      for (const [u, e] of ledger) viewSeq[u] = e.seq;
      hostConn
        .save({ match: lobby.match, gameId: module.id, tick, state: privateState, viewSeq })
        .catch((e: Error) => console.warn('[host] save failed:', e.message));
    }, SAVE_DEBOUNCE_MS);
  }

  /** Stamp this host session on outgoing views (guests reset their tick floor when it changes). */
  function withSession(views: Record<string, ViewRecord>): Record<string, ViewRecord> {
    const out: Record<string, ViewRecord> = {};
    for (const [uid, rec] of Object.entries(views)) out[uid] = { ...rec, session: hostSession };
    return out;
  }

  /** Fan out per-device redacted views; save state soon after. */
  function hostPublish(state: unknown, tick: number) {
    const { lobby, uuid } = get();
    const { module } = useGameStore.getState();
    if (!hostConn || !lobby?.inGame || !module || !uuid) return;
    syncBoard(state, lobby);
    const recipients = new Set([...presentUids, ...seatedUids(lobby)]);
    const views = stampChangedViews(ledger, buildViews(module, state, lobby, recipients, tick, uuid));
    hostConn.publish(withSession(views)).catch((e: Error) => console.warn('[host] publish failed:', e.message));
    scheduleSave();
  }

  /**
   * Devices that just (re)appeared mid-match get their current view if it
   * changed while they were away. Spectators aren't sent views while absent,
   * so a TV that slept through a phase change would otherwise stay stale.
   */
  function hostPublishTo(uids: string[]) {
    const { lobby, uuid } = get();
    const { module, privateState, tick } = useGameStore.getState();
    if (!hostConn || !lobby?.inGame || !module || privateState === null || !uuid) return;
    const fresh = uids.filter((u) => u !== uuid);
    if (fresh.length === 0) return;
    const views = stampChangedViews(ledger, buildViews(module, privateState, lobby, fresh, tick, uuid));
    if (Object.keys(views).length === 0) return;
    hostConn.publish(withSession(views)).catch((e: Error) => console.warn('[host] publish failed:', e.message));
  }

  function hostHandleInbox(fromUid: string, msg: InboxMessage) {
    const lobby = get().lobby;
    if (!lobby) return;
    switch (msg.kind) {
      case 'join': {
        const next = applyJoin(lobby, fromUid, msg.name, getGame(lobby.gameId).maxPlayers);
        if (next) commitLobby(next);
        return;
      }
      case 'leave': {
        const next = applyLeave(lobby, fromUid);
        if (next) commitLobby(next);
        return;
      }
      case 'action': {
        // An action sent from (or queued during) an earlier match must not
        // land in this one, where its turn tokens may be valid again.
        if (typeof msg.match === 'number' && msg.match !== lobby.match) {
          console.warn(`[host] refused action from ${fromUid}: it was for match ${msg.match}`);
          return;
        }
        const verdict = vetInboundAction(lobby, fromUid, msg.action);
        if (!verdict.ok) {
          console.warn(`[host] refused action from ${fromUid}: ${verdict.reason}`);
          return;
        }
        useGameStore.getState().hostApply(msg.action as AnyAction, fromUid);
        return;
      }
    }
  }

  function hostEvents(gen: number): HostEvents {
    const common = commonEvents(gen);
    return {
      ...common,
      presence: (people) => {
        if (gen !== generation) return;
        const before = new Set(presentUids);
        presentUids = [...new Set(people.map((p) => p.uid))];
        common.presence(people);
        hostPublishTo(presentUids.filter((u) => !before.has(u)));
      },
      inbox: (fromUid, msg) => {
        if (gen !== generation) return;
        hostHandleInbox(fromUid, msg);
      },
    };
  }

  function installHostHooks() {
    const gs = useGameStore.getState();
    gs.registerBroadcastHandler(null);
    gs.registerHostAppliedListener((state, tick) => hostPublish(state, tick));
    gs.registerExitHandler(() => {
      const finished = (() => {
        const { module, privateState } = useGameStore.getState();
        return !!module && privateState !== null && module.isFinished(privateState);
      })();
      if (
        !finished &&
        typeof window !== 'undefined' &&
        typeof window.confirm === 'function' &&
        !window.confirm('End this game for everyone and return to the lobby?')
      ) {
        return;
      }
      get().endMatch();
    });
    gs.registerReplayHandler(() => get().startGame());
    if (hostConn) installBoardSender(hostConn);
  }

  function hostStartLocal(lobby: LobbyState, state: unknown, gameId: GameId, tick: number) {
    const uuid = get().uuid;
    const hostSeat = uuid ? (seatOf(lobby, uuid)?.index ?? null) : null;
    useGameStore.getState().startLocalGame(getGame(gameId), state, hostSeat, {
      controllableSeats: hostSeat === null ? [] : [hostSeat],
      tick,
    });
  }

  async function resumeAsHost(t: RoomTransport, code: string, meta: RoomMeta, uid: string, gen: number) {
    const displayName = get().displayName;
    const { conn, lobby, saved, board } = await t.resumeHost(code, meta, { uid, name: displayName }, hostEvents(gen));
    if (gen !== generation) {
      conn.close({ deleteRoom: false });
      return;
    }
    if (!lobby) {
      conn.close({ deleteRoom: true });
      set({ connection: 'disconnected', role: 'solo', roomCode: null, error: 'That room was damaged; start a new one.' });
      setRoomInUrl(null);
      return;
    }
    hostConn = conn;
    hostSession = newSessionId();
    set({ connection: 'lobby', role: 'host', uuid: uid, hostUuid: uid, lobby, roomCode: code, error: null });
    setRoomInUrl(code);
    installHostHooks();
    const endSavedMatch = () => {
      commitLobby({ ...lobby, inGame: false });
      conn.clearMatch().catch(() => {});
    };
    if (lobby.inGame && saved && saved.match === lobby.match) {
      // Keep the live board as it is: re-granting the same board would wipe its strokes.
      boardKey = board ? `${board.id}|${board.owner}` : null;
      // Continue each device's sequence (an empty key forces a fresh send).
      // Guests also accept these because the host session changed.
      ledger = new Map(Object.entries(saved.viewSeq ?? {}).map(([u, seq]) => [u, { key: '', seq }]));
      try {
        set({ connection: 'in-game' });
        hostStartLocal(lobby, saved.state, saved.gameId, saved.tick);
      } catch (e) {
        // e.g. a new build can't read an old save. End the match, keep the room.
        console.warn('[host] could not resume the saved game:', errorMessage(e));
        useGameStore.getState().clearGame();
        ledger = new Map();
        boardKey = null;
        endSavedMatch();
        set({ connection: 'lobby', error: 'The game in progress couldn’t be resumed, so it was ended. Start a new one!' });
      }
    } else if (lobby.inGame) {
      // The saved state is gone: the match can't continue.
      endSavedMatch();
    }
  }

  function beginMatch(lobby: LobbyState): boolean {
    const { uuid } = get();
    if (!uuid || !hostConn) return false;
    const mod = getGame(lobby.gameId);
    if (lobby.seats.length < mod.minPlayers) {
      set({ error: `${mod.displayName} needs at least ${mod.minPlayers} players.` });
      return false;
    }
    const problem = mod.optionsProblem?.(lobby.gameOptions, lobby.seats.length) ?? null;
    if (problem) {
      set({ error: problem });
      return false;
    }
    // The seed and the host's word lists are resolved here and never leave this device.
    const config: GameConfig = {
      gameId: lobby.gameId,
      seats: lobby.seats,
      seed: randomSeed(),
      now: serverNow(),
      gameOptions: lobby.gameOptions,
      lists: resolveLists(lobby.gameOptions),
    };
    let initialState: unknown;
    try {
      initialState = mod.createInitialState(config);
    } catch (e) {
      set({ error: `Couldn't start: ${errorMessage(e)}` });
      return false;
    }
    cancelSave();
    ledger = new Map();
    boardKey = null;
    const next: LobbyState = { ...lobby, inGame: true, match: lobby.match + 1 };
    commitLobby(next);
    set({ connection: 'in-game', error: null });
    hostStartLocal(next, initialState, lobby.gameId, 0);
    return true;
  }

  // --------------------------------------------------------------------------
  // Guest internals
  // --------------------------------------------------------------------------

  function applyGuestView(rec: ViewRecord) {
    const gs = useGameStore.getState();
    const env = rec.env;
    const current =
      gs.publicView && gs.gameId
        ? { match: appliedMatch, session: appliedSession, gameId: gs.gameId, tick: gs.tick }
        : null;
    if (isStaleView(current, rec)) return;
    useGameStore.setState({
      gameId: env.gameId,
      module: getGame(env.gameId),
      privateState: null,
      isHost: false,
      tick: env.tick,
      publicView: env,
      localSeat: env.seat,
      controllableSeats: env.seat === null ? [] : [env.seat],
    });
    appliedMatch = rec.match;
    appliedSession = rec.session;
    set({ connection: 'in-game', matchHidden: false });
  }

  /** Send to the host. Resolves false when not connected or the send failed. */
  function guestSend(msg: InboxMessage): Promise<boolean> {
    if (!guestConn) return Promise.resolve(false);
    return guestConn.send(msg).then(
      () => true,
      (e: Error) => {
        console.warn('[guest] send failed:', e.message);
        set({ error: `Couldn't reach the host: ${e.message}` });
        return false;
      },
    );
  }

  /** Ask to sit down (once per match). Only remembered if it was actually sent. */
  function askToSit(lobby: LobbyState) {
    if (!guestConn) return;
    const match = lobby.match;
    joinAskedFor = match;
    void guestSend({ kind: 'join', name: get().displayName || 'Player' }).then((ok) => {
      if (!ok && joinAskedFor === match) joinAskedFor = null;
    });
  }

  function guestEvents(gen: number, uid: string): GuestEvents {
    const common = commonEvents(gen);
    return {
      ...common,
      lobby: (lobby) => {
        if (gen !== generation) return;
        if (!lobby) {
          get().leaveRoom();
          set({ error: 'The host closed the room.' });
          return;
        }
        const seated = !!seatOf(lobby, uid);
        set((s) => ({
          lobby,
          role: seated ? 'guest' : 'spectator',
          connection: s.connection === 'connecting' ? 'lobby' : s.connection,
        }));
        // Open table: sit down automatically (once per match) unless watching.
        if (!seated && !lobby.inGame && !get().watching && joinAskedFor !== lobby.match) askToSit(lobby);
      },
      view: (rec) => {
        if (gen !== generation) return;
        latestView = rec;
        if (!rec) {
          if (useGameStore.getState().publicView) useGameStore.getState().clearGame();
          appliedMatch = -1;
          set({ connection: 'lobby', matchHidden: false });
          return;
        }
        // A new match started while this device had stepped out: bring it back in.
        if (rec.match !== appliedMatch && get().matchHidden) set({ matchHidden: false });
        if (!get().matchHidden) applyGuestView(rec);
      },
    };
  }

  // --------------------------------------------------------------------------
  // Store
  // --------------------------------------------------------------------------

  return {
    connection: 'disconnected',
    role: 'solo',
    uuid: null,
    displayName: getDisplayName(),
    hostUuid: null,
    lobby: null,
    chat: [],
    onlinePeers: {},
    present: [],
    roomCode: null,
    error: null,
    linkUp: true,
    matchHidden: false,
    watching: false,
    hostElsewhere: null,

    hostRoom: async (gameId, options) => {
      teardownConnections(get().role === 'host');
      useGameStore.getState().clearGame();
      const gen = generation;
      set({
        connection: 'connecting',
        role: 'host',
        error: null,
        lobby: null,
        chat: [],
        roomCode: null,
        watching: false,
        hostElsewhere: null,
      });
      try {
        const t = await transport();
        const uid = await t.signIn();
        if (gen !== generation) return;
        const displayName = cleanName(get().displayName) || 'Host';
        const mod = getGame(gameId);
        const lobby: LobbyState = {
          gameId,
          seats: [{ index: 0, uuid: uid, name: displayName }],
          gameOptions: sanitizeOptions(options ?? mod.defaultOptions()),
          inGame: false,
          match: 0,
        };
        let conn: HostConnection | null = null;
        let code = '';
        for (let attempt = 0; attempt < 6 && !conn; attempt++) {
          code = generateRoomCode();
          conn = await t.createRoom(code, lobby, { uid, name: displayName }, hostEvents(gen));
        }
        if (gen !== generation) {
          conn?.close({ deleteRoom: true });
          return;
        }
        if (!conn) throw new Error('Could not find a free room code — try again.');
        hostConn = conn;
        hostSession = newSessionId();
        set({ connection: 'lobby', role: 'host', uuid: uid, displayName, hostUuid: uid, lobby, roomCode: code });
        setRoomInUrl(code);
        installHostHooks();
      } catch (e) {
        if (gen !== generation) return;
        teardownConnections(get().role === 'host');
        set({ connection: 'disconnected', role: 'solo', error: errorMessage(e) });
      }
    },

    joinRoom: async (input, opts) => {
      const code = normalizeRoomCode(input);
      if (!code) {
        set({ error: 'Room codes are 4–6 letters or numbers.' });
        return;
      }
      teardownConnections(get().role === 'host');
      useGameStore.getState().clearGame();
      const gen = generation;
      const watch = !!opts?.watch;
      set({
        connection: 'connecting',
        role: 'guest',
        roomCode: code,
        error: null,
        lobby: null,
        chat: [],
        watching: watch,
        hostElsewhere: null,
      });
      try {
        // A big screen gets its own identity (see getTransport), never the host's.
        const t = await transport(watch);
        const uid = await t.signIn();
        const meta = await t.lookupRoom(code);
        if (gen !== generation) return;
        if (!meta) {
          set({
            connection: 'disconnected',
            role: 'solo',
            roomCode: null,
            error: `There's no room ${code}. Check the code with your host.`,
          });
          setRoomInUrl(null);
          return;
        }
        if (meta.hostUid === uid) {
          // This browser hosts the room. If the host is still connected (another
          // tab or window), opening it here too would make two hosts fighting
          // over the lobby — ask first. A reload's old connection can linger in
          // presence for a moment, so look twice.
          if (!opts?.takeover) {
            let live = (await t.lookupPresence(code)).includes(uid);
            if (live) {
              await new Promise((r) => setTimeout(r, STALE_PRESENCE_MS));
              live = (await t.lookupPresence(code)).includes(uid);
            }
            if (gen !== generation) return;
            if (live) {
              set({ connection: 'disconnected', role: 'solo', roomCode: null, hostElsewhere: code });
              setRoomInUrl(null);
              return;
            }
          }
          await resumeAsHost(t, code, meta, uid, gen);
          return;
        }
        const displayName = cleanName(get().displayName) || 'Player';
        set({ uuid: uid, displayName, hostUuid: meta.hostUid });
        const conn = await t.joinAsGuest(code, meta, { uid, name: displayName }, guestEvents(gen, uid));
        if (gen !== generation) {
          conn.close();
          return;
        }
        guestConn = conn;
        setRoomInUrl(code, { watch });
        installBoardSender(conn);
        // The first lobby event may have arrived before guestConn was set.
        const lobby = get().lobby;
        if (lobby && !seatOf(lobby, uid) && !lobby.inGame && !get().watching && joinAskedFor !== lobby.match) {
          askToSit(lobby);
        }
        const gs = useGameStore.getState();
        gs.registerHostAppliedListener(null);
        gs.registerReplayHandler(null);
        gs.registerBroadcastHandler((action) => {
          void guestSend({ kind: 'action', action, ...(appliedMatch >= 0 ? { match: appliedMatch } : {}) });
        });
        gs.registerExitHandler(() => {
          // Step out to the lobby; the match keeps running and the seat is kept.
          useGameStore.getState().clearGame();
          set({ connection: 'lobby', matchHidden: true });
        });
      } catch (e) {
        if (gen !== generation) return;
        // Never delete a room on a failed join / resume: this call didn't create it.
        teardownConnections(false);
        set({ connection: 'disconnected', role: 'solo', roomCode: null, error: errorMessage(e) });
      }
    },

    leaveRoom: () => {
      const wasHost = get().role === 'host';
      teardownConnections(wasHost);
      useGameStore.getState().clearGame();
      setRoomInUrl(null);
      set({
        connection: 'disconnected',
        role: 'solo',
        hostUuid: null,
        lobby: null,
        chat: [],
        onlinePeers: {},
        present: [],
        roomCode: null,
        matchHidden: false,
        watching: false,
      });
    },

    // ----- Host -----
    setLobbyGameId: (gameId, options) => {
      const { lobby, role } = get();
      if (role !== 'host' || !lobby || lobby.inGame) return;
      const mod = getGame(gameId);
      commitLobby({ ...lobby, gameId, gameOptions: sanitizeOptions(options ?? mod.defaultOptions()) });
    },

    setLobbyOptions: (options) => {
      const { role, lobby } = get();
      if (role !== 'host' || !lobby || lobby.inGame) return;
      commitLobby({ ...lobby, gameOptions: sanitizeOptions(options) });
    },

    removePlayer: (index) => {
      const { role, lobby, uuid } = get();
      if (role !== 'host' || !lobby || !uuid) return;
      const next = removeSeat(lobby, index, uuid);
      if (next) commitLobby(next);
    },

    movePlayer: (index, delta) => {
      const { role, lobby } = get();
      if (role !== 'host' || !lobby) return;
      const next = moveSeat(lobby, index, delta);
      if (next) commitLobby(next);
    },

    startGame: () => {
      const { role, lobby } = get();
      if (role !== 'host' || !lobby || !hostConn) return;
      if (lobby.inGame) {
        // "Play again" from the results screen: same players, fresh deal.
        useGameStore.getState().clearGame();
        hostConn.clearMatch().catch(() => {});
        if (!beginMatch(lobby)) {
          commitLobby({ ...lobby, inGame: false });
          set({ connection: 'lobby' });
        }
        return;
      }
      beginMatch(lobby);
    },

    endMatch: () => {
      const { lobby, role } = get();
      if (role !== 'host' || !lobby || !hostConn) return;
      useGameStore.getState().clearGame();
      cancelSave();
      ledger = new Map();
      boardKey = null;
      hostConn.clearMatch().catch((e: Error) => console.warn('[host] clear failed:', e.message));
      commitLobby({ ...lobby, inGame: false });
      set({ connection: 'lobby' });
    },

    // ----- Guest -----
    takeSeat: () => {
      const { lobby } = get();
      set({ watching: false });
      if (lobby) askToSit(lobby);
    },

    standUp: () => {
      set({ watching: true });
      void guestSend({ kind: 'leave' });
    },

    resumeMatch: () => {
      if (get().role === 'host' || !latestView) return;
      set({ matchHidden: false });
      applyGuestView(latestView);
    },

    setLocalName: (name) => {
      const clean = name.slice(0, 20);
      persistDisplayName(clean);
      set({ displayName: clean });
      const st = get();
      const trimmed = cleanName(clean);
      if (!st.lobby || !st.uuid || !trimmed) return;
      if (st.role === 'host') {
        if (st.lobby.inGame) return;
        const next = applyJoin(st.lobby, st.uuid, trimmed, Number.MAX_SAFE_INTEGER);
        if (next) commitLobby(next);
      } else if (seatOf(st.lobby, st.uuid)) {
        void guestSend({ kind: 'join', name: trimmed });
      }
    },

    // ----- Chat -----
    sendChat: (text) => {
      const st = get();
      const clean = text.trim().slice(0, 500);
      const conn = hostConn ?? guestConn;
      if (!clean || !conn) return;
      // Our own line arrives back through the chat listener like everyone's.
      conn.sendChat(cleanName(st.displayName) || 'Player', clean).catch((e: Error) => {
        set({ error: `Message not sent: ${e.message}` });
      });
    },

    clearError: () => set({ error: null, hostElsewhere: null }),

    reset: () => {
      teardownConnections(get().role === 'host');
      useGameStore.getState().clearGame();
      set({
        connection: 'disconnected',
        role: 'solo',
        uuid: null,
        hostUuid: null,
        lobby: null,
        chat: [],
        onlinePeers: {},
        present: [],
        roomCode: null,
        error: null,
        matchHidden: false,
        hostElsewhere: null,
        watching: false,
      });
    },
  };
});
