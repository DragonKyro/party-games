import { describe, expect, it } from 'vitest';
import type { ActionContext, GameConfig, SeatIndex } from '@/engine/types';
import type { SlideshowAction } from './actions';
import type { SlideSpec } from './deck';
import { awardsOf, slideshowModule as mod } from './module';
import { readOptions } from './rules';
import type { SlideshowState, SlideshowView, TalkRecord } from './state';

const NAMES = ['Ana', 'Ben', 'Cai', 'Dee', 'Eli'];
const SEATS = NAMES.map((_, i) => i);

/** Online by default (seats have uids); `local` = one shared device. */
function config(options: Record<string, unknown> = {}, names = NAMES, local = false, seed = 12345): GameConfig {
  return {
    gameId: 'slideshow',
    seats: names.map((name, index) => ({ index, uuid: local ? null : `uid-${index}`, name })),
    seed,
    now: 0,
    gameOptions: { ...mod.defaultOptions(), ...options },
    lists: {},
  };
}

let clock = 1_000;
const ctx = (now = clock): ActionContext => ({ by: '', now });
function act(s: SlideshowState, a: SlideshowAction, now = clock): SlideshowState {
  return mod.applyAction(s, a, ctx(now));
}
const sched = (s: SlideshowState, now: number): ActionContext => ({ by: 'host:scheduler', now });

const quiet = { twists: false, qa: false };

function presenterOf(s: SlideshowState): SeatIndex {
  return s.talk!.presenter;
}

function startTalk(s: SlideshowState, now = clock): SlideshowState {
  return act(s, { type: 'startTalk', bySeat: presenterOf(s), talk: s.talkNo }, now);
}

/** Click Next until the talk ends (into Q&A or rating). */
function clickThrough(s: SlideshowState, now = clock): SlideshowState {
  while (s.phase === 'talk') s = act(s, { type: 'next', bySeat: presenterOf(s), slide: s.talk!.index }, now);
  return s;
}

function rateAll(s: SlideshowState, stars: (seat: number) => number): SlideshowState {
  const p = presenterOf(s);
  for (const seat of SEATS) if (seat !== p && s.phase === 'rating') s = act(s, { type: 'rate', bySeat: seat, talk: s.talkNo, stars: stars(seat) });
  return s;
}

/** Play one whole talk (no Q&A / twist settings assumed), ending in the reveal. */
function playTalk(s: SlideshowState, stars: (seat: number) => number = () => 4): SlideshowState {
  s = clickThrough(startTalk(s));
  if (s.phase === 'qa') s = act(s, { type: 'endQA', talk: s.talkNo });
  return rateAll(s, stars);
}

function views(s: SlideshowState): Array<[SeatIndex | null, SlideshowView]> {
  return [null, ...SEATS].map((seat) => [seat, mod.viewFor(s, seat)]);
}

/** The slide minus its theme — the distinctive part. */
function body(slide: SlideSpec): string {
  const { theme: _theme, ...rest } = slide;
  return JSON.stringify(rest);
}

