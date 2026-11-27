import { cloneRng, makeRng, rngInt, rngShuffle, subSeed, type RngState } from '@/engine/rng';
import { isExpired, isPaused, pauseTimer, resumeTimer, startTimer } from '@/engine/timer';
import { assertHostOnly, assertSeat } from '@/engine/guards';
import type { ActionContext, GameConfig, GameModule, SeatIndex } from '@/engine/types';
import {
  collectComplete,
  collectReduce,
  collectView,
  collectedEntries,
  isCollectAction,
  startCollect,
} from '@/words/collect';
import { buildPool, entryKey } from '@/words/source';
import type { ForeheadAction } from './actions';
import {
  DEFAULT_OPTIONS,
  GET_READY_MS,
  GRACE_MS,
  MAX_DECK,
  MIN_CARDS,
  cardsNeeded,
  cardsPerTurn,
  optionsProblem,
  readOptions,
} from './rules';
import type { Card, CardResult, ForeheadState, ForeheadView, TurnEnd, TurnRecord } from './state';

// ============================================================================
// Forehead — module
// ============================================================================

export function totalTurns(state: ForeheadState): number {
  return state.options.rounds * state.seats.length;
}

/** Who guesses on turn `turnNo` (default: the current one). */
export function guesserAt(state: ForeheadState, turnNo = state.turnNo): SeatIndex {
  return state.order[turnNo % state.order.length]!;
}

export function roundAt(state: ForeheadState, turnNo = state.turnNo): number {
  return Math.floor(turnNo / state.order.length);
}

/**
 * Player cards first (so their author survives dedupe), then the top-up.
 * The first `target` cards (every player card plus enough top-up for the
 * match) are shuffled together; the rest of the top-up — already shuffled —
 * follows as a reserve, so player cards aren't drowned out by big packs.
 */
function buildDeck(
  collected: ReadonlyArray<{ text: string; author: SeatIndex }>,
  topUp: ReadonlyArray<{ text: string }>,
  target: number,
  rng: RngState,
): { cards: Card[]; deck: number[] } {
  const seen = new Set<string>();
  const cards: Card[] = [];
  const add = (text: string, author: SeatIndex | null) => {
    const key = entryKey(text);
    if (!key || seen.has(key)) return;
    seen.add(key);
    cards.push({ id: cards.length, text, author });
  };
  for (const c of collected) add(c.text, c.author);
  const written = cards.length;
  for (const t of topUp) {
    if (cards.length >= MAX_DECK) break;
    add(t.text, null);
  }
  const ids = cards.map((c) => c.id);
  const head = Math.min(ids.length, Math.max(target, written));
  return { cards, deck: [...rngShuffle(rng, ids.slice(0, head)), ...ids.slice(head)] };
}

function hasCardFor(state: ForeheadState, guesser: SeatIndex): boolean {
  return state.deck.some((id) => state.cards[id]!.author !== guesser);
}

/** Deal the next card `guesser` didn't write, or null when there's none. */
function draw(state: ForeheadState, guesser: SeatIndex): Pick<ForeheadState, 'deck' | 'current' | 'dealt'> | null {
  const i = state.deck.findIndex((id) => state.cards[id]!.author !== guesser);
  if (i < 0) return null;
  const no = state.dealt + 1;
  return {
    deck: [...state.deck.slice(0, i), ...state.deck.slice(i + 1)],
    current: { id: state.deck[i]!, no },
    dealt: no,
  };
}

/** Leave collecting (or setup) with a deck. */
function startPlay(
  state: ForeheadState,
  collected: ReadonlyArray<{ text: string; author: SeatIndex }>,
  minCards: number,
): ForeheadState {
  const rng = cloneRng(state.rng);
  const { cards, deck } = buildDeck(collected, state.topUp, cardsNeeded(state.options, state.seats.length), rng);
  if (cards.length < minCards) {
    throw new Error(
      cards.length === 0
        ? 'No cards to play with — add some words.'
        : `Only ${cards.length} cards available — pick more packs or let players write some.`,
    );
  }
  return { ...state, rng, phase: 'ready', collect: null, topUp: [], cards, deck };
}

/** Close the turn: the card still up counts as a pass. */
function endTurn(state: ForeheadState, end: TurnEnd, buzzer: ForeheadState['buzzer'] = null): ForeheadState {
  const cards: CardResult[] = state.current
    ? [...state.turnCards, { id: state.current.id, no: state.current.no, got: false }]
    : state.turnCards;
  const record: TurnRecord = { seat: guesserAt(state), round: roundAt(state), cards, end };
  return {
    ...state,
    phase: 'turnResults',
    history: [...state.history, record],
    countdown: null,
    timer: null,
    current: null,
    turnCards: [],
    buzzer,
  };
}

