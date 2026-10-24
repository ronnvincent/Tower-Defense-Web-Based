/**
 * Achievements — the long-tail checklist.
 *
 * Every entry is data, not a function: a `metric` on the lifetime stats object
 * and a `target`. That keeps the definitions serialisable, lets the menu show
 * real progress bars ("612 / 1000 kills") and means one evaluator covers all of
 * them. Gems are the payout so achievements feed the forge economy instead of
 * inflating gold mid-run.
 *
 * Metrics are tracked in `ProgressStore.profile.stats` (see Progression.js).
 */

export const ACHIEVEMENT_CATEGORIES = ['combat', 'defense', 'campaign', 'endurance', 'daily'];

export const ACHIEVEMENTS = [
  // ---------------------------------------------------------------- combat
  {
    id: 'first-blood',
    name: 'First Blood',
    desc: 'Defeat your first enemy.',
    metric: 'kills',
    target: 1,
    gems: 1,
    icon: '🩸',
    category: 'combat',
  },
  {
    id: 'hundred-cuts',
    name: 'Hundred Cuts',
    desc: 'Defeat 100 enemies across all runs.',
    metric: 'kills',
    target: 100,
    gems: 2,
    icon: '⚔️',
    category: 'combat',
  },
  {
    id: 'thousand-blades',
    name: 'Thousand Blades',
    desc: 'Defeat 1,000 enemies.',
    metric: 'kills',
    target: 1000,
    gems: 5,
    icon: '🗡️',
    category: 'combat',
  },
  {
    id: 'chain-gang',
    name: 'Chain Gang',
    desc: 'Land a 3-kill chain.',
    metric: 'bestChain',
    target: 3,
    gems: 1,
    icon: '🔗',
    category: 'combat',
  },
  {
    id: 'chain-ten',
    name: 'Perfect Rhythm',
    desc: 'Land a 10-kill chain for a 2× payout.',
    metric: 'bestChain',
    target: 10,
    gems: 3,
    icon: '🎯',
    category: 'combat',
  },
  {
    id: 'chain-twenty',
    name: 'Unbroken',
    desc: 'Land a 20-kill chain.',
    metric: 'bestChain',
    target: 20,
    gems: 6,
    icon: '🌀',
    category: 'combat',
  },
  {
    id: 'call-early-5',
    name: 'Tempo Player',
    desc: 'Call a wave early 5 times.',
    metric: 'earlyCalls',
    target: 5,
    gems: 2,
    icon: '⏩',
    category: 'combat',
  },
  {
    id: 'call-early-25',
    name: 'No Time To Breathe',
    desc: 'Call a wave early 25 times.',
    metric: 'earlyCalls',
    target: 25,
    gems: 5,
    icon: '⚡',
    category: 'combat',
  },

  // --------------------------------------------------------------- defense
  {
    id: 'first-stone',
    name: 'First Stone',
    desc: 'Build your first defence.',
    metric: 'towersBuilt',
    target: 1,
    gems: 1,
    icon: '🧱',
    category: 'defense',
  },
  {
    id: 'master-builder',
    name: 'Master Builder',
    desc: 'Build 100 defences.',
    metric: 'towersBuilt',
    target: 100,
    gems: 3,
    icon: '🏗️',
    category: 'defense',
  },
  {
    id: 'full-dock',
    name: 'Full Dock',
    desc: 'Have all 6 defensive towers standing at once.',
    metric: 'maxTowersAtOnce',
    target: 6,
    gems: 3,
    icon: '🏰',
    category: 'defense',
  },
  {
    id: 'wall-of-the-realm',
    name: 'Wall of the Realm',
    desc: 'Raise 10 palisades.',
    metric: 'palisadesBuilt',
    target: 10,
    gems: 3,
    icon: '🚧',
    category: 'defense',
  },
  {
    id: 'upgrade-habit',
    name: 'Never Settle',
    desc: 'Buy 10 tower upgrades.',
    metric: 'upgradesBought',
    target: 10,
    gems: 2,
    icon: '⬆️',
    category: 'defense',
  },
  {
    id: 'hold-the-line',
    name: 'Hold the Line',
    desc: 'Win a level without losing a single point of core health.',
    metric: 'flawlessVictories',
    target: 1,
    gems: 5,
    icon: '🛡️',
    category: 'defense',
  },

  // -------------------------------------------------------------- campaign
  {
    id: 'first-victory',
    name: 'The Bastion Holds',
    desc: 'Win your first battle.',
    metric: 'victories',
    target: 1,
    gems: 3,
    icon: '🏆',
    category: 'campaign',
  },
  {
    id: 'first-three-star',
    name: 'Flawless',
    desc: 'Earn 3★ on any level.',
    metric: 'threeStarVictories',
    target: 1,
    gems: 4,
    icon: '⭐',
    category: 'campaign',
  },
  {
    id: 'all-stars',
    name: 'All the Stars',
    desc: 'Hold 12 campaign stars at once.',
    metric: 'starsTotal',
    target: 12,
    gems: 8,
    icon: '🌟',
    category: 'campaign',
  },
  {
    id: 'boss-slayer',
    name: 'Giant Killer',
    desc: 'Defeat your first boss.',
    metric: 'bossesKilled',
    target: 1,
    gems: 2,
    icon: '🐉',
    category: 'campaign',
  },
  {
    id: 'boss-hunter',
    name: 'Boss Hunter',
    desc: 'Defeat 10 bosses.',
    metric: 'bossesKilled',
    target: 10,
    gems: 6,
    icon: '🔥',
    category: 'campaign',
  },

  // ------------------------------------------------------------- endurance
  {
    id: 'endless-10',
    name: 'Ten Deep',
    desc: 'Reach wave 10 in Endless Siege.',
    metric: 'endlessBestWave',
    target: 10,
    gems: 3,
    icon: '∞',
    category: 'endurance',
  },
  {
    id: 'endless-25',
    name: 'Into the Abyss',
    desc: 'Reach wave 25 in Endless Siege.',
    metric: 'endlessBestWave',
    target: 25,
    gems: 7,
    icon: '🌌',
    category: 'endurance',
  },
  {
    id: 'endless-50',
    name: 'Fifty Waves Later',
    desc: 'Reach wave 50 in Endless Siege.',
    metric: 'endlessBestWave',
    target: 50,
    gems: 10,
    icon: '🏔️',
    category: 'endurance',
  },

  // ----------------------------------------------------------------- daily
  {
    id: 'daily-first',
    name: 'Daily Regular',
    desc: 'Clear a Daily Challenge.',
    metric: 'dailyWins',
    target: 1,
    gems: 3,
    icon: '📅',
    category: 'daily',
  },
  {
    id: 'daily-streak-7',
    name: 'Seven Days Strong',
    desc: 'Keep a 7-day Daily streak.',
    metric: 'dailyStreak',
    target: 7,
    gems: 8,
    icon: '🗓️',
    category: 'daily',
  },
];

export const ACHIEVEMENT_GEM_TOTAL = ACHIEVEMENTS.reduce((sum, a) => sum + a.gems, 0);

export function getAchievement(id) {
  return ACHIEVEMENTS.find((a) => a.id === id) || null;
}
