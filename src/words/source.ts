// Where a game's words come from. Every game exposes the same three knobs,
// in any combination:
//
//   packs    — built-in packs (src/words/packs)
//   listIds  — the host's saved lists (src/words/library.ts). Only ids travel
//              in the world-readable lobby; the entries are resolved on the
//              host at match start into `GameConfig.lists`.
//   perPlayer — every player writes this many entries at the start of the
//              match (collect.ts). 0 = off.
//
// `buildPool` merges them into one deduplicated list that remembers who
// wrote each entry, so games can keep your own words away from you.

import type { SeatIndex } from '@/engine/types';
import { WORD_PACKS, isPackId, type PackId } from './index';

export interface WordSource {
  packs: PackId[];
  listIds: string[];
  perPlayer: number;
}

export interface PoolEntry {
  text: string;
  /** The seat that wrote it (collected), else null. */
  author: SeatIndex | null;
  /** The pack it came from, else null. */
  pack: PackId | null;
}

export const MAX_ENTRY_LENGTH = 60;
export const MAX_PER_PLAYER = 10;

/** Trim, collapse inner whitespace, cap the length. */
export function cleanEntry(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.replace(/\s+/g, ' ').trim().slice(0, MAX_ENTRY_LENGTH);
}

/** Case-, accent- and punctuation-insensitive identity for dedupe. */
export function entryKey(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

/** Coerce untrusted options into a valid WordSource. */
export function readSource(raw: unknown, fallback: WordSource): WordSource {
  const r = (raw ?? {}) as Partial<Record<keyof WordSource, unknown>>;
  const packs = Array.isArray(r.packs) ? [...new Set(r.packs.filter(isPackId))] : fallback.packs;
  const listIds = Array.isArray(r.listIds)
    ? [...new Set(r.listIds.filter((x): x is string => typeof x === 'string' && x.length > 0 && x.length <= 40))]
    : fallback.listIds;
  const n = Number(r.perPlayer);
  const perPlayer = Number.isFinite(n) ? Math.max(0, Math.min(MAX_PER_PLAYER, Math.round(n))) : fallback.perPlayer;
  return { packs, listIds, perPlayer };
}

export interface BuildPoolInput {
  source: WordSource;
  /** Resolved host lists (`GameConfig.lists`). Missing ids are skipped. */
  lists?: Record<string, readonly string[]>;
  /** Player-written entries (from collect.ts). */
  collected?: ReadonlyArray<{ text: string; author: SeatIndex }>;
  /** Leave out packs (e.g. when a game only wants player words). */
  skipPacks?: boolean;
}

/**
 * Merge every source into one pool. Order: collected first (so the
 * author survives dedupe), then lists, then packs. Stable for a given input.
 */
export function buildPool({ source, lists = {}, collected = [], skipPacks = false }: BuildPoolInput): PoolEntry[] {
  const seen = new Set<string>();
  const out: PoolEntry[] = [];
  const add = (raw: string, author: SeatIndex | null, pack: PackId | null) => {
    const text = cleanEntry(raw);
    const key = entryKey(text);
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push({ text, author, pack });
  };
  for (const c of collected) add(c.text, c.author, null);
  for (const id of source.listIds) for (const w of lists[id] ?? []) add(w, null, null);
  if (!skipPacks) for (const id of source.packs) for (const w of WORD_PACKS[id]?.words ?? []) add(w, null, id);
  return out;
}

/** Upper bound on the pool size before collection (for setup warnings). */
export function estimatePoolSize(
  source: WordSource,
  listSizes: Record<string, number>,
  playerCount: number,
): number {
  let n = source.perPlayer * playerCount;
  for (const id of source.listIds) n += listSizes[id] ?? 0;
  for (const id of source.packs) n += WORD_PACKS[id]?.words.length ?? 0;
  return n;
}

/** Why this source can't feed a game that needs `minEntries`, or null. */
export function sourceProblem(
  source: WordSource,
  listSizes: Record<string, number>,
  playerCount: number,
  minEntries: number,
): string | null {
  if (source.packs.length === 0 && source.listIds.length === 0 && source.perPlayer === 0) {
    return 'Pick at least one word pack, a saved list, or have players write words.';
  }
  const n = estimatePoolSize(source, listSizes, playerCount);
  if (n < minEntries) return `That's only about ${n} entries — this game needs at least ${minEntries}.`;
  return null;
}

/** "Animals + Food · 2 host lists · 4 each from players" for lobby summaries. */
export function describeSource(source: WordSource): string {
  const parts: string[] = [];
  if (source.packs.length > 0) parts.push(source.packs.map((id) => WORD_PACKS[id]?.name ?? id).join(' + '));
  if (source.listIds.length > 0) {
    parts.push(`${source.listIds.length} host list${source.listIds.length === 1 ? '' : 's'}`);
  }
  if (source.perPlayer > 0) parts.push(`${source.perPlayer} from each player`);
  return parts.join(' · ') || 'No words chosen';
}

// ---------------------------------------------------------------------------
// Prompt sources (Rank It criteria, Tune In spectrums): the same three
// knobs, but the built-in half is one curated list (+ an optional 18+ list)
// instead of packs.
// ---------------------------------------------------------------------------

export interface PromptSource {
  /** Use the built-in list. */
  builtIn: boolean;
  /** Also use the built-in adults-only list. */
  spicy: boolean;
  listIds: string[];
  perPlayer: number;
}

export function readPromptSource(raw: unknown, fallback: PromptSource): PromptSource {
  const r = (raw ?? {}) as Partial<Record<keyof PromptSource, unknown>>;
  const base = readSource({ packs: [], listIds: r.listIds, perPlayer: r.perPlayer }, { ...fallback, packs: [] });
  return {
    builtIn: typeof r.builtIn === 'boolean' ? r.builtIn : fallback.builtIn,
    spicy: typeof r.spicy === 'boolean' ? r.spicy : fallback.spicy,
    listIds: base.listIds,
    perPlayer: base.perPlayer,
  };
}

export function buildPromptPool({
  source,
  builtIn,
  spicy = [],
  lists = {},
  collected = [],
}: {
  source: PromptSource;
  builtIn: readonly string[];
  spicy?: readonly string[];
  lists?: Record<string, readonly string[]>;
  collected?: ReadonlyArray<{ text: string; author: SeatIndex }>;
}): PoolEntry[] {
  const seen = new Set<string>();
  const out: PoolEntry[] = [];
  const add = (raw: string, author: SeatIndex | null) => {
    const text = raw.replace(/\s+/g, ' ').trim().slice(0, MAX_ENTRY_LENGTH);
    const key = entryKey(text);
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push({ text, author, pack: null });
  };
  for (const c of collected) add(c.text, c.author);
  for (const id of source.listIds) for (const w of lists[id] ?? []) add(w, null);
  if (source.builtIn) for (const w of builtIn) add(w, null);
  if (source.spicy) for (const w of spicy) add(w, null);
  return out;
}

export function promptSourceProblem(
  source: PromptSource,
  listSizes: Record<string, number>,
  playerCount: number,
  minEntries: number,
  builtInCount: number,
): string | null {
  if (!source.builtIn && !source.spicy && source.listIds.length === 0 && source.perPlayer === 0) {
    return 'Use the built-in list, a saved list, or have players write their own.';
  }
  let n = source.perPlayer * playerCount + (source.builtIn ? builtInCount : 0) + (source.spicy ? 1 : 0);
  for (const id of source.listIds) n += listSizes[id] ?? 0;
  if (n < minEntries) return `That's only about ${n} — this game needs at least ${minEntries}.`;
  return null;
}

export function describePromptSource(source: PromptSource, noun: string): string {
  const parts: string[] = [];
  if (source.builtIn) parts.push(`built-in ${noun}`);
  if (source.spicy) parts.push('18+');
  if (source.listIds.length > 0) parts.push(`${source.listIds.length} host list${source.listIds.length === 1 ? '' : 's'}`);
  if (source.perPlayer > 0) parts.push(`${source.perPlayer} from each player`);
  return parts.join(' · ') || `No ${noun} chosen`;
}
