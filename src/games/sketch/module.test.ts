import { describe, expect, it } from 'vitest';
import { SCHEDULER, type GameConfig } from '@/engine/types';
import { hintableIndexes } from '@/words/match';
import type { SketchAction } from './actions';
import { boardIdFor, sketchModule as mod } from './module';
import {
  CHOOSE_MS,
  DRAWER_PER_SOLVER,
  FEED_LIMIT,
  GRACE_MS,
  REVEAL_MS,
  guessPoints,
  hintPlan,
  readOptions,
  spokenPoints,
} from './rules';
import type { SketchState, SketchView } from './state';

const NAMES = ['Ana', 'Ben', 'Cai', 'Dee'];
// Distinctive words so "is it anywhere in this JSON?" checks can't false-positive.
const WORDS = [
  'Xylophone',
  'Zeppelin',
  'Kangaroo',
  'Quokka',
  'Jellyfish',
  'Volcano',
  'Waffle',
  'Umbrella',
  'Igloo',
  'Harmonica',
  'Pyramid',
  'Octopus',
];

const T0 = 1_000; // match start (choose timer starts here)
const T1 = 2_000; // the word is picked (drawing timer starts here)

function config(
  options: Record<string, unknown> = {},
  { names = NAMES, local = false, lists = { L: WORDS } as Record<string, string[]> } = {},
): GameConfig {
  return {
    gameId: 'sketch',
    seats: names.map((name, index) => ({ index, uuid: local ? null : `uid-${index}`, name })),
    seed: 4242,
    now: T0,
    gameOptions: { ...mod.defaultOptions(), words: { packs: [], listIds: ['L'], perPlayer: 0 }, ...options },
    lists,
  };
}

function act(s: SketchState, a: SketchAction, now = T1): SketchState {
  return mod.applyAction(s, a, { by: '', now });
}

/** Apply whatever the host's scheduler would apply next, at its time. */
function tick(s: SketchState): SketchState {
  const next = mod.nextScheduled!(s);
  if (!next) throw new Error('nothing scheduled');
  return mod.applyAction(s, next.action, { by: SCHEDULER, now: next.at });
}

function create(options: Record<string, unknown> = {}, cfg: Parameters<typeof config>[1] = {}): SketchState {
  return mod.createInitialState(config(options, cfg));
}

/** A game whose first drawer has just picked word `index`. */
function drawing(options: Record<string, unknown> = {}, cfg: Parameters<typeof config>[1] = {}, index = 0): SketchState {
  const s = create(options, cfg);
  return act(s, { type: 'choose', bySeat: s.drawer!, turn: s.turnNo, index }, T1);
}

const word = (s: SketchState) => s.pool[s.word!]!.text;
const guessers = (s: SketchState) => s.seats.map((x) => x.index).filter((i) => i !== s.drawer);
const guess = (s: SketchState, seat: number, text: string, now = T1): SketchState =>
  act(s, { type: 'guess', bySeat: seat, turn: s.turnNo, text }, now);
/** One letter changed in the middle: a typo, not the answer. */
const nearMiss = (w: string) => w.slice(0, 2) + (w[2]?.toLowerCase() === 'q' ? 'z' : 'q') + w.slice(3);
const view = (s: SketchState, seat: number | null): SketchView => mod.viewFor(s, seat);
const json = (s: SketchState, seat: number | null) => JSON.stringify(mod.viewFor(s, seat));
const allViewers = (s: SketchState): Array<number | null> => [null, ...s.seats.map((x) => x.index)];

// ============================================================================

describe('options', () => {
  it('coerces untrusted options', () => {
    const o = readOptions({ rounds: 99, turnSeconds: 5, guessing: 'telepathy', hints: 'yes', words: { packs: ['nope'] } });
    expect(o.rounds).toBe(5);
    expect(o.turnSeconds).toBe(30);
    expect(o.guessing).toBe('typed');
    expect(o.hints).toBe(true);
    expect(o.words.packs).toEqual([]);
    expect(readOptions(undefined)).toEqual(mod.defaultOptions());
    expect(readOptions({}).words.packs).toEqual(['everyday', 'animals', 'food', 'actions']);
  });

  it('explains impossible setups', () => {
    expect(mod.optionsProblem!(mod.defaultOptions(), 1)).toMatch(/at least 2/);
    expect(mod.optionsProblem!(mod.defaultOptions(), 17)).toMatch(/at most 16/);
    expect(mod.optionsProblem!({ words: { packs: [], listIds: [], perPlayer: 0 } }, 4)).toMatch(/words come from/);
    expect(mod.optionsProblem!(mod.defaultOptions(), 4)).toBeNull();
    expect(() => create({}, { names: ['Solo'] })).toThrow(/2–16/);
    expect(() => create({}, { lists: { L: ['One', 'Two'] } })).toThrow(/Only 2 words/);
  });

  it('plays with the default packs', () => {
    const s = mod.createInitialState({ ...config(), gameOptions: mod.defaultOptions() });
    expect(s.phase).toBe('choose');
    expect(s.choices).toHaveLength(3);
    expect(s.pool.every((w) => !w.custom)).toBe(true);
  });
});

