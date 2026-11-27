import { useEffect, useRef, useState } from 'react';
import { requestTiltPermission, tiltNeedsPermission, tiltSupported } from './device';
import { INITIAL_TILT, screenNz, tiltStep, type TiltKind } from './tilt';

// DeviceOrientation → tiltStep → onTilt. The state machine restarts (disarmed)
// whenever `enabled` turns on, so a fresh turn never fires until the phone
// has been brought up to the forehead.

export interface TiltControl {
  /** Orientation readings are arriving. */
  live: boolean;
  /** iOS: a tap is needed to allow motion access. */
  needsPermission: boolean;
  /** Ask for permission (from a tap). */
  enable: () => void;
}

export function useTilt(enabled: boolean, onTilt: (kind: TiltKind) => void): TiltControl {
  const cb = useRef(onTilt);
  useEffect(() => {
    cb.current = onTilt;
  }, [onTilt]);
  const [live, setLive] = useState(false);
  const [needsPermission, setNeedsPermission] = useState(() => tiltNeedsPermission());
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!enabled || !tiltSupported()) return;
    let st = INITIAL_TILT;
    const onEvent = (e: DeviceOrientationEvent) => {
      if (e.beta === null || e.gamma === null) return;
      setLive(true);
      const r = tiltStep(st, screenNz(e.beta, e.gamma), performance.now());
      st = r.state;
      if (r.fire) cb.current(r.fire);
    };
    window.addEventListener('deviceorientation', onEvent);
    return () => window.removeEventListener('deviceorientation', onEvent);
  }, [enabled, attempt]);

  const enable = () => {
    void requestTiltPermission().then((ok) => {
      setNeedsPermission(!ok && tiltNeedsPermission());
      setAttempt((a) => a + 1);
    });
  };

  return { live, needsPermission, enable };
}

/** True while the viewport is taller than it is wide. */
export function usePortrait(): boolean {
  const query = '(orientation: portrait)';
  const [portrait, setPortrait] = useState(
    () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(query).matches,
  );
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia(query);
    const on = () => setPortrait(mq.matches);
    on();
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);
  return portrait;
}

/** Window size, live. */
export function useViewport(): { w: number; h: number } {
  const read = () => ({
    w: typeof window !== 'undefined' ? window.innerWidth : 800,
    h: typeof window !== 'undefined' ? window.innerHeight : 400,
  });
  const [size, setSize] = useState(read);
  useEffect(() => {
    const on = () => setSize(read());
    window.addEventListener('resize', on);
    window.addEventListener('orientationchange', on);
    return () => {
      window.removeEventListener('resize', on);
      window.removeEventListener('orientationchange', on);
    };
  }, []);
  return size;
}
