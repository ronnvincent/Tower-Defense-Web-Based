// @vitest-environment jsdom
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { WaveManager, WAVE_STATE } from '../src/systems/WaveManager.js';
import { LEVELS, getLevel, getNextLevel } from '../src/data/levelData.js';
import { ENEMY_TYPES } from '../src/data/enemyData.js';
import { countWaveEnemies } from '../src/data/waveData.js';
import { ProgressStore, STAR_MAX } from '../src/systems/Progression.js';

/**
 * Request 39 — the campaign as a whole.
 *
 * `campaign-levels` proves each node is wired to a real board; `wave-flow` walks
 * one authored wave list; `progression` proves a single clear. What was missing
 * is the *chain*: every shipped level walked end to end through the real wave
 * queue, the five-level unlock sequence, and the fact that a restart starts with
 * a fresh battle frame instead of inheriting the previous one.
 */

const STEP = 50;

function memoryStorage() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
  };
}

/** Walk one level's whole wave list, "killing" everything instantly. */
function walkLevel(level) {
  const spawned = [];
  const events = [];
  const manager = new WaveManager(level.waves, {
    onSpawn: (type, waveNumber) => spawned.push({ type, waveNumber }),
  });

  let doubleStartRefused = true;
  for (let index = 0; index < level.waves.length; index += 1) {
    expect(manager.canStartNextWave()).toBe(true);
    expect(manager.startNextWave()).toBe(true);
    // A second tap in the same frame must not open a second wave.
    if (manager.startNextWave() !== false) doubleStartRefused = false;

    let event = null;
    let frames = 0;
    while (!event) {
      event = manager.update(STEP, 0);
      frames += 1;
      if (frames > 20000) throw new Error(`${level.id} wave ${index + 1} never completed`);
    }
    events.push(event);
  }

  return { manager, spawned, events, doubleStartRefused };
}

describe('every shipped level plays its whole wave list', () => {
  it('walks all five campaign levels without a duplicate or dropped wave', () => {
    for (const level of LEVELS) {
      const { manager, spawned, events, doubleStartRefused } = walkLevel(level);

      // Nothing dropped, nothing spawned twice, nothing out of order.
      expect(spawned).toHaveLength(countWaveEnemies({ groups: level.waves.flatMap((w) => w.groups) }));
      expect(events).toHaveLength(level.waves.length);
      expect(events.map((e) => e.waveNumber)).toEqual(level.waves.map((_, i) => i + 1));
      expect(events.filter((e) => e.isFinal)).toHaveLength(1);
      expect(events[events.length - 1].isFinal).toBe(true);
      expect(doubleStartRefused).toBe(true);

      // The queue is empty and the manager refuses to start anything else.
      expect(manager.pendingSpawns()).toBe(0);
      expect(manager.state).toBe(WAVE_STATE.FINISHED);
      expect(manager.canStartNextWave()).toBe(false);
      expect(manager.wavesCompleted).toBe(level.waves.length);
    }
  });

  it('fields each stage boss last, exactly once, in the closing wave', () => {
    for (const level of LEVELS) {
      const { spawned } = walkLevel(level);
      const bossKey = level.boss;
      expect(ENEMY_TYPES[bossKey]?.isBoss || ENEMY_TYPES[bossKey]?.boss).toBe(true);

      const bossSpawns = spawned.filter((s) => s.type === bossKey);
      expect(bossSpawns).toHaveLength(1);
      // The boss belongs to the closing wave. Its escorts may spawn after it
      // (level 1 closes with the warlord followed by eight runners), so the
      // contract is "once, in the last wave", not "last in the queue".
      expect(bossSpawns[0].waveNumber).toBe(level.waves.length);
    }
  });

  it('never spawns an unknown creature', () => {
    for (const level of LEVELS) {
      const { spawned } = walkLevel(level);
      for (const entry of spawned) expect(ENEMY_TYPES[entry.type]).toBeTruthy();
    }
  });
});

