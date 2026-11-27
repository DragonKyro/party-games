import type { GameId, GameModule } from './types';
import { fishbowlModule } from '@/games/fishbowl';
import { foreheadModule } from '@/games/forehead';
import { sketchModule } from '@/games/sketch';
import { telephoneModule } from '@/games/telephone';
import { rankItModule } from '@/games/rank-it';
import { oddOneOutModule } from '@/games/odd-one-out';
import { tuneInModule } from '@/games/tune-in';
import { slideshowModule } from '@/games/slideshow';

// Central registry of every game module the app can play. The network layer
// looks modules up by id; the UI's catalog (src/ui/catalog.ts) adds the
// presentation side.
//
// Adding a game = a folder under `src/games/<id>/` implementing `GameModule`,
// an entry here, and an entry in the UI catalog. No conditionals elsewhere.
//
// `any` parameterisation is intentional: the engine layer is agnostic to
// per-game state shapes. Each module is typed inside its own directory.
//
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const GAMES: Record<GameId, GameModule<any, any, any>> = {
  fishbowl: fishbowlModule,
  forehead: foreheadModule,
  sketch: sketchModule,
  telephone: telephoneModule,
  'rank-it': rankItModule,
  'odd-one-out': oddOneOutModule,
  'tune-in': tuneInModule,
  slideshow: slideshowModule,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getGame(id: GameId): GameModule<any, any, any> {
  const mod = GAMES[id];
  if (!mod) throw new Error(`Unknown game id: ${id}`);
  return mod;
}
