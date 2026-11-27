import type { RngState } from '@/engine/rng';
import type { Timer } from '@/engine/timer';
import type { SeatIndex } from '@/engine/types';
import type { CollectState, CollectView } from '@/words/collect';
import type { GuessMode, SketchOptions } from './rules';

// ============================================================================
// Sketch & Guess — host state
//
// Every player draws once per round. On your turn you secretly pick one of
// three words, then draw it on the live board while everyone else guesses —
// typed (the host checks each guess) or shouted (the drawer taps who got it).
// The picture itself never enters game state: strokes stream through the
// room's board channel (`liveBoard`).
//
// Hidden information:
//   - the three words offered to the drawer (drawer only);
//   - the word being drawn (the drawer, then each player as they solve it;
//     everyone at the reveal);
//   - correct guesses' text (never in any view — the feed just says
//     "Ana guessed it!");
//   - close guesses and wrong guesses that contain the answer (the guesser
//     only);
//   - messages from players who've solved it (other solvers + the drawer);
//   - who wrote which word, until it's been drawn;
//   - the word deck and the RNG state (never leave the host).
// ============================================================================

export type SketchPhase =
  | 'collect' // players writing words
  | 'choose' // the drawer is picking a word
  | 'drawing' // the clock is running
  | 'reveal' // the answer and the turn's points, then the next turn
  | 'gameOver';

export interface WordEntry {
  text: string;
  /** The seat that wrote it, else null (packs, host lists). */
  author: SeatIndex | null;
  /** Player-written or from a host list — offered before pack words. */
  custom: boolean;
}

export type FeedKind =
  /** A wrong guess, shown to everyone. */
  | 'guess'
  /** Nearly right (or contains the answer) — only the guesser sees it. */
  | 'close'
  /** "Ana guessed it!" — never carries the guess text. */
  | 'solved'
  /** A message from someone who's already solved it. */
  | 'chat';

/** Who may see a feed entry. */
export type FeedVis = 'all' | 'solvers' | 'self';

export interface FeedEntry {
  /** Unique in the turn, numbered per visibility class (so hidden entries leave no gaps in anyone's ids). */
  key: string;
  seat: SeatIndex;
  kind: FeedKind;
  /** '' for 'solved'. */
  text: string;
  /** 'solved' only. */
  points: number | null;
  vis: FeedVis;
}

export interface Solve {
  seat: SeatIndex;
  points: number;
  /** Clock time used when they got it (ms since drawing started). */
  ms: number;
}

export interface TurnRecord {
  turn: number;
  round: number;
  drawer: SeatIndex;
  word: string;
  author: SeatIndex | null;
  solves: Solve[];
  drawerPoints: number;
  /** Ended by the host before time / everyone got it. */
  skipped: boolean;
}

export interface SketchState {
  phase: SketchPhase;
  options: SketchOptions;
  /** The mode actually played (a single-device table forces 'spoken'). */
  guessing: GuessMode;
  localTable: boolean;
  seats: Array<{ index: SeatIndex; name: string }>;
  rng: RngState;

  collect: CollectState | null;

  /** Every word in the match (deduplicated). */
  pool: WordEntry[];
  /** Pool indexes still to offer, in order (custom words first). */
  deck: number[];

  /** Drawing order (seats), the same every round. */
  order: SeatIndex[];
  totalTurns: number;
  /** Index into the whole schedule: round = turnNo / seats, drawer = order[turnNo % seats]. */
  turnNo: number;
  /** Makes board ids unique across matches in the same room (not secret). */
  boardNonce: string;

  // --- current turn ---
  drawer: SeatIndex | null;
  /** Pool indexes offered to the drawer (choose phase). */
  choices: number[];
  /** Pool index being drawn. */
  word: number | null;
  /** The phase clock: choose (online only), drawing, reveal. */
  timer: Timer | null;
  /** Letter positions that hints will reveal, in order. */
  hintOrder: number[];
  hintsShown: number;
  /** The next hint stage to fire (0, 1; 2 = done). */
  hintStage: number;
  solves: Solve[];
  /** This turn's feed (each visibility class capped separately). */
  feed: FeedEntry[];
  /** Entries added this turn per class ('a' public, 'c' solver chat, 's<seat>' private). */
  feedCounts: Record<string, number>;
  /** Rate limit: host clock of each seat's last guess. */
  lastGuessAt: Array<number | null>;

  scores: number[];
  history: TurnRecord[];
}

// ============================================================================
// Public view
// ============================================================================

export interface FeedView {
  key: string;
  seat: SeatIndex;
  kind: FeedKind;
  /** null for 'solved'. */
  text: string | null;
  points: number | null;
  /** Restricted entries say so ("only you can see this"). */
  only: 'you' | 'solvers' | null;
}

export interface RevealView {
  drawer: SeatIndex;
  word: string;
  /** Who wrote it, if a player did. */
  author: SeatIndex | null;
  solves: Array<{ seat: SeatIndex; points: number }>;
  drawerPoints: number;
  skipped: boolean;
}

export interface SketchResults {
  fastest: { seat: SeatIndex; ms: number; word: string } | null;
  bestArtist: { seat: SeatIndex; points: number } | null;
  sharpest: { seat: SeatIndex; firsts: number } | null;
  /** Per seat: points as drawer, and words guessed. */
  drawn: number[];
  guessed: number[];
  turns: Array<{ drawer: SeatIndex; word: string; author: SeatIndex | null; solvers: number; of: number }>;
}

export interface SketchView {
  phase: SketchPhase;
  seats: Array<{ index: SeatIndex; name: string }>;
  collect: CollectView | null;

  guessing: GuessMode;
  hints: boolean;
  turnSeconds: number;
  round: number;
  rounds: number;
  /** Changes every turn (UIs key pass-the-phone screens on it). Also the action token. */
  turnNo: number;
  totalTurns: number;

  drawer: SeatIndex | null;
  /** The live board for this turn (choose → reveal), null otherwise. */
  boardId: string | null;
  timer: Timer | null;

  /** The words on offer — ONLY in the drawer's view, while choosing. */
  choices: string[] | null;
  /** The word — the drawer's and solvers' views while drawing; everyone's at the reveal. */
  word: string | null;
  /** The blanks (with any revealed letters), for those who don't know the word. */
  hint: string[] | null;

  /** Who's got it this turn, in order. */
  solves: Array<{ seat: SeatIndex; points: number }>;
  youSolved: boolean;
  /** Typed mode: this seat may type (guesses, or solver chat once solved). */
  canType: boolean;
  feed: FeedView[];

  /** Running totals (including this turn's points so far). */
  scores: number[];
  /** This turn's points per seat (drawer included). */
  gains: number[];

  reveal: RevealView | null;
  results: SketchResults | null;
}
