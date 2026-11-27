import type { GameMeta } from '@/engine/meta';
import { describeSource } from '@/words/source';
import { ROUND_INFO, readOptions } from './rules';

export const meta: GameMeta = {
  id: 'fishbowl',
  title: 'Fishbowl',
  tagline: 'One bowl of slips, three rounds: describe it, one word, act it out.',
  players: '4–20',
  duration: '30–60 min',
  accent: '#4cc9f0',
  howTo: [
    'Everyone secretly writes a few names, things or phrases. They all go in the bowl.',
    'Split into teams. On your turn, pull slips and get your team to guess as many as you can before the timer runs out.',
    'Round 1: describe it (no saying the words). Round 2: one word only. Round 3: act it out, no sounds.',
    'The same slips come back every round, so by charades everyone knows them — and the inside jokes write themselves.',
    'The bowl empties → next round. Time left over carries into the next round. Most slips wins.',
  ],
  localPlay: 'pass',
  localNote: 'One phone, handed to whoever is giving clues. Everyone writes their slips on it in turn.',
  summary: (raw) => {
    const o = readOptions(raw);
    return [
      `${o.teamCount} teams`,
      `${o.turnSeconds}s turns`,
      o.rounds.map((r) => ROUND_INFO[r].name).join(' → '),
      describeSource(o.words),
      `${o.bowlSize} slips`,
    ];
  },
};
