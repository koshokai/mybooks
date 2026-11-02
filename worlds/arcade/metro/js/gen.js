// 星环列车 · 轨道生成 + 可通行性校验（纯逻辑，可在 Node 中测试）
//
// 轨道按「区段 chunk」生成。每个区段先随机拼出一种图案（障碍行、列车走廊、迎面穿梭车……），
// 再把障碍离散到 1 米一格的网格上，用保守的玩家动作模型（跑、跳、滑、变道、车顶、坡道、跳下）
// 做一次反向动态规划：只有从三条轨道任意一条进入都能活着走完的区段才会被采用，
// 否则重新生成；多次失败就退回一定可通行的「星尘长廊」。

import {
  LANE_X, LANE_W, ROOF_H, CAR_LEN, CAR_GAP, RAMP_LEN, BAR_D, BAR_H, GANTRY_D, GANTRY_Y, GANTRY_TOP,
  CONT_H, P_HD, JUMP_H,
} from './config.js';

export const BARRIER = 1, GANTRY = 2, BLOCK = 3, GAP = 4, TRAIN = 5, ONCOMING = 6;
export const TYPE_NAME = { 1: 'barrier', 2: 'gantry', 3: 'block', 4: 'gap', 5: 'train', 6: 'oncoming' };

// 网格标记
export const WALL = 1, BAR = 2, GAN = 4, GAPF = 8, ROOF = 16, RAMP = 32, RTOP = 64;
const BLOCKG = WALL | BAR | GAN | GAPF;   // 地面上不能直接跑过
const NOTCLEAR = BLOCKG | RAMP;          // 不能变道 / 落地的格子

export function trainLen(cars) { return cars * CAR_LEN + (cars - 1) * CAR_GAP; }

// 保守的动作模型（单位：格 = 米），v 为到达该区段时的速度
export function actionParams(v) {
  return {
    W: Math.ceil(v * 0.2) + 1,          // 变道：直到完全进入新轨道
    Ws: Math.ceil(v * 0.06) + 1,        // 变道：离开原轨道障碍范围
    J: Math.ceil(v * 0.62) + 1,         // 跳跃：直到确定落地
    JA: Math.floor(v * 0.55 - 1),       // 跳跃：确定在空中（可以越过断轨）
    H0: Math.ceil(1 + v * 0.14),        // 跳跃：高于警示栏的窗口
    H1: Math.floor(v * 0.44 - 1),
    S: Math.floor(v * 0.65 - 1),        // 滑铲：确定处于低姿态
    D: Math.ceil(v * 0.42) + 2,         // 从车顶跳下
  };
}

export class Grid {
  constructor(N) {
    this.N = N;
    this.f = [new Uint8Array(N), new Uint8Array(N), new Uint8Array(N)];
  }
  mark(l, a, b, flag) {
    const c0 = Math.max(0, Math.floor(a));
    const c1 = Math.min(this.N - 1, Math.ceil(b) - 1);
    for (let c = c0; c <= c1; c++) this.f[l][c] |= flag;
  }
  get(l, c) { return c < 0 || c >= this.N ? 0 : this.f[l][c]; }
}

// 把区段特征写入网格（局部坐标）
export function buildGrid(chunk) {
  const N = Math.ceil(chunk.len) + 1;
  const g = new Grid(N);
  const o = chunk.s0;
  for (const f of chunk.feats) {
    if (f.dead) continue;
    for (let l = 0; l < 3; l++) {
      if (!(f.mask & (1 << l))) continue;
      const a = f.s0 - o, b = f.s1 - o;
      switch (f.t) {
        case BARRIER: g.mark(l, a - P_HD, b + P_HD, BAR); break;
        case GANTRY: g.mark(l, a - P_HD, b + P_HD, GAN); break;
        case BLOCK: g.mark(l, a - P_HD, b + P_HD, WALL); break;
        case GAP: g.mark(l, a, b, GAPF); break;
        case TRAIN: {
          const ca = Math.floor(a);
          if (f.ramp) {
            const r0 = Math.floor(a - RAMP_LEN);
            for (let c = Math.max(0, r0); c <= ca - 1 && c < N; c++) g.f[l][c] |= RAMP;
            if (ca - 1 >= 0 && ca - 1 < N) g.f[l][ca - 1] |= RTOP;
            g.mark(l, a, b, WALL | ROOF);
          } else {
            g.mark(l, a - P_HD - 0.2, a, WALL);
            g.mark(l, a, b, WALL | ROOF);
          }
          break;
        }
        case ONCOMING: g.mark(l, a, b, WALL); break;
      }
    }
  }
  return g;
}

