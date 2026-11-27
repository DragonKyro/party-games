import { describe, expect, it } from 'vitest';
import type { GameConfig, SeatIndex } from '@/engine/types';
import { entryKey } from '@/words/source';
import type { ForeheadAction } from './actions';
import { foreheadModule as mod, guesserAt } from './module';
import { GET_READY_MS, GRACE_MS, cardsNeeded, readOptions } from './rules';
import type { ForeheadState } from './state';

const NAMES = ['Ana', 'Ben', 'Cai', 'Dee'];

function config(
  options: Record<string, unknown> = {},
  { names = NAMES, online = false, lists = {} as Record<string, string[]> } = {},
): GameConfig {
  return {
    gameId: 'forehead',
    seats: names.map((name, index) => ({ index, uuid: online ? `uid-${index}` : null, name })),
    seed: 4242,
    now: 0,
    gameOptions: { ...mod.defaultOptions(), ...options },
    lists,
  };
}

const T0 = 1_000;
/** When the first card of a turn begun at T0 goes up, and when its buzzer goes. */
const START = T0 + GET_READY_MS;
const END = START + 60_000;

function act(s: ForeheadState, a: ForeheadAction, now = T0): ForeheadState {
  return mod.applyAction(s, a, { by: '', now });
}

const packsOnly = { words: { packs: ['animals'], listIds: [], perPlayer: 0 } };

function create(options: Record<string, unknown> = packsOnly, opts: Parameters<typeof config>[1] = {}): ForeheadState {
  return mod.createInitialState(config(options, opts));
}

/** start → 3-2-1 → first card, beginning at `now`. */
function begin(s: ForeheadState, now = T0): ForeheadState {
  s = act(s, { type: 'start', turn: s.turnNo }, now);
  return act(s, { type: 'go', turn: s.turnNo }, now + GET_READY_MS);
}

function mark(s: ForeheadState, kind: 'correct' | 'pass', by: SeatIndex = guesserAt(s), now = START + 1000): ForeheadState {
  return act(s, { type: kind, bySeat: by, card: s.current!.no }, now);
}

/** A seat that isn't the guesser. */
function other(s: ForeheadState, k = 1): SeatIndex {
  return (guesserAt(s) + k) % s.seats.length;
}

const allSeats = (s: ForeheadState): Array<SeatIndex | null> => [null, ...s.seats.map((x) => x.index)];
const json = (s: ForeheadState, seat: SeatIndex | null) => JSON.stringify(mod.viewFor(s, seat));
const has = (j: string, text: string) => j.includes(JSON.stringify(text));

// ============================================================================

