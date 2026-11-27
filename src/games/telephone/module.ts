import { decodeDrawing, encodeDrawing } from '@/draw/drawing';
import { assertHostOnly, assertInt, assertSeat } from '@/engine/guards';
import { makeRng, rngShuffle, subSeed } from '@/engine/rng';
import { startTimer } from '@/engine/timer';
import type { ActionContext, GameConfig, GameModule, SeatIndex } from '@/engine/types';
import { collectComplete, collectReduce, collectView, isCollectAction, startCollect } from '@/words/collect';
import { buildPool, entryKey } from '@/words/source';
import type { TelephoneAction } from './actions';
import {
  BLANK_DRAWING,
  DEFAULT_OPTIONS,
  NO_GUESS,
  PROMPT_CHOICES,
  bookHeldBy,
  chainLength,
  cleanGuess,
  holderOf,
  optionsProblem,
  readOptions,
  stepKind,
} from './rules';
import type { Book, Page, PageView, RevealPage, SummaryPage, TelephoneState, TelephoneView } from './state';

// ============================================================================
// Doodle Telephone — module
// ============================================================================

/** Pages that race the buzzer still count for this long after it. */
export const GRACE_MS = 2000;
/** "Hurry up": everyone gets this long, then the buzzer. */
export const HURRY_MS = 10_000;

/**
 * Drawing data one view may carry for a book (reveal / replay). Newest pages
 * win; older ones beyond it go out as `drawing: null`. Views must stay well
 * under the database's 300 KB per-view limit even at 40 KB a drawing.
 */
export const VIEW_DRAWING_BUDGET = 160_000;

export const WRITE_PROMPT = 'Write a prompt for your sketchbook — something fun (and possible) to draw.';

/**
 * Deal PROMPT_CHOICES prompts to every seat from the shuffled pool, without
 * repeats across the table while the pool lasts.
 */
function dealChoices(pool: string[], n: number): string[][] {
  return Array.from({ length: n }, (_, seat) => {
    const out: string[] = [];
    const keys = new Set<string>();
    for (let k = 0; k < PROMPT_CHOICES * 2 && out.length < PROMPT_CHOICES; k++) {
      const text = pool[(seat * PROMPT_CHOICES + k) % pool.length]!;
      const key = entryKey(text);
      if (keys.has(key)) continue;
      keys.add(key);
      out.push(text);
    }
    return out;
  });
}

function timerFor(state: TelephoneState, step: number, now: number) {
  if (!state.options.timed || state.local) return null;
  const secs = stepKind(step) === 'draw' ? state.options.drawSeconds : state.options.guessSeconds;
  return startTimer(secs * 1000, now);
}

/** Step 0 is over: every book gets its prompt page, and the passing starts. */
function startSteps(state: TelephoneState, now: number): TelephoneState {
  const books: Book[] = state.books.map((book) => {
    const b = book.owner;
    let page: Page;
    const written = state.collect?.done[b] ? state.collect.entries[b]?.[0] : undefined;
    if (state.promptMode === 'write' && written) {
      page = { kind: 'prompt', by: b, text: written, written: true, missed: false, hearts: [] };
    } else {
      // Picked — or, for a player who didn't write / pick, the first of their dealt options.
      const pick = state.promptMode === 'choose' ? (state.picks[b] ?? 0) : 0;
      page = { kind: 'prompt', by: b, text: state.choices[b]![pick]!, written: false, missed: false, hearts: [] };
    }
    return { owner: b, pages: [page] };
  });
  const next: TelephoneState = { ...state, books, collect: null, phase: 'step', stepIndex: 1, hurried: false };
  return { ...next, timer: timerFor(next, 1, now) };
}

function toReveal(state: TelephoneState): TelephoneState {
  return { ...state, phase: 'reveal', timer: null, hurried: false, reveal: { book: 0, shown: 1 } };
}

function stepComplete(state: TelephoneState): boolean {
  return state.books.every((b) => b.pages.length > state.stepIndex);
}

