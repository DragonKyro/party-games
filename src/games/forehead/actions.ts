import type { SeatIndex } from '@/engine/types';
import type { CollectAction } from '@/words/collect';

// Actions with `bySeat` come from a player; seatless ones are host controls
// (online, only the host's device may send them) or the host's scheduler.
// "Host or guesser" actions accept either: seatless from the host, or with
// `bySeat` equal to the guesser.

export type ForeheadAction =
  | CollectAction
  /** The guesser (or the host for them) starts the 3-2-1. `turn` = view.turnNo. */
  | { type: 'start'; bySeat?: SeatIndex; turn: number }
  /** Scheduler: the 3-2-1 is over, deal the first card. */
  | { type: 'go'; turn: number }
  /** Got it. `card` is the card's token (view.cardNo), so two taps on one card count once. */
  | { type: 'correct'; bySeat: SeatIndex; card: number }
  /** Pass on the card. */
  | { type: 'pass'; bySeat: SeatIndex; card: number }
  /** Scheduler: the turn clock ran out. */
  | { type: 'timeUp'; turn: number }
  /** turnResults → the next guesser (host or the guesser who just played). */
  | { type: 'next'; bySeat?: SeatIndex; turn: number }
  /** Host or guesser. */
  | { type: 'pause'; bySeat?: SeatIndex }
  | { type: 'resume'; bySeat?: SeatIndex }
  /** Host or guesser: end the turn now (during the 3-2-1: cancel back to ready). */
  | { type: 'stopTurn'; bySeat?: SeatIndex }
  /** Host: skip whoever's up (they stepped out). */
  | { type: 'skipPlayer' }
  /** Host: stop now and show the results. */
  | { type: 'finish' };