/** On to the next turn — or the end, after the last turn or when the deck is empty. */
function advance(state: ForeheadState): ForeheadState {
  const turnNo = state.turnNo + 1;
  const base: ForeheadState = {
    ...state,
    turnNo,
    countdown: null,
    timer: null,
    current: null,
    turnCards: [],
    buzzer: null,
  };
  if (turnNo >= totalTurns(state)) return { ...base, phase: 'gameOver' };
  if (state.deck.length === 0) return { ...base, phase: 'gameOver', ranOut: true };
  return { ...base, phase: 'ready' };
}

/** Seatless (the host) or the guesser themselves. */
function assertHostOrGuesser(state: ForeheadState, bySeat: unknown): void {
  if (bySeat === undefined) return;
  assertSeat(bySeat, state.seats.length);
  if (bySeat !== guesserAt(state)) throw new Error('Only the guesser or the host can do that');
}

/**
 * Who may mark the card: in 'forehead' mode the guesser (their phone does
 * the tilting); in 'others' mode any clue-giver, and the guesser may pass.
 */
function assertMarker(state: ForeheadState, bySeat: unknown, card: unknown, kind: 'correct' | 'pass'): void {
  assertSeat(bySeat, state.seats.length);
  const guesser = guesserAt(state);
  if (state.display === 'forehead') {
    if (bySeat !== guesser) throw new Error('Only the guesser can do that');
  } else if (kind === 'correct' && bySeat === guesser) {
    throw new Error('Your friends mark your correct answers');
  }
  if (typeof card !== 'number') throw new Error('Which card?');
}

function applyForehead(state: ForeheadState, action: ForeheadAction, ctx: ActionContext): ForeheadState {
  const n = state.seats.length;

  if (isCollectAction(action)) {
    if (state.phase !== 'collect' || !state.collect) throw new Error('Not collecting words');
    if (action.type === 'collect.close') {
      assertHostOnly(action);
      return startPlay(state, collectedEntries(state.collect), 1);
    }
    const collect = collectReduce(state.collect, action, n);
    const next = { ...state, collect };
    if (!collectComplete(collect, n)) return next;
    return startPlay(next, collectedEntries(collect), 1);
  }

  switch (action.type) {
    case 'start': {
      if (state.phase !== 'ready') throw new Error('Not ready for a turn');
      if (action.turn !== state.turnNo) throw new Error('Stale start');
      const guesser = guesserAt(state);
      if (action.bySeat !== undefined) {
        assertSeat(action.bySeat, n);
        if (action.bySeat !== guesser) throw new Error('It is not your turn');
      }
      if (!hasCardFor(state, guesser)) throw new Error('No cards left for this player');
      return { ...state, phase: 'getReady', countdown: startTimer(GET_READY_MS, ctx.now) };
    }

    case 'go': {
      assertHostOnly(action);
      if (state.phase !== 'getReady' || action.turn !== state.turnNo) throw new Error('Stale countdown');
      if (!state.countdown || !isExpired(state.countdown, ctx.now)) throw new Error('Not yet');
      const base: ForeheadState = {
        ...state,
        phase: 'turn',
        countdown: null,
        timer: startTimer(state.options.turnSeconds * 1000, ctx.now),
        current: null,
        turnCards: [],
      };
      const dealt = draw(base, guesserAt(state));
      return dealt ? { ...base, ...dealt } : endTurn(base, 'deck');
    }

    case 'correct':
    case 'pass': {
      const kind = action.type;
      // The buzzer beat a "correct" by a hair: flip the card that was up.
      if (state.phase === 'turnResults') {
        if (kind !== 'correct' || !state.buzzer || action.card !== state.buzzer.no) throw new Error("Time's up");
        if (ctx.now > state.buzzer.at + GRACE_MS) throw new Error("Time's up");
        assertMarker(state, action.bySeat, action.card, kind);
        const buzzerNo = state.buzzer.no;
        const history = state.history.slice();
        const last = history[history.length - 1]!;
        history[history.length - 1] = {
          ...last,
          cards: last.cards.map((c) => (c.no === buzzerNo ? { ...c, got: true } : c)),
        };
        return { ...state, history, buzzer: null };
      }
      if (state.phase !== 'turn' || !state.timer || !state.current) throw new Error('No turn in progress');
      assertMarker(state, action.bySeat, action.card, kind);
      if (action.card !== state.current.no) throw new Error('That card is gone');
      if (isPaused(state.timer)) throw new Error('The turn is paused');
      if (isExpired(state.timer, ctx.now - GRACE_MS)) throw new Error("Time's up");
      const resolved: ForeheadState = {
        ...state,
        turnCards: [...state.turnCards, { ...state.current, got: kind === 'correct' }],
        current: null,
      };
      // After the buzzer (inside the grace window) it counts, but no new card.
      if (isExpired(state.timer, ctx.now)) return endTurn(resolved, 'time');
      const dealt = draw(resolved, guesserAt(state));
      return dealt ? { ...resolved, ...dealt } : endTurn(resolved, 'deck');
    }

    case 'timeUp': {
      assertHostOnly(action);
      if (state.phase !== 'turn' || action.turn !== state.turnNo) throw new Error('Stale timer');
      if (!state.timer || !isExpired(state.timer, ctx.now)) throw new Error('Time is not up yet');
      const buzzer = state.current ? { no: state.current.no, at: state.timer.endsAt! } : null;
      return endTurn(state, 'time', buzzer);
    }

    case 'next': {
      if (state.phase !== 'turnResults') throw new Error('No results showing');
      if (action.turn !== state.turnNo) throw new Error('Stale');
      assertHostOrGuesser(state, action.bySeat);
      return advance(state);
    }

    case 'pause': {
      if (state.phase !== 'turn' || !state.timer) throw new Error('Nothing to pause');
      assertHostOrGuesser(state, action.bySeat);
      if (isPaused(state.timer)) throw new Error('Already paused');
      if (isExpired(state.timer, ctx.now)) throw new Error("Time's up");
      return { ...state, timer: pauseTimer(state.timer, ctx.now) };
    }

    case 'resume': {
      if (state.phase !== 'turn' || !state.timer) throw new Error('Nothing to resume');
      assertHostOrGuesser(state, action.bySeat);
      if (!isPaused(state.timer)) throw new Error('Not paused');
      return { ...state, timer: resumeTimer(state.timer, ctx.now) };
    }

    case 'stopTurn': {
      assertHostOrGuesser(state, action.bySeat);
      if (state.phase === 'getReady') return { ...state, phase: 'ready', countdown: null };
      if (state.phase !== 'turn') throw new Error('No turn to stop');
      return endTurn(state, 'stopped');
    }

    case 'skipPlayer':
      assertHostOnly(action);
      if (state.phase !== 'ready' && state.phase !== 'getReady') throw new Error('Only between turns');
      return advance(state);

    case 'finish': {
      assertHostOnly(action);
      if (state.phase === 'gameOver') throw new Error('Already over');
      const s = state.phase === 'turn' ? endTurn(state, 'stopped') : state;
      return {
        ...s,
        phase: 'gameOver',
        collect: null,
        countdown: null,
        timer: null,
        current: null,
        turnCards: [],
        buzzer: null,
      };
    }

    default:
      throw new Error(`Unknown action ${(action as { type?: unknown }).type as string}`);
  }
}

