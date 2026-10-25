/**
 * Lane direction chevrons.
 *
 * Every battlefield deals the horde across two or three routes (see
 * `PathfindingSystem.computeLanes`). A route the player cannot read is a route
 * the player cannot defend, so each lane is marked with an arrow every other
 * cell, pointing at the cell the horde walks into next.
 *
 * The geometry lives here instead of inside `GameScene` for one reason: it can
 * then be tested against plain numbers. `paintLaneArrows` takes any object with
 * `fillStyle` / `fillTriangle`, so a test can hand it a recorder instead of a
 * Phaser Graphics and assert the exact triangles a player would see.
 *
 * Design constraints baked into the numbers below:
 *   - one arrow every `STEP` cells (2) — dense enough to read on a phone, sparse
 *     enough that the road still looks like road;
 *   - an arrow sits on the *edge* between two cells, not on a cell, so the fork
 *     tile where two lanes part can carry an arrow for each exit instead of one
 *     muddled marker in the middle;
 *   - the gate tile (index 0) is left bare, because the portal sprite sits on
 *     top of it;
 *   - a shared edge is painted once, so two lanes merging before the core do not
 *     stamp two arrows on the same segment;
 *   - a dark keyline is drawn under each warm chevron, which is what keeps the
 *     marker legible over grass, glacier and basalt alike.
 */

/** Distance in tiles that separates two chevrons on the same lane. */
export const LANE_ARROW_STEP = 2;

/** Arrowhead size as a fraction of one tile. */
const HEAD_RATIO = 0.22;
const WING_RATIO = 0.17;

/** Depth of the arrow layer: above terrain tiles (3), below portals/units (10). */
export const LANE_ARROW_DEPTH = 4;

const SHADE = { color: 0x0b0f14, alpha: 0.4, offset: 1.5 };
const CHEVRON = { color: 0xffe6a3, alpha: 0.72 };

/** Cell key "row,col" → world-space centre of the tile. */
export function cellCentre(key, tileSize) {
  const [row, col] = String(key).split(',').map(Number);
  return { x: col * tileSize + tileSize / 2, y: row * tileSize + tileSize / 2 };
}

/**
 * The arrows a set of lanes is worth, in draw order.
 *
 * @param {string[][]} lanes  Cell keys per lane, spawn → core.
 * @param {number} tileSize
 * @returns {{x:number, y:number, angle:number, tip:object, left:object, right:object}[]}
 */
export function laneArrowAnchors(lanes, tileSize) {
  const head = tileSize * HEAD_RATIO;
  const wing = tileSize * WING_RATIO;
  const painted = new Set();
  const arrows = [];

  for (const lane of lanes || []) {
    if (!lane || lane.length < 3) continue;
    // Start at 1: index 0 is the gate, which the portal sprite covers.
    for (let i = 1; i + 1 < lane.length; i += LANE_ARROW_STEP) {
      const fromKey = lane[i];
      const toKey = lane[i + 1];
      const edge = `${fromKey}|${toKey}`;
      if (painted.has(edge)) continue;
      painted.add(edge);

      const from = cellCentre(fromKey, tileSize);
      const to = cellCentre(toKey, tileSize);
      // Anchor on the boundary between the two cells: the fork tile gets one
      // arrow per exit instead of two arrows sharing a centre.
      const x = (from.x + to.x) / 2;
      const y = (from.y + to.y) / 2;
      const angle = Math.atan2(to.y - from.y, to.x - from.x);
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
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
  }
  return arrows;
}

/**
 * Paint the chevrons onto a Graphics-like target (`fillStyle` + `fillTriangle`).
 * Returns the number of arrows drawn so callers can log/assert it cheaply.
 */
export function paintLaneArrows(graphics, lanes, tileSize) {
  if (!graphics?.fillTriangle) return 0;
  const arrows = laneArrowAnchors(lanes, tileSize);
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
