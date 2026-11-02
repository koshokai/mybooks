// 星环列车 · 游戏模拟（纯逻辑：物理、碰撞、道具、计分、事件、自动驾驶机器人）
import {
  LANE_X, LANE_W, DECK_HW, BAR_H, GANTRY_Y, GANTRY_TOP, CONT_H, ROOF_H, SHUTTLE_H, RAMP_LEN,
  OBST_HW, TRAIN_HW, P_HW, P_HD, P_STAND, P_SLIDE, FOOT_HW, GRAV, JUMP_V, SLIDE_T, LANE_RATE, STEP_UP,
  JET_T, JET_Y, MAGNET_T, DOUBLE_T, SHIELD_T, MAGNET_R, GEN_AHEAD, BIOME_SECONDS, speedAt, diffAt,
} from './config.js';
import { Generator, BARRIER, GANTRY, BLOCK, GAP, TRAIN, ONCOMING, mulberry32, buildGrid, Validator } from './gen.js';

const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
export function laneOf(x) { return x < -LANE_W / 2 ? 0 : x > LANE_W / 2 ? 2 : 1; }

export class Sim {
  constructor() {
    this.events = [];
    this.bot = false;
    this.level = 0;
    this.mode = 'idle';
  }

  reset(seed = (Math.random() * 2 ** 31) | 0, level = 0) {
    this.seed = seed;
    this.level = level;
    this.gen = new Generator(seed);
    this.R = mulberry32((seed ^ 0x9e3779b9) >>> 0);
    this.t = 0; this.dist = 0; this.speed = 0; this.launch = 0;
    this.mode = 'run';
    this.chunks = []; this.genS = 0; this.fid = 0;
    this.sky = { s0: 0, len: 0, motes: [] };
    this.p = {
      lane: 1, fromLane: 1, x: 0, y: 0, vy: 0, s: 0, grounded: true, coyote: 0,
      slideT: 0, jumpBuf: 0, slideBuf: false, fastFall: false, glide: false, jetting: false,
      inv: 0, stumbleT: 0, lastLand: 0, flip: false,
    };
    this.pw = { magnet: 0, shield: 0, jet: 0, double: 0 };
    this.distPts = 0; this.motePts = 0; this.bonusPts = 0; this.motes = 0;
    this.stats = { jumps: 0, slides: 0, switches: 0, powerups: 0, jets: 0, nearMiss: 0, roof: 0, cleanDist: 0, maxClean: 0, stumbles: 0, biome: 0, shieldSaves: 0 };
    this.nextPowT = 13; this.powCount = 0; this.lastPow = ''; this.hadJet = false;
    this.revived = false; this.dieT = 0; this.deathKind = '';
    this.botCool = 0;
    this.events.length = 0;
    this.ensureChunks();
  }

  emit(type, data) { const e = data || {}; e.type = type; this.events.push(e); }
  get score() { return Math.floor(this.distPts + this.motePts + this.bonusPts); }
  get mult() { return (1 + this.level) * (this.pw.double > 0 ? 2 : 1); }
  pH() { return this.p.slideT > 0 ? P_SLIDE : P_STAND; }
  biomeIndex() { return Math.floor(this.t / BIOME_SECONDS); }

  // ——————————————————— 轨道生成 ———————————————————
  ensureChunks() {
    while (this.genS < this.dist + GEN_AHEAD) {
      const vNow = Math.max(12, this.speed || 14);
      const tArr = this.t + Math.max(0, this.genS - this.dist) / vNow;
      const v = speedAt(tArr + 12) * 1.03;
      const d = diffAt(tArr);
      let pow = null;
      if (tArr >= this.nextPowT && this.chunks.length > 0) pow = this.choosePow();
      const ch = this.gen.next(this.genS, v, d, { pow });
      if (pow && ch.pows.length) {
        this.nextPowT = tArr + 15 + this.R() * 10;
        this.lastPow = pow; this.powCount++;
        if (pow === 'jet') this.hadJet = true;
      }
      for (const f of ch.feats) { f.id = ++this.fid; f.dead = false; f.honked = false; f.passed = false; }
      for (const m of ch.motes) { m.alive = true; m.home = 0; }
      for (const w of ch.pows) w.alive = true;
      this.chunks.push(ch);
      this.genS = ch.s0 + ch.len;
    }
    while (this.chunks.length > 1 && this.chunks[0].s0 + this.chunks[0].len < this.dist - 60) this.chunks.shift();
    if (this.sky.motes.length && this.sky.motes[this.sky.motes.length - 1].s < this.dist - 20) this.sky.motes.length = 0;
  }

