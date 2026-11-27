import { useEffect, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react';
import { CollectPanel } from '@/ui/shared/CollectPanel';
import { Countdown } from '@/ui/shared/Countdown';
import { DrawPad, useLiveBoard, type BoardSource } from '@/ui/shared/draw/DrawPad';
import { FinalResults } from '@/ui/shared/FinalResults';
import { GameShell } from '@/ui/shared/GameShell';
import { seatColor, usePlay } from '@/ui/shared/hooks';
import { PassScreen } from '@/ui/shared/PassScreen';
import { play, vibrate } from '@/ui/shared/sfx';
import { useWakeLock } from '@/ui/shared/useWakeLock';
import type { SeatIndex } from '@/engine/types';
import type { SketchAction } from '../actions';
import { GUESS_INTERVAL_MS, MAX_GUESS_LENGTH } from '../rules';
import type { FeedView, SketchView } from '../state';
import styles from './GameView.module.css';

// ============================================================================
// Sketch & Guess game view
//
// Hidden-info rules for this file:
//  - The words on offer exist only in the drawer's view (`choices`), the
//    word only in the drawer's and solvers' views (`word`) until the reveal.
//    This file renders whatever the view holds; it never infers a secret.
//  - Single device: the shared screen shows the public (seat-null) view. The
//    artist claims the device (PassScreen) to see the choices, and while
//    drawing can hold "peek" to switch to their own view for a moment; the
//    word is only in the DOM while the button is held.
//  - Strokes never touch game state: `useLiveBoard(view.boardId)` streams
//    them; only the drawer's DrawPad is enabled.
// ============================================================================

type Send = (a: SketchAction) => void;

const isLetter = (c: string) => /[\p{L}\p{N}]/u.test(c);

export default function SketchGameView() {
  const { view, seat, isHost, localTable, dispatch, setSeat } = usePlay<SketchView>();
  const board = useLiveBoard(view?.boardId ?? null);
  const [claimedTurn, setClaimedTurn] = useState<number | null>(null);
  useWakeLock(!!view && (view.phase === 'choose' || view.phase === 'drawing'));
  useSketchSounds(view, seat);

  // Single device: back to the public view whenever the phase or turn changes
  // (the artist only holds the secret view while choosing or peeking).
  const phaseKey = view ? `${view.phase}:${view.turnNo}` : '';
  const seatRef = useRef(seat);
  seatRef.current = seat;
  const setSeatRef = useRef(setSeat);
  setSeatRef.current = setSeat;
  useEffect(() => {
    if (localTable && seatRef.current !== null) setSeatRef.current(null);
  }, [phaseKey, localTable]);

  if (!view) return null;
  const send: Send = (a) => dispatch(a);
  const names = view.seats.map((s) => s.name);
  const drawerName = view.drawer !== null ? (names[view.drawer] ?? '?') : '';
  const inTurn = view.phase === 'choose' || view.phase === 'drawing' || view.phase === 'reveal';

  const status =
    view.phase === 'collect'
      ? 'Writing words'
      : view.phase === 'gameOver'
        ? 'Final scores'
        : `Round ${view.round + 1} of ${view.rounds} · ${drawerName} ${view.phase === 'choose' ? 'is choosing' : view.phase === 'drawing' ? 'is drawing' : 'drew'}`;

  let body: ReactNode;
  switch (view.phase) {
    case 'collect':
      body = view.collect && (
        <CollectPanel
          collect={view.collect}
          names={names}
          title="Words to draw"
          placeholder="Something you could draw"
          hint="Things, animals, places, actions: keep it drawable! You’ll never be asked to draw your own."
        />
      );
      break;
    case 'choose': {
      const drawer = view.drawer!;
      if (localTable && claimedTurn !== view.turnNo) {
        body = (
          <PassScreen
            to={drawerName}
            icon="✏️"
            message={<>{drawerName} is drawing next. Everyone else, look away while they pick a word!</>}
            action={`I'm ${drawerName}: show me the words`}
            onReady={() => {
              setSeat(drawer);
              setClaimedTurn(view.turnNo);
            }}
          >
            {isHost && (
              <button className="pg-btn pg-btn-ghost pg-btn-sm" onClick={() => send({ type: 'skipTurn', turn: view.turnNo })}>
                Skip {drawerName}
              </button>
            )}
          </PassScreen>
        );
      } else if (view.choices) {
        body = <ChooseWord key={view.turnNo} view={view} send={send} />;
      } else {
        body = <WaitForWord view={view} seat={seat} isHost={isHost} send={send} />;
      }
      break;
    }
    case 'drawing':
    case 'reveal':
      body = (
        <Stage view={view} seat={seat} isHost={isHost} localTable={localTable} board={board} send={send} setSeat={setSeat} />
      );
      break;
    case 'gameOver':
      body = <Results view={view} seat={localTable ? null : seat} />;
      break;
  }

  const paused = !!view.timer && view.timer.endsAt === null;
  return (
    <GameShell
      gameId="sketch"
      status={status}
      wide={inTurn}
      right={
        isHost && inTurn && view.timer ? (
          <button
            className="pg-btn pg-btn-sm"
            onClick={() => send({ type: paused ? 'resume' : 'pause' })}
            aria-label={paused ? 'Resume' : 'Pause'}
            title={paused ? 'Resume' : 'Pause'}
          >
            {paused ? '▶' : '❚❚'}
          </button>
        ) : null
      }
    >
      {body}
    </GameShell>
  );
}

// ----------------------------------------------------------------------------
// Sounds: a ding per solve, a nudge for your own near miss, a flourish at the reveal.

function useSketchSounds(view: SketchView | null, seat: SeatIndex | null) {
  const solves = view?.solves.length ?? 0;
  const close = view?.feed.filter((e) => e.kind === 'close' && e.seat === seat).length ?? 0;
  const letters = view?.hint?.filter((c) => c !== '_' && isLetter(c)).length ?? 0;
  const phase = view?.phase ?? null;
  const prev = useRef({ solves, close, letters, phase });
  useEffect(() => {
    const p = prev.current;
    if (phase === 'reveal' && p.phase !== 'reveal') play('reveal');
    else if (phase === 'choose' && p.phase !== 'choose') play('whoosh');
    else if (solves > p.solves) {
      play('ding');
      vibrate(30);
    } else if (close > p.close) play('pop');
    else if (letters > p.letters) play('pass');
    prev.current = { solves, close, letters, phase };
  }, [solves, close, letters, phase]);
}

// ----------------------------------------------------------------------------
// Choosing

function ChooseWord({ view, send }: { view: SketchView; send: Send }) {
  const [picked, setPicked] = useState<number | null>(null);
  const choices = view.choices ?? [];
  return (
    <section className={styles.choose}>
      <div className={styles.chooseHead}>
        <span className="pg-kicker">
          Round {view.round + 1} of {view.rounds}
        </span>
        <h2 className={styles.chooseTitle}>Pick something to draw</h2>
        <p className="pg-dim">Only you can see these. No letters or numbers in your picture!</p>
      </div>
      {view.timer && <Countdown timer={view.timer} size="md" beep />}
      <div className={`${styles.choices} pg-stagger`}>
        {choices.map((w, i) => (
          <button
            key={w}
            type="button"
            className={`${styles.choice} ${picked === i ? styles.choicePicked : ''}`}
            style={{ '--r': `${(i - 1) * 1.6}deg`, '--i': i } as CSSProperties}
            disabled={picked !== null}
            onClick={() => {
              setPicked(i);
              play('pop');
              send({ type: 'choose', bySeat: view.drawer!, turn: view.turnNo, index: i });
            }}
          >
            {w}
          </button>
        ))}
      </div>
      <p className="pg-faint">
        {view.turnSeconds}s to draw · {view.guessing === 'typed' ? 'they type their guesses' : 'they shout, you tap who got it'}
      </p>
    </section>
  );
}

function WaitForWord({ view, seat, isHost, send }: { view: SketchView; seat: SeatIndex | null; isHost: boolean; send: Send }) {
  const name = view.seats[view.drawer!]?.name ?? '?';
  return (
    <section className={styles.waiting}>
      <div className={styles.waitArt} aria-hidden>
        <span className={styles.waitPencil}>✏️</span>
      </div>
      <span className="pg-kicker">
        Round {view.round + 1} of {view.rounds}
      </span>
      <h2 className={styles.waitTitle}>{name} is picking a word…</h2>
      <p className="pg-dim">
        {view.guessing === 'typed' ? 'Get your typing thumbs ready.' : 'Get ready to shout your guesses!'}
      </p>
      {view.timer && <Countdown timer={view.timer} size="md" />}
      <Scoreboard view={view} seat={seat} />
      {isHost && (
        <button className="pg-btn pg-btn-ghost pg-btn-sm" onClick={() => send({ type: 'skipTurn', turn: view.turnNo })}>
          Skip {name}
        </button>
      )}
    </section>
  );
}

// ----------------------------------------------------------------------------
// Drawing + reveal

function Stage({
  view,
  seat,
  isHost,
  localTable,
  board,
  send,
  setSeat,
}: {
  view: SketchView;
  seat: SeatIndex | null;
  isHost: boolean;
  localTable: boolean;
  board: BoardSource;
  send: Send;
  setSeat: (s: SeatIndex | null) => void;
}) {
  const drawer = view.drawer!;
  const drawing = view.phase === 'drawing';
  const iAmDrawer = !localTable && seat === drawer;
  // One device: the artist is holding it. Online: only the artist's own device.
  const canDraw = drawing && (localTable || iAmDrawer);
  const spoken = view.guessing === 'spoken';
  const tapper = spoken && drawing && (localTable || iAmDrawer || isHost);
  // The artist's own device acts as the artist; anyone else running the game acts as host.
  const by = iAmDrawer ? { bySeat: drawer } : {};

  let side: ReactNode;
  if (!drawing) side = <RevealCard view={view} isHost={isHost} send={send} />;
  else if (!spoken)
    side = (
      <>
        <Feed view={view} seat={seat} />
        {view.canType ? (
          <GuessBox key={view.turnNo} view={view} seat={seat!} send={send} />
        ) : (
          <p className={styles.note}>
            {iAmDrawer ? 'You’re drawing: no typing, no letters!' : 'Watching. Guesses appear as they come in.'}
          </p>
        )}
      </>
    );
  else if (tapper) side = <TapList view={view} by={by} send={send} />;
  else side = <ShoutCard view={view} seat={seat} />;

  return (
    <section className={styles.stage}>
      <div className={styles.main}>
        <TopBar view={view} seat={seat} localTable={localTable} setSeat={setSeat} />
        <div className={`${styles.canvasWrap} ${canDraw ? styles.withTools : ''}`}>
          <DrawPad source={board} enabled={canDraw} />
        </div>
      </div>
      <aside className={styles.side}>
        {side}
        <Scoreboard view={view} seat={seat} />
        {isHost && <HostBar view={view} send={send} />}
      </aside>
    </section>
  );
}

function TopBar({
  view,
  seat,
  localTable,
  setSeat,
}: {
  view: SketchView;
  seat: SeatIndex | null;
  localTable: boolean;
  setSeat: (s: SeatIndex | null) => void;
}) {
  const drawer = view.drawer!;
  const drawing = view.phase === 'drawing';
  const peeking = localTable && seat === drawer;
  const stopPeek = () => {
    if (peeking) setSeat(null);
  };

  let center: ReactNode;
  if (!drawing) {
    center = (
      <div className={styles.secret}>
        <span className="pg-kicker">It was</span>
        <span className={styles.secretWord}>{view.word}</span>
      </div>
    );
  } else if (view.word && (!localTable || peeking)) {
    center = (
      <div className={styles.secret}>
        <span className="pg-kicker">{view.youSolved ? 'You got it! ✓' : 'Draw this'}</span>
        <span className={styles.secretWord}>{view.word}</span>
      </div>
    );
  } else if (view.hint) {
    center = <HintCells cells={view.hint} />;
  } else {
    center = <span className={styles.guessIt}>{view.guessing === 'typed' ? 'Guess the drawing!' : 'Shout it out!'}</span>;
  }

  return (
    <div className={styles.topBar}>
      <Countdown timer={view.timer} size="md" beep={drawing} />
      <div className={styles.topCenter}>{center}</div>
      <div className={styles.topRight}>
        <span className={`pg-chip ${styles.artistChip}`} title={`${view.seats[drawer]?.name ?? ''} is drawing`}>
          ✏️ {view.seats[drawer]?.name}
        </span>
        <span className="pg-chip" title="Round">
          {view.round + 1}/{view.rounds}
        </span>
        {localTable && drawing && (
          <button
            type="button"
            className={`pg-btn pg-btn-sm ${styles.peek} ${peeking ? styles.peeking : ''}`}
            onPointerDown={(e) => {
              e.preventDefault();
              setSeat(drawer);
            }}
            onPointerUp={stopPeek}
            onPointerLeave={stopPeek}
            onPointerCancel={stopPeek}
            onKeyDown={(e) => {
              if ((e.key === ' ' || e.key === 'Enter') && !peeking) setSeat(drawer);
            }}
            onKeyUp={stopPeek}
            onBlur={stopPeek}
            onContextMenu={(e) => e.preventDefault()}
            title={`${view.seats[drawer]?.name ?? 'Artist'}: hold to see your word`}
          >
            👁 Hold to peek
          </button>
        )}
      </div>
    </div>
  );
}

function HintCells({ cells }: { cells: string[] }) {
  const words: string[][] = [];
  let cur: string[] = [];
  for (const c of cells) {
    if (c === ' ') {
      if (cur.length) words.push(cur);
      cur = [];
    } else cur.push(c);
  }
  if (cur.length) words.push(cur);
  const lengths = words.map((w) => w.filter((c) => c === '_' || isLetter(c)).length);
  const spoken = cells.map((c) => (c === '_' ? 'blank' : c === ' ' ? ',' : c)).join(' ');
  return (
    <div className={styles.hint} role="img" aria-label={`Hint: ${lengths.join(' and ')} letters. ${spoken}`}>
      <div className={styles.hintWords}>
        {words.map((w, i) => (
          <span key={i} className={styles.hintWord}>
            {w.map((c, j) => (
              <span key={j} className={c === '_' ? styles.blank : isLetter(c) ? styles.letter : styles.punct}>
                {c === '_' ? '' : c}
              </span>
            ))}
          </span>
        ))}
      </div>
      <span className={styles.hintCount}>{lengths.join(' · ')}</span>
    </div>
  );
}

// ---- typed guessing ----------------------------------------------------------

function Feed({ view, seat }: { view: SketchView; seat: SeatIndex | null }) {
  const ref = useRef<HTMLDivElement>(null);
  const lastKey = view.feed[view.feed.length - 1]?.key ?? '';
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lastKey]);
  return (
    <div ref={ref} className={styles.feed} aria-live="polite" aria-label="Guesses">
      {view.feed.length === 0 && <p className={styles.feedEmpty}>Guesses show up here.</p>}
      {view.feed.map((e) => (
        <FeedLine key={e.key} entry={e} name={view.seats[e.seat]?.name ?? '?'} mine={e.seat === seat} />
      ))}
    </div>
  );
}

