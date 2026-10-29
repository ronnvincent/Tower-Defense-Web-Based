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
 * Art per level: the sheet, where its foot sits, and where the weapon is seated.
 *
 * `foot` and `socket` come from `scripts/build_bastion_forms.py compose` — the
 * generator measures the PNG it just wrote, so the gun can never float off the
 * tower it is supposed to stand on. `socket.x` is an offset from the sheet's
 * centre line, `socket.y` is height above the foot; both are in *source* pixels
 * and get multiplied by the sprite scale at runtime.
 */
export const BASTION_ART = Object.freeze({
  1: {
    key: 'bastion-l1',
    path: 'assets/arena/bastion-l1.png',
    sheet: [518, 480],
    foot: 44,
    socket: { x: 105, y: 146 },
  },
  2: {
    key: 'bastion-l2',
    path: 'assets/arena/bastion-l2.png',
    sheet: [518, 524],
    foot: 44,
    socket: { x: 105, y: 146 },
  },
  3: {
    key: 'bastion-l3',
    path: 'assets/arena/bastion-l3.png',
    sheet: [518, 622],
    foot: 44,
    socket: { x: 105, y: 146 },
  },
  4: {
    key: 'bastion-l4',
    path: 'assets/arena/bastion-l4.png',
    sheet: [518, 682],
    foot: 44,
    socket: { x: 105, y: 146 },
  },
  5: {
    key: 'bastion-l5',
    path: 'assets/arena/bastion-l5.png',
    sheet: [518, 740],
    foot: 44,
    socket: { x: 105, y: 146 },
  },
});

/** Every bastion texture the battlefield has to have before it draws a keep. */
export const BASTION_FORM_ART = Object.freeze(
  Object.values(BASTION_ART).map((entry) => ({ key: entry.key, path: entry.path }))
);

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
    muzzle: { x: 0, y: -184 },
    colour: 0x7fe3ff,
  },
  sunCannon: {
    key: 'bastion-sun-cannon',
    path: 'assets/arena/bastion-sun-cannon.png',
    muzzle: { x: 0, y: -160 },
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
        description: 'Chain up to three creeps; Thunderclap slows the gate yard every 7s.',
        ability: { label: 'Thunderclap', nova: true },
        stats: {
          damage: 46,
          cooldown: 820,
          range: 330,
          projectileSpeed: 720,
          projectile: 'lightning',
          damageType: 'magic',
          targetsGround: true,
          targetsAir: true,
          chainTargets: 3,
          chainRange: 96,
          chainFalloff: 0.82,
          nova: { damage: 55, radius: 140, slow: 0.25, slowMs: 800, cooldownMs: 7000 },
        },
      },
      4: {
        title: 'Tempest Bastion',
        cost: 420,
        description: 'The chain reaches four, and the Thunderclap bites harder.',
        ability: { label: 'Thunderclap', nova: true },
        stats: {
          damage: 60,
          cooldown: 720,
          range: 345,
          projectileSpeed: 760,
          projectile: 'lightning',
          damageType: 'magic',
          targetsGround: true,
          targetsAir: true,
          chainTargets: 4,
          chainRange: 104,
          chainFalloff: 0.84,
          nova: { damage: 70, radius: 152, slow: 0.32, slowMs: 1000, cooldownMs: 7000 },
        },
      },
      5: {
        title: 'Maelstrom Bastion',
        cost: 700,
        description: 'Five-target chain, and a Thunderclap that catches the whole yard in a gale.',
        ability: { label: 'Maelstrom', nova: true },
        stats: {
          damage: 78,
          cooldown: 600,
          range: 360,
          projectileSpeed: 800,
          projectile: 'lightning',
          damageType: 'magic',
          targetsGround: true,
          targetsAir: true,
          chainTargets: 5,
          chainRange: 112,
          chainFalloff: 0.86,
          nova: { damage: 95, radius: 172, slow: 0.42, slowMs: 1300, cooldownMs: 6000 },
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
          damage: 78,
          cooldown: 1150,
          range: 330,
          projectileSpeed: 560,
          projectile: 'cannonball',
          damageType: 'explosive',
          targetsGround: true,
          targetsAir: true,
          splash: 62,
          dot: { kind: 'burn', damage: 8, tickMs: 500, durationMs: 2500 },
          flare: { damage: 70, splash: 92, cooldownMs: 8000 },
        },
      },
      4: {
        title: 'Pyre Bastion',
        cost: 420,
        description: 'A wider shell, a hotter burn, and a Solar Flare that leaves fire on the road.',
        ability: { label: 'Solar Flare', flare: true },
        stats: {
          damage: 108,
          cooldown: 1000,
          range: 345,
          projectileSpeed: 600,
          projectile: 'cannonball',
          damageType: 'explosive',
          targetsGround: true,
          targetsAir: true,
          splash: 72,
          dot: { kind: 'burn', damage: 11, tickMs: 500, durationMs: 2800 },
          flare: { damage: 100, splash: 104, cooldownMs: 8000 },
        },
      },
      5: {
        title: 'Dawnforge Bastion',
        cost: 700,
        description: 'Dawnbreaker shells, a five-second burn, and a Flare that clears a whole lane.',
        ability: { label: 'Dawnbreaker', flare: true },
        stats: {
          damage: 145,
          cooldown: 880,
          range: 360,
          projectileSpeed: 640,
          projectile: 'cannonball',
          damageType: 'explosive',
          targetsGround: true,
          targetsAir: true,
          splash: 84,
          dot: { kind: 'burn', damage: 14, tickMs: 500, durationMs: 3200 },
          flare: { damage: 150, splash: 120, cooldownMs: 7500 },
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
      preview: `assets/arena/${BASTION_WEAPONS[branch.weapon].key}.png`,
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
  const art = BASTION_ART[nextLevel];
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
  return 0.94 + 0.04 * (Math.min(BASTION_MAX_LEVEL, Math.max(1, level || 1)) - 1);
}
