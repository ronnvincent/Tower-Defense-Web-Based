import { describe, it, expect } from 'vitest';
import {
  GATE_MODE,
  detectOrientation,
  isHandheldDevice,
  resolveGateMode,
  gateBlocksGameplay,
  resolveFullscreenApi,
  describeFullscreenError,
} from '../src/system/displayMode.js';

describe('detectOrientation', () => {
  it('uses the viewport shape first', () => {
    expect(detectOrientation({ width: 844, height: 390 })).toBe('landscape');
    expect(detectOrientation({ width: 390, height: 844 })).toBe('portrait');
  });

  it('falls back to the Screen Orientation type for a square viewport', () => {
    expect(detectOrientation({ width: 600, height: 600, type: 'landscape-primary' })).toBe('landscape');
    expect(detectOrientation({ width: 600, height: 600, type: 'portrait-secondary' })).toBe('portrait');
  });

  it('never blocks on a square viewport with no orientation report', () => {
    expect(detectOrientation({ width: 500, height: 500 })).toBe('landscape');
    expect(detectOrientation({})).toBe('landscape');
  });
});

describe('isHandheldDevice', () => {
  it('recognises the common mobile user agents', () => {
    expect(isHandheldDevice({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)' })).toBe(true);
    expect(isHandheldDevice({ userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8)' })).toBe(true);
    expect(isHandheldDevice({ userAgent: 'Mozilla/5.0 (Linux; Android 13; SM-X700) Tablet' })).toBe(true);
  });

  it('rejects a desktop browser even with a touch screen', () => {
    expect(
      isHandheldDevice({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120',
        maxTouchPoints: 10,
        coarsePointer: true,
        hoverNone: false,
      })
    ).toBe(false);
  });

  it('detects iPadOS, which reports a desktop Mac user agent', () => {
    expect(
      isHandheldDevice({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15',
        maxTouchPoints: 5,
        coarsePointer: true,
      })
    ).toBe(true);
    // A real Mac: touch points 0, precise pointer.
    expect(
      isHandheldDevice({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
        maxTouchPoints: 0,
        coarsePointer: false,
      })
    ).toBe(false);
  });

  it('trusts input capabilities when the user agent is useless', () => {
    expect(isHandheldDevice({ userAgent: '', maxTouchPoints: 5, coarsePointer: true, hoverNone: true })).toBe(true);
    expect(isHandheldDevice({ userAgent: '', maxTouchPoints: 0 })).toBe(false);
  });
});

describe('resolveGateMode', () => {
  const base = { handheld: true, orientation: 'landscape', fullscreenSupported: true, fullscreenActive: false };

  it('does nothing on a desktop', () => {
    expect(resolveGateMode({ ...base, handheld: false, orientation: 'portrait' })).toBe(GATE_MODE.NONE);
  });

  it('blocks portrait handhelds regardless of fullscreen', () => {
    expect(resolveGateMode({ ...base, orientation: 'portrait' })).toBe(GATE_MODE.ROTATE);
    expect(resolveGateMode({ ...base, orientation: 'portrait', fullscreenActive: true })).toBe(GATE_MODE.ROTATE);
  });

  it('asks landscape handhelds for the fullscreen tap', () => {
    expect(resolveGateMode(base)).toBe(GATE_MODE.FULLSCREEN);
  });

  it('stops asking once fullscreen is active or the player skipped it', () => {
    expect(resolveGateMode({ ...base, fullscreenActive: true })).toBe(GATE_MODE.NONE);
    expect(resolveGateMode({ ...base, skipFullscreenPrompt: true })).toBe(GATE_MODE.NONE);
    expect(resolveGateMode({ ...base, fullscreenSupported: false })).toBe(GATE_MODE.NONE);
  });
});

describe('gateBlocksGameplay', () => {
  it('freezes the simulation for both gates', () => {
    expect(gateBlocksGameplay(GATE_MODE.ROTATE)).toBe(true);
    expect(gateBlocksGameplay(GATE_MODE.FULLSCREEN)).toBe(true);
    expect(gateBlocksGameplay(GATE_MODE.NONE)).toBe(false);
  });
});

describe('resolveFullscreenApi', () => {
  /** Minimal fake document with one vendor flavour installed. */
  const fakeDoc = (flavours) => {
    const doc = {
      documentElement: {},
      addEventListener() {},
      removeEventListener() {},
      ...flavours.document,
    };
    Object.assign(doc.documentElement, flavours.element);
    return doc;
  };

  it('prefers the standard API', () => {
    const doc = fakeDoc({
      element: { requestFullscreen() {} },
      document: { fullscreenElement: null, exitFullscreen() {}, fullscreenEnabled: true },
    });
    const api = resolveFullscreenApi(doc);
    expect(api.id).toBe('standard');
    expect(api.supported).toBe(true);
  });

  it('falls back to the webkit flavour on older Safari', () => {
    const doc = fakeDoc({
      element: { webkitRequestFullscreen() {} },
      document: { webkitFullscreenElement: null, webkitExitFullscreen() {}, webkitFullscreenEnabled: true },
    });
    const api = resolveFullscreenApi(doc);
    expect(api.id).toBe('webkit');
    expect(api.supported).toBe(true);
  });

  it('reports supported=false inside a restrictive iframe (enabled flag off)', () => {
    const doc = fakeDoc({
      element: { requestFullscreen() {} },
      document: { fullscreenElement: null, exitFullscreen() {}, fullscreenEnabled: false },
    });
    expect(resolveFullscreenApi(doc).supported).toBe(false);
  });

  it('returns null when no flavour exists at all', () => {
    const doc = fakeDoc({ element: {}, document: {} });
    expect(resolveFullscreenApi(doc)).toBeNull();
    expect(resolveFullscreenApi(null)).toBeNull();
  });
});

describe('describeFullscreenError', () => {
  it('maps the browser rejection names to human reasons', () => {
    expect(describeFullscreenError({ name: 'NotAllowedError' })).toContain('user gesture');
    expect(describeFullscreenError({ name: 'TypeError' })).toContain('allow="fullscreen"');
    expect(describeFullscreenError({ name: 'NotSupportedError' })).toBe('unsupported');
    expect(describeFullscreenError(null)).toBe('unknown');
  });
});
