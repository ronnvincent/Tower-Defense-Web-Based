/**
 * tutorialScript.js — the people, the lines and the set dressing of Havenbrook.
 *
 * This is data. The state machine that plays it is `systems/TutorialDirector.js`
 * and the card that draws it is `ui/TutorialUI.js`; neither of them knows a
 * line, a villager or a cottage by name. That split is deliberate: the opening
 * is the one piece of the game that has to be *written*, and rewriting a scene
 * must never mean touching the scene graph.
 *
 * THE STORY IN ONE PARAGRAPH
 * --------------------------
 * It is dusk in Havenbrook, the last village before the ridge. Five villagers
 * are arguing about walls when the watch spots smoke on the east road. The
 * keeper — the player, by the name they chose before the menu — is the only one
 * who can raise a defence, so the village talks the player through it: build,
 * upgrade, call the wave. Nothing is skipped, because the whole point is that a
 * new player has been *told what the buttons do* before the first creep walks.
 *
 * WHY THE CAST LOOKS THE WAY IT DOES
 * ----------------------------------
 * The sheets are built by `scripts/build_npc_sheets.py` from Tiny Swords (Pixel
 * Frog, CC0 1.0) bodies, re-paletted per character, and the portraits are
 * medallions of those same sprites — the camera looks down, so a head-and-
 * shoulders crop would be a picture of a hat. See the script's own header.
 */

/** The level id this script belongs to. */
export const TUTORIAL_ID = 'tutorial';

/**
 * The five villagers.
 *
 * `sheet` values match the generated files one-for-one and `frame`/`cols` are
 * the numbers the build script printed; `tests/tutorial.test.js` checks them
 * against the PNG headers so a re-export that changes the grid fails loudly
 * instead of playing four frames of a six-frame walk.
 */
export const TUTORIAL_CAST = Object.freeze([
  {
    id: 'mara',
    name: 'Mara',
    role: 'Miller',
    sheet: 'npc-mara',
    portrait: '/assets/ui/portrait-mara.png',
    frame: 192,
    cols: 6,
    idle: 6,
    walk: 6,
    scale: 1,
  },
  {
    id: 'doren',
    name: 'Old Doren',
    role: 'Elder',
    sheet: 'npc-doren',
    portrait: '/assets/ui/portrait-doren.png',
    frame: 192,
    cols: 6,
    idle: 6,
    walk: 6,
    scale: 0.94,
  },
  {
    id: 'pip',
    name: 'Pip',
    role: 'Child',
    sheet: 'npc-pip',
    portrait: '/assets/ui/portrait-pip.png',
    frame: 192,
    cols: 6,
    idle: 6,
    walk: 6,
    scale: 0.66,
  },
  {
    id: 'hollis',
    name: 'Hollis',
    role: 'Hunter',
    sheet: 'npc-hollis',
    portrait: '/assets/ui/portrait-hollis.png',
    frame: 192,
    cols: 6,
    idle: 6,
    walk: 6,
    scale: 1,
  },
  {
    id: 'bram',
    name: 'Bram',
    role: 'Watch',
    sheet: 'npc-bram',
    portrait: '/assets/ui/portrait-bram.png',
    frame: 192,
    cols: 6,
    idle: 6,
    walk: 6,
    scale: 1,
  },
]);

/**
 * Where the villagers stand for the scene, in tile units (bottom-centre of the
 * sprite, so a 1.9-tile-tall pawn sits *on* its square rather than floating).
 *
 * They gather on the high street in front of the keep — the one piece of ground
 * the camera frames dead centre on arrival.
 */
export const VILLAGE_STAGE = Object.freeze({
  mara: { col: 13.6, row: 9.25 },
  doren: { col: 14.55, row: 8.55 },
  pip: { col: 16.2, row: 9.3 },
  hollis: { col: 17.3, row: 8.8 },
  bram: { col: 12.45, row: 8.5 },
});

/**
 * Where they run when the alarm goes: out of the build field, into the two side
 * gutters (columns 0-1 and 30-31), which are outside every legal tower square.
 * Nobody stands on the meadow the player is about to build on.
 */
export const VILLAGE_EXIT = Object.freeze({
  mara: { col: 0.95, row: 10.7 },
  doren: { col: 1.25, row: 9.4 },
  pip: { col: 30.6, row: 10.5 },
  hollis: { col: 29.9, row: 9.2 },
  bram: { col: 30.4, row: 8.4 },
});

/**
 * The set dressing.
 *
 * `col`/`row` is the bottom-centre anchor in tile units; every prop is pinned to
 * the top half (the horde's ground, which is never buildable) or to the bottom
 * rim, so nothing here can ever sit on a legal tower square. A prop may *cover*
 * a road visually only where it is behind the houses that front it — the test
 * in `tests/tutorial.test.js` pins down the anchors, and the lane arrows are
 * drawn above the dressing, so the route stays readable regardless.
 */
