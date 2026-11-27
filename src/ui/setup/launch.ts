import { getGame } from '@/engine/registry';
import { randomSeed } from '@/engine/rng';
import type { GameConfig, GameId } from '@/engine/types';
import { serverNow } from '@/store/clock';
import { useGameStore } from '@/store/gameStore';
import { useNetworkStore } from '@/store/networkStore';
import { resolveLists } from '@/words/library';

// Start a game on this device (single-device table) or open an online room.

/** Start locally. Throws (with a readable message) if the game can't start. */
export function launchLocal(gameId: GameId, names: string[], options: Record<string, unknown>): void {
  const module = getGame(gameId);
  const seats = names.map((n, i) => ({ index: i, uuid: null, name: n.trim() || `Player ${i + 1}` }));
  const config: GameConfig = {
    gameId,
    seats,
    seed: randomSeed(),
    now: serverNow(),
    gameOptions: options,
    lists: resolveLists(options),
  };
  const state = module.createInitialState(config);
  // The shared screen starts on the public (seat-null) view; games show a
  // pass-the-phone cover before anything secret.
  useGameStore.getState().startLocalGame(module, state, null, { config });
}

export function launchOnline(gameId: GameId, options: Record<string, unknown>): void {
  void useNetworkStore.getState().hostRoom(gameId, options);
}

// Remember the last-used options per game and the last local player list.

const OPTIONS_KEY = (id: GameId) => `party-games.options.${id}`;
const NAMES_KEY = 'party-games.localNames';

function store(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function loadOptions(gameId: GameId): Record<string, unknown> {
  const defaults = getGame(gameId).defaultOptions();
  try {
    const raw = store()?.getItem(OPTIONS_KEY(gameId));
    const saved = raw ? (JSON.parse(raw) as unknown) : null;
    if (saved && typeof saved === 'object' && !Array.isArray(saved)) return { ...defaults, ...saved };
  } catch {
    // fall through
  }
  return defaults;
}

export function saveOptions(gameId: GameId, options: Record<string, unknown>): void {
  try {
    store()?.setItem(OPTIONS_KEY(gameId), JSON.stringify(options));
  } catch {
    // not persisted
  }
}

export function loadLocalNames(): string[] {
  try {
    const raw = store()?.getItem(NAMES_KEY);
    const v = raw ? (JSON.parse(raw) as unknown) : null;
    if (Array.isArray(v) && v.every((x) => typeof x === 'string') && v.length > 0) return v.slice(0, 20);
  } catch {
    // fall through
  }
  return ['', '', '', ''];
}

export function saveLocalNames(names: string[]): void {
  try {
    store()?.setItem(NAMES_KEY, JSON.stringify(names));
  } catch {
    // not persisted
  }
}
