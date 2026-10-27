/**
 * The ten **royal** defence lines — the base-defence roster.
 *
 * These are deliberately *not* more stone keeps with a different pennant. Each
 * one answers a question the current twelve lines cannot:
 *
 *   artillery   Royal Siege Artillery  extreme-range single-target siege gun,
 *                                     player-configurable priority + category
 *   ballista    Siege Ballista         armour-piercing bolt thrower
 *   arcane      Arcane Sniper Tower    long-range magic lance, priority panel
 *   mortar      Mortar Tower           lobbed area shell with real coordinates
 *   frost       Frost Tower            damage plus movement slow
 *   tesla       Tesla Tower            bounded chain lightning
 *   skybreaker  Skybreaker Tower       dedicated anti-air, air only
 *   workshop    Engineer Workshop      fire-rate / range aura and repairs
 *   obelisk     Warding Obelisk        armour and resistance debuff field
 *   spike       Spike Trap             road trap on a reusable cooldown
 *
 * ## Progression model
 *
 * The twelve older lines branch at level 3 (`levels` + `specializations`). The
 * royal lines are **linear**: one authored level per tier, L1 → L5, with no
 * specialisation choice. `linear: true` tells `Tower` to step through
 * `levels[]` instead of asking for a branch, which is why the same upgrade
 * button, the same cost check and the same L5 cap keep working untouched.
 *
 * Every tier must be a *structurally* different building — the art pipeline
 * (`scripts/build_royal_defences.py`) adds masonry, machinery and mountings per
 * level, never a tint or a scale. `art.footprint` below is the silhouette
 * contract the generator draws against.
 *
 * ## Balance contract (`docs/royal-defences.md` §3)
 *
 *   - a level-1 line sits between 0.20 and 0.32 single-target DPS per gold;
 *   - artillery and the arcane sniper buy *reach and burst*, not rate — their
 *     DPS per gold is the lowest of the roster and their reload the longest;
 *   - support lines are judged on the damage they add, not on their own DPS;
 *   - L5 costs 3.4–4.9× the entry price and tops out at 3.5–4.3× its L1 DPS.
 *
 * ## Fields the runtime understands
 *
 *   linear            no specialisation branches; L1…L5 walk `levels`
 *   targetsGround     false → never aims at, splashes or chains into ground units
 *   targetsAir        false → never aims at, splashes or chains into flyers
 *   minRange          inside this radius the weapon cannot depress enough to fire
 *   targeting         which priority modes and category filters the inspector
 *                     offers, and which pair it starts with
 *   supportOnly       no attack loop at all (aura / repair instead)
 *   trap              triggered by proximity instead of a target lock
 *   aura              { radius, fireRateBonus, rangeBonus } — support field
 *   debuff            { radius, armorBreak, resistanceBreak } — enemy debuff field
 *   repair            { radius, perSecond } — structure repair inside the field
 *   trapRadius        trigger radius in pixels
 *   trapCooldown      milliseconds between activations
 *   splash            real damage radius in pixels (no visual-only radius)
 *   slow / slowMs     movement slow fraction and its duration
 *   chainTargets      extra enemies a bolt may arc to (excluding the first)
 *   chainRange        maximum hop distance
 *   chainFalloff      damage multiplier applied *per hop*
 */

import { TARGETING_MODE } from '../entities/TowerTargeting.js';

/** Build the five linear tiers of a line from one row per tier. */
function track(rows) {
  return rows.map((row, index) => ({
    level: index + 1,
    ...row,
  }));
}

/**
 * A targeting panel is only offered where the choice *matters*: a slow siege
 * gun picking the boss out of a crowd, a sniper choosing the elite, an
 * anti-air battery choosing the fastest flyer. Everything else keeps the four
 * classic modes from the inspector.
 */
const SIEGE_TARGETING = {
  modes: [
    TARGETING_MODE.BOSS,
    TARGETING_MODE.STRONGEST,
    TARGETING_MODE.WEAKEST,
    TARGETING_MODE.NEAREST,
    TARGETING_MODE.FASTEST,
    TARGETING_MODE.FIRST,
  ],
  categories: ['both', 'ground', 'air'],
  defaultMode: TARGETING_MODE.BOSS,
  defaultCategory: 'both',
  panel: true,
  /** Shown under the panel so the rule is on screen, not in a doc only. */
  note: 'The shell keeps the target it was fired at — it never switches mid-flight.',
};

