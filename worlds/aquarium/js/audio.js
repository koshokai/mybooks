// 全合成音效：水流底噪、气泡咕嘟、敲玻璃、撒饲料、擦玻璃、换水、购买提示
let ctx = null, master = null, amb = null, bubbleTimer = 0, muted = false, night = 0;

function noiseBuf(sec, brown) {
  const b = ctx.createBuffer(1, ctx.sampleRate * sec, ctx.sampleRate), d = b.getChannelData(0);
  let last = 0;
  for (let i = 0; i < d.length; i++) {
    const w = Math.random() * 2 - 1;
    if (brown) { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w;
  }
  return b;
}

export const audio = {
  get on() { return !!ctx && !muted; },
  setMuted(m) {
    muted = m;
    if (!ctx) return;
    master.gain.setTargetAtTime(m ? 0 : 0.9, ctx.currentTime, 0.3);
    if (!m && ctx.state === "suspended") ctx.resume();
  },
  start() {
    if (ctx || muted) return;
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
    master = ctx.createGain(); master.gain.value = 0; master.connect(ctx.destination);
    master.gain.setTargetAtTime(0.9, ctx.currentTime, 1.5);
    // 低沉的水声
    const src = ctx.createBufferSource(); src.buffer = noiseBuf(6, true); src.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 420; lp.Q.value = 0.4;
    amb = ctx.createGain(); amb.gain.value = 0.16;
    src.connect(lp).connect(amb).connect(master); src.start();
    const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 0.07; lg.gain.value = 140;
    lfo.connect(lg).connect(lp.frequency); lfo.start();
    // 气泡石的细碎咕嘟声
    const s2 = ctx.createBufferSource(); s2.buffer = noiseBuf(4, false); s2.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 1700; bp.Q.value = 1.2;
    const g2 = ctx.createGain(); g2.gain.value = 0.0;
    s2.connect(bp).connect(g2).connect(master); s2.start();
    this._trickle = g2; this._bp = bp;
    if (ctx.state === "suspended") ctx.resume();
  },
  setNight(n) { night = n; },
  /** 每帧调用，随机安排气泡声 */
  tick(dt) {
    if (!ctx || muted) return;
    bubbleTimer -= dt;
    const t = ctx.currentTime;
    if (this._trickle) {
      const v = (0.012 + 0.012 * Math.random()) * (1 - night * 0.5);
      this._trickle.gain.setTargetAtTime(v, t, 0.08);
      this._bp.frequency.setTargetAtTime(1300 + Math.random() * 900, t, 0.1);
    }
    if (bubbleTimer <= 0) {
      bubbleTimer = 0.12 + Math.random() * (0.6 + night);
      this.blip(0.018 + Math.random() * 0.025, 300 + Math.random() * 700);
    }
  },
  blip(vol, f0) {
    if (!ctx || muted) return;
    const t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = "sine"; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f0 * (1.8 + Math.random()), t + 0.07);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
    o.connect(g).connect(master); o.start(t); o.stop(t + 0.12);
  },
  noise(dur, freq, q, vol, type = "bandpass", attack = 0.005) {
    if (!ctx || muted) return;
    const t = ctx.currentTime, s = ctx.createBufferSource(); s.buffer = noiseBuf(Math.max(0.05, dur), false);
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(master); s.start(t); s.stop(t + dur + 0.05);
    return f;
  },
  tone(f, dur, vol, type = "sine", when = 0) {
    if (!ctx || muted) return;
    const t = ctx.currentTime + when, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = f;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(master); o.start(t); o.stop(t + dur + 0.05);
  },
  tap() {
    if (!ctx || muted) return;
    const t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(240, t); o.frequency.exponentialRampToValueAtTime(90, t + 0.12);
    g.gain.setValueAtTime(0.35, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    o.connect(g).connect(master); o.start(t); o.stop(t + 0.2);
    this.noise(0.05, 3200, 2, 0.08);
  },
  sprinkle() {
    for (let i = 0; i < 6; i++) setTimeout(() => this.noise(0.03, 5000 + Math.random() * 3000, 4, 0.05), i * 40 + Math.random() * 30);
    setTimeout(() => this.blip(0.06, 500), 120);
  },
  wipe() { const f = this.noise(0.22, 900 + Math.random() * 500, 0.8, 0.05, "bandpass", 0.06); if (f) f.frequency.exponentialRampToValueAtTime(2400, ctx.currentTime + 0.2); },
  pour() {
    if (!ctx || muted) return;
    const t = ctx.currentTime, s = ctx.createBufferSource(); s.buffer = noiseBuf(3.6, false);
    const f = ctx.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = 700; f.Q.value = 0.6;
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.18, t + 0.4); g.gain.linearRampToValueAtTime(0.14, t + 2.6); g.gain.exponentialRampToValueAtTime(0.0001, t + 3.5);
    f.frequency.linearRampToValueAtTime(1300, t + 3.2);
    s.connect(f).connect(g).connect(master); s.start(t); s.stop(t + 3.6);
    for (let i = 0; i < 18; i++) setTimeout(() => this.blip(0.04, 250 + Math.random() * 500), 200 + Math.random() * 3000);
  },
  chime() { [0, 4, 7, 12].forEach((n, i) => this.tone(659 * Math.pow(2, n / 12), 0.9, 0.07, "sine", i * 0.08)); },
  snip() { this.noise(0.04, 6000, 3, 0.1); setTimeout(() => this.noise(0.04, 7000, 3, 0.08), 70); },
  click() { this.tone(880, 0.08, 0.04, "triangle"); },
  place() { this.tone(220, 0.25, 0.12, "sine"); this.noise(0.15, 400, 0.7, 0.08, "lowpass"); },
};
