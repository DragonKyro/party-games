import { describe, expect, it } from 'vitest';
import { SCHEDULER, type GameConfig } from '@/engine/types';
import type { RankItAction } from './actions';
import { GRACE_MS, chooserOf, rankItModule as mod, rankerOf } from './module';
import { cleanCriterion, consensus, optionsProblem, rankerScore, readOptions, scoreOrder } from './rules';
import type { RankItState } from './state';

const NAMES = ['Ana', 'Ben', 'Cai', 'Dee'];
const range = (n: number) => Array.from({ length: n }, (_, i) => i);

function config(options: Record<string, unknown> = {}, names = NAMES, lists: Record<string, string[]> = {}): GameConfig {
  return {
    gameId: 'rank-it',
    seats: names.map((name, index) => ({ index, uuid: null, name })),
    seed: 4242,
    now: 0,
    gameOptions: { ...mod.defaultOptions(), ...options },
    lists,
  };
}

let clock = 1_000;
function act(s: RankItState, a: RankItAction, now = clock): RankItState {
  return mod.applyAction(s, a, { by: '', now });
}

const animals = { items: { packs: ['animals'], listIds: [], perPlayer: 0 } };

/** A ranker-mode game (packs only) at round 1's choose screen. */
function start(options: Record<string, unknown> = {}, names = NAMES, lists: Record<string, string[]> = {}): RankItState {
  return mod.createInitialState(config({ ...animals, ...options }, names, lists));
}

function choose(s: RankItState, option = 0): RankItState {
  return act(s, { type: 'choose', bySeat: chooserOf(s)!, round: s.round, option });
}

function submit(s: RankItState, seat: number, order: number[], now = clock): RankItState {
  return act(s, { type: 'submit', bySeat: seat, round: s.round, order }, now);
}

/** Everyone in seat order (ranker included), using `orderFor(seat)`. */
function submitAll(s: RankItState, orderFor: (seat: number) => number[]): RankItState {
  for (const seat of range(s.seats.length)) s = submit(s, seat, orderFor(seat));
  return s;
}

const guessers = (s: RankItState) => range(s.seats.length).filter((i) => i !== rankerOf(s));

// ----------------------------------------------------------------------------

describe('rules', () => {
  it('scores 2 per exact item, 1 per item one place off, +3 for a perfect order', () => {
    expect(scoreOrder([0, 1, 2, 3, 4], [0, 1, 2, 3, 4])).toEqual({ points: 13, exact: 5, near: 0, perfect: true });
    expect(scoreOrder([1, 0, 2, 3, 4], [0, 1, 2, 3, 4])).toEqual({ points: 8, exact: 3, near: 2, perfect: false });
    expect(scoreOrder([4, 3, 2, 1, 0], [0, 1, 2, 3, 4])).toEqual({ points: 2, exact: 1, near: 0, perfect: false });
    // Shifted by one: every item one place off, nothing exact.
    expect(scoreOrder([1, 2, 3, 4, 0], [0, 1, 2, 3, 4]).points).toBe(4);
    expect(scoreOrder([2, 0, 1], [0, 1, 2])).toEqual({ points: 2, exact: 0, near: 2, perfect: false });
  });

  it('builds the consensus from mean ranks, ties going to the item dealt first', () => {
    const c = consensus([[0, 1, 2], [1, 0, 2], [0, 2, 1]], 3);
    expect(c.order).toEqual([0, 1, 2]);
    expect(c.means).toEqual([1.33, 2, 2.67]);
    // Items 0 and 1 tie on 1.5 — item 0 was dealt first, so it goes first.
    expect(consensus([[1, 0, 2], [0, 1, 2]], 3).order).toEqual([0, 1, 2]);
    expect(consensus([[2, 1, 0], [2, 0, 1]], 3).order).toEqual([2, 0, 1]);
    expect(consensus([[2, 1, 0], [1, 2, 0]], 3).order).toEqual([1, 2, 0]);
  });

  it('the Ranker’s score is the guessers’ mean, rounded half up', () => {
    expect(rankerScore([13, 8])).toBe(11);
    expect(rankerScore([13, 8, 2])).toBe(8);
    expect(rankerScore([])).toBe(0);
  });

  it('reads and clamps options', () => {
    const d = readOptions({});
    expect(d.mode).toBe('ranker');
    expect(d.itemCount).toBe(5);
    expect(d.items.packs).toEqual(['everyday', 'food', 'famous', 'pop-culture', 'animals']);
    expect(d.items.perPlayer).toBe(0);
    expect(d.criteria).toEqual({ builtIn: true, spicy: false, listIds: [], perPlayer: 0 });
    const o = readOptions({ itemCount: 99, rotations: 0, rounds: 50, timeLimit: 33, mode: 'chaos', crowdPick: 'x' });
    expect([o.itemCount, o.rotations, o.rounds, o.timeLimit, o.mode, o.crowdPick]).toEqual([7, 1, 10, 0, 'ranker', 'random']);
    expect(readOptions({ itemCount: 1, timeLimit: 45 })).toMatchObject({ itemCount: 3, timeLimit: 45 });
  });

  it('explains impossible setups', () => {
    expect(optionsProblem({ items: { packs: [], listIds: [], perPlayer: 0 } }, 4)).toMatch(/items come from/);
    expect(
      optionsProblem({ criteria: { builtIn: false, spicy: false, listIds: [], perPlayer: 0 } }, 4),
    ).toMatch(/criteria come from/);
    expect(optionsProblem({ items: { packs: [], listIds: [], perPlayer: 1 }, itemCount: 5 }, 4)).toMatch(/only write 4/);
    expect(optionsProblem({ items: { packs: [], listIds: [], perPlayer: 2 }, itemCount: 5 }, 3)).toBeNull();
    expect(optionsProblem({}, 3)).toBeNull();
  });

  it('cleans a written criterion', () => {
    expect(cleanCriterion('  Most   useful at a wedding!  ')).toBe('useful at a wedding');
    expect(cleanCriterion('the most likely to bite')).toBe('likely to bite');
    expect(cleanCriterion('most')).toBe('most');
    expect(cleanCriterion(42)).toBe('');
  });
});

