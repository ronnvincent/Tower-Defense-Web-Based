/**
 * DraftPanel.js — the run-choice card (Rogue Siege cards, Ascension fork).
 *
 * One component, two shapes:
 *   showCards({...})   three cards, pick one  → resolves with the card
 *   showChoice({...})  two or three options   → resolves with the option
 *
 * The shell is the same `overlay-screen` / `overlay-shell` frame as the Forge,
 * and each choice is a slice of the game's own card art: `card_crimson` for a
 * rare pick, `card_iron` for everything else, with the icon standing in a
 * riveted slot.
 *
 * Rules that make it safe on a phone:
 *   • it is a real modal (aria-modal) and the page behind it cannot scroll
 *   • every target is at least 72 px tall, and the cards stack vertically so a
 *     thumb never has to hit a narrow column
 *   • 1 / 2 / 3 pick by number, Escape skips (a draft is never mandatory)
 *   • the promise **always settles**, so a scene waiting on it can never hang
 */

const NUMERALS = ['1', '2', '3', '4'];

export class DraftPanel {
  constructor(container = document.body) {
    this.container = container;
    this.el = null;
    this.resolve = null;
    this.model = [];
    this.onKey = this.handleKey.bind(this);
    this.build();
  }

  build() {
    const el = document.createElement('div');
    el.id = 'draft-panel';
    el.className = 'overlay-screen hidden';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-labelledby', 'draft-title');
    el.innerHTML = `
      <div class="overlay-shell draft-shell">
        <header class="overlay-header draft-head">
          <p class="overlay-eyebrow" id="draft-eyebrow">ROGUE SIEGE</p>
          <h2 id="draft-title" class="overlay-title draft-title">Wave Cleared</h2>
          <p class="draft-subtitle" id="draft-subtitle"></p>
        </header>
        <div class="draft-cards" id="draft-cards" role="list"></div>
        <footer class="overlay-actions">
          <button id="draft-skip" class="game-btn" type="button">SKIP</button>
        </footer>
      </div>`;
    this.container.appendChild(el);
    this.el = el;
    el.addEventListener('click', (event) => {
      if (event.target === el) return this.finish(null);
      const card = event.target.closest('[data-draft-id]');
      if (card) return this.pick(card.dataset.draftId);
      return null;
    });
    el.querySelector('#draft-skip')?.addEventListener('click', () => this.finish(null));
  }

  get isOpen() {
    return Boolean(this.el && !this.el.classList.contains('hidden'));
  }

  /**
   * @param {{cards:Array, wave?:number, title?:string, subtitle?:string}} options
   * @returns {Promise<object|null>} the chosen card, or null if skipped
   */
  showCards({ cards = [], wave = 0, title = '', subtitle = '' } = {}) {
    this.close();
    this.setHeader({
      eyebrow: 'ROGUE SIEGE',
      title: title || (wave ? `WAVE ${wave} CLEARED` : 'WAVE CLEARED'),
      subtitle: subtitle || 'Pick one card — it lasts the rest of this run.',
    });
    this.render(cards.map((card) => this.cardMarkup(card)));
    this.model = cards;
    return this.open();
  }

  /**
   * @param {{options:Array, title?:string, subtitle?:string}} options
   * @returns {Promise<object|null>}
   */
  showChoice({ options = [], title = '', subtitle = '' } = {}) {
    this.close();
    this.setHeader({
      eyebrow: 'ASCENSION',
      title: title || 'CLIMB OR CASH OUT',
      subtitle: subtitle || '',
    });
    this.render(options.map((option) => this.optionMarkup(option)));
    this.model = options;
    return this.open();
  }

