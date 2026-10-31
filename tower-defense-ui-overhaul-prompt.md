# MASTER PROMPT: Tower Defense UI/UX Overhaul ("feels like a real game")

## 0. ROLE AND GOAL

You are a senior game UI/UX engineer and technical artist. Overhaul the UI/UX of my
browser tower defense game so that a first-time player thinks "this looks like a real,
polished indie game" within 10 seconds, and gets small moments of delight every minute
after that.

"Realistic" here means *professional and believable as a commercial game*, NOT photorealism.
Photorealism would clash with the 2D Kenney/cozy-ui art. Aim for the polish level of
Kingdom Rush / Bloons / Plants vs. Zombies: clear, juicy, cohesive.

## 1. PROJECT CONTEXT (read the code before changing anything)

- Stack: Phaser 3.90 + Vite 7 + vanilla JS (ES modules). Tests live in /tests.
- Canvas: 1280x768 (20x12 tiles of 64px), Phaser Scale.FIT, pixelArt: true, roundPixels: true.
- UI is a DOM layer over the canvas. Key files:
  - index.html: main menu overlay, How-to-Play modal, Credits modal (lots of inline styles)
  - src/style.css: all styling. Panels use `border-image` with the cozy-ui wood assets
    in public/assets/cozy-ui/. CSS variables already exist (--gold-primary, --cyan-primary,
    --font-heading: Cinzel, --font-body: Rajdhani, etc.)
  - src/ui/HUD.js: top bar, boss banner, toast, tower inspector, bottom build dock
  - src/ui/LeaderboardUI.js, src/ui/StatisticsPanel.js: Hall of Champions and Algorithm Codex
  - src/scenes/BootScene.js, MenuScene.js, GameScene.js
  - src/entities/Enemy.js, Tower.js, Projectile.js: sprites, HP bars, damage text, tweens
  - src/rendering/AudioSynth.js (Web Audio synth + Kenney sounds), TextureFactory.js
- Art: Kenney CC0 packs, cozy-ui wood panels, 64px pixel-art towers, tile-based road.

## 2. NON-NEGOTIABLE CONSTRAINTS

1. Do NOT change gameplay logic or balance. Do not touch src/dsa/, src/systems/, src/data/
   (except reading them). This is a DSA course project: the Circular Queue, Adjacency-List
   Graph, BFS, Merge Sort and Linear Search must stay exactly as they are.
2. Keep all hotkeys: 1-4 select build, Space start wave/pause, Esc cancel.
3. `npm test` must pass before and after every phase.
4. No new heavy dependencies. Use only CC0 / CC-BY assets and add credits for anything new.
   Prefer procedural effects (Phaser tweens, particles, postFX) over new image files.
5. Keep the cozy medieval identity (wood panels, gold accents, Cinzel headings).
6. Ask me BEFORE any change that alters gameplay, map coordinates or scoring.
7. Work in small, reviewable phases. After each phase: run the game, capture screenshots,
   list changed files and why. Never rewrite whole files when a targeted edit works.

## 3. CURRENT-STATE AUDIT (verified by running the game at 1280x768)

Fix these exact problems:

A. Top bar overflows: the MENU button is clipped at the right edge. The bar is ~140px tall
   (18% of the screen), covers map row 0 and part of the road, and "0 Enemies Left" wraps
   onto 3 lines.
B. The bottom "FORGE DEFENSES" dock sits over the bottom road, so enemies disappear
   under it where the player cannot see them.
C. Panels with `border-image` also have `box-shadow`, which draws a hard rectangle
   behind the transparent rounded corners (dark/green squares around the top bar and
   dock). Replace with `filter: drop-shadow(...)`.
D. Tower inspector uses a BLUE container (ContainerAdvanced4) inside a brown wood UI,
   is fixed on the right edge, and covers the base crystal. "UPGRADE ( • 55 )" is
   misaligned and the stat cells look cramped.
