// ============================================================================
// Cross-game engine types
//
// Every party game implements the same contract. The host holds the full
// `Private` state (the bowl of slips, who the outsider is, the secret dial
// target, every sketchbook) and produces a per-seat `Public` view for each
// device. Devices only ever receive their own view.
//
// Party games are real-time, so the contract has two additions over a pure
// turn-based engine:
//   - `applyAction` receives the host's clock (`ctx.now`, server-aligned ms),
//     so timers are plain timestamps in state and the engine stays pure;
//   - `nextScheduled` tells the host which seatless action to apply when
//     (a turn timer running out, a hint unlocking). The host's store runs it.
// ============================================================================

export type GameId =
  | 'fishbowl'
  | 'forehead'
  | 'sketch'
  | 'telephone'
  | 'rank-it'
  | 'odd-one-out'
  | 'tune-in'
  | 'slideshow';

/** A device's identity: the anonymous Firebase uid online, '' on this device. */
export type PlayerId = string;

export type SeatIndex = number;

export interface Seat {
  index: SeatIndex;
  /** Online: the occupant's uid. null on a local (single-device) table. */
  uuid: PlayerId | null;
  name: string;
}

// Peers reject stale snapshots with `tick < currentTick`.
export type StateTick = number;

/** `ctx.by` for actions the host's scheduler applies (timers). */
export const SCHEDULER: PlayerId = 'host:scheduler';

export interface ActionContext {
  /** Who sent it: a uid online, '' for this device, SCHEDULER for timers. */
  by: PlayerId;
  /** The host's clock when the action is applied (ms, server-aligned online). */
  now: number;
}

export interface ScheduledAction<Action> {
  /** Host clock (ms) at which to apply `action`. In the past = apply now. */
  at: number;
  /** A seatless action. Include a token (turn number…) so a late one is refused. */
  action: Action;
}

/** A live drawing board in use (Sketch & Guess). Strokes travel outside game state. */
export interface LiveBoard {
  /** Changes whenever the board must be wiped (a new turn). */
  id: string;
  /** The only seat allowed to draw on it. */
  drawerSeat: SeatIndex;
}

// ============================================================================
// Engine contract — implemented per game in `src/games/<id>/`
// ============================================================================

export interface GameModule<Private, Public, Action> {
  readonly id: GameId;
  readonly displayName: string;
  readonly minPlayers: number;
  readonly maxPlayers: number;

  /** Build the initial host state. Pure — no DOM / network / React / Date.now(). */
  createInitialState(config: GameConfig): Private;

  /**
   * Apply an action and return the next state. Throws if the action is
   * illegal (wrong phase, not your turn, stale token, malformed). The host
   * refuses thrown actions, so throwing is the validation mechanism.
   */
  applyAction(state: Private, action: Action, ctx: ActionContext): Private;

  /**
   * Redact the host state into what `seat` may see. CRITICAL: the single
   * chokepoint that keeps hidden information on the host. `seat = null` is
   * a spectator (or a shared TV screen) and must contain nothing secret.
   * Pure function of state: anything time-based is a scheduled action.
   */
  viewFor(state: Private, seat: SeatIndex | null): Public;

  /** True once the match is over (final results showing). */
  isFinished(state: Private): boolean;

  /** Options a new lobby / setup screen starts from. JSON-serialisable. */
  defaultOptions(): Record<string, unknown>;

  /** Why these options can't start with `playerCount` players, or null. */
  optionsProblem?(options: Record<string, unknown>, playerCount: number): string | null;

  /** The next action the host must apply on its own (timer expiry…), if any. */
  nextScheduled?(state: Private): ScheduledAction<Action> | null;

  /** The live drawing board currently in use, if any. */
  liveBoard?(state: Private): LiveBoard | null;
}

// ============================================================================
// Config
// ============================================================================

export interface GameConfig {
  gameId: GameId;
  seats: Seat[];
  /** Host-private. Never in a view, the lobby, or a log. */
  seed: number;
  /** Host clock at match start (ms). */
  now: number;
  /** Per-game options (each module owns the shape). World-readable in the lobby. */
  gameOptions: Record<string, unknown>;
  /**
   * The host's saved word lists referenced by the options (`listIds`),
   * resolved on the host at start. Host-private: never in the lobby, so
   * guests can't read a list before playing with it.
   */
  lists: Record<string, string[]>;
}

// ============================================================================
// Envelopes
// ============================================================================

export interface PublicEnvelope<Public> {
  gameId: GameId;
  tick: StateTick;
  view: Public;
  /** The seat this view was redacted for (null = spectator). */
  seat: SeatIndex | null;
}
