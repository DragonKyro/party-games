import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { SeatIndex } from '@/engine/types';
import { CollectPanel } from '@/ui/shared/CollectPanel';
import { Countdown } from '@/ui/shared/Countdown';
import { FinalResults } from '@/ui/shared/FinalResults';
import { GameShell } from '@/ui/shared/GameShell';
import { seatColor, usePlay } from '@/ui/shared/hooks';
import { PassScreen } from '@/ui/shared/PassScreen';
import { play, vibrate } from '@/ui/shared/sfx';
import { useWakeLock } from '@/ui/shared/useWakeLock';
import { cleanEntry, entryKey } from '@/words/source';
import type { OddOneOutAction } from '../actions';
import { MAX_CLUE_LENGTH } from '../rules';
import type { Clue, OddOneOutView, Outcome, RoundResult } from '../state';
import styles from './GameView.module.css';

// ============================================================================
// Odd One Out game view
//
// Hidden-info rules for this file:
//  - The secret is only ever rendered from `view.secretIndex`, which the
//    module sets for insiders (and everyone from the reveal). Nothing here
//    derives it any other way.
//  - Single device: the screen shows the seat-null view. A player's role is
//    rendered only after they claim the device on a PassScreen, and the seat
//    goes back to null BEFORE the action that ends their turn is sent, so the
//    next render can't carry their secret.
// ============================================================================

type Send = (a: OddOneOutAction) => void;

export default function OddOneOutGameView() {
  const { view, seat, isHost, localTable, dispatch, setSeat } = usePlay<OddOneOutView>();
  useWakeLock(!!view && view.phase !== 'gameOver' && view.phase !== 'collect');
  const phaseKey = view ? `${view.round}:${view.phase}` : '';

  // Safety net (single device): a new phase always starts on the shared screen.
  const lastKey = useRef(phaseKey);
  useEffect(() => {
    if (lastKey.current === phaseKey) return;
    lastKey.current = phaseKey;
    if (localTable && seat !== null) setSeat(null);
    if (view?.phase === 'vote') play('whoosh');
    if (view?.phase === 'reveal') play('reveal');
  }, [phaseKey, localTable, seat, setSeat, view?.phase]);

  if (!view) return null;
  const send: Send = (a) => dispatch(a);
  const names = view.seats.map((s) => s.name);
  const ctx: Ctx = { view, seat, isHost, localTable, send, setSeat, names };

  const status =
    view.phase === 'collect'
      ? 'Writing the board'
      : view.phase === 'gameOver'
        ? 'Final scores'
        : `Round ${view.round + 1} of ${view.rounds}${view.category ? ` · ${view.category.emoji} ${view.category.name}` : ''}`;

  const timed = (view.phase === 'discuss' || view.phase === 'talk') && view.timer;
  let body: ReactNode;
  switch (view.phase) {
    case 'collect':
      body = view.collect && (
        <CollectPanel
          collect={view.collect}
          names={names}
          title="Write the board"
          placeholder="A thing, place, person…"
          hint="Your words become the board. One will be the secret — so pick ones you could hint at."
        />
      );
      break;
    case 'peek':
      body = localTable ? <PeekLoop key={view.round} c={ctx} /> : <PeekOnline c={ctx} />;
      break;
    case 'clues':
      body = <CluesPhase c={ctx} />;
      break;
    case 'discuss':
    case 'talk':
      body = <TalkPhase c={ctx} />;
      break;
    case 'vote':
      body = <VotePhase key={view.round} c={ctx} />;
      break;
    case 'lastChance':
      body = <LastChance c={ctx} />;
      break;
    case 'reveal':
      body = <Reveal c={ctx} />;
      break;
    case 'gameOver':
      body = <GameOver c={ctx} />;
      break;
  }

  return (
    <GameShell
      gameId="odd-one-out"
      status={status}
      right={
        timed && isHost ? (
          <button
            className="pg-btn pg-btn-sm"
            onClick={() => send({ type: view.timer!.endsAt === null ? 'resume' : 'pause' })}
            aria-label={view.timer!.endsAt === null ? 'Resume' : 'Pause'}
          >
            {view.timer!.endsAt === null ? '▶' : '❚❚'}
          </button>
        ) : null
      }
    >
      {body}
      {isHost && view.phase !== 'gameOver' && view.phase !== 'collect' && view.phase !== 'reveal' && (
        <button
          className={`pg-btn pg-btn-ghost pg-btn-sm ${styles.finish}`}
          onClick={() => {
            if (typeof window.confirm !== 'function' || window.confirm('End the game and show the final scores?')) {
              send({ type: 'finish' });
            }
          }}
        >
          Finish early
        </button>
      )}
    </GameShell>
  );
}

interface Ctx {
  view: OddOneOutView;
  seat: SeatIndex | null;
  isHost: boolean;
  localTable: boolean;
  send: Send;
  setSeat: (s: SeatIndex | null) => void;
  names: string[];
}

