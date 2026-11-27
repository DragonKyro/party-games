import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeServer, fakeTransport } from '@/net/fakeTransport';
import type { RoomTransport } from '@/net/transport';
import { saveList, resetListCacheForTests } from '@/words/library';
import { useBoardStore } from './boardStore';
import { setClockForTests } from './clock';
import { useGameStore } from './gameStore';
import { setTransportForTests, useNetworkStore } from './networkStore';

// End-to-end online flow over the in-memory transport. One process plays
// every device by swapping which transport the store talks to: the host's
// store is the real one; guests are driven at the transport level so we can
// assert exactly what each device receives.

let server: FakeServer;
let now = 1_000_000;

async function flush() {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

function guest(uid: string, name: string) {
  const t: RoomTransport = fakeTransport(server, uid);
  const views: unknown[] = [];
  const lobbies: unknown[] = [];
  const board: string[] = [];
  return {
    t,
    views,
    lobbies,
    board,
    join: async (code: string) => {
      const meta = (await t.lookupRoom(code))!;
      return t.joinAsGuest(code, meta, { uid, name }, {
        presence: () => {},
        chat: () => {},
        connected: () => {},
        clock: () => {},
        board: () => {},
        boardOps: (_id, p) => board.push(p),
        lobby: (l) => lobbies.push(l),
        view: (v) => views.push(v),
      });
    },
  };
}

beforeEach(() => {
  server = new FakeServer();
  setTransportForTests(fakeTransport(server, 'host-uid'));
  setClockForTests(() => now);
  useNetworkStore.getState().reset();
  useNetworkStore.setState({ displayName: 'Hana' });
  window.localStorage.clear();
  resetListCacheForTests();
});

afterEach(() => {
  useNetworkStore.getState().reset();
  setTransportForTests(null);
  setClockForTests(null);
  vi.useRealTimers();
});

const fishbowlOpts = {
  words: { packs: ['animals'], listIds: [], perPlayer: 0 },
  bowlSize: 12,
  rounds: ['describe'],
  turnSeconds: 30,
  teamCount: 2,
  skipRule: 'free',
  carryOver: true,
};

async function hostWithPlayers(n: number) {
  await useNetworkStore.getState().hostRoom('fishbowl', fishbowlOpts);
  const code = useNetworkStore.getState().roomCode!;
  const guests = [];
  for (let i = 1; i < n; i++) {
    const g = guest(`g${i}`, `Guest ${i}`);
    const conn = await g.join(code);
    await conn.send({ kind: 'join', name: `Guest ${i}` });
    guests.push({ ...g, conn });
  }
  await flush();
  return { code, guests };
}

describe('online room', () => {
  it('seats joiners automatically and keeps the lobby free of secrets', async () => {
    const { code, guests } = await hostWithPlayers(4);
    const lobby = useNetworkStore.getState().lobby!;
    expect(lobby.seats.map((s) => s.name)).toEqual(['Hana', 'Guest 1', 'Guest 2', 'Guest 3']);
    const raw = server.rooms.get(code)!.lobby;
    expect(raw).not.toContain('seed');
    expect(guests[0]!.lobbies.length).toBeGreaterThan(0);
  });

  it('starts a match, sends each device only its own view, and vets actions', async () => {
    const { code, guests } = await hostWithPlayers(4);
    useNetworkStore.getState().startGame();
    await flush();
    expect(useNetworkStore.getState().lobby!.inGame).toBe(true);
    // Everyone got a view addressed to their own seat.
    guests.forEach((g, i) => {
      const last = g.views[g.views.length - 1] as { env: { seat: number } };
      expect(last.env.seat).toBe(i + 1);
    });
    // The host's private state never reaches a guest's view record.
    const json = server.rawView(code, 'g1')!;
    expect(json).not.toContain('"rng"');
    expect(json).not.toContain('topUp');
    // A guest can't send a host-only control…
    const before = useGameStore.getState().tick;
    await guests[0]!.conn.send({ kind: 'action', action: { type: 'begin' } });
    await guests[0]!.conn.send({ kind: 'action', action: { type: 'teams.join', bySeat: 2, team: 0 } });
    await flush();
    expect(useGameStore.getState().tick).toBe(before);
    // …but can act as themselves.
    const team = (useGameStore.getState().privateState as { teams: { of: number[] } }).teams.of[1]!;
    await guests[0]!.conn.send({ kind: 'action', action: { type: 'teams.join', bySeat: 1, team: 1 - team } });
    await flush();
    expect((useGameStore.getState().privateState as { teams: { of: number[] } }).teams.of[1]).toBe(1 - team);
  });

  it('keeps the host’s saved lists out of the lobby and resolves them at start', async () => {
    saveList({ id: 'Lsecret', name: 'Inside jokes', kind: 'words', entries: Array.from({ length: 20 }, (_, i) => `Joke ${i}`), updatedAt: 1 });
    await useNetworkStore.getState().hostRoom('fishbowl', {
      ...fishbowlOpts,
      words: { packs: [], listIds: ['Lsecret'], perPlayer: 0 },
    });
    const code = useNetworkStore.getState().roomCode!;
    const g = guest('g1', 'Gus');
    const conn = await g.join(code);
    for (const uid of ['g2', 'g3']) {
      const other = guest(uid, uid);
      await (await other.join(code)).send({ kind: 'join', name: uid });
    }
    await conn.send({ kind: 'join', name: 'Gus' });
    await flush();
    expect(server.rooms.get(code)!.lobby).not.toContain('Joke');
    useNetworkStore.getState().startGame();
    await flush();
    const slips = (useGameStore.getState().privateState as { slips: Array<{ text: string }> }).slips;
    expect(slips.every((s) => s.text.startsWith('Joke'))).toBe(true);
    expect(server.rawView(code, 'g1')).not.toContain('Joke');
  });

  it('the scheduler ends a timed turn on the host and everyone gets the new view', async () => {
    vi.useFakeTimers();
    const { guests } = await hostWithPlayers(4);
    useNetworkStore.getState().startGame();
    const gs = useGameStore.getState();
    gs.dispatch({ type: 'begin' });
    gs.dispatch({ type: 'playRound' });
    gs.dispatch({ type: 'startTurn' });
    expect((useGameStore.getState().publicView!.view as { phase: string }).phase).toBe('turn');
    now += 30_000;
    vi.advanceTimersByTime(30_000);
    await flush();
    expect((useGameStore.getState().publicView!.view as { phase: string }).phase).toBe('ready');
    const last = guests[1]!.views[guests[1]!.views.length - 1] as { env: { view: { phase: string } } };
    expect(last.env.view.phase).toBe('ready');
  });

  it('saves the host state (debounced) so a reload can resume', async () => {
    vi.useFakeTimers();
    const { code } = await hostWithPlayers(4);
    useNetworkStore.getState().startGame();
    expect(server.rawHost(code)).toBeFalsy();
    vi.advanceTimersByTime(1000);
    await flush();
    expect(server.rawHost(code)).toContain('"gameId":"fishbowl"');
  });

  it('grants the live board only to the designated drawer', async () => {
    const { code, guests } = await hostWithPlayers(4);
    // Fake a module with a live board for seat 2.
    const hostConnBoard = () => server.boardOf(code);
    const gsMod = useGameStore.getState();
    useNetworkStore.getState().startGame();
    await flush();
    expect(useNetworkStore.getState().error).toBeNull();
    const mod = useGameStore.getState().module!;
    const patched = { ...mod, liveBoard: () => ({ id: 'turn-1', drawerSeat: 2 }) };
    useGameStore.setState({ module: patched });
    gsMod.dispatch({ type: 'teams.shuffle' });
    await flush();
    expect(hostConnBoard()?.meta).toEqual({ id: 'turn-1', owner: 'g2' });
    await expect(guests[0]!.conn.pushBoard('turn-1', '[]')).rejects.toThrow(/permission/);
    await guests[1]!.conn.pushBoard('turn-1', JSON.stringify([{ o: 'a1', k: 'x' }]));
    expect(guests[0]!.board).toHaveLength(1);
    // The host's own board store follows along.
    expect(useBoardStore.getState().boardId).toBe('turn-1');
  });

  it('ending the match returns everyone to the lobby and clears views', async () => {
    const { code, guests } = await hostWithPlayers(4);
    useNetworkStore.getState().startGame();
    await flush();
    useNetworkStore.getState().endMatch();
    await flush();
    expect(useNetworkStore.getState().lobby!.inGame).toBe(false);
    expect(server.rawView(code, 'g1')).toBeUndefined();
    expect(guests[0]!.views[guests[0]!.views.length - 1]).toBeNull();
    expect(useGameStore.getState().publicView).toBeNull();
  });

  // --- regressions from the infrastructure review -------------------------

  /** Simulate the host's page reloading: drop the connection without closing the room. */
  async function reloadHost(code: string, opts: { takeover?: boolean } = {}) {
    useNetworkStore.setState({ role: 'solo' });
    await useNetworkStore.getState().joinRoom(code, opts);
    await flush();
  }

  it('a host reload resumes the match and re-sends views under a new host session', async () => {
    vi.useFakeTimers();
    const { code, guests } = await hostWithPlayers(4);
    useNetworkStore.getState().startGame();
    vi.advanceTimersByTime(1000);
    await flush();
    const before = guests[0]!.views[guests[0]!.views.length - 1] as { session: string; env: { tick: number } };
    await reloadHost(code);
    expect(useNetworkStore.getState().role).toBe('host');
    expect(useNetworkStore.getState().connection).toBe('in-game');
    expect(server.rooms.has(code)).toBe(true);
    // A guest can resend; it gets its view again under the new session.
    const g = guests[0]!;
    await g.conn.send({ kind: 'action', action: { type: 'teams.join', bySeat: 1, team: 0 }, match: 1 });
    await flush();
    const after = g.views[g.views.length - 1] as { session: string };
    expect(after.session).toBeTruthy();
    expect(after.session).not.toBe(before.session);
  });

  it('a host reload keeps the live board instead of wiping its strokes', async () => {
    vi.useFakeTimers();
    const { code, guests } = await hostWithPlayers(4);
    useNetworkStore.getState().startGame();
    const mod = useGameStore.getState().module!;
    const withBoard = { ...mod, liveBoard: () => ({ id: 'turn-1', drawerSeat: 2 }) };
    useGameStore.setState({ module: withBoard });
    useGameStore.getState().dispatch({ type: 'teams.shuffle' });
    await guests[1]!.conn.pushBoard('turn-1', JSON.stringify([{ o: 'a1', k: 'x' }]));
    vi.advanceTimersByTime(1000);
    await flush();
    expect(server.boardOf(code)!.ops).toHaveLength(1);
    // The reloaded host's registry module has no liveBoard in this test, so patch the registry copy.
    const { GAMES } = await import('@/engine/registry');
    const original = GAMES.fishbowl;
    GAMES.fishbowl = withBoard;
    try {
      await reloadHost(code);
      useGameStore.getState().dispatch({ type: 'teams.shuffle' });
      await flush();
      expect(server.boardOf(code)!.ops).toHaveLength(1);
    } finally {
      GAMES.fishbowl = original;
    }
  });

  it('a saved game that can’t be restored ends the match but keeps the room', async () => {
    vi.useFakeTimers();
    const { code } = await hostWithPlayers(4);
    useNetworkStore.getState().startGame();
    vi.advanceTimersByTime(1000);
    await flush();
    const room = server.rooms.get(code)!;
    room.host = JSON.stringify({ ...JSON.parse(room.host!), state: { garbage: true } });
    await reloadHost(code);
    expect(server.rooms.has(code)).toBe(true);
    expect(useNetworkStore.getState().lobby!.inGame).toBe(false);
    expect(useNetworkStore.getState().connection).toBe('lobby');
    expect(useNetworkStore.getState().error).toMatch(/couldn’t be resumed/);
  });

  it('won’t open a second host for a room this browser is hosting in another tab', async () => {
    vi.useFakeTimers();
    const { code } = await hostWithPlayers(4);
    // Another tab of the same browser = the same uid, still connected.
    const otherTab = guest('host-uid', 'Hana');
    await otherTab.join(code);
    useNetworkStore.setState({ role: 'solo' });
    const joining = useNetworkStore.getState().joinRoom(code);
    await vi.advanceTimersByTimeAsync(3000);
    await joining;
    expect(useNetworkStore.getState().hostElsewhere).toBe(code);
    expect(useNetworkStore.getState().role).toBe('solo');
    // Taking over explicitly still works.
    await reloadHost(code, { takeover: true });
    expect(useNetworkStore.getState().role).toBe('host');
  });

  it('a spectator that reconnects gets the view it missed', async () => {
    const { code } = await hostWithPlayers(4);
    useNetworkStore.getState().startGame();
    await flush();
    const tv = guest('tv-1', 'TV');
    const conn = await tv.join(code);
    await flush();
    conn.close();
    useGameStore.getState().dispatch({ type: 'begin' });
    await flush();
    const again = guest('tv-1', 'TV');
    await again.join(code);
    await flush();
    const last = again.views[again.views.length - 1] as { env: { view: { phase: string } } };
    expect(last.env.view.phase).toBe('intro');
  });

  it('refuses actions sent for an earlier match', async () => {
    const { guests } = await hostWithPlayers(4);
    useNetworkStore.getState().startGame();
    await flush();
    const team = (useGameStore.getState().privateState as { teams: { of: number[] } }).teams.of[1]!;
    await guests[0]!.conn.send({ kind: 'action', action: { type: 'teams.join', bySeat: 1, team: 1 - team }, match: 0 });
    await flush();
    expect((useGameStore.getState().privateState as { teams: { of: number[] } }).teams.of[1]).toBe(team);
  });
});