// 反向动态规划：alive[lvl][l][c] = 从该状态出发能否活着离开区段
export class Validator {
  constructor(grid, v) {
    this.g = grid; this.N = grid.N; this.p = actionParams(v);
    const N = this.N;
    this.aG = [new Uint8Array(N), new Uint8Array(N), new Uint8Array(N)];
    this.aR = [new Uint8Array(N), new Uint8Array(N), new Uint8Array(N)];
    this.solve();
  }
  F(l, c) { return this.g.get(l, c); }
  A(c, l, lvl) { return c >= this.N ? 1 : (lvl ? this.aR[l][c] : this.aG[l][c]); }
  clear(l, c) { return !(this.F(l, c) & NOTCLEAR); }

  // —— 各动作：返回目标格（或 -1）——
  runG(c, l) { return (this.F(l, c + 1) & BLOCKG) ? -1 : c + 1; }
  rampUp(c, l) { return ((this.F(l, c) & RTOP) && (this.F(l, c + 1) & ROOF)) ? c + 1 : -1; }
  jump(c, l) {
    const { J, JA, H0, H1 } = this.p;
    if (this.F(l, c) & GAN) return -1; // 还在门架下面，起跳会撞头
    for (let i = 1; i <= J; i++) {
      const f = this.F(l, c + i);
      if (f & (WALL | GAN | RAMP | ROOF)) return -1;
      if ((f & BAR) && (i < H0 || i > H1)) return -1;
      if ((f & GAPF) && i > JA) return -1;
    }
    return c + J;
  }
  slide(c, l) {
    const { S } = this.p;
    for (let i = 1; i <= S; i++) if (this.F(l, c + i) & (WALL | BAR | GAPF | RAMP)) return -1;
    if (this.F(l, c + S) & GAN) return -1;
    return c + S;
  }
  lat(c, l, m) {
    const { W, Ws } = this.p;
    for (let i = 0; i <= W; i++) if (!this.clear(m, c + i)) return -1;
    for (let i = 0; i <= Ws; i++) if (!this.clear(l, c + i)) return -1; // 包括当前格：门架立柱、坡道侧面
    return c + W;
  }
  runR(c, l) { return (this.F(l, c + 1) & ROOF) ? c + 1 : -1; }
  drop(c, l) {
    if (this.F(l, c + 1) & ROOF) return -1;
    const { D } = this.p;
    for (let i = 1; i <= D; i++) if (!this.clear(l, c + i)) return -1;
    return c + D;
  }
  hop(c, l, m) {
    const { W, Ws } = this.p;
    for (let i = 0; i <= W; i++) if (!(this.F(m, c + i) & ROOF)) return -1;
    for (let i = 0; i <= Ws; i++) if (!(this.F(l, c + i) & ROOF)) return -1;
    return c + W;
  }
  sideDrop(c, l, m) {
    const { W, D } = this.p;
    for (let i = 0; i <= W + D; i++) if (!this.clear(m, c + i)) return -1;
    return c + W + D;
  }

  // 列出某状态下所有可行动作及其目标状态
  options(c, l, lvl) {
    const out = [];
    let t;
    if (!lvl) {
      if ((t = this.runG(c, l)) >= 0) out.push(['run', t, l, 0]);
      if ((t = this.rampUp(c, l)) >= 0) out.push(['run', t, l, 1]);
      if ((t = this.jump(c, l)) >= 0) out.push(['jump', t, l, 0]);
      if ((t = this.slide(c, l)) >= 0) out.push(['slide', t, l, 0]);
      if (l > 0 && (t = this.lat(c, l, l - 1)) >= 0) out.push(['left', t, l - 1, 0]);
      if (l < 2 && (t = this.lat(c, l, l + 1)) >= 0) out.push(['right', t, l + 1, 0]);
    } else {
      if ((t = this.runR(c, l)) >= 0) out.push(['run', t, l, 1]);
      if ((t = this.drop(c, l)) >= 0) out.push(['run', t, l, 0]);
      for (const m of [l - 1, l + 1]) {
        if (m < 0 || m > 2) continue;
        const name = m < l ? 'left' : 'right';
        if ((t = this.hop(c, l, m)) >= 0) out.push([name, t, m, 1]);
        if ((t = this.sideDrop(c, l, m)) >= 0) out.push([name, t, m, 0]);
      }
    }
    return out;
  }

