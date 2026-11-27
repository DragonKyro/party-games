import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { CollectPanel } from '@/ui/shared/CollectPanel';
import { Countdown } from '@/ui/shared/Countdown';
import { FinalResults } from '@/ui/shared/FinalResults';
import { GameShell } from '@/ui/shared/GameShell';
import { TEAM_COLORS, teamName, usePlay } from '@/ui/shared/hooks';
import { PassScreen } from '@/ui/shared/PassScreen';
import { play, vibrate } from '@/ui/shared/sfx';
import { TeamsPanel } from '@/ui/shared/TeamsPanel';
import { useWakeLock } from '@/ui/shared/useWakeLock';
import type { FishbowlAction } from '../actions';
import { ROUND_INFO } from '../rules';
import type { FishbowlView } from '../state';
import { Bowl } from './Bowl';
import styles from './GameView.module.css';

// ============================================================================
// Fishbowl game view
//
// Hidden-info rules for this file:
//  - The slip in hand exists only in the clue-giver's own view (`yourSlip`);
//    nothing else here ever renders a slip that hasn't been guessed.
//  - Single device: the clue-giver claims the phone (PassScreen) before the
//    turn screen with the slip is rendered; the claim is per turn.
// ============================================================================

export default function FishbowlGameView() {
  const { view, seat, isHost, localTable, dispatch, setSeat } = usePlay<FishbowlView>();
  const [claimedTurn, setClaimedTurn] = useState<string | null>(null);
  useWakeLock(!!view && (view.phase === 'turn' || view.phase === 'ready'));
  if (!view) return null;
  const send = (a: FishbowlAction) => dispatch(a);
  const names = view.seats.map((s) => s.name);
  const round = view.rounds[view.roundIndex] ?? view.rounds[0]!;
  const info = ROUND_INFO[round];
  const turnKey = `${view.roundIndex}:${view.turnNo}`;

  const status =
    view.phase === 'collect'
      ? 'Filling the bowl'
      : view.phase === 'teams'
        ? 'Picking teams'
        : view.phase === 'gameOver'
          ? 'Final scores'
          : `Round ${view.roundIndex + 1} of ${view.rounds.length} · ${info.name}`;

  let body: React.ReactNode;
  switch (view.phase) {
    case 'collect':
      body = view.collect && (
        <CollectPanel
          collect={view.collect}
          names={names}
          title="Fill the bowl"
          placeholder="A name, place, thing or phrase"
          hint="Famous people, fictional characters, your friend’s weird ex — anything everyone could guess."
        />
      );
      break;
    case 'teams':
      body = (
        <TeamsPanel teams={view.teams} names={names} onStart={() => send({ type: 'begin' })} startLabel="Start round 1 →">
          <div className={styles.bowlNote}>
            <Bowl count={view.bowlCount} total={view.bowlCount} size={110} />
            <p className="pg-dim">{view.bowlCount} slips in the bowl.</p>
          </div>
        </TeamsPanel>
      );
      break;
    case 'intro':
      body = <RoundIntro view={view} isHost={isHost} onGo={() => send({ type: 'playRound' })} />;
      break;
    case 'ready': {
      const giver = view.clueGiver!;
      if (localTable && claimedTurn !== turnKey) {
        body = (
          <PassScreen
            to={names[giver] ?? '?'}
            message={
              <>
                {teamName(view.clueTeam!)}, get ready to guess!
                {view.carried && <> {Math.round(view.upcomingMs / 1000)}s left over from last round.</>}
              </>
            }
            action={`I'm ${names[giver]} — let's go`}
            onReady={() => {
              setSeat(giver);
              setClaimedTurn(turnKey);
            }}
          >
            {isHost && (
              <button className="pg-btn pg-btn-ghost pg-btn-sm" onClick={() => send({ type: 'skipPlayer' })}>
                Skip {names[giver]}
              </button>
            )}
          </PassScreen>
        );
      } else {
        body = <Ready view={view} seat={seat} localTable={localTable} isHost={isHost} send={send} />;
      }
      break;
    }
    case 'turn':
      body =
        view.yourSlip && (!localTable || claimedTurn === turnKey) ? (
          <GiverTurn view={view} seat={seat!} send={send} />
        ) : (
          <WatchTurn view={view} seat={seat} />
        );
      break;
    case 'gameOver':
      body = <Results view={view} seat={localTable ? null : seat} />;
      break;
  }

  return (
    <GameShell
      gameId="fishbowl"
      status={status}
      right={
        isHost && view.phase === 'turn' && view.timer ? (
          <button
            className="pg-btn pg-btn-sm"
            onClick={() => send({ type: view.timer!.endsAt === null ? 'resume' : 'pause' })}
            aria-label={view.timer.endsAt === null ? 'Resume' : 'Pause'}
          >
            {view.timer.endsAt === null ? '▶' : '❚❚'}
          </button>
        ) : null
      }
    >
      {view.phase !== 'collect' && view.phase !== 'teams' && view.phase !== 'gameOver' && <ScoreStrip view={view} />}
      {body}
    </GameShell>
  );
}

