import type { ReactNode } from 'react';
import { makeRng, rngFloat, rngInt } from '@/engine/rng';
import { useSvgIds } from '@/ui/shared/svg';
import type { Palette, SceneKind } from '../deck';
import { mix, shade, tint } from './color';

// ============================================================================
// Procedural "stock photos" for image slides.
//
// Each scene is a small flat illustration composed from a handful of
// seeded parameters (sun or moon, how many buildings, who sits at the
// table…) and coloured from the deck's palette, so every picture belongs to
// its deck. Deterministic: the same (scene, seed, palette) always draws the
// same picture on every device. viewBox 480×300.
// ============================================================================

const W = 480;
const H = 300;

interface Rand {
  f(): number;
  between(a: number, b: number): number;
  int(a: number, b: number): number;
  pick<T>(arr: readonly T[]): T;
  chance(p: number): boolean;
}

function rand(seed: number): Rand {
  const r = makeRng(seed);
  return {
    f: () => rngFloat(r),
    between: (a, b) => a + rngFloat(r) * (b - a),
    int: (a, b) => a + rngInt(r, b - a + 1),
    pick: <T,>(arr: readonly T[]) => arr[rngInt(r, arr.length)]!,
    chance: (p) => rngFloat(r) < p,
  };
}

type Pt = readonly [number, number];
type Ids = Record<'clip' | 'g1' | 'g2' | 'g3', string>;
type SceneFn = (r: Rand, p: Palette, ids: Ids) => ReactNode;

const n1 = (v: number) => Math.round(v * 10) / 10;

/** Smooth curve through points (Catmull-Rom → cubic Bézier). */
function smooth(pts: readonly Pt[], closed: boolean): string {
  const n = pts.length;
  const at = (i: number): Pt => (closed ? pts[(i + n) % n]! : pts[Math.max(0, Math.min(n - 1, i))]!);
  let d = `M${n1(pts[0]![0])} ${n1(pts[0]![1])}`;
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${n1(c1[0]!)} ${n1(c1[1]!)} ${n1(c2[0]!)} ${n1(c2[1]!)} ${n1(p2[0])} ${n1(p2[1])}`;
  }
  return closed ? `${d}Z` : d;
}

/** An organic blob around (cx, cy). */
function blob(r: Rand, cx: number, cy: number, radius: number, k = 7): string {
  const pts: Pt[] = Array.from({ length: k }, (_, i) => {
    const a = (i / k) * Math.PI * 2;
    const rr = radius * r.between(0.78, 1.14);
    return [cx + Math.cos(a) * rr, cy + Math.sin(a) * rr];
  });
  return smooth(pts, true);
}

function Sky({ id, top, bottom }: { id: string; top: string; bottom: string }) {
  return (
    <>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={top} />
          <stop offset="1" stopColor={bottom} />
        </linearGradient>
      </defs>
      <rect width={W} height={H} fill={`url(#${id})`} />
    </>
  );
}

function Cloud({ x, y, s, fill, opacity = 0.92 }: { x: number; y: number; s: number; fill: string; opacity?: number }) {
  return (
    <g transform={`translate(${n1(x)} ${n1(y)}) scale(${n1(s * 100) / 100})`} fill={fill} opacity={opacity}>
      <circle cx="0" cy="0" r="16" />
      <circle cx="22" cy="-10" r="22" />
      <circle cx="46" cy="0" r="15" />
      <rect x="-16" y="0" width="77" height="15" rx="7.5" />
    </g>
  );
}

function Birds({ r, color, count, x, y }: { r: Rand; color: string; count: number; x: number; y: number }) {
  return (
    <g fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      {Array.from({ length: count }, (_, i) => {
        const bx = x + i * r.between(18, 28);
        const by = y + r.between(-10, 10);
        const s = r.between(0.7, 1.1);
        return <path key={i} d={`M${n1(bx - 8 * s)} ${n1(by - 4 * s)} Q${n1(bx - 3 * s)} ${n1(by - 7 * s)} ${n1(bx)} ${n1(by)} Q${n1(bx + 3 * s)} ${n1(by - 7 * s)} ${n1(bx + 8 * s)} ${n1(by - 4 * s)}`} />;
      })}
    </g>
  );
}

function Sparkle({ x, y, s, fill }: { x: number; y: number; s: number; fill: string }) {
  return (
    <path
      d={`M${n1(x)} ${n1(y - 10 * s)} Q${n1(x)} ${n1(y)} ${n1(x + 10 * s)} ${n1(y)} Q${n1(x)} ${n1(y)} ${n1(x)} ${n1(y + 10 * s)} Q${n1(x)} ${n1(y)} ${n1(x - 10 * s)} ${n1(y)} Q${n1(x)} ${n1(y)} ${n1(x)} ${n1(y - 10 * s)}Z`}
      fill={fill}
    />
  );
}

/** Peaks + valleys across the width. */
function ridge(r: Rand, count: number, peakY: [number, number], valleyY: [number, number]): Pt[] {
  const pts: Pt[] = [];
  const step = (W + 60) / (count * 2);
  for (let i = 0; i <= count * 2; i++) {
    const x = -30 + i * step + r.between(-step * 0.25, step * 0.25);
    const y = i % 2 === 1 ? r.between(...peakY) : r.between(...valleyY);
    pts.push([x, y]);
  }
  return pts;
}

function ridgePath(pts: readonly Pt[]): string {
  return `M-30 ${H} ${pts.map(([x, y]) => `L${n1(x)} ${n1(y)}`).join(' ')} L${W + 30} ${H}Z`;
}

function snowCaps(pts: readonly Pt[]): string[] {
  const caps: string[] = [];
  for (let i = 1; i < pts.length - 1; i += 2) {
    const [px, py] = pts[i]!;
    const [lx, ly] = pts[i - 1]!;
    const [rx, ry] = pts[i + 1]!;
    const t = 0.26;
    const L: Pt = [px + (lx - px) * t, py + (ly - py) * t];
    const R: Pt = [px + (rx - px) * t, py + (ry - py) * t];
    const drop = ((ly - py) * t + (ry - py) * t) / 2;
    caps.push(
      `M${n1(px)} ${n1(py)} L${n1(R[0])} ${n1(R[1])} L${n1((px + R[0]) / 2)} ${n1(py + drop * 0.75)} L${n1(px)} ${n1(py + drop * 1.05)} L${n1((px + L[0]) / 2)} ${n1(py + drop * 0.7)} L${n1(L[0])} ${n1(L[1])}Z`,
    );
  }
  return caps;
}

