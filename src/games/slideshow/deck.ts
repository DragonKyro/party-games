import { cloneRng, makeRng, rngFloat, rngInt, rngShuffle, type RngState } from '@/engine/rng';
import { WORD_PACKS } from '@/words';
import { entryKey } from '@/words/source';
import * as C from './content';
import { DEFAULT_SLIDES, MAX_SLIDES, MIN_SLIDES, clampSlideCount } from './rules';

export { DEFAULT_SLIDES, MAX_SLIDES, MIN_SLIDES, clampSlideCount };

// ============================================================================
// Slideshow Karaoke — the deck generator
//
// Pure data: `generateDeck(seed | rngState, topic, extraWords, slideCount)`
// returns the slides of one improvised talk, deterministically. No React,
// no DOM — `ui/Slide.tsx` renders a `SlideSpec`, and procedural pictures are
// described by a scene name + a seed the renderer expands.
//
// Shape of a deck:
//   title slide  →  (slideCount − 2) middle slides  →  closer
//
// Coherence: one theme (palette + layout + type face) per deck; 2–3 motif
// words recur through titles, bullets, labels and captions; the same slide
// type never appears twice in a row; every deck mixes text, visuals and
// data. Uncluttered: one main element per slide, short capped strings.
// ============================================================================

// ---- types ----------------------------------------------------------------

export type SlideKind =
  | 'title'
  | 'bullets'
  | 'chart'
  | 'table'
  | 'image'
  | 'diagram'
  | 'bigNumber'
  | 'quote'
  | 'timeline'
  | 'closer';

export type MiddleKind = Exclude<SlideKind, 'title' | 'closer'>;
export type KindGroup = 'text' | 'visual' | 'data';

export const MIDDLE_KINDS: readonly MiddleKind[] = [
  'bullets',
  'chart',
  'table',
  'image',
  'diagram',
  'bigNumber',
  'quote',
  'timeline',
];

export const KIND_GROUP: Record<MiddleKind, KindGroup> = {
  bullets: 'text',
  quote: 'text',
  image: 'visual',
  diagram: 'visual',
  timeline: 'visual',
  chart: 'data',
  table: 'data',
  bigNumber: 'data',
};

export interface Palette {
  id: string;
  /** Slide background. */
  bg: string;
  /** A quieter panel colour (table stripes, chart tracks, bands). */
  surface: string;
  ink: string;
  muted: string;
  /** Categorical accents, fixed order (validated for CVD separation). */
  accents: readonly [string, string, string, string];
  dark: boolean;
}

export type LayoutStyle = 'classic' | 'band' | 'side' | 'minimal' | 'bold';
export type FontStyle = 'rounded' | 'clean' | 'serif';

export interface DeckTheme {
  palette: Palette;
  layout: LayoutStyle;
  font: FontStyle;
  /** Small running footer ("Penguins · Confidential"). */
  footer: string;
}

export type ChartType = 'bar' | 'line' | 'pie' | 'donut';
export interface ChartSpec {
  type: ChartType;
  points: Array<{ label: string; value: number }>;
  /** Value-axis title (bar / line only). */
  axis: string | null;
  /** Appended to values: '', '%', 'k'. */
  unit: string;
}

export type TableCell =
  | { t: 'text'; v: string }
  | { t: 'num'; v: string }
  | { t: 'check'; v: boolean }
  | { t: 'stars'; v: number };

export type SceneKind =
  | 'landscape'
  | 'city'
  | 'abstract'
  | 'meeting'
  | 'presenter'
  | 'map'
  | 'product'
  | 'rocket'
  | 'lightbulb'
  | 'forest'
  | 'ocean';

export const SCENES: readonly SceneKind[] = [
  'landscape',
  'city',
  'abstract',
  'meeting',
  'presenter',
  'map',
  'product',
  'rocket',
  'lightbulb',
  'forest',
  'ocean',
];

export type DiagramType = 'venn' | 'cycle' | 'pyramid' | 'matrix' | 'flow';
export type DiagramSpec =
  | { type: 'venn'; sets: string[]; center: string }
  | { type: 'cycle'; steps: string[] }
  /** Top level first. */
  | { type: 'pyramid'; levels: string[] }
  | {
      type: 'matrix';
      x: string;
      y: string;
      /** Top-left, top-right, bottom-left, bottom-right. */
      quadrants: [string, string, string, string];
      /** Positions in 0..1 (y up). */
      dots: Array<{ label: string; x: number; y: number }>;
    }
  | { type: 'flow'; steps: string[] };

interface SlideBase {
  theme: DeckTheme;
  title: string;
}

