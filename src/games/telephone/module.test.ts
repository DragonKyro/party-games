import { describe, expect, it } from 'vitest';
import { CANVAS_W, MAX_ENCODED_DRAWING, decodeDrawing, encodeDrawing, type Drawing } from '@/draw/drawing';
import { SCHEDULER, type GameConfig } from '@/engine/types';
import type { TelephoneAction } from './actions';
import { GRACE_MS, HURRY_MS, VIEW_DRAWING_BUDGET, telephoneModule as mod } from './module';
import {
  BLANK_DRAWING,
  NO_GUESS,
  bookHeldBy,
  chainLength,
  encodeToFit,
  holderOf,
  optionsProblem,
  readOptions,
  stepKind,
} from './rules';
import type { TelephoneState, TelephoneView } from './state';

const NAMES = ['Ana', 'Ben', 'Cai', 'Dee', 'Eli'];
const N = NAMES.length;
const SEATS = NAMES.map((_, i) => i);

function config(options: Record<string, unknown> = {}, names = NAMES, online = true): GameConfig {
  return {
    gameId: 'telephone',
    seats: names.map((name, index) => ({ index, uuid: online ? `uid-${index}` : null, name })),
    seed: 4242,
    now: 0,
    gameOptions: { ...mod.defaultOptions(), ...options },
    lists: {},
  };
}

let clock = 1_000;
function act(s: TelephoneState, a: TelephoneAction, now = clock): TelephoneState {
  return mod.applyAction(s, a, { by: '', now });
}

const writeOwn = { words: { packs: [], listIds: [], perPlayer: 1 } };

/** A distinct, valid drawing per (book, step), so tests can find it in a view. */
function drawingFor(book: number, step: number): string {
  return encodeDrawing([{ c: 1, w: 1, pts: [10 + book * 7, 10 + step * 7, 300 + book, 200 + step, 500, 400] }]);
}
const guessFor = (book: number, step: number) => `guess b${book} s${step}`;

/** Every seat submits its page for the current step (or only `who`). */
function playStep(s: TelephoneState, who: number[] = SEATS.slice(0, s.seats.length)): TelephoneState {
  const n = s.seats.length;
  const step = s.stepIndex;
  for (const seat of who) {
    const b = bookHeldBy(seat, step, n);
    s =
      stepKind(step) === 'draw'
        ? act(s, { type: 'draw', bySeat: seat, step, drawing: drawingFor(b, step) })
        : act(s, { type: 'guess', bySeat: seat, step, text: guessFor(b, step) });
  }
  return s;
}

/** Choose mode: everyone picks; the passing starts. */
function started(options: Record<string, unknown> = {}, names = NAMES, online = true): TelephoneState {
  let s = mod.createInitialState(config(options, names, online));
  for (let i = 0; i < names.length; i++) s = act(s, { type: 'pick', bySeat: i, choice: i % 3 });
  expect(s.phase).toBe('step');
  return s;
}

function toReveal(options: Record<string, unknown> = {}, names = NAMES): TelephoneState {
  let s = started(options, names);
  while (s.phase === 'step') s = playStep(s);
  expect(s.phase).toBe('reveal');
  return s;
}

const json = (v: TelephoneView) => JSON.stringify(v);
const quoted = (text: string) => JSON.stringify(text);

/** Every page's content in the state, as it would appear in view JSON. */
function allContent(s: TelephoneState): Array<{ book: number; index: number; marker: string }> {
  const out: Array<{ book: number; index: number; marker: string }> = [];
  s.books.forEach((b, book) =>
    b.pages.forEach((p, index) => out.push({ book, index, marker: quoted(p.kind === 'draw' ? p.drawing : p.text) })),
  );
  return out;
}

// ============================================================================