  choosePow() {
    if (this.powCount === 1 && !this.hadJet) return 'jet';
    const w = [['magnet', 1], ['shield', 0.85], ['jet', 0.7], ['double', 0.9]].filter((x) => x[0] !== this.lastPow);
    let tot = 0; for (const x of w) tot += x[1];
    let r = this.R() * tot;
    for (const x of w) { r -= x[1]; if (r <= 0) return x[0]; }
    return w[0][0];
  }

  chunkAt(s) {
    for (const c of this.chunks) if (s >= c.s0 && s < c.s0 + c.len) return c;
    return null;
  }

  // 迎面穿梭车车头位置（以玩家位置为参数，保证在 sm 处相遇）
  oncFront(f, ps = this.p.s) { return f.sm + (f.sm - ps) * f.k; }

  // ——————————————————— 输入 ———————————————————
  input(a) {
    if (this.mode !== 'run') return;
    const p = this.p;
    if (a === 'left' || a === 'right') {
      const nl = clamp(p.lane + (a === 'left' ? -1 : 1), 0, 2);
      if (nl !== p.lane) {
        p.fromLane = p.lane; p.lane = nl; this.stats.switches++;
        this.emit('lane', { dir: a === 'left' ? -1 : 1 });
      } else this.emit('edge', { dir: a === 'left' ? -1 : 1 });
    } else if (a === 'jump') {
      if (this.pw.jet > 0) return;
      if (p.grounded || p.coyote > 0) this.doJump();
      else p.jumpBuf = 0.18;
    } else if (a === 'slide') {
      if (this.pw.jet > 0) return;
      if (p.grounded) this.startSlide();
      else { p.fastFall = true; p.slideBuf = true; p.jumpBuf = 0; this.emit('dive'); }
    }
  }

  doJump() {
    const p = this.p;
    p.vy = JUMP_V; p.grounded = false; p.coyote = 0; p.slideT = 0; p.jumpBuf = 0; p.fastFall = false; p.slideBuf = false;
    p.flip = this.R() < 0.28;
    this.stats.jumps++;
    this.emit('jump', { flip: p.flip });
  }

  startSlide() {
    const p = this.p;
    if (p.slideT <= 0) { this.stats.slides++; this.emit('slide'); }
    p.slideT = SLIDE_T; p.slideBuf = false;
  }

  // ——————————————————— 地面与碰撞 ———————————————————
  *nearFeats(s, back = 50, fwd = 12) {
    for (const ch of this.chunks) {
      if (ch.s0 > s + fwd + 120 || ch.s0 + ch.len < s - back) continue;
      for (const f of ch.feats) if (!f.dead) yield f;
    }
  }

  inGap(l, s) {
    for (const f of this.nearFeats(s, 10, 10)) {
      if (f.t === GAP && (f.mask & (1 << l)) && s > f.s0 + 0.18 && s < f.s1 - 0.18) return true;
    }
    return false;
  }