// ----------------------------------------------------------------------------

function ScoreStrip({ view }: { view: FishbowlView }) {
  return (
    <div className={styles.strip}>
      {view.totals.map((score, t) => (
        <div
          key={t}
          className={`${styles.teamScore} ${view.clueTeam === t && (view.phase === 'turn' || view.phase === 'ready') ? styles.active : ''}`}
          style={{ '--c': TEAM_COLORS[t] } as CSSProperties}
        >
          <span className={styles.teamLabel}>{teamName(t)}</span>
          <span className={styles.teamPoints}>{score}</span>
        </div>
      ))}
      <div className={styles.bowlMini} title={`${view.bowlCount} slips left`}>
        <Bowl count={view.bowlCount} total={view.totalSlips} size={54} />
        <span>{view.bowlCount}</span>
      </div>
    </div>
  );
}

function RoundIntro({ view, isHost, onGo }: { view: FishbowlView; isHost: boolean; onGo: () => void }) {
  const round = view.rounds[view.roundIndex]!;
  const info = ROUND_INFO[round];
  const names = view.seats.map((s) => s.name);
  return (
    <section className={styles.intro} key={view.roundIndex}>
      {view.roundIndex > 0 && view.lastTurn && (
        <p className={styles.emptied}>
          🎉 {names[view.lastTurn.seat]} emptied the bowl! Same slips, new rules.
        </p>
      )}
      <span className="pg-kicker">
        Round {view.roundIndex + 1} of {view.rounds.length}
      </span>
      <div className={styles.roundEmoji} aria-hidden>
        {info.emoji}
      </div>
      <h2 className={styles.roundName}>{info.name}</h2>
      <p className={styles.roundRule}>{info.rule}</p>
      <p className="pg-dim">All {view.totalSlips} slips are back in the bowl.</p>
      {isHost ? (
        <button className="pg-btn pg-btn-primary pg-btn-xl" onClick={onGo} autoFocus>
          Let’s go →
        </button>
      ) : (
        <p className="pg-dim">Waiting for the host…</p>
      )}
    </section>
  );
}

