import { useEffect, useRef, useState } from 'react';
import { isBlank } from '@/draw/drawing';
import { startTimer, type Timer } from '@/engine/timer';
import { serverNow } from '@/store/clock';
import { Countdown } from '@/ui/shared/Countdown';
import { DrawPad, Sketch, useLocalBoard } from '@/ui/shared/draw/DrawPad';
import { usePlay } from '@/ui/shared/hooks';
import { PassScreen } from '@/ui/shared/PassScreen';
import { play, vibrate } from '@/ui/shared/sfx';
import type { TelephoneAction } from '../actions';
import { MAX_GUESS_LENGTH, encodeToFit } from '../rules';
import type { TelephoneView } from '../state';
import { PageBody, Roster, Who, useBuzzer } from './parts';
import styles from './GameView.module.css';

// ============================================================================
// Step 0 (pick a prompt) and the draw / guess steps.
//
// Hidden-info rules for this file:
//  - A step screen renders only `view.held` — the one page before yours, in
//    the book you hold. Nothing else from any book exists in the view.
//  - Single device: a roster; each player taps their name, claims the phone
//    on a PassScreen (rendered INSTEAD of the page), does their page, and
//    the screen goes back to the seat-less roster.
// ============================================================================

type Send = (a: TelephoneAction) => void;

/** Single device: who has the phone right now (per step). */
interface Claim {
  step: number;
  seat: number;
  confirmed: boolean;
  /** Their own clock (one device has no shared one). */
  timer: Timer | null;
}

function useLocalClaim(view: TelephoneView) {
  const { seat, localTable, setSeat } = usePlay<TelephoneView>();
  const [claim, setClaim] = useState<Claim | null>(null);
  const active = claim && claim.step === view.stepIndex && !view.done[claim.seat] ? claim : null;
  // Off the roster (or the step moved on under us): back to the seat-less view.
  useEffect(() => {
    if (localTable && !active?.confirmed && seat !== null) setSeat(null);
  }, [localTable, active?.confirmed, seat, setSeat]);
  const secs = view.stepKind === 'draw' ? view.drawSeconds : view.guessSeconds;
  return {
    active,
    pick: (s: number) => setClaim({ step: view.stepIndex, seat: s, confirmed: false, timer: null }),
    confirm: () => {
      if (!claim) return;
      // Confirm first, then switch seat, so the reset effect never sees a half-claimed phone.
      const timed = view.timed && view.phase === 'step';
      setClaim({ ...claim, confirmed: true, timer: timed ? startTimer(secs * 1000, serverNow()) : null });
      setSeat(claim.seat);
    },
    release: () => {
      setClaim(null);
      setSeat(null);
    },
  };
}

// ----------------------------------------------------------------------------
// Step 0: pick one of three
// ----------------------------------------------------------------------------

export function PromptPick({ view }: { view: TelephoneView }) {
  const { seat, localTable, dispatch } = usePlay<TelephoneView>();
  const names = view.seats.map((s) => s.name);
  const claim = useLocalClaim(view);
  const send: Send = (a) => dispatch(a);

  if (localTable) {
    const a = claim.active;
    if (a && !a.confirmed) {
      return (
        <PassScreen
          to={names[a.seat] ?? '?'}
          message="Pick the prompt that starts your sketchbook. No peeking, everyone else!"
          icon="📒"
          onReady={claim.confirm}
        >
          <button className="pg-btn pg-btn-ghost pg-btn-sm" onClick={claim.release}>
            Back
          </button>
        </PassScreen>
      );
    }
    if (a && a.confirmed && seat === a.seat && view.choices) {
      return (
        <Choices
          view={view}
          who={names[a.seat]}
          onPick={(choice) => {
            send({ type: 'pick', bySeat: a.seat, choice });
            play('pop');
            claim.release();
          }}
        />
      );
    }
    return (
      <section className={styles.center}>
        <Heading kicker="Step 0 · the prompt" title="Start your sketchbooks" />
        <p className="pg-dim">Tap your name, pick a secret prompt, then pass the phone along.</p>
        <Roster names={names} done={view.done} onPick={claim.pick} />
      </section>
    );
  }

  if (seat !== null && view.choices) {
    return (
      <>
        <Choices
          view={view}
          onPick={(choice) => {
            send({ type: 'pick', bySeat: seat, choice });
            play('pop');
          }}
        />
        {view.youDone && <Progress view={view} names={names} />}
      </>
    );
  }
  return (
    <section className={styles.center}>
      <Heading kicker="Step 0 · the prompt" title="Everyone’s picking a prompt…" />
      <Progress view={view} names={names} />
    </section>
  );
}