  solve() {
    const N = this.N;
    for (let c = N - 1; c >= 0; c--) {
      for (let l = 0; l < 3; l++) {
        let okG = 0, okR = 0;
        for (const o of this.options(c, l, 0)) if (this.A(o[1], o[2], o[3])) { okG = 1; break; }
        if (this.F(l, c) & ROOF) for (const o of this.options(c, l, 1)) if (this.A(o[1], o[2], o[3])) { okR = 1; break; }
        this.aG[l][c] = okG; this.aR[l][c] = okR;
      }
    }
  }

  // 从区段开头 (三条轨道) 向前可达的状态
  reach() {
    const N = this.N;
    const rG = [new Uint8Array(N), new Uint8Array(N), new Uint8Array(N)];
    const rR = [new Uint8Array(N), new Uint8Array(N), new Uint8Array(N)];
    for (let l = 0; l < 3; l++) rG[l][0] = 1;
    for (let c = 0; c < N; c++) {
      for (let l = 0; l < 3; l++) {
        for (let lvl = 0; lvl < 2; lvl++) {
          if (!(lvl ? rR : rG)[l][c]) continue;
          if (!this.A(c, l, lvl)) continue;
          for (const o of this.options(c, l, lvl)) {
            if (o[1] < N && this.A(o[1], o[2], o[3])) (o[3] ? rR : rG)[o[2]][o[1]] = 1;
          }
        }
      }
    }
    return { rG, rR };
  }

  // 区段可通行：任意轨道、开头若干格内的任意状态都能活下去
  passable() {
    const spill = Math.max(this.p.J, this.p.D + this.p.W) + 2;
    for (let c = 0; c <= spill && c < this.N; c++)
      for (let l = 0; l < 3; l++) if (this.clear(l, c) && !this.aG[l][c]) return false;
    for (let l = 0; l < 3; l++) if (!this.aG[l][0]) return false;
    return true;
  }
}

// ————————————————————————————— 随机工具 —————————————————————————————
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class Rand {
  constructor(seed) { this.r = mulberry32(seed); }
  f(a = 0, b = 1) { return a + (b - a) * this.r(); }
  i(a, b) { return a + Math.floor(this.r() * (b - a + 1)); }
  ch(p) { return this.r() < p; }
  pick(arr) { return arr[Math.floor(this.r() * arr.length)]; }
  shuffle(arr) { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(this.r() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; }
  w(pairs) { // [[val, weight], ...]
    let tot = 0; for (const p of pairs) tot += Math.max(0, p[1]);
    let x = this.r() * tot;
    for (const p of pairs) { x -= Math.max(0, p[1]); if (x <= 0 && p[1] > 0) return p[0]; }
    return pairs[pairs.length - 1][0];
  }
}

// ————————————————————————————— 区段构造器 —————————————————————————————
class CB {
  constructor(s0, v, d, R) {
    this.s0 = s0; this.v = v; this.d = d; this.R = R;
    this.feats = []; this.motes = []; this.pows = [];
    this.p = actionParams(v);
    this.entry = this.p.J + 2 * this.p.W + 3;
    this.cur = s0 + this.entry;
    this.end = this.cur;
  }
  need(s) { if (s > this.end) this.end = s; }
  add(f) { f.mask = f.mask ?? (1 << f.lane); this.feats.push(f); this.need(f.s1 + 1); return f; }
  bar(l, s) { return this.add({ t: BARRIER, lane: l, s0: s - BAR_D / 2, s1: s + BAR_D / 2 }); }
  gan(l, s) { return this.add({ t: GANTRY, lane: l, s0: s - GANTRY_D / 2, s1: s + GANTRY_D / 2 }); }
  ganWide(s) { return this.add({ t: GANTRY, lane: 1, mask: 7, wide: true, s0: s - GANTRY_D / 2, s1: s + GANTRY_D / 2 }); }
  block(l, s, len) { return this.add({ t: BLOCK, lane: l, s0: s, s1: s + len, len, var: this.R.i(0, 5) }); }
  gap(mask, s, len) { return this.add({ t: GAP, lane: mask === 7 ? 1 : Math.log2(mask & -mask), mask, s0: s, s1: s + len, len }); }
  train(l, s, cars, ramp) {
    const len = trainLen(cars);
    return this.add({ t: TRAIN, lane: l, s0: s, s1: s + len, cars, ramp, var: this.R.i(0, 3) });
  }
  oncoming(l, sm, cars, k) {
    const Lt = trainLen(cars);
    const f = this.add({ t: ONCOMING, lane: l, sm, Lt, k, cars, s0: sm - P_HD - 0.2, s1: sm + (Lt + P_HD) / (1 + k) + 0.2 });
    return f;
  }
  mote(x, y, s) { this.motes.push({ x, y, s }); }
  line(l, sa, sb, y = 1.0, step = 2.6) {
    for (let s = sa; s <= sb; s += step) this.mote(LANE_X[l], y, s);
  }
  arc(l, sc, n = 7) { // 跳跃弧线：起跳 → 最高点在 sc → 落地
    const half = this.v * 0.29;
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1);
      this.mote(LANE_X[l], 0.95 + JUMP_H * 4 * u * (1 - u) * 0.95, sc - half + 2 * half * u);
    }
  }
  roofLine(f) {
    const sa = f.ramp ? f.s0 - RAMP_LEN + 1.2 : f.s0 + 1.5;
    for (let s = sa; s <= f.s1 - 1; s += 2.6) {
      const h = s < f.s0 ? ROOF_H * (s - (f.s0 - RAMP_LEN)) / RAMP_LEN : ROOF_H;
      this.mote(LANE_X[f.lane], h + 1.0, s);
    }
  }
}

