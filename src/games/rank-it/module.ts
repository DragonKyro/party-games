import { cloneRng, makeRng, rngInt, rngShuffle, subSeed, type RngState } from '@/engine/rng';
import { isExpired, pauseTimer, resumeTimer, startTimer } from '@/engine/timer';
import { assertHostOnly, assertInt, assertSeat } from '@/engine/guards';
import type { ActionContext, GameConfig, GameModule, SeatIndex } from '@/engine/types';
import {
  collectComplete,
  collectReduce,
  collectView,
  collectedEntries,
  isCollectAction,
  startCollect,
  type CollectState,
} from '@/words/collect';
import { RANK_CRITERIA, RANK_CRITERIA_SPICY } from '@/words/prompts/rank';
import { buildPool, buildPromptPool, entryKey } from '@/words/source';
import type { RankItAction } from './actions';
import {
  DEFAULT_OPTIONS,
  MAX_CRITERION_LENGTH,
  OFFER_COUNT,
  cleanCriterion,
  consensus,
  hasChooser,
  optionsProblem,
  rankerScore,
  readOptions,
  readOrder,
  scoreOrder,
  totalRounds,
} from './rules';
import type {
  Award,
  Entry,
  RankItState,
  RankItView,
  ResultsView,
  RevealView,
  RoundRecord,
  SeatResult,
  VoidReason,
} from './state';

// ============================================================================
// Rank It — module
// ============================================================================

export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 12;
/** A ranking that lands a moment after the buzzer still counts (network lag). */
export const GRACE_MS = 1500;
/** Crowd mode: fewer rankings than this can't make a consensus. */
export const MIN_RANKINGS = 2;
/** Tops up an item pool that came up short (e.g. the host stopped the writing early). */
const FALLBACK_PACK = 'everyday' as const;

const range = (n: number) => Array.from({ length: n }, (_, i) => i);
const noOrders = (n: number): Array<number[] | null> => Array.from({ length: n }, () => null);
const missed = (): SeatResult => ({ points: 0, exact: 0, near: 0, perfect: false, submitted: false });

/** Whoever is the Ranker this round (ranker mode only). */
export function rankerOf(state: RankItState): SeatIndex | null {
  if (state.options.mode !== 'ranker' || state.turnOrder.length === 0) return null;
  return state.turnOrder[state.round % state.turnOrder.length]!;
}

/** Whoever picks this round's criterion (null when it's drawn). */
export function chooserOf(state: RankItState): SeatIndex | null {
  if (!hasChooser(state.options) || state.turnOrder.length === 0) return null;
  return state.turnOrder[state.round % state.turnOrder.length]!;
}

/** `first` then `rest`, deduped by entry key (the first copy — and its author — wins). */
function mergeEntries(first: readonly Entry[], rest: readonly Entry[]): Entry[] {
  const seen = new Set<string>();
  const out: Entry[] = [];
  for (const e of [...first, ...rest]) {
    const key = entryKey(e.text);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({ text: e.text, author: e.author });
  }
  return out;
}

function asCriteria(entries: ReadonlyArray<{ text: string; author: SeatIndex | null }>): Entry[] {
  return entries
    .map((e) => ({ text: cleanCriterion(e.text).slice(0, MAX_CRITERION_LENGTH), author: e.author }))
    .filter((e) => e.text.length > 0);
}

/** Player-written entries first (shuffled), then everything else (shuffled). */
function makeDeck(pool: readonly Entry[], rng: RngState): number[] {
  const ids = range(pool.length);
  return [
    ...rngShuffle(
      rng,
      ids.filter((i) => pool[i]!.author !== null),
    ),
    ...rngShuffle(
      rng,
      ids.filter((i) => pool[i]!.author === null),
    ),
  ];
}

/**
 * Draw `count` distinct ids off the top of `deck`. When the deck runs dry it
 * is refilled with a reshuffle of the whole pool (minus what was just drawn),
 * so nothing repeats until everything has been used. `avoid` skips ids when
 * something else is available (e.g. the chooser's own criteria).
 */
function draw(
  deck: readonly number[],
  poolSize: number,
  count: number,
  rng: RngState,
  avoid?: (id: number) => boolean,
): { picked: number[]; deck: number[] } {
  let rest = deck.slice();
  const picked: number[] = [];
  while (picked.length < count) {
    if (rest.length === 0) {
      rest = rngShuffle(
        rng,
        range(poolSize).filter((id) => !picked.includes(id)),
      );
      if (rest.length === 0) break;
    }
    let at = avoid ? rest.findIndex((id) => !avoid(id)) : 0;
    if (at < 0) at = 0;
    picked.push(rest[at]!);
    rest.splice(at, 1);
  }
  return { picked, deck: rest };
}

