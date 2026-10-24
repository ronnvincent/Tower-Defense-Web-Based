import { BUILD_OPTIONS, getBuildDefinition } from '../data/towerData.js';
import { audio } from '../rendering/AudioSynth.js';

export class HUD {
  /**
   * @param {HTMLElement} container
   * @param {object} callbacks
   */
  constructor(container, callbacks) {
    this.container = container;
    this.callbacks = callbacks;
    this.selectedBuildKey = null;
    this.inspectedTower = null;
    this.toastTimer = null;

    this.initDOM();
  }

  initDOM() {
    this.container.innerHTML = `
      <div id="hud-top-bar" class="hud-panel">
        <div class="hud-stat-group">
          <div class="hud-stat" id="stat-base-hp" title="Base Health">
            <img class="hud-icon-img heart-pulse" src="/assets/ui/icon_heart.svg" alt="Base HP" />
            <div class="hud-stat-meta">
              <span class="hud-label">BASE INTEGRITY</span>
              <span class="hud-value" id="val-base-hp">20 / 20</span>
            </div>
          </div>
          <div class="hud-stat" id="stat-coins" title="Available Coins">
            <img class="hud-icon-img gold-coin" src="/assets/ui/icon_coin.png" alt="Treasury" />
            <div class="hud-stat-meta">
              <span class="hud-label">TREASURY</span>
              <span class="hud-value gold-text" id="val-coins">160</span>
            </div>
          </div>
          <div class="hud-stat" id="stat-score" title="Total Score">
            <img class="hud-icon-img" src="/assets/ui/icon_trophy.png" alt="Score" />
            <div class="hud-stat-meta">
              <span class="hud-label">SCORE</span>
              <span class="hud-value" id="val-score">0</span>
            </div>
          </div>
        </div>

        <div class="hud-stat-group hud-center-group">
          <div class="hud-wave-badge">
            <span class="hud-wave-label">DEFENSE WAVE</span>
            <span class="hud-wave-number" id="val-wave">1 / 6</span>
            <span class="hud-wave-sub" id="val-enemies-left">10 Enemies</span>
          </div>
          <button id="btn-start-wave" class="game-btn game-btn-primary game-btn-pulse">
            <span class="btn-glow"></span>
            <span class="btn-text">START WAVE</span>
          </button>
        </div>

        <div class="hud-stat-group hud-controls-group">
          <button id="btn-speed" class="game-btn game-btn-subtle" title="Toggle Simulation Speed (1x / 2x)">
            1×
          </button>
          <button id="btn-pause" class="game-btn game-btn-subtle" title="Pause / Resume Game">
            <img id="img-pause" class="btn-icon-img" src="/assets/ui/icon_pause.png" alt="Pause" />
          </button>
          <button id="btn-codex" class="game-btn game-btn-gold" title="Open DSALGO Algorithm Codex">
            <img class="btn-icon-img" src="/assets/ui/icon_codex.png" alt="Codex" />
            <span>CODEX</span>
          </button>
          <button id="btn-mute" class="game-btn game-btn-subtle" title="Toggle Sound">
            <img id="img-mute" class="btn-icon-img" src="/assets/ui/icon_audio_on.png" alt="Sound" />
          </button>
          <button id="btn-menu" class="game-btn game-btn-subtle" title="Return to Menu">
            <img class="btn-icon-img" src="/assets/ui/icon_gear.png" alt="Menu" />
            <span>MENU</span>
          </button>
        </div>
      </div>

      <!-- Boss Encounter Top Banner -->
      <div id="boss-banner" class="boss-panel hidden">
        <div class="boss-title-row">
          <span class="boss-skull">💀</span>
          <span id="boss-name" class="boss-name">STONE COLOSSUS</span>
          <span id="boss-phase-badge" class="boss-phase-badge">PHASE 1</span>
        </div>
        <div class="boss-bar-frame">
          <div id="boss-shield-bar" class="boss-shield-bar" style="width: 0%;"></div>
          <div id="boss-hp-bar" class="boss-hp-bar" style="width: 100%;"></div>
        </div>
        <div class="boss-hp-values">
          <span id="boss-hp-text">1600 / 1600 HP</span>
          <span id="boss-ability-text" class="boss-ability-text">Hardened Carapace</span>
        </div>
      </div>

      <div id="toast-banner" class="toast-banner hidden"></div>

      <!-- Tower Selection, Upgrade & Specialization Inspector -->
      <div id="tower-inspector" class="hud-panel hidden">
        <div class="inspector-header">
          <div class="inspector-title-group">
            <span id="inspect-name" class="inspector-name">Archer Tower</span>
            <span id="inspect-level" class="inspector-level">★ Level 1</span>
          </div>
          <button id="btn-close-inspect" class="btn-close">✕</button>
        </div>

        <!-- Targeting Priority Mode Selector -->
        <div id="inspect-targeting" class="inspector-targeting-group">
          <span class="lbl">TARGETING PRIORITY</span>
          <div class="targeting-buttons">
            <button class="target-btn active" data-mode="first" title="Target enemy furthest along the path">FIRST</button>
            <button class="target-btn" data-mode="strongest" title="Target enemy with highest current health">STRONG</button>
            <button class="target-btn" data-mode="nearest" title="Target enemy closest to tower">NEAR</button>
            <button class="target-btn" data-mode="last" title="Target enemy nearest to spawn portal">LAST</button>
          </div>
        </div>

        <div id="inspect-stats" class="inspector-stats-grid">
          <div class="stat-cell"><span class="lbl">DAMAGE</span><span class="val" id="inspect-dmg">15</span></div>
          <div class="stat-cell"><span class="lbl">RANGE</span><span class="val" id="inspect-rng">150px</span></div>
          <div class="stat-cell"><span class="lbl">ATTACK SPEED</span><span class="val" id="inspect-spd">0.65s</span></div>
          <div class="stat-cell"><span class="lbl">DAMAGE TYPE</span><span class="val" id="inspect-type">Physical</span></div>
          <div class="stat-cell full-width"><span class="lbl">SPECIAL PERK</span><span class="val" id="inspect-spl">-</span></div>
        </div>

        <div id="inspector-actions-container" class="inspector-actions">
          <!-- Dynamically populated upgrade / branching options & sell button -->
        </div>
      </div>

      <!-- Bottom Build Dock -->
      <div id="hud-bottom-dock" class="hud-panel">
        <div class="dock-title">FORGE DEFENSES</div>
        <div class="dock-cards" id="dock-cards-container">
          <!-- Build cards injected dynamically -->
        </div>
      </div>
    `;

    this.renderBuildCards();
    this.bindEvents();
  }

