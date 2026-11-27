import { describe, expect, it } from 'vitest';
import { makeRng } from './rng';
import { dealTeams, membersOf, moveToTeam, teamTurn, teamsProblem } from './teams';
import { addTime, idleTimer, isExpired, pauseTimer, progress, resumeTimer, startTimer, timeLeft } from './timer';

describe('timer', () => {
  it('counts down from the start and expires', () => {
    const t = startTimer(60_000, 1_000);
    expect(timeLeft(t, 1_000)).toBe(60_000);
    expect(timeLeft(t, 31_000)).toBe(30_000);
    expect(isExpired(t, 60_999)).toBe(false);
    expect(isExpired(t, 61_000)).toBe(true);
    expect(timeLeft(t, 99_000)).toBe(0);
    expect(progress(t, 31_000)).toBeCloseTo(0.5);
  });

  it('pauses and resumes without losing time', () => {
    const t = startTimer(10_000, 0);
    const p = pauseTimer(t, 4_000);
    expect(p.endsAt).toBeNull();
    expect(timeLeft(p, 1_000_000)).toBe(6_000);
    expect(isExpired(p, 1_000_000)).toBe(false);
    const r = resumeTimer(p, 50_000);
    expect(r.endsAt).toBe(56_000);
    expect(pauseTimer(p, 9)).toBe(p);
    expect(resumeTimer(r, 9)).toBe(r);
  });

  it('idle timers show full time and never expire', () => {
    const t = idleTimer(30_000);
    expect(timeLeft(t, 123)).toBe(30_000);
    expect(isExpired(t, Number.MAX_SAFE_INTEGER)).toBe(false);
  });

  it('adds and removes time, never below zero', () => {
    const t = startTimer(10_000, 0);
    expect(timeLeft(addTime(t, 5_000, 2_000), 2_000)).toBe(13_000);
    expect(timeLeft(addTime(t, -50_000, 2_000), 2_000)).toBe(0);
    expect(timeLeft(addTime(pauseTimer(t, 1_000), 1_000, 0), 0)).toBe(10_000);
  });
});

describe('teams', () => {
  it('deals balanced teams deterministically', () => {
    const a = dealTeams(7, 2, makeRng(5));
    const b = dealTeams(7, 2, makeRng(5));
    expect(a).toEqual(b);
    const sizes = [membersOf(a, 0).length, membersOf(a, 1).length].sort();
    expect(sizes).toEqual([3, 4]);
    const three = dealTeams(9, 3, makeRng(1));
    expect([0, 1, 2].map((t) => membersOf(three, t).length)).toEqual([3, 3, 3]);
  });

  it('clamps the team count', () => {
    expect(dealTeams(6, 9, makeRng(1)).count).toBe(4);
    expect(dealTeams(6, 0, makeRng(1)).count).toBe(2);
  });

  it('moves seats and validates', () => {
    const t = { count: 2, of: [0, 0, 1, 1] };
    expect(moveToTeam(t, 0, 1).of).toEqual([1, 0, 1, 1]);
    expect(moveToTeam(t, 0, 0)).toBe(t);
    expect(() => moveToTeam(t, 4, 0)).toThrow();
    expect(() => moveToTeam(t, 0, 2)).toThrow();
    expect(teamsProblem(t)).toBeNull();
    expect(teamsProblem({ count: 2, of: [0, 0, 0, 1] })).toMatch(/at least 2/);
  });

  it('alternates teams and rotates members within each team', () => {
    const t = { count: 2, of: [0, 1, 0, 1, 0] }; // team 0: 0,2,4 · team 1: 1,3
    const order = Array.from({ length: 8 }, (_, i) => teamTurn(t, i));
    expect(order.map((o) => o.team)).toEqual([0, 1, 0, 1, 0, 1, 0, 1]);
    expect(order.map((o) => o.seat)).toEqual([0, 1, 2, 3, 4, 1, 0, 3]);
    expect(teamTurn(t, 0, 1)).toEqual({ team: 1, seat: 1 });
  });
});

describe('teams phase', () => {
  it('lets players switch themselves and the host move or shuffle', async () => {
    const { teamsReduce, isTeamsAction } = await import('./teams');
    const t = { count: 2, of: [0, 0, 1, 1] };
    const rng = makeRng(3);
    expect(teamsReduce(t, { type: 'teams.join', bySeat: 0, team: 1 }, rng).of).toEqual([1, 0, 1, 1]);
    expect(teamsReduce(t, { type: 'teams.move', seat: 3, team: 0 }, rng).of).toEqual([0, 0, 1, 0]);
    expect(() => teamsReduce(t, { type: 'teams.move', seat: 3, team: 0, bySeat: 1 } as never, rng)).toThrow();
    const shuffled = teamsReduce(t, { type: 'teams.shuffle' }, rng);
    expect(shuffled.of.filter((x) => x === 0)).toHaveLength(2);
    expect(isTeamsAction({ type: 'teams.join' })).toBe(true);
    expect(isTeamsAction({ type: 'collect.submit' })).toBe(false);
  });
});
