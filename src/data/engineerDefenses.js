/**
 * The five **engineer** defence lines — flavoured gunpowder, fire, poison and
 * rope, so the roster is no longer five variations of "stone tower".
 *
 *   crossbow  Iron Crossbow      precision single-target, armour-piercing bolts
 *   gatling   Clockwork Repeater short-range hail of bullets
 *   flamer    Pitchfire Siphon   close-range cone with a burning DoT
 *   venom     Venom Still        poison that ignores armour and spreads
 *   harpoon   Harpoon Winch      long range, stuns and hands out boss damage
 *
 * They are declared here rather than in `towerData.js` so that file stays a
 * readable shop table; `towerData.js` merges this object in, which means every
 * consumer (HUD dock, build hotkeys, placement, upgrade panel, balance tests)
 * sees one flat `TOWER_TYPES` map.
 *
 * Balance contract (see docs/balance.md):
 *   - a level-1 line sits at 25–45 effective DPS for 70–125 gold;
 *   - the two branches of a line stay within 15 % of each other in DPS but
 *     differ in *how* the damage arrives;
 *   - level 5 tops out at 1.9–2.6× its branch, and costs more than double.
 *
 * New fields understood by the runtime:
 *   dot          { damage, tickMs, durationMs, kind } — damage over time applied
 *                per hit (fire burns, poison rots). `kind` picks the tint.
 *   bossBonus    extra damage fraction dealt to bosses (0.5 = +50 %).
 *   stunMs       movement freeze applied on hit.
 *
 * Damage types reuse the CombatCalculator set: physical / piercing / explosive /
 * magic / lightning / true.
 */

export const ENGINEER_LINES = ['crossbow', 'gatling', 'flamer', 'venom', 'harpoon'];