function LastTurn({ view }: { view: FishbowlView }) {
  const t = view.lastTurn;
  if (!t) return null;
  const names = view.seats.map((s) => s.name);
  return (
    <div className={styles.lastTurn} style={{ '--c': TEAM_COLORS[t.team] } as CSSProperties}>
      <span className="pg-kicker">Last turn</span>
      <p>
        <b>{names[t.seat]}</b> got <b>{t.got.length}</b>
        {t.got.length > 0 ? ':' : '.'}
      </p>
      {t.got.length > 0 && (
        <div className={styles.gotList}>
          {t.got.map((w, i) => (
            <span key={i} className={styles.gotSlip}>
              {w}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function Ready({
  view,
  seat,
  localTable,
  isHost,
  send,
}: {
  view: FishbowlView;
  seat: number | null;
  localTable: boolean;
  isHost: boolean;
  send: (a: FishbowlAction) => void;
}) {
  const names = view.seats.map((s) => s.name);
  const giver = view.clueGiver!;
  const team = view.clueTeam!;
  const mine = localTable || seat === giver;
  const onTeam = seat !== null && view.teams.of[seat] === team;
  const secs = Math.round(view.upcomingMs / 1000);
  const round = ROUND_INFO[view.rounds[view.roundIndex]!];

  return (
    <section className={styles.ready} style={{ '--c': TEAM_COLORS[team] } as CSSProperties}>
      <span className={styles.teamBadge}>{teamName(team)}</span>
      {mine ? (
        <>
          <h2 className={styles.readyTitle}>{localTable ? `${names[giver]}, you’re up!` : 'You’re up!'}</h2>
          <p className={styles.readyRule}>
            {round.emoji} {round.rule}
          </p>
          <button
            className={`pg-btn pg-btn-primary pg-btn-xl ${styles.go}`}
            onClick={() => {
              play('whoosh');
              send({ type: 'startTurn', bySeat: giver });
            }}
            autoFocus
          >
            Start — {secs}s
          </button>
          {view.carried && <p className="pg-dim">Leftover time from the last round.</p>}
        </>
      ) : (
        <>
          <h2 className={styles.readyTitle}>
            {names[giver]} is up{onTeam ? ' — get ready to guess!' : '.'}
          </h2>
          <p className="pg-dim">
            {onTeam ? 'Shout out answers as fast as you can.' : `${teamName(team)} is guessing. No helping!`}
          </p>
          {isHost && (
            <div className={styles.hostRow}>
              <button className="pg-btn pg-btn-sm" onClick={() => send({ type: 'startTurn' })}>
                Start for {names[giver]}
              </button>
              <button className="pg-btn pg-btn-sm pg-btn-ghost" onClick={() => send({ type: 'skipPlayer' })}>
                Skip {names[giver]}
              </button>
            </div>
          )}
        </>
      )}
      <LastTurn view={view} />
    </section>
  );
}

function GiverTurn({ view, seat, send }: { view: FishbowlView; seat: number; send: (a: FishbowlAction) => void }) {
  const slip = view.yourSlip!;
  const round = ROUND_INFO[view.rounds[view.roundIndex]!];
  const last = view.yourTurnGot[view.yourTurnGot.length - 1];
  const canSkip = view.skipsLeft !== 0 && view.bowlCount > 1;
  // One tap per slip: lock until the next slip arrives.
  const [busy, setBusy] = useState<number | null>(null);
  if (busy !== null && busy !== slip.id) setBusy(null);

  const got = () => {
    if (busy === slip.id) return;
    setBusy(slip.id);
    play('ding');
    vibrate(40);
    send({ type: 'gotIt', bySeat: seat, slip: slip.id });
  };
  const skip = () => {
    if (busy === slip.id || !canSkip) return;
    setBusy(slip.id);
    play('pass');
    send({ type: 'skip', bySeat: seat, slip: slip.id });
  };

  return (
    <section className={styles.turn}>
      <div className={styles.turnTop}>
        <Countdown timer={view.timer} size="lg" beep />
        <div className={styles.turnCount}>
          <span className={styles.bigNum}>{view.turnGotCount}</span>
          <span className="pg-kicker">got it</span>
        </div>
      </div>
      <p className={styles.reminder}>
        {round.emoji} {round.name}
      </p>
      <div className={`${styles.slip} pg-hand`} key={slip.id}>
        {slip.text}
      </div>
      <div className={styles.turnButtons}>
        <button className={`pg-btn pg-btn-ghost pg-btn-lg ${styles.skipBtn}`} onClick={skip} disabled={!canSkip}>
          Skip{view.skipsLeft !== null && view.skipsLeft > 0 ? ` (${view.skipsLeft})` : ''}
        </button>
        <button className={`pg-btn pg-btn-good pg-btn-xl ${styles.gotBtn}`} onClick={got}>
          Got it ✓
        </button>
      </div>
      {last && (
        <button className={styles.undo} onClick={() => send({ type: 'undo', bySeat: seat, slip: last.id })}>
          ↶ Oops — “{last.text}” wasn’t right
        </button>
      )}
    </section>
  );
}

function WatchTurn({ view, seat }: { view: FishbowlView; seat: number | null }) {
  const names = view.seats.map((s) => s.name);
  const giver = view.clueGiver!;
  const team = view.clueTeam!;
  const onTeam = seat !== null && view.teams.of[seat] === team;
  const round = ROUND_INFO[view.rounds[view.roundIndex]!];
  const count = view.turnGotCount;
  const prev = useRef(count);
  const [bump, setBump] = useState(0);
  useEffect(() => {
    if (count > prev.current) {
      play('ding');
      setBump((b) => b + 1);
    }
    prev.current = count;
  }, [count]);

  return (
    <section className={styles.watch} style={{ '--c': TEAM_COLORS[team] } as CSSProperties}>
      <Countdown timer={view.timer} size="xl" beep />
      <h2 className={styles.watchTitle}>
        {onTeam ? 'GUESS!' : `${names[giver]} is ${round.name === 'Act it out' ? 'acting' : 'giving clues'}`}
      </h2>
      <p className="pg-dim">
        {round.emoji} {round.name} · {names[giver]} for {teamName(team)}
      </p>
      <div className={styles.watchCount} key={bump}>
        <span className={styles.bigNum}>{count}</span>
        <span className="pg-kicker">this turn</span>
      </div>
    </section>
  );
}

function Results({ view, seat }: { view: FishbowlView; seat: number | null }) {
  const r = view.results!;
  const names = view.seats.map((s) => s.name);
  const best = Math.max(...view.totals);
  const winners = view.totals.map((s, t) => (s === best ? t : -1)).filter((t) => t >= 0);
  const headline = winners.length > 1 ? 'It’s a tie!' : `${teamName(winners[0]!)} wins!`;
  const rows = view.totals.map((score, t) => ({
    name: teamName(t),
    score,
    color: TEAM_COLORS[t],
    detail: view.seats.filter((_, s) => view.teams.of[s] === t).map((s) => s.name).join(', '),
    you: seat !== null && view.teams.of[seat] === t,
  }));
  return (
    <FinalResults headline={headline} rows={rows} unit="slips">
      {r.bestClueGiver && (
        <p className={styles.award}>
          🏅 Best clue-giver: <b>{names[r.bestClueGiver.seat]}</b> with {r.bestClueGiver.got} slips
        </p>
      )}
      <details className={styles.allSlips}>
        <summary>Everything in the bowl ({r.slips.length})</summary>
        <div className={styles.gotList}>
          {r.slips.map((s, i) => (
            <span key={i} className={styles.gotSlip} title={s.author ? `Written by ${s.author}` : undefined}>
              {s.text}
              {s.author && <small> — {s.author}</small>}
            </span>
          ))}
        </div>
      </details>
    </FinalResults>
  );
}
