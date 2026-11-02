/* 星际竞速 · AI 车手：沿赛车线行驶、弯前减速、适度漂移、超车、保持间距、卡位、橡皮筋平衡 */
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
    this.padBias = rand();
    this.base = 1;
  }

  update(dt, race) {
    const r = this.r, tr = r.track, p = this.p, inp = r.input;
    if (race.clock < this.react) { inp.steer = 0; inp.throttle = 0; return; }
    inp.throttle = 1;
    const v = Math.max(25, r.speed);
    const la = 16 + v * 0.42;

    // 车道偏好缓慢变化
    this.laneT -= dt;
    if (this.laneT <= 0) { this.laneT = 3 + this.rand() * 4; this.lane = (this.rand() - 0.5) * 6 * (1.25 - p.line); }

    let xT = tr.lineAt(r.s + la) * (0.55 + 0.45 * p.line) + this.lane;

    // 加速带：只有部分车手会去抢，且前方没有车占位
    const pad = race.nextPad(r.s, 150);
    if (pad && p.boost * (0.6 + this.padBias * 0.6) > 0.62) {
      let taken = false;
      for (const o of race.racers) { if (o === r) continue; const d = race.gap(o, r); if (d > 0 && d < 40 && Math.abs(o.x - pad.x) < 3.5) { taken = true; break; } }
      if (!taken) xT += (pad.x - xT) * 0.85;
    }

    // 超车/避让：前方近处有车则换边；并排的车保持间距
    let blocker = null, bd = 1e9;
    let push = 0;
    for (const o of race.racers) {
      if (o === r) continue;
      const d = race.gap(o, r); // o 在前方的距离
      const dx = r.x - o.x;
      if (d > 0 && d < 36 && Math.abs(o.x - xT) < 3.6 && d < bd) { blocker = o; bd = d; }
      if (Math.abs(d) < 9 && Math.abs(dx) < 4.6) push += Math.sign(dx || (this.rand() - 0.5)) * (4.6 - Math.abs(dx)) * (1 - Math.abs(d) / 9);
    }
    if (blocker) {
      const room = tr.half - 3;
      const left = blocker.x + 4, right = blocker.x - 4;
      const canL = left < room, canR = right > -room;
      xT = canL && (!canR || Math.abs(left - xT) < Math.abs(right - xT)) ? left : canR ? right : xT;
    }
    xT += push * 1.2;

    // 攻击性：贴近玩家时向其横向靠拢（挤压）
    const pl = race.player;
    if (pl && p.aggr > 0.4 && pl !== r && !pl.finished) {
      const d = race.gap(pl, r);
      if (Math.abs(d) < 12 && race.clock > 5) xT += (pl.x - xT) * 0.35 * p.aggr;
    }

    xT = clamp(xT, -tr.half + 2.6, tr.half - 2.6);

    // 偶发失误
    this.wobT -= dt;
    if (this.wobT <= 0) { this.wobT = 0.5 + this.rand() * 1.5; this.wob = (this.rand() - 0.5) * 2 * p.wobble * 0.25; }

    // —— 弯道速度：根据前方最急弯限制车速
    const brakeLook = 25 + v * 0.9;
    const kMax = tr.maxKappaAhead(r.s, brakeLook);
    const vCorner = (0.86 * r.maxYaw) / Math.max(1e-4, Math.abs(kMax));
    const over = v - vCorner;
    inp.brake = over > 9;
    if (over > 2) inp.throttle = clamp(1 - over / 12, 0, 1);

    // —— 转向：前馈曲率 + 朝向反馈 + 偏航阻尼（以速度方向为准，漂移时也稳定）
    const slip = Math.atan2(r.vp, Math.max(1, r.vf));
    const motion = r.psi + slip;
    const psiD = Math.atan2(xT - r.x, la);
    const kNow = tr.kappaAt(r.s + v * 0.1);
    const ff = kNow * v;
    const yawCmd = ff + (psiD - motion) * 2.9 - (r.yawRate - ff) * 0.22;

    // —— 漂移：只在中等弯道里炫技蓄能，滑移过大或弯道结束就收
    const kHere = tr.maxKappaAhead(r.s, 18);
    const needHere = Math.abs(kHere) * v / r.maxYaw;
    const needCmd = yawCmd / r.maxYaw;
    if (!r.drifting) {
      // 只在持续的长弯里漂移（S 弯不漂）
      const k1 = tr.kappaAt(r.s + 35), k2 = tr.kappaAt(r.s + 70);
      const longTurn = Math.sign(k1) === Math.sign(kHere) && Math.sign(k2) === Math.sign(kHere) && Math.abs(k1) > Math.abs(kHere) * 0.6 && Math.abs(k2) > Math.abs(kHere) * 0.6;
      inp.drift = p.drift > 1.5 && longTurn && needHere > 0.62 && needHere < 1.05 && v > 55 && Math.abs(slip) < 0.15 && Math.sign(kHere) === Math.sign(needCmd) && Math.abs(needCmd) > 0.45;
    } else {
      const d = r.drifting;
      inp.drift = needHere > 0.42 && Math.sign(kHere) === d && Math.abs(slip) < 0.45 && needCmd * d > 0.32;
    }

    let steer;
    if (r.drifting && inp.drift) {
      const d = r.drifting;
      const sd = (yawCmd / (d * r.maxYaw) - 0.88) / 0.55;
      steer = clamp(sd, -0.95, 1) * d;
      if (steer * d < 0.05) steer = 0.05 * d; // 保持按住漂移方向（触屏语义）
    } else {
      steer = needCmd;
      if (inp.drift && !r.drifting) steer = Math.sign(kHere) * Math.max(0.4, Math.abs(steer));
    }
    inp.steer = clamp(steer + this.wob, -1, 1);

    // AI 也会缓慢积累能量（相当于它们在别处的漂移）
    r.energy = Math.min(3, r.energy + dt * 0.045 * p.boost);
    // 冲刺：直道且有能量
    this.boostCool -= dt;
    inp.boost = false;
    if (r.energy >= 1 && this.boostCool <= 0 && race.clock > 3) {
      const ahead = Math.abs(tr.maxKappaAhead(r.s, 170));
      if (ahead * v * 1.3 < r.maxYaw * 0.7 && this.rand() < p.boost) { inp.boost = true; this.boostCool = 2 + this.rand() * 3; }
      else this.boostCool = 0.4;
    }

    // 橡皮筋（温和）
    if (pl && pl !== r && !pl.finished) {
      const behind = race.progress(pl) - race.progress(r); // 正 = 玩家领先
      const rb = clamp(behind / 500, -0.05, 0.07);
      r.speedMult = this.base * (1 + rb);
    } else r.speedMult = this.base;
  }
}
