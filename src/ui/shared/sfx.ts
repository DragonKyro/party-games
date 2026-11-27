// Tiny synthesized sound effects (WebAudio oscillators — no audio files).
// Browsers only allow audio after a user gesture, so `unlockAudio` is wired
// to the first pointer/key press (App.tsx); until then `play` is silent.
// Muting is per device and remembered.

import { create } from 'zustand';

export type SoundName =
  | 'tick'
  | 'tock'
  | 'buzzer'
  | 'ding'
  | 'pass'
  | 'pop'
  | 'whoosh'
  | 'fanfare'
  | 'join'
  | 'error'
  | 'reveal';

const MUTE_KEY = 'party-games.muted';

function readMuted(): boolean {
  try {
    return typeof window !== 'undefined' && window.localStorage?.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

export const useSound = create<{ muted: boolean; toggle: () => void }>((set, get) => ({
  muted: readMuted(),
  toggle: () => {
    const muted = !get().muted;
    try {
      window.localStorage?.setItem(MUTE_KEY, muted ? '1' : '0');
    } catch {
      // not persisted
    }
    set({ muted });
  },
}));

let ctx: AudioContext | null = null;

export function unlockAudio(): void {
  try {
    if (!ctx) {
      const AC = (window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext) as
        | typeof AudioContext
        | undefined;
      if (!AC) return;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') void ctx.resume();
  } catch {
    ctx = null;
  }
}

interface Note {
  f: number;
  /** Start offset (s). */
  t?: number;
  /** Length (s). */
  d: number;
  type?: OscillatorType;
  gain?: number;
  /** Glide to this frequency. */
  to?: number;
}

const SOUNDS: Record<SoundName, Note[]> = {
  tick: [{ f: 1200, d: 0.05, type: 'square', gain: 0.06 }],
  tock: [{ f: 800, d: 0.06, type: 'square', gain: 0.07 }],
  buzzer: [
    { f: 180, d: 0.55, type: 'sawtooth', gain: 0.13 },
    { f: 186, d: 0.55, type: 'sawtooth', gain: 0.1 },
  ],
  ding: [
    { f: 880, d: 0.14, gain: 0.16 },
    { f: 1320, t: 0.08, d: 0.25, gain: 0.14 },
  ],
  pass: [{ f: 520, to: 300, d: 0.18, type: 'triangle', gain: 0.12 }],
  pop: [{ f: 660, to: 990, d: 0.08, gain: 0.12 }],
  whoosh: [{ f: 300, to: 1400, d: 0.22, type: 'triangle', gain: 0.07 }],
  fanfare: [
    { f: 523, d: 0.14, type: 'triangle', gain: 0.16 },
    { f: 659, t: 0.13, d: 0.14, type: 'triangle', gain: 0.16 },
    { f: 784, t: 0.26, d: 0.14, type: 'triangle', gain: 0.16 },
    { f: 1047, t: 0.39, d: 0.45, type: 'triangle', gain: 0.18 },
  ],
  join: [
    { f: 600, d: 0.08, gain: 0.1 },
    { f: 900, t: 0.07, d: 0.12, gain: 0.1 },
  ],
  error: [{ f: 220, to: 160, d: 0.25, type: 'square', gain: 0.08 }],
  reveal: [
    { f: 392, d: 0.12, type: 'triangle', gain: 0.12 },
    { f: 587, t: 0.1, d: 0.3, type: 'triangle', gain: 0.14 },
  ],
};

export function play(name: SoundName): void {
  if (useSound.getState().muted || !ctx || ctx.state !== 'running') return;
  const now = ctx.currentTime;
  for (const n of SOUNDS[name]) {
    try {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      const start = now + (n.t ?? 0);
      osc.type = n.type ?? 'sine';
      osc.frequency.setValueAtTime(n.f, start);
      if (n.to) osc.frequency.exponentialRampToValueAtTime(n.to, start + n.d);
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(n.gain ?? 0.12, start + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, start + n.d);
      osc.connect(g).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + n.d + 0.05);
    } catch {
      // Audio is a nicety; never let it break a turn.
    }
  }
}

/** Haptic buzz on phones that support it. */
export function vibrate(pattern: number | number[]): void {
  if (useSound.getState().muted) return;
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // unsupported
  }
}
