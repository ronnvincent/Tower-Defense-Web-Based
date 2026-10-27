/**
 * Lane hint marker.
 *
 * A wave leaves from the gate it owns (see `systems/SpawnGates.js`) and the next
 * wave takes another, so the only thing the player has to read is *which gate
 * mouth the push is coming out of*. Painting arrows down the whole route answered
 * a question nobody asked and turned the map into a road atlas: this module marks
 * the entrance instead — one beacon for an opening wave, two or three once the
 * stage opens the board up.
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
 * Human name for a lane.
 *
 * Every lane of a battlefield starts at the same portal and ends at the same
 * gate, so "which road is this?" is answered by *where the road spends its
 * length*: the lane whose cells sit furthest left is the LEFT lane, the one on
 * the right is RIGHT, and a lane between them is the CENTRE.
 *
 * The centroid is used rather than "the first cell where two lanes differ".
 * That older rule assumed a mirror-symmetric board where one lane was the
 * reference — on a three-crossing diagonal every lane peels off to the same
 * side of the portal, so all of them would have been called RIGHT.
 *
 * @param {string[][]} lanes
 * @param {number} index
 * @returns {'LEFT'|'CENTRE'|'RIGHT'|'UPPER'|'LOWER'}
 */
function centroid(lane) {
  let col = 0;
  let row = 0;
  for (const key of lane) {
    const [r, c] = key.split(',').map(Number);
    row += r;
    col += c;
  }
  return { row: row / lane.length, col: col / lane.length };
}

export function laneLabel(lanes, index) {
  const list = (Array.isArray(lanes) ? lanes : []).filter((lane) => lane?.length);
  const lane = list[index];
  if (!lane) return 'CENTRE';
  if (list.length === 1) return 'CENTRE';
  const sorted = list
    .map((cells, i) => ({ i, ...centroid(cells) }))
    .sort((a, b) => a.col - b.col || a.i - b.i);
  const at = sorted.findIndex((entry) => entry.i === index);
  // The two lanes at the ends of the spread are the flanks; anything between
  // them (a three-crossing board) is the centre lane.
  if (at === 0) return 'LEFT';
  if (at === sorted.length - 1) return 'RIGHT';
  return 'CENTRE';
}
