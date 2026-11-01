import { Queue } from '../dsa/Queue.js';
import { countWaveEnemies } from '../data/waveData.js';

/**
 * WaveManager — controls wave progression and enemy spawning.
 *
 * When a wave starts, its groups are flattened into individual spawn entries
 *   { type, delay }   (delay = ms to wait after the previous spawn)
 * which are ENQUEUED into our custom FIFO Queue. Every frame, update() adds the
 * elapsed time to a timer and DEQUEUES entries whose delay has passed. FIFO
 * order guarantees enemies appear exactly in the order the wave lists them.
 *
 * States:
 *   idle      – waiting for the player to start the next wave
 *   spawning  – the spawn queue still has entries
 *   clearing  – queue is empty, but enemies are still alive on the map
 *   finished  – the last wave has been cleared
 *
 * startNextWave() only works in the idle state, which prevents duplicate or
 * premature wave starts (e.g. double-clicking the button).
 */
/**
 * Gold for calling the next wave while the current horde is still alive.
 * Scaling with the leftovers keeps a 1-enemy call from being a free 6 gold and
 * makes a 12-enemy call a real risk/reward swing.
 */
export function earlyCallBonus(aliveEnemies) {
  const n = Math.max(0, Math.floor(Number(aliveEnemies) || 0));
  return Math.min(70, 6 + n * 3);
}

export const WAVE_STATE = {
  IDLE: 'idle',
  SPAWNING: 'spawning',
  CLEARING: 'clearing',
  FINISHED: 'finished',
};

export class WaveManager {
  /**
   * @param {Array} waves wave definitions (see data/waveData.js)
   * @param {object} callbacks
   * @param {(type:string, waveNumber:number) => void} callbacks.onSpawn
   * @param {boolean} [callbacks.endless] generate waves forever
   * @param {(n:number) => object} [callbacks.waveFactory] endless wave builder
   */
  constructor(waves, { onSpawn, endless = false, waveFactory = null }) {
    this.waves = waves;
    this.onSpawn = onSpawn;
    this.endless = Boolean(endless);
    this.waveFactory = waveFactory;
    // Endless runs start idle with an empty list; generated waves are cached
    // here rather than pushed into the (shared, immutable) level data.
    this.generated = [];
    this.state = waves.length > 0 || this.endless ? WAVE_STATE.IDLE : WAVE_STATE.FINISHED;
    this.currentIndex = -1; // index of the wave in progress / last started
    this.spawnQueue = new Queue(32);
    this.spawnTimer = 0;
    this.spawnedThisWave = 0;
    this.totalThisWave = 0;
    this.wavesCompleted = 0;
  }

  get totalWaves() {
    return this.endless ? Infinity : this.waves.length;
  }

  /** Wave definition at `index`, falling back to the endless generator. */
  waveAt(index) {
    return this.waves[index] ?? this.generated[index] ?? null;
  }

  /** 1-based number of the wave in progress (0 before the first wave). */
  get waveNumber() {
    return this.currentIndex + 1;
  }

  get currentWave() {
    return this.waveAt(this.currentIndex);
  }

  get nextWave() {
    // `currentIndex` is a 0-based array index, so the *next* wave's 1-based
    // number is currentIndex + 2.
    return this.waveAt(this.currentIndex + 1) || (this.endless ? this.waveFactory?.(this.currentIndex + 2) : null);
  }

  canStartNextWave() {
    if (this.state !== WAVE_STATE.IDLE) return false;
    return this.endless || this.currentIndex + 1 < this.waves.length;
  }

  /**
   * Can the player call the next wave on top of the horde still on the map?
   *
   * Only once every spawn of the current wave is already out (`clearing`): the
   * queue is per-wave, so calling early *during* spawning would either drop
   * pending spawns or interleave two waves' cadence. Calling during the clean-up
   * phase is the interesting decision — trade a few leftover kills for tempo.
   */
  canCallEarly(aliveEnemies = 0) {
    if (this.state !== WAVE_STATE.CLEARING) return false;
    if (aliveEnemies <= 0) return false;
    return this.endless || this.currentIndex + 1 < this.waves.length;
  }