describe('setup', () => {
  it('goes straight to the first intro when nobody writes topics', () => {
    const s = mod.createInitialState(config());
    expect(s.phase).toBe('intro');
    expect(s.order).toHaveLength(5);
    expect(new Set(s.order)).toEqual(new Set(SEATS));
    expect(s.talk!.deck).toHaveLength(6);
    const v = mod.viewFor(s, null);
    expect(v.presenter).toBe(s.order[0]);
    expect(v.talkTitle).toBe(s.talk!.deck[0]!.title);
    expect(v.slide).toBeNull();
    expect(v.talkCount).toBe(5);
  });

  it('two talks each: every player twice, never twice in a row', () => {
    for (let seed = 1; seed < 30; seed++) {
      const s = mod.createInitialState(config({ talksEach: 2 }, NAMES, false, seed));
      expect(s.order).toHaveLength(10);
      for (const seat of SEATS) expect(s.order.filter((x) => x === seat)).toHaveLength(2);
      for (let i = 1; i < s.order.length; i++) expect(s.order[i]).not.toBe(s.order[i - 1]);
    }
  });

  it('collects player topics first, and never hands you your own', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const names = NAMES.slice(0, 2 + (seed % 4));
      let s = mod.createInitialState(config({ ...quiet, words: { packs: [], listIds: [], perPlayer: 1 } }, names, false, seed));
      expect(s.phase).toBe('collect');
      names.forEach((_, i) => {
        s = act(s, { type: 'collect.submit', bySeat: i, entries: [`Topic by ${i}`] });
      });
      expect(s.phase).toBe('intro');
      while (s.phase === 'intro') {
        const t = s.talk!;
        expect(t.topicAuthor).not.toBe(t.presenter);
        expect(t.topic).not.toBe(`Topic by ${t.presenter}`);
        s = act(s, { type: 'skipPresenter', talk: s.talkNo });
      }
      expect(s.phase).toBe('gameOver');
    }
  });

  it('prefers player-written topics over packs', () => {
    let s = mod.createInitialState(config({ words: { packs: ['animals'], listIds: [], perPlayer: 2 } }));
    SEATS.forEach((i) => {
      s = act(s, { type: 'collect.submit', bySeat: i, entries: [`Mine ${i}a`, `Mine ${i}b`] });
    });
    const authors: Array<number | null> = [];
    while (s.phase === 'intro') {
      authors.push(s.talk!.topicAuthor);
      s = act(s, { type: 'skipPresenter', talk: s.talkNo });
    }
    expect(authors.every((a) => a !== null)).toBe(true);
  });

  it('uses host lists, and the host can stop waiting for writers', () => {
    const s = mod.createInitialState({
      ...config({ words: { packs: [], listIds: ['L'], perPlayer: 0 } }),
      lists: { L: ['Grandma’s sofa', 'Tax season', 'The office fridge', 'Jazz hands', 'Moon cheese'] },
    });
    expect(['Grandma’s sofa', 'Tax season', 'The office fridge', 'Jazz hands', 'Moon cheese']).toContain(s.talk!.topic);

    let c = mod.createInitialState(config({ words: { packs: ['jobs'], listIds: [], perPlayer: 1 } }));
    c = act(c, { type: 'collect.submit', bySeat: 0, entries: ['Only one'] });
    expect(() => act(c, { type: 'collect.close', bySeat: 0 } as never)).toThrow(/host/);
    c = act(c, { type: 'collect.close' });
    expect(c.phase).toBe('intro');
  });

  it('refuses impossible setups and coerces options', () => {
    expect(() => mod.createInitialState(config({}, ['Solo']))).toThrow(/2–20/);
    expect(() => mod.createInitialState(config({}, Array.from({ length: 21 }, (_, i) => `P${i}`)))).toThrow();
    expect(() => mod.createInitialState(config({ words: { packs: [], listIds: [], perPlayer: 0 } }))).toThrow(/topics come from/);
    const o = readOptions({ slides: 99, autoAdvance: 17, talkSeconds: 'x', rateSeconds: 5, localRating: 'nope', talksEach: 9 });
    expect(o).toMatchObject({ slides: 10, autoAdvance: 0, talkSeconds: 0, rateSeconds: 15, localRating: 'applause', talksEach: 2 });
    expect(readOptions({ words: { packs: [], listIds: [], perPlayer: 9 } }).words.perPlayer).toBe(3);
  });

  it('picks the rating mode from where it is played', () => {
    expect(mod.createInitialState(config()).ratingMode).toBe('phones');
    expect(mod.createInitialState(config({}, NAMES, true)).ratingMode).toBe('applause');
    expect(mod.createInitialState(config({ localRating: 'pass' }, NAMES, true)).ratingMode).toBe('pass');
  });
});

