import { useMemo } from 'react';
import { useNetworkStore } from '@/platform/store/networkStore';
import { useLobbyStore } from '@/platform/store/lobbyStore';
import { GAMES, getGame } from '@/platform/game/registry';
import type { GameSettingsBlob } from '@/platform/net/types';
import { Button } from './shared/Button';
import { RoomCode } from './shared/RoomCode';
import { PlayerList } from './shared/PlayerList';
import { Chat } from './chat/Chat';
import './LobbyScreen.css';

export function LobbyScreen() {
  const connection = useNetworkStore((s) => s.connection);
  const role = useNetworkStore((s) => s.role);
  const roomCode = useNetworkStore((s) => s.roomCode);
  const myUuid = useNetworkStore((s) => s.myUuid);
  const leave = useNetworkStore((s) => s.leave);
  const startSelectedGame = useNetworkStore((s) => s.startSelectedGame);
  const broadcastLobby = useNetworkStore((s) => s.broadcastLobby);

  const lobby = useLobbyStore((s) => s.lobby);
  const setSelectedGame = useLobbyStore((s) => s.setSelectedGame);
  const setGameSettings = useLobbyStore((s) => s.setGameSettings);

  const isHost = role === 'host' || role === 'solo';
  const selectedGame = useMemo(
    () => (lobby?.selectedGameId ? getGame(lobby.selectedGameId) : null),
    [lobby?.selectedGameId],
  );
  const currentSettings: GameSettingsBlob | undefined = lobby?.selectedGameId
    ? lobby.gameSettings[lobby.selectedGameId]
    : undefined;

  if (connection === 'connecting' || !lobby) {
    return (
      <div className="pg-lobby">
        <div className="pg-lobby-connecting">
          <p>Connecting to room {roomCode}…</p>
          <Button variant="ghost" onClick={leave}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  const seatCount = lobby.seats.length;
  const meetsMin =
    selectedGame != null && seatCount >= selectedGame.manifest.players.min;
  const meetsMax =
    selectedGame != null && seatCount <= selectedGame.manifest.players.max;
  const canStart = isHost && selectedGame != null && meetsMin && meetsMax;

  const onPickGame = (id: string) => {
    if (!isHost) return;
    setSelectedGame(id);
    broadcastLobby();
  };

  const onSettingsChange = (next: GameSettingsBlob) => {
    if (!isHost || !lobby.selectedGameId) return;
    setGameSettings(lobby.selectedGameId, next);
    broadcastLobby();
  };

  return (
    <div className="pg-lobby">
      <header className="pg-lobby-header">
        <h1>Lobby</h1>
        {role !== 'solo' && roomCode && <RoomCode code={roomCode} />}
        <Button variant="ghost" onClick={leave}>
          Leave
        </Button>
      </header>

      <div className="pg-lobby-grid">
        <section className="pg-lobby-pane">
          <h2>Players ({seatCount})</h2>
          <PlayerList
            seats={lobby.seats}
            hostUuid={lobby.hostUuid}
            myUuid={myUuid}
          />
        </section>

        <section className="pg-lobby-pane">
          <h2>Game</h2>
          {GAMES.length === 0 ? (
            <p className="pg-lobby-empty">
              No games available yet — add modules to{' '}
              <code>platform/game/registry.ts</code>.
            </p>
          ) : (
            <ul className="pg-lobby-game-list">
              {GAMES.map((g) => {
                const fits =
                  seatCount >= g.manifest.players.min &&
                  seatCount <= g.manifest.players.max;
                const selected = lobby.selectedGameId === g.manifest.id;
                return (
                  <li key={g.manifest.id}>
                    <button
                      type="button"
                      className={
                        'pg-lobby-game-tile' +
                        (selected ? ' pg-lobby-game-selected' : '') +
                        (fits ? '' : ' pg-lobby-game-misfit')
                      }
                      disabled={!isHost}
                      onClick={() => onPickGame(g.manifest.id)}
                    >
                      <span className="pg-lobby-game-name">{g.manifest.name}</span>
                      <span className="pg-lobby-game-tagline">
                        {g.manifest.tagline}
                      </span>
                      <span className="pg-lobby-game-meta">
                        {g.manifest.players.min}-{g.manifest.players.max} players
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {selectedGame && currentSettings && (
            <div className="pg-lobby-settings">
              <h3>{selectedGame.manifest.name} settings</h3>
              <selectedGame.manifest.SettingsPanel
                settings={currentSettings as never}
                onChange={(next) => onSettingsChange(next as GameSettingsBlob)}
                disabled={!isHost}
              />
            </div>
          )}

          {isHost && (
            <div className="pg-lobby-start">
              <Button
                size="lg"
                disabled={!canStart}
                onClick={startSelectedGame}
              >
                Start game
              </Button>
              {!selectedGame && (
                <span className="pg-lobby-hint">Pick a game above.</span>
              )}
              {selectedGame && !meetsMin && (
                <span className="pg-lobby-hint">
                  Need {selectedGame.manifest.players.min}+ players.
                </span>
              )}
              {selectedGame && !meetsMax && (
                <span className="pg-lobby-hint">
                  Max {selectedGame.manifest.players.max} players.
                </span>
              )}
            </div>
          )}
        </section>

        <section className="pg-lobby-pane pg-lobby-chat-pane">
          <h2>Chat</h2>
          <Chat />
        </section>
      </div>
    </div>
  );
}