function FeedLine({ entry: e, name, mine }: { entry: FeedView; name: string; mine: boolean }) {
  const who = (
    <span className={styles.who} style={{ '--c': seatColor(e.seat) } as CSSProperties}>
      {mine ? 'You' : name}
    </span>
  );
  if (e.kind === 'solved') {
    return (
      <div className={`${styles.line} ${styles.lineSolved}`}>
        ✓ {who} {mine ? 'got it!' : 'guessed it!'} {e.points !== null && <b className={styles.plus}>+{e.points}</b>}
      </div>
    );
  }
  return (
    <div className={`${styles.line} ${e.kind === 'close' ? styles.lineClose : ''} ${e.kind === 'chat' ? styles.lineChat : ''}`}>
      {who}: <span className={styles.text}>{e.text}</span>
      {e.kind === 'close' && <span className={styles.closeTag}>So close!</span>}
      {e.only && <span className={styles.only}>{e.only === 'you' ? 'only you see this' : 'solvers only'}</span>}
    </div>
  );
}

/** A little slower than the host's limit, so honest typing is never refused. */
const SEND_GAP_MS = GUESS_INTERVAL_MS + 120;

function GuessBox({ view, seat, send }: { view: SketchView; seat: SeatIndex; send: Send }) {
  const [text, setText] = useState('');
  const lastSent = useRef(0);
  const queued = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (queued.current) clearTimeout(queued.current);
    },
    [],
  );
  const turn = view.turnNo;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const t = text.replace(/\s+/g, ' ').trim().slice(0, MAX_GUESS_LENGTH);
    if (!t || queued.current) return;
    setText('');
    const fire = () => {
      queued.current = null;
      lastSent.current = Date.now();
      send({ type: 'guess', bySeat: seat, turn, text: t });
    };
    const wait = lastSent.current + SEND_GAP_MS - Date.now();
    if (wait > 0) queued.current = setTimeout(fire, wait);
    else fire();
  };

  return (
    <form className={styles.guessBox} onSubmit={submit}>
      <input
        className="pg-input"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={view.youSolved ? 'Chat with the other solvers…' : 'Type your guess…'}
        maxLength={MAX_GUESS_LENGTH}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        enterKeyHint="send"
        aria-label={view.youSolved ? 'Message to solvers' : 'Your guess'}
      />
      <button type="submit" className="pg-btn pg-btn-primary" disabled={!text.trim()}>
        {view.youSolved ? 'Send' : 'Guess'}
      </button>
    </form>
  );
}