describe('the talk', () => {
  it('only the presenter (or the host) starts and clicks; tokens refuse stale or double clicks', () => {
    let s = mod.createInitialState(config(quiet));
    const p = presenterOf(s);
    const other = (p + 1) % 5;
    expect(() => act(s, { type: 'startTalk', bySeat: other, talk: 0 })).toThrow(/presenter/);
    expect(() => act(s, { type: 'startTalk', talk: 3 })).toThrow(/over/);
    s = act(s, { type: 'startTalk', talk: 0 }); // host for them
    expect(s.phase).toBe('talk');
    expect(s.talk!.startedAt).toBe(clock);
    expect(() => act(s, { type: 'next', bySeat: other, slide: 0 })).toThrow(/presenter/);
    expect(() => act(s, { type: 'back', bySeat: p, slide: 0 })).toThrow(/first slide/);
    s = act(s, { type: 'next', bySeat: p, slide: 0 });
    expect(s.talk!.index).toBe(1);
    expect(() => act(s, { type: 'next', bySeat: p, slide: 0 })).toThrow(/gone/); // double tap
    s = act(s, { type: 'back', slide: 1 });
    expect(s.talk!.index).toBe(0);
    expect(s.talk!.backs).toBe(1);
  });

  it('Next on the closer ends the talk: Q&A when on, else straight to rating', () => {
    let s = clickThrough(startTalk(mod.createInitialState(config({ twists: false, qa: true }))));
    expect(s.phase).toBe('qa');
    const v = mod.viewFor(s, null);
    expect(v.questions.length).toBeGreaterThanOrEqual(1);
    expect(v.questions.length).toBeLessThanOrEqual(2);
    expect(() => act(s, { type: 'endQA', bySeat: (presenterOf(s) + 1) % 5, talk: 0 })).toThrow(/presenter/);
    s = act(s, { type: 'endQA', bySeat: presenterOf(s), talk: 0 });
    expect(s.phase).toBe('rating');

    const q = clickThrough(startTalk(mod.createInitialState(config(quiet))));
    expect(q.phase).toBe('rating');
  });

  it('the wildcard twist lands mid-talk for everyone and stays', () => {
    let s = startTalk(mod.createInitialState(config({ twists: true, qa: false, slides: 8 })));
    const at = s.talk!.twistAt!;
    expect(at).toBeGreaterThanOrEqual(1);
    expect(at).toBeLessThanOrEqual(6);
    const twist = s.talk!.twist!;
    const p = presenterOf(s);
    while (s.talk!.index < at) {
      for (const [, v] of views(s)) {
        expect(v.twist).toBeNull();
        expect(JSON.stringify(v)).not.toContain(twist);
      }
      s = act(s, { type: 'next', bySeat: p, slide: s.talk!.index });
    }
    for (const [, v] of views(s)) expect(v.twist).toBe(twist);
    s = act(s, { type: 'back', bySeat: p, slide: s.talk!.index });
    expect(mod.viewFor(s, null).twist).toBe(twist);
  });

  it('auto-advance is a scheduled action that restarts on every click and ends the talk on the closer', () => {
    let s = startTalk(mod.createInitialState(config({ ...quiet, autoAdvance: 15, slides: 4 })));
    const first = mod.nextScheduled!(s)!;
    expect(first).toEqual({ at: clock + 15_000, action: { type: 'autoNext', talk: 0, slide: 0 } });
    expect(() => act(s, first.action, clock + 1000)).toThrow(/Not time/);
    s = mod.applyAction(s, first.action, sched(s, first.at));
    expect(s.talk!.index).toBe(1);
    // A click restarts the clock and makes the old timer stale.
    s = act(s, { type: 'next', bySeat: presenterOf(s), slide: 1 }, first.at + 5000);
    expect(mod.nextScheduled!(s)!.at).toBe(first.at + 5000 + 15_000);
    expect(() => mod.applyAction(s, { type: 'autoNext', talk: 0, slide: 1 }, sched(s, first.at + 99_000))).toThrow(/Stale/);
    // Ride it out to the end.
    for (let i = 0; i < 5 && s.phase === 'talk'; i++) {
      const n = mod.nextScheduled!(s)!;
      s = mod.applyAction(s, n.action, sched(s, n.at));
    }
    expect(s.phase).toBe('rating');
    expect(s.talk!.timedOut).toBe(false);
  });

  it('the overall talk timer ends the talk wherever it is', () => {
    let s = startTalk(mod.createInitialState(config({ ...quiet, talkSeconds: 60, autoAdvance: 30 })));
    // Auto-advance (30s) comes first, then the talk timer (60s) wins the tie.
    expect(mod.nextScheduled!(s)!.action.type).toBe('autoNext');
    s = mod.applyAction(s, mod.nextScheduled!(s)!.action, sched(s, clock + 30_000));
    const n = mod.nextScheduled!(s)!;
    expect(n).toEqual({ at: clock + 60_000, action: { type: 'talkTimeUp', talk: 0 } });
    expect(() => mod.applyAction(s, n.action, sched(s, clock + 59_000))).toThrow(/Not time/);
    s = mod.applyAction(s, n.action, sched(s, n.at));
    expect(s.phase).toBe('rating');
    expect(s.talk!.timedOut).toBe(true);
    expect(s.talk!.endedAt).toBe(clock + 60_000);
  });

  it('pausing freezes the timers, the schedule and the clicker', () => {
    let s = startTalk(mod.createInitialState(config({ ...quiet, autoAdvance: 20, talkSeconds: 120 })));
    expect(() => act(s, { type: 'pause', bySeat: 0 } as never)).toThrow(/host/);
    s = act(s, { type: 'pause' }, clock + 5000);
    expect(mod.nextScheduled!(s)).toBeNull();
    expect(mod.viewFor(s, null).paused).toBe(true);
    expect(() => act(s, { type: 'next', bySeat: presenterOf(s), slide: 0 })).toThrow(/Paused/);
    s = act(s, { type: 'resume' }, clock + 100_000);
    expect(mod.nextScheduled!(s)).toEqual({ at: clock + 100_000 + 15_000, action: { type: 'autoNext', talk: 0, slide: 0 } });
  });
});

