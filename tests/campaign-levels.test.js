// @vitest-environment jsdom
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { parseMap, getMapLayout, TILE } from '../src/data/mapData.js';
import { PathfindingSystem } from '../src/systems/PathfindingSystem.js';
import { ENEMY_TYPES } from '../src/data/enemyData.js';
import {
  LEVELS,
  ENDLESS_LEVEL,
  ALL_LEVELS,
  TITAN_RUSH_LEVEL,
  TIME_ATTACK_LEVEL,
  THEMES,
  getLevel,
  makeEndlessWave,
} from '../src/data/levelData.js';

/**
 * GameScene derives the whole battle from `init({ levelId })`: map, theme,
 * economy seed and wave list. `init()` never touches Phaser, so it can be run
 * against a bare object — the cheapest way to prove every campaign node is
 * wired to a real, pathable battlefield before a player clicks it.
 */

/**
 * GameScene extends Phaser.Scene, so the engine needs to exist before the
 * module is evaluated. Only the class shell is needed: init() is pure JS.
 */
let GameScene;
beforeAll(async () => {
  vi.stubGlobal(
    'Phaser',
    new Proxy(
      { Scene: class Scene { constructor(config) { this.sys = { settings: config }; } } },
      {
        get(target, key) {
          if (key in target) return target[key];
          return { Scene: target.Scene }[key];
        },
      }
    )
  );
  ({ GameScene } = await import('../src/scenes/GameScene.js'));
});

function initOf(levelId) {
  const scene = {};
  GameScene.prototype.init.call(scene, { levelId });
  return scene;
}

function mapOf(levelId) {
  return parseMap(getMapLayout(getLevel(levelId).map));
}

describe('campaign level wiring', () => {
  it('derives the level, theme and progress store from the node id', () => {
    for (const level of ALL_LEVELS) {
      const scene = initOf(level.id);
      expect(scene.levelId).toBe(level.id);
      expect(scene.level).toBe(level);
      expect(scene.theme).toBe(THEMES[level.theme]);
      expect(scene.progress).toBeTruthy();
    }
  });

  it('falls back to level 1 for a missing or unknown id', () => {
    expect(initOf(undefined).levelId).toBe('level-1');
    expect(initOf('level-9').levelId).toBe('level-1');
    expect(initOf('level-9').level).toBe(getLevel('level-1'));
  });

  it('gives every level three portals, one base and a road from each portal', () => {
    for (const level of ALL_LEVELS) {
      const map = mapOf(level.id);
      const cells = map.tiles.flat();
      // A base-defence stage attacks from three directions: three portals, one
      // bastion, and two sky gates the flyers come in through.
      expect(cells.filter((t) => t === TILE.SPAWN).length, `${level.id} spawns`).toBe(3);
      expect(cells.filter((t) => t === TILE.BASE).length, `${level.id} base`).toBe(1);
      expect(cells.filter((t) => t === TILE.AIR).length, `${level.id} sky gates`).toBe(2);

      const pathfinding = new PathfindingSystem(map);
      const lanes = pathfinding.computeLanes();
      expect(lanes.length, `${level.id} has ${lanes.length} lanes`).toBe(3);
      for (const lane of lanes) {
        expect(lane.length, `${level.id} has a stub lane`).toBeGreaterThan(6);
        expect(lane[lane.length - 1]).toBe(`${map.base.row},${map.base.col}`);
      }
      expect(pathfinding.routeLength).toBe(pathfinding.mainPath.length);
    }
  });

  it('keeps the five battlefields distinct (biome + layout)', () => {
    // Endless Siege reuses the grassland layout but repaints it volcanic, so
    // the pair — not the layout alone — is the identity of a battlefield.
    const shapes = LEVELS.concat(ENDLESS_LEVEL).map(
      (level) => `${level.theme}:${mapOf(level.id).tiles.flat().join('')}`
    );
    expect(new Set(shapes).size).toBe(shapes.length);
  });
});

describe('campaign wave design', () => {
  it('closes every level with its own boss wave', () => {
    const bosses = [];
    for (const level of LEVELS) {
      const final = level.waves[level.waves.length - 1];
      expect(final.bossWave, `${level.id} final wave is not a boss wave`).toBe(true);
      expect(final.bossKey, `${level.id} final wave has no boss`).toBeTruthy();
      expect(ENEMY_TYPES[final.bossKey].isBoss, `${final.bossKey} is not flagged as a boss`).toBe(true);
      bosses.push(final.bossKey);
    }
    expect(new Set(bosses).size).toBe(LEVELS.length); // one unique boss per stage
  });

  it('also gives each level a mid-boss so the climb has two peaks', () => {
    for (const level of LEVELS) {
      const mid = level.waves.filter((wave) => wave.bossWave && wave !== level.waves[level.waves.length - 1]);
      expect(mid.length, `${level.id} has no mid-boss wave`).toBe(1);
    }
  });

  it('never spawns an empty wave and grows the wave count per stage', () => {
    LEVELS.forEach((level, index) => {
      for (const wave of level.waves) {
        const count = (wave.groups || []).reduce((sum, group) => sum + group.count, 0);
        expect(count, `${level.id} "${wave.name}" spawns nothing`).toBeGreaterThan(0);
        for (const group of wave.groups) expect(ENEMY_TYPES[group.type], group.type).toBeTruthy();
        if (wave.bossWave) expect(wave.bossKey).toBeTruthy();
      }
      // Pacing, not a monotonic ladder: the opening stage is long on purpose
      // (eight waves teach build order), stage 2 leans on speed instead of
      // volume, and the last two stages are the longest runs in the campaign.
      if (index > 0) expect(level.waves.length).toBeGreaterThanOrEqual(7);
      if (level.id === 'level-5') {
        expect(level.waves.length).toBe(Math.max(...LEVELS.map((entry) => entry.waves.length)));
      }
    });
  });

  it('keeps the opening stage on the campaign contract: eight waves, 300 gold, 20 HP', () => {
    expect(LEVELS[0].waves).toHaveLength(8);
    expect(LEVELS[0].startingCoins).toBe(300);
    expect(LEVELS[0].baseHealth).toBe(20);
  });

  it('gives every endless wave something to fight and a boss every fifth wave', () => {
    for (let n = 1; n <= 20; n += 1) {
      const wave = makeEndlessWave(n);
      expect(wave.name).toBeTruthy();
      expect(wave.groups.length).toBeGreaterThan(0);
      expect(wave.groups.every((group) => group.count > 0 && ENEMY_TYPES[group.type])).toBe(true);
      expect(Boolean(wave.bossWave)).toBe(n % 5 === 0);
    }
  });

  it('funds every level well enough to place a first tower', () => {
    for (const level of LEVELS) {
      expect(level.startingCoins).toBeGreaterThanOrEqual(200);
      // Stage 1 is the tutorial core (20 HP); every later stage is 25.
      expect(level.baseHealth).toBe(level.id === 'level-1' ? 20 : 25);
      expect(level.enemyHealthScale).toBeGreaterThanOrEqual(1);
    }
    // Mode levels are tuned individually (Titan Rush needs a fatter core than a
    // campaign node), but they all have to be survivable and affordable.
    for (const level of [ENDLESS_LEVEL, TITAN_RUSH_LEVEL, TIME_ATTACK_LEVEL]) {
      expect(level.startingCoins).toBeGreaterThanOrEqual(200);
      expect(level.baseHealth).toBeGreaterThanOrEqual(25);
      expect(level.enemyHealthScale).toBeGreaterThan(0);
    }
  });
});