describe('options and setup', () => {
  it('coerces untrusted options into range', () => {
    expect(readOptions({ turnSeconds: 5, rounds: 9, display: 'tv' })).toMatchObject({
      turnSeconds: 30,
      rounds: 3,
      display: 'forehead',
    });
    expect(readOptions({ turnSeconds: 500, rounds: 0, display: 'others' })).toMatchObject({
      turnSeconds: 120,
      rounds: 1,
      display: 'others',
    });
    expect(readOptions(undefined).words).toEqual({ packs: ['famous', 'pop-culture', 'animals'], listIds: [], perPlayer: 0 });
    expect(mod.optionsProblem!({ words: { packs: [], listIds: [], perPlayer: 0 } }, 4)).toMatch(/cards come from/);
    expect(mod.optionsProblem!({}, 1)).toMatch(/at least 2/);
    expect(mod.optionsProblem!({}, 2)).toBeNull();
  });

  it('deals straight to the first guesser from packs, with a deduped deck and everyone in the order', () => {
    const s = create();
    expect(s.phase).toBe('ready');
    expect(s.cards.length).toBeGreaterThan(50);
    expect(new Set(s.cards.map((c) => entryKey(c.text))).size).toBe(s.cards.length);
    expect(s.deck.slice().sort((a, b) => a - b)).toEqual(s.cards.map((c) => c.id));
    expect(s.order.slice().sort()).toEqual([0, 1, 2, 3]);
    expect(s.cards.every((c) => c.author === null)).toBe(true);
    const v = mod.viewFor(s, null);
    expect(v.guesser).toBe(s.order[0]);
    expect(v.totalTurns).toBe(4);
    expect(v.deckLeft).toBe(s.deck.length);
  });

  it('forces forehead mode on a single device; online keeps "others"', () => {
    expect(create({ ...packsOnly, display: 'others' }).display).toBe('forehead');
    expect(create({ ...packsOnly, display: 'others' }, { online: true }).display).toBe('others');
    expect(create(packsOnly, { online: true }).display).toBe('forehead');
  });

  it('collects player cards, keeps their authors, and mixes them near the top of a big deck', () => {
    let s = create({ words: { packs: ['famous', 'animals'], listIds: [], perPlayer: 2 } });
    expect(s.phase).toBe('collect');
    NAMES.forEach((_, i) => {
      s = act(s, { type: 'collect.submit', bySeat: i, entries: [`Secret ${i}a`, `Secret ${i}b`] });
    });
    expect(s.phase).toBe('ready');
    const written = s.cards.filter((c) => c.author !== null);
    expect(written).toHaveLength(8);
    for (const c of written) expect(c.text.startsWith(`Secret ${c.author}`)).toBe(true);
    const needed = cardsNeeded(s.options, 4);
    for (const c of written) expect(s.deck.indexOf(c.id)).toBeLessThan(needed);
    expect(s.topUp).toEqual([]);
  });

  it('lets only the host stop waiting for writers', () => {
    let s = create({ words: { packs: [], listIds: [], perPlayer: 2 } });
    s = act(s, { type: 'collect.submit', bySeat: 0, entries: ['Grandma', 'The office printer'] });
    expect(() => act(s, { type: 'collect.close', bySeat: 1 } as never)).toThrow(/host/);
    s = act(s, { type: 'collect.close' });
    expect(s.phase).toBe('ready');
    expect(s.cards.map((c) => c.text).sort()).toEqual(['Grandma', 'The office printer']);
  });

  it('refuses impossible setups', () => {
    expect(() => create(packsOnly, { names: ['Solo'] })).toThrow(/2–20/);
    expect(() => create({ words: { packs: [], listIds: [], perPlayer: 0 } })).toThrow(/cards come from/);
    expect(() =>
      create({ words: { packs: [], listIds: ['L'], perPlayer: 0 } }, { lists: { L: ['One', 'Two', 'Three'] } }),
    ).toThrow(/Only 3 cards/);
    const fromList = create({ words: { packs: [], listIds: ['L'], perPlayer: 0 } }, {
      lists: { L: Array.from({ length: 12 }, (_, i) => `Inside joke ${i}`) },
    });
    expect(fromList.cards).toHaveLength(12);
  });
});

// ============================================================================

