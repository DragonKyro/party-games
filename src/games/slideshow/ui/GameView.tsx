import { useCallback, useEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';
import { CollectPanel } from '@/ui/shared/CollectPanel';
import { Countdown } from '@/ui/shared/Countdown';
import { FinalResults } from '@/ui/shared/FinalResults';
import { GameShell } from '@/ui/shared/GameShell';
import { seatColor, usePlay } from '@/ui/shared/hooks';
import { PassScreen } from '@/ui/shared/PassScreen';
import { play, vibrate } from '@/ui/shared/sfx';
import { useWakeLock } from '@/ui/shared/useWakeLock';
import type { SlideshowAction } from '../actions';
import { APPLAUSE_LEVELS } from '../content';
import type { SlideshowView } from '../state';
import { Slide } from './Slide';
import styles from './GameView.module.css';

// ============================================================================
// Slideshow Karaoke game view
//
// Hidden-info rules for this file:
//  - The view only ever carries the slide on screen (`view.slide`); nothing
//    here can render a later slide, because no device is sent one.
//  - Ratings: this seat's own vote (`rating.yours`) is the only one shown
//    before the reveal; the reveal shows the average + an anonymous histogram.
//  - Single device, "pass the device" rating: each voter claims the device
//    (PassScreen) before the stars appear, and the screen never shows a vote.
//
// Who drives the clicker: the presenter's own phone (online) and the host's
// screen (the shared laptop / TV). Arrow keys and presentation clickers
// (PageUp / PageDown) work on those devices.
// ============================================================================

type Send = (a: SlideshowAction) => void;

export default function SlideshowGameView() {
  const { view, seat, isHost, localTable, dispatch } = usePlay<SlideshowView>();
  const stageRef = useRef<HTMLDivElement>(null);
  const [full, toggleFull] = useFullscreen(stageRef);
  useWakeLock(!!view && view.phase !== 'collect' && view.phase !== 'gameOver');
  if (!view) return null;
  const send: Send = (a) => dispatch(a);
  const names = view.seats.map((s) => s.name);
  const p = view.presenter;
  const pName = p !== null ? (names[p] ?? '?') : '';
  const iPresent = !localTable && seat !== null && seat === p;
  const canDrive = isHost || iPresent;
  const bySeat = iPresent ? (seat ?? undefined) : undefined;
  const talkLabel = `Talk ${Math.min(view.talkNo + 1, view.talkCount)} of ${view.talkCount}`;

  const status =
    view.phase === 'collect'
      ? 'Writing topics'
      : view.phase === 'intro'
        ? `${talkLabel} · up next: ${pName}`
        : view.phase === 'talk'
          ? `${talkLabel} · ${pName} presenting`
          : view.phase === 'qa'
            ? `${talkLabel} · audience Q&A`
            : view.phase === 'rating'
              ? `${talkLabel} · rate ${pName}`
              : view.phase === 'reveal'
                ? `${talkLabel} · the verdict`
                : 'Final standings';

  const hasTimers = (view.phase === 'talk' && (view.slideTimer || view.talkTimer)) || (view.phase === 'rating' && view.rating?.timer);

  let body: React.ReactNode;
  switch (view.phase) {
    case 'collect':
      body = view.collect && (
        <CollectPanel
          collect={view.collect}
          names={names}
          title="Write talk topics"
          placeholder="Penguins, tax season, grandma’s sofa…"
          hint="Any noun works. Somebody else will have to give a keynote on it — you’ll never get your own."
        />
      );
      break;
    case 'intro':
      body = <Intro view={view} pName={pName} iPresent={iPresent} isHost={isHost} localTable={localTable} bySeat={bySeat} send={send} />;
      break;
    case 'talk':
      body = (
        <Talk
          view={view}
          pName={pName}
          canDrive={canDrive}
          iPresent={iPresent}
          bySeat={bySeat}
          send={send}
          stageRef={stageRef}
          full={full}
        />
      );
      break;
    case 'qa':
      body = <QA view={view} pName={pName} canDrive={canDrive} iPresent={iPresent} bySeat={bySeat} send={send} />;
      break;
    case 'rating':
      body = <Rating view={view} pName={pName} seat={seat} isHost={isHost} localTable={localTable} send={send} names={names} />;
      break;
    case 'reveal':
      body = <Reveal view={view} names={names} isHost={isHost} send={send} seat={localTable ? null : seat} />;
      break;
    case 'gameOver':
      body = <Results view={view} names={names} seat={localTable ? null : seat} />;
      break;
  }

  return (
    <GameShell
      gameId="slideshow"
      status={status}
      wide={view.phase === 'talk'}
      right={
        <>
          {isHost && hasTimers && (
            <button
              className="pg-btn pg-btn-sm"
              onClick={() => send({ type: view.paused ? 'resume' : 'pause' })}
              aria-label={view.paused ? 'Resume' : 'Pause'}
            >
              {view.paused ? '▶' : '❚❚'}
            </button>
          )}
          {view.phase === 'talk' && fullscreenSupported() && (
            <button className="pg-btn pg-btn-sm pg-btn-ghost" onClick={toggleFull} aria-label="Full screen" title="Full screen (F)">
              ⛶
            </button>
          )}
        </>
      }
    >
      {body}
    </GameShell>
  );
}

// ---- fullscreen ----------------------------------------------------------------

function fullscreenSupported(): boolean {
  return typeof document !== 'undefined' && !!document.fullscreenEnabled;
}

function useFullscreen(ref: RefObject<HTMLElement | null>): [boolean, () => void] {
  const [full, setFull] = useState(false);
  useEffect(() => {
    const onChange = () => setFull(!!document.fullscreenElement && document.fullscreenElement === ref.current);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, [ref]);
  const toggle = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    else void ref.current?.requestFullscreen?.().catch(() => {});
  }, [ref]);
  return [full, toggle];
}

