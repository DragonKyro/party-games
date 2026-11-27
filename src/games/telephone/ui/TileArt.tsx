import type { ReactNode } from 'react';
import { useSvgIds } from '@/ui/shared/svg';
import type { TileArtProps } from '@/ui/shared/types';

// Home tile: three sketchbook pages passed along a dashed trail —
// "a cat on a skateboard" → a wobbly doodle → "bread on wheels??".

const INK = '#24203a';
const PINK = '#ff70a6';

function Page({ x, y, r, children }: { x: number; y: number; r: number; children: ReactNode }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${r})`}>
      <rect x="-40" y="-48" width="84" height="104" rx="6" fill="#000" opacity="0.28" />
      <rect x="-44" y="-52" width="84" height="104" rx="6" fill="#fffdf6" />
      <line x1="-30" y1="-52" x2="-30" y2="52" stroke={PINK} strokeOpacity="0.45" strokeWidth="1.5" />
      {[-26, -8, 10, 28].map((ly) => (
        <line key={ly} x1="-44" y1={ly + 12} x2="40" y2={ly + 12} stroke="#4cc9f0" strokeOpacity="0.18" strokeWidth="1.2" />
      ))}
      {[-32, -18, -4, 10, 24].map((hx) => (
        <g key={hx}>
          <circle cx={hx} cy="-45" r="2.6" fill="#3a1640" />
          <path d={`M${hx - 2.5} -45 a2.5 4 0 0 1 5 -6`} fill="none" stroke="#c9c6d6" strokeWidth="1.6" strokeLinecap="round" />
        </g>
      ))}
      {children}
    </g>
  );
}

export function TileArt({ className }: TileArtProps) {
  const ids = useSvgIds('tel-tile', ['bg', 'glow']);
  return (
    <svg viewBox="0 0 320 200" className={className} aria-hidden preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id={ids.bg} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#4a1842" />
          <stop offset="1" stopColor="#1f1446" />
        </linearGradient>
        <radialGradient id={ids.glow} cx="50%" cy="55%" r="55%">
          <stop offset="0" stopColor={PINK} stopOpacity="0.35" />
          <stop offset="1" stopColor={PINK} stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="320" height="200" fill={`url(#${ids.bg})`} />
      <rect width="320" height="200" fill={`url(#${ids.glow})`} />
      {[...Array(18)].map((_, i) => (
        <circle key={i} cx={(i * 61 + 17) % 320} cy={(i * 41 + 9) % 200} r={(i % 3) * 0.7 + 0.8} fill="#ffd1e4" opacity="0.3" />
      ))}

      {/* The trail the books travel along. */}
      <path d="M92 62 C 112 30, 128 34, 140 52" fill="none" stroke={PINK} strokeWidth="3" strokeDasharray="2 7" strokeLinecap="round" />
      <path d="M134 44 l7 9 l-11 1" fill="none" stroke={PINK} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M190 58 C 208 26, 226 28, 238 46" fill="none" stroke={PINK} strokeWidth="3" strokeDasharray="2 7" strokeLinecap="round" />
      <path d="M232 38 l7 9 l-11 1" fill="none" stroke={PINK} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />

      {/* 1: the prompt */}
      <Page x={62} y={110} r={-9}>
        <text x="-2" y="-8" textAnchor="middle" fontFamily="Patrick Hand, cursive" fontSize="15" fill={INK}>
          a cat on a
        </text>
        <text x="-2" y="12" textAnchor="middle" fontFamily="Patrick Hand, cursive" fontSize="15" fill={INK}>
          skateboard
        </text>
        <path d="M-26 22 q 12 5 26 0 t 22 1" fill="none" stroke={PINK} strokeWidth="2" strokeLinecap="round" />
      </Page>

      {/* 2: the doodle */}
      <Page x={162} y={114} r={5}>
        <g fill="none" stroke={INK} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M-22 6 c -2 -14 6 -24 18 -24 c 14 0 22 10 19 24 c -2 8 -34 8 -37 0 z" fill="#ffd23f" />
          <path d="M-17 -14 l -2 -14 l 10 8" fill="#ffd23f" />
          <path d="M6 -19 l 8 -10 l 1 14" fill="#ffd23f" />
          <path d="M-9 -5 v 2 M5 -5 v 2" strokeWidth="3.2" />
          <path d="M-3 1 q 2 2 4 0" />
          <path d="M-14 0 h -12 M-14 4 l -11 3 M10 0 h 12 M10 4 l 11 3" strokeWidth="1.6" />
          <rect x="-28" y="14" width="50" height="7" rx="3.5" fill={PINK} />
          <circle cx="-18" cy="25" r="3.6" fill="#fffdf6" />
          <circle cx="12" cy="25" r="3.6" fill="#fffdf6" />
          <path d="M30 4 h 8 M28 12 h 10 M31 20 h 6" stroke="#767386" strokeWidth="1.8" />
        </g>
      </Page>

      {/* 3: the guess */}
      <Page x={262} y={106} r={-4}>
        <text x="-2" y="-8" textAnchor="middle" fontFamily="Patrick Hand, cursive" fontSize="15" fill={INK}>
          bread on
        </text>
        <text x="-2" y="12" textAnchor="middle" fontFamily="Patrick Hand, cursive" fontSize="15" fill={INK}>
          wheels??
        </text>
      </Page>

      {/* Hearts for the doodle. */}
      <path d="M196 64 c -4 -6 -12 -2 -8 5 l 8 8 l 8 -8 c 4 -7 -4 -11 -8 -5 z" fill={PINK} transform="rotate(12 196 70)" />
      <path d="M210 80 c -2.5 -4 -8 -1.5 -5.5 3.5 l 5.5 5 l 5.5 -5 c 2.5 -5 -3 -7.5 -5.5 -3.5 z" fill="#ffb3cf" />

      {/* A pencil resting on the table. */}
      <g transform="translate(118 180) rotate(-14)">
        <rect x="-44" y="-6" width="74" height="12" rx="2" fill="#ffc93c" />
        <rect x="-44" y="-6" width="74" height="4" fill="#ffe08a" />
        <rect x="-54" y="-6" width="12" height="12" rx="3" fill={PINK} />
        <rect x="-44" y="-6" width="5" height="12" fill="#c9c6d6" />
        <path d="M30 -6 l 16 6 l -16 6 z" fill="#f4c7a1" />
        <path d="M40 -2.2 l 6 2.2 l -6 2.2 z" fill={INK} />
      </g>
    </svg>
  );
}
