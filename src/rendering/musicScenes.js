/**
 * musicScenes.js — what each screen sounds like.
 *
 * The project ships no music files: everything here is *data* that
 * `MusicDirector` renders with oscillators. One scene is an open fifth plus a
 * mode, a tempo and two mix levels — enough to tell a menu from a forge without
 * a single byte of audio in `public/`.
 *
 * The modes are the medieval church modes on purpose (aeolian for home,
 * dorian for the realm, phrygian for the forge, mixolydian for the war room):
 * they share a tonic vocabulary, so crossfades never clash, and the raised or
 * flattened second is what makes the forge sound hotter than the hall.
 *
 * Pure data + one lookup — no AudioContext, so this is unit-testable.
 */

/** @typedef {{id:string, root:number, scale:number[], chord:number[],
 *             tempo:number, padGain:number, bellGain:number, bassGain:number,
 *             pulse:boolean}} MusicScene */

/**
 * States with no scene of their own, rendered by the scene they borrow.
 * @type {Readonly<Record<string, string>>}
 */
export const MUSIC_ALIASES = Object.freeze({
  intense: 'battle',
  boss: 'battle',
});

/** @type {Object<string, MusicScene>} */
export const MUSIC_SCENES = Object.freeze({
  // Calm, low, unresolved — the keep at dusk.
  menu: Object.freeze({
    id: 'menu',
    root: 110.0, // A2
    scale: [0, 2, 3, 5, 7, 8, 10], // aeolian
    chord: [0, 7, 12, 15], // A E A C — open fifth, minor third
    tempo: 56,
    padGain: 0.2,
    bellGain: 0.085,
    bassGain: 0.13,
    pulse: false,
  }),
  // The map: dorian, a fourth above the menu so leaving the menu lifts.
  realm: Object.freeze({
    id: 'realm',
    root: 98.0, // G2
    scale: [0, 2, 3, 5, 7, 9, 10],
    chord: [0, 7, 12, 14], // G D G A
    tempo: 52,
    padGain: 0.22,
    bellGain: 0.09,
    bassGain: 0.14,
    pulse: false,
  }),
  // The forge: phrygian's flat second is the anvil's heat.
  forge: Object.freeze({
    id: 'forge',
    root: 87.31, // F2
    scale: [0, 1, 3, 5, 7, 8, 10],
    chord: [0, 7, 12, 13],
    tempo: 66,
    padGain: 0.18,
    bellGain: 0.08,
    bassGain: 0.16,
    pulse: false,
  }),
  // The war room: mixolydian, the brightest mode in the set.
  warroom: Object.freeze({
    id: 'warroom',
    root: 130.81, // C3
    scale: [0, 2, 4, 5, 7, 9, 10],
    chord: [0, 7, 12, 16],
    tempo: 74,
    padGain: 0.17,
    bellGain: 0.075,
    bassGain: 0.12,
    pulse: false,
  }),
  // A real battle needs a pulse; 108 BPM is a march, not a dance track.
  battle: Object.freeze({
    id: 'battle',
    root: 82.41, // E2
    scale: [0, 2, 3, 5, 7, 8, 10],
    chord: [0, 7, 12, 19],
    tempo: 108,
    padGain: 0.15,
    bellGain: 0.06,
    bassGain: 0.18,
    pulse: true,
  }),
  victory: Object.freeze({
    id: 'victory',
    root: 130.81, // C3, major
    scale: [0, 2, 4, 5, 7, 9, 11],
    chord: [0, 4, 7, 12],
    tempo: 84,
    padGain: 0.2,
    bellGain: 0.11,
    bassGain: 0.16,
    pulse: false,
  }),
  defeat: Object.freeze({
    id: 'defeat',
    root: 103.83, // Ab2 — the flattened tonic of the set
    scale: [0, 2, 3, 5, 7, 8, 10],
    chord: [0, 3, 7, 12],
    tempo: 46,
    padGain: 0.19,
    bellGain: 0.06,
    bassGain: 0.14,
    pulse: false,
  }),
});

export const MUSIC_SCENE_IDS = Object.freeze(Object.keys(MUSIC_SCENES));

/**
 * Look a scene up, falling back to the realm rather than to silence: a typo in
 * a caller must not leave the game mute.
 * @param {string} id
 * @returns {MusicScene}
 */
export function musicScene(id) {
  // Request 44 added two combat states that are played from recorded tracks
  // (`intense`, `boss`). They deliberately have **no scene of their own**: the
  // oscillator bed's rules — one pulsing scene, the battle the fastest — are
  // what keep the fallback sounding like a battle rather than a second
  // soundtrack, so both states borrow it when a file is unavailable.
  const alias = MUSIC_ALIASES[id];
  if (alias) return MUSIC_SCENES[alias];
  return MUSIC_SCENES[id] || MUSIC_SCENES.realm;
}

/** Frequency of a scale/interval offset from a scene root, in Hz. */
export function noteHz(root, semitones = 0) {
  return root * Math.pow(2, semitones / 12);
}

/**
 * The note a beat plays, as a semitone offset from the root.
 *
 * Deterministic on purpose: the same scene always plays the same phrase, so the
 * menu has an identity instead of a different tune every visit. The walk climbs
 * the scale in thirds, wraps, and skips the root accent beats the bass already
 * covers.
 *
 * @param {MusicScene} scene
 * @param {number} beat non-negative beat counter
 * @param {number} [octaves=2] how far above the root the melody sits
 */
export function melodyOffset(scene, beat, octaves = 2) {
  const scale = scene.scale;
  const index = (beat * 2 + Math.floor(beat / 4) * 3) % scale.length;
  return scale[index] + 12 * octaves;
}
