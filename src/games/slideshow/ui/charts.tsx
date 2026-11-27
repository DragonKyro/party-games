import { useSvgIds } from '@/ui/shared/svg';
import type { ChartSpec, DiagramSpec, Palette } from '../deck';
import { mix, onColor, tint } from './color';

// ============================================================================
// Hand-rolled SVG charts and diagrams for slides (no chart library).
// viewBox 640×340; text inherits the slide's type face and scales with it.
// Marks follow the deck palette; text stays in ink / muted tones.
// ============================================================================

const VW = 640;
const VH = 340;
const n1 = (v: number) => Math.round(v * 10) / 10;

/** Greedy word wrap into at most `maxLines` lines of ~`width` characters. */
export function wrapText(text: string, width: number, maxLines = 2): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    if (!line) line = w;
    else if ((line + ' ' + w).length <= width) line += ` ${w}`;
    else {
      lines.push(line);
      line = w;
    }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = `${kept[maxLines - 1]!.replace(/[.,;:]$/, '')}…`;
    return kept;
  }
  return lines;
}

function Lines({
  x,
  y,
  lines,
  size,
  lineHeight = 1.15,
  anchor = 'middle',
  fill,
  weight = 600,
  middle = false,
}: {
  x: number;
  y: number;
  lines: string[];
  size: number;
  lineHeight?: number;
  anchor?: 'start' | 'middle' | 'end';
  fill: string;
  weight?: number;
  /** Centre the block vertically on y (else y is the first baseline). */
  middle?: boolean;
}) {
  const lh = size * lineHeight;
  const y0 = middle ? y - ((lines.length - 1) * lh) / 2 + size * 0.35 : y;
  return (
    <text x={n1(x)} y={n1(y0)} textAnchor={anchor} fontSize={size} fontWeight={weight} fill={fill}>
      {lines.map((l, i) => (
        <tspan key={i} x={n1(x)} dy={i === 0 ? 0 : n1(lh)}>
          {l}
        </tspan>
      ))}
    </text>
  );
}

/** Largest font size (≤ max) at which every line fits in `width` units. */
export function fitSize(lines: readonly string[], width: number, max: number, min = 12): number {
  const longest = Math.max(1, ...lines.map((l) => l.length));
  return Math.round(Math.max(min, Math.min(max, width / (longest * 0.58))));
}

function niceMax(v: number): number {
  for (const c of [10, 20, 25, 40, 50, 60, 80, 100, 120, 150, 200, 250]) if (c >= v * 1.08) return c;
  return Math.ceil((v * 1.1) / 50) * 50;
}

const fmt = (v: number, unit: string) => `${v}${unit}`;

// ---- charts ------------------------------------------------------------------------

export function Chart({ chart, palette }: { chart: ChartSpec; palette: Palette }) {
  if (chart.type === 'pie' || chart.type === 'donut') return <Pie chart={chart} palette={palette} />;
  return <Cartesian chart={chart} palette={palette} />;
}

