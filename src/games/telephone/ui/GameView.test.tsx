import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameConfig } from '@/engine/types';
import { useGameStore } from '@/store/gameStore';
import { useNetworkStore } from '@/store/networkStore';
import { telephoneModule } from '../module';
import { bookHeldBy } from '../rules';
import type { TelephoneState } from '../state';
import GameView from './GameView';
import Options from './Options';
import { TileArt } from './TileArt';

// UI flows: on one device every page sits behind a PassScreen rendered
// INSTEAD of it, the roster loop collects each step, the reveal is shared;
// online a seat draws on its own phone and the buzzer hands the page in.

const NAMES = ['Ana', 'Ben', 'Cai'];

function makeConfig(online: boolean, options: Record<string, unknown> = {}): GameConfig {
  return {
    gameId: 'telephone',
    seats: NAMES.map((name, index) => ({ index, uuid: online ? `uid-${index}` : null, name })),
    seed: 7,
    now: Date.now(),
    gameOptions: { ...telephoneModule.defaultOptions(), ...options },
    lists: {},
  };
}

function startLocal(options: Record<string, unknown> = {}): TelephoneState {
  const config = makeConfig(false, options);
  const state = telephoneModule.createInitialState(config);
  act(() => useGameStore.getState().startLocalGame(telephoneModule, state, null, { config }));
  return state;
}

const host = () => useGameStore.getState().privateState as TelephoneState;
const text = () => document.body.textContent ?? '';
const claim = (name: string) => {
  fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${name}`) }));
  expect(screen.getByText('Pass the device to')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: new RegExp(`I'm ${name}`) }));
};

