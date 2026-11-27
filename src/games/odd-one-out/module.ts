import { assertHostOnly, assertInt, assertSeat } from '@/engine/guards';
import { cloneRng, makeRng, rngInt, rngShuffle, subSeed, type RngState } from '@/engine/rng';
import { isExpired, pauseTimer, resumeTimer, startTimer } from '@/engine/timer';
import type { ActionContext, GameConfig, GameModule, SeatIndex } from '@/engine/types';
import { WORD_PACKS } from '@/words';
import {
  collectComplete,
  collectReduce,
  collectView,
  collectedEntries,
  isCollectAction,
  startCollect,
} from '@/words/collect';
import { buildPool, cleanEntry, entryKey } from '@/words/source';
import type { OddOneOutAction } from './actions';
import { DEFAULT_OPTIONS, MAX_CLUE_LENGTH, MIN_BOARD, optionsProblem, readOptions, type OddOneOutOptions } from './rules';
import type {
  Category,
  Clue,
  OddOneOutState,
  OddOneOutView,
  Outcome,
  RoundGuess,
  RoundResult,
  Winner,
  WordGroup,
} from './state';

// ============================================================================
// Odd One Out — module
// ============================================================================

/** An early guess a moment after the vote opened (timer race) still counts. */
export const GRACE_MS = 1500;

export const OUR_WORDS = 'Our words';
export const HOST_LIST = 'Host’s list';
const OUR_EMOJI = '✍️';
const LIST_EMOJI = '📋';

// ----------------------------------------------------------------------------
// Word groups and boards
// ----------------------------------------------------------------------------

/** One group per selected pack and per host list; lists too small for a board are merged. */
export function buildGroups(options: OddOneOutOptions, lists: Record<string, readonly string[]>): WordGroup[] {
  const groups: WordGroup[] = [];
  const none = { packs: [], listIds: [], perPlayer: 0 };
  for (const id of options.words.packs) {
    const pack = WORD_PACKS[id];
    const words = buildPool({ source: { ...none, packs: [id] } }).map((p) => p.text);
    if (words.length >= MIN_BOARD) groups.push({ name: pack.name, emoji: pack.emoji, words });
  }
  const small: string[] = [];
  for (const id of options.words.listIds) {
    const words = buildPool({ source: { ...none, listIds: [id] }, lists }).map((p) => p.text);
    if (words.length >= MIN_BOARD) groups.push({ name: HOST_LIST, emoji: LIST_EMOJI, words });
    else small.push(...words);
  }
  if (small.length > 0) {
    const merged = buildPool({ source: { ...none, listIds: ['merged'] }, lists: { merged: small } }).map((p) => p.text);
    if (merged.length >= MIN_BOARD) groups.push({ name: HOST_LIST, emoji: LIST_EMOJI, words: merged });
  }
  return groups;
}

function fallbackGroup(): WordGroup {
  const pack = WORD_PACKS.everyday;
  const words = buildPool({ source: { packs: ['everyday'], listIds: [], perPlayer: 0 } }).map((p) => p.text);
  return { name: pack.name, emoji: pack.emoji, words };
}

/**
 * `size` words: fresh primary words first, then fresh extras, then past
 * secrets only if needed — shuffled again at the end, so a word's position
 * says nothing about where it came from.
 */
function drawBoard(primary: readonly string[], extra: readonly string[], size: number, used: Set<string>, rng: RngState): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const take = (words: string[]) => {
    for (const w of words) {
      if (out.length >= size) return;
      const k = entryKey(w);
      if (!k || seen.has(k)) continue;
      seen.add(k);
      out.push(w);
    }
  };
  const fresh = (ws: readonly string[]) => ws.filter((w) => !used.has(entryKey(w)));
  const stale = (ws: readonly string[]) => ws.filter((w) => used.has(entryKey(w)));
  take(rngShuffle(rng, fresh(primary)));
  take(rngShuffle(rng, fresh(extra)));
  take(rngShuffle(rng, stale(primary)));
  take(rngShuffle(rng, stale(extra)));
  return rngShuffle(rng, out);
}

