import { useState, type ReactNode } from 'react';
import { PACK_LIST } from '@/words';
import type { CollectView } from '@/words/collect';
import { cleanSubmission, splitPair } from '@/words/collect';
import { MAX_ENTRY_LENGTH } from '@/words/source';
import { SPECTRUMS } from '@/words/prompts/spectrums';
import { seatColor, usePlay } from './hooks';
import { PassScreen } from './PassScreen';
import { play } from './sfx';
import styles from './CollectPanel.module.css';

// The "everyone writes words" phase UI, shared by every game. Drop it in
// while your view's `collect` is non-null:
//
//   {view.collect && <CollectPanel collect={view.collect} names={names} />}
//
// It dispatches `collect.submit` / `collect.reopen` for the right seat, and
// gives the host a "play with what we have" button (`collect.close`). On a
// single-device table it runs a pass-the-phone loop so each player types in
// private.

export function CollectPanel({
  collect,
  names,
  title = 'Write your words',
  hint,
  placeholder = 'A person, place, thing or phrase',
}: {
  collect: CollectView;
  names: string[];
  title?: string;
  hint?: ReactNode;
  placeholder?: string;
}) {
  const { seat, isHost, localTable, dispatch, setSeat } = usePlay();
  const [writer, setWriter] = useState<number | null>(null);
  const [claimed, setClaimed] = useState(false);
  const doneCount = collect.done.filter(Boolean).length;
  const all = doneCount === collect.done.length;

  const closeButton = isHost && doneCount > 0 && !all && (
    <button className="pg-btn pg-btn-ghost" onClick={() => dispatch({ type: 'collect.close' })}>
      Stop waiting — go with the {doneCount} who {doneCount === 1 ? 'is' : 'are'} ready
    </button>
  );

  // ---- Single device: a roster; each player takes the phone in turn. ----
  if (localTable) {
    if (writer !== null && !claimed) {
      return (
        <PassScreen
          to={names[writer] ?? `Player ${writer + 1}`}
          message="Write your entries in private — no peeking, everyone else!"
          onReady={() => {
            setSeat(writer);
            setClaimed(true);
          }}
        >
          <button className="pg-btn pg-btn-ghost pg-btn-sm" onClick={() => setWriter(null)}>
            Back
          </button>
        </PassScreen>
      );
    }
    if (writer !== null && claimed && seat === writer) {
      return (
        <EntryForm
          key={writer}
          collect={collect}
          who={names[writer] ?? ''}
          title={title}
          hint={hint}
          placeholder={placeholder}
          onSubmit={(entries) => {
            dispatch({ type: 'collect.submit', bySeat: writer, entries });
            play('pop');
            setWriter(null);
            setClaimed(false);
            setSeat(null);
          }}
          onCancel={() => {
            setWriter(null);
            setClaimed(false);
            setSeat(null);
          }}
        />
      );
    }
    return (
      <section className={styles.root}>
        <Header title={title} collect={collect} hint={hint} />
        <p className="pg-dim">Tap your name, then pass the phone along.</p>
        <Roster names={names} done={collect.done} onPick={(i) => (collect.done[i] ? null : setWriter(i))} />
        {closeButton}
      </section>
    );
  }

  // ---- Online. ----
  const mine = seat !== null ? collect.done[seat] : false;
  return (
    <section className={styles.root}>
      {seat !== null && !mine ? (
        <EntryForm
          collect={collect}
          title={title}
          hint={hint}
          placeholder={placeholder}
          onSubmit={(entries) => {
            dispatch({ type: 'collect.submit', bySeat: seat, entries });
            play('pop');
          }}
        />
      ) : (
        <>
          <Header title={seat === null ? 'Players are writing…' : 'You’re in!'} collect={collect} />
          {seat !== null && collect.yours && (
            <div className={styles.mine}>
              {collect.yours.map((w, i) => (
                <span key={i} className={styles.slip} style={{ '--r': `${((i * 37) % 7) - 3}deg` } as React.CSSProperties}>
                  {w}
                </span>
              ))}
            </div>
          )}
          {seat !== null && !all && (
            <button
              className="pg-btn pg-btn-ghost pg-btn-sm"
              onClick={() => dispatch({ type: 'collect.reopen', bySeat: seat })}
            >
              ✎ Edit mine
            </button>
          )}
        </>
      )}
      <div className={styles.waiting}>
        <span className="pg-kicker">
          {doneCount} of {collect.done.length} ready
        </span>
        <Roster names={names} done={collect.done} />
      </div>
      {closeButton}
    </section>
  );
}

