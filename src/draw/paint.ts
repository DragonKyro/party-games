// Canvas painting for drawings. Pure rendering — callers own the canvas
// element and its scale (the canvas is sized CANVAS_W × CANVAS_H in logical
// units; `setupCanvas` applies devicePixelRatio for crisp lines).

import { CANVAS_H, CANVAS_W, PALETTE, SIZES, type Drawing, type Stroke } from './drawing';

export function setupCanvas(canvas: HTMLCanvasElement, cssWidth: number): CanvasRenderingContext2D | null {
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const dpr = Math.min(3, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
  const scale = (cssWidth / CANVAS_W) * dpr;
  const w = Math.max(1, Math.round(CANVAS_W * scale));
  const h = Math.max(1, Math.round(CANVAS_H * scale));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  return ctx;
}

export function clearPaper(ctx: CanvasRenderingContext2D): void {
  ctx.save();
  ctx.fillStyle = PALETTE[0];
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  ctx.restore();
}

/**
 * Paint a stroke, optionally only from point `from` (incremental painting
 * while it is being drawn). Smooths with quadratic curves through midpoints.
 */
export function paintStroke(ctx: CanvasRenderingContext2D, stroke: Stroke, from = 0): void {
  const pts = stroke.pts;
  const n = pts.length / 2;
  if (n === 0) return;
  const color = PALETTE[stroke.c] ?? PALETTE[1];
  const width = SIZES[stroke.w] ?? SIZES[1];
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = width;
  if (n === 1 || (n === 2 && pts[0] === pts[2] && pts[1] === pts[3])) {
    if (from > 0) return;
    ctx.beginPath();
    ctx.arc(pts[0]!, pts[1]!, width / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  // An incremental paint continues from exactly where the last one ended
  // (it ended with a straight segment to point `from - 1`), so chunk joins
  // don't overlap or kink.
  const start = from > 0 ? Math.min(from - 1, n - 1) : 0;
  if (start >= n - 1 && from > 0) return;
  ctx.beginPath();
  ctx.moveTo(pts[2 * start]!, pts[2 * start + 1]!);
  for (let i = start + 1; i < n - 1; i++) {
    const x = pts[2 * i]!;
    const y = pts[2 * i + 1]!;
    const mx = (x + pts[2 * i + 2]!) / 2;
    const my = (y + pts[2 * i + 3]!) / 2;
    ctx.quadraticCurveTo(x, y, mx, my);
  }
  ctx.lineTo(pts[2 * n - 2]!, pts[2 * n - 1]!);
  ctx.stroke();
}

export function paintDrawing(ctx: CanvasRenderingContext2D, drawing: Drawing): void {
  clearPaper(ctx);
  for (const s of drawing) paintStroke(ctx, s);
}