// ----------------------------------------------------------------------------
// Flow
// ----------------------------------------------------------------------------

function gameOver(state: RankItState): RankItState {
  return { ...state, phase: 'gameOver', timer: null, offered: [], orders: noOrders(state.seats.length) };
}

function startRanking(state: RankItState, now: number): RankItState {
  const secs = state.options.timeLimit;
  return {
    ...state,
    phase: 'rank',
    timer: secs > 0 ? startTimer(secs * 1000, now) : null,
    orders: noOrders(state.seats.length),
  };
}

/** Deal round `round`: items, then either criteria to choose from or a drawn criterion. */
function startRound(state: RankItState, round: number, now: number): RankItState {
  if (round >= state.totalRounds) return gameOver({ ...state, round });
  const rng = cloneRng(state.rng);
  const items = draw(state.itemDeck, state.itemPool.length, state.options.itemCount, rng);
  const base: RankItState = {
    ...state,
    rng,
    round,
    itemDeck: items.deck,
    dealt: items.picked,
    offered: [],
    criterion: null,
    timer: null,
    orders: noOrders(state.seats.length),
  };
  const chooser = chooserOf(base);
  if (chooser !== null) {
    const crit = draw(
      state.criteriaDeck,
      state.criteriaPool.length,
      OFFER_COUNT,
      rng,
      (id) => state.criteriaPool[id]?.author === chooser,
    );
    return { ...base, phase: 'choose', criteriaDeck: crit.deck, offered: crit.picked };
  }
  const crit = draw(state.criteriaDeck, state.criteriaPool.length, 1, rng);
  return startRanking({ ...base, criteriaDeck: crit.deck, criterion: state.criteriaPool[crit.picked[0]!]!.text }, now);
}

/** Collection is over: top up short pools, build the decks, deal round 1. */
function beginGame(state: RankItState, now: number): RankItState {
  const rng = cloneRng(state.rng);
  const n = state.seats.length;
  const k = state.options.itemCount;
  const enough = Math.max(k, state.totalRounds * k);
  const itemPool =
    state.itemPool.length >= k
      ? state.itemPool
      : mergeEntries(
          state.itemPool,
          rngShuffle(
            rng,
            buildPool({ source: { packs: [FALLBACK_PACK], listIds: [], perPlayer: 0 } }).map((e) => ({
              text: e.text,
              author: null,
            })),
          ),
        ).slice(0, Math.max(state.itemPool.length, enough));
  const criteriaPool =
    state.criteriaPool.length >= OFFER_COUNT
      ? state.criteriaPool
      : mergeEntries(
          state.criteriaPool,
          rngShuffle(
            rng,
            RANK_CRITERIA.map((text) => ({ text, author: null })),
          ),
        ).slice(0, Math.max(state.criteriaPool.length, state.totalRounds * OFFER_COUNT, OFFER_COUNT));
  const start = rngInt(rng, n);
  return startRound(
    {
      ...state,
      rng,
      collect: null,
      collectStage: null,
      itemPool,
      criteriaPool,
      itemDeck: makeDeck(itemPool, rng),
      criteriaDeck: makeDeck(criteriaPool, rng),
      turnOrder: range(n).map((i) => (start + i) % n),
    },
    0,
    now,
  );
}

function itemsPrompt(k: number): string {
  return `Write ${k} thing${k === 1 ? '' : 's'} for the table to rank.`;
}

function criteriaPrompt(k: number): string {
  return `Write ${k} way${k === 1 ? '' : 's'} to rank things — finish “Most … least: ____”.`;
}

/** A collect stage finished (everyone done, or the host stopped waiting). */
function finishCollect(state: RankItState, collect: CollectState, now: number): RankItState {
  const written = collectedEntries(collect);
  if (state.collectStage === 'items') {
    const next: RankItState = {
      ...state,
      collect: null,
      itemPool: mergeEntries(
        written.map((e) => ({ text: e.text, author: e.author })),
        state.itemPool,
      ),
    };
    const p = state.options.criteria.perPlayer;
    if (p > 0) return { ...next, collectStage: 'criteria', collect: startCollect('words', p, criteriaPrompt(p)) };
    return beginGame(next, now);
  }
  return beginGame({ ...state, collect: null, criteriaPool: mergeEntries(asCriteria(written), state.criteriaPool) }, now);
}

