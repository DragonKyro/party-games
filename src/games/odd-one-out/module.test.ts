import { describe, expect, it } from 'vitest';
import type { ActionContext, GameConfig, SeatIndex } from '@/engine/types';
import { WORD_PACKS } from '@/words';
import { entryKey } from '@/words/source';
import type { OddOneOutAction } from './actions';
import { GRACE_MS, HOST_LIST, OUR_WORDS, oddOneOutModule as mod, roundPoints, topVoted } from './module';
import { readOptions } from './rules';
import type { OddOneOutState } from './state';

const NAMES = ['Ana', 'Ben', 'Cai', 'Dee', 'Eli'];
const SEVEN = [...NAMES, 'Fay', 'Gus'];

function config(options: Record<string, unknown> = {}, names = NAMES, extra: Partial<GameConfig> = {}): GameConfig {
  return {
    gameId: 'odd-one-out',
    seats: names.map((name, index) => ({ index, uuid: null, name })),
    seed: 4242,
    now: 0,
    gameOptions: { ...mod.defaultOptions(), ...options },
    lists: {},
    ...extra,
  };
}

let clock = 1_000;
const ctx = (now = clock): ActionContext => ({ by: '', now });
function act(s: OddOneOutState, a: OddOneOutAction, now = clock): OddOneOutState {
  return mod.applyAction(s, a, ctx(now));
}

const animals = { words: { packs: ['animals'], listIds: [], perPlayer: 0 } };

function start(options: Record<string, unknown> = animals, names = NAMES): OddOneOutState {
  return mod.createInitialState(config(options, names));
}

function allPeek(s: OddOneOutState): OddOneOutState {
  for (let i = 0; i < s.seats.length; i++) s = act(s, { type: 'peeked', bySeat: i, round: s.round });
  return s;
}

/** Give every clue (spoken), landing in discuss. */
function allClues(s: OddOneOutState): OddOneOutState {
  while (s.phase === 'clues') {
    s = act(s, { type: 'clue', bySeat: s.clueOrder[s.clueTurn]!, round: s.round, turn: s.clueTurn, text: null });
  }
  return s;
}

function toVote(options: Record<string, unknown> = animals, names = NAMES): OddOneOutState {
  let s = allClues(allPeek(start(options, names)));
  s = act(s, { type: 'callVote', round: s.round });
  expect(s.phase).toBe('vote');
  return s;
}

function insiders(s: OddOneOutState): SeatIndex[] {
  return s.seats.map((x) => x.index).filter((i) => !s.outsiders.includes(i));
}

/** Everyone votes for `target` (who votes for someone else). */
function everyoneVotes(s: OddOneOutState, target: SeatIndex, alt: SeatIndex): OddOneOutState {
  for (let i = 0; i < s.seats.length && s.phase === 'vote'; i++) {
    s = act(s, { type: 'vote', bySeat: i, round: s.round, target: i === target ? alt : target });
  }
  return s;
}

const seatsOf = (s: OddOneOutState) => s.seats.map((x) => x.index);
const json = (s: OddOneOutState, seat: SeatIndex | null) => JSON.stringify(mod.viewFor(s, seat));

// ============================================================================

describe('options', () => {
  it('has sensible defaults and clamps untrusted input', () => {
    const d = readOptions(mod.defaultOptions());
    expect(d.words.packs).toEqual(['animals', 'food', 'places', 'jobs', 'sports']);
    expect(d).toMatchObject({ boardSize: 16, outsiders: 1, format: 'clues', rounds: 5, talkMinutes: 4, voting: 'secret' });
    const o = readOptions({ rounds: 99, talkMinutes: 1, boardSize: 13, outsiders: 5, format: 'nope', discussSeconds: 5, voting: 'x' });
    expect(o).toMatchObject({ rounds: 10, talkMinutes: 2, boardSize: 16, outsiders: 1, format: 'clues', discussSeconds: 0, voting: 'secret' });
    expect(readOptions({ rounds: 1, talkMinutes: 50, boardSize: 12, outsiders: 2 })).toMatchObject({
      rounds: 3,
      talkMinutes: 10,
      boardSize: 12,
      outsiders: 2,
    });
  });

  it('explains impossible setups', () => {
    const p = mod.optionsProblem!;
    expect(p({ outsiders: 2 }, 6)).toMatch(/7 players/);
    expect(p({ outsiders: 2 }, 7)).toBeNull();
    expect(p({ words: { packs: [], listIds: [], perPlayer: 0 } }, 5)).toMatch(/come from/);
    expect(p({ words: { packs: [], listIds: [], perPlayer: 1 } }, 5)).toMatch(/at least 8/);
    expect(p({ words: { packs: [], listIds: [], perPlayer: 2 } }, 5)).toBeNull();
    expect(() => start(animals, ['a', 'b'])).toThrow(/3–12/);
    expect(() => start({ ...animals, outsiders: 2 })).toThrow(/7 players/);
  });
});

