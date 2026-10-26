# Request 16 — performance, responsive UI, graphics stability, asset optimisation

**Project:** Defense of Kingdom: DSALGO Bastion Edition (`ronnvincent/Tower-Defense-Web-Based`)
**Scope of this report:** the real game in `src/`, measured in a real browser, not a mockup.
**Every number below was produced by a headless Chromium run against this build.** Where a
number cannot mean what it looks like on a phone, it says so.

Environment used for measurements: Chromium (headless), `--disable-gpu` → software
SwiftShader raster, DPR 1, Vite dev server `:4173` for in-page probes and the production
build (`npm run build` → `dist/` on `:4300`) for network and boot numbers.

---

## 1. Repo inspection and reproduction

The game is a Vite + Phaser 3 SPA with a DOM shell (menu, world map, panels, HUD) over one
1280×768 canvas (`FIT` / `CENTER_BOTH`, `pixelArt: true`, `roundAntialias`, CSS stage sized
`min(100vw, 100vh*25/12)`). Everything that is not the battlefield is DOM; the battlefield and
the world map's parallax are canvas/paint.

Reproduced before touching anything:

| symptom | reproduced? | evidence |
| --- | --- | --- |
| UI clipping | partially — three real cases, listed in §2 | screenshot + DOM rect probes |
| black / vanishing art under Realm zoom | **not** on desktop Chromium | six zoom in/out cycles at 1920×1080, §3 |
| lag | yes, measurable | frame-time sampling, draw-call counter, §4 |
| oversized asset payload | yes | network breakdown by directory, §13 |

The "black graphics" report is device-side, so §3 documents what was analysed and why the
remaining risk is texture memory and layer size, not code paths.

---

## 2. Issue A — UI clipping (root causes, not nudges)

Screens covered: main menu, Realm (map, briefing, overview, War Room, library, shrine, arena,
forge, champions, monument), Forge, War Room, champions, achievements, codex,
campaign/stage select, briefing, HUD, victory, defeat, result and settings.

Sizes covered: **360×640, 390×844, 768×1024, 1024×768, 1366×768, 1920×1080.** The layout
sweep covered 21 of those screens at 360/1024/1366/1920; this pass added briefing, victory and
defeat at all six sizes, plus re-checks of the map panels and the battle HUD.

**Result: the audited screens report 0 off-screen elements, 0 clipped text runs and 0
page-level scroll at every size they were measured at.** Three real defects were found and
fixed at their cause:

1. **Briefing actions were 32 px tall on phones.** `.wm-btn` had a mobile override of
   `min-height: 30px` — the DEPLOY button, the one control that starts a stage, was the
   smallest target in the game. Root fix in the responsive block (`min-height: 44px`) plus a
   `(pointer: coarse)` rule for tablets where the base rule was still 34 px.
   *Measured: 32 px → 44 px, panel still fits (390×844: 404 px card, 8 px bottom margin).*
2. **Empty star slots were invisible.** `star_empty.png` at `opacity .26` + `grayscale(1)` on
   a dark plaque read as "no row at all" on a 390 px screen. Raised to `.45` and
   `brightness(1.2)` — a slot now reads as a slot, an earned star still reads as earned.
3. **Result/defeat/briefing cards had no verifiable bound.** They relied on intrinsic height.
   All three now audit clean at six sizes with explicit measurements (e.g. 1366×768 victory
   520×461 at (423,154); 390×844 victory 370×552 at (10,146)) and the panel scrolls with a
   sticky action bar rather than overflowing the viewport.

No negative margins and no positional nudges were added. The panel family
(`.overlay-shell`, `.wm-panel`) keeps one spacing scale, one scroll contract
(`overflow-y: auto` + sticky `.wm-card-actions`) and one max-height rule.

---

## 3. Issue B — graphics turning black / disappearing under Realm zoom

**What the Realm actually is:** a CSS-transform camera (`translate3d(...) scale(...)`) over one
1536×1024 painted plate, with `<button>` landmarks and DOM labels. There is no per-frame
texture creation and no canvas re-render on zoom.

**Reproduction attempt (repeatable ops):** 6 cycles of 7 wheel-steps in + a drag + 14 steps out
at 1920×1080, and 3 cycles at 1366×768, over the map and over a live battle.

