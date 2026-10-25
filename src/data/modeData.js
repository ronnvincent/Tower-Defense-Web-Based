/**
 * modeData.js — the War Room catalogue.
 *
 * One entry per game mode. The menu, the tests and the scene all read this
 * list, so adding a mode is a data edit plus whatever the mode itself needs —
 * never a new branch in three different files.
 *
 * Each mode says how to launch it:
 *   map      the battlefield the card paints (a `map-<id>.png` minimap)
 *   levelId  which level the scene boots
 *   options  extra flags handed to `GameScene.init` (rogue / anomaly / …)
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
    id: 'anomaly',
    art: '/assets/ui-kit/glyph_meteor.png',
    kind: MODE_KINDS.RUN,
    name: 'ANOMALY WAVES',
    icon: '🌀',
    tag: 'SHATTERED REACH · MUTATIONS',
    blurb: 'Each wave rolls a rule twist — fog, stampede, twin titans. Answer it or lose the core.',
    map: 'shattered',
    levelId: 'anomaly-waves',
    options: { anomaly: true },
  },
  {
    id: 'ascension',
    art: '/assets/ui-kit/glyph_crown.png',
    kind: MODE_KINDS.RUN,
    name: 'ASCENSION',
    icon: '🗼',
    tag: 'SKYWARD STEPS · LADDER',
    blurb: 'Every ten waves, choose: climb for a tougher horde and a bigger score, or cash out.',
    map: 'skyward',
    levelId: 'ascension',
    options: { ascension: true },
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
    id: 'timeattack',
    art: '/assets/ui-kit/glyph_overcharge.png',
    kind: MODE_KINDS.RUN,
    name: 'TIME ATTACK',
    icon: '⏱',
    tag: 'DUNE CIRCUIT · 3 MINUTES',
    blurb: 'Three minutes of horde, one score. No wave button — the clock is the enemy.',
    map: 'dune',
    levelId: 'time-attack',
  },
  {
    id: 'contracts',
    art: '/assets/ui-kit/glyph_book.png',
    kind: MODE_KINDS.RUN,
    name: 'CONTRACT BOARD',
    icon: '📜',
    tag: 'TIDEWATCH · THREE BETS',
    blurb: 'Three objectives pinned to this run. Gold for each one banked, gems for a clean sweep.',
    map: 'tidewatch',
    levelId: 'contract-board',
    options: { contracts: true },
  },
  {
    id: 'blueprint',
    art: '/assets/ui-kit/glyph_fortify.png',
    kind: MODE_KINDS.PUZZLE,
    name: 'BLUEPRINT',
    icon: '🧩',
    tag: 'NINE BOARDS',
    blurb: 'Fixed towers, tight gold, no mercy. Nine hand-built boards, each with its own answer.',
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
