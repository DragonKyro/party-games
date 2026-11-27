import { assertHostOnly, assertInt, assertSeat } from '@/engine/guards';
import { cloneRng, makeRng, rngFloat, rngInt, rngShuffle, subSeed, type RngState } from '@/engine/rng';
import { isExpired, pauseTimer, resumeTimer, startTimer, type Timer } from '@/engine/timer';
import type { ActionContext, GameConfig, GameModule, SeatIndex } from '@/engine/types';
import { WORD_PACKS } from '@/words';
import {
  collectComplete,
  collectReduce,
  collectView,
  collectedEntries,
  isCollectAction,
  startCollect,
} from '@/words/collect';
import { buildPool, entryKey } from '@/words/source';
import type { SlideshowAction } from './actions';
import { TWISTS, ratingLabel } from './content';
import { buildDeck, generateQuestions } from './deck';
import { DEFAULT_OPTIONS, optionsProblem, readOptions } from './rules';
import type {
  Award,
  CurrentTalk,
  SlideshowState,
  SlideshowView,
  Standing,
  TalkRecord,
  TopicEntry,
} from './state';

// ============================================================================
// Slideshow Karaoke — module
// ============================================================================

/** A vote a moment after the buzzer still counts (network lag). */
const GRACE_MS = 1500;
/** Pack / list entries kept as topic + motif candidates (keeps host saves small). */
const POOL_SAMPLE = 240;
/** Extra words handed to each deck as motif candidates. */
const EXTRA_WORDS = 4;

/** Topics of last resort, when every candidate is used up or is the presenter's own. */
const FALLBACK_TOPICS: readonly string[] = [...WORD_PACKS.everyday.words, ...WORD_PACKS.hard.words];

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function mean(xs: readonly number[]): number | null {
  return xs.length === 0 ? null : xs.reduce((a, b) => a + b, 0) / xs.length;
}

// ---- setup -----------------------------------------------------------------------

/** Presenter order: everyone once per round, reshuffled each round, no back-to-back repeats. */
function presenterOrder(rng: RngState, n: number, rounds: number): SeatIndex[] {
  const out: SeatIndex[] = [];
  for (let r = 0; r < rounds; r++) {
    let round = rngShuffle(
      rng,
      Array.from({ length: n }, (_, i) => i),
    );
    if (n > 1 && round[0] === out[out.length - 1]) round = [...round.slice(1), round[0]!];
    out.push(...round);
  }
  return out;
}

/**
 * The topic for `presenter`: a player-written one if any is left that they
 * didn't write (favouring authors still waiting to present, so nobody is
 * left holding only their own), else packs / lists, else a fallback.
 */
function chooseTopic(state: SlideshowState, presenter: SeatIndex, rng: RngState): TopicEntry {
  const used = new Set(state.used);
  const fresh = state.pool.filter((e) => !used.has(entryKey(e.text)) && e.author !== presenter);
  const written = fresh.filter((e) => e.author !== null);
  if (written.length > 0) {
    const waiting = new Set(state.order.slice(state.talkNo + 1));
    const weights = written.map((e) => (waiting.has(e.author!) ? 3 : 1));
    let r = rngFloat(rng) * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < written.length; i++) {
      r -= weights[i]!;
      if (r < 0) return written[i]!;
    }
    return written[written.length - 1]!;
  }
  if (fresh.length > 0) return fresh[rngInt(rng, fresh.length)]!;
  const spare = FALLBACK_TOPICS.filter((t) => !used.has(entryKey(t)));
  const list = spare.length > 0 ? spare : FALLBACK_TOPICS;
  return { text: list[rngInt(rng, list.length)]!, author: null };
}

/** A few non-player words for the deck's motifs (never an unused player-written topic). */
function extraWords(state: SlideshowState, topic: string, rng: RngState): string[] {
  const used = new Set(state.used);
  const key = entryKey(topic);
  const candidates = state.pool.filter((e) => e.author === null && entryKey(e.text) !== key && !used.has(entryKey(e.text)));
  const out: string[] = [];
  for (let i = 0; i < EXTRA_WORDS * 3 && out.length < EXTRA_WORDS && candidates.length > 0; i++) {
    const w = candidates[rngInt(rng, candidates.length)]!.text;
    if (!out.includes(w)) out.push(w);
  }
  return out;
}

