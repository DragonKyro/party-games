// Seeded RNG so every peer can reproduce the same random sequence given the
// same seed. mulberry32 — small, fast, good enough for shuffling word lists
// and picking locations.

export interface RngState {
  s: number;
}

export function makeRng(seed: number): RngState {
  return { s: seed >>> 0 };
}

export function rngNext(state: RngState): number {
  let t = (state.s = (state.s + 0x6d2b79f5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// Integer in [0, n).
export function rngInt(state: RngState, n: number): number {
  return Math.floor(rngNext(state) * n);
}

// Fisher–Yates shuffle. Mutates a copy of `arr`.
export function rngShuffle<T>(state: RngState, arr: readonly T[]): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = rngInt(state, i + 1);
    const tmp = out[i]!;
    out[i] = out[j]!;
    out[j] = tmp;
  }
  return out;
}

export function rngPick<T>(state: RngState, arr: readonly T[]): T {
  return arr[rngInt(state, arr.length)]!;
}

// Generate a fresh seed for a new game. Not seeded — this is the only place
// we ever use Math.random.
export function freshSeed(): number {
  return Math.floor(Math.random() * 2 ** 32);
}