// ————————————————————————————— 生成器 —————————————————————————————
export class Generator {
  constructor(seed) {
    this.R = new Rand(seed);
    this.reserve = [];   // 迎面穿梭车需要的空轨道 [{lane, s0, s1}]
    this.clearZones = []; // 喷射落点等需要清空的范围
    this.lastKind = '';
    this.count = 0;
    this.sinceBreath = 0;
    this.stats = { attempts: 0, fallbacks: 0, chunks: 0 };
  }

  next(s0, v, d, opts = {}) {
    const R = this.R;
    this.count++;
    let kind = opts.kind || this.pickKind(d);
    let C = null;
    for (let attempt = 0; attempt < 10; attempt++) {
      this.stats.attempts++;
      const c = new CB(s0, v, Math.max(0, d - attempt * 0.06), R);
      this.build(c, attempt >= 6 ? 'rows' : kind);
      const ch = this.finish(c, opts);
      if (ch) { C = ch; break; }
    }
    if (!C) {
      this.stats.fallbacks++;
      const c = new CB(s0, v, d, R);
      this.build(c, 'breather');
      C = this.finish(c, opts, true);
      kind = 'breather';
    }
    this.stats.chunks++;
    this.lastKind = kind;
    this.sinceBreath = kind === 'breather' ? 0 : this.sinceBreath + 1;
    // 记录迎面车的保留区
    for (const f of C.feats) if (f.t === ONCOMING) this.reserve.push({ lane: f.lane, s0: f.sm - 3, s1: f.sm + f.Lt + 62 });
    this.reserve = this.reserve.filter((r) => r.s1 > s0 - 50);
    this.clearZones = this.clearZones.filter((z) => z.s1 > s0 - 50);
    C.kind = kind;
    return C;
  }

  pickKind(d) {
    const R = this.R;
    if (this.count <= 1) return 'intro';
    if (this.sinceBreath >= (d < 0.3 ? 4 : 6) && R.ch(0.6)) return 'breather';
    const last = this.lastKind;
    const W = [
      ['breather', 0.35 - 0.25 * d],
      ['rows', 1.0],
      ['full', 0.3 + 0.2 * d],
      ['zigzag', d < 0.1 ? 0 : 0.4 + 0.2 * d],
      ['trains', d < 0.06 ? 0.25 : 0.75],
      ['gaps', d < 0.16 ? 0 : 0.3 + 0.2 * d],
      ['oncoming', d < 0.2 ? 0 : 0.35 + 0.4 * d],
      ['roofrun', d < 0.32 ? 0 : 0.25 + 0.25 * d],
      ['mixed', d < 0.42 ? 0 : 0.45 * d],
    ].map(([k, w]) => [k, k === last && k !== 'rows' ? w * 0.15 : w]);
    return R.w(W);
  }

  build(C, kind) {
    switch (kind) {
      case 'intro': return this.pIntro(C);
      case 'breather': return this.pBreather(C);
      case 'rows': return this.pRows(C);
      case 'full': return this.pFull(C);
      case 'zigzag': return this.pZigzag(C);
      case 'trains': return this.pTrains(C);
      case 'gaps': return this.pGaps(C);
      case 'oncoming': return this.pOncoming(C);
      case 'roofrun': return this.pRoofRun(C);
      case 'mixed': return this.pMixed(C);
      default: return this.pRows(C);
    }
  }

