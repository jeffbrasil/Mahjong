/**
 * audio.js — efeitos sintetizados com WebAudio (sem arquivos externos).
 * O contexto só é criado no primeiro gesto do usuário.
 */

const STORAGE_KEY = 'mahjong-pixel-mudo';

export class AudioManager {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    try {
      this.muted = localStorage.getItem(STORAGE_KEY) === '1';
    } catch (_) { /* modo privado */ }
    this.lastError = 0;
  }

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return this.ctx;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.24;
    this.master.connect(this.ctx.destination);
    return this.ctx;
  }

  setMuted(muted) {
    this.muted = Boolean(muted);
    try { localStorage.setItem(STORAGE_KEY, this.muted ? '1' : '0'); } catch (_) {}
    if (this.master) {
      this.master.gain.setTargetAtTime(this.muted ? 0 : 0.24, this.ctx.currentTime, 0.01);
    }
    return this.muted;
  }

  toggleMute() {
    return this.setMuted(!this.muted);
  }

  tone({ freq = 440, endFreq = null, duration = 0.08, type = 'square',
    gain = 0.2, delay = 0, attack = 0.005, decay = duration } = {}) {
    if (this.muted) return;
    const ctx = this.ensure();
    if (!ctx) return;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (endFreq) osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), t0 + duration);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + Math.max(0.02, decay));
    osc.connect(g);
    g.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + duration + 0.03);
  }

  noise({ duration = 0.2, gain = 0.12, delay = 0, lowpass = 900 } = {}) {
    if (this.muted) return;
    const ctx = this.ensure();
    if (!ctx) return;
    const t0 = ctx.currentTime + delay;
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * duration), ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = lowpass;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    src.connect(filter); filter.connect(g); g.connect(this.master);
    src.start(t0);
  }

  click() {
    this.tone({ freq: 350, endFreq: 280, duration: 0.04, gain: 0.08 });
  }

  select() {
    this.tone({ freq: 620, endFreq: 760, duration: 0.055, type: 'square', gain: 0.12 });
  }

  match() {
    this.tone({ freq: 740, duration: 0.07, type: 'triangle', gain: 0.16 });
    this.tone({ freq: 1100, duration: 0.11, type: 'triangle', gain: 0.12, delay: 0.07 });
  }

  error() {
    this.tone({ freq: 170, endFreq: 90, duration: 0.16, type: 'sawtooth', gain: 0.1 });
    this.noise({ duration: 0.09, gain: 0.04, lowpass: 500 });
  }

  lock() {
    this.tone({ freq: 210, endFreq: 160, duration: 0.09, type: 'square', gain: 0.09 });
    this.noise({ duration: 0.05, gain: 0.025, lowpass: 700 });
  }

  shuffleSound() {
    this.noise({ duration: 0.28, gain: 0.1, lowpass: 1600 });
    for (let i = 0; i < 4; i++) {
      this.tone({ freq: 280 + i * 90, duration: 0.045, type: 'square', gain: 0.05, delay: i * 0.035 });
    }
  }

  hint() {
    this.tone({ freq: 880, duration: 0.08, type: 'sine', gain: 0.11 });
    this.tone({ freq: 1320, duration: 0.12, type: 'sine', gain: 0.08, delay: 0.08 });
  }

  win() {
    const notes = [523, 659, 784, 1047, 1319];
    notes.forEach((f, i) => this.tone({
      freq: f, duration: 0.18, type: 'triangle', gain: 0.16, delay: i * 0.11,
    }));
    this.noise({ duration: 0.5, gain: 0.04, lowpass: 5000, delay: 0.4 });
  }

  lose() {
    const notes = [392, 330, 262, 196];
    notes.forEach((f, i) => this.tone({
      freq: f, duration: 0.26, type: 'sawtooth', gain: 0.09, delay: i * 0.16,
    }));
  }

  tick() {
    this.tone({ freq: 1040, duration: 0.03, type: 'square', gain: 0.05 });
  }
}