describe('setup', () => {
  it('deals distinct items and two criteria to the first Ranker', () => {
    const s = start();
    expect(s.phase).toBe('choose');
    expect(s.totalRounds).toBe(4);
    expect(s.dealt).toHaveLength(5);
    expect(new Set(s.dealt.map((id) => s.itemPool[id]!.text)).size).toBe(5);
    expect(s.offered).toHaveLength(2);
    expect(rankerOf(s)).toBe(s.turnOrder[0]);
    expect(chooserOf(s)).toBe(rankerOf(s));
    expect([...s.turnOrder].sort()).toEqual([0, 1, 2, 3]);
  });

  it('refuses the wrong number of players or an empty pool', () => {
    expect(() => mod.createInitialState(config(animals, ['a', 'b']))).toThrow(/3–12/);
    expect(() => mod.createInitialState(config(animals, range(13).map((i) => `p${i}`)))).toThrow(/3–12/);
    expect(() =>
      mod.createInitialState(config({ items: { packs: [], listIds: ['L'], perPlayer: 0 } }, NAMES, { L: ['a', 'b'] })),
    ).toThrow(/Only 2 items/);
  });

  it('players write items, then criteria; their items are dealt first', () => {
    let s = mod.createInitialState(
      config({
        items: { packs: ['food'], listIds: [], perPlayer: 2 },
        criteria: { builtIn: true, spicy: false, listIds: [], perPlayer: 1 },
        itemCount: 4,
      }),
    );
    expect(s.phase).toBe('collect');
    expect(s.collectStage).toBe('items');
    expect(mod.viewFor(s, 0).criteriaNext).toBe(true);
    NAMES.forEach((_, i) => (s = act(s, { type: 'collect.submit', bySeat: i, entries: [`Thing ${i}a`, `Thing ${i}b`] })));
    expect(s.phase).toBe('collect');
    expect(s.collectStage).toBe('criteria');
    NAMES.forEach((_, i) => (s = act(s, { type: 'collect.submit', bySeat: i, entries: [`Most fun ${i}`] })));
    expect(s.phase).toBe('choose');
    expect(s.dealt.every((id) => s.itemPool[id]!.author !== null)).toBe(true);
    // Written criteria are cleaned ("Most fun 1" → "fun 1") and kept away from their own author.
    const ranker = rankerOf(s)!;
    const offered = s.offered.map((id) => s.criteriaPool[id]!);
    expect(offered.every((c) => c.author !== ranker)).toBe(true);
    expect(s.criteriaPool.filter((c) => c.author !== null).map((c) => c.text).sort()).toEqual([
      'fun 0',
      'fun 1',
      'fun 2',
      'fun 3',
    ]);
  });

  it('the host can stop waiting; a short pool is topped up from Everyday', () => {
    let s = mod.createInitialState(config({ items: { packs: [], listIds: [], perPlayer: 2 }, itemCount: 5 }));
    s = act(s, { type: 'collect.submit', bySeat: 0, entries: ['Uncle Ray', 'The moon'] });
    expect(() => act(s, { type: 'collect.close', bySeat: 0 } as never)).toThrow(/host/);
    s = act(s, { type: 'collect.close' });
    expect(s.phase).toBe('choose');
    expect(s.itemPool.length).toBeGreaterThanOrEqual(5);
    expect(s.itemPool.slice(0, 2).map((e) => e.text)).toEqual(['Uncle Ray', 'The moon']);
    const dealt = s.dealt.map((id) => s.itemPool[id]!.text);
    expect(dealt).toContain('Uncle Ray');
    expect(dealt).toContain('The moon');
  });

  it('uses host lists for items and criteria', () => {
    const items = range(10).map((i) => `Gadget ${i}`);
    const s = mod.createInitialState(
      config(
        {
          items: { packs: [], listIds: ['I'], perPlayer: 0 },
          criteria: { builtIn: false, spicy: false, listIds: ['C'], perPlayer: 0 },
          itemCount: 3,
        },
        NAMES,
        { I: items, C: ['shiny on Tuesdays', 'loud in a library'] },
      ),
    );
    expect(s.dealt.every((id) => items.includes(s.itemPool[id]!.text))).toBe(true);
    expect(s.offered.map((id) => s.criteriaPool[id]!.text).sort()).toEqual(['loud in a library', 'shiny on Tuesdays']);
  });

  it('never repeats an item until the pool runs out', () => {
    const items = range(12).map((i) => `Item ${i}`);
    let s = mod.createInitialState(
      config({ items: { packs: [], listIds: ['I'], perPlayer: 0 }, itemCount: 4, rotations: 2 }, ['a', 'b', 'c'], { I: items }),
    );
    const seen: string[][] = [];
    while (s.phase !== 'gameOver') {
      seen.push(s.dealt.map((id) => s.itemPool[id]!.text));
      expect(new Set(seen[seen.length - 1]).size).toBe(4);
      s = act(s, { type: 'skipRound', round: s.round });
    }
    expect(seen).toHaveLength(6);
    expect(new Set(seen.slice(0, 3).flat()).size).toBe(12);
    expect(new Set(seen.slice(3, 6).flat()).size).toBe(12);
  });
});

