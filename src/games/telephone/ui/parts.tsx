import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { timeLeft, type Timer } from '@/engine/timer';
import { Sketch } from '@/ui/shared/draw/DrawPad';
import { seatColor, useNow } from '@/ui/shared/hooks';
import type { PageView } from '../state';
import styles from './GameView.module.css';

// Small pieces shared by the step, reveal and results screens.

/**
 * Call `onZero` once when `timer` runs out on this device's clock (the
 * auto-submit: whatever is on the page gets handed in at the buzzer).
 */
export function useBuzzer(timer: Timer | null, onZero: () => void): void {
  const running = !!timer && timer.endsAt !== null;
  const now = useNow(200, running);
  const left = timer ? timeLeft(timer, now) : Infinity;
  const fired = useRef(false);
  const cb = useRef(onZero);
  useEffect(() => {
    cb.current = onZero;
  });
  useEffect(() => {
    if (running && left <= 0 && !fired.current) {
      fired.current = true;
      cb.current();
    }
  }, [running, left]);
}

/** Everyone at the table with a done mark. With `onPick`, a pass-the-phone roster. */
export function Roster({
  names,
  done,
  onPick,
}: {
  names: string[];
  done: boolean[];
  onPick?: (seat: number) => void;
}) {
  return (
    <ul className={styles.roster}>
      {names.map((n, i) => (
        <li key={i}>
          <button
            type="button"
            className={`${styles.person} ${done[i] ? styles.personDone : ''} ${onPick && !done[i] ? styles.personPick : ''}`}
            onClick={onPick && !done[i] ? () => onPick(i) : undefined}
            disabled={!onPick || done[i]}
            style={{ '--c': seatColor(i) } as CSSProperties}
          >
            <span className={styles.dot} />
            {n}
            <span className={styles.check}>{done[i] ? '✓' : onPick ? '›' : '…'}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** A name tag in the seat's colour. */
export function Who({ seat, names, children }: { seat: number; names: string[]; children?: ReactNode }) {
  return (
    <span className={styles.who} style={{ '--c': seatColor(seat) } as CSSProperties}>
      <span className={styles.dot} />
      {names[seat] ?? `Player ${seat + 1}`}
      {children}
    </span>
  );
}

/** "Ana started with:", "Ben drew:", "Cai guessed:" */
export function pageCaption(page: PageView): string {
  if (page.kind === 'prompt') return page.written ? 'wrote' : 'picked';
  if (page.kind === 'draw') return page.missed ? 'ran out of time drawing' : 'drew';
  return page.missed ? 'ran out of time guessing' : 'guessed';
}

/** One sketchbook page: a prompt card, a drawing or a guess. */
export function PageBody({ page, big = false }: { page: PageView; big?: boolean }) {
  if (page.kind === 'draw') {
    return (
      <div className={styles.sketchWrap}>
        <Sketch drawing={page.drawing ?? ''} className={styles.sketch} label="A drawing from the sketchbook" />
        {page.missed && <span className={styles.blankNote}>(blank page)</span>}
        {page.drawing === null && <span className={styles.blankNote}>(scrolled away — this book is too detailed to keep every page)</span>}
      </div>
    );
  }
  return (
    <div
      className={`${styles.words} ${page.kind === 'prompt' ? styles.promptWords : ''} ${big ? styles.wordsBig : ''} ${
        page.kind === 'guess' && page.missed ? styles.missedWords : ''
      } pg-hand`}
    >
      {page.text}
    </div>
  );
}
