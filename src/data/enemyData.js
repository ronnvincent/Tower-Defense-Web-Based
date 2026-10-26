/**
 * Enemy type definitions & archetype mechanics.
 *
 *   health       – base hit points (scaled up per wave by waveHealthMultiplier)
 *   speed        – movement speed in pixels per second
 *   armor        – flat physical armor rating (mitigates damage via CombatCalculator)
 *   shield       – initial temporary shield barrier that absorbs damage first
 *   reward       – coins granted when the enemy is defeated (exactly once)
 *   score        – score granted when the enemy is defeated
 *   baseDamage   – base integrity lost if enemy reaches the base
 *   radius       – collision and hit radius in pixels
 *   siege        – damage per hit dealt to a palisade standing in the way
 *   siegeInterval– milliseconds between siege hits (default 1000)
 *   isBoss       – true for major boss encounters
 *   bossPhases   – phase thresholds and mechanics for boss encounters
 *   abilities    – archetype specific abilities (e.g. heal pulse, summons)
 *   traits       – behaviour bonuses the enemy brings to the fight:
 *                    enrage   { maxSpeedBonus } speed grows as health drops
 *                    phalanx  { radius, allies, reduction } damage cut while
 *                             packed with allies (countered by splash)
 *                    adaptive { perHit, max } armour grows with every hit
 *                             (countered by armour break and true damage)
 *   stunResist   0..1 fraction of a stun a boss shrugs off
 *
 * Sprites are looked up as `enemy-<typeKey>` (see src/data/spireManifest.js),
 * so no per-archetype sprite key is needed here.
 */