describe('choosing the criterion', () => {
  it('only the chooser picks, once, for this round', () => {
    const s = start();
    const ranker = rankerOf(s)!;
    const other = (ranker + 1) % 4;
    expect(() => act(s, { type: 'choose', bySeat: other, round: 0, option: 0 })).toThrow(/Only the chooser/);
    expect(() => act(s, { type: 'choose', bySeat: ranker, round: 1, option: 0 })).toThrow(/round is over/);
    expect(() => act(s, { type: 'choose', bySeat: ranker, round: 0, option: 2 })).toThrow(/option/);
    expect(() => act(s, { type: 'choose', bySeat: 9, round: 0, option: 0 })).toThrow(/seat/);
    const picked = s.criteriaPool[s.offered[1]!]!.text;
    const left = s.offered[0]!;
    const next = choose(s, 1);
    expect(next.phase).toBe('rank');
    expect(next.criterion).toBe(picked);
    // The criterion not picked goes back to the bottom of the deck.
    expect(next.criteriaDeck[next.criteriaDeck.length - 1]).toBe(left);
    expect(() => choose(next)).toThrow(/Nobody is choosing/);
  });

  it('the Ranker can write their own (≤ 60 characters)', () => {
    const s = start();
    const ranker = rankerOf(s)!;
    const own = (text: unknown) => act(s, { type: 'writeOwn', bySeat: ranker, round: 0, text } as RankItAction);
    expect(own('Most likely to survive the washing machine').criterion).toBe('likely to survive the washing machine');
    expect(() => own('   ')).toThrow(/Write/);
    expect(() => own('?!')).toThrow(/Write/);
    expect(() => own(7)).toThrow(/Write/);
    expect(() => own('x'.repeat(61))).toThrow(/60/);
    expect(own('x'.repeat(60)).phase).toBe('rank');
    expect(() => act(s, { type: 'writeOwn', bySeat: (ranker + 1) % 4, round: 0, text: 'loud' })).toThrow(/chooser/);
  });

  it('the host can skip an absent chooser: the round is void and play moves on', () => {
    const s = start();
    expect(() => act(s, { type: 'skipRound', round: 0, bySeat: 0 } as never)).toThrow(/host/);
    const next = act(s, { type: 'skipRound', round: 0 });
    expect(next.phase).toBe('choose');
    expect(next.round).toBe(1);
    expect(next.history[0]!.voided).toBe('skipped');
    expect(next.scores).toEqual([0, 0, 0, 0]);
    expect(mod.viewFor(next, null).lastVoid).toEqual({ round: 0, reason: 'skipped', ranker: rankerOf(s) });
    expect(() => act(next, { type: 'skipRound', round: 0 })).toThrow(/round is over/);
  });
});