/** Rolling hill top edge from y0 at the left to y1 at the right. */
function hill(r: Rand, y0: number, y1: number, wobble: number): string {
  const pts: Pt[] = Array.from({ length: 6 }, (_, i) => {
    const x = -20 + (i / 5) * (W + 40);
    return [x, y0 + ((y1 - y0) * i) / 5 + r.between(-wobble, wobble)];
  });
  return `${smooth(pts, false)} L${W + 20} ${H} L-20 ${H}Z`;
}

// ---- people ------------------------------------------------------------------

const SKIN = ['#f3c9a3', '#e2a67c', '#c98b5b', '#9a6440', '#6e4630', '#f6dcc0'];
const HAIR = ['#2b2321', '#5a3825', '#a5643a', '#d9b26f', '#1d1d2b', '#8c8c99'];

interface PersonLook {
  skin: string;
  hair: string;
  shirt: string;
  style: number;
  glasses: boolean;
}

function look(r: Rand, shirts: readonly string[]): PersonLook {
  return { skin: r.pick(SKIN), hair: r.pick(HAIR), shirt: r.pick(shirts), style: r.int(0, 4), glasses: r.chance(0.3) };
}

function Head({ x, y, l }: { x: number; y: number; l: PersonLook }) {
  const ink = shade(l.skin, 0.62);
  return (
    <g>
      <rect x={x - 6} y={y + 12} width="12" height="12" fill={shade(l.skin, 0.12)} />
      {l.style === 2 && <path d={`M${x - 20} ${y} A20 20 0 0 1 ${x + 20} ${y} V${y + 30} H${x - 20}Z`} fill={l.hair} />}
      <circle cx={x} cy={y} r="18" fill={l.skin} />
      {l.style === 0 && <path d={`M${x - 18.6} ${y + 2} A18.6 18.6 0 0 1 ${x + 18.6} ${y + 2} Q${x + 4} ${y - 12} ${x - 18.6} ${y + 2}Z`} fill={l.hair} />}
      {l.style === 1 && (
        <>
          <path d={`M${x - 18.6} ${y} A18.6 18.6 0 0 1 ${x + 18.6} ${y} Q${x} ${y - 10} ${x - 18.6} ${y}Z`} fill={l.hair} />
          <circle cx={x} cy={y - 21} r="8" fill={l.hair} />
        </>
      )}
      {l.style === 2 && <path d={`M${x - 19} ${y + 1} A19 19 0 0 1 ${x + 19} ${y + 1} Q${x} ${y - 14} ${x - 19} ${y + 1}Z`} fill={l.hair} />}
      {l.style === 3 &&
        [-14, -7, 0, 7, 14].map((dx, i) => <circle key={i} cx={x + dx} cy={y - 13 + Math.abs(dx) * 0.45} r="7" fill={l.hair} />)}
      <circle cx={x - 6} cy={y + 1} r="1.9" fill={ink} />
      <circle cx={x + 6} cy={y + 1} r="1.9" fill={ink} />
      <path d={`M${x - 5} ${y + 8} Q${x} ${y + 12} ${x + 5} ${y + 8}`} fill="none" stroke={ink} strokeWidth="1.8" strokeLinecap="round" />
      {l.glasses && (
        <g fill="none" stroke="#2a2733" strokeWidth="1.8">
          <circle cx={x - 6.5} cy={y + 1} r="5" />
          <circle cx={x + 6.5} cy={y + 1} r="5" />
          <path d={`M${x - 1.5} ${y + 1} H${x + 1.5}`} />
        </g>
      )}
    </g>
  );
}

/** Head + shoulders, for people sitting behind a table. `y` = top of the shoulders. */
function Seated({ x, y, l }: { x: number; y: number; l: PersonLook }) {
  return (
    <g>
      <path d={`M${x - 30} ${y + 70} V${y + 22} Q${x - 30} ${y} ${x - 8} ${y} H${x + 8} Q${x + 30} ${y} ${x + 30} ${y + 22} V${y + 70}Z`} fill={l.shirt} />
      <Head x={x} y={y - 26} l={l} />
    </g>
  );
}

/** A standing person with one arm pointing up-right. `y` = top of the shoulders. */
function Pointing({ x, y, l, trousers }: { x: number; y: number; l: PersonLook; trousers: string }) {
  return (
    <g>
      <rect x={x - 15} y={y + 58} width="13" height="62" rx="5" fill={trousers} />
      <rect x={x + 2} y={y + 58} width="13" height="62" rx="5" fill={trousers} />
      <ellipse cx={x - 10} cy={y + 121} rx="11" ry="5" fill={shade(trousers, 0.4)} />
      <ellipse cx={x + 10} cy={y + 121} rx="11" ry="5" fill={shade(trousers, 0.4)} />
      <rect x={x - 37} y={y + 8} width="11" height="50" rx="5.5" fill={shade(l.shirt, 0.12)} transform={`rotate(8 ${x - 31} ${y + 10})`} />
      <path d={`M${x - 26} ${y + 66} V${y + 18} Q${x - 26} ${y} ${x - 6} ${y} H${x + 6} Q${x + 26} ${y} ${x + 26} ${y + 18} V${y + 66}Z`} fill={l.shirt} />
      <g transform={`rotate(-38 ${x + 20} ${y + 10})`}>
        <rect x={x + 16} y={y + 4} width="62" height="12" rx="6" fill={shade(l.shirt, 0.12)} />
        <circle cx={x + 80} cy={y + 10} r="7" fill={l.skin} />
      </g>
      <Head x={x} y={y - 26} l={l} />
    </g>
  );
}

function Plant({ x, y, s, leaf, pot }: { x: number; y: number; s: number; leaf: string; pot: string }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      {[-50, -25, 0, 25, 50].map((a, i) => (
        <ellipse key={i} cx="0" cy="-34" rx="9" ry="28" fill={i % 2 ? leaf : shade(leaf, 0.18)} transform={`rotate(${a} 0 -6)`} />
      ))}
      <path d="M-20 -8 H20 L15 30 H-15Z" fill={pot} />
      <rect x="-22" y="-12" width="44" height="8" rx="3" fill={shade(pot, 0.15)} />
    </g>
  );
}

