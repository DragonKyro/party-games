import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { isPaused, timeLeft, type Timer } from '@/engine/timer';
import type { SeatIndex } from '@/engine/types';
import { CollectPanel } from '@/ui/shared/CollectPanel';
import { Countdown } from '@/ui/shared/Countdown';
import { FinalResults } from '@/ui/shared/FinalResults';
import { GameShell } from '@/ui/shared/GameShell';
import { seatColor, useNow, usePlay } from '@/ui/shared/hooks';
import { Modal } from '@/ui/shared/Modal';
import { PassScreen } from '@/ui/shared/PassScreen';
import { play, vibrate } from '@/ui/shared/sfx';
import { useWakeLock } from '@/ui/shared/useWakeLock';
import type { ForeheadAction } from '../actions';
import type { ForeheadView } from '../state';
import { exitHeldMode, prepareForehead, releaseOrientation } from './device';
import { fitWordSize, type TiltKind } from './tilt';
import { usePortrait, useTilt, useViewport } from './useTilt';
import styles from './GameView.module.css';

// ============================================================================
// Forehead game view
//
// Hidden-info rules for this file:
//  - The word only ever comes from `view.cardText`, which viewFor fills in
//    only for seats allowed to see it (never the spectator view; never the
//    guesser in 'others' mode or while paused).
//  - Single device: the guesser claims the phone (PassScreen) before their
//    turn starts; the claim is per turn. The shared seat-null view never has
//    a word in it.
// ============================================================================

type Send = (a: ForeheadAction) => void;
/** Host-or-guesser actions: `{ bySeat }` from the guesser's screen, `{}` from the host's. */
type Steer = { bySeat?: SeatIndex };

/** Ignore a second mark this soon after the last (a double tap landing on the next card). */
const MARK_GAP_MS = 450;
const FLASH_MS = 600;

