# Rekomendasyon para sa laro — comparison at mga ideya

Petsa: 2026-10-28
Saklaw: paghahambing ng **ating** build laban sa mga kilalang tower defense, at mga ideyang
angkop sa umiiral na arkitektura. **Walang** binago sa gameplay sa dokumentong ito — plano
at ebidensya lang.

> Ang lahat ng numero tungkol sa laro ay binilang mula sa source (`src/data/*`, `grep`,
> `node -e` import) at sa isang aktwal na page load sa `vite preview`. Ang mga numero
> tungkol sa ibang laro ay galing sa mga sanggunian sa dulo — hindi haka-haka.

---

## 0. Status (2026-10-28)

| Ano | Kalagayan |
|---|---|
| **Mode roster 8 → 4** | **SHIPPED** (`b49140d`). Anomaly Waves, Ascension, Time Attack, Contract Board — retired. |
| **P2 offline shell** | **SHIPPED** (`3814c86`). Service worker + install offer. |
| **P3 coach marks** | **SHIPPED** (`3814c86`). Tatlong linya sa unang laban. |
| **P1 global leaderboard** | **Premisa ko ay mali** — meron nang THE REALM na Supabase-backed. Tingnan ang §5 P1. |

### Ano ang natanggal at bakit

| Mode | Dahilan |
|---|---|
| ANOMALY WAVES | Binabago ang parehong run-long numbers na binabago ng draft |
| ASCENSION | Endless na may cash-out; tanong na sinasagot na ng Endless |
| TIME ATTACK | 3-minutong score sprint — Titan Rush (4 min) na ang gumagawa niyon |
| CONTRACT BOARD | Tatlong objective = sinasagot na ng daily modifier + achievements |

Bunga: `ALL_LEVELS` **12 → 8**, boards **11 → 7**, `anomalies.js` at ang anomaly/ascension
na bahagi ng `RunMods` ay wala na, at ang Time Attack clock sa HUD ay tanggal kasama ang CSS.
**Walang score na nawala:** lahat ng retired spelling ay naka-map sa UNFILED board, kaya
nananatiling mababasa ang mga lumang run.

---

## 1. TL;DR — ang natitirang tatlo

| # | Ideya | Bakit ito muna | Hirap |
|---|-------|----------------|-------|
| **P1′** | **Per-seed daily board** (hindi "global leaderboard" — meron na) | Seeded daily na pantay sa lahat, pero ang resulta ay napupunta lang sa local hall | M (2–3 araw) |
| **P4** | Shareable seed link + result card | Web-native na bentahe; kailangan lang ng P1′ para may saysay | S |
| **P5** | Run summary / "build story" | 29 card, 21 tore, 2 spec — walang nagsasabi kung bakit nanalo | S–M |

Ang natitira (P6–P8) ay nasa §5.

---

## 2. Ano ang meron na tayo (binilang, hindi hinulaan)

| Bahagi | Bilang | Pinagmulan |
|---|---|---|
| Campaign levels | **5** (Verdant → Ashen), 7–10 wave bawat isa | `LEVELS` sa `src/data/levelData.js` |
| Playable level defs | **8** (`ALL_LEVELS`: 5 campaign + endless + titan + rogue) | `ALL_LEVELS` |
| Run modes | **4** (`rogue`, `titan`, `blueprint`, `coop`) — 8 noong isinulat ang doc na ito | `modeData.js` |
| Sariling mapa ng modes | **2** na ginagamit (blackfen, ash-throne); dune = PvP arena | `modeData.map` |
| PvP arenas | **3** (Cinder Crown, Frostspine, Dust Meridian) na may sariling tiles | `pvpArenas.js` |
| Blueprint puzzles | **6** (nakasulat sa card: *"NINE BOARDS"*) | `puzzles.js` |
| Tore / upgrade | **21** base, L1–L2 + **2 specialization** (spec-a / spec-b) patungong L5 | `towerData.js` |
| Heroes / relics / pets | 12 hero skills, 6 relics (3–2 level), 11 pets | `heroData.js`, `relics.js`, `petData.js` |
| Draft cards / anomalies / achievements | 29 / 9 / 26 | `draftCards.js`, `anomalies.js`, `achievements.js` |
| Systems | 41 modules | `src/systems/` |
| Daily challenge | Seeded (`seedForDay`), **pareho sa lahat ng player**, may modifier | `DailyChallenge.js` |
| Leaderboard | **localStorage lang** (per browser) | `Leaderboard.js` L13 |
| Online PvP | Meron — `LOCAL` (tab) at `RELAY` (+ room code) | `net/transports.js`, `net/PvpRoom.js` |
| Cloud save | Supabase (`players`, `progress`, `player_achievements`) | `supabase/migrations/0001_cloud_save.sql` |
| PWA | May `manifest.webmanifest` (fullscreen, landscape) — **walang service worker** | `public/manifest.webmanifest` |
| Tutorial / first-run state | **Wala** (camera hint lang ang meron) | `grep firstRun|tutorial` = 0 |