/** Fill any missing page of the current step (blank page / "(no guess)"), then move on. */
function closeStep(state: TelephoneState, now: number): TelephoneState {
  const n = state.seats.length;
  const step = state.stepIndex;
  const kind = stepKind(step);
  const books = state.books.map((book, b): Book => {
    if (book.pages.length > step) return book;
    const by = holderOf(b, step, n);
    const page: Page =
      kind === 'draw'
        ? { kind: 'draw', by, drawing: BLANK_DRAWING, missed: true, hearts: [] }
        : { kind: 'guess', by, text: NO_GUESS, missed: true, hearts: [] };
    return { ...book, pages: [...book.pages, page] };
  });
  const filled: TelephoneState = { ...state, books };
  if (step >= state.totalSteps) return toReveal(filled);
  const next: TelephoneState = { ...filled, stepIndex: step + 1, hurried: false };
  return { ...next, timer: timerFor(next, step + 1, now) };
}

function submitPage(
  state: TelephoneState,
  bySeat: unknown,
  step: unknown,
  make: (by: SeatIndex) => Page,
  kind: 'draw' | 'guess',
  now: number,
): TelephoneState {
  const n = state.seats.length;
  if (state.phase !== 'step') throw new Error('Nobody is drawing or guessing right now');
  assertSeat(bySeat, n);
  if (step !== state.stepIndex) throw new Error('That step is over');
  if (stepKind(state.stepIndex) !== kind) {
    throw new Error(kind === 'draw' ? 'This step is a guess, not a drawing' : 'This step is a drawing, not a guess');
  }
  const b = bookHeldBy(bySeat, state.stepIndex, n);
  const book = state.books[b]!;
  if (book.pages.length > state.stepIndex) throw new Error('You already handed that page in');
  const page = make(bySeat);
  const books = state.books.map((x, i) => (i === b ? { ...x, pages: [...x.pages, page] } : x));
  const next: TelephoneState = { ...state, books };
  return stepComplete(next) ? closeStep(next, now) : next;
}

/** Reveal controls: the current book's owner, or the host (seatless). */
function assertRevealer(state: TelephoneState, bySeat: unknown): void {
  if (bySeat === undefined) return;
  assertSeat(bySeat, state.seats.length);
  if (bySeat !== state.books[state.reveal!.book]!.owner) throw new Error('Only the book’s owner (or the host) turns the pages');
}

function heartable(page: Page, seat: SeatIndex | null): boolean {
  if (seat === null || page.by === seat || page.missed) return false;
  return page.kind !== 'prompt' || page.written;
}

