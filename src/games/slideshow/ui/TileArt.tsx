import type { TileArtProps } from '@/ui/shared/types';
import { useSvgIds } from '@/ui/shared/svg';

// Home tile: a spotlit stage, a projector screen with a suspiciously
// optimistic chart, and a presenter with a karaoke mic pointing at it.

export function TileArt({ className }: TileArtProps) {
  const ids = useSvgIds('ssk-tile', ['bg', 'spot', 'screen', 'floor'] as const);
  return (
    <svg viewBox="0 0 320 200" className={className} aria-hidden preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id={ids.bg} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#1b1d4f" />
          <stop offset="1" stopColor="#2c1f55" />
        </linearGradient>
        <linearGradient id={ids.spot} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff6d6" stopOpacity="0.5" />
          <stop offset="1" stopColor="#fff6d6" stopOpacity="0.04" />
        </linearGradient>
        <linearGradient id={ids.screen} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#e9ebff" />
        </linearGradient>
        <radialGradient id={ids.floor} cx="50%" cy="0%" r="80%">
          <stop offset="0" stopColor="#8c9eff" stopOpacity="0.45" />
          <stop offset="1" stopColor="#8c9eff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="320" height="200" fill={`url(#${ids.bg})`} />
      {/* curtains */}
      <path d="M0 0 H34 C28 50 38 120 26 200 H0Z" fill="#6c3bb5" />
      <path d="M320 0 H286 C292 50 282 120 294 200 H320Z" fill="#6c3bb5" />
      <path d="M0 0 H320 V14 C260 24 60 24 0 14Z" fill="#7d47c8" />
      {[...Array(9)].map((_, i) => (
        <circle key={i} cx={52 + i * 27} cy={9 + (i % 2) * 2} r="2" fill="#ffd166" opacity="0.85" />
      ))}
      {/* stage floor */}
      <rect y="166" width="320" height="34" fill="#3a2a6b" />
      <ellipse cx="160" cy="166" rx="150" ry="20" fill={`url(#${ids.floor})`} />
      {/* screen */}
      <g transform="translate(118 30)">
        <rect x="-4" y="-6" width="172" height="8" rx="4" fill="#c9cdf2" />
        <rect x="0" y="0" width="164" height="104" rx="4" fill={`url(#${ids.screen})`} />
        <rect x="12" y="12" width="78" height="9" rx="4.5" fill="#2c2f66" />
        <rect x="12" y="25" width="46" height="5" rx="2.5" fill="#9aa1d6" />
        <path d="M14 92 H150" stroke="#c4c8ea" strokeWidth="2" />
        {[0, 1, 2, 3].map((i) => (
          <path
            key={i}
            d={`M${22 + i * 32} 92 V${80 - i * 13} q0 -4 4 -4 h14 q4 0 4 4 V92Z`}
            fill={['#8c9eff', '#4cc9f0', '#06d6a0', '#ff70a6'][i]}
          />
        ))}
        <path d="M24 66 L58 58 L88 44 L138 22" fill="none" stroke="#ff9f43" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M138 22 l-12 1 M138 22 l-3 11" stroke="#ff9f43" strokeWidth="4" strokeLinecap="round" />
        <rect x="80" y="104" width="4" height="34" fill="#c9cdf2" />
      </g>
      {/* spotlight */}
      <path d="M58 0 H96 L104 168 H24Z" fill={`url(#${ids.spot})`} />
      {/* presenter */}
      <g transform="translate(66 104)">
        <ellipse cx="0" cy="64" rx="28" ry="5" fill="#000" opacity="0.3" />
        <rect x="-11" y="28" width="9" height="36" rx="4" fill="#2b2350" />
        <rect x="2" y="28" width="9" height="36" rx="4" fill="#2b2350" />
        <path d="M-17 34 V4 Q-17 -8 -4 -8 H4 Q17 -8 17 4 V34Z" fill="#8c9eff" />
        {/* pointing arm */}
        <g transform="rotate(-32 12 -2)">
          <rect x="10" y="-6" width="44" height="9" rx="4.5" fill="#7486f0" />
          <circle cx="56" cy="-1.5" r="5" fill="#f2c6a0" />
        </g>
        {/* mic arm */}
        <path d="M-15 0 Q-26 10 -14 18" fill="none" stroke="#7486f0" strokeWidth="9" strokeLinecap="round" />
        <rect x="-14" y="2" width="5" height="16" rx="2" fill="#3b3b4f" transform="rotate(-20 -12 10)" />
        <circle cx="-14" cy="1" r="5" fill="#9ea2b8" />
        <rect x="-5" y="-14" width="10" height="8" fill="#e2a67c" />
        <circle cx="0" cy="-24" r="13" fill="#f2c6a0" />
        <path d="M-13.5 -23 A13.5 13.5 0 0 1 13.5 -23 Q4 -34 -13.5 -23Z" fill="#3a2a22" />
        <circle cx="-4" cy="-22" r="1.6" fill="#5a3a2a" />
        <circle cx="5" cy="-22" r="1.6" fill="#5a3a2a" />
        <path d="M-4 -16 Q0.5 -12 5 -16" fill="none" stroke="#5a3a2a" strokeWidth="1.6" strokeLinecap="round" />
      </g>
      {/* notes + sparkle: it's karaoke */}
      <g fill="#ffd166">
        <path d="M44 52 v-18 l14 -4 v18" fill="none" stroke="#ffd166" strokeWidth="3" strokeLinejoin="round" />
        <ellipse cx="41" cy="52" rx="5" ry="4" />
        <ellipse cx="55" cy="48" rx="5" ry="4" />
      </g>
      <path d="M104 64 v-14 M104 50 l9 3" stroke="#ff70a6" strokeWidth="3" fill="none" strokeLinecap="round" />
      <ellipse cx="101" cy="65" rx="4.5" ry="3.5" fill="#ff70a6" />
      <path d="M298 160 l3 -8 l3 8 l8 3 l-8 3 l-3 8 l-3 -8 l-8 -3z" fill="#fff" opacity="0.8" />
      <path d="M262 22 l2 -5 l2 5 l5 2 l-5 2 l-2 5 l-2 -5 l-5 -2z" fill="#fff" opacity="0.7" />
    </svg>
  );
}
