import { readSource, type WordSource } from '@/words/source';

// Options, timing constants and validation for Forehead.

/**
 * Where the word shows during a turn.
 *   'forehead' — on the guesser's own phone, held up to their forehead (the
 *                only mode on a single device).
 *   'others'   — online only: on everyone else's phone; the guesser's phone
 *                never receives the word.
 */
export type DisplayMode = 'forehead' | 'others';

export interface ForeheadOptions {
  words: WordSource;
  turnSeconds: number;
  /** Every player guesses once per round. */
  rounds: number;
  display: DisplayMode;
}

export const DEFAULT_OPTIONS: ForeheadOptions = {
  words: { packs: ['famous', 'pop-culture', 'animals'], listIds: [], perPlayer: 0 },
  turnSeconds: 60,
  rounds: 1,
  display: 'forehead',
};

export const MIN_TURN_SECONDS = 30;
export const MAX_TURN_SECONDS = 120;
export const MIN_ROUNDS = 1;
export const MAX_ROUNDS = 3;

/** A deck from packs / lists alone must have at least this many cards. */
export const MIN_CARDS = 10;
/** Most cards kept in the host's deck (packs can add hundreds). */
export const MAX_DECK = 600;

/** The 3-2-1 between Start and the first card. */
export const GET_READY_MS = 3000;
/** A "correct" this long after the buzzer still counts (network lag, a tilt racing the clock). */
export const GRACE_MS = 1500;

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.round(n))) : fallback;
}

/** Coerce untrusted options (from the lobby) into valid ones. */
export function readOptions(raw: Record<string, unknown> | undefined): ForeheadOptions {
  const r = raw ?? {};
  return {
    words: readSource(r.words, DEFAULT_OPTIONS.words),
    turnSeconds: clampInt(r.turnSeconds, MIN_TURN_SECONDS, MAX_TURN_SECONDS, DEFAULT_OPTIONS.turnSeconds),
    rounds: clampInt(r.rounds, MIN_ROUNDS, MAX_ROUNDS, DEFAULT_OPTIONS.rounds),
    display: r.display === 'others' || r.display === 'forehead' ? r.display : DEFAULT_OPTIONS.display,
  };
}

export function optionsProblem(raw: Record<string, unknown>, playerCount: number): string | null {
  const o = readOptions(raw);
  if (playerCount < 2) return 'Forehead needs at least 2 players: one guesses, the rest give clues.';
  if (o.words.packs.length === 0 && o.words.listIds.length === 0 && o.words.perPlayer === 0) {
    return 'Choose where the cards come from: players, a saved list, or a pack.';
  }
  return null;
}

/** A brisk group gets through about one card every 4 seconds. */
export function cardsPerTurn(turnSeconds: number): number {
  return Math.ceil(turnSeconds / 4);
}

/** Roughly how many cards a whole match uses (sizes the shuffled part of the deck). */
export function cardsNeeded(o: Pick<ForeheadOptions, 'turnSeconds' | 'rounds'>, players: number): number {
  return o.rounds * players * cardsPerTurn(o.turnSeconds) + 10;
}