describe('campaign progression, five clears deep', () => {
  it('opens one road at a time and finishes with the campaign complete', () => {
    const store = new ProgressStore({ storage: memoryStorage() });
    expect(store.isUnlocked('level-1')).toBe(true);
    for (const level of LEVELS.slice(1)) expect(store.isUnlocked(level.id)).toBe(false);

    let gold = 0;
    let gems = 0;

    LEVELS.forEach((level, index) => {
      const result = store.recordVictory(level, {
        baseHealth: level.baseHealth,
        maxBaseHealth: level.baseHealth,
        score: 1000 + index,
      });

      expect(result.firstClear).toBe(true);
      expect(result.stars).toBe(STAR_MAX);
      expect(store.starsFor(level.id)).toBe(STAR_MAX);

      // First clear pays the printed bounty plus one gem for three stars.
      expect(result.rewards.gold).toBe(level.reward.gold);
      expect(result.rewards.gems).toBe(level.reward.gems + 1);
      gold += result.rewards.gold;
      // Achievements pay their own gems on top of the bounty, so the running
      // total is the bounty plus whatever the clear banked for medals.
      gems += result.rewards.gems + (result.gemsFromAchievements || 0);
      expect(store.gold).toBe(gold);
      expect(store.gems).toBe(gems);

      const next = getNextLevel(level.id);
      if (next) {
        expect(store.isUnlocked(next.id)).toBe(true);
        expect(result.unlockedAll).toContain(next.id);
      } else {
        expect(result.unlockedAll).toEqual([]);
        expect(store.profile.campaignComplete).toBe(true);
      }
    });

    expect(store.totalStars).toBe(LEVELS.length * STAR_MAX);

    // Replaying the last stage pays the stipend, adds no gems and changes nothing else.
    const last = LEVELS[LEVELS.length - 1];
    const goldBefore = store.gold;
    const gemsBefore = store.gems;
    const replay = store.recordVictory(last, {
      baseHealth: last.baseHealth,
      maxBaseHealth: last.baseHealth,
      score: 10,
    });
    expect(replay.firstClear).toBe(false);
    expect(replay.unlockedAll).toEqual([]);
    expect(store.gold).toBe(goldBefore + Math.round(last.reward.gold * 0.2));
    expect(store.gems).toBe(gemsBefore);
    expect(store.bestScoreFor(last.id)).toBe(1000 + LEVELS.length - 1);
  });

  it('keeps a locked stage locked after an unrelated clear', () => {
    const store = new ProgressStore({ storage: memoryStorage() });
    store.recordVictory(getLevel('level-1'), { baseHealth: 20, maxBaseHealth: 20, score: 100 });
    expect(store.isUnlocked('level-2')).toBe(true);
    expect(store.isUnlocked('level-3')).toBe(false);
    expect(store.isUnlocked('level-4')).toBe(false);
    expect(store.isUnlocked('level-5')).toBe(false);
  });
});

describe('a restart starts a fresh battle', () => {
  let GameScene;
  beforeAll(async () => {
    vi.stubGlobal(
      'Phaser',
      new Proxy(
        { Scene: class Scene { constructor(config) { this.sys = { settings: config }; } } },
        { get: (target, key) => (key in target ? target[key] : { Scene: target.Scene }[key]) }
      )
    );
    ({ GameScene } = await import('../src/scenes/GameScene.js'));
  });

  it('clears the per-battle fields when the same scene is initialised again', () => {
    const scene = {};
    GameScene.prototype.init.call(scene, { levelId: 'level-3' });
    scene.battleFrame = { top: 120, height: 300 };
    scene.battleFrameLocked = true;
    scene.lastOffer = ['some-card'];

    GameScene.prototype.init.call(scene, { levelId: 'level-1' });

    expect(scene.levelId).toBe('level-1');
    expect(scene.level.id).toBe('level-1');
    // The frame is measured again for the new stage, never inherited.
    expect(scene.battleFrame).toBeNull();
    expect(scene.battleFrameLocked).toBe(false);
    expect(scene.lastOffer).toEqual([]);
    // Mode flags belong to the launch, not to the previous battle.
    expect(scene.mode).toMatchObject({ rogue: false, puzzle: false });
    expect(scene.pvp).toBeNull();
  });
});
