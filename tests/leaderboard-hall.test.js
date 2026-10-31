// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { LeaderboardUI } from '../src/ui/LeaderboardUI.js';
import { Leaderboard } from '../src/systems/Leaderboard.js';

/**
 * The Champions' Hall.
 *
 * The screen used to be one dialog holding a tab strip, a summary line and a
 * table, which on a landscape phone left the table a 51 px sliver. These tests
 * pin the shape that replaced it — three separate frames — plus the things
 * that silently regress: the hall closing twice, the podium losing a place, a
 * name rendering unescaped.
 */

function fakeStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

const ROWS = [
  { rank: 1, username: 'Borin', power: 5400, level: 6, stars: 9, achievements: 9 },
  { rank: 2, username: 'Aria', power: 1604, level: 4, stars: 5, achievements: 2 },
  { rank: 3, username: 'Keeper', power: 720, level: 2, stars: 1, achievements: 0 },
  { rank: 4, username: 'Nyx', power: 640, level: 2, stars: 0, achievements: 0 },
  { rank: 5, username: 'Sable', power: 120, level: 1, stars: 0, achievements: 0 },
];

function fakeCloud({ rows = ROWS, mine = ROWS[1] } = {}) {
  return {
    identity: { username: 'Aria', claimed: true, mode: 'cloud', deviceKey: 'k' },
    cloudLabel: 'SUPABASE',
    isOnline: true,
    push: vi.fn(async () => ({ ok: true })),
    leaderboard: vi.fn(async () => ({ ok: true, rows, total: rows.length })),
    myRank: vi.fn(async () => ({ ...mine, total: rows.length })),
  };
}

function mount(cloud, callbacks = {}) {
  document.body.innerHTML =
    '<div id="modal-container"></div><div id="screen-container"></div>';
  const ui = new LeaderboardUI(
    document.getElementById('modal-container'),
    new Leaderboard(fakeStorage(), 'test-hall-lb'),
    { cloud, ...callbacks }
  );
  return ui;
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  document.body.innerHTML = '';
});

