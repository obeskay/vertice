import { Renderer } from './engine/Renderer.js';
import { AudioEngine } from './engine/AudioEngine.js';
import { VoiceEngine } from './engine/VoiceEngine.js';
import { MusicSync } from './engine/MusicSync.js';
import { ParticleSystem } from './engine/ParticleSystem.js';
import { PaletteManager } from './engine/PaletteManager.js';
import { Player } from './game/Player.js';
import { WallManager } from './game/WallManager.js';
import { PowerUpManager } from './game/PowerUpManager.js';
import { LevelSystem } from './game/LevelSystem.js';
import { ScoreSystem } from './game/ScoreSystem.js';
import { HUDManager } from './ui/HUDManager.js';

/**
 * VÉRTICE — Neobrutalist Precision Arcade Game Loop
 * Features:
 * - 240Hz Fixed-Timestep Simulation with Sub-Pixel Interpolated Rendering
 * - Arcade 360° Orbital Control with Dynamic Banking Tilt
 * - Chiptune / Darksynth Procedural Synthesizer with Dynamic Layering
 * - YouTube / Spotify External Music Sync with automated internal music muting
 * - 4 Game Modes (Normal, Hiper, Extremo, Zen)
 * - Swept Radial Collision & Guaranteed Fair Patterns
 */
const SIM_DT = 1 / 240;
const MAX_STEPS = 40;

class Game {
  constructor() {
    this.state = 'MENU'; // MENU | PLAYING | DYING | GAMEOVER | PAUSED
    this.prevState = 'MENU';

    this.renderer = new Renderer('canvas-container');
    this.audio = new AudioEngine();
    this.voice = new VoiceEngine(this.audio);
    this.sync = new MusicSync(this.audio);
    this.particles = new ParticleSystem(this.renderer.scene);
    this.palette = new PaletteManager();

    this.player = new Player(this.renderer.scene);
    this.walls = new WallManager(this.renderer.scene);
    this.powerups = new PowerUpManager(this.renderer.scene);
    this.level = new LevelSystem();
    this.score = new ScoreSystem();

    this.walls.onRingSpawned = (ring) => this.powerups.onRingSpawned(ring);

    this.shield = false;
    this.calmaTimer = 0;

    this.keys = { left: false, right: false, turbo: false };
    this.touchInputDir = 0;
    this.touchTurbo = false;

    // Pointer steer
    this.mouseActive = false;
    this.lastMouseMove = 0;
    this.mouseWorldAngle = 0;

    // Combo FLOW
    this.flowChain = 0;
    this.flowChainTimer = 0;

    // Lanes input tracking
    this._prevInputDir = 0;
    this._holdElapsed = 0;
    this._repeatElapsed = 0;
    this._lastSides = 0;

    this.worldRotation = 0;
    this.prevWorldRotation = 0;

    this.accumulator = 0;
    this.timeScale = 1;
    this.deathElapsed = 0;
    this.lastInputDir = 0;
    this.prevBeatPulse = 0;
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Phase Dash & Hit-Stop feedback
    this.dashPulse = 0;
    this.hitStopTimer = 0;
    this.heartbeatTimer = 0;
    this._hyperdriveActive = false;

    this.hud = new HUDManager({
      onStartGame: () => this.startGame(),
      onResumeGame: () => this.resume(),
      onSelectMode: (mode) => {
        this.level.setMode(mode);
        this.score.setMode(mode);
        this.audio.setMode(mode);
        return this.score.getFormattedBestTime(mode);
      },
      onToggleAudio: () => {
        this.audio.init();
        const isMuted = !this.audio.isMuted;
        this.audio.setMuted(isMuted);
        return isMuted;
      },
      onToggleVoice: () => {
        this.voice.setEnabled(!this.voice.enabled);
        if (this.voice.enabled) this.voice.speak('VOZ ACTIVADA');
        return this.voice.enabled;
      },
      onToggleControl: () => {
        const mode = this.player.toggleControlMode();
        this.audio.playUiClick();
        return mode;
      },
      onTogglePalette: () => {
        const name = this.palette.nextPalette();
        this.audio.playUiClick();
        return name;
      },
      onToggleSync: async () => {
        if (this.sync.active) {
          this.sync.stop();
          if (this.state === 'PLAYING') this.audio.start();
          return 'OFF';
        }
        try {
          await this.sync.start();
          return 'ON';
        } catch (err) {
          console.warn('MusicSync error:', err.message || err);
          return 'ERROR';
        }
      },
      onGetLeaderboard: () => {
        return {
          mode: this.level.mode,
          runs: this.score.loadLeaderboard()
        };
      },
      onTouchDash: () => {
        this.performPhaseDash();
      },
      onTouchInput: (dir, pointerCount = 1) => {
        if (this.state === 'MENU' || this.state === 'GAMEOVER') {
          if (dir !== 0) {
            this.hud.hideAllOverlays();
            this.startGame();
          }
          return;
        }
        this.touchInputDir = -dir;
        this.touchTurbo = pointerCount >= 2;
      }
    });

    this.setupKeyboard();
    this.setupPointerSteer();
    this.setupVisibilityHandling();
    this.hud.updateBestScore(this.score.getFormattedBestTime());
    this.hud.updateRank(this.level.ranks[0].name);

    this.lastTime = performance.now();
    requestAnimationFrame((t) => this.gameLoop(t));
  }

