import { Suspense, useState, type CSSProperties } from 'react';
import { getGame } from '@/engine/registry';
import type { GameId } from '@/engine/types';
import { inviteLink } from '@/net';
import type { LobbyState } from '@/net';
import { useNetworkStore } from '@/store/networkStore';
import { CATALOG, GAME_ORDER } from '../catalog';
import { loadOptions, saveOptions } from '../setup/launch';
import { ChatPanel } from '../shared/ChatPanel';
import { seatColor } from '../shared/hooks';
import { Modal } from '../shared/Modal';
import styles from './LobbyScreen.module.css';

// The online room. Everyone who joins sits down (open table); the host sees
// the room code + invite link, the players, the game and its options, and
// starts. Rooms outlive matches: after a game everyone lands back here and
// the host can pick the next one.

export function LobbyScreen() {
  const role = useNetworkStore((s) => s.role);
  const lobby = useNetworkStore((s) => s.lobby);
  const connection = useNetworkStore((s) => s.connection);
  const roomCode = useNetworkStore((s) => s.roomCode);
  const leaveRoom = useNetworkStore((s) => s.leaveRoom);
  const error = useNetworkStore((s) => s.error);
  const clearError = useNetworkStore((s) => s.clearError);

  if (connection === 'connecting' || !lobby) {
    return (
      <main className={styles.root}>
        <div className={`${styles.panel} ${styles.connecting}`}>
          <div className={styles.spinner} aria-hidden />
          <h2>{role === 'host' ? 'Opening your room…' : 'Joining the room…'}</h2>
          {roomCode && (
            <p className="pg-dim">
              Room <span className={styles.inlineCode}>{roomCode}</span>
            </p>
          )}
          <button className="pg-btn pg-btn-ghost" onClick={leaveRoom}>
            Cancel
          </button>
        </div>
      </main>
    );
  }

  const leave = () => {
    if (role === 'host' && typeof window.confirm === 'function' && !window.confirm('Close this room for everyone?')) {
      return;
    }
    leaveRoom();
  };

  const accent = CATALOG[lobby.gameId].meta.accent;

  return (
    <main className={styles.root} style={{ '--accent': accent } as CSSProperties}>
      <header className={styles.top}>
        <button className="pg-btn pg-btn-ghost pg-btn-sm" onClick={leave}>
          {role === 'host' ? 'Close room' : 'Leave'}
        </button>
        {roomCode && <RoomCode code={roomCode} />}
      </header>

      {error && (
        <div className={styles.error} role="alert">
          <span>{error}</span>
          <button onClick={clearError} aria-label="Dismiss">
            ✕
          </button>
        </div>
      )}

      <StatusBanners lobby={lobby} />

      <div className={styles.columns}>
        <div className={styles.mainCol}>
          <GameCard lobby={lobby} />
          <Players lobby={lobby} />
        </div>
        <aside className={styles.sideCol}>
          <section className={styles.panel}>
            <h3 className={styles.h3}>Chat</h3>
            <ChatPanel height={240} />
          </section>
          {roomCode && <BigScreen code={roomCode} />}
        </aside>
      </div>
    </main>
  );
}

function RoomCode({ code }: { code: string }) {
  const [copied, setCopied] = useState<'code' | 'link' | null>(null);
  const copy = async (what: 'code' | 'link') => {
    try {
      await navigator.clipboard.writeText(what === 'code' ? code : inviteLink(code));
      setCopied(what);
      setTimeout(() => setCopied(null), 1600);
    } catch {
      // Clipboard blocked: the code is on screen anyway.
    }
  };
  const share = async () => {
    const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
    if (nav.share) {
      try {
        await nav.share({ title: 'Join my party game', text: `Room code ${code}`, url: inviteLink(code) });
        return;
      } catch {
        // cancelled
      }
    }
    void copy('link');
  };
  return (
    <div className={styles.codeBlock}>
      <span className="pg-kicker">Room code</span>
      <div className={styles.code} aria-label={`Room code ${code.split('').join(' ')}`}>
        {code.split('').map((ch, i) => (
          <span key={i} style={{ '--i': i } as CSSProperties}>
            {ch}
          </span>
        ))}
      </div>
      <div className={styles.codeActions}>
        <button className="pg-btn pg-btn-sm" onClick={() => copy('code')}>
          {copied === 'code' ? 'Copied!' : 'Copy code'}
        </button>
        <button className="pg-btn pg-btn-sm pg-btn-primary" onClick={share}>
          {copied === 'link' ? 'Link copied!' : 'Share invite link'}
        </button>
      </div>
    </div>
  );
}

function BigScreen({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const link = `${inviteLink(code)}&watch`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard blocked.
    }
  };
  return (
    <section className={`${styles.panel} ${styles.note}`}>
      <h3 className={styles.h3}>📺 Big screen?</h3>
      <p className="pg-dim">
        Open this link on a TV or laptop to show the game to the whole room without taking a seat — great for
        Sketch &amp; Guess, Tune In and Slideshow Karaoke.
      </p>
      <button className="pg-btn pg-btn-sm" onClick={copy}>
        {copied ? 'Copied!' : 'Copy big-screen link'}
      </button>
    </section>
  );
}