**Konklusyon sa §2:** ang nilalaman ay **malawak na para sa isang indie TD** — 12 level defs,
8 mode, 21 tore na may branch, 3 arena, PvP na may relay. Hindi nilalaman ang pinakamalaking
butas. **Ang butas ay ang *payoff* (competition), ang *unang minuto* (onboarding), at ang
*pagdating* (web delivery).**

---

## 3. Paghahambing sa ibang laro

### 3.1 Talaan

| Aspeto | Tayo | BTD6 | Kingdom Rush | Defense Grid | Rogue Tower | Dungeon Warfare 2 | Legion TD 2 |
|---|---|---|---|---|---|---|---|
| Bilang ng mapa | 12 defs + 3 arena | dose-dosenang | 20+ | isang campaign (~8 oras) | procedural, lumalaki ang path | 60+ + procedural | 1v1/2v2 lanes |
| Upgrade depth | L1–2 + 2 specs → L5 | 3 path × maraming tier | 2–3 tier + star | 3 tier | 400+ card | 33 trap × 8 trait | unit synergy |
| Meta progression | **relics + heroes + pets + achievements** | monkey knowledge, hero XP | **star upgrade + hero level** | challenge modes | unlocks per run | traits | W/L rank |
| Run length | 8–12 min (level) | 10–40 min | 5–15 min | 20–30 min | 20–30 min | 20–40 min | 20–35 min |
| Daily / weekly | **seeded daily** | events, quests | — | — | — | — | seasons |
| **Global ranking** | ❌ local lang | ✅ | partial | ✅ | — | ✅ | ✅ ranked |
| Online play | ✅ relay PvP + co-op | ✅ 4P co-op | ❌ | ❌ | ❌ | ❌ | ✅ ranked 2v2/4v4 |
| Onboarding | ❌ walang tutorial | ✅ mahusay | ✅ mahusay | ✅ | ✅ | ✅ | ✅ |
| Unang load (web) | **921 req / 4.06 MB** | native app | native app | native | native | native | native |
| Sariling identity | **DSA codex** (BFS / merge sort / queue) | bloon lore | fantasy | sci-fi | roguelite | traps | auto-battler |

### 3.2 Saan tayo lamang, saan tayo kulang

**Malakas tayo (huwag nang galawin):**
- **Breadth per session:** 8 mode sa unang araw — mas marami kaysa BTD6 noong launch.
- **Upgrade structure:** may branching spec na (BTD6-level na ideya) — *huwag nang magdagdag
  ng pangatlong meta currency* (relics + heroes + pets ay sapat na).
- **Session length:** 8–12 min bawat level — sakto sa web. Mas mahaba pa ay nagsasara ng tab.
- **PvP na may relay** — kakaunti ang browser TD na may tunay na laban.
- **DSA codex** — walang katapat nito sa mga commercial TD. Ito ang tanging bagay na
  hindi kayang kopyahin ng kalaban.

