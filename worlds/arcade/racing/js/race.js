/* 星际竞速 · 比赛逻辑：发车格、倒计时、圈数、碰撞、加速带、尾流、幽灵记录 */
import { Racer, SHIP_HALF_W, SHIP_LEN } from './physics.js';
import { AIDriver } from './ai.js';
import { RIVALS, PLAYER_SHIP } from './config.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export function mulberry(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export const GHOST_HZ = 20;

export class Race {
  /**
   * mode: 'race' | 'trial' | 'attract'
   */
  constructor(track, mode, opts = {}) {
    this.track = track;
    this.mode = mode;
    this.laps = track.def.laps;
    this.clock = -3.6;        // <0 倒计时
    this.started = false;
    this.over = false;
    this.events = [];
    this.racers = [];
    this.drivers = new Map();
    this.rand = mulberry(opts.seed || (Date.now() & 0xffff));
    const L = track.length;
    const skill = track.def.aiSkill;

    const gridPos = (slot) => {
      const row = Math.floor(slot / 2), col = slot % 2;
      return { dist: -10 - row * 11 - col * 5.5, x: (col ? -1 : 1) * track.half * 0.36 };
    };

    if (mode !== 'attract') {
      const p = new Racer(track, { id: 'player', name: '你', team: PLAYER_SHIP.team, isPlayer: true, color: opts.paint.glow, assist: opts.touch ? 1.7 : 1.05 });
      this.player = p;
    }
    if (mode === 'race' || mode === 'attract') {
      const order = RIVALS.slice();
      // 打乱对手发车位
      for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(this.rand() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
      const count = mode === 'attract' ? 6 : 5;
      for (let i = 0; i < count; i++) {
        const per = mode === 'attract' && i === 5 ? { ...RIVALS[0], id: 'attract6', name: '流光', team: PLAYER_SHIP.team, paint: opts.paint, skill: 0.99, aggr: 0.2 } : order[i];
        const r = new Racer(track, { id: per.id, name: per.name, team: per.team, color: per.paint.glow, assist: 0 });
        r.persona = per;
        const ai = new AIDriver(r, per, this.rand);
        const t = (per.skill - 0.975) / 0.04; // 0..1 映射到赛道强度区间
        ai.base = skill[0] + (skill[1] - skill[0]) * clamp(t, 0, 1);
        if (mode === 'attract') ai.base = 0.95 + 0.04 * this.rand();
        r.speedMult = ai.base;
        this.racers.push(r);
        this.drivers.set(r, ai);
      }
    }
    if (this.player) this.racers.push(this.player); // 玩家在最后一个发车位
    this.racers.forEach((r, i) => { const g = gridPos(i); r.reset(g.dist, g.x); });
    if (mode === 'trial' && this.player) this.player.reset(-14, 0);

    // 幽灵
    this.ghost = opts.ghost || null; // {lap, data:[s,x,psi,roll...]}
    this.rec = [];
    this.recT = 0;
    this.bestLap = Infinity;
    this.bestLapGhost = null;
    this.autopilot = null;
    this.perfectWindow = false;
    this.lastLeader = null;
  }

  progress(r) { return r.finished ? this.laps * this.track.length + 1e6 - r.finishTime * 1000 : r.dist; }

  /** a 相对 b 的前方距离（考虑环形）；同圈附近才有意义 */
  gap(a, b) {
    const L = this.track.length;
    let d = (a.dist - b.dist) % L;
    if (d > L / 2) d -= L; if (d < -L / 2) d += L;
    return d;
  }

  nextPad(s, within) {
    let best = null, bd = within;
    for (const p of this.track.pads) {
      let d = p.s - s; if (d < 0) d += this.track.length;
      if (d > 8 && d < bd) { bd = d; best = p; }
    }
    return best;
  }

  setAutopilot(on) {
    if (!this.player) return;
    if (on && !this.autopilot) {
      this.autopilot = new AIDriver(this.player, { ...RIVALS[1], aggr: 0, wobble: 0, boost: 1, line: 1, drift: 1 }, this.rand);
      this.autopilot.base = 1;
      this.autopilot.react = 0;
    } else if (!on) this.autopilot = null;
  }

  emit(type, data) { this.events.push({ type, ...data }); }

  /** 主更新：dt 秒，内部细分子步 */
  update(dt) {
    const prevClock = this.clock;
    this.clock += dt;
    if (!this.started) {
      // 倒计时节拍
      for (const n of [3, 2, 1]) if (prevClock < -n && this.clock >= -n) this.emit('count', { n });
      if (this.clock >= 0) { this.started = true; this.emit('go'); this.goTime = 0; }
      // 起步窗口：倒计时最后 0.35 秒按加速
      for (const r of this.racers) { r.events.length = 0; }
      if (this.player && this.player.input.boost && this.clock > -0.4 && !this.perfectTried) { this.perfectTried = true; this.perfectArmed = true; }
      else if (this.player && this.player.input.boost && this.clock < -0.4) this.perfectTried = true;
      return;
    }
    const n = Math.max(1, Math.ceil(dt / (1 / 120)));
    const h = dt / n;
    for (let i = 0; i < n; i++) this.substep(h, this.clock - dt + h * (i + 1));
  }

  substep(h, now) {
    const L = this.track.length;
    if (this.perfectArmed && this.player) {
      this.perfectArmed = false;
      const p = this.player;
      p.boostT = 1.6; p.vf += 18; p.stats.boosts++;
      this.emit('perfect');
    }
    for (const r of this.racers) {
      const d = this.drivers.get(r) || (r === this.player ? this.autopilot : null);
      if (d && (!r.isPlayer || this.autopilot || r.finished)) d.update(h, this);
      else if (r.isPlayer && r.finished) { r.input.steer = -r.x * 0.05; r.input.boost = false; }
      r.step(h, now);
    }
    // 碰撞（赛道坐标中的胶囊近似）
    const rs = this.racers;
    for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) {
      const a = rs[i], b = rs[j];
      const ds = this.gap(a, b);
      const dx = a.x - b.x;
      if (Math.abs(ds) < SHIP_LEN && Math.abs(dx) < SHIP_HALF_W * 2) {
        const ox = SHIP_HALF_W * 2 - Math.abs(dx);
        const os = SHIP_LEN - Math.abs(ds);
        const sx = Math.sign(dx) || (this.rand() < 0.5 ? 1 : -1);
        if (ox < os * 0.9) {
          // 侧面碰撞：横向推开
          a.x += sx * ox * 0.5; b.x -= sx * ox * 0.5;
          const rel = (a.vp - b.vp);
          a.vp = -sx * Math.abs(rel) * 0.15 + sx * 3; b.vp = sx * Math.abs(rel) * 0.15 - sx * 3;
          a.yawRate += sx * 0.25; b.yawRate -= sx * 0.25;
        } else {
          // 追尾：后车减速、前车略加速
          const front = ds > 0 ? a : b, back = ds > 0 ? b : a;
          const sep = os;
          front.dist += sep * 0.5; back.dist -= sep * 0.5;
          const dv = back.vf - front.vf;
          if (dv > 0) { back.vf -= dv * 0.55; front.vf += dv * 0.35; }
          a.x += sx * 0.3; b.x -= sx * 0.3;
        }
        const now2 = this.clock;
        if (!a._bumpT || now2 - a._bumpT > 0.35) {
          a._bumpT = b._bumpT = now2;
          a.stats.bumps++; b.stats.bumps++;
          this.emit('bump', { a, b, power: Math.min(1, Math.abs(a.vf - b.vf) / 20 + 0.3) });
          if (a.drifting && a.isPlayer) a.endDrift(false);
          if (b.drifting && b.isPlayer) b.endDrift(false);
        }
      }
    }
    // 尾流 + 加速带 + 圈数
    for (const r of rs) {
      let slipT = 0;
      for (const o of rs) {
        if (o === r) continue;
        const d = this.gap(o, r);
        if (d > 6 && d < 34 && Math.abs(o.x - r.x) < 3.2 && o.speed > 40) { slipT = 1; break; }
      }
      r.slip += (slipT - r.slip) * (1 - Math.exp(-(slipT ? 1.8 : 4) * h));
      if (slipT && r.isPlayer) r.energy = Math.min(3, r.energy + 0.05 * h);
      // 加速带
      const s = r.s;
      for (let pi = 0; pi < this.track.pads.length; pi++) {
        const p = this.track.pads[pi];
        let d = s - p.s; if (d > L / 2) d -= L; if (d < -L / 2) d += L;
        if (Math.abs(d) < p.len / 2 && Math.abs(r.x - p.x) < p.w / 2 + 0.6) {
          const last = r.padCooldown.get(pi) || -9;
          if (now - last > 1.2) { r.padCooldown.set(pi, now); r.hitPad(); }
        }
      }
      // 圈数
      const lapNow = Math.floor(r.dist / L);
      if (lapNow > r.lap && r.dist > 0) {
        r.lap = lapNow;
        const lt = now - r.lapStart;
        r.lapTimes.push(lt);
        r.lapStart = now;
        if (r.isPlayer) this.onPlayerLap(r, lt);
        if (r.lap >= this.laps && !r.finished && this.mode !== 'attract') {
          r.finished = true; r.finishTime = now;
          r.place = rs.filter((o) => o.finished).length;
          this.emit('finish', { r });
        } else if (r.isPlayer) this.emit('lap', { r, lap: r.lap, time: lt, final: r.lap === this.laps - 1 });
        if (r.isPlayer) r.stats.lapWallHits = 0;
      }
    }
    // 幽灵记录（玩家，计时赛）
    if (this.player && this.mode === 'trial' && !this.player.finished) {
      this.recT += h;
      while (this.recT >= 1 / GHOST_HZ) {
        this.recT -= 1 / GHOST_HZ;
        const p = this.player;
        const lapDist = p.dist - p.lap * L;
        this.rec.push(Math.round(lapDist * 10) / 10, Math.round(p.x * 100) / 100, Math.round(p.psi * 1000) / 1000, Math.round(p.rollV * 1000) / 1000);
      }
    }
    // 名次
    const sorted = rs.slice().sort((a, b) => this.progress(b) - this.progress(a));
    sorted.forEach((r, i) => { if (!r.finished) r.place = i + 1; });
    this.order = sorted;
  }

