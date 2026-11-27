import type { SeatIndex } from '@/engine/types';
import type { CollectAction } from '@/words/collect';

// Actions with `bySeat` come from a player; seatless ones are host controls
// (online, only the host's device may send them) or the host's scheduler.
// "Drawer or host" actions take an optional `bySeat`: present = the drawer
// sent it, absent = the host did. Every turn action carries `turn` (the
// view's `turnNo`) so a late or doubled one is refused.

export type SketchAction =
  | CollectAction
  /** The drawer (or the host for them) picks word `index` of the three on offer. */
  | { type: 'choose'; bySeat?: SeatIndex; turn: number; index: number }
  /** Scheduler: nobody picked in time — pick one at random. */
  | { type: 'chooseTimeUp'; turn: number }
  /** Typed mode: a guess (or, once you've solved it, a message to the other solvers). */
  | { type: 'guess'; bySeat: SeatIndex; turn: number; text: string }
  /** Spoken mode, drawer or host: `seat` shouted the answer (next in order). */
  | { type: 'award'; bySeat?: SeatIndex; turn: number; seat: SeatIndex }
  /** Spoken mode, drawer or host: take back a tap. */
  | { type: 'unaward'; bySeat?: SeatIndex; turn: number; seat: SeatIndex }
  /** Spoken mode, drawer or host: "Done" / "Nobody got it". */
  | { type: 'endTurn'; bySeat?: SeatIndex; turn: number }
  /** Scheduler: unlock hint `stage` (0 at half time, 1 at three quarters). */
  | { type: 'hint'; turn: number; stage: number }
  /** Scheduler: the drawing clock ran out (after the grace window). */
  | { type: 'timeUp'; turn: number }
  /** Scheduler (reveal over) or host: on to the next turn. */
  | { type: 'next'; turn: number }
  | { type: 'pause' }
  | { type: 'resume' }
  /** Host: skip the drawer while they're choosing, or end the drawing now. */
  | { type: 'skipTurn'; turn: number }
  /** Host: stop now and show the results. */
  | { type: 'finish' };