describe('rules', () => {
  it('chains visit every other player once and always end on a guess', () => {
    expect(chainLength(3)).toBe(2);
    expect(chainLength(4)).toBe(4);
    expect(chainLength(5)).toBe(4);
    expect(chainLength(6)).toBe(6);
    expect(chainLength(16)).toBe(16);
    for (let n = 3; n <= 16; n++) {
      const L = chainLength(n);
      expect(stepKind(L)).toBe('guess');
      // An even table adds a final guess, by the book's own owner.
      if (n % 2 === 0) expect(holderOf(2, L, n)).toBe(2);
      else expect(L).toBe(n - 1);
    }
  });

  it('caps long chains but still ends on a guess', () => {
    expect(chainLength(12, 4)).toBe(4);
    expect(chainLength(12, 5)).toBe(6);
    expect(chainLength(4, 9)).toBe(4);
    expect(chainLength(16, 3)).toBe(4);
    expect(chainLength(16, 2)).toBe(2);
  });

  it('rotates books: book b at step s is held by seat (b + s) % n', () => {
    expect(holderOf(0, 1, 5)).toBe(1);
    expect(holderOf(4, 3, 5)).toBe(2);
    for (let s = 0; s < 8; s++) for (let b = 0; b < 5; b++) expect(bookHeldBy(holderOf(b, s, 5), s, 5)).toBe(b);
  });

  it('reads untrusted options', () => {
    const o = readOptions({
      words: { packs: ['animals', 'nope'], listIds: [], perPlayer: 4 },
      drawSeconds: 9999,
      guessSeconds: -3,
      timed: 'yes',
      maxSteps: -2,
    });
    expect(o.words).toEqual({ packs: ['animals'], listIds: [], perPlayer: 1 });
    expect(o.drawSeconds).toBe(240);
    expect(o.guessSeconds).toBe(10);
    expect(o.timed).toBe(true);
    expect(o.maxSteps).toBe(0);
    expect(readOptions({ maxSteps: 1 }).maxSteps).toBe(2);
    expect(readOptions(undefined)).toEqual(readOptions(mod.defaultOptions()));
    expect(readOptions(mod.defaultOptions()).words.packs).toEqual(['actions', 'idioms', 'everyday', 'characters']);
  });

  it('flags impossible setups', () => {
    expect(optionsProblem({ words: { packs: [], listIds: [], perPlayer: 0 } }, 5)).toMatch(/prompts come from/);
    expect(optionsProblem(mod.defaultOptions(), 2)).toMatch(/3 players/);
    expect(optionsProblem(mod.defaultOptions(), 3)).toBeNull();
  });

  it('fits big drawings under the cap', () => {
    const wiggle: Drawing = Array.from({ length: 120 }, (_, k) => ({
      c: 1 + (k % 10),
      w: k % 4,
      pts: Array.from({ length: 400 }, (_, i) => (i % 2 === 0 ? (i * 7919 + k * 104729) % CANVAS_W : (i * 6007 + k * 3571) % 600)),
    }));
    expect(encodeDrawing(wiggle).length).toBeGreaterThan(MAX_ENCODED_DRAWING);
    const fit = encodeToFit(wiggle);
    expect(fit.length).toBeLessThanOrEqual(MAX_ENCODED_DRAWING);
    expect(() => decodeDrawing(fit)).not.toThrow();
    const small = decodeDrawing(drawingFor(1, 1));
    expect(encodeToFit(small)).toBe(drawingFor(1, 1));
  });
});

describe('setup', () => {
  it('deals three different prompts to each player, no repeats round the table', () => {
    const s = mod.createInitialState(config());
    expect(s.phase).toBe('prompt');
    expect(s.promptMode).toBe('choose');
    expect(s.totalSteps).toBe(4);
    expect(s.choices).toHaveLength(N);
    for (const c of s.choices) expect(c).toHaveLength(3);
    expect(new Set(s.choices.flat()).size).toBe(N * 3);
    expect(s.books.every((b, i) => b.owner === i && b.pages.length === 0)).toBe(true);
  });

  it('deals from the host’s lists', () => {
    const s = mod.createInitialState({
      ...config({ words: { packs: [], listIds: ['L'], perPlayer: 0 } }),
      lists: { L: Array.from({ length: 20 }, (_, i) => `Inside joke ${i}`) },
    });
    expect(s.choices.flat().every((t) => t.startsWith('Inside joke'))).toBe(true);
  });

  it('refuses bad tables and empty pools', () => {
    expect(() => mod.createInitialState(config({}, ['a', 'b']))).toThrow(/3–16/);
    expect(() => mod.createInitialState(config({}, Array.from({ length: 17 }, (_, i) => `p${i}`)))).toThrow(/3–16/);
    expect(() => mod.createInitialState(config({ words: { packs: [], listIds: ['missing'], perPlayer: 0 } }))).toThrow(
      /No prompts/,
    );
  });

  it('caps the chain with maxSteps', () => {
    const names = Array.from({ length: 12 }, (_, i) => `P${i}`);
    expect(mod.createInitialState(config({ maxSteps: 5 }, names)).totalSteps).toBe(6);
    expect(mod.createInitialState(config({}, names)).totalSteps).toBe(12);
  });
});

