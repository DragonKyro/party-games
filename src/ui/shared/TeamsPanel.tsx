import type { ReactNode } from 'react';
import { membersOf, teamsProblem, type Teams } from '@/engine/teams';
import { TEAM_COLORS, teamName, usePlay } from './hooks';
import styles from './TeamsPanel.module.css';

// The "pick teams" phase UI for team games. Players switch themselves
// (`teams.join`); whoever runs the game can move anyone by tapping them
// (`teams.move`), reshuffle (`teams.shuffle`), and start (`onStart`, your
// game's own seatless start action).

export function TeamsPanel({
  teams,
  names,
  onStart,
  startLabel = 'Start the game →',
  minPerTeam = 2,
  children,
}: {
  teams: Teams;
  names: string[];
  /** Host-only start. */
  onStart: () => void;
  startLabel?: string;
  minPerTeam?: number;
  /** Extra notes under the columns. */
  children?: ReactNode;
}) {
  const { seat, isHost, localTable, dispatch } = usePlay();
  const problem = teamsProblem(teams, minPerTeam);
  const myTeam = seat !== null ? teams.of[seat] : undefined;

  const tapMember = (s: number) => {
    if (!isHost) return;
    dispatch({ type: 'teams.move', seat: s, team: ((teams.of[s] ?? 0) + 1) % teams.count });
  };

  return (
    <section className={styles.root}>
      <header className={styles.head}>
        <h2 className={styles.title}>Pick your teams</h2>
        <p className="pg-dim">
          {isHost
            ? 'Tap a name to move them. Shuffle for random teams.'
            : 'Switch sides if you like — the host starts when everyone’s happy.'}
        </p>
      </header>
      <div className={styles.columns} style={{ '--n': teams.count } as React.CSSProperties}>
        {Array.from({ length: teams.count }, (_, t) => {
          const members = membersOf(teams, t);
          return (
            <div key={t} className={styles.team} style={{ '--c': TEAM_COLORS[t] } as React.CSSProperties}>
              <h3 className={styles.teamName}>{teamName(t)}</h3>
              <ul className={styles.members}>
                {members.map((s) => (
                  <li key={s}>
                    <button
                      type="button"
                      className={`${styles.member} ${s === seat && !localTable ? styles.me : ''}`}
                      onClick={() => tapMember(s)}
                      disabled={!isHost}
                    >
                      {names[s] ?? `Player ${s + 1}`}
                    </button>
                  </li>
                ))}
                {members.length === 0 && <li className={styles.empty}>Nobody yet</li>}
              </ul>
              {!localTable && seat !== null && myTeam !== t && (
                <button
                  type="button"
                  className="pg-btn pg-btn-sm pg-btn-ghost"
                  onClick={() => dispatch({ type: 'teams.join', bySeat: seat, team: t })}
                >
                  Join {teamName(t)}
                </button>
              )}
            </div>
          );
        })}
      </div>
      {children}
      {isHost ? (
        <div className={styles.actions}>
          <button type="button" className="pg-btn pg-btn-ghost" onClick={() => dispatch({ type: 'teams.shuffle' })}>
            🔀 Shuffle
          </button>
          <button type="button" className="pg-btn pg-btn-primary pg-btn-lg" onClick={onStart} disabled={!!problem}>
            {startLabel}
          </button>
        </div>
      ) : (
        <p className={styles.wait}>Waiting for the host to start…</p>
      )}
      {problem && isHost && <p className={styles.problem}>{problem}</p>}
    </section>
  );
}
