/**
 * PetShopUI.js — the Muster Hall.
 *
 * A shop that lives *outside* the battle: you spend gold banked from cleared
 * levels, you own the creature for good, and you choose which one walks beside
 * the Vanguard. Nothing here is bought with a run's coins, so a purchase can
 * never be mistaken for an in-battle advantage you skipped the wave for.
 *
 * The Hall holds both halves of the same decision: whom the Vanguard becomes
 * (rank 1–3, each rank its own sprite and stat line) and who walks with it
 * (five companions, one at a time). They share one wallet by design — a player
 * saving for a warlord is choosing *not* to buy two companions this run.
 *
 * The screen follows the Forge's shape on purpose — header, wallet row, cards,
 * footer — because both are "permanent purchases" and the player should not
 * have to learn a second shop.
 */

import { PETS } from '../data/petData.js';
import { HERO_TIERS, heroTier, nextHeroTier } from '../data/heroData.js';
import { UNIT_SHEETS } from '../data/unitArt.js';
import { audio } from '../rendering/AudioSynth.js';

/**
 * A portrait cropped from the very sheet the unit animates, not a separate
 * icon: the body box measured in `unitArt.js` says where the creature actually
 * is inside its padded cell, so the crop is centred on it instead of on empty
 * pixels. Zoomed until the body fills ~78% of the box.
 */
function portraitStyle(texture, size = 76) {
  const sheet = UNIT_SHEETS[texture];
  if (!sheet) return '';
  const body = sheet.body || { x: 0, y: 0, w: sheet.frame, h: sheet.frame };
  const zoom = (size * 0.78) / body.h;
  const cx = (body.x + body.w / 2) * zoom;
  const cy = (body.y + body.h * 0.52) * zoom;
  return [
    `background-image:url(/${sheet.path})`,
    `background-size:${sheet.cols * sheet.frame * zoom}px ${sheet.frame * 3 * zoom}px`,
    `background-position:${Math.round(size / 2 - cx)}px ${Math.round(size / 2 - cy)}px`,
    `width:${size}px`,
    `height:${size}px`,
  ].join(';');
}

/** Short "what it does" line, read from the same numbers the entity uses. */
function abilityLine(pet) {
  const a = pet.ability;
  const secs = (ms) => `${(ms / 1000).toFixed(ms % 1000 === 0 ? 0 : 1)}s`;
  switch (a.id) {
    case 'taunt':
      return `${a.damage} damage · ${Math.round(a.slow * 100)}% slow for ${secs(a.slowMs)} · every ${secs(a.cooldownMs)}`;
    case 'mend':
      return `mends ${Math.round(a.healRatio * 100)}% of the Vanguard's health · every ${secs(a.cooldownMs)}`;
    case 'shot':
      return `${a.damage} damage at ${a.range} range · every ${secs(a.cooldownMs)}`;
    case 'burn':
      return `${a.damage} burn every ${secs(a.tickMs)} for ${secs(a.durationMs)} · every ${secs(a.cooldownMs)}`;
    case 'bomb':
      return `${a.damage} blast damage in ${a.radius}· every ${secs(a.cooldownMs)}`;
    default:
      return `every ${secs(a.cooldownMs)}`;
  }
}

/**
 * Cards lose their portraits' breathing room on a phone, where the shop has to
 * fit a 390 px-tall viewport with the rank strip and the footer still on screen.
 */
function isCompactViewport() {
  if (typeof window === 'undefined') return false;
  return window.innerWidth <= 720 || window.innerHeight <= 520;
}

export class PetShopUI {
  /**
   * @param {HTMLElement} container
   * @param {import('../systems/Progression.js').ProgressStore} progress
   * @param {{ onClose?: () => void, onPurchase?: (pet:object)=>void }} callbacks
   */
  constructor(container, progress, callbacks = {}) {
    this.container = container;
    this.progress = progress;
    this.callbacks = callbacks;
    this.visible = false;
    this.flash = null;
  }

  show() {
    this.render();
    this.visible = true;
    document.getElementById('pets-screen')?.classList.remove('hidden');
  }

