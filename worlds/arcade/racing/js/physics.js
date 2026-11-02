/* 星际竞速 · 物理：在赛道坐标（弧长 s、横向 x、相对朝向 psi）中模拟悬浮飞船 */

export const SHIP_HALF_W = 1.35;
export const SHIP_LEN = 4.4;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export class Racer {
  constructor(track, opts) {
    this.track = track;
    this.id = opts.id;
    this.name = opts.name;
    this.team = opts.team || '';
    this.isPlayer = !!opts.isPlayer;
    this.color = opts.color || '#ffffff';
    this.topSpeed = opts.topSpeed || 92;
    this.accel = 44;
    this.maxYaw = 1.55;
    this.assist = opts.assist != null ? opts.assist : 1.0;
    this.speedMult = 1;
    this.reset(0, 0);
  }

  reset(dist, x) {
    this.dist = dist; this.x = x; this.psi = 0;
    this.vf = 0; this.vp = 0; this.yawRate = 0;
    this.steer = 0;
    this.input = { steer: 0, drift: false, latch: false, boost: false, brake: false, throttle: 1 };
    this.boostWas = false;
    this.energy = 0;
    this.boostT = 0; this.padT = 0; this.kickT = 0;
    this.drifting = 0; this.driftT = 0; this.driftBuf = 0;
    this.slip = 0;
    this.wallT = 0; this.wallSide = 0; this.lastImpact = 0;
    this.lap = 0; this.lapStart = 0; this.lapTimes = [];
    this.finished = false; this.finishTime = 0; this.place = 0;
    this.events = [];
    this.stats = { wallHits: 0, lapWallHits: 0, boosts: 0, maxDrift: 0, driftTime: 0, pads: 0, bumps: 0 };
    this.padCooldown = new Map();
    this.rollV = 0; this.pitchV = 0;
  }

  get s() { return this.track.wrap(this.dist); }
  get speed() { return Math.hypot(this.vf, this.vp); }
  get boosting() { return this.boostT > 0 || this.padT > 0; }

  emit(type, data) { this.events.push({ type, ...data }); }

  /** 单步积分 */
  step(dt, now) {
    const tr = this.track, inp = this.input;
    const f = tr.frameAt(this.dist);
    const k = f.k;

    // —— 转向输入平滑（键盘/触屏是开关量，做成渐变）
    const want = clamp(inp.steer, -1, 1);
    const growing = Math.abs(want) > Math.abs(this.steer) && Math.sign(want || 1) === Math.sign(this.steer || want || 1);
    const rate = growing ? 6.5 : 11;
    this.steer += clamp(want - this.steer, -rate * dt, rate * dt);

    let speed = Math.hypot(this.vf, this.vp);

    // —— 漂移状态机
    if (inp.driftTap) { this.driftBuf = 0.35; inp.driftTap = false; }
    if (this.driftBuf > 0) this.driftBuf -= dt;
    if (!this.drifting) {
      const trigger = inp.drift || this.driftBuf > 0;
      if (trigger && Math.abs(want) > 0.3 && speed > 34 && !this.finished) {
        this.drifting = Math.sign(want); this.driftT = 0; this.driftBuf = 0;
        this.emit('driftStart');
      }
    } else {
      this.driftT += dt;
      const keep = inp.drift || (inp.latch && want * this.drifting > 0.3);
      if (!keep || speed < 26) this.endDrift(true);
    }

    // —— 偏航
    let target, grip, scrub;
    const brake = inp.brake;
    const yawCap = this.maxYaw * (brake ? 1.2 : 1);
    if (this.drifting) {
      const d = this.drifting;
      const sd = clamp(this.steer * d, -1, 1);
      target = d * yawCap * (0.88 + 0.55 * sd);
      grip = 3.4; scrub = 0.045;
      // 充能：角度越大、速度越快充得越快
      const charge = (0.24 + 0.2 * Math.max(0, sd)) * clamp(speed / this.topSpeed, 0.4, 1.1);
      const before = Math.floor(this.energy);
      this.energy = Math.min(3, this.energy + charge * dt);
      if (Math.floor(this.energy) > before) this.emit('charge', { level: Math.floor(this.energy) });
      this.stats.driftTime += dt;
    } else {
      target = this.steer * yawCap;
      // 漂移结束后抓地力逐渐恢复，避免甩尾
      this.gripT = (this.gripT || 0) + dt;
      grip = 3.4 + 6.1 * Math.min(1, this.gripT / 0.4); scrub = 0.085;
    }
    target -= this.psi * this.assist;
    this.yawRate += (target - this.yawRate) * (1 - Math.exp(-9 * dt));
    const dpsi = this.yawRate * dt;
    this.psi += dpsi;
    // 速度向量相对新朝向旋转（动量保留）
    let c = Math.cos(dpsi), sn = Math.sin(dpsi);
    let vf = this.vf * c + this.vp * sn;
    let vp = -this.vf * sn + this.vp * c;
    // 抓地：速度方向向机头靠拢，损失少量速度
    speed = Math.hypot(vf, vp);
    if (speed > 0.01) {
      const beta = Math.atan2(vp, vf);
      const nb = beta * Math.exp(-grip * dt);
      speed *= 1 - scrub * Math.abs(beta - nb);
      vf = speed * Math.cos(nb); vp = speed * Math.sin(nb);
    }

    // —— 推进
    if (this.boostT > 0) this.boostT = Math.max(0, this.boostT - dt);
    if (this.padT > 0) this.padT = Math.max(0, this.padT - dt);
    if (this.kickT > 0) this.kickT = Math.max(0, this.kickT - dt);
    const boostPressed = inp.boost && !this.boostWas;
    this.boostWas = inp.boost;
    if (boostPressed && this.energy >= 1 && !this.finished) {
      this.energy -= 1;
      this.boostT = Math.min(3.2, this.boostT + 1.55);
      vf += 9;
      this.stats.boosts++;
      this.emit('boost');
    }
    let mult = this.speedMult * (1 + 0.075 * this.slip);
    if (this.boostT > 0) mult *= 1.34;
    else if (this.padT > 0) mult *= 1.3;
    else if (this.kickT > 0) mult *= 1.1;
    if (this.drifting) mult *= 0.97;
    if (brake) mult *= 0.55;
    const vmax = this.topSpeed * mult * (inp.throttle != null ? 0.2 + 0.8 * inp.throttle : 1);
    speed = Math.hypot(vf, vp);
    let acc;
    if (speed < vmax) {
      const r = speed / vmax;
      acc = this.accel * (1 - r * r) * (this.boosting ? 1.8 : 1);
    } else {
      acc = -(speed - vmax) * (brake ? 2.2 : 0.9);
    }
    vf += acc * dt;
    vf -= 13 * f.slope * dt; // 下坡加速，上坡减速
    if (brake) vf -= 18 * dt;
    if (vf < 0) vf *= 0.5;

    // —— 前进：由赛道坐标积分
    const ch = Math.cos(this.psi), shh = Math.sin(this.psi);
    let vt = vf * ch - vp * shh;
    let vn = vf * shh + vp * ch;
    const denom = Math.max(0.6, 1 - k * this.x);
    const ds = (vt * dt) / denom;
    this.dist += ds;
    this.x += vn * dt;
    this.psi -= k * ds;

    // —— 护栏碰撞
    const lim = tr.half - SHIP_HALF_W;
    if (this.wallT > 0) this.wallT -= dt;
    if (Math.abs(this.x) > lim) {
      const side = Math.sign(this.x);
      this.x = side * lim;
      const into = vn * side;
      if (into > 0) {
        const impact = into;
        vn = -side * impact * 0.3;
        vt *= 1 - Math.min(0.32, impact / 110);
        this.psi = this.psi * 0.35 - side * 0.03;
        this.yawRate *= 0.25;
        // 回到机头坐标
        const c2 = Math.cos(this.psi), s2 = Math.sin(this.psi);
        vf = vt * c2 + vn * s2;
        vp = -vt * s2 + vn * c2;
        if (impact > 3) {
          if (this.wallT <= 0) {
            this.stats.wallHits++; this.stats.lapWallHits++;
            this.emit('wall', { impact, side });
          }
          this.wallT = 0.25;
          if (this.drifting && impact > 10) this.endDrift(false);
        }
        this.lastImpact = impact;
      }
      this.wallSide = side;
      this.emit('grind', { side, speed: Math.abs(vt) });
    }
    // 朝向限制：不能掉头
    const psiMax = 1.05;
    if (Math.abs(this.psi) > psiMax) {
      this.psi = Math.sign(this.psi) * psiMax;
      if (this.yawRate * this.psi > 0) this.yawRate = 0;
    }
    this.vf = vf; this.vp = vp;

    // 视觉：横滚/俯仰
    const rollT = -this.yawRate * 0.22 - (this.drifting ? this.drifting * 0.18 : 0) + this.vp * 0.004;
    this.rollV += (rollT - this.rollV) * (1 - Math.exp(-7 * dt));
    this.pitchV += ((this.boosting ? -0.05 : 0) + acc * -0.0012 - this.pitchV) * (1 - Math.exp(-5 * dt));
  }

  endDrift(reward) {
    if (!this.drifting) return;
    const t = this.driftT;
    this.drifting = 0;
    this.gripT = 0;
    // 出弯辅助：机头向实际运动方向回正一半
    const slip = Math.atan2(this.vp, Math.max(1, this.vf));
    const rot = slip * 0.55;
    const c = Math.cos(rot), s = Math.sin(rot);
    const vf = this.vf * c + this.vp * s, vp = -this.vf * s + this.vp * c;
    this.psi += rot; this.vf = vf; this.vp = vp;
    this.yawRate *= 0.4;
    this.stats.maxDrift = Math.max(this.stats.maxDrift, t);
    if (reward && t > 0.7) {
      this.kickT = Math.min(1.2, 0.4 + (t - 0.7) * 0.35);
      this.vf += 5 + Math.min(5, (t - 0.7) * 3);
      this.emit('driftRelease', { t });
    } else this.emit('driftEnd', { t });
  }

  hitPad() {
    this.padT = 1.25;
    this.vf += 11;
    this.stats.pads++;
    this.emit('pad');
  }
}
