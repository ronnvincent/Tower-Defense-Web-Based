/**
 * PetShopUI.js — the Muster Hall, rebuilt as a three-column shop.
 *
 * A shop that lives *outside* the battle: you spend gold banked from cleared
 * levels, you own the creature for good, and exactly **one** companion walks
 * beside the Vanguard. Nothing here is bought with a run's coins, so a purchase
 * can never be mistaken for an in-battle advantage you skipped the wave for.
 *
 * The screen is laid out the way a player actually shops:
 *
 *   tabs (side)  ·  roster (all five companions)  ·  detail (stats + skill + buy)
 *
 * BUY and UPGRADE are the two tabs the request asks for, and they sit on the
 * left edge so switching costs one thumb; VANGUARD keeps the hero's rank
 * ladder — the other half of the same wallet — one tab away instead of above
 * the cards.
 *
 * Every number on the detail card comes from `data/petData.js`: the same
 * `petAbility(pet, level)` object the Pet entity fights with, so a card can
 * never advertise a number the battle does not use.
 */

import { PETS, PET_MAX_LEVEL, petSkill, petStatRows, petUpgradeCost } from '../data/petData.js';
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

/** Phones and short windows: the shop's cards lose their prose, not their art. */
function isCompactViewport() {
  if (typeof window === 'undefined') return false;
  return window.innerWidth <= 720 || window.innerHeight <= 520;
}

const TAB_LABELS = Object.freeze([
  { id: 'buy', label: 'RECRUIT', hint: 'Spend gold on a companion' },
  { id: 'upgrade', label: 'UPGRADE', hint: 'Level up the one you own' },
  { id: 'vanguard', label: 'VANGUARD', hint: 'Ranks, skills and strike' },
]);

/** Gold price tag with the coin sprite, shared by every action button. */
function priceTag(cost) {
  return `<span class="pets-price">${cost}<img class="pet-coin" src="/assets/ui/icon_coin.png" alt="gold" /></span>`;
}

export class PetShopUI {
  /**
   * @param {HTMLElement} container
   * @param {import('../systems/Progression.js').ProgressStore} progress
   * @param {{ onClose?: () => void, onPurchase?: (pet:object)=>void, onPromote?: (info:{rank:number})=>void, onUpgrade?: (pet:object)=>void }} callbacks
   */
  constructor(container, progress, callbacks = {}) {
    this.container = container;
    this.progress = progress;
    this.callbacks = callbacks;
    this.visible = false;
    this.flash = null;
    this.tab = 'buy';
    this.selected = null;
  }

  show() {
    this.selected = this.selected || this.progress.equippedPet || PETS[0].id;
    this.flash = null;
    this.render();
    this.visible = true;
    document.getElementById('pets-screen')?.classList.remove('hidden');
  }

  hide() {
    document.getElementById('pets-screen')?.classList.add('hidden');
    this.visible = false;
    if (this.container) this.container.innerHTML = '';
  }

  /* ------------------------------------------------------------- pieces */

  /** One row of the roster: portrait, name, and what state it is in. */
  cardMarkup(pet) {
    const owned = this.progress.ownsPet(pet.id);
    const level = owned ? this.progress.petLevel(pet.id) : 1;
    const equipped = this.progress.equippedPet === pet.id;
    const selected = this.selected === pet.id;
    const tone = equipped ? 'ACTIVE' : owned ? `LV ${level}` : 'LOCKED';
    return `
      <li class="pet-card ${owned ? 'owned' : 'locked'} ${equipped ? 'equipped' : ''} ${selected ? 'selected' : ''}"
          data-id="${pet.id}" data-owned="${owned ? '1' : '0'}">
        <button class="pet-card-btn" type="button" data-select="${pet.id}"
                aria-pressed="${selected ? 'true' : 'false'}"
                aria-label="${pet.name}, ${pet.role}${owned ? `, level ${level}` : ', not recruited'}">
          <span class="pet-portrait lv-${level}" style="${portraitStyle(pet.texture, isCompactViewport() ? 30 : 46)}"
                role="img" aria-label="${pet.name} the ${pet.kind}"></span>
          <span class="pet-card-text">
            <span class="pet-name">${pet.name}</span>
            <span class="pet-role">${pet.role}</span>
          </span>
          <span class="pet-card-state ${equipped ? 'is-live' : ''}">${tone}</span>
        </button>
      </li>
    `;
  }

