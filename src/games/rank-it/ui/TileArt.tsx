import type { TileArtProps } from '@/ui/shared/types';
import { useSvgIds } from '@/ui/shared/svg';

// Home tile: a MOST → LEAST arrow beside a staircase of ranked paper cards,
// each with a cluster of coloured guess dots (ringed = guessed exactly).

const ROWS = [
  { label: 'Grandma', x: 84, w: 112, rot: -3, dots: ['#ff6b6b', '#4cc9f0', '#ffc93c'], hits: 2 },
  { label: 'A volcano', x: 104, w: 128, rot: 2, dots: ['#4cc9f0', '#a06cf0'], hits: 1 },
  { label: 'Mondays', x: 124, w: 112, rot: -2, dots: ['#ffc93c', '#ff6b6b', '#a06cf0'], hits: 0 },
  { label: 'A spoon', x: 144, w: 100, rot: 3, dots: ['#ff70a6'], hits: 1 },
];

export function TileArt({ className }: TileArtProps) {
  const ids = useSvgIds('ri-tile', ['bg', 'glow', 'arrow']);
  return (
    <svg viewBox="0 0 320 200" className={className} aria-hidden preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id={ids.bg} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#0c3d3b" />
          <stop offset="1" stopColor="#1b1546" />
        </linearGradient>
        <radialGradient id={ids.glow} cx="22%" cy="18%" r="75%">
          <stop offset="0" stopColor="#06d6a0" stopOpacity="0.38" />
          <stop offset="1" stopColor="#06d6a0" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={ids.arrow} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#06d6a0" />
          <stop offset="1" stopColor="#06d6a0" stopOpacity="0.12" />
        </linearGradient>
      </defs>
      <rect width="320" height="200" fill={`url(#${ids.bg})`} />
      <rect width="320" height="200" fill={`url(#${ids.glow})`} />
      {[...Array(12)].map((_, i) => (
        <circle key={i} cx={(i * 71 + 17) % 320} cy={(i * 43 + 11) % 200} r={(i % 2) + 1} fill="#b8fbe6" opacity="0.25" />
      ))}

      {/* MOST → LEAST */}
      <g transform="translate(30 0)">
        <text x="0" y="24" textAnchor="middle" fontFamily="Fredoka, sans-serif" fontWeight="700" fontSize="11" letterSpacing="1.5" fill="#06d6a0">
          MOST
        </text>
        <path d="M0 32 L-13 52 H-5 V172 H5 V52 H13 Z" fill={`url(#${ids.arrow})`} />
        <text x="0" y="190" textAnchor="middle" fontFamily="Fredoka, sans-serif" fontWeight="700" fontSize="11" letterSpacing="1.5" fill="#06d6a0" opacity="0.55">
          LEAST
        </text>
      </g>

      {ROWS.map((r, i) => {
        const y = 40 + i * 42;
        return (
          <g key={r.label}>
            <circle cx={r.x - 20} cy={y} r="13" fill="#06d6a0" />
            <text x={r.x - 20} y={y + 5.5} textAnchor="middle" fontFamily="Fredoka, sans-serif" fontWeight="700" fontSize="16" fill="#0b2a25">
              {i + 1}
            </text>
            <g transform={`rotate(${r.rot} ${r.x + r.w / 2} ${y})`}>
              <rect x={r.x} y={y - 15} width={r.w} height="30" rx="5" fill="#000" opacity="0.25" transform="translate(0 4)" />
              <rect x={r.x} y={y - 15} width={r.w} height="30" rx="5" fill={['#fffdf6', '#fff6d8', '#e9fff6', '#ffe9f1'][i]} />
              <text x={r.x + r.w / 2} y={y + 6} textAnchor="middle" fontFamily="Patrick Hand, cursive" fontSize="18" fill="#24203a">
                {r.label}
              </text>
            </g>
            {r.dots.map((c, j) => {
              const cx = r.x + r.w + 16 + j * 16;
              return (
                <g key={j}>
                  {j < r.hits && <circle cx={cx} cy={y} r="8.5" fill="none" stroke="#2bd98b" strokeWidth="2.5" />}
                  <circle cx={cx} cy={y} r="5.5" fill={c} opacity={j < r.hits ? 1 : 0.6} />
                </g>
              );
            })}
          </g>
        );
      })}

      {/* a sparkle on the winner */}
      <path d="M216 18 l3 7 7 3 -7 3 -3 7 -3 -7 -7 -3 7 -3 z" fill="#ffc93c" />
      <path d="M296 150 l2 4.5 4.5 2 -4.5 2 -2 4.5 -2 -4.5 -4.5 -2 4.5 -2 z" fill="#b8fbe6" opacity="0.7" />
    </svg>
  );
}
