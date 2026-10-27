/**
 * leaderboardCategories.js — one leaderboard board per mode of play.
 *
 * The device leaderboard used to be a single ranked list, which made it a
 * broken comparison: an Endless run that reached wave 60 always beat a Campaign
 * victory that finished wave 5, so the Campaign board was permanently owned by a
 * run from a different game. Nothing was wrong with the records — the ranking
 * simply mixed runs that are not comparable.
 *
 * So every mode of play now has its own board, and this module is the single
 * place that says which boards exist. The roster is derived from the modes the
 * game actually ships (`modeData.js`, `levelData.js`, `pvpArenas.js`,
 * `puzzles.js`), not invented here: if a level carries `level.mode = 'rogue'`
 * or a room is a duel, `resolveCategory` files the run on the matching board.
 *
 * Ids are stable strings, stored inside every leaderboard record. Do not rename
 * one: it would orphan the runs already saved under it.
 */

/**
 * The boards, in the order the hall draws them: the campaign first (it is where
 * a new commander starts), then the run modes, then the multiplayer boards, the
 * puzzle, and the unfiled bucket last.
 *
 * `blurb` is what an empty board says, so a player never sees a blank table
 * without being told what fills it.
 */
export const LEADERBOARD_CATEGORIES = Object.freeze([
  {
    id: 'campaign',
    label: 'CAMPAIGN',
    title: 'CAMPAIGN',
    blurb: 'Clear a story map and record the run to open this board.',
  },
  {
    id: 'endless',
    label: 'ENDLESS',
    title: 'ENDLESS SIEGE',
    blurb: 'Survive the endless horde and record how far the line held.',
  },
  {
    id: 'titan',
    label: 'TITAN RUSH',
    title: 'TITAN RUSH',
    blurb: 'Five titans back to back on the Caldera. Record a run to claim a place.',
  },
  {
    id: 'timeattack',
    label: 'TIME ATTACK',
    title: 'TIME ATTACK',
    blurb: 'Three minutes, one score. Record a run to open this board.',
  },
  {
    id: 'rogue',
    label: 'ROGUE',
    title: 'ROGUE SIEGE',
    blurb: 'Build the run on cards, then record it here.',
  },
  {
    id: 'anomaly',
    label: 'ANOMALY',
    title: 'ANOMALY WAVES',
    blurb: 'Answer the mutations and record the run to open this board.',
  },
  {
    id: 'ascension',
    label: 'ASCENSION',
    title: 'ASCENSION',
    blurb: 'Climb the ladder or cash out, then record the run here.',
  },
  {
    id: 'contracts',
    label: 'CONTRACTS',
    title: 'CONTRACT BOARD',
    blurb: 'Bank the bets and record the run to open this board.',
  },
  {
    id: 'duel',
    label: 'DUEL',
    title: 'DUEL ARENA',
    blurb: 'Finish a duel to put a result on this board.',
  },
  {
    id: 'coop',
    label: 'CO-OP',
    title: 'CO-OP SIEGE',
    blurb: 'Finish a co-op room to put a result on this board.',
  },
  {
    id: 'puzzle',
    label: 'BLUEPRINT',
    title: 'BLUEPRINT',
    blurb: 'Solve a blueprint puzzle and record the attempt.',
  },
  {
    id: 'unknown',
    label: 'UNFILED',
    title: 'UNFILED RUNS',
    blurb: 'Runs recorded before the hall kept a mode. They keep their score.',
    legacy: true,
  },
]);

/** The synthetic "every board at once" view. Never stored on a record. */
export const ALL_CATEGORY = Object.freeze({
  id: 'all',
  label: 'ALL RUNS',
  title: 'ALL RUNS ON THIS DEVICE',
  blurb: 'No run has been recorded on this device yet.',
  overview: true,
});

export const CATEGORY_IDS = Object.freeze(LEADERBOARD_CATEGORIES.map((entry) => entry.id));

const BY_ID = new Map([
  [ALL_CATEGORY.id, ALL_CATEGORY],
  ...LEADERBOARD_CATEGORIES.map((entry) => [entry.id, entry]),
]);

