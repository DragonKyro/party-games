import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import styles from './Dial.module.css';

// ============================================================================
// The tuning band: a wide, glowing radio dial window. 0 is the left end of
// the spectrum, 100 the right. Frequency-style ticks run along it (0..100
// maps onto 88.0..108.0 "MHz" — one step is one 0.2 MHz channel).
//
// It can show: one big needle (yours, or the team's shared one), draggable
// when `onChange` is given; the target as a glowing band with scoring zones
// (a static preview for the Tuner, or an animated "station found" sweep at
// the reveal); and everyone's needles as coloured markers with names.
// ============================================================================

export interface DialMarker {
  key: string | number;
  value: number;
  color: string;
  label: string;
  you?: boolean;
}

/** Colour pairs for the two ends; picked per spectrum so rounds look different. */
const END_COLORS: ReadonlyArray<[string, string]> = [
  ['#4cc9f0', '#ff6b6b'],
  ['#06d6a0', '#a06cf0'],
  ['#ffc93c', '#ff70a6'],
  ['#7bdff2', '#ff9f43'],
  ['#b8f35e', '#9aa5ff'],
  ['#9aa5ff', '#ffc93c'],
];

export function endColors(left: string, right: string): [string, string] {
  let h = 2166136261;
  for (const ch of `${left}|${right}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return END_COLORS[(h >>> 0) % END_COLORS.length]!;
}

/** Dial position → the frequency shown on the display. */
export function freq(v: number): string {
  return (88 + Math.max(0, Math.min(100, v)) * 0.2).toFixed(1);
}

const TICKS = Array.from({ length: 101 }, (_, i) => i).filter((i) => i % 2 === 0 || i % 5 === 0);
const FREQ_LABELS = [0, 20, 40, 60, 80, 100];

/** Approximate chip width (px) for a name label. */
const chipWidth = (label: string) => 16 + label.length * 7.4;
const LANE_H = 26;

/** Greedy lanes so name chips don't overlap. Returns lane + clamped left (px) per marker. */
function layoutChips(markers: DialMarker[], width: number): Map<DialMarker['key'], { lane: number; left: number; w: number }> {
  const out = new Map<DialMarker['key'], { lane: number; left: number; w: number }>();
  const laneEnds: number[] = [];
  for (const m of markers.slice().sort((a, b) => a.value - b.value)) {
    const w = chipWidth(m.label);
    const center = (m.value / 100) * width;
    const left = Math.max(0, Math.min(width - w, center - w / 2));
    let lane = laneEnds.findIndex((end) => end + 4 <= left);
    if (lane < 0) {
      lane = laneEnds.length;
      laneEnds.push(0);
    }
    laneEnds[lane] = left + w;
    out.set(m.key, { lane, left, w });
  }
  return out;
}

function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T | null>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(el.clientWidth);
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

export function Dial({
  left,
  right,
  needle = null,
  onChange,
  onDragStart,
  onDragEnd,
  target = null,
  bands,
  zones = 'preview',
  zonesKey,
  markers = [],
  smooth = false,
  dimNeedle = false,
  label = 'Tuning dial',
}: {
  left: string;
  right: string;
  /** The big needle (null = none). */
  needle?: number | null;
  /** Makes the dial draggable. Called with whole numbers 0–100. */
  onChange?: (v: number) => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  /** Show the target with its scoring zones. */
  target?: number | null;
  bands?: readonly number[];
  /** 'preview': steady glow (the Tuner). 'reveal': sweep + bloom animation. */
  zones?: 'preview' | 'reveal';
  /** Re-run the reveal animation when this changes. */
  zonesKey?: string | number;
  markers?: DialMarker[];
  /** Ease the needle between positions (someone else is moving it). */
  smooth?: boolean;
  /** Needle not set yet: draw it faint. */
  dimNeedle?: boolean;
  label?: string;
}) {
  const [lc, rc] = endColors(left, right);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [chipsRef, chipsWidth] = useWidth<HTMLDivElement>();
  const dragging = useRef<number | null>(null);
  const interactive = !!onChange;

  // Stop a capture lingering if the dial becomes read-only mid-drag.
  useEffect(() => {
    if (!interactive) dragging.current = null;
  }, [interactive]);

  const valueAt = (clientX: number): number => {
    const r = trackRef.current?.getBoundingClientRect();
    if (!r || r.width <= 0) return needle ?? 50;
    return Math.max(0, Math.min(100, Math.round(((clientX - r.left) / r.width) * 100)));
  };

  const down = (e: PointerEvent<HTMLDivElement>) => {
    if (!onChange || (e.pointerType === 'mouse' && e.button !== 0)) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    dragging.current = e.pointerId;
    onDragStart?.();
    onChange(valueAt(e.clientX));
  };
  const move = (e: PointerEvent<HTMLDivElement>) => {
    if (!onChange || dragging.current !== e.pointerId) return;
    onChange(valueAt(e.clientX));
  };
  const up = (e: PointerEvent<HTMLDivElement>) => {
    if (dragging.current !== e.pointerId) return;
    dragging.current = null;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    onDragEnd?.();
  };
  const key = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!onChange) return;
    const v = needle ?? 50;
    const step: Record<string, number> = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1, PageDown: -10, PageUp: 10 };
    let next: number | null = null;
    if (e.key in step) next = v + step[e.key]!;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = 100;
    if (next === null) return;
    e.preventDefault();
    onChange(Math.max(0, Math.min(100, next)));
    onDragEnd?.();
  };

  const lanes = layoutChips(markers, chipsWidth);
  const laneCount = markers.length ? Math.max(1, ...[...lanes.values()].map((l) => l.lane + 1)) : 0;
  const sortedBands = (bands ?? []).slice().sort((a, b) => b - a);
  const lean = needle === null ? null : needle < 45 ? left : needle > 55 ? right : 'the middle';

  return (
    <div className={styles.root} style={{ '--lc': lc, '--rc': rc } as CSSProperties}>
      <div className={styles.ends}>
        <span className={styles.endL}>{left}</span>
        <span className={styles.endR}>{right}</span>
      </div>

      <div
        className={`${styles.window} ${interactive ? styles.interactive : ''}`}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onKeyDown={key}
        role={interactive ? 'slider' : 'img'}
        tabIndex={interactive ? 0 : undefined}
        aria-label={interactive ? label : `${label}: ${left} to ${right}`}
        aria-valuemin={interactive ? 0 : undefined}
        aria-valuemax={interactive ? 100 : undefined}
        aria-valuenow={interactive ? (needle ?? 50) : undefined}
        aria-valuetext={interactive && lean ? `${needle} of 100, toward ${lean}` : undefined}
      >
        <div className={styles.clip}>
          <div className={styles.glass} />
          <div className={styles.zonesBox}>
            {target !== null && (
              <div
                key={zonesKey}
                className={`${styles.zones} ${zones === 'reveal' ? styles.revealing : ''}`}
                style={{ '--t': `${target}%` } as CSSProperties}
              >
                {sortedBands.map((b, i) => (
                  <div
                    key={b}
                    className={styles.zone}
                    data-pts={sortedBands.length - i}
                    style={
                      {
                        left: `${target - b}%`,
                        width: `${b * 2}%`,
                        '--i': sortedBands.length - 1 - i,
                      } as CSSProperties
                    }
                  >
                    <span className={styles.zonePts}>{sortedBands.length - i}</span>
                  </div>
                ))}
                <div className={styles.station} style={{ left: `${target}%` }} />
                {zones === 'reveal' && <div className={styles.sweep} />}
              </div>
            )}
          </div>
          <svg className={styles.ticks} viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden>
            {TICKS.map((i) => {
              const major = i % 10 === 0;
              const mid = !major && i % 5 === 0;
              return (
                <line
                  key={i}
                  x1={i}
                  x2={i}
                  y1={major ? 8 : mid ? 16 : 22}
                  y2={30}
                  className={major ? styles.tickMajor : styles.tick}
                  vectorEffect="non-scaling-stroke"
                />
              );
            })}
          </svg>
          <div className={styles.freqs} aria-hidden>
            {FREQ_LABELS.map((v) => (
              <span key={v} style={{ left: `${v}%` }}>
                {freq(v).replace('.0', '')}
              </span>
            ))}
          </div>
        </div>

        <div className={styles.track} ref={trackRef}>
          {markers.map((m, i) => (
            <span
              key={m.key}
              className={`${styles.pin} ${m.you ? styles.pinYou : ''}`}
              style={{ left: `${m.value}%`, '--c': m.color, '--i': i } as CSSProperties}
            />
          ))}
          {needle !== null && (
            <div
              className={`${styles.needle} ${smooth ? styles.smooth : ''} ${dimNeedle ? styles.dim : ''}`}
              style={{ left: `${needle}%` }}
              aria-hidden
            >
              <span className={styles.cap} />
            </div>
          )}
        </div>
      </div>

      {markers.length > 0 && (
        <div className={styles.chips} ref={chipsRef} style={{ height: laneCount * LANE_H + 8 }}>
          {chipsWidth > 0 &&
            markers.map((m, i) => {
              const l = lanes.get(m.key)!;
              return (
                <span key={m.key} style={{ '--c': m.color, '--i': i } as CSSProperties} className={styles.chipWrap}>
                  <span className={styles.stem} style={{ left: `${m.value}%`, height: l.lane * LANE_H + 8 }} />
                  <span
                    className={`${styles.chip} ${m.you ? styles.chipYou : ''}`}
                    style={{ left: l.left, top: l.lane * LANE_H + 6, width: l.w }}
                  >
                    {m.label}
                  </span>
                </span>
              );
            })}
        </div>
      )}
    </div>
  );
}

/** Signal-strength bars for 0–4 points. */
export function SignalBars({ points, size = 18 }: { points: number; size?: number }) {
  return (
    <span className={styles.bars} style={{ height: size }} role="img" aria-label={`${points} of 4`}>
      {[1, 2, 3, 4].map((b) => (
        <i key={b} className={b <= points ? styles.barOn : ''} style={{ height: `${25 * b}%` }} />
      ))}
    </span>
  );
}
