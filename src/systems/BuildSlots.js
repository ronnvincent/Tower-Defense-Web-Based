/**
 * BuildSlots — the marked pads a keep may be raised on.
 *
 * A bastion is defended from fixed ground: the wall-walks either side of the
 * approach, not every square metre of grass. This module turns a battlefield
 * into that finite, legible set of pads, and it does it **deterministically**:
 * the same map and the same lanes always produce the same pads in the same
 * order, so a replay, a duel seat and a test all see one battlefield.
 *
 * The pads are derived, not hand-listed, for two reasons:
 *   · a new battlefield gets sensible pads the moment it is drawn, without a
 *     second file of coordinates that can drift out of sync with the ASCII;
 *   · the pads always hug the roads the horde actually walks (the lanes), so a
 *     stage can never ship a pad that no enemy passes.
 *
 * A level opts in with `buildSlots` (see `levelData.js`). Stages without it keep
 * the older free placement, which is what every mode written before the bastion
 * conversion expects.
 */
import { cellKey } from '../dsa/Graph.js';
import { TILE } from '../data/mapData.js';
import { zoneBlock } from './BuildZone.js';

export const SLOT_STATUS = {
  FREE: 'free',
  OCCUPIED: 'occupied',
};

/** Data defaults, used when a level says `buildSlots: true`. */
export const SLOT_DEFAULTS = {
  max: 16,
  reach: 2,
  spacing: 2,
  minRow: 0,
  maxRow: null,
};

const intOr = (value, fallback, min, max) => {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
};

/**
 * Normalise a level's `buildSlots` field.
 * @returns {null | {max:number, reach:number, spacing:number, minRow:number, maxRow:number|null}}
 */
export function resolveSlotConfig(level = {}) {
  const raw = level?.buildSlots;
  if (!raw) return null;
  const source = raw === true ? {} : raw;
  return {
    max: intOr(source.max, SLOT_DEFAULTS.max, 1, 64),
    reach: intOr(source.reach, SLOT_DEFAULTS.reach, 1, 6),
    spacing: intOr(source.spacing, SLOT_DEFAULTS.spacing, 1, 6),
    minRow: intOr(source.minRow, SLOT_DEFAULTS.minRow, 0, 512),
    maxRow: source.maxRow == null ? null : intOr(source.maxRow, SLOT_DEFAULTS.maxRow, 0, 512),
  };
}

const manhattan = (a, b) => Math.abs(a.row - b.row) + Math.abs(a.col - b.col);

function parseKey(key) {
  const [row, col] = String(key).split(',').map(Number);
  return { row, col };
}

/**
 * Derive the pads for a battlefield.
 *
 * A cell is a candidate when it is grass, inside the level's row band, and
 * within `reach` of a lane the horde walks. Candidates are ranked by how many
 * *distinct* lanes they overlook (a pad that covers two approaches is worth more
 * than one that covers a single road), then by how close they sit to the road,
 * then by row (lower rows first — that is the defence zone) and finally by
 * column, so the choice never depends on iteration order.
 *
 * @param {{rows:number, cols:number, tiles:string[][]}} map
 * @param {string[][]} lanes  cell-key routes, shortest first
 * @param {object} config     from `resolveSlotConfig`
 * @returns {{config:object, slots:Array<{row:number,col:number,key:string,lanes:number}>, keys:Set<string>}}
 */
export function deriveBuildSlots(map, lanes, config) {
  const cfg = config || resolveSlotConfig({ buildSlots: true });
  const routes = (lanes || []).filter((lane) => Array.isArray(lane) && lane.length > 0);
  if (!map?.tiles?.length || !routes.length) return { config: cfg, slots: [], keys: new Set() };

  // The pads never crowd the two gates: a keep standing on the portal's or the
  // bastion's own tile would sit under their sprites and read as decoration.
  const nearGate = (row, col) =>
    [
      map.spawn,
      map.base,
    ].some((gate) => gate && Math.max(Math.abs(gate.row - row), Math.abs(gate.col - col)) <= 1);

  /** @type {Map<string, {row:number, col:number, key:string, lanes:number, near:number}>} */
  const candidates = new Map();
  routes.forEach((lane, laneIndex) => {
    for (const key of lane) {
      const { row, col } = parseKey(key);
      for (let dr = -cfg.reach; dr <= cfg.reach; dr += 1) {
        for (let dc = -cfg.reach; dc <= cfg.reach; dc += 1) {
          const r = row + dr;
          const c = col + dc;
          if (r < 0 || c < 0 || r >= map.rows || c >= map.cols) continue;
          if (r < cfg.minRow || (cfg.maxRow != null && r > cfg.maxRow)) continue;
          if (map.tiles[r][c] !== TILE.GRASS) continue;
          if (nearGate(r, c)) continue;
          // Never suggest a pad the build path would refuse: the portal landing
          // ring and the bastion plaza are no-build zones (systems/BuildZone).
          if (zoneBlock({ row: r, col: c }, map)) continue;
          const cellKeyStr = cellKey(r, c);
          let entry = candidates.get(cellKeyStr);
          if (!entry) {
            entry = { row: r, col: c, key: cellKeyStr, lanes: 0, near: 0 };
            candidates.set(cellKeyStr, entry);
          }
          entry.near += 1;
          // Count each lane once per pad, not once per road cell it touches.
          entry.laneSet = entry.laneSet || new Set();
          entry.laneSet.add(laneIndex);
        }
      }
    }
  });

  const ranked = [...candidates.values()].map((entry) => ({
    row: entry.row,
    col: entry.col,
    key: entry.key,
    lanes: entry.laneSet.size,
    near: entry.near,
  }));
  ranked.sort(
    (a, b) =>
      b.lanes - a.lanes ||
      b.near - a.near ||
      b.row - a.row ||
      a.col - b.col
  );

  const slots = [];
  for (const candidate of ranked) {
    if (slots.length >= cfg.max) break;
    // Pads never overlap or touch: a keep needs a clear tile around it, and the
    // spacing keeps the field readable when eight of them are standing.
    if (slots.some((slot) => manhattan(slot, candidate) < cfg.spacing)) continue;
    slots.push(candidate);
  }

  return { config: cfg, slots, keys: new Set(slots.map((slot) => slot.key)) };
}

/** The pad at a cell, or null. */
export function slotAt(slots, row, col) {
  const key = cellKey(row, col);
  return (slots || []).find((slot) => slot.key === key) || null;
}

/**
 * Pads with their live state, for the HUD / renderer.
 * @param {Array<{row:number,col:number,key:string}>} slots
 * @param {{isOccupied:(row:number,col:number)=>boolean}} placement
 */
export function slotStates(slots, placement) {
  return (slots || []).map((slot) => ({
    ...slot,
    status: placement?.isOccupied?.(slot.row, slot.col) ? SLOT_STATUS.OCCUPIED : SLOT_STATUS.FREE,
  }));
}
