/**
 * EnemyCard — the readout a player gets by pointing at a creep.
 *
 * The rule is "a card that answers the question the player is asking": *what is
 * this, how tough is it, how fast, and what hurts it?* Everything here is read
 * from the enemy instance that is already on the board, so the card can never
 * quote a stat the combat maths does not use.
 *
 * Kept as pure functions (no DOM, no Phaser) so the numbers can be asserted.
 */

/** Damage types the game actually has, in the order the card lists them. */
export const DAMAGE_LABELS = Object.freeze({
  physical: 'Physical',
  piercing: 'Piercing',
  magic: 'Magic',
  lightning: 'Lightning',
  frost: 'Frost',
  true: 'True',
});

/**
 * One line describing what this creep shrugs off or hates.
 *
 * Resistances are fractions of incoming damage *ignored* (`0.35` = 35 % less),
 * so the card prints them the way a player reads them. A negative value is a
 * weakness and is printed as a bonus. Nothing is invented: an enemy with no
 * table gets "No special armour" rather than a guess.
 *
 * @param {object} enemy
 * @returns {{ text: string, tone: 'resist'|'weak'|'none' }}
 */
export function resistanceLine(enemy) {
  const table = enemy?.def?.resistances || enemy?.resistances || null;
  if (!table || typeof table !== 'object') return { text: 'No special armour', tone: 'none' };
  const entries = Object.entries(table).filter(([, value]) => Number.isFinite(Number(value)) && Number(value) !== 0);
  if (!entries.length) return { text: 'No special armour', tone: 'none' };
  const resists = entries.filter(([, value]) => Number(value) > 0);
  const weak = entries.filter(([, value]) => Number(value) < 0);
  const fmt = ([type, value]) => `${DAMAGE_LABELS[type] || type} ${Math.round(Math.abs(Number(value)) * 100)}%`;
  if (weak.length) return { text: `Weak to ${weak.map(fmt).join(', ')}`, tone: 'weak' };
  return { text: `Resists ${resists.map(fmt).join(', ')}`, tone: 'resist' };
}

/**
 * The whole card, or null when there is nothing to show.
 *
 * `speed` is printed in tiles per second: the raw number is pixels per second in
 * the sim, which means nothing to a player, and the card is the only place a
 * player ever sees it.
 *
 * @param {object} enemy live enemy instance
 * @param {number} [tileSize] world pixels per tile
 * @returns {null | { name:string, hp:number, max:number, pct:number, boss:boolean,
 *   speed:number, armor:number, traits:string[], resistance:{text:string,tone:string},
 *   flying:boolean, shielded:boolean }}
 */
export function enemyCard(enemy, tileSize = 64) {
  if (!enemy || enemy.isDead || enemy.reachedBase) return null;
  const max = Math.max(1, Math.round(enemy.maxHealth ?? enemy.health ?? 1));
  const hp = Math.max(0, Math.round(enemy.health ?? 0));
  const tilesPerSecond = Math.max(0, Number(enemy.speed ?? 0)) / Math.max(1, Number(tileSize) || 64);
  const traits = [];
  if (enemy.traits?.phalanx) traits.push('Phalanx');
  if (enemy.traits?.adaptive) traits.push('Adaptive plate');
  if (enemy.traits?.shield) traits.push('Shielded');
  if (enemy.isBoss) traits.push('Boss');
  return {
    name: String(enemy.def?.name || enemy.typeKey || 'ENEMY').toUpperCase(),
    hp,
    max,
    pct: Math.round((hp / max) * 100),
    boss: Boolean(enemy.isBoss),
    speed: Math.round(tilesPerSecond * 10) / 10,
    armor: Math.round(Number(enemy.armor) || 0),
    traits,
    resistance: resistanceLine(enemy),
    flying: Boolean(enemy.flying),
    shielded: Number(enemy.shield) > 0,
  };
}