  /** The four numbers at `level`, and the same four at `next` when upgrading. */
  statTable(pet, level, next = null) {
    const now = petStatRows(pet, level);
    const later = next ? petStatRows(pet, next) : null;
    const rows = now
      .map((row, i) => {
        const after = later?.[i];
        return `
          <div class="pet-stat">
            <span class="pet-stat-label">${row.label}</span>
            <span class="pet-stat-value">${row.value}${
              after && after.value !== row.value ? `<i class="pet-stat-next">${after.value}</i>` : ''
            }</span>
          </div>
        `;
      })
      .join('');
    return `<div class="pet-stat-grid">${rows}</div>`;
  }

  /** The price of every level still to come — planning, not guesswork. */
  costLadderMarkup(pet, level) {
    if (!this.progress.ownsPet(pet.id) || level >= PET_MAX_LEVEL) return '';
    const steps = [];
    for (let step = level + 1; step <= PET_MAX_LEVEL; step += 1) {
      steps.push(
        `<span class="pet-cost-step">LV ${step}<b>${petUpgradeCost(pet, step - 1)}</b><img class="pet-coin" src="/assets/ui/icon_coin.png" alt="gold" /></span>`
      );
    }
    return `<p class="pet-cost-ladder"><b>THE REST OF THE BILL</b>${steps.join('')}</p>`;
  }

  /** True of every companion, and worth saying once on the card. */
  factsMarkup() {
    return `<ul class="pet-facts">
      <li>Walks behind the Vanguard</li>
      <li>Cannot be targeted</li>
      <li>Never blocks a lane</li>
    </ul>`;
  }

  skillMarkup(pet) {
    const skill = petSkill(pet);
    if (!skill) return '';
    return `
      <div class="pet-skill">
        <img class="pet-skill-icon" src="${skill.icon}" alt="" />
        <div class="pet-skill-body">
          <p class="pet-skill-name">${skill.name}</p>
          <p class="pet-skill-text">${skill.text}</p>
        </div>
      </div>
    `;
  }

  /** Price of the next level, or null when the companion is maxed. */
  nextCost(pet) {
    const level = this.progress.petLevel(pet.id);
    return petUpgradeCost(pet, level);
  }

