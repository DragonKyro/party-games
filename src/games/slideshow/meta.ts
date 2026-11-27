import type { GameMeta } from '@/engine/meta';
import { describeSource } from '@/words/source';
import { readOptions } from './rules';

/** 90 → "1:30", 120 → "2 min". */
function clock(s: number): string {
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r ? `${m}:${String(r).padStart(2, '0')}` : `${m} min`;
}

export const meta: GameMeta = {
  id: 'slideshow',
  title: 'Slideshow Karaoke',
  tagline: 'Give a keynote on slides you’ve never seen. Commit to every chart.',
  players: '2–20',
  duration: '15–40 min',
  accent: '#8c9eff',
  howTo: [
    'Each player in turn presents a talk with a random title, like “The Hidden Economics of Penguins”.',
    'Slides appear one at a time — charts, quotes, diagrams, mysterious photos. Nobody, not even the presenter, sees what’s next.',
    'Improvise a talk that holds together. Click Next when you’re ready (or the slides move on by themselves).',
    'Watch for the wildcard twist mid-talk, then field a question or two from the floor.',
    'The audience rates every talk 1–5 stars in secret. Best average gives the keynote of the night.',
  ],
  localPlay: 'shared',
  localNote: 'One laptop or TV shows the slides; the presenter clicks Next. The crowd rates by applause meter (or passes the device to vote).',
  summary: (raw) => {
    const o = readOptions(raw);
    return [
      `${o.slides} slides per talk${o.talksEach > 1 ? ` · ${o.talksEach} talks each` : ''}`,
      o.autoAdvance > 0 ? `Auto-advance every ${o.autoAdvance}s` : 'Presenter clicks Next',
      ...(o.talkSeconds > 0 ? [`${clock(o.talkSeconds)} talk timer`] : []),
      [o.twists && 'Wildcard twists', o.qa && 'Q&A'].filter(Boolean).join(' · ') || 'No twists, no Q&A',
      `Topics: ${describeSource(o.words)}`,
    ];
  },
};