describe('setup', () => {
  it('starts with the first drawer choosing; everyone draws once per round', () => {
    const s = create({ rounds: 3 });
    expect(s.phase).toBe('choose');
    expect(s.guessing).toBe('typed');
    expect(s.totalTurns).toBe(12);
    expect([...s.order].sort()).toEqual([0, 1, 2, 3]);
    expect(s.drawer).toBe(s.order[0]);
    expect(s.choices).toHaveLength(3);
    expect(s.timer).toEqual({ durationMs: CHOOSE_MS, endsAt: T0 + CHOOSE_MS, remainingMs: CHOOSE_MS });
  });

  it('a single-device table always plays spoken, and waits for the pick', () => {
    const s = create({ guessing: 'typed' }, { local: true });
    expect(s.guessing).toBe('spoken');
    expect(s.timer).toBeNull();
    expect(mod.nextScheduled!(s)).toBeNull();
    expect(view(s, null).guessing).toBe('spoken');
  });

  it('collects player words, offers them first and never to their author; no word repeats', () => {
    let s = create({ words: { packs: [], listIds: [], perPlayer: 3 }, rounds: 2 }, { names: ['Ana', 'Ben', 'Cai'] });
    expect(s.phase).toBe('collect');
    expect(mod.liveBoard!(s)).toBeNull();
    s = act(s, { type: 'collect.submit', bySeat: 0, entries: ['Ana one', 'Ana two', 'Ana three'] });
    s = act(s, { type: 'collect.submit', bySeat: 1, entries: ['Ben one', 'Ben two', 'Ben three'] });
    expect(s.phase).toBe('collect');
    s = act(s, { type: 'collect.submit', bySeat: 2, entries: ['Cai one', 'Cai two', 'Cai three'] });
    expect(s.phase).toBe('choose');

    const drawn: string[] = [];
    let now = T1;
    while (s.phase !== 'gameOver') {
      const me = s.seats[s.drawer!]!.name;
      const offered = s.choices.map((id) => s.pool[id]!);
      expect(offered.length).toBeGreaterThan(0);
      for (const w of offered) expect(w.text.startsWith(me)).toBe(false);
      s = act(s, { type: 'choose', bySeat: s.drawer!, turn: s.turnNo, index: 0 }, now);
      drawn.push(word(s));
      s = act(s, { type: 'skipTurn', turn: s.turnNo }, now);
      s = act(s, { type: 'next', turn: s.turnNo }, now);
      now += 1000;
    }
    expect(drawn).toHaveLength(6);
    expect(new Set(drawn).size).toBe(6);
  });

  it('puts player words ahead of pack words', () => {
    let s = create({ words: { packs: ['animals'], listIds: [], perPlayer: 1 } }, { names: ['Ana', 'Ben', 'Cai'] });
    s = act(s, { type: 'collect.submit', bySeat: 0, entries: ['Ana thing'] });
    s = act(s, { type: 'collect.submit', bySeat: 1, entries: ['Ben thing'] });
    s = act(s, { type: 'collect.submit', bySeat: 2, entries: ['Cai thing'] });
    const offered = s.choices.map((id) => s.pool[id]!);
    expect(offered.filter((w) => w.author !== null)).toHaveLength(2);
    expect(offered.some((w) => w.author === s.drawer)).toBe(false);
  });

  it('the host can stop waiting for slow writers', () => {
    let s = create({ words: { packs: [], listIds: [], perPlayer: 2 } });
    s = act(s, { type: 'collect.submit', bySeat: 0, entries: ['Cheese', 'Bicycle'] });
    expect(() => act(s, { type: 'collect.close', bySeat: 0 } as never)).toThrow(/host/);
    s = act(s, { type: 'collect.close' });
    // Only Ana's words exist: Ana can't draw them, so her turn is skipped.
    expect(s.phase).toBe('choose');
    expect(s.drawer).not.toBe(0);
  });
});

