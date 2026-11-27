import { describe, expect, it } from 'vitest';
import type { ActionContext, GameConfig } from '@/engine/types';
import type { FishbowlAction } from './actions';
import { fishbowlModule as mod, upNext } from './module';
import type { FishbowlState } from './state';

const NAMES = ['Ana', 'Ben', 'Cai', 'Dee', 'Eli'];

function config(options: Record<string, unknown> = {}, names = NAMES): GameConfig {
  return {
    gameId: 'fishbowl',
    seats: names.map((name, index) => ({ index, uuid: null, name })),
    seed: 12345,
    now: 0,
    gameOptions: { ...mod.defaultOptions(), ...options },
    lists: {},
  };
}

let clock = 1_000;
const ctx = (by = ''): ActionContext => ({ by, now: clock });
function act(s: FishbowlState, a: FishbowlAction, by = ''): FishbowlState {
  return mod.applyAction(s, a, ctx(by));
}

const packsOnly = { words: { packs: ['animals'], listIds: [], perPlayer: 0 }, bowlSize: 12 };

/** A packs-only game advanced to the first turn's "ready" screen. */
function ready(options: Record<string, unknown> = packsOnly): FishbowlState {
  let s = mod.createInitialState(config(options));
  s = act(s, { type: 'begin' });
  s = act(s, { type: 'playRound' });
  expect(s.phase).toBe('ready');
  return s;
}

function startTurn(s: FishbowlState): FishbowlState {
  return act(s, { type: 'startTurn', bySeat: upNext(s).seat });
}

describe('setup', () => {
  it('fills the bowl from packs when players don’t write', () => {
    const s = mod.createInitialState(config(packsOnly));
    expect(s.phase).toBe('teams');
    expect(s.slips).toHaveLength(12);
    expect(new Set(s.slips.map((x) => x.text)).size).toBe(12);
    expect(s.teams.count).toBe(2);
  });

  it('starts with a writing phase, then keeps every player slip and tops up from packs', () => {
    let s = mod.createInitialState(
      config({ words: { packs: ['food'], listIds: [], perPlayer: 2 }, bowlSize: 14 }),
    );
    expect(s.phase).toBe('collect');
    NAMES.forEach((_, i) => {
      s = act(s, { type: 'collect.submit', bySeat: i, entries: [`Secret ${i}a`, `Secret ${i}b`] });
    });
    expect(s.phase).toBe('teams');
    expect(s.slips).toHaveLength(14);
    expect(s.slips.slice(0, 10).every((x) => x.text.startsWith('Secret') && x.author !== null)).toBe(true);
    expect(s.slips.slice(10).every((x) => x.author === null)).toBe(true);
  });

  it('uses only player slips when no pack is chosen, and the host can stop waiting', () => {
    let s = mod.createInitialState(config({ words: { packs: [], listIds: [], perPlayer: 3 } }));
    s = act(s, { type: 'collect.submit', bySeat: 0, entries: ['a', 'b', 'c'] });
    expect(() => act(s, { type: 'collect.close', bySeat: 0 } as never)).toThrow(/host/);
    s = act(s, { type: 'collect.close' });
    expect(s.phase).toBe('teams');
    expect(s.slips.map((x) => x.text)).toEqual(['a', 'b', 'c']);
  });

  it('resolves host lists and refuses impossible setups', () => {
    const s = mod.createInitialState({
      ...config({ words: { packs: [], listIds: ['L'], perPlayer: 0 }, bowlSize: 10 }),
      lists: { L: Array.from({ length: 30 }, (_, i) => `Inside joke ${i}`) },
    });
    expect(s.slips).toHaveLength(10);
    expect(() => mod.createInitialState(config(packsOnly, ['a', 'b', 'c']))).toThrow();
    expect(() => mod.createInitialState(config({ ...packsOnly, teamCount: 3 }))).toThrow(/6 players/);
    expect(mod.optionsProblem!({ words: { packs: [], listIds: [], perPlayer: 0 } }, 6)).toMatch(/slips come from/);
  });
});

describe('teams', () => {
  it('lets players switch and only the host shuffle or begin', () => {
    let s = mod.createInitialState(config(packsOnly));
    const before = s.teams.of[0]!;
    s = act(s, { type: 'teams.join', bySeat: 0, team: 1 - before });
    expect(s.teams.of[0]).toBe(1 - before);
    expect(() => act(s, { type: 'begin', bySeat: 0 } as never)).toThrow();
    s = act(s, { type: 'teams.shuffle' });
    s = act(s, { type: 'begin' });
    expect(s.phase).toBe('intro');
  });

  it('refuses to begin with a lopsided split', () => {
    let s = mod.createInitialState(config(packsOnly, ['a', 'b', 'c', 'd']));
    for (let i = 0; i < 4; i++) s = act(s, { type: 'teams.move', seat: i, team: 0 });
    expect(() => act(s, { type: 'begin' })).toThrow(/at least 2/);
  });
});

