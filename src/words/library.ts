// The host's saved word lists ("My lists"), kept in this browser's
// localStorage. A list is the "bring your own vocabulary" option for hosts:
// paste or type entries once, reuse them in any game.
//
// Privacy: lists never go into the world-readable lobby. Options carry only
// list ids; `resolveLists` turns them into entries on the host at match
// start (`GameConfig.lists`), and from there they're private game state like
// any other deck.

import { cleanPair } from './collect';
import { cleanEntry, entryKey } from './source';

export type ListKind = 'words' | 'prompts' | 'spectrums';

export interface SavedList {
  id: string;
  name: string;
  kind: ListKind;
  entries: string[];
  updatedAt: number;
}

const KEY = 'party-games.lists.v1';
export const MAX_LIST_ENTRIES = 1000;

type Listener = () => void;
const listeners = new Set<Listener>();
let cache: SavedList[] | null = null;

function storage(): Storage | null {
  try {
    return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null;
  } catch {
    return null;
  }
}

function isList(x: unknown): x is SavedList {
  const l = x as Partial<SavedList> | null;
  return (
    !!l &&
    typeof l.id === 'string' &&
    typeof l.name === 'string' &&
    (l.kind === 'words' || l.kind === 'prompts' || l.kind === 'spectrums') &&
    Array.isArray(l.entries)
  );
}

export function loadLists(): SavedList[] {
  if (cache) return cache;
  let parsed: unknown = [];
  try {
    parsed = JSON.parse(storage()?.getItem(KEY) ?? '[]');
  } catch {
    parsed = [];
  }
  cache = Array.isArray(parsed) ? parsed.filter(isList) : [];
  return cache;
}

function persist(lists: SavedList[]): void {
  cache = lists;
  try {
    storage()?.setItem(KEY, JSON.stringify(lists));
  } catch {
    // Quota / privacy mode: the list still works for this session.
  }
  for (const l of listeners) l();
}

export function subscribeLists(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function newListId(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  const rand = c?.randomUUID ? c.randomUUID().replace(/-/g, '').slice(0, 12) : Math.random().toString(36).slice(2, 14);
  return `l${rand}`;
}

export function saveList(list: SavedList): void {
  const lists = loadLists().filter((l) => l.id !== list.id);
  persist([{ ...list, entries: list.entries.slice(0, MAX_LIST_ENTRIES), updatedAt: Date.now() }, ...lists]);
}

export function deleteList(id: string): void {
  persist(loadLists().filter((l) => l.id !== id));
}

/**
 * Parse pasted text into clean, de-duplicated entries: one per line (commas
 * also split, except for spectrum pairs written "Left | Right").
 */
export function parseListText(text: string, kind: ListKind): string[] {
  const rows = kind === 'spectrums' ? text.split(/\n/) : text.split(/[\n,;]/);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const row of rows) {
    const clean = kind === 'spectrums' ? cleanPair(row) : cleanEntry(row);
    const key = entryKey(clean);
    if (!clean || !key || seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
    if (out.length >= MAX_LIST_ENTRIES) break;
  }
  return out;
}

/** Every `listIds` array anywhere in an options object. */
export function referencedListIds(options: unknown): string[] {
  const out = new Set<string>();
  const walk = (v: unknown, depth: number) => {
    if (!v || typeof v !== 'object' || depth > 6) return;
    for (const [k, child] of Object.entries(v as Record<string, unknown>)) {
      if (k === 'listIds' && Array.isArray(child)) {
        for (const id of child) if (typeof id === 'string') out.add(id);
      } else walk(child, depth + 1);
    }
  };
  walk(options, 0);
  return [...out];
}

/** Host-only: entries for every list the options reference (missing ones are skipped). */
export function resolveLists(options: unknown): Record<string, string[]> {
  const byId = new Map(loadLists().map((l) => [l.id, l]));
  const out: Record<string, string[]> = {};
  for (const id of referencedListIds(options)) {
    const l = byId.get(id);
    if (l) out[id] = l.entries.slice();
  }
  return out;
}

/** Entry counts per list id (setup-screen pool estimates). */
export function listSizes(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const l of loadLists()) out[l.id] = l.entries.length;
  return out;
}

/** Tests only. */
export function resetListCacheForTests(): void {
  cache = null;
}
