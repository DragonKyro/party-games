import { assertHostOnly, assertInt, assertSeat } from '@/engine/guards';
import { cloneRng, makeRng, rngInt, rngShuffle, subSeed, type RngState } from '@/engine/rng';
import { isExpired, pauseTimer, resumeTimer, startTimer } from '@/engine/timer';
import type { ActionContext, GameConfig, GameModule, SeatIndex } from '@/engine/types';
import {
  collectComplete,
  collectReduce,
  collectView,
  collectedEntries,
  isCollectAction,
  splitPair,
  startCollect,
} from '@/words/collect';
import { SPECTRUMS, SPECTRUMS_SPICY } from '@/words/prompts/spectrums';
import { buildPromptPool, entryKey } from '@/words/source';
import type { TuneInAction } from './actions';
import {
  DEFAULT_OPTIONS,
  DIAL_MAX,
  MAX_TARGET,
  MIN_SPECTRUMS,
  MIN_TARGET,
  NEEDLE_START,
  ceilAverage,
  cleanClue,
  clueProblem,
  optionsProblem,
  pointsFor,
  ratingFor,
  readOptions,
  totalRounds,
} from './rules';
import type { GuessRecord, RoundRecord, SpectrumCard, TuneInState, TuneInView } from './state';

// ============================================================================
// Tune In — module
// ============================================================================

/** A lock or nudge a moment after the buzzer still counts (network lag). */
export const GRACE_MS = 1200;

const pairText = ([l, r]: readonly [string, string]) => `${l} | ${r}`;
const BUILT_IN = SPECTRUMS.map(pairText);
const BUILT_IN_SPICY = SPECTRUMS_SPICY.map(pairText);

/** Who is tuning this turn. */
export function tunerOf(state: Pick<TuneInState, 'firstTuner' | 'turnNo' | 'seats'>): SeatIndex {
  return (state.firstTuner + state.turnNo) % state.seats.length;
}

