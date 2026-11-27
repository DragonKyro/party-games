import type { RngState } from '@/engine/rng';
import type { Timer } from '@/engine/timer';
import type { SeatIndex } from '@/engine/types';
import type { CollectState, CollectView } from '@/words/collect';
import type { Format, OddOneOutOptions, VoteMode } from './rules';

// ============================================================================
// Odd One Out — host state
//
// Everyone sees the same board of words. All but the outsider(s) also know
// which word is the secret. Players give one-word clues (or question each
// other), then vote on who the outsider is. A caught outsider gets one last
// guess at the word; any outsider can also gamble on an early guess.
//
// Hidden information:
//   - each seat's role (a seat sees only its own);
//   - the secret word (insiders only, until the reveal);
//   - who the outsiders are (until the reveal — or, for the accused, the
//     moment a vote lands on an outsider and they get their last chance);
//   - who voted for whom (only who HAS voted, until the reveal);
//   - the word groups / host lists, the words players wrote, past-secret
//     bookkeeping and the RNG (never in a view).
// ============================================================================

export type OddOneOutPhase =
  | 'collect' // players writing words for the board
  | 'peek' // roles dealt; everyone looks, then taps "Got it"
  | 'clues' // one word each, in turn order
  | 'discuss' // after the clues (optionally timed)
  | 'talk' // questions format: the free-talk timer
  | 'vote' // simultaneous secret vote
  | 'lastChance' // the accused outsider picks a word
  | 'reveal' // the round's result
  | 'gameOver';

export type Role = 'insider' | 'outsider';

/** A word group a board is drawn from. Host-private (lists stay hidden until used). */
export interface WordGroup {
  name: string;
  emoji: string;
  words: string[];
}

export interface Category {
  name: string;
  emoji: string;
}

export interface Clue {
  seat: SeatIndex;
  /** Typed clue; null = said aloud (single device) or skipped. */
  text: string | null;
  skipped: boolean;
}

export type Winner = 'outsiders' | 'insiders';

/**
 * How a round ended.
 *   tie         — the vote tied (or nobody voted): nobody caught
 *   innocent    — the vote landed on an insider
 *   caught      — the vote landed on an outsider who then missed the word (or gave up)
 *   stolen      — the vote landed on an outsider who then named the word
 *   early-right — an outsider guessed the word before the vote
 *   early-wrong — an outsider guessed before the vote, and missed
 */
export type Outcome = 'tie' | 'innocent' | 'caught' | 'stolen' | 'early-right' | 'early-wrong';

export interface RoundGuess {
  seat: SeatIndex;
  /** Board index guessed; null = gave up. */
  word: number | null;
  correct: boolean;
  early: boolean;
}

export interface RoundResult {
  round: number;
  category: Category;
  board: string[];
  secretIndex: number;
  secret: string;
  outsiders: SeatIndex[];
  votes: Array<SeatIndex | null>;
  tally: number[];
  accused: SeatIndex | null;
  /** Single-device open vote: no ballots, the table tapped the accused. */
  openVote: boolean;
  guess: RoundGuess | null;
  winner: Winner;
  outcome: Outcome;
  /** Points scored this round, per seat. */
  points: number[];
}

export interface OddOneOutState {
  phase: OddOneOutPhase;
  options: OddOneOutOptions;
  seats: Array<{ index: SeatIndex; name: string }>;
  rng: RngState;

  collect: CollectState | null;
  /** Packs and host lists, one group each (small lists merged). */
  groups: WordGroup[];
  /** Words the players wrote (deduped). null when players don't write. */
  ourWords: string[] | null;
  /** Group indices left in the current shuffled cycle. */
  groupDeck: number[];
  /** The group the last board came from (no repeat across a reshuffle). */
  lastGroup: number | null;
  /** entryKeys of past secrets (kept off later boards where possible). */
  usedSecrets: string[];

  /** 0-based. */
  round: number;
  category: Category | null;
  board: string[];
  secretIndex: number;
  outsiders: SeatIndex[];
  peeked: boolean[];

  /** Clues: everyone, in a random order. */
  clueOrder: SeatIndex[];
  /** Index into clueOrder of whoever is giving a clue now. */
  clueTurn: number;
  clues: Clue[];
  /** Questions: who asks the first question. */
  firstAsker: SeatIndex;
  timer: Timer | null;

  votes: Array<SeatIndex | null>;
  /** Host clock when the vote opened (early-guess grace window). */
  voteOpenedAt: number | null;
  /** Set once the vote closes. */
  tally: number[] | null;
  accused: SeatIndex | null;
  /** The accused was tapped in on a single device (no ballots). */
  openVote: boolean;

  /** The current round's result (reveal), also appended to history. */
  result: RoundResult | null;
  scores: number[];
  history: RoundResult[];
}

// ============================================================================
// Public view
// ============================================================================

export interface OddOneOutView {
  phase: OddOneOutPhase;
  seats: Array<{ index: SeatIndex; name: string }>;
  collect: CollectView | null;

  /** 0-based. */
  round: number;
  rounds: number;
  format: Format;
  voting: VoteMode;
  outsiderCount: number;
  boardSize: number;
  discussSeconds: number;

  category: Category | null;
  board: string[];
  /** This seat's own role (playing phases only). null for spectators. */
  you: { role: Role } | null;
  /** The secret's board index: insiders only, then everyone from the reveal. */
  secretIndex: number | null;

  peeked: boolean[];

  clueOrder: SeatIndex[];
  clueTurn: number;
  /** Whose clue it is (clues phase), else null. */
  clueGiver: SeatIndex | null;
  clues: Clue[];
  firstAsker: SeatIndex | null;
  timer: Timer | null;

  /** Who has voted (vote phase). Never who for. */
  voted: boolean[];
  /** This seat's own ballot (vote phase). */
  yourVote: SeatIndex | null;

  /** Public once the vote closes (lastChance + reveal). */
  tally: number[] | null;
  accused: SeatIndex | null;
  openVote: boolean;

  /** Everything about the round — reveal only. */
  result: RoundResult | null;
  scores: number[];
  /** Finished rounds (each public from its reveal on). */
  history: RoundResult[];
}
