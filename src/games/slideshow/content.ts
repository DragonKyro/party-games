// ============================================================================
// Slideshow Karaoke — phrase banks
//
// All of this is our own writing: corporate / academic / keynote-speak with
// the serial numbers filed off. Templates use these placeholders, filled by
// `deck.ts`:
//
//   {T}  the talk's topic            {M} / {M2}  the deck's motif words
//   {b}  a buzzword (lowercase)      {B}         the same, Capitalised
//   {v}  a verb (lowercase)          {V}         the same, Capitalised
//   {n}  the number of slides
//
// Templates are written to survive any noun (singular, plural, proper,
// abstract), because topics come from packs and from players.
// ============================================================================

// ---- talk titles & title slide ---------------------------------------------

export const TALK_TITLES: readonly string[] = [
  'The Hidden Economics of {T}',
  '{T}: A Survivor’s Guide',
  'Why {T} Is the Future of Logistics',
  'Rethinking {T} from First Principles',
  'The {T} Paradox',
  '{T} at Scale',
  'Disrupting {T}: A Roadmap',
  'Unlocking the Power of {T}',
  'A Brief History of {T}',
  '{T} in the Age of Uncertainty',
  'Towards a Unified Theory of {T}',
  'Monetising {T}',
  'The Ethics of {T}',
  '{T} 2.0',
  'Lessons from {T}',
  'Building a Culture of {T}',
  '{T}: The Missing Link',
  'The Science of {T}',
  '{T} for Executives',
  'From Zero to {T}',
  'Confessions of a {T} Enthusiast',
  '{T}: Our Five-Year Plan',
  'Why Nobody Talks About {T}',
  '{T}: Myths, Facts & Spreadsheets',
  'What {T} Taught Me About Leadership',
  '{T} and the Attention Economy',
  'The Quiet Revolution of {T}',
  '{T}, Reimagined',
  'Everything You Know About {T} Is Wrong',
  'Mastering {T} in 30 Days',
  'The {T} Manifesto',
  '{T}: Threat or Opportunity?',
  'In Defence of {T}',
  'The Untold Story of {T}',
  '{T} as a Service',
  'Sustainable {T}',
  'The Psychology of {T}',
  '{T}: A Love Story in Charts',
];

export const TALK_SUBTITLES: readonly string[] = [
  'Quarterly all-hands',
  'Keynote · Main stage',
  'Internal — please do not forward',
  'Draft 14 (final) (actually final)',
  'A lunch & learn session',
  'Board briefing · Confidential',
  'Findings from a very serious study',
  'Annual symposium on {M}',
  'Sponsored by {M}',
  'An investor update',
  'Version 3.1 — now with fewer typos',
  'Prepared on a train, mostly',
  'Strategy offsite special',
  'Opening remarks',
  'Peer-reviewed by my cousin',
  'Notes from the {M} summit',
  'A deep dive in {n} slides',
  'Thought leadership series, part 7',
  'Live from conference room B',
  'A {b} masterclass',
];

export const PRESENTER_ROLES: readonly string[] = [
  'Chief Vibes Officer',
  'Head of Strategy',
  'Senior Visionary',
  'Thought Leader (self-appointed)',
  'Distinguished Fellow',
  'Regional Manager',
  'Founder & CEO',
  'Visiting Professor',
  'Head of {M}',
  'VP of {B}',
  'Principal Futurist',
  'Lead Researcher',
  'Intern (acting director)',
  'Award-winning keynote speaker',
  'Chief {M} Officer',
  'Director of Special Projects',
  'Junior Partner',
];

// ---- the deck's vocabulary -------------------------------------------------

