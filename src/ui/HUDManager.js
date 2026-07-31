/**
 * HUDManager
 * Neobrutalist UI controller for VÉRTICE.
 * Fully defensive against missing DOM elements to prevent TypeError exceptions.
 */
export class HUDManager {
  constructor(gameCallbacks) {
    this.callbacks = gameCallbacks;

    // Core HUD Displays
    this.timerDisplay = document.getElementById('timer-display');
    this.rankDisplay = document.getElementById('rank-display');
    this.bestDisplay = document.getElementById('best-display');

    // Messages & Indicators
    this.centerMessage = document.getElementById('center-message');
    this.messageSubtitle = document.getElementById('message-subtitle');

    // Near-Miss Toast (matches both ID naming conventions)
    this.nearmissToast = document.getElementById('nearmiss-toast') || document.getElementById('near-miss-indicator');
    this.nearmissText = document.getElementById('nearmiss-text') || document.getElementById('near-miss-text');

    // Overlays
    this.startOverlay = document.getElementById('start-overlay');
    this.gameoverOverlay = document.getElementById('gameover-overlay') || document.getElementById('start-overlay');
    this.pauseOverlay = document.getElementById('pause-overlay');

    // Action Buttons
    this.btnStart = document.getElementById('btn-start');
    this.btnRetry = document.getElementById('btn-retry') || document.getElementById('btn-start');
    this.btnResume = document.getElementById('btn-resume');
    this.btnPauseRestart = document.getElementById('btn-pause-restart');
    this.btnAudioToggle = document.getElementById('btn-audio-toggle');
    this.btnPaletteToggle = document.getElementById('btn-palette-toggle');
    this.btnSyncToggle = document.getElementById('btn-sync-toggle');
    this.syncPill = document.getElementById('sync-pill');
    this.bpmDisplay = document.getElementById('bpm-display');

    // Final Stats Elements
    this.statsSummary = document.getElementById('game-stats-summary');
    this.recordBadge = document.getElementById('record-badge');
    this.finalTime = document.getElementById('final-time');
    this.finalBest = document.getElementById('final-best');
    this.finalNearmiss = document.getElementById('final-nearmiss') || document.getElementById('final-near-misses');
    this.finalRank = document.getElementById('final-rank');

    // Touch Controls
    this.touchLeft = document.getElementById('touch-left');
    this.touchRight = document.getElementById('touch-right');
    this.touchControls = document.getElementById('touch-controls');

    this.rankNotificationTimer = null;
    this.nearmissTimer = null;
    this.nearmissChain = 0;
    this.nearmissChainTimer = null;

    this._lastTimerText = '';
    this._lastAccent = '';

    this.setupListeners();
  }

  setupListeners() {
    if (this.btnStart) {
      this.btnStart.addEventListener('click', () => {
        this.hideAllOverlays();
        this.callbacks.onStartGame();
      });
    }

    if (this.btnRetry && this.btnRetry !== this.btnStart) {
      this.btnRetry.addEventListener('click', () => {
        this.hideAllOverlays();
        this.callbacks.onStartGame();
      });
    }

    if (this.btnResume && this.callbacks.onResumeGame) {
      this.btnResume.addEventListener('click', () => {
        this.callbacks.onResumeGame();
      });
    }

    if (this.btnPauseRestart) {
      this.btnPauseRestart.addEventListener('click', () => {
        this.hideAllOverlays();
        this.callbacks.onStartGame();
      });
    }

    if (this.btnAudioToggle) {
      this.btnAudioToggle.addEventListener('click', () => {
        const isMuted = this.callbacks.onToggleAudio();
        this.btnAudioToggle.innerText = `AUDIO: ${isMuted ? 'OFF' : 'ON'}`;
      });
    }

    if (this.btnPaletteToggle) {
      this.btnPaletteToggle.addEventListener('click', () => {
        const paletteName = this.callbacks.onTogglePalette();
        this.btnPaletteToggle.innerText = paletteName.split(' ')[0];
      });
    }

    if (this.btnSyncToggle && this.callbacks.onToggleSync) {
      this.btnSyncToggle.addEventListener('click', async () => {
        this.btnSyncToggle.innerText = 'ESCUCHANDO…';
        const state = await this.callbacks.onToggleSync();
        if (state === 'ON') {
          this.btnSyncToggle.innerText = 'SYNC: ON';
          if (this.syncPill) this.syncPill.classList.remove('hidden');
        } else {
          this.btnSyncToggle.innerText = state === 'ERROR' ? 'SYNC ✕' : 'SYNC ♪';
          if (this.syncPill) this.syncPill.classList.add('hidden');
        }
      });
    }

    if (this.touchControls) {
      const activePointers = new Map();

      const updateDir = () => {
        let dir = 0;
        for (const d of activePointers.values()) dir += d;
        this.callbacks.onTouchInput(dir, activePointers.size);
        if (this.touchLeft) this.touchLeft.classList.toggle('active', [...activePointers.values()].includes(-1));
        if (this.touchRight) this.touchRight.classList.toggle('active', [...activePointers.values()].includes(1));
      };

      const dirForEvent = (e) => (e.clientX < window.innerWidth / 2 ? -1 : 1);

      this.touchControls.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        activePointers.set(e.pointerId, dirForEvent(e));
        updateDir();
      });

