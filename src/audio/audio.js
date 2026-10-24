// 程序化音频：生成式环境音乐（长音铺底 + FM 钟声）与全部音效，均以 WebAudio 实时合成
const SCALES = {
  lydian: [0, 2, 4, 6, 7, 9, 11],
  major: [0, 2, 4, 5, 7, 9, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  pent: [0, 2, 4, 7, 9],
  minorPent: [0, 3, 5, 7, 10],
  mixo: [0, 2, 4, 5, 7, 9, 10],
  aeolian: [0, 2, 3, 5, 7, 8, 10],
};
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
// 每种重力颜色对应的音高偏移
const GRAV_PITCH = [7, 5, 12, 0, 9, 4];

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.vol = { master: 0.8, music: 0.55, sfx: 0.8 };
    this.mood = { root: 60, scale: 'lydian', tempo: 1 };
    this.started = false;
    this.nextBell = 0;
    this.nextChord = 0;
    this.chordIdx = 0;
    this.padVoices = [];
  }

  init() {
    if (this.ctx) { this.ctx.resume?.(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 18; comp.ratio.value = 3.5;
    this.master.connect(comp).connect(ctx.destination);
    this.musicBus = ctx.createGain();
    this.sfxBus = ctx.createGain();
    this.musicBus.connect(this.master);
    this.sfxBus.connect(this.master);
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.makeIR(4.2, 2.6);
    this.revSend = ctx.createGain();
    this.revSend.gain.value = 1;
    this.revSend.connect(this.reverb);
    const revOut = ctx.createGain();
    revOut.gain.value = 0.55;
    this.reverb.connect(revOut).connect(this.master);
    this.noiseBuf = this.makeNoise(2);
    this.brownBuf = this.makeBrown(4);
    // 循环噪声：水声与风声
    this.waterGain = ctx.createGain(); this.waterGain.gain.value = 0;
    this.windGain = ctx.createGain(); this.windGain.gain.value = 0;
    this.loopNoise(this.brownBuf, 'bandpass', 900, 0.6, this.waterGain);
    this.loopNoise(this.noiseBuf, 'bandpass', 500, 0.8, this.windGain);
    this.waterGain.connect(this.sfxBus);
    this.windGain.connect(this.sfxBus);
    // 低频持续音
    this.drone = ctx.createOscillator();
    this.drone.type = 'sine';
    this.droneGain = ctx.createGain();
    this.droneGain.gain.value = 0.0;
    const dl = ctx.createBiquadFilter(); dl.type = 'lowpass'; dl.frequency.value = 300;
    this.drone.connect(dl).connect(this.droneGain).connect(this.musicBus);
    this.drone.start();
    this.applyVolume();
    this.started = true;
    this.nextBell = ctx.currentTime + 2;
    this.nextChord = ctx.currentTime + 0.5;
  }

  makeIR(sec, decay) {
    const ctx = this.ctx, len = Math.floor(ctx.sampleRate * sec);
    const b = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay) * (i < 200 ? i / 200 : 1);
      }
    }
    return b;
  }
  makeNoise(sec) {
    const ctx = this.ctx, len = Math.floor(ctx.sampleRate * sec);
    const b = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }
  makeBrown(sec) {
    const ctx = this.ctx, len = Math.floor(ctx.sampleRate * sec);
    const b = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = b.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + 0.04 * w) / 1.04;
      d[i] = last * 3.2;
    }
    return b;
  }
  loopNoise(buf, type, freq, q, out) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = buf; src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    src.connect(f).connect(out);
    src.start();
    return f;
  }

  applyVolume() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.vol.master, t, 0.05);
    this.musicBus.gain.setTargetAtTime(this.vol.music, t, 0.05);
    this.sfxBus.gain.setTargetAtTime(this.vol.sfx, t, 0.05);
  }

  setMood(m) {
    this.mood = { ...this.mood, ...m };
    if (!this.ctx) return;
    this.nextChord = this.ctx.currentTime + 0.2;
    this.drone.frequency.setTargetAtTime(mtof(this.mood.root - 24), this.ctx.currentTime, 1.5);
    this.droneGain.gain.setTargetAtTime(0.05, this.ctx.currentTime, 3);
  }

  // ---------- 音乐调度 ----------
  update(dt, state) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime;
    const sc = SCALES[this.mood.scale] || SCALES.lydian;
    if (t >= this.nextChord) {
      const prog = [0, 3, 5, 1, 4, 2];
      const deg = prog[this.chordIdx++ % prog.length];
      const notes = [0, 2, 4, 6].map((k) => {
        const i = deg + k;
        return this.mood.root - 12 + sc[i % sc.length] + 12 * Math.floor(i / sc.length);
      });
      this.pad(notes, 11);
      this.nextChord = t + 10 + Math.random() * 3;
    }
    if (t >= this.nextBell) {
      const n = Math.random() < 0.3 ? 3 : Math.random() < 0.5 ? 2 : 1;
      let deg = Math.floor(Math.random() * sc.length * 2);
      for (let i = 0; i < n; i++) {
        const d = deg + i * (Math.random() < 0.5 ? 2 : 1);
        const m = this.mood.root + 12 + sc[d % sc.length] + 12 * Math.floor(d / sc.length);
        this.bell(mtof(m), t + i * 0.32 + Math.random() * 0.05, 0.055, (Math.random() - 0.5) * 1.4, 3.2, this.musicBus, 0.9);
      }
      this.nextBell = t + 2.2 + Math.random() * 4.5;
    }
    // 水声与风声
    const wl = state.waterDist < 30 ? Math.pow(1 - state.waterDist / 30, 2) * 0.32 : 0;
    this.waterGain.gain.setTargetAtTime(wl, t, 0.25);
    const wind = Math.min(1, Math.max(0, (state.fallSpeed - 6) / 26)) * 0.35 + (state.ambientWind || 0);
    this.windGain.gain.setTargetAtTime(wind, t, 0.2);
  }

  pad(notes, dur) {
    const ctx = this.ctx, t = ctx.currentTime;
    for (const m of notes) {
      const f = mtof(m);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.028, t + 3.5);
      g.gain.setValueAtTime(0.028, t + dur - 1);
      g.gain.linearRampToValueAtTime(0, t + dur + 4);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 700 + Math.random() * 500; lp.Q.value = 0.4;
      for (const [type, det] of [['sine', -5], ['triangle', 6]]) {
        const o = ctx.createOscillator();
        o.type = type; o.frequency.value = f; o.detune.value = det;
        o.connect(lp);
        o.start(t); o.stop(t + dur + 4.2);
      }
      const p = ctx.createStereoPanner();
      p.pan.value = (Math.random() - 0.5) * 0.8;
      lp.connect(g).connect(p);
      p.connect(this.musicBus);
      p.connect(this.revSend);
    }
  }

  // FM 钟声
  bell(freq, when, amp, pan = 0, decay = 2.5, bus = this.sfxBus, rev = 0.7, ratio = 3.01) {
    const ctx = this.ctx;
    const car = ctx.createOscillator(), mod = ctx.createOscillator();
    const mg = ctx.createGain(), g = ctx.createGain();
    car.frequency.value = freq;
    mod.frequency.value = freq * ratio;
    mg.gain.setValueAtTime(freq * 2.2, when);
    mg.gain.exponentialRampToValueAtTime(freq * 0.05 + 1, when + decay * 0.6);
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(amp, when + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, when + decay);
    mod.connect(mg).connect(car.frequency);
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    car.connect(g).connect(p);
    p.connect(bus);
    if (rev) { const rs = ctx.createGain(); rs.gain.value = rev; p.connect(rs).connect(this.revSend); }
    car.start(when); mod.start(when);
    car.stop(when + decay + 0.1); mod.stop(when + decay + 0.1);
  }

  noise(when, dur, type, f0, f1, amp, q = 1, pan = 0, rev = 0.2) {
    const ctx = this.ctx;
    const s = ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    s.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter();
    f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, when);
    f.frequency.exponentialRampToValueAtTime(f1, when + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(amp, when + Math.min(0.04, dur * 0.3));
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    const p = ctx.createStereoPanner(); p.pan.value = pan;
    s.connect(f).connect(g).connect(p);
    p.connect(this.sfxBus);
    if (rev) { const rs = ctx.createGain(); rs.gain.value = rev; p.connect(rs).connect(this.revSend); }
    s.start(when, Math.random() * 1.5);
    s.stop(when + dur + 0.05);
  }

  tone(when, dur, f0, f1, amp, type = 'sine', pan = 0, rev = 0.2) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, when);
    o.frequency.exponentialRampToValueAtTime(f1, when + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(amp, when + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    const p = ctx.createStereoPanner(); p.pan.value = pan;
    o.connect(g).connect(p);
    p.connect(this.sfxBus);
    if (rev) { const rs = ctx.createGain(); rs.gain.value = rev; p.connect(rs).connect(this.revSend); }
    o.start(when); o.stop(when + dur + 0.05);
  }

  ok() { return this.ctx && this.ctx.state === 'running'; }
  // rel: {pan, gain}
  sp(rel) { return rel || { pan: 0, gain: 1 }; }
  scaleNote(deg, oct = 0) {
    const sc = SCALES[this.mood.scale] || SCALES.lydian;
    const d = ((deg % sc.length) + sc.length) % sc.length;
    return mtof(this.mood.root + sc[d] + 12 * (oct + Math.floor(deg / sc.length)));
  }

  // ---------- 音效 ----------
  shift(color) {
    if (!this.ok()) return;
    const t = this.ctx.currentTime;
    this.noise(t, 0.62, 'bandpass', 300, 2600, 0.22, 1.6, 0, 0.5);
    this.tone(t, 0.6, 140, 70, 0.12, 'sine', 0, 0.3);
    const base = mtof(this.mood.root + GRAV_PITCH[color]);
    this.bell(base * 2, t + 0.5, 0.06, 0, 2.6, this.sfxBus, 0.9, 1.414);
    this.bell(base * 3, t + 0.58, 0.04, 0.3, 2.6, this.sfxBus, 0.9, 1.414);
  }
  shiftDone() {
    if (!this.ok()) return;
    const t = this.ctx.currentTime;
    this.tone(t, 0.25, 90, 45, 0.15, 'sine', 0, 0.2);
  }
  deny() {
    if (!this.ok()) return;
    const t = this.ctx.currentTime;
    this.tone(t, 0.18, 170, 120, 0.1, 'triangle', 0, 0.2);
    this.tone(t + 0.12, 0.2, 150, 100, 0.08, 'triangle', 0, 0.2);
  }
  step() {
    if (!this.ok()) return;
    const t = this.ctx.currentTime;
    this.noise(t, 0.09, 'lowpass', 700 + Math.random() * 400, 200, 0.07, 0.7, (Math.random() - 0.5) * 0.3, 0.05);
  }
  jump() {
    if (!this.ok()) return;
    this.noise(this.ctx.currentTime, 0.16, 'bandpass', 500, 1200, 0.05, 0.8, 0, 0.05);
  }
  land(k) {
    if (!this.ok()) return;
    const t = this.ctx.currentTime;
    this.tone(t, 0.25, 110, 40, 0.12 + k * 0.18, 'sine', 0, 0.1);
    this.noise(t, 0.2, 'lowpass', 600, 120, 0.08 + k * 0.15, 0.7, 0, 0.1);
  }
  pickup(color) {
    if (!this.ok()) return;
    const t = this.ctx.currentTime;
    const b = mtof(this.mood.root + GRAV_PITCH[color] + 12);
    this.bell(b, t, 0.07, -0.1, 1.2, this.sfxBus, 0.4, 2.0);
    this.bell(b * 1.5, t + 0.07, 0.05, 0.1, 1.2, this.sfxBus, 0.4, 2.0);
    this.noise(t, 0.2, 'highpass', 2000, 4000, 0.03, 0.5, 0, 0.1);
  }
  drop() {
    if (!this.ok()) return;
    const t = this.ctx.currentTime;
    this.noise(t, 0.15, 'bandpass', 1400, 500, 0.04, 0.8, 0, 0.1);
  }
  cubeLand(k, rel) {
    if (!this.ok()) return;
    const r = this.sp(rel);
    const t = this.ctx.currentTime;
    const a = r.gain * (0.1 + k * 0.25);
    if (a < 0.004) return;
    this.tone(t, 0.22, 200, 70, a, 'sine', r.pan, 0.2);
    this.noise(t, 0.08, 'bandpass', 1800, 600, a * 0.6, 1.2, r.pan, 0.2);
  }
  socketOn(color, rel) {
    if (!this.ok()) return;
    const r = this.sp(rel);
    const t = this.ctx.currentTime;
    const base = this.mood.root + GRAV_PITCH[color];
    [0, 4, 7, 12].forEach((iv, i) => this.bell(mtof(base + iv + 12), t + i * 0.11, 0.09 * Math.max(0.35, r.gain), r.pan, 3.2, this.sfxBus, 1.0));
    this.tone(t, 1.2, 60, 58, 0.12 * r.gain, 'sine', r.pan, 0.3);
  }
  socketOff(rel) {
    if (!this.ok()) return;
    const r = this.sp(rel);
    const t = this.ctx.currentTime;
    this.bell(this.scaleNote(4, 1), t, 0.05 * Math.max(0.4, r.gain), r.pan, 1.5);
    this.bell(this.scaleNote(2, 1), t + 0.12, 0.04 * Math.max(0.4, r.gain), r.pan, 1.5);
  }
  door(open, rel) {
    if (!this.ok()) return;
    const r = this.sp(rel);
    const t = this.ctx.currentTime;
    const g = Math.max(0.25, r.gain);
    this.noise(t, 1.9, 'lowpass', 260, 90, 0.22 * g, 0.9, r.pan, 0.4);
    this.tone(t, 1.9, 55, 48, 0.12 * g, 'sine', r.pan, 0.3);
    if (open) {
      this.bell(this.scaleNote(0, 0), t + 1.6, 0.07 * g, r.pan, 4, this.sfxBus, 1);
      this.bell(this.scaleNote(4, 0), t + 1.75, 0.05 * g, r.pan, 4, this.sfxBus, 1);
    }
  }
  treeGrow(rel) {
    if (!this.ok()) return;
    const r = this.sp(rel);
    const t = this.ctx.currentTime;
    for (let i = 0; i < 12; i++) this.bell(this.scaleNote(i, 1), t + i * 0.34, 0.05 * Math.max(0.5, r.gain), (Math.random() - 0.5), 2.4, this.sfxBus, 1, 2.0);
    this.noise(t, 4.2, 'bandpass', 400, 3000, 0.04, 2, r.pan, 0.8);
  }
  fruit(rel) {
    if (!this.ok()) return;
    const r = this.sp(rel);
    const t = this.ctx.currentTime;
    [0, 2, 4, 7].forEach((d, i) => this.bell(this.scaleNote(d, 2), t + i * 0.06, 0.06, r.pan, 2.5, this.sfxBus, 1));
  }
  respawnCube(rel) {
    if (!this.ok()) return;
    const t = this.ctx.currentTime;
    this.bell(this.scaleNote(6, 1), t, 0.04, 0, 2, this.sfxBus, 1, 1.414);
  }
  portal() {
    if (!this.ok()) return;
    const t = this.ctx.currentTime;
    this.noise(t, 2.6, 'bandpass', 200, 5000, 0.18, 0.8, 0, 1);
    [0, 2, 4, 6, 7, 9, 11, 14].forEach((d, i) => this.bell(this.scaleNote(d, 1), t + 0.2 + i * 0.12, 0.07, (i % 2 ? 0.4 : -0.4), 4, this.sfxBus, 1.2));
  }
  ui() {
    if (!this.ok()) return;
    this.bell(this.scaleNote(4, 2), this.ctx.currentTime, 0.03, 0, 0.8, this.sfxBus, 0.3, 2);
  }
  respawn() {
    if (!this.ok()) return;
    const t = this.ctx.currentTime;
    this.noise(t, 1.2, 'bandpass', 3000, 300, 0.1, 1.2, 0, 0.8);
    this.bell(this.scaleNote(0, 1), t + 0.6, 0.05, 0, 3, this.sfxBus, 1);
  }
}
