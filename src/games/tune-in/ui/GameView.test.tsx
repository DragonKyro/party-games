import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useGameStore } from '@/store/gameStore';
import { tuneInModule as mod, tunerOf } from '../module';
import type { TuneInState } from '../state';
import { freq } from './Dial';
import GameView from './GameView';
import Options from './Options';
import { TileArt } from './TileArt';

// Single-device walk-throughs and an own-device (online-style) render of
// every phase. The engine is covered in module.test.ts; this checks the
// screens render, the pass-the-phone covers sit in front of the secrets, and
// the buttons dispatch what they say.

const NAMES = ['Ana', 'Ben', 'Cai', 'Dee'];
const cfg = (o: Record<string, unknown> = {}) => ({
  gameId: 'tune-in' as const,
  seats: NAMES.map((name, index) => ({ index, uuid: null, name })),
  seed: 4242,
  now: Date.now(),
  gameOptions: { ...mod.defaultOptions(), ...o },
  lists: {},
});

afterEach(() => {
  cleanup();
  useGameStore.getState().clearGame();
});

const s = () => useGameStore.getState().privateState as TuneInState;
const click = (name: RegExp | string) => fireEvent.click(screen.getAllByRole('button', { name })[0]!);
const text = () => document.body.textContent ?? '';

function goOnAir(clue: string) {
  const tuner = NAMES[tunerOf(s())]!;
  // The target is behind the Tuner's cover.
  expect(text()).not.toContain('Your secret station');
  click(new RegExp(`I’m ${tuner}, show me the station`));
  expect(text()).toContain('Your secret station');
  expect(text()).toContain(`${freq(s().target)} FM`);
  fireEvent.change(screen.getByPlaceholderText(/sits right there/), { target: { value: clue } });
  click(/Go on air/);
  expect(s().phase).toBe('guess');
  // Straight back behind a cover for the table; no target on screen.
  expect(useGameStore.getState().localSeat).toBeNull();
  expect(text()).not.toContain('Your secret station');
  click(/show the clue/);
  expect(text()).toContain(clue);
}

describe('single device', () => {
  it('everyone mode: Tuner peeks, the table passes the phone round, reveal, next', () => {
    act(() => useGameStore.getState().startLocalGame(mod, mod.createInitialState(cfg()), null, {}));
    render(<GameView />);
    expect(s().phase).toBe('tune');
    goOnAir('Lukewarm bath');

    const tuner = tunerOf(s());
    const guessers = NAMES.map((_, i) => i).filter((i) => i !== tuner);
    for (const [k, g] of guessers.entries()) {
      fireEvent.click(screen.getByRole('button', { name: new RegExp(NAMES[g]!) }));
      click(new RegExp(`I'm ${NAMES[g]} — show me`));
      expect(useGameStore.getState().localSeat).toBe(g);
      for (let i = 0; i <= k; i++) click(/Nudge right/);
      click(/Lock it in/);
      if (k < guessers.length - 1) {
        expect(useGameStore.getState().localSeat).toBeNull();
        expect(s().locked[g]).toBe(true);
      }
    }
    expect(s().phase).toBe('reveal');
    expect(text()).toContain('The station was at');
    expect(s().history[0]!.guesses.map((x) => x.needle)).toEqual([51, 52, 53]);
    click(/Next round/);
    expect(s().phase).toBe('tune');
    expect(s().round).toBe(1);
  });

  it('a guesser can back out without locking; their needle is kept', () => {
    act(() => useGameStore.getState().startLocalGame(mod, mod.createInitialState(cfg()), null, {}));
    render(<GameView />);
    goOnAir('Tepid soup');
    const g = NAMES.map((_, i) => i).find((i) => i !== tunerOf(s()))!;
    fireEvent.click(screen.getByRole('button', { name: new RegExp(NAMES[g]!) }));
    click(new RegExp(`I'm ${NAMES[g]} — show me`));
    click(/Nudge left/);
    click(/Not yet/);
    expect(useGameStore.getState().localSeat).toBeNull();
    expect(s().needles[g]).toBe(49);
    expect(s().locked[g]).toBe(false);
  });

  it('team mode: one shared needle on the table, lock, all the way to the rating', () => {
    act(() => useGameStore.getState().startLocalGame(mod, mod.createInitialState(cfg({ mode: 'team', rounds: 5 })), null, {}));
    render(<GameView />);
    for (let round = 0; round < 5; round++) {
      goOnAir(`Clue number ${round + 1}`);
      expect(screen.getByRole('slider')).toBeTruthy();
      click(/Nudge right/);
      expect(s().shared).toBe(51);
      click(/Lock it in/);
      expect(s().phase).toBe('reveal');
      expect(text()).toMatch(/Team total/);
      click(round === 4 ? /See the results/ : /Next round/);
    }
    expect(s().phase).toBe('gameOver');
    expect(text()).toContain(mod.viewFor(s(), null).rating!.name);
  });

  it('host controls: skip the Tuner, force the reveal, end early', () => {
    act(() => useGameStore.getState().startLocalGame(mod, mod.createInitialState(cfg()), null, {}));
    render(<GameView />);
    const first = tunerOf(s());
    click(new RegExp(`Skip ${NAMES[first]}`));
    expect(tunerOf(s())).toBe((first + 1) % NAMES.length);
    goOnAir('Room temperature');
    click(/Reveal now/);
    expect(s().phase).toBe('reveal');
    window.confirm = () => true;
    click(/End game/);
    expect(s().phase).toBe('gameOver');
    expect(text()).toMatch(/Play again/);
  });
});