describe('rating', () => {
  function rating(options: Record<string, unknown> = {}, local = false): SlideshowState {
    return clickThrough(startTalk(mod.createInitialState(config({ ...quiet, ...options }, NAMES, local))));
  }

  it('the audience rates (not the presenter); votes reveal when everyone is in', () => {
    let s = rating();
    const p = presenterOf(s);
    const aud = SEATS.filter((x) => x !== p);
    expect(() => act(s, { type: 'rate', bySeat: p, talk: 0, stars: 5 })).toThrow(/own/);
    expect(() => act(s, { type: 'rate', bySeat: aud[0]!, talk: 0, stars: 6 })).toThrow(/rating/);
    expect(() => act(s, { type: 'rate', bySeat: aud[0]!, talk: 0, stars: 2.5 })).toThrow(/rating/);
    expect(() => act(s, { type: 'rate', bySeat: aud[0]!, talk: 1, stars: 3 })).toThrow(/over/);
    s = act(s, { type: 'rate', bySeat: aud[0]!, talk: 0, stars: 1 });
    s = act(s, { type: 'rate', bySeat: aud[0]!, talk: 0, stars: 3 }); // changed their mind
    expect(mod.viewFor(s, aud[0]!).rating!.yours).toBe(3);
    s = act(s, { type: 'rate', bySeat: aud[1]!, talk: 0, stars: 5 });
    s = act(s, { type: 'rate', bySeat: aud[2]!, talk: 0, stars: 4 });
    expect(s.phase).toBe('rating');
    s = act(s, { type: 'rate', bySeat: aud[3]!, talk: 0, stars: 4 });
    expect(s.phase).toBe('reveal');
    const r = mod.viewFor(s, null).reveal!;
    expect(r).toMatchObject({ presenter: p, average: 4, votes: 4, histogram: [0, 0, 1, 2, 1], crowd: false });
    expect(r.label).toBe('Standing ovation');
  });

  it('the rating timer reveals whatever is in (with a short grace window)', () => {
    let s = rating({ rateSeconds: 20 });
    const p = presenterOf(s);
    const aud = SEATS.filter((x) => x !== p);
    const n = mod.nextScheduled!(s)!;
    expect(n).toEqual({ at: clock + 20_000, action: { type: 'rateTimeUp', talk: 0 } });
    s = act(s, { type: 'rate', bySeat: aud[0]!, talk: 0, stars: 2 });
    expect(() => act(s, { type: 'rate', bySeat: aud[1]!, talk: 0, stars: 5 }, n.at + 1000)).not.toThrow();
    expect(() => act(s, { type: 'rate', bySeat: aud[1]!, talk: 0, stars: 5 }, n.at + 5000)).toThrow(/closed/);
    expect(() => mod.applyAction(s, n.action, sched(s, n.at - 1))).toThrow(/Not time/);
    s = mod.applyAction(s, n.action, sched(s, n.at));
    expect(s.phase).toBe('reveal');
    expect(mod.viewFor(s, null).reveal).toMatchObject({ average: 2, votes: 1 });
    expect(mod.nextScheduled!(s)).toBeNull();
  });

  it('the host can reveal early; no votes at all is survivable', () => {
    let s = rating();
    expect(() => act(s, { type: 'revealNow', bySeat: 1, talk: 0 } as never)).toThrow(/host/);
    s = act(s, { type: 'revealNow', talk: 0 });
    expect(mod.viewFor(s, null).reveal).toMatchObject({ average: null, votes: 0 });
    expect(mod.viewFor(s, null).reveal!.label).toMatch(/speechless/);
  });

  it('single device, applause meter: one crowd reading, no timer, no individual votes', () => {
    let s = rating({}, true);
    expect(s.ratingMode).toBe('applause');
    expect(s.rateTimer).toBeNull();
    expect(mod.nextScheduled!(s)).toBeNull();
    expect(() => act(s, { type: 'rate', bySeat: (presenterOf(s) + 1) % 5, talk: 0, stars: 3 })).toThrow(/applause/);
    expect(() => act(s, { type: 'applause', talk: 0, stars: 0 })).toThrow(/rating/);
    s = act(s, { type: 'applause', talk: 0, stars: 5 });
    expect(mod.viewFor(s, null).reveal).toMatchObject({ average: 5, crowd: true, label: 'Keynote legend' });
    expect(() => act(rating(), { type: 'applause', talk: 0, stars: 5 })).toThrow(/voting/);
  });

  it('single device, pass the device: everyone votes, no timer', () => {
    let s = rating({ localRating: 'pass' }, true);
    expect(s.ratingMode).toBe('pass');
    expect(mod.nextScheduled!(s)).toBeNull();
    s = rateAll(s, () => 3);
    expect(s.phase).toBe('reveal');
    expect(mod.viewFor(s, null).reveal!.average).toBe(3);
  });

  it('nextTalk moves on (once), and the last one ends the game', () => {
    let s = mod.createInitialState(config(quiet, NAMES.slice(0, 3)));
    s = playTalk(s);
    expect(s.phase).toBe('reveal');
    expect(() => act(s, { type: 'nextTalk', talk: 5 })).toThrow(/over/);
    s = act(s, { type: 'nextTalk', talk: 0 });
    expect(s.phase).toBe('intro');
    expect(s.talkNo).toBe(1);
    expect(() => act(s, { type: 'nextTalk', talk: 0 })).toThrow(); // double tap
    s = act(playTalk(s), { type: 'nextTalk', talk: 1 });
    s = act(playTalk(s), { type: 'nextTalk', talk: 2 });
    expect(s.phase).toBe('gameOver');
    expect(mod.isFinished(s)).toBe(true);
  });
});

