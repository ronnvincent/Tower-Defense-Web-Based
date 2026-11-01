/**
 * TextureFactory — draws every sprite procedurally with the Canvas 2D API into
 * Phaser CanvasTextures. No external image files are required, so the game is
 * always playable even offline or if an asset server fails.
 *
 * All sprites face RIGHT (angle 0) so they can be rotated toward a target.
 */

/**
 * True when a loader somewhere in the game is already fetching this key.
 *
 * The HTML menu can hand the player a battle before `BootScene` finishes
 * creating its procedural fallbacks. In that window `GameScene.preload` has
 * already queued the real fx pack, so a fallback canvas drawn now would collide
 * with the file when it lands ("Texture key already in use" — Phaser keeps the
 * canvas and drops the painted art). The pack wins; the fallback stays unused.
 */
function queuedElsewhere(scene, key) {
  try {
    // Every scene, not just the active ones: a battle in LOADING is precisely
    // the case this guard exists for, and `isActive()` is false while loading.
    const scenes = scene?.game?.scene?.scenes || scene?.game?.scene?.getScenes?.(false) || [];
    return scenes.some((other) => Boolean(other?.load?.list?.[key]));
  } catch (error) {
    return false;
  }
}

/** Create (or replace) a canvas texture and draw into it. */
export function canvasTexture(scene, key, width, height, draw) {
  if (scene.textures.exists(key)) return scene.textures.get(key);
  if (queuedElsewhere(scene, key)) return null;
  const texture = scene.textures.createCanvas(key, width, height);
  const ctx = texture.getContext();
  ctx.save();
  draw(ctx, width, height);
  ctx.restore();
  texture.refresh();
  return texture;
}

const TAU = Math.PI * 2;

function circle(ctx, x, y, r, fill, stroke, lineWidth = 2) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.lineWidth = lineWidth;
    ctx.strokeStyle = stroke;
    ctx.stroke();
  }
}

function radial(ctx, x, y, r0, r1, stops) {
  const g = ctx.createRadialGradient(x, y, r0, x, y, r1);
  for (const [offset, color] of stops) g.addColorStop(offset, color);
  return g;
}

function linear(ctx, x0, y0, x1, y1, stops) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  for (const [offset, color] of stops) g.addColorStop(offset, color);
  return g;
}

