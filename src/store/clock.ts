// The shared clock. Online, every device's timers count against the
// database server's clock (Firebase reports each device's offset), so a
// 60-second turn ends at the same moment on the host's laptop and on every
// phone even if their system clocks disagree. Offline the offset is 0.
//
// The engine never calls this: the host passes `serverNow()` into
// `applyAction` as `ctx.now`, and UIs use it to render countdowns.

let offsetMs = 0;
let override: (() => number) | null = null;

export function serverNow(): number {
  return override ? override() : Date.now() + offsetMs;
}

export function setServerOffset(ms: number): void {
  offsetMs = Number.isFinite(ms) ? ms : 0;
}

/** Tests: freeze or script the clock. Pass null to restore. */
export function setClockForTests(fn: (() => number) | null): void {
  override = fn;
}