describe('ranking and scoring (ranker mode)', () => {
  const truth = [0, 1, 2, 3, 4];

  it('reveals once everyone has locked in, and scores guesses and the Ranker', () => {
    let s = choose(start());
    const ranker = rankerOf(s)!;
    const [g1, g2, g3] = guessers(s);
    const guess: Record<number, number[]> = { [g1!]: truth, [g2!]: [1, 0, 2, 3, 4], [g3!]: [4, 3, 2, 1, 0] };
    s = submit(s, ranker, truth);
    s = submit(s, g1!, guess[g1!]!);
    s = submit(s, g2!, guess[g2!]!);
    expect(s.phase).toBe('rank');
    s = submit(s, g3!, guess[g3!]!);
    expect(s.phase).toBe('reveal');
    expect(s.scores[g1!]).toBe(13);
    expect(s.scores[g2!]).toBe(8);
    expect(s.scores[g3!]).toBe(2);
    expect(s.scores[ranker]).toBe(8); // round(23 / 3)
    const r = mod.viewFor(s, null).reveal!;
    expect(r.truth).toEqual(truth);
    expect(r.entries[ranker]).toBeNull();
    expect(r.entries[g1!]!.result).toEqual({ points: 13, exact: 5, near: 0, perfect: true, submitted: true });
    expect(r.rankerPoints).toBe(8);
  });

  it('a re-sent order replaces the first; malformed orders are refused', () => {
    let s = choose(start());
    const g = guessers(s)[0]!;
    for (const bad of [[0, 1, 2, 3], [0, 0, 1, 2, 3], [0, 1, 2, 3, 5], [0, 1, 2, 3, 4.5], 'nope', [0, 1, 2, 3, 4, 5]]) {
      expect(() => submit(s, g, bad as never)).toThrow();
    }
    expect(() => act(s, { type: 'submit', bySeat: g, round: 3, order: truth })).toThrow(/round is over/);
    s = submit(s, g, truth);
    s = submit(s, g, [4, 3, 2, 1, 0]);
    expect(s.orders[g]).toEqual([4, 3, 2, 1, 0]);
    expect(mod.viewFor(s, g).yourOrder).toEqual([4, 3, 2, 1, 0]);
  });

  it('time up: guessers who didn’t submit score 0 and don’t drag down the Ranker', () => {
    let s = choose(start({ timeLimit: 45 }));
    const ranker = rankerOf(s)!;
    const [g1, g2, g3] = guessers(s);
    const sched = mod.nextScheduled!(s)!;
    expect(sched.at).toBe(clock + 45_000 + GRACE_MS);
    expect(sched.action).toEqual({ type: 'timeUp', round: 0 });
    s = submit(s, ranker, truth);
    s = submit(s, g1!, truth);
    s = submit(s, g2!, [1, 0, 2, 3, 4]);
    expect(() => act(s, sched.action)).toThrow(/not up/);
    expect(() => act(s, { type: 'timeUp', round: 1 }, sched.at)).toThrow(/Stale/);
    expect(() => act(s, { type: 'timeUp', round: 0, bySeat: g3 } as never, sched.at)).toThrow(/host/);
    s = mod.applyAction(s, sched.action, { by: SCHEDULER, now: sched.at });
    expect(s.phase).toBe('reveal');
    expect(s.scores[g3!]).toBe(0);
    expect(s.scores[ranker]).toBe(11); // round((13 + 8) / 2)
    expect(mod.viewFor(s, null).reveal!.entries[g3!]).toEqual({
      order: null,
      result: { points: 0, exact: 0, near: 0, perfect: false, submitted: false },
    });
    expect(mod.nextScheduled!(s)).toBeNull();
  });

  it('a ranking just after the buzzer counts; one after the grace window doesn’t', () => {
    const s = choose(start({ timeLimit: 60 }));
    const end = s.timer!.endsAt!;
    const g = guessers(s)[0]!;
    expect(() => submit(s, g, truth, end + GRACE_MS - 1)).not.toThrow();
    expect(() => submit(s, g, truth, end + GRACE_MS)).toThrow(/Time/);
  });

  it('if the Ranker never locks in, the round is void and play moves on', () => {
    let s = choose(start({ timeLimit: 60 }));
    const ranker = rankerOf(s)!;
    for (const g of guessers(s)) s = submit(s, g, truth);
    expect(s.phase).toBe('rank');
    const sched = mod.nextScheduled!(s)!;
    s = mod.applyAction(s, sched.action, { by: SCHEDULER, now: sched.at });
    expect(s.phase).toBe('choose');
    expect(s.round).toBe(1);
    expect(s.scores).toEqual([0, 0, 0, 0]);
    expect(s.history[0]!.voided).toBe('noRanker');
    // The void round's guesses are dropped, never revealed.
    expect(s.history[0]!.orders.every((o) => o === null)).toBe(true);
    const v = mod.viewFor(s, null);
    expect(v.lastVoid).toEqual({ round: 0, reason: 'noRanker', ranker });
    expect(v.reveal).toBeNull();
  });

  it('the host can force the reveal; missing guesses score 0', () => {
    let s = choose(start());
    const ranker = rankerOf(s)!;
    const [g1] = guessers(s);
    s = submit(s, ranker, truth);
    s = submit(s, g1!, truth);
    expect(() => act(s, { type: 'reveal', round: 0, bySeat: ranker } as never)).toThrow(/host/);
    expect(() => act(s, { type: 'reveal', round: 1 })).toThrow(/round is over/);
    s = act(s, { type: 'reveal', round: 0 });
    expect(s.phase).toBe('reveal');
    expect(s.scores[g1!]).toBe(13);
    expect(s.scores[ranker]).toBe(13);
    expect(s.scores.filter((x) => x === 0)).toHaveLength(2);
    expect(() => act(s, { type: 'reveal', round: 0 })).toThrow(/Nothing to reveal/);
  });

  it('pausing freezes the clock and the schedule', () => {
    let s = choose(start({ timeLimit: 90 }));
    s = act(s, { type: 'pause' }, clock + 30_000);
    expect(mod.nextScheduled!(s)).toBeNull();
    expect(() => act(s, { type: 'pause', bySeat: 0 } as never)).toThrow(/host/);
    s = act(s, { type: 'resume' }, clock + 400_000);
    expect(mod.nextScheduled!(s)!.at).toBe(clock + 400_000 + 60_000 + GRACE_MS);
    expect(() => act(choose(start()), { type: 'pause' })).toThrow(/Nothing to pause/);
  });

  it('everyone is Ranker `rotations` times, then the game ends', () => {
    let s = start({ rotations: 2 }, ['a', 'b', 'c']);
    expect(s.totalRounds).toBe(6);
    const rankers: number[] = [];
    while (s.phase !== 'gameOver') {
      rankers.push(rankerOf(s)!);
      s = submitAll(choose(s), () => [0, 1, 2, 3, 4]);
      expect(s.phase).toBe('reveal');
      expect(() => act(s, { type: 'next', round: s.round, bySeat: 0 } as never)).toThrow(/host/);
      expect(() => act(s, { type: 'next', round: s.round + 1 })).toThrow(/round is over/);
      s = act(s, { type: 'next', round: s.round });
    }
    expect(rankers).toEqual([...s.turnOrder, ...s.turnOrder]);
    expect(mod.isFinished(s)).toBe(true);
    // Everyone guessed perfectly every round: 13 a round, as guesser or Ranker.
    expect(s.scores).toEqual([78, 78, 78]);
  });

  it('the host can end early', () => {
    const s = act(choose(start()), { type: 'finish' });
    expect(s.phase).toBe('gameOver');
    expect(() => act(s, { type: 'finish' })).toThrow(/over/);
    expect(() => act(start(), { type: 'finish', bySeat: 1 } as never)).toThrow(/host/);
  });
});

