import { useState } from 'react';
import './RoomCode.css';

interface Props {
  code: string;
}

export function RoomCode({ code }: Props) {
  const [copied, setCopied] = useState(false);
  if (!code) return null;
  return (
    <button
      type="button"
      className="pg-room-code"
      title="Copy room code"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(code);
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        } catch {
          /* clipboard blocked — user can read it visually */
        }
      }}
    >
      <span className="pg-room-code-label">Room</span>
      <span className="pg-room-code-value">{code}</span>
      <span className="pg-room-code-hint">{copied ? 'copied' : 'copy'}</span>
    </button>
  );
}
