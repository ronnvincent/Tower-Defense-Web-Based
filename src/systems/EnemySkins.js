import { ENEMY_SKINS, ENEMY_PALETTES, ENEMY_TIERS } from '../data/spireManifest.js';

/**
 * Enemy skins.
 *
 * Three independent axes make the horde look different on every battlefield and
 * in every wave, without a second art pack:
 *
 *   biome — `ENEMY_SKINS` ships a re-graded sheet per creep (desert, ice,
 *           volcanic), so a scarab from Sunscorch Mesa is sand-bleached.
 *   tier  — waves escalate through three baked broods: base (waves 1-2), elite
 *           (3-4, brighter with a gold contour) and champion (5+, scorched with
 *           an ember contour grown a pixel outwards). Tiers are separate sheets,
 *           so the change survives on screen instead of hiding inside a tint.
 *   palette — every Spire strip also holds three colour variants per clip
 *           (rows 0-2 / 3-5 / 6-8); each pair of waves uses one, so wave 1 and
 *           wave 3 are still different broods of the same creature.
 *
 * Everything here is pure: the same (type, wave, theme) always resolves to the
 * same skin, which is what the tests pin down.
 */

/** Palette row-block for a wave: waves 1-2 -> 0, 3-4 -> 1, 5-6 -> 2, then repeat. */
export function paletteForWave(waveNumber) {
  const wave = Math.max(1, Math.floor(Number(waveNumber) || 1));
  return Math.floor((wave - 1) / 2) % ENEMY_PALETTES;
}

/**
 * Escalation tier for a wave: 1-2 base, 3-4 elite, 5+ champion.
 * Monotonic on purpose — a run should feel like it is getting harder, and the
 * champion brood never goes back to plain.
 */
export function tierForWave(waveNumber) {
  const wave = Math.max(1, Math.floor(Number(waveNumber) || 1));
  return Math.min(ENEMY_TIERS.length - 1, Math.floor((wave - 1) / 2));
}

/**
 * Texture key for a creature at a wave tier.
 *
 * Escalation is a creep feature: bosses are already unique set-pieces drawn for
 * one level, so they keep their single heroic sheet instead of inheriting an
 * ember contour that would fight their element.
 */
/**
 * Duel arenas re-use a biome's horde regrade rather than shipping a fourth
 * enemy sheet per archetype: the *ground* is what makes an arena distinct, and
 * an ember brood on black basalt reads better than a new set of sprites nobody
 * can tell apart.
 */
export const ENEMY_THEME_ALIAS = Object.freeze({
  caldera: 'volcanic',
  glacier: 'ice',
  oasis: 'desert',
});

export function textureFor(typeKey, theme, tier = 0) {
  const perTheme = ENEMY_SKINS[typeKey];
  if (!perTheme) return `enemy-${typeKey}`;
  const index = Math.max(0, Math.min(ENEMY_TIERS.length - 1, Math.floor(tier)));
  const key = ENEMY_THEME_ALIAS[theme] || theme;
  const tiers = (key && perTheme[key]) || perTheme.grassland;
  return (tiers && tiers[index]) || `enemy-${typeKey}`;
}

/**
 * @returns {{
 *   texture:string, palette:number, tier:number, scale:number, glow:number,
 *   animPrefix:string, fallbackPrefix:string
 * }}
 *   `animPrefix` is the palette-specific clip prefix; `fallbackPrefix` is the
 *   bare, palette-0 alias used when the variant clips were never built.
 */
export function skinFor(typeKey, waveNumber, theme) {
  const tier = tierForWave(waveNumber);
  const palette = paletteForWave(waveNumber);
  const texture = textureFor(typeKey, theme, tier);
  const presentation = ENEMY_TIERS[tier] || { scale: 1, glow: 0 };
  return {
    texture,
    palette,
    tier,
    scale: presentation.scale,
    glow: presentation.glow,
    animPrefix: `${texture}-v${palette}`,
    fallbackPrefix: texture,
  };
}

/**
 * Brood accent per tier. Used for the spawn burst, the tier glow and the portal
 * glow, so a wave announces its brood before the first creep is fully on screen.
 */
export const TIER_ACCENTS = [0x8be06b, 0xffd166, 0xff6a2b];

/** Accent colour (0xRRGGBB) of the brood a wave belongs to. */
export function waveAccent(waveNumber) {
  return TIER_ACCENTS[tierForWave(waveNumber)];
}
