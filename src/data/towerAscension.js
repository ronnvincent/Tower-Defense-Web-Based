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
        damage: 26,
        range: 186,
        cooldown: 205,
        upgradeCost: 170,
        ability: { shots: 2, label: 'Twin Volley' },
        description: 'Two bolts per draw. The lane starts to look like rain.',
      },
      apex: {
        slug: 'rapid-3',
        title: 'Storm Ranger',
        damage: 30,
        range: 196,
        cooldown: 200,
        upgradeCost: 300,
        ability: { shots: 3, label: 'Arrow Storm' },
        description: 'Three bolts a draw, each re-aimed. Nothing unarmoured walks through it.',
      },
    },
    sniper: {
      elite: {
        slug: 'sniper-2',
        title: 'Ballista Marksman',
        damage: 270,
        range: 265,
        cooldown: 1150,
        armorPenetration: 0.6,
        upgradeCost: 180,
        ability: { label: 'Deadeye' },
        description: 'One bolt, one corpse. 60% armour penetration.',
      },
      apex: {
        slug: 'sniper-3',
        title: 'Siege Ballista',
        damage: 260,
        range: 280,
        cooldown: 1150,
        armorPenetration: 0.8,
        upgradeCost: 320,
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
        upgradeCost: 190,
        ability: { label: 'Heavy Mortar' },
        description: 'A 112px crater on every lob.',
      },
      apex: {
        slug: 'siege-3',
        title: 'Cataclysm Battery',
        damage: 220,
        range: 190,
        cooldown: 1250,
        splash: 128,
        upgradeCost: 340,
        ability: { shots: 2, label: 'Twin Bombard' },
        description: 'Two shells per volley, 128px blast each. The lane simply stops existing.',
      },
    },
    artillery: {
      elite: {
        slug: 'artillery-2',
        title: 'Stone Breaker',
        damage: 340,
        range: 198,
        cooldown: 1900,
        splash: 76,
        armorBreak: 30,
        armorBreakMs: 4500,
        upgradeCost: 200,
        ability: { label: 'Sunder' },
        description: 'Breaks 30 armour for 4.5s. Every other tower hits harder afterwards.',
      },
      apex: {
        slug: 'artillery-3',
        title: 'Titan Breaker',
        damage: 560,
        range: 206,
        cooldown: 1800,
        splash: 84,
        armorBreak: 40,
        armorBreakMs: 5000,
        upgradeCost: 360,
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
        damage: 34,
        range: 176,
        cooldown: 720,
        slow: 0.68,
        slowMs: 2500,
        upgradeCost: 175,
        ability: { label: 'Deep Chill' },
        description: '68% slow for 2.5s — the lane freezes in place.',
      },
      apex: {
        slug: 'blizzard-3',
        title: 'Winterhold',
        damage: 48,
        range: 186,
        cooldown: 660,
        slow: 0.75,
        slowMs: 3000,
        upgradeCost: 330,
        nova: 96,
        ability: { nova: 96, label: 'Frost Nova' },
        description: 'Every hit detonates a 96px nova that chills the whole pack.',
      },
    },
    lightning: {
      elite: {
        slug: 'lightning-2',
        title: 'Storm Conduit',
        damage: 80,
        range: 170,
        cooldown: 760,
        chainTargets: 4,
        chainRange: 100,
        upgradeCost: 185,
        ability: { label: 'Arc Chain' },
        description: 'Arcs through 4 targets at 100px reach.',
      },
      apex: {
        slug: 'lightning-3',
        title: 'Thunder Spire',
        damage: 118,
        range: 180,
        cooldown: 700,
        chainTargets: 6,
        chainRange: 115,
        upgradeCost: 340,
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
        damage: 210,
        range: 168,
        cooldown: 1280,
        splash: 100,
        armorBreak: 26,
        armorBreakMs: 3800,
        upgradeCost: 190,
        ability: { label: 'Magma Slam' },
        description: 'Molten 100px slam, 26 armour melted for 3.8s.',
      },
      apex: {
        slug: 'ember-3',
        title: 'Volcano Forge',
        damage: 220,
        range: 176,
        cooldown: 1300,
        splash: 110,
        armorBreak: 34,
        armorBreakMs: 4200,
        upgradeCost: 350,
        ability: { shots: 2, label: 'Eruption' },
        description: 'Two hammer blows per cycle, each a 110px eruption.',
      },
    },
    thunder: {
      elite: {
        slug: 'thunder-2',
        title: 'Stormforge',
        damage: 160,
        range: 192,
        cooldown: 1320,
        splash: 108,
        armorPenetration: 0.45,
        upgradeCost: 195,
        ability: { label: 'Shockwave' },
        description: '108px shockwave that punches 45% through armour.',
      },
      apex: {
        slug: 'thunder-3',
        title: 'Skybreaker',
        damage: 230,
        range: 200,
        cooldown: 1240,
        splash: 118,
        armorPenetration: 0.6,
        upgradeCost: 355,
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
        upgradeCost: 185,
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
        upgradeCost: 345,
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
        upgradeCost: 180,
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
        upgradeCost: 340,
        ability: { shots: 2, label: 'Rune Split' },
        description: 'Two splitting runes per cast, 96px each. The screen goes violet.',
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
        upgradeCost: 165,
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
        upgradeCost: 320,
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
        upgradeCost: 170,
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
        upgradeCost: 330,
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