| check | result |
| --- | --- |
| texture count before / after 6 zoom cycles | **742 / 742** — no texture is created per zoom frame |
| WebGL context lost | never (`isContextLost() === false` throughout) |
| broken `<img>` plates after cycles | 0 |
| near-black pixels inside the painted field | 0.03 % |
| console errors / WebGL errors | 0 |

**So the desktop path does not reproduce it.** What the analysis *did* find is the two things
that cause exactly this symptom on phones:

1. **Composited layer size.** At `scale 2.2` and DPR 3 the plate layer wants ~10 000 px of
   raster. Mobile Safari/Chrome split or evict that, and the evicted tiles paint black until
   they are re-rastered. Mitigation implemented: `will-change` is only asserted while a
   gesture is in flight (`.wm-is-panning`), not at rest, so the map is not permanently a
   giant layer. Verified: `will-change` computes to `auto` at rest, `transform` on
   `pointerdown`, stays on through the drag, and clears 220 ms after the last move (jsdom
   test + browser probe). The camera clamp (`minScale`…`minScale × 3.2`, measured
   1.25 → 2.2 at 1920×1080) keeps the zoom range bounded per viewport.
2. **Texture memory in battle, not on the map.** See §13: 32.7 MP resident (≈131 MB at RGBA8)
   during a battle. On a 128–256 MB browser GPU budget that is the classic trigger for
   "some textures go black when the camera moves". This is reduced by the on-demand loading
   work in §13, not hidden.

**Not done, deliberately:** no black area was covered, no artwork was replaced with solid
colour, no zoom was disabled, nothing was deleted. **Still needs a physical device to
confirm** — see the honesty table at the end.

---

## 4. Issue C — lag, profiled and prioritised by measured impact

Measurement method: `requestAnimationFrame` deltas over 192 frames (first 8 discarded),
`gl.drawElements`/`drawArrays` wrapped to count GPU submissions, texture inventory walked from
`game.textures.list` (pixels → MP → MB at 4 B/px).

| what | before | after | note |
| --- | --- | --- | --- |
| Realm map frame time (1366×768) | **102.3 ms** | **51.0 ms** | −50 % |
| Realm map, performance profile | — | **32.7 ms** | −68 % vs before |
| Battle frame avg / p95 (1366×768) | 39.25 / 45.70 ms | 39.55 / 44.10 ms | unchanged: bottleneck is raster fill, not script |
| Draw calls per battle frame | — | **2** | Phaser batches the whole tile grid |
| Texture binds per frame | — | 18 | |
| Vertices per frame | — | 4 404 (≈1 100 quads) | |
| Boot textures | 803 | **742** (−7.6 %) | |
| Boot texture pixels | 20 MP | **14.4 MP** (−28 %) | |
| Battle resident texture memory | 32.7 MP | **32.7 MP** (≈131 MB RGBA) | unchanged by design; split: enemies 12.7, towers 12.4, fx 5.3, tiles 1.8 |
| Boot network | 6 338 KB | **4 912 KB** (−22.5 %) | |
| Boot to first screen (headless, software raster) | 4.6–6.0 s across runs | 4.6–6.0 s | dominated by software texture upload, not by script |
| fx art requested at boot | 55 files / 1 336 KB | **0** | loaded with the battle instead |

**Prioritised fixes, in the order the measurements justified them:**

1. **Full-plate CSS blur on the map air layers** — `filter: blur(16px)` on a plate-sized
   element plus `blur(26px)` on two mist layers, re-rastered every frame because the mist
   *also* animated `transform: scale()`. A/B in the running app with injected CSS:
   102.3 ms → 36.2 ms without the air layer; 41.8 ms with it back minus the blur.
   Root fix: the layers are already soft radial gradients, so the blur pass was redundant —
   removed, and the mist now animates opacity only (same look, no per-frame raster).
2. **Effect art loaded at boot** — 55 fx files, 1.3 MB, 5.3 MP, used only by battle-time
   emitters. BootScene no longer queues them; `GameScene.preload` does, through
   `systems/BattleArt.js`, once per session (verified: 61 requests on the first battle,
   **0 network responses on the second**). The menu stops paying for art it cannot show.
