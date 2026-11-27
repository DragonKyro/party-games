import { assertHostOnly, assertInt, assertSeat } from '@/engine/guards';
import { cloneRng, makeRng, rngInt, rngShuffle, subSeed, type RngState } from '@/engine/rng';
import { isExpired, isPaused, pauseTimer, resumeTimer, startTimer, timeLeft } from '@/engine/timer';
import type { ActionContext, GameConfig, GameModule, LiveBoard, ScheduledAction, SeatIndex } from '@/engine/types';
import {
  collectComplete,
  collectReduce,
  collectView,
  collectedEntries,
  isCollectAction,
  startCollect,
} from '@/words/collect';
import { containsAnswer, hintCells, hintableIndexes, isCloseGuess, isCorrectGuess } from '@/words/match';
import { buildPool, cleanEntry, entryKey } from '@/words/source';
import type { SketchAction } from './actions';
import {
  CHOICES,
  CHOOSE_MS,
  DEFAULT_OPTIONS,
  DRAWER_PER_SOLVER,
  FEED_LIMIT,
  GRACE_MS,
  GUESS_INTERVAL_MS,
  HINT_AT,
  MAX_GUESS_LENGTH,
  MAX_PLAYERS,
  MIN_PLAYERS,
  MIN_WORDS,
  REVEAL_MS,
  guessPoints,
  hintPlan,
  optionsProblem,
  readOptions,
  spokenPoints,
} from './rules';
import type {
  FeedEntry,
  FeedView,
  SketchResults,
  SketchState,
  SketchView,
  Solve,
  TurnRecord,
  WordEntry,
} from './state';

// ============================================================================
// Sketch & Guess — module
// ============================================================================

const RNG_SALT = 0x5c37c4;
/** Host-list words kept in the pool (shuffled, then capped). */
const LIST_CAP = 400;

type TurnPhase = 'choose' | 'drawing' | 'reveal';
const TURN_PHASES: ReadonlySet<string> = new Set<TurnPhase>(['choose', 'drawing', 'reveal']);

function inTurn(state: SketchState): boolean {
  return TURN_PHASES.has(state.phase) && state.drawer !== null;
}

/** The live board id for the current turn: new each turn, kept through the reveal. */
export function boardIdFor(state: SketchState): string | null {
  return inTurn(state) ? `sk-${state.boardNonce}-${state.turnNo}` : null;
}

export function roundOf(state: SketchState): number {
  return Math.floor(state.turnNo / Math.max(1, state.seats.length));
}

function wordText(state: SketchState, id: number | null): string {
  return id === null ? '' : (state.pool[id]?.text ?? '');
}

// ---- the word deck ----------------------------------------------------------

/** Player-written words join the pool (first, keeping their author; duplicates dropped). */
function withCollected(pool: WordEntry[], collected: Array<{ text: string; author: SeatIndex }>): WordEntry[] {
  const seen = new Set<string>();
  const out: WordEntry[] = [];
  for (const c of collected) {
    const text = cleanEntry(c.text);
    const key = entryKey(text);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({ text, author: c.author, custom: true });
  }
  for (const w of pool) {
    const key = entryKey(w.text);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(w);
  }
  return out;
}

/** Custom words (players', host lists) first, then pack words; each part shuffled. */
function buildDeck(pool: WordEntry[], rng: RngState): number[] {
  const custom: number[] = [];
  const packs: number[] = [];
  pool.forEach((w, i) => (w.custom ? custom : packs).push(i));
  return [...rngShuffle(rng, custom), ...rngShuffle(rng, packs)];
}

/** The first CHOICES words in the deck the drawer didn't write. */
function offer(pool: WordEntry[], deck: number[], drawer: SeatIndex): { choices: number[]; deck: number[] } {
  const choices: number[] = [];
  const rest: number[] = [];
  for (const id of deck) {
    if (choices.length < CHOICES && pool[id]?.author !== drawer) choices.push(id);
    else rest.push(id);
  }
  return { choices, deck: rest };
}

