import { describe, it, expect } from 'vitest';
import {
  calculateDamage,
  calculateEffectiveArmor,
  getArmorDamageMultiplier,
  calculateSplashDamage,
  DAMAGE_TYPE,
} from '../src/systems/CombatCalculator.js';

describe('CombatCalculator', () => {
  describe('Armor Calculations', () => {
    it('effective armor is 0 when base armor is 0', () => {
      expect(calculateEffectiveArmor(0, 0, 0)).toBe(0);
    });

    it('armor break reduces flat armor before penetration', () => {
      // 50 armor - 20 break = 30 armor. 50% penetration of 30 = 15.
      expect(calculateEffectiveArmor(50, 0.5, 20)).toBe(15);
    });

    it('armor break cannot make armor negative', () => {
      expect(calculateEffectiveArmor(30, 0, 50)).toBe(0);
    });

    it('100 armor reduces damage by exactly 50%', () => {
      // Multiplier = 100 / (100 + 100) = 0.5
      expect(getArmorDamageMultiplier(100)).toBeCloseTo(0.5);
    });

    it('0 armor causes no reduction (multiplier 1.0)', () => {
      expect(getArmorDamageMultiplier(0)).toBe(1.0);
    });
  });

  describe('Damage Types & Penetration', () => {
    it('physical damage takes full armor mitigation', () => {
      // 100 raw damage vs 100 armor => 100 * 0.5 = 50 damage
      const res = calculateDamage({
        rawDamage: 100,
        damageType: DAMAGE_TYPE.PHYSICAL,
        armor: 100,
      });
      expect(res.finalDamage).toBe(50);
      expect(res.effectiveArmor).toBe(100);
    });

    it('piercing damage has intrinsic 50% armor penetration', () => {
      // 100 raw damage vs 100 armor. Piercing ignores 50% -> effective armor = 50.
      // Multiplier = 100 / (100 + 50) = 0.6667 => 67 damage.
      const res = calculateDamage({
        rawDamage: 100,
        damageType: DAMAGE_TYPE.PIERCING,
        armor: 100,
      });
      expect(res.effectiveArmor).toBe(50);
      expect(res.finalDamage).toBe(67);
    });

    it('magic damage bypasses 75% of armor', () => {
      // 100 raw damage vs 100 armor. Magic ignores 75% -> effective armor = 25.
      // Multiplier = 100 / 125 = 0.8 => 80 damage.
      const res = calculateDamage({
        rawDamage: 100,
        damageType: DAMAGE_TYPE.MAGIC,
        armor: 100,
      });
      expect(res.effectiveArmor).toBe(25);
      expect(res.finalDamage).toBe(80);
    });

    it('true damage ignores 100% of armor', () => {
      const res = calculateDamage({
        rawDamage: 100,
        damageType: DAMAGE_TYPE.TRUE,
        armor: 300,
      });
      expect(res.effectiveArmor).toBe(0);
      expect(res.finalDamage).toBe(100);
    });
  });

  describe('Splash Damage Falloff', () => {
    it('deals 100% damage at impact epicenter', () => {
      expect(calculateSplashDamage(100, 0, 80)).toBe(100);
    });

    it('deals 40% damage at outer perimeter', () => {
      expect(calculateSplashDamage(100, 80, 80)).toBe(40);
    });

    it('linearly falls off at midpoint', () => {
      // Falloff = 1 - (40/80)*0.6 = 1 - 0.3 = 0.7 => 70 damage
      expect(calculateSplashDamage(100, 40, 80)).toBe(70);
    });
  });

  describe('Shield Absorption', () => {
    it('absorbs all damage when shield exceeds damage', () => {
      const res = calculateDamage({
        rawDamage: 60,
        armor: 0,
        activeShield: 100,
      });
      expect(res.shieldAbsorbed).toBe(60);
      expect(res.remainingShield).toBe(40);
      expect(res.damageDealtToHealth).toBe(0);
    });

    it('depletes shield and passes remaining damage to health', () => {
      const res = calculateDamage({
        rawDamage: 80,
        armor: 0,
        activeShield: 30,
      });
      expect(res.shieldAbsorbed).toBe(30);
      expect(res.remainingShield).toBe(0);
      expect(res.damageDealtToHealth).toBe(50);
    });
  });
});
