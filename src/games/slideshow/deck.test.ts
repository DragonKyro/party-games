import { describe, expect, it } from 'vitest';
import { makeRng, rngFloat } from '@/engine/rng';
import {
  KIND_GROUP,
  LIMITS,
  MAX_SLIDES,
  MIN_SLIDES,
  PALETTES,
  buildDeck,
  clip,
  generateDeck,
  generateQuestions,
  planKinds,
  type MiddleKind,
  type SlideSpec,
} from './deck';

const SEEDS = Array.from({ length: 60 }, (_, i) => 1000 + i * 7919);

/** Every human-readable string in a slide (theme colours excluded). */
function texts(s: SlideSpec): string[] {
  const out: string[] = [s.title];
  switch (s.kind) {
    case 'title':
      out.push(s.subtitle, s.presenter, s.role);
      break;
    case 'bullets':
      out.push(...s.bullets);
      break;
    case 'chart':
      out.push(...s.chart.points.map((p) => p.label));
      if (s.chart.axis) out.push(s.chart.axis);
      if (s.caption) out.push(s.caption);
      break;
    case 'table':
      out.push(...s.columns.filter(Boolean));
      for (const r of s.rows) for (const c of r) if (c.t === 'text' || c.t === 'num') out.push(c.v);
      break;
    case 'image':
      out.push(s.caption);
      break;
    case 'diagram': {
      const d = s.diagram;
      if (d.type === 'venn') out.push(...d.sets, d.center);
      else if (d.type === 'matrix') out.push(d.x, d.y, ...d.quadrants, ...d.dots.map((x) => x.label));
      else if (d.type === 'pyramid') out.push(...d.levels);
      else out.push(...d.steps);
      if (s.caption) out.push(s.caption);
      break;
    }
    case 'bigNumber':
      out.push(s.value, s.caption);
      break;
    case 'quote':
      out.push(s.quote, s.author);
      if (s.role) out.push(s.role);
      break;
    case 'timeline':
      for (const p of s.points) out.push(p.when, p.label);
      break;
    case 'closer':
      out.push(s.subtitle);
      break;
  }
  return out;
}

const middle = (deck: SlideSpec[]) => deck.slice(1, -1) as Array<Exclude<SlideSpec, { kind: 'title' | 'closer' }>>;

describe('generateDeck: shape', () => {
  it('is deterministic for a seed, and different seeds give different decks', () => {
    const a = generateDeck(42, 'Penguins', ['Toaster', 'Lighthouse'], 6, { presenter: 'Ana' });
    const b = generateDeck(42, 'Penguins', ['Toaster', 'Lighthouse'], 6, { presenter: 'Ana' });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    const c = generateDeck(43, 'Penguins', ['Toaster', 'Lighthouse'], 6, { presenter: 'Ana' });
    expect(JSON.stringify(c)).not.toBe(JSON.stringify(a));
  });

  it('takes an RNG state too, and never advances the caller’s state', () => {
    const rng = makeRng(7);
    const before = { ...rng };
    const a = generateDeck(rng, 'Nostalgia', [], 6);
    expect(rng).toEqual(before);
    expect(JSON.stringify(generateDeck(rng, 'Nostalgia', [], 6))).toBe(JSON.stringify(a));
    rngFloat(rng);
    expect(JSON.stringify(generateDeck(rng, 'Nostalgia', [], 6))).not.toBe(JSON.stringify(a));
  });

  it('has exactly slideCount slides (clamped 4–10), title first and closer last', () => {
    for (const [asked, want] of [
      [6, 6],
      [4, 4],
      [10, 10],
      [1, MIN_SLIDES],
      [99, MAX_SLIDES],
      [Number.NaN, 6],
    ] as const) {
      const deck = generateDeck(5, 'Toaster', [], asked, { presenter: 'Ben' });
      expect(deck).toHaveLength(want);
      expect(deck[0]!.kind).toBe('title');
      expect(deck[deck.length - 1]!.kind).toBe('closer');
      expect(deck.slice(1, -1).every((s) => s.kind !== 'title' && s.kind !== 'closer')).toBe(true);
    }
  });

  it('the title slide carries the topic, a subtitle and the presenter', () => {
    const deck = generateDeck(11, 'Penguins', [], 6, { presenter: 'Cai' });
    const t = deck[0]!;
    if (t.kind !== 'title') throw new Error('expected a title slide');
    expect(t.title).toContain('Penguins');
    expect(t.subtitle.length).toBeGreaterThan(0);
    expect(t.presenter).toBe('Cai');
    expect(t.role.length).toBeGreaterThan(0);
  });

  it('never repeats a slide type back to back', () => {
    for (const seed of SEEDS) {
      for (const count of [4, 6, 8, 10]) {
        const kinds = generateDeck(seed, 'Taxes', [], count).map((s) => s.kind);
        for (let i = 1; i < kinds.length; i++) expect(kinds[i]).not.toBe(kinds[i - 1]);
      }
    }
  });

  it('mixes text, visuals and data (visual + data in the shortest deck)', () => {
    for (const seed of SEEDS) {
      for (const count of [5, 6, 8, 10]) {
        const groups = new Set(middle(generateDeck(seed, 'Taxes', [], count)).map((s) => KIND_GROUP[s.kind as MiddleKind]));
        expect(groups).toEqual(new Set(['text', 'visual', 'data']));
      }
      const short = new Set(middle(generateDeck(seed, 'Taxes', [], 4)).map((s) => KIND_GROUP[s.kind as MiddleKind]));
      expect(short).toEqual(new Set(['visual', 'data']));
    }
  });

  it('planKinds respects the per-type cap and the no-repeat rule on its own', () => {
    for (const seed of SEEDS) {
      const rng = makeRng(seed);
      const plan = planKinds(rng, 8);
      expect(plan).toHaveLength(8);
      for (let i = 1; i < plan.length; i++) expect(plan[i]).not.toBe(plan[i - 1]);
      const counts = new Map<string, number>();
      for (const k of plan) counts.set(k, (counts.get(k) ?? 0) + 1);
      expect(Math.max(...counts.values())).toBeLessThanOrEqual(2);
      for (const k of ["quote", "table", "bigNumber", "timeline"]) expect(counts.get(k) ?? 0).toBeLessThanOrEqual(1);
    }
  });

  it('is plain JSON data', () => {
    const deck = generateDeck(3, 'Penguins', ['Kettle'], 10, { presenter: 'Dee' });
    expect(JSON.parse(JSON.stringify(deck))).toEqual(deck);
  });
});

