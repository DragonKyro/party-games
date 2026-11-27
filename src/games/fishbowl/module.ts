import { cloneRng, makeRng, rngInt, rngShuffle, subSeed, type RngState } from '@/engine/rng';
import { dealTeams, isTeamsAction, teamTurn, teamsProblem, teamsReduce } from '@/engine/teams';
import { isExpired, pauseTimer, resumeTimer, startTimer, timeLeft } from '@/engine/timer';
import { assertHostOnly, assertSeat } from '@/engine/guards';
import type { ActionContext, GameConfig, GameModule, SeatIndex } from '@/engine/types';
import {
  collectComplete,
  collectReduce,
  collectView,
  collectedEntries,
  isCollectAction,
  startCollect,
} from '@/words/collect';
import { buildPool, entryKey } from '@/words/source';
import type { FishbowlAction } from './actions';
import { MIN_SLIPS, optionsProblem, readOptions, skipsLeft, DEFAULT_OPTIONS } from './rules';
import type { FishbowlState, FishbowlView, Slip, TurnRecord } from './state';

// ============================================================================
// Fishbowl — module
// ============================================================================

/** A "got it" a moment after the buzzer still counts (network lag). */
const GRACE_MS = 1500;
/** Less than this left when the bowl empties isn't worth carrying over. */
const MIN_CARRY_MS = 3000;


/** Whose turn it is (team + clue-giver) at `turnNo`. */
export function upNext(state: FishbowlState): { team: number; seat: SeatIndex } {
  return teamTurn(state.teams, state.turnNo, state.firstTeam);
}

/** Collected slips first (all of them), then the top-up pool, up to the bowl size. */
function makeSlips(
  collected: Array<{ text: string; author: SeatIndex | null }>,
  topUp: Array<{ text: string; author: SeatIndex | null }>,
  bowlSize: number,
): Slip[] {
  const seen = new Set<string>();
  const out: Slip[] = [];
  const add = (text: string, author: SeatIndex | null) => {
    const key = entryKey(text);
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push({ id: out.length, text, author });
  };
  for (const c of collected) add(c.text, c.author);
  for (const t of topUp) {
    if (out.length >= bowlSize) break;
    add(t.text, t.author);
  }
  return out;
}

function freshBowl(slips: Slip[], rng: RngState): number[] {
  return rngShuffle(
    rng,
    slips.map((s) => s.id),
  );
}

/** Put `slip` back somewhere in the bowl other than the top (when there's room). */
function reinsert(bowl: number[], slip: number, rng: RngState): number[] {
  const out = bowl.slice();
  const at = out.length === 0 ? 0 : 1 + rngInt(rng, out.length);
  out.splice(at, 0, slip);
  return out;
}

function emptyScores(rounds: number, teams: number): number[][] {
  return Array.from({ length: rounds }, () => new Array<number>(teams).fill(0));
}

function startTeams(state: FishbowlState, slips: Slip[]): FishbowlState {
  if (slips.length < 3) throw new Error('Not enough slips to play — add some words.');
  return { ...state, phase: 'teams', collect: null, slips, bowl: [] };
}

function turnRecord(state: FishbowlState): TurnRecord {
  const { team, seat } = upNext(state);
  return { seat, team, round: state.roundIndex, got: state.turnGot.slice(), skipped: state.turnSkips };
}

function endTurn(state: FishbowlState): FishbowlState {
  return {
    ...state,
    phase: 'ready',
    history: [...state.history, turnRecord(state)],
    turnNo: state.turnNo + 1,
    timer: null,
    current: null,
    turnGot: [],
    turnSkips: 0,
  };
}