/**
 * Score the round (or void it). A void round moves straight on to the next
 * round; a scored one shows the reveal.
 */
function settle(state: RankItState, now: number, forced: VoidReason | null = null): RankItState {
  const n = state.seats.length;
  const k = state.options.itemCount;
  const ranker = rankerOf(state);
  let truth: number[] | null = null;
  let means: number[] | null = null;
  let voided: VoidReason | null = forced;
  if (!voided) {
    if (state.options.mode === 'ranker') {
      truth = ranker !== null ? state.orders[ranker] ?? null : null;
      if (!truth) voided = 'noRanker';
    } else {
      const subs = state.orders.filter((o): o is number[] => o !== null);
      if (subs.length < MIN_RANKINGS) voided = 'tooFew';
      else ({ order: truth, means } = consensus(subs, k));
    }
  }
  const record: Omit<RoundRecord, 'voided' | 'truth' | 'means' | 'orders' | 'results' | 'rankerPoints' | 'points'> = {
    round: state.round,
    ranker,
    chooser: chooserOf(state),
    items: state.dealt.map((id) => state.itemPool[id]!.text),
    criterion: state.criterion,
  };

  if (voided || !truth) {
    const blank: RoundRecord = {
      ...record,
      voided: voided ?? 'tooFew',
      truth: null,
      means: null,
      // A void round's rankings are never revealed, so they aren't kept.
      orders: noOrders(n),
      results: noOrders(n).map(() => null),
      rankerPoints: null,
      points: new Array<number>(n).fill(0),
    };
    const criteriaDeck = [...state.criteriaDeck, ...state.offered];
    return startRound({ ...state, criteriaDeck, offered: [], history: [...state.history, blank] }, state.round + 1, now);
  }

  const answer = truth;
  const results: Array<SeatResult | null> = state.orders.map((o, seat) => {
    if (seat === ranker) return null;
    if (!o) return missed();
    return { ...scoreOrder(o, answer), submitted: true };
  });
  const rankerPoints =
    ranker !== null
      ? rankerScore(results.filter((r): r is SeatResult => !!r && r.submitted).map((r) => r.points))
      : null;
  const points = results.map((r, seat) => (seat === ranker ? (rankerPoints ?? 0) : (r?.points ?? 0)));
  const full: RoundRecord = {
    ...record,
    voided: null,
    truth: answer.slice(),
    means,
    orders: state.orders.map((o) => (o ? o.slice() : null)),
    results,
    rankerPoints,
    points,
  };
  return {
    ...state,
    phase: 'reveal',
    timer: null,
    scores: state.scores.map((s, i) => s + (points[i] ?? 0)),
    history: [...state.history, full],
  };
}

function assertRound(state: RankItState, round: unknown): void {
  if (round !== state.round) throw new Error('That round is over');
}

function assertChooser(state: RankItState, bySeat: unknown, round: unknown): asserts bySeat is SeatIndex {
  if (state.phase !== 'choose') throw new Error('Nobody is choosing a criterion right now');
  assertSeat(bySeat, state.seats.length);
  assertRound(state, round);
  if (bySeat !== chooserOf(state)) throw new Error('Only the chooser picks the criterion');
}

