import type { RngState } from '@/engine/rng';
import type { Timer } from '@/engine/timer';
import type { SeatIndex } from '@/engine/types';
import type { CollectState, CollectView } from '@/words/collect';
import type { DisplayMode, ForeheadOptions } from './rules';

// ============================================================================
// Forehead — host state
//
// One player (the guesser) has a card on their forehead with a word everyone
// else can see. The others shout clues; tilt the phone down for "got it", up
// to pass. Each player guesses once per round; you score the cards you get.
//
// Hidden information:
//   - the card on the forehead: never in the spectator view; never in the
//     guesser's view in 'others' mode (nor while their turn is paused);
//   - the deck (order and contents): never in any view;
//   - who wrote which card (anonymous until the final screen);
//   - the RNG state.
// ============================================================================

export type ForeheadPhase =
  | 'collect' // players writing cards
  | 'ready' // next guesser up, clock not running
  | 'getReady' // the 3-2-1 before the first card (a scheduled action ends it)
  | 'turn' // clock running, cards on the forehead
  | 'turnResults' // the list of the turn's cards
  | 'gameOver';

export interface Card {
  id: number;
  text: string;
  /** The seat that wrote it, or null (a pack / host list). Never dealt to its author. */
  author: SeatIndex | null;
}

export interface CardResult {
  id: number;
  /** The deal number: the token actions carry. */
  no: number;
  got: boolean;
}

/** How a turn ended: the buzzer, the deck running out, or someone stopping it. */
export type TurnEnd = 'time' | 'deck' | 'stopped';

export interface TurnRecord {
  seat: SeatIndex;
  round: number;
  cards: CardResult[];
  end: TurnEnd;
}

export interface ForeheadState {
  phase: ForeheadPhase;
  options: ForeheadOptions;
  /** The mode in effect: always 'forehead' on a single-device table. */
  display: DisplayMode;
  seats: Array<{ index: SeatIndex; name: string }>;
  rng: RngState;

  collect: CollectState | null;
  /** Packs + host lists, shuffled at start; merged with player cards into the deck after collecting. */
  topUp: Array<{ text: string }>;

  cards: Card[];
  /** Undealt card ids in draw order. A dealt card never returns: no repeats in a match. */
  deck: number[];

  /** Guessing order (seat indexes); the same every round. */
  order: SeatIndex[];
  /** Turns completed or skipped so far. Guesser = order[turnNo % n], round = floor(turnNo / n). */
  turnNo: number;

  /** The 3-2-1 (getReady only). */
  countdown: Timer | null;
  /** The turn clock (turn only). */
  timer: Timer | null;
  /** The card on the forehead. */
  current: { id: number; no: number } | null;
  /** Cards dealt so far this match (the next card's token is dealt + 1). */
  dealt: number;
  turnCards: CardResult[];
  history: TurnRecord[];

  /** turnResults after the buzzer: the card that was up and when time ran out (for the grace window). */
  buzzer: { no: number; at: number } | null;
  /** The match ended because the deck ran dry. */
  ranOut: boolean;
}

// ============================================================================
// Public view
// ============================================================================

export interface ForeheadView {
  phase: ForeheadPhase;
  seats: Array<{ index: SeatIndex; name: string }>;
  collect: CollectView | null;
  display: DisplayMode;

  rounds: number;
  /** 0-based round of the turn up / just played. */
  round: number;
  /** Changes every turn; UIs key pass-the-phone screens on it, and `start` / `next` carry it. */
  turnNo: number;
  totalTurns: number;
  turnSeconds: number;

  /** Who's guessing (ready → turnResults). */
  guesser: SeatIndex | null;
  /** turnResults: who guesses next (null = that was the last turn). */
  upNext: SeatIndex | null;

  countdown: Timer | null;
  timer: Timer | null;

  /** The card's token, during a turn. Not secret: it only counts deals. */
  cardNo: number | null;
  /** The word — only for seats allowed to see it (see the hidden-info notes in state.ts). */
  cardText: string | null;
  /** This seat may mark the card correct / pass it. */
  canCorrect: boolean;
  canPass: boolean;
  turnCorrect: number;
  turnPassed: number;

  /** Cards left in the deck, and whether the next turn might run out. */
  deckLeft: number;
  lowDeck: boolean;
  /** ready: nothing left in the deck this guesser didn't write. */
  outOfCards: boolean;

  /** turnResults: the turn that just ended, every card with ✓ / ✗. */
  lastTurn: { seat: SeatIndex; round: number; end: TurnEnd; cards: Array<{ text: string; got: boolean }> } | null;

  /** Correct cards per seat, all turns so far (including the turn in progress). */
  scores: number[];

  /** Final screen only. */
  results: {
    turns: Array<{
      seat: SeatIndex;
      round: number;
      cards: Array<{ text: string; got: boolean; author: string | null }>;
    }>;
    bestTurn: { seat: SeatIndex; round: number; got: number } | null;
    ranOut: boolean;
  } | null;
}
