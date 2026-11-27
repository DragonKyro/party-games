import type { RngState } from '@/engine/rng';
import type { Timer } from '@/engine/timer';
import type { SeatIndex } from '@/engine/types';
import type { CollectState, CollectView } from '@/words/collect';
import type { RatingTier, TuneInOptions, TuneMode } from './rules';

// ============================================================================
// Tune In — host state
//
// Each round a rotating Tuner is dealt two spectrums ("Cold ↔ Hot") and a
// secret target on a 0–100 dial. They pick a spectrum and broadcast a short
// clue that sits that far along it. Then the others tune their needles:
//   - everyone mode: every guesser privately sets their own needle; points by
//     distance, and the Tuner scores the rounded-up average of the guessers;
//   - team mode (co-op): one shared needle anyone can drag; the team total
//     builds over a fixed number of rounds into a final rating.
//
// Hidden information:
//   - the target (only the Tuner, until the reveal);
//   - the Tuner's two spectrum options (only the Tuner, until one is chosen);
//   - everyone mode: each guesser's needle (only its owner, until the reveal;
//     whether a seat has locked in is public);
//   - the spectrum deck order and the RNG state (never);
//   - player-written spectrums (private while collecting; public once dealt
//     and chosen).
// Team-mode needle positions are public: everyone watches it move.
// ============================================================================

export type TuneInPhase =
  | 'collect' // players writing spectrums
  | 'tune' // the Tuner picks a spectrum and writes a clue
  | 'guess' // the clue is on air; needles moving
  | 'reveal' // target + needles + points shown
  | 'gameOver';

export interface SpectrumCard {
  id: number;
  left: string;
  right: string;
  /** Who wrote it (players-write), else null. */
  author: SeatIndex | null;
}

export interface GuessRecord {
  seat: SeatIndex;
  /** Where the needle ended up; null = never touched (scores 0). */
  needle: number | null;
  /** Locked in by the player (false = locked where it was at the buzzer / forced reveal). */
  locked: boolean;
  points: number;
}

export interface RoundRecord {
  /** Index of the scored round (0-based). */
  round: number;
  tuner: SeatIndex;
  left: string;
  right: string;
  author: SeatIndex | null;
  clue: string;
  target: number;
  /** How the guessing ended. */
  how: 'locked' | 'timeUp' | 'forced';
  /** Everyone mode: every guesser, in seat order. Empty in team mode. */
  guesses: GuessRecord[];
  /** Everyone mode: the Tuner's points (rounded-up average). 0 in team mode. */
  tunerPoints: number;
  /** Team mode: the shared needle and what it earned. null in everyone mode. */
  team: { needle: number | null; points: number; by: SeatIndex | null } | null;
}

export interface TuneInState {
  phase: TuneInPhase;
  options: TuneInOptions;
  seats: Array<{ index: SeatIndex; name: string }>;
  rng: RngState;

  collect: CollectState | null;
  /** Host lists + built-ins (no player spectrums), kept for after collecting. */
  basePool: Array<{ text: string; author: SeatIndex | null }>;

  cards: SpectrumCard[];
  /** Card ids in draw order (host-only). */
  deck: number[];

  /** Seat that tunes first; then seat order. */
  firstTuner: SeatIndex;
  totalRounds: number;
  /** Scored rounds started so far = index of the current round. */
  round: number;
  /** Tuner turns so far: drives the rotation and is the race token for actions. */
  turnNo: number;

  // --- the current round ---
  /** The Tuner's two options (tune phase). */
  offer: [number, number] | null;
  target: number;
  chosen: number | null;
  clue: string | null;
  timer: Timer | null;
  /** Everyone mode: each seat's needle (null = untouched). */
  needles: Array<number | null>;
  locked: boolean[];
  /** Team mode: the one shared needle. */
  shared: number;
  sharedTouched: boolean;
  sharedBy: SeatIndex | null;

  history: RoundRecord[];
  /** Tuner turns the host skipped (seat each time). */
  skipped: SeatIndex[];
}

// ============================================================================
// Public view
// ============================================================================

export interface TuneInView {
  phase: TuneInPhase;
  mode: TuneMode;
  seats: Array<{ index: SeatIndex; name: string }>;
  collect: CollectView | null;

  round: number;
  totalRounds: number;
  /** Changes every Tuner turn (UIs key pass-the-phone screens on it). */
  turnNo: number;
  /** Who is tuning (tune / guess / reveal). */
  tuner: SeatIndex | null;
  bands: number[];
  guessSeconds: number;

  /** The Tuner's two choices — ONLY in the Tuner's own view, tune phase. */
  yourOptions: Array<{ left: string; right: string }> | null;
  /** The secret target — ONLY in the Tuner's own view, tune + guess phases. */
  yourTarget: number | null;

  /** The chosen spectrum and the clue, once on air. */
  spectrum: { left: string; right: string } | null;
  clue: string | null;
  timer: Timer | null;

  /** Everyone mode, guess phase: who has locked in (public). */
  locked: boolean[];
  /** Everyone mode: this seat's own needle (null = untouched / not guessing). */
  yourNeedle: number | null;
  /** Team mode, guess / reveal: the shared needle (public). */
  shared: { value: number; touched: boolean; by: SeatIndex | null } | null;

  /** Reveal phase: the round just played. */
  reveal: RoundRecord | null;
  /** Every finished round (all public). */
  history: RoundRecord[];
  /** Everyone mode: points per seat. */
  scores: number[];
  /** Team mode: the running total. */
  teamTotal: number;
  /** Team mode: the rating so far (final on the game-over screen). */
  rating: RatingTier | null;
}
