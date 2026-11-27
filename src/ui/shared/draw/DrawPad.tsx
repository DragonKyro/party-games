import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BoardModel, pointsOp, type BoardOp } from '@/draw/board';
import {
  CANVAS_H,
  CANVAS_W,
  DEFAULT_COLOR,
  DEFAULT_SIZE,
  ERASER,
  PALETTE,
  SIZES,
  clampPoint,
  decodeDrawing,
  type Drawing,
} from '@/draw/drawing';
import { clearPaper, paintDrawing, paintStroke, setupCanvas } from '@/draw/paint';
import { useBoardStore } from '@/store/boardStore';
import styles from './DrawPad.module.css';

// ============================================================================
// Drawing surfaces
// ============================================================================
//
// `DrawPad` draws on (and shows) any `BoardSource`:
//   - `useLiveBoard(id)`  the room's live board (Sketch & Guess): what the
//                         drawer draws streams to every device;
//   - `useLocalBoard()`   a private board on this device (Doodle Telephone):
//                         read `source.model.drawing()` and submit it.
// `Sketch` shows a finished drawing (Drawing or its encoded string).

export interface BoardSource {
  model: BoardModel;
  version: number;
  draw: (op: BoardOp) => void;
  nextOpId: () => string;
}

/** The shared live board. Switches (and wipes) when `boardId` changes. */
export function useLiveBoard(boardId: string | null): BoardSource {
  const reset = useBoardStore((s) => s.reset);
  const model = useBoardStore((s) => s.model);
  const version = useBoardStore((s) => s.version);
  const draw = useBoardStore((s) => s.draw);
  const nextOpId = useBoardStore((s) => s.nextOpId);
  useEffect(() => {
    reset(boardId);
  }, [boardId, reset]);
  return { model, version, draw, nextOpId };
}

let localSeq = 0;

/** A private board on this device. `clear()` starts a fresh page. */
export function useLocalBoard(key?: unknown): BoardSource & { clear: () => void } {
  const [model, setModel] = useState(() => new BoardModel());
  const [version, setVersion] = useState(0);
  useEffect(() => {
    setModel(new BoardModel());
    setVersion((v) => v + 1);
  }, [key]);
  const draw = useCallback(
    (op: BoardOp) => {
      if (model.apply(op)) setVersion((v) => v + 1);
    },
    [model],
  );
  return useMemo(
    () => ({
      model,
      version,
      draw,
      nextOpId: () => `L${(++localSeq).toString(36)}`,
      clear: () => {
        setModel(new BoardModel());
        setVersion((v) => v + 1);
      },
    }),
    [model, version, draw],
  );
}

/** Size a canvas to its container's width (4:3), re-measuring on resize. */
function useCanvasWidth(ref: React.RefObject<HTMLDivElement | null>): number {
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setW(el.clientWidth);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return w;
}

const MIN_STEP = 1.6;
const EMIT_MS = 45;