export default function ForeheadGameView() {
  const { view, seat, isHost, localTable, dispatch, setSeat } = usePlay<ForeheadView>();
  const [claimedTurn, setClaimedTurn] = useState<number | null>(null);
  const [menu, setMenu] = useState(false);
  const phase = view?.phase ?? null;
  useWakeLock(phase === 'ready' || phase === 'getReady' || phase === 'turn' || phase === 'turnResults');
  useEffect(() => () => exitHeldMode(), []);
  useEffect(() => {
    if (phase === 'gameOver') exitHeldMode();
    else if (phase !== 'getReady' && phase !== 'turn') releaseOrientation();
  }, [phase]);

  // This screen belongs to the guesser (on a shared phone: once they've claimed it this turn).
  const iGuess =
    !!view &&
    seat !== null &&
    seat === view.guesser &&
    (!localTable || view.phase !== 'ready' || claimedTurn === view.turnNo);
  useTurnSounds(view, iGuess || localTable);

  if (!view) return null;
  const send: Send = (a) => dispatch(a);
  const names = view.seats.map((s) => s.name);
  const g = view.guesser;
  const gName = g !== null ? (names[g] ?? '?') : '';
  const steer: Steer | null = iGuess ? { bySeat: seat! } : isHost ? {} : null;
  const running = !!view.timer && !isPaused(view.timer);
  const n = view.seats.length;

  const startTurn = (as: SeatIndex | null) => {
    if (view.display === 'forehead' && (as !== null || localTable)) void prepareForehead();
    play('pop');
    send(as !== null ? { type: 'start', bySeat: as, turn: view.turnNo } : { type: 'start', turn: view.turnNo });
  };

  // ---- The card held up to the forehead: every pixel, no header. ----
  if (view.display === 'forehead' && iGuess && (view.phase === 'getReady' || (view.phase === 'turn' && running))) {
    return (
      <GameShell gameId="forehead" bare>
        <Held view={view} seat={seat!} send={send} steer={steer ?? {}} />
      </GameShell>
    );
  }

  const status =
    view.phase === 'collect'
      ? 'Writing cards'
      : view.phase === 'gameOver'
        ? 'Final scores'
        : `${view.rounds > 1 ? `Round ${view.round + 1} of ${view.rounds} · ` : ''}${gName} guessing (${(view.turnNo % n) + 1} of ${n})`;

  let body: ReactNode = null;
  switch (view.phase) {
    case 'collect':
      body = view.collect && (
        <CollectPanel
          collect={view.collect}
          names={names}
          title="Write the cards"
          placeholder="A famous person, character, animal or thing"
          hint="Things your friends could guess from clues. You’ll never get your own cards on your forehead."
        />
      );
      break;

    case 'ready':
      if (view.outOfCards) {
        body = <OutOfCards name={gName} isHost={isHost} send={send} />;
      } else if (localTable && claimedTurn !== view.turnNo) {
        body = (
          <PassScreen
            to={gName}
            icon="🤳"
            message={
              <>
                Tap start, then hold the phone to your forehead with the screen facing out. The 3-2-1 gives you time
                to get it there.
                {view.lowDeck && <> Only {view.deckLeft} cards left!</>}
              </>
            }
            action={`I'm ${gName} — start`}
            onReady={() => {
              setSeat(g);
              setClaimedTurn(view.turnNo);
              startTurn(g);
            }}
          >
            <TiltHowTo compact />
            {isHost && (
              <button className="pg-btn pg-btn-ghost pg-btn-sm" onClick={() => send({ type: 'skipPlayer' })}>
                Skip {gName}
              </button>
            )}
          </PassScreen>
        );
      } else {
        body = (
          <Ready
            view={view}
            seat={localTable ? g : seat}
            isHost={isHost}
            names={names}
            onStart={startTurn}
            onSkip={() => send({ type: 'skipPlayer' })}
          />
        );
      }
      break;

    case 'getReady':
      body = <GetReady view={view} iGuess={iGuess} name={gName} />;
      break;

    case 'turn':
      if (iGuess && view.display === 'forehead') {
        body = <PausedGuesser view={view} send={send} steer={steer ?? {}} />;
      } else if (iGuess) {
        body = <BlindGuesser view={view} seat={seat!} send={send} steer={steer ?? {}} />;
      } else if (seat !== null && view.cardText !== null) {
        body = <ClueGiver view={view} seat={seat} name={gName} send={send} steer={steer} />;
      } else {
        body = <Watch view={view} name={gName} send={send} steer={steer} />;
      }
      break;

    case 'turnResults':
      body = (
        <TurnResults
          view={view}
          names={names}
          localTable={localTable}
          onNext={
            steer
              ? () => {
                  send({ type: 'next', ...steer, turn: view.turnNo });
                  if (localTable) setSeat(null);
                }
              : null
          }
        />
      );
      break;

    case 'gameOver':
      body = <Final view={view} seat={localTable ? null : seat} />;
      break;
  }

  const hostBar = isHost && view.phase !== 'gameOver' && view.phase !== 'collect';
  return (
    <GameShell
      gameId="forehead"
      status={status}
      right={
        hostBar ? (
          <>
            {/* The guesser's own screen has its own pause / resume. */}
            {view.phase === 'turn' && view.timer && !iGuess && (
              <button
                className="pg-btn pg-btn-sm"
                onClick={() => send({ type: running ? 'pause' : 'resume' })}
                aria-label={running ? 'Pause' : 'Resume'}
              >
                {running ? '❚❚' : '▶'}
              </button>
            )}
            <button className="pg-btn pg-btn-sm pg-btn-ghost" onClick={() => setMenu(true)} aria-label="Host controls">
              ⋯
            </button>
          </>
        ) : null
      }
    >
      {body}
      {menu && <HostMenu view={view} name={gName} send={send} onClose={() => setMenu(false)} />}
    </GameShell>
  );
}

// ============================================================================
// Sounds, ticks, flashes
// ============================================================================

/** Buzzer when a turn ends, whoosh when the first card goes up. */
function useTurnSounds(view: ForeheadView | null, loud: boolean) {
  const prev = useRef(view?.phase);
  const phase = view?.phase;
  const end = view?.lastTurn?.end;
  useEffect(() => {
    const was = prev.current;
    prev.current = phase;
    if (was === 'turn' && phase === 'turnResults') {
      if (end === 'time') {
        play('buzzer');
        if (loud) vibrate([200, 80, 200]);
      } else play('reveal');
    }
    if (was === 'getReady' && phase === 'turn' && loud) play('whoosh');
  }, [phase, end, loud]);
}