  // ——— 图案 ———
  spacing(C, lo = 1, hi = 1) {
    const base = 1.32 - 0.5 * C.d; // 秒
    return C.v * base * C.R.f(0.92 * lo, 1.22 * hi);
  }

  pIntro(C) {
    // 开场：一段只有星尘的直线，然后两个温和的障碍
    const R = C.R; let s = C.cur;
    C.line(1, C.s0 + 12, s + 18, 1.0, 2.6);
    s += 26;
    C.bar(1, s); C.arc(1, s);
    s += C.v * 1.5;
    C.block(0, s, 4.2); C.block(2, s, 4.2); C.line(1, s - 10, s + 4);
    s += C.v * 1.5;
    C.gan(R.pick([0, 1, 2]), s);
    C.cur = s + 6; C.need(C.cur);
  }

  pBreather(C) {
    const R = C.R; const len = C.v * R.f(2.3, 3.4);
    const sa = C.s0 + 8, sb = C.cur + len;
    const style = R.i(0, 2);
    if (style === 0) { // 正弦波穿过三条轨道
      const ph = R.f(0, 6.28), wl = R.f(40, 70);
      for (let s = sa; s < sb; s += 2.4) C.mote(Math.sin(ph + (s - sa) / wl * 6.283) * LANE_W, 1.0, s);
    } else if (style === 1) { // 两条平行线
      const ls = R.shuffle([0, 1, 2]).slice(0, 2);
      for (const l of ls) C.line(l, sa, sb, 1.0, 3.0);
    } else { // 车道之间来回的折线
      let l = R.i(0, 2);
      for (let s = sa; s < sb; s += 20) {
        C.line(l, s, s + 14, 1.0, 2.4);
        l = Math.max(0, Math.min(2, l + R.pick([-1, 1])));
      }
    }
    C.cur = sb; C.need(sb);
    C.breather = true;
  }

  pRows(C) {
    const R = C.R, d = C.d;
    const n = R.i(3, 4 + Math.round(d * 3));
    let s = C.cur;
    let prevMote = R.i(0, 2);
    for (let i = 0; i < n; i++) {
      const k = R.ch(0.5 - 0.28 * d) ? 1 : (R.ch(0.86) ? 2 : 3);
      const lanes = R.shuffle([0, 1, 2]);
      const blocked = lanes.slice(0, k);
      const free = lanes.slice(k);
      let blocks = 0, maxLen = 0;
      const types = {};
      for (const l of blocked) {
        let t = R.w([['bar', 0.34], ['gan', 0.28], ['block', k === 3 && blocks >= 1 ? 0 : 0.46], ['gap', d > 0.25 ? 0.1 : 0]]);
        types[l] = t;
        if (t === 'bar') C.bar(l, s);
        else if (t === 'gan') C.gan(l, s);
        else if (t === 'gap') { const gl = this.gapLen(C); C.gap(1 << l, s - gl / 2, gl); maxLen = Math.max(maxLen, gl / 2); }
        else { const len = R.ch(0.5) ? 4.2 : 6.2; C.block(l, s - 1, len); blocks++; maxLen = Math.max(maxLen, len); }
      }
      // 星尘：优先空轨道，其次给跳跃弧线 / 滑铲低线
      let ml = free.length ? (free.includes(prevMote) ? prevMote : R.pick(free)) : R.pick(blocked.filter((l) => types[l] !== 'block')) ?? -1;
      if (ml >= 0) {
        const t = types[ml];
        if (!t) C.line(ml, s - C.v * 0.55, s + 2, 1.0);
        else if (t === 'bar' || t === 'gap') C.arc(ml, s);
        else if (t === 'gan') C.line(ml, s - 4, s + 3, 0.5, 1.8);
        prevMote = ml;
      }
      s += this.spacing(C) + maxLen;
    }
    C.cur = s - this.spacing(C) * 0.5; C.need(C.cur);
  }

  gapLen(C) { return Math.max(3.2, Math.min(7.0, C.v * 0.24)); }

  pFull(C) {
    const R = C.R, d = C.d;
    const n = R.i(1, 2 + (d > 0.4 ? 1 : 0));
    let s = C.cur, last = '';
    const ml = R.i(0, 2);
    for (let i = 0; i < n; i++) {
      let t = R.w([['gan', 1], ['bar', 0.9], ['gap', d > 0.22 ? 0.7 : 0]].map(([k, w]) => [k, k === last ? 0.1 : w]));
      if (t === 'gan') { C.ganWide(s); C.line(ml, s - 5, s + 3, 0.5, 1.8); }
      else if (t === 'bar') { for (let l = 0; l < 3; l++) C.bar(l, s); C.arc(ml, s); }
      else { const gl = this.gapLen(C); C.gap(7, s - gl / 2, gl); C.arc(ml, s); }
      last = t;
      s += C.v * R.f(1.15, 1.45);
    }
    C.cur = s - C.v * 0.6; C.need(C.cur);
  }

