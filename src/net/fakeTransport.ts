// In-memory RoomTransport for tests: one `FakeServer` stands in for the
// database, and each `fakeTransport(server, uid)` is a device. It mirrors the
// access rules that matter for hidden information:
//   - a device only ever receives `views/{its own uid}`;
//   - only the host receives inbox messages, stamped with the sender's uid;
//   - only the host can read the saved host state;
//   - only the board's owner (or the host) can append board ops.
// Delivery is synchronous, which keeps tests deterministic.

import type { GuestConnection, GuestEvents, HostConnection, HostEvents, RoomTransport } from './transport';
import type {
  BoardMeta,
  ChatMessage,
  InboxMessage,
  LobbyState,
  Presence,
  RoomMeta,
  SavedHostState,
  ViewRecord,
} from './types';

interface FakeRoom {
  meta: RoomMeta;
  lobby: string;
  views: Map<string, string>;
  host: string | null;
  chat: ChatMessage[];
  presence: Presence[];
  board: { meta: BoardMeta; ops: Array<{ p: string; u: string }> } | null;
  hostEvents: HostEvents | null;
  guests: Map<string, GuestEvents>;
}

export class FakeServer {
  readonly rooms = new Map<string, FakeRoom>();
  private chatSeq = 0;
  /** Server clock − local clock reported to every device. */
  clockOffset = 0;

  /** What the server stores at views/{uid} (for assertions). */
  rawView(code: string, uid: string): string | undefined {
    return this.rooms.get(code)?.views.get(uid);
  }

  rawHost(code: string): string | null | undefined {
    return this.rooms.get(code)?.host;
  }

  boardOf(code: string): FakeRoom['board'] | undefined {
    return this.rooms.get(code)?.board;
  }

  nextChatId(): string {
    return `c${++this.chatSeq}`;
  }

  everyone(room: FakeRoom): Array<HostEvents | GuestEvents> {
    return [...(room.hostEvents ? [room.hostEvents] : []), ...room.guests.values()];
  }

  broadcastPresence(room: FakeRoom): void {
    const people = room.presence.slice();
    for (const e of this.everyone(room)) e.presence(people);
  }
}

export function fakeTransport(server: FakeServer, uid: string): RoomTransport {
  function joinCommon(room: FakeRoom, me: Presence, events: HostEvents | GuestEvents) {
    events.clock(server.clockOffset);
    if (room.board) {
      events.board(room.board.meta);
      for (const op of room.board.ops) events.boardOps(room.board.meta.id, op.p, op.u);
    }
    room.presence.push({ uid, name: me.name });
    server.broadcastPresence(room);
  }

  function leaveCommon(room: FakeRoom) {
    const i = room.presence.findIndex((p) => p.uid === uid);
    if (i >= 0) room.presence.splice(i, 1);
    server.broadcastPresence(room);
  }

  function common(code: string, room: FakeRoom) {
    return {
      code,
      uid,
      meta: room.meta,
      sendChat: async (name: string, text: string) => {
        const msg: ChatMessage = {
          id: server.nextChatId(),
          senderUuid: uid,
          senderName: name,
          text,
          timestamp: Date.now(),
          kind: 'user',
        };
        if (!server.rooms.has(code)) return;
        room.chat.push(msg);
        for (const e of server.everyone(room)) e.chat(msg);
      },
      pushBoard: async (boardId: string, payload: string) => {
        const b = room.board;
        // Rules: only the owner (or the host) may write, and only to the current board.
        if (!b || b.meta.id !== boardId || (b.meta.owner !== uid && room.meta.hostUid !== uid)) {
          throw new Error('permission denied');
        }
        b.ops.push({ p: payload, u: uid });
        for (const e of server.everyone(room)) e.boardOps(boardId, payload, uid);
      },
    };
  }

  function hostConn(code: string, room: FakeRoom, events: HostEvents): HostConnection {
    room.hostEvents = events;
    for (const m of room.chat) events.chat(m);
    let closed = false;
    return {
      ...common(code, room),
      setLobby: async (lobby: LobbyState) => {
        room.lobby = JSON.stringify(lobby);
        for (const g of room.guests.values()) g.lobby(JSON.parse(room.lobby) as LobbyState);
      },
      publish: async (views: Record<string, ViewRecord>) => {
        for (const [to, rec] of Object.entries(views)) {
          const json = JSON.stringify(rec);
          room.views.set(to, json);
          // Rules: only `to` can read views/{to}.
          room.guests.get(to)?.view(JSON.parse(json) as ViewRecord);
        }
      },
      save: async (saved: SavedHostState | null) => {
        room.host = saved ? JSON.stringify(saved) : null;
      },
      setBoard: async (meta: BoardMeta | null) => {
        room.board = meta ? { meta: { ...meta }, ops: [] } : null;
        for (const e of server.everyone(room)) e.board(meta ? { ...meta } : null);
      },
      clearMatch: async () => {
        room.views.clear();
        room.host = null;
        if (room.board) {
          room.board = null;
          for (const e of server.everyone(room)) e.board(null);
        }
        for (const g of room.guests.values()) g.view(null);
      },
      close: ({ deleteRoom }) => {
        if (closed) return;
        closed = true;
        room.hostEvents = null;
        leaveCommon(room);
        if (deleteRoom) {
          server.rooms.delete(code);
          for (const g of room.guests.values()) g.lobby(null);
        }
      },
    };
  }

  return {
    signIn: async () => uid,
    warmUp: () => {},

    createRoom: async (code, lobby, me, events) => {
      if (server.rooms.has(code)) return null;
      const room: FakeRoom = {
        meta: { hostUid: uid, createdAt: Date.now(), build: 'fake' },
        lobby: JSON.stringify(lobby),
        views: new Map(),
        host: null,
        chat: [],
        presence: [],
        board: null,
        hostEvents: null,
        guests: new Map(),
      };
      server.rooms.set(code, room);
      const conn = hostConn(code, room, events);
      joinCommon(room, me, events);
      return conn;
    },

    lookupRoom: async (code) => server.rooms.get(code)?.meta ?? null,

    lookupPresence: async (code) => (server.rooms.get(code)?.presence ?? []).map((p) => p.uid),

    resumeHost: async (code, _meta, me, events) => {
      const room = server.rooms.get(code);
      if (!room || room.meta.hostUid !== uid) throw new Error('permission denied');
      // Read before connecting, like the real transport.
      const board = room.board ? { ...room.board.meta } : null;
      const conn = hostConn(code, room, events);
      joinCommon(room, me, events);
      return {
        conn,
        lobby: JSON.parse(room.lobby) as LobbyState,
        saved: room.host ? (JSON.parse(room.host) as SavedHostState) : null,
        board,
      };
    },

    joinAsGuest: async (code, meta, me, events): Promise<GuestConnection> => {
      const room = server.rooms.get(code);
      if (!room) throw new Error('no such room');
      room.guests.set(uid, events);
      events.lobby(JSON.parse(room.lobby) as LobbyState);
      const own = room.views.get(uid);
      if (own) events.view(JSON.parse(own) as ViewRecord);
      for (const m of room.chat) events.chat(m);
      joinCommon(room, me, events);
      let closed = false;
      return {
        ...common(code, room),
        meta,
        send: async (msg: InboxMessage) => {
          // Rules stamp the sender's verified uid; only the host reads it.
          room.hostEvents?.inbox(uid, JSON.parse(JSON.stringify(msg)) as InboxMessage);
        },
        close: () => {
          if (closed) return;
          closed = true;
          room.guests.delete(uid);
          leaveCommon(room);
        },
      };
    },
  };
}
