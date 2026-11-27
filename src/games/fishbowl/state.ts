import type { RngState } from '@/engine/rng';
import type { Teams } from '@/engine/teams';
import type { Timer } from '@/engine/timer';
import type { SeatIndex } from '@/engine/types';
import type { CollectState, CollectView } from '@/words/collect';
import type { FishbowlOptions, RoundKind } from './rules';

// ============================================================================
// Fishbowl — host state
//
// Everyone drops slips into one bowl; two (or more) teams race through the
// SAME slips in successive rounds with harder rules (describe → one word →
// act it out). On your turn you pull slips one at a time and your team
// shouts guesses until the timer runs out.
//
// Hidden information:
//   - the slip in the clue-giver's hand (only the clue-giver sees it);
//   - what's left in the bowl (everyone sees only the count);
//   - who wrote what (collected slips are anonymous until the final screen);
//   - the RNG state (bowl order).
// ============================================================================

export type FishbowlPhase =
  | 'collect' // players writing slips
  | 'teams' // picking teams
  | 'intro' // a round's rules card, before its first turn
  | 'ready' // next clue-giver up; timer not running yet
  | 'turn' // timer running, clue-giver pulling slips
  | 'gameOver';

export interface Slip {
  id: number;
  text: string;
  author: SeatIndex | null;
}

export interface TurnRecord {
  seat: SeatIndex;
  team: number;
  round: number;
  /** Slip ids guessed, in order. */
  got: number[];
  skipped: number;
}

export interface FishbowlState {
  phase: FishbowlPhase;
  options: FishbowlOptions;
  seats: Array<{ index: SeatIndex; name: string }>;
  rng: RngState;

  collect: CollectState | null;
  /** The pool used to top up collected slips (host lists + packs), built at start. */
  topUp: Array<{ text: string; author: SeatIndex | null }>;

  teams: Teams;
  /** Which team took the first turn. */
  firstTeam: number;

  slips: Slip[];
  /** Slip ids still in the bowl this round, in draw order. */
  bowl: number[];

  /** Index into options.rounds. */
  roundIndex: number;
  /** Turns completed so far (drives team / clue-giver rotation). */
  turnNo: number;
  /** Leftover time the current clue-giver brings into this round, if any. */
  carryMs: number | null;

  // --- current turn ---
  timer: Timer | null;
  current: number | null;
  turnGot: number[];
  turnSkips: number;

  /** scores[round][team]. */
  scores: number[][];
  history: TurnRecord[];
}

// ============================================================================
// Public view
// ============================================================================

export interface FishbowlView {
  phase: FishbowlPhase;
  seats: Array<{ index: SeatIndex; name: string }>;
  teams: Teams;
  collect: CollectView | null;

  rounds: RoundKind[];
  roundIndex: number;
  /** Turns completed so far (changes every turn; UIs key pass-the-phone screens on it). */
  turnNo: number;
  bowlCount: number;
  totalSlips: number;
  turnSeconds: number;
  skipRule: FishbowlOptions['skipRule'];

  /** Who's up (ready) or playing (turn). */
  clueGiver: SeatIndex | null;
  clueTeam: number | null;
  /** Ready: how long the coming turn will be, and whether it's carried-over time. */
  upcomingMs: number;
  carried: boolean;

  timer: Timer | null;
  turnGotCount: number;
  skipsLeft: number | null;
  /** The slip in hand — ONLY in the clue-giver's own view, during their turn. */
  yourSlip: { id: number; text: string } | null;
  /** The clue-giver's own guessed slips this turn (for the undo button). */
  yourTurnGot: Array<{ id: number; text: string }>;

  /** The previous turn, public once it's over: what was guessed (everyone heard it). */
  lastTurn: { seat: SeatIndex; team: number; got: string[]; skipped: number } | null;

  /** Totals per team, and per round. */
  totals: number[];
  scores: number[][];

  /** Final screen only. */
  results: {
    slips: Array<{ text: string; author: string | null }>;
    bestClueGiver: { seat: SeatIndex; got: number } | null;
    perSeat: number[];
  } | null;
}
