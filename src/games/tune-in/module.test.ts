import { describe, expect, it } from 'vitest';
import type { ActionContext, GameConfig, SeatIndex } from '@/engine/types';
import { SPECTRUMS } from '@/words/prompts/spectrums';
import type { TuneInAction } from './actions';
import { GRACE_MS, tuneInModule as mod, tunerOf } from './module';
import {
  MAX_TARGET,
  MIN_TARGET,
  RATING_TIERS,
  ceilAverage,
  clueProblem,
  optionsProblem,
  pointsFor,
  ratingFor,
  readOptions,
} from './rules';
import type { TuneInState } from './state';

const NAMES = ['Ana', 'Ben', 'Cai', 'Dee', 'Eli'];

function config(options: Record<string, unknown> = {}, names = NAMES, seed = 12345): GameConfig {
  return {
    gameId: 'tune-in',
    seats: names.map((name, index) => ({ index, uuid: null, name })),
    seed,
    now: 0,
    gameOptions: { ...mod.defaultOptions(), ...options },
    lists: {},
  };
}

let clock = 1_000;
const ctx = (now = clock): ActionContext => ({ by: '', now });
function act(s: TuneInState, a: TuneInAction, now = clock): TuneInState {
  return mod.applyAction(s, a, ctx(now));
}

const team = { mode: 'team' };

function start(options: Record<string, unknown> = {}, names = NAMES, seed = 12345): TuneInState {
  const s = mod.createInitialState(config(options, names, seed));
  expect(s.phase).toBe('tune');
  return s;
}

/** Put the Tuner's clue on air (first option unless `pick`). */
function onAir(s: TuneInState, clue = 'Lukewarm tea', pick = 0, now = clock): TuneInState {
  return act(s, { type: 'tune', bySeat: tunerOf(s), turn: s.turnNo, pick, clue }, now);
}

function guessers(s: TuneInState): SeatIndex[] {
  const t = tunerOf(s);
  return s.seats.map((x) => x.index).filter((i) => i !== t);
}

const allSeats = (s: TuneInState): Array<SeatIndex | null> => [null, ...s.seats.map((x) => x.index)];
const json = (s: TuneInState, seat: SeatIndex | null) => JSON.stringify(mod.viewFor(s, seat));

// ---------------------------------------------------------------------------

describe('options', () => {
  it('reads and clamps untrusted options', () => {
    const o = readOptions({ mode: 'team', rotations: 9, rounds: 2, guessSeconds: 45, bands: [5, 4, 3, 2] });
    expect(o.mode).toBe('team');
    expect(o.rotations).toBe(3);
    expect(o.rounds).toBe(5);
    expect(o.guessSeconds).toBe(0);
    expect(o.bands).toEqual([3, 8, 14, 20]);
    expect(readOptions({ mode: 'nope', guessSeconds: 90, bands: [1, 2, 3, 50] })).toMatchObject({
      mode: 'everyone',
      guessSeconds: 90,
      bands: [1, 2, 3, 50],
    });
    expect(readOptions({ bands: [1, 2, 3, 51] }).bands).toEqual([3, 8, 14, 20]);
    expect(readOptions({ bands: [1, 2.5, 3, 4] }).bands).toEqual([3, 8, 14, 20]);
    expect(readOptions(undefined)).toEqual(mod.defaultOptions());
  });

  it('needs somewhere for the spectrums to come from', () => {
    const none = { spectrums: { builtIn: false, spicy: false, listIds: [], perPlayer: 0 } };
    expect(optionsProblem(none, 4)).toMatch(/spectrums come from/);
    expect(mod.optionsProblem!(mod.defaultOptions(), 4)).toBeNull();
    expect(() => mod.createInitialState(config(none))).toThrow(/spectrums come from/);
  });

  it('allows 2–16 players', () => {
    expect(() => mod.createInitialState(config({}, ['Solo']))).toThrow(/2–16/);
    expect(() => mod.createInitialState(config({}, Array.from({ length: 17 }, (_, i) => `P${i}`)))).toThrow(/2–16/);
    expect(start({}, ['A', 'B']).totalRounds).toBe(2);
    expect(start({}, Array.from({ length: 16 }, (_, i) => `P${i}`)).seats).toHaveLength(16);
  });
});