**Kulang tayo (ayon sa benchmark ng genre):**
1. **Competition payoff.** Seeded daily na "pareho sa lahat" pero walang pinagsasaluhan —
   walang saysay ang pagiging patas kung walang ranggo. (Benchmark ng browser games:
   "shared competition is the engine that grows the field".)
2. **Unang 60 segundo.** Fullscreen gate → name gate → menu → world map na may 13
   destinasyon bago ang unang tore. Benchmark: tutorial completion >80 %, D1 35–45 %.
3. **Pagdating (web).** 921 requests / 4.06 MB *sa localhost pa lang* — walang network
   latency doon. Sa 4G, mas malala. Wala ring service worker → bawat balik ay malamig.
4. **Legibilidad ng run.** 29 draft card, 21 tore, 2 spec — pero walang run summary na
   nagsasabi kung *bakit* nanalo o natalo. Mahirap matuto, mahirap i-share.

**Sobrang dami (bawasan ang tukso):**
- 8 mode + 21 tore sa harap ng bagong player = **paradox of choice**. Hindi kailangang
  tanggalin — kailangan lang **hindi lahat sabay bukas**.

---

## 4. Sinukat: ang tunay na gastos ng unang load

Pamamaraan: production build (`vite preview`, :4320), Chromium 153 + SwiftShader,
viewport 844×390 @ DPR 3, **cache off**, tracing ng `content-length` per response.

| Yugto | Requests | Transfer | Oras (localhost) |
|---|---|---|---|
| Hanggang name gate | 568 | — | **3.5 s** (FCP 200 ms) |
| Hanggang main menu | **921** | **4.06 MB** | **7.0–7.4 s** |
| Menu → laban (level-1) | +93 | +0.06 MB | 1.1 s (HUD visible) |

Pinakamalaking pinagmumulan: **`assets/tiles` = 259 requests para sa 0.3 MB** (516 na
0.6 KB-ish na PNG sa `public/assets/tiles`). Purong request overhead — hindi payload.

**Dagdag na obserbasyon:** `dist/` = 43 MB (29.2 MB PNG sa 1 576 file, 5.3 MB OGG).
Mabuti't per-level ang loading (93 request lang ang laban), pero ang **menu pa lang** ay
4 MB. Ito ang pinakamalaking "libreng" panalo sa buong listahan: walang gameplay na
gagalawin, at **nasusukat** ang resulta.

### 4.1 Pagkatapos ng P2 (service worker)

| | Unang bisita | Ikalawang bisita |
|---|---|---|
| Asset response mula sa worker | 0 / 303 | **339 / 339** |
| Runtime error | 0 | 0 |

### 4.2 Pagkatapos ng P3 (coach mark)

Sa 844×390 DPR 3, ang unang laban ay may bar sa ilalim ng top bar: *"Tap BUILD, pick a
defence, then tap the ground to raise it"*. Nasa DOM (`display: flex`) at nasa ibabaw
(`elementFromPoint` = `camera-hint-text`) — nag-render, hindi lang basta umiiral ang handler.

---

## 5. Mga ideya, naka-rank

| Rank | Ideya | Halaga | Hirap | Risk | Depende |
|---|---|---|---|---|---|
| **P1** | Global leaderboard (daily, endless, per-mode) | ⭐⭐⭐⭐⭐ | M | mababa | Supabase (meron na) |
| **P2** | Tile atlas + service worker + install prompt | ⭐⭐⭐⭐ | S | mababa | — |
| **P3** | Coach marks sa unang laban | ⭐⭐⭐⭐ | S | mababa | — |
| **P4** | Shareable seed link + result card | ⭐⭐⭐⭐ | S | mababa | P1 (para may saysay) |
| **P5** | Run summary / "build story" | ⭐⭐⭐ | S–M | mababa | — |
| **P6** | `Veteran` tier per campaign map (fixed restrictions) | ⭐⭐⭐ | M | katamtaman | balance pass |
| **P7** | Ghost/replay ng #1 daily run | ⭐⭐⭐⭐ | L | katamtaman | P1 + determinism |
| **P8** | Codex Challenge (DSA puzzle of the day) | ⭐⭐⭐ | S–M | mababa | — (natatangi) |