describe('prompts', () => {
  it('everyone picks one (and may change their mind) — then the first drawing starts', () => {
    let s = mod.createInitialState(config());
    expect(() => act(s, { type: 'pick', bySeat: 0, choice: 3 })).toThrow(/choice/);
    expect(() => act(s, { type: 'pick', bySeat: 9, choice: 0 })).toThrow(/seat/);
    s = act(s, { type: 'pick', bySeat: 0, choice: 2 });
    s = act(s, { type: 'pick', bySeat: 0, choice: 1 });
    expect(mod.viewFor(s, 0).picked).toBe(1);
    expect(mod.viewFor(s, 1).doneCount).toBe(1);
    for (let i = 1; i < N; i++) s = act(s, { type: 'pick', bySeat: i, choice: 0 });
    expect(s.phase).toBe('step');
    expect(s.stepIndex).toBe(1);
    expect(s.books[0]!.pages[0]).toMatchObject({ kind: 'prompt', by: 0, text: s.choices[0]![1], written: false });
    expect(s.books[3]!.pages[0]).toMatchObject({ text: s.choices[3]![0] });
    expect(s.timer).toEqual({ durationMs: 75_000, endsAt: clock + 75_000, remainingMs: 75_000 });
    expect(() => act(s, { type: 'pick', bySeat: 0, choice: 0 })).toThrow(/Not picking/);
  });

  it('the host can stop waiting; stragglers get one of their options', () => {
    let s = mod.createInitialState(config());
    s = act(s, { type: 'pick', bySeat: 2, choice: 2 });
    expect(() => act(s, { type: 'advance', step: 0, bySeat: 2 } as never)).toThrow(/host/);
    s = act(s, { type: 'advance', step: 0 });
    expect(s.phase).toBe('step');
    expect(s.books[2]!.pages[0]!).toMatchObject({ text: s.choices[2]![2] });
    expect(s.books[0]!.pages[0]!).toMatchObject({ text: s.choices[0]![0] });
  });

  it('players can write their own prompt; the host can close, and no-shows get a dealt one', () => {
    let s = mod.createInitialState(config(writeOwn));
    expect(s.phase).toBe('prompt');
    expect(s.promptMode).toBe('write');
    expect(s.collect?.perPlayer).toBe(1);
    expect(() => act(s, { type: 'pick', bySeat: 0, choice: 0 })).toThrow(/Not picking/);
    s = act(s, { type: 'collect.submit', bySeat: 0, entries: ['A cat running for mayor'] });
    s = act(s, { type: 'collect.submit', bySeat: 1, entries: ['Grandma on a skateboard'] });
    expect(() => act(s, { type: 'collect.close', bySeat: 1 } as never)).toThrow(/host/);
    s = act(s, { type: 'collect.close' });
    expect(s.phase).toBe('step');
    expect(s.books[0]!.pages[0]).toMatchObject({ text: 'A cat running for mayor', written: true, by: 0 });
    expect(s.books[1]!.pages[0]).toMatchObject({ text: 'Grandma on a skateboard', written: true });
    // No packs chosen: the default packs stand in for those who didn't write.
    expect(s.books[4]!.pages[0]).toMatchObject({ written: false, by: 4 });
    expect((s.books[4]!.pages[0] as { text: string }).text.length).toBeGreaterThan(0);
  });

  it('starts as soon as everyone has written one', () => {
    let s = mod.createInitialState(config(writeOwn));
    for (let i = 0; i < N; i++) s = act(s, { type: 'collect.submit', bySeat: i, entries: [`Prompt number ${i}`] });
    expect(s.phase).toBe('step');
    expect(s.books.map((b) => (b.pages[0] as { text: string }).text)).toEqual(SEATS.map((i) => `Prompt number ${i}`));
  });
});