function polygon(ctx, points, fill, stroke, lineWidth = 2) {
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
  ctx.closePath();
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.lineWidth = lineWidth;
    ctx.strokeStyle = stroke;
    ctx.stroke();
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/* ------------------------------------------------------------------ effects */

function makeEffects(scene) {
  canvasTexture(scene, 'spark', 16, 16, (ctx) => {
    ctx.fillStyle = radial(ctx, 8, 8, 0, 8, [
      [0, 'rgba(255,255,255,1)'],
      [0.4, 'rgba(255,255,255,0.8)'],
      [1, 'rgba(255,255,255,0)'],
    ]);
    ctx.fillRect(0, 0, 16, 16);
  });

  canvasTexture(scene, 'glow', 128, 128, (ctx) => {
    ctx.fillStyle = radial(ctx, 64, 64, 0, 64, [
      [0, 'rgba(255,255,255,0.9)'],
      [0.35, 'rgba(255,255,255,0.35)'],
      [1, 'rgba(255,255,255,0)'],
    ]);
    ctx.fillRect(0, 0, 128, 128);
  });

  canvasTexture(scene, 'shadow', 64, 32, (ctx) => {
    ctx.fillStyle = radial(ctx, 32, 16, 0, 30, [
      [0, 'rgba(0,0,0,0.55)'],
      [1, 'rgba(0,0,0,0)'],
    ]);
    ctx.scale(1, 0.5);
    ctx.beginPath();
    ctx.arc(32, 32, 30, 0, TAU);
    ctx.fill();
  });

  canvasTexture(scene, 'chevron', 20, 20, (ctx) => {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(255,236,190,0.95)';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(6, 4);
    ctx.lineTo(14, 10);
    ctx.lineTo(6, 16);
    ctx.stroke();
  });

  canvasTexture(scene, 'smoke', 32, 32, (ctx) => {
    ctx.fillStyle = radial(ctx, 16, 16, 0, 16, [
      [0, 'rgba(200,200,210,0.7)'],
      [1, 'rgba(200,200,210,0)'],
    ]);
    ctx.fillRect(0, 0, 32, 32);
  });

  canvasTexture(scene, 'shard', 10, 10, (ctx) => {
    polygon(ctx, [[5, 0], [10, 5], [5, 10], [0, 5]], '#d8f7ff');
  });

  // Shielding creeps wear this bubble. It was referenced long before it was
  // drawn, so every shielded enemy used to render Phaser's missing-texture
  // placeholder — a black square with green diagonals over the monster. Drawn
  // white so `setTint()` can colour it per shield element.
  canvasTexture(scene, 'shield-barrier', 96, 96, (ctx) => {
    ctx.fillStyle = radial(ctx, 48, 48, 0, 48, [
      [0, 'rgba(255,255,255,0.05)'],
      [0.62, 'rgba(255,255,255,0.12)'],
      [1, 'rgba(255,255,255,0)'],
    ]);
    ctx.fillRect(0, 0, 96, 96);

    // Hexagonal force field, flat-top, with a bright rim and dim facets.
    const hex = [];
    for (let i = 0; i < 6; i += 1) {
      const a = (Math.PI / 3) * i - Math.PI / 6;
      hex.push([48 + Math.cos(a) * 42, 48 + Math.sin(a) * 42]);
    }
    polygon(ctx, hex, 'rgba(255,255,255,0.10)', 'rgba(255,255,255,0.85)', 3);
    ctx.strokeStyle = 'rgba(255,255,255,0.28)';
    ctx.lineWidth = 1.5;
    for (const [x, y] of hex) {
      ctx.beginPath();
      ctx.moveTo(48, 48);
      ctx.lineTo(x, y);
      ctx.stroke();
    }
    // Two specular arcs so the bubble reads as glass rather than a hexagon.
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(48, 48, 37, Math.PI * 1.08, Math.PI * 1.32);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(48, 48, 33, Math.PI * 1.52, Math.PI * 1.66);
    ctx.stroke();
  });

  // Rotating ring under an ascended defence: no canvas stand-in here.
  //
  // `fx-aura-ring` is a painted 160 px sheet in the fx pack (see
  // `src/data/fxManifest.js`). Baking a 128 px canvas under the same key meant
  // that whichever finished first won, and when the pack landed second Phaser
  // logged "Texture key already in use" and threw the painted ring away. The
  // pack is always shipped with the build, so the ring comes from there and
  // `Tower` already guards on `textures.exists`.
}

/* ------------------------------------------------------------------- towers */

function towerBase(ctx, accent) {
  // Drop shadow
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(32, 38, 27, 20, 0, 0, TAU);
  ctx.fill();
  // Octagonal stone plinth
  const pts = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + Math.PI / 8;
    pts.push([32 + Math.cos(a) * 26, 32 + Math.sin(a) * 26]);
  }
  polygon(ctx, pts, linear(ctx, 0, 6, 0, 58, [[0, '#7d8597'], [1, '#3d4354']]), '#22263a', 2.5);
  // Inner ring
  circle(ctx, 32, 32, 19, linear(ctx, 0, 13, 0, 51, [[0, '#5a6175'], [1, '#2c3142']]), accent, 2.5);
  // Bolts
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + Math.PI / 4;
    circle(ctx, 32 + Math.cos(a) * 22.5, 32 + Math.sin(a) * 22.5, 2, '#c9cfdd');
  }
}