export interface TitleSlide extends SlideBase {
  kind: 'title';
  subtitle: string;
  presenter: string;
  role: string;
}
export interface BulletsSlide extends SlideBase {
  kind: 'bullets';
  bullets: string[];
}
export interface ChartSlide extends SlideBase {
  kind: 'chart';
  chart: ChartSpec;
  caption: string | null;
}
export interface TableSlide extends SlideBase {
  kind: 'table';
  /** Header row; columns[0] heads the row labels. */
  columns: string[];
  /** rows[i][0] is the row label (text). */
  rows: TableCell[][];
}
export interface ImageSlide extends SlideBase {
  kind: 'image';
  scene: SceneKind;
  /** Expanded by the renderer into the picture's details. */
  seed: number;
  caption: string;
}
export interface DiagramSlide extends SlideBase {
  kind: 'diagram';
  diagram: DiagramSpec;
  caption: string | null;
}
export interface BigNumberSlide extends SlideBase {
  kind: 'bigNumber';
  value: string;
  caption: string;
}
export interface QuoteSlide extends SlideBase {
  kind: 'quote';
  quote: string;
  author: string;
  role: string | null;
}
export interface TimelineSlide extends SlideBase {
  kind: 'timeline';
  points: Array<{ when: string; label: string }>;
}
export interface CloserSlide extends SlideBase {
  kind: 'closer';
  subtitle: string;
}

export type SlideSpec =
  | TitleSlide
  | BulletsSlide
  | ChartSlide
  | TableSlide
  | ImageSlide
  | DiagramSlide
  | BigNumberSlide
  | QuoteSlide
  | TimelineSlide
  | CloserSlide;

// ---- limits ---------------------------------------------------------------

/** Text caps (characters). Everything the generator writes is clipped to these. */
export const LIMITS = {
  talkTitle: 64,
  slideTitle: 44,
  subtitle: 60,
  presenter: 32,
  role: 40,
  bullet: 56,
  label: 16,
  diagramLabel: 18,
  timelineLabel: 26,
  axis: 28,
  caption: 72,
  quote: 120,
  author: 48,
  footer: 40,
} as const;

/** Per-deck caps: the visual / data staples may appear twice, the punchlines once. */
const MAX_PER_KIND: Record<MiddleKind, number> = {
  bullets: 2,
  chart: 2,
  image: 2,
  diagram: 2,
  table: 1,
  bigNumber: 1,
  quote: 1,
  timeline: 1,
};

const KIND_WEIGHTS: Record<MiddleKind, number> = {
  bullets: 3,
  chart: 3,
  image: 3,
  diagram: 3,
  table: 2,
  bigNumber: 2,
  quote: 2,
  timeline: 2,
};

// ---- palettes (validated: lightness band, chroma, CVD-adjacent separation) --

export const PALETTES: readonly Palette[] = [
  { id: 'midnight', bg: '#16213e', surface: '#1f2b4d', ink: '#f4f1ff', muted: '#a3adcf', accents: ['#cc7f0e', '#1aa892', '#6f82f0', '#e5566a'], dark: true },
  { id: 'paper', bg: '#fbf6ec', surface: '#f0e8d8', ink: '#2b2622', muted: '#776b5e', accents: ['#c8553d', '#127fb0', '#d99a1e', '#7a4fb0'], dark: false },
  { id: 'mint', bg: '#eef8f3', surface: '#dcefe6', ink: '#12372a', muted: '#587466', accents: ['#1f9d8a', '#e0683f', '#3b5ba9', '#d9a21b'], dark: false },
  { id: 'grape', bg: '#241638', surface: '#31204a', ink: '#fbf5ff', muted: '#bba9d6', accents: ['#e83e8c', '#1f93bd', '#b8860f', '#8a6bf0'], dark: true },
  { id: 'sunset', bg: '#fff3ea', surface: '#fde3d2', ink: '#3b1f22', muted: '#8a5e57', accents: ['#e8613c', '#6d4ab3', '#d9a400', '#2f9e8f'], dark: false },
  { id: 'corporate', bg: '#ffffff', surface: '#eef2f7', ink: '#1b2a41', muted: '#66758c', accents: ['#1f6fd1', '#1aa486', '#e8743b', '#c0479a'], dark: false },
  { id: 'forest', bg: '#1d2b23', surface: '#27392e', ink: '#f2f5ea', muted: '#a9bba9', accents: ['#6f9e33', '#3a9fc0', '#c4861d', '#c95a86'], dark: true },
  { id: 'retro', bg: '#f3ead6', surface: '#e8dcc0', ink: '#2e2a24', muted: '#786d5d', accents: ['#d0603a', '#2f6aa3', '#4f9a5f', '#c98a1c'], dark: false },
  { id: 'ocean', bg: '#eaf5fb', surface: '#d6eaf5', ink: '#0b2e40', muted: '#557487', accents: ['#17a398', '#0a74b8', '#f28c28', '#e05d8a'], dark: false },
];