describe('generateDeck: coherence', () => {
  it('one deck = one theme (palette, layout, font, footer)', () => {
    for (const seed of SEEDS.slice(0, 20)) {
      const deck = generateDeck(seed, 'Penguins', [], 8);
      const theme = JSON.stringify(deck[0]!.theme);
      expect(deck.every((s) => JSON.stringify(s.theme) === theme)).toBe(true);
      expect(PALETTES.map((p) => p.id)).toContain(deck[0]!.theme.palette.id);
    }
  });

  it('weaves 2–3 motif words (preferring the extra words) through several slides', () => {
    for (const seed of SEEDS.slice(0, 30)) {
      const { slides, motifs } = buildDeck(seed, 'Penguins', ['Toaster', 'Lighthouse', 'Kettle'], 8);
      expect(motifs.length).toBeGreaterThanOrEqual(2);
      expect(motifs.length).toBeLessThanOrEqual(3);
      expect(motifs.some((m) => ['Toaster', 'Lighthouse', 'Kettle'].includes(m))).toBe(true);
      expect(motifs).not.toContain('Penguins');
      // Some motif or the topic shows up on at least three different slides.
      const mentions = slides.filter((s) =>
        texts(s).some((t) => [...motifs, 'Penguins'].some((m) => t.includes(m.slice(0, 10)))),
      ).length;
      expect(mentions).toBeGreaterThanOrEqual(3);
    }
  });

  it('works without extra words (motifs come from our own bank)', () => {
    const { motifs } = buildDeck(9, 'Penguins', [], 6);
    expect(motifs.length).toBeGreaterThanOrEqual(2);
  });

  it('ten decks feel different: titles, themes and slide mixes vary', () => {
    const decks = SEEDS.slice(0, 10).map((s) => generateDeck(s, 'Penguins', [], 6));
    expect(new Set(decks.map((d) => d[0]!.title)).size).toBeGreaterThanOrEqual(7);
    expect(new Set(decks.map((d) => `${d[0]!.theme.palette.id}/${d[0]!.theme.layout}`)).size).toBeGreaterThanOrEqual(6);
    expect(new Set(decks.map((d) => d.map((s) => s.kind).join(','))).size).toBeGreaterThanOrEqual(8);
    const allTitles = decks.flatMap((d) => d.slice(1, -1).map((s) => s.title));
    expect(new Set(allTitles).size).toBeGreaterThan(allTitles.length * 0.6);
  });

  it('never repeats a slide title inside one deck', () => {
    for (const seed of SEEDS) {
      const titles = generateDeck(seed, 'Penguins', [], 10).slice(1, -1).map((s) => s.title);
      expect(new Set(titles).size).toBe(titles.length);
    }
  });

  it('leaves no unfilled placeholders anywhere', () => {
    for (const seed of SEEDS) {
      for (const s of generateDeck(seed, 'Penguins', ['Kettle'], 10, { presenter: 'Eli' })) {
        for (const t of texts(s)) {
          expect(t).not.toMatch(/[{}]/);
          expect(t.trim().length).toBeGreaterThan(0);
        }
      }
    }
  });
});