  floorAt(x, s, y) {
    let best = -Infinity;
    const la = laneOf(x - FOOT_HW), lb = laneOf(x + FOOT_HW);
    for (let l = la; l <= lb; l++) if (!this.inGap(l, s)) { best = 0; break; }
    const fx0 = x - FOOT_HW, fx1 = x + FOOT_HW;
    for (const f of this.nearFeats(s, 60, RAMP_LEN + 2)) {
      if (f.t !== TRAIN && f.t !== BLOCK) continue;
      for (let l = 0; l < 3; l++) {
        if (!(f.mask & (1 << l))) continue;
        const hw = f.t === TRAIN ? TRAIN_HW : OBST_HW;
        if (fx1 <= LANE_X[l] - hw || fx0 >= LANE_X[l] + hw) continue;
        let top = -Infinity;
        if (s >= f.s0 && s <= f.s1) top = f.t === TRAIN ? ROOF_H : CONT_H;
        else if (f.t === TRAIN && f.ramp && s >= f.s0 - RAMP_LEN && s < f.s0) top = ROOF_H * (s - (f.s0 - RAMP_LEN)) / RAMP_LEN;
        if (top > best && y >= top - STEP_UP) best = top;
      }
    }
    return best;
  }

  boxesOf(f, ps, out) {
    out.length = 0;
    const lanes = [];
    for (let l = 0; l < 3; l++) if (f.mask & (1 << l)) lanes.push(l);
    switch (f.t) {
      case BARRIER: for (const l of lanes) out.push([LANE_X[l] - OBST_HW, LANE_X[l] + OBST_HW, 0, BAR_H, f.s0, f.s1, 1]); break;
      case GANTRY:
        if (f.wide) out.push([-DECK_HW, DECK_HW, GANTRY_Y, GANTRY_TOP, f.s0, f.s1, 0]);
        else for (const l of lanes) {
          out.push([LANE_X[l] - 1.15, LANE_X[l] + 1.15, GANTRY_Y, GANTRY_TOP, f.s0, f.s1, 0]);
          out.push([LANE_X[l] - 1.25, LANE_X[l] - 1.06, 0, GANTRY_TOP, f.s0, f.s1, 0]);
          out.push([LANE_X[l] + 1.06, LANE_X[l] + 1.25, 0, GANTRY_TOP, f.s0, f.s1, 0]);
        }
        break;
      case BLOCK: for (const l of lanes) out.push([LANE_X[l] - OBST_HW, LANE_X[l] + OBST_HW, 0, CONT_H, f.s0, f.s1, 1]); break;
      case TRAIN: for (const l of lanes) out.push([LANE_X[l] - TRAIN_HW, LANE_X[l] + TRAIN_HW, 0, ROOF_H, f.s0, f.s1, 1]); break;
      case ONCOMING: {
        const fr = this.oncFront(f, ps);
        for (const l of lanes) out.push([LANE_X[l] - TRAIN_HW, LANE_X[l] + TRAIN_HW, 0, SHUTTLE_H, fr, fr + f.Lt, 0]);
        break;
      }
    }
    return out;
  }

