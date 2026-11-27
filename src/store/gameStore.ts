import { create } from 'zustand';
import {
  SCHEDULER,
  type GameConfig,
  type GameId,
  type GameModule,
  type PublicEnvelope,
  type SeatIndex,
  type StateTick,
} from '@/engine/types';
import { randomSeed } from '@/engine/rng';
import { serverNow } from './clock';

// ============================================================================
// Game store
// ============================================================================
//
// On the host (and on a single-device table), the store also holds the
// PRIVATE state. On guests, only the `publicView` is populated — that's the
// only thing they ever see.
//
// `dispatch(action)` is the local API for user actions:
//   - single device / online host: applied to the private state here
//     (`hostApply`) with the host's clock, the local view is re-redacted, and
//     the registered `hostAppliedListener` (the online host's view fan-out)
//     is notified;
//   - online guest: forwarded to the host via `broadcastHandler`; the host
//     sends back a new redacted view.
//
// Scheduler: after every applied action the host asks the module for its
// next scheduled action (a turn timer running out, a hint unlocking) and
// arms one timeout for it. Only the host ever schedules.
//
// Seat switching is the hidden-info chokepoint on THIS device: `localSeat`
// decides whose redacted view the UI renders. `controllableSeats` is the set
// of seats this device may view or act as — online only your own seat; on a
// single-device table every seat (null), and the game UIs put a "pass the
// phone to …" screen in front of anything secret.

type AnyPrivateState = unknown;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyPublicView = PublicEnvelope<any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyAction = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyModule = GameModule<any, any, any>;

export interface StartLocalGameOptions {
  /**
   * Seats this device may view and act as. Omit (or null) on a single-device
   * table to allow every seat; online, pass just the local player's seat.
   */
  controllableSeats?: SeatIndex[] | null;
  /** Resume at this tick (host reload). Default 0. */
  tick?: StateTick;
  /** What this match was started from, for "play again" on a local table. */
  config?: GameConfig | null;
}

interface GameStore {
  gameId: GameId | null;
  module: AnyModule | null;
  /** Host-only. Null on guests/spectators. */
  privateState: AnyPrivateState | null;
  tick: StateTick;
  /** The local seat's redacted view. Drives the entire UI. */
  publicView: AnyPublicView | null;
  /** Which seat the local device is rendering (null = spectator). */
  localSeat: SeatIndex | null;
  /** True if this client owns the host loop (single device or online host). */
  isHost: boolean;
  /** null = any seat (single-device table). Online: `[mySeat]` or `[]`. */
  controllableSeats: SeatIndex[] | null;
  /** Local table only: the config the match started from (for "play again"). */
  localConfig: GameConfig | null;

  broadcastHandler: ((action: AnyAction) => void) | null;
  registerBroadcastHandler: (cb: ((action: AnyAction) => void) | null) => void;
  hostAppliedListener: ((state: AnyPrivateState, tick: StateTick) => void) | null;
  registerHostAppliedListener: (cb: ((state: AnyPrivateState, tick: StateTick) => void) | null) => void;
  /** Online: "Exit" is decided by the network layer. null = local exit to menu. */
  exitHandler: (() => void) | null;
  registerExitHandler: (cb: (() => void) | null) => void;
  /** Online host: "Play again" restarts the match for the whole room. */
  replayHandler: (() => void) | null;
  registerReplayHandler: (cb: (() => void) | null) => void;

  setPublicView: (env: AnyPublicView) => void;
  startLocalGame: (
    module: AnyModule,
    initialState: AnyPrivateState,
    localSeat: SeatIndex | null,
    opts?: StartLocalGameOptions,
  ) => void;
  /** Single-device helper: change whose view is on screen. No-op for seats this device can't view. */
  setLocalSeat: (seat: SeatIndex | null) => void;

  dispatch: (action: AnyAction) => void;
  /** Host-only: apply an action as `by`. Returns false when the module refuses it. */
  hostApply: (action: AnyAction, by: string) => boolean;

  /** Restart with the same players and options (new deal). */
  playAgain: () => void;
  exitGame: () => void;
  clearGame: () => void;
}

/** True when this device may render / act as `seat`. */
export function canControlSeat(
  st: Pick<GameStore, 'controllableSeats' | 'isHost' | 'broadcastHandler'>,
  seat: SeatIndex | null,
): boolean {
  if (seat === null) return true;
  if (st.controllableSeats === null) return st.isHost && !st.broadcastHandler;
  return st.controllableSeats.includes(seat);
}

function actionSeat(action: AnyAction): SeatIndex | null {
  const s = (action as { bySeat?: unknown } | null)?.bySeat;
  return typeof s === 'number' ? s : null;
}

let schedTimer: ReturnType<typeof setTimeout> | null = null;

function cancelSchedule() {
  if (schedTimer) clearTimeout(schedTimer);
  schedTimer = null;
}

/** Longest single setTimeout (browsers overflow above 2^31-1 ms). */
const MAX_DELAY = 2 ** 31 - 1;

