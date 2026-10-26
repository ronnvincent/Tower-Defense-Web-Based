import { describe, it, expect } from 'vitest';
import { TOWER_TYPES, calculateSellRefund } from '../src/data/towerData.js';
import { ENEMY_TYPES } from '../src/data/enemyData.js';
import { WAVES, countWaveEnemies } from '../src/data/waveData.js';
import { calculateDamage, DAMAGE_TYPE } from '../src/systems/CombatCalculator.js';
import { SELL_REFUND_RATIO } from '../src/config/gameConfig.js';

describe('Tower Progression & Specialization Architecture', () => {
  it('defines 3 distinct progression levels for the Ballista Tower with branching specializations', () => {
    const archer = TOWER_TYPES.archer;
    expect(archer.name).toBe('Ballista Tower');
    expect(archer.levels).toHaveLength(2); // Level 1 & Level 2

    const lvl1 = archer.levels[0];
    const lvl2 = archer.levels[1];
    expect(lvl1.title).toBe('Scout Ballista');
    expect(lvl2.title).toBe('Twin Ballista');
    expect(lvl2.damage).toBeGreaterThan(lvl1.damage);
    expect(lvl2.range).toBeGreaterThan(lvl1.range);

    // Branching specializations at Level 3
    expect(archer.specializations).toBeDefined();
    expect(archer.specializations.rapid).toBeDefined();
    expect(archer.specializations.sniper).toBeDefined();

    const rapid = archer.specializations.rapid;
    const sniper = archer.specializations.sniper;

    // Rapid Ranger: high attack speed, moderate damage, rapid projectile
    expect(rapid.title).toBe('Rapid Ranger');
    expect(rapid.cooldown).toBeLessThan(lvl2.cooldown);
    expect(rapid.spriteKey).toBe('tower-top-archer-spec-a');

    // Sniper Tower: slow fire, extreme range, piercing damage with 50% armor penetration
    expect(sniper.title).toBe('Sniper Tower');
    expect(sniper.range).toBeGreaterThan(rapid.range);
    expect(sniper.damage).toBeGreaterThan(rapid.damage);
    expect(sniper.armorPenetration).toBe(0.5);
    expect(sniper.spriteKey).toBe('tower-top-archer-spec-b');
  });

  it('defines Boulder Sling evolutions: Siege Sling (AoE) vs Stone Hammer (Anti-Armor)', () => {
    const cannon = TOWER_TYPES.cannon;
    expect(cannon.specializations.siege).toBeDefined();
    expect(cannon.specializations.artillery).toBeDefined();

    const siege = cannon.specializations.siege;
    const artillery = cannon.specializations.artillery;

    expect(siege.title).toBe('Siege Sling');
    expect(artillery.title).toBe('Stone Hammer');
    expect(siege.splash).toBeGreaterThan(artillery.splash);
    expect(artillery.damage).toBeGreaterThan(siege.damage);
    expect(artillery.armorBreak).toBe(25);
  });

  it('defines Arcane/Frost evolutions: Blizzard Spire (Group Slow) vs Lightning Conductor (Chain Damage)', () => {
    const frost = TOWER_TYPES.frost;
    expect(frost.specializations.blizzard).toBeDefined();
    expect(frost.specializations.lightning).toBeDefined();

    const blizzard = frost.specializations.blizzard;
    const lightning = frost.specializations.lightning;

    expect(blizzard.slow).toBe(0.6);
    expect(blizzard.slowMs).toBe(2200);

    expect(lightning.chainTargets).toBe(3);
    expect(lightning.damageType).toBe(DAMAGE_TYPE.LIGHTNING);
  });

  it('calculates cumulative investment and sell refund accurately across upgrade tiers', () => {
    const archer = TOWER_TYPES.archer; // Cost: 60
    const lvl2 = archer.levels[1]; // Upgrade cost: 50 -> Total: 110
    const rapid = archer.specializations.rapid; // Upgrade cost: 90 -> Total: 200

    // The specification fixes the ratio at 60 % of recorded spend.
    expect(SELL_REFUND_RATIO).toBe(0.6);

    const baseRefund = calculateSellRefund(archer.cost);
    expect(baseRefund).toBe(Math.floor(60 * SELL_REFUND_RATIO)); // 36

    const lvl2Refund = calculateSellRefund(archer.cost + lvl2.upgradeCost);
    expect(lvl2Refund).toBe(Math.floor(110 * SELL_REFUND_RATIO)); // 66

    const specRefund = calculateSellRefund(archer.cost + lvl2.upgradeCost + rapid.upgradeCost);
    expect(specRefund).toBe(Math.floor(200 * SELL_REFUND_RATIO)); // 120
  });
});

