import { describe, it, expect, vi } from 'vitest';
import { OrientationGate } from '../src/system/OrientationGate.js';
import { FullscreenController } from '../src/system/FullscreenController.js';
import { GATE_MODE } from '../src/system/displayMode.js';

/**
 * A fake browser window/document pair good enough for both controllers.
 * `emit(event)` dispatches to the listeners registered for that event.
 */
function fakeEnvironment({ supported = true } = {}) {
  const listeners = new Map();
  const on = (type, fn) => {
    if (!listeners.has(type)) listeners.set(type, new Set());
    listeners.get(type).add(fn);
  };
  const off = (type, fn) => listeners.get(type)?.delete(fn);
  const emit = (type, event) => {
    for (const fn of [...(listeners.get(type) || [])]) fn(event);
  };

  let fullscreenElement = null;
  const element = {
    requestFullscreen: vi.fn(function request() {
      fullscreenElement = element;
      emit('fullscreenchange');
      return Promise.resolve();
    }),
  };

  const win = {
    innerWidth: 844,
    innerHeight: 390,
    navigator: { userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8)', maxTouchPoints: 5 },
    screen: { orientation: { type: 'landscape-primary', addEventListener: on, removeEventListener: off } },
    matchMedia: (query) => ({
      matches: query.includes('portrait') ? win.innerHeight > win.innerWidth : query.includes('coarse'),
      addEventListener: on,
      removeEventListener: off,
      addListener: on,
      removeListener: off,
    }),
    addEventListener: on,
    removeEventListener: off,
  };

  const doc = {
    documentElement: element,
    visibilityState: 'visible',
    get fullscreenElement() {
      return fullscreenElement;
    },
    fullscreenEnabled: supported,
    addEventListener: on,
    removeEventListener: off,
    exitFullscreen: vi.fn(() => {
      fullscreenElement = null;
      emit('fullscreenchange');
      return Promise.resolve();
    }),
  };

  return { win, doc, emit, element, setFullscreen: (value) => (fullscreenElement = value) };
}

/** Build a gate wired to a fake environment with an inspectable state log. */
function makeGate(env, overrides = {}) {
  const states = [];
  const controller = new FullscreenController({ doc: env.doc, win: env.win, root: env.element });
  controller.bind();
  const gate = new OrientationGate({
    win: env.win,
    doc: env.doc,
    handheld: true,
    debounceMs: 0,
    fullscreen: controller,
    onChange: (state) => states.push(state),
    ...overrides,
  });
  return { gate, states, controller };
}

describe('OrientationGate', () => {
  it('blocks a portrait handheld', () => {
    const env = fakeEnvironment();
    env.win.innerWidth = 390;
    env.win.innerHeight = 844;
    const { gate, states } = makeGate(env);
    gate.start();

    expect(gate.state.orientation).toBe('portrait');
    expect(gate.state.mode).toBe(GATE_MODE.ROTATE);
    expect(states.at(-1).mode).toBe(GATE_MODE.ROTATE);
  });

  it('unlocks as soon as the device is rotated to landscape', () => {
    const env = fakeEnvironment();
    env.win.innerWidth = 390;
    env.win.innerHeight = 844;
    const { gate, states } = makeGate(env);
    gate.start();
    expect(gate.state.mode).toBe(GATE_MODE.ROTATE);

    // Rotate: the browser fires resize with the new viewport.
    env.win.innerWidth = 844;
    env.win.innerHeight = 390;
    env.emit('resize');

    expect(gate.state.orientation).toBe('landscape');
    expect(gate.state.mode).toBe(GATE_MODE.FULLSCREEN);
    expect(states.map((s) => s.mode)).toEqual([GATE_MODE.ROTATE, GATE_MODE.FULLSCREEN]);
  });

  it('only notifies when the gate mode actually changes', () => {
    const env = fakeEnvironment();
    const { gate, states } = makeGate(env);
    gate.start();
    const count = states.length;

    // Same viewport, several resize bursts: no new transitions.
    env.emit('resize');
    env.emit('resize');
    env.emit('orientationchange');

    expect(states.length).toBe(count);
  });

  it('re-enters portrait mode after rotating back', () => {
    const env = fakeEnvironment();
    const { gate } = makeGate(env);
    gate.start();
    expect(gate.state.mode).toBe(GATE_MODE.FULLSCREEN);

    env.win.innerWidth = 390;
    env.win.innerHeight = 844;
    env.emit('resize');
    expect(gate.state.mode).toBe(GATE_MODE.ROTATE);

    env.win.innerWidth = 844;
    env.win.innerHeight = 390;
    env.emit('resize');
    expect(gate.state.mode).toBe(GATE_MODE.FULLSCREEN);
  });

  it('never blocks a desktop window, however narrow', () => {
    const env = fakeEnvironment();
    env.win.innerWidth = 500;
    env.win.innerHeight = 900;
    const { gate, states } = makeGate(env, { handheld: false });
    gate.start();

    expect(gate.state.mode).toBe(GATE_MODE.NONE);
    expect(states.at(-1).mode).toBe(GATE_MODE.NONE);
  });

  it('stops asking for fullscreen once the document is fullscreen', () => {
    const env = fakeEnvironment();
    const { gate, controller } = makeGate(env);
    gate.start();
    expect(gate.state.mode).toBe(GATE_MODE.FULLSCREEN);

    return controller.request().then(() => {
      gate.refresh();
      expect(gate.state.fullscreenActive).toBe(true);
      expect(gate.state.mode).toBe(GATE_MODE.NONE);
    });
  });

  it('skipFullscreen() lets the player continue, but portrait still blocks', () => {
    const env = fakeEnvironment();
    const { gate } = makeGate(env);
    gate.start();

    gate.skipFullscreen();
    expect(gate.state.mode).toBe(GATE_MODE.NONE);

    env.win.innerWidth = 390;
    env.win.innerHeight = 844;
    env.emit('resize');
    expect(gate.state.mode).toBe(GATE_MODE.ROTATE);

    // Rotating back re-arms the prompt so fullscreen is offered again.
    env.win.innerWidth = 844;
    env.win.innerHeight = 390;
    env.emit('resize');
    expect(gate.state.mode).toBe(GATE_MODE.FULLSCREEN);
  });

  it('noteFullscreenExit() does not immediately re-open the gate', () => {
    const env = fakeEnvironment();
    const { gate, controller } = makeGate(env);
    gate.start();

    return controller
      .request()
      .then(() => {
        gate.refresh();
        expect(gate.state.mode).toBe(GATE_MODE.NONE);
        return controller.exit();
      })
      .then(() => {
        gate.noteFullscreenExit();
        expect(gate.state.mode).toBe(GATE_MODE.NONE);
        expect(gate.state.fullscreenActive).toBe(false);
      });
  });

  it('does nothing when fullscreen is unsupported', () => {
    const env = fakeEnvironment({ supported: false });
    const { gate } = makeGate(env);
    gate.start();
    expect(gate.state.fullscreenSupported).toBe(false);
    expect(gate.state.mode).toBe(GATE_MODE.NONE);
  });

  it('reports handheld=false for a desktop user agent', () => {
    const env = fakeEnvironment();
    env.win.navigator = { userAgent: 'Mozilla/5.0 (X11; Linux x86_64) Chrome/120', maxTouchPoints: 0 };
    env.win.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });

    const gate = new OrientationGate({ win: env.win, doc: env.doc, debounceMs: 0 });
    expect(gate.handheld).toBe(false);
  });

  it('detaches every listener on stop()', () => {
    const env = fakeEnvironment();
    const removeSpy = vi.spyOn(env.win, 'removeEventListener');
    const { gate } = makeGate(env);
    gate.start();
    gate.stop();

    const removed = removeSpy.mock.calls.map(([type]) => type);
    expect(removed).toContain('resize');
    expect(removed).toContain('orientationchange');

    const before = gate.state;
    env.emit('resize');
    expect(gate.state).toBe(before);
  });
});

