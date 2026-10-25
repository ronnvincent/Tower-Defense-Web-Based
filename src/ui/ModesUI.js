/**
 * ModesUI.js — the War Room: every game mode in one overlay.
 *
 * The main menu stays a menu (Play / Daily / Duel), and the six "other" ways to
 * fight live here instead of turning the front page into a wall of buttons.
 *
 * The shell is the same `overlay-screen` / `overlay-shell` frame the Forge and
 * the Codex use, and every card is a slice of the game's own `card_iron` art —
 * a mode list is a wall of plaques, not a dashboard of divs.
 *
 * Layout rules:
 *   • two plaque columns on a desktop, one under 760 px so every row is a
 *     full-width target a thumb can hit,
 *   • the list scrolls inside the shell (the page behind it never does), and
 *     the shell owns the full height on a 390 px-tall phone,
 *   • Escape, the backdrop and CLOSE all leave; BACK returns from Blueprints.
 */

import { MODES, MODE_KINDS } from '../data/modeData.js';
import { PUZZLES } from '../data/puzzles.js';

export class ModesUI {
  /**
   * @param {HTMLElement} container
   * @param {{ onLaunch?:Function, onPuzzle?:Function, onCoop?:Function, onClose?:Function }} handlers
   */
  constructor(container, { onLaunch, onPuzzle, onCoop, onClose } = {}) {
    this.container = container;
    this.onLaunch = onLaunch || (() => {});
    this.onPuzzle = onPuzzle || (() => {});
    this.onCoop = onCoop || (() => {});
    this.onClose = onClose || (() => {});
    this.build();
  }

  build() {
    const el = document.createElement('div');
    el.id = 'modes-screen';
    el.className = 'overlay-screen hidden';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-labelledby', 'modes-title');
    el.innerHTML = `
      <div class="overlay-shell modes-shell">
        <header class="overlay-header modes-head">
          <p class="overlay-eyebrow" id="modes-eyebrow">THE BASTION</p>
          <h1 class="overlay-title" id="modes-title">WAR ROOM</h1>
          <p class="wallet-row modes-ledger">
            <span class="wallet">8 MODES</span>
            <span class="wallet">2–5 TITANS</span>
            <span class="wallet">4-MINUTE RUNS</span>
          </p>
          <button id="modes-close" class="btn-close" type="button" aria-label="Close the War Room">✕</button>
        </header>

        <div class="modes-scroll">
          <p class="modes-lede" id="modes-lede">
            Campaign and Endless hold the front page. These are the other ways in.
          </p>
          <div class="modes-grid" id="modes-grid" role="list"></div>
          <div id="puzzle-view" class="hidden">
            <p class="modes-lede" id="puzzle-lede">
              Six boards, towers already standing, gold already counted. Keep the core.
            </p>
            <div class="modes-grid is-puzzles" id="puzzle-grid" role="list"></div>
          </div>
        </div>

        <footer class="overlay-actions modes-actions">
          <button id="modes-back" class="game-btn hidden" type="button">BACK</button>
          <button id="modes-done" class="game-btn game-btn-primary" type="button">CLOSE</button>
        </footer>
      </div>`;
    this.container.appendChild(el);
    this.el = el;

    el.querySelector('#modes-close')?.addEventListener('click', () => this.dismiss());
    el.querySelector('#modes-done')?.addEventListener('click', () => this.dismiss());
    el.querySelector('#modes-back')?.addEventListener('click', () => this.showModes());
    el.addEventListener('click', (event) => {
      if (event.target === el) return this.dismiss();
      const mode = event.target.closest('[data-mode-id]');
      if (mode) return this.launch(mode.dataset.modeId);
      const puzzle = event.target.closest('[data-puzzle-id]');
      if (puzzle) return this.startPuzzle(puzzle.dataset.puzzleId);
      return null;
    });
    this.onKey = (event) => {
      if (event.key !== 'Escape' || !this.isVisible) return;
      // Escape backs out of the puzzle list first, like every other panel stack.
      if (!this.el.querySelector('#puzzle-view').classList.contains('hidden')) this.showModes();
      else this.dismiss();
    };
    document.addEventListener('keydown', this.onKey);
    this.renderModes();
    this.renderPuzzles();
  }

