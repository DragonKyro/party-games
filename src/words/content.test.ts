import { describe, expect, it } from 'vitest';
import { PACK_LIST } from './index';
import { RANK_CRITERIA, RANK_CRITERIA_SPICY } from './prompts/rank';
import { SPECTRUMS, SPECTRUMS_SPICY, type Spectrum } from './prompts/spectrums';
import { entryKey } from './source';

const MAX_PACK_ENTRY = 40;
const MAX_SPECTRUM_SIDE = 24;

/** Non-empty, already trimmed, no runs of whitespace, within `max` chars. */
function isClean(text: unknown, max: number): boolean {
  return (
    typeof text === 'string' &&
    text.length > 0 &&
    text.length <= max &&
    text === text.trim() &&
    !/\s\s/.test(text) &&
    entryKey(text) !== ''
  );
}

/** Every item whose key was already seen earlier in the list. */
function duplicates<T>(list: readonly T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  const dupes: T[] = [];
  for (const item of list) {
    const k = key(item);
    if (seen.has(k)) dupes.push(item);
    seen.add(k);
  }
  return dupes;
}

/** Order-insensitive, so ['Hot', 'Cold'] also clashes with ['Cold', 'Hot']. */
const spectrumKey = ([left, right]: Spectrum) => [entryKey(left), entryKey(right)].sort().join('|');

describe('built-in word packs', () => {
  it.each(PACK_LIST.map((pack) => [pack.id, pack] as const))('%s', (_id, pack) => {
    expect(pack.words.length).toBeGreaterThanOrEqual(80);
    expect(pack.words.filter((w) => !isClean(w, MAX_PACK_ENTRY))).toEqual([]);
    expect(duplicates(pack.words, entryKey)).toEqual([]);
  });
});

describe('rank criteria', () => {
  it('has enough criteria for every audience', () => {
    expect(RANK_CRITERIA.length).toBeGreaterThanOrEqual(120);
    expect(RANK_CRITERIA_SPICY.length).toBeGreaterThanOrEqual(30);
  });

  it('are clean and unique, including across the spicy list', () => {
    const all = [...RANK_CRITERIA, ...RANK_CRITERIA_SPICY];
    expect(all.filter((c) => !isClean(c, Infinity))).toEqual([]);
    expect(duplicates(all, entryKey)).toEqual([]);
  });
});

describe('spectrums', () => {
  it('has enough spectrums for every audience', () => {
    expect(SPECTRUMS.length).toBeGreaterThanOrEqual(150);
    expect(SPECTRUMS_SPICY.length).toBeGreaterThanOrEqual(30);
  });

  it('have two short, clean, different ends', () => {
    const all = [...SPECTRUMS, ...SPECTRUMS_SPICY];
    expect(all.filter((s) => s.length !== 2)).toEqual([]);
    expect(all.filter(([l, r]) => !isClean(l, MAX_SPECTRUM_SIDE) || !isClean(r, MAX_SPECTRUM_SIDE))).toEqual([]);
    expect(all.filter(([l, r]) => entryKey(l) === entryKey(r))).toEqual([]);
  });

  it('are unique, including reversed pairs and across the spicy list', () => {
    expect(duplicates([...SPECTRUMS, ...SPECTRUMS_SPICY], spectrumKey)).toEqual([]);
  });
});
