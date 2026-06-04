import { useGameStore } from '@/platform/store/gameStore';
import { useNetworkStore } from '@/platform/store/networkStore';
import { Button } from './shared/Button';
import { Chat } from './chat/Chat';
import './GameShell.css';

export function GameShell() {
  const module = useGameStore((s) => s.module);
  const state = useGameStore((s) => s.state);
  const gameId = useGameStore((s) => s.gameId);
  const leave = useNetworkStore((s) => s.leave);

  if (!module || state == null || !gameId) {
    return (
      <div className="pg-game-shell">
        <p>Loading game…</p>
      </div>
    );
  }

  const GameScreen = module.GameScreen;

  return (
    <div className="pg-game-shell">
      <header className="pg-game-shell-header">
        <span className="pg-game-shell-title">{module.manifest.name}</span>
        <Button variant="ghost" size="sm" onClick={leave}>
          Leave
        </Button>
      </header>
      <div className="pg-game-shell-body">
        <main className="pg-game-shell-main">
          <GameScreen />
        </main>
        <aside className="pg-game-shell-side">
          <Chat />
        </aside>
      </div>
    </div>
  );
}