/** The bowl is empty: next round (with carried-over time) or the end. */
function endRound(state: FishbowlState, now: number): FishbowlState {
  const record = turnRecord(state);
  const left = state.timer ? timeLeft(state.timer, now) : 0;
  const base: FishbowlState = {
    ...state,
    history: [...state.history, record],
    timer: null,
    current: null,
    turnGot: [],
    turnSkips: 0,
  };
  if (state.roundIndex + 1 >= state.options.rounds.length) return { ...base, phase: 'gameOver', bowl: [] };
  const rng = cloneRng(state.rng);
  const carry = state.options.carryOver && left >= MIN_CARRY_MS;
  return {
    ...base,
    phase: 'intro',
    rng,
    roundIndex: state.roundIndex + 1,
    bowl: freshBowl(state.slips, rng),
    // With carry-over the same clue-giver goes first next round with what's left.
    turnNo: carry ? state.turnNo : state.turnNo + 1,
    carryMs: carry ? left : null,
  };
}

function assertClueGiver(state: FishbowlState, bySeat: unknown, slip: unknown): void {
  if (state.phase !== 'turn' || !state.timer) throw new Error('No turn in progress');
  assertSeat(bySeat, state.seats.length);
  if (bySeat !== upNext(state).seat) throw new Error('Only the clue-giver can do that');
  if (typeof slip !== 'number') throw new Error('Which slip?');
}

function applyFishbowl(state: FishbowlState, action: FishbowlAction, ctx: ActionContext): FishbowlState {
  const n = state.seats.length;

  if (isCollectAction(action)) {
    if (state.phase !== 'collect' || !state.collect) throw new Error('Not collecting words');
    if (action.type === 'collect.close') {
      assertHostOnly(action);
      return startTeams(state, makeSlips(collectedEntries(state.collect), state.topUp, state.options.bowlSize));
    }
    const collect = collectReduce(state.collect, action, n);
    const next = { ...state, collect };
    if (!collectComplete(collect, n)) return next;
    return startTeams(next, makeSlips(collectedEntries(collect), state.topUp, state.options.bowlSize));
  }

  if (isTeamsAction(action)) {
    if (state.phase !== 'teams') throw new Error('Teams are already set');
    const rng = cloneRng(state.rng);
    return { ...state, rng, teams: teamsReduce(state.teams, action, rng) };
  }

  switch (action.type) {
    case 'begin': {
      assertHostOnly(action);
      if (state.phase !== 'teams') throw new Error('Not picking teams');
      const problem = teamsProblem(state.teams, 2);
      if (problem) throw new Error(problem);
      const rng = cloneRng(state.rng);
      return {
        ...state,
        rng,
        phase: 'intro',
        roundIndex: 0,
        turnNo: 0,
        firstTeam: rngInt(rng, state.teams.count),
        bowl: freshBowl(state.slips, rng),
        scores: emptyScores(state.options.rounds.length, state.teams.count),
      };
    }

    case 'playRound':
      assertHostOnly(action);
      if (state.phase !== 'intro') throw new Error('No round to start');
      return { ...state, phase: 'ready' };

    case 'startTurn': {
      if (state.phase !== 'ready') throw new Error('Not ready for a turn');
      if (action.bySeat !== undefined && action.bySeat !== upNext(state).seat) {
        throw new Error('It is not your turn');
      }
      if (state.bowl.length === 0) throw new Error('The bowl is empty');
      const ms = state.carryMs ?? state.options.turnSeconds * 1000;
      return {
        ...state,
        phase: 'turn',
        timer: startTimer(ms, ctx.now),
        carryMs: null,
        current: state.bowl[0]!,
        turnGot: [],
        turnSkips: 0,
      };
    }

    case 'gotIt': {
      assertClueGiver(state, action.bySeat, action.slip);
      if (action.slip !== state.current) throw new Error('That slip is no longer in hand');
      if (isExpired(state.timer!, ctx.now - GRACE_MS)) throw new Error("Time's up");
      const { team } = upNext(state);
      const scores = state.scores.map((r) => r.slice());
      scores[state.roundIndex]![team]! += 1;
      const bowl = state.bowl.filter((id) => id !== action.slip);
      const next: FishbowlState = { ...state, scores, bowl, turnGot: [...state.turnGot, action.slip] };
      if (bowl.length === 0) return endRound(next, ctx.now);
      return { ...next, current: bowl[0]! };
    }

    case 'skip': {
      assertClueGiver(state, action.bySeat, action.slip);
      if (action.slip !== state.current) throw new Error('That slip is no longer in hand');
      if (skipsLeft(state.options.skipRule, state.turnSkips) === 0) throw new Error('No skips left this turn');
      if (state.bowl.length <= 1) throw new Error("It's the last slip — no skipping!");
      const rng = cloneRng(state.rng);
      const bowl = reinsert(state.bowl.slice(1), action.slip, rng);
      return { ...state, rng, bowl, current: bowl[0]!, turnSkips: state.turnSkips + 1 };
    }

    case 'undo': {
      assertClueGiver(state, action.bySeat, action.slip);
      if (state.turnGot[state.turnGot.length - 1] !== action.slip) throw new Error('Only the last slip can be undone');
      const { team } = upNext(state);
      const scores = state.scores.map((r) => r.slice());
      scores[state.roundIndex]![team]! -= 1;
      const rng = cloneRng(state.rng);
      // Keep the slip in hand on top; the undone one goes back in the bowl.
      const rest = reinsert(state.bowl.slice(1), action.slip, rng);
      const bowl = [state.bowl[0]!, ...rest];
      return { ...state, rng, scores, bowl, turnGot: state.turnGot.slice(0, -1) };
    }

    case 'timeUp': {
      assertHostOnly(action);
      if (state.phase !== 'turn' || action.turn !== state.turnNo) throw new Error('Stale timer');
      if (!state.timer || !isExpired(state.timer, ctx.now)) throw new Error('Time is not up yet');
      return endTurn(state);
    }

    case 'pause':
      assertHostOnly(action);
      if (state.phase !== 'turn' || !state.timer) throw new Error('Nothing to pause');
      return { ...state, timer: pauseTimer(state.timer, ctx.now) };

    case 'resume':
      assertHostOnly(action);
      if (state.phase !== 'turn' || !state.timer) throw new Error('Nothing to resume');
      return { ...state, timer: resumeTimer(state.timer, ctx.now) };

    case 'skipPlayer':
      assertHostOnly(action);
      if (state.phase !== 'ready') throw new Error('Only between turns');
      return { ...state, turnNo: state.turnNo + 1, carryMs: null };

    case 'finish':
      assertHostOnly(action);
      if (state.phase === 'gameOver') throw new Error('Already over');
      return { ...state, phase: 'gameOver', timer: null, current: null };

    default:
      throw new Error(`Unknown action ${(action as { type?: unknown }).type as string}`);
  }
}

