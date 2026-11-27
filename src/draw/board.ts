// The live board: a drawing built from an append-only log of ops, so it can
// stream to every device while it is being drawn (Sketch & Guess). Ops go
// through the room's `board/ops` channel, not through game state — sending
// the whole picture in every view would cost megabytes per turn.
//
//   p  add points to stroke `s` (creating it with colour/size on first sight)
//   u  undo: remove stroke `s`
//   x  clear the board
//
// Every op has a unique id `o` so a device that sees its own ops echoed back
// (or receives a batch twice after a reconnect) applies each exactly once.

import { PALETTE, SIZES, fromDeltas, vlqDecode, vlqEncode, type Drawing, type Stroke } from './drawing';

export type BoardOp =
  | { o: string; k: 'p'; s: string; c: number; w: number; d: string }
  | { o: string; k: 'u'; s: string }
  | { o: string; k: 'x' };

/** Max ops per network batch (keeps each push well under the payload rule). */
export const MAX_OPS_PER_BATCH = 60;

export class BoardModel {
  private order: string[] = [];
  private strokes = new Map<string, Stroke>();
  private seen = new Set<string>();
  /** Bumped on every change. */
  version = 0;
  /**
   * Bumped when something is removed (undo / clear). A painter that sees the
   * same epoch as last time can paint just the new points; a new epoch means
   * repaint from scratch.
   */
  epoch = 0;

  apply(op: BoardOp): boolean {
    if (!op || typeof op.o !== 'string' || this.seen.has(op.o)) return false;
    this.seen.add(op.o);
    switch (op.k) {
      case 'p': {
        if (!Number.isInteger(op.c) || op.c < 0 || op.c >= PALETTE.length) return false;
        if (!Number.isInteger(op.w) || op.w < 0 || op.w >= SIZES.length) return false;
        let stroke = this.strokes.get(op.s);
        let deltas: number[];
        try {
          deltas = vlqDecode(op.d);
        } catch {
          return false;
        }
        if (!stroke) {
          stroke = { c: op.c, w: op.w, pts: [] };
          this.strokes.set(op.s, stroke);
          this.order.push(op.s);
        }
        const n = stroke.pts.length;
        const lastX = n >= 2 ? stroke.pts[n - 2]! : 0;
        const lastY = n >= 2 ? stroke.pts[n - 1]! : 0;
        stroke.pts.push(...fromDeltas(deltas, lastX, lastY));
        break;
      }
      case 'u': {
        if (!this.strokes.has(op.s)) return false;
        this.strokes.delete(op.s);
        this.order = this.order.filter((id) => id !== op.s);
        this.epoch++;
        break;
      }
      case 'x': {
        this.order = [];
        this.strokes.clear();
        this.epoch++;
        break;
      }
      default:
        return false;
    }
    this.version++;
    return true;
  }

  drawing(): Drawing {
    return this.order.map((id) => this.strokes.get(id)!).filter(Boolean);
  }

  strokeIds(): string[] {
    return this.order.slice();
  }

  /** The stroke with id `id` (live object — don't mutate). */
  stroke(id: string): Stroke | undefined {
    return this.strokes.get(id);
  }

  /** Last point of stroke `id`, for continuing it. */
  lastPoint(id: string): [number, number] | null {
    const s = this.strokes.get(id);
    if (!s || s.pts.length < 2) return null;
    return [s.pts[s.pts.length - 2]!, s.pts[s.pts.length - 1]!];
  }

  isEmpty(): boolean {
    return this.order.length === 0;
  }
}

/** Encode a chunk of new points for stroke `s`, continuing from its last point. */
export function pointsOp(
  o: string,
  s: string,
  c: number,
  w: number,
  newPts: readonly number[],
  lastX: number | null,
  lastY: number | null,
): BoardOp {
  const deltas: number[] = [];
  let px = lastX ?? 0;
  let py = lastY ?? 0;
  for (let i = 0; i + 1 < newPts.length; i += 2) {
    deltas.push(newPts[i]! - px, newPts[i + 1]! - py);
    px = newPts[i]!;
    py = newPts[i + 1]!;
  }
  return { o, k: 'p', s, c, w, d: vlqEncode(deltas) };
}

/** Parse a network batch (JSON array of ops); drops anything malformed. */
export function parseBatch(payload: unknown): BoardOp[] {
  if (typeof payload !== 'string') return [];
  try {
    const arr = JSON.parse(payload) as unknown;
    if (!Array.isArray(arr)) return [];
    return arr.filter(
      (op): op is BoardOp =>
        !!op &&
        typeof op === 'object' &&
        typeof (op as { o?: unknown }).o === 'string' &&
        ['p', 'u', 'x'].includes((op as { k?: string }).k ?? ''),
    );
  } catch {
    return [];
  }
}
