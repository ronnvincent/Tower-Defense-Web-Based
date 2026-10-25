/**
 * duel-contracts.test.js — the side bets that stop a duel being a pure race.
 *
 * Three contracts per match, drawn from the room seed so **both phones get the
 * same three**, paying score (never gold) so they can decide a points win
 * without ever making one board stronger. Plus the bounty waves they point at.
 */

import { describe, it, expect } from 'vitest';

import {
  CONTRACT_POOL,
  contractsFor,
  contractProgress,
  contractScore,
  normaliseStats,
} from '../src/systems/DuelContracts.js';
import { WaveManager } from '../src/systems/WaveManager.js';
import { PVP_RULES, getPvpLevel, PVP_ARENAS, PVP_MATCH_RULES } from '../src/data/pvpArenas.js';

describe('dealing the contracts', () => {
  it('deals three distinct contracts from the pool', () => {
    const list = contractsFor(7);
    expect(list).toHaveLength(3);
    expect(new Set(list.map((c) => c.id)).size).toBe(3);
    for (const contract of list) {
      expect(CONTRACT_POOL.some((entry) => entry.id === contract.id)).toBe(true);
    }
  });

  it('deals the same hand to both seats', () => {
    // Both devices derive from the room seed, so the same number must produce
    // the same three — in the same order, because the result card lists them.
    expect(contractsFor(42).map((c) => c.id)).toEqual(contractsFor(42).map((c) => c.id));
  });

  it('deals a different hand when the host bumps the seed on rematch', () => {
    const hands = new Set();
    for (let seed = 1; seed <= 12; seed += 1) hands.add(contractsFor(seed).map((c) => c.id).join(','));
    // Not a uniqueness guarantee for every seed, but a rematch must not always
    // replay the same three.
    expect(hands.size).toBeGreaterThan(4);
  });
});

describe('scoring them', () => {
  const contracts = [
    { id: 'a', name: 'A', goal: 'Kill 10', stat: 'kills', target: 10, reward: 100 },
    { id: 'b', name: 'B', goal: 'Clear 2', stat: 'waves', target: 2, reward: 50 },
  ];

  it('counts progress and marks what is done', () => {
    const rows = contractProgress(contracts, { kills: 12, waves: 1 });
    expect(rows[0]).toMatchObject({ id: 'a', current: 12, target: 10, done: true, ratio: 1 });
    expect(rows[1]).toMatchObject({ id: 'b', current: 1, target: 2, done: false, ratio: 0.5 });
  });

  it('pays only the finished ones', () => {
    expect(contractScore(contracts, { kills: 12, waves: 1 })).toEqual({ total: 100, done: ['a'] });
    expect(contractScore(contracts, { kills: 0, waves: 0 })).toEqual({ total: 0, done: [] });
    expect(contractScore(contracts, { kills: 10, waves: 2 })).toEqual({
      total: 150,
      done: ['a', 'b'],
    });
  });

  it('survives a scene that has not counted anything yet', () => {
    expect(normaliseStats({ kills: undefined, waves: NaN, coreHp: '9' })).toEqual({
      kills: 0,
      waves: 0,
      bestChain: 0,
      bounties: 0,
      cleanWaves: 0,
      coreHp: 9,
    });
    expect(contractScore(contracts, {})).toEqual({ total: 0, done: [] });
  });
});

describe('the duel script', () => {
  it('has two bounty waves and the boss closes it', () => {
    const waves = getPvpLevel('cinder-crown').waves;
    expect(waves).toHaveLength(PVP_RULES.waves);
    const bounty = waves.filter((wave) => wave.bounty);
    expect(bounty).toHaveLength(2);
    for (const wave of bounty) {
      expect(wave.bountyGold).toBeGreaterThan(0);
      expect(wave.bountyScore).toBeGreaterThan(0);
      expect(wave.bountyKillGold).toBeGreaterThan(1);
      // A bounty wave is a payday, not a second boss.
      expect(wave.bossWave).toBeFalsy();
    }
    expect(waves.at(-1).bossWave).toBe(true);
  });

  it('gives every arena the same script apart from its own boss', () => {
    // Waves 1-9 are shared so the two seats are always fighting the same horde;
    // the closing wave carries the arena's boss, which is what makes the three
    // boards feel different without making them unfair.
    const scripts = PVP_ARENAS.map((arena) =>
      getPvpLevel(arena.id)
        .waves.slice(0, -1)
        .map((wave) => `${wave.name}:${wave.groups.map((g) => `${g.type}x${g.count}`).join('+')}`)
        .join('|')
    );
    expect(new Set(scripts).size).toBe(1);
    const bosses = PVP_ARENAS.map((arena) => getPvpLevel(arena.id).waves.at(-1).bossKey);
    expect(new Set(bosses).size).toBe(PVP_ARENAS.length);
  });

  it('offers a contract for the bounty waves it just added', () => {
    expect(CONTRACT_POOL.some((contract) => contract.stat === 'bounties')).toBe(true);
  });
});

describe('the wave manager reports the bounty', () => {
  it('carries the payout on the completion event', () => {
    const waves = [
      {
        name: 'Gold Caravan',
        bounty: true,
        bountyGold: 220,
        bountyScore: 300,
        groups: [{ type: 'grunt', count: 1, interval: 100 }],
      },
    ];
    const manager = new WaveManager(waves, { onSpawn: () => {} });
    expect(manager.startNextWave()).toBe(true);
    manager.update(0, 0); // releases the spawn
    const event = manager.update(16, 0); // and clears the wave
    expect(event).toMatchObject({
      type: 'waveComplete',
      waveNumber: 1,
      isFinal: true,
      bounty: true,
      bountyGold: 220,
      bountyScore: 300,
    });
  });

  it('says nothing about bounty on an ordinary wave', () => {
    const manager = new WaveManager(
      [{ name: 'Line', groups: [{ type: 'grunt', count: 1, interval: 100 }] }],
      { onSpawn: () => {} }
    );
    manager.startNextWave();
    manager.update(0, 0);
    const event = manager.update(16, 0);
    expect(event.bounty).toBe(false);
    expect(event.bountyGold).toBe(0);
  });
});

describe('the duel rule flags', () => {
  it('turns powerups, blessings and relics off for every arena', () => {
    expect(PVP_MATCH_RULES).toMatchObject({ powerups: false, blessings: false, relics: false });
    for (const arena of PVP_ARENAS) {
      expect(getPvpLevel(arena.id).rules).toBe(PVP_MATCH_RULES);
    }
  });
});
