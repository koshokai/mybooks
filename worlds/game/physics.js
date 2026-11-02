/* =========================================================
   引力 · 星轨 —— 物理核心
   确定性模拟：游戏、轨迹预览、每日星图生成器共用同一份代码。
   关卡坐标系：600 × 1000 的归一化设计空间（竖屏），渲染时按视口缩放/旋转。
   ========================================================= */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.OrbitPhys = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const C = {
    W: 600, H: 1000,
    DT: 1 / 240,
    COMET_R: 6,
    MOTE_R: 12,
    PORTAL_R: 24,
    WORM_R: 22,
    RING_R: 26,
    MAX_T: 12,
    MARGIN: 30,
    MAXV: 1600,
    VMIN: 150,
    VMAX: 760,
    BOUNCE: 0.82,
    NEAR: 14,
  };

  function speedFor(power) { return C.VMIN + (C.VMAX - C.VMIN) * power; }

  /** 补全关卡字段，返回运行时关卡对象 */
  function prepare(src) {
    const L = {
      start: src.start || [300, 890],
      planets: (src.planets || []).map(p => ({ x: p.x, y: p.y, r: p.r, m: p.m, hue: p.hue == null ? 200 : p.hue, ring: !!p.ring })),
      holes: (src.holes || []).map(h => ({ x: h.x, y: h.y, r: h.r || 16, m: h.m })),
      rocks: (src.rocks || []).map(a => ({ x: a.x, y: a.y, r: a.r })),
      moons: (src.moons || []).map(m => ({ cx: m.cx, cy: m.cy, orbit: m.orbit, r: m.r, m: m.m, w: m.w, ph: m.ph || 0 })),
      worms: (src.worms || []).map(w => ({ a: w.a, b: w.b })),
      rings: (src.rings || []).map(g => ({ x: g.x, y: g.y, k: g.k || 1.45 })),
      motes: (src.motes || []).map(m => [m[0], m[1]]),
      portal: src.portal,
    };
    return L;
  }

  function moonPos(m, t) {
    const a = m.ph + m.w * t;
    return [m.cx + Math.cos(a) * m.orbit, m.cy + Math.sin(a) * m.orbit];
  }

  function launch(L, angle, power, got) {
    const v = speedFor(power);
    const g = got ? got.slice() : L.motes.map(() => false);
    let n = 0; for (const b of g) if (b) n++;
    return {
      x: L.start[0], y: L.start[1],
      vx: Math.cos(angle) * v, vy: Math.sin(angle) * v,
      t: 0, got: g, n,
      lock: -1,           // 刚穿出的虫洞端点编号（离开后解锁）
      inRing: L.rings.map(() => false),
      near: {},
      end: null,
      ev: [],
    };
  }

  function step(L, s) {
    if (s.end) return;
    const ev = s.ev;
    const x = s.x, y = s.y;
    const CR = C.COMET_R;
    let ax = 0, ay = 0;

    const P = L.planets;
    for (let i = 0; i < P.length; i++) {
      const p = P[i];
      const dx = p.x - x, dy = p.y - y;
      const d2 = dx * dx + dy * dy;
      const rr = p.r + CR;
      if (d2 < rr * rr) { s.end = 'crash'; ev.push({ t: 'crash', x, y, kind: 'planet', i }); return; }
      const d = Math.sqrt(d2);
      const f = p.m / (d2 * d);
      ax += dx * f; ay += dy * f;
      if (d - rr < C.NEAR && !s.near['p' + i]) { s.near['p' + i] = 1; ev.push({ t: 'near', x, y }); }
    }
    const B = L.holes;
    for (let i = 0; i < B.length; i++) {
      const h = B[i];
      const dx = h.x - x, dy = h.y - y;
      const d2 = dx * dx + dy * dy;
      if (d2 < h.r * h.r) { s.end = 'swallow'; ev.push({ t: 'swallow', x, y, i }); return; }
      const s2 = d2 + 100;
      const f = h.m / (s2 * Math.sqrt(s2));
      ax += dx * f; ay += dy * f;
      if (Math.sqrt(d2) - h.r < C.NEAR * 2.5 && !s.near['h' + i]) { s.near['h' + i] = 1; ev.push({ t: 'near', x, y }); }
    }
    const M = L.moons;
    for (let i = 0; i < M.length; i++) {
      const m = M[i];
      const mp = moonPos(m, s.t);
      const dx = mp[0] - x, dy = mp[1] - y;
      const d2 = dx * dx + dy * dy;
      const rr = m.r + CR;
      if (d2 < rr * rr) { s.end = 'crash'; ev.push({ t: 'crash', x, y, kind: 'moon', i }); return; }
      const d = Math.sqrt(d2);
      const f = m.m / (d2 * d);
      ax += dx * f; ay += dy * f;
      if (d - rr < C.NEAR && !s.near['m' + i]) { s.near['m' + i] = 1; ev.push({ t: 'near', x, y }); }
    }

    let vx = s.vx + ax * C.DT, vy = s.vy + ay * C.DT;
    let sp = Math.hypot(vx, vy);
    if (sp > C.MAXV) { vx *= C.MAXV / sp; vy *= C.MAXV / sp; }
    let nx = x + vx * C.DT, ny = y + vy * C.DT;
    s.t += C.DT;

    // 小行星：弹开
    const A = L.rocks;
    for (let i = 0; i < A.length; i++) {
      const a = A[i];
      const dx = nx - a.x, dy = ny - a.y;
      const rr = a.r + CR;
      const d2 = dx * dx + dy * dy;
      if (d2 < rr * rr) {
        const d = Math.sqrt(d2) || 1e-6;
        const ux = dx / d, uy = dy / d;
        const vn = vx * ux + vy * uy;
        if (vn < 0) {
          vx -= (1 + C.BOUNCE) * vn * ux; vy -= (1 + C.BOUNCE) * vn * uy;
          ev.push({ t: 'bounce', x: a.x + ux * a.r, y: a.y + uy * a.r, i, power: -vn });
        }
        nx = a.x + ux * (rr + 0.01); ny = a.y + uy * (rr + 0.01);
      }
    }

    // 加速环
    const G = L.rings;
    for (let i = 0; i < G.length; i++) {
      const g = G[i];
      const d = Math.hypot(nx - g.x, ny - g.y);
      if (d < C.RING_R) {
        if (!s.inRing[i]) {
          s.inRing[i] = true;
          vx *= g.k; vy *= g.k;
          sp = Math.hypot(vx, vy);
          if (sp > C.MAXV) { vx *= C.MAXV / sp; vy *= C.MAXV / sp; }
          ev.push({ t: 'boost', x: g.x, y: g.y, i });
        }
      } else if (d > C.RING_R + 4) s.inRing[i] = false;
    }

    // 虫洞：端点编号 2i (a) / 2i+1 (b)
    const Wm = L.worms;
    if (s.lock >= 0) {
      const w = Wm[s.lock >> 1], e = (s.lock & 1) ? w.b : w.a;
      if (Math.hypot(nx - e[0], ny - e[1]) > C.WORM_R + 2) s.lock = -1;
    }
    for (let i = 0; i < Wm.length && s.lock < 0; i++) {
      const w = Wm[i];
      for (let k = 0; k < 2; k++) {
        const e = k ? w.b : w.a, o = k ? w.a : w.b;
        if (Math.hypot(nx - e[0], ny - e[1]) < C.WORM_R) {
          const fx = nx, fy = ny;
          nx = o[0] + (nx - e[0]); ny = o[1] + (ny - e[1]);
          s.lock = i * 2 + (k ? 0 : 1);
          ev.push({ t: 'warp', x: fx, y: fy, x2: nx, y2: ny, i });
          break;
        }
      }
    }

    s.x = nx; s.y = ny; s.vx = vx; s.vy = vy;

    // 星尘
    const Mo = L.motes, rr = C.MOTE_R + CR;
    for (let i = 0; i < Mo.length; i++) {
      if (s.got[i]) continue;
      const dx = Mo[i][0] - nx, dy = Mo[i][1] - ny;
      if (dx * dx + dy * dy < rr * rr) { s.got[i] = true; s.n++; ev.push({ t: 'mote', x: Mo[i][0], y: Mo[i][1], i, n: s.n }); }
    }
    // 星门
    const pt = L.portal;
    if (pt && s.n === Mo.length) {
      const dx = pt[0] - nx, dy = pt[1] - ny;
      if (dx * dx + dy * dy < C.PORTAL_R * C.PORTAL_R) { s.end = 'win'; ev.push({ t: 'win', x: nx, y: ny }); return; }
    }
    if (nx < -C.MARGIN || nx > C.W + C.MARGIN || ny < -C.MARGIN || ny > C.H + C.MARGIN) { s.end = 'lost'; ev.push({ t: 'lost', x: nx, y: ny }); return; }
    if (s.t > C.MAX_T) { s.end = 'timeout'; ev.push({ t: 'timeout', x: nx, y: ny }); }
  }

  /** 完整模拟一次发射。opts.path=true 记录轨迹（每 n 步一个点） */
  function simulate(L, angle, power, opts) {
    opts = opts || {};
    const s = launch(L, angle, power, opts.got);
    const maxSteps = Math.ceil((opts.maxT || C.MAX_T + 1) / C.DT);
    const every = opts.every || 4;
    const path = opts.path ? [] : null;
    for (let k = 0; k < maxSteps && !s.end; k++) {
      step(L, s);
      if (!opts.keepEv) s.ev.length = 0;
      if (path && k % every === 0) path.push([s.x, s.y, s.t]);
    }
    return { end: s.end, s, path };
  }

  return { C, speedFor, prepare, moonPos, launch, step, simulate };
});
