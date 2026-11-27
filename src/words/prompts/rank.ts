// Rank It criteria. Shown as "Rank from MOST to LEAST: <criterion>" over five
// random items that can be anything (a toaster, Beyoncé, nostalgia), so every
// criterion has to make sense for any noun or phrase. Lower-case phrases that
// complete "most ... least".
export const RANK_CRITERIA: readonly string[] = [
  // Survival and usefulness
  'useful on a desert island', 'likely to survive a zombie apocalypse', 'useful in an emergency',
  'useful in space', 'essential for a good vacation', 'helpful during a power outage',
  'useful at trivia night', 'helpful on the first day of school', 'useful to a pirate',
  'useful in a haunted house', 'likely to survive being dropped',
  'useful when stuck in an elevator', 'helpful when moving to a new home',
  'useful on a camping trip', 'likely to get you out of trouble',
  // Danger and trouble
  'dangerous', 'likely to win a fight', 'suspicious if found in your car',
  'likely to get you arrested', 'likely to cause an injury', 'likely to be banned',
  'likely to start an argument', 'likely to ruin a family dinner', 'likely to cause a traffic jam',
  'likely to set off a smoke alarm', 'likely to get you detention',
  'likely to be confiscated at the airport', 'likely to bite you', 'cursed',
  // Money and status
  'expensive', 'fancy', 'likely to be worth millions', 'likely to be stolen', 'high-maintenance',
  'likely to be invited to a royal wedding', 'likely to appear in a fancy restaurant',
  'likely to be sold at a gas station', 'likely to be at a yard sale',
  // Senses and physical
  'heavy', 'loud', 'smelly', 'sticky', 'fragile', 'shiny', 'fluffy', 'slippery', 'sharp', 'squishy',
  'colorful', 'sugary', 'likely to fit in your pocket', 'likely to melt',
  'likely to make you sneeze', 'likely to smell like feet', 'tempting to touch', 'fun to hug',
  'fun to throw', 'likely to break', 'likely to taste good', 'noisy at 3 a.m.',
  'likely to need batteries', 'likely to float',
  // Feelings
  'likely to make a toddler cry', 'terrifying', 'relaxing', 'stressful', 'annoying', 'romantic',
  'nostalgic', 'inspiring', 'wholesome', 'satisfying', 'likely to make you cry', 'confusing',
  'awkward', 'embarrassing to be seen with', 'likely to appear in a nightmare',
  'likely to give you goosebumps', 'good for your mental health', 'annoying on a long flight',
  'likely to make a grandparent smile', 'likely to cheer you up on a Monday',
  // Personality
  'trustworthy', 'sneaky', 'mysterious', 'dramatic', 'chaotic', 'polite', 'sophisticated',
  'childish', 'grown-up', 'tough', 'cool', 'weird', 'good at keeping secrets',
  'good at hide and seek', 'likely to be a spy', 'likely to have a secret identity',
  'likely to have a dark side', 'likely to be late', 'likely to win a staring contest',
  'likely to win a talent show', 'likely to be the main character', 'likely to be a movie villain',
  'likely to tell a bad joke',
  // Popularity and culture
  'overrated', 'underrated', 'popular with teenagers', 'loved by grandparents',
  'likely to go viral', 'likely to be a meme', 'likely to win an Oscar', 'likely to be on the news',
  'likely to have a fan club', 'likely to be on a T-shirt', 'likely to make a good band name',
  'likely to have a theme song', 'likely to be described as iconic',
  'likely to be famous in 100 years', 'likely to be forgotten', 'likely to be canceled online',
  'photogenic', 'likely to be on a postcard', 'likely to be described as very British',
  'likely to be described as very American', 'likely to be described as very French',
  'old-fashioned', 'futuristic', 'likely to be from the 1980s', 'ancient', 'rare',
  // Stories and imagination
  'likely to be in a horror movie', 'likely to appear in a fairy tale', 'likely to be in a cartoon',
  'likely to give someone superpowers', 'magical', 'likely to be a conspiracy theory',
  'likely to be in a James Bond movie', 'likely to exist on another planet',
  'likely to haunt a house', 'likely to be in a treasure chest', 'likely to appear in a dream',
  'likely to be invented by accident', 'likely to end up in a museum',
  // Everyday life
  "likely to be in a grandparent's house", 'likely to be at the bottom of a purse',
  "likely to be in a teenager's bedroom", 'likely to be found at a wedding',
  "likely to be at a kid's birthday party", 'likely to be at the beach',
  'likely to be in a time capsule', "likely to be someone's password", 'hard to get rid of',
  'hard to find', 'hard to draw', 'hard to spell', 'hard to explain to an alien',
  'fun to say out loud', 'complicated', 'educational', 'healthy', 'eco-friendly',
  'important to humanity', 'deserving of a national holiday', 'likely to need a license',
  'likely to bring good luck', 'likely to make a good pet', 'likely to make a good mascot',
  'likely to impress a cat', 'likely to make a dog bark', 'likely to be eaten by a goat',
  'tasty to a shark', 'fun at a party', 'likely to be a secret ingredient',
];

// Adults-only criteria for After Dark rounds. Cheeky, not explicit.
export const RANK_CRITERIA_SPICY: readonly string[] = [
  'likely to ruin a first date', 'awkward to explain to your parents',
  'embarrassing to be caught with', 'likely to be in a hotel bedside drawer',
  'likely to end up at a bachelor party', 'likely to be in a bachelorette goodie bag',
  'likely to get you a second date', 'flirty', 'sexy', 'likely to cause a hangover',
  'likely to happen in Vegas', 'likely to be deleted from your history', 'scandalous',
  'likely to be in a steamy romance novel', 'awkward at a family dinner',
  'likely to lead to a walk of shame', 'likely to be smuggled into a music festival', 'kinky',
  'naughty', 'likely to make a grandparent blush', 'tempting after three drinks',
  'regrettable the next morning', 'likely to get you kicked out of a bar',
  'likely to come up in pillow talk', 'risqué', 'likely to be in a celebrity scandal',
  'suggestive-sounding', 'likely to end with a winky face', "likely to be left at an ex's place",
  'seductive', 'likely to get you blocked', 'good as a pickup line', 'likely to set the mood',
  'likely to kill the mood', 'likely to be a turn-on', 'alarming on a dating profile',
  'likely to happen at an office party', "likely to be in a best man's speech",
  'likely to cause a breakup', 'likely to be bought while drunk',
  'likely to make the neighbors complain', 'likely to happen in a hot tub',
  'likely to be in a Love Island villa', 'likely to be a safe word',
  'likely to be confessed at 2 a.m.', 'likely to need a cold shower afterward',
];
