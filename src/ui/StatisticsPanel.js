import { audio } from '../rendering/AudioSynth.js';

export class StatisticsPanel {
  /**
   * @param {HTMLElement} container
   * @param {object} providers { pathfinding, leaderboard, gameState, queue }
   * @param {object} callbacks { onToggleBFSVisualizer }
   */
  constructor(container, providers, callbacks) {
    this.container = container;
    this.providers = providers;
    this.callbacks = callbacks;
    this.visualizingBFS = false;
  }

  show() {
    audio.playClick();
    this.render();
    const modal = document.getElementById('stats-modal');
    modal.classList.remove('hidden');
  }

  hide() {
    audio.playClick();
    const modal = document.getElementById('stats-modal');
    if (modal) modal.classList.add('hidden');
  }

  render() {
    const pf = this.providers.pathfinding;
    const lb = this.providers.leaderboard;
    const gs = this.providers.gameState;

    const lastBFS = pf.lastRun || {
      nodesVisited: 0,
      nodesExplored: 0,
      neighborChecks: 0,
      pathNodes: 0,
      pathEdges: 0,
      timeMs: 0,
      purpose: 'None yet',
    };

    const cumBFS = pf.cumulative;
    const sortStats = lb.lastSortStats || {
      elements: lb.records.length,
      comparisons: 0,
      merges: 0,
      writes: 0,
      maxDepth: 0,
    };
    const searchStats = lb.lastSearch || { comparisons: 0, found: false, n: 0 };
    const counters = gs.counters;

    this.container.innerHTML = `
      <div id="stats-modal" class="modal-overlay">
        <div class="modal-card modal-large stats-card">
          <div class="modal-header">
            <h1 class="modal-title"><img class="modal-title-icon" src="/assets/ui/icon_codex.png" alt="" /> DSALGO TECHNICAL TELEMETRY &amp; ALGORITHM CODEX</h1>
            <button id="btn-close-stats" class="btn-close">✕</button>
          </div>

          <div class="modal-body stats-body">
            <!-- Algorithm Card 1: Breadth-First Search -->
            <div class="telemetry-section">
              <div class="telemetry-header">
                <h3>1. BREADTH-FIRST SEARCH (BFS) — SHORTEST PATH FINDING</h3>
                <span class="complexity-badge">Time: O(V + E) | Space: O(V)</span>
              </div>
              <p class="telemetry-desc">
                Traverses unweighted battlefield road graph to compute the minimal step path from Spawn (5,0) to Base (5,19).
                Enforces path feasibility for active barricade placement and dynamic enemy rerouting.
              </p>

              <div class="telemetry-grid">
                <div class="tel-box">
                  <span class="tel-lbl">MOST RECENT SEARCH PURPOSE</span>
                  <span class="tel-val tel-text">${lastBFS.purpose}</span>
                </div>
                <div class="tel-box">
                  <span class="tel-lbl">PATH LENGTH (NODES / STEPS)</span>
                  <span class="tel-val gold-text">${lastBFS.pathNodes} nodes (${lastBFS.pathEdges} steps)</span>
                </div>
                <div class="tel-box">
                  <span class="tel-lbl">NODES VISITED (LAST RUN)</span>
                  <span class="tel-val">${lastBFS.nodesVisited} nodes</span>
                </div>
                <div class="tel-box">
                  <span class="tel-lbl">NEIGHBOR CHECKS (LAST RUN)</span>
                  <span class="tel-val">${lastBFS.neighborChecks} checks</span>
                </div>
                <div class="tel-box">
                  <span class="tel-lbl">MEASURED EXECUTION TIME</span>
                  <span class="tel-val">${lastBFS.timeMs.toFixed(3)} ms</span>
                </div>
                <div class="tel-box">
                  <span class="tel-lbl">TOTAL CUMULATIVE BFS RUNS</span>
                  <span class="tel-val">${cumBFS.runs} searches (${cumBFS.nodesVisited} nodes total)</span>
                </div>
              </div>

              <div class="telemetry-action-bar">
                <button id="btn-toggle-bfs-vis" class="game-btn game-btn-gold">
                  ${this.visualizingBFS ? '👁️ HIDE BFS SEARCH TREE OVERLAY' : '👁️ VISUALIZE BFS SEARCH TREE ON MAP'}
                </button>
              </div>
            </div>

            <!-- Algorithm Card 2: Merge Sort -->
            <div class="telemetry-section">
              <div class="telemetry-header">
                <h3>2. MERGE SORT (RECURSIVE DIVIDE &amp; CONQUER)</h3>
                <span class="complexity-badge">Time: O(n log n) | Space: O(n)</span>
              </div>
              <p class="telemetry-desc">
                Sorts local leaderboard records descending by score, tie-breaking by completed waves, elapsed time, and timestamp.
                Operates without JavaScript built-in Array.prototype.sort().
              </p>

              <div class="telemetry-grid">
                <div class="tel-box">
                  <span class="tel-lbl">RECORDS SORTED (n)</span>
                  <span class="tel-val gold-text">${sortStats.elements} items</span>
                </div>
                <div class="tel-box">
                  <span class="tel-lbl">COMPARISONS PERFORMED</span>
                  <span class="tel-val">${sortStats.comparisons}</span>
                </div>
                <div class="tel-box">
                  <span class="tel-lbl">MERGE OPERATIONS</span>
                  <span class="tel-val">${sortStats.merges}</span>
                </div>
                <div class="tel-box">
                  <span class="tel-lbl">ARRAY ELEMENT WRITES</span>
                  <span class="tel-val">${sortStats.writes}</span>
                </div>
                <div class="tel-box">
                  <span class="tel-lbl">MAX RECURSION DEPTH</span>
                  <span class="tel-val">${sortStats.maxDepth} levels</span>
                </div>
                <div class="tel-box">
                  <span class="tel-lbl">LAST LINEAR SEARCH SCANS</span>
                  <span class="tel-val">${searchStats.comparisons} checks (n=${searchStats.n})</span>
                </div>
              </div>
            </div>

            <!-- Gameplay Telemetry -->
            <div class="telemetry-section">
              <div class="telemetry-header">
                <h3>3. GAMEPLAY &amp; DATA STRUCTURE METRICS</h3>
                <span class="complexity-badge">Live Counter</span>
              </div>
              <div class="telemetry-grid">
                <div class="tel-box">
                  <span class="tel-lbl">ENEMIES SPAWNED (QUEUE FIFO)</span>
                  <span class="tel-val">${counters.enemiesSpawned}</span>
                </div>
                <div class="tel-box">
                  <span class="tel-lbl">ENEMIES DEFEATED</span>
                  <span class="tel-val gold-text">${counters.enemiesDefeated}</span>
                </div>
                <div class="tel-box">
                  <span class="tel-lbl">TOWERS CONSTRUCTED</span>
                  <span class="tel-val">${counters.towersPlaced}</span>
                </div>
                <div class="tel-box">
                  <span class="tel-lbl">TOWER UPGRADES</span>
                  <span class="tel-val">${counters.towerUpgrades}</span>
                </div>
                <div class="tel-box">
                  <span class="tel-lbl">BARRICADES PLACED (GRAPH CUT)</span>
                  <span class="tel-val">${counters.barricadesPlaced}</span>
                </div>
                <div class="tel-box">
                  <span class="tel-lbl">BARRICADES REJECTED (BFS GUARD)</span>
                  <span class="tel-val">${counters.barricadesRejected}</span>
                </div>
              </div>
            </div>
          </div>

          <div class="modal-footer">
            <button id="btn-done-stats" class="game-btn game-btn-primary">CLOSE CODEX</button>
          </div>
        </div>
      </div>
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
        this.callbacks.onToggleBFSVisualizer(this.visualizingBFS);
        this.hide(); // close modal so student can see the battlefield immediately
      });
    }
  }
}
