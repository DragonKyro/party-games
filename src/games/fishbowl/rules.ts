import { clampTeams } from '@/engine/teams';
import { readSource, type WordSource } from '@/words/source';

// Options, round definitions and validation for Fishbowl.

export const ROUND_KINDS = ['describe', 'one-word', 'charades', 'sounds'] as const;
export type RoundKind = (typeof ROUND_KINDS)[number];

export const ROUND_INFO: Record<RoundKind, { name: string; emoji: string; rule: string }> = {
  describe: {
    name: 'Describe it',
    emoji: '🗣️',
    rule: 'Say anything except the words on the slip. No spelling, no “sounds like”, no pointing.',
  },
  'one-word': {
    name: 'One word',
    emoji: '☝️',
    rule: 'You get exactly ONE word per slip. Your team gets as many guesses as they like.',
  },
  charades: {
    name: 'Act it out',
    emoji: '🎭',
    rule: 'No words, no sounds — just gestures. Your team can shout as much as they want.',
  },
  sounds: {
    name: 'Sounds only',
    emoji: '🎺',
    rule: 'Noises only: hums, beeps, animal calls. No real words and keep your hands still.',
  },
};

export type SkipRule = 'free' | 'one' | 'none';

export interface FishbowlOptions {
  words: WordSource;
  /** Slips in the bowl. Player-written slips all go in; packs / lists top up to this. */
  bowlSize: number;
  rounds: RoundKind[];
  turnSeconds: number;
  teamCount: number;
  skipRule: SkipRule;
  /** Leftover time when the bowl empties carries into the next round. */
  carryOver: boolean;
}

export const DEFAULT_OPTIONS: FishbowlOptions = {
  words: { packs: ['famous', 'characters'], listIds: [], perPlayer: 4 },
  bowlSize: 40,
  rounds: ['describe', 'one-word', 'charades'],
  turnSeconds: 60,
  teamCount: 2,
  skipRule: 'free',
  carryOver: true,
};

export const MIN_SLIPS = 8;
export const MAX_SLIPS = 120;

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.round(n))) : fallback;
}

/** Coerce untrusted options (from the lobby) into valid ones. */
export function readOptions(raw: Record<string, unknown> | undefined): FishbowlOptions {
  const r = raw ?? {};
  const rounds = Array.isArray(r.rounds)
    ? [...new Set(r.rounds.filter((x): x is RoundKind => (ROUND_KINDS as readonly string[]).includes(x as string)))]
    : DEFAULT_OPTIONS.rounds;
  const skip = r.skipRule === 'one' || r.skipRule === 'none' || r.skipRule === 'free' ? r.skipRule : DEFAULT_OPTIONS.skipRule;
  return {
    words: readSource(r.words, DEFAULT_OPTIONS.words),
    bowlSize: clampInt(r.bowlSize, MIN_SLIPS, MAX_SLIPS, DEFAULT_OPTIONS.bowlSize),
    rounds: rounds.length > 0 ? rounds : DEFAULT_OPTIONS.rounds,
    turnSeconds: clampInt(r.turnSeconds, 15, 180, DEFAULT_OPTIONS.turnSeconds),
    teamCount: clampTeams(Number(r.teamCount ?? DEFAULT_OPTIONS.teamCount)),
    skipRule: skip,
    carryOver: typeof r.carryOver === 'boolean' ? r.carryOver : DEFAULT_OPTIONS.carryOver,
  };
}

export function optionsProblem(raw: Record<string, unknown>, playerCount: number): string | null {
  const o = readOptions(raw);
  if (playerCount < o.teamCount * 2) {
    return `${o.teamCount} teams need at least ${o.teamCount * 2} players.`;
  }
  if (o.words.packs.length === 0 && o.words.listIds.length === 0 && o.words.perPlayer === 0) {
    return 'Choose where the slips come from: players, a saved list, or a pack.';
  }
  return null;
}

/** Skips still allowed this turn (null = unlimited). */
export function skipsLeft(rule: SkipRule, used: number): number | null {
  if (rule === 'free') return null;
  if (rule === 'none') return 0;
  return Math.max(0, 1 - used);
}