describe('host controls', () => {
  it('skip and finish are host-only and token-guarded', () => {
    let s = mod.createInitialState(config(quiet));
    expect(() => act(s, { type: 'skipPresenter', bySeat: 0, talk: 0 } as never)).toThrow(/host/);
    expect(() => act(s, { type: 'skipPresenter', talk: 1 })).toThrow(/over/);
    const first = s.talk!.topic;
    s = act(s, { type: 'skipPresenter', talk: 0 });
    expect(s.talkNo).toBe(1);
    expect(s.talk!.topic).not.toBe(first);
    expect(() => act(s, { type: 'finish', bySeat: 1 } as never)).toThrow(/host/);
    s = act(s, { type: 'finish' });
    expect(s.phase).toBe('gameOver');
    expect(() => act(s, { type: 'finish' })).toThrow(/over/);
    const v = mod.viewFor(s, null);
    expect(v.results!.talks).toEqual([]);
    expect(v.results!.awards).toEqual([]);
    expect(v.slide).toBeNull();
    expect(v.nextPresenter).toBeNull();
  });

  it('pausing the rating clock holds the reveal; nothing to pause in the intro', () => {
    let s = clickThrough(startTalk(mod.createInitialState(config(quiet))));
    expect(() => act(mod.createInitialState(config(quiet)), { type: 'pause' })).toThrow(/Nothing/);
    s = act(s, { type: 'pause' }, clock + 5000);
    expect(mod.nextScheduled!(s)).toBeNull();
    expect(() => mod.applyAction(s, { type: 'rateTimeUp', talk: 0 }, sched(s, clock + 99_000))).toThrow(/Not time/);
    s = act(s, { type: 'resume' }, clock + 60_000);
    expect(mod.nextScheduled!(s)!.at).toBe(clock + 60_000 + 25_000);
  });

  it('only the next slide token works for Next; actions in the wrong phase are refused', () => {
    const s = mod.createInitialState(config(quiet));
    expect(() => act(s, { type: 'next', slide: 0 })).toThrow(/No talk/);
    expect(() => act(s, { type: 'rate', bySeat: 1, talk: 0, stars: 3 })).toThrow(/Not rating/);
    expect(() => act(s, { type: 'endQA', talk: 0 })).toThrow(/Q&A/);
    expect(() => act(s, { type: 'nextTalk', talk: 0 })).toThrow(/between/);
    expect(() => act(s, { type: 'bogus' } as never)).toThrow(/Unknown/);
  });
});