// ============================================================================
// View — the redaction chokepoint
// ============================================================================

export function foreheadViewFor(state: ForeheadState, seat: SeatIndex | null): ForeheadView {
  const n = state.seats.length;
  const me = seat !== null && Number.isInteger(seat) && seat >= 0 && seat < n ? seat : null;
  const active =
    state.phase === 'ready' || state.phase === 'getReady' || state.phase === 'turn' || state.phase === 'turnResults';
  const guesser = active ? guesserAt(state) : null;
  const isGuesser = me !== null && me === guesser;
  const text = (id: number) => state.cards[id]?.text ?? '';

  const inTurn = state.phase === 'turn' && state.timer !== null && state.current !== null;
  const paused = inTurn && isPaused(state.timer!);
  // The word: never for a spectator (a TV the guesser can see); for the guesser
  // only on the forehead, and not while paused (the phone comes down).
  const seesCard = inTurn && me !== null && (isGuesser ? state.display === 'forehead' && !paused : true);
  const live = inTurn && !paused && me !== null;
  const forehead = state.display === 'forehead';

  const scores = new Array<number>(n).fill(0);
  for (const t of state.history) scores[t.seat]! += t.cards.filter((c) => c.got).length;
  if (state.phase === 'turn' && guesser !== null) scores[guesser]! += state.turnCards.filter((c) => c.got).length;

  const last = state.history[state.history.length - 1];
  const nextTurn = state.turnNo + 1;
  const upNext =
    state.phase === 'turnResults' && nextTurn < totalTurns(state) && state.deck.length > 0
      ? guesserAt(state, nextTurn)
      : null;

  let results: ForeheadView['results'] = null;
  if (state.phase === 'gameOver') {
    let best: { seat: SeatIndex; round: number; got: number } | null = null;
    for (const t of state.history) {
      const got = t.cards.filter((c) => c.got).length;
      if (got > 0 && (!best || got > best.got)) best = { seat: t.seat, round: t.round, got };
    }
    results = {
      turns: state.history.map((t) => ({
        seat: t.seat,
        round: t.round,
        cards: t.cards.map((c) => {
          const author = state.cards[c.id]?.author ?? null;
          return { text: text(c.id), got: c.got, author: author === null ? null : (state.seats[author]?.name ?? null) };
        }),
      })),
      bestTurn: best,
      ranOut: state.ranOut,
    };
  }

  return {
    phase: state.phase,
    seats: state.seats.map((s) => ({ ...s })),
    collect: state.phase === 'collect' && state.collect ? collectView(state.collect, me, n) : null,
    display: state.display,
    rounds: state.options.rounds,
    round: active ? roundAt(state) : state.phase === 'gameOver' ? Math.min(roundAt(state), state.options.rounds - 1) : 0,
    turnNo: state.turnNo,
    totalTurns: totalTurns(state),
    turnSeconds: state.options.turnSeconds,
    guesser,
    upNext,
    countdown: state.phase === 'getReady' && state.countdown ? { ...state.countdown } : null,
    timer: state.phase === 'turn' && state.timer ? { ...state.timer } : null,
    cardNo: inTurn ? state.current!.no : null,
    cardText: seesCard ? text(state.current!.id) : null,
    canCorrect: live && (forehead ? isGuesser : !isGuesser),
    canPass: live && (forehead ? isGuesser : true),
    turnCorrect: state.phase === 'turn' ? state.turnCards.filter((c) => c.got).length : 0,
    turnPassed: state.phase === 'turn' ? state.turnCards.filter((c) => !c.got).length : 0,
    deckLeft: state.deck.length,
    lowDeck: active && state.deck.length < cardsPerTurn(state.options.turnSeconds),
    outOfCards: state.phase === 'ready' && guesser !== null && !hasCardFor(state, guesser),
    lastTurn:
      state.phase === 'turnResults' && last
        ? {
            seat: last.seat,
            round: last.round,
            end: last.end,
            cards: last.cards.map((c) => ({ text: text(c.id), got: c.got })),
          }
        : null,
    scores,
    results,
  };
}

