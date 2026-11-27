import { FinalResults } from '@/ui/shared/FinalResults';
import { seatColor, usePlay } from '@/ui/shared/hooks';
import type { TelephoneAction } from '../actions';
import type { TelephoneView } from '../state';
import { PageBody, Who, pageCaption } from './parts';
import styles from './GameView.module.css';

// The final screen: ranked by hearts received, the crowd favourite, and the
// replay list. The list is text only; a book's drawings arrive when this
// screen opens it (`browse`), so no view ever carries every drawing.

export function Results({ view }: { view: TelephoneView }) {
  const { seat, isHost, localTable, dispatch } = usePlay<TelephoneView>();
  const r = view.results!;
  const names = view.seats.map((s) => s.name);
  const me = localTable ? null : seat;
  // Seated players browse for themselves; a seat-less screen only if it runs the game.
  const canBrowse = me !== null || isHost;
  const browse = (book: number | null) =>
    dispatch((me !== null ? { type: 'browse', bySeat: me, book } : { type: 'browse', book }) satisfies TelephoneAction);

  const best = Math.max(0, ...r.hearts);
  const winners = r.hearts.map((h, s) => (h === best ? s : -1)).filter((s) => s >= 0);
  const headline =
    best === 0
      ? 'No hearts? Tough crowd!'
      : winners.length > 1
        ? 'It’s a tie for the crowd’s love!'
        : `${names[winners[0]!]} stole the show!`;
  const rows = view.seats.map((s) => ({
    name: s.name,
    score: r.hearts[s.index] ?? 0,
    color: seatColor(s.index),
    detail: `${r.drawHearts[s.index] ?? 0} for drawings · ${(r.hearts[s.index] ?? 0) - (r.drawHearts[s.index] ?? 0)} for words`,
    you: me === s.index,
  }));
  const fav = r.favourite;

  return (
    <FinalResults headline={headline} subline="Ranked by hearts received." rows={rows} unit="❤️">
      {fav && (
        <section className={styles.favourite}>
          <span className="pg-kicker">🏆 Crowd favorite · ❤️ {fav.hearts}</span>
          <p className={styles.favCaption}>
            <Who seat={fav.page.by} names={names} /> {pageCaption(fav.page)}, in{' '}
            <Who seat={fav.owner} names={names}>
              ’s book
            </Who>
          </p>
          {fav.before && (
            <div className={styles.favBefore}>
              <span className="pg-faint">
                {fav.page.kind === 'draw' ? 'They were drawing:' : 'They were guessing at:'}
              </span>
              <PageBody page={fav.before} />
            </div>
          )}
          <PageBody page={fav.page} big />
        </section>
      )}

      <details className={styles.books}>
        <summary>All the sketchbooks ({r.books.length})</summary>
        <ol className={styles.bookList}>
          {r.books.map((b, i) => {
            const isOpen = r.open?.book === i;
            const first = b.pages[0]?.text ?? '';
            const final = b.pages[b.pages.length - 1];
            return (
              <li key={i} className={styles.bookItem}>
                <div className={styles.bookLine}>
                  <Who seat={b.owner} names={names} />
                  <span className={`${styles.chain} pg-hand`}>
                    {first}
                    {b.pages.length > 1 && final?.text != null && <> → … → {final.text}</>}
                  </span>
                  {canBrowse && (
                    <button type="button" className="pg-btn pg-btn-sm" onClick={() => browse(isOpen ? null : i)}>
                      {isOpen ? 'Close' : 'Open'}
                    </button>
                  )}
                </div>
                {isOpen && r.open ? (
                  <ol className={styles.pages}>
                    {r.open.pages.map((p, k) => (
                      <li key={k} className={styles.page}>
                        <div className={styles.pageHead}>
                          <Who seat={p.by} names={names} />
                          <span className="pg-dim">{pageCaption(p)}:</span>
                          {p.hearts > 0 && <span className={styles.heartCount}>❤️ {p.hearts}</span>}
                        </div>
                        <PageBody page={p} />
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className={styles.chainText}>
                    {b.pages.map((p, k) => (
                      <span key={k}>
                        {k > 0 && ' → '}
                        {p.text === null ? `🖼 ${names[p.by]}` : `“${p.text}”`}
                        {p.hearts > 0 && ` ❤️${p.hearts}`}
                      </span>
                    ))}
                  </p>
                )}
              </li>
            );
          })}
        </ol>
      </details>
    </FinalResults>
  );
}
