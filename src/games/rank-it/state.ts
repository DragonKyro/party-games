import type { RngState } from '@/engine/rng';
import type { Timer } from '@/engine/timer';
import type { SeatIndex } from '@/engine/types';
import type { CollectState, CollectView } from '@/words/collect';
import type { RankItOptions, RankMode } from './rules';

// ============================================================================
// Rank It — host state
//
// Each round deals a handful of items and a criterion; players order the
// items from MOST to LEAST by it.
//   - ranker mode: a rotating Ranker picks the criterion (from two offered,
//     or writes one), secretly orders the items, and everyone else guesses
//     that order at the same time.
//   - crowd mode: everyone ranks; the room's mean ranking is the answer.
//
// Hidden information:
//   - every submitted order (the Ranker's and each guess) until the reveal —
//     a seat sees only its own;
//   - the criteria offered to the chooser (only the chooser sees them);
//   - the item / criteria pools and decks, including player-written entries
//     that haven't been dealt yet (who wrote what: only on the final screen);
//   - the RNG state.
// Public: who is the Ranker / chooser, the dealt items, the chosen
// criterion, who has locked in, the timer and the scores.
// ============================================================================

export type RankItPhase =
  | 'collect' // players writing items and/or criteria
  | 'choose' // the Ranker (or crowd chooser) picks the criterion
  | 'rank' // everyone orders the items (simultaneously)
  | 'reveal' // the answer, the guesses and the points
  | 'gameOver';

export type CollectStage = 'items' | 'criteria';

export interface Entry {
  text: string;
  /** The seat that wrote it (collected), else null. */
  author: SeatIndex | null;
}

/** Why a round scored nothing. */
export type VoidReason =
  | 'noRanker' // the Ranker didn't lock in an order
  | 'tooFew' // crowd mode: fewer than 2 rankings
  | 'skipped'; // the host skipped the round

export interface SeatResult {
  points: number;
  exact: number;
  near: number;
  perfect: boolean;
  submitted: boolean;
}

export interface RoundRecord {
  round: number;
  ranker: SeatIndex | null;
  chooser: SeatIndex | null;
  items: string[];
  criterion: string | null;
  voided: VoidReason | null;
  /** The answer (item indices, MOST first): the Ranker's order or the consensus. */
  truth: number[] | null;
  /** Crowd mode: each item's mean rank (1 = most). */
  means: number[] | null;
  /** Every seat's submission (null = didn't lock in). */
  orders: Array<number[] | null>;
  /** Per seat: guess / closeness scoring. null for the Ranker. */
  results: Array<SeatResult | null>;
  rankerPoints: number | null;
  /** Everything each seat earned this round (the Ranker's included). */
  points: number[];
}

export interface RankItState {
  phase: RankItPhase;
  options: RankItOptions;
  seats: Array<{ index: SeatIndex; name: string }>;
  rng: RngState;

  collect: CollectState | null;
  collectStage: CollectStage | null;

  /** Host-private pools (deduped) and their draw orders (ids into the pool). */
  itemPool: Entry[];
  itemDeck: number[];
  criteriaPool: Entry[];
  criteriaDeck: number[];

  /** Ranker / chooser rotation. */
  turnOrder: SeatIndex[];
  totalRounds: number;
  /** 0-based; also the token on round-scoped actions. */
  round: number;

  // --- current round ---
  /** Item ids (into itemPool) dealt this round, in dealt order. */
  dealt: number[];
  /** Criteria ids offered to the chooser (choose phase). */
  offered: number[];
  criterion: string | null;
  timer: Timer | null;
  /** Per seat: the submitted order (item indices into `dealt`, MOST first). */
  orders: Array<number[] | null>;

  /** Running totals per seat. */
  scores: number[];
  history: RoundRecord[];
}

// ============================================================================
// Public view
// ============================================================================

export interface RevealView {
  round: number;
  criterion: string;
  items: string[];
  ranker: SeatIndex | null;
  /** The answer: item indices, MOST first. */
  truth: number[];
  /** Crowd mode: mean rank per item index. */
  means: number[] | null;
  /** Per seat: their order (null = no submission) and score. The Ranker's entry is null. */
  entries: Array<{ order: number[] | null; result: SeatResult } | null>;
  rankerPoints: number | null;
  /** Everything each seat earned this round. */
  points: number[];
}

export interface Award {
  emoji: string;
  title: string;
  seats: SeatIndex[];
  detail: string;
}

export interface ResultsView {
  awards: Award[];
  /** Points from guessing (ranker mode) / matching the room (crowd). */
  guessPoints: number[];
  /** Ranker mode: points earned as the Ranker. */
  rankerPoints: number[];
  perfects: number[];
  rounds: Array<{
    round: number;
    ranker: SeatIndex | null;
    criterion: string | null;
    /** Items in the answer's order; null for a void round. */
    ranked: string[] | null;
    voided: VoidReason | null;
  }>;
  /** Player-written entries, revealed with their authors at the end. */
  written: Array<{ text: string; author: string; kind: CollectStage }>;
}

export interface RankItView {
  phase: RankItPhase;
  mode: RankMode;
  seats: Array<{ index: SeatIndex; name: string }>;

  collect: CollectView | null;
  collectStage: CollectStage | null;
  /** Collect: will there be a criteria-writing stage after this one? */
  criteriaNext: boolean;

  round: number;
  totalRounds: number;
  itemCount: number;
  /** Seconds, 0 = none. */
  timeLimit: number;

  /** Ranker mode, during a round. */
  ranker: SeatIndex | null;
  /** Whoever picks the criterion this round (ranker mode: the Ranker). */
  chooser: SeatIndex | null;

  /** This round's items, in dealt order (public once dealt). */
  items: string[];
  /** Public once chosen (rank + reveal). */
  criterion: string | null;
  /** The criteria on offer — ONLY in the chooser's own view, during choose. */
  yourOptions: string[] | null;

  timer: Timer | null;
  /** Rank phase: who has locked in (public). */
  submitted: boolean[];
  /** Rank phase: this seat's own submission, so it can be edited. */
  yourOrder: number[] | null;

  reveal: RevealView | null;
  /** The previous round scored nothing (shown at the start of the next). */
  lastVoid: { round: number; reason: VoidReason; ranker: SeatIndex | null } | null;

  scores: number[];
  results: ResultsView | null;
}
