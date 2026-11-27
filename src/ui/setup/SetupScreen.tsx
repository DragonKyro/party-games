import { Suspense, useEffect, useState, type CSSProperties } from 'react';
import { getGame } from '@/engine/registry';
import type { GameId } from '@/engine/types';
import { useNetworkStore } from '@/store/networkStore';
import { CATALOG } from '../catalog';
import { launchLocal, launchOnline, loadLocalNames, loadOptions, saveLocalNames, saveOptions } from './launch';
import styles from './SetupScreen.module.css';

// One setup screen for every game: the game's hero + rules, where to play
// (an online room, or one device passed around), the local player list, and
// the game's own options panel (`src/games/<id>/ui/Options.tsx`).

type Where = 'online' | 'local';

export function SetupScreen({ gameId, onBack }: { gameId: GameId; onBack: () => void }) {
  const { meta, Art, Options } = CATALOG[gameId];
  const mod = getGame(gameId);
  const [options, setOptions] = useState<Record<string, unknown>>(() => loadOptions(gameId));
  const [where, setWhere] = useState<Where>('online');
  const [names, setNames] = useState<string[]>(() => {
    const n = loadLocalNames();
    while (n.length < mod.minPlayers) n.push('');
    return n.slice(0, mod.maxPlayers);
  });
  const [error, setError] = useState<string | null>(null);
  const displayName = useNetworkStore((s) => s.displayName);
  const setLocalName = useNetworkStore((s) => s.setLocalName);

  useEffect(() => saveOptions(gameId, options), [gameId, options]);
  useEffect(() => saveLocalNames(names), [names]);

  const playerCount = where === 'local' ? names.length : Math.max(mod.minPlayers, 4);
  const problem =
    where === 'local'
      ? names.length < mod.minPlayers
        ? `Add at least ${mod.minPlayers} players.`
        : (mod.optionsProblem?.(options, names.length) ?? null)
      : !displayName.trim()
        ? 'Add your name so friends know whose room it is.'
        : null;

  const start = () => {
    setError(null);
    if (problem) return;
    if (where === 'online') {
      launchOnline(gameId, options);
      return;
    }
    try {
      launchLocal(
        gameId,
        names.map((n, i) => n.trim() || `Player ${i + 1}`),
        options,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <main className={styles.root} style={{ '--accent': meta.accent } as CSSProperties}>
      <button className={`pg-btn pg-btn-ghost pg-btn-sm ${styles.back}`} onClick={onBack}>
        ← All games
      </button>

      <header className={styles.hero}>
        <div className={styles.art}>
          <Art />
        </div>
        <div className={styles.heroText}>
          <h1 className={styles.title}>{meta.title}</h1>
          <p className={styles.tagline}>{meta.tagline}</p>
          <div className={styles.chips}>
            <span className="pg-chip">👥 {meta.players} players</span>
            <span className="pg-chip">⏱ {meta.duration}</span>
          </div>
        </div>
      </header>

      <section className={styles.card}>
        <h2 className={styles.h2}>How to play</h2>
        <ul className={styles.howTo}>
          {meta.howTo.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      </section>

      <section className={styles.card}>
        <h2 className={styles.h2}>Where are you playing?</h2>
        <div className={styles.where} role="radiogroup" aria-label="Where to play">
          <button
            type="button"
            role="radio"
            aria-checked={where === 'online'}
            className={`${styles.whereOpt} ${where === 'online' ? styles.on : ''}`}
            onClick={() => setWhere('online')}
          >
            <span className={styles.whereIcon}>📲</span>
            <strong>Everyone on their own phone</strong>
            <small>Host a room; friends join with a code or link. Works in the same room or over a video call.</small>
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={where === 'local'}
            className={`${styles.whereOpt} ${where === 'local' ? styles.on : ''}`}
            onClick={() => meta.localPlay !== 'none' && setWhere('local')}
            disabled={meta.localPlay === 'none'}
          >
            <span className={styles.whereIcon}>{meta.localPlay === 'shared' ? '🖥️' : '🤲'}</span>
            <strong>One device for everyone</strong>
            <small>{meta.localNote}</small>
          </button>
        </div>

        {where === 'online' ? (
          <label className={styles.nameRow}>
            <span className="pg-kicker">Your name</span>
            <input
              className="pg-input"
              value={displayName}
              onChange={(e) => setLocalName(e.target.value)}
              maxLength={20}
              placeholder="Host name"
            />
          </label>
        ) : (
          <PlayerList names={names} setNames={setNames} min={mod.minPlayers} max={mod.maxPlayers} />
        )}
      </section>

      <Suspense fallback={<div className={styles.card}>Loading options…</div>}>
        <div className={styles.options}>
          <Options value={options} onChange={setOptions} playerCount={playerCount} online={where === 'online'} />
        </div>
      </Suspense>

      <footer className={styles.footer}>
        {(problem || error) && <p className={styles.problem}>{error ?? problem}</p>}
        <button className="pg-btn pg-btn-primary pg-btn-xl" onClick={start} disabled={!!problem}>
          {where === 'online' ? 'Open a room →' : 'Start →'}
        </button>
        {where === 'online' && <p className="pg-faint">You can change the game and options in the room, too.</p>}
      </footer>
    </main>
  );
}

function PlayerList({
  names,
  setNames,
  min,
  max,
}: {
  names: string[];
  setNames: (fn: (cur: string[]) => string[]) => void;
  min: number;
  max: number;
}) {
  return (
    <div className={styles.players}>
      <div className={styles.playersHead}>
        <span className="pg-kicker">
          Players · {names.length} <span className="pg-faint">({min}–{max})</span>
        </span>
      </div>
      <ol className={styles.playerList}>
        {names.map((n, i) => (
          <li key={i} className={styles.playerRow}>
            <span className={styles.playerNo}>{i + 1}</span>
            <input
              className="pg-input"
              value={n}
              onChange={(e) => setNames((cur) => cur.map((x, j) => (j === i ? e.target.value : x)))}
              placeholder={`Player ${i + 1}`}
              maxLength={20}
              aria-label={`Player ${i + 1} name`}
            />
            <button
              type="button"
              className={styles.remove}
              onClick={() => setNames((cur) => cur.filter((_, j) => j !== i))}
              disabled={names.length <= min}
              aria-label={`Remove player ${i + 1}`}
            >
              ✕
            </button>
          </li>
        ))}
      </ol>
      <button
        type="button"
        className="pg-btn pg-btn-ghost pg-btn-sm"
        onClick={() => setNames((cur) => [...cur, ''])}
        disabled={names.length >= max}
      >
        + Add player
      </button>
    </div>
  );
}
