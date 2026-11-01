import { describe, it, expect } from 'vitest';
import {
  BADGE,
  badgeAnchorY,
  badgeHit,
  badgeModel,
  badgeScale,
  cameraZoom,
} from '../src/ui/UpgradeBadge.js';

const tower = (level, nextUpgrades) => ({ level, nextUpgrades });

describe('upgrade badge model', () => {
  it('is hidden when there is nothing left to buy', () => {
    expect(badgeModel(tower(3, []), 999).visible).toBe(false);
    expect(badgeModel(null, 999).visible).toBe(false);
  });

  it('shows the level-2 price and turns gold when affordable', () => {
    const model = badgeModel(tower(1, [{ key: 'lvl2', upgradeCost: 60 }]), 100);
    expect(model).toMatchObject({
      visible: true,
      state: 'affordable',
      cost: 60,
      branch: false,
      affordable: true,
      label: '▲ 60',
    });
    expect(model.title).toContain('level 2');
  });

  it('greys out when the player cannot afford the upgrade', () => {
    const model = badgeModel(tower(1, [{ key: 'lvl2', upgradeCost: 60 }]), 59);
    expect(model.state).toBe('locked');
    expect(model.affordable).toBe(false);
  });

  it('uses the cheapest option and a star for branching specialisations', () => {
    const model = badgeModel(
      tower(2, [
        { key: 'rapid', upgradeCost: 150 },
        { key: 'sniper', upgradeCost: 120 },
      ]),
      130
    );
    expect(model.branch).toBe(true);
    expect(model.cost).toBe(120);
    expect(model.label).toBe('✦ 120');
    expect(model.affordable).toBe(true);
    expect(model.title).toContain('specialisation');
  });

  it('treats a free upgrade as affordable', () => {
    const model = badgeModel(tower(1, [{ key: 'lvl2', upgradeCost: 0 }]), 0);
    expect(model.affordable).toBe(true);
  });
});

describe('badge placement', () => {
  it('floats above the tower art, not above the tile', () => {
    // tile top at y=128, art 100 px tall -> art top at 92 -> 92 - 11
    expect(badgeAnchorY(128, 100)).toBe(92 - BADGE.gap);
  });

  it('never leaves the world on the top row', () => {
    // A tall tower on row 0 would otherwise push its badge above y = 0.
    expect(badgeAnchorY(0, 128)).toBe(BADGE.minY);
    expect(badgeAnchorY(0, 200)).toBe(BADGE.minY);
    // A short defence keeps a normal offset.
    expect(badgeAnchorY(0, 32)).toBe(64 - 32 - BADGE.gap);
  });

  it('compensates camera zoom so it stays a constant size on screen', () => {
    expect(badgeScale(1)).toBe(1);
    expect(badgeScale(1.25)).toBeCloseTo(0.8, 5);
    expect(badgeScale(2)).toBe(BADGE.minScale); // 1/2 clamped up to minScale
    expect(badgeScale(0.5)).toBe(BADGE.maxScale);
    expect(badgeScale(0)).toBe(1); // guards division by zero
  });

  it('reads a zoom even while the scene has no main camera', () => {
    // A restart drops `cameras.main` for a frame; scaling badges used to throw
    // out of syncHUD() in that window. 1× is the safe stand-in until the new
    // camera exists (the next update re-scales every badge).
    expect(cameraZoom({ cameras: { main: { zoom: 1.75 } } })).toBe(1.75);
    expect(cameraZoom({ cameras: { main: null } })).toBe(1);
    expect(cameraZoom({ cameras: {} })).toBe(1);
    expect(cameraZoom(undefined)).toBe(1);
    expect(cameraZoom({})).toBe(1);
  });

  it('hit-tests in world space using the on-screen scale', () => {
    const badge = { x: 100, y: 50, scale: 1 };
    expect(badgeHit(badge, 100, 50)).toBe(true);
    expect(badgeHit(badge, 100 + BADGE.width / 2 - 1, 50)).toBe(true);
    expect(badgeHit(badge, 100 + BADGE.width, 50)).toBe(false);
    // zoomed in, the badge covers half as much world space
    expect(badgeHit({ ...badge, scale: 0.5 }, 100 + 10, 50)).toBe(true);
    expect(badgeHit({ ...badge, scale: 0.5 }, 100 + 20, 50)).toBe(false);
  });
});
