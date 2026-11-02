/* 远征 · 合成音效与配乐（WebAudio，无音频文件） */
(function () {
  'use strict';
  const Q = window.Q;
  let ac = null, master = null, sfxBus = null, musBus = null, verb = null, verbIn = null, noiseB = null;
  let sfxOn = true, musOn = true, ducked = false;
  const last = {};
  // 同类音效的最短间隔（秒），避免怪潮里的音效堆叠
  const THR = { hit: 0.045, kill: 0.05, gem: 0.03, bolt: 0.06, arrow: 0.05, slash: 0.07, zap: 0.08, cast: 0.18, tick: 0.06, shield: 0.08, ehit: 0.09, pop: 0.06, boom: 0.06, frost: 0.1, sword: 0.08, disc: 0.1, fire: 0.25, tele: 0.12, crit: 0.07, pickup: 0.05 };

  function init() {
    if (ac) { if (ac.state === 'suspended') ac.resume().catch(() => {}); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try { ac = new AC(); } catch (e) { ac = null; return; }
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 10; comp.ratio.value = 5; comp.attack.value = 0.004; comp.release.value = 0.18;
    master = ac.createGain(); master.gain.value = 0.85;
    master.connect(comp); comp.connect(ac.destination);
    sfxBus = ac.createGain(); sfxBus.gain.value = sfxOn ? 0.8 : 0; sfxBus.connect(master);
    musBus = ac.createGain(); musBus.gain.value = musOn ? 0.5 : 0; musBus.connect(master);
    // 简易混响：两条反馈延迟
    verbIn = ac.createGain(); verbIn.gain.value = 1;
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2400;
    const d1 = ac.createDelay(1), d2 = ac.createDelay(1);
    d1.delayTime.value = 0.137; d2.delayTime.value = 0.211;
    const f1 = ac.createGain(), f2 = ac.createGain(); f1.gain.value = 0.42; f2.gain.value = 0.36;
    verbIn.connect(lp); lp.connect(d1); lp.connect(d2);
    d1.connect(f1); f1.connect(d2); d2.connect(f2); f2.connect(d1);
    verb = ac.createGain(); verb.gain.value = 0.32;
    d1.connect(verb); d2.connect(verb); verb.connect(master);
    const len = ac.sampleRate * 1.2;
    noiseB = ac.createBuffer(1, len, ac.sampleRate);
    const ch = noiseB.getChannelData(0);
    for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
    if (mus.want) startMusic();
  }

  /* ---------- 基础合成 ---------- */
  function env(g, t, a, peak, dur, curve) {
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
    if (curve === 'lin') g.gain.linearRampToValueAtTime(0.0001, t + dur);
    else g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  }
  function tone(o) {
    const t = (o.t != null ? o.t : ac.currentTime) + (o.at || 0);
    const osc = ac.createOscillator();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.f, t);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.to), t + (o.slide || o.dur));
    if (o.det) osc.detune.value = o.det;
    const g = ac.createGain();
    env(g, t, o.a || 0.004, o.v || 0.2, o.dur, o.curve);
    let node = osc;
    if (o.lp) { const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lp; f.Q.value = o.q || 0.7; node.connect(f); node = f; }
    node.connect(g);
    g.connect(o.bus || sfxBus);
    if (o.verb) { const s = ac.createGain(); s.gain.value = o.verb; g.connect(s); s.connect(verbIn); }
    osc.start(t); osc.stop(t + o.dur + 0.05);
    return osc;
  }
  function noise(o) {
    const t = (o.t != null ? o.t : ac.currentTime) + (o.at || 0);
    const src = ac.createBufferSource();
    src.buffer = noiseB;
    src.playbackRate.value = o.rate || 1;
    const f = ac.createBiquadFilter();
    f.type = o.ft || 'bandpass';
    f.frequency.setValueAtTime(o.f || 1200, t);
    if (o.to) f.frequency.exponentialRampToValueAtTime(Math.max(30, o.to), t + (o.slide || o.dur));
    f.Q.value = o.q || 1;
    const g = ac.createGain();
    env(g, t, o.a || 0.003, o.v || 0.2, o.dur);
    src.connect(f); f.connect(g); g.connect(o.bus || sfxBus);
    if (o.verb) { const s = ac.createGain(); s.gain.value = o.verb; g.connect(s); s.connect(verbIn); }
    src.loop = true;
    src.start(t, Math.random() * 0.6);
    src.stop(t + o.dur + 0.05);
  }

  // 五声音阶（宫商角徵羽）
  const PENTA = [0, 2, 4, 7, 9];
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  let gemCombo = 0, gemT = 0;

  const SFX = {
    slash() {
      noise({ f: 2600, to: 700, q: 1.4, dur: 0.16, v: 0.22, ft: 'bandpass' });
      tone({ f: 180, to: 90, dur: 0.1, v: 0.12, type: 'triangle' });
    },
    bolt() {
      tone({ f: 980 + Math.random() * 120, to: 1500, dur: 0.09, v: 0.06, type: 'sine', verb: 0.3 });
      tone({ f: 1960, to: 2600, dur: 0.06, v: 0.025, type: 'triangle' });
    },
    arrow() {
      noise({ f: 5200, to: 2400, q: 2, dur: 0.06, v: 0.1, ft: 'bandpass' });
      tone({ f: 1500, to: 820, dur: 0.06, v: 0.04, type: 'triangle' });
    },
    hit() { noise({ f: 900, to: 300, q: 0.9, dur: 0.05, v: 0.09, ft: 'lowpass' }); },
    crit() {
      tone({ f: 1700, to: 2600, dur: 0.07, v: 0.06, type: 'triangle', verb: 0.25 });
      noise({ f: 3000, q: 3, dur: 0.04, v: 0.06 });
    },
    kill() {
      tone({ f: 340 + Math.random() * 60, to: 110, dur: 0.09, v: 0.07, type: 'sine' });
      noise({ f: 1400, to: 400, q: 1, dur: 0.07, v: 0.06 });
    },
    pop() { tone({ f: 520, to: 200, dur: 0.07, v: 0.06, type: 'triangle' }); },
    gem() {
      const now = ac.currentTime;
      if (now - gemT > 0.6) gemCombo = 0;
      gemT = now;
      const step = Math.min(gemCombo++, 14);
      const m = 79 + PENTA[step % 5] + 12 * Math.floor(step / 5);
      tone({ f: mtof(m), dur: 0.12, v: 0.045, type: 'sine', verb: 0.35 });
      tone({ f: mtof(m + 12), dur: 0.07, v: 0.015, type: 'triangle' });
    },
    levelup() {
      const base = 72;
      [0, 2, 4, 7, 9, 12, 14, 16].forEach((s, i) => {
        tone({ f: mtof(base + s), dur: 0.5, v: 0.08, type: 'triangle', at: i * 0.055, verb: 0.5 });
        tone({ f: mtof(base + s + 12), dur: 0.3, v: 0.03, type: 'sine', at: i * 0.055 + 0.02 });
      });
      noise({ f: 6000, to: 9000, q: 0.7, dur: 0.6, v: 0.04, ft: 'highpass', verb: 0.4 });
    },
    pick() {
      tone({ f: mtof(84), dur: 0.25, v: 0.07, type: 'triangle', verb: 0.4 });
      tone({ f: mtof(91), dur: 0.35, v: 0.06, type: 'sine', at: 0.06, verb: 0.4 });
    },
    evolve() {
      [0, 4, 7, 12, 16, 19, 24].forEach((s, i) => tone({ f: mtof(67 + s), dur: 0.9, v: 0.07, type: 'sawtooth', lp: 3000, at: i * 0.07, verb: 0.6 }));
      tone({ f: 60, to: 40, dur: 1.2, v: 0.2, type: 'sine' });
    },
    dash() {
      noise({ f: 800, to: 4200, q: 0.8, dur: 0.18, v: 0.13, ft: 'bandpass' });
    },
    bash() {
      tone({ f: 120, to: 50, dur: 0.3, v: 0.28, type: 'sine' });
      tone({ f: 330, to: 160, dur: 0.18, v: 0.08, type: 'square', lp: 1600 });
      noise({ f: 1800, to: 500, q: 0.8, dur: 0.25, v: 0.14 });
    },
    shock() {
      tone({ f: 90, to: 38, dur: 0.45, v: 0.3, type: 'sine' });
      noise({ f: 600, to: 120, q: 0.7, dur: 0.4, v: 0.18, ft: 'lowpass' });
    },
    nova() {
      tone({ f: 200, to: 1200, dur: 0.25, v: 0.06, type: 'sawtooth', lp: 2600 });
      tone({ f: 80, to: 36, dur: 0.6, v: 0.3, type: 'sine', at: 0.18 });
      noise({ f: 3000, to: 300, q: 0.6, dur: 0.7, v: 0.16, at: 0.18, verb: 0.5 });
      [0, 4, 7, 11].forEach((s, i) => tone({ f: mtof(84 + s), dur: 0.6, v: 0.03, type: 'sine', at: 0.2 + i * 0.03, verb: 0.6 }));
    },
    trap() {
      tone({ f: 420, to: 180, dur: 0.18, v: 0.1, type: 'triangle' });
      noise({ f: 2400, to: 900, q: 2, dur: 0.12, v: 0.08 });
    },
    flip() { noise({ f: 1200, to: 5200, q: 0.8, dur: 0.2, v: 0.12 }); },
    zap() {
      noise({ f: 3800, to: 1200, q: 0.6, dur: 0.14, v: 0.14, ft: 'highpass' });
      tone({ f: 140, to: 70, dur: 0.12, v: 0.08, type: 'square', lp: 1200 });
    },
    thunder() {
      noise({ f: 4500, to: 300, q: 0.4, dur: 0.5, v: 0.2, ft: 'lowpass', verb: 0.4 });
      tone({ f: 70, to: 30, dur: 0.5, v: 0.22, type: 'sine' });
    },
    frost() {
      [0, 7, 12, 19].forEach((s, i) => tone({ f: mtof(88 + s), dur: 0.35, v: 0.025, type: 'sine', at: i * 0.025, verb: 0.6 }));
      noise({ f: 7000, to: 3000, q: 1, dur: 0.3, v: 0.07, ft: 'highpass' });
    },
    meteor() { tone({ f: 1800, to: 260, dur: 0.5, v: 0.035, type: 'sine', verb: 0.3 }); },
    boom() {
      tone({ f: 100, to: 34, dur: 0.42, v: 0.26, type: 'sine' });
      noise({ f: 1200, to: 140, q: 0.7, dur: 0.4, v: 0.16, ft: 'lowpass' });
    },
    sword() {
      tone({ f: 2200, to: 3100, dur: 0.12, v: 0.03, type: 'triangle', verb: 0.4 });
      tone({ f: 3300, dur: 0.1, v: 0.015, type: 'sine' });
    },
    disc() { noise({ f: 1500, to: 2600, q: 3, dur: 0.22, v: 0.06 }); },
    fire() { noise({ f: 700, to: 400, q: 0.5, dur: 0.2, v: 0.03, ft: 'lowpass' }); },
    tick() { tone({ f: 1300, to: 900, dur: 0.04, v: 0.03, type: 'triangle' }); },
    shield() { tone({ f: 900, to: 1400, dur: 0.06, v: 0.04, type: 'square', lp: 2400 }); },
    shieldBreak() {
      [0, 5, 10].forEach((s, i) => tone({ f: mtof(86 + s), to: mtof(70 + s), dur: 0.3, v: 0.05, type: 'triangle', at: i * 0.02 }));
      noise({ f: 5000, to: 1500, q: 0.8, dur: 0.35, v: 0.14 });
    },
    hurt() {
      tone({ f: 170, to: 70, dur: 0.22, v: 0.2, type: 'square', lp: 900 });
      noise({ f: 900, to: 200, q: 0.8, dur: 0.2, v: 0.14, ft: 'lowpass' });
    },
    heal() { [0, 4, 7, 12].forEach((s, i) => tone({ f: mtof(76 + s), dur: 0.35, v: 0.05, type: 'sine', at: i * 0.05, verb: 0.5 })); },
    pickup() { tone({ f: mtof(88), dur: 0.15, v: 0.05, type: 'triangle', verb: 0.4 }); },
    dust() { tone({ f: mtof(93 + PENTA[(Math.random() * 5) | 0]), dur: 0.2, v: 0.035, type: 'sine', verb: 0.6 }); },
    chest() {
      [0, 2, 4, 7, 9, 12, 16, 19].forEach((s, i) => tone({ f: mtof(76 + s), dur: 0.4, v: 0.05, type: 'triangle', at: i * 0.045, verb: 0.6 }));
      noise({ f: 8000, q: 0.5, dur: 0.8, v: 0.04, ft: 'highpass', verb: 0.5 });
    },
    magnet() { tone({ f: 300, to: 1600, dur: 0.5, v: 0.06, type: 'sine', verb: 0.5 }); },
    bomb() {
      noise({ f: 5000, to: 200, q: 0.4, dur: 0.9, v: 0.24, ft: 'lowpass', verb: 0.5 });
      tone({ f: 60, to: 28, dur: 0.9, v: 0.3, type: 'sine' });
    },
    cast() { tone({ f: 420, to: 640, dur: 0.12, v: 0.03, type: 'triangle' }); },
    ehit() { tone({ f: 260, to: 180, dur: 0.06, v: 0.04, type: 'square', lp: 1200 }); },
    tele() { tone({ f: 660, dur: 0.07, v: 0.035, type: 'triangle' }); tone({ f: 660, dur: 0.07, v: 0.03, type: 'triangle', at: 0.09 }); },
    slam() {
      tone({ f: 70, to: 28, dur: 0.55, v: 0.34, type: 'sine' });
      noise({ f: 700, to: 90, q: 0.6, dur: 0.5, v: 0.22, ft: 'lowpass' });
    },
    roar() {
      tone({ f: 82, to: 52, dur: 1.4, v: 0.2, type: 'sawtooth', lp: 700, a: 0.08 });
      tone({ f: 123, to: 70, dur: 1.3, v: 0.12, type: 'sawtooth', lp: 900, a: 0.1, det: 12 });
      noise({ f: 500, to: 200, q: 0.5, dur: 1.3, v: 0.14, ft: 'lowpass', a: 0.1 });
    },
    warn() {
      [0, 0.32].forEach((d) => {
        tone({ f: 220, dur: 0.26, v: 0.1, type: 'sawtooth', lp: 1400, at: d });
        tone({ f: 330, dur: 0.26, v: 0.06, type: 'sawtooth', lp: 1400, at: d });
      });
    },
    starfall() {
      tone({ f: 2400, to: 200, dur: 1.3, v: 0.06, type: 'sine', verb: 0.5 });
      noise({ f: 6000, to: 600, q: 0.5, dur: 1.3, v: 0.06, ft: 'bandpass' });
    },
    bossDie() {
      tone({ f: 120, to: 25, dur: 2.2, v: 0.36, type: 'sine' });
      noise({ f: 3000, to: 80, q: 0.4, dur: 2.2, v: 0.26, ft: 'lowpass', verb: 0.6 });
      [0, 4, 7, 12, 16].forEach((s, i) => tone({ f: mtof(67 + s), dur: 1.6, v: 0.05, type: 'triangle', at: 0.4 + i * 0.09, verb: 0.7 }));
    },
    phase() {
      tone({ f: 60, to: 120, dur: 0.8, v: 0.2, type: 'sawtooth', lp: 600 });
      noise({ f: 400, to: 2000, q: 0.5, dur: 0.8, v: 0.14, verb: 0.4 });
    },
    victory() {
      const seq = [[0, 0], [4, 0.18], [7, 0.36], [12, 0.54], [9, 0.9], [12, 1.08], [16, 1.26], [19, 1.6]];
      seq.forEach(([s, at]) => {
        tone({ f: mtof(67 + s), dur: 0.7, v: 0.08, type: 'sawtooth', lp: 2600, at, verb: 0.5 });
        tone({ f: mtof(55 + s), dur: 0.7, v: 0.05, type: 'triangle', at });
      });
    },
    defeat() {
      [[0, 0], [-2, 0.35], [-5, 0.7], [-9, 1.1]].forEach(([s, at]) => tone({ f: mtof(62 + s), dur: 0.9, v: 0.08, type: 'triangle', at, verb: 0.6 }));
      tone({ f: 70, to: 40, dur: 1.6, v: 0.15, type: 'sine', at: 0.2 });
    },
    revive() {
      [0, 7, 12, 16, 19, 24].forEach((s, i) => tone({ f: mtof(64 + s), dur: 0.8, v: 0.06, type: 'triangle', at: i * 0.06, verb: 0.6 }));
    },
    ui() { tone({ f: 1400, dur: 0.04, v: 0.03, type: 'triangle' }); },
    uiOk() { tone({ f: mtof(81), dur: 0.12, v: 0.05, type: 'triangle', verb: 0.3 }); tone({ f: mtof(88), dur: 0.16, v: 0.04, type: 'sine', at: 0.05, verb: 0.3 }); },
    buy() { [0, 7, 12].forEach((s, i) => tone({ f: mtof(79 + s), dur: 0.3, v: 0.06, type: 'triangle', at: i * 0.06, verb: 0.5 })); },
  };

  function play(name) {
    if (!ac || !sfxOn || ac.state !== 'running') return;
    const now = ac.currentTime;
    const th = THR[name];
    if (th && last[name] && now - last[name] < th) return;
    last[name] = now;
    const fn = SFX[name];
    if (fn) { try { fn(); } catch (e) { /* 忽略 */ } }
  }

  /* ---------- 配乐：五声音阶的步进音序 ---------- */
  const mus = { want: false, mode: 'title', biome: 0, timer: 0, next: 0, step: 0, bar: 0, rng: Q.mulberry(7) };
  const MODES = {
    title: { bpm: 68, drums: 0, arp: 0.35, bass: 0.6 },
    run: { bpm: 92, drums: 1, arp: 0.55, bass: 1 },
    boss: { bpm: 118, drums: 2, arp: 0.7, bass: 1.2 },
    calm: { bpm: 72, drums: 0, arp: 0.3, bass: 0.5 },
  };
  const PROG = [0, -4, 3, -2]; // 和声进行（半音偏移）
  function startMusic() {
    if (!ac) return;
    if (mus.timer) return;
    mus.next = ac.currentTime + 0.1;
    mus.timer = setInterval(schedule, 40);
  }
  function stopMusic() { if (mus.timer) { clearInterval(mus.timer); mus.timer = 0; } }
  function schedule() {
    if (!ac || ac.state !== 'running') return;
    const M = MODES[mus.mode] || MODES.run;
    const stepDur = 60 / M.bpm / 4;
    if (mus.next < ac.currentTime - 0.3) mus.next = ac.currentTime + 0.05;
    while (mus.next < ac.currentTime + 0.14) {
      if (musOn) playStep(mus.step, mus.next, M, stepDur);
      mus.next += stepDur;
      mus.step = (mus.step + 1) % 16;
      if (mus.step === 0) mus.bar++;
    }
  }
  let motif = null;
  function playStep(s, t, M, sd) {
    const root = (Q.BIOMES[mus.biome] || Q.BIOMES[0]).root;
    const chord = PROG[Math.floor(mus.bar / 2) % 4];
    const bus = musBus;
    if (s === 0 && mus.bar % 2 === 0) {
      // 长音铺底
      const d = sd * 32;
      tone({ t, f: mtof(root + chord - 12), dur: d, v: 0.05, type: 'sawtooth', lp: 380, a: 0.6, bus, curve: 'lin' });
      tone({ t, f: mtof(root + chord - 5), dur: d, v: 0.03, type: 'sawtooth', lp: 420, a: 0.8, bus, det: 7 });
      tone({ t, f: mtof(root + chord), dur: d, v: 0.025, type: 'triangle', a: 1, bus, verb: 0.4 });
    }
    if (s === 0) {
      // 每小节换一个旋律动机
      const r = mus.rng;
      motif = [];
      let deg = (r() * 5) | 0;
      for (let i = 0; i < 16; i++) {
        const on = (i % 4 === 0 && r() < 0.8) || (i % 2 === 0 && r() < 0.45) || r() < 0.12;
        if (on && r() < M.arp + 0.3) { deg = Math.max(0, Math.min(9, deg + ((r() * 5) | 0) - 2)); motif.push(deg); } else motif.push(-1);
      }
    }
    // 拨弦（类古筝）
    if (motif && motif[s] >= 0) {
      const dg = motif[s];
      const m = root + 12 + chord + PENTA[dg % 5] + 12 * Math.floor(dg / 5);
      tone({ t, f: mtof(m), dur: 0.55, v: 0.035, type: 'triangle', bus, verb: 0.45 });
      tone({ t, f: mtof(m) * 2.01, dur: 0.18, v: 0.01, type: 'sine', bus });
    }
    // 低音
    if (M.bass && (s === 0 || s === 8 || (M.drums > 1 && (s === 6 || s === 14)))) {
      tone({ t, f: mtof(root + chord - 24), dur: sd * 3.5, v: 0.09 * M.bass, type: 'triangle', bus });
    }
    // 鼓（类太鼓）
    if (M.drums) {
      const kicks = M.drums > 1 ? [0, 3, 8, 11, 14] : [0, 8, 10];
      if (kicks.includes(s)) tone({ t, f: 95, to: 42, dur: 0.32, v: 0.16 + (s === 0 ? 0.05 : 0), type: 'sine', bus });
      if (s === 4 || s === 12) noise({ t, f: 1800, q: 0.7, dur: 0.12, v: M.drums > 1 ? 0.07 : 0.04, bus });
      if (M.drums > 1 && s % 2 === 1) noise({ t, f: 8000, q: 0.6, dur: 0.03, v: 0.025, ft: 'highpass', bus });
      if (M.drums === 1 && (s === 6 || s === 14)) noise({ t, f: 7000, q: 0.6, dur: 0.03, v: 0.018, ft: 'highpass', bus });
    }
  }

  function setMode(mode) {
    mus.want = mode !== 'off';
    if (mode === 'off') { stopMusic(); return; }
    mus.mode = mode;
    if (ac) startMusic();
  }

  Q.audio = {
    init,
    play,
    get ready() { return !!ac; },
    music: setMode,
    biome(i) { mus.biome = i | 0; },
    setSfx(on) { sfxOn = !!on; if (sfxBus) sfxBus.gain.value = on ? 0.8 : 0; },
    setMusic(on) { musOn = !!on; if (musBus) musBus.gain.setTargetAtTime(on ? (ducked ? 0.18 : 0.5) : 0, ac.currentTime, 0.1); },
    duck(on) { ducked = !!on; if (musBus && musOn) musBus.gain.setTargetAtTime(on ? 0.18 : 0.5, ac.currentTime, 0.2); },
    suspend() { if (ac && ac.state === 'running') ac.suspend().catch(() => {}); },
    resume() { if (ac && ac.state === 'suspended') ac.resume().catch(() => {}); },
  };
})();