describe('generateDeck: each slide type, uncluttered', () => {
  const all = SEEDS.flatMap((seed) => generateDeck(seed, 'An extremely long player-written topic about grandma’s sofa', ['Toaster'], 10));

  it('caps every string', () => {
    for (const s of all) {
      expect(s.title.length).toBeLessThanOrEqual(s.kind === 'title' ? LIMITS.talkTitle : LIMITS.slideTitle);
      if (s.kind === 'bullets') for (const b of s.bullets) expect(b.length).toBeLessThanOrEqual(LIMITS.bullet);
      if ((s.kind === 'chart' || s.kind === 'diagram') && s.caption) expect(s.caption.length).toBeLessThanOrEqual(LIMITS.caption);
      if (s.kind === 'image' || s.kind === 'bigNumber') expect(s.caption.length).toBeLessThanOrEqual(LIMITS.caption);
      if (s.kind === 'quote') expect(s.quote.length).toBeLessThanOrEqual(LIMITS.quote);
      if (s.kind === 'chart') for (const p of s.chart.points) expect(p.label.length).toBeLessThanOrEqual(LIMITS.label);
      if (s.kind === 'timeline') for (const p of s.points) expect(p.label.length).toBeLessThanOrEqual(LIMITS.timelineLabel);
      expect(s.theme.footer.length).toBeLessThanOrEqual(LIMITS.footer);
    }
  });

  it('bullets: 3–4 distinct short bullets', () => {
    const bullets = all.filter((s) => s.kind === 'bullets');
    expect(bullets.length).toBeGreaterThan(10);
    for (const s of bullets) {
      expect(s.bullets.length).toBeGreaterThanOrEqual(3);
      expect(s.bullets.length).toBeLessThanOrEqual(4);
      expect(new Set(s.bullets).size).toBe(s.bullets.length);
    }
  });

  it('charts: all four types, 3–6 labelled points, pies add up to 100%', () => {
    const charts = all.filter((s) => s.kind === 'chart');
    expect(new Set(charts.map((c) => c.chart.type))).toEqual(new Set(['bar', 'line', 'pie', 'donut']));
    for (const { chart } of charts) {
      expect(chart.points.length).toBeGreaterThanOrEqual(3);
      expect(chart.points.length).toBeLessThanOrEqual(6);
      expect(new Set(chart.points.map((p) => p.label)).size).toBe(chart.points.length);
      for (const p of chart.points) {
        expect(Number.isFinite(p.value)).toBe(true);
        expect(p.value).toBeGreaterThan(0);
      }
      if (chart.type === 'pie' || chart.type === 'donut') {
        expect(chart.points.reduce((a, p) => a + p.value, 0)).toBe(100);
        expect(chart.axis).toBeNull();
      } else {
        expect(chart.axis).toBeTruthy();
      }
    }
  });

  it('charts trend gently (no wild jumps between neighbours)', () => {
    for (const s of all) {
      if (s.kind !== 'chart' || s.chart.type !== 'line') continue;
      const v = s.chart.points.map((p) => p.value);
      for (let i = 1; i < v.length; i++) expect(Math.abs(v[i]! - v[i - 1]!)).toBeLessThanOrEqual(30);
    }
  });

  it('tables: 3–4 rows × 2–4 columns mixing words, numbers, ✓/✗ and stars', () => {
    const tables = all.filter((s) => s.kind === 'table');
    expect(tables.length).toBeGreaterThan(5);
    const seenKinds = new Set<string>();
    for (const t of tables) {
      expect(t.rows.length).toBeGreaterThanOrEqual(3);
      expect(t.rows.length).toBeLessThanOrEqual(4);
      expect(t.columns.length).toBeGreaterThanOrEqual(2);
      expect(t.columns.length).toBeLessThanOrEqual(4);
      for (const r of t.rows) {
        expect(r).toHaveLength(t.columns.length);
        expect(r[0]!.t).toBe('text');
      }
      const kinds = new Set(t.rows.flatMap((r) => r.slice(1).map((c) => c.t)));
      expect(kinds.has('check') || kinds.has('stars')).toBe(true);
      expect(kinds.size).toBeGreaterThanOrEqual(2);
      for (const r of t.rows) for (const c of r) {
        seenKinds.add(c.t);
        if (c.t === 'stars') expect(c.v >= 1 && c.v <= 5).toBe(true);
      }
    }
    expect(seenKinds).toEqual(new Set(['text', 'num', 'check', 'stars']));
  });

  it('images: a scene + seed + caption; two images in a deck are different scenes', () => {
    for (const seed of SEEDS) {
      const images = generateDeck(seed, 'Penguins', [], 10).filter((s) => s.kind === 'image');
      if (images.length === 2) expect(images[0]!.scene).not.toBe(images[1]!.scene);
      for (const im of images) {
        expect(Number.isInteger(im.seed)).toBe(true);
        expect(im.caption.length).toBeGreaterThan(0);
      }
    }
  });

  it('diagrams: venn 2–3, cycle 3–5, pyramid 3–4, matrix 2×2, flow 3–4', () => {
    const diagrams = all.filter((s) => s.kind === 'diagram').map((s) => s.diagram);
    expect(new Set(diagrams.map((d) => d.type))).toEqual(new Set(['venn', 'cycle', 'pyramid', 'matrix', 'flow']));
    for (const d of diagrams) {
      if (d.type === 'venn') {
        expect(d.sets.length).toBeGreaterThanOrEqual(2);
        expect(d.sets.length).toBeLessThanOrEqual(3);
      } else if (d.type === 'cycle') {
        expect(d.steps.length).toBeGreaterThanOrEqual(3);
        expect(d.steps.length).toBeLessThanOrEqual(5);
      } else if (d.type === 'pyramid') {
        expect(d.levels.length).toBeGreaterThanOrEqual(3);
        expect(d.levels.length).toBeLessThanOrEqual(4);
      } else if (d.type === 'matrix') {
        expect(d.quadrants).toHaveLength(4);
        expect(d.dots.length).toBeGreaterThanOrEqual(1);
        for (const p of d.dots) {
          expect(p.x).toBeGreaterThanOrEqual(0);
          expect(p.x).toBeLessThanOrEqual(1);
          expect(p.y).toBeGreaterThanOrEqual(0);
          expect(p.y).toBeLessThanOrEqual(1);
        }
      } else {
        expect(d.steps.length).toBeGreaterThanOrEqual(3);
        expect(d.steps.length).toBeLessThanOrEqual(4);
      }
    }
  });

  it('big numbers, quotes and timelines', () => {
    const bigs = all.filter((s) => s.kind === 'bigNumber');
    expect(bigs.length).toBeGreaterThan(5);
    for (const b of bigs) {
      expect(b.value.length).toBeLessThanOrEqual(8);
      expect(b.caption.length).toBeGreaterThan(0);
    }
    const quotes = all.filter((s) => s.kind === 'quote');
    expect(quotes.length).toBeGreaterThan(5);
    for (const q of quotes) expect(q.author.length).toBeGreaterThan(0);
    const timelines = all.filter((s) => s.kind === 'timeline');
    expect(timelines.length).toBeGreaterThan(5);
    for (const t of timelines) {
      expect(t.points.length).toBeGreaterThanOrEqual(3);
      expect(t.points.length).toBeLessThanOrEqual(5);
    }
  });
});

describe('helpers', () => {
  it('clip shortens at a word boundary with an ellipsis', () => {
    expect(clip('short', 10)).toBe('short');
    const c = clip('The quick brown fox jumps over the lazy dog', 20);
    expect(c.length).toBeLessThanOrEqual(20);
    expect(c.endsWith('…')).toBe(true);
    expect(clip('Supercalifragilistic', 8)).toHaveLength(8);
  });

  it('generateQuestions: distinct, filled, deterministic', () => {
    const q = generateQuestions(1, 'Penguins', ['Kettle', 'Fog'], 2);
    expect(q).toHaveLength(2);
    expect(new Set(q).size).toBe(2);
    for (const x of q) expect(x).not.toMatch(/[{}]/);
    expect(generateQuestions(1, 'Penguins', ['Kettle', 'Fog'], 2)).toEqual(q);
  });
});
