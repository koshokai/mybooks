/* =========================================================
   影 · 暗域 —— 声音：全部由 WebAudio 实时合成
   环境底噪、心跳、空间化脚步、提灯电流声、追逐配乐、校准拍频……
   ========================================================= */
(function () {
  'use strict';
  const U = window.Umbra;
  const clamp = U.clamp;

  const A = (U.Audio = {
    ctx: null, ready: false, muted: false,
    lx: 0, ly: 0, losFn: null,
    beatPulse: 0, nextBeat: 0, danger: 0,
    chase: 0, chaseTarget: 0, seqT: 0, seqStep: 0,
    nextAmb: 0, nextCall: 0, nextBreath: 0,
  });

  A.init = function () {
    if (A.ctx) {
      if (A.ctx.state === 'suspended') A.ctx.resume().catch(() => {});
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    let c;
    try { c = A.ctx = new AC(); } catch (e) { return; }
    A.master = c.createGain();
    A.master.gain.value = A.muted ? 0 : 0.85;
    A.muffle = c.createBiquadFilter();
    A.muffle.type = 'lowpass';
    A.muffle.frequency.value = 20000;
    A.comp = c.createDynamicsCompressor();
    A.comp.threshold.value = -16;
    A.comp.knee.value = 10;
    A.comp.ratio.value = 4;
    A.comp.attack.value = 0.004;
    A.comp.release.value = 0.25;
    A.master.connect(A.muffle);
    A.muffle.connect(A.comp);
    A.comp.connect(c.destination);
    A.sfx = c.createGain(); A.sfx.gain.value = 1; A.sfx.connect(A.master);
    A.amb = c.createGain(); A.amb.gain.value = 0; A.amb.connect(A.master);
    A.mus = c.createGain(); A.mus.gain.value = 0; A.mus.connect(A.master);
    // 金属舱室混响
    A.verb = c.createConvolver();
    A.verb.buffer = makeIR(c, 2.6, 2.4);
    A.verbIn = c.createGain(); A.verbIn.gain.value = 1;
    A.verbOut = c.createGain(); A.verbOut.gain.value = 0.42;
    A.verbIn.connect(A.verb); A.verb.connect(A.verbOut); A.verbOut.connect(A.master);
    // 噪声
    A.white = makeNoise(c, 2, 'white');
    A.brown = makeNoise(c, 4, 'brown');
    startAmbience();
    startLoops();
    A.ready = true;
  };

  function makeNoise(c, sec, kind) {
    const n = Math.floor(c.sampleRate * sec);
    const b = c.createBuffer(1, n, c.sampleRate);
    const d = b.getChannelData(0);
    let last = 0;
    for (let i = 0; i < n; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === 'brown') { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
      else d[i] = w;
    }
    return b;
  }
  function makeIR(c, sec, decay) {
    const n = Math.floor(c.sampleRate * sec);
    const b = c.createBuffer(2, n, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      for (let i = 0; i < n; i++) {
        const t = i / n;
        // 金属感：带一点梳状起伏
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay) * (0.75 + 0.25 * Math.sin(i * 0.013 + ch));
      }
    }
    return b;
  }

  A.setMuted = function (m) {
    A.muted = !!m;
    if (A.master) A.master.gain.setTargetAtTime(A.muted ? 0 : 0.85, A.ctx.currentTime, 0.05);
  };
  A.suspend = function () { if (A.ctx && A.ctx.state === 'running') A.ctx.suspend().catch(() => {}); };
  A.resume = function () { if (A.ctx && A.ctx.state === 'suspended') A.ctx.resume().catch(() => {}); };
  A.setAmbience = function (v, tc) { if (A.ready) A.amb.gain.setTargetAtTime(v, A.ctx.currentTime, tc || 0.6); };

  /* ---------------- 构件 ---------------- */
  function now() { return A.ctx.currentTime; }
  function spatial(x, y, ref) {
    const dx = x - A.lx, dy = y - A.ly, d = Math.hypot(dx, dy);
    const gain = 1 / (1 + (d * d) / (ref || 30));
    const pan = clamp(dx / 7, -0.85, 0.85);
    let muffle = 0;
    if (A.losFn && d > 1.2 && !A.losFn(x, y)) muffle = 650;
    return { gain, pan, muffle, d };
  }
  // 输出链：返回输入节点
  function out(vol, o) {
    const c = A.ctx;
    o = o || {};
    const g = c.createGain();
    let v = vol, head = g;
    if (o.x != null) {
      const sp = spatial(o.x, o.y, o.ref);
      v *= sp.gain;
      if (sp.muffle) {
        const lp = c.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = sp.muffle;
        head.connect(lp);
        head = lp;
      }
      if (c.createStereoPanner) {
        const pn = c.createStereoPanner();
        pn.pan.value = sp.pan;
        head.connect(pn);
        head = pn;
      }
    }
    g.gain.value = v;
    head.connect(o.bus || A.sfx);
    if (o.verb) {
      const s = c.createGain();
      s.gain.value = o.verb;
      head.connect(s);
      s.connect(A.verbIn);
    }
    return g;
  }
  function env(param, t, a, hold, d, peak) {
    param.setValueAtTime(0.0001, t);
    param.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
    if (hold > 0) param.setValueAtTime(Math.max(0.0002, peak), t + a + hold);
    param.exponentialRampToValueAtTime(0.0001, t + a + hold + d);
  }
  function tone(type, f0, f1, t, dur, peak, dest, a, fdur) {
    const c = A.ctx;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 != null && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + (fdur || dur));
    const g = c.createGain();
    env(g.gain, t, a || 0.005, 0, dur, peak);
    o.connect(g);
    g.connect(dest);
    o.start(t);
    o.stop(t + (a || 0.005) + dur + 0.05);
    return o;
  }
  function noise(buf, t, dur, peak, dest, filt, a) {
    const c = A.ctx;
    const s = c.createBufferSource();
    s.buffer = buf || A.white;
    const g = c.createGain();
    env(g.gain, t, a || 0.003, 0, dur, peak);
    let head = s;
    if (filt) {
      const f = c.createBiquadFilter();
      f.type = filt.type || 'bandpass';
      f.frequency.setValueAtTime(filt.f, t);
      if (filt.f1) f.frequency.exponentialRampToValueAtTime(filt.f1, t + (filt.fd || dur));
      f.Q.value = filt.q || 1;
      head.connect(f);
      head = f;
    }
    head.connect(g);
    g.connect(dest);
    const off = Math.random() * Math.max(0, s.buffer.duration - dur - 0.1);
    s.start(t, off);
    s.stop(t + (a || 0.003) + dur + 0.05);
    return s;
  }

  /* ---------------- 环境 ---------------- */
  function startAmbience() {
    const c = A.ctx, t = now();
    // 空气循环的低频隆隆
    const b = c.createBufferSource();
    b.buffer = A.brown; b.loop = true;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 170;
    const g = c.createGain(); g.gain.value = 0.32;
    b.connect(lp); lp.connect(g); g.connect(A.amb);
    b.start(t);
    // 通风嘶声
    const w = c.createBufferSource();
    w.buffer = A.white; w.loop = true;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2600; bp.Q.value = 0.6;
    const g2 = c.createGain(); g2.gain.value = 0.012;
    w.connect(bp); bp.connect(g2); g2.connect(A.amb);
    w.start(t);
    // 电网嗡鸣，带缓慢起伏
    [[49.5, 0.03], [99.6, 0.014], [148.2, 0.006]].forEach(([f, v], i) => {
      const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = f;
      const og = c.createGain(); og.gain.value = v;
      const lfo = c.createOscillator(); lfo.frequency.value = 0.07 + i * 0.05;
      const lg = c.createGain(); lg.gain.value = v * 0.6;
      lfo.connect(lg); lg.connect(og.gain);
      o.connect(og); og.connect(A.amb);
      o.start(t); lfo.start(t);
    });
  }
  function startLoops() {
    const c = A.ctx, t = now();
    // 守夜者提灯的电流声（持续，按距离调音量）
    A.buzzG = c.createGain(); A.buzzG.gain.value = 0;
    A.buzzLP = c.createBiquadFilter(); A.buzzLP.type = 'lowpass'; A.buzzLP.frequency.value = 2400;
    A.buzzPan = c.createStereoPanner ? c.createStereoPanner() : null;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 760; bp.Q.value = 3;
    const o1 = c.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 98;
    const o2 = c.createOscillator(); o2.type = 'square'; o2.frequency.value = 147.3;
    const trem = c.createOscillator(); trem.frequency.value = 7.3;
    const tg = c.createGain(); tg.gain.value = 0.35;
    const vca = c.createGain(); vca.gain.value = 0.65;
    trem.connect(tg); tg.connect(vca.gain);
    o1.connect(bp); o2.connect(bp); bp.connect(vca); vca.connect(A.buzzLP); A.buzzLP.connect(A.buzzG);
    if (A.buzzPan) { A.buzzG.connect(A.buzzPan); A.buzzPan.connect(A.sfx); } else A.buzzG.connect(A.sfx);
    o1.start(t); o2.start(t); trem.start(t);
    // 信标修复嗡声
    A.humO = c.createOscillator(); A.humO.type = 'triangle'; A.humO.frequency.value = 110;
    A.humO2 = c.createOscillator(); A.humO2.type = 'sine'; A.humO2.frequency.value = 220;
    A.humG = c.createGain(); A.humG.gain.value = 0;
    const hg2 = c.createGain(); hg2.gain.value = 0.5;
    A.humO.connect(A.humG); A.humO2.connect(hg2); hg2.connect(A.humG); A.humG.connect(A.sfx);
    A.humO.start(t); A.humO2.start(t);
    // 相位校准：两道正弦的拍频
    A.calO1 = c.createOscillator(); A.calO1.type = 'sine'; A.calO1.frequency.value = 523.25;
    A.calO2 = c.createOscillator(); A.calO2.type = 'sine'; A.calO2.frequency.value = 523.25;
    A.calO3 = c.createOscillator(); A.calO3.type = 'sine'; A.calO3.frequency.value = 1046.5;
    A.calG = c.createGain(); A.calG.gain.value = 0;
    A.calG3 = c.createGain(); A.calG3.gain.value = 0;
    A.calO1.connect(A.calG); A.calO2.connect(A.calG); A.calO3.connect(A.calG3); A.calG3.connect(A.calG); A.calG.connect(A.sfx);
    A.calO1.start(t); A.calO2.start(t); A.calO3.start(t);
    // 追逐配乐的持续高音
    A.droneG = c.createGain(); A.droneG.gain.value = 0;
    const dl = c.createBiquadFilter(); dl.type = 'lowpass'; dl.frequency.value = 2200;
    [587.3, 622.3, 880].forEach((f, i) => {
      const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = (i - 1) * 7;
      const og = c.createGain(); og.gain.value = i === 2 ? 0.25 : 0.5;
      o.connect(og); og.connect(dl); o.start(t);
    });
    const tr = c.createOscillator(); tr.frequency.value = 11;
    const trg = c.createGain(); trg.gain.value = 0.5;
    const dv = c.createGain(); dv.gain.value = 0.5;
    tr.connect(trg); trg.connect(dv.gain);
    dl.connect(dv); dv.connect(A.droneG); A.droneG.connect(A.mus);
    tr.start(t);
  }

  /* ---------------- 一次性音效 ---------------- */
  const S = {};
  S.ui = () => { const t = now(); tone('sine', 900, 1300, t, 0.08, 0.06, out(1)); };
  S.uiBack = () => { const t = now(); tone('sine', 700, 480, t, 0.1, 0.05, out(1)); };
  S.torch = () => { const t = now(); noise(A.white, t, 0.025, 0.25, out(0.5), { type: 'highpass', f: 3500 }); tone('square', 2400, 1800, t, 0.015, 0.03, out(0.5)); };
  S.step = o => {
    const t = now(), r = 0.85 + Math.random() * 0.3;
    const loud = o && o.sprint;
    const dst = out(loud ? 0.5 : 0.24, { verb: 0.15 });
    noise(A.white, t, 0.045, 0.6, dst, { f: 1700 * r, q: 1.3 });
    tone('sine', 140 * r, 60, t, 0.06, 0.5, dst);
    noise(A.white, t, 0.08, 0.12, dst, { f: 2900 * r, q: 14 });
  };
  S.wstep = o => {
    const t = now();
    const dst = out(o.chase ? 1.0 : 0.8, { x: o.x, y: o.y, ref: 46, verb: 0.35 });
    tone('sine', 58, 30, t, 0.32, 0.9, dst);
    noise(A.brown, t, 0.16, 0.7, dst, { type: 'lowpass', f: 380 });
    noise(A.white, t + 0.05, 0.3, 0.08, dst, { f: 1100, f1: 500, q: 2 }, 0.06);
    if (Math.random() < 0.45) {
      // 提灯晃动的叮当声
      tone('sine', 3300 + Math.random() * 300, null, t + 0.06, 0.18, 0.025, dst);
      tone('sine', 4150 + Math.random() * 300, null, t + 0.1, 0.14, 0.018, dst);
    }
  };
  S.door = o => {
    const t = now();
    const dst = out(0.45, { x: o.d.x, y: o.d.y, ref: 30, verb: 0.25 });
    if (o.open) {
      noise(A.white, t, 0.32, 0.4, dst, { f: 2600, f1: 1500, q: 1 }, 0.02);
      tone('sine', 220, 340, t, 0.26, 0.06, dst);
    } else {
      noise(A.white, t, 0.28, 0.3, dst, { f: 1500, f1: 2600, q: 1 }, 0.02);
      tone('sine', 120, 70, t + 0.26, 0.12, 0.25, dst);
    }
  };
  S.locker = o => {
    const t = now();
    const dst = out(0.55, { x: o.L.cx, y: o.L.cy, ref: 30, verb: 0.3 });
    noise(A.white, t, 0.07, 0.6, dst, { f: 1200, q: 4 });
    noise(A.white, t + 0.02, 0.35, 0.2, dst, { f: 640, q: 22 });
    noise(A.white, t + 0.14, 0.03, 0.5, dst, { type: 'highpass', f: 3000 });
  };
  S.vent = o => {
    const t = now();
    const dst = out(0.5, { verb: 0.4 });
    for (let k = 0; k < 7; k++) noise(A.white, t + k * 0.17 + Math.random() * 0.05, 0.06, 0.4, dst, { f: 700 + Math.random() * 500, q: 6 });
    noise(A.brown, t, 1.2, 0.2, dst, { type: 'lowpass', f: 300 }, 0.2);
  };
  S.ventOut = o => {
    const t = now();
    const dst = out(0.6, { x: o.V.x, y: o.V.y, verb: 0.35 });
    for (let k = 0; k < 4; k++) noise(A.white, t + k * 0.06, 0.05, 0.5, dst, { f: 900 + k * 200, q: 5 });
  };
  S.calibStart = () => {
    const t = now();
    tone('square', 1320, null, t, 0.05, 0.05, out(0.8));
    tone('square', 1320, null, t + 0.11, 0.05, 0.05, out(0.8));
  };
  S.calibOk = () => {
    const t = now();
    const d = out(0.7, { verb: 0.3 });
    tone('sine', 1046.5, null, t, 0.6, 0.18, d);
    tone('sine', 1568, null, t + 0.04, 0.5, 0.12, d);
    tone('sine', 784, null, t + 0.08, 0.7, 0.08, d);
  };
  S.spark = o => {
    const t = now();
    const r = o.relay;
    const d = out(1.1, { x: r.x, y: r.y, ref: 40, verb: 0.5 });
    noise(A.white, t, 0.35, 0.9, d, { type: 'highpass', f: 1400 });
    for (let k = 0; k < 14; k++) noise(A.white, t + Math.random() * 0.45, 0.012, 0.9, d, { type: 'highpass', f: 2500 });
    tone('sawtooth', 900, 70, t, 0.3, 0.3, d);
    tone('sine', 60, 35, t, 0.4, 0.6, d);
  };
  S.relayDone = o => {
    const t = now();
    const d = out(0.8, { verb: 0.6 });
    [220, 330, 415.3, 554.4, 659.3].forEach((f, i) => tone(i % 2 ? 'sine' : 'triangle', f, null, t + i * 0.06, 2.2, 0.09, d, 0.04));
    tone('sine', 1760, null, t + 0.3, 1.4, 0.03, d, 0.2);
  };
  S.podUnlock = () => {
    const t = now();
    const d = out(0.7, { verb: 0.5 });
    for (let k = 0; k < 4; k++) {
      tone('triangle', 660, null, t + k * 0.8, 0.36, 0.12, d, 0.02);
      tone('triangle', 880, null, t + k * 0.8 + 0.4, 0.36, 0.12, d, 0.02);
    }
    tone('sawtooth', 40, 120, t, 1.8, 0.12, d, 0.4, 1.8);
  };
  S.notice = () => {
    const t = now();
    const d = out(0.9, { verb: 0.5 });
    const c = A.ctx;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.setValueAtTime(300, t); lp.frequency.exponentialRampToValueAtTime(3200, t + 0.08); lp.frequency.exponentialRampToValueAtTime(700, t + 0.7);
    lp.connect(d);
    [146.8, 207.7, 293.7 * 1.009, 311.1].forEach(f => tone('sawtooth', f, null, t, 0.9, 0.12, lp, 0.01));
    tone('sine', 55, 32, t, 1.2, 0.8, d);
    noise(A.white, t, 0.5, 0.25, d, { type: 'highpass', f: 5000 });
  };
  S.windup = o => {
    const t = now();
    const c = A.ctx;
    const d = out(0.6, { x: o.x, y: o.y, ref: 40, verb: 0.4 });
    const ws = c.createWaveShaper();
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) { const x = (i / 128) - 1; curve[i] = Math.tanh(x * 4); }
    ws.curve = curve;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 5;
    bp.frequency.setValueAtTime(500, t); bp.frequency.exponentialRampToValueAtTime(2200, t + 0.38);
    ws.connect(bp); bp.connect(d);
    tone('sawtooth', 260, 980, t, 0.42, 0.5, ws, 0.03);
    tone('sawtooth', 275, 1040, t, 0.42, 0.4, ws, 0.03);
  };
  S.lunge = o => {
    const t = now();
    noise(A.white, t, 0.22, 0.6, out(0.6, { x: o.x, y: o.y, ref: 40 }), { f: 400, f1: 2400, q: 1.2 }, 0.02);
  };
  S.lungeMiss = () => { const t = now(); tone('sine', 90, 50, t, 0.2, 0.3, out(0.4)); };
  S.hit = () => {
    const t = now();
    const d = out(1, { verb: 0.5 });
    tone('sine', 75, 28, t, 0.55, 1, d);
    noise(A.white, t, 0.16, 0.9, d, { type: 'highpass', f: 2800 });
    for (let k = 0; k < 8; k++) noise(A.white, t + 0.02 + Math.random() * 0.2, 0.01, 0.7, d, { type: 'highpass', f: 4000 });
    tone('sine', 3400, null, t + 0.1, 2.6, 0.03, out(0.6), 0.05);
    // 耳鸣：短暂闷住
    A.muffle.frequency.cancelScheduledValues(t);
    A.muffle.frequency.setValueAtTime(700, t);
    A.muffle.frequency.exponentialRampToValueAtTime(20000, t + 2.2);
  };
  S.caught = () => {
    const t = now();
    const d = out(1, { verb: 0.7 });
    tone('sine', 60, 25, t, 2.2, 1, d, 0.02);
    [110, 116.5, 164.8, 174.6].forEach(f => tone('sawtooth', f, f * 0.94, t, 2.2, 0.08, d, 0.5, 2.2));
    noise(A.white, t + 1.2, 1.0, 0.3, d, { type: 'highpass', f: 3000 }, 0.6);
    A.muffle.frequency.cancelScheduledValues(t);
    A.muffle.frequency.setValueAtTime(20000, t);
    A.muffle.frequency.exponentialRampToValueAtTime(400, t + 2.2);
    A.muffle.frequency.setValueAtTime(400, t + 2.6);
    A.muffle.frequency.exponentialRampToValueAtTime(20000, t + 3.4);
  };
  S.win = () => {
    const t = now();
    const d = out(0.9, { verb: 0.5 });
    noise(A.brown, t, 2.6, 0.9, d, { type: 'lowpass', f: 90, f1: 1400, fd: 2.4, q: 1 }, 0.4);
    [261.6, 329.6, 392, 523.3].forEach((f, i) => tone('triangle', f, f * 1.5, t + 0.3, 2.4, 0.06, d, 0.6, 2.4));
    [1046.5, 1318.5, 1568].forEach((f, i) => tone('sine', f, null, t + 2.2 + i * 0.09, 1.8, 0.06, d, 0.02));
  };
  S.flareThrow = () => { const t = now(); noise(A.white, t, 0.2, 0.3, out(0.5), { f: 900, f1: 2000, q: 1 }, 0.02); };
  S.flareIgnite = o => {
    const t = now();
    const d = out(0.8, { x: o.f.x, y: o.f.y, verb: 0.4 });
    noise(A.white, t, 0.5, 0.8, d, { f: 1800, f1: 600, q: 0.7 }, 0.01);
    tone('sine', 120, 50, t, 0.3, 0.4, d);
  };
  S.stun = o => {
    const t = now();
    const w = A.wardenPos || { x: A.lx, y: A.ly };
    const d = out(0.7, { x: w.x, y: w.y, ref: 40, verb: 0.5 });
    const o1 = tone('sawtooth', 1100, 260, t, 0.9, 0.25, d, 0.02);
    const lfo = A.ctx.createOscillator(); lfo.frequency.value = 23;
    const lg = A.ctx.createGain(); lg.gain.value = 60;
    lfo.connect(lg); lg.connect(o1.frequency); lfo.start(t); lfo.stop(t + 1);
    noise(A.white, t, 0.6, 0.3, d, { f: 3000, f1: 800, q: 2 });
  };
  S.scan = () => {
    const t = now();
    const c = A.ctx;
    const dl = c.createDelay(1); dl.delayTime.value = 0.27;
    const fb = c.createGain(); fb.gain.value = 0.42;
    const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 600;
    const d = out(0.5);
    dl.connect(fb); fb.connect(hp); hp.connect(dl); dl.connect(d);
    const pre = c.createGain(); pre.gain.value = 1;
    pre.connect(d); pre.connect(dl);
    tone('sine', 1320, 1240, t, 0.7, 0.3, pre, 0.005);
    tone('sine', 660, null, t, 0.5, 0.08, pre, 0.005);
  };
  S.scanWarden = () => { const t = now(); tone('sine', 196, 185, t + 0.5, 0.6, 0.2, out(0.6)); tone('sine', 207.7, 196, t + 0.5, 0.6, 0.15, out(0.6)); };
  S.heard = o => {
    // 它听见了：远处传来咔哒咔哒声
    const t = now();
    const w = A.wardenPos || o;
    const d = out(0.6, { x: w.x, y: w.y, ref: 50, verb: 0.6 });
    for (let k = 0; k < 5; k++) noise(A.white, t + k * 0.07, 0.02, 0.6, d, { f: 2200 + k * 150, q: 9 });
  };
  S.giveUp = () => {
    const t = now();
    const w = A.wardenPos || { x: A.lx, y: A.ly };
    const d = out(0.5, { x: w.x, y: w.y, ref: 46, verb: 0.6 });
    noise(A.white, t, 1.3, 0.3, d, { f: 900, f1: 250, q: 1.5 }, 0.3);
    tone('sawtooth', 82, 61, t, 1.4, 0.05, d, 0.3);
  };
  S.sniff = () => {
    const t = now();
    const w = A.wardenPos || { x: A.lx, y: A.ly };
    const d = out(0.7, { x: w.x, y: w.y, ref: 40, verb: 0.3 });
    noise(A.white, t + 0.6, 0.7, 0.4, d, { f: 500, f1: 1600, q: 2.5 }, 0.5);
    noise(A.white, t + 2.0, 0.5, 0.25, d, { f: 1400, f1: 400, q: 2 }, 0.2);
  };
  S.rip = o => {
    const t = now();
    const d = out(1, { verb: 0.5 });
    noise(A.white, t, 0.4, 1, d, { f: 900, f1: 3000, q: 2 });
    tone('sawtooth', 180, 60, t, 0.4, 0.4, d);
  };
  S.call = () => {
    // 守夜者在远处的低吟
    const t = now();
    const w = A.wardenPos;
    if (!w) return;
    const d = out(0.8, { x: w.x, y: w.y, ref: 120, verb: 0.9 });
    const c = A.ctx;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 6;
    bp.frequency.setValueAtTime(420, t); bp.frequency.linearRampToValueAtTime(300, t + 3);
    bp.connect(d);
    const o1 = tone('sawtooth', 110, 92, t, 3.2, 0.25, bp, 0.8, 3.2);
    const lfo = c.createOscillator(); lfo.frequency.value = 5.5;
    const lg = c.createGain(); lg.gain.value = 3;
    lfo.connect(lg); lg.connect(o1.frequency); lfo.start(t); lfo.stop(t + 4.2);
  };
  S.groan = () => {
    const t = now();
    const c = A.ctx;
    const d = out(0.5, { verb: 0.9 });
    const pn = c.createStereoPanner ? c.createStereoPanner() : null;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 9;
    const f0 = 140 + Math.random() * 200;
    bp.frequency.setValueAtTime(f0, t); bp.frequency.exponentialRampToValueAtTime(f0 * (0.6 + Math.random() * 0.8), t + 2.5);
    if (pn) { pn.pan.value = Math.random() * 1.6 - 0.8; bp.connect(pn); pn.connect(d); } else bp.connect(d);
    tone('sawtooth', 42 + Math.random() * 20, 38, t, 2.6, 0.5, bp, 0.6);
  };
  S.creak = () => {
    const t = now();
    const d = out(0.25, { verb: 0.7 });
    const f = 900 + Math.random() * 1400;
    noise(A.white, t, 0.5 + Math.random() * 0.6, 0.6, d, { f, f1: f * (0.7 + Math.random() * 0.6), q: 25 }, 0.1);
  };
  S.drip = () => {
    const t = now();
    const d = out(0.25, { verb: 0.9 });
    tone('sine', 1800 + Math.random() * 900, 700, t, 0.12, 0.2, d, 0.002);
  };
  S.clank = () => {
    const t = now();
    const d = out(0.3, { verb: 1 });
    noise(A.white, t, 0.12, 0.5, d, { f: 500 + Math.random() * 600, q: 10 });
    tone('sine', 180 + Math.random() * 80, 120, t, 0.5, 0.15, d);
  };
  S.closeCall = () => {
    const t = now();
    const d = out(0.45, { verb: 0.4 });
    tone('sine', 740, 990, t, 0.3, 0.07, d, 0.01);
    tone('sine', 1110, null, t + 0.08, 0.4, 0.05, d, 0.01);
  };
  S.exhausted = () => {
    const t = now();
    noise(A.white, t, 0.6, 0.12, out(0.6), { f: 800, f1: 500, q: 1 }, 0.15);
  };
  S.intro = () => {
    const t = now();
    const d = out(0.7, { verb: 0.6 });
    tone('sine', 40, 55, t, 2.2, 0.25, d, 0.8);
    tone('triangle', 220, 220, t + 0.2, 2.4, 0.03, d, 1.2);
    S.torch();
  };
  S.zap = o => {
    const t = now();
    const d = out(0.35, { x: o.x, y: o.y, ref: 24, verb: 0.3 });
    for (let k = 0; k < 4; k++) noise(A.white, t + Math.random() * 0.12, 0.012, 0.8, d, { type: 'highpass', f: 3000 });
    tone('sawtooth', 120, 60, t, 0.08, 0.15, d);
  };
  S.relaySeen = () => { const t = now(); tone('sine', 1568, null, t, 0.25, 0.035, out(0.6, { verb: 0.3 })); tone('sine', 2093, null, t + 0.08, 0.3, 0.025, out(0.6, { verb: 0.3 })); };
  S.ach = () => {
    const t = now();
    const d = out(0.5, { verb: 0.4 });
    [784, 988, 1175, 1568].forEach((f, i) => tone('sine', f, null, t + i * 0.07, 0.6, 0.06, d, 0.01));
  };

  A._names = () => Object.keys(S); // 调试用
  A._raw = (name, o) => S[name](o || {});
  A.play = function (name, o) {
    if (!A.ready || A.muted) return;
    const fn = S[name];
    if (!fn) return;
    try { fn(o || {}); } catch (e) { /* 忽略个别节点创建失败 */ }
  };

  /* ---------------- 每帧更新：持续层 ---------------- */
  A.update = function (dt, g, mode) {
    A.active = A.ready && !A.muted;
    if (!A.ready) return;
    const t = now();
    if (A.muted) {
      // 静音时不再创建新的声音节点
      A.buzzG.gain.setTargetAtTime(0, t, 0.1);
      A.humG.gain.setTargetAtTime(0, t, 0.05);
      A.calG.gain.setTargetAtTime(0, t, 0.05);
      A.droneG.gain.setTargetAtTime(0, t, 0.1);
      A.chase = 0;
      return;
    }
    const play = mode === 'play' && g && !g.attract;
    const w = g ? g.warden : null;
    if (w) A.wardenPos = { x: w.x, y: w.y };
    // 心跳
    A.beatPulse = Math.max(0, A.beatPulse - dt * 3.2);
    const danger = play ? g.danger : 0;
    A.danger = danger;
    if (play && danger > 0.1 && !g.ending) {
      if (t >= A.nextBeat) {
        const vol = Math.pow(danger, 0.8) * 0.9;
        const d = out(vol);
        tone('sine', 64, 36, t + 0.01, 0.16, 0.9, d, 0.006);
        tone('sine', 56, 34, t + 0.19, 0.16, 0.6, d, 0.006);
        noise(A.brown, t + 0.01, 0.08, 0.3, d, { type: 'lowpass', f: 160 });
        A.beatPulse = 1;
        A.nextBeat = t + U.lerp(1.05, 0.34, danger);
      }
    } else A.nextBeat = Math.max(A.nextBeat, t + 0.2);
    // 提灯电流声
    if (w && g) {
      const dx = w.x - A.lx, dy = w.y - A.ly, d = Math.hypot(dx, dy);
      let v = play || (g.attract && mode === 'title') ? Math.pow(clamp(1 - d / 10, 0, 1), 1.6) * 0.075 : 0;
      if (g.attract) v = 0.012;
      if (w.state === 'stunned') v *= 0.15;
      if (g.ending && g.ending.type === 'win') v *= 0.2;
      A.buzzG.gain.setTargetAtTime(v, t, 0.12);
      const occl = A.losFn && d > 1.2 && !A.losFn(w.x, w.y);
      A.buzzLP.frequency.setTargetAtTime(occl ? 500 : 2400, t, 0.15);
      if (A.buzzPan) A.buzzPan.pan.setTargetAtTime(clamp(dx / 7, -0.8, 0.8), t, 0.1);
    }
    // 修复嗡声
    const p = g ? g.player : null;
    const R = play && p && p.restoring;
    A.humG.gain.setTargetAtTime(R ? 0.05 : 0, t, 0.08);
    if (R) {
      const f = 110 + R.progress * 110;
      A.humO.frequency.setTargetAtTime(f, t, 0.1);
      A.humO2.frequency.setTargetAtTime(f * 2.005, t, 0.1);
    }
    // 校准拍频
    const C = play && p && p.calib;
    if (C) {
      const ph = Math.abs(C.phase);
      A.calO2.frequency.setTargetAtTime(523.25 + ph * 26, t, 0.02);
      A.calG.gain.setTargetAtTime(0.055, t, 0.03);
      A.calG3.gain.setTargetAtTime(ph <= C.win ? 0.5 : 0, t, 0.02);
    } else A.calG.gain.setTargetAtTime(0, t, 0.04);
    // 追逐配乐
    A.chaseTarget = play && w && (w.state === 'chase' || w.state === 'openLocker' || w.state === 'recover') && !g.ending ? 1 : play && w && w.state === 'investigate' && w.urgency > 0.8 ? 0.35 : 0;
    A.chase += (A.chaseTarget - A.chase) * (1 - Math.exp(-dt * (A.chaseTarget > A.chase ? 3 : 0.5)));
    A.mus.gain.setTargetAtTime(A.chase * 0.55, t, 0.1);
    A.droneG.gain.setTargetAtTime(A.chase > 0.05 ? 0.018 * A.chase : 0, t, 0.2);
    if (A.chase > 0.03) {
      const step = 60 / 138 / 2;
      if (A.seqT < t) A.seqT = t + 0.05;
      while (A.seqT < t + 0.15) {
        const s = A.seqStep++ % 16;
        const notes = [73.4, 73.4, 77.8, 73.4, 73.4, 87.3, 77.8, 73.4, 73.4, 73.4, 77.8, 73.4, 98, 87.3, 77.8, 69.3];
        const lp = A.ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 500 + A.chase * 900;
        lp.connect(A.mus);
        tone('sawtooth', notes[s], null, A.seqT, step * 0.9, 0.22, lp, 0.005);
        tone('square', notes[s] / 2, null, A.seqT, step * 0.9, 0.12, lp, 0.005);
        if (s % 4 === 0) tone('sine', 90, 40, A.seqT, 0.18, 0.7, A.mus, 0.003);
        noise(A.white, A.seqT, 0.03, s % 2 ? 0.06 : 0.12, A.mus, { type: 'highpass', f: 6500 });
        A.seqT += step;
      }
    }
    // 喘息
    if (play && p && (p.exhausted || (p.stamina < 0.25 && p.sprinting)) && t > A.nextBreath && !p.hidden) {
      noise(A.white, t, 0.5, 0.1, out(0.6), { f: 750, f1: 520, q: 1 }, 0.2);
      A.nextBreath = t + 0.9;
    }
    // 环境随机事件
    if ((mode === 'play' || mode === 'title') && g) {
      if (t > A.nextAmb) {
        const r = Math.random();
        if (r < 0.3) S.groan(); else if (r < 0.55) S.creak(); else if (r < 0.8) S.drip(); else S.clank();
        A.nextAmb = t + 5 + Math.random() * 11;
      }
      if (play && t > A.nextCall && w && w.state === 'patrol') {
        const d = Math.hypot(w.x - A.lx, w.y - A.ly);
        if (d > 12) S.call();
        A.nextCall = t + 28 + Math.random() * 30;
      }
    }
  };

  A.resetRun = function () {
    A.nextBeat = 0;
    A.chase = 0;
    A.nextCall = A.ctx ? now() + 20 : 20;
    if (A.ready) {
      A.muffle.frequency.cancelScheduledValues(now());
      A.muffle.frequency.setValueAtTime(20000, now());
    }
  };
})();