describe('choosing a word', () => {
  it('only the drawer (or the host) picks, with a current turn token', () => {
    const s = create();
    const other = guessers(s)[0]!;
    expect(() => act(s, { type: 'choose', bySeat: other, turn: 0, index: 0 })).toThrow(/drawer/);
    expect(() => act(s, { type: 'choose', bySeat: s.drawer!, turn: 1, index: 0 })).toThrow(/turn is over/);
    expect(() => act(s, { type: 'choose', bySeat: s.drawer!, turn: 0, index: 3 })).toThrow(/word choice/);
    const picked = s.pool[s.choices[1]!]!.text;
    const d = act(s, { type: 'choose', turn: 0, index: 1 });
    expect(d.phase).toBe('drawing');
    expect(word(d)).toBe(picked);
    expect(d.timer).toEqual({ durationMs: 80_000, endsAt: T1 + 80_000, remainingMs: 80_000 });
    // Double tap.
    expect(() => act(d, { type: 'choose', bySeat: d.drawer!, turn: 0, index: 0 })).toThrow();
  });

  it('picks one automatically when the choosing clock runs out', () => {
    const s = create();
    const sched = mod.nextScheduled!(s)!;
    expect(sched).toEqual({ at: T0 + CHOOSE_MS, action: { type: 'chooseTimeUp', turn: 0 } });
    expect(() => mod.applyAction(s, sched.action, { by: SCHEDULER, now: sched.at - 1 })).toThrow(/Still/);
    expect(() => act(s, { type: 'chooseTimeUp', turn: 0, bySeat: 0 } as never)).toThrow(/host/);
    const d = tick(s);
    expect(d.phase).toBe('drawing');
    expect(s.choices.map((id) => s.pool[id]!.text)).toContain(word(d));
  });

  it('unchosen words go back in the deck; the chosen one is gone for good', () => {
    const s = create();
    const [a, b, c] = s.choices;
    const d = act(s, { type: 'choose', bySeat: s.drawer!, turn: 0, index: 0 });
    expect(d.deck).not.toContain(a);
    expect(d.deck).toContain(b);
    expect(d.deck).toContain(c);
  });
});

