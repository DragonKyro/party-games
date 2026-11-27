import { useSvgIds } from '@/ui/shared/svg';

// The fishbowl: a glass bowl whose paper slips fill it according to how many
// are left. Deterministic slip positions so it doesn't jitter between renders.

const SLIP_COLORS = ['#fff6d8', '#ffe1ec', '#dff7ee', '#e2f1ff', '#f1e6ff'];

function slipSpot(i: number): { x: number; y: number; r: number } {
  // Pack slips from the bottom up in a rough pile.
  const row = Math.floor(i / 6);
  const col = i % 6;
  const jitter = ((i * 73) % 11) - 5;
  return { x: 46 + col * 18 + (row % 2) * 8 + jitter * 0.6, y: 150 - row * 9 - ((i * 31) % 5), r: ((i * 47) % 70) - 35 };
}

export function Bowl({ count, total, size = 180 }: { count: number; total: number; size?: number }) {
  const ids = useSvgIds('bowl', ['glass', 'water', 'clip']);
  const shown = Math.min(36, Math.round((count / Math.max(1, total)) * 36));
  return (
    <svg viewBox="0 0 200 190" width={size} height={(size * 190) / 200} role="img" aria-label={`${count} slips left in the bowl`}>
      <defs>
        <radialGradient id={ids.glass} cx="35%" cy="30%" r="80%">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.35" />
          <stop offset="0.55" stopColor="#bfe9ff" stopOpacity="0.12" />
          <stop offset="1" stopColor="#4cc9f0" stopOpacity="0.28" />
        </radialGradient>
        <linearGradient id={ids.water} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#4cc9f0" stopOpacity="0.25" />
          <stop offset="1" stopColor="#1b6fa8" stopOpacity="0.45" />
        </linearGradient>
        <clipPath id={ids.clip}>
          <path d="M60 30 h80 v10 c32 14 46 42 46 72 c0 44 -38 72 -86 72 s-86 -28 -86 -72 c0 -30 14 -58 46 -72 z" />
        </clipPath>
      </defs>
      <ellipse cx="100" cy="182" rx="70" ry="7" fill="#000" opacity="0.25" />
      <g clipPath={`url(#${ids.clip})`}>
        <rect x="0" y="70" width="200" height="130" fill={`url(#${ids.water})`} />
        {Array.from({ length: shown }, (_, i) => {
          const s = slipSpot(i);
          return (
            <rect
              key={i}
              x={s.x - 10}
              y={s.y - 4}
              width="20"
              height="9"
              rx="1.5"
              fill={SLIP_COLORS[i % SLIP_COLORS.length]}
              stroke="#24203a"
              strokeOpacity="0.25"
              transform={`rotate(${s.r} ${s.x} ${s.y})`}
            />
          );
        })}
        <g transform="translate(128 92)">
          <path d="M0 0 c8 -8 22 -8 28 0 c-6 8 -20 8 -28 0 z" fill="#ff9f43" />
          <path d="M26 0 l10 -7 v14 z" fill="#ff9f43" />
          <circle cx="7" cy="-1" r="1.8" fill="#24203a" />
        </g>
      </g>
      <path
        d="M60 30 h80 v10 c32 14 46 42 46 72 c0 44 -38 72 -86 72 s-86 -28 -86 -72 c0 -30 14 -58 46 -72 z"
        fill={`url(#${ids.glass})`}
        stroke="#bfe9ff"
        strokeOpacity="0.8"
        strokeWidth="3"
      />
      <ellipse cx="100" cy="31" rx="41" ry="5" fill="none" stroke="#e6f7ff" strokeWidth="3" />
      <path d="M40 92 c-4 18 0 36 10 48" fill="none" stroke="#fff" strokeOpacity="0.55" strokeWidth="5" strokeLinecap="round" />
    </svg>
  );
}
