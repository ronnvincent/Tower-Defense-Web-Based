/**
 * GameStateManager — a tiny state machine for the overall match.
 *
 *   playing ⇄ paused
 *      │
 *      ├──► gameover   (base health reached 0)
 *      └──► victory    (every wave cleared with the base alive)
 *
 * gameover and victory are terminal: once one is reached, end() ignores every
 * later call, so both can never be active at the same time.
 *
 * It also owns the base health, the elapsed play time and the gameplay
 * counters shown in the statistics panel.
 */
export const STATUS = {
  PLAYING: 'playing',
  PAUSED: 'paused',
  GAME_OVER: 'gameover',
  VICTORY: 'victory',
};

export class GameStateManager {
  constructor(maxBaseHealth) {
    this.status = STATUS.PLAYING;
    this.maxBaseHealth = maxBaseHealth;
    this.baseHealth = maxBaseHealth;
    this.elapsedMs = 0;
    this.counters = {
      enemiesSpawned: 0,
      enemiesDefeated: 0,
      enemiesEscaped: 0,
      towersPlaced: 0,
      towersSold: 0,
      towerUpgrades: 0,
      barricadesPlaced: 0,
      barricadesRejected: 0,
      projectilesFired: 0,
    };
  }

  isPlaying() {
    return this.status === STATUS.PLAYING;
  }

  isPaused() {
    return this.status === STATUS.PAUSED;
  }

  isOver() {
    return this.status === STATUS.GAME_OVER || this.status === STATUS.VICTORY;
  }

  /** Advance the match clock — only while actually playing. */
  tick(deltaMs) {
    if (this.status === STATUS.PLAYING) this.elapsedMs += deltaMs;
  }

  pause() {
    if (this.status !== STATUS.PLAYING) return false;
    this.status = STATUS.PAUSED;
    return true;
  }

  resume() {
    if (this.status !== STATUS.PAUSED) return false;
    this.status = STATUS.PLAYING;
    return true;
  }

  /**
   * Reduce base health (never below 0).
   * @returns {boolean} true if this damage destroyed the base
   */
  damageBase(amount) {
    if (this.isOver() || amount <= 0) return false;
    this.baseHealth = Math.max(0, this.baseHealth - amount);
    return this.baseHealth === 0;
  }

  /**
   * Enter a terminal state. Returns false (and changes nothing) if the match
   * has already ended — this is what prevents double game-over/victory.
   */
  end(result) {
    if (this.isOver()) return false;
    if (result !== STATUS.GAME_OVER && result !== STATUS.VICTORY) return false;
    this.status = result;
    return true;
  }
}