// ============================================================================
// View — the redaction chokepoint
// ============================================================================

export function fishbowlViewFor(state: FishbowlState, seat: SeatIndex | null): FishbowlView {
  const me = seat !== null && seat >= 0 && seat < state.seats.length ? seat : null;
  const playing = state.phase === 'ready' || state.phase === 'turn';
  const up = playing ? upNext(state) : null;
  const isGiver = state.phase === 'turn' && me !== null && up?.seat === me;
  const slipText = (id: number) => state.slips[id]?.text ?? '';
  const last = state.history[state.history.length - 1];
  const over = state.phase === 'gameOver';

  let results: FishbowlView['results'] = null;
  if (over) {
    const perSeat = new Array<number>(state.seats.length).fill(0);
    for (const t of state.history) perSeat[t.seat]! += t.got.length;
    let best: { seat: SeatIndex; got: number } | null = null;
    perSeat.forEach((got, s) => {
      if (got > 0 && (!best || got > best.got)) best = { seat: s, got };
    });
    results = {
      slips: state.slips.map((s) => ({
        text: s.text,
        author: s.author === null ? null : (state.seats[s.author]?.name ?? null),
      })),
      bestClueGiver: best,
      perSeat,
    };
  }

  return {
    phase: state.phase,
    seats: state.seats.map((s) => ({ ...s })),
    teams: { count: state.teams.count, of: state.teams.of.slice() },
    collect: state.phase === 'collect' && state.collect ? collectView(state.collect, me, state.seats.length) : null,
    rounds: state.options.rounds.slice(),
    roundIndex: state.roundIndex,
    turnNo: state.turnNo,
    bowlCount: state.phase === 'collect' || state.phase === 'teams' ? state.slips.length : state.bowl.length,
    totalSlips: state.slips.length,
    turnSeconds: state.options.turnSeconds,
    skipRule: state.options.skipRule,
    clueGiver: up?.seat ?? null,
    clueTeam: up?.team ?? null,
    upcomingMs: state.phase === 'ready' ? (state.carryMs ?? state.options.turnSeconds * 1000) : 0,
    carried: state.phase === 'ready' && state.carryMs !== null,
    timer: state.phase === 'turn' && state.timer ? { ...state.timer } : null,
    turnGotCount: state.phase === 'turn' ? state.turnGot.length : 0,
    skipsLeft: state.phase === 'turn' ? skipsLeft(state.options.skipRule, state.turnSkips) : null,
    yourSlip: isGiver && state.current !== null ? { id: state.current, text: slipText(state.current) } : null,
    yourTurnGot: isGiver ? state.turnGot.map((id) => ({ id, text: slipText(id) })) : [],
    lastTurn: last
      ? { seat: last.seat, team: last.team, got: last.got.map(slipText), skipped: last.skipped }
      : null,
    totals: Array.from({ length: state.teams.count }, (_, t) => state.scores.reduce((sum, r) => sum + (r[t] ?? 0), 0)),
    scores: state.scores.map((r) => r.slice()),
    results,
  };
}