function Cartesian({ chart, palette }: { chart: ChartSpec; palette: Palette }) {
  const left = chart.axis ? 92 : 64;
  const right = VW - 18;
  const top = 34;
  const bottom = 262;
  const values = chart.points.map((p) => p.value);
  const max = niceMax(Math.max(1, ...values));
  const y = (v: number) => bottom - (v / max) * (bottom - top);
  const n = chart.points.length;
  const color = palette.accents[0];
  const grid = palette.muted;
  const ticks = [0, max / 2, max];

  const axes = (
    <g>
      {ticks.map((t) => (
        <g key={t}>
          <path d={`M${left} ${n1(y(t))} H${right}`} stroke={grid} strokeOpacity={t === 0 ? 0.7 : 0.25} strokeWidth={t === 0 ? 1.5 : 1} />
          <text x={left - 10} y={n1(y(t) + 5)} textAnchor="end" fontSize="17" fill={palette.muted} style={{ fontVariantNumeric: 'tabular-nums' }}>
            {fmt(Math.round(t), chart.unit)}
          </text>
        </g>
      ))}
      {chart.axis && (
        <text
          x="20"
          y={n1((top + bottom) / 2)}
          transform={`rotate(-90 20 ${n1((top + bottom) / 2)})`}
          textAnchor="middle"
          fontSize="18"
          fontWeight="700"
          fill={palette.muted}
          dominantBaseline="middle"
        >
          {chart.axis}
        </text>
      )}
    </g>
  );

  if (chart.type === 'bar') {
    const band = (right - left) / n;
    const w = Math.min(68, band * 0.58);
    const rad = 7;
    const labels = chart.points.map((p) => wrapText(p.label, n > 4 ? 9 : 12));
    const labelSize = Math.min(...labels.map((l) => fitSize(l, band * 0.94, n > 4 ? 19 : 21, 13)));
    return (
      <svg viewBox={`0 0 ${VW} ${VH}`} role="img" aria-label={`Bar chart: ${chart.points.map((p) => `${p.label} ${fmt(p.value, chart.unit)}`).join(', ')}`}>
        {axes}
        {chart.points.map((p, i) => {
          const x = left + band * i + (band - w) / 2;
          const top0 = y(p.value);
          const r = Math.min(rad, (bottom - top0) / 2);
          return (
            <g key={i}>
              <path
                d={`M${n1(x)} ${bottom} V${n1(top0 + r)} Q${n1(x)} ${n1(top0)} ${n1(x + r)} ${n1(top0)} H${n1(x + w - r)} Q${n1(x + w)} ${n1(top0)} ${n1(x + w)} ${n1(top0 + r)} V${bottom}Z`}
                fill={color}
              />
              <text x={n1(x + w / 2)} y={n1(top0 - 10)} textAnchor="middle" fontSize="22" fontWeight="800" fill={palette.ink}>
                {fmt(p.value, chart.unit)}
              </text>
              <Lines x={x + w / 2} y={bottom + 26} lines={labels[i]!} size={labelSize} fill={palette.ink} />
            </g>
          );
        })}
      </svg>
    );
  }

  // Line chart.
  const inset = 26;
  const x = (i: number) => left + inset + (n === 1 ? 0 : (i / (n - 1)) * (right - left - inset * 2));
  const pts = chart.points.map((p, i) => [x(i), y(p.value)] as const);
  const line = pts.map(([px, py], i) => `${i === 0 ? 'M' : 'L'}${n1(px)} ${n1(py)}`).join(' ');
  const last = pts[pts.length - 1]!;
  return (
    <svg viewBox={`0 0 ${VW} ${VH}`} role="img" aria-label={`Line chart: ${chart.points.map((p) => `${p.label} ${fmt(p.value, chart.unit)}`).join(', ')}`}>
      {axes}
      <path d={`${line} L${n1(last[0])} ${bottom} L${n1(pts[0]![0])} ${bottom}Z`} fill={color} opacity="0.12" />
      <path d={line} fill="none" stroke={color} strokeWidth="4" strokeLinejoin="round" strokeLinecap="round" />
      {pts.map(([px, py], i) => (
        <circle key={i} cx={n1(px)} cy={n1(py)} r={i === n - 1 ? 9 : 6.5} fill={color} stroke={palette.bg} strokeWidth="3" />
      ))}
      <text x={n1(last[0])} y={n1(last[1] - 18)} textAnchor="middle" fontSize="24" fontWeight="800" fill={palette.ink}>
        {fmt(chart.points[n - 1]!.value, chart.unit)}
      </text>
      {chart.points.map((p, i) => (
        <text key={i} x={n1(x(i))} y={bottom + 30} textAnchor="middle" fontSize="20" fontWeight="600" fill={palette.ink}>
          {p.label}
        </text>
      ))}
    </svg>
  );
}

function arc(cx: number, cy: number, r: number, a0: number, a1: number): [number, number, number, number] {
  return [cx + Math.cos(a0) * r, cy + Math.sin(a0) * r, cx + Math.cos(a1) * r, cy + Math.sin(a1) * r];
}

