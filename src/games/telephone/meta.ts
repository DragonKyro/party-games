import type { GameMeta } from '@/engine/meta';
import { describeSource } from '@/words/source';
import { readOptions } from './rules';

export const meta: GameMeta = {
  id: 'telephone',
  title: 'Doodle Telephone',
  tagline: 'Draw what you read, guess what you see — and watch every prompt go hilariously wrong.',
  players: '3–16',
  duration: '15–30 min',
  accent: '#ff70a6',
  howTo: [
    'Everyone gets a sketchbook and starts it with a prompt — write your own, or pick one of three.',
    'Pass it on: the next player draws the prompt. The one after only sees that drawing and guesses what it is.',
    'Draw, guess, draw, guess… everyone works on a different book at the same time, until each book has been round the table.',
    'Then the reveal: open each book page by page and watch “walking the dog” become “a haunted lamp”.',
    'Tap ❤️ on the pages you love. Most hearts wins — but really, everyone wins.',
  ],
  localPlay: 'pass',
  localNote: 'One phone passed around: each step, everyone takes a turn with it in private. The reveal is on one screen.',
  summary: (raw) => {
    const o = readOptions(raw);
    return [
      o.words.perPlayer > 0 ? 'Players write prompts' : `Pick 1 of 3 · ${describeSource(o.words)}`,
      o.timed ? `${o.drawSeconds}s draw · ${o.guessSeconds}s guess` : 'No timer',
      o.maxSteps > 0 ? `Capped at ${o.maxSteps % 2 ? o.maxSteps + 1 : o.maxSteps} passes` : 'Round the whole table',
    ];
  },
};