/** Unchosen words go back: custom ones after the other custom words, pack ones to the end. */
function returnToDeck(pool: WordEntry[], deck: number[], ids: number[]): number[] {
  const out = deck.slice();
  for (const id of ids) {
    if (pool[id]?.custom) {
      const at = out.findIndex((i) => !pool[i]?.custom);
      out.splice(at < 0 ? out.length : at, 0, id);
    } else {
      out.push(id);
    }
  }
  return out;
}

// ---- turns -------------------------------------------------------------------

function clearTurn(state: SketchState): SketchState {
  return {
    ...state,
    choices: [],
    word: null,
    timer: null,
    hintOrder: [],
    hintsShown: 0,
    hintStage: 0,
    solves: [],
    feed: [],
    feedCounts: {},
  };
}

function gameOver(state: SketchState): SketchState {
  return { ...clearTurn(state), phase: 'gameOver', drawer: null };
}

/** Start turn `turnNo` (or the first later one whose drawer can be offered a word). */
function startTurnAt(state: SketchState, turnNo: number, now: number): SketchState {
  const n = state.seats.length;
  for (let t = turnNo; t < state.totalTurns; t++) {
    const drawer = state.order[t % n]!;
    const o = offer(state.pool, state.deck, drawer);
    if (o.choices.length === 0) continue; // nothing left this drawer didn't write
    return {
      ...clearTurn(state),
      phase: 'choose',
      turnNo: t,
      drawer,
      choices: o.choices,
      deck: o.deck,
      // Passing one device round takes a while: a local table waits for the pick.
      timer: state.localTable ? null : startTimer(CHOOSE_MS, now),
    };
  }
  return gameOver({ ...state, turnNo: state.totalTurns });
}

function pickWord(state: SketchState, index: number, now: number): SketchState {
  const id = state.choices[index]!;
  const others = state.choices.filter((_, i) => i !== index);
  const rng = cloneRng(state.rng);
  const letters = hintableIndexes(wordText(state, id));
  const hintOrder = state.options.hints ? rngShuffle(rng, letters).slice(0, hintPlan(letters.length)[1]) : [];
  return {
    ...clearTurn(state),
    rng,
    phase: 'drawing',
    word: id,
    deck: returnToDeck(state.pool, state.deck, others),
    timer: startTimer(state.options.turnSeconds * 1000, now),
    hintOrder,
  };
}

/** Gains this turn so far, per seat (drawer included). */
function turnGains(state: SketchState): number[] {
  const gains = new Array<number>(state.seats.length).fill(0);
  for (const s of state.solves) gains[s.seat]! += s.points;
  if (state.drawer !== null) gains[state.drawer]! += DRAWER_PER_SOLVER * state.solves.length;
  return gains;
}

/** The drawing is over: bank the points and show the answer. */
function finishTurn(state: SketchState, now: number, skipped: boolean): SketchState {
  const drawer = state.drawer!;
  const gains = turnGains(state);
  const record: TurnRecord = {
    turn: state.turnNo,
    round: roundOf(state),
    drawer,
    word: wordText(state, state.word),
    author: state.word === null ? null : (state.pool[state.word]?.author ?? null),
    solves: state.solves.map((s) => ({ ...s })),
    drawerPoints: DRAWER_PER_SOLVER * state.solves.length,
    skipped,
  };
  return {
    ...state,
    phase: 'reveal',
    scores: state.scores.map((s, i) => s + (gains[i] ?? 0)),
    history: [...state.history, record],
    timer: startTimer(REVEAL_MS, now),
  };
}

function everyoneSolved(state: SketchState): boolean {
  return state.solves.length >= state.seats.length - 1;
}

/** Visibility class: entries in one class are seen by exactly the same viewers. */
function feedClass(e: Pick<FeedEntry, 'vis' | 'seat'>): string {
  return e.vis === 'all' ? 'a' : e.vis === 'solvers' ? 'c' : `s${e.seat}`;
}

