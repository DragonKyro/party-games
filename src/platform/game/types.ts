import type { ComponentType } from 'react';
import type { GameSettingsBlob, Seat } from '@/platform/net/types';

export type { GameSettingsBlob, Seat };

// Context passed to the reducer. Read-only — the reducer must remain pure.
// `now` is the host's wall clock at action time; the host stamps actions
// before broadcasting so every peer reduces with the same timestamp.
export interface ActionContext {
  now: number;
  // Caller of the action (uuid of the peer that originated it). The reducer
  // can use this to attribute the move to a seat.
  byUuid: string;
  // Stable list of seats at game-start, in seating order.
  seats: Seat[];
}

// Optional return shape when the reducer needs to emit private payloads
// alongside a state change (Spyfall role reveal, Fishbowl prompt deal, etc).
// Only the host inspects `privates`; the platform routes each entry to its
// `target` via the private channel.
export interface ReduceResult<S> {
  state: S;
  privates?: Array<{ target: string; payload: unknown }>;
}

export type ReducerReturn<S> = S | ReduceResult<S>;

// Lobby-side settings panel — rendered next to the seat list. The active
// module owns the schema; the panel reads/writes `settings` directly.
export interface SettingsPanelProps<Settings> {
  settings: Settings;
  // Host-only edit. The host broadcasts the lobby state on change; guests
  // receive read-only props (`disabled` true) so they can preview but not
  // edit.
  onChange: (next: Settings) => void;
  disabled: boolean;
}

export interface GameManifest<Settings = GameSettingsBlob> {
  id: string;
  name: string;
  // Short one-liner shown in the game picker.
  tagline: string;
  players: { min: number; max: number };
  defaultSettings: Settings;
  SettingsPanel: ComponentType<SettingsPanelProps<Settings>>;
  // Optional inline SVG / emoji shown on the picker tile.
  icon?: string;
}

// The unified module contract. Each game in `src/games/<id>/` exports one of
// these from its `index.ts`.
export interface GameModule<
  State = unknown,
  Action = unknown,
  Settings extends GameSettingsBlob = GameSettingsBlob,
> {
  manifest: GameManifest<Settings>;

  createInitialState(input: {
    seats: Seat[];
    settings: Settings;
    seed: number;
  }): ReducerReturn<State>;

  // Pure reducer. Throws on invalid actions — the host validates before
  // broadcasting, and guests reduce identically. If the result includes
  // `privates`, the host emits them after broadcasting the public action.
  applyAction(state: State, action: Action, ctx: ActionContext): ReducerReturn<State>;

  // Whether the room should treat the game as over (returns to lobby on
  // host's signal).
  isComplete(state: State): boolean;

  // Active-game React surface. Reads `state` from the `gameStore` and
  // dispatches via the same store; the platform provides both.
  GameScreen: ComponentType;
}

// Helper for modules to normalize their reducer return.
export function unpackReduce<S>(ret: ReducerReturn<S>): ReduceResult<S> {
  if (ret && typeof ret === 'object' && 'state' in (ret as object)) {
    return ret as ReduceResult<S>;
  }
  return { state: ret as S };
}