// ---- scenes ------------------------------------------------------------------

const landscape: SceneFn = (r, p, ids) => {
  const [a0, a1, a2] = p.accents;
  const night = r.chance(p.dark ? 0.55 : 0.22);
  const top = night ? shade(a2, 0.72) : tint(a1, 0.58);
  const bottom = night ? shade(a1, 0.45) : tint(a2, 0.72);
  const back = ridge(r, r.int(2, 3), [70, 120], [140, 170]);
  const front = ridge(r, r.int(2, 4), [120, 160], [175, 200]);
  const sunX = r.between(70, 410);
  const sunY = r.between(55, 95);
  return (
    <>
      <Sky id={ids.g1} top={top} bottom={bottom} />
      {night &&
        Array.from({ length: 26 }, (_, i) => (
          <circle key={i} cx={n1(r.between(0, W))} cy={n1(r.between(0, 150))} r={n1(r.between(0.8, 2))} fill="#fff" opacity={n1(r.between(0.35, 0.95))} />
        ))}
      {night ? (
        <g>
          <circle cx={sunX} cy={sunY} r="26" fill="#fbf4dc" />
          <circle cx={sunX + 11} cy={sunY - 7} r="22" fill={top} />
        </g>
      ) : (
        <g>
          <circle cx={sunX} cy={sunY} r="44" fill={tint(a2, 0.35)} opacity="0.35" />
          <circle cx={sunX} cy={sunY} r="30" fill={tint(a2, 0.15)} />
        </g>
      )}
      {!night && r.chance(0.85) && <Cloud x={r.between(30, 160)} y={r.between(45, 80)} s={r.between(0.7, 1.1)} fill="#fff" />}
      {r.chance(0.6) && <Cloud x={r.between(260, 400)} y={r.between(30, 70)} s={r.between(0.5, 0.9)} fill={night ? tint(top, 0.25) : '#fff'} opacity={night ? 0.5 : 0.92} />}
      <path d={ridgePath(back)} fill={night ? shade(a1, 0.3) : tint(a1, 0.3)} />
      {!night && snowCaps(back).map((d, i) => <path key={i} d={d} fill="#fff" opacity="0.92" />)}
      <path d={ridgePath(front)} fill={night ? shade(a1, 0.52) : a1} />
      <path d={hill(r, r.between(200, 225), r.between(205, 235), 10)} fill={night ? shade(a0, 0.45) : tint(a0, 0.25)} />
      <path d={hill(r, r.between(240, 262), r.between(232, 258), 8)} fill={night ? shade(a0, 0.6) : a0} />
      {r.chance(0.55) && (
        <g fill="none" strokeLinecap="round">
          <path d={`M${n1(r.between(200, 280))} ${H + 6} C170 270 320 250 ${n1(r.between(220, 260))} 222`} stroke={night ? shade(a2, 0.2) : tint(a2, 0.55)} strokeWidth="16" />
          <path d={`M${n1(r.between(200, 280))} ${H + 6} C170 270 320 250 ${n1(r.between(220, 260))} 222`} stroke="#fff" strokeWidth="2" strokeDasharray="7 9" opacity="0.7" />
        </g>
      )}
      {!night && r.chance(0.6) && <Birds r={r} color={shade(a1, 0.55)} count={r.int(2, 3)} x={r.between(180, 330)} y={r.between(60, 110)} />}
    </>
  );
};

const city: SceneFn = (r, p, ids) => {
  const [, a1, a2, a3] = p.accents;
  const night = r.chance(p.dark ? 0.7 : 0.35);
  const top = night ? shade(a1, 0.68) : tint(a3, 0.45);
  const bottom = night ? shade(a3, 0.35) : tint(a2, 0.62);
  const backs: ReactNode[] = [];
  for (let x = -10, i = 0; x < W; i++) {
    const w = r.between(26, 52);
    const h = r.between(80, 175);
    backs.push(<rect key={i} x={n1(x)} y={n1(276 - h)} width={n1(w + 1)} height={n1(h)} fill={mix(a1, bottom, night ? 0.3 : 0.5)} />);
    if (r.chance(0.2)) backs.push(<rect key={`s${i}`} x={n1(x + w / 2 - 2)} y={n1(276 - h - 22)} width="4" height="22" fill={mix(a1, bottom, night ? 0.3 : 0.5)} />);
    x += w;
  }
  const fronts: ReactNode[] = [];
  const body = night ? shade(a1, 0.55) : shade(a1, 0.25);
  const lit = tint(a2, 0.45);
  const dark = shade(body, 0.25);
  for (let x = r.between(-30, -5), i = 0; x < W; i++) {
    const w = r.between(38, 66);
    const h = r.between(55, 150);
    const y = 276 - h;
    const step = r.chance(0.3);
    fronts.push(<rect key={`b${i}`} x={n1(x)} y={n1(y)} width={n1(w)} height={n1(h + 2)} fill={body} />);
    if (step) fronts.push(<rect key={`t${i}`} x={n1(x + w * 0.2)} y={n1(y - 16)} width={n1(w * 0.6)} height="17" fill={body} />);
    if (r.chance(0.25)) {
      fronts.push(<path key={`a${i}`} d={`M${n1(x + w / 2)} ${n1(y - (step ? 16 : 0))} v-20`} stroke={body} strokeWidth="3" />);
      fronts.push(<circle key={`l${i}`} cx={n1(x + w / 2)} cy={n1(y - (step ? 16 : 0) - 21)} r="3" fill={a3} />);
    }
    const cols = Math.max(2, Math.floor((w - 10) / 11));
    const gap = (w - cols * 6) / (cols + 1);
    for (let row = 0; y + 12 + row * 15 < 266; row++) {
      for (let c = 0; c < cols; c++) {
        fronts.push(
          <rect key={`w${i}-${row}-${c}`} x={n1(x + gap + c * (6 + gap))} y={n1(y + 12 + row * 15)} width="6" height="8" rx="1" fill={r.chance(night ? 0.55 : 0.35) ? lit : dark} />,
        );
      }
    }
    x += w + r.between(2, 10);
  }
  return (
    <>
      <Sky id={ids.g1} top={top} bottom={bottom} />
      <circle cx={n1(r.between(80, 400))} cy={n1(r.between(80, 120))} r={n1(r.between(38, 60))} fill={night ? '#f6f0dc' : tint(a2, 0.2)} opacity={night ? 0.9 : 0.85} />
      {!night && <Cloud x={r.between(40, 360)} y={r.between(40, 70)} s={0.8} fill="#fff" opacity={0.75} />}
      {backs}
      {fronts}
      <rect y="274" width={W} height="26" fill={shade(body, 0.35)} />
      {Array.from({ length: 8 }, (_, i) => (
        <rect key={i} x={i * 64 + 14} y="286" width="30" height="3" rx="1.5" fill={tint(a2, 0.5)} opacity="0.8" />
      ))}
    </>
  );
};

