/**
 * Tower definitions: Levels 1–2 progression + Level 3 Branching Specializations.
 *
 *   damage           – damage per hit
 *   range            – attack radius in pixels
 *   cooldown         – milliseconds between attacks
 *   damageType       – 'physical' | 'explosive' | 'piercing' | 'magic' | 'lightning' | 'true'
 *   armorPenetration – fraction of target armor bypassed (e.g. 0.5 = 50%)
 *   armorBreak       – flat armor debuff inflicted on impact
 *   armorBreakMs     – duration of the armor break debuff
 *   splash           – radius of area damage around detonation
 *   slow             – speed reduction factor (0.4 = 40% slower)
 *   slowMs           – duration of the slow debuff
 *   chainTargets     – number of additional enemies hit by arcing lightning
 *   aura             – support field for neighbouring towers:
 *                        radius       how far the buff reaches (px)
 *                        damageBonus  +% damage for towers in range
 *                        rangeBonus   +% attack range for towers in range
 *                        fireRateBonus– % shaved off the cooldown of towers in range
 *                        coinPerKill  bonus gold for kills inside the aura
 *
 * The three "forge" lines (Hammerforge, Runestone, Banner Keep) were added to
 * soften the campaign: they cover the roles the starter three lacked — heavy
 * explosive burst, armour-ignoring magic and a force multiplier that makes an
 * existing defence line hit harder.
 */

import { SELL_REFUND_RATIO } from '../config/gameConfig.js';
import { ENGINEER_TOWER_TYPES, ENGINEER_LINES } from './engineerDefenses.js';

