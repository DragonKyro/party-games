// Props contracts between the shared shell and each game's UI.

/** Every game's `ui/Options.tsx` default-exports a component taking these. */
export interface OptionsProps<O = Record<string, unknown>> {
  value: O;
  onChange: (next: O) => void;
  /** Players at the table (the local name list, or the lobby's seats). */
  playerCount: number;
  /** True for an online room, false for a single-device table. */
  online: boolean;
}

/** Every game's `ui/TileArt.tsx` exports a component taking these. */
export interface TileArtProps {
  className?: string;
}
