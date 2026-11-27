import { describe, expect, it } from 'vitest';
import { INITIAL_TILT, TILT_COOLDOWN_MS, fitWordSize, screenNz, tiltStep, type TiltKind, type TiltState } from './tilt';

/** Run readings of [beta, gamma, atMs]; collect what fired. */
function run(readings: Array<[number, number, number]>, start: TiltState = INITIAL_TILT): TiltKind[] {
  let s = start;
  const out: TiltKind[] = [];
  for (const [beta, gamma, at] of readings) {
    const r = tiltStep(s, screenNz(beta, gamma), at);
    s = r.state;
    if (r.fire) out.push(r.fire);
  }
  return out;
}

describe('screenNz', () => {
  it('is +1 face-up, −1 face-down, 0 upright in either orientation', () => {
    expect(screenNz(0, 0)).toBeCloseTo(1);
    expect(screenNz(180, 0)).toBeCloseTo(-1);
    expect(screenNz(-180, 0)).toBeCloseTo(-1);
    expect(screenNz(90, 0)).toBeCloseTo(0); // portrait, upright
    expect(screenNz(0, 90)).toBeCloseTo(0); // landscape on a forehead
    expect(screenNz(10, -88)).toBeCloseTo(0, 1);
  });
});

describe('tiltStep', () => {
  it('ignores a phone picked up flat until it has been near upright', () => {
    expect(run([[0, 0, 0], [5, 0, 100], [170, 0, 900]])).toEqual([]);
    expect(run([[0, 0, 0], [0, 85, 500], [0, 0, 1000]])).toEqual(['pass']);
  });

  it('face-down is correct, face-up is pass (landscape, as on a forehead)', () => {
    // On the forehead in landscape: gamma ≈ ±90. Nodding forward swings the screen to the floor.
    expect(run([[0, 88, 0], [170, 20, 600]])).toEqual(['correct']);
    expect(run([[0, -88, 0], [20, -15, 600]])).toEqual(['pass']);
  });

  it('fires once per tilt, re-arms only back near upright', () => {
    const fired = run([
      [0, 90, 0],
      [170, 0, 500], // correct
      [175, 0, 1500], // still down: nothing
      [120, 30, 2000], // |nz| ≈ 0.43: not upright enough to re-arm
      [170, 0, 2500], // nothing
      [90, 0, 3000], // upright: re-armed
      [10, 0, 3500], // pass
    ]);
    expect(fired).toEqual(['correct', 'pass']);
  });

  it('waits out the cooldown after a trigger', () => {
    const fired = run([
      [0, 90, 0],
      [170, 0, 1000], // correct
      [90, 0, 1100], // re-armed
      [10, 0, 1000 + TILT_COOLDOWN_MS - 1], // too soon
      [10, 0, 1000 + TILT_COOLDOWN_MS], // pass
    ]);
    expect(fired).toEqual(['correct', 'pass']);
  });

  it('ignores the dead zone and junk readings', () => {
    expect(run([[0, 90, 0], [60, 0, 500], [120, 0, 900]])).toEqual([]);
    const s = tiltStep({ armed: true, lastFireAt: 0 }, Number.NaN, 5000);
    expect(s.fire).toBeNull();
  });
});

describe('fitWordSize', () => {
  it('fills the box, shrinking for long cards', () => {
    const short = fitWordSize('Owl', 800, 360);
    const long = fitWordSize('Martin Luther King Jr.', 800, 360);
    expect(short).toBeGreaterThan(long);
    expect(short).toBeLessThanOrEqual(360);
    expect(long).toBeGreaterThan(40);
    expect(fitWordSize('', 800, 360)).toBe(16);
  });
});
