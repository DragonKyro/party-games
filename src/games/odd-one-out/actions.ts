import type { SeatIndex } from '@/engine/types';
import type { CollectAction } from '@/words/collect';

// Actions with `bySeat` come from a player; seatless ones are host controls
// (online, only the host's device may send them) or the host's scheduler.
// `round` (and `turn` for clues) are tokens: a late or doubled action from
// an earlier moment is refused.

export type OddOneOutAction =
  | CollectAction
  /** A player has looked at their role. */
  | { type: 'peeked'; bySeat: SeatIndex; round: number }
  /** Host: stop waiting for stragglers and start the round. */
  | { type: 'startPlay'; round: number }
  /** The clue-giver's ONE word; `text: null` = said out loud (single device). */
  | { type: 'clue'; bySeat: SeatIndex; round: number; turn: number; text: string | null }
  /** Host: skip whoever's giving a clue. */
  | { type: 'skipClue'; round: number; turn: number }
  /** Host: end the discussion / free talk (or the clues) and vote now. */
  | { type: 'callVote'; round: number }
  /** Scheduler: the discussion / talk timer ran out. */
  | { type: 'timeUp'; round: number }
  | { type: 'pause' }
  | { type: 'resume' }
  /** A secret ballot: who you think is the outsider (never yourself). */
  | { type: 'vote'; bySeat: SeatIndex; round: number; target: SeatIndex }
  /** Host: count the votes that are in. */
  | { type: 'closeVote'; round: number }
  /** Host, single-device "open vote": the table pointed, this is who they accused (null = a tie). */
  | { type: 'accuse'; round: number; seat: SeatIndex | null }
  /**
   * An outsider names the secret (a board index): early (before the vote)
   * or as the accused's last chance.
   */
  | { type: 'guess'; bySeat: SeatIndex; round: number; word: number }
  /** The accused outsider (or the host for them) passes on the last chance. */
  | { type: 'giveUp'; bySeat?: SeatIndex; round: number }
  /** Host: next round (or the final scores after the last). */
  | { type: 'nextRound'; round: number }
  /** Host: stop now and show the final scores. */
  | { type: 'finish' };
