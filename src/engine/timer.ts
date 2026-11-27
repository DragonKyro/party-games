// Turn timers as plain data. The engine never reads a clock: every helper
// takes `now` (the host's server-aligned clock from `ActionContext.now`).
// A running timer stores when it ends; a paused one stores what was left.
// Timers are public — views copy them as-is and the UI counts down locally
// against the same server-aligned clock (`src/store/clock.ts`).

export interface Timer {
  /** Full length, for progress rings. */
  durationMs: number;
  /** Host clock when it runs out. null while paused. */
  endsAt: number | null;
  /** Time left when paused (also kept current at pause/resume). */
  remainingMs: number;
}

export function startTimer(durationMs: number, now: number): Timer {
  const d = Math.max(0, Math.round(durationMs));
  return { durationMs: d, endsAt: now + d, remainingMs: d };
}

/** A timer that hasn't started yet (shows full, doesn't tick). */
export function idleTimer(durationMs: number): Timer {
  const d = Math.max(0, Math.round(durationMs));
  return { durationMs: d, endsAt: null, remainingMs: d };
}

export function isPaused(t: Timer): boolean {
  return t.endsAt === null;
}

export function timeLeft(t: Timer, now: number): number {
  if (t.endsAt === null) return Math.max(0, t.remainingMs);
  return Math.max(0, t.endsAt - now);
}

export function isExpired(t: Timer, now: number): boolean {
  return t.endsAt !== null && now >= t.endsAt;
}

export function pauseTimer(t: Timer, now: number): Timer {
  if (t.endsAt === null) return t;
  return { ...t, endsAt: null, remainingMs: timeLeft(t, now) };
}

export function resumeTimer(t: Timer, now: number): Timer {
  if (t.endsAt !== null) return t;
  return { ...t, endsAt: now + t.remainingMs };
}

/** Add (or with a negative number, remove) time. */
export function addTime(t: Timer, deltaMs: number, now: number): Timer {
  const left = Math.max(0, timeLeft(t, now) + deltaMs);
  return t.endsAt === null ? { ...t, remainingMs: left } : { ...t, endsAt: now + left, remainingMs: left };
}

/** Fraction elapsed, 0..1. */
export function progress(t: Timer, now: number): number {
  if (t.durationMs <= 0) return 1;
  return Math.min(1, Math.max(0, 1 - timeLeft(t, now) / t.durationMs));
}
