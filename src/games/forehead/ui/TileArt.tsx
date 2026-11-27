import type { TileArtProps } from '@/ui/shared/types';
import { useSvgIds } from '@/ui/shared/svg';

// Home tile: a puzzled guesser holding a phone to their forehead (the word
// faces us, not them), friends' clues flying in, and a nod-down = got it.

const SKIN = '#f2c19b';
const INK = '#1d1430';

export function TileArt({ className }: TileArtProps) {
  const ids = useSvgIds('fh-tile', ['bg', 'glow', 'screen']);
  return (
    <svg viewBox="0 0 320 200" className={className} aria-hidden preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id={ids.bg} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2b1650" />
          <stop offset="1" stopColor="#5a1d4c" />
        </linearGradient>
        <radialGradient id={ids.glow} cx="50%" cy="38%" r="45%">
          <stop offset="0" stopColor="#ffc93c" stopOpacity="0.55" />
          <stop offset="1" stopColor="#ffc93c" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={ids.screen} cx="50%" cy="45%" r="70%">
          <stop offset="0" stopColor="#ffe7a3" />
          <stop offset="1" stopColor="#ffc93c" />
        </radialGradient>
      </defs>

      <rect width="320" height="200" fill={`url(#${ids.bg})`} />
      <rect width="320" height="200" fill={`url(#${ids.glow})`} />
      {[...Array(16)].map((_, i) => (
        <circle
          key={i}
          cx={(i * 61 + 17) % 320}
          cy={(i * 43 + 9) % 200}
          r={(i % 3) + 1}
          fill={['#ffc93c', '#ff70a6', '#4cc9f0', '#fff'][i % 4]}
          opacity="0.45"
        />
      ))}

      {/* Shoulders and arms */}
      <path d="M76 200 C80 168 112 154 160 154 C208 154 240 168 244 200 Z" fill="#4cc9f0" />
      <path d="M128 158 Q160 176 192 158" fill="none" stroke="#2e9fca" strokeWidth="4" strokeLinecap="round" />
      <path d="M100 86 C84 112 82 142 96 170" fill="none" stroke="#3fb5dc" strokeWidth="17" strokeLinecap="round" />
      <path d="M220 86 C236 112 238 142 224 170" fill="none" stroke="#3fb5dc" strokeWidth="17" strokeLinecap="round" />

      {/* Head */}
      <rect x="149" y="136" width="22" height="22" rx="6" fill="#e3ad85" />
      <circle cx="119" cy="116" r="8" fill={SKIN} />
      <circle cx="201" cy="116" r="8" fill={SKIN} />
      <circle cx="160" cy="112" r="42" fill={SKIN} />
      <path d="M118 104 C116 72 140 60 160 60 C182 60 204 72 202 104 C196 90 182 84 160 84 C138 84 124 90 118 104 Z" fill="#3a2418" />
      {/* Eyes rolled up toward the phone, eyebrows up: "what IS it?" */}
      <ellipse cx="145" cy="119" rx="7.5" ry="8.5" fill="#fff" />
      <ellipse cx="175" cy="119" rx="7.5" ry="8.5" fill="#fff" />
      <circle cx="146" cy="114.5" r="3.8" fill={INK} />
      <circle cx="176" cy="114.5" r="3.8" fill={INK} />
      <path d="M136 106 q9 -6 18 -1" fill="none" stroke="#3a2418" strokeWidth="3" strokeLinecap="round" />
      <path d="M166 105 q9 -5 18 1" fill="none" stroke="#3a2418" strokeWidth="3" strokeLinecap="round" />
      <circle cx="133" cy="132" r="6" fill="#ff8fa3" opacity="0.5" />
      <circle cx="187" cy="132" r="6" fill="#ff8fa3" opacity="0.5" />
      <ellipse cx="160" cy="139" rx="5" ry="6" fill="#7a2e3a" />

      {/* The phone on the forehead, word facing the room */}
      <g transform="translate(160 78) rotate(-4)">
        <rect x="-55" y="-25" width="110" height="50" rx="10" fill={INK} />
        <rect x="-49" y="-20" width="98" height="40" rx="6" fill={`url(#${ids.screen})`} />
        <text
          x="0"
          y="7.5"
          textAnchor="middle"
          fontFamily="Fredoka, Nunito, sans-serif"
          fontWeight="700"
          fontSize="21"
          fill={INK}
        >
          Walrus
        </text>
        <ellipse cx="-58" cy="3" rx="9" ry="13" fill={SKIN} />
        <ellipse cx="58" cy="3" rx="9" ry="13" fill={SKIN} />
        <path d="M-61 -4 h7 M-61 3 h7 M-61 10 h7" stroke="#d99b72" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M54 -4 h7 M54 3 h7 M54 10 h7" stroke="#d99b72" strokeWidth="1.6" strokeLinecap="round" />
      </g>

      {/* Clues flying in */}
      <g>
        <rect x="8" y="22" width="86" height="34" rx="14" fill="#fff" />
        <path d="M80 50 L104 66 L70 54 Z" fill="#fff" />
        <text x="51" y="44" textAnchor="middle" fontFamily="Fredoka, Nunito, sans-serif" fontWeight="600" fontSize="15" fill={INK}>
          Whiskers!
        </text>
      </g>
      <g>
        <rect x="228" y="18" width="84" height="34" rx="14" fill="#fff" />
        <path d="M240 46 L216 60 L252 50 Z" fill="#fff" />
        <text x="270" y="40" textAnchor="middle" fontFamily="Fredoka, Nunito, sans-serif" fontWeight="600" fontSize="15" fill={INK}>
          Flippers!
        </text>
      </g>
      <g>
        <rect x="6" y="132" width="70" height="30" rx="13" fill="#ff70a6" />
        <path d="M62 136 L86 124 L70 146 Z" fill="#ff70a6" />
        <text x="41" y="152" textAnchor="middle" fontFamily="Fredoka, Nunito, sans-serif" fontWeight="600" fontSize="15" fill={INK}>
          Tusks!
        </text>
      </g>
      <text x="112" y="46" fontFamily="Fredoka, Nunito, sans-serif" fontWeight="700" fontSize="20" fill="#ffc93c" transform="rotate(-14 112 46)">
        ?
      </text>
      <text x="204" y="40" fontFamily="Fredoka, Nunito, sans-serif" fontWeight="700" fontSize="15" fill="#ffc93c" transform="rotate(12 204 40)">
        ?
      </text>

      {/* Nod down = got it */}
      <path
        d="M230 98 C256 104 270 116 274 130"
        fill="none"
        stroke="#2bd98b"
        strokeWidth="3"
        strokeDasharray="5 5"
        strokeLinecap="round"
      />
      <path d="M266 126 L274 136 L280 124" fill="none" stroke="#2bd98b" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="276" cy="158" r="17" fill="#2bd98b" />
      <path d="M268 158 l6 6 l11 -12" fill="none" stroke="#06281a" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