function applyRankIt(state: RankItState, action: RankItAction, ctx: ActionContext): RankItState {
  const n = state.seats.length;

  if (isCollectAction(action)) {
    if (state.phase !== 'collect' || !state.collect) throw new Error('Not collecting entries');
    if (action.type === 'collect.close') {
      assertHostOnly(action);
      return finishCollect(state, state.collect, ctx.now);
    }
    const collect = collectReduce(state.collect, action, n);
    if (!collectComplete(collect, n)) return { ...state, collect };
    return finishCollect({ ...state, collect }, collect, ctx.now);
  }

  switch (action.type) {
    case 'choose': {
      assertChooser(state, action.bySeat, action.round);
      assertInt(action.option, 0, state.offered.length - 1, 'option');
      const id = state.offered[action.option]!;
      return startRanking(
        {
          ...state,
          criterion: state.criteriaPool[id]!.text,
          // The one not picked goes back to the bottom of the deck.
          criteriaDeck: [...state.criteriaDeck, ...state.offered.filter((x) => x !== id)],
          offered: [],
        },
        ctx.now,
      );
    }

    case 'writeOwn': {
      assertChooser(state, action.bySeat, action.round);
      if (typeof action.text !== 'string') throw new Error('Write a criterion');
      const text = cleanCriterion(action.text);
      if (!text || !entryKey(text)) throw new Error('Write a criterion');
      if (text.length > MAX_CRITERION_LENGTH) throw new Error(`Keep it to ${MAX_CRITERION_LENGTH} characters`);
      return startRanking(
        { ...state, criterion: text, criteriaDeck: [...state.criteriaDeck, ...state.offered], offered: [] },
        ctx.now,
      );
    }

    case 'submit': {
      if (state.phase !== 'rank') throw new Error('Not ranking right now');
      assertSeat(action.bySeat, n);
      assertRound(state, action.round);
      if (state.timer && isExpired(state.timer, ctx.now - GRACE_MS)) throw new Error("Time's up");
      const order = readOrder(action.order, state.options.itemCount);
      const orders = state.orders.slice();
      orders[action.bySeat] = order;
      const next: RankItState = { ...state, orders };
      return orders.every((o) => o !== null) ? settle(next, ctx.now) : next;
    }

    case 'reveal':
      assertHostOnly(action);
      if (state.phase !== 'rank') throw new Error('Nothing to reveal');
      assertRound(state, action.round);
      return settle(state, ctx.now);

    case 'timeUp':
      assertHostOnly(action);
      if (state.phase !== 'rank' || action.round !== state.round) throw new Error('Stale timer');
      if (!state.timer || !isExpired(state.timer, ctx.now - GRACE_MS)) throw new Error('Time is not up yet');
      return settle(state, ctx.now);

    case 'next':
      assertHostOnly(action);
      if (state.phase !== 'reveal') throw new Error('Not showing a reveal');
      assertRound(state, action.round);
      return startRound(state, state.round + 1, ctx.now);

    case 'skipRound':
      assertHostOnly(action);
      if (state.phase !== 'choose' && state.phase !== 'rank') throw new Error('No round to skip');
      assertRound(state, action.round);
      return settle(state, ctx.now, 'skipped');

    case 'pause':
      assertHostOnly(action);
      if (state.phase !== 'rank' || !state.timer) throw new Error('Nothing to pause');
      return { ...state, timer: pauseTimer(state.timer, ctx.now) };

    case 'resume':
      assertHostOnly(action);
      if (state.phase !== 'rank' || !state.timer) throw new Error('Nothing to resume');
      return { ...state, timer: resumeTimer(state.timer, ctx.now) };

    case 'finish':
      assertHostOnly(action);
      if (state.phase === 'gameOver') throw new Error('Already over');
      return gameOver({ ...state, collect: null, collectStage: null });

    default:
      throw new Error(`Unknown action ${(action as { type?: unknown }).type as string}`);
  }
}

// ============================================================================
// View — the redaction chokepoint
// ============================================================================

/** Seats holding the top value (above `floor`), among `eligible`. */
function leaders(values: readonly number[], eligible: (seat: number) => boolean, floor = 0): SeatIndex[] {
  let best = -Infinity;
  values.forEach((v, s) => {
    if (eligible(s) && v > best) best = v;
  });
  if (!(best > floor)) return [];
  return values.map((v, s) => (eligible(s) && v === best ? s : -1)).filter((s) => s >= 0);
}

