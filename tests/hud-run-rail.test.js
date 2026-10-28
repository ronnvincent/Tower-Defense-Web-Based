// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { HUD } from '../src/ui/HUD.js';

/**
 * The run rail is the brass strip that hangs under the top bar during a mode
 * run. It is the only place a run's rule chips and its mode cap are printed, so
 * these tests pin:
 *   • the rail stays hidden until the run has something to say,
 *   • the mode's name is humanised, never a raw id,
 *   • a chip is escaped text, never markup.
 *
 * The Time Attack clock that used to share this rail went out with the mode.
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
    hud.setRunStatus({ mode: null, chips: [] });
    expect(rail().classList.contains('hidden')).toBe(true);
    expect(document.documentElement.classList.contains('has-run-rail')).toBe(false);
  });

  it('shows the mode cap and the chips together', () => {
    hud.setRunStatus({ mode: 'rogue', chips: ['DMG +20%', 'ROF +10%'] });
    expect(rail().classList.contains('hidden')).toBe(false);
    expect(text('#run-strip-cap')).toBe('ROGUE SIEGE');
    expect(document.querySelectorAll('#run-status .run-chip')).toHaveLength(2);
    expect(document.documentElement.classList.contains('has-run-rail')).toBe(true);
  });

  it('escapes a chip instead of printing markup', () => {
    hud.setRunStatus({ mode: 'rogue', chips: ['<img src=x onerror=alert(1)>'] });
    const chip = document.querySelector('#run-status .run-chip');
    expect(chip.querySelector('img')).toBeNull();
    expect(chip.textContent).toContain('<img');
  });

  it('humanises every known mode id', () => {
    const labels = {
      rogue: 'ROGUE SIEGE',
      titan: 'TITAN RUSH',
      blueprint: 'BLUEPRINT',
      puzzle: 'BLUEPRINT',
      coop: 'CO-OP SIEGE',
    };
    for (const [mode, label] of Object.entries(labels)) {
      hud.setRunStatus({ mode, chips: [] });
      expect(text('#run-strip-cap'), mode).toBe(label);
    }
  });

  it('prints nothing for an unknown mode rather than a raw id', () => {
    hud.setRunStatus({ mode: 'mystery-mode', chips: [] });
    expect(text('#run-strip-cap')).toBe('');
    expect(rail().classList.contains('hidden')).toBe(true);
  });

  it('hides the whole rail when the cap and the chips are gone', () => {
    hud.setRunStatus({ mode: 'titan', chips: ['DMG +20%'] });
    expect(rail().classList.contains('hidden')).toBe(false);
    hud.setRunStatus({ mode: null, chips: [] });
    expect(rail().classList.contains('hidden')).toBe(true);
    expect(document.documentElement.classList.contains('has-run-rail')).toBe(false);
  });
});