describe('Targeting Priorities Simulation', () => {
  const mockTower = { x: 200, y: 200, range: 150 };

  const candidates = [
    { id: 1, x: 220, y: 200, distanceTraveled: 120, health: 80, maxHealth: 100 },
    { id: 2, x: 280, y: 200, distanceTraveled: 350, health: 50, maxHealth: 100 },
    { id: 3, x: 190, y: 200, distanceTraveled: 40, health: 400, maxHealth: 500 },
  ];

  function getDistance(t, e) {
    return Math.hypot(e.x - t.x, e.y - t.y);
  }

  function pickTarget(tower, list, mode) {
    const inRange = list.filter((e) => getDistance(tower, e) <= tower.range);
    if (inRange.length === 0) return null;

    if (mode === 'FIRST') {
      return inRange.reduce((best, curr) => (curr.distanceTraveled > best.distanceTraveled ? curr : best));
    }
    if (mode === 'LAST') {
      return inRange.reduce((best, curr) => (curr.distanceTraveled < best.distanceTraveled ? curr : best));
    }
    if (mode === 'STRONGEST') {
      return inRange.reduce((best, curr) => (curr.health > best.health ? curr : best));
    }
    if (mode === 'NEAREST') {
      return inRange.reduce((best, curr) => (getDistance(tower, curr) < getDistance(tower, best) ? curr : best));
    }
    return inRange[0];
  }

  it('selects the furthest along path with FIRST priority', () => {
    const target = pickTarget(mockTower, candidates, 'FIRST');
    expect(target.id).toBe(2);
  });

  it('selects the least along path with LAST priority', () => {
    const target = pickTarget(mockTower, candidates, 'LAST');
    expect(target.id).toBe(3);
  });

  it('selects the highest current HP enemy with STRONGEST priority', () => {
    const target = pickTarget(mockTower, candidates, 'STRONGEST');
    expect(target.id).toBe(3);
  });

  it('selects the geographically closest enemy with NEAREST priority', () => {
    const target = pickTarget(mockTower, candidates, 'NEAREST');
    expect(target.id).toBe(3);
  });
});

