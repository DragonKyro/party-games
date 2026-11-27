import { readSource, type WordSource } from '@/words/source';

// Options, timing, scoring and validation for Sketch & Guess.

export type GuessMode = 'typed' | 'spoken';

export interface SketchOptions {
  words: WordSource;
  /** Every player draws once per round. */
  rounds: number;
  /** Drawing time per turn. */
  turnSeconds: number;
  /**
   * typed  — guessers type; the host checks every guess (online default).
   * spoken — everyone shouts; the drawer (or host) taps who got it.
   * A single-device table always plays spoken.
   */
  guessing: GuessMode;
  /** Show the blanks, and reveal a few letters as time runs down. */
  hints: boolean;
}

export const DEFAULT_OPTIONS: SketchOptions = {
  words: { packs: ['everyday', 'animals', 'food', 'actions'], listIds: [], perPlayer: 0 },
  rounds: 2,
  turnSeconds: 80,
  guessing: 'typed',
  hints: true,
};

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 16;
export const MIN_ROUNDS = 1;
export const MAX_ROUNDS = 5;
export const MIN_TURN_SECONDS = 30;
export const MAX_TURN_SECONDS = 180;
/** Fewest words a packs/lists-only game may start with. */
export const MIN_WORDS = 3;

// ---- timing ---------------------------------------------------------------

/** Words offered to the drawer. */
export const CHOICES = 3;
/** Time to pick a word (online); then one is picked for you. */
export const CHOOSE_MS = 15_000;
/** How long the answer stays up before the next turn. */
export const REVEAL_MS = 6_000;
/** A guess (or a tap) this soon after the buzzer still counts (network lag). */
export const GRACE_MS = 1_200;
/** Hint letters unlock at these fractions of the drawing time. */
export const HINT_AT = [0.5, 0.75] as const;

// ---- typed guessing -------------------------------------------------------

export const MAX_GUESS_LENGTH = 60;
/** One guess per seat per this many ms. */
export const GUESS_INTERVAL_MS = 700;
/** The feed keeps this many entries (per turn). */
export const FEED_LIMIT = 50;

// ---- scoring --------------------------------------------------------------

/** Typed: an instant solve. */
export const GUESS_MAX = 100;
/** Typed: a solve at the buzzer. */
export const GUESS_MIN = 40;
/** Typed: extra for the 1st, 2nd and 3rd solver. */
export const ORDER_BONUS = [15, 10, 5] as const;
/** Spoken: points by the order the drawer taps people in. */
export const SPOKEN_POINTS = [100, 80, 65, 50] as const;
/** The drawer earns this per player who got it. */
export const DRAWER_PER_SOLVER = 25;

/** Typed: `fracLeft` of the clock remained (0..1), the `order`-th solver (0-based). */
export function guessPoints(fracLeft: number, order: number): number {
  const f = Math.max(0, Math.min(1, fracLeft));
  const base = Math.round((GUESS_MIN + (GUESS_MAX - GUESS_MIN) * f) / 5) * 5;
  return base + (ORDER_BONUS[order] ?? 0);
}

/** Spoken: the `order`-th person tapped (0-based). */
export function spokenPoints(order: number): number {
  return SPOKEN_POINTS[order] ?? GUESS_MIN;
}

/**
 * How many letters are showing after each hint (cumulative), for a word with
 * `letters` letters: at most a third of them, split over the two hints.
 */
export function hintPlan(letters: number): [number, number] {
  const k = Math.max(0, Math.floor(letters / 3));
  return [Math.ceil(k / 2), k];
}

// ---- options ----------------------------------------------------------------

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.round(n))) : fallback;
}

/** Coerce untrusted options (from the lobby) into valid ones. */
export function readOptions(raw: Record<string, unknown> | undefined): SketchOptions {
  const r = raw ?? {};
  return {
    words: readSource(r.words, DEFAULT_OPTIONS.words),
    rounds: clampInt(r.rounds, MIN_ROUNDS, MAX_ROUNDS, DEFAULT_OPTIONS.rounds),
    turnSeconds: clampInt(r.turnSeconds, MIN_TURN_SECONDS, MAX_TURN_SECONDS, DEFAULT_OPTIONS.turnSeconds),
    guessing: r.guessing === 'spoken' || r.guessing === 'typed' ? r.guessing : DEFAULT_OPTIONS.guessing,
    hints: typeof r.hints === 'boolean' ? r.hints : DEFAULT_OPTIONS.hints,
  };
}

export function optionsProblem(raw: Record<string, unknown>, playerCount: number): string | null {
  const o = readOptions(raw);
  if (playerCount < MIN_PLAYERS) return `Sketch & Guess needs at least ${MIN_PLAYERS} players.`;
  if (playerCount > MAX_PLAYERS) return `Sketch & Guess takes at most ${MAX_PLAYERS} players.`;
  if (o.words.packs.length === 0 && o.words.listIds.length === 0 && o.words.perPlayer === 0) {
    return 'Choose where the words come from: players, a saved list, or a pack.';
  }
  return null;
}
