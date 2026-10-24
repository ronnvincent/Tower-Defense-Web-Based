import { audio } from '../rendering/AudioSynth.js';

/**
 * DSALGO Codex — a *non-blocking* side drawer.
 *
 * The first version was a full-screen modal: opening it hid the battlefield, so
 * the BFS visualiser had to close it again before you could see anything. The
 * drawer slides over the right-hand side of the map instead, keeps the fight
 * running, and refreshes the telemetry once a second while it is open.
 */
export class StatisticsPanel {
  /**
   * @param {HTMLElement} container
   * @param {object} providers { pathfinding, leaderboard, gameState, queue }
   * @param {object} callbacks { onToggleBFSVisualizer }
   */
  constructor(container, providers, callbacks) {
    this.container = container;
    this.providers = providers;
    this.callbacks = callbacks || {};
    this.visualizingBFS = false;
    this.rendered = false;
    this.openState = false;
    this.liveTimer = null;
    this._onKeyDown = (event) => {
      if (event.key === 'Escape' && this.isOpen()) this.hide();
    };
  }

  isOpen() {
    return this.openState;
  }

  show() {
    audio.playClick();
    if (!this.rendered) {
      this.render();
      this.rendered = true;
    }
    const drawer = document.getElementById('codex-drawer');
    if (!drawer) return;
    this.openState = true;
    drawer.classList.remove('hidden');
    // Next frame so the CSS transition runs from the off-screen position.
    requestAnimationFrame(() => drawer.classList.add('open'));
    drawer.setAttribute('aria-hidden', 'false');
    this.updateLive();
    this.startLive();
    window.addEventListener('keydown', this._onKeyDown);
  }

  hide() {
    audio.playClick();
    const drawer = document.getElementById('codex-drawer');
    if (!drawer) return;
    this.openState = false;
    drawer.classList.remove('open');
    drawer.setAttribute('aria-hidden', 'true');
    this.stopLive();
    window.removeEventListener('keydown', this._onKeyDown);
    setTimeout(() => {
      if (!drawer.classList.contains('open')) drawer.classList.add('hidden');
    }, 260);
  }

  startLive() {
    this.stopLive();
    this.liveTimer = setInterval(() => this.updateLive(), 900);
  }

  stopLive() {
    if (this.liveTimer) clearInterval(this.liveTimer);
    this.liveTimer = null;
  }

  render() {
    this.container.innerHTML = `
      <aside id="codex-drawer" class="codex-drawer hidden" aria-hidden="true" aria-label="Algorithm codex">
        <div class="codex-shell">
          <header class="codex-header">
            <div class="codex-heading">
              <img class="modal-title-icon" src="/assets/ui/icon_codex.png" alt="" />
              <div>
                <h2 class="codex-title">ALGORITHM CODEX</h2>
                <p class="codex-subtitle">Battle telemetry · live while the map keeps running</p>
              </div>
            </div>
            <div class="codex-header-actions">
              <span class="live-chip" id="codex-live-chip"><span class="live-dot"></span>LIVE</span>
              <button id="btn-close-stats" class="btn-close" aria-label="Close codex">✕</button>
            </div>
          </header>

          <div class="codex-body">
            <section class="telemetry-section">
              <div class="telemetry-header">
                <h3>1 · BREADTH-FIRST SEARCH</h3>
                <span class="complexity-badge">O(V + E)</span>
              </div>
              <p class="telemetry-desc">
                The road network is an adjacency list; BFS finds the shortest unweighted path from
                the portal to the core. Every enemy marches that route — barricades are solid walls
                standing <em>on</em> it, so the horde has to stop and smash them instead of walking
                around them.
              </p>
              <div class="telemetry-grid">
                <div class="tel-box"><span class="tel-lbl">LAST SEARCH PURPOSE</span><span class="tel-val tel-text" id="live-bfs-purpose">—</span></div>
                <div class="tel-box"><span class="tel-lbl">PATH LENGTH</span><span class="tel-val gold-text" id="live-bfs-path">—</span></div>
                <div class="tel-box"><span class="tel-lbl">NODES VISITED</span><span class="tel-val" id="live-bfs-visited">0</span></div>
                <div class="tel-box"><span class="tel-lbl">NEIGHBOUR CHECKS</span><span class="tel-val" id="live-bfs-neighbors">0</span></div>
                <div class="tel-box"><span class="tel-lbl">EXECUTION TIME</span><span class="tel-val" id="live-bfs-time">0.000 ms</span></div>
                <div class="tel-box"><span class="tel-lbl">CUMULATIVE RUNS</span><span class="tel-val" id="live-bfs-runs">0</span></div>
              </div>
              <div class="telemetry-action-bar">
                <button id="btn-toggle-bfs-vis" class="game-btn game-btn-gold">SHOW BFS PATH</button>
              </div>
            </section>

            <section class="telemetry-section">
              <div class="telemetry-header">
                <h3>2 · MERGE SORT</h3>
                <span class="complexity-badge">O(n log n)</span>
              </div>
              <p class="telemetry-desc">
                Hand-written recursive merge sort ranks the leaderboard by score, then waves,
                then time — no <code>Array.prototype.sort()</code> anywhere.
              </p>
              <div class="telemetry-grid">
                <div class="tel-box"><span class="tel-lbl">RECORDS (n)</span><span class="tel-val gold-text" id="live-sort-n">0</span></div>
                <div class="tel-box"><span class="tel-lbl">COMPARISONS</span><span class="tel-val" id="live-sort-comparisons">0</span></div>
                <div class="tel-box"><span class="tel-lbl">MERGES</span><span class="tel-val" id="live-sort-merges">0</span></div>
                <div class="tel-box"><span class="tel-lbl">WRITES</span><span class="tel-val" id="live-sort-writes">0</span></div>
                <div class="tel-box"><span class="tel-lbl">RECURSION DEPTH</span><span class="tel-val" id="live-sort-depth">0</span></div>
                <div class="tel-box"><span class="tel-lbl">LINEAR SEARCH SCANS</span><span class="tel-val" id="live-search">0</span></div>
              </div>
            </section>

            <section class="telemetry-section">
              <div class="telemetry-header">
                <h3>3 · DATA STRUCTURE METRICS</h3>
                <span class="complexity-badge">Live counters</span>
              </div>
              <div class="telemetry-grid">
                <div class="tel-box"><span class="tel-lbl">SPAWNED (QUEUE FIFO)</span><span class="tel-val" id="live-spawned">0</span></div>
                <div class="tel-box"><span class="tel-lbl">DEFEATED</span><span class="tel-val gold-text" id="live-defeated">0</span></div>
                <div class="tel-box"><span class="tel-lbl">TOWERS BUILT</span><span class="tel-val" id="live-towers">0</span></div>
                <div class="tel-box"><span class="tel-lbl">UPGRADES</span><span class="tel-val" id="live-upgrades">0</span></div>
                <div class="tel-box"><span class="tel-lbl">BARRICADES BUILT</span><span class="tel-val" id="live-barricades">0</span></div>
                <div class="tel-box"><span class="tel-lbl">BARRICADES BREACHED</span><span class="tel-val" id="live-breached">0</span></div>
                <div class="tel-box"><span class="tel-lbl">REJECTED PLACEMENTS</span><span class="tel-val" id="live-rejected">0</span></div>
              </div>
            </section>
          </div>

          <footer class="codex-footer">
            <span class="codex-footnote">The battle keeps running behind this panel.</span>
            <button id="btn-done-stats" class="game-btn game-btn-subtle">CLOSE</button>
          </footer>
        </div>
      </aside>
    `;

    this.bindEvents();
  }

