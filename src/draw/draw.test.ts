import { describe, expect, it } from 'vitest';
import { BoardModel, parseBatch, pointsOp, type BoardOp } from './board';
import {
  CANVAS_H,
  CANVAS_W,
  decodeDrawing,
  encodeDrawing,
  isBlank,
  simplifyDrawing,
  simplifyPoints,
  vlqDecode,
  vlqEncode,
  type Drawing,
} from './drawing';

describe('vlq', () => {
  it('round-trips small, large and negative numbers', () => {
    const values = [0, 1, -1, 15, -16, 31, 32, 1000, -1000, 800, -600, 123456];
    expect(vlqDecode(vlqEncode(values))).toEqual(values);
    expect(vlqEncode([0, 1, -1])).toHaveLength(3); // tiny deltas cost one char
  });

  it('rejects junk', () => {
    expect(() => vlqDecode('!!')).toThrow();
    expect(() => vlqDecode('g')).toThrow(); // continuation bit with nothing after
  });
});

describe('drawing encoding', () => {
  const doodle: Drawing = [
    { c: 1, w: 1, pts: [10, 10, 20, 15, 35, 30, 800, 600] },
    { c: 4, w: 3, pts: [400, 300, 400, 300] },
  ];

  it('round-trips a drawing', () => {
    const enc = encodeDrawing(doodle);
    expect(enc.startsWith('d1;')).toBe(true);
    expect(decodeDrawing(enc)).toEqual(doodle);
    expect(decodeDrawing('d1')).toEqual([]);
  });

  it('refuses malformed or out-of-bounds data', () => {
    expect(() => decodeDrawing(42)).toThrow();
    expect(() => decodeDrawing('x1;BB')).toThrow();
    expect(() => decodeDrawing('d1;zz' + vlqEncode([0, 0]))).toThrow(); // bad colour/size
    expect(() => decodeDrawing('d1;BB' + vlqEncode([CANVAS_W + 1, 0]))).toThrow();
    expect(() => decodeDrawing('d1;BB' + vlqEncode([5]))).toThrow(); // odd coordinate count
    expect(() => decodeDrawing('d1' + ';BBAA'.repeat(20_000))).toThrow(/detailed/);
  });

  it('keeps a realistic doodle small after simplification', () => {
    const pts: number[] = [];
    for (let i = 0; i < 600; i++) pts.push(Math.round(400 + 250 * Math.cos(i / 40)), Math.round(300 + 200 * Math.sin(i / 40)));
    const drawing: Drawing = Array.from({ length: 6 }, (_, k) => ({ c: k % 16, w: k % 4, pts }));
    const enc = encodeDrawing(simplifyDrawing(drawing));
    expect(enc.length).toBeLessThan(4_000);
    expect(decodeDrawing(enc)).toHaveLength(6);
  });

  it('simplifies straight lines down to their ends', () => {
    expect(simplifyPoints([0, 0, 1, 1, 2, 2, 3, 3, 10, 10])).toEqual([0, 0, 10, 10]);
    expect(simplifyPoints([0, 0, 5, 9, 10, 0])).toEqual([0, 0, 5, 9, 10, 0]);
  });

  it('treats eraser-only drawings as blank', () => {
    expect(isBlank([])).toBe(true);
    expect(isBlank([{ c: 0, w: 2, pts: [1, 1, 5, 5] }])).toBe(true);
    expect(isBlank(doodle)).toBe(false);
    expect(CANVAS_H).toBeLessThan(CANVAS_W);
  });
});

describe('board model', () => {
  it('streams a stroke in chunks, applies each op once, undoes and clears', () => {
    const b = new BoardModel();
    const a1 = pointsOp('u-1', 's1', 2, 1, [10, 10, 12, 14], null, null);
    const a2 = pointsOp('u-2', 's1', 2, 1, [20, 20, 25, 22], 12, 14);
    const b1 = pointsOp('u-3', 's2', 4, 0, [100, 100], null, null);
    expect(b.apply(a1)).toBe(true);
    expect(b.apply(a1)).toBe(false); // echo
    b.apply(a2);
    b.apply(b1);
    expect(b.drawing()).toEqual([
      { c: 2, w: 1, pts: [10, 10, 12, 14, 20, 20, 25, 22] },
      { c: 4, w: 0, pts: [100, 100] },
    ]);
    const epoch = b.epoch;
    expect(b.lastPoint('s1')).toEqual([25, 22]);
    b.apply({ o: 'u-4', k: 'u', s: 's1' });
    expect(b.epoch).toBe(epoch + 1);
    expect(b.strokeIds()).toEqual(['s2']);
    b.apply({ o: 'u-5', k: 'x' });
    expect(b.isEmpty()).toBe(true);
  });

  it('ignores malformed ops and batches', () => {
    const b = new BoardModel();
    expect(b.apply({ o: 'z', k: 'p', s: 's', c: 99, w: 0, d: 'AA' })).toBe(false);
    expect(b.apply({ o: 'y', k: 'p', s: 's', c: 1, w: 0, d: '!!' })).toBe(false);
    expect(b.apply({ o: 'q', k: 'u', s: 'nope' })).toBe(false);
    expect(parseBatch('not json')).toEqual([]);
    expect(parseBatch(JSON.stringify([{ o: 'a', k: 'x' }, { k: 'x' }, 7]))).toEqual([{ o: 'a', k: 'x' }] as BoardOp[]);
  });
});