describe('typed guessing', () => {
  it('scores by speed and order; the drawer earns per solver; all solved ends the turn', () => {
    let s = drawing();
    const [g1, g2, g3] = guessers(s) as [number, number, number];
    const w = word(s);
    s = guess(s, g1, w.toLowerCase(), T1);
    expect(s.solves).toEqual([{ seat: g1, points: guessPoints(1, 0), ms: 0 }]);
    expect(guessPoints(1, 0)).toBe(115);
    s = guess(s, g2, `  ${w.toUpperCase()}S `, T1 + 40_000);
    expect(s.solves[1]).toEqual({ seat: g2, points: 80, ms: 40_000 });
    expect(view(s, null).scores[s.drawer!]).toBe(2 * DRAWER_PER_SOLVER);
    expect(s.phase).toBe('drawing');
    // Just after the buzzer, inside the grace window: the minimum.
    s = guess(s, g3, w, T1 + 80_000 + GRACE_MS - 100);
    expect(s.phase).toBe('reveal');
    expect(s.history[0]!.solves.map((x) => x.points)).toEqual([115, 80, 45]);
    expect(s.scores[g1]).toBe(115);
    expect(s.scores[s.drawer!]).toBe(3 * DRAWER_PER_SOLVER);
  });

  it('keeps points in the ~40–100 range plus a small order bonus', () => {
    expect(guessPoints(1, 0)).toBe(115);
    expect(guessPoints(1, 5)).toBe(100);
    expect(guessPoints(0, 9)).toBe(40);
    expect(guessPoints(0.5, 2)).toBe(75);
  });

  it('sorts guesses into public misses, private near-misses and solves', () => {
    let s = drawing({}, {}, 0);
    const w = word(s);
    const [a, b] = guessers(s) as [number, number];
    s = guess(s, a, 'a spaceship');
    s = guess(s, b, nearMiss(w), T1 + 10); // a typo
    s = guess(s, a, `giant ${w} thing`, T1 + 1000); // gives it away
    const pub = view(s, null).feed;
    expect(pub.map((e) => [e.kind, e.text])).toEqual([['guess', 'a spaceship']]);
    const mineB = view(s, b).feed.find((e) => e.kind === 'close')!;
    expect(mineB).toMatchObject({ text: nearMiss(w), only: 'you', seat: b });
    const mineA = view(s, a).feed.filter((e) => e.only === 'you');
    expect(mineA.map((e) => e.text)).toEqual([`giant ${w} thing`]);
    expect(view(s, a).feed.some((e) => e.seat === b && e.kind === 'close')).toBe(false);
  });

  it('after solving, messages reach only the other solvers and the drawer', () => {
    let s = drawing();
    const [a, b, c] = guessers(s) as [number, number, number];
    s = guess(s, a, word(s));
    s = guess(s, a, 'haha the wobbly bit', T1 + 1000);
    expect(view(s, s.drawer).feed.find((e) => e.kind === 'chat')).toMatchObject({ text: 'haha the wobbly bit', only: 'solvers' });
    expect(view(s, a).feed.some((e) => e.kind === 'chat')).toBe(true);
    for (const seat of [b, c, null]) expect(json(s, seat)).not.toContain('wobbly');
    s = guess(s, b, word(s), T1 + 2000);
    expect(view(s, b).feed.some((e) => e.kind === 'chat')).toBe(true);
    expect(json(s, c)).not.toContain('wobbly');
    // Solving doesn't score twice.
    s = guess(s, a, word(s), T1 + 3000);
    expect(s.solves.filter((x) => x.seat === a)).toHaveLength(1);
  });

  it('the drawer cannot guess; guesses are rate-limited, trimmed and capped', () => {
    const s = drawing();
    const [a] = guessers(s) as [number];
    expect(() => guess(s, s.drawer!, 'anything')).toThrow(/drawer/);
    const once = guess(s, a, 'tree', T1);
    expect(() => guess(once, a, 'house', T1 + 300)).toThrow(/Slow/);
    expect(() => guess(once, a, 'house', T1 + 700)).not.toThrow();
    expect(() => guess(s, a, '    ')).toThrow(/Type/);
    expect(() => guess(s, a, 42 as never)).toThrow(/Type/);
    expect(() => guess(s, 9, 'x')).toThrow(/seat/);
    const long = guess(s, a, `${'blah '.repeat(40)}`);
    expect(long.feed[0]!.text.length).toBeLessThanOrEqual(60);
    expect(() => act(s, { type: 'guess', bySeat: a, turn: 7, text: 'x' })).toThrow(/turn is over/);
  });

  it('refuses guesses while paused, after the grace window, and in spoken games', () => {
    const s = drawing();
    const [a] = guessers(s) as [number];
    const paused = act(s, { type: 'pause' }, T1 + 1000);
    expect(() => guess(paused, a, word(s), T1 + 2000)).toThrow(/paused/);
    expect(() => guess(s, a, word(s), T1 + 80_000 + GRACE_MS + 1)).toThrow(/Time/);
    const spoken = drawing({ guessing: 'spoken' });
    expect(() => guess(spoken, guessers(spoken)[0]!, 'x')).toThrow(/Shout/);
  });

  it('keeps the last 50 entries of each kind, so private lines never push public ones out', () => {
    let s = drawing();
    const [a, b] = guessers(s) as [number, number];
    let now = T1;
    for (let i = 0; i < 60; i++) {
      s = guess(s, a, `wild guess ${i}`, now);
      now += 700;
    }
    const near = nearMiss(word(s));
    for (let i = 0; i < 5; i++) {
      s = guess(s, b, near, now);
      now += 700;
    }
    const pub = view(s, null).feed;
    expect(pub).toHaveLength(FEED_LIMIT);
    expect(pub[0]!.text).toBe('wild guess 10');
    expect(view(s, b).feed.filter((e) => e.kind === 'close')).toHaveLength(5);
    expect(view(s, b).feed).toHaveLength(FEED_LIMIT);
    expect(new Set(view(s, b).feed.map((e) => e.key)).size).toBe(FEED_LIMIT);
  });
});