  bindEvents() {
    document.getElementById('btn-close-stats')?.addEventListener('click', () => this.hide());
    document.getElementById('btn-done-stats')?.addEventListener('click', () => this.hide());

    const toggleVisBtn = document.getElementById('btn-toggle-bfs-vis');
    if (toggleVisBtn) {
      toggleVisBtn.addEventListener('click', () => {
        audio.playClick();
        this.visualizingBFS = !this.visualizingBFS;
        this.callbacks.onToggleBFSVisualizer?.(this.visualizingBFS);
        this.updateLive();
      });
    }
  }

  updateLive() {
    const pf = this.providers.pathfinding || {};
    const lb = this.providers.leaderboard;
    const gs = this.providers.gameState || { counters: {} };

    const lastBFS = pf.lastRun || {
      nodesVisited: 0,
      neighborChecks: 0,
      pathNodes: 0,
      pathEdges: 0,
      timeMs: 0,
      purpose: 'No search yet',
    };
    const cumulative = pf.cumulative || { runs: 0, nodesVisited: 0 };
    const counters = gs.counters || {};

    const sortStats = (lb && lb.lastSortStats) || {
      elements: lb ? lb.records.length : 0,
      comparisons: 0,
      merges: 0,
      writes: 0,
      maxDepth: 0,
    };
    const searchStats = (lb && lb.lastSearch) || { comparisons: 0, n: 0 };

    this.set('live-bfs-purpose', lastBFS.purpose);
    this.set('live-bfs-path', `${lastBFS.pathNodes} nodes · ${lastBFS.pathEdges} steps`);
    this.set('live-bfs-visited', `${lastBFS.nodesVisited} nodes`);
    this.set('live-bfs-neighbors', `${lastBFS.neighborChecks} checks`);
    this.set('live-bfs-time', `${Number(lastBFS.timeMs || 0).toFixed(3)} ms`);
    this.set('live-bfs-runs', `${cumulative.runs} searches · ${cumulative.nodesVisited} nodes`);

    this.set('live-sort-n', `${sortStats.elements} items`);
    this.set('live-sort-comparisons', sortStats.comparisons);
    this.set('live-sort-merges', sortStats.merges);
    this.set('live-sort-writes', sortStats.writes);
    this.set('live-sort-depth', `${sortStats.maxDepth} levels`);
    this.set('live-search', `${searchStats.comparisons} checks (n=${searchStats.n})`);

    this.set('live-spawned', counters.enemiesSpawned ?? 0);
    this.set('live-defeated', counters.enemiesDefeated ?? 0);
    this.set('live-towers', counters.towersPlaced ?? 0);
    this.set('live-upgrades', counters.towerUpgrades ?? 0);
    this.set('live-barricades', counters.barricadesPlaced ?? 0);
    this.set('live-breached', counters.barricadesDestroyed ?? 0);
    this.set('live-rejected', counters.barricadesRejected ?? 0);

    const toggleVisBtn = document.getElementById('btn-toggle-bfs-vis');
    if (toggleVisBtn) {
      toggleVisBtn.textContent = this.visualizingBFS ? 'HIDE BFS PATH' : 'SHOW BFS PATH';
      toggleVisBtn.classList.toggle('active', this.visualizingBFS);
    }
  }

  set(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = String(value);
  }
}
