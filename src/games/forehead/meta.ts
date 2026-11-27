import type { GameMeta } from '@/engine/meta';
import { describeSource } from '@/words/source';
import { readOptions } from './rules';

export const meta: GameMeta = {
  id: 'forehead',
  title: 'Forehead',
  tagline: 'Phone on your forehead, friends shouting clues. Tilt down when you get it.',
  players: '2–20',
  duration: '10–30 min',
  accent: '#ffc93c',
  howTo: [
    'On your turn, hold the phone to your forehead with the screen facing out. Everyone else can see the word; you can’t.',
    'Your friends shout clues: describe it, act it, hum it. No saying the word itself.',
    'Got it? Tilt the phone face-down. Stuck? Tilt it face-up to pass. (Tapping the bottom or top half works too.)',
    'Get as many as you can before the buzzer, then everyone sees what you got and what you missed.',
    'Everyone guesses once per round. Most correct cards in total wins.',
  ],
  localPlay: 'pass',
  localNote: 'One phone, handed to each guesser in turn. They hold it to their forehead while everyone else gives clues.',
  summary: (raw) => {
    const o = readOptions(raw);
    return [
      `${o.turnSeconds}s turns`,
      `${o.rounds} ${o.rounds === 1 ? 'round' : 'rounds'}`,
      o.display === 'others' ? 'Word on everyone else’s phones' : 'Phone on the forehead',
      describeSource(o.words),
    ];
  },
};