  renderBuildCards() {
    const container = document.getElementById('dock-cards-container');
    container.innerHTML = BUILD_OPTIONS.map((key) => {
      const def = getBuildDefinition(key);
      const isBarricade = key === 'barricade';
      return `
        <div class="build-card ${isBarricade ? 'barricade-card' : ''}" data-key="${key}" id="card-${key}" title="${def.description}">
          <div class="card-hotkey">${def.hotkey}</div>
          <div class="card-icon-frame">
            <div class="card-sprite sprite-${key}"></div>
          </div>
          <div class="card-info">
            <span class="card-name">${def.name}</span>
            <span class="card-cost"><img class="cost-coin-icon" src="/assets/ui/icon_coin.png" alt="Cost" /> ${def.cost}</span>
          </div>
        </div>
      `;
    }).join('');
  }

  bindEvents() {
    // Build Card Selection
    document.querySelectorAll('.build-card').forEach((card) => {
      card.addEventListener('click', () => {
        const key = card.dataset.key;
        this.toggleBuildSelection(key);
      });
    });

    // Wave Start Button
    document.getElementById('btn-start-wave').addEventListener('click', () => {
      audio.playClick();
      this.callbacks.onStartWave();
    });

    // Speed Toggle
    const speedBtn = document.getElementById('btn-speed');
    speedBtn.addEventListener('click', () => {
      audio.playClick();
      const newSpeed = this.callbacks.onToggleSpeed();
      speedBtn.innerText = `${newSpeed}×`;
      speedBtn.classList.toggle('active', newSpeed > 1);
    });

    // Pause Toggle
    const pauseBtn = document.getElementById('btn-pause');
    const pauseImg = document.getElementById('img-pause');
    pauseBtn.addEventListener('click', () => {
      audio.playClick();
      const isPaused = this.callbacks.onTogglePause();
      if (pauseImg) {
        pauseImg.src = isPaused ? '/assets/ui/icon_speed.png' : '/assets/ui/icon_pause.png';
      }
      pauseBtn.classList.toggle('active', isPaused);
    });

    // Codex Button
    document.getElementById('btn-codex').addEventListener('click', () => {
      audio.playClick();
      this.callbacks.onOpenCodex();
    });

    // Mute Button
    const muteBtn = document.getElementById('btn-mute');
    const muteImg = document.getElementById('img-mute');
    if (muteImg) {
      muteImg.src = audio.muted ? '/assets/ui/icon_audio_off.png' : '/assets/ui/icon_audio_on.png';
    }
    muteBtn.addEventListener('click', () => {
      const muted = audio.toggleMute();
      if (muteImg) {
        muteImg.src = muted ? '/assets/ui/icon_audio_off.png' : '/assets/ui/icon_audio_on.png';
      }
    });

    // Menu Button
    document.getElementById('btn-menu').addEventListener('click', () => {
      audio.playClick();
      this.callbacks.onOpenMenu();
    });

    // Close Inspector
    document.getElementById('btn-close-inspect').addEventListener('click', () => {
      audio.playClick();
      this.closeInspector();
    });

    // Targeting priority buttons
    document.querySelectorAll('.target-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (!this.inspectedTower) return;
        const mode = btn.dataset.mode;
        this.inspectedTower.setTargetingMode(mode);
        this.updateTargetingUI(mode);
      });
    });
  }

  updateTargetingUI(activeMode) {
    document.querySelectorAll('.target-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset.mode === activeMode);
    });
  }

  toggleBuildSelection(key) {
    audio.playClick();
    if (this.selectedBuildKey === key) {
      this.clearBuildSelection();
    } else {
      this.selectedBuildKey = key;
      document.querySelectorAll('.build-card').forEach((c) => {
        c.classList.toggle('selected', c.dataset.key === key);
      });
      this.closeInspector();
      this.callbacks.onSelectBuild(key);
    }
  }

  clearBuildSelection() {
    this.selectedBuildKey = null;
    document.querySelectorAll('.build-card').forEach((c) => c.classList.remove('selected'));
    this.callbacks.onSelectBuild(null);
  }

  showToast(message, type = 'info') {
    const banner = document.getElementById('toast-banner');
    if (!banner) return;
    banner.innerText = message;
    banner.className = `toast-banner toast-${type}`;
    banner.classList.remove('hidden');

    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      banner.classList.add('hidden');
    }, 2800);
  }

  /* ======================================================= BOSS ENCOUNTER HUD */

  showBossBanner(boss) {
    const banner = document.getElementById('boss-banner');
    if (!banner) return;
    banner.classList.remove('hidden');
    document.getElementById('boss-name').innerText = boss.def.name.toUpperCase();
    this.updateBossPhase(boss, boss.bossPhases[0] || { phase: 1, name: 'Engaged' });
    this.updateBossBar(boss);
  }

  updateBossPhase(boss, phase) {
    const badge = document.getElementById('boss-phase-badge');
    const abilityText = document.getElementById('boss-ability-text');
    if (badge) badge.innerText = `PHASE ${phase.phase || 1}`;
    if (abilityText) abilityText.innerText = phase.name || 'Encounter Active';
  }

  updateBossBar(boss) {
    const banner = document.getElementById('boss-banner');
    if (!banner || banner.classList.contains('hidden')) return;

    const hpBar = document.getElementById('boss-hp-bar');
    const shieldBar = document.getElementById('boss-shield-bar');
    const hpText = document.getElementById('boss-hp-text');

    const hpPct = Math.max(0, Math.min(100, (boss.health / boss.maxHealth) * 100));
    hpBar.style.width = `${hpPct}%`;

    if (boss.maxShield > 0) {
      const shieldPct = Math.max(0, Math.min(100, (boss.shield / boss.maxShield) * 100));
      shieldBar.style.width = `${shieldPct}%`;
      shieldBar.style.display = boss.shield > 0 ? 'block' : 'none';
      hpText.innerText = boss.shield > 0
        ? `${boss.health} / ${boss.maxHealth} HP (Shield: ${boss.shield})`
        : `${boss.health} / ${boss.maxHealth} HP`;
    } else {
      shieldBar.style.display = 'none';
      hpText.innerText = `${boss.health} / ${boss.maxHealth} HP`;
    }
  }

  hideBossBanner() {
    const banner = document.getElementById('boss-banner');
    if (banner) banner.classList.add('hidden');
  }

  /* ========================================================== TOWER INSPECTOR */

  inspectTower(tower) {
    this.inspectedTower = tower;
    this.clearBuildSelection();
    const panel = document.getElementById('tower-inspector');
    panel.classList.remove('hidden');

    const statsGrid = document.getElementById('inspect-stats');
    const targetingGroup = document.getElementById('inspect-targeting');
    const actionsContainer = document.getElementById('inspector-actions-container');

    // Update Header Name & Level Title
    let titleStr = `★ Level ${tower.level}`;
    if (tower.specialization) {
      titleStr = `★3 ${tower.stats.title}`;
    } else if (tower.isBarricade) {
      titleStr = tower.stats?.title || (tower.level === 2 ? 'Reinforced Palisade' : 'Wooden Palisade');
    }

    document.getElementById('inspect-name').innerText = tower.stats?.title || tower.def.name;
    document.getElementById('inspect-level').innerText = titleStr;

    if (tower.isBarricade) {
      targetingGroup.style.display = 'none';
      const thorns = tower.stats?.thornsDamage || 0;
      statsGrid.innerHTML = `
        <div class="stat-cell full-width">
          <span class="lbl">ROLE</span>
          <span class="val">Forces enemy BFS path rerouting</span>
        </div>
        <div class="stat-cell full-width">
          <span class="lbl">THORNS RETALIATION</span>
          <span class="val">${thorns > 0 ? `${thorns} Physical Damage on Contact` : 'None (Level 1)'}</span>
        </div>
      `;
    } else {
      targetingGroup.style.display = 'block';
      this.updateTargetingUI(tower.targetingMode);

      const s = tower.stats;
      document.getElementById('inspect-dmg').innerText = s.damage;
      document.getElementById('inspect-rng').innerText = `${s.range}px`;
      document.getElementById('inspect-spd').innerText = `${(s.cooldown / 1000).toFixed(2)}s`;
      document.getElementById('inspect-type').innerText = (s.damageType || 'Physical').toUpperCase();

      let special = '-';
      if (s.splash) special = `Area Splash: ${s.splash}px radius`;
      else if (s.slow) special = `Slows: ${Math.round(s.slow * 100)}% (${(s.slowMs / 1000).toFixed(1)}s)`;
      else if (s.armorPenetration) special = `Armor Pen: ${Math.round(s.armorPenetration * 100)}%`;
      else if (s.armorBreak) special = `Breaks Armor: -${s.armorBreak} (${(s.armorBreakMs / 1000).toFixed(1)}s)`;
      else if (s.chainTargets) special = `Chain Lightning: ${s.chainTargets} targets`;
      document.getElementById('inspect-spl').innerText = special;
    }

    // Render Upgrade / Branching Actions
    const opts = tower.nextUpgrades;
    let buttonsHtml = '';

    if (opts.length === 1) {
      // Single linear upgrade (Level 1 -> Level 2 or Barricade 1 -> 2)
      const opt = opts[0];
      buttonsHtml = `
        <button id="btn-upgrade-tower" class="game-btn game-btn-upgrade" data-choice="${opt.key}">
          UPGRADE (<img class="cost-coin-icon" src="/assets/ui/icon_coin.png" alt="Gold" /> <span id="inspect-upgrade-cost">${opt.upgradeCost}</span>)
        </button>
      `;
    } else if (opts.length > 1) {
      // Branching Specialization (Level 2 -> Level 3 Specialization A vs B)
      buttonsHtml = `
        <div class="spec-selection-block">
          <div class="spec-selection-title">CHOOSE SPECIALIZATION:</div>
          <div class="spec-cards-row">
            ${opts.map((opt) => `
              <button class="game-btn game-btn-spec btn-upgrade-choice" data-choice="${opt.key}" title="${opt.description}">
                <div class="spec-btn-title">${opt.title}</div>
                <div class="spec-btn-cost"><img class="cost-coin-icon" src="/assets/ui/icon_coin.png" alt="Gold" /> ${opt.upgradeCost}</div>
                <div class="spec-btn-desc">${opt.description}</div>
              </button>
            `).join('')}
          </div>
        </div>
      `;
    } else {
      // Max Level
      buttonsHtml = `
        <button class="game-btn game-btn-subtle" disabled style="opacity:0.7;">
          ★ MAX SPECIALIZATION REACHED
        </button>
      `;
    }

    // Sell button
    buttonsHtml += `
      <button id="btn-sell-tower" class="game-btn game-btn-sell">
        SELL (+<img class="cost-coin-icon" src="/assets/ui/icon_coin.png" alt="Gold" /> <span id="inspect-sell-refund">${tower.sellRefund}</span>)
      </button>
    `;

    actionsContainer.innerHTML = buttonsHtml;

    // Bind dynamic upgrade buttons
    const singleUpgradeBtn = document.getElementById('btn-upgrade-tower');
    if (singleUpgradeBtn) {
      singleUpgradeBtn.addEventListener('click', () => {
        this.callbacks.onUpgradeTower(this.inspectedTower, singleUpgradeBtn.dataset.choice);
      });
    }

    document.querySelectorAll('.btn-upgrade-choice').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.callbacks.onUpgradeTower(this.inspectedTower, btn.dataset.choice);
      });
    });

    const sellBtn = document.getElementById('btn-sell-tower');
    if (sellBtn) {
      sellBtn.addEventListener('click', () => {
        audio.playCoin();
        this.callbacks.onSellTower(this.inspectedTower);
        this.closeInspector();
      });
    }
  }

  closeInspector() {
    this.inspectedTower = null;
    const panel = document.getElementById('tower-inspector');
    if (panel) panel.classList.add('hidden');
    this.callbacks.onDeselectTower();
  }

  update(state) {
    const { baseHealth, maxBaseHealth, coins, score, waveNumber, totalWaves, enemiesRemaining, canStartWave, isSpawning } = state;

    document.getElementById('val-base-hp').innerText = `${baseHealth} / ${maxBaseHealth}`;
    document.getElementById('val-coins').innerText = coins;
    document.getElementById('val-score').innerText = score;
    document.getElementById('val-wave').innerText = `${waveNumber} / ${totalWaves}`;
    document.getElementById('val-enemies-left').innerText = isSpawning
      ? `${enemiesRemaining} Spawning...`
      : `${enemiesRemaining} Enemies Left`;

    const startBtn = document.getElementById('btn-start-wave');
    startBtn.disabled = !canStartWave;
    startBtn.classList.toggle('game-btn-pulse', canStartWave);

    // Disable dock build cards player cannot afford
    document.querySelectorAll('.build-card').forEach((card) => {
      const def = getBuildDefinition(card.dataset.key);
      const unaffordable = coins < def.cost;
      card.classList.toggle('disabled', unaffordable);
    });

    // Re-evaluate inspector upgrade affordabilities
    if (this.inspectedTower) {
      const singleUpgradeBtn = document.getElementById('btn-upgrade-tower');
      if (singleUpgradeBtn) {
        singleUpgradeBtn.disabled = !this.inspectedTower.canUpgrade(singleUpgradeBtn.dataset.choice);
      }
      document.querySelectorAll('.btn-upgrade-choice').forEach((btn) => {
        btn.disabled = !this.inspectedTower.canUpgrade(btn.dataset.choice);
      });
    }
  }
}