describe('boards', () => {
  it('deals a 16-word board from one pack, its name as the category, and a secret on it', () => {
    const s = start();
    expect(s.phase).toBe('peek');
    expect(s.board).toHaveLength(16);
    expect(new Set(s.board.map(entryKey)).size).toBe(16);
    expect(s.board.every((w) => WORD_PACKS.animals.words.includes(w))).toBe(true);
    expect(s.category).toEqual({ name: 'Animals', emoji: WORD_PACKS.animals.emoji });
    expect(s.secretIndex).toBeGreaterThanOrEqual(0);
    expect(s.secretIndex).toBeLessThan(16);
    expect(s.outsiders).toHaveLength(1);
  });

  it('supports 12-word boards and two outsiders with 7+ players', () => {
    const s = start({ ...animals, boardSize: 12, outsiders: 2 }, SEVEN);
    expect(s.board).toHaveLength(12);
    expect(s.outsiders).toHaveLength(2);
    expect(s.outsiders[0]).not.toBe(s.outsiders[1]);
  });

  it('draws each round from ONE selected pack, cycling through them, never repeating a secret', () => {
    let s = start({ words: { packs: ['animals', 'food', 'jobs'], listIds: [], perPlayer: 0 }, rounds: 6 });
    const cats: string[] = [];
    const secrets: string[] = [];
    for (let r = 0; r < 6; r++) {
      const pack = Object.values(WORD_PACKS).find((p) => p.name === s.category!.name)!;
      expect(s.board.every((w) => pack.words.includes(w))).toBe(true);
      cats.push(s.category!.name);
      secrets.push(s.board[s.secretIndex]!);
      s = allPeek(s);
      s = act(s, { type: 'guess', bySeat: s.outsiders[0]!, round: r, word: s.secretIndex });
      s = act(s, { type: 'nextRound', round: r });
    }
    expect(new Set(cats.slice(0, 3)).size).toBe(3);
    expect(new Set(cats.slice(3)).size).toBe(3);
    expect(cats[2]).not.toBe(cats[3]);
    expect(new Set(secrets).size).toBe(6);
  });

  it('host lists: one list per round, labelled “Host’s list”; tiny lists are merged', () => {
    const big = Array.from({ length: 20 }, (_, i) => `Inside joke ${i}`);
    const s = mod.createInitialState(
      config({ words: { packs: [], listIds: ['L'], perPlayer: 0 }, boardSize: 12 }, NAMES, { lists: { L: big } }),
    );
    expect(s.category).toEqual({ name: HOST_LIST, emoji: '📋' });
    expect(s.board).toHaveLength(12);
    expect(s.board.every((w) => big.includes(w))).toBe(true);

    const merged = mod.createInitialState(
      config({ words: { packs: [], listIds: ['a', 'b'], perPlayer: 0 } }, NAMES, {
        lists: { a: ['One', 'Two', 'Three', 'Four', 'Five'], b: ['Six', 'Seven', 'Eight', 'Nine'] },
      }),
    );
    expect(merged.board).toHaveLength(9);
    expect(() =>
      mod.createInitialState(config({ words: { packs: [], listIds: ['a'], perPlayer: 0 } }, NAMES, { lists: { a: ['x', 'y'] } })),
    ).toThrow(/Not enough words/);
  });

  it('player-written words: a collect phase, then an “Our words” board', () => {
    let s = start({ words: { packs: [], listIds: [], perPlayer: 4 } });
    expect(s.phase).toBe('collect');
    NAMES.forEach((_, i) => {
      s = act(s, { type: 'collect.submit', bySeat: i, entries: [0, 1, 2, 3].map((k) => `Word ${i}-${k}`) });
    });
    expect(s.phase).toBe('peek');
    expect(s.category).toEqual({ name: OUR_WORDS, emoji: '✍️' });
    expect(s.board).toHaveLength(16);
    expect(s.board.every((w) => w.startsWith('Word '))).toBe(true);
  });

  it('tops up a short “Our words” board from the selected packs; plays a small board without packs', () => {
    let s = start({ words: { packs: ['food'], listIds: [], perPlayer: 2 } });
    NAMES.forEach((_, i) => (s = act(s, { type: 'collect.submit', bySeat: i, entries: [`Ours ${i}a`, `Ours ${i}b`] })));
    expect(s.category!.name).toBe(`${OUR_WORDS} + Food & Drink`);
    expect(s.board).toHaveLength(16);
    expect(s.board.filter((w) => w.startsWith('Ours')).length).toBe(10);

    let t = start({ words: { packs: [], listIds: [], perPlayer: 2 } });
    NAMES.forEach((_, i) => (t = act(t, { type: 'collect.submit', bySeat: i, entries: [`Ours ${i}a`, `Ours ${i}b`] })));
    expect(t.category!.name).toBe(OUR_WORDS);
    expect(t.board).toHaveLength(10);
  });

  it('only the host can stop the writing early, and not before anyone wrote', () => {
    let s = start({ words: { packs: [], listIds: [], perPlayer: 3 } });
    expect(() => act(s, { type: 'collect.close' })).toThrow(/written/);
    s = act(s, { type: 'collect.submit', bySeat: 0, entries: ['a', 'b', 'c'] });
    expect(() => act(s, { type: 'collect.close', bySeat: 0 } as never)).toThrow(/host/);
    s = act(s, { type: 'collect.close' });
    expect(s.phase).toBe('peek');
    // Fewer than a board's worth and no packs: topped up so there's a game.
    expect(s.board.length).toBeGreaterThanOrEqual(8);
  });
});

