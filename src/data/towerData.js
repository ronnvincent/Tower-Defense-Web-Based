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
 */

export const TOWER_TYPES = {
  archer: {
    key: 'archer',
    name: 'Archer Tower',
    hotkey: '1',
    cost: 60,
    description: 'Rapid ballistic defense. Upgrades into high-fire-rate Ranger or high-range Sniper.',
    projectile: 'arrow',
    projectileSpeed: 640,
    placement: 'grass',
    levels: [
      {
        level: 1,
        title: 'Scout Ballista',
        damage: 15,
        range: 150,
        cooldown: 650,
        damageType: 'physical',
      },
      {
        level: 2,
        title: 'Twin Ballista',
        damage: 24,
        range: 165,
        cooldown: 560,
        upgradeCost: 55,
        damageType: 'physical',
      },
    ],
    specializations: {
      rapid: {
        specKey: 'rapid',
        branch: 'spec-a',
        title: 'Rapid Ranger',
        damage: 22,
        range: 175,
        cooldown: 240, // ~4.17 attacks/sec
        upgradeCost: 95,
        projectile: 'rapid',
        projectileSpeed: 750,
        damageType: 'physical',
        spriteKey: 'tower-top-archer-spec-a',
        description: 'Blistering fire rate (4.17/s). Shreds unarmored runners and swarms.',
      },
      sniper: {
        specKey: 'sniper',
        branch: 'spec-b',
        title: 'Sniper Tower',
        damage: 140,
        range: 245,
        cooldown: 1350, // ~0.74 attacks/sec
        upgradeCost: 110,
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
    name: 'Cannon Tower',
    hotkey: '2',
    cost: 110,
    description: 'Heavy artillery dealing area-of-effect splash damage.',
    projectile: 'cannonball',
    projectileSpeed: 380,
    placement: 'grass',
    levels: [
      {
        level: 1,
        title: 'Mortar Battery',
        damage: 45,
        range: 145,
        cooldown: 1700,
        splash: 62,
        damageType: 'explosive',
      },
      {
        level: 2,
        title: 'Dual Bombard',
        damage: 70,
        range: 155,
        cooldown: 1500,
        splash: 72,
        upgradeCost: 90,
        damageType: 'explosive',
      },
    ],
    specializations: {
      siege: {
        specKey: 'siege',
        branch: 'spec-a',
        title: 'Siege Cannon',
        damage: 130,
        range: 170,
        cooldown: 1350,
        splash: 95, // Massive AOE radius
        upgradeCost: 140,
        projectile: 'cannonball',
        projectileSpeed: 420,
        damageType: 'explosive',
        spriteKey: 'tower-top-cannon-spec-a',
        description: 'Massive blast radius (95px). Obliterates packed groups of enemies.',
      },
      artillery: {
        specKey: 'artillery',
        branch: 'spec-b',
        title: 'Heavy Artillery',
        damage: 240,
        range: 185,
        cooldown: 2100,
        splash: 65,
        upgradeCost: 160,
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
    name: 'Frost Spire',
    hotkey: '3',
    cost: 85,
    description: 'Mystic spire chilling enemies with slows, branching into Blizzard or Chain Lightning.',
    projectile: 'frost',
    projectileSpeed: 500,
    placement: 'grass',
    levels: [
      {
        level: 1,
        title: 'Chilling Crystal',
        damage: 8,
        range: 135,
        cooldown: 1000,
        slow: 0.4,
        slowMs: 1600,
        damageType: 'magic',
      },
      {
        level: 2,
        title: 'Glacial Obelisk',
        damage: 14,
        range: 150,
        cooldown: 900,
        slow: 0.5,
        slowMs: 1800,
        upgradeCost: 70,
        damageType: 'magic',
      },
    ],
    specializations: {
      blizzard: {
        specKey: 'blizzard',
        branch: 'spec-a',
        title: 'Blizzard Spire',
        damage: 22,
        range: 165,
        cooldown: 800,
        slow: 0.6, // 60% slow
        slowMs: 2200,
        upgradeCost: 115,
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
        damage: 52,
        range: 160,
        cooldown: 850,
        upgradeCost: 125,
        projectile: 'lightning',
        projectileSpeed: 950,
        damageType: 'lightning',
        chainTargets: 3, // Hits 3 enemies
        chainRange: 90,
        stunMs: 150,
        spriteKey: 'tower-top-frost-spec-b',
        description: 'Chain lightning strikes and arcs to 3 enemies. Bypasses 75% armor with a micro-stun.',
      },
    },
  },
};

/**
 * Barricade: placed on ROAD tiles. It removes an edge from the graph, forcing BFS
 * to reroute enemies. Can be upgraded into a Spiked Bastion reflecting contact thorns.
 */
export const BARRICADE = {
  key: 'barricade',
  name: 'Road Barricade',
  hotkey: '4',
  cost: 30,
  description: 'Blocks a road tile. Enemies reroute via BFS. Upgradable to Spiked Bastion.',
  placement: 'road',
  levels: [
    {
      level: 1,
      title: 'Stone Roadblock',
      thornsDamage: 0,
    },
    {
      level: 2,
      title: 'Spiked Bastion',
      upgradeCost: 35,
      thornsDamage: 15,
      description: 'Reinforced spikes deal 15 contact damage whenever enemies march past.',
    },
  ],
};

/** Order of build buttons in the dock. */
export const BUILD_OPTIONS = ['archer', 'cannon', 'frost', 'barricade'];

export function getBuildDefinition(key) {
  return key === 'barricade' ? BARRICADE : TOWER_TYPES[key] ?? null;
}

export function calculateSellRefund(totalInvested, refundRate = 0.7) {
  return Math.floor(totalInvested * refundRate);
}