/** Seconds left on `timer`; ticks the last `warn` seconds aloud when `audible`. */
function useTicks(timer: Timer | null, warn: number, audible: boolean): number {
  const paused = !timer || isPaused(timer);
  const now = useNow(200, !paused);
  const secs = timer ? Math.ceil(timeLeft(timer, now) / 1000) : 0;
  const last = useRef<number | null>(null);
  useEffect(() => {
    if (!audible || paused) {
      last.current = null;
      return;
    }
    if (last.current === secs) return;
    const prev = last.current;
    last.current = secs;
    if (prev !== null && secs > 0 && secs <= warn) play(secs % 2 ? 'tick' : 'tock');
  }, [secs, audible, paused, warn]);
  return secs;
}

/**
 * Marking the card from this screen, plus the full-screen flash. The device
 * that marks gets instant feedback; other screens flash when the counts move
 * (with sound only when `audible`, e.g. the guesser's own phone).
 */
function useCard(view: ForeheadView, seat: SeatIndex | null, send: Send, audible: boolean) {
  const [flash, setFlash] = useState<{ kind: TiltKind; key: number } | null>(null);
  const flashes = useRef(0);
  const mine = useRef<number | null>(null);
  const lastMark = useRef(Number.NEGATIVE_INFINITY);
  const prev = useRef({ no: view.cardNo, correct: view.turnCorrect, passed: view.turnPassed });

  const show = useCallback((kind: TiltKind, sound: boolean) => {
    flashes.current += 1;
    setFlash({ kind, key: flashes.current });
    if (!sound) return;
    play(kind === 'correct' ? 'ding' : 'pass');
    vibrate(kind === 'correct' ? 60 : 25);
  }, []);

  useEffect(() => {
    const p = prev.current;
    const kind = view.turnCorrect > p.correct ? 'correct' : view.turnPassed > p.passed ? 'pass' : null;
    if (kind && mine.current !== p.no) show(kind, audible);
    prev.current = { no: view.cardNo, correct: view.turnCorrect, passed: view.turnPassed };
  }, [view.cardNo, view.turnCorrect, view.turnPassed, audible, show]);

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), FLASH_MS);
    return () => clearTimeout(t);
  }, [flash]);

  const mark = (kind: TiltKind) => {
    const no = view.cardNo;
    if (seat === null || no === null || mine.current === no) return;
    if (kind === 'correct' ? !view.canCorrect : !view.canPass) return;
    const t = performance.now();
    if (t - lastMark.current < MARK_GAP_MS) return;
    lastMark.current = t;
    mine.current = no;
    show(kind, true);
    send({ type: kind, bySeat: seat, card: no });
  };

  return { flash, mark };
}

function Flash({ kind }: { kind: TiltKind }) {
  return (
    <div className={styles.flash} data-kind={kind} aria-hidden>
      <span>{kind === 'correct' ? '✓' : '↷'}</span>
      <b>{kind === 'correct' ? 'Got it!' : 'Pass'}</b>
    </div>
  );
}

// ============================================================================
// The held-up card (bare)
// ============================================================================

