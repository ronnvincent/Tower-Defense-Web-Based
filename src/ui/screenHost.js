/**
 * screenHost.js — mounting screens into a shared overlay layer.
 *
 * Six screens (the result card, the Muster Hall, the Forge, Achievements,
 * Blessings and the duel lobby) all live in `#screen-container`. They used to
 * be rendered with `container.innerHTML = ...` and cleared with
 * `container.innerHTML = ''`, which quietly deleted every *sibling* screen:
 * the Mirror Arena lobby is built once at boot and appended there, so the first
 * time the world map opened (which hides the result card) the lobby's element
 * was destroyed while the lobby object stayed alive. `gamePvpLobby.isOpen()`
 * even answered `true` — it was toggling a class on a detached node — and the
 * ENTER THE ARENA button "did nothing".
 *
 * These helpers give every screen ownership of exactly one node.
 */

/**
 * Put `markup` (a single root element) into `container`, replacing any earlier
 * mount of the same id and leaving every other child untouched.
 *
 * Request 66: the replaced node is marked `no-enter`, so the stylesheet does not
 * replay the overlay's entrance fade on it. Every screen here re-renders itself
 * by re-mounting its root, and `.overlay-screen` animates `opacity` from 0 — so
 * switching a companion in the Muster Hall, or buying a relic in the Forge,
 * flashed the dark menu behind the screen for a fifth of a second. A screen
 * fades in when it *opens*; swapping its own contents is not an entrance.
 *
 * @param {HTMLElement} container
 * @param {string} id  the root element's id
 * @param {string} markup
 * @returns {HTMLElement|null}
 */
export function mountScreen(container, id, markup) {
  if (!container) return null;
  // A node already in the layer means this is a repaint of an *open* screen.
  // The id is not remembered past the unmount: closing and reopening a screen is
  // an entrance and should fade in like one.
  const replacing = Boolean(container.querySelector(`#${id}`));
  unmountScreen(container, id);
  const template = document.createElement('template');
  template.innerHTML = String(markup).trim();
  const node = template.content.firstElementChild;
  if (!node) return null;
  if (replacing) node.classList.add('no-enter');
  container.appendChild(node);
  return node;
}

/**
 * Remove this screen's root, and only this screen's root.
 *
 * @param {HTMLElement} container
 * @param {string} id
 * @returns {HTMLElement|null} the removed node, if there was one
 */
export function unmountScreen(container, id) {
  if (!container) return null;
  const node = container.querySelector(`#${id}`);
  if (node) node.remove();
  return node;
}

/**
 * Re-attach a screen element that something removed from its container.
 *
 * Persistent screens (the duel lobby, the duel result) keep their element for
 * the whole session; if a stray `innerHTML` ever clears the layer again, their
 * next `show()` puts the same node back instead of painting a detached copy.
 *
 * @returns {boolean} true when the element had to be re-attached
 */
export function ensureMounted(container, el) {
  if (!container || !el) return false;
  if (container.contains(el)) return false;
  container.appendChild(el);
  return true;
}