function Pie({ chart, palette }: { chart: ChartSpec; palette: Palette }) {
  const cx = 168;
  const cy = 170;
  const R = 132;
  const inner = chart.type === 'donut' ? R * 0.58 : 0;
  const total = chart.points.reduce((s, p) => s + p.value, 0) || 1;
  let a = -Math.PI / 2;
  const slices = chart.points.map((p, i) => {
    const sweep = (p.value / total) * Math.PI * 2;
    const a0 = a;
    const a1 = a + sweep;
    a = a1;
    const large = sweep > Math.PI ? 1 : 0;
    const [x0, y0, x1, y1] = arc(cx, cy, R, a0, a1);
    let d: string;
    if (inner > 0) {
      const [ix0, iy0, ix1, iy1] = arc(cx, cy, inner, a0, a1);
      d = `M${n1(x0)} ${n1(y0)} A${R} ${R} 0 ${large} 1 ${n1(x1)} ${n1(y1)} L${n1(ix1)} ${n1(iy1)} A${n1(inner)} ${n1(inner)} 0 ${large} 0 ${n1(ix0)} ${n1(iy0)}Z`;
    } else {
      d = `M${cx} ${cy} L${n1(x0)} ${n1(y0)} A${R} ${R} 0 ${large} 1 ${n1(x1)} ${n1(y1)}Z`;
    }
    return <path key={i} d={d} fill={palette.accents[i % 4]} stroke={palette.bg} strokeWidth="3" strokeLinejoin="round" />;
  });
  const top = chart.points[0]!;
  const n = chart.points.length;
  const rowH = 62;
  const y0 = cy - ((n - 1) * rowH) / 2;
  return (
    <svg viewBox={`0 0 ${VW} ${VH}`} role="img" aria-label={`${chart.type === 'donut' ? 'Donut' : 'Pie'} chart: ${chart.points.map((p) => `${p.label} ${p.value}%`).join(', ')}`}>
      {slices}
      {inner > 0 && (
        <>
          <text x={cx} y={cy + 6} textAnchor="middle" fontSize="44" fontWeight="800" fill={palette.ink}>
            {fmt(top.value, chart.unit)}
          </text>
          <Lines x={cx} y={cy + 34} lines={wrapText(top.label, 12, 1)} size={16} fill={palette.muted} />
        </>
      )}
      {chart.points.map((p, i) => (
        <g key={i} transform={`translate(346 ${n1(y0 + i * rowH)})`}>
          <rect x="0" y="-13" width="24" height="24" rx="6" fill={palette.accents[i % 4]} />
          <text x="38" y="8" fontSize={fitSize([p.label], 178, 25, 15)} fontWeight="600" fill={palette.ink}>
            {p.label}
          </text>
          <text x="280" y="8" textAnchor="end" fontSize="25" fontWeight="800" fill={palette.ink} style={{ fontVariantNumeric: 'tabular-nums' }}>
            {fmt(p.value, chart.unit)}
          </text>
        </g>
      ))}
    </svg>
  );
}

// ---- diagrams ----------------------------------------------------------------------

/** A cycle step: one big line, or two smaller ones when it is long. */
function CycleLabel({ x, y, w, text, fill }: { x: number; y: number; w: number; text: string; fill: string }) {
  const one = wrapText(text, 12, 1);
  if (!one[0]!.endsWith('…')) return <Lines x={x} y={y} lines={one} size={fitSize(one, w - 24, 23)} fill={fill} weight={800} middle />;
  const two = wrapText(text, 14, 2);
  return <Lines x={x} y={y} lines={two} size={fitSize(two, w - 24, 18)} lineHeight={1.05} fill={fill} weight={800} middle />;
}


