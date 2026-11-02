/* =========================================================
   影 · 暗域 —— 渲染：程序化贴图 + 彩色光照图 + 射线阴影 + 视野迷雾 + 后期
   ========================================================= */
(function () {
  'use strict';
  const U = window.Umbra;
  const T = U.T;
  const TAU = U.TAU;
  const PL = U.PLAYER;
  const CHK = 8; // 区块边长（格）

  const FLOOR = {
    start: [100, 108, 124], podbay: [94, 100, 114], cargo: [98, 97, 96], quarters: [102, 96, 112], control: [86, 96, 118],
    medbay: [114, 122, 132], engine: [104, 96, 86], hydro: [78, 100, 88], obs: [86, 94, 114], storage: [96, 98, 102], hub: [80, 86, 98],
  };
  const CORR = [78, 84, 96];

  const QUAL = [
    { ls: 0.36, los: 180, flash: 60, beam: 36, dust: 36, grain: false, dpr: 1.25 },
    { ls: 0.5, los: 260, flash: 84, beam: 50, dust: 70, grain: false, dpr: 1.75, haze: true },
    { ls: 0.62, los: 360, flash: 112, beam: 66, dust: 110, grain: true, dpr: 2, haze: true },
  ];

  const R = (U.Render = {
    cv: null, ctx: null, dpr: 1, cw: 1, ch: 1, TS: 48, S: 48, q: 2, qMax: 2,
    cam: { x: 0, y: 0, sx: 0, sy: 0 }, shake: 0, chunks: new Map(), map: null, stamp: 1,
    workAvg: 8, qTimer: 0, mobile: false,
  });

  const rgba = (c, a) => 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')';
  const shade = (c, k) => 'rgb(' + Math.round(c[0] * k) + ',' + Math.round(c[1] * k) + ',' + Math.round(c[2] * k) + ')';

  /* ---------------- 初始化与尺寸 ---------------- */
  R.init = function (cv, mobile) {
    R.cv = cv;
    R.ctx = cv.getContext('2d', { alpha: false });
    R.light = document.createElement('canvas');
    R.lctx = R.light.getContext('2d');
    R.tmp = document.createElement('canvas');
    R.tctx = R.tmp.getContext('2d');
    R.mobile = !!mobile;
    R.q = R.mobile ? 1 : 2;
    R.losBuf = new Float32Array(2 * 1200);
    R.flashBuf = new Float32Array(2 * 400);
    R.beamBuf = new Float32Array(2 * 300);
    R.dust = [];
    R.makeGrain();
    R.makeStars();
    R.resize();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => R.chunks.clear());
  };

  R.resize = function () {
    const Q = QUAL[R.q];
    R.dpr = Math.min(Q.dpr, window.devicePixelRatio || 1);
    R.cw = Math.max(1, window.innerWidth);
    R.ch = Math.max(1, window.innerHeight);
    R.cv.width = Math.round(R.cw * R.dpr);
    R.cv.height = Math.round(R.ch * R.dpr);
    const portrait = R.ch > R.cw;
    const short = Math.min(R.cw, R.ch), long = Math.max(R.cw, R.ch);
    R.TS = U.clamp(Math.min(short / (portrait ? 10.8 : 13), long / 19), 26, 88);
    const want = U.clamp(Math.round((R.TS * R.dpr) / 8) * 8, 24, R.mobile ? 56 : 72);
    if (want !== R.S) { R.S = want; R.chunks.clear(); }
    R.light.width = Math.max(2, Math.round(R.cw * Q.ls));
    R.light.height = Math.max(2, Math.round(R.ch * Q.ls));
    R.makeVignette();
  };

  R.setQuality = function (q) {
    q = U.clamp(q, 0, R.qMax);
    if (q === R.q) return;
    R.q = q;
    R.resize();
  };

  R.setMap = function (M) {
    if (R.map === M) return;
    R.map = M;
    R.chunks.clear();
    R.vis = new Uint32Array(M.N);
    R.stamp = 1;
    R.buildMemEdges();
    // 信标灯光多边形（静态，只算一次）
    for (const r of M.relays) {
      r.poly = new Float32Array(2 * 97);
      r.np = M.visPoly(r.x, r.y, 0, TAU, 96, 4.2, 0.3, r.poly, null);
    }
    const P = M.pod;
    P.poly = new Float32Array(2 * 97);
    P.np = M.visPoly(P.hx + Math.cos(P.face) * 0.6, P.hy + Math.sin(P.face) * 0.6, 0, TAU, 96, 4.5, 0.3, P.poly, null);
    R.dust = [];
  };

  R.worldToScreen = function (x, y) {
    return { x: (x - R.cam.x) * R.TS + R.cw / 2 + R.cam.sx, y: (y - R.cam.y) * R.TS + R.ch / 2 + R.cam.sy };
  };
  R.screenToWorld = function (sx, sy) {
    return { x: (sx - R.cw / 2 - R.cam.sx) / R.TS + R.cam.x, y: (sy - R.ch / 2 - R.cam.sy) / R.TS + R.cam.y };
  };

  /* ---------------- 预生成纹理 ---------------- */
  R.makeGrain = function () {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const x = c.getContext('2d');
    const img = x.createImageData(128, 128);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.random() * 255;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    R.grain = c;
    R.grainPat = null;
  };
  R.makeStars = function () {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const x = c.getContext('2d');
    x.fillStyle = '#020309';
    x.fillRect(0, 0, 256, 256);
    const g = x.createRadialGradient(170, 80, 0, 170, 80, 160);
    g.addColorStop(0, 'rgba(120,80,200,0.22)');
    g.addColorStop(0.5, 'rgba(60,40,120,0.1)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, 256, 256);
    const rnd = U.mulberry32(77);
    for (let i = 0; i < 220; i++) {
      const s = rnd();
      x.fillStyle = s > 0.92 ? 'rgba(255,240,220,0.95)' : s > 0.7 ? 'rgba(200,215,255,0.8)' : 'rgba(170,180,220,0.5)';
      const r = s > 0.95 ? 1.4 : s > 0.75 ? 0.9 : 0.6;
      x.beginPath();
      x.arc(rnd() * 256, rnd() * 256, r, 0, TAU);
      x.fill();
    }
    R.stars = c;
    R.starPat = null;
  };
  R.makeVignette = function () {
    const c = document.createElement('canvas');
    const w = 256, h = Math.max(64, Math.round((256 * R.ch) / R.cw));
    c.width = w; c.height = h;
    const x = c.getContext('2d');
    const g = x.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.2, w / 2, h / 2, Math.hypot(w, h) * 0.55);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(0.6, 'rgba(0,0,0,0.35)');
    g.addColorStop(1, 'rgba(0,0,0,0.85)');
    x.fillStyle = g;
    x.fillRect(0, 0, w, h);
    R.vig = c;
    const d = document.createElement('canvas');
    d.width = w; d.height = h;
    const y = d.getContext('2d');
    const g2 = y.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.18, w / 2, h / 2, Math.hypot(w, h) * 0.55);
    g2.addColorStop(0, 'rgba(255,20,30,0)');
    g2.addColorStop(0.55, 'rgba(200,10,25,0.26)');
    g2.addColorStop(1, 'rgba(120,0,10,0.85)');
    y.fillStyle = g2;
    y.fillRect(0, 0, w, h);
    R.redVig = d;
  };

  // 面罩裂纹
  R.makeCracks = function (level, seed) {
    const c = document.createElement('canvas');
    c.width = Math.round(R.cw * Math.min(R.dpr, 1.5));
    c.height = Math.round(R.ch * Math.min(R.dpr, 1.5));
    const x = c.getContext('2d');
    const rnd = U.mulberry32(seed || 9);
    const W = c.width, H = c.height, s = Math.min(W, H);
    const origins = level >= 2 ? 3 : 1;
    for (let o = 0; o < origins; o++) {
      const ox = o === 0 ? W * (0.12 + rnd() * 0.18) : W * (0.55 + rnd() * 0.35);
      const oy = o === 0 ? H * (0.7 + rnd() * 0.2) : H * (0.08 + rnd() * 0.4);
      const arms = 7 + Math.floor(rnd() * 5);
      for (let a = 0; a < arms; a++) {
        let ang = (a / arms) * TAU + rnd() * 0.5, px = ox, py = oy;
        const len = s * (0.12 + rnd() * 0.32);
        x.beginPath();
        x.moveTo(px, py);
        let l = 0;
        while (l < len) {
          const step = s * (0.015 + rnd() * 0.03);
          ang += (rnd() - 0.5) * 0.7;
          px += Math.cos(ang) * step; py += Math.sin(ang) * step;
          l += step;
          x.lineTo(px, py);
          if (rnd() < 0.12) {
            // 分叉
            const bx = px, by = py, ba = ang + (rnd() < 0.5 ? 1 : -1) * (0.5 + rnd() * 0.6);
            x.moveTo(bx, by);
            x.lineTo(bx + Math.cos(ba) * step * 3, by + Math.sin(ba) * step * 3);
            x.moveTo(px, py);
          }
        }
        x.strokeStyle = 'rgba(220,230,255,0.55)';
        x.lineWidth = Math.max(1, s * 0.0016);
        x.stroke();
        x.strokeStyle = 'rgba(0,0,0,0.35)';
        x.lineWidth = Math.max(1, s * 0.004);
        x.globalCompositeOperation = 'destination-over';
        x.stroke();
        x.globalCompositeOperation = 'source-over';
      }
      const g = x.createRadialGradient(ox, oy, 0, ox, oy, s * 0.06);
      g.addColorStop(0, 'rgba(230,240,255,0.35)');
      g.addColorStop(1, 'rgba(230,240,255,0)');
      x.fillStyle = g;
      x.beginPath();
      x.arc(ox, oy, s * 0.06, 0, TAU);
      x.fill();
    }
    return c;
  };

  /* =========================================================
     静态世界：按区块缓存
     ========================================================= */
  function hz(x, y, s) { return U.hash2(x, y, s); }
  const isFloorT = t => t === T.FLOOR || t === T.CORR || t === T.DOOR;

  function paintFloor(c, M, x, y) {
    const i = M.I(x, y), t = M.tile[i];
    const room = M.roomOf[i] >= 0 ? M.rooms[M.roomOf[i]] : null;
    const base = t === T.FLOOR && room ? FLOOR[room.type] || FLOOR.cargo : room && room.hub ? FLOOR.hub : CORR;
    const h = hz(x, y, 1), h2 = hz(x, y, 2), h3 = hz(x, y, 3);
    c.fillStyle = shade(base, 0.93 + h * 0.12);
    c.fillRect(x, y, 1, 1);
    const plate = room && room.type === 'engine' ? 'diamond' : room && room.type === 'medbay' ? 'tile' : t === T.CORR || t === T.DOOR ? 'corr' : 'plate';
    if (plate === 'tile') {
      c.strokeStyle = 'rgba(0,0,0,0.18)';
      c.lineWidth = 0.025;
      c.beginPath();
      c.moveTo(x + 0.5, y); c.lineTo(x + 0.5, y + 1);
      c.moveTo(x, y + 0.5); c.lineTo(x + 1, y + 0.5);
      c.stroke();
    } else if (plate === 'diamond') {
      c.fillStyle = 'rgba(255,255,255,0.06)';
      for (let yy = 0; yy < 4; yy++) for (let xx = 0; xx < 4; xx++) {
        c.save();
        c.translate(x + 0.125 + xx * 0.25, y + 0.125 + yy * 0.25);
        c.rotate((xx + yy) % 2 ? 0.7 : -0.7);
        c.fillRect(-0.07, -0.02, 0.14, 0.04);
        c.restore();
      }
    } else if (plate === 'corr') {
      // 走廊：横向防滑条
      c.fillStyle = 'rgba(0,0,0,0.12)';
      for (let k = 0; k < 4; k++) c.fillRect(x + 0.1, y + 0.12 + k * 0.25, 0.8, 0.05);
    }
    // 板缝
    c.fillStyle = 'rgba(255,255,255,0.06)';
    c.fillRect(x, y, 1, 0.03);
    c.fillRect(x, y, 0.03, 1);
    c.fillStyle = 'rgba(0,0,0,0.3)';
    c.fillRect(x, y + 0.97, 1, 0.03);
    c.fillRect(x + 0.97, y, 0.03, 1);
    if (plate === 'plate' && h2 < 0.55) {
      c.fillStyle = 'rgba(0,0,0,0.28)';
      for (const [ox, oy] of [[0.12, 0.12], [0.88, 0.12], [0.12, 0.88], [0.88, 0.88]]) {
        c.beginPath(); c.arc(x + ox, y + oy, 0.03, 0, TAU); c.fill();
      }
    }
    // 走廊中线（两条地板之间的黄色虚线）
    if (t === T.CORR && room == null) {
      const W = (dx, dy) => { const tt = M.inb(x + dx, y + dy) ? M.tile[M.I(x + dx, y + dy)] : T.VOID; return tt === T.WALL || tt === T.VOID; };
      const C2 = (dx, dy) => M.inb(x + dx, y + dy) && M.tile[M.I(x + dx, y + dy)] === T.CORR && M.roomOf[M.I(x + dx, y + dy)] < 0;
      c.fillStyle = 'rgba(214,180,70,0.26)';
      if (W(0, -1) && C2(0, 1) && W(0, 2)) for (let k = 0; k < 2; k++) c.fillRect(x + 0.1 + k * 0.5, y + 0.975, 0.3, 0.05);
      if (W(-1, 0) && C2(1, 0) && W(2, 0)) for (let k = 0; k < 2; k++) c.fillRect(x + 0.975, y + 0.1 + k * 0.5, 0.05, 0.3);
    }
    // 格栅
    if ((t === T.CORR && h3 > 0.9) || (t === T.FLOOR && h3 > 0.965)) {
      c.fillStyle = 'rgba(8,10,14,0.85)';
      c.fillRect(x + 0.14, y + 0.14, 0.72, 0.72);
      c.fillStyle = 'rgba(120,130,150,0.35)';
      for (let k = 0; k < 6; k++) c.fillRect(x + 0.18, y + 0.18 + k * 0.11, 0.64, 0.035);
    }
    // 污渍
    const h4 = hz(x, y, 4);
    if (h4 < 0.22) {
      const gx = x + hz(x, y, 5), gy = y + hz(x, y, 6), gr = 0.4 + hz(x, y, 7) * 0.7;
      const g = c.createRadialGradient(gx, gy, 0, gx, gy, gr);
      g.addColorStop(0, 'rgba(10,8,6,0.32)');
      g.addColorStop(1, 'rgba(10,8,6,0)');
      c.fillStyle = g;
      c.fillRect(x - 0.6, y - 0.6, 2.2, 2.2);
    }
    // 划痕
    if (h4 > 0.82) {
      c.strokeStyle = 'rgba(255,255,255,0.07)';
      c.lineWidth = 0.02;
      const a = hz(x, y, 8) * TAU;
      c.beginPath();
      c.moveTo(x + 0.5 - Math.cos(a) * 0.35, y + 0.5 - Math.sin(a) * 0.35);
      c.lineTo(x + 0.5 + Math.cos(a) * 0.35, y + 0.5 + Math.sin(a) * 0.35);
      c.stroke();
    }
    // 门槛：轨道与警示条
    if (t === T.DOOR) {
      const d = M.doors[M.doorAt[i]];
      c.fillStyle = 'rgba(12,14,18,0.9)';
      if (d.axis === 'x') c.fillRect(x + 0.38, y, 0.24, 1);
      else c.fillRect(x, y + 0.38, 1, 0.24);
      stripes(c, d.axis === 'x' ? x + 0.02 : x, d.axis === 'x' ? y : y + 0.02, d.axis === 'x' ? 0.16 : 1, d.axis === 'x' ? 1 : 0.16, 0.55);
      stripes(c, d.axis === 'x' ? x + 0.82 : x, d.axis === 'x' ? y : y + 0.82, d.axis === 'x' ? 0.16 : 1, d.axis === 'x' ? 1 : 0.16, 0.55);
    }
  }

  function stripes(c, x, y, w, h, a) {
    c.save();
    c.beginPath();
    c.rect(x, y, w, h);
    c.clip();
    c.fillStyle = 'rgba(196,160,52,' + a + ')';
    c.fillRect(x, y, w, h);
    c.fillStyle = 'rgba(14,12,10,' + a + ')';
    const n = Math.ceil((w + h) / 0.18) + 2;
    for (let k = -2; k < n; k++) {
      c.beginPath();
      const sx = x + k * 0.18;
      c.moveTo(sx, y); c.lineTo(sx + 0.09, y); c.lineTo(sx + 0.09 - h, y + h); c.lineTo(sx - h, y + h);
      c.closePath();
      c.fill();
    }
    c.restore();
  }

  function paintWall(c, M, x, y) {
    const i = M.I(x, y);
    c.fillStyle = '#0f1218';
    c.fillRect(x, y, 1, 1);
    const fl = (dx, dy) => M.inb(x + dx, y + dy) && isFloorT(M.tile[M.I(x + dx, y + dy)]);
    const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
    const D = 0.3;
    for (const [dx, dy] of dirs) {
      if (!fl(dx, dy)) continue;
      let gx0, gy0, gx1, gy1, rx, ry, rw, rh;
      if (dy === 1) { rx = x; ry = y + 1 - D; rw = 1; rh = D; gx0 = x; gy0 = y + 1; gx1 = x; gy1 = y + 1 - D; }
      else if (dy === -1) { rx = x; ry = y; rw = 1; rh = D; gx0 = x; gy0 = y; gx1 = x; gy1 = y + D; }
      else if (dx === 1) { rx = x + 1 - D; ry = y; rw = D; rh = 1; gx0 = x + 1; gy0 = y; gx1 = x + 1 - D; gy1 = y; }
      else { rx = x; ry = y; rw = D; rh = 1; gx0 = x; gy0 = y; gx1 = x + D; gy1 = y; }
      const g = c.createLinearGradient(gx0, gy0, gx1, gy1);
      g.addColorStop(0, '#8790a8');
      g.addColorStop(0.18, '#5a6278');
      g.addColorStop(1, '#1b1f29');
      c.fillStyle = g;
      c.fillRect(rx, ry, rw, rh);
      // 边缘高光
      c.fillStyle = 'rgba(210,220,245,0.55)';
      if (dy) c.fillRect(x, dy === 1 ? y + 0.975 : y, 1, 0.025);
      else c.fillRect(dx === 1 ? x + 0.975 : x, y, 0.025, 1);
      // 管线
      const run = dy ? hz(Math.floor(x / 4), y * 3 + dy, 11) : hz(x * 3 + dx, Math.floor(y / 4), 12);
      if (run < 0.32 && !M.win[i] && M.lockerAt[i] < 0) {
        c.fillStyle = '#3a4152';
        const off = 0.13;
        if (dy) {
          const py = dy === 1 ? y + 1 - off - 0.08 : y + off;
          c.fillRect(x, py, 1, 0.08);
          c.fillStyle = 'rgba(255,255,255,0.18)';
          c.fillRect(x, py + 0.01, 1, 0.018);
          if ((x & 3) === 0) { c.fillStyle = '#262b36'; c.fillRect(x + 0.4, py - 0.02, 0.08, 0.12); }
        } else {
          const px = dx === 1 ? x + 1 - off - 0.08 : x + off;
          c.fillRect(px, y, 0.08, 1);
          c.fillStyle = 'rgba(255,255,255,0.18)';
          c.fillRect(px + 0.01, y, 0.018, 1);
          if ((y & 3) === 0) { c.fillStyle = '#262b36'; c.fillRect(px - 0.02, y + 0.4, 0.12, 0.08); }
        }
      }
    }
    // 内角：两条墙面之间的缺口
    const ANG = { '1,1': [Math.PI, Math.PI * 1.5], '-1,1': [-Math.PI / 2, 0], '1,-1': [Math.PI / 2, Math.PI], '-1,-1': [0, Math.PI / 2] };
    for (const [dx, dy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      if (!fl(dx, dy) || fl(dx, 0) || fl(0, dy)) continue;
      const cx = dx === 1 ? x + 1 : x, cy = dy === 1 ? y + 1 : y;
      const g = c.createRadialGradient(cx, cy, 0, cx, cy, D);
      g.addColorStop(0, '#7a8399');
      g.addColorStop(0.2, '#566076');
      g.addColorStop(1, '#1b1f29');
      c.fillStyle = g;
      const a = ANG[dx + ',' + dy];
      c.beginPath();
      c.moveTo(cx, cy);
      c.arc(cx, cy, D, a[0], a[1]);
      c.closePath();
      c.fill();
    }
    // 窗
    if (M.win[i]) {
      let horiz = fl(0, 1) || fl(0, -1);
      c.fillStyle = '#05070d';
      if (horiz) c.fillRect(x, y + 0.22, 1, 0.56); else c.fillRect(x + 0.22, y, 0.56, 1);
      c.strokeStyle = '#6a7388';
      c.lineWidth = 0.05;
      if (horiz) c.strokeRect(x + 0.02, y + 0.22, 0.96, 0.56); else c.strokeRect(x + 0.22, y + 0.02, 0.56, 0.96);
    }
  }

  function paintProp(c, p) {
    const { x, y, w, h } = p;
    const s = p.s;
    switch (p.kind) {
      case 'crate': {
        const big = w * h >= 2;
        // 投影
        c.fillStyle = 'rgba(0,0,0,0.35)';
        c.fillRect(x + 0.1, y + 0.12, w - 0.06, h - 0.06);
        const n = big ? w * h : 1;
        const cells = [];
        if (p.big) cells.push([x + 0.06, y + 0.06, w - 0.12, h - 0.12]);
        else for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) cells.push([x + xx + 0.06, y + yy + 0.06, 0.88, 0.88]);
        cells.forEach((r, k) => {
          const hue = U.hash2(Math.floor(r[0] * 7), Math.floor(r[1] * 7), 3);
          const col = hue < 0.33 ? [118, 104, 80] : hue < 0.66 ? [92, 102, 86] : [104, 96, 110];
          c.fillStyle = shade(col, 1);
          c.fillRect(r[0], r[1], r[2], r[3]);
          c.fillStyle = shade(col, 1.25);
          c.fillRect(r[0] + 0.06, r[1] + 0.06, r[2] - 0.12, r[3] - 0.12);
          c.strokeStyle = shade(col, 0.6);
          c.lineWidth = 0.05;
          c.strokeRect(r[0] + 0.06, r[1] + 0.06, r[2] - 0.12, r[3] - 0.12);
          c.beginPath();
          c.moveTo(r[0] + 0.08, r[1] + 0.08); c.lineTo(r[0] + r[2] - 0.08, r[1] + r[3] - 0.08);
          if (p.big || k % 2) { c.moveTo(r[0] + r[2] - 0.08, r[1] + 0.08); c.lineTo(r[0] + 0.08, r[1] + r[3] - 0.08); }
          c.stroke();
          c.fillStyle = 'rgba(20,18,14,0.55)';
          c.fillRect(r[0] + r[2] * 0.3, r[1] + r[3] * 0.42, r[2] * 0.4, r[3] * 0.14);
        });
        break;
      }
      case 'shelf': {
        c.fillStyle = 'rgba(0,0,0,0.35)';
        c.fillRect(x + 0.08, y + 0.1, w, h);
        c.fillStyle = '#454b58';
        c.fillRect(x + 0.04, y + 0.04, w - 0.08, h - 0.08);
        c.strokeStyle = '#6b7286';
        c.lineWidth = 0.05;
        c.strokeRect(x + 0.04, y + 0.04, w - 0.08, h - 0.08);
        const horiz = w > h;
        const n = Math.max(w, h) * 2;
        for (let k = 0; k < n; k++) {
          const hv = U.hash2(Math.floor(x * 5) + k, Math.floor(y * 5), 21);
          if (hv < 0.2) continue;
          const col = hv < 0.45 ? '#7d6e58' : hv < 0.7 ? '#596a7e' : '#7b7f86';
          c.fillStyle = col;
          if (horiz) c.fillRect(x + 0.12 + k * 0.5, y + 0.14 + hv * 0.1, 0.36, h - 0.36);
          else c.fillRect(x + 0.14 + hv * 0.1, y + 0.12 + k * 0.5, w - 0.36, 0.36);
        }
        break;
      }
      case 'machine': {
        c.fillStyle = 'rgba(0,0,0,0.4)';
        c.fillRect(x + 0.12, y + 0.14, w, h);
        c.fillStyle = '#353941';
        c.fillRect(x + 0.05, y + 0.05, w - 0.1, h - 0.1);
        c.fillStyle = '#474c57';
        c.fillRect(x + 0.18, y + 0.18, w - 0.36, h - 0.36);
        c.fillStyle = '#1c1f25';
        for (let k = 0; k < 7; k++) c.fillRect(x + 0.3, y + 0.32 + k * 0.18, w - 0.6, 0.07);
        stripes(c, x + 0.05, y + 0.05, w - 0.1, 0.14, 0.7);
        c.fillStyle = '#5d6370';
        c.beginPath(); c.arc(x + w - 0.35, y + h - 0.35, 0.18, 0, TAU); c.fill();
        c.fillStyle = '#2b2f37';
        c.beginPath(); c.arc(x + w - 0.35, y + h - 0.35, 0.09, 0, TAU); c.fill();
        break;
      }
      case 'tank': {
        c.fillStyle = 'rgba(0,0,0,0.4)';
        c.beginPath(); c.arc(x + 0.58, y + 0.6, 0.42, 0, TAU); c.fill();
        const g = c.createRadialGradient(x + 0.38, y + 0.36, 0.05, x + 0.5, y + 0.5, 0.45);
        g.addColorStop(0, '#9aa2b4');
        g.addColorStop(1, '#3d4350');
        c.fillStyle = g;
        c.beginPath(); c.arc(x + 0.5, y + 0.5, 0.42, 0, TAU); c.fill();
        c.strokeStyle = '#2a2e38';
        c.lineWidth = 0.04;
        c.beginPath(); c.arc(x + 0.5, y + 0.5, 0.3, 0, TAU); c.stroke();
        c.fillStyle = '#b0503c';
        c.fillRect(x + 0.44, y + 0.2, 0.12, 0.12);
        break;
      }
      case 'cabinet': {
        c.fillStyle = 'rgba(0,0,0,0.35)';
        c.fillRect(x + 0.1, y + 0.12, 0.86, 0.86);
        c.fillStyle = '#6a7182';
        c.fillRect(x + 0.06, y + 0.06, 0.88, 0.88);
        c.fillStyle = '#8a92a6';
        c.fillRect(x + 0.12, y + 0.12, 0.76, 0.76);
        c.fillStyle = '#c34a3c';
        c.fillRect(x + 0.42, y + 0.3, 0.16, 0.4);
        c.fillRect(x + 0.3, y + 0.42, 0.4, 0.16);
        break;
      }
      case 'bunk': case 'bed': {
        const horiz = w > h;
        c.fillStyle = 'rgba(0,0,0,0.3)';
        c.fillRect(x + 0.08, y + 0.1, w - 0.04, h - 0.04);
        c.fillStyle = p.kind === 'bed' ? '#6d7684' : '#4a4e5a';
        c.fillRect(x + 0.05, y + 0.05, w - 0.1, h - 0.1);
        c.fillStyle = p.kind === 'bed' ? '#b7c0cc' : '#7b8094';
        c.fillRect(x + 0.12, y + 0.12, w - 0.24, h - 0.24);
        c.fillStyle = p.kind === 'bed' ? '#d7dde6' : '#9aa0b2';
        if (horiz) c.fillRect(s < 0.5 ? x + 0.16 : x + w - 0.56, y + 0.2, 0.4, h - 0.4);
        else c.fillRect(x + 0.2, s < 0.5 ? y + 0.16 : y + h - 0.56, w - 0.4, 0.4);
        c.fillStyle = p.kind === 'bed' ? 'rgba(120,160,190,0.35)' : 'rgba(90,80,120,0.55)';
        if (horiz) c.fillRect(s < 0.5 ? x + 0.7 : x + 0.2, y + 0.14, w - 0.95, h - 0.28);
        else c.fillRect(x + 0.14, s < 0.5 ? y + 0.7 : y + 0.2, w - 0.28, h - 0.95);
        break;
      }
      case 'console': {
        c.fillStyle = 'rgba(0,0,0,0.3)';
        c.fillRect(x + 0.08, y + 0.1, 0.9, 0.9);
        c.fillStyle = '#3a4252';
        c.fillRect(x + 0.06, y + 0.06, 0.88, 0.88);
        c.fillStyle = '#121a26';
        c.fillRect(x + 0.18, y + 0.18, 0.64, 0.4);
        c.fillStyle = 'rgba(160,180,210,0.3)';
        for (let k = 0; k < 5; k++) c.fillRect(x + 0.2 + k * 0.12, y + 0.68, 0.08, 0.08);
        break;
      }
      case 'table': case 'workbench': case 'bench': {
        c.fillStyle = 'rgba(0,0,0,0.3)';
        c.fillRect(x + 0.1, y + 0.12, w - 0.06, h - 0.06);
        c.fillStyle = p.kind === 'workbench' ? '#5f554a' : p.kind === 'bench' ? '#4c5262' : '#585e6b';
        c.fillRect(x + 0.06, y + 0.06, w - 0.12, h - 0.12);
        c.strokeStyle = 'rgba(255,255,255,0.12)';
        c.lineWidth = 0.03;
        c.strokeRect(x + 0.1, y + 0.1, w - 0.2, h - 0.2);
        if (p.kind === 'bench') {
          c.fillStyle = 'rgba(0,0,0,0.25)';
          if (w > h) for (let k = 1; k < 4; k++) c.fillRect(x + 0.06, y + 0.06 + (k * (h - 0.12)) / 4, w - 0.12, 0.03);
          else for (let k = 1; k < 4; k++) c.fillRect(x + 0.06 + (k * (w - 0.12)) / 4, y + 0.06, 0.03, h - 0.12);
        } else {
          // 杂物
          for (let k = 0; k < 4; k++) {
            const hv = U.hash2(Math.floor(x * 9) + k, Math.floor(y * 9), 31);
            c.fillStyle = hv < 0.3 ? '#9a8f7a' : hv < 0.6 ? '#6d7f94' : '#a3a8b4';
            c.save();
            c.translate(x + 0.25 + hv * (w - 0.5), y + 0.25 + U.hash2(k, Math.floor(x), 32) * (h - 0.5));
            c.rotate(hv * 3);
            c.fillRect(-0.1, -0.06, 0.2, 0.12);
            c.restore();
          }
          if (p.screen) { c.fillStyle = '#121a26'; c.fillRect(x + w / 2 - 0.3, y + h / 2 - 0.18, 0.6, 0.36); }
        }
        break;
      }
      case 'planter': {
        c.fillStyle = 'rgba(0,0,0,0.3)';
        c.fillRect(x + 0.08, y + 0.1, w - 0.04, h - 0.04);
        c.fillStyle = '#3d3a36';
        c.fillRect(x + 0.05, y + 0.05, w - 0.1, h - 0.1);
        c.fillStyle = '#2a2119';
        c.fillRect(x + 0.14, y + 0.14, w - 0.28, h - 0.28);
        const n = Math.max(w, h) * 3;
        for (let k = 0; k < n; k++) {
          const t = (k + 0.5) / n;
          const px = w > h ? x + 0.2 + t * (w - 0.4) : x + w / 2;
          const py = w > h ? y + h / 2 : y + 0.2 + t * (h - 0.4);
          const hv = U.hash2(k, Math.floor(x * 3 + y * 7), 41);
          for (let l = 0; l < 5; l++) {
            const a = (l / 5) * TAU + hv * 3;
            c.fillStyle = l % 2 ? '#4f8f5c' : '#3c7349';
            c.beginPath();
            c.ellipse(px + Math.cos(a) * 0.1, py + Math.sin(a) * 0.1, 0.14, 0.06, a, 0, TAU);
            c.fill();
          }
        }
        break;
      }
      case 'pod': {
        // 停泊位底座标线（舱体本身动态绘制）
        c.fillStyle = 'rgba(0,0,0,0.25)';
        c.fillRect(x - 0.1, y - 0.1, w + 0.2, h + 0.2);
        c.strokeStyle = 'rgba(220,190,80,0.55)';
        c.lineWidth = 0.06;
        c.setLineDash([0.2, 0.14]);
        c.strokeRect(x - 0.05, y - 0.05, w + 0.1, h + 0.1);
        c.setLineDash([]);
        break;
      }
    }
  }

  function paintCables(c, M, cx, cy) {
    const rnd = U.mulberry32((cx * 92821 + cy * 68917 + M.seed) >>> 0);
    const n = rnd() < 0.55 ? 1 + Math.floor(rnd() * 2) : 0;
    for (let k = 0; k < n; k++) {
      const x0 = cx * CHK + rnd() * CHK, y0 = cy * CHK + rnd() * CHK;
      const tx = Math.floor(x0), ty = Math.floor(y0);
      if (!M.inb(tx, ty) || !isFloorT(M.tile[M.I(tx, ty)])) continue;
      const a = rnd() * TAU, l = 1.5 + rnd() * 2.5;
      const x1 = x0 + Math.cos(a) * l, y1 = y0 + Math.sin(a) * l;
      const ex = Math.floor(x1), ey = Math.floor(y1);
      if (!M.inb(ex, ey) || !isFloorT(M.tile[M.I(ex, ey)])) continue;
      c.strokeStyle = rnd() < 0.5 ? '#22252c' : '#3b2a26';
      c.lineWidth = 0.06;
      c.lineCap = 'round';
      c.beginPath();
      c.moveTo(x0, y0);
      c.bezierCurveTo(x0 + (rnd() - 0.5) * 2, y0 + (rnd() - 0.5) * 2, x1 + (rnd() - 0.5) * 2, y1 + (rnd() - 0.5) * 2, x1, y1);
      c.stroke();
      c.strokeStyle = 'rgba(255,255,255,0.1)';
      c.lineWidth = 0.015;
      c.stroke();
    }
    // 水渍（会反光）
    if (rnd() < 0.35) {
      const px = cx * CHK + rnd() * CHK, py = cy * CHK + rnd() * CHK;
      const tx = Math.floor(px), ty = Math.floor(py);
      if (M.inb(tx, ty) && isFloorT(M.tile[M.I(tx, ty)]) && M.walkBase[M.I(tx, ty)]) {
        c.fillStyle = 'rgba(150,170,200,0.13)';
        c.beginPath();
        c.ellipse(px, py, 0.5 + rnd() * 0.6, 0.3 + rnd() * 0.3, rnd() * 3, 0, TAU);
        c.fill();
        c.strokeStyle = 'rgba(200,215,240,0.12)';
        c.lineWidth = 0.02;
        c.stroke();
      }
    }
    // 爪痕
    if (rnd() < 0.16) {
      const px = cx * CHK + rnd() * CHK, py = cy * CHK + rnd() * CHK;
      const tx = Math.floor(px), ty = Math.floor(py);
      if (M.inb(tx, ty) && isFloorT(M.tile[M.I(tx, ty)])) {
        const a = rnd() * TAU;
        c.strokeStyle = 'rgba(12,10,12,0.45)';
        c.lineWidth = 0.035;
        for (let k = -1; k <= 1; k++) {
          const ox = Math.cos(a + Math.PI / 2) * k * 0.12, oy = Math.sin(a + Math.PI / 2) * k * 0.12;
          c.beginPath();
          c.moveTo(px + ox, py + oy);
          c.quadraticCurveTo(px + ox + Math.cos(a) * 0.5, py + oy + Math.sin(a) * 0.5 + 0.08, px + ox + Math.cos(a) * 1.0, py + oy + Math.sin(a) * 1.0);
          c.stroke();
        }
      }
    }
  }

  function paintChunk(cx, cy) {
    const M = R.map, S = R.S;
    const cv = document.createElement('canvas');
    cv.width = cv.height = CHK * S;
    const c = cv.getContext('2d');
    c.setTransform(S, 0, 0, S, -cx * CHK * S, -cy * CHK * S);
    const x0 = cx * CHK, y0 = cy * CHK, x1 = Math.min(M.W, x0 + CHK), y1 = Math.min(M.H, y0 + CHK);
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (isFloorT(M.tile[M.I(x, y)])) paintFloor(c, M, x, y);
    paintCables(c, M, cx, cy);
    // 喷字
    for (const L of M.labels) {
      if (L.x < x0 - 4 || L.x > x1 + 4 || L.y < y0 - 2 || L.y > y1 + 2) continue;
      c.save();
      c.setTransform(1, 0, 0, 1, (L.x - x0) * S, (L.y - y0) * S);
      c.font = '700 ' + Math.round(S * 0.34) + 'px "Noto Serif SC", "Songti SC", serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillStyle = 'rgba(214,206,170,0.24)';
      c.fillText(L.text, 0, 0);
      c.restore();
    }
    for (const p of M.props) {
      if (p.x + p.w < x0 - 1 || p.x > x1 + 1 || p.y + p.h < y0 - 1 || p.y > y1 + 1) continue;
      paintProp(c, p);
    }
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (M.tile[M.I(x, y)] === T.WALL) paintWall(c, M, x, y);
    return cv;
  }

  function getChunk(cx, cy, budget) {
    const key = cx * 1000 + cy;
    let c = R.chunks.get(key);
    if (!c && budget.n > 0) { budget.n--; c = paintChunk(cx, cy); R.chunks.set(key, c); }
    return c;
  }

  R.buildMemEdges = function () {
    const M = R.map;
    const cw = Math.ceil(M.W / CHK), chh = Math.ceil(M.H / CHK);
    R.memEdges = [];
    for (let cy = 0; cy < chh; cy++) {
      for (let cx = 0; cx < cw; cx++) {
        const arr = [];
        for (let y = cy * CHK; y < Math.min(M.H, cy * CHK + CHK); y++) {
          for (let x = cx * CHK; x < Math.min(M.W, cx * CHK + CHK); x++) {
            const i = M.I(x, y);
            if (M.tile[i] !== T.WALL) continue;
            const fl = (dx, dy) => M.inb(x + dx, y + dy) && isFloorT(M.tile[M.I(x + dx, y + dy)]);
            if (fl(0, 1)) arr.push(x, y + 1, x + 1, y + 1, i);
            if (fl(0, -1)) arr.push(x, y, x + 1, y, i);
            if (fl(1, 0)) arr.push(x + 1, y, x + 1, y + 1, i);
            if (fl(-1, 0)) arr.push(x, y, x, y + 1, i);
          }
        }
        R.memEdges.push(new Float32Array(arr));
      }
    }
    R.memCols = cw;
  };

  /* =========================================================
     动态物体
     ========================================================= */
  function drawDoor(c, d) {
    const o = d.open;
    c.save();
    let rx, ry, rw, rh;
    if (d.axis === 'x') { rx = d.tiles[0][0]; ry = d.tiles[0][1]; rw = 1; rh = 2; }
    else { rx = d.tiles[0][0]; ry = d.tiles[0][1]; rw = 2; rh = 1; }
    c.beginPath();
    c.rect(rx, ry, rw, rh);
    c.clip();
    const slide = o * 0.94;
    const th = 0.34;
    for (const s of [0, 1]) {
      let px, py, pw, ph;
      if (d.axis === 'x') {
        px = rx + 0.5 - th / 2; pw = th; ph = 1;
        py = s === 0 ? ry - slide : ry + 1 + slide;
      } else {
        py = ry + 0.5 - th / 2; ph = th; pw = 1;
        px = s === 0 ? rx - slide : rx + 1 + slide;
      }
      c.fillStyle = '#4b5263';
      c.fillRect(px, py, pw, ph);
      c.fillStyle = '#6b7388';
      if (d.axis === 'x') c.fillRect(px + 0.05, py + 0.06, pw - 0.1, ph - 0.12);
      else c.fillRect(px + 0.06, py + 0.05, pw - 0.12, ph - 0.1);
      // 对接边警示条
      if (d.axis === 'x') stripes(c, px, s === 0 ? py + ph - 0.16 : py, pw, 0.16, 0.9);
      else stripes(c, s === 0 ? px + pw - 0.16 : px, py, 0.16, ph, 0.9);
    }
    c.restore();
  }

  function drawLocker(c, L, t, hl) {
    // 柜体位于墙格，朝向 L.dir
    c.save();
    c.translate(L.x + 0.5, L.y + 0.5);
    c.rotate(L.dir);
    // 局部坐标：+x 指向前方（地面）
    c.fillStyle = '#2b303b';
    c.fillRect(-0.36, -0.44, 0.86, 0.88);
    c.fillStyle = '#58607a';
    c.fillRect(-0.3, -0.4, 0.74, 0.8);
    c.fillStyle = '#3c4253';
    c.fillRect(-0.24, -0.34, 0.6, 0.68);
    // 门（铰链在 -y 端）
    const o = L.open;
    c.save();
    c.translate(0.47, -0.42);
    c.rotate(-o * 1.6);
    c.fillStyle = '#6f7894';
    c.fillRect(-0.05, 0, 0.09, 0.84);
    c.fillStyle = '#9aa3bd';
    c.fillRect(-0.02, 0.04, 0.03, 0.76);
    c.fillStyle = '#20242d';
    for (let k = 0; k < 5; k++) c.fillRect(-0.045, 0.14 + k * 0.12, 0.08, 0.04);
    c.restore();
    if (hl > 0) {
      c.strokeStyle = 'rgba(180,140,255,' + 0.5 * hl + ')';
      c.lineWidth = 0.05;
      c.strokeRect(-0.33, -0.43, 0.84, 0.86);
    }
    c.restore();
  }

  function drawVent(c, V, t, hl) {
    const jx = V.rattle > 0 ? (Math.random() - 0.5) * 0.06 * V.rattle : 0;
    const jy = V.rattle > 0 ? (Math.random() - 0.5) * 0.06 * V.rattle : 0;
    const x = V.tx + jx, y = V.ty + jy;
    c.fillStyle = '#0b0d11';
    c.fillRect(x + 0.1, y + 0.1, 0.8, 0.8);
    c.strokeStyle = '#6a7287';
    c.lineWidth = 0.05;
    c.strokeRect(x + 0.1, y + 0.1, 0.8, 0.8);
    c.fillStyle = '#545b6c';
    for (let k = 0; k < 5; k++) c.fillRect(x + 0.16, y + 0.18 + k * 0.14, 0.68, 0.05);
    c.fillStyle = '#7a8296';
    for (const [ox, oy] of [[0.16, 0.16], [0.84, 0.16], [0.16, 0.84], [0.84, 0.84]]) { c.beginPath(); c.arc(x + ox, y + oy, 0.03, 0, TAU); c.fill(); }
    if (hl > 0) {
      c.strokeStyle = 'rgba(180,140,255,' + 0.55 * hl + ')';
      c.lineWidth = 0.05;
      c.strokeRect(x + 0.04, y + 0.04, 0.92, 0.92);
    }
  }

  function drawRelay(c, r, t) {
    const x = r.x, y = r.y;
    c.fillStyle = 'rgba(0,0,0,0.4)';
    c.beginPath(); c.arc(x + 0.06, y + 0.08, 0.5, 0, TAU); c.fill();
    // 八角底座
    c.beginPath();
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * TAU + Math.PI / 8;
      const px = x + Math.cos(a) * 0.48, py = y + Math.sin(a) * 0.48;
      k ? c.lineTo(px, py) : c.moveTo(px, py);
    }
    c.closePath();
    c.fillStyle = '#3d4250';
    c.fill();
    c.strokeStyle = '#7b8299';
    c.lineWidth = 0.04;
    c.stroke();
    // 散热鳍片
    c.strokeStyle = '#262a33';
    c.lineWidth = 0.05;
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * TAU;
      c.beginPath();
      c.moveTo(x + Math.cos(a) * 0.24, y + Math.sin(a) * 0.24);
      c.lineTo(x + Math.cos(a) * 0.4, y + Math.sin(a) * 0.4);
      c.stroke();
    }
    c.fillStyle = '#252933';
    c.beginPath(); c.arc(x, y, 0.22, 0, TAU); c.fill();
    c.fillStyle = r.done ? '#6a5a92' : '#3b4a5a';
    c.beginPath(); c.arc(x, y, 0.14, 0, TAU); c.fill();
  }

  function drawPod(c, P, t) {
    const pr = P.prop;
    const cx = pr.x + 1, cy = pr.y + 1;
    c.save();
    c.translate(cx, cy);
    c.rotate(P.face);
    // 局部：+x 指向舱门方向
    c.fillStyle = 'rgba(0,0,0,0.45)';
    c.beginPath(); c.ellipse(0.06, 0.08, 1.0, 0.92, 0, 0, TAU); c.fill();
    const g = c.createLinearGradient(0, -0.9, 0, 0.9);
    g.addColorStop(0, '#9aa3b8');
    g.addColorStop(0.5, '#cfd5e2');
    g.addColorStop(1, '#7c8498');
    c.fillStyle = g;
    c.beginPath(); c.ellipse(-0.05, 0, 0.92, 0.86, 0, 0, TAU); c.fill();
    c.strokeStyle = '#4a5164';
    c.lineWidth = 0.05;
    c.stroke();
    // 舱窗
    c.fillStyle = '#1b2132';
    c.beginPath(); c.ellipse(-0.22, 0, 0.36, 0.42, 0, 0, TAU); c.fill();
    c.fillStyle = 'rgba(180,200,255,0.25)';
    c.beginPath(); c.ellipse(-0.3, -0.12, 0.12, 0.16, -0.4, 0, TAU); c.fill();
    // 舱门
    c.fillStyle = '#5b6377';
    c.fillRect(0.62, -0.42, 0.26, 0.84);
    c.fillStyle = '#3a4050';
    c.fillRect(0.7, -0.34, 0.1, 0.68);
    stripes(c, 0.5, -0.86, 0.12, 1.72, 0.85);
    c.restore();
  }

  function drawPlayer(c, p, t, g) {
    if (p.hidden || p.vent) return;
    if (g.ending && g.ending.type === 'win' && g.ending.t > 0.15) return; // 已登舱
    c.save();
    c.translate(p.x, p.y);
    c.fillStyle = 'rgba(0,0,0,0.4)';
    c.beginPath(); c.ellipse(0.04, 0.06, 0.32, 0.28, 0, 0, TAU); c.fill();
    c.rotate(p.aim);
    const bob = Math.sin(t * (p.sprinting ? 16 : 10)) * Math.min(1, p.speed / 3) * 0.03;
    c.translate(0, bob);
    c.fillStyle = '#4d5366';
    c.fillRect(-0.29, -0.15, 0.15, 0.3);
    c.fillStyle = '#b8bccb';
    c.beginPath(); c.ellipse(-0.02, 0, 0.19, 0.25, 0, 0, TAU); c.fill();
    c.fillStyle = '#8d7bc4';
    c.fillRect(-0.12, -0.24, 0.05, 0.48);
    c.fillStyle = '#dcdfe8';
    c.beginPath(); c.arc(0.04, 0, 0.155, 0, TAU); c.fill();
    c.fillStyle = '#231e36';
    c.beginPath(); c.ellipse(0.1, 0, 0.075, 0.115, 0, 0, TAU); c.fill();
    c.fillStyle = 'rgba(220,210,255,0.55)';
    c.beginPath(); c.ellipse(0.12, -0.05, 0.022, 0.04, 0.3, 0, TAU); c.fill();
    // 手电
    c.fillStyle = '#7c8296';
    c.fillRect(0.1, 0.12, 0.2, 0.065);
    c.restore();
  }

  function drawWarden(c, w, t, g) {
    const f = w.face;
    const chase = w.state === 'chase' || w.state === 'openLocker';
    const wind = w.windup > 0 ? 1 : 0, dash = w.dash > 0 ? 1 : 0;
    c.save();
    c.translate(w.x, w.y);
    c.fillStyle = 'rgba(0,0,0,0.5)';
    c.beginPath(); c.ellipse(0.02, 0.07, 0.66, 0.5, f, 0, TAU); c.fill();
    c.rotate(f);
    // 破布般的身躯
    c.beginPath();
    const N = 26;
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * TAU;
      const back = Math.max(0, -Math.cos(a));
      const tat = back * (0.1 + 0.11 * Math.sin(i * 2.7 + t * 5 + w.gait)) + back * back * 0.12;
      const px = Math.cos(a) * (0.3 + tat * 1.7), py = Math.sin(a) * (0.42 + tat * 0.25);
      i ? c.lineTo(px, py) : c.moveTo(px, py);
    }
    c.closePath();
    c.fillStyle = '#2a2633';
    c.fill();
    c.strokeStyle = '#4a4458';
    c.lineWidth = 0.03;
    c.stroke();
    c.fillStyle = '#17151d';
    c.beginPath(); c.ellipse(0.0, 0, 0.22, 0.33, 0, 0, TAU); c.fill();
    // 衣褶
    c.strokeStyle = 'rgba(120,110,140,0.35)';
    c.lineWidth = 0.02;
    for (let k = -2; k <= 2; k++) { c.beginPath(); c.moveTo(-0.05, k * 0.09); c.quadraticCurveTo(-0.3, k * 0.13, -0.5 - Math.abs(k) * 0.02, k * 0.16 + Math.sin(t * 4 + k) * 0.03); c.stroke(); }
    // 脊背
    c.strokeStyle = '#2a2733';
    c.lineWidth = 0.035;
    c.beginPath(); c.moveTo(-0.22, 0); c.lineTo(0.12, 0); c.stroke();
    // 长臂
    const reach = dash ? 1.3 : wind ? -0.2 : chase ? 1 : 0.35;
    for (const s of [-1, 1]) {
      const sw = Math.sin(w.gait + (s > 0 ? 0 : Math.PI)) * 0.22 * (1 - Math.min(1, reach) * 0.5);
      const sx = 0.04, sy = s * 0.36;
      const spread = wind ? 0.32 : 0;
      const ex = sx + 0.3 + reach * 0.16 + sw * 0.25, ey = s * (0.52 + spread - reach * 0.06);
      const hx = ex + 0.34 + reach * 0.26 + sw * 0.3, hy = s * (0.44 + spread * 1.4 - reach * 0.2) + sw * 0.12;
      c.strokeStyle = '#353140';
      c.lineWidth = 0.075;
      c.lineCap = 'round';
      c.lineJoin = 'round';
      c.beginPath(); c.moveTo(sx, sy); c.lineTo(ex, ey); c.lineTo(hx, hy); c.stroke();
      c.strokeStyle = '#3a3646';
      c.lineWidth = 0.025;
      c.stroke();
      c.strokeStyle = '#2f2c38';
      c.lineWidth = 0.028;
      const ha = Math.atan2(hy - ey, hx - ex);
      for (let k = -1; k <= 1; k++) {
        const fa = ha + k * 0.38 + s * 0.12;
        c.beginPath();
        c.moveTo(hx, hy);
        c.quadraticCurveTo(hx + Math.cos(fa) * 0.14, hy + Math.sin(fa) * 0.14, hx + Math.cos(fa + s * 0.25) * 0.24, hy + Math.sin(fa + s * 0.25) * 0.24);
        c.stroke();
      }
    }
    // 头与提灯
    c.fillStyle = '#16141b';
    c.beginPath(); c.ellipse(0.25, 0, 0.13, 0.105, 0, 0, TAU); c.fill();
    const bob = Math.sin(t * 2.3) * 0.035;
    c.strokeStyle = '#3a3646';
    c.lineWidth = 0.03;
    c.beginPath(); c.moveTo(0.3, 0); c.quadraticCurveTo(0.44, -0.14 + bob, 0.52, bob); c.stroke();
    c.fillStyle = '#2b2631';
    c.beginPath(); c.arc(0.52, bob, 0.08, 0, TAU); c.fill();
    c.restore();
  }
  R.eyePos = function (w, t) {
    const bob = Math.sin(t * 2.3) * 0.035;
    const c = Math.cos(w.face), s = Math.sin(w.face);
    return { x: w.x + c * 0.52 - s * bob, y: w.y + s * 0.52 + c * bob };
  };

  /* =========================================================
     光照
     ========================================================= */
  function flickerK(L, t, g) {
    const n = U.noise1(t * 7 + L.ph, L.sd);
    let k;
    switch (L.mode) {
      case 'pulse': k = 0.7 + 0.3 * Math.sin(t * 1.7 + L.ph); break;
      case 'flicker': k = n < 0.22 ? 0.12 + n : 0.86 + 0.14 * U.noise1(t * 21 + L.ph, L.sd + 1); break;
      case 'broken': {
        const b = U.noise1(t * 1.6 + L.ph, L.sd + 2);
        k = b > 0.8 ? (U.noise1(t * 34, L.sd) > 0.45 ? 0.95 : 0.1) : 0.03;
        break;
      }
      case 'alarm': k = g && g.podUnlocked ? 0.35 + 0.75 * Math.abs(Math.sin(t * 3.2)) : 0.55 + 0.1 * Math.sin(t * 1.3); break;
      default: k = 0.96 + 0.04 * n;
    }
    if (g && g.podUnlocked && L.fixture) k = 0.25 + 0.85 * Math.abs(Math.sin(t * 2.6 + L.ph * 0.2));
    // 守夜者经过时，电路受到干扰
    if (g && g.warden) {
      const d = Math.hypot(g.warden.x - L.x, g.warden.y - L.y);
      if (d < 4.5) k *= 0.35 + 0.65 * (U.noise1(t * 26 + L.ph, L.sd + 3) > 0.5 ? 1 : 0.2) * (d / 4.5);
    }
    return k;
  }

  function fillPoly(c, pts, n, withOrigin, ox, oy) {
    c.beginPath();
    if (withOrigin) { c.moveTo(ox, oy); for (let i = 0; i < n; i++) c.lineTo(pts[i * 2], pts[i * 2 + 1]); }
    else { c.moveTo(pts[0], pts[1]); for (let i = 1; i < n; i++) c.lineTo(pts[i * 2], pts[i * 2 + 1]); }
    c.closePath();
    c.fill();
  }
  function radial(c, x, y, r, col, a, mid) {
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    const m = mid || 0.45;
    g.addColorStop(0, rgba(col, a));
    g.addColorStop(m, rgba(col, a * 0.45));
    g.addColorStop(Math.min(0.95, m + (1 - m) * 0.55), rgba(col, a * 0.12));
    g.addColorStop(1, rgba(col, 0));
    return g;
  }

  // 手电射线（考虑守夜者身体遮挡）
  function castFlash(M, p, w, n, buf, half, range) {
    const a0 = p.aim - half, span = half * 2;
    const ox = p.x + Math.cos(p.aim) * 0.2, oy = p.y + Math.sin(p.aim) * 0.2;
    const wr = 0.3;
    for (let i = 0; i <= n; i++) {
      const a = a0 + (span * i) / n, dx = Math.cos(a), dy = Math.sin(a);
      let d = M.rayDist(ox, oy, dx, dy, range, 0.3, R.flashVisit);
      if (w) {
        const fx = ox - w.x, fy = oy - w.y;
        const b = fx * dx + fy * dy, cc = fx * fx + fy * fy - wr * wr;
        const disc = b * b - cc;
        if (disc >= 0) {
          const tc = -b - Math.sqrt(disc);
          if (tc > 0 && tc + 0.85 < d) d = tc + 0.85;
        }
      }
      buf[i * 2] = ox + dx * d;
      buf[i * 2 + 1] = oy + dy * d;
    }
    return { n: n + 1, ox, oy };
  }

  /* =========================================================
     主绘制
     ========================================================= */
  R.draw = function (g, dt, now, opts) {
    const t0 = performance.now();
    opts = opts || {};
    const M = g.map;
    R.setMap(M);
    const ctx = R.ctx, Q = QUAL[R.q];
    const p = g.player, w = g.warden;
    const t = g.t;
    const attract = g.attract;
    R.stamp++;
    const stamp = R.stamp;

    /* ---- 相机 ---- */
    let viewer, camT;
    if (attract) {
      const e = R.eyePos(w, t);
      viewer = { x: w.x, y: w.y, r: 15 };
      // 让它出现在标题文字旁边，而不是被字挡住
      const portrait = R.ch > R.cw;
      const offX = portrait ? 0 : (R.cw * 0.27) / R.TS, offY = portrait ? (R.ch * 0.3) / R.TS : 0;
      camT = { x: w.x + Math.cos(w.face) * 1.2 - offX, y: w.y + Math.sin(w.face) * 1.2 - offY };
    } else if (p.hidden && p.hidden.cx != null) {
      const L = p.hidden;
      viewer = { x: L.x + 0.5 + Math.cos(L.dir) * 0.62, y: L.y + 0.5 + Math.sin(L.dir) * 0.62, r: 16, cone: L.dir, span: 2.6 };
      camT = { x: L.cx + Math.cos(L.dir) * 1.6, y: L.cy + Math.sin(L.dir) * 1.6 };
    } else if (p.vent) {
      viewer = { x: p.x, y: p.y, r: 1.2 };
      camT = { x: p.x, y: p.y };
    } else {
      viewer = { x: p.x, y: p.y, r: 17 };
      const look = R.mobile ? 1.5 : 2.2;
      camT = { x: p.x + Math.cos(p.aim) * look, y: p.y + Math.sin(p.aim) * look };
      if (g.ending && g.ending.type === 'caught') camT = { x: (p.x + w.x) / 2, y: (p.y + w.y) / 2 };
    }
    if (opts.snap || !R.camInit) { R.cam.x = camT.x; R.cam.y = camT.y; R.camInit = true; }
    const ck = 1 - Math.exp(-dt * (attract ? 1.6 : 5));
    R.cam.x += (camT.x - R.cam.x) * ck;
    R.cam.y += (camT.y - R.cam.y) * ck;
    R.shake = Math.max(0, R.shake - dt * 2.2);
    const shk = R.shake * R.shake * 0.5 + (opts.shake || 0);
    R.cam.sx = shk ? (Math.random() - 0.5) * shk * R.TS : 0;
    R.cam.sy = shk ? (Math.random() - 0.5) * shk * R.TS : 0;

    const TS = R.TS, dpr = R.dpr, cw = R.cw, ch = R.ch;
    const halfW = cw / 2 / TS + 1.5, halfH = ch / 2 / TS + 1.5;
    const vx0 = R.cam.x - halfW, vx1 = R.cam.x + halfW, vy0 = R.cam.y - halfH, vy1 = R.cam.y + halfH;
    const inView = (x, y, m) => x > vx0 - m && x < vx1 + m && y > vy0 - m && y < vy1 + m;

    /* ---- 视线（迷雾） ---- */
    const vis = R.vis, explored = M.explored;
    const W = M.W;
    const losVisit = (i, d) => { vis[i] = stamp; if (d < 6.5) explored[i] = 1; };
    R.flashVisit = (i, d) => { vis[i] = stamp; explored[i] = 1; };
    let losN;
    const vtx = Math.floor(viewer.x), vty = Math.floor(viewer.y);
    if (M.inb(vtx, vty)) vis[M.I(vtx, vty)] = stamp;
    if (viewer.cone != null) {
      const n = Math.round(Q.los * 0.45);
      losN = M.visPoly(viewer.x, viewer.y, viewer.cone - viewer.span / 2, viewer.span, n, viewer.r, 0.32, R.losBuf, losVisit);
    } else {
      losN = M.visPoly(viewer.x, viewer.y, 0, TAU, Q.los, viewer.r, 0.32, R.losBuf, attract ? (i, d) => (vis[i] = stamp) : losVisit);
    }
    const seen = (x, y) => {
      const tx = Math.floor(x), ty = Math.floor(y);
      return M.inb(tx, ty) && vis[ty * W + tx] === stamp;
    };

    /* ---- 手电 ---- */
    const torchOn = !attract && p.torch && !p.hidden && !p.vent;
    let flash = null;
    let torchK = 1;
    if (torchOn) {
      // 守夜者靠近时手电闪烁
      const wd = Math.hypot(w.x - p.x, w.y - p.y);
      if (wd < 7.5 && w.state !== 'stunned') {
        const k = 1 - wd / 7.5;
        const n = U.noise1(t * 18, 5);
        if (n < k * 0.55) torchK = 0.25 + n;
      }
      if (g.ending) torchK *= g.ending.type === 'caught' ? Math.max(0, 1 - g.ending.t) : 1;
      flash = castFlash(M, p, w.state !== 'grab' ? w : null, Q.flash, R.flashBuf, PL.flashHalf, PL.flashRange);
    }

    /* ---- 守夜者光束 ---- */
    let beam = null;
    const wvis = Math.hypot(w.x - R.cam.x, w.y - R.cam.y) < 26;
    const eye = R.eyePos(w, t);
    const beamK = Math.min(1.4, w.eyeK) * (w.state === 'stunned' ? 0.2 : 1);
    if (wvis && beamK > 0.05) {
      const ba = w.face + w.look;
      const half = g.D.half * (w.state === 'chase' ? 0.85 : 1);
      let ex = eye.x, ey = eye.y;
      if (M.solid(Math.floor(ex), Math.floor(ey)) && M.opq[M.I(Math.floor(ex), Math.floor(ey))]) { ex = w.x; ey = w.y; }
      const n = M.visPoly(ex, ey, ba - half, half * 2, Q.beam, g.D.vision * (w.state === 'chase' ? 1.1 : 1), 0.3, R.beamBuf, null);
      beam = { n, ex, ey, ba };
    }

    /* ---- 场景层 ---- */
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, R.cv.width, R.cv.height);
    const k = TS * dpr;
    const ox = (cw / 2 + R.cam.sx) * dpr - R.cam.x * k, oy = (ch / 2 + R.cam.sy) * dpr - R.cam.y * k;
    ctx.setTransform(k, 0, 0, k, ox, oy);
    ctx.imageSmoothingEnabled = true;
    const budget = { n: opts.snap ? 999 : 3 };
    const cx0 = Math.max(0, Math.floor(vx0 / CHK)), cx1 = Math.min(Math.ceil(M.W / CHK) - 1, Math.floor(vx1 / CHK));
    const cy0 = Math.max(0, Math.floor(vy0 / CHK)), cy1 = Math.min(Math.ceil(M.H / CHK) - 1, Math.floor(vy1 / CHK));
    // 先画离视点近的区块
    const order = [];
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) order.push([cx, cy, Math.hypot(cx * CHK + 4 - viewer.x, cy * CHK + 4 - viewer.y)]);
    order.sort((a, b) => a[2] - b[2]);
    for (const [cx, cy] of order) {
      const c = getChunk(cx, cy, budget);
      if (c) ctx.drawImage(c, cx * CHK, cy * CHK, CHK + 0.01, CHK + 0.01);
    }
    // 区块缓存上限：丢掉离相机最远的
    const cap = R.mobile ? 30 : 44;
    if (R.chunks.size > cap) {
      const arr = [];
      for (const key of R.chunks.keys()) { const kx = Math.floor(key / 1000), ky = key % 1000; arr.push([key, Math.hypot(kx * CHK + 4 - R.cam.x, ky * CHK + 4 - R.cam.y)]); }
      arr.sort((a, b) => b[1] - a[1]);
      for (let i = 0; i < R.chunks.size - cap + 4 && i < arr.length; i++) R.chunks.delete(arr[i][0]);
    }

    // 动态物体
    const ctxObj = p.ctx ? p.ctx.obj : null;
    const hl = 0.6 + 0.4 * Math.sin(now * 0.006);
    for (const d of M.doors) if (inView(d.x, d.y, 2)) drawDoor(ctx, d);
    for (const L of M.lockers) if (inView(L.x, L.y, 2)) drawLocker(ctx, L, t, ctxObj === L ? hl : 0);
    for (const V of M.vents) if (inView(V.x, V.y, 2)) drawVent(ctx, V, t, ctxObj === V ? hl : 0);
    for (const r of M.relays) if (inView(r.x, r.y, 2)) drawRelay(ctx, r, t);
    if (inView(M.pod.cx, M.pod.cy, 3)) drawPod(ctx, M.pod, t);
    for (const f of g.flares) {
      if (!inView(f.x, f.y, 2)) continue;
      ctx.save();
      ctx.translate(f.x, f.y - f.h * 0.6);
      ctx.rotate(f.lit ? f.seed : f.rot);
      ctx.fillStyle = f.burn >= f.life ? '#2a2422' : '#b8382c';
      ctx.fillRect(-0.16, -0.04, 0.32, 0.08);
      ctx.fillStyle = '#e8d8c8';
      ctx.fillRect(-0.16, -0.04, 0.07, 0.08);
      ctx.restore();
    }
    // 尘埃（只有被照亮时才看得见）
    R.updateDust(dt, viewer, Q.dust);
    ctx.fillStyle = 'rgba(235,230,255,0.75)';
    for (const m of R.dust) {
      const tw = 0.5 + 0.5 * Math.sin(now * 0.002 * m.sp + m.ph);
      ctx.globalAlpha = 0.25 + 0.6 * tw;
      ctx.fillRect(m.x, m.y, m.s, m.s);
    }
    ctx.globalAlpha = 1;
    if (!attract) drawPlayer(ctx, p, t, g);
    if (w.state !== 'gone') drawWarden(ctx, w, t, g);

    /* ---- 光照图 ---- */
    const L = R.lctx, lw = R.light.width, lh = R.light.height;
    const ls = TS * Q.ls;
    L.setTransform(1, 0, 0, 1, 0, 0);
    L.globalCompositeOperation = 'source-over';
    L.fillStyle = attract ? 'rgb(14,15,24)' : 'rgb(9,10,17)';
    L.fillRect(0, 0, lw, lh);
    L.setTransform(ls, 0, 0, ls, lw / 2 + (R.cam.sx * Q.ls) - R.cam.x * ls, lh / 2 + (R.cam.sy * Q.ls) - R.cam.y * ls);
    L.globalCompositeOperation = 'lighter';
    // 静态灯
    for (const S of M.lights) {
      if (!inView(S.x, S.y, S.r + 1)) continue;
      const kk = S.k * flickerK(S, t, g);
      if (kk < 0.02) continue;
      L.fillStyle = radial(L, S.x, S.y, S.r, S.col, Math.min(1, kk), 0.4);
      fillPoly(L, S.poly, S.np, false);
    }
    // 信标
    for (const r of M.relays) {
      if (!inView(r.x, r.y, 5)) continue;
      let col, rad, kk;
      if (r.done) { col = [176, 132, 255]; rad = 4.2; kk = 0.78 + 0.08 * Math.sin(t * 2 + r.id); }
      else {
        const working = p.restoring === r || (p.calib && p.calib.relay === r);
        col = [110, 196, 255]; rad = 1.6 + r.progress * 1.6 + (working ? 0.6 : 0);
        kk = 0.28 + 0.12 * Math.sin(t * 3 + r.id) + r.progress * 0.3 + (working ? 0.2 : 0);
      }
      L.fillStyle = radial(L, r.x, r.y, rad, col, kk, 0.35);
      fillPoly(L, r.poly, r.np, false);
    }
    // 逃生舱
    {
      const P = M.pod;
      if (inView(P.cx, P.cy, 6)) {
        const col = P.unlocked ? [90, 255, 170] : [255, 80, 60];
        const kk = P.unlocked ? 0.75 + 0.2 * Math.sin(t * 4) : 0.35;
        L.fillStyle = radial(L, P.hx, P.hy, 4.5, col, kk, 0.35);
        fillPoly(L, P.poly, P.np, false);
      }
    }
    // 照明弹
    for (const f of g.flares) {
      if (!f.lit || f.burn >= f.life || !inView(f.x, f.y, 7)) continue;
      if (!f.poly) { f.poly = new Float32Array(2 * 97); f.np = M.visPoly(f.x, f.y, 0, TAU, 96, 6, 0.3, f.poly, null); }
      const life = f.burn < 0.3 ? 1.6 - f.burn * 2 : f.burn > f.life - 1.2 ? (f.life - f.burn) / 1.2 : 1;
      const fk = (0.82 + 0.18 * U.noise1(t * 15 + f.seed, 9)) * life;
      L.fillStyle = radial(L, f.x, f.y, 6, [255, 92, 60], Math.min(1, fk), 0.35);
      fillPoly(L, f.poly, f.np, false);
    }
    // 瞬间闪光
    for (const F of g.flashes) {
      if (!F.poly) { F.poly = new Float32Array(2 * 65); F.np = M.visPoly(F.x, F.y, 0, TAU, 64, F.r, 0.3, F.poly, null); }
      const a = F.k * (1 - F.t / F.life);
      L.fillStyle = radial(L, F.x, F.y, F.r, F.col, Math.min(1, a), 0.3);
      fillPoly(L, F.poly, F.np, false);
    }
    // 守夜者的提灯光束
    if (beam) {
      const susp = w.state === 'chase' || w.state === 'openLocker' ? 1 : w.susp;
      const col = susp >= 1 ? [255, 64, 46] : susp > 0.4 ? [255, 150, 70] : [255, 205, 130];
      L.fillStyle = radial(L, beam.ex, beam.ey, g.D.vision * 1.1, col, 0.78 * beamK, 0.5);
      fillPoly(L, R.beamBuf, beam.n, true, beam.ex, beam.ey);
      L.fillStyle = radial(L, beam.ex, beam.ey, 1.3, col, 0.5 * beamK, 0.5);
      L.beginPath(); L.arc(beam.ex, beam.ey, 1.3, 0, TAU); L.fill();
    }
    // 工程师：宇航服灯 + 手电
    if (!attract) {
      if (!p.hidden && !p.vent) {
        L.fillStyle = radial(L, p.x, p.y, 2.5, [130, 120, 210], 0.42, 0.4);
        fillPoly(L, R.losBuf, losN, false);
      } else if (p.hidden && p.hidden.cx != null) {
        L.fillStyle = radial(L, viewer.x, viewer.y, 1.6, [90, 80, 150], 0.3, 0.4);
        fillPoly(L, R.losBuf, losN, true, viewer.x, viewer.y);
      }
      if (flash) {
        const tk = torchK;
        L.fillStyle = radial(L, flash.ox, flash.oy, PL.flashRange, [255, 238, 210], 0.62 * tk, 0.58);
        fillPoly(L, R.flashBuf, flash.n, true, flash.ox, flash.oy);
        // 内圈更亮
        const n = flash.n, a = Math.floor(n * 0.28), b = Math.ceil(n * 0.72);
        L.beginPath();
        L.moveTo(flash.ox, flash.oy);
        for (let i = a; i < b; i++) L.lineTo(R.flashBuf[i * 2], R.flashBuf[i * 2 + 1]);
        L.closePath();
        L.fillStyle = radial(L, flash.ox, flash.oy, PL.flashRange * 0.92, [255, 244, 225], 0.62 * tk, 0.6);
        L.fill();
      }
    }
    // 视线遮罩
    L.globalCompositeOperation = 'destination-in';
    L.fillStyle = '#fff';
    if (viewer.cone != null) fillPoly(L, R.losBuf, losN, true, viewer.x, viewer.y);
    else fillPoly(L, R.losBuf, losN, false);
    L.globalCompositeOperation = 'destination-over';
    L.setTransform(1, 0, 0, 1, 0, 0);
    L.fillStyle = '#000';
    L.fillRect(0, 0, lw, lh);
    L.globalCompositeOperation = 'source-over';

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'multiply';
    ctx.drawImage(R.light, 0, 0, R.cv.width, R.cv.height);
    // 体积光雾（最低档省掉这一遍全屏绘制）
    if (Q.haze) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = attract ? 0.16 : 0.11;
      ctx.drawImage(R.light, 0, 0, R.cv.width, R.cv.height);
      ctx.globalAlpha = 1;
    }
    ctx.globalCompositeOperation = 'source-over';

    /* ---- 记忆中的轮廓 ---- */
    ctx.setTransform(k, 0, 0, k, ox, oy);
    if (!attract) {
      for (let pass = 0; pass < 2; pass++) {
        ctx.beginPath();
        for (let cy = cy0; cy <= cy1; cy++) {
          for (let cx = cx0; cx <= cx1; cx++) {
            const E = R.memEdges[cy * R.memCols + cx];
            if (!E) continue;
            for (let j = 0; j < E.length; j += 5) {
              const ti = E[j + 4];
              if (!explored[ti] || (vis[ti] === stamp) !== (pass === 1)) continue;
              ctx.moveTo(E[j], E[j + 1]);
              ctx.lineTo(E[j + 2], E[j + 3]);
            }
          }
        }
        ctx.strokeStyle = pass ? 'rgba(170,150,240,0.11)' : 'rgba(150,140,220,0.22)';
        ctx.lineWidth = 0.05;
        ctx.stroke();
      }
    }

    /* ---- 自发光 ---- */
    ctx.globalCompositeOperation = 'lighter';
    // 窗外星空
    {
      if (!R.starPat) R.starPat = ctx.createPattern(R.stars, 'repeat');
      for (let y = Math.floor(vy0); y <= vy1; y++) {
        for (let x = Math.floor(vx0); x <= vx1; x++) {
          if (!M.inb(x, y)) continue;
          const i = y * W + x;
          if (!M.win[i] || vis[i] !== stamp) continue;
          const fl = (dx, dy) => M.inb(x + dx, y + dy) && isFloorT(M.tile[M.I(x + dx, y + dy)]);
          const horiz = fl(0, 1) || fl(0, -1);
          ctx.save();
          ctx.beginPath();
          if (horiz) ctx.rect(x, y + 0.24, 1, 0.52); else ctx.rect(x + 0.24, y, 0.52, 1);
          ctx.clip();
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.globalAlpha = 0.85;
          ctx.fillStyle = R.starPat;
          ctx.fillRect(0, 0, R.cv.width, R.cv.height);
          ctx.restore();
        }
      }
      ctx.globalAlpha = 1;
    }
    // 应急灯灯罩
    for (const S of M.lights) {
      if (!S.fixture || !inView(S.x, S.y, 1) || !seen(S.x, S.y)) continue;
      const kk = S.k * flickerK(S, t, g);
      // 坏掉的灯：闪亮的瞬间迸出火花
      if (S.mode === 'broken' && kk > 0.4 && Math.random() < dt * 5 && !g.attract) {
        g.burst(S.x, S.y, 4, 1, 2.2);
        if (!S.zapT || t - S.zapT > 0.5) { S.zapT = t; g.emit('zap', { x: S.x, y: S.y }); }
      }
      if (kk < 0.05) continue;
      ctx.fillStyle = radial(ctx, S.x + S.wall[0] * 0.08, S.y + S.wall[1] * 0.08, 0.5, S.col, Math.min(1, kk * 1.2), 0.25);
      ctx.beginPath(); ctx.arc(S.x + S.wall[0] * 0.08, S.y + S.wall[1] * 0.08, 0.5, 0, TAU); ctx.fill();
      ctx.fillStyle = rgba([255, 220, 210], Math.min(1, kk * 1.3));
      if (S.wall[0]) ctx.fillRect(S.x + S.wall[0] * 0.1 - 0.04, S.y - 0.16, 0.08, 0.32);
      else ctx.fillRect(S.x - 0.16, S.y + S.wall[1] * 0.1 - 0.04, 0.32, 0.08);
    }
    // 控制台屏幕
    for (const pr of M.props) {
      if ((pr.kind !== 'console' && !(pr.kind === 'table' && pr.screen)) || !inView(pr.x, pr.y, 1)) continue;
      const sx = pr.kind === 'console' ? pr.x + 0.5 : pr.x + pr.w / 2, sy = pr.kind === 'console' ? pr.y + 0.38 : pr.y + pr.h / 2;
      if (!seen(sx, sy)) continue;
      const fl = U.noise1(t * 3 + pr.s * 50, 4);
      ctx.fillStyle = rgba([90, 180, 255], 0.22 + fl * 0.18);
      if (pr.kind === 'console') ctx.fillRect(pr.x + 0.18, pr.y + 0.18, 0.64, 0.4);
      else ctx.fillRect(sx - 0.3, sy - 0.18, 0.6, 0.36);
      ctx.fillStyle = rgba([180, 230, 255], 0.35);
      const lines = 3;
      for (let l = 0; l < lines; l++) {
        const ww = 0.15 + U.hash2(l, Math.floor(t * 2 + pr.s * 9), 5) * 0.4;
        if (pr.kind === 'console') ctx.fillRect(pr.x + 0.22, pr.y + 0.24 + l * 0.1, ww, 0.04);
      }
    }
    // 门状态灯
    for (const d of M.doors) {
      if (!inView(d.x, d.y, 2)) continue;
      const col = d.open > 0.6 ? [80, 255, 150] : [255, 70, 50];
      // 只画朝向观察者那一面的指示灯
      const sb = d.axis === 'x' ? (viewer.x < d.x ? -1 : 1) : viewer.y < d.y ? -1 : 1;
      for (const sa of [-1, 1]) {
        const px = d.axis === 'x' ? d.x + sb * 0.4 : d.x + sa * 1.08;
        const py = d.axis === 'x' ? d.y + sa * 1.08 : d.y + sb * 0.4;
        if (!seen(px, py)) continue;
        ctx.fillStyle = rgba(col, 0.9);
        ctx.fillRect(px - 0.045, py - 0.045, 0.09, 0.09);
        ctx.fillStyle = radial(ctx, px, py, 0.28, col, 0.35, 0.3);
        ctx.fillRect(px - 0.28, py - 0.28, 0.56, 0.56);
      }
    }
    // 信标核心
    for (const r of M.relays) {
      if (!inView(r.x, r.y, 2) || !seen(r.x, r.y)) continue;
      const working = p.restoring === r || (p.calib && p.calib.relay === r);
      if (r.done) {
        const pul = 0.75 + 0.25 * Math.sin(t * 2.4 + r.id);
        ctx.fillStyle = radial(ctx, r.x, r.y, 0.8, [190, 150, 255], 0.9 * pul, 0.3);
        ctx.beginPath(); ctx.arc(r.x, r.y, 0.8, 0, TAU); ctx.fill();
        ctx.fillStyle = rgba([240, 230, 255], 0.95);
        ctx.beginPath(); ctx.arc(r.x, r.y, 0.09, 0, TAU); ctx.fill();
        // 旋转的光环
        ctx.strokeStyle = rgba([200, 170, 255], 0.55);
        ctx.lineWidth = 0.035;
        ctx.beginPath(); ctx.arc(r.x, r.y, 0.36, t * 1.5, t * 1.5 + 4.2); ctx.stroke();
      } else {
        const pul = 0.5 + 0.5 * Math.sin(t * (working ? 9 : 3) + r.id);
        ctx.fillStyle = radial(ctx, r.x, r.y, 0.55, [120, 200, 255], 0.35 + pul * 0.3 + r.progress * 0.3, 0.3);
        ctx.beginPath(); ctx.arc(r.x, r.y, 0.55, 0, TAU); ctx.fill();
        if (r.progress > 0) {
          ctx.strokeStyle = rgba([196, 160, 255], 0.95);
          ctx.lineWidth = 0.07;
          ctx.beginPath(); ctx.arc(r.x, r.y, 0.62, -Math.PI / 2, -Math.PI / 2 + r.progress * TAU); ctx.stroke();
          ctx.strokeStyle = rgba([196, 160, 255], 0.2);
          ctx.beginPath(); ctx.arc(r.x, r.y, 0.62, 0, TAU); ctx.stroke();
        }
        if (t - r.sparkT < 0.6) {
          ctx.fillStyle = radial(ctx, r.x, r.y, 1.4, [255, 230, 180], (0.6 - (t - r.sparkT)) * 1.4, 0.2);
          ctx.beginPath(); ctx.arc(r.x, r.y, 1.4, 0, TAU); ctx.fill();
        }
      }
    }
    // 逃生舱状态灯
    {
      const P = M.pod;
      if (inView(P.cx, P.cy, 3) && seen(P.hx, P.hy)) {
        const col = P.unlocked ? [90, 255, 170] : [255, 70, 50];
        const bl = P.unlocked ? 0.7 + 0.3 * Math.sin(t * 6) : 0.55 + 0.45 * (Math.sin(t * 2) > 0 ? 1 : 0.3);
        const lx = P.hx + Math.cos(P.face) * 0.1, ly = P.hy + Math.sin(P.face) * 0.1;
        ctx.fillStyle = radial(ctx, lx, ly, 0.9, col, 0.8 * bl, 0.25);
        ctx.beginPath(); ctx.arc(lx, ly, 0.9, 0, TAU); ctx.fill();
      }
    }
    // 逃生舱点火
    if (g.ending && g.ending.type === 'win') {
      const P = M.pod, k3 = Math.min(1, g.ending.t / 1.2);
      const bx = P.cx - Math.cos(P.face) * 1.2, by = P.cy - Math.sin(P.face) * 1.2;
      ctx.fillStyle = radial(ctx, bx, by, 2.5 + k3 * 3, [200, 170, 255], 0.5 + k3 * 0.5, 0.25);
      ctx.beginPath(); ctx.arc(bx, by, 2.5 + k3 * 3, 0, TAU); ctx.fill();
      ctx.fillStyle = radial(ctx, P.cx, P.cy, 1.6, [120, 255, 190], 0.6 * k3, 0.3);
      ctx.beginPath(); ctx.arc(P.cx, P.cy, 1.6, 0, TAU); ctx.fill();
    }
    // 照明弹火焰
    for (const f of g.flares) {
      if (f.burn >= f.life || !inView(f.x, f.y, 2)) continue;
      if (!f.lit && !seen(f.x, f.y)) continue;
      if (f.lit && !seen(f.x, f.y)) continue;
      const fk = f.lit ? 0.8 + 0.2 * U.noise1(t * 20 + f.seed, 3) : 0.5;
      const fx = f.x + Math.cos(f.seed) * 0.16, fy = f.y - f.h * 0.6 + Math.sin(f.seed) * 0.16;
      ctx.fillStyle = radial(ctx, fx, fy, f.lit ? 0.9 : 0.4, [255, 120, 80], fk, 0.2);
      ctx.beginPath(); ctx.arc(fx, fy, f.lit ? 0.9 : 0.4, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(255,240,220,' + fk + ')';
      ctx.beginPath(); ctx.arc(fx, fy, 0.07, 0, TAU); ctx.fill();
    }
    // 火花
    for (const s of g.sparks) {
      if (!seen(s.x, s.y)) continue;
      const a = 1 - s.t / s.life;
      ctx.strokeStyle = s.col === 2 ? 'rgba(255,150,90,' + a + ')' : 'rgba(255,230,170,' + a + ')';
      ctx.lineWidth = 0.035;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(s.x - s.vx * 0.04, s.y - s.vy * 0.04);
      ctx.stroke();
    }
    // 守夜者之眼
    if (seen(eye.x, eye.y) || seen(w.x, w.y)) {
      const susp = w.state === 'chase' || w.state === 'openLocker' || w.state === 'grab' ? 1 : w.susp;
      const col = susp >= 1 ? [255, 70, 50] : susp > 0.4 ? [255, 150, 70] : [255, 205, 130];
      const ek = Math.min(2.4, w.eyeK);
      const big = g.ending && g.ending.type === 'caught' ? 1 + Math.min(2.6, g.ending.t * 1.6) : 1;
      const rr = 0.85 * ek * big;
      ctx.fillStyle = radial(ctx, eye.x, eye.y, rr, col, Math.min(1, 0.75 * ek), 0.22);
      ctx.beginPath(); ctx.arc(eye.x, eye.y, rr, 0, TAU); ctx.fill();
      // 横向镜头光晕
      ctx.save();
      ctx.translate(eye.x, eye.y);
      ctx.scale(1, 0.06);
      ctx.fillStyle = radial(ctx, 0, 0, 1.9 * ek * big, col, 0.4 * ek, 0.3);
      ctx.beginPath(); ctx.arc(0, 0, 1.9 * ek * big, 0, TAU); ctx.fill();
      ctx.restore();
      ctx.fillStyle = rgba([255, 245, 225], Math.min(1, 0.9 * ek));
      ctx.beginPath(); ctx.arc(eye.x, eye.y, 0.065 * Math.max(0.6, ek), 0, TAU); ctx.fill();
    }
    // 工程师背包灯
    if (!attract && !p.hidden && !p.vent) {
      const ca = Math.cos(p.aim), sa = Math.sin(p.aim);
      const bx = p.x - ca * 0.22, by = p.y - sa * 0.22;
      const col = p.hp >= 2 ? [180, 140, 255] : [255, 150, 60];
      const bl = p.hp >= 2 ? 0.7 : 0.5 + 0.5 * Math.sin(now * 0.012);
      ctx.fillStyle = radial(ctx, bx, by, 0.35, col, 0.8 * bl, 0.25);
      ctx.beginPath(); ctx.arc(bx, by, 0.35, 0, TAU); ctx.fill();
      if (torchOn) {
        const lx = p.x + ca * 0.3 - sa * 0.15, ly = p.y + sa * 0.3 + ca * 0.15;
        ctx.fillStyle = radial(ctx, lx, ly, 0.3, [255, 245, 220], 0.85 * torchK, 0.2);
        ctx.beginPath(); ctx.arc(lx, ly, 0.3, 0, TAU); ctx.fill();
      }
      // 体力环
      if (p.stamina < 0.995 || p.sprinting) {
        const col2 = p.exhausted ? [255, 110, 80] : [190, 160, 255];
        ctx.strokeStyle = rgba(col2, 0.22);
        ctx.lineWidth = 0.05;
        ctx.beginPath(); ctx.arc(p.x, p.y, 0.48, 0, TAU); ctx.stroke();
        ctx.strokeStyle = rgba(col2, 0.85);
        ctx.beginPath(); ctx.arc(p.x, p.y, 0.48, -Math.PI / 2, -Math.PI / 2 + TAU * p.stamina); ctx.stroke();
      }
    }
    // 声响波纹（自己的声响，帮助理解“噪音”）
    for (const r of g.rings) {
      const k2 = r.t / 1.4;
      if (k2 >= 1) continue;
      const rad = r.r * (0.15 + 0.85 * Math.sqrt(k2));
      const a = (1 - k2) * (r.kind === 'spark' ? 0.55 : r.kind === 'scan' ? 0.4 : r.kind === 'run' ? 0.09 : 0.2);
      ctx.strokeStyle = r.kind === 'spark' ? 'rgba(255,200,140,' + a + ')' : 'rgba(200,180,255,' + a + ')';
      ctx.lineWidth = 0.05;
      ctx.beginPath(); ctx.arc(r.x, r.y, rad, 0, TAU); ctx.stroke();
    }
    // 扫描
    if (g.scan) {
      const S = g.scan;
      const k3 = Math.min(1, S.t / 1.3);
      const rad = S.range * k3;
      if (S.t < 1.6) {
        ctx.strokeStyle = 'rgba(190,150,255,' + 0.6 * (1 - k3 * 0.7) + ')';
        ctx.lineWidth = 0.09;
        ctx.beginPath(); ctx.arc(S.x, S.y, rad, 0, TAU); ctx.stroke();
        ctx.strokeStyle = 'rgba(120,220,255,' + 0.3 * (1 - k3) + ')';
        ctx.lineWidth = 0.4;
        ctx.beginPath(); ctx.arc(S.x, S.y, Math.max(0, rad - 0.3), 0, TAU); ctx.stroke();
      }
      const fade = S.t < 3 ? 1 : Math.max(0, 1 - (S.t - 3));
      for (const r of M.relays) {
        const d = Math.hypot(r.x - S.x, r.y - S.y);
        if (d > rad || d > S.range) continue;
        const a = fade * (r.done ? 0.5 : 0.95);
        drawDiamond(ctx, r.x, r.y, 0.42 + 0.06 * Math.sin(now * 0.01), r.done ? [180, 140, 255] : [140, 220, 255], a, r.done);
      }
      if (S.warden) {
        const d = Math.hypot(S.warden.x - S.x, S.warden.y - S.y);
        if (d < rad) {
          const a = fade * 0.85;
          ctx.fillStyle = radial(ctx, S.warden.x, S.warden.y, 1.2, [255, 60, 50], a * 0.6, 0.3);
          ctx.beginPath(); ctx.arc(S.warden.x, S.warden.y, 1.2, 0, TAU); ctx.fill();
          ctx.strokeStyle = 'rgba(255,90,70,' + a + ')';
          ctx.lineWidth = 0.06;
          ctx.beginPath(); ctx.arc(S.warden.x, S.warden.y, 0.55, 0, TAU); ctx.stroke();
        }
      }
    }
    // 记忆中的信标位置（不在视线内）
    if (!attract) {
      for (const r of M.relays) {
        if (!r.known || seen(r.x, r.y) || !inView(r.x, r.y, 1)) continue;
        drawDiamond(ctx, r.x, r.y, 0.36, r.done ? [180, 140, 255] : [140, 220, 255], r.done ? 0.35 : 0.55, r.done);
      }
    }
    ctx.globalCompositeOperation = 'source-over';

    /* ---- 屏幕空间后期 ---- */
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    R.post(g, dt, now, viewer, opts);
    R.workAvg += (performance.now() - t0 - R.workAvg) * 0.05;
  };

  function drawDiamond(c, x, y, s, col, a, filled) {
    c.beginPath();
    c.moveTo(x, y - s); c.lineTo(x + s * 0.75, y); c.lineTo(x, y + s); c.lineTo(x - s * 0.75, y);
    c.closePath();
    if (filled) { c.fillStyle = rgba(col, a * 0.6); c.fill(); }
    c.strokeStyle = rgba(col, a);
    c.lineWidth = 0.06;
    c.stroke();
  }

  R.updateDust = function (dt, viewer, n) {
    const D = R.dust;
    const hw = R.cw / 2 / R.TS + 1, hh = R.ch / 2 / R.TS + 1;
    while (D.length < n) D.push({ x: R.cam.x + (Math.random() - 0.5) * hw * 2, y: R.cam.y + (Math.random() - 0.5) * hh * 2, vx: (Math.random() - 0.5) * 0.12, vy: (Math.random() - 0.5) * 0.12, s: 0.025 + Math.random() * 0.03, ph: Math.random() * 6, sp: 0.5 + Math.random() });
    if (D.length > n) D.length = n;
    for (const m of D) {
      m.vx += (Math.random() - 0.5) * 0.05 * dt;
      m.vy += (Math.random() - 0.5) * 0.05 * dt;
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      if (Math.abs(m.x - R.cam.x) > hw) m.x = R.cam.x - Math.sign(m.x - R.cam.x) * (hw - 0.1);
      if (Math.abs(m.y - R.cam.y) > hh) m.y = R.cam.y - Math.sign(m.y - R.cam.y) * (hh - 0.1);
    }
  };

  R.post = function (g, dt, now, viewer, opts) {
    const ctx = R.ctx, cw = R.cw, ch = R.ch, Q = QUAL[R.q];
    const p = g.player;
    // 藏在柜子里：百叶缝
    if (p.hidden && p.hidden.cx != null) {
      const k = p.hidePhase === 'enter' ? 1 - Math.max(0, p.hideT / 0.32) : p.hidePhase === 'exit' ? Math.max(0, p.hideT / 0.28) : 1;
      const slat = Math.max(28, ch / 9);
      const gap = slat * U.lerp(1, 0.28, k);
      ctx.fillStyle = 'rgba(6,6,10,0.94)';
      for (let y = -slat; y < ch + slat; y += slat) {
        ctx.fillRect(0, y + gap, cw, slat - gap);
      }
      const g2 = ctx.createLinearGradient(0, 0, 0, slat);
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(0, 0, cw * 0.08, ch);
      ctx.fillRect(cw * 0.92, 0, cw * 0.08, ch);
    }
    // 暗角
    ctx.drawImage(R.vig, 0, 0, cw, ch);
    // 危险红晕（随心跳脉动）
    const danger = opts.danger != null ? opts.danger : g.danger;
    if (danger > 0.02 && !g.attract) {
      const beat = opts.beat || 0;
      ctx.globalAlpha = Math.min(1, danger * (0.55 + 0.45 * beat));
      ctx.drawImage(R.redVig, 0, 0, cw, ch);
      ctx.globalAlpha = 1;
    }
    // 受击闪白
    if (opts.hurt > 0) {
      ctx.fillStyle = 'rgba(255,90,80,' + Math.min(0.6, opts.hurt * 0.6) + ')';
      ctx.fillRect(0, 0, cw, ch);
    }
    // 面罩裂纹
    if (opts.cracks) {
      ctx.globalAlpha = 0.75;
      ctx.drawImage(opts.cracks, 0, 0, cw, ch);
      ctx.globalAlpha = 1;
    }
    // 噪点
    if (Q.grain) {
      if (!R.grainPat) R.grainPat = ctx.createPattern(R.grain, 'repeat');
      ctx.save();
      ctx.globalCompositeOperation = 'overlay';
      ctx.globalAlpha = 0.09;
      ctx.translate(Math.floor(Math.random() * 128), Math.floor(Math.random() * 128));
      ctx.fillStyle = R.grainPat;
      ctx.fillRect(-128, -128, cw + 256, ch + 256);
      ctx.restore();
    }
    // 信号干扰（守夜者非常近时）
    const glitch = opts.glitch || 0;
    if (glitch > 0.05 && Math.random() < glitch) {
      const t = R.tctx;
      const n = 2 + Math.floor(Math.random() * 4);
      if (R.tmp.width !== R.cv.width || R.tmp.height !== R.cv.height) { R.tmp.width = R.cv.width; R.tmp.height = R.cv.height; }
      t.setTransform(1, 0, 0, 1, 0, 0);
      t.drawImage(R.cv, 0, 0);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      for (let i = 0; i < n; i++) {
        const y = Math.random() * R.cv.height, h = (6 + Math.random() * 30) * R.dpr;
        const dx = (Math.random() - 0.5) * 40 * R.dpr * glitch;
        ctx.drawImage(R.tmp, 0, y, R.cv.width, h, dx, y, R.cv.width, h);
      }
      ctx.setTransform(R.dpr, 0, 0, R.dpr, 0, 0);
    }
    // 屏幕边缘的目标指示
    if (!g.attract && !g.ending && opts.markers !== false) R.edgeMarkers(g, now);
  };

  R.edgeMarkers = function (g, now) {
    const ctx = R.ctx, cw = R.cw, ch = R.ch, M = g.map, p = g.player;
    const targets = [];
    for (const r of M.relays) if (r.known && !r.done) targets.push({ x: r.x, y: r.y, col: [150, 215, 255], label: '信标' });
    if (g.podUnlocked) targets.push({ x: M.pod.hx, y: M.pod.hy, col: [100, 255, 180], label: '逃生舱', big: true });
    const m = 30;
    const top = 70, bottom = R.mobile ? 210 : 60;
    for (const T2 of targets) {
      const s = R.worldToScreen(T2.x, T2.y);
      if (s.x > m && s.x < cw - m && s.y > top && s.y < ch - bottom) continue;
      const cx = cw / 2, cy = (top + ch - bottom) / 2;
      const dx = s.x - cx, dy = s.y - cy;
      const kx = (cw / 2 - m) / Math.max(1e-3, Math.abs(dx)), ky = ((ch - top - bottom) / 2) / Math.max(1e-3, Math.abs(dy));
      const kk = Math.min(kx, ky);
      const px = cx + dx * kk, py = cy + dy * kk;
      const a = Math.atan2(dy, dx);
      const dist = Math.round(Math.hypot(T2.x - p.x, T2.y - p.y) * 2);
      const pul = 0.7 + 0.3 * Math.sin(now * 0.006);
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(a);
      ctx.fillStyle = rgba(T2.col, 0.85 * pul);
      ctx.beginPath();
      const sz = T2.big ? 13 : 10;
      ctx.moveTo(sz, 0); ctx.lineTo(-sz * 0.6, -sz * 0.7); ctx.lineTo(-sz * 0.25, 0); ctx.lineTo(-sz * 0.6, sz * 0.7);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      ctx.font = '600 11px "Noto Serif SC", serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = rgba(T2.col, 0.8);
      const lx = px - Math.cos(a) * 26, ly = py - Math.sin(a) * 20;
      ctx.fillText(dist + 'm', lx, ly);
    }
  };

  /* ---------------- 小地图 ---------------- */
  R.drawMinimap = function (mc, g, now) {
    const M = g.map;
    const x = mc.getContext('2d');
    const W = mc.width, H = mc.height;
    if (!R.mmImg || R.mmImg.width !== M.W || R.mmImg.height !== M.H) {
      R.mmCanvas = document.createElement('canvas');
      R.mmCanvas.width = M.W; R.mmCanvas.height = M.H;
      R.mmCtx = R.mmCanvas.getContext('2d');
      R.mmImg = R.mmCtx.createImageData(M.W, M.H);
    }
    const d = R.mmImg.data;
    for (let i = 0; i < M.N; i++) {
      const o = i * 4;
      const t = M.tile[i];
      if (!M.explored[i]) { d[o + 3] = 0; continue; }
      if (t === T.WALL) { d[o] = 120; d[o + 1] = 110; d[o + 2] = 170; d[o + 3] = 200; }
      else if (isFloorT(t)) { d[o] = 50; d[o + 1] = 48; d[o + 2] = 74; d[o + 3] = M.block[i] ? 120 : 170; }
      else d[o + 3] = 0;
    }
    R.mmCtx.putImageData(R.mmImg, 0, 0);
    x.clearRect(0, 0, W, H);
    const sc = Math.min(W / M.W, H / M.H);
    const ox = (W - M.W * sc) / 2, oy = (H - M.H * sc) / 2;
    x.imageSmoothingEnabled = false;
    x.drawImage(R.mmCanvas, ox, oy, M.W * sc, M.H * sc);
    const P = (wx, wy) => [ox + wx * sc, oy + wy * sc];
    // 信标
    for (const r of M.relays) {
      if (!r.known) continue;
      const [px, py] = P(r.x, r.y);
      x.fillStyle = r.done ? '#b48cff' : '#8fd8ff';
      x.beginPath();
      const s = Math.max(2.5, sc * 1.1);
      x.moveTo(px, py - s); x.lineTo(px + s * 0.75, py); x.lineTo(px, py + s); x.lineTo(px - s * 0.75, py);
      x.closePath();
      if (r.done) x.fill(); else { x.strokeStyle = '#8fd8ff'; x.lineWidth = 1.2; x.stroke(); }
    }
    // 逃生舱
    {
      const [px, py] = P(M.pod.cx, M.pod.cy);
      const s = Math.max(3, sc * 1.3);
      x.fillStyle = g.podUnlocked ? 'rgba(100,255,180,' + (0.6 + 0.4 * Math.sin(now * 0.008)) + ')' : 'rgba(255,110,90,0.8)';
      x.fillRect(px - s, py - s, s * 2, s * 2);
    }
    // 扫描到的守夜者
    if (g.scan && g.scan.warden && g.scan.t < 3.5) {
      const [px, py] = P(g.scan.warden.x, g.scan.warden.y);
      x.fillStyle = 'rgba(255,70,60,' + (1 - g.scan.t / 3.5) + ')';
      x.beginPath(); x.arc(px, py, Math.max(2.5, sc * 1.2), 0, TAU); x.fill();
    }
    // 玩家
    const p = g.player;
    const [px, py] = P(p.x, p.y);
    x.save();
    x.translate(px, py);
    x.rotate(p.aim);
    x.fillStyle = '#fff';
    x.beginPath();
    const s = Math.max(3.5, sc * 1.4);
    x.moveTo(s, 0); x.lineTo(-s * 0.7, -s * 0.7); x.lineTo(-s * 0.3, 0); x.lineTo(-s * 0.7, s * 0.7);
    x.closePath();
    x.fill();
    x.restore();
  };

  // 自适应画质：根据每帧实际耗时升降
  // 同时看脚本耗时和真实帧间隔（GPU 合成吃紧时脚本耗时并不高）
  R.frameAvg = 1 / 60;
  R.adapt = function (dt) {
    if (R.qLock) return;
    if (dt > 0 && dt < 0.1) R.frameAvg += (dt - R.frameAvg) * 0.05;
    R.qTimer += dt;
    if (R.qTimer < 2) return;
    const slow = R.workAvg > 13 || R.frameAvg > 0.027;
    if (slow && R.q > 0) {
      if (R.raisedAt != null && R.qTimer < 8) R.noRaise = true; // 刚升档又卡：这次不再尝试
      R.setQuality(R.q - 1);
      R.qTimer = 0; R.workAvg = 8; R.frameAvg = 1 / 60; R.raisedAt = null;
    } else if (!R.noRaise && R.workAvg < 5 && R.frameAvg < 0.019 && R.q < R.qMax && R.qTimer > 6) {
      R.setQuality(R.q + 1);
      R.qTimer = 0; R.workAvg = 8; R.raisedAt = 0;
    }
  };
})();