  collide(prev) {
    const p = this.p;
    if (this.pw.jet > 0 && p.y > 3.8) return;
    const h = this.pH();
    const x0 = p.x - P_HW, x1 = p.x + P_HW, y0 = p.y + 0.06, y1 = p.y + h, s0 = p.s - P_HD, s1 = p.s + P_HD;
    const px0 = prev.x - P_HW, px1 = prev.x + P_HW, py0 = prev.y + 0.06, py1 = prev.y + prev.h, ps0 = prev.s - P_HD, ps1 = prev.s + P_HD;
    const B = this._boxes || (this._boxes = []);
    const BP = this._boxesP || (this._boxesP = []);
    for (const f of this.nearFeats(p.s, 70, 40)) {
      if (f.t === GAP) continue;
      if (f.t !== ONCOMING && (f.s0 > s1 + 1 || f.s1 < s0 - 1)) continue;
      this.boxesOf(f, p.s, B);
      if (f.t === ONCOMING) this.boxesOf(f, prev.s, BP);
      for (let i = 0; i < B.length; i++) {
        const b = B[i];
        if (!(x1 > b[0] && x0 < b[1] && y1 > b[2] && y0 < b[3] && s1 > b[4] && s0 < b[5])) continue;
        // 可站立的顶面：脚已接近顶面（坡道末端、跳上车顶）时算台阶，交给地面逻辑抬上去
        if (b[6] && y0 >= b[3] - (f.t === BARRIER ? 0.25 : STEP_UP)) continue;
        const bp = f.t === ONCOMING ? BP[i] : b;
        const ox = px1 > bp[0] && px0 < bp[1];
        const os = ps1 > bp[4] && ps0 < bp[5];
        const oy = py1 > bp[2] && py0 < bp[3];
        if (os && ox && !oy && py0 >= bp[3] - 0.02 && b[6]) {
          // 从上方落到障碍顶上：站上去
          p.y = b[3]; if (p.vy < 0) { this.landed(-p.vy); }
          continue;
        }
        if (os && !ox) { this.sideHit(f, b, prev); return; }
        if (p.inv > 0) continue;
        this.crash(f.t === ONCOMING ? 'shuttle' : f.t === GANTRY ? 'gantry' : f.t === BARRIER ? 'barrier' : f.t === TRAIN ? 'train' : 'block', f);
        return;
      }
    }
  }

  sideHit(f, b, prev) {
    const p = this.p;
    // 回到障碍外侧最近的那条轨道
    const left = prev.x < (b[0] + b[1]) / 2;
    let target = p.fromLane;
    if (left) { for (let l = 2; l >= 0; l--) if (LANE_X[l] + P_HW < b[0] - 0.01) { target = l; break; } }
    else { for (let l = 0; l < 3; l++) if (LANE_X[l] - P_HW > b[1] + 0.01) { target = l; break; } }
    p.x = prev.x; p.lane = target; p.fromLane = target;
    if (p.inv > 0) return;
    if (p.stumbleT > 0) {
      this.crash('stumble', f);
      return;
    }
    p.stumbleT = 3.2;
    this.stats.stumbles++;
    this.stats.cleanDist = 0;
    this.emit('stumble', { dir: left ? -1 : 1 });
  }

  crash(kind, f) {
    const p = this.p;
    if (p.inv > 0 && kind !== 'fall') return;
    if (this.pw.shield > 0) {
      this.pw.shield = 0;
      p.inv = 1.3; p.stumbleT = 0;
      this.stats.shieldSaves++;
      this.stats.cleanDist = 0;
      if (f) f.dead = true;
      if (kind === 'fall') { p.vy = JUMP_V * 1.45; p.grounded = false; p.y = Math.max(p.y, -0.5); }
      this.emit('shieldbreak', { kind, f });
      return;
    }
    this.mode = 'dying'; this.dieT = 0; this.deathKind = kind;
    this.emit('crash', { kind, f });
  }

  landed(impact) {
    const p = this.p;
    p.grounded = true; p.vy = 0; p.fastFall = false; p.glide = false;
    p.lastLand = impact;
    this.emit('land', { impact });
    if (p.jumpBuf > 0) this.doJump();
    else if (p.slideBuf) this.startSlide();
  }

  underGantry() {
    const p = this.p;
    for (const f of this.nearFeats(p.s, 5, 5)) {
      if (f.t !== GANTRY) continue;
      if (f.s1 < p.s - P_HD - 0.1 || f.s0 > p.s + P_HD + 0.1) continue;
      if (f.wide || Math.abs(LANE_X[f.lane] - p.x) < 1.2 + P_HW) return true;
    }
    return false;
  }