// ============================================================================
// Module
// ============================================================================

export const foreheadModule: GameModule<ForeheadState, ForeheadView, ForeheadAction> = {
  id: 'forehead',
  displayName: 'Forehead',
  minPlayers: 2,
  maxPlayers: 20,

  createInitialState(config: GameConfig): ForeheadState {
    const options = readOptions(config.gameOptions);
    const seats = config.seats.map((s, i) => ({ index: i, name: s.name }));
    const n = seats.length;
    if (n < this.minPlayers || n > this.maxPlayers) {
      throw new Error(`Forehead needs ${this.minPlayers}–${this.maxPlayers} players.`);
    }
    const problem = optionsProblem(config.gameOptions, n);
    if (problem) throw new Error(problem);
    // A single-device table (no uids) has one phone: it goes on the forehead.
    const local = config.seats.every((s) => s.uuid === null);
    const rng = makeRng(subSeed(config.seed, 0xf04e));
    const pool = buildPool({ source: { ...options.words, perPlayer: 0 }, lists: config.lists });
    const topUp = rngShuffle(rng, pool)
      .slice(0, MAX_DECK)
      .map((p) => ({ text: p.text }));
    const first = rngInt(rng, n);

    const base: ForeheadState = {
      phase: 'ready',
      options,
      display: local ? 'forehead' : options.display,
      seats,
      rng,
      collect: null,
      topUp,
      cards: [],
      deck: [],
      order: Array.from({ length: n }, (_, i) => (first + i) % n),
      turnNo: 0,
      countdown: null,
      timer: null,
      current: null,
      dealt: 0,
      turnCards: [],
      history: [],
      buzzer: null,
      ranOut: false,
    };

    if (options.words.perPlayer > 0) {
      const k = options.words.perPlayer;
      return {
        ...base,
        phase: 'collect',
        collect: startCollect(
          'words',
          k,
          `Write ${k} ${k === 1 ? 'card' : 'cards'} for the others: famous people, characters, animals, things.`,
        ),
      };
    }
    return startPlay(base, [], MIN_CARDS);
  },

  applyAction: applyForehead,
  viewFor: foreheadViewFor,

  isFinished: (state) => state.phase === 'gameOver',

  defaultOptions: () => structuredClone(DEFAULT_OPTIONS) as unknown as Record<string, unknown>,

  optionsProblem,

  nextScheduled(state) {
    if (state.phase === 'getReady' && state.countdown?.endsAt != null) {
      return { at: state.countdown.endsAt, action: { type: 'go', turn: state.turnNo } };
    }
    if (state.phase === 'turn' && state.timer?.endsAt != null) {
      return { at: state.timer.endsAt, action: { type: 'timeUp', turn: state.turnNo } };
    }
    return null;
  },
};
