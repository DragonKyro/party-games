import type { GameMeta } from '@/engine/meta';
import { describePromptSource } from '@/words/source';
import { describeBands, readOptions } from './rules';

export const meta: GameMeta = {
  id: 'tune-in',
  title: 'Tune In',
  tagline: 'One secret station, one clue. How close can you tune?',
  players: '2–16',
  duration: '15–30 min',
  accent: '#ff9f43',
  howTo: [
    'Each round one player is the Tuner. They see a secret spot on a dial that runs between two opposites, like Cold ↔ Hot.',
    'The Tuner picks one of two spectrums and writes a short clue that sits exactly there. “Fresh toast” is pretty warm; “The sun” is not.',
    'Everyone else turns the dial to where they think the station is, then locks in.',
    'The closer the needle, the more points: a bullseye is 4. In “everyone” mode the Tuner scores the average of the guessers (rounded up).',
    'Co-op mode: the whole table argues over ONE shared needle and builds a team score toward a final rating.',
  ],
  localPlay: 'pass',
  localNote:
    'One phone: the Tuner peeks and writes a clue, then the table drags one needle together (co-op) or passes it round for private guesses.',
  summary: (raw) => {
    const o = readOptions(raw);
    return [
      o.mode === 'team' ? `Co-op · ${o.rounds} rounds` : `Everyone guesses · ${o.rotations}× each as Tuner`,
      o.guessSeconds > 0 ? `${o.guessSeconds}s to guess` : 'No guessing timer',
      describeBands(o.bands),
      describePromptSource(o.spectrums, 'spectrums'),
    ];
  },
};
