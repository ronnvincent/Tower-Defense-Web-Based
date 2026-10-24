/**
 * Enemy type definitions & archetype mechanics.
 *
 *   health       – base hit points (scaled up per wave by waveHealthMultiplier)
 *   speed        – movement speed in pixels per second
 *   armor        – flat physical armor rating (mitigates damage via CombatCalculator)
 *   shield       – initial temporary shield barrier that absorbs damage first
 *   reward       – coins granted when the enemy is defeated (exactly once)
 *   score        – score granted when the enemy is defeated
 *   baseDamage   – base integrity lost if enemy reaches the base
 *   radius       – collision and hit radius in pixels
 *   siege        – damage per hit dealt to a palisade standing in the way
 *   siegeInterval– milliseconds between siege hits (default 1000)
 *   isBoss       – true for major boss encounters
 *   bossPhases   – phase thresholds and mechanics for boss encounters
 *   abilities    – archetype specific abilities (e.g. heal pulse, summons)
 *
 * Sprites are looked up as `enemy-<typeKey>` (see src/data/spireManifest.js),
 * so no per-archetype sprite key is needed here.
 */

export const ENEMY_TYPES = {
  grunt: {
    key: 'grunt',
    name: 'Goblin Grunt',
    role: 'Standard balanced infantry — moderate health and speed.',
    health: 75,
    speed: 62,
    armor: 0,
    shield: 0,
    reward: 7,
    score: 10,
    baseDamage: 1,
    radius: 16,
    siege: 10,
  },

  runner: {
    key: 'runner',
    name: 'Shadow Runner',
    role: 'Fast agile scout — low health, high speed, tests rapid defenses.',
    health: 40,
    speed: 125,
    armor: 0,
    shield: 0,
    reward: 6,
    score: 12,
    baseDamage: 1,
    radius: 13,
    siege: 6,
  },

  brute: {
    key: 'brute',
    name: 'Iron Brute',
    role: 'Heavily armored juggernaut — 40 Armor reduces physical damage by ~28%. Weak to Magic and Armor Break.',
    health: 320,
    speed: 38,
    armor: 40,
    shield: 0,
    reward: 22,
    score: 35,
    baseDamage: 3,
    radius: 22,
    siege: 34,
  },

  swarm: {
    key: 'swarm',
    name: 'Abyssal Slime',
    role: 'Swarm creature — low health, fast, appears in dense packs. Highly vulnerable to Cannon area splash.',
    health: 26,
    speed: 88,
    armor: 0,
    shield: 0,
    reward: 3,
    score: 6,
    baseDamage: 1,
    radius: 12,
    siege: 4,
    useSlimeAnim: true,
  },

  healer: {
    key: 'healer',
    name: 'Plague Shaman',
    role: 'Support healer — pulses a restoration aura (+30 HP to nearby allies every 2.5s). Priority elimination target.',
    health: 180,
    speed: 50,
    armor: 10,
    shield: 0,
    reward: 18,
    score: 40,
    baseDamage: 2,
    radius: 18,
    siege: 8,
    ability: {
      type: 'heal',
      radius: 95,
      amount: 30,
      intervalMs: 2500,
    },
  },

  shield: {
    key: 'shield',
    name: 'Aegis Knight',
    role: 'Frontline vanguard — possesses a 120 HP Kinetic Barrier absorbing all damage before health can be touched.',
    health: 160,
    speed: 46,
    armor: 15,
    shield: 120, // 120 HP shield barrier
    reward: 16,
    score: 30,
    baseDamage: 2,
    radius: 19,
    siege: 14,
  },

  colossus: {
    key: 'colossus',
    name: 'Stone Colossus',
    role: 'Wave 3 Mid-Boss — 2-phase encounter: Hardened Carapace in Phase 1, Enraged Earth Shatter in Phase 2.',
    health: 1250,
    speed: 34,
    armor: 35,
    shield: 0,
    reward: 100,
    score: 250,
    baseDamage: 8,
    radius: 28,
    siege: 55,
    isBoss: true,
    bossPhases: [
      {
        phase: 1,
        name: 'Hardened Carapace',
        thresholdPct: 1.0,
        armor: 35,
        speedMultiplier: 1.0,
        ability: {
          type: 'shieldStance',
          intervalMs: 6000,
          durationMs: 3000,
          damageReduction: 0.4,
        },
      },
      {
        phase: 2,
        name: 'Enraged Quake',
        thresholdPct: 0.5,
        armor: 10, // Armor stripped!
        speedMultiplier: 1.45, // Speed surges
        onEnterText: 'PHASE 2: ENRAGED EARTH SHATTER!',
      },
    ],
  },

  warlord: {
    key: 'warlord',
    name: 'Abyssal Warlord',
    role: 'Wave 6 Final Boss — 3-phase epic encounter: Rift Summoning, Kinetic Shield Matrix, and Overdrive Final Stand.',
    health: 3300,
    speed: 32,
    armor: 25,
    shield: 0,
    reward: 200,
    score: 600,
    baseDamage: 12,
    radius: 30,
    siege: 70,
    isBoss: true,
    bossPhases: [
      {
        phase: 1,
        name: 'Rift Commander',
        thresholdPct: 1.0,
        speedMultiplier: 1.0,
        ability: {
          type: 'summon',
          enemyKey: 'swarm',
          count: 2,
          intervalMs: 6000,
        },
      },
      {
        phase: 2,
        name: 'Kinetic Shield Matrix',
        thresholdPct: 0.6,
        grantShield: 750, // Deploys 750 HP kinetic barrier
        speedMultiplier: 1.1,
        onEnterText: 'PHASE 2: KINETIC SHIELD MATRIX DEPLOYED!',
      },
      {
        phase: 3,
        name: 'Overdrive Final Stand',
        thresholdPct: 0.25,
        speedMultiplier: 1.4,
        immuneToSlow: true,
        onEnterText: 'PHASE 3: OVERDRIVE FINAL STAND!',
      },
    ],
  },
};

/**
 * Health multiplier for wave w (1-based): 1 + 0.09 × (w − 1), capped at 2×.
 *
 * The slope used to be 0.12/wave, which made wave 6 fights drag once the boss
 * arrives. 9% per wave still ramps the pressure but keeps late waves winnable
 * with the seven-tower dock.
 */
export function waveHealthMultiplier(waveNumber) {
  return Math.min(2, 1 + 0.09 * (waveNumber - 1));
}