describe('dealing', () => {
  it('never deals a guesser a card they wrote', () => {
    let s = create({ words: { packs: [], listIds: [], perPlayer: 3 }, rounds: 2 }, { names: ['Ana', 'Ben', 'Cai'] });
    ['Ana', 'Ben', 'Cai'].forEach((name, i) => {
      s = act(s, { type: 'collect.submit', bySeat: i, entries: [`${name} one`, `${name} two`, `${name} three`] });
    });
    let dealt = 0;
    while (s.phase === 'ready') {
      const g = guesserAt(s);
      if (mod.viewFor(s, null).outOfCards) {
        s = act(s, { type: 'skipPlayer' });
        continue;
      }
      s = begin(s);
      while (s.phase === 'turn') {
        expect(s.cards[s.current!.id]!.author).not.toBe(g);
        dealt++;
        s = mark(s, 'pass');
      }
      expect(s.history[s.history.length - 1]!.end).toBe('deck');
      if (s.phase === 'turnResults') s = act(s, { type: 'next', turn: s.turnNo });
    }
    expect(dealt).toBe(9);
    expect(s.phase).toBe('gameOver');
  });

  it('never repeats a card within a match', () => {
    let s = create({ ...packsOnly, rounds: 3, turnSeconds: 30 }, { names: ['Ana', 'Ben'] });
    while (s.phase !== 'gameOver') {
      s = begin(s);
      for (let k = 0; k < 6 && s.phase === 'turn'; k++) s = mark(s, k % 2 ? 'pass' : 'correct');
      s = act(s, { type: 'timeUp', turn: s.turnNo }, START + 30_000);
      s = act(s, { type: 'next', turn: s.turnNo });
    }
    const ids = s.history.flatMap((t) => t.cards.map((c) => c.id));
    expect(ids).toHaveLength(6 * 7);
    expect(new Set(ids).size).toBe(ids.length);
    expect(s.history.map((t) => t.cards.map((c) => c.no)).flat()).toEqual(ids.map((_, i) => i + 1));
  });

  it('says when the deck runs low, ends the turn when it runs out, then the match', () => {
    const words = Array.from({ length: 10 }, (_, i) => `Card ${i}`);
    let s = create({ words: { packs: [], listIds: ['L'], perPlayer: 0 }, rounds: 3 }, { names: ['Ana', 'Ben'], lists: { L: words } });
    expect(mod.viewFor(s, null).lowDeck).toBe(true);
    s = begin(s);
    for (let i = 0; i < 10; i++) s = mark(s, i < 4 ? 'correct' : 'pass');
    expect(s.phase).toBe('turnResults');
    expect(s.history[0]!.end).toBe('deck');
    const v = mod.viewFor(s, null);
    expect(v.deckLeft).toBe(0);
    expect(v.upNext).toBeNull();
    expect(v.lastTurn!.cards).toHaveLength(10);
    s = act(s, { type: 'next', turn: s.turnNo });
    expect(s.phase).toBe('gameOver');
    expect(mod.viewFor(s, null).results!.ranOut).toBe(true);
  });

  it('flags a guesser with only their own cards left; the host can skip them', () => {
    let s = create({ words: { packs: [], listIds: [], perPlayer: 2 } });
    NAMES.forEach((name, i) => {
      s = act(s, { type: 'collect.submit', bySeat: i, entries: [`${name} x`, `${name} y`] });
    });
    const g = guesserAt(s);
    s = { ...s, deck: s.deck.filter((id) => s.cards[id]!.author === g) };
    expect(mod.viewFor(s, null).outOfCards).toBe(true);
    expect(() => act(s, { type: 'start', turn: 0 })).toThrow(/No cards left/);
    s = act(s, { type: 'skipPlayer' });
    expect(guesserAt(s)).not.toBe(g);
    expect(mod.viewFor(s, null).outOfCards).toBe(false);
  });
});

// ============================================================================