/** Our own recurring motif nouns, mixed in with words from the word source. */
export const MOTIFS: readonly string[] = [
  'Spreadsheets', 'Bees', 'Pigeons', 'Soup', 'Jazz', 'Bubble wrap', 'Lighthouses', 'Origami',
  'The intern', 'Sourdough', 'Traffic cones', 'Glitter', 'Houseplants', 'Volcanoes', 'Rubber ducks',
  'The cloud', 'Elevators', 'Fog', 'Moustaches', 'Trampolines', 'Cardboard', 'Lasagna', 'Owls',
  'Snow globes', 'Kazoos', 'Penguins', 'Llamas', 'Disco balls', 'Sticky notes', 'Hammocks', 'Cheese',
  'Fireworks', 'Paperclips', 'Robots', 'Teaspoons', 'Cacti', 'Submarines', 'Waffles', 'Tiny hats',
  'Jellyfish', 'The weather', 'Vending machines', 'Socks', 'Moon dust', 'Hot sauce', 'Squirrels',
  'Accordions', 'Rollercoasters', 'Crayons', 'Kettles',
];

export const BUZZWORDS: readonly string[] = [
  'synergy', 'agility', 'alignment', 'resilience', 'bandwidth', 'mindfulness', 'scalability',
  'velocity', 'transparency', 'circularity', 'authenticity', 'momentum', 'delight', 'innovation',
  'disruption', 'wellness', 'growth', 'engagement', 'empathy', 'optimization', 'ownership', 'flow',
  'impact', 'clarity',
];

export const VERBS: readonly string[] = [
  'optimize', 'streamline', 'reimagine', 'gamify', 'harmonize', 'decentralize', 'upcycle',
  'future-proof', 'democratise', 'incentivise', 'disrupt', 'unbundle', 'rebrand', 'supercharge',
  'humanise', 'simplify', 'automate', 'crowdsource', 'turbocharge', 'declutter',
];

export const FOOTER_TAGS: readonly string[] = [
  'Confidential', 'Internal', 'Draft', 'Do not distribute', 'v2', 'For discussion', 'Strictly private',
];

// ---- slide titles, by slide type ------------------------------------------

export const SLIDE_TITLES = {
  bullets: [
    'Key takeaways',
    'Three things to remember',
    'Our approach',
    'Why {T} matters now',
    'The {T} problem',
    'Risks & mitigations',
    'Where we go from here',
    'Ground rules',
    'What nobody tells you about {T}',
    'Lessons from {M}',
    'The plan',
    'Our guiding principles',
  ],
  chart: [
    '{T} by the numbers',
    'What the data says',
    'The {M} effect',
    'Growth since launch',
    'Market overview',
    'Follow the trend',
    'Year over year',
    'The {b} curve',
  ],
  pie: [
    'Where the time goes',
    'Share of {M}',
    'What people think about {T}',
    'Budget breakdown',
    'Market share',
    'Who’s responsible?',
  ],
  table: [
    '{M} vs. {M2}',
    'Comparing our options',
    'The scorecard',
    'Feature breakdown',
    'How {T} stacks up',
    'Vendor shortlist',
  ],
  image: [
    'A closer look at {M}',
    'The big picture',
    'Picture this',
    'Our vision',
    'Field research',
    'Where it all began',
    'Exhibit A',
  ],
  diagram: [
    'How {T} works',
    'The {T} framework',
    'Our model',
    'The {M} loop',
    'Connecting the dots',
    'Mapping the landscape',
    'The {B} model',
  ],
  bigNumber: [
    'One number to remember',
    'The bottom line',
    'Let that sink in',
    'The headline',
    'In a nutshell',
    'Brace yourselves',
  ],
  quote: [
    'Words of wisdom',
    'Don’t take my word for it',
    'As the experts say',
    'A thought',
    'Food for thought',
  ],
  timeline: [
    'How we got here',
    'The road ahead',
    'Our roadmap',
    'A brief history of {T}',
    'Milestones',
    'The phase plan',
  ],
} as const;

// ---- bullets ---------------------------------------------------------------

