// Validation helpers every game's `applyAction` uses. They throw, and the
// host refuses any action that throws.

import type { SeatIndex } from './types';

/**
 * Host controls and scheduler actions are seatless. Online, the host's
 * network layer already refuses seatless actions from guests; this guards
 * against a player-sent action that *adds* a `bySeat` to a host control.
 */
export function assertHostOnly(action: object): void {
  if (typeof (action as { bySeat?: unknown }).bySeat === 'number') throw new Error('Only the host can do that');
}

export function assertSeat(seat: unknown, seatCount: number): asserts seat is SeatIndex {
  if (typeof seat !== 'number' || !Number.isInteger(seat) || seat < 0 || seat >= seatCount) {
    throw new Error(`Unknown seat ${String(seat)}`);
  }
}

/** A finite integer in [min, max], or throw. */
export function assertInt(n: unknown, min: number, max: number, what = 'value'): asserts n is number {
  if (typeof n !== 'number' || !Number.isInteger(n) || n < min || n > max) throw new Error(`Bad ${what}`);
}
