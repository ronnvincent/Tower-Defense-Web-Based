import { TILE_SIZE } from '../config/gameConfig.js';
import { clamp } from '../camera/cameraMath.js';

/**
 * Floating "upgrade" badge that hovers above every defence.
 *
 * Why a badge at all?
 * -------------------
 * The old flow made players guess: build a tower → remember it exists → click
 * the exact tile again → find the upgrade button in a side panel. The badge
 * puts the *next action* (and its price) directly above the tower, so a glance
 * at the battlefield answers "what can I upgrade, and can I afford it?".
 *
 * `badgeModel` is pure (no Phaser) so the rules are unit tested.
 */

export const BADGE = Object.freeze({
  width: 62,
  height: 21,
  gap: 11, // px between the top of the tower art and the bottom of the badge
  minY: 20, // never let a badge leave the world at the top row
  minScale: 0.7,
  maxScale: 1.55,
});

const TONE = {
  affordable: {
    fill: 0x1d1409,
    fillAlpha: 0.94,
    stroke: 0xf5c451,
    text: '#ffe6a8',
    glow: 0xf5c451,
  },
  locked: {
    fill: 0x161310,
    fillAlpha: 0.82,
    stroke: 0x6d6252,
    text: '#c3b6a1',
    glow: null,
  },
  selected: {
    fill: 0x0a1a20,
    fillAlpha: 0.95,
    stroke: 0x4ee1ff,
    text: '#c8f6ff',
    glow: 0x4ee1ff,
  },
};

/**
 * Decide what the badge above one defence should show.
 * @param {object} tower anything with `nextUpgrades` and `level`
 * @param {number} coins currently held gold
 */
export function badgeModel(tower, coins) {
  const options = tower && tower.nextUpgrades ? tower.nextUpgrades : [];
  if (!options.length) {
    return { visible: false, state: 'hidden', label: '', cost: null, branch: false, affordable: false };
  }

  let cost = Infinity;
  for (const option of options) {
    if (typeof option.upgradeCost === 'number') cost = Math.min(cost, option.upgradeCost);
  }
  if (!Number.isFinite(cost)) cost = 0;

  const branch = options.length > 1;
  const affordable = coins >= cost;

  return {
    visible: true,
    state: affordable ? 'affordable' : 'locked',
    cost,
    branch,
    affordable,
    // ▲ = linear upgrade, ✦ = branching specialisation choice
    label: `${branch ? '✦' : '▲'} ${cost}`,
    title: branch
      ? `Choose a specialisation (from ${cost} gold)`
      : `Upgrade to level ${(tower.level || 1) + 1} for ${cost} gold`,
  };
}

/**
 * World-space anchor for the badge above a tile.
 * @param {number} tileTopY  world y of the tile's top edge
 * @param {number} artHeight height of the tower art standing on that tile
 */
export function badgeAnchorY(tileTopY, artHeight) {
  const artTop = tileTopY + TILE_SIZE - Math.max(0, artHeight || 0);
  return Math.max(BADGE.minY, artTop - BADGE.gap);
}

/** Keep the badge a constant size on screen while the world zooms. */
export function badgeScale(zoom) {
  return clamp(1 / (zoom || 1), BADGE.minScale, BADGE.maxScale);
}

/** Does a world-space point fall inside a badge (used for click routing)? */
export function badgeHit(badge, worldX, worldY) {
  const halfW = (BADGE.width * badge.scale) / 2;
  const halfH = (BADGE.height * badge.scale) / 2;
  return (
    Math.abs(worldX - badge.x) <= halfW && Math.abs(worldY - badge.y) <= halfH
  );
}

/* ============================================================ PHASER VIEW */

/**
 * Creates/keeps one badge per defence and routes clicks to the inspector.
 * The scene owns the lifecycle; `sync()` is cheap to call every frame because
 * it only touches a badge when its model actually changed.
 */
export class UpgradeBadges {
  /**
   * @param {Phaser.Scene} scene
   * @param {{ onActivate?: (tower: object) => void }} [callbacks]
   */
  constructor(scene, callbacks = {}) {
    this.scene = scene;
    this.onActivate = callbacks.onActivate || (() => {});
    this.items = new Map(); // tower -> { container, gfx, text, model, levelKey, pop }
    this.visible = true;
    this.selectedTower = null;
  }