export const BULLETS: readonly string[] = [
  'Leverage {M} across every team',
  '{T} is a mindset, not a product',
  'Start small, think {b}',
  'Align {M} with our core values',
  'Nobody saw {M} coming',
  'Measure twice, pivot once',
  'Fail fast, learn faster',
  'Put {T} at the heart of the roadmap',
  'Stakeholders love {M}',
  'Double down on {b}',
  '{M} is the new {M2}',
  'Unlock {b} at scale',
  'Pair {M} with {T}',
  'Remove friction from {M}',
  'It’s not about {M}, it’s about people',
  'Iterate until {M} feels natural',
  'Customers want more {M}',
  'Trust the process',
  'Revisit assumptions quarterly',
  'Budget for {M} (and snacks)',
  'Empower teams to own {T}',
  'Think globally, {v} locally',
  '{V} the {M} pipeline',
  'Embrace radical {b}',
  'Listen to the {M}',
  'Celebrate small wins',
  'Ask: what would {M} do?',
  'Never underestimate {M}',
  'Stay curious about {T}',
  'Pilot it in one region first',
  'Automate the boring parts',
  'Keep {M} out of the kitchen',
  'Less {M}, more {b}',
  '{V} everything, twice',
];

// ---- charts ----------------------------------------------------------------

export const CHART_CATEGORIES: readonly string[] = [
  'Us', 'Competitors', 'Everyone else', 'Experts', 'Interns', 'Legacy', 'Other', 'Unclear', 'Luck',
  'Coffee', 'Meetings', 'Gut feeling', 'Nobody', 'Marketing', 'The board', 'Vibes', 'Snacks', 'Hope',
];

export const TIME_SERIES: ReadonlyArray<readonly string[]> = [
  ['Q1', 'Q2', 'Q3', 'Q4'],
  ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
  ['Phase I', 'Phase II', 'Phase III', 'Phase IV', 'Phase V', 'Phase VI'],
  ['Week 1', 'Week 2', 'Week 3', 'Week 4', 'Week 5', 'Week 6'],
];

export const AXIS_TITLES: readonly string[] = [
  'Synergy (kJ)',
  'Vibes per quarter',
  'Enthusiasm (dB)',
  '{M} per capita',
  'Optimism index',
  'Awkwardness (hrs)',
  'Growth (bananas)',
  'Buzz (lux)',
  'Delight per dollar',
  'Chaos (normalised)',
  'Confidence (%)',
  'Momentum (knots)',
  'Brainpower (watts)',
  'Hype (kilohype)',
  'Units of {M}',
  'Mentions of {M}',
  'Gut feeling (arb. units)',
  'Morale (smiles/day)',
  'Efficiency (furlongs)',
  'Snacks eaten (kg)',
];

export const CHART_CAPTIONS: readonly string[] = [
  'Source: a guy I met at a conference',
  'Source: internal estimates',
  'Not to scale',
  'Data from the {M} survey',
  'n = 12 (mostly cousins)',
  'Adjusted for {M}',
  'Figures rounded generously',
  'Error bars available on request',
  'Preliminary, but promising',
  'Trend confirmed by vibes',
  'Projected, optimistically',
  'Excludes {M}',
  'Peer review pending',
  'Correlation is not causation (probably)',
];

// ---- tables ----------------------------------------------------------------

export const TABLE_CORNERS: readonly string[] = ['Option', 'Approach', 'Contender', 'Candidate', 'Team', ''];

export const TABLE_ROW_EXTRAS: readonly string[] = [
  'Plan A', 'Plan B', 'Do nothing', 'Us', 'Competitors', 'The old way', 'Our way', 'Option C',
  'Premium tier', 'Free tier',
];

export const TABLE_CHECK_HEADERS: readonly string[] = [
  'Scalable?', 'Tested?', 'Fun?', 'Legal?', 'Eco-friendly?', 'Approved?', 'On brand?', 'Dishwasher safe?',
];

export const TABLE_STAR_HEADERS: readonly string[] = ['Rating', 'Vibes', 'Delight', 'Taste', 'Reviews', 'Charm'];