describe('peek', () => {
  it('waits for everyone to tap "Got it"; doubles and stale rounds are refused', () => {
    let s = start();
    s = act(s, { type: 'peeked', bySeat: 0, round: 0 });
    expect(() => act(s, { type: 'peeked', bySeat: 0, round: 0 })).toThrow(/Already/);
    expect(() => act(s, { type: 'peeked', bySeat: 1, round: 3 })).toThrow(/another round/);
    expect(() => act(s, { type: 'peeked', bySeat: 9, round: 0 })).toThrow(/seat/);
    for (let i = 1; i < 4; i++) s = act(s, { type: 'peeked', bySeat: i, round: 0 });
    expect(s.phase).toBe('peek');
    s = act(s, { type: 'peeked', bySeat: 4, round: 0 });
    expect(s.phase).toBe('clues');
  });

  it('the host can start without stragglers; nobody can guess yet', () => {
    const s = start();
    expect(() => act(s, { type: 'startPlay', round: 0, bySeat: 1 } as never)).toThrow(/host/);
    expect(() => act(s, { type: 'guess', bySeat: s.outsiders[0]!, round: 0, word: 0 })).toThrow(/Too late|guess/);
    expect(act(s, { type: 'startPlay', round: 0 }).phase).toBe('clues');
  });
});

