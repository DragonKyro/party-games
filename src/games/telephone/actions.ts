import type { SeatIndex } from '@/engine/types';
import type { CollectAction } from '@/words/collect';

// Actions with `bySeat` come from a player; seatless ones are host controls
// (online, only the host's device may send them) or the host's scheduler.
// `step` / `book` / `shown` are tokens: a duplicate or late action is refused.

export type TelephoneAction =
  /** Write mode, step 0 (`collect.close` = the host stops waiting). */
  | CollectAction
  /** Choose mode, step 0: pick one of your dealt prompts (changeable until everyone has). */
  | { type: 'pick'; bySeat: SeatIndex; choice: number }
  /** Your page for the book you hold: a drawing (`encodeDrawing` string)… */
  | { type: 'draw'; bySeat: SeatIndex; step: number; drawing: string }
  /** …or a guess at the drawing in front of you. */
  | { type: 'guess'; bySeat: SeatIndex; step: number; text: string }
  /** Scheduler: the step clock (plus grace) ran out — fill the gaps and move on. */
  | { type: 'timeUp'; step: number }
  /** Host: give everyone 10 more seconds, then the buzzer. */
  | { type: 'hurry'; step: number }
  /** Host: move on now (step 0 = stop waiting for prompts). Missing pages are filled in. */
  | { type: 'advance'; step: number }
  /** The book's owner (or the host) turns the next page. `shown` = pages showing now. */
  | { type: 'revealNext'; bySeat?: SeatIndex; book: number; shown: number }
  /** The book's owner (or the host): on to the next book (or the results after the last). */
  | { type: 'nextBook'; bySeat?: SeatIndex; book: number }
  /** Heart (or un-heart) a revealed page of the current book. */
  | { type: 'heart'; bySeat: SeatIndex; book: number; page: number; on: boolean }
  /** Final screen: open a book in the replay list (null = close). Seatless = the shared screen. */
  | { type: 'browse'; bySeat?: SeatIndex; book: number | null }
  /** Host: stop passing and reveal now (during steps), or skip to the results. */
  | { type: 'finish' };