export const TABLE_WORD_COLUMNS: ReadonlyArray<{ header: string; words: readonly string[] }> = [
  { header: 'Risk', words: ['Low', 'Medium', 'High', 'Unclear', 'Extreme'] },
  { header: 'Status', words: ['Live', 'Beta', 'Soon', 'Lost', 'Pending', 'Shipped'] },
  { header: 'Mood', words: ['Calm', 'Smug', 'Tense', 'Spicy', 'Sleepy'] },
  { header: 'Owner', words: ['Marketing', 'Legal', 'Steve', 'Nobody', 'Us', 'The intern'] },
  { header: 'Priority', words: ['P0', 'P1', 'P2', 'Later', 'Never'] },
];

/** Numeric columns: header + how to write a value from a 0..1 draw. */
export const TABLE_NUMBER_COLUMNS: ReadonlyArray<{ header: string; kind: 'money' | 'pct' | 'times' | 'weeks' | 'kg' | 'outOf10' }> = [
  { header: 'Cost', kind: 'money' },
  { header: 'ROI', kind: 'pct' },
  { header: 'Speed', kind: 'times' },
  { header: 'Time', kind: 'weeks' },
  { header: 'Weight', kind: 'kg' },
  { header: 'Risk score', kind: 'outOf10' },
];

// ---- images ----------------------------------------------------------------

export const SCENE_CAPTIONS: Record<string, readonly string[]> = {
  landscape: ['The road ahead', 'Imagine a world with more {M}', 'Where {T} goes to relax', 'Long-term outlook'],
  city: ['Our new HQ', 'Where {T} lives', 'Expansion targets', 'The {M} district at dusk'],
  abstract: ['Abstract representation of {T}', 'Our brand values, visualised', 'This is what {b} looks like', 'Mood board, final'],
  meeting: ['The {M} working group', 'Brainstorm, day 3', 'Alignment achieved', 'Our {b} committee'],
  presenter: ['Me, explaining {M}', 'The pitch that started it all', 'Proof it works', 'Explaining {T} to the board'],
  map: ['Our global footprint', 'Offices opening soon', 'Where {M} is trending', 'Shipping routes for {M}'],
  product: ['Introducing: {T} Pro', 'The prototype', 'Patent pending', 'Now available in {M}'],
  rocket: ['Launch day', 'Next stop: {M}', 'Growth trajectory', 'Ignition sequence'],
  lightbulb: ['The moment it clicked', 'Ideas powered by {M}', 'A bright idea', 'Eureka, roughly'],
  forest: ['Organic growth', 'Back to our roots', 'Branching out', 'Where {M} comes from'],
  ocean: ['Riding the wave', 'Blue-sky thinking, but wet', 'Smooth sailing ahead', 'Deep dive'],
};

export const IMAGE_CAPTIONS: readonly string[] = [
  'Artist’s impression',
  'Actual footage of {M}',
  'Figure 1: the vision',
  'Not a stock photo',
  '{M}, in its natural habitat',
  'Where the magic happens',
  'Prototype #3 (the good one)',
  'Pictured: success',
  'Concept art, subject to change',
  'Taken moments before {M}',
];

// ---- diagrams --------------------------------------------------------------

export const VENN_CENTERS: readonly string[] = ['{T}', 'Sweet spot', 'Us', 'Magic', 'The future', 'You are here', 'Profit'];

export const CYCLE_STEPS: readonly string[] = [
  'Ideate', 'Prototype', 'Panic', 'Iterate', 'Celebrate', 'Measure', 'Nap', 'Pivot', 'Ship it', 'Reflect',
  'Ask {M}', 'Rebrand', 'Coffee', 'Launch', 'Brainstorm', 'Regret', 'Review', 'Scale', '{V}', 'Add {M}',
];

