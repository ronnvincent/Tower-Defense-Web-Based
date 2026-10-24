# Fullscreen & Landscape Mode

The game is authored at 1280×768 (5:3). On a desktop that is simply a window; on a phone it is the
difference between a playable battlefield and a sliver of grass. This document covers how the game
fills the screen, blocks portrait play, and works around the browser rules that make automated
fullscreen impossible.

---

## 1. What the player experiences

| Device / state | Result |
|---|---|
| Desktop, first click or key press | Native fullscreen (browser size changes, no chrome) |
| Desktop, `F` or the ⛶ button | Toggle fullscreen |
| Phone/tablet opened in portrait | Full-screen **"ROTATE YOUR DEVICE"** card; the battle is paused |
| Phone rotated to landscape | Card disappears; **"ENTER FULLSCREEN"** card appears |
| Tap *Enter Fullscreen* | Native fullscreen + landscape orientation lock (Android) |
| Tap *Play without fullscreen* | Card closes, game plays with browser chrome |
| Rotate back to portrait | Portrait block returns, battle pauses again |
| Phone already fullscreen (home-screen install) | Straight into the game, no cards |

Nothing is ever permanently blocked: if a browser refuses fullscreen even on a real tap (iPhone
Safari has no element fullscreen, iOS-in-iframe policies, kiosk browsers), the game falls back to
"play without fullscreen" automatically.

---

## 2. Files

| File | Role |
|---|---|
| `src/system/displayMode.js` | **Pure** decisions: orientation, device class, which gate, which Fullscreen API flavour. No DOM writes, fully unit-tested. |
| `src/system/FullscreenController.js` | Fullscreen + orientation-lock side effects, vendor prefixes, first-gesture arming, safe failure. |
| `src/system/OrientationGate.js` | Listens to every orientation signal, debounces, emits state changes. |
| `src/ui/DisplayGateUI.js` | Renders the two gate screens and mirrors state onto `<body>`. |
| `src/main.js` | Wires the three together, pauses/resumes `GameScene`, lists the HUD/menu buttons. |
| `index.html` | Gate markup (outside `#app`), viewport/meta tags, web-app manifest link. |
| `public/manifest.webmanifest` | `display: fullscreen`, `orientation: landscape`, icons. |
| `src/style.css` | Ambient letterbox backdrop, safe-area insets, gate styling, fullscreen chrome. |

---

## 3. Filling the screen without breaking the 5:3 stage

`#app` keeps its authored aspect ratio:

```css
#app {
  width:  min(100vw, calc(100dvh * 5 / 3));
  height: min(100dvh, calc(100vw * 3 / 5));
}
```

so the Phaser canvas never letterboxes *inside* its own frame and the HTML HUD stays glued to the
battlefield at every window size. The leftover space on a 844×390 phone (≈97 px each side) is filled
by a blurred, darkened tiling of the game's own grass texture plus a warm vignette:

```css
body::before { background-image: url('/assets/tiles/grass.png'); filter: blur(16px) brightness(0.34); }
body::after  { background: radial-gradient(...gold glow...), linear-gradient(...vignette...); }
```

Both are `position: fixed` and `pointer-events: none`, so they cost nothing and never eat taps.

Safe areas (`env(safe-area-inset-*)`) are added to the top bar, dock and camera cluster, so the notch
and home indicator never cover a control in fullscreen.

---

## 4. Orientation detection

No single event is reliable, so all of them are watched and debounced by 120 ms (a rotation fires a
burst of `resize` events while the viewport animates):

| Signal | Why |
|---|---|
| `window.resize` | Fires on every rotation on every browser |
| `window.orientationchange` | Legacy iOS |
| `screen.orientation.change` | Modern Android / iOS 16.4+ |
| `matchMedia('(orientation: portrait)')` | Safari 5+, and fires inside the preview iframe |
| `visibilitychange` | Returning from the app switcher can change the layout |

Orientation itself is decided by **viewport shape first** (width vs height), using
`screen.orientation.type` only to break an exact square. A square viewport is treated as landscape so
a desktop window can never be locked behind the rotate card.

Device class uses UA hints *plus* input capabilities, including the iPadOS 13+ case where Safari
reports a desktop `Macintosh` user agent:

```js
if (/Macintosh/i.test(ua) && maxTouchPoints > 1 && coarsePointer) return true;  // iPad
```

