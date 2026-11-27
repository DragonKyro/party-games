// The "everyone writes words" phase, shared by every game. A game embeds a
// `CollectState` in its private state while collecting, routes `collect.*`
// actions to `collectReduce`, and moves on when `collectComplete` says every
// seat is done (or the host sends `collect.close` to stop waiting).
//
// Hidden information: what each player wrote is private until the game uses
// it — `collectView` gives a seat only its own entries plus who is done.
// (Fishbowl slips you wrote must not appear on your friends' screens.)

import type { SeatIndex } from '@/engine/types';
import { MAX_PER_PLAYER, cleanEntry, entryKey } from './source';

/** 'words': single entries. 'pairs': "Left | Right" spectrum ends. */
export type CollectKind = 'words' | 'pairs';

export const PAIR_SEPARATOR = ' | ';
export const MAX_PAIR_SIDE = 28;

export interface CollectState {
  kind: CollectKind;
  perPlayer: number;
  /** What the UI asks for, e.g. "Write 4 people, places or things". */
  prompt: string;
  entries: Record<SeatIndex, string[]>;
  done: Record<SeatIndex, boolean>;
}

export type CollectAction =
  | { type: 'collect.submit'; bySeat: SeatIndex; entries: string[] }
  | { type: 'collect.reopen'; bySeat: SeatIndex }
  /** Host: stop waiting; play with what has been submitted. */
  | { type: 'collect.close' };

export interface CollectView {
  kind: CollectKind;
  perPlayer: number;
  prompt: string;
  /** This seat's own entries (kept while editing after a reopen); null if none / spectator. */
  yours: string[] | null;
  /** done[seat] for every seat. */
  done: boolean[];
}

export function isCollectAction(a: unknown): a is CollectAction {
  const t = (a as { type?: unknown } | null)?.type;
  return typeof t === 'string' && t.startsWith('collect.');
}

export function startCollect(kind: CollectKind, perPlayer: number, prompt: string): CollectState {
  return {
    kind,
    perPlayer: Math.max(1, Math.min(MAX_PER_PLAYER, Math.round(perPlayer))),
    prompt,
    entries: {},
    done: {},
  };
}

/** Normalise a "Left | Right" pair, or '' if it isn't one. */
export function cleanPair(raw: string): string {
  const parts = String(raw).split('|');
  if (parts.length !== 2) return '';
  const [l, r] = parts.map((p) => cleanEntry(p).slice(0, MAX_PAIR_SIDE));
  if (!l || !r || entryKey(l) === entryKey(r)) return '';
  return `${l}${PAIR_SEPARATOR}${r}`;
}

export function splitPair(pair: string): [string, string] {
  const i = pair.indexOf('|');
  if (i < 0) return [pair.trim(), ''];
  return [pair.slice(0, i).trim(), pair.slice(i + 1).trim()];
}

/**
 * Validate one seat's submission; returns the cleaned entries or throws a
 * player-readable message. The entry form runs this too, so the host never
 * refuses something the form accepted.
 */
export function cleanSubmission(state: Pick<CollectState, 'kind' | 'perPlayer'>, raw: unknown): string[] {
  if (!Array.isArray(raw)) throw new Error('Entries must be a list');
  if (raw.length !== state.perPlayer) throw new Error(`Write exactly ${state.perPlayer}.`);
  const cleaned = raw.map((r) => (state.kind === 'pairs' ? cleanPair(String(r ?? '')) : cleanEntry(r)));
  if (cleaned.some((c) => !c)) {
    throw new Error(state.kind === 'pairs' ? 'Every spectrum needs two different ends.' : 'Fill in every line.');
  }
  const keys = new Set(cleaned.map(entryKey));
  if (keys.size !== cleaned.length) throw new Error('No duplicates, please (spelling and punctuation don’t count).');
  return cleaned;
}

function assertSeat(seat: unknown, seatCount: number): asserts seat is SeatIndex {
  if (typeof seat !== 'number' || !Number.isInteger(seat) || seat < 0 || seat >= seatCount) {
    throw new Error(`Unknown seat ${String(seat)}`);
  }
}

/**
 * Apply a submit / reopen. `collect.close` is the game's job (it decides
 * what happens next), so it throws here.
 */
export function collectReduce(state: CollectState, action: CollectAction, seatCount: number): CollectState {
  switch (action.type) {
    case 'collect.submit': {
      assertSeat(action.bySeat, seatCount);
      const entries = cleanSubmission(state, action.entries);
      return {
        ...state,
        entries: { ...state.entries, [action.bySeat]: entries },
        done: { ...state.done, [action.bySeat]: true },
      };
    }
    case 'collect.reopen': {
      assertSeat(action.bySeat, seatCount);
      if (!state.done[action.bySeat]) return state;
      return { ...state, done: { ...state.done, [action.bySeat]: false } };
    }
    default:
      throw new Error('collect.close must be handled by the game');
  }
}

export function collectComplete(state: CollectState, seatCount: number): boolean {
  for (let i = 0; i < seatCount; i++) if (!state.done[i]) return false;
  return true;
}

/** Every submitted entry with its author, in seat order. Only seats marked done count. */
export function collectedEntries(state: CollectState): Array<{ text: string; author: SeatIndex }> {
  const out: Array<{ text: string; author: SeatIndex }> = [];
  const seats = Object.keys(state.entries)
    .map(Number)
    .sort((a, b) => a - b);
  for (const seat of seats) {
    if (!state.done[seat]) continue;
    for (const text of state.entries[seat] ?? []) out.push({ text, author: seat });
  }
  return out;
}

export function collectView(state: CollectState, seat: SeatIndex | null, seatCount: number): CollectView {
  const own = seat !== null ? state.entries[seat] : undefined;
  return {
    kind: state.kind,
    perPlayer: state.perPlayer,
    prompt: state.prompt,
    yours: own ? own.slice() : null,
    done: Array.from({ length: seatCount }, (_, i) => !!state.done[i]),
  };
}
