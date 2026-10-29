/**
 * baseUpgrades.js — the bastion as a building you raise.
 *
 * Request 67: "gusto ko yung base natin ay na uupgrade din, like may
 * specialization din, max level is 5, dapat umaatake rin, dapat mas maganda yung
 * ability nya compare sa mga current defenses natin, dapat nagbabago ng anyo
 * hindi lang kulay."
 *
 * So the keep is not scenery any more. It is the last line of defence, it has a
 * gun of its own, it branches at level three (storm / sunforge), and every level
 * is a *different castle* rather than the same one in a new tint — the five
 * sheets are built by `scripts/build_bastion_forms.py`, which raises another
 * ring of towers behind the same hand-drawn keep at each tier.
 *
 * WHY THIS FILE EXISTS SEPARATELY
 * ------------------------------
 * Every number below is balance, and balance lives in config — the standing rule
 * of this project. It is also the only file that has to be opened to retune the
 * bastion, and it is deliberately *additive*: no existing tower, wave or economy
 * value is read or changed here. The bastion cannot be buffed by a Banner Keep
 * aura, is not part of `activeTowers`, and is not in the wave model at all.
 *
 * THE NUMBERS, AND WHY THEY ARE "BETTER THAN THE DEFENCES"
 * -------------------------------------------------------
 * A maxed tower line costs 60 → ~1500 gold and lands 60–120 DPS inside a
 * 150–340 px circle. The bastion's whole ladder costs 180 + 260 + 420 + 700 =
 * 1560 gold, and at level 5 it lands ~130–165 DPS from *one* emplacement that
 * also (a) fires at ground and air, (b) out-ranges every non-royal tower, and
 * (c) owns an area ability no tower has. That is stronger per gold than a single
 * tower — which is the point of a building you can only ever have one of — and
 * still weaker than a whole lane of towers, which is what keeps the game a game.
 */

/** Five levels, as the brief asks. */
export const BASTION_MAX_LEVEL = 5;

/** The level at which the player chooses a branch. */
export const BASTION_SPEC_LEVEL = 3;

/**
 * Art per form: the sheet, where its foot sits, and where the gun is seated.
 *
 * `foot` and `socket` are measured by `scripts/build_bastion_forms.py` while it
 * draws the castle, so the gun can never float off the turret it stands on.
 * `socket.x` is an offset from the sheet's centre line, `socket.y` is height
 * above the foot; both are in *source* pixels and get multiplied by the sprite
 * scale at runtime.
 *
 * The two branches are two different castles from level three onward: the same
 * wall line, but a crystal crown or a golden dome, blue slate or brick-red
 * roofs, and blue or ember banners. `bastionForm()` picks the right one.
 */
export const BASTION_ART = Object.freeze({
  1: Object.freeze({
    key: 'bastion-l1',
    path: 'assets/arena/bastion-l1.png',
    sheet: [442, 366],
    foot: 22,
    socket: { x: 0.0, y: 10 },
  }),
  2: Object.freeze({
    key: 'bastion-l2',
    path: 'assets/arena/bastion-l2.png',
    sheet: [498, 412],
    foot: 22,
    socket: { x: 0.0, y: 10 },
  }),
  3: Object.freeze({
    key: 'bastion-l3-storm',
    path: 'assets/arena/bastion-l3-storm.png',
    sheet: [542, 426],
    foot: 22,
    socket: { x: 0.0, y: 10 },
  }),
  4: Object.freeze({
    key: 'bastion-l4-storm',
    path: 'assets/arena/bastion-l4-storm.png',
    sheet: [577, 450],
    foot: 22,
    socket: { x: 0.0, y: 10 },
  }),
  5: Object.freeze({
    key: 'bastion-l5-storm',
    path: 'assets/arena/bastion-l5-storm.png',
    sheet: [606, 477],
    foot: 22,
    socket: { x: 0.0, y: 10 },
  }),
});

/**
 * The Sunforge side of levels 3–5.
 *
 * A branch is not a recolour: these sheets carry a golden dome instead of a
 * crystal crown, brick-red roofs instead of blue slate, and an ember sigil over
 * the gate. They are the same castle, built by a different guild.
 */
