/**
 * Global game configuration and balance constants.
 * Keeping numbers here (instead of scattered through the code) makes the game
 * easy to tune and easy to explain.
 */
export const TILE_SIZE = 64;

/**
 * The canvas is a *render surface*, not the battlefield.
 *
 * It used to be expressed as "20 columns x 12 rows of 64 px", which read as if
 * the map were 20 tiles wide — the map has been 32 columns since Req 37, and the
 * two numbers had nothing to do with each other any more. The stage is a fixed
 * 5:3 surface that Phaser's FIT mode scales to the window; the camera then
 * frames the real board inside the band the HUD leaves free (see
 * `src/camera/battleFrame.js`).
 *
 * The stage aspect cannot make the battlefield bigger: at a fixed window the
 * board's on-screen width is `boardAspect * bandHeight` (measured in Chrome,
 * 1366 x 768: 2.667 x 434 = 1157 px), so only the HUD band and the board's own
 * aspect move that number. Keep the aspect here in one place anyway — the CSS
 * (`--stage-width`) and this constant must agree or the canvas letterboxes
 * itself twice.
 */
export const STAGE_ASPECT = 5 / 3;
export const STAGE_WIDTH = 1280;
export const STAGE_HEIGHT = 768;
export const GAME_WIDTH = STAGE_WIDTH;
export const GAME_HEIGHT = STAGE_HEIGHT;

/**
 * Starting economy. Raised from 160 gold / 20 HP after play-testing: a fresh
 * player could not afford a second tower before wave 2 and every early leak was
 * fatal. 220 gold buys two defences on turn one, 25 HP absorbs a mistake.
 */
export const STARTING_COINS = 220;
export const STARTING_BASE_HEALTH = 25;

/** Refund ratio when selling a tower (70% of everything spent on it). */
// A defence sells back 60 % of everything sunk into it (build + upgrades), never
// of the current market price. The ratio is centralised here so the HUD, the
// inspector and the tests cannot drift apart.
export const SELL_REFUND_RATIO = 0.6;

/** Largest simulation step in ms (prevents huge jumps after a tab switch). */
export const MAX_FRAME_DELTA = 50;

/** Score bonuses. */
export const SCORE = {
  waveClearBase: 100, // × wave number
  victoryPerBaseHp: 50,
};

/**
 * Coins granted when a wave is cleared: base + perWave × wave number.
 * Bumped from 20 + 5×wave so the seven-tower dock (three new forge lines)
 * stays affordable without selling defences between waves.
 */
export const WAVE_CLEAR_COINS = { base: 30, perWave: 8 };

/**
 * Automatic wave preparation windows, in ms.
 *
 * The battle is a rhythm: a longer window before the first wave so the opening
 * build is a decision, then a shorter breather between waves so gold is spent
 * under mild pressure. A level can override either window
 * (`level.wavePrep = { firstMs, betweenMs }`); `minMs` is the floor that stops
 * bad data from turning the stage into an unplayable conveyor belt.
 */
export const WAVE_PREP = {
  firstMs: 15000,
  betweenMs: 8000,
  minMs: 3000,
};

/** Colour palette shared by Phaser rendering (hex numbers). */
export const COLORS = {
  background: 0x0a0f1e,
  grassA: 0x1c3a33,
  grassB: 0x1f4038,
  grassSpeck: 0x2c5a4b,
  grassDark: 0x15302a,
  road: 0x9a7b55,
  roadDark: 0x6e5539,
  roadLight: 0xb8966a,
  rock: 0x4a5063,
  rockLight: 0x6b7389,
  rockDark: 0x30344a,
  water: 0x15415f,
  waterLight: 0x2d6f96,
  gold: 0xf5c451,
  cyan: 0x4ee1ff,
  crimson: 0xff5470,
  violet: 0x9b7bff,
  valid: 0x5cf2a6,
  invalid: 0xff5470,
  white: 0xffffff,
};

/** localStorage keys (versioned so a future format change can't break old data). */
export const STORAGE_KEYS = {
  leaderboard: 'td-dsalgo:leaderboard:v1',
  settings: 'td-dsalgo:settings:v1',
  lastName: 'td-dsalgo:last-name:v1',
  // Graphics profile (auto / high / balanced / performance). Deliberately its
  // own record: the audio mixer rewrites its save on every fader move and must
  // not have to know about rendering.
  graphics: 'td-dsalgo:graphics:v1',
};

/** Maximum leaderboard rows displayed / stored. */
export const LEADERBOARD_DISPLAY_LIMIT = 10;
export const LEADERBOARD_STORE_LIMIT = 50;