describe('spoken guessing', () => {
  function spoken(local = true): SketchState {
    const s = create({ guessing: 'spoken' }, { local });
    return act(s, { type: 'choose', bySeat: s.drawer!, turn: 0, index: 0 }, T1);
  }

  it('the drawer or host taps who got it, in order; taps can be undone', () => {
    let s = spoken();
    const [a, b, c] = guessers(s) as [number, number, number];
    s = act(s, { type: 'award', bySeat: s.drawer!, turn: 0, seat: b });
    s = act(s, { type: 'award', turn: 0, seat: a });
    s = act(s, { type: 'award', turn: 0, seat: c });
    expect(s.solves.map((x) => [x.seat, x.points])).toEqual([
      [b, spokenPoints(0)],
      [a, spokenPoints(1)],
      [c, spokenPoints(2)],
    ]);
    expect(s.phase).toBe('drawing'); // waits for "Done"
    expect(() => act(s, { type: 'award', turn: 0, seat: a })).toThrow(/already/);
    expect(() => act(s, { type: 'award', turn: 0, seat: s.drawer! })).toThrow(/drawer/);
    s = act(s, { type: 'unaward', bySeat: s.drawer!, turn: 0, seat: b });
    expect(s.solves.map((x) => [x.seat, x.points])).toEqual([
      [a, 100],
      [c, 80],
    ]);
    expect(view(s, null).feed.filter((e) => e.kind === 'solved').map((e) => e.points)).toEqual([100, 80]);
    s = act(s, { type: 'endTurn', bySeat: s.drawer!, turn: 0 });
    expect(s.phase).toBe('reveal');
    expect(s.scores[a]).toBe(100);
    expect(s.scores[s.drawer!]).toBe(2 * DRAWER_PER_SOLVER);
  });

  it('nobody else may tap, and typed-only actions are refused', () => {
    const s = spoken(false);
    const [a, b] = guessers(s) as [number, number];
    expect(() => act(s, { type: 'award', bySeat: a, turn: 0, seat: b })).toThrow(/drawer/);
    expect(() => act(s, { type: 'endTurn', bySeat: a, turn: 0 })).toThrow(/drawer/);
    expect(() => act(drawing(), { type: 'award', turn: 0, seat: a })).toThrow(/typed/);
    expect(() => act(drawing(), { type: 'endTurn', turn: 0 })).toThrow();
  });

  it('"Nobody got it" ends the turn with no points; so does the buzzer', () => {
    const s = spoken();
    const r = act(s, { type: 'endTurn', turn: 0 });
    expect(r.phase).toBe('reveal');
    expect(r.scores.every((x) => x === 0)).toBe(true);
    expect(() => act(s, { type: 'award', turn: 0, seat: guessers(s)[0]! }, T1 + 80_000 + GRACE_MS + 5)).toThrow(/Time/);
  });
});