export const BASTION_BRANCH_ART = Object.freeze({
  storm: Object.freeze({ 3: BASTION_ART[3], 4: BASTION_ART[4], 5: BASTION_ART[5] }),
  sunforge: Object.freeze({
    3: Object.freeze({
    key: 'bastion-l3-sun',
    path: 'assets/arena/bastion-l3-sun.png',
    sheet: [542, 424],
    foot: 22,
    socket: { x: 0.0, y: 10 },
    }),
    4: Object.freeze({
    key: 'bastion-l4-sun',
    path: 'assets/arena/bastion-l4-sun.png',
    sheet: [577, 450],
    foot: 22,
    socket: { x: 0.0, y: 10 },
    }),
    5: Object.freeze({
    key: 'bastion-l5-sun',
    path: 'assets/arena/bastion-l5-sun.png',
    sheet: [606, 473],
    foot: 22,
    socket: { x: 0.0, y: 10 },
    }),
  }),
});

/**
 * The sheet the keep wears right now.
 *
 * Level 1 and 2 are the same building for both paths — the branch does not
 * exist yet — so those tiers ignore the specialisation.
 *
 * @param {number} level 1..5
 * @param {string|null} [spec] 'storm' | 'sunforge'
 */
export function bastionForm(level, spec = null) {
  const branch = spec && BASTION_BRANCH_ART[spec];
  const form = branch?.[level];
  if (form) return form;
  return BASTION_ART[level] || BASTION_ART[1];
}

/** Every bastion texture the battlefield has to have before it draws a keep. */
export const BASTION_FORM_ART = Object.freeze([
  ...Object.values(BASTION_ART),
  ...Object.values(BASTION_BRANCH_ART.sunforge),
].map((entry) => ({ key: entry.key, path: entry.path })));

/**
 * The two weapon heads.
 *
 * `muzzle` is the barrel tip in the weapon's own art space, measured from the
 * pivot (bottom centre) — the same convention as `MUZZLE_OFFSET` in
 * `data/towerVisuals.js`, drawn pointing up.
 */
export const BASTION_WEAPONS = Object.freeze({
  wardCrystal: {
    key: 'bastion-ward-crystal',
    path: 'assets/arena/bastion-ward-crystal.png',
    muzzle: { x: 0, y: -208 },
    colour: 0x7fe3ff,
  },
  sunCannon: {
    key: 'bastion-sun-cannon',
    path: 'assets/arena/bastion-sun-cannon.png',
    muzzle: { x: 0, y: -168 },
    colour: 0xffcf72,
  },
});

/** Every weapon texture the battlefield has to have. */
export const BASTION_WEAPON_ART = Object.freeze(
  Object.values(BASTION_WEAPONS).map((entry) => ({ key: entry.key, path: entry.path }))
);

/**
 * The shared ladder.
 *
 * Levels 1–2 are one road; from 3 the branch supplies the stats. `ability` is
 * the name the inspector prints, so a tier that only adds damage still reads as
 * an upgrade of the same gun.
 */
export const BASTION_LEVELS = Object.freeze({
  1: {
    level: 1,
    title: "Warden's Keep",
    cost: 0,
    description: 'The keep wakes up: a ward bolt from the gate tower.',
    ability: { label: 'Warden Bolt' },
    stats: {
      damage: 26,
      cooldown: 1000,
      range: 300,
      projectileSpeed: 640,
      projectile: 'lightning',
      damageType: 'magic',
      targetsGround: true,
      targetsAir: true,
    },
  },
  2: {
    level: 2,
    title: 'Bastion Watch',
    cost: 180,
    description: 'A drum tower joins the skyline and the gate answers back.',
    ability: { label: 'Retribution' },
    stats: {
      damage: 34,
      cooldown: 950,
      range: 315,
      projectileSpeed: 680,
      projectile: 'lightning',
      damageType: 'magic',
      targetsGround: true,
      targetsAir: true,
      // Creeps that stop to chew the gate are standing inside a ward.
      retribution: { damagePerSecond: 12, radius: 150 },
    },
  },
});

/**
 * The two branches.
 *
 * Storm is the crowd answer: a chain that hops, and a Thunderclap that slows
 * everything standing near the gate. Sunforge is the heavy answer: a burning
 * shell and a Solar Flare that lands on the densest knot of creeps. Both are
 * deliberately *better* than any tower's area attack — the bastion's whole
 * selling point is that it is the one building a wave cannot walk past.
 */