const abstract: SceneFn = (r, p) => {
  const [a0, a1, a2, a3] = p.accents;
  const bg = p.dark ? shade(a1, 0.62) : tint(a1, 0.86);
  const dots = { x: r.between(30, 330), y: r.between(30, 200) };
  const plusX = r.between(40, 80);
  return (
    <>
      <rect width={W} height={H} fill={bg} />
      <path d={blob(r, r.between(110, 180), r.between(110, 170), r.between(80, 105))} fill={a0} opacity="0.9" />
      <path d={blob(r, r.between(300, 380), r.between(150, 210), r.between(70, 95))} fill={a1} opacity="0.85" />
      <path d={blob(r, r.between(220, 280), r.between(60, 110), r.between(40, 60), 6)} fill={a2} opacity="0.9" />
      <circle cx={n1(r.between(340, 420))} cy={n1(r.between(60, 100))} r={n1(r.between(26, 40))} fill="none" stroke={p.dark ? tint(a3, 0.3) : shade(a3, 0.1)} strokeWidth="7" />
      <g fill={p.dark ? '#ffffff' : shade(a1, 0.55)} opacity="0.45">
        {Array.from({ length: 24 }, (_, i) => (
          <circle key={i} cx={n1(dots.x + (i % 6) * 14)} cy={n1(dots.y + Math.floor(i / 6) * 14)} r="2.6" />
        ))}
      </g>
      <path
        d={`M${n1(r.between(40, 120))} ${n1(r.between(230, 270))} ${Array.from({ length: 6 }, (_, i) => `q 18 ${i % 2 ? 22 : -22} 36 0`).join(' ')}`}
        fill="none"
        stroke={a3}
        strokeWidth="7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d={`M${n1(r.between(380, 430))} 250 l24 -42 l24 42z`} fill={a3} opacity="0.9" />
      <g stroke={p.dark ? '#ffffff' : shade(a0, 0.3)} strokeWidth="5" strokeLinecap="round">
        <path d={`M${n1(plusX)} 50 v22 M${n1(plusX - 11)} 61 h22`} />
      </g>
    </>
  );
};

const meeting: SceneFn = (r, p) => {
  const [a0, a1, a2, a3] = p.accents;
  const wall = p.dark ? shade(a1, 0.55) : tint(a1, 0.82);
  const floor = p.dark ? shade(a2, 0.5) : tint(a2, 0.55);
  const wood = mix(a2, '#8a5a34', 0.55);
  const count = r.int(3, 4);
  const shirts = [a0, a1, a3, shade(a2, 0.2), tint(a0, 0.35)];
  const xs = count === 3 ? [150, 240, 330] : [125, 205, 285, 365];
  const people = xs.map((x) => ({ x: x + r.between(-8, 8), l: look(r, shirts) }));
  const doodle = r.int(0, 2);
  return (
    <>
      <rect width={W} height={H} fill={wall} />
      <rect y="236" width={W} height="64" fill={floor} />
      <rect x="150" y="22" width="180" height="100" rx="6" fill="#fdfcf8" stroke={shade(wall, 0.25)} strokeWidth="5" />
      {doodle === 0 && (
        <g>
          {[0, 1, 2, 3].map((i) => (
            <rect key={i} x={180 + i * 32} y={102 - (i + 1) * 16} width="20" height={(i + 1) * 16} rx="3" fill={[a0, a1, a3, a2][i]} />
          ))}
          <path d="M178 80 L210 66 L242 72 L290 40" fill="none" stroke={shade(a3, 0.3)} strokeWidth="3" strokeLinecap="round" />
        </g>
      )}
      {doodle === 1 && (
        <g>
          <circle cx="205" cy="72" r="32" fill={a0} />
          <path d="M205 72 L205 40 A32 32 0 0 1 235 83Z" fill={a1} />
          {[0, 1, 2].map((i) => (
            <rect key={i} x="252" y={50 + i * 16} width={44 - i * 10} height="7" rx="3.5" fill={shade(wall, 0.25)} />
          ))}
        </g>
      )}
      {doodle === 2 &&
        [0, 1, 2, 3, 4, 5].map((i) => (
          <rect key={i} x={168 + (i % 3) * 50} y={36 + Math.floor(i / 3) * 40} width="36" height="32" rx="2" fill={tint([a2, a3, a0][i % 3]!, 0.35)} transform={`rotate(${(i * 7) % 9 - 4} ${186 + (i % 3) * 50} ${52 + Math.floor(i / 3) * 40})`} />
        ))}
      {r.chance(0.6) && <rect x="30" y="34" width="80" height="62" rx="4" fill={tint(a1, 0.55)} stroke={shade(wall, 0.2)} strokeWidth="4" />}
      {people.map(({ x, l }, i) => (
        <Seated key={i} x={x} y={150 + r.between(-4, 4)} l={l} />
      ))}
      <rect x="60" y="204" width="360" height="22" rx="6" fill={wood} />
      <rect x="80" y="226" width="12" height="52" fill={shade(wood, 0.3)} />
      <rect x="388" y="226" width="12" height="52" fill={shade(wood, 0.3)} />
      {people.map(({ x }, i) =>
        i % 2 === 0 ? (
          <g key={`t${i}`}>
            <path d={`M${n1(x - 22)} 205 L${n1(x - 18)} 180 H${n1(x + 18)} L${n1(x + 22)} 205Z`} fill="#d5dae5" />
            <circle cx={n1(x)} cy="192" r="3.5" fill="#f4f6fb" />
          </g>
        ) : (
          <g key={`t${i}`}>
            <rect x={n1(x + 6)} y="190" width="13" height="15" rx="2" fill={tint(a3, 0.2)} />
            <path d={`M${n1(x + 19)} 194 q7 0 7 5 q0 5 -7 5`} fill="none" stroke={tint(a3, 0.2)} strokeWidth="2.5" />
          </g>
        ),
      )}
      <Plant x={444} y={252} s={0.9} leaf={mix(a2, '#3f8f4f', 0.7)} pot={a3} />
    </>
  );
};