/** Deal round `round`: board, secret, outsiders, clue order. Lands in `peek`. */
function dealRound(state: OddOneOutState, round: number): OddOneOutState {
  const rng = cloneRng(state.rng);
  const n = state.seats.length;
  const size = state.options.boardSize;
  const used = new Set(state.usedSecrets);
  let groupDeck = state.groupDeck;
  let lastGroup = state.lastGroup;
  let category: Category;
  let primary: readonly string[];
  let extra: readonly string[] = [];

  if (state.ourWords) {
    primary = state.ourWords;
    const freshCount = primary.filter((w) => !used.has(entryKey(w))).length;
    const pool = state.groups.length > 0 ? state.groups : primary.length < MIN_BOARD ? [fallbackGroup()] : [];
    if (freshCount < size && pool.length > 0) {
      const g = pool[rngInt(rng, pool.length)]!;
      extra = g.words;
      category = { name: `${OUR_WORDS} + ${g.name}`, emoji: OUR_EMOJI };
    } else {
      category = { name: OUR_WORDS, emoji: OUR_EMOJI };
    }
  } else {
    if (groupDeck.length === 0) {
      groupDeck = rngShuffle(
        rng,
        state.groups.map((_, i) => i),
      );
      // Don't play the same group twice in a row across a reshuffle.
      if (groupDeck.length > 1 && groupDeck[0] === lastGroup) {
        groupDeck = [...groupDeck.slice(1), groupDeck[0]!];
      }
    }
    const gi = groupDeck[0]!;
    groupDeck = groupDeck.slice(1);
    lastGroup = gi;
    const g = state.groups[gi]!;
    primary = g.words;
    category = { name: g.name, emoji: g.emoji };
  }

  const board = drawBoard(primary, extra, size, used, rng);
  if (board.length < 3) throw new Error('Not enough words for a board.');
  const freshIdx = board.map((w, i) => (used.has(entryKey(w)) ? -1 : i)).filter((i) => i >= 0);
  const candidates = freshIdx.length > 0 ? freshIdx : board.map((_, i) => i);
  const secretIndex = candidates[rngInt(rng, candidates.length)]!;

  const everyone = state.seats.map((s) => s.index);
  const outsiders = rngShuffle(rng, everyone)
    .slice(0, state.options.outsiders)
    .sort((a, b) => a - b);
  const clueOrder = rngShuffle(rng, everyone);
  const firstAsker = rngInt(rng, n);

  return {
    ...state,
    phase: 'peek',
    rng,
    collect: null,
    groupDeck,
    lastGroup,
    usedSecrets: [...state.usedSecrets, entryKey(board[secretIndex]!)],
    round,
    category,
    board,
    secretIndex,
    outsiders,
    peeked: new Array<boolean>(n).fill(false),
    clueOrder,
    clueTurn: 0,
    clues: [],
    firstAsker,
    timer: null,
    votes: new Array<SeatIndex | null>(n).fill(null),
    voteOpenedAt: null,
    tally: null,
    accused: null,
    openVote: false,
    result: null,
  };
}

// ----------------------------------------------------------------------------
// Phase changes
// ----------------------------------------------------------------------------

function startPlay(state: OddOneOutState, now: number): OddOneOutState {
  if (state.options.format === 'questions') {
    return { ...state, phase: 'talk', timer: startTimer(state.options.talkMinutes * 60_000, now) };
  }
  return { ...state, phase: 'clues', clueTurn: 0, clues: [], timer: null };
}

function addClue(state: OddOneOutState, clue: Clue, now: number): OddOneOutState {
  const clues = [...state.clues, clue];
  const clueTurn = state.clueTurn + 1;
  if (clueTurn < state.clueOrder.length) return { ...state, clues, clueTurn };
  const secs = state.options.discussSeconds;
  return { ...state, clues, clueTurn, phase: 'discuss', timer: secs > 0 ? startTimer(secs * 1000, now) : null };
}

function openVote(state: OddOneOutState, now: number): OddOneOutState {
  return {
    ...state,
    phase: 'vote',
    timer: null,
    votes: new Array<SeatIndex | null>(state.seats.length).fill(null),
    voteOpenedAt: now,
  };
}

export function tallyVotes(votes: ReadonlyArray<SeatIndex | null>, n: number): number[] {
  const tally = new Array<number>(n).fill(0);
  for (const v of votes) if (v !== null && v >= 0 && v < n) tally[v]! += 1;
  return tally;
}

