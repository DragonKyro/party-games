import { useEffect } from 'react';

// Keep the screen awake while `active` (a turn in progress, a phone held on
// a forehead). Uses the Screen Wake Lock API where available; re-acquires
// when the tab becomes visible again (browsers drop the lock on hide).

interface WakeLockSentinelLike {
  release: () => Promise<void>;
}

export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active || typeof navigator === 'undefined') return;
    const wl = (navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<WakeLockSentinelLike> } })
      .wakeLock;
    if (!wl) return;
    let sentinel: WakeLockSentinelLike | null = null;
    let cancelled = false;
    const acquire = () => {
      if (document.visibilityState !== 'visible') return;
      wl.request('screen').then(
        (s) => {
          if (cancelled) void s.release().catch(() => {});
          else sentinel = s;
        },
        () => {},
      );
    };
    acquire();
    document.addEventListener('visibilitychange', acquire);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', acquire);
      void sentinel?.release().catch(() => {});
    };
  }, [active]);
}
