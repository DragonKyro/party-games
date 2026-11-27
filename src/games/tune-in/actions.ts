import type { SeatIndex } from '@/engine/types';
import type { CollectAction } from '@/words/collect';

// Actions with `bySeat` come from a player; seatless ones are host controls
// (online, only the host's device may send them) or the host's scheduler.
// `turn` is the race token: the view's `turnNo`, so an action from a finished
// round is refused.

export type TuneInAction =
  | CollectAction
  /** Tuner: go on air with option `pick` (0 or 1) and this clue. */
  | { type: 'tune'; bySeat: SeatIndex; turn: number; pick: number; clue: string }
  /**
   * Move a needle to `value` (integer 0–100). Everyone mode: your own (needs
   * `bySeat`). Team mode: the shared one (a guesser, or seatless from the
   * host / a single-device table). The UI throttles these to ~6 a second.
   */
  | { type: 'move'; bySeat?: SeatIndex; turn: number; value: number }
  /**
   * Lock it in. Everyone mode: your own needle (needs `bySeat`). Team mode:
   * the shared needle (a guesser or the host). `value`, if given, is set first.
   */
  | { type: 'lock'; bySeat?: SeatIndex; turn: number; value?: number }
  /** Scheduler: the guessing timer ran out. */
  | { type: 'timeUp'; turn: number }
  /** Host: stop guessing now and reveal (needles lock where they are). */
  | { type: 'reveal' }
  /** Host: on from the reveal to the next round (or the results). */
  | { type: 'next' }
  /** Host: skip whoever is tuning (they stepped out). */
  | { type: 'skipTuner' }
  | { type: 'pause' }
  | { type: 'resume' }
  /** Host: stop now and show the results. */
  | { type: 'finish' };
