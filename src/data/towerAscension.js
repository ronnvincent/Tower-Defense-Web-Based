/**
 * Tier 4 and tier 5 of every defence line — the "OP" half of the arsenal.
 *
 * Why a separate file?
 * --------------------
 * `towerData.js` describes the shop: what a level-1 tower is, and the two
 * specialisations waiting at level 3. The two tiers above that are pure
 * escalation on top of a specialisation, and they carry the signature ability
 * that makes a maxed tower feel different — not just bigger numbers.
 *
 * Shape
 * -----
 *   ASCENSION[typeKey][specKey].elite  → level 4 stats + ability
 *   ASCENSION[typeKey][specKey].apex   → level 5 stats + ability
 *
 * A tier object is merged over the specialisation it belongs to, so any field
 * it does not mention (damage type, projectile, sprite branch) is inherited.
 *
 * `ability` keys the runtime understands:
 *   shots  – projectiles per attack, fired a beat apart at re-acquired targets
 *   nova   – radius (px) of the frost detonation each hit leaves behind
 *   label  – what the inspector calls the signature
 */

/** Highest tier any defence can reach. */
export const MAX_LEVEL = 5;

/** Attack speed helper: damage per second, used by the balance tests. */
export function dps(stats) {
  if (!stats || !stats.cooldown) return 0;
  const shots = Math.max(1, stats.ability?.shots || 1);
  return ((stats.damage || 0) * shots * 1000) / stats.cooldown;
}

