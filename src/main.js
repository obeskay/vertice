import { Renderer } from './engine/Renderer.js';
import { AudioEngine } from './engine/AudioEngine.js';
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
 * VÉRTICE — game loop de precisión:
 *
 * - SIMULACIÓN A TIMESTEP FIJO (240 Hz): la física es idéntica en cualquier
 *   monitor (60/120/144/240 Hz) y el input se muestrea 240 veces/segundo.
 * - RENDER INTERPOLADO: el frame visual interpola entre el estado anterior
 *   y el actual → movimiento mantecoso sin importar el refresh rate.
 * - HITSTOP + SLOW-MO: al morir, el tiempo se congela 90ms y luego se arrastra
 *   en cámara lenta — la muerte se SIENTE.
 */
const SIM_DT = 1 / 240;
const MAX_STEPS = 40;

class Game {
  constructor() {
    this.state = 'MENU'; // MENU | PLAYING | DYING | GAMEOVER | PAUSED
    this.prevState = 'MENU';

    this.renderer = new Renderer('canvas-container');
    this.audio = new AudioEngine();
    this.sync = new MusicSync(this.audio);
    this.beatQueue = 0;
    this.particles = new ParticleSystem(this.renderer.scene);
    this.palette = new PaletteManager();

    this.player = new Player(this.renderer.scene);
    this.walls = new WallManager(this.renderer.scene);
    this.powerups = new PowerUpManager(this.renderer.scene);
    this.level = new LevelSystem();
    this.score = new ScoreSystem();

    // Power-ups montados en los gaps de los anillos nuevos
    this.walls.onRingSpawned = (ring) => this.powerups.onRingSpawned(ring);

    // Estado de power-ups
    this.shield = false;
    this.calmaTimer = 0;

    this.keys = { left: false, right: false, turbo: false };
    this.touchInputDir = 0;
    this.touchTurbo = false;

    // Pointer steer (mouse): la nave sigue el cursor
    this.mouseActive = false;
    this.lastMouseMove = 0;
    this.mouseScreenAngle = 0;

    // Combo FLOW: rozes encadenados premian la agresividad
    this.flowChain = 0;
    this.flowChainTimer = 0;

    // Estado del input por carriles
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

    this.hud = new HUDManager({
      onStartGame: () => this.startGame(),
      onResumeGame: () => this.resume(),
      onToggleAudio: () => {
        this.audio.init();
        const isMuted = !this.audio.isMuted;
        this.audio.setMuted(isMuted);
        return isMuted;
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
          this.audio.stop(); // la música externa manda
          return 'ON';
        } catch (err) {
          console.warn('MusicSync cancelado:', err.message || err);
          return 'ERROR';
        }
      },
      onTouchInput: (dir, pointerCount = 1) => {
        this.touchInputDir = -dir;
        this.touchTurbo = pointerCount >= 2; // dos dedos = turbo
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

  setupKeyboard() {
    window.addEventListener('keydown', (e) => {
      if (['ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();

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

      if (e.code === 'Escape') {
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

  /** Pointer steer: el mouse apunta, la nave obedece.
   * CLAVE 1: el ángulo se captura en coordenadas de MUNDO en el momento del
   *   movimiento. Si no mueves el mouse, la nave no se arrastra con el mundo.
   * CLAVE 2: el modo mouse SOLO se activa con movimiento real (≥7px desde el
   *   último evento). El jitter del trackpad / palma apoyada jamás engancha.
   * CLAVE 3: cualquier tecla de carril desengancha el mouse por completo. */
  setupPointerSteer() {
    this.mouseActive = false;
    this.lastMouseMove = 0;
    this._mouseAnchor = null;
    window.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      const x = e.clientX, y = e.clientY;
      const now = performance.now();
      if (!this._mouseAnchor) {
        // Sin referencia previa: este evento ES la referencia, no un movimiento
        this._mouseAnchor = { x, y };
        this._lastMoveEventAt = now;
        return;
      }
      // Acumulador de intención: solo cuentan movimientos de ≥5px y decae
      // 50px/s. La palma en el trackpad (1-4px) NUNCA engancha; un swipe real
      // (≥10px por evento) engancha en 1-2 eventos.
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
      this.mouseWorldAngle = screenAngle - this.worldRotation; // fijo en el mundo
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
    this.lastMouseMove = 0; // el click en JUGAR no debe arrastrar la nave
    this.mouseActive = false;
    this._mouseAnchor = null;
    this.walls.reset();
    this.powerups.reset();
    this.fxClearTrail();
    this.shield = false;
    this.calmaTimer = 0;
    this.worldRotation = 0;
    this.prevWorldRotation = 0;
    this.accumulator = 0;
    this.timeScale = 1;
    this.deathElapsed = 0;

    this.audio.start();
    this.hud.updateTimer(this.score.getFormattedCurrentTime());
    this.hud.updateBestScore(this.score.getFormattedBestTime());
    this.hud.updateRank(this.level.ranks[0].name);
    this.renderer.updateCenterPolygon(this.level.sides, this.palette.getBlended('center'));
  }

  pause() {
    this.prevState = this.state;
    this.state = 'PAUSED';
    this.audio.suspend();
    this.hud.showPause(true);
  }

  resume() {
    this.state = this.prevState === 'PAUSED' ? 'PLAYING' : this.prevState;
    this.audio.resume();
    this.hud.showPause(false);
    this.lastTime = performance.now();
  }

  die() {
    this.state = 'DYING';
    document.body.classList.remove('playing');
    this.deathElapsed = 0;
    this.timeScale = 0; // HITSTOP: el mundo se congela un instante

    this.audio.playExplosionSound();
    this.vibrate(60);
    this.score.commit(this.level.ranks[this.level.currentRankIndex].name);

    const pos = this.player.getRenderPosition();
    this.particles.triggerExplosion(pos.x, pos.y, this.palette.getBlended('primary'));
    this.renderer.triggerScreenShake(this.reducedMotion ? 0.3 : 0.9);
    this.renderer.triggerFovKick(10);
    this.player.meshGroup.visible = false;
  }

  showGameOver() {
    this.state = 'GAMEOVER';
    this.timeScale = 1;
    this.hud.showGameOver(
      this.score.getFormattedCurrentTime(),
      this.score.getFormattedBestTime(),
      this.score.isNewRecord,
      this.score.nearMisses,
      this.level.ranks[this.level.currentRankIndex].name
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

  /* ── Adaptadores de ParticleSystem: toleran ambas APIs (núcleo/presentación) ── */
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
      this.hud.showRankNotification('ESCUDO');
    } else if (collected.type === 'CALMA') {
      this.calmaTimer = 3.0;
      this.hud.showRankNotification('CALMA');
    }
  }

  /** El teclado manda: el mouse queda desenganchado hasta un movimiento real */
  _disengageMouse() {
    this.mouseActive = false;
    this.lastMouseMove = 0;
    this._mouseAnchor = null;
    this._jitterAccum = 0;
  }

  /** Un paso de simulación a timestep fijo */
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
      this.renderer.triggerScreenShake(this.reducedMotion ? 0.15 : 0.45);
      this.renderer.triggerFovKick(7);
      this.audio.playRankUp();
      this.vibrate([20, 40, 20]);
      this.fxShockwave(0, 0, this.palette.getBlended('primary'), 14);
    }
    if (levelStatus.sides !== this._lastSides) {
      this._lastSides = levelStatus.sides;
      this.player.setLanes(levelStatus.sides); // los carriles = los lados del nivel
    }

    this.audio.setTempo(140 + levelStatus.speed * 4.5);

    const inputDir = this.getInputDir();
    this.lastInputDir = inputDir;

    // INPUT POR CARRILES: flanco de subida = 1 salto; hold = auto-repeat
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
    this._prevInputDir = inputDir;

    // Pointer steer: activo solo si el mouse se movió hace poco y NO hay teclas.
    // mouseWorldAngle está fijo en el mundo: no hay arrastre por la rotación.
    const keysHeld = this.keys.left || this.keys.right || this.touchInputDir !== 0;
    const mouseFresh = this.mouseActive && (performance.now() - this.lastMouseMove < 1500);
    let pointerAngle = null;
    if (mouseFresh && !keysHeld) {
      pointerAngle = this.mouseWorldAngle;
    }

    const turbo = this.keys.turbo || this.touchTurbo;
    this.player.update(dt, inputDir, turbo, pointerAngle);

    // Spawn cuantizado al beat externo (modo osu!) o por timer normal
    const speedMult = this.sync.active ? this.sync.getSpeedMultiplier() : 1;
    const result = this.walls.update(
      dt, levelStatus.speed * speedMult, levelStatus.sides,
      this.player.getHitbox(), this.sync.active
    );

    if (this.sync.active && this.beatQueue > 0) {
      this.beatQueue--;
      // Cada N beats según la densidad objetivo de muros
      this._beatCounter = (this._beatCounter || 0) + 1;
      const beatsPerSpawn = Math.max(
        1, Math.round(this.walls.spawnInterval / this.sync.currentInterval)
      );
      if (this._beatCounter % beatsPerSpawn === 0) {
        this.walls.spawnNow(levelStatus.sides);
      }
    }

    // Power-ups: colección en el mismo paso de simulación
    const puResult = this.powerups.update(
      dt, this.player.getHitbox(),
      this.walls.centerRadius, this.walls.wallThickness
    );
    if (puResult.collected) {
      this.collectPowerUp(puResult.collected);
    }

    if (result.nearMiss) {
      this.score.addNearMiss();
      this.hud.showNearMiss();
      this.audio.playNearMiss();
      this.fxShockwave(
        result.nearMiss.x, result.nearMiss.y,
        this.palette.getBlended('primary'), 9
      );

      // Combo FLOW: 3 rozes encadenados = 1.5s de invulnerabilidad
      this.flowChain++;
      this.flowChainTimer = 2.5;
      if (this.flowChain >= 3) {
        this.flowChain = 0;
        this.walls.ghostTime = Math.max(this.walls.ghostTime, 1.5);
        this.hud.showRankNotification('FLOW');
        this.audio.playRankUp();
      }
    }

    if (result.collision) {
      if (this.shield) {
        // El escudo absorbe la muerte: ghost + aplasta muros cercanos
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

    this.palette.update(rawDt, this.score.currentTime);
    this.applyPaletteTheme();

    if (this.state === 'PLAYING') {
      // CALMA: cámara lenta suave con easing de entrada/salida
      if (this.calmaTimer > 0) this.calmaTimer -= rawDt;
      const targetTimeScale = this.calmaTimer > 0 ? 0.55 : 1;
      this.timeScale += (targetTimeScale - this.timeScale) * Math.min(1, rawDt * 3.5);

      // Decaimiento del combo FLOW
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
    } else if (this.state === 'DYING') {
      // Timeline de muerte: hitstop → slow-mo → game over
      this.deathElapsed += rawDt;
      if (this.deathElapsed < 0.09) {
        this.timeScale = 0; // congelado
      } else if (this.deathElapsed < 0.95) {
        this.timeScale = 0.12; // cámara lenta dramática
      } else {
        this.showGameOver();
      }

      // El mundo sigue respirando en slow-mo
      this.prevWorldRotation = this.worldRotation;
      this.worldRotation += this.level.rotationSpeed * rawDt * this.timeScale;
    } else if (this.state === 'MENU' || this.state === 'GAMEOVER') {
      // Mundo idle girando lentamente detrás del menú
      this.prevWorldRotation = this.worldRotation;
      this.worldRotation += rawDt * 0.15;
    }

    // Audio en tiempo real con aceleración continua de BPM
    this.audio.updateBpm(this.score.currentTime);
    this.audio.update(rawDt);

    // Música externa: beat tracking por frame (alimenta beatQueue para el sim)
    if (this.sync.active) {
      if (this.sync.update(rawDt)) this.beatQueue++;
      if (this.sync.bpm > 0) this.hud.updateBpm(Math.round(this.sync.bpm));
    }

    // Pulso del beat (fuente: música externa si está activa, si no el sintetizador)
    const beatPulse = this.sync.active ? this.sync.beatPulse : this.audio.beatPulse;
    if (beatPulse > this.prevBeatPulse) {
      this.renderer.triggerBgFlash(this.palette.getBlended('primary'), 0.02);
    }
    this.prevBeatPulse = beatPulse;

    // Partículas con tiempo escalado (slow-mo las arrastra = dramático)
    const particleDt = rawDt * (this.state === 'DYING' ? Math.max(this.timeScale, 0.35) : 1);
    this.particles.update(particleDt, this.level.speed / 4.0);

    // ── Render interpolado ──
    const alpha = this.state === 'PLAYING'
      ? Math.min(1, this.accumulator / SIM_DT)
      : 1;

    this.player.updateMeshPosition(this.lastInputDir, alpha, rawDt);
    this.walls.render(alpha);
    this.powerups.render(alpha, this.walls.centerRadius, this.walls.wallThickness);

    // Trail del jugador cuando se mueve
    if (this.state === 'PLAYING' && this.lastInputDir !== 0) {
      const pos = this.player.getRenderPosition();
      this.fxTrail(pos.x, pos.y);
    }

    const renderRotation = this.prevWorldRotation + (this.worldRotation - this.prevWorldRotation) * alpha;
    this.renderer.render(beatPulse, rawDt, renderRotation, frameMs);

    requestAnimationFrame((t) => this.gameLoop(t));
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.__game = new Game(); // handle de depuración (consola)
});