describe('scoring rules', () => {
  it('scores by distance with the default bands', () => {
    const bands = [3, 8, 14, 20];
    const cases: Array<[number, number]> = [
      [0, 4], [3, 4], [4, 3], [8, 3], [9, 2], [14, 2], [15, 1], [20, 1], [21, 0], [96, 0],
    ];
    for (const [d, pts] of cases) expect(pointsFor(d, bands), `distance ${d}`).toBe(pts);
  });

  it('bands are tunable', () => {
    expect(pointsFor(4, [2, 5, 9, 14])).toBe(3);
    expect(pointsFor(15, [2, 5, 9, 14])).toBe(0);
    expect(pointsFor(25, [4, 10, 17, 25])).toBe(1);
  });

  it('rounds the Tuner’s average up', () => {
    expect(ceilAverage([4, 3, 0])).toBe(3);
    expect(ceilAverage([1, 0, 0])).toBe(1);
    expect(ceilAverage([2, 2])).toBe(2);
    expect(ceilAverage([0, 0])).toBe(0);
    expect(ceilAverage([])).toBe(0);
  });

  it('rates the team by share of the maximum', () => {
    expect(ratingFor(32, 8)!.name).toBe('Telepathic');
    expect(ratingFor(0, 8)!.name).toBe('Dead Air');
    expect(ratingFor(0, 0)).toBeNull();
    // Every tier is reachable and they're in descending order.
    const seen = new Set<string>();
    for (let t = 0; t <= 40; t++) seen.add(ratingFor(t, 10)!.name);
    expect(seen.size).toBe(RATING_TIERS.length);
    for (let i = 1; i < RATING_TIERS.length; i++) expect(RATING_TIERS[i]!.min).toBeLessThan(RATING_TIERS[i - 1]!.min);
  });

  it('validates clues', () => {
    expect(clueProblem('', 'Cold', 'Hot')).toMatch(/Write/);
    expect(clueProblem('x'.repeat(41), 'Cold', 'Hot')).toMatch(/40/);
    expect(clueProblem('x'.repeat(40), 'Cold', 'Hot')).toBeNull();
    expect(clueProblem('HOT!', 'Cold', 'Hot')).toMatch(/ends/);
    expect(clueProblem(' cold ', 'Cold', 'Hot')).toMatch(/ends/);
    expect(clueProblem('Hot sauce', 'Cold', 'Hot')).toBeNull();
    expect(clueProblem('🔥🔥', 'Cold', 'Hot')).toBeNull();
  });
});

