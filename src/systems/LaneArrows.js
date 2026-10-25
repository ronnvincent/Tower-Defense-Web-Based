/**
 * Lane hint marker.
 *
 * The horde files down **one lane per wave** (see `GameScene.laneIndexForWave`)
 * and the next wave takes another road, so the only thing the player has to read
 * is *which gate mouth the push is coming out of*. Painting arrows down the whole
 * route answered a question nobody asked and turned the map into a road atlas:
 * this module marks the entrance instead.
 *
 * What it draws:
 *   - a beacon ring on the gate tile itself, and
 *   - a short run of chevrons over the first few cells of the lane, pointing the
 *     way the creeps will walk.
 *
 * The geometry lives here instead of inside `GameScene` so it can be asserted
 * against plain numbers: `paintLaneHint` takes any object with `fillStyle` /
 * `fillTriangle` / `strokeCircle`, so a test can record the exact shapes.
 */

/** Chevrons drawn past the gate before the road goes quiet. */
export const LANE_HINT_STEPS = 4;

/** Arrowhead size as a fraction of one tile. */
const HEAD_RATIO = 0.24;
const WING_RATIO = 0.19;

/** Depth of the hint layer: above terrain tiles (3), below portals/units (10). */
export const LANE_ARROW_DEPTH = 4;

const SHADE = { color: 0x0b0f14, alpha: 0.42, offset: 1.5 };
const CHEVRON = { color: 0xffe6a3, alpha: 0.8 };
const BEACON = { color: 0xffe6a3, alpha: 0.65, radius: 0.46, inner: 0.28 };

/** Cell key "row,col" → world-space centre of the tile. */
export function cellCentre(key, tileSize) {
  const [row, col] = String(key).split(',').map(Number);
  return { x: col * tileSize + tileSize / 2, y: row * tileSize + tileSize / 2 };
}

/**
 * The chevrons the entrance of one lane is worth, in draw order.
 *
 * Only the first `steps` edges out of the gate are marked — the rest of the road
 * stays clean on purpose.
 *
 * @param {string[]} lane  Cell keys, gate → core.
 * @param {number} tileSize
 * @param {{steps?:number}} [options]
 * @returns {{x:number, y:number, angle:number, tip:object, left:object, right:object}[]}
 */
export function laneHintAnchors(lane, tileSize, { steps = LANE_HINT_STEPS } = {}) {
  const head = tileSize * HEAD_RATIO;
  const wing = tileSize * WING_RATIO;
  const limit = Math.max(0, Math.floor(steps));
  const arrows = [];
  if (!lane || lane.length < 3) return arrows;

  // Start at 1: the gate tile itself carries the beacon, not a chevron.
  for (let i = 1; i < lane.length - 1 && arrows.length < limit; i += 1) {
    const from = cellCentre(lane[i], tileSize);
    const to = cellCentre(lane[i + 1], tileSize);
    const angle = Math.atan2(to.y - from.y, to.x - from.x);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const x = (from.x + to.x) / 2;
    const y = (from.y + to.y) / 2;
    const tip = { x: x + cos * head, y: y + sin * head };
    const back = { x: x - cos * head * 0.5, y: y - sin * head * 0.5 };
    arrows.push({
      x,
      y,
      angle,
      tip,
      left: { x: back.x - sin * wing, y: back.y + cos * wing },
      right: { x: back.x + sin * wing, y: back.y - cos * wing },
    });
  }
  return arrows;
}

/**
 * Paint the beacon and the entrance chevrons onto a Graphics-like target.
 * Returns the number of chevrons drawn so callers can log/assert it cheaply.
 */
export function paintLaneHint(graphics, lane, tileSize, { steps = LANE_HINT_STEPS } = {}) {
  if (!graphics?.fillTriangle || !lane?.length) return 0;

  const gate = cellCentre(lane[0], tileSize);
  // Beacon: two rings, so the entrance reads even under the portal sprite.
  if (graphics.strokeCircle) {
    graphics.lineStyle(3, BEACON.color, BEACON.alpha);
    graphics.strokeCircle(gate.x, gate.y, tileSize * BEACON.radius);
    graphics.lineStyle(2, BEACON.color, BEACON.alpha * 0.6);
    graphics.strokeCircle(gate.x, gate.y, tileSize * BEACON.inner);
  }

  const arrows = laneHintAnchors(lane, tileSize, { steps });
  for (const arrow of arrows) {
    const { tip, left, right } = arrow;
    graphics.fillStyle(SHADE.color, SHADE.alpha);
    graphics.fillTriangle(
      tip.x + SHADE.offset,
      tip.y + SHADE.offset,
      left.x + SHADE.offset,
      left.y + SHADE.offset,
      right.x + SHADE.offset,
      right.y + SHADE.offset
    );
    graphics.fillStyle(CHEVRON.color, CHEVRON.alpha);
    graphics.fillTriangle(tip.x, tip.y, left.x, left.y, right.x, right.y);
  }
  return arrows.length;
}

/**
 * Human name for a lane, derived from where it leaves the shortest route.
 *
 * "Wave 3 · UPPER LANE" is the hint a player can act on before the creeps even
 * move, and it is computed from the map instead of being hard-coded per level.
 */
export function laneLabel(lanes, index) {
  const list = Array.isArray(lanes) ? lanes : [];
  const lane = list[index];
  const base = list[0];
  if (!lane || !base || index <= 0) return 'CENTRE';

  const at = lane.findIndex((cell, i) => cell !== base[i]);
  if (at < 1) return 'CENTRE';
  const [fromRow, fromCol] = base[at - 1].split(',').map(Number);
  const [row, col] = lane[at].split(',').map(Number);
  if (Math.abs(row - fromRow) >= Math.abs(col - fromCol)) {
    return row < fromRow ? 'UPPER' : 'LOWER';
  }
  return col < fromCol ? 'LEFT' : 'RIGHT';
}