function StatusBanners({ lobby }: { lobby: LobbyState }) {
  const role = useNetworkStore((s) => s.role);
  const hostUuid = useNetworkStore((s) => s.hostUuid);
  const onlinePeers = useNetworkStore((s) => s.onlinePeers);
  const linkUp = useNetworkStore((s) => s.linkUp);
  const matchHidden = useNetworkStore((s) => s.matchHidden);
  const resumeMatch = useNetworkStore((s) => s.resumeMatch);
  const hostOnline = !!hostUuid && (onlinePeers[hostUuid] ?? 0) > 0;
  return (
    <>
      {!linkUp && <div className={`${styles.banner} ${styles.bannerWarn}`}>Connection lost — reconnecting…</div>}
      {role !== 'host' && !hostOnline && linkUp && (
        <div className={`${styles.banner} ${styles.bannerWarn}`}>The host is offline. Everything resumes when they’re back.</div>
      )}
      {role !== 'host' && lobby.inGame && (
        <div className={styles.banner}>
          <span>A game is in progress.</span>
          {matchHidden && (
            <button className="pg-btn pg-btn-sm pg-btn-primary" onClick={resumeMatch}>
              Back to the game →
            </button>
          )}
        </div>
      )}
    </>
  );
}

// ----------------------------------------------------------------------------
// The game and its options
// ----------------------------------------------------------------------------