describe('turns', () => {
  it('only the guesser (or the host) starts, with the current turn token', () => {
    const s = create();
    const g = guesserAt(s);
    expect(() => act(s, { type: 'start', bySeat: other(s), turn: 0 })).toThrow(/not your turn/);
    expect(() => act(s, { type: 'start', bySeat: g, turn: 3 })).toThrow(/Stale/);
    expect(() => act(s, { type: 'start', bySeat: 99, turn: 0 })).toThrow(/Unknown seat/);
    const a = act(s, { type: 'start', bySeat: g, turn: 0 });
    const b = act(s, { type: 'start', turn: 0 });
    expect(a.phase).toBe('getReady');
    expect(b.phase).toBe('getReady');
    expect(a.countdown).toEqual({ durationMs: GET_READY_MS, endsAt: T0 + GET_READY_MS, remainingMs: GET_READY_MS });
    expect(() => act(a, { type: 'start', bySeat: g, turn: 0 })).toThrow(/Not ready/);
  });

  it('the 3-2-1 is a scheduled action; the first card goes up when it ends', () => {
    let s = act(create(), { type: 'start', turn: 0 });
    const sched = mod.nextScheduled!(s)!;
    expect(sched).toEqual({ at: T0 + GET_READY_MS, action: { type: 'go', turn: 0 } });
    expect(() => act(s, sched.action, T0 + 1000)).toThrow(/Not yet/);
    expect(() => act(s, { type: 'go', turn: 1 }, sched.at)).toThrow(/Stale/);
    expect(() => act(s, { type: 'go', bySeat: 0, turn: 0 } as never, sched.at)).toThrow(/host/);
    s = mod.applyAction(s, sched.action, { by: 'host:scheduler', now: sched.at });
    expect(s.phase).toBe('turn');
    expect(s.current).toEqual({ id: expect.any(Number), no: 1 });
    expect(s.timer).toEqual({ durationMs: 60_000, endsAt: END, remainingMs: 60_000 });
    expect(mod.nextScheduled!(s)).toEqual({ at: END, action: { type: 'timeUp', turn: 0 } });
    expect(mod.nextScheduled!(create())).toBeNull();
  });

  it('forehead mode: only the guesser marks cards, by token, and a double tap counts once', () => {
    let s = begin(create());
    const g = guesserAt(s);
    const first = s.current!.no;
    expect(() => mark(s, 'correct', other(s))).toThrow(/Only the guesser/);
    expect(() => act(s, { type: 'correct', bySeat: g, card: first + 5 }, START + 500)).toThrow(/gone/);
    expect(() => act(s, { type: 'correct', bySeat: g, card: 'x' as never }, START + 500)).toThrow(/Which card/);
    s = mark(s, 'correct');
    expect(s.current!.no).toBe(first + 1);
    expect(() => act(s, { type: 'correct', bySeat: g, card: first }, START + 600)).toThrow(/gone/);
    s = mark(s, 'pass');
    s = mark(s, 'correct');
    const v = mod.viewFor(s, null);
    expect(v.turnCorrect).toBe(2);
    expect(v.turnPassed).toBe(1);
    expect(v.scores[g]).toBe(2);
    expect(s.turnCards.map((c) => c.got)).toEqual([true, false, true]);
  });

  it('"others" mode: any clue-giver marks correct, simultaneous taps count once, the guesser can only pass', () => {
    let s = begin(create({ ...packsOnly, display: 'others' }, { online: true }));
    expect(s.display).toBe('others');
    const g = guesserAt(s);
    const card = s.current!.no;
    expect(() => mark(s, 'correct', g)).toThrow(/friends/);
    const after = act(s, { type: 'correct', bySeat: other(s, 1), card }, START + 900);
    // A second clue-giver tapping the same card a moment later is refused.
    expect(() => act(after, { type: 'correct', bySeat: other(s, 2), card }, START + 950)).toThrow(/gone/);
    expect(() => act(after, { type: 'pass', bySeat: other(s, 2), card }, START + 950)).toThrow(/gone/);
    s = mark(after, 'pass', g);
    s = mark(s, 'pass', other(s, 3));
    expect(s.turnCards.map((c) => c.got)).toEqual([true, false, false]);
    expect(mod.viewFor(s, null).scores[g]).toBe(1);
  });

  it('the buzzer ends the turn; the card that was up counts as a miss', () => {
    let s = begin(create());
    s = mark(s, 'correct');
    s = mark(s, 'pass');
    const up = s.current!.no;
    expect(() => act(s, { type: 'timeUp', turn: 0 }, END - 1)).toThrow(/not up/);
    expect(() => act(s, { type: 'timeUp', turn: 2 }, END)).toThrow(/Stale/);
    s = mod.applyAction(s, mod.nextScheduled!(s)!.action, { by: 'host:scheduler', now: END });
    expect(s.phase).toBe('turnResults');
    expect(s.buzzer).toEqual({ no: up, at: END });
    const v = mod.viewFor(s, null);
    expect(v.lastTurn!.cards.map((c) => c.got)).toEqual([true, false, false]);
    expect(v.lastTurn!.end).toBe('time');
    expect(v.upNext).toBe(guesserAt(s, 1));
    expect(v.timer).toBeNull();
    expect(mod.nextScheduled!(s)).toBeNull();
  });

  it('a "correct" racing the buzzer counts inside the grace window, and not after', () => {
    const s = begin(create());
    const g = guesserAt(s);
    const up = s.current!.no;
    // Before the scheduler fires: counts, and no new card is dealt after the buzzer.
    const early = act(s, { type: 'correct', bySeat: g, card: up }, END + 200);
    expect(early.phase).toBe('turnResults');
    expect(early.history[0]!.cards).toEqual([{ id: s.current!.id, no: up, got: true }]);
    expect(() => act(s, { type: 'correct', bySeat: g, card: up }, END + GRACE_MS + 1)).toThrow(/Time/);

    // After the scheduler fired: flips the card that was up.
    const over = act(s, { type: 'timeUp', turn: 0 }, END);
    const flipped = act(over, { type: 'correct', bySeat: g, card: up }, END + GRACE_MS);
    expect(flipped.history[0]!.cards[0]!.got).toBe(true);
    expect(mod.viewFor(flipped, null).scores[g]).toBe(1);
    expect(flipped.buzzer).toBeNull();
    expect(() => act(flipped, { type: 'correct', bySeat: g, card: up }, END + 100)).toThrow(/Time/);
    expect(() => act(over, { type: 'pass', bySeat: g, card: up }, END + 100)).toThrow(/Time/);
    expect(() => act(over, { type: 'correct', bySeat: g, card: up - 1 }, END + 100)).toThrow(/Time/);
    expect(() => act(over, { type: 'correct', bySeat: other(s), card: up }, END + 100)).toThrow(/Only the guesser/);
    expect(() => act(over, { type: 'correct', bySeat: g, card: up }, END + GRACE_MS + 1)).toThrow(/Time/);
  });

  it('pause / resume: host or guesser; no marking while paused; the schedule freezes', () => {
    let s = begin(create());
    const g = guesserAt(s);
    expect(() => act(s, { type: 'pause', bySeat: other(s) }, START + 10_000)).toThrow(/guesser or the host/);
    s = act(s, { type: 'pause', bySeat: g }, START + 10_000);
    expect(mod.nextScheduled!(s)).toBeNull();
    expect(() => mark(s, 'correct', g, START + 11_000)).toThrow(/paused/);
    expect(() => act(s, { type: 'pause' }, START + 11_000)).toThrow(/Already/);
    s = act(s, { type: 'resume' }, START + 500_000);
    expect(mod.nextScheduled!(s)!.at).toBe(START + 500_000 + 50_000);
    expect(() => act(s, { type: 'resume' }, START + 500_001)).toThrow(/Not paused/);
    expect(() => act(create(), { type: 'pause' })).toThrow(/Nothing/);
  });

  it('stopping: cancels the 3-2-1 back to ready, or ends a turn early', () => {
    const counting = act(create(), { type: 'start', turn: 0 });
    expect(() => act(counting, { type: 'stopTurn', bySeat: other(counting) })).toThrow(/guesser or the host/);
    const back = act(counting, { type: 'stopTurn', bySeat: guesserAt(counting) });
    expect(back.phase).toBe('ready');
    expect(mod.nextScheduled!(back)).toBeNull();

    let s = mark(begin(create()), 'correct');
    s = act(s, { type: 'stopTurn' }, START + 5000);
    expect(s.phase).toBe('turnResults');
    expect(s.history[0]!.end).toBe('stopped');
    expect(s.history[0]!.cards.map((c) => c.got)).toEqual([true, false]);
    expect(s.buzzer).toBeNull();
  });

  it('everyone guesses once per round, in order, then the match ends', () => {
    let s = create({ ...packsOnly, rounds: 2 });
    const seen: Array<[SeatIndex, number]> = [];
    while (s.phase !== 'gameOver') {
      const v = mod.viewFor(s, null);
      seen.push([v.guesser!, v.round]);
      s = mark(begin(s), 'correct');
      s = act(s, { type: 'timeUp', turn: s.turnNo }, END);
      expect(() => act(s, { type: 'next', bySeat: other(s), turn: s.turnNo })).toThrow(/guesser or the host/);
      expect(() => act(s, { type: 'next', turn: s.turnNo + 1 })).toThrow(/Stale/);
      s = act(s, { type: 'next', bySeat: guesserAt(s), turn: s.turnNo });
    }
    expect(seen).toEqual([...s.order.map((g) => [g, 0]), ...s.order.map((g) => [g, 1])]);
    expect(mod.isFinished(s)).toBe(true);
    const v = mod.viewFor(s, null);
    expect(v.scores).toEqual([2, 2, 2, 2]);
    expect(v.results!.turns).toHaveLength(8);
    expect(v.results!.ranOut).toBe(false);
  });

  it('the host skips a player between turns only', () => {
    let s = create();
    const first = guesserAt(s);
    expect(() => act(s, { type: 'skipPlayer', bySeat: 0 } as never)).toThrow(/host/);
    s = act(s, { type: 'skipPlayer' });
    expect(guesserAt(s)).not.toBe(first);
    s = act(s, { type: 'start', turn: s.turnNo });
    s = act(s, { type: 'skipPlayer' });
    expect(s.phase).toBe('ready');
    expect(s.turnNo).toBe(2);
    s = begin(s);
    expect(() => act(s, { type: 'skipPlayer' }, START)).toThrow(/between turns/);
    s = act(s, { type: 'stopTurn' }, START);
    s = act(s, { type: 'next', turn: s.turnNo });
    s = act(s, { type: 'skipPlayer' });
    expect(s.phase).toBe('gameOver');
  });

  it('the host can finish early; a turn in progress is kept', () => {
    let s = mark(mark(begin(create()), 'correct'), 'correct');
    const g = guesserAt(s);
    expect(() => act(s, { type: 'finish', bySeat: 0 } as never)).toThrow(/host/);
    s = act(s, { type: 'finish' }, START + 3000);
    expect(s.phase).toBe('gameOver');
    expect(() => act(s, { type: 'finish' })).toThrow(/over/);
    const v = mod.viewFor(s, null);
    expect(v.scores[g]).toBe(2);
    expect(v.results!.bestTurn).toEqual({ seat: g, round: 0, got: 2 });
    expect(v.results!.turns[0]!.cards.map((c) => c.got)).toEqual([true, true, false]);
  });
});