export const PYRAMID_BASE: readonly string[] = ['Snacks', 'Wi-Fi', 'Coffee', 'Sleep', 'Basic {M}', 'Chairs'];
export const PYRAMID_MIDDLE: readonly string[] = ['Trust', 'Process', '{B}', 'Teamwork', 'Data', '{M}', 'Routine'];
export const PYRAMID_TOP: readonly string[] = ['{T}', 'Enlightenment', 'Pure {b}', 'Legacy', 'Total {M}', 'Mastery'];

/**
 * 2×2 matrices. Quadrants in reading order: top-left (low x, high y),
 * top-right (high x, high y), bottom-left (low x, low y), bottom-right.
 */
export const MATRICES: ReadonlyArray<{ x: string; y: string; q: readonly [string, string, string, string] }> = [
  { x: 'Effort', y: 'Impact', q: ['Quick wins', 'Big bets', 'Fill-ins', 'Time sinks'] },
  { x: 'Hype', y: 'Substance', q: ['Hidden gems', 'The real deal', 'Forgettable', 'All sizzle'] },
  { x: 'Cost', y: 'Joy', q: ['Simple pleasures', 'Luxury', 'Chores', 'Regrets'] },
  { x: 'Risk', y: 'Reward', q: ['Free lunch', 'Moonshots', 'Safe & dull', 'Why though?'] },
  { x: 'Chaos', y: 'Fun', q: ['Board games', 'Parties', 'Admin', 'Mondays'] },
  { x: 'Urgency', y: 'Importance', q: ['Plan it', 'Do it now', 'Ignore it', 'Delegate it'] },
  { x: 'Seriousness', y: 'Popularity', q: ['Memes', 'Headlines', 'Footnotes', 'Lectures'] },
];

export const FLOW_STARTS: readonly string[] = ['{M}', 'An idea', 'Customer pain', 'A hunch', 'Coffee', 'Shower thought'];
export const FLOW_MIDDLES: readonly string[] = [
  'Whiteboard', '{B}', 'Spreadsheet', 'Committee', 'A miracle', '{V}', 'Brainstorm', 'Pilot', '{M}', 'Focus group',
];
export const FLOW_ENDS: readonly string[] = ['Profit', 'Success', 'Glory', '{T}', 'Applause', 'Bonuses', 'World peace'];

export const DIAGRAM_CAPTIONS: readonly string[] = [
  'Simplified for clarity',
  'Patent pending',
  'Arrows not to scale',
  'First drawn on a napkin',
  'Validated by {M}',
  'Version 7 of this diagram',
];

// ---- big numbers -----------------------------------------------------------

export type BigNumberKind = 'pct' | 'times' | 'money' | 'count' | 'ratio' | 'zero';

export const BIG_NUMBER_CAPTIONS: Record<BigNumberKind, readonly string[]> = {
  pct: [
    'of experts agree with this slide',
    'of {M} goes unnoticed',
    'of meetings could have been about {M}',
    'more {b} than last year',
    'of people would try {T} again',
    'of the budget went on {M}',
    'chance of {M} by Friday',
  ],
  times: ['faster with {M}', 'more {b} per team', 'return on {T}', 'louder than we expected'],
  money: ['saved by switching to {M}', 'spent on {M} last year', 'the {T} market by 2030', 'lost to {M} every quarter'],
  count: ['{M} sold every minute', 'hours of {T} research', 'people asked about {M} this week', 'slides cut from this talk'],
  ratio: ['people secretly love {T}', 'teams run on {M}', 'offices have a {M} problem'],
  zero: ['complaints about {M} (so far)', 'regrets', 'plan Bs'],
};

// ---- quotes ----------------------------------------------------------------