// ---- intro -----------------------------------------------------------------------

function Intro({
  view,
  pName,
  iPresent,
  isHost,
  localTable,
  bySeat,
  send,
}: {
  view: SlideshowView;
  pName: string;
  iPresent: boolean;
  isHost: boolean;
  localTable: boolean;
  bySeat: number | undefined;
  send: Send;
}) {
  const p = view.presenter!;
  const mine = iPresent || localTable;
  const start = () => {
    play('whoosh');
    send({ type: 'startTalk', bySeat, talk: view.talkNo });
  };
  const chips = [
    `${view.slideCount} slides`,
    view.autoAdvance > 0 ? `slides move on every ${view.autoAdvance}s` : 'you click Next',
    ...(view.twistsOn ? ['a twist is coming'] : []),
    ...(view.qaOn ? ['Q&A after'] : []),
  ];
  return (
    <section className={styles.intro} key={view.talkNo}>
      <span className="pg-kicker">Talk {view.talkNo + 1} of {view.talkCount}</span>
      <div className={styles.speaker} style={{ '--c': seatColor(p) } as CSSProperties}>
        <span className={styles.mic} aria-hidden>
          🎤
        </span>
        {iPresent ? 'You’re up!' : pName}
      </div>
      <p className={styles.presents}>{iPresent ? 'Your talk is called' : localTable ? `${pName}, your talk is called` : 'will now present'}</p>
      <h2 className={styles.talkTitle}>{view.talkTitle}</h2>
      <ul className={styles.chips}>
        {chips.map((c) => (
          <li key={c} className="pg-chip">
            {c}
          </li>
        ))}
      </ul>
      <p className={styles.tip}>
        Nobody{mine ? '' : ` — not even ${pName} —`} has seen these slides. Each one appears as it’s shown. Keep talking, and make it make sense.
      </p>
      {mine ? (
        <button className={`pg-btn pg-btn-primary pg-btn-xl ${styles.go}`} onClick={start} autoFocus>
          Start talk ▶
        </button>
      ) : isHost ? (
        <button className="pg-btn pg-btn-primary pg-btn-lg" onClick={start}>
          Start for {pName}
        </button>
      ) : (
        <p className="pg-dim">Waiting for {pName} to start…</p>
      )}
      {isHost && (
        <button className="pg-btn pg-btn-ghost pg-btn-sm" onClick={() => send({ type: 'skipPresenter', talk: view.talkNo })}>
          Skip {pName}
        </button>
      )}
    </section>
  );
}

// ---- the talk ----------------------------------------------------------------------

