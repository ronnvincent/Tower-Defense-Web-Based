/**
 * TextureFactory — draws every sprite procedurally with the Canvas 2D API into
 * Phaser CanvasTextures. No external image files are required, so the game is
 * always playable even offline or if an asset server fails.
 *
 * All sprites face RIGHT (angle 0) so they can be rotated toward a target.
 */

/** Create (or replace) a canvas texture and draw into it. */
export function canvasTexture(scene, key, width, height, draw) {
  if (scene.textures.exists(key)) return scene.textures.get(key);
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

  canvasTexture(scene, 'base-platform', 80, 80, (ctx) => {
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath();
    ctx.ellipse(40, 46, 34, 26, 0, 0, TAU);
    ctx.fill();
    const pts = [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + Math.PI / 6;
      pts.push([40 + Math.cos(a) * 32, 40 + Math.sin(a) * 32]);
    }
    polygon(ctx, pts, linear(ctx, 0, 8, 0, 72, [[0, '#8790a6'], [1, '#353b4d']]), '#1d2131', 3);
    const inner = pts.map(([x, y]) => [40 + (x - 40) * 0.7, 40 + (y - 40) * 0.7]);
    polygon(ctx, inner, '#262b3a', 'rgba(78,225,255,0.8)', 2);
  });

  canvasTexture(scene, 'base-crystal', 48, 72, (ctx) => {
    polygon(ctx, [[24, 2], [42, 26], [24, 70], [6, 26]], linear(ctx, 6, 2, 42, 70, [[0, '#f0fdff'], [0.45, '#4ee1ff'], [1, '#1460a0']]), '#d8f7ff', 2);
    polygon(ctx, [[24, 2], [42, 26], [24, 34]], 'rgba(255,255,255,0.5)');
    polygon(ctx, [[6, 26], [24, 34], [24, 70]], 'rgba(10,40,80,0.35)');
  });
}

/** Generate every texture used by the game. Called once from BootScene. */
export function generateAllTextures(scene) {
  makeEffects(scene);
  makeTowers(scene);
  makeEnemies(scene);
  makeProjectiles(scene);
  makeLandmarks(scene);
}
