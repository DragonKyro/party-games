import { beforeEach, describe, expect, it } from 'vitest';
import {
  cleanPair,
  collectComplete,
  collectReduce,
  collectView,
  collectedEntries,
  splitPair,
  startCollect,
} from './collect';
import {
  deleteList,
  loadLists,
  parseListText,
  referencedListIds,
  resetListCacheForTests,
  resolveLists,
  saveList,
} from './library';
import { containsAnswer, editDistance, hintCells, isCloseGuess, isCorrectGuess, normalizeGuess } from './match';
import { buildPool, cleanEntry, describeSource, entryKey, readSource, sourceProblem } from './source';
import { WORD_PACKS } from './index';

describe('source', () => {
  it('cleans and keys entries', () => {
    expect(cleanEntry('  Taylor   Swift ')).toBe('Taylor Swift');
    expect(cleanEntry(42)).toBe('');
    expect(entryKey('Déjà vu!')).toBe(entryKey('deja VU'));
  });

  it('reads untrusted options defensively', () => {
    const fb = { packs: ['animals' as const], listIds: [], perPlayer: 0 };
    expect(readSource(null, fb)).toEqual(fb);
    expect(readSource({ packs: ['food', 'nope', 'food'], listIds: ['a', 7], perPlayer: 99 }, fb)).toEqual({
      packs: ['food'],
      listIds: ['a'],
      perPlayer: 10,
    });
  });

  it('builds one deduplicated pool, collected words first with their authors', () => {
    const pool = buildPool({
      source: { packs: ['animals'], listIds: ['L1', 'missing'], perPlayer: 2 },
      lists: { L1: ['Kazoo', 'kazoo', 'Penguin'] },
      collected: [
        { text: 'Penguin', author: 1 },
        { text: 'Grandma', author: 0 },
      ],
    });
    expect(pool[0]).toEqual({ text: 'Penguin', author: 1, pack: null });
    expect(pool[1]).toEqual({ text: 'Grandma', author: 0, pack: null });
    expect(pool[2]).toEqual({ text: 'Kazoo', author: null, pack: null });
    expect(pool.filter((p) => entryKey(p.text) === 'penguin')).toHaveLength(1);
    expect(pool.some((p) => p.pack === 'animals')).toBe(true);
    expect(buildPool({ source: { packs: ['animals'], listIds: [], perPlayer: 0 }, skipPacks: true })).toEqual([]);
  });

  it('explains empty or small sources', () => {
    expect(sourceProblem({ packs: [], listIds: [], perPlayer: 0 }, {}, 4, 10)).toMatch(/at least one/);
    expect(sourceProblem({ packs: [], listIds: ['x'], perPlayer: 1 }, { x: 3 }, 4, 10)).toMatch(/only about 7/);
    expect(sourceProblem({ packs: [], listIds: [], perPlayer: 3 }, {}, 4, 10)).toBeNull();
    expect(describeSource({ packs: ['animals', 'food'], listIds: ['a'], perPlayer: 4 })).toBe(
      `${WORD_PACKS.animals.name} + ${WORD_PACKS.food.name} · 1 host list · 4 from each player`,
    );
  });
});