function Talk({
  view,
  pName,
  canDrive,
  iPresent,
  bySeat,
  send,
  stageRef,
  full,
}: {
  view: SlideshowView;
  pName: string;
  canDrive: boolean;
  iPresent: boolean;
  bySeat: number | undefined;
  send: Send;
  stageRef: RefObject<HTMLDivElement | null>;
  full: boolean;
}) {
  const slide = view.slide!;
  const i = view.slideIndex;
  const last = i === view.slideCount - 1;
  // One click per slide: lock until the next slide arrives.
  const [busy, setBusy] = useState<number | null>(null);
  if (busy !== null && busy !== i) setBusy(null);

  const go = useCallback(
    (dir: 'next' | 'back') => {
      if (!canDrive || view.paused || busy === i) return;
      if (dir === 'back' && i === 0) return;
      setBusy(i);
      play(dir === 'next' ? 'pop' : 'pass');
      send({ type: dir, bySeat, slide: i });
    },
    [canDrive, view.paused, busy, i, bySeat, send],
  );

  // Keyboard + presentation clickers on the driving device.
  const goRef = useRef(go);
  useEffect(() => {
    goRef.current = go;
  });
  useEffect(() => {
    if (!canDrive) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') {
        e.preventDefault();
        goRef.current('next');
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        goRef.current('back');
      } else if (e.key === 'f' || e.key === 'F') {
        const el = stageRef.current;
        if (!el || !document.fullscreenEnabled) return;
        if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
        else void el.requestFullscreen().catch(() => {});
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [canDrive, stageRef]);

  // The twist lands: everyone hears it.
  const twist = view.twist;
  const prevTwist = useRef(twist);
  useEffect(() => {
    if (twist && !prevTwist.current) {
      play('reveal');
      vibrate([80, 60, 80]);
    }
    prevTwist.current = twist;
  }, [twist]);

  const dots = (
    <div className={styles.dots} aria-label={`Slide ${i + 1} of ${view.slideCount}`}>
      {Array.from({ length: view.slideCount }, (_, k) => (
        <span key={k} className={k < i ? styles.dotDone : k === i ? styles.dotNow : ''} />
      ))}
    </div>
  );

  return (
    <section className={styles.talk}>
      <div className={`${styles.stage} ${full ? styles.stageFull : ''}`} ref={stageRef}>
        {twist && (
          <div className={styles.twist} role="alert">
            <span className={styles.twistTag}>⚡ Plot twist</span>
            <span className={styles.twistText}>{twist}</span>
          </div>
        )}
        <div className={styles.frame}>
          <Slide key={i} slide={slide} index={i} total={view.slideCount} className={styles.slideIn} />
          {view.paused && <div className={styles.pausedVeil}>Paused</div>}
        </div>
        {full && (
          <div className={styles.fullBar}>
            {dots}
            {view.slideTimer && <Countdown timer={view.slideTimer} size="sm" />}
            {view.talkTimer && <Countdown timer={view.talkTimer} size="sm" beep />}
          </div>
        )}
      </div>

      <div className={styles.controls}>
        {canDrive ? (
          <>
            <button className={`pg-btn pg-btn-lg ${styles.back}`} onClick={() => go('back')} disabled={i === 0 || view.paused}>
              ◀<span className={styles.btnText}> Back</span>
            </button>
            <div className={styles.mid}>
              {dots}
              <div className={styles.timers}>
                {view.slideTimer && <Countdown timer={view.slideTimer} size="sm" label="slide" />}
                {!full && view.talkTimer && <Countdown timer={view.talkTimer} size="sm" label="talk" beep />}
              </div>
            </div>
            <button className={`pg-btn pg-btn-primary pg-btn-lg ${styles.next}`} onClick={() => go('next')} disabled={view.paused} autoFocus>
              {last ? 'Finish ✓' : 'Next ▶'}
            </button>
          </>
        ) : (
          <div className={styles.watching}>
            <span>
              🎤 <b>{pName}</b> is presenting
            </span>
            {dots}
            <div className={styles.timers}>
              {view.slideTimer && <Countdown timer={view.slideTimer} size="sm" label="slide" />}
              {view.talkTimer && <Countdown timer={view.talkTimer} size="sm" label="talk" />}
            </div>
          </div>
        )}
      </div>
      {iPresent && <p className={styles.remoteHint}>This phone is your clicker. Everyone sees the same slide.</p>}
    </section>
  );
}

// ---- Q&A -------------------------------------------------------------------------

function QA({
  view,
  pName,
  canDrive,
  iPresent,
  bySeat,
  send,
}: {
  view: SlideshowView;
  pName: string;
  canDrive: boolean;
  iPresent: boolean;
  bySeat: number | undefined;
  send: Send;
}) {
  return (
    <section className={styles.qa}>
      <span className="pg-kicker">Audience Q&amp;A</span>
      <h2 className={styles.qaTitle}>Questions from the floor</h2>
      <div className={`${styles.questions} pg-stagger`}>
        {view.questions.map((q, i) => (
          <blockquote key={i} className={styles.question} style={{ '--i': i } as CSSProperties}>
            <span aria-hidden>🙋</span> {q}
          </blockquote>
        ))}
      </div>
      <p className="pg-dim">{iPresent ? 'Answer with total confidence.' : `${pName}, answer with total confidence. Follow-up heckles are allowed.`}</p>
      {canDrive && (
        <button className="pg-btn pg-btn-primary pg-btn-lg" onClick={() => send({ type: 'endQA', bySeat, talk: view.talkNo })} autoFocus>
          Done — rate the talk →
        </button>
      )}
    </section>
  );
}

// ---- rating --------------------------------------------------------------------------

function Stars({ value, onPick, size = 'lg' }: { value: number | null; onPick?: (n: number) => void; size?: 'lg' | 'md' }) {
  return (
    <div className={`${styles.stars} ${size === 'md' ? styles.starsMd : ''}`} role={onPick ? 'radiogroup' : 'img'} aria-label={onPick ? 'Rating' : `${value ?? 0} stars`}>
      {[1, 2, 3, 4, 5].map((n) =>
        onPick ? (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={`${n} star${n === 1 ? '' : 's'}`}
            className={`${styles.star} ${value !== null && n <= value ? styles.starOn : ''}`}
            onClick={() => onPick(n)}
          >
            ★
          </button>
        ) : (
          <span key={n} className={`${styles.star} ${value !== null && n <= Math.round(value) ? styles.starOn : ''}`}>
            ★
          </span>
        ),
      )}
    </div>
  );
}

function Rating({
  view,
  pName,
  seat,
  isHost,
  localTable,
  send,
  names,
}: {
  view: SlideshowView;
  pName: string;
  seat: number | null;
  isHost: boolean;
  localTable: boolean;
  send: Send;
  names: string[];
}) {
  const r = view.rating!;
  const voted = r.audience.filter((s) => r.voted[s]).length;
  const revealNow = isHost && (
    <button className="pg-btn pg-btn-ghost pg-btn-sm" onClick={() => send({ type: 'revealNow', talk: view.talkNo })}>
      Reveal now{voted > 0 ? ` (${voted} of ${r.audience.length} in)` : ''}
    </button>
  );

  if (view.ratingMode === 'applause') return <Applause view={view} pName={pName} send={send} />;
  if (localTable) return <PassRating view={view} pName={pName} names={names} send={send} revealNow={revealNow} />;

  const iVote = seat !== null && r.audience.includes(seat);
  const header = (
    <>
      <span className="pg-kicker">Rate the talk</span>
      <h2 className={styles.rateTitle}>{view.talkTitle}</h2>
      <p className="pg-dim">by {pName}</p>
    </>
  );
  return (
    <section className={styles.rating}>
      {header}
      {r.timer && <Countdown timer={r.timer} size="md" beep={iVote && r.yours === null} />}
      {iVote ? (
        <>
          <Stars
            value={r.yours}
            onPick={(stars) => {
              play('pop');
              vibrate(20);
              send({ type: 'rate', bySeat: seat!, talk: view.talkNo, stars });
            }}
          />
          <p className={styles.rateNote}>
            {r.yours === null ? 'Tap the stars. Votes stay secret until everyone’s in.' : `You gave ${r.yours}★ — change it any time before the reveal.`}
          </p>
        </>
      ) : (
        <p className={styles.rateNote}>{seat === view.presenter ? 'The audience is judging you. Smile.' : 'The audience is voting…'}</p>
      )}
      <Voters view={view} names={names} />
      {revealNow}
    </section>
  );
}

function Voters({ view, names }: { view: SlideshowView; names: string[] }) {
  const r = view.rating!;
  return (
    <ul className={styles.voters} aria-label="Who has voted">
      {r.audience.map((s) => (
        <li key={s} className={r.voted[s] ? styles.voterDone : ''} style={{ '--c': seatColor(s) } as CSSProperties}>
          <span className={styles.voterDot} />
          {names[s]}
          <span aria-label={r.voted[s] ? 'voted' : 'waiting'}>{r.voted[s] ? '✓' : '…'}</span>
        </li>
      ))}
    </ul>
  );
}

/** Single device: each audience member takes the device and taps their stars in private. */
function PassRating({
  view,
  pName,
  names,
  send,
  revealNow,
}: {
  view: SlideshowView;
  pName: string;
  names: string[];
  send: Send;
  revealNow: React.ReactNode;
}) {
  const r = view.rating!;
  const [voter, setVoter] = useState<number | null>(null);
  const [claimed, setClaimed] = useState(false);
  if (voter !== null && !claimed) {
    return (
      <PassScreen
        to={names[voter] ?? '?'}
        message={`Rate ${pName}’s talk in private.`}
        icon="⭐"
        onReady={() => setClaimed(true)}
      >
        <button className="pg-btn pg-btn-ghost pg-btn-sm" onClick={() => setVoter(null)}>
          Back
        </button>
      </PassScreen>
    );
  }
  if (voter !== null && claimed) {
    return (
      <section className={styles.rating}>
        <span className="pg-kicker">{names[voter]}, rate the talk</span>
        <h2 className={styles.rateTitle}>{view.talkTitle}</h2>
        <Stars
          value={null}
          onPick={(stars) => {
            play('pop');
            send({ type: 'rate', bySeat: voter, talk: view.talkNo, stars });
            setVoter(null);
            setClaimed(false);
          }}
        />
        <p className={styles.rateNote}>One tap and pass it on. Nobody sees your vote.</p>
      </section>
    );
  }
  return (
    <section className={styles.rating}>
      <span className="pg-kicker">Rate the talk</span>
      <h2 className={styles.rateTitle}>{view.talkTitle}</h2>
      <p className="pg-dim">Tap your name, rate {pName} in secret, pass the device along.</p>
      <ul className={styles.voters}>
        {r.audience.map((s) => (
          <li key={s} className={r.voted[s] ? styles.voterDone : ''} style={{ '--c': seatColor(s) } as CSSProperties}>
            <button type="button" className={styles.voterBtn} onClick={() => setVoter(s)} disabled={r.voted[s]}>
              <span className={styles.voterDot} />
              {names[s]}
              <span>{r.voted[s] ? '✓' : '…'}</span>
            </button>
          </li>
        ))}
      </ul>
      {revealNow}
    </section>
  );
}

/** Single device: the crowd cheers, whoever holds the device reads the meter. */
function Applause({ view, pName, send }: { view: SlideshowView; pName: string; send: Send }) {
  const [level, setLevel] = useState<number | null>(null);
  return (
    <section className={styles.rating}>
      <span className="pg-kicker">Applause meter</span>
      <h2 className={styles.rateTitle}>Make some noise for {pName}!</h2>
      <p className="pg-dim">Everyone cheer, clap or boo. Then tap how loud it got.</p>
      <div className={styles.meter} role="radiogroup" aria-label="How loud was the applause?">
        {APPLAUSE_LEVELS.map((name, k) => {
          const stars = k + 1;
          return (
            <button
              key={name}
              type="button"
              role="radio"
              aria-checked={level === stars}
              className={`${styles.meterBar} ${level !== null && stars <= level ? styles.meterOn : ''}`}
              style={{ '--h': `${28 + k * 18}%`, '--k': k } as CSSProperties}
              onClick={() => {
                play('pop');
                setLevel(stars);
              }}
            >
              <span className={styles.meterFill} />
              <span className={styles.meterLabel}>{name}</span>
            </button>
          );
        })}
      </div>
      <button
        className="pg-btn pg-btn-primary pg-btn-lg"
        disabled={level === null}
        onClick={() => level !== null && send({ type: 'applause', talk: view.talkNo, stars: level })}
      >
        {level === null ? 'Tap the meter' : `Lock it in: ${level}★`}
      </button>
    </section>
  );
}

// ---- reveal ------------------------------------------------------------------------------

function Reveal({ view, names, isHost, send, seat }: { view: SlideshowView; names: string[]; isHost: boolean; send: Send; seat: number | null }) {
  const r = view.reveal!;
  useEffect(() => {
    play(r.average !== null && r.average >= 4.5 ? 'fanfare' : 'reveal');
  }, [r.average]);
  const maxBar = Math.max(1, ...r.histogram);
  const next = view.nextPresenter;
  const ranked = view.standings.filter((s) => s.talks > 0).sort((a, b) => (b.average ?? -1) - (a.average ?? -1));
  return (
    <section className={styles.reveal}>
      <span className="pg-kicker">{seat === r.presenter ? 'Your verdict' : `${names[r.presenter]}’s verdict`}</span>
      <h2 className={styles.rateTitle}>{r.title}</h2>
      <div className={styles.score}>
        {r.average !== null ? r.average.toFixed(1) : '—'}
        <small>★</small>
      </div>
      <Stars value={r.average} size="md" />
      <p className={styles.label}>{r.label}</p>
      {r.crowd ? (
        <p className="pg-dim">Measured on the applause meter.</p>
      ) : (
        r.votes > 0 && (
          <div className={styles.histogram} aria-label="How the votes fell">
            {r.histogram.map((count, k) => (
              <div key={k} className={styles.hbar}>
                <span className={styles.hfill} style={{ height: `${(count / maxBar) * 100}%` } as CSSProperties} />
                <span className={styles.hcount}>{count || ''}</span>
                <span className={styles.hstar}>{k + 1}★</span>
              </div>
            ))}
          </div>
        )
      )}
      {ranked.length > 1 && (
        <ol className={styles.leader}>
          {ranked.slice(0, 5).map((s) => (
            <li key={s.seat} style={{ '--c': seatColor(s.seat) } as CSSProperties}>
              <span className={styles.voterDot} />
              <span className={styles.leaderName}>{names[s.seat]}</span>
              <b>{s.average !== null ? `${s.average.toFixed(1)}★` : '—'}</b>
            </li>
          ))}
        </ol>
      )}
      {isHost ? (
        <>
          <button className="pg-btn pg-btn-primary pg-btn-lg" onClick={() => send({ type: 'nextTalk', talk: view.talkNo })} autoFocus>
            {next !== null ? `Next up: ${names[next]} →` : 'See the results →'}
          </button>
          {next !== null && (
            <button className="pg-btn pg-btn-ghost pg-btn-sm" onClick={() => send({ type: 'finish' })}>
              Finish now — show the results
            </button>
          )}
        </>
      ) : (
        <p className="pg-dim">{next !== null ? `${names[next]} is up next.` : 'That was the last talk!'}</p>
      )}
    </section>
  );
}

// ---- results --------------------------------------------------------------------------------

function Results({ view, names, seat }: { view: SlideshowView; names: string[]; seat: number | null }) {
  const r = view.results!;
  const presented = view.standings.filter((s) => s.talks > 0);
  const best = Math.max(...presented.map((s) => s.average ?? 0), 0);
  const winners = presented.filter((s) => (s.average ?? 0) === best && best > 0);
  const headline =
    winners.length === 0 ? 'Thanks for presenting!' : winners.length > 1 ? 'A tie for keynote of the night!' : `${names[winners[0]!.seat]} gives the keynote of the night!`;
  const rows = presented.map((s) => ({
    name: names[s.seat] ?? '?',
    score: s.average ?? 0,
    color: seatColor(s.seat),
    detail: r.talks
      .filter((t) => t.presenter === s.seat)
      .map((t) => t.title)
      .join(' · '),
    you: seat === s.seat,
  }));
  return (
    <FinalResults headline={headline} subline="Ranked by average rating" rows={rows} unit="★">
      {r.awards.length > 0 && (
        <ul className={styles.awards}>
          {r.awards.map((a, i) => (
            <li key={i}>
              <span className={styles.awardEmoji} aria-hidden>
                {a.emoji}
              </span>
              <span>
                <b>{a.title}</b>: {names[a.seat]} <small>({a.detail})</small>
              </span>
            </li>
          ))}
        </ul>
      )}
      <details className={styles.allTalks}>
        <summary>Every talk ({r.talks.length})</summary>
        <ul>
          {r.talks.map((t, i) => (
            <li key={i}>
              <b>{names[t.presenter]}</b> — “{t.title}”{' '}
              <span className="pg-dim">
                {t.average !== null ? `${t.average.toFixed(1)}★` : 'no votes'}
                {t.topicBy && ` · topic by ${t.topicBy}`}
              </span>
            </li>
          ))}
        </ul>
      </details>
    </FinalResults>
  );
}