export function DrawPad({
  source,
  enabled,
  tools = enabled,
  className,
  onFirstStroke,
}: {
  source: BoardSource;
  /** This device may draw. */
  enabled: boolean;
  /** Show the toolbar. Default: when enabled. */
  tools?: boolean;
  className?: string;
  onFirstStroke?: () => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const width = useCanvasWidth(wrapRef);
  const [color, setColor] = useState(DEFAULT_COLOR);
  const [size, setSize] = useState(DEFAULT_SIZE);
  const [erasing, setErasing] = useState(false);
  const myStrokes = useRef<string[]>([]);

  // ---- painting -----------------------------------------------------------
  const painted = useRef<{ model: BoardModel | null; epoch: number; width: number; counts: Map<string, number> }>({
    model: null,
    epoch: -1,
    width: 0,
    counts: new Map(),
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || width <= 0) return;
    const ctx = setupCanvas(canvas, width);
    if (!ctx) return;
    const p = painted.current;
    const { model } = source;
    const full = p.model !== model || p.epoch !== model.epoch || p.width !== width;
    if (full) {
      clearPaper(ctx);
      p.counts = new Map();
    }
    for (const id of model.strokeIds()) {
      const s = model.stroke(id);
      if (!s) continue;
      const done = p.counts.get(id) ?? 0;
      const n = s.pts.length / 2;
      if (n > done) paintStroke(ctx, s, done);
      p.counts.set(id, n);
    }
    p.model = model;
    p.epoch = model.epoch;
    p.width = width;
    if (full) return;
    // Incremental painting leaves faint seams where streamed chunks join
    // (anti-aliased edges painted twice). Once the board goes quiet, repaint
    // the whole drawing cleanly. Any newer change cancels this.
    const t = setTimeout(() => {
      const c = canvasRef.current;
      const clean = c ? setupCanvas(c, width) : null;
      if (!clean) return;
      paintDrawing(clean, model.drawing());
      p.counts = new Map(model.strokeIds().map((id) => [id, (model.stroke(id)?.pts.length ?? 0) / 2]));
    }, 250);
    return () => clearTimeout(t);
  }, [source, source.version, width]);

  // ---- input --------------------------------------------------------------
  const live = useRef<{
    id: string;
    c: number;
    w: number;
    pending: number[];
    lastX: number | null;
    lastY: number | null;
    lastEmit: number;
    timer: ReturnType<typeof setTimeout> | null;
  } | null>(null);

  const emit = useCallback(() => {
    const s = live.current;
    if (!s) return;
    if (s.timer) clearTimeout(s.timer);
    s.timer = null;
    if (s.pending.length === 0) return;
    source.draw(pointsOp(source.nextOpId(), s.id, s.c, s.w, s.pending, s.lastX, s.lastY));
    s.lastX = s.pending[s.pending.length - 2]!;
    s.lastY = s.pending[s.pending.length - 1]!;
    s.pending = [];
    s.lastEmit = performance.now();
  }, [source]);

  const toLogical = (e: { clientX: number; clientY: number }): [number, number] => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return clampPoint(((e.clientX - rect.left) / rect.width) * CANVAS_W, ((e.clientY - rect.top) / rect.height) * CANVAS_H);
  };

  const addPoint = (x: number, y: number) => {
    const s = live.current;
    if (!s) return;
    const px = s.pending.length ? s.pending[s.pending.length - 2]! : s.lastX;
    const py = s.pending.length ? s.pending[s.pending.length - 1]! : s.lastY;
    if (px !== null && py !== null && Math.hypot(x - px, y - py) < MIN_STEP) return;
    s.pending.push(x, y);
    if (performance.now() - s.lastEmit >= EMIT_MS) emit();
    else if (!s.timer) s.timer = setTimeout(emit, EMIT_MS);
  };

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!enabled || (e.pointerType === 'mouse' && e.button !== 0)) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    if (myStrokes.current.length === 0 && source.model.isEmpty()) onFirstStroke?.();
    const id = source.nextOpId();
    myStrokes.current.push(id);
    live.current = {
      id,
      c: erasing ? ERASER : color,
      w: size,
      pending: [],
      lastX: null,
      lastY: null,
      lastEmit: 0,
      timer: null,
    };
    const [x, y] = toLogical(e);
    live.current.pending.push(x, y);
    emit();
  };

  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!live.current) return;
    const events = typeof e.nativeEvent.getCoalescedEvents === 'function' ? e.nativeEvent.getCoalescedEvents() : [];
    for (const ev of events.length ? events : [e]) {
      const [x, y] = toLogical(ev);
      addPoint(x, y);
    }
  };

  const onUp = () => {
    if (!live.current) return;
    emit();
    live.current = null;
  };

  const undo = () => {
    while (myStrokes.current.length) {
      const id = myStrokes.current.pop()!;
      if (source.model.stroke(id)) {
        source.draw({ o: source.nextOpId(), k: 'u', s: id });
        return;
      }
    }
  };

  const clear = () => {
    if (source.model.isEmpty()) return;
    if (typeof window.confirm === 'function' && !window.confirm('Clear the whole drawing?')) return;
    source.draw({ o: source.nextOpId(), k: 'x' });
    myStrokes.current = [];
  };

  return (
    <div className={`${styles.root} ${className ?? ''}`}>
      <div ref={wrapRef} className={`${styles.paper} ${enabled ? styles.drawable : ''}`}>
        <canvas
          ref={canvasRef}
          className={styles.canvas}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          onLostPointerCapture={onUp}
          aria-label={enabled ? 'Drawing canvas' : 'Drawing'}
          role="img"
        />
      </div>
      {tools && enabled && (
        <div className={styles.tools} role="toolbar" aria-label="Drawing tools">
          <div className={styles.palette}>
            {PALETTE.map((c, i) =>
              i === ERASER ? null : (
                <button
                  key={c}
                  type="button"
                  className={`${styles.swatch} ${!erasing && color === i ? styles.picked : ''}`}
                  style={{ background: c }}
                  onClick={() => {
                    setColor(i);
                    setErasing(false);
                  }}
                  aria-label={`Colour ${i}`}
                />
              ),
            )}
          </div>
          <div className={styles.row}>
            {SIZES.map((s, i) => (
              <button
                key={s}
                type="button"
                className={`${styles.size} ${size === i ? styles.picked : ''}`}
                onClick={() => setSize(i)}
                aria-label={`Brush size ${i + 1}`}
              >
                <span style={{ width: Math.max(4, s * 0.55), height: Math.max(4, s * 0.55), background: erasing ? '#fff' : PALETTE[color] }} />
              </button>
            ))}
            <button
              type="button"
              className={`${styles.tool} ${erasing ? styles.picked : ''}`}
              onClick={() => setErasing((v) => !v)}
              aria-pressed={erasing}
              title="Eraser"
            >
              🧽
            </button>
            <button type="button" className={styles.tool} onClick={undo} title="Undo">
              ↶
            </button>
            <button type="button" className={styles.tool} onClick={clear} title="Clear">
              🗑
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** A finished drawing, read-only. */
export function Sketch({ drawing, className, label }: { drawing: Drawing | string; className?: string; label?: string }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const width = useCanvasWidth(wrapRef);
  const strokes = useMemo(() => {
    if (typeof drawing !== 'string') return drawing;
    try {
      return decodeDrawing(drawing);
    } catch {
      return [];
    }
  }, [drawing]);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || width <= 0) return;
    const ctx = setupCanvas(canvas, width);
    if (ctx) paintDrawing(ctx, strokes);
  }, [strokes, width]);
  return (
    <div ref={wrapRef} className={`${styles.paper} ${className ?? ''}`}>
      <canvas ref={canvasRef} className={styles.canvas} role="img" aria-label={label ?? 'A drawing'} />
    </div>
  );
}