/**
 * Append to the feed. Keys are numbered per class and each class is capped
 * on its own, so what one viewer sees never depends on entries hidden from
 * them (no id gaps, no public lines pushed out by private ones).
 */
function addFeed(state: SketchState, entry: Omit<FeedEntry, 'key'>): SketchState {
  const cls = feedClass(entry);
  const count = (state.feedCounts[cls] ?? 0) + 1;
  const feed = [...state.feed, { key: `${state.turnNo}${cls}.${count}`, ...entry }];
  if (feed.filter((e) => feedClass(e) === cls).length > FEED_LIMIT) {
    feed.splice(
      feed.findIndex((e) => feedClass(e) === cls),
      1,
    );
  }
  return { ...state, feed, feedCounts: { ...state.feedCounts, [cls]: count } };
}

/** Cumulative letters showing after each hint stage. */
function hintCounts(state: SketchState): [number, number] {
  const k = state.hintOrder.length;
  return [Math.ceil(k / 2), k];
}

/** The next hint that would show something new: its stage and how much time is left when it fires. */
function nextHint(state: SketchState): { stage: number; leftMs: number } | null {
  if (!state.options.hints || state.phase !== 'drawing' || !state.timer) return null;
  const counts = hintCounts(state);
  for (let s = state.hintStage; s < HINT_AT.length; s++) {
    if (counts[s]! > state.hintsShown) {
      return { stage: s, leftMs: Math.round(state.timer.durationMs * (1 - HINT_AT[s]!)) };
    }
  }
  return null;
}

function cleanGuess(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.replace(/\s+/g, ' ').trim().slice(0, MAX_GUESS_LENGTH);
}

// ---- validation ------------------------------------------------------------------

function assertPhase(state: SketchState, phase: TurnPhase, turn: unknown): void {
  if (state.phase !== phase) throw new Error(phase === 'drawing' ? 'Nobody is drawing' : `Not in the ${phase} phase`);
  if (turn !== state.turnNo) throw new Error('That turn is over');
}

/** "Drawer or host" actions: a seat must be the drawer; no seat = the host. */
function assertDrawerOrHost(state: SketchState, action: { bySeat?: unknown }): void {
  if (typeof action.bySeat !== 'number') return;
  assertSeat(action.bySeat, state.seats.length);
  if (action.bySeat !== state.drawer) throw new Error('Only the drawer can do that');
}

function assertBeforeBuzzer(state: SketchState, now: number): void {
  const t = state.timer;
  if (t && t.endsAt !== null && now > t.endsAt + GRACE_MS) throw new Error("Time's up");
}

function assertGuesser(state: SketchState, seat: unknown): asserts seat is SeatIndex {
  assertSeat(seat, state.seats.length);
  if (seat === state.drawer) throw new Error("The drawer can't guess");
}

// ---- the reducer -------------------------------------------------------------------

function beginPlay(
  state: SketchState,
  collected: Array<{ text: string; author: SeatIndex }>,
  now: number,
): SketchState {
  const pool = withCollected(state.pool, collected);
  if (pool.length === 0) throw new Error('No words to draw — add some, or pick a pack.');
  const rng = cloneRng(state.rng);
  const deck = buildDeck(pool, rng);
  return startTurnAt({ ...state, rng, pool, deck, collect: null }, 0, now);
}

