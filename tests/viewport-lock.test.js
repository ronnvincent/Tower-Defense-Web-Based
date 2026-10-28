// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { isBrowserZoomShortcut, isEditableTarget, lockViewport, ZOOM_KEYS } from '../src/system/viewportLock.js';

/**
 * The page must never zoom under the canvas. The viewport meta tag is the
 * first line of defence; these guards cover the browsers that ignore it.
 */

function keyEvent(key, init = {}) {
  return new KeyboardEvent('keydown', { key, cancelable: true, ...init });
}

function touchMove(count) {
  const event = new Event('touchmove', { cancelable: true });
  // jsdom has no TouchEvent; the handler only reads `touches.length`.
  Object.defineProperty(event, 'touches', {
    value: Array.from({ length: count }, () => ({})),
  });
  return event;
}

function wheel(init = {}) {
  const event = new Event('wheel', { cancelable: true });
  for (const [key, value] of Object.entries(init)) {
    Object.defineProperty(event, key, { value });
  }
  return event;
}

describe('Browser zoom shortcuts', () => {
  it('recognises ctrl/cmd with the zoom keys', () => {
    for (const key of ZOOM_KEYS) {
      expect(isBrowserZoomShortcut({ key, ctrlKey: true }), key).toBe(true);
      expect(isBrowserZoomShortcut({ key, metaKey: true }), key).toBe(true);
    }
  });

  it('ignores plain keys, AltGr combinations and other shortcuts', () => {
    expect(isBrowserZoomShortcut({ key: '+', ctrlKey: false })).toBe(false);
    // AltGr arrives as ctrl+alt on many layouts.
    expect(isBrowserZoomShortcut({ key: '+', ctrlKey: true, altKey: true })).toBe(false);
    expect(isBrowserZoomShortcut({ key: 'a', ctrlKey: true })).toBe(false);
    expect(isBrowserZoomShortcut(null)).toBe(false);
  });

  it('does not treat text fields as game input', () => {
    expect(isEditableTarget({ tagName: 'INPUT' })).toBe(true);
    expect(isEditableTarget({ tagName: 'textarea' })).toBe(true);
    expect(isEditableTarget({ isContentEditable: true })).toBe(true);
    expect(isEditableTarget({ tagName: 'BUTTON' })).toBe(false);
    expect(isEditableTarget(null)).toBe(false);
  });
});

describe('lockViewport', () => {
  let release;

  beforeEach(() => {
    release?.();
    release = lockViewport();
  });

  it('cancels the iOS page-pinch gesture events', () => {
    for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
      const event = new Event(type, { cancelable: true });
      document.dispatchEvent(event);
      expect(event.defaultPrevented, type).toBe(true);
    }
  });

  it('cancels two-finger drags but leaves one-finger camera drags alone', () => {
    const pinch = touchMove(2);
    document.dispatchEvent(pinch);
    expect(pinch.defaultPrevented).toBe(true);

    const drag = touchMove(1);
    document.dispatchEvent(drag);
    expect(drag.defaultPrevented).toBe(false);
  });

  it('cancels ctrl+wheel (trackpad pinch) and allows normal wheel zoom', () => {
    const pinch = wheel({ ctrlKey: true });
    window.dispatchEvent(pinch);
    expect(pinch.defaultPrevented).toBe(true);

    const scroll = wheel({ ctrlKey: false });
    window.dispatchEvent(scroll);
    expect(scroll.defaultPrevented).toBe(false);
  });

  it('cancels the browser zoom keyboard shortcuts outside text fields', () => {
    const zoomIn = keyEvent('+', { ctrlKey: true });
    window.dispatchEvent(zoomIn);
    expect(zoomIn.defaultPrevented).toBe(true);

    const reset = keyEvent('0', { metaKey: true });
    window.dispatchEvent(reset);
    expect(reset.defaultPrevented).toBe(true);

    const typed = keyEvent('+', { ctrlKey: true });
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.dispatchEvent(typed);
    expect(typed.defaultPrevented).toBe(false);
    input.remove();
  });

  it('never asks to cancel a non-cancelable event', () => {
    // Chrome logs "[Intervention] Ignored attempt to cancel a touchmove event
    // with cancelable=false" for each of these — 74 in one recording. The
    // guard is the fix: ask first, and do nothing when the answer is no.
    const pinch = new Event('touchmove', { cancelable: false });
    Object.defineProperty(pinch, 'touches', { value: [{}, {}] });
    expect(() => document.dispatchEvent(pinch)).not.toThrow();
    expect(pinch.defaultPrevented).toBe(false);

    const gesture = new Event('gesturestart', { cancelable: false });
    document.dispatchEvent(gesture);
    expect(gesture.defaultPrevented).toBe(false);

    // A cancelable event still behaves exactly as before.
    const cancellable = touchMove(2);
    document.dispatchEvent(cancellable);
    expect(cancellable.defaultPrevented).toBe(true);
  });

  it('detaches every listener on release', () => {
    release();
    release = null;

    const event = new Event('gesturestart', { cancelable: true });
    document.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);

    const pinch = touchMove(2);
    document.dispatchEvent(pinch);
    expect(pinch.defaultPrevented).toBe(false);
  });

  it('survives an environment without a visual viewport or listeners', () => {
    const empty = { addEventListener: undefined, removeEventListener: undefined };
    expect(() => lockViewport({ win: empty, doc: empty })()).not.toThrow();
  });
});