  hide() {
    document.getElementById('pets-screen')?.classList.add('hidden');
    this.visible = false;
    if (this.container) this.container.innerHTML = '';
  }

  /** The Vanguard's rank ladder: what it is now, what the next coin buys. */
  heroMarkup() {
    const rank = this.progress.heroRank;
    const current = heroTier(rank);
    const next = nextHeroTier(rank);
    const affordable = next ? this.progress.gold >= next.promoteCost : false;

    const stats = (tier) =>
      `${tier.maxHealth} HP · ${tier.damage} dmg · ${tier.speed} spd · ${tier.strike.damage} strike`;

    const action = next
      ? `<button class="game-btn hero-promote ${affordable ? 'game-btn-primary' : ''}"
                 type="button" data-rank="${rank + 1}"
                 ${affordable ? '' : 'disabled aria-disabled="true"'}>
           PROMOTE · ${next.promoteCost}
           <img class="pet-coin" src="/assets/ui/icon_coin.png" alt="gold" />
         </button>`
      : '<span class="pet-equip-tag is-live">FULLY MUSTERED</span>';

    return `
      <section class="hero-rank ${next ? '' : 'is-maxed'}" aria-label="Vanguard rank">
        <span class="pet-portrait hero-portrait"
              style="${portraitStyle(current.texture, isCompactViewport() ? 62 : 86)}"
              role="img" aria-label="${current.name}"></span>
        <div class="hero-rank-body">
          <div class="pet-head">
            <span class="pet-name">${current.name}</span>
            <span class="pet-role">RANK ${rank} / ${HERO_TIERS.length}</span>
          </div>
          <p class="pet-kind">${current.title}</p>
          <p class="pet-stats">${stats(current)}</p>
          <p class="hero-rank-next">
            ${
              next
                ? `<span class="next-rank">${next.name.toUpperCase()}</span> ${stats(next)} ·
                   skills: ${next.skills.join(' · ')}`
                : `Every rank unlocked · skills: ${current.skills.join(' · ')}`
            }
          </p>
        </div>
        <div class="pet-action">${action}</div>
      </section>
    `;
  }

  cardMarkup(pet) {
    const owned = this.progress.ownsPet(pet.id);
    const equipped = this.progress.equippedPet === pet.id;
    const affordable = this.progress.gold >= pet.price;

    let action;
    if (equipped) {
      action = '<span class="pet-equip-tag is-live">WALKING WITH YOU</span>';
    } else if (owned) {
      action = `<button class="game-btn pet-equip" data-pet="${pet.id}" type="button">EQUIP</button>`;
    } else {
      action = `<button class="game-btn pet-buy ${affordable ? 'game-btn-primary' : ''}"
                 data-pet="${pet.id}" type="button"
                 ${affordable ? '' : 'disabled aria-disabled="true"'}
                 aria-label="Buy ${pet.name} for ${pet.price} gold">
           RECRUIT · ${pet.price}
           <img class="pet-coin" src="/assets/ui/icon_coin.png" alt="gold" />
         </button>`;
    }

    return `
      <li class="pet-card ${owned ? 'owned' : ''} ${equipped ? 'equipped' : ''}" data-id="${pet.id}">
        <span class="pet-portrait" style="${portraitStyle(pet.texture, isCompactViewport() ? 58 : 76)}"
              role="img" aria-label="${pet.name} the ${pet.kind}"></span>
        <div class="pet-body">
          <div class="pet-head">
            <span class="pet-name">${pet.name}</span>
            <span class="pet-role">${pet.role}</span>
          </div>
          <p class="pet-kind">${pet.kind}</p>
          <p class="pet-blurb">${pet.blurb}</p>
          <p class="pet-stats">${abilityLine(pet)}</p>
        </div>
        <div class="pet-action">${action}</div>
      </li>
    `;
  }