  pZigzag(C) {
    const R = C.R, d = C.d;
    const n = R.i(4, 5 + Math.round(d * 2));
    let s = C.cur, free = R.i(0, 2), dir = R.ch(0.5) ? 1 : -1;
    const len = 4.2;
    for (let i = 0; i < n; i++) {
      for (let l = 0; l < 3; l++) if (l !== free) {
        if (d > 0.45 && R.ch(0.25)) C.gan(l, s + 1); // 偶尔混入门架：也可以滑过去
        else C.block(l, s, len);
      }
      C.line(free, s - 5, s + len + 1, 1.0, 2.2);
      if (free + dir < 0 || free + dir > 2) dir = -dir;
      if (!R.ch(0.15)) free += dir;
      s += len + C.v * (0.95 - 0.22 * d) * R.f(0.95, 1.15);
    }
    C.cur = s; C.need(s);
  }

  pTrains(C) {
    const R = C.R, d = C.d, v = C.v;
    const variant = R.w([['single', 1], ['double', d > 0.15 ? 0.9 : 0.3], ['corridor', d > 0.3 ? 0.6 : 0]]);
    let s = C.cur;
    const trains = [];
    if (variant === 'single') {
      const L = R.i(0, 2), cars = R.i(2, 3 + (d > 0.5 ? 1 : 0)), ramp = R.ch(0.72);
      trains.push(C.train(L, s + (ramp ? RAMP_LEN : 0), cars, ramp));
    } else if (variant === 'double') {
      const ls = R.shuffle([0, 1, 2]);
      const rampIdx = R.i(0, 1);
      for (let i = 0; i < 2; i++) {
        const ramp = i === rampIdx || R.ch(0.35);
        const st = s + (i === 0 ? 0 : R.f(0, v * 1.1));
        trains.push(C.train(ls[i], st + (ramp ? RAMP_LEN : 0), R.i(2, 3 + (d > 0.6 ? 1 : 0)), ramp));
      }
    } else {
      const ramp0 = R.ch(0.6), ramp2 = !ramp0 || R.ch(0.4);
      trains.push(C.train(0, s + (ramp0 ? RAMP_LEN : 0), R.i(3, 4), ramp0));
      trains.push(C.train(2, s + R.f(0, 8) + (ramp2 ? RAMP_LEN : 0), R.i(3, 4), ramp2));
    }
    const occ = new Set(trains.map((t) => t.lane));
    const tEnd = Math.max(...trains.map((t) => t.s1));
    // 其余轨道上放一些可以跳 / 滑的障碍
    const others = [0, 1, 2].filter((l) => !occ.has(l));
    let rs = s + v * R.f(0.8, 1.1);
    while (rs < tEnd - 6 && others.length) {
      const l = R.pick(others);
      const sep = others.length === 1 || (occ.has(1) && l !== 1);
      const t = sep ? R.w([['bar', 1], ['gan', 1], ['none', 0.6]]) : R.w([['bar', 1], ['gan', 1], ['block', 0.8], ['none', 0.5]]);
      if (t === 'bar') { C.bar(l, rs); C.arc(l, rs); }
      else if (t === 'gan') { C.gan(l, rs); C.line(l, rs - 4, rs + 3, 0.5, 1.8); }
      else if (t === 'block') C.block(l, rs - 2, 4.2);
      else C.line(l, rs - 6, rs + 6);
      rs += this.spacing(C, 1.0, 1.15);
    }
    for (const t of trains) if (t.ramp || R.ch(0.3)) C.roofLine(t);
    C.cur = tEnd + v * 0.95 + 2; C.need(C.cur);
  }