export const ASCENSION = {
  archer: {
    rapid: {
      elite: {
        slug: 'rapid-2',
        title: 'Tempest Ranger',
        damage: 20,
        range: 186,
        cooldown: 210,
        upgradeCost: 135,
        ability: { shots: 2, label: 'Twin Volley' },
        description: 'Two bolts per draw. The lane starts to look like rain.',
      },
      apex: {
        slug: 'rapid-3',
        title: 'Storm Ranger',
        damage: 26,
        range: 196,
        cooldown: 260,
        upgradeCost: 260,
        ability: { shots: 3, label: 'Arrow Storm' },
        description: 'Three bolts a draw, each re-aimed. Nothing unarmoured walks through it.',
      },
    },
    sniper: {
      elite: {
        slug: 'sniper-2',
        title: 'Ballista Marksman',
        damage: 236,
        range: 265,
        cooldown: 1150,
        armorPenetration: 0.6,
        upgradeCost: 150,
        ability: { label: 'Deadeye' },
        description: 'One bolt, one corpse. 60% armour penetration.',
      },
      apex: {
        slug: 'sniper-3',
        title: 'Siege Ballista',
        damage: 190,
        range: 280,
        cooldown: 1150,
        armorPenetration: 0.8,
        upgradeCost: 290,
        ability: { shots: 2, label: 'Twin Lance' },
        description: 'Two lances per reload, 80% armour penetration. Built to execute bosses.',
      },
    },
  },

  cannon: {
    siege: {
      elite: {
        slug: 'siege-2',
        title: 'Siege Bastion',
        damage: 240,
        range: 182,
        cooldown: 1220,
        splash: 112,
        upgradeCost: 200,
        ability: { label: 'Heavy Mortar' },
        description: 'A 112px crater on every lob.',
      },
      apex: {
        slug: 'siege-3',
        title: 'Cataclysm Battery',
        damage: 190,
        range: 190,
        cooldown: 1250,
        splash: 128,
        upgradeCost: 390,
        ability: { shots: 2, label: 'Twin Bombard' },
        description: 'Two shells per volley, 128px blast each. The lane simply stops existing.',
      },
    },
    artillery: {
      elite: {
        slug: 'artillery-2',
        title: 'Stone Breaker',
        damage: 400,
        range: 198,
        cooldown: 1900,
        splash: 76,
        armorBreak: 30,
        armorBreakMs: 4500,
        upgradeCost: 225,
        ability: { label: 'Sunder' },
        description: 'Breaks 30 armour for 4.5s. Every other tower hits harder afterwards.',
      },
      apex: {
        slug: 'artillery-3',
        title: 'Titan Breaker',
        damage: 545,
        range: 206,
        cooldown: 1900,
        splash: 86,
        armorBreak: 40,
        armorBreakMs: 5000,
        upgradeCost: 435,
        ability: { label: 'Titanfall' },
        description: '480 damage and 40 armour off the target for 5s. Bosses feel this.',
      },
    },
  },

  frost: {
    blizzard: {
      elite: {
        slug: 'blizzard-2',
        title: 'Absolute Zero',
        damage: 62,
        range: 176,
        cooldown: 780,
        slow: 0.68,
        slowMs: 2500,
        upgradeCost: 150,
        ability: { label: 'Deep Chill' },
        description: '68% slow for 2.5s — the lane freezes in place.',
      },
      apex: {
        slug: 'blizzard-3',
        title: 'Winterhold',
        damage: 93,
        range: 186,
        cooldown: 780,
        slow: 0.75,
        slowMs: 3000,
        upgradeCost: 290,
        nova: 96,
        ability: { nova: 96, label: 'Frost Nova' },
        description: 'Every hit detonates a 96px nova that chills the whole pack.',
      },
    },
    lightning: {
      elite: {
        slug: 'lightning-2',
        title: 'Storm Conduit',
        damage: 108,
        range: 170,
        cooldown: 760,
        chainTargets: 4,
        chainRange: 100,
        upgradeCost: 205,
        ability: { label: 'Arc Chain' },
        description: 'Arcs through 4 targets at 100px reach.',
      },
      apex: {
        slug: 'lightning-3',
        title: 'Thunder Spire',
        damage: 158,
        range: 180,
        cooldown: 700,
        chainTargets: 6,
        chainRange: 115,
        upgradeCost: 400,
        ability: { label: 'Chain Storm' },
        description: 'Six chained strikes per shot. Packed waves conduct.',
      },
    },
  },

  forge: {
    ember: {
      elite: {
        slug: 'ember-2',
        title: 'Magmaforge',
        damage: 240,
        range: 168,
        cooldown: 1300,
        splash: 100,
        armorBreak: 26,
        armorBreakMs: 3800,
        upgradeCost: 205,
        ability: { label: 'Magma Slam' },
        description: 'Molten 100px slam, 26 armour melted for 3.8s.',
      },
      apex: {
        slug: 'ember-3',
        title: 'Volcano Forge',
        damage: 190,
        range: 176,
        cooldown: 1300,
        splash: 110,
        armorBreak: 34,
        armorBreakMs: 4200,
        upgradeCost: 400,
        ability: { shots: 2, label: 'Eruption' },
        description: 'Two hammer blows per cycle, each a 110px eruption.',
      },
    },
    thunder: {
      elite: {
        slug: 'thunder-2',
        title: 'Stormforge',
        damage: 230,
        range: 192,
        cooldown: 1320,
        splash: 108,
        armorPenetration: 0.45,
        upgradeCost: 210,
        ability: { label: 'Shockwave' },
        description: '108px shockwave that punches 45% through armour.',
      },
      apex: {
        slug: 'thunder-3',
        title: 'Skybreaker',
        damage: 300,
        range: 200,
        cooldown: 1240,
        splash: 118,
        armorPenetration: 0.6,
        upgradeCost: 405,
        ability: { label: 'Skyfall' },
        description: '118px shockwave, 60% armour penetration. The ground answers.',
      },
    },
  },

  runes: {
    void: {
      elite: {
        slug: 'void-2',
        title: 'Void Reaper',
        damage: 130,
        range: 224,
        cooldown: 1300,
        armorBreak: 32,
        armorBreakMs: 4200,
        upgradeCost: 170,
        ability: { label: 'Annihilate' },
        description: 'True damage plus 32 shattered armour for 4.2s.',
      },
      apex: {
        slug: 'void-3',
        title: 'Oblivion Lance',
        damage: 150,
        range: 234,
        cooldown: 1300,
        armorBreak: 45,
        armorBreakMs: 4600,
        upgradeCost: 335,
        ability: { shots: 2, label: 'Twin Oblivion' },
        description: 'Two lances of true damage per cycle. Armour is a rumour.',
      },
    },
    nova: {
      elite: {
        slug: 'nova-2',
        title: 'Arcane Nova Prime',
        damage: 95,
        range: 198,
        cooldown: 1080,
        splash: 78,
        upgradeCost: 190,
        ability: { label: 'Rune Burst' },
        description: '78px arcane detonation that ignores three quarters of armour.',
      },
      apex: {
        slug: 'nova-3',
        title: 'Singularity',
        damage: 115,
        range: 206,
        cooldown: 1100,
        splash: 96,
        upgradeCost: 365,
        ability: { shots: 2, label: 'Rune Split' },
        description: 'Two splitting runes per cast, 96px each. The screen goes violet.',
      },
    },
  },

  /* ------------------------------------------------------------ engineer */

  crossbow: {
    repeater: {
      elite: {
        slug: 'repeater-2',
        title: 'Twin Repeater',
        damage: 42,
        range: 186,
        cooldown: 240,
        armorPenetration: 0.2,
        upgradeCost: 160,
        ability: { label: 'Winding Volley' },
        description: 'Two crank housings feed the same rail: 175 DPS of armour-piercing bolts.',
      },
      apex: {
        slug: 'repeater-3',
        title: 'Storm Repeater',
        damage: 34,
        range: 194,
        cooldown: 260,
        armorPenetration: 0.3,
        upgradeCost: 305,
        ability: { shots: 2, label: 'Hail Volley' },
        description: 'Two bolts per cycle, fired a beat apart. The lane never gets a gap.',
      },
    },
    piercer: {
      elite: {
        slug: 'piercer-2',
        title: 'Great Arbalest',
        damage: 420,
        range: 258,
        cooldown: 1900,
        armorPenetration: 0.7,
        bossBonus: 0.4,
        upgradeCost: 170,
        ability: { label: 'Skewer' },
        description: '420 damage in one bolt, 70 % penetration, +40 % against bosses.',
      },
      apex: {
        slug: 'piercer-3',
        title: 'Executioner Arbalest',
        damage: 560,
        range: 268,
        cooldown: 1750,
        armorPenetration: 0.85,
        bossBonus: 0.6,
        upgradeCost: 335,
        ability: { label: 'Executioner Bolt' },
        description: '85 % armour penetration and +60 % boss damage. Built to end a titan.',
      },
    },
  },

  gatling: {
    storm: {
      elite: {
        slug: 'storm-2',
        title: 'Tempest Repeater',
        damage: 16,
        range: 136,
        cooldown: 78,
        armorPenetration: 0.15,
        upgradeCost: 175,
        ability: { label: 'Overdrive' },
        description: '205 DPS at 13 rounds a second. Anything unarmoured melts at the edge of the road.',
      },
      apex: {
        slug: 'storm-3',
        title: 'Bullet Tempest',
        damage: 19,
        range: 144,
        cooldown: 62,
        armorPenetration: 0.25,
        upgradeCost: 345,
        ability: { label: 'Bullet Tempest' },
        description: '306 DPS, steam-vented and water-cooled. The shortest range in the game, the loudest.',
      },
    },
    shred: {
      elite: {
        slug: 'shred-2',
        title: 'Plate Shredder',
        damage: 19,
        range: 144,
        cooldown: 100,
        armorBreak: 12,
        armorBreakMs: 1600,
        upgradeCost: 180,
        ability: { label: 'Ablative Burst' },
        description: 'Every burst strips 12 armour for 1.6 s — the longer it fires, the softer the target.',
      },
      apex: {
        slug: 'shred-3',
        title: 'Ablative Reaper',
        damage: 24,
        range: 152,
        cooldown: 82,
        armorBreak: 18,
        armorBreakMs: 1800,
        upgradeCost: 350,
        ability: { label: 'Ablative Shred' },
        description: '258 DPS that also deletes 18 armour per burst. Tanks stop being tanks.',
      },
    },
  },

  flamer: {
    inferno: {
      elite: {
        slug: 'inferno-2',
        title: 'Hellfire Siphon',
        damage: 76,
        range: 122,
        cooldown: 760,
        splash: 58,
        dot: { damage: 14, tickMs: 500, durationMs: 2500, kind: 'fire' },
        upgradeCost: 170,
        ability: { label: 'Hellfire' },
        description: '58 px cone that leaves 14 damage every half second. Burn stacks on a whole pack.',
      },
      apex: {
        slug: 'inferno-3',
        title: 'Pyroclasm Siphon',
        damage: 90,
        range: 128,
        cooldown: 700,
        splash: 64,
        dot: { damage: 22, tickMs: 500, durationMs: 3000, kind: 'fire' },
        upgradeCost: 335,
        ability: { label: 'Pyroclasm' },
        description: '109 DPS plus a 22-per-tick burn that refuses to go out. Close range, total loss.',
      },
    },
    napalm: {
      elite: {
        slug: 'napalm-2',
        title: 'Firestorm Mortar',
        damage: 65,
        range: 140,
        cooldown: 950,
        splash: 92,
        dot: { damage: 18, tickMs: 500, durationMs: 3200, kind: 'fire' },
        upgradeCost: 180,
        ability: { label: 'Firestorm' },
        description: '92 px burning pool, 18 per tick for 3.2 s. Placement matters more than aim.',
      },
      apex: {
        slug: 'napalm-3',
        title: 'Cinderstorm',
        damage: 84,
        range: 148,
        cooldown: 880,
        splash: 104,
        dot: { damage: 26, tickMs: 500, durationMs: 3600, kind: 'fire' },
        upgradeCost: 350,
        ability: { label: 'Cinderstorm' },
        description: 'A 104 px lake of fire, 26 per tick. The whole road commits to burning.',
      },
    },
  },

  venom: {
    plague: {
      elite: {
        slug: 'plague-2',
        title: 'Pestilence Vat',
        damage: 66,
        range: 184,
        cooldown: 950,
        splash: 68,
        dot: { damage: 20, tickMs: 500, durationMs: 3200, kind: 'poison' },
        upgradeCost: 180,
        ability: { label: 'Pestilence' },
        description: 'The burst spreads: 68 px of poison at 20 per tick. Armour is irrelevant.',
      },
      apex: {
        slug: 'plague-3',
        title: 'Plague Sovereign',
        damage: 76,
        range: 192,
        cooldown: 900,
        splash: 76,
        dot: { damage: 30, tickMs: 500, durationMs: 3600, kind: 'poison' },
        upgradeCost: 350,
        ability: { label: 'Pandemic' },
        description: 'One flask empties a lane: 30 poison per tick that ignores every point of armour.',
      },
    },
    corrosive: {
      elite: {
        slug: 'corrosive-2',
        title: 'Aqua Fortis',
        damage: 54,
        range: 192,
        cooldown: 930,
        armorBreak: 28,
        armorBreakMs: 4200,
        dot: { damage: 18, tickMs: 500, durationMs: 3200, kind: 'poison' },
        upgradeCost: 165,
        ability: { label: 'Dissolve' },
        description: '28 armour dissolved for 4.2 s while the acid keeps working.',
      },
      apex: {
        slug: 'corrosive-3',
        title: 'Universal Solvent',
        damage: 70,
        range: 200,
        cooldown: 880,
        armorBreak: 40,
        armorBreakMs: 4800,
        dot: { damage: 24, tickMs: 500, durationMs: 3600, kind: 'poison' },
        upgradeCost: 330,
        ability: { label: 'Universal Solvent' },
        description: '40 armour gone for nearly five seconds. Every other line hits twice as hard.',
      },
    },
  },

  harpoon: {
    ballista: {
      elite: {
        slug: 'ballista-2',
        title: 'Great Harpoon',
        damage: 620,
        range: 258,
        cooldown: 2500,
        armorPenetration: 0.6,
        bossBonus: 0.6,
        stunMs: 400,
        upgradeCost: 240,
        ability: { label: 'Skewer' },
        description: '620 damage, 400 ms stun, +60 % against bosses. Every titan notices.',
      },
      apex: {
        slug: 'ballista-3',
        title: 'Kraken Harpoon',
        damage: 800,
        range: 268,
        cooldown: 2400,
        armorPenetration: 0.7,
        bossBonus: 0.8,
        stunMs: 500,
        upgradeCost: 470,
        ability: { label: 'Kraken Skewer' },
        description: '880 damage that lands like a falling mast. +80 % against bosses, half a second stunned.',
      },
    },
    grapple: {
      elite: {
        slug: 'grapple-2',
        title: 'Anchor Winch',
        damage: 280,
        range: 240,
        cooldown: 1700,
        armorPenetration: 0.4,
        slow: 0.45,
        slowMs: 1400,
        bossBonus: 0.3,
        stunMs: 900,
        upgradeCost: 210,
        ability: { label: 'Anchor Chain' },
        description: '900 ms stun into a 45 % slow. The lane stops where the rope ends.',
      },
      apex: {
        slug: 'grapple-3',
        title: 'Leviathan Winch',
        damage: 330,
        range: 248,
        cooldown: 1450,
        armorPenetration: 0.5,
        slow: 0.55,
        slowMs: 1600,
        bossBonus: 0.4,
        stunMs: 1200,
        upgradeCost: 410,
        ability: { label: 'Leviathan Chain' },
        description: '227 DPS of control: 1.2 s stun, then a 55 % slow while everything else fires.',
      },
    },
  },

  banner: {
    warbanner: {
      elite: {
        slug: 'warbanner-2',
        title: 'Warlord Banner',
        damage: 40,
        range: 182,
        cooldown: 1100,
        upgradeCost: 160,
        aura: { radius: 210, damageBonus: 0.42, rangeBonus: 0.18 },
        ability: { label: 'Rally' },
        description: 'Rally aura: +42% damage and +18% range within 210px.',
      },
      apex: {
        slug: 'warbanner-3',
        title: 'Sovereign Standard',
        damage: 54,
        range: 192,
        cooldown: 1050,
        upgradeCost: 315,
        aura: { radius: 240, damageBonus: 0.55, rangeBonus: 0.24, fireRateBonus: 0.12 },
        ability: { label: 'Sovereign Rally' },
        description: 'The whole kill zone fights better: +55% damage, +24% range, +12% fire rate.',
      },
    },
    muster: {
      elite: {
        slug: 'muster-2',
        title: 'Muster Garrison',
        damage: 32,
        range: 178,
        cooldown: 1100,
        upgradeCost: 165,
        aura: { radius: 185, damageBonus: 0.26, rangeBonus: 0.08, fireRateBonus: 0.2, coinPerKill: 2 },
        ability: { label: 'Muster' },
        description: 'Nearby towers fire 20% faster; every kill inside pays 2 extra gold.',
      },
      apex: {
        slug: 'muster-3',
        title: 'War Camp',
        damage: 44,
        range: 188,
        cooldown: 1050,
        upgradeCost: 325,
        aura: { radius: 205, damageBonus: 0.34, rangeBonus: 0.12, fireRateBonus: 0.28, coinPerKill: 3 },
        ability: { label: 'War Camp' },
        description: 'Nearby towers fire 28% faster and every kill pays 3 extra gold.',
      },
    },
  },
};

/** Level at which the branch is chosen (and art switches to spec-a/spec-b). */
export const BRANCH_LEVEL = 3;

/**
 * Stats for one tier of a specialisation.
 * @param {string} typeKey
 * @param {string} specKey
 * @param {number} level 1-based tower level (3, 4 or 5 on this path)
 * @returns {object|null} the tier block, or null when the level is not ascended
 */
export function ascensionTier(typeKey, specKey, level) {
  const line = ASCENSION[typeKey];
  const spec = line && line[specKey];
  if (!spec) return null;
  if (level >= 5) return spec.apex;
  if (level >= 4) return spec.elite;
  return null;
}

/** Upgrade option (cost + preview) from `level` to `level + 1`, or null. */
export function nextAscension(typeKey, specKey, level) {
  // A maxed tower has nothing to buy. Without this guard `ascensionTier` would
  // clamp 6 down to the apex block and the shop would happily sell "level 6".
  if (level >= MAX_LEVEL) return null;
  const tier = ascensionTier(typeKey, specKey, level + 1);
  if (!tier) return null;
  return { key: `${specKey}-${level + 1}`, specKey, ...tier };
}
