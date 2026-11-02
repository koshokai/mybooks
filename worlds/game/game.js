/* =========================================================
   轨 · 引力星轨 —— 渲染、输入、界面与流程
   ========================================================= */
(() => {
  'use strict';
  const P = window.OrbitPhys, C = P.C, LV = window.OrbitLevels, Sfx = window.Sfx;
  const TAU = Math.PI * 2, D2R = Math.PI / 180;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = t => 1 - Math.pow(1 - t, 3);

  const cv = $('#cv');
  const ctx = cv.getContext('2d');

  /* ---------------- 存档 ---------------- */
  const KEY = 'mybooks.game.orbit.v1';
  const save = (() => {
    let d = null;
    try { d = JSON.parse(localStorage.getItem(KEY)); } catch (e) { d = null; }
    if (!d || typeof d !== 'object') d = {};
    if (!Array.isArray(d.stars)) d.stars = [];
    if (!d.daily || typeof d.daily !== 'object') d.daily = {};
    d.dailyBest = d.dailyBest || 0;
    d.tips = d.tips || {};
    return d;
  })();
  const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(save)); } catch (e) { /* 隐私模式 */ } };
  const QS = new URLSearchParams(location.search);
  const DEV = QS.get('dev') === '1';
  const NLV = LV.LEVELS.length;
  const isUnlocked = i => DEV || i === 0 || (save.stars[i - 1] || 0) > 0;
  const totalStars = () => save.stars.reduce((a, b) => a + (b || 0), 0);
  const todayStr = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const todayCN = () => { const d = new Date(); return (d.getMonth() + 1) + '月' + d.getDate() + '日'; };

  /* ---------------- 万象游戏厅共享进度 ---------------- */
  const AR = window.WXArcade || null;
  const GAME_ID = 'orbit';
  const arc = (fn, ...a) => { try { return AR ? AR[fn](...a) : null; } catch (e) { return null; } };
  function addDust(n) { if (n > 0) arc('addStardust', n, GAME_ID); return n; }
  const achQueue = [];
  let achBusy = false;
  function achieve(id, name) {
    if (arc('unlock', GAME_ID + ':' + id, name) !== true) return;
    achQueue.push(name);
    if (!achBusy) nextAch();
  }
  function nextAch() {
    const name = achQueue.shift();
    const el = document.getElementById('ach');
    if (!name || !el) { achBusy = false; return; }
    achBusy = true;
    el.querySelector('b').textContent = name;
    el.classList.add('show');
    try { Sfx.unlock(); } catch (e) { /* noop */ }
    setTimeout(() => { el.classList.remove('show'); setTimeout(nextAch, 450); }, 2600);
  }
  function refreshDust() {
    const n = arc('getStardust');
    const html = n == null ? '' : `<span class="dust-ic">✦</span>星尘 <b>${n}</b>`;
    const a = document.getElementById('title-dust'), b = document.getElementById('map-dust');
    if (a) a.innerHTML = html;
    if (b) b.innerHTML = html;
  }
  if (AR && AR.on) AR.on('change', refreshDust);

  /* ---------------- 颜色 ---------------- */
  function hsl2rgb(h, s, l) {
    h = ((h % 360) + 360) % 360 / 360; s /= 100; l /= 100;
    const f = n => { const k = (n + h * 12) % 12; return l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
    return Math.round(f(0) * 255) + ',' + Math.round(f(8) * 255) + ',' + Math.round(f(4) * 255);
  }
  const COL = { cyan: '127,232,255', white: '255,255,255', gold: '255,211,107', rose: '255,110,150', violet: '190,120,255', green: '140,255,190', orange: '255,150,60' };

  /* ---------------- 视口 ---------------- */
  let VW = 0, VH = 0, DPR = 1;
  const view = { s: 1, rot: false, cx: 0, cy: 0 };
  function layout() {
    VW = window.innerWidth; VH = window.innerHeight;
    DPR = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.round(VW * DPR); cv.height = Math.round(VH * DPR);
    const top = 62, bottom = 12, side = 8;
    const aw = VW - side * 2, ah = VH - top - bottom;
    const sP = Math.min(aw / C.W, ah / C.H), sR = Math.min(aw / C.H, ah / C.W);
    view.rot = sR > sP * 1.08;
    view.s = view.rot ? sR : sP;
    view.cx = VW / 2; view.cy = top + ah / 2;
    makeBackdrop();
    makeStars();
    spriteCache.clear();
    titleScene.planet = null;
  }
  function setWorld(ox, oy) {
    const s = view.s * DPR, cx = (view.cx + ox) * DPR, cy = (view.cy + oy) * DPR;
    if (!view.rot) ctx.setTransform(s, 0, 0, s, cx - C.W / 2 * s, cy - C.H / 2 * s);
    else ctx.setTransform(0, s, -s, 0, cx + C.H / 2 * s, cy - C.W / 2 * s);
  }
  function w2s(x, y) {
    if (!view.rot) return [view.cx + (x - C.W / 2) * view.s, view.cy + (y - C.H / 2) * view.s];
    return [view.cx - (y - C.H / 2) * view.s, view.cy + (x - C.W / 2) * view.s];
  }
  function s2wVec(dx, dy) { return view.rot ? [dy / view.s, -dx / view.s] : [dx / view.s, dy / view.s]; }

  /* ---------------- 背景：星云 + 视差星空 ---------------- */
  let backdrop = null, backHue = 225;
  function makeBackdrop() {
    const c = backdrop || document.createElement('canvas');
    c.width = cv.width; c.height = cv.height;
    const g = c.getContext('2d');
    const W = c.width, H = c.height;
    g.fillStyle = '#04050c'; g.fillRect(0, 0, W, H);
    const rnd = LV.mulberry32(7 + Math.round(backHue));
    const blobs = [[backHue, 0.2], [backHue + 60, 0.14], [backHue - 50, 0.12], [backHue + 150, 0.07], [backHue + 20, 0.1]];
    for (const [h, a] of blobs) {
      const x = rnd() * W, y = rnd() * H, r = (0.35 + rnd() * 0.5) * Math.max(W, H);
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, `hsla(${h},80%,45%,${a})`); gr.addColorStop(0.5, `hsla(${h},80%,30%,${a * 0.35})`); gr.addColorStop(1, 'hsla(0,0%,0%,0)');
      g.fillStyle = gr; g.fillRect(0, 0, W, H);
    }
    // 细尘带
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 260; i++) {
      const t = rnd(), x = t * W, y = H * (0.25 + 0.5 * t) + (rnd() - 0.5) * H * 0.35;
      const r = (8 + rnd() * 40) * DPR;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, `hsla(${backHue + rnd() * 60},70%,70%,0.025)`); gr.addColorStop(1, 'hsla(0,0%,0%,0)');
      g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    g.globalCompositeOperation = 'source-over';
    const vg = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,6,0.65)');
    g.fillStyle = vg; g.fillRect(0, 0, W, H);
    backdrop = c;
  }
  function setBackHue(h) { if (h !== backHue) { backHue = h; makeBackdrop(); } }

  let stars = [];
  function makeStars() {
    const rnd = LV.mulberry32(42);
    const n = Math.round(clamp(VW * VH / 2600, 160, 520));
    stars = [];
    for (let i = 0; i < n; i++) {
      const z = rnd();
      stars.push({ x: rnd() * VW, y: rnd() * VH, z, r: 0.4 + z * z * 1.6, tw: rnd() * TAU, hue: rnd() < 0.2 ? 40 : rnd() < 0.3 ? 200 : 220 });
    }
  }
  const cam = { x: 0, y: 0, tx: 0, ty: 0 };
  function drawStars(t) {
    cam.x += (cam.tx - cam.x) * 0.04; cam.y += (cam.ty - cam.y) * 0.04;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    for (const s of stars) {
      const par = 4 + s.z * 30;
      let x = (s.x - cam.x * par * 0.02 - t * (2 + s.z * 6)) % VW; if (x < 0) x += VW;
      let y = (s.y - cam.y * par * 0.02) % VH; if (y < 0) y += VH;
      const a = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * (1 + s.z * 2) + s.tw)) * (0.4 + s.z * 0.6);
      ctx.globalAlpha = a;
      ctx.fillStyle = s.hue === 40 ? '#ffe6b8' : s.hue === 200 ? '#bfeaff' : '#e8ecff';
      if (s.r > 1.4) { ctx.drawImage(glow(COL.white), x - s.r * 3, y - s.r * 3, s.r * 6, s.r * 6); }
      ctx.fillRect(x - s.r / 2, y - s.r / 2, s.r, s.r);
    }
    ctx.globalAlpha = 1;
  }

  /* ---------------- 精灵 ---------------- */
  const glowCache = {};
  function glow(col) {
    if (glowCache[col]) return glowCache[col];
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, `rgba(${col},1)`); gr.addColorStop(0.18, `rgba(${col},0.6)`);
    gr.addColorStop(0.45, `rgba(${col},0.16)`); gr.addColorStop(1, `rgba(${col},0)`);
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    return (glowCache[col] = c);
  }
  function dGlow(x, y, r, col, a) { if (a <= 0) return; ctx.globalAlpha = a; ctx.drawImage(glow(col), x - r, y - r, r * 2, r * 2); }

  const spriteCache = new Map();
  /** 行星精灵：r 为设计单位半径，sc 为每单位像素数（已含 DPR） */
  function planetSprite(p, sc) {
    const key = p.x + ',' + p.y + ',' + p.r + ',' + p.hue + ',' + (p.ring ? 1 : 0) + '@' + sc.toFixed(3);
    let c = spriteCache.get(key);
    if (c) return c;
    const pad = p.ring ? p.r * 1.95 : p.r * 1.12;
    const size = Math.ceil(pad * 2 * sc) + 4;
    c = document.createElement('canvas'); c.width = c.height = size;
    const g = c.getContext('2d');
    g.translate(size / 2, size / 2); g.scale(sc, sc);
    const r = p.r, h = p.hue;
    const rnd = LV.mulberry32(Math.round(p.x * 31 + p.y * 17 + h));
    const ring = (front) => {
      g.save(); g.rotate(-0.38);
      for (let k = 0; k < 4; k++) {
        const rx = r * (1.42 + k * 0.13), ry = rx * 0.26;
        g.beginPath();
        g.ellipse(0, 0, rx, ry, 0, front ? 0 : Math.PI, front ? Math.PI : TAU);
        g.strokeStyle = `hsla(${h + 30 + k * 8},70%,${70 - k * 6}%,${0.55 - k * 0.1})`;
        g.lineWidth = r * (0.09 - k * 0.012);
        g.stroke();
      }
      g.restore();
    };
    if (p.ring) ring(false);
    g.save();
    g.beginPath(); g.arc(0, 0, r, 0, TAU); g.clip();
    const base = g.createRadialGradient(-r * 0.4, -r * 0.45, r * 0.05, 0, 0, r * 1.25);
    base.addColorStop(0, `hsl(${h},75%,78%)`); base.addColorStop(0.45, `hsl(${h + 8},62%,50%)`); base.addColorStop(1, `hsl(${h + 25},60%,16%)`);
    g.fillStyle = base; g.fillRect(-r, -r, r * 2, r * 2);
    // 云带
    g.save(); g.rotate(-0.38 + (rnd() - 0.5) * 0.3);
    for (let i = 0; i < 9; i++) {
      const y = -r + rnd() * r * 2, bh = r * (0.04 + rnd() * 0.14);
      g.beginPath();
      g.moveTo(-r * 1.2, y);
      for (let x = -r * 1.2; x <= r * 1.2; x += r * 0.2) g.lineTo(x, y + Math.sin(x / r * 4 + i) * r * 0.04);
      g.lineTo(r * 1.2, y + bh); g.lineTo(-r * 1.2, y + bh); g.closePath();
      g.fillStyle = `hsla(${h + (rnd() - 0.5) * 50},70%,${rnd() < 0.5 ? 82 : 25}%,${0.08 + rnd() * 0.12})`;
      g.fill();
    }
    g.restore();
    // 陨坑 / 斑点
    for (let i = 0; i < 6; i++) {
      const a = rnd() * TAU, d = rnd() * r * 0.75, cr = r * (0.05 + rnd() * 0.1);
      g.beginPath(); g.arc(Math.cos(a) * d, Math.sin(a) * d, cr, 0, TAU);
      g.fillStyle = `hsla(${h + 20},50%,20%,0.09)`; g.fill();
    }
    // 明暗交界
    const sh = g.createLinearGradient(-r * 0.7, -r * 0.7, r * 0.8, r * 0.8);
    sh.addColorStop(0, 'rgba(0,0,10,0)'); sh.addColorStop(0.5, 'rgba(0,0,10,0.08)'); sh.addColorStop(1, 'rgba(2,2,14,0.82)');
    g.fillStyle = sh; g.fillRect(-r, -r, r * 2, r * 2);
    // 大气边缘
    const rim = g.createRadialGradient(0, 0, r * 0.78, 0, 0, r);
    rim.addColorStop(0, `hsla(${h},100%,75%,0)`); rim.addColorStop(1, `hsla(${h},100%,80%,0.45)`);
    g.fillStyle = rim; g.fillRect(-r, -r, r * 2, r * 2);
    g.restore();
    if (p.ring) ring(true);
    spriteCache.set(key, c);
    return c;
  }
  function drawPlanetSprite(p, x, y, sc) {
    const c = planetSprite(p, sc);
    const w = c.width / sc;
    ctx.save(); ctx.translate(x, y);
    if (view.rot && G.mode === 'play') ctx.rotate(-Math.PI / 2);
    ctx.drawImage(c, -w / 2, -w / 2, w, w);
    ctx.restore();
  }

  /* ---------------- 粒子 ---------------- */
  let parts = [];
  function spark(x, y, o) {
    if (parts.length > 900) parts.shift();
    const a = o.a != null ? o.a : Math.random() * TAU;
    const sp = o.sp != null ? o.sp : 50 + Math.random() * 200;
    parts.push({ x, y, vx: Math.cos(a) * sp + (o.vx || 0), vy: Math.sin(a) * sp + (o.vy || 0), life: o.life || 0.8, max: o.life || 0.8, r: o.r || 3, col: o.col || COL.cyan, drag: o.drag == null ? 2.2 : o.drag, kind: o.kind || 'spark', grow: o.grow || 0 });
  }
  function burst(x, y, n, o) { for (let i = 0; i < n; i++) spark(x, y, Object.assign({}, o, { sp: (o.sp || 220) * (0.25 + Math.random() * 0.9), life: (o.life || 0.8) * (0.5 + Math.random() * 0.7), r: (o.r || 3) * (0.5 + Math.random()) })); }
  function ringFx(x, y, r0, r1, col, life, w) { parts.push({ x, y, vx: 0, vy: 0, life, max: life, r: r0, r1, col, kind: 'ring', w: w || 3, drag: 0 }); }
  function updParts(dt) {
    for (const p of parts) {
      p.life -= dt;
      const k = Math.exp(-p.drag * dt);
      p.vx *= k; p.vy *= k;
      p.x += p.vx * dt; p.y += p.vy * dt;
    }
    parts = parts.filter(p => p.life > 0);
  }
  function drawParts() {
    ctx.globalCompositeOperation = 'lighter';
    for (const p of parts) {
      const t = p.life / p.max;
      if (p.kind === 'ring') {
        const r = lerp(p.r1, p.r, ease(t));
        ctx.globalAlpha = t * 0.8;
        ctx.strokeStyle = `rgba(${p.col},1)`; ctx.lineWidth = p.w * t + 0.5;
        ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TAU); ctx.stroke();
      } else if (p.kind === 'flash') {
        dGlow(p.x, p.y, p.r * (1 + (1 - t) * 0.6), p.col, t * t);
      } else {
        const r = p.r * (0.4 + t * 0.8);
        dGlow(p.x, p.y, r * 4, p.col, t * 0.9);
        ctx.globalAlpha = t; ctx.fillStyle = '#fff';
        ctx.fillRect(p.x - r * 0.35, p.y - r * 0.35, r * 0.7, r * 0.7);
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  /* ---------------- 游戏状态 ---------------- */
  const G = {
    mode: 'title', // title | map | play
    L: null, def: null, idx: 0, daily: null,
    phase: 'aim', // aim | fly | dead | respawn | won | over
    s: null, got: [], used: 0, maxL: 3,
    trail: [], ghost: [], curGhost: [],
    drag: null, aim: null, preview: [],
    shake: 0, ts: 1, slow: 0, acc: 0, timer: 0,
    moonT: 0, rewindFrom: 0, portalOpen: 0, flightN: 0,
    rocksGeo: [], paused: false, t0: 0, lastPowTick: -1, hand: 0,
    winAt: null, deathAt: null,
  };

  function loadLevel(def, opts) {
    closeModals(); G.paused = false;
    G.def = def;
    G.L = P.prepare(def);
    G.got = G.L.motes.map(() => false);
    G.used = 0; G.phase = 'aim'; G.s = null;
    G.trail = []; G.ghost = []; G.curGhost = []; G.preview = []; G.drag = null; G.aim = null;
    G.lastAim = null; G.kbAim = false;
    parts = []; G.shake = 0; G.ts = 1; G.slow = 0; G.acc = 0;
    G.moonT = 0; G.rewindFrom = 0; G.portalOpen = G.L.motes.length === 0 ? 1 : 0; G.hand = 0; G.handOff = false;
    G.t0 = performance.now();
    G.rocksGeo = G.L.rocks.map((a, i) => {
      const rnd = LV.mulberry32(i * 977 + Math.round(a.x * 13 + a.y));
      const n = 9 + Math.floor(rnd() * 4), v = [];
      for (let k = 0; k < n; k++) v.push([k / n * TAU + (rnd() - 0.5) * 0.3, a.r * (0.86 + rnd() * 0.24)]);
      return { v, spin: (rnd() - 0.5) * 0.8, c: [[rnd() * 0.5 - 0.25, rnd() * 0.5 - 0.25, 0.22 + rnd() * 0.12], [rnd() * 0.6 - 0.3, rnd() * 0.6 - 0.3, 0.12 + rnd() * 0.1]] };
    });
    G.mode = 'play';
    G.devPath = null;
    if (DEV && QS.get('path') === '1' && def.hint) G.devPath = P.simulate(G.L, def.hint[0] * D2R, def.hint[1], { path: true, every: 3 }).path;
    // 起点“重生”特效
    ringFx(G.L.start[0], G.L.start[1], 4, 46, COL.cyan, 0.8, 3);
    updHud();
    if (opts && opts.banner) showBanner(opts.banner[0], opts.banner[1]);
  }

  function playLevel(i) {
    G.idx = i; G.daily = null; G.maxL = 3;
    const ch = Math.floor(i / 5);
    setBackHue(LV.CHAPTERS[ch].hue + 20);
    loadLevel(LV.LEVELS[i], { banner: [`第${'一二三四'[ch]}星域 · ${LV.CHAPTERS[ch].name}`, `${ch + 1}-${i % 5 + 1}　${LV.LEVELS[i].name}`] });
    showScreen(null);
    $('#hud-ch').textContent = `${LV.CHAPTERS[ch].en} · ${ch + 1}-${i % 5 + 1}`;
    $('#hud-name').textContent = LV.LEVELS[i].name;
    const tip = LV.TIPS[i];
    if (tip) showTip(tip, 5200, 1400);
    else hideTip();
  }

  function startDaily() {
    const date = todayStr();
    G.daily = { date, k: 0, pool: 6, cleared: 0, gen: null };
    G.maxL = 99;
    nextDaily(true);
  }
  function nextDaily(first) {
    const D = G.daily;
    const def = D.gen && D.gen.k === D.k ? D.gen.def : LV.genDaily(D.date, D.k);
    setBackHue(((D.k * 47) % 360 + 200) % 360);
    loadLevel(def, { banner: [first ? '每日星图 · ' + todayCN() : '下一张星图', `第 ${D.k + 1} 张`] });
    showScreen(null);
    $('#hud-ch').textContent = `DAILY · ${todayCN()}`;
    $('#hud-name').textContent = `每日星图 · 第 ${D.k + 1} 张`;
    hideTip();
    D.gen = null;
    // 预先生成下一张，避免等待
    setTimeout(() => { if (G.daily === D && !D.gen) D.gen = { k: D.k + 1, def: LV.genDaily(D.date, D.k + 1) }; }, 900);
  }

  function launchesLeft() { return G.daily ? G.daily.pool : G.maxL - G.used; }

  function doLaunch(angle, power) {
    if (G.phase !== 'aim' || launchesLeft() <= 0) return;
    G.used++;
    if (G.daily) G.daily.pool--;
    G.lastAim = { angle, power }; G.kbAim = false;
    G.s = P.launch(G.L, angle, power, G.got);
    G.phase = 'fly'; G.flightN = 0; G.acc = 0;
    G.trail = []; G.curGhost = [];
    G.drag = null; G.aim = null; G.preview = [];
    G.handOff = true;
    const [x, y] = G.L.start;
    burst(x, y, 26, { col: COL.cyan, sp: 260, life: 0.6, r: 2.6, a: undefined });
    ringFx(x, y, 6, 40 + power * 30, COL.cyan, 0.5, 4);
    G.shake = Math.max(G.shake, 2 + power * 4);
    Sfx.launch(power);
    updHud();
  }

  function onEvent(e) {
    const s = G.s;
    switch (e.t) {
      case 'mote': {
        G.got[e.i] = true; G.flightN++;
        burst(e.x, e.y, 30, { col: COL.gold, sp: 240, life: 0.9, r: 3 });
        ringFx(e.x, e.y, 6, 52, COL.gold, 0.6, 3);
        parts.push({ x: e.x, y: e.y, vx: 0, vy: 0, life: 0.35, max: 0.35, r: 60, col: COL.gold, kind: 'flash', drag: 0 });
        Sfx.mote(G.flightN - 1 + (G.got.filter(Boolean).length - G.flightN));
        G.shake = Math.max(G.shake, 2.5);
        if (G.got.every(Boolean)) setTimeout(() => openPortal(), 180);
        updHud();
        break;
      }
      case 'bounce': {
        burst(e.x, e.y, 14 + Math.min(20, e.power / 25), { col: COL.orange, sp: 200, life: 0.5, r: 2.4 });
        G.shake = Math.max(G.shake, clamp(e.power / 60, 2, 9));
        Sfx.bounce(e.power);
        break;
      }
      case 'boost': {
        burst(e.x, e.y, 26, { col: COL.green, sp: 260, life: 0.6, r: 2.6 });
        ringFx(e.x, e.y, C.RING_R, C.RING_R * 2.6, COL.green, 0.55, 4);
        G.shake = Math.max(G.shake, 4);
        Sfx.boost();
        break;
      }
      case 'warp': {
        burst(e.x, e.y, 24, { col: COL.violet, sp: 200, life: 0.6, r: 2.6 });
        burst(e.x2, e.y2, 30, { col: COL.violet, sp: 260, life: 0.7, r: 2.8 });
        ringFx(e.x2, e.y2, 4, 56, COL.violet, 0.6, 4);
        G.trail.push(null);
        G.curGhost.push(null);
        G.shake = Math.max(G.shake, 4);
        Sfx.warp();
        break;
      }
      case 'near': {
        G.slow = 0.55;
        Sfx.near();
        break;
      }
      case 'crash': {
        const hue = e.kind === 'planet' ? G.L.planets[e.i].hue : 220;
        const col = hsl2rgb(hue, 90, 70);
        burst(e.x, e.y, 70, { col, sp: 340, life: 1.1, r: 3.4 });
        burst(e.x, e.y, 30, { col: COL.white, sp: 180, life: 0.6, r: 2.4 });
        ringFx(e.x, e.y, 6, 80, col, 0.7, 5);
        parts.push({ x: e.x, y: e.y, vx: 0, vy: 0, life: 0.5, max: 0.5, r: 110, col: COL.orange, kind: 'flash', drag: 0 });
        G.shake = 16;
        Sfx.crash();
        endFlight(1.0);
        break;
      }
      case 'swallow': {
        const h = G.L.holes[e.i];
        for (let i = 0; i < 40; i++) {
          const a = Math.random() * TAU, d = 30 + Math.random() * 50;
          spark(h.x + Math.cos(a) * d, h.y + Math.sin(a) * d, { a: a + Math.PI + 0.9, sp: 120 + Math.random() * 80, col: COL.orange, life: 0.7, r: 2.4, drag: 0.5 });
        }
        ringFx(h.x, h.y, 90, 10, COL.orange, 0.7, 3);
        G.shake = 10;
        Sfx.swallow();
        endFlight(1.2);
        break;
      }
      case 'lost': Sfx.lost(); endFlight(0.6); break;
      case 'timeout': burst(s.x, s.y, 24, { col: COL.cyan, sp: 120, life: 0.7, r: 2 }); Sfx.fizzle(); endFlight(0.7); break;
      case 'win': {
        G.phase = 'won'; G.timer = 0;
        G.winAt = [s.x, s.y];
        const [px, py] = G.L.portal;
        burst(px, py, 80, { col: COL.cyan, sp: 380, life: 1.2, r: 3.2 });
        burst(px, py, 40, { col: COL.gold, sp: 260, life: 1.0, r: 3 });
        ringFx(px, py, 10, 120, COL.white, 0.9, 5);
        ringFx(px, py, 10, 70, COL.cyan, 0.7, 3);
        parts.push({ x: px, y: py, vx: 0, vy: 0, life: 0.7, max: 0.7, r: 160, col: COL.cyan, kind: 'flash', drag: 0 });
        G.shake = 8; G.slow = 0.9;
        Sfx.win();
        hideRecall();
        break;
      }
    }
  }

  function openPortal() {
    if (G.portalOpen) return;
    G.portalOpen = performance.now();
    const [px, py] = G.L.portal;
    ringFx(px, py, 8, 90, COL.cyan, 0.9, 4);
    burst(px, py, 40, { col: COL.cyan, sp: 220, life: 0.9, r: 2.6 });
    Sfx.unlock();
  }

  function endFlight(delay) {
    G.phase = 'dead'; G.timer = delay; G.deathAt = G.s ? [G.s.x, G.s.y] : null;
    G.ghost = G.curGhost; G.curGhost = [];
    hideRecall();
  }

  function recall() {
    if (G.phase !== 'fly') return;
    burst(G.s.x, G.s.y, 24, { col: COL.cyan, sp: 120, life: 0.7, r: 2 });
    Sfx.fizzle();
    endFlight(0.5);
  }

  function respawn() {
    G.phase = 'respawn'; G.timer = 0.65;
    G.rewindFrom = G.s ? G.s.t : 0;
    G.s = null;
    const [x, y] = G.L.start;
    ringFx(x, y, 60, 4, COL.cyan, 0.6, 3);
  }

  /* ---------------- 每帧更新 ---------------- */
  function update(dt) {
    if (G.mode !== 'play' || G.paused) { updParts(dt); return; }
    G.slow -= dt;
    const target = G.phase === 'won' ? 0.35 : G.slow > 0 ? 0.3 : 1;
    G.ts += (target - G.ts) * Math.min(1, dt * (target < G.ts ? 14 : 4));
    const sdt = dt * G.ts;

    if (G.phase === 'fly') {
      const s = G.s;
      G.acc += sdt;
      let n = 0;
      while (G.acc >= C.DT && n < 60 && !s.end) {
        P.step(G.L, s); G.acc -= C.DT; n++;
        if (n % 2 === 0) { G.trail.push([s.x, s.y]); if (G.trail.length > 80) G.trail.shift(); }
        if (n % 3 === 0) G.curGhost.push([s.x, s.y]);
        if (s.ev.length) { const evs = s.ev.splice(0); for (const e of evs) onEvent(e); }
      }
      if (G.phase === 'fly') {
        G.moonT = s.t;
        if (Math.random() < 0.9) spark(s.x, s.y, { sp: 20 + Math.random() * 40, col: Math.random() < 0.3 ? COL.white : COL.cyan, life: 0.5, r: 1.8, drag: 1.5 });
        if (s.t > 2.2) showRecall();
      }
    } else if (G.phase === 'dead') {
      G.timer -= dt;
      if (G.trail.length) G.trail.shift();
      if (G.timer <= 0) {
        if (launchesLeft() > 0) respawn();
        else { G.phase = 'over'; setTimeout(() => showFail(), 250); }
      }
    } else if (G.phase === 'aim') {
      if (!G.handOff) G.hand += dt;
    } else if (G.phase === 'respawn') {
      G.timer -= dt;
      G.moonT = G.rewindFrom * ease(clamp(G.timer / 0.65, 0, 1));
      if (G.trail.length) G.trail.shift();
      if (G.timer <= 0) { G.phase = 'aim'; G.moonT = 0; G.trail = []; }
    } else if (G.phase === 'won') {
      G.timer += dt;
      if (G.trail.length) G.trail.shift();
      if (G.timer > 1.15 && G.timer - dt <= 1.15) onWinCard();
    }
    updParts(sdt);
    G.shake *= Math.exp(-dt * 7);
    // 视差跟随
    let fx = C.W / 2, fy = C.H / 2;
    if (G.s && G.phase === 'fly') { fx = G.s.x; fy = G.s.y; }
    const sp = w2s(fx, fy);
    cam.tx = sp[0] - VW / 2; cam.ty = sp[1] - VH / 2;
    if (G.drag && G.aim) { cam.tx -= (G.drag.x - G.drag.x0) * 0.4; cam.ty -= (G.drag.y - G.drag.y0) * 0.4; }
  }

  /* ---------------- 绘制：关卡 ---------------- */
  function drawFrame() {
    const c = 'rgba(160,200,255,';
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = c + '0.22)';
    const L = 26;
    ctx.beginPath();
    for (const [x, y, sx, sy] of [[0, 0, 1, 1], [C.W, 0, -1, 1], [C.W, C.H, -1, -1], [0, C.H, 1, -1]]) {
      ctx.moveTo(x + sx * L, y); ctx.lineTo(x, y); ctx.lineTo(x, y + sy * L);
    }
    ctx.stroke();
    ctx.strokeStyle = c + '0.05)';
    ctx.strokeRect(0, 0, C.W, C.H);
  }

  function drawPlanets(T) {
    const sc = view.s * DPR;
    for (const p of G.L.planets) {
      const col = hsl2rgb(p.hue, 90, 65);
      ctx.globalCompositeOperation = 'lighter';
      // 引力涟漪（向内收缩）
      for (let k = 0; k < 3; k++) {
        const ph = (T * 0.32 + k / 3) % 1;
        const rr = p.r + (1 - ph) * p.r * 2.4;
        ctx.globalAlpha = Math.sin(ph * Math.PI) * 0.12 * clamp(p.m / 5e6, 0.5, 1.6);
        ctx.strokeStyle = `rgba(${col},1)`; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(p.x, p.y, rr, 0, TAU); ctx.stroke();
      }
      dGlow(p.x, p.y, p.r * 3.1, col, 0.35);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      drawPlanetSprite(p, p.x, p.y, sc);
    }
  }

  function moonAt(m) { return P.moonPos(m, G.moonT); }
  function drawMoons(T) {
    for (const m of G.L.moons) {
      ctx.setLineDash([2, 7]); ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(200,215,255,0.16)';
      ctx.beginPath(); ctx.arc(m.cx, m.cy, m.orbit, 0, TAU); ctx.stroke();
      ctx.setLineDash([]);
      const [x, y] = moonAt(m);
      // 运行方向小箭头
      const a = m.ph + m.w * G.moonT + Math.sign(m.w) * 0.35;
      ctx.globalCompositeOperation = 'lighter';
      dGlow(m.cx + Math.cos(a) * m.orbit, m.cy + Math.sin(a) * m.orbit, 6, '200,215,255', 0.5);
      dGlow(x, y, m.r * 3, '200,215,255', 0.35);
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
      const gr = ctx.createRadialGradient(x - m.r * 0.4, y - m.r * 0.4, 1, x, y, m.r);
      gr.addColorStop(0, '#f2f4ff'); gr.addColorStop(0.6, '#9aa3c0'); gr.addColorStop(1, '#3c4260');
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, m.r, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(40,46,70,0.5)';
      ctx.beginPath(); ctx.arc(x + m.r * 0.25, y + m.r * 0.1, m.r * 0.22, 0, TAU); ctx.fill();
    }
  }

  function drawHoles(T) {
    for (const h of G.L.holes) {
      // 暗化 / 透镜
      const dk = ctx.createRadialGradient(h.x, h.y, h.r, h.x, h.y, h.r * 6);
      dk.addColorStop(0, 'rgba(0,0,0,0.85)'); dk.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = dk; ctx.beginPath(); ctx.arc(h.x, h.y, h.r * 6, 0, TAU); ctx.fill();
      ctx.globalCompositeOperation = 'lighter';
      for (let k = 0; k < 3; k++) {
        const ph = (T * 0.5 + k / 3) % 1;
        ctx.globalAlpha = Math.sin(ph * Math.PI) * 0.16;
        ctx.strokeStyle = 'rgba(255,140,80,1)'; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(h.x, h.y, h.r + (1 - ph) * h.r * 6, 0, TAU); ctx.stroke();
      }
      dGlow(h.x, h.y, h.r * 4.5, COL.orange, 0.35);
      // 吸积盘
      for (let k = 0; k < 6; k++) {
        const rr = h.r * 1.35 + k * 3.2;
        const a0 = T * (3.2 - k * 0.35) + k * 1.7;
        ctx.globalAlpha = 0.55 - k * 0.07;
        ctx.strokeStyle = `hsl(${28 + k * 7},100%,${68 - k * 4}%)`;
        ctx.lineWidth = 2.6 - k * 0.25;
        ctx.beginPath(); ctx.arc(h.x, h.y, rr, a0, a0 + 2.2); ctx.stroke();
        ctx.beginPath(); ctx.arc(h.x, h.y, rr, a0 + Math.PI, a0 + Math.PI + 1.4); ctx.stroke();
      }
      // 坠落的尘埃
      for (let i = 0; i < 16; i++) {
        const ph = (T * 0.22 + i / 16) % 1;
        const rad = h.r + (1 - ph) * h.r * 5.5, ang = i * 2.39 + ph * 6;
        dGlow(h.x + Math.cos(ang) * rad, h.y + Math.sin(ang) * rad, 5, COL.orange, ph * 0.7);
      }
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
      ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(h.x, h.y, h.r, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(255,220,180,0.85)'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.arc(h.x, h.y, h.r + 0.8, 0, TAU); ctx.stroke();
    }
  }

  function drawRocks(T) {
    G.L.rocks.forEach((a, i) => {
      const g = G.rocksGeo[i];
      ctx.save(); ctx.translate(a.x, a.y); ctx.rotate(T * g.spin);
      ctx.beginPath();
      g.v.forEach(([ang, r], k) => { const x = Math.cos(ang) * r, y = Math.sin(ang) * r; k ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
      ctx.closePath();
      const gr = ctx.createRadialGradient(-a.r * 0.4, -a.r * 0.4, 1, 0, 0, a.r * 1.2);
      gr.addColorStop(0, '#a89a8c'); gr.addColorStop(0.55, '#5c524c'); gr.addColorStop(1, '#221e22');
      ctx.fillStyle = gr; ctx.fill();
      ctx.strokeStyle = 'rgba(255,200,150,0.35)'; ctx.lineWidth = 1.3; ctx.stroke();
      for (const [cx, cy, cr] of g.c) {
        ctx.beginPath(); ctx.arc(cx * a.r, cy * a.r, cr * a.r, 0, TAU);
        ctx.fillStyle = 'rgba(25,20,24,0.4)'; ctx.fill();
      }
      ctx.restore();
    });
  }

  function drawWorms(T) {
    G.L.worms.forEach((w, i) => {
      const hue = [285, 185, 330][i % 3];
      const col = hsl2rgb(hue, 90, 70);
      // 连线
      ctx.setLineDash([3, 9]); ctx.lineWidth = 1.2;
      ctx.strokeStyle = `rgba(${col},0.13)`;
      ctx.beginPath(); ctx.moveTo(w.a[0], w.a[1]); ctx.lineTo(w.b[0], w.b[1]); ctx.stroke();
      ctx.setLineDash([]);
      [w.a, w.b].forEach((e, k) => {
        const [x, y] = e;
        const dk = ctx.createRadialGradient(x, y, 0, x, y, C.WORM_R);
        dk.addColorStop(0, 'rgba(0,0,0,0.9)'); dk.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = dk; ctx.beginPath(); ctx.arc(x, y, C.WORM_R, 0, TAU); ctx.fill();
        ctx.globalCompositeOperation = 'lighter';
        dGlow(x, y, C.WORM_R * 2.6, col, 0.35);
        const dir = k ? -1 : 1;
        for (let j = 0; j < 4; j++) {
          const rr = C.WORM_R * (0.35 + j * 0.2);
          const a0 = dir * T * (2.6 - j * 0.4) + j * 1.3;
          ctx.globalAlpha = 0.75 - j * 0.12;
          ctx.strokeStyle = `hsl(${hue + j * 10},95%,${75 - j * 6}%)`; ctx.lineWidth = 2.2;
          ctx.beginPath(); ctx.arc(x, y, rr, a0, a0 + 1.9); ctx.stroke();
          ctx.beginPath(); ctx.arc(x, y, rr, a0 + Math.PI, a0 + Math.PI + 1.9); ctx.stroke();
        }
        ctx.globalAlpha = 0.6; ctx.strokeStyle = `rgba(${col},1)`; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(x, y, C.WORM_R, 0, TAU); ctx.stroke();
        ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
      });
    });
  }

  function drawRings(T) {
    G.L.rings.forEach(g => {
      const { x, y } = g;
      ctx.globalCompositeOperation = 'lighter';
      dGlow(x, y, C.RING_R * 2.2, COL.green, 0.3);
      ctx.globalAlpha = 0.9; ctx.strokeStyle = 'rgba(160,255,200,1)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(x, y, C.RING_R, 0, TAU); ctx.stroke();
      // 旋转的箭羽
      for (let k = 0; k < 6; k++) {
        const a = T * 1.6 + k / 6 * TAU;
        const r1 = C.RING_R - 7, r2 = C.RING_R - 2;
        ctx.globalAlpha = 0.7;
        ctx.beginPath();
        ctx.moveTo(x + Math.cos(a - 0.18) * r1, y + Math.sin(a - 0.18) * r1);
        ctx.lineTo(x + Math.cos(a) * r2, y + Math.sin(a) * r2);
        ctx.lineTo(x + Math.cos(a + 0.18) * r1, y + Math.sin(a + 0.18) * r1);
        ctx.lineWidth = 1.6; ctx.stroke();
      }
      const ph = (T * 0.9) % 1;
      ctx.globalAlpha = (1 - ph) * 0.5; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(x, y, C.RING_R + ph * 16, 0, TAU); ctx.stroke();
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    });
  }

  function starPath(x, y, r, rot) {
    ctx.beginPath();
    for (let k = 0; k < 8; k++) {
      const a = rot + k / 8 * TAU, rr = k % 2 ? r * 0.32 : r;
      const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
      k ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.closePath();
  }
  function drawMotes(T) {
    G.L.motes.forEach((m, i) => {
      if (G.got[i]) return;
      const bob = Math.sin(T * 2.2 + i * 1.7) * 2.2;
      const x = m[0], y = m[1] + bob;
      const tw = 0.75 + 0.25 * Math.sin(T * 5 + i * 2);
      ctx.globalCompositeOperation = 'lighter';
      dGlow(x, y, 34 * tw, COL.gold, 0.6);
      dGlow(x, y, 12, COL.white, 0.5);
      ctx.globalAlpha = 0.95; ctx.fillStyle = '#fff3cf';
      starPath(x, y, 11 * tw, T * 0.8 + i);
      ctx.fill();
      ctx.fillStyle = '#ffe9a8';
      starPath(x, y, 18 * tw, -T * 0.5 + i + 0.39);
      ctx.globalAlpha = 0.16; ctx.fill();
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    });
  }

  function drawPortal(T) {
    const pt = G.L.portal; if (!pt) return;
    const [x, y] = pt;
    const open = !!G.portalOpen;
    const R = C.PORTAL_R;
    if (!open) {
      ctx.globalAlpha = 0.55;
      ctx.strokeStyle = 'rgba(170,190,240,1)'; ctx.lineWidth = 1.6;
      ctx.setLineDash([5, 7]); ctx.lineDashOffset = -T * 8;
      ctx.beginPath(); ctx.arc(x, y, R, 0, TAU); ctx.stroke();
      ctx.setLineDash([]); ctx.lineDashOffset = 0;
      ctx.globalAlpha = 0.25; ctx.beginPath(); ctx.arc(x, y, R * 0.55, 0, TAU); ctx.stroke();
      // 还差几颗星尘
      const n = G.L.motes.length, left = G.got.filter(b => !b).length;
      for (let k = 0; k < n; k++) {
        const a = -Math.PI / 2 + (k - (n - 1) / 2) * 0.42;
        const on = k >= left;
        ctx.globalAlpha = on ? 0.95 : 0.35;
        ctx.fillStyle = on ? '#ffd36b' : '#8f9cc4';
        ctx.beginPath(); ctx.arc(x + Math.cos(a) * (R + 9), y + Math.sin(a) * (R + 9), 2.4, 0, TAU); ctx.fill();
      }
      ctx.globalAlpha = 1;
      return;
    }
    const age = (performance.now() - G.portalOpen) / 1000;
    const pop = G.portalOpen === 1 ? 1 : clamp(age / 0.6, 0, 1);
    const sc = 0.6 + 0.4 * ease(pop) + (pop < 1 ? Math.sin(pop * Math.PI) * 0.25 : 0);
    ctx.globalCompositeOperation = 'lighter';
    dGlow(x, y, R * 3.6 * sc, COL.cyan, 0.45);
    dGlow(x, y, R * 1.4 * sc, COL.white, 0.5);
    for (let j = 0; j < 5; j++) {
      const rr = R * sc * (0.35 + j * 0.17);
      const a0 = (j % 2 ? -1 : 1) * T * (1.8 + j * 0.5) + j;
      ctx.globalAlpha = 0.85 - j * 0.12;
      ctx.strokeStyle = `hsl(${190 + j * 8},100%,${82 - j * 6}%)`; ctx.lineWidth = 2.2 - j * 0.2;
      ctx.beginPath(); ctx.arc(x, y, rr, a0, a0 + 2.4); ctx.stroke();
      ctx.beginPath(); ctx.arc(x, y, rr, a0 + Math.PI, a0 + Math.PI + 1.6); ctx.stroke();
    }
    for (let i = 0; i < 12; i++) {
      const ph = (T * 0.35 + i / 12) % 1;
      const rad = R * 0.4 + (1 - ph) * R * 2.2, ang = i * 2.39 - ph * 4;
      dGlow(x + Math.cos(ang) * rad, y + Math.sin(ang) * rad, 4, COL.cyan, ph * 0.8);
    }
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  }

  function drawGhost() {
    if (!G.ghost.length) return;
    ctx.fillStyle = 'rgba(160,210,255,1)';
    ctx.globalAlpha = 0.16;
    for (let i = 0; i < G.ghost.length; i += 2) { const q = G.ghost[i]; if (q) ctx.fillRect(q[0] - 1, q[1] - 1, 2, 2); }
    ctx.globalAlpha = 1;
  }

  /** 彗尾：按段填充的锥形光带（段间不重叠，避免叠加混合出现亮点） */
  function drawTrail() {
    const tr = G.trail, n = tr.length;
    if (n < 2) return;
    const runs = []; let cur = [];
    for (let i = 0; i < n; i++) {
      const q = tr[i];
      if (!q) { if (cur.length > 1) runs.push(cur); cur = []; } else cur.push([q[0], q[1], (i + 1) / n]);
    }
    if (cur.length > 1) runs.push(cur);
    ctx.globalCompositeOperation = 'lighter';
    for (const run of runs) {
      const m = run.length, Lp = [], Rp = [];
      for (let i = 0; i < m; i++) {
        const a = run[Math.max(0, i - 1)], b = run[Math.min(m - 1, i + 1)];
        let dx = b[0] - a[0], dy = b[1] - a[1];
        const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
        const w = 0.3 + run[i][2] * 3.4;
        Lp.push([run[i][0] - dy * w, run[i][1] + dx * w]);
        Rp.push([run[i][0] + dy * w, run[i][1] - dx * w]);
      }
      const K = Math.min(10, m - 1);
      for (let c = 0; c < K; c++) {
        const i0 = Math.floor(c * (m - 1) / K), i1 = Math.floor((c + 1) * (m - 1) / K);
        if (i1 <= i0) continue;
        const t = run[i1][2];
        ctx.globalAlpha = t * t * 0.95;
        ctx.fillStyle = t > 0.72 ? '#e4faff' : '#5fd2ff';
        ctx.beginPath();
        ctx.moveTo(Lp[i0][0], Lp[i0][1]);
        for (let i = i0 + 1; i <= i1; i++) ctx.lineTo(Lp[i][0], Lp[i][1]);
        for (let i = i1; i >= i0; i--) ctx.lineTo(Rp[i][0], Rp[i][1]);
        ctx.closePath(); ctx.fill();
      }
      for (let i = m - 1; i >= 0; i -= 5) { const t = run[i][2]; dGlow(run[i][0], run[i][1], 6 + t * 12, COL.cyan, 0.16 * t); }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  function drawComet(x, y, scale, T) {
    ctx.globalCompositeOperation = 'lighter';
    const p = 1 + Math.sin(T * 6) * 0.06;
    dGlow(x, y, 34 * scale * p, COL.cyan, 0.75);
    dGlow(x, y, 14 * scale, COL.white, 0.9);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1; ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(x, y, C.COMET_R * 0.8 * scale, 0, TAU); ctx.fill();
  }

  function drawPad(T) {
    const [x, y] = G.L.start;
    ctx.strokeStyle = 'rgba(127,232,255,0.35)'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(x, y, 18, 0, TAU); ctx.stroke();
    for (let k = 0; k < 8; k++) {
      const a = T * 0.4 + k / 8 * TAU;
      ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * 21, y + Math.sin(a) * 21); ctx.lineTo(x + Math.cos(a) * 25, y + Math.sin(a) * 25); ctx.stroke();
    }
  }

  /** 上一发的瞄准记号：帮助玩家在上一发基础上微调 */
  function drawLastAim() {
    const A = G.lastAim; if (!A) return;
    const [x, y] = G.L.start;
    const L = 18 + A.power * 70;
    const bx = x - Math.cos(A.angle) * L, by = y - Math.sin(A.angle) * L;
    ctx.globalAlpha = 0.35; ctx.strokeStyle = '#a9c8ff'; ctx.lineWidth = 1.2; ctx.setLineDash([3, 4]);
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(bx, by); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + Math.cos(A.angle) * 30, y + Math.sin(A.angle) * 30); ctx.lineTo(x + Math.cos(A.angle) * 58, y + Math.sin(A.angle) * 58); ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath(); ctx.arc(bx, by, 5, 0, TAU); ctx.stroke();
    ctx.globalAlpha = 1;
  }
  function powerCol(p) { return p < 0.5 ? COL.cyan : p < 0.8 ? COL.gold : COL.rose; }
  function drawAim(T) {
    const A = G.aim; if (!A) return;
    const [x, y] = G.L.start;
    const col = powerCol(A.power);
    // 弹弓皮筋：指向拉动方向
    const bx = x - Math.cos(A.angle) * (18 + A.power * 70), by = y - Math.sin(A.angle) * (18 + A.power * 70);
    const nx = -Math.sin(A.angle) * 9, ny = Math.cos(A.angle) * 9;
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = `rgba(${col},0.55)`; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(x + nx, y + ny); ctx.lineTo(bx, by); ctx.lineTo(x - nx, y - ny); ctx.stroke();
    dGlow(bx, by, 12, col, 0.8);
    // 力度环
    ctx.globalAlpha = 0.9; ctx.strokeStyle = `rgba(${col},1)`; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(x, y, 26, -Math.PI / 2, -Math.PI / 2 + A.power * TAU); ctx.stroke();
    ctx.globalAlpha = 0.2; ctx.beginPath(); ctx.arc(x, y, 26, 0, TAU); ctx.stroke();
    // 0.6 秒预览点
    const pv = G.preview, n = pv.length;
    for (let i = 0; i < n; i++) {
      const q = pv[i], t = 1 - i / n;
      ctx.globalAlpha = 0.25 + t * 0.7;
      ctx.fillStyle = i % 2 ? '#bff4ff' : '#ffffff';
      ctx.beginPath(); ctx.arc(q[0], q[1], 1.2 + t * 2.4, 0, TAU); ctx.fill();
    }
    if (A.hit && n) {
      const q = pv[n - 1];
      ctx.globalAlpha = 0.9; ctx.strokeStyle = '#ff7a96'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(q[0] - 6, q[1] - 6); ctx.lineTo(q[0] + 6, q[1] + 6); ctx.moveTo(q[0] + 6, q[1] - 6); ctx.lineTo(q[0] - 6, q[1] + 6); ctx.stroke();
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }

  /** 第一关的无字教学：一根“手指”按住彗星向后拉，再松开 */
  function drawHand(T) {
    const def = G.def;
    if (G.idx !== 0 || G.daily || G.used > 0 || G.phase !== 'aim' || G.drag || !def.hint) return;
    if (G.handOff || G.hand < 0.9) return;
    const cyc = ((G.hand - 0.9) % 3.0);
    const ang = def.hint[0] * D2R, pw = def.hint[1];
    const [x, y] = G.L.start;
    const pull = 30 + pw * 90;
    let k = 0, alpha = 0, pressed = false;
    if (cyc < 0.35) { alpha = cyc / 0.35; k = 0; }
    else if (cyc < 1.5) { alpha = 1; pressed = true; k = ease((cyc - 0.35) / 1.15); }
    else if (cyc < 1.9) { alpha = 1 - (cyc - 1.5) / 0.4; k = 1; }
    else return;
    const hx = x - Math.cos(ang) * pull * k, hy = y - Math.sin(ang) * pull * k;
    // 方向提示：彗星前方的虚线箭头
    if (pressed || cyc >= 1.5) {
      ctx.globalAlpha = alpha * 0.6 * k;
      ctx.strokeStyle = '#bff4ff'; ctx.lineWidth = 2; ctx.setLineDash([4, 8]);
      const L = 60 + k * 90;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(ang) * L, y + Math.sin(ang) * L); ctx.stroke();
      ctx.setLineDash([]);
      const ex = x + Math.cos(ang) * L, ey = y + Math.sin(ang) * L;
      ctx.beginPath();
      ctx.moveTo(ex + Math.cos(ang + 2.6) * 10, ey + Math.sin(ang + 2.6) * 10); ctx.lineTo(ex, ey);
      ctx.lineTo(ex + Math.cos(ang - 2.6) * 10, ey + Math.sin(ang - 2.6) * 10); ctx.stroke();
    }
    // 手指触点
    ctx.globalAlpha = alpha * (pressed ? 0.35 : 0.2);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(hx, hy, pressed ? 15 : 19, 0, TAU); ctx.fill();
    ctx.globalAlpha = alpha * 0.9; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(hx, hy, pressed ? 15 : 19, 0, TAU); ctx.stroke();
    if (pressed) {
      ctx.globalAlpha = alpha * 0.5 * k; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(hx, hy); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function renderPlay(T, dt) {
    const sx = (Math.random() - 0.5) * G.shake * 2, sy = (Math.random() - 0.5) * G.shake * 2;
    setWorld(sx, sy);
    drawFrame();
    if (G.devPath) { ctx.fillStyle = '#ff4fd8'; for (const q of G.devPath) ctx.fillRect(q[0] - 1.2, q[1] - 1.2, 2.4, 2.4); }
    drawGhost();
    drawRings(T);
    drawWorms(T);
    drawHoles(T);
    drawPlanets(T);
    drawMoons(T);
    drawRocks(T);
    drawPortal(T);
    drawMotes(T);
    drawPad(T);
    drawTrail();
    drawParts();
    const [x0, y0] = G.L.start;
    if (G.phase === 'aim') { drawLastAim(); drawComet(x0, y0, 1, T); drawAim(T); drawHand(T); }
    else if (G.phase === 'respawn') { drawComet(x0, y0, ease(1 - clamp(G.timer / 0.65, 0, 1)), T); }
    else if (G.phase === 'fly') drawComet(G.s.x, G.s.y, 1, T);
    else if (G.phase === 'won' && G.winAt) {
      const k = clamp(G.timer / 0.5, 0, 1);
      const [px, py] = G.L.portal;
      if (k < 1) drawComet(lerp(G.winAt[0], px, ease(k)), lerp(G.winAt[1], py, ease(k)), 1 - k, T);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  /* ---------------- 标题背景演示 ---------------- */
  const titleScene = { planet: null };
  function renderTitle(T) {
    const R = Math.min(VW, VH) * 0.2;
    const cx = VW * (VW > VH ? 0.8 : 0.78), cy = VH * (VW > VH ? 0.74 : 0.84);
    if (!titleScene.planet) titleScene.planet = { x: 1, y: 2, r: R, hue: 205, ring: true };
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    // 卫星彗星
    const orbits = [[R * 1.9, 0.42, -0.5, 0.55, 0], [R * 2.7, 0.36, -0.3, 0.32, 2.1], [R * 3.6, 0.5, -0.65, 0.22, 4.2]];
    const pos = (o, t) => { const a = o[4] + t * o[3]; const ex = Math.cos(a) * o[0], ey = Math.sin(a) * o[0] * o[1]; return [cx + ex * Math.cos(o[2]) - ey * Math.sin(o[2]), cy + ex * Math.sin(o[2]) + ey * Math.cos(o[2]), Math.sin(a)]; };
    const drawOrbitComets = (front) => {
      ctx.globalCompositeOperation = 'lighter';
      for (const o of orbits) {
        const [hx, hy, z] = pos(o, T);
        if ((z > 0) !== front) continue;
        ctx.lineCap = 'round';
        for (let k = 1; k < 40; k++) {
          const a = pos(o, T - k * 0.02), b = pos(o, T - (k - 1) * 0.02);
          ctx.globalAlpha = (1 - k / 40) * 0.7; ctx.strokeStyle = '#7fe8ff'; ctx.lineWidth = (1 - k / 40) * 4 + 0.5;
          ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
        }
        dGlow(hx, hy, 26, COL.cyan, 0.8); dGlow(hx, hy, 9, COL.white, 1);
      }
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    };
    drawOrbitComets(false);
    ctx.globalCompositeOperation = 'lighter';
    dGlow(cx, cy, R * 3, hsl2rgb(205, 90, 60), 0.35);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    drawPlanetSprite(titleScene.planet, cx, cy, DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    drawOrbitComets(true);
    // 远处小星球
    const p2 = { x: 3, y: 4, r: Math.min(VW, VH) * 0.045, hue: 330 };
    ctx.globalCompositeOperation = 'lighter'; dGlow(VW * 0.14, VH * 0.2, p2.r * 3, hsl2rgb(330, 90, 60), 0.3); ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    drawPlanetSprite(p2, VW * 0.14, VH * 0.2, DPR);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  /* ---------------- 主循环 ---------------- */
  let last = performance.now(), T = 0;
  function frame(now) {
    const dt = clamp((now - last) / 1000, 0, 0.05); last = now;
    T += dt;
    update(dt);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(backdrop, 0, 0);
    if (G.mode !== 'play') { cam.tx = Math.sin(T * 0.1) * 60; cam.ty = Math.cos(T * 0.08) * 40; }
    drawStars(T);
    if (G.mode === 'play' && G.L) renderPlay(T, dt);
    else if (G.mode === 'title') renderTitle(T);
    requestAnimationFrame(frame);
  }

  /* ---------------- 输入 ---------------- */
  function maxPull() { return clamp(Math.min(VW, VH) * 0.4, 120, 220); }
  function computeAim() {
    const d = G.drag;
    const dx = d.x - d.x0, dy = d.y - d.y0;
    const power = clamp(Math.hypot(dx, dy) / maxPull(), 0, 1);
    const [wx, wy] = s2wVec(dx, dy);
    if (power < 0.04) { G.aim = null; G.preview = []; return; }
    setAim(Math.atan2(-wy, -wx), power);
  }
  function setAim(angle, power) {
    G.aim = { angle, power, hit: false };
    // 预览：仅前 0.6 秒
    const s = P.launch(G.L, angle, power, G.got);
    const pv = [];
    const steps = Math.round(0.6 / C.DT);
    for (let k = 1; k <= steps; k++) {
      P.step(G.L, s);
      if (s.ev.some(e => e.t === 'warp')) break;
      s.ev.length = 0;
      if (s.end) { if (s.end === 'crash' || s.end === 'swallow') G.aim.hit = true; pv.push([s.x, s.y]); break; }
      if (k % 6 === 0) pv.push([s.x, s.y]);
    }
    G.preview = pv;
    const tick = Math.floor(power * 12);
    if (tick !== G.lastPowTick) { G.lastPowTick = tick; Sfx.tick(power); }
  }
  /** 键盘微调（桌面）：←→ 转向，↑↓ 力度，按住 Shift 更精细，空格发射 */
  function nudgeAim(da, dp) {
    if (G.phase !== 'aim' || G.drag) return;
    const base = G.aim || G.lastAim || { angle: -Math.PI / 2, power: 0.5 };
    setAim(base.angle + da, clamp(base.power + dp, 0.06, 1));
    G.kbAim = true;
    hideTip();
  }
  let firstGesture = false;
  function gesture() {
    if (!firstGesture) { firstGesture = true; Sfx.init(); Sfx.setMuted(!!save.muted); }
  }
  window.addEventListener('pointerdown', gesture, { capture: true });
  window.addEventListener('keydown', gesture, { capture: true });

  cv.addEventListener('pointerdown', e => {
    if (G.mode !== 'play' || G.paused || G.phase !== 'aim' || anyModal()) return;
    if (G.drag) return;
    G.drag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY };
    G.lastPowTick = -1; G.kbAim = false; G.aim = null; G.preview = [];
    try { cv.setPointerCapture(e.pointerId); } catch (err) { /* noop */ }
    hideTip();
  });
  cv.addEventListener('pointermove', e => {
    if (!G.drag || e.pointerId !== G.drag.id) return;
    G.drag.x = e.clientX; G.drag.y = e.clientY;
    if (G.phase === 'aim') computeAim();
  });
  const endDrag = (e, cancel) => {
    if (!G.drag || e.pointerId !== G.drag.id) return;
    const A = G.aim;
    G.drag = null; G.aim = null; G.preview = [];
    if (!cancel && A && A.power >= 0.06 && G.phase === 'aim') doLaunch(A.angle, A.power);
  };
  cv.addEventListener('pointerup', e => endDrag(e, false));
  cv.addEventListener('pointercancel', e => endDrag(e, true));
  cv.addEventListener('contextmenu', e => e.preventDefault());

  window.addEventListener('keydown', e => {
    if (G.mode !== 'play') return;
    if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') { if (G.paused) resume(); else if (!anyModal()) pause(); }
    else if (e.key === 'r' || e.key === 'R') { if (!G.daily) { closeModals(); G.paused = false; playLevel(G.idx); } }
    else if (/^Arrow/.test(e.key) && !G.paused && !anyModal()) {
      const f = e.shiftKey ? 0.2 : 1;
      if (e.key === 'ArrowLeft') nudgeAim(-0.5 * D2R * f, 0);
      else if (e.key === 'ArrowRight') nudgeAim(0.5 * D2R * f, 0);
      else if (e.key === 'ArrowUp') nudgeAim(0, 0.02 * f);
      else if (e.key === 'ArrowDown') nudgeAim(0, -0.02 * f);
      e.preventDefault();
    }
    else if (e.key === ' ' || e.key === 'Enter') {
      if (G.phase === 'aim' && G.kbAim && G.aim && !G.paused && !anyModal()) { const A = G.aim; G.kbAim = false; doLaunch(A.angle, A.power); }
      else if (G.phase === 'fly') recall();
      else if ($('#m-done').classList.contains('show')) $('#done-next').click();
      e.preventDefault();
    }
  });

  /* ---------------- 界面 ---------------- */
  function showScreen(id) {
    $$('.screen').forEach(s => s.classList.toggle('show', s.id === id));
    $('#hud').classList.toggle('show', !id);
    if (id) { G.mode = id === 'scr-title' ? 'title' : 'map'; hideRecall(); hideTip(); $('#banner').classList.remove('show'); }
    if (id === 'scr-title') { setBackHue(225); refreshTitle(); }
    if (id === 'scr-map') { setBackHue(235); buildMap(); }
  }
  const anyModal = () => $$('.modal').some(m => m.classList.contains('show'));
  function openModal(id) { closeModals(); $(id).classList.add('show'); }
  function closeModals() { $$('.modal').forEach(m => m.classList.remove('show')); }

  let bannerT = 0;
  function showBanner(a, b) {
    const el = $('#banner');
    el.querySelector('small').textContent = a; el.querySelector('b').textContent = b;
    el.classList.add('show');
    clearTimeout(bannerT); bannerT = setTimeout(() => el.classList.remove('show'), 1700);
  }
  let tipT = 0, tipT2 = 0;
  function showTip(text, ms, delay) {
    clearTimeout(tipT); clearTimeout(tipT2);
    tipT2 = setTimeout(() => {
      const el = $('#tip'); el.textContent = text; el.classList.add('show');
      tipT = setTimeout(() => el.classList.remove('show'), ms);
    }, delay || 0);
  }
  function hideTip() { clearTimeout(tipT); clearTimeout(tipT2); $('#tip').classList.remove('show'); }
  function showRecall() { $('#btn-recall').classList.add('show'); }
  function hideRecall() { $('#btn-recall').classList.remove('show'); }

  function updHud() {
    const m = $('#hud-motes');
    const n = G.L ? G.L.motes.length : 0;
    if (m.children.length !== n) m.innerHTML = '<i></i>'.repeat(n);
    Array.from(m.children).forEach((el, i) => el.classList.toggle('on', !!G.got[i]));
    const l = $('#hud-launch');
    if (G.daily) {
      l.innerHTML = `<i></i><span>×${G.daily.pool}</span>`;
    } else {
      if (l.children.length !== G.maxL || l.querySelector('span')) l.innerHTML = '<i></i>'.repeat(G.maxL);
      Array.from(l.children).forEach((el, i) => el.classList.toggle('used', i < G.used));
    }
  }

  function pause() {
    if (G.mode !== 'play' || G.phase === 'won' || G.phase === 'over') return;
    G.paused = true; G.drag = null; G.aim = null; G.preview = [];
    $('#pause-sub').textContent = G.daily ? `每日星图 · 第 ${G.daily.k + 1} 张 · 剩余彗星 ${G.daily.pool}` : `${Math.floor(G.idx / 5) + 1}-${G.idx % 5 + 1} ${G.def.name} · 已发射 ${G.used} / ${G.maxL}`;
    $('#m-pause [data-act="retry"]').style.display = G.daily ? 'none' : '';
    openModal('#m-pause');
  }
  function resume() { G.paused = false; closeModals(); last = performance.now(); }

  const WIN_TITLES = [['完美星轨', ['一击入魂', '完美弧线', '引力大师', '行云流水']], ['星轨达成', ['漂亮！', '干得好', '就差一点完美']], ['星轨达成', ['抵达星门', '终于穿过了']]];
  function onWinCard() {
    if (G.daily) {
      const D = G.daily;
      D.cleared++;
      const bonus = G.used === 1 ? 3 : 2;
      D.pool += bonus;
      D.dust = (D.dust || 0) + addDust(5 + G.L.motes.length);
      achieve('daily', '每日航行者');
      showTip(`星图 ${D.k + 1} 完成 · 彗星 +${bonus}${G.used === 1 ? '（一发入门奖励）' : ''}`, 1800, 0);
      D.k++;
      setTimeout(() => { if (G.daily === D && G.mode === 'play') nextDaily(false); }, 1300);
      return;
    }
    const stars = clamp(4 - G.used, 1, 3);
    const prev = save.stars[G.idx] || 0;
    if (stars > prev) { save.stars[G.idx] = stars; persist(); }
    // 共享进度：新获得的星 ×10 + 本关星尘
    const gained = addDust(Math.max(0, stars - prev) * 10 + G.L.motes.length);
    arc('recordBest', GAME_ID, totalStars(), 'high');
    $('#done-dust').innerHTML = gained ? `<span class="dust-ic">✦</span>星尘 +${gained}` : '';
    setTimeout(() => {
      achieve('first-clear', '初入星轨');
      if (stars === 3) achieve('one-shot', '一击入魂');
      const ch = Math.floor(G.idx / 5);
      let perfect = true; for (let i = ch * 5; i < ch * 5 + 5; i++) if ((save.stars[i] || 0) < 3) perfect = false;
      if (perfect) achieve('chapter-perfect', '星域征服者');
      let all = true; for (let i = 0; i < NLV; i++) if (!(save.stars[i] > 0)) all = false;
      if (all) achieve('all-clear', '星轨尽头');
    }, 1300);
    const [eb, titles] = WIN_TITLES[3 - stars];
    $('#done-eyebrow').textContent = eb;
    $('#done-title').textContent = titles[Math.floor(Math.random() * titles.length)];
    const secs = ((performance.now() - G.t0) / 1000).toFixed(0);
    $('#done-sub').innerHTML = `发射 <b>${G.used}</b> 次 · 星尘 <b>${G.L.motes.length}</b> / ${G.L.motes.length}` +
      (stars < 3 ? '<br>一发命中星门即可获得三星' : '<br>用时 ' + secs + ' 秒') + (stars > prev && prev ? '<br>新纪录！' : '');
    $('#done-next').textContent = G.idx < NLV - 1 ? '下一关 →' : '完成 ✦';
    const st = $('#done-stars'); st.classList.remove('glow');
    Array.from(st.children).forEach(i => i.classList.remove('on'));
    openModal('#m-done');
    for (let i = 0; i < stars; i++) setTimeout(() => { st.children[i].classList.add('on'); Sfx.star(i); if (i === 2) st.classList.add('glow'); }, 380 + i * 300);
  }
  function showFail() {
    if (G.daily) {
      const D = G.daily;
      const prevBest = save.daily[D.date] || 0;
      if (D.cleared > prevBest) save.daily[D.date] = D.cleared;
      if (D.cleared > save.dailyBest) save.dailyBest = D.cleared;
      persist();
      $('#daily-eyebrow').textContent = '每日星图 · ' + todayCN();
      $('#daily-title').textContent = D.cleared >= 8 ? '星海漫游者' : D.cleared >= 4 ? '远航归来' : '旅程结束';
      $('#daily-score').textContent = D.cleared;
      $('#daily-sub').innerHTML = `穿越了 <b>${D.cleared}</b> 张星图` + (D.dust ? ` · 星尘 +${D.dust}` : '') + `<br>今日最佳 ${Math.max(prevBest, D.cleared)} · 历史最佳 ${save.dailyBest}` + (D.cleared > prevBest && D.cleared ? '<br>新的今日纪录！' : '');
      Sfx.fail();
      openModal('#m-daily');
      return;
    }
    const left = G.got.filter(b => !b).length;
    $('#fail-sub').textContent = left ? `还差 ${left} 颗星尘。留意灰色的虚线——那是上一发的航迹。` : '星尘已齐，只差穿过星门！';
    Sfx.fail();
    openModal('#m-fail');
  }

  function refreshTitle() {
    const t = totalStars();
    $('#title-meta').innerHTML = t ? `已收集 <b>★ ${t}</b> / ${NLV * 3}` : '';
    $('#daily-date').textContent = todayCN();
    refreshDust();
  }

  function buildMap() {
    refreshDust();
    $('#map-total').textContent = totalStars();
    $('.map-stars small').textContent = ' / ' + NLV * 3;
    const inner = $('#map-inner');
    inner.innerHTML = '';
    let current = -1;
    for (let i = 0; i < NLV; i++) if (isUnlocked(i) && !(save.stars[i] > 0)) { current = i; break; }
    const layouts = [[[10, 66], [30, 30], [50, 64], [70, 28], [90, 60]], [[10, 34], [30, 68], [50, 32], [70, 70], [90, 36]], [[10, 60], [28, 26], [50, 52], [72, 24], [90, 62]], [[10, 30], [30, 64], [50, 36], [70, 70], [90, 34]]];
    LV.CHAPTERS.forEach((ch, c) => {
      const sec = document.createElement('section');
      sec.className = 'chapter'; sec.style.setProperty('--h', ch.hue);
      sec.style.animationDelay = (c * 0.07) + 's';
      let got = 0; for (let i = c * 5; i < c * 5 + 5; i++) got += save.stars[i] || 0;
      const pts = layouts[c];
      let d = `M ${pts[0][0]} ${pts[0][1]}`;
      for (let k = 1; k < pts.length; k++) { const a = pts[k - 1], b = pts[k]; d += ` C ${(a[0] + b[0]) / 2} ${a[1]}, ${(a[0] + b[0]) / 2} ${b[1]}, ${b[0]} ${b[1]}`; }
      sec.innerHTML = `<div class="ch-head"><span class="ch-no">0${c + 1}</span><span class="ch-name">${ch.name}</span><span class="ch-en">${ch.en}</span><span class="ch-count"><b>${got}</b> / 15 ★</span></div>
        <p class="ch-desc">${ch.desc}</p>
        <div class="ch-map"><svg viewBox="0 0 100 100" preserveAspectRatio="none"><path d="${d}" vector-effect="non-scaling-stroke"/></svg></div>`;
      const map = sec.querySelector('.ch-map');
      pts.forEach(([x, y], k) => {
        const i = c * 5 + k;
        const b = document.createElement('button');
        b.type = 'button';
        const un = isUnlocked(i);
        b.className = 'node' + (un ? '' : ' locked') + (i === current ? ' current' : '');
        b.style.left = x + '%'; b.style.top = y + '%';
        const s = save.stars[i] || 0;
        b.innerHTML = un ? `${k + 1}<span class="ns">${[0, 1, 2].map(j => `<i class="${j < s ? 'on' : ''}">★</i>`).join('')}</span>` : '✕';
        b.setAttribute('aria-label', `第 ${c + 1}-${k + 1} 关 ${LV.LEVELS[i].name}${un ? '' : '（未解锁）'}`);
        b.title = LV.LEVELS[i].name;
        b.addEventListener('click', () => { if (!un) { Sfx.fizzle(); return; } Sfx.ui(); playLevel(i); });
        map.appendChild(b);
      });
      inner.appendChild(sec);
    });
    const best = save.daily[todayStr()] || 0;
    $('#map-daily-best').innerHTML = best ? `今日最佳<br><b>${best}</b> 张` : (save.dailyBest ? `历史最佳<br>${save.dailyBest} 张` : '');
    if (current >= 0) {
      requestAnimationFrame(() => {
        const node = inner.querySelector('.node.current');
        const sc = $('#map-scroll');
        if (node) sc.scrollTop = Math.max(0, node.closest('.chapter').offsetTop - 70);
      });
    }
  }

  function setMuted(m) {
    save.muted = m; persist();
    document.body.classList.toggle('muted', m);
    Sfx.setMuted(m);
  }

  // 按钮
  $('#btn-start').addEventListener('click', () => { Sfx.ui(); showScreen('scr-map'); });
  $('#btn-daily').addEventListener('click', () => { Sfx.ui(); startDaily(); });
  $('#map-daily').addEventListener('click', () => { Sfx.ui(); startDaily(); });
  $('#map-back').addEventListener('click', () => { Sfx.ui(); showScreen('scr-title'); });
  $('#btn-pause').addEventListener('click', () => { Sfx.ui(); pause(); });
  $('#btn-recall').addEventListener('click', () => recall());
  $$('.sound-btn').forEach(b => b.addEventListener('click', () => { gesture(); setMuted(!save.muted); Sfx.ui(); }));
  $$('[data-act]').forEach(b => b.addEventListener('click', () => {
    const a = b.dataset.act;
    Sfx.ui();
    G.paused = false;
    closeModals();
    if (a === 'resume') { last = performance.now(); }
    else if (a === 'retry') { if (G.daily) startDaily(); else playLevel(G.idx); }
    else if (a === 'map') { G.daily = null; showScreen('scr-map'); }
    else if (a === 'title') { G.daily = null; showScreen('scr-title'); }
    else if (a === 'daily') startDaily();
    else if (a === 'next') {
      if (G.idx < NLV - 1) playLevel(G.idx + 1);
      else { showScreen('scr-map'); }
    }
  }));
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { Sfx.suspend(); if (G.mode === 'play' && !G.paused && G.phase !== 'won') pause(); }
    else if (firstGesture) Sfx.resume();
  });
  window.addEventListener('resize', layout);

  document.body.classList.toggle('muted', !!save.muted);

  // 调试/截图接口
  window.__orbit = {
    G, play: playLevel, daily: startDaily,
    shoot(deg, pow) { doLaunch(deg * D2R, pow); },
    hint() { const h = G.def.hint; if (h) doLaunch(h[0] * D2R, h[1]); },
    aim(deg, pow) { // 模拟拖拽瞄准（截图用）
      const a = deg * D2R; const len = pow * maxPull();
      const wx = -Math.cos(a), wy = -Math.sin(a);
      const [dx, dy] = view.rot ? [-wy, wx] : [wx, wy];
      G.drag = { id: -1, x0: 100, y0: 100, x: 100 + dx * len, y: 100 + dy * len }; computeAim();
    },
    map: () => showScreen('scr-map'),
  };

  layout();
  refreshTitle();
  const qlv = QS.get('lv');
  if (qlv != null && LV.LEVELS[+qlv]) playLevel(+qlv);
  else if (QS.get('daily') === '1') startDaily();
  else showScreen('scr-title');
  requestAnimationFrame(frame);
})();
