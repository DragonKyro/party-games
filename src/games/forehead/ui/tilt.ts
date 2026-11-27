// Tilt detection for the phone on the forehead — the pure part, so it can be
// unit-tested without a phone. `useTilt.ts` feeds it DeviceOrientation events.
//
// The signal is the vertical component of the screen's normal,
//   nz = cos(beta°) · cos(gamma°)
// (+1 lying face-up on a table, −1 face-down, 0 upright — which is where it
// sits against a forehead, in landscape or portrait).
//
//   nz < −TRIGGER  → screen faces the floor (nod forward)  → "correct"
//   nz > +TRIGGER  → screen faces the ceiling (tip back)    → "pass"
//
// Hysteresis: after firing (and at the start) the machine is disarmed until
// the phone comes back near upright (|nz| < RESET), and it never fires twice
// within COOLDOWN_MS. So holding it tilted fires once, and a phone picked up
// flat off the table doesn't fire at all until it has been on a forehead.

export type TiltKind = 'correct' | 'pass';

export const TILT_TRIGGER = 0.55;
export const TILT_RESET = 0.3;
export const TILT_COOLDOWN_MS = 400;

export interface TiltState {
  /** Back near upright since the last trigger. */
  armed: boolean;
  /** When it last fired (ms, any monotonic clock). */
  lastFireAt: number;
}

export const INITIAL_TILT: TiltState = { armed: false, lastFireAt: Number.NEGATIVE_INFINITY };

const RAD = Math.PI / 180;

/** The screen normal's vertical component from DeviceOrientation beta / gamma (degrees). */
export function screenNz(beta: number, gamma: number): number {
  return Math.cos(beta * RAD) * Math.cos(gamma * RAD);
}

/** Feed one reading. Returns the next state and what (if anything) fired. */
export function tiltStep(state: TiltState, nz: number, now: number): { state: TiltState; fire: TiltKind | null } {
  if (!Number.isFinite(nz)) return { state, fire: null };
  if (!state.armed) {
    return Math.abs(nz) < TILT_RESET ? { state: { ...state, armed: true }, fire: null } : { state, fire: null };
  }
  if (now - state.lastFireAt < TILT_COOLDOWN_MS) return { state, fire: null };
  const fire: TiltKind | null = nz < -TILT_TRIGGER ? 'correct' : nz > TILT_TRIGGER ? 'pass' : null;
  if (!fire) return { state, fire: null };
  return { state: { armed: false, lastFireAt: now }, fire };
}

/**
 * Font size (px) that fits `text` in a w × h box: tries 1–4 lines and keeps
 * the biggest. Rough glyph metrics for a chunky display face.
 */
export function fitWordSize(text: string, w: number, h: number, max = 400): number {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0 || w <= 0 || h <= 0) return 16;
  const longest = Math.max(...words.map((x) => x.length));
  const total = text.trim().length;
  let best = 0;
  for (let lines = 1; lines <= Math.min(4, words.length); lines++) {
    const perLine = Math.max(longest, Math.ceil(total / lines));
    const size = Math.min(w / (perLine * 0.58), h / (lines * 1.12));
    best = Math.max(best, size);
  }
  return Math.max(16, Math.min(max, Math.floor(best)));
}