  render() {
    const owned = this.progress.pets;
    const equipped = this.progress.equippedPet;
    const active = PETS.find((pet) => pet.id === equipped) || null;
    const gold = this.progress.gold;
    const flash = this.flash;
    this.flash = null;

    this.container.innerHTML = `
      <div id="pets-screen" class="overlay-screen" role="dialog" aria-label="Muster Hall">
        <div class="overlay-shell pets-shell">
          <header class="overlay-header">
            <h1 class="overlay-title">MUSTER HALL</h1>
            <p class="wallet-row">
              <span class="wallet"><img src="/assets/ui/icon_coin.png" alt="" /> <b>${gold}</b> gold</span>
              <span class="wallet">${owned.length} / ${PETS.length} companions</span>
              <span class="wallet">${active ? `${active.name} is at your side` : 'no companion equipped'}</span>
            </p>
            <p class="pets-note">
              Ranks and companions are bought with gold banked from cleared levels. The Vanguard
              fights with its rank and one companion in every battle.
            </p>
          </header>

          ${flash ? `<p class="pets-flash ${flash.tone}" role="status">${flash.text}</p>` : ''}

          ${this.heroMarkup()}

          <ul class="pet-grid">
            ${PETS.map((pet) => this.cardMarkup(pet)).join('')}
          </ul>

          <footer class="overlay-actions">
            ${equipped ? '<button id="btn-pets-unequip" class="game-btn" type="button">SEND HOME</button>' : ''}
            <button id="btn-pets-back" class="game-btn">BACK</button>
          </footer>
        </div>
      </div>
    `;

    this.container.querySelectorAll('.hero-promote').forEach((btn) => {
      btn.addEventListener('click', () => {
        const rank = Number(btn.dataset.rank);
        const target = heroTier(rank);
        if (!target) return;
        const result = this.progress.promoteHero(target.promoteCost, HERO_TIERS.length);
        if (!result.ok) {
          audio.playError();
          this.flash = {
            tone: 'bad',
            text:
              result.reason === 'gold'
                ? `NOT ENOUGH GOLD — the ${target.name} costs ${target.promoteCost}`
                : 'THE VANGUARD IS ALREADY AT ITS FINAL RANK',
          };
          this.render();
          return;
        }
        audio.playVictory();
        this.callbacks.onPromote?.({ rank: result.rank });
        this.flash = { tone: 'good', text: `THE VANGUARD RISES — ${target.name.toUpperCase()}` };
        this.render();
      });
    });

    this.container.querySelectorAll('.pet-buy').forEach((btn) => {
      btn.addEventListener('click', () => {
        const pet = PETS.find((entry) => entry.id === btn.dataset.pet);
        if (!pet) return;
        const result = this.progress.buyPet(pet.id, pet.price);
        if (!result.ok) {
          audio.playError();
          this.flash = {
            tone: 'bad',
            text:
              result.reason === 'gold'
                ? `NOT ENOUGH GOLD — ${pet.name} costs ${pet.price}, you have ${result.gold}`
                : result.reason === 'owned'
                  ? `${pet.name.toUpperCase()} ALREADY WALKS WITH YOU`
                  : 'THAT COMPANION IS NOT AVAILABLE',
          };
          this.render();
          return;
        }
        audio.playVictory();
        this.callbacks.onPurchase?.({ id: pet.id, price: pet.price });
        this.flash = { tone: 'good', text: `${pet.name.toUpperCase()} JOINS THE MUSTER` };
        this.render();
      });
    });

    this.container.querySelectorAll('.pet-equip').forEach((btn) => {
      btn.addEventListener('click', () => {
        const pet = PETS.find((entry) => entry.id === btn.dataset.pet);
        if (!pet) return;
        this.progress.equipPet(pet.id);
        audio.playClick();
        this.flash = { tone: 'good', text: `${pet.name.toUpperCase()} WILL WALK BESIDE THE VANGUARD` };
        this.render();
      });
    });

    this.container.querySelector('#btn-pets-unequip')?.addEventListener('click', () => {
      this.progress.equipPet(null);
      audio.playClick();
      this.flash = { tone: 'good', text: 'COMPANION SENT HOME — IT WAITS AT THE LODGE' };
      this.render();
    });

    this.container.querySelector('#btn-pets-back')?.addEventListener('click', () => {
      audio.playClick();
      this.hide();
      this.callbacks.onClose?.();
    });
  }
}
