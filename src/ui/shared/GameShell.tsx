import { useState, type CSSProperties, type ReactNode } from 'react';
import type { GameId } from '@/engine/types';
import { useGameStore } from '@/store/gameStore';
import { useNetworkStore } from '@/store/networkStore';
import { CATALOG } from '../catalog';
import { Modal } from './Modal';
import { useSound } from './sfx';
import styles from './GameShell.module.css';

// The frame every game view sits in: a slim header (exit, title + status,
// a slot for the timer or round info, mute, how-to-play) over a full-height
// body. Sets the game's `--accent` for everything inside.
//
// `bare` hides the header (e.g. Forehead's held-up card, which needs every
// pixel); the game must then offer its own way out.

export function GameShell({
  gameId,
  status,
  right,
  children,
  bare = false,
  wide = false,
}: {
  gameId: GameId;
  /** Short status under the title ("Round 2 · Describe it"). */
  status?: ReactNode;
  /** Header right slot (usually a <Countdown size="sm" />). */
  right?: ReactNode;
  children: ReactNode;
  bare?: boolean;
  /** Allow the body to use the full width (drawing games, slides). */
  wide?: boolean;
}) {
  const meta = CATALOG[gameId].meta;
  const exitGame = useGameStore((s) => s.exitGame);
  const isHost = useGameStore((s) => s.isHost);
  const role = useNetworkStore((s) => s.role);
  const roomCode = useNetworkStore((s) => s.roomCode);
  const { muted, toggle } = useSound();
  const [help, setHelp] = useState(false);

  const exit = () => {
    if (role === 'solo') {
      const { module, privateState } = useGameStore.getState();
      const finished = !!module && privateState !== null && module.isFinished(privateState);
      if (!finished && typeof window.confirm === 'function' && !window.confirm('Quit this game?')) return;
    }
    exitGame();
  };

  const exitLabel = role === 'solo' ? 'Quit' : isHost ? 'End game' : 'Lobby';

  return (
    <div className={styles.root} style={{ '--accent': meta.accent } as CSSProperties}>
      {!bare && (
        <header className={styles.header}>
          <button className={styles.iconBtn} onClick={exit} aria-label={exitLabel} title={exitLabel}>
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
              <path d="M15 5 8 12l7 7" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <div className={styles.titles}>
            <span className={styles.title}>{meta.title}</span>
            {status && <span className={styles.status}>{status}</span>}
          </div>
          <div className={styles.right}>
            {right}
            {roomCode && role !== 'solo' && <span className={styles.code} title="Room code">{roomCode}</span>}
            <button className={styles.iconBtn} onClick={toggle} aria-label={muted ? 'Unmute' : 'Mute'} title={muted ? 'Unmute' : 'Mute'}>
              {muted ? '🔇' : '🔊'}
            </button>
            <button className={styles.iconBtn} onClick={() => setHelp(true)} aria-label="How to play" title="How to play">
              ?
            </button>
          </div>
        </header>
      )}
      <main className={`${styles.body} ${wide ? styles.wide : ''}`}>{children}</main>
      {help && (
        <Modal title={`How to play ${meta.title}`} onClose={() => setHelp(false)}>
          <ul className={styles.howTo}>
            {meta.howTo.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        </Modal>
      )}
    </div>
  );
}