/** Parse + dedupe "Left | Right" entries into cards (player-written first). */
function makeCards(entries: ReadonlyArray<{ text: string; author: SeatIndex | null }>): SpectrumCard[] {
  const seen = new Set<string>();
  const out: SpectrumCard[] = [];
  for (const e of entries) {
    const [left, right] = splitPair(e.text);
    const lk = entryKey(left);
    const rk = entryKey(right);
    if (!lk || !rk || lk === rk) continue;
    const key = `${lk}|${rk}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ id: out.length, left, right, author: e.author });
  }
  return out;
}

/** Deal two options off the deck, reshuffling everything else back in when it runs low. */
function draw(state: TuneInState, rng: RngState): { offer: [number, number]; deck: number[] } {
  let deck = state.deck;
  if (deck.length < 2) {
    const inDeck = new Set(deck);
    deck = [
      ...deck,
      ...rngShuffle(
        rng,
        state.cards.map((c) => c.id).filter((id) => !inDeck.has(id)),
      ),
    ];
  }
  return { offer: [deck[0]!, deck[1]!], deck: deck.slice(2) };
}

/** Deal the current turn: two spectrums and a fresh secret target. */
function startTurn(state: TuneInState): TuneInState {
  const rng = cloneRng(state.rng);
  const { offer, deck } = draw(state, rng);
  const target = MIN_TARGET + rngInt(rng, MAX_TARGET - MIN_TARGET + 1);
  const n = state.seats.length;
  return {
    ...state,
    rng,
    phase: 'tune',
    offer,
    deck,
    target,
    chosen: null,
    clue: null,
    timer: null,
    needles: new Array<number | null>(n).fill(null),
    locked: new Array<boolean>(n).fill(false),
    shared: NEEDLE_START,
    sharedTouched: false,
    sharedBy: null,
  };
}

/** Next Tuner. `consumeRound`: the round counts toward the total. */
function advance(state: TuneInState, consumeRound: boolean): TuneInState {
  const round = consumeRound ? state.round + 1 : state.round;
  const next: TuneInState = {
    ...state,
    round,
    turnNo: state.turnNo + 1,
    offer: null,
    chosen: null,
    clue: null,
    timer: null,
  };
  if (round >= state.totalRounds) return { ...next, phase: 'gameOver' };
  return startTurn(next);
}

/** Players are done writing: build the deck (falling back to built-ins if too few) and start. */
function startFromCollect(state: TuneInState, collected: Array<{ text: string; author: SeatIndex }>): TuneInState {
  let cards = makeCards([...collected, ...state.basePool]);
  if (cards.length < MIN_SPECTRUMS) {
    cards = makeCards([...collected, ...state.basePool, ...BUILT_IN.map((text) => ({ text, author: null }))]);
  }
  return startTurn({ ...state, collect: null, cards, deck: [] });
}

function score(state: TuneInState, needle: number | null): number {
  return needle === null ? 0 : pointsFor(Math.abs(needle - state.target), state.options.bands);
}

/** Guessing is over: score it and show everything. */
function doReveal(state: TuneInState, how: RoundRecord['how']): TuneInState {
  const tuner = tunerOf(state);
  const card = state.cards[state.chosen!]!;
  let guesses: GuessRecord[] = [];
  let tunerPoints = 0;
  let team: RoundRecord['team'] = null;
  if (state.options.mode === 'everyone') {
    guesses = state.seats
      .filter((s) => s.index !== tuner)
      .map((s) => {
        const needle = state.needles[s.index] ?? null;
        return { seat: s.index, needle, locked: !!state.locked[s.index], points: score(state, needle) };
      });
    tunerPoints = ceilAverage(guesses.filter((g) => g.needle !== null).map((g) => g.points));
  } else {
    // A deliberate lock counts wherever the needle is; at the buzzer an untouched needle scores 0.
    const needle = how === 'locked' || state.sharedTouched ? state.shared : null;
    team = { needle, points: score(state, needle), by: state.sharedBy };
  }
  const record: RoundRecord = {
    round: state.round,
    tuner,
    left: card.left,
    right: card.right,
    author: card.author,
    clue: state.clue ?? '',
    target: state.target,
    how,
    guesses,
    tunerPoints,
    team,
  };
  return { ...state, phase: 'reveal', timer: null, history: [...state.history, record] };
}

/** Common checks for needle actions; returns the acting seat (null = host / table). */
function assertGuessing(state: TuneInState, action: { bySeat?: unknown; turn: unknown }, now: number): SeatIndex | null {
  if (state.phase !== 'guess') throw new Error('Not guessing right now');
  if (action.turn !== state.turnNo) throw new Error('That round is over');
  if (state.timer && isExpired(state.timer, now - GRACE_MS)) throw new Error("Time's up");
  if (action.bySeat === undefined) return null;
  assertSeat(action.bySeat, state.seats.length);
  if (action.bySeat === tunerOf(state)) throw new Error('The Tuner can’t touch the dial');
  return action.bySeat;
}

function applyTuneIn(state: TuneInState, action: TuneInAction, ctx: ActionContext): TuneInState {
  const n = state.seats.length;

  if (isCollectAction(action)) {
    if (state.phase !== 'collect' || !state.collect) throw new Error('Not collecting spectrums');
    if (action.type === 'collect.close') {
      assertHostOnly(action);
      return startFromCollect(state, collectedEntries(state.collect));
    }
    const collect = collectReduce(state.collect, action, n);
    const next = { ...state, collect };
    if (!collectComplete(collect, n)) return next;
    return startFromCollect(next, collectedEntries(collect));
  }

  switch (action.type) {
    case 'tune': {
      if (state.phase !== 'tune' || !state.offer) throw new Error('Not tuning right now');
      assertSeat(action.bySeat, n);
      if (action.bySeat !== tunerOf(state)) throw new Error('Only the Tuner can do that');
      if (action.turn !== state.turnNo) throw new Error('That round is over');
      assertInt(action.pick, 0, 1, 'spectrum');
      const id = state.offer[action.pick]!;
      const other = state.offer[1 - action.pick]!;
      const card = state.cards[id]!;
      const clue = cleanClue(action.clue);
      const problem = clueProblem(clue, card.left, card.right);
      if (problem) throw new Error(problem);
      const secs = state.options.guessSeconds;
      return {
        ...state,
        phase: 'guess',
        chosen: id,
        offer: null,
        // The one not chosen goes to the bottom of the deck.
        deck: [...state.deck, other],
        clue,
        timer: secs > 0 ? startTimer(secs * 1000, ctx.now) : null,
      };
    }

    case 'move': {
      const seat = assertGuessing(state, action, ctx.now);
      assertInt(action.value, 0, DIAL_MAX, 'needle position');
      if (state.options.mode === 'everyone') {
        if (seat === null) throw new Error('Whose needle?');
        if (state.locked[seat]) throw new Error('You’ve already locked in');
        const needles = state.needles.slice();
        needles[seat] = action.value;
        return { ...state, needles };
      }
      return { ...state, shared: action.value, sharedTouched: true, sharedBy: seat };
    }

    case 'lock': {
      const seat = assertGuessing(state, action, ctx.now);
      if (action.value !== undefined) assertInt(action.value, 0, DIAL_MAX, 'needle position');
      if (state.options.mode === 'everyone') {
        if (seat === null) throw new Error('Whose needle?');
        if (state.locked[seat]) throw new Error('You’ve already locked in');
        const value = action.value ?? state.needles[seat];
        if (value === null || value === undefined) throw new Error('Set your needle first');
        const needles = state.needles.slice();
        const locked = state.locked.slice();
        needles[seat] = value;
        locked[seat] = true;
        const next = { ...state, needles, locked };
        const tuner = tunerOf(state);
        const all = state.seats.every((s) => s.index === tuner || locked[s.index]);
        return all ? doReveal(next, 'locked') : next;
      }
      const next =
        action.value === undefined ? state : { ...state, shared: action.value, sharedTouched: true, sharedBy: seat };
      return doReveal(next, 'locked');
    }

    case 'timeUp': {
      assertHostOnly(action);
      if (state.phase !== 'guess' || action.turn !== state.turnNo) throw new Error('Stale timer');
      if (!state.timer || !isExpired(state.timer, ctx.now)) throw new Error('Time is not up yet');
      return doReveal(state, 'timeUp');
    }

    case 'reveal':
      assertHostOnly(action);
      if (state.phase !== 'guess') throw new Error('Nothing to reveal');
      return doReveal(state, 'forced');

    case 'next':
      assertHostOnly(action);
      if (state.phase !== 'reveal') throw new Error('Not at a reveal');
      return advance(state, true);

    case 'skipTuner': {
      assertHostOnly(action);
      if (state.phase !== 'tune' || !state.offer) throw new Error('Only while the Tuner is choosing');
      const skipped = [...state.skipped, tunerOf(state)];
      const back = { ...state, skipped, deck: [...state.deck, ...state.offer] };
      // Everyone mode: that player's turn is forfeited. Co-op: the next player tunes the same round.
      return advance(back, state.options.mode === 'everyone');
    }

    case 'pause':
      assertHostOnly(action);
      if (state.phase !== 'guess' || !state.timer) throw new Error('Nothing to pause');
      return { ...state, timer: pauseTimer(state.timer, ctx.now) };

    case 'resume':
      assertHostOnly(action);
      if (state.phase !== 'guess' || !state.timer) throw new Error('Nothing to resume');
      return { ...state, timer: resumeTimer(state.timer, ctx.now) };

    case 'finish':
      assertHostOnly(action);
      if (state.phase === 'gameOver') throw new Error('Already over');
      return { ...state, phase: 'gameOver', timer: null, offer: null };

    default:
      throw new Error(`Unknown action ${(action as { type?: unknown }).type as string}`);
  }
}

// ============================================================================
// View — the redaction chokepoint
// ============================================================================

export function tuneInViewFor(state: TuneInState, seat: SeatIndex | null): TuneInView {
  const n = state.seats.length;
  const me = seat !== null && Number.isInteger(seat) && seat >= 0 && seat < n ? seat : null;
  const inRound = state.phase === 'tune' || state.phase === 'guess' || state.phase === 'reveal';
  const tuner = inRound ? tunerOf(state) : null;
  const isTuner = me !== null && me === tuner;
  const onAir = (state.phase === 'guess' || state.phase === 'reveal') && state.chosen !== null;
  const card = onAir ? state.cards[state.chosen!] : undefined;
  const everyone = state.options.mode === 'everyone';
  const guessing = state.phase === 'guess';

  const scores = new Array<number>(n).fill(0);
  let teamTotal = 0;
  for (const r of state.history) {
    for (const g of r.guesses) scores[g.seat]! += g.points;
    scores[r.tuner]! += r.tunerPoints;
    teamTotal += r.team?.points ?? 0;
  }

  const history = state.history.map((r) => ({
    ...r,
    guesses: r.guesses.map((g) => ({ ...g })),
    team: r.team ? { ...r.team } : null,
  }));

  return {
    phase: state.phase,
    mode: state.options.mode,
    seats: state.seats.map((s) => ({ index: s.index, name: s.name })),
    collect: state.phase === 'collect' && state.collect ? collectView(state.collect, me, n) : null,
    round: state.round,
    totalRounds: state.totalRounds,
    turnNo: state.turnNo,
    tuner,
    bands: state.options.bands.slice(),
    guessSeconds: state.options.guessSeconds,

    yourOptions:
      isTuner && state.phase === 'tune' && state.offer
        ? state.offer.map((id) => ({ left: state.cards[id]!.left, right: state.cards[id]!.right }))
        : null,
    yourTarget: isTuner && (state.phase === 'tune' || state.phase === 'guess') ? state.target : null,

    spectrum: card ? { left: card.left, right: card.right } : null,
    clue: onAir ? state.clue : null,
    timer: guessing && state.timer ? { ...state.timer } : null,

    locked: everyone && guessing ? state.locked.slice() : new Array<boolean>(n).fill(false),
    yourNeedle: everyone && (guessing || state.phase === 'reveal') && me !== null && !isTuner ? (state.needles[me] ?? null) : null,
    shared:
      !everyone && (guessing || state.phase === 'reveal')
        ? { value: state.shared, touched: state.sharedTouched, by: state.sharedBy }
        : null,

    reveal: state.phase === 'reveal' ? (history[history.length - 1] ?? null) : null,
    history,
    scores,
    teamTotal,
    rating: everyone ? null : ratingFor(teamTotal, state.history.length),
  };
}

// ============================================================================
// Module
// ============================================================================

export const tuneInModule: GameModule<TuneInState, TuneInView, TuneInAction> = {
  id: 'tune-in',
  displayName: 'Tune In',
  minPlayers: 2,
  maxPlayers: 16,

  createInitialState(config: GameConfig): TuneInState {
    const options = readOptions(config.gameOptions);
    const seats = config.seats.map((s, i) => ({ index: i, name: s.name }));
    const n = seats.length;
    if (n < this.minPlayers || n > this.maxPlayers) {
      throw new Error(`Tune In needs ${this.minPlayers}–${this.maxPlayers} players.`);
    }
    const problem = optionsProblem(config.gameOptions, n);
    if (problem) throw new Error(problem);

    const rng = makeRng(subSeed(config.seed, 0x7e11));
    const basePool = buildPromptPool({
      source: { ...options.spectrums, perPlayer: 0 },
      builtIn: BUILT_IN,
      spicy: BUILT_IN_SPICY,
      lists: config.lists,
    }).map((p) => ({ text: p.text, author: null }));

    const base: TuneInState = {
      phase: 'tune',
      options,
      seats,
      rng,
      collect: null,
      basePool,
      cards: [],
      deck: [],
      firstTuner: rngInt(rng, n),
      totalRounds: totalRounds(options, n),
      round: 0,
      turnNo: 0,
      offer: null,
      target: NEEDLE_START,
      chosen: null,
      clue: null,
      timer: null,
      needles: new Array<number | null>(n).fill(null),
      locked: new Array<boolean>(n).fill(false),
      shared: NEEDLE_START,
      sharedTouched: false,
      sharedBy: null,
      history: [],
      skipped: [],
    };

    if (options.spectrums.perPlayer > 0) {
      const k = options.spectrums.perPlayer;
      return {
        ...base,
        phase: 'collect',
        collect: startCollect('pairs', k, `Write ${k} spectrum${k === 1 ? '' : 's'}: two opposite ends of a scale.`),
      };
    }
    const cards = makeCards(basePool);
    if (cards.length < MIN_SPECTRUMS) {
      throw new Error(`Only ${cards.length} spectrum${cards.length === 1 ? '' : 's'} available — add more or use the built-in ones.`);
    }
    return startTurn({ ...base, cards });
  },

  applyAction: applyTuneIn,
  viewFor: tuneInViewFor,

  isFinished: (state) => state.phase === 'gameOver',

  defaultOptions: () => structuredClone(DEFAULT_OPTIONS) as unknown as Record<string, unknown>,

  optionsProblem,

  nextScheduled(state) {
    if (state.phase !== 'guess' || !state.timer || state.timer.endsAt === null) return null;
    // Fire just after the grace window so last-moment locks still land.
    return { at: state.timer.endsAt + GRACE_MS, action: { type: 'timeUp', turn: state.turnNo } };
  },
};