describe('collect', () => {
  const seats = 3;
  it('accepts exactly perPlayer clean, unique entries and tracks who is done', () => {
    let s = startCollect('words', 2, 'Write two');
    expect(() => collectReduce(s, { type: 'collect.submit', bySeat: 0, entries: ['a'] }, seats)).toThrow(/exactly 2/);
    expect(() => collectReduce(s, { type: 'collect.submit', bySeat: 0, entries: ['a', ' A '] }, seats)).toThrow(
      /duplicates/,
    );
    expect(() => collectReduce(s, { type: 'collect.submit', bySeat: 0, entries: ['a', '  '] }, seats)).toThrow();
    expect(() => collectReduce(s, { type: 'collect.submit', bySeat: 7, entries: ['a', 'b'] }, seats)).toThrow();
    s = collectReduce(s, { type: 'collect.submit', bySeat: 0, entries: ['  Mr  Bean', 'Paris'] }, seats);
    s = collectReduce(s, { type: 'collect.submit', bySeat: 2, entries: ['Moon', 'Cheese'] }, seats);
    expect(collectComplete(s, seats)).toBe(false);
    s = collectReduce(s, { type: 'collect.reopen', bySeat: 2 }, seats);
    expect(collectedEntries(s).map((e) => e.text)).toEqual(['Mr Bean', 'Paris']);
    s = collectReduce(s, { type: 'collect.submit', bySeat: 2, entries: ['Moon', 'Cheese'] }, seats);
    s = collectReduce(s, { type: 'collect.submit', bySeat: 1, entries: ['Tea', 'Toast'] }, seats);
    expect(collectComplete(s, seats)).toBe(true);
    expect(collectedEntries(s).map((e) => e.author)).toEqual([0, 0, 1, 1, 2, 2]);
  });

  it('shows a seat only its own entries', () => {
    let s = startCollect('words', 1, 'Write one');
    s = collectReduce(s, { type: 'collect.submit', bySeat: 0, entries: ['Secret slip'] }, seats);
    expect(collectView(s, 0, seats)).toMatchObject({ yours: ['Secret slip'], done: [true, false, false] });
    for (const seat of [1, 2, null]) {
      const v = collectView(s, seat, seats);
      expect(v.yours).toBeNull();
      expect(JSON.stringify(v)).not.toContain('Secret');
    }
  });

  it('validates spectrum pairs', () => {
    expect(cleanPair(' cold |  HOT ')).toBe('cold | HOT');
    expect(cleanPair('cold')).toBe('');
    expect(cleanPair('a | A')).toBe('');
    expect(cleanPair('a | b | c')).toBe('');
    expect(splitPair('Cold | Hot')).toEqual(['Cold', 'Hot']);
    const s = startCollect('pairs', 1, 'Write a spectrum');
    expect(() => collectReduce(s, { type: 'collect.submit', bySeat: 0, entries: ['oops'] }, seats)).toThrow(/two/);
  });
});

describe('match', () => {
  it('forgives case, accents, punctuation, spacing, articles and plurals', () => {
    expect(normalizeGuess('  The   Eiffel-Tower! ')).toBe('eiffel tower');
    expect(isCorrectGuess('eiffel tower', 'The Eiffel Tower')).toBe(true);
    expect(isCorrectGuess('icecream', 'Ice cream')).toBe(true);
    expect(isCorrectGuess('crème brûlée', 'Creme brulee')).toBe(true);
    expect(isCorrectGuess('penguins', 'Penguin')).toBe(true);
    expect(isCorrectGuess('puppies', 'Puppy')).toBe(true);
    expect(isCorrectGuess('pen', 'Penguin')).toBe(false);
    expect(isCorrectGuess('', 'x')).toBe(false);
  });

  it('flags near misses only', () => {
    expect(isCloseGuess('pengiun', 'Penguin')).toBe(true);
    expect(isCloseGuess('cat', 'Bat')).toBe(true);
    expect(isCloseGuess('penguin', 'Penguin')).toBe(false);
    expect(isCloseGuess('dog', 'Penguin')).toBe(false);
    expect(editDistance('kitten', 'sitting')).toBe(3);
    expect(editDistance('kitten', 'sitting', 1)).toBe(2);
  });

  it('detects giveaways and builds hint cells', () => {
    expect(containsAnswer('it is a big PENGUIN', 'Penguin')).toBe(true);
    expect(containsAnswer('flightless bird', 'Penguin')).toBe(false);
    expect(hintCells('Ice cream!', [0])).toEqual(['I', '_', '_', ' ', '_', '_', '_', '_', '_', '!']);
  });
});

describe('library', () => {
  beforeEach(() => {
    window.localStorage.clear();
    resetListCacheForTests();
  });

  it('parses pasted text into clean unique entries', () => {
    expect(parseListText('Cat\n cat \nDog, Fish;\n\n', 'words')).toEqual(['Cat', 'Dog', 'Fish']);
    expect(parseListText('Cold | Hot\nnot a pair\nSoft|Hard', 'spectrums')).toEqual(['Cold | Hot', 'Soft | Hard']);
  });

  it('saves, resolves only referenced lists, and deletes', () => {
    saveList({ id: 'L1', name: 'Inside jokes', kind: 'words', entries: ['Gary', 'The van'], updatedAt: 0 });
    saveList({ id: 'L2', name: 'Other', kind: 'words', entries: ['x'], updatedAt: 0 });
    resetListCacheForTests();
    expect(loadLists().map((l) => l.id).sort()).toEqual(['L1', 'L2']);
    const options = { words: { packs: [], listIds: ['L1', 'gone'], perPlayer: 0 }, other: { deep: { listIds: ['L1'] } } };
    expect(referencedListIds(options)).toEqual(['L1', 'gone']);
    expect(resolveLists(options)).toEqual({ L1: ['Gary', 'The van'] });
    deleteList('L1');
    expect(resolveLists(options)).toEqual({});
  });
});
