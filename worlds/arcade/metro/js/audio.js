// 星环列车 · 声音：全部由 WebAudio 实时合成（音乐 + 音效）
const N = (n) => 440 * Math.pow(2, (n - 69) / 12); // MIDI → Hz

// 每个环境一组和弦（D 大调内，切换时不跑调）
const PROG = [
  [[50, 62, 66, 69, 73], [47, 59, 62, 66, 69], [43, 59, 62, 67, 71], [45, 57, 61, 64, 69]],   // 昼侧 D Bm G A
  [[47, 59, 62, 66, 71], [43, 59, 62, 67, 71], [50, 57, 62, 66, 69], [45, 57, 61, 64, 68]],   // 晨昏 Bm G D A
  [[40, 55, 59, 62, 67], [43, 55, 59, 62, 66], [47, 54, 59, 62, 66], [45, 52, 57, 61, 64]],   // 夜侧 Em G Bm A
  [[43, 55, 59, 62, 66], [45, 57, 61, 64, 69], [42, 54, 57, 61, 64], [47, 54, 59, 62, 66]],   // 碎星 G A F#m Bm
  [[43, 54, 59, 62, 66], [42, 57, 62, 66, 69], [40, 55, 59, 62, 66], [45, 57, 62, 64, 69]],   // 极光 Gmaj7 D/F# Em7 Asus
];
const PENTA = [74, 76, 78, 81, 83, 86, 88, 90, 93, 95, 98];

