import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameConfig, SeatIndex } from '@/engine/types';
import { setClockForTests } from '@/store/clock';
import { useGameStore } from '@/store/gameStore';
import { useNetworkStore } from '@/store/networkStore';
import { foreheadModule, guesserAt } from '../module';
import { GET_READY_MS } from '../rules';
import type { ForeheadState } from '../state';
import GameView from './GameView';

// UI flow: the pass-the-phone cover renders instead of the turn, the held
// card shows the word and takes taps, pause hides the word, results list
// every card; and in 'others' mode the guesser's screen never has the word.

const NAMES = ['Ana', 'Ben', 'Cai'];
let now = 1_000_000;
let perf = 0;

function start(
  options: Record<string, unknown> = {},
  { online = false, seat = null as SeatIndex | null } = {},
): ForeheadState {
  const config: GameConfig = {
    gameId: 'forehead',
    seats: NAMES.map((name, index) => ({ index, uuid: online ? `uid-${index}` : null, name })),
    seed: 7,
    now,
    gameOptions: { ...foreheadModule.defaultOptions(), words: { packs: ['animals'], listIds: [], perPlayer: 0 }, ...options },
    lists: {},
  };
  const state = foreheadModule.createInitialState(config);
  act(() =>
    useGameStore
      .getState()
      .startLocalGame(foreheadModule, state, seat, { config, controllableSeats: online ? [seat!] : null }),
  );
  return state;
}

const host = () => useGameStore.getState().privateState as ForeheadState;
const apply = (a: Parameters<typeof foreheadModule.applyAction>[1]) =>
  act(() => {
    useGameStore.getState().hostApply(a, 'host:scheduler');
  });
const text = () => document.body.textContent ?? '';
const upWord = () => host().cards[host().current!.id]!.text;

beforeEach(() => {
  window.localStorage.clear();
  useGameStore.getState().clearGame();
  useNetworkStore.getState().reset();
  setClockForTests(() => now);
  vi.spyOn(performance, 'now').mockImplementation(() => perf);
});
afterEach(() => {
  cleanup();
  useGameStore.getState().clearGame();
  setClockForTests(null);
  vi.restoreAllMocks();
});

describe('single device', () => {
  it('passes to the guesser, holds the card up, takes taps, pauses, and lists the results', () => {
    const s0 = start();
    const g = guesserAt(s0);
    render(<GameView />);

    // The cover, and no word anywhere.
    expect(screen.getByText('Pass the device to')).toBeTruthy();
    expect(screen.getByRole('heading', { name: NAMES[g] })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`I'm ${NAMES[g]}`) }));
    expect(host().phase).toBe('getReady');
    expect(useGameStore.getState().localSeat).toBe(g);
    expect(text()).toContain('Hold it to your forehead!');

    now += GET_READY_MS;
    apply({ type: 'go', turn: 0 });
    expect(host().phase).toBe('turn');
    const first = upWord();
    expect(text()).toContain(first);

    fireEvent.click(screen.getByRole('button', { name: 'Got it' }));
    expect(host().turnCards).toEqual([expect.objectContaining({ got: true })]);
    expect(text()).toContain('Got it!');
    // A second tap straight away doesn't mark the next card too.
    fireEvent.click(screen.getByRole('button', { name: 'Got it' }));
    expect(host().turnCards).toHaveLength(1);
    perf += 1000;
    const second = upWord();
    fireEvent.click(screen.getByRole('button', { name: 'Pass' }));
    expect(host().turnCards.map((c) => c.got)).toEqual([true, false]);

    // Pause: the word comes off the screen.
    const third = upWord();
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(screen.getByRole('heading', { name: 'Paused' })).toBeTruthy();
    expect(text()).not.toContain(third);
    fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
    expect(text()).toContain(third);

    // The buzzer, then the list.
    now = host().timer!.endsAt!;
    apply({ type: 'timeUp', turn: 0 });
    expect(host().phase).toBe('turnResults');
    for (const w of [first, second, third]) expect(text()).toContain(w);
    expect(text()).toContain('Time’s up!');
    const next = guesserAt(host(), 1);
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`Pass to ${NAMES[next]}`) }));
    expect(host().phase).toBe('ready');
    expect(useGameStore.getState().localSeat).toBeNull();
    expect(screen.getByRole('heading', { name: NAMES[next] })).toBeTruthy();
  });
});

describe('online, word on the others’ phones', () => {
  function toTurn(seatOf: (s: ForeheadState) => SeatIndex): ForeheadState {
    // Build the state first to find the guesser, then restart as the chosen seat.
    const probe = start({ display: 'others' }, { online: true, seat: 0 });
    const seat = seatOf(probe);
    cleanup();
    useGameStore.getState().clearGame();
    start({ display: 'others' }, { online: true, seat });
    apply({ type: 'start', turn: 0 });
    now += GET_READY_MS;
    apply({ type: 'go', turn: 0 });
    render(<GameView />);
    return host();
  }

  it('the guesser’s screen never shows the word, but has its own Pass', () => {
    const s = toTurn((p) => guesserAt(p));
    expect(useGameStore.getState().localSeat).toBe(guesserAt(s));
    expect(text()).toContain('Guess!');
    expect(text()).not.toContain(upWord());
    fireEvent.click(screen.getByRole('button', { name: /Pass this one/ }));
    expect(host().turnCards.map((c) => c.got)).toEqual([false]);
    expect(text()).not.toContain(upWord());
  });

  it('a clue-giver sees the word and marks it', () => {
    toTurn((p) => (guesserAt(p) + 1) % NAMES.length);
    const word = upWord();
    expect(text()).toContain(word);
    fireEvent.click(screen.getByRole('button', { name: /Correct/ }));
    expect(host().turnCards.map((c) => c.got)).toEqual([true]);
    expect(text()).toContain('Got it!');
  });
});