export const VILLAGE_PROPS = Object.freeze([
  // -- the ridge, west end ------------------------------------------------
  { key: 'tree-2', col: 6.8, row: 1.7, scale: 0.86 },
  { key: 'tree-4', col: 9.6, row: 1.5, scale: 0.8, flip: true },
  { key: 'house', col: 5.7, row: 3.15, scale: 0.92 },
  { key: 'house', col: 8.5, row: 2.5, scale: 0.86, flip: true },
  { key: 'fence', col: 7.1, row: 4.3, scale: 0.9 },
  { key: 'fence', col: 8.0, row: 4.3, scale: 0.9 },
  { key: 'haystack', col: 12.6, row: 4.95, scale: 0.82 },

  // -- the duck pond ------------------------------------------------------
  { key: 'fence', col: 10.5, row: 1.55, scale: 0.8 },
  { key: 'fence', col: 11.4, row: 1.55, scale: 0.8 },
  { key: 'bush', col: 12.4, row: 3.6 },
  { key: 'mushroom-big', col: 9.7, row: 3.7, scale: 0.8 },
  { key: 'mushroom', col: 4.6, row: 3.35 },

  // -- the market lane ----------------------------------------------------
  { key: 'house', col: 14.0, row: 2.35, scale: 0.9 },
  { key: 'well', col: 13.9, row: 4.6, scale: 0.95 },
  { key: 'house', col: 19.6, row: 2.45, scale: 0.88, flip: true },
  { key: 'pumpkin-big', col: 17.9, row: 2.9, scale: 0.8 },
  { key: 'pumpkin', col: 19.4, row: 3.3 },

  // -- the east road and the mill -----------------------------------------
  { key: 'tree-1', col: 20.7, row: 2.7, scale: 0.9 },
  { key: 'house', col: 22.5, row: 2.85, scale: 0.9 },
  { key: 'fence', col: 23.6, row: 4.4, scale: 0.9 },
  { key: 'fence', col: 24.5, row: 4.4, scale: 0.9 },
  { key: 'pumpkin-big', col: 23.2, row: 3.9, scale: 0.7 },
  { key: 'haystack', col: 26.6, row: 3.85, scale: 0.8 },
  { key: 'sheep', col: 21.3, row: 4.6, scale: 0.9 },
  { key: 'mine', col: 25.6, row: 1.9, scale: 0.82 },

  // -- the ruined watchtower on the corner --------------------------------
  { key: 'watchtower', col: 30.0, row: 4.4, scale: 0.92 },

  // -- the side gutters ---------------------------------------------------
  { key: 'tree-3', col: 1.9, row: 3.3, scale: 0.8 },
  { key: 'fence', col: 1.4, row: 5.6, scale: 0.85 },
  { key: 'fence', col: 1.4, row: 6.4, scale: 0.85 },
  { key: 'tree-1', col: 31.0, row: 6.2, scale: 0.85, flip: true },
  { key: 'bush', col: 30.6, row: 5.4 },
  { key: 'sheep', col: 1.2, row: 8.2, scale: 0.85 },

  // -- the bottom rim: small props only, so row 10 stays buildable --------
  { key: 'pumpkin-big', col: 3.2, row: 11.9, scale: 0.7 },
  { key: 'mushroom-big', col: 5.4, row: 11.92, scale: 0.7 },
  { key: 'bush', col: 6.9, row: 11.92, scale: 0.8 },
  { key: 'fence', col: 25.2, row: 11.9, scale: 0.8 },
  { key: 'fence', col: 26.1, row: 11.9, scale: 0.8 },
  { key: 'pumpkin', col: 27.2, row: 11.9, scale: 0.8 },
  { key: 'sheep', col: 28.8, row: 11.92, scale: 0.8 },
]);

/**
 * The beats, in order.
 *
 *   line  a character speaks; auto-advances after `autoMs` or on a tap
 *   step  the game waits for the player to actually do the thing
 *   end   the scripted part is over and the battle is theirs
 *
 * `who: 'narrator'` is the italic caption voice — no portrait, no name plate.
 * `cue` is a scene instruction, not copy: `arrive` walks the cast in, `alarm`
 * rings the bell and paints the smoke, `scatter` sends everyone to the gutters,
 * `cheer` fires the small celebration burst.
 */
