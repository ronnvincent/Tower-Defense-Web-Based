/**
 * ModesUI.js — the War Room: every game mode in one overlay.
 *
 * The main menu stays a menu (Play / Daily / Duel), and the six "other" ways to
 * fight live here instead of turning the front page into a wall of buttons.
 *
 * Layout rules:
 *   • a two-column grid that becomes one column under 560 px, so every card is
 *     a full-width target on a phone,
 *   • the list scrolls inside the modal (the page behind it never does),
 *   • Escape and the backdrop both close it,
 *   • Blueprint opens a second view in the same shell (puzzle picker) rather
 *     than stacking another modal on top.
 */

import { MODES, MODE_KINDS } from '../data/modeData.js';
import { PUZZLES } from '../data/puzzles.js';

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

export class ModesUI {
  /**
   * @param {HTMLElement} container
   * @param {{ onLaunch?:Function, onPuzzle?:Function, onCoop?:Function }} handlers
   */
  constructor(container, { onLaunch, onPuzzle, onCoop } = {}) {
    this.container = container;
    this.onLaunch = onLaunch || (() => {});
    this.onPuzzle = onPuzzle || (() => {});
    this.onCoop = onCoop || (() => {});
    this.build();
  }

  build() {
    const el = document.createElement('div');
    el.id = 'modes-modal';
    el.className = 'modal-overlay hidden';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-labelledby', 'modes-title');
    el.innerHTML = `
      <div class="modal-card modes-card">
        <div class="modal-header">
          <h2 class="modal-title" id="modes-title">WAR ROOM</h2>
          <button id="modes-close" class="btn-close" type="button" aria-label="Close">✕</button>
        </div>
        <div class="modal-body">
          <p class="modes-intro" id="modes-intro">
            Eight ways into the bastion. Campaign and Endless live on the front page — these are the rest.
          </p>
          <div class="modes-grid" id="modes-grid" role="list"></div>
          <div id="puzzle-view" class="hidden">
            <button id="puzzle-back" class="game-btn ghost-btn modes-back" type="button">← BACK</button>
            <div class="modes-grid" id="puzzle-grid" role="list"></div>
          </div>
        </div>
      </div>`;
    this.container.appendChild(el);
    this.el = el;

    el.querySelector('#modes-close')?.addEventListener('click', () => this.hide());
    el.querySelector('#puzzle-back')?.addEventListener('click', () => this.showModes());
    el.addEventListener('click', (event) => {
      if (event.target === el) this.hide();
      const mode = event.target.closest('[data-mode-id]');
      if (mode) return this.launch(mode.dataset.modeId);
      const puzzle = event.target.closest('[data-puzzle-id]');
      if (puzzle) return this.startPuzzle(puzzle.dataset.puzzleId);
      return null;
    });
    this.onKey = (event) => {
      if (event.key === 'Escape' && !this.el.classList.contains('hidden')) this.hide();
    };
    document.addEventListener('keydown', this.onKey);
    this.renderModes();
    this.renderPuzzles();
  }

  renderModes() {
    const grid = this.el.querySelector('#modes-grid');
    grid.innerHTML = MODES.map(
        (mode) => `
        <button class="mode-card" data-mode-id="${mode.id}" role="listitem" type="button">
          <span class="mode-icon" aria-hidden="true">${iconMarkup(mode)}</span>
          <span class="mode-body">
            <span class="mode-tag">${mode.tag}</span>
            <span class="mode-name">${mode.name}</span>
            <span class="mode-blurb">${mode.blurb}</span>
          </span>
          <span class="mode-go" aria-hidden="true">▸</span>
        </button>`
      )
      .join('');
  }

  renderPuzzles() {
    const grid = this.el.querySelector('#puzzle-grid');
    grid.innerHTML = PUZZLES.map(
      (puzzle, index) => `
      <button class="mode-card is-puzzle" data-puzzle-id="${puzzle.id}" role="listitem" type="button">
        <span class="mode-icon is-numeral" aria-hidden="true">${String(index + 1).padStart(2, '0')}</span>
        <span class="mode-body">
          <span class="mode-tag">${puzzle.map.toUpperCase()} · ${puzzle.waves.length} WAVES</span>
          <span class="mode-name">${puzzle.name}</span>
          <span class="mode-blurb">${puzzle.blurb}</span>
        </span>
        <span class="mode-go" aria-hidden="true">▸</span>
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
    this.el.querySelector('#modes-intro')?.classList.remove('hidden');
    this.el.querySelector('#modes-title').textContent = 'WAR ROOM';
  }

  showPuzzles() {
    this.el.querySelector('#puzzle-view')?.classList.remove('hidden');
    this.el.querySelector('#modes-grid')?.classList.add('hidden');
    this.el.querySelector('#modes-intro')?.classList.add('hidden');
    this.el.querySelector('#modes-title').textContent = 'BLUEPRINTS';
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

  get isVisible() {
    return !this.el.classList.contains('hidden');
  }
}