function applySketch(state: SketchState, action: SketchAction, ctx: ActionContext): SketchState {
  const n = state.seats.length;

  if (isCollectAction(action)) {
    if (state.phase !== 'collect' || !state.collect) throw new Error('Not collecting words');
    if (action.type === 'collect.close') {
      assertHostOnly(action);
      return beginPlay(state, collectedEntries(state.collect), ctx.now);
    }
    const collect = collectReduce(state.collect, action, n);
    if (!collectComplete(collect, n)) return { ...state, collect };
    return beginPlay({ ...state, collect }, collectedEntries(collect), ctx.now);
  }

  switch (action.type) {
    case 'choose': {
      assertPhase(state, 'choose', action.turn);
      assertDrawerOrHost(state, action);
      assertInt(action.index, 0, state.choices.length - 1, 'word choice');
      return pickWord(state, action.index, ctx.now);
    }

    case 'chooseTimeUp': {
      assertHostOnly(action);
      assertPhase(state, 'choose', action.turn);
      if (!state.timer || !isExpired(state.timer, ctx.now)) throw new Error('Still choosing');
      const rng = cloneRng(state.rng);
      const index = rngInt(rng, state.choices.length);
      return pickWord({ ...state, rng }, index, ctx.now);
    }

    case 'guess': {
      if (state.guessing !== 'typed') throw new Error('Shout your guesses out loud in this game');
      assertPhase(state, 'drawing', action.turn);
      assertGuesser(state, action.bySeat);
      const seat = action.bySeat;
      const timer = state.timer!;
      if (isPaused(timer)) throw new Error('The game is paused');
      assertBeforeBuzzer(state, ctx.now);
      const last = state.lastGuessAt[seat];
      if (typeof last === 'number' && ctx.now - last < GUESS_INTERVAL_MS) throw new Error('Slow down!');
      const text = cleanGuess(action.text);
      if (!text) throw new Error('Type a guess');

      const lastGuessAt = state.lastGuessAt.slice();
      lastGuessAt[seat] = ctx.now;
      const next: SketchState = { ...state, lastGuessAt };
      const answer = wordText(state, state.word);

      if (state.solves.some((s) => s.seat === seat)) {
        // Already solved: a message only the other solvers and the drawer see.
        return addFeed(next, { seat, kind: 'chat', text, points: null, vis: 'solvers' });
      }
      if (isCorrectGuess(text, answer)) {
        const left = timeLeft(timer, ctx.now);
        const points = guessPoints(left / Math.max(1, timer.durationMs), state.solves.length);
        const solve: Solve = { seat, points, ms: timer.durationMs - left };
        const solved = addFeed(
          { ...next, solves: [...state.solves, solve] },
          { seat, kind: 'solved', text: '', points, vis: 'all' },
        );
        return everyoneSolved(solved) ? finishTurn(solved, ctx.now, false) : solved;
      }
      if (isCloseGuess(text, answer) || containsAnswer(text, answer)) {
        // A nudge for the guesser — and a giveaway nobody else may read.
        return addFeed(next, { seat, kind: 'close', text, points: null, vis: 'self' });
      }
      return addFeed(next, { seat, kind: 'guess', text, points: null, vis: 'all' });
    }

    case 'award': {
      if (state.guessing !== 'spoken') throw new Error('Guesses are typed in this game');
      assertPhase(state, 'drawing', action.turn);
      assertDrawerOrHost(state, action);
      assertGuesser(state, action.seat);
      const seat = action.seat;
      if (state.solves.some((s) => s.seat === seat)) throw new Error('They already got it');
      assertBeforeBuzzer(state, ctx.now);
      const timer = state.timer!;
      const points = spokenPoints(state.solves.length);
      const solve: Solve = { seat, points, ms: timer.durationMs - timeLeft(timer, ctx.now) };
      return addFeed({ ...state, solves: [...state.solves, solve] }, { seat, kind: 'solved', text: '', points, vis: 'all' });
    }

    case 'unaward': {
      if (state.guessing !== 'spoken') throw new Error('Guesses are typed in this game');
      assertPhase(state, 'drawing', action.turn);
      assertDrawerOrHost(state, action);
      assertSeat(action.seat, n);
      const seat = action.seat;
      if (!state.solves.some((s) => s.seat === seat)) throw new Error("They weren't marked");
      // Everyone after them moves up a place.
      const solves = state.solves.filter((s) => s.seat !== seat).map((s, i) => ({ ...s, points: spokenPoints(i) }));
      const pointsOf = new Map(solves.map((s) => [s.seat, s.points]));
      const feed = state.feed
        .filter((e) => !(e.kind === 'solved' && e.seat === seat))
        .map((e) => (e.kind === 'solved' ? { ...e, points: pointsOf.get(e.seat) ?? e.points } : e));
      return { ...state, solves, feed };
    }

    case 'endTurn': {
      if (state.guessing !== 'spoken') throw new Error('The turn ends when everyone gets it or time runs out');
      assertPhase(state, 'drawing', action.turn);
      assertDrawerOrHost(state, action);
      return finishTurn(state, ctx.now, false);
    }

    case 'hint': {
      assertHostOnly(action);
      assertPhase(state, 'drawing', action.turn);
      assertInt(action.stage, 0, HINT_AT.length - 1, 'hint stage');
      const due = nextHint(state);
      if (!due || action.stage < due.stage) throw new Error('No hint due');
      const timer = state.timer!;
      if (isPaused(timer) || timeLeft(timer, ctx.now) > Math.round(timer.durationMs * (1 - HINT_AT[action.stage]!))) {
        throw new Error('Too early for that hint');
      }
      return { ...state, hintStage: action.stage + 1, hintsShown: hintCounts(state)[action.stage]! };
    }

    case 'timeUp': {
      assertHostOnly(action);
      assertPhase(state, 'drawing', action.turn);
      const t = state.timer;
      if (!t || t.endsAt === null || ctx.now < t.endsAt + GRACE_MS) throw new Error('Time is not up yet');
      return finishTurn(state, ctx.now, false);
    }

    case 'next':
      assertHostOnly(action);
      assertPhase(state, 'reveal', action.turn);
      return startTurnAt(state, state.turnNo + 1, ctx.now);

    case 'pause':
    case 'resume': {
      assertHostOnly(action);
      if (!inTurn(state) || !state.timer) throw new Error(`Nothing to ${action.type}`);
      const timer = action.type === 'pause' ? pauseTimer(state.timer, ctx.now) : resumeTimer(state.timer, ctx.now);
      return { ...state, timer };
    }

    case 'skipTurn': {
      assertHostOnly(action);
      if (action.turn !== state.turnNo) throw new Error('That turn is over');
      if (state.phase === 'choose') {
        const deck = returnToDeck(state.pool, state.deck, state.choices);
        return startTurnAt({ ...state, deck, choices: [] }, state.turnNo + 1, ctx.now);
      }
      if (state.phase === 'drawing') return finishTurn(state, ctx.now, true);
      throw new Error('No turn to skip');
    }

    case 'finish': {
      assertHostOnly(action);
      if (state.phase === 'gameOver') throw new Error('Already over');
      // Points already won in a drawing cut short still count.
      const banked = state.phase === 'drawing' ? finishTurn(state, ctx.now, true) : state;
      return gameOver({ ...banked, collect: null });
    }

    default:
      throw new Error(`Unknown action ${(action as { type?: unknown }).type as string}`);
  }
}

