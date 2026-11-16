// 沉没之后 · 序章：全部声音都用 WebAudio 现场合成（没有任何音频文件）
const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);

export class Sound {
  constructor() {
    this.ctx = null;
    this.vol = 0.8;
    this.muted = false;
    this.beds = {};
    this.hb = { rate: 0, next: 0, level: 0 };
    this.alarm = { on: false, next: 0 };
    this.voices = [];
  }

  get ready() { return !!this.ctx; }

  start() {
    if (this.ctx) { if (this.ctx.state === "suspended") this.ctx.resume().catch(() => {}); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    let ctx;
    try { ctx = new AC(); } catch { return; }
    this.ctx = ctx;
    const master = ctx.createGain();
    master.gain.value = this.muted ? 0 : this.vol;
    const muffle = ctx.createBiquadFilter();
    muffle.type = "lowpass"; muffle.frequency.value = 18000; muffle.Q.value = 0.4;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 4; comp.attack.value = 0.01; comp.release.value = 0.3;
    master.connect(muffle); muffle.connect(comp); comp.connect(ctx.destination);
    this.master = master; this.muffleF = muffle;
    // 混响
    const rev = ctx.createConvolver();
    rev.buffer = this.impulse(3.2, 2.6);
    const revG = ctx.createGain(); revG.gain.value = 0.55;
    rev.connect(revG); revG.connect(master);
    this.rev = rev;
    // 噪声素材
    this.white = this.noiseBuf("white");
    this.brown = this.noiseBuf("brown");
    this.pink = this.noiseBuf("pink");
    this.buildBeds();
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
  }

  impulse(sec, decay) {
    const ctx = this.ctx, n = Math.floor(ctx.sampleRate * sec);
    const b = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay);
    }
    return b;
  }

  noiseBuf(kind) {
    const ctx = this.ctx, n = ctx.sampleRate * 4;
    const b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0);
    let last = 0, b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < n; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === "brown") { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
      else if (kind === "pink") { b0 = 0.997 * b0 + w * 0.029591; b1 = 0.985 * b1 + w * 0.032534; b2 = 0.95 * b2 + w * 0.048056; d[i] = (b0 + b1 + b2 + w * 0.05) * 1.2; }
      else d[i] = w;
    }
    return b;
  }

  src(buf, loop = true) {
    const s = this.ctx.createBufferSource();
    s.buffer = buf; s.loop = loop;
    if (loop) s.loopStart = 0, s.loopEnd = buf.duration, s.playbackRate.value = 1;
    return s;
  }

  filt(type, f, q = 0.7) { const b = this.ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; }
  gain(v = 0) { const g = this.ctx.createGain(); g.gain.value = v; return g; }

  // 持续的声床：每个都是一条 增益可调 的通道
  buildBeds() {
    const ctx = this.ctx;
    const bed = (name, node, out) => { const g = this.gain(0); out.connect(g); g.connect(this.master); this.beds[name] = { g, node, out }; return g; };

    // 引擎：低沉的棕噪声 + 隐约的高音涡轮
    {
      const n = this.src(this.brown), lp = this.filt("lowpass", 260, 0.6);
      const mix = this.gain(1);
      n.connect(lp); lp.connect(mix);
      const whine = this.src(this.white), bp = this.filt("bandpass", 2600, 6), wg = this.gain(0.035);
      whine.connect(bp); bp.connect(wg); wg.connect(mix);
      const o = ctx.createOscillator(); o.type = "sine"; o.frequency.value = 74; const og = this.gain(0.06); o.connect(og); og.connect(mix);
      n.start(); whine.start(0, 1.3); o.start();
      bed("engine", lp, mix);
      this.engineLP = lp;
    }
    // 颠簸隆隆声
    {
      const n = this.src(this.brown), lp = this.filt("lowpass", 90, 1.2), g = this.gain(1);
      n.connect(lp); lp.connect(g); n.start(0, 2);
      bed("rumble", lp, g);
    }
    // 风（暴风夜）
    {
      const n = this.src(this.pink), bp = this.filt("bandpass", 420, 0.9), g = this.gain(1);
      const lfo = ctx.createOscillator(), lg = this.gain(180); lfo.frequency.value = 0.13; lfo.connect(lg); lg.connect(bp.frequency);
      n.connect(bp); bp.connect(g); n.start(0, 0.7); lfo.start();
      bed("wind", bp, g);
    }
    // 雨
    {
      const n = this.src(this.white), hp = this.filt("highpass", 1400, 0.5), lp = this.filt("lowpass", 7000, 0.5), g = this.gain(1);
      n.connect(hp); hp.connect(lp); lp.connect(g); n.start(0, 1.1);
      bed("rain", lp, g);
    }
    // 海浪（缓慢起伏的冲刷）
    {
      const n = this.src(this.brown), lp = this.filt("lowpass", 520, 0.6), am = this.gain(0.6);
      const lfo = ctx.createOscillator(), lg = this.gain(0.4); lfo.frequency.value = 0.11; lfo.connect(lg); lg.connect(am.gain);
      n.connect(lp); lp.connect(am); n.start(0, 3); lfo.start();
      const n2 = this.src(this.pink), bp = this.filt("bandpass", 900, 0.5), am2 = this.gain(0.25);
      const lfo2 = ctx.createOscillator(), lg2 = this.gain(0.25); lfo2.frequency.value = 0.07; lfo2.connect(lg2); lg2.connect(am2.gain);
      n2.connect(bp); bp.connect(am2); n2.start(0, 1.7); lfo2.start();
      const mix = this.gain(1); am.connect(mix); am2.connect(mix);
      bed("waves", lp, mix);
      this.wavesLP = lp;
    }
    // 耳鸣
    {
      const o1 = ctx.createOscillator(), o2 = ctx.createOscillator();
      o1.frequency.value = 6900; o2.frequency.value = 7040; o1.type = o2.type = "sine";
      const g = this.gain(0.5); o1.connect(g); o2.connect(g); o1.start(); o2.start();
      bed("tinnitus", o1, g);
    }
    // 机舱里的空调气流
    {
      const n = this.src(this.pink), bp = this.filt("bandpass", 1200, 0.4), g = this.gain(0.5);
      n.connect(bp); bp.connect(g); n.start(0, 2.2);
      bed("air", bp, g);
    }
    // 晨间海风（柔和）
    {
      const n = this.src(this.pink), bp = this.filt("bandpass", 700, 0.5), g = this.gain(0.6);
      const lfo = ctx.createOscillator(), lg = this.gain(0.3); lfo.frequency.value = 0.05; lfo.connect(lg); lg.connect(g.gain);
      n.connect(bp); bp.connect(g); n.start(0, 0.4); lfo.start();
      bed("breeze", bp, g);
    }
  }

  // 设置声床音量（带平滑）
  set(name, v, tc = 0.4) {
    const b = this.ctx && this.beds[name];
    if (!b) return;
    b.g.gain.setTargetAtTime(Math.max(0, v), this.ctx.currentTime, tc);
  }
  setNow(name, v) { const b = this.ctx && this.beds[name]; if (b) { b.g.gain.cancelScheduledValues(this.ctx.currentTime); b.g.gain.setValueAtTime(v, this.ctx.currentTime); } }
  silence(tc = 0.6) { for (const k in this.beds) this.set(k, 0, tc); this.heartbeat(0); this.alarmOn(false); }

  muffle(amount, tc = 0.3) {
    if (!this.ctx) return;
    const f = 18000 * Math.pow(1 - clamp(amount) * 0.985, 2.2) + 120;
    this.muffleF.frequency.setTargetAtTime(f, this.ctx.currentTime, tc);
  }
  setEngine(rough) { if (this.engineLP) this.engineLP.frequency.setTargetAtTime(260 + rough * 500, this.ctx.currentTime, 0.3); }

  setVolume(v) { this.vol = clamp(v); this.apply(); }
  setMuted(m) { this.muted = !!m; this.apply(); }
  apply() { if (this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : this.vol, this.ctx.currentTime, 0.05); }
  suspend() { if (this.ctx && this.ctx.state === "running") this.ctx.suspend().catch(() => {}); }
  resume() { if (this.ctx && this.ctx.state === "suspended") this.ctx.resume().catch(() => {}); }

  // ---------- 一次性音效 ----------
  env(g, t, a, peak, d) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); }

  tone(freq, { type = "sine", t = 0, a = 0.01, d = 1, v = 0.2, rev = 0.3, out } = {}) {
    if (!this.ctx) return;
    const ctx = this.ctx, at = ctx.currentTime + t;
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq;
    const g = this.gain(0); this.env(g, at, a, v, d);
    o.connect(g); g.connect(out || this.master);
    if (rev) { const s = this.gain(rev); g.connect(s); s.connect(this.rev); }
    o.start(at); o.stop(at + a + d + 0.1);
    return o;
  }

  burst(buf, { t = 0, a = 0.005, d = 0.3, v = 0.3, type = "bandpass", f = 1000, q = 1, f2 = null, rev = 0.2, rate = 1 } = {}) {
    if (!this.ctx) return;
    const ctx = this.ctx, at = ctx.currentTime + t;
    const s = this.src(buf, false); s.playbackRate.value = rate;
    const fl = this.filt(type, f, q);
    if (f2) fl.frequency.exponentialRampToValueAtTime(f2, at + a + d);
    const g = this.gain(0); this.env(g, at, a, v, d);
    s.connect(fl); fl.connect(g); g.connect(this.master);
    if (rev) { const r = this.gain(rev); g.connect(r); r.connect(this.rev); }
    s.start(at, Math.random() * 2); s.stop(at + a + d + 0.2);
  }

  chime() { // 叮—咚
    this.tone(1318, { v: 0.12, d: 1.6, rev: 0.5 }); this.tone(659, { v: 0.04, d: 1.4, rev: 0.4 });
    this.tone(1046, { t: 0.55, v: 0.12, d: 2.2, rev: 0.5 }); this.tone(523, { t: 0.55, v: 0.04, d: 2, rev: 0.4 });
  }

  // 广播里模糊的人声：带通噪声 + 音节起伏
  murmur(sec = 2.5, { f = 1300, v = 0.07 } = {}) {
    if (!this.ctx) return;
    const ctx = this.ctx, at = ctx.currentTime;
    const s = this.src(this.pink, false), bp = this.filt("bandpass", f, 2.2), bp2 = this.filt("bandpass", f * 2.2, 3);
    const g = this.gain(0), g2 = this.gain(0.4);
    s.connect(bp); bp.connect(g); s.connect(bp2); bp2.connect(g2); g2.connect(g);
    g.connect(this.master); const r = this.gain(0.2); g.connect(r); r.connect(this.rev);
    let t = at + 0.05;
    g.gain.setValueAtTime(0, at);
    while (t < at + sec) {
      const syl = 0.08 + Math.random() * 0.14;
      g.gain.linearRampToValueAtTime(v * (0.5 + Math.random() * 0.5), t + syl * 0.3);
      g.gain.linearRampToValueAtTime(v * 0.08, t + syl);
      bp.frequency.setValueAtTime(f * (0.8 + Math.random() * 0.5), t);
      t += syl + (Math.random() < 0.15 ? 0.18 : 0.02);
    }
    g.gain.linearRampToValueAtTime(0, t + 0.1);
    s.start(at, Math.random()); s.stop(t + 0.3);
  }

  buzz() { // 手机振动
    if (!this.ctx) return;
    for (let i = 0; i < 2; i++) {
      const o = this.tone(165, { type: "square", t: i * 0.28, a: 0.01, d: 0.18, v: 0.035, rev: 0 });
      void o;
    }
  }

  click(v = 0.08) { this.burst(this.white, { d: 0.04, v, f: 3200, q: 2, rev: 0.05 }); }
  shade(up) { this.burst(this.white, { d: 0.35, v: 0.05, f: up ? 900 : 1600, f2: up ? 2400 : 600, q: 3, rev: 0.1 }); this.click(0.06); }

  thunder(near = 0.5) {
    if (!this.ctx) return;
    const d = 2.5 + near * 3, delay = (1 - near) * 1.4;
    this.burst(this.brown, { t: delay, a: 0.02 + (1 - near) * 0.3, d, v: 0.5 + near * 0.6, type: "lowpass", f: 600 + near * 2400, f2: 80, q: 0.5, rev: 0.6 });
    if (near > 0.5) this.burst(this.white, { t: delay, a: 0.003, d: 0.4, v: 0.25 * near, type: "highpass", f: 1500, q: 0.4, rev: 0.4 });
    for (let i = 0; i < 4; i++) this.burst(this.brown, { t: delay + 0.4 + Math.random() * d * 0.6, a: 0.1, d: 0.8, v: 0.25 * near + 0.1, type: "lowpass", f: 300, f2: 60, rev: 0.5 });
  }

  impact(v = 1) { // 巨大的撞击
    if (!this.ctx) return;
    this.burst(this.brown, { a: 0.005, d: 2.5, v: 1.2 * v, type: "lowpass", f: 1800, f2: 40, q: 0.6, rev: 0.5 });
    this.burst(this.white, { a: 0.002, d: 0.6, v: 0.5 * v, type: "bandpass", f: 2500, f2: 300, q: 0.8, rev: 0.4 });
    this.tone(48, { a: 0.005, d: 1.5, v: 0.6 * v, rev: 0.2 });
  }

  creak() { // 金属呻吟
    if (!this.ctx) return;
    const ctx = this.ctx, at = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = "sawtooth"; o.frequency.setValueAtTime(70 + Math.random() * 40, at);
    o.frequency.linearRampToValueAtTime(40 + Math.random() * 60, at + 1.2);
    const bp = this.filt("bandpass", 600, 8); bp.frequency.linearRampToValueAtTime(300 + Math.random() * 600, at + 1.2);
    const g = this.gain(0); this.env(g, at, 0.2, 0.08, 1.1);
    o.connect(bp); bp.connect(g); g.connect(this.master); const r = this.gain(0.3); g.connect(r); r.connect(this.rev);
    o.start(at); o.stop(at + 1.5);
  }

  // 人群惊呼（只用滤波噪声暗示，不写实）
  gasp(v = 0.25) {
    if (!this.ctx) return;
    for (let i = 0; i < 5; i++) {
      const f = 600 + Math.random() * 900;
      this.burst(this.pink, { t: Math.random() * 0.4, a: 0.05, d: 0.5 + Math.random() * 0.5, v: v * (0.4 + Math.random() * 0.6), f, f2: f * 1.4, q: 4, rev: 0.5 });
    }
  }

  masks() { for (let i = 0; i < 9; i++) this.burst(this.white, { t: i * 0.04 + Math.random() * 0.1, d: 0.06, v: 0.12, f: 2000 + Math.random() * 2500, q: 3, rev: 0.25 }); }

  alarmOn(on) { this.alarm.on = on; }
  heartbeat(rate, level = 0.5) { this.hb.rate = rate; this.hb.level = level; }

  splash(power = 0.5) {
    this.burst(this.white, { a: 0.01, d: 0.35 + power * 0.3, v: 0.12 + power * 0.25, type: "bandpass", f: 1800, f2: 700, q: 0.7, rev: 0.15 });
    this.burst(this.brown, { a: 0.02, d: 0.5, v: 0.2 * power, type: "lowpass", f: 500, f2: 120, rev: 0.1 });
  }
  breath(v = 0.1) { this.burst(this.pink, { a: 0.15, d: 0.5, v, f: 900, f2: 1600, q: 1.2, rev: 0.05 }); }
  bubbles() { for (let i = 0; i < 12; i++) this.tone(300 + Math.random() * 500, { t: Math.random() * 1.6, a: 0.01, d: 0.08, v: 0.05, rev: 0.2 }); }

  // 结尾的钢琴动机（柔和的正弦/三角波叠加）
  piano(midi, t = 0, v = 0.12, len = 3) {
    if (!this.ctx) return;
    const f = 440 * Math.pow(2, (midi - 69) / 12);
    this.tone(f, { type: "triangle", t, a: 0.006, d: len, v, rev: 0.6 });
    this.tone(f * 2, { type: "sine", t, a: 0.004, d: len * 0.5, v: v * 0.35, rev: 0.5 });
    this.tone(f * 3.01, { type: "sine", t, a: 0.003, d: len * 0.25, v: v * 0.12, rev: 0.4 });
  }
  motif(t0 = 0) {
    // 左手：A小调 → F → C → G 的分解和弦；右手：一句温柔的旋律
    const L = [[45, 52, 57, 60], [41, 48, 53, 57], [48, 55, 60, 64], [43, 50, 55, 59], [45, 52, 57, 64]];
    L.forEach((ch, i) => ch.forEach((m, j) => this.piano(m, t0 + i * 2.4 + j * 0.3, 0.07, 3.2)));
    const R = [[76, 0.6], [74, 1.2], [72, 1.8], [69, 2.4], [72, 3.6], [74, 4.2], [76, 4.8], [79, 6.0], [77, 7.2], [76, 7.8], [74, 8.4], [72, 9.6], [69, 10.8]];
    R.forEach(([m, t]) => this.piano(m, t0 + t, 0.1, 3.5));
  }
  gull(t0 = 0) { // 海鸥：几声下滑的鸣叫
    if (!this.ctx) return;
    for (let i = 0; i < 3; i++) {
      const ctx = this.ctx, at = ctx.currentTime + t0 + i * 0.32 + Math.random() * 0.1;
      const o = ctx.createOscillator(); o.type = "sawtooth";
      const f0 = 1500 + Math.random() * 300;
      o.frequency.setValueAtTime(f0, at); o.frequency.exponentialRampToValueAtTime(f0 * 0.62, at + 0.26);
      const bp = this.filt("bandpass", 1800, 3), g = this.gain(0); this.env(g, at, 0.03, 0.025, 0.25);
      o.connect(bp); bp.connect(g); g.connect(this.master); const r = this.gain(0.4); g.connect(r); r.connect(this.rev);
      o.start(at); o.stop(at + 0.35);
    }
  }
  bark(n = 3) { // 小狗叫：短促的带通锯齿
    if (!this.ctx) return;
    for (let i = 0; i < n; i++) {
      const ctx = this.ctx, at = ctx.currentTime + i * 0.32 + Math.random() * 0.05;
      const o = ctx.createOscillator(); o.type = "sawtooth"; o.frequency.setValueAtTime(520, at); o.frequency.exponentialRampToValueAtTime(330, at + 0.12);
      const bp = this.filt("bandpass", 900, 2), g = this.gain(0); this.env(g, at, 0.01, 0.06, 0.13);
      o.connect(bp); bp.connect(g); g.connect(this.master); const r = this.gain(0.5); g.connect(r); r.connect(this.rev);
      o.start(at); o.stop(at + 0.2);
    }
  }
  heli(sec = 14) { // 远处的直升机：低频的旋翼拍打声，慢慢来，又慢慢远去
    if (!this.ctx) return;
    const ctx = this.ctx, at = ctx.currentTime;
    const n = this.src(this.brown, true), lp = this.filt("lowpass", 260, 0.8), am = this.gain(0.5);
    const lfo = ctx.createOscillator(); lfo.type = "square"; lfo.frequency.value = 13; const lg = this.gain(0.5); lfo.connect(lg); lg.connect(am.gain);
    const out = this.gain(0);
    n.connect(lp); lp.connect(am); am.connect(out); out.connect(this.master); const r = this.gain(0.6); out.connect(r); r.connect(this.rev);
    out.gain.setValueAtTime(0, at); out.gain.linearRampToValueAtTime(0.22, at + sec * 0.4); out.gain.linearRampToValueAtTime(0, at + sec);
    lfo.frequency.linearRampToValueAtTime(11, at + sec);
    n.start(at); lfo.start(at); n.stop(at + sec + 0.2); lfo.stop(at + sec + 0.2);
  }
  softPad(on) { this.set("breeze", on ? 0.5 : 0, 2); }

  // 每帧调度：心跳、警报
  tick() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (this.hb.rate > 0) {
      if (this.hb.next < now) this.hb.next = now + 0.05;
      if (this.hb.next < now + 0.1) {
        const t = this.hb.next - now, v = this.hb.level;
        this.thump(t, v); this.thump(t + 0.24, v * 0.7);
        this.hb.next += 60 / this.hb.rate;
      }
    }
    if (this.alarm.on) {
      if (this.alarm.next < now) this.alarm.next = now + 0.02;
      if (this.alarm.next < now + 0.1) {
        const t = this.alarm.next - now;
        this.tone(880, { type: "square", t, a: 0.005, d: 0.22, v: 0.035, rev: 0.15 });
        this.tone(660, { type: "square", t: t + 0.3, a: 0.005, d: 0.22, v: 0.035, rev: 0.15 });
        this.alarm.next += 0.75;
      }
    }
  }
  thump(t, v) {
    const ctx = this.ctx, at = ctx.currentTime + t;
    const o = ctx.createOscillator(); o.type = "sine";
    o.frequency.setValueAtTime(70, at); o.frequency.exponentialRampToValueAtTime(38, at + 0.14);
    const g = this.gain(0); this.env(g, at, 0.012, v, 0.18);
    o.connect(g); g.connect(this.master); o.start(at); o.stop(at + 0.3);
  }
}