export const LAYOUTS: readonly LayoutStyle[] = ['classic', 'band', 'side', 'minimal', 'bold'];
export const FONTS: readonly FontStyle[] = ['rounded', 'clean', 'serif'];

const CHART_TYPES: readonly ChartType[] = ['bar', 'line', 'pie', 'donut'];
const DIAGRAM_TYPES: readonly DiagramType[] = ['venn', 'cycle', 'pyramid', 'matrix', 'flow'];

// ---- small helpers ----------------------------------------------------------

function pick<T>(rng: RngState, arr: readonly T[]): T {
  return arr[rngInt(rng, arr.length)]!;
}

/** `n` distinct items (fewer if the array is shorter). */
function pickN<T>(rng: RngState, arr: readonly T[], n: number): T[] {
  return rngShuffle(rng, arr).slice(0, Math.max(0, n));
}

function chance(rng: RngState, p: number): boolean {
  return rngFloat(rng) < p;
}

function weighted<T extends string>(rng: RngState, items: readonly T[], weight: (t: T) => number): T {
  const total = items.reduce((s, t) => s + weight(t), 0);
  let r = rngFloat(rng) * total;
  for (const t of items) {
    r -= weight(t);
    if (r < 0) return t;
  }
  return items[items.length - 1]!;
}

/** Shorten to `max` characters at a word boundary, with an ellipsis. */
export function clip(text: string, max: number): string {
  const s = text.replace(/\s+/g, ' ').trim();
  if (s.length <= max) return s;
  let cut = s.slice(0, Math.max(1, max - 1));
  const space = cut.lastIndexOf(' ');
  if (space > max * 0.5) cut = cut.slice(0, space);
  return `${cut.replace(/[\s,.;:–—-]+$/u, '')}…`;
}