// ----------------------------------------------------------------------------
// Building blocks
// ----------------------------------------------------------------------------

function Board({
  words,
  secret = null,
  pick,
  picked = null,
  wrong = null,
  compact = false,
}: {
  words: string[];
  secret?: number | null;
  /** Make tiles tappable. */
  pick?: (i: number) => void;
  picked?: number | null;
  /** Reveal: a missed guess. */
  wrong?: number | null;
  compact?: boolean;
}) {
  return (
    <div
      className={`${styles.board} ${compact ? styles.compact : ''} ${pick ? styles.picking : ''}`}
      style={{ '--cols': words.length > 9 ? 4 : 3 } as CSSProperties}
      role={pick ? 'radiogroup' : 'list'}
      aria-label="The board"
    >
      {words.map((w, i) => {
        const cls = [
          styles.tile,
          i === secret ? styles.secret : '',
          i === picked ? styles.picked : '',
          i === wrong ? styles.wrong : '',
        ].join(' ');
        const style = { '--i': i } as CSSProperties;
        return pick ? (
          <button
            key={i}
            type="button"
            role="radio"
            aria-checked={i === picked}
            className={cls}
            style={style}
            onClick={() => {
              play('pop');
              pick(i);
            }}
          >
            {w}
          </button>
        ) : (
          <div key={i} role="listitem" className={cls} style={style}>
            {w}
            {i === secret && <span className={styles.secretTag}>secret</span>}
          </div>
        );
      })}
    </div>
  );
}

function Name({ seat, names, you }: { seat: SeatIndex; names: string[]; you?: boolean }) {
  return (
    <span className={styles.name} style={{ '--c': seatColor(seat) } as CSSProperties}>
      <span className={styles.dot} />
      {names[seat] ?? '?'}
      {you && <span className={styles.youTag}>you</span>}
    </span>
  );
}

function RoleCard({ view, compact = false }: { view: OddOneOutView; compact?: boolean }) {
  if (!view.you) return null;
  if (view.you.role === 'outsider') {
    return (
      <div className={`${styles.role} ${styles.roleOut} ${compact ? styles.roleCompact : ''}`}>
        <span className={styles.roleIcon} aria-hidden>
          🎭
        </span>
        <div>
          <span className="pg-kicker">Your role</span>
          <h3 className={styles.roleTitle}>You’re the outsider</h3>
          {!compact && (
            <p className={styles.roleText}>
              You don’t know the secret. Blend in, listen hard, and work out which word it is.
              {view.outsiderCount > 1 && ' There’s one other outsider — you don’t know who.'}
            </p>
          )}
        </div>
      </div>
    );
  }
  const word = view.secretIndex !== null ? view.board[view.secretIndex] : null;
  return (
    <div className={`${styles.role} ${styles.roleIn} ${compact ? styles.roleCompact : ''}`}>
      <span className={styles.roleIcon} aria-hidden>
        🤫
      </span>
      <div>
        <span className="pg-kicker">You’re in on it · the secret is</span>
        <h3 className={`${styles.secretWord} pg-hand`}>{word}</h3>
        {!compact && (
          <p className={styles.roleText}>
            Prove you know it without giving it away. {view.outsiderCount > 1 ? 'Two players' : 'One player'} can’t see
            it.
          </p>
        )}
      </div>
    </div>
  );
}