      const release = (e) => {
        if (activePointers.delete(e.pointerId)) updateDir();
      };

      this.touchControls.addEventListener('pointerup', release);
      this.touchControls.addEventListener('pointercancel', release);
      this.touchControls.addEventListener('pointermove', (e) => {
        if (activePointers.has(e.pointerId)) {
          const d = dirForEvent(e);
          if (activePointers.get(e.pointerId) !== d) {
            activePointers.set(e.pointerId, d);
            updateDir();
          }
        }
      });
    }
  }

  updateBpm(bpm) {
    if (this.bpmDisplay) {
      this.bpmDisplay.innerText = `♪ ${bpm} BPM`;
    }
  }

  updateTimer(formattedTime) {
    if (this.timerDisplay && formattedTime !== this._lastTimerText) {
      this._lastTimerText = formattedTime;
      this.timerDisplay.innerText = formattedTime;
    }
  }

  updateRank(rankName) {
    if (this.rankDisplay) {
      this.rankDisplay.innerText = rankName;
    }
  }

  updateBestScore(formattedBest) {
    if (this.bestDisplay) {
      this.bestDisplay.innerText = `BEST ${formattedBest}`;
    }
  }

  syncAccent(accentCss) {
    if (accentCss !== this._lastAccent) {
      this._lastAccent = accentCss;
      document.documentElement.style.setProperty('--accent-color', accentCss);
    }
  }

  showRankNotification(rankName) {
    if (!this.centerMessage || !this.messageSubtitle) return;
    this.messageSubtitle.innerText = rankName;
    this.centerMessage.classList.remove('hidden');

    if (this.rankNotificationTimer) clearTimeout(this.rankNotificationTimer);
    this.rankNotificationTimer = setTimeout(() => {
      this.centerMessage.classList.add('hidden');
    }, 1300);
  }

  showNearMiss(count) {
    this.triggerNearMissPop(count);
  }

  triggerNearMissPop(count) {
    if (count !== undefined) {
      this.nearmissChain = count;
    } else {
      this.nearmissChain++;
    }

    if (this.nearmissText) {
      this.nearmissText.innerText = this.nearmissChain > 1
        ? `ROZE! ×${this.nearmissChain}`
        : 'ROZE!';
    }

    if (this.nearmissToast) {
      this.nearmissToast.classList.remove('hidden', 'pop');
      void this.nearmissToast.offsetWidth;
      this.nearmissToast.classList.add('pop');
    }

    if (this.nearmissTimer) clearTimeout(this.nearmissTimer);
    this.nearmissTimer = setTimeout(() => {
      if (this.nearmissToast) this.nearmissToast.classList.add('hidden');
    }, 900);

    if (this.nearmissChainTimer) clearTimeout(this.nearmissChainTimer);
    this.nearmissChainTimer = setTimeout(() => {
      this.nearmissChain = 0;
    }, 2500);
  }

  showGameOver(finalTime, bestTime, isNewRecord, nearMisses = 0, rankName = '') {
    if (this.finalTime) this.finalTime.innerText = finalTime;
    if (this.finalBest) this.finalBest.innerText = bestTime;
    if (this.finalNearmiss) this.finalNearmiss.innerText = nearMisses.toString();
    if (this.finalRank) this.finalRank.innerText = rankName;
    if (this.recordBadge) this.recordBadge.classList.toggle('hidden', !isNewRecord);

    if (this.statsSummary) this.statsSummary.classList.remove('hidden');
    if (this.btnStart) this.btnStart.innerText = 'REINTENTAR';
    if (this.gameoverOverlay) this.gameoverOverlay.classList.remove('hidden');
  }

  showPause(show) {
    if (this.pauseOverlay) {
      this.pauseOverlay.classList.toggle('hidden', !show);
    }
  }

  hideAllOverlays() {
    if (this.startOverlay) this.startOverlay.classList.add('hidden');
    if (this.gameoverOverlay && this.gameoverOverlay !== this.startOverlay) {
      this.gameoverOverlay.classList.add('hidden');
    }
    if (this.pauseOverlay) this.pauseOverlay.classList.add('hidden');
    if (this.statsSummary) this.statsSummary.classList.add('hidden');
  }

  hideStartOverlay() {
    this.hideAllOverlays();
  }
}