describe('timing and hints', () => {
  it('hints unlock at half and three-quarter time, then the buzzer (after the grace window)', () => {
    let s = drawing();
    const end = T1 + 80_000;
    const letters = hintableIndexes(word(s)).length;
    const [first, total] = hintPlan(letters);
    expect(total).toBeLessThanOrEqual(letters / 3);
    expect(total).toBeGreaterThan(0);

    expect(mod.nextScheduled!(s)).toEqual({ at: end - 40_000, action: { type: 'hint', turn: 0, stage: 0 } });
    expect(() => act(s, { type: 'hint', turn: 0, stage: 0 }, end - 40_001)).toThrow(/early/);
    const shown = (x: SketchState) => view(x, null).hint!.filter((c) => c !== '_').length;
    expect(shown(s)).toBe(0);
    s = tick(s);
    expect(shown(s)).toBe(first);

    const next = mod.nextScheduled!(s)!;
    if (total > first) {
      expect(next).toEqual({ at: end - 20_000, action: { type: 'hint', turn: 0, stage: 1 } });
      s = tick(s);
      expect(shown(s)).toBe(total);
    }
    // Stale hint refused.
    expect(() => act(s, { type: 'hint', turn: 0, stage: 0 }, end)).toThrow(/No hint/);

    expect(mod.nextScheduled!(s)).toEqual({ at: end + GRACE_MS, action: { type: 'timeUp', turn: 0 } });
    expect(() => act(s, { type: 'timeUp', turn: 0 }, end + 10)).toThrow(/not up/);
    expect(() => act(s, { type: 'timeUp', turn: 3 }, end + GRACE_MS)).toThrow(/turn is over/);
    s = tick(s);
    expect(s.phase).toBe('reveal');
  });

  it('the hint shows blanks (and spaces) to guessers only; solvers and the drawer see the word', () => {
    let s = drawing({}, { lists: { L: ['Ice cream cone', 'Paper plane', 'Toaster oven'] } });
    const w = word(s);
    const [a, b] = guessers(s) as [number, number];
    const blank = view(s, a).hint!;
    expect(blank.join('')).toBe(w.replace(/[A-Za-z]/g, '_'));
    expect(view(s, a).word).toBeNull();
    expect(view(s, s.drawer).hint).toBeNull();
    expect(view(s, s.drawer).word).toBe(w);
    s = guess(s, a, w);
    expect(view(s, a).word).toBe(w);
    expect(view(s, a).hint).toBeNull();
    expect(view(s, a).youSolved).toBe(true);
    expect(view(s, b).word).toBeNull();
  });

  it('no hints: no blanks and nothing scheduled but the buzzer', () => {
    const s = drawing({ hints: false });
    expect(view(s, null).hint).toBeNull();
    expect(mod.nextScheduled!(s)!.action).toEqual({ type: 'timeUp', turn: 0 });
  });

  it('pausing freezes the clock and the schedule (in every timed phase)', () => {
    let s = drawing();
    s = act(s, { type: 'pause' }, T1 + 10_000);
    expect(mod.nextScheduled!(s)).toBeNull();
    s = act(s, { type: 'resume' }, T1 + 500_000);
    expect(mod.nextScheduled!(s)!.at).toBe(T1 + 500_000 + 30_000); // the half-time hint, 30 s on
    const c = act(create(), { type: 'pause' }, T0 + 5000);
    expect(mod.nextScheduled!(c)).toBeNull();
    expect(() => act(create({}, { local: true }), { type: 'pause' })).toThrow(/Nothing/);
    expect(() => act(s, { type: 'pause', bySeat: 0 } as never)).toThrow(/host/);
  });

  it('the reveal moves on by itself (or when the host says so), to a fresh board', () => {
    let s = drawing();
    const board = mod.liveBoard!(s)!;
    expect(board.drawerSeat).toBe(s.drawer);
    s = act(s, { type: 'skipTurn', turn: 0 }, T1 + 5000);
    expect(s.phase).toBe('reveal');
    expect(mod.liveBoard!(s)).toEqual(board); // the picture stays up
    expect(mod.nextScheduled!(s)).toEqual({ at: T1 + 5000 + REVEAL_MS, action: { type: 'next', turn: 0 } });
    const viaHost = act(s, { type: 'next', turn: 0 }, T1 + 5001);
    s = tick(s);
    expect(viaHost.turnNo).toBe(1);
    expect(s.phase).toBe('choose');
    expect(s.turnNo).toBe(1);
    expect(s.drawer).toBe(s.order[1]);
    const nextBoard = mod.liveBoard!(s)!;
    expect(nextBoard.id).not.toBe(board.id);
    expect(nextBoard.drawerSeat).toBe(s.drawer);
    expect(() => act(s, { type: 'next', turn: 0 })).toThrow();
  });

  it('board ids are unique across matches and say nothing about the word', () => {
    const a = create();
    const b = mod.createInitialState({ ...config(), now: T0 + 1 });
    expect(boardIdFor(a)).not.toBe(boardIdFor(b));
    const d = drawing();
    expect(boardIdFor(d)).toBe(boardIdFor(a));
    expect(boardIdFor(d)!.toLowerCase()).not.toContain(word(d).toLowerCase().slice(0, 4));
    expect(boardIdFor(d)!.length).toBeLessThanOrEqual(60);
  });
});

