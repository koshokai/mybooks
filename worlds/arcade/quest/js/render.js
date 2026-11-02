/* 远征 · 渲染：世界、特效、HUD、标题背景 */
(function () {
  'use strict';
  const Q = window.Q, TAU = Q.TAU, A = Q.art, G = Q.G;
  const { clamp, lerp } = Q;
  const cvs = document.getElementById('cv');
  const ctx = cvs.getContext('2d', { alpha: false });
  let W = 0, H = 0, dpr = 1, k = 1, ox = 0, oy = 0;
  let tiles = [null, null, null], tileRes = 0, vign = null, vignBiome = -1, lights = [];
  const R = (Q.render = { ctx, cvs, dprMul: 1 });
  const NUMF = '"Avenir Next", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
  const SERIF = '"Noto Serif SC", "Songti SC", "STSong", "WenQuanYi Zen Hei", serif';
  const LATIN = '"Cormorant Garamond", Georgia, "Times New Roman", serif';

  function resize() {
    W = window.innerWidth; H = window.innerHeight;
    dpr = Math.min(2, window.devicePixelRatio || 1) * R.dprMul;
    cvs.width = Math.max(1, Math.round(W * dpr)); cvs.height = Math.max(1, Math.round(H * dpr));
    G.W = W; G.H = H;
    const mn = Math.min(W, H);
    G.scale = mn < 600 ? mn / 540 : clamp(Math.sqrt(W * H) / 1150, 0.8, 1.3);
    G.vw = W / G.scale; G.vh = H / G.scale;
    const res = Math.min(2, Math.max(1, G.scale * dpr));
    if (Math.abs(res - tileRes) > 0.05) { tileRes = res; tiles = [null, null, null]; }
    vign = null;
  }
  R.resize = resize;
  function tile(bi) { if (!tiles[bi]) tiles[bi] = A.buildGround(bi, tileRes); return tiles[bi]; }
  function lightSprite(c) {
    if (lights[c]) return lights[c];
    const s = 256, cv = A.cv(s, s), g = cv.getContext('2d');
    const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    gr.addColorStop(0, Q.rgba(c, 0.5)); gr.addColorStop(0.4, Q.rgba(c, 0.16)); gr.addColorStop(1, Q.rgba(c, 0));
    g.fillStyle = gr; g.fillRect(0, 0, s, s);
    lights[c] = cv; return cv;
  }
  function vignette(bi) {
    if (vign && vignBiome === bi) return vign;
    const w = Math.max(2, Math.round(W / 2)), h = Math.max(2, Math.round(H / 2));
    const c = A.cv(w, h), g = c.getContext('2d');
    const gr = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.hypot(w, h) * 0.6);
    const col = Q.BIOMES[bi].vign;
    gr.addColorStop(0, Q.rgba(col, 0)); gr.addColorStop(0.7, Q.rgba(col, 0.45)); gr.addColorStop(1, Q.rgba(col, 0.92));
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    vign = c; vignBiome = bi; return c;
  }

  /* ---------- 坐标 ---------- */
  function setWorld(camX, camY, sx, sy) {
    k = dpr * G.scale;
    ox = dpr * (W / 2 + sx) - camX * k; oy = dpr * (H / 2 + sy) - camY * k;
    ctx.setTransform(k, 0, 0, k, ox, oy);
  }
  const SX = (x) => (x * k + ox) / dpr, SY = (y) => (y * k + oy) / dpr;

  /* ---------- 地面 ---------- */
  function drawGround(bi, alpha, camX, camY) {
    const t = tile(bi), ts = A.TILE * G.scale * dpr;
    let x0 = ((ox) % ts + ts) % ts - ts, y0 = ((oy) % ts + ts) % ts - ts;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = alpha;
    for (let x = x0; x < cvs.width; x += ts) for (let y = y0; y < cvs.height; y += ts) ctx.drawImage(t, Math.floor(x), Math.floor(y), Math.ceil(ts) + 1, Math.ceil(ts) + 1);
    ctx.globalAlpha = 1;
  }
  const DC = 230;
  function drawDecor(bi, alpha, camX, camY, glowPass) {
    const list = A.decor[bi];
    if (!list || !list.length) return;
    const hw = G.vw / 2 + 80, hh = G.vh / 2 + 80;
    const x0 = Math.floor((camX - hw) / DC), x1 = Math.floor((camX + hw) / DC), y0 = Math.floor((camY - hh) / DC), y1 = Math.floor((camY + hh) / DC);
    for (let cx = x0; cx <= x1; cx++) for (let cy = y0; cy <= y1; cy++) {
      const h = Q.hash2(cx, cy, 17 + bi * 7);
      if (h > 0.46) continue;
      if (Math.abs(cx) < 1 && Math.abs(cy) < 1) continue;
      const ti = Math.floor(Q.hash2(cx, cy, 99 + bi) * list.length);
      const s = list[ti];
      const px = (cx + 0.15 + 0.7 * Q.hash2(cx, cy, 3)) * DC, py = (cy + 0.15 + 0.7 * Q.hash2(cx, cy, 5)) * DC;
      const sc = 0.85 + 0.4 * Q.hash2(cx, cy, 7), fl = Q.hash2(cx, cy, 11) < 0.5 ? -1 : 1;
      if (glowPass) {
        if (!s.glow) continue;
        const [gx, gy, gr, pc] = s.glow;
        const fk = 0.75 + 0.25 * Math.sin(G.rt * 2.2 + cx * 1.7 + cy);
        ctx.globalAlpha = alpha * 0.55 * fk;
        const sp = A.softs[pc];
        ctx.drawImage(sp, px + gx * sc * fl - gr * sc, py + gy * sc - gr * sc, gr * 2 * sc, gr * 2 * sc);
      } else {
        ctx.globalAlpha = alpha * 0.92;
        if (s.flat) { const ra = Q.hash2(cx, cy, 13) * TAU, c = Math.cos(ra) * k * sc, sn = Math.sin(ra) * k * sc; ctx.setTransform(c, sn * 0.8, -sn, c * 0.8, ox + px * k, oy + py * k); }
        else ctx.setTransform(k * sc * fl, 0, 0, k * sc, ox + px * k, oy + py * k);
        ctx.drawImage(s.img, -s.half, -s.half, s.half * 2, s.half * 2);
      }
    }
    ctx.globalAlpha = 1;
    ctx.setTransform(k, 0, 0, k, ox, oy);
  }

  /* ---------- 环境粒子 ---------- */
  const amb = [];
  function ambient(dt, bi, camX, camY) {
    const n = G.mobile ? 34 : 70;
    const B = Q.BIOMES[bi];
    const hw = G.vw / 2 + 40, hh = G.vh / 2 + 40;
    while (amb.length < n) amb.push({ x: camX + Q.rand(-hw, hw), y: camY + Q.rand(-hh, hh), s: Q.rand(0.6, 1.6), p: Math.random() * TAU, z: Q.rand(0.8, 1.4) });
    ctx.globalCompositeOperation = 'lighter';
    for (const a of amb) {
      a.p += dt;
      if (B.amb === 'ember') { a.y -= (22 + a.s * 18) * dt; a.x += Math.sin(a.p * 1.3) * 12 * dt; }
      else if (B.amb === 'snow') { a.y += (26 + a.s * 22) * dt; a.x += (14 + Math.sin(a.p) * 16) * dt; }
      else { a.y -= (8 + a.s * 8) * dt; a.x += Math.sin(a.p * 0.7) * 8 * dt; }
      if (a.x < camX - hw) a.x += hw * 2; else if (a.x > camX + hw) a.x -= hw * 2;
      if (a.y < camY - hh) a.y += hh * 2; else if (a.y > camY + hh) a.y -= hh * 2;
      const tw = 0.5 + 0.5 * Math.sin(a.p * 3 + a.s * 10);
      const c = B.amb === 'ember' ? (a.s > 1.2 ? 1 : 2) : B.amb === 'snow' ? 7 : (a.s > 1.2 ? 9 : 8);
      const sz = a.s * (B.amb === 'snow' ? 3.4 : 4.2) * a.z;
      ctx.globalAlpha = (B.amb === 'snow' ? 0.55 : 0.35 + tw * 0.5);
      ctx.drawImage(A.glows[c], a.x - sz, a.y - sz, sz * 2, sz * 2);
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }

  /* ---------- 世界层 ---------- */
  const rl = [];
  function drawEnemy(e) {
    const spr = A.enemy[e.id];
    if (!spr) return;
    const pulse = Math.sin(e.ph * (e.arch === 'runner' ? 14 : 9));
    let sx = 1 - 0.05 * pulse, sy = 1 + 0.06 * pulse;
    let alpha = 1;
    if (e.spawnT > 0) { const p = 1 - e.spawnT / 0.35; alpha = p; sx *= 0.5 + 0.5 * p; sy *= 0.5 + 0.5 * p; }
    let img = spr.img, jx = 0;
    if (e.frz > 0) { img = spr.frost; sx = 1; sy = 1; }
    else if (e.flash > 0) img = spr.flash;
    if (e.arch === 'bomber' && e.st === 1) { img = (Math.floor(G.rt * 18) % 2) ? spr.flash : spr.img; const g = 1 + 0.25 * (1 - e.stT / 0.65); sx *= g; sy *= g; }
    if (e.arch === 'charger' && e.st === 1) jx = Math.sin(G.rt * 60) * 1.5;
    if (e.stun > 0 && e.frz <= 0) { sx = 1; sy = 1; }
    const sc = e.scale;
    ctx.globalAlpha = alpha;
    ctx.setTransform(k * sx * sc * e.face, 0, 0, k * sy * sc, ox + (e.x + jx) * k, oy + (e.y + e.r) * k);
    ctx.drawImage(img, -spr.half, -spr.half - e.r, spr.S, spr.S);
    ctx.globalAlpha = 1;
  }
  function drawEnemyOverlays(list) {
    ctx.setTransform(k, 0, 0, k, ox, oy);
    for (const e of list) {
      if (e.boss) continue;
      if (e.stun > 0 && e.frz <= 0) {
        for (let i = 0; i < 3; i++) { const a = G.rt * 6 + (i / 3) * TAU; ctx.fillStyle = '#ffe9a0'; ctx.fillRect(e.x + Math.cos(a) * e.r * 0.7 - 1.2, e.y - e.r * 1.5 + Math.sin(a) * 3 - 1.2, 2.4, 2.4); }
      }
      if (e.elite) {
        const bw = e.r * 2.2, by = e.y - e.r * 2.3;
        ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(e.x - bw / 2 - 1, by - 1, bw + 2, 6);
        ctx.fillStyle = '#ff5a4a'; ctx.fillRect(e.x - bw / 2, by, bw * Math.max(0, e.hp / e.mhp), 4);
        if (e.shMax > 0) { ctx.fillStyle = '#8fd8ff'; ctx.fillRect(e.x - bw / 2, by - 4, bw * Math.max(0, e.sh / e.shMax), 2.5); }
        if (e.sh > 0) {
          ctx.globalCompositeOperation = 'lighter';
          ctx.strokeStyle = `rgba(150,220,255,${0.45 + 0.2 * Math.sin(G.rt * 5)})`; ctx.lineWidth = 2;
          ctx.beginPath();
          for (let i = 0; i <= 6; i++) { const a = (i / 6) * TAU + G.rt * 0.5, rr = e.r * 1.45; const x = e.x + Math.cos(a) * rr, y = e.y + Math.sin(a) * rr; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
          ctx.stroke();
          ctx.globalAlpha = 0.25; ctx.drawImage(A.softs[5], e.x - e.r * 1.6, e.y - e.r * 1.6, e.r * 3.2, e.r * 3.2); ctx.globalAlpha = 1;
          ctx.globalCompositeOperation = 'source-over';
        }
      }
      if (e.charging && (e.arch === 'caster' || e.arch === 'elite')) {
        ctx.globalCompositeOperation = 'lighter';
        const c = e.d.shot === 'fire' ? 2 : e.d.shot === 'ice' ? 5 : 9;
        const s = 8 + Math.sin(G.rt * 20) * 2;
        ctx.drawImage(A.glows[c], e.x + e.face * e.r * 0.9 - s, e.y - e.r * 0.8 - s, s * 2, s * 2);
        ctx.globalCompositeOperation = 'source-over';
      }
    }
  }
  function drawGroundFx() {
    ctx.setTransform(k, 0, 0, k, ox, oy);
    // 区域（玩家）
    ctx.globalCompositeOperation = 'lighter';
    for (const z of G.zones) {
      const f = clamp(z.life / Math.min(0.4, z.max), 0, 1), born = clamp((z.max - z.life) / 0.2, 0, 1);
      if (z.k === 'fire') {
        const fl = 0.85 + 0.15 * Math.sin(G.rt * 17 + z.x);
        const r = z.r * (0.6 + 0.4 * born) * fl * 1.25;
        ctx.globalAlpha = 0.8 * f;
        ctx.drawImage(A.pj.flame.img, z.x - r, z.y - r * 0.75, r * 2, r * 1.5);
      } else if (z.k === 'star') {
        ctx.globalAlpha = 0.5 * f;
        ctx.drawImage(A.softs[8], z.x - z.r * 1.1, z.y - z.r * 0.8, z.r * 2.2, z.r * 1.6);
        ctx.strokeStyle = `rgba(196,176,255,${0.6 * f})`; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(z.x, z.y, z.r, z.r * 0.72, 0, 0, TAU); ctx.stroke();
        ctx.fillStyle = `rgba(255,255,255,${0.9 * f})`;
        for (let i = 0; i < 8; i++) { const a = G.rt * (z.pull ? -1.4 : 0.7) + (i / 8) * TAU, d = z.r * (0.4 + 0.5 * ((i * 37) % 10) / 10); ctx.fillRect(z.x + Math.cos(a) * d - 1.2, z.y + Math.sin(a) * d * 0.72 - 1.2, 2.4, 2.4); }
      } else if (z.k === 'trap') {
        const armed = z.max - z.life > 0.25;
        const pulse = 0.5 + 0.5 * Math.sin(G.rt * 10);
        ctx.globalAlpha = armed ? 0.55 + 0.25 * pulse : 0.3;
        ctx.strokeStyle = '#c8ff6b'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(z.x, z.y, z.r, z.r * 0.72, 0, 0, TAU); ctx.stroke();
        ctx.beginPath();
        for (let i = 0; i < 14; i++) { const a = (i / 14) * TAU + G.rt * 0.3, r1 = z.r * 0.82, r2 = z.r * (i % 2 ? 1.0 : 0.62); ctx.moveTo(z.x + Math.cos(a) * r1, z.y + Math.sin(a) * r1 * 0.72); ctx.lineTo(z.x + Math.cos(a + 0.12) * r2, z.y + Math.sin(a + 0.12) * r2 * 0.72); }
        ctx.stroke();
        ctx.globalAlpha = 0.35; ctx.drawImage(A.softs[11], z.x - z.r, z.y - z.r * 0.72, z.r * 2, z.r * 1.44);
        if (z.life < 0.6) { ctx.globalAlpha = (0.6 - z.life) / 0.6 * 0.5; ctx.drawImage(A.softs[11], z.x - z.boom, z.y - z.boom * 0.72, z.boom * 2, z.boom * 1.44); }
      }
    }
    // 危险区（敌方）
    for (const h of G.hazards) {
      const f = clamp(h.life / 0.5, 0, 1) * clamp((h.max - h.life) / 0.3, 0, 1);
      if (h.k === 'fire') {
        ctx.globalAlpha = 0.75 * f; const r = h.r * (1 + 0.06 * Math.sin(G.rt * 12 + h.x));
        ctx.drawImage(A.pj.flame.img, h.x - r * 1.2, h.y - r * 0.9, r * 2.4, r * 1.8);
      } else {
        ctx.globalAlpha = 0.45 * f; ctx.drawImage(A.softs[5], h.x - h.r * 1.2, h.y - h.r * 0.9, h.r * 2.4, h.r * 1.8);
        ctx.strokeStyle = `rgba(200,240,255,${0.7 * f})`; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.ellipse(h.x, h.y, h.r, h.r * 0.75, 0, 0, TAU); ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    // 冲锋预警线（小怪）
    for (const e of G.eAct) {
      if (e.arch === 'charger' && e.st === 1) {
        const p = 1 - e.stT / 0.72;
        ctx.save(); ctx.translate(e.x, e.y); ctx.rotate(Math.atan2(e.ty, e.tx));
        ctx.fillStyle = `rgba(255,70,50,${0.12 + 0.12 * p})`; ctx.fillRect(0, -e.r * 0.8, 240, e.r * 1.6);
        ctx.fillStyle = `rgba(255,90,60,${0.35 * p})`; ctx.fillRect(0, -e.r * 0.8, 240 * p, e.r * 1.6);
        ctx.restore();
      } else if (e.arch === 'bomber' && e.st === 1) {
        const p = 1 - e.stT / 0.65;
        ctx.strokeStyle = `rgba(255,80,60,${0.5 + 0.4 * p})`; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(e.x, e.y + e.r * 0.5, 80, 80 * 0.75, 0, 0, TAU); ctx.stroke();
        ctx.fillStyle = `rgba(255,70,40,${0.22 * p})`; ctx.beginPath(); ctx.ellipse(e.x, e.y + e.r * 0.5, 80 * p, 80 * 0.75 * p, 0, 0, TAU); ctx.fill();
      }
    }
    // 预警（首领）
    for (const t of G.teles) {
      const p = clamp(t.t / t.dur, 0, 1);
      const col = t.fx === 'ice' ? [120, 220, 255] : t.fx === 'void' ? [220, 110, 255] : t.fx === 'star' ? [255, 200, 110] : [255, 90, 50];
      const cs = `${col[0]},${col[1]},${col[2]}`;
      const blink = p > 0.75 ? 0.5 + 0.5 * Math.sin(G.rt * 40) : 1;
      if (t.k === 'circle') {
        ctx.fillStyle = `rgba(${cs},${0.1 + 0.06 * p})`;
        ctx.beginPath(); ctx.ellipse(t.x, t.y, t.r, t.r * 0.78, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = `rgba(${cs},${0.28})`;
        ctx.beginPath(); ctx.ellipse(t.x, t.y, t.r * p, t.r * 0.78 * p, 0, 0, TAU); ctx.fill();
        ctx.strokeStyle = `rgba(${cs},${0.75 * blink})`; ctx.lineWidth = 2.2;
        ctx.beginPath(); ctx.ellipse(t.x, t.y, t.r, t.r * 0.78, 0, 0, TAU); ctx.stroke();
        if (t.cinematic) {
          ctx.globalCompositeOperation = 'lighter';
          ctx.strokeStyle = `rgba(${cs},${0.5})`; ctx.lineWidth = 1.5;
          for (let i = 0; i < 3; i++) { const rr = t.r * (1.2 + i * 0.25) * (1 - p * 0.4); ctx.beginPath(); ctx.ellipse(t.x, t.y, rr, rr * 0.78, 0, 0, TAU); ctx.stroke(); }
          ctx.globalCompositeOperation = 'source-over';
        }
      } else if (t.k === 'line') {
        ctx.save(); ctx.translate(t.x, t.y); ctx.rotate(t.ang);
        ctx.fillStyle = `rgba(${cs},0.12)`; ctx.fillRect(0, -t.w / 2, t.len, t.w);
        ctx.fillStyle = `rgba(${cs},0.3)`; ctx.fillRect(0, -t.w / 2, t.len * p, t.w);
        ctx.strokeStyle = `rgba(${cs},${0.7 * blink})`; ctx.lineWidth = 2; ctx.strokeRect(0, -t.w / 2, t.len, t.w);
        for (let i = 1; i < 6; i++) { const x = (t.len / 6) * i; ctx.beginPath(); ctx.moveTo(x - 14, -10); ctx.lineTo(x, 0); ctx.lineTo(x - 14, 10); ctx.stroke(); }
        ctx.restore();
      }
    }
  }
  function drawArena() {
    const ar = G.arena;
    if (!ar || ar.a <= 0) return;
    const a = ar.a;
    const col = G.boss ? G.boss.d.color : '#ffffff';
    ctx.setTransform(k, 0, 0, k, ox, oy);
    ctx.fillStyle = `rgba(0,0,0,${0.32 * a})`;
    ctx.beginPath();
    const hw = G.vw, hh = G.vh;
    ctx.rect(G.cam.x - hw, G.cam.y - hh, hw * 2, hh * 2);
    ctx.ellipse(ar.x, ar.y, ar.r, ar.r, 0, 0, TAU);
    ctx.fill('evenodd');
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = a;
    ctx.strokeStyle = Q.rgba(col, 0.35); ctx.lineWidth = 10;
    ctx.beginPath(); ctx.arc(ar.x, ar.y, ar.r, 0, TAU); ctx.stroke();
    ctx.strokeStyle = Q.rgba(col, 0.9); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(ar.x, ar.y, ar.r, 0, TAU); ctx.stroke();
    ctx.strokeStyle = Q.rgba(col, 0.4); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(ar.x, ar.y, ar.r - 14, 0, TAU); ctx.stroke();
    const n = 24;
    ctx.fillStyle = Q.rgba(col, 0.9);
    for (let i = 0; i < n; i++) {
      const an = (i / n) * TAU + G.rt * 0.15, x = ar.x + Math.cos(an) * (ar.r - 7), y = ar.y + Math.sin(an) * (ar.r - 7);
      ctx.save(); ctx.translate(x, y); ctx.rotate(an + Math.PI / 4);
      ctx.fillRect(-3, -3, 6, 6);
      ctx.restore();
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }
  function drawPickups() {
    ctx.setTransform(k, 0, 0, k, ox, oy);
    const t = G.rt;
    const gems = G.gemAct;
    for (let i = 0; i < gems.length; i++) {
      const g = gems[i], s = A.gems[g.tier];
      const b = Math.sin(t * 4 + g.t) * 1.5;
      ctx.drawImage(s.img, g.x - s.half, g.y - s.half + b, s.half * 2, s.half * 2);
    }
    for (const it of G.items) {
      const s = A.items[it.k];
      if (!s) continue;
      const b = Math.sin(t * 3 + it.x) * 2.5;
      if (it.k === 'chest') {
        ctx.globalCompositeOperation = 'lighter';
        const gh = 120 + Math.sin(t * 2) * 10;
        const gr = ctx.createLinearGradient(0, it.y - gh, 0, it.y);
        gr.addColorStop(0, 'rgba(255,215,107,0)'); gr.addColorStop(1, 'rgba(255,215,107,.4)');
        ctx.fillStyle = gr; ctx.fillRect(it.x - 12, it.y - gh, 24, gh);
        ctx.globalAlpha = 0.5 + 0.2 * Math.sin(t * 4);
        ctx.drawImage(A.softs[1], it.x - 40, it.y - 30, 80, 60);
        ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      }
      ctx.drawImage(s.img, it.x - s.half, it.y - s.half + b, s.half * 2, s.half * 2);
    }
  }
  function drawBoss(e) {
    const b = e.boss;
    const off = b.id === 'heyan' ? 80 : b.id === 'linyuan' ? 86 : 84;
    let sc = 1, alpha = b.alpha;
    if (b.state === 'intro') { const p = clamp(1 - b.stT / 1.9, 0, 1); sc = 0.4 + 0.6 * Q.easeOut(p); alpha = Math.min(alpha, p * 1.5); }
    ctx.setTransform(k * sc, 0, 0, k * sc, ox + e.x * k, oy + (e.y + off) * k);
    ctx.globalAlpha = clamp(alpha, 0, 1);
    A.drawBoss(ctx, b.id, G.rt, { phase: b.phase, anim: b.anim, animT: b.animT, face: b.face || 1, moving: b.moving });
    if (e.flash > 0 || b.state === 'dying') {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = b.state === 'dying' ? 0.4 + 0.4 * Math.sin(G.rt * 30) : 0.35;
      ctx.drawImage(A.softs[0], -e.r * 1.4, -off - e.r * 1.4, e.r * 2.8, e.r * 2.8);
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.globalAlpha = 1;
    if (b.stagger > 0) {
      ctx.setTransform(k, 0, 0, k, ox, oy);
      for (let i = 0; i < 4; i++) { const a = G.rt * 5 + (i / 4) * TAU; ctx.fillStyle = '#ffe9a0'; ctx.fillRect(e.x + Math.cos(a) * 40 - 2, e.y - e.r * 1.8 + Math.sin(a) * 8 - 2, 4, 4); }
    }
  }
  function drawPlayer() {
    const P = G.p, H = G.hero;
    ctx.setTransform(k, 0, 0, k, ox, oy);
    // 脚下光环
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.5;
    ctx.drawImage(A.softs[H.pc], P.x - 30, P.y + 15 - 12, 60, 24);
    ctx.globalAlpha = 0.7; ctx.strokeStyle = Q.rgba(H.color, 0.55); ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.ellipse(P.x, P.y + 15, 17, 6, 0, 0, TAU); ctx.stroke();
    // 瞄准指示
    if (!P.dead) {
      const a = P.aim, d = 34;
      ctx.globalAlpha = 0.8; ctx.fillStyle = Q.rgba(H.color, 0.85);
      ctx.save(); ctx.translate(P.x + Math.cos(a) * d, P.y + Math.sin(a) * d); ctx.rotate(a);
      ctx.beginPath(); ctx.moveTo(6, 0); ctx.lineTo(-3, -4.5); ctx.lineTo(-1, 0); ctx.lineTo(-3, 4.5); ctx.closePath(); ctx.fill();
      ctx.restore();
      if (G.aimTgt && G.aimTgt.alive && (G.autoAim || !Q.input.hasMouse)) {
        const t = G.aimTgt, rr = t.r + 6 + Math.sin(G.rt * 8) * 1.5;
        ctx.strokeStyle = Q.rgba(H.color, 0.6); ctx.lineWidth = 1.4;
        for (let i = 0; i < 4; i++) { const an = (i / 4) * TAU + G.rt * 2; ctx.beginPath(); ctx.arc(t.x, t.y, rr, an, an + 0.6); ctx.stroke(); }
      }
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    // 残影
    for (const a of G.after) {
      ctx.setTransform(k, 0, 0, k, ox + a.x * k, oy + (a.y + 15) * k);
      ctx.globalAlpha = 0.32 * (1 - a.t / 0.28);
      ctx.globalCompositeOperation = 'lighter';
      A.drawHero(ctx, H.id, G.rt, { move: 1, face: a.face });
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    if (P.dead) return;
    // 英雄
    let alpha = 1;
    if (P.iframe > 0 && P.dashT <= 0) alpha = Math.floor(G.rt * 20) % 2 ? 0.35 : 1;
    ctx.globalAlpha = alpha;
    ctx.setTransform(k, 0, 0, k, ox + P.x * k, oy + (P.y + 15) * k);
    A.drawHero(ctx, H.id, G.rt, { move: P.move, face: P.face, swing: P.swing * -1.2, draw: P.draw });
    if (P.hurtT > 0) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = P.hurtT / 0.3 * 0.6; ctx.drawImage(A.softs[4], -24, -50, 48, 56); ctx.globalCompositeOperation = 'source-over'; }
    ctx.globalAlpha = 1;
    ctx.setTransform(k, 0, 0, k, ox, oy);
    // 护盾 / 固守 / 冰甲
    if (P.fortify > 0 || P.iceShield) {
      ctx.globalCompositeOperation = 'lighter';
      const c = P.iceShield ? '#bff4ff' : '#ffcf6b';
      ctx.strokeStyle = Q.rgba(c, 0.5 + 0.2 * Math.sin(G.rt * 6)); ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i <= 6; i++) { const a = (i / 6) * TAU + G.rt * 0.6, x = P.x + Math.cos(a) * 26, y = P.y - 4 + Math.sin(a) * 30; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
      ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
    }
    // 血条
    const S = G.st, f = clamp(P.hp / S.maxHp, 0, 1), bw = 36, by = P.y + 24;
    ctx.fillStyle = 'rgba(0,0,0,.65)'; ctx.fillRect(P.x - bw / 2 - 1, by - 1, bw + 2, 5.5);
    ctx.fillStyle = f > 0.5 ? '#6bffb5' : f > 0.25 ? '#ffd36b' : '#ff4a4a'; ctx.fillRect(P.x - bw / 2, by, bw * f, 3.5);
  }
  function drawWeapons() {
    ctx.setTransform(k, 0, 0, k, ox, oy);
    ctx.globalCompositeOperation = 'lighter';
    for (const w of G.weapons) {
      if (w.id === 'orbit' && w.pos.length) {
        const s = A.pj.blade, sc = w.evo ? 1.25 : 1;
        for (let i = 0; i < w.pos.length; i += 3) {
          const x = w.pos[i], y = w.pos[i + 1], a = w.pos[i + 2];
          ctx.setTransform(k * Math.cos(a) * sc, k * Math.sin(a) * sc, -k * Math.sin(a) * sc, k * Math.cos(a) * sc, ox + x * k, oy + y * k);
          ctx.drawImage(s.img, -s.half, -s.half, s.half * 2, s.half * 2);
        }
        ctx.setTransform(k, 0, 0, k, ox, oy);
      } else if (w.id === 'sword' && w.evo && w.ready > 0) {
        const s = A.pj.sword, max = 12 + G.st.proj * 2;
        for (let j = 0; j < w.ready; j++) {
          const an = w.a + (j / max) * TAU, x = G.p.x + Math.cos(an) * 46, y = G.p.y - 10 + Math.sin(an) * 46;
          ctx.setTransform(k * Math.cos(an) * 0.8, k * Math.sin(an) * 0.8, -k * Math.sin(an) * 0.8, k * Math.cos(an) * 0.8, ox + x * k, oy + y * k);
          ctx.globalAlpha = 0.85;
          ctx.drawImage(s.img, -s.half, -s.half, s.half * 2, s.half * 2);
        }
        ctx.globalAlpha = 1; ctx.setTransform(k, 0, 0, k, ox, oy);
      } else if (w.id === 'disc' && w.evo && w.pos.length) {
        const s = A.pj.moon, sc = G.st.area;
        for (let i = 0; i < w.pos.length; i += 3) {
          const x = w.pos[i], y = w.pos[i + 1], a = w.pos[i + 2];
          ctx.setTransform(k * Math.cos(a) * sc, k * Math.sin(a) * sc, -k * Math.sin(a) * sc, k * Math.cos(a) * sc, ox + x * k, oy + y * k);
          ctx.drawImage(s.img, -s.half, -s.half, s.half * 2, s.half * 2);
        }
        ctx.setTransform(k, 0, 0, k, ox, oy);
      }
    }
    ctx.globalCompositeOperation = 'source-over';
  }
  function drawProjectiles() {
    const list = G.pAct;
    ctx.globalCompositeOperation = 'lighter';
    // 拖尾
    ctx.setTransform(k, 0, 0, k, ox, oy);
    ctx.lineCap = 'round';
    const trail = (kind, col, w, len) => {
      ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath();
      for (let i = 0; i < list.length; i++) { const p = list[i]; if (p.k !== kind || (p.k === 'sword' && p.t < p.wait)) continue; ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * len, p.y - p.vy * len); }
      ctx.stroke();
    };
    trail('bolt', 'rgba(165,139,255,.45)', 4, 0.05);
    trail('mini', 'rgba(107,228,255,.4)', 3, 0.04);
    trail('arrow', 'rgba(107,255,181,.35)', 2.5, 0.03);
    trail('beam', 'rgba(255,224,138,.45)', 6, 0.05);
    trail('sword', 'rgba(138,255,200,.35)', 4, 0.04);
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      const s = A.pj[p.k];
      if (!s) continue;
      let a = Math.atan2(p.vy, p.vx), sc = p.scale;
      if (p.k === 'disc') a = p.t * 18;
      if (p.k === 'wave') sc = p.r / 22;
      if (p.k === 'bolt' || p.k === 'mini') a = p.t * 6;
      const c = Math.cos(a) * k * sc, sn = Math.sin(a) * k * sc;
      ctx.globalAlpha = p.k === 'wave' ? clamp(p.life / 0.3, 0, 1) : (p.k === 'sword' && p.t < p.wait ? 0.6 + p.t / p.wait * 0.4 : 1);
      ctx.setTransform(c, sn, -sn, c, ox + p.x * k, oy + p.y * k);
      ctx.drawImage(s.img, -s.half, -s.half, s.half * 2, s.half * 2);
    }
    ctx.globalAlpha = 1;
    ctx.setTransform(k, 0, 0, k, ox, oy);
    // 斩击
    for (const s of G.slashes) {
      if (s.att) { s.x = G.p.x; s.y = G.p.y; }
      const p = s.t / s.dur;
      const sweep = Q.easeOut(Math.min(1, p * 2.2));
      const a0 = s.a - s.half, a1 = s.a - s.half + s.half * 2 * sweep;
      const gr = ctx.createRadialGradient(s.x, s.y, s.R * 0.35, s.x, s.y, s.R);
      gr.addColorStop(0, Q.rgba(s.col, 0)); gr.addColorStop(0.7, Q.rgba(s.col, 0.35 * (1 - p))); gr.addColorStop(0.94, `rgba(255,255,255,${0.85 * (1 - p)})`); gr.addColorStop(1, Q.rgba(s.col, 0));
      ctx.fillStyle = gr;
      ctx.beginPath(); ctx.arc(s.x, s.y, s.R, a0, a1); ctx.arc(s.x, s.y, s.R * 0.45, a1, a0, true); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = `rgba(255,250,230,${0.9 * (1 - p)})`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(s.x, s.y, s.R * 0.97, Math.max(a0, a1 - 0.9), a1); ctx.stroke();
    }
    // 闪电
    for (const b of G.bolts) {
      const p = b.t / b.dur, al = 1 - p;
      const pts = b.pts;
      ctx.beginPath();
      for (let i = 0; i < pts.length - 2; i += 2) {
        const x0 = pts[i], y0 = pts[i + 1], x1 = pts[i + 2], y1 = pts[i + 3];
        const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
        const seg = Math.max(2, Math.round(L / 26));
        if (i === 0) ctx.moveTo(x0, y0);
        for (let s = 1; s <= seg; s++) {
          const f = s / seg, j = s === seg ? 0 : (Math.random() - 0.5) * Math.min(28, L * 0.25);
          ctx.lineTo(x0 + dx * f + nx * j, y0 + dy * f + ny * j);
        }
      }
      ctx.strokeStyle = `rgba(120,200,255,${0.35 * al})`; ctx.lineWidth = b.w * 4; ctx.stroke();
      ctx.strokeStyle = `rgba(235,248,255,${0.95 * al})`; ctx.lineWidth = b.w; ctx.stroke();
    }
    // 陨星
    for (const m of G.meteors) {
      if (m.t < 0) continue;
      const p = clamp(m.t / m.dur, 0, 1);
      if (p >= 1) continue;
      const e = p * p;
      const sx = m.x + 260, sy = m.y - 640;
      const x = lerp(sx, m.x, e), y = lerp(sy, m.y, e);
      const col = m.enemy ? '255,190,120' : '255,215,107';
      const gr = ctx.createLinearGradient(x, y, x + 90, y - 220);
      gr.addColorStop(0, `rgba(${col},.9)`); gr.addColorStop(1, `rgba(${col},0)`);
      ctx.strokeStyle = gr; ctx.lineWidth = m.evo ? 9 : 6;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 90, y - 220); ctx.stroke();
      const hs = m.evo ? 26 : 20;
      ctx.drawImage(A.glows[m.enemy ? 2 : 1], x - hs, y - hs, hs * 2, hs * 2);
      if (!m.enemy) {
        ctx.strokeStyle = `rgba(255,215,107,${0.5 * p})`; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.ellipse(m.x, m.y, m.R * (1.2 - p * 0.2), m.R * 0.75 * (1.2 - p * 0.2), 0, 0, TAU); ctx.stroke();
      }
    }
    ctx.globalCompositeOperation = 'source-over';
  }
  function drawBeams() {
    if (!G.beams.length) return;
    ctx.setTransform(k, 0, 0, k, ox, oy);
    ctx.globalCompositeOperation = 'lighter';
    for (const b of G.beams) {
      ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.ang);
      if (b.t < b.tele) {
        const p = b.t / b.tele;
        ctx.fillStyle = `rgba(255,107,213,${0.12 + 0.18 * p * (0.6 + 0.4 * Math.sin(G.rt * 30))})`;
        ctx.fillRect(0, -b.w / 2, b.len, b.w);
        ctx.strokeStyle = `rgba(255,170,240,${0.6 * p})`; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(b.len, 0); ctx.stroke();
      } else {
        const f = clamp((b.tele + b.dur - b.t) / 0.25, 0, 1) * clamp((b.t - b.tele) / 0.1, 0, 1);
        const gr = ctx.createLinearGradient(0, -b.w, 0, b.w);
        gr.addColorStop(0, 'rgba(200,80,255,0)'); gr.addColorStop(0.35, `rgba(255,107,213,${0.6 * f})`); gr.addColorStop(0.5, `rgba(255,255,255,${f})`); gr.addColorStop(0.65, `rgba(255,107,213,${0.6 * f})`); gr.addColorStop(1, 'rgba(200,80,255,0)');
        ctx.fillStyle = gr; ctx.fillRect(0, -b.w, b.len, b.w * 2);
      }
      ctx.restore();
    }
    ctx.globalCompositeOperation = 'source-over';
  }
  function drawParticles() {
    ctx.setTransform(k, 0, 0, k, ox, oy);
    ctx.globalCompositeOperation = 'lighter';
    const n = Q.PT.n, X = Q.PT.x, Y = Q.PT.y, VX = Q.PT.vx, VY = Q.PT.vy, L = Q.PT.l, M = Q.PT.m, S = Q.PT.s, C = Q.PT.c, K = Q.PT.k;
    for (let i = 0; i < n; i++) {
      if (K[i] === 1) continue;
      const f = L[i] / M[i];
      let s = S[i] * (K[i] === 2 ? 1.6 : 2.2) * (0.4 + 0.6 * f);
      ctx.globalAlpha = K[i] === 2 ? f * (0.6 + 0.4 * Math.sin(G.rt * 20 + i)) : f;
      ctx.drawImage(A.glows[C[i]], X[i] - s, Y[i] - s, s * 2, s * 2);
    }
    ctx.globalAlpha = 1;
    // 火花：按颜色批量绘制
    ctx.lineCap = 'round';
    for (let c = 0; c < 16; c++) {
      let any = false;
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        if (K[i] !== 1 || C[i] !== c) continue;
        any = true;
        const f = L[i] / M[i];
        ctx.moveTo(X[i], Y[i]); ctx.lineTo(X[i] - VX[i] * 0.045 * f, Y[i] - VY[i] * 0.045 * f);
      }
      if (any) { ctx.strokeStyle = Q.PAL[c]; ctx.lineWidth = 1.6; ctx.stroke(); }
    }
    // 冲击环
    for (const r of G.rings) {
      const p = r.t / r.dur, rr = lerp(r.r0, r.r1, Q.easeOut(p));
      ctx.strokeStyle = Q.rgba(r.col, 0.85 * (1 - p)); ctx.lineWidth = r.w * (1 - p * 0.7);
      ctx.beginPath(); ctx.ellipse(r.x, r.y, rr, rr * 0.8, 0, 0, TAU); ctx.stroke();
    }
    for (const f of G.flashes) {
      const p = f.t / f.dur;
      ctx.globalAlpha = (1 - p) * 0.8;
      const pc = Q.PAL.indexOf(f.col);
      const img = pc >= 0 ? A.softs[pc] : lightSprite(f.col);
      ctx.drawImage(img, f.x - f.r, f.y - f.r, f.r * 2, f.r * 2);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
  function drawEnemyBullets() {
    const list = G.ebAct;
    if (!list.length) return;
    ctx.setTransform(k, 0, 0, k, ox, oy);
    for (let i = 0; i < list.length; i++) {
      const b = list[i], s = A.bul[b.k];
      const pul = 1 + 0.08 * Math.sin(G.rt * 14 + i);
      const h = s.half * pul;
      ctx.drawImage(s.img, b.x - h, b.y - h, h * 2, h * 2);
    }
  }
  function drawTexts() {
    if (!G.texts.length) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    for (const t of G.texts) {
      const p = t.t / t.life;
      const pop = t.crit ? (p < 0.15 ? 1 + (0.15 - p) * 5 : 1) : 1;
      const size = (typeof t.v === 'string' ? 17 : t.crit ? 21 : 14) * pop * Math.max(0.8, G.scale);
      ctx.font = `${t.crit ? 'italic 900' : '800'} ${size.toFixed(1)}px ${typeof t.v === 'string' ? SERIF : NUMF}`;
      ctx.globalAlpha = p > 0.7 ? (1 - p) / 0.3 : 1;
      const x = SX(t.x), y = SY(t.y);
      ctx.lineWidth = t.crit ? 4 : 3; ctx.strokeStyle = 'rgba(10,4,4,.85)';
      ctx.strokeText(t.v, x, y);
      ctx.fillStyle = t.col || (t.crit ? '#ffcf4a' : '#fff6ea');
      ctx.fillText(t.v, x, y);
    }
    ctx.globalAlpha = 1;
  }

  /* ---------- HUD ---------- */
  function rrect(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  function drawHUD() {
    const P = G.p, S = G.st, mob = G.mobile || W < 640;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const st = R.safeTop || 0;
    // 经验条
    const xpH = mob ? 5 : 6, xf = clamp(G.xp / G.xpNext, 0, 1);
    ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(0, st, W, xpH + 2);
    const xg = ctx.createLinearGradient(0, 0, W, 0); xg.addColorStop(0, '#6be4ff'); xg.addColorStop(0.6, '#b49bff'); xg.addColorStop(1, '#ffe9b0');
    ctx.fillStyle = xg; ctx.fillRect(0, st + 1, W * xf, xpH);
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.6; ctx.fillStyle = '#ffffff'; ctx.fillRect(W * xf - 3, st + 1, 3, xpH); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    // 等级
    const lx = 12, ly = st + xpH + 10;
    ctx.font = `700 ${mob ? 13 : 15}px ${LATIN}`; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    const lvTxt = 'Lv ' + G.level;
    const lw = ctx.measureText(lvTxt).width + 18;
    rrect(lx, ly, lw, mob ? 22 : 24, 11); ctx.fillStyle = 'rgba(14,8,8,.72)'; ctx.fill(); ctx.strokeStyle = 'rgba(255,215,160,.35)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = '#ffe9b0'; ctx.fillText(lvTxt, lx + 9, ly + (mob ? 11 : 12) + 1);
    // 手机：顶部血条
    let iconY = ly + (mob ? 30 : 34);
    if (mob) {
      const bx = lx + lw + 8, bw = Math.min(130, W * 0.32), f = clamp(P.hp / S.maxHp, 0, 1);
      rrect(bx, ly + 5, bw, 12, 6); ctx.fillStyle = 'rgba(14,8,8,.72)'; ctx.fill();
      rrect(bx + 1.5, ly + 6.5, Math.max(0, (bw - 3) * f), 9, 4.5); ctx.fillStyle = f > 0.5 ? '#5fe8a0' : f > 0.25 ? '#ffd36b' : '#ff4a4a'; ctx.fill();
      ctx.font = `700 10px ${NUMF}`; ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.fillText(Math.ceil(P.hp) + ' / ' + Math.round(S.maxHp), bx + bw / 2, ly + 11.5);
      ctx.textAlign = 'left';
    }
    // 已有升级
    const isz = mob ? 22 : 28, gap = 4;
    let ix = lx, row = 0;
    const items = [];
    for (const w of G.weapons) items.push([w.evo ? Q.EVOS[Q.UPG[w.id].evo].glyph : Q.UPG[w.id].glyph, Q.UPG[w.id].color, w.lvl, Q.UPG[w.id].max, w.evo]);
    for (const id of Q.PASSIVES) if (G.lv[id]) items.push([Q.UPG[id].glyph, Q.UPG[id].color, G.lv[id], Q.UPG[id].max, false]);
    const perRow = mob ? 6 : 6;
    items.forEach((it, i) => {
      if (i && i % perRow === 0) { row++; ix = lx; }
      const y = iconY + row * (isz + 9);
      const ic = A.icon(it[0], it[1], Math.round(isz * dpr));
      ctx.drawImage(ic, ix, y, isz, isz);
      if (it[4]) { ctx.strokeStyle = '#ffe9b0'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(ix + isz / 2, y + isz / 2, isz / 2 + 1.5, 0, TAU); ctx.stroke(); }
      const pips = it[3], pw = Math.min(4, (isz - 2) / pips - 1);
      for (let p = 0; p < pips; p++) { ctx.fillStyle = p < it[2] ? (it[4] ? '#ffe9b0' : it[1]) : 'rgba(255,255,255,.18)'; ctx.fillRect(ix + 1 + p * (pw + 1), y + isz + 2, pw, 2.5); }
      ix += isz + gap;
    });
    // 计时与路程
    const cx = W / 2, M = Q.MODES[G.mode];
    const total = G.t;
    ctx.textAlign = 'center';
    ctx.font = `700 ${mob ? 24 : 30}px ${LATIN}`;
    ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillText(Q.fmtTime(total), cx + 1, st + (mob ? 30 : 36) + 1);
    ctx.fillStyle = '#fff6ea'; ctx.fillText(Q.fmtTime(total), cx, st + (mob ? 30 : 36));
    const B = Q.BIOMES[Q.STAGES[G.stage].biome];
    const boss = G.boss;
    if (!boss) {
      const pw = mob ? 150 : 210, py = st + (mob ? 50 : 60);
      ctx.font = `600 ${mob ? 11 : 12}px ${SERIF}`;
      ctx.fillStyle = B.accent;
      const label = B.name + ' · 第' + ['一', '二', '三'][G.stage] + '程';
      ctx.fillText(label, cx, py);
      const by = py + 11, f = clamp(G.stageT / G.stageDur, 0, 1);
      ctx.fillStyle = 'rgba(0,0,0,.55)'; rrect(cx - pw / 2, by, pw, 5, 2.5); ctx.fill();
      ctx.fillStyle = B.accent; rrect(cx - pw / 2, by, Math.max(5, pw * f), 5, 2.5); ctx.fill();
      // 三程节点
      ctx.save(); ctx.translate(cx + pw / 2 + 10, by + 2.5); ctx.rotate(Math.PI / 4);
      ctx.fillStyle = f > 0.97 ? '#ff6b4a' : 'rgba(255,107,74,.6)'; ctx.fillRect(-5, -5, 10, 10);
      ctx.restore();
      ctx.font = `600 ${mob ? 10 : 11}px ${SERIF}`; ctx.fillStyle = 'rgba(255,240,230,.6)';
      if (G.nextStageT > 0) { ctx.fillStyle = '#ffe9b0'; ctx.fillText('前路已开', cx, by + 18); }
      else { const left = Math.max(0, G.stageDur - G.stageT); ctx.fillText('首领 ' + Q.fmtTime(left), cx, by + 18); }
      // 三颗星：已击败首领
      for (let i = 0; i < 3; i++) {
        const sx = cx - 20 + i * 20, sy = by + 34;
        ctx.fillStyle = i < G.bossKills ? '#ffd76b' : 'rgba(255,255,255,.16)';
        ctx.beginPath(); for (let j = 0; j < 8; j++) { const a = (j / 8) * TAU - Math.PI / 2, r = j % 2 ? 2 : 5; ctx.lineTo(sx + Math.cos(a) * r, sy + Math.sin(a) * r); } ctx.closePath(); ctx.fill();
      }
    } else drawBossBar(boss, mob, st);
    // 击杀与星尘（右上，暂停按钮下方）
    ctx.textAlign = 'right';
    const rx = W - 14, ry = st + (mob ? 66 : 74);
    ctx.font = `700 ${mob ? 15 : 17}px ${NUMF}`; ctx.fillStyle = '#fff6ea';
    ctx.fillText(G.kills.toLocaleString(), rx, ry);
    ctx.font = `600 ${mob ? 11 : 12}px ${SERIF}`; ctx.fillStyle = 'rgba(255,240,230,.65)';
    ctx.fillText('击杀', rx - ctx.measureText(G.kills.toLocaleString()).width - 0, ry + (mob ? 15 : 17));
    ctx.font = `700 ${mob ? 13 : 14}px ${NUMF}`; ctx.fillStyle = '#ffe9b0';
    ctx.fillText('✦ ' + G.dustPicked, rx, ry + (mob ? 32 : 36));
    // 连斩
    if (G.combo >= 15) {
      const pop = 1 + Math.max(0, G.comboT - 1.9) * 1.2;
      ctx.font = `italic 900 ${Math.round((mob ? 20 : 26) * pop)}px ${NUMF}`; ctx.fillStyle = '#ffcf4a';
      ctx.globalAlpha = clamp(G.comboT / 0.6, 0, 1);
      ctx.strokeStyle = 'rgba(20,6,0,.8)'; ctx.lineWidth = 4;
      ctx.strokeText('×' + G.combo, rx, ry + (mob ? 64 : 76)); ctx.fillText('×' + G.combo, rx, ry + (mob ? 64 : 76));
      ctx.font = `700 ${mob ? 11 : 12}px ${SERIF}`; ctx.fillStyle = '#ffe9b0'; ctx.fillText('连斩', rx, ry + (mob ? 84 : 100));
      ctx.globalAlpha = 1;
    }
    // 桌面：底部血条与技能
    if (!mob) {
      const bw = 280, bx = 22, by = H - 40, f = clamp(P.hp / S.maxHp, 0, 1);
      ctx.textAlign = 'left';
      rrect(bx, by, bw, 16, 8); ctx.fillStyle = 'rgba(14,8,8,.75)'; ctx.fill(); ctx.strokeStyle = 'rgba(255,215,160,.25)'; ctx.lineWidth = 1; ctx.stroke();
      const hg = ctx.createLinearGradient(bx, 0, bx + bw, 0);
      if (f > 0.25) { hg.addColorStop(0, '#2fbf7a'); hg.addColorStop(1, '#7dffb5'); } else { hg.addColorStop(0, '#b0202a'); hg.addColorStop(1, '#ff5a4a'); }
      rrect(bx + 2, by + 2, Math.max(0, (bw - 4) * f), 12, 6); ctx.fillStyle = hg; ctx.fill();
      ctx.font = `700 12px ${NUMF}`; ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center';
      ctx.fillText(Math.ceil(P.hp) + ' / ' + Math.round(S.maxHp), bx + bw / 2, by + 8.5);
      ctx.textAlign = 'left'; ctx.font = `600 12px ${SERIF}`; ctx.fillStyle = 'rgba(255,240,230,.7)';
      ctx.fillText(G.hero.cls + ' · ' + G.hero.name + (S.armor ? '　护甲 ' + S.armor : ''), bx + 2, by - 11);
      // 技能 / 闪避
      const cxs = W / 2, cy = H - 44;
      cdButton(cxs - 36, cy, 30, Q.UPG[G.hero.skill].glyph, G.hero.color, P.skillCd / Q.game.skillCd(), 'Q / 右键');
      cdButton(cxs + 36, cy, 24, '闪', '#9fe8ff', P.dashCd / 1.5, '空格');
      ctx.textAlign = 'right'; ctx.font = `600 11px ${SERIF}`; ctx.fillStyle = 'rgba(255,240,230,.45)';
      ctx.fillText((G.autoAim ? '自动瞄准' : '鼠标瞄准') + ' · F 切换　Esc 暂停', W - 16, H - 18);
    }
    // 屏外指示
    const hw = G.vw / 2, hh = G.vh / 2;
    const ind = (x, y, col, big) => {
      const dx = x - G.cam.x, dy = y - G.cam.y;
      if (Math.abs(dx) < hw - 10 && Math.abs(dy) < hh - 10) return;
      const a = Math.atan2(dy, dx), m = 34;
      const ex = clamp(W / 2 + Math.cos(a) * 9999, m, W - m), ey = clamp(H / 2 + Math.sin(a) * 9999, m + st + 40, H - m - (mob ? 150 : 60));
      const t = Math.min((W / 2 - m) / Math.abs(Math.cos(a) || 1e-6), (H / 2 - m - 40) / Math.abs(Math.sin(a) || 1e-6));
      const px = clamp(W / 2 + Math.cos(a) * t, m, W - m), py = clamp(H / 2 + Math.sin(a) * t, m + st + 40, H - m - (mob ? 150 : 60));
      ctx.save(); ctx.translate(px, py); ctx.rotate(a);
      ctx.fillStyle = col; ctx.globalAlpha = 0.6 + 0.3 * Math.sin(G.rt * 6);
      const s = big ? 11 : 8;
      ctx.beginPath(); ctx.moveTo(s, 0); ctx.lineTo(-s * 0.7, -s * 0.75); ctx.lineTo(-s * 0.3, 0); ctx.lineTo(-s * 0.7, s * 0.75); ctx.closePath(); ctx.fill();
      ctx.restore(); ctx.globalAlpha = 1;
      void ex; void ey;
    };
    for (const e of G.eAct) if (e.elite) ind(e.x, e.y, '#ffd76b', false);
    for (const it of G.items) if (it.k === 'chest') ind(it.x, it.y, '#ffe9b0', false);
    if (boss) ind(boss.x, boss.y, boss.d.color, true);
    // 摇杆
    const J = Q.input.joy;
    if (J.active) {
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = 'rgba(255,240,230,.5)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(J.ox, J.oy, 56, 0, TAU); ctx.stroke();
      ctx.fillStyle = 'rgba(255,240,230,.08)'; ctx.fill();
      ctx.globalAlpha = 0.85;
      const g = ctx.createRadialGradient(J.x, J.y, 0, J.x, J.y, 26); g.addColorStop(0, 'rgba(255,240,230,.9)'); g.addColorStop(1, 'rgba(255,170,120,.35)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(J.x, J.y, 24, 0, TAU); ctx.fill();
      ctx.globalAlpha = 1;
    }
  }
  function cdButton(x, y, r, glyph, col, f, key) {
    f = clamp(f, 0, 1);
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU);
    ctx.fillStyle = 'rgba(14,8,8,.78)'; ctx.fill();
    ctx.strokeStyle = f <= 0 ? col : 'rgba(255,255,255,.18)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.font = `700 ${Math.round(r * 0.9)}px ${SERIF}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = f <= 0 ? '#fff6ea' : 'rgba(255,246,234,.4)'; ctx.fillText(glyph, x, y + 1);
    if (f > 0) {
      ctx.fillStyle = 'rgba(0,0,0,.45)';
      ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, r - 2, -Math.PI / 2, -Math.PI / 2 + TAU * f); ctx.closePath(); ctx.fill();
    } else {
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.25 + 0.15 * Math.sin(G.rt * 4);
      ctx.drawImage(lightSprite(col), x - r * 1.8, y - r * 1.8, r * 3.6, r * 3.6);
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    }
    ctx.font = `600 10px ${SERIF}`; ctx.fillStyle = 'rgba(255,240,230,.55)'; ctx.fillText(key, x, y + r + 12);
  }
  function drawBossBar(e, mob, st) {
    const b = e.boss, bw = Math.min(mob ? W - 40 : 620, W - 40), bx = W / 2 - bw / 2, by = st + (mob ? 52 : 62);
    ctx.textAlign = 'center';
    ctx.font = `700 ${mob ? 13 : 15}px ${SERIF}`;
    ctx.fillStyle = b.def.color;
    ctx.fillText(b.def.title + ' · ' + b.def.name + (b.enraged ? ' · 狂怒' : ''), W / 2, by);
    const y = by + 12, h = mob ? 9 : 12;
    rrect(bx - 2, y - 2, bw + 4, h + 4, 4); ctx.fillStyle = 'rgba(8,2,4,.85)'; ctx.fill();
    ctx.strokeStyle = b.enraged ? `rgba(255,60,60,${0.6 + 0.4 * Math.sin(G.rt * 8)})` : Q.rgba(b.def.color, 0.55); ctx.lineWidth = 1.2; ctx.stroke();
    const f = clamp(e.hp / e.mhp, 0, 1), lag = clamp(e.hpLag, 0, 1);
    ctx.fillStyle = 'rgba(255,240,220,.85)'; ctx.fillRect(bx, y, bw * lag, h);
    const g = ctx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, '#ff6a5a'); g.addColorStop(1, '#a01a2a');
    ctx.fillStyle = g; ctx.fillRect(bx, y, bw * f, h);
    ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.fillRect(bx, y, bw * f, 2);
    const th = b.id === 'yuanyao' ? [0.66, 0.33] : [0.5];
    ctx.fillStyle = 'rgba(0,0,0,.7)';
    for (const t of th) ctx.fillRect(bx + bw * t - 1, y, 2, h);
    ctx.font = `700 ${mob ? 10 : 11}px ${NUMF}`; ctx.fillStyle = '#ffffff';
    ctx.fillText(Q.fmtNum(Math.max(0, e.hp)) + ' / ' + Q.fmtNum(e.mhp), W / 2, y + h / 2 + 0.5);
  }

  /* ---------- 标题背景 ---------- */
  const T = { stars: [], meteors: [], embers: [], ridges: null, t: 0 };
  function initTitle() {
    const rnd = Q.mulberry(42);
    for (let i = 0; i < 260; i++) T.stars.push({ x: rnd(), y: rnd() * 0.75, s: rnd() * 1.4 + 0.3, p: rnd() * TAU, c: rnd() < 0.15 ? 1 : rnd() < 0.3 ? 8 : 0 });
    T.ridges = [0, 1, 2].map((l) => { const pts = []; let y = 0; for (let i = 0; i <= 60; i++) { y += (rnd() - 0.5) * 0.08; y = clamp(y, -0.12, 0.12); pts.push(y + Math.sin(i * (0.35 + l * 0.2)) * 0.05 * (1 + l)); } return pts; });
  }
  function drawTitle(dt, tint) {
    T.t += dt;
    const t = T.t;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#05030b'); sky.addColorStop(0.5, '#140918'); sky.addColorStop(0.78, '#2c0f12'); sky.addColorStop(1, '#4a1a10');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
    // 远方巨星
    ctx.globalCompositeOperation = 'lighter';
    const mx = W * 0.72, my = H * 0.26, mr = Math.min(W, H) * 0.16;
    ctx.globalAlpha = 0.5; ctx.drawImage(lightSprite('#ff8a5a'), mx - mr * 3, my - mr * 3, mr * 6, mr * 6);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    const mg = ctx.createRadialGradient(mx - mr * 0.3, my - mr * 0.3, 0, mx, my, mr);
    mg.addColorStop(0, '#ffe2c8'); mg.addColorStop(0.5, '#ff9a6a'); mg.addColorStop(1, '#7a2a2a');
    ctx.fillStyle = mg; ctx.beginPath(); ctx.arc(mx, my, mr, 0, TAU); ctx.fill();
    ctx.save(); ctx.beginPath(); ctx.arc(mx, my, mr, 0, TAU); ctx.clip();
    const sg = ctx.createRadialGradient(mx + mr * 0.55, my + mr * 0.2, mr * 0.2, mx + mr * 0.55, my + mr * 0.2, mr * 1.1);
    sg.addColorStop(0, 'rgba(30,6,14,.75)'); sg.addColorStop(0.7, 'rgba(40,8,16,.35)'); sg.addColorStop(1, 'rgba(40,8,16,0)');
    ctx.fillStyle = sg; ctx.fillRect(mx - mr, my - mr, mr * 2, mr * 2);
    ctx.restore();
    // 星空
    ctx.globalCompositeOperation = 'lighter';
    for (const s of T.stars) {
      const tw = 0.4 + 0.6 * Math.abs(Math.sin(t * 0.8 + s.p));
      ctx.globalAlpha = tw * 0.9;
      const sz = s.s * 3;
      ctx.drawImage(A.glows[s.c], s.x * W - sz, s.y * H - sz, sz * 2, sz * 2);
    }
    ctx.globalAlpha = 1;
    // 流星（坠星）
    if (Math.random() < dt * 1.6) T.meteors.push({ x: Q.rand(0.1, 1.2) * W, y: Q.rand(-0.1, 0.3) * H, vx: -Q.rand(260, 520), vy: Q.rand(200, 380), l: 0, m: Q.rand(0.8, 1.6), big: Math.random() < 0.15 });
    for (let i = T.meteors.length - 1; i >= 0; i--) {
      const m = T.meteors[i];
      m.l += dt; m.x += m.vx * dt; m.y += m.vy * dt;
      if (m.l > m.m) { T.meteors.splice(i, 1); continue; }
      const f = Math.sin((m.l / m.m) * Math.PI);
      const len = m.big ? 0.5 : 0.25;
      const g = ctx.createLinearGradient(m.x, m.y, m.x - m.vx * len, m.y - m.vy * len);
      g.addColorStop(0, `rgba(255,240,220,${0.95 * f})`); g.addColorStop(0.3, `rgba(255,150,100,${0.5 * f})`); g.addColorStop(1, 'rgba(255,100,80,0)');
      ctx.strokeStyle = g; ctx.lineWidth = m.big ? 3 : 1.6; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(m.x, m.y); ctx.lineTo(m.x - m.vx * len, m.y - m.vy * len); ctx.stroke();
      const hs = m.big ? 14 : 7;
      ctx.globalAlpha = f; ctx.drawImage(A.glows[14], m.x - hs, m.y - hs, hs * 2, hs * 2); ctx.globalAlpha = 1;
    }
    ctx.globalCompositeOperation = 'source-over';
    // 山脉
    const cols = ['#2a0f14', '#1a080c', '#0c0406'];
    T.ridges.forEach((pts, l) => {
      const base = H * (0.68 + l * 0.1), amp = H * (0.5 - l * 0.08), drift = (t * (4 + l * 6)) % (W / 30);
      ctx.beginPath(); ctx.moveTo(-10, H);
      for (let i = 0; i < pts.length; i++) { const x = (i / (pts.length - 1)) * (W + 60) - 30 - drift * 0; ctx.lineTo(x, base + pts[i] * amp); }
      ctx.lineTo(W + 10, H); ctx.closePath();
      ctx.fillStyle = cols[l]; ctx.fill();
      if (l === 0) { ctx.strokeStyle = 'rgba(255,120,70,.35)'; ctx.lineWidth = 1.2; ctx.stroke(); }
    });
    // 地平线余烬
    ctx.globalCompositeOperation = 'lighter';
    const hz = ctx.createLinearGradient(0, H * 0.65, 0, H);
    hz.addColorStop(0, 'rgba(255,90,40,0)'); hz.addColorStop(1, `rgba(255,90,40,${0.18 + (tint || 0) * 0.1})`);
    ctx.fillStyle = hz; ctx.fillRect(0, H * 0.65, W, H * 0.35);
    // 坠落的星辰碎片（山上的光点）
    for (let i = 0; i < 6; i++) {
      const x = W * (0.08 + i * 0.17), y = H * (0.8 + 0.04 * Math.sin(i * 2.3)), p = 0.5 + 0.5 * Math.sin(t * 2 + i);
      ctx.globalAlpha = 0.4 + 0.4 * p; const s = 10 + p * 6;
      ctx.drawImage(A.glows[i % 2 ? 2 : 1], x - s, y - s, s * 2, s * 2);
    }
    ctx.globalAlpha = 1;
    // 余烬上升
    if (T.embers.length < (G.mobile ? 30 : 60)) T.embers.push({ x: Math.random() * W, y: H + 10, v: Q.rand(20, 60), s: Q.rand(1, 2.4), p: Math.random() * TAU });
    for (let i = T.embers.length - 1; i >= 0; i--) {
      const e = T.embers[i];
      e.y -= e.v * dt; e.p += dt; e.x += Math.sin(e.p * 1.4) * 14 * dt;
      if (e.y < H * 0.2) { T.embers.splice(i, 1); continue; }
      ctx.globalAlpha = clamp((e.y - H * 0.2) / (H * 0.4), 0, 1) * 0.8;
      const s = e.s * 3;
      ctx.drawImage(A.glows[e.s > 1.8 ? 1 : 2], e.x - s, e.y - s, s * 2, s * 2);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  /* ---------- 主绘制 ---------- */
  R.frame = (dt) => {
    G.rt = (G.rt || 0) + dt;
    const inRun = G.state !== 'off' && G.p;
    if (!inRun) { drawTitle(dt, 0); return; }
    const P = G.p;
    // 镜头
    const lead = 0.18;
    const tx = P.x + P.vx * lead, ty = P.y + P.vy * lead - 6;
    if (G.camSnap) { G.cam.x = tx; G.cam.y = ty; G.camSnap = false; }
    const cf = 1 - Math.exp(-dt * 7);
    G.cam.x += (tx - G.cam.x) * cf; G.cam.y += (ty - G.cam.y) * cf;
    const sh = G.shake * G.shake * 16;
    const sx = sh ? (Math.random() - 0.5) * 2 * sh : 0, sy = sh ? (Math.random() - 0.5) * 2 * sh : 0;
    setWorld(G.cam.x, G.cam.y, sx, sy);
    const bi = Q.STAGES[G.stage].biome;
    const fade = G.biomeFade;
    drawGround(fade < 1 ? G.biomeFrom : bi, 1, G.cam.x, G.cam.y);
    if (fade < 1) drawGround(bi, fade, G.cam.x, G.cam.y);
    ctx.setTransform(k, 0, 0, k, ox, oy);
    if (fade < 1) drawDecor(G.biomeFrom, 1 - fade, G.cam.x, G.cam.y, false);
    drawDecor(bi, fade, G.cam.x, G.cam.y, false);
    ctx.globalCompositeOperation = 'lighter';
    drawDecor(bi, fade, G.cam.x, G.cam.y, true);
    ctx.globalCompositeOperation = 'source-over';
    drawGroundFx();
    drawArena();
    drawPickups();
    // 敌人（按纵深排序）
    rl.length = 0;
    const hw = G.vw / 2 + 80, hh = G.vh / 2 + 120;
    for (const e of G.eAct) { if (!e.boss && Math.abs(e.x - G.cam.x) < hw && Math.abs(e.y - G.cam.y) < hh) rl.push(e); }
    rl.sort((a, b) => a.y - b.y);
    for (let i = 0; i < rl.length; i++) drawEnemy(rl[i]);
    ctx.setTransform(k, 0, 0, k, ox, oy);
    drawEnemyOverlays(rl);
    if (G.boss) drawBoss(G.boss);
    drawWeapons();
    drawPlayer();
    drawProjectiles();
    drawBeams();
    drawParticles();
    // 坠星（首领登场）
    if (G.starfall) {
      const s = G.starfall, p = clamp(s.t / s.dur, 0, 1), e = p * p * p;
      const x = lerp(s.x + 420, s.x, e), y = lerp(s.y - 900, s.y, e);
      ctx.setTransform(k, 0, 0, k, ox, oy);
      ctx.globalCompositeOperation = 'lighter';
      const col = Q.BOSSES[s.boss].color;
      const g = ctx.createLinearGradient(x, y, x + 210, y - 450);
      g.addColorStop(0, Q.rgba('#ffffff', 0.95)); g.addColorStop(0.2, Q.rgba(col, 0.7)); g.addColorStop(1, Q.rgba(col, 0));
      ctx.strokeStyle = g; ctx.lineWidth = 16; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 210, y - 450); ctx.stroke();
      ctx.drawImage(lightSprite(col), x - 90, y - 90, 180, 180);
      ctx.drawImage(A.glows[0], x - 26, y - 26, 52, 52);
      ctx.globalCompositeOperation = 'source-over';
    }
    drawEnemyBullets();
    // 环境粒子与光
    ctx.setTransform(k, 0, 0, k, ox, oy);
    ambient(G.state === 'level' || G.state === 'pause' ? 0 : dt, bi, G.cam.x, G.cam.y);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.35;
    const B = Q.BIOMES[bi], lr = 300;
    ctx.drawImage(lightSprite(B.light), P.x - lr, P.y - lr, lr * 2, lr * 2);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    drawTexts();
    // 屏幕层
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.drawImage(vignette(bi), 0, 0, W, H);
    const S = G.st;
    const low = S && P.hp / S.maxHp < 0.3 && !P.dead;
    if (G.hurtFlash > 0 || low) {
      const a = Math.max(G.hurtFlash * 0.55, low ? 0.22 + 0.14 * Math.sin(G.rt * 6) : 0);
      const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.hypot(W, H) * 0.6);
      g.addColorStop(0, 'rgba(255,0,0,0)'); g.addColorStop(1, `rgba(200,10,20,${a})`);
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }
    if (G.flash > 0) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = Q.rgba(G.flashCol || '#ffffff', Math.min(0.85, G.flash * 0.6));
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'source-over';
    }
    if (G.state !== 'end') drawHUD();
  };
  R.init = () => { initTitle(); resize(); };
  R.heroPortrait = (canvas, id, t, opts) => {
    const g = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, w, h);
    const H = Q.HEROES[id];
    g.globalCompositeOperation = 'lighter';
    const L = lightSprite(H.color);
    g.globalAlpha = 0.55 + 0.1 * Math.sin(t * 2);
    g.drawImage(L, w / 2 - w * 0.6, h * 0.55 - w * 0.6, w * 1.2, w * 1.2);
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    const s = Math.min(w / 58, h / 78);
    g.setTransform(s, 0, 0, s, w / 2, h * 0.72);
    A.drawHero(g, id, t, { move: opts && opts.move ? 1 : 0, face: 1 });
    g.setTransform(1, 0, 0, 1, 0, 0);
    if (opts && opts.locked) { g.fillStyle = 'rgba(6,3,4,.72)'; g.fillRect(0, 0, w, h); }
  };
})();