describe('FullscreenController', () => {
  it('reports support and applies state changes', async () => {
    const env = fakeEnvironment();
    const changes = [];
    const controller = new FullscreenController({
      doc: env.doc,
      win: env.win,
      root: env.element,
      onChange: (state) => changes.push(state),
    });
    controller.bind();

    expect(controller.supported).toBe(true);
    expect(controller.active).toBe(false);

    await controller.request();

    expect(env.element.requestFullscreen).toHaveBeenCalledTimes(1);
    expect(controller.active).toBe(true);
    expect(changes.at(-1).active).toBe(true);
  });

  it('swallows a rejected request instead of throwing', async () => {
    const env = fakeEnvironment();
    env.element.requestFullscreen = vi.fn(() => Promise.reject(Object.assign(new Error('nope'), { name: 'NotAllowedError' })));

    const controller = new FullscreenController({ doc: env.doc, win: env.win, root: env.element });
    const ok = await controller.request();

    expect(ok).toBe(false);
    expect(controller.active).toBe(false);
    expect(controller.lastError.name).toBe('NotAllowedError');
  });

  it('is a no-op when the API is unavailable', async () => {
    const env = fakeEnvironment({ supported: false });
    const controller = new FullscreenController({ doc: env.doc, win: env.win, root: env.element });
    expect(controller.supported).toBe(false);
    expect(await controller.request()).toBe(false);
  });

  it('requests on the first user gesture and only once', async () => {
    const env = fakeEnvironment();
    const controller = new FullscreenController({ doc: env.doc, win: env.win, root: env.element });
    controller.requestOnFirstGesture();

    env.emit('pointerdown');
    await Promise.resolve();

    expect(env.element.requestFullscreen).toHaveBeenCalledTimes(1);

    env.emit('pointerdown');
    await Promise.resolve();
    expect(env.element.requestFullscreen).toHaveBeenCalledTimes(1);
  });

  it('can cancel the pending gesture request', () => {
    const env = fakeEnvironment();
    const controller = new FullscreenController({ doc: env.doc, win: env.win, root: env.element });
    const cancel = controller.requestOnFirstGesture();
    cancel();

    env.emit('pointerdown');
    expect(env.element.requestFullscreen).not.toHaveBeenCalled();
  });

  it('toggles both ways', async () => {
    const env = fakeEnvironment();
    const controller = new FullscreenController({ doc: env.doc, win: env.win, root: env.element });
    controller.bind();

    expect(await controller.toggle()).toBe(true);
    expect(controller.active).toBe(true);

    expect(await controller.toggle()).toBe(false);
    expect(controller.active).toBe(false);
    expect(env.doc.exitFullscreen).toHaveBeenCalled();
  });

  it('locks orientation only when the platform supports it', async () => {
    const env = fakeEnvironment();
    env.win.screen.orientation.lock = vi.fn(() => Promise.resolve());
    const controller = new FullscreenController({ doc: env.doc, win: env.win, root: env.element });
    expect(await controller.lockOrientation('landscape')).toBe(true);
    expect(env.win.screen.orientation.lock).toHaveBeenCalledWith('landscape');

    const plain = fakeEnvironment();
    plain.win.screen = {};
    const unsupported = new FullscreenController({ doc: plain.doc, win: plain.win, root: plain.element });
    expect(await unsupported.lockOrientation('landscape')).toBe(false);
  });
});
