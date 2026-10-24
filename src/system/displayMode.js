/**
 * Display / orientation helpers.
 *
 * Everything in this module is pure: it takes a plain description of the
 * environment and returns a decision. That keeps the tricky parts — "is this a
 * phone?", "which way up is it?", "should we block the game right now?" — unit
 * testable in Node, while the browser-only side effects live in
 * `FullscreenController` and `OrientationGate`.
 *
 * The game is authored at 1280×768 (5:3). On a phone held upright the stage
 * collapses to a thin band, so gameplay is blocked until the device is turned
 * to landscape; on a desktop the window size never blocks anything.
 */

/** What the display gate should do right now. */
export const GATE_MODE = Object.freeze({
  /** Nothing to do — play normally. */
  NONE: 'none',
  /** Handheld device held in portrait: show the "rotate your device" screen. */
  ROTATE: 'rotate',
  /** Handheld device in landscape but the page is not fullscreen yet. */
  FULLSCREEN: 'fullscreen',
});

/**
 * Work out the physical orientation of the viewport.
 *
 * Width/height are compared first because they are reliable everywhere; the
 * Screen Orientation API is only used to break an exact square (which happens
 * for a frame while a phone is being rotated).
 *
 * @param {{width:number, height:number, type?:string}} viewport
 * @returns {'portrait'|'landscape'}
 */
export function detectOrientation(viewport = {}) {
  const width = Number(viewport.width) || 0;
  const height = Number(viewport.height) || 0;
  if (width > height) return 'landscape';
  if (height > width) return 'portrait';
  const type = String(viewport.type || '');
  if (type.startsWith('landscape')) return 'landscape';
  if (type.startsWith('portrait')) return 'portrait';
  // Square viewport with no orientation report: do not trap the player behind
  // the rotate screen — landscape is the playable assumption.
  return 'landscape';
}

/**
 * Is this a handheld / touch-first device?
 *
 * UA sniffing is a blunt instrument, so it is only the first of several
 * signals. The media-feature branch covers stripped-down WebViews that report
 * a desktop UA, and the iPadOS branch covers Safari's "Macintosh" UA (iPadOS 13+
 * reports a desktop UA but still exposes multi-touch).
 *
 * @param {{userAgent?:string, maxTouchPoints?:number, coarsePointer?:boolean, hoverNone?:boolean}} env
 */
export function isHandheldDevice(env = {}) {
  const userAgent = String(env.userAgent || '');
  const touchPoints = Number(env.maxTouchPoints) || 0;

  if (/Android|iPhone|iPod|iPad|Mobile|Tablet|Silk|Kindle|Opera Mini|IEMobile|BlackBerry|webOS/i.test(userAgent)) {
    return true;
  }
  // iPadOS 13+ masquerades as desktop Safari.
  if (/Macintosh/i.test(userAgent) && touchPoints > 1 && env.coarsePointer) return true;
  // No usable UA (custom WebView, spoofed browser): trust the input capabilities.
  return touchPoints > 0 && Boolean(env.coarsePointer) && Boolean(env.hoverNone);
}

/**
 * Decide which overlay (if any) must be shown.
 *
 * @param {object} state
 * @param {boolean} state.handheld
 * @param {'portrait'|'landscape'} state.orientation
 * @param {boolean} [state.fullscreenSupported]
 * @param {boolean} [state.fullscreenActive]
 * @param {boolean} [state.skipFullscreenPrompt] player chose "play without fullscreen"
 * @returns {'none'|'rotate'|'fullscreen'}
 */
export function resolveGateMode(state = {}) {
  if (!state.handheld) return GATE_MODE.NONE;
  if (state.orientation !== 'landscape') return GATE_MODE.ROTATE;
  if (!state.fullscreenSupported) return GATE_MODE.NONE;
  if (state.fullscreenActive) return GATE_MODE.NONE;
  if (state.skipFullscreenPrompt) return GATE_MODE.NONE;
  return GATE_MODE.FULLSCREEN;
}

/**
 * Does this mode stop the simulation? Both gates freeze the battlefield: in
 * portrait because it cannot be seen, and before fullscreen because the player
 * has not taken over the screen yet.
 */
export function gateBlocksGameplay(mode) {
  return mode === GATE_MODE.ROTATE || mode === GATE_MODE.FULLSCREEN;
}

/**
 * Fullscreen API vendor table, newest first. Safari < 16.4 only ships the
 * webkit-prefixed flavour; older Edge shipped ms.
 */
export const FULLSCREEN_VENDORS = Object.freeze([
  Object.freeze({
    id: 'standard',
    element: 'fullscreenElement',
    request: 'requestFullscreen',
    exit: 'exitFullscreen',
    enabled: 'fullscreenEnabled',
    change: 'fullscreenchange',
    error: 'fullscreenerror',
  }),
  Object.freeze({
    id: 'webkit',
    element: 'webkitFullscreenElement',
    request: 'webkitRequestFullscreen',
    exit: 'webkitExitFullscreen',
    enabled: 'webkitFullscreenEnabled',
    change: 'webkitfullscreenchange',
    error: 'webkitfullscreenerror',
  }),
  Object.freeze({
    id: 'moz',
    element: 'mozFullScreenElement',
    request: 'mozRequestFullScreen',
    exit: 'mozCancelFullScreen',
    enabled: 'mozFullScreenEnabled',
    change: 'mozfullscreenchange',
    error: 'mozfullscreenerror',
  }),
  Object.freeze({
    id: 'ms',
    element: 'msFullscreenElement',
    request: 'msRequestFullscreen',
    exit: 'msExitFullscreen',
    enabled: 'msFullscreenEnabled',
    change: 'MSFullscreenChange',
    error: 'MSFullscreenError',
  }),
]);

/**
 * Pick the flavour of the Fullscreen API this document supports.
 *
 * `document.fullscreenEnabled` is false inside an iframe without
 * `allow="fullscreen"`, which is exactly the case we must detect instead of
 * submitting the player to a button that always fails.
 *
 * @param {Document|null} doc
 * @param {Element|null} [element] element that will be made fullscreen
 * @returns {null | {id:string, supported:boolean, request:Function, exit:Function, element:Function, requestTarget:Element}}
 */
export function resolveFullscreenApi(doc, element) {
  if (!doc) return null;
  const target = element || doc.documentElement;
  if (!target) return null;

  for (const vendor of FULLSCREEN_VENDORS) {
    if (typeof target[vendor.request] !== 'function') continue;

    const enabled = doc[vendor.enabled];
    return {
      id: vendor.id,
      supported: enabled !== false,
      vendor,
      requestTarget: target,
      element: () => doc[vendor.element] || null,
      request: () => {
        // Only the standard API accepts options; the prefixed legacy ones
        // expect an enum (or nothing) and would throw on an object.
        return vendor.id === 'standard'
          ? target[vendor.request]({ navigationUI: 'hide' })
          : target[vendor.request]();
      },
      exit: () => doc[vendor.exit](),
    };
  }
  return null;
}

/** Human-readable reason for a failed fullscreen attempt (for logs/diagnostics). */
export function describeFullscreenError(error) {
  if (!error) return 'unknown';
  if (error.name === 'NotAllowedError') return 'blocked-by-browser (needs a user gesture)';
  if (error.name === 'TypeError') return 'not-allowed-in-this-frame (missing allow="fullscreen")';
  if (error.name === 'NotSupportedError') return 'unsupported';
  return error.message || String(error);
}