function applyTelephone(state: TelephoneState, action: TelephoneAction, ctx: ActionContext): TelephoneState {
  const n = state.seats.length;

  if (isCollectAction(action)) {
    if (state.phase !== 'prompt' || !state.collect) throw new Error('Not writing prompts');
    if (action.type === 'collect.close') {
      assertHostOnly(action);
      return startSteps(state, ctx.now);
    }
    const collect = collectReduce(state.collect, action, n);
    const next = { ...state, collect };
    return collectComplete(collect, n) ? startSteps(next, ctx.now) : next;
  }

  switch (action.type) {
    case 'pick': {
      if (state.phase !== 'prompt' || state.promptMode !== 'choose') throw new Error('Not picking prompts');
      assertSeat(action.bySeat, n);
      assertInt(action.choice, 0, state.choices[action.bySeat]!.length - 1, 'choice');
      const picks = state.picks.slice();
      picks[action.bySeat] = action.choice;
      const next = { ...state, picks };
      return picks.every((p) => p !== null) ? startSteps(next, ctx.now) : next;
    }

    case 'draw': {
      // Validate + normalise untrusted drawing data (size cap, palette, bounds).
      const strokes = decodeDrawing(action.drawing);
      const drawing = encodeDrawing(strokes);
      return submitPage(
        state,
        action.bySeat,
        action.step,
        (by) => ({ kind: 'draw', by, drawing, missed: false, hearts: [] }),
        'draw',
        ctx.now,
      );
    }

    case 'guess': {
      const text = cleanGuess(action.text);
      if (!text) throw new Error('Write a guess first');
      return submitPage(
        state,
        action.bySeat,
        action.step,
        (by) => ({ kind: 'guess', by, text, missed: false, hearts: [] }),
        'guess',
        ctx.now,
      );
    }

    case 'timeUp': {
      assertHostOnly(action);
      if (state.phase !== 'step' || action.step !== state.stepIndex) throw new Error('Stale timer');
      if (!state.timer || state.timer.endsAt === null || ctx.now < state.timer.endsAt + GRACE_MS) {
        throw new Error('Time is not up yet');
      }
      return closeStep(state, ctx.now);
    }

    case 'hurry': {
      assertHostOnly(action);
      if (state.phase !== 'step' || action.step !== state.stepIndex) throw new Error('That step is over');
      if (state.local) throw new Error('On one device, use “move on” instead');
      const t = state.timer;
      const soonEnough = t && t.endsAt !== null && t.endsAt - ctx.now <= HURRY_MS;
      return { ...state, hurried: true, timer: soonEnough ? t : startTimer(HURRY_MS, ctx.now) };
    }

    case 'advance': {
      assertHostOnly(action);
      if (state.phase === 'prompt' && action.step === 0) return startSteps(state, ctx.now);
      if (state.phase !== 'step' || action.step !== state.stepIndex) throw new Error('That step is over');
      return closeStep(state, ctx.now);
    }

    case 'revealNext': {
      if (state.phase !== 'reveal' || !state.reveal) throw new Error('Not revealing');
      if (action.book !== state.reveal.book || action.shown !== state.reveal.shown) throw new Error('Already turned');
      assertRevealer(state, action.bySeat);
      const total = state.books[state.reveal.book]!.pages.length;
      if (state.reveal.shown >= total) throw new Error('That was the last page');
      return { ...state, reveal: { ...state.reveal, shown: state.reveal.shown + 1 } };
    }

    case 'nextBook': {
      if (state.phase !== 'reveal' || !state.reveal) throw new Error('Not revealing');
      if (action.book !== state.reveal.book) throw new Error('Already on the next book');
      assertRevealer(state, action.bySeat);
      if (state.reveal.book + 1 >= state.books.length) return { ...state, phase: 'gameOver', reveal: null };
      return { ...state, reveal: { book: state.reveal.book + 1, shown: 1 } };
    }

    case 'heart': {
      if (state.phase !== 'reveal' || !state.reveal) throw new Error('Hearts are for the reveal');
      assertSeat(action.bySeat, n);
      if (action.book !== state.reveal.book) throw new Error('That book is closed');
      assertInt(action.page, 0, state.reveal.shown - 1, 'page');
      if (typeof action.on !== 'boolean') throw new Error('Heart on or off?');
      const page = state.books[action.book]!.pages[action.page]!;
      if (!heartable(page, action.bySeat)) throw new Error('You can’t heart that page');
      const has = page.hearts.includes(action.bySeat);
      if (has === action.on) return state;
      const hearts = action.on ? [...page.hearts, action.bySeat] : page.hearts.filter((s) => s !== action.bySeat);
      const books = state.books.map((b, i) =>
        i === action.book ? { ...b, pages: b.pages.map((p, j) => (j === action.page ? { ...p, hearts } : p)) } : b,
      );
      return { ...state, books };
    }

    case 'browse': {
      if (state.phase !== 'gameOver') throw new Error('The books open at the end');
      if (action.book !== null) assertInt(action.book, 0, state.books.length - 1, 'book');
      if (action.bySeat === undefined) return { ...state, browseShared: action.book };
      assertSeat(action.bySeat, n);
      const browse = state.browse.slice();
      browse[action.bySeat] = action.book;
      return { ...state, browse };
    }

    case 'finish':
      assertHostOnly(action);
      if (state.phase === 'step') return toReveal(state);
      if (state.phase === 'gameOver') throw new Error('Already over');
      return { ...state, phase: 'gameOver', timer: null, reveal: null, collect: null };

    default:
      throw new Error(`Unknown action ${(action as { type?: unknown }).type as string}`);
  }
}

// ============================================================================
// View — the redaction chokepoint
// ============================================================================

function pageView(p: Page): PageView {
  switch (p.kind) {
    case 'prompt':
      return { kind: 'prompt', by: p.by, text: p.text, written: p.written };
    case 'guess':
      return { kind: 'guess', by: p.by, text: p.text, missed: p.missed };
    case 'draw':
      return { kind: 'draw', by: p.by, drawing: p.drawing, missed: p.missed };
  }
}