const AA_TARGETING = {
  modes: [TARGETING_MODE.FASTEST, TARGETING_MODE.BOSS, TARGETING_MODE.NEAREST, TARGETING_MODE.STRONGEST],
  categories: ['air'],
  defaultMode: TARGETING_MODE.FASTEST,
  defaultCategory: 'air',
  panel: true,
  note: 'Air only: ground creeps are invisible to the tracker.',
};

export const ROYAL_LINES = [
  'royalArtillery',
  'siegeBallista',
  'arcaneSniper',
  'mortar',
  'rimeTower',
  'tesla',
  'skybreaker',
  'workshop',
  'obelisk',
  'spikeTrap',
];

export const ROYAL_TOWER_TYPES = {
  /* ==================================================== royal siege artillery */
  royalArtillery: {
    key: 'royalArtillery',
    name: 'Royal Siege Artillery',
    shortName: 'Artillery',
    hotkey: 'z',
    cost: 300,
    role: 'Siege',
    linear: true,
    placement: 'grass',
    description:
      'The long arm of the crown: one enormous shell, a huge reload and enough reach to cover half the field. The answer to a boss, not to a crowd.',
    projectile: 'royalShell',
    projectileSpeed: 620,
    damageType: 'explosive',
    targetsGround: true,
    targetsAir: true,
    minRange: 100,
    targeting: SIEGE_TARGETING,
    /** Silhouette contract for the generator: [width, height] in px at L1. */
    art: { footprint: [52, 96], material: 'oak-iron', rise: 10 },
    levels: track([
      {
        title: 'Field Bombard',
        damage: 260,
        range: 430,
        cooldown: 4200,
        damageType: 'explosive',
        armorPenetration: 0.25,
        minRange: 100,
        description: 'A bronze bombard on an oak sledge. One shot every 4.2 s — but it reaches the far lane.',
      },
      {
        title: 'Banded Siege Gun',
        upgradeCost: 160,
        damage: 360,
        range: 450,
        cooldown: 4000,
        damageType: 'explosive',
        armorPenetration: 0.3,
        minRange: 105,
      },
      {
        title: 'Bastion Culverin',
        upgradeCost: 230,
        damage: 480,
        range: 470,
        cooldown: 3800,
        damageType: 'explosive',
        armorPenetration: 0.4,
        minRange: 110,
      },
      {
        title: 'Counterweight Bombard',
        upgradeCost: 330,
        damage: 640,
        range: 495,
        cooldown: 3600,
        damageType: 'explosive',
        armorPenetration: 0.5,
        minRange: 115,
      },
      {
        title: 'Royal Siege Battery',
        upgradeCost: 460,
        damage: 900,
        range: 520,
        cooldown: 3400,
        damageType: 'explosive',
        armorPenetration: 0.6,
        minRange: 120,
        description: 'Twin-banded royal bombard, 900 a shell. Eleven waves of reload paid off.',
      },
    ]),
  },

  /* ============================================================ siege ballista */
  siegeBallista: {
    key: 'siegeBallista',
    name: 'Siege Ballista',
    shortName: 'Ballista',
    hotkey: 'x',
    cost: 150,
    role: 'Anti-armour',
    linear: true,
    placement: 'grass',
    description:
      'A great bow on a swivel: faster and shorter-ranged than the artillery, and its bolt goes straight through plate. The armoured column’s problem.',
    projectile: 'royalBolt',
    projectileSpeed: 900,
    damageType: 'piercing',
    targetsGround: true,
    targetsAir: true,
    art: { footprint: [46, 84], material: 'yew-steel', rise: 8 },
    levels: track([
      {
        title: 'Field Ballista',
        damage: 70,
        range: 250,
        cooldown: 1450,
        damageType: 'piercing',
        armorPenetration: 0.55,
        bossBonus: 0.15,
        description: 'A yew prod with an iron claw and a two-man winch.',
      },
      {
        title: 'Windlass Ballista',
        upgradeCost: 90,
        damage: 100,
        range: 265,
        cooldown: 1380,
        damageType: 'piercing',
        armorPenetration: 0.62,
        bossBonus: 0.2,
      },
      {
        title: 'Steel-Proof Arbalest',
        upgradeCost: 140,
        damage: 140,
        range: 280,
        cooldown: 1300,
        damageType: 'piercing',
        armorPenetration: 0.7,
        bossBonus: 0.26,
      },
      {
        title: 'Torsion Siege Bow',
        upgradeCost: 200,
        damage: 185,
        range: 295,
        cooldown: 1180,
        damageType: 'piercing',
        armorPenetration: 0.78,
        bossBonus: 0.33,
      },
      {
        title: 'Colossus Ballista',
        upgradeCost: 280,
        damage: 240,
        range: 310,
        cooldown: 1050,
        damageType: 'piercing',
        armorPenetration: 0.85,
        bossBonus: 0.4,
        description: 'Twin torsion springs and a bolt as long as a spear.',
      },
    ]),
  },

  /* =========================================================== arcane sniper */
  arcaneSniper: {
    key: 'arcaneSniper',
    name: 'Arcane Sniper Tower',
    shortName: 'Arcane',
    hotkey: 'c',
    cost: 210,
    role: 'Precision',
    linear: true,
    placement: 'grass',
    description:
      'A focusing tower that spends three seconds charging one lance of raw magic. Superb against one elite, wasted against a swarm.',
    projectile: 'arcaneLance',
    projectileSpeed: 1050,
    damageType: 'magic',
    targetsGround: true,
    targetsAir: true,
    targeting: {
      ...SIEGE_TARGETING,
      modes: [
        TARGETING_MODE.STRONGEST,
        TARGETING_MODE.BOSS,
        TARGETING_MODE.WEAKEST,
        TARGETING_MODE.NEAREST,
        TARGETING_MODE.FASTEST,
      ],
      defaultMode: TARGETING_MODE.STRONGEST,
      defaultCategory: 'both',
      note: 'The lance locks on at release; a dead target wastes the charge, not the next creep.',
    },
    art: { footprint: [42, 88], material: 'obsidian-crystal', rise: 12 },
    levels: track([
      {
        title: 'Rune Focus',
        damage: 105,
        range: 340,
        cooldown: 2000,
        damageType: 'magic',
        armorPenetration: 0.3,
        description: 'A single bound crystal over a runed plinth.',
      },
      {
        title: 'Clawed Focus',
        upgradeCost: 120,
        damage: 150,
        range: 360,
        cooldown: 1900,
        damageType: 'magic',
        armorPenetration: 0.35,
      },
      {
        title: 'Trine Prism',
        upgradeCost: 180,
        damage: 210,
        range: 385,
        cooldown: 1800,
        damageType: 'magic',
        armorPenetration: 0.45,
      },
      {
        title: 'Astral Lattice',
        upgradeCost: 250,
        damage: 290,
        range: 410,
        cooldown: 1650,
        damageType: 'magic',
        armorPenetration: 0.52,
      },
      {
        title: 'Arcane Longshot Spire',
        upgradeCost: 340,
        damage: 400,
        range: 430,
        cooldown: 1500,
        damageType: 'magic',
        armorPenetration: 0.6,
        description: 'Five lattices stacked into a spire, and one very deliberate beam.',
      },
    ]),
  },

  /* ================================================================== mortar */
  mortar: {
    key: 'mortar',
    name: 'Mortar Tower',
    shortName: 'Mortar',
    hotkey: 'v',
    cost: 200,
    role: 'Area',
    linear: true,
    placement: 'grass',
    description:
      'Lobbed shells that land on the point they were aimed at and hurt everything standing there. Useless against one fast creep, brutal against a column.',
    projectile: 'mortarShell',
    projectileSpeed: 420,
    damageType: 'explosive',
    // Mortars fire at the ground: the datum is the road, so the shell can only
    // hurt ground creeps. Air units are filtered at acquisition *and* in the
    // blast (see systems/TargetCategories.js).
    targetsGround: true,
    targetsAir: false,
    groundOnly: true,
    minRange: 90,
    art: { footprint: [50, 70], material: 'iron-oak', rise: 6 },
    levels: track([
      {
        title: 'Iron Bed Mortar',
        damage: 55,
        range: 300,
        cooldown: 2600,
        damageType: 'explosive',
        splash: 95,
        minRange: 90,
        targetsGround: true,
        targetsAir: false,
        description: 'A short iron tube on a timber bed. The shell lands where the crew aimed it.',
      },
      {
        title: 'Banded Bombard',
        upgradeCost: 110,
        damage: 75,
        range: 320,
        cooldown: 2500,
        damageType: 'explosive',
        splash: 105,
        minRange: 92,
        targetsGround: true,
        targetsAir: false,
      },
      {
        title: 'Stone Emplacement',
        upgradeCost: 160,
        damage: 100,
        range: 340,
        cooldown: 2350,
        damageType: 'explosive',
        splash: 115,
        minRange: 95,
        targetsGround: true,
        targetsAir: false,
      },
      {
        title: 'Twin-Vent Mortar',
        upgradeCost: 240,
        damage: 135,
        range: 360,
        cooldown: 2150,
        damageType: 'explosive',
        splash: 130,
        minRange: 98,
        targetsGround: true,
        targetsAir: false,
      },
      {
        title: 'Royal Siege Mortar',
        upgradeCost: 330,
        damage: 180,
        range: 380,
        cooldown: 1950,
        damageType: 'explosive',
        splash: 150,
        minRange: 100,
        targetsGround: true,
        targetsAir: false,
        description: 'A graduated arc, a stone cradle and a 150 px crater.',
      },
    ]),
  },

  /* =================================================================== frost */
  rimeTower: {
    key: 'rimeTower',
    name: 'Frost Tower',
    shortName: 'Frost',
    hotkey: 'b',
    cost: 130,
    role: 'Control',
    linear: true,
    placement: 'grass',
    description:
      'Low damage, high value: every shard chills what it touches, and a chilled lane is a lane your other towers get to shoot twice.',
    projectile: 'frostShard',
    projectileSpeed: 560,
    damageType: 'magic',
    targetsGround: true,
    targetsAir: true,
    art: { footprint: [40, 86], material: 'ice', rise: 6 },
    levels: track([
      {
        title: 'Rime Shard',
        damage: 24,
        range: 180,
        cooldown: 900,
        damageType: 'magic',
        slow: 0.3,
        slowMs: 1000,
        description: 'A single bound shard. −30 % movement for 1 s on every hit.',
      },
      {
        title: 'Glacier Cluster',
        upgradeCost: 80,
        damage: 32,
        range: 195,
        cooldown: 870,
        damageType: 'magic',
        slow: 0.35,
        slowMs: 1200,
      },
      {
        title: 'Frost Spine',
        upgradeCost: 120,
        damage: 42,
        range: 208,
        cooldown: 840,
        damageType: 'magic',
        slow: 0.4,
        slowMs: 1500,
        splash: 62,
      },
      {
        title: 'Winter Core',
        upgradeCost: 170,
        damage: 54,
        range: 220,
        cooldown: 800,
        damageType: 'magic',
        slow: 0.45,
        slowMs: 1800,
        splash: 72,
      },
      {
        title: 'Hoarfrost Crown',
        upgradeCost: 220,
        damage: 70,
        range: 230,
        cooldown: 760,
        damageType: 'magic',
        slow: 0.5,
        slowMs: 2200,
        splash: 80,
        description: 'A crown of ice: −50 % for 2.2 s, and every hit splashes the chill.',
      },
    ]),
  },

  /* =================================================================== tesla */
  tesla: {
    key: 'tesla',
    name: 'Tesla Tower',
    shortName: 'Tesla',
    hotkey: 'n',
    cost: 190,
    role: 'Chain',
    linear: true,
    placement: 'grass',
    description:
      'Lightning that refuses to stop at one body. Each arc is weaker than the last, and no creep in a chain is ever hit twice.',
    projectile: 'teslaArc',
    projectileSpeed: 1200,
    damageType: 'lightning',
    targetsGround: true,
    targetsAir: true,
    art: { footprint: [44, 92], material: 'copper', rise: 10 },
    levels: track([
      {
        title: 'Copper Coil',
        damage: 42,
        range: 175,
        cooldown: 1400,
        damageType: 'lightning',
        chainTargets: 2,
        chainRange: 95,
        chainFalloff: 0.6,
        description: 'One coil, two extra bodies per arc at 60 % of the previous hit.',
      },
      {
        title: 'Insulated Spire',
        upgradeCost: 90,
        damage: 58,
        range: 190,
        cooldown: 1320,
        damageType: 'lightning',
        chainTargets: 2,
        chainRange: 105,
        chainFalloff: 0.64,
      },
      {
        title: 'Arc Lattice',
        upgradeCost: 140,
        damage: 78,
        range: 205,
        cooldown: 1250,
        damageType: 'lightning',
        chainTargets: 3,
        chainRange: 112,
        chainFalloff: 0.68,
      },
      {
        title: 'Storm Cage',
        upgradeCost: 200,
        damage: 100,
        range: 220,
        cooldown: 1150,
        damageType: 'lightning',
        chainTargets: 4,
        chainRange: 122,
        chainFalloff: 0.72,
      },
      {
        title: 'Thunderhead',
        upgradeCost: 280,
        damage: 130,
        range: 235,
        cooldown: 1050,
        damageType: 'lightning',
        chainTargets: 5,
        chainRange: 130,
        chainFalloff: 0.75,
        description: 'Five extra bodies, 75 % carried per hop. Ground and air alike.',
      },
    ]),
  },

  /* =============================================================== skybreaker */
  skybreaker: {
    key: 'skybreaker',
    name: 'Skybreaker Tower',
    shortName: 'Skybreaker',
    hotkey: 'm',
    cost: 170,
    role: 'Anti-air',
    linear: true,
    placement: 'grass',
    description:
      'A tracker that only looks up. Flyers get a dedicated, long-range answer instead of whatever happened to have a spare arrow.',
    projectile: 'skybreakerBolt',
    projectileSpeed: 1000,
    damageType: 'piercing',
    targetsGround: false,
    targetsAir: true,
    targeting: AA_TARGETING,
    bossBonus: 0.25,
    art: { footprint: [46, 96], material: 'steel', rise: 12 },
    levels: track([
      {
        title: 'Tracker Mount',
        damage: 60,
        range: 270,
        cooldown: 1200,
        damageType: 'piercing',
        bossBonus: 0.25,
        description: 'A geared mount that swings to whatever is flying.',
      },
      {
        title: 'Twin Harpoon Mount',
        upgradeCost: 100,
        damage: 85,
        range: 285,
        cooldown: 1150,
        damageType: 'piercing',
        bossBonus: 0.25,
      },
      {
        title: 'Quad Tracker',
        upgradeCost: 150,
        damage: 115,
        range: 305,
        cooldown: 1080,
        damageType: 'piercing',
        bossBonus: 0.3,
      },
      {
        title: 'Radar Battery',
        upgradeCost: 220,
        damage: 155,
        range: 330,
        cooldown: 1000,
        damageType: 'piercing',
        bossBonus: 0.35,
      },
      {
        title: 'Sky Citadel',
        upgradeCost: 310,
        damage: 205,
        range: 350,
        cooldown: 920,
        damageType: 'piercing',
        bossBonus: 0.4,
        description: 'Six barrels and a spotter glass. Nothing with wings survives the approach.',
      },
    ]),
  },

  /* ======================================================== engineer workshop */
  workshop: {
    key: 'workshop',
    name: 'Engineer Workshop',
    shortName: 'Workshop',
    hotkey: 'l',
    cost: 160,
    role: 'Support',
    linear: true,
    supportOnly: true,
    placement: 'grass',
    description:
      'No guns. A crew that oils the machinery around it and, from level 3, patches the stonework while the horde is still hitting it.',
    projectile: null,
    damageType: 'true',
    // A support building is not a weapon: `supportOnly` is what keeps it out of
    // the attack loop. The category flags stay permissive so it is never counted
    // as a ground-locked gun in the roster audits (it has no gun at all).
    targetsGround: true,
    targetsAir: true,
    art: { footprint: [54, 78], material: 'timber-copper', rise: 6 },
    levels: track([
      {
        title: 'Tool Shed',
        damage: 0,
        range: 0,
        cooldown: 0,
        damageType: 'true',
        aura: { radius: 200, fireRateBonus: 0.1, rangeBonus: 0.08 },
        description: '+10 % fire rate and +8 % range to towers within 200 px.',
      },
      {
        title: 'Machinist Bench',
        upgradeCost: 120,
        damage: 0,
        range: 0,
        cooldown: 0,
        damageType: 'true',
        aura: { radius: 220, fireRateBonus: 0.14, rangeBonus: 0.1 },
      },
      {
        title: 'Repair Yard',
        upgradeCost: 180,
        damage: 0,
        range: 0,
        cooldown: 0,
        damageType: 'true',
        aura: { radius: 240, fireRateBonus: 0.18, rangeBonus: 0.12 },
        repair: { radius: 200, perSecond: 20 },
        description: 'Begins repairing nearby structures at 20 HP/s — slower than two attackers can break them.',
      },
      {
        title: 'Siege Workshop',
        upgradeCost: 250,
        damage: 0,
        range: 0,
        cooldown: 0,
        damageType: 'true',
        aura: { radius: 260, fireRateBonus: 0.22, rangeBonus: 0.15 },
        repair: { radius: 240, perSecond: 36 },
      },
      {
        title: 'Royal Foundry',
        upgradeCost: 340,
        damage: 0,
        range: 0,
        cooldown: 0,
        damageType: 'true',
        aura: { radius: 300, fireRateBonus: 0.28, rangeBonus: 0.18 },
        repair: { radius: 280, perSecond: 52 },
        description: '+28 % fire rate, +18 % range, and 52 HP/s of repairs across 280 px.',
      },
    ]),
  },

  /* ============================================================ warding obelisk */
  obelisk: {
    key: 'obelisk',
    name: 'Warding Obelisk',
    shortName: 'Obelisk',
    hotkey: 'k',
    cost: 180,
    role: 'Debuff',
    linear: true,
    supportOnly: true,
    placement: 'grass',
    description:
      'A rune stone that strips armour and magical resistance off everything standing near it. It kills nothing; it makes everything else kill better.',
    projectile: null,
    damageType: 'magic',
    targetsGround: true,
    targetsAir: true,
    art: { footprint: [38, 100], material: 'runestone', rise: 8 },
    levels: track([
      {
        title: 'Carved Ward',
        damage: 0,
        range: 0,
        cooldown: 0,
        damageType: 'magic',
        debuff: { radius: 190, armorBreak: 8, resistanceBreak: 0.1 },
        description: '−8 armour and −10 % resistance to every enemy within 190 px.',
      },
      {
        title: 'Rune Circle',
        upgradeCost: 130,
        damage: 0,
        range: 0,
        cooldown: 0,
        damageType: 'magic',
        debuff: { radius: 210, armorBreak: 12, resistanceBreak: 0.14 },
      },
      {
        title: 'Glyph Stele',
        upgradeCost: 190,
        damage: 0,
        range: 0,
        cooldown: 0,
        damageType: 'magic',
        debuff: { radius: 230, armorBreak: 16, resistanceBreak: 0.18 },
      },
      {
        title: 'Sigil Monolith',
        upgradeCost: 260,
        damage: 0,
        range: 0,
        cooldown: 0,
        damageType: 'magic',
        debuff: { radius: 250, armorBreak: 20, resistanceBreak: 0.24 },
      },
      {
        title: 'Warding Colossus',
        upgradeCost: 350,
        damage: 0,
        range: 0,
        cooldown: 0,
        damageType: 'magic',
        debuff: { radius: 270, armorBreak: 26, resistanceBreak: 0.3 },
        description: '−26 armour and −30 % resistance across 270 px. The whole lane feels it.',
      },
    ]),
  },

  /* =============================================================== spike trap */
  spikeTrap: {
    key: 'spikeTrap',
    name: 'Spike Trap',
    shortName: 'Spikes',
    hotkey: 'j',
    cost: 70,
    role: 'Trap',
    linear: true,
    trap: true,
    placement: 'wall',
    structure: true,
    description:
      'A spring-loaded plate for the road. Free to re-arm: after it snaps it winds itself back over a few seconds, so the road stays a threat all wave.',
    projectile: null,
    damageType: 'physical',
    targetsGround: true,
    targetsAir: false,
    art: { footprint: [58, 34], material: 'iron-bronze', rise: 0 },
    levels: track([
      {
        title: 'Spike Plate',
        upgradeCost: 60,
        damage: 110,
        range: 0,
        cooldown: 6000,
        damageType: 'physical',
        trapRadius: 48,
        trapCooldown: 6000,
        targetsGround: true,
        targetsAir: false,
        description: '110 damage in a 48 px ring, then 6 s to wind the springs back.',
      },
      {
        title: 'Serrated Plate',
        upgradeCost: 100,
        damage: 160,
        range: 0,
        cooldown: 5600,
        damageType: 'physical',
        trapRadius: 50,
        trapCooldown: 5600,
        targetsGround: true,
        targetsAir: false,
      },
      {
        title: 'Spring Harrow',
        upgradeCost: 160,
        damage: 220,
        range: 0,
        cooldown: 5200,
        damageType: 'physical',
        trapRadius: 52,
        trapCooldown: 5200,
        targetsGround: true,
        targetsAir: false,
      },
      {
        title: 'Iron Maw',
        upgradeCost: 240,
        damage: 300,
        range: 0,
        cooldown: 4600,
        damageType: 'physical',
        trapRadius: 56,
        trapCooldown: 4600,
        targetsGround: true,
        targetsAir: false,
      },
      {
        title: 'Royal Caltrop Field',
        upgradeCost: 330,
        damage: 420,
        range: 0,
        cooldown: 4000,
        damageType: 'physical',
        trapRadius: 60,
        trapCooldown: 4000,
        targetsGround: true,
        targetsAir: false,
        description: '420 damage every 4 s across 60 px. A chokepoint turns into a grinder.',
      },
    ]),
  },
};