function Choices({ view, who, onPick }: { view: TelephoneView; who?: string; onPick: (choice: number) => void }) {
  return (
    <section className={styles.center}>
      <Heading
        kicker={who ? `${who} · step 0` : 'Step 0 · the prompt'}
        title="Pick your prompt"
        sub="It starts your sketchbook. The next player will have to draw it — choose wisely (or wickedly)."
      />
      <div className={`${styles.choices} pg-stagger`}>
        {view.choices!.map((text, i) => (
          <button
            key={i}
            type="button"
            className={`${styles.choice} ${view.picked === i ? styles.choiceOn : ''} pg-hand`}
            style={{ '--i': i, '--r': `${(i - 1) * 1.4}deg` } as React.CSSProperties}
            onClick={() => onPick(i)}
            aria-pressed={view.picked === i}
          >
            {text}
            {view.picked === i && <span className={styles.choiceTick}>✓</span>}
          </button>
        ))}
      </div>
      {view.picked !== null && !who && <p className="pg-dim">You can switch until everyone has picked.</p>}
    </section>
  );
}

// ----------------------------------------------------------------------------
// Draw / guess steps
// ----------------------------------------------------------------------------

export function StepPhase({ view }: { view: TelephoneView }) {
  const { seat, localTable, dispatch } = usePlay<TelephoneView>();
  const names = view.seats.map((s) => s.name);
  const claim = useLocalClaim(view);
  const send: Send = (a) => dispatch(a);
  const drawing = view.stepKind === 'draw';

  if (localTable) {
    const a = claim.active;
    if (a && !a.confirmed) {
      return (
        <PassScreen
          to={names[a.seat] ?? '?'}
          message={drawing ? 'Your turn to draw. Everyone else, look away!' : 'Your turn to guess. No peeking, everyone else!'}
          icon={drawing ? '✏️' : '🔍'}
          onReady={claim.confirm}
        >
          <button className="pg-btn pg-btn-ghost pg-btn-sm" onClick={claim.release}>
            Back
          </button>
        </PassScreen>
      );
    }
    if (a && a.confirmed && seat === a.seat && view.held) {
      return (
        <ActiveStep
          key={`${view.stepIndex}:${a.seat}`}
          view={view}
          bySeat={a.seat}
          timer={a.timer}
          who={names[a.seat]}
          send={send}
          onDone={claim.release}
          onCancel={claim.release}
        />
      );
    }
    return (
      <section className={styles.center}>
        <Heading
          kicker={`Step ${view.stepIndex} of ${view.totalSteps}`}
          title={drawing ? '✏️ Time to draw' : '💭 Time to guess'}
          sub={
            view.timed
              ? `Tap your name and pass the phone. You get ${drawing ? view.drawSeconds : view.guessSeconds}s once you’re holding it.`
              : 'Tap your name, then pass the phone along.'
          }
        />
        <Roster names={names} done={view.done} onPick={claim.pick} />
        <p className="pg-faint">
          {view.doneCount} of {names.length} done
        </p>
      </section>
    );
  }

  if (seat !== null && view.held) {
    return (
      <ActiveStep key={`${view.stepIndex}:${seat}`} view={view} bySeat={seat} timer={view.timer} send={send} />
    );
  }
  return <Waiting view={view} names={names} spectator={seat === null} />;
}

function ActiveStep(props: {
  view: TelephoneView;
  bySeat: number;
  timer: Timer | null;
  who?: string;
  send: Send;
  onDone?: () => void;
  onCancel?: () => void;
}) {
  return props.view.held!.kind === 'draw' ? <DrawStep {...props} /> : <GuessStep {...props} />;
}

function StepTop({
  view,
  bySeat,
  timer,
  who,
  children,
}: {
  view: TelephoneView;
  bySeat: number;
  timer: Timer | null;
  who?: string;
  children: React.ReactNode;
}) {
  const names = view.seats.map((s) => s.name);
  const held = view.held!;
  return (
    <div className={styles.stepTop}>
      <div className={styles.stepInfo}>
        <span className="pg-kicker">
          {who ? `${who} · ` : ''}Step {view.stepIndex} of {view.totalSteps}
        </span>
        <span className={styles.bookOf}>
          <Who seat={held.owner} names={names}>’s sketchbook</Who>
          {held.owner === bySeat && <b className={styles.ownBook}> — it’s back to you!</b>}
        </span>
        {children}
      </div>
      {timer && <Countdown timer={timer} size="md" beep />}
    </div>
  );
}

function DrawStep({
  view,
  bySeat,
  timer,
  who,
  send,
  onDone,
  onCancel,
}: {
  view: TelephoneView;
  bySeat: number;
  timer: Timer | null;
  who?: string;
  send: Send;
  onDone?: () => void;
  onCancel?: () => void;
}) {
  const held = view.held!;
  const board = useLocalBoard(`${held.step}:${bySeat}`);
  const sent = useRef(false);
  const blank = isBlank(board.model.drawing());
  const prompt = held.previous.kind === 'draw' ? '' : held.previous.text;

  const submit = (auto: boolean) => {
    if (sent.current) return;
    if (!auto && blank && typeof window.confirm === 'function' && !window.confirm('Hand in a blank page?')) return;
    sent.current = true;
    send({ type: 'draw', bySeat, step: held.step, drawing: encodeToFit(board.model.drawing()) });
    play(auto ? 'buzzer' : 'whoosh');
    if (auto) vibrate(120);
    onDone?.();
  };
  useBuzzer(timer, () => submit(true));

  return (
    <section className={styles.step}>
      <StepTop view={view} bySeat={bySeat} timer={timer} who={who}>
        <div className={styles.toDraw}>
          <span className={styles.toDrawLabel}>Draw:</span>
          <span className={`${styles.toDrawText} pg-hand`}>{prompt}</span>
        </div>
      </StepTop>
      <div className={styles.canvasBox}>
        <DrawPad source={board} enabled />
      </div>
      <div className={styles.stepActions}>
        {onCancel && (
          <button type="button" className="pg-btn pg-btn-ghost" onClick={onCancel}>
            Not me
          </button>
        )}
        <button type="button" className="pg-btn pg-btn-primary pg-btn-lg" onClick={() => submit(false)}>
          Pass it on ✓
        </button>
      </div>
      <p className={styles.tip}>No letters or numbers — make them work for it.</p>
    </section>
  );
}