/** Drop the oldest drawings past VIEW_DRAWING_BUDGET (the newest always fits: ≤ 40 KB). */
function withinBudget(pages: PageView[]): PageView[] {
  let used = 0;
  const out = pages.slice();
  for (let i = out.length - 1; i >= 0; i--) {
    const p = out[i]!;
    if (p.kind !== 'draw' || p.drawing === null) continue;
    used += p.drawing.length;
    if (used > VIEW_DRAWING_BUDGET && i < out.length - 1) out[i] = { ...p, drawing: null };
  }
  return out;
}

function summaryPage(p: Page): SummaryPage {
  return {
    kind: p.kind,
    by: p.by,
    text: p.kind === 'draw' ? null : p.text,
    missed: p.missed,
    hearts: p.hearts.length,
  };
}

/** Who has finished the current step (prompt or page). */
function doneFlags(state: TelephoneState): boolean[] {
  const n = state.seats.length;
  if (state.phase === 'prompt') {
    return Array.from({ length: n }, (_, i) =>
      state.promptMode === 'write' ? !!state.collect?.done[i] : state.picks[i] !== null,
    );
  }
  if (state.phase === 'step') {
    return Array.from({ length: n }, (_, i) => state.books[bookHeldBy(i, state.stepIndex, n)]!.pages.length > state.stepIndex);
  }
  return new Array<boolean>(n).fill(false);
}

function resultsView(state: TelephoneState, me: SeatIndex | null): NonNullable<TelephoneView['results']> {
  const n = state.seats.length;
  const hearts = new Array<number>(n).fill(0);
  const drawHearts = new Array<number>(n).fill(0);
  // The crowd favourite: most hearts; ties go to the earliest page revealed.
  let fav: { book: number; index: number; count: number } | null = null;
  for (const [b, book] of state.books.entries()) {
    for (const [i, p] of book.pages.entries()) {
      const c = p.hearts.length;
      hearts[p.by]! += c;
      if (p.kind === 'draw') drawHearts[p.by]! += c;
      if (c > 0 && (!fav || c > fav.count)) fav = { book: b, index: i, count: c };
    }
  }
  const favPages = fav ? state.books[fav.book]!.pages : [];
  const favourite = fav
    ? {
        book: fav.book,
        owner: state.books[fav.book]!.owner,
        index: fav.index,
        page: pageView(favPages[fav.index]!),
        hearts: fav.count,
        before: fav.index > 0 ? pageView(favPages[fav.index - 1]!) : null,
      }
    : null;
  const openIndex = me !== null ? (state.browse[me] ?? null) : state.browseShared;
  const openBook = openIndex !== null ? state.books[openIndex] : undefined;
  return {
    hearts,
    drawHearts,
    favourite,
    books: state.books.map((b) => ({ owner: b.owner, pages: b.pages.map(summaryPage) })),
    open: openBook
      ? {
          book: openIndex!,
          pages: withinBudget(openBook.pages.map(pageView)).map((v, i) => ({ ...v, hearts: openBook.pages[i]!.hearts.length })),
        }
      : null,
  };
}