const CORE_TOWER_TYPES = {
  archer: {
    key: 'archer',
    name: 'Ballista Tower',
    hotkey: '1',
    cost: 60,
    description: 'Rapid bolt fire. Upgrades into a high-fire-rate Ranger or a long-range Sniper.',
    projectile: 'arrow',
    projectileSpeed: 640,
    placement: 'grass',
    levels: [
      {
        level: 1,
        title: 'Scout Ballista',
        damage: 16,
        range: 155,
        cooldown: 620,
        damageType: 'physical',
      },
      {
        level: 2,
        title: 'Twin Ballista',
        damage: 26,
        range: 168,
        cooldown: 540,
        upgradeCost: 50,
        damageType: 'physical',
      },
    ],
    specializations: {
      rapid: {
        specKey: 'rapid',
        branch: 'spec-a',
        title: 'Rapid Ranger',
        damage: 30,
        range: 178,
        cooldown: 220, // ~4.5 attacks/sec
        upgradeCost: 90,
        projectile: 'rapid',
        projectileSpeed: 750,
        damageType: 'physical',
        spriteKey: 'tower-top-archer-spec-a',
        description: 'Blistering fire rate (4.5/s). Shreds unarmored runners and swarms.',
      },
      sniper: {
        specKey: 'sniper',
        branch: 'spec-b',
        title: 'Sniper Tower',
        damage: 150,
        range: 250,
        cooldown: 1300, // ~0.77 attacks/sec
        upgradeCost: 100,
        projectile: 'sniper',
        projectileSpeed: 900,
        damageType: 'piercing',
        armorPenetration: 0.5, // Ignores 50% armor
        spriteKey: 'tower-top-archer-spec-b',
        description: 'Extreme range and armor-piercing round (50% armor pen). Devastates bosses and elites.',
      },
    },
  },

  cannon: {
    key: 'cannon',
    name: 'Boulder Sling',
    hotkey: '2',
    cost: 110,
    description: 'Lobbed stone artillery with area-of-effect splash damage.',
    // Ground-only: an arcing stone cannot be aimed above the road.
    targetsAir: false,
    projectile: 'cannonball',
    projectileSpeed: 380,
    placement: 'grass',
    levels: [
      {
        level: 1,
        title: 'Mortar Battery',
        damage: 55,
        range: 150,
        cooldown: 1650,
        splash: 70,
        damageType: 'explosive',
      },
      {
        level: 2,
        title: 'Dual Bombard',
        damage: 85,
        range: 160,
        cooldown: 1450,
        splash: 80,
        upgradeCost: 85,
        damageType: 'explosive',
      },
    ],
    specializations: {
      siege: {
        specKey: 'siege',
        branch: 'spec-a',
        title: 'Siege Sling',
        damage: 158,
        range: 175,
        cooldown: 1300,
        splash: 100, // Massive AOE radius
        upgradeCost: 135,
        projectile: 'cannonball',
        projectileSpeed: 420,
        damageType: 'explosive',
        spriteKey: 'tower-top-cannon-spec-a',
        description: 'Massive blast radius (100px). Obliterates packed groups of enemies.',
      },
      artillery: {
        specKey: 'artillery',
        branch: 'spec-b',
        title: 'Stone Hammer',
        damage: 260,
        range: 190,
        cooldown: 2000,
        splash: 70,
        upgradeCost: 150,
        projectile: 'cannonball',
        projectileSpeed: 360,
        damageType: 'explosive',
        armorBreak: 25, // Weakens armor by 25 points
        armorBreakMs: 4000,
        spriteKey: 'tower-top-cannon-spec-b',
        description: 'Bunker-buster shell. Breaks 25 target armor for 4s, amplifying all defenses.',
      },
    },
  },

  frost: {
    key: 'frost',
    name: 'Frost Bastion',
    hotkey: '3',
    cost: 85,
    description: 'Crystal bastion chilling enemies with slows, branching into Blizzard or Chain Lightning.',
    projectile: 'frost',
    projectileSpeed: 500,
    placement: 'grass',
    levels: [
      {
        level: 1,
        title: 'Chilling Crystal',
        damage: 10,
        range: 140,
        cooldown: 950,
        slow: 0.4,
        slowMs: 1600,
        damageType: 'magic',
      },
      {
        level: 2,
        title: 'Glacial Obelisk',
        damage: 16,
        range: 152,
        cooldown: 880,
        slow: 0.5,
        slowMs: 1800,
        upgradeCost: 65,
        damageType: 'magic',
      },
    ],
    specializations: {
      blizzard: {
        specKey: 'blizzard',
        branch: 'spec-a',
        title: 'Blizzard Spire',
        damage: 43,
        range: 168,
        cooldown: 780,
        slow: 0.6, // 60% slow
        slowMs: 2200,
        upgradeCost: 110,
        projectile: 'frost',
        projectileSpeed: 540,
        damageType: 'magic',
        spriteKey: 'tower-top-frost-spec-a',
        description: 'Sub-zero freezing frost slowing enemies by 60% with extended freeze duration.',
      },
      lightning: {
        specKey: 'lightning',
        branch: 'spec-b',
        title: 'Lightning Conductor',
        damage: 75,
        range: 162,
        cooldown: 830,
        upgradeCost: 120,
        projectile: 'lightning',
        projectileSpeed: 950,
        damageType: 'lightning',
        chainTargets: 3, // Hits 3 enemies
        chainRange: 90,
        spriteKey: 'tower-top-frost-spec-b',
        description: 'Chain lightning strikes and arcs to 3 enemies. Bypasses 75% armor.',
      },
    },
  },

  /* ------------------------------------------------------------------ forge */

  forge: {
    key: 'forge',
    name: 'Hammerforge',
    hotkey: '5',
    cost: 120,
    description: 'Heavy forge-hammer that slams the road for explosive damage. Shorter reach than the Sling, far harder hits.',
    // Ground-only: the hammer only reaches what the forge can touch.
    targetsAir: false,
    projectile: 'hammer',
    projectileSpeed: 460,
    placement: 'grass',
    levels: [
      {
        level: 1,
        title: 'Anvil Forge',
        damage: 60,
        range: 140,
        cooldown: 1600,
        splash: 66,
        damageType: 'explosive',
      },
      {
        level: 2,
        title: 'Ember Anvil',
        damage: 88,
        range: 150,
        cooldown: 1450,
        splash: 76,
        upgradeCost: 85,
        damageType: 'explosive',
      },
    ],
    specializations: {
      ember: {
        specKey: 'ember',
        branch: 'spec-a',
        title: 'Emberforge',
        damage: 150,
        range: 160,
        cooldown: 1350,
        splash: 92,
        upgradeCost: 130,
        projectile: 'hammer',
        projectileSpeed: 470,
        damageType: 'explosive',
        spriteKey: 'tower-top-forge-spec-a',
        description: 'Molten slam with a 92px blast — the biggest hit area in the forge. Clears a pack in two shells.',
      },
      thunder: {
        specKey: 'thunder',
        branch: 'spec-b',
        title: 'Thunderforge',
        damage: 160,
        range: 185,
        cooldown: 1400,
        splash: 72,
        upgradeCost: 140,
        projectile: 'hammer',
        projectileSpeed: 500,
        damageType: 'explosive',
        armorPenetration: 0.35,
        spriteKey: 'tower-top-forge-spec-b',
        description: 'Long-reach shockwave (72px) that punches 35% through armour. The plate answer, not the crowd one.',
      },
    },
  },

  runes: {
    key: 'runes',
    name: 'Runestone',
    hotkey: '6',
    cost: 135,
    description: 'Rune orb that burns through armour with magic damage. The answer to Iron Brutes and shielded elites.',
    projectile: 'rune',
    projectileSpeed: 560,
    placement: 'grass',
    levels: [
      {
        level: 1,
        title: 'Rune Shard',
        damage: 30,
        range: 170,
        cooldown: 1100,
        damageType: 'magic',
      },
      {
        level: 2,
        title: 'Rune Obelisk',
        damage: 44,
        range: 185,
        cooldown: 1050,
        upgradeCost: 95,
        damageType: 'magic',
      },
    ],
    specializations: {
      void: {
        specKey: 'void',
        branch: 'spec-a',
        title: 'Void Lance',
        damage: 100,
        range: 215,
        cooldown: 1400,
        upgradeCost: 130,
        projectile: 'rune',
        projectileSpeed: 640,
        damageType: 'true',
        armorBreak: 25,
        armorBreakMs: 4000,
        spriteKey: 'tower-top-runes-spec-a',
        description: 'True damage — ignores 100% of armour and shatters 25 more for 4s.',
      },
      nova: {
        specKey: 'nova',
        branch: 'spec-b',
        title: 'Arcane Nova',
        damage: 80,
        range: 190,
        cooldown: 1150,
        splash: 62,
        upgradeCost: 140,
        projectile: 'rune',
        projectileSpeed: 600,
        damageType: 'magic',
        spriteKey: 'tower-top-runes-spec-b',
        description: 'Splitting rune burst: 62px magic splash that still bypasses 75% armour.',
      },
    },
  },

  banner: {
    key: 'banner',
    name: 'Banner Keep',
    hotkey: '7',
    cost: 125,
    description: 'Support keep: buffs every tower in range with extra damage, and still fires a light bolt itself.',
    projectile: 'arrow',
    projectileSpeed: 620,
    placement: 'grass',
    levels: [
      {
        level: 1,
        title: 'Banner Post',
        damage: 16,
        range: 155,
        cooldown: 1250,
        damageType: 'physical',
        aura: { radius: 150, damageBonus: 0.15, rangeBonus: 0.06 },
      },
      {
        level: 2,
        title: 'War Banner',
        damage: 22,
        range: 165,
        cooldown: 1200,
        upgradeCost: 85,
        damageType: 'physical',
        aura: { radius: 165, damageBonus: 0.22, rangeBonus: 0.08 },
      },
    ],
    specializations: {
      warbanner: {
        specKey: 'warbanner',
        branch: 'spec-a',
        title: 'Great Warbanner',
        damage: 30,
        range: 175,
        cooldown: 1150,
        upgradeCost: 115,
        projectile: 'arrow',
        projectileSpeed: 640,
        damageType: 'physical',
        aura: { radius: 190, damageBonus: 0.32, rangeBonus: 0.14 },
        spriteKey: 'tower-top-banner-spec-a',
        description: 'Rally aura: +32% damage and +14% range to every tower within 190px.',
      },
      muster: {
        specKey: 'muster',
        branch: 'spec-b',
        title: 'Muster Camp',
        damage: 24,
        range: 170,
        cooldown: 1150,
        upgradeCost: 120,
        projectile: 'arrow',
        projectileSpeed: 640,
        damageType: 'physical',
        aura: { radius: 165, damageBonus: 0.2, rangeBonus: 0.06, fireRateBonus: 0.15, coinPerKill: 1 },
        spriteKey: 'tower-top-banner-spec-b',
        description: 'Pay corps: +15% fire rate to nearby towers and +1 gold for every kill inside the aura.',
      },
    },
  },
};

