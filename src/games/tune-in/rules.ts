import { entryKey, readPromptSource, type PromptSource } from '@/words/source';

// Options, scoring and validation for Tune In.

export type TuneMode = 'everyone' | 'team';

/** Distance limits for 4 / 3 / 2 / 1 points, strictly increasing. */
export type Bands = [number, number, number, number];

export const BAND_POINTS = [4, 3, 2, 1] as const;
export const MAX_POINTS = BAND_POINTS[0];

export type ZonePreset = 'tight' | 'standard' | 'generous';
export const ZONE_PRESETS: Record<ZonePreset, Readonly<Bands>> = {
  tight: [2, 5, 9, 14],
  standard: [3, 8, 14, 20],
  generous: [4, 10, 17, 25],
};

export const GUESS_TIMES = [0, 60, 90] as const;

export interface TuneInOptions {
  spectrums: PromptSource;
  mode: TuneMode;
  /** Everyone mode: how many times each player is the Tuner. */
  rotations: number;
  /** Team mode: how many rounds the team plays. */
  rounds: number;
  /** Guessing timer; 0 = off. */
  guessSeconds: number;
  bands: Bands;
}

export const DEFAULT_OPTIONS: TuneInOptions = {
  spectrums: { builtIn: true, spicy: false, listIds: [], perPlayer: 0 },
  mode: 'everyone',
  rotations: 1,
  rounds: 8,
  guessSeconds: 0,
  bands: [...ZONE_PRESETS.standard],
};

export const MIN_ROTATIONS = 1;
export const MAX_ROTATIONS = 3;
export const MIN_ROUNDS = 5;
export const MAX_ROUNDS = 12;
/** The Tuner always chooses between two. */
export const MIN_SPECTRUMS = 2;
export const MAX_CLUE = 40;
/** Dial positions run 0..100; targets avoid the very ends. */
export const DIAL_MAX = 100;
export const MIN_TARGET = 4;
export const MAX_TARGET = 96;
/** Where a fresh team needle starts. */
export const NEEDLE_START = 50;

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.round(n))) : fallback;
}

/** Four strictly increasing integers in 1..50, or the fallback. */
export function readBands(raw: unknown, fallback: Bands = DEFAULT_OPTIONS.bands): Bands {
  if (!Array.isArray(raw) || raw.length !== 4) return [...fallback];
  const b = raw.map(Number);
  const ok = b.every((x, i) => Number.isInteger(x) && x >= 1 && x <= 50 && (i === 0 || x > b[i - 1]!));
  return ok ? (b as Bands) : [...fallback];
}

/** Coerce untrusted options (from the lobby) into valid ones. */
export function readOptions(raw: Record<string, unknown> | undefined): TuneInOptions {
  const r = raw ?? {};
  const secs = Number(r.guessSeconds);
  return {
    spectrums: readPromptSource(r.spectrums, DEFAULT_OPTIONS.spectrums),
    mode: r.mode === 'team' || r.mode === 'everyone' ? r.mode : DEFAULT_OPTIONS.mode,
    rotations: clampInt(r.rotations, MIN_ROTATIONS, MAX_ROTATIONS, DEFAULT_OPTIONS.rotations),
    rounds: clampInt(r.rounds, MIN_ROUNDS, MAX_ROUNDS, DEFAULT_OPTIONS.rounds),
    guessSeconds: (GUESS_TIMES as readonly number[]).includes(secs) ? secs : DEFAULT_OPTIONS.guessSeconds,
    bands: readBands(r.bands),
  };
}

export function optionsProblem(raw: Record<string, unknown>, _playerCount: number): string | null {
  const s = readOptions(raw).spectrums;
  if (!s.builtIn && !s.spicy && s.listIds.length === 0 && s.perPlayer === 0) {
    return 'Choose where the spectrums come from: built-in, a saved list, or players writing them.';
  }
  return null;
}

/** Rounds in the match: everyone tunes `rotations` times, or the team's `rounds`. */
export function totalRounds(o: TuneInOptions, playerCount: number): number {
  return o.mode === 'everyone' ? playerCount * o.rotations : o.rounds;
}

/** Points for a needle `distance` away from the target. */
export function pointsFor(distance: number, bands: readonly number[]): number {
  for (let i = 0; i < BAND_POINTS.length; i++) if (distance <= bands[i]!) return BAND_POINTS[i]!;
  return 0;
}

/** Rounded-up average (0 for nobody). */
export function ceilAverage(points: readonly number[]): number {
  if (points.length === 0) return 0;
  const sum = points.reduce((a, b) => a + b, 0);
  return Math.floor((sum + points.length - 1) / points.length);
}

export function presetFor(bands: readonly number[]): ZonePreset | null {
  for (const [k, v] of Object.entries(ZONE_PRESETS)) {
    if (v.every((x, i) => bands[i] === x)) return k as ZonePreset;
  }
  return null;
}

export const ZONE_NAMES: Record<ZonePreset, string> = { tight: 'Tight', standard: 'Standard', generous: 'Generous' };

export function describeBands(bands: readonly number[]): string {
  const p = presetFor(bands);
  return `${p ? ZONE_NAMES[p] : 'Custom'} zones (±${bands.join(' / ±')})`;
}

// ---------------------------------------------------------------------------
// Clues
// ---------------------------------------------------------------------------

/** Collapse whitespace and trim. */
export function cleanClue(raw: unknown): string {
  return typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim() : '';
}

/** Why `clue` (already cleaned) can't go on air for this spectrum, or null. */
export function clueProblem(clue: string, left: string, right: string): string | null {
  if (!clue) return 'Write a clue.';
  if (clue.length > MAX_CLUE) return `Keep it to ${MAX_CLUE} characters.`;
  const key = entryKey(clue);
  if (key && (key === entryKey(left) || key === entryKey(right))) return 'The clue can’t just be one of the ends.';
  return null;
}

// ---------------------------------------------------------------------------
// Words for points, and the team's final rating
// ---------------------------------------------------------------------------

export const POINT_LABELS: Record<number, string> = {
  4: 'Bullseye!',
  3: 'Crystal clear',
  2: 'Good signal',
  1: 'Faint signal',
  0: 'Static',
};

export interface RatingTier {
  /** 0 = best. */
  index: number;
  /** Fraction of the maximum needed. */
  min: number;
  emoji: string;
  name: string;
  blurb: string;
}

export const RATING_TIERS: readonly RatingTier[] = [
  { index: 0, min: 0.85, emoji: '🧠', name: 'Telepathic', blurb: 'One frequency, one brain. Frankly a bit spooky.' },
  { index: 1, min: 0.7, emoji: '📡', name: 'Crystal Clear', blurb: 'Every clue came through loud and clear.' },
  { index: 2, min: 0.55, emoji: '🔊', name: 'Strong Signal', blurb: 'A crackle here and there, but you were vibing.' },
  { index: 3, min: 0.4, emoji: '📻', name: 'Decent Reception', blurb: 'Wiggle the antenna and you’re golden.' },
  { index: 4, min: 0.25, emoji: '🌫️', name: 'Patchy Static', blurb: 'Somewhere between two stations.' },
  { index: 5, min: 0, emoji: '🔌', name: 'Dead Air', blurb: 'Is this thing even plugged in?' },
];

/** The team's tier for `total` points over `rounds` played (null before any). */
export function ratingFor(total: number, rounds: number): RatingTier | null {
  if (rounds <= 0) return null;
  const frac = total / (rounds * MAX_POINTS);
  return RATING_TIERS.find((t) => frac >= t.min) ?? RATING_TIERS[RATING_TIERS.length - 1]!;
}
