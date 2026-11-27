import type { SeatIndex } from '@/engine/types';
import type { CollectAction } from '@/words/collect';

// Actions with `bySeat` come from a player; seatless ones are host controls
// (online, only the host's device may send them) or the host's scheduler.
// Round-scoped actions carry `round` so a duplicate or late one is refused.

export type RankItAction =
  | CollectAction
  /** Chooser: play the offered criterion `option` (0-based). */
  | { type: 'choose'; bySeat: SeatIndex; round: number; option: number }
  /** Chooser: play their own criterion instead (≤ 60 chars). */
  | { type: 'writeOwn'; bySeat: SeatIndex; round: number; text: string }
  /** Lock in an order: item indices (into this round's items), MOST first. Re-sending replaces it. */
  | { type: 'submit'; bySeat: SeatIndex; round: number; order: number[] }
  /** Host: stop waiting and reveal now (missing rankings score 0). */
  | { type: 'reveal'; round: number }
  /** Scheduler: the ranking clock ran out. */
  | { type: 'timeUp'; round: number }
  /** Host: from the reveal on to the next round. */
  | { type: 'next'; round: number }
  /** Host: void this round (an absent Ranker) and move on. */
  | { type: 'skipRound'; round: number }
  | { type: 'pause' }
  | { type: 'resume' }
  /** Host: stop now and show the results. */
  | { type: 'finish' };
