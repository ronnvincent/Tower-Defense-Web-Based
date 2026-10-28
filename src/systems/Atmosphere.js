/**
 * Atmosphere.js — the weather and the light of a battlefield.
 *
 * The graphics profile used to be subtractive: "high" was simply the absence of
 * the downgrades `balanced` and `performance` apply. That made the top setting
 * invisible — a player who chose it got the same screen everyone else got.
 *
 * This is the additive half. At high — and only at high, so no other profile
 * pays for it — a battlefield gains two things it never had:
 *
 *   weather   slow, sparse motes that belong to the biome: pollen over the
 *             marches, sand over the mesa, snow over the hollow, embers over the
 *             caldera. Screen-wide but world-anchored, so panning and zooming
 *             move them the way they would move in the world.
 *
 *   light     a vignette and a tinted wash from the sky, applied as a CSS layer
 *             (`#battle-atmosphere`) that carries the biome's own `fog` colour.
 *             CSS because it is one gradient, it is free, and it cannot be
 *             scaled wrongly by the camera rig the way a world sprite would.
 *
 * Rules this module keeps:
 *   - tame by construction: one particle at a time, long lifespans, low alpha.
 *     Nothing flashed, nothing strobes, and the count is bounded by frequency
 *     × lifespan, not by the frame rate.
 *   - nothing here touches combat. No damage, no pathing, no wave logic.
 *   - absent in Node: every reader guards for a scene without particles, so the
 *     unit tests never need Phaser.
 */

/**
 * One weather recipe per biome. `kind` is what the CSS layer reads too, so the
 * wash and the motes always agree about which map this is.
 *
 * `frequency` is milliseconds between births at density 1 (higher = sparser).
 * `light` is the colour of the sky wash in the CSS layer.
 */
export const WEATHER_BY_THEME = Object.freeze({
  grassland: {
    kind: 'pollen',
    tint: 0xfff2c4,
    frequency: 190,
    lifespan: { min: 6000, max: 10000 },
    speedX: { min: -14, max: 14 },
    speedY: { min: 6, max: 16 },
    scale: { start: 0.22, end: 0.42 },
    alpha: { start: 0.55, end: 0 },
    blendMode: 'NORMAL',
    light: 'rgba(255, 236, 184, 0.16)',
  },
  desert: {
    kind: 'sand',
    tint: 0xf3d7a0,
    frequency: 187,
    lifespan: { min: 4200, max: 7600 },
    speedX: { min: 26, max: 64 },
    speedY: { min: 2, max: 12 },
    scale: { start: 0.12, end: 0.264 },
    alpha: { start: 0.36, end: 0 },
    blendMode: 'NORMAL',
    light: 'rgba(255, 224, 160, 0.18)',
  },
  volcanic: {
    kind: 'ember',
    tint: 0xffa757,
    frequency: 359,
    lifespan: { min: 3800, max: 6800 },
    speedX: { min: -10, max: 10 },
    speedY: { min: -26, max: -8 },
    scale: { start: 0.165, end: 0.062 },
    alpha: { start: 0.55, end: 0 },
    blendMode: 'ADD',
    light: 'rgba(255, 150, 90, 0.18)',
  },
  caldera: {
    kind: 'ember',
    tint: 0xff9a4d,
    frequency: 328,
    lifespan: { min: 3600, max: 6400 },
    speedX: { min: -12, max: 12 },
    speedY: { min: -28, max: -10 },
    scale: { start: 0.18, end: 0.062 },
    alpha: { start: 0.55, end: 0 },
    blendMode: 'ADD',
    light: 'rgba(255, 140, 80, 0.18)',
  },
  ice: {
    kind: 'snow',
    tint: 0xe6f6ff,
    frequency: 172,
    lifespan: { min: 7000, max: 11000 },
    speedX: { min: -12, max: 12 },
    speedY: { min: 16, max: 34 },
    scale: { start: 0.135, end: 0.295 },
    alpha: { start: 0.55, end: 0 },
    blendMode: 'NORMAL',
    light: 'rgba(190, 226, 255, 0.18)',
  },
  glacier: {
    kind: 'snow',
    tint: 0xdcf2ff,
    frequency: 156,
    lifespan: { min: 7000, max: 11000 },
    speedX: { min: -10, max: 10 },
    speedY: { min: 18, max: 38 },
    scale: { start: 0.135, end: 0.279 },
    alpha: { start: 0.55, end: 0 },
    blendMode: 'NORMAL',
    light: 'rgba(200, 232, 255, 0.18)',
  },
  crystal: {
    kind: 'motes',
    tint: 0xcbb4ff,
    frequency: 250,
    lifespan: { min: 5200, max: 9000 },
    speedX: { min: -10, max: 10 },
    speedY: { min: 4, max: 14 },
    scale: { start: 0.15, end: 0.279 },
    alpha: { start: 0.51, end: 0 },
    blendMode: 'ADD',
    light: 'rgba(196, 168, 255, 0.18)',
  },
  ashen: {
    kind: 'ash',
    tint: 0xc6ced9,
    frequency: 203,
    lifespan: { min: 6000, max: 10000 },
    speedX: { min: -18, max: 18 },
    speedY: { min: 10, max: 24 },
    scale: { start: 0.12, end: 0.248 },
    alpha: { start: 0.4, end: 0 },
    blendMode: 'NORMAL',
    light: 'rgba(190, 200, 214, 0.15)',
  },

  // The four later biomes. Same rules: sparse, slow, low alpha.
  moor: {
    kind: 'mist',
    tint: 0xc3b0e8,
    frequency: 164,
    lifespan: { min: 6200, max: 11000 },
    speedX: { min: -10, max: 14 },
    speedY: { min: 1, max: 7 },
    scale: { start: 0.21, end: 0.465 },
    alpha: { start: 0.3, end: 0 },
    blendMode: 'NORMAL',
    light: 'rgba(150, 128, 190, 0.18)',
  },
  highland: {
    kind: 'gust',
    tint: 0xe9f3f7,
    frequency: 203,
    lifespan: { min: 3200, max: 6000 },
    speedX: { min: 70, max: 130 },
    speedY: { min: -8, max: 6 },
    scale: { start: 0.105, end: 0.232 },
    alpha: { start: 0.28, end: 0 },
    blendMode: 'NORMAL',
    light: 'rgba(226, 240, 246, 0.18)',
  },
  marsh: {
    kind: 'midge',
    tint: 0xcfe9c2,
    frequency: 265,
    lifespan: { min: 3200, max: 6200 },
    speedX: { min: -20, max: 20 },
    speedY: { min: -12, max: 8 },
    scale: { start: 0.09, end: 0.186 },
    alpha: { start: 0.34, end: 0 },
    blendMode: 'NORMAL',
    light: 'rgba(190, 220, 170, 0.15)',
  },
  oasis: {
    kind: 'dust',
    tint: 0xffe3ab,
    frequency: 218,
    lifespan: { min: 5000, max: 9000 },
    speedX: { min: 12, max: 44 },
    speedY: { min: -6, max: 10 },
    scale: { start: 0.105, end: 0.232 },
    alpha: { start: 0.32, end: 0 },
    blendMode: 'NORMAL',
    light: 'rgba(255, 226, 168, 0.18)',
  },
});