// ---- spoken guessing ---------------------------------------------------------

function TapList({ view, by, send }: { view: SketchView; by: { bySeat?: SeatIndex }; send: Send }) {
  const lastTap = useRef<Record<number, number>>({});
  const guessers = view.seats.filter((s) => s.index !== view.drawer);
  const n = view.solves.length;
  const tap = (seat: SeatIndex, marked: boolean) => {
    // A double tap shouldn't mark and unmark in one go.
    const now = Date.now();
    if (now - (lastTap.current[seat] ?? 0) < 450) return;
    lastTap.current[seat] = now;
    if (!marked) {
      play('ding');
      vibrate(25);
    }
    send({ type: marked ? 'unaward' : 'award', ...by, turn: view.turnNo, seat });
  };
  return (
    <div className={styles.taps}>
      <div>
        <span className="pg-kicker">Who got it?</span>
        <p className={styles.tapHint}>Tap each person as they shout the answer, in order. Tap again to undo.</p>
      </div>
      <div className={styles.tapGrid}>
        {guessers.map((s) => {
          const i = view.solves.findIndex((x) => x.seat === s.index);
          const marked = i >= 0;
          return (
            <button
              key={s.index}
              type="button"
              className={`${styles.tap} ${marked ? styles.tapOn : ''}`}
              style={{ '--c': seatColor(s.index) } as CSSProperties}
              onClick={() => tap(s.index, marked)}
              aria-pressed={marked}
            >
              <span className={styles.tapDot}>{marked ? i + 1 : ''}</span>
              <span className={styles.tapName}>{s.name}</span>
              {marked && <b className={styles.plus}>+{view.solves[i]!.points}</b>}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        className={`pg-btn pg-btn-lg pg-btn-block ${n === 0 ? 'pg-btn-ghost' : 'pg-btn-good'}`}
        onClick={() => send({ type: 'endTurn', ...by, turn: view.turnNo })}
      >
        {n === 0 ? 'Nobody got it' : n === guessers.length ? 'Everyone got it! Done ✓' : 'Done ✓'}
      </button>
    </div>
  );
}

function ShoutCard({ view, seat }: { view: SketchView; seat: SeatIndex | null }) {
  const name = view.seats[view.drawer!]?.name ?? 'The artist';
  const mine = seat !== null && view.solves.some((s) => s.seat === seat);
  return (
    <div className={styles.shout}>
      <div className={styles.shoutIcon} aria-hidden>
        📣
      </div>
      <h3 className={styles.shoutTitle}>{mine ? 'You got it!' : 'Shout your guesses!'}</h3>
      <p className="pg-dim">{name} taps whoever says it first.</p>
      {view.solves.length > 0 && (
        <ol className={styles.solvedList}>
          {view.solves.map((s) => (
            <li key={s.seat} style={{ '--c': seatColor(s.seat) } as CSSProperties}>
              ✓ {view.seats[s.seat]?.name} <b className={styles.plus}>+{s.points}</b>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

// ---- reveal, scores, host ----------------------------------------------------------

function RevealCard({ view, isHost, send }: { view: SketchView; isHost: boolean; send: Send }) {
  const r = view.reveal;
  if (!r) return null;
  const names = view.seats.map((s) => s.name);
  const everyone = r.solves.length === view.seats.length - 1;
  const headline = r.skipped
    ? 'Turn over'
    : r.solves.length === 0
      ? 'Nobody got it!'
      : everyone
        ? 'Everyone got it!'
        : `${r.solves.length} got it`;
  const last = view.turnNo + 1 >= view.totalTurns;
  return (
    <div className={styles.reveal}>
      <h2 className={styles.revealTitle}>{headline}</h2>
      {r.author !== null && <p className="pg-dim">“{r.word}” was written by {names[r.author]}</p>}
      <ul className={styles.gainList}>
        {r.solves.map((s, i) => (
          <li key={s.seat} style={{ '--c': seatColor(s.seat), '--i': i } as CSSProperties}>
            <span>
              {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '✓'} {names[s.seat]}
            </span>
            <b>+{s.points}</b>
          </li>
        ))}
        <li style={{ '--c': seatColor(r.drawer) } as CSSProperties}>
          <span>✏️ {names[r.drawer]} (artist)</span>
          <b>+{r.drawerPoints}</b>
        </li>
      </ul>
      {isHost ? (
        <button className="pg-btn pg-btn-primary pg-btn-block" onClick={() => send({ type: 'next', turn: view.turnNo })} autoFocus>
          {last ? 'See the results →' : 'Next turn →'}
        </button>
      ) : (
        <p className="pg-faint">{last ? 'Results coming up…' : 'Next turn coming up…'}</p>
      )}
    </div>
  );
}

function Scoreboard({ view, seat }: { view: SketchView; seat: SeatIndex | null }) {
  const solved = new Set(view.solves.map((s) => s.seat));
  const rows = view.seats
    .map((s) => ({ seat: s.index, name: s.name, score: view.scores[s.index] ?? 0, gain: view.gains[s.index] ?? 0 }))
    .sort((a, b) => b.score - a.score || a.seat - b.seat);
  let place = 0;
  return (
    <ol className={styles.scores} aria-label="Scores">
      {rows.map((r, i) => {
        if (i === 0 || r.score !== rows[i - 1]!.score) place = i + 1;
        const live = view.phase === 'drawing' || view.phase === 'reveal';
        return (
          <li
            key={r.seat}
            className={`${styles.scoreRow} ${r.seat === seat ? styles.me : ''} ${live && solved.has(r.seat) ? styles.solvedRow : ''}`}
            style={{ '--c': seatColor(r.seat) } as CSSProperties}
          >
            <span className={styles.place}>{place}</span>
            <span className={styles.dot} />
            <span className={styles.scoreName}>
              {r.name}
              {r.seat === view.drawer && <span title="Drawing"> ✏️</span>}
              {live && solved.has(r.seat) && <span title="Got it"> ✓</span>}
            </span>
            {r.gain > 0 && <span className={styles.gain}>+{r.gain}</span>}
            <span className={styles.points}>{r.score}</span>
          </li>
        );
      })}
    </ol>
  );
}

function HostBar({ view, send }: { view: SketchView; send: Send }) {
  const confirmFinish = () => {
    if (typeof window.confirm === 'function' && !window.confirm('Finish the game now and show the scores?')) return;
    send({ type: 'finish' });
  };
  return (
    <div className={styles.hostBar}>
      <span className="pg-kicker">Host</span>
      {view.phase === 'drawing' && view.guessing === 'typed' && (
        <button className="pg-btn pg-btn-sm pg-btn-ghost" onClick={() => send({ type: 'skipTurn', turn: view.turnNo })}>
          End turn
        </button>
      )}
      <button className="pg-btn pg-btn-sm pg-btn-ghost" onClick={confirmFinish}>
        Finish game
      </button>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Final scores

function Results({ view, seat }: { view: SketchView; seat: SeatIndex | null }) {
  const r = view.results!;
  const names = view.seats.map((s) => s.name);
  const best = Math.max(0, ...view.scores);
  const winners = view.seats.filter((s) => view.scores[s.index] === best);
  const headline =
    best === 0 ? 'Game over!' : winners.length > 1 ? 'It’s a tie!' : `${winners[0]!.name} wins!`;
  const rows = view.seats.map((s) => ({
    name: s.name,
    score: view.scores[s.index] ?? 0,
    color: seatColor(s.index),
    detail: `guessed ${r.guessed[s.index] ?? 0} · ${r.drawn[s.index] ?? 0} pts as artist`,
    you: seat === s.index,
  }));
  return (
    <FinalResults headline={headline} rows={rows} unit="pts">
      {(r.fastest || r.bestArtist || r.sharpest) && (
        <div className={styles.awards}>
          {r.bestArtist && (
            <Award icon="🎨" title="Best artist" who={names[r.bestArtist.seat]!}>
              {r.bestArtist.points} pts from drawing
            </Award>
          )}
          {r.fastest && (
            <Award icon="⚡" title="Fastest guess" who={names[r.fastest.seat]!}>
              {(r.fastest.ms / 1000).toFixed(1)}s on “{r.fastest.word}”
            </Award>
          )}
          {r.sharpest && (
            <Award icon="🎯" title="Sharpest eye" who={names[r.sharpest.seat]!}>
              first to get it {r.sharpest.firsts}×
            </Award>
          )}
        </div>
      )}
      {r.turns.length > 0 && (
        <details className={styles.allWords}>
          <summary>Every word ({r.turns.length})</summary>
          <ul>
            {r.turns.map((t, i) => (
              <li key={i}>
                <span className={styles.wordChip}>{t.word}</span>
                <span className="pg-dim">
                  drawn by {names[t.drawer]} · {t.solvers}/{t.of} got it
                  {t.author !== null && <> · written by {names[t.author]}</>}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </FinalResults>
  );
}

function Award({ icon, title, who, children }: { icon: string; title: string; who: string; children: ReactNode }) {
  return (
    <div className={styles.award}>
      <span className={styles.awardIcon} aria-hidden>
        {icon}
      </span>
      <span className={styles.awardText}>
        <span className="pg-kicker">{title}</span>
        <b>{who}</b>
        <small className="pg-dim">{children}</small>
      </span>
    </div>
  );
}