export const useGameStore = create<GameStore>((set, get) => {
  function reschedule() {
    cancelSchedule();
    const { isHost, module, privateState } = get();
    if (!isHost || !module?.nextScheduled || privateState === null) return;
    if (module.isFinished(privateState)) return;
    let next: ReturnType<NonNullable<AnyModule['nextScheduled']>>;
    try {
      next = module.nextScheduled(privateState);
    } catch (e) {
      console.warn('[host] nextScheduled threw:', (e as Error).message);
      return;
    }
    if (!next) return;
    const { at, action } = next;
    const delay = Math.min(MAX_DELAY, Math.max(0, at - serverNow()));
    schedTimer = setTimeout(() => {
      schedTimer = null;
      if (get().privateState !== privateState) return; // superseded
      // Never apply before `at`, even if the timeout fired a hair early.
      if (!applyAt(action, SCHEDULER, Math.max(serverNow(), at))) {
        console.error('[host] scheduled action refused; timers stopped until the next action.', action);
      }
    }, delay);
  }

  function applyAt(action: AnyAction, by: string, now: number): boolean {
    const { module, privateState, tick, localSeat, hostAppliedListener } = get();
    if (!module || privateState === null) return false;
    let next: AnyPrivateState;
    try {
      next = module.applyAction(privateState, action, { by, now });
    } catch (e) {
      console.warn('[host] action refused:', (e as Error).message);
      return false;
    }
    const newTick = tick + 1;
    set({
      privateState: next,
      tick: newTick,
      publicView: { gameId: module.id, tick: newTick, view: module.viewFor(next, localSeat), seat: localSeat },
    });
    hostAppliedListener?.(next, newTick);
    reschedule();
    return true;
  }

  return {
    gameId: null,
    module: null,
    privateState: null,
    tick: 0,
    publicView: null,
    localSeat: null,
    isHost: false,
    controllableSeats: null,
    localConfig: null,
    broadcastHandler: null,
    hostAppliedListener: null,
    exitHandler: null,
    replayHandler: null,

    registerBroadcastHandler: (cb) => set({ broadcastHandler: cb }),
    registerHostAppliedListener: (cb) => set({ hostAppliedListener: cb }),
    registerExitHandler: (cb) => set({ exitHandler: cb }),
    registerReplayHandler: (cb) => set({ replayHandler: cb }),

    setPublicView: (env) => {
      const { tick, publicView } = get();
      if (publicView && publicView.gameId === env.gameId && env.tick < tick) return;
      set({ gameId: env.gameId, publicView: env, localSeat: env.seat, tick: env.tick });
    },

    startLocalGame: (module, initialState, localSeat, opts) => {
      cancelSchedule();
      const tick = opts?.tick ?? 0;
      const view = module.viewFor(initialState, localSeat);
      set({
        gameId: module.id,
        module,
        privateState: initialState,
        tick,
        publicView: { gameId: module.id, tick, view, seat: localSeat },
        localSeat,
        isHost: true,
        controllableSeats: opts?.controllableSeats ?? null,
        localConfig: opts?.config ?? null,
      });
      get().hostAppliedListener?.(initialState, tick);
      reschedule();
    },

    setLocalSeat: (seat) => {
      const st = get();
      if (!canControlSeat(st, seat)) return;
      const { module, privateState, tick } = st;
      if (!module || privateState === null) return;
      set({ localSeat: seat, publicView: { gameId: module.id, tick, view: module.viewFor(privateState, seat), seat } });
    },

    dispatch: (action) => {
      const st = get();
      if (!st.isHost && st.broadcastHandler) {
        st.broadcastHandler(action);
        return;
      }
      if (!st.isHost) return;
      const bySeat = actionSeat(action);
      if (bySeat !== null && !canControlSeat(st, bySeat)) {
        console.warn(`[host] local action for seat ${bySeat} refused`);
        return;
      }
      applyAt(action, '', serverNow());
    },

    hostApply: (action, by) => applyAt(action, by, serverNow()),

    playAgain: () => {
      const st = get();
      if (st.replayHandler) {
        st.replayHandler();
        return;
      }
      const cfg = st.localConfig;
      if (!st.isHost || !cfg || !st.module) return;
      const config: GameConfig = { ...cfg, seed: randomSeed(), now: serverNow() };
      let state: AnyPrivateState;
      try {
        state = st.module.createInitialState(config);
      } catch (e) {
        console.warn('[host] restart failed:', (e as Error).message);
        return;
      }
      get().startLocalGame(st.module, state, st.localSeat, { controllableSeats: st.controllableSeats, config });
    },

    exitGame: () => {
      const handler = get().exitHandler;
      if (handler) {
        handler();
        return;
      }
      get().clearGame();
    },

    clearGame: () => {
      cancelSchedule();
      set({
        gameId: null,
        module: null,
        privateState: null,
        tick: 0,
        publicView: null,
        localSeat: null,
        isHost: false,
        controllableSeats: null,
        localConfig: null,
      });
    },
  };
});

/**
 * Hook for per-game UIs: whether this is a single-device table where the
 * screen is passed around (so secrets need a "pass to …" cover), and which
 * seats may be shown. Online this is always disabled — you only ever see
 * your own seat.
 */
export function useSeatSwitching(): {
  enabled: boolean;
  canView: (seat: SeatIndex) => boolean;
  setLocalSeat: (seat: SeatIndex | null) => void;
} {
  const controllableSeats = useGameStore((s) => s.controllableSeats);
  const isHost = useGameStore((s) => s.isHost);
  const broadcastHandler = useGameStore((s) => s.broadcastHandler);
  const setLocalSeat = useGameStore((s) => s.setLocalSeat);
  const st = { controllableSeats, isHost, broadcastHandler };
  const enabled = controllableSeats === null ? isHost && !broadcastHandler : controllableSeats.length > 1;
  return { enabled, canView: (seat) => canControlSeat(st, seat), setLocalSeat };
}