// ============================================================================

describe('hidden information', () => {
  /** A turn in progress with a couple of cards already played. */
  function midTurn(display: 'forehead' | 'others'): ForeheadState {
    let s = begin(create({ ...packsOnly, display }, { online: true }));
    s = mark(s, 'pass', display === 'others' ? other(s) : guesserAt(s));
    return s;
  }
  const upText = (s: ForeheadState) => s.cards[s.current!.id]!.text;
  const deckTexts = (s: ForeheadState) => s.deck.map((id) => s.cards[id]!.text);

  it('forehead mode: the guesser and the clue-givers see the word; a spectator never does', () => {
    const s = midTurn('forehead');
    const g = guesserAt(s);
    for (const seat of allSeats(s)) {
      const v = mod.viewFor(s, seat);
      expect(v.cardNo).toBe(s.current!.no);
      if (seat === null) {
        expect(v.cardText).toBeNull();
        expect(has(json(s, seat), upText(s))).toBe(false);
      } else {
        expect(v.cardText).toBe(upText(s));
      }
      expect(v.canCorrect).toBe(seat === g);
      expect(v.canPass).toBe(seat === g);
    }
  });

  it('"others" mode: the guesser’s device never receives the word, before, during or after a card', () => {
    let s = midTurn('others');
    const g = guesserAt(s);
    for (let k = 0; k < 4; k++) {
      for (const seat of allSeats(s)) {
        const v = mod.viewFor(s, seat);
        const visible = seat !== null && seat !== g;
        expect(v.cardText).toBe(visible ? upText(s) : null);
        expect(has(json(s, seat), upText(s))).toBe(visible);
        expect(v.canCorrect).toBe(visible);
        expect(v.canPass).toBe(seat !== null);
      }
      s = mark(s, k % 2 ? 'pass' : 'correct', other(s, 1 + (k % 3)));
    }
    // The 3-2-1 and the ready screen carry no card at all.
    let next = act(s, { type: 'timeUp', turn: 0 }, END);
    next = act(next, { type: 'next', turn: next.turnNo });
    for (const seat of allSeats(next)) expect(mod.viewFor(next, seat).cardText).toBeNull();
    next = act(next, { type: 'start', turn: next.turnNo });
    for (const seat of allSeats(next)) expect(mod.viewFor(next, seat).cardText).toBeNull();
  });

  it('a paused guesser lowers the phone: their word is hidden; clue-givers keep it', () => {
    let s = midTurn('forehead');
    const g = guesserAt(s);
    s = act(s, { type: 'pause' }, START + 4000);
    expect(mod.viewFor(s, g).cardText).toBeNull();
    expect(has(json(s, g), upText(s))).toBe(false);
    expect(mod.viewFor(s, g).canCorrect).toBe(false);
    expect(mod.viewFor(s, other(s)).cardText).toBe(upText(s));
    expect(mod.viewFor(s, other(s)).canCorrect).toBe(false);
  });

  it('no view ever contains the undealt deck', () => {
    for (const display of ['forehead', 'others'] as const) {
      const s = midTurn(display);
      const hidden = deckTexts(s);
      expect(hidden.length).toBeGreaterThan(50);
      for (const seat of allSeats(s)) {
        const j = json(s, seat);
        for (const t of hidden) expect(has(j, t)).toBe(false);
      }
    }
    const ready = create();
    for (const seat of allSeats(ready)) {
      const j = json(ready, seat);
      for (const t of deckTexts(ready)) expect(has(j, t)).toBe(false);
    }
  });

  it('redacted views are identical whichever card is up', () => {
    for (const display of ['forehead', 'others'] as const) {
      const a = midTurn(display);
      // Same token, different word, different deck order.
      const swapId = a.deck[3]!;
      const b: ForeheadState = {
        ...a,
        current: { id: swapId, no: a.current!.no },
        deck: [a.current!.id, ...a.deck.filter((id) => id !== swapId)].reverse(),
      };
      const g = guesserAt(a);
      const blind: Array<SeatIndex | null> = display === 'others' ? [null, g] : [null];
      for (const seat of blind) expect(json(a, seat)).toBe(json(b, seat));
      if (display === 'forehead') {
        const pa = act(a, { type: 'pause' }, START + 4000);
        const pb = act(b, { type: 'pause' }, START + 4000);
        expect(json(pa, g)).toBe(json(pb, g));
      }
      // Clue-givers do see the difference (they need the word).
      expect(json(a, other(a))).not.toBe(json(b, other(a)));
    }
  });

  it('player-written cards stay private until played, and anonymous until the end', () => {
    let s = create({ words: { packs: ['animals'], listIds: [], perPlayer: 1 } });
    s = act(s, { type: 'collect.submit', bySeat: 0, entries: ['Uncle Ray’s canoe'] });
    for (const seat of [null, 1, 2, 3]) expect(json(s, seat)).not.toContain('canoe');
    expect(mod.viewFor(s, 0).collect?.yours).toEqual(['Uncle Ray’s canoe']);
    for (let i = 1; i < NAMES.length; i++) s = act(s, { type: 'collect.submit', bySeat: i, entries: [`Thing ${i}`] });
    expect(s.phase).toBe('ready');
    for (const seat of allSeats(s)) expect(json(s, seat)).not.toContain('canoe');
    // Put Ana's card up for someone else, and play it.
    const canoe = s.cards.find((c) => c.text.includes('canoe'))!.id;
    if (guesserAt(s) === 0) s = act(s, { type: 'skipPlayer' });
    s = { ...s, deck: [canoe, ...s.deck.filter((id) => id !== canoe)] };
    s = begin(s);
    expect(s.current!.id).toBe(canoe);
    s = mark(s, 'correct');
    s = act(s, { type: 'stopTurn' }, START + 2000);
    const results = mod.viewFor(s, null).lastTurn!;
    expect(results.cards[0]).toEqual({ text: 'Uncle Ray’s canoe', got: true });
    expect(json(s, null)).not.toContain('"author"');
    s = act(s, { type: 'finish' });
    const final = mod.viewFor(s, null).results!;
    expect(final.turns[0]!.cards[0]).toEqual({ text: 'Uncle Ray’s canoe', got: true, author: 'Ana' });
  });

  it('never exposes the rng, the deck, the top-up pool or card ids', () => {
    let s = create({ words: { packs: ['animals'], listIds: [], perPlayer: 1 } });
    for (const seat of allSeats(s)) expect(json(s, seat)).not.toMatch(/"rng"|topUp|"deck"|"cards"/);
    NAMES.forEach((_, i) => (s = act(s, { type: 'collect.submit', bySeat: i, entries: [`Word ${i}`] })));
    s = begin(s);
    for (const seat of allSeats(s)) {
      const j = json(s, seat);
      expect(j).not.toMatch(/"rng"|topUp|"deck"|"current"|"id"/);
    }
  });
});