/**
 * Palisade: a solid wall placed on a ROAD tile.
 *
 * Enemies do NOT path around it — the BFS route is the shortest road route and
 * the horde follows it. When the next waypoint holds a palisade the enemy stops
 * and hammers the stakes until the wall breaks (see `Enemy.update`). That makes
 * the palisade a real time-buying wall instead of a detour generator, and it
 * gives the reinforced tier a reason to exist: contact thorns punish attackers.
 *
 *   health       – structure hit points; the wall is destroyed at 0
 *   thornsDamage – damage per second dealt to enemies attacking/passing it
 */
export const BARRICADE = {
  key: 'barricade',
  name: 'Palisade',
  hotkey: '4',
  cost: 30,
  description: 'A solid wall on the road. Enemies must break it down — it buys time and blocks them in your kill zone.',
  placement: 'road',
  // A wall is not a weapon. Its only damage is contact thorns, set in the road,
  // so it must not claim the sky: the dock badge said BOTH for a pile of stakes.
  targetsAir: false,
  levels: [
    {
      level: 1,
      title: 'Wooden Palisade',
      health: 420,
      thornsDamage: 0,
    },
    {
      level: 2,
      title: 'Reinforced Palisade',
      upgradeCost: 35,
      health: 900,
      thornsDamage: 20,
      description: 'Iron-sheathed stakes with 900 HP that deal 20 damage per second to everything clawing at it.',
    },
  ],
};