### P1′ — Per-seed daily board *(pinaliit at itinama)*

**Correction, 2026-10-28:** mali ang unang bersyon ng seksyong ito. **Meron nang global
leaderboard**: `CloudSave.js` ay may `leaderboard_page` at `my_rank`, at ang Hall ay may
tab na **THE REALM** na nagbabasa nito mula sa Supabase (`LeaderboardUI` L116–119), kasama
ang `server/cloud-dev.mjs` na stand-in para sa lokal na pagsubok. Ang totoong kulang ay
mas makitid: ang realm board ay **isang listahan ng "power"**, kaya ang isang daily run —
na **pareho ang seed sa lahat** — ay walang board na naghahambing ng *parehong laban*.

**Bakit:** ang `seedForDay()` ay ginawa para patas; walang saysay ang pagiging patas kung
walang ranggo ng parehong seed. Ito ang huling kulang na piraso, hindi ang buong board.

**Paano (mas maliit kaysa sa unang plano):**
1. `supabase/migrations/0002_daily_board.sql` — `daily_runs(day_key, player_id, level_id, score, waves, seed, created_at)`, unique sa `(day_key, player_id)`, best-score upsert.
2. Isang RPC: `daily_board(p_day, p_limit)` — sinusundan ang hugis ng `leaderboard_page`.
3. Parehong RPC sa `server/cloud-dev.mjs`, para masubukan lokal bago pa mag-deploy.
4. Isang bagong tab sa Hall: **TODAY'S SEED** (tabi ng THE REALM), na may empty state kapag wala pang ledger.
5. Submit sa `onLeaderboard` hook; **anti-cheat:** tanggihan ang `waves > seedMaxWaves` at ang score na lampas sa theoretical cap.

**Sukatan:** dalawang browser, isang araw, isang seed — magkaiba ang pangalan sa
parehong board.

### P2 — Tile atlas + service worker · **SHIPPED** (worker + install; atlas pa)

**Bakit (sinukat):** 921 requests bago ang menu; 259 dito ay tiles na 0.3 MB lang.
Ang service worker ay nagpapabilis sa **ikalawa** at ikatlong pagbisita (returning
players) at nagbubukas ng "Add to Home Screen" — na, ayon sa web gaming reports, ang
pinakamalaking retention lever na meron ang web na wala ang Steam.

**Resulta (sinukat sa `vite preview`, fresh profile):**

| | Bago | Ngayon |
|---|---|---|
| Ikalawang pagbisita, `/assets` mula sa worker | 0 / 339 | **339 / 339** |
| Runtime error | — | 0 |
| Install button | wala | lumalabas lang kapag may tunay na `beforeinstallprompt` |

Ang tile atlas (259 → ≤10 request) ay **hindi pa** nagawa: mas malaking pagbabago sa
`BootScene` at sa texture keys, at hindi kasama sa walang-risk na batch na ito.

**Paano:**
1. `scripts/pack_tiles.py` (gaya ng umiiral na `build_arena_tiles.py`) — isang atlas kada
   biome + JSON frame map; Phaser `this.load.atlas()`. Target: **259 → ≤10 requests**.
2. `public/sw.js` + rehistro sa `main.js`: cache-first para sa `assets/`, network-first sa
   `index.html`, **bersyon sa cache name** para hindi mag-stale.
3. Install prompt pagkatapos ng **unang** panalo (huwag agad sa unang load).
4. Sukatin bago/after gaya ng ginawa sa `docs/world-map-performance.md`.

**Sukatan:** <150 requests sa unang load; **0 network** sa ikalawang load.

### P3 — Coach marks sa unang laban · **SHIPPED**