describe('setup', () => {
  it('deals the first Tuner two different spectrums and a target away from the ends', () => {
    const s = start();
    expect(s.offer).toHaveLength(2);
    expect(s.offer![0]).not.toBe(s.offer![1]);
    expect(s.target).toBeGreaterThanOrEqual(MIN_TARGET);
    expect(s.target).toBeLessThanOrEqual(MAX_TARGET);
    expect(s.cards.length).toBe(SPECTRUMS.length);
    expect(s.totalRounds).toBe(NAMES.length);
    expect(start({ rotations: 3 }).totalRounds).toBe(NAMES.length * 3);
    expect(start({ ...team, rounds: 6 }).totalRounds).toBe(6);
  });

  it('targets are integers 4–96, spread across the dial', () => {
    const targets: number[] = [];
    for (let seed = 1; seed <= 400; seed++) targets.push(start({}, NAMES, seed).target);
    expect(targets.every((t) => Number.isInteger(t) && t >= 4 && t <= 96)).toBe(true);
    expect(Math.min(...targets)).toBeLessThanOrEqual(8);
    expect(Math.max(...targets)).toBeGreaterThanOrEqual(92);
    expect(new Set(targets).size).toBeGreaterThan(70);
  });

  it('parses the host’s "Left | Right" lists and mixes in the 18+ list on request', () => {
    const s = mod.createInitialState({
      ...config({ spectrums: { builtIn: false, spicy: false, listIds: ['L'], perPlayer: 0 } }),
      lists: { L: ['Tea | Coffee', 'Monday | Friday', 'Cats|Dogs', 'broken line', 'Same | same'] },
    });
    expect(s.cards.map((c) => [c.left, c.right])).toEqual([
      ['Tea', 'Coffee'],
      ['Monday', 'Friday'],
      ['Cats', 'Dogs'],
    ]);
    const spicy = start({ spectrums: { builtIn: false, spicy: true, listIds: [], perPlayer: 0 } });
    expect(spicy.cards.length).toBeGreaterThan(10);
  });

  it('refuses a deck too small to offer a choice', () => {
    expect(() =>
      mod.createInitialState({
        ...config({ spectrums: { builtIn: false, spicy: false, listIds: ['L'], perPlayer: 0 } }),
        lists: { L: ['Tea | Coffee'] },
      }),
    ).toThrow(/Only 1 spectrum/);
  });

  it('players write spectrums first; theirs join the deck', () => {
    let s = mod.createInitialState(config({ spectrums: { builtIn: true, spicy: false, listIds: [], perPlayer: 1 } }));
    expect(s.phase).toBe('collect');
    expect(s.collect!.kind).toBe('pairs');
    NAMES.forEach((_, i) => {
      s = act(s, { type: 'collect.submit', bySeat: i, entries: [`Mild ${i} | Wild ${i}`] });
    });
    expect(s.phase).toBe('tune');
    expect(s.cards.slice(0, 5).map((c) => c.author)).toEqual([0, 1, 2, 3, 4]);
    expect(s.cards.length).toBe(SPECTRUMS.length + 5);
  });

  it('the host can stop waiting; too few spectrums fall back to the built-ins', () => {
    let s = mod.createInitialState(config({ spectrums: { builtIn: false, spicy: false, listIds: [], perPlayer: 1 } }));
    s = act(s, { type: 'collect.submit', bySeat: 0, entries: ['Nap | Marathon'] });
    expect(() => act(s, { type: 'collect.close', bySeat: 0 } as never)).toThrow(/host/);
    s = act(s, { type: 'collect.close' });
    expect(s.phase).toBe('tune');
    expect(s.cards[0]).toMatchObject({ left: 'Nap', right: 'Marathon', author: 0 });
    expect(s.cards.length).toBeGreaterThan(2);

    let only = mod.createInitialState(config({ spectrums: { builtIn: false, spicy: false, listIds: [], perPlayer: 1 } }, ['A', 'B']));
    only = act(only, { type: 'collect.submit', bySeat: 0, entries: ['Nap | Marathon'] });
    only = act(only, { type: 'collect.submit', bySeat: 1, entries: ['Sprint | Snooze'] });
    expect(only.cards).toHaveLength(2);
  });
});

describe('the Tuner', () => {
  it('only the Tuner goes on air, with a valid pick, clue and turn', () => {
    const s = start();
    const t = tunerOf(s);
    const other = (t + 1) % NAMES.length;
    expect(() => act(s, { type: 'tune', bySeat: other, turn: 0, pick: 0, clue: 'Soup' })).toThrow(/Only the Tuner/);
    expect(() => act(s, { type: 'tune', bySeat: t, turn: 3, pick: 0, clue: 'Soup' })).toThrow(/over/);
    expect(() => act(s, { type: 'tune', bySeat: t, turn: 0, pick: 2, clue: 'Soup' })).toThrow(/spectrum/);
    expect(() => act(s, { type: 'tune', bySeat: t, turn: 0, pick: 0, clue: '   ' })).toThrow(/Write a clue/);
    expect(() => act(s, { type: 'tune', bySeat: t, turn: 0, pick: 0, clue: 'y'.repeat(41) })).toThrow(/40/);
    const left = s.cards[s.offer![1]!]!.left;
    expect(() => act(s, { type: 'tune', bySeat: t, turn: 0, pick: 1, clue: ` ${left.toUpperCase()} ` })).toThrow(/ends/);
    expect(() => act(s, { type: 'tune', bySeat: t, turn: 0, pick: 0, clue: 42 as never })).toThrow(/Write a clue/);
    expect(() => act(s, { type: 'move', bySeat: other, turn: 0, value: 10 })).toThrow(/Not guessing/);
  });

  it('the chosen spectrum goes on air; the other returns to the bottom of the deck', () => {
    const s = start();
    const [a, b] = s.offer!;
    const g = onAir(s, '  A   warm   bath ', 1);
    expect(g.phase).toBe('guess');
    expect(g.chosen).toBe(b);
    expect(g.clue).toBe('A warm bath');
    expect(g.deck[g.deck.length - 1]).toBe(a);
    expect(g.timer).toBeNull();
    expect(() => onAir(g)).toThrow(/Not tuning/);
  });

  it('Tuners rotate through every seat, rotations times each', () => {
    let s = start({ rotations: 2 });
    const tuners: number[] = [];
    while (s.phase !== 'gameOver') {
      tuners.push(tunerOf(s));
      s = onAir(s);
      s = act(s, { type: 'reveal' });
      s = act(s, { type: 'next' });
    }
    expect(tuners).toHaveLength(10);
    for (let i = 0; i < NAMES.length; i++) expect(tuners.filter((t) => t === i)).toHaveLength(2);
    expect(tuners[1]).toBe((tuners[0]! + 1) % NAMES.length);
    expect(mod.isFinished(s)).toBe(true);
  });

  it('a tiny deck keeps reshuffling and always offers two different spectrums', () => {
    let s = mod.createInitialState({
      ...config({ spectrums: { builtIn: false, spicy: false, listIds: ['L'], perPlayer: 0 }, rotations: 3 }),
      lists: { L: ['Tea | Coffee', 'Cats | Dogs', 'Beach | Mountains'] },
    });
    let rounds = 0;
    while (s.phase !== 'gameOver') {
      expect(s.offer![0]).not.toBe(s.offer![1]);
      s = act(act(onAir(s, 'Hmm'), { type: 'reveal' }), { type: 'next' });
      rounds++;
    }
    expect(rounds).toBe(15);
  });
});

