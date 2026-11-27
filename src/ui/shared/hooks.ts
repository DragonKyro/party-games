import { useEffect, useState } from 'react';
import type { SeatIndex } from '@/engine/types';
import { serverNow } from '@/store/clock';
import { useGameStore, useSeatSwitching } from '@/store/gameStore';
import { useNetworkStore } from '@/store/networkStore';

/**
 * Everything a game view needs about "where am I playing from":
 *
 * - `view`       the redacted view for `seat` (cast to the game's Public type)
 * - `seat`       the seat this screen shows (null = spectator / TV)
 * - `isHost`     this device runs the game (single-device table or online host):
 *                show host controls (start, skip, pause, end) and dispatch
 *                seatless actions only when true
 * - `localTable` one device for everyone: secrets need a pass-the-phone cover,
 *                and `setSeat` switches whose view is on screen
 * - `online`     an online room (each player on their own device)
 */
export function usePlay<V>() {
  const env = useGameStore((s) => s.publicView);
  const seat = useGameStore((s) => s.localSeat);
  const isHost = useGameStore((s) => s.isHost);
  const dispatch = useGameStore((s) => s.dispatch);
  const exitGame = useGameStore((s) => s.exitGame);
  const playAgain = useGameStore((s) => s.playAgain);
  const switching = useSeatSwitching();
  const role = useNetworkStore((s) => s.role);
  return {
    view: (env?.view ?? null) as V | null,
    seat,
    isHost,
    localTable: switching.enabled,
    online: role !== 'solo',
    dispatch,
    setSeat: (s: SeatIndex | null) => switching.setLocalSeat(s),
    exitGame,
    playAgain,
  };
}

/** The shared (server-aligned) clock, re-rendering every `intervalMs`. */
export function useNow(intervalMs = 250, active = true): number {
  const [now, setNow] = useState(() => serverNow());
  useEffect(() => {
    if (!active) return;
    setNow(serverNow());
    const t = setInterval(() => setNow(serverNow()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs, active]);
  return now;
}

/** True after `key` changes, for `ms` milliseconds (flash a "Got it!" etc.). */
export function useFlash(key: unknown, ms = 900): boolean {
  const [on, setOn] = useState(false);
  const [last, setLast] = useState(key);
  if (key !== last) {
    setLast(key);
    setOn(true);
  }
  useEffect(() => {
    if (!on) return;
    const t = setTimeout(() => setOn(false), ms);
    return () => clearTimeout(t);
  }, [on, ms, key]);
  return on;
}

/** Player colour by seat (cycles a candy palette). */
const SEAT_COLORS = [
  '#ff6b6b',
  '#4cc9f0',
  '#06d6a0',
  '#ffc93c',
  '#a06cf0',
  '#ff70a6',
  '#ff9f43',
  '#7bdff2',
  '#b8f35e',
  '#f797d4',
  '#9aa5ff',
  '#ffd6a5',
];
export function seatColor(seat: number): string {
  return SEAT_COLORS[((seat % SEAT_COLORS.length) + SEAT_COLORS.length) % SEAT_COLORS.length]!;
}

export const TEAM_NAMES = ['Coral', 'Sky', 'Mint', 'Sun'] as const;
export const TEAM_COLORS = ['var(--team-0)', 'var(--team-1)', 'var(--team-2)', 'var(--team-3)'] as const;
export function teamName(team: number): string {
  return `Team ${TEAM_NAMES[team] ?? team + 1}`;
}