**Bakit:** walang `firstRun`/`tutorial` flag kahit saan. May `camera-hint` na (isang beses
lang lumalabas) pero walang nagtuturo ng *paglagay ng tore*, *upgrade*, at *early call*.
Ang world map ay may objective ribbon na (`currentObjective`), kaya "saan ako pupunta"
ay solved na — ang kulang ay "ano ang gagawin ko **dito**".

**Ano ang naipatupad:** `src/systems/FirstRun.js` — tatlong hakbang na naka-gate sa
`level-1` at sa "hindi pa tapos", bawat isa retired ng aksyon na inilalarawan (place →
upgrade → wave). Nakaupo sa **kamera hint pill** (parehong plato at dismiss button, gold
ang gilid), **walang timer** kaya hindi nawawala habang binabasa, at dismissible lahat.
Naka-persist per device gaya ng camera hint.

**Bug na nahuli habang bine-verify:** sa 844×390, `@media (max-height: 620px)` ay
nagtatago sa `camera-hint` ("nothing to spare vertically"). Tama iyon para sa camera hint,
mali para sa tanging bar na nagtuturo ng placement — kaya ang mobile shell na ang
nananalo sa specificity. Screenshot bago/after sa §4.

**Sukatan:** nakikita ang hakbang 1 sa unang laban sa landscape phone, at nawawala pagkatapos
ng tatlong aksyon.

### P4 — Shareable seed link + result card

**Bakit:** web-native na bentahe na wala ang native TD. Meron nang seed + modifiers sa
`lastLaunch.options`; kailangan lang ilagay sa URL at kunin pabalik.

**Paano:** `?challenge=<base64(level,mode,seed,modifier)>` na binabasa sa boot (may guard
laban sa malformed input), "COPY CHALLENGE LINK" sa result screen, at isang 1200×630 na
canvas card (seed, stars, score, build icons). Magastos lang sa disenyo, hindi sa code.

### P5 — Run summary / build story

Umiiral na ang `StatisticsPanel` at ang counters sa `gameState.counters`. Kulang ang
**isang screen** pagkatapos ng laban: damage share per tower, specs na pinili, gold
efficiency, aling wave bumagsak ang core. Ito rin ang data na kailangan ng P4 card at
ng "bakit natalo ako" na pagkatuto.

### P6 — `Veteran` tier per mapa

Ayon sa genre: ang difficulty ay dapat tumaas sa **complexity**, hindi lang sa HP. Meron
nang `anomalies` (9) at `contracts` — data lang ang kailangan: bawat campaign map ay may
iskundaryong `Veteran` variant (fixed 1–2 restriction + mas mataas na wave count), may
sariling bituin at board. **Babala:** kailangan ng tunay na balance pass; hindi ito
"dagdagan ang damage".

### P7 — Ghost/replay ng #1 daily run

Deterministic ang sim (seeded), may command list ang `PvpRoom`. Ang susunod na hakbang
para maging tunay na esports-ish ang daily: i-download at i-play ang #1 run bilang ghost.
Malaki ang hirap, pero ito ang huling baitang ng P1.

### P8 — Codex Challenge (natatanging kalamangan)

Walang commercial TD na may codex ng BFS, circular queue, merge sort. Gawing **daily
algorithm puzzle**: ipakita ang isang maliit na graph at tanungin ang BFS order, o ang
merge sort pass — 20 segundo, may streak, may sariling board. Mura, at ito lang ang
feature na **hindi makokopya** ng kalaban. Bagay rin sa academic na pinagmulan ng project.

---

## 6. Bug na nadiskubre habang nagsasaliksik

**BLUEPRINT mode ay nangangako ng 9 board, 6 lang ang meron.** — **NAAYOS** (`b49140d`).
`modeData.js` ay `'NINE BOARDS'` / *"Nine hand-built boards"*, at may parehong claim sa
komento ng `main.js`. Pero `puzzles.js` ay may **6** lang, at 6 lang ang nire-render ng
`ModesUI`. Isinulat sa **SIX BOARDS** ang card at blurb, at ang komento sa `main.js`.
Kung gusto mong maging siyam talaga, ang susunod na hakbang ay tatlong bagong board —
hindi bagong UI.