// ============================================================================
// Module
// ============================================================================

export const fishbowlModule: GameModule<FishbowlState, FishbowlView, FishbowlAction> = {
  id: 'fishbowl',
  displayName: 'Fishbowl',
  minPlayers: 4,
  maxPlayers: 20,

  createInitialState(config: GameConfig): FishbowlState {
    const options = readOptions(config.gameOptions);
    const seats = config.seats.map((s, i) => ({ index: i, name: s.name }));
    const n = seats.length;
    if (n < this.minPlayers || n > this.maxPlayers) {
      throw new Error(`Fishbowl needs ${this.minPlayers}–${this.maxPlayers} players.`);
    }
    const problem = optionsProblem(config.gameOptions, n);
    if (problem) throw new Error(problem);
    const rng = makeRng(subSeed(config.seed, 0xf15b));
    const teams = dealTeams(n, options.teamCount, rng);
    const pool = buildPool({ source: { ...options.words, perPlayer: 0 }, lists: config.lists });
    const topUp = rngShuffle(rng, pool)
      .slice(0, options.bowlSize + 60)
      .map((p) => ({ text: p.text, author: null }));

    const base: FishbowlState = {
      phase: 'teams',
      options,
      seats,
      rng,
      collect: null,
      topUp,
      teams,
      firstTeam: 0,
      slips: [],
      bowl: [],
      roundIndex: 0,
      turnNo: 0,
      carryMs: null,
      timer: null,
      current: null,
      turnGot: [],
      turnSkips: 0,
      scores: emptyScores(options.rounds.length, teams.count),
      history: [],
    };

    if (options.words.perPlayer > 0) {
      const k = options.words.perPlayer;
      return {
        ...base,
        phase: 'collect',
        collect: startCollect('words', k, `Write ${k} names, things or phrases for the bowl.`),
      };
    }
    const slips = makeSlips([], topUp, options.bowlSize);
    if (slips.length < MIN_SLIPS) {
      throw new Error(`Only ${slips.length} words available — pick more packs or let players write some.`);
    }
    return { ...base, slips };
  },

  applyAction: applyFishbowl,
  viewFor: fishbowlViewFor,

  isFinished: (state) => state.phase === 'gameOver',

  defaultOptions: () => structuredClone(DEFAULT_OPTIONS) as unknown as Record<string, unknown>,

  optionsProblem,

  nextScheduled(state) {
    if (state.phase !== 'turn' || !state.timer || state.timer.endsAt === null) return null;
    return { at: state.timer.endsAt, action: { type: 'timeUp', turn: state.turnNo } };
  },
};