describe("the Champions' Hall", () => {
  it('opens as its own screen, not inside the shared dialog card', () => {
    const ui = mount(fakeCloud());
    ui.show();
    const modal = document.getElementById('leaderboard-modal');
    expect(modal).not.toBeNull();
    expect(modal.classList.contains('overlay-screen')).toBe(true);
    // The old markup was `.modal-overlay > .modal-card`; both are gone.
    expect(modal.querySelector('.modal-card')).toBeNull();
    expect(modal.querySelector('.lb-shell')).not.toBeNull();
  });

  it('gives the podium, the roll and the standing their own frames', async () => {
    const ui = mount(fakeCloud());
    ui.show();
    await settle();

    const podium = document.querySelector('.lb-block--podium');
    const roll = document.querySelector('.lb-block--roll');
    const stand = document.querySelector('.lb-block--stand');
    expect(podium).not.toBeNull();
    expect(roll).not.toBeNull();
    expect(stand).not.toBeNull();
    // Three separate siblings, not one table with everything crammed in it.
    expect(podium.contains(roll)).toBe(false);
    expect(roll.contains(stand)).toBe(false);
  });

  it('puts exactly one commander per podium card, in rank order', async () => {
    const ui = mount(fakeCloud());
    ui.show();
    await settle();

    const cards = [...document.querySelectorAll('.lb-champ')];
    expect(cards).toHaveLength(3);
    expect(cards.map((c) => c.className.split(' ').find((k) => k.startsWith('lb-champ--')))).toEqual([
      'lb-champ--gold',
      'lb-champ--silver',
      'lb-champ--bronze',
    ]);
    expect(cards.map((c) => c.querySelector('.lb-champ-name').textContent.trim())).toEqual(
      expect.arrayContaining(['Borin', expect.stringContaining('Aria'), 'Keeper'])
    );
    // The roll starts at rank 4 and never repeats the podium.
    const rollNames = [...document.querySelectorAll('.lb-roll-frame tbody .lb-name')].map((n) =>
      n.textContent.replace(/\s+/g, ' ').trim()
    );
    expect(rollNames).toEqual(['Nyx', 'Sable']);
  });

  it('marks your row in the roll and your place in the standing card', async () => {
    const ui = mount(fakeCloud({ mine: { ...ROWS[3], username: 'Aria' } }));
    ui.show();
    await settle();

    // Aria is rank 2, so she is on the podium, not in the roll.
    const podiumMe = document.querySelector('.lb-champ.is-me');
    expect(podiumMe).not.toBeNull();
    expect(podiumMe.querySelector('.lb-you')).not.toBeNull();
    expect(document.querySelector('.lb-roll-frame .lb-name.is-me')).toBeNull();
  });

  it('keeps the podium frames when fewer than three commanders exist', async () => {
    const ui = mount(fakeCloud({ rows: [ROWS[4]], mine: ROWS[4] }));
    ui.show();
    await settle();

    const cards = [...document.querySelectorAll('.lb-champ')];
    expect(cards).toHaveLength(3);
    expect(cards.filter((c) => c.classList.contains('is-vacant'))).toHaveLength(2);
    // And the roll says why it is empty instead of printing an empty table.
    expect(document.querySelector('.lb-roll-empty')).not.toBeNull();
    expect(document.querySelector('.lb-roll-empty').textContent).toContain('THE PODIUM IS THE WHOLE LEDGER');
  });

  it('writes the whole standing: rank, name, and every ranked number', async () => {
    const ui = mount(fakeCloud({
      mine: { ...ROWS[1], rank: 2, total: 5, bestScore: 4200, waves: 14 },
    }));
    ui.show();
    await settle();

    const stand = document.querySelector('.lb-block--stand');
    const text = stand.textContent.replace(/\s+/g, ' ');
    for (const bit of ['#2', 'of 5', 'Aria', '1,604', '5★', '2', '4,200', '14']) {
      expect(text, `standing is missing ${bit}`).toContain(bit);
    }
    const labels = [...stand.querySelectorAll('dt')].map((d) => d.textContent);
    expect(labels).toEqual(['POWER', 'LEVEL', 'STARS', 'MEDALS', 'BEST SCORE', 'WAVES']);
  });

  it('switches to the device table and back without losing the shell', async () => {
    const cloud = fakeCloud();
    const ui = mount(cloud);
    ui.show();
    await settle();

    ui.leaderboard.addRecord({ name: 'Aria', score: 900, waves: 6, timeMs: 90000, result: 'victory' });
    document.querySelector('[data-lb-tab="device"]').click();

    expect(document.querySelector('.lb-block--device')).not.toBeNull();
    expect(document.querySelector('.lb-roll-frame tbody').textContent).toContain('Aria');
    expect(document.getElementById('btn-clear-lb')).not.toBeNull();

    document.querySelector('[data-lb-tab="realm"]').click();
    await settle();
    expect(document.querySelector('.lb-block--podium')).not.toBeNull();
    // Clearing is a device-only action, so the key is gone from the realm tab.
    expect(document.getElementById('btn-clear-lb')).toBeNull();
    expect(cloud.leaderboard).toHaveBeenCalled();
  });

  it('closes once, not once per repaint', async () => {
    const onClose = vi.fn();
    const ui = mount(fakeCloud(), { onClose });
    ui.show();
    await settle();
    // A second paint (the realm list resolves twice in the wild) used to stack
    // a second backdrop listener, so one click fired onClose twice.
    ui.render(null);
    document.getElementById('leaderboard-modal').click();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('escapes a commander name instead of letting it paint markup', async () => {
    const nasty = '<img src=x onerror="alert(1)">';
    const ui = mount(fakeCloud({
      rows: [{ rank: 1, username: nasty, power: 1, level: 1, stars: 0, achievements: 0 }],
      mine: null,
    }));
    ui.show();
    await settle();

    expect(document.querySelector('.lb-champ-name img')).toBeNull();
    expect(document.querySelector('.lb-champ-name').textContent).toContain('<img');
    expect(document.title).toBe('');
  });

  it('says the ledger is missing rather than showing an empty ranking', async () => {
    const ui = mount(null);
    expect(ui.tab).toBe('device');
    ui.show();
    expect(document.querySelector('.lb-block--device')).not.toBeNull();
    // No ledger: the realm tab explains itself instead of inventing numbers.
    document.querySelector('[data-lb-tab="realm"]').click();
    expect(document.querySelector('.lb-notice').textContent).toContain('NO LEDGER CONNECTED');
  });

  it('surfaces a failed read with a retry key', async () => {
    const cloud = fakeCloud();
    cloud.leaderboard = vi.fn(async () => ({ ok: false, reason: 'offline' }));
    const ui = mount(cloud);
    ui.show();
    await settle();

    const notice = document.querySelector('.lb-notice');
    expect(notice.textContent).toContain('THE LEDGER DID NOT ANSWER');
    expect(notice.textContent).toContain('connection dropped');
    expect(document.getElementById('btn-retry-lb')).not.toBeNull();
  });

  it('never draws a medal with emoji', async () => {
    const ui = mount(fakeCloud());
    ui.show();
    await settle();
    const text = document.getElementById('leaderboard-modal').textContent;
    // The old table printed 🥇🥈🥉; the hall draws plates instead. (U+2605 ★ is
    // kept on purpose: it is the campaign's star, not a colour-emoji glyph.)
    expect(text).not.toMatch(/[\u{1F000}-\u{1FAFF}\u{FE0F}]/u);
    expect(text).not.toMatch(/[\u{1F947}-\u{1F949}]/u);
  });
});

describe("the Champions' Hall styling", () => {
  const css = readFileSync('src/style.css', 'utf8');

  const rule = (selector) => {
    const start = css.indexOf(`${selector} {`);
    expect(start, `${selector} is missing from style.css`).toBeGreaterThan(-1);
    return css.slice(start, css.indexOf('}', start));
  };

  it('gives every commander name the gold display face', () => {
    const name = rule('.lb-name');
    expect(name).toContain('var(--font-display)');
    expect(name).toContain('var(--ink-gold)');
    expect(rule('.lb-champ-name')).toContain('#ffe6a4');
  });

  it('lays the three frames out as separate panels, not one card', () => {
    const body = rule('.lb-body');
    expect(body).toContain("'podium podium'");
    expect(body).toContain("'roll   stand'");
    // The shell must not re-introduce the big carved plate.
    const shell = rule('.lb-screen .lb-shell');
    expect(shell).toContain('border-image: none');
  });

  it('has a short-landscape layout that keeps a usable roll', () => {
    const short = css.slice(css.indexOf('@media (max-height: 620px)'));
    expect(short).toContain("'roll   stand'");
    expect(short).toContain('grid-template-rows: auto minmax(0, 1fr)');
  });

  it('ships the generated hall art at the paths the sheet asks for', () => {
    for (const file of ['hall_ledger', 'banner_rank_gold', 'banner_rank_silver', 'banner_rank_bronze']) {
      expect(readFileSync(`public/assets/ui-kit/${file}.webp`).length).toBeGreaterThan(1000);
      expect(css).toContain(`/assets/ui-kit/${file}.webp`);
    }
  });
});

/* ------------------------------------------------------------ daily board */

/**
 * The third tab is the only board two players are genuinely comparable on:
 * same day, same seed, same twist. It has to open on the day's real seed, say
 * so when nobody has posted, and never invent a row.
 */
function fakeDailyCloud({ rows = DAILY_ROWS, total, mine = null, ok = true, reason } = {}) {
  return {
    ...fakeCloud(),
    dailyBoard: vi.fn(async () => (ok ? { ok: true, rows, total: total ?? rows.length } : { ok: false, reason, rows: [], total: 0 })),
    myDailyRank: vi.fn(async () => mine),
  };
}

const DAILY_ROWS = [
  { rank: 1, username: 'Borin', levelId: 'level-3', score: 9120, waves: 8 },
  { rank: 2, username: 'Aria', levelId: 'level-3', score: 4300, waves: 8 },
];

const TODAY = { key: '2026-10-28', seed: 8842, levelId: 'level-3', levelName: 'Frostbite Reach' };

describe('the hall\'s daily tab', () => {
  it('is a third tab next to the realm and the device', () => {
    const ui = mount(fakeDailyCloud(), { dailyRun: () => TODAY });
    ui.show();
    const tabs = [...document.querySelectorAll('[data-lb-tab]')].map((tab) => tab.dataset.lbTab);
    expect(tabs).toEqual(['realm', 'daily', 'device']);
  });

  it('reads the day and the seed from the shrine, then prints the board', async () => {
    const cloud = fakeDailyCloud();
    const ui = mount(cloud, { dailyRun: () => TODAY });
    ui.show();
    document.querySelector('[data-lb-tab="daily"]').click();
    await settle();

    expect(cloud.dailyBoard).toHaveBeenCalledWith({ dayKey: '2026-10-28', seed: 8842, limit: 25 });
    expect(cloud.myDailyRank).toHaveBeenCalledWith({ dayKey: '2026-10-28', seed: 8842 });

    const text = document.getElementById('leaderboard-modal').textContent;
    expect(text).toContain('SEED 8842');
    expect(text).toContain('Borin');
    expect(text).toContain('9,120');
  });

  it('never pretends a row exists on an untouched day', async () => {
    const ui = mount(fakeDailyCloud({ rows: [] }), { dailyRun: () => TODAY });
    ui.show();
    document.querySelector('[data-lb-tab="daily"]').click();
    await settle();

    const text = document.getElementById('leaderboard-modal').textContent;
    expect(text).toContain('NOBODY HAS POSTED TODAY');
    expect(text).toContain('seed 8842');
  });

  it('explains a missing ledger instead of showing an empty table', async () => {
    const ui = mount(fakeDailyCloud({ ok: false, reason: 'unconfigured' }), { dailyRun: () => TODAY });
    ui.show();
    document.querySelector('[data-lb-tab="daily"]').click();
    await settle();

    expect(document.getElementById('leaderboard-modal').textContent).toContain('NO LEDGER CONNECTED');
  });

  it('opens on today\'s board when the run that just ended was the daily', async () => {
    const cloud = fakeDailyCloud();
    const ui = mount(cloud, { dailyRun: () => TODAY });
    ui.show({ status: 'victory', score: 4300, waves: 8, daily: { key: '2026-10-28' }, level: { id: 'level-3' } });
    await settle();

    expect(ui.tab).toBe('daily');
    expect(cloud.dailyBoard).toHaveBeenCalled();
    expect(document.querySelector('[data-lb-tab="daily"]').getAttribute('aria-selected')).toBe('true');
  });
});