export function telephoneViewFor(state: TelephoneState, seat: SeatIndex | null): TelephoneView {
  const n = state.seats.length;
  const me = seat !== null && Number.isInteger(seat) && seat >= 0 && seat < n ? seat : null;
  const done = doneFlags(state);
  const stepping = state.phase === 'step';
  const choosing = state.phase === 'prompt' && state.promptMode === 'choose';

  let held: TelephoneView['held'] = null;
  if (stepping && me !== null && !done[me]) {
    const b = bookHeldBy(me, state.stepIndex, n);
    const prev = state.books[b]!.pages[state.stepIndex - 1]!;
    held = { book: b, owner: state.books[b]!.owner, step: state.stepIndex, kind: stepKind(state.stepIndex), previous: pageView(prev) };
  }

  let reveal: TelephoneView['reveal'] = null;
  if (state.phase === 'reveal' && state.reveal) {
    const book = state.books[state.reveal.book]!;
    const shown = book.pages.slice(0, state.reveal.shown);
    const views = withinBudget(shown.map(pageView));
    const pages: RevealPage[] = shown.map((p, index) => ({
      index,
      page: views[index]!,
      hearts: p.hearts.length,
      heartedBy: p.hearts.slice(),
      yours: me !== null && p.hearts.includes(me),
      heartable: heartable(p, me),
    }));
    reveal = {
      book: state.reveal.book,
      owner: book.owner,
      bookCount: state.books.length,
      shown: state.reveal.shown,
      total: book.pages.length,
      pages,
    };
  }

  return {
    phase: state.phase,
    seats: state.seats.map((s) => ({ ...s })),
    totalSteps: state.totalSteps,
    promptMode: state.promptMode,
    timed: state.options.timed,
    local: state.local,
    drawSeconds: state.options.drawSeconds,
    guessSeconds: state.options.guessSeconds,
    stepIndex: stepping ? state.stepIndex : 0,
    stepKind: stepping ? stepKind(state.stepIndex) : null,
    timer: stepping && state.timer ? { ...state.timer } : null,
    hurried: stepping && state.hurried,
    done,
    doneCount: done.filter(Boolean).length,
    youDone: me !== null && !!done[me],
    collect: state.phase === 'prompt' && state.collect ? collectView(state.collect, me, n) : null,
    choices: choosing && me !== null ? state.choices[me]!.slice() : null,
    picked: choosing && me !== null ? (state.picks[me] ?? null) : null,
    held,
    reveal,
    results: state.phase === 'gameOver' ? resultsView(state, me) : null,
  };
}

// ============================================================================
// Module
// ============================================================================

export const telephoneModule: GameModule<TelephoneState, TelephoneView, TelephoneAction> = {
  id: 'telephone',
  displayName: 'Doodle Telephone',
  minPlayers: 3,
  maxPlayers: 16,

  createInitialState(config: GameConfig): TelephoneState {
    const options = readOptions(config.gameOptions);
    const seats = config.seats.map((s, i) => ({ index: i, name: s.name }));
    const n = seats.length;
    if (n < this.minPlayers || n > this.maxPlayers) {
      throw new Error(`Doodle Telephone needs ${this.minPlayers}–${this.maxPlayers} players.`);
    }
    const problem = optionsProblem(config.gameOptions, n);
    if (problem) throw new Error(problem);
    const rng = makeRng(subSeed(config.seed, 0x7e1e));
    const write = options.words.perPlayer > 0;

    let pool = buildPool({ source: { ...options.words, perPlayer: 0 }, lists: config.lists }).map((p) => p.text);
    if (pool.length === 0 && !write) {
      throw new Error('No prompts to deal — pick a pack or a list, or let players write their own.');
    }
    // Writing your own with no packs: the defaults stand by for anyone who doesn't.
    if (pool.length === 0) pool = buildPool({ source: { ...DEFAULT_OPTIONS.words, perPlayer: 0 } }).map((p) => p.text);
    const choices = dealChoices(rngShuffle(rng, pool), n);

    return {
      phase: 'prompt',
      options,
      seats,
      rng,
      // A single-device table has no seat uids (online every seat has one).
      local: config.seats.every((s) => s.uuid === null),
      totalSteps: chainLength(n, options.maxSteps),
      promptMode: write ? 'write' : 'choose',
      collect: write ? startCollect('words', 1, WRITE_PROMPT) : null,
      choices,
      picks: new Array<number | null>(n).fill(null),
      books: seats.map((s) => ({ owner: s.index, pages: [] })),
      stepIndex: 0,
      timer: null,
      hurried: false,
      reveal: null,
      browse: new Array<number | null>(n).fill(null),
      browseShared: null,
    };
  },

  applyAction: applyTelephone,
  viewFor: telephoneViewFor,

  isFinished: (state) => state.phase === 'gameOver',

  defaultOptions: () => structuredClone(DEFAULT_OPTIONS) as unknown as Record<string, unknown>,

  optionsProblem,

  nextScheduled(state) {
    if (state.phase !== 'step' || !state.timer || state.timer.endsAt === null) return null;
    return { at: state.timer.endsAt + GRACE_MS, action: { type: 'timeUp', step: state.stepIndex } };
  },
};