  /** BUY tab: what it is, what it does, and the one button to recruit it. */
  buyDetail(pet) {
    const owned = this.progress.ownsPet(pet.id);
    const equipped = this.progress.equippedPet === pet.id;
    const level = owned ? this.progress.petLevel(pet.id) : 1;
    const affordable = !owned && this.progress.gold >= pet.price;
    const showNext = level < PET_MAX_LEVEL;

    let action;
    if (equipped) {
      action = '<span class="pet-equip-tag is-live">ONE COMPANION — THIS ONE WALKS WITH YOU</span>';
    } else if (owned) {
      action = `<button class="game-btn game-btn-primary pet-equip" data-pet="${pet.id}" type="button">TAKE INTO BATTLE</button>`;
    } else {
      action = `<button class="game-btn pet-buy ${affordable ? 'game-btn-primary' : ''}"
                 data-pet="${pet.id}" type="button"
                 ${affordable ? '' : 'disabled aria-disabled="true"'}
                 aria-label="Buy ${pet.name} for ${pet.price} gold">
           RECRUIT ${priceTag(pet.price)}
         </button>`;
    }

    return `
      <div class="pets-detail-head">
        <span class="pet-hero-portrait lv-${level}" style="${portraitStyle(pet.texture, isCompactViewport() ? 66 : 104)}">
          <span class="pet-level-badge">${owned ? `LV ${level}` : 'NOT RECRUITED'}</span>
        </span>
        <div class="pets-detail-title">
          <p class="pet-kind">${pet.kind}</p>
          <h2 class="pets-detail-name">${pet.name}</h2>
          <p class="pet-role-chip">${pet.role}</p>
          ${
            owned
              ? `<ol class="pet-level-ladder" aria-label="Level ${level} of ${PET_MAX_LEVEL}">
                   ${Array.from({ length: PET_MAX_LEVEL }, (_, i) => {
                     const step = i + 1;
                     const cls = step <= level ? 'is-owned' : '';
                     return `<li class="pet-level-pip ${cls}" aria-label="level ${step}"><span>${step}</span></li>`;
                   }).join('')}
                 </ol>`
              : ''
          }
        </div>
      </div>
      <p class="pet-blurb">${pet.blurb}</p>
      <div class="pets-detail-grid">
        <div>
          <p class="pets-mini-head">STATS${showNext ? ' · NOW' : ''}</p>
          ${this.statTable(pet, level)}
        </div>
        <div>
          <p class="pets-mini-head">SKILL</p>
          ${this.skillMarkup(pet)}
        </div>
      </div>
      ${this.factsMarkup()}
      <div class="pets-detail-foot">${action}</div>
    `;
  }

  /** UPGRADE tab: this level against the next one, then the upgrade plate. */
  upgradeDetail(pet) {
    const owned = this.progress.ownsPet(pet.id);
    const level = this.progress.petLevel(pet.id);
    const maxed = level >= PET_MAX_LEVEL;
    const next = maxed ? null : level + 1;
    const cost = maxed ? null : petUpgradeCost(pet, level);
    const affordable = cost !== null && this.progress.gold >= cost;

    let action;
    if (!owned) {
      const canBuy = this.progress.gold >= pet.price;
      action = `<button class="game-btn pet-buy ${canBuy ? 'game-btn-primary' : ''}" data-pet="${pet.id}"
                  type="button" ${canBuy ? '' : 'disabled aria-disabled="true"'}>
                  RECRUIT FIRST ${priceTag(pet.price)}</button>`;
    } else if (maxed) {
      action = `<span class="pet-equip-tag is-live">FULLY TRAINED — LV ${PET_MAX_LEVEL}</span>`;
    } else {
      action = `<button class="game-btn pet-upgrade ${affordable ? 'game-btn-primary' : ''}"
                  data-pet="${pet.id}" type="button"
                  ${affordable ? '' : 'disabled aria-disabled="true"'}
                  aria-label="Upgrade ${pet.name} to level ${next} for ${cost} gold">
                  LEVEL UP · ${level} → ${next} ${priceTag(cost)}
                </button>`;
    }

    const ladder = Array.from({ length: PET_MAX_LEVEL }, (_, i) => {
      const step = i + 1;
      const cls = step <= level ? 'is-owned' : step === next ? 'is-next' : '';
      return `<li class="pet-level-pip ${cls}" aria-label="level ${step}"><span>${step}</span></li>`;
    }).join('');

    return `
      <div class="pets-detail-head">
        <span class="pet-hero-portrait lv-${level}" style="${portraitStyle(pet.texture, isCompactViewport() ? 66 : 104)}">
          <span class="pet-level-badge">${level} / ${PET_MAX_LEVEL}</span>
        </span>
        <div class="pets-detail-title">
          <p class="pet-kind">${pet.kind}</p>
          <h2 class="pets-detail-name">${pet.name}</h2>
          <ol class="pet-level-ladder">${ladder}</ol>
        </div>
      </div>
      <div class="pets-detail-grid">
        <div>
          <p class="pets-mini-head">${next ? `LEVEL ${level} → ${next}` : `LEVEL ${level} · MAX`}</p>
          ${this.statTable(pet, level, next)}
          ${next ? `<p class="pets-next-note">The number under each stat is what level ${next} buys.</p>` : ''}
        </div>
        <div>
          <p class="pets-mini-head">SKILL</p>
          ${this.skillMarkup(pet)}
          <p class="pet-skill-note">Every level raises the numbers above; the skill itself never changes.</p>
        </div>
      </div>
      ${this.costLadderMarkup(pet, level)}
      ${this.factsMarkup()}
      <div class="pets-detail-foot">${action}</div>
    `;
  }