export const ENEMY_TYPES = {
  grunt: {
    key: 'grunt',
    name: 'Goblin Grunt',
    role: 'Standard balanced infantry — moderate health and speed.',
    health: 92,
    speed: 62,
    armor: 0,
    shield: 0,
    reward: 8,
    score: 10,
    baseDamage: 1,
    radius: 16,
    siege: 10,
  },

  runner: {
    key: 'runner',
    name: 'Shadow Runner',
    role: 'Fast agile scout — low health, high speed, tests rapid defenses.',
    health: 46,
    speed: 125,
    armor: 0,
    shield: 0,
    reward: 7,
    score: 12,
    baseDamage: 1,
    radius: 13,
    siege: 6,
    traits: { enrage: { maxSpeedBonus: 0.3 } },
  },

  brute: {
    key: 'brute',
    name: 'Iron Brute',
    role: 'Heavily armored juggernaut — 40 Armor reduces physical damage by ~28%. Weak to Magic and Armor Break.',
    health: 390,
    speed: 38,
    armor: 40,
    shield: 0,
    reward: 26,
    score: 35,
    baseDamage: 3,
    radius: 22,
    siege: 34,
    traits: { adaptive: { perHit: 3, max: 30 } },
  },

  swarm: {
    key: 'swarm',
    name: 'Abyssal Slime',
    role: 'Swarm creature — low health, fast, appears in dense packs. Highly vulnerable to Cannon area splash.',
    health: 30,
    speed: 88,
    armor: 0,
    shield: 0,
    reward: 3,
    score: 6,
    baseDamage: 1,
    radius: 12,
    siege: 4,
    useSlimeAnim: true,
  },

  healer: {
    key: 'healer',
    name: 'Plague Shaman',
    role: 'Support healer — pulses a restoration aura (+30 HP to nearby allies every 2.5s). Priority elimination target.',
    health: 215,
    speed: 50,
    armor: 10,
    shield: 0,
    reward: 21,
    score: 40,
    baseDamage: 2,
    radius: 18,
    siege: 8,
    ability: {
      type: 'heal',
      radius: 95,
      amount: 30,
      intervalMs: 2500,
    },
  },

  shield: {
    key: 'shield',
    name: 'Aegis Knight',
    role: 'Frontline vanguard — possesses a 120 HP Kinetic Barrier absorbing all damage before health can be touched.',
    health: 190,
    speed: 46,
    armor: 15,
    shield: 120, // 120 HP shield barrier
    reward: 19,
    score: 30,
    baseDamage: 2,
    radius: 19,
    siege: 14,
    traits: { phalanx: { radius: 62, allies: 1, reduction: 0.15 } },
  },

  /* ---------------------------------------------------------------- Flare pack
     Imported by scripts/extract_flare_enemies.py (CC-BY-SA 3.0). These are the
     bodies that are not insects: a corpse wall, a greenskin that outruns the
     grunts, and an undead marksman. Same 9-row strip contract as the Spire set,
     so the biome and tier recolours apply without a special case. */

  thrall: {
    key: 'thrall',
    name: 'Rotting Thrall',
    role: 'Corpse wall — slow, hard to kill, and it grinds the palisade down while the fast wave slips past.',
    health: 265,
    speed: 32,
    armor: 8,
    shield: 0,
    reward: 13,
    score: 18,
    baseDamage: 2,
    radius: 18,
    siege: 20,
    traits: { phalanx: { radius: 72, allies: 2, reduction: 0.22 } },
  },

  raider: {
    key: 'raider',
    name: 'Bog Raider',
    role: 'Greenskin skirmisher — faster than a grunt, reaches the palisade first and hacks it apart.',
    health: 84,
    speed: 96,
    armor: 0,
    shield: 0,
    reward: 9,
    score: 14,
    baseDamage: 1,
    radius: 14,
    siege: 16,
    siegeInterval: 900,
    traits: { enrage: { maxSpeedBonus: 0.45 } },
  },

  bonearcher: {
    key: 'bonearcher',
    name: 'Bone Archer',
    role: 'Undead marksman — light on its feet, armoured enough to ignore splash, and it picks the palisade apart from the second rank.',
    health: 132,
    speed: 70,
    armor: 12,
    shield: 0,
    reward: 11,
    score: 20,
    baseDamage: 1,
    radius: 15,
    siege: 12,
  },

  colossus: {
    key: 'colossus',
    name: 'Stone Colossus',
    role: 'Wave 3 Mid-Boss — 2-phase encounter: Hardened Carapace in Phase 1, Enraged Earth Shatter in Phase 2.',
    health: 1280,
    speed: 34,
    armor: 40,
    shield: 0,
    reward: 100,
    score: 250,
    baseDamage: 8,
    radius: 28,
    siege: 55,
    isBoss: true,
    bossPhases: [
      {
        phase: 1,
        name: 'Hardened Carapace',
        thresholdPct: 1.0,
        armor: 35,
        speedMultiplier: 1.0,
        ability: {
          type: 'shieldStance',
          intervalMs: 6000,
          durationMs: 3000,
          damageReduction: 0.4,
        },
      },
      {
        phase: 2,
        name: 'Enraged Quake',
        thresholdPct: 0.5,
        armor: 10, // Armor stripped!
        speedMultiplier: 1.45, // Speed surges
        onEnterText: 'PHASE 2: ENRAGED EARTH SHATTER!',
      },
    ],
    stunResist: 0.5,
  },

  warlord: {
    key: 'warlord',
    name: 'Abyssal Warlord',
    role: 'Wave 6 Final Boss — 3-phase epic encounter: Rift Summoning, Kinetic Shield Matrix, and Overdrive Final Stand.',
    health: 3380,
    speed: 32,
    armor: 25,
    shield: 0,
    reward: 200,
    score: 600,
    baseDamage: 12,
    radius: 30,
    siege: 70,
    isBoss: true,
    bossPhases: [
      {
        phase: 1,
        name: 'Rift Commander',
        thresholdPct: 1.0,
        speedMultiplier: 1.0,
        ability: {
          type: 'summon',
          enemyKey: 'swarm',
          count: 2,
          intervalMs: 6000,
        },
      },
      {
        phase: 2,
        name: 'Kinetic Shield Matrix',
        thresholdPct: 0.6,
        grantShield: 750, // Deploys 750 HP kinetic barrier
        speedMultiplier: 1.1,
        onEnterText: 'PHASE 2: KINETIC SHIELD MATRIX DEPLOYED!',
      },
      {
        phase: 3,
        name: 'Overdrive Final Stand',
        thresholdPct: 0.25,
        speedMultiplier: 1.4,
        immuneToSlow: true,
        onEnterText: 'PHASE 3: OVERDRIVE FINAL STAND!',
      },
    ],
    stunResist: 0.6,
  },

  /**
   * Level 2 boss — buffs the horde instead of tanking alone.
   * The aura makes every nearby enemy sprint, so the answer is to kill the
   * escorts *before* the pulse lands, or to burst the Tyrant down early.
   */
  sandwyrm: {
    key: 'sandwyrm',
    name: 'Dune Tyrant',
    role: 'Sunscorch Mesa boss — pulses a Sandstorm Aura (+35% speed nearby) every 7s, hardening into Razor Winds below 45% HP.',
    health: 2800,
    speed: 46,
    armor: 20,
    shield: 0,
    reward: 180,
    score: 500,
    baseDamage: 10,
    radius: 30,
    siege: 60,
    isBoss: true,
    bossPhases: [
      {
        phase: 1,
        name: 'Sandstorm Aura',
        thresholdPct: 1.0,
        ability: {
          type: 'speedAura',
          radius: 190,
          multiplier: 1.35,
          durationMs: 3500,
          intervalMs: 7000,
        },
      },
      {
        phase: 2,
        name: 'Razor Winds',
        thresholdPct: 0.45,
        speedMultiplier: 1.3,
        ability: {
          type: 'speedAura',
          radius: 220,
          multiplier: 1.5,
          durationMs: 4000,
          intervalMs: 6000,
        },
        onEnterText: 'PHASE 2: RAZOR WINDS!',
      },
    ],
    stunResist: 0.4,
  },

  /**
   * Level 3 boss — shuts down the player's answer instead of out-statting it.
   * Glacial Pulse freezes towers inside its radius, so a defence that leans on
   * one kill-box gets switched off while the escorts walk through.
   */
  frostwarden: {
    key: 'frostwarden',
    name: 'Frost Warden',
    role: 'Frostbite Hollow boss — Glacial Pulse disables every tower within 170 px for 2.6s, then raises an Absolute Zero barrier below 55% HP.',
    health: 3700,
    speed: 28,
    armor: 30,
    shield: 0,
    reward: 220,
    score: 650,
    baseDamage: 12,
    radius: 32,
    siege: 75,
    isBoss: true,
    bossPhases: [
      {
        phase: 1,
        name: 'Glacial Pulse',
        thresholdPct: 1.0,
        ability: {
          type: 'disableTowers',
          radius: 170,
          durationMs: 2600,
          intervalMs: 8000,
        },
      },
      {
        phase: 2,
        name: 'Absolute Zero',
        thresholdPct: 0.55,
        grantShield: 600,
        ability: {
          type: 'disableTowers',
          radius: 190,
          durationMs: 3200,
          intervalMs: 6500,
        },
        onEnterText: 'PHASE 2: ABSOLUTE ZERO!',
      },
      {
        phase: 3,
        name: 'Whiteout',
        thresholdPct: 0.22,
        speedMultiplier: 1.4,
        immuneToSlow: true,
        onEnterText: 'PHASE 3: WHITEOUT!',
      },
    ],
    stunResist: 0.6,
  },

  /* ------------------------------------------------------------ Flare bosses
     Endless rotation from cycle 5 (wave 30). They keep their painted detail —
     `BOSS_SOURCES` grades them only 50-55% toward their element instead of the
     full duotone the Spire giants get, because a flat ramp turns armour into a
     silhouette. Each one owns a different way to break a defence: speed, tower
     lockout, or bodies. */

  /**
   * The bull that breaks the line — drums the horde forward, then drops its
   * armour for raw speed as it dies.
   */
  ironhorn: {
    key: 'ironhorn',
    name: 'Ironhorn Minotaur',
    role: 'Endless boss — beats the war drum to speed the whole pack up, then sheds its armour for a final charge.',
    health: 3000,
    speed: 30,
    armor: 60,
    shield: 0,
    reward: 240,
    score: 750,
    baseDamage: 12,
    radius: 38,
    siege: 110,
    isBoss: true,
    bossPhases: [
      {
        phase: 1,
        name: 'War Drum',
        thresholdPct: 1,
        armor: 60,
        ability: {
          type: 'speedAura',
          radius: 150,
          multiplier: 1.25,
          durationMs: 2600,
          intervalMs: 8000,
        },
      },
      {
        phase: 2,
        name: 'Bloodrage',
        thresholdPct: 0.6,
        armor: 38,
        speedMultiplier: 1.25,
        onEnterText: 'PHASE 2: BLOODRAGE!',
      },
      {
        phase: 3,
        name: 'Last Stand',
        thresholdPct: 0.28,
        speedMultiplier: 1.4,
        immuneToSlow: true,
        onEnterText: 'PHASE 3: LAST STAND!',
      },
    ],
    stunResist: 0.5,
  },

  /**
   * The flyer — outpaces the lane, blinds the towers around it, then dives.
   */
  ashwing: {
    key: 'ashwing',
    name: 'Ashwing Wyvern',
    // A wyvern that walks is a wyvern nobody believes in. Airborne units skip
    // the road, ignore palisades and can only be shot by defences with
    // `targetsAir` (see Tower.acquireTarget).
    flying: true,
    role: 'Endless boss — wingbeat hastens the brood, ember breath shuts nearby towers down, and its final dive cannot be slowed.',
    health: 3400,
    speed: 46,
    armor: 30,
    shield: 300,
    reward: 280,
    score: 850,
    baseDamage: 13,
    radius: 40,
    // Airborne: it never meets a palisade, so it has no siege value at all.
    siege: 0,
    isBoss: true,
    bossPhases: [
      {
        phase: 1,
        name: 'Wingbeat',
        thresholdPct: 1,
        ability: {
          type: 'speedAura',
          radius: 210,
          multiplier: 1.35,
          durationMs: 2400,
          intervalMs: 6500,
        },
      },
      {
        phase: 2,
        name: 'Ember Breath',
        thresholdPct: 0.65,
        grantShield: 400,
        speedMultiplier: 1.1,
        ability: {
          type: 'disableTowers',
          radius: 170,
          durationMs: 2200,
          intervalMs: 8000,
        },
        onEnterText: 'PHASE 2: EMBER BREATH!',
      },
      {
        phase: 3,
        name: 'Ashen Dive',
        thresholdPct: 0.3,
        speedMultiplier: 1.45,
        immuneToSlow: true,
        onEnterText: 'PHASE 3: ASHEN DIVE!',
      },
    ],
    stunResist: 0.4,
  },

  /**
   * The commander — pays for its slow march with bodies and a bone barrier.
   */
  gravesworn: {
    key: 'gravesworn',
    name: 'Grave-Sworn Marshal',
    role: 'Endless boss — raises a bone barrier, then calls its guard back from the grave twice before turning deathless.',
    health: 3800,
    speed: 27,
    armor: 55,
    shield: 500,
    reward: 300,
    score: 900,
    baseDamage: 15,
    radius: 40,
    siege: 125,
    isBoss: true,
    bossPhases: [
      {
        phase: 1,
        name: 'Bone Wall',
        thresholdPct: 1,
        ability: {
          type: 'summon',
          enemyKey: 'brute',
          count: 2,
          intervalMs: 7000,
        },
      },
      {
        phase: 2,
        name: 'Raise Dead',
        thresholdPct: 0.65,
        grantShield: 900,
        speedMultiplier: 1.1,
        ability: {
          type: 'summon',
          enemyKey: 'shield',
          count: 3,
          intervalMs: 6500,
        },
        onEnterText: 'PHASE 2: RAISE DEAD!',
      },
      {
        phase: 3,
        name: 'Deathless',
        thresholdPct: 0.3,
        speedMultiplier: 1.35,
        immuneToSlow: true,
        onEnterText: 'PHASE 3: DEATHLESS!',
      },
    ],
    stunResist: 0.5,
  },

  /**
   * Endless Siege boss — summons, speeds the pack up, then erupts.
   * Appears every fifth wave with the other bosses in rotation.
   */
  magmalord: {
    key: 'magmalord',
    name: 'Magma Regent',
    role: 'Endless Siege boss — opens the rift for swarm reinforcements, then erupts into a faster, shielded third phase.',
    health: 4400,
    speed: 30,
    armor: 25,
    shield: 0,
    reward: 260,
    score: 800,
    baseDamage: 14,
    radius: 34,
    siege: 85,
    isBoss: true,
    bossPhases: [
      {
        phase: 1,
        name: 'Cinder Command',
        thresholdPct: 1.0,
        ability: {
          type: 'summon',
          enemyKey: 'swarm',
          count: 3,
          intervalMs: 6000,
        },
      },
      {
        phase: 2,
        name: 'Eruption',
        thresholdPct: 0.6,
        grantShield: 500,
        speedMultiplier: 1.15,
        ability: {
          type: 'speedAura',
          radius: 200,
          multiplier: 1.4,
          durationMs: 3000,
          intervalMs: 7000,
        },
        onEnterText: 'PHASE 2: ERUPTION!',
      },
      {
        phase: 3,
        name: 'Caldera Core',
        thresholdPct: 0.25,
        speedMultiplier: 1.35,
        immuneToSlow: true,
        onEnterText: 'PHASE 3: CALDERA CORE!',
      },
    ],
    stunResist: 0.6,
  },

  /**
   * Prism Depths boss — refracts fire into tower lockouts, then splits into a
   * shielded, hasted second phase and a hard-light final phase.
   */
  prismlord: {
    key: 'prismlord',
    name: 'Prism Warden',
    role: 'Prism Depths boss — Refraction locks every tower within 180 px, then raises a hard-light barrier below 60% HP and turns the horde faster still.',
    health: 5000,
    speed: 26,
    armor: 28,
    shield: 0,
    reward: 300,
    score: 950,
    baseDamage: 16,
    radius: 33,
    siege: 92,
    isBoss: true,
    bossPhases: [
      {
        phase: 1,
        name: 'Refraction',
        thresholdPct: 1.0,
        ability: {
          type: 'disableTowers',
          radius: 180,
          durationMs: 2400,
          intervalMs: 8200,
        },
      },
      {
        phase: 2,
        name: 'Hard Light',
        thresholdPct: 0.6,
        grantShield: 700,
        speedMultiplier: 1.12,
        ability: {
          type: 'summon',
          enemyKey: 'swarm',
          count: 4,
          intervalMs: 6500,
        },
        onEnterText: 'PHASE 2: HARD LIGHT!',
      },
      {
        phase: 3,
        name: 'Total Internal Reflection',
        thresholdPct: 0.28,
        speedMultiplier: 1.45,
        immuneToSlow: true,
        onEnterText: 'PHASE 3: TOTAL REFLECTION!',
      },
    ],
    stunResist: 0.5,
  },

  /**
   * Endless Siege titans — the answer to "wave 20 is a walkover".
   *
   * These are not campaign bosses with a bigger number: each one carries a
   * four-phase script that keeps flipping the answer the player needs (armour →
   * shield → haste → unstoppable), so a defence that solved wave 15 has to be
   * rebuilt while the titan is already walking. They only appear from the fifth
   * boss cycle (wave 20) onwards, and never in a stage fight.
   */
  // The campaign's airborne rank and file. It reuses the wyvern sheet — the
  // only wings in the library — at a much smaller radius, so the silhouette
  // reads as a raider rather than a boss. `art` is the sheet key; `key` stays
  // the rules key.
  /**
   * Armored Guard — the spec's "35 % physical resist" archetype.
   *
   * Flat armour (the `brute` line) already exists; this one is a *typed*
   * resistance instead, so a physical tower that is fine against 40 armour gets
   * no comfort here, while a magic tower that ignores armour is not punished
   * for it. `resistances` is read by the central resolver.
   */
  guard: {
    key: 'guard',
    name: 'Armored Guard',
    role: 'Shrugged plate — takes 35 % less physical damage; magic and true damage ignore the plate.',
    art: 'brute',
    health: 150,
    speed: 24,
    armor: 0,
    shield: 0,
    resistances: { physical: 0.35, piercing: 0.2 },
    reward: 14,
    score: 22,
    baseDamage: 2,
    radius: 20,
    siege: 22,
  },

  /**
   * Hex Adept — the enemy-support archetype.
   *
   * It does not fight; every 7 s it wards nearby creeps with a 20-point barrier
   * inside a 100 px radius, and `Enemy.grantShield` refuses to replace a
   * stronger shield. Killing it is worth more than its own health bar suggests,
   * which is the point of a support unit.
   */
  hex: {
    key: 'hex',
    name: 'Hex Adept',
    role: 'Curses its escort: every 7 s it puts a 20-point barrier on nearby creeps. Kill it first.',
    art: 'healer',
    health: 90,
    speed: 28,
    armor: 0,
    shield: 0,
    reward: 12,
    score: 26,
    baseDamage: 1,
    radius: 18,
    // Every ground archetype has to be able to break a wall down, or a single
    // palisade would wall the caster off forever and the escort would follow it
    // into a dead end. 6 puts it on the light-unit tier (runner 6, swarm 4),
    // below the 215-HP healer's 8: a fragile caster is not a wall-breaker, but
    // it is not wall-proof either.
    siege: 6,
    support: { kind: 'shield', amount: 20, radius: 100, intervalMs: 7000 },
  },

  wraith: {
    key: 'wraith',
    name: 'Flying Wraith',
    role: 'Airborne raider — ignores roads and palisades; only anti-air towers can bring it down.',
    art: 'ashwing',
    health: 120,
    speed: 74,
    armor: 0,
    shield: 0,
    reward: 10,
    score: 16,
    baseDamage: 1,
    // Wide wings read small when the art is scaled by radius; 18 keeps the
    // wraith visibly bigger than a slime and smaller than the wyvern boss.
    radius: 18,
    siege: 0,
    flying: true,
  },

  obsidian: {
    key: 'obsidian',
    name: 'Obsidian Behemoth',
    role: 'Endless titan — 70 armour up front, a 1500 HP skin at 70%, fracture haste at 40% and an unstoppable last stand.',
    health: 9500,
    speed: 26,
    armor: 70,
    shield: 400,
    reward: 420,
    score: 1500,
    baseDamage: 22,
    radius: 44,
    siege: 140,
    isBoss: true,
    bossPhases: [
      {
        phase: 1,
        name: 'Living Bulwark',
        thresholdPct: 1.0,
        armor: 70,
        ability: {
          type: 'summon',
          enemyKey: 'shield',
          count: 4,
          intervalMs: 7000,
        },
      },
      {
        phase: 2,
        name: 'Obsidian Skin',
        thresholdPct: 0.7,
        grantShield: 1500,
        speedMultiplier: 1.1,
        onEnterText: 'PHASE 2: OBSIDIAN SKIN!',
      },
      {
        phase: 3,
        name: 'Fracture',
        thresholdPct: 0.4,
        armor: 30,
        speedMultiplier: 1.35,
        ability: {
          type: 'speedAura',
          radius: 230,
          multiplier: 1.5,
          durationMs: 4000,
          intervalMs: 6000,
        },
        onEnterText: 'PHASE 3: FRACTURE!',
      },
      {
        phase: 4,
        name: 'The Unmade',
        thresholdPct: 0.15,
        speedMultiplier: 1.6,
        immuneToSlow: true,
        onEnterText: 'PHASE 4: THE UNMADE!',
      },
    ],
    stunResist: 0.7,
  },

  voidherald: {
    key: 'voidherald',
    name: 'Void Herald',
    role: 'Endless titan — silences every tower within 200 px, summons brutes mid-fight and collapses into a hasted final form.',
    health: 8200,
    speed: 30,
    armor: 45,
    shield: 600,
    reward: 460,
    score: 1700,
    baseDamage: 25,
    radius: 42,
    siege: 160,
    isBoss: true,
    bossPhases: [
      {
        phase: 1,
        name: 'Null Field',
        thresholdPct: 1.0,
        ability: {
          type: 'disableTowers',
          radius: 200,
          durationMs: 3000,
          intervalMs: 8000,
        },
      },
      {
        phase: 2,
        name: 'Herald of the Swarm',
        thresholdPct: 0.75,
        grantShield: 1200,
        ability: {
          type: 'summon',
          enemyKey: 'brute',
          count: 3,
          intervalMs: 6500,
        },
        onEnterText: 'PHASE 2: HERALD OF THE SWARM!',
      },
      {
        phase: 3,
        name: 'Collapse',
        thresholdPct: 0.45,
        speedMultiplier: 1.25,
        ability: {
          type: 'disableTowers',
          radius: 230,
          durationMs: 3600,
          intervalMs: 6500,
        },
        onEnterText: 'PHASE 3: COLLAPSE!',
      },
      {
        phase: 4,
        name: 'Event Horizon',
        thresholdPct: 0.18,
        speedMultiplier: 1.5,
        immuneToSlow: true,
        onEnterText: 'PHASE 4: EVENT HORIZON!',
      },
    ],
    stunResist: 0.6,
  },
};

