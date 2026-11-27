// Presentation metadata each game exports from `src/games/<id>/meta.ts`.
// Plain data (no React) so the home menu, setup screen and lobby can show a
// game without loading its engine or UI chunk.

import type { GameId } from './types';

export interface GameMeta {
  id: GameId;
  title: string;
  /** One line for the home tile. */
  tagline: string;
  /** e.g. "4–20". */
  players: string;
  /** Approximate length, e.g. "20–40 min". */
  duration: string;
  /** Accent colour (CSS) used for the game's tile, header and buttons. */
  accent: string;
  /** Rules summary, a few short bullets. */
  howTo: string[];
  /**
   * Can it be played on one device?
   *   'pass'   — yes, the device is handed to whoever needs to see a secret
   *   'shared' — yes, everyone looks at one screen (no secrets, or one holder)
   *   'none'   — needs a device per player
   */
  localPlay: 'pass' | 'shared' | 'none';
  /** One line explaining how single-device play works (or why it can't). */
  localNote: string;
  /** Short lines describing chosen options, for guests in the lobby. */
  summary: (options: Record<string, unknown>) => string[];
}
