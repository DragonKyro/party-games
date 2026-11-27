import type { TileArtProps } from '@/ui/shared/types';
import { useSvgIds } from '@/ui/shared/svg';

// Home tile: a wobbly cat doodle on a sheet of paper, a pencil mid-stroke,
// the guessers' speech bubbles and the hint blanks underneath.

const INK = '#24203a';

export function TileArt({ className }: TileArtProps) {
  const ids = useSvgIds('sk-tile', ['bg', 'glow', 'shade']);
  return (
    <svg viewBox="0 0 320 200" className={className} aria-hidden preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id={ids.bg} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3b1531" />
          <stop offset="1" stopColor="#1b1840" />
        </linearGradient>
        <radialGradient id={ids.glow} cx="38%" cy="48%" r="60%">
          <stop offset="0" stopColor="#ff6b6b" stopOpacity="0.45" />
          <stop offset="1" stopColor="#ff6b6b" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={ids.shade} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#ffd84d" />
          <stop offset="0.5" stopColor="#ffc93c" />
          <stop offset="1" stopColor="#e8a91e" />
        </linearGradient>
      </defs>

      <rect width="320" height="200" fill={`url(#${ids.bg})`} />
      <rect width="320" height="200" fill={`url(#${ids.glow})`} />
      {[...Array(24)].map((_, i) => (
        <circle key={i} cx={(i * 47 + 13) % 320} cy={(i * 29 + 7) % 200} r={i % 4 === 0 ? 1.6 : 1} fill="#ffd6e0" opacity="0.3" />
      ))}

      {/* the sheet */}
      <g transform="translate(122 92) rotate(-5)">
        <rect x="-78" y="-58" width="156" height="118" rx="6" fill="#000" opacity="0.28" transform="translate(4 6)" />
        <rect x="-78" y="-58" width="156" height="118" rx="6" fill="#fffdf6" />
        <rect x="-78" y="-58" width="156" height="10" rx="5" fill="#ff6b6b" opacity="0.85" />
        {/* the doodle: a cat, hand-drawn */}
        <g fill="none" stroke={INK} strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
          <path
            d="M-31 10 C-33 -8 -22 -19 -2 -20 C18 -21 32 -9 31 9 C30 27 15 36 -1 36 C-18 36 -30 27 -31 10 Z"
            fill="#ffe1e1"
          />
          <path d="M-26 -6 L-24 -36 L-7 -19" fill="#ffe1e1" />
          <path d="M6 -20 L23 -37 L26 -7" fill="#ffe1e1" />
          <path d="M-20 -26 L-19 -18 M17 -27 L19 -19" strokeWidth="2" stroke="#ff8f8f" />
          <path d="M-2 15 q-5 7 -11 3 M-2 15 q5 7 11 3" strokeWidth="2.6" />
          <path d="M-15 12 L-44 7 M-15 17 L-43 21 M11 12 L41 6 M11 17 L41 20" strokeWidth="2.2" />
        </g>
        <circle cx="-12" cy="3" r="3.6" fill={INK} />
        <circle cx="9" cy="3" r="3.6" fill={INK} />
        <circle cx="-11" cy="2" r="1.1" fill="#fff" />
        <circle cx="10" cy="2" r="1.1" fill="#fff" />
        <path d="M-6 10 h8 l-4 5 z" fill="#ff6b6b" />
        {/* a half-finished tail stroke, just being drawn */}
        <path d="M30 22 C46 22 52 8 46 -4" fill="none" stroke="#ff6b6b" strokeWidth="3.4" strokeLinecap="round" />
      </g>

      {/* the pencil, tip at the end of the tail */}
      <g transform="translate(175.5 99) rotate(-28)">
        <polygon points="-7,0 7,0 0,-17" fill="#f4c7a1" />
        <polygon points="-2.4,-11.5 2.4,-11.5 0,-17" fill="#ff6b6b" />
        <rect x="-7" y="0" width="14" height="74" fill={`url(#${ids.shade})`} />
        <rect x="-2" y="0" width="1.6" height="74" fill="#fff" opacity="0.35" />
        <rect x="-7.5" y="74" width="15" height="9" fill="#c9c6d6" />
        <rect x="-7.5" y="77" width="15" height="2" fill="#9f9bb3" />
        <rect x="-7" y="83" width="14" height="12" rx="3.5" fill="#ff70a6" />
      </g>

      {/* the guessers */}
      <g transform="translate(262 46) rotate(4)">
        <path d="M-40 -18 h80 a8 8 0 0 1 8 8 v20 a8 8 0 0 1 -8 8 h-58 l-12 10 l2 -10 h-12 a8 8 0 0 1 -8 -8 v-20 a8 8 0 0 1 8 -8 z" fill="#fff6d8" />
        <text x="0" y="6" textAnchor="middle" fontFamily="Patrick Hand, cursive" fontSize="19" fill={INK}>
          a lion?
        </text>
      </g>
      <g transform="translate(268 112) rotate(-3)">
        <path d="M-36 -18 h72 a8 8 0 0 1 8 8 v20 a8 8 0 0 1 -8 8 h-12 l2 10 l-12 -10 h-50 a8 8 0 0 1 -8 -8 v-20 a8 8 0 0 1 8 -8 z" fill="#06d6a0" />
        <text x="0" y="7" textAnchor="middle" fontFamily="Fredoka, sans-serif" fontWeight="700" fontSize="21" fill="#06281a">
          CAT!
        </text>
      </g>
      <g transform="translate(296 82)" fill="#ffc93c">
        <path d="M0 -7 L2 -2 L7 0 L2 2 L0 7 L-2 2 L-7 0 L-2 -2 Z" />
      </g>

      {/* the hint blanks */}
      <g transform="translate(122 180)" stroke="#ffd6e0" strokeWidth="3.5" strokeLinecap="round">
        <line x1="-34" y1="0" x2="-16" y2="0" />
        <line x1="-9" y1="0" x2="9" y2="0" />
        <line x1="16" y1="0" x2="34" y2="0" />
      </g>
      <text x="122" y="174" textAnchor="middle" fontFamily="Fredoka, sans-serif" fontWeight="700" fontSize="18" fill="#ff6b6b">
        A
      </text>
    </svg>
  );
}
