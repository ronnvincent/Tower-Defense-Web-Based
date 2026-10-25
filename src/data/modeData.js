/**
 * modeData.js — the War Room catalogue.
 *
 * One entry per game mode. The menu, the tests and the scene all read this
 * list, so adding a mode is a data edit plus whatever the mode itself needs —
 * never a new branch in three different files.
 *
 * Each mode says how to launch it:
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
    tag: 'ENDLESS + CARDS',
    blurb: 'Every wave you clear, pick one of three cards. Build the run, not just the towers.',
    levelId: 'endless',
    options: { rogue: true },
  },
  {
    id: 'anomaly',
    art: '/assets/ui-kit/glyph_meteor.png',
    kind: MODE_KINDS.RUN,
    name: 'ANOMALY WAVES',
    icon: '🌀',
    tag: 'ENDLESS + MUTATIONS',
    blurb: 'Each wave rolls a rule twist — fog, stampede, twin titans. Answer it or lose the core.',
    levelId: 'endless',
    options: { anomaly: true },
  },
  {
    id: 'ascension',
    art: '/assets/ui-kit/glyph_crown.png',
    kind: MODE_KINDS.RUN,
    name: 'ASCENSION',
    icon: '🗼',
    tag: 'ENDLESS LADDER',
    blurb: 'Every ten waves, choose: climb for a tougher horde and a bigger score, or cash out.',
    levelId: 'endless',
    options: { ascension: true },
  },
  {
    id: 'titan',
    art: '/assets/ui-kit/glyph_swords.png',
    kind: MODE_KINDS.RUN,
    name: 'TITAN RUSH',
    icon: '👑',
    tag: 'FIVE TITANS',
    blurb: 'No trash waves. Five bosses back to back on the Caldera — a four-minute fight.',
    levelId: 'titan-rush',
  },
  {
    id: 'timeattack',
    art: '/assets/ui-kit/glyph_overcharge.png',
    kind: MODE_KINDS.RUN,
    name: 'TIME ATTACK',
    icon: '⏱',
    tag: '3 MINUTES',
    blurb: 'Three minutes of horde, one score. No wave button — the clock is the enemy.',
    levelId: 'time-attack',
  },
  {
    id: 'contracts',
    art: '/assets/ui-kit/glyph_book.png',
    kind: MODE_KINDS.RUN,
    name: 'CONTRACT BOARD',
    icon: '📜',
    tag: 'THREE SIDE BETS',
    blurb: 'Three objectives pinned to this run. Gold for each one banked, gems for a clean sweep.',
    levelId: 'endless',
    options: { contracts: true },
  },
  {
    id: 'blueprint',
    art: '/assets/ui-kit/glyph_fortify.png',
    kind: MODE_KINDS.PUZZLE,
    name: 'BLUEPRINT',
    icon: '🧩',
    tag: 'PUZZLES',
    blurb: 'Fixed towers, tight gold, no mercy. Solve the board with the tools you are given.',
  },
  {
    id: 'coop',
    art: '/assets/ui-kit/glyph_medal.png',
    kind: MODE_KINDS.COOP,
    name: 'CO-OP SIEGE',
    icon: '🤝',
    tag: 'TWO PLAYERS',
    blurb: 'One fate, two boards. Clear the arena together — if either core falls, you both lose.',
  },
]);

const byId = new Map(MODES.map((mode) => [mode.id, mode]));

export function getMode(id) {
  return byId.get(id) || null;
}