  setHeader({ eyebrow, title, subtitle }) {
    const choice = eyebrow === 'ASCENSION';
    this.el.querySelector('#draft-eyebrow').textContent = eyebrow;
    this.el.querySelector('#draft-title').textContent = title;
    this.el.querySelector('#draft-subtitle').textContent = subtitle;
    this.el.querySelector('.draft-shell').classList.toggle('is-choice', choice);
    // On the ladder "skip" means "do not climb", which is a decision, not a
    // dismissal — say so instead of borrowing the draft's SKIP.
    const skip = this.el.querySelector('#draft-skip');
    if (skip) skip.textContent = choice ? 'STAY ON THIS WAVE' : 'SKIP';
  }

  cardMarkup(card) {
    const rarity = card.rarity || 'common';
    return `
      <button class="draft-card rarity-${rarity}" data-draft-id="${escapeAttr(card.id)}" role="listitem" type="button">
        <span class="draft-key" aria-hidden="true"></span>
        <span class="draft-icon" aria-hidden="true">${artMarkup(card)}</span>
        <span class="draft-body">
          <span class="draft-rarity">${rarity.toUpperCase()}</span>
          <span class="draft-name">${escapeHtml(card.name)}</span>
          <span class="draft-blurb">${escapeHtml(card.blurb)}</span>
        </span>
        <span class="draft-pick" aria-hidden="true">TAKE</span>
      </button>`;
  }

  optionMarkup(option) {
    return `
      <button class="draft-card is-option" data-draft-id="${escapeAttr(option.id)}" role="listitem" type="button">
        <span class="draft-key" aria-hidden="true"></span>
        <span class="draft-icon" aria-hidden="true">${artMarkup(option)}</span>
        <span class="draft-body">
          <span class="draft-name">${escapeHtml(option.name)}</span>
          <span class="draft-blurb">${escapeHtml(option.blurb || '')}</span>
        </span>
        <span class="draft-pick" aria-hidden="true">CHOOSE</span>
      </button>`;
  }

  /** Fill the numeral keys in one pass, so markup stays index-free. */
  render(blocks) {
    const box = this.el.querySelector('#draft-cards');
    box.innerHTML = blocks
      .map((html, index) =>
        html.replace(
          '<span class="draft-key" aria-hidden="true"></span>',
          `<span class="draft-key" aria-hidden="true">${NUMERALS[index] || ''}</span>`
        )
      )
      .join('');
  }

  open() {
    this.el.classList.remove('hidden');
    document.documentElement.classList.add('draft-open');
    document.addEventListener('keydown', this.onKey);
    this.el.querySelector('.draft-card')?.focus?.({ preventScroll: true });
    return new Promise((resolve) => {
      this.resolve = resolve;
    });
  }

  /** @returns {object|null} */
  pick(id) {
    const found = (this.model || []).find((entry) => entry.id === id) || null;
    return this.finish(found);
  }

  /** Close and settle the pending promise exactly once. */
  finish(value = null) {
    const resolve = this.resolve;
    this.resolve = null;
    this.el?.classList.add('hidden');
    document.documentElement.classList.remove('draft-open');
    document.removeEventListener('keydown', this.onKey);
    if (resolve) resolve(value);
    return value;
  }

  /** Tear the panel down (`hide()` alias for the game-flow helpers). */
  hide() {
    this.finish(null);
  }

  /** Close without resolving — used when a scene restarts under the panel. */
  close() {
    this.finish(null);
  }

  handleKey(event) {
    if (!this.isOpen) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      this.finish(null);
      return;
    }
    const index = NUMERALS.indexOf(event.key);
    if (index === -1) return;
    const entry = (this.model || [])[index];
    if (!entry) return;
    event.preventDefault();
    this.pick(entry.id);
  }
}

/**
 * Cards carry a pixel glyph; the emoji stays as a text fallback for anything
 * that has not been given art yet. A missing emoji font renders as a hollow
 * box, which is exactly the "generic UI" look this panel has to avoid.
 */
function artMarkup(entry) {
  if (entry?.art) return `<img class="draft-art" src="${entry.art}" alt="" />`;
  return entry?.icon || '✦';
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[ch]));
}

function escapeAttr(value) {
  return escapeHtml(value);
}