  // ——————————————————— 每一步 ———————————————————
  step(dt) {
    if (this.mode === 'dying') {
      this.dieT += dt;
      if (this.dieT > 1.15) { this.mode = 'dead'; this.emit('dead'); }
      return;
    }
    if (this.mode !== 'run') return;
    const p = this.p;
    if (this.bot) this.botThink(dt);
    this.t += dt;
    this.launch = Math.min(1, this.launch + dt / 0.9);
    const lf = 0.3 + 0.7 * (1 - Math.pow(1 - this.launch, 3));
    this.speed = speedAt(this.t) * lf;
    const ds = this.speed * dt;
    const prev = { x: p.x, y: p.y, s: p.s, h: this.pH() };
    p.s += ds; this.dist = p.s;

    // 计时
    for (const k in this.pw) {
      if (this.pw[k] > 0) {
        this.pw[k] = Math.max(0, this.pw[k] - dt);
        if (this.pw[k] === 0) this.emit('powend', { pw: k });
      }
    }
    p.inv = Math.max(0, p.inv - dt);
    p.stumbleT = Math.max(0, p.stumbleT - dt);
    p.jumpBuf = Math.max(0, p.jumpBuf - dt);
    p.coyote = Math.max(0, p.coyote - dt);
    if (p.slideT > 0) {
      p.slideT -= dt;
      if (p.slideT <= 0) { if (this.underGantry()) p.slideT = 0.08; else p.slideT = 0; }
    }

    // 横向
    p.x += (LANE_X[p.lane] - p.x) * (1 - Math.exp(-LANE_RATE * dt));

    // 纵向
    if (this.pw.jet > 0) {
      if (!p.jetting) { p.jetting = true; p.slideT = 0; }
      p.y += (JET_Y - p.y) * (1 - Math.exp(-3.4 * dt));
      p.vy = 0; p.grounded = false;
      p.inv = Math.max(p.inv, p.y < 3.8 ? 0.2 : 0);
    } else {
      if (p.jetting) { p.jetting = false; p.vy = 0; p.glide = true; p.inv = Math.max(p.inv, 1.4); }
      const floor = this.floorAt(p.x, p.s, p.y);
      if (p.grounded) {
        if (floor === -Infinity || floor < p.y - 0.06) { p.grounded = false; p.vy = 0; p.coyote = 0.1; }
        else p.y = floor;
      }
      if (!p.grounded) {
        let g = GRAV;
        if (p.fastFall) g *= 2.7;
        if (p.glide) g *= 0.5;
        p.vy -= g * dt;
        if (p.glide) p.vy = Math.max(p.vy, -8);
        p.y += p.vy * dt;
        if (floor !== -Infinity && p.y <= floor && p.vy <= 0) { p.y = floor; this.landed(-p.vy); }
      }
      if (p.y < -1.0 && !p.grounded) {
        // 掉进断轨
        if (this.pw.shield > 0 || p.inv > 0) {
          if (this.pw.shield > 0) this.crash('fall', null);
          else { p.vy = JUMP_V * 1.4; p.y = Math.max(p.y, -0.6); }
        } else if (p.y < -2.4) { this.crash('fall', null); return; }
      }
    }

    // 碰撞
    if (this.mode === 'run') this.collide(prev);
    if (this.mode !== 'run') return;

    // 收集
    this.collect(dt);

    // 迎面车：鸣笛 / 擦肩
    for (const f of this.nearFeats(p.s, 80, 260)) {
      if (f.t !== ONCOMING) continue;
      const fr = this.oncFront(f);
      if (!f.honked && fr - p.s < 150) { f.honked = true; this.emit('horn', { lane: f.lane, same: f.lane === p.lane }); }
      if (!f.passed && fr <= p.s) {
        f.passed = true;
        const pl = laneOf(p.x);
        const adj = Math.abs(pl - f.lane) === 1;
        this.emit('passby', { lane: f.lane, adj });
        if (adj && p.y < ROOF_H - 0.5 && this.pw.jet <= 0) {
          this.stats.nearMiss++;
          const b = 50 * this.mult; this.bonusPts += b;
          this.emit('nearmiss', { bonus: b });
        }
      }
    }

    // 计分与统计
    this.distPts += ds * this.mult;
    if (p.grounded && p.y > ROOF_H - 0.2) this.stats.roof += ds;
    this.stats.cleanDist += ds;
    if (this.stats.cleanDist > this.stats.maxClean) this.stats.maxClean = this.stats.cleanDist;
    const bi = this.biomeIndex();
    if (bi > this.stats.biome) { this.stats.biome = bi; this.emit('biome', { index: bi }); }

    this.ensureChunks();
  }

