/**
 * VoiceEngine — Iconic Arcade Voice & Robotic Vocoder Synthesizer for VÉRTICE.
 * Combines Web Speech API (with high arcade pitch and rate) and real-time Web Audio
 * FM robotic vocoder chimes for guaranteed 0ms response time and authentic retro energy.
 */
export class VoiceEngine {
  constructor(audioEngine) {
    this.audio = audioEngine;
    this.enabled = true;
    this.synth = typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;
    this.selectedVoice = null;
    this.speechAvailable = false;

    if (this.synth) {
      this.initVoices();
      if (typeof window !== 'undefined' && window.speechSynthesis.onvoiceschanged !== undefined) {
        window.speechSynthesis.onvoiceschanged = () => this.initVoices();
      }
    }
  }

  initVoices() {
    if (!this.synth) return;
    try {
      const voices = this.synth.getVoices();
      if (voices && voices.length > 0) {
        this.speechAvailable = true;
        // Prefer clear female / neutral robotic arcade voice in ES/EN
        this.selectedVoice = voices.find(v => 
          (v.lang.startsWith('es') || v.lang.startsWith('en')) && 
          (v.name.includes('Google') || v.name.includes('Natural') || v.name.includes('Samantha') || v.name.includes('Paulina') || v.name.includes('Siri'))
        ) || voices[0];
      }
    } catch (e) {
      this.speechAvailable = false;
    }
  }

  setEnabled(enabled) {
    this.enabled = enabled;
  }

  speak(text, priority = false) {
    if (!this.enabled) return;

    // 1. Instant 0ms Arcade Vocoder Stinger in Web Audio
    this.playVocoderChime(text);

    // 2. Speech synthesis utterance if available
    if (this.synth && this.speechAvailable) {
      try {
        if (priority) {
          this.synth.cancel();
        }
        const utterance = new SpeechSynthesisUtterance(text);
        if (this.selectedVoice) utterance.voice = this.selectedVoice;
        utterance.pitch = 1.38; // High iconic arcade pitch
        utterance.rate = 1.28;  // Fast arcade cadence
        utterance.volume = this.audio && this.audio.isMuted ? 0 : 0.85;
        this.synth.speak(utterance);
      } catch (e) {}
    }
  }

  playVocoderChime(phrase = '') {
    if (!this.audio || this.audio.isMuted || !this.audio.ctx) return;
    const ctx = this.audio.ctx;
    const time = ctx.currentTime;

    // Robotic FM vocoder triad
    const freqs = [440, 554.37, 659.25, 880];
    freqs.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sawtooth';
      const t = time + idx * 0.025;
      osc.frequency.setValueAtTime(freq * 0.85, t);
      osc.frequency.exponentialRampToValueAtTime(freq * 1.25, t + 0.07);

      gain.gain.setValueAtTime(0.16, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.07);

      osc.connect(gain);
      gain.connect(this.audio.masterGain || ctx.destination);

      osc.start(t);
      osc.stop(t + 0.075);
    });
  }

  announceStart() {
    this.speak('VÉRTICE... START!', true);
  }

  announceRank(rankName) {
    this.speak(rankName.toUpperCase(), false);
  }

  announceGameOver() {
    this.speak('GAME OVER', true);
  }

  announceNewRecord() {
    this.speak('NEW RECORD!', true);
  }

  announceShield() {
    this.speak('ESCUDO', false);
  }

  announceSlowMo() {
    this.speak('CALMA', false);
  }

  announceFlow() {
    this.speak('FLOW COMBO!', false);
  }
}
