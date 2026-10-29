/**
 * battleFrame.js — where on the canvas the battlefield is allowed to draw.
 *
 * The HUD owns the top and bottom of the screen: the top bar is fixed to the
 * top, the forge dock to the bottom. A board that fills the whole canvas is
 * therefore *cropped by interface* — the rim disappears under the top bar and
 * the bastion sits behind the forge. That was fine while the bastion was in the
 * middle of the map; it is not fine now that it owns the bottom row.
 *
 * The fix is to give the camera a **band**: the rectangle between the two HUD
 * panels. The camera draws only inside it, and fits the battlefield to it. The
 * leftover canvas shows the game background, which reads as the table the board
 * is laid on.
 *
 * The frame is pure geometry so it can be tested without a browser:
 *
 *   ┌───────────────────────────┐ 0
 *   │  top bar                  │
 *   ├───────────────────────────┤ ← top
 *   │  the battlefield          │   height
 *   ├───────────────────────────┤ ← bottom
 *   │  forge dock               │
 *   └───────────────────────────┘ canvasHeight
 */

/** A band thinner than this cannot show a 10-row board at a usable zoom. */
export const MIN_BAND_PX = 240;

/**
 * @param {object} spec
 * @param {number} spec.canvasHeight
 * @param {number} [spec.topBarBottom]  bottom edge of the top bar, canvas px
 * @param {number} [spec.dockTop]       top edge of the forge dock, canvas px
 * @param {number} [spec.gap]           breathing room under/over each panel
 * @param {number} [spec.minBand]
 * @returns {{top:number, height:number, bottom:number, fitted:boolean}}
 */
export function battleFrame({
  canvasHeight,
  topBarBottom = 0,
  dockTop = canvasHeight,
  gap = 6,
  minBand = MIN_BAND_PX,
} = {}) {
  const height = Math.max(0, Number(canvasHeight) || 0);
  // Request 66: a zero `topBarBottom` means "the band starts at the top of the
  // canvas" — the rail draws a translucent band over the field instead of the
  // camera giving it a strip of page. `gap` is the breathing room under a bar
  // that is actually there, so it is only added when one is.
  const rail = Math.max(0, Number(topBarBottom) || 0);
  const top = rail > 0 ? Math.round(rail + gap) : 0;
  const bottom = Math.min(height, Math.round((Number(dockTop) || height) - gap));
  const band = bottom - top;
  if (band < minBand) {
    // Not enough room between the panels (a very short landscape phone with
    // the dock open). Fall back to the whole canvas rather than shrinking the
    // board into an unreadable strip; the camera can still be panned.
    return { top: 0, height, bottom: height, fitted: false };
  }
  return { top, height: band, bottom, fitted: true };
}
