import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import App from '@/App';
import { GAMES } from '@/engine/registry';
import type { GameId } from '@/engine/types';
import { useGameStore } from '@/store/gameStore';
import { useNetworkStore } from '@/store/networkStore';
import { CATALOG, GAME_ORDER } from './catalog';
import { launchLocal } from './setup/launch';

// App-level smoke tests: every game is in the catalog and registry, every
// setup screen (with its options panel) renders, and every game can start
// on a single device with its default options and render its first screen.

beforeEach(() => {
  window.localStorage.clear();
  useGameStore.getState().clearGame();
  useNetworkStore.getState().reset();
});
afterEach(() => {
  cleanup();
  useGameStore.getState().clearGame();
});

describe('catalog', () => {
  it('lists every registered game exactly once, with consistent ids', () => {
    expect([...GAME_ORDER].sort()).toEqual(Object.keys(GAMES).sort());
    for (const id of GAME_ORDER) {
      expect(CATALOG[id].meta.id).toBe(id);
      expect(GAMES[id].id).toBe(id);
      expect(CATALOG[id].meta.howTo.length).toBeGreaterThan(0);
      expect(Array.isArray(CATALOG[id].meta.summary(GAMES[id].defaultOptions()))).toBe(true);
    }
  });
});

// Lazy chunks compile on first use, which can be slow on a cold run.
describe('home → setup', { timeout: 20_000 }, () => {
  it.each(GAME_ORDER)('renders the %s setup screen and its options', async (id: GameId) => {
    render(<App />);
    fireEvent.click(screen.getAllByRole('button', { name: new RegExp(CATALOG[id].meta.title.replace(/[&]/g, '.')) })[0]!);
    expect(await screen.findByRole('heading', { level: 1, name: CATALOG[id].meta.title }, { timeout: 10_000 })).toBeTruthy();
    await waitFor(() => expect(screen.queryByText('Loading options…')).toBeNull(), { timeout: 10_000 });
  });
});

describe('single-device start', { timeout: 20_000 }, () => {
  it.each(GAME_ORDER)('%s starts with default options and renders', async (id: GameId) => {
    const mod = GAMES[id];
    if (CATALOG[id].meta.localPlay === 'none') return;
    const n = Math.max(mod.minPlayers, 4);
    const names = Array.from({ length: n }, (_, i) => `P${i + 1}`);
    act(() => launchLocal(id, names, mod.defaultOptions()));
    expect(useGameStore.getState().publicView?.gameId).toBe(id);
    render(<App />);
    // The lazy game view resolves and renders something inside the shell.
    await waitFor(() => expect(document.querySelector('main')).toBeTruthy());
    await waitFor(() => expect(screen.queryByText('Setting up the party…')).toBeNull(), { timeout: 10_000 });
  });
});
