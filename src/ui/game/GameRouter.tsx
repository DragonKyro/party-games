import { Suspense } from 'react';
import { useGameStore } from '@/store/gameStore';
import { CATALOG } from '../catalog';

// Per-game UIs live under `src/games/<id>/ui/GameView.tsx`; the catalog
// lazy-loads each as its own chunk. This is the only switch on game id in
// the UI layer.

function Loading() {
  return (
    <main style={{ display: 'grid', placeItems: 'center', minHeight: '60vh', color: 'var(--text-dim)' }}>
      <div className="pg-fade-in pg-pulse" style={{ fontWeight: 800 }}>
        Setting up the party…
      </div>
    </main>
  );
}

export function GameRouter() {
  const gameId = useGameStore((s) => s.publicView?.gameId ?? null);
  if (!gameId) return <main style={{ padding: 24 }}>No active game.</main>;
  const entry = CATALOG[gameId];
  if (!entry) return <main style={{ padding: 24 }}>Unknown game: {gameId}</main>;
  const View = entry.View;
  return (
    <Suspense fallback={<Loading />}>
      <View />
    </Suspense>
  );
}
