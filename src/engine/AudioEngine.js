/**
 * AudioEngine
 * Continuous BPM Acceleration Synthesizer for VÉRTICE.
 * Tempo accelerates dynamically from 145 BPM up to 215+ BPM as survival time increases.
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
  }

  init() {
    if (this.ctx) return;
    
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AudioCtx();

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(0.32, this.ctx.currentTime);

    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 64;

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
    if (this.masterGain) {
      this.masterGain.gain.setValueAtTime(muted ? 0 : 0.32, this.ctx.currentTime);
    }
  }

  setTempo(bpm) {
    this.tempo = Math.max(130, Math.min(220, bpm));
  }

  updateBpm(survivalTime = 0) {
    const acceleratedBpm = 145 + survivalTime * 0.85;
    this.setTempo(acceleratedBpm);
  }

  scheduler() {
    if (!this.isPlaying) return;

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
    if (this.isMuted) return;

    const currentChord = this.chords[this.barIndex];

    if (this.kickPattern[step]) {
      this.playKick(time);
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
    osc.frequency.setValueAtTime(150, time);
    osc.frequency.exponentialRampToValueAtTime(35, time + 0.08);

    gain.gain.setValueAtTime(0.85, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.08);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(time);
    osc.stop(time + 0.08);
  }

  playSnare(time) {
    const bufferSize = this.ctx.sampleRate * 0.12;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) output[i] = Math.random() * 2 - 1;

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(1200, time);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.25, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.12);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    noise.start(time);
    noise.stop(time + 0.12);
  }

  playHat(time, isOpen = false) {
    const dur = isOpen ? 0.05 : 0.02;
    const bufferSize = this.ctx.sampleRate * dur;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) output[i] = Math.random() * 2 - 1;

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(7500, time);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(isOpen ? 0.14 : 0.08, time);
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
    filter.frequency.setValueAtTime(650, time);
    filter.frequency.exponentialRampToValueAtTime(140, time + 0.09);

    gain.gain.setValueAtTime(0.38, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.09);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    osc.start(time);
    osc.stop(time + 0.09);
  }

  playArp(freq, time) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'square';
    osc.frequency.setValueAtTime(freq, time);

    gain.gain.setValueAtTime(0.08, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.07);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(time);
    osc.stop(time + 0.07);
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
    osc.frequency.exponentialRampToValueAtTime(1760, time + 0.08);

    gain.gain.setValueAtTime(0.35, time);
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
    const notes = [440, 554.37, 659.25, 880];

    notes.forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      const startTime = time + idx * 0.06;
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, startTime);

      gain.gain.setValueAtTime(0.3, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.2);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start(startTime);
      osc.stop(startTime + 0.2);
    });
  }

  playLaneMoveSound(dir = 1) {
    if (!this.ctx || this.isMuted) return;
    const time = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    const baseFreq = dir > 0 ? 520 : 440;
    osc.type = 'sine';
    osc.frequency.setValueAtTime(baseFreq, time);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.3, time + 0.035);

    gain.gain.setValueAtTime(0.18, time);
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
    osc.frequency.setValueAtTime(600, time);
    osc.frequency.exponentialRampToValueAtTime(200, time + 0.04);

    gain.gain.setValueAtTime(0.2, time);
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
    osc.frequency.setValueAtTime(90, time);
    osc.frequency.exponentialRampToValueAtTime(20, time + 0.4);

    gain.gain.setValueAtTime(0.9, time);
    gain.gain.exponentialRampToValueAtTime(0.01, time + 0.4);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(time);
    osc.stop(time + 0.4);
  }

  /** Power-up recogido: arpegio chico ascendente */
  playPowerUp(type) {
    if (!this.ctx || this.isMuted) return;
    const time = this.ctx.currentTime;
    const notes = type === 'ESCUDO' ? [523.25, 784.99] : [659.25, 987.77];

    notes.forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const t = time + idx * 0.07;

      osc.type = 'square';
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.14, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);

      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(t);
      osc.stop(t + 0.14);
    });
  }

  /** Escudo roto: golpe metálico + caída */
  playShieldBreak() {
    if (!this.ctx || this.isMuted) return;
    const time = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(320, time);
    osc.frequency.exponentialRampToValueAtTime(70, time + 0.22);
    gain.gain.setValueAtTime(0.3, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.22);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(2400, time);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    osc.start(time);
    osc.stop(time + 0.22);
  }

  update(deltaTime) {
    if (this.beatPulse > 0) {
      this.beatPulse = Math.max(0, this.beatPulse - deltaTime * 6.0);
    }
  }
}