/** Enter the intro of talk `state.talkNo` (or the end, if there are no more). */
function setupTalk(state: SlideshowState): SlideshowState {
  const base: SlideshowState = {
    ...state,
    talk: null,
    paused: false,
    ratings: state.seats.map(() => null),
    crowd: null,
    rateTimer: null,
  };
  if (state.talkNo >= state.order.length) return { ...base, phase: 'gameOver' };
  const presenter = state.order[state.talkNo]!;
  const rng = cloneRng(state.rng);
  const topic = chooseTopic(state, presenter, rng);
  const extras = extraWords(state, topic.text, rng);
  const deckSrc = subSeed(state.deckSeed, state.talkNo);
  const { slides, motifs } = buildDeck(deckSrc, topic.text, extras, state.options.slides, {
    presenter: state.seats[presenter]?.name ?? '',
  });
  // Twist + questions: their own stream, so they never shift the deck.
  const extra = makeRng(subSeed(state.deckSeed, state.talkNo, 7));
  let twistAt: number | null = null;
  let twist: string | null = null;
  if (state.options.twists) {
    const lo = slides.length >= 6 ? 2 : 1;
    const hi = slides.length - 2;
    twistAt = lo + rngInt(extra, Math.max(1, hi - lo + 1));
    twist = TWISTS[rngInt(extra, TWISTS.length)]!;
  }
  const questions = state.options.qa ? generateQuestions(extra, topic.text, motifs, 1 + rngInt(extra, 2)) : [];
  const talk: CurrentTalk = {
    presenter,
    topic: topic.text,
    topicAuthor: topic.author,
    deck: slides,
    index: 0,
    slideTimer: null,
    talkTimer: null,
    twistAt,
    twist,
    twistShown: false,
    questions,
    startedAt: null,
    endedAt: null,
    backs: 0,
    timedOut: false,
  };
  return {
    ...base,
    phase: 'intro',
    rng,
    used: [...state.used, entryKey(topic.text)],
    talk,
  };
}

function afterCollect(state: SlideshowState): SlideshowState {
  const collected = state.collect ? collectedEntries(state.collect) : [];
  const seen = new Set(collected.map((c) => entryKey(c.text)));
  const pool: TopicEntry[] = [
    ...collected.map((c) => ({ text: c.text, author: c.author })),
    ...state.pool.filter((e) => !seen.has(entryKey(e.text))),
  ];
  return setupTalk({ ...state, collect: null, pool });
}

// ---- the talk ----------------------------------------------------------------------

function slideTimerFor(state: SlideshowState, now: number): Timer | null {
  return state.options.autoAdvance > 0 ? startTimer(state.options.autoAdvance * 1000, now) : null;
}

function moveTo(state: SlideshowState, talk: CurrentTalk, index: number, now: number): SlideshowState {
  const twistShown = talk.twistShown || (talk.twistAt !== null && index >= talk.twistAt);
  return { ...state, talk: { ...talk, index, twistShown, slideTimer: slideTimerFor(state, now) } };
}

function startRating(state: SlideshowState, talk: CurrentTalk, now: number): SlideshowState {
  return {
    ...state,
    phase: 'rating',
    talk,
    paused: false,
    ratings: state.seats.map(() => null),
    crowd: null,
    rateTimer: state.ratingMode === 'phones' ? startTimer(state.options.rateSeconds * 1000, now) : null,
  };
}

function endTalk(state: SlideshowState, now: number, timedOut: boolean): SlideshowState {
  const talk: CurrentTalk = { ...state.talk!, endedAt: now, slideTimer: null, talkTimer: null, timedOut };
  if (talk.questions.length > 0) return { ...state, phase: 'qa', paused: false, talk };
  return startRating(state, talk, now);
}

function next(state: SlideshowState, now: number): SlideshowState {
  const talk = state.talk!;
  if (talk.index >= talk.deck.length - 1) return endTalk(state, now, false);
  return moveTo(state, talk, talk.index + 1, now);
}

function audience(state: SlideshowState): SeatIndex[] {
  const presenter = state.talk?.presenter ?? -1;
  return state.seats.map((s) => s.index).filter((i) => i !== presenter);
}

