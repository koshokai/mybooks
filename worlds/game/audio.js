/* 引力 · 星轨 —— 合成音效（WebAudio，无音频文件） */
(function () {
  'use strict';
  let ac = null, master = null, sfxBus = null, delay = null, pad = null;
  let muted = false;
  const noiseBuf = { b: null };

  function init() {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ac = new AC();
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 4;
    master = ac.createGain(); master.gain.value = muted ? 0 : 0.8;
    master.connect(comp); comp.connect(ac.destination);
    sfxBus = ac.createGain(); sfxBus.gain.value = 0.9; sfxBus.connect(master);
    // 简单回声，给星尘音色加一点“太空感”
    delay = ac.createDelay(1); delay.delayTime.value = 0.23;
    const fb = ac.createGain(); fb.gain.value = 0.32;
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2600;
    delay.connect(lp); lp.connect(fb); fb.connect(delay);
    const wet = ac.createGain(); wet.gain.value = 0.45; lp.connect(wet); wet.connect(master);
    const len = ac.sampleRate * 1.5;
    const b = ac.createBuffer(1, len, ac.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    noiseBuf.b = b;
    startPad();
  }

  function startPad() {
    if (!ac || pad) return;
    const g = ac.createGain(); g.gain.value = 0;
    g.gain.setTargetAtTime(0.045, ac.currentTime, 3);
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 520; lp.Q.value = 0.6;
    const lfo = ac.createOscillator(); lfo.frequency.value = 0.07;
    const lfoG = ac.createGain(); lfoG.gain.value = 260; lfo.connect(lfoG); lfoG.connect(lp.frequency); lfo.start();
    [[55, 'sine', 0.9], [82.4, 'triangle', 0.35], [110.6, 'sine', 0.3], [164.8, 'sine', 0.12]].forEach(([f, type, v]) => {
      const o = ac.createOscillator(); o.type = type; o.frequency.value = f; o.detune.value = (Math.random() - 0.5) * 12;
      const og = ac.createGain(); og.gain.value = v; o.connect(og); og.connect(lp); o.start();
    });
    lp.connect(g); g.connect(master);
    pad = g;
  }

  function env(g, t, a, peak, dur) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  }
  function tone(o) {
    if (!ac || muted) return;
    const t = ac.currentTime + (o.at || 0);
    const osc = ac.createOscillator(); osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.f, t);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + (o.slide || o.dur));
    const g = ac.createGain(); env(g, t, o.a || 0.005, o.v || 0.2, o.dur);
    osc.connect(g); g.connect(sfxBus);
    if (o.echo) { const s = ac.createGain(); s.gain.value = o.echo; g.connect(s); s.connect(delay); }
    osc.start(t); osc.stop(t + o.dur + 0.05);
  }
  function noise(o) {
    if (!ac || muted || !noiseBuf.b) return;
    const t = ac.currentTime + (o.at || 0);
    const src = ac.createBufferSource(); src.buffer = noiseBuf.b;
    const f = ac.createBiquadFilter(); f.type = o.ft || 'bandpass'; f.Q.value = o.q || 1;
    f.frequency.setValueAtTime(o.f, t);
    if (o.to) f.frequency.exponentialRampToValueAtTime(o.to, t + o.dur);
    const g = ac.createGain(); env(g, t, o.a || 0.01, o.v || 0.2, o.dur);
    src.connect(f); f.connect(g); g.connect(sfxBus);
    src.start(t, Math.random()); src.stop(t + o.dur + 0.05);
  }

  // E 大调五声音阶，星尘越收越高
  const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
  const note = (base, i) => base * Math.pow(2, PENTA[Math.min(i, PENTA.length - 1)] / 12);

  let lastTick = 0;
  const S = {
    init,
    get muted() { return muted; },
    setMuted(m) {
      muted = !!m;
      if (master) master.gain.setTargetAtTime(muted ? 0 : 0.8, ac.currentTime, 0.05);
    },
    tick(p) {
      if (!ac) return; const now = ac.currentTime; if (now - lastTick < 0.03) return; lastTick = now;
      tone({ f: 500 + p * 900, dur: 0.035, type: 'triangle', v: 0.05 });
    },
    launch(p) {
      noise({ f: 300, to: 2400 + p * 1600, dur: 0.35 + p * 0.2, v: 0.22 + p * 0.15, q: 0.9 });
      tone({ f: 160, to: 60, dur: 0.25, type: 'sine', v: 0.35 });
      tone({ f: 660 + p * 300, to: 1320 + p * 600, dur: 0.18, type: 'triangle', v: 0.06, echo: 0.3 });
    },
    mote(i) {
      const f = note(659.25, i);
      tone({ f, dur: 0.6, type: 'sine', v: 0.22, echo: 0.6 });
      tone({ f: f * 2, dur: 0.35, type: 'triangle', v: 0.06, echo: 0.4 });
      tone({ f: f * 3.01, dur: 0.18, type: 'sine', v: 0.03 });
    },
    unlock() {
      [0, 4, 7, 12].forEach((s, k) => tone({ f: 523.25 * Math.pow(2, s / 12), dur: 0.7, type: 'triangle', v: 0.09, at: k * 0.07, echo: 0.5 }));
      noise({ f: 3000, to: 8000, dur: 0.6, v: 0.05, q: 2 });
    },
    win() {
      [0, 4, 7, 11, 14, 19].forEach((s, k) => tone({ f: 392 * Math.pow(2, s / 12), dur: 1.4, type: k % 2 ? 'triangle' : 'sine', v: 0.11, at: k * 0.06, a: 0.02, echo: 0.6 }));
      tone({ f: 98, dur: 1.6, type: 'sine', v: 0.25, a: 0.05 });
      noise({ f: 1500, to: 9000, dur: 1.2, v: 0.06, q: 1.5 });
    },
    star(i) {
      const f = [783.99, 987.77, 1174.66][i] || 1174.66;
      tone({ f, dur: 0.8, type: 'sine', v: 0.2, echo: 0.6 });
      tone({ f: f * 1.5, dur: 0.5, type: 'triangle', v: 0.06, at: 0.03, echo: 0.4 });
    },
    crash() {
      noise({ f: 1400, to: 120, dur: 0.7, v: 0.5, ft: 'lowpass', q: 0.7 });
      tone({ f: 140, to: 38, dur: 0.6, type: 'sine', v: 0.5 });
      tone({ f: 70, to: 30, dur: 0.9, type: 'triangle', v: 0.2 });
    },
    swallow() {
      tone({ f: 520, to: 28, dur: 1.3, slide: 1.2, type: 'sine', v: 0.32 });
      tone({ f: 260, to: 20, dur: 1.4, slide: 1.3, type: 'sawtooth', v: 0.05 });
      noise({ f: 900, to: 60, dur: 1.2, v: 0.2, ft: 'lowpass' });
    },
    bounce(p) {
      const v = Math.min(1, p / 500);
      tone({ f: 200 + v * 80, to: 90, dur: 0.16, type: 'triangle', v: 0.18 + v * 0.2 });
      noise({ f: 2400, dur: 0.06, v: 0.12 + v * 0.15, q: 1.5 });
    },
    boost() {
      tone({ f: 330, to: 1320, dur: 0.32, type: 'square', v: 0.05 });
      tone({ f: 660, to: 2640, dur: 0.3, type: 'sine', v: 0.1, echo: 0.4 });
      noise({ f: 800, to: 5000, dur: 0.3, v: 0.12 });
    },
    warp() {
      tone({ f: 200, to: 1600, dur: 0.22, type: 'sine', v: 0.18 });
      tone({ f: 1600, to: 300, dur: 0.35, type: 'triangle', v: 0.1, at: 0.18, echo: 0.6 });
      noise({ f: 600, to: 4000, dur: 0.35, v: 0.08, q: 4 });
    },
    near() {
      noise({ f: 280, to: 1400, dur: 0.5, v: 0.16, q: 1.4 });
      tone({ f: 90, to: 55, dur: 0.5, type: 'sine', v: 0.16 });
    },
    lost() {
      tone({ f: 440, to: 180, dur: 0.6, type: 'triangle', v: 0.1, echo: 0.4 });
    },
    fizzle() { noise({ f: 3000, to: 300, dur: 0.5, v: 0.1, q: 2 }); },
    suspend() { try { if (ac && ac.state === 'running') ac.suspend(); } catch (e) { /* noop */ } },
    resume() { try { if (ac && ac.state === 'suspended') ac.resume(); } catch (e) { /* noop */ } },
    ui() { tone({ f: 880, dur: 0.07, type: 'triangle', v: 0.06 }); tone({ f: 1320, dur: 0.05, type: 'sine', v: 0.03, at: 0.03 }); },
    fail() { [0, -3, -7].forEach((s, k) => tone({ f: 330 * Math.pow(2, s / 12), dur: 0.6, type: 'triangle', v: 0.09, at: k * 0.12, echo: 0.4 })); },
  };
  window.Sfx = S;
})();