  sync(towers, coins) {
    // Remove badges for sold/destroyed towers.
    for (const [tower, item] of this.items) {
      if (!towers.includes(tower)) {
        item.container.destroy();
        this.items.delete(tower);
      }
    }

    for (const tower of towers) {
      const model = badgeModel(tower, coins);
      const existing = this.items.get(tower);
      const levelKey = `${tower.level}:${tower.specialization || ''}`;

      if (!model.visible) {
        if (existing) {
          existing.container.destroy();
          this.items.delete(tower);
        }
        continue;
      }

      if (!existing) {
        const item = this.createBadge(tower, model, levelKey);
        this.items.set(tower, item);
        // Pop-in so a new badge is noticed but never distracting.
        this.scene.tweens.add({
          targets: item,
          pop: 1,
          duration: 240,
          ease: 'Back.easeOut',
        });
        continue;
      }

      if (existing.levelKey !== levelKey || existing.model.cost !== model.cost || existing.model.branch !== model.branch) {
        existing.gfx.clear();
        this.paint(existing.gfx, model, tower === this.selectedTower);
        existing.text.setText(model.label);
        existing.text.setColor(this.tone(model, tower === this.selectedTower).text);
        existing.levelKey = levelKey;
      } else if (existing.model.affordable !== model.affordable) {
        this.paint(existing.gfx, model, tower === this.selectedTower);
        existing.text.setColor(this.tone(model, tower === this.selectedTower).text);
      }
      existing.model = model;
    }
  }

  tone(model, selected) {
    if (selected) return TONE.selected;
    return model.affordable ? TONE.affordable : TONE.locked;
  }

  createBadge(tower, model, levelKey) {
    const scene = this.scene;
    const container = scene.add.container(tower.x, this.anchorFor(tower));
    container.setDepth(44);

    const gfx = scene.add.graphics();
    this.paint(gfx, model, false);
    container.add(gfx);

    const text = scene.add.text(0, 0, model.label, {
      fontFamily: 'Rajdhani, "Segoe UI", sans-serif',
      fontSize: '13px',
      fontStyle: 'bold',
      color: this.tone(model, false).text,
      stroke: '#000000',
      strokeThickness: 2,
    });
    text.setOrigin(0.5, 0.5);
    text.y = 1;
    container.add(text);

    const pop = 0.4;
    container.setScale(badgeScale(this.scene.cameras.main.zoom) * pop);

    return { container, gfx, text, model, levelKey, tower, pop };
  }

  paint(gfx, model, selected) {
    const tone = this.tone(model, selected);
    const w = BADGE.width;
    const h = BADGE.height;
    gfx.clear();
    if (tone.glow) {
      gfx.fillStyle(tone.glow, 0.18);
      gfx.fillRoundedRect(-w / 2 - 3, -h / 2 - 3, w + 6, h + 6, 9);
    }
    gfx.fillStyle(tone.fill, tone.fillAlpha);
    gfx.fillRoundedRect(-w / 2, -h / 2, w, h, 7);
    gfx.lineStyle(1.5, tone.stroke, 1);
    gfx.strokeRoundedRect(-w / 2, -h / 2, w, h, 7);
    // Little pointer tail aimed at the tower's roof.
    gfx.fillStyle(tone.fill, tone.fillAlpha);
    gfx.fillTriangle(-5, h / 2 - 1, 5, h / 2 - 1, 0, h / 2 + 6);
    gfx.lineStyle(1.5, tone.stroke, 1);
    gfx.strokeTriangle(-5, h / 2 - 1, 5, h / 2 - 1, 0, h / 2 + 6);
  }

  anchorFor(tower) {
    const artHeight = typeof tower.artHeight === 'number' ? tower.artHeight : TILE_SIZE;
    return badgeAnchorY(tower.y - TILE_SIZE / 2, artHeight);
  }

  setSelected(tower) {
    this.selectedTower = tower;
    for (const [t, item] of this.items) {
      this.paint(item.gfx, item.model, t === tower);
      item.text.setColor(this.tone(item.model, t === tower).text);
    }
  }

  /** Keep every badge the same apparent size regardless of camera zoom. */
  update(camera) {
    const scale = badgeScale(camera.zoom);
    const view = camera.worldView;
    const pad = 80;
    for (const [tower, item] of this.items) {
      item.container.setScale(scale * (item.pop || 1));
      const x = tower.x;
      const y = item.container.y;
      item.container.setVisible(
        this.visible &&
          x > view.x - pad &&
          x < view.right + pad &&
          y > view.y - pad &&
          y < view.bottom + pad
      );
    }
  }

  setVisible(visible) {
    this.visible = visible;
    for (const [, item] of this.items) item.container.setVisible(visible);
  }

  /** Returns the tower whose badge sits under a world point, if any. */
  hitTest(worldX, worldY) {
    for (const [tower, item] of this.items) {
      if (!item.container.visible) continue;
      if (
        badgeHit(
          { x: item.container.x, y: item.container.y, scale: item.container.scaleX },
          worldX,
          worldY
        )
      ) {
        return tower;
      }
    }
    return null;
  }

  /** Small celebratory pop, used after an upgrade is purchased. */
  pulse(tower) {
    const item = this.items.get(tower);
    if (!item) return;
    this.scene.tweens.add({
      targets: item,
      pop: 1.2,
      duration: 120,
      yoyo: true,
      ease: 'Quad.easeOut',
      onComplete: () => {
        item.pop = 1;
      },
    });
  }

  clear() {
    for (const [, item] of this.items) item.container.destroy();
    this.items.clear();
  }
}
