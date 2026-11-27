import { useEffect, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react';
import { CollectPanel } from '@/ui/shared/CollectPanel';
import { Countdown } from '@/ui/shared/Countdown';
import { FinalResults } from '@/ui/shared/FinalResults';
import { GameShell } from '@/ui/shared/GameShell';
import { seatColor, usePlay } from '@/ui/shared/hooks';
import { PassScreen } from '@/ui/shared/PassScreen';
import { play, vibrate } from '@/ui/shared/sfx';
import { useWakeLock } from '@/ui/shared/useWakeLock';
import type { RankItAction } from '../actions';
import { EXACT_POINTS, MAX_CRITERION_LENGTH, NEAR_POINTS, PERFECT_BONUS } from '../rules';
import type { RankItView, VoidReason } from '../state';
import styles from './GameView.module.css';

// ============================================================================
// Rank It game view
//
// Hidden-info rules for this file:
//  - The criteria on offer exist only in the chooser's own view
//    (`yourOptions`); orders exist only as the viewer's own `yourOrder` until
//    the reveal. Nothing here renders anyone else's order before `reveal`.
//  - Single device: the chooser, then each ranker / guesser, claims the phone
//    through a PassScreen (rendered INSTEAD of the secret screen). A claim is
//    per round and per seat; when it's released the screen goes back to the
//    seat-null view.
// ============================================================================

type Send = (a: RankItAction) => void;

const range = (n: number) => Array.from({ length: n }, (_, i) => i);

export default function RankItGameView() {
  const { view, seat, isHost, localTable, dispatch, setSeat } = usePlay<RankItView>();
  // Single device: who the phone was handed to, `${round}:${seat}`.
  const [claim, setClaim] = useState<string | null>(null);
  // Single device: a roster pick waiting for its pass screen.
  const [passTo, setPassTo] = useState<string | null>(null);
  // Online: re-editing an order already locked in.
  const [editing, setEditing] = useState<string | null>(null);

  const phase = view?.phase;
  const round = view?.round ?? -1;
  const holder = localTable && seat !== null && claim === `${round}:${seat}` ? seat : null;
  useWakeLock(phase === 'choose' || phase === 'rank');

  // Single device: nobody holds the phone → show the table (seat-null) view.
  // (The collect phase runs its own pass loop.)
  useEffect(() => {
    if (!localTable || seat === null || phase === undefined || phase === 'collect') return;
    if (holder === null) setSeat(null);
  }, [localTable, seat, phase, holder, setSeat]);

  if (!view) return null;
  const send: Send = (a) => dispatch(a);
  const names = view.seats.map((s) => s.name);
  const key = (s: number) => `${view.round}:${s}`;
  const claimSeat = (s: number) => {
    setSeat(s);
    setClaim(key(s));
    setPassTo(null);
  };
  const release = () => {
    setClaim(null);
    setSeat(null);
  };

  let body: ReactNode = null;
  switch (view.phase) {
    case 'collect':
      body = view.collect && (
        <CollectPanel
          key={view.collectStage ?? 'collect'}
          collect={view.collect}
          names={names}
          {...(view.collectStage === 'criteria'
            ? {
                title: 'Write criteria',
                placeholder: 'useful in a zombie apocalypse',
                hint: 'Finish the sentence “Most … least”: likely to survive the washing machine, fun at a funeral…',
              }
            : {
                title: 'Write things to rank',
                placeholder: 'A person, thing, place, feeling…',
                hint: (
                  <>
                    Anything goes: your car, Beyoncé, Mondays, Grandma’s lasagna. Mix big and small!
                    {view.criteriaNext && ' Next up: criteria.'}
                  </>
                ),
              })}
        />
      );
      break;

    case 'choose': {
      const chooser = view.chooser!;
      const mine = localTable ? holder === chooser : seat === chooser;
      if (mine && view.yourOptions) {
        body = <ChooseScreen key={key(chooser)} view={view} seat={chooser} send={send} />;
      } else if (localTable) {
        body = (
          <PassScreen
            to={names[chooser] ?? '?'}
            icon="🎯"
            message={
              view.mode === 'ranker'
                ? 'You’re the Ranker: pick a criterion, then rank the items in secret. Everyone else, look away!'
                : 'You pick this round’s criterion.'
            }
            onReady={() => claimSeat(chooser)}
          >
            <button className="pg-btn pg-btn-ghost pg-btn-sm" onClick={() => send({ type: 'skipRound', round: view.round })}>
              Skip {names[chooser]}’s turn
            </button>
          </PassScreen>
        );
      } else {
        body = <WaitChoose view={view} isHost={isHost} send={send} />;
      }
      break;
    }

    case 'rank':
      if (localTable) {
        const pending = passTo?.startsWith(`${view.round}:`) ? Number(passTo.split(':')[1]) : null;
        if (holder !== null) {
          body = <RankEditor key={key(holder)} view={view} seat={holder} send={send} onDone={release} onCancel={release} />;
        } else if (pending !== null) {
          const isRanker = view.ranker === pending;
          body = (
            <PassScreen
              to={names[pending] ?? '?'}
              icon={isRanker ? '🎯' : '🔮'}
              message={
                view.ranker === null
                  ? 'Rank the items your way, in secret.'
                  : isRanker
                    ? 'Rank the items in secret — everyone else, look away!'
                    : `Guess how ${names[view.ranker]} ranked them. No peeking at anyone else’s!`
              }
              onReady={() => claimSeat(pending)}
            >
              <button className="pg-btn pg-btn-ghost pg-btn-sm" onClick={() => setPassTo(null)}>
                Back
              </button>
            </PassScreen>
          );
        } else {
          body = <LocalRoster view={view} onPick={(s) => setPassTo(key(s))} send={send} />;
        }
      } else {
        const player = seat !== null && seat >= 0 && seat < view.seats.length ? seat : null;
        if (player !== null && (!view.submitted[player] || editing === key(player))) {
          body = (
            <RankEditor
              key={key(player)}
              view={view}
              seat={player}
              send={send}
              onDone={() => setEditing(null)}
              onCancel={view.submitted[player] ? () => setEditing(null) : undefined}
            />
          );
        } else {
          body = (
            <RankWait
              view={view}
              seat={player}
              isHost={isHost}
              send={send}
              onEdit={player !== null ? () => setEditing(key(player)) : undefined}
            />
          );
        }
      }
      break;

    case 'reveal':
      body = <Reveal key={view.round} view={view} me={localTable ? null : seat} isHost={isHost} send={send} />;
      break;

    case 'gameOver':
      body = <Results view={view} me={localTable ? null : seat} />;
      break;
  }

  const status =
    view.phase === 'collect'
      ? view.collectStage === 'criteria'
        ? 'Writing criteria'
        : 'Writing things to rank'
      : view.phase === 'gameOver'
        ? 'Final scores'
        : `Round ${view.round + 1} of ${view.totalRounds}${view.ranker !== null ? ` · ${names[view.ranker]} ranks` : ''}`;

  const paused = !!view.timer && view.timer.endsAt === null;
  return (
    <GameShell
      gameId="rank-it"
      status={status}
      right={
        view.phase === 'rank' && view.timer ? (
          <>
            <Countdown timer={view.timer} size="sm" beep />
            {isHost && (
              <button
                className="pg-btn pg-btn-sm"
                onClick={() => send({ type: paused ? 'resume' : 'pause' })}
                aria-label={paused ? 'Resume' : 'Pause'}
              >
                {paused ? '▶' : '❚❚'}
              </button>
            )}
          </>
        ) : null
      }
    >
      {(view.phase === 'choose' || view.phase === 'rank' || view.phase === 'reveal') && (
        <Standings view={view} me={localTable ? holder : seat} />
      )}
      {view.lastVoid && <VoidNotice reason={view.lastVoid.reason} round={view.lastVoid.round} ranker={view.lastVoid.ranker} names={names} />}
      {body}
    </GameShell>
  );
}

// ----------------------------------------------------------------------------
// Small pieces
// ----------------------------------------------------------------------------

function CriterionBanner({ criterion }: { criterion: string }) {
  return (
    <div className={styles.criterion}>
      <span className={styles.mostLeast}>
        Most <span aria-hidden>→</span>
        <span className="pg-sr-only">to</span> least:
      </span>
      <span className={styles.critText}>{criterion}</span>
    </div>
  );
}

function ItemsPreview({ items }: { items: string[] }) {
  return (
    <ul className={`${styles.preview} pg-stagger`}>
      {items.map((t, i) => (
        <li key={i} className={styles.previewCard} style={{ '--i': i, '--r': `${((i * 37) % 7) - 3}deg` } as CSSProperties}>
          {t}
        </li>
      ))}
    </ul>
  );
}

function Standings({ view, me }: { view: RankItView; me: number | null }) {
  return (
    <div className={styles.standings} aria-label="Scores">
      {view.seats.map((s, i) => (
        <span
          key={i}
          className={`${styles.stand} ${view.ranker === i ? styles.standRanker : ''} ${me === i ? styles.standMe : ''}`}
          style={{ '--c': seatColor(i) } as CSSProperties}
          title={view.ranker === i ? `${s.name} is the Ranker` : s.name}
        >
          <span className={styles.dot} />
          {view.ranker === i && <span aria-hidden>🎯</span>}
          <span className={styles.standName}>{s.name}</span>
          <b>{view.scores[i]}</b>
          {view.phase === 'rank' && (
            <span className={view.submitted[i] ? styles.lockedIn : styles.notIn} aria-label={view.submitted[i] ? 'locked in' : 'still ranking'}>
              {view.submitted[i] ? '✓' : '…'}
            </span>
          )}
        </span>
      ))}
    </div>
  );
}

const VOID_TEXT: Record<VoidReason, (who: string) => string> = {
  noRanker: (who) => `${who} didn’t lock in an order, so it scored nothing.`,
  tooFew: () => 'Fewer than two people ranked, so it scored nothing.',
  skipped: () => 'The host skipped it.',
};

function VoidNotice({ reason, round, ranker, names }: { reason: VoidReason; round: number; ranker: number | null; names: string[] }) {
  return (
    <p className={styles.voidNote} role="status">
      ⏭️ Round {round + 1} was void — {VOID_TEXT[reason](ranker !== null ? (names[ranker] ?? 'The Ranker') : 'Someone')}
    </p>
  );
}

function HostRankControls({ view, send }: { view: RankItView; send: Send }) {
  const names = view.seats.map((s) => s.name);
  const done = view.submitted.filter(Boolean).length;
  const rankerMissing = view.ranker !== null && !view.submitted[view.ranker];
  const tooFew = view.ranker === null && done < 2;
  return (
    <div className={styles.hostRow}>
      <button
        className="pg-btn pg-btn-sm"
        onClick={() => send({ type: 'reveal', round: view.round })}
        disabled={rankerMissing || tooFew}
        title={rankerMissing ? `${names[view.ranker!]} hasn’t ranked yet` : undefined}
      >
        Stop waiting — reveal ({done}/{view.seats.length})
      </button>
      <button className="pg-btn pg-btn-sm pg-btn-ghost" onClick={() => send({ type: 'skipRound', round: view.round })}>
        Skip round
      </button>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Choose
// ----------------------------------------------------------------------------

function ChooseScreen({ view, seat, send }: { view: RankItView; seat: number; send: Send }) {
  const [writing, setWriting] = useState(false);
  const [own, setOwn] = useState('');
  const [sent, setSent] = useState(false);
  const options = view.yourOptions ?? [];

  const pick = (option: number) => {
    if (sent) return;
    setSent(true);
    play('whoosh');
    send({ type: 'choose', bySeat: seat, round: view.round, option });
  };
  const submitOwn = (e: FormEvent) => {
    e.preventDefault();
    const text = own.replace(/\s+/g, ' ').trim();
    if (!text || sent) return;
    setSent(true);
    play('whoosh');
    send({ type: 'writeOwn', bySeat: seat, round: view.round, text });
  };

  return (
    <section className={styles.choose}>
      <span className="pg-kicker">{view.mode === 'ranker' ? 'You’re the Ranker' : 'You pick this round'}</span>
      <h2 className={styles.title}>Pick what to rank by</h2>
      <ItemsPreview items={view.items} />
      <div className={styles.options}>
        {options.map((c, i) => (
          <button
            key={i}
            type="button"
            className={styles.optionCard}
            onClick={() => pick(i)}
            disabled={sent}
            style={{ '--i': i } as CSSProperties}
          >
            <span className={styles.mostLeast}>Most → least:</span>
            <span className={styles.optionText}>{c}</span>
          </button>
        ))}
      </div>
      {writing ? (
        <form className={styles.ownForm} onSubmit={submitOwn}>
          <label className="pg-kicker" htmlFor="rank-own">
            Most → least:
          </label>
          <input
            id="rank-own"
            className="pg-input"
            value={own}
            onChange={(e) => setOwn(e.target.value)}
            maxLength={MAX_CRITERION_LENGTH}
            placeholder="likely to survive the washing machine"
            autoComplete="off"
            autoFocus
          />
          <div className={styles.row}>
            <button type="button" className="pg-btn pg-btn-ghost" onClick={() => setWriting(false)}>
              Back
            </button>
            <button type="submit" className="pg-btn pg-btn-primary" disabled={!own.trim() || sent}>
              Use mine
            </button>
          </div>
        </form>
      ) : (
        <button type="button" className="pg-btn pg-btn-ghost" onClick={() => setWriting(true)}>
          ✎ Write my own
        </button>
      )}
      {view.mode === 'ranker' && (
        <p className={styles.tip}>
          Next you rank them in secret. You score the average of everyone’s guesses — so pick one you can be readable about.
        </p>
      )}
    </section>
  );
}

function WaitChoose({ view, isHost, send }: { view: RankItView; isHost: boolean; send: Send }) {
  const names = view.seats.map((s) => s.name);
  const chooser = view.chooser!;
  return (
    <section className={styles.wait}>
      <span className="pg-kicker">
        Round {view.round + 1} of {view.totalRounds}
      </span>
      <h2 className={styles.title} style={{ '--c': seatColor(chooser) } as CSSProperties}>
        <span className={styles.who}>{names[chooser]}</span> is picking a criterion…
      </h2>
      <p className="pg-dim">This round’s items:</p>
      <ItemsPreview items={view.items} />
      {view.mode === 'ranker' && <p className={styles.tip}>Then they rank them in secret, and you guess their order.</p>}
      {isHost && (
        <button className="pg-btn pg-btn-ghost pg-btn-sm" onClick={() => send({ type: 'skipRound', round: view.round })}>
          Skip {names[chooser]}’s turn
        </button>
      )}
    </section>
  );
}

// ----------------------------------------------------------------------------
// Rank
// ----------------------------------------------------------------------------

function RankEditor({
  view,
  seat,
  send,
  onDone,
  onCancel,
}: {
  view: RankItView;
  seat: number;
  send: Send;
  onDone: () => void;
  onCancel?: () => void;
}) {
  const items = view.items;
  const k = items.length;
  const [order, setOrder] = useState<number[]>(() => view.yourOrder?.slice() ?? []);
  const names = view.seats.map((s) => s.name);
  const role = view.ranker === null ? 'crowd' : view.ranker === seat ? 'ranker' : 'guess';

  const toggle = (item: number) => {
    play('pop');
    setOrder((o) => (o.includes(item) ? o.filter((x) => x !== item) : [...o, item]));
  };
  const nudge = (pos: number, d: -1 | 1) =>
    setOrder((o) => {
      const to = pos + d;
      if (to < 0 || to >= o.length) return o;
      const next = o.slice();
      [next[pos], next[to]] = [next[to]!, next[pos]!];
      return next;
    });
  const lockIn = () => {
    if (order.length !== k) return;
    play('ding');
    vibrate(30);
    send({ type: 'submit', bySeat: seat, round: view.round, order });
    onDone();
  };

  return (
    <section className={styles.editor}>
      <CriterionBanner criterion={view.criterion ?? ''} />
      <p className={styles.role}>
        {role === 'ranker' && (
          <>
            🎯 <b>{names[seat]}</b>, this is <b>your</b> secret order.
          </>
        )}
        {role === 'guess' && (
          <>
            🔮 <b>{names[seat]}</b>: how did <b style={{ color: seatColor(view.ranker!) }}>{names[view.ranker!]}</b> rank them?
          </>
        )}
        {role === 'crowd' && (
          <>
            👥 <b>{names[seat]}</b>: rank them your way — points for matching the room.
          </>
        )}
      </p>
      <ol className={styles.ladder}>
        {range(k).map((pos) => {
          const item = order[pos];
          const filled = item !== undefined;
          return (
            <li key={pos} className={`${styles.rung} ${filled ? styles.filled : ''} ${pos === order.length ? styles.nextRung : ''}`}>
              <span className={styles.rankNum}>
                {pos + 1}
                {pos === 0 && <small>most</small>}
                {pos === k - 1 && <small>least</small>}
              </span>
              {filled ? (
                <>
                  <button type="button" key={item} className={styles.placed} onClick={() => toggle(item)} aria-label={`Take back ${items[item]}`}>
                    <span className={styles.itemText}>{items[item]}</span>
                    <span className={styles.unrank} aria-hidden>
                      ✕
                    </span>
                  </button>
                  <span className={styles.nudges}>
                    <button type="button" onClick={() => nudge(pos, -1)} disabled={pos === 0} aria-label={`Move ${items[item]} up`}>
                      ▲
                    </button>
                    <button
                      type="button"
                      onClick={() => nudge(pos, 1)}
                      disabled={pos === order.length - 1}
                      aria-label={`Move ${items[item]} down`}
                    >
                      ▼
                    </button>
                  </span>
                </>
              ) : (
                <span className={styles.emptySlot}>{pos === order.length ? 'tap an item' : ''}</span>
              )}
            </li>
          );
        })}
      </ol>
      <div className={styles.tray} aria-label="Items to rank">
        {items.map((t, i) =>
          order.includes(i) ? null : (
            <button key={i} type="button" className={styles.card} onClick={() => toggle(i)} style={{ '--r': `${((i * 53) % 5) - 2}deg` } as CSSProperties}>
              {t}
            </button>
          ),
        )}
        {order.length === k && <p className="pg-faint">All ranked. Tap one to take it back, or nudge with ▲▼.</p>}
      </div>
      <button className={`pg-btn pg-btn-primary pg-btn-xl ${order.length === k ? styles.ready : ''}`} onClick={lockIn} disabled={order.length !== k}>
        Lock it in 🔒
      </button>
      {onCancel && (
        <button type="button" className="pg-btn pg-btn-ghost pg-btn-sm" onClick={onCancel}>
          {view.yourOrder ? 'Keep my last order' : 'Back'}
        </button>
      )}
    </section>
  );
}

function RankWait({
  view,
  seat,
  isHost,
  send,
  onEdit,
}: {
  view: RankItView;
  seat: number | null;
  isHost: boolean;
  send: Send;
  onEdit?: () => void;
}) {
  const names = view.seats.map((s) => s.name);
  const waitingOn = view.seats.filter((_, i) => !view.submitted[i]).map((s) => s.name);
  return (
    <section className={styles.wait}>
      <CriterionBanner criterion={view.criterion ?? ''} />
      <ItemsPreview items={view.items} />
      {seat !== null ? (
        <>
          <h2 className={styles.title}>🔒 Locked in!</h2>
          {onEdit && (
            <button className="pg-btn pg-btn-ghost pg-btn-sm" onClick={onEdit}>
              ✎ Change my order
            </button>
          )}
        </>
      ) : (
        <h2 className={styles.title}>
          {view.ranker !== null ? `Everyone’s guessing ${names[view.ranker]}’s order…` : 'Everyone is ranking…'}
        </h2>
      )}
      {waitingOn.length > 0 && <p className="pg-dim">Waiting for {waitingOn.join(', ')}.</p>}
      {isHost && <HostRankControls view={view} send={send} />}
    </section>
  );
}

function LocalRoster({ view, onPick, send }: { view: RankItView; onPick: (seat: number) => void; send: Send }) {
  const order = view.ranker !== null ? [view.ranker, ...range(view.seats.length).filter((i) => i !== view.ranker)] : range(view.seats.length);
  return (
    <section className={styles.wait}>
      <CriterionBanner criterion={view.criterion ?? ''} />
      <ItemsPreview items={view.items} />
      <p className="pg-dim">
        {view.ranker !== null
          ? 'Ranker first, then everyone guesses. Tap your name and pass the phone along.'
          : 'Tap your name, rank in secret, pass the phone along.'}
      </p>
      <ul className={styles.roster}>
        {order.map((i) => (
          <li key={i}>
            <button
              type="button"
              className={`${styles.person} ${view.submitted[i] ? styles.personDone : ''}`}
              onClick={() => onPick(i)}
              disabled={view.submitted[i]}
              style={{ '--c': seatColor(i) } as CSSProperties}
            >
              <span className={styles.dot} />
              {view.ranker === i && <span aria-hidden>🎯</span>}
              {view.seats[i]!.name}
              <span className={styles.check}>{view.submitted[i] ? '✓' : '…'}</span>
            </button>
          </li>
        ))}
      </ul>
      <HostRankControls view={view} send={send} />
    </section>
  );
}

// ----------------------------------------------------------------------------
// Reveal
// ----------------------------------------------------------------------------

/** Seconds between rows as the answer counts down from LEAST up to MOST. */
const STEP = 0.55;

function Reveal({ view, me, isHost, send }: { view: RankItView; me: number | null; isHost: boolean; send: Send }) {
  const r = view.reveal!;
  const names = view.seats.map((s) => s.name);
  const k = r.items.length;
  const players = range(view.seats.length).filter((s) => r.entries[s]);
  const mine = me !== null ? r.entries[me] : null;
  const last = view.round + 1 >= view.totalRounds;

  // Once per reveal (the component is keyed by round).
  const perfect = !!mine?.result.perfect;
  useEffect(() => {
    play('reveal');
    if (perfect) vibrate([60, 40, 120]);
  }, [perfect]);

  const pointsAt = `${k * STEP + 0.2}s`;
  const ranked = players
    .map((s) => ({ s, ...r.entries[s]! }))
    .sort((a, b) => b.result.points - a.result.points || a.s - b.s);
  const meanTied = (item: number) =>
    !!r.means && r.items.some((_, j) => j !== item && r.means![j] === r.means![item]);

  return (
    <section className={styles.reveal}>
      <CriterionBanner criterion={r.criterion} />
      <span className="pg-kicker">
        {r.ranker !== null ? `${names[r.ranker]}’s order` : 'The room’s order'}
      </span>
      <ol className={styles.truth}>
        {r.truth.map((item, pos) => (
          <li key={pos} className={styles.truthRow} style={{ '--d': `${(k - 1 - pos) * STEP}s` } as CSSProperties}>
            <span className={styles.rankNum}>{pos + 1}</span>
            <div className={styles.truthBody}>
              <span className={styles.itemText}>{r.items[item]}</span>
              {r.means && (
                <span className={styles.mean}>
                  avg {r.means[item]!.toFixed(1)}
                  {meanTied(item) && ' · tie (dealt first wins)'}
                </span>
              )}
              <span className={styles.badges}>
                {players.map((s) => {
                  const order = r.entries[s]!.order;
                  if (!order) return null;
                  const g = order.indexOf(item);
                  const d = Math.abs(g - pos);
                  return (
                    <span
                      key={s}
                      className={`${styles.badge} ${d === 0 ? styles.exact : d === 1 ? styles.near : styles.miss}`}
                      style={{ '--c': seatColor(s) } as CSSProperties}
                      title={`${names[s]} put it #${g + 1}`}
                    >
                      <b>{initials(names[s] ?? '?')}</b>
                      <small>{g + 1}</small>
                    </span>
                  );
                })}
              </span>
            </div>
          </li>
        ))}
      </ol>
      <p className={styles.legend} style={{ '--d': pointsAt } as CSSProperties}>
        <span className={`${styles.badge} ${styles.exact}`}>✓</span> exact +{EXACT_POINTS}
        <span className={`${styles.badge} ${styles.near}`}>±1</span> one off +{NEAR_POINTS}
        <span>perfect order +{PERFECT_BONUS}</span>
      </p>

      <ul className={styles.points} style={{ '--d': pointsAt } as CSSProperties}>
        {r.ranker !== null && r.rankerPoints !== null && (
          <li className={styles.pointRow} style={{ '--c': seatColor(r.ranker) } as CSSProperties}>
            <span className={styles.dot} />
            <span className={styles.pointWho}>
              🎯 {names[r.ranker]}
              <small>Ranker · the average of the guesses</small>
            </span>
            <b>+{r.rankerPoints}</b>
          </li>
        )}
        {ranked.map(({ s, result }) => (
          <li
            key={s}
            className={`${styles.pointRow} ${result.perfect ? styles.perfect : ''} ${s === me ? styles.pointMe : ''}`}
            style={{ '--c': seatColor(s) } as CSSProperties}
          >
            <span className={styles.dot} />
            <span className={styles.pointWho}>
              {names[s]}
              <small>
                {!result.submitted
                  ? 'didn’t lock in'
                  : result.perfect
                    ? `Perfect! ${view.mode === 'ranker' ? 'Mind reader' : 'Hive mind'} +${PERFECT_BONUS}`
                    : `${result.exact} exact · ${result.near} one off`}
              </small>
            </span>
            <b>+{result.points}</b>
          </li>
        ))}
      </ul>

      <Leaderboard view={view} me={me} delay={pointsAt} />

      {isHost ? (
        <button className="pg-btn pg-btn-primary pg-btn-xl" onClick={() => send({ type: 'next', round: view.round })}>
          {last ? 'Final scores →' : 'Next round →'}
        </button>
      ) : (
        <p className="pg-dim">Waiting for the host…</p>
      )}
    </section>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
  return (parts[0] ?? '?').slice(0, 2);
}

function Leaderboard({ view, me, delay }: { view: RankItView; me: number | null; delay: string }) {
  const r = view.reveal;
  const rows = view.seats
    .map((s, i) => ({ i, name: s.name, score: view.scores[i] ?? 0, delta: r?.points[i] ?? 0 }))
    .sort((a, b) => b.score - a.score || a.i - b.i);
  const top = Math.max(1, ...rows.map((x) => x.score));
  return (
    <div className={styles.board} style={{ '--d': delay } as CSSProperties}>
      <span className="pg-kicker">Standings</span>
      <ol>
        {rows.map((x) => (
          <li key={x.i} className={x.i === me ? styles.pointMe : ''} style={{ '--c': seatColor(x.i) } as CSSProperties}>
            <span className={styles.boardName}>{x.name}</span>
            <span className={styles.boardBar}>
              <span style={{ width: `${(x.score / top) * 100}%` }} />
            </span>
            <b>{x.score}</b>
            <small className={styles.delta}>{x.delta > 0 ? `+${x.delta}` : ''}</small>
          </li>
        ))}
      </ol>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Results
// ----------------------------------------------------------------------------

function Results({ view, me }: { view: RankItView; me: number | null }) {
  const r = view.results!;
  const names = view.seats.map((s) => s.name);
  const best = Math.max(...view.scores);
  const winners = view.seats.filter((_, i) => view.scores[i] === best);
  const headline = winners.length === 1 ? `${winners[0]!.name} wins!` : 'It’s a tie!';
  const rows = view.seats.map((s, i) => ({
    name: s.name,
    score: view.scores[i] ?? 0,
    color: seatColor(i),
    detail:
      view.mode === 'ranker'
        ? `${r.guessPoints[i]} guessing · ${r.rankerPoints[i]} as Ranker`
        : `${r.perfects[i]} perfect match${r.perfects[i] === 1 ? '' : 'es'}`,
    you: me === i,
  }));
  const who = (seats: number[]) => seats.map((s) => names[s]).join(' & ');
  const items = r.written.filter((w) => w.kind === 'items');
  const criteria = r.written.filter((w) => w.kind === 'criteria');

  return (
    <FinalResults headline={headline} rows={rows} unit="pts">
      {r.awards.length > 0 && (
        <ul className={styles.awards}>
          {r.awards.map((a) => (
            <li key={a.title}>
              <span className={styles.awardEmoji} aria-hidden>
                {a.emoji}
              </span>
              <span>
                <b>{a.title}</b>: {who(a.seats)}
                <small>{a.detail}</small>
              </span>
            </li>
          ))}
        </ul>
      )}
      {r.rounds.length > 0 && (
        <details className={styles.recap}>
          <summary>Every round ({r.rounds.length})</summary>
          <ol>
            {r.rounds.map((x) => (
              <li key={x.round}>
                <b>{x.criterion ? `Most → least: ${x.criterion}` : `Round ${x.round + 1}`}</b>
                {x.ranker !== null && <small> — {names[x.ranker]} ranked</small>}
                <div className={styles.recapItems}>
                  {x.ranked ? x.ranked.map((t, i) => <span key={i}>{i + 1}. {t}</span>) : <span className="pg-faint">void</span>}
                </div>
              </li>
            ))}
          </ol>
        </details>
      )}
      {(items.length > 0 || criteria.length > 0) && (
        <details className={styles.recap}>
          <summary>Written by the table ({items.length + criteria.length})</summary>
          <div className={styles.recapItems}>
            {[...items, ...criteria].map((w, i) => (
              <span key={i} title={`Written by ${w.author}`}>
                {w.kind === 'criteria' ? `Most → least: ${w.text}` : w.text}
                <small> — {w.author}</small>
              </span>
            ))}
          </div>
        </details>
      )}
    </FinalResults>
  );
}