describe('everyone mode', () => {
  it('each guesser sets and locks their own needle; all locked → reveal', () => {
    let s = { ...onAir(start()), target: 50 };
    const [g1, g2, g3, g4] = guessers(s) as [number, number, number, number];
    const t = tunerOf(s);
    expect(() => act(s, { type: 'move', bySeat: t, turn: s.turnNo, value: 50 })).toThrow(/Tuner/);
    expect(() => act(s, { type: 'move', turn: s.turnNo, value: 50 })).toThrow(/Whose/);
    expect(() => act(s, { type: 'move', bySeat: g1, turn: s.turnNo, value: 101 })).toThrow(/needle/);
    expect(() => act(s, { type: 'move', bySeat: g1, turn: s.turnNo, value: 4.5 })).toThrow(/needle/);
    expect(() => act(s, { type: 'lock', bySeat: g1, turn: s.turnNo })).toThrow(/Set your needle/);
    s = act(s, { type: 'move', bySeat: g1, turn: s.turnNo, value: 47 });
    s = act(s, { type: 'lock', bySeat: g1, turn: s.turnNo });
    expect(() => act(s, { type: 'move', bySeat: g1, turn: s.turnNo, value: 50 })).toThrow(/already/);
    expect(() => act(s, { type: 'lock', bySeat: g1, turn: s.turnNo, value: 50 })).toThrow(/already/);
    s = act(s, { type: 'lock', bySeat: g2, turn: s.turnNo, value: 58 });
    s = act(s, { type: 'lock', bySeat: g3, turn: s.turnNo, value: 100 });
    expect(s.phase).toBe('guess');
    s = act(s, { type: 'lock', bySeat: g4, turn: s.turnNo, value: 0 });
    expect(s.phase).toBe('reveal');
    const r = s.history[0]!;
    expect(r.how).toBe('locked');
    expect(r.target).toBe(50);
    expect(r.guesses.map((g) => [g.seat, g.points])).toEqual(
      [
        [g1, 4],
        [g2, 3],
        [g3, 0],
        [g4, 0],
      ].sort((a, b) => a[0]! - b[0]!),
    );
    // (4 + 3 + 0 + 0) / 4 = 1.75 → 2
    expect(r.tunerPoints).toBe(2);
    const v = mod.viewFor(s, null);
    expect(v.scores[t]).toBe(2);
    expect(v.scores[g1]).toBe(4);
    expect(v.scores[g2]).toBe(3);
  });

  it('every band edge scores as advertised', () => {
    const s = { ...onAir(start({}, ['T', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'])), target: 40 };
    const distances = [0, 3, 4, 8, 9, 14, 15, 20, 21, 40];
    const expected = [4, 4, 3, 3, 2, 2, 1, 1, 0, 0];
    let x = s;
    guessers(s).forEach((seat, i) => {
      x = act(x, { type: 'lock', bySeat: seat, turn: x.turnNo, value: 40 + (i % 2 ? -1 : 1) * distances[i]! });
    });
    expect(x.phase).toBe('reveal');
    expect(x.history[0]!.guesses.map((g) => g.points)).toEqual(expected);
    // 20 / 10 = 2
    expect(x.history[0]!.tunerPoints).toBe(2);
  });

  it('custom bands change the scoring', () => {
    let s = { ...onAir(start({ bands: [1, 2, 3, 4] }, ['A', 'B'])), target: 30 };
    s = act(s, { type: 'lock', bySeat: guessers(s)[0]!, turn: s.turnNo, value: 33 });
    expect(s.history[0]!.guesses[0]!.points).toBe(2);
    expect(s.history[0]!.tunerPoints).toBe(2);
  });

  it('two players: one guesser, and the Tuner gets exactly their points', () => {
    let s = { ...onAir(start({}, ['A', 'B'])), target: 70 };
    s = act(s, { type: 'lock', bySeat: guessers(s)[0]!, turn: s.turnNo, value: 61 });
    expect(s.history[0]!.guesses[0]!.points).toBe(2);
    expect(s.history[0]!.tunerPoints).toBe(2);
  });
});

describe('timer', () => {
  it('schedules the buzzer after a grace window; refuses early or stale ones', () => {
    const s = onAir(start({ guessSeconds: 60 }));
    expect(s.timer!.durationMs).toBe(60_000);
    const sched = mod.nextScheduled!(s)!;
    expect(sched.at).toBe(clock + 60_000 + GRACE_MS);
    expect(sched.action).toEqual({ type: 'timeUp', turn: s.turnNo });
    expect(() => act(s, sched.action, clock + 59_000)).toThrow(/not up/);
    expect(() => act(s, { type: 'timeUp', turn: 9 }, sched.at)).toThrow(/Stale/);
    expect(() => act(s, { type: 'timeUp', bySeat: 1, turn: s.turnNo } as never, sched.at)).toThrow(/host/);
    expect(mod.nextScheduled!(start({ guessSeconds: 60 }))).toBeNull();
    expect(mod.nextScheduled!(onAir(start()))).toBeNull();
  });

  it('at the buzzer unlocked needles lock where they are; untouched ones score 0 and don’t count for the Tuner', () => {
    let s = { ...onAir(start({ guessSeconds: 60 })), target: 20 };
    const [g1, g2, g3, g4] = guessers(s) as [number, number, number, number];
    s = act(s, { type: 'lock', bySeat: g1, turn: s.turnNo, value: 20 });
    s = act(s, { type: 'move', bySeat: g2, turn: s.turnNo, value: 30 });
    s = act(s, { type: 'move', bySeat: g3, turn: s.turnNo, value: 95 });
    const sched = mod.nextScheduled!(s)!;
    s = mod.applyAction(s, sched.action, { by: 'host:scheduler', now: sched.at });
    expect(s.phase).toBe('reveal');
    const r = s.history[0]!;
    expect(r.how).toBe('timeUp');
    const by = Object.fromEntries(r.guesses.map((g) => [g.seat, g]));
    expect(by[g1]).toMatchObject({ needle: 20, locked: true, points: 4 });
    expect(by[g2]).toMatchObject({ needle: 30, locked: false, points: 2 });
    expect(by[g3]).toMatchObject({ needle: 95, locked: false, points: 0 });
    expect(by[g4]).toMatchObject({ needle: null, locked: false, points: 0 });
    // (4 + 2 + 0) / 3 = 2
    expect(r.tunerPoints).toBe(2);
    expect(mod.nextScheduled!(s)).toBeNull();
  });

  it('a lock just after the buzzer counts within the grace window, not after', () => {
    const s = onAir(start({ guessSeconds: 90 }));
    const g = guessers(s)[0]!;
    const end = s.timer!.endsAt!;
    expect(() => act(s, { type: 'lock', bySeat: g, turn: s.turnNo, value: 10 }, end + GRACE_MS - 100)).not.toThrow();
    expect(() => act(s, { type: 'lock', bySeat: g, turn: s.turnNo, value: 10 }, end + GRACE_MS + 100)).toThrow(/Time/);
  });

  it('pausing freezes the clock and the schedule', () => {
    let s = onAir(start({ guessSeconds: 60 }));
    expect(() => act(s, { type: 'pause', bySeat: 0 } as never)).toThrow(/host/);
    s = act(s, { type: 'pause' }, clock + 10_000);
    expect(mod.nextScheduled!(s)).toBeNull();
    s = act(s, { type: 'resume' }, clock + 500_000);
    expect(mod.nextScheduled!(s)!.at).toBe(clock + 500_000 + 50_000 + GRACE_MS);
    expect(() => act(start(), { type: 'pause' })).toThrow(/Nothing/);
  });
});

describe('team mode', () => {
  it('one public needle anyone but the Tuner can drag; lock reveals', () => {
    let s = { ...onAir(start(team)), target: 62 };
    const t = tunerOf(s);
    const [g1, g2] = guessers(s) as [number, number];
    expect(s.shared).toBe(50);
    expect(() => act(s, { type: 'move', bySeat: t, turn: s.turnNo, value: 62 })).toThrow(/Tuner/);
    s = act(s, { type: 'move', bySeat: g1, turn: s.turnNo, value: 70 });
    s = act(s, { type: 'move', bySeat: g2, turn: s.turnNo, value: 66 });
    for (const seat of allSeats(s)) {
      expect(mod.viewFor(s, seat).shared).toEqual({ value: 66, touched: true, by: g2 });
    }
    s = act(s, { type: 'move', turn: s.turnNo, value: 64 }); // the host / the table
    expect(s.sharedBy).toBeNull();
    expect(() => act(s, { type: 'lock', bySeat: t, turn: s.turnNo })).toThrow(/Tuner/);
    s = act(s, { type: 'lock', bySeat: g1, turn: s.turnNo, value: 63 });
    expect(s.phase).toBe('reveal');
    expect(s.history[0]!.team).toEqual({ needle: 63, points: 4, by: g1 });
    expect(s.history[0]!.guesses).toEqual([]);
    expect(mod.viewFor(s, null).teamTotal).toBe(4);
    expect(mod.viewFor(s, null).scores.every((x) => x === 0)).toBe(true);
  });

  it('a deliberate lock at the start position counts; an untouched needle at the buzzer scores 0', () => {
    let a = { ...onAir(start({ ...team, guessSeconds: 60 })), target: 48 };
    a = act(a, { type: 'lock', turn: a.turnNo });
    expect(a.history[0]!.team).toMatchObject({ needle: 50, points: 4 });

    let b = { ...onAir(start({ ...team, guessSeconds: 60 })), target: 48 };
    const sched = mod.nextScheduled!(b)!;
    b = mod.applyAction(b, sched.action, { by: 'host:scheduler', now: sched.at });
    expect(b.history[0]!.team).toMatchObject({ needle: null, points: 0 });

    let c = { ...onAir(start(team)), target: 48 };
    c = act(c, { type: 'move', bySeat: guessers(c)[0]!, turn: c.turnNo, value: 40 });
    c = act(c, { type: 'reveal' });
    expect(c.history[0]!).toMatchObject({ how: 'forced', team: { needle: 40, points: 3 } });
  });

  it('the total builds over the rounds into a rating; skips don’t use up a round', () => {
    let s = start({ ...team, rounds: 5 });
    const first = tunerOf(s);
    s = act(s, { type: 'skipTuner' });
    expect(s.round).toBe(0);
    expect(tunerOf(s)).toBe((first + 1) % NAMES.length);
    expect(s.skipped).toEqual([first]);
    let played = 0;
    while (s.phase !== 'gameOver') {
      s = onAir(s);
      s = act(s, { type: 'lock', turn: s.turnNo, value: s.target });
      s = act(s, { type: 'next' });
      played++;
    }
    expect(played).toBe(5);
    const v = mod.viewFor(s, null);
    expect(v.teamTotal).toBe(20);
    expect(v.rating!.name).toBe('Telepathic');
  });

  it('every needle move and lock carries the turn token', () => {
    let s = onAir(start(team));
    const old = s.turnNo;
    s = act(act(s, { type: 'lock', turn: old }), { type: 'next' });
    s = onAir(s);
    expect(() => act(s, { type: 'move', turn: old, value: 10 })).toThrow(/over/);
    expect(() => act(s, { type: 'lock', turn: old })).toThrow(/over/);
  });
});

describe('host controls', () => {
  it('skip, force reveal, next and finish are host-only and phase-checked', () => {
    let s = start();
    for (const type of ['skipTuner', 'reveal', 'next', 'finish'] as const) {
      expect(() => act(s, { type, bySeat: 0 } as never)).toThrow(/host/);
    }
    expect(() => act(s, { type: 'reveal' })).toThrow(/Nothing to reveal/);
    expect(() => act(s, { type: 'next' })).toThrow(/Not at a reveal/);
    s = onAir(s);
    expect(() => act(s, { type: 'skipTuner' })).toThrow(/choosing/);
    s = act(s, { type: 'reveal' });
    expect(s.history[0]!.how).toBe('forced');
    expect(s.history[0]!.guesses.every((g) => g.points === 0)).toBe(true);
    s = act(s, { type: 'finish' });
    expect(s.phase).toBe('gameOver');
    expect(() => act(s, { type: 'finish' })).toThrow(/over/);
  });

  it('everyone mode: skipping forfeits that turn and returns both spectrums to the deck', () => {
    let s = start({}, ['A', 'B', 'C']);
    const offer = s.offer!;
    s = act(s, { type: 'skipTuner' });
    expect(s.round).toBe(1);
    expect(s.deck.slice(-2)).toEqual(offer);
    s = act(s, { type: 'skipTuner' });
    s = act(s, { type: 'skipTuner' });
    expect(s.phase).toBe('gameOver');
    expect(mod.viewFor(s, null).history).toEqual([]);
  });

  it('finishing mid-guess doesn’t score the unfinished round', () => {
    let s = onAir(start());
    s = act(s, { type: 'lock', bySeat: guessers(s)[0]!, turn: s.turnNo, value: s.target });
    s = act(s, { type: 'finish' });
    expect(s.history).toEqual([]);
    expect(mod.viewFor(s, null).scores.every((x) => x === 0)).toBe(true);
  });
});

describe('hidden information', () => {
  it('the target and the two options go only to the Tuner while tuning', () => {
    const s = start();
    const t = tunerOf(s);
    const labels = s.offer!.flatMap((id) => [s.cards[id]!.left, s.cards[id]!.right]);
    const mine = mod.viewFor(s, t);
    expect(mine.yourTarget).toBe(s.target);
    expect(mine.yourOptions!.flatMap((o) => [o.left, o.right])).toEqual(labels);
    for (const seat of allSeats(s).filter((x) => x !== t)) {
      const v = mod.viewFor(s, seat);
      expect(v.yourTarget).toBeNull();
      expect(v.yourOptions).toBeNull();
      expect(v.spectrum).toBeNull();
      const j = json(s, seat);
      for (const l of labels) expect(j).not.toContain(`"${l}"`);
    }
  });

  it('non-Tuner views are byte-identical whatever the target and options', () => {
    const a = start();
    const t = tunerOf(a);
    const otherOffer: [number, number] = [(a.offer![0]! + 7) % a.cards.length, (a.offer![1]! + 11) % a.cards.length];
    const b: TuneInState = { ...a, target: a.target === 90 ? 10 : 90, offer: otherOffer };
    for (const seat of allSeats(a).filter((x) => x !== t)) expect(json(a, seat)).toBe(json(b, seat));
    expect(json(a, t)).not.toBe(json(b, t));
    // Still identical once the clue is on air.
    const ga = onAir(a);
    const gb: TuneInState = { ...ga, target: ga.target === 90 ? 10 : 90 };
    for (const seat of allSeats(ga).filter((x) => x !== t)) expect(json(ga, seat)).toBe(json(gb, seat));
    expect(mod.viewFor(ga, t).yourTarget).toBe(ga.target);
    // Team mode too, with the shared needle moving.
    let ta = onAir(start(team));
    ta = act(ta, { type: 'move', bySeat: guessers(ta)[0]!, turn: ta.turnNo, value: 71 });
    const tb: TuneInState = { ...ta, target: ta.target === 90 ? 10 : 90 };
    for (const seat of allSeats(ta).filter((x) => x !== tunerOf(ta))) expect(json(ta, seat)).toBe(json(tb, seat));
  });

  it('once on air the spectrum and clue are public, the options aren’t', () => {
    const s = onAir(start(), 'Bath water');
    for (const seat of allSeats(s)) {
      const v = mod.viewFor(s, seat);
      expect(v.clue).toBe('Bath water');
      expect(v.spectrum).toEqual({ left: s.cards[s.chosen!]!.left, right: s.cards[s.chosen!]!.right });
      expect(v.yourOptions).toBeNull();
    }
  });

  it('everyone mode: guesses stay private until the reveal; lock-in status is public', () => {
    let s = onAir(start());
    const t = tunerOf(s);
    const [g1, g2] = guessers(s) as [number, number];
    const before = s;
    s = act(s, { type: 'move', bySeat: g1, turn: s.turnNo, value: 13 });
    s = act(s, { type: 'lock', bySeat: g2, turn: s.turnNo, value: 87 });
    expect(mod.viewFor(s, g1).yourNeedle).toBe(13);
    expect(mod.viewFor(s, g2).yourNeedle).toBe(87);
    for (const seat of allSeats(s)) {
      const v = mod.viewFor(s, seat);
      expect(v.locked[g2]).toBe(true);
      expect(v.locked[g1]).toBe(false);
      expect(v.shared).toBeNull();
      if (seat !== g1 && seat !== g2) expect(v.yourNeedle).toBeNull();
    }
    expect(mod.viewFor(s, t).yourNeedle).toBeNull();
    // Views of everyone else differ from before only by g2's public lock flag.
    const sameLocks: TuneInState = { ...before, locked: s.locked };
    for (const seat of allSeats(s).filter((x) => x !== g1 && x !== g2)) expect(json(s, seat)).toBe(json(sameLocks, seat));
  });

  it('views don’t depend on other players’ needle values', () => {
    const s = onAir(start());
    const [g1, g2, g3] = guessers(s) as [number, number, number];
    const a = act(act(s, { type: 'move', bySeat: g1, turn: s.turnNo, value: 5 }), { type: 'move', bySeat: g2, turn: s.turnNo, value: 6 });
    const b = act(act(s, { type: 'move', bySeat: g1, turn: s.turnNo, value: 95 }), { type: 'move', bySeat: g2, turn: s.turnNo, value: 94 });
    for (const seat of [null, tunerOf(s), g3]) expect(json(a, seat)).toBe(json(b, seat));
  });

  it('the reveal makes the target and every needle public', () => {
    let s = onAir(start());
    const g = guessers(s)[0]!;
    s = act(s, { type: 'move', bySeat: g, turn: s.turnNo, value: 33 });
    s = act(s, { type: 'reveal' });
    for (const seat of allSeats(s)) {
      const v = mod.viewFor(s, seat);
      expect(v.reveal!.target).toBe(s.target);
      expect(v.reveal!.guesses.find((x) => x.seat === g)!.needle).toBe(33);
      expect(v.yourTarget).toBeNull();
      expect(v.timer).toBeNull();
    }
  });

  it('a game ended mid-round never reveals that round’s target', () => {
    const a = act(onAir(start()), { type: 'finish' });
    const b: TuneInState = { ...a, target: a.target === 90 ? 10 : 90 };
    for (const seat of allSeats(a)) expect(json(a, seat)).toBe(json(b, seat));
  });

  it('player-written spectrums stay private while collecting', () => {
    let s = mod.createInitialState(config({ spectrums: { builtIn: true, spicy: false, listIds: [], perPlayer: 1 } }));
    s = act(s, { type: 'collect.submit', bySeat: 0, entries: ['Uncle Steve | Aunt Jo'] });
    for (const seat of [null, 1, 2]) expect(json(s, seat)).not.toContain('Steve');
    expect(mod.viewFor(s, 0).collect!.yours).toEqual(['Uncle Steve | Aunt Jo']);
  });

  it('never exposes the rng, the deck or the card pool', () => {
    for (const s of [start(), onAir(start()), onAir(start(team))]) {
      for (const seat of allSeats(s)) {
        const j = json(s, seat);
        for (const key of ['"rng"', '"deck"', '"cards"', '"basePool"', '"target":', '"offer"', '"needles"']) {
          expect(j).not.toContain(key);
        }
      }
    }
  });
});