export const QUOTES: readonly string[] = [
  '{T} is not a destination. It’s a journey.',
  'Give me enough {M} and I will move the world.',
  'The best time to start {T} was yesterday. The second best is after lunch.',
  'If you can’t explain {T} to {M}, you don’t understand it.',
  'Every great idea starts with a little {M}.',
  'We don’t need more {M}. We need better {M}.',
  'In the middle of every {T} lies an opportunity.',
  'Stay humble. Chase {b}. Stay close to {M}.',
  '{T} is just {M} with better marketing.',
  'Nobody ever regretted investing in {M}.',
  'The future belongs to those who understand {T}.',
  'First they ignore {M}. Then they can’t stop talking about it.',
  '{T} changed my life. Then it changed it back.',
  'Do one thing every day that scares {M}.',
  'Measure what matters. Then measure {M}.',
  'A world without {T} is a world without {M}.',
  'You miss every chance you don’t {v}.',
  'Start with {M}. End with {T}.',
  'When in doubt, add more {M}.',
  'There are no bad ideas, only undercooked {M}.',
  'The secret to {T}? Nobody knows. That’s the secret.',
  'Think big. Start small. Bring {M}.',
  'If {T} were easy, everyone would do it. Wait — they do.',
];

/** Added to a fictional character's name, because they certainly never said it. (Fictional only — never put invented words in real people's mouths.) */
export const FAMOUS_SUFFIXES: readonly string[] = ['(probably)', '(allegedly)', '(paraphrased)', '(at a party)', '(in a dream)', '(unverified)'];

export const EXPERT_FIRST: readonly string[] = [
  'Dr. Penelope', 'Prof. Marcus', 'Greta', 'Dr. Theo', 'Rosalind', 'Ignatius', 'Dr. Mabel', 'Bartholomew',
  'Prof. Ingrid', 'Dr. Yusuf', 'Delphine', 'Prof. Otis', 'Dr. Priya', 'Lorenzo', 'Hattie', 'Dr. Kwame',
];
export const EXPERT_LAST: readonly string[] = [
  'Marsh', 'Quill', 'Fairweather', 'Bramble', 'Okonkwo', 'Lindqvist', 'Hargreaves', 'Pemberton',
  'Castellano', 'Nakamura', 'Abernathy', 'Thistlewood', 'Moreau', 'Delacroix', 'Finch', 'Oyelaran',
];
export const EXPERT_TITLES: readonly string[] = [
  'Institute for Applied {M}',
  'Professor of {B}',
  'Chief {M} Officer',
  'author of “Thinking in {M}”',
  '{M} correspondent',
  'Head of {B}, Brightside Labs',
  'Senior Fellow, Center for {M} Studies',
  'professional {M} whisperer',
  'keynote speaker',
];
export const EVERYDAY_SOURCES: readonly string[] = [
  'My grandma',
  'A man at the bus stop',
  'An anonymous intern',
  'Someone on a forum',
  'The board',
  'My therapist',
  'A fortune cookie',
  'The office printer',
  'Overheard in an elevator',
];

// ---- timelines -------------------------------------------------------------

export const TIMELINE_FIRST: readonly string[] = ['The idea', '{M} discovered', 'A napkin sketch', 'Founded in a garage', 'First {M}'];
export const TIMELINE_MIDDLE: readonly string[] = [
  'First {T} prototype',
  'The big pivot',
  'The {M} incident',
  'Funding secured',
  'Global launch',
  'Rebrand',
  'Hired an intern',
  'Back to basics',
  '{B} initiative',
  '{M} goes viral',
  'Moved to the cloud',
  'Version 2',
];
export const TIMELINE_LAST: readonly string[] = ['World domination', '{T} everywhere', 'Retire to a beach', 'Moon office opens', 'Total {b}', 'Profit (finally)'];
export const TIMELINE_STAGES: readonly string[] = ['Day 1', 'Week 2', 'Month 6', 'Year 1', 'Year 3', 'Year 10'];
export const TIMELINE_VAGUE: readonly string[] = ['Then', 'Now', 'Next', 'Later', 'Someday'];

// ---- closer ----------------------------------------------------------------

