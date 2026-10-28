/**
 * modeData.js — the War Room catalogue.
 *
 * One entry per game mode. The menu, the tests and the scene all read this
 * list, so adding a mode is a data edit plus whatever the mode itself needs —
 * never a new branch in three different files.
 *
 * The roster is deliberately short. Four modes, four different questions:
 *
 *   ROGUE SIEGE   what does this run become?   (a draft, one card per wave)
 *   TITAN RUSH    can I hold a line of five bosses with no trash to farm?
 *   BLUEPRINT     is there a solution?         (fixed towers, one answer)
 *   CO-OP SIEGE   can two of us hold two boards as one fate?
 *
 * Anomaly Waves, Ascension, Time Attack and the Contract Board were retired:
 * each one bent the same run-long numbers the draft already bends, or asked a
 * question Endless, Titan Rush or the seeded Daily already asks. Their maps,
 * tiles and data stay in the tree (the maps are still reachable as arena art),
 * and the runs already recorded on their boards are kept as UNFILED, so no
 * score was thrown away with them.
 *
 * Each mode says how to launch it:
 *   map      the battlefield the card paints (a `map-<id>.png` minimap)
 *   levelId  which level the scene boots
 *   options  extra flags handed to `GameScene.init` (rogue / seed)
 *   kind     run | puzzle | coop — how the War Room launches it
 *   icon     emoji, for text contexts (toasts, console)
 *   art      the pixel-art glyph the War Room actually draws
 */
export const MODE_KINDS = Object.freeze({
  RUN: 'run',
  PUZZLE: 'puzzle',
  COOP: 'coop',
});

export const MODES = Object.freeze([
  {
    id: 'rogue',
    art: '/assets/ui-kit/glyph_scroll.png',
    kind: MODE_KINDS.RUN,
    name: 'ROGUE SIEGE',
    icon: '🃏',
    tag: 'BLACKFEN · CARDS',
    blurb: 'Every wave you clear, pick one of three cards. Build the run, not just the towers.',
    map: 'blackfen',
    levelId: 'rogue-siege',
    options: { rogue: true },
  },
  {
    id: 'titan',
    art: '/assets/ui-kit/glyph_swords.png',
    kind: MODE_KINDS.RUN,
    name: 'TITAN RUSH',
    icon: '👑',
    tag: 'THRONE OF ASH · FIVE TITANS',
    blurb: 'No trash waves. Five bosses back to back on the Caldera — a four-minute fight.',
    map: 'ash-throne',
    levelId: 'titan-rush',
  },
  {
    id: 'blueprint',
    art: '/assets/ui-kit/glyph_fortify.png',
    kind: MODE_KINDS.PUZZLE,
    name: 'BLUEPRINT',
    icon: '🧩',
    tag: 'SIX BOARDS',
    blurb: 'Fixed towers, tight gold, no mercy. Six hand-built boards, each with its own answer.',
  },
  {
    id: 'coop',
    art: '/assets/ui-kit/glyph_medal.png',
    kind: MODE_KINDS.COOP,
    name: 'CO-OP SIEGE',
    icon: '🤝',
    tag: 'THREE ARENAS · TWO PLAYERS',
    blurb: 'One fate, two boards. Clear the arena together — if either core falls, you both lose.',
  },
]);

const byId = new Map(MODES.map((mode) => [mode.id, mode]));

export function getMode(id) {
  return byId.get(id) || null;
}