/**
 * Health multiplier for wave w (1-based): 1 + 0.09 × (w − 1), capped at 2×.
 *
 * The slope used to be 0.12/wave, which made wave 6 fights drag once the boss
 * arrives. 9% per wave still ramps the pressure but keeps late waves winnable
 * with the seven-tower dock.
 */
export function waveHealthMultiplier(waveNumber) {
  return Math.min(2, 1 + 0.09 * (waveNumber - 1));
}

/**
 * Endless Siege's own HP ramp — the campaign curve above is *capped at 2×* so a
 * six-wave stage never turns into a slog, and that cap is exactly why the old
 * endless run flattened out: from wave 12 onwards the horde stopped growing.
 *
 * This one never caps. It is quadratic so the first ten waves stay learnable and
 * the next thirty do not: 2.2× at wave 10, 4.3× at 20, 7.3× at 30, 15.5× at 50
 * (on top of the level's own 1.2× and the capped campaign ramp).
 */
export function endlessHealthScale(waveNumber) {
  const w = Math.max(0, Math.floor(Number(waveNumber) || 1) - 1);
  return 1 + 0.1 * w + 0.004 * w * w;
}

/**
 * Endless speed ramp. Flatter than the HP curve on purpose: a creep that
 * outruns the camera stops being readable, so the horde caps at 1.75× while its
 * health keeps climbing forever.
 */
