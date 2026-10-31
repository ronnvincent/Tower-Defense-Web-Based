# World map on a phone — what was slow, and what the numbers say

The complaint was specific: on any mobile device the world map lags when you
zoom, pan or just sit still on it. Desktop was fine. This note records the
measurement, the cause, the fix, and the evidence — so the next person does not
have to re-derive it.

## How it was measured

Chromium 153 (headless, SwiftShader software GPU), a real production build
served by `vite preview`, a real name-gate click, `?probe=1`. The device profile
is the one the complaint is about: **844×390 CSS pixels at DPR 3** — a phone in
landscape, which is the only orientation the game accepts.

* **Idle** = frames the page actually drew in two seconds (`requestAnimationFrame`
  ticks). A healthy 60 Hz page returns ~120.
* **Gesture** = frame intervals recorded in-page while CDP dispatches a real
  two-finger pinch (30 `touchmove` events at 8 ms spacing), measured only for the
  duration of the motion.
* **Before/after** were taken on the *same page instance*, flipping the three
  behaviours on and off at runtime, so the machine never changes between arms.

Software rasterisation is much slower than a real phone GPU in absolute terms,
which makes it a useful stress test: it reproduces the jank at a device profile
where the real thing is only mildly annoying, and it removes browser-GPU
driver differences from the comparison.

## Result

| | Before | After |
| --- | --- | --- |
| Idle frames in 2 s (60 Hz cap ≈ 120) | **6** (~3 fps) | **121** (~60 fps) |
| Pinch, median frame | **117 ms** | **17 ms** |
| Pinch, p95 | **483 ms** | **17 ms** |
| Pinch, worst frame | **1567 ms** | **17 ms** |

Every frame of the gesture now lands inside the 16.7 ms budget, with no
outliers, on the profile that used to stutter for a second and a half.

## The three causes

### 1. The game kept rendering behind an opaque map (the big one)

`GameScene` is stopped when the map opens, but the Phaser loop keeps ticking, and
its 1280×768 WebGL canvas sits *under* the map plate. Nobody can see it and the
compositor still has to account for it every frame. Hiding just that canvas —
nothing else changed — took the pinch from a 150 ms median to a 17 ms median.

Fixed in `src/main.js` (`parkGameLoop`): opening the map calls
`game.loop.sleep()`, which cancels Phaser's request-animation-frame outright, and
leaving it calls `wake()` + `resetDelta()`. `resetDelta()` matters: without it the
first frame after a spell on the map computes a multi-second delta and the board
lurches forward in one step. Verified: returning to a battle now reports a 17 ms
loop delta, not a multi-second one.

`parkGameLoop(false)` is also called from `openMainMenu`, because the menu overlay
is a scrim over live title art, and from `startLevel`, which is the one path that
brings a scene back. `WorldMapUI.hide()` fires `onHide` as a belt-and-braces
callback, so a future exit path that forgets both still gives Phaser its clock.

As defence in depth, `WorldMapUI.setCanvasCovered()` puts
`body.wm-covers-canvas` on the document while the map is open:

```css
body.wm-covers-canvas #game-container canvas { visibility: hidden; }
```

`visibility`, not `display`: the element keeps its box, so Phaser's scale manager
never sees a zero-sized parent and no resize fires when the map closes.

### 2. Ambient decoration animations repainted under a moving camera

The map animates a mist layer, a water shimmer, eight embers, three birds and
seven banner sways — every one of them a full-plate or landmark-sized layer. A
camera transform plus those animations means the compositor cannot simply move a
cached texture; it redoes work while the plate is already under a transform.
Dragging with them paused for the duration of the gesture was 17 ms/frame with a
17 ms worst case; running them peaked at 683 ms.

Fixed in `src/style.css`: while `.wm-is-panning` is on the map, those six groups
get `animation-play-state: paused`. They are slow, subtle loops, they resume the
instant the camera settles (verified: back to `running` after a gesture), and the
map at rest is pixel-identical to before.

`markGesture()` already existed for the compositor hint; it is now also called
from `tweenTo` (every frame of a camera flight, so the decorations stay frozen
for a 900 ms landmark fly-to, not just 220 ms) and from arrow-key panning.

### 3. What was *not* the cause

Measured and rejected, so nobody re-tries them:

* `filter: saturate()/contrast()` on the terrain — no measurable effect.
* `drop-shadow()` on the 14 landmark images — no measurable effect.
* The cloud parallax `translate3d` layers — no measurable effect.
* Re-rasterising the plate on every scale change. Chrome does re-raster a
  transformed layer without `will-change: transform`, which is why the map sets
  that hint only during a gesture — but with causes 1 and 2 removed the frame is
  already inside budget, so making the raster permanent would trade crispness and
  VRAM for nothing. The existing comment in `style.css` explaining why the hint
  is temporary still holds, and `tests/world-map.test.js` still enforces it.

## What stays the same

* Nothing visual changed: the map at rest renders identically (checked
  side by side at home and max zoom).
* Camera behaviour is unchanged — drag, pinch, wheel, arrow keys, zoom rail,
  recenter, landmark flights, camera memory across a round trip to a battle.
* Audio is unaffected: it runs on the Web Audio clock, not on the game loop.
* Gameplay is unaffected: a battle started from the map runs normally (loop
  running, canvas visible, simulation advancing).

## Tests

`tests/world-map.test.js` gained a case for the flight behaviour (the gesture
hint must stay up for the whole 520 ms tween) and the existing compositor-hint
test now asserts the new, stricter contract: hint on during the opening flight,
off once it lands, off at rest, off after `hide()` mid-gesture.

Full suite after the change: **126 files / 1 598 tests passed**. Production build
passes. Browser checks (landscape DPR 3): drag pans, zoom in/out, recenter, wheel
zoom, landmark panel open/Escape close, and `MAIN MENU` restores the loop and the
canvas — all green, zero console errors.

## Remaining work, honestly

* The phone numbers above are from a **software-rasterised headless Chromium at
  DPR 3**, not from a physical handset. The direction and the size of the win are
  large enough to be unambiguous, but a real-device run (iOS Safari, a mid-range
  Android) is still worth doing.
* The map itself is a single 1536×1024 plate scaled up to ~1.76×. On a very high
  zoom a real 4× tile pyramid (or a 2× plate) would look sharper than one
  upscaled image; that is a quality question, not a frame-rate one, and it is not
  addressed here.
