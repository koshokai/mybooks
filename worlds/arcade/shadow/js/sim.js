/* =========================================================
   影 · 暗域 —— 游戏模拟：工程师、守夜者、信标、道具与声响
   与渲染完全分离，可以无画面地快进（自动化测试用）
   ========================================================= */
(function () {
  'use strict';
  const U = window.Umbra;
  const PL = U.PLAYER;
  const TAU = U.TAU;
  const clamp = U.clamp;

  function Game(opts) {
    const diff = U.DIFF[opts.diff] ? opts.diff : 'normal';
    const D = U.DIFF[diff];
    const seed = opts.seed >>> 0;
    const M = U.generateMap(seed, diff);
    this.D = D;
    this.diff = diff;
    this.seed = seed;
    this.map = M;
    this.rng = U.mulberry32((seed ^ 0x51ed27) >>> 0);
    this.daily = !!opts.daily;
    this.attract = !!opts.attract;
    this.t = 0;
    this.events = [];
    this.ending = null;
    this.relaysDone = 0;
    this.podUnlocked = false;
    this.alarmT = -99;
    this.lastTension = 0;
    this.ccT = -99;
    this.danger = 0;
    this.flares = [];
    this.rings = []; // 声响可视化
    this.sparks = []; // 火花粒子
    this.flashes = []; // 瞬间闪光
    this.scan = null;
    this.flareCost = new Float32Array(M.N);
    this.flareCostT = 0;
    this.knownT = 0;
    this.freeze = false; // 调试：冻结守夜者
    this.stats = { hits: 0, closeCalls: 0, calibOk: 0, calibTotal: 0, chases: 0, flaresUsed: 0, scans: 0, stuns: 0, sparks: 0 };
    M.pod.known = true;

    this.player = {
      x: M.start.x, y: M.start.y, vx: 0, vy: 0, r: PL.r,
      aim: -Math.PI / 2, aimTarget: -Math.PI / 2,
      hp: 2, stamina: 1, exhausted: false, sprinting: false, staminaT: 9,
      torch: true, torchWas: true,
      hidden: null, hidePhase: null, hideT: 0,
      vent: null, ventT: 0,
      inv: 0, adren: 0, flinch: 0,
      flares: D.flares, scanCd: 0,
      stepAcc: 0, humT: 0, restoring: null, calib: null, ctx: null, speed: 0,
      hiddenT: 0,
    };
    if (this.attract) this.player.hidden = { attract: true };

    const ws = M.wardenStart;
    this.warden = {
      x: ws.x, y: ws.y, vx: 0, vy: 0, r: 0.36,
      face: this.rng() * TAU, faceTarget: 0, look: 0, lookPh: 0,
      state: 'patrol', path: null, pi: 0, repath: 0, goal: null, urgency: 0,
      susp: 0, seeing: false, noticing: 0, stare: 0,
      lastSeenT: -99, lastSeen: { x: ws.x, y: ws.y }, lastVel: { x: 0, y: 0 },
      lastHeardT: -99, heard: null,
      lungeCd: 1, windup: 0, windupMax: 0.4, dash: 0, dashDir: 0, dashMin: 99, postDash: 0,
      recoverT: 0, stunT: 0, ripT: 0, lookT: 0, idleT: 1.5, searchT: 0, sniff: null, sniffT: 0, sniffed: [],
      gait: 0, stepPh: 0, stuckT: 0, lastPos: { x: ws.x, y: ws.y },
      sawHide: null, enraged: false, eyeK: 1, room: ws.room, prevRoom: -1, nearT: -99, minRecent: 99,
    };
    this.warden.faceTarget = this.warden.face;
  }
  const G = Game.prototype;

  G.emit = function (type, data) {
    const e = data || {};
    e.type = type;
    this.events.push(e);
    return e;
  };

  /* ---------------- 工具 ---------------- */
  G.relayNear = function (x, y, r) {
    let best = null, bd = r;
    for (const R of this.map.relays) {
      if (R.done) continue;
      const d = Math.hypot(R.x - x, R.y - y);
      if (d < bd) { bd = d; best = R; }
    }
    return best;
  };
  G.lockerNear = function (x, y, r) {
    let best = null, bd = r;
    for (const L of this.map.lockers) {
      const d = Math.hypot(L.cx - x, L.cy - y);
      if (d < bd) { bd = d; best = L; }
    }
    return best;
  };
  G.ventNear = function (x, y, r) {
    let best = null, bd = r;
    for (const V of this.map.vents) {
      const d = Math.hypot(V.x - x, V.y - y);
      if (d < bd) { bd = d; best = V; }
    }
    return best;
  };
  G.exposure = function (x, y) {
    const M = this.map;
    const tx = Math.floor(x), ty = Math.floor(y);
    let v = M.inb(tx, ty) ? M.lightLevel[M.I(tx, ty)] : 0;
    for (const f of this.flares) {
      if (!f.lit || f.burn > f.life) continue;
      const d = Math.hypot(f.x - x, f.y - y);
      if (d < 5.5 && M.los(f.x, f.y, x, y)) v += (1 - d / 5.5) * 1.3;
    }
    for (const R of M.relays) if (R.done) { const d = Math.hypot(R.x - x, R.y - y); if (d < 3.5) v += (1 - d / 3.5) * 0.6; }
    return v;
  };
  G.closeCall = function (kind) {
    if (this.t - this.ccT < 3.5 || this.ending) return;
    this.ccT = this.t;
    this.stats.closeCalls++;
    this.emit('closeCall', { kind });
  };
  G.ring = function (x, y, r, kind) {
    this.rings.push({ x, y, r, kind, t: 0 });
    if (this.rings.length > 40) this.rings.shift();
  };

  /* ---------------- 声响 ---------------- */
  G.noise = function (x, y, radius, kind, visual) {
    if (visual) this.ring(x, y, radius, kind);
    const w = this.warden;
    if (this.attract || this.freeze || this.ending) return false;
    if (w.state === 'stunned' || w.state === 'recover' || w.state === 'grab' || w.state === 'openLocker') return false;
    const d = Math.hypot(w.x - x, w.y - y);
    const los = this.map.los(w.x, w.y, x, y);
    const eff = radius * this.D.hearing * (los ? 1 : 0.72);
    if (d > eff) return false;
    if (w.state === 'chase') {
      if (!w.seeing) { w.lastHeardT = this.t; w.heard = { x, y }; }
      return true;
    }
    const urgent = kind === 'spark' || kind === 'alarm' || kind === 'run' || kind === 'vent';
    w.susp = Math.min(0.92, w.susp + (urgent ? 0.3 : 0.12));
    this.investigate(x, y, urgent ? 1 : 0.45);
    if (Math.hypot(this.player.x - x, this.player.y - y) < 3) this.lastTension = this.t;
    this.emit('heard', { x, y, kind });
    return true;
  };

  /* ---------------- 主更新 ---------------- */
  G.update = function (dt, inp) {
    this.t += dt;
    if (this.ending) {
      this.ending.t += dt;
      this.updateFx(dt);
      this.updateDoors(dt);
      if (this.ending.type === 'caught') this.updateGrab(dt);
      return;
    }
    if (!this.attract) this.updatePlayer(dt, inp || {});
    this.updateDoors(dt);
    this.updateFlares(dt);
    if (!this.freeze) this.updateWarden(dt);
    this.updateFx(dt);
    this.updateDanger(dt);
    // 已知信标：进入视线即标记
    this.knownT -= dt;
    if (this.knownT <= 0 && !this.attract) {
      this.knownT = 0.25;
      const p = this.player;
      for (const R of this.map.relays) {
        if (R.known) continue;
        if (Math.hypot(R.x - p.x, R.y - p.y) < 9 && this.map.los(p.x, p.y, R.x, R.y)) { R.known = true; this.emit('relaySeen', { relay: R }); }
      }
    }
  };

  G.updateFx = function (dt) {
    for (const r of this.rings) r.t += dt;
    while (this.rings.length && this.rings[0].t > 1.6) this.rings.shift();
    for (const s of this.sparks) {
      s.t += dt; s.x += s.vx * dt; s.y += s.vy * dt; s.vx *= Math.exp(-dt * 3); s.vy *= Math.exp(-dt * 3);
    }
    this.sparks = this.sparks.filter(s => s.t < s.life);
    for (const f of this.flashes) f.t += dt;
    this.flashes = this.flashes.filter(f => f.t < f.life);
    if (this.scan) { this.scan.t += dt; if (this.scan.t > 4) this.scan = null; }
  };

  G.burst = function (x, y, n, col, speed) {
    for (let i = 0; i < n; i++) {
      const a = this.rng() * TAU, v = (0.4 + this.rng()) * (speed || 3);
      this.sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: 0, life: 0.3 + this.rng() * 0.5, col: col || 0 });
    }
    if (this.sparks.length > 220) this.sparks.splice(0, this.sparks.length - 220);
  };

  G.updateDanger = function (dt) {
    const p = this.player, w = this.warden;
    let target = 0;
    if (!this.attract) {
      const d = Math.hypot(w.x - p.x, w.y - p.y);
      const los = this.map.los(w.x, w.y, p.x, p.y);
      target = clamp(1 - (d - 1.5) / 11, 0, 1);
      target = target * target * (los ? 1 : 0.6);
      if (w.state === 'chase') target = Math.max(target, 0.55 + 0.45 * clamp(1 - d / 10, 0, 1));
      if (w.state === 'stunned') target *= 0.5;
      if (d < 7 && los) { this.lastTension = this.t; w.nearT = this.t; }
      w.minRecent = Math.min(w.minRecent + dt * 0.8, d);
      this.wDist = d;
      this.wLos = los;
    }
    this.danger += (target - this.danger) * (1 - Math.exp(-dt * (target > this.danger ? 5 : 1.2)));
  };

  /* ---------------- 工程师 ---------------- */
  G.updatePlayer = function (dt, inp) {
    const p = this.player, M = this.map, D = this.D;
    p.inv = Math.max(0, p.inv - dt);
    p.adren = Math.max(0, p.adren - dt);
    p.scanCd = Math.max(0, p.scanCd - dt);
    p.flinch = Math.max(0, p.flinch - dt);
    p.ctx = null;

    // 手电开关
    if (inp.torchP && !p.hidden && !p.vent) { p.torch = !p.torch; this.emit('torch', { on: p.torch }); }

    // ---- 储物柜 ----
    if (p.hidden) {
      const L = p.hidden;
      p.hiddenT += dt;
      p.staminaT += dt;
      p.stamina = Math.min(1, p.stamina + PL.regen * 1.5 * dt);
      if (p.exhausted && p.stamina >= PL.exhaustTo) p.exhausted = false;
      if (p.hidePhase === 'enter') {
        p.hideT -= dt;
        const k = 1 - Math.exp(-dt * 12);
        p.x += (L.x + 0.5 - (L.x + 0.5 - L.cx) * 0.25 - p.x) * k;
        p.y += (L.y + 0.5 - (L.y + 0.5 - L.cy) * 0.25 - p.y) * k;
        if (p.hideT <= 0) p.hidePhase = 'in';
      } else if (p.hidePhase === 'in') {
        p.ctx = { kind: 'exit', obj: L };
        if (inp.interactP) {
          p.hidePhase = 'exit';
          p.hideT = 0.28;
          L.open = 1;
          p.torch = p.torchWas;
          this.emit('locker', { L, enter: false });
          this.noise(L.cx, L.cy, 2, 'locker', false);
        }
      } else if (p.hidePhase === 'exit') {
        p.hideT -= dt;
        const k = 1 - Math.exp(-dt * 14);
        p.x += (L.cx - p.x) * k;
        p.y += (L.cy - p.y) * k;
        if (p.hideT <= 0) { p.hidden = null; p.hidePhase = null; L.busy = 0; p.x = L.cx; p.y = L.cy; }
      }
      p.vx = p.vy = 0;
      p.speed = 0;
      return;
    }
    p.hiddenT = 0;

    // ---- 通风管 ----
    if (p.vent) {
      p.ventT -= dt;
      if (p.ventT <= 0) {
        const B = M.vents[p.vent.pair];
        p.x = B.x; p.y = B.y; p.vx = p.vy = 0;
        p.vent = null;
        B.rattle = 1;
        this.emit('ventOut', { V: B });
        this.noise(B.x, B.y, 6, 'vent', true);
      }
      return;
    }

    // ---- 移动输入 ----
    let mx = inp.mx || 0, my = inp.my || 0;
    const mag = Math.min(1, Math.hypot(mx, my));
    if (mag > 1e-3) { const l = Math.hypot(mx, my); mx = (mx / l) * mag; my = (my / l) * mag; }

    // ---- 情境互动 ----
    const R = this.relayNear(p.x, p.y, 1.32);
    const L = this.lockerNear(p.x, p.y, 0.95);
    const V = this.ventNear(p.x, p.y, 0.8);
    const podD = Math.hypot(M.pod.hx - p.x, M.pod.hy - p.y);
    if (R) p.ctx = { kind: 'relay', obj: R };
    else if (L && !L.busy) p.ctx = { kind: 'locker', obj: L };
    else if (V) p.ctx = { kind: 'vent', obj: V };
    else if (podD < 1.6) p.ctx = { kind: 'pod', obj: M.pod };

    p.restoring = null;
    if (p.calib) {
      const c = p.calib;
      if (!R || R !== c.relay) {
        p.calib = null;
        this.emit('calibCancel', {});
      } else {
        mx = my = 0;
        c.t += dt;
        const u = c.u0 + c.t / c.period;
        c.phase = 2 * Math.abs(2 * (u - Math.floor(u + 0.5))) - 1; // 三角波 [-1,1]
        if (inp.interactP && c.t > 0.1) this.resolveCalib(Math.abs(c.phase) <= c.win);
        else if (c.t >= c.dur) this.resolveCalib(false);
      }
    } else if (inp.interact && R) {
      p.restoring = R;
      mx = my = 0;
      R.progress = Math.min(1, R.progress + dt / D.restore);
      if (R.checkI < R.checks.length && R.progress >= R.checks[R.checkI]) {
        R.checkI++;
        const period = D.calibPeriod;
        p.calib = { relay: R, t: 0, u0: 0.5 + this.rng() * 0.12, period, dur: period * 1.8, win: D.calibWin, phase: 1 };
        this.stats.calibTotal++;
        this.emit('calibStart', { relay: R });
      }
      p.humT -= dt;
      if (p.humT <= 0) { p.humT = 1.1; this.noise(R.x, R.y, 4.2, 'hum', false); }
      if (R.progress >= 1 && !p.calib) this.completeRelay(R);
    } else if (inp.interactP) {
      if (L && !L.busy && !R) this.enterLocker(L);
      else if (V && !R) this.enterVent(V);
    }
    if (!inp.interact) p.humT = Math.min(p.humT, 0.35);

    // ---- 体力与速度 ----
    const moving = mag > 0.15;
    if (p.adren > 0) {
      p.sprinting = moving;
    } else if (inp.sprint && moving && !p.exhausted && p.stamina > 0) {
      p.sprinting = true;
      p.stamina -= PL.drain * dt;
      p.staminaT = 0;
      if (p.stamina <= 0) { p.stamina = 0; p.exhausted = true; this.emit('exhausted', {}); }
    } else {
      p.sprinting = false;
      p.staminaT += dt;
      if (p.staminaT > PL.regenDelay) p.stamina = Math.min(1, p.stamina + PL.regen * dt);
      if (p.exhausted && p.stamina >= PL.exhaustTo) p.exhausted = false;
    }
    const spd = p.adren > 0 ? PL.adren : p.sprinting ? PL.sprint : PL.walk * (p.exhausted ? 0.82 : 1);
    const tvx = mx * spd, tvy = my * spd;
    const acc = 1 - Math.exp(-dt * (p.flinch > 0 ? 3 : 13));
    p.vx += (tvx - p.vx) * acc;
    p.vy += (tvy - p.vy) * acc;
    const ox = p.x, oy = p.y;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    M.collide(p, p.r);
    const moved = Math.hypot(p.x - ox, p.y - oy);
    p.speed = moved / Math.max(dt, 1e-4);

    // ---- 瞄准 ----
    if (inp.aim != null) p.aimTarget = inp.aim;
    else if (moving) p.aimTarget = Math.atan2(my, mx);
    p.aim = U.turnTo(p.aim, p.aimTarget, dt * (inp.aim != null ? 16 : 7.5));

    // ---- 脚步声 ----
    p.stepAcc += moved;
    const stride = p.sprinting ? 1.15 : 0.82;
    if (p.stepAcc >= stride) {
      p.stepAcc -= stride;
      const loud = p.sprinting;
      this.emit('step', { sprint: loud });
      this.noise(p.x, p.y, loud ? 6.5 : 1.7 * clamp(p.speed / PL.walk, 0.3, 1), loud ? 'run' : 'walk', loud);
    }

    // ---- 照明弹 ----
    if (inp.flareP && p.flares > 0) this.throwFlare(inp);
    // ---- 扫描 ----
    if (inp.scanP && p.scanCd <= 0) this.doScan();

    // ---- 逃生 ----
    if (this.podUnlocked && podD < 0.95) {
      this.ending = { type: 'win', t: 0 };
      p.vx = p.vy = 0;
      this.emit('win', {});
    }
  };

  G.resolveCalib = function (ok) {
    const p = this.player, c = p.calib, R = c.relay;
    p.calib = null;
    if (ok) {
      this.stats.calibOk++;
      R.progress = Math.min(1, R.progress + 0.06);
      this.emit('calibOk', { relay: R });
      this.flashes.push({ x: R.x, y: R.y, r: 2.6, col: [190, 150, 255], t: 0, life: 0.45, k: 0.8 });
    } else {
      this.stats.sparks++;
      R.progress = Math.max(0, R.progress - 0.12);
      R.sparkT = this.t;
      p.flinch = 0.35;
      this.emit('spark', { relay: R });
      this.burst(R.x, R.y, 26, 1, 4.5);
      this.flashes.push({ x: R.x, y: R.y, r: 6.5, col: [255, 230, 190], t: 0, life: 0.55, k: 1.6 });
      this.noise(R.x, R.y, 15, 'spark', true);
    }
    if (R.progress >= 1) this.completeRelay(R);
  };

  G.completeRelay = function (R) {
    if (R.done) return;
    R.done = true;
    R.progress = 1;
    R.doneT = this.t;
    R.known = true;
    this.relaysDone++;
    this.player.restoring = null;
    this.emit('relayDone', { relay: R, n: this.relaysDone, total: this.map.relays.length });
    this.flashes.push({ x: R.x, y: R.y, r: 5, col: [180, 140, 255], t: 0, life: 1.2, k: 1 });
    this.noise(R.x, R.y, 5, 'chime', false);
    if (this.relaysDone >= this.map.relays.length) this.unlockPod();
  };

  G.unlockPod = function () {
    if (this.podUnlocked) return;
    this.podUnlocked = true;
    this.map.pod.unlocked = true;
    this.alarmT = this.t;
    const w = this.warden;
    w.enraged = true;
    this.emit('podUnlock', {});
    // 警报：守夜者直接朝你赶来
    const p = this.player;
    if (w.state !== 'chase' && w.state !== 'stunned' && !this.freeze) {
      w.susp = 0.9;
      this.investigate(p.x, p.y, 1);
    }
  };

  G.sees = function (strict) {
    // 守夜者此刻能否直接看到工程师（用于“看见你躲进去”）
    const w = this.warden, p = this.player;
    if (w.state === 'stunned' || this.freeze) return false;
    const d = Math.hypot(p.x - w.x, p.y - w.y);
    if (d > (strict ? this.D.vision * 1.3 : this.D.vision * 1.7)) return false;
    if (!this.map.los(w.x, w.y, p.x, p.y)) return false;
    if (w.state === 'chase' || w.state === 'recover' || d < 2.6) return true;
    const off = Math.abs(U.angDiff(w.face + w.look, Math.atan2(p.y - w.y, p.x - w.x)));
    return off < this.D.half + 0.15;
  };

  G.enterLocker = function (L) {
    const p = this.player, w = this.warden;
    p.hidden = L;
    p.hidePhase = 'enter';
    p.hideT = 0.32;
    p.torchWas = p.torch;
    p.torch = false;
    p.calib = null;
    p.vx = p.vy = 0;
    L.busy = 1;
    L.open = 1;
    const seen = this.sees(false);
    w.sawHide = seen ? L : null;
    this.emit('locker', { L, enter: true, seen });
    this.noise(L.cx, L.cy, p.sprinting ? 4.2 : 2.2, 'locker', false);
  };

  G.enterVent = function (V) {
    const p = this.player, w = this.warden;
    p.vent = V;
    p.ventT = 1.25;
    p.calib = null;
    p.vx = p.vy = 0;
    V.rattle = 1;
    const seen = this.sees(false);
    this.emit('vent', { V, seen });
    this.noise(V.x, V.y, 3, 'vent', false);
    if (seen && w.state === 'chase') {
      const B = this.map.vents[V.pair];
      if (this.rng() < 0.65) {
        w.state = 'investigate';
        this.setGoal(B.x, B.y);
        w.urgency = 1;
        w.lookT = 0;
        w.susp = 0.9;
      } else this.startSearch(V.x, V.y);
      this.emit('chaseEnd', { quiet: true });
    }
  };

  G.throwFlare = function (inp) {
    const p = this.player, M = this.map, w = this.warden;
    let ang = p.aim;
    let dist = inp.aimDist != null ? clamp(inp.aimDist, 1.2, 6.5) : 4.5;
    if (inp.autoAim) {
      const d = Math.hypot(w.x - p.x, w.y - p.y);
      if (d < 8.5 && w.state !== 'stunned' && M.los(p.x, p.y, w.x, w.y)) {
        ang = Math.atan2(w.y - p.y, w.x - p.x);
        dist = clamp(d - 0.6, 1.2, 6.5);
      }
    }
    const dx = Math.cos(ang), dy = Math.sin(ang);
    const free = M.rayDist(p.x, p.y, dx, dy, dist + 0.4, 0);
    const d = Math.max(0.6, Math.min(dist, free - 0.35));
    const f = { sx: p.x, sy: p.y, x: p.x, y: p.y, tx: p.x + dx * d, ty: p.y + dy * d, t: 0, fly: 0.22 + d * 0.06, lit: false, burn: 0, life: 9, stunUsed: false, h: 0, rot: 0, seed: this.rng() * 1000 };
    this.flares.push(f);
    p.flares--;
    this.stats.flaresUsed++;
    this.emit('flareThrow', {});
  };

  G.updateFlares = function (dt) {
    const M = this.map, w = this.warden, D = this.D;
    let dirty = false;
    for (const f of this.flares) {
      if (!f.lit) {
        f.t += dt;
        const k = Math.min(1, f.t / f.fly);
        f.x = U.lerp(f.sx, f.tx, k);
        f.y = U.lerp(f.sy, f.ty, k);
        f.h = Math.sin(k * Math.PI) * 0.9;
        f.rot += dt * 14;
        if (k >= 1) {
          f.lit = true;
          dirty = true;
          this.emit('flareIgnite', { f });
          this.flashes.push({ x: f.x, y: f.y, r: 7, col: [255, 120, 80], t: 0, life: 0.5, k: 1.4 });
          this.burst(f.x, f.y, 18, 2, 3.5);
          const d = Math.hypot(w.x - f.x, w.y - f.y);
          if (d < 4.6 && M.los(f.x, f.y, w.x, w.y)) { this.stunWarden(); f.stunUsed = true; }
        }
      } else {
        f.burn += dt;
        if (f.burn < f.life && !f.stunUsed && w.state !== 'stunned' && !this.freeze) {
          const d = Math.hypot(w.x - f.x, w.y - f.y);
          if (d < 2.3 && M.los(f.x, f.y, w.x, w.y)) { this.stunWarden(); f.stunUsed = true; }
        }
        if (f.burn >= f.life && !f.out) { f.out = true; dirty = true; }
        if (this.rng() < dt * 9 && f.burn < f.life) this.burst(f.x, f.y, 1, 2, 1.6);
      }
    }
    this.flares = this.flares.filter(f => f.burn < f.life + 20);
    this.flareCostT -= dt;
    if (dirty || this.flareCostT <= 0) {
      this.flareCostT = 0.5;
      const c = this.flareCost;
      c.fill(0);
      for (const f of this.flares) {
        if (!f.lit || f.burn >= f.life) continue;
        for (let y = Math.floor(f.y) - 3; y <= Math.floor(f.y) + 3; y++) for (let x = Math.floor(f.x) - 3; x <= Math.floor(f.x) + 3; x++) {
          if (!M.inb(x, y)) continue;
          const d = Math.hypot(x + 0.5 - f.x, y + 0.5 - f.y);
          if (d < 3) c[M.I(x, y)] += 8 * (1 - d / 3) + 1;
        }
      }
    }
  };

  G.stunWarden = function () {
    const w = this.warden;
    if (w.state === 'stunned' || w.state === 'grab' || this.freeze) return;
    const wasChase = w.state === 'chase';
    w.state = 'stunned';
    w.stunT = this.D.stunTime;
    w.windup = 0; w.dash = 0; w.path = null;
    w.susp = 0.4;
    w.sawHide = null;
    this.stats.stuns++;
    this.emit('stun', { wasChase });
  };

  G.doScan = function () {
    const p = this.player, M = this.map, w = this.warden;
    p.scanCd = this.D.scanCd;
    this.stats.scans++;
    const wd = Math.hypot(w.x - p.x, w.y - p.y);
    this.scan = { x: p.x, y: p.y, t: 0, range: 28, warden: wd < 15 ? { x: w.x, y: w.y } : null };
    for (const R of M.relays) if (Math.hypot(R.x - p.x, R.y - p.y) < 28) R.known = true;
    this.emit('scan', { warden: !!this.scan.warden });
    this.noise(p.x, p.y, 9, 'scan', true);
  };

  /* ---------------- 门 ---------------- */
  G.updateDoors = function (dt) {
    const M = this.map, p = this.player, w = this.warden;
    const near = (d, x, y, r) => {
      const ax = Math.abs(x - d.x), ay = Math.abs(y - d.y);
      return d.axis === 'x' ? ax <= 1.45 && ay <= 1.05 + r : ay <= 1.45 && ax <= 1.05 + r;
    };
    const inside = (d, x, y, r) => {
      for (const [tx, ty] of d.tiles) if (x + r > tx && x - r < tx + 1 && y + r > ty && y - r < ty + 1) return true;
      return false;
    };
    const pv = !this.attract && !p.hidden && !p.vent;
    for (const d of M.doors) {
      let want = false, byP = false;
      if (pv && near(d, p.x, p.y, 0)) { want = true; byP = true; }
      if (near(d, w.x, w.y, 0.1) && w.state !== 'grab') want = true;
      if ((pv && inside(d, p.x, p.y, p.r)) || inside(d, w.x, w.y, w.r)) want = true;
      if (want) d.hold = 0.75;
      else d.hold -= dt;
      const target = d.hold > 0 ? 1 : 0;
      if (target === 1 && d.target === 0) {
        if (d.open < 0.1) {
          this.emit('door', { d, open: true, byP });
          if (byP) this.noise(d.x, d.y, 3, 'door', false);
        }
      } else if (target === 0 && d.target === 1) this.emit('door', { d, open: false, byP: false });
      d.target = target;
      const sp = target ? 4.6 : 3.2;
      d.open = target ? Math.min(1, d.open + dt * sp) : Math.max(0, d.open - dt * sp);
      M.setDoorState(d, d.open < 0.5, d.open < 0.78);
    }
    for (const L of M.lockers) if (!L.busy) L.open = Math.max(0, L.open - dt * 3.2); else if (this.player.hidePhase === 'in') L.open = Math.max(0, L.open - dt * 3.2);
    for (const V of M.vents) V.rattle = Math.max(0, V.rattle - dt * 1.4);
  };

  /* =========================================================
     守夜者
     ========================================================= */
  G.speedMul = function () {
    const w = this.warden;
    return 1 + 0.025 * this.relaysDone + (w.enraged ? 0.07 : 0);
  };

  G.setGoal = function (x, y) {
    const w = this.warden;
    w.goal = { x, y };
    w.path = this.map.findPath(w.x, w.y, x, y, this.flareCost, w.r);
    w.pi = 1;
    w.repath = 0.25;
  };

  G.investigate = function (x, y, urgency) {
    const w = this.warden;
    if (w.state === 'chase' || w.state === 'stunned' || w.state === 'recover' || w.state === 'openLocker' || w.state === 'grab') return;
    const prevGoal = w.goal;
    const was = w.state === 'investigate';
    w.state = 'investigate';
    w.urgency = Math.max(urgency, was ? w.urgency * 0.5 : 0);
    w.lookT = 0;
    if (!prevGoal || Math.hypot(prevGoal.x - x, prevGoal.y - y) > 0.8 || !w.path) this.setGoal(x, y);
  };

  G.startChase = function () {
    const w = this.warden;
    if (w.state === 'chase') return;
    w.state = 'chase';
    w.susp = 1;
    w.repath = 0;
    w.sniff = null;
    w.minRecent = 99;
    this.stats.chases++;
    this.lastTension = this.t;
    this.emit('chaseStart', {});
  };

  G.startSearch = function (x, y) {
    const w = this.warden;
    const fromChase = w.state === 'chase';
    w.state = 'search';
    w.searchT = this.D.searchTime;
    w.lookT = 0;
    w.susp = Math.min(w.susp, 0.6);
    w.sniffed = [];
    this.setGoal(x, y);
    if (fromChase) {
      this.emit('chaseEnd', {});
      if (w.minRecent < 3.6) this.closeCall('escape');
    }
  };

  G.pickPatrolRoom = function () {
    const M = this.map, p = this.player, w = this.warden, D = this.D;
    const calm = this.t - this.lastTension;
    let tot = 0;
    const ws = M.rooms.map(r => {
      if (r.id === w.room) return 0;
      const d = Math.hypot(r.mx - p.x, r.my - p.y);
      let wt;
      if (this.attract) wt = 1;
      else if (this.t < D.grace) wt = d > 15 ? 1 : 0.06;
      else if (calm > D.calmLimit) wt = 0.12 + 3.4 * Math.exp(-d / 9);
      else wt = 0.45 + Math.exp(-d / 14);
      if (r.relay != null && !M.relays[r.relay].done) wt *= 1.25;
      if (r.id === w.prevRoom) wt *= 0.3;
      tot += wt;
      return wt;
    });
    let x = this.rng() * tot;
    for (let i = 0; i < ws.length; i++) { x -= ws[i]; if (x <= 0) return M.rooms[i]; }
    return M.rooms[Math.floor(this.rng() * M.rooms.length)];
  };

  // 沿路径移动，返回 true 表示到达
  G.moveAlong = function (speed, dt) {
    const w = this.warden, M = this.map;
    if (!w.path) { w.vx *= 0.8; w.vy *= 0.8; return true; }
    let tgt = w.path[w.pi];
    while (tgt && w.pi < w.path.length - 1 && Math.hypot(tgt.x - w.x, tgt.y - w.y) < 0.35) { w.pi++; tgt = w.path[w.pi]; }
    if (!tgt) { w.path = null; return true; }
    const dx = tgt.x - w.x, dy = tgt.y - w.y, d = Math.hypot(dx, dy);
    if (w.pi >= w.path.length - 1 && d < 0.18) { w.path = null; w.vx *= 0.5; w.vy *= 0.5; return true; }
    w.gait += dt * speed * 1.6;
    const lurch = 0.76 + 0.48 * Math.pow(Math.abs(Math.sin(w.gait)), 0.65);
    const v = speed * lurch * Math.min(1, d / 0.35 + 0.35);
    const k = 1 - Math.exp(-dt * 9);
    w.vx += ((dx / d) * v - w.vx) * k;
    w.vy += ((dy / d) * v - w.vy) * k;
    w.x += w.vx * dt;
    w.y += w.vy * dt;
    M.collide(w, w.r);
    if (Math.hypot(w.vx, w.vy) > 0.3) w.faceTarget = Math.atan2(w.vy, w.vx);
    // 脚步
    const ph = Math.floor(w.gait / Math.PI);
    if (ph !== w.stepPh) { w.stepPh = ph; this.emit('wstep', { x: w.x, y: w.y, chase: w.state === 'chase' }); }
    return false;
  };

  G.updateWarden = function (dt) {
    const w = this.warden, p = this.player, M = this.map, D = this.D;
    const sm = this.speedMul();
    w.lungeCd = Math.max(0, w.lungeCd - dt);
    w.stare = Math.max(0, w.stare - dt);
    const rm = M.roomAt(w.x, w.y);
    if (rm && rm.id !== w.room) { w.prevRoom = w.room; w.room = rm.id; }

    this.perceive(dt);

    // 视线触发
    const busy = w.state === 'chase' || w.state === 'recover' || w.state === 'stunned' || w.state === 'openLocker' || w.state === 'grab';
    if (!busy) {
      if (w.susp >= 1) this.startChase();
      else if (w.susp >= 0.45 && w.noticing > 0 && (w.state !== 'investigate' || w.urgency < 0.9)) {
        if (!w.goal || Math.hypot(w.goal.x - p.x, w.goal.y - p.y) > 1.2 || w.state !== 'investigate') {
          w.state = 'investigate';
          w.urgency = 0.5;
          w.lookT = 0;
          this.setGoal(p.x, p.y);
        }
      }
    }
    // 看见你躲进储物柜
    if (w.sawHide && w.state !== 'stunned' && w.state !== 'grab' && w.state !== 'openLocker' && w.state !== 'recover') {
      if (p.hidden === w.sawHide) {
        w.state = 'openLocker';
        w.ripT = 0;
        this.setGoal(w.sawHide.cx, w.sawHide.cy);
      } else w.sawHide = null;
    }

    let look = 0.35;
    switch (w.state) {
      case 'patrol': {
        if (w.stare > 0) { this.stareAt(dt); break; }
        const arrived = this.moveAlong(D.wPatrol * sm, dt);
        if (arrived) {
          if (w.idleT > 0) { w.idleT -= dt; look = 1.0; }
          else {
            const room = this.pickPatrolRoom();
            const tgt = M.randomFloorIn(room, this.rng);
            this.setGoal(tgt.x, tgt.y);
            w.idleT = 0.8 + this.rng() * 2.2;
          }
        }
        break;
      }
      case 'investigate': {
        if (w.stare > 0 && w.urgency < 0.9) { this.stareAt(dt); break; }
        const sp = U.lerp(D.wInvest * 0.85, D.wChase * 0.95, w.urgency) * sm;
        const arrived = this.moveAlong(sp, dt);
        if (arrived) {
          w.lookT += dt;
          look = 1.35;
          if (w.lookT > 2.2) this.startSearch(w.x, w.y);
        } else look = 0.25;
        break;
      }
      case 'chase': this.chase(dt, sm); look = 0; break;
      case 'search': {
        if (w.stare > 0) { this.stareAt(dt); break; }
        w.searchT -= dt;
        if (w.sniff) {
          // 在你藏身的柜子前停下……
          const L = w.sniff;
          const arrived = this.moveAlong(D.wInvest * 0.7 * sm, dt);
          if (arrived || Math.hypot(L.cx - w.x, L.cy - w.y) < 0.9) {
            w.path = null;
            w.faceTarget = Math.atan2(L.y + 0.5 - w.y, L.x + 0.5 - w.x);
            w.sniffT += dt;
            look = 0.12;
            if (w.sniffT > 2.4) {
              w.sniff = null;
              if (p.hidden === L) this.closeCall('hold');
              const q = M.randomNear(w.x, w.y, 5, this.rng);
              this.setGoal(q.x, q.y);
            }
          }
          break;
        }
        const arrived = this.moveAlong(D.wInvest * 0.8 * sm, dt);
        if (arrived) {
          w.lookT += dt;
          look = 1.4;
          if (w.lookT > 1.5) {
            w.lookT = 0;
            if (w.searchT <= 0) { w.state = 'patrol'; w.idleT = 0.5; w.susp *= 0.5; this.emit('giveUp', {}); break; }
            const L = p.hidden && !p.hidden.attract ? p.hidden : null;
            if (L && !w.sniffed.includes(L) && Math.hypot(L.cx - w.x, L.cy - w.y) < 6 && this.rng() < 0.7) {
              w.sniff = L; w.sniffT = 0; w.sniffed.push(L);
              this.setGoal(L.cx, L.cy);
              this.emit('sniff', { L });
            } else {
              const q = M.randomNear(w.x, w.y, 4.5, this.rng);
              this.setGoal(q.x, q.y);
            }
          }
        }
        break;
      }
      case 'stunned': {
        w.stunT -= dt;
        w.vx *= 0.85; w.vy *= 0.85;
        w.look = Math.sin(this.t * 13) * 0.25;
        look = -1;
        if (w.stunT <= 0) { w.susp = 0.35; this.startSearch(w.x, w.y); }
        break;
      }
      case 'recover': {
        w.recoverT -= dt;
        w.vx *= 0.85; w.vy *= 0.85;
        look = 0.1;
        if (w.recoverT <= 0) {
          w.state = 'chase';
          w.lastSeenT = this.t;
          w.lastSeen = { x: p.x, y: p.y };
          w.lastVel = { x: p.vx, y: p.vy };
          w.repath = 0;
        }
        break;
      }
      case 'openLocker': {
        const L = w.sawHide;
        if (!L || p.hidden !== L) { w.sawHide = null; w.state = 'chase'; w.lastSeenT = this.t; break; }
        const d = Math.hypot(L.cx - w.x, L.cy - w.y);
        if (d > 0.8) {
          w.repath -= dt;
          if (w.repath <= 0 || !w.path) this.setGoal(L.cx, L.cy);
          this.moveAlong(D.wChase * sm, dt);
        } else {
          w.path = null;
          w.vx *= 0.7; w.vy *= 0.7;
          w.faceTarget = Math.atan2(L.y + 0.5 - w.y, L.x + 0.5 - w.x);
          w.ripT += dt;
          if (w.ripT > 0.55) {
            // 拽出来
            w.sawHide = null;
            L.open = 1; L.busy = 0;
            p.hidden = null; p.hidePhase = null;
            p.x = L.cx; p.y = L.cy;
            p.torch = p.torchWas;
            this.emit('rip', { L });
            this.hitPlayer();
          }
        }
        look = 0;
        break;
      }
      case 'grab': break;
    }

    // 朝向与头部扫视
    if (look >= 0) {
      w.lookPh += dt * (look > 1 ? 1.5 : 0.9);
      const tl = Math.sin(w.lookPh) * look;
      w.look += (tl - w.look) * (1 - Math.exp(-dt * 4));
    }
    const turn = w.state === 'chase' ? 7 : w.state === 'stunned' ? 0.5 : 3.2;
    if (w.windup <= 0 && w.dash <= 0) w.face = U.turnTo(w.face, w.faceTarget, turn * dt);

    // 卡住检测
    w.stuckT += dt;
    if (w.stuckT > 1.3) {
      const moved = Math.hypot(w.x - w.lastPos.x, w.y - w.lastPos.y);
      if (moved < 0.2 && w.path && (w.state === 'patrol' || w.state === 'search' || w.state === 'investigate')) {
        if (w.state === 'patrol') { w.path = null; w.idleT = 0; }
        else if (w.goal) this.setGoal(w.goal.x, w.goal.y);
      }
      w.stuckT = 0;
      w.lastPos = { x: w.x, y: w.y };
    }

    // 眼睛亮度
    let ek = 1;
    if (w.state === 'stunned') ek = 0.08 + (w.stunT < 0.8 ? (0.8 - w.stunT) * 0.8 : 0) + (Math.random() < 0.08 ? 0.3 : 0);
    else if (w.state === 'recover') ek = 0.45;
    else if (w.windup > 0) ek = 1.7;
    w.eyeK += (ek - w.eyeK) * (1 - Math.exp(-dt * 10));
  };

  G.stareAt = function (dt) {
    const w = this.warden, p = this.player;
    w.vx *= 0.85; w.vy *= 0.85;
    w.faceTarget = Math.atan2(p.y - w.y, p.x - w.x);
    w.look *= 0.9;
  };

  G.perceive = function (dt) {
    const w = this.warden, p = this.player, M = this.map, D = this.D;
    w.seeing = false;
    w.noticing = 0;
    if (this.attract || w.state === 'stunned' || w.state === 'grab') { w.susp = Math.max(0, w.susp - dt * 0.3); return; }
    const visible = !p.hidden && !p.vent;
    if (!visible) { w.susp = Math.max(0, w.susp - dt * 0.18); return; }
    const dx = p.x - w.x, dy = p.y - w.y, d = Math.hypot(dx, dy);
    if (d > 17 || !M.los(w.x, w.y, p.x, p.y)) { w.susp = Math.max(0, w.susp - dt * 0.2); return; }
    const ang = Math.atan2(dy, dx);
    const off = Math.abs(U.angDiff(w.face + w.look, ang));
    const exp = Math.min(1.4, this.exposure(p.x, p.y));
    const range = D.vision * (0.72 + 0.4 * exp) * (p.torch ? 1.12 : 0.82) * (p.sprinting ? 1.08 : 1);
    if (w.state === 'chase' || w.state === 'recover' || w.state === 'openLocker') {
      if (d < D.vision * 1.75) w.seeing = true;
    } else {
      let rate = 0;
      if (off < D.half && d < range) rate = Math.max(rate, (1.3 - d / range) * 2.6);
      if (d < 1.7) rate = Math.max(rate, 4);
      if (p.torch && d < D.glimpse && off < 1.75) rate = Math.max(rate, (1 - d / D.glimpse) * 0.85 + 0.1);
      // 手电照到它身上
      if (p.torch && d < PL.flashRange) {
        const back = Math.abs(U.angDiff(p.aim, Math.atan2(-dy, -dx)));
        if (back < PL.flashHalf * 0.85) rate = Math.max(rate, 1.7 * (1 - d / 12) + 0.45);
      }
      if (rate > 0) {
        w.noticing = rate;
        w.susp = Math.min(1, w.susp + rate * dt);
        if (w.susp > 0.18 && w.state !== 'investigate') w.stare = Math.max(w.stare, 0.35);
        if (w.state === 'investigate' && w.urgency < 0.9) w.stare = Math.max(w.stare, 0.2);
      } else w.susp = Math.max(0, w.susp - dt * 0.22);
      if (w.susp >= 1) w.seeing = true;
    }
    if (w.seeing) {
      w.lastSeenT = this.t;
      w.lastSeen = { x: p.x, y: p.y };
      w.lastVel = { x: p.vx, y: p.vy };
    }
  };

  G.chase = function (dt, sm) {
    const w = this.warden, p = this.player, M = this.map, D = this.D;
    this.lastTension = this.t;
    const visible = !p.hidden && !p.vent;
    // 冲扑前摇
    if (w.windup > 0) {
      w.windup -= dt;
      const ta = Math.atan2(p.y - w.y, p.x - w.x);
      if (visible) w.face = U.turnTo(w.face, ta, dt * 2.7);
      w.vx *= 0.82; w.vy *= 0.82;
      w.x += Math.cos(w.face) * 0.5 * dt;
      w.y += Math.sin(w.face) * 0.5 * dt;
      M.collide(w, w.r);
      if (w.windup <= 0) {
        w.dash = w.windupMax < 0.3 ? 0.13 : 0.26;
        w.dashDir = w.face;
        w.dashMin = 99;
        this.emit('lunge', { x: w.x, y: w.y });
      }
      return;
    }
    if (w.dash > 0) {
      w.dash -= dt;
      const v = 11.5;
      w.vx = Math.cos(w.dashDir) * v;
      w.vy = Math.sin(w.dashDir) * v;
      w.x += w.vx * dt;
      w.y += w.vy * dt;
      M.collide(w, w.r);
      const d = Math.hypot(p.x - w.x, p.y - w.y);
      w.dashMin = Math.min(w.dashMin, d);
      if (visible && p.inv <= 0 && d < w.r + p.r + 0.2) {
        w.dash = 0;
        this.hitPlayer();
        return;
      }
      if (w.dash <= 0) {
        w.postDash = 0.55;
        w.lungeCd = D.lungeCd;
        w.vx *= 0.2; w.vy *= 0.2;
        if (w.dashMin < 1.2 && this.player.hp > 0) this.closeCall('dodge');
        this.emit('lungeMiss', {});
      }
      return;
    }
    if (w.postDash > 0) { w.postDash -= dt; w.vx *= 0.9; w.vy *= 0.9; return; }

    // 目标
    let tx, ty;
    const since = this.t - w.lastSeenT;
    const heardSince = this.t - w.lastHeardT;
    if (w.seeing) { tx = p.x; ty = p.y; }
    else if (w.heard && heardSince < since) { tx = w.heard.x; ty = w.heard.y; }
    else {
      // 按最后看到的位置和方向推测
      const lv = w.lastVel, ls = Math.hypot(lv.x, lv.y);
      tx = w.lastSeen.x; ty = w.lastSeen.y;
      if (ls > 0.5) {
        const ex = Math.min(3.2, ls * 0.8);
        const free = M.rayDist(tx, ty, lv.x / ls, lv.y / ls, ex, 0);
        tx += (lv.x / ls) * Math.max(0, free - 0.4);
        ty += (lv.y / ls) * Math.max(0, free - 0.4);
      }
    }
    const lost = Math.min(since, heardSince);
    w.repath -= dt;
    if (w.repath <= 0 || !w.path) {
      w.repath = w.seeing ? 0.22 : 0.4;
      w.goal = { x: tx, y: ty };
      w.path = M.findPath(w.x, w.y, tx, ty, this.flareCost, w.r);
      w.pi = 1;
    }
    const arrived = this.moveAlong(D.wChase * sm, dt);
    if (w.seeing) w.faceTarget = Math.atan2(p.y - w.y, p.x - w.x);
    if (!w.seeing && (lost > D.memory + 2.5 || (lost > D.memory && (arrived || Math.hypot(tx - w.x, ty - w.y) < 1)))) {
      this.startSearch(tx, ty);
      return;
    }
    // 冲扑
    const d = Math.hypot(p.x - w.x, p.y - w.y);
    if (w.seeing && visible && p.inv <= 0.2 && w.lungeCd <= 0 && d < D.lungeRange) {
      const close = d < 1.15;
      w.windup = w.windupMax = close ? 0.24 : D.windup;
      w.face = Math.atan2(p.y - w.y, p.x - w.x);
      this.emit('windup', { x: w.x, y: w.y });
    }
  };

  G.hitPlayer = function () {
    const p = this.player, w = this.warden, D = this.D;
    if (this.ending) return;
    p.hp--;
    this.stats.hits++;
    p.calib = null;
    p.restoring = null;
    if (p.hp <= 0) {
      this.ending = { type: 'caught', t: 0 };
      w.state = 'grab';
      w.windup = 0; w.dash = 0;
      p.vx = p.vy = 0;
      this.emit('caught', {});
      return;
    }
    p.inv = 2.4;
    p.adren = 2.3;
    p.stamina = Math.max(p.stamina, 0.55);
    p.exhausted = false;
    p.flinch = 0.25;
    const a = Math.atan2(p.y - w.y, p.x - w.x);
    p.vx = Math.cos(a) * 7.5;
    p.vy = Math.sin(a) * 7.5;
    w.state = 'recover';
    w.recoverT = 1.65;
    w.windup = 0; w.dash = 0; w.path = null;
    w.lungeCd = D.lungeCd + 0.6;
    this.emit('hit', { hp: p.hp });
  };

  G.updateGrab = function (dt) {
    const w = this.warden, p = this.player;
    if (this.ending.type !== 'caught') return;
    // 守夜者靠近、俯身
    const dx = p.x - w.x, dy = p.y - w.y, d = Math.hypot(dx, dy);
    if (d > 0.62) { w.x += (dx / d) * Math.min(d - 0.62, dt * 2.5); w.y += (dy / d) * Math.min(d - 0.62, dt * 2.5); }
    w.face = U.turnTo(w.face, Math.atan2(dy, dx), dt * 6);
    w.eyeK += (2.2 - w.eyeK) * (1 - Math.exp(-dt * 3));
  };

  U.Game = Game;
})();
