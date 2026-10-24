/**
 * CombatCalculator — Centralized combat damage, mitigation, and status calculations.
 *
 * Provides deterministic, mathematical resolution for:
 *  - Physical armor mitigation
 *  - Armor penetration & armor break debuffs
 *  - Shield barrier absorption
 *  - Damage type bonuses and resistances
 *  - Area-of-effect distance falloff
 */

export const DAMAGE_TYPE = {
  PHYSICAL: 'physical',
  EXPLOSIVE: 'explosive',
  PIERCING: 'piercing',
  MAGIC: 'magic',
  LIGHTNING: 'lightning',
  TRUE: 'true',
};

/**
 * Calculates effective armor after penetration and armor-break debuffs.
 * @param {number} baseArmor
 * @param {number} armorPenetration Fraction of armor ignored (0.0 - 1.0)
 * @param {number} armorBreak Flat armor reduction from debuffs
 * @returns {number}
 */
export function calculateEffectiveArmor(baseArmor = 0, armorPenetration = 0, armorBreak = 0) {
  const reduced = Math.max(0, baseArmor - armorBreak);
  const penetrated = reduced * (1 - Math.min(1, Math.max(0, armorPenetration)));
  return Math.max(0, penetrated);
}

/**
 * Calculates damage reduction multiplier from armor.
 * Uses standard asymptotic curve: Multiplier = 100 / (100 + EffectiveArmor)
 * @param {number} effectiveArmor
 * @returns {number} Value between 0.0 and 1.0
 */
export function getArmorDamageMultiplier(effectiveArmor = 0) {
  if (effectiveArmor <= 0) return 1.0;
  return 100 / (100 + effectiveArmor);
}

/**
 * Calculates splash damage falloff based on Euclidean distance from detonation.
 * Linear falloff from 100% at epicenter to 40% at perimeter.
 * @param {number} rawDamage
 * @param {number} distance Distance from center
 * @param {number} splashRadius Total splash radius
 * @returns {number}
 */
export function calculateSplashDamage(rawDamage, distance, splashRadius) {
  if (splashRadius <= 0) return rawDamage;
  const clampedDist = Math.max(0, Math.min(distance, splashRadius));
  const falloff = 1 - (clampedDist / splashRadius) * 0.6; // 1.0 at center, 0.4 at edge
  return Math.max(1, Math.round(rawDamage * falloff));
}

/**
 * Primary combat resolution formula.
 *
 * @param {object} params
 * @param {number} params.rawDamage Base hit damage
 * @param {string} [params.damageType] Key from DAMAGE_TYPE
 * @param {number} [params.armor] Target's current base armor
 * @param {number} [params.armorPenetration] Fraction of armor bypassed (e.g. 0.5 for sniper)
 * @param {number} [params.armorBreak] Flat armor debuff on target
 * @param {number} [params.activeShield] Target's temporary shield points
 * @param {number} [params.distance] Distance from impact for splash hits
 * @param {number} [params.splashRadius] Total splash radius
 * @returns {{
 *   finalDamage: number,
 *   shieldAbsorbed: number,
 *   remainingShield: number,
 *   effectiveArmor: number,
 *   damageDealtToHealth: number
 * }}
 */
export function calculateDamage({
  rawDamage,
  damageType = DAMAGE_TYPE.PHYSICAL,
  armor = 0,
  armorPenetration = 0,
  armorBreak = 0,
  activeShield = 0,
  distance = 0,
  splashRadius = 0,
}) {
  if (rawDamage <= 0) {
    return {
      finalDamage: 0,
      shieldAbsorbed: 0,
      remainingShield: activeShield,
      effectiveArmor: armor,
      damageDealtToHealth: 0,
    };
  }

  // 1. Account for splash falloff if applicable
  let damageAfterFalloff = rawDamage;
  if (splashRadius > 0) {
    damageAfterFalloff = calculateSplashDamage(rawDamage, distance, splashRadius);
  }

  // 2. Resolve damage type rules
  let effectivePen = armorPenetration;
  if (damageType === DAMAGE_TYPE.PIERCING) {
    // Intrinsic +50% armor penetration
    effectivePen = Math.min(1.0, armorPenetration + 0.5);
  } else if (damageType === DAMAGE_TYPE.MAGIC || damageType === DAMAGE_TYPE.LIGHTNING) {
    // Magic and lightning bypass 75% of armor
    effectivePen = Math.min(1.0, armorPenetration + 0.75);
  } else if (damageType === DAMAGE_TYPE.TRUE) {
    // True damage ignores 100% of armor
    effectivePen = 1.0;
  }

  // 3. Compute armor mitigation
  const effectiveArmor = calculateEffectiveArmor(armor, effectivePen, armorBreak);
  const armorMultiplier = getArmorDamageMultiplier(effectiveArmor);
  const mitigatedDamage = Math.max(1, Math.round(damageAfterFalloff * armorMultiplier));

  // 4. Resolve shield absorption before applying to health
  let shieldAbsorbed = 0;
  let remainingShield = Math.max(0, activeShield);
  let damageDealtToHealth = mitigatedDamage;

  if (remainingShield > 0) {
    if (remainingShield >= mitigatedDamage) {
      shieldAbsorbed = mitigatedDamage;
      remainingShield -= mitigatedDamage;
      damageDealtToHealth = 0;
    } else {
      shieldAbsorbed = remainingShield;
      damageDealtToHealth = mitigatedDamage - remainingShield;
      remainingShield = 0;
    }
  }

  return {
    finalDamage: mitigatedDamage,
    shieldAbsorbed,
    remainingShield,
    effectiveArmor,
    damageDealtToHealth,
  };
}