// ============================================================================
// View — the redaction chokepoint
// ============================================================================

function results(state: SketchState): SketchResults {
  const n = state.seats.length;
  const drawn = new Array<number>(n).fill(0);
  const guessed = new Array<number>(n).fill(0);
  const firsts = new Array<number>(n).fill(0);
  let fastest: SketchResults['fastest'] = null;
  for (const t of state.history) {
    drawn[t.drawer]! += t.drawerPoints;
    t.solves.forEach((s, i) => {
      guessed[s.seat]! += 1;
      if (i === 0) firsts[s.seat]! += 1;
      if (state.guessing === 'typed' && (!fastest || s.ms < fastest.ms)) fastest = { seat: s.seat, ms: s.ms, word: t.word };
    });
  }
  const best = (arr: number[]): { seat: SeatIndex; value: number } | null => {
    let out: { seat: SeatIndex; value: number } | null = null;
    arr.forEach((value, seat) => {
      if (value > 0 && (!out || value > out.value)) out = { seat, value };
    });
    return out;
  };
  const artist = best(drawn);
  const sharp = best(firsts);
  return {
    fastest,
    bestArtist: artist ? { seat: artist.seat, points: artist.value } : null,
    sharpest: sharp ? { seat: sharp.seat, firsts: sharp.value } : null,
    drawn,
    guessed,
    turns: state.history.map((t) => ({
      drawer: t.drawer,
      word: t.word,
      author: t.author,
      solvers: t.solves.length,
      of: n - 1,
    })),
  };
}

