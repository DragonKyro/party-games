import { readSource, type WordSource } from '@/words/source';

// Options and validation for Slideshow Karaoke.

/** How the audience rates a talk. Online it's always 'phones'. */
export type RatingMode = 'phones' | 'pass' | 'applause';
/** Single-device choice: one applause-meter reading for the crowd, or pass the device round. */
export type LocalRating = 'applause' | 'pass';

/** Slides per talk, title and closer included. */
export const MIN_SLIDES = 4;
export const MAX_SLIDES = 10;
export const DEFAULT_SLIDES = 6;

export function clampSlideCount(n: unknown): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return DEFAULT_SLIDES;
  return Math.max(MIN_SLIDES, Math.min(MAX_SLIDES, Math.round(v)));
}

export const AUTO_ADVANCE_CHOICES = [0, 15, 20, 30] as const;
export const TALK_TIMER_CHOICES = [0, 60, 90, 120, 180, 300] as const;
export const MIN_RATE_SECONDS = 15;
export const MAX_RATE_SECONDS = 90;
export const MAX_TOPICS_PER_PLAYER = 3;

export interface SlideshowOptions {
  /** Where talk topics come from. Players may write some (never presented by their author). */
  words: WordSource;
  /** Slides per talk, title and closer included (4–10). */
  slides: number;
  /** Seconds per slide before it moves on by itself; 0 = the presenter clicks. */
  autoAdvance: number;
  /** Overall talk length in seconds; 0 = no limit. */
  talkSeconds: number;
  /** A wildcard twist lands on everyone's screen at a random slide. */
  twists: boolean;
  /** 1–2 audience questions after the last slide. */
  qa: boolean;
  /** Online: how long the audience has to rate a talk. */
  rateSeconds: number;
  /** Single device: how the crowd rates. */
  localRating: LocalRating;
  /** Talks per player. */
  talksEach: number;
}

export const DEFAULT_OPTIONS: SlideshowOptions = {
  words: { packs: ['everyday', 'hard', 'jobs', 'places', 'animals'], listIds: [], perPlayer: 0 },
  slides: DEFAULT_SLIDES,
  autoAdvance: 0,
  talkSeconds: 0,
  twists: true,
  qa: true,
  rateSeconds: 30,
  localRating: 'applause',
  talksEach: 1,
};

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.round(n))) : fallback;
}

function oneOf<T extends number>(v: unknown, choices: readonly T[], fallback: T): T {
  return choices.includes(Number(v) as T) ? (Number(v) as T) : fallback;
}

/** Coerce untrusted options (from the lobby) into valid ones. */
export function readOptions(raw: Record<string, unknown> | undefined): SlideshowOptions {
  const r = raw ?? {};
  const words = readSource(r.words, DEFAULT_OPTIONS.words);
  return {
    words: { ...words, perPlayer: Math.min(MAX_TOPICS_PER_PLAYER, words.perPlayer) },
    slides: r.slides === undefined ? DEFAULT_OPTIONS.slides : clampSlideCount(r.slides),
    autoAdvance: oneOf(r.autoAdvance, AUTO_ADVANCE_CHOICES, 0),
    talkSeconds: oneOf(r.talkSeconds, TALK_TIMER_CHOICES, 0),
    twists: typeof r.twists === 'boolean' ? r.twists : DEFAULT_OPTIONS.twists,
    qa: typeof r.qa === 'boolean' ? r.qa : DEFAULT_OPTIONS.qa,
    rateSeconds: clampInt(r.rateSeconds, MIN_RATE_SECONDS, MAX_RATE_SECONDS, DEFAULT_OPTIONS.rateSeconds),
    localRating: r.localRating === 'pass' || r.localRating === 'applause' ? r.localRating : DEFAULT_OPTIONS.localRating,
    talksEach: clampInt(r.talksEach, 1, 2, DEFAULT_OPTIONS.talksEach),
  };
}

export function optionsProblem(raw: Record<string, unknown>, _playerCount: number): string | null {
  const o = readOptions(raw);
  if (o.words.packs.length === 0 && o.words.listIds.length === 0 && o.words.perPlayer === 0) {
    return 'Choose where the talk topics come from: players, a saved list, or a pack.';
  }
  return null;
}
