/* 星际竞速 · 音频：全部用 WebAudio 合成（引擎声、音效、合成器浪潮配乐） */

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

/* 配乐：每首 4 小节循环。和弦写成相对主音的半音 [根, 三, 五] */
const SONGS = [
  { // 0 霓虹星港：A 小调，明亮
    bpm: 124, root: 57,
    prog: [[0, 3, 7], [-4, 0, 3], [3, 7, 10], [-2, 2, 5]],
    bass: [0, null, 12, 0, null, 0, 12, null, 0, null, 12, 0, null, 7, 12, null],
    arp: [0, 1, 2, 3, 2, 1, 0, 1, 2, 3, 4, 3, 2, 1, 2, 3],
    kick: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
    snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
    hat: [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 1],
    lead: [12, null, null, 10, null, null, 7, null, 12, null, 15, null, 14, null, 10, null],
  },
  { // 1 赤炎环带：E 小调，推进感
    bpm: 132, root: 52,
    prog: [[0, 3, 7], [0, 3, 7], [-4, 0, 3], [-2, 2, 5]],
    bass: [0, 0, 12, 0, 0, 12, 0, 0, 0, 0, 12, 0, 10, 0, 7, 0],
    arp: [0, 2, 1, 3, 0, 2, 1, 4, 0, 2, 1, 3, 2, 4, 3, 5],
    kick: [1, 0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 0, 1, 0, 0, 0],
    snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 0],
    hat: [1, 0, 1, 1, 1, 0, 1, 0, 1, 0, 1, 1, 1, 0, 1, 1],
    lead: [7, null, 10, null, 12, null, null, 10, 7, null, 5, null, 3, null, 5, null],
  },
  { // 2 幽冥视界：F# 小调，暗涌
    bpm: 138, root: 54,
    prog: [[0, 3, 7], [1, 5, 8], [-2, 1, 5], [-5, -1, 2]],
    bass: [0, 12, 0, 0, 12, 0, 0, 12, 0, 12, 0, 0, 12, 0, 13, 12],
    arp: [0, 3, 1, 4, 2, 5, 1, 3, 0, 3, 1, 4, 2, 5, 4, 3],
    kick: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0, 1, 0, 0, 0],
    snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1],
    hat: [0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1],
    lead: [12, null, 13, null, 15, null, 13, null, 12, null, 10, null, 8, null, 7, null],
  },
  { // 3 标题：舒缓
    bpm: 96, root: 57,
    prog: [[0, 3, 7], [-4, 0, 3], [-7, -3, 0], [-2, 2, 5]],
    bass: [0, null, null, null, null, null, 12, null, 0, null, null, null, 7, null, null, null],
    arp: [0, 2, 4, 2, 1, 3, 5, 3, 0, 2, 4, 2, 1, 3, 5, 3],
    kick: [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0],
    snare: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
    hat: [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0],
    lead: null,
  },
];

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.musicOn = true;
    this.seq = null;
    this.timer = null;
    this.level = 0;
    this.duck = 1;
  }

  unlock() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!this.ctx) { try { this.ctx = new AC(); this.build(); } catch (e) { this.ctx = null; return; } }
    if (this.ctx.state === 'suspended' && !this.hiddenPause) this.ctx.resume();
  }
  get ok() { return !!this.ctx && this.ctx.state !== 'closed'; }

  build() {
    const c = this.ctx;
    this.master = c.createGain(); this.master.gain.value = this.muted ? 0 : 0.85;
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 3.5; comp.attack.value = 0.004; comp.release.value = 0.2;
    this.master.connect(comp); comp.connect(c.destination);
    this.sfx = c.createGain(); this.sfx.gain.value = 0.85; this.sfx.connect(this.master);
    this.music = c.createGain(); this.music.gain.value = this.musicOn ? 0.36 : 0; this.music.connect(this.master);
    this.engBus = c.createGain(); this.engBus.gain.value = 0; this.engBus.connect(this.master);
    // 配乐回声
    this.delay = c.createDelay(1.2);
    this.delay.delayTime.value = 0.36;
    const fb = c.createGain(); fb.gain.value = 0.34;
    const dl = c.createBiquadFilter(); dl.type = 'lowpass'; dl.frequency.value = 2400;
    this.delay.connect(dl); dl.connect(fb); fb.connect(this.delay);
    const wet = c.createGain(); wet.gain.value = 0.5; dl.connect(wet); wet.connect(this.music);
    // 噪声
    const len = c.sampleRate * 2;
    const b = c.createBuffer(1, len, c.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noise = b;
    this.buildEngine();
  }

  setMuted(m) {
    this.muted = m;
    if (this.ok) this.master.gain.setTargetAtTime(m ? 0 : 0.85, this.ctx.currentTime, 0.05);
  }
  setMusic(on) {
    this.musicOn = on;
    if (this.ok) this.music.gain.setTargetAtTime(on ? 0.36 * this.duck : 0, this.ctx.currentTime, 0.2);
  }
  setDuck(d) {
    this.duck = d;
    if (this.ok) this.music.gain.setTargetAtTime(this.musicOn ? 0.36 * d : 0, this.ctx.currentTime, 0.25);
  }
  suspend() { if (this.ok && this.ctx.state === 'running') this.ctx.suspend(); }
  resume() { if (this.ok && this.ctx.state === 'suspended') this.ctx.resume(); }

  /* ---------- 引擎 ---------- */
  buildEngine() {
    const c = this.ctx;
    const e = {};
    e.out = c.createGain(); e.out.gain.value = 0; e.out.connect(this.engBus);
    e.lp = c.createBiquadFilter(); e.lp.type = 'lowpass'; e.lp.frequency.value = 400; e.lp.Q.value = 4; e.lp.connect(e.out);
    e.o1 = c.createOscillator(); e.o1.type = 'sawtooth';
    e.o2 = c.createOscillator(); e.o2.type = 'square';
    e.sub = c.createOscillator(); e.sub.type = 'sine';
    e.wh = c.createOscillator(); e.wh.type = 'sine';
    const g1 = c.createGain(); g1.gain.value = 0.2; e.o1.connect(g1); g1.connect(e.lp);
    const g2 = c.createGain(); g2.gain.value = 0.08; e.o2.connect(g2); g2.connect(e.lp);
    const gs = c.createGain(); gs.gain.value = 0.3; e.sub.connect(gs); gs.connect(e.out);
    e.whG = c.createGain(); e.whG.gain.value = 0; e.wh.connect(e.whG); e.whG.connect(e.out);
    const mk = (type, f, q) => { const s = c.createBufferSource(); s.buffer = this.noise; s.loop = true; const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q; const g = c.createGain(); g.gain.value = 0; s.connect(fl); fl.connect(g); g.connect(this.engBus); s.start(); return { s, fl, g }; };
    e.wind = mk('bandpass', 900, 0.6);
    e.roar = mk('lowpass', 420, 1);
    e.hiss = mk('highpass', 3800, 0.7);
    for (const o of [e.o1, e.o2, e.sub, e.wh]) { o.frequency.value = 60; o.start(); }
    this.eng = e;
  }

  setEngine(on, speed01, boost, drift, wallGrind) {
    if (!this.ok || !this.eng) return;
    const e = this.eng, t = this.ctx.currentTime, k = 0.06;
    this.engBus.gain.setTargetAtTime(on ? 1 : 0, t, on ? 0.2 : 0.12);
    const f = 46 + speed01 * 96 + boost * 22;
    e.o1.frequency.setTargetAtTime(f, t, k);
    e.o2.frequency.setTargetAtTime(f * 1.006 * 2, t, k);
    e.sub.frequency.setTargetAtTime(f / 2, t, k);
    e.wh.frequency.setTargetAtTime(520 + speed01 * 1500 + boost * 500, t, k);
    e.whG.gain.setTargetAtTime(0.012 + speed01 * 0.025, t, k);
    e.lp.frequency.setTargetAtTime(260 + speed01 * 1500 + boost * 1600, t, k);
    e.out.gain.setTargetAtTime(0.32 + speed01 * 0.12, t, k);
    e.wind.g.gain.setTargetAtTime(speed01 * speed01 * 0.16 + boost * 0.08, t, k);
    e.wind.fl.frequency.setTargetAtTime(600 + speed01 * 2200, t, k);
    e.roar.g.gain.setTargetAtTime(boost * 0.4, t, 0.08);
    e.hiss.g.gain.setTargetAtTime((drift ? 0.07 : 0) + wallGrind * 0.12, t, 0.05);
    e.hiss.fl.frequency.setTargetAtTime(drift ? 3200 + drift * 1500 : 2600, t, 0.1);
  }

  /* ---------- 音效工具 ---------- */
  tone(f, dur, o = {}) {
    if (!this.ok || this.muted) return;
    const c = this.ctx, t = c.currentTime + (o.at || 0);
    const osc = c.createOscillator(); osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(f, t);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + (o.slide || dur));
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(o.vol || 0.2, t + (o.a || 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = g;
    if (o.lp) { const fl = c.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = o.lp; g.connect(fl); node = fl; }
    osc.connect(g);
    node.connect(o.bus || this.sfx);
    if (o.echo) { const s = c.createGain(); s.gain.value = o.echo; node.connect(s); s.connect(this.delay); }
    osc.start(t); osc.stop(t + dur + 0.05);
  }
  burst(dur, o = {}) {
    if (!this.ok || this.muted) return;
    const c = this.ctx, t = c.currentTime + (o.at || 0);
    const s = c.createBufferSource(); s.buffer = this.noise;
    s.playbackRate.value = o.rate || 1;
    const fl = c.createBiquadFilter(); fl.type = o.type || 'bandpass'; fl.Q.value = o.q || 1;
    fl.frequency.setValueAtTime(o.f || 1200, t);
    if (o.to) fl.frequency.exponentialRampToValueAtTime(o.to, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(o.vol || 0.3, t + (o.a || 0.01));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(fl); fl.connect(g);
    let out = g;
    if (o.pan != null && c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = o.pan; g.connect(p); out = p; }
    out.connect(o.bus || this.sfx);
    s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05);
  }

  /* ---------- 音效 ---------- */
  click() { this.tone(1250, 0.06, { type: 'triangle', vol: 0.08 }); }
  hover() { this.tone(1800, 0.04, { type: 'sine', vol: 0.03 }); }
  count(n) { this.tone(n === 0 ? 1046 : 523, n === 0 ? 0.7 : 0.22, { type: 'square', vol: 0.12, lp: 2600 }); if (n === 0) { this.tone(1318, 0.7, { type: 'square', vol: 0.07, lp: 3000 }); this.tone(1568, 0.8, { type: 'sawtooth', vol: 0.05, lp: 3000, echo: 0.3 }); } }
  wall(impact) {
    const v = Math.min(0.5, 0.12 + impact / 60);
    this.burst(0.35, { type: 'lowpass', f: 2600, to: 220, q: 0.8, vol: v });
    this.tone(110, 0.3, { type: 'sine', to: 40, vol: v * 0.9 });
    this.tone(880, 0.12, { type: 'square', to: 300, vol: v * 0.12, lp: 2000 });
  }
  bump(p) { this.tone(160, 0.22, { type: 'triangle', to: 70, vol: 0.25 * p + 0.08 }); this.burst(0.15, { type: 'bandpass', f: 900, q: 2, vol: 0.2 * p + 0.05 }); }
  pad() {
    this.tone(320, 0.32, { type: 'sawtooth', to: 1400, vol: 0.09, lp: 3200 });
    this.tone(640, 0.4, { type: 'square', to: 2200, vol: 0.04, lp: 4000, at: 0.03, echo: 0.25 });
    this.burst(0.5, { type: 'bandpass', f: 500, to: 4000, q: 1.5, vol: 0.18 });
  }
  boost() {
    this.burst(0.9, { type: 'bandpass', f: 300, to: 3200, q: 0.9, vol: 0.32, a: 0.05 });
    this.tone(90, 0.8, { type: 'sawtooth', to: 220, vol: 0.14, lp: 900 });
    this.tone(660, 0.35, { type: 'triangle', to: 1320, vol: 0.06, echo: 0.3 });
  }
  perfect() { [0, 4, 7, 12].forEach((s, i) => this.tone(mtof(76 + s), 0.3, { type: 'triangle', vol: 0.09, at: i * 0.06, echo: 0.35 })); this.boost(); }
  driftStart() { this.burst(0.18, { type: 'highpass', f: 3000, q: 0.7, vol: 0.08 }); }
  charge(level) { this.tone(mtof(79 + [0, 4, 7][Math.min(2, level - 1)]), 0.35, { type: 'sine', vol: 0.13, echo: 0.4 }); this.tone(mtof(91 + [0, 4, 7][Math.min(2, level - 1)]), 0.25, { type: 'triangle', vol: 0.05, at: 0.02 }); }
  driftRelease() { this.burst(0.35, { type: 'bandpass', f: 700, to: 2600, q: 1.2, vol: 0.16 }); }
  passBy(pan) { this.burst(0.55, { type: 'bandpass', f: 1600, to: 500, q: 1.4, vol: 0.2, pan, a: 0.08 }); }
  lap(final) {
    const notes = final ? [0, 4, 7, 12] : [0, 7];
    notes.forEach((s, i) => this.tone(mtof(72 + s), 0.35, { type: 'triangle', vol: 0.12, at: i * 0.09, echo: 0.3 }));
  }
  finish(place) {
    const good = place <= 3;
    const seq = good ? [0, 4, 7, 12, 16, 19, 24] : [0, 3, 7, 10, 12];
    seq.forEach((s, i) => this.tone(mtof(64 + s), 0.5, { type: i % 2 ? 'triangle' : 'square', vol: 0.09, at: i * 0.085, lp: 3600, echo: 0.3 }));
    if (good) this.tone(mtof(88), 1.4, { type: 'sine', vol: 0.08, at: 0.6, echo: 0.4 });
  }
  buy() { [0, 7, 12, 19].forEach((s, i) => this.tone(mtof(79 + s), 0.25, { type: 'triangle', vol: 0.1, at: i * 0.05, echo: 0.3 })); }
  denied() { this.tone(200, 0.2, { type: 'square', vol: 0.08, lp: 900 }); this.tone(150, 0.25, { type: 'square', vol: 0.08, lp: 900, at: 0.1 }); }
  ach() { [0, 4, 7, 11, 14].forEach((s, i) => this.tone(mtof(81 + s), 0.4, { type: 'sine', vol: 0.08, at: i * 0.07, echo: 0.35 })); }

  /* ---------- 配乐 ---------- */
  playMusic(song, level) {
    if (!this.ok) { this.pending = [song, level]; return; }
    this.level = level;
    if (this.seq && this.seq.song === song) return;
    this.seq = { song, s: SONGS[song], step: 0, next: this.ctx.currentTime + 0.12 };
    if (!this.timer) this.timer = setInterval(() => this.schedule(), 25);
  }
  setLevel(l) { this.level = l; }
  stopMusic() { this.seq = null; }

  schedule() {
    if (!this.ok || !this.seq || this.ctx.state !== 'running') return;
    const q = this.seq, s = q.s;
    const step = 60 / s.bpm / 4;
    let guard = 0;
    if (q.next < this.ctx.currentTime - 0.2) q.next = this.ctx.currentTime + 0.05;
    while (q.next < this.ctx.currentTime + 0.14 && guard++ < 16) {
      this.playStep(q, q.step, q.next, step);
      q.next += step; q.step++;
    }
  }

  playStep(q, n, t, step) {
    const s = q.s, i = n % 16, bar = Math.floor(n / 16) % 4, L = this.level;
    const chord = s.prog[bar];
    const c = this.ctx;
    if (i === 0) this.padChord(s.root + 12, chord, t, step * 16);
    if (L >= 1 && s.kick[i]) this.kick(t);
    if (L >= 2 && s.snare[i]) this.snare(t);
    if (L >= 1 && s.hat[i]) this.hat(t, L >= 3 && i % 4 === 2 ? 0.16 : 0.04);
    if (L >= 1 && s.bass[i] != null) this.bass(mtof(s.root - 24 + chord[0] + s.bass[i]), t, step * 0.9);
    if (s.arp && s.arp[i] != null && (L !== 1)) {
      const tones = [chord[0], chord[1], chord[2], chord[0] + 12, chord[1] + 12, chord[2] + 12];
      const nn = s.root + 12 + tones[s.arp[i] % tones.length] + (L >= 3 && n % 32 >= 16 ? 12 : 0);
      this.arp(mtof(nn), t, step * 0.8, L === 0 ? 0.035 : 0.05);
    }
    if (L >= 3 && s.lead && s.lead[i] != null) this.lead(mtof(s.root + 12 + chord[0] + s.lead[i]), t, step * 1.8);
  }

  kick(t) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    g.gain.setValueAtTime(0.9, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
    o.connect(g); g.connect(this.music); o.start(t); o.stop(t + 0.35);
  }
  snare(t) {
    const c = this.ctx, s = c.createBufferSource(); s.buffer = this.noise;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1900; f.Q.value = 0.8;
    const g = c.createGain(); g.gain.setValueAtTime(0.42, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    s.connect(f); f.connect(g); g.connect(this.music);
    const sd = c.createGain(); sd.gain.value = 0.18; g.connect(sd); sd.connect(this.delay);
    s.start(t, Math.random()); s.stop(t + 0.22);
    const o = c.createOscillator(); o.type = 'triangle'; o.frequency.setValueAtTime(190, t);
    const g2 = c.createGain(); g2.gain.setValueAtTime(0.2, t); g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
    o.connect(g2); g2.connect(this.music); o.start(t); o.stop(t + 0.12);
  }
  hat(t, len) {
    const c = this.ctx, s = c.createBufferSource(); s.buffer = this.noise;
    const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7500;
    const g = c.createGain(); g.gain.setValueAtTime(0.16, t); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    s.connect(f); f.connect(g); g.connect(this.music); s.start(t, Math.random()); s.stop(t + len + 0.02);
  }
  bass(f, t, dur) {
    const c = this.ctx, o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
    const fl = c.createBiquadFilter(); fl.type = 'lowpass'; fl.Q.value = 6;
    fl.frequency.setValueAtTime(1100, t); fl.frequency.exponentialRampToValueAtTime(180, t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.32, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(fl); fl.connect(g); g.connect(this.music); o.start(t); o.stop(t + dur + 0.02);
  }
  arp(f, t, dur, vol) {
    const c = this.ctx, o = c.createOscillator(); o.type = 'square'; o.frequency.value = f;
    const fl = c.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = 2400;
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(fl); fl.connect(g); g.connect(this.music);
    const d = c.createGain(); d.gain.value = 0.6; g.connect(d); d.connect(this.delay);
    o.start(t); o.stop(t + dur + 0.02);
  }
  lead(f, t, dur) {
    const c = this.ctx;
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.06, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const fl = c.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = 3200;
    for (const det of [-7, 7]) { const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = det; o.connect(fl); o.start(t); o.stop(t + dur + 0.02); }
    fl.connect(g); g.connect(this.music);
    const d = c.createGain(); d.gain.value = 0.5; g.connect(d); d.connect(this.delay);
  }
  padChord(root, chord, t, dur) {
    const c = this.ctx;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.05, t + dur * 0.25);
    g.gain.linearRampToValueAtTime(0.04, t + dur * 0.8);
    g.gain.linearRampToValueAtTime(0.0001, t + dur * 1.05);
    const fl = c.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = 900; fl.Q.value = 0.7;
    fl.connect(g); g.connect(this.music);
    for (const iv of chord) for (const det of [-9, 9]) {
      const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mtof(root + iv); o.detune.value = det;
      o.connect(fl); o.start(t); o.stop(t + dur * 1.08);
    }
  }
}