function makeTowers(scene) {
  canvasTexture(scene, 'tower-base-archer', 64, 64, (ctx) => towerBase(ctx, '#f5c451'));
  canvasTexture(scene, 'tower-base-cannon', 64, 64, (ctx) => towerBase(ctx, '#ff7a59'));
  canvasTexture(scene, 'tower-base-frost', 64, 64, (ctx) => towerBase(ctx, '#4ee1ff'));

  // Archer: wooden crossbow (faces right)
  canvasTexture(scene, 'tower-top-archer', 64, 64, (ctx) => {
    ctx.lineCap = 'round';
    // bow limbs
    ctx.strokeStyle = '#8a5a2b';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(30, 32, 17, -Math.PI / 2.4, Math.PI / 2.4);
    ctx.stroke();
    ctx.strokeStyle = '#c98b47';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(30, 32, 17, -Math.PI / 2.4, Math.PI / 2.4);
    ctx.stroke();
    // string
    ctx.strokeStyle = '#f3e6c4';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(30 + 17 * Math.cos(-Math.PI / 2.4), 32 + 17 * Math.sin(-Math.PI / 2.4));
    ctx.lineTo(24, 32);
    ctx.lineTo(30 + 17 * Math.cos(Math.PI / 2.4), 32 + 17 * Math.sin(Math.PI / 2.4));
    ctx.stroke();
    // stock
    roundRect(ctx, 18, 29, 30, 6, 3);
    ctx.fillStyle = '#6b4423';
    ctx.fill();
    // loaded bolt
    ctx.strokeStyle = '#e8e8e8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(24, 32);
    ctx.lineTo(54, 32);
    ctx.stroke();
    polygon(ctx, [[58, 32], [52, 28.5], [52, 35.5]], '#f5c451');
    // hub
    circle(ctx, 28, 32, 6, '#f5c451', '#7a5a14', 2);
  });

  // Cannon: iron barrel (faces right)
  canvasTexture(scene, 'tower-top-cannon', 64, 64, (ctx) => {
    roundRect(ctx, 26, 23, 32, 18, 5);
    ctx.fillStyle = linear(ctx, 0, 23, 0, 41, [[0, '#6c7386'], [0.5, '#2d3140'], [1, '#191b24']]);
    ctx.fill();
    ctx.strokeStyle = '#11131a';
    ctx.lineWidth = 2;
    ctx.stroke();
    roundRect(ctx, 52, 21, 8, 22, 3);
    ctx.fillStyle = '#3a3f50';
    ctx.fill();
    ctx.stroke();
    circle(ctx, 59, 32, 4.5, '#0b0c10');
    // reinforcement bands
    ctx.fillStyle = '#ff7a59';
    ctx.fillRect(36, 23, 3, 18);
    ctx.fillRect(44, 23, 3, 18);
    // turret dome
    circle(ctx, 28, 32, 13, radial(ctx, 24, 27, 2, 14, [[0, '#8b93a8'], [1, '#2a2e3b']]), '#11131a', 2);
    circle(ctx, 28, 32, 4, '#ff7a59');
  });

  // Frost: floating crystal (not rotated, it bobs)
  canvasTexture(scene, 'tower-top-frost', 64, 64, (ctx) => {
    ctx.fillStyle = radial(ctx, 32, 30, 0, 26, [[0, 'rgba(78,225,255,0.55)'], [1, 'rgba(78,225,255,0)']]);
    ctx.fillRect(0, 0, 64, 64);
    polygon(ctx, [[32, 6], [44, 26], [32, 52], [20, 26]], linear(ctx, 20, 6, 44, 52, [[0, '#e6fbff'], [0.5, '#6fe6ff'], [1, '#1b7fb0']]), '#c9f6ff', 1.5);
    polygon(ctx, [[32, 6], [44, 26], [32, 30]], 'rgba(255,255,255,0.45)');
    polygon(ctx, [[15, 24], [21, 32], [15, 42], [10, 32]], '#7fe9ff', '#d8f7ff', 1);
    polygon(ctx, [[49, 24], [54, 32], [49, 42], [43, 32]], '#7fe9ff', '#d8f7ff', 1);
  });

  // Barricade: spiked wooden palisade on the road
  canvasTexture(scene, 'barricade', 64, 64, (ctx) => {
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(32, 46, 26, 9, 0, 0, TAU);
    ctx.fill();
    for (let i = 0; i < 5; i++) {
      const x = 10 + i * 11;
      polygon(ctx, [[x - 4.5, 50], [x - 4.5, 20], [x, 11], [x + 4.5, 20], [x + 4.5, 50]], linear(ctx, x - 5, 0, x + 5, 0, [[0, '#a87645'], [1, '#6b4423']]), '#3b2412', 1.5);
    }
    ctx.fillStyle = '#5a3a1e';
    ctx.fillRect(4, 26, 56, 6);
    ctx.fillRect(4, 39, 56, 6);
    ctx.fillStyle = '#c9cfdd';
    for (let i = 0; i < 5; i++) {
      circle(ctx, 10 + i * 11, 29, 1.6, '#c9cfdd');
      circle(ctx, 10 + i * 11, 42, 1.6, '#c9cfdd');
    }
  });
}

