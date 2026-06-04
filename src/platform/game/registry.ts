import type { GameModule } from './types';

// Game registry. Add a `GameModule` here to surface it in the home picker
// and lobby. Each game lives under `src/games/<id>/` and exports a default
// module from its `index.ts`.
//
// Kept empty for now — games are added as we build them.
export const GAMES: ReadonlyArray<GameModule> = [];

export function getGame(id: string): GameModule | undefined {
  return GAMES.find((g) => g.manifest.id === id);
}
