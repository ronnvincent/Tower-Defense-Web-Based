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
 * Like the twelve older lines, every royal line is **two shared tiers plus a
 * branch at level 3**: `levels` holds L1 and L2, `specializations` holds the two
 * paths, and `ASCENSION[line][spec]` holds each path's L4 and L5 tiers. `royal:
 * true` marks the roster so the runtime knows the branch also has its own art
 * (`spec-a*` / `spec-b*`), its own shot (`data/royalProjectiles.js`), its own
 * effects (`fx-line-<line>b-*`) and its own wreck.
 *
 * Branch A keeps the machine the line shipped with; branch B is a second,
 * different machine — a salvo battery instead of one long gun, a repeater
 * instead of a torsion bow — with its own silhouette and its own trade. Neither
 * branch is a flat damage bump: see docs/royal-defences.md §6.
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
 *   royal             the base-defence roster; enables branch-B art, shots and fx
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

/** Build the shared, pre-branch tiers of a line from one row per tier. */
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
    royal: true,
    cost: 260,
    role: 'Siege',
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
        upgradeCost: 140,
        damage: 360,
        range: 450,
        cooldown: 4000,
        damageType: 'explosive',
        armorPenetration: 0.3,
        minRange: 105,
      },
    ]),
    /**
     * Two branches at level 3 — the line's own machine, or a second one.
     * `Tower` buys the branch like any older line; see docs §6.
     */
    specializations: {
      bombard: {
        specKey: 'bombard',
        branch: 'spec-a',
        title: 'Bastion Culverin',
        upgradeCost: 190,
        damage: 480,
        range: 470,
        cooldown: 3800,
        damageType: 'explosive',
        armorPenetration: 0.4,
        bossBonus: 0.26,
        minRange: 110,
        description: 'One 480 damage shell every 3.8 s from 470 px, with a 26 % bonus against titans. The salvo battery fires twice as often and reaches less far.',
      },
      battery: {
        specKey: 'battery',
        branch: 'spec-b',
        title: 'Twin-Bore Battery',
        upgradeCost: 180,
        damage: 210,
        range: 400,
        cooldown: 2900,
        damageType: 'explosive',
        armorPenetration: 0.3,
        minRange: 130,
        ability: { shots: 2, label: 'Salvo Pair' },
        description: 'Two shells a volley: 210 damage each, 145 DPS together, out of a 400 px reach and a 130 px dead zone. The bombard hits once for far more; this one hits twice as often.',
      },
    },

  },

  /* ============================================================ siege ballista */
  siegeBallista: {
    key: 'siegeBallista',
    name: 'Siege Ballista',
    shortName: 'Ballista',
    hotkey: 'x',
    royal: true,
    cost: 150,
    role: 'Anti-armour',
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
    ]),
    /**
     * Two branches at level 3 — the line's own machine, or a second one.
     * `Tower` buys the branch like any older line; see docs §6.
     */
    specializations: {
      arbalest: {
        specKey: 'arbalest',
        branch: 'spec-a',
        title: 'Steel-Proof Arbalest',
        upgradeCost: 140,
        damage: 140,
        range: 280,
        cooldown: 1300,
        damageType: 'piercing',
        armorPenetration: 0.7,
        bossBonus: 0.26,
        description: '140 damage a bolt at 70 % penetration and 26 % against titans: 108 DPS. The repeater fires faster with no penetration at all.',
      },
      repeater: {
        specKey: 'repeater',
        branch: 'spec-b',
        title: 'Repeater Ballista',
        upgradeCost: 130,
        damage: 95,
        range: 250,
        cooldown: 700,
        damageType: 'physical',
        armorPenetration: 0,
        description: 'A magazine-fed prod: 95 damage every 0.7 s, 136 DPS. The bolts are light — no penetration against the arbalest’s 70 % — and 30 px shorter in reach.',
      },
    },

  },

  /* =========================================================== arcane sniper */
  arcaneSniper: {
    key: 'arcaneSniper',
    name: 'Arcane Sniper Tower',
    shortName: 'Arcane',
    hotkey: 'c',
    royal: true,
    cost: 210,
    role: 'Precision',
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
    ]),
    /**
     * Two branches at level 3 — the line's own machine, or a second one.
     * `Tower` buys the branch like any older line; see docs §6.
     */
    specializations: {
      marksman: {
        specKey: 'marksman',
        branch: 'spec-a',
        title: 'Trine Prism',
        upgradeCost: 180,
        damage: 210,
        range: 385,
        cooldown: 1800,
        damageType: 'magic',
        armorPenetration: 0.45,
        description: '210 damage in a single lance every 1.8 s: 117 DPS from 385 away. The hex weaver trades that kill shot for an area burst.',
      },
      hexweaver: {
        specKey: 'hexweaver',
        branch: 'spec-b',
        title: 'Hex Weaver',
        upgradeCost: 170,
        damage: 120,
        range: 330,
        cooldown: 1600,
        damageType: 'magic',
        armorPenetration: 0.3,
        splash: 60,
        slow: 0.18,
        slowMs: 900,
        description: 'Hexfire bursts on a 60 px radius and chills by 18 % for 0.9 s: 75 DPS that hits the column behind the target. The marksman kills one body; this softens several.',
      },
    },

  },

  /* ================================================================== mortar */
  mortar: {
    key: 'mortar',
    name: 'Mortar Tower',
    shortName: 'Mortar',
    hotkey: 'v',
    royal: true,
    cost: 200,
    role: 'Area',
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
    ]),
    /**
     * Two branches at level 3 — the line's own machine, or a second one.
     * `Tower` buys the branch like any older line; see docs §6.
     */
    specializations: {
      greatmortar: {
        specKey: 'greatmortar',
        branch: 'spec-a',
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
        description: '100 damage across a 115 px blast, ground only: 43 DPS on one body and 96 DPS across a pack. The cluster fires two lighter shells.',
      },
      cluster: {
        specKey: 'cluster',
        branch: 'spec-b',
        title: 'Cluster Battery',
        upgradeCost: 150,
        damage: 52,
        range: 320,
        cooldown: 1900,
        damageType: 'explosive',
        splash: 55,
        minRange: 95,
        targetsGround: true,
        targetsAir: false,
        ability: { shots: 2, label: 'Fanned Salvo' },
        description: 'Two fanned shells, 52 damage each over a 55 px blast: 55 DPS aimed at one body, from a cradle that never has to reload very long.',
      },
    },

  },

  /* =================================================================== frost */
  rimeTower: {
    key: 'rimeTower',
    name: 'Frost Tower',
    shortName: 'Frost',
    hotkey: 'b',
    royal: true,
    cost: 130,
    role: 'Control',
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
    ]),
    /**
     * Two branches at level 3 — the line's own machine, or a second one.
     * `Tower` buys the branch like any older line; see docs §6.
     */
    specializations: {
      glacier: {
        specKey: 'glacier',
        branch: 'spec-a',
        title: 'Frost Spine',
        upgradeCost: 120,
        damage: 42,
        range: 208,
        cooldown: 840,
        damageType: 'magic',
        slow: 0.4,
        slowMs: 1500,
        splash: 62,
        description: '42 damage on a 62 px burst and a 40 % snare for 1.5 s. The tempest bites wider; the glacier is what stops a runner.',
      },
      tempest: {
        specKey: 'tempest',
        branch: 'spec-b',
        title: 'Frost Tempest',
        upgradeCost: 110,
        damage: 34,
        range: 200,
        cooldown: 700,
        damageType: 'magic',
        splash: 90,
        description: 'A fan of shards on a 90 px burst: 49 DPS to everything it touches, with no slow at all. The glacier slows deeper; this one only bites wider.',
      },
    },

  },

  /* =================================================================== tesla */
  tesla: {
    key: 'tesla',
    name: 'Tesla Tower',
    shortName: 'Tesla',
    hotkey: 'n',
    royal: true,
    cost: 190,
    role: 'Chain',
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
    ]),
    /**
     * Two branches at level 3 — the line's own machine, or a second one.
     * `Tower` buys the branch like any older line; see docs §6.
     */
    specializations: {
      chain: {
        specKey: 'chain',
        branch: 'spec-a',
        title: 'Arc Lattice',
        upgradeCost: 140,
        damage: 78,
        range: 205,
        cooldown: 1250,
        damageType: 'lightning',
        chainTargets: 3,
        chainRange: 112,
        chainFalloff: 0.68,
        description: '78 damage that arcs to three more bodies at 68 % carried: 203 DPS across a pack, the best crowd clear of the pair.',
      },
      arccannon: {
        specKey: 'arccannon',
        branch: 'spec-b',
        title: 'Arc Cannon',
        upgradeCost: 130,
        damage: 120,
        range: 220,
        cooldown: 1300,
        damageType: 'lightning',
        chainTargets: 1,
        chainRange: 90,
        chainFalloff: 0.55,
        description: 'One heavy arc and one short hop: 120 damage on the primary, 92 DPS, where the chain coil spreads its damage across four bodies.',
      },
    },

  },

  /* =============================================================== skybreaker */
  skybreaker: {
    key: 'skybreaker',
    name: 'Skybreaker Tower',
    shortName: 'Skybreaker',
    hotkey: 'm',
    royal: true,
    cost: 170,
    role: 'Anti-air',
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
    ]),
    /**
     * Two branches at level 3 — the line's own machine, or a second one.
     * `Tower` buys the branch like any older line; see docs §6.
     */
    specializations: {
      lance: {
        specKey: 'lance',
        branch: 'spec-a',
        title: 'Quad Tracker',
        upgradeCost: 150,
        damage: 115,
        range: 305,
        cooldown: 1080,
        damageType: 'piercing',
        bossBonus: 0.3,
        description: '115 damage a bolt, 30 % against titans: 106 DPS in the air. The flak battery trades that duel for splinter radius.',
      },
      flak: {
        specKey: 'flak',
        branch: 'spec-b',
        title: 'Flak Battery',
        upgradeCost: 140,
        damage: 40,
        range: 285,
        cooldown: 760,
        damageType: 'piercing',
        splash: 55,
        bossBonus: 0.15,
        ability: { shots: 2, label: 'Burst Pair' },
        description: 'Two bursting shells a salvo, 40 damage each over a 55 px blast: 105 DPS spread across a flyer pack, with no ground game at all.',
      },
    },

  },

  /* ======================================================== engineer workshop */
  workshop: {
    key: 'workshop',
    name: 'Engineer Workshop',
    shortName: 'Workshop',
    hotkey: 'l',
    royal: true,
    cost: 160,
    role: 'Support',
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
    ]),
    /**
     * Two branches at level 3 — the line's own machine, or a second one.
     * `Tower` buys the branch like any older line; see docs §6.
     */
    specializations: {
      master: {
        specKey: 'master',
        branch: 'spec-a',
        title: 'Repair Yard',
        upgradeCost: 180,
        damage: 0,
        range: 0,
        cooldown: 0,
        damageType: 'true',
        aura: { radius: 240, fireRateBonus: 0.18, rangeBonus: 0.12 },
        repair: { radius: 200, perSecond: 18 },
        description: 'Begins repairing nearby structures at 18 HP/s — slower than two attackers can break them.',
      },
      engineer: {
        specKey: 'engineer',
        branch: 'spec-b',
        title: 'Field Engineer',
        upgradeCost: 170,
        damage: 0,
        range: 0,
        cooldown: 0,
        damageType: 'true',
        aura: { radius: 270, fireRateBonus: 0.24, rangeBonus: 0.16 },
        repair: { radius: 190, perSecond: 12 },
        description: '+24 % fire rate and +16 % range across 270 px, with a small repair crew 190 px out. Built to sit behind a gun line, not inside a fortress.',
      },
    },

  },

  /* ============================================================ warding obelisk */
  obelisk: {
    key: 'obelisk',
    name: 'Warding Obelisk',
    shortName: 'Obelisk',
    hotkey: 'k',
    royal: true,
    cost: 180,
    role: 'Debuff',
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
    ]),
    /**
     * Two branches at level 3 — the line's own machine, or a second one.
     * `Tower` buys the branch like any older line; see docs §6.
     */
    specializations: {
      rune: {
        specKey: 'rune',
        branch: 'spec-a',
        title: 'Glyph Stele',
        upgradeCost: 190,
        damage: 0,
        range: 0,
        cooldown: 0,
        damageType: 'magic',
        debuff: { radius: 230, armorBreak: 16, resistanceBreak: 0.18 },
        description: '−16 armour and −18 % resistance inside 230 px. The null obelisk trades the armour break for a much deeper resistance break.',
      },
      nullify: {
        specKey: 'nullify',
        branch: 'spec-b',
        title: 'Null Obelisk',
        upgradeCost: 180,
        damage: 0,
        range: 0,
        cooldown: 0,
        damageType: 'magic',
        debuff: { radius: 200, armorBreak: 10, resistanceBreak: 0.3 },
        description: 'Trades armour break for magic: −30 % resistance inside 200 px. The answer to resistant elites; the rune stele still strips plate.',
      },
    },

  },

  /* =============================================================== spike trap */
  spikeTrap: {
    key: 'spikeTrap',
    name: 'Spike Trap',
    shortName: 'Spikes',
    hotkey: 'j',
    royal: true,
    cost: 70,
    role: 'Trap',
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
    ]),
    /**
     * Two branches at level 3 — the line's own machine, or a second one.
     * `Tower` buys the branch like any older line; see docs §6.
     */
    specializations: {
      impaler: {
        specKey: 'impaler',
        branch: 'spec-a',
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
        description: '220 damage to every ground creep on a 52 px plate every 5.2 s: 42 DPS to one body, and twice the caltrop field’s bite.',
      },
      caltrop: {
        specKey: 'caltrop',
        branch: 'spec-b',
        title: 'Caltrop Field',
        upgradeCost: 150,
        damage: 110,
        range: 0,
        cooldown: 3000,
        damageType: 'physical',
        trapRadius: 78,
        trapCooldown: 3000,
        targetsGround: true,
        targetsAir: false,
        description: 'A wide 78 px field that bites every ground creep inside it for 110 damage every 3 s. Chip damage across a lane, not one big bite.',
      },
    },

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
