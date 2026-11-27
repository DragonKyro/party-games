import type { SeatIndex } from '@/engine/types';
import type { CollectAction } from '@/words/collect';

// Actions with `bySeat` come from a player; seatless ones are host controls
// (online, only the host's device may send them) or the host's scheduler.
// The presenter's controls take an optional `bySeat`: the presenter's own
// phone sends it, the host's screen (the shared laptop / TV) leaves it off.
// Every action carries a token (`talk`, `slide`) so a double tap or a stale
// timer is refused.

export type SlideshowAction =
  | CollectAction
  /** Presenter (or host): close the intro and show the first slide. */
  | { type: 'startTalk'; bySeat?: SeatIndex; talk: number }
  /** Presenter (or host): next slide. On the last slide, ends the talk. `slide` = the slide on screen. */
  | { type: 'next'; bySeat?: SeatIndex; slide: number }
  /** Presenter (or host): previous slide. */
  | { type: 'back'; bySeat?: SeatIndex; slide: number }
  /** Scheduler: auto-advance timer ran out on `slide`. */
  | { type: 'autoNext'; talk: number; slide: number }
  /** Scheduler: the overall talk timer ran out. */
  | { type: 'talkTimeUp'; talk: number }
  /** Presenter (or host): Q&A done, on to the rating. */
  | { type: 'endQA'; bySeat?: SeatIndex; talk: number }
  /** Audience member: 1–5 stars (may change it until the reveal). */
  | { type: 'rate'; bySeat: SeatIndex; talk: number; stars: number }
  /** Host (single device, applause meter): the crowd's rating. */
  | { type: 'applause'; talk: number; stars: number }
  /** Scheduler: rating time is up. */
  | { type: 'rateTimeUp'; talk: number }
  /** Host: stop waiting for votes. */
  | { type: 'revealNow'; talk: number }
  /** Host: on to the next presenter (or the results). */
  | { type: 'nextTalk'; talk: number }
  /** Host: skip this presenter (they stepped out). */
  | { type: 'skipPresenter'; talk: number }
  | { type: 'pause' }
  | { type: 'resume' }
  /** Host: stop now and show the results. */
  | { type: 'finish' };