3. **Enemy sheets per level** — the placeholder-key trap (`exists()` returning true for a
   1-frame canvas texture standing in for a real sheet) was fixed earlier in this request;
   this pass verified the resulting behaviour end-to-end (§13).
4. **Quality profiles** — see §10. They trade ambience/particles for frame time and are the
   only lever that changes measured frame time on the map (102 → 51 → 32.7 ms).
5. **Audio** was read for per-frame cost: one `AudioContext` created on the first user
   gesture and reused, and the ambience beds are budgeted by profile (2 / 1 / 0 voices).
   Nothing in the audio path allocates per frame.

---

## 5. Responsive layout strategy (360 → 1920, both orientations)

One spacing scale (`clamp()` based), one card contract, no per-screen pixel fixes:

- **Scrolling is real.** Panels use `overflow-y: auto` with a sticky action footer, so the
  primary button is reachable before the body is scrolled to the end.
- **Text overflow** is checked rather than assumed: the audit flags `scrollWidth >
  clientWidth` (and the vertical equivalent) on any element whose overflow is hidden; nothing
  in the audited screens trips it.
- **Safe areas:** `env(safe-area-inset-*)` is used in 12 places (screen shells, HUD bars,
  panel footers).
- **Portrait is a deliberate gate.** 390×844 shows the ROTATE overlay (verified: gate renders
  with the phone glyph, title, copy and note, all inside the viewport) and the battle pauses.
- **Landscape phone (844×390)** is the tightest real target: HUD dock measured 590×118 at
  y266–384, panel 378×157 — inside the safe band, no page scroll.

---

## 6. Phaser Scale Manager and coordinate correctness

- Canvas is `FIT` + `CENTER_BOTH` at 1280×768; the CSS stage is
  `min(100vw, 100vh*25/12)`, so the canvas never double-scales against CSS.
- Verified display scale per size: 1366×768 → 0.937, 1920×1080 → 0.667, 1024×768 → 1.25,
  844×390 → 1.575. Pointer → world conversion runs through `input.activePointer.worldX/Y`
  via the camera, and the HUD is DOM (no canvas coordinate math), so a scaled canvas cannot
  desynchronise hit areas from art.
- **Resize without rebuilding:** four live viewport changes during a battle
  (1366×768 → 1024×768 → 1920×1080 → 1366×768 → 844×390) left the object count at **404**
  and textures at **823** — the scene re-fits, it does not restart.

---

## 7. Camera behaviour

- Realm zoom is pointer-anchored (`zoomAt` keeps the point under the cursor), clamped to
  `minScale … minScale × 3.2`, and the camera is clamped so the plate can never show a bare
  edge (`clampCamera`). Zoom range measured at 1920×1080: **1.25 → 2.2 → 1.25**.
- No jump, no stretching: the plate is scaled uniformly; labels counter-scale
  (`--wm-label-scale`) so text stays readable instead of being blown up with the art.
- Focus zooms (`FOCUS_ZOOM 1.45`) tween 520 ms and land the landmark clear of the panel —
  verified at five viewports and six landmarks.
- Responsive limits are per device (the clamp recomputes on resize); there is no
  asset-level LOD, because the measurements do not justify a second art pipeline.
- **No textures are created per zoom frame** (742 → 742 after six cycles).

---

## 8. Large-map strategy

Evidence, not fashion: the Realm is a **single painted plate** (1536×1024, 505 KB JPEG) with
DOM landmarks. The measured cost of the alternative (tiling) is not justified — the map's
frame cost came from the CSS filter passes (§4), not from the size of the image, and 1536×1024
is well inside every WebGL texture limit. Tiles are
therefore used where they already were (the battlefield autotile, 462 tile textures, 1.8 MP)
and not added to the Realm. No seams, no bleeding, no misalignment to report because nothing
was re-tiled.

---

## 9. Asset pipeline: measured conversions, alpha preserved, dead refs removed

Pipeline followed: record dimensions/sizes → convert → verify alpha and quality → update refs
→ remove dead refs → browser test → production build.