function GuessStep({
  view,
  bySeat,
  timer,
  who,
  send,
  onDone,
  onCancel,
}: {
  view: TelephoneView;
  bySeat: number;
  timer: Timer | null;
  who?: string;
  send: Send;
  onDone?: () => void;
  onCancel?: () => void;
}) {
  const held = view.held!;
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const sent = useRef(false);
  const names = view.seats.map((s) => s.name);
  const drawing = held.previous.kind === 'draw' ? held.previous.drawing : null;

  const submit = (auto: boolean) => {
    if (sent.current) return;
    const clean = text.replace(/\s+/g, ' ').trim();
    if (!clean) {
      // Online the host fills in an empty guess after the grace period; on one
      // device there's no shared clock, so the player is asked to hurry.
      setError(auto ? 'Time’s up — write anything and pass it on!' : 'Write a guess first — any guess!');
      play('error');
      return;
    }
    sent.current = true;
    send({ type: 'guess', bySeat, step: held.step, text: clean.slice(0, MAX_GUESS_LENGTH) });
    play(auto ? 'buzzer' : 'whoosh');
    onDone?.();
  };
  useBuzzer(timer, () => submit(true));

  return (
    <form
      className={styles.step}
      onSubmit={(e) => {
        e.preventDefault();
        submit(false);
      }}
    >
      <StepTop view={view} bySeat={bySeat} timer={timer} who={who}>
        <span className={styles.toDraw}>
          <span className={styles.toDrawLabel}>What did</span>
          <Who seat={held.previous.by} names={names} />
          <span className={styles.toDrawLabel}>draw?</span>
        </span>
      </StepTop>
      <div className={styles.canvasBox}>
        {drawing !== null ? <Sketch drawing={drawing} label="The drawing to guess" /> : <PageBody page={held.previous} big />}
      </div>
      <div className={styles.guessRow}>
        <input
          className={`pg-input ${styles.guessInput}`}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setError(null);
          }}
          placeholder="I think it’s…"
          maxLength={MAX_GUESS_LENGTH}
          autoComplete="off"
          autoFocus
          aria-label="Your guess"
        />
        <button type="submit" className="pg-btn pg-btn-primary pg-btn-lg">
          Pass it on ✓
        </button>
      </div>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      {onCancel && (
        <button type="button" className="pg-btn pg-btn-ghost pg-btn-sm" onClick={onCancel}>
          Not me
        </button>
      )}
    </form>
  );
}

function Waiting({ view, names, spectator }: { view: TelephoneView; names: string[]; spectator: boolean }) {
  const drawing = view.stepKind === 'draw';
  return (
    <section className={styles.center}>
      <div className={styles.waitArt} aria-hidden>
        {spectator ? (drawing ? '✏️' : '💭') : '📒'}
      </div>
      <Heading
        kicker={`Step ${view.stepIndex} of ${view.totalSteps}`}
        title={spectator ? (drawing ? 'Everyone’s drawing…' : 'Everyone’s guessing…') : 'Passed on!'}
        sub={
          spectator
            ? 'The books are secret until the reveal.'
            : view.doneCount < names.length
              ? 'Waiting for the slowpokes. Your next page is coming.'
              : 'Turning the page…'
        }
      />
      {view.timer && <Countdown timer={view.timer} size="lg" />}
      {view.hurried && <p className={styles.hurry}>⏩ Hurry up! The host rang the bell.</p>}
      <Progress view={view} names={names} />
    </section>
  );
}

export function Progress({ view, names }: { view: TelephoneView; names: string[] }) {
  return (
    <div className={styles.progress}>
      <span className="pg-kicker">
        {view.doneCount} of {names.length} done
      </span>
      <Roster names={names} done={view.done} />
    </div>
  );
}

export function Heading({ kicker, title, sub }: { kicker?: string; title: string; sub?: string }) {
  return (
    <header className={styles.heading}>
      {kicker && <span className="pg-kicker">{kicker}</span>}
      <h2 className={styles.title}>{title}</h2>
      {sub && <p className={styles.sub}>{sub}</p>}
    </header>
  );
}
