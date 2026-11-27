import { describe, expect, it } from 'vitest';
import type { GameModule, SeatIndex } from '@/engine/types';
import type { LobbyState } from '@/net/types';
import {
  applyJoin,
  applyLeave,
  buildViews,
  moveSeat,
  removeSeat,
  stampChangedViews,
  uniqueName,
  vetInboundAction,
  type LedgerEntry,
} from './hostLogic';

// A minimal game with one secret per seat, to test the host plumbing
// independently of any real game's rules.
const secretModule: GameModule<{ secrets: number[] }, { yourSecret: number | null; n: number }, { type: 'poke'; bySeat: SeatIndex }> = {
  id: 'fishbowl',
  displayName: 'Secrets',
  minPlayers: 2,
  maxPlayers: 6,
  createInitialState: (c) => ({ secrets: c.seats.map((_, i) => 1000 + i) }),
  applyAction: (s) => s,
  viewFor: (s, seat) => ({ yourSecret: seat === null ? null : s.secrets[seat]!, n: s.secrets.length }),
  isFinished: () => false,
  defaultOptions: () => ({}),
};

function lobby(over: Partial<LobbyState> = {}): LobbyState {
  return {
    gameId: 'fishbowl',
    seats: [
      { index: 0, uuid: 'host', name: 'Hana' },
      { index: 1, uuid: 'g1', name: 'Gus' },
    ],
    gameOptions: {},
    inGame: false,
    match: 0,
    ...over,
  };
}

describe('open-table seating', () => {
  it('appends joiners with a unique name, and renames in place', () => {
    const l = applyJoin(lobby(), 'g2', 'gus', 8)!;
    expect(l.seats[2]).toEqual({ index: 2, uuid: 'g2', name: 'gus 2' });
    expect(applyJoin(l, 'g2', '  Zoë  ', 8)!.seats[2]!.name).toBe('Zoë');
    expect(applyJoin(lobby(), 'g1', 'Gus', 8)).toBeNull(); // nothing changed
    expect(applyJoin(lobby(), 'g9', '', 8)!.seats[2]!.name).toBe('Player');
  });

  it('refuses joins when full or mid-match, but allows renames mid-match', () => {
    expect(applyJoin(lobby(), 'g2', 'Ivy', 2)).toBeNull();
    expect(applyJoin(lobby({ inGame: true }), 'g2', 'Ivy', 8)).toBeNull();
    expect(applyJoin(lobby({ inGame: true }), 'g1', 'Gustav', 8)!.seats[1]!.name).toBe('Gustav');
  });

  it('leaving and removal re-index; the host is never removed; nothing moves mid-match', () => {
    const three = applyJoin(lobby(), 'g2', 'Ivy', 8)!;
    const left = applyLeave(three, 'g1')!;
    expect(left.seats.map((s) => [s.index, s.uuid])).toEqual([
      [0, 'host'],
      [1, 'g2'],
    ]);
    expect(applyLeave(lobby({ inGame: true }), 'g1')).toBeNull();
    expect(applyLeave(lobby(), 'stranger')).toBeNull();
    expect(removeSeat(three, 0, 'host')).toBeNull();
    expect(removeSeat(three, 1, 'host')!.seats.map((s) => s.uuid)).toEqual(['host', 'g2']);
    expect(moveSeat(three, 2, -1)!.seats.map((s) => s.uuid)).toEqual(['host', 'g2', 'g1']);
    expect(moveSeat(three, 0, -1)).toBeNull();
  });

  it('uniqueName ignores your own seat', () => {
    expect(uniqueName(lobby().seats, 'g1', 'Gus')).toBe('Gus');
    expect(uniqueName(lobby().seats, 'x', 'HANA')).toBe('HANA 2');
  });
});

describe('vetInboundAction', () => {
  const inGame = lobby({ inGame: true });
  it('accepts only actions for the sender’s own seat', () => {
    expect(vetInboundAction(inGame, 'g1', { type: 'poke', bySeat: 1 })).toEqual({ ok: true, seat: 1 });
    expect(vetInboundAction(inGame, 'g1', { type: 'poke', bySeat: 0 }).ok).toBe(false);
  });
  it('refuses seatless (host-only) actions, strangers, junk and out-of-match actions', () => {
    expect(vetInboundAction(inGame, 'g1', { type: 'timeUp' }).ok).toBe(false);
    expect(vetInboundAction(inGame, 'nobody', { type: 'poke', bySeat: 1 }).ok).toBe(false);
    expect(vetInboundAction(inGame, 'g1', 'poke').ok).toBe(false);
    expect(vetInboundAction(inGame, 'g1', { bySeat: 1 }).ok).toBe(false);
    expect(vetInboundAction(lobby(), 'g1', { type: 'poke', bySeat: 1 }).ok).toBe(false);
  });
});

describe('view fan-out', () => {
  const state = secretModule.createInitialState({
    gameId: 'fishbowl',
    seats: lobby().seats,
    seed: 1,
    now: 0,
    gameOptions: {},
    lists: {},
  });

  it('gives each seat only its own secret, spectators none, and skips the host', () => {
    const views = buildViews(secretModule, state, lobby({ match: 3 }), ['host', 'g1', 'tv'], 7, 'host');
    expect(Object.keys(views).sort()).toEqual(['g1', 'tv']);
    expect(views.g1!.env.view).toEqual({ yourSecret: 1001, n: 2 });
    expect(views.tv!.env.seat).toBeNull();
    expect(views.tv!.env.view.yourSecret).toBeNull();
    expect(views.g1!.match).toBe(3);
  });

  it('only re-sends changed views, with a per-device sequence', () => {
    const ledger = new Map<string, LedgerEntry>();
    const first = stampChangedViews(ledger, buildViews(secretModule, state, lobby(), ['g1', 'tv'], 1, 'host'));
    expect(Object.keys(first)).toHaveLength(2);
    expect(first.g1!.env.tick).toBe(0);
    const again = stampChangedViews(ledger, buildViews(secretModule, state, lobby(), ['g1', 'tv'], 2, 'host'));
    expect(again).toEqual({});
    const changed = { secrets: [1000, 4242] };
    const third = stampChangedViews(ledger, buildViews(secretModule, changed, lobby(), ['g1', 'tv'], 3, 'host'));
    expect(Object.keys(third)).toEqual(['g1']);
    expect(third.g1!.env.tick).toBe(1);
  });
});

describe('isStaleView', async () => {
  const { isStaleView } = await import('./hostLogic');
  const rec = (tick: number, session?: string, match = 1) => ({
    match,
    session,
    env: { gameId: 'fishbowl' as const, tick, view: {}, seat: 0 },
  });
  const applied = { match: 1, session: 'A', gameId: 'fishbowl', tick: 7 };

  it('ignores lower ticks within the same match and host session', () => {
    expect(isStaleView(applied, rec(6, 'A'))).toBe(true);
    expect(isStaleView(applied, rec(8, 'A'))).toBe(false);
  });

  it('accepts anything from a new host session (host reloaded) or a new match', () => {
    expect(isStaleView(applied, rec(2, 'B'))).toBe(false);
    expect(isStaleView(applied, rec(0, 'A', 2))).toBe(false);
    expect(isStaleView(null, rec(0, 'A'))).toBe(false);
  });
});
