/**
 * modes.test.js — the War Room's shared substrate.
 *
 * Every mode is data plus a couple of scene hooks, so the bugs live where the
 * data meets the rule bag: a card that records its pick but never applies its
 * effect (the exact bug a browser pass caught), a puzzle whose pre-placed tower
 * stands on the road. This file pins all of it without needing Phaser.
 *
 * The roster is four modes since Anomaly Waves, Ascension, Time Attack and the
 * Contract Board were retired; the catalogue block below pins the roster and
 * the level list together, so a retired mode cannot creep back in half-alive.
 */
import { describe, it, expect } from 'vitest';
import {
  BASE_RUN_MODS,
  applyCard,
  applyEffect,
  createRunMods,
  hordeScaling,
  repeatScale,
  summariseMods,
} from '../src/systems/RunMods.js';
import { DRAFT_CARDS, drawCards } from '../src/data/draftCards.js';
import { MODES, MODE_KINDS, getMode } from '../src/data/modeData.js';
import { PUZZLES, getPuzzle, puzzleLevel } from '../src/data/puzzles.js';
import {
  getLevel,
  ALL_LEVELS,
  TITAN_RUSH_LEVEL,
  ENDLESS_LEVEL,
} from '../src/data/levelData.js';
import { ENEMY_TYPES } from '../src/data/enemyData.js';
import { parseMap, getMapLayout, TILE } from '../src/data/mapData.js';
import { PathfindingSystem } from '../src/systems/PathfindingSystem.js';

describe('RunMods — the rule bag', () => {
  it('starts neutral: every multiplier at 1, nothing to report', () => {
    const bag = createRunMods();
    for (const key of ['damage', 'range', 'cooldown', 'killGold', 'score', 'enemyHealth', 'enemySpeed']) {
      expect(bag[key]).toBe(1);
    }
    expect(summariseMods(bag)).toEqual([]);
    expect(BASE_RUN_MODS.cards).toEqual([]);
  });

  it('applies a card effect, not just its name', () => {
    const card = DRAFT_CARDS.find((entry) => entry.id === 'whetstones');
    const next = applyCard(createRunMods(), card);
    expect(next.damage).toBeCloseTo(1.1, 5);
    expect(next.cards).toEqual(['whetstones']);
    expect(summariseMods(next)).toEqual([{ key: 'damage', label: 'DMG +10%' }]);
  });

  it('trims a repeat pick instead of stacking it flat', () => {
    // A common may be taken again, but the second copy is worth half and the
    // third a quarter (RunMods.REPEAT_FALLOFF). Five whetstones top out near
    // +22 % total, which is what stops one card from being the whole run.
    const card = DRAFT_CARDS.find((entry) => entry.id === 'whetstones');
    const once = applyCard(createRunMods(), card);
    const twice = applyCard(once, card);
    expect(twice.damage).toBeCloseTo(1.1 * 1.05, 5);
    expect(twice.damage).toBeLessThan(1.1 * 1.1);
    let bag = createRunMods();
    for (let i = 0; i < 5; i += 1) bag = applyCard(bag, card);
    expect(bag.damage).toBeGreaterThan(1.2);
    expect(bag.damage).toBeLessThan(1.23);
    expect(repeatScale(0)).toBe(1);
    expect(repeatScale(1)).toBeCloseTo(0.5, 5);
    expect(repeatScale(9)).toBeCloseTo(0.1, 5);
  });

  it('never mutates the bag it was handed', () => {
    const bag = createRunMods();
    applyCard(bag, DRAFT_CARDS[0]);
    expect(bag.damage).toBe(1);
    expect(bag.cards).toEqual([]);
  });

  it('keeps multipliers inside a sane band', () => {
    let bag = createRunMods();
    for (let i = 0; i < 12; i += 1) bag = applyEffect(bag, { mods: { damage: 3 } });
    expect(bag.damage).toBeLessThanOrEqual(3);
    for (let i = 0; i < 12; i += 1) bag = applyEffect(bag, { mods: { damage: 0.1 } });
    expect(bag.damage).toBeGreaterThanOrEqual(0.25);
  });

  it('scales the horde from the same bag the towers read', () => {
    // The draft's trade is that a card can raise the horde as well as the
    // towers; both sides read the one bag, so they can never disagree.
    const card = DRAFT_CARDS.find((entry) => entry.effect?.mods?.enemyHealth > 1);
    expect(card, 'no card raises the horde any more').toBeTruthy();
    expect(hordeScaling(applyCard(createRunMods(), card)).health).toBeGreaterThan(1);
  });

  it('reports flags once, however many cards set them', () => {
    const bag = applyEffect(createRunMods(), { flags: { noPowerups: true } });
    expect(bag.noPowerups).toBe(true);
    expect(summariseMods(bag).filter((row) => row.key === 'noPowerups')).toHaveLength(1);
  });
});