---

## 7. Hindi dapat gawin (at bakit)

| Huwag | Dahilan |
|---|---|
| **Mazing / path-blocking** | Salungat sa sariling patakaran (walang depensa sa path/enemy zone) at sa fixed 2–3 lane na mapa. Rewrite ng pathfinding para sa isang mekanikong hindi tugma sa layout. |
| **Dagdagan pa ng tore** | 21 na, may 2 spec pa; kakaunti ang nagagamit kada run. Ang problema ay *variety of use*, hindi *variety of choice*. |
| **Ika-4 na meta currency** | Meron nang relics + heroes + pets + achievements. Ang bagong meta ay magpapabigat sa onboarding (tingnan ang P3). |
| **Battle pass / energy / ads** | Wala itong lugar sa portfolio-grade na laro, at sinisira ang sinabi nating "walang pay-to-progress". Ang seasonal feel ay makukuha na sa P1 + rotating modifiers. |
| **Rebisahin ang performance ng laban** | 60 fps na (Req 51), 93 request lang ang laban. Tapos na; huwag galawin. |
| **Bagong engine/framework** | Hindi na kailangan. Ang mga ideya sa §5 ay pawang data + UI. |

---

## 8. Sunod na hakbang (rekomendado)

1. **Ngayon (10 min):** ayusin ang "NINE BOARDS" → "SIX BOARDS" (o idagdag ang 3 board).
2. **P1** — global leaderboard. Ito ang pinakamalaking *payoff per line of code* dahil
   nakatayo na ang daily, ang PvP relay, at ang Supabase client.
3. **P2** — tile atlas muna (masusukat agad), tapos service worker.
4. **P3** — coach marks, bago pa mag-rekrut ng mga bagong player.

Ang P4 at P5 ay natural na kasunod ng P1; ang P8 ang pinaka-"kami lang ang may ganito".

---

## 9. Sanggunian

- GameSpot, *25 Best Tower Defense Games* (BTD6 quests + 4-player co-op; Defense Grid
  8-oras na campaign) — https://www.gamespot.com/gallery/best-tower-defense-games/2900-6140/
- Switchblade Gaming, *15 Tower Defense Games Worth Playing in 2026* (Rogue Tower 400+
  cards at lumalawak na path; Dungeon Warfare 2 33 trap × 8 trait; Legion TD 2 ranked
  2v2/4v4; talaan ng session length) — https://www.switchbladegaming.com/strategy-games/best-tower-defense-2026/
- Towerward, *Best Roguelite Tower Defense Games* — https://towerward.com/blog/best-roguelite-tower-defense-games
- Rogueliker, *New Roguelikes & Roguelites, September 2026* (Emberward = TD + Tetris
  placement) — https://rogueliker.com/new-roguelikes-roguelites-in-september-2026-the-monthly-update/
- Creation.dev, *Tower Defense Game Ideas for 2026* (endless, seasonal, weekly
  challenges, leaderboards bilang endgame) — https://www.creation.dev/ideas/tower-defense
- Cubix, *Demystifying Tower Defense Game Architecture* (inaasahan sa 2026: seasonal
  events, cloud save, async multiplayer, achievements) — https://www.cubix.co/blog/demystifying-tower-defense-game-architecture-practical-guide/
- Impulse Media Hub, *Web-Native Game Distribution in 2026* (PWA install → mas mataas na
  retention, pero conversion ang bottleneck) — https://www.impulsemediahub.com/blog/web-native-games-rising/
- PlayDaily, *The Quiet Comeback of Competitive Browser Games* (browser-first = lightweight
  strategy + shared competition) — https://playdaily.org/resources/stories/competitive-browser-games-comeback-2026
- Industry retention benchmarks (GameAnalytics; game-ace): D1 35–45 %, D7 12–20 %,
  tutorial completion >80 %, meta-progression bilang "retention engine" — ginamit bilang
  hanay ng paghahambing, hindi bilang pangako ng resultang makukuha natin.