beforeEach(() => {
  window.localStorage.clear();
  useGameStore.getState().clearGame();
  useNetworkStore.getState().reset();
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});
afterEach(() => {
  cleanup();
  useGameStore.getState().clearGame();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('single device', () => {
  it('runs prompts, steps, reveal and results with every page behind a cover', () => {
    const s0 = startLocal();
    render(<GameView />);
    const all = s0.choices.flat();
    for (const t of all) expect(text()).not.toContain(t);

    // Step 0: each player picks in private.
    for (const [i, name] of NAMES.entries()) {
      fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${name}`) }));
      for (const t of all) expect(text()).not.toContain(t);
      fireEvent.click(screen.getByRole('button', { name: new RegExp(`I'm ${name}`) }));
      for (const t of s0.choices[i]!) expect(text()).toContain(t);
      for (const t of s0.choices[(i + 1) % 3]!) expect(text()).not.toContain(t);
      fireEvent.click(screen.getByRole('button', { name: s0.choices[i]![i]! }));
      expect(useGameStore.getState().localSeat).toBeNull();
    }
    expect(host().phase).toBe('step');
    const prompts = host().books.map((b) => (b.pages[0] as { text: string }).text);
    for (const p of prompts) expect(text()).not.toContain(p);

    // Step 1: draw. Ana holds Cai's book.
    claim('Ana');
    expect(text()).toContain(prompts[bookHeldBy(0, 1, 3)]!);
    for (const b of [0, 1]) expect(text()).not.toContain(prompts[b]!);
    fireEvent.click(screen.getByRole('button', { name: /Pass it on/ }));
    expect(useGameStore.getState().localSeat).toBeNull();
    for (const p of prompts) expect(text()).not.toContain(p);
    for (const name of ['Ben', 'Cai']) {
      claim(name);
      fireEvent.click(screen.getByRole('button', { name: /Pass it on/ }));
    }
    expect(host().stepIndex).toBe(2);

    // Step 2: guess.
    for (const [i, name] of NAMES.entries()) {
      claim(name);
      expect(screen.getByRole('img', { name: 'The drawing to guess' })).toBeTruthy();
      fireEvent.change(screen.getByLabelText('Your guess'), { target: { value: `guess ${i}` } });
      fireEvent.click(screen.getByRole('button', { name: /Pass it on/ }));
    }
    expect(host().phase).toBe('reveal');

    // The reveal: one screen, the device turns the pages, names heart pages.
    expect(useGameStore.getState().localSeat).toBeNull();
    expect(text()).toContain('’s sketchbook');
    expect(text()).toContain(prompts[0]!);
    expect(text()).not.toContain(prompts[1]!);
    fireEvent.click(screen.getByRole('button', { name: /Next page/ }));
    expect(host().reveal!.shown).toBe(2);
    // Page 1 of Ana's book is Ben's drawing: Ana and Cai may heart it, Ben may not.
    expect(screen.queryByRole('button', { name: 'Ben', pressed: false })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Cai', pressed: false }));
    expect(host().books[0]!.pages[1]!.hearts).toEqual([2]);
    fireEvent.click(screen.getByRole('button', { name: /Next page/ }));
    expect(text()).toContain('guess 2');
    fireEvent.click(screen.getByRole('button', { name: /Next book/ }));
    fireEvent.click(screen.getByRole('button', { name: /Next page/ }));
    fireEvent.click(screen.getByRole('button', { name: /Next page/ }));
    fireEvent.click(screen.getByRole('button', { name: /Next book/ }));
    fireEvent.click(screen.getByRole('button', { name: /Next page/ }));
    fireEvent.click(screen.getByRole('button', { name: /Next page/ }));
    fireEvent.click(screen.getByRole('button', { name: /See the results/ }));

    expect(host().phase).toBe('gameOver');
    expect(text()).toContain('Ben stole the show!');
    expect(text()).toContain('Crowd favorite');
    fireEvent.click(screen.getAllByRole('button', { name: 'Open' })[1]!);
    expect(host().browseShared).toBe(1);
    expect(screen.getByRole('button', { name: 'Close' })).toBeTruthy();
  });

  it('players can write their own prompts', () => {
    startLocal({ words: { packs: [], listIds: [], perPlayer: 1 } });
    render(<GameView />);
    expect(text()).toContain('Start your sketchbook');
    for (const [i, name] of NAMES.entries()) {
      fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${name}`) }));
      fireEvent.click(screen.getByRole('button', { name: new RegExp(`I'm ${name}`) }));
      fireEvent.change(screen.getByLabelText('Entry 1'), { target: { value: `My prompt ${i}` } });
      fireEvent.click(screen.getByRole('button', { name: /Drop them in/ }));
    }
    expect(host().phase).toBe('step');
    expect(host().books.map((b) => (b.pages[0] as { text: string }).text)).toEqual(['My prompt 0', 'My prompt 1', 'My prompt 2']);
    expect(text()).not.toContain('My prompt');
  });

  it('the host can skip a step and reveal early', () => {
    startLocal();
    render(<GameView />);
    fireEvent.click(screen.getByRole('button', { name: /Stop waiting/ }));
    expect(host().phase).toBe('step');
    fireEvent.click(screen.getByRole('button', { name: /Skip to the next step/ }));
    expect(host().stepIndex).toBe(2);
    expect(screen.queryByRole('button', { name: /Hurry/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Reveal now/ }));
    expect(host().phase).toBe('reveal');
  });
});

describe('online seat', () => {
  it('draws on its own phone and the buzzer hands the page in', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    const config = makeConfig(true, { drawSeconds: 30 });
    let state = telephoneModule.createInitialState(config);
    for (let i = 0; i < 3; i++) state = telephoneModule.applyAction(state, { type: 'pick', bySeat: i, choice: 0 }, { by: '', now: Date.now() });
    act(() => useGameStore.getState().startLocalGame(telephoneModule, state, 0, { controllableSeats: [0] }));
    render(<GameView />);

    const held = bookHeldBy(0, 1, 3);
    const mine = (state.books[held]!.pages[0] as { text: string }).text;
    expect(text()).toContain(mine);
    for (const b of [0, 1, 2].filter((x) => x !== held)) {
      expect(text()).not.toContain((state.books[b]!.pages[0] as { text: string }).text);
    }
    expect(screen.getByRole('toolbar', { name: 'Drawing tools' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Hurry up/ })).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(31_000);
    });
    expect(host().books[held]!.pages[1]).toMatchObject({ kind: 'draw', by: 0, missed: false });
    expect(text()).toContain('Passed on!');
    expect(text()).toContain('1 of 3 done');
  });
});

describe('options and tile', () => {
  it('renders the options panel and tile art', () => {
    const onChange = vi.fn();
    render(<Options value={telephoneModule.defaultOptions()} onChange={onChange} playerCount={6} online />);
    expect(text()).toContain('Starting prompts');
    expect(text()).toContain('passed on 6 times');
    fireEvent.click(screen.getByRole('switch', { name: 'Cap long chains' }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ maxSteps: 6 }));
    cleanup();
    const { container } = render(<TileArt className="x" />);
    expect(container.querySelector('svg')?.getAttribute('viewBox')).toBe('0 0 320 200');
  });
});
