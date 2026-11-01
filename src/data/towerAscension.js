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
        damage: 25,
        range: 186,
        cooldown: 210,
        upgradeCost: 135,
        ability: { shots: 2, label: 'Twin Volley' },
        description: 'Two bolts per draw. The lane starts to look like rain.',
      },
      apex: {
        slug: 'rapid-3',
        title: 'Storm Ranger',
        damage: 32,
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
        description: '545 damage and 40 armour off the target for 5s. Bosses feel this.',
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
        upgradeCost: 205,
        ability: { label: 'Magma Slam' },
        description: 'Molten 100px slam — the widest blast in the forge, and it never stops landing.',
      },
      apex: {
        slug: 'ember-3',
        title: 'Volcano Forge',
        damage: 190,
        range: 176,
        cooldown: 1300,
        splash: 110,
        upgradeCost: 400,
        ability: { shots: 2, label: 'Eruption' },
        description: 'Two hammer blows per cycle, each a 110px eruption.',
      },
    },
    thunder: {
      elite: {
        slug: 'thunder-2',
        title: 'Stormforge',
        damage: 240,
        range: 192,
        cooldown: 1320,
        splash: 80,
        armorPenetration: 0.45,
        upgradeCost: 210,
        ability: { label: 'Shockwave' },
        description: '80px shockwave that punches 45% through armour.',
      },
      apex: {
        slug: 'thunder-3',
        title: 'Skybreaker',
        damage: 330,
        range: 200,
        cooldown: 1240,
        splash: 90,
        armorPenetration: 0.6,
        upgradeCost: 405,
        ability: { label: 'Skyfall' },
        description: '90px shockwave, 60% armour penetration. The ground answers.',
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
        damage: 62,
        range: 186,
        cooldown: 240,
        armorPenetration: 0.2,
        upgradeCost: 160,
        ability: { label: 'Winding Volley' },
        description: 'Two crank housings feed the same rail: 258 DPS of armour-piercing bolts.',
      },
      apex: {
        slug: 'repeater-3',
        title: 'Storm Repeater',
        damage: 48,
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
        damage: 22,
        range: 144,
        cooldown: 120,
        armorBreak: 34,
        armorBreakMs: 1600,
        upgradeCost: 180,
        ability: { label: 'Ablative Burst' },
        description: 'Every burst strips 34 armour for 1.6 s — the longer it fires, the softer the target.',
      },
      apex: {
        slug: 'shred-3',
        title: 'Ablative Reaper',
        damage: 26,
        range: 152,
        cooldown: 100,
        armorBreak: 40,
        armorBreakMs: 1800,
        upgradeCost: 350,
        ability: { label: 'Ablative Shred' },
        description: '260 DPS that also deletes 40 armour per burst. Tanks stop being tanks.',
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
        splash: 140,
        dot: { damage: 18, tickMs: 500, durationMs: 3200, kind: 'fire' },
        upgradeCost: 180,
        ability: { label: 'Firestorm' },
        description: '140 px burning pool, 18 per tick for 3.2 s. Placement matters more than aim.',
      },
      apex: {
        slug: 'napalm-3',
        title: 'Cinderstorm',
        damage: 84,
        range: 148,
        cooldown: 880,
        splash: 152,
        dot: { damage: 26, tickMs: 500, durationMs: 3600, kind: 'fire' },
        upgradeCost: 350,
        ability: { label: 'Cinderstorm' },
        description: 'A 152 px lake of fire, 26 per tick. The whole road commits to burning.',
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
        damage: 76,
        range: 192,
        cooldown: 930,
        armorBreak: 36,
        armorBreakMs: 4200,
        dot: { damage: 18, tickMs: 500, durationMs: 3200, kind: 'poison' },
        upgradeCost: 165,
        ability: { label: 'Dissolve' },
        description: '28 armour dissolved for 4.2 s while the acid keeps working.',
      },
      apex: {
        slug: 'corrosive-3',
        title: 'Universal Solvent',
        damage: 96,
        range: 200,
        cooldown: 880,
        armorBreak: 48,
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
        description: '800 damage that lands like a falling mast. +80 % against bosses, half a second stunned.',
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
        upgradeCost: 130,
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
        upgradeCost: 240,
        aura: { radius: 205, damageBonus: 0.34, rangeBonus: 0.12, fireRateBonus: 0.28, coinPerKill: 3 },
        ability: { label: 'War Camp' },
        description: 'Nearby towers fire 28% faster and every kill pays 3 extra gold.',
      },
    },
  },

  /* ================================================== the ten royal lines */
  royalArtillery: {
    bombard: {
      elite: { slug: 'bombard-2', title: 'Counterweight Bombard', upgradeCost: 240, damage: 640, range: 820, cooldown: 3600, damageType: 'explosive', armorPenetration: 0.5, bossBonus: 0.3, description: 'One 640 damage shell every 3.6 s across 820 px: 178 DPS, 50 % penetration and a 30 % titan bonus. Slower than the salvo battery and far heavier.' },
      apex: { slug: 'bombard-3', title: 'Royal Siege Battery', upgradeCost: 290, damage: 900, range: 840, cooldown: 3400, damageType: 'explosive', armorPenetration: 0.6, description: 'Twin-banded royal bombard, 900 a shell. Eleven waves of reload paid off.', bossBonus: 0.34, ability: { label: 'Titan Shell' } },
    },
    battery: {
      elite: { slug: 'battery-2', title: 'Salvo Culverin', upgradeCost: 230, damage: 265, range: 740, cooldown: 2700, damageType: 'explosive', armorPenetration: 0.38, ability: { shots: 2, label: 'Salvo Pair' }, description: 'Two 265 damage shells every 2.7 s: 196 DPS, 740 px of reach, twice the bombard rate for less per shell.' },
      apex: { slug: 'battery-3', title: 'Royal Salvo Battery', upgradeCost: 280, damage: 380, range: 760, cooldown: 2500, damageType: 'explosive', armorPenetration: 0.46, ability: { shots: 2, label: 'Salvo Pair' }, description: '380 damage per shell, two shells a volley: 304 DPS across 760 px. The bombard’s single shell is heavier and pierces more armour; this battery simply fires more of them.' },
    },
  },
  siegeBallista: {
    arbalest: {
      elite: { slug: 'arbalest-2', title: 'Torsion Siege Bow', upgradeCost: 200, damage: 225, range: 320, cooldown: 1180, damageType: 'piercing', armorPenetration: 0.78, bossBonus: 0.33, description: '225 damage a bolt at 78 % penetration: 191 DPS that ignores most plate, plus a 33 % bonus against titans. The repeater still out-rates it on bare skin.' },
      apex: { slug: 'arbalest-3', title: 'Colossus Ballista', upgradeCost: 280, damage: 250, range: 340, cooldown: 1050, damageType: 'piercing', armorPenetration: 0.85, bossBonus: 0.4, description: 'Twin torsion springs and a bolt as long as a spear.', ability: { label: 'Plate Splitter' } },
    },
    repeater: {
      elite: { slug: 'repeater-2', title: 'Windlass Repeater', upgradeCost: 190, damage: 110, range: 300, cooldown: 900, damageType: 'physical', armorPenetration: 0, ability: { shots: 2, label: 'Twin Bolt' }, description: 'Twin bolts out of one draw: 110 damage each, 244 DPS against a single body. No boss bonus — this bow clears runners, the arbalest kills plate.' },
      apex: { slug: 'repeater-3', title: 'Hailstorm Ballista', upgradeCost: 270, damage: 120, range: 310, cooldown: 800, damageType: 'physical', armorPenetration: 0, ability: { shots: 2, label: 'Twin Bolt' }, description: 'Two 120 damage bolts every 0.8 s: 300 DPS on one body, no penetration at all. It out-rates the arbalest and loses to it on plate.' },
    },
  },
  arcaneSniper: {
    marksman: {
      elite: { slug: 'marksman-2', title: 'Astral Lattice', upgradeCost: 250, damage: 290, range: 410, cooldown: 1650, damageType: 'magic', armorPenetration: 0.52, description: '290 damage in one lance every 1.65 s: 176 DPS at 410 range. The hex weaver trades that reach for a burst and a snare.' },
      apex: { slug: 'marksman-3', title: 'Arcane Longshot Spire', upgradeCost: 340, damage: 400, range: 430, cooldown: 1500, damageType: 'magic', armorPenetration: 0.6, description: 'Five lattices stacked into a spire, and one very deliberate beam.', ability: { label: 'Long Lance' } },
    },
    hexweaver: {
      elite: { slug: 'hexweaver-2', title: 'Curse Lattice', upgradeCost: 240, damage: 155, range: 375, cooldown: 1500, damageType: 'magic', armorPenetration: 0.36, splash: 70, slow: 0.22, slowMs: 1000, description: '155 damage on a 70 px burst, −22 % movement for a second: 103 DPS in an area the marksman cannot reach.' },
      apex: { slug: 'hexweaver-3', title: 'Hex Spire', upgradeCost: 330, damage: 200, range: 385, cooldown: 1400, damageType: 'magic', armorPenetration: 0.42, splash: 85, slow: 0.26, slowMs: 1100, description: '200 damage across an 85 px hex, −26 % speed for 1.1 s, 143 DPS. Area denial, not assassination.', ability: { label: 'Hex Burst' } },
    },
  },
  mortar: {
    greatmortar: {
      elite: { slug: 'greatmortar-2', title: 'Twin-Vent Mortar', upgradeCost: 240, damage: 135, range: 410, cooldown: 2150, damageType: 'explosive', splash: 130, targetsGround: true, targetsAir: false, description: '135 damage across a 130 px blast every 2.15 s, ground only. The cluster battery fires two shells; this one covers more road with each.' },
      apex: { slug: 'greatmortar-3', title: 'Royal Siege Mortar', upgradeCost: 330, damage: 180, range: 430, cooldown: 1950, damageType: 'explosive', splash: 150, targetsGround: true, targetsAir: false, description: 'A graduated arc, a stone cradle and a 150 px crater.', ability: { label: 'Wide Blast' } },
    },
    cluster: {
      elite: { slug: 'cluster-2', title: 'Fanned Mortar', upgradeCost: 230, damage: 62, range: 370, cooldown: 1800, damageType: 'explosive', splash: 65, targetsGround: true, targetsAir: false, ability: { shots: 2, label: 'Fanned Salvo' }, description: '62 damage a shell, two shells per salvo, 69 DPS on a single body with a 65 px blast. Wider coverage than the great mortar, weaker per shell.' },
      apex: { slug: 'cluster-3', title: 'Royal Cluster Battery', upgradeCost: 320, damage: 96, range: 380, cooldown: 1700, damageType: 'explosive', splash: 78, targetsGround: true, targetsAir: false, ability: { shots: 2, label: 'Fanned Salvo' }, description: 'Two 96 damage shells on a 78 px blast, 113 DPS into one target. The great mortar still covers more ground per shell.' },
    },
  },
  rimeTower: {
    glacier: {
      elite: { slug: 'glacier-2', title: 'Winter Core', upgradeCost: 170, damage: 54, range: 220, cooldown: 800, damageType: 'magic', slow: 0.45, slowMs: 1800, splash: 72, description: '54 damage on a 72 px burst and a 45 % snare for 1.8 s. The tempest spreads wider; the glacier holds the lane still.' },
      apex: { slug: 'glacier-3', title: 'Hoarfrost Crown', upgradeCost: 220, damage: 70, range: 230, cooldown: 760, damageType: 'magic', slow: 0.5, slowMs: 2200, splash: 80, description: 'A crown of ice: −50 % for 2.2 s, and every hit splashes the chill.', ability: { label: 'Deep Freeze' } },
    },
    tempest: {
      elite: { slug: 'tempest-2', title: 'Rime Gale', upgradeCost: 160, damage: 44, range: 212, cooldown: 660, damageType: 'magic', splash: 105, description: '44 damage across a 105 px gale, 67 DPS: the widest chill in the roster and none of the glacier’s snare.' },
      apex: { slug: 'tempest-3', title: 'Winter Tempest', upgradeCost: 210, damage: 56, range: 224, cooldown: 620, damageType: 'magic', splash: 120, description: '56 damage on a 120 px blast, 90 DPS. It chills the whole bend; the glacier stops one creep dead.', ability: { label: 'Shard Fan' } },
    },
  },
  tesla: {
    chain: {
      elite: { slug: 'chain-2', title: 'Storm Cage', upgradeCost: 200, damage: 100, range: 220, cooldown: 1150, damageType: 'lightning', chainTargets: 4, chainRange: 122, chainFalloff: 0.72, description: '100 damage that arcs to four more bodies at 72 % carried: 348 DPS across a pack. The arc cannon still wins a single duel.' },
      apex: { slug: 'chain-3', title: 'Thunderhead', upgradeCost: 280, damage: 130, range: 235, cooldown: 1050, damageType: 'lightning', chainTargets: 5, chainRange: 130, chainFalloff: 0.75, description: 'Five extra bodies, 75 % carried per hop. Ground and air alike.', ability: { label: 'Five-Body Chain' } },
    },
    arccannon: {
      elite: { slug: 'arccannon-2', title: 'Thunder Lance', upgradeCost: 190, damage: 155, range: 230, cooldown: 1200, damageType: 'lightning', chainTargets: 1, chainRange: 96, chainFalloff: 0.6, description: '155 damage into the first body, 129 DPS, and one short hop behind it. The coil still wins the crowd.' },
      apex: { slug: 'arccannon-3', title: 'Storm Cannon', upgradeCost: 270, damage: 200, range: 240, cooldown: 1100, damageType: 'lightning', chainTargets: 2, chainRange: 104, chainFalloff: 0.65, description: '200 damage on impact, 182 DPS, two hops at 65 % carried. A duelist that happens to arc.', ability: { label: 'Heavy Arc' } },
    },
  },
  skybreaker: {
    lance: {
      elite: { slug: 'lance-2', title: 'Radar Battery', upgradeCost: 220, damage: 155, range: 345, cooldown: 1000, damageType: 'piercing', bossBonus: 0.35, description: '155 damage a bolt, 155 DPS against the air, with a 35 % titan bonus. The flak battery covers a swarm instead.' },
      apex: { slug: 'lance-3', title: 'Sky Citadel', upgradeCost: 310, damage: 205, range: 360, cooldown: 920, damageType: 'piercing', bossBonus: 0.4, description: 'Six barrels and a spotter glass. Nothing with wings survives the approach.', ability: { label: 'Titan Tracker' } },
    },
    flak: {
      elite: { slug: 'flak-2', title: 'Burst Battery', upgradeCost: 210, damage: 50, range: 325, cooldown: 700, damageType: 'piercing', splash: 65, bossBonus: 0.18, ability: { shots: 2, label: 'Burst Pair' }, description: '50 damage a burst, two bursts every 0.7 s, 65 px of splinter radius: 143 DPS against anything with wings.' },
      apex: { slug: 'flak-3', title: 'Royal Flak Battery', upgradeCost: 300, damage: 55, range: 335, cooldown: 640, damageType: 'piercing', splash: 78, bossBonus: 0.2, ability: { shots: 2, label: 'Burst Pair' }, description: 'Two 55 damage bursts every 0.64 s across a 78 px blast: 172 DPS on a pack. The lance is still the answer to a single wyrm.' },
    },
  },
  workshop: {
    master: {
      elite: { slug: 'master-2', title: 'Siege Workshop', upgradeCost: 250, damage: 0, range: 0, cooldown: 0, damageType: 'true', aura: { radius: 260, fireRateBonus: 0.22, rangeBonus: 0.15 }, repair: { radius: 230, perSecond: 30 }, description: '+22 % fire rate and +15 % range across 260 px, and the crew puts 30 HP a second back into the worst-hit building.' },
      apex: { slug: 'master-3', title: 'Royal Foundry', upgradeCost: 340, damage: 0, range: 0, cooldown: 0, damageType: 'true', aura: { radius: 300, fireRateBonus: 0.28, rangeBonus: 0.18 }, repair: { radius: 260, perSecond: 42 }, ability: { label: 'Foundry Aura' }, description: '+28 % fire rate, +18 % range, and 42 HP/s of repairs across 260 px.' },
    },
    engineer: {
      elite: { slug: 'engineer-2', title: 'Engineer Company', upgradeCost: 240, damage: 0, range: 0, cooldown: 0, damageType: 'true', aura: { radius: 300, fireRateBonus: 0.3, rangeBonus: 0.2 }, repair: { radius: 210, perSecond: 18 }, description: '+30 % fire rate across 300 px and a 210 px repair crew at 18 HP a second. The foundry still puts more stone back.' },
      apex: { slug: 'engineer-3', title: 'Royal Engineer Corps', upgradeCost: 330, damage: 0, range: 0, cooldown: 0, damageType: 'true', aura: { radius: 330, fireRateBonus: 0.36, rangeBonus: 0.24 }, repair: { radius: 230, perSecond: 26 }, ability: { label: 'Corps Aura' }, description: '+36 % fire rate over 330 px — the widest aura in the roster — and a repair crew half the foundry’s size.' },
    },
  },
  obelisk: {
    rune: {
      elite: { slug: 'rune-2', title: 'Sigil Monolith', upgradeCost: 260, damage: 0, range: 0, cooldown: 0, damageType: 'magic', debuff: { radius: 250, armorBreak: 20, resistanceBreak: 0.24 }, description: '−20 armour and −24 % resistance across 250 px. The null obelisk trades the armour break for twice the resistance break.' },
      apex: { slug: 'rune-3', title: 'Warding Colossus', upgradeCost: 350, damage: 0, range: 0, cooldown: 0, damageType: 'magic', debuff: { radius: 270, armorBreak: 26, resistanceBreak: 0.3 }, ability: { label: 'Ward Break' }, description: '−26 armour and −30 % resistance across 270 px. The whole lane feels it.' },
    },
    nullify: {
      elite: { slug: 'nullify-2', title: 'Void Monolith', upgradeCost: 250, damage: 0, range: 0, cooldown: 0, damageType: 'magic', debuff: { radius: 215, armorBreak: 12, resistanceBreak: 0.4 }, description: '−40 % resistance across 215 px, with a token 12 armour off. Magic towers do the rest.' },
      apex: { slug: 'nullify-3', title: 'Null Colossus', upgradeCost: 340, damage: 0, range: 0, cooldown: 0, damageType: 'magic', debuff: { radius: 235, armorBreak: 15, resistanceBreak: 0.5 }, ability: { label: 'Resistance Void' }, description: '−50 % resistance inside 235 px. The colossus makes every mage on the field hit twice as hard; it never strips armour like the ward.' },
    },
  },
  spikeTrap: {
    impaler: {
      elite: { slug: 'impaler-2', title: 'Iron Maw', upgradeCost: 240, damage: 300, range: 0, cooldown: 4600, damageType: 'physical', trapRadius: 56, trapCooldown: 4600, targetsGround: true, targetsAir: false, description: '300 damage to every ground creep on a 56 px plate, every 4.6 s. The caltrop field bites a much wider one.' },
      apex: { slug: 'impaler-3', title: 'Royal Caltrop Field', upgradeCost: 330, damage: 420, range: 0, cooldown: 4000, damageType: 'physical', trapRadius: 60, trapCooldown: 4000, targetsGround: true, targetsAir: false, description: '420 damage every 4 s across 60 px. A chokepoint turns into a grinder.', ability: { label: 'Single Bite' } },
    },
    caltrop: {
      elite: { slug: 'caltrop-2', title: 'Spike Field', upgradeCost: 230, damage: 150, range: 0, cooldown: 2700, damageType: 'physical', trapRadius: 86, trapCooldown: 2700, targetsGround: true, targetsAir: false, description: '150 damage to everything inside 86 px, every 2.7 s. The impaler hits one body much harder.' },
      apex: { slug: 'caltrop-3', title: 'Royal Spike Field', upgradeCost: 320, damage: 210, range: 0, cooldown: 2400, damageType: 'physical', trapRadius: 96, trapCooldown: 2400, targetsGround: true, targetsAir: false, description: '210 damage across a 96 px plate every 2.4 s: the whole lane bleeds. A single impaler still delivers twice the damage to one body.', ability: { label: 'Wide Field' } },
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