describe('crowd mode', () => {
  const crowd = { mode: 'crowd', itemCount: 3, rounds: 3 };

  it('draws a criterion and goes straight to ranking; scores against the consensus', () => {
    let s = start(crowd, ['a', 'b', 'c']);
    expect(s.phase).toBe('rank');
    expect(s.criterion).toBeTruthy();
    expect(rankerOf(s)).toBeNull();
    expect(chooserOf(s)).toBeNull();
    expect(s.totalRounds).toBe(3);
    const orders = [[0, 1, 2], [1, 0, 2], [0, 2, 1]];
    s = submitAll(s, (seat) => orders[seat]!);
    expect(s.phase).toBe('reveal');
    expect(s.scores).toEqual([9, 4, 4]);
    const r = mod.viewFor(s, null).reveal!;
    expect(r.truth).toEqual([0, 1, 2]);
    expect(r.means).toEqual([1.33, 2, 2.67]);
    expect(r.ranker).toBeNull();
    expect(r.rankerPoints).toBeNull();
  });

  it('ties in the mean go to the item dealt first; non-rankers score 0 and don’t count', () => {
    let s = start(crowd, ['a', 'b', 'c']);
    s = submit(s, 0, [1, 0, 2]);
    s = submit(s, 1, [0, 1, 2]);
    s = act(s, { type: 'reveal', round: 0 });
    expect(s.history[0]!.truth).toEqual([0, 1, 2]);
    expect(s.scores).toEqual([4, 9, 0]);
  });

  it('a round with fewer than two rankings is void', () => {
    let s = start(crowd, ['a', 'b', 'c']);
    s = submit(s, 0, [0, 1, 2]);
    s = act(s, { type: 'reveal', round: 0 });
    expect(s.history[0]!.voided).toBe('tooFew');
    expect(s.phase).toBe('rank');
    expect(s.round).toBe(1);
    expect(s.scores).toEqual([0, 0, 0]);
  });

  it('plays a fixed number of rounds', () => {
    let s = start({ ...crowd, rounds: 4 }, ['a', 'b', 'c', 'd', 'e']);
    for (let r = 0; r < 4; r++) {
      expect(s.round).toBe(r);
      s = act(submitAll(s, () => [2, 1, 0]), { type: 'next', round: r });
    }
    expect(s.phase).toBe('gameOver');
    expect(s.scores).toEqual([36, 36, 36, 36, 36]);
  });

  it('with a rotating chooser, the chooser picks and then ranks too', () => {
    let s = start({ ...crowd, crowdPick: 'chooser' }, ['a', 'b', 'c']);
    expect(s.phase).toBe('choose');
    const chooser = chooserOf(s)!;
    expect(rankerOf(s)).toBeNull();
    s = choose(s);
    s = submitAll(s, () => [0, 1, 2]);
    expect(s.phase).toBe('reveal');
    expect(s.scores[chooser]).toBe(9);
    s = act(s, { type: 'next', round: 0 });
    expect(chooserOf(s)).toBe(s.turnOrder[1]);
  });
});

