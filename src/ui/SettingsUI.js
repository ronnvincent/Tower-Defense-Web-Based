/**
 * SettingsUI — the four faders, the mute switch, the graphics profile and the
 * three field switches (shake, damage numbers, colour-vision palette).
 *
 * Mounted on `document.body` rather than in `#modal-container`, because several
 * screens replace that container's markup wholesale; a settings panel that can
 * be deleted by a result screen is worse than no settings panel.
 *
 * The values are the audio graph's own (`AudioSynth.setBusVolume`), which write
 * the save on every change — closing the panel is not what persists them, so a
 * player who closes the tab mid-drag still keeps the level they set.
 */

import { AUDIO_BUSES, audio as defaultAudio } from '../rendering/AudioSynth.js';
import { QUALITY_CHOICES } from '../systems/QualityManager.js';
import { uxSettings as defaultUx } from '../config/uxSettings.js';

/** Fader rows, in signal order. */
const ROWS = [
  { bus: 'master', label: 'MASTER', hint: 'Everything the game plays' },
  { bus: 'music', label: 'MUSIC', hint: 'Menu, realm, forge, battle' },
  { bus: 'sfx', label: 'EFFECTS', hint: 'Towers, impacts, interface' },
  { bus: 'ambient', label: 'AMBIENCE', hint: 'Wind, water, fire, birds' },
];

/**
 * The three switches that are not about sound.
 *
 * Each one is a preference about *this* player's eyes and hands, so each one is
 * a default-on/off that can be changed at any time and is remembered:
 * shake off for motion sensitivity, damage numbers off for a quiet board,
 * colour assist on when red-on-green is not a difference you can see.
 */
const UX_ROWS = [
  {
    key: 'shake',
    label: 'SCREEN SHAKE',
    hint: 'Impacts nudge the camera. Off keeps the frame still.',
  },
  {
    key: 'damageNumbers',
    label: 'DAMAGE NUMBERS',
    hint: 'Floating numbers over a hit. Off leaves the health bars alone.',
  },
  {
    key: 'colourAssist',
    label: 'COLOUR ASSIST',
    hint: 'Blue and orange readings instead of red and green.',
  },
];

const pct = (value) => `${Math.round(value * 100)}%`;

const QUALITY_COPY = {
  auto: 'Picks a profile from this device, and gives up atmosphere first if a battle drops frames.',
  high: "The biome's own weather, a lit sky over the board, impact light and contact shadows.",
  balanced: 'Fifty-five percent of the particles, one ambience bed, cheaper filters.',
  performance: 'No weather, no ambience beds, quarter particles, no blurred backdrop or parallax.',
};

export class SettingsUI {
  /**
   * @param {{ audio?: object, onChange?: (state: {muted:boolean, volumes:object}) => void }} [options]
   */
  constructor({ audio = defaultAudio, quality = null, ux = defaultUx, onChange = null } = {}) {
    this.audio = audio;
    this.quality = quality;
    this.ux = ux;
    this.onChange = onChange;
    this.el = null;
    this.returnFocus = null;
    this.onKeyDown = this.#handleKey.bind(this);
    // Anything else that moves a switch (a hotkey, the console, a future
    // onboarding card) repaints the panel while it is open, so it can never
    // show a state the game is not in.
    this.ux?.subscribe?.(() => {
      if (this.open) this.refresh();
    });
  }

  /* ------------------------------------------------------------------ markup */