/** The biome's recipe, or null when the theme has none. */
export function weatherFor(theme) {
  const id = typeof theme === 'string' ? theme : theme?.id;
  return WEATHER_BY_THEME[id] || null;
}

/**
 * Add the motes to a battle scene and return a handle that removes them.
 *
 * `density` comes from the graphics profile: 1 at high, 0 everywhere else (in
 * which case this returns null and no emitter is ever built). The particle
 * count is bounded by the lifespan and the frequency — roughly 40 at high — so
 * the weather is a handful of slow motes, never a storm.
 */
export function buildAtmosphere(scene, { theme = null, map = null, density = 1, tileSize = 64 } = {}) {
  if (!scene?.add?.particles || !scene?.textures?.exists) return null;
  const recipe = weatherFor(theme);
  if (!recipe || !(density > 0)) return null;
  const texture = ['fx-glow', 'fx-spark-soft', 'fx-spark'].find((key) => scene.textures.exists(key));
  if (!texture) return null;

  const width = Math.max(1, (map?.cols ?? 20) * tileSize);
  const height = Math.max(1, (map?.rows ?? 14) * tileSize);
  const rising = recipe.kind === 'ember';

  const emitter = scene.add.particles(0, 0, texture, {
    emitting: true,
    quantity: 1,
    frequency: Math.max(90, Math.round(recipe.frequency / density)),
    lifespan: recipe.lifespan,
    speedX: recipe.speedX,
    speedY: recipe.speedY,
    scale: recipe.scale,
    alpha: recipe.alpha,
    tint: recipe.tint,
    blendMode: recipe.blendMode,
    // Births spread across the whole board, just off the top (or the bottom,
    // for embers, which rise). World coordinates, so the camera rig moves the
    // weather with the ground it belongs to.
    x: { min: 0, max: width },
    y: rising ? { min: height - 6, max: height + 18 } : { min: -26, max: -6 },
  });
  emitter.setDepth(60);

  const destroy = () => {
    try {
      emitter.stop?.();
      emitter.destroy?.();
    } catch {
      /* the scene may already be tearing down */
    }
  };
  scene.events?.once?.('shutdown', destroy);

  return { emitter, recipe, destroy };
}

/**
 * Paint the biome's light onto the DOM layer.
 *
 * The colour is the theme's own `fog` — the same value the world map uses for
 * the region wash — so the battle and its map always agree about the weather.
 * Returns the layer, or null when the document has no such layer (tests, the
 * menu scene).
 */
export function applyAtmosphereSkin(doc, theme) {
  const layer = doc?.getElementById?.('battle-atmosphere');
  if (!layer) return null;
  const recipe = weatherFor(theme);
  layer.dataset.weather = recipe?.kind || 'none';
  layer.style.setProperty('--battle-fog', theme?.fog || 'rgba(10, 16, 24, 0.3)');
  layer.style.setProperty('--battle-light', recipe?.light || 'rgba(255, 236, 200, 0.08)');
  layer.classList.remove('hidden');
  return layer;
}

/** Take the light away again when the battle scene shuts down. */
export function clearAtmosphereSkin(doc) {
  const layer = doc?.getElementById?.('battle-atmosphere');
  if (!layer) return null;
  layer.classList.add('hidden');
  layer.dataset.weather = 'none';
  return layer;
}