function reveal(state: SlideshowState): SlideshowState {
  const talk = state.talk!;
  const votes = state.ratings.filter((r): r is number => r !== null).sort((a, b) => a - b);
  const average = state.crowd ?? mean(votes);
  const record: TalkRecord = {
    presenter: talk.presenter,
    title: talk.deck[0]?.title ?? talk.topic,
    topic: talk.topic,
    topicAuthor: talk.topicAuthor,
    votes,
    crowd: state.crowd,
    average,
    twist: talk.twistShown ? talk.twist : null,
    durationMs: talk.startedAt !== null && talk.endedAt !== null ? Math.max(0, talk.endedAt - talk.startedAt) : 0,
    backs: talk.backs,
    timedOut: talk.timedOut,
  };
  return { ...state, phase: 'reveal', paused: false, rateTimer: null, history: [...state.history, record] };
}

// ---- guards ----------------------------------------------------------------------

function assertTalkToken(state: SlideshowState, talk: unknown): void {
  if (talk !== state.talkNo) throw new Error('That talk is over');
}

/** The presenter (their own seat) or the host (seatless). */
function assertPresenterOrHost(state: SlideshowState, bySeat: unknown): void {
  if (bySeat === undefined) return;
  assertSeat(bySeat, state.seats.length);
  if (bySeat !== state.talk?.presenter) throw new Error('Only the presenter can do that');
}

function assertStars(stars: unknown): asserts stars is number {
  assertInt(stars, 1, 5, 'rating');
}

// ---- reducer -------------------------------------------------------------------

function applySlideshow(state: SlideshowState, action: SlideshowAction, ctx: ActionContext): SlideshowState {
  const n = state.seats.length;

  if (isCollectAction(action)) {
    if (state.phase !== 'collect' || !state.collect) throw new Error('Not collecting topics');
    if (action.type === 'collect.close') {
      assertHostOnly(action);
      return afterCollect(state);
    }
    const collect = collectReduce(state.collect, action, n);
    const nextState = { ...state, collect };
    return collectComplete(collect, n) ? afterCollect(nextState) : nextState;
  }

  switch (action.type) {
    case 'startTalk': {
      if (state.phase !== 'intro' || !state.talk) throw new Error('No talk to start');
      assertTalkToken(state, action.talk);
      assertPresenterOrHost(state, action.bySeat);
      const talk: CurrentTalk = {
        ...state.talk,
        index: 0,
        startedAt: ctx.now,
        slideTimer: slideTimerFor(state, ctx.now),
        talkTimer: state.options.talkSeconds > 0 ? startTimer(state.options.talkSeconds * 1000, ctx.now) : null,
      };
      return { ...state, phase: 'talk', paused: false, talk };
    }

    case 'next':
    case 'back': {
      if (state.phase !== 'talk' || !state.talk) throw new Error('No talk in progress');
      assertPresenterOrHost(state, action.bySeat);
      if (action.slide !== state.talk.index) throw new Error('That slide is gone');
      if (state.paused) throw new Error('Paused');
      if (action.type === 'next') return next(state, ctx.now);
      if (state.talk.index === 0) throw new Error('Already on the first slide');
      return moveTo(state, { ...state.talk, backs: state.talk.backs + 1 }, state.talk.index - 1, ctx.now);
    }

    case 'autoNext': {
      assertHostOnly(action);
      if (state.phase !== 'talk' || !state.talk) throw new Error('Stale timer');
      assertTalkToken(state, action.talk);
      if (action.slide !== state.talk.index) throw new Error('Stale timer');
      const t = state.talk.slideTimer;
      if (!t || state.paused || !isExpired(t, ctx.now)) throw new Error('Not time yet');
      return next(state, ctx.now);
    }

    case 'talkTimeUp': {
      assertHostOnly(action);
      if (state.phase !== 'talk' || !state.talk) throw new Error('Stale timer');
      assertTalkToken(state, action.talk);
      const t = state.talk.talkTimer;
      if (!t || state.paused || !isExpired(t, ctx.now)) throw new Error('Not time yet');
      return endTalk(state, ctx.now, true);
    }

    case 'endQA': {
      if (state.phase !== 'qa' || !state.talk) throw new Error('No Q&A going on');
      assertTalkToken(state, action.talk);
      assertPresenterOrHost(state, action.bySeat);
      return startRating(state, state.talk, ctx.now);
    }

    case 'rate': {
      if (state.phase !== 'rating' || !state.talk) throw new Error('Not rating');
      assertTalkToken(state, action.talk);
      assertSeat(action.bySeat, n);
      if (action.bySeat === state.talk.presenter) throw new Error('No rating your own talk!');
      if (state.ratingMode === 'applause') throw new Error('The applause meter decides this one');
      assertStars(action.stars);
      if (state.rateTimer && isExpired(state.rateTimer, ctx.now - GRACE_MS)) throw new Error('Voting has closed');
      const ratings = state.ratings.slice();
      ratings[action.bySeat] = action.stars;
      const nextState = { ...state, ratings };
      const done = audience(state).every((s) => ratings[s] !== null);
      return done ? reveal(nextState) : nextState;
    }

    case 'applause': {
      assertHostOnly(action);
      if (state.phase !== 'rating' || !state.talk) throw new Error('Not rating');
      assertTalkToken(state, action.talk);
      if (state.ratingMode !== 'applause') throw new Error('The audience is voting');
      assertStars(action.stars);
      return reveal({ ...state, crowd: action.stars });
    }

    case 'rateTimeUp': {
      assertHostOnly(action);
      if (state.phase !== 'rating') throw new Error('Stale timer');
      assertTalkToken(state, action.talk);
      if (!state.rateTimer || state.paused || !isExpired(state.rateTimer, ctx.now)) throw new Error('Not time yet');
      return reveal(state);
    }

    case 'revealNow':
      assertHostOnly(action);
      if (state.phase !== 'rating') throw new Error('Not rating');
      assertTalkToken(state, action.talk);
      return reveal(state);

    case 'nextTalk':
      assertHostOnly(action);
      if (state.phase !== 'reveal') throw new Error('Not between talks');
      assertTalkToken(state, action.talk);
      return setupTalk({ ...state, talkNo: state.talkNo + 1 });

    case 'skipPresenter':
      assertHostOnly(action);
      if (state.phase !== 'intro') throw new Error('Only before the talk starts');
      assertTalkToken(state, action.talk);
      return setupTalk({ ...state, talkNo: state.talkNo + 1 });

    case 'pause': {
      assertHostOnly(action);
      if (state.paused) throw new Error('Already paused');
      if (state.phase === 'talk' && state.talk) {
        const t = state.talk;
        return {
          ...state,
          paused: true,
          talk: {
            ...t,
            slideTimer: t.slideTimer && pauseTimer(t.slideTimer, ctx.now),
            talkTimer: t.talkTimer && pauseTimer(t.talkTimer, ctx.now),
          },
        };
      }
      if (state.phase === 'rating' && state.rateTimer) {
        return { ...state, paused: true, rateTimer: pauseTimer(state.rateTimer, ctx.now) };
      }
      throw new Error('Nothing to pause');
    }

    case 'resume': {
      assertHostOnly(action);
      if (!state.paused) throw new Error('Not paused');
      if (state.phase === 'talk' && state.talk) {
        const t = state.talk;
        return {
          ...state,
          paused: false,
          talk: {
            ...t,
            slideTimer: t.slideTimer && resumeTimer(t.slideTimer, ctx.now),
            talkTimer: t.talkTimer && resumeTimer(t.talkTimer, ctx.now),
          },
        };
      }
      return { ...state, paused: false, rateTimer: state.rateTimer && resumeTimer(state.rateTimer, ctx.now) };
    }

    case 'finish':
      assertHostOnly(action);
      if (state.phase === 'gameOver') throw new Error('Already over');
      return { ...state, phase: 'gameOver', talk: null, paused: false, rateTimer: null, collect: null };

    default:
      throw new Error(`Unknown action ${(action as { type?: unknown }).type as string}`);
  }
}

