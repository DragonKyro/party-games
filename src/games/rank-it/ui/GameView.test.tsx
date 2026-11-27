import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameConfig } from '@/engine/types';
import { useGameStore } from '@/store/gameStore';
import { useNetworkStore } from '@/store/networkStore';
import { chooserOf, rankItModule } from '../module';
import type { RankItState } from '../state';
import GameView from './GameView';
import Options from './Options';

// UI flow on a single device: the pass-the-phone covers render INSTEAD of
// the secrets, the Ranker chooses + ranks, the roster loop collects every
// guess, and the reveal is shown to the table.

const NAMES = ['Ana', 'Ben', 'Cai'];

function startLocal(options: Record<string, unknown> = {}): RankItState {
  const config: GameConfig = {
    gameId: 'rank-it',
    seats: NAMES.map((name, index) => ({ index, uuid: null, name })),
    seed: 99,
    now: Date.now(),
    gameOptions: { ...rankItModule.defaultOptions(), itemCount: 3, ...options },
    lists: {},
  };
  const state = rankItModule.createInitialState(config);
  act(() => useGameStore.getState().startLocalGame(rankItModule, state, null, { config }));
  return state;
}

const host = () => useGameStore.getState().privateState as RankItState;
const text = () => document.body.textContent ?? '';

function rankAllItems() {
  const tray = screen.getByLabelText('Items to rank');
  for (let i = 0; i < 3; i++) fireEvent.click(within(tray).getAllByRole('button')[0]!);
  fireEvent.click(screen.getByRole('button', { name: /Lock it in/ }));
}

beforeEach(() => {
  window.localStorage.clear();
  useGameStore.getState().clearGame();
  useNetworkStore.getState().reset();
});
afterEach(() => {
  cleanup();
  useGameStore.getState().clearGame();
});

describe('single-device flow', () => {
  it('passes to the Ranker, then round the table, then reveals', () => {
    const s0 = startLocal();
    const chooser = chooserOf(s0)!;
    const offered = s0.offered.map((id) => s0.criteriaPool[id]!.text);
    render(<GameView />);

    // The cover, not the secret.
    expect(screen.getByText('Pass the device to')).toBeTruthy();
    expect(screen.getByRole('heading', { name: NAMES[chooser] })).toBeTruthy();
    for (const c of offered) expect(text()).not.toContain(c);

    fireEvent.click(screen.getByRole('button', { name: new RegExp(`I'm ${NAMES[chooser]}`) }));
    expect(screen.getByText('Pick what to rank by')).toBeTruthy();
    for (const c of offered) expect(text()).toContain(c);
    fireEvent.click(screen.getByRole('button', { name: new RegExp(offered[0]!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }));

    // Still the Ranker's phone: straight into their secret order.
    expect(text()).toContain('your secret order');
    expect(text()).toContain(`least:${offered[0]}`);
    rankAllItems();
    const rankerOrder = host().orders[chooser]!;
    expect(rankerOrder).toHaveLength(3);
    expect(useGameStore.getState().localSeat).toBeNull();

    // The roster: the Ranker is done; each guesser takes the phone in turn.
    for (const g of [0, 1, 2].filter((i) => i !== chooser)) {
      fireEvent.click(screen.getByRole('button', { name: new RegExp(NAMES[g]!) }));
      expect(screen.getByText('Pass the device to')).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: new RegExp(`I'm ${NAMES[g]}`) }));
      expect(text()).toContain(`how did ${NAMES[chooser]} rank them?`);
      rankAllItems();
    }

    expect(host().phase).toBe('reveal');
    expect(screen.getByText(`${NAMES[chooser]}’s order`)).toBeTruthy();
    expect(screen.getByText('Standings')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Next round/ }));
    expect(host().round).toBe(1);
    expect(screen.getByText('Pass the device to')).toBeTruthy();

    act(() => useGameStore.getState().dispatch({ type: 'finish' }));
    expect(text()).toMatch(/wins!|tie!/);
  });

  it('crowd mode goes straight to the roster with the criterion showing', () => {
    const s0 = startLocal({ mode: 'crowd' });
    render(<GameView />);
    expect(text()).toContain(s0.criterion!);
    expect(screen.getByRole('button', { name: /Stop waiting/ })).toHaveProperty('disabled', true);
    for (const p of [0, 1]) {
      fireEvent.click(screen.getByRole('button', { name: new RegExp(NAMES[p]!) }));
      fireEvent.click(screen.getByRole('button', { name: new RegExp(`I'm ${NAMES[p]}`) }));
      expect(text()).toContain('rank them your way');
      rankAllItems();
    }
    fireEvent.click(screen.getByRole('button', { name: /Stop waiting/ }));
    expect(host().phase).toBe('reveal');
    expect(screen.getByText('The room’s order')).toBeTruthy();
  });

  it('tap-to-rank: tapping a ranked item takes it back; nudges reorder', () => {
    startLocal({ mode: 'crowd' });
    render(<GameView />);
    fireEvent.click(screen.getByRole('button', { name: /Ana/ }));
    fireEvent.click(screen.getByRole('button', { name: /I'm Ana/ }));
    const tray = () => screen.getByLabelText('Items to rank');
    const first = within(tray()).getAllByRole('button')[0]!.textContent!;
    fireEvent.click(within(tray()).getAllByRole('button')[0]!);
    expect(within(tray()).queryByText(first)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: `Take back ${first}` }));
    expect(within(tray()).getByText(first)).toBeTruthy();
    for (let i = 0; i < 3; i++) fireEvent.click(within(tray()).getAllByRole('button')[0]!);
    fireEvent.click(screen.getByRole('button', { name: `Move ${first} down` }));
    fireEvent.click(screen.getByRole('button', { name: /Lock it in/ }));
    expect(host().orders[0]![1]).toBe(host().dealt.findIndex((id) => host().itemPool[id]!.text === first));
  });
});

describe('options', () => {
  it('puts “everyone writes” up front', () => {
    const onChange = vi.fn();
    render(<Options value={rankItModule.defaultOptions()} onChange={onChange} playerCount={4} online />);
    expect(screen.getByText('Everyone writes the items')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Turn it on' }));
    expect(onChange.mock.calls[0]![0].items.perPlayer).toBe(5);
    fireEvent.click(screen.getByRole('radio', { name: /Crowd/ }));
    expect(onChange.mock.calls[1]![0].mode).toBe('crowd');
  });
});