const presenter: SceneFn = (r, p) => {
  const [a0, a1, a2, a3] = p.accents;
  const wall = p.dark ? shade(a0, 0.6) : tint(a0, 0.84);
  const floor = p.dark ? shade(a1, 0.5) : tint(a1, 0.6);
  const l = look(r, [a1, a3, shade(a2, 0.15)]);
  const bars = Array.from({ length: 4 }, (_, i) => 22 + i * 18 + r.between(-6, 10));
  return (
    <>
      <rect width={W} height={H} fill={wall} />
      <rect y="250" width={W} height="50" fill={floor} />
      <rect x="208" y="30" width="244" height="164" rx="8" fill="#fdfcf8" stroke={shade(wall, 0.3)} strokeWidth="5" />
      <rect x="228" y="48" width="96" height="10" rx="5" fill={shade(wall, 0.3)} />
      {bars.map((h, i) => (
        <rect key={i} x={240 + i * 46} y={n1(176 - h)} width="28" height={n1(h)} rx="4" fill={[a0, a1, a2, a3][i]} />
      ))}
      <path d={`M238 ${n1(150 - bars[0]!)} L300 ${n1(138 - bars[1]!)} L352 ${n1(140 - bars[2]!)} L428 ${n1(118 - bars[3]!)}`} fill="none" stroke={shade(a3, 0.35)} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <path d={`M428 ${n1(118 - bars[3]!)} l-14 0 M428 ${n1(118 - bars[3]!)} l-3 13`} stroke={shade(a3, 0.35)} strokeWidth="4" strokeLinecap="round" />
      <rect x="326" y="194" width="8" height="60" fill={shade(wall, 0.3)} />
      <Pointing x={118} y={134} l={l} trousers={shade(a1, 0.55)} />
      <Plant x={36} y={262} s={0.85} leaf={mix(a2, '#3f8f4f', 0.7)} pot={a0} />
      {r.chance(0.5) && <Sparkle x={196} y={44} s={0.9} fill={a2} />}
    </>
  );
};

const CONTINENTS: ReadonlyArray<readonly Pt[]> = [
  [[58, 62], [108, 44], [160, 48], [178, 78], [152, 104], [140, 130], [118, 152], [98, 140], [84, 110], [58, 96]],
  [[132, 166], [156, 160], [172, 186], [160, 222], [146, 256], [134, 250], [130, 216], [122, 186]],
  [[176, 30], [196, 27], [202, 42], [186, 49]],
  [[224, 60], [250, 50], [272, 58], [266, 82], [246, 92], [228, 86]],
  [[230, 102], [266, 98], [288, 122], [282, 156], [264, 196], [248, 202], [238, 166], [220, 132]],
  [[276, 50], [332, 38], [392, 48], [424, 70], [412, 102], [382, 122], [350, 126], [318, 110], [290, 96], [272, 76]],
  [[378, 190], [410, 181], [432, 196], [426, 216], [398, 224], [382, 211]],
];
const LAND_ANCHORS: readonly Pt[] = [
  [112, 84], [150, 200], [246, 70], [256, 142], [336, 80], [404, 200], [384, 96], [134, 120], [252, 176], [300, 92],
];

const map: SceneFn = (r, p) => {
  const [a0, a1, a2, a3] = p.accents;
  const sea = p.dark ? shade(a1, 0.5) : tint(a1, 0.72);
  const land = p.dark ? tint(a0, 0.12) : mix(a0, '#ffffff', 0.18);
  const pins = r.int(3, 5);
  const anchors: Pt[] = [];
  const pool = LAND_ANCHORS.slice();
  for (let i = 0; i < pins; i++) {
    const at = pool.splice(r.int(0, pool.length - 1), 1)[0]!;
    anchors.push([at[0] + r.between(-6, 6), at[1] + r.between(-6, 6)]);
  }
  const pinColors = [a2, a3, shade(a1, 0.35), a2, a3];
  return (
    <>
      <rect width={W} height={H} fill={sea} />
      <g stroke="#fff" strokeWidth="1.2" opacity="0.35">
        {[50, 100, 150, 200, 250].map((y) => (
          <path key={`h${y}`} d={`M0 ${y} H${W}`} />
        ))}
        {[60, 120, 180, 240, 300, 360, 420].map((x) => (
          <path key={`v${x}`} d={`M${x} 0 V${H}`} />
        ))}
      </g>
      {CONTINENTS.map((pts, i) => (
        <path key={i} d={smooth(pts, true)} fill={land} stroke={tint(land, 0.45)} strokeWidth="2.5" />
      ))}
      <g fill="none" stroke={p.dark ? '#ffffff' : shade(a1, 0.35)} strokeWidth="2.5" strokeDasharray="6 7" strokeLinecap="round" opacity="0.8">
        {anchors.slice(1).map(([x, y], i) => {
          const [px, py] = anchors[i]!;
          return <path key={i} d={`M${n1(px)} ${n1(py - 4)} Q${n1((px + x) / 2)} ${n1(Math.min(py, y) - 50)} ${n1(x)} ${n1(y - 4)}`} />;
        })}
      </g>
      {anchors.map(([x, y], i) => (
        <g key={i}>
          <ellipse cx={n1(x)} cy={n1(y + 1)} rx="7" ry="2.5" fill="#000" opacity="0.18" />
          <path d={`M${n1(x)} ${n1(y)} C${n1(x - 10)} ${n1(y - 12)} ${n1(x - 13)} ${n1(y - 30)} ${n1(x)} ${n1(y - 31)} C${n1(x + 13)} ${n1(y - 30)} ${n1(x + 10)} ${n1(y - 12)} ${n1(x)} ${n1(y)}Z`} fill={pinColors[i]} />
          <circle cx={n1(x)} cy={n1(y - 21)} r="4.5" fill="#fff" />
        </g>
      ))}
      <g transform="translate(46 250)">
        <circle r="20" fill="#fff" opacity="0.85" />
        <path d="M0 -15 L5 0 L0 15 L-5 0Z" fill={shade(a1, 0.3)} />
        <path d="M0 -15 L5 0 H-5Z" fill={a3} />
      </g>
    </>
  );
};

