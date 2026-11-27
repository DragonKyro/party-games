import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { seatColor, usePlay } from '@/ui/shared/hooks';
import { play } from '@/ui/shared/sfx';
import type { TelephoneAction } from '../actions';
import type { PageView, RevealPage, TelephoneView } from '../state';
import { PageBody, Who, pageCaption } from './parts';
import styles from './GameView.module.css';

// ============================================================================
// The reveal: shared presenter mode. Everyone sees the same cursor; the
// book's owner (or the host — on one device, the device) turns the pages.
// The view only carries the current book's pages up to the cursor.
// ============================================================================

/** The same rule the module applies, for the single-device name chips. */
function canHeart(page: PageView, seat: number): boolean {
  if (seat === page.by) return false;
  if (page.kind === 'prompt') return page.written;
  return !page.missed;
}

export function RevealPhase({ view }: { view: TelephoneView }) {
  const { seat, isHost, localTable, dispatch } = usePlay<TelephoneView>();
  const send = (a: TelephoneAction) => dispatch(a);
  const r = view.reveal!;
  const names = view.seats.map((s) => s.name);
  const isOwner = !localTable && seat === r.owner;
  const canTurn = isOwner || isHost;
  const more = r.shown < r.total;
  const last = r.book + 1 >= r.bookCount;
  const cursor = `${r.book}:${r.shown}`;
  const [sent, setSent] = useState<string | null>(null);
  const latest = useRef<HTMLLIElement>(null);

  useEffect(() => {
    play(r.shown === 1 ? 'whoosh' : 'reveal');
    latest.current?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
  }, [r.book, r.shown]);

  const next = () => {
    if (sent === cursor) return;
    setSent(cursor);
    const by = isOwner && seat !== null ? { bySeat: seat } : {};
    send(more ? { type: 'revealNext', ...by, book: r.book, shown: r.shown } : { type: 'nextBook', ...by, book: r.book });
  };

  return (
    <section className={styles.reveal}>
      <header className={styles.revealHead} key={r.book}>
        <span className="pg-kicker">
          Book {r.book + 1} of {r.bookCount}
        </span>
        <h2 className={styles.title}>
          <Who seat={r.owner} names={names}>
            ’s sketchbook
          </Who>
        </h2>
        <div className={styles.dots} aria-label={`Page ${r.shown} of ${r.total}`}>
          {Array.from({ length: r.total }, (_, i) => (
            <span key={i} className={i < r.shown ? styles.dotOn : ''} />
          ))}
        </div>
      </header>

      <ol className={styles.pages}>
        {r.pages.map((p) => (
          <li
            key={`${r.book}:${p.index}`}
            ref={p.index === r.shown - 1 ? latest : undefined}
            className={`${styles.page} ${p.page.kind === 'draw' ? styles.pageDraw : ''}`}
          >
            <div className={styles.pageHead}>
              <Who seat={p.page.by} names={names} />
              <span className="pg-dim">{pageCaption(p.page)}{p.index === 0 ? ' the prompt' : ''}:</span>
            </div>
            <PageBody page={p.page} big />
            <Hearts page={p} book={r.book} names={names} seat={localTable ? null : seat} local={localTable} send={send} />
          </li>
        ))}
      </ol>

      <div className={styles.revealBar}>
        {canTurn ? (
          <button
            className={`pg-btn pg-btn-primary pg-btn-xl pg-btn-block ${more ? '' : styles.glow}`}
            onClick={next}
            disabled={sent === cursor}
            autoFocus
          >
            {more ? `Next page ▸ (${r.shown + 1}/${r.total})` : last ? 'See the results 🏆' : 'Next book →'}
          </button>
        ) : (
          <p className="pg-dim">
            {more ? `${names[r.owner]} is turning the pages…` : `${names[r.owner]} will open the next book…`}
          </p>
        )}
      </div>
    </section>
  );
}

function Hearts({
  page,
  book,
  names,
  seat,
  local,
  send,
}: {
  page: RevealPage;
  book: number;
  names: string[];
  seat: number | null;
  local: boolean;
  send: (a: TelephoneAction) => void;
}) {
  const heart = (bySeat: number, on: boolean) => {
    if (on) play('pop');
    send({ type: 'heart', bySeat, book, page: page.index, on });
  };

  // One device: everyone taps their own name to heart it.
  if (local) {
    const able = names.map((_, s) => canHeart(page.page, s));
    if (!able.some(Boolean)) return page.hearts > 0 ? <HeartCount n={page.hearts} /> : null;
    return (
      <div className={styles.heartChips}>
        <span className={styles.heartLabel}>❤️ {page.hearts || ''}</span>
        {names.map((name, s) =>
          able[s] ? (
            <button
              key={s}
              type="button"
              className={`${styles.heartChip} ${page.heartedBy.includes(s) ? styles.heartChipOn : ''}`}
              style={{ '--c': seatColor(s) } as CSSProperties}
              onClick={() => heart(s, !page.heartedBy.includes(s))}
              aria-pressed={page.heartedBy.includes(s)}
            >
              {name}
            </button>
          ) : null,
        )}
      </div>
    );
  }

  if (seat !== null && page.heartable) {
    return (
      <div className={styles.heartRow}>
        <button
          type="button"
          className={`${styles.heartBtn} ${page.yours ? styles.heartOn : ''}`}
          onClick={() => heart(seat, !page.yours)}
          aria-pressed={page.yours}
          aria-label={page.yours ? 'Take back your heart' : 'Heart this page'}
        >
          <span className={styles.heartIcon} key={String(page.yours)}>
            {page.yours ? '❤️' : '🤍'}
          </span>
          {page.hearts > 0 && <b>{page.hearts}</b>}
        </button>
        <HeartNames page={page} names={names} />
      </div>
    );
  }
  return page.hearts > 0 ? (
    <div className={styles.heartRow}>
      <HeartCount n={page.hearts} />
      <HeartNames page={page} names={names} />
    </div>
  ) : null;
}

function HeartCount({ n }: { n: number }) {
  return <span className={styles.heartCount}>❤️ {n}</span>;
}

function HeartNames({ page, names }: { page: RevealPage; names: string[] }) {
  if (page.heartedBy.length === 0) return null;
  return <span className={styles.heartNames}>{page.heartedBy.map((s) => names[s]).join(', ')}</span>;
}