export const BASTION_BRANCHES = Object.freeze({
  storm: {
    key: 'storm',
    specKey: 'storm',
    branch: 'spec-a',
    title: 'Storm Bastion',
    cardTitle: 'STORM',
    weapon: 'wardCrystal',
    description: 'Chain lightning and a Thunderclap that slows the whole gate yard.',
    levels: {
      3: {
        title: 'Storm Bastion',
        cost: 260,
        description: 'Chain up to four creeps; Thunderclap slows the gate yard every 6s.',
        ability: { label: 'Thunderclap', nova: true },
        stats: {
          damage: 52,
          cooldown: 800,
          range: 330,
          projectileSpeed: 720,
          projectile: 'lightning',
          damageType: 'magic',
          targetsGround: true,
          targetsAir: true,
          chainTargets: 4,
          chainRange: 104,
          chainFalloff: 0.86,
          nova: { damage: 68, radius: 156, slow: 0.30, slowMs: 950, cooldownMs: 6000 },
        },
      },
      4: {
        title: 'Tempest Bastion',
        cost: 420,
        description: 'The chain reaches five, and the Thunderclap bites harder.',
        ability: { label: 'Thunderclap', nova: true },
        stats: {
          damage: 70,
          cooldown: 680,
          range: 345,
          projectileSpeed: 760,
          projectile: 'lightning',
          damageType: 'magic',
          targetsGround: true,
          targetsAir: true,
          chainTargets: 5,
          chainRange: 114,
          chainFalloff: 0.88,
          nova: { damage: 95, radius: 176, slow: 0.40, slowMs: 1200, cooldownMs: 5500 },
        },
      },
      5: {
        title: 'Maelstrom Bastion',
        cost: 700,
        description: 'Six-target chain, and a Maelstrom that catches the whole yard in a gale.',
        ability: { label: 'Maelstrom', nova: true },
        stats: {
          damage: 92,
          cooldown: 560,
          range: 360,
          projectileSpeed: 800,
          projectile: 'lightning',
          damageType: 'magic',
          targetsGround: true,
          targetsAir: true,
          chainTargets: 6,
          chainRange: 126,
          chainFalloff: 0.90,
          nova: { damage: 140, radius: 210, slow: 0.50, slowMs: 1700, cooldownMs: 5000 },
        },
      },
    },
  },
  sunforge: {
    key: 'sunforge',
    specKey: 'sunforge',
    branch: 'spec-b',
    title: 'Sunforge Bastion',
    cardTitle: 'SOLAR',
    weapon: 'sunCannon',
    description: 'Burning shells, and a Solar Flare that falls on the thickest knot.',
    levels: {
      3: {
        title: 'Sunforge Bastion',
        cost: 260,
        description: 'Shells splash and set the lane alight; Solar Flare hits the biggest cluster.',
        ability: { label: 'Solar Flare', flare: true },
        stats: {
          damage: 90,
          cooldown: 1120,
          range: 330,
          projectileSpeed: 560,
          projectile: 'cannonball',
          damageType: 'explosive',
          targetsGround: true,
          targetsAir: true,
          splash: 72,
          dot: { kind: 'burn', damage: 10, tickMs: 500, durationMs: 2600 },
          flare: { damage: 90, splash: 108, cooldownMs: 7000 },
        },
      },
      4: {
        title: 'Pyre Bastion',
        cost: 420,
        description: 'A wider shell, a hotter burn, and a Solar Flare that leaves fire on the road.',
        ability: { label: 'Solar Flare', flare: true },
        stats: {
          damage: 126,
          cooldown: 960,
          range: 345,
          projectileSpeed: 600,
          projectile: 'cannonball',
          damageType: 'explosive',
          targetsGround: true,
          targetsAir: true,
          splash: 84,
          dot: { kind: 'burn', damage: 13, tickMs: 500, durationMs: 3000 },
          flare: { damage: 130, splash: 124, cooldownMs: 6800 },
        },
      },
      5: {
        title: 'Dawnforge Bastion',
        cost: 700,
        description: 'Dawnbreaker shells, a five-second burn, and a Flare that clears a whole lane.',
        ability: { label: 'Dawnbreaker', flare: true },
        stats: {
          damage: 172,
          cooldown: 840,
          range: 360,
          projectileSpeed: 640,
          projectile: 'cannonball',
          damageType: 'explosive',
          targetsGround: true,
          targetsAir: true,
          splash: 98,
          dot: { kind: 'burn', damage: 17, tickMs: 500, durationMs: 3400 },
          flare: { damage: 200, splash: 148, cooldownMs: 6000 },
        },
      },
    },
  },
});

/** The two keys, in the order the chooser shows them. */
export const BASTION_BRANCH_ORDER = Object.freeze(['storm', 'sunforge']);

/** The bastion hits everything — its colour chip says so. */
export function bastionRole() {
  return 'both';
}

/** A branch record for a specialisation key, or null before level 3. */
export function bastionBranch(key) {
  return key ? BASTION_BRANCHES[key] || null : null;
}