  collect(dt) {
    const p = this.p;
    const mag = this.pw.magnet > 0;
    const h = this.pH();
    const reach = mag ? MAGNET_R : 2.5;
    const pc = p.y + h * 0.5;
    const lists = this.chunks.map((c) => c.motes);
    if (this.sky.motes.length) lists.push(this.sky.motes);
    for (const ms of lists) {
      for (let i = 0; i < ms.length; i++) {
        const m = ms[i];
        if (!m.alive) continue;
        const ds = m.s - p.s;
        if (ds < -3) continue;
        if (ds > reach + 3) break;
        if (m.home > 0) {
          m.home += dt / 0.24;
          const u = Math.min(1, m.home);
          const e = u * u;
          m.x = m.hx + (p.x - m.hx) * e;
          m.y = m.hy + (pc - m.hy) * e;
          m.s = m.hs + (p.s + 0.3 - m.hs) * e;
          if (u >= 1) this.takeMote(m);
          continue;
        }
        if (Math.abs(m.x - p.x) < 0.95 && Math.abs(ds) < 1.0 && m.y > p.y - 0.45 && m.y < p.y + h + 0.5) { this.takeMote(m); continue; }
        if (mag) {
          const dx = m.x - p.x, dy = m.y - pc;
          if (dx * dx + dy * dy + ds * ds < MAGNET_R * MAGNET_R && ds > -1) { m.home = 0.0001; m.hx = m.x; m.hy = m.y; m.hs = m.s; }
        }
      }
    }
    for (const ch of this.chunks) {
      for (const w of ch.pows) {
        if (!w.alive) continue;
        if (Math.abs(w.s - p.s) < 1.2 && Math.abs(w.x - p.x) < 1.15 && w.y > p.y - 0.6 && w.y < p.y + h + 0.8) {
          w.alive = false; this.activate(w.type, w);
        }
      }
    }
  }

  takeMote(m) {
    m.alive = false;
    const dbl = this.pw.double > 0 ? 2 : 1;
    this.motes += dbl;
    this.motePts += 10 * dbl;
    this.emit('mote', { x: m.x, y: m.y, s: m.s, dbl });
  }

  activate(type, w) {
    const p = this.p;
    this.stats.powerups++;
    if (type === 'magnet') this.pw.magnet = MAGNET_T;
    else if (type === 'shield') this.pw.shield = SHIELD_T;
    else if (type === 'double') this.pw.double = DOUBLE_T;
    else if (type === 'jet') this.startJet();
    this.emit('power', { pw: type, x: w ? w.x : p.x, y: w ? w.y : p.y + 1, s: w ? w.s : p.s });
  }

  startJet() {
    const p = this.p;
    this.stats.jets++;
    this.pw.jet = JET_T;
    p.grounded = false; p.slideT = 0; p.vy = 0; p.inv = Math.max(p.inv, 0.6);
    const v = Math.max(this.speed, 12);
    const sEnd = p.s + v * JET_T * 1.02;
    const z0 = sEnd - v * 0.6, z1 = sEnd + v * 2.3;
    this.clearRange(z0, z1);
    this.gen.addClearZone(z0, z1);
    // 天空中的星尘航线
    const ms = [];
    const a = p.s + v * 0.75, b = sEnd - v * 0.35;
    let lane = p.lane, next = a + 30 + this.R() * 20;
    let x = LANE_X[lane];
    for (let s = a; s < b; s += 3.0) {
      if (s > next) { lane = clamp(lane + (this.R() < 0.5 ? -1 : 1), 0, 2); next = s + 26 + this.R() * 24; }
      x += (LANE_X[lane] - x) * 0.35;
      ms.push({ x, y: JET_Y + 0.55, s, alive: true, home: 0, sky: true });
    }
    this.sky = { s0: a, len: b - a, motes: ms };
    this.emit('jetstart');
  }