export function sketchViewFor(state: SketchState, seat: SeatIndex | null): SketchView {
  const n = state.seats.length;
  const me = seat !== null && Number.isInteger(seat) && seat >= 0 && seat < n ? seat : null;
  const turn = inTurn(state);
  const drawer = turn ? state.drawer : null;
  const drawing = state.phase === 'drawing';
  const revealing = state.phase === 'reveal';
  const live = drawing || revealing;
  const isDrawer = me !== null && drawer === me;
  const youSolved = live && me !== null && state.solves.some((s) => s.seat === me);
  /** In on the secret: may see the word and the solvers' chat. */
  const insider = isDrawer || youSolved;
  const answer = live ? wordText(state, state.word) : '';
  const last = state.history[state.history.length - 1];

  const feed: FeedView[] = live
    ? state.feed
        .filter((e) => e.vis === 'all' || (e.vis === 'solvers' && insider) || (e.vis === 'self' && e.seat === me))
        .slice(-FEED_LIMIT)
        .map((e) => ({
          key: e.key,
          seat: e.seat,
          kind: e.kind,
          text: e.kind === 'solved' ? null : e.text,
          points: e.points,
          only: e.vis === 'self' ? 'you' : e.vis === 'solvers' ? 'solvers' : null,
        }))
    : [];

  const gains = drawing
    ? turnGains(state)
    : revealing && last
      ? Array.from({ length: n }, (_, i) =>
          (last.solves.find((s) => s.seat === i)?.points ?? 0) + (i === last.drawer ? last.drawerPoints : 0),
        )
      : new Array<number>(n).fill(0);

  return {
    phase: state.phase,
    seats: state.seats.map((s) => ({ ...s })),
    collect: state.phase === 'collect' && state.collect ? collectView(state.collect, me, n) : null,
    guessing: state.guessing,
    hints: state.options.hints,
    turnSeconds: state.options.turnSeconds,
    round: Math.min(roundOf(state), state.options.rounds - 1),
    rounds: state.options.rounds,
    turnNo: state.turnNo,
    totalTurns: state.totalTurns,
    drawer,
    boardId: boardIdFor(state),
    timer: turn && state.timer ? { ...state.timer } : null,
    choices: state.phase === 'choose' && isDrawer ? state.choices.map((id) => wordText(state, id)) : null,
    word: revealing || (drawing && insider) ? answer : null,
    hint:
      drawing && state.options.hints && !insider && answer
        ? hintCells(answer, state.hintOrder.slice(0, state.hintsShown))
        : null,
    solves: live ? state.solves.map((s) => ({ seat: s.seat, points: s.points })) : [],
    youSolved,
    canType: drawing && state.guessing === 'typed' && me !== null && !isDrawer,
    feed,
    scores: drawing ? state.scores.map((s, i) => s + (gains[i] ?? 0)) : state.scores.slice(),
    gains,
    reveal:
      revealing && last
        ? {
            drawer: last.drawer,
            word: last.word,
            author: last.author,
            solves: last.solves.map((s) => ({ seat: s.seat, points: s.points })),
            drawerPoints: last.drawerPoints,
            skipped: last.skipped,
          }
        : null,
    results: state.phase === 'gameOver' ? results(state) : null,
  };
}

// ============================================================================
// Scheduling
// ============================================================================