export const CLOSER_TITLES: readonly string[] = [
  'Questions?',
  'Thank you!',
  'In conclusion…',
  'Any questions?',
  'Thank you for your time',
  'The end (for now)',
  'Let’s discuss',
  'Over to you',
];
export const CLOSER_SUBTITLES: readonly string[] = [
  'Keep the {b} alive.',
  'Remember: {M}.',
  'Find me by the snacks.',
  'Slides available on request (never).',
  '{T}: the future is now.',
  'Please rate this talk generously.',
  'Go forth and {v}.',
  'No {M} were harmed in this presentation.',
  'Now let’s {v} together.',
];

// ---- the talk around the deck ---------------------------------------------

/** Wildcard twists: shown to everyone at a random slide mid-talk. */
export const TWISTS: readonly string[] = [
  'You’re now presenting as a nature documentary narrator.',
  'The CEO just walked in. Impress them.',
  'Your mic is fading — whisper the rest.',
  'Everything is now live sports commentary.',
  'You just realized this is your ex’s slide deck.',
  'Finish every sentence as if it’s a question?',
  'Your audience is now a room of five-year-olds.',
  'You are a time traveler from 1850, seeing slides for the first time.',
  'Present the next slide as a heartfelt confession.',
  'Add a dramatic pause before every important word.',
  'You’re secretly a spy. Slip the word “pineapple” in, casually.',
  'Your arch-rival is in the front row. Stay professional.',
  'Back every point with a personal story.',
  'You’re a pirate now. Act accordingly.',
  'Rhyme your next three sentences.',
  'Switch to over-the-top motivational speaker mode.',
  'You’re running out of time — double speed!',
  'Slow motion. Speak at half speed.',
  'Sing the next slide.',
  'This is now a detective’s case briefing.',
  'The fire alarm is being tested. Stay calm and carry on.',
  'Somebody here is your biggest fan. Find them and thank them.',
  'You’re accepting an award for this research.',
  'This is now a cooking show.',
  'Your grandma is watching. Keep it wholesome.',
  'Go full conspiracy theorist.',
  'Use a different accent for every slide.',
  'Your hands are now banned from moving.',
];

/** Audience Q&A, shown after the last slide. */
export const QUESTIONS: readonly string[] = [
  'How does this affect the {M}?',
  'Isn’t this just {M} with extra steps?',
  'What’s the budget for all this?',
  'Have you tried turning {T} off and on again?',
  'Who funded this research?',
  'What would you say to the critics of {T}?',
  'Is there a version of this for children?',
  'How do you sleep at night?',
  'What’s your five-year plan for {M}?',
  'Could you explain the chart again, slowly?',
  'What was your biggest mistake along the way?',
  'Is any of this legal?',
  'How did your family react?',
  'Where can I buy one?',
  'This is more of a comment than a question, but… {M}?',
  'What does {T} smell like?',
  'Is it too late for me to get into {T}?',
  'How does {T} compare to {M}?',
  'Will there be snacks next time?',
  'What’s the one thing we should all do tomorrow?',
  'Can {M} and {T} ever truly coexist?',
  'What would {M} think of this talk?',
  'Who else knows about this?',
  'Can we see the slide with the {M} again?',
];

// ---- ratings & awards ------------------------------------------------------

/** Labels for an average rating, by band (index = rounded stars - 1). */
export const RATING_LABELS: readonly string[] = [
  'Back to the drawing board',
  'Polite applause',
  'Solid all-hands energy',
  'Standing ovation',
  'Keynote legend',
];

/** Applause-meter levels (index = stars - 1). */
export const APPLAUSE_LEVELS: readonly string[] = ['Crickets', 'Polite', 'Warm', 'Loud', 'Roaring'];

export function ratingLabel(average: number | null): string {
  if (average === null) return 'No votes — the crowd was speechless';
  const i = Math.max(0, Math.min(RATING_LABELS.length - 1, Math.round(average) - 1));
  return RATING_LABELS[i]!;
}
