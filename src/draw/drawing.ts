// Drawings as data, shared by Sketch & Guess (live board) and Doodle
// Telephone (finished drawings passed around as game state).
//
// Coordinates live on a fixed logical canvas (CANVAS_W × CANVAS_H) and are
// integers, so a drawing looks the same on every screen size and encodes
// compactly. Colours and brush sizes are palette indexes.
//
// Wire format (`encodeDrawing`): "d1" + one segment per stroke, each
// ";" + colour char + size char + base64-VLQ deltas (first point absolute).
// Typically 1–4 KB for a doodle, well under the database's payload limits.

export const CANVAS_W = 800;
export const CANVAS_H = 600;

/** Index 0 is the paper colour, so it doubles as the eraser. */
export const PALETTE = [
  '#ffffff',
  '#1d1b26',
  '#767386',
  '#c9c6d6',
  '#e63946',
  '#ff8c42',
  '#ffd23f',
  '#57cc63',
  '#1f9e89',
  '#3a86ff',
  '#7b2ff7',
  '#ff5fa2',
  '#8b5a2b',
  '#f4c7a1',
  '#14396e',
  '#2f5d23',
] as const;

export const ERASER = 0;
export const DEFAULT_COLOR = 1;

/** Brush diameters in logical px. */
export const SIZES = [4, 9, 18, 36] as const;
export const DEFAULT_SIZE = 1;

export interface Stroke {
  /** Palette index. */
  c: number;
  /** SIZES index. */
  w: number;
  /** Flat [x0, y0, x1, y1, …] integer points. */
  pts: number[];
}

export type Drawing = Stroke[];

/** Hard cap on an encoded drawing (the inbox rule allows a bit more). */
export const MAX_ENCODED_DRAWING = 40_000;

// ---------------------------------------------------------------------------
// Base64 VLQ (the source-map flavour: sign in the low bit, 5 bits per char)
// ---------------------------------------------------------------------------

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_INDEX = new Map([...B64].map((ch, i) => [ch, i]));

export function vlqEncode(values: readonly number[]): string {
  let out = '';
  for (const n of values) {
    let v = n < 0 ? (-n << 1) | 1 : n << 1;
    do {
      let digit = v & 31;
      v >>>= 5;
      if (v > 0) digit |= 32;
      out += B64[digit];
    } while (v > 0);
  }
  return out;
}

export function vlqDecode(s: string): number[] {
  const out: number[] = [];
  let value = 0;
  let shift = 0;
  for (const ch of s) {
    const digit = B64_INDEX.get(ch);
    if (digit === undefined) throw new Error('Bad drawing data');
    value += (digit & 31) << shift;
    if (digit & 32) {
      shift += 5;
      if (shift > 30) throw new Error('Bad drawing data');
    } else {
      out.push(value & 1 ? -(value >>> 1) : value >>> 1);
      value = 0;
      shift = 0;
    }
  }
  if (shift !== 0) throw new Error('Bad drawing data');
  return out;
}

/** Absolute flat points → [x0, y0, dx1, dy1, …]. */
export function toDeltas(pts: readonly number[], fromX = 0, fromY = 0): number[] {
  const out: number[] = [];
  let px = fromX;
  let py = fromY;
  for (let i = 0; i + 1 < pts.length; i += 2) {
    out.push(pts[i]! - px, pts[i + 1]! - py);
    px = pts[i]!;
    py = pts[i + 1]!;
  }
  return out;
}

export function fromDeltas(deltas: readonly number[], fromX = 0, fromY = 0): number[] {
  const out: number[] = [];
  let x = fromX;
  let y = fromY;
  for (let i = 0; i + 1 < deltas.length; i += 2) {
    x += deltas[i]!;
    y += deltas[i + 1]!;
    out.push(x, y);
  }
  return out;
}

export function clampPoint(x: number, y: number): [number, number] {
  return [
    Math.max(0, Math.min(CANVAS_W, Math.round(x))),
    Math.max(0, Math.min(CANVAS_H, Math.round(y))),
  ];
}

function validIndex(n: number, len: number): boolean {
  return Number.isInteger(n) && n >= 0 && n < len;
}

// ---------------------------------------------------------------------------
// Whole drawings
// ---------------------------------------------------------------------------

export function encodeDrawing(drawing: Drawing): string {
  let out = 'd1';
  for (const s of drawing) {
    if (s.pts.length < 2) continue;
    out += `;${B64[s.c]}${B64[s.w]}${vlqEncode(toDeltas(s.pts))}`;
  }
  return out;
}

/** Parse + validate untrusted drawing data. Throws on anything malformed. */
export function decodeDrawing(data: unknown): Drawing {
  if (typeof data !== 'string' || !data.startsWith('d1')) throw new Error('Bad drawing data');
  if (data.length > MAX_ENCODED_DRAWING) throw new Error('Drawing is too detailed');
  const out: Drawing = [];
  for (const seg of data.slice(2).split(';')) {
    if (!seg) continue;
    const c = B64_INDEX.get(seg[0]!) ?? -1;
    const w = B64_INDEX.get(seg[1] ?? '') ?? -1;
    if (!validIndex(c, PALETTE.length) || !validIndex(w, SIZES.length)) throw new Error('Bad drawing data');
    const pts = fromDeltas(vlqDecode(seg.slice(2)));
    if (pts.length < 2 || pts.length % 2 !== 0) throw new Error('Bad drawing data');
    for (let i = 0; i < pts.length; i += 2) {
      if (pts[i]! < 0 || pts[i]! > CANVAS_W || pts[i + 1]! < 0 || pts[i + 1]! > CANVAS_H) {
        throw new Error('Bad drawing data');
      }
    }
    out.push({ c, w, pts });
  }
  return out;
}

export function isBlank(drawing: Drawing): boolean {
  return !drawing.some((s) => s.c !== ERASER && s.pts.length >= 2);
}

// ---------------------------------------------------------------------------
// Simplification (Ramer–Douglas–Peucker) — run on finished strokes
// ---------------------------------------------------------------------------

function perpDistSq(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len = dx * dx + dy * dy;
  if (len === 0) return (px - ax) ** 2 + (py - ay) ** 2;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len));
  return (px - (ax + t * dx)) ** 2 + (py - (ay + t * dy)) ** 2;
}

export function simplifyPoints(pts: readonly number[], epsilon = 1.2): number[] {
  const n = pts.length / 2;
  if (n <= 2) return pts.slice();
  const keep = new Uint8Array(n);
  keep[0] = 1;
  keep[n - 1] = 1;
  const eps2 = epsilon * epsilon;
  const stack: Array<[number, number]> = [[0, n - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    let best = -1;
    let bestD = eps2;
    for (let i = a + 1; i < b; i++) {
      const d = perpDistSq(pts[2 * i]!, pts[2 * i + 1]!, pts[2 * a]!, pts[2 * a + 1]!, pts[2 * b]!, pts[2 * b + 1]!);
      if (d > bestD) {
        bestD = d;
        best = i;
      }
    }
    if (best >= 0) {
      keep[best] = 1;
      stack.push([a, best], [best, b]);
    }
  }
  const out: number[] = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(pts[2 * i]!, pts[2 * i + 1]!);
  return out;
}

export function simplifyDrawing(drawing: Drawing, epsilon = 1.2): Drawing {
  return drawing.map((s) => ({ ...s, pts: simplifyPoints(s.pts, epsilon) }));
}