export function sketchNextScheduled(state: SketchState): ScheduledAction<SketchAction> | null {
  const t = state.timer;
  if (!inTurn(state) || !t || t.endsAt === null) return null;
  const turn = state.turnNo;
  switch (state.phase) {
    case 'choose':
      return { at: t.endsAt, action: { type: 'chooseTimeUp', turn } };
    case 'drawing': {
      const end = t.endsAt + GRACE_MS;
      const hint = nextHint(state);
      if (hint) {
        const at = t.endsAt - hint.leftMs;
        if (at < end) return { at, action: { type: 'hint', turn, stage: hint.stage } };
      }
      return { at: end, action: { type: 'timeUp', turn } };
    }
    case 'reveal':
      return { at: t.endsAt, action: { type: 'next', turn } };
    default:
      return null;
  }
}

// ============================================================================
// Module
// ============================================================================

function createInitialState(config: GameConfig): SketchState {
  const options = readOptions(config.gameOptions);
  const seats = config.seats.map((s, i) => ({ index: i, name: s.name }));
  const n = seats.length;
  if (n < MIN_PLAYERS || n > MAX_PLAYERS) throw new Error(`Sketch & Guess needs ${MIN_PLAYERS}–${MAX_PLAYERS} players.`);
  const problem = optionsProblem(config.gameOptions, n);
  if (problem) throw new Error(problem);

  // One device for everyone: nobody can type in secret, so shout it out.
  const localTable = config.seats.every((s) => s.uuid === null);
  const rng = makeRng(subSeed(config.seed, RNG_SALT));
  const order = rngShuffle(
    rng,
    seats.map((s) => s.index),
  );
  const totalTurns = options.rounds * n;

  // Lists and packs now (shuffled and trimmed so the saved state stays small);
  // player-written words join after the writing phase.
  const extra = buildPool({ source: { ...options.words, perPlayer: 0 }, lists: config.lists });
  const listWords = rngShuffle(
    rng,
    extra.filter((e) => e.pack === null),
  ).slice(0, LIST_CAP);
  const packWords = rngShuffle(
    rng,
    extra.filter((e) => e.pack !== null),
  ).slice(0, Math.max(90, totalTurns * (CHOICES + 1)));
  const pool: WordEntry[] = [
    ...listWords.map((e) => ({ text: e.text, author: null, custom: true })),
    ...packWords.map((e) => ({ text: e.text, author: null, custom: false })),
  ];

  const base: SketchState = {
    phase: 'collect',
    options,
    guessing: localTable ? 'spoken' : options.guessing,
    localTable,
    seats,
    rng,
    collect: null,
    pool,
    deck: [],
    order,
    totalTurns,
    turnNo: 0,
    boardNonce: Math.max(0, Math.trunc(Number(config.now) || 0)).toString(36),
    drawer: null,
    choices: [],
    word: null,
    timer: null,
    hintOrder: [],
    hintsShown: 0,
    hintStage: 0,
    solves: [],
    feed: [],
    feedCounts: {},
    lastGuessAt: new Array<number | null>(n).fill(null),
    scores: new Array<number>(n).fill(0),
    history: [],
  };

  if (options.words.perPlayer > 0) {
    const k = options.words.perPlayer;
    return {
      ...base,
      collect: startCollect('words', k, `Write ${k} thing${k === 1 ? '' : 's'} for other people to draw.`),
    };
  }
  if (pool.length < MIN_WORDS) {
    throw new Error(`Only ${pool.length} words available — pick more packs or let players write some.`);
  }
  return beginPlay(base, [], config.now);
}

export const sketchModule: GameModule<SketchState, SketchView, SketchAction> = {
  id: 'sketch',
  displayName: 'Sketch & Guess',
  minPlayers: MIN_PLAYERS,
  maxPlayers: MAX_PLAYERS,

  createInitialState,
  applyAction: applySketch,
  viewFor: sketchViewFor,

  isFinished: (state) => state.phase === 'gameOver',

  defaultOptions: () => structuredClone(DEFAULT_OPTIONS) as unknown as Record<string, unknown>,

  optionsProblem,

  nextScheduled: sketchNextScheduled,

  liveBoard(state): LiveBoard | null {
    const id = boardIdFor(state);
    return id !== null && state.drawer !== null ? { id, drawerSeat: state.drawer } : null;
  },
};