function Header({ title, collect, hint }: { title: string; collect: CollectView; hint?: ReactNode }) {
  return (
    <header className={styles.head}>
      <h2 className={styles.title}>{title}</h2>
      <p className={styles.prompt}>{collect.prompt}</p>
      {hint && <p className={styles.hint}>{hint}</p>}
    </header>
  );
}

function Roster({ names, done, onPick }: { names: string[]; done: boolean[]; onPick?: (seat: number) => void }) {
  return (
    <ul className={styles.roster}>
      {names.map((n, i) => (
        <li key={i}>
          <button
            type="button"
            className={`${styles.person} ${done[i] ? styles.personDone : ''}`}
            onClick={onPick ? () => onPick(i) : undefined}
            disabled={!onPick || done[i]}
            style={{ '--c': seatColor(i) } as React.CSSProperties}
          >
            <span className={styles.dot} />
            {n}
            <span className={styles.check}>{done[i] ? '✓' : '…'}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function randomSuggestion(kind: CollectView['kind']): string {
  if (kind === 'pairs') {
    const [l, r] = SPECTRUMS[Math.floor(Math.random() * SPECTRUMS.length)] ?? ['Cold', 'Hot'];
    return `${l} | ${r}`;
  }
  const packs = PACK_LIST.filter((p) => !p.adultsOnly);
  const pack = packs[Math.floor(Math.random() * packs.length)]!;
  return pack.words[Math.floor(Math.random() * pack.words.length)] ?? '';
}

function EntryForm({
  collect,
  who,
  title,
  hint,
  placeholder,
  onSubmit,
  onCancel,
}: {
  collect: CollectView;
  who?: string;
  title: string;
  hint?: ReactNode;
  placeholder: string;
  onSubmit: (entries: string[]) => void;
  onCancel?: () => void;
}) {
  const n = collect.perPlayer;
  const pairs = collect.kind === 'pairs';
  const [values, setValues] = useState<string[]>(() =>
    Array.from({ length: n }, (_, i) => collect.yours?.[i] ?? (pairs ? ' | ' : '')),
  );
  const [error, setError] = useState<string | null>(null);

  const set = (i: number, v: string) => setValues((cur) => cur.map((x, j) => (j === i ? v : x)));
  const setSide = (i: number, side: 0 | 1, v: string) => {
    const [l, r] = splitPair(values[i] ?? ' | ');
    set(i, side === 0 ? `${v.replace(/\|/g, '')} | ${r}` : `${l} | ${v.replace(/\|/g, '')}`);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    // The host's own validation, so a submission it would refuse never leaves this form.
    let cleaned: string[];
    try {
      cleaned = cleanSubmission(collect, values);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Check your entries.');
      play('error');
      return;
    }
    setError(null);
    onSubmit(cleaned);
  };

  return (
    <form className={styles.form} onSubmit={submit}>
      <header className={styles.head}>
        {who && <span className="pg-kicker">{who}</span>}
        <h2 className={styles.title}>{title}</h2>
        <p className={styles.prompt}>{collect.prompt}</p>
        {hint && <p className={styles.hint}>{hint}</p>}
      </header>
      <ol className={styles.fields}>
        {values.map((v, i) => (
          <li key={i} className={styles.field}>
            <span className={styles.num}>{i + 1}</span>
            {pairs ? (
              <div className={styles.pair}>
                <input
                  className="pg-input"
                  value={splitPair(v)[0]}
                  onChange={(e) => setSide(i, 0, e.target.value)}
                  placeholder="Left end"
                  maxLength={28}
                  aria-label={`Spectrum ${i + 1} left end`}
                />
                <span aria-hidden>↔</span>
                <input
                  className="pg-input"
                  value={splitPair(v)[1]}
                  onChange={(e) => setSide(i, 1, e.target.value)}
                  placeholder="Right end"
                  maxLength={28}
                  aria-label={`Spectrum ${i + 1} right end`}
                />
              </div>
            ) : (
              <input
                className="pg-input"
                value={v}
                onChange={(e) => set(i, e.target.value)}
                placeholder={placeholder}
                maxLength={MAX_ENTRY_LENGTH}
                autoFocus={i === 0}
                autoComplete="off"
                aria-label={`Entry ${i + 1}`}
              />
            )}
            <button
              type="button"
              className={styles.dice}
              onClick={() => set(i, randomSuggestion(collect.kind))}
              title="Suggest one"
              aria-label="Suggest one"
            >
              🎲
            </button>
          </li>
        ))}
      </ol>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <div className={styles.actions}>
        {onCancel && (
          <button type="button" className="pg-btn pg-btn-ghost" onClick={onCancel}>
            Cancel
          </button>
        )}
        <button type="submit" className="pg-btn pg-btn-primary pg-btn-lg">
          Drop them in ✓
        </button>
      </div>
    </form>
  );
}