  onPlayerLap(p, lt) {
    if (lt < this.bestLap) {
      this.bestLap = lt;
      if (this.mode === 'trial') this.bestLapGhost = { lap: lt, data: this.rec.slice(), hz: GHOST_HZ };
    }
    this.rec.length = 0;
    this.recT = 0;
  }

  /** 幽灵在本圈 t 秒时的状态 */
  ghostState(t) {
    const g = this.ghost;
    if (!g || !g.data || g.data.length < 8) return null;
    const idx = t * g.hz;
    const n = g.data.length / 4;
    if (idx >= n - 1) return null;
    const i = Math.floor(idx), f = idx - i;
    const a = i * 4, b = (i + 1) * 4, d = g.data;
    return { dist: d[a] + (d[b] - d[a]) * f, x: d[a + 1] + (d[b + 1] - d[a + 1]) * f, psi: d[a + 2] + (d[b + 2] - d[a + 2]) * f, roll: d[a + 3] + (d[b + 3] - d[a + 3]) * f };
  }

  /** 幽灵到达本圈距离 dist 所用的时间（秒），用于计算差值 */
  ghostTimeAt(dist) {
    const g = this.ghost;
    if (!g || !g.data) return null;
    const d = g.data, n = d.length / 4;
    let lo = 0, hi = n - 1;
    if (dist <= d[0] || dist >= d[(n - 1) * 4]) return null;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (d[mid * 4] < dist) lo = mid; else hi = mid; }
    const a = d[lo * 4], b = d[hi * 4];
    const f = b > a ? (dist - a) / (b - a) : 0;
    return (lo + f) / g.hz;
  }

  /** 玩家完赛后估算其余车手成绩 */
  finalizeOthers() {
    const L = this.track.length;
    const now = this.clock;
    const unfinished = this.racers.filter((r) => !r.finished);
    unfinished.sort((a, b) => b.dist - a.dist);
    for (const r of unfinished) {
      const remain = this.laps * L - r.dist;
      const avg = Math.max(55, r.dist / Math.max(1, now));
      r.finishTime = now + remain / (avg * 0.98);
      r.estimated = true;
    }
    const all = this.racers.slice().sort((a, b) => a.finishTime - b.finishTime);
    all.forEach((r, i) => { r.finalPlace = i + 1; });
    return all;
  }
}