describe('results', () => {
  it('ranks presenters by average and hands out awards from the data', () => {
    let s = mod.createInitialState(config({ twists: true, qa: false, slides: 4 }, NAMES.slice(0, 3)));
    const scores: Record<number, number> = {};
    for (let t = 0; t < 3; t++) {
      const p = presenterOf(s);
      scores[p] = 2 + t;
      s = clickThrough(startTalk(s, clock), clock + (t + 1) * 30_000);
      s = rateAll(s, () => 2 + t);
      s = act(s, { type: 'nextTalk', talk: t });
    }
    const v = mod.viewFor(s, null);
    expect(v.phase).toBe('gameOver');
    const top = v.standings.reduce((a, b) => ((b.average ?? 0) > (a.average ?? 0) ? b : a));
    expect(top.average).toBe(4);
    expect(v.results!.talks).toHaveLength(3);
    const titles = v.results!.awards.map((a) => a.title);
    expect(titles).toContain('Most convincing');
    expect(v.results!.awards.find((a) => a.title === 'Most convincing')!.seat).toBe(top.seat);
    expect(titles).toContain('Smoothest recovery'); // every talk passed its twist
    expect(titles).toContain('Marathon keynote');
    expect(titles).toContain('Lightning talk');
  });

  it('awards only what the data supports', () => {
    const h = (p: number, votes: number[], extra: Partial<TalkRecord> = {}): TalkRecord => ({
      presenter: p,
      title: 't',
      topic: 't',
      topicAuthor: null,
      votes,
      crowd: null,
      average: votes.length ? votes.reduce((a, b) => a + b, 0) / votes.length : null,
      twist: null,
      durationMs: 0,
      backs: 0,
      timedOut: false,
      ...extra,
    });
    const seats = NAMES.slice(0, 3).map((name, index) => ({ index, name }));
    expect(awardsOf({ seats, history: [] })).toEqual([]);
    const awards = awardsOf({ seats, history: [h(0, [1, 5]), h(1, [4, 4], { backs: 3 }), h(2, [])] });
    const by = Object.fromEntries(awards.map((a) => [a.title, a.seat]));
    expect(by['Most convincing']).toBe(1);
    expect(by['Crowd favorite']).toBe(0);
    expect(by['Most divisive']).toBe(0);
    expect(by['“As I mentioned earlier…”']).toBe(1);
    expect(by['Smoothest recovery']).toBeUndefined();
  });
});

