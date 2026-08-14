/**
 * MusicSync
 * Real-time audio synchronization with external tabs (YouTube, Spotify, etc.) via getDisplayMedia.
 * Features:
 * - High-sensitivity sub-bass transient kick detection (40-190 Hz)
 * - Adaptive moving-average threshold with dynamic gain tracking
 * - Smooth BPM estimation with median filtering
 * - Feeds beat pulses to renderer, camera, and quantized wall spawning
 */
export class MusicSync {
  constructor(audioEngine) {
    this.audio = audioEngine;
    this.active = false;
    this.stream = null;
    this.source = null;
    this.analyser = null;
    this.freqData = null;

    this.bpm = 0;
    this.beatPulse = 0;
    this.level = 0;
    this.lastBeatTime = 0;
    this.intervals = [];
    this.energyAvg = 0;
    this.beatCount = 0;
    this.currentInterval = 0.45;
  }

  async start() {
    if (this.active) return true;

    try {
      this.stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
      });
    } catch (err) {
      throw new Error('Selección cancelada o no permitida.');
    }

    // Stop video track immediately since only audio is needed
    this.stream.getVideoTracks().forEach(t => t.stop());

    const audioTracks = this.stream.getAudioTracks();
    if (audioTracks.length === 0) {
      this.stream.getTracks().forEach(t => t.stop());
      throw new Error('No se compartió audio. Asegúrate de marcar "Compartir audio de la pestaña".');
    }
    audioTracks[0].addEventListener('ended', () => this.stop());

    this.audio.init();
    if (this.audio.ctx.state === 'suspended') await this.audio.ctx.resume();

    // Silence internal background music when syncing with external audio
    this.audio.setMusicDisabled(true);

    const ctx = this.audio.ctx;
    this.source = ctx.createMediaStreamSource(this.stream);

    this.lowFilter = ctx.createBiquadFilter();
    this.lowFilter.type = 'lowpass';
    this.lowFilter.frequency.value = 190;

    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0.35;

    this.source.connect(this.lowFilter);
    this.lowFilter.connect(this.analyser);

    this.freqData = new Uint8Array(this.analyser.frequencyBinCount);

    this.active = true;
    this.bpm = 0;
    this.intervals = [];
    this.energyAvg = 0;
    this.beatCount = 0;
    this.lastBeatTime = performance.now() / 1000;
    return true;
  }

  stop() {
    this.active = false;
    if (this.stream) {
      this.stream.getTracks().forEach(t => t.stop());
      this.stream = null;
    }
    if (this.source) {
      try { this.source.disconnect(); } catch (e) {}
      this.source = null;
    }
    this.bpm = 0;
    this.beatPulse = 0;

    // Re-enable internal procedural music
    if (this.audio) {
      this.audio.setMusicDisabled(false);
    }
  }

  _kickEnergy() {
    if (!this.analyser || !this.freqData) return 0;
    this.analyser.getByteFrequencyData(this.freqData);
    let e = 0;
    const binHz = (this.audio.ctx.sampleRate / this.analyser.fftSize);
    const lo = Math.max(1, Math.floor(35 / binHz));
    const hi = Math.min(this.freqData.length - 1, Math.ceil(190 / binHz));
    for (let i = lo; i <= hi; i++) e += this.freqData[i];
    return (e / (hi - lo + 1)) / 255;
  }

  update(deltaTime) {
    if (!this.active || !this.analyser) return false;

    const e = this._kickEnergy();
    this.level = e;
    this.energyAvg += (e - this.energyAvg) * Math.min(1, deltaTime * 3.5);

    const now = performance.now() / 1000;
    const refractory = this.bpm > 0 ? Math.max(0.18, (60 / this.bpm) * 0.5) : 0.22;
    let newBeat = false;

    if (e > this.energyAvg * 1.25 && e > 0.12 && (now - this.lastBeatTime) > refractory) {
      const interval = now - this.lastBeatTime;
      this.lastBeatTime = now;
      this.beatPulse = 1.0;
      this.beatCount++;
      newBeat = true;

      if (interval > 0.22 && interval < 1.4) {
        this.intervals.push(interval);
        if (this.intervals.length > 10) this.intervals.shift();
        const sorted = [...this.intervals].sort((a, b) => a - b);
        const median = sorted[Math.floor(sorted.length / 2)];
        this.currentInterval = median;
        const rawBpm = 60 / median;
        const clamped = Math.max(60, Math.min(220, rawBpm));
        this.bpm = this.bpm === 0 ? clamped : this.bpm + (clamped - this.bpm) * 0.20;
      }
    }

    if (this.beatPulse > 0) {
      this.beatPulse = Math.max(0, this.beatPulse - deltaTime * 5.0);
    }
    return newBeat;
  }

  getSpeedMultiplier() {
    if (!this.active || this.bpm === 0) return 1;
    return Math.max(0.9, Math.min(1.25, this.bpm / 145));
  }
}
