import type { GameMeta } from '@/engine/meta';
import { describeSource } from '@/words/source';
import { FORMAT_INFO, readOptions } from './rules';

export const meta: GameMeta = {
  id: 'odd-one-out',
  title: 'Odd One Out',
  tagline: 'Everyone knows the secret word. Almost everyone.',
  players: '3–12',
  duration: '15–30 min',
  accent: '#a06cf0',
  howTo: [
    'Everyone sees the same board of words. All but the outsider also see which one is the secret.',
    'Clues: in turn, everyone says ONE word linked to the secret. Questions: quiz each other until the timer runs out.',
    'Insiders: hint enough to prove you know it — not so much that the outsider works it out.',
    'Outsider: blend in! Think you’ve cracked it? Hit “I know the word!” — right and you win, wrong and you lose.',
    'Vote for the outsider. Most votes is accused (a tie catches nobody). A caught outsider gets one last guess to steal the win.',
    'Outsiders win: +2 each (+1 for naming the word). Insiders win: +1 each, +1 more if you voted for an outsider.',
  ],
  localPlay: 'pass',
  localNote: 'One device, passed round so everyone peeks at their role in private. Clues are said out loud; votes by secret pass-round or an open point-and-tap.',
  summary: (raw) => {
    const o = readOptions(raw);
    return [
      `${o.rounds} rounds`,
      o.format === 'questions'
        ? `${FORMAT_INFO.questions.name} · ${o.talkMinutes} min`
        : `${FORMAT_INFO.clues.name}${o.discussSeconds > 0 ? ` · ${o.discussSeconds}s talk` : ''}`,
      `${o.boardSize}-word board`,
      o.outsiders === 2 ? '2 outsiders' : '1 outsider',
      describeSource(o.words),
    ];
  },
};