describe('steps', () => {
  it('passes every book round the table: draw, guess, draw, guess', () => {
    let s = started();
    while (s.phase === 'step') s = playStep(s);
    for (const book of s.books) {
      const b = book.owner;
      expect(book.pages).toHaveLength(s.totalSteps + 1);
      expect(book.pages.map((p) => p.kind)).toEqual(['prompt', 'draw', 'guess', 'draw', 'guess']);
      // Each other player exactly once.
      const by = book.pages.map((p) => p.by);
      expect(by[0]).toBe(b);
      expect(new Set(by.slice(1)).size).toBe(N - 1);
      expect(by.slice(1)).not.toContain(b);
      book.pages.forEach((p, step) => {
        if (step > 0) expect(p.by).toBe(holderOf(b, step, N));
        if (p.kind === 'draw') expect(p.drawing).toBe(drawingFor(b, step));
        if (p.kind === 'guess') expect(p.text).toBe(guessFor(b, step));
      });
    }
  });

  it('with an even table the owner makes the final guess', () => {
    const names = ['Ana', 'Ben', 'Cai', 'Dee'];
    let s = started({}, names);
    expect(s.totalSteps).toBe(4);
    while (s.phase === 'step') s = playStep(s);
    for (const book of s.books) {
      expect(book.pages).toHaveLength(5);
      expect(book.pages[4]).toMatchObject({ kind: 'guess', by: book.owner });
    }
  });

  it('a step waits for everyone, then the next one starts with its own clock', () => {
    let s = started();
    s = playStep(s, [0, 1, 2, 3]);
    expect(s.stepIndex).toBe(1);
    expect(mod.viewFor(s, 0).doneCount).toBe(4);
    s = playStep(s, [4]);
    expect(s.stepIndex).toBe(2);
    expect(s.timer!.durationMs).toBe(30_000);
    expect(s.hurried).toBe(false);
  });

  it('validates every page', () => {
    const s = started();
    const d = drawingFor(1, 1);
    expect(() => act(s, { type: 'guess', bySeat: 0, step: 1, text: 'hi' })).toThrow(/drawing, not a guess/);
    expect(() => act(s, { type: 'draw', bySeat: 0, step: 2, drawing: d })).toThrow(/over/);
    expect(() => act(s, { type: 'draw', bySeat: 7, step: 1, drawing: d })).toThrow(/seat/);
    expect(() => act(s, { type: 'draw', bySeat: 0, step: 1, drawing: 'nope' })).toThrow(/drawing/);
    expect(() => act(s, { type: 'draw', bySeat: 0, step: 1, drawing: 42 as never })).toThrow(/drawing/);
    expect(() => act(s, { type: 'draw', bySeat: 0, step: 1, drawing: 'd1;' + 'A'.repeat(MAX_ENCODED_DRAWING) })).toThrow(
      /too detailed/,
    );
    // Off the canvas / not in the palette.
    expect(() => act(s, { type: 'draw', bySeat: 0, step: 1, drawing: 'd1;zB' + 'AA' })).toThrow(/drawing/);
    const once = act(s, { type: 'draw', bySeat: 0, step: 1, drawing: d });
    expect(() => act(once, { type: 'draw', bySeat: 0, step: 1, drawing: d })).toThrow(/already/);

    let g = playStep(s);
    expect(() => act(g, { type: 'draw', bySeat: 0, step: 2, drawing: d })).toThrow(/guess, not a drawing/);
    expect(() => act(g, { type: 'guess', bySeat: 0, step: 2, text: '   ' })).toThrow(/guess first/);
    expect(() => act(g, { type: 'guess', bySeat: 0, step: 2, text: 'x'.repeat(61) })).toThrow(/60/);
    g = act(g, { type: 'guess', bySeat: 0, step: 2, text: '  a   dog\n walking ' });
    expect(g.books[bookHeldBy(0, 2, N)]!.pages[2]).toMatchObject({ kind: 'guess', text: 'a dog walking', missed: false });
  });

  it('stores drawings in canonical form', () => {
    const s = started();
    // Same strokes, with an empty trailing segment thrown in.
    const raw = drawingFor(4, 1) + ';';
    const next = act(s, { type: 'draw', bySeat: 0, step: 1, drawing: raw });
    expect((next.books[bookHeldBy(0, 1, N)]!.pages[1] as { drawing: string }).drawing).toBe(drawingFor(4, 1));
  });

  it('untimed games have no clock and nothing scheduled', () => {
    const s = started({ timed: false });
    expect(s.timer).toBeNull();
    expect(mod.nextScheduled!(s)).toBeNull();
    expect(mod.viewFor(s, 0).timer).toBeNull();
  });

  it('one device: no shared clock (each player times their own turn), and no “hurry”', () => {
    const s = started({}, NAMES, false);
    expect(s.local).toBe(true);
    expect(s.timer).toBeNull();
    expect(mod.nextScheduled!(s)).toBeNull();
    expect(mod.viewFor(s, null).local).toBe(true);
    expect(() => act(s, { type: 'hurry', step: 1 })).toThrow(/one device/);
    const next = act(s, { type: 'advance', step: 1 });
    expect(next.stepIndex).toBe(2);
  });
});

