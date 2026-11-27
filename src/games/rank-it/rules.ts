import { readPromptSource, readSource, type PromptSource, type WordSource } from '@/words/source';

// Options, scoring and validation for Rank It. Pure: no state, no RNG.

/**
 * 'ranker': a rotating Ranker secretly orders the items, everyone else
 *           guesses their order.
 * 'crowd':  no Ranker; everyone ranks and scores by closeness to the
 *           room's consensus.
 */
export type RankMode = 'ranker' | 'crowd';
/** Crowd mode: the criterion is drawn at random, or picked by a rotating chooser. */
export type CrowdPick = 'random' | 'chooser';

export const TIME_LIMITS = [0, 45, 60, 90] as const;

export interface RankItOptions {
  mode: RankMode;
  /** The things being ranked. Packs default on; "everyone writes" is the star mode. */
  items: WordSource;
  /** What they're ranked by ("Most → least: <criterion>"). */
  criteria: PromptSource;
  /** Items dealt per round. */
  itemCount: number;
  /** Ranker mode: how many times everyone is the Ranker. */
  rotations: number;
  /** Crowd mode: number of rounds. */
  rounds: number;
  crowdPick: CrowdPick;
  /** Ranking time limit in seconds; 0 = no limit. */
  timeLimit: number;
}

export const DEFAULT_OPTIONS: RankItOptions = {
  mode: 'ranker',
  items: { packs: ['everyday', 'food', 'famous', 'pop-culture', 'animals'], listIds: [], perPlayer: 0 },
  criteria: { builtIn: true, spicy: false, listIds: [], perPlayer: 0 },
  itemCount: 5,
  rotations: 1,
  rounds: 6,
  crowdPick: 'random',
  timeLimit: 0,
};

export const MIN_ITEMS = 3;
export const MAX_ITEMS = 7;
export const MIN_ROTATIONS = 1;
export const MAX_ROTATIONS = 3;
export const MIN_ROUNDS = 3;
export const MAX_ROUNDS = 10;
/** Criteria offered to the Ranker (or crowd chooser) each round. */
export const OFFER_COUNT = 2;
export const MAX_CRITERION_LENGTH = 60;

export const EXACT_POINTS = 2;
export const NEAR_POINTS = 1;
export const PERFECT_BONUS = 3;

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.round(n))) : fallback;
}

/** Coerce untrusted options (from the lobby) into valid ones. */
export function readOptions(raw: Record<string, unknown> | undefined): RankItOptions {
  const r = raw ?? {};
  const limit = Number(r.timeLimit);
  return {
    mode: r.mode === 'crowd' || r.mode === 'ranker' ? r.mode : DEFAULT_OPTIONS.mode,
    items: readSource(r.items, DEFAULT_OPTIONS.items),
    criteria: readPromptSource(r.criteria, DEFAULT_OPTIONS.criteria),
    itemCount: clampInt(r.itemCount, MIN_ITEMS, MAX_ITEMS, DEFAULT_OPTIONS.itemCount),
    rotations: clampInt(r.rotations, MIN_ROTATIONS, MAX_ROTATIONS, DEFAULT_OPTIONS.rotations),
    rounds: clampInt(r.rounds, MIN_ROUNDS, MAX_ROUNDS, DEFAULT_OPTIONS.rounds),
    crowdPick: r.crowdPick === 'chooser' || r.crowdPick === 'random' ? r.crowdPick : DEFAULT_OPTIONS.crowdPick,
    timeLimit: (TIME_LIMITS as readonly number[]).includes(limit) ? limit : DEFAULT_OPTIONS.timeLimit,
  };
}

export function optionsProblem(raw: Record<string, unknown>, playerCount: number): string | null {
  const o = readOptions(raw);
  const noLists = o.items.packs.length === 0 && o.items.listIds.length === 0;
  if (noLists && o.items.perPlayer === 0) {
    return 'Choose where the items come from: players, a saved list, or a pack.';
  }
  const c = o.criteria;
  if (!c.builtIn && !c.spicy && c.listIds.length === 0 && c.perPlayer === 0) {
    return 'Choose where the criteria come from: the built-in list, a saved list, or players.';
  }
  if (noLists && o.items.perPlayer * playerCount < o.itemCount) {
    return `Players only write ${o.items.perPlayer * playerCount} items but each round deals ${o.itemCount}. Ask for more each, or add a pack.`;
  }
  return null;
}