/**
 * Trap tiers carry their first level's `upgradeCost` in the L1 row above because
 * the trap is built as a wall-class structure: the *build* cost is 70 and the
 * first upgrade is 60. Nothing to patch — kept explicit so the numbers read
 * correctly in the inspector.
 */

/**
 * Support lines are excluded from "tower DPS" audits and get a support badge.
 * The workshop adds fire rate, the obelisk strips mitigation; neither is
 * measured by its own damage, which is zero.
 */
export const ROYAL_SUPPORT_LINES = ['workshop', 'obelisk'];

/** Lines whose inspector shows the priority / category panel. */
export const ROYAL_PANEL_LINES = ROYAL_LINES.filter(
  (key) => ROYAL_TOWER_TYPES[key].targeting?.panel
);

/**
 * Per-line colour identities, used by the HUD cards, the range ring and the
 * debuff field so a player can tell a Tesla field from an Obelisk field.
 */
export const ROYAL_IDENTITY = {
  royalArtillery: { tint: 0xd8a24a, label: 'SIEGE' },
  siegeBallista: { tint: 0xc8b06a, label: 'ARMOUR' },
  arcaneSniper: { tint: 0xa77bff, label: 'ARCANE' },
  mortar: { tint: 0xe07b4a, label: 'AREA' },
  rimeTower: { tint: 0x7fe9ff, label: 'SLOW' },
  tesla: { tint: 0xffe066, label: 'CHAIN' },
  skybreaker: { tint: 0x8fd0ff, label: 'AIR' },
  workshop: { tint: 0x8fe0b0, label: 'SUPPORT' },
  obelisk: { tint: 0xc070ff, label: 'DEBUFF' },
  spikeTrap: { tint: 0xff8f6a, label: 'TRAP' },
};