/**
 * The stat block for the current tier.
 *
 * @param {{level?: number, specialization?: string|null}} view
 */
export function bastionStats(view) {
  const level = Math.min(BASTION_MAX_LEVEL, Math.max(1, view?.level || 1));
  const branch = level >= BASTION_SPEC_LEVEL ? bastionBranch(view?.specialization) : null;
  if (branch) return branch.levels[level].stats;
  const ladder = BASTION_LEVELS[Math.min(level, 2)];
  return ladder.stats;
}

/** What the inspector prints as the building's name. */
export function bastionTitle(view) {
  const level = Math.min(BASTION_MAX_LEVEL, Math.max(1, view?.level || 1));
  const branch = level >= BASTION_SPEC_LEVEL ? bastionBranch(view?.specialization) : null;
  if (branch) return branch.levels[level].title;
  return BASTION_LEVELS[Math.min(level, 2)].title;
}

/** The signature ability record for the current tier. */
export function bastionAbility(view) {
  const level = Math.min(BASTION_MAX_LEVEL, Math.max(1, view?.level || 1));
  const branch = level >= BASTION_SPEC_LEVEL ? bastionBranch(view?.specialization) : null;
  if (branch) return branch.levels[level].ability;
  return BASTION_LEVELS[Math.min(level, 2)].ability;
}

/** `[storm, sunforge]` at level 2, `[]` everywhere else before 5. */
function branchChoices() {
  return BASTION_BRANCH_ORDER.map((key) => {
    const branch = BASTION_BRANCHES[key];
    const tier = branch.levels[BASTION_SPEC_LEVEL];
    return {
      key: `bastion-${branch.key}`,
      specKey: branch.specKey,
      branch: branch.branch,
      upgradeCost: tier.cost,
      title: tier.title,
      // Two cards side by side on a 1024-wide panel have room for one word
      // each; the full name is what the tier becomes once it is bought.
      cardTitle: branch.cardTitle,
      description: tier.description,
      ability: tier.ability,
      // The gun is what the choice actually changes, and it is drawn tall and
      // narrow — the shape the card's art slot wants. A castle sheet cropped
      // into a 40-px box read as a piece of wall.
      preview: BASTION_BRANCH_ART[branch.specKey]?.[BASTION_SPEC_LEVEL]?.path
        || BASTION_WEAPONS[branch.weapon].path,
      weapon: branch.weapon,
      level: BASTION_SPEC_LEVEL,
      ...tier.stats,
    };
  });
}

/**
 * The upgrade options at the current tier, in the shape the inspector's
 * `nextUpgrades` contract already understands (`key`, `upgradeCost`, `title`,
 * `description`, plus the target tier's stats spread on top so the before/after
 * chips are computed from real numbers).
 *
 * @param {{level?: number, specialization?: string|null}} view
 * @returns {object[]}
 */
export function bastionUpgrades(view) {
  const level = Math.min(BASTION_MAX_LEVEL, Math.max(1, view?.level || 1));
  if (level >= BASTION_MAX_LEVEL) return [];
  if (level + 1 === BASTION_SPEC_LEVEL) return branchChoices();

  const branch = bastionBranch(view?.specialization);
  const nextLevel = level + 1;
  const tier = branch ? branch.levels[nextLevel] : BASTION_LEVELS[nextLevel];
  const art = bastionForm(nextLevel, view?.specialization);
  return [
    {
      key: `bastion-${nextLevel}`,
      upgradeCost: tier.cost,
      title: tier.title,
      description: tier.description,
      ability: tier.ability,
      preview: art.path,
      level: nextLevel,
      ...tier.stats,
    },
  ];
}

/** Which weapon art the current tier wears. */
export function bastionWeaponKey(view) {
  const branch = bastionBranch(view?.specialization);
  return BASTION_WEAPONS[branch?.weapon || 'wardCrystal'];
}

/**
 * How big the gun is drawn at this tier.
 *
 * Grows gently with the castle so a level-5 engine does not read as the same
 * peashooter the level-1 keep carried, and stays inside the socket the art
 * generator measured.
 */
export function bastionWeaponScale(level) {
  // The gun rides the keep's battlements, so it has to stay in proportion with
  // a 200-px-wide castle: at 0.94 the old crystal was the size of the gatehouse
  // and the castle read as its plinth.
  return 0.56 + 0.045 * (Math.min(BASTION_MAX_LEVEL, Math.max(1, level || 1)) - 1);
}
