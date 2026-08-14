/**
 * AudioEngine
 * Continuous BPM Acceleration Synthesizer & Dynamic Audio Processor for VÉRTICE.
 * Features:
 * - Dynamic sidechain ducking compression on beat kicks
 * - Master multi-mode dynamic filter (low-pass sweep in slow-mo/death, resonant boost in turbo)
 * - 4-bar darksynth progression with arpeggios, driving bass and crisp percussion
 * - Accelerates dynamically with survival time from 145 BPM to 220+ BPM
 */
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.analyser = null;
    this.isMuted = false;
    this.isPlaying = false;
    this.tempo = 145; // Base BPM
    this.currentStep = 0;
    this.nextNoteTime = 0;
    this.timerId = null;

    this.beatPulse = 0;
    this.sidechainAmount = 0;
    
    // Escala menor armónica A (Darksynth Arcade)
    this.scale = [110.00, 130.81, 146.83, 164.81, 174.61, 220.00, 261.63, 293.66, 329.63, 440.00];
    
    // Secuencias de 16 pasos con 4 compases de evolución de acordes (Am - F - C - G)
    this.chords = [
      [110.00, 220.00, 329.63], // Am
      [87.31,  174.61, 261.63], // F
      [130.81, 261.63, 329.63], // C
      [98.00,  196.00, 293.66]  // G
    ];

    this.bassPattern = [1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 1, 0, 1];
    this.kickPattern = [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0];
    this.snarePattern= [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0];
    this.hatPattern  = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1];
    this.arpPattern  = [0, 2, 4, 7, 5, 2, 4, 7, 0, 2, 4, 7, 5, 4, 2, 0];

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

    // Master bus structure: SynthBus -> MasterFilter -> MasterGain -> Analyser -> Destination
    this.synthBusGain = this.ctx.createGain();
    this.synthBusGain.gain.setValueAtTime(1.0, this.ctx.currentTime);

    this.masterFilter = this.ctx.createBiquadFilter();
    this.masterFilter.type = 'lowpass';
    this.masterFilter.frequency.setValueAtTime(20000, this.ctx.currentTime);
    this.masterFilter.Q.setValueAtTime(1.0, this.ctx.currentTime);

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(0.35, this.ctx.currentTime);

    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 64;

    this.synthBusGain.connect(this.masterFilter);
    this.masterFilter.connect(this.masterGain);
    this.masterGain.connect(this.analyser);
    this.analyser.connect(this.ctx.destination);
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
      this.nextNoteTime = this.ctx.currentTime;
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
      this.masterGain.gain.setValueAtTime(muted ? 0 : 0.35, this.ctx.currentTime);
    }
  }

  setTempo(bpm) {
    this.tempo = Math.max(130, Math.min(230, bpm));
  }

  updateBpm(survivalTime = 0) {
    const acceleratedBpm = 145 + survivalTime * 0.9;
    this.setTempo(acceleratedBpm);
  }

  setFilterCutoff(freq, transitionTime = 0.1) {
    if (!this.ctx || !this.masterFilter) return;
    const now = this.ctx.currentTime;
    this.masterFilter.frequency.cancelScheduledValues(now);
    this.masterFilter.frequency.exponentialRampToValueAtTime(
      Math.max(200, Math.min(20000, freq)),
      now + transitionTime
    );
  }

  applySidechainDucking(time) {
    if (!this.synthBusGain || !this.ctx) return;
    // Duck synths by 50% on kick and smoothly recover in 90ms
    this.synthBusGain.gain.cancelScheduledValues(time);
    this.synthBusGain.gain.setValueAtTime(0.48, time);
    this.synthBusGain.gain.exponentialRampToValueAtTime(1.0, time + 0.09);
  }

  scheduler() {
    if (!this.isPlaying || !this.ctx) return;

    while (this.nextNoteTime < this.ctx.currentTime + 0.1) {
      this.scheduleStep(this.currentStep, this.nextNoteTime);
      const secondsPerStep = (60.0 / this.tempo) / 4.0;
      this.nextNoteTime += secondsPerStep;
      this.currentStep = (this.currentStep + 1) % 16;
      if (this.currentStep === 0) {
        this.barIndex = (this.barIndex + 1) % 4;
      }
    }

    this.timerId = setTimeout(() => this.scheduler(), 20);
  }

  scheduleStep(step, time) {
    if (this.isMuted || !this.ctx) return;

    const currentChord = this.chords[this.barIndex];

    if (this.kickPattern[step]) {
      this.playKick(time);
      this.applySidechainDucking(time);
      this.beatPulse = 1.0;
    }

    if (this.snarePattern[step]) {
      this.playSnare(time);
    }

    if (this.hatPattern[step]) {
      this.playHat(time, step % 2 === 1);
    }

    if (this.bassPattern[step]) {
      const rootFreq = currentChord[0] / 2; // Octava baja sub-bass
      this.playBass(rootFreq, time);
    }

    const arpIdx = this.arpPattern[step];
    const arpFreq = currentChord[arpIdx % currentChord.length] * 2; // Arpegio agudo
    this.playArp(arpFreq, time);
  }

  playKick(time) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(160, time);
    osc.frequency.exponentialRampToValueAtTime(38, time + 0.085);

    gain.gain.setValueAtTime(0.95, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.085);

    osc.connect(gain);
    gain.connect(this.masterGain); // Direct to master to bypass sidechain

    osc.start(time);
    osc.stop(time + 0.085);
  }

  playSnare(time) {
    const bufferSize = Math.floor(this.ctx.sampleRate * 0.12);
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) output[i] = Math.random() * 2 - 1;

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(1200, time);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.28, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.12);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    noise.start(time);
    noise.stop(time + 0.12);
  }

  playHat(time, isOpen = false) {
    const dur = isOpen ? 0.055 : 0.025;
    const bufferSize = Math.floor(this.ctx.sampleRate * dur);
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) output[i] = Math.random() * 2 - 1;

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(7500, time);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(isOpen ? 0.16 : 0.09, time);
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
    filter.frequency.setValueAtTime(700, time);
    filter.frequency.exponentialRampToValueAtTime(150, time + 0.09);

    gain.gain.setValueAtTime(0.42, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.09);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.synthBusGain); // Connected to Synth Bus for Sidechain!

    osc.start(time);
    osc.stop(time + 0.09);
  }

  playArp(freq, time) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'square';
    osc.frequency.setValueAtTime(freq, time);

    gain.gain.setValueAtTime(0.11, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.075);

    osc.connect(gain);
    gain.connect(this.synthBusGain); // Connected to Synth Bus for Sidechain!

    osc.start(time);
    osc.stop(time + 0.075);
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
    osc.frequency.setValueAtTime(880, time);
    osc.frequency.exponentialRampToValueAtTime(1850, time + 0.08);

    gain.gain.setValueAtTime(0.38, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.08);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(time);
    osc.stop(time + 0.08);
  }

  playRankUp() {
    this.playRankUpSound();
  }

  playRankUpSound() {
    if (!this.ctx || this.isMuted) return;
    const time = this.ctx.currentTime;
    const notes = [440, 554.37, 659.25, 880, 1108.73];

    notes.forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      const startTime = time + idx * 0.05;
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, startTime);

      gain.gain.setValueAtTime(0.32, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.22);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start(startTime);
      osc.stop(startTime + 0.22);
    });
  }

  playLaneMoveSound(dir = 1) {
    if (!this.ctx || this.isMuted) return;
    const time = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    const baseFreq = dir > 0 ? 550 : 460;
    osc.type = 'sine';
    osc.frequency.setValueAtTime(baseFreq, time);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.35, time + 0.035);

    gain.gain.setValueAtTime(0.19, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.035);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(time);
    osc.stop(time + 0.035);
  }

  playUiClick() {
    if (!this.ctx || this.isMuted) return;
    const time = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(650, time);
    osc.frequency.exponentialRampToValueAtTime(220, time + 0.04);

    gain.gain.setValueAtTime(0.22, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.04);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(time);
    osc.stop(time + 0.04);
  }

  playExplosionSound() {
    if (!this.ctx || this.isMuted) return;
    const time = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(95, time);
    osc.frequency.exponentialRampToValueAtTime(20, time + 0.45);

    gain.gain.setValueAtTime(0.95, time);
    gain.gain.exponentialRampToValueAtTime(0.01, time + 0.45);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(time);
    osc.stop(time + 0.45);

    // Muffled low-pass filter sweep on death
    this.setFilterCutoff(450, 0.4);
  }

  playPowerUp(type) {
    if (!this.ctx || this.isMuted) return;
    const time = this.ctx.currentTime;
    const notes = type === 'ESCUDO' ? [523.25, 784.99, 1046.50] : [659.25, 987.77, 1318.51];

    notes.forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const t = time + idx * 0.06;

      osc.type = 'square';
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.16, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);

      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(t);
      osc.stop(t + 0.14);
    });
  }

  playShieldBreak() {
    if (!this.ctx || this.isMuted) return;
    const time = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(340, time);
    osc.frequency.exponentialRampToValueAtTime(65, time + 0.25);
    gain.gain.setValueAtTime(0.35, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.25);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(2400, time);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    osc.start(time);
    osc.stop(time + 0.25);
  }

  setTurboActive(active) {
    if (!this.ctx || this.isMuted) return;
    if (active && !this._turboActive) {
      this._turboActive = true;
      const time = this.ctx.currentTime;
      
      const subOsc = this.ctx.createOscillator();
      const subGain = this.ctx.createGain();
      subOsc.type = 'sawtooth';
      subOsc.frequency.setValueAtTime(110, time);
      subOsc.frequency.exponentialRampToValueAtTime(620, time + 0.18);
      subGain.gain.setValueAtTime(0.38, time);
      subGain.gain.exponentialRampToValueAtTime(0.001, time + 0.18);
      subOsc.connect(subGain);
      subGain.connect(this.masterGain);
      subOsc.start(time);
      subOsc.stop(time + 0.18);
    } else if (!active) {
      this._turboActive = false;
    }
  }

  update(deltaTime) {
    if (this.beatPulse > 0) {
      this.beatPulse = Math.max(0, this.beatPulse - deltaTime * 6.0);
    }
  }
}
