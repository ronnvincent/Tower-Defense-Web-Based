/**
 * Boss roster for the single boss panel.
 *
 * The HUD has room for one boss strip, and for most of the game's life there was
 * only ever one boss on the lane, so `GameScene` kept a single `activeBoss`
 * reference. Endless breaks that assumption twice over: cycle 3 sends a titan
 * *alongside* the anchor boss, and cycle 8 sends both titans with it. With one
 * slot, whichever boss spawned last owned the panel — so when it died the strip
 * was hidden while an equally lethal anchor was still marching, and a phase
 * change on an untracked boss printed its phase onto the wrong name.
 *
 * The tracker answers the only question the panel needs: **which live boss
 * deserves the strip?** Highest effective pool wins (a titan outranks its
 * anchor), ties keep the earlier spawn, and anything dead or through the gate is
 * dropped the moment it is noticed.
 */
export class BossTracker {
  constructor(bosses = []) {
    this.bosses = bosses.filter(Boolean);
  }

  /** Register a boss and return the one the panel should show. */
  add(boss) {
    if (boss && !this.bosses.includes(boss)) this.bosses.push(boss);
    return this.current;
  }

  /** Forget a boss (defeated / leaked / cleaned up) and return the next one. */
  remove(boss) {
    const index = this.bosses.indexOf(boss);
    if (index !== -1) this.bosses.splice(index, 1);
    return this.current;
  }

  /**
   * Drop bosses that died or reached the core without an explicit callback.
   *
   * Cheap enough to run every frame: the roster never holds more than a handful
   * of entries, even on the double-titan wave.
   */
  prune() {
    this.bosses = this.bosses.filter((boss) => boss && !boss.isDead && !boss.reachedBase);
    return this.current;
  }

  /** How many bosses are still on the field. */
  get alive() {
    return this.bosses.length;
  }

  /** Bosses the strip cannot show (used for the "+N" badge). */
  get extras() {
    return Math.max(0, this.bosses.length - 1);
  }

  /**
   * The boss the panel should track, or `null` when the lane is clear.
   *
   * Threat is measured on the boss's *whole* pool — base health plus the shield
   * a phase can hand it — so a shielded titan never loses the strip to a smaller
   * boss that happens to have more raw HP left.
   */
  get current() {
    let best = null;
    let bestPool = -1;
    for (const boss of this.bosses) {
      if (!boss || boss.isDead || boss.reachedBase) continue;
      const pool = (Number(boss.maxHealth) || 0) + (Number(boss.maxShield) || 0);
      // Strictly greater: on a tie the earlier spawn keeps the strip, which
      // keeps the panel from flickering between identical bosses.
      if (pool > bestPool) {
        best = boss;
        bestPool = pool;
      }
    }
    return best;
  }
}
