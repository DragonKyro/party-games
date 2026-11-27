// Team assignment shared by the team games (Fishbowl, Forehead's team mode,
// Tune In's team dial). A `Teams` value is public: everybody may see who is
// on which team. Games embed it in a "teams" phase where players can switch
// sides and the host can shuffle before the first turn.

import { rngShuffle, type RngState } from './rng';
import type { SeatIndex } from './types';

export interface Teams {
  count: number;
  /** of[seat] = team index (0-based). */
  of: number[];
}

export const MIN_TEAMS = 2;
export const MAX_TEAMS = 4;

/** Random, balanced split: team sizes differ by at most one. Mutates `rng`. */
export function dealTeams(seatCount: number, teamCount: number, rng: RngState): Teams {
  const count = clampTeams(teamCount);
  const order = rngShuffle(
    rng,
    Array.from({ length: seatCount }, (_, i) => i),
  );
  const of = new Array<number>(seatCount).fill(0);
  order.forEach((seat, i) => {
    of[seat] = i % count;
  });
  return { count, of };
}

export function clampTeams(n: number): number {
  return Math.max(MIN_TEAMS, Math.min(MAX_TEAMS, Math.round(Number(n) || MIN_TEAMS)));
}

export function membersOf(teams: Teams, team: number): SeatIndex[] {
  const out: SeatIndex[] = [];
  teams.of.forEach((t, seat) => {
    if (t === team) out.push(seat);
  });
  return out;
}

/** Move one seat. Throws on a bad seat or team. */
export function moveToTeam(teams: Teams, seat: SeatIndex, team: number): Teams {
  if (!Number.isInteger(seat) || seat < 0 || seat >= teams.of.length) throw new Error(`Unknown seat ${seat}`);
  if (!Number.isInteger(team) || team < 0 || team >= teams.count) throw new Error(`Unknown team ${team}`);
  if (teams.of[seat] === team) return teams;
  const of = teams.of.slice();
  of[seat] = team;
  return { ...teams, of };
}

/** Why this split can't be played (a team with fewer than `minPerTeam`), or null. */
export function teamsProblem(teams: Teams, minPerTeam = 2): string | null {
  for (let t = 0; t < teams.count; t++) {
    const n = membersOf(teams, t).length;
    if (n < minPerTeam) {
      return `Every team needs at least ${minPerTeam} player${minPerTeam === 1 ? '' : 's'}.`;
    }
  }
  return null;
}

/**
 * Turn order for team games: teams alternate (0, 1, 2, …) and each team
 * cycles through its own members. `turnNo` counts every turn played so far
 * (0-based). Returns the team and the seat whose turn it is.
 */
export function teamTurn(teams: Teams, turnNo: number, firstTeam = 0): { team: number; seat: SeatIndex } {
  const team = (firstTeam + turnNo) % teams.count;
  const members = membersOf(teams, team);
  if (members.length === 0) throw new Error(`Team ${team} is empty`);
  const round = Math.floor(turnNo / teams.count);
  return { team, seat: members[round % members.length]! };
}

// ---------------------------------------------------------------------------
// The "pick teams" phase, shared by team games
// ---------------------------------------------------------------------------

export type TeamsAction =
  /** A player switches themselves. */
  | { type: 'teams.join'; bySeat: SeatIndex; team: number }
  /** Host: move anyone. */
  | { type: 'teams.move'; seat: SeatIndex; team: number }
  /** Host: deal fresh random teams. */
  | { type: 'teams.shuffle' };

export function isTeamsAction(a: unknown): a is TeamsAction {
  const t = (a as { type?: unknown } | null)?.type;
  return t === 'teams.join' || t === 'teams.move' || t === 'teams.shuffle';
}

/** Apply a teams action. `rng` is mutated on shuffle (pass a clone you store back). */
export function teamsReduce(teams: Teams, action: TeamsAction, rng: RngState): Teams {
  switch (action.type) {
    case 'teams.join':
      return moveToTeam(teams, action.bySeat, action.team);
    case 'teams.move':
      if (typeof (action as { bySeat?: unknown }).bySeat === 'number') throw new Error('Only the host moves others');
      return moveToTeam(teams, action.seat, action.team);
    case 'teams.shuffle':
      if (typeof (action as { bySeat?: unknown }).bySeat === 'number') throw new Error('Only the host shuffles');
      return dealTeams(teams.of.length, teams.count, rng);
  }
}
