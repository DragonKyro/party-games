import { useState, type CSSProperties } from 'react';
import type { GameId } from '@/engine/types';
import { normalizeRoomCode } from '@/net';
import { useNetworkStore } from '@/store/networkStore';
import { CATALOG, GAME_ORDER } from '../catalog';
import { SetupScreen } from '../setup/SetupScreen';
import styles from './HomeMenu.module.css';

// The front door: your name, join a friend's room by code, or pick a game
// (→ its setup screen, where you choose one device or an online room).

export function HomeMenu() {
  const [picked, setPicked] = useState<GameId | null>(null);
  if (picked) return <SetupScreen gameId={picked} onBack={() => setPicked(null)} />;

  return (
    <main className={styles.root}>
      <header className={styles.hero}>
        <Logo />
        <h1 className={styles.title}>
          Party <span>Games</span>
        </h1>
        <p className={styles.tagline}>Word games for a room full of friends. Bring your own words.</p>
        <JoinBox />
      </header>

      <section aria-labelledby="games-title">
        <h2 id="games-title" className={styles.sectionTitle}>
          Pick a game
        </h2>
        <div className={`${styles.grid} pg-stagger`}>
          {GAME_ORDER.map((id, i) => {
            const { meta, Art } = CATALOG[id];
            return (
              <button
                key={id}
                className={styles.tile}
                onClick={() => setPicked(id)}
                style={{ '--i': i, '--accent': meta.accent } as CSSProperties}
              >
                <div className={styles.art}>
                  <Art />
                </div>
                <div className={styles.info}>
                  <span className={styles.name}>{meta.title}</span>
                  <span className={styles.blurb}>{meta.tagline}</span>
                  <span className={styles.chips}>
                    <span className="pg-chip">👥 {meta.players}</span>
                    <span className="pg-chip">⏱ {meta.duration}</span>
                    {meta.localPlay !== 'none' && <span className="pg-chip">📱 one device OK</span>}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <footer className={styles.footer}>
        Everyone on their own phone, or pass one device around. Use the built-in word packs, your own saved lists, or
        have everyone write their own.
      </footer>
    </main>
  );
}

function Logo() {
  return (
    <svg className={styles.logo} viewBox="0 0 120 90" aria-hidden>
      <rect x="18" y="14" width="34" height="44" rx="6" fill="#ff6b6b" transform="rotate(-14 35 36)" />
      <rect x="44" y="8" width="34" height="44" rx="6" fill="#ffc93c" transform="rotate(2 61 30)" />
      <rect x="70" y="14" width="34" height="44" rx="6" fill="#4cc9f0" transform="rotate(15 87 36)" />
      <text x="34" y="44" fontSize="22" textAnchor="middle" fontFamily="Fredoka, sans-serif" fontWeight="700" fill="#2a0d14" transform="rotate(-14 35 36)">
        A
      </text>
      <text x="61" y="38" fontSize="22" textAnchor="middle" fontFamily="Fredoka, sans-serif" fontWeight="700" fill="#2b2000">
        B
      </text>
      <text x="88" y="44" fontSize="22" textAnchor="middle" fontFamily="Fredoka, sans-serif" fontWeight="700" fill="#0a2430" transform="rotate(15 87 36)">
        C
      </text>
      <path d="M16 74c14 10 74 10 88 0" fill="none" stroke="#06d6a0" strokeWidth="6" strokeLinecap="round" />
    </svg>
  );
}

function JoinBox() {
  const [code, setCode] = useState('');
  const name = useNetworkStore((s) => s.displayName);
  const setLocalName = useNetworkStore((s) => s.setLocalName);
  const joinRoom = useNetworkStore((s) => s.joinRoom);
  const error = useNetworkStore((s) => s.error);
  const clearError = useNetworkStore((s) => s.clearError);
  const hostElsewhere = useNetworkStore((s) => s.hostElsewhere);
  const [watch, setWatch] = useState(false);
  const valid = normalizeRoomCode(code) !== null;
  const named = name.trim().length > 0 || watch;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || !named) return;
    void joinRoom(code, { watch });
  };

  return (
    <form className={styles.join} onSubmit={submit}>
      <label className={styles.field}>
        <span className="pg-kicker">Your name</span>
        <input
          className="pg-input"
          value={name}
          onChange={(e) => setLocalName(e.target.value)}
          maxLength={20}
          placeholder="What should we call you?"
          aria-label="Your name"
          autoComplete="nickname"
        />
      </label>
      <label className={styles.field}>
        <span className="pg-kicker">Got a room code?</span>
        <div className={styles.codeRow}>
          <input
            className={`pg-input ${styles.code}`}
            value={code}
            onChange={(e) => {
              setCode(e.target.value.toUpperCase());
              if (error) clearError();
            }}
            maxLength={8}
            placeholder="CODE"
            aria-label="Room code"
            autoCapitalize="characters"
            spellCheck={false}
          />
          <button type="submit" className="pg-btn pg-btn-primary" disabled={!valid || !named}>
            Join →
          </button>
        </div>
      </label>
      <label className={styles.watch}>
        <input type="checkbox" checked={watch} onChange={(e) => setWatch(e.target.checked)} />
        Join as a shared screen (TV / laptop) — watch without a seat
      </label>
      {!named && valid && <p className={styles.hint}>Add your name first.</p>}
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      {hostElsewhere && (
        <div className={styles.elsewhere} role="alert">
          <p>
            You’re already hosting room <b>{hostElsewhere}</b> in another tab or window of this browser. Switch to that
            one — or close it and open the room here.
          </p>
          <div className={styles.elsewhereActions}>
            <button type="button" className="pg-btn pg-btn-sm pg-btn-primary" onClick={() => void joinRoom(hostElsewhere, { takeover: true })}>
              Open it here
            </button>
            <button type="button" className="pg-btn pg-btn-sm pg-btn-ghost" onClick={clearError}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </form>
  );
}
