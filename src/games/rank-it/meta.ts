import type { GameMeta } from '@/engine/meta';
import { describePromptSource, describeSource } from '@/words/source';
import { readOptions } from './rules';

export const meta: GameMeta = {
  id: 'rank-it',
  title: 'Rank It',
  tagline: 'Five random things, one question: rank them most to least — then read each other’s minds.',
  players: '3–12',
  duration: '15–30 min',
  accent: '#06d6a0',
  howTo: [
    'Each round deals a few random things — or things your friends wrote — and a criterion, like “Most → least: useful in a zombie apocalypse”.',
    'The Ranker picks one of two criteria (or writes their own) and secretly puts the items in order, MOST first.',
    'At the same time everyone else guesses the Ranker’s order. Tap the items in order; tap one again to take it back.',
    'Guessers score 2 per item in the exact spot and 1 per item one spot off, plus 3 for a perfect order. The Ranker scores the guessers’ average — so be readable!',
    'Crowd mode: no Ranker. Everyone ranks, and you score by how close you are to the room’s average order.',
  ],
  localPlay: 'pass',
  localNote: 'One phone: the Ranker picks and ranks in secret, then it goes round for everyone’s guesses. The reveal is for the whole table.',
  summary: (raw) => {
    const o = readOptions(raw);
    const lines = [
      o.mode === 'ranker'
        ? `Ranker mode · everyone ranks ${o.rotations === 1 ? 'once' : `${o.rotations}×`}`
        : `Crowd mode · ${o.rounds} rounds${o.crowdPick === 'chooser' ? ' · rotating chooser' : ''}`,
      `${o.itemCount} items a round`,
      `Items: ${describeSource(o.items)}`,
      `Criteria: ${describePromptSource(o.criteria, 'criteria')}`,
    ];
    if (o.timeLimit > 0) lines.push(`${o.timeLimit}s to rank`);
    return lines;
  },
};