  /** The Vanguard's rank ladder: what it is now, what the next coin buys. */
  vanguardDetail() {
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
           PROMOTE · ${priceTag(next.promoteCost)}
         </button>`
      : '<span class="pet-equip-tag is-live">FULLY MUSTERED</span>';

    return `
      <div class="pets-detail-head">
        <span class="pet-hero-portrait lv-${Math.min(5, rank + 2)}" style="${portraitStyle(current.texture, isCompactViewport() ? 66 : 104)}">
          <span class="pet-level-badge">RANK ${rank} / ${HERO_TIERS.length}</span>
        </span>
        <div class="pets-detail-title">
          <p class="pet-kind">${current.title}</p>
          <h2 class="pets-detail-name">${current.name}</h2>
          <p class="pet-role-chip">VANGUARD</p>
        </div>
      </div>
      <div class="pets-detail-grid">
        <div>
          <p class="pets-mini-head">NOW</p>
          <div class="pet-stat-grid">
            <div class="pet-stat"><span class="pet-stat-label">HEALTH</span><span class="pet-stat-value">${current.maxHealth}</span></div>
            <div class="pet-stat"><span class="pet-stat-label">DAMAGE</span><span class="pet-stat-value">${current.damage}</span></div>
            <div class="pet-stat"><span class="pet-stat-label">SPEED</span><span class="pet-stat-value">${current.speed}</span></div>
            <div class="pet-stat"><span class="pet-stat-label">STRIKE</span><span class="pet-stat-value">${current.strike.damage}</span></div>
          </div>
          <p class="pets-next-note">Skills: ${current.skills.join(' · ')}</p>
        </div>
        <div>
          <p class="pets-mini-head">${next ? `NEXT · ${next.name.toUpperCase()}` : 'FINAL RANK'}</p>
          <div class="pet-skill">
            <img class="pet-skill-icon" src="/assets/ui-kit/glyph_crown.png" alt="" />
            <div class="pet-skill-body">
              <p class="pet-skill-name">${next ? next.title : current.title}</p>
              <p class="pet-skill-text">${next ? stats(next) : stats(current)}</p>
              <p class="pet-skill-text">${next ? `skills: ${next.skills.join(' · ')}` : `skills: ${current.skills.join(' · ')}`}</p>
            </div>
          </div>
        </div>
      </div>
      <div class="pets-detail-foot">${action}</div>
    `;
  }

  /* ------------------------------------------------------------- render */

  render() {
    const owned = this.progress.pets;
    const equipped = this.progress.equippedPet;
    const active = PETS.find((pet) => pet.id === equipped) || null;
    const gold = this.progress.gold;
    const flash = this.flash;
    this.flash = null;
    const tab = this.tab;
    const selected = PETS.find((pet) => pet.id === this.selected) || PETS[0];

    let detail;
    if (tab === 'vanguard') detail = this.vanguardDetail();
    else if (tab === 'upgrade') detail = this.upgradeDetail(selected);
    else detail = this.buyDetail(selected);

    const tabs = TAB_LABELS.map(
      (entry) => `
        <button class="pets-tab ${tab === entry.id ? 'is-active' : ''}" type="button"
                role="tab" data-tab="${entry.id}" aria-selected="${tab === entry.id ? 'true' : 'false'}"
                title="${entry.hint}">
          <span class="pets-tab-label">${entry.label}</span>
          <span class="pets-tab-hint">${entry.hint}</span>
        </button>`
    ).join('');

    this.container.innerHTML = `
      <div id="pets-screen" class="overlay-screen pets-screen" role="dialog" aria-label="Muster Hall">
        <div class="pets-backdrop" aria-hidden="true"></div>
        <div class="overlay-shell pets-shell">
          <header class="pets-head">
            <div class="pets-head-title">
              <p class="pets-eyebrow">THE MUSTER HALL</p>
              <h1 class="overlay-title">COMPANIONS</h1>
            </div>
            <p class="pets-wallets">
              <span class="wallet"><img src="/assets/ui/icon_coin.png" alt="" /> <b>${gold}</b> gold</span>
              <span class="wallet">${owned.length} / ${PETS.length} recruited</span>
              <span class="wallet ${active ? 'is-live' : ''}">${active ? `${active.name} is at your side` : 'one companion awaits'}</span>
            </p>
          </header>

          <div class="pets-main">
            <nav class="pets-tabs" role="tablist" aria-label="Muster Hall sections">
              ${tabs}
            </nav>

            ${
              tab === 'vanguard'
                ? '<div class="pets-roster is-empty" aria-hidden="true"></div>'
                : `<ul class="pet-grid" aria-label="Companions">
                     ${PETS.map((pet) => this.cardMarkup(pet)).join('')}
                   </ul>`
            }

            <aside class="pets-detail ${tab === 'vanguard' ? 'is-wide' : ''}">
              ${detail}
            </aside>
          </div>

          <footer class="pets-foot">
            ${flash ? `<p class="pets-flash ${flash.tone}" role="status">${flash.text}</p>` : '<span class="pets-foot-note">Gold is banked from cleared levels. One companion walks with you at a time.</span>'}
            <div class="overlay-actions">
              ${equipped ? '<button id="btn-pets-unequip" class="game-btn" type="button">SEND HOME</button>' : ''}
              <button id="btn-pets-back" class="game-btn">BACK</button>
            </div>
          </footer>
        </div>
      </div>
    `;

    this.bind();
  }

  bind() {
    this.container.querySelectorAll('.pets-tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (this.tab === btn.dataset.tab) return;
        this.tab = btn.dataset.tab;
        audio.playClick();
        this.render();
      });
    });

    this.container.querySelectorAll('[data-select]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.selected = btn.dataset.select;
        audio.playClick();
        this.render();
      });
    });

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

    this.container.querySelectorAll('.pet-upgrade').forEach((btn) => {
      btn.addEventListener('click', () => {
        const pet = PETS.find((entry) => entry.id === btn.dataset.pet);
        if (!pet) return;
        const result = this.progress.upgradePet(pet.id);
        if (!result.ok) {
          audio.playError();
          this.flash = {
            tone: 'bad',
            text:
              result.reason === 'gold'
                ? `NOT ENOUGH GOLD — the next level costs ${result.cost}`
                : result.reason === 'maxed'
                  ? `${pet.name.toUpperCase()} IS ALREADY AT LEVEL ${PET_MAX_LEVEL}`
                  : `${pet.name.toUpperCase()} HAS NOT BEEN RECRUITED YET`,
          };
          this.render();
          return;
        }
        audio.playVictory();
        this.callbacks.onUpgrade?.({ id: pet.id, level: result.level, cost: result.cost });
        this.flash = { tone: 'good', text: `${pet.name.toUpperCase()} REACHES LEVEL ${result.level}` };
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
      this.flash = { tone: 'good', text: 'COMPANION SENT HOME — THE HALL WILL KEEP IT' };
      this.render();
    });

    this.container.querySelector('#btn-pets-back')?.addEventListener('click', () => {
      audio.playClick();
      this.hide();
      this.callbacks.onClose?.();
    });
  }
}