describe('host controls and the end', () => {
  it('skipping a chooser moves to the next drawer and keeps their words in the deck', () => {
    const s = create();
    const s2 = act(s, { type: 'skipTurn', turn: 0 });
    expect(s2.phase).toBe('choose');
    expect(s2.turnNo).toBe(1);
    expect(s2.drawer).toBe(s.order[1]);
    for (const id of s.choices) expect([...s2.deck, ...s2.choices]).toContain(id);
    expect(() => act(s, { type: 'skipTurn', turn: 0, bySeat: 0 } as never)).toThrow(/host/);
    expect(() => act(s2, { type: 'skipTurn', turn: 0 })).toThrow(/turn is over/);
  });

  it('ending a drawing early keeps the points won and flags the reveal', () => {
    let s = drawing();
    const [a] = guessers(s) as [number];
    s = guess(s, a, word(s));
    s = act(s, { type: 'skipTurn', turn: 0 }, T1 + 3000);
    expect(view(s, null).reveal).toMatchObject({ skipped: true, word: word(s) });
    expect(s.scores[a]).toBeGreaterThan(0);
  });

  it('finish shows results at once, banking a drawing in progress', () => {
    let s = drawing();
    const [a] = guessers(s) as [number];
    s = guess(s, a, word(s));
    s = act(s, { type: 'finish' }, T1 + 1000);
    expect(s.phase).toBe('gameOver');
    expect(mod.isFinished(s)).toBe(true);
    expect(mod.liveBoard!(s)).toBeNull();
    expect(mod.nextScheduled!(s)).toBeNull();
    expect(s.scores[a]).toBe(115);
    expect(() => act(s, { type: 'finish' })).toThrow(/over/);
  });

  it('ends after every player has drawn each round, with awards', () => {
    let s = create({ rounds: 1 }, { names: ['Ana', 'Ben', 'Cai'] });
    let now = T1;
    const drawers: number[] = [];
    while (s.phase !== 'gameOver') {
      drawers.push(s.drawer!);
      s = act(s, { type: 'choose', bySeat: s.drawer!, turn: s.turnNo, index: 0 }, now);
      const gs = guessers(s);
      // The first drawer's picture is solved by both, fast; the others by one, slowly.
      if (s.turnNo === 0) {
        s = guess(s, gs[0]!, word(s), now + 1000);
        s = guess(s, gs[1]!, word(s), now + 2000);
      } else {
        s = guess(s, gs[0]!, word(s), now + 60_000);
        s = act(s, { type: 'skipTurn', turn: s.turnNo }, now + 61_000);
      }
      s = act(s, { type: 'next', turn: s.turnNo }, now + 62_000);
      now += 100_000;
    }
    expect([...drawers].sort()).toEqual([0, 1, 2]);
    const r = view(s, null).results!;
    expect(r.turns).toHaveLength(3);
    expect(r.bestArtist).toEqual({ seat: drawers[0], points: 2 * DRAWER_PER_SOLVER });
    expect(r.fastest).toMatchObject({ ms: 1000 });
    expect(r.guessed.reduce((x, y) => x + y, 0)).toBe(4);
    expect(view(s, null).scores).toEqual(s.scores);
  });

  it('ends early when the words run out', () => {
    let s = create({ words: { packs: [], listIds: [], perPlayer: 1 } }, { names: ['Ana', 'Ben'] });
    s = act(s, { type: 'collect.submit', bySeat: 0, entries: ['Moon'] });
    s = act(s, { type: 'collect.submit', bySeat: 1, entries: ['Sock'] });
    expect(s.choices.map((id) => s.pool[id]!.text)).toEqual([s.drawer === 0 ? 'Sock' : 'Moon']);
    for (let i = 0; i < 2; i++) {
      expect(s.phase).toBe('choose');
      s = act(s, { type: 'choose', bySeat: s.drawer!, turn: s.turnNo, index: 0 });
      s = act(s, { type: 'skipTurn', turn: s.turnNo });
      s = act(s, { type: 'next', turn: s.turnNo });
    }
    // Two rounds were planned, but every word has been drawn.
    expect(s.phase).toBe('gameOver');
    expect(s.history.map((t) => t.word).sort()).toEqual(['Moon', 'Sock']);
  });
});

