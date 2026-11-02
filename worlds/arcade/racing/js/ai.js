/* 星际竞速 · AI 车手：沿赛车线行驶、过弯漂移、超车、卡位、橡皮筋平衡 */
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export class AIDriver {
  constructor(racer, persona, rand) {
    this.r = racer;
    this.p = persona;
    this.rand = rand;
    this.lane = (rand() - 0.5) * 4;
    this.laneT = 0;
    this.wob = 0; this.wobT = 0;
    this.react = 0.08 + rand() * 0.3; // 起步反应
    this.boostCool = 1 + rand() * 2;
    this.padTarget = null;
  }

  update(dt, race) {
    const r = this.r, tr = r.track, p = this.p, inp = r.input;
    if (race.clock < this.react) { inp.steer = 0; inp.throttle = 0; return; }
    inp.throttle = 1;
    const v = Math.max(25, r.speed);
    const la = 14 + v * 0.4;

    // 车道偏好缓慢变化
    this.laneT -= dt;
    if (this.laneT <= 0) { this.laneT = 3 + this.rand() * 4; this.lane = (this.rand() - 0.5) * 5 * (1.2 - p.line); }

    let xT = tr.lineAt(r.s + la) * (0.55 + 0.45 * p.line) + this.lane;

    // 主动寻找加速带
    const pad = race.nextPad(r.s, 150);
    if (pad && p.boost > 0.5) xT += (pad.x - xT) * 0.85;

    // 超车/避让：前方近处有车则换边
    let blocker = null, bd = 1e9;
    for (const o of race.racers) {
      if (o === r) continue;
      const d = race.gap(o, r); // o 在前方的距离
      if (d > 0 && d < 34 && Math.abs(o.x - xT) < 3.4 && d < bd) { blocker = o; bd = d; }
    }
    if (blocker) {
      const room = tr.half - 3;
      const left = blocker.x + 3.8, right = blocker.x - 3.8;
      const canL = left < room, canR = right > -room;
      xT = canL && (!canR || Math.abs(left - xT) < Math.abs(right - xT)) ? left : canR ? right : xT;
    }

    // 攻击性：贴近玩家时向其横向靠拢（挤压）
    const pl = race.player;
    if (pl && p.aggr > 0.4 && pl !== r) {
      const d = race.gap(pl, r);
      if (Math.abs(d) < 14 && race.clock > 4) xT += (pl.x - xT) * 0.45 * p.aggr;
    }

    xT = clamp(xT, -tr.half + 2.6, tr.half - 2.6);

    // 偶发失误
    this.wobT -= dt;
    if (this.wobT <= 0) { this.wobT = 0.4 + this.rand() * 1.5; this.wob = (this.rand() - 0.5) * 2 * p.wobble * 0.35; }

    // 转向控制：前馈曲率 + 朝向反馈（以速度方向为准，漂移时也稳定）
    const motion = r.psi + Math.atan2(r.vp, r.vf);
    const psiD = Math.atan2(xT - r.x, la);
    const kNow = tr.kappaAt(r.s + v * 0.12);
    const yawCmd = kNow * v + (psiD - motion) * 3.4;

    // 是否需要漂移：前方最急的弯需要的偏航率
    const kMax = tr.maxKappaAhead(r.s, 20 + v * 0.55);
    const need = Math.abs(kMax) * v / r.maxYaw;
    const wantDrift = p.drift > 0 && need > 0.86 && v > 50;
    if (wantDrift && !r.drifting) { inp.drift = true; }
    else if (r.drifting && (need < 0.55 || Math.sign(kMax) !== r.drifting)) inp.drift = false;
    else inp.drift = r.drifting ? true : false;

    let steer;
    if (r.drifting) {
      // 漂移时偏航目标 = d * maxYaw * (1.08 + 0.5 * sd) → 反解 sd
      const d = r.drifting;
      const sd = (yawCmd / (d * r.maxYaw) - 1.08) / 0.5;
      steer = clamp(sd, -1, 1) * d;
      if (wantDrift && Math.abs(steer) < 0.35) steer = 0.35 * d; // 保持漂移方向
    } else {
      steer = yawCmd / r.maxYaw;
      if (wantDrift) steer = Math.sign(kMax) * Math.max(0.6, Math.abs(steer));
    }
    inp.steer = clamp(steer + this.wob, -1, 1);
    inp.brake = !r.drifting && need > 1.25;

    // 加速：直道且有能量
    this.boostCool -= dt;
    inp.boost = false;
    if (r.energy >= 1 && this.boostCool <= 0 && race.clock > 3) {
      const ahead = Math.abs(tr.maxKappaAhead(r.s, 160));
      if (ahead * v < r.maxYaw * 0.5 && this.rand() < p.boost) { inp.boost = true; this.boostCool = 2 + this.rand() * 3; }
      else this.boostCool = 0.4;
    }

    // 橡皮筋（温和）
    if (pl && pl !== r && !pl.finished) {
      const behind = race.progress(pl) - race.progress(r); // 正 = 玩家领先
      const rb = clamp(behind / 420, -0.07, 0.085);
      r.speedMult = this.base * (1 + rb);
    } else r.speedMult = this.base;
  }
}