describe('clues', () => {
  it('goes round a random order; only the current giver, one word, nothing from the board', () => {
    let s = allPeek(start());
    expect([...s.clueOrder].sort()).toEqual(seatsOf(s));
    const giver = s.clueOrder[0]!;
    const other = s.clueOrder[1]!;
    const base = { type: 'clue' as const, round: 0, turn: 0 };
    expect(() => act(s, { ...base, bySeat: other, text: 'furry' })).toThrow(/not your turn/);
    expect(() => act(s, { ...base, bySeat: giver, text: 'two words' })).toThrow(/One word/);
    expect(() => act(s, { ...base, bySeat: giver, text: '   ' })).toThrow(/Type/);
    expect(() => act(s, { ...base, bySeat: giver, text: 'x'.repeat(30) })).toThrow(/under/);
    for (const w of [s.board[s.secretIndex]!, s.board[(s.secretIndex + 1) % 16]!].filter((w) => !/\s/.test(w))) {
      expect(() => act(s, { ...base, bySeat: giver, text: w.toUpperCase() })).toThrow(/on the board/);
    }
    s = act(s, { ...base, bySeat: giver, text: '  Furry ' });
    expect(s.clues).toEqual([{ seat: giver, text: 'Furry', skipped: false }]);
    expect(() => act(s, { ...base, bySeat: giver, text: 'again' })).toThrow(/turn is over/);
    expect(() => act(s, { type: 'clue', bySeat: other, round: 0, turn: 1, text: 'furry' })).toThrow(/already said/);
  });

  it('spoken clues (single device), host skips, then a timed discussion', () => {
    let s = allPeek(start({ ...animals, discussSeconds: 60 }));
    s = act(s, { type: 'skipClue', round: 0, turn: 0 });
    expect(s.clues[0]).toMatchObject({ seat: s.clueOrder[0], text: null, skipped: true });
    expect(() => act(s, { type: 'skipClue', round: 0, turn: 0 })).toThrow(/turn is over/);
    s = allClues(s);
    expect(s.phase).toBe('discuss');
    expect(s.clues).toHaveLength(5);
    const sched = mod.nextScheduled!(s)!;
    expect(sched).toEqual({ at: clock + 60_000, action: { type: 'timeUp', round: 0 } });
    expect(() => act(s, sched.action)).toThrow(/not up/);
    expect(() => act(s, { type: 'timeUp', round: 4 }, sched.at)).toThrow(/Stale/);
    s = act(s, sched.action, sched.at);
    expect(s.phase).toBe('vote');
    expect(mod.nextScheduled!(s)).toBeNull();
  });

  it('an untimed discussion waits for the host; the host can also cut the clues short', () => {
    const s = allClues(allPeek(start({ ...animals, discussSeconds: 0 })));
    expect(s.phase).toBe('discuss');
    expect(s.timer).toBeNull();
    expect(mod.nextScheduled!(s)).toBeNull();
    expect(act(s, { type: 'callVote', round: 0 }).phase).toBe('vote');
    const mid = allPeek(start());
    expect(act(mid, { type: 'callVote', round: 0 }).phase).toBe('vote');
    expect(() => act(mid, { type: 'callVote', round: 0, bySeat: 0 } as never)).toThrow(/host/);
  });

  it('pausing freezes the discussion timer and the schedule', () => {
    let s = allClues(allPeek(start({ ...animals, discussSeconds: 60 })));
    s = act(s, { type: 'pause' }, clock + 10_000);
    expect(mod.nextScheduled!(s)).toBeNull();
    s = act(s, { type: 'resume' }, clock + 100_000);
    expect(mod.nextScheduled!(s)!.at).toBe(clock + 100_000 + 50_000);
  });
});

describe('questions format', () => {
  it('runs a free-talk timer with a first asker; the host can call the vote early', () => {
    let s = allPeek(start({ ...animals, format: 'questions', talkMinutes: 3 }));
    expect(s.phase).toBe('talk');
    expect(s.timer!.durationMs).toBe(180_000);
    expect(mod.viewFor(s, null).firstAsker).toBe(s.firstAsker);
    expect(() => act(s, { type: 'clue', bySeat: 0, round: 0, turn: 0, text: 'x' })).toThrow(/Not giving clues/);
    expect(act(s, { type: 'callVote', round: 0 }).phase).toBe('vote');
    const sched = mod.nextScheduled!(s)!;
    s = act(s, sched.action, sched.at);
    expect(s.phase).toBe('vote');
  });
});