function buildResults(state: RankItState): ResultsView {
  const n = state.seats.length;
  const guessPoints = new Array<number>(n).fill(0);
  const rankerPoints = new Array<number>(n).fill(0);
  const rankedRounds = new Array<number>(n).fill(0);
  const perfects = new Array<number>(n).fill(0);
  const played = new Array<number>(n).fill(0);
  for (const r of state.history) {
    if (r.voided) continue;
    r.results.forEach((res, s) => {
      if (!res) return;
      guessPoints[s]! += res.points;
      if (res.perfect) perfects[s]! += 1;
      if (res.submitted) played[s]! += 1;
    });
    if (r.ranker !== null && r.rankerPoints !== null) {
      rankerPoints[r.ranker]! += r.rankerPoints;
      rankedRounds[r.ranker]! += 1;
    }
  }

  const awards: Award[] = [];
  const round1 = (x: number) => Math.round(x * 10) / 10;
  if (state.options.mode === 'ranker') {
    const mind = leaders(guessPoints, () => true);
    if (mind.length) {
      awards.push({ emoji: '🔮', title: 'Mind reader', seats: mind, detail: `${guessPoints[mind[0]!]} points from guessing` });
    }
    const avg = rankerPoints.map((p, s) => (rankedRounds[s]! > 0 ? p / rankedRounds[s]! : 0));
    const ranked = (s: number) => rankedRounds[s]! > 0;
    const open = leaders(avg, ranked);
    if (open.length) {
      awards.push({
        emoji: '📖',
        title: 'Open book',
        seats: open,
        detail: `guessers averaged ${round1(avg[open[0]!]!)} points on their rankings`,
      });
    }
    // Hardest to read: the lowest average, if it isn't everyone.
    const closed = leaders(
      avg.map((a) => -a),
      ranked,
      -Infinity,
    );
    if (closed.length && open.length && closed.length < rankedRounds.filter((c) => c > 0).length) {
      awards.push({
        emoji: '🗝️',
        title: 'Closed book',
        seats: closed,
        detail: `the hardest to read — ${round1(avg[closed[0]!]!)} points per ranking`,
      });
    }
  } else {
    const hive = leaders(state.scores, () => true);
    if (hive.length) {
      awards.push({ emoji: '🐝', title: 'Hive mind', seats: hive, detail: 'closest to the room, round after round' });
    }
    const free = leaders(
      state.scores.map((x) => -x),
      (s) => played[s]! > 0,
      -Infinity,
    );
    if (free.length && hive.length && free.length < played.filter((c) => c > 0).length && free.every((s) => !hive.includes(s))) {
      awards.push({ emoji: '🦄', title: 'Free spirit', seats: free, detail: 'marches to their own drum' });
    }
  }
  const bulls = leaders(perfects, () => true);
  if (bulls.length) {
    const c = perfects[bulls[0]!]!;
    awards.push({ emoji: '🎯', title: 'Bullseye', seats: bulls, detail: `${c} perfect order${c === 1 ? '' : 's'}` });
  }

  const name = (s: SeatIndex) => state.seats[s]?.name ?? '?';
  return {
    awards,
    guessPoints,
    rankerPoints,
    perfects,
    rounds: state.history.map((r) => ({
      round: r.round,
      ranker: r.ranker,
      criterion: r.criterion,
      ranked: r.truth ? r.truth.map((i) => r.items[i]!) : null,
      voided: r.voided,
    })),
    written: [
      ...state.itemPool
        .filter((e) => e.author !== null)
        .map((e) => ({ text: e.text, author: name(e.author!), kind: 'items' as const })),
      ...state.criteriaPool
        .filter((e) => e.author !== null)
        .map((e) => ({ text: e.text, author: name(e.author!), kind: 'criteria' as const })),
    ],
  };
}

function revealView(r: RoundRecord): RevealView {
  return {
    round: r.round,
    criterion: r.criterion ?? '',
    items: r.items.slice(),
    ranker: r.ranker,
    truth: r.truth!.slice(),
    means: r.means ? r.means.slice() : null,
    entries: r.results.map((res, s) =>
      res ? { order: r.orders[s] ? r.orders[s]!.slice() : null, result: { ...res } } : null,
    ),
    rankerPoints: r.rankerPoints,
    points: r.points.slice(),
  };
}

