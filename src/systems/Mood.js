/**
 * Mood — the light of a battle, as a function of how far the run has come.
 *
 * The prompt asks for daylight early, golden hour mid-game and a red-purple dusk
 * for the boss wave, cross-faded. Doing that with a Phaser colour matrix means a
 * shader pass over the whole canvas; doing it with one CSS custom property on
 * the atmosphere layer means the compositor cross-fades three gradients for
 * free, and the layer is absent entirely on the lower graphics profiles.
 *
 * This module is the arithmetic only: which mood, and what colours belong to it.
 * Nothing here knows about the DOM or Phaser, so the ramp can be tested.
 */

/** The three moods, in the order a run walks through them. */
export const MOODS = Object.freeze({
  day: {
    key: 'day',
    label: 'Daylight',
    /** Sky wash over the board. */
    light: 'rgba(255, 244, 214, 0.1)',
    /** Flat wash over the whole board; this is what the player reads as "the light changed". */
    tint: 'rgba(255, 246, 214, 0.04)',
    /** The low band, warmed where the sun sits. */
    fog: 'rgba(116, 134, 92, 0.14)',
    /** Edge vignette strength; dusk is allowed more. */
    vignette: 0.34,
  },
  golden: {
    key: 'golden',
    label: 'Golden hour',
    light: 'rgba(255, 176, 84, 0.3)',
    tint: 'rgba(255, 168, 84, 0.12)',
    fog: 'rgba(150, 88, 30, 0.34)',
    vignette: 0.42,
  },
  dusk: {
    key: 'dusk',
    label: 'Dusk',
    light: 'rgba(196, 62, 96, 0.32)',
    tint: 'rgba(120, 48, 108, 0.2)',
    fog: 'rgba(52, 16, 52, 0.5)',
    vignette: 0.52,
  },
});

const ORDER = ['day', 'golden', 'dusk'];

/**
 * Which light a wave plays in.
 *
 * A boss wave is always dusk, whatever its number — the boss is the dramatic
 * beat, and the tint is one of the ways the game says so before the banner
 * lands. A short run (three waves) still walks the whole ramp; a long one holds
 * golden hour for the middle third instead of flickering between moods.
 *
 * @param {number} waveNumber 1-based wave about to start
 * @param {number} totalWaves waves in the run
 * @param {{ boss?: boolean }} [options]
 * @returns {{ key:string, label:string, light:string, fog:string, vignette:number }}
 */
export function moodForWave(waveNumber, totalWaves, { boss = false } = {}) {
  if (boss) return MOODS.dusk;
  const total = Math.max(1, Math.round(Number(totalWaves) || 1));
  const wave = Math.max(1, Math.min(total, Math.round(Number(waveNumber) || 1)));
  const progress = (wave - 1) / Math.max(1, total - 1);
  const index = progress < 0.34 ? 0 : progress < 0.72 ? 1 : 2;
  return MOODS[ORDER[index]];
}

/**
 * The two custom properties the atmosphere layer reads, plus how far the
 * vignette should close in.
 *
 * Returned as an object rather than a string so a test can assert each value
 * without parsing CSS.
 */
export function moodVars(mood) {
  const safe = MOODS[mood?.key] || MOODS.day;
  return {
    '--battle-light': safe.light,
    '--battle-fog': safe.fog,
    '--battle-tint': safe.tint,
    '--battle-vignette': String(safe.vignette),
    'data-mood': safe.key,
  };
}