/** Does someone pick the criterion each round (vs. drawing one)? */
export function hasChooser(o: RankItOptions): boolean {
  return o.mode === 'ranker' || o.crowdPick === 'chooser';
}

export function totalRounds(o: RankItOptions, playerCount: number): number {
  return o.mode === 'ranker' ? playerCount * o.rotations : o.rounds;
}

/** Best possible score for one round with `k` items. */
export function maxRoundPoints(k: number): number {
  return k * EXACT_POINTS + PERFECT_BONUS;
}

/**
 * A criterion as typed by a person: trim, collapse whitespace, drop a
 * leading "most" / "the most" (the UI already says "Most → least") and any
 * trailing sentence punctuation. Returns '' for nothing usable.
 */
export function cleanCriterion(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  let t = raw.replace(/\s+/g, ' ').trim();
  const stripped = t.replace(/^(the\s+)?most\s+/i, '');
  if (stripped) t = stripped;
  return t.replace(/[.!?]+$/, '').trim();
}

/** Validate an order: a permutation of 0..k-1, MOST first. Throws otherwise. */
export function readOrder(raw: unknown, k: number): number[] {
  if (!Array.isArray(raw) || raw.length !== k) throw new Error(`Rank all ${k} items`);
  const seen = new Set<number>();
  for (const x of raw) {
    if (typeof x !== 'number' || !Number.isInteger(x) || x < 0 || x >= k || seen.has(x)) {
      throw new Error('That isn’t a ranking of these items');
    }
    seen.add(x);
  }
  return raw.slice() as number[];
}

export interface OrderScore {
  points: number;
  /** Items in exactly the right place. */
  exact: number;
  /** Items one place off. */
  near: number;
  perfect: boolean;
}

/**
 * Score `guess` against `truth` (both item-index orders, MOST first):
 * 2 per item in the exact place, 1 per item one place off, +3 for a
 * perfect order.
 */
export function scoreOrder(guess: readonly number[], truth: readonly number[]): OrderScore {
  const at = new Map<number, number>();
  truth.forEach((item, pos) => at.set(item, pos));
  let exact = 0;
  let near = 0;
  guess.forEach((item, pos) => {
    const d = Math.abs(pos - (at.get(item) ?? -99));
    if (d === 0) exact++;
    else if (d === 1) near++;
  });
  const perfect = exact === truth.length && truth.length > 0;
  return {
    points: exact * EXACT_POINTS + near * NEAR_POINTS + (perfect ? PERFECT_BONUS : 0),
    exact,
    near,
    perfect,
  };
}

/**
 * The room's consensus over `orders` (each a permutation of 0..k-1, MOST
 * first): every item's mean rank (1 = most), sorted ascending. Ties go to
 * the item dealt first (lower item index) — deterministic, and visible to
 * players because the tray lists items in dealt order.
 */
export function consensus(orders: ReadonlyArray<readonly number[]>, k: number): { order: number[]; means: number[] } {
  const sums = new Array<number>(k).fill(0);
  for (const o of orders) o.forEach((item, pos) => (sums[item]! += pos + 1));
  const count = Math.max(1, orders.length);
  const order = Array.from({ length: k }, (_, i) => i).sort((a, b) => sums[a]! - sums[b]! || a - b);
  return { order, means: sums.map((s) => Math.round((s / count) * 100) / 100) };
}

/** The Ranker's score: the guessers' mean, rounded half up. 0 with no guesses. */
export function rankerScore(guesserPoints: readonly number[]): number {
  if (guesserPoints.length === 0) return 0;
  return Math.round(guesserPoints.reduce((a, b) => a + b, 0) / guesserPoints.length);
}