export function Diagram({ diagram, palette }: { diagram: DiagramSpec; palette: Palette }) {
  const ids = useSvgIds('ssk-dia', ['arrow'] as const);
  const [a0, a1, a2, a3] = palette.accents;
  const accents = [a0, a1, a2, a3];
  const arrowColor = palette.muted;
  const marker = (
    <defs>
      <marker id={ids.arrow} viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
        <path d="M0 0 L10 5 L0 10z" fill={arrowColor} />
      </marker>
    </defs>
  );

  switch (diagram.type) {
    case 'venn': {
      const three = diagram.sets.length >= 3;
      const circles = three
        ? [
            { x: 262, y: 132, label: [196, 104] },
            { x: 378, y: 132, label: [444, 104] },
            { x: 320, y: 228, label: [320, 280] },
          ]
        : [
            { x: 248, y: 170, label: [188, 170] },
            { x: 392, y: 170, label: [452, 170] },
          ];
      const r = three ? 104 : 128;
      const blend = palette.dark ? 'screen' : 'multiply';
      return (
        <svg viewBox={`0 0 ${VW} ${VH}`} role="img" aria-label={`Venn diagram: ${diagram.sets.join(', ')}; overlap: ${diagram.center}`}>
          <g style={{ isolation: 'isolate' }}>
            {circles.map((c, i) => (
              <circle key={i} cx={c.x} cy={c.y} r={r} fill={accents[i]} opacity={palette.dark ? 0.55 : 0.5} style={{ mixBlendMode: blend }} />
            ))}
          </g>
          {circles.map((c, i) => (
            <Lines key={i} x={c.label[0]!} y={c.label[1]!} lines={wrapText(diagram.sets[i] ?? '', 10)} size={fitSize(wrapText(diagram.sets[i] ?? '', 10), three ? 112 : 128, three ? 24 : 27)} fill={palette.ink} weight={700} middle />
          ))}
          <Lines x={320} y={three ? 168 : 170} lines={wrapText(diagram.center, 9)} size={fitSize(wrapText(diagram.center, 9), three ? 66 : 86, three ? 19 : 24)} fill={palette.ink} weight={800} middle />
        </svg>
      );
    }

    case 'cycle': {
      const n = diagram.steps.length;
      const cx = 320;
      const cy = 170;
      const rx = n >= 5 ? 236 : 206;
      const ry = 120;
      const w = n >= 5 ? 150 : 172;
      const h = 62;
      const pos = diagram.steps.map((_, i) => {
        const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
        return [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry] as const;
      });
      return (
        <svg viewBox={`0 0 ${VW} ${VH}`} role="img" aria-label={`Cycle: ${diagram.steps.join(' → ')} → back to the start`}>
          {marker}
          <g fill="none" stroke={arrowColor} strokeWidth="3" strokeLinecap="round">
            {pos.map(([x0, y0], i) => {
              const [x1, y1] = pos[(i + 1) % n]!;
              const t = n >= 5 ? 0.34 : 0.3;
              const sx = x0 + (x1 - x0) * t;
              const sy = y0 + (y1 - y0) * t;
              const ex = x0 + (x1 - x0) * (1 - t);
              const ey = y0 + (y1 - y0) * (1 - t);
              const mx = (sx + ex) / 2;
              const my = (sy + ey) / 2;
              const ox = (mx - cx) * 0.22;
              const oy = (my - cy) * 0.22;
              return <path key={i} d={`M${n1(sx)} ${n1(sy)} Q${n1(mx + ox)} ${n1(my + oy)} ${n1(ex)} ${n1(ey)}`} markerEnd={`url(#${ids.arrow})`} />;
            })}
          </g>
          {pos.map(([x, y], i) => {
            const fill = accents[i % 4]!;
            return (
              <g key={i}>
                <rect x={n1(x - w / 2)} y={n1(y - h / 2)} width={w} height={h} rx={h / 2} fill={fill} />
                <CycleLabel x={x} y={y} w={w} text={diagram.steps[i]!} fill={onColor(fill)} />
              </g>
            );
          })}
        </svg>
      );
    }

    case 'pyramid': {
      const n = diagram.levels.length;
      const apex = 22;
      const base = 318;
      const half = 236;
      const cx = 320;
      const hw = (yy: number) => (half * (yy - apex)) / (base - apex);
      const bandH = (base - apex) / n;
      return (
        <svg viewBox={`0 0 ${VW} ${VH}`} role="img" aria-label={`Pyramid, top to bottom: ${diagram.levels.join(', ')}`}>
          {diagram.levels.map((label, i) => {
            const y0 = apex + i * bandH + (i === 0 ? 0 : 3);
            const y1 = apex + (i + 1) * bandH - 3;
            const fill = accents[i % 4]!;
            const d =
              i === 0
                ? `M${cx} ${n1(y0)} L${n1(cx + hw(y1))} ${n1(y1)} H${n1(cx - hw(y1))}Z`
                : `M${n1(cx - hw(y0))} ${n1(y0)} H${n1(cx + hw(y0))} L${n1(cx + hw(y1))} ${n1(y1)} H${n1(cx - hw(y1))}Z`;
            const ty = i === 0 ? y0 + (y1 - y0) * 0.7 : (y0 + y1) / 2;
            const lines = wrapText(label, i === 0 ? 9 : 18, i === 0 ? 2 : 1);
            return (
              <g key={i}>
                <path d={d} fill={fill} strokeLinejoin="round" />
                <Lines x={cx} y={ty} lines={lines} size={fitSize(lines, Math.max(40, 2 * hw(i === 0 ? ty + 6 : y0) - 24), i === 0 ? 18 : 24)} fill={onColor(fill)} weight={800} middle />
              </g>
            );
          })}
        </svg>
      );
    }

    case 'matrix': {
      const x0 = 104;
      const x1 = 612;
      const y0 = 14;
      const y1 = 284;
      const mx = (x0 + x1) / 2;
      const my = (y0 + y1) / 2;
      const quadFill = (i: number) => mix(palette.surface, accents[i]!, palette.dark ? 0.18 : 0.12);
      const q = diagram.quadrants;
      return (
        <svg viewBox={`0 0 ${VW} ${VH}`} role="img" aria-label={`2 by 2 matrix, ${diagram.x} across, ${diagram.y} up. Quadrants: ${q.join(', ')}. Plotted: ${diagram.dots.map((d) => d.label).join(', ')}`}>
          {marker}
          <rect x={x0} y={y0} width={mx - x0 - 2} height={my - y0 - 2} rx="8" fill={quadFill(0)} />
          <rect x={mx + 2} y={y0} width={x1 - mx - 2} height={my - y0 - 2} rx="8" fill={quadFill(1)} />
          <rect x={x0} y={my + 2} width={mx - x0 - 2} height={y1 - my - 2} rx="8" fill={quadFill(2)} />
          <rect x={mx + 2} y={my + 2} width={x1 - mx - 2} height={y1 - my - 2} rx="8" fill={quadFill(3)} />
          <g fontSize="20" fontWeight="700" fill={palette.muted}>
            <text x={x0 + 14} y={y0 + 30}>{q[0]}</text>
            <text x={x1 - 14} y={y0 + 30} textAnchor="end">{q[1]}</text>
            <text x={x0 + 14} y={y1 - 14}>{q[2]}</text>
            <text x={x1 - 14} y={y1 - 14} textAnchor="end">{q[3]}</text>
          </g>
          <g stroke={arrowColor} strokeWidth="2.5">
            <path d={`M${x0} ${y1 + 16} H${x1 - 4}`} markerEnd={`url(#${ids.arrow})`} />
            <path d={`M${x0 - 16} ${y1} V${y0 + 4}`} markerEnd={`url(#${ids.arrow})`} />
          </g>
          <text x={mx} y={y1 + 46} textAnchor="middle" fontSize="22" fontWeight="800" fill={palette.ink}>
            {diagram.x}
          </text>
          <text x={x0 - 40} y={my} transform={`rotate(-90 ${x0 - 40} ${my})`} textAnchor="middle" fontSize="22" fontWeight="800" fill={palette.ink}>
            {diagram.y}
          </text>
          {diagram.dots.map((d, i) => {
            const cx = x0 + d.x * (x1 - x0);
            const cy = y1 - d.y * (y1 - y0);
            const flip = cx > x1 - 160;
            return (
              <g key={i}>
                <circle cx={n1(cx)} cy={n1(cy)} r="12" fill={accents[i % 4]} stroke={palette.bg} strokeWidth="3" />
                <text x={n1(flip ? cx - 20 : cx + 20)} y={n1(cy + 7)} textAnchor={flip ? 'end' : 'start'} fontSize="23" fontWeight="800" fill={palette.ink}>
                  {d.label}
                </text>
              </g>
            );
          })}
        </svg>
      );
    }

    case 'flow': {
      const n = diagram.steps.length;
      const gap = 50;
      const left = 12;
      const w = (VW - left * 2 - gap * (n - 1)) / n;
      const h = 136;
      const y = 170 - h / 2;
      const chars = Math.max(7, Math.floor(w / 15));
      return (
        <svg viewBox={`0 0 ${VW} ${VH}`} role="img" aria-label={`Flow: ${diagram.steps.join(' → ')}`}>
          {marker}
          {diagram.steps.map((label, i) => {
            const x = left + i * (w + gap);
            const lastBox = i === n - 1;
            const fill = lastBox ? a0 : palette.surface;
            return (
              <g key={i}>
                <rect x={n1(x)} y={y} width={n1(w)} height={h} rx="16" fill={fill} stroke={lastBox ? 'none' : tint(a0, palette.dark ? 0 : 0.1)} strokeWidth="3" />
                <Lines x={x + w / 2} y={170} lines={wrapText(label, chars, 3)} size={fitSize(wrapText(label, chars, 3), w - 18, 25)} fill={lastBox ? onColor(fill) : palette.ink} weight={800} middle />
                {!lastBox && (
                  <path d={`M${n1(x + w + 8)} 170 H${n1(x + w + gap - 10)}`} stroke={arrowColor} strokeWidth="3.5" markerEnd={`url(#${ids.arrow})`} />
                )}
              </g>
            );
          })}
        </svg>
      );
    }
  }
}
