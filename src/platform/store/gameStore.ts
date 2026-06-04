import { create } from 'zustand';
import type { GameSettingsBlob, Seat } from '@/platform/net/types';
import { getGame } from '@/platform/game/registry';
import {
  unpackReduce,
  type ActionContext,
  type GameModule,
  type ReducerReturn,
} from '@/platform/game/types';

// Wraps the active game module's runtime state.
//
// Two dispatch paths:
//   - `dispatch(action)` — local user input. Validates, reduces, AND emits
//     side effects (network broadcast, host-only private deals). The broadcast
//     handler is registered by networkStore.
//   - `applyLocal(action, byUuid, now)` — silent reducer used by network
//     receivers (or the host when it wants to apply its own action without
//     re-broadcasting). No side effects.
//
// The reducer is the same pure function in both paths; only the broadcasting
// changes.

interface BroadcastSink {
  // Called after a successful local dispatch. networkStore wires this to
  // broadcast `{ action, byUuid }` and emit any `privates` to targets.
  broadcastAction: (
    action: unknown,
    privates?: Array<{ target: string; payload: unknown }>,
  ) => void;
}

interface GameStoreState {
  gameId: string | null;
  state: unknown;
  // Resolved at start; cached so we don't re-lookup on every dispatch.
  module: GameModule | null;
  // Seats at game-start, in seating order. Stable for the whole game.
  seats: Seat[];
  settings: GameSettingsBlob;
  // The latest private payload addressed to *this peer*. Game UIs read this
  // to render hidden info (Spyfall role, Fishbowl prompts on your turn).
  // Reset on game start.
  privateForMe: unknown;

  startGame: (input: {
    gameId: string;
    publicState: unknown;
    settings: GameSettingsBlob;
    seats: Seat[];
    privateForMe?: unknown;
  }) => void;

  dispatch: (action: unknown, myUuid: string) => void;
  applyLocal: (action: unknown, byUuid: string, now: number) => void;
  setPrivateForMe: (payload: unknown) => void;
  endGame: () => void;

  // Wire side effects. networkStore calls this once on connect.
  registerBroadcast: (sink: BroadcastSink) => void;
}

let broadcastSink: BroadcastSink | null = null;

export const useGameStore = create<GameStoreState>((set, get) => ({
  gameId: null,
  state: null,
  module: null,
  seats: [],
  settings: {},
  privateForMe: undefined,

  startGame: ({ gameId, publicState, settings, seats, privateForMe }) => {
    const mod = getGame(gameId) ?? null;
    set({
      gameId,
      module: mod,
      state: publicState,
      settings,
      seats,
      privateForMe,
    });
  },

  dispatch: (action, myUuid) => {
    const { module: mod, state } = get();
    if (!mod || state == null) return;
    const ctx: ActionContext = {
      now: Date.now(),
      byUuid: myUuid,
      seats: get().seats,
    };
    const ret: ReducerReturn<unknown> = mod.applyAction(state, action, ctx);
    const { state: next, privates } = unpackReduce(ret);
    set({ state: next });
    broadcastSink?.broadcastAction(action, privates);
  },

  applyLocal: (action, byUuid, now) => {
    const { module: mod, state } = get();
    if (!mod || state == null) return;
    const ctx: ActionContext = { now, byUuid, seats: get().seats };
    const ret = mod.applyAction(state, action, ctx);
    const { state: next } = unpackReduce(ret);
    set({ state: next });
  },

  setPrivateForMe: (payload) => set({ privateForMe: payload }),

  endGame: () =>
    set({
      gameId: null,
      module: null,
      state: null,
      seats: [],
      settings: {},
      privateForMe: undefined,
    }),

  registerBroadcast: (sink) => {
    broadcastSink = sink;
  },
}));