const product: SceneFn = (r, p, ids) => {
  const [a0, a1, a2, a3] = p.accents;
  const shape = r.int(0, 5);
  const c = r.pick([a0, a3, a2]);
  const cy = 148;
  let object: ReactNode;
  switch (shape) {
    case 0:
      object = (
        <>
          <defs>
            <radialGradient id={ids.g2} cx="35%" cy="32%" r="70%">
              <stop offset="0" stopColor={tint(c, 0.55)} />
              <stop offset="1" stopColor={shade(c, 0.35)} />
            </radialGradient>
          </defs>
          <circle cx="240" cy={cy} r="46" fill={`url(#${ids.g2})`} />
        </>
      );
      break;
    case 1:
    case 5: {
      const s = 44;
      object = (
        <g>
          <path d={`M240 ${cy - s} L${240 + s} ${cy - s / 2} L240 ${cy} L${240 - s} ${cy - s / 2}Z`} fill={tint(c, 0.3)} />
          <path d={`M${240 - s} ${cy - s / 2} L240 ${cy} V${cy + s} L${240 - s} ${cy + s / 2}Z`} fill={c} />
          <path d={`M${240 + s} ${cy - s / 2} L240 ${cy} V${cy + s} L${240 + s} ${cy + s / 2}Z`} fill={shade(c, 0.28)} />
          {shape === 5 && (
            <text x={240 - s / 2} y={cy + s / 2 + 10} textAnchor="middle" fontSize="30" fontWeight="800" fill={tint(c, 0.6)}>
              ?
            </text>
          )}
        </g>
      );
      break;
    }
    case 2:
      object = (
        <g transform={`rotate(-24 240 ${cy})`}>
          <rect x="200" y={cy - 22} width="80" height="44" rx="22" fill="#f6f4fb" />
          <path d={`M240 ${cy - 22} H258 A22 22 0 0 1 258 ${cy + 22} H240Z`} fill={c} />
          <rect x="210" y={cy - 14} width="22" height="6" rx="3" fill="#fff" opacity="0.8" />
        </g>
      );
      break;
    case 3:
      object = (
        <g>
          <path d={`M240 ${cy - 58} L282 ${cy + 36} H198Z`} fill={c} />
          <path d={`M240 ${cy - 58} L282 ${cy + 36} H248Z`} fill={shade(c, 0.25)} />
          <ellipse cx="240" cy={cy + 36} rx="42" ry="9" fill={shade(c, 0.35)} />
        </g>
      );
      break;
    default:
      object = (
        <g>
          <path d={`M206 ${cy - 22} L222 ${cy - 44} H258 L274 ${cy - 22} L240 ${cy + 36}Z`} fill={tint(c, 0.2)} />
          <path d={`M206 ${cy - 22} H274 L240 ${cy + 36}Z`} fill={c} />
          <path d={`M222 ${cy - 44} L240 ${cy - 22} L258 ${cy - 44}`} fill="none" stroke={tint(c, 0.6)} strokeWidth="2" />
          <path d={`M240 ${cy - 22} L240 ${cy + 36} L274 ${cy - 22}Z`} fill={shade(c, 0.22)} />
        </g>
      );
  }
  return (
    <>
      <defs>
        <radialGradient id={ids.g1} cx="50%" cy="45%" r="70%">
          <stop offset="0" stopColor={tint(a1, p.dark ? 0.25 : 0.5)} />
          <stop offset="1" stopColor={shade(a1, p.dark ? 0.6 : 0.4)} />
        </radialGradient>
      </defs>
      <rect width={W} height={H} fill={`url(#${ids.g1})`} />
      <path d="M205 0 H275 L340 236 H140Z" fill="#fff" opacity="0.12" />
      <ellipse cx="240" cy="276" rx="150" ry="18" fill="#000" opacity="0.18" />
      <rect x="168" y="200" width="144" height="72" fill="#dcd8e6" />
      <rect x="240" y="200" width="72" height="72" fill="#c8c3d6" />
      <ellipse cx="240" cy="272" rx="72" ry="13" fill="#c8c3d6" />
      <ellipse cx="240" cy="200" rx="72" ry="14" fill="#f1eff7" />
      <ellipse cx="240" cy="200" rx="42" ry="7" fill="#000" opacity="0.16" />
      {object}
      {Array.from({ length: r.int(3, 5) }, (_, i) => (
        <Sparkle key={i} x={r.between(150, 340)} y={r.between(60, 130)} s={r.between(0.5, 1)} fill="#fff" />
      ))}
      {r.chance(0.5) && (
        <g transform={`translate(${n1(r.between(360, 410))} ${n1(r.between(60, 90))}) rotate(14)`}>
          <circle r="30" fill={a2} />
          <circle r="25" fill="none" stroke="#fff" strokeWidth="2" strokeDasharray="3 4" />
          <text y="7" textAnchor="middle" fontSize="19" fontWeight="800" fill="#fff" fontFamily="var(--font-display, sans-serif)">
            NEW
          </text>
        </g>
      )}
    </>
  );
};

