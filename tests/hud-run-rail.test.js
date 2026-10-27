// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { HUD } from '../src/ui/HUD.js';

/**
 * The run rail is the brass strip that hangs under the top bar during a mode
 * run. It is the only place a run's rule chips and its clock are printed, so
 * these tests pin:
 *   • the rail stays hidden until the run has something to say,
 *   • the mode's name is humanised, never a raw id,
 *   • the anomaly chip is text-only (an emoji in a data table renders as a
 *     hollow box in Chromium, which is exactly the artefact this rebuild kills),
 *   • the clock only repaints when the printed second changes.
 */

function mountHud() {
  document.body.innerHTML = '<div id="app"><div id="hud-container"></div></div>';
  // eslint-disable-next-line no-new
  return new HUD(document.getElementById('hud-container'), {});
}

const rail = () => document.getElementById('run-strip');
const text = (sel) => document.querySelector(sel)?.textContent ?? '';

describe('HUD run rail', () => {
  let hud;
  beforeEach(() => {
    document.documentElement.classList.remove('has-run-rail');
    hud = mountHud();
  });

  it('stays hidden on a campaign level', () => {
    hud.setRunStatus({ mode: null, chips: [], anomaly: null, clockMs: null });
    expect(rail().classList.contains('hidden')).toBe(true);
    expect(document.documentElement.classList.contains('has-run-rail')).toBe(false);
  });

  it('shows the mode cap, the chips and the clock together', () => {
    hud.setRunStatus({
      mode: 'time-attack',
      chips: ['DMG +20%', 'ROF +10%'],
      anomaly: 'FOG BANK',
      clockMs: 179_000,
    });
    expect(rail().classList.contains('hidden')).toBe(false);
    expect(text('#run-strip-cap')).toBe('TIME ATTACK');
    expect(document.querySelectorAll('#run-status .run-chip')).toHaveLength(2);
    expect(text('.run-anomaly')).toBe('ANOMALY · FOG BANK');
    expect(text('#run-clock')).toBe('2:59');
    expect(document.documentElement.classList.contains('has-run-rail')).toBe(true);
  });

  it('never prints an emoji glyph', () => {
    hud.setRunStatus({ mode: 'anomaly', chips: [], anomaly: 'TWIN TITANS', clockMs: null });
    // Emoji and pictographs depend on a font the page does not ship, and the
    // fallback in headless Chromium is a hollow box. Typographic punctuation
    // (`·`) is fine — it comes from the body font.
    expect(text('.run-anomaly')).not.toMatch(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u);
  });

  it('humanises every known mode id', () => {
    const labels = {
      rogue: 'ROGUE SIEGE',
      anomaly: 'ANOMALY WAVES',
      titan: 'TITAN RUSH',
      contracts: 'CONTRACT BOARD',
      blueprint: 'BLUEPRINT',
      'time-attack': 'TIME ATTACK',
      ascension: 'ASCENSION',
      coop: 'CO-OP SIEGE',
    };
    for (const [mode, label] of Object.entries(labels)) {
      hud.setRunStatus({ mode, chips: [], anomaly: null, clockMs: null });
      expect(text('#run-strip-cap'), mode).toBe(label);
    }
  });

  it('prints nothing for an unknown mode rather than a raw id', () => {
    hud.setRunStatus({ mode: 'mystery-mode', chips: [], anomaly: null, clockMs: null });
    expect(text('#run-strip-cap')).toBe('');
    expect(rail().classList.contains('hidden')).toBe(true);
  });

  it('repaints the clock only when the second changes', () => {
    hud.setRunClock(90_400);
    const node = document.getElementById('run-clock');
    expect(node.textContent).toBe('1:31');
    const first = node.textContent;
    node.textContent = 'sentinel';
    hud.setRunClock(90_100); // still 1:31 after rounding up
    expect(node.textContent).toBe('sentinel');
    hud.setRunClock(89_000);
    expect(node.textContent).toBe('1:29');
    expect(first).toBe('1:31');
  });

  it('flags a clock that is nearly out', () => {
    hud.setRunClock(30_000);
    expect(document.getElementById('run-clock').classList.contains('is-low')).toBe(true);
    hud.setRunClock(31_000);
    expect(document.getElementById('run-clock').classList.contains('is-low')).toBe(false);
  });

  it('hides the whole rail when the clock and the chips are gone', () => {
    hud.setRunStatus({ mode: 'time-attack', chips: ['DMG +20%'], anomaly: null, clockMs: 60_000 });
    expect(rail().classList.contains('hidden')).toBe(false);
    hud.setRunStatus({ mode: null, chips: [], anomaly: null, clockMs: null });
    expect(rail().classList.contains('hidden')).toBe(true);
    expect(document.documentElement.classList.contains('has-run-rail')).toBe(false);
  });
});