describe('voting', () => {
  it('no voting for yourself; ballots can change until the last one is in', () => {
    let s = toVote();
    expect(() => act(s, { type: 'vote', bySeat: 0, round: 0, target: 0 })).toThrow(/yourself/);
    expect(() => act(s, { type: 'vote', bySeat: 0, round: 0, target: 7 })).toThrow(/seat/);
    s = act(s, { type: 'vote', bySeat: 0, round: 0, target: 1 });
    s = act(s, { type: 'vote', bySeat: 0, round: 0, target: 2 });
    expect(s.votes[0]).toBe(2);
    expect(s.phase).toBe('vote');
  });

  it('a tie catches nobody: the outsider wins +2', () => {
    let s = toVote();
    const out = s.outsiders[0]!;
    const [a, b, c, d] = insiders(s) as [number, number, number, number];
    // a and b get two votes each, c one → a tie at the top.
    const plan: Array<[number, number]> = [
      [a, b],
      [b, a],
      [c, a],
      [d, b],
      [out, c],
    ];
    expect(topVoted([2, 2, 1, 0, 0])).toBeNull();
    expect(topVoted([0, 0, 0])).toBeNull();
    expect(topVoted([0, 3, 1])).toBe(1);
    for (const [by, target] of plan) s = act(s, { type: 'vote', bySeat: by, round: 0, target });
    expect(s.phase).toBe('reveal');
    expect(s.result).toMatchObject({ outcome: 'tie', winner: 'outsiders', accused: null });
    expect(s.scores[out]).toBe(2);
    expect(s.scores.reduce((x, y) => x + y, 0)).toBe(2);
  });

  it('accusing an insider: outsiders win', () => {
    let s = toVote();
    const out = s.outsiders[0]!;
    const [a, b] = insiders(s);
    s = everyoneVotes(s, a!, b!);
    expect(s.result).toMatchObject({ outcome: 'innocent', winner: 'outsiders', accused: a });
    expect(s.result!.tally[a!]).toBe(4);
    expect(s.scores[out]).toBe(2);
  });

  it('catching the outsider opens a last chance; a wrong pick scores the insiders (+1 bonus for good votes)', () => {
    let s = toVote();
    const out = s.outsiders[0]!;
    const ins = insiders(s);
    // Everyone but one insider votes for the outsider.
    const holdout = ins[0]!;
    for (const i of seatsOf(s)) {
      const target = i === out ? ins[1]! : i === holdout ? ins[2]! : out;
      s = act(s, { type: 'vote', bySeat: i, round: 0, target });
    }
    expect(s.phase).toBe('lastChance');
    expect(s.accused).toBe(out);
    expect(() => act(s, { type: 'guess', bySeat: ins[1]!, round: 0, word: 0 })).toThrow(/accused/);
    const wrong = (s.secretIndex + 1) % s.board.length;
    s = act(s, { type: 'guess', bySeat: out, round: 0, word: wrong });
    expect(s.result).toMatchObject({ outcome: 'caught', winner: 'insiders', guess: { seat: out, word: wrong, correct: false } });
    expect(s.scores[out]).toBe(0);
    expect(s.scores[holdout]).toBe(1);
    for (const i of ins.filter((x) => x !== holdout)) expect(s.scores[i]).toBe(2);
  });

  it('a caught outsider who names the word steals the win (+3)', () => {
    let s = toVote();
    const out = s.outsiders[0]!;
    s = everyoneVotes(s, out, insiders(s)[0]!);
    expect(s.phase).toBe('lastChance');
    s = act(s, { type: 'guess', bySeat: out, round: 0, word: s.secretIndex });
    expect(s.result).toMatchObject({ outcome: 'stolen', winner: 'outsiders' });
    expect(s.scores[out]).toBe(3);
    expect(s.scores.reduce((x, y) => x + y, 0)).toBe(3);
    expect(() => act(s, { type: 'guess', bySeat: out, round: 0, word: s.secretIndex })).toThrow();
  });

  it('the accused (or the host) can give up the last chance', () => {
    let s = toVote();
    const out = s.outsiders[0]!;
    s = everyoneVotes(s, out, insiders(s)[0]!);
    expect(() => act(s, { type: 'giveUp', bySeat: insiders(s)[0]!, round: 0 })).toThrow(/accused/);
    expect(act(s, { type: 'giveUp', bySeat: out, round: 0 }).result!.outcome).toBe('caught');
    expect(act(s, { type: 'giveUp', round: 0 }).result!.guess).toEqual({ seat: out, word: null, correct: false, early: false });
  });

  it('the host can close the vote with ballots missing', () => {
    let s = toVote();
    const [a, b] = insiders(s);
    s = act(s, { type: 'vote', bySeat: b!, round: 0, target: a! });
    expect(() => act(s, { type: 'closeVote', round: 0, bySeat: 0 } as never)).toThrow(/host/);
    s = act(s, { type: 'closeVote', round: 0 });
    expect(s.result).toMatchObject({ outcome: 'innocent', accused: a });
    const empty = act(toVote(), { type: 'closeVote', round: 0 });
    expect(empty.result!.outcome).toBe('tie');
  });

  it('single-device open vote: the host taps the accused (secret-ballot games refuse it)', () => {
    expect(() => act(toVote(), { type: 'accuse', round: 0, seat: 0 })).toThrow(/secret ballots/);
    let s = toVote({ ...animals, voting: 'open' });
    const out = s.outsiders[0]!;
    s = act(s, { type: 'accuse', round: 0, seat: out });
    expect(s.phase).toBe('lastChance');
    s = act(s, { type: 'giveUp', round: 0 });
    expect(s.result).toMatchObject({ outcome: 'caught', openVote: true });
    // No ballots, so no voting bonus.
    for (const i of insiders(s)) expect(s.scores[i]).toBe(1);
    // The table couldn't agree: a tie, nobody caught.
    const tie = act(toVote({ ...animals, voting: 'open' }), { type: 'accuse', round: 0, seat: null });
    expect(tie.result).toMatchObject({ outcome: 'tie', winner: 'outsiders', openVote: true });
    expect(() => act(toVote({ ...animals, voting: 'open' }), { type: 'accuse', round: 0, seat: 9 })).toThrow(/seat/);
  });

  it('two outsiders: catching either one opens their last chance; outsiders score together', () => {
    let s = toVote({ ...animals, outsiders: 2 }, SEVEN);
    const [o1, o2] = s.outsiders;
    s = everyoneVotes(s, o1!, o2!);
    expect(s.phase).toBe('lastChance');
    expect(s.accused).toBe(o1);
    s = act(s, { type: 'guess', bySeat: o1!, round: 0, word: s.secretIndex });
    expect(s.scores[o1!]).toBe(3);
    expect(s.scores[o2!]).toBe(2);
  });
});