  pRoofRun(C) {
    const R = C.R, v = C.v, d = C.d;
    const first = R.i(0, 2);
    let s = C.cur;
    const tr = [];
    tr.push(C.train(first, s + RAMP_LEN, R.i(3, 4), true));
    for (let l = 0; l < 3; l++) if (l !== first) {
      const ramp = R.ch(0.4);
      const st = s + RAMP_LEN + R.f(5, 16);
      tr.push(C.train(l, st, R.i(2, 4), ramp));
    }
    // 车顶上蜿蜒的星尘
    let l = first;
    const sEnd = Math.min(...tr.map((t) => t.s1)) - 2;
    C.roofLine(tr[0]);
    for (let ss = tr[0].s0 + 18; ss < sEnd; ss += 16) {
      const nl = Math.max(0, Math.min(2, l + R.pick([-1, 1])));
      const t = tr.find((x) => x.lane === nl);
      if (t && t.s0 < ss - 2 && t.s1 > ss + 12) {
        for (let k = 0; k < 4; k++) C.mote(LANE_X[nl], ROOF_H + 1.0, ss + k * 2.6);
        l = nl;
      }
    }
    const tEnd = Math.max(...tr.map((t) => t.s1));
    C.cur = tEnd + v * 0.95 + 2; C.need(C.cur);
    if (d > 0.6 && R.ch(0.4)) { // 跳下车顶后马上来一道全宽门架
      C.ganWide(C.cur + v * 0.5); C.cur += v * 0.9; C.need(C.cur);
    }
  }

  pOncoming(C) {
    const R = C.R, v = C.v, d = C.d;
    const n = R.i(1, 2 + (d > 0.5 ? 1 : 0));
    let s = C.cur + v * 0.6;
    let last = -1;
    for (let i = 0; i < n; i++) {
      let l = R.i(0, 2);
      if (l === last) l = (l + R.i(1, 2)) % 3;
      const f = C.oncoming(l, s, R.i(2, 3), R.f(0.45, 0.8));
      // 另一条轨道上偶尔加点料
      if (d > 0.35 && R.ch(0.5)) {
        const o = R.pick([0, 1, 2].filter((x) => x !== l));
        if (R.ch(0.5)) { C.bar(o, s + 2); C.arc(o, s + 2); } else { C.gan(o, s + 2); C.line(o, s - 2, s + 5, 0.5, 1.8); }
      } else {
        const o = R.pick([0, 1, 2].filter((x) => x !== l));
        C.line(o, s - v * 0.6, s + 6);
      }
      last = l;
      C.need(f.s1 + 2);
      s += v * R.f(0.95, 1.5);
    }
    C.cur = Math.max(s - v * 0.4, C.end); C.need(C.cur);
  }

  pGaps(C) {
    const R = C.R, v = C.v;
    const n = R.i(2, 4);
    let s = C.cur;
    for (let i = 0; i < n; i++) {
      const gl = this.gapLen(C);
      if (R.ch(0.4)) {
        C.gap(7, s - gl / 2, gl);
        C.arc(R.i(0, 2), s);
      } else {
        const ls = R.shuffle([0, 1, 2]);
        const k = R.i(1, 2);
        let mask = 0; for (let j = 0; j < k; j++) mask |= 1 << ls[j];
        C.gap(mask, s - gl / 2, gl);
        C.arc(ls[0], s);
        if (k === 1 && R.ch(0.5)) { C.bar(ls[1], s); }
        else C.line(ls[2], s - v * 0.5, s + 3);
      }
      s += v * R.f(1.05, 1.4) + gl / 2;
    }
    C.cur = s - v * 0.5; C.need(C.cur);
  }

  pMixed(C) {
    const R = C.R, v = C.v;
    let s = C.cur;
    const ls = R.shuffle([0, 1, 2]);
    const t = C.train(ls[0], s + RAMP_LEN, R.i(3, 4), true);
    C.roofLine(t);
    const on = C.oncoming(ls[1], s + v * R.f(1.1, 1.8), R.i(2, 3), R.f(0.5, 0.8));
    let rs = s + v * 0.9;
    while (rs < t.s1 - 4) {
      if (R.ch(0.5)) { C.bar(ls[2], rs); C.arc(ls[2], rs); } else { C.gan(ls[2], rs); C.line(ls[2], rs - 4, rs + 3, 0.5, 1.8); }
      rs += this.spacing(C, 1.05, 1.2);
    }
    C.cur = Math.max(t.s1 + v * 0.95 + 2, on.s1 + 4); C.need(C.cur);
  }

