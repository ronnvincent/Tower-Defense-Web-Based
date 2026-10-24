/**
 * Wave definitions & difficulty progression.
 *
 * Each wave is structured into sequential groups that spawn in FIFO order via the
 * custom Circular Queue. Introduces enemy archetypes in a progressive manner:
 *  - Wave 1: Grunt infantry introduction
 *  - Wave 2: Fast Runners to test single-target reaction
 *  - Wave 3: Swarm slimes + Wave 3 Mid-Boss: Stone Colossus (2 phases)
 *  - Wave 4: Armored Brutes + Plague Shamans (tests anti-armor & healer targeting)
 *  - Wave 5: Aegis Shielded Knights + Mixed Swarms
 *  - Wave 6: Elite Escort + Wave 6 Final Boss: Abyssal Warlord (3 phases)
 */

export const WAVES = [
  {
    name: 'The Scouting Line',
    groups: [
      { type: 'grunt', count: 10, interval: 1000 },
    ],
  },
  {
    name: 'Swift Infiltration',
    groups: [
      { type: 'grunt', count: 8, interval: 850 },
      { type: 'runner', count: 10, interval: 500, delay: 1500 },
    ],
  },
  {
    name: 'The Colossus Awakening',
    bossWave: true,
    bossKey: 'colossus',
    groups: [
      { type: 'grunt', count: 8, interval: 800 },
      { type: 'swarm', count: 14, interval: 320, delay: 1000 },
      { type: 'colossus', count: 1, interval: 0, delay: 2000 },
    ],
  },
  {
    name: 'Iron Vanguard',
    groups: [
      { type: 'brute', count: 4, interval: 1600 },
      { type: 'healer', count: 3, interval: 2200, delay: 1500 },
      { type: 'runner', count: 10, interval: 450, delay: 1000 },
      { type: 'brute', count: 3, interval: 1400, delay: 1200 },
    ],
  },
  {
    name: 'The Abyssal Swarm',
    groups: [
      { type: 'shield', count: 5, interval: 1400 },
      { type: 'swarm', count: 18, interval: 280, delay: 1200 },
      { type: 'runner', count: 8, interval: 400, delay: 1000 },
      { type: 'brute', count: 4, interval: 1200, delay: 1000 },
    ],
  },
  {
    name: 'Cataclysmic Siege',
    bossWave: true,
    bossKey: 'warlord',
    groups: [
      { type: 'shield', count: 6, interval: 1200 },
      { type: 'brute', count: 5, interval: 1100, delay: 1000 },
      { type: 'healer', count: 4, interval: 1800, delay: 1200 },
      { type: 'warlord', count: 1, interval: 0, delay: 2500 },
      { type: 'runner', count: 8, interval: 350, delay: 2000 },
    ],
  },
];

/**
 * Total enemies a wave will spawn (used for HUD "remaining" counter).
 * Works for generated endless waves too — they are plain wave objects.
 */
export function countWaveEnemies(wave) {
  let total = 0;
  for (const group of wave.groups) total += group.count;
  return total;
}