const rocket: SceneFn = (r, p, ids) => {
  const [a0, a1, a2, a3] = p.accents;
  const angle = r.between(18, 38);
  const planetLeft = r.chance(0.5);
  const px = planetLeft ? r.between(40, 90) : r.between(390, 440);
  const py = r.between(200, 250);
  return (
    <>
      <Sky id={ids.g1} top={shade(a2, 0.8)} bottom={shade(a1, 0.5)} />
      {Array.from({ length: 34 }, (_, i) => (
        <circle key={i} cx={n1(r.between(0, W))} cy={n1(r.between(0, H))} r={n1(r.between(0.8, 2.2))} fill="#fff" opacity={n1(r.between(0.3, 0.95))} />
      ))}
      <g>
        <circle cx={n1(px)} cy={n1(py)} r="54" fill={a3} />
        <circle cx={n1(px - 16)} cy={n1(py - 12)} r="9" fill={shade(a3, 0.2)} />
        <circle cx={n1(px + 18)} cy={n1(py + 14)} r="6" fill={shade(a3, 0.2)} />
        <ellipse cx={n1(px)} cy={n1(py)} rx="86" ry="16" fill="none" stroke={tint(a2, 0.35)} strokeWidth="6" transform={`rotate(-18 ${n1(px)} ${n1(py)})`} />
      </g>
      <g transform={`translate(232 150) rotate(${n1(angle)})`}>
        {[0, 1, 2, 3].map((i) => (
          <circle key={i} cx={n1(r.between(-14, 14))} cy={70 + i * 26} r={12 + i * 7} fill="#fff" opacity={0.85 - i * 0.16} />
        ))}
        <path d="M-12 48 Q0 112 12 48Z" fill={a2} />
        <path d="M-6 48 Q0 84 6 48Z" fill={tint(a2, 0.6)} />
        <path d="M-22 12 L-46 52 L-20 44Z" fill={a0} />
        <path d="M22 12 L46 52 L20 44Z" fill={a0} />
        <path d="M0 -84 C28 -54 30 0 22 44 H-22 C-30 0 -28 -54 0 -84Z" fill="#f4f2f9" />
        <path d="M0 -84 C14 -70 21 -56 25 -42 H-25 C-21 -56 -14 -70 0 -84Z" fill={a0} />
        <path d="M2 -82 C24 -50 26 0 20 44 H8 C14 0 12 -50 2 -82Z" fill="#000" opacity="0.07" />
        <circle cy="-10" r="13" fill={tint(a1, 0.4)} stroke={shade(a1, 0.25)} strokeWidth="5" />
        <path d="M-5 -15 a7 7 0 0 1 8 -3" stroke="#fff" strokeWidth="2.5" fill="none" strokeLinecap="round" />
        <rect x="-15" y="42" width="30" height="8" rx="2" fill="#8d8a99" />
        <path d="M0 40 V20" stroke={a0} strokeWidth="5" />
        <g stroke="#fff" strokeWidth="2.5" strokeLinecap="round" opacity="0.4">
          <path d="M-34 64 V100 M34 64 V96 M-60 22 V48 M60 22 V44" />
        </g>
      </g>
    </>
  );
};

function gear(cx: number, cy: number, R: number, teeth: number): string {
  const pts: string[] = [];
  const steps = teeth * 4;
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const rr = i % 4 < 2 ? R : R * 0.78;
    pts.push(`${n1(cx + Math.cos(a) * rr)} ${n1(cy + Math.sin(a) * rr)}`);
  }
  return `M${pts.join(' L')}Z`;
}

const lightbulb: SceneFn = (r, p, ids) => {
  const [a0, a1, a2, a3] = p.accents;
  const bg = p.dark ? shade(a1, 0.62) : tint(a1, 0.8);
  const cx = 240;
  const cy = 120;
  const rays = 12;
  return (
    <>
      <rect width={W} height={H} fill={bg} />
      <defs>
        <radialGradient id={ids.g1}>
          <stop offset="0" stopColor={tint(a2, 0.4)} stopOpacity="0.85" />
          <stop offset="1" stopColor={tint(a2, 0.4)} stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx={cx} cy={cy} r="118" fill={`url(#${ids.g1})`} />
      <g stroke={a2} strokeWidth="7" strokeLinecap="round">
        {Array.from({ length: rays }, (_, i) => {
          const a = (i / rays) * Math.PI * 2 - Math.PI / 2;
          const r0 = 78;
          const r1 = i % 2 ? 98 : 112;
          return <path key={i} d={`M${n1(cx + Math.cos(a) * r0)} ${n1(cy + Math.sin(a) * r0)} L${n1(cx + Math.cos(a) * r1)} ${n1(cy + Math.sin(a) * r1)}`} opacity={i > 3 && i < 9 && i !== 6 ? 0 : 1} />;
        })}
      </g>
      <path d={`M205 150 A54 54 0 1 1 275 150 C268 160 266 168 266 178 H214 C214 168 212 160 205 150Z`} fill={tint(a2, 0.6)} stroke={shade(a2, 0.2)} strokeWidth="4" />
      <path d="M222 165 L228 128 L236 142 L244 128 L252 142 L258 128 L258 165" fill="none" stroke={shade(a2, 0.45)} strokeWidth="3.2" strokeLinejoin="round" strokeLinecap="round" />
      <path d="M212 96 A36 36 0 0 1 236 78" fill="none" stroke="#fff" strokeWidth="6" strokeLinecap="round" opacity="0.75" />
      {[0, 1, 2].map((i) => (
        <rect key={i} x={216 + i * 2} y={180 + i * 10} width={48 - i * 4} height="9" rx="4.5" fill={i % 2 ? '#c4c9d6' : '#9aa1b4'} />
      ))}
      <path d="M232 210 H248 L244 218 H236Z" fill="#7e8599" />
      <path d={gear(r.between(90, 120), r.between(80, 120), 30, 8)} fill={a0} />
      <path d={gear(r.between(360, 390), r.between(170, 210), 24, 7)} fill={a3} />
      {Array.from({ length: 3 }, (_, i) => (
        <Sparkle key={i} x={r.between(60, 420)} y={r.between(30, 270)} s={r.between(0.5, 0.9)} fill={p.dark ? '#fff' : shade(a1, 0.3)} />
      ))}
      <g stroke={p.dark ? '#fff' : a0} strokeWidth="4" strokeLinecap="round">
        <path d={`M${n1(r.between(350, 400))} 60 v18 m-9 -9 h18`} />
      </g>
    </>
  );
};

