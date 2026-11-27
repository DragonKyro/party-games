import type { TileArtProps } from '@/ui/shared/types';
import { useSvgIds } from '@/ui/shared/svg';

// Home tile: a walnut table radio with a wide backlit tuning band, a glowing
// needle homing in on a bright station, and signal waves off the antenna.

const TICKS = Array.from({ length: 41 }, (_, i) => i);

export function TileArt({ className }: TileArtProps) {
  const ids = useSvgIds('ti-tile', ['bg', 'wood', 'band', 'glow', 'knob', 'station']);
  return (
    <svg viewBox="0 0 320 200" className={className} aria-hidden preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id={ids.bg} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2b1740" />
          <stop offset="1" stopColor="#4a1d24" />
        </linearGradient>
        <linearGradient id={ids.wood} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#8a5a36" />
          <stop offset="0.5" stopColor="#6b4428" />
          <stop offset="1" stopColor="#4b2e1b" />
        </linearGradient>
        <linearGradient id={ids.band} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#2a6f8a" />
          <stop offset="0.5" stopColor="#1a1230" />
          <stop offset="1" stopColor="#8a2f3a" />
        </linearGradient>
        <radialGradient id={ids.glow} cx="50%" cy="100%" r="80%">
          <stop offset="0" stopColor="#ffb35c" stopOpacity="0.45" />
          <stop offset="1" stopColor="#ffb35c" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={ids.knob} cx="35%" cy="30%" r="75%">
          <stop offset="0" stopColor="#f3d3a6" />
          <stop offset="0.5" stopColor="#c8955c" />
          <stop offset="1" stopColor="#6b4428" />
        </radialGradient>
        <linearGradient id={ids.station} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff6dc" />
          <stop offset="1" stopColor="#ffb35c" />
        </linearGradient>
      </defs>

      <rect width="320" height="200" fill={`url(#${ids.bg})`} />
      {[...Array(16)].map((_, i) => (
        <circle key={i} cx={(i * 61) % 320} cy={(i * 41) % 120} r={(i % 3) * 0.6 + 0.8} fill="#ffd9a8" opacity="0.3" />
      ))}

      {/* signal waves off the antenna */}
      <g fill="none" stroke="#ff9f43" strokeLinecap="round">
        <path d="M264.6 18.1 A9 9 0 0 1 271.9 25.4" strokeWidth="3" opacity="0.95" />
        <path d="M265.8 11.2 A16 16 0 0 1 278.8 24.2" strokeWidth="3" opacity="0.65" />
        <path d="M267.0 4.3 A23 23 0 0 1 285.7 23.0" strokeWidth="3" opacity="0.38" />
      </g>
      <line x1="230" y1="50" x2="262" y2="28" stroke="#cfd3dc" strokeWidth="3" strokeLinecap="round" />
      <circle cx="263" cy="27" r="5" fill="#ff5a36" />

      {/* radio body */}
      <ellipse cx="160" cy="186" rx="128" ry="8" fill="#000" opacity="0.35" />
      <rect x="28" y="48" width="264" height="132" rx="22" fill={`url(#${ids.wood})`} />
      <rect x="28" y="48" width="264" height="132" rx="22" fill="none" stroke="#a87650" strokeWidth="2" opacity="0.6" />
      <path d="M40 60 h240" stroke="#c89464" strokeWidth="2" opacity="0.35" strokeLinecap="round" />

      {/* tuning band */}
      <rect x="44" y="64" width="232" height="54" rx="10" fill="#3a271a" />
      <rect x="48" y="68" width="224" height="46" rx="8" fill={`url(#${ids.band})`} />
      <rect x="48" y="68" width="224" height="46" rx="8" fill={`url(#${ids.glow})`} />
      <rect x="166" y="68" width="40" height="46" fill="#ff9f43" opacity="0.22" />
      <rect x="176" y="68" width="20" height="46" fill="#ffb35c" opacity="0.35" />
      <rect x="182" y="68" width="8" height="46" fill={`url(#${ids.station})`} opacity="0.95" />
      {TICKS.map((i) => {
        const x = 56 + i * 5.2;
        const major = i % 5 === 0;
        return (
          <line
            key={i}
            x1={x}
            x2={x}
            y1={major ? 92 : 100}
            y2={112}
            stroke="#ffecd2"
            strokeWidth={major ? 1.6 : 1}
            opacity={major ? 0.85 : 0.45}
          />
        );
      })}
      {['88', '92', '96', '100', '104', '108'].map((f, i) => (
        <text
          key={f}
          x={56 + i * 41.6}
          y="84"
          textAnchor="middle"
          fontFamily="Fredoka, Nunito, sans-serif"
          fontSize="9"
          fontWeight="700"
          fill="#ffd9a8"
          opacity="0.8"
        >
          {f}
        </text>
      ))}
      <rect x="48" y="68" width="224" height="16" rx="8" fill="#fff" opacity="0.07" />
      {/* the needle */}
      <g>
        <rect x="203" y="62" width="4" height="58" rx="2" fill="#ff5a36" />
        <rect x="199" y="62" width="12" height="58" rx="6" fill="#ff5a36" opacity="0.25" />
        <circle cx="205" cy="62" r="6" fill="#ffd0b8" stroke="#c42a12" strokeWidth="2" />
      </g>

      {/* knobs + grille */}
      {[78, 242].map((cx, k) => (
        <g key={cx} transform={`translate(${cx} 148) rotate(${k ? 35 : -50})`}>
          <circle r="19" fill="#2f1e12" />
          <circle r="16" fill={`url(#${ids.knob})`} />
          {[...Array(12)].map((_, i) => (
            <line key={i} x1="0" y1="-16" x2="0" y2="-13" stroke="#6b4428" strokeWidth="1.5" transform={`rotate(${i * 30})`} />
          ))}
          <line x1="0" y1="-4" x2="0" y2="-12" stroke="#3a271a" strokeWidth="3" strokeLinecap="round" />
        </g>
      ))}
      <rect x="110" y="130" width="100" height="38" rx="8" fill="#2f1e12" />
      {[...Array(6)].map((_, i) => (
        <rect key={i} x="116" y={135 + i * 5.4} width="88" height="2.6" rx="1.3" fill="#c89464" opacity="0.55" />
      ))}
      <circle cx="160" cy="124" r="2.5" fill="#ff4d2e" />
    </svg>
  );
}