export const ENGINEER_TOWER_TYPES = {
  /* ------------------------------------------------------------- crossbow */
  crossbow: {
    key: 'crossbow',
    name: 'Iron Crossbow',
    hotkey: '8',
    cost: 70,
    role: 'Precision',
    description:
      'A clockwork crossbow: slow, accurate, armour-piercing bolts. Branches into a rapid Repeater or a boss-killing Arbalest.',
    projectile: 'bolt',
    projectileSpeed: 780,
    placement: 'grass',
    levels: [
      {
        level: 1,
        title: 'Field Crossbow',
        damage: 34,
        range: 175,
        cooldown: 950,
        damageType: 'piercing',
        armorPenetration: 0.2,
      },
      {
        level: 2,
        title: 'Windlass Crossbow',
        damage: 50,
        range: 188,
        cooldown: 900,
        upgradeCost: 60,
        damageType: 'piercing',
        armorPenetration: 0.25,
      },
    ],
    specializations: {
      repeater: {
        specKey: 'repeater',
        branch: 'spec-a',
        title: 'Repeater Crossbow',
        damage: 30,
        range: 180,
        cooldown: 260,
        upgradeCost: 105,
        projectile: 'bolt',
        projectileSpeed: 820,
        damageType: 'piercing',
        armorPenetration: 0.15,
        spriteKey: 'tower-top-crossbow-spec-a',
        description: '3.8 bolts a second. The cheap answer to a swarm that keeps coming.',
      },
      piercer: {
        specKey: 'piercer',
        branch: 'spec-b',
        title: 'Siege Arbalest',
        damage: 260,
        range: 245,
        cooldown: 1900,
        upgradeCost: 115,
        projectile: 'bolt-heavy',
        projectileSpeed: 980,
        damageType: 'piercing',
        armorPenetration: 0.65,
        bossBonus: 0.25,
        spriteKey: 'tower-top-crossbow-spec-b',
        description: 'One bolt per two seconds, 65 % armour penetration and +25 % against bosses.',
      },
    },
  },

  /* -------------------------------------------------------------- gatling */
  gatling: {
    key: 'gatling',
    name: 'Clockwork Repeater',
    hotkey: '9',
    cost: 125,
    role: 'DPS',
    description:
      'Steam-driven multi-barrel gun. Short reach, relentless output — the line that simply out-sustains a boss shield. Branches into Storm or Shredder.',
    projectile: 'bullet',
    projectileSpeed: 900,
    placement: 'grass',
    levels: [
      {
        level: 1,
        title: 'Hand Crank',
        damage: 8,
        range: 118,
        cooldown: 150,
        damageType: 'physical',
      },
      {
        level: 2,
        title: 'Double Crank',
        damage: 11,
        range: 126,
        cooldown: 140,
        upgradeCost: 95,
        damageType: 'physical',
      },
    ],
    specializations: {
      storm: {
        specKey: 'storm',
        branch: 'spec-a',
        title: 'Storm Repeater',
        damage: 13,
        range: 132,
        cooldown: 90,
        upgradeCost: 130,
        projectile: 'bullet',
        projectileSpeed: 940,
        damageType: 'physical',
        armorPenetration: 0.1,
        spriteKey: 'tower-top-gatling-spec-a',
        description: 'Eleven rounds a second. Nothing light survives standing in front of it.',
      },
      shred: {
        specKey: 'shred',
        branch: 'spec-b',
        title: 'Shredder',
        damage: 16,
        range: 140,
        cooldown: 110,
        upgradeCost: 135,
        projectile: 'bullet',
        projectileSpeed: 900,
        damageType: 'physical',
        armorBreak: 8,
        armorBreakMs: 1500,
        spriteKey: 'tower-top-gatling-spec-b',
        description: 'Every burst strips 8 armour for 1.5 s. Sustained fire turns plate into paper.',
      },
    },
  },

  /* --------------------------------------------------------------- flamer */
  flamer: {
    key: 'flamer',
    name: 'Pitchfire Siphon',
    hotkey: '0',
    cost: 95,
    role: 'Burn',
    description:
      'A short, brutal cone of burning pitch. The hit is small; the fire it leaves behind is not. Branches into Inferno or Napalm.',
    projectile: 'flame',
    projectileSpeed: 380,
    placement: 'grass',
    levels: [
      {
        level: 1,
        title: 'Pitch Brazier',
        damage: 18,
        range: 105,
        cooldown: 900,
        damageType: 'explosive',
        splash: 34,
        dot: { damage: 6, tickMs: 500, durationMs: 2000, kind: 'fire' },
      },
      {
        level: 2,
        title: 'Pressurised Siphon',
        damage: 26,
        range: 112,
        cooldown: 850,
        upgradeCost: 75,
        damageType: 'explosive',
        splash: 40,
        dot: { damage: 8, tickMs: 500, durationMs: 2000, kind: 'fire' },
      },
    ],
    specializations: {
      inferno: {
        specKey: 'inferno',
        branch: 'spec-a',
        title: 'Inferno Siphon',
        damage: 46,
        range: 118,
        cooldown: 800,
        upgradeCost: 115,
        projectile: 'flame',
        projectileSpeed: 400,
        damageType: 'explosive',
        splash: 54,
        dot: { damage: 10, tickMs: 500, durationMs: 2500, kind: 'fire' },
        spriteKey: 'tower-top-flamer-spec-a',
        description: 'Wider cone, hotter burn: 10 damage every half second for 2.5 s, refreshed on every hit.',
      },
      napalm: {
        specKey: 'napalm',
        branch: 'spec-b',
        title: 'Napalm Mortar',
        damage: 44,
        range: 132,
        cooldown: 1000,
        upgradeCost: 120,
        projectile: 'flame',
        projectileSpeed: 340,
        damageType: 'explosive',
        splash: 80,
        dot: { damage: 14, tickMs: 500, durationMs: 3000, kind: 'fire' },
        spriteKey: 'tower-top-flamer-spec-b',
        description: 'Lobs a burning pool: 80 px splash and a 3 s burn that sticks to the whole pack.',
      },
    },
  },

  /* ---------------------------------------------------------------- venom */
  venom: {
    key: 'venom',
    name: 'Venom Still',
    hotkey: '-',
    cost: 105,
    role: 'Poison',
    description:
      'A glass still of corrosive venom. Direct hits are small, but the poison ignores armour entirely. Branches into Plague or Corrosive.',
    projectile: 'acid',
    projectileSpeed: 500,
    placement: 'grass',
    levels: [
      {
        level: 1,
        title: 'Toxic Gourd',
        damage: 16,
        range: 165,
        cooldown: 1100,
        damageType: 'magic',
        dot: { damage: 7, tickMs: 500, durationMs: 3000, kind: 'poison' },
      },
      {
        level: 2,
        title: 'Venom Flask',
        damage: 22,
        range: 175,
        cooldown: 1050,
        upgradeCost: 85,
        damageType: 'magic',
        dot: { damage: 9, tickMs: 500, durationMs: 3000, kind: 'poison' },
      },
    ],
    specializations: {
      plague: {
        specKey: 'plague',
        branch: 'spec-a',
        title: 'Plague Vat',
        damage: 42,
        range: 178,
        cooldown: 1000,
        upgradeCost: 120,
        projectile: 'acid',
        projectileSpeed: 520,
        damageType: 'magic',
        splash: 60,
        dot: { damage: 14, tickMs: 500, durationMs: 3000, kind: 'poison' },
        spriteKey: 'tower-top-venom-spec-a',
        description: 'The flask bursts: 60 px splash carries the poison to everything packed together.',
      },
      corrosive: {
        specKey: 'corrosive',
        branch: 'spec-b',
        title: 'Corrosive Still',
        damage: 36,
        range: 185,
        cooldown: 980,
        upgradeCost: 125,
        projectile: 'acid',
        projectileSpeed: 540,
        damageType: 'magic',
        armorBreak: 20,
        armorBreakMs: 4000,
        dot: { damage: 12, tickMs: 500, durationMs: 3000, kind: 'poison' },
        spriteKey: 'tower-top-venom-spec-b',
        description: 'Eats 20 armour for 4 s while the poison works. The opener for every other line.',
      },
    },
  },

  /* -------------------------------------------------------------- harpoon */
  harpoon: {
    key: 'harpoon',
    name: 'Harpoon Winch',
    hotkey: '=',
    cost: 115,
    role: 'Control',
    description:
      'A dockside winch that throws a barbed spear: brutal single hits, a stun on impact and extra damage against bosses. Branches into Ballista or Grapple.',
    projectile: 'harpoon',
    projectileSpeed: 700,
    placement: 'grass',
    levels: [
      {
        level: 1,
        title: 'Dock Winch',
        damage: 75,
        range: 200,
        cooldown: 2200,
        damageType: 'physical',
        armorPenetration: 0.3,
        stunMs: 150,
      },
      {
        level: 2,
        title: 'Whaling Winch',
        damage: 110,
        range: 212,
        cooldown: 2100,
        upgradeCost: 90,
        damageType: 'physical',
        armorPenetration: 0.35,
        stunMs: 200,
      },
    ],
    specializations: {
      ballista: {
        specKey: 'ballista',
        branch: 'spec-a',
        title: 'Siege Harpoon',
        damage: 420,
        range: 250,
        cooldown: 2600,
        upgradeCost: 145,
        projectile: 'harpoon',
        projectileSpeed: 760,
        damageType: 'piercing',
        armorPenetration: 0.5,
        bossBonus: 0.5,
        stunMs: 250,
        spriteKey: 'tower-top-harpoon-spec-a',
        description: 'Half a tonne of barbed steel: +50 % damage to bosses, 250 ms stun on impact.',
      },
      grapple: {
        specKey: 'grapple',
        branch: 'spec-b',
        title: 'Grapple Winch',
        damage: 190,
        range: 230,
        cooldown: 1800,
        upgradeCost: 140,
        projectile: 'harpoon',
        projectileSpeed: 720,
        damageType: 'physical',
        armorPenetration: 0.3,
        slow: 0.35,
        slowMs: 1200,
        bossBonus: 0.2,
        stunMs: 700,
        spriteKey: 'tower-top-harpoon-spec-b',
        description: 'Reels the line in: 700 ms stun, then a 35 % slow. Bosses cannot walk through it.',
      },
    },
  },
};