function Held({ view, seat, send, steer }: { view: ForeheadView; seat: SeatIndex; send: Send; steer: Steer }) {
  const inTurn = view.phase === 'turn';
  const portrait = usePortrait();
  const { w, h } = useViewport();
  const { flash, mark } = useCard(view, seat, send, true);
  const secs = useTicks(inTurn ? view.timer : view.countdown, inTurn ? 5 : 3, true);
  const tilt = useTilt(inTurn && view.canPass, mark);

  const markRef = useRef(mark);
  useEffect(() => {
    markRef.current = mark;
  });
  useEffect(() => {
    if (!inTurn) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        e.preventDefault();
        markRef.current('correct');
      } else if (e.key === 'ArrowUp' || e.key === ' ') {
        e.preventDefault();
        markRef.current('pass');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [inTurn]);

  const size = fitWordSize(view.cardText ?? '', w * 0.84, h * 0.52);

  return (
    <div className={styles.held} data-phase={view.phase}>
      <div className={styles.heldBar}>
        <button
          className={styles.heldIcon}
          onClick={() => send(inTurn ? { type: 'pause', ...steer } : { type: 'stopTurn', ...steer })}
          aria-label={inTurn ? 'Pause' : 'Cancel'}
          title={inTurn ? 'Pause' : 'Cancel'}
        >
          {inTurn ? '❚❚' : '✕'}
        </button>
        <span className={`${styles.heldClock} ${inTurn && secs <= 5 ? styles.heldClockWarn : ''}`}>
          {inTurn ? secs : ''}
        </span>
        <span className={styles.heldRight}>
          {inTurn && <span className={styles.heldScore}>✓ {view.turnCorrect}</span>}
          {tilt.needsPermission ? (
            <button className={styles.heldChip} onClick={tilt.enable}>
              Enable tilt
            </button>
          ) : (
            <span className={styles.heldChip}>{tilt.live ? 'Tilt on' : 'Tap mode'}</span>
          )}
        </span>
      </div>

      {inTurn ? (
        <>
          <button type="button" className={`${styles.zone} ${styles.zoneTop}`} onClick={() => mark('pass')} aria-label="Pass">
            <span>▲ Pass · tap top half</span>
          </button>
          <button
            type="button"
            className={`${styles.zone} ${styles.zoneBottom}`}
            onClick={() => mark('correct')}
            aria-label="Got it"
          >
            <span>Got it · tap bottom half ✓</span>
          </button>
          <div className={styles.word} key={view.cardNo ?? 'none'} style={{ fontSize: size }}>
            {view.cardText}
          </div>
        </>
      ) : (
        <div className={styles.getReady}>
          <div className={styles.bigCount} key={secs}>
            {Math.max(1, secs)}
          </div>
          <p>Hold it to your forehead!</p>
          <p className={styles.small}>Screen facing out · tilt down = got it · tilt up = pass</p>
        </div>
      )}

      {portrait && <div className={styles.rotate}>↻ Turn the phone sideways</div>}
      {flash && <Flash kind={flash.kind} key={flash.key} />}
    </div>
  );
}

// ============================================================================
// Between turns
// ============================================================================

function TiltHowTo({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`${styles.howTo} ${compact ? styles.howToCompact : ''}`}>
      <div className={styles.howRow}>
        <i aria-hidden>⤓</i>
        <span>
          <b>Tilt down</b> (screen to the floor): got it
        </span>
      </div>
      <div className={styles.howRow}>
        <i aria-hidden>⤒</i>
        <span>
          <b>Tilt up</b> (screen to the ceiling): pass
        </span>
      </div>
      {!compact && <p className="pg-faint">No tilt sensor? Tap the bottom half for got it, the top half to pass.</p>}
    </div>
  );
}

function Ready({
  view,
  seat,
  isHost,
  names,
  onStart,
  onSkip,
}: {
  view: ForeheadView;
  seat: SeatIndex | null;
  isHost: boolean;
  names: string[];
  onStart: (as: SeatIndex | null) => void;
  onSkip: () => void;
}) {
  const g = view.guesser!;
  const mine = seat === g;
  const forehead = view.display === 'forehead';
  const n = view.seats.length;
  return (
    <section className={styles.ready}>
      <span className={styles.badge} style={{ '--c': seatColor(g) } as CSSProperties}>
        {view.rounds > 1 ? `Round ${view.round + 1} · ` : ''}Turn {(view.turnNo % n) + 1} of {n}
      </span>
      {mine ? (
        <>
          <h2 className={styles.readyTitle}>You’re up!</h2>
          {forehead ? (
            <>
              <p className={styles.lead}>
                Tap Start, then hold your phone to your forehead with the screen facing out. You get a 3-2-1.
              </p>
              <TiltHowTo />
            </>
          ) : (
            <p className={styles.lead}>
              Everyone else’s phone will show your word. Listen to their clues and shout it out. Stuck? Tap Pass.
            </p>
          )}
          <button className={`pg-btn pg-btn-primary pg-btn-xl ${styles.go}`} onClick={() => onStart(g)} autoFocus>
            Start · {view.turnSeconds}s
          </button>
        </>
      ) : (
        <>
          <h2 className={styles.readyTitle}>{names[g]} is up</h2>
          <p className={styles.lead}>
            {forehead
              ? `${names[g]} holds their phone to their forehead. Everyone else: shout clues, just don’t say the word!`
              : `When it starts, the word shows on your phone. Keep it out of ${names[g]}’s sight and shout clues!`}
          </p>
          {isHost && (
            <div className={styles.hostRow}>
              <button className="pg-btn pg-btn-sm" onClick={() => onStart(null)}>
                Start for {names[g]}
              </button>
              <button className="pg-btn pg-btn-sm pg-btn-ghost" onClick={onSkip}>
                Skip {names[g]}
              </button>
            </div>
          )}
        </>
      )}
      {view.lowDeck && <p className={styles.warn}>Heads up: only {view.deckLeft} cards left in the deck.</p>}
      {view.turnNo > 0 && <Scores view={view} />}
    </section>
  );
}

