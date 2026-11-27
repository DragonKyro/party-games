import { readSource, type WordSource } from '@/words/source';

// Options, limits and validation for Odd One Out.

export type Format = 'clues' | 'questions';
/** Single device only: pass-the-phone secret ballots, or point and tap the accused. */
export type VoteMode = 'secret' | 'open';

export interface OddOneOutOptions {
  words: WordSource;
  /** Words on the board each round. */
  boardSize: 12 | 16;
  /** Outsiders per round. 2 needs TWO_OUTSIDER_MIN players. */
  outsiders: 1 | 2;
  format: Format;
  /** Clues: the discussion after the last clue. 0 = untimed (the host calls the vote). */
  discussSeconds: number;
  /** Questions: the free-talk timer. */
  talkMinutes: number;
  rounds: number;
  voting: VoteMode;
}

export const DEFAULT_OPTIONS: OddOneOutOptions = {
  words: { packs: ['animals', 'food', 'places', 'jobs', 'sports'], listIds: [], perPlayer: 0 },
  boardSize: 16,
  outsiders: 1,
  format: 'clues',
  discussSeconds: 90,
  talkMinutes: 4,
  rounds: 5,
  voting: 'secret',
};

export const MIN_ROUNDS = 3;
export const MAX_ROUNDS = 10;
export const MIN_TALK_MINUTES = 2;
export const MAX_TALK_MINUTES = 10;
export const MAX_DISCUSS_SECONDS = 300;
export const TWO_OUTSIDER_MIN = 7;
/** A board needs at least this many words to be worth playing. */
export const MIN_BOARD = 8;
/** One clue word, this long at most. */
export const MAX_CLUE_LENGTH = 24;

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.round(n))) : fallback;
}

/** Coerce untrusted options (from the lobby) into valid ones. */
export function readOptions(raw: Record<string, unknown> | undefined): OddOneOutOptions {
  const r = raw ?? {};
  const discuss = clampInt(r.discussSeconds, 0, MAX_DISCUSS_SECONDS, DEFAULT_OPTIONS.discussSeconds);
  return {
    words: readSource(r.words, DEFAULT_OPTIONS.words),
    boardSize: Number(r.boardSize) === 12 ? 12 : Number(r.boardSize) === 16 ? 16 : DEFAULT_OPTIONS.boardSize,
    outsiders: Number(r.outsiders) === 2 ? 2 : 1,
    format: r.format === 'questions' || r.format === 'clues' ? r.format : DEFAULT_OPTIONS.format,
    // Anything under 15s is "off" — a 5-second discussion is no discussion.
    discussSeconds: discuss < 15 ? 0 : discuss,
    talkMinutes: clampInt(r.talkMinutes, MIN_TALK_MINUTES, MAX_TALK_MINUTES, DEFAULT_OPTIONS.talkMinutes),
    rounds: clampInt(r.rounds, MIN_ROUNDS, MAX_ROUNDS, DEFAULT_OPTIONS.rounds),
    voting: r.voting === 'open' || r.voting === 'secret' ? r.voting : DEFAULT_OPTIONS.voting,
  };
}

export function optionsProblem(raw: Record<string, unknown>, playerCount: number): string | null {
  const o = readOptions(raw);
  if (o.outsiders === 2 && playerCount < TWO_OUTSIDER_MIN) {
    return `Two outsiders needs at least ${TWO_OUTSIDER_MIN} players.`;
  }
  const { packs, listIds, perPlayer } = o.words;
  if (packs.length === 0 && listIds.length === 0 && perPlayer === 0) {
    return 'Choose where the board words come from: a pack, a saved list, or the players.';
  }
  if (packs.length === 0 && listIds.length === 0 && perPlayer * playerCount < MIN_BOARD) {
    return `Players need to write at least ${MIN_BOARD} words between them — ask for more each, or add a pack.`;
  }
  return null;
}

export const FORMAT_INFO: Record<Format, { name: string; emoji: string; rule: string }> = {
  clues: {
    name: 'One-word clues',
    emoji: '💬',
    rule: 'In turn, everyone gives ONE word linked to the secret. Then talk it over and vote.',
  },
  questions: {
    name: 'Questions',
    emoji: '❓',
    rule: 'Free talk: quiz each other about the secret until the timer runs out, then vote.',
  },
};
