import type { GameMeta } from '@/engine/meta';
import { describeSource } from '@/words/source';
import { readOptions } from './rules';

export const meta: GameMeta = {
  id: 'sketch',
  title: 'Sketch & Guess',
  tagline: 'One person draws, everyone else races to guess. No artistic talent required.',
  players: '2–16',
  duration: '15–30 min',
  accent: '#ff6b6b',
  howTo: [
    'Take turns drawing. On your turn, secretly pick one of three words, then draw it. No letters, no numbers!',
    'Everyone else guesses: the quicker you get it, the more points you score. The artist earns points for every player who gets it.',
    'Online, type your guesses. A close one gets a private “So close!”. Once you’ve got it, only other solvers can read your messages.',
    'With hints on, the blanks show how long the word is, and a few letters appear as time runs down.',
    'Everyone draws once per round. Most points after the last round wins.',
  ],
  localPlay: 'pass',
  localNote:
    'One device: the artist takes it to pick a word, then draws while everyone crowds round and shouts. The artist taps whoever got it.',
  summary: (raw) => {
    const o = readOptions(raw);
    return [
      `${o.rounds} round${o.rounds === 1 ? '' : 's'}`,
      `${o.turnSeconds}s to draw`,
      o.guessing === 'typed' ? 'Typed guesses' : 'Shout it out',
      o.hints ? 'Letter hints' : 'No hints',
      describeSource(o.words),
    ];
  },
};
