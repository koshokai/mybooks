/* 远征 · 启动、主循环、自适应画质、调试接口 */
(function () {
  'use strict';
  const Q = window.Q, G = Q.G;

  const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  G.mobile = coarse || Math.min(window.innerWidth, window.innerHeight) < 600;
  G.pq = G.mobile ? 0.62 : 1;
  G.ptCap = G.mobile ? 1500 : 3600;

  Q.art.build();
  Q.render.init();
  Q.input.init();
  Q.ui.init();
  Q.audio.music('title');

  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { Q.art.iconCache = {}; }).catch(() => {});

  let resizeT = 0;
  window.addEventListener('resize', () => { clearTimeout(resizeT); resizeT = setTimeout(() => { Q.render.resize(); G.mobile = coarse || Math.min(window.innerWidth, window.innerHeight) < 600; }, 60); });
  window.addEventListener('orientationchange', () => setTimeout(Q.render.resize, 200));
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (G.state === 'play') Q.ui.pause();
      Q.audio.suspend();
    } else Q.audio.resume();
  });
  window.addEventListener('pagehide', () => { if (G.state === 'play') Q.ui.pause(); });

  /* ---------- 性能统计与自适应画质 ---------- */
  const N = 240;
  const perf = { dt: new Float32Array(N), work: new Float32Array(N), upd: new Float32Array(N), ren: new Float32Array(N), i: 0, n: 0, evalT: 0, governor: true, lowered: 0 };
  function govern(dt) {
    if (!perf.governor || G.state !== 'play') { perf.evalT = 0; return; }
    perf.evalT += dt;
    if (perf.evalT < 2.5) return;
    perf.evalT = 0;
    let s = 0, c = Math.min(perf.n, 120);
    for (let j = 0; j < c; j++) s += perf.dt[(perf.i - 1 - j + N) % N];
    const avg = s / Math.max(1, c);
    if (avg > 0.026 && G.pq > 0.3) {
      G.pq = Math.max(0.3, G.pq * 0.75); G.ptCap = Math.round(G.ptCap * 0.8); perf.lowered++;
      if (G.pq < 0.5 && Q.render.dprMul > 0.7) { Q.render.dprMul = 0.75; Q.render.resize(); }
    }
  }

  let last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    let dt = (now - last) / 1000; last = now;
    if (!(dt >= 0)) dt = 0;
    const cdt = Math.min(dt, 0.05);
    const t0 = performance.now();
    Q.input.update();
    Q.game.update(cdt);
    const t1 = performance.now();
    Q.render.frame(cdt);
    const t2 = performance.now();
    Q.ui.update(dt);
    const i = perf.i;
    perf.dt[i] = dt; perf.work[i] = t2 - t0; perf.upd[i] = t1 - t0; perf.ren[i] = t2 - t1;
    perf.i = (i + 1) % N; perf.n = Math.min(N, perf.n + 1);
    govern(dt);
  }
  requestAnimationFrame(frame);

  /* ---------- 调试接口（自动化测试使用） ---------- */
  const stat = (arr, n) => {
    const c = Math.min(perf.n, n || N); let s = 0, mx = 0; const v = [];
    for (let j = 0; j < c; j++) { const x = arr[(perf.i - 1 - j + N) % N]; s += x; mx = Math.max(mx, x); v.push(x); }
    v.sort((a, b) => a - b);
    return { avg: s / Math.max(1, c), max: mx, p95: v[Math.floor(v.length * 0.95)] || 0, n: c };
  };
  window.__debug = {
    speed(n) { G.dbg.speed = Math.max(0.1, +n || 1); return G.dbg.speed; },
    god(on) { G.dbg.god = on !== false; return G.dbg.god; },
    autoPick(on) { G.dbg.autoPick = on !== false; },
    bot(on) { G.bot = on !== false; },
    governor(on) { perf.governor = on !== false; if (on === false) { G.pq = G.mobile ? 0.62 : 1; G.ptCap = G.mobile ? 1500 : 3600; Q.render.dprMul = 1; Q.render.resize(); } },
    start(hero, mode) { Q.ui.startRun(hero || 'guard', mode || 'normal'); return G.state; },
    state() {
      const P = G.p, b = G.boss;
      return {
        state: G.state, screen: Q.ui.screen(), t: +(G.t || 0).toFixed(2), stage: G.stage, stageT: +(G.stageT || 0).toFixed(1), hero: G.hero && G.hero.id, mode: G.mode,
        hp: P ? +P.hp.toFixed(1) : 0, maxHp: G.st ? G.st.maxHp : 0, level: G.level, xp: G.xp, kills: G.kills, enemies: G.eAct ? G.eAct.length : 0,
        bullets: G.ebAct ? G.ebAct.length : 0, particles: Q.PT.n, gems: G.gemAct ? G.gemAct.length : 0, queue: G.queue ? G.queue.length : 0,
        boss: b ? { id: b.id, hp: Math.round(b.hp), mhp: Math.round(b.mhp), phase: b.boss.phase, state: b.boss.state } : null, bossKills: G.bossKills, bossPending: !!G.bossPending,
        weapons: G.weapons ? G.weapons.map((w) => w.id + ':' + w.lvl + (w.evo ? '★' : '')) : [], lv: G.lv, choices: G.choices ? G.choices.map((c) => c.type + ':' + c.id) : null,
        stats: G.st ? { might: +G.st.might.toFixed(3), maxHp: G.st.maxHp, speed: +G.st.speed.toFixed(1), armor: G.st.armor, magnet: +G.st.magnet.toFixed(1) } : null,
        totalDmg: Math.round(G.totalDmg || 0), dust: Q.arcade.dust(), pq: G.pq, result: G.result ? { victory: G.result.victory, dust: G.result.dust, time: Math.round(G.result.time) } : null,
      };
    },
    levelUp(n) { n = n || 1; for (let i = 0; i < n; i++) { G.level++; G.xpNext = Q.xpFor(G.level); G.queue.push({ kind: 'level' }); } return G.queue.length; },
    pick(i) { return Q.game.choose(i || 0); },
    give(id, n) { for (let i = 0; i < (n || 1); i++) Q.game.applyUpgrade({ type: 'up', id }); return G.lv[id]; },
    evolve(eid) { Q.game.applyUpgrade({ type: 'evo', id: eid }); return true; },
    spawn(n, id) {
      const S = Q.STAGES[G.stage]; let c = 0;
      for (let i = 0; i < n; i++) {
        const p = Q.game.spawnPos(Math.random() * 300 - 150);
        const pick = id || S.roster[(Math.random() * S.roster.length) | 0][0];
        if (Q.game.spawnEnemy(pick, p[0], p[1])) c++;
      }
      return c;
    },
    spawnNear(n, id, r) {
      const S = Q.STAGES[G.stage]; let c = 0;
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, d = (r || 320) * Math.sqrt(Math.random()) + 60;
        const pick = id || S.roster[(Math.random() * S.roster.length) | 0][0];
        if (Q.game.spawnEnemy(pick, G.p.x + Math.cos(a) * d, G.p.y + Math.sin(a) * d)) c++;
      }
      return c;
    },
    boss(stage) {
      if (stage != null && stage !== G.stage) { G.biomeFrom = Q.STAGES[stage].biome; G.stage = stage; G.biomeFade = 1; Q.audio.biome(Q.STAGES[stage].biome); }
      G.nextStageT = 0; G.stageT = G.stageDur - 0.05; G.warned = true;
      return true;
    },
    hurtBoss(frac) { const b = G.boss; if (!b || b.boss.state === 'intro') return false; b.boss.inv = 0; Q.game.hit(b, b.mhp * frac, 'debug', 0, 0, 0, { noCrit: true }); return Math.round(b.hp); },
    killBoss() { const b = G.boss; if (!b) return false; b.boss.inv = 0; b.boss.vanish = false; Q.game.hit(b, b.hp + 10, 'debug', 0, 0, 0, { noCrit: true }); return true; },
    setHp(v) { if (G.p) G.p.hp = v; return v; },
    die() { G.dbg.god = false; G.reviveLeft = 0; G.p.inv = 0; G.p.iframe = 0; G.p.iceShield = 0; G.p.hp = 0.5; return Q.game.hurt(9999, G.p.x, G.p.y); },
    endRun(v) { Q.game.endRun(!!v); },
    frames(n) { return { dt: stat(perf.dt, n), work: stat(perf.work, n), update: stat(perf.upd, n), render: stat(perf.ren, n), pq: G.pq, dprMul: Q.render.dprMul, lowered: perf.lowered }; },
    save() { return JSON.parse(JSON.stringify(Q.save)); },
  };
})();
