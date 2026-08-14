/**
 * HUDManager
 * Neobrutalist UI Controller for VÉRTICE.
 * Handles mode selection, leaderboard display, voice/control toggles,
 * stats presentation and touch interactions.
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

    // Near-Miss Toast
    this.nearmissToast = document.getElementById('near-miss-indicator');
    this.nearmissText = document.getElementById('near-miss-text');

    // Overlays
    this.startOverlay = document.getElementById('start-overlay');
    this.pauseOverlay = document.getElementById('pause-overlay');
    this.leaderboardOverlay = document.getElementById('leaderboard-overlay');

    // Action Buttons & Badges
    this.turboPill = document.getElementById('turbo-pill');
    this.comboPill = document.getElementById('combo-pill');
    this.comboDisplay = document.getElementById('combo-display');
    this.btnStart = document.getElementById('btn-start');
    this.btnResume = document.getElementById('btn-resume');
    this.btnPauseRestart = document.getElementById('btn-pause-restart');
    this.btnAudioToggle = document.getElementById('btn-audio-toggle');
    this.btnVoiceToggle = document.getElementById('btn-voice-toggle');
    this.btnControlToggle = document.getElementById('btn-control-toggle');
    this.btnPaletteToggle = document.getElementById('btn-palette-toggle');
    this.btnSyncToggle = document.getElementById('btn-sync-toggle');
    this.btnLeaderboardToggle = document.getElementById('btn-leaderboard-toggle');
    this.btnCloseLeaderboard = document.getElementById('btn-close-leaderboard');
    this.syncPill = document.getElementById('sync-pill');
    this.bpmDisplay = document.getElementById('bpm-display');

    // Mode Selector Buttons
    this.modeButtons = document.querySelectorAll('.btn-mode');

    // Final Stats Elements
    this.statsSummary = document.getElementById('game-stats-summary');
    this.recordBadge = document.getElementById('record-badge');
    this.finalTime = document.getElementById('final-time');
    this.finalNearmiss = document.getElementById('final-near-misses');
    this.finalGrade = document.getElementById('final-grade');
    this.finalTitle = document.getElementById('final-title');

    // Leaderboard List
    this.leaderboardList = document.getElementById('leaderboard-list');
    this.lbTitle = document.getElementById('lb-title');

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
    // Mode Buttons
    this.modeButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const mode = e.target.getAttribute('data-mode');
        this.selectMode(mode);
      });
    });

    if (this.btnStart) {
      this.btnStart.addEventListener('click', () => {
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

    if (this.btnVoiceToggle && this.callbacks.onToggleVoice) {
      this.btnVoiceToggle.addEventListener('click', () => {
        const voiceOn = this.callbacks.onToggleVoice();
        this.btnVoiceToggle.innerText = `VOZ: ${voiceOn ? 'ON' : 'OFF'}`;
      });
    }

    if (this.btnControlToggle && this.callbacks.onToggleControl) {
      this.btnControlToggle.addEventListener('click', () => {
        const mode = this.callbacks.onToggleControl();
        this.btnControlToggle.innerText = `CTRL: ${mode}`;
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

    if (this.btnLeaderboardToggle && this.callbacks.onGetLeaderboard) {
      this.btnLeaderboardToggle.addEventListener('click', () => {
        const { mode, runs } = this.callbacks.onGetLeaderboard();
        this.showLeaderboard(mode, runs);
      });
    }

    if (this.btnCloseLeaderboard) {
      this.btnCloseLeaderboard.addEventListener('click', () => {
        if (this.leaderboardOverlay) this.leaderboardOverlay.classList.add('hidden');
      });
    }

    // Touch controls with multi-touch turbo
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

  selectMode(mode) {
    this.setModeActive(mode);
    if (this.callbacks.onSelectMode) {
      const best = this.callbacks.onSelectMode(mode);
      this.updateBestScore(best);
    }
  }

  cycleMode(direction = 1) {
    const modes = ['NORMAL', 'HIPER', 'EXTREMO', 'ZEN'];
    let currentIdx = 0;
    this.modeButtons.forEach((b, idx) => {
      if (b.classList.contains('active')) currentIdx = idx;
    });
    const nextIdx = (currentIdx + direction + modes.length) % modes.length;
    this.selectMode(modes[nextIdx]);
  }

  setModeActive(mode) {
    this.modeButtons.forEach(b => {
      b.classList.toggle('active', b.getAttribute('data-mode') === mode);
    });
  }

  showLeaderboard(mode, runs = []) {
    if (this.lbTitle) this.lbTitle.innerText = `RÉCORDS — ${mode}`;
    if (this.leaderboardList) {
      this.leaderboardList.innerHTML = '';
      if (runs.length === 0) {
        this.leaderboardList.innerHTML = '<div style="padding: 1rem; color: #777;">Aún no hay récords en este modo.</div>';
      } else {
        runs.forEach((r, idx) => {
          const row = document.createElement('div');
          row.className = 'leaderboard-row';
          row.innerHTML = `
            <span class="leaderboard-rank">#${idx + 1}</span>
            <span class="leaderboard-time">${r.formattedTime || r.time}</span>
            <span class="leaderboard-grade">${r.grade || 'A'}</span>
            <span style="font-size:0.75rem; color:#666;">${r.nearMisses || 0} rozes</span>
          `;
          this.leaderboardList.appendChild(row);
        });
      }
    }
    if (this.leaderboardOverlay) this.leaderboardOverlay.classList.remove('hidden');
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

  updateTurbo(active) {
    if (this.turboPill) {
      this.turboPill.classList.toggle('hidden', !active);
    }
  }

  updateCombo(chain) {
    if (this.comboPill) {
      if (chain >= 2) {
        if (this.comboDisplay) this.comboDisplay.innerText = `FLOW ${chain}x 🔥`;
        this.comboPill.classList.remove('hidden');
      } else {
        this.comboPill.classList.add('hidden');
      }
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
    }, 1100);
  }

  showNearMiss(count) {
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
    }, 850);

    if (this.nearmissChainTimer) clearTimeout(this.nearmissChainTimer);
    this.nearmissChainTimer = setTimeout(() => {
      this.nearmissChain = 0;
    }, 2200);
  }

  showGameOver(finalTime, bestTime, isNewRecord, nearMisses = 0, rankName = '', gradeObj = { grade: 'C', title: 'PILOTO' }) {
    if (this.finalTime) this.finalTime.innerText = finalTime;
    if (this.finalNearmiss) this.finalNearmiss.innerText = nearMisses.toString();
    if (this.finalGrade) this.finalGrade.innerText = gradeObj.grade || 'C';
    if (this.finalTitle) this.finalTitle.innerText = gradeObj.title || 'PILOTO';
    if (this.recordBadge) this.recordBadge.classList.toggle('hidden', !isNewRecord);

    if (this.statsSummary) this.statsSummary.classList.remove('hidden');
    if (this.btnStart) this.btnStart.innerText = 'REINTENTAR';
    if (this.startOverlay) this.startOverlay.classList.remove('hidden');
  }

  showPause(show) {
    if (this.pauseOverlay) {
      this.pauseOverlay.classList.toggle('hidden', !show);
    }
  }

  hideAllOverlays() {
    if (this.startOverlay) this.startOverlay.classList.add('hidden');
    if (this.pauseOverlay) this.pauseOverlay.classList.add('hidden');
    if (this.leaderboardOverlay) this.leaderboardOverlay.classList.add('hidden');
    if (this.statsSummary) this.statsSummary.classList.add('hidden');
  }
}