E. Main menu is a flat salmon card on an empty navy background: no logo art, no scene,
   and "HALL OF CHAMPIONS" wraps onto two lines.
F. Enemy HP bars are 3px tall, hard to read, and there are no ground shadows under units.
G. UI text mixes emoji (⚔️ 💀 🏆 ⚡ ⚠️) with pixel-art icons. Choose one icon style.
H. BUG: GameScene.js calls hud.showBossBar() / hideBossBar(), but HUD.js defines
   showBossBanner() / hideBossBanner(). The boss banner never appears and the call
   throws when a boss spawns. Align the names everywhere (GameScene lines ~209, 222,
   249, 266, 523, 537, 636).
I. BUG: Enemy.js death handler hides `healthBarBg/healthBarFill`, but the fields are named
   `hpBarBg/hpBarFill`, so the bars stay visible during the death animation.
J. The DOM HUD is fixed-size while the canvas scales with FIT, so on smaller windows the
   HUD and canvas drift apart and overflow.
K. index.html and HUD.js contain many inline `style="..."` attributes. Move them to
   named CSS classes.

## 4. DESIGN SYSTEM (create this first, then use it everywhere)

Define in :root and refactor existing CSS to use it:

- Spacing scale: 4 / 8 / 12 / 16 / 24 / 32 px.
- Radius: 6 / 10 / 14 px (use sparingly; border-image panels keep their own corners).
- Outline: 2px dark brown (#1b0a02) text-stroke style for all game text over art.
- Shadows: ONE style only: `drop-shadow(0 4px 0 rgba(0,0,0,.35))` for panels,
  `drop-shadow(0 0 12px <glow>)` for glowing elements.
- Palette: keep the existing variables; add semantic tokens: --hp-good, --hp-warn,
  --hp-bad, --gold, --mana/frost, --danger, --success, --panel-wood, --panel-parchment.
- Typography: Cinzel for titles and panel headings only; Rajdhani (or a similar clean
  rounded font) for numbers and labels; minimum 14px for any text; numerals use
  `font-variant-numeric: tabular-nums` so counters do not jitter.
- Icons: one set only (the existing pixel icons + Kenney Game Icons). Replace all emoji.
- Motion tokens: --t-fast 120ms, --t-med 200ms, --t-slow 350ms;
  easings: ease-out for entrances, ease-in for exits, a back-out overshoot
  (cubic-bezier(.18,.89,.32,1.28)) for "pop" moments. Nothing appears or disappears
  instantly.
- Every interactive element has hover, pressed, disabled and keyboard-focus states and
  plays a UI sound (hover tick, click, denied).

## 5. PHASES (do them in order; stop after each and show screenshots)

### PHASE 0: Baseline
- `npm install`, `npm test`, run the dev server, capture screenshots of: menu, empty
  map, build selected with ghost, mid-wave, tower inspector, game over, victory, codex,
  leaderboard, how-to-play. Save them in /docs/ui-before/.
- Write a short list of anything else you notice that is not listed in section 3.

### PHASE 1: Bugs and layout foundation
1. Fix bugs H and I. Fix frame artifacts (C). Move inline styles to classes (K).
2. Slim the top bar to 56px max with three zones:
   - Left: Base HP (heart icon + segmented/fill bar + "20/20"), Gold (coin + number),
     Score.
   - Center: wave pill "WAVE 3 / 6" on ONE line, an enemies-remaining progress bar,
     and the START WAVE button (states: Ready = gold pulse, Spawning = disabled with
     "In progress", Cleared = brief green check).
   - Right: icon-only round buttons: speed (1x/2x pill), pause, sound, settings/menu,
     each with a tooltip. Move CODEX into the pause/settings menu.
3. Stop the dock from hiding the playfield. PREFERRED: reserve dedicated HUD bands
   outside the map (e.g. top 56px + bottom 88px) by growing the canvas height and
   adding a MAP_OFFSET_Y. Centralize all conversions in two helpers
   (tileToWorld / worldToTile) and update pointer-to-tile, ghost, range ring, BFS
   visualizer, portal/base placement and enemy path coordinates. ASK ME FIRST before
   changing coordinates. FALLBACK: a compact translucent dock (max 84px tall) that
   never covers a road or buildable tile.
4. Make the dock compact: 4 cards ~76x84px (icon, hotkey badge, cost). Selected card
   lifts and glows. Unaffordable cards show a red cost and shake on click with a
   "denied" sound. Add a hover tooltip card: name, description, damage, range, speed,
   cost.
5. Scale the whole UI with the canvas: compute one scale factor from the window size
   and apply it to the #app wrapper (CSS transform) so DOM and canvas stay aligned.
   Verify clicks still map to the correct tiles at several window sizes. Add a compact
   mode below ~1100px width.
Acceptance: nothing clips or overlaps at 1280x768 and 1024x640; no road/build tile is
hidden; the boss banner shows; tests pass.

### PHASE 2: Tower inspector, panels and modals
1. Inspector uses the wood theme, appears as a popover anchored beside the selected
   tower (auto-flip to stay on screen), with a small pointer arrow. It never covers the
   base crystal or the path being defended.
2. Show upgrade previews with green deltas ("Damage 15 -> 22", "Range 150 -> 165").
   Specialization choices appear as two clear cards with icon, cost, and one-line
   perk. Fix coin+cost alignment (inline-flex, tabular numbers).
3. Targeting priority as a segmented control with the active option clearly lit.
4. Restyle How-to-Play, Credits, Codex and Leaderboard to one consistent modal system:
   header with icon, close button, scrollable body, sticky footer. How-to-Play becomes
   tabs (Goal / Towers / Algorithms / Hotkeys) with tower art and key-cap graphics.
5. Modals animate in (fade + scale 0.96 -> 1, 200ms) and out, trap focus, and close on
   Esc and overlay click where safe.

### PHASE 3: Main menu and scene transitions
1. Loading screen: progress bar, spinning portal icon, rotating "Tip:" line. No blank
   flash between scenes.
2. Menu is full-screen, not a small card. Background is a living diorama of the real
   map: slow parallax/camera drift, a few towers firing at looping enemies, portal swirl,
   crystal glow, drifting embers/fireflies, soft light rays, cloud shadows.
3. Logo treatment: title drops in letter by letter, a single gold shine sweeps across,
   then a gentle idle glow. Subtitle fades in. Buttons enter with a staggered slide.
   Labels never wrap (set min-width and font-size accordingly). Footer: version,
   credits link.
4. Hover = lift + glow + tick sound. Menu music ducks when a modal opens.
5. All scene changes use a fade or iris wipe (250-400ms).

### PHASE 4: Core game feel ("juice")
Strong feedback for important events, quiet for frequent ones.
- Wave start: "WAVE 3 - The Swarm" banner that sweeps in and out; portal pulses.
- Enemies: 6px HP bars with dark border and rounded ends, shown only after damage,
  smoothly lerped with a trailing "chip damage" segment; white hit flash (80ms);
  soft ground shadow; subtle walk bob; death poof with small particles.
- Floating damage numbers: larger and gold for crits, gray for armored hits, with a
  tiny hit-stop (30-50ms) on crits only.
- Gold: floating "+8" on kill, a coin that arcs to the Gold counter, and a counter
  count-up with a small scale bounce.
- Base hit: red edge vignette flash, heart icon shake, HP bar chip-damage effect,
  camera shake scaled to damage.
- Towers: placement pop (squash/stretch) with dust puff and sound, upgrade shine ring
  and sparkles, sell coin burst, muzzle flash, ground shadow under every tower.
- Placement: tile hover highlight, green/red ghost, and a reason tooltip when invalid
  (e.g. "Can't block the only path"). Show grid lines only while a build is selected.
- Boss intro: letterbox bars, brief camera zoom, boss banner with name, phase badge
  and a shield/HP bar. Phase change = shockwave + shake + sting. Killing blow = 0.4s
  slow motion then a gold burst.
- Status effects are readable on enemies: frost tint and ice crystals, armor-break
  cracks, shield bubble.

### PHASE 5: Atmosphere and lighting
- Use Phaser postFX (bloom, vignette, color matrix) instead of extra libraries.
- Bloom only on glowing things (crystal, portal, frost, lightning).
- Per-wave mood tint: daylight early, golden hour mid-game, red-purple dusk for the
  boss wave; cross-fade between them.
- One consistent light direction for all shadows. Light vignette and very subtle grain.
- Base crystal glow dims and flickers red as HP drops below 25%.
- Gentle foliage sway and water shimmer. Optional light rain/leaves/fog per wave that
  never hides gameplay information.

### PHASE 6: Progression, reward and onboarding
- Combo streak "x5" with rising pitch; wave-clear banner with bonus gold flying to the
  counter and a short summary (kills, leaks, time); "FLAWLESS" stamp for zero leaks.
- Victory/Defeat screens: animated panel, 1-3 star rating (by remaining base HP) with
  star pop animations, count-up of score and kills, primary action (Retry / Next) and
  secondary (Menu). Leaderboard entry form uses the same modal system.
- Achievements with animated toasts ("First Blood", "Frozen Solid", "Untouchable"),
  saved in localStorage and shown in Hall of Champions.
- 60-second skippable first-run tutorial: dim the screen, highlight the dock, then a
  tile, then START WAVE, with a pulsing arrow. Shown once.
- "Next wave preview" with enemy icons and counts. Contextual hints (e.g. unused gold
  for 20s -> "Upgrade a tower!"). Enemy hover card: name, HP, speed, weakness.
- Cursor states: normal, build, invalid, sell.

### PHASE 7: Audio and settings
- Pause menu on Esc: Resume, Restart, Settings, Codex, Quit (with confirmation).
- Settings: master / music / SFX sliders, Visual Effects quality (High / Low / Off),
  screen shake on/off, damage numbers on/off, colorblind-friendly mode. Persist them.
- Adaptive music: calm loop between waves, extra layer during waves, intense layer
  during boss fights, crossfaded. Pitch variation on repeated SFX, a cap on
  simultaneous sounds, left/right pan by screen X, low-health alarm under 25% HP.

### PHASE 8: Accessibility, performance, QA
- Respect prefers-reduced-motion (disable shake, bloom pulses, parallax).
- Never rely on color alone: HP states also use icons/shapes. Contrast >= 4.5:1 for text.
  Visible keyboard focus. All controls reachable by keyboard.
- Optional touch support: tap to place, tap to inspect, large hit areas (>=44px).
- Performance budget: 60 FPS on a mid-range laptop; pool particles and damage-text
  objects; no per-frame DOM writes unless a value changed; add an F3 debug overlay
  (FPS, object counts). Fix anything under 55 FPS.
- Final QA: test at 1280x768, 1024x640 and 1920x1080; play all 6 waves including the
  boss; verify pause, speed 2x, sell, upgrade, restart, and return to menu all leave
  no stuck overlays or leaked listeners.

## 6. ASK ME FIRST (these change gameplay or structure)
Active abilities (Meteor Strike, Freeze Field), difficulty levels, endless mode,
multi-stage level select, changing canvas size / map offsets, or anything that alters
tower stats, wave data, scoring or the DSA code.

## 7. DELIVERABLES AND PROCESS
For each phase deliver: (1) the code changes, (2) before/after screenshots at
1280x768 (and 1024x640 where relevant), (3) a short list of changed files and why,
(4) `npm test` result, (5) any risks or follow-ups. Do not start the next phase until I
approve the current one. If something is ambiguous, pick the simplest option that matches
the design system above and tell me what you assumed.