function Roster({
  names,
  done,
  onPick,
  label,
}: {
  names: string[];
  done: boolean[];
  onPick?: (seat: SeatIndex) => void;
  label?: string;
}) {
  return (
    <div className={styles.rosterWrap}>
      {label && <span className="pg-kicker">{label}</span>}
      <ul className={styles.roster}>
        {names.map((n, i) => (
          <li key={i}>
            <button
              type="button"
              className={`${styles.person} ${done[i] ? styles.personDone : ''}`}
              onClick={onPick ? () => onPick(i) : undefined}
              disabled={!onPick || done[i]}
              style={{ '--c': seatColor(i) } as CSSProperties}
            >
              <span className={styles.dot} />
              {n}
              <span className={styles.check}>{done[i] ? '✓' : '…'}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ClueList({ view, names, seat }: { view: OddOneOutView; names: string[]; seat: SeatIndex | null }) {
  if (view.format !== 'clues' || view.clueOrder.length === 0) return null;
  return (
    <ol className={styles.clues} aria-label="Clues">
      {view.clueOrder.map((s, i) => {
        const clue: Clue | undefined = view.clues[i];
        const current = view.phase === 'clues' && i === view.clueTurn;
        return (
          <li
            key={s}
            className={`${styles.clue} ${current ? styles.clueNow : ''} ${clue ? styles.clueDone : ''}`}
            style={{ '--c': seatColor(s), '--i': i } as CSSProperties}
          >
            <span className={styles.clueWho}>
              {names[s]}
              {s === seat && <span className={styles.youTag}>you</span>}
            </span>
            <span className={styles.clueText}>
              {clue ? (
                clue.skipped ? (
                  <em className="pg-faint">skipped</em>
                ) : clue.text !== null ? (
                  <span className="pg-hand">{clue.text}</span>
                ) : (
                  <em className="pg-faint">🗣 said aloud</em>
                )
              ) : current ? (
                <span className={styles.thinking}>thinking…</span>
              ) : (
                <span className="pg-faint">—</span>
              )}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** "I know the word!" — an outsider's early guess. Online: only on an outsider's own screen. */
function EarlyGuess({ c }: { c: Ctx }) {
  const { view, seat, localTable, send, setSeat, names } = c;
  const [step, setStep] = useState<'idle' | 'who' | 'pick'>('idle');
  const [picked, setPicked] = useState<number | null>(null);
  const reset = () => {
    setStep('idle');
    setPicked(null);
    if (localTable) setSeat(null);
  };

  if (!localTable) {
    if (view.you?.role !== 'outsider' || seat === null) return null;
  }

  if (step === 'idle') {
    return (
      <button className={`pg-btn pg-btn-ghost ${styles.knowBtn}`} onClick={() => setStep(localTable ? 'who' : 'pick')}>
        🙋 I know the word!
      </button>
    );
  }

  if (step === 'who') {
    return (
      <section className={`pg-card ${styles.panel}`}>
        <h3 className={styles.panelTitle}>Who thinks they know it?</h3>
        <p className="pg-dim">Only an outsider can guess. Right: outsiders win. Wrong: insiders win.</p>
        <Roster
          names={names}
          done={names.map(() => false)}
          onPick={(s) => {
            setSeat(s);
            setStep('pick');
          }}
        />
        <button className="pg-btn pg-btn-ghost pg-btn-sm" onClick={reset}>
          Cancel
        </button>
      </section>
    );
  }

  // step === 'pick'. On a single device the claimed seat's view is on screen now.
  if (view.you?.role !== 'outsider' || seat === null) {
    return (
      <section className={`pg-card ${styles.panel}`}>
        <h3 className={styles.panelTitle}>You’re not an outsider</h3>
        <p className="pg-dim">Only an outsider can guess the word. Nice try!</p>
        <button className="pg-btn pg-btn-primary" onClick={reset}>
          Back
        </button>
      </section>
    );
  }
  const guesser = seat;
  return (
    <section className={`pg-card ${styles.panel} ${styles.guessPanel}`}>
      <span className="pg-kicker">{localTable ? names[guesser] : 'All or nothing'}</span>
      <h3 className={styles.panelTitle}>Which word is the secret?</h3>
      <p className="pg-dim">Right: the outsiders win now. Wrong: the insiders win.</p>
      <Board words={view.board} pick={setPicked} picked={picked} compact />
      <div className={styles.row}>
        <button className="pg-btn pg-btn-ghost" onClick={reset}>
          Cancel
        </button>
        <button
          className="pg-btn pg-btn-primary pg-btn-lg"
          disabled={picked === null}
          onClick={() => {
            if (picked === null) return;
            if (localTable) setSeat(null);
            vibrate(60);
            send({ type: 'guess', bySeat: guesser, round: view.round, word: picked });
          }}
        >
          {picked === null ? 'Pick a word' : `It’s “${view.board[picked]}”!`}
        </button>
      </div>
    </section>
  );
}

// ----------------------------------------------------------------------------
// Peek
// ----------------------------------------------------------------------------

function PeekOnline({ c }: { c: Ctx }) {
  const { view, seat, isHost, send, names } = c;
  const left = view.peeked.filter((p) => !p).length;
  const mine = seat !== null && view.peeked[seat];
  return (
    <section className={styles.stack}>
      {seat !== null ? <RoleCard view={view} /> : <p className={styles.lead}>Everyone’s checking their role…</p>}
      <CategoryBadge view={view} />
      <Board words={view.board} secret={view.secretIndex} />
      {seat !== null &&
        (mine ? (
          <p className="pg-dim">
            Waiting for {left} more player{left === 1 ? '' : 's'}…
          </p>
        ) : (
          <button
            className="pg-btn pg-btn-primary pg-btn-xl"
            onClick={() => {
              play('pop');
              send({ type: 'peeked', bySeat: seat, round: view.round });
            }}
          >
            Got it 👍
          </button>
        ))}
      <Roster names={names} done={view.peeked} label="Seen their role" />
      {isHost && left > 0 && (
        <button className="pg-btn pg-btn-ghost pg-btn-sm" onClick={() => send({ type: 'startPlay', round: view.round })}>
          Start without waiting
        </button>
      )}
    </section>
  );
}

function PeekLoop({ c }: { c: Ctx }) {
  const { view, seat, send, setSeat, names } = c;
  const [claimed, setClaimed] = useState<SeatIndex | null>(null);
  const [chosen, setChosen] = useState<SeatIndex | null>(null);
  const next = view.peeked.findIndex((p) => !p);

  if (claimed !== null && seat === claimed && !view.peeked[claimed]) {
    return (
      <section className={styles.stack}>
        <span className="pg-kicker">{names[claimed]}, this is just for you</span>
        <RoleCard view={view} />
        <Board words={view.board} secret={view.secretIndex} />
        <button
          className="pg-btn pg-btn-primary pg-btn-xl"
          onClick={() => {
            setClaimed(null);
            setChosen(null);
            setSeat(null);
            play('pop');
            send({ type: 'peeked', bySeat: claimed, round: view.round });
          }}
          autoFocus
        >
          Got it — hide it
        </button>
      </section>
    );
  }

  const target = chosen !== null && !view.peeked[chosen] ? chosen : next;
  if (target < 0) return null;
  const done = view.peeked.filter(Boolean).length;
  return (
    <PassScreen
      to={names[target] ?? '?'}
      icon="🤫"
      message={
        done === 0
          ? `New board! Everyone peeks at their role in private — ${names[target]} first.`
          : 'Peek at your role in private. Everyone else, look away!'
      }
      onReady={() => {
        setSeat(target);
        setClaimed(target);
      }}
    >
      <Roster names={names} done={view.peeked} onPick={setChosen} label={`${done} of ${names.length} have looked`} />
    </PassScreen>
  );
}

function CategoryBadge({ view }: { view: OddOneOutView }) {
  if (!view.category) return null;
  return (
    <div className={styles.category}>
      <span aria-hidden>{view.category.emoji}</span>
      <span>{view.category.name}</span>
      <small>{view.board.length} words</small>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Clues
// ----------------------------------------------------------------------------

function CluesPhase({ c }: { c: Ctx }) {
  const { view, seat, isHost, localTable, send, names } = c;
  const giver = view.clueGiver!;
  const mine = !localTable && seat === giver;
  const count = view.clues.length;
  const prev = useRef(count);
  useEffect(() => {
    if (count > prev.current) play('ding');
    prev.current = count;
  }, [count]);
  const nextUp = view.clueOrder[view.clueTurn + 1];

  return (
    <section className={styles.stack}>
      {!localTable && <RoleCard view={view} compact />}
      <div className={styles.turnCard} style={{ '--c': seatColor(giver) } as CSSProperties}>
        {mine ? (
          <ClueForm view={view} onSend={(text) => send({ type: 'clue', bySeat: giver, round: view.round, turn: view.clueTurn, text })} />
        ) : localTable ? (
          <>
            <span className="pg-kicker">
              Clue {view.clueTurn + 1} of {view.clueOrder.length}
            </span>
            <h2 className={styles.turnTitle}>{names[giver]}, say ONE word out loud</h2>
            <p className="pg-dim">Linked to the secret — but not so obvious the outsider catches on.</p>
            <button
              className="pg-btn pg-btn-primary pg-btn-xl"
              onClick={() => send({ type: 'clue', bySeat: giver, round: view.round, turn: view.clueTurn, text: null })}
            >
              Said it → {nextUp !== undefined ? names[nextUp] : 'discuss'}
            </button>
          </>
        ) : (
          <>
            <span className="pg-kicker">
              Clue {view.clueTurn + 1} of {view.clueOrder.length}
            </span>
            <h2 className={styles.turnTitle}>
              {names[giver]} is thinking of a clue<span className={styles.dots}>…</span>
            </h2>
            {nextUp === seat && <p className="pg-dim">You’re next — get one ready.</p>}
          </>
        )}
      </div>
      <ClueList view={view} names={names} seat={seat} />
      {/* Single device: the shared board never shows a secret, even while someone holds the device to guess. */}
      <Board words={view.board} secret={localTable ? null : view.secretIndex} compact />
      <EarlyGuess key={`${view.round}`} c={c} />
      {isHost && (
        <div className={styles.hostRow}>
          <button
            className="pg-btn pg-btn-ghost pg-btn-sm"
            onClick={() => send({ type: 'skipClue', round: view.round, turn: view.clueTurn })}
          >
            Skip {names[giver]}
          </button>
          <button className="pg-btn pg-btn-ghost pg-btn-sm" onClick={() => send({ type: 'callVote', round: view.round })}>
            Call the vote now
          </button>
        </div>
      )}
    </section>
  );
}

function clueProblem(view: OddOneOutView, raw: string): string | null {
  const text = cleanEntry(raw);
  if (!text) return 'Type a clue.';
  if (/\s/.test(text)) return 'One word only!';
  if (text.length > MAX_CLUE_LENGTH) return `Keep it under ${MAX_CLUE_LENGTH} letters.`;
  const key = entryKey(text);
  if (!key) return 'Type a real word.';
  if (view.board.some((w) => entryKey(w) === key)) return 'That word is on the board — pick another.';
  if (view.clues.some((c) => c.text !== null && entryKey(c.text) === key)) return 'Someone already said that.';
  return null;
}

function ClueForm({ view, onSend }: { view: OddOneOutView; onSend: (text: string) => void }) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const outsider = view.you?.role === 'outsider';
  // If the host refused it (it raced something), let them try again.
  useEffect(() => {
    if (!sent) return;
    const t = setTimeout(() => setSent(false), 4000);
    return () => clearTimeout(t);
  }, [sent]);
  return (
    <form
      className={styles.clueForm}
      onSubmit={(e) => {
        e.preventDefault();
        if (sent) return;
        const problem = clueProblem(view, text);
        if (problem) {
          setError(problem);
          play('error');
          return;
        }
        setSent(true);
        play('pop');
        onSend(cleanEntry(text));
      }}
    >
      <span className="pg-kicker">Your turn</span>
      <h2 className={styles.turnTitle}>Give ONE word</h2>
      <p className="pg-dim">
        {outsider ? 'Bluff! Pick something that could fit — the others have given you hints.' : 'Hint at the secret without giving it away.'}
      </p>
      <div className={styles.clueInputRow}>
        <input
          className={`pg-input ${styles.clueInput}`}
          value={text}
          onChange={(e) => {
            setText(e.target.value.replace(/\s/g, ''));
            setError(null);
          }}
          maxLength={MAX_CLUE_LENGTH}
          placeholder="One word"
          autoFocus
          autoComplete="off"
          autoCapitalize="off"
          enterKeyHint="send"
          aria-label="Your clue"
        />
        <button className="pg-btn pg-btn-primary pg-btn-lg" type="submit" disabled={sent}>
          Send
        </button>
      </div>
      {error && <p className={styles.error}>{error}</p>}
    </form>
  );
}

// ----------------------------------------------------------------------------
// Discussion / free talk
// ----------------------------------------------------------------------------

function TalkPhase({ c }: { c: Ctx }) {
  const { view, seat, isHost, localTable, send, names } = c;
  const talk = view.phase === 'talk';
  return (
    <section className={styles.stack}>
      {!localTable && <RoleCard view={view} compact />}
      <div className={styles.talkHead}>
        {view.timer ? <Countdown timer={view.timer} size={talk ? 'xl' : 'lg'} beep warnSeconds={10} /> : null}
        <div className={styles.talkText}>
          {talk ? (
            <>
              <h2 className={styles.turnTitle}>Question time</h2>
              <p>
                {view.firstAsker !== null && (
                  <>
                    <b>{names[view.firstAsker]}</b> asks first.{' '}
                  </>
                )}
                Ask anyone a question about the secret. Whoever answers asks next.
              </p>
            </>
          ) : (
            <>
              <h2 className={styles.turnTitle}>Who’s the outsider?</h2>
              <p>Talk it over. Whose clue didn’t quite fit?</p>
            </>
          )}
        </div>
      </div>
      <ClueList view={view} names={names} seat={seat} />
      {/* Single device: the shared board never shows a secret, even while someone holds the device to guess. */}
      <Board words={view.board} secret={localTable ? null : view.secretIndex} compact />
      <EarlyGuess key={`${view.round}`} c={c} />
      {isHost && (
        <button className="pg-btn pg-btn-primary pg-btn-lg" onClick={() => send({ type: 'callVote', round: view.round })}>
          {view.timer ? 'Skip the timer — vote now' : 'Vote now'}
        </button>
      )}
    </section>
  );
}

// ----------------------------------------------------------------------------
// Vote
// ----------------------------------------------------------------------------

function VotePhase({ c }: { c: Ctx }) {
  const { view, seat, isHost, localTable, send, names } = c;
  const votedCount = view.voted.filter(Boolean).length;
  const closeBtn = isHost && votedCount > 0 && votedCount < names.length && (
    <button className="pg-btn pg-btn-ghost pg-btn-sm" onClick={() => send({ type: 'closeVote', round: view.round })}>
      Close the vote — count {votedCount} ballot{votedCount === 1 ? '' : 's'}
    </button>
  );

  if (localTable) {
    return view.voting === 'open' ? <OpenVote c={c} /> : <VoteLoop c={c} closeBtn={closeBtn} />;
  }

  return (
    <section className={styles.stack}>
      {seat !== null ? (
        <Ballot
          names={names}
          me={seat}
          current={view.yourVote}
          onVote={(target) => send({ type: 'vote', bySeat: seat, round: view.round, target })}
        />
      ) : (
        <h2 className={styles.lead}>Voting…</h2>
      )}
      <Roster names={names} done={view.voted} label={`${votedCount} of ${names.length} voted`} />
      {closeBtn}
      <ClueList view={view} names={names} seat={seat} />
    </section>
  );
}

function Ballot({
  names,
  me,
  current,
  onVote,
  who,
}: {
  names: string[];
  me: SeatIndex;
  current: SeatIndex | null;
  onVote: (target: SeatIndex) => void;
  who?: string;
}) {
  return (
    <div className={styles.ballot}>
      {who && <span className="pg-kicker">{who}’s secret ballot</span>}
      <h2 className={styles.turnTitle}>Who’s the outsider?</h2>
      <p className="pg-dim">{current === null ? 'Tap a name. Nobody sees your vote until the reveal.' : 'Vote in — you can change it until everyone’s voted.'}</p>
      <div className={styles.voteGrid}>
        {names.map((n, i) =>
          i === me ? null : (
            <button
              key={i}
              type="button"
              className={`${styles.voteBtn} ${current === i ? styles.voteOn : ''}`}
              style={{ '--c': seatColor(i) } as CSSProperties}
              aria-pressed={current === i}
              onClick={() => {
                play('pop');
                vibrate(30);
                onVote(i);
              }}
            >
              <span className={styles.voteAvatar}>{n.slice(0, 1).toUpperCase()}</span>
              <span className={styles.voteName}>{n}</span>
              {current === i && <span className={styles.voteMark}>✓</span>}
            </button>
          ),
        )}
      </div>
    </div>
  );
}

function VoteLoop({ c, closeBtn }: { c: Ctx; closeBtn: ReactNode }) {
  const { view, seat, send, setSeat, names } = c;
  const [claimed, setClaimed] = useState<SeatIndex | null>(null);
  const [chosen, setChosen] = useState<SeatIndex | null>(null);
  const next = view.voted.findIndex((v) => !v);

  if (claimed !== null && seat === claimed && !view.voted[claimed]) {
    return (
      <section className={styles.stack}>
        <Ballot
          names={names}
          me={claimed}
          current={null}
          who={names[claimed]}
          onVote={(target) => {
            setClaimed(null);
            setChosen(null);
            setSeat(null);
            send({ type: 'vote', bySeat: claimed, round: view.round, target });
          }}
        />
      </section>
    );
  }
  const target = chosen !== null && !view.voted[chosen] ? chosen : next;
  if (target < 0) return null;
  const done = view.voted.filter(Boolean).length;
  return (
    <PassScreen
      to={names[target] ?? '?'}
      icon="🗳️"
      message="Secret ballot: vote for who you think is the outsider."
      action={`I'm ${names[target]} — vote`}
      onReady={() => {
        setSeat(target);
        setClaimed(target);
      }}
    >
      <Roster names={names} done={view.voted} onPick={setChosen} label={`${done} of ${names.length} voted`} />
      {closeBtn}
    </PassScreen>
  );
}

function OpenVote({ c }: { c: Ctx }) {
  const { view, send, names } = c;
  const [picked, setPicked] = useState<SeatIndex | null | undefined>(undefined);
  return (
    <section className={styles.stack}>
      <div className={styles.turnCard}>
        <span className="pg-kicker">Open vote</span>
        <h2 className={styles.turnTitle}>3… 2… 1… point!</h2>
        <p className="pg-dim">Everyone points at who they think is the outsider. Tap whoever got the most fingers.</p>
      </div>
      <div className={styles.voteGrid}>
        {names.map((n, i) => (
          <button
            key={i}
            type="button"
            className={`${styles.voteBtn} ${picked === i ? styles.voteOn : ''}`}
            style={{ '--c': seatColor(i) } as CSSProperties}
            aria-pressed={picked === i}
            onClick={() => setPicked(i)}
          >
            <span className={styles.voteAvatar}>{n.slice(0, 1).toUpperCase()}</span>
            <span className={styles.voteName}>{n}</span>
          </button>
        ))}
      </div>
      <div className={styles.row}>
        <button className={`pg-btn pg-btn-ghost ${picked === null ? styles.tieOn : ''}`} onClick={() => setPicked(null)}>
          It’s a tie
        </button>
        <button
          className="pg-btn pg-btn-primary pg-btn-lg"
          disabled={picked === undefined}
          onClick={() => picked !== undefined && send({ type: 'accuse', round: view.round, seat: picked })}
        >
          {picked === undefined ? 'Who got the most?' : picked === null ? 'Nobody’s caught' : `Accuse ${names[picked]}`}
        </button>
      </div>
    </section>
  );
}

function Tally({ view, names }: { view: OddOneOutView; names: string[] }) {
  if (!view.tally || view.openVote) return null;
  const max = Math.max(1, ...view.tally);
  const order = view.tally
    .map((n, i) => ({ n, i }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n);
  return (
    <ul className={styles.tally}>
      {order.map(({ n, i }) => (
        <li key={i} style={{ '--c': seatColor(i), '--w': `${(n / max) * 100}%` } as CSSProperties}>
          <span className={styles.tallyName}>{names[i]}</span>
          <span className={styles.tallyBar}>
            <span />
          </span>
          <span className={styles.tallyNum}>{n}</span>
        </li>
      ))}
    </ul>
  );
}

// ----------------------------------------------------------------------------
// Last chance
// ----------------------------------------------------------------------------

function LastChance({ c }: { c: Ctx }) {
  const { view, seat, isHost, localTable, send, names } = c;
  const accused = view.accused!;
  const mine = localTable || seat === accused;
  const [picked, setPicked] = useState<number | null>(null);
  useEffect(() => {
    play('buzzer');
    vibrate([120, 60, 120]);
  }, []);
  return (
    <section className={styles.stack}>
      <div className={styles.caught}>
        <span className={styles.caughtIcon} aria-hidden>
          🎭
        </span>
        <p className={styles.caughtLine}>
          {view.openVote ? 'The table accused' : 'Most votes:'} <Name seat={accused} names={names} you={seat === accused && !localTable} />
        </p>
        <h2 className={styles.caughtTitle}>{seat === accused && !localTable ? 'You’re caught!' : `${names[accused]} IS an outsider!`}</h2>
        <p className="pg-dim">One last chance: name the secret word to steal the win.</p>
      </div>
      <Tally view={view} names={names} />
      {mine ? (
        <>
          <h3 className={styles.panelTitle}>{localTable ? `${names[accused]}, which word is it?` : 'Which word is it?'}</h3>
          <Board words={view.board} pick={setPicked} picked={picked} />
          <div className={styles.row}>
            <button
              className="pg-btn pg-btn-ghost"
              onClick={() => send({ type: 'giveUp', bySeat: accused, round: view.round })}
            >
              No idea — give up
            </button>
            <button
              className="pg-btn pg-btn-primary pg-btn-lg"
              disabled={picked === null}
              onClick={() => picked !== null && send({ type: 'guess', bySeat: accused, round: view.round, word: picked })}
            >
              {picked === null ? 'Pick a word' : `It’s “${view.board[picked]}”!`}
            </button>
          </div>
        </>
      ) : (
        <>
          <p className={styles.lead}>
            {names[accused]} is choosing<span className={styles.dots}>…</span>
          </p>
          <Board words={view.board} secret={view.secretIndex} compact />
          {isHost && (
            <button className="pg-btn pg-btn-ghost pg-btn-sm" onClick={() => send({ type: 'giveUp', round: view.round })}>
              {names[accused]} gives up
            </button>
          )}
        </>
      )}
    </section>
  );
}

// ----------------------------------------------------------------------------
// Reveal
// ----------------------------------------------------------------------------

const OUTCOME_LINE: Record<Outcome, (r: RoundResult, n: string[]) => string> = {
  tie: () => 'The vote tied — nobody was caught.',
  innocent: (r, n) => `The vote landed on ${n[r.accused!]}, an insider.`,
  caught: (r, n) => (r.guess?.word === null ? `${n[r.accused!]} was caught and gave up.` : `${n[r.accused!]} was caught and missed the word.`),
  stolen: (r, n) => `${n[r.accused!]} was caught — but named the word and stole the win!`,
  'early-right': (r, n) => `${n[r.guess!.seat]} called it early — and got it right!`,
  'early-wrong': (r, n) => `${n[r.guess!.seat]} gambled on an early guess — and missed.`,
};

function Reveal({ c }: { c: Ctx }) {
  const { view, seat, isHost, localTable, send, names } = c;
  const r = view.result!;
  const me = localTable ? null : seat;
  const outsidersWin = r.winner === 'outsiders';
  const iWon = me !== null && r.outsiders.includes(me) === outsidersWin;
  const last = view.round + 1 >= view.rounds;
  const votersFor = (target: SeatIndex) => r.votes.map((v, i) => (v === target ? i : -1)).filter((i) => i >= 0);
  const targets = [...new Set(r.votes.filter((v): v is number => v !== null))].sort((a, b) => r.tally[b]! - r.tally[a]!);
  const standings = names.map((_, i) => i).sort((a, b) => view.scores[b]! - view.scores[a]! || a - b);

  return (
    <section className={styles.stack}>
      <div className={`${styles.banner} ${outsidersWin ? styles.bannerOut : styles.bannerIn}`}>
        <span className="pg-kicker">Round {view.round + 1}</span>
        <h2 className={styles.bannerTitle}>{outsidersWin ? (r.outsiders.length > 1 ? 'Outsiders win!' : 'The outsider wins!') : 'Insiders win!'}</h2>
        <p className={styles.bannerLine}>{OUTCOME_LINE[r.outcome](r, names)}</p>
        {me !== null && <p className={styles.bannerYou}>{iWon ? 'You win this round 🎉' : 'Not your round'}</p>}
      </div>

      <div className={styles.revealPair}>
        <div className={styles.revealBox}>
          <span className="pg-kicker">The secret</span>
          <span className={`${styles.revealWord} pg-hand`}>{r.secret}</span>
        </div>
        <div className={styles.revealBox}>
          <span className="pg-kicker">{r.outsiders.length > 1 ? 'The outsiders' : 'The outsider'}</span>
          <span className={styles.revealWho}>
            {r.outsiders.map((o) => (
              <Name key={o} seat={o} names={names} you={o === me} />
            ))}
          </span>
        </div>
      </div>

      {r.guess && (
        <p className={styles.guessLine}>
          {r.guess.word === null ? (
            <>{names[r.guess.seat]} didn’t guess.</>
          ) : (
            <>
              {names[r.guess.seat]} guessed <b className="pg-hand">“{r.board[r.guess.word]}”</b> —{' '}
              {r.guess.correct ? <b className={styles.good}>right! +1</b> : <b className={styles.bad}>wrong.</b>}
            </>
          )}
        </p>
      )}

      {!r.guess?.early && (
        <div className={styles.votes}>
          <span className="pg-kicker">{r.openVote ? 'Open vote' : 'The votes'}</span>
          {r.openVote ? (
            <p>{r.accused === null ? 'The table couldn’t agree.' : <>The table accused <Name seat={r.accused} names={names} />.</>}</p>
          ) : targets.length === 0 ? (
            <p className="pg-dim">No votes.</p>
          ) : (
            <ul className={styles.voteRows}>
              {targets.map((t) => (
                <li key={t} className={r.outsiders.includes(t) ? styles.voteRowOut : ''}>
                  <span className={styles.voteRowHead}>
                    <Name seat={t} names={names} />
                    <b>{r.tally[t]}</b>
                    {r.outsiders.includes(t) && <span aria-label="outsider">🎭</span>}
                  </span>
                  <span className={styles.voters}>
                    {votersFor(t).map((v) => (
                      <span key={v} className={styles.voter} style={{ '--c': seatColor(v) } as CSSProperties}>
                        {names[v]}
                      </span>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <Board
        words={r.board}
        secret={r.secretIndex}
        wrong={r.guess && !r.guess.correct && r.guess.word !== null ? r.guess.word : null}
        compact
      />

      <div className={styles.standings}>
        <span className="pg-kicker">Leaderboard</span>
        <ol className={`${styles.standingList} pg-stagger`}>
          {standings.map((s, i) => (
            <li key={s} style={{ '--i': i } as CSSProperties} className={s === me ? styles.meRow : ''}>
              <Name seat={s} names={names} you={s === me} />
              {r.points[s]! > 0 && <span className={styles.plus}>+{r.points[s]}</span>}
              <span className={styles.total}>{view.scores[s]}</span>
            </li>
          ))}
        </ol>
      </div>

      {isHost ? (
        <button className="pg-btn pg-btn-primary pg-btn-xl" onClick={() => send({ type: 'nextRound', round: view.round })} autoFocus>
          {last ? 'Final scores →' : `Round ${view.round + 2} →`}
        </button>
      ) : (
        <p className="pg-dim">Waiting for the host…</p>
      )}
    </section>
  );
}

// ----------------------------------------------------------------------------
// Game over
// ----------------------------------------------------------------------------

function GameOver({ c }: { c: Ctx }) {
  const { view, seat, localTable, names } = c;
  const me = localTable ? null : seat;
  const best = Math.max(0, ...view.scores);
  const winners = view.scores.map((s, i) => (s === best ? i : -1)).filter((i) => i >= 0);
  const headline = view.history.length === 0 ? 'Game over' : winners.length > 1 ? 'It’s a tie!' : `${names[winners[0]!]} wins!`;
  const rows = names.map((name, i) => {
    const times = view.history.filter((h) => h.outsiders.includes(i)).length;
    const won = view.history.filter((h) => h.outsiders.includes(i) && h.winner === 'outsiders').length;
    return {
      name,
      score: view.scores[i] ?? 0,
      color: seatColor(i),
      detail: times > 0 ? `Outsider ${times}× · got away ${won}` : 'Never the outsider',
      you: i === me,
    };
  });
  return (
    <FinalResults headline={headline} rows={rows}>
      {view.history.length > 0 && (
        <ol className={styles.history}>
          {view.history.map((h) => (
            <li key={h.round}>
              <span className={styles.histRound}>R{h.round + 1}</span>
              <span className={styles.histMain}>
                <span>
                  {h.category.emoji} <b className="pg-hand">{h.secret}</b>
                </span>
                <small className="pg-dim">
                  {h.outsiders.map((o) => names[o]).join(' & ')} · {h.winner === 'outsiders' ? 'outsider' : 'insiders'} won
                </small>
              </span>
            </li>
          ))}
        </ol>
      )}
    </FinalResults>
  );
}
