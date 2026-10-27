/**
 * PlayerMetrics.js — the four numbers the shared ranking is built from.
 *
 * The ranking is not "who played longest": it is a reading of the save file,
 * computed here so the shop, the ledger and the tests all agree.
 *
 *   power   one number for "how strong is this commander right now". It counts
 *           the things that are permanent and expensive — hero ranks, companion
 *           levels, relics, stars, medals, gems, the endless best wave — and
 *           deliberately NOT spendable gold, because buying something would
 *           then lower your power.
 *   level   commander level: one per realm cleared, plus one per three extra
 *           stars above a first clear. Campaign progress, not power.
 *   stars   total campaign stars (0..15).
 *   bestScore  the best single run, campaign or endless.
 *   waves   best endless wave.
 *   achievements  medals unlocked (the ledger counts its own rows, this is the
 *           number the client sends as a hint).
 *
 * Every weight is here, in one frozen table, so tuning the ladder is a one-line
 * change and a test can pin it.
 */

export const POWER_WEIGHTS = Object.freeze({
  heroRank: 120,
  petLevel: 90,
  relicLevel: 60,
  star: 100,
  achievement: 150,
  gem: 2,
  endlessWave: 40,
});

const STAR_MAX = 3;

function positiveInt(value) {
  const number = Math.floor(Number(value));
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function sumValues(map) {
  if (!map || typeof map !== 'object') return 0;
  return Object.values(map).reduce((total, value) => total + positiveInt(value), 0);
}

function countKeys(map) {
  if (!map || typeof map !== 'object') return 0;
  return Object.keys(map).length;
}

/** Total campaign stars from a save's `stars` map. */
export function totalStars(profile = {}) {
  const stars = profile.stars && typeof profile.stars === 'object' ? profile.stars : {};
  return Object.values(stars).reduce((total, value) => {
    const rating = Math.min(STAR_MAX, positiveInt(value));
    return total + rating;
  }, 0);
}

/**
 * Commander level, 1..9 on a five-realm campaign.
 *
 * One level per realm that has been cleared at all, then one more for every
 * three stars collected above that first star. A 5-realm, 15-star save is level
 * 9; a brand-new save is level 1.
 */
export function commanderLevel(profile = {}) {
  const stars = profile.stars && typeof profile.stars === 'object' ? profile.stars : {};
  const cleared = Object.values(stars).filter((value) => positiveInt(value) > 0).length;
  const allStars = totalStars(profile);
  const extra = Math.max(0, allStars - cleared);
  return 1 + cleared + Math.floor(extra / 3);
}

/** The six numbers the ledger stores, computed from one save. */
export function playerMetrics(profile = {}) {
  const achievements = Array.isArray(profile.achievements)
    ? new Set(profile.achievements.filter((id) => typeof id === 'string' && id)).size
    : 0;
  const bestScores = profile.bestScore && typeof profile.bestScore === 'object' ? profile.bestScore : {};
  const bestScore = Math.max(0, ...Object.values(bestScores).map(positiveInt), positiveInt(profile.endlessBestScore));

  const heroPower = sumValues(profile.heroRanks) * POWER_WEIGHTS.heroRank;
  const petPower = sumValues(profile.petLevels) * POWER_WEIGHTS.petLevel;
  const relicPower = sumValues(profile.relics) * POWER_WEIGHTS.relicLevel;
  const starPower = totalStars(profile) * POWER_WEIGHTS.star;
  const medalPower = achievements * POWER_WEIGHTS.achievement;
  const gemPower = positiveInt(profile.gems) * POWER_WEIGHTS.gem;
  const wavePower = positiveInt(profile.endlessBestWave) * POWER_WEIGHTS.endlessWave;

  return {
    power: heroPower + petPower + relicPower + starPower + medalPower + gemPower + wavePower,
    level: commanderLevel(profile),
    stars: totalStars(profile),
    bestScore,
    waves: positiveInt(profile.endlessBestWave),
    achievements,
    // Kept for the ledger's own display and for tests; not a column.
    breakdown: {
      heroRank: heroPower,
      petLevel: petPower,
      relicLevel: relicPower,
      star: starPower,
      achievement: medalPower,
      gems: gemPower,
      endlessWave: wavePower,
    },
    clears: countKeys(profile.stars || {}),
  };
}

/** "1,240" — the ranking prints thousands, not exponents. */
export function formatMetric(value) {
  const number = Math.floor(Number(value));
  if (!Number.isFinite(number) || number <= 0) return '0';
  return number.toLocaleString('en-US');
}