function OutOfCards({ name, isHost, send }: { name: string; isHost: boolean; send: Send }) {
  return (
    <section className={styles.center}>
      <div className={styles.pausedIcon} aria-hidden>
        🃏
      </div>
      <h2>No cards left for {name}</h2>
      <p className="pg-dim">Everything left in the deck was written by {name}, and nobody guesses their own cards.</p>
      {isHost ? (
        <div className={styles.hostRow}>
          <button className="pg-btn pg-btn-primary" onClick={() => send({ type: 'skipPlayer' })}>
            Skip {name}
          </button>
          <button className="pg-btn pg-btn-ghost" onClick={() => send({ type: 'finish' })}>
            Final scores
          </button>
        </div>
      ) : (
        <p className="pg-dim">Waiting for the host…</p>
      )}
    </section>
  );
}

function GetReady({ view, iGuess, name }: { view: ForeheadView; iGuess: boolean; name: string }) {
  const secs = useTicks(view.countdown, 3, iGuess);
  const msg =
    view.display === 'others'
      ? iGuess
        ? 'Get ready to guess!'
        : `Keep your screen away from ${name}!`
      : `${name} is lifting the phone. Clues at the ready!`;
  return (
    <section className={styles.center}>
      <span className="pg-kicker">Get ready</span>
      <div className={styles.bigCountDark} key={secs}>
        {Math.max(1, secs)}
      </div>
      <h2 className={styles.getReadyMsg}>{msg}</h2>
    </section>
  );
}

// ============================================================================
// During a turn (screens that aren't on a forehead)
// ============================================================================

function PausedNote({ send, steer }: { send: Send; steer: Steer | null }) {
  return (
    <div className={styles.pausedNote}>
      <span>❚❚ Paused</span>
      {steer && (
        <button className="pg-btn pg-btn-sm pg-btn-primary" onClick={() => send({ type: 'resume', ...steer })}>
          Resume
        </button>
      )}
    </div>
  );
}

/** Forehead mode, the guesser's own phone, paused: the card is hidden (viewFor drops it). */
function PausedGuesser({ view, send, steer }: { view: ForeheadView; send: Send; steer: Steer }) {
  const left = view.timer ? Math.ceil(view.timer.remainingMs / 1000) : 0;
  return (
    <section className={styles.center}>
      <div className={styles.pausedIcon} aria-hidden>
        ❚❚
      </div>
      <h2>Paused</h2>
      <p className="pg-dim">Your card is hidden while the clock is stopped. {left}s left.</p>
      <button
        className="pg-btn pg-btn-primary pg-btn-xl"
        onClick={() => {
          void prepareForehead();
          send({ type: 'resume', ...steer });
        }}
        autoFocus
      >
        Resume
      </button>
      <p className="pg-faint">The clock starts again as soon as you tap, so get it straight back up.</p>
      <button className="pg-btn pg-btn-ghost" onClick={() => send({ type: 'stopTurn', ...steer })}>
        End my turn
      </button>
    </section>
  );
}

/** 'others' mode, the guesser's phone: no word, ever. */
function BlindGuesser({ view, seat, send, steer }: { view: ForeheadView; seat: SeatIndex; send: Send; steer: Steer }) {
  const { flash, mark } = useCard(view, seat, send, true);
  useTicks(view.timer, 5, true);
  const paused = !!view.timer && isPaused(view.timer);
  return (
    <section className={styles.center}>
      <Countdown timer={view.timer} size="xl" />
      <h2 className={styles.guessTitle}>Guess!</h2>
      <p className="pg-dim">Your friends can see your word. Listen to their clues and shout it out.</p>
      <Tally view={view} />
      {paused ? (
        <PausedNote send={send} steer={steer} />
      ) : (
        <>
          <button className={`pg-btn pg-btn-lg ${styles.passBtn}`} onClick={() => mark('pass')} disabled={!view.canPass}>
            Pass this one ↷
          </button>
          <button className="pg-btn pg-btn-sm pg-btn-ghost" onClick={() => send({ type: 'pause', ...steer })}>
            ❚❚ Pause
          </button>
        </>
      )}
      {flash && <Flash kind={flash.kind} key={flash.key} />}
    </section>
  );
}

