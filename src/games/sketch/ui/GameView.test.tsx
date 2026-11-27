import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameConfig, SeatIndex } from '@/engine/types';
import { useGameStore } from '@/store/gameStore';
import { useNetworkStore } from '@/store/networkStore';
import { sketchModule } from '../module';
import type { SketchState } from '../state';
import GameView from './GameView';
import Options from './Options';
import { TileArt } from './TileArt';

// UI flows: on one device the choices sit behind a PassScreen rendered
// INSTEAD of them and the word is in the DOM only while "peek" is held;
// online a guesser types and sees the word once solved; a TV sees blanks.

const NAMES = ['Ana', 'Ben', 'Cai'];
const WORDS = ['Xylophone', 'Zeppelin', 'Kangaroo', 'Quokka', 'Jellyfish', 'Volcano', 'Waffle', 'Umbrella', 'Igloo'];

function makeConfig(online: boolean, options: Record<string, unknown> = {}): GameConfig {
  return {
    gameId: 'sketch',
    seats: NAMES.map((name, index) => ({ index, uuid: online ? `uid-${index}` : null, name })),
    seed: 7,
    now: Date.now(),
    gameOptions: { ...sketchModule.defaultOptions(), words: { packs: [], listIds: ['L'], perPlayer: 0 }, ...options },
    lists: { L: WORDS },
  };
}

const host = () => useGameStore.getState().privateState as SketchState;
const text = () => document.body.textContent ?? '';
const wordOf = (s: SketchState) => s.pool[s.word!]!.text;

/** An online game already drawing, rendered for `seat` (the host's own seat). */
function onlineDrawing(seat: (s: SketchState) => SeatIndex | null): SketchState {
  let s = sketchModule.createInitialState(makeConfig(true));
  s = sketchModule.applyAction(s, { type: 'choose', bySeat: s.drawer!, turn: 0, index: 0 }, { by: '', now: Date.now() });
  const me = seat(s);
  act(() => useGameStore.getState().startLocalGame(sketchModule, s, me, { controllableSeats: me === null ? [] : [me] }));
  return s;
}

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
  it('covers the choices, hides the word behind a peek, and lets the artist tap who got it', () => {
    const config = makeConfig(false);
    const s0 = sketchModule.createInitialState(config);
    act(() => useGameStore.getState().startLocalGame(sketchModule, s0, null, { config }));
    render(<GameView />);
    const drawer = NAMES[s0.drawer!]!;
    const offered = s0.choices.map((id) => s0.pool[id]!.text);
    for (const w of WORDS) expect(text()).not.toContain(w);

    fireEvent.click(screen.getByRole('button', { name: new RegExp(`I'm ${drawer}`) }));
    for (const w of offered) expect(text()).toContain(w);
    fireEvent.click(screen.getByRole('button', { name: offered[1]! }));
    expect(host().phase).toBe('drawing');
    expect(useGameStore.getState().localSeat).toBeNull();
    for (const w of WORDS) expect(text()).not.toContain(w);

    const peek = screen.getByRole('button', { name: /peek/i });
    fireEvent.pointerDown(peek);
    expect(text()).toContain(offered[1]);
    fireEvent.pointerUp(peek);
    expect(text()).not.toContain(offered[1]);

    const guesser = NAMES.find((_, i) => i !== s0.drawer)!;
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${guesser}`) }));
    expect(host().solves).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: /Done/ }));
    expect(host().phase).toBe('reveal');
    expect(text()).toContain(offered[1]);

    fireEvent.click(screen.getByRole('button', { name: /Next turn/ }));
    expect(host().phase).toBe('choose');
    expect(screen.getByText('Pass the device to')).toBeTruthy();
    for (const w of WORDS) expect(text()).not.toContain(w);

    fireEvent.click(screen.getByRole('button', { name: /Skip/ }));
    expect(host().turnNo).toBe(2);
  });
});

describe('online', () => {
  it('a guesser types guesses; once solved they see the word', () => {
    vi.useFakeTimers();
    const s = onlineDrawing((x) => [0, 1, 2].find((i) => i !== x.drawer)!);
    const me = useGameStore.getState().localSeat!;
    render(<GameView />);
    const w = wordOf(s);
    expect(text()).not.toContain(w);
    const input = screen.getByRole('textbox', { name: /guess/i });
    fireEvent.change(input, { target: { value: 'a submarine' } });
    fireEvent.submit(input.closest('form')!);
    expect(host().feed.map((e) => e.text)).toEqual(['a submarine']);
    expect(text()).toContain('a submarine');

    fireEvent.change(input, { target: { value: w.toLowerCase() } });
    fireEvent.submit(input.closest('form')!);
    act(() => vi.advanceTimersByTime(1000)); // the client paces guesses under the host's limit
    expect(host().solves.map((x) => x.seat)).toEqual([me]);
    expect(text()).toContain(w);
    expect(text()).toContain('You got it');
    expect(screen.getByRole('textbox', { name: /solvers/i })).toBeTruthy();
  });

  it('the artist sees the word and a live canvas, but no guess box', () => {
    const s = onlineDrawing((x) => x.drawer);
    render(<GameView />);
    expect(text()).toContain(wordOf(s));
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.getByRole('img', { name: 'Drawing canvas' })).toBeTruthy();
    expect(screen.getByRole('toolbar', { name: /tools/i })).toBeTruthy();
  });

  it('a TV screen shows the blanks, never the word', () => {
    let s = sketchModule.createInitialState(makeConfig(true));
    s = sketchModule.applyAction(s, { type: 'choose', turn: 0, index: 0 }, { by: '', now: Date.now() });
    act(() =>
      useGameStore.getState().setPublicView({ gameId: 'sketch', tick: 1, view: sketchModule.viewFor(s, null), seat: null }),
    );
    render(<GameView />);
    expect(text()).not.toContain(wordOf(s));
    expect(screen.getByRole('img', { name: /Hint: \d+ letters/ })).toBeTruthy();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.getByRole('img', { name: 'Drawing' })).toBeTruthy();
  });

  it('the chooser sees three words; everyone else waits', () => {
    const s = sketchModule.createInitialState(makeConfig(true));
    act(() => useGameStore.getState().startLocalGame(sketchModule, s, s.drawer, { controllableSeats: [s.drawer!] }));
    render(<GameView />);
    const offered = s.choices.map((id) => s.pool[id]!.text);
    for (const w of offered) expect(screen.getByRole('button', { name: w })).toBeTruthy();
    cleanup();
    act(() => useGameStore.getState().setLocalSeat(null));
    render(<GameView />);
    for (const w of offered) expect(text()).not.toContain(w);
    expect(text()).toContain('is picking a word');
  });
});

describe('panels', () => {
  it('options: forces shouting on one device; offers typed online', () => {
    const onChange = vi.fn();
    render(<Options value={sketchModule.defaultOptions()} onChange={onChange} playerCount={4} online />);
    fireEvent.click(screen.getByRole('radio', { name: /Shouted/ }));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ guessing: 'spoken' }));
    cleanup();
    render(<Options value={sketchModule.defaultOptions()} onChange={onChange} playerCount={4} online={false} />);
    expect(screen.queryByRole('radio', { name: /Typed/ })).toBeNull();
    expect(text()).toContain('Shouted');
  });

  it('tile art renders', () => {
    const { container } = render(<TileArt />);
    expect(container.querySelector('svg')?.getAttribute('viewBox')).toBe('0 0 320 200');
  });
});