describe('results', () => {
  it('awards the best guesser and the most readable Ranker', () => {
    let s = start({ itemCount: 3 }, ['a', 'b', 'c']);
    const t = s.turnOrder;
    // Round 1: everyone reads t[0] perfectly. Rounds 2–3: t[1] and t[2] are unreadable, except to t[0].
    s = act(submitAll(choose(s), () => [0, 1, 2]), { type: 'next', round: 0 });
    s = submitAll(choose(s), (seat) => (seat === t[1] || seat === t[0] ? [0, 1, 2] : [2, 0, 1]));
    s = act(s, { type: 'next', round: 1 });
    s = submitAll(choose(s), (seat) => (seat === t[2] || seat === t[0] ? [0, 1, 2] : [1, 2, 0]));
    s = act(s, { type: 'next', round: 2 });
    expect(s.phase).toBe('gameOver');
    const r = mod.viewFor(s, null).results!;
    const award = (title: string) => r.awards.find((a) => a.title === title);
    expect(award('Mind reader')!.seats).toEqual([t[0]]);
    expect(award('Open book')!.seats).toEqual([t[0]]);
    expect(award('Bullseye')!.seats).toEqual([t[0]]);
    expect(r.rounds).toHaveLength(3);
    expect(r.rounds[0]!.ranked).toHaveLength(3);
  });

  it('reveals who wrote what only at the end', () => {
    let s = mod.createInitialState(config({ items: { packs: ['food'], listIds: [], perPlayer: 1 } }, ['a', 'b', 'c']));
    s = act(s, { type: 'collect.submit', bySeat: 0, entries: ['Grandma’s lasagna'] });
    s = act(s, { type: 'collect.submit', bySeat: 1, entries: ['The office printer'] });
    s = act(s, { type: 'collect.submit', bySeat: 2, entries: ['A haunted canoe'] });
    s = act(s, { type: 'finish' });
    const written = mod.viewFor(s, null).results!.written;
    expect(written).toContainEqual({ text: 'Grandma’s lasagna', author: 'a', kind: 'items' });
    expect(written).toHaveLength(3);
  });
});