describe('early guess', () => {
  it('right: the outsiders win at once (+3 to the guesser)', () => {
    const s = allPeek(start());
    const out = s.outsiders[0]!;
    const r = act(s, { type: 'guess', bySeat: out, round: 0, word: s.secretIndex });
    expect(r.result).toMatchObject({ outcome: 'early-right', winner: 'outsiders', guess: { early: true, correct: true } });
    expect(r.scores[out]).toBe(3);
  });

  it('wrong: the insiders win (+1 each, no ballots so no bonus)', () => {
    const s = allClues(allPeek(start()));
    const out = s.outsiders[0]!;
    const r = act(s, { type: 'guess', bySeat: out, round: 0, word: (s.secretIndex + 3) % 16 });
    expect(r.result).toMatchObject({ outcome: 'early-wrong', winner: 'insiders' });
    expect(r.scores[out]).toBe(0);
    for (const i of insiders(s)) expect(r.scores[i]).toBe(1);
  });

  it('only outsiders, only before the vote (with a short grace for the buzzer), valid words only', () => {
    const s = allPeek(start({ ...animals, format: 'questions' }));
    const out = s.outsiders[0]!;
    expect(() => act(s, { type: 'guess', bySeat: insiders(s)[0]!, round: 0, word: 0 })).toThrow(/outsider/);
    expect(() => act(s, { type: 'guess', bySeat: out, round: 0, word: 16 })).toThrow(/word/);
    expect(() => act(s, { type: 'guess', bySeat: out, round: 1, word: 0 })).toThrow(/another round/);
    const end = s.timer!.endsAt!;
    let v = act(s, { type: 'timeUp', round: 0 }, end);
    expect(v.phase).toBe('vote');
    v = act(v, { type: 'vote', bySeat: insiders(s)[0]!, round: 0, target: out }, end + 200);
    const late = act(v, { type: 'guess', bySeat: out, round: 0, word: s.secretIndex }, end + GRACE_MS - 100);
    expect(late.result!.outcome).toBe('early-right');
    expect(late.result!.votes.every((x) => x === null)).toBe(true);
    expect(() => act(v, { type: 'guess', bySeat: out, round: 0, word: s.secretIndex }, end + GRACE_MS + 500)).toThrow(/Too late/);
  });
});

describe('rounds and scoring', () => {
  it('scores per the rules', () => {
    expect(roundPoints([1], [1, 2, 0, 1, null], 'outsiders', null)).toEqual([0, 2, 0, 0, 0]);
    expect(roundPoints([1], [1, 2, 0, 1, null], 'outsiders', { seat: 1, word: 3, correct: true, early: false })).toEqual([
      0, 3, 0, 0, 0,
    ]);
    expect(roundPoints([1], [1, 2, 0, 1, null], 'insiders', null)).toEqual([2, 0, 1, 2, 1]);
    expect(roundPoints([1, 3], [1, 3, 0, 0, 3, 0, 1], 'insiders', null)).toEqual([2, 0, 1, 0, 2, 1, 2]);
  });

  it('plays the chosen number of rounds with a running total, then ends', () => {
    let s = start({ ...animals, rounds: 3 });
    for (let r = 0; r < 3; r++) {
      expect(s.round).toBe(r);
      expect(s.phase).toBe('peek');
      s = allPeek(s);
      s = act(s, { type: 'guess', bySeat: s.outsiders[0]!, round: r, word: s.secretIndex });
      expect(() => act(s, { type: 'nextRound', round: r, bySeat: 0 } as never)).toThrow(/host/);
      expect(() => act(s, { type: 'nextRound', round: r + 1 })).toThrow(/another round/);
      s = act(s, { type: 'nextRound', round: r });
    }
    expect(s.phase).toBe('gameOver');
    expect(mod.isFinished(s)).toBe(true);
    expect(s.history).toHaveLength(3);
    expect(s.scores.reduce((a, b) => a + b, 0)).toBe(9);
  });

  it('the host can finish early', () => {
    const s = act(allPeek(start()), { type: 'finish' });
    expect(s.phase).toBe('gameOver');
    expect(() => act(s, { type: 'finish' })).toThrow(/over/);
    expect(mod.viewFor(s, null).history).toHaveLength(0);
  });
});

