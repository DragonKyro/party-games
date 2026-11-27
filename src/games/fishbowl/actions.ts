import type { TeamsAction } from '@/engine/teams';
import type { SeatIndex } from '@/engine/types';
import type { CollectAction } from '@/words/collect';

// Actions with `bySeat` come from a player; seatless ones are host controls
// (online, only the host's device may send them) or the host's scheduler.

export type FishbowlAction =
  | CollectAction
  | TeamsAction
  /** Host: teams are set, show round 1. */
  | { type: 'begin' }
  /** Host: close the round card and go to the first turn of the round. */
  | { type: 'playRound' }
  /** The clue-giver (or the host for them) starts the clock. */
  | { type: 'startTurn'; bySeat?: SeatIndex }
  /** Clue-giver: the team guessed `slip`. */
  | { type: 'gotIt'; bySeat: SeatIndex; slip: number }
  /** Clue-giver: back into the bowl. */
  | { type: 'skip'; bySeat: SeatIndex; slip: number }
  /** Clue-giver: that last "got it" was a mistake — back into the bowl. */
  | { type: 'undo'; bySeat: SeatIndex; slip: number }
  /** Scheduler: the turn timer ran out. `turn` guards against a stale timer. */
  | { type: 'timeUp'; turn: number }
  | { type: 'pause' }
  | { type: 'resume' }
  /** Host: skip whoever's up (they stepped out). */
  | { type: 'skipPlayer' }
  /** Host: stop now and show the results. */
  | { type: 'finish' };