function GameCard({ lobby }: { lobby: LobbyState }) {
  const role = useNetworkStore((s) => s.role);
  const setLobbyGameId = useNetworkStore((s) => s.setLobbyGameId);
  const setLobbyOptions = useNetworkStore((s) => s.setLobbyOptions);
  const startGame = useNetworkStore((s) => s.startGame);
  const endMatch = useNetworkStore((s) => s.endMatch);
  const [picking, setPicking] = useState(false);
  const [editing, setEditing] = useState(false);
  const { meta, Art } = CATALOG[lobby.gameId];
  const mod = getGame(lobby.gameId);
  const isHost = role === 'host';
  const count = lobby.seats.length;
  const summary = meta.summary(lobby.gameOptions);
  const problem =
    count < mod.minPlayers
      ? `Waiting for players — ${meta.title} needs at least ${mod.minPlayers} (${count} so far).`
      : count > mod.maxPlayers
        ? `${meta.title} takes at most ${mod.maxPlayers} players.`
        : (mod.optionsProblem?.(lobby.gameOptions, count) ?? null);

  const pick = (id: GameId) => {
    setPicking(false);
    if (id !== lobby.gameId) setLobbyGameId(id, loadOptions(id));
  };

  return (
    <section className={`${styles.panel} ${styles.game}`}>
      <div className={styles.gameArt}>
        <Art />
      </div>
      <div className={styles.gameBody}>
        <span className="pg-kicker">{lobby.inGame ? 'Now playing' : 'Up next'}</span>
        <h1 className={styles.gameTitle}>{meta.title}</h1>
        <p className="pg-dim">{meta.tagline}</p>
        {summary.length > 0 && (
          <ul className={styles.summary}>
            {summary.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        )}
        {isHost && !lobby.inGame && (
          <div className={styles.gameActions}>
            <button className="pg-btn pg-btn-sm" onClick={() => setPicking(true)}>
              🔁 Change game
            </button>
            <button className="pg-btn pg-btn-sm" onClick={() => setEditing(true)}>
              ⚙️ Options
            </button>
          </div>
        )}
      </div>
      <footer className={styles.startRow}>
        {isHost ? (
          lobby.inGame ? (
            <button className="pg-btn pg-btn-ghost" onClick={endMatch}>
              End the running game
            </button>
          ) : (
            <>
              <button className="pg-btn pg-btn-primary pg-btn-xl" onClick={startGame} disabled={!!problem}>
                {lobby.match > 0 ? 'Play →' : 'Start the game →'}
              </button>
              {problem && <p className={styles.problem}>{problem}</p>}
            </>
          )
        ) : (
          !lobby.inGame && <p className="pg-dim">{problem ?? 'Waiting for the host to start…'}</p>
        )}
      </footer>

      {picking && (
        <Modal title="Pick the next game" onClose={() => setPicking(false)} wide>
          <div className={styles.pickGrid}>
            {GAME_ORDER.map((id) => {
              const e = CATALOG[id];
              const m = getGame(id);
              const fits = count >= m.minPlayers && count <= m.maxPlayers;
              return (
                <button
                  key={id}
                  className={`${styles.pick} ${id === lobby.gameId ? styles.pickOn : ''}`}
                  style={{ '--accent': e.meta.accent } as CSSProperties}
                  onClick={() => pick(id)}
                >
                  <span className={styles.pickArt}>
                    <e.Art />
                  </span>
                  <strong>{e.meta.title}</strong>
                  <small className={fits ? '' : styles.misfit}>👥 {e.meta.players}</small>
                </button>
              );
            })}
          </div>
        </Modal>
      )}
      {editing && (
        <Modal
          title={`${meta.title} options`}
          onClose={() => setEditing(false)}
          wide
          footer={
            <button className="pg-btn pg-btn-primary" onClick={() => setEditing(false)}>
              Done
            </button>
          }
        >
          <Suspense fallback={<p>Loading…</p>}>
            <OptionsEditor lobby={lobby} onChange={(o) => {
              setLobbyOptions(o);
              saveOptions(lobby.gameId, o);
            }} />
          </Suspense>
        </Modal>
      )}
    </section>
  );
}

function OptionsEditor({ lobby, onChange }: { lobby: LobbyState; onChange: (o: Record<string, unknown>) => void }) {
  const { Options } = CATALOG[lobby.gameId];
  return (
    <div className={styles.optionsWrap}>
      <Options value={lobby.gameOptions} onChange={onChange} playerCount={Math.max(2, lobby.seats.length)} online />
    </div>
  );
}

// ----------------------------------------------------------------------------
// Players
// ----------------------------------------------------------------------------

function Players({ lobby }: { lobby: LobbyState }) {
  const role = useNetworkStore((s) => s.role);
  const myUuid = useNetworkStore((s) => s.uuid);
  const hostUuid = useNetworkStore((s) => s.hostUuid);
  const onlinePeers = useNetworkStore((s) => s.onlinePeers);
  const present = useNetworkStore((s) => s.present);
  const removePlayer = useNetworkStore((s) => s.removePlayer);
  const movePlayer = useNetworkStore((s) => s.movePlayer);
  const takeSeat = useNetworkStore((s) => s.takeSeat);
  const standUp = useNetworkStore((s) => s.standUp);
  const displayName = useNetworkStore((s) => s.displayName);
  const setLocalName = useNetworkStore((s) => s.setLocalName);
  const isHost = role === 'host';
  const locked = lobby.inGame;
  const max = getGame(lobby.gameId).maxPlayers;
  const seated = new Set(lobby.seats.map((s) => s.uuid));
  const watchers = present.filter((p) => !seated.has(p.uid));
  const mine = lobby.seats.find((s) => s.uuid === myUuid);

  return (
    <section className={styles.panel}>
      <div className={styles.playersHead}>
        <h3 className={styles.h3}>
          Players <span className="pg-faint">· {lobby.seats.length}</span>
        </h3>
        <label className={styles.myName}>
          <span className="pg-sr-only">Your name</span>
          <input
            className="pg-input"
            value={displayName}
            onChange={(e) => setLocalName(e.target.value)}
            maxLength={20}
            placeholder="Your name"
          />
        </label>
      </div>
      <ol className={`${styles.seats} pg-stagger`}>
        {lobby.seats.map((seat, i) => {
          const online = !!seat.uuid && (onlinePeers[seat.uuid] ?? 0) > 0;
          const me = seat.uuid === myUuid;
          return (
            <li
              key={seat.uuid ?? i}
              className={`${styles.seat} ${me ? styles.seatMine : ''}`}
              style={{ '--i': i, '--c': seatColor(i) } as CSSProperties}
            >
              <span className={styles.avatar}>{(seat.name[0] ?? '?').toUpperCase()}</span>
              <span className={styles.seatName}>
                {seat.name}
                {seat.uuid === hostUuid && <span className={styles.tag}>host</span>}
                {me && <span className={`${styles.tag} ${styles.tagYou}`}>you</span>}
              </span>
              <span className={`${styles.dot} ${online ? styles.dotOn : ''}`} title={online ? 'Online' : 'Offline'} />
              {isHost && !locked && (
                <span className={styles.seatActions}>
                  <button onClick={() => movePlayer(i, -1)} disabled={i === 0} aria-label={`Move ${seat.name} up`}>
                    ↑
                  </button>
                  <button
                    onClick={() => movePlayer(i, 1)}
                    disabled={i === lobby.seats.length - 1}
                    aria-label={`Move ${seat.name} down`}
                  >
                    ↓
                  </button>
                  {seat.uuid !== myUuid && (
                    <button onClick={() => removePlayer(i)} aria-label={`Remove ${seat.name}`}>
                      ✕
                    </button>
                  )}
                </span>
              )}
            </li>
          );
        })}
      </ol>
      {watchers.length > 0 && (
        <p className={styles.watchers}>
          👀 Watching: {watchers.map((w) => w.name || 'Screen').join(', ')}
        </p>
      )}
      {!isHost && !locked && (
        <div className={styles.seatToggle}>
          {mine ? (
            <button className="pg-btn pg-btn-ghost pg-btn-sm" onClick={standUp}>
              Sit this one out
            </button>
          ) : lobby.seats.length < max ? (
            <button className="pg-btn pg-btn-primary pg-btn-sm" onClick={takeSeat}>
              Join the game
            </button>
          ) : (
            <span className="pg-faint">The table is full ({max}).</span>
          )}
        </div>
      )}
    </section>
  );
}
