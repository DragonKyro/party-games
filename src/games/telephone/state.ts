import type { RngState } from '@/engine/rng';
import type { Timer } from '@/engine/timer';
import type { SeatIndex } from '@/engine/types';
import type { CollectState, CollectView } from '@/words/collect';
import type { StepKind, TelephoneOptions } from './rules';

// ============================================================================
// Doodle Telephone — host state
//
// Every player owns a sketchbook. Page 0 is a prompt (written, or picked
// from three dealt options). Then the books pass around the table — book b
// at step s is held by seat (b + s) % n — and everyone works at once:
// odd steps draw the page before, even steps guess what the drawing shows.
// At the end the books are revealed page by page, and players heart their
// favourite pages.
//
// Hidden information:
//   - every page of every book until the reveal; during a step a seat sees
//     ONLY the page before the one it must add, in the book it holds;
//   - the prompt options dealt to each player (only the chooser sees them);
//   - player-written prompts (until revealed);
//   - during the reveal, pages past the shared cursor;
//   - the RNG state.
// ============================================================================

export type TelephonePhase =
  | 'prompt' // step 0: write or pick a prompt
  | 'step' // everyone draws / guesses on the book they hold
  | 'reveal' // presenter mode, book by book
  | 'gameOver';

interface PageBase {
  /** Who made it. */
  by: SeatIndex;
  /** Filled in for a player who ran out of time (blank page / "(no guess)"). */
  missed: boolean;
  /** Seats that hearted it (in tap order). */
  hearts: SeatIndex[];
}

export type Page =
  | (PageBase & { kind: 'prompt'; text: string; /** The owner wrote it (else picked / dealt). */ written: boolean })
  | (PageBase & { kind: 'guess'; text: string })
  | (PageBase & { kind: 'draw'; /** Encoded (`encodeDrawing`). */ drawing: string });

export interface Book {
  owner: SeatIndex;
  /** pages[s] is step s. All books advance in lockstep. */
  pages: Page[];
}

export interface TelephoneState {
  phase: TelephonePhase;
  options: TelephoneOptions;
  seats: Array<{ index: SeatIndex; name: string }>;
  rng: RngState;
  /** One device passed around: no shared step clock (each player gets their own). */
  local: boolean;
  /** Steps after the prompt (always even — books end on a guess). */
  totalSteps: number;

  // --- step 0 ---
  promptMode: 'write' | 'choose';
  /** Write mode: the shared collect phase (one prompt each). */
  collect: CollectState | null;
  /**
   * Each seat's dealt options (shown only in choose mode; in write mode the
   * first one stands in for anyone who doesn't write a prompt).
   */
  choices: string[][];
  /** Choose mode: each seat's pick (index into its choices). */
  picks: Array<number | null>;

  books: Book[];
  /** Current step (1…totalSteps) while phase === 'step'. */
  stepIndex: number;
  /** The shared step clock (null when untimed / on one device). */
  timer: Timer | null;
  /** The host hurried this step along. */
  hurried: boolean;

  /** Reveal cursor: which book, and how many of its pages are showing. */
  reveal: { book: number; shown: number } | null;
  /** Final screen: the book each seat has open in the replay list. */
  browse: Array<number | null>;
  /** …and the one a seatless screen (single device / TV) has open. */
  browseShared: number | null;
}

// ============================================================================
// Public view
// ============================================================================

/** A page as a view carries it (drawings only where the rules allow). */
export type PageView =
  | { kind: 'prompt'; by: SeatIndex; text: string; written: boolean }
  | { kind: 'guess'; by: SeatIndex; text: string; missed: boolean }
  | {
      kind: 'draw';
      by: SeatIndex;
      /** null: left out to keep the view small (an older page of a very detailed book). */
      drawing: string | null;
      missed: boolean;
    };

/** A page in the end-of-game list of books: text only (drawings have `text: null`). */
export interface SummaryPage {
  kind: Page['kind'];
  by: SeatIndex;
  text: string | null;
  missed: boolean;
  hearts: number;
}

export interface RevealPage {
  index: number;
  page: PageView;
  hearts: number;
  /** Who hearted it (public — hearts aren't secret). */
  heartedBy: SeatIndex[];
  /** This seat hearted it. */
  yours: boolean;
  /** This seat may heart it (not their own, not a missed page, not a dealt prompt). */
  heartable: boolean;
}

export interface TelephoneView {
  phase: TelephonePhase;
  seats: Array<{ index: SeatIndex; name: string }>;
  totalSteps: number;
  promptMode: 'write' | 'choose';
  timed: boolean;
  /** No shared clock: on one device each player times their own turn. */
  local: boolean;
  drawSeconds: number;
  guessSeconds: number;

  /** Current step (0 = the prompt) and what it asks for. */
  stepIndex: number;
  stepKind: StepKind | null;
  timer: Timer | null;
  hurried: boolean;

  /** Who has finished the current step (prompt or page). Progress only — no content. */
  done: boolean[];
  doneCount: number;
  /** This seat has finished the current step. */
  youDone: boolean;

  /** Write mode, step 0: the collect phase (your own prompt only). */
  collect: CollectView | null;
  /** Choose mode, step 0: YOUR dealt prompts (null for everyone else). */
  choices: string[] | null;
  picked: number | null;

  /**
   * During a step, ONLY for the seat that holds it and hasn't submitted:
   * the book in hand and its previous page — nothing else from any book.
   */
  held: {
    book: number;
    owner: SeatIndex;
    step: number;
    /** What you must add. */
    kind: StepKind;
    previous: PageView;
  } | null;

  /** Presenter mode: the current book, pages up to the shared cursor only. */
  reveal: {
    book: number;
    owner: SeatIndex;
    bookCount: number;
    shown: number;
    total: number;
    pages: RevealPage[];
  } | null;

  /** Final screen only. */
  results: {
    /** Hearts received per seat. */
    hearts: number[];
    /** Hearts received per seat, split by drawings / guesses (prompts count as guesses). */
    drawHearts: number[];
    /** The most-hearted page, with the page before it for context. */
    favourite: { book: number; owner: SeatIndex; index: number; page: PageView; hearts: number; before: PageView | null } | null;
    /** Every book as text: drawings are omitted (`text: null`), only who drew them. */
    books: Array<{ owner: SeatIndex; pages: SummaryPage[] }>;
    /** The book this screen has open, in full (one book's drawings at most). */
    open: { book: number; pages: Array<PageView & { hearts: number }> } | null;
  } | null;
}