// ============================================================================
// Hidden information
// ============================================================================

/** States at each pre-reveal moment of a round. */
function snapshots(options: Record<string, unknown> = animals, names = NAMES): Array<[string, OddOneOutState]> {
  const peek = start(options, names);
  const halfPeek = act(peek, { type: 'peeked', bySeat: 1, round: 0 });
  const clues0 = allPeek(peek);
  const clues2 = act(
    act(clues0, { type: 'clue', bySeat: clues0.clueOrder[0]!, round: 0, turn: 0, text: 'Whiskers' }),
    { type: 'clue', bySeat: clues0.clueOrder[1]!, round: 0, turn: 1, text: null },
  );
  const discuss = allClues(clues2);
  const vote = act(discuss, { type: 'callVote', round: 0 });
  const voting = act(act(vote, { type: 'vote', bySeat: 0, round: 0, target: 2 }), { type: 'vote', bySeat: 3, round: 0, target: 1 });
  const talk = allPeek(start({ ...options, format: 'questions' }, names));
  return [
    ['peek', peek],
    ['half-peeked', halfPeek],
    ['clues', clues2],
    ['discuss', discuss],
    ['vote', voting],
    ['talk', talk],
  ];
}

describe('hidden information', () => {
  it('each seat sees only its own role; the secret goes to insiders only', () => {
    for (const [, s] of snapshots()) {
      for (const seat of seatsOf(s)) {
        const v = mod.viewFor(s, seat);
        const outsider = s.outsiders.includes(seat);
        expect(v.you).toEqual({ role: outsider ? 'outsider' : 'insider' });
        expect(v.secretIndex).toBe(outsider ? null : s.secretIndex);
        expect(v.result).toBeNull();
        expect(JSON.stringify(v)).not.toContain('"outsiders"');
      }
      const spec = mod.viewFor(s, null);
      expect(spec.you).toBeNull();
      expect(spec.secretIndex).toBeNull();
      expect(spec.accused).toBeNull();
      expect(spec.tally).toBeNull();
    }
  });

  it('a seat’s view is byte-identical whichever OTHER player is the outsider', () => {
    for (const [phase, s] of snapshots()) {
      for (const a of seatsOf(s)) {
        for (const b of seatsOf(s)) {
          if (a === b) continue;
          const sa: OddOneOutState = { ...s, outsiders: [a] };
          const sb: OddOneOutState = { ...s, outsiders: [b] };
          for (const seat of [null, ...seatsOf(s).filter((x) => x !== a && x !== b)]) {
            expect(json(sa, seat), `${phase}: seat ${seat} with outsider ${a} vs ${b}`).toBe(json(sb, seat));
          }
        }
      }
    }
  });

  it('with two outsiders, views don’t depend on who the other outsiders are', () => {
    for (const [, s] of snapshots({ ...animals, outsiders: 2 }, SEVEN)) {
      const x: OddOneOutState = { ...s, outsiders: [0, 1] };
      const y: OddOneOutState = { ...s, outsiders: [0, 2] };
      // Seat 0 (an outsider in both) and insiders 3–6 can't tell 1 from 2.
      for (const seat of [null, 0, 3, 4, 5, 6]) expect(json(x, seat)).toBe(json(y, seat));
    }
  });

  it('outsider and spectator views are identical whichever board word is secret', () => {
    for (const [phase, s] of snapshots()) {
      const out = s.outsiders[0]!;
      for (let i = 0; i < s.board.length; i++) {
        const t: OddOneOutState = { ...s, secretIndex: i };
        expect(json(t, out), `${phase}: secret ${i}`).toBe(json(s, out));
        expect(json(t, null)).toBe(json(s, null));
      }
    }
  });

  it('votes stay secret until the reveal: only who has voted, and your own ballot', () => {
    let s = toVote();
    const [a, b] = insiders(s);
    const out = s.outsiders[0]!;
    s = act(s, { type: 'vote', bySeat: a!, round: 0, target: out });
    const alt: OddOneOutState = { ...s, votes: s.votes.map((v, i) => (i === a ? b! : v)) };
    expect(mod.viewFor(s, a!).yourVote).toBe(out);
    expect(mod.viewFor(s, b!).yourVote).toBeNull();
    for (const seat of [null, ...seatsOf(s).filter((x) => x !== a)]) {
      const v = mod.viewFor(s, seat);
      expect(v.voted[a!]).toBe(true);
      expect(v.tally).toBeNull();
      expect(json(s, seat)).toBe(json(alt, seat));
    }
  });

  it('the last chance shows the tally and the accused, but not the secret to the accused or spectators', () => {
    let s = toVote({ ...animals, outsiders: 2 }, SEVEN);
    const [o1, o2] = s.outsiders;
    s = everyoneVotes(s, o1!, insiders(s)[0]!);
    expect(s.phase).toBe('lastChance');
    expect(mod.viewFor(s, o1!).secretIndex).toBeNull();
    expect(mod.viewFor(s, null).secretIndex).toBeNull();
    expect(mod.viewFor(s, insiders(s)[0]!).secretIndex).toBe(s.secretIndex);
    expect(mod.viewFor(s, null).accused).toBe(o1);
    expect(mod.viewFor(s, null).tally![o1!]).toBe(6);
    expect(mod.viewFor(s, null).result).toBeNull();
    // Who voted for whom, and the other outsider, are still hidden.
    const other = seatsOf(s).find((x) => x !== o1 && x !== o2)!;
    const swapped: OddOneOutState = { ...s, outsiders: [o1!, other].sort() };
    for (const seat of [null, o1!]) expect(json(s, seat)).toBe(json(swapped, seat));
    expect(JSON.stringify(mod.viewFor(s, null))).not.toContain('"votes"');
  });

  it('everything is public at the reveal, and stays in the history', () => {
    let s = toVote();
    const out = s.outsiders[0]!;
    s = everyoneVotes(s, out, insiders(s)[0]!);
    s = act(s, { type: 'guess', bySeat: out, round: 0, word: (s.secretIndex + 1) % 16 });
    for (const seat of [null, ...seatsOf(s)]) {
      const v = mod.viewFor(s, seat);
      expect(v.secretIndex).toBe(s.secretIndex);
      expect(v.result).toMatchObject({ outsiders: [out], secret: s.board[s.secretIndex], accused: out });
      expect(v.result!.votes).toEqual(s.votes);
      expect(v.history).toHaveLength(1);
    }
    s = act(s, { type: 'nextRound', round: 0 });
    const v = mod.viewFor(s, null);
    expect(v.history).toHaveLength(1);
    expect(v.result).toBeNull();
    expect(v.secretIndex).toBeNull();
  });

  it('the current round is never in the history before its reveal', () => {
    for (const [, s] of snapshots()) for (const seat of [null, 0]) expect(mod.viewFor(s, seat).history).toEqual([]);
  });

  it('never exposes the rng, the word groups, host lists or past-secret bookkeeping', () => {
    const list = Array.from({ length: 40 }, (_, i) => `Private thing ${i}`);
    const s = mod.createInitialState(
      config({ words: { packs: [], listIds: ['L'], perPlayer: 0 } }, NAMES, { lists: { L: list } }),
    );
    const offBoard = list.filter((w) => !s.board.includes(w));
    expect(offBoard.length).toBeGreaterThan(0);
    for (const seat of [null, 0, 1, 2]) {
      const j = json(s, seat);
      for (const key of ['"rng"', 'groups', 'usedSecrets', 'ourWords', 'groupDeck', 'lastGroup', 'voteOpenedAt']) {
        expect(j).not.toContain(key);
      }
      for (const w of offBoard) expect(j).not.toContain(`"${w}"`);
    }
  });

  it('player-written words stay private while writing', () => {
    let s = start({ words: { packs: ['animals'], listIds: [], perPlayer: 1 } });
    s = act(s, { type: 'collect.submit', bySeat: 0, entries: ['Uncle Steve’s boat'] });
    for (const seat of [null, 1, 2]) expect(json(s, seat)).not.toContain('Steve');
    expect(mod.viewFor(s, 0).collect?.yours).toEqual(['Uncle Steve’s boat']);
    expect(mod.viewFor(s, null).board).toEqual([]);
  });
});