describe('scheduling', () => {
  it('the buzzer fires after a grace period and fills the gaps', () => {
    let s = started();
    s = playStep(s, [0, 2]);
    const sched = mod.nextScheduled!(s)!;
    expect(sched.at).toBe(s.timer!.endsAt! + GRACE_MS);
    expect(sched.action).toEqual({ type: 'timeUp', step: 1 });
    expect(() => act(s, sched.action, s.timer!.endsAt! + 500)).toThrow(/not up/);
    expect(() => act(s, { type: 'timeUp', step: 2 }, sched.at)).toThrow(/Stale/);
    expect(() => mod.applyAction(s, { type: 'timeUp', step: 1, bySeat: 0 } as never, { by: 'x', now: sched.at })).toThrow(
      /host/,
    );
    const next = mod.applyAction(s, sched.action, { by: SCHEDULER, now: sched.at });
    expect(next.stepIndex).toBe(2);
    const held0 = bookHeldBy(0, 1, N);
    const held1 = bookHeldBy(1, 1, N);
    expect(next.books[held0]!.pages[1]).toMatchObject({ kind: 'draw', by: 0, missed: false, drawing: drawingFor(held0, 1) });
    expect(next.books[held1]!.pages[1]).toMatchObject({ kind: 'draw', by: 1, missed: true, drawing: BLANK_DRAWING });
    expect(next.timer).toEqual({ durationMs: 30_000, endsAt: sched.at + 30_000, remainingMs: 30_000 });

    // A guess-step buzzer fills in "(no guess)".
    const after = mod.applyAction(next, mod.nextScheduled!(next)!.action, { by: SCHEDULER, now: sched.at + 40_000 });
    expect(after.books[0]!.pages[2]).toMatchObject({ kind: 'guess', text: NO_GUESS, missed: true });
  });

  it('a page that races the buzzer still counts', () => {
    const s = started();
    const late = s.timer!.endsAt! + GRACE_MS - 100;
    const next = act(s, { type: 'draw', bySeat: 3, step: 1, drawing: drawingFor(2, 1) }, late);
    expect(next.books[bookHeldBy(3, 1, N)]!.pages[1]).toMatchObject({ missed: false });
    // …but not once the step has moved on.
    const moved = act(s, { type: 'timeUp', step: 1 }, s.timer!.endsAt! + GRACE_MS);
    expect(() => act(moved, { type: 'draw', bySeat: 3, step: 1, drawing: drawingFor(2, 1) })).toThrow(/over/);
  });

  it('hurry gives everyone ten seconds (never more than they had)', () => {
    let s = started();
    expect(() => act(s, { type: 'hurry', step: 1, bySeat: 0 } as never)).toThrow(/host/);
    expect(() => act(s, { type: 'hurry', step: 2 })).toThrow(/over/);
    s = act(s, { type: 'hurry', step: 1 }, clock + 5_000);
    expect(s.hurried).toBe(true);
    expect(s.timer!.endsAt).toBe(clock + 5_000 + HURRY_MS);
    expect(mod.viewFor(s, 1).hurried).toBe(true);
    const again = act(s, { type: 'hurry', step: 1 }, clock + 9_000);
    expect(again.timer!.endsAt).toBe(clock + 5_000 + HURRY_MS);
    expect(mod.nextScheduled!(again)!.at).toBe(clock + 5_000 + HURRY_MS + GRACE_MS);

    // Untimed: hurry starts a clock.
    const untimed = act(started({ timed: false }), { type: 'hurry', step: 1 });
    expect(untimed.timer!.endsAt).toBe(clock + HURRY_MS);
    expect(mod.nextScheduled!(untimed)!.action).toEqual({ type: 'timeUp', step: 1 });
  });

  it('the host can force the step on', () => {
    let s = playStep(started(), [1]);
    expect(() => act(s, { type: 'advance', step: 1, bySeat: 1 } as never)).toThrow(/host/);
    s = act(s, { type: 'advance', step: 1 });
    expect(s.stepIndex).toBe(2);
    expect(() => act(s, { type: 'advance', step: 1 })).toThrow(/over/);
    expect(s.books.filter((b) => b.pages[1]!.missed)).toHaveLength(N - 1);
  });

  it('the last step goes to the reveal and clears the clock', () => {
    let s = started();
    for (let i = 1; i < s.totalSteps; i++) s = playStep(s);
    s = playStep(s, [0]);
    s = act(s, mod.nextScheduled!(s)!.action, s.timer!.endsAt! + GRACE_MS);
    expect(s.phase).toBe('reveal');
    expect(s.timer).toBeNull();
    expect(mod.nextScheduled!(s)).toBeNull();
    expect(s.reveal).toEqual({ book: 0, shown: 1 });
  });
});

