import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react';
import type { SeatIndex } from '@/engine/types';
import { CollectPanel } from '@/ui/shared/CollectPanel';
import { Countdown } from '@/ui/shared/Countdown';
import { FinalResults } from '@/ui/shared/FinalResults';
import { GameShell } from '@/ui/shared/GameShell';
import { seatColor, usePlay } from '@/ui/shared/hooks';
import { PassScreen } from '@/ui/shared/PassScreen';
import { play, vibrate } from '@/ui/shared/sfx';
import { useWakeLock } from '@/ui/shared/useWakeLock';
import type { TuneInAction } from '../actions';
import { MAX_CLUE, MAX_POINTS, POINT_LABELS, RATING_TIERS, cleanClue, clueProblem } from '../rules';
import type { RoundRecord, TuneInView } from '../state';
import { Dial, SignalBars, endColors, freq, type DialMarker } from './Dial';
import styles from './GameView.module.css';

// ============================================================================
// Tune In game view
//
// Hidden-info rules for this file:
//  - The target and the two spectrum options exist only in the Tuner's own
//    view (`yourTarget`, `yourOptions`); nothing here renders them otherwise.
//  - Everyone mode: a guesser's needle is only in their own view
//    (`yourNeedle`) until the reveal.
//  - Single device: the Tuner claims the phone (PassScreen) before the desk
//    with the target is rendered; after going on air the screen drops back to
//    the table's seat-null view behind a cover. Private guesses run a roster
//    pass loop, each behind its own PassScreen.
// ============================================================================

type Send = (a: TuneInAction) => void;

/** Needle moves go out at most this often (~6 a second). */
const SEND_MS = 160;
/** After letting go, show your own value this long while the host catches up. */
const RELEASE_MS = 900;

const seatPart = (seat: SeatIndex | null) => (seat === null ? {} : { bySeat: seat });

