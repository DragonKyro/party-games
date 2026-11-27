import { useSvgIds } from '@/ui/shared/svg';
import type { TileArtProps } from '@/ui/shared/types';

// Home tile: a board of word tiles with one lit gold. A row of gumdrop
// characters all gaze up at it — except the one in the masquerade mask,
// caught in the spotlight, eyes darting, a "?" over its head.

const COLORS = ['#ff6b6b', '#4cc9f0', '#06d6a0', '#a06cf0', '#ffc93c'];
const XS = [52, 106, 160, 214, 268];
const ODD = 3;
const GOLD = { col: 2, row: 1 };

export function TileArt({ className }: TileArtProps) {
  const ids = useSvgIds('ooo-tile', ['bg', 'beam', 'gold', 'glow']);
  const tile = (col: number, row: number) => ({ x: 84 + col * 39, y: 14 + row * 23 });
  const gold = tile(GOLD.col, GOLD.row);
  const gx = gold.x + 17;
  const gy = gold.y + 9;

  return (
    <svg viewBox="0 0 320 200" className={className} aria-hidden preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id={ids.bg} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2c1858" />
          <stop offset="1" stopColor="#120a28" />
        </linearGradient>
        <linearGradient id={ids.beam} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff1b8" stopOpacity="0.5" />
          <stop offset="1" stopColor="#fff1b8" stopOpacity="0.04" />
        </linearGradient>
        <linearGradient id={ids.gold} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffe9a0" />
          <stop offset="1" stopColor="#ffc93c" />
        </linearGradient>
        <radialGradient id={ids.glow}>
          <stop offset="0" stopColor="#ffd75e" stopOpacity="0.7" />
          <stop offset="1" stopColor="#ffd75e" stopOpacity="0" />
        </radialGradient>
      </defs>

      <rect width="320" height="200" fill={`url(#${ids.bg})`} />
      {[...Array(16)].map((_, i) => (
        <circle key={i} cx={(i * 67 + 11) % 320} cy={(i * 29 + 7) % 110} r={(i % 3) * 0.6 + 0.6} fill="#e7dcff" opacity="0.35" />
      ))}

      {/* The board */}
      <rect x="76" y="7" width="168" height="80" rx="12" fill="#1a1036" stroke="#4a3a86" strokeWidth="1.5" />
      <circle cx={gx} cy={gy} r="34" fill={`url(#${ids.glow})`} />
      {[0, 1, 2].map((row) =>
        [0, 1, 2, 3].map((col) => {
          const { x, y } = tile(col, row);
          const isGold = col === GOLD.col && row === GOLD.row;
          const w = 12 + ((col * 7 + row * 5) % 12);
          return (
            <g key={`${col}-${row}`}>
              <rect
                x={x}
                y={y}
                width="34"
                height="18"
                rx="4.5"
                fill={isGold ? `url(#${ids.gold})` : '#3b3269'}
                stroke={isGold ? '#fff6cf' : 'none'}
                strokeWidth="1.5"
              />
              <rect x={x + 17 - w / 2} y={y + 7.5} width={w} height="3" rx="1.5" fill={isGold ? '#7a5200' : '#8a80b3'} opacity={isGold ? 0.8 : 0.7} />
            </g>
          );
        }),
      )}
      <path d={`M${gx + 15} ${gold.y - 7} l2 -5 l2 5 l5 2 l-5 2 l-2 5 l-2 -5 l-5 -2 z`} fill="#fff6cf" />

      {/* Spotlight on the odd one */}
      <path d={`M${XS[ODD]! - 10} 0 h20 L${XS[ODD]! + 42} 200 H${XS[ODD]! - 42} Z`} fill={`url(#${ids.beam})`} />
      <ellipse cx={XS[ODD]} cy="181" rx="40" ry="8" fill="#fff1b8" opacity="0.16" />

      {/* The line-up */}
      {XS.map((x, i) => {
        const odd = i === ODD;
        // Everyone looks up at the gold tile; the odd one glances sideways.
        const dx = odd ? -2.6 : Math.max(-2.4, Math.min(2.4, (gx - x) / 40));
        const dy = odd ? 0.6 : -2.2;
        const bob = i % 2 === 0 ? 0 : 4;
        return (
          <g key={i} transform={`translate(${x} ${150 + bob})`}>
            <ellipse cx="0" cy="30" rx="24" ry="5" fill="#000" opacity="0.3" />
            <path d="M-23 28 C-24 -6 -13 -26 0 -26 C13 -26 24 -6 23 28 Q0 33 -23 28 Z" fill={COLORS[i]} />
            <path d="M-14 -16 C-10 -22 -4 -24 2 -24" stroke="#fff" strokeOpacity="0.45" strokeWidth="3" fill="none" strokeLinecap="round" />
            {odd && (
              <path
                d="M-21 -11 C-14 -17 -4 -15 0 -11 C4 -15 14 -17 21 -11 C20 -2 13 3 6 1 C3 0 1 -2 0 -4 C-1 -2 -3 0 -6 1 C-13 3 -20 -2 -21 -11 Z"
                fill="#1a0f33"
              />
            )}
            {[-7, 7].map((ex) => (
              <g key={ex}>
                <circle cx={ex} cy="-7" r="5" fill="#fff" />
                <circle cx={ex + dx} cy={-7 + dy} r="2.5" fill="#1b1430" />
              </g>
            ))}
            {odd ? (
              <path d="M-6 12 q3 -3 6 0 q3 3 6 0" stroke="#1b1430" strokeWidth="2.2" fill="none" strokeLinecap="round" />
            ) : (
              <path d="M-5 9 q5 5 10 0" stroke="#1b1430" strokeWidth="2.2" fill="none" strokeLinecap="round" />
            )}
            {odd && <path d="M20 -22 q4 6 0 9 q-4 -3 0 -9 z" fill="#9fe7ff" />}
          </g>
        );
      })}

      {/* The odd one's "?" */}
      <g transform={`translate(${XS[ODD]! + 22} 104)`}>
        <path d="M-15 -14 h30 a8 8 0 0 1 8 8 v10 a8 8 0 0 1 -8 8 h-14 l-7 7 v-7 h-9 a8 8 0 0 1 -8 -8 v-10 a8 8 0 0 1 8 -8 z" fill="#fffdf6" />
        <text x="0" y="7" textAnchor="middle" fontFamily="Fredoka, sans-serif" fontWeight="700" fontSize="19" fill="#a06cf0">
          ?
        </text>
      </g>
    </svg>
  );
}
