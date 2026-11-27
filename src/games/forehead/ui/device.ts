// Phone plumbing for the held-up card: motion permission (iOS), fullscreen
// and the landscape lock. Every call is best-effort — browsers differ wildly,
// and the tap targets work without any of it.

type OrientationEventCtor = { requestPermission?: () => Promise<'granted' | 'denied' | 'default'> };
type LockableOrientation = ScreenOrientation & { lock?: (o: string) => Promise<void>; unlock?: () => void };

let permission: 'unknown' | 'granted' | 'denied' = 'unknown';

function orientationCtor(): OrientationEventCtor | null {
  if (typeof window === 'undefined') return null;
  return (window as unknown as { DeviceOrientationEvent?: OrientationEventCtor }).DeviceOrientationEvent ?? null;
}

/** True when the browser has orientation events at all. */
export function tiltSupported(): boolean {
  return orientationCtor() !== null;
}

/** iOS asks for permission; it must be requested from a tap. */
export function tiltNeedsPermission(): boolean {
  const ctor = orientationCtor();
  return !!ctor && typeof ctor.requestPermission === 'function' && permission !== 'granted';
}

/** Call from a tap handler, before any await (the browser checks for a user gesture). */
export function requestTiltPermission(): Promise<boolean> {
  const ctor = orientationCtor();
  if (!ctor) return Promise.resolve(false);
  if (typeof ctor.requestPermission !== 'function') return Promise.resolve(true);
  try {
    return ctor.requestPermission().then(
      (r) => {
        permission = r === 'granted' ? 'granted' : 'denied';
        return permission === 'granted';
      },
      () => false,
    );
  } catch {
    return Promise.resolve(false);
  }
}

function lockLandscape(): void {
  try {
    const o = (typeof screen !== 'undefined' ? screen.orientation : undefined) as LockableOrientation | undefined;
    void o?.lock?.('landscape')?.catch(() => {});
  } catch {
    // unsupported
  }
}

/** Fullscreen + landscape lock. Call from a tap handler. */
export function enterHeldMode(): void {
  try {
    const el = document.documentElement;
    if (!document.fullscreenElement && typeof el.requestFullscreen === 'function') {
      // Most browsers only allow the lock while fullscreen.
      el.requestFullscreen({ navigationUI: 'hide' }).then(lockLandscape, () => lockLandscape());
      return;
    }
  } catch {
    // unsupported (iPhone Safari)
  }
  lockLandscape();
}

export function releaseOrientation(): void {
  try {
    (screen.orientation as LockableOrientation | undefined)?.unlock?.();
  } catch {
    // unsupported
  }
}

export function exitHeldMode(): void {
  releaseOrientation();
  try {
    if (document.fullscreenElement && typeof document.exitFullscreen === 'function') {
      void document.exitFullscreen().catch(() => {});
    }
  } catch {
    // unsupported
  }
}

/** Everything the Start tap should do on the phone that goes on the forehead. */
export function prepareForehead(): Promise<boolean> {
  const granted = requestTiltPermission();
  enterHeldMode();
  return granted;
}