export default function TuneInGameView() {
  const { view, seat, isHost, localTable, dispatch, setSeat } = usePlay<TuneInView>();
  // Single device: the turn whose Tuner has claimed the phone, and whose cover has been lifted.
  const [claimed, setClaimed] = useState<number | null>(null);
  const [uncovered, setUncovered] = useState<number | null>(null);
  useWakeLock(!!view && view.phase !== 'gameOver');

  const phase = view?.phase;
  const turnNo = view?.turnNo;
  // Single device: reveals and results belong to the whole table.
  useEffect(() => {
    if (localTable && (phase === 'reveal' || phase === 'gameOver')) setSeat(null);
    // "Play again" starts back at turn 0: forget this match's claims.
    if (phase === 'gameOver') {
      setClaimed(null);
      setUncovered(null);
    }
  }, [localTable, phase]);
  // A little jingle when a clue goes on air.
  useEffect(() => {
    if (phase === 'guess') play('join');
  }, [phase, turnNo]);

  if (!view) return null;
  const send: Send = (a) => dispatch(a);
  const names = view.seats.map((s) => s.name);
  const tuner = view.tuner;
  const tunerName = tuner !== null ? (names[tuner] ?? '?') : '';

  const status =
    view.phase === 'collect'
      ? 'Writing spectrums'
      : view.phase === 'gameOver'
        ? 'Final results'
        : `Round ${view.round + 1} of ${view.totalRounds} · ${tunerName} is tuning`;

  let body: ReactNode = null;
  switch (view.phase) {
    case 'collect':
      body = view.collect && (
        <CollectPanel
          collect={view.collect}
          names={names}
          title="Write some spectrums"
          hint="Two opposite ends of a scale: Cold ↔ Hot, Overrated ↔ Underrated, Villain ↔ Hero. Opinions make the best ones."
        />
      );
      break;

    case 'tune': {
      const t = tuner!;
      const mine = view.yourOptions !== null && view.yourTarget !== null && seat === t;
      if (localTable && (claimed !== view.turnNo || !mine)) {
        body = (
          <PassScreen
            to={tunerName}
            icon="📻"
            message="You’re the Tuner this round. Everyone else, eyes off the screen!"
            action={`I’m ${tunerName}, show me the station`}
            onReady={() => {
              setSeat(t);
              setClaimed(view.turnNo);
            }}
          >
            {isHost && (
              <button className="pg-btn pg-btn-ghost pg-btn-sm" onClick={() => send({ type: 'skipTuner' })}>
                Skip {tunerName}
              </button>
            )}
          </PassScreen>
        );
      } else if (mine) {
        body = (
          <TunerDesk
            key={view.turnNo}
            view={view}
            onSubmit={(pick, clue) => {
              play('whoosh');
              send({ type: 'tune', bySeat: t, turn: view.turnNo, pick, clue });
              if (localTable) setSeat(null);
            }}
          />
        );
      } else {
        body = <WaitForTuner name={tunerName} isHost={isHost} onSkip={() => send({ type: 'skipTuner' })} />;
      }
      break;
    }

    case 'guess':
      if (localTable && uncovered !== view.turnNo) {
        body = (
          <PassScreen
            to="the whole table"
            icon="📡"
            message={<>{tunerName}’s clue is on air. Tuner: poker face from here on!</>}
            action="We’re ready, show the clue"
            onReady={() => {
              setSeat(null);
              setUncovered(view.turnNo);
            }}
          />
        );
      } else if (localTable) {
        body =
          view.mode === 'team' ? (
            <TeamGuess view={view} seat={null} send={send} />
          ) : (
            <PassAround key={view.turnNo} view={view} seat={seat} send={send} setSeat={setSeat} />
          );
      } else if (seat !== null && seat === tuner) {
        body = <TunerWatch view={view} />;
      } else if (seat !== null) {
        body =
          view.mode === 'team' ? (
            <TeamGuess view={view} seat={seat} send={send} />
          ) : (
            <SoloGuess key={view.turnNo} view={view} seat={seat} send={send} />
          );
      } else {
        body = <Spectate view={view} />;
      }
      break;

    case 'reveal':
      body = <Reveal key={view.turnNo} view={view} me={localTable ? null : seat} isHost={isHost} send={send} />;
      break;

    case 'gameOver':
      body = <Results view={view} me={localTable ? null : seat} />;
      break;
  }

  const inRound = view.phase === 'tune' || view.phase === 'guess' || view.phase === 'reveal';

  return (
    <GameShell
      gameId="tune-in"
      status={status}
      right={
        isHost && view.phase === 'guess' && view.timer ? (
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
      {inRound && <ScoreStrip view={view} me={localTable ? null : seat} />}
      {body}
      {isHost && view.phase !== 'gameOver' && <HostBar view={view} send={send} />}
    </GameShell>
  );
}

// ----------------------------------------------------------------------------
// Needle input: local value while dragging, throttled sends, host catch-up
// ----------------------------------------------------------------------------

function useThrottle(fn: (v: number) => void, ms: number) {
  const fnRef = useRef(fn);
  useEffect(() => {
    fnRef.current = fn;
  });
  const st = useRef<{ last: number; pending: number | null; timer: ReturnType<typeof setTimeout> | null }>({
    last: 0,
    pending: null,
    timer: null,
  });
  useEffect(
    () => () => {
      if (st.current.timer) clearTimeout(st.current.timer);
    },
    [],
  );
  return useMemo(() => {
    const s = st.current;
    const flush = () => {
      if (s.timer) clearTimeout(s.timer);
      s.timer = null;
      if (s.pending === null) return;
      const v = s.pending;
      s.pending = null;
      s.last = performance.now();
      fnRef.current(v);
    };
    const push = (v: number) => {
      s.pending = v;
      const wait = ms - (performance.now() - s.last);
      if (wait <= 0) flush();
      else if (!s.timer) s.timer = setTimeout(flush, wait);
    };
    const cancel = () => {
      if (s.timer) clearTimeout(s.timer);
      s.timer = null;
      s.pending = null;
    };
    return { push, flush, cancel };
  }, [ms]);
}

function useNeedle(server: number | null, send: (v: number) => void) {
  const [local, setLocal] = useState<number | null>(null);
  const dragging = useRef(false);
  const release = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTick = useRef(0);
  const throttle = useThrottle(send, SEND_MS);

  // Drop the local override once the host has caught up with it.
  useEffect(() => {
    if (!dragging.current && local !== null && server === local) setLocal(null);
  }, [server, local]);
  useEffect(
    () => () => {
      if (release.current) clearTimeout(release.current);
    },
    [],
  );

  const clearRelease = () => {
    if (release.current) clearTimeout(release.current);
    release.current = null;
  };
  const set = (v: number) => {
    const prev = local ?? server;
    // A soft click every 5 steps, like a detented tuning knob.
    if (prev !== v && (prev === null || Math.floor(prev / 5) !== Math.floor(v / 5))) {
      const now = performance.now();
      if (now - lastTick.current > 40) {
        lastTick.current = now;
        play('tick');
      }
    }
    setLocal(v);
    throttle.push(v);
  };
  const begin = () => {
    dragging.current = true;
    clearRelease();
  };
  const end = () => {
    dragging.current = false;
    throttle.flush();
    clearRelease();
    release.current = setTimeout(() => setLocal(null), RELEASE_MS);
  };
  return {
    value: local ?? server,
    active: local !== null,
    set,
    begin,
    end,
    nudge: (v: number) => {
      set(Math.max(0, Math.min(100, v)));
      end();
    },
    cancel: throttle.cancel,
  };
}

// ----------------------------------------------------------------------------
// Pieces
// ----------------------------------------------------------------------------

function NowPlaying({
  clue,
  left,
  right,
  tunerName,
  author,
}: {
  clue: string;
  left: string;
  right: string;
  tunerName: string;
  author?: string | null;
}) {
  const [lc, rc] = endColors(left, right);
  return (
    <div className={styles.np} role="status">
      <div className={styles.npTop}>
        <span className={styles.onAir}>
          <i aria-hidden /> On air
        </span>
        <span className={styles.npKicker}>Now playing</span>
        <span className={styles.eq} aria-hidden>
          <i />
          <i />
          <i />
          <i />
          <i />
        </span>
      </div>
      <p className={styles.npClue} key={clue}>
        {clue}
      </p>
      <p className={styles.npSub}>
        {tunerName}’s clue · <span style={{ color: lc }}>{left}</span> ↔ <span style={{ color: rc }}>{right}</span>
        {author && <> · spectrum by {author}</>}
      </p>
    </div>
  );
}

function OnAir({ view }: { view: TuneInView }) {
  const names = view.seats.map((s) => s.name);
  return (
    <>
      <NowPlaying
        clue={view.clue ?? ''}
        left={view.spectrum!.left}
        right={view.spectrum!.right}
        tunerName={names[view.tuner!] ?? '?'}
      />
      {view.timer && (
        <div className={styles.timerRow}>
          <Countdown timer={view.timer} size="md" beep />
          <span className="pg-dim">Lock in before the signal fades!</span>
        </div>
      )}
    </>
  );
}

function FineTune({ value, onStep }: { value: number; onStep: (delta: number) => void }) {
  return (
    <div className={styles.fine}>
      <button type="button" className={styles.fineBtn} onClick={() => onStep(-1)} disabled={value <= 0} aria-label="Nudge left">
        −
      </button>
      <div className={styles.readout} aria-live="polite">
        <span className={styles.readoutFreq}>{freq(value)}</span>
        <small>FM</small>
      </div>
      <button type="button" className={styles.fineBtn} onClick={() => onStep(1)} disabled={value >= 100} aria-label="Nudge right">
        +
      </button>
    </div>
  );
}

function LockRoster({ view, onPick }: { view: TuneInView; onPick?: (seat: SeatIndex) => void }) {
  const t = view.tuner;
  const count = view.locked.filter(Boolean).length;
  const prev = useRef(count);
  useEffect(() => {
    if (count > prev.current) play('tock');
    prev.current = count;
  }, [count]);
  const guessers = view.seats.filter((s) => s.index !== t);
  return (
    <div className={styles.rosterBox}>
      <span className="pg-kicker">
        {count} of {guessers.length} locked in
      </span>
      <ul className={styles.roster}>
        {guessers.map((s) => {
          const done = view.locked[s.index];
          return (
            <li key={s.index}>
              <button
                type="button"
                className={`${styles.person} ${done ? styles.personDone : ''}`}
                onClick={onPick && !done ? () => onPick(s.index) : undefined}
                disabled={!onPick || done}
                style={{ '--c': seatColor(s.index) } as CSSProperties}
              >
                <span className={styles.dot} />
                {s.name}
                <span className={styles.check}>{done ? '🔒' : '…'}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ScoreStrip({ view, me }: { view: TuneInView; me: SeatIndex | null }) {
  if (view.mode === 'team') {
    return (
      <div className={styles.teamStrip}>
        <div className={styles.teamTotal}>
          <span className="pg-kicker">Team score</span>
          <b>{view.teamTotal}</b>
        </div>
        <div className={styles.roundDots} aria-label={`Round ${view.round + 1} of ${view.totalRounds}`}>
          {Array.from({ length: view.totalRounds }, (_, i) => {
            const r = view.history[i];
            const pts = r?.team?.points ?? 0;
            return (
              <span
                key={i}
                className={`${styles.roundDot} ${r ? styles.played : ''} ${i === view.round && !r ? styles.current : ''}`}
                style={{ '--p': pts / MAX_POINTS } as CSSProperties}
                title={r ? `Round ${i + 1}: ${pts}` : `Round ${i + 1}`}
              >
                {r ? pts : ''}
              </span>
            );
          })}
        </div>
      </div>
    );
  }
  return (
    <div className={styles.strip}>
      {view.seats.map((s) => {
        const isTuner = s.index === view.tuner;
        const locked = view.phase === 'guess' && view.locked[s.index];
        return (
          <span
            key={s.index}
            className={`${styles.chip} ${isTuner ? styles.chipTuner : ''} ${s.index === me ? styles.chipMe : ''}`}
            style={{ '--c': seatColor(s.index) } as CSSProperties}
          >
            <span className={styles.dot} />
            <span className={styles.chipName}>{s.name}</span>
            <b>{view.scores[s.index]}</b>
            {isTuner && <span aria-label="Tuner">📻</span>}
            {locked && <span aria-label="Locked in">🔒</span>}
          </span>
        );
      })}
    </div>
  );
}

function HostBar({ view, send }: { view: TuneInView; send: Send }) {
  return (
    <div className={styles.hostBar}>
      <span className="pg-kicker">Host</span>
      {view.phase === 'guess' && (
        <button className="pg-btn pg-btn-sm" onClick={() => send({ type: 'reveal' })}>
          Reveal now
        </button>
      )}
      <button
        className="pg-btn pg-btn-sm pg-btn-ghost"
        onClick={() => {
          if (typeof window.confirm === 'function' && !window.confirm('End the game now and show the results?')) return;
          send({ type: 'finish' });
        }}
      >
        End game
      </button>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Tuning
// ----------------------------------------------------------------------------

function TunerDesk({ view, onSubmit }: { view: TuneInView; onSubmit: (pick: number, clue: string) => void }) {
  const options = view.yourOptions!;
  const target = view.yourTarget!;
  const [pick, setPick] = useState(0);
  const [clue, setClue] = useState('');
  const [tried, setTried] = useState(false);
  const spec = options[pick] ?? options[0]!;
  const cleaned = cleanClue(clue);
  const problem = clueProblem(cleaned, spec.left, spec.right);

  useEffect(() => {
    play('reveal');
  }, []);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setTried(true);
    if (problem) {
      play('error');
      return;
    }
    onSubmit(pick, cleaned);
  };

  return (
    <form className={styles.desk} onSubmit={submit}>
      <header className={styles.deskHead}>
        <span className="pg-kicker">You’re the Tuner</span>
        <h2 className={styles.deskTitle}>
          Your secret station: <span className={styles.freqTag}>{freq(target)} FM</span>
        </h2>
      </header>

      <Dial left={spec.left} right={spec.right} target={target} bands={view.bands} label="Your secret station" />

      <div className={styles.presets} role="radiogroup" aria-label="Pick a spectrum">
        {options.map((o, i) => {
          const [lc, rc] = endColors(o.left, o.right);
          return (
            <button
              key={i}
              type="button"
              role="radio"
              aria-checked={pick === i}
              className={`${styles.preset} ${pick === i ? styles.presetOn : ''}`}
              style={{ '--lc': lc, '--rc': rc } as CSSProperties}
              onClick={() => {
                if (pick !== i) play('pop');
                setPick(i);
              }}
            >
              <span className={styles.presetNum}>Preset {i + 1}</span>
              <span className={styles.presetEnds}>
                <span style={{ color: lc }}>{o.left}</span>
                <span aria-hidden> ↔ </span>
                <span style={{ color: rc }}>{o.right}</span>
              </span>
            </button>
          );
        })}
      </div>

      <label className={styles.clueField}>
        <span className={styles.clueLabel}>Your clue</span>
        <input
          className={`pg-input ${styles.clueInput}`}
          value={clue}
          onChange={(e) => setClue(e.target.value)}
          maxLength={MAX_CLUE}
          placeholder="A thing, person or phrase that sits right there"
          autoComplete="off"
          enterKeyHint="send"
        />
        <span className={styles.counter}>
          {clue.length}/{MAX_CLUE}
        </span>
      </label>
      {tried && problem && (
        <p className={styles.error} role="alert">
          {problem}
        </p>
      )}
      <p className={styles.deskHint}>
        Where would your clue sit between <b>{spec.left}</b> and <b>{spec.right}</b>? Don’t just say a number.
      </p>
      <button type="submit" className="pg-btn pg-btn-primary pg-btn-xl" disabled={!cleaned}>
        📡 Go on air
      </button>
    </form>
  );
}

function WaitForTuner({ name, isHost, onSkip }: { name: string; isHost: boolean; onSkip: () => void }) {
  return (
    <section className={styles.wait}>
      <div className={styles.static} aria-hidden>
        <span>📻</span>
      </div>
      <h2 className={styles.waitTitle}>{name} is finding a station…</h2>
      <p className="pg-dim">They’re picking a spectrum and writing a clue. Stay tuned.</p>
      {isHost && (
        <button className="pg-btn pg-btn-ghost pg-btn-sm" onClick={onSkip}>
          Skip {name}
        </button>
      )}
    </section>
  );
}

// ----------------------------------------------------------------------------
// Guessing
// ----------------------------------------------------------------------------

/** Everyone mode: my own private needle. */
function SoloGuess({
  view,
  seat,
  send,
  onDone,
  onBack,
}: {
  view: TuneInView;
  seat: SeatIndex;
  send: Send;
  /** Single device: called after locking (hand the phone on). */
  onDone?: () => void;
  onBack?: () => void;
}) {
  const locked = !!view.locked[seat];
  const n = useNeedle(view.yourNeedle, (v) => send({ type: 'move', bySeat: seat, turn: view.turnNo, value: v }));
  const value = n.value ?? 50;
  const lock = () => {
    n.cancel();
    play('pop');
    vibrate(40);
    send({ type: 'lock', bySeat: seat, turn: view.turnNo, value });
    onDone?.();
  };
  const sp = view.spectrum!;
  return (
    <section className={styles.guess}>
      <OnAir view={view} />
      <Dial
        left={sp.left}
        right={sp.right}
        needle={value}
        dimNeedle={n.value === null}
        onChange={locked ? undefined : n.set}
        onDragStart={n.begin}
        onDragEnd={n.end}
        label="Your needle"
      />
      {locked ? (
        <p className={styles.lockedNote}>🔒 Locked in at {freq(value)} FM. Waiting for the others…</p>
      ) : (
        <>
          <FineTune value={value} onStep={(d) => n.nudge(value + d)} />
          <p className="pg-dim" style={{ textAlign: 'center' }}>
            {n.value === null ? 'Drag the dial to where you think the station is.' : 'Happy with it? Lock it in.'}
          </p>
          <div className={styles.actions}>
            {onBack && (
              <button type="button" className="pg-btn pg-btn-ghost pg-btn-lg" onClick={onBack}>
                Not yet
              </button>
            )}
            <button type="button" className={`pg-btn pg-btn-primary pg-btn-xl ${styles.lockBtn}`} onClick={lock}>
              🔒 Lock it in
            </button>
          </div>
        </>
      )}
      {!onDone && <LockRoster view={view} />}
    </section>
  );
}

/** Single device, everyone mode: a roster; each guesser takes the phone in turn. */
function PassAround({
  view,
  seat,
  send,
  setSeat,
}: {
  view: TuneInView;
  seat: SeatIndex | null;
  send: Send;
  setSeat: (s: SeatIndex | null) => void;
}) {
  const names = view.seats.map((s) => s.name);
  const [who, setWho] = useState<SeatIndex | null>(null);
  const [claimed, setClaimed] = useState(false);
  const back = () => {
    setWho(null);
    setClaimed(false);
    setSeat(null);
  };

  if (who !== null && !claimed) {
    return (
      <PassScreen
        to={names[who] ?? '?'}
        icon="🎛️"
        message="Set your needle in private. No peeking, everyone else!"
        onReady={() => {
          setSeat(who);
          setClaimed(true);
        }}
      >
        <button className="pg-btn pg-btn-ghost pg-btn-sm" onClick={back}>
          Back
        </button>
      </PassScreen>
    );
  }
  if (who !== null && claimed && seat === who) {
    return <SoloGuess key={who} view={view} seat={who} send={send} onDone={back} onBack={back} />;
  }
  return (
    <section className={styles.guess}>
      <OnAir view={view} />
      <Dial left={view.spectrum!.left} right={view.spectrum!.right} label="The dial" />
      <p className={styles.passHint}>Tap your name, set your needle in private, then pass the phone on.</p>
      <LockRoster view={view} onPick={(i) => setWho(i)} />
    </section>
  );
}

/** Team mode: the one shared needle, live. `seat` null = the host / a single-device table. */
function TeamGuess({ view, seat, send }: { view: TuneInView; seat: SeatIndex | null; send: Send }) {
  const shared = view.shared!;
  const names = view.seats.map((s) => s.name);
  const n = useNeedle(shared.value, (v) => send({ type: 'move', ...seatPart(seat), turn: view.turnNo, value: v }));
  const value = n.value ?? shared.value;
  const lock = () => {
    n.cancel();
    play('pop');
    vibrate(40);
    send({ type: 'lock', ...seatPart(seat), turn: view.turnNo, value });
  };
  const sp = view.spectrum!;
  const mover = shared.by !== null && shared.by !== seat ? names[shared.by] : null;
  return (
    <section className={styles.guess}>
      <OnAir view={view} />
      <Dial
        left={sp.left}
        right={sp.right}
        needle={value}
        smooth={!n.active}
        dimNeedle={!shared.touched && !n.active}
        onChange={n.set}
        onDragStart={n.begin}
        onDragEnd={n.end}
        label="The team’s needle"
      />
      <p className={styles.mover}>
        {mover && !n.active ? (
          <>
            🎛️ <b style={{ color: seatColor(shared.by!) }}>{mover}</b> has the dial
          </>
        ) : (
          'Anyone can turn the dial. Talk it through!'
        )}
      </p>
      <FineTune value={value} onStep={(d) => n.nudge(value + d)} />
      <button type="button" className={`pg-btn pg-btn-primary pg-btn-xl ${styles.lockBtn}`} onClick={lock}>
        🔒 Lock it in
      </button>
    </section>
  );
}

/** The Tuner, online, while the others guess: the station is still visible to them. */
function TunerWatch({ view }: { view: TuneInView }) {
  const sp = view.spectrum!;
  const team = view.mode === 'team';
  return (
    <section className={styles.guess}>
      <OnAir view={view} />
      <Dial
        left={sp.left}
        right={sp.right}
        target={view.yourTarget}
        bands={view.bands}
        needle={team ? view.shared!.value : null}
        smooth
        dimNeedle={team && !view.shared!.touched}
        label="Your station"
      />
      <p className={styles.lockedNote}>
        Your station: <b>{view.yourTarget !== null ? freq(view.yourTarget) : '?'} FM</b>. Poker face! 🤐
      </p>
      {!team && <LockRoster view={view} />}
    </section>
  );
}

function Spectate({ view }: { view: TuneInView }) {
  const sp = view.spectrum!;
  const team = view.mode === 'team';
  return (
    <section className={styles.guess}>
      <OnAir view={view} />
      <Dial
        left={sp.left}
        right={sp.right}
        needle={team ? view.shared!.value : null}
        smooth
        dimNeedle={team && !view.shared!.touched}
        label="The dial"
      />
      {!team && <LockRoster view={view} />}
    </section>
  );
}

// ----------------------------------------------------------------------------
// Reveal
// ----------------------------------------------------------------------------

function Reveal({ view, me, isHost, send }: { view: TuneInView; me: SeatIndex | null; isHost: boolean; send: Send }) {
  const r = view.reveal!;
  const names = view.seats.map((s) => s.name);
  const team = view.mode === 'team';
  const best = team ? (r.team?.points ?? 0) : Math.max(0, ...r.guesses.map((g) => g.points));

  useEffect(() => {
    play('whoosh');
    const t1 = setTimeout(() => play('reveal'), 720);
    const t2 = setTimeout(() => {
      if (best >= 3) {
        play('ding');
        vibrate(60);
      }
    }, 1350);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
    // Once per reveal.
  }, []);

  const markers: DialMarker[] = team
    ? []
    : r.guesses
        .filter((g) => g.needle !== null)
        .map((g) => ({
          key: g.seat,
          value: g.needle!,
          color: seatColor(g.seat),
          label: names[g.seat] ?? '?',
          you: g.seat === me,
        }));
  const last = view.round + 1 >= view.totalRounds;

  return (
    <section className={styles.reveal}>
      <NowPlaying
        clue={r.clue}
        left={r.left}
        right={r.right}
        tunerName={names[r.tuner] ?? '?'}
        author={r.author !== null ? names[r.author] : null}
      />
      <Dial
        left={r.left}
        right={r.right}
        target={r.target}
        bands={view.bands}
        zones="reveal"
        zonesKey={view.turnNo}
        markers={markers}
        needle={team ? (r.team?.needle ?? null) : null}
        label="The reveal"
      />
      <div className={styles.after}>
        <p className={styles.stationLine}>
          The station was at <b>{freq(r.target)} FM</b>
        </p>
        {team ? <TeamResult r={r} view={view} /> : <GuessList r={r} view={view} me={me} />}
        <div className={styles.actions}>
          {isHost ? (
            <button className="pg-btn pg-btn-primary pg-btn-lg" onClick={() => send({ type: 'next' })} autoFocus>
              {last ? 'See the results →' : 'Next round →'}
            </button>
          ) : (
            <p className="pg-dim">Waiting for the host…</p>
          )}
        </div>
      </div>
    </section>
  );
}

function TeamResult({ r, view }: { r: RoundRecord; view: TuneInView }) {
  const pts = r.team?.points ?? 0;
  const names = view.seats.map((s) => s.name);
  return (
    <div className={`${styles.teamResult} ${pts === MAX_POINTS ? styles.bullseye : ''}`}>
      <div className={styles.bigPts}>
        <span>+{pts}</span>
        <SignalBars points={pts} size={30} />
      </div>
      <p className={styles.ptsLabel}>{r.team?.needle === null ? 'Nobody touched the dial' : POINT_LABELS[pts]}</p>
      <p className="pg-dim">
        Team total <b>{view.teamTotal}</b>
        {r.team?.by !== null && r.team?.by !== undefined && <> · last touch: {names[r.team.by]}</>}
      </p>
    </div>
  );
}

function GuessList({ r, view, me }: { r: RoundRecord; view: TuneInView; me: SeatIndex | null }) {
  const names = view.seats.map((s) => s.name);
  const rows = r.guesses
    .slice()
    .sort(
      (a, b) =>
        b.points - a.points ||
        (a.needle === null ? 999 : Math.abs(a.needle - r.target)) - (b.needle === null ? 999 : Math.abs(b.needle - r.target)),
    );
  return (
    <ol className={`${styles.results} pg-stagger`}>
      {rows.map((g, i) => (
        <li
          key={g.seat}
          className={`${styles.resultRow} ${g.seat === me ? styles.resultMe : ''} ${g.points === MAX_POINTS ? styles.bullseye : ''}`}
          style={{ '--c': seatColor(g.seat), '--i': i } as CSSProperties}
        >
          <span className={styles.dot} />
          <span className={styles.resultName}>
            {names[g.seat]}
            <small>
              {g.needle === null
                ? 'never touched the dial'
                : `${Math.abs(g.needle - r.target) === 0 ? 'dead on' : `off by ${Math.abs(g.needle - r.target)}`}${g.locked ? '' : ' · auto-locked'}`}
            </small>
          </span>
          <SignalBars points={g.points} />
          <span className={styles.resultPts}>+{g.points}</span>
        </li>
      ))}
      <li className={`${styles.resultRow} ${styles.tunerRow}`} style={{ '--c': seatColor(r.tuner), '--i': rows.length } as CSSProperties}>
        <span aria-hidden>📻</span>
        <span className={styles.resultName}>
          {names[r.tuner]} <small>Tuner · average of the guessers, rounded up</small>
        </span>
        <SignalBars points={r.tunerPoints} />
        <span className={styles.resultPts}>+{r.tunerPoints}</span>
      </li>
    </ol>
  );
}

// ----------------------------------------------------------------------------
// Results
// ----------------------------------------------------------------------------

function Results({ view, me }: { view: TuneInView; me: SeatIndex | null }) {
  const names = view.seats.map((s) => s.name);
  const played = view.history.length;

  if (view.mode === 'team') {
    const rating = view.rating;
    const rows = view.seats.map((s) => {
      const mine = view.history.filter((r) => r.tuner === s.index);
      return {
        name: s.name,
        score: mine.reduce((sum, r) => sum + (r.team?.points ?? 0), 0),
        color: seatColor(s.index),
        detail: mine.length ? `points from ${mine.length} clue${mine.length === 1 ? '' : 's'}` : 'didn’t tune',
        you: s.index === me,
      };
    });
    return (
      <FinalResults
        headline={rating ? `${rating.emoji} ${rating.name}` : 'No rounds played'}
        subline={
          rating ? (
            <>
              {view.teamTotal} of {played * MAX_POINTS} points. {rating.blurb}
            </>
          ) : undefined
        }
        rows={rows}
        unit="pts"
      >
        {rating && <RatingScale index={rating.index} />}
        <RoundRecap view={view} />
      </FinalResults>
    );
  }

  const bulls = new Array<number>(view.seats.length).fill(0);
  const tuned = new Array<number>(view.seats.length).fill(0);
  for (const r of view.history) {
    for (const g of r.guesses) if (g.points === MAX_POINTS) bulls[g.seat]! += 1;
    tuned[r.tuner]! += r.tunerPoints;
  }
  const top = Math.max(...view.scores);
  const winners = view.seats.filter((s) => view.scores[s.index] === top);
  const headline =
    played === 0 ? 'No rounds played' : winners.length > 1 ? 'It’s a tie!' : `${winners[0]!.name} wins!`;
  const rows = view.seats.map((s) => ({
    name: s.name,
    score: view.scores[s.index] ?? 0,
    color: seatColor(s.index),
    detail: `${bulls[s.index]} bullseye${bulls[s.index] === 1 ? '' : 's'} · ${tuned[s.index]} as Tuner`,
    you: s.index === me,
  }));
  const sharpest = argmax(bulls);
  const broadcaster = argmax(tuned);
  return (
    <FinalResults headline={headline} rows={rows} unit="pts">
      {(sharpest !== null || broadcaster !== null) && (
        <div className={styles.awards}>
          {sharpest !== null && (
            <p>
              🎯 Sharpest ears: <b>{names[sharpest]}</b> with {bulls[sharpest]} bullseye{bulls[sharpest] === 1 ? '' : 's'}
            </p>
          )}
          {broadcaster !== null && (
            <p>
              📡 Best broadcaster: <b>{names[broadcaster]}</b> with {tuned[broadcaster]} points as Tuner
            </p>
          )}
        </div>
      )}
      <RoundRecap view={view} />
    </FinalResults>
  );
}

/** The single best seat (null on a tie or all zero). */
function argmax(xs: number[]): number | null {
  const best = Math.max(0, ...xs);
  if (best <= 0) return null;
  const at = xs.map((x, i) => (x === best ? i : -1)).filter((i) => i >= 0);
  return at.length === 1 ? at[0]! : null;
}

function RatingScale({ index }: { index: number }) {
  return (
    <ol className={styles.tiers}>
      {RATING_TIERS.map((t) => (
        <li key={t.index} className={t.index === index ? styles.tierOn : ''}>
          <span aria-hidden>{t.emoji}</span> {t.name}
          <small>{Math.round(t.min * 100)}%+</small>
        </li>
      ))}
    </ol>
  );
}

function RoundRecap({ view }: { view: TuneInView }) {
  const names = view.seats.map((s) => s.name);
  if (view.history.length === 0) return null;
  return (
    <details className={styles.recap}>
      <summary>Every round ({view.history.length})</summary>
      <ol>
        {view.history.map((r, i) => {
          const [lc, rc] = endColors(r.left, r.right);
          const pts = r.team ? r.team.points : r.tunerPoints;
          return (
            <li key={i} className={styles.recapRow}>
              <div className={styles.recapText}>
                <b>“{r.clue}”</b>
                <small>
                  {names[r.tuner]} · {r.left} ↔ {r.right}
                </small>
              </div>
              <div className={styles.mini} style={{ '--lc': lc, '--rc': rc } as CSSProperties} aria-hidden>
                <span className={styles.miniTarget} style={{ left: `${r.target}%` }} />
                {r.team && r.team.needle !== null && (
                  <span className={styles.miniNeedle} style={{ left: `${r.team.needle}%`, '--c': '#ff5a36' } as CSSProperties} />
                )}
                {r.guesses
                  .filter((g) => g.needle !== null)
                  .map((g) => (
                    <span
                      key={g.seat}
                      className={styles.miniNeedle}
                      style={{ left: `${g.needle}%`, '--c': seatColor(g.seat) } as CSSProperties}
                    />
                  ))}
              </div>
              <span className={styles.recapPts}>+{pts}</span>
            </li>
          );
        })}
      </ol>
    </details>
  );
}