function ClueGiver({
  view,
  seat,
  name,
  send,
  steer,
}: {
  view: ForeheadView;
  seat: SeatIndex;
  name: string;
  send: Send;
  steer: Steer | null;
}) {
  const { flash, mark } = useCard(view, seat, send, false);
  const paused = !!view.timer && isPaused(view.timer);
  const forehead = view.display === 'forehead';
  return (
    <section className={styles.clue}>
      <div className={styles.turnTop}>
        <Countdown timer={view.timer} size="lg" />
        <Tally view={view} />
      </div>
      <p className={styles.clueHint}>
        {forehead ? `It’s on ${name}’s forehead. Give clues!` : `Get ${name} to say it, and don’t let them see your screen!`}
      </p>
      <div className={styles.card} key={view.cardNo ?? 'none'}>
        {view.cardText}
      </div>
      {paused && <PausedNote send={send} steer={steer} />}
      {!forehead && (
        <div className={styles.markRow}>
          <button className={`pg-btn pg-btn-lg ${styles.passBtn}`} onClick={() => mark('pass')} disabled={!view.canPass}>
            Pass
          </button>
          <button
            className={`pg-btn pg-btn-good pg-btn-xl ${styles.correctBtn}`}
            onClick={() => mark('correct')}
            disabled={!view.canCorrect}
          >
            Correct ✓
          </button>
        </div>
      )}
      {flash && <Flash kind={flash.kind} key={flash.key} />}
    </section>
  );
}

/** Spectators (and anyone without the word): the clock and the count. */
function Watch({ view, name, send, steer }: { view: ForeheadView; name: string; send: Send; steer: Steer | null }) {
  const { flash } = useCard(view, null, send, false);
  const paused = !!view.timer && isPaused(view.timer);
  return (
    <section className={styles.center}>
      <Countdown timer={view.timer} size="xl" />
      <h2 className={styles.guessTitle}>{name} is guessing</h2>
      <p className="pg-dim">
        {view.display === 'forehead' ? 'The word is on their forehead.' : 'The word is on the clue-givers’ phones.'}
      </p>
      <Tally view={view} />
      {paused && <PausedNote send={send} steer={steer} />}
      {flash && <Flash kind={flash.kind} key={flash.key} />}
    </section>
  );
}

function Tally({ view }: { view: ForeheadView }) {
  return (
    <div className={styles.tally} aria-label={`${view.turnCorrect} correct, ${view.turnPassed} passed`}>
      <span className={styles.tallyOk}>✓ {view.turnCorrect}</span>
      <span className={styles.tallyNo}>↷ {view.turnPassed}</span>
    </div>
  );
}

// ============================================================================
// Results
// ============================================================================

function Scores({ view }: { view: ForeheadView }) {
  return (
    <div className={styles.scores}>
      {view.seats.map((s) => (
        <span
          key={s.index}
          className={`${styles.scoreChip} ${s.index === view.guesser ? styles.scoreActive : ''}`}
          style={{ '--c': seatColor(s.index) } as CSSProperties}
        >
          <i aria-hidden />
          {s.name}
          <b>{view.scores[s.index] ?? 0}</b>
        </span>
      ))}
    </div>
  );
}