describe('turns', () => {
  it('only the clue-giver starts and scores, and only the slip in hand', () => {
    let s = ready();
    const giver = upNext(s).seat;
    const other = (giver + 1) % NAMES.length;
    expect(() => act(s, { type: 'startTurn', bySeat: other })).toThrow(/not your turn/);
    s = startTurn(s);
    expect(s.phase).toBe('turn');
    const slip = s.current!;
    expect(() => act(s, { type: 'gotIt', bySeat: other, slip })).toThrow(/clue-giver/);
    expect(() => act(s, { type: 'gotIt', bySeat: giver, slip: slip + 999 })).toThrow(/no longer/);
    s = act(s, { type: 'gotIt', bySeat: giver, slip });
    expect(s.scores[0]![upNext(s).team]).toBe(1);
    expect(s.bowl).not.toContain(slip);
    // A double-tap of the same slip is refused.
    expect(() => act(s, { type: 'gotIt', bySeat: giver, slip })).toThrow();
  });

  it('skips put the slip back (not on top) and respect the skip rule', () => {
    let s = startTurn(ready());
    const giver = upNext(s).seat;
    const slip = s.current!;
    s = act(s, { type: 'skip', bySeat: giver, slip });
    expect(s.current).not.toBe(slip);
    expect(s.bowl).toContain(slip);
    let one = startTurn(ready({ ...packsOnly, skipRule: 'one' }));
    const g = upNext(one).seat;
    one = act(one, { type: 'skip', bySeat: g, slip: one.current! });
    expect(() => act(one, { type: 'skip', bySeat: g, slip: one.current! })).toThrow(/No skips/);
    const none = startTurn(ready({ ...packsOnly, skipRule: 'none' }));
    expect(() => act(none, { type: 'skip', bySeat: upNext(none).seat, slip: none.current! })).toThrow(/No skips/);
  });

  it('undo returns the last slip to the bowl and the point', () => {
    let s = startTurn(ready());
    const giver = upNext(s).seat;
    const first = s.current!;
    s = act(s, { type: 'gotIt', bySeat: giver, slip: first });
    const inHand = s.current!;
    s = act(s, { type: 'undo', bySeat: giver, slip: first });
    expect(s.scores[0]![upNext(s).team]).toBe(0);
    expect(s.current).toBe(inHand);
    expect(s.bowl).toContain(first);
  });

  it('the scheduler ends the turn at the buzzer; stale or early timers are refused', () => {
    let s = startTurn(ready());
    const sched = mod.nextScheduled!(s)!;
    expect(sched.at).toBe(clock + 60_000);
    expect(sched.action).toEqual({ type: 'timeUp', turn: 0 });
    expect(() => act(s, sched.action)).toThrow(/not up/);
    expect(() => act(s, { type: 'timeUp', turn: 5 })).toThrow(/Stale/);
    const firstTeam = upNext(s).team;
    s = mod.applyAction(s, sched.action, { by: 'host:scheduler', now: sched.at });
    expect(s.phase).toBe('ready');
    expect(s.turnNo).toBe(1);
    expect(upNext(s).team).not.toBe(firstTeam);
    expect(mod.nextScheduled!(s)).toBeNull();
  });

  it('a late "got it" within the grace window counts; after it, it does not', () => {
    const s = startTurn(ready());
    const giver = upNext(s).seat;
    const end = s.timer!.endsAt!;
    expect(() => mod.applyAction(s, { type: 'gotIt', bySeat: giver, slip: s.current! }, { by: '', now: end + 1000 })).not.toThrow();
    expect(() => mod.applyAction(s, { type: 'gotIt', bySeat: giver, slip: s.current! }, { by: '', now: end + 5000 })).toThrow(
      /Time/,
    );
  });

  it('pausing freezes the clock and the schedule', () => {
    let s = startTurn(ready());
    s = mod.applyAction(s, { type: 'pause' }, { by: '', now: clock + 10_000 });
    expect(mod.nextScheduled!(s)).toBeNull();
    s = mod.applyAction(s, { type: 'resume' }, { by: '', now: clock + 500_000 });
    expect(mod.nextScheduled!(s)!.at).toBe(clock + 500_000 + 50_000);
  });
});

