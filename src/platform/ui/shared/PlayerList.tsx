import type { Seat } from '@/platform/net/types';
import './PlayerList.css';

interface Props {
  seats: Seat[];
  hostUuid?: string;
  myUuid?: string;
}

export function PlayerList({ seats, hostUuid, myUuid }: Props) {
  return (
    <ul className="pg-player-list">
      {seats.map((s) => (
        <li key={s.uuid} className="pg-player-list-item">
          <span className="pg-player-name">{s.name || 'Player'}</span>
          {s.uuid === hostUuid && <span className="pg-tag">host</span>}
          {s.uuid === myUuid && <span className="pg-tag pg-tag-me">you</span>}
        </li>
      ))}
    </ul>
  );
}