/** The single seat with the most votes, or null on a tie / no votes. */
export function topVoted(tally: readonly number[]): SeatIndex | null {
  const max = Math.max(0, ...tally);
  if (max === 0) return null;
  const top = tally.map((c, i) => (c === max ? i : -1)).filter((i) => i >= 0);
  return top.length === 1 ? top[0]! : null;
}

function afterAccusation(state: OddOneOutState, accused: SeatIndex | null, tally: number[], open: boolean): OddOneOutState {
  const next: OddOneOutState = { ...state, tally, accused, openVote: open, timer: null };
  if (accused === null) return resolve(next, 'tie', null);
  if (!state.outsiders.includes(accused)) return resolve(next, 'innocent', null);
  return { ...next, phase: 'lastChance' };
}

/** Points for a finished round. */
export function roundPoints(
  outsiders: readonly SeatIndex[],
  votes: ReadonlyArray<SeatIndex | null>,
  winner: Winner,
  guess: RoundGuess | null,
): number[] {
  const pts = new Array<number>(votes.length).fill(0);
  if (winner === 'outsiders') {
    for (const o of outsiders) pts[o]! += 2;
    if (guess?.correct) pts[guess.seat]! += 1;
  } else {
    for (let i = 0; i < votes.length; i++) {
      if (outsiders.includes(i)) continue;
      pts[i]! += 1;
      const v = votes[i];
      if (v !== null && v !== undefined && outsiders.includes(v)) pts[i]! += 1;
    }
  }
  return pts;
}

const WINNER: Record<Outcome, Winner> = {
  tie: 'outsiders',
  innocent: 'outsiders',
  stolen: 'outsiders',
  'early-right': 'outsiders',
  caught: 'insiders',
  'early-wrong': 'insiders',
};

function resolve(state: OddOneOutState, outcome: Outcome, guess: RoundGuess | null): OddOneOutState {
  const n = state.seats.length;
  const early = outcome === 'early-right' || outcome === 'early-wrong';
  // An early guess ends the round before any ballot counts.
  const votes = early ? new Array<SeatIndex | null>(n).fill(null) : state.votes.slice();
  const tally = early ? new Array<number>(n).fill(0) : (state.tally ?? tallyVotes(votes, n));
  const winner = WINNER[outcome];
  const points = roundPoints(state.outsiders, votes, winner, guess);
  const result: RoundResult = {
    round: state.round,
    category: { ...state.category! },
    board: state.board.slice(),
    secretIndex: state.secretIndex,
    secret: state.board[state.secretIndex] ?? '',
    outsiders: state.outsiders.slice(),
    votes,
    tally: tally.slice(),
    accused: early ? null : state.accused,
    openVote: !early && state.openVote,
    guess,
    winner,
    outcome,
    points,
  };
  return {
    ...state,
    phase: 'reveal',
    timer: null,
    votes,
    tally,
    accused: result.accused,
    result,
    scores: state.scores.map((s, i) => s + (points[i] ?? 0)),
    history: [...state.history, result],
  };
}

// ----------------------------------------------------------------------------
// Validation helpers
// ----------------------------------------------------------------------------

function assertRound(state: OddOneOutState, round: unknown): void {
  if (round !== state.round) throw new Error('That was for another round');
}

/** Clean and check a typed clue against the board and earlier clues. */
export function cleanClue(state: OddOneOutState, raw: unknown): string {
  const text = cleanEntry(raw);
  if (!text) throw new Error('Type a clue');
  if (text.length > MAX_CLUE_LENGTH) throw new Error(`Keep it under ${MAX_CLUE_LENGTH} letters`);
  if (/\s/.test(text)) throw new Error('One word only');
  const key = entryKey(text);
  if (!key) throw new Error('Type a real word');
  // Any board word is off limits — refusing all of them alike says nothing about the secret.
  if (state.board.some((w) => entryKey(w) === key)) throw new Error('That word is on the board — pick another');
  if (state.clues.some((c) => c.text !== null && entryKey(c.text) === key)) throw new Error('Someone already said that');
  return text;
}

const EARLY_PHASES = new Set(['clues', 'discuss', 'talk']);

// ----------------------------------------------------------------------------
// Reducer
// ----------------------------------------------------------------------------

