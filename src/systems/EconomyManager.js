/**
 * EconomyManager — owns the player's coins and score.
 *
 * Invariants enforced here (so no other code can break them):
 *   - coins never become negative: spend() refuses if the player can't afford it
 *   - only finite, non-negative amounts are accepted
 */
export class EconomyManager {
  constructor(startingCoins) {
    this.coins = startingCoins;
    this.score = 0;
    this.totalEarned = 0;
    this.totalSpent = 0;
  }

  canAfford(amount) {
    return Number.isFinite(amount) && amount >= 0 && this.coins >= amount;
  }

  /** @returns {boolean} true if the purchase succeeded */
  spend(amount) {
    if (!this.canAfford(amount)) return false;
    this.coins -= amount;
    this.totalSpent += amount;
    return true;
  }

  earn(amount) {
    if (!Number.isFinite(amount) || amount <= 0) return;
    const whole = Math.floor(amount);
    this.coins += whole;
    this.totalEarned += whole;
  }

  addScore(points) {
    if (!Number.isFinite(points) || points <= 0) return;
    this.score += Math.floor(points);
  }
}