export const TUTORIAL_BEATS = Object.freeze([
  {
    id: 'open',
    kind: 'line',
    who: 'narrator',
    text: 'Havenbrook. The last village this side of the ridge.',
    cue: 'arrive',
  },
  {
    id: 'mara-1',
    kind: 'line',
    who: 'mara',
    text: 'Nine winters we have kept this green, and not one wall to show for it.',
  },
  {
    id: 'doren-1',
    kind: 'line',
    who: 'doren',
    text: 'Walls come after bread. We have a mill, a well, and a boy who counts sheep.',
  },
  {
    id: 'pip-1',
    kind: 'line',
    who: 'pip',
    text: 'I count the raiders too! And there are — there are a lot of them—',
  },
  {
    id: 'bram-1',
    kind: 'line',
    who: 'bram',
    text: 'Smoke on the east road. That is no cookfire.',
    cue: 'alarm',
  },
  {
    id: 'mara-2',
    kind: 'line',
    who: 'mara',
    text: 'Keeper {name}! You came up the north road at the right hour. Our watch is one spear and one old man.',
    cue: 'scatter',
  },
  {
    id: 'pip-2',
    kind: 'line',
    who: 'pip',
    text: 'You are the keeper! They say you turned a whole raid at the ford. You have to save us!',
  },
  {
    id: 'doren-2',
    kind: 'line',
    who: 'doren',
    text: 'The meadow is open ground. Where the road does not touch — raise a defence there.',
  },
  {
    id: 'step-place',
    kind: 'step',
    event: 'place',
    title: 'RAISE A DEFENCE',
    text: 'Tap the card the hand is pointing at, then tap the marked meadow.',
    textMobile: 'Tap the card the hand is pointing at, then tap the marked tile.',
    // Two rows up and three columns left of the keep: inside the meadow the
    // villagers have just cleared, within reach of the market lane as it drops
    // past the well, and clear of the core's health bar.
    focus: { col: 12, row: 7 },
  },
  {
    id: 'mara-3',
    kind: 'line',
    who: 'mara',
    text: 'There it stands. Now feed it coin — the first ranks come quick.',
    cue: 'cheer',
  },
  {
    id: 'step-upgrade',
    kind: 'step',
    event: 'upgrade',
    title: 'RAISE IT A TIER',
    text: 'Tap the tower you raised, then take it to the next tier. The hand shows the UPGRADE.',
    textMobile: 'Tap your tower, then tap the UPGRADE the hand points at.',
    focus: null,
  },
  {
    id: 'doren-3',
    kind: 'line',
    who: 'doren',
    text: 'Steel first, gold after. Call them in before they pick the hour.',
  },
  {
    id: 'step-wave',
    kind: 'step',
    event: 'wave',
    title: 'CALL THE WAVE',
    text: 'Start the wave. Holding the line is the whole lesson.',
    textMobile: 'Tap START WAVE and hold the line.',
    focus: null,
  },
  {
    id: 'done',
    kind: 'end',
  },
]);

/**
 * What the village shouts once the first wave is on the road.
 *
 * These are toasts rather than dialogue beats on purpose: by this point the
 * player is fighting, and a card over the board during the first real fight is
 * exactly the kind of thing that gets somebody killed. The story has already
 * handed over; these are the crowd behind them.
 */
export const TUTORIAL_HOLD_QUIPS = Object.freeze([
  { who: 'hollis', text: 'Dust on the ridge — they are coming down the west road!' },
  { who: 'pip', text: 'Tall thing! Look at the tall thing!' },
]);

/** How long a line stays on screen before it advances itself. */
export const TUTORIAL_LINE_MS = 4200;

/** The palettes the overlay dresses each speaker in (border + name colour). */
export const SPEAKER_ACCENTS = Object.freeze({
  mara: '#e2b06a',
  doren: '#c9d2d8',
  pip: '#a6d872',
  hollis: '#9eb86a',
  bram: '#ff8f7a',
  narrator: '#cbb994',
});

/** The cast record for an id, or null for the narrator. */
export function speakerFor(id) {
  return TUTORIAL_CAST.find((member) => member.id === id) || null;
}

/** Substitute the commander name into a line. Never assembles markup. */
export function fillName(text, name) {
  const safe = typeof name === 'string' && name.trim() ? name.trim() : 'keeper';
  return String(text || '').replace(/\{name\}/g, safe);
}

/**
 * Should this profile see the opening battle?
 *
 * Two conditions, both structural rather than a version number:
 *   · the flag has not been set, and
 *   · the save has never cleared a stage.
 *
 * The second one is what protects every existing player: a save that predates
 * this feature has stars but no flag, and must not be dropped into a tutorial
 * after a year of play. A brand-new profile has neither.
 */
export function needsTutorial(profile) {
  if (!profile || typeof profile !== 'object') return false;
  if (profile.tutorialDone) return false;
  // A save is identified by its star ledger. A half-read object with no ledger
  // is a failed load, not a brand-new keeper — better to skip the opening than
  // to drop a returning player into one.
  if (!profile.stars || typeof profile.stars !== 'object') return false;
  return Object.keys(profile.stars).length === 0;
}

/** Which beat index a step event should retire, or -1 when it retires none. */
export function stepIndexForEvent(event, beats = TUTORIAL_BEATS) {
  return beats.findIndex((beat) => beat.kind === 'step' && beat.event === event);
}
