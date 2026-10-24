/**
 * Where should the floating tower inspector go?
 *
 * The inspector used to be bolted to the bottom-right corner, which meant it
 * covered the dock on small screens and sat far away from the tower you had
 * just clicked. Now it is anchored to the selected tower: beside it when there
 * is room, above/below when there is not, and always clamped inside the
 * battlefield so it can never be dragged off-screen.
 *
 * Pure geometry, unit tested in tests/panel-placement.test.js.
 */

export const PANEL_MARGIN = 12;
export const PANEL_GAP = 30;

/** Clamp a panel rectangle so it stays fully inside the viewport. */
export function clampPanel(rect, panel, viewport, margin = PANEL_MARGIN) {
  const maxLeft = Math.max(margin, viewport.width - panel.width - margin);
  const maxTop = Math.max(margin, viewport.height - panel.height - margin);
  return {
    left: Math.min(Math.max(rect.left, margin), maxLeft),
    top: Math.min(Math.max(rect.top, margin), maxTop),
  };
}

/**
 * @param {{x:number,y:number}} anchor  tower position in viewport px
 * @param {{width:number,height:number}} panel  measured panel size
 * @param {{width:number,height:number}} viewport  battlefield size in px
 * @param {{margin?:number,gap?:number}} [options]
 * @returns {{left:number,top:number,side:'right'|'left'|'below'|'above'}}
 */
export function placeInspector(anchor, panel, viewport, options = {}) {
  const margin = options.margin ?? PANEL_MARGIN;
  const gap = options.gap ?? PANEL_GAP;
  const fitsRight = anchor.x + gap + panel.width + margin <= viewport.width;
  const fitsLeft = anchor.x - gap - panel.width - margin >= margin;
  const fitsBelow = anchor.y + gap + panel.height + margin <= viewport.height;
  const fitsAbove = anchor.y - gap - panel.height - margin >= margin;

  let side = 'right';
  if (!fitsRight) side = fitsLeft ? 'left' : fitsBelow ? 'below' : fitsAbove ? 'above' : 'below';

  let left;
  let top;
  switch (side) {
    case 'left':
      left = anchor.x - gap - panel.width;
      top = anchor.y - panel.height / 2;
      break;
    case 'below':
      left = anchor.x - panel.width / 2;
      top = anchor.y + gap;
      break;
    case 'above':
      left = anchor.x - panel.width / 2;
      top = anchor.y - gap - panel.height;
      break;
    case 'right':
    default:
      left = anchor.x + gap;
      top = anchor.y - panel.height / 2;
      break;
  }

  const clamped = clampPanel({ left, top }, panel, viewport, margin);
  return { left: clamped.left, top: clamped.top, side };
}