function TurnResults({
  view,
  names,
  localTable,
  onNext,
}: {
  view: ForeheadView;
  names: string[];
  localTable: boolean;
  onNext: (() => void) | null;
}) {
  const t = view.lastTurn!;
  const got = t.cards.filter((c) => c.got).length;
  const next = view.upNext;
  const why = t.end === 'deck' ? 'Out of cards!' : t.end === 'stopped' ? 'Turn ended' : 'Time’s up!';
  return (
    <section className={styles.results}>
      <span className="pg-kicker">{why}</span>
      <h2 className={styles.resultsTitle}>
        {names[t.seat]} got <span>{got}</span>
        {got > 0 ? '!' : ''}
      </h2>
      {t.cards.length > 0 ? (
        <ol className={`${styles.cardList} pg-stagger`}>
          {t.cards.map((c, i) => (
            <li key={i} className={c.got ? styles.got : styles.missed} style={{ '--i': i } as CSSProperties}>
              <span className={styles.mark} aria-label={c.got ? 'Correct' : 'Missed'}>
                {c.got ? '✓' : '✗'}
              </span>
              <span>{c.text}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="pg-dim">No cards this turn.</p>
      )}
      {next !== null && view.lowDeck && <p className={styles.warn}>Only {view.deckLeft} cards left in the deck.</p>}
      {next === null && view.deckLeft === 0 && <p className={styles.warn}>That was the whole deck!</p>}
      <Scores view={view} />
      {onNext ? (
        <button className="pg-btn pg-btn-primary pg-btn-xl" onClick={onNext} autoFocus>
          {next === null ? 'Final scores' : localTable ? `Pass to ${names[next]} →` : `Next: ${names[next]} →`}
        </button>
      ) : (
        <p className="pg-dim">
          {next === null ? 'That’s the last turn.' : `${names[next]} is next.`} Waiting for {names[t.seat]} or the host…
        </p>
      )}
    </section>
  );
}

function Final({ view, seat }: { view: ForeheadView; seat: SeatIndex | null }) {
  const r = view.results!;
  const names = view.seats.map((s) => s.name);
  const best = Math.max(0, ...view.scores);
  const winners = view.seats.filter((s) => view.scores[s.index] === best);
  const headline = best === 0 ? 'Nobody got one!' : winners.length > 1 ? 'It’s a tie!' : `${winners[0]!.name} wins!`;
  const rows = view.seats.map((s) => {
    const turns = r.turns.filter((t) => t.seat === s.index);
    const top = Math.max(0, ...turns.map((t) => t.cards.filter((c) => c.got).length));
    return {
      name: s.name,
      score: view.scores[s.index] ?? 0,
      color: seatColor(s.index),
      detail:
        turns.length === 0
          ? 'No turns'
          : turns.length === 1
            ? `${turns[0]!.cards.length} cards seen`
            : `${turns.length} turns · best ${top}`,
      you: seat === s.index,
    };
  });
  const total = r.turns.reduce((sum, t) => sum + t.cards.length, 0);
  return (
    <FinalResults headline={headline} subline={r.ranOut ? 'The deck ran out!' : undefined} rows={rows} unit="cards">
      {r.bestTurn && (
        <p className={styles.award}>
          🏅 Best turn: <b>{names[r.bestTurn.seat]}</b> with {r.bestTurn.got}
          {view.rounds > 1 ? ` in round ${r.bestTurn.round + 1}` : ''}
        </p>
      )}
      {total > 0 && (
        <details className={styles.allCards}>
          <summary>Every card played ({total})</summary>
          {r.turns.map((t, i) => (
            <div key={i} className={styles.turnBlock}>
              <h4>
                {names[t.seat]}
                {view.rounds > 1 ? ` · round ${t.round + 1}` : ''} — {t.cards.filter((c) => c.got).length}
              </h4>
              <div className={styles.chips}>
                {t.cards.map((c, j) => (
                  <span key={j} className={`${styles.chipCard} ${c.got ? styles.got : styles.missed}`}>
                    {c.got ? '✓' : '✗'} {c.text}
                    {c.author && <small> by {c.author}</small>}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </details>
      )}
    </FinalResults>
  );
}

// ============================================================================
// Host controls
// ============================================================================

function HostMenu({ view, name, send, onClose }: { view: ForeheadView; name: string; send: Send; onClose: () => void }) {
  const go = (a: ForeheadAction) => {
    send(a);
    onClose();
  };
  const paused = !!view.timer && isPaused(view.timer);
  const between = view.phase === 'ready' || view.phase === 'getReady';
  return (
    <Modal title="Host controls" onClose={onClose}>
      <div className={styles.menu}>
        {view.phase === 'turn' && (
          <>
            <button className="pg-btn pg-btn-block" onClick={() => go({ type: paused ? 'resume' : 'pause' })}>
              {paused ? '▶ Resume the turn' : '❚❚ Pause the turn'}
            </button>
            <button className="pg-btn pg-btn-block" onClick={() => go({ type: 'stopTurn' })}>
              End {name}’s turn now
            </button>
          </>
        )}
        {view.phase === 'getReady' && (
          <button className="pg-btn pg-btn-block" onClick={() => go({ type: 'stopTurn' })}>
            Cancel the countdown
          </button>
        )}
        {between && (
          <button className="pg-btn pg-btn-block" onClick={() => go({ type: 'skipPlayer' })}>
            Skip {name}
          </button>
        )}
        <button
          className="pg-btn pg-btn-bad pg-btn-block"
          onClick={() => {
            if (typeof window.confirm === 'function' && !window.confirm('End the game now and show the scores?')) return;
            go({ type: 'finish' });
          }}
        >
          Finish the game now
        </button>
      </div>
    </Modal>
  );
}