export function endlessSpeedScale(waveNumber) {
  const w = Math.max(0, Math.floor(Number(waveNumber) || 1) - 1);
  return Math.min(1.75, 1 + 0.012 * w + 0.00025 * w * w);
}

/**
 * Endless HP ramp for **bosses only**.
 *
 * A titan already carries 7 800–9 000 base HP, and it first walks in on wave 20
 * where the creep ramp is 4.3×: applying that wholesale would park a 90 000 HP
 * wall on the lane, which is not a boss fight — it is a timer. Bosses therefore
 * get a linear ramp capped at 3× (1.95× on wave 20, 2.95× on wave 40), so the
 * fight stays about the phases and the escorts instead of a health sponge.
 */
export function endlessBossHealthScale(waveNumber) {
  const w = Math.max(0, Math.floor(Number(waveNumber) || 1) - 1);
  return Math.min(3, 1 + 0.05 * w);
}

/**
 * Endless bounty ramp. Kill payouts are flat per archetype, so without this a
 * 2000 HP grunt still hands over 7 gold and the player cannot rebuild the wall
 * that the wave just broke.
 */
export function endlessRewardScale(waveNumber) {
  const w = Math.max(0, Math.floor(Number(waveNumber) || 1) - 1);
  return 1 + 0.06 * w;
}
