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
   */
  constructor(waves, { onSpawn }) {
    this.waves = waves;
    this.onSpawn = onSpawn;
    this.state = waves.length > 0 ? WAVE_STATE.IDLE : WAVE_STATE.FINISHED;
    this.currentIndex = -1; // index of the wave in progress / last started
    this.spawnQueue = new Queue(32);
    this.spawnTimer = 0;
    this.spawnedThisWave = 0;
    this.totalThisWave = 0;
    this.wavesCompleted = 0;
  }

  get totalWaves() {
    return this.waves.length;
  }

  /** 1-based number of the wave in progress (0 before the first wave). */
  get waveNumber() {
    return this.currentIndex + 1;
  }

  get currentWave() {
    return this.waves[this.currentIndex] ?? null;
  }

  get nextWave() {
    return this.waves[this.currentIndex + 1] ?? null;
  }

  canStartNextWave() {
    return this.state === WAVE_STATE.IDLE && this.currentIndex + 1 < this.waves.length;
  }

  /** @returns {boolean} true if a wave was started */
  startNextWave() {
    if (!this.canStartNextWave()) return false;
    this.currentIndex++;
    const wave = this.waves[this.currentIndex];

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
      const isFinal = this.currentIndex + 1 >= this.waves.length;
      this.state = isFinal ? WAVE_STATE.FINISHED : WAVE_STATE.IDLE;
      return { type: 'waveComplete', waveNumber: this.waveNumber, isFinal };
    }
    return null;
  }
}
