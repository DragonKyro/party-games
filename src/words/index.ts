// Built-in word packs: the "predefined list" half of every game's word
// source (the other halves are the host's saved lists and words the players
// write themselves — see source.ts and collect.ts).
//
// Entries are display-ready: natural case, may contain spaces ("Birthday
// cake", "Albert Einstein"), ≤ 40 characters, no duplicates within a pack.
// `fit` says which kinds of play a pack suits, so setup screens can mark
// packs as recommended (drawing games want "draw", charades wants "act",
// talking games want "describe").
//
// Adding a pack: drop a file under `packs/`, add it to PACK_IDS and WORD_PACKS.

import { ACTIONS } from './packs/actions';
import { ANIMALS } from './packs/animals';
import { CHARACTERS } from './packs/characters';
import { EVERYDAY } from './packs/everyday';
import { FAMOUS } from './packs/famous';
import { FOOD } from './packs/food';
import { HARD } from './packs/hard';
import { HOLIDAYS } from './packs/holidays';
import { IDIOMS } from './packs/idioms';
import { JOBS } from './packs/jobs';
import { KIDS } from './packs/kids';
import { NATURE } from './packs/nature';
import { PLACES } from './packs/places';
import { POP_CULTURE } from './packs/pop-culture';
import { SPICY } from './packs/spicy';
import { SPORTS } from './packs/sports';
import { TECH } from './packs/tech';

export const PACK_IDS = [
  'everyday',
  'animals',
  'food',
  'actions',
  'places',
  'jobs',
  'famous',
  'characters',
  'pop-culture',
  'idioms',
  'sports',
  'nature',
  'holidays',
  'tech',
  'kids',
  'hard',
  'spicy',
] as const;

export type PackId = (typeof PACK_IDS)[number];

export type PackFit = 'draw' | 'act' | 'describe';

export interface WordPack {
  id: PackId;
  name: string;
  emoji: string;
  /** One short line for the picker. */
  blurb: string;
  fit: readonly PackFit[];
  adultsOnly?: boolean;
  words: readonly string[];
}

export const WORD_PACKS: Record<PackId, WordPack> = {
  everyday: {
    id: 'everyday',
    name: 'Everyday Things',
    emoji: '🪥',
    blurb: 'Stuff in your house, bag and pockets.',
    fit: ['draw', 'describe', 'act'],
    words: EVERYDAY,
  },
  animals: {
    id: 'animals',
    name: 'Animals',
    emoji: '🦒',
    blurb: 'Pets, beasts, bugs and sea creatures.',
    fit: ['draw', 'act', 'describe'],
    words: ANIMALS,
  },
  food: {
    id: 'food',
    name: 'Food & Drink',
    emoji: '🌮',
    blurb: 'Snacks, dishes, desserts and drinks.',
    fit: ['draw', 'describe'],
    words: FOOD,
  },
  actions: {
    id: 'actions',
    name: 'Actions',
    emoji: '🤸',
    blurb: 'Things people do — made for charades.',
    fit: ['act', 'draw'],
    words: ACTIONS,
  },
  places: {
    id: 'places',
    name: 'Places',
    emoji: '🗺️',
    blurb: 'Rooms, buildings, cities and landmarks.',
    fit: ['describe', 'draw'],
    words: PLACES,
  },
  jobs: {
    id: 'jobs',
    name: 'Jobs & Roles',
    emoji: '🧑‍🚒',
    blurb: 'Occupations, titles and archetypes.',
    fit: ['act', 'describe', 'draw'],
    words: JOBS,
  },
  famous: {
    id: 'famous',
    name: 'Famous People',
    emoji: '🌟',
    blurb: 'Icons from history, science, sport and showbiz.',
    fit: ['describe', 'act'],
    words: FAMOUS,
  },
  characters: {
    id: 'characters',
    name: 'Characters',
    emoji: '🧙',
    blurb: 'Heroes, villains and legends from stories.',
    fit: ['describe', 'act', 'draw'],
    words: CHARACTERS,
  },
  'pop-culture': {
    id: 'pop-culture',
    name: 'Pop Culture',
    emoji: '🎬',
    blurb: 'Films, shows, songs, games and trends.',
    fit: ['describe', 'act'],
    words: POP_CULTURE,
  },
  idioms: {
    id: 'idioms',
    name: 'Phrases & Idioms',
    emoji: '💬',
    blurb: 'Sayings and expressions. Tricky to act!',
    fit: ['act', 'describe'],
    words: IDIOMS,
  },
  sports: {
    id: 'sports',
    name: 'Sports & Hobbies',
    emoji: '🏓',
    blurb: 'Games, gear, pastimes and pursuits.',
    fit: ['act', 'draw', 'describe'],
    words: SPORTS,
  },
  nature: {
    id: 'nature',
    name: 'Nature & Science',
    emoji: '🌋',
    blurb: 'Weather, space, plants and phenomena.',
    fit: ['draw', 'describe'],
    words: NATURE,
  },
  holidays: {
    id: 'holidays',
    name: 'Holidays & Events',
    emoji: '🎉',
    blurb: 'Celebrations, traditions and big days.',
    fit: ['describe', 'act', 'draw'],
    words: HOLIDAYS,
  },
  tech: {
    id: 'tech',
    name: 'Tech & Internet',
    emoji: '📱',
    blurb: 'Gadgets, apps and online life.',
    fit: ['describe', 'draw'],
    words: TECH,
  },
  kids: {
    id: 'kids',
    name: 'Easy (Kids)',
    emoji: '🧸',
    blurb: 'Simple, concrete words for younger players.',
    fit: ['draw', 'act', 'describe'],
    words: KIDS,
  },
  hard: {
    id: 'hard',
    name: 'Hard Mode',
    emoji: '🧠',
    blurb: 'Abstract ideas and slippery concepts.',
    fit: ['describe'],
    words: HARD,
  },
  spicy: {
    id: 'spicy',
    name: 'After Dark (18+)',
    emoji: '🌶️',
    blurb: 'Grown-up party fare. Cheeky, not explicit.',
    fit: ['describe', 'act'],
    adultsOnly: true,
    words: SPICY,
  },
};

export const PACK_LIST: readonly WordPack[] = PACK_IDS.map((id) => WORD_PACKS[id]);

export function isPackId(x: unknown): x is PackId {
  return typeof x === 'string' && (PACK_IDS as readonly string[]).includes(x);
}

export function packsFitting(fit: PackFit): PackId[] {
  return PACK_LIST.filter((p) => p.fit.includes(fit) && !p.adultsOnly).map((p) => p.id);
}

export * from './source';
export * from './collect';
export * from './match';
