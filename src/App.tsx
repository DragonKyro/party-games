import { useNetworkStore } from '@/platform/store/networkStore';
import { useGameStore } from '@/platform/store/gameStore';
import { HomeMenu } from '@/platform/ui/HomeMenu';
import { LobbyScreen } from '@/platform/ui/LobbyScreen';
import { GameShell } from '@/platform/ui/GameShell';

export default function App() {
  const connection = useNetworkStore((s) => s.connection);
  const gameId = useGameStore((s) => s.gameId);

  // In-game view takes priority over the lobby.
  if (connection === 'in-game' && gameId) {
    return (
      <div className="app-root">
        <GameShell />
      </div>
    );
  }

  if (connection === 'lobby' || connection === 'connecting') {
    return (
      <div className="app-root">
        <LobbyScreen />
      </div>
    );
  }

  return (
    <div className="app-root">
      <HomeMenu />
    </div>
  );
}