  #build() {
    const root = document.createElement('div');
    root.className = 'set-overlay hidden';
    root.id = 'audio-settings';
    root.innerHTML = `
      <div class="set-card" role="dialog" aria-modal="true" aria-labelledby="set-title">
        <p class="set-eyebrow">THE CONTROL DESK</p>
        <h2 class="set-title" id="set-title">Settings</h2>
        <p class="set-note">Sound is synthesised live, with a few recorded cues.</p>

        <div class="set-body">
        <div class="set-rows">
          ${ROWS.map(
            (row) => `
            <label class="set-row" for="set-${row.bus}">
              <span class="set-row-copy">
                <b>${row.label}</b>
                <i>${row.hint}</i>
              </span>
              <input id="set-${row.bus}" class="set-slider" type="range" min="0" max="100" step="1"
                     value="80" data-bus="${row.bus}" aria-describedby="set-${row.bus}-value" />
              <output class="set-row-value" id="set-${row.bus}-value" for="set-${row.bus}">80%</output>
            </label>`
          ).join('')}
        </div>

        <div class="set-quality">
          <p class="set-quality-title">GRAPHICS <span class="set-quality-effective" id="set-quality-effective"></span></p>
          <div class="set-quality-options" role="radiogroup" aria-label="Graphics quality">
            ${QUALITY_CHOICES.map(
              (choice) => `<button class="set-quality-opt" type="button" role="radio" aria-checked="false"
                data-quality="${choice}">${choice.toUpperCase()}</button>`
            ).join('')}
          </div>
          <p class="set-quality-note" id="set-quality-note"></p>
        </div>

        <div class="set-ux" role="group" aria-label="Field settings">
          <p class="set-quality-title">FIELD</p>
          ${UX_ROWS.map(
            (row) => `
            <button class="set-switch" type="button" role="switch" aria-checked="false" data-ux="${row.key}">
              <span class="set-switch-copy"><b>${row.label}</b><i>${row.hint}</i></span>
              <span class="set-switch-track" aria-hidden="true"><span class="set-switch-knob"></span></span>
            </button>`
          ).join('')}
        </div>
        </div>

        <div class="set-actions">
          <button id="set-mute" class="wm-btn set-mute" type="button" aria-pressed="false">SOUND ON</button>
          <button id="set-close" class="wm-btn wm-btn--primary set-btn" type="button">CLOSE</button>
        </div>
      </div>`;
    return root;
  }

  /* ------------------------------------------------------------------- state */

  /** Repaint the controls from the audio graph. */
  refresh() {
    if (!this.el) return;
    const volumes = this.audio.volumes || {};
    for (const { bus } of ROWS) {
      const input = this.el.querySelector(`#set-${bus}`);
      const out = this.el.querySelector(`#set-${bus}-value`);
      const value = Number.isFinite(volumes[bus]) ? volumes[bus] : 0;
      if (input) input.value = String(Math.round(value * 100));
      if (out) out.textContent = pct(value);
    }
    const quality = this.quality?.state;
    if (quality) {
      for (const button of this.el.querySelectorAll('.set-quality-opt')) {
        const on = button.dataset.quality === quality.setting;
        button.classList.toggle('is-on', on);
        button.setAttribute('aria-checked', String(on));
      }
      const effective = this.el.querySelector('#set-quality-effective');
      if (effective) {
        effective.textContent = quality.auto ? `· ${quality.level.toUpperCase()} ON THIS DEVICE` : '';
      }
      const note = this.el.querySelector('#set-quality-note');
      if (note) note.textContent = QUALITY_COPY[quality.setting] || '';
    }
    for (const button of this.el.querySelectorAll('.set-switch')) {
      const on = Boolean(this.ux?.get?.(button.dataset.ux));
      button.classList.toggle('is-on', on);
      button.setAttribute('aria-checked', String(on));
    }
    const mute = this.el.querySelector('#set-mute');
    if (mute) {
      mute.textContent = this.audio.muted ? 'SOUND OFF' : 'SOUND ON';
      mute.setAttribute('aria-pressed', String(Boolean(this.audio.muted)));
      mute.classList.toggle('is-off', Boolean(this.audio.muted));
    }
  }

  #emit() {
    this.onChange?.({
      muted: Boolean(this.audio.muted),
      volumes: this.audio.volumes,
      ux: this.ux?.all ?? null,
    });
  }

  /* ------------------------------------------------------------------ events */

  #bind() {
    const el = this.el;
    el.addEventListener('click', (event) => {
      if (event.target === el) this.hide(); // click on the dimmed field
    });
    el.querySelector('#set-close')?.addEventListener('click', () => {
      this.audio?.playCancel?.();
      this.hide();
    });
    el.querySelector('#set-mute')?.addEventListener('click', () => {
      // The flip is a physical sound, and it has to land on the audible side of
      // the switch: muting plays it first (you hear the click that silences the
      // game), unmuting plays it after (the game is loud again by then).
      const wasMuted = Boolean(this.audio.muted);
      if (!wasMuted) this.audio.playToggle?.();
      this.audio.toggleMute();
      if (wasMuted) this.audio.playToggle?.();
      this.refresh();
      this.#emit();
    });
    for (const button of el.querySelectorAll('.set-switch')) {
      button.addEventListener('click', () => {
        const changed = this.ux?.toggle?.(button.dataset.ux);
        if (changed?.changed) this.audio?.playToggle?.();
        else this.audio?.playClick?.();
        this.refresh();
        this.#emit();
      });
    }
    for (const button of el.querySelectorAll('.set-quality-opt')) {
      button.addEventListener('click', () => {
        this.quality?.set(button.dataset.quality);
        this.refresh();
        this.#emit();
      });
    }
    for (const input of el.querySelectorAll('.set-slider')) {
      input.addEventListener('input', () => {
        const bus = input.dataset.bus;
        if (!AUDIO_BUSES.includes(bus)) return;
        this.audio.setBusVolume(bus, Number(input.value) / 100);
        const out = el.querySelector(`#set-${bus}-value`);
        if (out) out.textContent = pct(Number(input.value) / 100);
        this.#emit();
      });
    }
  }

  #handleKey(event) {
    if (event.key === 'Escape') {
      event.stopPropagation();
      this.hide();
    }
  }

  /* ------------------------------------------------------------------- mount */

  show() {
    if (!this.el) {
      this.el = this.#build();
      document.body.appendChild(this.el);
      this.#bind();
    }
    this.returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.refresh();
    this.el.classList.remove('hidden');
    document.addEventListener('keydown', this.onKeyDown, true);
    // Focus the master fader: the panel is usable with the keyboard immediately,
    // and a screen reader announces the group when it lands there.
    requestAnimationFrame(() => {
      this.el?.querySelector('#set-master')?.focus?.();
    });
  }

  hide() {
    if (!this.el || this.el.classList.contains('hidden')) return;
    this.el.classList.add('hidden');
    document.removeEventListener('keydown', this.onKeyDown, true);
    // Hand focus back to whatever opened the panel, so Escape does not drop the
    // keyboard onto `<body>`.
    if (this.returnFocus?.isConnected) this.returnFocus.focus?.();
    this.returnFocus = null;
  }

  toggle() {
    if (this.el && !this.el.classList.contains('hidden')) this.hide();
    else this.show();
  }

  get open() {
    return Boolean(this.el && !this.el.classList.contains('hidden'));
  }
}