describe('hidden information', () => {
  const seatsAndSpectator = (s: RankItState) => [null, ...range(s.seats.length)];

  it('only the chooser sees the criteria on offer', () => {
    const s = start({ criteria: { builtIn: false, spicy: false, listIds: ['C'], perPlayer: 0 } }, NAMES, {
      C: ['zqx shiny', 'zqx sneaky', 'zqx sticky', 'zqx loud', 'zqx weird'],
    });
    const chooser = chooserOf(s)!;
    const offered = s.offered.map((id) => s.criteriaPool[id]!.text);
    expect(mod.viewFor(s, chooser).yourOptions).toEqual(offered);
    expect(JSON.stringify(mod.viewFor(s, chooser)).match(/zqx/g)).toHaveLength(2);
    for (const seat of seatsAndSpectator(s).filter((x) => x !== chooser)) {
      const v = mod.viewFor(s, seat);
      expect(v.yourOptions).toBeNull();
      expect(JSON.stringify(v)).not.toContain('zqx');
    }
    // The dealt items are public during the choice.
    expect(mod.viewFor(s, null).items).toHaveLength(5);
  });

  it('redacted views are identical whichever criteria are on offer', () => {
    const a = start();
    const spare = a.criteriaDeck.slice(0, 2);
    const b: RankItState = { ...a, offered: spare, criteriaDeck: [...a.offered, ...a.criteriaDeck.slice(2)] };
    const chooser = chooserOf(a)!;
    for (const seat of seatsAndSpectator(a).filter((x) => x !== chooser)) {
      expect(JSON.stringify(mod.viewFor(a, seat))).toBe(JSON.stringify(mod.viewFor(b, seat)));
    }
  });

  it('nobody sees the Ranker’s order or anyone else’s guess before the reveal', () => {
    let s = choose(start());
    const ranker = rankerOf(s)!;
    const [g1, g2] = guessers(s);
    s = submit(s, ranker, [3, 1, 4, 0, 2]);
    s = submit(s, g1!, [2, 4, 0, 1, 3]);
    expect(mod.viewFor(s, ranker).yourOrder).toEqual([3, 1, 4, 0, 2]);
    expect(mod.viewFor(s, g1!).yourOrder).toEqual([2, 4, 0, 1, 3]);
    for (const seat of [null, g2!]) {
      const v = mod.viewFor(s, seat);
      expect(v.yourOrder).toBeNull();
      const json = JSON.stringify(v);
      expect(json).not.toContain('[3,1,4,0,2]');
      expect(json).not.toContain('[2,4,0,1,3]');
    }
    expect(JSON.stringify(mod.viewFor(s, ranker))).not.toContain('[2,4,0,1,3]');
    expect(JSON.stringify(mod.viewFor(s, g1!))).not.toContain('[3,1,4,0,2]');
    expect(JSON.stringify(mod.viewFor(s, null))).not.toContain('"orders"');
  });

  it('views are identical whatever the hidden orders are; lock-in status is public', () => {
    const base = choose(start());
    const ranker = rankerOf(base)!;
    const [g1, g2] = guessers(base);
    const a = submit(submit(base, ranker, [0, 1, 2, 3, 4]), g1!, [0, 1, 2, 3, 4]);
    const b = submit(submit(base, ranker, [4, 3, 2, 1, 0]), g1!, [1, 0, 3, 2, 4]);
    for (const seat of [null, g2!]) {
      expect(JSON.stringify(mod.viewFor(a, seat))).toBe(JSON.stringify(mod.viewFor(b, seat)));
    }
    const submitted = mod.viewFor(a, null).submitted;
    expect(submitted[ranker]).toBe(true);
    expect(submitted[g1!]).toBe(true);
    expect(submitted[g2!]).toBe(false);
  });

  it('everything comes out at the reveal', () => {
    let s = choose(start());
    s = submitAll(s, (seat) => (seat === rankerOf(s) ? [3, 1, 4, 0, 2] : [2, 4, 0, 1, 3]));
    for (const seat of seatsAndSpectator(s)) {
      const json = JSON.stringify(mod.viewFor(s, seat).reveal);
      expect(json).toContain('[3,1,4,0,2]');
      expect(json).toContain('[2,4,0,1,3]');
    }
  });

  it('player-written entries stay private until they’re dealt', () => {
    let s = mod.createInitialState(
      config({
        items: { packs: [], listIds: [], perPlayer: 5 },
        criteria: { builtIn: true, spicy: false, listIds: [], perPlayer: 1 },
        itemCount: 3,
      }),
    );
    const mine = (i: number) => range(5).map((j) => `Secret${i}x${j}`);
    s = act(s, { type: 'collect.submit', bySeat: 0, entries: mine(0) });
    expect(mod.viewFor(s, 0).collect!.yours).toEqual(mine(0));
    for (const seat of [null, 1, 2, 3]) expect(JSON.stringify(mod.viewFor(s, seat))).not.toContain('Secret0');
    for (const i of [1, 2, 3]) s = act(s, { type: 'collect.submit', bySeat: i, entries: mine(i) });
    s = act(s, { type: 'collect.submit', bySeat: 0, entries: ['Hushhush crit'] });
    for (const seat of [null, 1, 2, 3]) expect(JSON.stringify(mod.viewFor(s, seat))).not.toContain('Hushhush');
    for (const i of [1, 2, 3]) s = act(s, { type: 'collect.submit', bySeat: i, entries: [`Hushhush crit ${i}`] });
    expect(s.phase).toBe('choose');
    const dealt = s.dealt.map((id) => s.itemPool[id]!.text);
    const undealt = s.itemPool.map((e) => e.text).filter((t) => !dealt.includes(t));
    expect(undealt).toHaveLength(17);
    for (const seat of seatsAndSpectator(s)) {
      const json = JSON.stringify(mod.viewFor(s, seat));
      for (const t of dealt) expect(json).toContain(t);
      for (const t of undealt) expect(json).not.toContain(t);
    }
    // Criteria: only the chooser sees the two offered; nobody sees the rest.
    const chooser = chooserOf(s)!;
    const offered = s.offered.map((id) => s.criteriaPool[id]!.text);
    for (const seat of seatsAndSpectator(s)) {
      const json = JSON.stringify(mod.viewFor(s, seat));
      const visible = s.criteriaPool.filter((c) => c.author !== null && json.includes(`"${c.text}"`)).map((c) => c.text);
      expect(visible.sort()).toEqual(seat === chooser ? offered.filter((t) => t.startsWith('Hushhush')).sort() : []);
    }
  });

  it('never exposes the rng, the pools or the decks', () => {
    const s = choose(start());
    for (const seat of seatsAndSpectator(s)) {
      const json = JSON.stringify(mod.viewFor(s, seat));
      for (const key of ['"rng"', 'Pool', 'Deck', '"offered"', '"dealt"', '"turnOrder"']) expect(json).not.toContain(key);
    }
    const shuffled: RankItState = { ...s, itemDeck: s.itemDeck.slice().reverse(), criteriaDeck: s.criteriaDeck.slice().reverse() };
    for (const seat of seatsAndSpectator(s)) {
      expect(JSON.stringify(mod.viewFor(shuffled, seat))).toBe(JSON.stringify(mod.viewFor(s, seat)));
    }
  });

  it('out-of-range seats get the spectator view', () => {
    const s = start();
    expect(JSON.stringify(mod.viewFor(s, 99))).toBe(JSON.stringify(mod.viewFor(s, null)));
  });
});
