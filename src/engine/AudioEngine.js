/**
 * AudioEngine — High-Fidelity Chiptune & Darksynth Procedural Engine
 * Generates an electrifying, evolving arcade soundtrack in real-time with Web Audio API.
 * Features:
 * - 4 Dynamic musical layers (Sub-Bass, Chiptune Arps, Punchy Percussion, Lead Melody)
 * - Layered progression: soundtrack builds organically as survival time increases
 * - Mode-specific harmonic progressions (Normal: Am, Hiper: F#m, Extremo: Dm, Zen: Cmaj)
 * - Precise beat phase tracking & sidechain ducking
 * - Punchy, rewarding arcade sound effects
 */
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.analyser = null;
    this.isMuted = false;
    this.isPlaying = false;
    this.mode = 'NORMAL';

    this.tempo = 148; // Base BPM
    this.currentStep = 0;
    this.nextNoteTime = 0;
    this.timerId = null;

    this.beatPulse = 0;
    this.barBeatPulse = 0;
    this.survivalTime = 0;

    // Mode-specific harmonic configurations
    this.modeThemes = {
      NORMAL: {
        baseTempo: 148,
        scale: [110.00, 130.81, 146.83, 164.81, 174.61, 220.00, 261.63, 293.66, 329.63, 440.00, 523.25, 659.25],
        chords: [
          [110.00, 220.00, 261.63, 329.63], // Am
          [87.31,  174.61, 261.63, 349.23], // F
          [130.81, 261.63, 329.63, 392.00], // C
          [98.00,  196.00, 293.66, 392.00]  // G
        ],
        bassNotes: [55.0, 43.65, 65.41, 49.0],
        leadNotes: [440, 523.25, 659.25, 587.33, 523.25, 440, 392, 440]
      },
      HIPER: {
        baseTempo: 162,
        scale: [147.99, 174.61, 196.00, 220.00, 246.94, 295.99, 369.99, 440.00, 493.88, 587.33, 739.99],
        chords: [
          [147.99, 295.99, 369.99, 440.00], // F#m
          [116.54, 233.08, 293.66, 369.99], // D
          [110.00, 220.00, 277.18, 329.63], // A
          [164.81, 329.63, 392.00, 493.88]  // E
        ],
        bassNotes: [73.99, 58.27, 55.0, 82.41],
        leadNotes: [587.33, 739.99, 880.0, 739.99, 587.33, 493.88, 440.0, 493.88]
      },
      EXTREMO: {
        baseTempo: 176,
        scale: [146.83, 174.61, 196.00, 220.00, 233.08, 293.66, 349.23, 392.00, 440.00, 587.33, 698.46],
        chords: [
          [146.83, 293.66, 349.23, 440.00], // Dm
          [116.54, 233.08, 293.66, 349.23], // Bb
          [87.31,  174.61, 261.63, 349.23], // F
          [130.81, 261.63, 329.63, 392.00]  // C
        ],
        bassNotes: [73.42, 58.27, 43.65, 65.41],
        leadNotes: [587.33, 698.46, 880.0, 783.99, 698.46, 587.33, 523.25, 587.33]
      },
      ZEN: {
        baseTempo: 120,
        scale: [130.81, 146.83, 164.81, 196.00, 220.00, 261.63, 293.66, 329.63, 392.00, 523.25],
        chords: [
          [130.81, 261.63, 329.63, 392.00], // Cmaj7
          [110.00, 220.00, 261.63, 329.63], // Am7
          [87.31,  174.61, 220.00, 261.63], // Fmaj7
          [98.00,  196.00, 246.94, 293.66]  // G6
        ],
        bassNotes: [65.41, 55.0, 43.65, 49.0],
        leadNotes: [392.0, 440.0, 523.25, 659.25, 523.25, 440.0, 392.0, 329.63]
      }
    };

    // Rhythmic 16-step patterns
    this.kickPattern   = [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0];
    this.snarePattern  = [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0];
    this.hatPattern    = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1];
    this.bassPattern   = [1, 0, 1, 0, 1, 0, 1, 1, 1, 0, 1, 0, 1, 1, 0, 1];
    this.arpPattern    = [0, 2, 1, 3, 2, 0, 3, 1, 2, 3, 1, 2, 0, 1, 2, 3];
    this.leadPattern   = [1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 0, 0];

    this.barIndex = 0;
    this.masterGain = null;
    this.synthBusGain = null;
    this.masterFilter = null;
    this._turboActive = false;
  }

  init() {
    if (this.ctx) return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AudioCtx();

    // Master Audio Chain: SynthBus -> MasterFilter -> MasterGain -> Analyser -> Destination
    this.synthBusGain = this.ctx.createGain();
    this.synthBusGain.gain.setValueAtTime(1.0, this.ctx.currentTime);

    this.masterFilter = this.ctx.createBiquadFilter();
    this.masterFilter.type = 'lowpass';
    this.masterFilter.frequency.setValueAtTime(20000, this.ctx.currentTime);
    this.masterFilter.Q.setValueAtTime(1.0, this.ctx.currentTime);

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(0.38, this.ctx.currentTime);

    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 64;

    this.synthBusGain.connect(this.masterFilter);
    this.masterFilter.connect(this.masterGain);
    this.masterGain.connect(this.analyser);
    this.analyser.connect(this.ctx.destination);
  }

  setMode(mode) {
    this.mode = this.modeThemes[mode] ? mode : 'NORMAL';
    this.tempo = this.modeThemes[this.mode].baseTempo;
  }

  start() {
    this.init();
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    if (!this.isPlaying) {
      this.isPlaying = true;
      this.currentStep = 0;
      this.barIndex = 0;
      this.survivalTime = 0;
      this.nextNoteTime = this.ctx.currentTime + 0.05;
      this.setFilterCutoff(20000, 0.1);
      this.scheduler();
    }
  }

  stop() {
    this.isPlaying = false;
    if (this.timerId) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
  }

  suspend() {
    if (this.ctx && this.ctx.state === 'running') {
      this.ctx.suspend();
    }
    this.stop();
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    this.start();
  }

  setMuted(muted) {
    this.isMuted = muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(muted ? 0 : 0.38, this.ctx.currentTime);
    }
  }

  setTempo(bpm) {
    this.tempo = Math.max(100, Math.min(240, bpm));
  }

  updateBpm(survivalTime = 0) {
    this.survivalTime = survivalTime;
    const base = this.modeThemes[this.mode]?.baseTempo || 148;
    const accelRate = this.mode === 'EXTREMO' ? 1.2 : (this.mode === 'ZEN' ? 0.2 : 0.85);
    const acceleratedBpm = base + survivalTime * accelRate;
    this.setTempo(acceleratedBpm);
  }

  setFilterCutoff(freq, transitionTime = 0.1) {
    if (!this.ctx || !this.masterFilter) return;
    const now = this.ctx.currentTime;
    this.masterFilter.frequency.cancelScheduledValues(now);
    this.masterFilter.frequency.exponentialRampToValueAtTime(
      Math.max(150, Math.min(20000, freq)),
      now + transitionTime
    );
  }

  applySidechainDucking(time) {
    if (!this.synthBusGain || !this.ctx) return;
    this.synthBusGain.gain.cancelScheduledValues(time);
    this.synthBusGain.gain.setValueAtTime(0.42, time);
    this.synthBusGain.gain.exponentialRampToValueAtTime(1.0, time + 0.08);
  }

  scheduler() {
    if (!this.isPlaying || !this.ctx) return;

    while (this.nextNoteTime < this.ctx.currentTime + 0.12) {
      this.scheduleStep(this.currentStep, this.nextNoteTime);
      const secondsPerStep = (60.0 / this.tempo) / 4.0;
      this.nextNoteTime += secondsPerStep;
      this.currentStep = (this.currentStep + 1) % 16;
      if (this.currentStep === 0) {
        this.barIndex = (this.barIndex + 1) % 4;
        this.barBeatPulse = 1.0;
      }
    }

    this.timerId = setTimeout(() => this.scheduler(), 22);
  }

  scheduleStep(step, time) {
    if (this.isMuted || !this.ctx) return;

    const theme = this.modeThemes[this.mode] || this.modeThemes.NORMAL;
    const currentChord = theme.chords[this.barIndex % theme.chords.length];
    const rootBass = theme.bassNotes[this.barIndex % theme.bassNotes.length];
    const t = this.survivalTime;

    // 1. Kick Drum (All stages, punchy 808/909 punch)
    if (this.kickPattern[step]) {
      this.playKick(time);
      this.applySidechainDucking(time);
      this.beatPulse = 1.0;
    }

    // 2. Snare & Claps (Drops in after 8 seconds of survival, or immediately in EXTREMO)
    if ((t >= 8 || this.mode === 'EXTREMO') && this.snarePattern[step]) {
      this.playSnare(time);
    }

    // 3. Hi-Hats (Drops in after 4 seconds)
    if ((t >= 4 || this.mode === 'EXTREMO') && this.hatPattern[step]) {
      const isAccent = step % 4 === 2;
      const isOpen = step % 8 === 6;
      this.playHat(time, isOpen, isAccent);
    }

    // 4. Driving Sub-Bass
    if (this.bassPattern[step]) {
      const freq = step % 8 === 6 ? rootBass * 1.5 : (step % 4 === 2 ? rootBass * 1.25 : rootBass);
      this.playBass(freq, time);
    }

    // 5. Chiptune Arpeggiator
    const arpIdx = this.arpPattern[step];
    const arpFreq = currentChord[arpIdx % currentChord.length] * 2;
    this.playArp(arpFreq, time, step);

    // 6. Searing Lead Melody (Layers in at 20s+ survival for intense adrenaline)
    if ((t >= 20 || this.mode === 'EXTREMO') && this.leadPattern[step]) {
      const leadIdx = (this.barIndex * 4 + Math.floor(step / 4)) % theme.leadNotes.length;
      const leadFreq = theme.leadNotes[leadIdx];
      this.playLead(leadFreq, time);
    }
  }

  playKick(time) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(180, time);
    osc.frequency.exponentialRampToValueAtTime(36, time + 0.08);

    gain.gain.setValueAtTime(1.0, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.08);

    // Transient click for crisp arcade punch
    const clickOsc = this.ctx.createOscillator();
    const clickGain = this.ctx.createGain();
    clickOsc.type = 'triangle';
    clickOsc.frequency.setValueAtTime(650, time);
    clickOsc.frequency.exponentialRampToValueAtTime(80, time + 0.015);
    clickGain.gain.setValueAtTime(0.4, time);
    clickGain.gain.exponentialRampToValueAtTime(0.001, time + 0.015);

    osc.connect(gain);
    clickOsc.connect(clickGain);
    gain.connect(this.masterGain);
    clickGain.connect(this.masterGain);

    osc.start(time);
    clickOsc.start(time);
    osc.stop(time + 0.085);
    clickOsc.stop(time + 0.02);
  }

  playSnare(time) {
    const bufferSize = Math.floor(this.ctx.sampleRate * 0.14);
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) output[i] = Math.random() * 2 - 1;

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(1400, time);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.32, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.13);

    // Body tone
    const toneOsc = this.ctx.createOscillator();
    const toneGain = this.ctx.createGain();
    toneOsc.type = 'triangle';
    toneOsc.frequency.setValueAtTime(220, time);
    toneOsc.frequency.exponentialRampToValueAtTime(90, time + 0.06);
    toneGain.gain.setValueAtTime(0.25, time);
    toneGain.gain.exponentialRampToValueAtTime(0.001, time + 0.06);

    noise.connect(filter);
    filter.connect(gain);
    toneOsc.connect(toneGain);
    gain.connect(this.masterGain);
    toneGain.connect(this.masterGain);

    noise.start(time);
    toneOsc.start(time);
    noise.stop(time + 0.14);
    toneOsc.stop(time + 0.07);
  }

  playHat(time, isOpen = false, isAccent = false) {
    const dur = isOpen ? 0.065 : 0.028;
    const bufferSize = Math.floor(this.ctx.sampleRate * dur);
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) output[i] = Math.random() * 2 - 1;

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(isOpen ? 6500 : 8500, time);

    const gain = this.ctx.createGain();
    const volume = isOpen ? 0.20 : (isAccent ? 0.14 : 0.08);
    gain.gain.setValueAtTime(volume, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + dur);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    noise.start(time);
    noise.stop(time + dur);
  }

  playBass(freq, time) {
    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq, time);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(800, time);
    filter.frequency.exponentialRampToValueAtTime(180, time + 0.095);

    gain.gain.setValueAtTime(0.48, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.095);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.synthBusGain);

    osc.start(time);
    osc.stop(time + 0.095);
  }

  playArp(freq, time, step) {
    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    osc.type = 'square';
    osc.frequency.setValueAtTime(freq, time);

    filter.type = 'bandpass';
    const cutoff = 1200 + Math.sin(step * 0.4) * 800;
    filter.frequency.setValueAtTime(cutoff, time);
    filter.Q.setValueAtTime(2.5, time);

    gain.gain.setValueAtTime(0.12, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.07);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.synthBusGain);

    osc.start(time);
    osc.stop(time + 0.07);
  }

  playLead(freq, time) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, time);
    osc.frequency.exponentialRampToValueAtTime(freq * 1.01, time + 0.12);

    gain.gain.setValueAtTime(0.18, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.12);

    osc.connect(gain);
    gain.connect(this.synthBusGain);

    osc.start(time);
    osc.stop(time + 0.12);
  }

  playNearMiss() {
    this.playNearMissSound();
  }

  playNearMissSound() {
    if (!this.ctx || this.isMuted) return;
    const time = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(950, time);
    osc.frequency.exponentialRampToValueAtTime(2100, time + 0.07);

    gain.gain.setValueAtTime(0.42, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.07);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(time);
    osc.stop(time + 0.075);
  }

  playRankUp() {
    this.playRankUpSound();
  }

  playRankUpSound() {
    if (!this.ctx || this.isMuted) return;
    const time = this.ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.50, 1318.51];

    notes.forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const startTime = time + idx * 0.045;

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, startTime);

      gain.gain.setValueAtTime(0.35, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.25);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start(startTime);
      osc.stop(startTime + 0.25);
    });
  }

  playLaneMoveSound(dir = 1) {
    if (!this.ctx || this.isMuted) return;
    const time = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    const baseFreq = dir > 0 ? 580 : 480;
    osc.type = 'sine';
    osc.frequency.setValueAtTime(baseFreq, time);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.3, time + 0.03);

    gain.gain.setValueAtTime(0.18, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.03);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(time);
    osc.stop(time + 0.03);
  }

  playUiClick() {
    if (!this.ctx || this.isMuted) return;
    const time = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(700, time);
    osc.frequency.exponentialRampToValueAtTime(250, time + 0.035);

    gain.gain.setValueAtTime(0.24, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.035);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(time);
    osc.stop(time + 0.035);
  }

  playExplosionSound() {
    if (!this.ctx || this.isMuted) return;
    const time = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(110, time);
    osc.frequency.exponentialRampToValueAtTime(18, time + 0.5);

    gain.gain.setValueAtTime(1.0, time);
    gain.gain.exponentialRampToValueAtTime(0.01, time + 0.5);

    // Noise burst for debris
    const bufferSize = Math.floor(this.ctx.sampleRate * 0.4);
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) output[i] = Math.random() * 2 - 1;

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(800, time);
    filter.frequency.exponentialRampToValueAtTime(100, time + 0.4);

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.5, time);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, time + 0.4);

    osc.connect(gain);
    gain.connect(this.masterGain);
    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(this.masterGain);

    osc.start(time);
    noise.start(time);
    osc.stop(time + 0.5);
    noise.stop(time + 0.4);

    // Filter sweep on death
    this.setFilterCutoff(400, 0.35);
  }

  playPowerUp(type) {
    if (!this.ctx || this.isMuted) return;
    const time = this.ctx.currentTime;
    const notes = type === 'ESCUDO' ? [523.25, 784.99, 1046.50] : [659.25, 987.77, 1318.51];

    notes.forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const t = time + idx * 0.05;

      osc.type = 'square';
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.18, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);

      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(t);
      osc.stop(t + 0.12);
    });
  }

  playShieldBreak() {
    if (!this.ctx || this.isMuted) return;
    const time = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(360, time);
    osc.frequency.exponentialRampToValueAtTime(60, time + 0.22);
    gain.gain.setValueAtTime(0.38, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.22);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(time);
    osc.stop(time + 0.22);
  }

  setTurboActive(active) {
    if (!this.ctx || this.isMuted) return;
    if (active && !this._turboActive) {
      this._turboActive = true;
      const time = this.ctx.currentTime;

      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(120, time);
      osc.frequency.exponentialRampToValueAtTime(680, time + 0.15);
      gain.gain.setValueAtTime(0.35, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.15);

      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(time);
      osc.stop(time + 0.15);
    } else if (!active) {
      this._turboActive = false;
    }
  }

  update(deltaTime) {
    if (this.beatPulse > 0) {
      this.beatPulse = Math.max(0, this.beatPulse - deltaTime * 6.5);
    }
    if (this.barBeatPulse > 0) {
      this.barBeatPulse = Math.max(0, this.barBeatPulse - deltaTime * 4.0);
    }
  }
}
