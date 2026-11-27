import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import type { GameMeta } from '@/engine/meta';
import type { GameId } from '@/engine/types';
import { meta as fishbowl } from '@/games/fishbowl/meta';
import { TileArt as FishbowlArt } from '@/games/fishbowl/ui/TileArt';
import { meta as forehead } from '@/games/forehead/meta';
import { TileArt as ForeheadArt } from '@/games/forehead/ui/TileArt';
import { meta as oddOneOut } from '@/games/odd-one-out/meta';
import { TileArt as OddOneOutArt } from '@/games/odd-one-out/ui/TileArt';
import { meta as rankIt } from '@/games/rank-it/meta';
import { TileArt as RankItArt } from '@/games/rank-it/ui/TileArt';
import { meta as sketch } from '@/games/sketch/meta';
import { TileArt as SketchArt } from '@/games/sketch/ui/TileArt';
import { meta as slideshow } from '@/games/slideshow/meta';
import { TileArt as SlideshowArt } from '@/games/slideshow/ui/TileArt';
import { meta as telephone } from '@/games/telephone/meta';
import { TileArt as TelephoneArt } from '@/games/telephone/ui/TileArt';
import { meta as tuneIn } from '@/games/tune-in/meta';
import { TileArt as TuneInArt } from '@/games/tune-in/ui/TileArt';
import type { OptionsProps, TileArtProps } from './shared/types';

// The UI side of the game registry. Meta and tile art are small and loaded
// up front (home menu); each game's options panel and game view are their
// own lazy chunks, downloaded when that game is picked / started.

export interface CatalogEntry {
  meta: GameMeta;
  Art: ComponentType<TileArtProps>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Options: LazyExoticComponent<ComponentType<OptionsProps<any>>>;
  View: LazyExoticComponent<ComponentType>;
}

export const CATALOG: Record<GameId, CatalogEntry> = {
  fishbowl: {
    meta: fishbowl,
    Art: FishbowlArt,
    Options: lazy(() => import('@/games/fishbowl/ui/Options')),
    View: lazy(() => import('@/games/fishbowl/ui/GameView')),
  },
  forehead: {
    meta: forehead,
    Art: ForeheadArt,
    Options: lazy(() => import('@/games/forehead/ui/Options')),
    View: lazy(() => import('@/games/forehead/ui/GameView')),
  },
  sketch: {
    meta: sketch,
    Art: SketchArt,
    Options: lazy(() => import('@/games/sketch/ui/Options')),
    View: lazy(() => import('@/games/sketch/ui/GameView')),
  },
  telephone: {
    meta: telephone,
    Art: TelephoneArt,
    Options: lazy(() => import('@/games/telephone/ui/Options')),
    View: lazy(() => import('@/games/telephone/ui/GameView')),
  },
  'rank-it': {
    meta: rankIt,
    Art: RankItArt,
    Options: lazy(() => import('@/games/rank-it/ui/Options')),
    View: lazy(() => import('@/games/rank-it/ui/GameView')),
  },
  'odd-one-out': {
    meta: oddOneOut,
    Art: OddOneOutArt,
    Options: lazy(() => import('@/games/odd-one-out/ui/Options')),
    View: lazy(() => import('@/games/odd-one-out/ui/GameView')),
  },
  'tune-in': {
    meta: tuneIn,
    Art: TuneInArt,
    Options: lazy(() => import('@/games/tune-in/ui/Options')),
    View: lazy(() => import('@/games/tune-in/ui/GameView')),
  },
  slideshow: {
    meta: slideshow,
    Art: SlideshowArt,
    Options: lazy(() => import('@/games/slideshow/ui/Options')),
    View: lazy(() => import('@/games/slideshow/ui/GameView')),
  },
};

/** Home-menu order. */
export const GAME_ORDER: GameId[] = [
  'fishbowl',
  'sketch',
  'forehead',
  'telephone',
  'rank-it',
  'odd-one-out',
  'tune-in',
  'slideshow',
];