const forest: SceneFn = (r, p, ids) => {
  const [a0, a1, a2] = p.accents;
  const green = mix(a0, '#2f7d4a', 0.55);
  const trunk = '#7a4f33';
  const trees = Array.from({ length: r.int(8, 12) }, () => ({
    x: r.between(-10, 490),
    y: r.between(220, 290),
    s: r.between(0.65, 1.15),
    kind: r.chance(0.55) ? 0 : 1,
  })).sort((a, b) => a.y - b.y);
  return (
    <>
      <Sky id={ids.g1} top={p.dark ? shade(a1, 0.55) : tint(a1, 0.6)} bottom={p.dark ? shade(a2, 0.3) : tint(a2, 0.75)} />
      <circle cx={n1(r.between(80, 400))} cy={n1(r.between(60, 90))} r="30" fill={tint(a2, 0.2)} />
      <path d={hill(r, r.between(150, 180), r.between(140, 175), 16)} fill={mix(green, '#ffffff', p.dark ? 0.15 : 0.45)} />
      <path d={hill(r, r.between(195, 215), r.between(190, 220), 12)} fill={mix(green, '#ffffff', p.dark ? 0.05 : 0.22)} />
      <rect y="250" width={W} height="50" fill={shade(green, 0.15)} />
      {trees.map((t, i) => {
        const depth = (t.y - 220) / 70;
        const leaf = mix(tint(green, 0.2), shade(green, 0.3), depth);
        return t.kind === 0 ? (
          <g key={i} transform={`translate(${n1(t.x)} ${n1(t.y)}) scale(${n1(t.s * 100) / 100})`}>
            <rect x="-4" y="-14" width="8" height="16" fill={trunk} />
            <path d="M0 -94 L22 -50 H-22Z M0 -72 L28 -28 H-28Z M0 -50 L34 -10 H-34Z" fill={leaf} />
          </g>
        ) : (
          <g key={i} transform={`translate(${n1(t.x)} ${n1(t.y)}) scale(${n1(t.s * 100) / 100})`}>
            <rect x="-4.5" y="-30" width="9" height="32" rx="2" fill={trunk} />
            <circle cx="0" cy="-52" r="26" fill={leaf} />
            <circle cx="-16" cy="-38" r="16" fill={leaf} />
            <circle cx="15" cy="-40" r="17" fill={shade(leaf, 0.08)} />
          </g>
        );
      })}
      <Birds r={r} color={shade(a1, 0.5)} count={r.int(2, 4)} x={r.between(150, 320)} y={r.between(70, 110)} />
    </>
  );
};

const ocean: SceneFn = (r, p, ids) => {
  const [a0, a1, a2, a3] = p.accents;
  const sunset = r.chance(0.5);
  const top = sunset ? tint(a3, 0.45) : tint(a1, 0.62);
  const bottom = sunset ? tint(a2, 0.6) : tint(a1, 0.88);
  const sunX = r.between(90, 390);
  const wave = (y: number, amp: number): string => {
    const pts: Pt[] = Array.from({ length: 9 }, (_, i) => [-20 + i * 65, y + (i % 2 ? -amp : amp) * r.between(0.6, 1)]);
    return `${smooth(pts, false)} L${W + 20} ${H} L-20 ${H}Z`;
  };
  const boatX = r.between(110, 360);
  return (
    <>
      <Sky id={ids.g1} top={p.dark ? shade(top, 0.45) : top} bottom={p.dark ? shade(bottom, 0.3) : bottom} />
      <circle cx={n1(sunX)} cy="150" r="36" fill={tint(a2, 0.2)} />
      <Cloud x={r.between(40, 300)} y={r.between(40, 80)} s={r.between(0.6, 0.9)} fill="#fff" opacity={0.85} />
      <path d={wave(160, 4)} fill={tint(a1, 0.3)} />
      <g fill="#fff" opacity="0.55">
        {[0, 1, 2].map((i) => (
          <rect key={i} x={n1(sunX - 30 + i * 8)} y={172 + i * 10} width={60 - i * 16} height="3" rx="1.5" />
        ))}
      </g>
      {r.chance(0.5) && (
        <g transform={`translate(${sunX > 240 ? 70 : 400} 170)`}>
          <ellipse cx="0" cy="6" rx="44" ry="12" fill={tint(a2, 0.35)} />
          <path d="M2 4 C4 -18 10 -34 20 -48" fill="none" stroke="#7a4f33" strokeWidth="5" strokeLinecap="round" />
          {[-60, -20, 20, 60, 100].map((a, i) => (
            <ellipse key={i} cx="20" cy="-48" rx="20" ry="6" fill={mix(a0, '#2f7d4a', 0.6)} transform={`rotate(${a} 20 -48) translate(14 0)`} />
          ))}
        </g>
      )}
      <path d={wave(196, 7)} fill={a1} />
      <g transform={`translate(${n1(boatX)} 192)`}>
        <path d="M0 -70 V-4" stroke="#5c4a3d" strokeWidth="3" />
        <path d="M3 -68 L40 -12 H3Z" fill="#fff" />
        <path d="M-3 -58 L-30 -12 H-3Z" fill={tint(a0, 0.25)} />
        <path d="M-40 -6 H44 L32 12 H-28Z" fill={shade(a3, 0.2)} />
      </g>
      <path d={wave(232, 9)} fill={shade(a1, 0.2)} />
      <path d={wave(266, 8)} fill={shade(a1, 0.38)} />
      <Birds r={r} color={shade(a1, 0.5)} count={r.int(2, 3)} x={r.between(200, 360)} y={r.between(70, 110)} />
    </>
  );
};

const SCENE_FNS: Record<SceneKind, SceneFn> = {
  landscape,
  city,
  abstract,
  meeting,
  presenter,
  map,
  product,
  rocket,
  lightbulb,
  forest,
  ocean,
};

const SCENE_LABEL: Record<SceneKind, string> = {
  landscape: 'Illustration: mountains and hills',
  city: 'Illustration: a city skyline',
  abstract: 'Illustration: abstract shapes',
  meeting: 'Illustration: people around a meeting table',
  presenter: 'Illustration: someone pointing at a chart',
  map: 'Illustration: a world map with pins',
  product: 'Illustration: a mysterious product on a pedestal',
  rocket: 'Illustration: a rocket launching',
  lightbulb: 'Illustration: a glowing lightbulb',
  forest: 'Illustration: a forest',
  ocean: 'Illustration: a sailboat at sea',
};

export function Picture({ scene, seed, palette, className }: { scene: SceneKind; seed: number; palette: Palette; className?: string }) {
  const ids = useSvgIds('ssk-pic', ['clip', 'g1', 'g2', 'g3'] as const);
  const draw = SCENE_FNS[scene] ?? abstract;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={className} role="img" aria-label={SCENE_LABEL[scene] ?? 'Illustration'}>
      <defs>
        <clipPath id={ids.clip}>
          <rect width={W} height={H} rx="16" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${ids.clip})`}>{draw(rand(seed), palette, ids)}</g>
    </svg>
  );
}