describe('own device', () => {
  function asSeat(state: TuneInState, seat: number) {
    act(() => useGameStore.getState().startLocalGame(mod, state, seat, { controllableSeats: [seat] }));
    render(<GameView />);
  }

  it('the Tuner sees the desk; a guesser waits, then guesses and locks', () => {
    const state = mod.createInitialState(cfg());
    const tuner = tunerOf(state);
    const guesser = (tuner + 1) % NAMES.length;
    asSeat(state, guesser);
    expect(text()).toContain('is finding a station');
    expect(text()).not.toContain('Your secret station');
    act(() => {
      useGameStore.getState().hostApply({ type: 'tune', bySeat: tuner, turn: 0, pick: 0, clue: 'Warm milk' }, '');
    });
    expect(text()).toContain('Warm milk');
    expect(text()).toContain('0 of 3 locked in');
    click(/Nudge left/);
    click(/Lock it in/);
    expect(s().locked[guesser]).toBe(true);
    expect(text()).toContain('Locked in');
  });

  it('the Tuner’s desk validates the clue before going on air', () => {
    const state = mod.createInitialState(cfg());
    const tuner = tunerOf(state);
    asSeat(state, tuner);
    expect(text()).toContain('Your secret station');
    const left = s().cards[s().offer![0]!]!.left;
    fireEvent.change(screen.getByPlaceholderText(/sits right there/), { target: { value: left } });
    click(/Go on air/);
    expect(screen.getByRole('alert').textContent).toMatch(/ends/);
    expect(s().phase).toBe('tune');
    // Switch to the other preset and try again.
    fireEvent.click(screen.getAllByRole('radio')[1]!);
    fireEvent.change(screen.getByPlaceholderText(/sits right there/), { target: { value: 'A cosy jumper' } });
    click(/Go on air/);
    expect(s().phase).toBe('guess');
    expect(s().chosen).toBe(state.offer![1]);
    expect(text()).toContain('Poker face');
  });
});

describe('panels', () => {
  it('options and tile art render', () => {
    let value: Record<string, unknown> = mod.defaultOptions();
    const { rerender } = render(<Options value={value} onChange={(v) => (value = v)} playerCount={4} online={false} />);
    fireEvent.click(screen.getByRole('radio', { name: 'Co-op' }));
    expect(value.mode).toBe('team');
    rerender(<Options value={value} onChange={(v) => (value = v)} playerCount={4} online={false} />);
    expect(text()).toContain('Rounds');
    fireEvent.click(screen.getByRole('radio', { name: 'Tight' }));
    expect(value.bands).toEqual([2, 5, 9, 14]);
    cleanup();
    const { container } = render(<TileArt />);
    expect(container.querySelector('svg')).toBeTruthy();
  });
});