  // ——— 收尾：过滤、校验、放道具 ———
  finish(C, opts, force = false) {
    const chunk = { s0: C.s0, len: 0, v: C.v, d: C.d, feats: [], motes: [], pows: [] };
    // 保留区（迎面车道）与清空区
    const span = (f) => {
      if (f.t === ONCOMING) return [f.sm - 10, f.sm + f.Lt + 62];
      return [f.t === TRAIN && f.ramp ? f.s0 - RAMP_LEN : f.s0, f.s1];
    };
    const blockedBy = (f) => {
      const [lo, hi] = span(f);
      for (const r of this.reserve) if ((f.mask & (1 << r.lane)) && hi > r.s0 && lo < r.s1) return true;
      for (const z of this.clearZones) if (hi > z.s0 && lo < z.s1) return true;
      return false;
    };
    let feats = C.feats.filter((f) => !blockedBy(f));
    // 同一区段内：迎面车驶来的整条路径上不能有别的东西
    const onc = feats.filter((f) => f.t === ONCOMING);
    feats = feats.filter((f) => !onc.some((o) => o !== f && (f.mask & (1 << o.lane)) && span(f)[1] > o.sm - 3 && span(f)[0] < o.sm + o.Lt + 62));
    chunk.feats = feats;
    chunk.len = Math.ceil(C.end - C.s0 + 2);
    // 末尾的迎面车需要在本区段内留出足够空间
    for (const f of chunk.feats) if (f.t === ONCOMING) chunk.len = Math.max(chunk.len, Math.ceil(f.s1 - C.s0 + 4));
    const grid = buildGrid(chunk);
    const val = new Validator(grid, C.v);
    if (!val.passable()) {
      if (!force) return null;
    }
    chunk.grid = grid; chunk.val = val;
    // 星尘：去掉与障碍重叠的
    chunk.motes = C.motes.filter((m) => this.moteOK(m, chunk)).sort((a, b) => a.s - b.s);
    // 道具
    if (opts.pow) this.placePow(chunk, opts.pow, val);
    return chunk;
  }

  moteOK(m, chunk) {
    if (m.s < chunk.s0 + 2 || m.s > chunk.s0 + chunk.len - 1) return false;
    const lanes = [];
    for (let l = 0; l < 3; l++) if (Math.abs(m.x - LANE_X[l]) < 1.6) lanes.push(l);
    for (const r of this.reserve) if (lanes.includes(r.lane) && m.s > r.s0 && m.s < r.s1) return false;
    for (const f of chunk.feats) {
      if (!lanes.some((l) => f.mask & (1 << l))) continue;
      if (f.t === ONCOMING) { if (m.s > f.sm - 3 && m.s < f.sm + f.Lt + 62) return false; continue; }
      if (f.t === TRAIN) {
        if (m.s > f.s0 - 0.8 && m.s < f.s1 + 0.8 && m.y < ROOF_H + 0.45) return false;
        if (f.ramp && m.s > f.s0 - RAMP_LEN && m.s <= f.s0) {
          const h = ROOF_H * (m.s - (f.s0 - RAMP_LEN)) / RAMP_LEN;
          if (m.y < h + 0.45) return false;
        }
        continue;
      }
      if (m.s < f.s0 - 0.8 || m.s > f.s1 + 0.8) continue;
      if (f.t === BLOCK && m.y < CONT_H + 0.4) return false;
      if (f.t === BARRIER && m.y < BAR_H + 0.35) return false;
      if (f.t === GANTRY && m.y > GANTRY_Y - 0.45 && m.y < GANTRY_TOP + 0.3) return false;
    }
    return true;
  }

  placePow(chunk, type, val) {
    const { rG, rR } = val.reach();
    const N = val.N, cand = [];
    for (let c = Math.floor(N * 0.3); c < Math.floor(N * 0.85); c++) {
      for (let l = 0; l < 3; l++) {
        if (rG[l][c] && val.aG[l][c]) {
          let ok = true;
          for (let k = -3; k <= 4; k++) if (!val.clear(l, c + k)) { ok = false; break; }
          for (const r of this.reserve) if (r.lane === l && chunk.s0 + c > r.s0 - 5 && chunk.s0 + c < r.s1) ok = false;
          if (ok) cand.push([c, l, 0]);
        }
        if (rR[l][c] && val.aR[l][c] && (val.F(l, c + 3) & ROOF) && (val.F(l, c - 3) & ROOF)) cand.push([c, l, 1]);
      }
    }
    if (!cand.length) return;
    const [c, l, lvl] = this.R.pick(cand);
    const s = chunk.s0 + c + 0.5;
    chunk.pows.push({ type, x: LANE_X[l], y: (lvl ? ROOF_H : 0) + 1.15, s, lane: l });
    // 别让星尘和道具重叠
    chunk.motes = chunk.motes.filter((m) => !(Math.abs(m.s - s) < 2.5 && Math.abs(m.x - LANE_X[l]) < 1));
  }

  // 喷射背包等：清空 [s0,s1] 内（含未来生成）的障碍
  addClearZone(s0, s1) { this.clearZones.push({ s0, s1 }); }
}