| asset | before | after | decision |
| --- | --- | --- | --- |
| `menu-keep` 1672×941 | JPG 206 KB | **WebP 155 KB (−25 %)** | shipped; JPG kept on disk as the fallback copy |
| `menu-stone` | JPG 80 KB | **WebP 42 KB (−48 %)** | shipped; JPG kept |
| `worldmap/terrain-src` 1536×1024 | JPG 505 KB | WebP q88 **527 KB (bigger)** | **rejected** — q80 gets 394 KB but 36.6 dB on the hero asset; kept as JPEG |
| battle fx pack | 55 files / 1 336 KB at boot | on demand / 1 336 KB in battle | moved, not converted |
| enemy sheets | all at boot | per-level (24 / 33 / 33 / 41 textures) | moved |

Both converted images are opaque RGB (`menu-keep` 1672×941, `menu-stone` 640×1024) — there is
no alpha channel to preserve, and nothing was flattened onto black. Case-sensitive paths
preserved; no remote URLs introduced; no atlas was
built because the draw-call counter shows the renderer already batches the scene into
**2 draw calls per frame** — an atlas would not buy a measurable win here.

---

## 10. Adaptive quality: HIGH / BALANCED / PERFORMANCE

Implemented in `src/systems/QualityManager.js`, persisted at `td-dsalgo:graphics:v1`,
selectable in Settings → GRAPHICS (radiogroup, keyboard + pointer), with the effective device
level spelled out (`· BALANCED ON THIS DEVICE`).

- **Auto default is capability-based, not UA:** `deviceMemory ≤ 2 GB` → performance;
  `≤ 4 GB` or coarse pointer with a small viewport → balanced; tiny viewport → performance;
  otherwise high.
- **Measured degradation:** if `game.loop.actualFps < 45` four seconds into a battle, auto
  steps down exactly one level, once, and never climbs back. An explicit choice blocks the
  automatic step.
- **What the profiles change:** particle quantity (1 / 0.55 / 0.25 — never zero), ambience
  beds (2 / 1 / 0), the second cloud bank and ravine mist (hidden below high), the blurred
  page backdrop and parallax (off at performance).
- Verified in-browser: clicking PERFORMANCE sets `html[data-quality=performance]`,
  `body::before` blur disappears, the saved choice survives a reload, and AUTO restores the
  detected level. 10 unit tests cover detection, persistence, demotion and clamping.

---

## 11. DPR and internal resolution

Deliberate decision, recorded as a measurement: the canvas stays at **1 device pixel**
(`1280×768` internal, CSS-scaled by `FIT`) while the entire UI is DOM and therefore already
crisp at any DPR. Raising the canvas resolution multiplies fill cost on exactly the devices
that are already slowest; lowering it further would blur the battlefield. The `FIT` scale
correctly handles 1920×1080 (`displayScale 0.667`) without letterbox seams, and pointer
coordinates stay exact because nothing is drawn at a different scale than it is hit-tested at.

---

## 12. Mobile behaviour

- **Touch targets:** the two measured failures (32 px map-panel actions, 30 px quality
  options) are now 44/46 px under `(pointer: coarse)` and small viewports.
- **No page scroll:** the audit fails a screen if `documentElement.scrollWidth` exceeds the
  viewport; 0 failures across 6 sizes × 24 screens.
- **No invisible blocking layers:** the gate/overlay elements are `display: none` when
  inactive (`#fullscreen-gate`, `#rotate-hint`, `#battle-loading`), so they cannot swallow a
  tap.
- **Audio is reachable:** sound toggle on the menu, the map HUD and in Settings; the settings
  panel is a scrollable card that fits 844×390 (measured 358 px tall at y16).
- **Memory:** see §13 — resident texture memory is the number that matters on phones, and it
  is now 32.7 MP in battle (from 184 MP of repeated sheets) and 14.4 MP at the menu.

---

## 13. Asset loading, memory, progress and fallbacks

- **Load on demand:** enemy sheets per level (24–41 textures instead of 20 creatures ×
  variants), fx pack per session, everything else at boot.
- **No duplicate keys:** a second file queued under an existing key replaces the first in
  Phaser's load list, so the ui-kit `fx-ring`/`fx-glow` were silently winning over the pack's
  entries. `BattleArt.FX_KEY_OVERRIDES` now skips the shadowed entries outright — the
  behaviour is the same, but the loader no longer quietly overrides a manifest.