describe('rounds', () => {
  function emptyBowl(s: FishbowlState, now = clock): FishbowlState {
    const giver = upNext(s).seat;
    while (s.phase === 'turn') s = mod.applyAction(s, { type: 'gotIt', bySeat: giver, slip: s.current! }, { by: '', now });
    return s;
  }

  it('an empty bowl starts the next round with the same slips and carries the time over', () => {
    let s = startTurn(ready());
    const giver = upNext(s).seat;
    s = emptyBowl(s, clock + 20_000);
    expect(s.phase).toBe('intro');
    expect(s.roundIndex).toBe(1);
    expect(s.bowl).toHaveLength(12);
    expect(s.carryMs).toBe(40_000);
    s = act(s, { type: 'playRound' });
    expect(upNext(s).seat).toBe(giver);
    s = mod.applyAction(s, { type: 'startTurn', bySeat: giver }, { by: '', now: 0 });
    expect(s.timer!.durationMs).toBe(40_000);
  });

  it('without carry-over the next team goes', () => {
    let s = startTurn(ready({ ...packsOnly, carryOver: false }));
    const team = upNext(s).team;
    s = act(emptyBowl(s), { type: 'playRound' });
    expect(upNext(s).team).not.toBe(team);
    expect(s.carryMs).toBeNull();
  });

  it('ends after the last round with every slip scored per round', () => {
    let s = startTurn(ready({ ...packsOnly, rounds: ['describe', 'charades'] }));
    s = emptyBowl(s);
    s = act(s, { type: 'playRound' });
    s = emptyBowl(startTurn(s));
    expect(s.phase).toBe('gameOver');
    expect(mod.isFinished(s)).toBe(true);
    expect(s.scores.map((r) => r.reduce((a, b) => a + b, 0))).toEqual([12, 12]);
  });
});

describe('hidden information', () => {
  it('only the clue-giver sees the slip in hand; nobody sees the bowl', () => {
    const s = startTurn(ready());
    const giver = upNext(s).seat;
    const inHand = s.slips[s.current!]!.text;
    const bowlTexts = s.bowl.map((id) => s.slips[id]!.text);
    expect(mod.viewFor(s, giver).yourSlip?.text).toBe(inHand);
    for (const seat of [null, ...NAMES.map((_, i) => i).filter((i) => i !== giver)]) {
      const v = mod.viewFor(s, seat);
      expect(v.yourSlip).toBeNull();
      const json = JSON.stringify(v);
      for (const t of bowlTexts) expect(json).not.toContain(t);
    }
  });

  it('redacted views are identical whichever slip is in hand', () => {
    const a = startTurn(ready());
    const b: FishbowlState = { ...a, current: a.bowl[1]!, bowl: [a.bowl[1]!, a.bowl[0]!, ...a.bowl.slice(2)] };
    const giver = upNext(a).seat;
    for (const seat of [null, (giver + 1) % NAMES.length]) {
      expect(JSON.stringify(mod.viewFor(a, seat))).toBe(JSON.stringify(mod.viewFor(b, seat)));
    }
  });

  it('player-written slips stay private until the final screen', () => {
    let s = mod.createInitialState(config({ words: { packs: [], listIds: [], perPlayer: 1 } }));
    s = act(s, { type: 'collect.submit', bySeat: 0, entries: ['Uncle Steve’s boat'] });
    for (const seat of [null, 1, 2]) expect(JSON.stringify(mod.viewFor(s, seat))).not.toContain('Steve');
    expect(mod.viewFor(s, 0).collect?.yours).toEqual(['Uncle Steve’s boat']);
    for (let i = 1; i < NAMES.length; i++) s = act(s, { type: 'collect.submit', bySeat: i, entries: [`x${i}`] });
    s = act(s, { type: 'begin' });
    for (const seat of [null, 0, 1]) expect(JSON.stringify(mod.viewFor(s, seat))).not.toContain('Steve');
    s = act(s, { type: 'finish' });
    const results = mod.viewFor(s, null).results!;
    expect(results.slips.find((x) => x.text.includes('Steve'))?.author).toBe('Ana');
  });

  it('never exposes the rng or the top-up pool', () => {
    const s = startTurn(ready());
    const json = JSON.stringify(mod.viewFor(s, null));
    expect(json).not.toContain('"rng"');
    expect(json).not.toContain('topUp');
  });
});
