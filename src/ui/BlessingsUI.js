import { blessingBoard } from '../systems/Blessings.js';
import { audio } from '../rendering/AudioSynth.js';

/**
 * BlessingsUI — the in-battle gold sink.
 *
 * Opened from the pause card, so the player is never forced into it mid-wave:
 * the battle is paused, they see their gold, and the purchase applies the
 * moment they resume. The panel reads its state from the live scene through a
 * small provider so it never holds a stale copy of the economy.
 */
export class BlessingsUI {
  /**
   * @param {HTMLElement} container
   * @param {{
   *   state: () => { gold:number, purchased:object } | null,
   *   buy: (id:string) => { ok:boolean, reason?:string, healed?:number },
   * }} provider
   */
  constructor(container, provider) {
    this.container = container;
    this.provider = provider;
    this.visible = false;
  }

  show() {
    if (!this.provider.state()) return;
    this.render();
    this.visible = true;
    document.getElementById('blessings-screen')?.classList.remove('hidden');
  }

  hide() {
    document.getElementById('blessings-screen')?.classList.add('hidden');
    this.visible = false;
    if (this.container) this.container.innerHTML = '';
  }

  cardMarkup(blessing) {
    const remaining = blessing.remaining;
    const soldOut = remaining <= 0;
    const label = soldOut ? 'SOLD OUT' : `BUY · ${blessing.cost}g`;
    return `
      <li class="blessing-card ${soldOut ? 'sold-out' : ''}" data-id="${blessing.id}">
        <span class="blessing-icon" aria-hidden="true">${blessing.icon}</span>
        <div class="blessing-body">
          <span class="blessing-name">${blessing.name}</span>
          <p class="blessing-desc">${blessing.desc}</p>
          <span class="blessing-left">${soldOut ? 'Fully used this battle' : `${remaining} left this battle`}</span>
        </div>
        <button class="game-btn blessing-buy ${blessing.affordable ? 'game-btn-primary' : ''}"
                data-blessing="${blessing.id}" ${blessing.affordable ? '' : 'disabled aria-disabled="true"'}>
          ${label}
        </button>
      </li>
    `;
  }

  render() {
    const state = this.provider.state();
    if (!state) return;
    const board = blessingBoard({ gold: state.gold, purchased: state.purchased });

    this.container.innerHTML = `
      <div id="blessings-screen" class="modal-overlay" role="dialog" aria-label="Blessings">
        <div class="modal-card blessings-card">
          <header class="modal-header">
            <h2 class="modal-title">BLESSINGS</h2>
            <button id="btn-blessings-close" class="btn-close" aria-label="Close">✕</button>
          </header>
          <p class="blessings-wallet">
            <img src="/assets/ui/icon_coin.png" alt="" /> <strong>${state.gold}</strong> gold ·
            gold spent here is gone for good
          </p>
          <ul class="blessing-list">
            ${board.map((b) => this.cardMarkup(b)).join('')}
          </ul>
          <p class="blessings-note">Blessings last for this battle only. Relics are the permanent upgrades — see the Forge in the main menu.</p>
        </div>
      </div>
    `;

    this.container.querySelectorAll('.blessing-buy').forEach((btn) => {
      btn.addEventListener('click', () => {
        const result = this.provider.buy(btn.dataset.blessing);
        if (!result?.ok) {
          audio.playError();
          return;
        }
        audio.playCoin();
        this.render();
      });
    });

    this.container.querySelector('#btn-blessings-close')?.addEventListener('click', () => {
      audio.playClick();
      this.hide();
    });
  }
}
