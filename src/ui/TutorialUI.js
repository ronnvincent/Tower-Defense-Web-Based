/**
 * TutorialUI.js — the card the opening scene talks through.
 *
 * It is a DOM layer over the battle canvas, not a Phaser container, for the
 * same reason every other panel in this game is DOM: type, wrapping and focus
 * are the browser's job, and a portrait that has to survive a phone held
 * sideways is easier to lay out in CSS than in a scaled canvas.
 *
 * The layer owns no game state. It shows one line at a time (with a typewriter
 * reveal), one objective card at a time, and calls `onAdvance` when the player
 * taps a line that has finished typing. The director decides what comes next.
 *
 * There is deliberately no close button, no skip and no dismiss: the opening is
 * the one screen in the game a first-time player cannot click past.
 */

const TYPE_MS = 26;
const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export class TutorialUI {
  /**
   * @param {HTMLElement|null} root the `#tutorial-root` element
   */
  constructor(root = typeof document !== 'undefined' ? document.getElementById('tutorial-root') : null) {
    this.root = root;
    this.mounted = false;
    this.typing = null;
    this.fullText = '';
    this.shown = 0;
    this.onAdvance = null;
    this.onReveal = null;
  }

  /** Build the markup once. Idempotent, so a scene restart can call it again. */
  mount() {
    if (!this.root || this.mounted) return this;
    this.root.innerHTML = `
      <div class="tut-bar tut-bar--top"><span class="tut-chapter">HAVENBROOK · DUSK</span></div>
      <div class="tut-bar tut-bar--bottom"></div>
      <div class="tut-vignette" aria-hidden="true"></div>
      <section class="tut-objective hidden" aria-live="polite">
        <p class="tut-objective-kicker"><span class="tut-step">STEP 1</span> <span class="tut-of">OF 3</span></p>
        <h3 class="tut-objective-title"></h3>
        <p class="tut-objective-text"></p>
        <ol class="tut-dots" aria-hidden="true"></ol>
      </section>
      <section class="tut-speech hidden" aria-live="polite">
        <span class="tut-portrait-frame"><img class="tut-portrait" alt="" /></span>
        <div class="tut-body">
          <p class="tut-name"><span class="tut-name-text"></span><span class="tut-role"></span></p>
          <p class="tut-line"></p>
        </div>
        <button class="tut-next" type="button">NEXT <span aria-hidden="true">▸</span></button>
      </section>
      <div class="tut-alarm" aria-hidden="true"></div>
    `;
    this.chapter = this.root.querySelector('.tut-chapter');
    this.objective = this.root.querySelector('.tut-objective');
    this.stepLabel = this.root.querySelector('.tut-step');
    this.ofLabel = this.root.querySelector('.tut-of');
    this.objectiveTitle = this.root.querySelector('.tut-objective-title');
    this.objectiveText = this.root.querySelector('.tut-objective-text');
    this.dots = this.root.querySelector('.tut-dots');
    this.speech = this.root.querySelector('.tut-speech');
    this.portrait = this.root.querySelector('.tut-portrait');
    this.nameText = this.root.querySelector('.tut-name-text');
    this.roleText = this.root.querySelector('.tut-role');
    this.line = this.root.querySelector('.tut-line');
    this.nextButton = this.root.querySelector('.tut-next');
    this.alarm = this.root.querySelector('.tut-alarm');

    this.nextButton?.addEventListener('click', (event) => {
      event.stopPropagation();
      this.handleTap();
    });
    // The whole speech card is a target: on a phone the button is small and the
    // player is holding the device, so anywhere on the card advances.
    this.speech?.addEventListener('click', () => this.handleTap());
    this.mounted = true;
    return this;
  }

  /** Reveal the letterbox and the vignette. */
  open({ chapter = 'HAVENBROOK · DUSK' } = {}) {
    this.mount();
    if (!this.root) return;
    if (this.chapter) this.chapter.textContent = chapter;
    this.root.classList.remove('hidden', 'is-closing');
    this.root.classList.add('is-open');
  }

  /** Drop the letterbox; the objective card (if any) goes with it. */
  close() {
    if (!this.root) return;
    this.clearSpeech();
    this.root.classList.add('is-closing');
    window.setTimeout(() => {
      if (!this.root?.classList.contains('is-closing')) return;
      this.root.classList.remove('is-open', 'is-closing');
      this.root.classList.add('hidden');
    }, prefersReducedMotion() ? 0 : 320);
  }

  /** Show one spoken line and start its typewriter. */
  speak({ who = 'narrator', name = '', role = '', portrait = '', text = '', accent = '#cbb994' }) {
    this.mount();
    if (!this.root) return this;
    this.objective.classList.add('hidden');
    this.speech.classList.remove('hidden');
    this.speech.classList.toggle('is-narrator', who === 'narrator');
    this.speech.style.setProperty('--tut-accent', accent);
    if (this.nameText) this.nameText.textContent = who === 'narrator' ? '' : name;
    if (this.roleText) this.roleText.textContent = who === 'narrator' ? '' : role;
    if (this.portrait) {
      this.portrait.src = portrait || '';
      this.portrait.alt = who === 'narrator' ? '' : `${name} of Havenbrook`;
    }
    this.fullText = String(text || '');
    this.shown = 0;
    this.line.textContent = '';
    this.root.classList.add('is-speaking');
    // Somebody is talking: the letterbox comes in and the board is held.
    this.root.classList.remove('is-step');
    this.startTyping();
    return this;
  }

  /**
   * Show the objective card for a guided step.
   *
   * `steps` is the ordered list of step ids and `active` the one in force, so
   * the dots are the real progress rather than a decorative three.
   */
  ask({ title = '', text = '', steps = [], active = 0 } = {}) {
    this.mount();
    if (!this.root) return this;
    this.clearSpeech();
    // It is the player's turn: the letterbox retracts so the board, the forge
    // and the wave button are all fully lit and fully clickable. A step that
    // dims the control it is asking for is a step the player cannot follow.
    this.root.classList.add('is-step');
    this.objective.classList.remove('hidden');
    if (this.objectiveTitle) this.objectiveTitle.textContent = title;
    if (this.objectiveText) this.objectiveText.textContent = text;
    if (this.stepLabel) this.stepLabel.textContent = `STEP ${active + 1}`;
    if (this.ofLabel) this.ofLabel.textContent = `OF ${Math.max(steps.length, 1)}`;
    if (this.dots) {
      this.dots.innerHTML = steps
        .map((_, i) => `<li class="${i < active ? 'is-done' : i === active ? 'is-live' : ''}"></li>`)
        .join('');
    }
    return this;
  }

  /** The step is done: mark it and let the card linger for a beat. */
  completeStep(index = 0) {
    this.dots?.querySelectorAll('li').forEach((dot, i) => {
      dot.classList.toggle('is-done', i <= index);
      dot.classList.remove('is-live');
    });
  }

  clearSpeech() {
    this.stopTyping();
    this.speech?.classList.add('hidden');
    this.root?.classList.remove('is-speaking', 'is-ready');
  }

  clear() {
    this.clearSpeech();
    this.objective?.classList.add('hidden');
    this.root?.classList.remove('is-step');
  }

  /** Ring the alarm: the red pulse the bell gets. */
  flashAlarm() {
    if (!this.alarm) return;
    this.alarm.classList.remove('is-firing');
    // Force a reflow so a second alarm in the same scene replays the animation.
    void this.alarm.offsetWidth;
    this.alarm.classList.add('is-firing');
  }

  /** Register the handler for "the player wants the next line". */
  onTap(handler) {
    this.onAdvance = handler;
    return this;
  }

  /**
   * One tap. While the text is still revealing, the tap *finishes the reveal*
   * instead of skipping the line — the standard reading affordance, and it
   * means an impatient player still ends up having seen the whole sentence.
   */
  handleTap() {
    if (this.typing) {
      this.revealAll();
      return;
    }
    if (typeof this.onAdvance === 'function') this.onAdvance();
  }

  /** Jump the typewriter to the end of the line. */
  revealAll() {
    this.stopTyping();
    this.shown = this.fullText.length;
    if (this.line) this.line.textContent = this.fullText;
    this.root?.classList.add('is-ready');
  }

  startTyping() {
    this.stopTyping();
    if (!this.line) return;
    if (prefersReducedMotion()) {
      this.revealAll();
      return;
    }
    this.root?.classList.remove('is-ready');
    let last = 0;
    const step = (now) => {
      if (!this.typing) return;
      if (!last) last = now;
      const advance = Math.floor((now - last) / TYPE_MS);
      if (advance > 0) {
        last = now;
        this.shown = Math.min(this.fullText.length, this.shown + advance);
        this.line.textContent = this.fullText.slice(0, this.shown);
        if (this.onReveal) this.onReveal(this.shown, this.fullText.length);
      }
      if (this.shown >= this.fullText.length) {
        this.typing = null;
        this.root?.classList.add('is-ready');
        return;
      }
      this.typing = window.requestAnimationFrame(step);
    };
    this.typing = window.requestAnimationFrame(step);
  }

  stopTyping() {
    if (this.typing) window.cancelAnimationFrame(this.typing);
    this.typing = null;
  }

  /** True while a line is still revealing (used by tests and the scene). */
  get isTyping() {
    return Boolean(this.typing);
  }
}