/**
 * Spellings that are not their own board but must land on one.
 *
 * `levelData.js` calls the clock mode `time-attack` while its id is
 * `timeattack`; `runModeLabel()` hands back whichever it found. Normalising
 * here means a run is never filed under a board nobody can open.
 */
const ALIASES = Object.freeze({
  all: 'all',
  every: 'all',
  campaign: 'campaign',
  story: 'campaign',
  level: 'campaign',
  endless: 'endless',
  titan: 'titan',
  titanrush: 'titan',
  timeattack: 'timeattack',
  timed: 'timeattack',
  rogue: 'rogue',
  roguesiege: 'rogue',
  anomaly: 'anomaly',
  anomalies: 'anomaly',
  ascension: 'ascension',
  contracts: 'contracts',
  contract: 'contracts',
  contractboard: 'contracts',
  duel: 'duel',
  pvp: 'duel',
  arena: 'duel',
  coop: 'coop',
  coopsiege: 'coop',
  puzzle: 'puzzle',
  blueprint: 'puzzle',
  unknown: 'unknown',
  unk: 'unknown',
  '': 'unknown',
});

/** Lower-case and strip everything that is not a letter or a digit. */
function canonical(raw) {
  return String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Map one naming of a mode onto its board id, or `null` if nothing matches.
 *
 * `'time-attack'`, `'TIME ATTACK'` and `'timeattack'` all resolve to
 * `'timeattack'`; `'pvp'` resolves to `'duel'`.
 *
 * @param {string|null|undefined} raw
 * @returns {string|null}
 */
export function categoryFromMode(raw) {
  const key = canonical(raw);
  const hit = ALIASES[key];
  return hit && hit !== 'all' && hit !== 'unknown' ? hit : null;
}

/**
 * The board a finished run belongs on.
 *
 * Order matters: an explicit mode label wins, then the level's own flags. A
 * level is inspected rather than trusted to carry a mode because the campaign
 * levels, Endless and the PvP arenas are levels, not roster modes — they never
 * had a `mode` field and adding one would have been a second place to keep the
 * same truth.
 *
 * @param {{mode?:string|null, level?:object|null, pvp?:boolean, coop?:boolean}} [result]
 * @returns {string} a board id, never 'all'
 */
export function resolveCategory(result = {}) {
  const { mode, level, pvp, coop } = result || {};

  const byMode = categoryFromMode(mode);
  if (byMode) return byMode;

  if (pvp || coop) return coop ? 'coop' : 'duel';

  if (level && typeof level === 'object') {
    if (level.puzzle) return 'puzzle';
    if (level.pvp) return coop || level.coop ? 'coop' : 'duel';
    const byLevelMode = categoryFromMode(level.mode);
    if (byLevelMode) return byLevelMode;
    if (level.id === 'titan-rush') return 'titan';
    if (level.endless) return 'endless';
    // A level with an id but no mode flag is a campaign map.
    if (level.id) return 'campaign';
  }

  return 'unknown';
}

/**
 * The value to store on a record: a real board id, or `'unknown'` for a run
 * that predates the boards (or arrived with junk in the field).
 *
 * Storing `'all'` is refused on purpose — the overview is a view, not a home.
 */
export function normalizeCategory(raw) {
  if (raw === 'all') return 'unknown';
  return BY_ID.has(raw) && raw !== 'all' ? raw : categoryFromMode(raw) || 'unknown';
}

/** The board's descriptor, falling back to the unfiled bucket. */
export function categoryInfo(id) {
  return BY_ID.get(id) || BY_ID.get('unknown');
}

/** The boards that get a chip, in drawing order, with the overview first. */
export function categoryChips() {
  return [ALL_CATEGORY, ...LEADERBOARD_CATEGORIES];
}

/** Short uppercase label for a run row, e.g. 'ENDLESS'. */
export function categoryLabel(id) {
  return categoryInfo(id).label;
}

/** True when a run belongs on the given board (the overview takes everything). */
export function matchesCategory(record, id) {
  if (!id || id === 'all') return true;
  return normalizeCategory(record?.mode) === id;
}