function startMatch(state: OddOneOutState, ourWords: string[] | null): OddOneOutState {
  if (!ourWords && state.groups.length === 0) throw new Error('Nobody has written any words yet');
  return dealRound({ ...state, ourWords }, 0);
}

function collectedWords(state: OddOneOutState): string[] | null {
  if (!state.collect) return null;
  const words = buildPool({
    source: { packs: [], listIds: [], perPlayer: 0 },
    collected: collectedEntries(state.collect),
    skipPacks: true,
  }).map((p) => p.text);
  return words.length > 0 ? words : null;
}

function applyOddOneOut(state: OddOneOutState, action: OddOneOutAction, ctx: ActionContext): OddOneOutState {
  const n = state.seats.length;

  if (isCollectAction(action)) {
    if (state.phase !== 'collect' || !state.collect) throw new Error('Not collecting words');
    if (action.type === 'collect.close') {
      assertHostOnly(action);
      return startMatch(state, collectedWords(state));
    }
    const collect = collectReduce(state.collect, action, n);
    const next = { ...state, collect };
    if (!collectComplete(collect, n)) return next;
    return startMatch(next, collectedWords(next));
  }

  switch (action.type) {
    case 'peeked': {
      if (state.phase !== 'peek') throw new Error('Not looking at roles');
      assertRound(state, action.round);
      assertSeat(action.bySeat, n);
      if (state.peeked[action.bySeat]) throw new Error('Already got it');
      const peeked = state.peeked.slice();
      peeked[action.bySeat] = true;
      const next = { ...state, peeked };
      return peeked.every(Boolean) ? startPlay(next, ctx.now) : next;
    }

    case 'startPlay':
      assertHostOnly(action);
      if (state.phase !== 'peek') throw new Error('Not looking at roles');
      assertRound(state, action.round);
      return startPlay(state, ctx.now);

    case 'clue': {
      if (state.phase !== 'clues') throw new Error('Not giving clues');
      assertRound(state, action.round);
      assertSeat(action.bySeat, n);
      if (action.turn !== state.clueTurn) throw new Error('That clue turn is over');
      if (action.bySeat !== state.clueOrder[state.clueTurn]) throw new Error('It is not your turn');
      const text = action.text === null ? null : cleanClue(state, action.text);
      return addClue(state, { seat: action.bySeat, text, skipped: false }, ctx.now);
    }

    case 'skipClue': {
      assertHostOnly(action);
      if (state.phase !== 'clues') throw new Error('Not giving clues');
      assertRound(state, action.round);
      if (action.turn !== state.clueTurn) throw new Error('That clue turn is over');
      return addClue(state, { seat: state.clueOrder[state.clueTurn]!, text: null, skipped: true }, ctx.now);
    }

    case 'callVote':
      assertHostOnly(action);
      if (state.phase !== 'clues' && state.phase !== 'discuss' && state.phase !== 'talk') {
        throw new Error('Nothing to vote on yet');
      }
      assertRound(state, action.round);
      return openVote(state, ctx.now);

    case 'timeUp':
      assertHostOnly(action);
      if ((state.phase !== 'discuss' && state.phase !== 'talk') || action.round !== state.round) {
        throw new Error('Stale timer');
      }
      if (!state.timer || !isExpired(state.timer, ctx.now)) throw new Error('Time is not up yet');
      return openVote(state, ctx.now);

    case 'pause':
      assertHostOnly(action);
      if ((state.phase !== 'discuss' && state.phase !== 'talk') || !state.timer) throw new Error('Nothing to pause');
      return { ...state, timer: pauseTimer(state.timer, ctx.now) };

    case 'resume':
      assertHostOnly(action);
      if ((state.phase !== 'discuss' && state.phase !== 'talk') || !state.timer) throw new Error('Nothing to resume');
      return { ...state, timer: resumeTimer(state.timer, ctx.now) };

    case 'vote': {
      if (state.phase !== 'vote') throw new Error('Not voting');
      assertRound(state, action.round);
      assertSeat(action.bySeat, n);
      assertSeat(action.target, n);
      if (action.target === action.bySeat) throw new Error('You can’t vote for yourself');
      const votes = state.votes.slice();
      votes[action.bySeat] = action.target;
      const next = { ...state, votes };
      if (!votes.every((v) => v !== null)) return next;
      const tally = tallyVotes(votes, n);
      return afterAccusation(next, topVoted(tally), tally, false);
    }

    case 'closeVote': {
      assertHostOnly(action);
      if (state.phase !== 'vote') throw new Error('Not voting');
      assertRound(state, action.round);
      const tally = tallyVotes(state.votes, n);
      return afterAccusation(state, topVoted(tally), tally, false);
    }

    case 'accuse': {
      assertHostOnly(action);
      if (state.phase !== 'vote') throw new Error('Not voting');
      if (state.options.voting !== 'open') throw new Error('This game uses secret ballots');
      assertRound(state, action.round);
      if (action.seat !== null) assertSeat(action.seat, n);
      const votes = new Array<SeatIndex | null>(n).fill(null);
      return afterAccusation({ ...state, votes }, action.seat, new Array<number>(n).fill(0), true);
    }

    case 'guess': {
      assertRound(state, action.round);
      assertSeat(action.bySeat, n);
      assertInt(action.word, 0, state.board.length - 1, 'word');
      const correct = action.word === state.secretIndex;
      if (state.phase === 'lastChance') {
        if (action.bySeat !== state.accused) throw new Error('Only the accused can guess now');
        const guess: RoundGuess = { seat: action.bySeat, word: action.word, correct, early: false };
        return resolve(state, correct ? 'stolen' : 'caught', guess);
      }
      const inGrace = state.phase === 'vote' && state.voteOpenedAt !== null && ctx.now - state.voteOpenedAt <= GRACE_MS;
      if (!EARLY_PHASES.has(state.phase) && !inGrace) throw new Error('Too late to guess');
      if (!state.outsiders.includes(action.bySeat)) throw new Error('Only an outsider can guess the word');
      const guess: RoundGuess = { seat: action.bySeat, word: action.word, correct, early: true };
      return resolve(state, correct ? 'early-right' : 'early-wrong', guess);
    }

    case 'giveUp': {
      if (state.phase !== 'lastChance') throw new Error('No guess to give up');
      assertRound(state, action.round);
      if (action.bySeat !== undefined && action.bySeat !== state.accused) throw new Error('Only the accused can give up');
      return resolve(state, 'caught', { seat: state.accused!, word: null, correct: false, early: false });
    }

    case 'nextRound':
      assertHostOnly(action);
      if (state.phase !== 'reveal') throw new Error('The round isn’t over');
      assertRound(state, action.round);
      if (state.round + 1 >= state.options.rounds) return { ...state, phase: 'gameOver', timer: null };
      return dealRound(state, state.round + 1);

    case 'finish':
      assertHostOnly(action);
      if (state.phase === 'gameOver') throw new Error('Already over');
      return { ...state, phase: 'gameOver', timer: null, collect: null };

    default:
      throw new Error(`Unknown action ${(action as { type?: unknown }).type as string}`);
  }
}