describe('reveal', () => {
  it('the owner (or the host) turns the pages; everyone else waits', () => {
    let s = toReveal();
    expect(() => act(s, { type: 'revealNext', bySeat: 1, book: 0, shown: 1 })).toThrow(/owner/);
    s = act(s, { type: 'revealNext', bySeat: 0, book: 0, shown: 1 });
    expect(s.reveal!.shown).toBe(2);
    // A double tap carries a stale token.
    expect(() => act(s, { type: 'revealNext', bySeat: 0, book: 0, shown: 1 })).toThrow(/Already/);
    s = act(s, { type: 'revealNext', book: 0, shown: 2 });
    s = act(s, { type: 'revealNext', book: 0, shown: 3 });
    s = act(s, { type: 'revealNext', book: 0, shown: 4 });
    expect(s.reveal!.shown).toBe(5);
    expect(() => act(s, { type: 'revealNext', book: 0, shown: 5 })).toThrow(/last page/);
    expect(() => act(s, { type: 'nextBook', bySeat: 3, book: 0 })).toThrow(/owner/);
    s = act(s, { type: 'nextBook', bySeat: 0, book: 0 });
    expect(s.reveal).toEqual({ book: 1, shown: 1 });
    expect(() => act(s, { type: 'nextBook', book: 0 })).toThrow(/Already/);
    s = act(s, { type: 'revealNext', bySeat: 1, book: 1, shown: 1 });
    for (let b = 1; b < N; b++) s = act(s, { type: 'nextBook', book: b });
    expect(s.phase).toBe('gameOver');
    expect(mod.isFinished(s)).toBe(true);
  });

  it('hearts: one per player per page, revealed pages only, never your own', () => {
    let s = toReveal();
    s = act(s, { type: 'revealNext', book: 0, shown: 1 });
    s = act(s, { type: 'revealNext', book: 0, shown: 2 });
    const drawer = s.books[0]!.pages[1]!.by; // seat 1
    const guesser = s.books[0]!.pages[2]!.by; // seat 2
    s = act(s, { type: 'heart', bySeat: 3, book: 0, page: 1, on: true });
    s = act(s, { type: 'heart', bySeat: 3, book: 0, page: 1, on: true }); // idempotent
    s = act(s, { type: 'heart', bySeat: 0, book: 0, page: 1, on: true });
    expect(s.books[0]!.pages[1]!.hearts).toEqual([3, 0]);
    expect(() => act(s, { type: 'heart', bySeat: drawer, book: 0, page: 1, on: true })).toThrow(/can’t heart/);
    expect(() => act(s, { type: 'heart', bySeat: 3, book: 0, page: 3, on: true })).toThrow(/page/);
    expect(() => act(s, { type: 'heart', bySeat: 3, book: 1, page: 0, on: true })).toThrow(/closed/);
    // A dealt prompt isn't anyone's work.
    expect(() => act(s, { type: 'heart', bySeat: 3, book: 0, page: 0, on: true })).toThrow(/can’t heart/);
    expect(() => act(s, { type: 'heart', bySeat: 3, book: 0, page: 1, on: 'yes' as never })).toThrow(/on or off/);
    s = act(s, { type: 'heart', bySeat: 3, book: 0, page: 1, on: false });
    expect(s.books[0]!.pages[1]!.hearts).toEqual([0]);

    const v = mod.viewFor(s, 0);
    expect(v.reveal!.pages[1]).toMatchObject({ hearts: 1, yours: true, heartable: true });
    expect(v.reveal!.pages[0]).toMatchObject({ heartable: false });
    expect(mod.viewFor(s, guesser).reveal!.pages[2]!.heartable).toBe(false);
    expect(mod.viewFor(s, null).reveal!.pages[1]).toMatchObject({ hearts: 1, yours: false, heartable: false });
  });

  it('missed pages can’t be hearted; written prompts can', () => {
    let s = mod.createInitialState(config(writeOwn));
    for (let i = 0; i < N; i++) s = act(s, { type: 'collect.submit', bySeat: i, entries: [`Prompt ${i}`] });
    s = act(s, { type: 'advance', step: 1 });
    while (s.phase === 'step') s = playStep(s);
    s = act(s, { type: 'revealNext', book: 0, shown: 1 });
    expect(() => act(s, { type: 'heart', bySeat: 2, book: 0, page: 1, on: true })).toThrow(/can’t heart/);
    s = act(s, { type: 'heart', bySeat: 2, book: 0, page: 0, on: true });
    expect(s.books[0]!.pages[0]!.hearts).toEqual([2]);
  });

  it('hearts are only for the reveal', () => {
    expect(() => act(started(), { type: 'heart', bySeat: 0, book: 0, page: 0, on: true })).toThrow(/reveal/);
  });
});

describe('finishing', () => {
  it('finish during the steps reveals what there is; again skips to the results', () => {
    let s = playStep(playStep(started()), [0, 1]);
    expect(() => act(s, { type: 'finish', bySeat: 0 } as never)).toThrow(/host/);
    s = act(s, { type: 'finish' });
    expect(s.phase).toBe('reveal');
    expect(s.timer).toBeNull();
    const lengths = s.books.map((b) => b.pages.length).sort();
    expect(lengths).toEqual([2, 2, 2, 3, 3]);
    s = act(s, { type: 'finish' });
    expect(s.phase).toBe('gameOver');
    expect(() => act(s, { type: 'finish' })).toThrow(/over/);
  });

  it('finish before anyone has drawn ends the game', () => {
    const s = act(mod.createInitialState(config()), { type: 'finish' });
    expect(s.phase).toBe('gameOver');
    expect(mod.viewFor(s, null).results!.favourite).toBeNull();
  });
});

describe('results', () => {
  function heartsGame(): TelephoneState {
    let s = toReveal();
    // Book 0: page 1 (seat 1 drew) gets 3 hearts, page 2 (seat 2 guessed) gets 1.
    for (let k = 1; k <= 4; k++) s = act(s, { type: 'revealNext', book: 0, shown: k });
    for (const by of [0, 2, 3]) s = act(s, { type: 'heart', bySeat: by, book: 0, page: 1, on: true });
    s = act(s, { type: 'heart', bySeat: 4, book: 0, page: 2, on: true });
    s = act(s, { type: 'nextBook', book: 0 });
    // Book 1: page 3 (seat 4 drew) gets 3 hearts too — the earlier one stays favourite.
    for (let k = 1; k <= 3; k++) s = act(s, { type: 'revealNext', book: 1, shown: k });
    for (const by of [0, 1, 2]) s = act(s, { type: 'heart', bySeat: by, book: 1, page: 3, on: true });
    return act(s, { type: 'finish' });
  }

  it('ranks by hearts received and picks a crowd favourite', () => {
    const s = heartsGame();
    const r = mod.viewFor(s, 0).results!;
    expect(r.hearts).toEqual([0, 3, 1, 0, 3]);
    expect(r.drawHearts).toEqual([0, 3, 0, 0, 3]);
    expect(r.favourite).toMatchObject({ book: 0, owner: 0, index: 1, hearts: 3 });
    expect(r.favourite!.page).toMatchObject({ kind: 'draw', by: 1, drawing: drawingFor(0, 1) });
    expect(r.favourite!.before).toMatchObject({ kind: 'prompt', by: 0 });
    expect(r.books).toHaveLength(N);
    expect(r.books[0]!.pages[1]).toEqual({ kind: 'draw', by: 1, text: null, missed: false, hearts: 3 });
    expect(r.books[2]!.pages[2]).toMatchObject({ kind: 'guess', text: guessFor(2, 2) });
    expect(r.open).toBeNull();
  });

  it('each screen opens its own book in the replay list', () => {
    let s = heartsGame();
    expect(() => act(s, { type: 'browse', bySeat: 0, book: 9 })).toThrow(/book/);
    s = act(s, { type: 'browse', bySeat: 2, book: 3 });
    s = act(s, { type: 'browse', book: 1 });
    const mine = mod.viewFor(s, 2).results!.open!;
    expect(mine.book).toBe(3);
    expect(mine.pages[1]).toMatchObject({ kind: 'draw', drawing: drawingFor(3, 1) });
    expect(mod.viewFor(s, 0).results!.open).toBeNull();
    expect(mod.viewFor(s, null).results!.open!.book).toBe(1);
    s = act(s, { type: 'browse', bySeat: 2, book: null });
    expect(mod.viewFor(s, 2).results!.open).toBeNull();
    expect(() => act(toReveal(), { type: 'browse', bySeat: 0, book: 0 })).toThrow(/end/);
  });
});

