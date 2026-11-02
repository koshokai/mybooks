/* 远征 · 程序美术：所有图像都由代码绘制（矢量 + 光晕），无外部素材 */
(function () {
  'use strict';
  const Q = window.Q, TAU = Q.TAU;
  const A = (Q.art = {});
  const RES = 2; // 精灵分辨率：每个世界单位 2 像素

  /* ---------- 基础工具 ---------- */
  function cv(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; }
  A.cv = cv;
  function rad(g, x, y, r0, r1, stops) { const gr = g.createRadialGradient(x, y, r0, x, y, r1); for (const s of stops) gr.addColorStop(s[0], s[1]); return gr; }
  function lin(g, x0, y0, x1, y1, stops) { const gr = g.createLinearGradient(x0, y0, x1, y1); for (const s of stops) gr.addColorStop(s[0], s[1]); return gr; }
  function circ(g, x, y, r) { g.beginPath(); g.arc(x, y, Math.max(0.01, r), 0, TAU); }
  function ell(g, x, y, rx, ry, rot) { g.beginPath(); g.ellipse(x, y, Math.max(0.01, rx), Math.max(0.01, ry), rot || 0, 0, TAU); }
  function ol(g, w, c) { g.lineWidth = w || 1.4; g.strokeStyle = c || 'rgba(12,5,5,.92)'; g.lineJoin = 'round'; g.stroke(); }
  function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
  function glow(g, x, y, r, c, a) {
    g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = a == null ? 1 : a;
    g.fillStyle = rad(g, x, y, 0, r, [[0, Q.rgba(c, 0.9)], [0.4, Q.rgba(c, 0.35)], [1, Q.rgba(c, 0)]]);
    g.fillRect(x - r, y - r, r * 2, r * 2); g.restore();
  }
  function eye(g, x, y, r, c) {
    glow(g, x, y, r * 3.2, c, 0.7);
    g.fillStyle = c; circ(g, x, y, r); g.fill();
    g.fillStyle = 'rgba(255,255,255,.95)'; circ(g, x - r * 0.25, y - r * 0.25, r * 0.42); g.fill();
  }
  function poly(g, pts) { g.beginPath(); g.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]); g.closePath(); }
  function flame(g, x, y, s, lean, c) {
    g.save(); g.globalCompositeOperation = 'lighter';
    g.beginPath(); g.moveTo(x + lean * s * 0.7, y - s * 1.4);
    g.quadraticCurveTo(x + s * 0.75, y - s * 0.2, x, y + s * 0.5);
    g.quadraticCurveTo(x - s * 0.75, y - s * 0.2, x + lean * s * 0.7, y - s * 1.4);
    g.fillStyle = lin(g, x, y - s * 1.4, x, y + s * 0.5, [[0, Q.rgba(c, 0)], [0.45, Q.rgba(c, 0.75)], [1, Q.rgba('#ffe9a0', 0.95)]]);
    g.fill(); g.restore();
  }
  function crackLines(g, rnd, n, R, c, w) {
    for (let i = 0; i < n; i++) {
      let a = rnd() * TAU, x = Math.cos(a) * R * rnd() * 0.5, y = Math.sin(a) * R * rnd() * 0.5;
      g.beginPath(); g.moveTo(x, y);
      const segs = 2 + ((rnd() * 3) | 0);
      for (let k = 0; k < segs; k++) { a += (rnd() - 0.5) * 1.6; x += Math.cos(a) * R * 0.35; y += Math.sin(a) * R * 0.35; g.lineTo(x, y); }
      g.save(); g.globalCompositeOperation = 'lighter';
      g.strokeStyle = Q.rgba(c, 0.35); g.lineWidth = w * 3; g.lineCap = 'round'; g.stroke();
      g.strokeStyle = Q.rgba(c, 0.95); g.lineWidth = w; g.stroke(); g.restore();
    }
  }
  function specks(g, rnd, n, R, c, s) {
    g.save(); g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < n; i++) { const a = rnd() * TAU, d = Math.sqrt(rnd()) * R; g.fillStyle = Q.rgba(c, 0.5 + rnd() * 0.5); circ(g, Math.cos(a) * d, Math.sin(a) * d, s * (0.5 + rnd())); g.fill(); }
    g.restore();
  }
  function shadow(g, rx, ry, a) { g.fillStyle = `rgba(0,0,0,${a || 0.38})`; ell(g, 0, 0, rx, ry || rx * 0.34); g.fill(); }

  /* ---------- 粒子光点 ---------- */
  A.glows = []; A.softs = [];
  function buildGlows() {
    Q.PAL.forEach((c, i) => {
      const s = 64, k = cv(s, s), g = k.getContext('2d');
      g.fillStyle = rad(g, 32, 32, 0, 32, [[0, 'rgba(255,255,255,1)'], [0.16, Q.rgba(c, 0.95)], [0.42, Q.rgba(c, 0.32)], [1, Q.rgba(c, 0)]]);
      g.fillRect(0, 0, s, s); A.glows[i] = k;
      const k2 = cv(s, s), g2 = k2.getContext('2d');
      g2.fillStyle = rad(g2, 32, 32, 0, 32, [[0, Q.rgba(c, 0.55)], [0.5, Q.rgba(c, 0.18)], [1, Q.rgba(c, 0)]]);
      g2.fillRect(0, 0, s, s); A.softs[i] = k2;
    });
  }

  /* ======================================================================
     魔物精灵（3/4 侧视，默认面向右）
     ====================================================================== */
  const P = {};
  /* ----- 烬原 ----- */
  P.imp = (g, r) => {
    flame(g, 0, -r * 0.95, r * 0.7, 0.1, '#ff7a2a');
    g.beginPath(); g.moveTo(0, -r * 1.42);
    g.bezierCurveTo(r * 0.5, -r * 1.0, r * 1.05, -r * 0.55, r * 0.98, r * 0.2);
    g.bezierCurveTo(r * 0.92, r * 0.85, r * 0.45, r * 1.0, 0, r * 1.0);
    g.bezierCurveTo(-r * 0.45, r * 1.0, -r * 0.92, r * 0.85, -r * 0.98, r * 0.2);
    g.bezierCurveTo(-r * 1.05, -r * 0.55, -r * 0.5, -r * 1.0, 0, -r * 1.42);
    g.closePath();
    g.fillStyle = rad(g, -r * 0.3, -r * 0.35, r * 0.1, r * 1.5, [[0, '#c4492c'], [0.5, '#6e1d10'], [1, '#2a0808']]);
    g.fill(); ol(g, 1.6);
    for (const s of [-1, 1]) {
      g.beginPath(); g.moveTo(s * r * 0.42, -r * 0.62); g.quadraticCurveTo(s * r * 0.7, -r * 1.0, s * r * 0.95, -r * 1.1); g.quadraticCurveTo(s * r * 0.75, -r * 0.7, s * r * 0.7, -r * 0.45); g.closePath();
      g.fillStyle = '#2a110b'; g.fill(); ol(g, 1);
    }
    glow(g, 0, r * 0.4, r * 0.8, '#ff7a2a', 0.6);
    eye(g, -r * 0.36, -r * 0.15, r * 0.19, '#ffe27a'); eye(g, r * 0.36, -r * 0.15, r * 0.19, '#ffe27a');
    g.strokeStyle = '#ffb347'; g.lineWidth = 1.3; g.beginPath(); g.moveTo(-r * 0.3, r * 0.3); g.quadraticCurveTo(0, r * 0.52, r * 0.3, r * 0.3); g.stroke();
  };
  P.magma = (g, r) => {
    const rnd = Q.mulberry(11);
    circ(g, 0, 0, r); g.fillStyle = rad(g, -r * 0.3, -r * 0.4, r * 0.1, r * 1.3, [[0, '#6a2a16'], [0.6, '#3a140a'], [1, '#1a0704']]); g.fill();
    g.save(); circ(g, 0, 0, r * 0.96); g.clip(); crackLines(g, rnd, 6, r * 1.6, '#ff8a2a', 1.4); g.restore();
    circ(g, 0, 0, r); ol(g, 1.8);
    glow(g, -r * 0.35, r * 0.25, r * 0.5, '#ffd36b', 0.8); glow(g, r * 0.4, r * 0.3, r * 0.45, '#ffb347', 0.8); glow(g, 0, -r * 0.45, r * 0.4, '#ffd36b', 0.6);
    eye(g, -r * 0.32, -r * 0.18, r * 0.15, '#ffe27a'); eye(g, r * 0.32, -r * 0.18, r * 0.15, '#ffe27a');
  };
  P.magmaS = (g, r) => {
    const rnd = Q.mulberry(12);
    poly(g, [-r, 0, -r * 0.6, -r * 0.85, r * 0.3, -r * 0.95, r, -r * 0.2, r * 0.75, r * 0.8, -r * 0.4, r * 0.9]);
    g.fillStyle = rad(g, -r * 0.3, -r * 0.4, 0, r * 1.3, [[0, '#7a3418'], [1, '#22090a']]); g.fill(); ol(g, 1.4);
    g.save(); g.clip(); crackLines(g, rnd, 3, r * 1.4, '#ff8a2a', 1.1); g.restore();
    eye(g, -r * 0.3, -r * 0.15, r * 0.2, '#ffe27a'); eye(g, r * 0.3, -r * 0.15, r * 0.2, '#ffe27a');
  };
  P.cult = (g, r) => {
    // 法杖
    g.strokeStyle = '#4a2c1c'; g.lineWidth = 1.8; g.lineCap = 'round'; g.beginPath(); g.moveTo(r * 0.75, r * 0.95); g.lineTo(r * 0.92, -r * 0.6); g.stroke();
    // 长袍
    g.beginPath(); g.moveTo(-r * 0.38, -r * 0.55); g.lineTo(r * 0.38, -r * 0.55); g.quadraticCurveTo(r * 0.7, r * 0.2, r * 0.95, r * 1.0); g.quadraticCurveTo(0, r * 1.15, -r * 0.95, r * 1.0); g.quadraticCurveTo(-r * 0.7, r * 0.2, -r * 0.38, -r * 0.55); g.closePath();
    g.fillStyle = lin(g, 0, -r * 0.6, 0, r, [[0, '#6a5850'], [1, '#231a17']]); g.fill(); ol(g, 1.4);
    g.strokeStyle = '#ff8a3d'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(-r * 0.9, r * 0.92); g.quadraticCurveTo(0, r * 1.06, r * 0.9, r * 0.92); g.stroke();
    g.strokeStyle = 'rgba(255,138,61,.55)'; g.beginPath(); g.moveTo(0, -r * 0.4); g.lineTo(0, r * 1.0); g.stroke();
    // 兜帽
    circ(g, 0, -r * 0.72, r * 0.52); g.fillStyle = lin(g, 0, -r * 1.2, 0, -r * 0.3, [[0, '#7a665c'], [1, '#3a2c27']]); g.fill(); ol(g, 1.4);
    ell(g, r * 0.08, -r * 0.65, r * 0.32, r * 0.27); g.fillStyle = '#0c0606'; g.fill();
    eye(g, -r * 0.05, -r * 0.68, r * 0.08, '#ff9a3c'); eye(g, r * 0.2, -r * 0.68, r * 0.08, '#ff9a3c');
    // 火球
    glow(g, r * 0.95, -r * 0.82, r * 0.95, '#ff7a2a', 0.9);
    circ(g, r * 0.95, -r * 0.82, r * 0.24); g.fillStyle = '#fff1b0'; g.fill();
  };
  P.horn = (g, r) => {
    const rnd = Q.mulberry(14);
    g.fillStyle = '#1e0b07';
    for (const lx of [-r * 0.7, -r * 0.3, r * 0.15, r * 0.5]) { rr(g, lx - r * 0.13, r * 0.25, r * 0.28, r * 0.72, r * 0.1); g.fill(); ol(g, 1); }
    ell(g, -r * 0.12, 0, r * 1.02, r * 0.68); g.fillStyle = rad(g, -r * 0.4, -r * 0.4, 0, r * 1.4, [[0, '#7a3218'], [0.6, '#401409'], [1, '#1e0805']]); g.fill();
    g.save(); ell(g, -r * 0.12, 0, r * 1.0, r * 0.66); g.clip(); crackLines(g, rnd, 4, r * 1.6, '#ff7a2a', 1.2); g.restore();
    ell(g, -r * 0.12, 0, r * 1.02, r * 0.68); ol(g, 1.7);
    for (let i = 0; i < 3; i++) { const x = -r * 0.7 + i * r * 0.42; poly(g, [x - r * 0.15, -r * 0.55, x, -r * 0.95, x + r * 0.15, -r * 0.58]); g.fillStyle = '#2a0f08'; g.fill(); ol(g, 1); glow(g, x, -r * 0.92, r * 0.18, '#ff9a3c', 0.9); }
    ell(g, r * 0.78, r * 0.08, r * 0.46, r * 0.4); g.fillStyle = rad(g, r * 0.7, -r * 0.1, 0, r * 0.6, [[0, '#7a3218'], [1, '#2a0c06']]); g.fill(); ol(g, 1.5);
    g.beginPath(); g.moveTo(r * 0.98, -r * 0.08); g.quadraticCurveTo(r * 1.5, -r * 0.35, r * 1.42, -r * 0.98); g.quadraticCurveTo(r * 1.28, -r * 0.42, r * 1.12, r * 0.14); g.closePath();
    g.fillStyle = lin(g, r, 0, r * 1.4, -r, [[0, '#d9c2a0'], [1, '#fff2d8']]); g.fill(); ol(g, 1.3);
    glow(g, r * 1.42, -r * 0.95, r * 0.3, '#ff9a3c', 0.9);
    eye(g, r * 0.88, -r * 0.08, r * 0.11, '#ffe27a');
  };
  P.beetle = (g, r) => {
    g.strokeStyle = '#1a0805'; g.lineWidth = 1.5; g.lineCap = 'round';
    for (let i = 0; i < 3; i++) { const x = -r * 0.45 + i * r * 0.45; g.beginPath(); g.moveTo(x, r * 0.2); g.lineTo(x - r * 0.25, r * 0.95); g.stroke(); }
    circ(g, -r * 0.22, 0, r * 0.86); g.fillStyle = rad(g, -r * 0.3, -r * 0.1, 0, r * 0.9, [[0, '#fff6c0'], [0.3, '#ffcf5a'], [0.75, '#ff6a1a'], [1, '#8a1e08']]); g.fill(); ol(g, 1.6);
    glow(g, -r * 0.22, 0, r * 1.25, '#ff9a3c', 0.55);
    g.strokeStyle = 'rgba(60,12,4,.75)'; g.lineWidth = 1.4;
    for (let i = -1; i <= 1; i++) { g.beginPath(); g.arc(-r * 0.22 + i * r * 0.32, 0, r * 0.75, -0.9, 0.9); g.stroke(); }
    circ(g, r * 0.72, -r * 0.08, r * 0.4); g.fillStyle = '#2a0e08'; g.fill(); ol(g, 1.3);
    eye(g, r * 0.82, -r * 0.18, r * 0.11, '#ffe27a');
    g.strokeStyle = '#2a0e08'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(r * 0.9, -r * 0.4); g.quadraticCurveTo(r * 1.2, -r * 0.8, r * 1.4, -r * 0.7); g.stroke();
  };
  P.ogre = (g, r) => {
    const rnd = Q.mulberry(16);
    g.fillStyle = '#1a0d0a';
    rr(g, -r * 0.55, r * 0.35, r * 0.4, r * 0.62, r * 0.15); g.fill(); ol(g, 1.3); rr(g, r * 0.15, r * 0.35, r * 0.4, r * 0.62, r * 0.15); g.fill(); ol(g, 1.3);
    for (const s of [-1, 1]) { ell(g, s * r * 0.92, r * 0.05, r * 0.32, r * 0.6, s * 0.25); g.fillStyle = '#3a2219'; g.fill(); ol(g, 1.4); circ(g, s * r * 1.02, r * 0.58, r * 0.36); g.fillStyle = rad(g, s * r * 0.95, r * 0.45, 0, r * 0.4, [[0, '#5a3a2c'], [1, '#22120c']]); g.fill(); ol(g, 1.5); }
    ell(g, 0, -r * 0.08, r * 0.82, r * 0.8); g.fillStyle = rad(g, -r * 0.3, -r * 0.5, 0, r * 1.2, [[0, '#6a4434'], [0.6, '#38211a'], [1, '#170b08']]); g.fill();
    g.save(); ell(g, 0, -r * 0.08, r * 0.8, r * 0.78); g.clip(); crackLines(g, rnd, 5, r * 1.5, '#ff7a2a', 1.4); g.restore();
    ell(g, 0, -r * 0.08, r * 0.82, r * 0.8); ol(g, 1.9);
    circ(g, 0, -r * 0.82, r * 0.34); g.fillStyle = '#4a2e24'; g.fill(); ol(g, 1.5);
    for (const s of [-1, 1]) { poly(g, [s * r * 0.2, -r * 1.0, s * r * 0.48, -r * 1.35, s * r * 0.35, -r * 0.9]); g.fillStyle = '#d8c0a0'; g.fill(); ol(g, 1); }
    eye(g, -r * 0.13, -r * 0.84, r * 0.08, '#ffd36b'); eye(g, r * 0.13, -r * 0.84, r * 0.08, '#ffd36b');
  };
  function eliteBody(g, r, o) {
    // 腿
    g.fillStyle = o.dark;
    rr(g, -r * 0.42, r * 0.3, r * 0.32, r * 0.7, r * 0.1); g.fill(); ol(g, 1.3);
    rr(g, r * 0.08, r * 0.3, r * 0.32, r * 0.7, r * 0.1); g.fill(); ol(g, 1.3);
    // 披风
    g.beginPath(); g.moveTo(-r * 0.45, -r * 0.55); g.quadraticCurveTo(-r * 1.0, r * 0.2, -r * 0.95, r * 0.95); g.lineTo(-r * 0.2, r * 0.7); g.closePath();
    g.fillStyle = o.cape; g.fill(); ol(g, 1.3);
    // 武器（身后）
    o.weapon(g, r);
    // 躯干
    rr(g, -r * 0.55, -r * 0.62, r * 1.1, r * 1.05, r * 0.25); g.fillStyle = lin(g, 0, -r * 0.7, 0, r * 0.45, [[0, o.light], [1, o.mid]]); g.fill(); ol(g, 1.8);
    g.strokeStyle = o.seam; g.lineWidth = 1.3; g.beginPath(); g.moveTo(-r * 0.5, -r * 0.1); g.lineTo(r * 0.5, -r * 0.1); g.moveTo(0, -r * 0.6); g.lineTo(0, r * 0.4); g.stroke();
    glow(g, 0, -r * 0.25, r * 0.35, o.glowC, 0.8);
    // 肩甲
    for (const s of [-1, 1]) { ell(g, s * r * 0.55, -r * 0.55, r * 0.3, r * 0.22); g.fillStyle = o.light; g.fill(); ol(g, 1.4); }
    // 头盔
    circ(g, 0, -r * 0.95, r * 0.36); g.fillStyle = lin(g, 0, -r * 1.3, 0, -r * 0.6, [[0, o.light], [1, o.mid]]); g.fill(); ol(g, 1.5);
    g.fillStyle = o.glowC; g.fillRect(r * 0.0, -r * 1.0, r * 0.32, r * 0.08);
    glow(g, r * 0.15, -r * 0.96, r * 0.3, o.glowC, 0.9);
    o.crest(g, r);
    // 盾（前）
    g.save(); g.translate(r * 0.62, -r * 0.08);
    g.beginPath(); g.moveTo(-r * 0.3, -r * 0.62); g.lineTo(r * 0.3, -r * 0.62); g.lineTo(r * 0.32, r * 0.2); g.quadraticCurveTo(r * 0.3, r * 0.6, 0, r * 0.78); g.quadraticCurveTo(-r * 0.3, r * 0.6, -r * 0.32, r * 0.2); g.closePath();
    g.fillStyle = lin(g, -r * 0.3, 0, r * 0.3, 0, [[0, o.shield1], [1, o.shield2]]); g.fill(); ol(g, 1.8);
    g.strokeStyle = o.rim; g.lineWidth = 1.2; g.stroke();
    o.emblem(g, r);
    g.restore();
  }
  P.warden = (g, r) => eliteBody(g, r, {
    dark: '#151012', cape: '#5a1a10', light: '#4a3c42', mid: '#1c1418', seam: '#ff7a2a', glowC: '#ff9a3c', rim: '#c2602a', shield1: '#2c2226', shield2: '#120c0e',
    weapon: (g, r) => { g.strokeStyle = '#2a2024'; g.lineWidth = 3; g.beginPath(); g.moveTo(-r * 0.6, r * 0.3); g.lineTo(-r * 0.8, -r * 1.25); g.stroke(); poly(g, [-r * 0.95, -r * 1.2, -r * 0.8, -r * 1.65, -r * 0.62, -r * 1.2]); g.fillStyle = '#3a2c30'; g.fill(); ol(g, 1); glow(g, -r * 0.8, -r * 1.35, r * 0.3, '#ff7a2a', 0.7); },
    crest: (g, r) => { for (const s of [-1, 1]) { g.beginPath(); g.moveTo(s * r * 0.25, -r * 1.15); g.quadraticCurveTo(s * r * 0.55, -r * 1.35, s * r * 0.5, -r * 1.6); g.quadraticCurveTo(s * r * 0.4, -r * 1.3, s * r * 0.12, -r * 1.25); g.fillStyle = '#1a1214'; g.fill(); ol(g, 1); } },
    emblem: (g, r) => { glow(g, 0, -r * 0.05, r * 0.4, '#ff7a2a', 0.9); g.strokeStyle = '#ffb347'; g.lineWidth = 1.4; circ(g, 0, -r * 0.05, r * 0.15); g.stroke(); },
  });
  /* ----- 霜林 ----- */
  P.wolf = (g, r) => {
    const fur = lin(g, 0, -r * 0.7, 0, r * 0.6, [[0, '#f2fbff'], [1, '#7f9cba']]);
    g.beginPath(); g.moveTo(-r * 0.85, -r * 0.12); g.quadraticCurveTo(-r * 1.55, -r * 0.55, -r * 1.42, -r * 0.98); g.quadraticCurveTo(-r * 1.2, -r * 0.42, -r * 0.75, r * 0.12); g.closePath(); g.fillStyle = fur; g.fill(); ol(g, 1.3);
    g.fillStyle = '#5d7896';
    for (const lx of [-r * 0.68, -r * 0.32, r * 0.2, r * 0.55]) { rr(g, lx - r * 0.11, r * 0.15, r * 0.22, r * 0.8, r * 0.1); g.fill(); ol(g, 1); }
    ell(g, -r * 0.12, 0, r * 1.0, r * 0.55); g.fillStyle = fur; g.fill(); ol(g, 1.6);
    g.fillStyle = 'rgba(200,240,255,.9)';
    for (let i = 0; i < 4; i++) { const x = -r * 0.7 + i * r * 0.3; poly(g, [x - r * 0.1, -r * 0.45, x + r * 0.02, -r * 0.82, x + r * 0.12, -r * 0.45]); g.fill(); }
    ell(g, r * 0.78, -r * 0.38, r * 0.45, r * 0.4); g.fillStyle = fur; g.fill(); ol(g, 1.5);
    poly(g, [r * 1.0, -r * 0.55, r * 1.58, -r * 0.28, r * 1.02, -r * 0.1]); g.fillStyle = '#dfeffa'; g.fill(); ol(g, 1.3);
    g.fillStyle = '#1a2230'; circ(g, r * 1.53, -r * 0.3, r * 0.08); g.fill();
    for (const ex of [0.62, 0.92]) { poly(g, [r * (ex - 0.12), -r * 0.68, r * ex, -r * 1.15, r * (ex + 0.14), -r * 0.66]); g.fillStyle = '#e8f6ff'; g.fill(); ol(g, 1.1); }
    eye(g, r * 0.92, -r * 0.45, r * 0.11, '#7fe8ff');
  };
  P.crystal = (g, r) => {
    ell(g, 0, r * 0.5, r * 0.98, r * 0.45); g.fillStyle = lin(g, 0, 0, 0, r, [[0, '#3c6684'], [1, '#162a3a']]); g.fill(); ol(g, 1.5);
    const cs = [[-0.5, 1.15, 0.24, -0.25], [0.05, 1.6, 0.3, 0.05], [0.55, 1.2, 0.24, 0.25], [-0.22, 0.9, 0.18, -0.1], [0.32, 0.85, 0.18, 0.12]];
    for (const [cx, h, w, l] of cs) {
      const bx = cx * r, by = r * 0.45, H = h * r, W = w * r, L = l * r;
      poly(g, [bx - W, by, bx - W * 0.85 + L, by - H * 0.78, bx + L, by - H, bx + W * 0.85 + L, by - H * 0.78, bx + W, by]);
      g.fillStyle = lin(g, bx - W, by - H, bx + W, by, [[0, 'rgba(240,252,255,.95)'], [0.5, 'rgba(150,220,250,.9)'], [1, 'rgba(60,140,200,.9)']]); g.fill(); ol(g, 1.1, '#183248');
      g.strokeStyle = 'rgba(255,255,255,.8)'; g.lineWidth = 0.9; g.beginPath(); g.moveTo(bx + L * 0.9, by - H * 0.95); g.lineTo(bx + L * 0.2 - W * 0.2, by - H * 0.1); g.stroke();
    }
    glow(g, 0, -r * 0.1, r * 1.0, '#7fe8ff', 0.45);
    eye(g, -r * 0.3, r * 0.45, r * 0.12, '#e6fbff'); eye(g, r * 0.3, r * 0.45, r * 0.12, '#e6fbff');
  };
  P.crystalS = (g, r) => {
    poly(g, [-r * 0.7, r * 0.6, -r * 0.45, -r * 0.5, 0, -r * 1.1, r * 0.45, -r * 0.5, r * 0.7, r * 0.6]);
    g.fillStyle = lin(g, -r, -r, r, r, [[0, '#f0fcff'], [1, '#4a9ac8']]); g.fill(); ol(g, 1.2, '#183248');
    glow(g, 0, 0, r * 0.9, '#7fe8ff', 0.5);
    eye(g, -r * 0.22, 0, r * 0.13, '#1a4a6a'); eye(g, r * 0.22, 0, r * 0.13, '#1a4a6a');
  };
  P.wisp = (g, r) => {
    g.beginPath(); g.moveTo(-r * 0.8, -r * 0.3); g.arc(0, -r * 0.3, r * 0.8, Math.PI, 0);
    g.quadraticCurveTo(r * 0.85, r * 0.5, r * 0.45, r * 0.95); g.quadraticCurveTo(r * 0.3, r * 0.55, r * 0.05, r * 1.1); g.quadraticCurveTo(-r * 0.15, r * 0.55, -r * 0.45, r * 0.9); g.quadraticCurveTo(-r * 0.85, r * 0.5, -r * 0.8, -r * 0.3); g.closePath();
    g.fillStyle = rad(g, 0, -r * 0.3, r * 0.1, r * 1.3, [[0, 'rgba(255,255,255,.98)'], [0.5, 'rgba(170,225,255,.85)'], [1, 'rgba(80,150,220,.55)']]); g.fill(); ol(g, 1.2, 'rgba(20,50,80,.85)');
    glow(g, 0, -r * 0.2, r * 1.3, '#9fe8ff', 0.5);
    for (let i = -2; i <= 2; i++) { const x = i * r * 0.28; poly(g, [x - r * 0.12, -r * 0.95, x, -r * (1.35 + (i === 0 ? 0.25 : 0) - Math.abs(i) * 0.08), x + r * 0.12, -r * 0.95]); g.fillStyle = '#e6fbff'; g.fill(); ol(g, 0.9, '#2a6a9a'); }
    ell(g, -r * 0.28, -r * 0.32, r * 0.13, r * 0.18); g.fillStyle = '#0b2a44'; g.fill(); ell(g, r * 0.28, -r * 0.32, r * 0.13, r * 0.18); g.fill();
    glow(g, -r * 0.28, -r * 0.32, r * 0.3, '#7fe8ff', 0.8); glow(g, r * 0.28, -r * 0.32, r * 0.3, '#7fe8ff', 0.8);
  };
  P.stag = (g, r) => {
    g.strokeStyle = '#5a7896'; g.lineWidth = r * 0.16; g.lineCap = 'round';
    for (const lx of [-r * 0.65, -r * 0.35, r * 0.25, r * 0.5]) { g.beginPath(); g.moveTo(lx, r * 0.1); g.lineTo(lx + r * 0.05, r * 0.98); g.stroke(); }
    ell(g, -r * 0.1, 0, r * 0.95, r * 0.52); g.fillStyle = lin(g, 0, -r * 0.5, 0, r * 0.5, [[0, '#f0faff'], [1, '#7f9cba']]); g.fill(); ol(g, 1.6);
    g.beginPath(); g.moveTo(r * 0.5, -r * 0.3); g.quadraticCurveTo(r * 0.8, -r * 0.6, r * 0.88, -r * 0.75); g.lineTo(r * 1.1, -r * 0.6); g.quadraticCurveTo(r * 0.9, -r * 0.2, r * 0.75, 0); g.closePath();
    g.fillStyle = '#d5e8f5'; g.fill(); ol(g, 1.3);
    ell(g, r * 1.05, -r * 0.72, r * 0.34, r * 0.22, 0.25); g.fillStyle = '#e8f6ff'; g.fill(); ol(g, 1.3);
    g.save(); g.globalCompositeOperation = 'lighter';
    g.strokeStyle = 'rgba(127,232,255,.45)'; g.lineWidth = 3;
    const ant = () => { g.beginPath(); g.moveTo(r * 0.95, -r * 0.88); g.quadraticCurveTo(r * 0.75, -r * 1.4, r * 0.4, -r * 1.75); g.moveTo(r * 0.83, -r * 1.2); g.lineTo(r * 1.15, -r * 1.55); g.moveTo(r * 0.62, -r * 1.48); g.lineTo(r * 0.75, -r * 1.9); g.moveTo(r * 1.12, -r * 0.88); g.quadraticCurveTo(r * 1.25, -r * 1.25, r * 1.5, -r * 1.45); g.stroke(); };
    ant(); g.strokeStyle = '#e6fbff'; g.lineWidth = 1.4; ant(); g.restore();
    eye(g, r * 1.12, -r * 0.76, r * 0.08, '#7fe8ff');
  };
  P.bloat = (g, r) => {
    g.fillStyle = '#dff8ff';
    for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; const c = Math.cos(a), s = Math.sin(a); poly(g, [c * r * 0.75 - s * r * 0.14, s * r * 0.75 + c * r * 0.14, c * r * 1.18, s * r * 1.18, c * r * 0.75 + s * r * 0.14, s * r * 0.75 - c * r * 0.14]); g.fill(); ol(g, 0.8, '#2a5a7a'); }
    circ(g, 0, 0, r * 0.85); g.fillStyle = rad(g, -r * 0.3, -r * 0.3, 0, r, [[0, '#ffffff'], [0.5, '#a8e2fa'], [1, '#3a86b8']]); g.fill(); ol(g, 1.5, '#183248');
    glow(g, 0, r * 0.1, r * 0.8, '#7fe8ff', 0.7);
    for (const s of [-1, 1]) { poly(g, [s * r * 0.48, -r * 0.28, s * r * 0.14, -r * 0.18, s * r * 0.38, -r * 0.05]); g.fillStyle = '#0b2a44'; g.fill(); }
    g.strokeStyle = '#0b2a44'; g.lineWidth = 1.3; g.beginPath(); g.arc(0, r * 0.35, r * 0.22, Math.PI * 1.1, Math.PI * 1.9); g.stroke();
  };
  P.yeti = (g, r) => {
    const fur = rad(g, -r * 0.3, -r * 0.5, 0, r * 1.3, [[0, '#ffffff'], [0.6, '#cfe2ee'], [1, '#7f9ab0']]);
    g.fillStyle = '#7f9ab0'; rr(g, -r * 0.55, r * 0.35, r * 0.4, r * 0.62, r * 0.18); g.fill(); ol(g, 1.3); rr(g, r * 0.15, r * 0.35, r * 0.4, r * 0.62, r * 0.18); g.fill(); ol(g, 1.3);
    for (const s of [-1, 1]) { ell(g, s * r * 0.92, r * 0.05, r * 0.34, r * 0.62, s * 0.25); g.fillStyle = fur; g.fill(); ol(g, 1.4); circ(g, s * r * 1.02, r * 0.6, r * 0.3); g.fillStyle = '#4a6a86'; g.fill(); ol(g, 1.3); }
    ell(g, 0, -r * 0.08, r * 0.84, r * 0.82); g.fillStyle = fur; g.fill(); ol(g, 1.9);
    g.strokeStyle = 'rgba(120,150,175,.6)'; g.lineWidth = 1;
    const rnd = Q.mulberry(21);
    for (let i = 0; i < 14; i++) { const x = (rnd() - 0.5) * r * 1.3, y = (rnd() - 0.4) * r * 1.2; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + r * 0.05, y + r * 0.12, x - r * 0.02, y + r * 0.22); g.stroke(); }
    ell(g, 0, -r * 0.58, r * 0.4, r * 0.32); g.fillStyle = '#2a4660'; g.fill(); ol(g, 1.3);
    for (const s of [-1, 1]) { g.beginPath(); g.moveTo(s * r * 0.35, -r * 0.85); g.quadraticCurveTo(s * r * 0.8, -r * 1.1, s * r * 0.6, -r * 1.4); g.quadraticCurveTo(s * r * 0.55, -r * 1.1, s * r * 0.25, -r * 0.95); g.fillStyle = '#c8d8e6'; g.fill(); ol(g, 1); }
    eye(g, -r * 0.15, -r * 0.62, r * 0.08, '#7fe8ff'); eye(g, r * 0.15, -r * 0.62, r * 0.08, '#7fe8ff');
    g.fillStyle = '#e6fbff'; poly(g, [-r * 0.15, -r * 0.42, -r * 0.08, -r * 0.3, -r * 0.02, -r * 0.42]); g.fill(); poly(g, [r * 0.15, -r * 0.42, r * 0.08, -r * 0.3, r * 0.02, -r * 0.42]); g.fill();
  };
  P.sentry = (g, r) => eliteBody(g, r, {
    dark: '#3a4a5a', cape: '#2a5a7a', light: '#cfe0ee', mid: '#5a7088', seam: '#7fe8ff', glowC: '#7fe8ff', rim: '#e6fbff', shield1: '#6a88a6', shield2: '#2a4058',
    weapon: (g, r) => { g.strokeStyle = '#8aa0b4'; g.lineWidth = 2.2; g.beginPath(); g.moveTo(-r * 0.62, r * 0.6); g.lineTo(-r * 0.62, -r * 1.75); g.stroke(); poly(g, [-r * 0.75, -r * 1.65, -r * 0.62, -r * 2.15, -r * 0.49, -r * 1.65]); g.fillStyle = '#e6fbff'; g.fill(); ol(g, 1); glow(g, -r * 0.62, -r * 1.85, r * 0.35, '#7fe8ff', 0.8); },
    crest: (g, r) => { g.beginPath(); g.moveTo(-r * 0.05, -r * 1.25); g.quadraticCurveTo(-r * 0.5, -r * 1.6, -r * 0.8, -r * 1.25); g.quadraticCurveTo(-r * 0.45, -r * 1.35, -r * 0.1, -r * 1.12); g.fillStyle = '#ffffff'; g.fill(); ol(g, 1); },
    emblem: (g, r) => { glow(g, 0, -r * 0.05, r * 0.4, '#7fe8ff', 0.9); g.strokeStyle = '#e6fbff'; g.lineWidth = 1.2; g.beginPath(); for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI; g.moveTo(Math.cos(a) * r * 0.2, -r * 0.05 + Math.sin(a) * r * 0.2); g.lineTo(-Math.cos(a) * r * 0.2, -r * 0.05 - Math.sin(a) * r * 0.2); } g.stroke(); },
  });
  /* ----- 星陨深渊 ----- */
  P.shade = (g, r) => {
    g.strokeStyle = '#2c1048'; g.lineWidth = r * 0.26; g.lineCap = 'round';
    for (let i = -1; i <= 1; i++) { g.beginPath(); g.moveTo(i * r * 0.45, r * 0.3); g.quadraticCurveTo(i * r * 0.7 + r * 0.25, r * 0.75, i * r * 0.5, r * 1.05); g.stroke(); }
    ell(g, 0, -r * 0.1, r * 0.98, r * 0.92); g.fillStyle = rad(g, -r * 0.3, -r * 0.4, 0, r * 1.3, [[0, '#7a48b0'], [0.55, '#34165a'], [1, '#120624']]); g.fill(); ol(g, 1.6);
    specks(g, Q.mulberry(31), 6, r * 0.8, '#ffffff', 0.5);
    ell(g, 0, -r * 0.15, r * 0.5, r * 0.42); g.fillStyle = '#1a0420'; g.fill();
    glow(g, 0, -r * 0.15, r * 0.95, '#ff6bd5', 0.55);
    circ(g, 0, -r * 0.15, r * 0.34); g.fillStyle = rad(g, 0, -r * 0.15, 0, r * 0.36, [[0, '#ffffff'], [0.3, '#ff9ae8'], [1, '#a01890']]); g.fill();
    ell(g, 0, -r * 0.15, r * 0.08, r * 0.25); g.fillStyle = '#16000f'; g.fill();
  };
  P.egg = (g, r) => {
    ell(g, 0, 0, r * 0.86, r * 1.0); g.fillStyle = rad(g, -r * 0.25, -r * 0.35, 0, r * 1.1, [[0, 'rgba(170,110,220,.95)'], [0.6, 'rgba(80,30,120,.95)'], [1, 'rgba(30,10,50,.98)']]); g.fill(); ol(g, 1.6);
    const em = [[-0.3, -0.25], [0.3, -0.15], [-0.15, 0.35], [0.3, 0.45]];
    for (const [x, y] of em) { circ(g, x * r, y * r, r * 0.22); g.fillStyle = 'rgba(20,4,34,.9)'; g.fill(); glow(g, x * r + r * 0.05, y * r - r * 0.04, r * 0.15, '#ff6bd5', 0.9); }
    g.strokeStyle = 'rgba(200,107,255,.55)'; g.lineWidth = 1;
    for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(0, -r * 0.95); g.quadraticCurveTo((i - 1.5) * r * 0.5, 0, (i - 1.5) * r * 0.4, r * 0.95); g.stroke(); }
    g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 1.5; g.beginPath(); g.arc(-r * 0.15, -r * 0.2, r * 0.6, Math.PI * 1.1, Math.PI * 1.45); g.stroke();
  };
  P.eggS = (g, r) => {
    g.strokeStyle = '#3a1460'; g.lineWidth = 1.6; g.lineCap = 'round';
    g.beginPath(); g.moveTo(-r * 0.4, r * 0.4); g.quadraticCurveTo(-r * 0.6, r * 0.9, -r * 0.2, r * 1.0); g.moveTo(r * 0.4, r * 0.4); g.quadraticCurveTo(r * 0.6, r * 0.9, r * 0.2, r * 1.0); g.stroke();
    ell(g, 0, 0, r * 0.85, r * 0.75); g.fillStyle = rad(g, -r * 0.3, -r * 0.3, 0, r, [[0, '#8a52c0'], [1, '#2a0f44']]); g.fill(); ol(g, 1.3);
    eye(g, 0, -r * 0.05, r * 0.26, '#ff8ae6');
  };
  P.eye = (g, r) => {
    g.strokeStyle = '#3a1460'; g.lineWidth = r * 0.18; g.lineCap = 'round';
    for (let i = 0; i < 5; i++) { const x = (i - 2) * r * 0.32; g.beginPath(); g.moveTo(x, r * 0.5); g.quadraticCurveTo(x + (i % 2 ? 1 : -1) * r * 0.3, r * 0.8, x, r * 1.12); g.stroke(); }
    g.save(); g.globalCompositeOperation = 'lighter'; g.strokeStyle = 'rgba(200,107,255,.6)'; g.lineWidth = 1.4; ell(g, 0, -r * 0.05, r * 1.18, r * 0.36, -0.2); g.stroke(); g.restore();
    circ(g, 0, -r * 0.05, r * 0.86); g.fillStyle = rad(g, -r * 0.3, -r * 0.35, 0, r, [[0, '#4a2470'], [1, '#12061f']]); g.fill(); ol(g, 1.6);
    glow(g, 0, -r * 0.05, r * 0.9, '#ff6bd5', 0.5);
    circ(g, 0, -r * 0.05, r * 0.46); g.fillStyle = rad(g, 0, -r * 0.05, 0, r * 0.46, [[0, '#fff3c0'], [0.35, '#ffb86b'], [0.7, '#ff6bd5'], [1, '#6a1080']]); g.fill();
    g.fillStyle = '#12000c'; poly(g, [0, -r * 0.4, r * 0.08, -r * 0.13, r * 0.34, -r * 0.05, r * 0.08, r * 0.03, 0, r * 0.3, -r * 0.08, r * 0.03, -r * 0.34, -r * 0.05, -r * 0.08, -r * 0.13]); g.fill();
    g.fillStyle = 'rgba(255,255,255,.9)'; circ(g, -r * 0.2, -r * 0.25, r * 0.09); g.fill();
  };
  P.husk = (g, r) => {
    g.strokeStyle = '#1a0a2a'; g.lineWidth = 1.4; g.lineCap = 'round';
    for (let i = 0; i < 3; i++) { const x = -r * 0.5 + i * r * 0.42; g.beginPath(); g.moveTo(x, 0); g.lineTo(x - r * 0.3, r * 0.95); g.moveTo(x, 0); g.lineTo(x + r * 0.15, r * 0.95); g.stroke(); }
    ell(g, -r * 0.1, 0, r * 1.05, r * 0.72); g.fillStyle = rad(g, -r * 0.4, -r * 0.4, 0, r * 1.3, [[0, '#5a3488'], [0.6, '#24103e'], [1, '#0c0418']]); g.fill(); ol(g, 1.7);
    g.strokeStyle = 'rgba(200,155,255,.55)'; g.lineWidth = 1.1; g.beginPath(); g.moveTo(-r * 1.0, 0); g.lineTo(r * 0.85, 0); g.stroke();
    specks(g, Q.mulberry(41), 9, r * 0.85, '#ffffff', 0.55);
    glow(g, -r * 0.3, -r * 0.25, r * 0.35, '#d9b8ff', 0.7);
    ell(g, r * 0.88, 0, r * 0.34, r * 0.32); g.fillStyle = '#1a0a2c'; g.fill(); ol(g, 1.3);
    g.strokeStyle = '#d9b8ff'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(r * 1.1, -r * 0.15); g.quadraticCurveTo(r * 1.45, -r * 0.3, r * 1.4, r * 0.05); g.moveTo(r * 1.1, r * 0.15); g.quadraticCurveTo(r * 1.45, r * 0.3, r * 1.4, -r * 0.02); g.stroke();
    eye(g, r * 0.95, -r * 0.1, r * 0.09, '#ff8ae6');
  };
  P.nova = (g, r) => {
    g.save(); g.globalCompositeOperation = 'lighter';
    const pts = [];
    for (let i = 0; i < 16; i++) { const a = (i / 16) * TAU, d = i % 2 ? r * 0.6 : r * 1.25; pts.push(Math.cos(a) * d, Math.sin(a) * d); }
    poly(g, pts); g.fillStyle = rad(g, 0, 0, 0, r * 1.25, [[0, 'rgba(255,255,255,.95)'], [0.5, 'rgba(220,170,255,.7)'], [1, 'rgba(160,80,255,0)']]); g.fill();
    g.restore();
    circ(g, 0, 0, r * 0.62); g.fillStyle = rad(g, 0, 0, 0, r * 0.62, [[0, '#12021e'], [0.7, '#3a0f5a'], [1, '#c86bff']]); g.fill(); ol(g, 1.3);
    eye(g, -r * 0.2, -r * 0.05, r * 0.1, '#ffffff'); eye(g, r * 0.2, -r * 0.05, r * 0.1, '#ffffff');
  };
  P.colos = (g, r) => {
    g.fillStyle = '#140a22';
    rr(g, -r * 0.55, r * 0.35, r * 0.4, r * 0.62, r * 0.1); g.fill(); ol(g, 1.3); rr(g, r * 0.15, r * 0.35, r * 0.4, r * 0.62, r * 0.1); g.fill(); ol(g, 1.3);
    for (const s of [-1, 1]) { rr(g, s * r * 0.92 - r * 0.25, -r * 0.45, r * 0.5, r * 0.95, r * 0.2); g.fillStyle = '#2a1844'; g.fill(); ol(g, 1.4); poly(g, [s * r * 0.7, -r * 0.5, s * r * 1.15, -r * 0.62, s * r * 1.2, -r * 0.3, s * r * 0.75, -r * 0.25]); g.fillStyle = '#4a2c70'; g.fill(); ol(g, 1.2); }
    poly(g, [-r * 0.75, -r * 0.55, r * 0.75, -r * 0.55, r * 0.6, r * 0.45, -r * 0.6, r * 0.45]);
    g.fillStyle = lin(g, 0, -r * 0.6, 0, r * 0.5, [[0, '#4a2c70'], [1, '#160a28']]); g.fill(); ol(g, 1.9);
    g.strokeStyle = 'rgba(200,107,255,.6)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(-r * 0.6, -r * 0.1); g.lineTo(r * 0.6, -r * 0.1); g.stroke();
    glow(g, 0, r * 0.08, r * 0.55, '#c86bff', 0.85);
    g.strokeStyle = '#ffd9ff'; g.lineWidth = 1.4; circ(g, 0, r * 0.08, r * 0.18); g.stroke();
    rr(g, -r * 0.3, -r * 1.05, r * 0.6, r * 0.5, r * 0.12); g.fillStyle = '#2a1844'; g.fill(); ol(g, 1.5);
    g.fillStyle = '#ff8ae6'; g.fillRect(-r * 0.22, -r * 0.85, r * 0.44, r * 0.08);
    glow(g, 0, -r * 0.82, r * 0.45, '#ff6bd5', 0.9);
  };
  P.herald = (g, r) => {
    g.save(); g.globalCompositeOperation = 'lighter'; g.strokeStyle = 'rgba(255,215,140,.75)'; g.lineWidth = 1.6; circ(g, 0, -r * 1.0, r * 0.55); g.stroke(); g.restore();
    eliteBody(g, r, {
      dark: '#140a22', cape: '#4a1a6a', light: '#5a3a88', mid: '#1c0e34', seam: '#ff8ae6', glowC: '#ff6bd5', rim: '#ffd78a', shield1: '#3a2260', shield2: '#120826',
      weapon: (g, r) => { g.strokeStyle = '#2a1844'; g.lineWidth = 2.4; g.beginPath(); g.moveTo(-r * 0.62, r * 0.5); g.lineTo(-r * 0.62, -r * 1.55); g.stroke(); glow(g, -r * 0.62, -r * 1.65, r * 0.5, '#c86bff', 0.9); circ(g, -r * 0.62, -r * 1.65, r * 0.14); g.fillStyle = '#fff'; g.fill(); },
      crest: (g, r) => { for (let i = -1; i <= 1; i++) { poly(g, [i * r * 0.18 - r * 0.07, -r * 1.22, i * r * 0.22, -r * (1.55 - Math.abs(i) * 0.12), i * r * 0.18 + r * 0.07, -r * 1.22]); g.fillStyle = '#ffd78a'; g.fill(); ol(g, 0.8); } },
      emblem: (g, r) => { glow(g, 0, -r * 0.05, r * 0.42, '#ff6bd5', 0.9); ell(g, 0, -r * 0.05, r * 0.18, r * 0.1); g.fillStyle = '#ffd9ff'; g.fill(); circ(g, 0, -r * 0.05, r * 0.06); g.fillStyle = '#2a0420'; g.fill(); },
    });
    specks(g, Q.mulberry(51), 6, r * 0.5, '#ffffff', 0.5);
  };

  A.enemy = {};
  function buildEnemy(id) {
    const d = Q.ENEMIES[id]; const r = d.r;
    const half = Math.ceil(r * 2.25 + 6);
    const S = half * 2, px = S * RES;
    const body = cv(px, px), g = body.getContext('2d');
    g.setTransform(RES, 0, 0, RES, px / 2, px / 2);
    P[id](g, r);
    const mk = (variant) => {
      const c = cv(px, px), gg = c.getContext('2d');
      gg.setTransform(RES, 0, 0, RES, px / 2, px / 2);
      gg.fillStyle = 'rgba(0,0,0,.4)'; ell(gg, 0, r * 0.95, r * 0.95, r * 0.3); gg.fill();
      gg.setTransform(1, 0, 0, 1, 0, 0);
      if (variant) {
        const t = cv(px, px), tg = t.getContext('2d');
        tg.drawImage(body, 0, 0); tg.globalCompositeOperation = 'source-atop';
        tg.fillStyle = variant === 'flash' ? 'rgba(255,255,255,.95)' : 'rgba(160,230,255,.6)';
        tg.fillRect(0, 0, px, px);
        if (variant === 'frost') gg.drawImage(body, 0, 0);
        gg.drawImage(t, 0, 0);
      } else gg.drawImage(body, 0, 0);
      return c;
    };
    return { img: mk(), flash: mk('flash'), frost: mk('frost'), half, S, r };
  }

  /* ---------- 宝石、拾取物、弹体 ---------- */
  A.gems = []; A.items = {}; A.bul = {}; A.pj = {};
  const GEMC = [['#bff6ff', '#4ad2ff', '#1a6a9a'], ['#d8ffe8', '#5dffa0', '#1a7a4a'], ['#f0dcff', '#b878ff', '#5a2a9a'], ['#fff6d0', '#ffcf4a', '#a8661a']];
  const GEMS = [5, 6.5, 8, 10.5];
  function sprite(sizeW, fn) {
    const px = Math.ceil(sizeW * 2 * RES); const c = cv(px, px), g = c.getContext('2d');
    g.setTransform(RES, 0, 0, RES, px / 2, px / 2); fn(g); return { img: c, half: sizeW };
  }
  function buildItems() {
    GEMC.forEach((c, i) => {
      const s = GEMS[i];
      A.gems[i] = sprite(s * 2.6, (g) => {
        glow(g, 0, 0, s * 2.4, c[1], 0.55);
        poly(g, [0, -s * 1.25, s * 0.85, 0, 0, s * 1.25, -s * 0.85, 0]);
        g.fillStyle = lin(g, -s, -s, s, s, [[0, c[0]], [0.5, c[1]], [1, c[2]]]); g.fill(); ol(g, 0.9, 'rgba(0,0,0,.6)');
        poly(g, [0, -s * 1.25, s * 0.85, 0, 0, -s * 0.2]); g.fillStyle = 'rgba(255,255,255,.45)'; g.fill();
        g.fillStyle = 'rgba(255,255,255,.95)'; circ(g, -s * 0.25, -s * 0.45, s * 0.18); g.fill();
      });
    });
    A.items.heal = sprite(18, (g) => {
      glow(g, 0, 0, 17, '#ff8aa8', 0.6);
      circ(g, 0, 1, 8.5); g.fillStyle = rad(g, -3, -2, 0, 10, [[0, '#fff0e0'], [0.4, '#ffb0a0'], [1, '#e2486a']]); g.fill(); ol(g, 1.1);
      g.strokeStyle = 'rgba(160,30,60,.6)'; g.lineWidth = 1; g.beginPath(); g.moveTo(0, -6); g.quadraticCurveTo(-2, 1, 0, 8); g.stroke();
      ell(g, 4, -8, 4, 2, -0.5); g.fillStyle = '#5ad27a'; g.fill(); ol(g, 0.8);
    });
    A.items.magnet = sprite(18, (g) => {
      glow(g, 0, 0, 17, '#7fe8ff', 0.6);
      rr(g, -6, -10, 12, 20, 1.5); g.fillStyle = lin(g, 0, -10, 0, 10, [[0, '#fff3c8'], [1, '#e8c070']]); g.fill(); ol(g, 1);
      g.strokeStyle = '#d22a2a'; g.lineWidth = 1.4; g.beginPath(); g.arc(0, -2, 3.5, 0.3, TAU - 0.3); g.moveTo(-3, 3); g.lineTo(3, 3); g.moveTo(0, 3); g.lineTo(0, 8); g.stroke();
      glow(g, 0, -2, 7, '#7fe8ff', 0.5);
    });
    A.items.bomb = sprite(18, (g) => {
      glow(g, 0, 0, 17, '#c58bff', 0.65);
      rr(g, -6, -10, 12, 20, 1.5); g.fillStyle = lin(g, 0, -10, 0, 10, [[0, '#e8dcff'], [1, '#9a7ad8']]); g.fill(); ol(g, 1);
      g.fillStyle = '#ffe66b'; poly(g, [1.5, -8, -3.5, 1, 0, 1, -1.5, 8, 3.5, -1, 0, -1]); g.fill(); ol(g, 0.7, '#5a2a00');
    });
    A.items.dust = sprite(12, (g) => {
      glow(g, 0, 0, 11, '#ffe9b0', 0.8);
      g.fillStyle = '#ffffff'; poly(g, [0, -6.5, 1.4, -1.4, 6.5, 0, 1.4, 1.4, 0, 6.5, -1.4, 1.4, -6.5, 0, -1.4, -1.4]); g.fill();
    });
    A.items.chest = sprite(26, (g) => {
      glow(g, 0, -2, 24, '#ffd76b', 0.5);
      g.fillStyle = 'rgba(0,0,0,.4)'; ell(g, 0, 11, 15, 4); g.fill();
      rr(g, -13, -3, 26, 14, 2); g.fillStyle = lin(g, 0, -3, 0, 11, [[0, '#6a3a1e'], [1, '#2a1408']]); g.fill(); ol(g, 1.3);
      g.beginPath(); g.moveTo(-13, -3); g.quadraticCurveTo(-13, -13, 0, -13); g.quadraticCurveTo(13, -13, 13, -3); g.closePath();
      g.fillStyle = lin(g, 0, -13, 0, -3, [[0, '#8a5028'], [1, '#4a260e']]); g.fill(); ol(g, 1.3);
      g.strokeStyle = '#ffcf6b'; g.lineWidth = 1.6;
      g.beginPath(); g.moveTo(-13, -3); g.lineTo(13, -3); g.moveTo(-8, -12); g.lineTo(-8, 11); g.moveTo(8, -12); g.lineTo(8, 11); g.stroke();
      glow(g, 0, -3, 9, '#fff1b0', 0.9);
      g.fillStyle = '#fff6d0'; poly(g, [0, -7, 1.6, -3, 0, 1, -1.6, -3]); g.fill();
    });
    const bul = (k, c1, c2, s) => {
      A.bul[k] = sprite(s * 2.8, (g) => {
        glow(g, 0, 0, s * 2.6, c1, 0.6);
        circ(g, 0, 0, s * 1.08); g.fillStyle = 'rgba(16,4,8,.9)'; g.fill();
        circ(g, 0, 0, s * 0.9); g.fillStyle = rad(g, 0, 0, 0, s * 0.9, [[0, '#ffffff'], [0.45, c2], [1, c1]]); g.fill();
      });
    };
    bul('fire', '#ff6a2a', '#ffd36b', 8); bul('ice', '#3ab0ff', '#c8f6ff', 8); bul('void', '#d23aff', '#ffb0f4', 8); bul('star', '#ffb347', '#fff6d0', 11);
    // 玩家弹体（默认朝右）
    A.pj.bolt = sprite(16, (g) => {
      glow(g, 0, 0, 15, '#a58bff', 0.9);
      g.fillStyle = '#ffffff'; poly(g, [0, -6, 1.3, -1.3, 6, 0, 1.3, 1.3, 0, 6, -1.3, 1.3, -6, 0, -1.3, -1.3]); g.fill();
      glow(g, 0, 0, 6, '#ffffff', 0.9);
    });
    A.pj.mini = sprite(10, (g) => { glow(g, 0, 0, 9, '#6be4ff', 0.9); g.fillStyle = '#ffffff'; poly(g, [0, -3.5, 0.8, -0.8, 3.5, 0, 0.8, 0.8, 0, 3.5, -0.8, 0.8, -3.5, 0, -0.8, -0.8]); g.fill(); });
    A.pj.arrow = sprite(16, (g) => {
      glow(g, 2, 0, 10, '#6bffb5', 0.45);
      g.strokeStyle = '#e8dcc0'; g.lineWidth = 1.4; g.beginPath(); g.moveTo(-12, 0); g.lineTo(9, 0); g.stroke();
      poly(g, [14, 0, 7, -3, 8.5, 0, 7, 3]); g.fillStyle = '#f2fff8'; g.fill(); ol(g, 0.6, '#1a4a34');
      g.fillStyle = '#6bffb5'; poly(g, [-12, 0, -15, -3.5, -9, 0]); g.fill(); poly(g, [-12, 0, -15, 3.5, -9, 0]); g.fill();
    });
    A.pj.beam = sprite(26, (g) => {
      glow(g, 6, 0, 14, '#ffe08a', 0.7);
      g.save(); g.globalCompositeOperation = 'lighter';
      g.fillStyle = lin(g, -24, 0, 22, 0, [[0, 'rgba(255,224,138,0)'], [0.6, 'rgba(255,240,190,.9)'], [1, 'rgba(255,255,255,1)']]);
      ell(g, 0, 0, 22, 3.2); g.fill(); g.fillStyle = '#ffffff'; ell(g, 8, 0, 12, 1.4); g.fill(); g.restore();
    });
    A.pj.sword = sprite(22, (g) => {
      glow(g, 2, 0, 14, '#8affc8', 0.6);
      poly(g, [19, 0, 4, -2.6, -8, -2, -8, 2, 4, 2.6]); g.fillStyle = lin(g, 0, -3, 0, 3, [[0, '#ffffff'], [0.5, '#c8ffe4'], [1, '#5ad8a0']]); g.fill(); ol(g, 0.7, '#0a3a24');
      g.fillStyle = '#ffe08a'; g.fillRect(-9.5, -5, 2.2, 10); g.fillStyle = '#2a5a44'; g.fillRect(-15, -1.2, 5.6, 2.4);
      glow(g, -16, 0, 3, '#8affc8', 0.9);
    });
    A.pj.blade = sprite(18, (g) => {
      glow(g, 0, 0, 16, '#ffd76b', 0.5);
      g.beginPath(); g.arc(-4, 0, 12, -0.95, 0.95); g.arc(-10, 0, 9, 0.75, -0.75, true); g.closePath();
      g.fillStyle = lin(g, -4, -10, 8, 10, [[0, '#ffffff'], [0.5, '#ffe9a0'], [1, '#e0a030']]); g.fill(); ol(g, 0.8, '#4a2a00');
    });
    A.pj.disc = sprite(20, (g) => {
      glow(g, 0, 0, 19, '#bcd4ff', 0.65);
      circ(g, 0, 0, 10); g.fillStyle = rad(g, -3, -3, 0, 11, [[0, '#ffffff'], [0.6, '#d9e6ff'], [1, '#7a92c8']]); g.fill(); ol(g, 1, '#1a2448');
      circ(g, 2.5, -1, 7); g.fillStyle = 'rgba(120,140,200,.45)'; g.fill();
      g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = 1; circ(g, 0, 0, 8.5); g.stroke();
    });
    A.pj.moon = sprite(46, (g) => {
      glow(g, 0, 0, 45, '#bcd4ff', 0.7);
      circ(g, 0, 0, 22); g.fillStyle = rad(g, -6, -6, 0, 24, [[0, '#ffffff'], [0.6, '#e6eeff'], [1, '#8aa0d8']]); g.fill(); ol(g, 1.4, '#1a2448');
      g.fillStyle = 'rgba(130,150,210,.35)'; circ(g, 6, -4, 6); g.fill(); circ(g, -6, 8, 4); g.fill(); circ(g, -9, -6, 3); g.fill();
    });
    A.pj.wave = sprite(36, (g) => {
      g.save(); g.globalCompositeOperation = 'lighter';
      g.beginPath(); g.arc(-18, 0, 30, -1.05, 1.05); g.arc(-26, 0, 26, 0.95, -0.95, true); g.closePath();
      g.fillStyle = lin(g, -10, 0, 12, 0, [[0, 'rgba(255,207,107,0)'], [0.6, 'rgba(255,224,150,.85)'], [1, 'rgba(255,255,255,1)']]); g.fill(); g.restore();
    });
    A.pj.flame = sprite(20, (g) => {
      g.save(); g.globalCompositeOperation = 'lighter';
      g.fillStyle = rad(g, 0, 0, 0, 20, [[0, 'rgba(255,240,180,.9)'], [0.35, 'rgba(255,140,50,.6)'], [0.75, 'rgba(255,70,20,.2)'], [1, 'rgba(255,40,0,0)']]);
      circ(g, 0, 0, 20); g.fill(); g.restore();
    });
  }

  /* ---------- 图标（升级卡、HUD） ---------- */
  A.iconCache = {};
  A.icon = (glyph, color, size) => {
    const key = glyph + color + size;
    if (A.iconCache[key]) return A.iconCache[key];
    const s = size, c = cv(s, s), g = c.getContext('2d');
    g.fillStyle = rad(g, s * 0.4, s * 0.35, 0, s * 0.55, [[0, Q.mix(color, '#000000', 0.35)], [1, Q.mix(color, '#000000', 0.82)]]);
    circ(g, s / 2, s / 2, s / 2 - 1); g.fill();
    g.strokeStyle = color; g.lineWidth = Math.max(1, s / 18); circ(g, s / 2, s / 2, s / 2 - g.lineWidth); g.stroke();
    g.fillStyle = '#fff'; g.font = `700 ${Math.round(s * 0.52)}px "Noto Serif SC", "Songti SC", "WenQuanYi Zen Hei", serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = color; g.shadowBlur = s / 6;
    g.fillText(glyph, s / 2, s / 2 + s * 0.03);
    A.iconCache[key] = c; return c;
  };

  /* ======================================================================
     地面纹理与装饰
     ====================================================================== */
  A.TILE = 512;
  A.buildGround = (bi, res) => {
    const B = Q.BIOMES[bi], T = A.TILE, px = Math.round(T * res);
    const c = cv(px, px), g = c.getContext('2d');
    g.setTransform(res, 0, 0, res, 0, 0);
    const rnd = Q.mulberry(900 + bi * 131);
    g.fillStyle = B.ground; g.fillRect(0, 0, T, T);
    const wrap = (x, y, R, fn) => { for (const ox of [-T, 0, T]) for (const oy of [-T, 0, T]) { const X = x + ox, Y = y + oy; if (X + R < 0 || X - R > T || Y + R < 0 || Y - R > T) continue; fn(X, Y); } };
    for (let i = 0; i < 30; i++) {
      const x = rnd() * T, y = rnd() * T, R = 40 + rnd() * 130, col = rnd() < 0.55 ? B.ground2 : B.ground3, a = 0.35 + rnd() * 0.4;
      wrap(x, y, R, (X, Y) => { g.fillStyle = rad(g, X, Y, 0, R, [[0, Q.rgba(col, a)], [1, Q.rgba(col, 0)]]); g.fillRect(X - R, Y - R, R * 2, R * 2); });
    }
    for (let i = 0; i < 1400; i++) {
      const x = rnd() * T, y = rnd() * T, s = 0.4 + rnd() * 1.4;
      g.fillStyle = rnd() < 0.5 ? `rgba(0,0,0,${0.12 + rnd() * 0.2})` : Q.rgba(B.ground3, 0.3 + rnd() * 0.4);
      g.fillRect(x, y, s, s);
    }
    const crack = (n, col, w, glowA, segLen) => {
      for (let i = 0; i < n; i++) {
        const pts = []; let x = rnd() * T, y = rnd() * T, a = rnd() * TAU;
        const segs = 4 + ((rnd() * 8) | 0);
        pts.push(x, y);
        for (let k = 0; k < segs; k++) { a += (rnd() - 0.5) * 1.3; x += Math.cos(a) * segLen * (0.5 + rnd()); y += Math.sin(a) * segLen * (0.5 + rnd()); pts.push(x, y); }
        let minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9;
        for (let k = 0; k < pts.length; k += 2) { minx = Math.min(minx, pts[k]); maxx = Math.max(maxx, pts[k]); miny = Math.min(miny, pts[k + 1]); maxy = Math.max(maxy, pts[k + 1]); }
        for (const ox of [-T, 0, T]) for (const oy of [-T, 0, T]) {
          if (maxx + ox < -10 || minx + ox > T + 10 || maxy + oy < -10 || miny + oy > T + 10) continue;
          g.beginPath(); g.moveTo(pts[0] + ox, pts[1] + oy);
          for (let k = 2; k < pts.length; k += 2) g.lineTo(pts[k] + ox, pts[k + 1] + oy);
          g.lineCap = 'round'; g.lineJoin = 'round';
          if (glowA) { g.save(); g.globalCompositeOperation = 'lighter'; g.strokeStyle = Q.rgba(col, glowA); g.lineWidth = w * 4; g.stroke(); g.restore(); }
          g.strokeStyle = glowA ? Q.rgba(col, 0.8) : col; g.lineWidth = w; g.stroke();
        }
      }
    };
    if (B.amb === 'ember') {
      crack(18, 'rgba(0,0,0,.5)', 2.2, 0, 22);
      crack(9, B.crack, 1.3, 0.16, 20);
      for (let i = 0; i < 70; i++) { const x = rnd() * T, y = rnd() * T; g.fillStyle = Q.rgba(rnd() < 0.5 ? B.crack : B.crack2, 0.25 + rnd() * 0.5); g.fillRect(x, y, 1.4, 1.4); }
      for (let i = 0; i < 10; i++) { const x = rnd() * T, y = rnd() * T, R = 20 + rnd() * 40; wrap(x, y, R, (X, Y) => { g.fillStyle = rad(g, X, Y, 0, R, [[0, 'rgba(120,110,105,.12)'], [1, 'rgba(120,110,105,0)']]); g.fillRect(X - R, Y - R, R * 2, R * 2); }); }
    } else if (B.amb === 'snow') {
      for (let i = 0; i < 22; i++) { const x = rnd() * T, y = rnd() * T, R = 30 + rnd() * 90; wrap(x, y, R, (X, Y) => { g.fillStyle = rad(g, X, Y, 0, R, [[0, 'rgba(210,235,250,.16)'], [0.7, 'rgba(210,235,250,.07)'], [1, 'rgba(210,235,250,0)']]); g.fillRect(X - R, Y - R, R * 2, R * 2); }); }
      crack(14, 'rgba(160,220,250,.22)', 1, 0, 18);
      for (let i = 0; i < 160; i++) { const x = rnd() * T, y = rnd() * T; g.fillStyle = `rgba(230,250,255,${0.25 + rnd() * 0.6})`; g.fillRect(x, y, 1, 1); }
    } else {
      for (let i = 0; i < 12; i++) { const x = rnd() * T, y = rnd() * T, R = 50 + rnd() * 110, col = rnd() < 0.5 ? '#6a2aa0' : '#a02a7a'; wrap(x, y, R, (X, Y) => { g.fillStyle = rad(g, X, Y, 0, R, [[0, Q.rgba(col, 0.16)], [1, Q.rgba(col, 0)]]); g.fillRect(X - R, Y - R, R * 2, R * 2); }); }
      for (let i = 0; i < 220; i++) { const x = rnd() * T, y = rnd() * T, s = rnd() < 0.9 ? 1 : 2; g.fillStyle = `rgba(${rnd() < 0.3 ? '255,200,255' : '230,230,255'},${0.3 + rnd() * 0.7})`; g.fillRect(x, y, s, s); }
      crack(8, B.crack, 1.2, 0.18, 20);
      crack(10, 'rgba(0,0,0,.45)', 2, 0, 22);
    }
    return c;
  };

  // 装饰物：每个地域 6 种，自带可选光源
  A.decor = [[], [], []];
  const DECOR = [
    [ // 烬原
      { w: 34, glow: null, fn: (g) => { const rnd = Q.mulberry(3); for (let i = 0; i < 4; i++) { const x = (rnd() - 0.5) * 34, y = (rnd() - 0.5) * 14, s = 8 + rnd() * 10; poly(g, [x - s, y + s * 0.4, x - s * 0.6, y - s * 0.7, x + s * 0.3, y - s, x + s, y - s * 0.2, x + s * 0.7, y + s * 0.6]); g.fillStyle = lin(g, x, y - s, x, y + s, [[0, '#4a3028'], [1, '#160c09']]); g.fill(); ol(g, 1.2); g.strokeStyle = 'rgba(255,140,80,.35)'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(x - s * 0.6, y - s * 0.7); g.lineTo(x + s * 0.3, y - s); g.stroke(); } } },
      { w: 40, glow: [0, 0, 60, 2], fn: (g) => { ell(g, 0, 0, 34, 15); g.fillStyle = '#120806'; g.fill(); ell(g, 0, 0, 29, 12); g.fillStyle = rad(g, 0, 0, 0, 30, [[0, '#fff0a0'], [0.3, '#ffb347'], [0.75, '#ff5a1a'], [1, '#8a1e08']]); g.fill(); g.save(); g.globalCompositeOperation = 'lighter'; g.strokeStyle = 'rgba(255,240,180,.5)'; g.lineWidth = 1; for (let i = 0; i < 3; i++) { ell(g, -4 + i * 5, -1 + i, 12 - i * 3, 4 - i); g.stroke(); } g.restore(); } },
      { w: 36, glow: null, fn: (g) => { g.strokeStyle = '#140a08'; g.lineCap = 'round'; const br = (x, y, a, l, w, d) => { if (d > 4) return; const x2 = x + Math.cos(a) * l, y2 = y + Math.sin(a) * l; g.lineWidth = w; g.beginPath(); g.moveTo(x, y); g.lineTo(x2, y2); g.stroke(); br(x2, y2, a - 0.5, l * 0.7, w * 0.65, d + 1); br(x2, y2, a + 0.45, l * 0.65, w * 0.65, d + 1); }; g.fillStyle = 'rgba(0,0,0,.35)'; ell(g, 2, 3, 12, 5); g.fill(); br(0, 0, -Math.PI / 2 - 0.2, 16, 4.5, 0); glow(g, 0, -2, 8, '#ff7a2a', 0.25); } },
      { w: 22, glow: [0, -6, 46, 1], fn: (g) => { g.fillStyle = 'rgba(0,0,0,.35)'; ell(g, 0, 4, 12, 4); g.fill(); poly(g, [-5, 4, -3, -12, 2, -20, 5, -8, 4, 4]); g.fillStyle = lin(g, -5, -20, 5, 4, [[0, '#ffffff'], [0.4, '#ffe9a0'], [1, '#ff9a3c']]); g.fill(); ol(g, 1, '#4a1a00'); poly(g, [3, 4, 8, -6, 10, 3]); g.fill(); ol(g, 1, '#4a1a00'); glow(g, 0, -6, 18, '#ffd36b', 0.7); } },
      { w: 30, glow: null, fn: (g) => { g.fillStyle = 'rgba(0,0,0,.35)'; ell(g, 0, 4, 18, 6); g.fill(); rr(g, -9, -30, 18, 34, 2); g.fillStyle = lin(g, -9, 0, 9, 0, [[0, '#5a4a44'], [1, '#2a201c']]); g.fill(); ol(g, 1.3); poly(g, [-9, -30, -4, -36, 3, -31, 9, -34, 9, -30]); g.fillStyle = '#4a3c36'; g.fill(); ol(g, 1); g.strokeStyle = 'rgba(0,0,0,.4)'; g.lineWidth = 1; g.beginPath(); g.moveTo(-9, -18); g.lineTo(9, -18); g.moveTo(-9, -6); g.lineTo(9, -6); g.stroke(); rr(g, 12, -2, 12, 6, 1.5); g.fillStyle = '#3a2e2a'; g.fill(); ol(g, 1); } },
      { w: 26, glow: [0, 0, 40, 3], fn: (g) => { g.strokeStyle = '#0c0504'; g.lineWidth = 4; g.lineCap = 'round'; g.beginPath(); g.moveTo(-20, 3); g.lineTo(-6, -1); g.lineTo(4, 2); g.lineTo(20, -3); g.stroke(); g.save(); g.globalCompositeOperation = 'lighter'; g.strokeStyle = 'rgba(255,110,40,.85)'; g.lineWidth = 1.4; g.stroke(); g.restore(); glow(g, 0, 0, 16, '#ff5a2a', 0.5); } },
    ],
    [ // 霜林
      { w: 44, glow: null, fn: (g) => { g.fillStyle = 'rgba(0,0,0,.3)'; ell(g, 4, 6, 30, 12); g.fill(); const lay = [[34, '#1e4a4a'], [26, '#2a6260'], [18, '#3a7a76'], [10, '#5a9a94']]; lay.forEach(([R, c], i) => { const pts = []; for (let k = 0; k < 16; k++) { const a = (k / 16) * TAU + i * 0.2, d = k % 2 ? R * 0.68 : R; pts.push(Math.cos(a) * d, Math.sin(a) * d * 0.85 - i * 4); } poly(g, pts); g.fillStyle = c; g.fill(); ol(g, 1, 'rgba(5,20,25,.7)'); }); g.fillStyle = 'rgba(235,250,255,.85)'; for (let k = 0; k < 7; k++) { const a = k * 0.9; ell(g, Math.cos(a) * 14, Math.sin(a) * 10 - 6, 5, 2.4, a); g.fill(); } circ(g, 0, -14, 4); g.fill(); } },
      { w: 30, glow: null, fn: (g) => { g.fillStyle = 'rgba(0,0,0,.3)'; ell(g, 2, 5, 22, 7); g.fill(); poly(g, [-20, 5, -16, -8, -4, -16, 10, -13, 20, -2, 16, 6]); g.fillStyle = lin(g, 0, -16, 0, 6, [[0, '#4a6478'], [1, '#1a2a38']]); g.fill(); ol(g, 1.2); poly(g, [-16, -8, -4, -16, 10, -13, 16, -6, 6, -9, -6, -8]); g.fillStyle = '#e6f6ff'; g.fill(); } },
      { w: 46, glow: [0, 0, 50, 7], fn: (g) => { ell(g, 0, 0, 42, 20); g.fillStyle = rad(g, -10, -6, 0, 44, [[0, 'rgba(200,240,255,.55)'], [0.6, 'rgba(90,170,220,.35)'], [1, 'rgba(40,90,140,.3)']]); g.fill(); g.strokeStyle = 'rgba(220,245,255,.6)'; g.lineWidth = 1.2; ell(g, 0, 0, 42, 20); g.stroke(); g.strokeStyle = 'rgba(255,255,255,.4)'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(-20, -6); g.lineTo(-4, 2); g.lineTo(6, -4); g.moveTo(10, 8); g.lineTo(22, 2); g.stroke(); } },
      { w: 22, glow: [0, -8, 48, 5], fn: (g) => { g.fillStyle = 'rgba(0,0,0,.3)'; ell(g, 0, 4, 12, 4); g.fill(); for (const [x, h, l] of [[-5, 18, -3], [1, 26, 1], [6, 15, 4]]) { poly(g, [x - 3, 4, x + l - 2, -h * 0.8, x + l, -h, x + l + 2, -h * 0.8, x + 3, 4]); g.fillStyle = lin(g, x, -h, x, 4, [[0, '#ffffff'], [0.5, '#a8e8ff'], [1, '#3a8ac8']]); g.fill(); ol(g, 0.9, '#123048'); } glow(g, 0, -10, 18, '#7fe8ff', 0.6); } },
      { w: 20, glow: null, fn: (g) => { g.fillStyle = 'rgba(0,0,0,.3)'; ell(g, 0, 3, 13, 5); g.fill(); ell(g, 0, -2, 11, 7); g.fillStyle = '#3a2a22'; g.fill(); ol(g, 1.1); ell(g, 0, -4, 9, 5); g.fillStyle = '#e8f6ff'; g.fill(); g.strokeStyle = 'rgba(120,90,70,.6)'; g.lineWidth = 0.8; ell(g, 0, -4, 5, 2.6); g.stroke(); } },
      { w: 28, glow: null, fn: (g) => { g.fillStyle = 'rgba(0,0,0,.3)'; ell(g, 0, 5, 20, 6); g.fill(); const rnd = Q.mulberry(8); for (let i = 0; i < 6; i++) { const x = (rnd() - 0.5) * 26, y = (rnd() - 0.5) * 10 - 3; circ(g, x, y, 7 + rnd() * 4); g.fillStyle = i % 2 ? '#24504c' : '#2e605a'; g.fill(); ol(g, 0.9, 'rgba(5,20,25,.7)'); } g.fillStyle = 'rgba(235,250,255,.8)'; for (let i = 0; i < 5; i++) { circ(g, (rnd() - 0.5) * 22, (rnd() - 0.5) * 8 - 6, 2.5); g.fill(); } } },
    ],
    [ // 星陨深渊
      { w: 30, glow: [0, -14, 56, 8], fn: (g) => { g.fillStyle = 'rgba(0,0,0,.4)'; ell(g, 0, 4, 18, 6); g.fill(); for (const [x, h, l, w] of [[-7, 24, -4, 4], [0, 38, 1, 5], [8, 20, 5, 4], [3, 14, 7, 3]]) { poly(g, [x - w, 4, x + l - w * 0.6, -h * 0.82, x + l, -h, x + l + w * 0.6, -h * 0.82, x + w, 4]); g.fillStyle = lin(g, x, -h, x, 4, [[0, '#ffe6ff'], [0.4, '#c86bff'], [1, '#3a0f6a']]); g.fill(); ol(g, 1, '#14052a'); } glow(g, 0, -16, 22, '#c86bff', 0.6); } },
      { w: 34, glow: null, fn: (g) => { g.fillStyle = 'rgba(0,0,0,.45)'; ell(g, 0, 14, 22, 6); g.fill(); poly(g, [-22, -12, -12, -22, 8, -24, 22, -14, 16, -2, 2, 6, -14, 2]); g.fillStyle = lin(g, 0, -24, 0, 6, [[0, '#4a3a68'], [1, '#160e28']]); g.fill(); ol(g, 1.3); poly(g, [-22, -12, -12, -22, 8, -24, 22, -14, 6, -15, -8, -14]); g.fillStyle = '#5e4c80'; g.fill(); glow(g, 4, -16, 5, '#ffffff', 0.5); } },
      { w: 20, glow: [0, -4, 50, 0], fn: (g) => { glow(g, 0, -4, 22, '#ffe9b0', 0.6); g.fillStyle = '#ffffff'; poly(g, [0, -18, 2.5, -6, 10, -4, 2.5, -1, 0, 9, -2.5, -1, -10, -4, -2.5, -6]); g.fill(); g.strokeStyle = 'rgba(255,233,176,.7)'; g.lineWidth = 0.8; circ(g, 0, -4, 13); g.stroke(); } },
      { w: 30, glow: [0, 0, 44, 9], fn: (g) => { g.strokeStyle = '#05010a'; g.lineWidth = 5; g.lineCap = 'round'; g.beginPath(); g.moveTo(-24, 2); g.lineTo(-10, -3); g.lineTo(0, 3); g.lineTo(12, -2); g.lineTo(24, 4); g.stroke(); g.save(); g.globalCompositeOperation = 'lighter'; g.strokeStyle = 'rgba(255,107,213,.85)'; g.lineWidth = 1.6; g.stroke(); g.restore(); glow(g, 0, 0, 18, '#ff6bd5', 0.45); } },
      { w: 36, glow: null, fn: (g) => { g.fillStyle = 'rgba(0,0,0,.4)'; ell(g, 0, 4, 26, 7); g.fill(); for (const x of [-18, 18]) { rr(g, x - 5, -34, 10, 38, 2); g.fillStyle = lin(g, x - 5, 0, x + 5, 0, [[0, '#4a3a62'], [1, '#1c1430']]); g.fill(); ol(g, 1.2); } g.beginPath(); g.moveTo(-23, -30); g.quadraticCurveTo(0, -48, 23, -30); g.lineTo(23, -24); g.quadraticCurveTo(0, -40, -23, -24); g.closePath(); g.fillStyle = '#3a2e52'; g.fill(); ol(g, 1.2); glow(g, 0, -36, 6, '#c86bff', 0.7); } },
      { w: 40, glow: [0, 0, 50, 13], fn: (g) => { ell(g, 0, 0, 36, 16); g.fillStyle = rad(g, 0, 0, 0, 36, [[0, '#000000'], [0.6, '#12052a'], [1, '#3a1a6a']]); g.fill(); g.strokeStyle = 'rgba(200,107,255,.6)'; g.lineWidth = 1.2; ell(g, 0, 0, 36, 16); g.stroke(); specks(g, Q.mulberry(77), 14, 24, '#ffffff', 0.5); } },
    ],
  ];
  A.decorDefs = DECOR;
  function buildDecor() {
    DECOR.forEach((list, bi) => {
      A.decor[bi] = list.map((d) => { const s = sprite(d.w + 10, d.fn); s.glow = d.glow; return s; });
    });
  }

  /* ======================================================================
     英雄（实时绘制）：原点在脚下，单位为世界单位，默认面向右
     ====================================================================== */
  function leg(g, x, y, sw, c1, c2) {
    g.lineCap = 'round'; g.strokeStyle = c1; g.lineWidth = 4.2;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + sw * 0.6, -2); g.stroke();
    g.fillStyle = c2; ell(g, x + sw * 0.6 + 1, -1.2, 3.1, 1.9); g.fill();
  }
  const HERO = {};
  HERO.guard = (g, t, o) => {
    const m = o.move || 0, ph = t * 10, sw = Math.sin(ph) * m, bob = -Math.abs(Math.cos(ph)) * 1.8 * m + Math.sin(t * 2) * 0.35;
    const cw = Math.sin(t * 4) * 1.2 + m * 5;
    g.beginPath(); g.moveTo(-4, -29 + bob); g.bezierCurveTo(-10 - cw * 0.5, -22, -12 - cw, -10, -14 - cw * 1.2, -2 + Math.sin(t * 6 + 1) * 1.5); g.lineTo(-2, -5 + bob * 0.5); g.lineTo(3, -27 + bob); g.closePath();
    g.fillStyle = lin(g, 0, -30, 0, 0, [[0, '#e8583a'], [1, '#6e1a12']]); g.fill(); ol(g, 1.2);
    leg(g, -3.2, -13 + bob, sw * 6, '#3c4452', '#20252e'); leg(g, 3.2, -13 + bob, -sw * 6, '#4a5262', '#262c36');
    // 剑（后手）
    g.save(); g.translate(-7.5, -18 + bob); g.rotate(-0.42 + sw * 0.12 + (o.swing || 0));
    g.beginPath(); g.moveTo(-1.7, 0); g.lineTo(-1.3, -22); g.lineTo(0, -26); g.lineTo(1.3, -22); g.lineTo(1.7, 0); g.closePath();
    g.fillStyle = lin(g, -2, 0, 2, 0, [[0, '#fffbe8'], [1, '#c9b37a']]); g.fill(); ol(g, 0.8);
    g.save(); g.globalCompositeOperation = 'lighter'; g.strokeStyle = 'rgba(255,215,120,.55)'; g.lineWidth = 3; g.beginPath(); g.moveTo(0, -2); g.lineTo(0, -24); g.stroke(); g.restore();
    g.fillStyle = '#e8c06a'; g.fillRect(-4.2, -1, 8.4, 2.3); g.fillStyle = '#4a2a14'; g.fillRect(-1, 1.2, 2, 5);
    g.restore();
    // 躯干
    rr(g, -7.5, -28 + bob, 15, 16, 4); g.fillStyle = lin(g, 0, -28, 0, -12, [[0, '#fff0c0'], [0.45, '#dcae5c'], [1, '#8a6430']]); g.fill(); ol(g, 1.2);
    for (const s of [-1, 1]) { ell(g, s * 7.2, -26 + bob, 3.8, 3.1); g.fillStyle = lin(g, 0, -29, 0, -23, [[0, '#fff0c0'], [1, '#a07a3e']]); g.fill(); ol(g, 1); }
    g.fillStyle = '#5a2e1a'; g.fillRect(-7.5, -15.5 + bob, 15, 2.4);
    glow(g, 0, -21 + bob, 5, '#ffd76b', 0.6);
    g.fillStyle = '#fff6d0'; poly(g, [0, -24 + bob, 1.6, -21 + bob, 0, -18 + bob, -1.6, -21 + bob]); g.fill();
    // 头盔
    circ(g, 0.6, -33.5 + bob, 6.4); g.fillStyle = lin(g, 0, -40, 0, -27, [[0, '#f6f9fc'], [1, '#7f8a9a']]); g.fill(); ol(g, 1.2);
    g.fillStyle = '#16181c'; g.fillRect(1.2, -34.6 + bob, 5.6, 2); g.fillRect(3.2, -34.6 + bob, 1.8, 5);
    g.save(); g.globalCompositeOperation = 'lighter'; g.fillStyle = 'rgba(255,215,107,.95)'; g.fillRect(2, -34.1 + bob, 4.4, 0.9); g.restore();
    glow(g, 4, -33.6 + bob, 4, '#ffd76b', 0.5);
    g.beginPath(); g.moveTo(-0.5, -39.2 + bob); g.quadraticCurveTo(-6, -46 + bob, -12 - cw * 0.5, -40 + bob + Math.sin(t * 5)); g.quadraticCurveTo(-6, -41.5 + bob, -1.5, -37.8 + bob); g.closePath();
    g.fillStyle = '#e8583a'; g.fill(); ol(g, 0.9);
    // 盾（前手）
    g.save(); g.translate(8.6, -19.5 + bob); g.rotate(sw * 0.05);
    g.beginPath(); g.moveTo(-5.6, -7.5); g.lineTo(5.6, -7.5); g.lineTo(5.6, 0); g.quadraticCurveTo(5.6, 6.2, 0, 10.2); g.quadraticCurveTo(-5.6, 6.2, -5.6, 0); g.closePath();
    g.fillStyle = lin(g, -6, 0, 6, 0, [[0, '#46589a'], [1, '#1a2244']]); g.fill(); ol(g, 1.3);
    g.strokeStyle = '#e8c06a'; g.lineWidth = 1.2; g.stroke();
    glow(g, 0, -0.5, 6, '#ffd76b', 0.75);
    g.fillStyle = '#ffe9a0'; circ(g, 0, -0.5, 2); g.fill();
    g.strokeStyle = '#ffe9a0'; g.lineWidth = 0.8; g.beginPath(); for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; g.moveTo(Math.cos(a) * 2.8, -0.5 + Math.sin(a) * 2.8); g.lineTo(Math.cos(a) * 4.2, -0.5 + Math.sin(a) * 4.2); } g.stroke();
    g.restore();
  };
  HERO.mage = (g, t, o) => {
    const m = o.move || 0, ph = t * 9, sw = Math.sin(ph) * m, bob = -Math.abs(Math.cos(ph)) * 1.3 * m + Math.sin(t * 2.2) * 0.6;
    // 发丝
    g.beginPath(); g.moveTo(-2, -38 + bob); g.bezierCurveTo(-10 - m * 3, -34, -12 - m * 4, -24, -10 - m * 5 + Math.sin(t * 4) * 1.6, -15 + bob); g.lineTo(-4, -26 + bob); g.closePath();
    g.fillStyle = lin(g, 0, -38, 0, -15, [[0, '#fbfaff'], [1, '#9aa2e8']]); g.fill(); ol(g, 0.9);
    // 长袍
    const hem = Math.sin(t * 5) * 1.2 + sw * 1.6;
    g.beginPath(); g.moveTo(-5.5, -29 + bob); g.lineTo(5.5, -29 + bob); g.quadraticCurveTo(8.5, -14, 10.5 + hem, -0.5); g.quadraticCurveTo(0, 2.6, -10.5 + hem, -0.5); g.quadraticCurveTo(-8.5, -14, -5.5, -29 + bob); g.closePath();
    g.fillStyle = lin(g, 0, -29, 0, 0, [[0, '#5244c0'], [0.55, '#28216e'], [1, '#120e38']]); g.fill(); ol(g, 1.2);
    g.strokeStyle = '#c4b0ff'; g.lineWidth = 1.3; g.beginPath(); g.moveTo(-10 + hem, -1.2); g.quadraticCurveTo(0, 1.8, 10 + hem, -1.2); g.stroke();
    g.strokeStyle = 'rgba(196,176,255,.55)'; g.lineWidth = 1; g.beginPath(); g.moveTo(0.5, -27 + bob); g.lineTo(1 + hem * 0.5, -1); g.stroke();
    g.save(); g.globalCompositeOperation = 'lighter'; g.fillStyle = 'rgba(255,255,255,.9)';
    for (const [x, y] of [[-4, -8], [5, -12], [-2, -18], [6, -4], [-6, -3]]) { g.fillRect(x + hem * 0.3, y + bob * 0.5, 0.9, 0.9); }
    g.restore();
    g.fillStyle = '#6be4ff'; g.fillRect(-6, -18.5 + bob, 12, 1.8);
    glow(g, 0, -17.6 + bob, 5, '#6be4ff', 0.5);
    // 头
    circ(g, 0.5, -33.6 + bob, 6.7); g.fillStyle = lin(g, 0, -41, 0, -27, [[0, '#4a40c0'], [1, '#1c1660']]); g.fill(); ol(g, 1.2);
    ell(g, 2.2, -32.6 + bob, 3.9, 4.3); g.fillStyle = '#f8e8de'; g.fill();
    g.beginPath(); g.moveTo(-1.5, -36.5 + bob); g.quadraticCurveTo(2, -38.5 + bob, 6, -35 + bob); g.quadraticCurveTo(3, -35.5 + bob, -1.5, -33 + bob); g.closePath(); g.fillStyle = '#eef0ff'; g.fill();
    g.fillStyle = '#3a2a90'; circ(g, 1.6, -32.4 + bob, 0.75); g.fill(); circ(g, 4.4, -32.4 + bob, 0.75); g.fill();
    g.strokeStyle = '#c4b0ff'; g.lineWidth = 1; g.beginPath(); g.arc(0.5, -33.6 + bob, 6.7, -1.2, 1.4); g.stroke();
    // 法杖
    g.strokeStyle = '#e0c890'; g.lineWidth = 1.8; g.lineCap = 'round'; g.beginPath(); g.moveTo(8.4, -1.5); g.lineTo(9.6, -40 + bob); g.stroke();
    g.fillStyle = '#f8e8de'; circ(g, 8.8, -18 + bob, 1.8); g.fill();
    const cy = -45.5 + bob + Math.sin(t * 3) * 1.2;
    glow(g, 9.8, cy, 13, '#6be4ff', 0.75);
    poly(g, [9.8, cy - 5, 12.4, cy, 9.8, cy + 5, 7.2, cy]); g.fillStyle = lin(g, 9.8, cy - 5, 9.8, cy + 5, [[0, '#ffffff'], [1, '#6be4ff']]); g.fill(); ol(g, 0.7, '#1a3a6a');
    g.save(); g.globalCompositeOperation = 'lighter'; g.strokeStyle = 'rgba(255,255,255,.8)'; g.lineWidth = 0.8;
    const sa = t * 2; g.beginPath(); g.moveTo(9.8 + Math.cos(sa) * 9, cy + Math.sin(sa) * 9); g.lineTo(9.8 - Math.cos(sa) * 9, cy - Math.sin(sa) * 9); g.stroke(); g.restore();
  };
  HERO.ranger = (g, t, o) => {
    const m = o.move || 0, ph = t * 11, sw = Math.sin(ph) * m, bob = -Math.abs(Math.cos(ph)) * 1.8 * m + Math.sin(t * 2.4) * 0.35;
    const cw = Math.sin(t * 4.5) * 1.3 + m * 5;
    // 斗篷
    g.beginPath(); g.moveTo(-3, -31 + bob); g.bezierCurveTo(-9 - cw * 0.4, -24, -11 - cw, -12, -12 - cw * 1.1, -3 + Math.sin(t * 6) * 1.4); g.lineTo(-1, -6 + bob * 0.5); g.lineTo(4, -28 + bob); g.closePath();
    g.fillStyle = lin(g, 0, -31, 0, -3, [[0, '#3a8a64'], [1, '#143224']]); g.fill(); ol(g, 1.2);
    // 箭袋
    g.save(); g.translate(-5.5, -22 + bob); g.rotate(-0.35);
    rr(g, -2.5, -9, 5, 14, 1.4); g.fillStyle = '#6a4228'; g.fill(); ol(g, 0.9);
    g.fillStyle = '#c8ff6b'; for (let i = -1; i <= 1; i++) { poly(g, [i * 1.6 - 1, -9, i * 1.6, -13, i * 1.6 + 1, -9]); g.fill(); }
    g.restore();
    leg(g, -2.8, -13 + bob, sw * 6.5, '#4a3424', '#22160e'); leg(g, 2.8, -13 + bob, -sw * 6.5, '#5a4030', '#2a1c12');
    rr(g, -6.5, -27.5 + bob, 13, 15.5, 3.5); g.fillStyle = lin(g, 0, -28, 0, -12, [[0, '#8a6444'], [1, '#3a2618']]); g.fill(); ol(g, 1.1);
    g.fillStyle = '#2a1a10'; g.fillRect(-6.5, -16 + bob, 13, 2.2);
    g.strokeStyle = '#2a1a10'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(-5, -27 + bob); g.lineTo(5, -16 + bob); g.stroke();
    // 围巾
    g.beginPath(); g.moveTo(-4, -28.5 + bob); g.quadraticCurveTo(-10 - cw * 0.8, -28 + Math.sin(t * 7) * 2, -15 - cw * 1.2, -25 + Math.sin(t * 7 + 1) * 2.5); g.lineTo(-13 - cw, -22.5 + Math.sin(t * 7 + 1.5) * 2); g.quadraticCurveTo(-8, -25.5, -3, -26 + bob); g.closePath();
    g.fillStyle = '#c8ff6b'; g.fill(); ol(g, 0.9);
    ell(g, 0, -28 + bob, 6, 2.2); g.fill(); ol(g, 0.9);
    // 兜帽
    g.beginPath(); g.moveTo(-6.5, -30 + bob); g.quadraticCurveTo(-7, -40 + bob, 0.5, -41.5 + bob); g.quadraticCurveTo(7.5, -40 + bob, 7, -30 + bob); g.closePath();
    g.fillStyle = lin(g, 0, -42, 0, -30, [[0, '#4aa47a'], [1, '#1e4a34']]); g.fill(); ol(g, 1.1);
    ell(g, 2.4, -33.2 + bob, 3.6, 3.6); g.fillStyle = '#0c1a12'; g.fill();
    eye(g, 1.3, -33.4 + bob, 0.65, '#6bffb5'); eye(g, 3.9, -33.4 + bob, 0.65, '#6bffb5');
    // 弓（前手）
    g.save(); g.translate(8.5, -20 + bob);
    g.strokeStyle = '#e0c49a'; g.lineWidth = 2.1; g.lineCap = 'round';
    g.beginPath(); g.moveTo(-1, -15); g.quadraticCurveTo(7.5, -7, 7.5, 0); g.quadraticCurveTo(7.5, 7, -1, 15); g.stroke();
    g.strokeStyle = 'rgba(240,250,255,.75)'; g.lineWidth = 0.7; g.beginPath(); g.moveTo(-1, -15); g.lineTo(-1 - (o.draw || 0) * 4, 0); g.lineTo(-1, 15); g.stroke();
    glow(g, 7.5, 0, 5, '#6bffb5', 0.5);
    g.fillStyle = '#8a6444'; circ(g, 6.8, 0, 1.6); g.fill();
    g.restore();
  };
  A.drawHero = (g, id, t, o) => {
    shadow(g, 12.5, 4.4, 0.42);
    g.save(); if ((o.face || 1) < 0) g.scale(-1, 1);
    HERO[id](g, t, o);
    g.restore();
  };

  /* ======================================================================
     首领（实时绘制）
     ====================================================================== */
  const BOSS = {};
  const heyanShape = (() => {
    const rnd = Q.mulberry(101);
    const torso = [-48, -52, -60, -88, -42, -112, -14, -122, 14, -122, 42, -112, 60, -88, 48, -52, 28, -36, -28, -36];
    const cracks = [];
    for (let i = 0; i < 8; i++) {
      const pts = []; let x = (rnd() - 0.5) * 70, y = -50 - rnd() * 60, a = rnd() * TAU; pts.push(x, y);
      for (let k = 0; k < 4; k++) { a += (rnd() - 0.5) * 1.4; x += Math.cos(a) * 11; y += Math.sin(a) * 11; x = Q.clamp(x, -50, 50); y = Q.clamp(y, -115, -40); pts.push(x, y); }
      cracks.push(pts);
    }
    return { torso, cracks };
  })();
  BOSS.heyan = (g, t, b) => {
    const ph2 = b.phase > 1, pulse = 0.5 + 0.5 * Math.sin(t * (ph2 ? 8 : 4)), br = Math.sin(t * 2) * 1.5;
    shadow(g, 66, 20, 0.5);
    const walk = Math.sin(t * 5) * (b.moving ? 1 : 0);
    // 腿
    for (const s of [-1, 1]) { rr(g, s * 24 - 12, -46 + (s * walk * 2), 24, 46 - s * walk * 2, 6); g.fillStyle = lin(g, 0, -46, 0, 0, [[0, '#3a2219'], [1, '#140a07']]); g.fill(); ol(g, 2); }
    // 手臂位置
    let fy = -52 + br, fx = 64;
    if (b.anim === 'raise') { const k = Q.clamp(b.animT / 0.6, 0, 1); fy = Q.lerp(-52, -150, Q.easeOut(k)); fx = Q.lerp(64, 40, k); }
    else if (b.anim === 'slam') { const k = Q.clamp(b.animT / 0.15, 0, 1); fy = Q.lerp(-150, -14, k); fx = Q.lerp(40, 70, k); }
    else if (b.anim === 'charge') { fy = -70; fx = 52; }
    for (const s of [-1, 1]) {
      g.strokeStyle = '#24140f'; g.lineWidth = 20; g.lineCap = 'round';
      g.beginPath(); g.moveTo(s * 50, -100); g.quadraticCurveTo(s * (fx + 14), (fy - 100) / 2 - 10, s * fx, fy); g.stroke();
      g.strokeStyle = 'rgba(0,0,0,.6)'; g.lineWidth = 2; g.stroke();
    }
    // 躯干
    const T = heyanShape.torso.slice();
    for (let i = 1; i < T.length; i += 2) T[i] += br;
    poly(g, T); g.fillStyle = lin(g, 0, -122, 0, -36, [[0, '#5a3a2c'], [0.5, '#2e1a12'], [1, '#120806']]); g.fill(); ol(g, 2.6);
    poly(g, [-60, -88, -42, -112, -14, -122, -20, -104, -44, -96]); g.fillStyle = 'rgba(140,100,80,.35)'; g.fill();
    poly(g, [60, -88, 42, -112, 14, -122, 20, -104, 44, -96]); g.fillStyle = 'rgba(140,100,80,.22)'; g.fill();
    // 熔岩裂纹
    g.save(); g.globalCompositeOperation = 'lighter'; g.lineCap = 'round'; g.lineJoin = 'round';
    for (const pts of heyanShape.cracks) {
      g.beginPath(); g.moveTo(pts[0], pts[1] + br); for (let k = 2; k < pts.length; k += 2) g.lineTo(pts[k], pts[k + 1] + br);
      g.strokeStyle = `rgba(255,110,40,${0.25 + pulse * 0.25})`; g.lineWidth = 7; g.stroke();
      g.strokeStyle = `rgba(255,200,90,${0.6 + pulse * 0.4})`; g.lineWidth = 2; g.stroke();
    }
    g.restore();
    // 心核
    glow(g, 0, -82 + br, 46 + pulse * 14, ph2 ? '#ff4a1a' : '#ff8a2a', 0.75);
    circ(g, 0, -82 + br, 13 + pulse * 2); g.fillStyle = rad(g, 0, -82 + br, 0, 15, [[0, '#ffffff'], [0.35, '#fff0a0'], [0.75, '#ffb347'], [1, '#ff5a1a']]); g.fill();
    // 头
    circ(g, 0, -124 + br, 16); g.fillStyle = lin(g, 0, -140, 0, -108, [[0, '#4a3026'], [1, '#1a0d09']]); g.fill(); ol(g, 2.2);
    for (const s of [-1, 1]) {
      g.beginPath(); g.moveTo(s * 10, -134 + br); g.quadraticCurveTo(s * 32, -150 + br, s * 30, -172 + br); g.quadraticCurveTo(s * 24, -150 + br, s * 4, -138 + br); g.closePath();
      g.fillStyle = lin(g, 0, -172, 0, -134, [[0, '#ffb347'], [0.3, '#5a3020'], [1, '#2a140c']]); g.fill(); ol(g, 1.6);
    }
    for (const s of [-1, 1]) { glow(g, s * 6, -125 + br, 9, '#ffd36b', 0.9); g.fillStyle = '#fff6c0'; ell(g, s * 6, -125 + br, 3.6, 1.6, s * 0.3); g.fill(); }
    // 拳
    for (const s of [-1, 1]) {
      circ(g, s * fx, fy, 19); g.fillStyle = rad(g, s * fx - 5, fy - 6, 0, 22, [[0, '#5a3a2c'], [1, '#160a07']]); g.fill(); ol(g, 2.2);
      glow(g, s * fx, fy, 16, '#ff7a2a', 0.35 + pulse * 0.3);
      g.strokeStyle = `rgba(255,170,80,${0.5 + pulse * 0.4})`; g.lineWidth = 1.5; g.beginPath(); g.moveTo(s * fx - 9, fy - 4); g.lineTo(s * fx + 3, fy + 2); g.lineTo(s * fx + 8, fy - 8); g.stroke();
    }
  };
  BOSS.linyuan = (g, t, b) => {
    const hover = -26 + Math.sin(t * 1.6) * 5, ph2 = b.phase > 1;
    g.save(); g.globalAlpha *= 0.8; shadow(g, 56, 16, 0.45); g.restore();
    g.save(); g.translate(0, hover);
    // 环绕冰晶（后半圈）
    const shards = (front) => {
      for (let i = 0; i < 7; i++) {
        const a = t * 0.9 + (i / 7) * TAU, sy = Math.sin(a);
        if ((sy > 0) !== front) continue;
        const x = Math.cos(a) * 88, y = -64 + sy * 22;
        g.save(); g.translate(x, y); g.rotate(a + t);
        poly(g, [0, -9, 3.5, 0, 0, 9, -3.5, 0]); g.fillStyle = lin(g, 0, -9, 0, 9, [[0, '#ffffff'], [1, '#6ac8ff']]); g.fill(); ol(g, 0.8, '#123048');
        g.restore(); glow(g, x, y, 12, '#7fe8ff', 0.5);
      }
    };
    shards(false);
    // 极光鬃毛
    g.save(); g.globalCompositeOperation = 'lighter';
    for (let k = 0; k < 3; k++) {
      g.beginPath();
      for (let i = 0; i <= 14; i++) { const x = -60 + i * 8, y = -86 - k * 7 + Math.sin(t * 2.2 + i * 0.6 + k) * 6 - i * 1.4; i ? g.lineTo(x, y) : g.moveTo(x, y); }
      g.strokeStyle = k === 1 ? 'rgba(120,255,200,.35)' : 'rgba(127,232,255,.3)'; g.lineWidth = 7 - k * 2; g.lineCap = 'round'; g.stroke();
    }
    g.restore();
    // 腿（虚化）
    for (const [x, ph] of [[-34, 0], [-14, 1.5], [22, 3], [40, 4.5]]) {
      const sw = Math.sin(t * 2 + ph) * 5;
      g.strokeStyle = lin(g, 0, -50, 0, 10, [[0, 'rgba(220,245,255,.85)'], [1, 'rgba(220,245,255,0)']]); g.lineWidth = 6; g.lineCap = 'round';
      g.beginPath(); g.moveTo(x, -52); g.quadraticCurveTo(x + sw, -24, x + sw * 1.5, 6); g.stroke();
    }
    // 身体
    ell(g, 0, -64, 56, 28); g.fillStyle = rad(g, -14, -76, 4, 64, [[0, 'rgba(255,255,255,.98)'], [0.5, 'rgba(190,232,255,.9)'], [1, 'rgba(70,140,210,.75)']]); g.fill(); ol(g, 2, 'rgba(20,60,100,.9)');
    glow(g, 0, -64, 70, ph2 ? '#9fe8ff' : '#7fe8ff', 0.35);
    // 颈与头
    g.beginPath(); g.moveTo(30, -82); g.quadraticCurveTo(52, -104, 58, -118); g.lineTo(76, -110); g.quadraticCurveTo(64, -86, 50, -60); g.closePath();
    g.fillStyle = 'rgba(214,240,255,.95)'; g.fill(); ol(g, 1.8, 'rgba(20,60,100,.9)');
    ell(g, 74, -118, 20, 12, 0.3); g.fillStyle = rad(g, 70, -124, 2, 24, [[0, '#ffffff'], [1, '#9fd2f0']]); g.fill(); ol(g, 1.8, 'rgba(20,60,100,.9)');
    // 鹿角
    g.save(); g.globalCompositeOperation = 'lighter'; g.lineCap = 'round';
    const antler = (s) => {
      g.beginPath();
      g.moveTo(68, -128); g.quadraticCurveTo(60 + s * 6, -160, 40 + s * 10, -186);
      g.moveTo(62 + s * 2, -150); g.lineTo(84 + s * 6, -170);
      g.moveTo(52 + s * 6, -168); g.lineTo(60 + s * 10, -196);
      g.moveTo(46 + s * 8, -178); g.lineTo(24 + s * 8, -190);
      g.moveTo(80, -126); g.quadraticCurveTo(92 + s * 4, -150, 108 + s * 4, -160);
      g.moveTo(92 + s * 3, -146); g.lineTo(98 + s * 4, -168);
    };
    antler(-1); g.strokeStyle = 'rgba(127,232,255,.35)'; g.lineWidth = 9; g.stroke(); g.strokeStyle = '#e6fbff'; g.lineWidth = 2.6; g.stroke();
    antler(1.2); g.strokeStyle = 'rgba(127,232,255,.25)'; g.lineWidth = 7; g.stroke(); g.strokeStyle = 'rgba(230,251,255,.85)'; g.lineWidth = 2; g.stroke();
    g.restore();
    eye(g, 80, -121, 3, ph2 ? '#ffffff' : '#7fe8ff');
    shards(true);
    g.restore();
  };
  BOSS.yuanyao = (g, t, b) => {
    const ph = b.phase, hover = -86 + Math.sin(t * 1.2) * 6;
    const hue = ph >= 3 ? ['#ff6b8a', '#ff3b6b', '#ffb0c0'] : ph === 2 ? ['#ff6bd5', '#c86bff', '#ffd0f4'] : ['#c86bff', '#8a5bff', '#e6d0ff'];
    shadow(g, 60, 18, 0.5);
    g.save(); g.translate(0, hover);
    // 光翼
    g.save(); g.globalCompositeOperation = 'lighter';
    const rays = 8;
    for (let i = 0; i < rays; i++) {
      const a = (i / rays) * TAU + t * 0.25 * (ph >= 3 ? 2 : 1), len = 120 + Math.sin(t * 2 + i) * 18;
      g.save(); g.rotate(a);
      g.beginPath(); g.moveTo(30, -7); g.quadraticCurveTo(len * 0.6, -14, len, 0); g.quadraticCurveTo(len * 0.6, 14, 30, 7); g.closePath();
      g.fillStyle = lin(g, 30, 0, len, 0, [[0, Q.rgba(hue[0], 0.55)], [1, Q.rgba(hue[1], 0)]]); g.fill();
      g.restore();
    }
    g.restore();
    // 光环
    for (let k = 0; k < 3; k++) {
      const tilt = [0.35, -0.5, 1.2][k], rx = [92, 76, 104][k], ry = [24, 20, 16][k], spin = t * (0.6 + k * 0.25) * (k % 2 ? -1 : 1);
      g.save(); g.rotate(tilt + Math.sin(t * 0.3 + k) * 0.1);
      g.strokeStyle = Q.rgba(hue[2], 0.55); g.lineWidth = 1.6; ell(g, 0, 0, rx, ry); g.stroke();
      g.save(); g.globalCompositeOperation = 'lighter';
      for (let j = 0; j < 6; j++) { const a = spin + (j / 6) * TAU; const x = Math.cos(a) * rx, y = Math.sin(a) * ry; g.fillStyle = Q.rgba(hue[2], 0.95); g.fillRect(x - 2, y - 2, 4, 4); }
      g.restore(); g.restore();
    }
    // 星核
    glow(g, 0, 0, 90, hue[0], 0.55);
    circ(g, 0, 0, 44); g.fillStyle = rad(g, -12, -14, 4, 50, [[0, '#3a1a5a'], [0.7, '#14061f'], [1, hue[1]]]); g.fill();
    g.save(); circ(g, 0, 0, 44); g.clip();
    g.globalCompositeOperation = 'lighter';
    for (let k = 0; k < 4; k++) { g.strokeStyle = Q.rgba(hue[0], 0.25); g.lineWidth = 3; g.beginPath(); g.arc(Math.cos(t * 0.5 + k) * 10, Math.sin(t * 0.4 + k) * 10, 18 + k * 7, t * (0.4 + k * 0.1), t * (0.4 + k * 0.1) + 2.2); g.stroke(); }
    g.restore();
    g.strokeStyle = Q.rgba(hue[2], 0.8); g.lineWidth = 2; circ(g, 0, 0, 44); g.stroke();
    // 眼
    const blink = (t % 4.3) < 0.14 ? 0.12 : 1;
    g.save(); g.scale(1, blink);
    g.beginPath(); g.moveTo(-30, 0); g.quadraticCurveTo(0, -24, 30, 0); g.quadraticCurveTo(0, 24, -30, 0); g.closePath();
    g.fillStyle = rad(g, 0, 0, 0, 30, [[0, '#fffbe8'], [1, '#e8c8ff']]); g.fill(); ol(g, 1.6, '#1a0828');
    const lx = Math.cos(t * 0.7) * 5, ly = Math.sin(t * 0.9) * 3;
    circ(g, lx, ly, 13); g.fillStyle = rad(g, lx, ly, 0, 13, [[0, '#ffffff'], [0.3, '#ffd36b'], [0.7, hue[0]], [1, '#3a0a4a']]); g.fill();
    ell(g, lx, ly, 2.6, 10); g.fillStyle = '#0a0010'; g.fill();
    g.restore();
    // 星冠
    g.save(); g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i - 2) * 0.42, d = 62 + Math.sin(t * 3 + i) * 3;
      const x = Math.cos(a) * d, y = Math.sin(a) * d;
      g.fillStyle = Q.rgba(hue[2], 0.95);
      poly(g, [x, y - 7, x + 2, y - 2, x + 7, y, x + 2, y + 2, x, y + 7, x - 2, y + 2, x - 7, y, x - 2, y - 2]); g.fill();
    }
    g.restore();
    g.restore();
  };
  A.drawBoss = (g, id, t, b) => {
    g.save(); if ((b.face || 1) < 0 && id !== 'yuanyao') g.scale(-1, 1);
    BOSS[id](g, t, b);
    g.restore();
  };

  A.build = () => {
    buildGlows();
    for (const id in Q.ENEMIES) A.enemy[id] = buildEnemy(id);
    buildItems();
    buildDecor();
  };
})();