describe('hidden information', () => {
  it('the three choices are in the drawer’s view only', () => {
    const s = create();
    const offered = s.choices.map((id) => s.pool[id]!.text);
    expect(view(s, s.drawer).choices).toEqual(offered);
    for (const seat of allViewers(s).filter((x) => x !== s.drawer)) {
      expect(view(s, seat).choices).toBeNull();
      const j = json(s, seat);
      for (const w of WORDS) expect(j).not.toContain(w);
    }
  });

  it('the word is in the drawer’s and solvers’ views only while drawing; everyone sees it at the reveal', () => {
    let s = drawing();
    const w = word(s);
    const [a] = guessers(s) as [number];
    for (const seat of allViewers(s)) {
      const j = json(s, seat);
      if (seat === s.drawer) expect(j).toContain(w);
      else for (const x of WORDS) expect(j).not.toContain(x);
    }
    s = guess(s, a, w);
    expect(json(s, a)).toContain(w);
    for (const seat of allViewers(s).filter((x) => x !== a && x !== s.drawer)) expect(json(s, seat)).not.toContain(w);
    s = act(s, { type: 'skipTurn', turn: 0 }, T1 + 100);
    for (const seat of allViewers(s)) expect(view(s, seat).word).toBe(w);
  });

  it('correct-guess text appears in nobody’s view; near misses only in the guesser’s', () => {
    let s = drawing();
    const [a, b, c] = guessers(s) as [number, number, number];
    const w = word(s);
    s = guess(s, a, `${w.toLowerCase()}s`); // correct (plural)
    s = guess(s, b, `${w.toLowerCase()}xz`, T1 + 10); // close (two typos)
    s = guess(s, c, `my ${w.toLowerCase()} lol`, T1 + 20); // contains the answer
    expect(s.solves.map((x) => x.seat)).toEqual([a]);
    for (const seat of allViewers(s)) {
      const j = json(s, seat);
      expect(j).not.toContain(`${w.toLowerCase()}s"`);
      expect(j.includes(`${w.toLowerCase()}xz`)).toBe(seat === b);
      expect(j.includes(' lol')).toBe(seat === c);
    }
    expect(view(s, null).feed).toEqual([
      { key: expect.any(String), seat: a, kind: 'solved', text: null, points: 115, only: null },
    ]);
  });

  it('views are identical whichever word is being drawn, for everyone but the drawer', () => {
    const s = drawing();
    const len = word(s).length;
    const other = s.pool.findIndex((w, i) => i !== s.word && w.text.length === len && !w.text.includes(' '));
    expect(other).toBeGreaterThanOrEqual(0);
    const alt: SketchState = { ...s, word: other };
    for (const seat of allViewers(s).filter((x) => x !== s.drawer)) {
      expect(json(alt, seat)).toBe(json(s, seat));
    }
    expect(json(alt, s.drawer)).not.toBe(json(s, s.drawer));
  });

  it('views are identical whatever was offered, for everyone but the drawer', () => {
    const s = create();
    const alt: SketchState = { ...s, choices: s.deck.slice(0, 3) };
    for (const seat of allViewers(s).filter((x) => x !== s.drawer)) expect(json(alt, seat)).toBe(json(s, seat));
  });

  it('a hidden near miss changes no one else’s view', () => {
    const s = drawing();
    const [a, b] = guessers(s) as [number, number];
    const withMiss = guess(s, a, nearMiss(word(s)));
    for (const seat of allViewers(s).filter((x) => x !== a)) expect(json(withMiss, seat)).toBe(json(s, seat));
    // ...and later public lines get the same keys either way.
    const p1 = guess(withMiss, b, 'a boat', T1 + 10);
    const p2 = guess(s, b, 'a boat', T1 + 10);
    expect(json(p1, null)).toBe(json(p2, null));
  });

  it('player-written words stay private until drawn, then show who wrote them', () => {
    let s = create({ words: { packs: [], listIds: [], perPlayer: 1 } }, { names: ['Ana', 'Ben', 'Cai'] });
    s = act(s, { type: 'collect.submit', bySeat: 0, entries: ['Grandma’s wig'] });
    for (const seat of [null, 1, 2]) expect(json(s, seat)).not.toContain('wig');
    expect(view(s, 0).collect?.yours).toEqual(['Grandma’s wig']);
    s = act(s, { type: 'collect.submit', bySeat: 1, entries: ['Robot dog'] });
    s = act(s, { type: 'collect.submit', bySeat: 2, entries: ['Lava lamp'] });
    while (s.phase === 'choose' && !s.choices.some((id) => s.pool[id]!.text.includes('wig'))) {
      s = act(s, { type: 'skipTurn', turn: s.turnNo });
    }
    const idx = s.choices.findIndex((id) => s.pool[id]!.text.includes('wig'));
    s = act(s, { type: 'choose', turn: s.turnNo, index: idx });
    s = act(s, { type: 'skipTurn', turn: s.turnNo }, T1 + 10);
    expect(view(s, null).reveal).toMatchObject({ word: 'Grandma’s wig', author: 0 });
  });

  it('never exposes the rng, deck, pool or hint plan', () => {
    const s = drawing();
    for (const seat of allViewers(s)) {
      const j = json(s, seat);
      for (const k of ['"rng"', 'deck', 'pool', 'hintOrder', 'lastGuessAt', 'order', 'boardNonce']) expect(j).not.toContain(k);
    }
  });

  it('spectators and other seats see only public feed lines', () => {
    let s = drawing();
    const [a, b] = guessers(s) as [number, number];
    s = guess(s, a, 'a cloud');
    s = guess(s, b, nearMiss(word(s)), T1 + 5);
    s = guess(s, a, word(s), T1 + 800);
    s = guess(s, a, 'easy one', T1 + 1600);
    expect(view(s, null).feed.map((e) => e.kind)).toEqual(['guess', 'solved']);
    expect(view(s, null).canType).toBe(false);
    expect(view(s, b).canType).toBe(true);
    expect(view(s, s.drawer).canType).toBe(false);
  });
});
