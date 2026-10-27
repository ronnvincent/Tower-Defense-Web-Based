import { describe, it, expect } from 'vitest';
import { EconomyManager } from '../src/systems/EconomyManager.js';
import { GameStateManager, STATUS } from '../src/systems/GameStateManager.js';
import { WaveManager, WAVE_STATE } from '../src/systems/WaveManager.js';
import { PlacementSystem } from '../src/systems/PlacementSystem.js';
import { parseMap } from '../src/data/mapData.js';
import { zoneBlock } from '../src/systems/BuildZone.js';
import { PathfindingSystem } from '../src/systems/PathfindingSystem.js';
import { WAVES, countWaveEnemies } from '../src/data/waveData.js';
import { TOWER_TYPES, BARRICADE } from '../src/data/towerData.js';
import { compactInPlace, swapRemove } from '../src/utils/arrayUtils.js';

describe('EconomyManager', () => {
  it('never lets coins go negative', () => {
    const eco = new EconomyManager(50);
    expect(eco.spend(60)).toBe(false);
    expect(eco.coins).toBe(50);
    expect(eco.spend(50)).toBe(true);
    expect(eco.coins).toBe(0);
    expect(eco.spend(1)).toBe(false);
  });
  it('ignores invalid amounts', () => {
    const eco = new EconomyManager(10);
    eco.earn(-5);
    eco.earn(NaN);
    expect(eco.spend(-5)).toBe(false);
    expect(eco.coins).toBe(10);
  });
});

describe('GameStateManager', () => {
  it('cannot be both game over and victory', () => {
    const gs = new GameStateManager(10);
    expect(gs.end(STATUS.GAME_OVER)).toBe(true);
    expect(gs.end(STATUS.VICTORY)).toBe(false);
    expect(gs.status).toBe(STATUS.GAME_OVER);
  });
  it('base health never drops below zero and reports destruction once', () => {
    const gs = new GameStateManager(3);
    expect(gs.damageBase(2)).toBe(false);
    expect(gs.damageBase(5)).toBe(true);
    expect(gs.baseHealth).toBe(0);
  });
  it('clock only advances while playing', () => {
    const gs = new GameStateManager(3);
    gs.tick(100);
    gs.pause();
    gs.tick(1000);
    gs.resume();
    gs.tick(50);
    expect(gs.elapsedMs).toBe(150);
  });
});

describe('WaveManager', () => {
  it('spawns every enemy of a wave in FIFO order and then completes', () => {
    const spawned = [];
    const wm = new WaveManager(WAVES, { onSpawn: (type) => spawned.push(type) });
    expect(wm.startNextWave()).toBe(true);
    expect(wm.pendingSpawns()).toBe(countWaveEnemies(WAVES[0]));
    // simulate 60 seconds in 16 ms frames with no enemies alive
    let event = null;
    for (let t = 0; t < 60000 && !event; t += 16) event = wm.update(16, 0);
    expect(spawned.length).toBe(countWaveEnemies(WAVES[0]));
    expect(event).toEqual({
      type: 'waveComplete',
      waveNumber: 1,
      isFinal: false,
      bounty: false,
      bountyGold: 0,
      bountyScore: 0,
    });
    expect(wm.state).toBe(WAVE_STATE.IDLE);
  });

  it('does not start a wave twice (duplicate trigger protection)', () => {
    const wm = new WaveManager(WAVES, { onSpawn: () => {} });
    expect(wm.startNextWave()).toBe(true);
    expect(wm.startNextWave()).toBe(false);
    expect(wm.waveNumber).toBe(1);
  });

  it('does not complete a wave while enemies are alive', () => {
    const wm = new WaveManager([{ groups: [{ type: 'grunt', count: 1, interval: 0 }] }], { onSpawn: () => {} });
    wm.startNextWave();
    wm.update(16, 0); // spawns the only enemy
    expect(wm.update(16, 1)).toBeNull();
    expect(wm.state).toBe(WAVE_STATE.CLEARING);
    expect(wm.update(16, 0)).toEqual({
      type: 'waveComplete',
      waveNumber: 1,
      isFinal: true,
      bounty: false,
      bountyGold: 0,
      bountyScore: 0,
    });
    expect(wm.state).toBe(WAVE_STATE.FINISHED);
    expect(wm.startNextWave()).toBe(false);
  });

  it('a long frame releases several due spawns', () => {
    let count = 0;
    const wm = new WaveManager([{ groups: [{ type: 'grunt', count: 5, interval: 100 }] }], { onSpawn: () => count++ });
    wm.startNextWave();
    wm.update(250, 0);
    expect(count).toBe(3); // t=0, 100, 200
  });
});

