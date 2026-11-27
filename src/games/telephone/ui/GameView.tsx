import { useEffect, useRef } from 'react';
import { CollectPanel } from '@/ui/shared/CollectPanel';
import { GameShell } from '@/ui/shared/GameShell';
import { usePlay } from '@/ui/shared/hooks';
import { play } from '@/ui/shared/sfx';
import { useWakeLock } from '@/ui/shared/useWakeLock';
import type { TelephoneAction } from '../actions';
import type { TelephoneView } from '../state';
import { RevealPhase } from './Reveal';
import { Results } from './Results';
import { PromptPick, StepPhase } from './Steps';
import styles from './GameView.module.css';

// ============================================================================
// Doodle Telephone game view
//
// Hidden-info rules (see also Steps.tsx):
//  - During steps the view holds only the page before yours in the book you
//    hold (`held`); the waiting / spectator screens show progress only.
//  - Single device: every page is behind a PassScreen the player taps
//    through; the reveal and the results are on the seat-less view.
// ============================================================================

export default function TelephoneGameView() {
  const { view, seat, isHost, localTable, dispatch, setSeat } = usePlay<TelephoneView>();
  useWakeLock(!!view && view.phase !== 'gameOver');
  const phase = view?.phase;
  const stepIndex = view?.stepIndex ?? 0;

  // One device: the reveal and results are for everyone — back to the seat-less view.
  useEffect(() => {
    if (localTable && (phase === 'reveal' || phase === 'gameOver') && seat !== null) setSeat(null);
  }, [localTable, phase, seat, setSeat]);

  // A page-turn sound when the books move on.
  const lastStep = useRef(stepIndex);
  useEffect(() => {
    if (phase === 'step' && stepIndex !== lastStep.current) play('pass');
    lastStep.current = stepIndex;
  }, [phase, stepIndex]);

  if (!view) return null;
  const names = view.seats.map((s) => s.name);
  const send = (a: TelephoneAction) => dispatch(a);

  const status =
    view.phase === 'prompt'
      ? 'Starting the sketchbooks'
      : view.phase === 'step'
        ? `Step ${view.stepIndex} of ${view.totalSteps} · ${view.stepKind === 'draw' ? 'Draw' : 'Guess'}`
        : view.phase === 'reveal'
          ? `The reveal · book ${view.reveal!.book + 1} of ${view.reveal!.bookCount}`
          : 'The results';

  let body: React.ReactNode;
  switch (view.phase) {
    case 'prompt':
      body =
        view.promptMode === 'write' && view.collect ? (
          <CollectPanel
            collect={view.collect}
            names={names}
            title="Start your sketchbook"
            placeholder="Something to draw…"
            hint="A thing, an action, a scene, a saying. The weirder the better — “a shark doing taxes”."
          />
        ) : (
          <PromptPick view={view} />
        );
      break;
    case 'step':
      body = <StepPhase view={view} />;
      break;
    case 'reveal':
      body = <RevealPhase view={view} />;
      break;
    case 'gameOver':
      body = <Results view={view} />;
      break;
  }

  return (
    <GameShell gameId="telephone" status={status} wide={view.phase === 'step'}>
      {body}
      {isHost && <HostBar view={view} send={send} />}
    </GameShell>
  );
}

function HostBar({ view, send }: { view: TelephoneView; send: (a: TelephoneAction) => void }) {
  const ask = (q: string) => typeof window.confirm !== 'function' || window.confirm(q);
  const n = view.seats.length;
  const waiting = n - view.doneCount;
  let buttons: React.ReactNode = null;

  if (view.phase === 'prompt' && view.promptMode === 'choose') {
    buttons = (
      <button
        className="pg-btn pg-btn-ghost pg-btn-sm"
        onClick={() => send({ type: 'advance', step: 0 })}
        disabled={waiting === 0}
      >
        Stop waiting — deal prompts to {waiting} {waiting === 1 ? 'player' : 'players'}
      </button>
    );
  } else if (view.phase === 'step') {
    buttons = (
      <>
        {!view.local && !view.hurried && (
          <button className="pg-btn pg-btn-ghost pg-btn-sm" onClick={() => send({ type: 'hurry', step: view.stepIndex })}>
            ⏩ Hurry up (10s)
          </button>
        )}
        <button
          className="pg-btn pg-btn-ghost pg-btn-sm"
          onClick={() =>
            ask(`Move on now? ${waiting} unfinished ${waiting === 1 ? 'page' : 'pages'} will be left blank.`) &&
            send({ type: 'advance', step: view.stepIndex })
          }
        >
          Skip to the next step
        </button>
        <button
          className="pg-btn pg-btn-ghost pg-btn-sm"
          onClick={() => ask('Stop passing and reveal the books as they are?') && send({ type: 'finish' })}
        >
          Reveal now
        </button>
      </>
    );
  } else if (view.phase === 'reveal') {
    buttons = (
      <button
        className="pg-btn pg-btn-ghost pg-btn-sm"
        onClick={() => ask('Skip the rest of the reveal and show the results?') && send({ type: 'finish' })}
      >
        Skip to the results
      </button>
    );
  }
  if (!buttons) return null;
  return (
    <div className={styles.hostBar} role="group" aria-label="Host controls">
      <span className="pg-kicker">Host</span>
      {buttons}
    </div>
  );
}
