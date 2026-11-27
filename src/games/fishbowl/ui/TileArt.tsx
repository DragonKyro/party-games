import type { TileArtProps } from '@/ui/shared/types';
import { useSvgIds } from '@/ui/shared/svg';

// Home tile: a fishbowl full of slips, two slips flying out.

export function TileArt({ className }: TileArtProps) {
  const ids = useSvgIds('fb-tile', ['bg', 'glass']);
  return (
    <svg viewBox="0 0 320 200" className={className} aria-hidden preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id={ids.bg} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#123a5c" />
          <stop offset="1" stopColor="#1d1a4a" />
        </linearGradient>
        <radialGradient id={ids.glass} cx="35%" cy="30%" r="80%">
          <stop offset="0" stopColor="#fff" stopOpacity="0.4" />
          <stop offset="1" stopColor="#4cc9f0" stopOpacity="0.3" />
        </radialGradient>
      </defs>
      <rect width="320" height="200" fill={`url(#${ids.bg})`} />
      {[...Array(14)].map((_, i) => (
        <circle key={i} cx={(i * 53) % 320} cy={(i * 37) % 200} r={(i % 3) + 1} fill="#bfe9ff" opacity="0.35" />
      ))}
      <g transform="translate(160 112)">
        <ellipse cx="0" cy="74" rx="64" ry="7" fill="#000" opacity="0.3" />
        <path d="M-34 -62 h68 v8 c28 12 40 36 40 62 c0 38 -32 62 -74 62 s-74 -24 -74 -62 c0 -26 12 -50 40 -62 z" fill="#4cc9f0" opacity="0.22" />
        {[...Array(18)].map((_, i) => (
          <rect
            key={i}
            x={-54 + (i % 6) * 18 + ((i * 7) % 5)}
            y={42 - Math.floor(i / 6) * 10}
            width="18"
            height="8"
            rx="1.5"
            fill={['#fff6d8', '#ffe1ec', '#dff7ee', '#e2f1ff'][i % 4]}
            transform={`rotate(${((i * 47) % 60) - 30} ${-45 + (i % 6) * 18} ${46 - Math.floor(i / 6) * 10})`}
          />
        ))}
        <path d="M8 6 c7 -7 19 -7 24 0 c-5 7 -17 7 -24 0 z" fill="#ff9f43" />
        <path d="M30 6 l9 -6 v12 z" fill="#ff9f43" />
        <path d="M-34 -62 h68 v8 c28 12 40 36 40 62 c0 38 -32 62 -74 62 s-74 -24 -74 -62 c0 -26 12 -50 40 -62 z" fill={`url(#${ids.glass})`} stroke="#bfe9ff" strokeWidth="3" />
        <ellipse cx="0" cy="-61" rx="35" ry="4.5" fill="none" stroke="#e6f7ff" strokeWidth="3" />
      </g>
      <g transform="translate(232 40) rotate(18)">
        <rect x="-30" y="-13" width="60" height="26" rx="3" fill="#fff6d8" />
        <text x="0" y="5" textAnchor="middle" fontFamily="Patrick Hand, cursive" fontSize="15" fill="#24203a">
          Cleopatra
        </text>
      </g>
      <g transform="translate(82 46) rotate(-14)">
        <rect x="-32" y="-13" width="64" height="26" rx="3" fill="#ffe1ec" />
        <text x="0" y="5" textAnchor="middle" fontFamily="Patrick Hand, cursive" fontSize="15" fill="#24203a">
          Uncle Ray
        </text>
      </g>
    </svg>
  );
}
