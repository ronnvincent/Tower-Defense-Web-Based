/**
 * Arena landmark art — the portal gate, the bastion and the river.
 *
 * THE BASTION
 * -----------
 * The keep used to be a painted castle cut from the world-map art. It read as a
 * different game next to this board's flat, outlined tiles, and the brief was
 * blunt about it. It is now a **hand-drawn fortress** from the OpenGameArt
 * "Fortress" pack (CC0), shipped as a vector in `art-source/arena/fortress.svg`
 * and rasterised by `scripts/svg-to-png.mjs` at 420 px — vector source means
 * every battlement stays crisp at any zoom, and the outlined, flat-shaded walls
 * sit naturally on the outlined tiles the board is drawn with.
 *
 * Why the fortress and not the walled *city* that was tried after it: at the
 * 225 px the board actually draws, the city was a clump of roofs, while the
 * fortress reads as one silhouette — a wall, two towers and a gate the road
 * visibly walks into.
 *
 * THE PORTAL
 * ----------
 * The vortex is a real animated spritesheet: 32 frames of 144 px, packed 8×4,
 * composited by `scripts/build_arena_art.sh` from the CC0 Kenney particle art
 * the game already ships. It is authored on black and played with `ADD`, which
 * is why the sheet has no alpha channel — additive blending drops the black and
 * keeps the glow.
 *
 * THE RIVER
 * ---------
 * `river-flow.png` is a seamless ripple layer built by the same script from the
 * CC0 Kenney water-caustics mask. It scrolls sideways over the rift row, which
 * is what makes the line that splits the board read as moving water.
 */

/**
 * How much of the bastion sheet is transparent padding, as a fraction of its
 * height, on the top *and* the bottom edge.
 * `scripts/build_arena_art.sh` rasterises the fortress at 420x374 and then pads
 * it by 6 % of its width and 12 % of its height on every side, which gives a
 * 470x462 sheet and `44 / 462 = 0.0952` of clear space above and below the
 * building. Anything that needs the *building* rather than the texture — the
 * health bar, the shadow — reads this instead of the raw bounds, and the scene
 * anchors the sprite on the bottom padding edge, so the drawing's base sits
 * exactly on the ground line.
 */
export const KEEP_PAD_RATIO = 0.0952;

export const ARENA_ART = Object.freeze({
  bastion: { key: 'bastion-fortress', path: 'assets/arena/bastion-fortress.png' },
  portalArch: { key: 'portal-arch', path: 'assets/arena/portal-arch.png' },
  portalVortex: {
    key: 'portal-vortex',
    path: 'assets/arena/portal-vortex.png',
    frameWidth: 144,
    frameHeight: 144,
    frames: 32,
  },
  riverFlow: { key: 'river-flow', path: 'assets/arena/river-flow.png' },
});

/** Animation key Phaser registers for the portal vortex. */
export const PORTAL_ANIM = 'portal-vortex-idle';