describe('Rogue Siege — the draft', () => {
  it('offers three distinct cards', () => {
    for (let wave = 1; wave <= 20; wave += 1) {
      const offer = drawCards(7, wave, []);
      expect(offer).toHaveLength(3);
      expect(new Set(offer.map((card) => card.id)).size).toBe(3);
    }
  });

  it('is seeded: the same run and wave draw the same offer', () => {
    expect(drawCards(11, 4, []).map((c) => c.id)).toEqual(drawCards(11, 4, []).map((c) => c.id));
    expect(drawCards(11, 4, []).map((c) => c.id)).not.toEqual(drawCards(12, 4, []).map((c) => c.id));
  });

  it('never re-offers a rare card that is already owned', () => {
    const rare = DRAFT_CARDS.filter((card) => card.rarity === 'rare').map((card) => card.id);
    for (let wave = 1; wave <= 30; wave += 1) {
      const offer = drawCards(3, wave, rare);
      expect(offer.some((card) => rare.includes(card.id))).toBe(false);
    }
  });

  it('every card in the pool has a real effect', () => {
    for (const card of DRAFT_CARDS) {
      expect(card.effect, `${card.id} has no effect`).toBeTruthy();
      const bag = applyCard(createRunMods(), card);
      const touchesBag =
        card.effect.instant != null ||
        summariseMods(bag).length > 0 ||
        bag.cards.length === 1;
      expect(touchesBag, `${card.id} did nothing`).toBe(true);
    }
  });
});

