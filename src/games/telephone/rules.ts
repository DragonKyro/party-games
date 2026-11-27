import {
  MAX_ENCODED_DRAWING,
  encodeDrawing,
  simplifyDrawing,
  type Drawing,
} from '@/draw/drawing';
import { readSource, type WordSource } from '@/words/source';

// Options, chain arithmetic and validation for Doodle Telephone.

export interface TelephoneOptions {
  /**
   * Where starting prompts come from. `perPlayer > 0` (always 1 here) means
   * everyone writes their own; otherwise each player is dealt a few prompts
   * from the packs / host lists and picks one.
   */
  words: WordSource;
  /** Shared step clock (online). On one device the clock runs per player instead. */
  timed: boolean;
  drawSeconds: number;
  guessSeconds: number;
  /**
   * Cap on steps after the prompt (0 = no cap: each other player once).
   * Rounded up to end on a guess.
   */
  maxSteps: number;
}

export const DEFAULT_OPTIONS: TelephoneOptions = {
  words: { packs: ['actions', 'idioms', 'everyday', 'characters'], listIds: [], perPlayer: 0 },
  timed: true,
  drawSeconds: 75,
  guessSeconds: 30,
  maxSteps: 0,
};

/** Prompts dealt to each player to choose from. */
export const PROMPT_CHOICES = 3;
export const MAX_GUESS_LENGTH = 60;
export const NO_GUESS = '(no guess)';
/** The encoded blank page a missed drawing becomes. */
export const BLANK_DRAWING = encodeDrawing([]);

export const DRAW_SECONDS = { min: 20, max: 240 } as const;
export const GUESS_SECONDS = { min: 10, max: 120 } as const;
export const MAX_STEPS = { min: 2, max: 30 } as const;

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.round(n))) : fallback;
}

/** Coerce untrusted options (from the lobby) into valid ones. */
export function readOptions(raw: Record<string, unknown> | undefined): TelephoneOptions {
  const r = raw ?? {};
  const words = readSource(r.words, DEFAULT_OPTIONS.words);
  const capRaw = Number(r.maxSteps ?? 0);
  return {
    // Writing your own means exactly one prompt each.
    words: { ...words, perPlayer: words.perPlayer > 0 ? 1 : 0 },
    timed: typeof r.timed === 'boolean' ? r.timed : DEFAULT_OPTIONS.timed,
    drawSeconds: clampInt(r.drawSeconds, DRAW_SECONDS.min, DRAW_SECONDS.max, DEFAULT_OPTIONS.drawSeconds),
    guessSeconds: clampInt(r.guessSeconds, GUESS_SECONDS.min, GUESS_SECONDS.max, DEFAULT_OPTIONS.guessSeconds),
    maxSteps:
      Number.isFinite(capRaw) && capRaw > 0 ? clampInt(capRaw, MAX_STEPS.min, MAX_STEPS.max, 0) : 0,
  };
}

export function optionsProblem(raw: Record<string, unknown>, playerCount: number): string | null {
  const o = readOptions(raw);
  if (playerCount < 3) return 'Doodle Telephone needs at least 3 players.';
  if (o.words.packs.length === 0 && o.words.listIds.length === 0 && o.words.perPlayer === 0) {
    return 'Choose where the prompts come from: players, a saved list, or a pack.';
  }
  return null;
}

/**
 * Steps after the prompt for `n` players. Default: every other player once
 * (n − 1). Capped by `maxSteps`. Always even, so every book ends on a guess —
 * with an even table that final guess falls to the book's owner.
 */
export function chainLength(n: number, maxSteps = 0): number {
  let steps = Math.max(1, n - 1);
  if (maxSteps > 0) steps = Math.min(steps, maxSteps);
  if (steps % 2 === 1) steps += 1;
  return Math.max(2, steps);
}

export type StepKind = 'draw' | 'guess';

/** Step 0 is the prompt; then draw, guess, draw, guess… */
export function stepKind(step: number): StepKind {
  return step % 2 === 1 ? 'draw' : 'guess';
}

/** The seat holding book `book` at step `step`. */
export function holderOf(book: number, step: number, n: number): number {
  return (((book + step) % n) + n) % n;
}

/** The book seat `seat` holds at step `step`. */
export function bookHeldBy(seat: number, step: number, n: number): number {
  return (((seat - step) % n) + n) % n;
}

/** Normalise a typed guess; '' if empty. Throws if it's too long. */
export function cleanGuess(raw: unknown): string {
  if (typeof raw !== 'string') throw new Error('A guess must be text');
  const text = raw.replace(/\s+/g, ' ').trim();
  if (text.length > MAX_GUESS_LENGTH) throw new Error(`Keep it under ${MAX_GUESS_LENGTH} characters`);
  return text;
}

/**
 * Encode a finished drawing so it fits the size cap: simplify harder and
 * harder, and as a last resort drop the latest strokes. Used by the UI when
 * submitting (and when auto-submitting at the buzzer).
 */
export function encodeToFit(drawing: Drawing, max = MAX_ENCODED_DRAWING): string {
  for (const eps of [1.2, 2, 3.5, 6]) {
    const enc = encodeDrawing(simplifyDrawing(drawing, eps));
    if (enc.length <= max) return enc;
  }
  let strokes = simplifyDrawing(drawing, 6);
  while (strokes.length > 0) {
    strokes = strokes.slice(0, -1);
    const enc = encodeDrawing(strokes);
    if (enc.length <= max) return enc;
  }
  return BLANK_DRAWING;
}
