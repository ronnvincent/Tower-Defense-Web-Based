/**
 * NameGateUI.js — the commander-name gate in front of the main menu.
 *
 * The brief: a name is required before the menu, there is no password, and a
 * name that is already taken must be refused. That last clause is why this is a
 * small state machine and not a text box:
 *
 *   idle ──submit──▶ checking ──ok────────▶ closing ──▶ closed
 *                       │
 *                       ├─taken───────────▶ idle (error, nothing stored)
 *                       ├─invalid─────────▶ idle (error)
 *                       └─offline─────────▶ closed (name held on this device)
 *
 * The gate owns *presentation only*. Every decision about whether a name may be
 * used lives in `CloudSave.claimName()`; if that returns `{ok:false,
 * reason:'taken'}` the gate prints the refusal and stays open. There is no path
 * from here that stores a refused name.
 */

import { audio } from '../rendering/AudioSynth.js';
import { USERNAME_MAX, USERNAME_MESSAGES, USERNAME_MIN, validateUsername } from '../systems/CloudSave.js';

export class NameGateUI {
  /**
   * @param {HTMLElement|null} root `#name-gate`
   * @param {{ cloud: import('../systems/CloudSave.js').CloudSave, onAccepted?: (info:object)=>void }} options
   */
  constructor(root, { cloud, onAccepted } = {}) {
    this.root = root;
    this.cloud = cloud;
    this.onAccepted = onAccepted;

    this.form = root?.querySelector('#name-gate-form') || null;
    this.input = root?.querySelector('#name-gate-input') || null;
    this.submit = root?.querySelector('#name-gate-submit') || null;
    this.statusEl = root?.querySelector('#name-gate-status') || null;
    this.cloudEl = root?.querySelector('#name-gate-cloud') || null;

    this.busy = false;
    this.message = '';
    this.tone = 'idle';
    this._checkTimer = null;
    this._lastChecked = '';
    this._unsubscribe = null;

    this.form?.addEventListener('submit', (event) => {
      event.preventDefault();
      void this.claim();
    });
    this.input?.addEventListener('input', () => this._onTyped());
    this.input?.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') event.preventDefault();
    });

    if (this.cloud?.subscribe) this._unsubscribe = this.cloud.subscribe(() => this._paintCloud());
  }

  get isOpen() {
    return Boolean(this.root) && !this.root.classList.contains('hidden');
  }

  /** Show the gate (the menu stays covered). */
  open({ focus = true } = {}) {
    if (!this.root) return;
    this.root.classList.remove('hidden');
    this.root.classList.remove('is-closing');
    this.root.classList.add('is-open');
    this._setMessage('', 'idle');
    this._paintCloud();
    if (focus) {
      // Next frame: the panel animates in, and focusing mid-transform scrolls
      // the page on some mobile browsers.
      setTimeout(() => this.input?.focus({ preventScroll: true }), 60);
    }
  }

  /** Hide the gate. Only called once a name has been accepted. */
  close() {
    if (!this.root) return;
    this.root.classList.add('is-closing');
    const finish = () => {
      this.root.classList.add('hidden');
      this.root.classList.remove('is-open', 'is-closing');
    };
    // Reduced motion: no 240 ms goodbye.
    if (this._prefersReducedMotion()) finish();
    else setTimeout(finish, 220);
  }

  /** Put the gate back up with a message — used when the ledger later reports a conflict. */
  reopen(reason = 'taken') {
    this.open();
    this._setMessage(USERNAME_MESSAGES[reason] || USERNAME_MESSAGES.taken, 'error');
  }

  /* ------------------------------------------------------------- the claim */

  /** Submit the current name. */
  async claim() {
    if (this.busy) return { ok: false, reason: 'busy' };
    const raw = this.input?.value ?? '';
    const local = validateUsername(raw);

    if (!local.ok) {
      this._reject(local.reason);
      return { ok: false, reason: local.reason };
    }
    if (!this.cloud) {
      this._reject('offline');
      return { ok: false, reason: 'offline' };
    }

    this._setBusy(true);
    this._setMessage('CARVING THE NAME…', 'pending');

    const result = await this.cloud.claimName(local.value);
    this._setBusy(false);

    if (result.ok) {
      audio.playCoin();
      this._setMessage(`WELCOME, ${result.username || local.value}`, 'ok');
      this.lastAccepted = { username: result.username || local.value, mode: result.mode };
      this.close();
      this.onAccepted?.(this.lastAccepted);
      return result;
    }

    // The handler the brief asks for. Nothing was stored; the field stays
    // filled so the player can edit rather than retype.
    this._reject(result.reason || 'taken');
    return result;
  }

  _reject(reason) {
    this._setMessage(USERNAME_MESSAGES[reason] || USERNAME_MESSAGES.taken, 'error');
    audio.playError();
    this.root?.classList.remove('is-shaking');
    // Reflow so the shake restarts if it is already running.
    void this.root?.offsetWidth;
    this.root?.classList.add('is-shaking');
    this.input?.focus({ preventScroll: true });
    this.input?.select?.();
  }

  _setBusy(busy) {
    this.busy = Boolean(busy);
    if (this.submit) {
      this.submit.disabled = this.busy;
      this.submit.textContent = this.busy ? 'CARVING…' : 'CLAIM THIS NAME';
    }
    this.root?.classList.toggle('is-busy', this.busy);
  }

  _setMessage(text, tone) {
    this.message = text || '';
    this.tone = tone || 'idle';
    if (this.statusEl) {
      this.statusEl.textContent = this.message;
      this.statusEl.dataset.tone = this.tone;
    }
  }

  /* --------------------------------------------------------- live checking */

  _onTyped() {
    const value = (this.input?.value ?? '').slice(0, USERNAME_MAX);
    if (this.statusEl?.dataset.tone === 'error') this._setMessage('', 'idle');
    if (this._checkTimer) clearTimeout(this._checkTimer);

    const local = validateUsername(value);
    if (!local.ok) {
      // While typing, only show a hint once there is something to hint about.
      this._setMessage(
        value.length === 0 || local.reason === 'empty'
          ? ''
          : local.reason === 'short'
            ? `AT LEAST ${USERNAME_MIN} CHARACTERS`
            : USERNAME_MESSAGES[local.reason],
        value.length === 0 ? 'idle' : 'hint'
      );
      return;
    }

    this._setMessage('…', 'pending');
    this._checkTimer = setTimeout(() => void this._check(local.value), 380);
  }

  async _check(value) {
    if (!this.cloud || value === this._lastChecked) return;
    this._lastChecked = value;
    const result = await this.cloud.checkName(value);
    if ((this.input?.value ?? '').trim() !== value) return;
    if (result.reason === 'taken' || result.available === false) {
      this._setMessage(USERNAME_MESSAGES[result.reason] || USERNAME_MESSAGES.taken, 'error');
      return;
    }
    if (result.available === true) {
      this._setMessage('THAT NAME IS FREE', 'ok');
      return;
    }
    // Offline: no answer to give, and saying "free" would be a lie.
    this._setMessage('', 'idle');
  }

  /* ------------------------------------------------------------- chrome text */

  _paintCloud() {
    if (!this.cloudEl) return;
    const snap = this.cloud?.snapshot?.() || { label: 'LOCAL ONLY', status: 'off' };
    const text =
      snap.status === 'online'
        ? `LEDGER · ${snap.label}`
        : snap.status === 'connecting'
          ? 'LEDGER · CONNECTING…'
          : snap.status === 'conflict'
            ? 'LEDGER · NAME CONFLICT'
            : snap.status === 'offline'
              ? 'LEDGER · OFFLINE — PROGRESS STAYS ON THIS DEVICE'
              : 'LEDGER · LOCAL ONLY';
    this.cloudEl.textContent = text;
    this.cloudEl.dataset.state = snap.status;
  }

  _prefersReducedMotion() {
    try {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {
      return false;
    }
  }

  dispose() {
    if (this._checkTimer) clearTimeout(this._checkTimer);
    this._unsubscribe?.();
    this._unsubscribe = null;
  }
}