export class Sound {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.musicOn = false;
    this.intensity = 0; this.biome = 0; this.bpm = 118;
    this.step = 0; this.nextT = 0;
    this.loops = {};
  }

  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain(); this.master.gain.value = this.muted ? 0 : 0.85;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 10; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.18;
    this.master.connect(comp); comp.connect(ctx.destination);
    this.music = ctx.createGain(); this.music.gain.value = 0.42; this.music.connect(this.master);
    this.duck = ctx.createGain(); this.duck.gain.value = 1; this.duck.connect(this.music);
    this.sfx = ctx.createGain(); this.sfx.gain.value = 0.9; this.sfx.connect(this.master);
    // 回声（琶音用）
    this.delay = ctx.createDelay(1); this.delay.delayTime.value = 0.375;
    const fb = ctx.createGain(); fb.gain.value = 0.32;
    const dlp = ctx.createBiquadFilter(); dlp.type = 'lowpass'; dlp.frequency.value = 2600;
    this.delay.connect(dlp); dlp.connect(fb); fb.connect(this.delay); dlp.connect(this.duck);
    // 噪声
    const len = ctx.sampleRate * 2;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.timer = setInterval(() => this.schedule(), 25);
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.85, this.ctx.currentTime, 0.05);
  }
  suspend() { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend(); }
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }
  get t() { return this.ctx.currentTime; }
  ok() { return this.ctx && !this.muted && this.ctx.state === 'running'; }

  // —— 基础合成 ——
  out(pan, bus) {
    const g = this.ctx.createGain();
    if (pan && this.ctx.createStereoPanner) { const p = this.ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan)); g.connect(p); p.connect(bus || this.sfx); }
    else g.connect(bus || this.sfx);
    return g;
  }
  tone(f, dur, { type = 'sine', vol = 0.3, to = 0, at = 0, a = 0.005, pan = 0, bus, lp = 0, q = 1, curve = 'exp' } = {}) {
    const ctx = this.ctx, t = this.t + at;
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t);
    if (to) o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
    const g = this.out(pan, bus);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + a);
    if (curve === 'exp') g.gain.exponentialRampToValueAtTime(0.0001, t + dur); else g.gain.linearRampToValueAtTime(0.0001, t + dur);
    let node = o;
    if (lp) { const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = lp; fl.Q.value = q; o.connect(fl); node = fl; }
    node.connect(g);
    o.start(t); o.stop(t + dur + 0.05);
    return o;
  }
  noise(dur, { vol = 0.3, type = 'bandpass', f = 1000, to = 0, q = 1, at = 0, a = 0.005, pan = 0, bus } = {}) {
    const ctx = this.ctx, t = this.t + at;
    const s = ctx.createBufferSource(); s.buffer = this.noiseBuf;
    const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, t); fl.Q.value = q;
    if (to) fl.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = this.out(pan, bus);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(fl); fl.connect(g);
    s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05);
  }

  // —— 音效 ——
  lane(dir) { if (!this.ok()) return; this.noise(0.16, { vol: 0.16, f: 900, to: 2800, q: 0.8, pan: dir * 0.6 }); this.tone(dir > 0 ? 620 : 560, 0.08, { type: 'triangle', vol: 0.05, to: dir > 0 ? 760 : 460, pan: dir * 0.5 }); }
  edge(dir) { if (!this.ok()) return; this.tone(160, 0.1, { type: 'square', vol: 0.06, lp: 900, pan: dir * 0.7 }); }
  jump() { if (!this.ok()) return; this.tone(320, 0.2, { type: 'sine', vol: 0.18, to: 720 }); this.noise(0.18, { vol: 0.08, f: 1200, to: 3200 }); }
  dive() { if (!this.ok()) return; this.tone(700, 0.14, { type: 'sine', vol: 0.12, to: 200 }); }
  land(impact) { if (!this.ok()) return; const v = Math.min(1, impact / 14); this.tone(120, 0.12, { vol: 0.12 + v * 0.18, to: 55 }); this.noise(0.1, { vol: 0.05 + v * 0.1, type: 'lowpass', f: 900 }); }
  slide() { if (!this.ok()) return; this.noise(0.42, { vol: 0.16, f: 2600, to: 900, q: 1.4 }); this.noise(0.3, { vol: 0.05, type: 'highpass', f: 6000 }); }
  step(side) { if (!this.ok()) return; this.tone(180 + Math.random() * 30, 0.04, { type: 'triangle', vol: 0.025, to: 90, pan: side * 0.15 }); }
  mote(combo, pan) {
    if (!this.ok()) return;
    const f = N(PENTA[Math.min(combo, PENTA.length - 1)]);
    this.tone(f, 0.22, { vol: 0.09, pan, a: 0.002 });
    this.tone(f * 2.005, 0.12, { vol: 0.03, pan, a: 0.002 });
  }
  power(type) {
    if (!this.ok()) return;
    const base = { magnet: 62, shield: 66, jet: 57, double: 69 }[type] || 62;
    [0, 4, 7, 12, 16].forEach((iv, i) => this.tone(N(base + iv + 12), 0.28, { type: 'triangle', vol: 0.1, at: i * 0.055 }));
    this.noise(0.6, { vol: 0.08, type: 'highpass', f: 5000, at: 0.05 });
  }
  powEnd() { if (!this.ok()) return; this.tone(N(74), 0.15, { type: 'triangle', vol: 0.07 }); this.tone(N(67), 0.2, { type: 'triangle', vol: 0.07, at: 0.08 }); }
  shieldBreak() {
    if (!this.ok()) return;
    for (const f of [1900, 2500, 3300, 4100]) this.tone(f * (0.95 + Math.random() * 0.1), 0.5, { vol: 0.07, at: Math.random() * 0.04 });
    this.noise(0.5, { vol: 0.25, type: 'highpass', f: 2500 });
    this.tone(180, 0.35, { vol: 0.25, to: 60 });
  }
  crash() {
    if (!this.ok()) return;
    this.noise(0.9, { vol: 0.55, type: 'lowpass', f: 3000, to: 160, q: 0.7 });
    this.tone(110, 0.6, { vol: 0.5, to: 32 });
    this.tone(523, 0.35, { type: 'square', vol: 0.08, lp: 1800, to: 300 });
    this.duckMusic(0.25, 1.6);
  }
  stumble() { if (!this.ok()) return; this.tone(150, 0.2, { vol: 0.3, to: 70 }); this.noise(0.25, { vol: 0.18, type: 'lowpass', f: 1400 }); this.tone(240, 0.18, { type: 'square', vol: 0.05, lp: 700, at: 0.04 }); }
  horn(same) {
    if (!this.ok()) return;
    const v = same ? 0.16 : 0.07;
    for (const [f, at] of [[233, 0], [294, 0], [233, 0.55], [294, 0.55]]) {
      if (!same && at > 0) continue;
      const o = this.tone(f, 0.48, { type: 'sawtooth', vol: v, lp: 1600, q: 2, at, a: 0.03, curve: 'lin' });
      o.frequency.linearRampToValueAtTime(f * 1.03, this.t + at + 0.45);
    }
  }
  passby(adj) { if (!this.ok()) return; this.noise(0.75, { vol: adj ? 0.35 : 0.12, f: 400, to: 1800, q: 0.9, a: 0.25 }); this.tone(90, 0.6, { vol: adj ? 0.18 : 0.06, to: 60, a: 0.2 }); }
  nearMiss() { if (!this.ok()) return; [0, 7, 12].forEach((iv, i) => this.tone(N(81 + iv), 0.18, { type: 'triangle', vol: 0.09, at: 0.12 + i * 0.05 })); }
  jetStart() { if (!this.ok()) return; this.noise(0.9, { vol: 0.35, f: 300, to: 2400, q: 0.7 }); this.tone(90, 0.8, { type: 'sawtooth', vol: 0.12, lp: 500, to: 160 }); this.loop('jet', true); }
  countdown(last) { if (!this.ok()) return; this.tone(last ? 1320 : 880, last ? 0.35 : 0.14, { type: 'triangle', vol: 0.16 }); }
  revive() { if (!this.ok()) return; this.noise(0.8, { vol: 0.25, f: 600, to: 5000 }); [0, 4, 7, 12, 16, 19].forEach((iv, i) => this.tone(N(62 + iv), 0.3, { type: 'triangle', vol: 0.1, at: i * 0.06 })); }
  click() { if (!this.ok()) return; this.tone(1400, 0.05, { type: 'triangle', vol: 0.06 }); }
  fanfare() { if (!this.ok()) return; [0, 4, 7, 12, 7, 12, 16].forEach((iv, i) => this.tone(N(74 + iv), 0.3, { type: 'triangle', vol: 0.1, at: i * 0.08 })); }
  biomeWhoosh() { if (!this.ok()) return; this.noise(2.2, { vol: 0.12, f: 200, to: 3000, q: 0.6, a: 1.2 }); }
  duckMusic(to, dur) { if (!this.ctx) return; const g = this.duck.gain, t = this.t; g.cancelScheduledValues(t); g.setTargetAtTime(to, t, 0.05); g.setTargetAtTime(1, t + dur, 0.4); }

  // 持续音：喷射、磁吸
  loop(name, on) {
    if (!this.ctx) return;
    const L = this.loops[name];
    if (on && !L) {
      const ctx = this.ctx, g = ctx.createGain(); g.gain.value = 0.0001; g.connect(this.sfx);
      const nodes = [];
      if (name === 'jet') {
        const s = ctx.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
        const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 700; f.Q.value = 0.6;
        s.connect(f); f.connect(g); s.start(); nodes.push(s);
        const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 62;
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 240;
        o.connect(lp); lp.connect(g); o.start(); nodes.push(o);
        g.gain.setTargetAtTime(0.22, this.t, 0.2);
      } else if (name === 'magnet') {
        for (const fq of [220, 221.7]) { const o = ctx.createOscillator(); o.frequency.value = fq; o.connect(g); o.start(); nodes.push(o); }
        g.gain.setTargetAtTime(0.025, this.t, 0.3);
      }
      this.loops[name] = { g, nodes };
    } else if (!on && L) {
      L.g.gain.setTargetAtTime(0.0001, this.t, 0.15);
      setTimeout(() => { for (const n of L.nodes) try { n.stop(); } catch (e) {} L.g.disconnect(); }, 600);
      delete this.loops[name];
    }
  }
  stopLoops() { for (const k of Object.keys(this.loops)) this.loop(k, false); }

  // —— 音乐 ——
  startMusic(intensity = 1) { this.musicOn = true; this.intensity = intensity; if (this.ctx && this.nextT < this.t) this.nextT = this.t + 0.06; }
  stopMusic() { this.musicOn = false; }
  schedule() {
    if (!this.ctx || !this.musicOn || this.ctx.state !== 'running') return;
    const spb = 60 / this.bpm / 4; // 十六分音符
    if (this.nextT < this.t - 0.2) this.nextT = this.t + 0.05;
    while (this.nextT < this.t + 0.14) {
      this.playStep(this.step, this.nextT);
      this.step = (this.step + 1) % 64;
      this.nextT += spb;
    }
  }
  playStep(st, t) {
    const ctx = this.ctx;
    const bar = Math.floor(st / 16), s = st % 16;
    const chord = PROG[this.biome % PROG.length][bar];
    const I = this.intensity;
    const spb = 60 / this.bpm / 4;
    const at = (fn) => fn(t);
    // 鼓
    if (I >= 1 && s % 4 === 0) at((tt) => this.kick(tt));
    if (I >= 2 && (s === 4 || s === 12)) at((tt) => this.snare(tt));
    if (I >= 1 && s % 4 === 2) at((tt) => this.hat(tt, 0.05));
    if (I >= 2 && s % 2 === 1) at((tt) => this.hat(tt, 0.025));
    // 贝斯
    if (I >= 1 && s % 2 === 0) {
      const oct = s % 8 === 6 ? 12 : 0;
      this.synth(N(chord[0] - 12 + oct), t, spb * 1.7, { type: 'sawtooth', vol: 0.13, lp: 420 + I * 120, q: 4, bus: this.duck });
    }
    // 琶音
    const arpOn = I === 0 ? s % 4 === 0 : (I >= 2 ? true : s % 2 === 0);
    if (arpOn) {
      const tones = chord.slice(1);
      const idx = Math.floor(st / (I >= 2 ? 1 : 2));
      const n = tones[idx % tones.length] + 12 * (Math.floor(idx / tones.length) % 2);
      this.synth(N(n), t, spb * 1.4, { type: 'triangle', vol: I === 0 ? 0.05 : 0.045, lp: 3800, bus: this.duck, send: true });
    }
    // 和弦铺底
    if (s === 0) {
      for (const n of chord.slice(1, 4)) {
        this.synth(N(n), t, spb * 16, { type: 'sawtooth', vol: 0.018, lp: 900 + I * 300, a: 0.35, rel: true, bus: this.duck, detune: 7 });
        this.synth(N(n), t, spb * 16, { type: 'sawtooth', vol: 0.018, lp: 900 + I * 300, a: 0.35, rel: true, bus: this.duck, detune: -7 });
      }
    }
  }
  synth(f, t, dur, { type = 'sine', vol = 0.1, lp = 0, q = 1, a = 0.006, rel = false, bus, send = false, detune = 0 } = {}) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; o.detune.value = detune;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + a);
    if (rel) { g.gain.setValueAtTime(vol, t + dur * 0.7); g.gain.linearRampToValueAtTime(0.0001, t + dur); }
    else g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = o;
    if (lp) { const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = lp; fl.Q.value = q; o.connect(fl); node = fl; }
    node.connect(g); g.connect(bus || this.music);
    if (send) { const sg = ctx.createGain(); sg.gain.value = 0.5; g.connect(sg); sg.connect(this.delay); }
    o.start(t); o.stop(t + dur + 0.05);
  }
  kick(t) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.42, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    o.connect(g); g.connect(this.music); o.start(t); o.stop(t + 0.32);
    // 侧链压缩感
    const d = this.duck.gain; d.cancelScheduledValues(t); d.setValueAtTime(0.55, t); d.linearRampToValueAtTime(1, t + 0.18);
  }
  snare(t) {
    const ctx = this.ctx;
    const s = ctx.createBufferSource(); s.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1800; f.Q.value = 0.8;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.16, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    s.connect(f); f.connect(g); g.connect(this.music); s.start(t, Math.random()); s.stop(t + 0.2);
  }
  hat(t, vol) {
    const ctx = this.ctx;
    const s = ctx.createBufferSource(); s.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7500;
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    s.connect(f); f.connect(g); g.connect(this.music); s.start(t, Math.random()); s.stop(t + 0.06);
  }
}