// ============================================================================
// View — the redaction chokepoint
// ============================================================================

const IN_ROUND = new Set(['peek', 'clues', 'discuss', 'talk', 'vote', 'lastChance', 'reveal']);

function copyResult(r: RoundResult): RoundResult {
  return {
    ...r,
    category: { ...r.category },
    board: r.board.slice(),
    outsiders: r.outsiders.slice(),
    votes: r.votes.slice(),
    tally: r.tally.slice(),
    guess: r.guess ? { ...r.guess } : null,
    points: r.points.slice(),
  };
}

export function oddOneOutViewFor(state: OddOneOutState, seat: SeatIndex | null): OddOneOutView {
  const me = seat !== null && Number.isInteger(seat) && seat >= 0 && seat < state.seats.length ? seat : null;
  const phase = state.phase;
  const inRound = IN_ROUND.has(phase);
  const role = me !== null && inRound ? (state.outsiders.includes(me) ? 'outsider' : 'insider') : null;
  const revealed = phase === 'reveal';
  const showSecret = inRound && (revealed || role === 'insider');
  const voteClosed = phase === 'lastChance' || revealed;

  return {
    phase,
    seats: state.seats.map((s) => ({ ...s })),
    collect: phase === 'collect' && state.collect ? collectView(state.collect, me, state.seats.length) : null,
    round: state.round,
    rounds: state.options.rounds,
    format: state.options.format,
    voting: state.options.voting,
    outsiderCount: state.options.outsiders,
    boardSize: state.options.boardSize,
    discussSeconds: state.options.discussSeconds,

    category: inRound && state.category ? { ...state.category } : null,
    board: inRound ? state.board.slice() : [],
    you: role ? { role } : null,
    secretIndex: showSecret ? state.secretIndex : null,

    peeked: phase === 'peek' ? state.peeked.slice() : [],

    clueOrder: inRound && state.options.format === 'clues' ? state.clueOrder.slice() : [],
    clueTurn: phase === 'clues' ? state.clueTurn : 0,
    clueGiver: phase === 'clues' ? (state.clueOrder[state.clueTurn] ?? null) : null,
    clues: inRound ? state.clues.map((c) => ({ ...c })) : [],
    firstAsker: inRound && state.options.format === 'questions' ? state.firstAsker : null,
    timer: (phase === 'discuss' || phase === 'talk') && state.timer ? { ...state.timer } : null,

    voted: phase === 'vote' ? state.votes.map((v) => v !== null) : [],
    yourVote: phase === 'vote' && me !== null ? (state.votes[me] ?? null) : null,

    tally: voteClosed && state.tally ? state.tally.slice() : null,
    accused: voteClosed ? state.accused : null,
    openVote: voteClosed && state.openVote,

    result: revealed && state.result ? copyResult(state.result) : null,
    scores: state.scores.slice(),
    history: state.history.map(copyResult),
  };
}