/** Order of build buttons in the dock (also the keyboard 1–7 order). */
/**
 * The whole roster: the six Spire keeps plus the five engineer lines.
 *
 * Order matters — it is the shop order, and the hotkeys follow it. The core
 * keeps stay on 1–7 so muscle memory survives; the engineer lines take 8, 9, 0,
 * `-` and `=`, which are the keys immediately to the right of them on a
 * standard keyboard.
 */
export const TOWER_TYPES = { ...CORE_TOWER_TYPES, ...ENGINEER_TOWER_TYPES };

export const BUILD_OPTIONS = [
  'archer',
  'cannon',
  'frost',
  'barricade',
  'forge',
  'runes',
  'banner',
  ...ENGINEER_LINES,
];

/** Defences that buff neighbours instead of carrying the kill count. */
export const SUPPORT_LINES = ['banner'];

/**
 * Dock tabs.
 *
 * Twelve cards in one row is a wall of icons on a phone — the exact "masikip"
 * layout the roster outgrew. The dock is therefore paged by family: the two
 * tabs hold 7 and 5 cards, which fit one row on every screen the game supports.
 */
export const BUILD_GROUPS = [
  { key: 'keeps', label: 'KEEPS', hint: 'Stone keeps and the palisade', lines: ['archer', 'cannon', 'frost', 'barricade', 'forge', 'runes', 'banner'] },
  { key: 'engineer', label: 'ENGINEER', hint: 'Gunpowder, fire, poison and rope', lines: ENGINEER_LINES },
];

/** Which dock tab owns a build key (used for hotkey routing and auto-paging). */
export function groupForBuild(key) {
  return BUILD_GROUPS.find((group) => group.lines.includes(key)) || BUILD_GROUPS[0];
}

export function getBuildDefinition(key) {
  return key === 'barricade' ? BARRICADE : TOWER_TYPES[key] ?? null;
}

export function calculateSellRefund(totalInvested, refundRate = SELL_REFUND_RATIO) {
  return Math.floor(totalInvested * refundRate);
}
