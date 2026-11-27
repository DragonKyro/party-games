import { useEffect, useMemo, type ReactNode } from 'react';
import { usePlay } from './hooks';
import { play } from './sfx';
import styles from './FinalResults.module.css';

// The end-of-match screen every game uses: a headline, a podium + ranked
// list, optional extra highlights (awards, "who wrote what"), and the
// play-again / exit buttons (play again is for whoever runs the game).

export interface ResultRow {
  name: string;
  score: number;
  /** Dot / bar colour. */
  color?: string;
  /** Small line under the name ("12 slips · MVP"). */
  detail?: string;
  /** Mark the viewer's own row. */
  you?: boolean;
}

export function FinalResults({
  headline,
  subline,
  rows,
  unit = 'pts',
  children,
}: {
  headline: ReactNode;
  subline?: ReactNode;
  /** Any order; sorted here by score, ties share a place. */
  rows: ResultRow[];
  /** Plural unit ("pts", "slips"); a trailing "s" is dropped for a score of 1. */
  unit?: string;
  /** Highlights below the table. */
  children?: ReactNode;
}) {
  const { isHost, online, playAgain, exitGame } = usePlay();
  const ranked = useMemo(() => {
    const sorted = rows.slice().sort((a, b) => b.score - a.score);
    let place = 0;
    return sorted.map((r, i) => {
      if (i === 0 || r.score !== sorted[i - 1]!.score) place = i + 1;
      return { ...r, place };
    });
  }, [rows]);
  const max = Math.max(1, ...ranked.map((r) => r.score));

  useEffect(() => {
    play('fanfare');
  }, []);

  return (
    <section className={styles.root}>
      <Confetti />
      <div className={styles.trophy} aria-hidden>
        🏆
      </div>
      <h2 className={styles.headline}>{headline}</h2>
      {subline && <p className={styles.subline}>{subline}</p>}

      <ol className={`${styles.list} pg-stagger`}>
        {ranked.map((r, i) => (
          <li
            key={`${r.name}-${i}`}
            className={`${styles.row} ${r.place === 1 ? styles.first : ''} ${r.you ? styles.you : ''}`}
            style={{ '--i': i, '--c': r.color ?? 'var(--accent)' } as React.CSSProperties}
          >
            <span className={styles.place}>{r.place === 1 ? '🥇' : r.place === 2 ? '🥈' : r.place === 3 ? '🥉' : r.place}</span>
            <span className={styles.who}>
              <span className={styles.name}>
                {r.name}
                {r.you && <span className={styles.youTag}>you</span>}
              </span>
              {r.detail && <span className={styles.detail}>{r.detail}</span>}
              <span className={styles.bar}>
                <span style={{ width: `${(Math.max(0, r.score) / max) * 100}%` }} />
              </span>
            </span>
            <span className={styles.score}>
              {r.score}
              <small>{r.score === 1 && unit.endsWith('s') ? unit.slice(0, -1) : unit}</small>
            </span>
          </li>
        ))}
      </ol>

      {children && <div className={styles.extra}>{children}</div>}

      <div className={styles.actions}>
        {isHost ? (
          <>
            <button className="pg-btn pg-btn-primary pg-btn-lg" onClick={playAgain}>
              Play again
            </button>
            <button className="pg-btn pg-btn-ghost pg-btn-lg" onClick={exitGame}>
              {online ? 'Back to lobby' : 'Done'}
            </button>
          </>
        ) : (
          <>
            <p className="pg-dim">Waiting for the host to start another round…</p>
            <button className="pg-btn pg-btn-ghost" onClick={exitGame}>
              Back to lobby
            </button>
          </>
        )}
      </div>
    </section>
  );
}

const CONFETTI_COLORS = ['#ff6b6b', '#ffc93c', '#06d6a0', '#4cc9f0', '#a06cf0', '#ff70a6'];

export function Confetti({ count = 60 }: { count?: number }) {
  const pieces = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        left: Math.random() * 100,
        delay: Math.random() * 1.2,
        dur: 2.4 + Math.random() * 1.8,
        dx: `${(Math.random() - 0.5) * 30}vw`,
        rot: `${360 + Math.random() * 720}deg`,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        w: 6 + Math.random() * 6,
      })),
    [count],
  );
  return (
    <div className={styles.confetti} aria-hidden>
      {pieces.map((p, i) => (
        <span
          key={i}
          style={
            {
              left: `${p.left}%`,
              width: p.w,
              height: p.w * 1.6,
              background: p.color,
              animationDelay: `${p.delay}s`,
              animationDuration: `${p.dur}s`,
              '--dx': p.dx,
              '--rot': p.rot,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}