/* ------------------------------------------------------------------ enemies */

function eyes(ctx, x, y, spread, r, color = '#fff', pupil = '#111') {
  circle(ctx, x, y - spread, r, color);
  circle(ctx, x, y + spread, r, color);
  circle(ctx, x + r * 0.35, y - spread, r * 0.5, pupil);
  circle(ctx, x + r * 0.35, y + spread, r * 0.5, pupil);
}

function makeEnemies(scene) {
  // Grunt: round goblin with ears
  canvasTexture(scene, 'enemy-grunt', 44, 44, (ctx) => {
    polygon(ctx, [[18, 8], [10, 1], [24, 9]], '#b85a2a');
    polygon(ctx, [[18, 36], [10, 43], [24, 35]], '#b85a2a');
    circle(ctx, 22, 22, 15, radial(ctx, 18, 17, 2, 16, [[0, '#ffb07a'], [1, '#d4612b']]), '#5a2410', 2.5);
    roundRect(ctx, 7, 12, 8, 20, 3);
    ctx.fillStyle = '#6b4423';
    ctx.fill();
    eyes(ctx, 29, 22, 5.5, 3.6);
  });

  // Runner: sleek dart
  canvasTexture(scene, 'enemy-runner', 40, 40, (ctx) => {
    polygon(ctx, [[38, 20], [10, 5], [16, 20], [10, 35]], linear(ctx, 10, 0, 38, 0, [[0, '#6e8f1f'], [1, '#d8ff6a']]), '#2e3d08', 2);
    polygon(ctx, [[10, 5], [2, 9], [12, 14]], 'rgba(198,242,92,0.6)');
    polygon(ctx, [[10, 35], [2, 31], [12, 26]], 'rgba(198,242,92,0.6)');
    circle(ctx, 27, 20, 3, '#1b2205');
    circle(ctx, 28, 20, 1.5, '#fffbcf');
  });

  // Brute: armoured hexagon
  canvasTexture(scene, 'enemy-brute', 56, 56, (ctx) => {
    const pts = [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      pts.push([28 + Math.cos(a) * 24, 28 + Math.sin(a) * 24]);
    }
    polygon(ctx, pts, radial(ctx, 23, 22, 3, 26, [[0, '#c7b6ff'], [1, '#5b3fb8']]), '#22144d', 3);
    const inner = pts.map(([x, y]) => [28 + (x - 28) * 0.62, 28 + (y - 28) * 0.62]);
    polygon(ctx, inner, 'rgba(34,20,77,0.35)', '#d9ceff', 1.5);
    for (const [x, y] of pts) circle(ctx, 28 + (x - 28) * 0.82, 28 + (y - 28) * 0.82, 2.2, '#e8e2ff');
    roundRect(ctx, 32, 22, 12, 12, 3);
    ctx.fillStyle = '#1a0f3a';
    ctx.fill();
    circle(ctx, 40, 25, 2, '#ff5470');
    circle(ctx, 40, 31, 2, '#ff5470');
  });

  // Warlord: horned crimson boss with crown
  canvasTexture(scene, 'enemy-warlord', 72, 72, (ctx) => {
    ctx.fillStyle = radial(ctx, 36, 36, 10, 36, [[0, 'rgba(255,77,109,0.45)'], [1, 'rgba(255,77,109,0)']]);
    ctx.fillRect(0, 0, 72, 72);
    polygon(ctx, [[42, 14], [56, 2], [50, 20]], '#efe3c8', '#5c1020', 1.5);
    polygon(ctx, [[42, 58], [56, 70], [50, 52]], '#efe3c8', '#5c1020', 1.5);
    circle(ctx, 36, 36, 25, radial(ctx, 30, 29, 3, 26, [[0, '#ff8fa3'], [0.6, '#d62346'], [1, '#6e0b1f']]), '#3a0410', 3);
    // crown
    polygon(ctx, [[14, 22], [24, 26], [20, 36], [24, 46], [14, 50], [18, 36]], '#f5c451', '#7a5a14', 1.5);
    circle(ctx, 16, 36, 2.5, '#4ee1ff');
    // eyes
    eyes(ctx, 46, 36, 8, 4.5, '#ffe14d', '#3a0410');
    ctx.strokeStyle = '#3a0410';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(40, 24);
    ctx.lineTo(50, 28);
    ctx.moveTo(40, 48);
    ctx.lineTo(50, 44);
    ctx.stroke();
  });
}