// ============================================================================
// Module
// ============================================================================

export const oddOneOutModule: GameModule<OddOneOutState, OddOneOutView, OddOneOutAction> = {
  id: 'odd-one-out',
  displayName: 'Odd One Out',
  minPlayers: 3,
  maxPlayers: 12,

  createInitialState(config: GameConfig): OddOneOutState {
    const options = readOptions(config.gameOptions);
    const seats = config.seats.map((s, i) => ({ index: i, name: s.name }));
    const n = seats.length;
    if (n < this.minPlayers || n > this.maxPlayers) {
      throw new Error(`Odd One Out needs ${this.minPlayers}–${this.maxPlayers} players.`);
    }
    const problem = optionsProblem(config.gameOptions, n);
    if (problem) throw new Error(problem);
    const groups = buildGroups(options, config.lists);

    const base: OddOneOutState = {
      phase: 'collect',
      options,
      seats,
      rng: makeRng(subSeed(config.seed, 0x0dd1)),
      collect: null,
      groups,
      ourWords: null,
      groupDeck: [],
      lastGroup: null,
      usedSecrets: [],
      round: 0,
      category: null,
      board: [],
      secretIndex: 0,
      outsiders: [],
      peeked: new Array<boolean>(n).fill(false),
      clueOrder: [],
      clueTurn: 0,
      clues: [],
      firstAsker: 0,
      timer: null,
      votes: new Array<SeatIndex | null>(n).fill(null),
      voteOpenedAt: null,
      tally: null,
      accused: null,
      openVote: false,
      result: null,
      scores: new Array<number>(n).fill(0),
      history: [],
    };

    if (options.words.perPlayer > 0) {
      const k = options.words.perPlayer;
      return {
        ...base,
        collect: startCollect(
          'words',
          k,
          `Write ${k} word${k === 1 ? '' : 's'} for the board — things, places, people, anything.`,
        ),
      };
    }
    if (groups.length === 0) {
      throw new Error(`Not enough words for a board — pick a pack or a list with at least ${MIN_BOARD} words.`);
    }
    return dealRound(base, 0);
  },

  applyAction: applyOddOneOut,
  viewFor: oddOneOutViewFor,

  isFinished: (state) => state.phase === 'gameOver',

  defaultOptions: () => structuredClone(DEFAULT_OPTIONS) as unknown as Record<string, unknown>,

  optionsProblem,

  nextScheduled(state) {
    if (state.phase !== 'discuss' && state.phase !== 'talk') return null;
    if (!state.timer || state.timer.endsAt === null) return null;
    return { at: state.timer.endsAt, action: { type: 'timeUp', round: state.round } };
  },
};