describe('PlacementSystem', () => {
  // The field grammar (src/data/arenaLayout.js): 32 columns, three portals on
  // row 1, the bastion on the bottom-centre column of row 10, and a free-build
  // field of five rows around it.
  const map = parseMap();
  const pf = new PathfindingSystem(map);
  pf.computeMainPath();
  pf.computeLanes();
  const route = new Set(pf.mainPath);
  // A grass cell on our side of the river that no lane uses.
  const freeGrass = (() => {
    for (let row = map.buildRow; row < map.base.row; row += 1) {
      for (let col = 1; col < map.cols - 1; col += 1) {
        const cell = { row, col };
        if (map.tiles[row][col] === 'grass' && zoneBlock(cell, map) === null) return cell;
      }
    }
    throw new Error('no free grass on the player half');
  })();
  const laneCell = (() => {
    for (const key of route) {
      const [row, col] = key.split(',').map(Number);
      const inField = row >= map.buildRow && row <= map.base.row;
      if (map.tiles[row][col] === 'road' && inField) return { row, col };
    }
    throw new Error('no road cell inside the build field');
  })();

  it('accepts a tower on free grass with enough coins', () => {
    const ps = new PlacementSystem(map);
    expect(ps.validate(TOWER_TYPES.archer, freeGrass.row, freeGrass.col, 100)).toEqual({
      ok: true,
      reason: null,
    });
  });

  it('refuses a tower standing on the road — the lane stays clear', () => {
    const ps = new PlacementSystem(map);
    // The road is the horde's path. A keep may not stand on it, so a wave can
    // never be rerouted by a build (Request 22: no defences on the pathway).
    expect(ps.validate(TOWER_TYPES.archer, laneCell.row, laneCell.col, 999).reason).toBe(
      'road-tile'
    );
  });

  it('refuses a tower anywhere in the enemy half, road or not', () => {
    const ps = new PlacementSystem(map);
    // A grass cell above the build line is the horde's own ground — and it is
    // grass, so the half rule (not the terrain) is what refuses it.
    const enemyGrass = (() => {
      for (let row = 2; row < map.buildRow; row += 1) {
        for (let col = 3; col < map.cols - 3; col += 1) {
          // Away from the portal rings, so the half rule is what refuses it.
          if (map.tiles[row][col] === 'grass' && zoneBlock({ row, col }, map) === 'enemy-half') {
            return { row, col };
          }
        }
      }
      throw new Error('no enemy-half grass');
    })();
    expect(ps.validate(TOWER_TYPES.archer, enemyGrass.row, enemyGrass.col, 999).reason).toBe('enemy-half');
    // Row 0 is the rock rim — terrain is refused before the half rule.
    expect(ps.validate(TOWER_TYPES.archer, 0, 0, 999).reason).toBe('blocked-tile');
  });

  it('rejects rocks, water, the two no-build zones, occupied tiles and low gold', () => {
    const ps = new PlacementSystem(map);
    expect(ps.validate(TOWER_TYPES.archer, 0, 0, 999).reason).toBe('blocked-tile'); // rock rim
    // A pond is scenery the player can see, so it is refused as terrain.
    const pond = [];
    for (let row = 0; row < map.rows && !pond.length; row += 1) {
      const col = map.tiles[row].indexOf('water');
      if (col >= 0) pond.push({ row, col });
    }
    if (pond.length) {
      expect(ps.validate(TOWER_TYPES.archer, pond[0].row, pond[0].col, 999).reason).toBe('blocked-tile');
    }
    expect(ps.validate(TOWER_TYPES.archer, map.spawn.row, map.spawn.col - 1, 999).reason).toBe('spawn-zone'); // beside the portal
    expect(ps.validate(TOWER_TYPES.archer, map.base.row, map.base.col - 1, 999).reason).toBe('base-zone'); // bastion plaza
    expect(ps.validate(TOWER_TYPES.archer, -1, 3, 999).reason).toBe('out-of-bounds');
    ps.occupy(freeGrass.row, freeGrass.col, { id: 1 });
    expect(ps.validate(TOWER_TYPES.archer, freeGrass.row, freeGrass.col, 999).reason).toBe('occupied');
    ps.release(freeGrass.row, freeGrass.col);
    expect(ps.validate(TOWER_TYPES.cannon, freeGrass.row, freeGrass.col, 50).reason).toBe('no-coins');
  });

  it('walls stand on grass or across the lane, but never on a gate', () => {
    const ps = new PlacementSystem(map);
    // Request 42: a wall is a structure, not a road-only prop. Both a lane cell
    // (a deliberate roadblock) and open grass (a perimeter) are legal.
    expect(ps.validate(BARRICADE, laneCell.row, laneCell.col, 999).ok).toBe(true);
    expect(ps.validate(BARRICADE, freeGrass.row, freeGrass.col, 999).ok).toBe(true);
    expect(ps.validate(BARRICADE, map.spawn.row, map.spawn.col, 999).reason).toBe('endpoint');
    expect(ps.validate(BARRICADE, map.base.row, map.base.col, 999).reason).toBe('endpoint');
    // Rock and water are still terrain.
    expect(ps.validate(BARRICADE, 0, 0, 999).reason).toBe('blocked-tile');
    // …and the horde's own ground is still off limits.
    const enemyCell = { row: map.spawn.row + 1, col: 3 };
    expect(ps.validate(BARRICADE, enemyCell.row, enemyCell.col, 999).reason).toBe('spawn-zone');
  });

  it('never charges a wall for standing where a keep could stand', () => {
    // A wall on grass used to be refused as `needs-road`; the free-placement
    // redesign makes it a legal perimeter segment. What must still hold is that
    // the horde's ground and the gate rings refuse it for their own reasons.
    const ps = new PlacementSystem(map);
    const walk = new Set(pf.lanes[0] || pf.mainPath);
    // A cell of a second lane that the first never walks, inside the field (an
    // enemy-ground cell would be refused for that reason first).
    const other =
      pf.lanes
        .slice(1)
        .flat()
        .filter((key) => {
          const [row] = key.split(',').map(Number);
          return !walk.has(key) && row >= map.buildRow && row <= map.base.row;
        }) ?? [];
    expect(other.length).toBeGreaterThan(0);
    // A wall does not care which lane the current wave walks: it is a structure
    // the horde meets or ignores, not a lane-bound consumable.
    const [oRow, oCol] = other[0].split(',').map(Number);
    expect(ps.validate(BARRICADE, oRow, oCol, 999, { route: walk }).ok).toBe(true);
    // Every cell of the actual route stays buildable, so a wall can always be
    // planted where the monsters are guaranteed to meet it.
    for (const key of walk) {
      const [row, col] = key.split(',').map(Number);
      const inField = row >= map.buildRow && row <= map.base.row;
      if (map.tiles[row][col] !== 'road' || !inField) continue;
      // The gate ring stays clear for every defence, wall included.
      if (zoneBlock({ row, col }, map) !== null) continue;
      expect(ps.validate(BARRICADE, row, col, 999, { route: walk }).ok).toBe(true);
    }
  });
});

describe('array helpers', () => {
  it('compactInPlace removes items in one pass and preserves order', () => {
    const arr = [1, 2, 3, 4, 5, 6];
    const removed = [];
    const n = compactInPlace(arr, (x) => x % 2 === 0, (x) => removed.push(x));
    expect(arr).toEqual([2, 4, 6]);
    expect(removed).toEqual([1, 3, 5]);
    expect(n).toBe(3);
  });
  it('swapRemove removes a single item in O(1) after locating it', () => {
    const a = { id: 'a' };
    const b = { id: 'b' };
    const c = { id: 'c' };
    const arr = [a, b, c];
    expect(swapRemove(arr, a)).toBe(true);
    expect(arr).toEqual([c, b]);
    expect(swapRemove(arr, a)).toBe(false);
  });
});