/* -------------------------------------------------------------- projectiles */

function makeProjectiles(scene) {
  canvasTexture(scene, 'proj-arrow', 26, 8, (ctx) => {
    ctx.strokeStyle = '#f3e6c4';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(2, 4);
    ctx.lineTo(20, 4);
    ctx.stroke();
    polygon(ctx, [[26, 4], [19, 0.5], [19, 7.5]], '#f5c451');
    polygon(ctx, [[0, 1], [6, 4], [0, 7]], '#ff7a59');
  });

  canvasTexture(scene, 'proj-cannonball', 18, 18, (ctx) => {
    circle(ctx, 9, 9, 7, radial(ctx, 7, 6, 1, 8, [[0, '#9aa2b5'], [1, '#14161d']]), '#0b0c10', 1.5);
  });

  canvasTexture(scene, 'proj-frost', 20, 20, (ctx) => {
    ctx.fillStyle = radial(ctx, 10, 10, 0, 10, [[0, 'rgba(230,251,255,1)'], [0.45, 'rgba(78,225,255,0.9)'], [1, 'rgba(78,225,255,0)']]);
    ctx.fillRect(0, 0, 20, 20);
  });
}

/* ---------------------------------------------------------- portal and base */

function makeLandmarks(scene) {
  canvasTexture(scene, 'portal', 96, 96, (ctx) => {
    ctx.fillStyle = radial(ctx, 48, 48, 4, 48, [[0, 'rgba(20,6,40,1)'], [0.5, 'rgba(110,60,220,0.85)'], [0.8, 'rgba(155,123,255,0.45)'], [1, 'rgba(155,123,255,0)']]);
    ctx.fillRect(0, 0, 96, 96);
    ctx.lineCap = 'round';
    for (let arm = 0; arm < 4; arm++) {
      ctx.strokeStyle = arm % 2 ? 'rgba(210,190,255,0.85)' : 'rgba(255,120,220,0.7)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (let t = 0; t <= 1; t += 0.04) {
        const a = arm * (TAU / 4) + t * 4.2;
        const r = 6 + t * 30;
        const x = 48 + Math.cos(a) * r;
        const y = 48 + Math.sin(a) * r;
        if (t === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  });


  canvasTexture(scene, 'base-crystal', 48, 72, (ctx) => {
    polygon(ctx, [[24, 2], [42, 26], [24, 70], [6, 26]], linear(ctx, 6, 2, 42, 70, [[0, '#f0fdff'], [0.45, '#4ee1ff'], [1, '#1460a0']]), '#d8f7ff', 2);
    polygon(ctx, [[24, 2], [42, 26], [24, 34]], 'rgba(255,255,255,0.5)');
    polygon(ctx, [[6, 26], [24, 34], [24, 70]], 'rgba(10,40,80,0.35)');
  });
}

/* ------------------------------------------------------------------- walls */

/**
 * The five wall tiers, drawn as 64x64 tiles.
 *
 * A wall segment fills the whole tile, edge to edge. That is what makes a run of
 * segments read as one continuous rampart instead of a row of isolated props —
 * the pieces touch on every side, so a player-drawn perimeter has no seams.
 * Each tier is a different material, not a recolour: sharpened stakes, banded
 * planks, laid stone, crenellated fortification, and finally a gold-trimmed
 * imperial rampart.
 *
 * Damage is drawn on top at runtime (`Tower.drawDamageOverlay`), so one texture
 * per tier covers every health state without a second art set.
 */
function makeWalls(scene) {
  const rivet = (ctx, x, y, fill = '#cfd6e4', stroke = '#2b3242', r = 1.9) => {
    circle(ctx, x, y, r, fill, stroke, 1);
  };

  // Tier 1 — wooden palisade: sharpened stakes, lashed rails, full bleed.
  canvasTexture(scene, 'wall-t1', 64, 64, (ctx) => {
    ctx.fillStyle = '#3b2412';
    ctx.fillRect(0, 0, 64, 64);
    for (let i = 0; i < 6; i += 1) {
      const x = i * 10.7;
      polygon(
        ctx,
        [[x, 64], [x, 14], [x + 5.3, 3], [x + 10.7, 14], [x + 10.7, 64]],
        linear(ctx, x, 3, x + 10.7, 64, [[0, '#c99259'], [0.5, '#9c6631'], [1, '#5d3a19']]),
        '#2f1c0c',
        1.2
      );
      ctx.fillStyle = 'rgba(255,225,180,0.16)';
      ctx.fillRect(x + 1.6, 18, 1.8, 42);
    }
    ctx.fillStyle = '#4d2f16';
    ctx.fillRect(0, 26, 64, 5.5);
    ctx.fillRect(0, 46, 64, 5.5);
    for (let i = 0; i < 6; i += 1) {
      rivet(ctx, 5.3 + i * 10.7, 28.7, '#b08d5f', '#2f1c0c', 1.7);
      rivet(ctx, 5.3 + i * 10.7, 48.7, '#b08d5f', '#2f1c0c', 1.7);
    }
  });

  // Tier 2 — reinforced wood: heavy planks, iron bands, full bleed.
  canvasTexture(scene, 'wall-t2', 64, 64, (ctx) => {
    for (let i = 0; i < 4; i += 1) {
      const x = i * 16;
      ctx.fillStyle = linear(ctx, x, 0, x + 16, 64, [[0, '#8a5a2c'], [1, '#42260f']]);
      ctx.fillRect(x, 0, 16, 64);
      ctx.strokeStyle = '#1f1104';
      ctx.lineWidth = 1.6;
      ctx.strokeRect(x, 0, 16, 64);
      ctx.fillStyle = 'rgba(255,220,170,0.10)';
      ctx.fillRect(x + 2, 2, 2.6, 60);
    }
    for (const y of [12, 31, 50]) {
      ctx.fillStyle = linear(ctx, 0, y, 64, y + 6, [[0, '#7d8798'], [0.5, '#cdd7e5'], [1, '#5d6675']]);
      ctx.fillRect(0, y, 64, 6);
      ctx.strokeStyle = '#161b23';
      ctx.lineWidth = 1.2;
      ctx.strokeRect(0, y, 64, 6);
      for (let i = 0; i < 7; i += 1) rivet(ctx, 4.6 + i * 9.2, y + 3);
    }
  });

  // Tier 3 — stone wall: three laid courses with offset joints, full bleed.
  canvasTexture(scene, 'wall-t3', 64, 64, (ctx) => {
    ctx.fillStyle = '#2f3540';
    ctx.fillRect(0, 0, 64, 64);
    const courses = [
      { y: 0, h: 21, offset: 0 },
      { y: 21, h: 21, offset: 11 },
      { y: 42, h: 22, offset: 3 },
    ];
    for (const { y, h, offset } of courses) {
      let x = -offset;
      while (x < 64) {
        const w = 22;
        ctx.fillStyle = linear(ctx, x, y, x + w, y + h, [[0, '#9aa3b1'], [0.55, '#7c8694'], [1, '#59616e']]);
        ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
        ctx.strokeStyle = '#242a34';
        ctx.lineWidth = 1.4;
        ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
        ctx.fillStyle = 'rgba(255,255,255,0.13)';
        ctx.fillRect(x + 3, y + 2.4, w - 6, 1.8);
        x += w;
      }
    }
  });

  // Tier 4 — fortified stone: crenellated ridge, iron studs, full bleed.
  canvasTexture(scene, 'wall-t4', 64, 64, (ctx) => {
    ctx.fillStyle = '#252b36';
    ctx.fillRect(0, 0, 64, 64);
    for (let i = 0; i < 4; i += 1) {
      const x = i * 16;
      ctx.fillStyle = linear(ctx, x, 2, x + 16, 22, [[0, '#b7c1cf'], [1, '#69727f']]);
      ctx.fillRect(x + 1, 2, 14, 20);
      ctx.strokeStyle = '#1c222b';
      ctx.lineWidth = 1.4;
      ctx.strokeRect(x + 1, 2, 14, 20);
    }
    ctx.fillStyle = linear(ctx, 0, 22, 0, 64, [[0, '#8f99a8'], [0.6, '#6d7787'], [1, '#454d59']]);
    ctx.fillRect(0, 22, 64, 42);
    ctx.strokeStyle = 'rgba(18,23,30,0.9)';
    ctx.lineWidth = 1.5;
    for (const y of [32, 44, 56]) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(64, y);
      ctx.stroke();
    }
    for (let row = 0; row < 3; row += 1) {
      for (let i = 0; i < 3; i += 1) {
        const x = 8 + i * 20 + (row % 2 ? 10 : 0);
        ctx.beginPath();
        ctx.moveTo(x, 22 + row * 14);
        ctx.lineTo(x, 22 + row * 14 + 14);
        ctx.stroke();
      }
    }
    for (let i = 0; i < 4; i += 1) rivet(ctx, 9 + i * 15, 26.4, '#dbe3ef', '#1c222b');
    ctx.fillStyle = linear(ctx, 0, 0, 0, 4, [[0, '#aab4c2'], [1, '#5c6470']]);
    ctx.fillRect(0, 0, 64, 4);
  });

  // Tier 5 — imperial fortress: dark stone, gold band, crest, full bleed.
  canvasTexture(scene, 'wall-t5', 64, 64, (ctx) => {
    ctx.fillStyle = '#17130d';
    ctx.fillRect(0, 0, 64, 64);
    for (let i = 0; i < 4; i += 1) {
      const x = i * 16;
      ctx.fillStyle = linear(ctx, x, 0, x + 16, 20, [[0, '#8b6f43'], [0.5, '#5c4a2f'], [1, '#3a2f1e']]);
      ctx.fillRect(x + 0.5, 0, 15, 18);
      ctx.strokeStyle = '#0f0c08';
      ctx.lineWidth = 1.3;
      ctx.strokeRect(x + 0.5, 0, 15, 18);
      ctx.fillStyle = linear(ctx, x, 18, x + 15, 22, [[0, '#ffe8a8'], [0.5, '#dfb257'], [1, '#9a6f1d']]);
      ctx.fillRect(x + 0.5, 18, 15, 4);
    }
    ctx.fillStyle = linear(ctx, 0, 22, 0, 64, [[0, '#6a5a44'], [0.45, '#4b4034'], [1, '#241d15']]);
    ctx.fillRect(0, 22, 64, 42);
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 1.3;
    for (const y of [33, 45, 57]) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(64, y);
      ctx.stroke();
    }
    for (let row = 0; row < 3; row += 1) {
      for (let i = 0; i < 3; i += 1) {
        const x = 9 + i * 20 + (row % 2 ? 10 : 0);
        ctx.beginPath();
        ctx.moveTo(x, 22 + row * 12);
        ctx.lineTo(x, 22 + row * 12 + 12);
        ctx.stroke();
      }
    }
    ctx.fillStyle = '#2b241a';
    ctx.fillRect(20, 30, 24, 22);
    ctx.strokeStyle = '#e0b357';
    ctx.lineWidth = 2;
    ctx.strokeRect(20, 30, 24, 22);
    polygon(ctx, [[32, 34], [38, 40], [32, 47], [26, 40]], linear(ctx, 26, 34, 38, 47, [[0, '#ffeeb8'], [1, '#c8952f']]), '#4a3510', 1.1);
    for (let i = 0; i < 4; i += 1) rivet(ctx, 9 + i * 15, 26, '#ffe7a6', '#3a2c10');
  });

  // Rubble left behind when a wall falls — one texture, tinted per tier.
  canvasTexture(scene, 'wall-rubble', 64, 64, (ctx) => {
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fillRect(6, 30, 52, 24);
    const bits = [
      [12, 44, 11, 7], [24, 50, 13, 6], [38, 45, 10, 7], [50, 49, 9, 6], [30, 36, 9, 6],
    ];
    for (const [x, y, w, h] of bits) {
      ctx.fillStyle = '#6a6257';
      ctx.fillRect(x - w / 2, y - h / 2, w, h);
      ctx.strokeStyle = '#241f19';
      ctx.lineWidth = 1;
      ctx.strokeRect(x - w / 2, y - h / 2, w, h);
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(x - w / 2 + 1, y - h / 2 + 1, w - 2, 1.4);
    }
  });
}

/** Generate every texture used by the game. Called once from BootScene. */
export function generateAllTextures(scene) {
  makeEffects(scene);
  makeTowers(scene);
  makeEnemies(scene);
  makeProjectiles(scene);
  makeLandmarks(scene);
  makeWalls(scene);
}
