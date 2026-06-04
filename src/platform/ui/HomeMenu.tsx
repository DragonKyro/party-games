import { useState } from 'react';
import { useNetworkStore } from '@/platform/store/networkStore';
import { GAMES } from '@/platform/game/registry';
import { Button } from './shared/Button';
import { TextField } from './shared/TextField';
import './HomeMenu.css';

export function HomeMenu() {
  const displayName = useNetworkStore((s) => s.displayName);
  const setDisplayName = useNetworkStore((s) => s.setDisplayName);
  const host = useNetworkStore((s) => s.host);
  const join = useNetworkStore((s) => s.join);
  const [code, setCode] = useState('');

  return (
    <div className="pg-home">
      <header className="pg-home-header">
        <h1>Party Games</h1>
        <p>Fishbowl, HeadsUp, Spyfall, Telestrations, Wavelength, and more.</p>
      </header>

      <section className="pg-home-card">
        <TextField
          label="Your name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Player"
          maxLength={24}
        />
        <div className="pg-home-actions">
          <Button
            size="lg"
            disabled={!displayName.trim()}
            onClick={() => void host()}
          >
            Host a room
          </Button>
          <form
            className="pg-home-join"
            onSubmit={(e) => {
              e.preventDefault();
              if (!displayName.trim() || !code.trim()) return;
              void join(code.trim());
            }}
          >
            <TextField
              label="Or join with code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="ABCD"
              maxLength={6}
              style={{ textTransform: 'uppercase' }}
            />
            <Button
              variant="secondary"
              size="lg"
              type="submit"
              disabled={!displayName.trim() || !code.trim()}
            >
              Join
            </Button>
          </form>
        </div>
      </section>

      <section className="pg-home-games">
        <h2>Games</h2>
        {GAMES.length === 0 ? (
          <p className="pg-home-empty">
            No games installed yet. Drop a <code>GameModule</code> into{' '}
            <code>src/games/</code> and register it in{' '}
            <code>platform/game/registry.ts</code>.
          </p>
        ) : (
          <ul className="pg-home-game-grid">
            {GAMES.map((g) => (
              <li key={g.manifest.id} className="pg-home-game-tile">
                {g.manifest.icon && (
                  <span className="pg-home-game-icon">{g.manifest.icon}</span>
                )}
                <h3>{g.manifest.name}</h3>
                <p>{g.manifest.tagline}</p>
                <span className="pg-home-game-meta">
                  {g.manifest.players.min}-{g.manifest.players.max} players
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