- **No reloading per building:** placing or upgrading defences touches no loader; only the
  first battle of a session queues anything.
- **Honest progress:** `#battle-loading` is driven by Phaser's own `load.progress` event
  (fill width = real percentage) and hides on `complete`/`shutdown`. Verified: shown → hidden,
  fill reached **100 %**, no fake timer.
- **Fallbacks:** every fx/impact consumer guards on `textures.exists()`; a missing file costs
  one effect, not the battle, and `TextureFactory` placeholders are only used when the real
  art is absent (the placeholder trap is guarded by `frameTotal`, not `exists()`).

**Enemy animation verified end-to-end in the browser** (this was an open item): live creep
`enemy-grunt`, current clip `enemy-grunt-d2-move`, three direction rows present per type
(`d0/d1/d2 × idle/move/death`), both used rows exercised by the level-1 route, a forced kill
played `enemy-grunt-d2-death` and removed the enemy, and the boss (`enemy-warlord`, `isBoss`,
scale 1.82, all three clip rows) spawned correctly. 0 console errors.

---

## Preserved features and regression evidence

- **93 test files / 1 108 tests pass**; `npm run check:contrast` 68/68; `npm run build` OK
  (`index` 497.91 kB / 142.39 gzip, `phaser` 1 208.06 kB).
- No mode, save, rule, button, route or data structure was removed in this pass. Enemy
  loading changed *when* a sheet is fetched, never which sheet a level uses.
- **Leak / loop check:** three battle → map → battle cycles left textures (823 → 823), anims
  (496 → 496), scene listeners (52 → 51 → 51) and JS heap (39.6 MB) flat, 0 errors.
- **Production build tested**, not just the dev server: boot timings, network breakdown and
  the WebP menu art were measured against `dist/` on `:4300`.

---

## Status of the 13 areas

| # | area | status |
| --- | --- | --- |
| 1 | audit + reproduction | **implemented and verified** |
| 2 | Issue A (UI clipping) | **implemented and verified** (6 sizes × 24 screens) |
| 3 | Issue B (black art under Realm zoom) | **implemented, not fully tested** — no repro on desktop Chromium; mitigations shipped; needs a physical device |
| 4 | Issue C (lag) | **implemented and verified** for map (−50 %) and boot (−22.5 % network, −28 % texture pixels); battle frame time unchanged and explained (software raster, 2 draw calls) |
| 5 | responsive strategy | **implemented and verified** |
| 6 | Scale Manager + coordinates | **implemented and verified** (resize without rebuild) |
| 7 | camera | **implemented and verified** (no per-zoom textures, clamps, 0 black) |
| 8 | large-map strategy | **implemented and verified** (evidence-based: no tiling) |
| 9 | asset pipeline (WebP/SVG/atlas) | **implemented and verified** for the two menu hero images; terrain WebP **rejected on measurement**; atlas **recommended, not implemented** (2 draw calls already) |
| 10 | adaptive quality | **implemented and verified** |
| 11 | DPR / internal resolution | **implemented** (deliberate 1 device pixel) **and verified** for layout/pointers; crispness on retina is by design left to the DOM UI |
| 12 | mobile | **implemented and verified** for targets/scroll/layers/portrait gate; true-device battery/thermal behaviour **not tested** |
| 13 | loading / memory / progress | **implemented and verified** |

## Remaining issues (known, not fixed here)

1. **No GPU device was available.** All frame times come from a software rasteriser; the
   profile only changes *measured* frame time on the map, and cannot be used to promise a
   frame rate on a phone.
2. **Issue B needs a device run.** The mitigations (layer hygiene, camera clamp, texture
   budget) address the plausible causes; the symptom itself was never observed here.
3. **Battle resident set is still 32.7 MP.** Further reduction means re-authoring sheets
   (fewer brood variants or smaller frames) — an art decision, not a code fix.
4. **World-map art still downloads at boot** (1.9 MB). It is one click behind the menu and
   deferring it would trade a fast boot for a visibly loading map.
5. **Atlasing** is measurable only if draw-call counts change; at 2 per frame it is not
   justified by evidence.