  renderModes() {
    const grid = this.el.querySelector('#modes-grid');
    grid.innerHTML = MODES.map(
      (mode, index) => `
        <button class="mode-card" data-mode-id="${mode.id}" role="listitem" type="button">
          <span class="mode-crest" aria-hidden="true">${iconMarkup(mode)}</span>
          <span class="mode-body">
            <span class="mode-tag">${mode.tag}</span>
            <span class="mode-name">${mode.name}</span>
            <span class="mode-blurb">${mode.blurb}</span>
          </span>
          <span class="mode-cta" aria-hidden="true">${index === MODES.length - 1 ? 'ALLY' : 'DEPLOY'}</span>
        </button>`
    ).join('');
  }

  renderPuzzles() {
    const grid = this.el.querySelector('#puzzle-grid');
    grid.innerHTML = PUZZLES.map(
      (puzzle, index) => `
      <button class="mode-card is-puzzle" data-puzzle-id="${puzzle.id}" role="listitem" type="button">
        <span class="mode-crest is-numeral" aria-hidden="true">${String(index + 1).padStart(2, '0')}</span>
        <span class="mode-body">
          <span class="mode-tag">${puzzle.map.toUpperCase()} · ${puzzle.waves.length} WAVES · ${puzzle.startingCoins} GOLD</span>
          <span class="mode-name">${puzzle.name}</span>
          <span class="mode-blurb">${puzzle.blurb}</span>
        </span>
        <span class="mode-cta" aria-hidden="true">SOLVE</span>
      </button>`
    ).join('');
  }

  launch(id) {
    const mode = MODES.find((entry) => entry.id === id);
    if (!mode) return;
    if (mode.kind === MODE_KINDS.PUZZLE) {
      this.showPuzzles();
      return;
    }
    this.hide();
    if (mode.kind === MODE_KINDS.COOP) {
      this.onCoop();
      return;
    }
    this.onLaunch(mode);
  }

  startPuzzle(id) {
    this.hide();
    this.onPuzzle(id);
  }

  showModes() {
    this.el.querySelector('#puzzle-view')?.classList.add('hidden');
    this.el.querySelector('#modes-grid')?.classList.remove('hidden');
    this.el.querySelector('#modes-lede')?.classList.remove('hidden');
    this.el.querySelector('#modes-back')?.classList.add('hidden');
    this.el.querySelector('#modes-eyebrow').textContent = 'THE BASTION';
    this.el.querySelector('#modes-title').textContent = 'WAR ROOM';
    this.el.querySelector('.modes-scroll').scrollTop = 0;
  }

  showPuzzles() {
    this.el.querySelector('#puzzle-view')?.classList.remove('hidden');
    this.el.querySelector('#modes-grid')?.classList.add('hidden');
    this.el.querySelector('#modes-lede')?.classList.add('hidden');
    this.el.querySelector('#modes-back')?.classList.remove('hidden');
    this.el.querySelector('#modes-eyebrow').textContent = 'TIGHT GOLD';
    this.el.querySelector('#modes-title').textContent = 'BLUEPRINTS';
    this.el.querySelector('.modes-scroll').scrollTop = 0;
  }

  show() {
    this.showModes();
    this.el.classList.remove('hidden');
    // Focus the first card so a keyboard player can start with Enter.
    this.el.querySelector('.mode-card')?.focus?.({ preventScroll: true });
  }

  hide() {
    this.el.classList.add('hidden');
  }

  /** Close and tell the caller (the menu re-focuses its own button). */
  dismiss() {
    if (!this.isVisible) return;
    this.hide();
    this.onClose();
  }

  get isVisible() {
    return !this.el.classList.contains('hidden');
  }
}

/**
 * Pixel-art glyphs, not emoji.
 *
 * The War Room is the first thing a player sees after the menu, so it cannot
 * depend on a device having an emoji font: a missing glyph is a hollow box.
 * Every mode ships a 64 px sprite from the same kit the rest of the UI uses.
 */
function iconMarkup(mode) {
  if (mode.art) return `<img class="mode-art" src="${mode.art}" alt="" />`;
  return mode.icon || '';
}