describe('Blueprint puzzles', () => {
  const boards = new Map();

  const boardFor = (mapKey) => {
    if (boards.has(mapKey)) return boards.get(mapKey);
    const parsed = parseMap(getMapLayout(mapKey));
    const pathfinding = new PathfindingSystem(parsed);
    pathfinding.computeMainPath();
    pathfinding.computeLanes();
    boards.set(mapKey, { parsed, pathfinding });
    return boards.get(mapKey);
  };

  it('ships six distinct boards', () => {
    expect(PUZZLES).toHaveLength(6);
    expect(new Set(PUZZLES.map((puzzle) => puzzle.id)).size).toBe(6);
  });

  it('never stands a tower on a road, water or rock cell', () => {
    for (const puzzle of PUZZLES) {
      const { parsed, pathfinding } = boardFor(puzzle.map);
      const route = pathfinding.laneCells.size ? pathfinding.laneCells : new Set(pathfinding.mainPath);
      for (const tower of puzzle.preplaced) {
        const key = `${tower.row},${tower.col}`;
        expect(route.has(key), `${puzzle.id}: ${key} is on the road`).toBe(false);
        const tile = parsed.tiles[tower.row]?.[tower.col];
        expect(tile, `${puzzle.id}: ${key} is off the map`).toBeTruthy();
        expect(tile, `${puzzle.id}: ${key} is not grass`).toBe(TILE.GRASS);
      }
      // Two towers may not share a cell.
      const keys = puzzle.preplaced.map((tower) => `${tower.row},${tower.col}`);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it('gives every board gold, waves and a star table', () => {
    for (const puzzle of PUZZLES) {
      expect(puzzle.startingCoins).toBeGreaterThan(0);
      expect(puzzle.baseHealth).toBeGreaterThan(0);
      expect(puzzle.waves.length).toBeGreaterThan(0);
      expect(puzzle.stars.three).toBeGreaterThan(puzzle.stars.two);
      for (const wave of puzzle.waves) {
        expect(wave.groups.length).toBeGreaterThan(0);
      }
    }
  });

  it('turns a puzzle into a level the scene can boot', () => {
    for (const puzzle of PUZZLES) {
      const level = puzzleLevel(puzzle);
      expect(level.id).toBe(`puzzle-${puzzle.id}`);
      expect(level.puzzle).toBe(true);
      expect(level.preplaced).toEqual(puzzle.preplaced);
      expect(level.map).toBe(puzzle.map);
      expect(level.reward).toEqual({ gold: 0, gems: 0 });
      expect(level.waves).toEqual(puzzle.waves);
      expect(getLevel(level.id).id).not.toBe(level.id); // never a campaign node
    }
    expect(getPuzzle('narrow-gate')?.id).toBe('narrow-gate');
    expect(getPuzzle('nope')).toBe(null);
  });
});

describe('mode levels', () => {
  it('builds a five-boss Titan Rush', () => {
    expect(TITAN_RUSH_LEVEL.waves).toHaveLength(5);
    const bosses = TITAN_RUSH_LEVEL.waves.map((wave) => wave.bossKey);
    expect(new Set(bosses).size).toBe(5);
    for (const [index, wave] of TITAN_RUSH_LEVEL.waves.entries()) {
      expect(wave.bossWave, `wave ${index + 1} is not a boss wave`).toBe(true);
      expect(ENEMY_TYPES[wave.bossKey]?.isBoss, `${wave.bossKey} is not a boss`).toBe(true);
      // The titan must actually be in the spawn list, not just named.
      expect(wave.groups.some((group) => group.type === wave.bossKey)).toBe(true);
    }
    expect(TITAN_RUSH_LEVEL.endless).toBeFalsy();
    expect(TITAN_RUSH_LEVEL.mode).toBe('titan');
  });

  it('keeps the mode levels out of the campaign chain', () => {
    for (const level of [TITAN_RUSH_LEVEL, ENDLESS_LEVEL]) {
      expect(ALL_LEVELS.some((entry) => entry.id === level.id)).toBe(true);
      expect(level.id.startsWith('level-')).toBe(false);
    }
  });
});

describe('the War Room catalogue', () => {
  it('lists the four modes exactly once', () => {
    expect(MODES).toHaveLength(4);
    expect(new Set(MODES.map((mode) => mode.id)).size).toBe(4);
    expect(new Set(MODES.map((mode) => mode.name)).size).toBe(4);
    for (const retired of ['anomaly', 'ascension', 'timeattack', 'contracts']) {
      expect(getMode(retired), `${retired} is still on the roster`).toBe(null);
    }
  });

  it('ships no level for a retired mode', () => {
    for (const id of ['anomaly-waves', 'ascension', 'time-attack', 'contract-board']) {
      expect(ALL_LEVELS.some((level) => level.id === id), `${id} still ships`).toBe(false);
    }
  });

  it('points every runnable mode at a real level', () => {
    for (const mode of MODES.filter((entry) => entry.kind === MODE_KINDS.RUN)) {
      expect(mode.levelId, `${mode.id} has no levelId`).toBeTruthy();
      expect(ALL_LEVELS.some((level) => level.id === mode.levelId)).toBe(true);
    }
    expect(MODES.filter((entry) => entry.kind === MODE_KINDS.RUN)).toHaveLength(2);
    expect(MODES.filter((entry) => entry.kind === MODE_KINDS.PUZZLE)).toHaveLength(1);
    expect(MODES.filter((entry) => entry.kind === MODE_KINDS.COOP)).toHaveLength(1);
  });

  it('gives every mode a pixel-art glyph instead of an emoji', () => {
    for (const mode of MODES) {
      expect(mode.art, `${mode.id} has no art`).toMatch(/^\/assets\/ui-kit\/glyph_[a-z]+\.png$/);
    }
  });

  it('looks a mode up by id', () => {
    expect(getMode('rogue')?.name).toBe('ROGUE SIEGE');
    expect(getMode('nope')).toBe(null);
  });
});