describe('Enemy Archetypes & Combat Balance', () => {
  it('ensures Armored Brute mitigates physical damage via CombatCalculator', () => {
    const brute = ENEMY_TYPES.brute;
    expect(brute.armor).toBe(40);

    const rawPhysical = 100;
    const physicalResult = calculateDamage({
      rawDamage: rawPhysical,
      armor: brute.armor,
      damageType: DAMAGE_TYPE.PHYSICAL,
    });

    // 100 * (100 / (100 + 40)) = 71.42 -> 71
    expect(physicalResult.finalDamage).toBe(71);

    // Piercing damage has intrinsic 50% armor penetration
    const piercingResult50 = calculateDamage({
      rawDamage: rawPhysical,
      armor: brute.armor,
      damageType: DAMAGE_TYPE.PIERCING,
      armorPenetration: 0,
    });
    // Effective armor = 40 * (1 - 0.5) = 20
    // 100 * (100 / 120) = 83.33 -> 83
    expect(piercingResult50.finalDamage).toBe(83);
    expect(piercingResult50.finalDamage).toBeGreaterThan(physicalResult.finalDamage);

    // Sniper Piercing with +50% extra penetration reaches 100% total penetration
    const piercingResult100 = calculateDamage({
      rawDamage: rawPhysical,
      armor: brute.armor,
      damageType: DAMAGE_TYPE.PIERCING,
      armorPenetration: 0.5,
    });
    expect(piercingResult100.finalDamage).toBe(100);
  });

  it('ensures Aegis Shield Knight absorbs damage into shield first before health', () => {
    const shieldKnight = ENEMY_TYPES.shield;
    expect(shieldKnight.shield).toBe(120);

    // 70 damage hit
    const res1 = calculateDamage({
      rawDamage: 70,
      armor: 0,
      activeShield: shieldKnight.shield,
    });
    expect(res1.shieldAbsorbed).toBe(70);
    expect(res1.remainingShield).toBe(50);
    expect(res1.damageDealtToHealth).toBe(0);

    // Second hit of 80 damage against remaining 50 shield
    const res2 = calculateDamage({
      rawDamage: 80,
      armor: 0,
      activeShield: res1.remainingShield,
    });
    expect(res2.shieldAbsorbed).toBe(50);
    expect(res2.remainingShield).toBe(0);
    expect(res2.damageDealtToHealth).toBe(30);
  });

  it('ensures Swarm Slimes have low health and yield fast rewards', () => {
    const swarm = ENEMY_TYPES.swarm;
    const grunt = ENEMY_TYPES.grunt;
    expect(swarm.health).toBeLessThan(grunt.health);
    expect(swarm.reward).toBe(3);
  });
});

describe('Boss Encounters & Multi-Phase Progression', () => {
  it('configures Wave 3 Mid-Boss Stone Colossus with 2 distinct tactical phases', () => {
    const boss = ENEMY_TYPES.colossus;
    expect(boss.isBoss).toBe(true);
    expect(boss.bossPhases).toHaveLength(2);

    const phase1 = boss.bossPhases[0];
    expect(phase1.name).toBe('Hardened Carapace');
    expect(phase1.armor).toBe(35);

    const phase2 = boss.bossPhases[1];
    expect(phase2.thresholdPct).toBe(0.5); // Triggers at 50% HP
    expect(phase2.name).toBe('Enraged Quake');
    expect(phase2.armor).toBe(10); // Sheds armor down to 10
    expect(phase2.speedMultiplier).toBe(1.45); // Moves 45% faster
  });

  it('configures Wave 6 Final Boss Abyssal Warlord with 3 epic tactical phases', () => {
    const warlord = ENEMY_TYPES.warlord;
    expect(warlord.isBoss).toBe(true);
    expect(warlord.bossPhases).toHaveLength(3);

    const p1 = warlord.bossPhases[0];
    expect(p1.name).toBe('Rift Commander');

    const p2 = warlord.bossPhases[1];
    expect(p2.thresholdPct).toBe(0.6); // Triggers at 60% HP
    expect(p2.name).toBe('Kinetic Shield Matrix');
    expect(p2.grantShield).toBe(750);

    const p3 = warlord.bossPhases[2];
    expect(p3.thresholdPct).toBe(0.25); // Triggers at 25% HP
    expect(p3.name).toBe('Overdrive Final Stand');
    expect(p3.speedMultiplier).toBe(1.4);
    expect(p3.immuneToSlow).toBe(true);
  });

  it('verifies Wave Composition progression from introductory to Final Boss', () => {
    expect(WAVES).toHaveLength(6);

    // Wave 1: Grunts introduction
    expect(WAVES[0].bossWave).toBeFalsy();
    expect(countWaveEnemies(WAVES[0])).toBe(10);

    // Wave 3: Mid-Boss Stone Colossus
    expect(WAVES[2].bossWave).toBe(true);
    expect(WAVES[2].groups.some((g) => g.type === 'colossus')).toBe(true);

    // Wave 6: Final Boss Abyssal Warlord
    expect(WAVES[5].bossWave).toBe(true);
    expect(WAVES[5].groups.some((g) => g.type === 'warlord')).toBe(true);
  });
});