function cap(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/** 12345 → "12,345" (no locale dependence). */
function commas(n: number): string {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// ---- the writer: fills templates with the deck's vocabulary ----------------

interface Writer {
  rng: RngState;
  topic: string;
  motifs: string[];
  buzz: string[];
  verbs: string[];
  /** Round-robin through the motifs so each one recurs. */
  cursor: number;
  slideCount: number;
  usedTitles: Set<string>;
}

type Size = 'long' | 'short' | 'tiny';

function fill(w: Writer, template: string, size: Size, topicMax?: number): string {
  const topic = clip(w.topic, topicMax ?? (size === 'long' ? 40 : size === 'short' ? 24 : 14));
  const motifLen = size === 'tiny' ? 14 : 20;
  let m1: string | null = null;
  let m2: string | null = null;
  const motif = (): string => {
    if (m1 === null) m1 = clip(w.motifs[w.cursor++ % w.motifs.length] ?? 'Synergy', motifLen);
    return m1;
  };
  const motif2 = (): string => {
    const first = motif();
    if (m2 === null) {
      const other = w.motifs.find((m) => clip(m, motifLen) !== first) ?? 'Everything else';
      m2 = clip(other, motifLen);
    }
    return m2;
  };
  return template.replace(/\{(T|M2|M|b|B|v|V|n)\}/g, (_, k: string) => {
    switch (k) {
      case 'T':
        return topic;
      case 'M':
        return motif();
      case 'M2':
        return motif2();
      case 'b':
        return pick(w.rng, w.buzz);
      case 'B':
        return cap(pick(w.rng, w.buzz));
      case 'v':
        return pick(w.rng, w.verbs);
      case 'V':
        return cap(pick(w.rng, w.verbs));
      default:
        return String(w.slideCount);
    }
  });
}

function write(w: Writer, template: string, size: Size, max: number, topicMax?: number): string {
  return clip(cap(fill(w, template, size, topicMax)).replace(/…,/g, '…'), max);
}

/** Rough rendered length of a template once filled (a motif ≈ 17 chars, a buzzword / verb ≈ 10). */
function estimate(template: string, topicLen: number): number {
  let n = template.length;
  n += (template.match(/\{T\}/g)?.length ?? 0) * (topicLen - 3);
  n += (template.match(/\{M2?\}/g)?.length ?? 0) * 14;
  n += (template.match(/\{[bBvV]\}/g)?.length ?? 0) * 7;
  return n;
}

/**
 * A template that reads whole at `max` characters: prefer ones that fit with
 * the topic as is; otherwise take a short one and clip only the topic.
 */
function fitted(w: Writer, bank: readonly string[], size: Size, max: number, avoid?: Set<string>): string {
  const topicLen = Math.min(w.topic.length, size === 'long' ? 40 : 24);
  const pool = avoid ? bank.filter((t) => !avoid.has(t)) : bank;
  const usable = pool.length > 0 ? pool : bank;
  const fits = usable.filter((t) => estimate(t, topicLen) <= max);
  if (fits.length > 0) {
    const t = pick(w.rng, fits);
    avoid?.add(t);
    return write(w, t, size, max, topicLen);
  }
  const shortest = usable.slice().sort((a, b) => estimate(a, 3) - estimate(b, 3)).slice(0, 6);
  const t = pick(w.rng, shortest);
  avoid?.add(t);
  return write(w, t, size, max, Math.max(8, max - estimate(t, 3)));
}

/** A slide title from `bank`, avoiding templates already used in this deck. */
function slideTitle(w: Writer, bank: readonly string[]): string {
  return fitted(w, bank, 'short', LIMITS.slideTitle, w.usedTitles);
}

/** Distinct (by entryKey) strings, in order. */
function distinct(items: string[]): string[] {
  const seen = new Set<string>();
  return items.filter((s) => {
    const k = entryKey(s);
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Labels for categories: 1–2 motifs, maybe the topic, then generic categories. */
function categoryLabels(w: Writer, n: number, extras: readonly string[]): string[] {
  const { rng } = w;
  const motifs = pickN(rng, w.motifs, Math.min(w.motifs.length, 1 + rngInt(rng, 2)));
  const own = [...motifs, ...(chance(rng, 0.4) ? [w.topic] : [])].map((s) => cap(clip(s, LIMITS.label)));
  const filler = rngShuffle(rng, extras).map((s) => clip(s, LIMITS.label));
  return rngShuffle(rng, distinct([...own, ...filler]).slice(0, n));
}

// ---- deck plan: which slide types, in which order --------------------------

/** Middle slide types: a text, visual and data slide at least, no type twice in a row. */
export function planKinds(rng: RngState, middle: number): MiddleKind[] {
  const picks: MiddleKind[] = [];
  const count = (k: MiddleKind) => picks.filter((p) => p === k).length;
  // Short decks (2 middle slides) bookend with text slides, so lead with visual + data.
  const groups: KindGroup[] = middle >= 3 ? ['text', 'visual', 'data'] : ['visual', 'data'];
  for (const g of groups.slice(0, middle)) {
    picks.push(weighted(rng, MIDDLE_KINDS.filter((k) => KIND_GROUP[k] === g), (k) => KIND_WEIGHTS[k]));
  }
  while (picks.length < middle) {
    picks.push(weighted(rng, MIDDLE_KINDS.filter((k) => count(k) < MAX_PER_KIND[k]), (k) => KIND_WEIGHTS[k]));
  }
  for (let attempt = 0; attempt < 40; attempt++) {
    const order = rngShuffle(rng, picks);
    if (order.every((k, i) => i === 0 || k !== order[i - 1])) return order;
  }
  // Fallback: most-remaining first, never repeating the previous type.
  const left = new Map<MiddleKind, number>();
  for (const k of picks) left.set(k, (left.get(k) ?? 0) + 1);
  const out: MiddleKind[] = [];
  while (out.length < picks.length) {
    const prev = out[out.length - 1];
    const next = [...left.entries()]
      .filter(([k, c]) => c > 0 && k !== prev)
      .sort((a, b) => b[1] - a[1])[0];
    const k = next ? next[0] : [...left.entries()].find(([, c]) => c > 0)![0];
    out.push(k);
    left.set(k, left.get(k)! - 1);
  }
  return out;
}

// ---- slide builders ------------------------------------------------------------

function gentleTrend(rng: RngState, n: number, max: number): number[] {
  const up = chance(rng, 0.75);
  const start = up ? 12 + rngInt(rng, 28) : 55 + rngInt(rng, 35);
  const slope = (3 + rngFloat(rng) * 9) * (up ? 1 : -1);
  return Array.from({ length: n }, (_, i) =>
    Math.max(2, Math.min(max, Math.round(start + slope * i + (rngFloat(rng) - 0.5) * 14))),
  );
}

/** `n` integer percentages summing to exactly 100, largest first. */
function shares(rng: RngState, n: number): number[] {
  const weights = Array.from({ length: n }, () => 0.45 + rngFloat(rng));
  const total = weights.reduce((a, b) => a + b, 0);
  const raw = weights.map((x) => (x / total) * 100);
  const floor = raw.map(Math.floor);
  let left = 100 - floor.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => ({ i, rem: r - Math.floor(r) })).sort((a, b) => b.rem - a.rem);
  for (const { i } of order) {
    if (left <= 0) break;
    floor[i]! += 1;
    left -= 1;
  }
  return floor.sort((a, b) => b - a);
}

function chartSlide(w: Writer, theme: DeckTheme, used: Set<string>): ChartSlide {
  const { rng } = w;
  const fresh = CHART_TYPES.filter((t) => !used.has(t));
  const type = pick(rng, fresh.length > 0 ? fresh : CHART_TYPES);
  used.add(type);
  let points: ChartSpec['points'];
  let unit = '';
  let axis: string | null = null;
  if (type === 'pie' || type === 'donut') {
    const n = 3 + rngInt(rng, 2);
    const labels = categoryLabels(w, n, C.CHART_CATEGORIES);
    const values = shares(rng, labels.length);
    points = labels.map((label, i) => ({ label, value: values[i]! }));
    unit = '%';
  } else {
    axis = write(w, pick(rng, C.AXIS_TITLES), 'tiny', LIMITS.axis);
    // An axis that names its own unit ("Synergy (kJ)") gets bare numbers.
    unit = axis.includes('(') ? '' : pick(rng, ['', '%', 'k']);
    if (type === 'line') {
      const n = 4 + rngInt(rng, 3);
      let labels: string[];
      if (chance(rng, 0.35)) {
        const start = 2016 + rngInt(rng, 6);
        labels = Array.from({ length: n }, (_, i) => String(start + i));
      } else {
        const series = pick(rng, C.TIME_SERIES.filter((s) => s.length >= n));
        const at = rngInt(rng, series.length - n + 1);
        labels = series.slice(at, at + n);
      }
      const values = gentleTrend(rng, labels.length, unit === '%' ? 99 : 140);
      points = labels.map((label, i) => ({ label, value: values[i]! }));
    } else {
      // Bars: 3–5 so category labels stay legible.
      const n = 3 + rngInt(rng, 3);
      const labels = categoryLabels(w, n, C.CHART_CATEGORIES);
      const values = gentleTrend(rng, labels.length, unit === '%' ? 99 : 140);
      points = labels.map((label, i) => ({ label, value: values[i]! }));
    }
  }
  return {
    kind: 'chart',
    theme,
    title: slideTitle(w, type === 'pie' || type === 'donut' ? C.SLIDE_TITLES.pie : C.SLIDE_TITLES.chart),
    chart: { type, points, axis, unit },
    caption: chance(rng, 0.6) ? write(w, pick(rng, C.CHART_CAPTIONS), 'short', LIMITS.caption) : null,
  };
}

function numberCell(rng: RngState, kind: (typeof C.TABLE_NUMBER_COLUMNS)[number]['kind']): string {
  switch (kind) {
    case 'money':
      return chance(rng, 0.7) ? `$${5 + rngInt(rng, 95)}k` : `$${(1 + rngFloat(rng) * 8).toFixed(1)}M`;
    case 'pct': {
      const v = rngInt(rng, 220) - 40;
      return v < 0 ? `−${-v}%` : `+${v}%`;
    }
    case 'times':
      return `${(1 + rngFloat(rng) * 9).toFixed(1)}×`;
    case 'weeks':
      return `${1 + rngInt(rng, 52)} wks`;
    case 'kg':
      return `${1 + rngInt(rng, 480)} kg`;
    default:
      return `${rngInt(rng, 11)}/10`;
  }
}

type ColumnKind = 'check' | 'stars' | 'num' | 'word';

function tableSlide(w: Writer, theme: DeckTheme): TableSlide {
  const { rng } = w;
  const rowCount = 3 + rngInt(rng, 2);
  const dataCols = 2 + rngInt(rng, 2);
  let kinds = pickN<ColumnKind>(rng, ['check', 'stars', 'num', 'word'], dataCols);
  if (!kinds.includes('check') && !kinds.includes('stars')) kinds[kinds.length - 1] = chance(rng, 0.5) ? 'check' : 'stars';
  kinds = [...new Set(kinds)];

  const labels = categoryLabels(w, rowCount, C.TABLE_ROW_EXTRAS);
  const columns = [pick(rng, C.TABLE_CORNERS)];
  const cols: TableCell[][] = [];
  for (const kind of kinds) {
    if (kind === 'check') {
      columns.push(pick(rng, C.TABLE_CHECK_HEADERS));
      const v = labels.map(() => chance(rng, 0.6));
      if (v.every((x) => x === v[0])) v[rngInt(rng, v.length)] = !v[0];
      cols.push(v.map((x) => ({ t: 'check', v: x })));
    } else if (kind === 'stars') {
      columns.push(pick(rng, C.TABLE_STAR_HEADERS));
      cols.push(labels.map(() => ({ t: 'stars', v: 1 + rngInt(rng, 5) })));
    } else if (kind === 'num') {
      const col = pick(rng, C.TABLE_NUMBER_COLUMNS);
      columns.push(col.header);
      cols.push(labels.map(() => ({ t: 'num', v: numberCell(rng, col.kind) })));
    } else {
      const col = pick(rng, C.TABLE_WORD_COLUMNS);
      columns.push(col.header);
      const words = rngShuffle(rng, col.words);
      cols.push(labels.map((_, i) => ({ t: 'text', v: words[i % words.length]! })));
    }
  }
  const rows: TableCell[][] = labels.map((label, r) => [{ t: 'text', v: label }, ...cols.map((c) => c[r]!)]);
  return { kind: 'table', theme, title: slideTitle(w, C.SLIDE_TITLES.table), columns, rows };
}

function imageSlide(w: Writer, theme: DeckTheme, used: Set<string>): ImageSlide {
  const { rng } = w;
  const fresh = SCENES.filter((s) => !used.has(s));
  const scene = pick(rng, fresh.length > 0 ? fresh : SCENES);
  used.add(scene);
  const own = C.SCENE_CAPTIONS[scene] ?? [];
  const caption = chance(rng, 0.65) && own.length > 0 ? pick(rng, own) : pick(rng, C.IMAGE_CAPTIONS);
  return {
    kind: 'image',
    theme,
    title: slideTitle(w, C.SLIDE_TITLES.image),
    scene,
    seed: rngInt(rng, 1_000_000_000),
    caption: write(w, caption, 'short', LIMITS.caption),
  };
}

function diagramSlide(w: Writer, theme: DeckTheme, used: Set<string>): DiagramSlide {
  const { rng } = w;
  const fresh = DIAGRAM_TYPES.filter((t) => !used.has(t));
  const type = pick(rng, fresh.length > 0 ? fresh : DIAGRAM_TYPES);
  used.add(type);
  const label = (t: string) => write(w, t, 'tiny', LIMITS.diagramLabel);
  const labels = (bank: readonly string[], n: number) => distinct(pickN(rng, bank, n + 2).map(label)).slice(0, n);
  let diagram: DiagramSpec;
  switch (type) {
    case 'venn': {
      const n = 2 + rngInt(rng, 2);
      const pool = distinct([...w.motifs, ...w.buzz.map(cap), w.topic].map((s) => cap(clip(s, LIMITS.label))));
      const sets = pickN(rng, pool, n);
      diagram = { type, sets, center: label(pick(rng, C.VENN_CENTERS)) };
      break;
    }
    case 'cycle':
      diagram = { type, steps: labels(C.CYCLE_STEPS, 3 + rngInt(rng, 3)) };
      break;
    case 'pyramid': {
      const n = 3 + rngInt(rng, 2);
      const levels = distinct([
        label(pick(rng, C.PYRAMID_TOP)),
        ...pickN(rng, C.PYRAMID_MIDDLE, n - 2).map(label),
        label(pick(rng, C.PYRAMID_BASE)),
      ]);
      diagram = { type, levels };
      break;
    }
    case 'matrix': {
      const m = pick(rng, C.MATRICES);
      const names = distinct([w.topic, ...pickN(rng, w.motifs, 1 + rngInt(rng, 2))].map((s) => cap(clip(s, LIMITS.label))));
      const quads = rngShuffle(rng, [0, 1, 2, 3]);
      const dots = names.map((name, i) => {
        const q = quads[i]!;
        const x = (q % 2 === 0 ? 0.12 : 0.6) + rngFloat(rng) * 0.28;
        const y = (q < 2 ? 0.6 : 0.12) + rngFloat(rng) * 0.28;
        return { label: name, x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 };
      });
      diagram = { type, x: m.x, y: m.y, quadrants: [...m.q], dots };
      break;
    }
    default: {
      const n = 3 + rngInt(rng, 2);
      const steps = distinct([
        label(pick(rng, C.FLOW_STARTS)),
        ...pickN(rng, C.FLOW_MIDDLES, n - 2).map(label),
        label(pick(rng, C.FLOW_ENDS)),
      ]);
      diagram = { type: 'flow', steps };
    }
  }
  return {
    kind: 'diagram',
    theme,
    title: slideTitle(w, C.SLIDE_TITLES.diagram),
    diagram,
    caption: chance(rng, 0.3) ? write(w, pick(rng, C.DIAGRAM_CAPTIONS), 'short', LIMITS.caption) : null,
  };
}

function bigNumberSlide(w: Writer, theme: DeckTheme): BigNumberSlide {
  const { rng } = w;
  const kind = pick<C.BigNumberKind>(rng, ['pct', 'pct', 'times', 'money', 'count', 'ratio', 'zero']);
  let value: string;
  switch (kind) {
    case 'pct':
      value = `${10 + rngInt(rng, 89)}%`;
      break;
    case 'times':
      value = `${(1.5 + rngFloat(rng) * 8).toFixed(1)}×`;
      break;
    case 'money':
      value = chance(rng, 0.5) ? `$${1 + rngInt(rng, 99)}k` : `$${(1 + rngFloat(rng) * 9).toFixed(1)}M`;
      break;
    case 'count':
      value = commas(1000 + rngInt(rng, 90_000));
      break;
    case 'ratio':
      value = `1 in ${2 + rngInt(rng, 9)}`;
      break;
    default:
      value = '0';
  }
  return {
    kind: 'bigNumber',
    theme,
    title: slideTitle(w, C.SLIDE_TITLES.bigNumber),
    value,
    caption: clip(fill(w, pick(rng, C.BIG_NUMBER_CAPTIONS[kind]), 'short'), LIMITS.caption),
  };
}

function quoteSlide(w: Writer, theme: DeckTheme): QuoteSlide {
  const { rng } = w;
  const quote = write(w, pick(rng, C.QUOTES), 'short', LIMITS.quote);
  const r = rngFloat(rng);
  let author: string;
  let role: string | null = null;
  if (r < 0.45) {
    author = `${pick(rng, WORD_PACKS.characters.words)} ${pick(rng, C.FAMOUS_SUFFIXES)}`;
  } else if (r < 0.85) {
    author = `${pick(rng, C.EXPERT_FIRST)} ${pick(rng, C.EXPERT_LAST)}`;
    role = clip(fill(w, pick(rng, C.EXPERT_TITLES), 'short'), LIMITS.author);
  } else {
    author = pick(rng, C.EVERYDAY_SOURCES);
  }
  return { kind: 'quote', theme, title: slideTitle(w, C.SLIDE_TITLES.quote), quote, author: clip(author, LIMITS.author), role };
}

function timelineSlide(w: Writer, theme: DeckTheme): TimelineSlide {
  const { rng } = w;
  const n = 3 + rngInt(rng, 3);
  let whens: string[];
  const style = rngInt(rng, 3);
  if (style === 0) {
    const start = 2012 + rngInt(rng, 10);
    const step = 1 + rngInt(rng, 3);
    whens = Array.from({ length: n }, (_, i) => String(start + i * step));
    if (chance(rng, 0.3)) whens[n - 1] = 'Someday';
  } else {
    const bank = style === 1 ? C.TIMELINE_STAGES : C.TIMELINE_VAGUE;
    const idx = pickN(rng, bank.map((_, i) => i), Math.min(n, bank.length)).sort((a, b) => a - b);
    whens = idx.map((i) => bank[i]!);
  }
  const label = (t: string) => write(w, t, 'tiny', LIMITS.timelineLabel);
  const labels = distinct([
    label(pick(rng, C.TIMELINE_FIRST)),
    ...pickN(rng, C.TIMELINE_MIDDLE, whens.length).map(label),
  ]).slice(0, whens.length - 1);
  labels.push(label(pick(rng, C.TIMELINE_LAST)));
  const points = whens.slice(0, labels.length).map((when, i) => ({ when, label: labels[i]! }));
  return { kind: 'timeline', theme, title: slideTitle(w, C.SLIDE_TITLES.timeline), points };
}

function bulletsSlide(w: Writer, theme: DeckTheme): BulletsSlide {
  const { rng } = w;
  const n = 3 + rngInt(rng, 2);
  const bullets = distinct(pickN(rng, C.BULLETS, n + 2).map((t) => write(w, t, 'short', LIMITS.bullet))).slice(0, n);
  return { kind: 'bullets', theme, title: slideTitle(w, C.SLIDE_TITLES.bullets), bullets };
}

// ---- the deck -------------------------------------------------------------------

export interface DeckOptions {
  /** Shown on the title slide. */
  presenter?: string;
}

export interface GeneratedDeck {
  slides: SlideSpec[];
  /** The recurring words this deck was written around. */
  motifs: string[];
}

function toRng(src: number | RngState): RngState {
  return typeof src === 'number' ? makeRng(src) : cloneRng(src);
}

/** 2–3 motifs: up to n−1 from the extra words (so ours flavour every deck), the rest from our bank. */
function pickMotifs(rng: RngState, topic: string, extraWords: readonly string[]): string[] {
  const n = 2 + rngInt(rng, 2);
  const topicKey = entryKey(topic);
  const extras = distinct(extraWords.map((x) => String(x ?? '').trim()).filter((x) => x && entryKey(x) !== topicKey));
  const fromExtra = pickN(rng, extras, Math.min(extras.length, n - 1));
  const ours = rngShuffle(rng, C.MOTIFS).filter((m) => entryKey(m) !== topicKey);
  return distinct([...fromExtra, ...ours]).slice(0, n);
}

/** The deck plus the motifs it used (the module reuses them for Q&A). */
export function buildDeck(
  src: number | RngState,
  topic: string,
  extraWords: readonly string[],
  slideCount: number,
  opts: DeckOptions = {},
): GeneratedDeck {
  const rng = toRng(src);
  const count = clampSlideCount(slideCount);
  const cleanTopic = clip(String(topic ?? '').trim() || 'Everything', 60);
  const motifs = pickMotifs(rng, cleanTopic, extraWords);
  const w: Writer = {
    rng,
    topic: cleanTopic,
    motifs,
    buzz: pickN(rng, C.BUZZWORDS, 2),
    verbs: pickN(rng, C.VERBS, 2),
    cursor: 0,
    slideCount: count,
    usedTitles: new Set(),
  };
  const theme: DeckTheme = {
    palette: pick(rng, PALETTES),
    layout: pick(rng, LAYOUTS),
    font: pick(rng, FONTS),
    footer: clip(`${clip(cleanTopic, 22)} · ${pick(rng, C.FOOTER_TAGS)}`, LIMITS.footer),
  };

  const slides: SlideSpec[] = [
    {
      kind: 'title',
      theme,
      title: fitted(w, C.TALK_TITLES, 'long', LIMITS.talkTitle),
      subtitle: write(w, pick(rng, C.TALK_SUBTITLES), 'short', LIMITS.subtitle),
      presenter: clip(opts.presenter?.trim() || 'Our speaker', LIMITS.presenter),
      role: write(w, pick(rng, C.PRESENTER_ROLES), 'short', LIMITS.role),
    },
  ];

  const usedCharts = new Set<string>();
  const usedScenes = new Set<string>();
  const usedDiagrams = new Set<string>();
  for (const kind of planKinds(rng, count - 2)) {
    switch (kind) {
      case 'bullets':
        slides.push(bulletsSlide(w, theme));
        break;
      case 'chart':
        slides.push(chartSlide(w, theme, usedCharts));
        break;
      case 'table':
        slides.push(tableSlide(w, theme));
        break;
      case 'image':
        slides.push(imageSlide(w, theme, usedScenes));
        break;
      case 'diagram':
        slides.push(diagramSlide(w, theme, usedDiagrams));
        break;
      case 'bigNumber':
        slides.push(bigNumberSlide(w, theme));
        break;
      case 'quote':
        slides.push(quoteSlide(w, theme));
        break;
      case 'timeline':
        slides.push(timelineSlide(w, theme));
        break;
    }
  }

  slides.push({
    kind: 'closer',
    theme,
    title: pick(rng, C.CLOSER_TITLES),
    subtitle: write(w, pick(rng, C.CLOSER_SUBTITLES), 'short', LIMITS.subtitle),
  });
  return { slides, motifs };
}

/**
 * Generate one talk's slides. Deterministic for a given seed (or RNG state,
 * which is copied, never advanced). `slideCount` is clamped to 4–10.
 */
export function generateDeck(
  src: number | RngState,
  topic: string,
  extraWords: readonly string[],
  slideCount: number,
  opts: DeckOptions = {},
): SlideSpec[] {
  return buildDeck(src, topic, extraWords, slideCount, opts).slides;
}

/** `count` distinct audience questions about the talk. */
export function generateQuestions(
  src: number | RngState,
  topic: string,
  motifs: readonly string[],
  count: number,
): string[] {
  const rng = toRng(src);
  const w: Writer = {
    rng,
    topic: clip(topic, 60),
    motifs: motifs.length > 0 ? motifs.slice() : pickN(rng, C.MOTIFS, 2),
    buzz: pickN(rng, C.BUZZWORDS, 2),
    verbs: pickN(rng, C.VERBS, 2),
    cursor: rngInt(rng, 3),
    slideCount: 0,
    usedTitles: new Set(),
  };
  return pickN(rng, C.QUESTIONS, Math.max(0, count)).map((q) => write(w, q, 'short', 90));
}