  clearRange(a, b) {
    const touched = new Set();
    for (const ch of this.chunks) {
      for (const f of ch.feats) {
        if (f.dead) continue;
        let lo = f.s0, hi = f.s1;
        if (f.t === TRAIN && f.ramp) lo -= RAMP_LEN;
        if (f.t === ONCOMING) { lo = f.sm - 10; hi = f.sm + f.Lt + 62; }
        if (hi > a && lo < b) { f.dead = true; f.cleared = true; touched.add(ch); }
      }
    }
    for (const ch of touched) { ch.grid = buildGrid(ch); ch.val = new Validator(ch.grid, ch.v); }
  }

  // 复活：清掉前方一段障碍，给几秒无敌
  revive() {
    const p = this.p;
    this.revived = true;
    this.mode = 'run';
    this.clearRange(p.s - 12, p.s + Math.max(this.speed, 14) * 2.8);
    p.y = 0; p.vy = 0; p.grounded = true; p.slideT = 0; p.jumpBuf = 0; p.fastFall = false; p.glide = false;
    p.x = LANE_X[p.lane]; p.fromLane = p.lane;
    p.inv = 2.8; p.stumbleT = 0;
    this.emit('revive');
  }

  // ——————————————————— 自动驾驶（测试用） ———————————————————
  botThink(dt) {
    const p = this.p;
    this.botCool -= dt;
    if (this.pw.jet > 0) {
      for (const m of this.sky.motes) {
        if (!m.alive || m.s < p.s + 2) continue;
        if (m.s > p.s + 40) break;
        const l = laneOf(m.x);
        if (l !== p.lane && this.botCool <= 0) { this.input(l < p.lane ? 'left' : 'right'); this.botCool = 0.25; }
        break;
      }
      return;
    }
    if (!p.grounded) return;
    if (Math.abs(p.x - LANE_X[p.lane]) > 0.45) return;
    const ch = this.chunkAt(p.s);
    if (!ch || !ch.val) return;
    const V = ch.val;
    const c = Math.floor(p.s - ch.s0);
    const lvl = p.y > ROOF_H - 0.3 ? 1 : 0;
    const opts = V.options(c, p.lane, lvl).filter((o) => V.A(o[1], o[2], o[3]));
    const has = (n) => opts.some((o) => o[0] === n);
    this.botLast = opts.map((o) => o[0]).join(',');
    if (has('run')) {
      if (this.botCool <= 0) {
        const want = this.botDesire(lvl);
        if (want !== p.lane) {
          const dir = want < p.lane ? 'left' : 'right';
          if (has(dir)) { this.input(dir); this.botCool = 0.45; }
        }
      }
      return;
    }
    for (const n of ['jump', 'slide', 'left', 'right']) if (has(n)) { this.input(n); return; }
  }

  botDesire(lvl) {
    const p = this.p;
    for (const ch of this.chunks) for (const w of ch.pows) {
      if (w.alive && w.s > p.s + 4 && w.s < p.s + 45 && (w.y > ROOF_H) === (lvl === 1)) return w.lane;
    }
    const cnt = [0, 0, 0];
    for (const ch of this.chunks) for (const m of ch.motes) {
      if (!m.alive || m.s < p.s + 5) continue;
      if (m.s > p.s + 32) break;
      if ((m.y > ROOF_H + 0.3) !== (lvl === 1)) continue;
      cnt[laneOf(m.x)]++;
    }
    let best = p.lane;
    for (let l = 0; l < 3; l++) if (Math.abs(l - p.lane) === 1 && cnt[l] >= cnt[best] + 3) best = l;
    return best;
  }
}