// ============================================================================
// Results
// ============================================================================

export function standingsOf(state: Pick<SlideshowState, 'seats' | 'history'>): Standing[] {
  return state.seats.map((s) => {
    const mine = state.history.filter((h) => h.presenter === s.index);
    const avgs = mine.map((h) => h.average).filter((a): a is number => a !== null);
    const avg = mean(avgs);
    return { seat: s.index, talks: mine.length, average: avg === null ? null : round1(avg) };
  });
}

function best<T>(items: T[], score: (t: T) => number | null): T | null {
  let top: T | null = null;
  let topScore = -Infinity;
  for (const it of items) {
    const s = score(it);
    if (s !== null && s > topScore) {
      top = it;
      topScore = s;
    }
  }
  return top;
}

function seconds(ms: number): string {
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Simple awards, each derived from data we have. */
export function awardsOf(state: Pick<SlideshowState, 'seats' | 'history'>): Award[] {
  const out: Award[] = [];
  const standings = standingsOf(state);
  const top = best(standings, (s) => s.average);
  if (top && top.average !== null) {
    out.push({ emoji: '🎤', title: 'Most convincing', seat: top.seat, detail: `${top.average.toFixed(1)}★ average` });
  }
  const fives = best(
    state.history.filter((h) => h.votes.some((v) => v === 5)),
    (h) => h.votes.filter((v) => v === 5).length,
  );
  if (fives) {
    const count = fives.votes.filter((v) => v === 5).length;
    out.push({ emoji: '🌟', title: 'Crowd favorite', seat: fives.presenter, detail: `${count} five-star vote${count === 1 ? '' : 's'}` });
  }
  const recovery = best(
    state.history.filter((h) => h.twist !== null),
    (h) => h.average,
  );
  if (recovery && recovery.average !== null) {
    out.push({ emoji: '🛟', title: 'Smoothest recovery', seat: recovery.presenter, detail: `${recovery.average.toFixed(1)}★ after a twist` });
  }
  const timed = state.history.filter((h) => h.durationMs > 0);
  if (timed.length >= 2) {
    const long = best(timed, (h) => h.durationMs)!;
    const short = best(timed, (h) => -h.durationMs)!;
    if (long !== short) {
      out.push({ emoji: '🐢', title: 'Marathon keynote', seat: long.presenter, detail: seconds(long.durationMs) });
      out.push({ emoji: '⚡', title: 'Lightning talk', seat: short.presenter, detail: seconds(short.durationMs) });
    }
  }
  const divisive = best(
    state.history.filter((h) => h.votes.length >= 2),
    (h) => h.votes[h.votes.length - 1]! - h.votes[0]!,
  );
  if (divisive && divisive.votes[divisive.votes.length - 1]! - divisive.votes[0]! >= 2) {
    out.push({
      emoji: '🌶️',
      title: 'Most divisive',
      seat: divisive.presenter,
      detail: `votes from ${divisive.votes[0]}★ to ${divisive.votes[divisive.votes.length - 1]}★`,
    });
  }
  const backs = best(
    state.history.filter((h) => h.backs >= 2),
    (h) => h.backs,
  );
  if (backs) {
    out.push({ emoji: '↩️', title: '“As I mentioned earlier…”', seat: backs.presenter, detail: `went back ${backs.backs} times` });
  }
  return out;
}

// ============================================================================
// View — the redaction chokepoint
// ============================================================================

export function slideshowViewFor(state: SlideshowState, seat: SeatIndex | null): SlideshowView {
  const me = seat !== null && Number.isInteger(seat) && seat >= 0 && seat < state.seats.length ? seat : null;
  const talk = state.talk;
  const live = state.phase === 'intro' || state.phase === 'talk' || state.phase === 'qa' || state.phase === 'rating';
  const inTalk = state.phase === 'talk' && talk !== null;
  const last = state.history[state.history.length - 1];
  const over = state.phase === 'gameOver';
  const presenter = live && talk ? talk.presenter : state.phase === 'reveal' && last ? last.presenter : null;

  let rating: SlideshowView['rating'] = null;
  if (state.phase === 'rating' && talk) {
    const aud = audience(state);
    rating = {
      timer: state.rateTimer ? { ...state.rateTimer } : null,
      audience: aud,
      voted: state.seats.map((s) => state.ratings[s.index] !== null && state.ratings[s.index] !== undefined),
      yours: me !== null && me !== talk.presenter ? (state.ratings[me] ?? null) : null,
    };
  }

  let revealView: SlideshowView['reveal'] = null;
  if (state.phase === 'reveal' && last) {
    const histogram = [0, 0, 0, 0, 0];
    for (const v of last.votes) histogram[v - 1]! += 1;
    revealView = {
      presenter: last.presenter,
      title: last.title,
      average: last.average === null ? null : round1(last.average),
      votes: last.votes.length,
      histogram,
      label: ratingLabel(last.average),
      crowd: last.crowd !== null,
    };
  }

  let results: SlideshowView['results'] = null;
  if (over) {
    results = {
      talks: state.history.map((h) => ({
        presenter: h.presenter,
        title: h.title,
        topic: h.topic,
        topicBy: h.topicAuthor === null ? null : (state.seats[h.topicAuthor]?.name ?? null),
        average: h.average === null ? null : round1(h.average),
        votes: h.crowd !== null ? 1 : h.votes.length,
      })),
      awards: awardsOf(state),
    };
  }

  const nextIdx = state.talkNo + 1;
  const showTwist = talk !== null && talk.twistShown && (inTalk || state.phase === 'qa' || state.phase === 'rating');
  return {
    phase: state.phase,
    seats: state.seats.map((s) => ({ ...s })),
    collect: state.phase === 'collect' && state.collect ? collectView(state.collect, me, state.seats.length) : null,
    ratingMode: state.ratingMode,
    talkNo: state.talkNo,
    talkCount: state.order.length,
    presenter,
    nextPresenter: !over && nextIdx < state.order.length ? state.order[nextIdx]! : null,
    talkTitle: live && talk ? (talk.deck[0]?.title ?? null) : state.phase === 'reveal' && last ? last.title : null,
    slide: inTalk ? structuredClone(talk.deck[talk.index]!) : null,
    slideIndex: inTalk ? talk.index : 0,
    slideCount: talk?.deck.length ?? state.options.slides,
    slideTimer: inTalk && talk.slideTimer ? { ...talk.slideTimer } : null,
    talkTimer: inTalk && talk.talkTimer ? { ...talk.talkTimer } : null,
    paused: state.paused,
    autoAdvance: state.options.autoAdvance,
    twistsOn: state.options.twists,
    qaOn: state.options.qa,
    twist: showTwist ? talk.twist : null,
    questions: state.phase === 'qa' && talk ? talk.questions.slice() : [],
    rating,
    reveal: revealView,
    standings: standingsOf(state),
    results,
  };
}

// ============================================================================
// Module
// ============================================================================

export const slideshowModule: GameModule<SlideshowState, SlideshowView, SlideshowAction> = {
  id: 'slideshow',
  displayName: 'Slideshow Karaoke',
  minPlayers: 2,
  maxPlayers: 20,

  createInitialState(config: GameConfig): SlideshowState {
    const options = readOptions(config.gameOptions);
    const seats = config.seats.map((s, i) => ({ index: i, name: s.name }));
    const n = seats.length;
    if (n < this.minPlayers || n > this.maxPlayers) {
      throw new Error(`Slideshow Karaoke needs ${this.minPlayers}–${this.maxPlayers} players.`);
    }
    const problem = optionsProblem(config.gameOptions, n);
    if (problem) throw new Error(problem);
    // One device for everyone (no uids) → the single-device rating choice.
    const local = config.seats.every((s) => s.uuid === null);
    const rng = makeRng(subSeed(config.seed, 0x511d));
    const pool = rngShuffle(rng, buildPool({ source: { ...options.words, perPlayer: 0 }, lists: config.lists }))
      .slice(0, POOL_SAMPLE)
      .map((p) => ({ text: p.text, author: null }));
    const base: SlideshowState = {
      phase: 'intro',
      options,
      seats,
      ratingMode: local ? options.localRating : 'phones',
      rng,
      deckSeed: subSeed(config.seed, 0xdec4),
      collect: null,
      pool,
      used: [],
      order: presenterOrder(rng, n, options.talksEach),
      talkNo: 0,
      talk: null,
      paused: false,
      ratings: seats.map(() => null),
      crowd: null,
      rateTimer: null,
      history: [],
    };
    if (options.words.perPlayer > 0) {
      const k = options.words.perPlayer;
      return {
        ...base,
        phase: 'collect',
        collect: startCollect(
          'words',
          k,
          `Write ${k} talk topic${k === 1 ? '' : 's'} — any noun works. You’ll never get your own.`,
        ),
      };
    }
    return setupTalk(base);
  },

  applyAction: applySlideshow,
  viewFor: slideshowViewFor,

  isFinished: (state) => state.phase === 'gameOver',

  defaultOptions: () => structuredClone(DEFAULT_OPTIONS) as unknown as Record<string, unknown>,

  optionsProblem,

  nextScheduled(state) {
    if (state.paused) return null;
    if (state.phase === 'talk' && state.talk) {
      const t = state.talk;
      const slideAt = t.slideTimer?.endsAt ?? null;
      const talkAt = t.talkTimer?.endsAt ?? null;
      if (talkAt !== null && (slideAt === null || talkAt <= slideAt)) {
        return { at: talkAt, action: { type: 'talkTimeUp', talk: state.talkNo } };
      }
      if (slideAt !== null) return { at: slideAt, action: { type: 'autoNext', talk: state.talkNo, slide: t.index } };
      return null;
    }
    if (state.phase === 'rating' && state.rateTimer?.endsAt != null) {
      return { at: state.rateTimer.endsAt, action: { type: 'rateTimeUp', talk: state.talkNo } };
    }
    return null;
  },
};