describe('hidden information', () => {
  it('no view — the presenter’s included — ever holds a slide that isn’t on screen', () => {
    let s = mod.createInitialState(config({ twists: true, qa: true, slides: 10 }));
    const deck = s.talk!.deck;
    // Intro: only the title text.
    for (const [, v] of views(s)) {
      expect(v.slide).toBeNull();
      const json = JSON.stringify(v);
      for (const slide of deck) expect(json).not.toContain(body(slide));
      for (const slide of deck.slice(1)) expect(json).not.toContain(JSON.stringify(slide.title));
    }
    s = startTalk(s);
    while (s.phase === 'talk') {
      const i = s.talk!.index;
      for (const [, v] of views(s)) {
        expect(v.slide).toEqual(deck[i]);
        expect(v.slideIndex).toBe(i);
        expect(v.slideCount).toBe(10);
        const json = JSON.stringify(v);
        for (const future of deck.slice(i + 1)) {
          expect(json).not.toContain(body(future));
          if (!body(deck[i]!).includes(future.title)) expect(json).not.toContain(JSON.stringify(future.title));
        }
      }
      s = act(s, { type: 'next', bySeat: presenterOf(s), slide: s.talk!.index });
    }
  });

  it('views are identical whatever the hidden rest of the deck, twist and questions are', () => {
    const a = act(startTalk(mod.createInitialState(config({ twists: true, qa: true, slides: 8 })), clock), {
      type: 'next',
      slide: 0,
    });
    const t = a.talk!;
    const other = mod.createInitialState(config({ twists: true, qa: true, slides: 8 }, NAMES, false, 999)).talk!;
    const b: SlideshowState = {
      ...a,
      talk: {
        ...t,
        deck: [...t.deck.slice(0, 2), ...other.deck.slice(2)],
        twist: 'Something else entirely',
        twistAt: 7,
        questions: ['A different question?'],
      },
    };
    expect(t.twistShown).toBe(false); // 8-slide decks never twist before slide 2
    for (const seat of [null, ...SEATS]) {
      expect(JSON.stringify(mod.viewFor(a, seat))).toBe(JSON.stringify(mod.viewFor(b, seat)));
    }
  });

  it('ratings stay hidden until the reveal (and who-gave-what, forever)', () => {
    let s = clickThrough(startTalk(mod.createInitialState(config(quiet))));
    const p = presenterOf(s);
    const [x, y, ...rest] = SEATS.filter((i) => i !== p);
    const a = act(act(s, { type: 'rate', bySeat: x!, talk: 0, stars: 1 }), { type: 'rate', bySeat: y!, talk: 0, stars: 5 });
    const b = act(act(s, { type: 'rate', bySeat: x!, talk: 0, stars: 4 }), { type: 'rate', bySeat: y!, talk: 0, stars: 2 });
    for (const seat of [null, p, ...rest]) {
      expect(JSON.stringify(mod.viewFor(a, seat))).toBe(JSON.stringify(mod.viewFor(b, seat)));
    }
    expect(mod.viewFor(a, x!).rating!.yours).toBe(1);
    expect(mod.viewFor(a, y!).rating!.yours).toBe(5);
    expect(mod.viewFor(a, null).rating!.voted.filter(Boolean)).toHaveLength(2);
    expect(mod.viewFor(a, p).rating!.yours).toBeNull();
    s = rest.reduce((acc, seat) => act(acc, { type: 'rate', bySeat: seat, talk: 0, stars: 3 }), a);
    expect(s.phase).toBe('reveal');
    const json = JSON.stringify(mod.viewFor(s, null));
    expect(json).not.toContain('"ratings"');
    expect(mod.viewFor(s, null).rating).toBeNull();
  });

  it('player-written topics stay hidden until used, and authors until the end', () => {
    let s = mod.createInitialState(
      config({ ...quiet, words: { packs: ['animals'], listIds: [], perPlayer: 1 } }, NAMES.slice(0, 3)),
    );
    s = act(s, { type: 'collect.submit', bySeat: 0, entries: ['Uncle Steve’s boat'] });
    for (const seat of [null, 1, 2]) expect(JSON.stringify(mod.viewFor(s, seat))).not.toContain('Steve');
    expect(mod.viewFor(s, 0).collect!.yours).toEqual(['Uncle Steve’s boat']);
    s = act(s, { type: 'collect.submit', bySeat: 1, entries: ['Grandpa’s moustache'] });
    s = act(s, { type: 'collect.submit', bySeat: 2, entries: ['The haunted printer'] });
    const secrets = ['Steve', 'Grandpa', 'haunted'];
    let talks = 0;
    while (s.phase !== 'gameOver') {
      const t = s.talk!;
      const unused = secrets.filter((x) => !s.history.some((h) => h.topic.includes(x)) && !t.topic.includes(x));
      // Unused topics: nowhere — not in any view, not in any slide of this deck.
      for (const slide of t.deck) for (const x of unused) expect(JSON.stringify(slide)).not.toContain(x);
      s = startTalk(s);
      while (s.phase === 'talk') {
        for (const [, v] of views(s)) {
          const json = JSON.stringify(v);
          for (const x of unused) expect(json).not.toContain(x);
          expect(json).not.toContain('topicAuthor');
        }
        s = act(s, { type: 'next', slide: s.talk!.index });
      }
      s = rateAll(s, () => 3);
      s = act(s, { type: 'nextTalk', talk: s.talkNo });
      talks++;
    }
    expect(talks).toBe(3);
    const results = mod.viewFor(s, null).results!;
    for (const r of results.talks) {
      expect(r.topicBy).not.toBeNull();
      expect(r.topicBy).not.toBe(NAMES[r.presenter]);
    }
  });

  it('never exposes the rng, the deck seed or the topic pool', () => {
    const s = startTalk(mod.createInitialState(config()));
    for (const [, v] of views(s)) {
      const json = JSON.stringify(v);
      expect(json).not.toContain('"rng"');
      expect(json).not.toContain('deckSeed');
      expect(json).not.toContain('"pool"');
      expect(json).not.toContain('"deck"');
      expect(json).not.toContain(String(s.deckSeed));
    }
  });
});
