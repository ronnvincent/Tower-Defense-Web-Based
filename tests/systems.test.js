import { describe, it, expect } from 'vitest';
import { EconomyManager } from '../src/systems/EconomyManager.js';
import { GameStateManager, STATUS } from '../src/systems/GameStateManager.js';
import { WaveManager, WAVE_STATE } from '../src/systems/WaveManager.js';
import { PlacementSystem } from '../src/systems/PlacementSystem.js';
import { parseMap } from '../src/data/mapData.js';
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
    expect(event).toEqual({ type: 'waveComplete', waveNumber: 1, isFinal: false });
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
    expect(wm.update(16, 0)).toEqual({ type: 'waveComplete', waveNumber: 1, isFinal: true });
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
  const map = parseMap();
  it('accepts a tower on free grass with enough coins', () => {
    const ps = new PlacementSystem(map);
    expect(ps.validate(TOWER_TYPES.archer, 3, 5, 100)).toEqual({ ok: true, reason: null });
  });
  it('rejects towers on road, rocks, water, occupied tiles and with too few coins', () => {
    const ps = new PlacementSystem(map);
    expect(ps.validate(TOWER_TYPES.archer, 5, 5, 999).reason).toBe('road-tile');
    expect(ps.validate(TOWER_TYPES.archer, 0, 0, 999).reason).toBe('blocked-tile');
    expect(ps.validate(TOWER_TYPES.archer, 0, 3, 999).reason).toBe('blocked-tile');
    expect(ps.validate(TOWER_TYPES.archer, -1, 3, 999).reason).toBe('out-of-bounds');
    ps.occupy(3, 5, { id: 1 });
    expect(ps.validate(TOWER_TYPES.archer, 3, 5, 999).reason).toBe('occupied');
    expect(ps.validate(TOWER_TYPES.cannon, 3, 6, 50).reason).toBe('no-coins');
  });
  it('barricades must go on road tiles, never on spawn or base', () => {
    const ps = new PlacementSystem(map);
    expect(ps.validate(BARRICADE, 5, 5, 999).ok).toBe(true);
    expect(ps.validate(BARRICADE, 3, 5, 999).reason).toBe('needs-road');
    expect(ps.validate(BARRICADE, 5, 0, 999).reason).toBe('endpoint');
    expect(ps.validate(BARRICADE, 5, 19, 999).reason).toBe('endpoint');
  });
  it('refuses palisades on decoy lanes the horde never walks', () => {
    const ps = new PlacementSystem(map);
    const pf = new PathfindingSystem(map);
    const route = new Set(pf.computeMainPath().path);
    // Row 1 is a real road, but BFS marches the middle lane on row 5.
    expect(ps.validate(BARRICADE, 1, 5, 999, { route }).reason).toBe('off-route');
    expect(ps.validate(BARRICADE, 5, 5, 999, { route }).ok).toBe(true);
    // Every cell of the actual route stays buildable, so a wall can always be
    // planted where the monsters are guaranteed to meet it.
    for (const key of route) {
      const [row, col] = key.split(',').map(Number);
      if (map.tiles[row][col] !== 'road') continue;
      expect(ps.validate(BARRICADE, row, col, 999, { route }).ok).toBe(true);
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