// ============================================================================

describe('hidden information', () => {
  it('dealt prompts are seen only by their chooser', () => {
    const s = mod.createInitialState(config());
    for (const seat of SEATS) {
      const v = mod.viewFor(s, seat);
      expect(v.choices).toEqual(s.choices[seat]);
      const j = json(v);
      for (const other of SEATS.filter((x) => x !== seat)) for (const t of s.choices[other]!) expect(j).not.toContain(quoted(t));
    }
    const spectator = mod.viewFor(s, null);
    expect(spectator.choices).toBeNull();
    for (const t of s.choices.flat()) expect(json(spectator)).not.toContain(quoted(t));
  });

  it('a picked prompt stays private', () => {
    let s = mod.createInitialState(config());
    s = act(s, { type: 'pick', bySeat: 1, choice: 2 });
    expect(mod.viewFor(s, 1).picked).toBe(2);
    expect(mod.viewFor(s, 0).picked).toBeNull();
    expect(mod.viewFor(s, 0).done).toEqual([false, true, false, false, false]);
  });

  it('written prompts stay private until the reveal', () => {
    let s = mod.createInitialState(config(writeOwn));
    s = act(s, { type: 'collect.submit', bySeat: 0, entries: ['Uncle Ray’s mustache'] });
    expect(mod.viewFor(s, 0).collect!.yours).toEqual(['Uncle Ray’s mustache']);
    for (const seat of [null, 1, 2]) expect(json(mod.viewFor(s, seat))).not.toContain('Uncle Ray');
    for (let i = 1; i < N; i++) s = act(s, { type: 'collect.submit', bySeat: i, entries: [`p${i}`] });
    // Only the drawer of book 0 sees it now.
    const drawer = holderOf(0, 1, N);
    for (const seat of [null, ...SEATS]) {
      expect(json(mod.viewFor(s, seat)).includes('Uncle Ray')).toBe(seat === drawer);
    }
  });

  it('during a step each seat sees ONLY the previous page of the book it holds', () => {
    let s = started();
    for (let step = 1; s.phase === 'step'; step++) {
      expect(s.stepIndex).toBe(step);
      // Half the table has submitted.
      s = playStep(s, [1, 3]);
      const content = allContent(s);
      for (const seat of SEATS) {
        const v = mod.viewFor(s, seat);
        const j = json(v);
        const b = bookHeldBy(seat, step, N);
        if (seat === 1 || seat === 3) {
          expect(v.youDone).toBe(true);
          expect(v.held).toBeNull();
        } else {
          expect(v.youDone).toBe(false);
          expect(v.held).toMatchObject({ book: b, owner: b, step, kind: stepKind(step) });
          const prev = s.books[b]!.pages[step - 1]!;
          expect(v.held!.previous.kind).toBe(prev.kind);
        }
        expect(v.doneCount).toBe(2);
        expect(v.reveal).toBeNull();
        expect(v.results).toBeNull();
        for (const c of content) {
          const allowed = !v.youDone && c.book === b && c.index === step - 1;
          expect(j.includes(c.marker), `seat ${seat} step ${step} book ${c.book} page ${c.index}`).toBe(allowed);
        }
      }
      s = playStep(s, [0, 2, 4]);
    }
  });

  it('spectators see progress only until the reveal', () => {
    let s = started();
    s = playStep(playStep(s), [0]);
    const v = mod.viewFor(s, null);
    expect(v.held).toBeNull();
    expect(v.choices).toBeNull();
    expect(v.youDone).toBe(false);
    expect(v.doneCount).toBe(1);
    const j = json(v);
    for (const c of allContent(s)) expect(j).not.toContain(c.marker);
    expect(j).not.toContain('"rng"');
    expect(j).not.toContain('hearts":[');
  });

  it('views are identical whatever the hidden pages say', () => {
    const a = playStep(started());
    const step = a.stepIndex; // 2: everyone guesses
    const seat = 0;
    const held = bookHeldBy(seat, step, N);
    // Change every page this seat must not see.
    const b: TelephoneState = {
      ...a,
      choices: a.choices.map((c) => c.map((t) => `${t}!`)),
      books: a.books.map((book, i) => ({
        ...book,
        pages: book.pages.map((p, k) => {
          if (i === held && k === step - 1) return p;
          return p.kind === 'draw' ? { ...p, drawing: drawingFor(9, 9) } : { ...p, text: 'something else' };
        }),
      })),
    };
    expect(json(mod.viewFor(a, seat))).toBe(json(mod.viewFor(b, seat)));
    expect(json(mod.viewFor(a, null))).toBe(json(mod.viewFor(b, null)));
  });

  it('the reveal shows the current book up to the cursor — nothing more', () => {
    let s = toReveal();
    s = act(s, { type: 'revealNext', book: 0, shown: 1 });
    for (const seat of [null, ...SEATS]) {
      const v = mod.viewFor(s, seat);
      expect(v.reveal!.pages).toHaveLength(2);
      expect(v.reveal!.total).toBe(5);
      const j = json(v);
      for (const c of allContent(s)) expect(j.includes(c.marker)).toBe(c.book === 0 && c.index < 2);
    }
    // Same for the next book.
    for (let k = 2; k <= 4; k++) s = act(s, { type: 'revealNext', book: 0, shown: k });
    s = act(s, { type: 'nextBook', book: 0 });
    const j = json(mod.viewFor(s, 3));
    for (const c of allContent(s)) expect(j.includes(c.marker)).toBe(c.book === 1 && c.index === 0);
  });

  it('keeps reveal and replay views small even when every drawing is huge', () => {
    const names = Array.from({ length: 12 }, (_, i) => `P${i}`);
    // ~36 KB each: a zigzag corner to corner.
    const huge = (book: number, step: number) => {
      const pts = [book * 3 + 1, step * 3 + 1];
      for (let i = 0; i < 6000; i++) pts.push(i % 2 ? 0 : CANVAS_W, i % 2 ? 0 : 600);
      return encodeDrawing([{ c: 1, w: 1, pts }]);
    };
    expect(huge(0, 1).length).toBeGreaterThan(30_000);
    expect(huge(0, 1).length).toBeLessThanOrEqual(MAX_ENCODED_DRAWING);
    let s = started({}, names);
    while (s.phase === 'step') {
      const step = s.stepIndex;
      for (let seat = 0; seat < names.length; seat++) {
        const b = bookHeldBy(seat, step, names.length);
        s =
          stepKind(step) === 'draw'
            ? act(s, { type: 'draw', bySeat: seat, step, drawing: huge(b, step) })
            : act(s, { type: 'guess', bySeat: seat, step, text: `g${b}-${step}` });
      }
    }
    for (let k = 1; k < s.books[0]!.pages.length; k++) s = act(s, { type: 'revealNext', book: 0, shown: k });
    const v = mod.viewFor(s, 3);
    expect(json(v).length).toBeLessThan(VIEW_DRAWING_BUDGET + 20_000);
    const draws = v.reveal!.pages.map((p) => p.page).filter((p) => p.kind === 'draw');
    expect(draws).toHaveLength(6);
    // The newest pages keep their drawings; the oldest go out as null.
    expect(draws[draws.length - 1]!.drawing).toBe(huge(0, 11));
    expect(draws[0]!.drawing).toBeNull();
    expect(v.reveal!.pages.every((p) => p.page.kind !== 'guess' || p.page.text.startsWith('g0-'))).toBe(true);

    s = act(act(s, { type: 'finish' }), { type: 'browse', bySeat: 3, book: 5 });
    const end = mod.viewFor(s, 3);
    expect(json(end).length).toBeLessThan(VIEW_DRAWING_BUDGET + 40_000);
    expect(end.results!.open!.pages.filter((p) => p.kind === 'draw' && p.drawing !== null).length).toBeGreaterThan(0);
  });

  it('the final screen never carries every drawing', () => {
    let s = toReveal();
    s = act(s, { type: 'finish' });
    s = act(s, { type: 'browse', bySeat: 1, book: 2 });
    const drawings = s.books.flatMap((b, book) =>
      b.pages.flatMap((p, index) => (p.kind === 'draw' ? [{ book, index, marker: quoted(p.drawing) }] : [])),
    );
    for (const seat of [null, ...SEATS]) {
      const j = json(mod.viewFor(s, seat));
      for (const d of drawings) expect(j.includes(d.marker)).toBe(seat === 1 && d.book === 2);
      // Every guess and prompt is in the text list.
      for (const book of s.books) for (const p of book.pages) if (p.kind !== 'draw') expect(j).toContain(quoted(p.text));
    }
  });
});
