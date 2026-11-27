import { useEffect, useRef } from 'react';
import { isPaused, timeLeft, type Timer } from '@/engine/timer';
import { useNow } from './hooks';
import { play, vibrate } from './sfx';
import styles from './Countdown.module.css';

// A ring countdown for any engine `Timer` (from a view). Counts against the
// shared server clock, so every device shows the same second. With `beep`,
// the last `warnSeconds` tick audibly and zero buzzes — turn it on for the
// device(s) where the sound helps (usually everyone, unless it's a phone on
// a forehead that's also doing its own sounds).

/** 45 → "45", 237 → "3:57". */
export function formatClock(secs: number): string {
  if (secs < 60) return String(secs);
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
}

export function Countdown({
  timer,
  size = 'md',
  warnSeconds = 5,
  beep = false,
  label,
}: {
  timer: Timer | null | undefined;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  warnSeconds?: number;
  beep?: boolean;
  label?: string;
}) {
  const paused = !timer || isPaused(timer);
  const now = useNow(200, !paused);
  const left = timer ? timeLeft(timer, now) : 0;
  const secs = Math.ceil(left / 1000);
  const frac = timer && timer.durationMs > 0 ? left / timer.durationMs : 0;
  const warn = !paused && secs <= warnSeconds && secs > 0;
  const done = !!timer && !paused && left <= 0;

  const lastSec = useRef<number | null>(null);
  useEffect(() => {
    if (!beep || paused) {
      lastSec.current = null;
      return;
    }
    if (lastSec.current === secs) return;
    const prev = lastSec.current;
    lastSec.current = secs;
    if (prev === null) return; // don't beep on mount
    if (secs === 0) {
      play('buzzer');
      vibrate([200, 80, 200]);
    } else if (secs <= warnSeconds) play(secs % 2 ? 'tick' : 'tock');
  }, [secs, beep, paused, warnSeconds]);

  if (!timer) return null;
  const r = 42;
  const c = 2 * Math.PI * r;
  return (
    <div
      className={`${styles.root} ${styles[size]} ${warn ? styles.warn : ''} ${done ? styles.done : ''}`}
      role="timer"
      aria-label={`${label ? `${label}: ` : ''}${formatClock(secs)}${secs >= 60 ? '' : ' seconds'} left${paused ? ', paused' : ''}`}
    >
      <svg viewBox="0 0 100 100" aria-hidden>
        <circle className={styles.track} cx="50" cy="50" r={r} />
        <circle
          className={styles.arc}
          cx="50"
          cy="50"
          r={r}
          strokeDasharray={c}
          strokeDashoffset={c * (1 - Math.max(0, Math.min(1, frac)))}
        />
      </svg>
      <span className={`${styles.num} ${secs >= 60 ? styles.long : ''}`} key={warn ? secs : 'n'}>
        {paused && left > 0 ? '❚❚' : formatClock(secs)}
      </span>
      {label && <span className={styles.label}>{label}</span>}
    </div>
  );
}