---

## 5. Why fullscreen cannot be fully automatic (and what we do instead)

`element.requestFullscreen()` requires **transient user activation**. A page that calls it on load is
rejected with `NotAllowedError`, and no amount of `setTimeout` changes that. The implementation
therefore offers four paths, in order of preference:

1. **User gesture anywhere** — `requestOnFirstGesture()` arms `pointerdown`/`keydown`/`touchstart`
   once (capture phase) on desktop. The first interaction of the session enters fullscreen.
2. **Explicit gesture** — the *Play Campaign* button calls `request()` synchronously inside its click
   handler, the gate's *Enter Fullscreen* button does the same, and the HUD ⛶ button and the menu pill
   toggle it. All are inside a real gesture, so all work.
3. **Opportunistic** — on rotation the gate also calls `request()` once. Usually rejected (rotation is
   not a gesture), but some browsers still hold activation for a moment and then it succeeds silently.
4. **Installed app** — the manifest declares `display: "fullscreen"` and `orientation: "landscape"`,
   so launching from the home screen skips the browser entirely.

Rejections never break the game: `FullscreenController.request()` resolves to `false`, logs the reason
once (`blocked-by-browser (needs a user gesture)`, `not-allowed-in-this-frame (missing allow="fullscreen")`),
and the gate offers *Play without fullscreen*.

If the page is embedded in an iframe (the Arena preview, CodePen, an LMS), `document.fullscreenEnabled`
is `false`. That is detected up-front and the fullscreen UI is hidden rather than shown broken, and the
landscape gate is skipped entirely so the game stays playable.

```html
<!-- Hosting an iframe? Opt in explicitly: -->
<iframe src="..." allow="fullscreen; orientation-lock" allowfullscreen></iframe>
```

---

## 6. Pausing while the screen is unusable

Both gates pause **the Phaser scene**, not the HTML:

```js
if (blocked) plugin.pause(); else plugin.resume();
```

That freezes enemies, towers, projectiles, wave timers and the simulation clock, while the canvas keeps
rendering its last frame, the HUD stays interactive, and `update()` never runs with a huge delta. The
helper remembers that *it* paused the scene (`pausedByGate`) so a manual pause is never cancelled by a
rotation, and re-applies the gate on every `GameScene` `create` so a battle started mid-rotation cannot
run behind the overlay.

---

## 7. Accessibility & robustness

- Both gates are `role="dialog" aria-modal="true"`, start with `inert`, and take focus when they open.
- `prefers-reduced-motion` disables the rotating-phone animation.
- `Escape` / backdrop behaviour is unchanged for the existing modals.
- The fullscreen toggle is `aria-pressed` and labelled *Enter fullscreen* / *Exit fullscreen*.
- `FullscreenController` never throws: every vendor call is wrapped, and unsupported platforms
  (orientation lock on iOS) silently no-op.

---

## 8. Verification

```bash
npm test                # 236 tests / 19 suites
npm run check:contrast  # 36/36 WCAG pairs (gate card, menu pill included)
npm run build
```

| Suite | Tests | Covers |
|---|---:|---|
| `tests/display-mode.test.js` | 17 | Orientation maths, device detection (incl. iPadOS), gate policy, vendor table, error messages |
| `tests/orientation-gate.test.js` | 18 | Rotate→unlock, re-block on rotate-back, debounce, skip/re-arm, fullscreen support detection, first-gesture arming, toggle, orientation lock |
| `tests/display-gate-dom.test.js` | 14 | Real `index.html` markup, gates outside `#app`, show/hide/inert transitions, button callbacks, focus, HUD fullscreen mirroring |

### Manual checklist (needs a real device)

1. Phone, portrait: rotate card appears, battle is paused, nothing behind it is tappable.
2. Rotate to landscape: card switches to *Enter Fullscreen*; tap it — browser chrome disappears and the
   board fills the screen (notch areas not clipped).
3. Rotate back to portrait mid-wave: the wave freezes, HUD still responsive; rotate again and it resumes
   exactly where it stopped.
4. Exit fullscreen with the system gesture: you are **not** re-prompted in that same landscape phase.
5. Desktop: press `F` — toggles; reload and click once — the game enters fullscreen on that first click.
6. Embedded preview: no broken fullscreen buttons, game playable.