  /** @returns {boolean} true if a wave was started */
  startNextWave() {
    if (!this.canStartNextWave()) return false;
    return this.#beginWave();
  }

  /**
   * Settle the current wave and start the next one immediately.
   *
   * The leftover enemies stay on the map and now overlap with the new wave; the
   * current wave still counts as completed (it paid its clear bonus via the
   * caller) so the run summary and stars stay honest.
   *
   * @returns {null | {settledWave:number, bonus:number, wave:number}}
   */
  callEarly(aliveEnemies = 0) {
    if (!this.canCallEarly(aliveEnemies)) return null;
    const settledWave = this.waveNumber;
    this.wavesCompleted += 1;
    if (!this.#beginWave()) return null;
    return { settledWave, bonus: earlyCallBonus(aliveEnemies), wave: this.waveNumber };
  }

  #beginWave() {
    this.currentIndex++;
    let wave = this.waveAt(this.currentIndex);
    if (!wave && this.endless && this.waveFactory) {
      // The factory takes a 1-based wave number; the cache is index-keyed.
      wave = this.waveFactory(this.currentIndex + 1);
      this.generated[this.currentIndex] = wave;
    }
    if (!wave) {
      this.state = WAVE_STATE.FINISHED;
      return false;
    }

    this.spawnQueue.clear();
    let previousInterval = 0;
    wave.groups.forEach((group, groupIndex) => {
      for (let i = 0; i < group.count; i++) {
        let delay;
        if (i === 0) {
          delay = (groupIndex === 0 ? 0 : previousInterval) + (group.delay ?? 0);
        } else {
          delay = group.interval;
        }
        this.spawnQueue.enqueue({ type: group.type, delay });
      }
      previousInterval = group.interval;
    });

    this.totalThisWave = countWaveEnemies(wave);
    this.spawnedThisWave = 0;
    this.spawnTimer = 0;
    this.state = WAVE_STATE.SPAWNING;
    return true;
  }

  /** Enemies still waiting in the spawn queue. */
  pendingSpawns() {
    return this.spawnQueue.size();
  }

  /**
   * Advance spawning and detect wave completion.
   * @param {number} deltaMs simulation time step
   * @param {number} aliveEnemies number of enemies currently on the map
   * @returns {null | {type:'waveComplete', waveNumber:number, isFinal:boolean}}
   */
  update(deltaMs, aliveEnemies) {
    if (this.state === WAVE_STATE.SPAWNING) {
      this.spawnTimer += deltaMs;
      // "while" (not "if") so a long frame can release several due spawns.
      while (!this.spawnQueue.isEmpty() && this.spawnTimer >= this.spawnQueue.peek().delay) {
        const entry = this.spawnQueue.dequeue();
        this.spawnTimer -= entry.delay;
        this.spawnedThisWave++;
        this.onSpawn(entry.type, this.waveNumber);
      }
      if (this.spawnQueue.isEmpty()) {
        // Completion is checked from the next frame on, when the caller's
        // alive count already includes the enemies spawned just now.
        this.state = WAVE_STATE.CLEARING;
        return null;
      }
    }

    if (this.state === WAVE_STATE.CLEARING && aliveEnemies === 0) {
      this.wavesCompleted++;
      const isFinal = this.endless ? false : this.currentIndex + 1 >= this.waves.length;
      this.state = isFinal ? WAVE_STATE.FINISHED : WAVE_STATE.IDLE;
      // A bounty wave (duel arenas only) pays a lump sum on top of the clear
      // bonus; the event carries it so the scene does not reach into the list.
      const closed = this.currentWave;
      return {
        type: 'waveComplete',
        waveNumber: this.waveNumber,
        isFinal,
        bounty: Boolean(closed?.bounty),
        bountyGold: Number(closed?.bountyGold) || 0,
        bountyScore: Number(closed?.bountyScore) || 0,
      };
    }
    return null;
  }
}
