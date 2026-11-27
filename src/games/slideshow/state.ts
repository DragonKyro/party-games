import type { RngState } from '@/engine/rng';
import type { Timer } from '@/engine/timer';
import type { SeatIndex } from '@/engine/types';
import type { CollectState, CollectView } from '@/words/collect';
import type { SlideSpec } from './deck';
import type { RatingMode, SlideshowOptions } from './rules';

// ============================================================================
// Slideshow Karaoke — host state
//
// Players take turns presenting a talk they have never seen: a title built
// from a topic, then a random (but coherent) slide deck, one slide at a time.
// The audience rates each talk 1–5 stars.
//
// Hidden information:
//   - the deck: every slide after the one on screen (nobody — presenter
//     included — sees what's coming);
//   - the wildcard twist and the slide it lands on, until it lands;
//   - the Q&A questions, until the talk ends;
//   - individual ratings, until everyone has voted / time runs out (and who
//     gave what, forever: the reveal shows only the average and a histogram);
//   - player-written topics, until each one is used (and who wrote it, until
//     the final screen);
//   - the RNG state and the deck seed.
// ============================================================================

export type SlideshowPhase =
  | 'collect' // players writing topics
  | 'intro' // presenter announced, talk title revealed
  | 'talk' // slides, one at a time
  | 'qa' // audience questions after the last slide
  | 'rating' // the audience rates the talk
  | 'reveal' // the average + label
  | 'gameOver';

export interface TopicEntry {
  text: string;
  /** The seat that wrote it, else null (packs / host lists). */
  author: SeatIndex | null;
}

export interface CurrentTalk {
  presenter: SeatIndex;
  topic: string;
  topicAuthor: SeatIndex | null;
  /** The whole deck — host-only; views get `deck[index]`. */
  deck: SlideSpec[];
  index: number;
  slideTimer: Timer | null;
  talkTimer: Timer | null;
  /** Slide the twist lands on (null = no twist this talk). */
  twistAt: number | null;
  twist: string | null;
  twistShown: boolean;
  /** Audience questions for the Q&A (empty when Q&A is off). */
  questions: string[];
  startedAt: number | null;
  endedAt: number | null;
  /** Times the presenter went back a slide. */
  backs: number;
  /** The overall talk timer ran out before the last slide. */
  timedOut: boolean;
}

export interface TalkRecord {
  presenter: SeatIndex;
  title: string;
  topic: string;
  topicAuthor: SeatIndex | null;
  /** Star votes, sorted — anonymous by construction. */
  votes: number[];
  /** Applause-meter reading (single device), else null. */
  crowd: number | null;
  average: number | null;
  twist: string | null;
  durationMs: number;
  backs: number;
  timedOut: boolean;
}

export interface SlideshowState {
  phase: SlideshowPhase;
  options: SlideshowOptions;
  seats: Array<{ index: SeatIndex; name: string }>;
  ratingMode: RatingMode;
  rng: RngState;
  /** Per-talk decks derive from this (host-private). */
  deckSeed: number;

  collect: CollectState | null;
  /** Topic candidates: every player-written entry, plus a sample of packs / lists. */
  pool: TopicEntry[];
  /** entryKeys of topics already used. */
  used: string[];

  /** Presenter for each talk, in order. */
  order: SeatIndex[];
  talkNo: number;
  talk: CurrentTalk | null;
  paused: boolean;

  /** ratings[seat] while rating (null = not yet). */
  ratings: Array<number | null>;
  crowd: number | null;
  rateTimer: Timer | null;

  history: TalkRecord[];
}

// ============================================================================
// Public view
// ============================================================================

export interface RatingView {
  timer: Timer | null;
  /** Seats who rate this talk (everyone but the presenter). */
  audience: SeatIndex[];
  /** voted[seat] for every seat. */
  voted: boolean[];
  /** This seat's own rating so far (null = not voted / not voting). */
  yours: number | null;
}

export interface RevealView {
  presenter: SeatIndex;
  title: string;
  average: number | null;
  votes: number;
  /** histogram[stars - 1] = how many gave that many stars. */
  histogram: number[];
  label: string;
  /** Rated by applause meter. */
  crowd: boolean;
}

export interface Standing {
  seat: SeatIndex;
  talks: number;
  average: number | null;
}

export interface Award {
  emoji: string;
  title: string;
  seat: SeatIndex;
  detail: string;
}

export interface SlideshowView {
  phase: SlideshowPhase;
  seats: Array<{ index: SeatIndex; name: string }>;
  collect: CollectView | null;
  ratingMode: RatingMode;

  talkNo: number;
  talkCount: number;
  presenter: SeatIndex | null;
  /** Who presents after this talk (null = last). */
  nextPresenter: SeatIndex | null;
  /** The talk's title — public from the intro on. */
  talkTitle: string | null;

  /** ONLY the slide on screen (talk phase). Never any later slide. */
  slide: SlideSpec | null;
  slideIndex: number;
  slideCount: number;
  slideTimer: Timer | null;
  talkTimer: Timer | null;
  paused: boolean;
  autoAdvance: number;
  twistsOn: boolean;
  qaOn: boolean;
  /** The wildcard, once it has landed (this talk). */
  twist: string | null;
  /** Q&A phase only. */
  questions: string[];

  rating: RatingView | null;
  /** Reveal phase: the talk that was just rated. */
  reveal: RevealView | null;
  /** Running averages (public: every reveal is). */
  standings: Standing[];

  /** Final screen only. */
  results: {
    talks: Array<{
      presenter: SeatIndex;
      title: string;
      topic: string;
      topicBy: string | null;
      average: number | null;
      votes: number;
    }>;
    awards: Award[];
  } | null;
}