  performPhaseDash() {
    if (this.state !== 'PLAYING') return;
    const inputDir = this.getInputDir();
    const dashed = this.player.triggerPhaseDash(inputDir);
    if (dashed) {
      this.dashPulse = 1.0;
      this.audio.playDashSound();
      this.renderer.triggerScreenShake(this.reducedMotion ? 0.2 : 0.5);
      this.renderer.triggerFovKick(14);
      const pos = this.player.getRenderPosition();
      this.fxShockwave(pos.x, pos.y, this.palette.getBlended('primary'), 24);
      this.vibrate([15, 25]);
    }
  }

  setupKeyboard() {
    window.addEventListener('keydown', (e) => {
      if (['ArrowLeft', 'ArrowRight', 'Space', 'KeyA', 'KeyD', 'KeyR', 'KeyW', 'KeyS', 'ArrowUp', 'ArrowDown'].includes(e.code)) {
        if (this.state === 'PLAYING') e.preventDefault();
      }

      // If in MENU or GAMEOVER, Left/Right arrow keys cycle difficulty mode
      if (this.state === 'MENU' || this.state === 'GAMEOVER') {
        if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
          this.hud.cycleMode(-1);
          this.audio.playUiClick();
          return;
        }
        if (e.code === 'ArrowRight' || e.code === 'KeyD') {
          this.hud.cycleMode(1);
          this.audio.playUiClick();
          return;
        }
      }

      // Playing state: Space / S / ArrowDown triggers Phase Dash
      if (this.state === 'PLAYING') {
        if (e.code === 'Space' || e.code === 'KeyS' || e.code === 'ArrowDown') {
          this.performPhaseDash();
          return;
        }
      }

      if (e.code === 'ArrowLeft' || e.code === 'KeyA') { this.keys.left = true; this._disengageMouse(); }
      if (e.code === 'ArrowRight' || e.code === 'KeyD') { this.keys.right = true; this._disengageMouse(); }
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight' ||
          e.code === 'ArrowUp' || e.code === 'KeyW') this.keys.turbo = true;

      if (e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyR') {
        if (this.state === 'MENU' || this.state === 'GAMEOVER') {
          this.hud.hideAllOverlays();
          this.startGame();
        }
      }

      if (e.code === 'Escape' || e.code === 'KeyP') {
        if (this.state === 'PLAYING') this.pause();
        else if (this.state === 'PAUSED') this.resume();
      }
    });

    window.addEventListener('keyup', (e) => {
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') this.keys.left = false;
      if (e.code === 'ArrowRight' || e.code === 'KeyD') this.keys.right = false;
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight' ||
          e.code === 'ArrowUp' || e.code === 'KeyW') this.keys.turbo = false;
    });
  }

  setupPointerSteer() {
    this.mouseActive = false;
    this.lastMouseMove = 0;
    this._mouseAnchor = null;
    window.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      const x = e.clientX, y = e.clientY;
      const now = performance.now();
      if (!this._mouseAnchor) {
        this._mouseAnchor = { x, y };
        this._lastMoveEventAt = now;
        return;
      }
      const dist = Math.hypot(x - this._mouseAnchor.x, y - this._mouseAnchor.y);
      const elapsed = now - (this._lastMoveEventAt || now);
      this._lastMoveEventAt = now;
      const contrib = dist >= 5 ? dist : 0;
      this._jitterAccum = Math.max(0, (this._jitterAccum || 0) + contrib - elapsed * 0.05);
      this._mouseAnchor = { x, y };
      if (this._jitterAccum < 10) return;
      this.mouseActive = true;
      this.lastMouseMove = performance.now();
      const cx = window.innerWidth / 2;
      const cy = window.innerHeight / 2;
      const screenAngle = Math.atan2(-(y - cy), x - cx);
      this.mouseWorldAngle = screenAngle - this.worldRotation;
    });

    // Right click triggers Phase Dash
    window.addEventListener('contextmenu', (e) => {
      if (this.state === 'PLAYING') {
        e.preventDefault();
        this.performPhaseDash();
      }
    });
  }

  setupVisibilityHandling() {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === 'PLAYING') {
        this.pause();
      }
    });
  }

  startGame() {
    this.state = 'PLAYING';
    document.body.classList.add('playing');
    this.score.reset();
    this.level.reset();
    this.player.reset();
    this.player.setLanes(this.level.sides);
    this._lastSides = this.level.sides;
    this.lastMouseMove = 0;
    this.mouseActive = false;
    this._mouseAnchor = null;
    this.walls.reset(this.level.sides);
    this.powerups.reset();
    this.fxClearTrail();
    this.shield = false;
    this.calmaTimer = 0;
    this.dashPulse = 0;
    this.hitStopTimer = 0;
    this.heartbeatTimer = 0;
    this._hyperdriveActive = false;
    this.worldRotation = 0;
    this.prevWorldRotation = 0;
    this.accumulator = 0;
    this.timeScale = 1;
    this.deathElapsed = 0;

    this.audio.setMode(this.level.mode);
    if (!this.sync.active) {
      this.audio.start();
    } else {
      this.audio.init();
    }
    this.voice.announceStart();

    this.hud.updateTimer(this.score.getFormattedCurrentTime());
    this.hud.updateBestScore(this.score.getFormattedBestTime());
    this.hud.updateRank(this.level.ranks[0].name);
    this.hud.updateDash(true, 1.0);
    this.hud.updateCombo(0, 1, false);
    this.player.setGhostColor(this.palette.getBlended('primary'));
    this.renderer.updateCenterPolygon(this.level.sides, this.palette.getBlended('center'));
  }

  pause() {
    this.prevState = this.state;
    this.state = 'PAUSED';
    if (!this.sync.active) this.audio.suspend();
    this.hud.showPause(true);
  }

  resume() {
    this.state = this.prevState === 'PAUSED' ? 'PLAYING' : this.prevState;
    if (!this.sync.active) this.audio.resume();
    this.hud.showPause(false);
    this.lastTime = performance.now();
  }

  die() {
    this.state = 'DYING';
    document.body.classList.remove('playing');
    this.deathElapsed = 0;
    this.timeScale = 0;

    this.audio.playExplosionSound();
    this.voice.announceGameOver();
    this.vibrate(60);
    this.score.commit(this.level.ranks[this.level.currentRankIndex].name);

    if (this.score.isNewRecord) {
      setTimeout(() => this.voice.announceNewRecord(), 1000);
    }

    const pos = this.player.getRenderPosition();
    this.particles.triggerExplosion(pos.x, pos.y, this.palette.getBlended('primary'));
    this.renderer.triggerScreenShake(this.reducedMotion ? 0.3 : 0.9);
    this.renderer.triggerFovKick(10);
    this.player.meshGroup.visible = false;
    this.player.setGhostVisible(false);
  }

  showGameOver() {
    this.state = 'GAMEOVER';
    this.timeScale = 1;
    const gradeObj = this.score.getGrade();
    this.hud.showGameOver(
      this.score.getFormattedCurrentTime(),
      this.score.getFormattedBestTime(),
      this.score.isNewRecord,
      this.score.nearMisses,
      this.level.ranks[this.level.currentRankIndex].name,
      gradeObj
    );
  }

  applyPaletteTheme() {
    this.renderer.setBackgroundColor(this.palette.getBlended('bg'));
    this.renderer.updateCenterPolygon(
      this.level.sides,
      this.palette.getBlended('center'),
      this.palette.getBlended('primary')
    );
    this.renderer.updateWedges(
      this.level.sides,
      this.palette.getBlended('wedgeA'),
      this.palette.getBlended('wedgeB')
    );
    this.player.setColor(this.palette.getBlended('player'));
    this.player.setShieldColor(this.palette.getBlended('primary'));
    this.walls.setColor(this.palette.getBlended('walls'));
    this.powerups.setAccentColor(this.palette.getBlended('primary'));
    this.particles.setThemeColors(this.palette.getBlended('primary'));
    this.hud.syncAccent(this.palette.getBlendedAccentCss());
  }

  fxShockwave(x, y, colorHex, speed = 18) {
    if (typeof this.particles.triggerShockwave === 'function') {
      this.particles.triggerShockwave(x, y, colorHex, speed);
    } else if (typeof this.particles.triggerNearMissShockwave === 'function') {
      this.particles.triggerNearMissShockwave(colorHex);
    }
  }

  fxTrail(x, y) {
    if (typeof this.particles.emitTrailPoint === 'function') {
      this.particles.emitTrailPoint(x, y);
    } else if (typeof this.particles.addPlayerTrailPoint === 'function') {
      this.particles.addPlayerTrailPoint(x, y, -0.05);
    }
  }

  fxClearTrail() {
    if (typeof this.particles.clearTrail === 'function') {
      this.particles.clearTrail();
    }
  }

  getInputDir() {
    let dir = 0;
    if (this.keys.left) dir += 1;
    if (this.keys.right) dir -= 1;
    if (this.touchInputDir !== 0) dir = this.touchInputDir;
    return dir;
  }

  collectPowerUp(collected) {
    this.audio.playPowerUp(collected.type);
    this.fxShockwave(collected.x, collected.y, this.palette.getBlended('primary'), 12);

    if (collected.type === 'ESCUDO') {
      this.shield = true;
      this.player.showShield(true);
      this.voice.announceShield();
      this.hud.showRankNotification('ESCUDO');
    } else if (collected.type === 'CALMA') {
      this.calmaTimer = 3.2;
      this.voice.announceSlowMo();
      this.hud.showRankNotification('CALMA');
      this.audio.setFilterCutoff(950, 0.25);
    }
  }

  _disengageMouse() {
    this.mouseActive = false;
    this.lastMouseMove = 0;
    this._mouseAnchor = null;
    this._jitterAccum = 0;
  }

  vibrate(pattern) {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try { navigator.vibrate(pattern); } catch (e) {}
    }
  }

  _performLaneMove(dir) {
    this.player.queueLaneMove(dir);
    this.audio.playLaneMoveSound(dir);
    this.vibrate(8);
  }

  step(dt) {
    this.score.update(dt);

    const levelStatus = this.level.update(this.score.currentTime, dt);

    if (levelStatus.rankChanged) {
      this.hud.updateRank(levelStatus.rankName);
      this.hud.showRankNotification(levelStatus.rankName);
      this.voice.announceRank(levelStatus.rankName);
      this.renderer.triggerScreenShake(this.reducedMotion ? 0.15 : 0.45);
      this.renderer.triggerFovKick(7);
      this.audio.playRankUp();
      this.vibrate([20, 40, 20]);
      this.fxShockwave(0, 0, this.palette.getBlended('primary'), 14);
    }
    if (levelStatus.sides !== this._lastSides) {
      this._lastSides = levelStatus.sides;
      this.player.setLanes(levelStatus.sides);
    }

    const inputDir = this.getInputDir();
    this.lastInputDir = inputDir;

    // Discrete lane step processing if in Lanes mode
    if (this.player.controlMode === 'LANES') {
      if (inputDir !== 0 && this._prevInputDir === 0) {
        this._performLaneMove(inputDir);
        this._holdElapsed = 0;
        this._repeatElapsed = 0;
      } else if (inputDir !== 0) {
        this._holdElapsed += dt;
        if (this._holdElapsed > 0.17) {
          this._repeatElapsed += dt;
          if (this._repeatElapsed >= 0.105) {
            this._repeatElapsed = 0;
            this._performLaneMove(inputDir);
          }
        }
      }
    }
    this._prevInputDir = inputDir;

    // Pointer steer logic
    const keysHeld = this.keys.left || this.keys.right || this.touchInputDir !== 0;
    const mouseFresh = this.mouseActive && (performance.now() - this.lastMouseMove < 1500);
    let pointerAngle = null;
    if (mouseFresh && !keysHeld) {
      pointerAngle = this.mouseWorldAngle;
    }

    const turbo = this.keys.turbo || this.touchTurbo;
    this.player.update(dt, inputDir, turbo, pointerAngle);

    // Trail particle emission
    const pPos = this.player.getRenderPosition();
    this.fxTrail(pPos.x, pPos.y);

    // Wall updates (Continuous, NEVER suppressed)
    const speedMult = this.sync.active ? this.sync.getSpeedMultiplier() : 1;
    const result = this.walls.update(
      dt, levelStatus.speed * speedMult, levelStatus.sides,
      this.player.getHitbox(), false
    );

    // Power-up updates
    const puResult = this.powerups.update(
      dt, this.player.getHitbox(),
      this.walls.centerRadius, this.walls.wallThickness
    );
    if (puResult.collected) {
      this.collectPowerUp(puResult.collected);
    }

    // Ghost Ship Recording & Playback
    this.score.samplePlayerPosition(this.score.currentTime, this.player.angle);
    const ghostAngle = this.score.getGhostAngle(this.score.currentTime);
    if (ghostAngle !== null) {
      this.player.setGhostVisible(true);
      this.player.updateGhostPosition(ghostAngle);
    } else {
      this.player.setGhostVisible(false);
    }

    if (result.nearMiss) {
      const comboInfo = this.score.addNearMiss();
      this.player.reduceDashCooldown(1.0);
      this.hud.showNearMiss(comboInfo.comboChain);
      this.hud.updateCombo(comboInfo.comboChain, comboInfo.comboMultiplier, comboInfo.isHyperdrive);
      this.audio.playNearMiss(comboInfo.comboChain);
      this.hitStopTimer = 0.018; // 18ms hit-stop punch
      this.fxShockwave(
        result.nearMiss.x, result.nearMiss.y,
        this.palette.getBlended('primary'), 12
      );

      this.flowChain++;
      this.flowChainTimer = 2.5;
      if (this.flowChain >= 3) {
        this.flowChain = 0;
        this.walls.ghostTime = Math.max(this.walls.ghostTime, 1.5);
        this.hud.showRankNotification('FLOW COMBO');
        this.voice.announceFlow();
        this.audio.playRankUp();
      }

      if (comboInfo.isHyperdrive && !this._hyperdriveActive) {
        this._hyperdriveActive = true;
        this.walls.ghostTime = Math.max(this.walls.ghostTime, 2.0);
        this.hud.showRankNotification('HYPERDRIVE');
        this.voice.announceHyperdrive();
        this.audio.playHyperdriveTrigger();
        this.renderer.triggerScreenShake(0.6);
        this.renderer.triggerFovKick(14);
        setTimeout(() => { this._hyperdriveActive = false; }, 2500);
      }
    }

    if (result.collision) {
      // Phase Dash invulnerability: slice safely through hazards
      if (this.player.isInvulnerable) {
        this.walls.crushNearbyWalls(this.player.radius);
        this.renderer.triggerScreenShake(0.25);
        this.audio.playUiClick();
        return;
      }

      // In ZEN mode, bounce instead of dying
      if (this.level.mode === 'ZEN') {
        this.walls.ghostTime = 1.2;
        this.walls.crushNearbyWalls(this.player.radius);
        this.audio.playShieldBreak();
        this.renderer.triggerScreenShake(0.3);
        this.hud.showRankNotification('REBOTE ZEN');
        return;
      }

      if (this.shield) {
        this.shield = false;
        this.player.showShield(false);
        this.walls.ghostTime = 1.0;
        this.walls.crushNearbyWalls(this.player.radius);
        this.audio.playShieldBreak();
        this.renderer.triggerScreenShake(this.reducedMotion ? 0.2 : 0.6);
        this.renderer.triggerFovKick(6);
        this.hud.showRankNotification('ESCUDO ROTO');
      } else {
        this.die();
        return;
      }
    }

    this.prevWorldRotation = this.worldRotation;
    this.worldRotation += this.level.getCurrentWorldRotationDelta(dt);
  }

  gameLoop(currentTime) {
    const frameMs = currentTime - this.lastTime;
    const rawDt = Math.min(0.1, frameMs / 1000);
    this.lastTime = currentTime;

    // Hit-stop micro-freeze on near-misses (18ms crunchy arcade punch)
    if (this.hitStopTimer > 0) {
      this.hitStopTimer -= rawDt;
      requestAnimationFrame((t) => this.gameLoop(t));
      return;
    }

    if (this.dashPulse > 0) {
      this.dashPulse = Math.max(0, this.dashPulse - rawDt * 5.5);
    }

    this.palette.update(rawDt, this.score.currentTime);
    this.applyPaletteTheme();

    if (this.state === 'PLAYING') {
      if (this.calmaTimer > 0) {
        this.calmaTimer -= rawDt;
        this.heartbeatTimer = (this.heartbeatTimer || 0) + rawDt;
        if (this.heartbeatTimer >= 0.85) {
          this.heartbeatTimer = 0;
          this.audio.playHeartbeat();
        }
        if (this.calmaTimer <= 0) {
          this.audio.setFilterCutoff(20000, 0.35);
        }
      }
      const targetTimeScale = this.calmaTimer > 0 ? 0.55 : 1;
      this.timeScale += (targetTimeScale - this.timeScale) * Math.min(1, rawDt * 3.5);

      if (this.flowChainTimer > 0) {
        this.flowChainTimer -= rawDt;
        if (this.flowChainTimer <= 0) this.flowChain = 0;
      }

      this.accumulator += rawDt * this.timeScale;
      let steps = 0;
      while (this.accumulator >= SIM_DT && steps < MAX_STEPS) {
        this.step(SIM_DT);
        this.accumulator -= SIM_DT;
        steps++;
        if (this.state !== 'PLAYING') break;
      }
      if (steps === MAX_STEPS) this.accumulator = 0;

      this.hud.updateTimer(this.score.getFormattedCurrentTime());
      this.hud.updateDash(this.player.dashReady, this.player.dashProgress);
      this.hud.updateCombo(this.score.comboChain, this.score.comboMultiplier, this.score.comboChain >= 5);
    } else if (this.state === 'DYING') {
      this.deathElapsed += rawDt;
      if (this.deathElapsed < 0.09) {
        this.timeScale = 0;
      } else if (this.deathElapsed < 0.95) {
        this.timeScale = 0.12;
      } else {
        this.showGameOver();
      }

      this.prevWorldRotation = this.worldRotation;
      this.worldRotation += this.level.rotationSpeed * rawDt * this.timeScale;
    } else if (this.state === 'MENU' || this.state === 'GAMEOVER') {
      this.prevWorldRotation = this.worldRotation;
      this.worldRotation += rawDt * 0.15;
    }

    if (!this.sync.active) {
      this.audio.updateBpm(this.score.currentTime);
      this.audio.update(rawDt);
    } else {
      const isNewBeat = this.sync.update(rawDt);
      if (isNewBeat && this.state === 'PLAYING') {
        // Quantize incoming beat: if wall timer is close to spawning, trigger now
        if (this.walls.spawnTimer >= this.walls.spawnInterval * 0.70) {
          this.walls.spawnTimer = 0;
          this.walls.spawnNow(this.level.sides);
        }
      }
    }

    const beatPulse = this.sync.active ? this.sync.beatPulse : this.audio.beatPulse;
    if (beatPulse > this.prevBeatPulse) {
      this.renderer.triggerBgFlash(this.palette.getBlended('primary'), 0.025);
    }
    this.prevBeatPulse = beatPulse;

    const particleDt = rawDt * (this.state === 'DYING' ? Math.max(this.timeScale, 0.35) : 1);
    this.particles.update(particleDt, this.level.speed / 4.0);

    // Render pass
    const alpha = this.state === 'PLAYING'
      ? Math.min(1, this.accumulator / SIM_DT)
      : 1;

    this.player.updateMeshPosition(this.lastInputDir, alpha, rawDt);
    this.walls.render(alpha);
    this.powerups.render(alpha, this.walls.centerRadius, this.walls.wallThickness);

    const isTurboActive = (this.keys.turbo || this.touchTurbo) && this.state === 'PLAYING';
    this.audio.setTurboActive(isTurboActive);

    const renderRotation = this.prevWorldRotation + (this.worldRotation - this.prevWorldRotation) * alpha;
    const playerTilt = this.player.tilt || 0;
    this.renderer.render(beatPulse, rawDt, renderRotation, isTurboActive, playerTilt, this.dashPulse);

    requestAnimationFrame((t) => this.gameLoop(t));
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.__game = new Game();
});
