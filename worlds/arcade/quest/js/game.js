/* 远征 · 核心模拟：英雄、武器、魔物、首领、导演系统 */
(function () {
  'use strict';
  const Q = window.Q, TAU = Q.TAU;
  const { clamp, lerp, rand, randi, angDiff } = Q;
  const sfx = (n) => Q.audio.play(n);

  /* ---------- 常量与对象池 ---------- */
  const MAX_E = 720, MAX_P = 640, MAX_EB = 560, MAX_G = 720, MAX_PT = 3600;
  const CS = 64, GB = 7, GN = 1 << GB, GM = GN - 1;
  const gHead = new Int32Array(GN * GN).fill(-1);
  const gNext = new Int32Array(MAX_E);
  const QB = [], QB2 = [], QB3 = [], QB4 = [];

  const G = (Q.G = { state: 'off', t: 0, dbg: { speed: 1, god: false }, cam: { x: 0, y: 0 }, scale: 1, vw: 1400, vh: 900, W: 1400, H: 900, pq: 1, ptCap: MAX_PT, mobile: false });

  function mkEnemy(i) {
    return { i, uid: 0, alive: false, id: '', d: null, arch: '', x: 0, y: 0, kx: 0, ky: 0, r: 10, hp: 1, mhp: 1, spd: 50, dmg: 5, mass: 1, xp: 1,
      flash: 0, slowT: 0, slowA: 0, frz: 0, stun: 0, root: 0, burnT: 0, burnD: 0, burnTick: 0, vuln: 0,
      st: 0, stT: 0, tx: 0, ty: 0, face: 1, ph: 0, elite: false, big: false, boss: null, sh: 0, shMax: 0, shCd: 0,
      hOrb: -9, hDisc: -9, hBash: -1, shotT: 0, ai: 0, spawnT: 0, noXp: false, hpLag: 1, charging: false, scale: 1 };
  }
  const EN = []; for (let i = 0; i < MAX_E; i++) EN.push(mkEnemy(i));
  let eAct = [], eFree = [], ePend = [];

  const PJ = []; for (let i = 0; i < MAX_P; i++) PJ.push({ alive: false, k: '', x: 0, y: 0, vx: 0, vy: 0, r: 5, dmg: 1, pierce: 0, life: 1, t: 0, src: '', hit: [], homing: 0, tgt: null, tgtUid: 0, retarget: 0, spd: 0, kb: 0, boom: 0, split: 0, wait: 0, ox: 0, oy: 0, back: false, range: 0, crit: false, ang: 0, scale: 1 });
  let pAct = [], pFree = [];
  const EB = []; for (let i = 0; i < MAX_EB; i++) EB.push({ alive: false, k: '', x: 0, y: 0, vx: 0, vy: 0, r: 7, dmg: 5, life: 5, t: 0, turn: 0, spd: 0 });
  let ebAct = [], ebFree = [];
  const GMS = []; for (let i = 0; i < MAX_G; i++) GMS.push({ alive: false, x: 0, y: 0, v: 1, tier: 0, vx: 0, vy: 0, att: false, sp: 0, t: 0 });
  let gemAct = [], gemFree = [];

  // 粒子（结构数组）
  const PT = (Q.PT = { n: 0, x: new Float32Array(MAX_PT), y: new Float32Array(MAX_PT), vx: new Float32Array(MAX_PT), vy: new Float32Array(MAX_PT), l: new Float32Array(MAX_PT), m: new Float32Array(MAX_PT), s: new Float32Array(MAX_PT), c: new Uint8Array(MAX_PT), k: new Uint8Array(MAX_PT), d: new Float32Array(MAX_PT), g: new Float32Array(MAX_PT) });
  function pt(x, y, vx, vy, life, size, col, kind, drag, grav) {
    if (PT.n >= G.ptCap) return;
    const i = PT.n++;
    PT.x[i] = x; PT.y[i] = y; PT.vx[i] = vx; PT.vy[i] = vy; PT.l[i] = life; PT.m[i] = life; PT.s[i] = size; PT.c[i] = col; PT.k[i] = kind || 0; PT.d[i] = drag == null ? 3 : drag; PT.g[i] = grav || 0;
  }
  function burst(x, y, n, col, spd, life, size, kind, drag, grav) {
    n = Math.max(1, Math.round(n * G.pq));
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, s = spd * (0.25 + Math.random() * 0.75);
      pt(x, y, Math.cos(a) * s, Math.sin(a) * s, life * (0.6 + Math.random() * 0.6), size * (0.7 + Math.random() * 0.6), col, kind, drag, grav);
    }
  }
  Q.fx = { pt, burst };

  /* ---------- 空间哈希 ---------- */
  function gridBuild() {
    gHead.fill(-1);
    for (let k = 0; k < eAct.length; k++) {
      const e = eAct[k];
      if (e.big) continue;
      const key = ((Math.floor(e.x / CS) & GM) << GB) | (Math.floor(e.y / CS) & GM);
      gNext[e.i] = gHead[key]; gHead[key] = e.i;
    }
    while (ePend.length) eFree.push(ePend.pop());
  }
  function query(x, y, r, out) {
    out.length = 0;
    const R = r + 34;
    const x0 = Math.floor((x - R) / CS), x1 = Math.floor((x + R) / CS), y0 = Math.floor((y - R) / CS), y1 = Math.floor((y + R) / CS);
    for (let cx = x0; cx <= x1; cx++) {
      const kx = (cx & GM) << GB;
      for (let cy = y0; cy <= y1; cy++) {
        let j = gHead[kx | (cy & GM)];
        while (j >= 0) {
          const e = EN[j];
          if (e.alive) { const dx = e.x - x, dy = e.y - y, rr = r + e.r; if (dx * dx + dy * dy < rr * rr) out.push(e); }
          j = gNext[j];
        }
      }
    }
    for (let k = 0; k < G.big.length; k++) {
      const e = G.big[k];
      if (!e.alive) continue;
      const dx = e.x - x, dy = e.y - y, rr = r + e.r;
      if (dx * dx + dy * dy < rr * rr) out.push(e);
    }
    return out;
  }
  /** 首领在射程内且可被攻击时返回首领 */
  function bossIn(x, y, r) {
    const b = G.boss;
    if (!b || !b.alive || b.boss.vanish || b.boss.state === 'intro' || b.boss.state === 'dying') return null;
    return Math.hypot(b.x - x, b.y - y) - b.r < r ? b : null;
  }
  function nearest(x, y, maxR, skipUids) {
    query(x, y, maxR, QB4);
    let best = null, bd = 1e18;
    for (let k = 0; k < QB4.length; k++) {
      const e = QB4[k];
      if (e.spawnT > 0.15) continue;
      if (skipUids && skipUids.indexOf(e.uid) >= 0) continue;
      const dx = e.x - x, dy = e.y - y, d = dx * dx + dy * dy - (e.boss ? e.r * e.r : 0);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  /* ---------- 状态 ---------- */
  let P = null, st = null;
  function freshStats() {
    return { might: 1, cd: 1, area: 1, speed: 160, magnet: 70, maxHp: 100, regen: 0, crit: 0.05, critMul: 2, proj: 0, xpMul: 1, armor: 0, dr: 0, leech: 0, skillCd: 1 };
  }
  function recalc() {
    const H = G.hero, L = (id) => G.lv[id] | 0, R = Q.runeLv;
    const old = st ? st.maxHp : 0;
    st = G.st = st || freshStats();
    st.might = H.might * (1 + 0.12 * L('might')) * (1 + 0.05 * R('dmg'));
    st.cd = Math.max(0.4, 1 - 0.08 * L('haste'));
    st.area = H.area * (1 + 0.1 * L('area'));
    st.speed = H.spd * (1 + 0.08 * L('swift')) * (1 + 0.04 * R('spd'));
    st.magnet = 90 * (1 + 0.3 * L('magnet')) * (1 + 0.15 * R('mag'));
    st.maxHp = (H.hp + 20 * L('vital')) * (1 + 0.08 * R('hp'));
    st.regen = H.regen + 0.3 * L('vital') + 0.25 * R('regen');
    st.crit = H.crit + 0.05 * L('crit');
    st.critMul = 2 + H.critMul + 0.15 * L('crit');
    st.proj = L('multi');
    // 手机上同屏魔物较少（×0.72），用经验加成补回成长节奏
    st.xpMul = (1 + 0.1 * L('wis')) * (1 + 0.06 * R('xp')) * Q.MODES[G.mode].xpMul * (G.mobile ? 1.28 : 1);
    st.armor = H.armor + L('armor') + R('armor');
    st.dr = H.dr || 0;
    st.leech = 0.25 * L('leech');
    st.skillCd = (1 - 0.06 * R('cd'));
    if (P && old) { if (st.maxHp > old) P.hp += st.maxHp - old; P.hp = Math.min(P.hp, st.maxHp); }
  }

  function reset(heroId, mode) {
    // 回收所有对象
    for (const e of EN) e.alive = false;
    eAct = []; ePend = []; eFree = EN.slice().reverse();
    for (const p of PJ) p.alive = false; pAct = []; pFree = PJ.slice();
    for (const b of EB) b.alive = false; ebAct = []; ebFree = EB.slice();
    for (const g of GMS) g.alive = false; gemAct = []; gemFree = GMS.slice();
    PT.n = 0;
    gHead.fill(-1);
    const H = Q.HEROES[heroId];
    Object.assign(G, {
      state: 'play', hero: H, mode, t: 0, stage: 0, stageT: 0, stageDur: Q.MODES[mode].stageDur, uidc: 0,
      kills: 0, level: 1, xp: 0, xpNext: xpFor(1), queue: [], lvDelay: 0, choices: null, choiceTitle: '', rerolls: Q.runeLv('reroll'),
      lv: {}, evo: {}, weapons: [], skillLv: 1, dmgBy: {}, totalDmg: 0, dmgTaken: 0, dustPicked: 0, bossKills: 0, eliteKills: 0, evoCount: 0,
      big: [], boss: null, bossPending: false, warned: false, starfall: null, arena: null, nextStageT: 0, wonT: 0, deadT: 0, ended: false,
      events: [], surgeT: 0, spawnAcc: 0, hpMul: 1, dmgMul: 1, spdMul: 1,
      zones: [], hazards: [], teles: [], beams: [], timers: [], deferred: [], rings: [], flashes: [], slashes: [], bolts: [], meteors: [], texts: [], after: [], items: [], pillars: [],
      shake: 0, hurtFlash: 0, flash: 0, flashCol: '#ffffff', ts: 1, slowT: 0, slowK: 1, stop: 0, biomeFrom: 0, biomeFade: 1,
      reviveLeft: Q.runeLv('revive') > 0 ? 1 : 0, bossHit: 0, magnetAll: 0, aimT: 0, aimTgt: null, frostEvo: false, choiceN: 3 + Q.runeLv('choice'),
      eAct, pAct, ebAct, gemAct, bossGen: 1, combo: 0, comboT: 0, bestCombo: 0, noHitStage: true, skillUses: 0, firstPick: true,
      countMul: G.mobile ? 0.72 : 1, eCap: G.mobile ? 270 : 430, gemCap: G.mobile ? 380 : 600, newAch: [],
    });
    st = null;
    P = G.p = { x: 0, y: 0, vx: 0, vy: 0, r: 13, hp: 1, aim: 0, face: 1, move: 0, moved: 0, mang: 0, dashT: 0, dvx: 0, dvy: 0, dashKind: '', dashCd: 0, skillCd: 1.5,
      inv: 1.2, iframe: 0, fortify: 0, slowT: 0, iceShield: 0, iceT: 8, dead: false, afterT: 0, swing: 0, hurtT: 0, draw: 0, trapT: 0 };
    recalc();
    P.hp = st.maxHp;
    G.lv[H.weapon] = 1; G.lv[H.skill] = 1;
    G.weapons.push(mkWeapon(H.weapon, 1));
    buildEvents();
    G.cam.x = 0; G.cam.y = 0;
  }
  function xpFor(L) { return Math.round(4 + (L - 1) * 8 + Math.pow(L - 1, 1.9) * 0.85); }
  Q.xpFor = xpFor;

  function buildEvents() {
    const S = Q.STAGES[G.stage];
    G.events = S.events.map(([at, k]) => ({ at, k, done: false }));
  }

  /* ---------- 计时器与延迟事件 ---------- */
  function after(d, fn) { G.timers.push({ at: G.t + d, fn }); }
  function processTimers() {
    if (!G.timers.length) return;
    const now = G.t, list = G.timers;
    G.timers = [];
    for (let i = 0; i < list.length; i++) {
      const tm = list[i];
      if (tm.bg !== undefined && tm.bg !== G.bossGen) continue;
      if (tm.at <= now) { try { tm.fn(); } catch (e) { console.error(e); } } else G.timers.push(tm);
    }
  }

  /* ---------- 效果 ---------- */
  function shake(v) { if (Q.save.settings.shake) G.shake = Math.min(1, G.shake + v); }
  function ring(x, y, r0, r1, dur, col, w) { if (G.rings.length < 90) G.rings.push({ x, y, r0, r1, t: 0, dur, col, w: w || 3 }); }
  function flashAt(x, y, r, dur, col) { if (G.flashes.length < 70) G.flashes.push({ x, y, r, t: 0, dur, col }); }
  function dnum(x, y, v, crit, col, text) {
    if (!Q.save.settings.numbers && !text) return;
    // 大混战时节流普通伤害数字，保证画面可读
    if (!crit && !text && G.texts.length > 22 && Math.random() < 0.7) return;
    if (G.texts.length >= 48) { if (!crit && !text) return; G.texts.shift(); }
    G.texts.push({ x: x + rand(-7, 7), y, vy: crit ? -78 : -58, t: 0, life: crit ? 0.95 : 0.62, v: text || Math.max(1, Math.round(v)), crit, col: col || null });
  }
  function banner(big, small, col) { if (Q.ui) Q.ui.banner(big, small, col); }
  function ach(id) {
    if (Q.arcade.unlock(id, Q.ACH[id])) { G.newAch.push(id); if (Q.ui) Q.ui.toast('成就解锁', Q.ACH[id]); }
  }

  /* ---------- 敌人 ---------- */
  function spawnEnemy(id, x, y, o) {
    const e = eFree.pop();
    if (!e) return null;
    const d = Q.ENEMIES[id];
    e.uid = ++G.uidc; e.alive = true; e.id = id; e.d = d; e.arch = d.arch;
    e.x = x; e.y = y; e.kx = 0; e.ky = 0; e.r = d.r; e.scale = 1;
    const hm = G.hpMul * ((o && o.hpMul) || 1);
    e.mhp = e.hp = d.hp * hm; e.hpLag = 1;
    e.spd = d.spd * rand(0.9, 1.1) * G.spdMul; e.dmg = d.dmg * G.dmgMul; e.mass = d.mass; e.xp = d.xp;
    e.flash = 0; e.slowT = 0; e.slowA = 0; e.frz = 0; e.stun = 0; e.root = 0; e.burnT = 0; e.burnD = 0; e.burnTick = 0; e.vuln = 0;
    e.st = 0; e.stT = rand(0.5, 2); e.face = x < P.x ? 1 : -1; e.ph = Math.random() * TAU;
    e.elite = d.arch === 'elite'; e.big = false; e.boss = null;
    e.sh = 0; e.shMax = 0; e.shCd = 0;
    if (e.elite) { e.shMax = e.sh = e.mhp * 0.45; }
    e.hOrb = -9; e.hDisc = -9; e.hBash = -1; e.shotT = rand(1, d.shotCd || 3); e.spawnT = (o && o.instant) ? 0 : 0.35; e.noXp = !!(o && o.noXp); e.charging = false;
    e.ai = eAct.length; eAct.push(e);
    return e;
  }
  function removeEnemy(e) {
    if (!e.alive) return;
    e.alive = false;
    const last = eAct.pop();
    if (last !== e) { eAct[e.ai] = last; last.ai = e.ai; }
    if (e.big) { const k = G.big.indexOf(e); if (k >= 0) G.big.splice(k, 1); }
    ePend.push(e);
  }
  function spawnPos(margin) {
    const hw = G.vw / 2 + margin, hh = G.vh / 2 + margin;
    let a;
    const mv = P.vx * P.vx + P.vy * P.vy > 400;
    if (mv && Math.random() < 0.45) a = Math.atan2(P.vy, P.vx) + rand(-0.9, 0.9);
    else a = Math.random() * TAU;
    const c = Math.cos(a), s = Math.sin(a);
    const t = Math.min(hw / Math.max(1e-3, Math.abs(c)), hh / Math.max(1e-3, Math.abs(s)));
    return [P.x + c * t + rand(-20, 20), P.y + s * t + rand(-20, 20)];
  }
  function relocate(e) {
    const p = spawnPos(50);
    e.x = p[0]; e.y = p[1]; e.kx = e.ky = 0; e.st = 0; e.charging = false;
  }

  /* ---------- 伤害结算 ---------- */
  function hit(e, dmg, src, dx, dy, kb, x) {
    if (!e.alive) return 0;
    if (e.boss && (e.boss.inv > 0 || e.boss.state === 'dying' || e.boss.vanish)) return 0;
    let crit = false;
    if (x && x.crit) crit = true; else if (!(x && x.noCrit) && Math.random() < st.crit) crit = true;
    if (crit) dmg *= st.critMul;
    if (e.frz > 0 && G.frostEvo) dmg *= 1.5;
    if (e.vuln > 0) dmg *= 1.3;
    if (e.boss && e.boss.stagger > 0) dmg *= 1.4;
    G.dmgBy[src] = (G.dmgBy[src] || 0) + Math.min(dmg, e.hp + e.sh);
    G.totalDmg += Math.min(dmg, e.hp + e.sh);
    e.flash = 0.08;
    if (e.sh > 0) {
      e.sh -= dmg;
      dnum(e.x, e.y - e.r, dmg, crit, '#8fd8ff');
      if (e.sh <= 0) {
        e.sh = 0; e.stun = 1.8; e.vuln = 5; e.shCd = 9;
        ring(e.x, e.y, e.r, e.r * 3.2, 0.45, '#9fe8ff', 4);
        burst(e.x, e.y, 26, Q.C.ice, 260, 0.6, 3, 1);
        dnum(e.x, e.y - e.r - 16, 0, true, '#9fe8ff', '破盾');
        sfx('shieldBreak'); shake(0.2); G.stop = Math.max(G.stop, 0.05);
      } else sfx('shield');
      return dmg;
    }
    e.hp -= dmg;
    if (kb && !e.boss) { const f = kb / e.mass; e.kx += dx * f; e.ky += dy * f; }
    if (x) {
      if (x.slow) { e.slowT = Math.max(e.slowT, x.slowT || 1.5); e.slowA = Math.max(e.slowA, x.slow); }
      if (!e.boss) {
        if (x.freeze) e.frz = Math.max(e.frz, e.elite ? x.freeze * 0.5 : x.freeze);
        if (x.stun) e.stun = Math.max(e.stun, e.elite ? x.stun * 0.5 : x.stun);
        if (x.root) e.root = Math.max(e.root, x.root);
      }
      if (x.burn) { e.burnT = 4; e.burnD = Math.max(e.burnD, x.burn); }
    }
    dnum(e.x, e.y - e.r * (e.boss ? 1.6 : 1), dmg, crit, x && x.col);
    if (crit) sfx('crit');
    if (e.hp <= 0) {
      if (e.boss) bossBeginDeath(e);
      else kill(e, src);
    } else sfx('hit');
    return dmg;
  }

  function kill(e, src) {
    G.kills++;
    G.combo++; G.comboT = 2.2; if (G.combo > G.bestCombo) G.bestCombo = G.combo;
    const d = e.d;
    if (!e.noXp) dropGem(e.x, e.y, e.xp);
    if (e.elite) {
      dropItem('chest', e.x, e.y);
      if (Math.random() < 0.6) dropItem('heal', e.x + 26, e.y + 6);
      for (let i = 0; i < 3; i++) dropItem('dust', e.x + rand(-30, 30), e.y + rand(-30, 30));
      shake(0.3); sfx('boom'); G.eliteKills++;
      ring(e.x, e.y, 10, 110, 0.5, Q.PAL[d.pc], 5);
      burst(e.x, e.y, 40, d.pc, 320, 0.8, 3.4, 0);
    } else {
      const r = Math.random();
      if (r < 0.0032) dropItem('heal', e.x, e.y);
      else if (r < 0.0068) dropItem('magnet', e.x, e.y);
      else if (r < 0.0082) dropItem('bomb', e.x, e.y);
      else if (r < 0.021) dropItem('dust', e.x, e.y);
    }
    if (st.leech > 0 && P.hp < st.maxHp) P.hp = Math.min(st.maxHp, P.hp + st.leech);
    const big = e.r > 20;
    burst(e.x, e.y, big ? 16 : 7, d.pc, big ? 200 : 150, 0.42, big ? 3.2 : 2.4, 0);
    burst(e.x, e.y, big ? 8 : 4, Q.C.white, 220, 0.25, 1.2, 1);
    if (e.arch === 'bomber') G.deferred.push(['blast', e.x, e.y, 74, 26 * st.might * (1 + G.stage * 0.8), false, d.pc]);
    if (d.child) G.deferred.push(['split', e.x, e.y, d.child, d.nChild]);
    if (e.burnT > 0 && G.evo.flame) G.deferred.push(['patch', e.x, e.y]);
    sfx('kill');
    removeEnemy(e);
  }

  function hurt(dmg, sx, sy) {
    if (G.dbg.god || P.dead || P.inv > 0 || P.iframe > 0 || G.state !== 'play') return false;
    if (P.iceShield) {
      P.iceShield = 0; P.iceT = 8; P.iframe = 0.4;
      ring(P.x, P.y, 10, 70, 0.4, '#bff4ff', 4); burst(P.x, P.y, 22, Q.C.ice, 240, 0.6, 2.6, 1);
      sfx('shieldBreak');
      return false;
    }
    dmg = Math.max(1, dmg - st.armor) * (1 - st.dr) * (P.fortify > 0 ? 0.5 : 1);
    P.hp -= dmg; P.iframe = 0.55; P.hurtT = 0.3;
    G.dmgTaken += dmg; G.hurtFlash = 1; G.noHitStage = false;
    if (G.boss) G.bossHit++;
    shake(0.35); sfx('hurt');
    dnum(P.x, P.y - 30, dmg, false, '#ff5a5a');
    burst(P.x, P.y, 10, Q.C.red, 180, 0.4, 2.4, 1);
    // 受击时推开身边的小怪，避免连续受击
    query(P.x, P.y, 70, QB3);
    for (const e of QB3) { if (e.boss) continue; const dx = e.x - P.x, dy = e.y - P.y, d = Math.hypot(dx, dy) || 1; e.kx += (dx / d) * 260 / e.mass; e.ky += (dy / d) * 260 / e.mass; }
    if (P.hp <= 0) die();
    return true;
  }
  function heal(v) {
    const before = P.hp;
    P.hp = Math.min(st.maxHp, P.hp + v);
    const got = P.hp - before;
    if (got > 0.5) dnum(P.x, P.y - 34, got, false, '#7dffb5', '+' + Math.round(got));
  }
  function die() {
    if (G.reviveLeft > 0) {
      G.reviveLeft = 0; P.hp = st.maxHp * 0.5; P.inv = 2.2;
      ring(P.x, P.y, 10, 320, 0.8, '#ffe9b0', 8); flashAt(P.x, P.y, 300, 0.6, '#ffe9b0');
      burst(P.x, P.y, 60, Q.C.gold, 420, 1, 3.4, 0);
      query(P.x, P.y, 300, QB3);
      for (const e of QB3.slice()) { if (!e.boss) { const dx = e.x - P.x, dy = e.y - P.y, d = Math.hypot(dx, dy) || 1; hit(e, 9999, 'revive', dx / d, dy / d, 400, { noCrit: true }); } }
      sfx('revive'); banner('涅槃', '星火重燃，再战一程', '#ffe9b0');
      G.slowT = 0.6; G.slowK = 0.3;
      return;
    }
    P.dead = true; P.hp = 0;
    G.state = 'dying'; G.deadT = 1.8;
    G.slowT = 1.6; G.slowK = 0.25;
    burst(P.x, P.y, 70, G.hero.pc, 380, 1.2, 3.4, 0);
    burst(P.x, P.y, 30, Q.C.white, 300, 0.8, 2, 1);
    ring(P.x, P.y, 6, 200, 0.9, G.hero.color, 6);
    shake(0.8); sfx('defeat');
    Q.audio.music('calm');
  }

  /* ---------- 掉落 ---------- */
  function tierOf(v) { return v >= 40 ? 3 : v >= 12 ? 2 : v >= 4 ? 1 : 0; }
  function dropGem(x, y, v) {
    if (gemAct.length >= G.gemCap || !gemFree.length) {
      const g = gemAct[(Math.random() * gemAct.length) | 0];
      if (g) { g.v += v; g.tier = tierOf(g.v); }
      return;
    }
    const g = gemFree.pop();
    g.alive = true; g.x = x; g.y = y; g.v = v; g.tier = tierOf(v);
    const a = Math.random() * TAU, s = rand(20, 80);
    g.vx = Math.cos(a) * s; g.vy = Math.sin(a) * s; g.att = G.magnetAll > 0; g.sp = 0; g.t = Math.random() * 10;
    gemAct.push(g);
  }
  function dropItem(k, x, y, extra) {
    if (G.items.length > 60 && k === 'dust') return;
    G.items.push(Object.assign({ k, x, y, t: 0, att: false, sp: 0, vx: rand(-50, 50), vy: rand(-80, -20) }, extra || {}));
  }
  function addXp(v) {
    G.xp += v * st.xpMul;
    while (G.xp >= G.xpNext) {
      G.xp -= G.xpNext; G.level++; G.xpNext = xpFor(G.level);
      G.queue.push({ kind: 'level' });
      if (G.level >= 30) ach('level-30');
    }
  }

  /* ======================================================================
     武器与法术
     ====================================================================== */
  function mkWeapon(id, lvl) { return { id, lvl: lvl || 1, evo: false, t: 0.4, n: 0, a: 0, dist: 0, pos: [], ready: 0, regen: 0 }; }
  function shoot(k, x, y, a, spd, dmg, o) {
    const p = pFree.pop();
    if (!p) return null;
    p.alive = true; p.k = k; p.x = x; p.y = y; p.ang = a; p.spd = spd; p.vx = Math.cos(a) * spd; p.vy = Math.sin(a) * spd;
    p.r = o.r || 6; p.dmg = dmg; p.pierce = o.pierce || 0; p.life = o.life || 1.2; p.t = 0; p.src = o.src; p.hit.length = 0;
    p.homing = o.homing || 0; p.tgt = o.tgt || null; p.tgtUid = o.tgt ? o.tgt.uid : 0; p.retarget = 0; p.kb = o.kb || 0;
    p.boom = o.boom || 0; p.split = o.split || 0; p.wait = o.wait || 0; p.ox = o.ox || 0; p.oy = o.oy || 0; p.back = false; p.range = o.range || 0; p.crit = !!o.crit; p.scale = o.scale || 1;
    pAct.push(p);
    return p;
  }
  function slash(x, y, a, R, half, dmg, src, kb, full, col) {
    query(x, y, R, QB2);
    for (let k = 0; k < QB2.length; k++) {
      const e = QB2[k];
      const dx = e.x - x, dy = e.y - y, d = Math.hypot(dx, dy) || 1;
      if (!full) { const da = Math.abs(angDiff(a, Math.atan2(dy, dx))); if (da > half + Math.asin(Math.min(1, e.r / d))) continue; }
      hit(e, dmg, src, dx / d, dy / d, kb, null);
    }
    G.slashes.push({ x, y, a, R, half: full ? Math.PI : half, t: 0, dur: 0.22, col: col || G.hero.color, full, att: x === P.x && y === P.y });
    const n = full ? 16 : 9;
    for (let i = 0; i < n * G.pq; i++) {
      const aa = full ? Math.random() * TAU : a + rand(-half, half), rr = R * rand(0.6, 1);
      pt(x + Math.cos(aa) * rr, y + Math.sin(aa) * rr, Math.cos(aa) * 90, Math.sin(aa) * 90, 0.3, 2.2, Q.C.gold, 1, 4);
    }
  }
  function aoe(x, y, R, dmg, src, kb, xo, buf) {
    const out = query(x, y, R, buf || QB3);
    for (let k = 0; k < out.length; k++) {
      const e = out[k];
      const dx = e.x - x, dy = e.y - y, d = Math.hypot(dx, dy) || 1;
      hit(e, dmg, src, dx / d, dy / d, kb, xo);
    }
    return out.length;
  }

  const W = {};
  W.w_guard = (w, dt) => {
    w.t -= dt; if (w.t > 0) return;
    const L = w.lvl, evo = w.evo;
    w.t += 0.82 * st.cd * (evo ? 0.88 : 1);
    w.n++;
    const R = (92 + (L >= 3 ? 16 : 0)) * st.area * (evo ? 1.25 : 1);
    const half = (L >= 3 ? 1.72 : 1.22) * (evo ? 1.08 : 1);
    const dmg = 22 * (L >= 2 ? 1.3 : 1) * (evo ? 1.55 : 1) * st.might;
    const a = P.aim;
    P.swing = 1;
    if (evo && w.n % 3 === 0) {
      slash(P.x, P.y, a, R * 1.12, Math.PI, dmg * 1.25, 'w_guard', 260, true);
      const RR = 240 * st.area;
      ring(P.x, P.y, 20, RR, 0.42, '#ffcf6b', 7);
      after(0.06, () => aoe(P.x, P.y, RR, dmg * 0.8, 'w_guard', 300, { stun: 0.4 }));
      shake(0.18); sfx('shock');
    } else {
      slash(P.x, P.y, a, R, half, dmg, 'w_guard', 200, false);
      if (L >= 4) after(0.11, () => slash(P.x, P.y, a + Math.PI, R * 0.92, half * 0.92, dmg * 0.8, 'w_guard', 170, false));
    }
    if (L >= 5) {
      const n = evo ? 3 : 1;
      for (let i = 0; i < n; i++) shoot('wave', P.x, P.y, a + (i - (n - 1) / 2) * 0.32, 520, dmg * 0.7, { r: 22 * st.area, life: 0.62, pierce: 99, src: 'w_guard', kb: 140 });
    }
    sfx('slash');
  };
  W.w_mage = (w, dt) => {
    w.t -= dt; if (w.t > 0) return;
    const L = w.lvl, evo = w.evo;
    w.t += 0.56 * st.cd * (evo ? 0.85 : 1);
    const n = 1 + (L >= 2) + (L >= 4) + st.proj;
    const dmg = 16 * (L >= 3 ? 1.3 : 1) * (evo ? 1.3 : 1) * st.might;
    for (let i = 0; i < n; i++) {
      const off = (i - (n - 1) / 2) * 0.24;
      shoot('bolt', P.x + Math.cos(P.aim) * 10, P.y - 14, P.aim + off, 450, dmg, { r: 7, life: 1.7, homing: 4.6, pierce: 0, boom: L >= 5 ? 50 * st.area : 0, split: evo ? 2 : 0, src: 'w_mage', kb: 50 });
    }
    sfx('bolt');
  };
  W.w_ranger = (w, dt) => {
    w.t -= dt; if (w.t > 0) return;
    const L = w.lvl, evo = w.evo;
    w.t += 0.44 * st.cd * (evo ? 0.9 : 1);
    w.n++;
    let n = 1 + (L >= 3) + st.proj;
    if (L >= 5 && w.n % 4 === 0) n += 2;
    if (evo && w.n % 5 === 0) n = 7 + st.proj;
    const dmg = 12 * (L >= 2 ? 1.15 : 1) * (L >= 4 ? 1.3 : 1) * (evo ? 1.4 : 1) * st.might;
    const pierce = evo ? 999 : 2 + (L >= 2 ? 1 : 0);
    const spread = n > 3 ? 0.13 : 0.09;
    for (let i = 0; i < n; i++) {
      shoot(evo ? 'beam' : 'arrow', P.x, P.y - 12, P.aim + (i - (n - 1) / 2) * spread, evo ? 1000 : 820, dmg, { r: evo ? 10 : 6, life: 0.72, pierce, src: 'w_ranger', kb: 70 });
    }
    P.draw = 1;
    sfx('arrow');
  };
  W.orbit = (w, dt) => {
    const L = w.lvl, evo = w.evo;
    w.a += dt * (L >= 5 ? 4.2 : 3.4);
    const dmg = 10 * (L >= 3 ? 1.5 : 1) * (evo ? 2.1 : 1) * st.might;
    const br = (evo ? 20 : 15) * st.area;
    w.pos.length = 0;
    const rings = evo ? [[4 + st.proj, 84, 1], [6 + st.proj, 152, -1]] : [[2 + (L >= 2) + (L >= 4) + (L >= 5) + st.proj, L >= 4 ? 92 : 78, 1]];
    for (const [n, R0, dir] of rings) {
      const R = R0 * st.area * (evo ? 1 + 0.14 * Math.sin(G.t * 2.4 + (dir > 0 ? 0 : 1.5)) : 1);
      for (let j = 0; j < n; j++) {
        const an = w.a * dir * (dir < 0 ? 0.8 : 1) + (j / n) * TAU;
        const bx = P.x + Math.cos(an) * R, by = P.y + Math.sin(an) * R;
        w.pos.push(bx, by, an + (dir > 0 ? Math.PI / 2 : -Math.PI / 2));
        query(bx, by, br, QB2);
        for (let k = 0; k < QB2.length; k++) {
          const e = QB2[k];
          if (G.t - e.hOrb < 0.42) continue;
          e.hOrb = G.t;
          const dx = e.x - P.x, dy = e.y - P.y, d = Math.hypot(dx, dy) || 1;
          hit(e, dmg, 'orbit', dx / d, dy / d, 110, null);
          if (Math.random() < 0.4) pt(bx, by, rand(-60, 60), rand(-60, 60), 0.25, 2, Q.C.gold, 1, 3);
        }
      }
    }
  };
  W.chain = (w, dt) => {
    w.t -= dt; if (w.t > 0) return;
    const L = w.lvl, evo = w.evo;
    query(P.x, P.y, 470, QB2);
    if (!QB2.length) { w.t = 0.25; return; }
    w.t += (evo ? 1.15 : L >= 3 ? 1.8 : 2.2) * st.cd;
    const strikes = (evo ? 3 : L >= 5 ? 2 : 1) + st.proj;
    const jumps = evo ? 6 : 3 + (L >= 2) + (L >= 5 ? 2 : 0);
    const dmg = 24 * (L >= 4 ? 1.4 : 1) * (evo ? 1.45 : 1) * st.might;
    const cands = QB2.slice();
    const bt = bossIn(P.x, P.y, 470);
    for (let s = 0; s < strikes && cands.length; s++) {
      let idx = (Math.random() * cands.length) | 0;
      if (bt && s === 0) { const bi = cands.indexOf(bt); if (bi >= 0) idx = bi; }
      let cur = cands[idx]; cands.splice(idx, 1);
      const hitU = [cur.uid];
      const pts = evo ? [cur.x + rand(-40, 40), cur.y - 620] : [P.x + Math.cos(P.aim) * 8, P.y - 22];
      pts.push(cur.x, cur.y);
      hit(cur, dmg * (evo ? 1.5 : 1), 'chain', 0, 0, 30, { col: '#bfeaff' });
      if (evo) {
        aoe(cur.x, cur.y, 64 * st.area, dmg * 0.8, 'chain', 120, { noCrit: false }, QB3);
        ring(cur.x, cur.y, 6, 80 * st.area, 0.3, '#bfeaff', 4); flashAt(cur.x, cur.y, 90, 0.25, '#8fd8ff');
      }
      for (let j = 0; j < jumps; j++) {
        const nx = nearest(cur.x, cur.y, 175, hitU);
        if (!nx) break;
        hitU.push(nx.uid);
        pts.push(nx.x, nx.y);
        hit(nx, dmg * 0.85, 'chain', 0, 0, 30, { col: '#bfeaff' });
        cur = nx;
      }
      G.bolts.push({ pts, t: 0, dur: evo ? 0.3 : 0.22, w: evo ? 3.4 : 2.2 });
      for (let k = 2; k < pts.length; k += 2) burst(pts[k], pts[k + 1], 3, Q.C.cyan, 140, 0.25, 2, 1);
    }
    sfx(evo ? 'thunder' : 'zap');
  };
  W.flame = (w, dt) => {
    const L = w.lvl, evo = w.evo;
    w.dist += P.moved; w.t -= dt;
    if (w.dist < 24 && w.t > 0) return;
    w.dist = 0; w.t = 0.45;
    const r = (L >= 4 ? 34 : 27) * st.area * (evo ? 1.45 : 1);
    const dmg = 6.5 * (L >= 2 ? 1.5 : 1) * (L >= 5 ? 1.5 : 1) * (evo ? 1.6 : 1) * st.might;
    const life = (L >= 3 ? 2.6 : 1.8) * (evo ? 1.15 : 1);
    G.zones.push({ k: 'fire', x: P.x + rand(-5, 5), y: P.y + 8 + rand(-4, 4), r, life, max: life, tick: 0.33, tt: 0, dmg, src: 'flame', burn: evo ? dmg * 0.6 : 0 });
  };
  W.frost = (w, dt) => {
    const L = w.lvl, evo = w.evo;
    if (evo) { P.iceT -= dt; if (!P.iceShield && P.iceT <= 0) { P.iceShield = 1; ring(P.x, P.y, 50, 20, 0.35, '#e6fbff', 3); } }
    w.t -= dt; if (w.t > 0) return;
    w.t += (evo ? 2.4 : L >= 4 ? 2.6 : 3.2) * st.cd;
    const R = (evo ? 205 : L >= 2 ? 152 : 126) * st.area;
    const dmg = 12 * (L >= 3 ? 1.6 : 1) * (evo ? 2.2 : 1) * st.might;
    query(P.x, P.y, R, QB2);
    for (let k = 0; k < QB2.length; k++) {
      const e = QB2[k];
      const dx = e.x - P.x, dy = e.y - P.y, d = Math.hypot(dx, dy) || 1;
      const fr = evo ? 1.3 : (L >= 5 && Math.random() < 0.3 ? 1.0 : 0);
      hit(e, dmg, 'frost', dx / d, dy / d, 90, { slow: 0.45, slowT: 1.6, freeze: fr, col: '#c6f3ff' });
    }
    ring(P.x, P.y, 12, R, 0.38, '#bff4ff', evo ? 7 : 5);
    ring(P.x, P.y, 6, R * 0.7, 0.3, '#ffffff', 2);
    for (let i = 0; i < 26 * G.pq; i++) { const a = Math.random() * TAU, s = rand(0.3, 1) * R * 2.4; pt(P.x, P.y, Math.cos(a) * s, Math.sin(a) * s, 0.45, rand(1.6, 3), Q.C.ice, i % 3 ? 0 : 1, 4); }
    sfx('frost');
  };
  W.meteor = (w, dt) => {
    w.t -= dt; if (w.t > 0) return;
    const L = w.lvl, evo = w.evo;
    w.t += (evo ? 1.5 : 2.8) * st.cd;
    const n = (evo ? 5 : 1 + (L >= 2) + (L >= 5)) + st.proj;
    const R = (evo ? 100 : L >= 4 ? 90 : 72) * st.area;
    const dmg = 45 * (L >= 3 ? 1.45 : 1) * (evo ? 1.5 : 1) * st.might;
    query(P.x, P.y, Math.min(G.vw, G.vh) * 0.62, QB2);
    const bt = bossIn(P.x, P.y, Math.min(G.vw, G.vh) * 0.62);
    for (let i = 0; i < n; i++) {
      let x, y;
      if (bt && i % 2 === 0) { const a = Math.random() * TAU, d = Math.random() * bt.r * 0.6; x = bt.x + Math.cos(a) * d; y = bt.y + Math.sin(a) * d; }
      else if (QB2.length) { const e = QB2[(Math.random() * QB2.length) | 0]; x = e.x + rand(-20, 20); y = e.y + rand(-20, 20); }
      else { const a = Math.random() * TAU, d = rand(80, 260); x = P.x + Math.cos(a) * d; y = P.y + Math.sin(a) * d; }
      G.meteors.push({ x, y, t: -i * 0.11, dur: 0.6, R, dmg, evo, done: false });
    }
    sfx('meteor');
  };
  W.sword = (w, dt) => {
    const L = w.lvl, evo = w.evo;
    if (evo) {
      const max = 12 + st.proj * 2;
      w.a += dt * 2.3;
      w.regen -= dt;
      if (w.ready < max && w.regen <= 0) { w.ready++; w.regen = 0.14; }
      w.t -= dt;
      if (w.t <= 0 && w.ready > 0) {
        const tgt = (Math.random() < 0.5 && bossIn(P.x, P.y, 480)) || nearest(P.x + rand(-120, 120), P.y + rand(-120, 120), 480);
        if (tgt) {
          const slot = w.ready - 1, an = w.a + (slot / max) * TAU;
          const sx = P.x + Math.cos(an) * 46, sy = P.y - 10 + Math.sin(an) * 46;
          shoot('sword', sx, sy, Math.atan2(tgt.y - sy, tgt.x - sx), 640, 34 * st.might, { r: 8, life: 1.4, homing: 9, pierce: 3, src: 'sword', kb: 80, tgt });
          w.ready--; w.t = 0.11 * st.cd;
          sfx('sword');
        } else w.t = 0.2;
      }
      return;
    }
    w.t -= dt; if (w.t > 0) return;
    w.t += 1.5 * st.cd;
    const n = 2 + (L >= 2) + (L >= 4) + st.proj;
    const dmg = 16 * (L >= 3 ? 1.5 : 1) * (L >= 5 ? 1.15 : 1) * st.might;
    const pierce = L >= 5 ? 3 : 1;
    const used = [];
    const bt = bossIn(P.x, P.y, 480);
    for (let i = 0; i < n; i++) {
      const tgt = (bt && i % 2 === 0) ? bt : (nearest(P.x, P.y, 480, used) || nearest(P.x, P.y, 480));
      if (tgt) used.push(tgt.uid);
      const an = (i / n) * TAU - Math.PI / 2;
      const ox = Math.cos(an) * 28, oy = Math.sin(an) * 18 - 14;
      const a0 = tgt ? Math.atan2(tgt.y - (P.y + oy), tgt.x - (P.x + ox)) : P.aim;
      shoot('sword', P.x + ox, P.y + oy, a0, 600, dmg, { r: 8, life: 1.8, homing: 8, pierce, src: 'sword', kb: 70, tgt, wait: 0.16 + i * 0.05, ox, oy });
    }
    sfx('sword');
  };
  W.disc = (w, dt) => {
    const L = w.lvl, evo = w.evo;
    if (evo) {
      w.a += dt * 2.1;
      const n = 2 + st.proj;
      w.pos.length = 0;
      const dmg = 40 * st.might, rr = 40 * st.area;
      for (let j = 0; j < n; j++) {
        const an = w.a + (j / n) * TAU, R = (80 + 190 * (0.5 - 0.5 * Math.cos(G.t * 1.15 + j * 1.7))) * st.area;
        const x = P.x + Math.cos(an) * R, y = P.y + Math.sin(an) * R;
        w.pos.push(x, y, G.t * 6);
        query(x, y, rr, QB2);
        for (let k = 0; k < QB2.length; k++) {
          const e = QB2[k];
          if (G.t - e.hDisc < 0.3) continue;
          e.hDisc = G.t;
          const dx = e.x - x, dy = e.y - y, d = Math.hypot(dx, dy) || 1;
          hit(e, dmg, 'disc', dx / d, dy / d, 150, null);
        }
        for (let k = 0; k < gemAct.length; k++) { const g = gemAct[k]; const dx = g.x - x, dy = g.y - y; if (dx * dx + dy * dy < 170 * 170) g.att = true; }
        if (Math.random() < 0.5 * G.pq) pt(x + rand(-rr, rr) * 0.6, y + rand(-rr, rr) * 0.6, 0, 0, 0.4, 2.4, Q.C.ice, 0, 2);
      }
      return;
    }
    w.t -= dt; if (w.t > 0) return;
    w.t += 2.2 * st.cd;
    const n = 1 + (L >= 2) + (L >= 5) + st.proj;
    const dmg = 20 * (L >= 4 ? 1.5 : 1) * st.might;
    const r = 16 * (L >= 3 ? 1.35 : 1) * st.area;
    for (let i = 0; i < n; i++) shoot('disc', P.x, P.y - 8, P.aim + (i - (n - 1) / 2) * 0.62, 640, dmg, { r, life: 3.2, pierce: 999, src: 'disc', kb: 90, range: 0.52, scale: r / 16 });
    sfx('disc');
  };

  /* ---------- 英雄技能 ---------- */
  function moveOrAim() { const IN = Q.input; return (Math.abs(IN.mx) + Math.abs(IN.my) > 0.15) ? Math.atan2(IN.my, IN.mx) : P.aim; }
  const SK = {};
  SK.guard = {
    use() {
      const a = Q.input.touch || G.autoAim ? moveOrAim() : P.aim;
      P.dashT = 0.26; P.dvx = Math.cos(a) * 960; P.dvy = Math.sin(a) * 960; P.dashKind = 'bash'; P.inv = Math.max(P.inv, 0.42);
      G.bashGen = (G.bashGen || 0) + 1;
      sfx('bash'); shake(0.15);
    },
    during() {
      const L = G.skillLv;
      query(P.x, P.y, P.r + 30, QB2);
      const sp = Math.hypot(P.dvx, P.dvy) || 1, dx = P.dvx / sp, dy = P.dvy / sp;
      for (let k = 0; k < QB2.length; k++) {
        const e = QB2[k];
        if (e.hBash === G.bashGen) continue;
        e.hBash = G.bashGen;
        const ox = e.x - P.x, oy = e.y - P.y, side = (ox * -dy + oy * dx) >= 0 ? 1 : -1;
        hit(e, 42 * st.might * (L >= 2 ? 1.4 : 1), 'k_guard', dx * 0.6 - dy * side * 0.8, dy * 0.6 + dx * side * 0.8, 620, { stun: 1.3 });
        burst(e.x, e.y, 5, Q.C.gold, 200, 0.3, 2, 1);
      }
    },
    end() {
      const L = G.skillLv, R = (L >= 3 ? 175 : 125) * st.area;
      aoe(P.x, P.y, R, 32 * st.might * (L >= 2 ? 1.4 : 1), 'k_guard', 380, { stun: 0.8 });
      ring(P.x, P.y, 10, R, 0.42, '#ffcf6b', 7); ring(P.x, P.y, 6, R * 0.7, 0.32, '#ffffff', 3);
      flashAt(P.x, P.y, R * 1.1, 0.25, '#ffcf6b');
      burst(P.x, P.y, 30, Q.C.gold, 360, 0.5, 2.6, 1);
      if (L >= 3) P.fortify = 2.5;
      shake(0.32); sfx('shock'); G.stop = Math.max(G.stop, 0.045);
    },
  };
  function nova(x, y, mult) {
    const L = G.skillLv, R = 245 * st.area;
    aoe(x, y, R, 72 * st.might * (L >= 2 ? 1.4 : 1) * mult, 'k_mage', 420, { slow: 0.5, slowT: 2 });
    ring(x, y, 10, R, 0.5, '#c4b0ff', 9); ring(x, y, 6, R * 0.82, 0.42, '#6be4ff', 4); ring(x, y, 4, R * 0.5, 0.3, '#ffffff', 2);
    flashAt(x, y, R * 1.25, 0.35, '#b49bff');
    for (let i = 0; i < 70 * G.pq; i++) { const a = Math.random() * TAU, s = rand(0.4, 1) * R * 2.2; pt(x, y, Math.cos(a) * s, Math.sin(a) * s, 0.6, rand(2, 3.4), i % 2 ? Q.C.violet : Q.C.cyan, i % 4 ? 0 : 1, 3.5); }
    G.zones.push({ k: 'star', x, y, r: 200 * st.area, life: 3.6, max: 3.6, tick: 0.4, tt: 0.2, dmg: 9 * st.might, src: 'k_mage', slow: 0.5, pull: L >= 3 ? 70 : 0 });
    shake(0.35); G.stop = Math.max(G.stop, 0.05);
  }
  SK.mage = {
    use() {
      nova(P.x, P.y, 1); sfx('nova');
      if (G.skillLv >= 3) after(0.6, () => { if (!P.dead) { nova(P.x, P.y, 0.8); sfx('nova'); } });
    },
  };
  function trap(x, y) {
    const L = G.skillLv;
    G.zones.push({ k: 'trap', x, y, r: 96 * st.area, life: 3, max: 3, tick: 0.25, tt: 0.25, dmg: 12 * st.might, src: 'k_ranger', root: 2.2, boom: (L >= 3 ? 1.4 : 1) * 122 * st.area, boomDmg: 62 * st.might, crit: L >= 3 });
    ring(x, y, 4, 96 * st.area, 0.3, '#c8ff6b', 3);
  }
  SK.ranger = {
    use() {
      trap(P.x, P.y);
      const a = (Q.input.touch || G.autoAim) ? moveOrAim() + Math.PI : P.aim + Math.PI;
      P.dashT = 0.2; P.dvx = Math.cos(a) * 860; P.dvy = Math.sin(a) * 860; P.dashKind = 'flip'; P.inv = Math.max(P.inv, 0.36);
      sfx('flip'); sfx('trap');
    },
    end() { if (G.skillLv >= 2) trap(P.x, P.y); },
  };
  function skillCd() { return G.hero.skillCd * (G.skillLv >= 2 ? 0.8 : 1) * st.skillCd; }
  function trySkill() {
    if (P.skillCd > 0 || P.dead || P.dashT > 0 || G.state !== 'play') return false;
    SK[G.hero.id].use();
    P.skillCd = skillCd(); G.skillUses++;
    return true;
  }
  function tryDash() {
    if (P.dashCd > 0 || P.dashT > 0 || P.dead || G.state !== 'play') return false;
    const a = moveOrAim();
    P.dashT = 0.16; P.dvx = Math.cos(a) * 880; P.dvy = Math.sin(a) * 880; P.dashKind = 'dash';
    P.inv = Math.max(P.inv, 0.3); P.dashCd = 1.5;
    burst(P.x, P.y, 10, G.hero.pc, 120, 0.35, 2.2, 0);
    sfx('dash');
    return true;
  }

  /* ---------- 玩家 ---------- */
  function updatePlayer(dt) {
    const IN = Q.input;
    if (G.bot) botInput(dt);
    P.inv -= dt; P.iframe -= dt; P.dashCd -= dt; P.skillCd -= dt; P.fortify -= dt; P.slowT -= dt; P.hurtT -= dt;
    P.swing = Math.max(0, P.swing - dt * 5); P.draw = Math.max(0, P.draw - dt * 4);
    if (!P.dead) {
      // 输入缓冲：冲刺/技能进行中按下的闪避与技能，会在 0.3 秒内自动补上
      if (IN.dashQ) { if (tryDash()) { IN.dashQ = false; P.dBuf = 0; } else if ((P.dBuf = (P.dBuf || 0) + dt) > 0.3 || P.dashCd > 0.3) { IN.dashQ = false; P.dBuf = 0; } }
      if (IN.skillQ) { if (trySkill()) { IN.skillQ = false; P.sBuf = 0; } else if ((P.sBuf = (P.sBuf || 0) + dt) > 0.3 || P.skillCd > 0.3) { IN.skillQ = false; P.sBuf = 0; } }
    } else { IN.dashQ = IN.skillQ = false; }
    let moved = 0;
    if (P.dashT > 0) {
      const h = Math.min(dt, P.dashT);
      P.dashT -= dt;
      P.x += P.dvx * h; P.y += P.dvy * h; moved = Math.hypot(P.dvx, P.dvy) * h;
      if (P.dashKind === 'bash') SK.guard.during();
      P.afterT -= dt;
      if (P.afterT <= 0) { P.afterT = 0.028; G.after.push({ x: P.x, y: P.y, t: 0, face: P.face, kind: P.dashKind }); }
      if (P.dashT <= 0) {
        P.vx = P.dvx * 0.2; P.vy = P.dvy * 0.2;
        if (P.dashKind === 'bash') SK.guard.end();
        if (P.dashKind === 'flip' && SK.ranger.end) SK.ranger.end();
      }
    } else if (!P.dead) {
      const sp = st.speed * (P.slowT > 0 ? 0.55 : 1);
      const k = Math.min(1, dt * 15);
      P.vx += (IN.mx * sp - P.vx) * k; P.vy += (IN.my * sp - P.vy) * k;
      P.x += P.vx * dt; P.y += P.vy * dt; moved = Math.hypot(P.vx, P.vy) * dt;
    } else { P.vx *= 0.9; P.vy *= 0.9; }
    P.moved = moved;
    P.move = clamp(Math.hypot(P.vx, P.vy) / st.speed, 0, 1);
    if (Math.abs(IN.mx) + Math.abs(IN.my) > 0.1) P.mang = Math.atan2(IN.my, IN.mx);
    // 结界
    const ar = G.arena;
    if (ar && ar.on) {
      const dx = P.x - ar.x, dy = P.y - ar.y, d = Math.hypot(dx, dy), lim = ar.r - P.r - 4;
      if (d > lim) { P.x = ar.x + (dx / d) * lim; P.y = ar.y + (dy / d) * lim; }
    }
    // 瞄准
    if (G.autoAim || !IN.hasMouse) {
      G.aimT -= dt;
      if (G.aimT <= 0) {
        G.aimT = 0.08; G.aimTgt = nearest(P.x, P.y, 560);
        const b = G.boss;
        if (b && b.alive && !b.boss.vanish && b.boss.state !== 'intro') {
          const bd = Math.hypot(b.x - P.x, b.y - P.y) - b.r;
          if (bd < (G.hero.id === 'guard' ? 120 : 430)) G.aimTgt = b;
        }
      }
      const t = G.aimTgt;
      if (t && t.alive) P.aim = Math.atan2(t.y - P.y, t.x - P.x);
      else if (P.vx * P.vx + P.vy * P.vy > 200) P.aim = Math.atan2(P.vy, P.vx);
    } else {
      const wx = G.cam.x + (IN.mouseX - G.W / 2) / G.scale, wy = G.cam.y + (IN.mouseY - G.H / 2) / G.scale;
      P.aim = Math.atan2(wy - P.y, wx - P.x);
    }
    if (P.dashT <= 0) P.face = Math.cos(P.aim) >= 0 ? 1 : -1;
    if (!P.dead && st.regen > 0 && P.hp < st.maxHp) P.hp = Math.min(st.maxHp, P.hp + st.regen * dt);
  }

  /* ---------- 自动驾驶（调试与平衡测试用） ---------- */
  function botInput(dt) {
    const IN = Q.input;
    let fx = 0, fy = 0;
    query(P.x, P.y, 300, QB4);
    let close = 0;
    const melee = G.hero.id === 'guard';
    const brave = P.hp / st.maxHp > 0.45;
    const pref = melee ? (brave ? 55 : 110) : 170;
    let ne = null, nd = 1e9;
    for (let k = 0; k < QB4.length; k++) {
      const e = QB4[k];
      const dx = P.x - e.x, dy = P.y - e.y, d = Math.max(8, Math.hypot(dx, dy) - e.r);
      if (d < nd) { nd = d; ne = e; }
      const w = (e.boss ? 4 : e.elite ? 2 : 1) / (d * d) * (melee && brave ? (d < 34 ? 1500 : 350) : 4000);
      fx += (dx / d) * w; fy += (dy / d) * w;
      if (d < 50) close++;
    }
    if (!ne) ne = nearest(P.x, P.y, 700);
    const bo = G.boss && G.boss.alive && G.boss.boss.state !== 'intro' ? G.boss : null;
    if (bo && brave) {
      const dx = bo.x - P.x, dy = bo.y - P.y, d = Math.hypot(dx, dy) || 1, bp = melee ? bo.r + 45 : 240;
      if (d > bp + 30) { fx += (dx / d) * 1.1; fy += (dy / d) * 1.1; }
    } else if (ne) {
      const dx = ne.x - P.x, dy = ne.y - P.y, d = Math.hypot(dx, dy) || 1;
      if (d > pref + 25) { fx += (dx / d) * 0.9; fy += (dy / d) * 0.9; }
    }
    for (let k = 0; k < ebAct.length; k++) {
      const b = ebAct[k];
      const dx = P.x - b.x, dy = P.y - b.y, d = Math.max(6, Math.hypot(dx, dy));
      if (d > 200) continue;
      const w = 9000 / (d * d);
      fx += (dx / d) * w; fy += (dy / d) * w;
    }
    for (const t of G.teles) {
      if (t.k === 'circle') {
        const dx = P.x - t.x, dy = P.y - t.y, d = Math.hypot(dx, dy) || 1;
        if (d < t.r + 30) { fx += (dx / d) * 6; fy += (dy / d) * 6; if (t.dur - t.t < 0.35 && d < t.r) IN.dashQ = true; }
      } else if (t.k === 'line' && t.dmgLine !== false) {
        const c = Math.cos(t.ang), s = Math.sin(t.ang), px = P.x - t.x, py = P.y - t.y, along = px * c + py * s, perp = -px * s + py * c;
        if (along > -40 && along < t.len + 40 && Math.abs(perp) < t.w / 2 + 40) { const sg = perp >= 0 ? 1 : -1; fx += -s * sg * 6; fy += c * sg * 6; }
      }
    }
    for (const b of G.beams) {
      const c = Math.cos(b.ang), s = Math.sin(b.ang), px = P.x - b.x, py = P.y - b.y, along = px * c + py * s, perp = -px * s + py * c;
      if (along > 0 && Math.abs(perp) < 90) { const sg = perp >= 0 ? 1 : -1; fx += -s * sg * 5; fy += c * sg * 5; }
    }
    for (const h of G.hazards) { const dx = P.x - h.x, dy = P.y - h.y, d = Math.hypot(dx, dy) || 1; if (d < h.r + 20) { fx += (dx / d) * 2; fy += (dy / d) * 2; } }
    // 星晶吸引
    let bg = null, bd = 340 * 340;
    for (let k = 0; k < gemAct.length; k += 2) { const g = gemAct[k]; const dx = g.x - P.x, dy = g.y - P.y, d = dx * dx + dy * dy; if (d < bd) { bd = d; bg = g; } }
    for (const it of G.items) { const dx = it.x - P.x, dy = it.y - P.y, d = dx * dx + dy * dy; if (d < 500 * 500 && (it.k === 'chest' || it.k === 'heal' && P.hp < st.maxHp * 0.7)) { const dd = Math.sqrt(d) || 1; fx += (dx / dd) * 1.2; fy += (dy / dd) * 1.2; } }
    if (bg) { const dx = bg.x - P.x, dy = bg.y - P.y, d = Math.sqrt(bd) || 1, gw = brave && nd > 70 ? 1.7 : 0.6; fx += (dx / d) * gw; fy += (dy / d) * gw; }
    // 场地中心（防止被逼到结界边缘）
    const ar = G.arena;
    if (ar && ar.on) { const dx = ar.x - P.x, dy = ar.y - P.y, d = Math.hypot(dx, dy) || 1; if (d > ar.r * 0.55) { fx += (dx / d) * 1.5 * (d / ar.r); fy += (dy / d) * 1.5 * (d / ar.r); } }
    G.botA = (G.botA || 0) + dt * 0.3;
    fx += Math.cos(G.botA) * 0.25; fy += Math.sin(G.botA) * 0.25;
    const m = Math.hypot(fx, fy);
    IN.mx = m > 0.05 ? fx / m : 0; IN.my = m > 0.05 ? fy / m : 0;
    if (close >= 3) IN.dashQ = true;
    if (QB4.length >= 6 || (G.boss && Math.random() < dt)) IN.skillQ = true;
  }

  /* ---------- 敌人行为 ---------- */
  function updateEnemies(dt) {
    const px = P.x, py = P.y;
    const lx = G.vw / 2 + 560, ly = G.vh / 2 + 560;
    for (let k = eAct.length - 1; k >= 0; k--) {
      const e = eAct[k];
      if (!e) continue;
      if (e.boss) { bossUpdate(e, dt); continue; }
      e.ph += dt;
      if (e.flash > 0) e.flash -= dt;
      if (e.spawnT > 0) e.spawnT -= dt;
      if (e.vuln > 0) e.vuln -= dt;
      if (e.burnT > 0) {
        e.burnT -= dt; e.burnTick -= dt;
        if (e.burnTick <= 0) { e.burnTick = 0.5; hit(e, e.burnD, 'flame', 0, 0, 0, { noCrit: true, col: '#ffb070' }); if (!e.alive) continue; if (Math.random() < 0.6) pt(e.x + rand(-6, 6), e.y - e.r * 0.5, 0, -40, 0.5, 2.6, Q.C.orange, 2, 1, -20); }
      }
      if (e.elite && e.sh <= 0 && e.shMax > 0) { e.shCd -= dt; if (e.shCd <= 0) { e.sh = e.shMax * 0.5; ring(e.x, e.y, e.r * 2, e.r, 0.3, '#9fe8ff', 3); } }
      let dx = px - e.x, dy = py - e.y;
      if (!e.elite && (dx > lx || dx < -lx || dy > ly || dy < -ly)) { relocate(e); continue; }
      const d = Math.sqrt(dx * dx + dy * dy) || 1; dx /= d; dy /= d;
      let sp = e.spd;
      if (e.slowT > 0) { e.slowT -= dt; sp *= 1 - e.slowA; if (e.slowT <= 0) e.slowA = 0; }
      let mvx = 0, mvy = 0;
      const frozen = e.frz > 0, stunned = e.stun > 0;
      if (frozen) e.frz -= dt;
      if (stunned) e.stun -= dt;
      if (e.root > 0) e.root -= dt;
      if (!frozen && !stunned) {
        switch (e.arch) {
          case 'swarm': case 'mini': case 'brute': case 'split':
            mvx = dx * sp; mvy = dy * sp; break;
          case 'runner': {
            const wv = Math.sin(e.ph * 4 + e.uid) * 0.45;
            mvx = (dx - dy * wv) * sp; mvy = (dy + dx * wv) * sp; break;
          }
          case 'caster': {
            const want = e.d.range;
            if (d > want + 30) { mvx = dx * sp; mvy = dy * sp; }
            else if (d < want - 70) { mvx = -dx * sp * 0.75; mvy = -dy * sp * 0.75; }
            else { const s = (e.uid & 1) ? 1 : -1; mvx = -dy * sp * 0.55 * s; mvy = dx * sp * 0.55 * s; }
            e.shotT -= dt;
            e.charging = e.shotT < 0.5;
            if (e.shotT <= 0) {
              e.shotT = e.d.shotCd * rand(0.85, 1.2);
              if (d < 620) { fireBullet(e.d.shot, e.x, e.y - e.r * 0.6, Math.atan2(py - e.y, px - e.x), 170 + G.stage * 12, e.dmg); sfx('cast'); }
            }
            break;
          }
          case 'charger': {
            if (e.st === 0) {
              mvx = dx * sp; mvy = dy * sp; e.stT -= dt;
              if (d < 330 && e.stT <= 0 && e.spawnT <= 0) { e.st = 1; e.stT = 0.72; e.tx = dx; e.ty = dy; }
            } else if (e.st === 1) {
              e.stT -= dt;
              if (e.stT <= 0) { e.st = 2; e.stT = 0.55; }
            } else if (e.st === 2) {
              mvx = e.tx * 430 * G.spdMul; mvy = e.ty * 430 * G.spdMul; e.stT -= dt;
              if (Math.random() < 0.5 * G.pq) pt(e.x, e.y + e.r * 0.8, rand(-30, 30), rand(-30, 0), 0.4, 3, Q.C.ash, 0, 3);
              if (e.stT <= 0) { e.st = 3; e.stT = 0.6; }
            } else { e.stT -= dt; if (e.stT <= 0) { e.st = 0; e.stT = rand(1.5, 3); } }
            break;
          }
          case 'bomber': {
            if (e.st === 0) { mvx = dx * sp; mvy = dy * sp; if (d < 58 && e.spawnT <= 0) { e.st = 1; e.stT = 0.65; } }
            else {
              e.stT -= dt;
              if (e.stT <= 0) {
                G.deferred.push(['blast', e.x, e.y, 80, e.dmg, true, e.d.pc]);
                burst(e.x, e.y, 12, e.d.pc, 200, 0.4, 3, 0);
                removeEnemy(e);
                continue;
              }
            }
            break;
          }
          case 'elite': {
            mvx = dx * sp; mvy = dy * sp;
            e.shotT -= dt;
            e.charging = e.shotT < 0.6;
            if (e.shotT <= 0) {
              e.shotT = 3.4;
              if (d < 640) { const a = Math.atan2(py - e.y, px - e.x); for (let i = -2; i <= 2; i++) fireBullet(e.d.shot, e.x, e.y - e.r * 0.5, a + i * 0.2, 160 + G.stage * 10, e.dmg * 0.8); sfx('cast'); }
            }
            break;
          }
        }
        if (e.root > 0) { mvx = 0; mvy = 0; }
      }
      e.x += (mvx + e.kx) * dt; e.y += (mvy + e.ky) * dt;
      const kd = Math.exp(-dt * 8); e.kx *= kd; e.ky *= kd;
      if (e.arch === 'charger' && e.st >= 1) e.face = e.tx >= 0 ? 1 : -1;
      else if (mvx > 2) e.face = 1; else if (mvx < -2) e.face = -1;
      if (!frozen && e.spawnT <= 0) {
        const rr = e.r + P.r - 3;
        const ddx = px - e.x, ddy = py - e.y;
        if (ddx * ddx + ddy * ddy < rr * rr) hurt(e.arch === 'charger' && e.st === 2 ? e.dmg * 1.25 : e.dmg, e.x, e.y);
      }
    }
  }
  function separate(dt) {
    const s0 = 150 * dt;
    for (let k = 0; k < eAct.length; k++) {
      const e = eAct[k];
      if (e.big) continue;
      const cx = Math.floor(e.x / CS), cy = Math.floor(e.y / CS);
      let pxs = 0, pys = 0, cnt = 0;
      for (let ox = -1; ox <= 1 && cnt < 8; ox++) {
        const kx = ((cx + ox) & GM) << GB;
        for (let oy = -1; oy <= 1 && cnt < 8; oy++) {
          let j = gHead[kx | ((cy + oy) & GM)];
          while (j >= 0) {
            const o = EN[j]; j = gNext[j];
            if (o === e || !o.alive) continue;
            const dx = e.x - o.x, dy = e.y - o.y, rr = (e.r + o.r) * 0.85, d2 = dx * dx + dy * dy;
            if (d2 < rr * rr && d2 > 0.0001) { const d = Math.sqrt(d2), f = (rr - d) / rr; pxs += (dx / d) * f * o.mass; pys += (dy / d) * f * o.mass; if (++cnt >= 8) break; }
          }
        }
      }
      if (cnt) { const s = s0 / Math.sqrt(e.mass); e.x += pxs * s; e.y += pys * s; }
    }
    // 首领推开周围小怪
    for (const b of G.big) {
      query(b.x, b.y, b.r, QB3);
      for (const e of QB3) {
        if (e === b) continue;
        const dx = e.x - b.x, dy = e.y - b.y, d = Math.hypot(dx, dy) || 1, lim = b.r + e.r * 0.6;
        if (d < lim) { e.x = b.x + (dx / d) * lim; e.y = b.y + (dy / d) * lim; }
      }
    }
  }

  /* ---------- 敌方弹幕、预警、光束、危险区 ---------- */
  function fireBullet(k, x, y, a, spd, dmg, o) {
    const b = ebFree.pop();
    if (!b) return null;
    b.alive = true; b.k = k; b.x = x; b.y = y; b.vx = Math.cos(a) * spd; b.vy = Math.sin(a) * spd; b.spd = spd;
    b.r = k === 'star' ? 10 : 7; b.dmg = dmg; b.life = (o && o.life) || 7; b.t = 0; b.turn = (o && o.turn) || 0;
    ebAct.push(b);
    return b;
  }
  function updateEnemyBullets(dt) {
    for (let k = ebAct.length - 1; k >= 0; k--) {
      const b = ebAct[k];
      b.t += dt; b.life -= dt;
      if (b.turn) {
        const want = Math.atan2(P.y - b.y, P.x - b.x), cur = Math.atan2(b.vy, b.vx);
        const na = cur + clamp(angDiff(cur, want), -b.turn * dt, b.turn * dt);
        b.vx = Math.cos(na) * b.spd; b.vy = Math.sin(na) * b.spd;
      }
      b.x += b.vx * dt; b.y += b.vy * dt;
      const dx = P.x - b.x, dy = P.y - b.y, rr = b.r + P.r * 0.62;
      let dead = b.life <= 0 || dx * dx + dy * dy > 1600 * 1600;
      if (!dead && dx * dx + dy * dy < rr * rr && !P.dead && P.inv <= 0) { hurt(b.dmg, b.x, b.y); dead = true; }
      if (dead) {
        if (b.life > 0) burst(b.x, b.y, 4, b.k === 'fire' ? Q.C.orange : b.k === 'ice' ? Q.C.ice : b.k === 'void' ? Q.C.magenta : Q.C.gold, 120, 0.25, 2, 1);
        b.alive = false;
        const last = ebAct.pop(); if (last !== b) ebAct[k] = last;
        ebFree.push(b);
      }
    }
  }
  function clearEnemyBullets() {
    for (const b of ebAct) { burst(b.x, b.y, 2, Q.C.white, 80, 0.3, 2, 0); b.alive = false; ebFree.push(b); }
    ebAct.length = 0;
  }
  function tele(o) { o.t = 0; G.teles.push(o); return o; }
  /** 预警圈按透视画成椭圆（纵向 ×k），判定也用同一个椭圆，所见即所得 */
  function inEll(px, py, cx, cy, r, k) { const dx = (px - cx) / r, dy = (py - cy) / (r * k); return dx * dx + dy * dy < 1; }
  function segDist(px, py, x, y, ang, len) {
    const c = Math.cos(ang), s = Math.sin(ang), rx = px - x, ry = py - y;
    const along = clamp(rx * c + ry * s, 0, len);
    const qx = x + c * along, qy = y + s * along;
    return Math.hypot(px - qx, py - qy);
  }
  function updateTeles(dt) {
    for (let i = G.teles.length - 1; i >= 0; i--) {
      const t = G.teles[i];
      t.t += dt;
      if (t.follow && t.follow.alive) { t.x = t.follow.x; t.y = t.follow.y; }
      if (t.t >= t.dur) {
        G.teles.splice(i, 1);
        if (t.k === 'circle') {
          if (t.dmg && inEll(P.x, P.y + 10, t.x, t.y, t.r + P.r * 0.3, 0.78)) hurt(t.dmg, t.x, t.y);
          const col = t.fx === 'ice' ? Q.C.ice : t.fx === 'void' ? Q.C.magenta : t.fx === 'star' ? Q.C.gold : Q.C.orange;
          ring(t.x, t.y, t.r * 0.3, t.r * 1.15, 0.35, Q.PAL[col], 5);
          flashAt(t.x, t.y, t.r * 1.3, 0.22, Q.PAL[col]);
          burst(t.x, t.y, 14, col, t.r * 3, 0.45, 2.8, 0);
          burst(t.x, t.y, 6, Q.C.white, t.r * 3, 0.3, 1.6, 1);
          if (t.haz) G.hazards.push({ k: t.haz, x: t.x, y: t.y, r: t.r * 0.62, life: 3.2, max: 3.2, dmg: t.dmg * 0.35, tt: 0.4 });
          shake(t.r > 90 ? 0.22 : 0.1);
          sfx(t.fx === 'ice' ? 'frost' : 'boom');
        } else if (t.k === 'line' && t.dmg) {
          if (segDist(P.x, P.y, t.x, t.y, t.ang, t.len) < t.w / 2 + P.r * 0.35) hurt(t.dmg, t.x, t.y);
        }
        if (t.cb) t.cb();
      }
    }
  }
  function updateBeams(dt) {
    for (let i = G.beams.length - 1; i >= 0; i--) {
      const b = G.beams[i];
      b.t += dt;
      if (b.e && b.e.alive) { b.x = b.e.x; b.y = b.e.y; } else if (b.t < b.tele) { G.beams.splice(i, 1); continue; }
      if (b.t > b.tele) {
        b.ang += b.va * dt;
        if (segDist(P.x, P.y, b.x, b.y, b.ang, b.len) < b.w / 2 + P.r * 0.45) hurt(b.dmg, b.x, b.y);
        if (Math.random() < 0.6 * G.pq) { const d = rand(40, b.len); pt(b.x + Math.cos(b.ang) * d, b.y + Math.sin(b.ang) * d, rand(-40, 40), rand(-40, 40), 0.35, 2.6, Q.C.magenta, 0, 2); }
      }
      if (b.t > b.tele + b.dur) G.beams.splice(i, 1);
    }
  }
  function updateHazards(dt) {
    for (let i = G.hazards.length - 1; i >= 0; i--) {
      const h = G.hazards[i];
      h.life -= dt;
      if (h.life <= 0) { G.hazards.splice(i, 1); continue; }
      if (inEll(P.x, P.y + 10, h.x, h.y, h.r, 0.75)) {
        if (h.k === 'frost') P.slowT = Math.max(P.slowT, 0.15);
        h.tt -= dt;
        if (h.tt <= 0) { h.tt = 0.5; if (h.dmg) hurt(h.dmg, h.x, h.y); }
      }
      if (Math.random() < dt * 6 * G.pq) {
        const a = Math.random() * TAU, d = Math.sqrt(Math.random()) * h.r;
        pt(h.x + Math.cos(a) * d, h.y + Math.sin(a) * d, 0, h.k === 'fire' ? -50 : -12, 0.6, h.k === 'fire' ? 3 : 2.2, h.k === 'fire' ? Q.C.orange : Q.C.ice, h.k === 'fire' ? 2 : 0, 1, h.k === 'fire' ? -30 : 0);
      }
    }
  }

  /* ---------- 玩家弹体、区域、陨星 ---------- */
  function updateProjectiles(dt) {
    for (let k = pAct.length - 1; k >= 0; k--) {
      const p = pAct[k];
      p.t += dt; p.life -= dt;
      let dead = p.life <= 0;
      if (!dead) {
        if (p.k === 'sword' && p.t < p.wait) {
          p.x = P.x + p.ox; p.y = P.y + p.oy;
          if (p.tgt && p.tgt.alive) p.ang = Math.atan2(p.tgt.y - p.y, p.tgt.x - p.x);
          p.vx = Math.cos(p.ang) * p.spd; p.vy = Math.sin(p.ang) * p.spd;
          continue;
        }
        if (p.homing) {
          p.retarget -= dt;
          if (!p.tgt || !p.tgt.alive || p.tgt.uid !== p.tgtUid) {
            if (p.retarget <= 0) { p.retarget = 0.12; const bt = bossIn(p.x, p.y, 300); p.tgt = bt && p.hit.indexOf(bt.uid) < 0 ? bt : nearest(p.x, p.y, 380, p.hit); p.tgtUid = p.tgt ? p.tgt.uid : 0; }
          }
          if (p.tgt && p.tgt.alive) {
            const want = Math.atan2(p.tgt.y - p.y, p.tgt.x - p.x), cur = Math.atan2(p.vy, p.vx);
            const na = cur + clamp(angDiff(cur, want), -p.homing * dt, p.homing * dt);
            p.vx = Math.cos(na) * p.spd; p.vy = Math.sin(na) * p.spd;
          }
        }
        if (p.k === 'disc') {
          if (!p.back) {
            const f = Math.max(0, 1 - p.t / p.range);
            const sp = p.spd * (0.15 + 0.85 * f);
            const a = Math.atan2(p.vy, p.vx); p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp;
            if (p.t >= p.range) p.back = true;
          } else {
            const dx = P.x - p.x, dy = P.y - p.y, d = Math.hypot(dx, dy) || 1;
            const sp = Math.min(900, 200 + (p.t - p.range) * 1400);
            p.vx = (dx / d) * sp; p.vy = (dy / d) * sp;
            if (d < 22) dead = true;
          }
        }
        if (p.k === 'wave') { p.vx *= 1 - dt * 1.5; p.vy *= 1 - dt * 1.5; p.r += dt * 18; }
        p.x += p.vx * dt; p.y += p.vy * dt;
        if (!dead) {
          query(p.x, p.y, p.r, QB);
          for (let j = 0; j < QB.length; j++) {
            const e = QB[j];
            if (p.k === 'disc') {
              if (G.t - e.hDisc < 0.25) continue;
              e.hDisc = G.t;
            } else if (p.hit.indexOf(e.uid) >= 0) continue;
            else p.hit.push(e.uid);
            const sp = Math.hypot(p.vx, p.vy) || 1;
            hit(e, p.dmg, p.src, p.vx / sp, p.vy / sp, p.kb, p.crit ? { crit: true } : null);
            if (p.k === 'bolt' || p.k === 'mini') burst(p.x, p.y, 4, p.k === 'bolt' ? Q.C.violet : Q.C.cyan, 120, 0.25, 2, 1);
            else if (p.k === 'arrow' || p.k === 'beam') pt(p.x, p.y, -p.vx * 0.1, -p.vy * 0.1, 0.2, 2, Q.C.jade, 1, 3);
            else if (p.k === 'sword') burst(p.x, p.y, 3, Q.C.jade, 120, 0.25, 2, 1);
            if (p.split > 0 && p.k === 'bolt') {
              for (let s = 0; s < p.split; s++) { const m = shoot('mini', p.x, p.y, Math.atan2(p.vy, p.vx) + (s ? 1 : -1) * 0.9, 420, p.dmg * 0.5, { r: 5, life: 1.0, homing: 7, src: p.src, kb: 20 }); if (m) m.hit.push(e.uid); }
            }
            if (p.pierce-- <= 0) { dead = true; break; }
          }
        }
      }
      if (dead) {
        if (p.boom && p.hit.length) {
          aoe(p.x, p.y, p.boom, p.dmg * 0.6, p.src, 90, { noCrit: false }, QB3);
          ring(p.x, p.y, 4, p.boom, 0.25, '#c4b0ff', 3);
          flashAt(p.x, p.y, p.boom * 1.2, 0.18, '#b49bff');
        }
        p.alive = false;
        const last = pAct.pop(); if (last !== p) pAct[k] = last;
        pFree.push(p);
      }
    }
  }
  function updateZones(dt) {
    for (let i = G.zones.length - 1; i >= 0; i--) {
      const z = G.zones[i];
      z.life -= dt; z.tt -= dt;
      if (z.k === 'trap' && z.max - z.life < 0.25) continue;
      if (z.tt <= 0) {
        z.tt += z.tick;
        query(z.x, z.y, z.r, QB2);
        for (let k = 0; k < QB2.length; k++) {
          const e = QB2[k];
          const dx = e.x - z.x, dy = e.y - z.y, d = Math.hypot(dx, dy) || 1;
          if (z.k === 'fire') hit(e, z.dmg, z.src, 0, 0, 0, z.burn ? { burn: z.burn, noCrit: true, col: '#ffb070' } : { noCrit: true, col: '#ffb070' });
          else if (z.k === 'star') {
            hit(e, z.dmg, z.src, 0, 0, 0, { slow: z.slow, slowT: 0.6, noCrit: true, col: '#c4b0ff' });
            if (z.pull && !e.boss) { e.kx -= (dx / d) * z.pull / e.mass; e.ky -= (dy / d) * z.pull / e.mass; }
          } else if (z.k === 'trap') hit(e, z.dmg, z.src, 0, 0, 0, { root: 0.4, noCrit: true, col: '#d8ff8a' });
        }
      }
      if (z.k === 'fire' && Math.random() < dt * 10 * G.pq) pt(z.x + rand(-z.r, z.r) * 0.6, z.y + rand(-z.r, z.r) * 0.4, rand(-10, 10), rand(-60, -30), 0.5, rand(2, 3.4), Math.random() < 0.5 ? Q.C.orange : Q.C.gold, 2, 1, -40);
      if (z.life <= 0) {
        G.zones.splice(i, 1);
        if (z.k === 'trap') {
          aoe(z.x, z.y, z.boom, z.boomDmg, z.src, 320, z.crit ? { crit: true } : null, QB3);
          ring(z.x, z.y, 10, z.boom, 0.4, '#c8ff6b', 6); flashAt(z.x, z.y, z.boom * 1.2, 0.25, '#c8ff6b');
          burst(z.x, z.y, 30, Q.C.lime, z.boom * 2.6, 0.5, 2.6, 1);
          shake(0.2); sfx('boom');
        }
      }
    }
  }
  function updateMeteors(dt) {
    for (let i = G.meteors.length - 1; i >= 0; i--) {
      const m = G.meteors[i];
      m.t += dt;
      if (!m.done && m.t >= m.dur) {
        m.done = true;
        aoe(m.x, m.y, m.R, m.dmg, 'meteor', 180, { burn: m.evo ? m.dmg * 0.12 : 0 }, QB3);
        ring(m.x, m.y, 6, m.R * 1.1, 0.4, '#ffd76b', 6); flashAt(m.x, m.y, m.R * 1.5, 0.25, '#ffb86b');
        burst(m.x, m.y, 22, Q.C.orange, m.R * 3.2, 0.55, 3, 0);
        burst(m.x, m.y, 10, Q.C.white, m.R * 3.6, 0.35, 1.8, 1);
        if (m.evo) G.zones.push({ k: 'fire', x: m.x, y: m.y, r: m.R * 0.6, life: 1.6, max: 1.6, tick: 0.33, tt: 0.1, dmg: m.dmg * 0.12, src: 'meteor', burn: 0 });
        shake(0.12); sfx('boom');
      }
      if (m.t >= m.dur + 0.1) G.meteors.splice(i, 1);
    }
  }
  function processDeferred() {
    const D = G.deferred;
    for (let i = 0; i < D.length && i < 400; i++) {
      const ev = D[i];
      if (ev[0] === 'split') {
        for (let n = 0; n < ev[4]; n++) {
          const a = (n / ev[4]) * TAU + Math.random();
          const c = spawnEnemy(ev[3], ev[1] + Math.cos(a) * 8, ev[2] + Math.sin(a) * 8, { instant: true });
          if (c) { c.kx = Math.cos(a) * 240; c.ky = Math.sin(a) * 240; c.spawnT = 0.2; }
        }
      } else if (ev[0] === 'blast') {
        const [, x, y, r, dmg, hurtsP, pc] = ev;
        aoe(x, y, r, hurtsP ? dmg * 0.6 : dmg, 'blast', 200, { noCrit: true }, QB3);
        if (hurtsP && inEll(P.x, P.y + 10, x, y, r + P.r * 0.3, 0.75)) hurt(dmg, x, y);
        ring(x, y, 6, r, 0.32, Q.PAL[pc], 5); flashAt(x, y, r * 1.4, 0.2, Q.PAL[pc]);
        burst(x, y, 16, pc, r * 3, 0.45, 3, 0);
        shake(0.12); sfx('boom');
      } else if (ev[0] === 'patch') {
        G.zones.push({ k: 'fire', x: ev[1], y: ev[2], r: 40 * st.area, life: 2.2, max: 2.2, tick: 0.33, tt: 0.1, dmg: 9 * st.might, src: 'flame', burn: 6 * st.might });
      }
    }
    D.length = 0;
  }

  /* ---------- 拾取 ---------- */
  function updateGems(dt) {
    const mr = st.magnet, mr2 = mr * mr;
    if (G.magnetAll > 0) G.magnetAll -= dt;
    for (let k = gemAct.length - 1; k >= 0; k--) {
      const g = gemAct[k];
      g.t += dt;
      const dx = P.x - g.x, dy = P.y - g.y, d2 = dx * dx + dy * dy;
      if (!g.att) {
        g.x += g.vx * dt; g.y += g.vy * dt; g.vx *= 1 - dt * 4; g.vy *= 1 - dt * 4;
        if (d2 < mr2 || G.magnetAll > 0) g.att = true;
        if (d2 > 2600 * 2600) { g.alive = false; const last = gemAct.pop(); if (last !== g) gemAct[k] = last; gemFree.push(g); }
        continue;
      }
      g.sp = Math.min(1250, g.sp + 1700 * dt);
      const d = Math.sqrt(d2) || 1;
      if (d < 18 + g.sp * dt) {
        addXp(g.v);
        sfx('gem');
        pt(P.x + rand(-6, 6), P.y + rand(-10, 4), rand(-30, 30), rand(-80, -30), 0.35, 2.2, [5, 10, 8, 1][g.tier], 0, 3);
        g.alive = false; const last = gemAct.pop(); if (last !== g) gemAct[k] = last; gemFree.push(g);
        continue;
      }
      g.x += (dx / d) * g.sp * dt; g.y += (dy / d) * g.sp * dt;
    }
  }
  function updateItems(dt) {
    for (let i = G.items.length - 1; i >= 0; i--) {
      const it = G.items[i];
      it.t += dt;
      if (it.t < 0.5) { it.x += it.vx * dt; it.y += it.vy * dt; it.vy += 160 * dt; it.vx *= 0.96; }
      const dx = P.x - it.x, dy = P.y - it.y, d = Math.hypot(dx, dy) || 1;
      const pull = it.k === 'dust' ? st.magnet * 1.2 : it.k === 'chest' ? 40 : st.magnet * 0.6;
      if (it.t > 0.4 && d < pull) it.att = true;
      if (it.att) { it.sp = Math.min(900, it.sp + 1300 * dt); it.x += (dx / d) * it.sp * dt; it.y += (dy / d) * it.sp * dt; }
      if (d < 24 && it.t > 0.3) { G.items.splice(i, 1); collect(it); }
    }
  }
  function collect(it) {
    if (it.k === 'heal') { heal(st.maxHp * 0.3); sfx('heal'); ring(P.x, P.y, 6, 60, 0.35, '#7dffb5', 3); burst(P.x, P.y, 16, Q.C.jade, 140, 0.6, 2.4, 0, 2, -40); }
    else if (it.k === 'magnet') { G.magnetAll = 1.5; for (const g of gemAct) g.att = true; sfx('magnet'); ring(P.x, P.y, 10, 260, 0.6, '#7fe8ff', 4); }
    else if (it.k === 'bomb') {
      sfx('bomb'); G.flash = 0.8; G.flashCol = '#d9c8ff'; shake(0.6);
      const list = eAct.slice(), hw = G.vw / 2 + 40, hh = G.vh / 2 + 40;
      const dmg = 160 * st.might * (1 + G.stage * 1.6);
      for (const e of list) { if (Math.abs(e.x - P.x) < hw && Math.abs(e.y - P.y) < hh) { const dx = e.x - P.x, dy = e.y - P.y, d = Math.hypot(dx, dy) || 1; hit(e, e.boss ? dmg * 2 : dmg, 'bomb', dx / d, dy / d, 300, { noCrit: true }); if (Math.random() < 0.3) G.bolts.push({ pts: [e.x + rand(-30, 30), e.y - 600, e.x, e.y], t: 0, dur: 0.3, w: 2.4 }); } }
    }
    else if (it.k === 'dust') { G.dustPicked += it.v || 1; sfx('dust'); burst(P.x, P.y - 10, 4, Q.C.cream, 90, 0.4, 2, 0); }
    else if (it.k === 'chest') {
      sfx('chest'); shake(0.15);
      ring(P.x, P.y, 6, 90, 0.5, '#ffd76b', 5); flashAt(P.x, P.y, 160, 0.4, '#ffd76b');
      burst(P.x, P.y, 30, Q.C.gold, 260, 0.8, 2.8, 0, 2, -60);
      for (let n = 0; n < (it.boss ? 2 : 1); n++) G.queue.push({ kind: 'chest', boss: !!it.boss });
    }
  }

  /* ---------- 视觉效果计时 ---------- */
  function updateFx(dt) {
    for (const arr of [G.rings, G.flashes, G.slashes, G.bolts, G.pillars]) {
      for (let i = arr.length - 1; i >= 0; i--) { const f = arr[i]; f.t += dt; if (f.t >= f.dur) arr.splice(i, 1); }
    }
    for (let i = G.after.length - 1; i >= 0; i--) { const a = G.after[i]; a.t += dt; if (a.t > 0.28) G.after.splice(i, 1); }
    for (let i = G.texts.length - 1; i >= 0; i--) { const tx = G.texts[i]; tx.t += dt; tx.y += tx.vy * dt; tx.vy *= 1 - dt * 2.5; if (tx.t >= tx.life) G.texts.splice(i, 1); }
    if (G.comboT > 0) { G.comboT -= dt; if (G.comboT <= 0) G.combo = 0; }
  }
  function updateParticles(dt) {
    const n = PT.n;
    let i = 0, m = n;
    while (i < m) {
      PT.l[i] -= dt;
      if (PT.l[i] <= 0) {
        m--;
        PT.x[i] = PT.x[m]; PT.y[i] = PT.y[m]; PT.vx[i] = PT.vx[m]; PT.vy[i] = PT.vy[m]; PT.l[i] = PT.l[m]; PT.m[i] = PT.m[m]; PT.s[i] = PT.s[m]; PT.c[i] = PT.c[m]; PT.k[i] = PT.k[m]; PT.d[i] = PT.d[m]; PT.g[i] = PT.g[m];
        continue;
      }
      const dr = Math.exp(-PT.d[i] * dt);
      PT.vx[i] *= dr; PT.vy[i] = PT.vy[i] * dr + PT.g[i] * dt;
      PT.x[i] += PT.vx[i] * dt; PT.y[i] += PT.vy[i] * dt;
      i++;
    }
    PT.n = m;
  }

  /* ======================================================================
     导演：刷怪、事件、首领登场
     ====================================================================== */
  function director(dt) {
    if (G.state !== 'play') return;
    const S = Q.STAGES[G.stage];
    const s = clamp(G.stageT / G.stageDur, 0, 1);
    G.hpMul = S.hpMul * (1 + 0.75 * s);
    G.dmgMul = S.dmgMul * (1 + 0.3 * s);
    G.spdMul = 1 + 0.08 * G.stage + 0.06 * s;
    if (G.nextStageT > 0) {
      G.nextStageT -= dt;
      if (G.nextStageT <= 0) nextStage();
      return;
    }
    // 存活上限与刷新速率（每秒魔物数）分开控制：玩家再强，经验也不会泛滥
    let cap = lerp(S.count[0], S.count[1], Math.pow(s, 0.85)) * G.countMul;
    let rate = lerp(S.rate[0], S.rate[1], s) * G.countMul * (1 + 0.25 * Math.sin(G.stageT * TAU / 34));
    if (G.surgeT > 0) { G.surgeT -= dt; cap *= 1.6; rate *= 2.6; }
    if (G.boss || G.bossPending) { cap *= 0.35; rate *= 0.4; }
    cap = Math.min(cap, G.eCap);
    if (eAct.length < cap * 0.3) rate *= 2;
    G.spawnAcc += dt * rate;
    let guard = 0;
    while (G.spawnAcc >= 1 && eAct.length < cap && guard++ < 20) { G.spawnAcc -= spawnRoster(S, s); }
    if (G.spawnAcc > 4) G.spawnAcc = 4;
    if (!G.boss && !G.bossPending) {
      for (const ev of G.events) if (!ev.done && s >= ev.at) { ev.done = true; runEvent(ev.k, S); }
      G.stageT += dt;
      if (!G.warned && G.stageT >= G.stageDur - 5) { G.warned = true; banner('坠星将至', Q.BOSSES[S.boss].title + ' 即将降临', '#ff6b4a'); sfx('warn'); }
      if (G.stageT >= G.stageDur) startBoss();
    }
  }
  function spawnRoster(S, s) {
    let sum = 0;
    for (const r of S.roster) if (s >= r[1]) sum += r[2] * (1 + Math.min(1.4, (s - r[1]) * 2.2));
    let x = Math.random() * sum, id = S.roster[0][0];
    for (const r of S.roster) { if (s < r[1]) continue; x -= r[2] * (1 + Math.min(1.4, (s - r[1]) * 2.2)); if (x <= 0) { id = r[0]; break; } }
    const d = Q.ENEMIES[id];
    const p = spawnPos(60);
    if (d.arch === 'swarm' || d.arch === 'runner') {
      const n = randi(2, 4);
      for (let i = 0; i < n; i++) spawnEnemy(id, p[0] + rand(-34, 34), p[1] + rand(-34, 34));
      return n;
    }
    spawnEnemy(id, p[0], p[1]);
    return 1;
  }
  function runEvent(k, S) {
    if (k === 'ring') {
      const n = Math.round((22 + G.stage * 8) * G.countMul), R = Math.hypot(G.vw, G.vh) / 2 + 30;
      for (let i = 0; i < n; i++) { const a = (i / n) * TAU; spawnEnemy(S.ring, P.x + Math.cos(a) * R, P.y + Math.sin(a) * R); }
      banner('合围', '魔物从四面八方涌来', '#ff6b4a'); sfx('warn');
    } else if (k === 'elite') {
      const p = spawnPos(40);
      const e = spawnEnemy(S.elite, p[0], p[1], { hpMul: 1 });
      for (let i = 0; i < 5; i++) spawnEnemy(S.roster[0][0], p[0] + rand(-50, 50), p[1] + rand(-50, 50));
      if (e) { G.pillars.push({ x: e.x, y: e.y, t: 0, dur: 1.2, col: '#ffd76b' }); ring(e.x, e.y, 10, 120, 0.6, '#ffd76b', 5); }
      if (e) banner('精英', Q.ENEMIES[S.elite].name + ' · 击碎护盾可使其眩晕', '#ffd76b');
      sfx('warn');
    } else if (k === 'swarm') {
      G.surgeT = 10; banner('怪潮', '坠星之力涌动，魔物倍增', '#ff6b4a'); sfx('warn');
    } else if (k === 'rush') {
      const a = Math.random() * TAU, R = Math.max(G.vw, G.vh) / 2 + 40, n = Math.round((7 + G.stage * 2) * G.countMul);
      const bx = P.x + Math.cos(a) * R, by = P.y + Math.sin(a) * R, px = -Math.sin(a), py = Math.cos(a);
      for (let i = 0; i < n; i++) {
        const off = (i - (n - 1) / 2) * 52;
        const e = spawnEnemy(S.rush, bx + px * off, by + py * off);
        if (e) { e.st = 1; e.stT = 1.0 + i * 0.04; const dx = P.x - e.x, dy = P.y - e.y, d = Math.hypot(dx, dy) || 1; e.tx = dx / d; e.ty = dy / d; e.spawnT = 0; }
      }
      banner('冲阵', Q.ENEMIES[S.rush].name + '群正在冲锋', '#ff9a3c'); sfx('warn');
    }
  }

  /* ---------- 首领 ---------- */
  function startBoss() {
    G.bossPending = true;
    const S = Q.STAGES[G.stage];
    let a = Math.random() * TAU;
    if (P.vx * P.vx + P.vy * P.vy > 100) a = Math.atan2(P.vy, P.vx) + rand(-0.6, 0.6);
    const x = P.x + Math.cos(a) * 280, y = P.y + Math.sin(a) * 200;
    G.starfall = { x, y, t: 0, dur: 1.7, boss: S.boss };
    tele({ k: 'circle', x, y, r: 170, dur: 1.7, dmg: 0, fx: Q.BOSSES[S.boss].pc === 5 ? 'ice' : Q.BOSSES[S.boss].pc === 8 ? 'void' : 'fire', cinematic: true, cb: () => spawnBoss(x, y) });
    sfx('starfall');
    Q.audio.music('boss');
  }
  function spawnBoss(x, y) {
    const S = Q.STAGES[G.stage], bd = Q.BOSSES[S.boss];
    G.starfall = null;
    // 冲击：清场
    query(x, y, 280, QB3);
    for (const e of QB3.slice()) { const dx = e.x - x, dy = e.y - y, d = Math.hypot(dx, dy) || 1; hit(e, 99999, 'impact', dx / d, dy / d, 500, { noCrit: true }); }
    const pdx = P.x - x, pdy = P.y - y, pd = Math.hypot(pdx, pdy) || 1;
    if (pd < 150) { P.x = x + (pdx / pd) * 150; P.y = y + (pdy / pd) * 150; }
    shake(1); G.flash = 0.9; G.flashCol = bd.color;
    ring(x, y, 20, 520, 0.9, bd.color, 10); ring(x, y, 10, 300, 0.6, '#ffffff', 4);
    burst(x, y, 90, bd.pc, 700, 1.2, 4, 0); burst(x, y, 40, Q.C.white, 600, 0.8, 2, 1);
    const e = eFree.pop();
    if (!e) return;
    Object.assign(e, mkEnemy(e.i));
    const hp = bd.hp * Q.MODES[G.mode].bossMul * (G.mobile ? 0.88 : 1) * (1 + 0.025 * Math.max(0, G.level - [14, 23, 31][G.stage]));
    Object.assign(e, { uid: ++G.uidc, alive: true, id: S.boss, d: bd, arch: 'boss', x, y, r: bd.r, hp, mhp: hp, spd: bd.spd, dmg: bd.dmg, mass: 80, big: true, face: 1, spawnT: 0,
      boss: { id: S.boss, def: bd, phase: 1, state: 'intro', stT: 1.9, inv: 1.9, t: 0, pat: '', last: '', anim: 'idle', animT: 0, charging: 0, chargesLeft: 0, cdx: 0, cdy: 0, trailT: 0, strafe: 1, vanish: false, alpha: 1, emit: 0, emitT: 0, spA: 0, arms: 2, bgT: 0, bgA: 0, stagger: 0, enraged: false, fightT: 0, moving: false } });
    e.ai = eAct.length; eAct.push(e); G.big.push(e);
    G.boss = e; G.bossPending = false; G.bossHit = 0;
    G.arena = { x, y, r: G.mobile ? 560 : 640, on: true, a: 0 };
    sfx('roar'); sfx('slam');
    if (Q.ui) Q.ui.bossCard(bd.title, bd.name, bd.line, bd.color);
  }
  function bossUpdate(e, dt) {
    const b = e.boss;
    b.t += dt; if (b.inv > 0) b.inv -= dt; if (b.stagger > 0) b.stagger -= dt;
    if (e.flash > 0) e.flash -= dt;
    b.animT += dt;
    e.hpLag = lerp(e.hpLag, e.hp / e.mhp, Math.min(1, dt * 2.5));
    if (b.state === 'dying') {
      b.stT -= dt;
      if (Math.random() < dt * 30) { const a = Math.random() * TAU, d = rand(0, e.r); burst(e.x + Math.cos(a) * d, e.y + Math.sin(a) * d, 6, b.def.pc, 260, 0.6, 3, 0); }
      if (Math.random() < dt * 10) { ring(e.x + rand(-30, 30), e.y + rand(-30, 30), 5, 70, 0.3, b.def.color, 3); sfx('boom'); }
      shake(dt * 2);
      if (b.stT <= 0) bossFinish(e);
      return;
    }
    if (b.state === 'intro') {
      b.stT -= dt;
      if (Math.random() < dt * 20) pt(e.x + rand(-e.r, e.r), e.y + e.r, rand(-20, 20), rand(-120, -40), 0.8, 3, b.def.pc, 0, 1, -30);
      if (b.stT <= 0) { b.state = 'idle'; b.stT = 0.6; }
      return;
    }
    b.fightT += dt;
    if (!b.enraged && b.fightT > 150) { b.enraged = true; banner(b.def.name + ' · 狂怒', '攻击愈发凶猛', '#ff3b3b'); sfx('roar'); }
    const f = e.hp / e.mhp;
    const th = b.id === 'yuanyao' ? [0.66, 0.33] : [0.5];
    if (b.phase - 1 < th.length && f < th[b.phase - 1]) phaseUp(e);
    const AI = BAI[b.id];
    b.moving = false;
    AI.move(e, b, dt);
    if (AI.tick) AI.tick(e, b, dt);
    if (b.state === 'idle') {
      b.stT -= dt;
      if (b.stT <= 0) {
        const pats = AI.pats.filter((p) => p !== b.last);
        const pat = pats[(Math.random() * pats.length) | 0];
        b.last = pat; b.pat = pat; b.state = 'busy';
        AI.start(e, b, pat);
      }
    } else if (b.state === 'busy') {
      b.stT -= dt;
      if (b.stT <= 0) { b.state = 'idle'; b.pat = ''; b.stT = AI.idle(b) * (b.enraged ? 0.6 : 1); }
    }
    // 接触伤害
    const dx = P.x - e.x, dy = P.y - e.y, rr = e.r * 0.78 + P.r;
    if (!b.vanish && dx * dx + dy * dy < rr * rr) hurt(b.charging > 0 ? e.dmg * 1.5 : e.dmg, e.x, e.y);
    // 结界
    const ar = G.arena;
    if (ar) { const ax = e.x - ar.x, ay = e.y - ar.y, d = Math.hypot(ax, ay), lim = ar.r - e.r * 0.6; if (d > lim) { e.x = ar.x + (ax / d) * lim; e.y = ar.y + (ay / d) * lim; } }
  }
  function phaseUp(e) {
    const b = e.boss;
    b.phase++; b.inv = 1.1; b.state = 'busy'; b.stT = 1.3; b.pat = 'phase'; b.charging = 0; b.vanish = false; b.alpha = 1;
    sfx('phase'); sfx('roar'); shake(0.6);
    ring(e.x, e.y, 20, 420, 0.7, b.def.color, 9); flashAt(e.x, e.y, 300, 0.4, b.def.color);
    burst(e.x, e.y, 60, b.def.pc, 500, 0.9, 3.4, 0);
    query(e.x, e.y, 320, QB3);
    for (const o of QB3) { if (o === e) continue; const dx = o.x - e.x, dy = o.y - e.y, d = Math.hypot(dx, dy) || 1; o.kx += (dx / d) * 600 / o.mass; o.ky += (dy / d) * 600 / o.mass; }
    const names = { heyan: ['熔心爆燃', '赫焱的心核开始失控'], linyuan: ['极寒降临', '古灵唤醒了千年的寒意'], yuanyao: [['星辰倒悬', '坠星之主展开了光束'], ['万星归墟', '最终形态 · 坚持住！']][b.phase - 2] };
    const nm = b.id === 'yuanyao' ? names.yuanyao : names[b.id];
    banner(nm[0], nm[1], b.def.color);
  }
  function bossBeginDeath(e) {
    const b = e.boss;
    if (b.state === 'dying') return;
    e.hp = 0; b.state = 'dying'; b.stT = 1.7; b.inv = 99; b.charging = 0; b.vanish = false; b.alpha = 1;
    G.teles = G.teles.filter((t) => t.cinematic); G.beams.length = 0; G.hazards.length = 0;
    clearEnemyBullets();
    G.slowT = 1.5; G.slowK = 0.22;
    shake(0.8); G.flash = 0.6; G.flashCol = '#ffffff';
    sfx('bossDie');
    G.bossGen++;
  }
  function bossFinish(e) {
    const b = e.boss, bd = b.def;
    G.flash = 1; G.flashCol = '#ffffff'; shake(1);
    ring(e.x, e.y, 20, 700, 1.1, bd.color, 12); ring(e.x, e.y, 10, 420, 0.8, '#ffffff', 5); ring(e.x, e.y, 6, 220, 0.5, bd.color, 3);
    burst(e.x, e.y, 160, bd.pc, 900, 1.6, 4.2, 0); burst(e.x, e.y, 80, Q.C.white, 800, 1.1, 2.4, 1); burst(e.x, e.y, 60, Q.C.gold, 500, 1.8, 3, 0, 1.5, -30);
    G.stop = 0.12;
    const stageIdx = G.stage;
    // 掉落
    for (let i = 0; i < 26; i++) { const a = Math.random() * TAU, d = rand(20, 140); dropGem(e.x + Math.cos(a) * d, e.y + Math.sin(a) * d, 6 + stageIdx * 6); }
    for (let i = 0; i < 10 + stageIdx * 5; i++) dropItem('dust', e.x + rand(-80, 80), e.y + rand(-60, 60));
    dropItem('heal', e.x - 40, e.y + 10); dropItem('heal', e.x + 40, e.y + 10);
    if (stageIdx < 2) dropItem('chest', e.x, e.y, { boss: true });
    // 清扫残余小怪
    for (const o of eAct.slice()) { if (o !== e && !o.elite) kill(o, 'impact'); }
    removeEnemy(e);
    G.boss = null; G.bossKills++;
    if (G.arena) G.arena.on = false;
    Q.save.stats.bossKills = (Q.save.stats.bossKills | 0) + 1;
    ach('first-boss');
    if (G.bossHit === 0) ach('flawless');
    if (stageIdx >= 2) {
      G.state = 'won'; G.wonT = 3.6;
      G.magnetAll = 4; for (const g of gemAct) g.att = true;
      banner('远征告捷', bd.name + ' 已被击败 · 群星归位', '#ffe9b0');
      sfx('victory'); Q.audio.music('calm');
      ach('victory');
      if (G.mode === 'quick') ach('quick-win');
    } else {
      G.nextStageT = 3.4;
      banner(bd.name + ' · 已被击败', '拾起宝匣，继续远征', '#ffe9b0');
      Q.audio.music('calm');
    }
  }
  function nextStage() {
    G.biomeFrom = Q.STAGES[G.stage].biome;
    G.stage++;
    G.stageT = 0; G.warned = false; G.biomeFade = 0; G.arena = null;
    buildEvents();
    const B = Q.BIOMES[Q.STAGES[G.stage].biome];
    banner('踏入 ' + B.name, B.sub, B.accent);
    Q.audio.biome(Q.STAGES[G.stage].biome); Q.audio.music('run');
    ach(G.stage === 1 ? 'frost' : 'abyss');
  }
  function bAfter(d, fn) { G.timers.push({ at: G.t + d, fn, bg: G.bossGen }); }

  const BAI = {};
  BAI.heyan = {
    pats: ['slam', 'charge', 'ring', 'summon', 'slam'],
    idle: (b) => (b.phase > 1 ? 0.7 : 1.1),
    move(e, b, dt) {
      if (b.charging > 0) {
        b.charging -= dt;
        e.x += b.cdx * 880 * dt; e.y += b.cdy * 880 * dt;
        b.trailT -= dt;
        if (b.trailT <= 0) { b.trailT = 0.055; G.hazards.push({ k: 'fire', x: e.x + rand(-12, 12), y: e.y + e.r * 0.5 + rand(-8, 8), r: 34, life: 2.6, max: 2.6, dmg: e.dmg * 0.35, tt: 0.3 }); }
        if (Math.random() < 0.8) pt(e.x, e.y + e.r * 0.6, rand(-60, 60), rand(-80, -20), 0.5, 4, Q.C.orange, 2, 2, -20);
        const ar = G.arena;
        let stop = b.charging <= 0;
        if (ar && Math.hypot(e.x - ar.x, e.y - ar.y) > ar.r - e.r * 0.7) { stop = true; b.stagger = 1.6; shake(0.5); sfx('slam'); ring(e.x, e.y, 10, 160, 0.4, '#ff9a3c', 6); burst(e.x, e.y, 30, Q.C.ash, 300, 0.6, 3.4, 0); dnum(e.x, e.y - e.r * 2, 0, true, '#ffd76b', '破绽'); }
        if (stop) {
          b.charging = 0; b.anim = 'idle';
          if (b.chargesLeft > 0) { b.chargesLeft--; bAfter(0.35, () => { if (e.alive && b.state !== 'dying') heyanCharge(e, b); }); }
        }
        return;
      }
      if (b.pat === 'slam' && b.animT < 1.5) return;
      const dx = P.x - e.x, dy = P.y - e.y, d = Math.hypot(dx, dy) || 1;
      if (d > 110 && b.pat !== 'charge') { const sp = e.spd * (b.phase > 1 ? 1.3 : 1); e.x += (dx / d) * sp * dt; e.y += (dy / d) * sp * dt; b.moving = true; }
      b.face = dx >= 0 ? 1 : -1;
    },
    start(e, b, pat) {
      if (pat === 'slam') {
        b.stT = 1.75; b.anim = 'raise'; b.animT = 0;
        const pts = [[P.x, P.y + 12, 100]], n = b.phase > 1 ? 4 : 2;
        for (let i = 0; i < n; i++) { const a = Math.random() * TAU, d = rand(120, 240); pts.push([P.x + Math.cos(a) * d, P.y + 12 + Math.sin(a) * d, 82]); }
        for (const [x, y, r] of pts) tele({ k: 'circle', x, y, r, dur: 1.05, dmg: e.dmg * 1.15, fx: 'fire', haz: b.phase > 1 ? 'fire' : null });
        bAfter(0.95, () => { b.anim = 'slam'; b.animT = 0; });
        bAfter(1.05, () => { shake(0.4); sfx('slam'); });
        bAfter(1.6, () => { b.anim = 'idle'; });
        sfx('tele');
      } else if (pat === 'charge') {
        b.chargesLeft = b.phase > 1 ? 1 : 0;
        b.stT = b.phase > 1 ? 3.9 : 2.1;
        heyanCharge(e, b);
      } else if (pat === 'ring') {
        const rings = b.phase > 1 ? 3 : 2;
        b.stT = 0.6 + rings * 0.45;
        for (let k = 0; k < rings; k++) bAfter(k * 0.45, () => {
          if (!e.alive || b.state === 'dying') return;
          const n = 22, off = Math.random() * TAU, gap = randi(0, n - 1);
          for (let i = 0; i < n; i++) { const di = Math.min(Math.abs(i - gap), n - Math.abs(i - gap)); if (di <= 1) continue; fireBullet('fire', e.x, e.y - 20, off + (i / n) * TAU, 170, e.dmg * 0.8); }
          flashAt(e.x, e.y - 20, 90, 0.2, '#ff9a3c'); sfx('cast');
        });
      } else if (pat === 'summon') {
        b.stT = 1.0;
        const n = b.phase > 1 ? 12 : 8;
        for (let i = 0; i < n; i++) { const a = (i / n) * TAU; const m = spawnEnemy('imp', e.x + Math.cos(a) * 120, e.y + Math.sin(a) * 90); if (m) burst(m.x, m.y, 6, Q.C.orange, 120, 0.4, 2.4, 0); }
        ring(e.x, e.y, 20, 160, 0.4, '#ff7a3a', 4); sfx('roar');
      }
    },
  };
  function heyanCharge(e, b) {
    const a = Math.atan2(P.y - e.y, P.x - e.x);
    b.cdx = Math.cos(a); b.cdy = Math.sin(a); b.anim = 'charge'; b.face = b.cdx >= 0 ? 1 : -1;
    tele({ k: 'line', x: e.x, y: e.y, ang: a, len: 900, w: e.r * 2, dur: 0.85, dmg: 0, follow: e, col: '#ff6a2a' });
    sfx('tele');
    bAfter(0.85, () => { if (!e.alive || b.state === 'dying') return; b.charging = 0.9; b.trailT = 0; sfx('bash'); shake(0.2); });
  }
  BAI.linyuan = {
    pats: ['spikes', 'spiral', 'blink', 'wolves', 'field', 'spikes'],
    idle: (b) => (b.phase > 1 ? 0.6 : 0.95),
    move(e, b, dt) {
      if (b.vanish) { b.alpha = Math.max(0, b.alpha - dt * 4); return; }
      b.alpha = Math.min(1, b.alpha + dt * 4);
      const dx = P.x - e.x, dy = P.y - e.y, d = Math.hypot(dx, dy) || 1, want = 280;
      let mx = 0, my = 0;
      if (d > want + 40) { mx = dx / d; my = dy / d; } else if (d < want - 60) { mx = -dx / d; my = -dy / d; }
      mx += (-dy / d) * 0.6 * b.strafe; my += (dx / d) * 0.6 * b.strafe;
      if (Math.random() < dt * 0.35) b.strafe *= -1;
      const sp = e.spd * (b.phase > 1 ? 1.2 : 1) * (b.pat === 'spiral' ? 0.3 : 1);
      e.x += mx * sp * dt; e.y += my * sp * dt; b.moving = true;
      b.face = dx >= 0 ? 1 : -1;
    },
    tick(e, b, dt) {
      if (b.emit > 0) {
        b.emit -= dt; b.emitT -= dt;
        while (b.emitT <= 0 && b.emit > 0) {
          b.emitT += 0.115; b.spA += 0.34;
          for (let k = 0; k < b.arms; k++) fireBullet('ice', e.x, e.y, b.spA + (k / b.arms) * TAU, 150, e.dmg * 0.6);
        }
      }
    },
    start(e, b, pat) {
      if (pat === 'spikes') {
        const n = b.phase > 1 ? 5 : 3, a0 = Math.atan2(P.y - e.y, P.x - e.x);
        for (let l = 0; l < n; l++) {
          const a = a0 + (l - (n - 1) / 2) * 0.34;
          for (let i = 0; i < 8; i++) { const d = 80 + i * 70; tele({ k: 'circle', x: e.x + Math.cos(a) * d, y: e.y + Math.sin(a) * d, r: 40, dur: 0.62 + i * 0.07, dmg: e.dmg, fx: 'ice' }); }
        }
        b.stT = 1.5; sfx('tele');
      } else if (pat === 'spiral') {
        b.stT = 2.7; b.emit = 2.4; b.emitT = 0; b.spA = Math.random() * TAU; b.arms = b.phase > 1 ? 3 : 2;
        sfx('frost');
      } else if (pat === 'blink') {
        b.stT = b.phase > 1 ? 3.6 : 2.1;
        linyuanBlink(e, b, b.phase > 1 ? 1 : 0);
      } else if (pat === 'wolves') {
        b.stT = 1.1;
        const n = b.phase > 1 ? 12 : 9, R = 340;
        for (let i = 0; i < n; i++) { const a = (i / n) * TAU; const w = spawnEnemy('wolf', P.x + Math.cos(a) * R, P.y + Math.sin(a) * R); if (w) burst(w.x, w.y, 6, Q.C.ice, 120, 0.4, 2.4, 0); }
        sfx('roar'); banner('', '霜狼群自林中扑出', '#9fe8ff');
      } else if (pat === 'field') {
        b.stT = 1.0;
        const n = b.phase > 1 ? 4 : 3;
        for (let i = 0; i < n; i++) {
          const a = Math.random() * TAU, d = i === 0 ? 0 : rand(120, 260);
          const x = P.x + P.vx * 0.5 + Math.cos(a) * d, y = P.y + 12 + P.vy * 0.5 + Math.sin(a) * d;
          tele({ k: 'circle', x, y, r: 96, dur: 1.0, dmg: e.dmg * 0.5, fx: 'ice', haz: 'frost' });
        }
        sfx('tele');
      }
    },
  };
  function linyuanBlink(e, b, more) {
    b.vanish = true;
    const tx = P.x + P.vx * 0.3, ty = P.y + 12 + P.vy * 0.3;
    tele({ k: 'circle', x: tx, y: ty, r: 125, dur: 1.15, dmg: e.dmg * 1.2, fx: 'ice' });
    burst(e.x, e.y, 30, Q.C.ice, 260, 0.6, 3, 0);
    sfx('tele');
    bAfter(1.15, () => {
      if (!e.alive || b.state === 'dying') return;
      e.x = tx; e.y = ty; b.vanish = false; b.alpha = 0.2;
      for (let i = 0; i < 12; i++) fireBullet('ice', e.x, e.y, (i / 12) * TAU + Math.random() * 0.2, 160, e.dmg * 0.6);
      ring(e.x, e.y, 10, 180, 0.4, '#bff4ff', 6); shake(0.3); sfx('frost');
      if (more > 0) bAfter(0.5, () => { if (e.alive && b.state !== 'dying') linyuanBlink(e, b, more - 1); });
    });
  }
  BAI.yuanyao = {
    pats: ['rings', 'rain', 'beams', 'hunters', 'summon', 'rain'],
    idle: (b) => [1.05, 0.85, 0.65][b.phase - 1],
    move(e, b, dt) {
      const dx = P.x - e.x, dy = P.y - e.y, d = Math.hypot(dx, dy) || 1;
      const sp = e.spd * (1 + 0.2 * (b.phase - 1)) * (b.pat === 'beams' ? 0.25 : 1);
      if (d > 240) { e.x += (dx / d) * sp * dt; e.y += (dy / d) * sp * dt; b.moving = true; }
      else if (d < 180) { e.x -= (dx / d) * sp * dt; e.y -= (dy / d) * sp * dt; }
    },
    tick(e, b, dt) {
      if (b.phase >= 3) {
        b.bgT -= dt;
        if (b.bgT <= 0) { b.bgT = 0.17; b.bgA += 0.42; fireBullet('void', e.x, e.y, b.bgA, 125, e.dmg * 0.6); fireBullet('void', e.x, e.y, b.bgA + Math.PI, 125, e.dmg * 0.6); }
      }
    },
    start(e, b, pat) {
      if (pat === 'rings') {
        const count = b.phase >= 3 ? 4 : 3, n = 24;
        b.stT = 1.2 + count * 0.38;
        const base = Math.random() * TAU;
        for (let k = 0; k < count; k++) bAfter(k * 0.38, () => {
          if (!e.alive || b.state === 'dying') return;
          const off = k % 2 ? Math.PI / n : 0;
          for (let i = 0; i < n; i++) fireBullet('void', e.x, e.y, base + off + (i / n) * TAU, 145, e.dmg * 0.7);
          flashAt(e.x, e.y, 110, 0.2, '#d38bff'); sfx('cast');
        });
      } else if (pat === 'rain') {
        const n = b.phase > 1 ? 14 : 10;
        b.stT = 1.0 + n * 0.13;
        for (let i = 0; i < n; i++) bAfter(i * 0.13, () => {
          if (!e.alive || b.state === 'dying') return;
          const a = Math.random() * TAU, d = i === 0 ? 0 : rand(60, 280);
          const x = P.x + P.vx * 0.4 + Math.cos(a) * d, y = P.y + 12 + P.vy * 0.4 + Math.sin(a) * d;
          G.meteors.push({ x, y, t: 0, dur: 0.95, R: 0, dmg: 0, evo: false, done: true, enemy: true });
          tele({ k: 'circle', x, y, r: 72, dur: 0.95, dmg: e.dmg, fx: 'star' });
        });
        sfx('starfall');
      } else if (pat === 'beams') {
        const n = b.phase + 1, a0 = Math.atan2(P.y - e.y, P.x - e.x), va = (Math.random() < 0.5 ? -1 : 1) * (0.42 + 0.12 * b.phase);
        for (let k = 0; k < n; k++) G.beams.push({ e, x: e.x, y: e.y, ang: a0 + (k / n) * TAU + 0.35, va, len: 1100, w: 30, t: 0, tele: 1.1, dur: 2.8, dmg: e.dmg * 0.9 });
        b.stT = 4.1; sfx('tele');
        bAfter(1.1, () => sfx('thunder'));
      } else if (pat === 'hunters') {
        const n = b.phase >= 3 ? 7 : 5, a0 = Math.atan2(P.y - e.y, P.x - e.x);
        for (let i = 0; i < n; i++) fireBullet('star', e.x, e.y, a0 + (i - (n - 1) / 2) * 0.5 + Math.PI, 140, e.dmg * 0.9, { turn: 1.5, life: 5.5 });
        b.stT = 1.1; sfx('cast');
      } else if (pat === 'summon') {
        b.stT = 1.0;
        for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU; const m = spawnEnemy('shade', e.x + Math.cos(a) * 130, e.y + Math.sin(a) * 110); if (m) burst(m.x, m.y, 6, Q.C.magenta, 120, 0.4, 2.4, 0); }
        ring(e.x, e.y, 20, 180, 0.4, '#d38bff', 4); sfx('roar');
      }
    },
  };

  /* ======================================================================
     升级选择
     ====================================================================== */
  function rollChoices(n, chest) {
    const pool = [];
    const H = G.hero;
    const spellsOwned = Q.SPELLS.filter((id) => G.lv[id] > 0).length;
    const passOwned = Q.PASSIVES.filter((id) => G.lv[id] > 0).length;
    for (const eid in Q.EVOS) {
      const E = Q.EVOS[eid];
      if (G.evo[E.base]) continue;
      if ((G.lv[E.base] | 0) >= Q.UPG[E.base].max && (G.lv[E.need] | 0) > 0) {
        if (Q.UPG[E.base].hero && Q.UPG[E.base].hero !== H.id) continue;
        pool.push({ type: 'evo', id: eid, w: 1000 });
      }
    }
    if (chest && pool.length) return [pool[0]].concat(Q.weightedPick(buildBase(pool.slice(1)), n - 1));
    const base = buildBase(pool);
    function buildBase(pre) {
      const out = pre.slice();
      if ((G.lv[H.weapon] | 0) < 5) out.push({ type: 'up', id: H.weapon, w: 15 });
      if ((G.lv[H.skill] | 0) < 3) out.push({ type: 'up', id: H.skill, w: 5 });
      for (const id of Q.SPELLS) {
        const L = G.lv[id] | 0;
        if (L >= 5 || (L === 0 && spellsOwned >= 5)) continue;
        out.push({ type: 'up', id, w: L ? 10 : 7 });
      }
      for (const id of Q.PASSIVES) {
        const L = G.lv[id] | 0;
        if (L >= Q.UPG[id].max || (L === 0 && passOwned >= 6)) continue;
        let w = L ? 7 : 5;
        // 进化提示：已拥有其进化法术时提高权重
        for (const eid in Q.EVOS) { const E = Q.EVOS[eid]; if (E.need === id && (G.lv[E.base] | 0) >= 3 && !G.evo[E.base]) w += 4; }
        out.push({ type: 'up', id, w });
      }
      return out;
    }
    let picks;
    if (G.firstPick && !chest) {
      G.firstPick = false;
      const spells = Q.weightedPick(Q.SPELLS.map((id) => ({ type: 'up', id, w: 1 })), n);
      picks = spells;
    } else picks = Q.weightedPick(base, n);
    if (picks.length < n) {
      if (!picks.some((p) => p.type === 'heal')) picks.push({ type: 'heal', id: 'heal', w: 1 });
      if (picks.length < n) picks.push({ type: 'dust', id: 'dust', w: 1 });
    }
    return picks;
  }
  function describe(c) {
    if (c.type === 'evo') {
      const E = Q.EVOS[c.id], B = Q.UPG[E.base], N = Q.UPG[E.need];
      return { type: 'evo', id: c.id, name: E.name, glyph: E.glyph, color: B.color, tag: '进化', lvl: '★', desc: E.desc, hint: `${B.name} + ${N.name}` };
    }
    if (c.type === 'heal') return { type: 'heal', id: 'heal', name: '灵果', glyph: '果', color: '#ff8aa8', tag: '补给', lvl: '', desc: '立即恢复 40% 生命', hint: '' };
    if (c.type === 'dust') return { type: 'dust', id: 'dust', name: '星尘袋', glyph: '尘', color: '#ffe9b0', tag: '补给', lvl: '', desc: '本局星尘 +15', hint: '' };
    const U = Q.UPG[c.id], L = G.lv[c.id] | 0;
    const tag = { weapon: '主武器', skill: '技能', spell: L ? '法术' : '新法术', passive: L ? '天赋' : '新天赋' }[U.kind];
    let desc, hint = '';
    if (U.kind === 'passive') desc = U.per;
    else desc = U.lv[Math.min(L, U.lv.length - 1)];
    if (U.evo && !G.evo[c.id]) { const E = Q.EVOS[U.evo]; hint = `满级 + ${Q.UPG[E.need].name} → 进化「${E.name}」`; }
    if (U.kind === 'passive') {
      const evs = Object.values(Q.EVOS).filter((E) => E.need === c.id && (!Q.UPG[E.base].hero || Q.UPG[E.base].hero === G.hero.id));
      if (evs.length) hint = '可助进化：' + evs.map((E) => Q.UPG[E.base].name).join('、');
    }
    return { type: 'up', id: c.id, name: U.name, glyph: U.glyph, color: U.color, tag, lvl: L ? `Lv ${L} → ${L + 1}` : '新', max: U.max, cur: L, desc, hint, isNew: !L };
  }
  function openChoices(kind) {
    G.state = 'level';
    G.choiceKind = kind;
    G.choices = rollChoices(G.choiceN, kind === 'chest');
    if (Q.ui) Q.ui.showLevel(G.choices.map(describe), kind === 'chest' ? '星辰宝匣' : '升级', kind === 'chest' ? '宝匣中藏着坠星的馈赠' : `等级 ${G.level - countQueued('level')}`, G.rerolls);
    Q.audio.duck(true);
    if (G.bot || G.dbg.autoPick) setTimeout(() => { if (G.state === 'level') choose(botPick()); }, 1);
  }
  function countQueued(kind) { return G.queue.filter((q) => q.kind === kind).length; }
  function botPick() {
    let bi = 0, bs = -1;
    G.choices.forEach((c, i) => {
      let s = Math.random();
      if (c.type === 'evo') s += 100;
      else if (c.type === 'up') {
        const U = Q.UPG[c.id], L = G.lv[c.id] | 0, nsp = Q.SPELLS.filter((id) => G.lv[id] > 0).length;
        if (U.kind === 'weapon') s += 3.2;
        if (U.kind === 'spell') s += L ? 2 + L * 0.5 : (nsp >= 3 ? 0.2 : 2.2);
        if (U.kind === 'skill') s += 0.8;
        if (['might', 'haste', 'area', 'vital', 'crit'].includes(c.id)) s += 1.5;
      }
      if (s > bs) { bs = s; bi = i; }
    });
    return bi;
  }
  function choose(i) {
    if (G.state !== 'level' || !G.choices || !G.choices[i]) return false;
    const c = G.choices[i];
    applyUpgrade(c);
    G.choices = null;
    if (Q.ui) Q.ui.hideLevel();
    G.state = 'play';
    Q.audio.duck(false);
    P.inv = Math.max(P.inv, 0.6);
    return true;
  }
  function reroll() {
    if (G.state !== 'level' || G.rerolls <= 0) return false;
    G.rerolls--;
    G.choices = rollChoices(G.choiceN, G.choiceKind === 'chest');
    if (Q.ui) Q.ui.showLevel(G.choices.map(describe), G.choiceKind === 'chest' ? '星辰宝匣' : '升级', '已重铸', G.rerolls, true);
    sfx('ui');
    return true;
  }
  function applyUpgrade(c) {
    if (c.type === 'evo') {
      const E = Q.EVOS[c.id];
      const w = G.weapons.find((x) => x.id === E.base);
      if (w) { w.evo = true; w.t = 0.2; w.ready = 0; }
      G.evo[E.base] = true; G.evoCount++;
      if (E.base === 'frost') G.frostEvo = true;
      if (E.base === 'flame') G.evo.flame = true;
      ach('evolve');
      sfx('evolve');
      ring(P.x, P.y, 10, 260, 0.7, Q.UPG[E.base].color, 8); flashAt(P.x, P.y, 260, 0.5, Q.UPG[E.base].color);
      burst(P.x, P.y, 60, Q.C.gold, 400, 1, 3, 0, 2, -40);
      banner('进化 · ' + E.name, E.desc, Q.UPG[E.base].color);
      return;
    }
    if (c.type === 'heal') { heal(st.maxHp * 0.4); sfx('heal'); return; }
    if (c.type === 'dust') { G.dustPicked += 15; sfx('dust'); return; }
    const U = Q.UPG[c.id];
    G.lv[c.id] = (G.lv[c.id] | 0) + 1;
    if (U.kind === 'spell' || U.kind === 'weapon') {
      let w = G.weapons.find((x) => x.id === c.id);
      if (!w) { w = mkWeapon(c.id, 1); G.weapons.push(w); }
      w.lvl = G.lv[c.id];
    } else if (U.kind === 'skill') G.skillLv = G.lv[c.id];
    else recalc();
    sfx('pick');
    ring(P.x, P.y, 8, 90, 0.4, U.color, 4);
  }

  /* ======================================================================
     主更新
     ====================================================================== */
  function step(dt) {
    G.t += dt;
    processTimers();
    updatePlayer(dt);
    updateEnemies(dt);
    separate(dt);
    gridBuild();
    if (!P.dead) for (let i = 0; i < G.weapons.length; i++) { const w = G.weapons[i]; W[w.id](w, dt); }
    updateProjectiles(dt);
    updateZones(dt);
    updateMeteors(dt);
    updateEnemyBullets(dt);
    updateTeles(dt);
    updateBeams(dt);
    updateHazards(dt);
    processDeferred();
    updateGems(dt);
    updateItems(dt);
    updateFx(dt);
    updateParticles(dt);
    director(dt);
    if (G.starfall) G.starfall.t += dt;
    if (G.biomeFade < 1) G.biomeFade = Math.min(1, G.biomeFade + dt / 2.6);
    if (G.arena) G.arena.a = G.arena.on ? Math.min(1, G.arena.a + dt * 2) : Math.max(0, G.arena.a - dt * 1.5);
    if (G.arena && !G.arena.on && G.arena.a <= 0) G.arena = null;
  }
  function update(rdt) {
    if (G.state === 'off' || G.state === 'end') return;
    G.shake = Math.max(0, G.shake - rdt * 1.8);
    G.hurtFlash = Math.max(0, G.hurtFlash - rdt * 2.4);
    G.flash = Math.max(0, G.flash - rdt * 1.6);
    if (G.state === 'level' || G.state === 'pause') return;
    if (G.slowT > 0) { G.slowT -= rdt; G.ts = lerp(G.ts, G.slowK, Math.min(1, rdt * 12)); }
    else G.ts = lerp(G.ts, 1, Math.min(1, rdt * 3));
    let sdt = rdt * G.ts * G.dbg.speed;
    if (G.stop > 0) { G.stop -= rdt; sdt = 0; }
    const steps = Math.min(16, Math.ceil(sdt / (1 / 55)));
    const h = steps ? sdt / steps : 0;
    for (let i = 0; i < steps; i++) {
      step(h);
      if (G.state !== 'play' && G.state !== 'dying' && G.state !== 'won') break;
    }
    if (G.state === 'play' && G.queue.length && !G.bossPending && !(G.boss && G.boss.boss.state === 'dying') && !G.starfall) {
      G.lvDelay += rdt;
      if (G.lvDelay > 0.22) {
        G.lvDelay = 0;
        const q = G.queue.shift();
        if (q.kind === 'level') {
          ring(P.x, P.y, 6, 120, 0.5, '#ffe9b0', 5); burst(P.x, P.y, 30, Q.C.gold, 260, 0.8, 2.6, 0, 2, -80);
          G.pillars.push({ x: P.x, y: P.y, t: 0, dur: 0.9, col: '#ffe9b0' });
          sfx('levelup');
        } else G.pillars.push({ x: P.x, y: P.y, t: 0, dur: 0.9, col: '#ffd76b' });
        openChoices(q.kind);
      }
    }
    if (G.state === 'dying') { G.deadT -= rdt; if (G.deadT <= 0) endRun(false); }
    if (G.state === 'won') { G.wonT -= rdt * G.dbg.speed; if (G.wonT <= 0) endRun(true); }
  }

  function endRun(victory) {
    if (G.ended) return;
    G.ended = true; G.state = 'end';
    Q.audio.duck(false);
    const sec = G.t, M = Q.MODES[G.mode];
    const parts = [
      ['击杀', Math.round(G.kills / 22)],
      ['坚持', Math.round((sec / 60) * 4)],
      ['首领', G.bossKills * 25],
      ['告捷', victory ? 60 : 0],
    ];
    let base = parts.reduce((s, p) => s + p[1], 0) * M.dustMul;
    const mul = 1 + 0.1 * Q.runeLv('dust');
    const dust = Math.max(1, Math.round((base + G.dustPicked) * mul));
    const total = Q.arcade.add(dust);
    const prevBest = Q.arcade.getBest();
    const newBest = Q.arcade.best(sec);
    if (G.kills >= 1000) ach('kills-1000');
    const S = Q.save.stats;
    S.runs++; S.kills += G.kills;
    if (victory) { S.wins++; if (G.mode === 'quick') S.quickWins++; S.heroWins[G.hero.id] = (S.heroWins[G.hero.id] | 0) + 1; }
    S.bestTime = Math.max(S.bestTime | 0, Math.round(sec));
    S.bestStage = Math.max(S.bestStage | 0, G.stage + (victory ? 1 : 0));
    let unlocked = null;
    if (G.bossKills >= 1 && !Q.save.unlocked.ranger) { Q.save.unlocked.ranger = true; unlocked = 'ranger'; }
    Q.save.lastHero = G.hero.id; Q.save.lastMode = G.mode;
    Q.persist();
    const res = {
      victory, hero: G.hero, mode: G.mode, time: sec, kills: G.kills, level: G.level, stage: G.stage, bossKills: G.bossKills, dmg: G.totalDmg, dmgTaken: G.dmgTaken,
      dmgBy: Object.entries(G.dmgBy).filter(([k, v]) => v > 0 && k !== 'impact' && k !== 'debug').sort((a, b) => b[1] - a[1]),
      dust, dustParts: parts, dustPicked: G.dustPicked, dustMul: mul, total, newBest: !!newBest, prevBest,
      build: G.weapons.map((w) => ({ id: w.id, lvl: w.lvl, evo: w.evo })).concat(Q.PASSIVES.filter((id) => G.lv[id]).map((id) => ({ id, lvl: G.lv[id] }))),
      skillLv: G.skillLv, ach: G.newAch.slice(), unlocked, bestCombo: G.bestCombo,
    };
    G.result = res;
    if (Q.ui) Q.ui.summary(res);
  }

  function srcName(src) {
    if (Q.UPG[src]) { const U = Q.UPG[src]; if (U.evo && G.evo && G.evo[src]) return Q.EVOS[U.evo].name; return U.name; }
    return { blast: '连锁爆炸', bomb: '天雷符', revive: '涅槃', impact: '坠星冲击' }[src] || src;
  }

  /* ---------- 对外接口 ---------- */
  Q.game = {
    start(heroId, mode) {
      reset(heroId, mode || 'normal');
      G.autoAim = Q.save.settings.autoAim || Q.input.touch;
      Q.audio.biome(0); Q.audio.music('run');
    },
    update,
    choose, reroll,
    pause() { if (G.state === 'play') { G.state = 'pause'; Q.audio.duck(true); return true; } return false; },
    resume() { if (G.state === 'pause') { G.state = 'play'; Q.audio.duck(false); P.inv = Math.max(P.inv, 0.3); } },
    quit() { G.state = 'off'; G.ended = true; Q.audio.duck(false); },
    describe, srcName, skillCd: () => (st ? skillCd() : 1), endRun, hit, hurt, spawnEnemy, spawnPos, startBoss, kill, dropGem, dropItem, addXp, applyUpgrade, recalc, rollChoices, openChoices,
    get eAct() { return eAct; }, get pAct() { return pAct; }, get ebAct() { return ebAct; }, get gemAct() { return gemAct; },
    get P() { return P; }, get st() { return st; },
    SK, W, query,
  };
})();