export function rankItViewFor(state: RankItState, seat: SeatIndex | null): RankItView {
  const n = state.seats.length;
  const me = typeof seat === 'number' && Number.isInteger(seat) && seat >= 0 && seat < n ? seat : null;
  const inRound = state.phase === 'choose' || state.phase === 'rank';
  const last = state.history[state.history.length - 1];
  const shown = state.phase === 'reveal' && last && !last.voided ? last : null;
  const chooser = inRound ? chooserOf(state) : (shown?.chooser ?? null);

  return {
    phase: state.phase,
    mode: state.options.mode,
    seats: state.seats.map((s) => ({ ...s })),
    collect: state.phase === 'collect' && state.collect ? collectView(state.collect, me, n) : null,
    collectStage: state.phase === 'collect' ? state.collectStage : null,
    criteriaNext: state.phase === 'collect' && state.collectStage === 'items' && state.options.criteria.perPlayer > 0,
    round: state.round,
    totalRounds: state.totalRounds,
    itemCount: state.options.itemCount,
    timeLimit: state.options.timeLimit,
    ranker: inRound ? rankerOf(state) : (shown?.ranker ?? null),
    chooser,
    items: inRound ? state.dealt.map((id) => state.itemPool[id]!.text) : shown ? shown.items.slice() : [],
    criterion: state.phase === 'rank' ? state.criterion : shown ? shown.criterion : null,
    yourOptions:
      state.phase === 'choose' && me !== null && me === chooser
        ? state.offered.map((id) => state.criteriaPool[id]!.text)
        : null,
    timer: state.phase === 'rank' && state.timer ? { ...state.timer } : null,
    submitted: state.phase === 'rank' ? state.orders.map((o) => o !== null) : new Array<boolean>(n).fill(false),
    yourOrder: state.phase === 'rank' && me !== null && state.orders[me] ? state.orders[me]!.slice() : null,
    reveal: shown ? revealView(shown) : null,
    lastVoid:
      inRound && last && last.voided && last.round === state.round - 1
        ? { round: last.round, reason: last.voided, ranker: last.ranker }
        : null,
    scores: state.scores.slice(),
    results: state.phase === 'gameOver' ? buildResults(state) : null,
  };
}

// ============================================================================
// Module
// ============================================================================

export const rankItModule: GameModule<RankItState, RankItView, RankItAction> = {
  id: 'rank-it',
  displayName: 'Rank It',
  minPlayers: MIN_PLAYERS,
  maxPlayers: MAX_PLAYERS,

  createInitialState(config: GameConfig): RankItState {
    const options = readOptions(config.gameOptions);
    const seats = config.seats.map((s, i) => ({ index: i, name: s.name }));
    const n = seats.length;
    if (n < MIN_PLAYERS || n > MAX_PLAYERS) throw new Error(`Rank It needs ${MIN_PLAYERS}–${MAX_PLAYERS} players.`);
    const problem = optionsProblem(config.gameOptions, n);
    if (problem) throw new Error(problem);

    const rng = makeRng(subSeed(config.seed, 0x4a4b));
    const total = totalRounds(options, n);
    const k = options.itemCount;
    // Host lists + packs, shuffled; only what a whole game could use is kept.
    const itemPool: Entry[] = rngShuffle(
      rng,
      buildPool({ source: { ...options.items, perPlayer: 0 }, lists: config.lists }),
    )
      .slice(0, total * k + 30)
      .map((e) => ({ text: e.text, author: null }));
    const criteriaPool: Entry[] = asCriteria(
      rngShuffle(
        rng,
        buildPromptPool({
          source: { ...options.criteria, perPlayer: 0 },
          builtIn: RANK_CRITERIA,
          spicy: RANK_CRITERIA_SPICY,
          lists: config.lists,
        }),
      ),
    ).slice(0, total * OFFER_COUNT + 30);

    const base: RankItState = {
      phase: 'collect',
      options,
      seats,
      rng,
      collect: null,
      collectStage: null,
      itemPool,
      itemDeck: [],
      criteriaPool,
      criteriaDeck: [],
      turnOrder: [],
      totalRounds: total,
      round: 0,
      dealt: [],
      offered: [],
      criterion: null,
      timer: null,
      orders: noOrders(n),
      scores: new Array<number>(n).fill(0),
      history: [],
    };

    if (options.items.perPlayer > 0) {
      const p = options.items.perPlayer;
      return { ...base, collectStage: 'items', collect: startCollect('words', p, itemsPrompt(p)) };
    }
    if (itemPool.length < k) {
      throw new Error(`Only ${itemPool.length} items available — pick more packs or let players write some.`);
    }
    if (options.criteria.perPlayer > 0) {
      const p = options.criteria.perPlayer;
      return { ...base, collectStage: 'criteria', collect: startCollect('words', p, criteriaPrompt(p)) };
    }
    return beginGame(base, config.now);
  },

  applyAction: applyRankIt,
  viewFor: rankItViewFor,

  isFinished: (state) => state.phase === 'gameOver',

  defaultOptions: () => structuredClone(DEFAULT_OPTIONS) as unknown as Record<string, unknown>,

  optionsProblem,

  nextScheduled(state) {
    if (state.phase !== 'rank' || !state.timer || state.timer.endsAt === null) return null;
    return { at: state.timer.endsAt + GRACE_MS, action: { type: 'timeUp', round: state.round } };
  },
};
