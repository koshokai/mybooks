/* =========================================================
   引力 · 星轨 —— 关卡数据与「每日星图」生成器
   坐标：600 × 1000 设计空间（竖屏，发射台在下方）。
   每个手工关卡都经过离线求解器验证，至少存在一发即可通关的轨迹。
   ========================================================= */
(function (root, factory) {
  const P = (typeof module === 'object' && module.exports) ? require('./physics.js') : root.OrbitPhys;
  const api = factory(P);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.OrbitLevels = api;
})(typeof self !== 'undefined' ? self : this, function (P) {
  'use strict';

  const CHAPTERS = [
    { name: '初光', en: 'FIRST LIGHT', hue: 205, desc: '行星的引力会弯折你的航线' },
    { name: '碎石带', en: 'THE SHOAL', hue: 28, desc: '小行星会把你弹开，加速环让你更快' },
    { name: '潮汐', en: 'TIDES', hue: 160, desc: '卫星在你出发后才开始转动，黑洞吞噬一切' },
    { name: '虫洞回廊', en: 'WORMHOLES', hue: 285, desc: '从一端进入，从另一端出现' },
  ];

  // 新机制首次登场时的提示
  const TIPS = {
    5: '撞上小行星会被弹开——借它转个弯',
    6: '穿过加速环，速度大增',
    10: '卫星在你发射之后才开始运行',
    11: '黑洞会吞噬一切，只可远观借力',
    15: '虫洞两端相连，进一端，出另一端',
  };

  /* LEVELS:BEGIN */
  const LEVELS = [
    {name: "第一缕光", planets: [{x: 430, y: 470, r: 44, m: 4200000, hue: 200}], motes: [[286,691],[292,479],[349,303]], portal: [413,180], hint: [-95.05,0.22]},
    {name: "绕行", planets: [{x: 300, y: 450, r: 58, m: 6000000, hue: 30, ring: true}], motes: [[229,645],[212,436],[290,280]], portal: [380,169], hint: [-107.65,0.2387]},
    {name: "双子星", planets: [{x: 160, y: 400, r: 42, m: 4600000, hue: 280},{x: 440, y: 600, r: 42, m: 4600000, hue: 170}], motes: [[282,742],[290,498],[294,298]], portal: [272,177], hint: [-98.95,0.195]},
    {name: "回旋", start: [120,890], planets: [{x: 360, y: 400, r: 60, m: 8000000, hue: 15}], motes: [[312,649],[399,231],[437,409]], portal: [379,186], hint: [-50.35,0.2825]},
    {name: "三体", planets: [{x: 140, y: 300, r: 36, m: 4000000, hue: 120},{x: 460, y: 320, r: 40, m: 4600000, hue: 330},{x: 300, y: 610, r: 46, m: 5400000, hue: 45, ring: true}], motes: [[216,565],[244,401],[277,174]], portal: [283,120], hint: [-112.6,0.4013]},
    {name: "初弹", planets: [{x: 300, y: 260, r: 58, m: 5000000, hue: 190}], rocks: [{x: 530, y: 560, r: 34}], motes: [[420,692],[356,458],[209,317]], portal: [109,173], hint: [-58.65,0.6013]},
    {name: "加速环", planets: [{x: 320, y: 470, r: 52, m: 9000000, hue: 260, ring: true}], rings: [{x: 170, y: 730, k: 1.6}], motes: [[194,488],[282,291]], portal: [440,139], hint: [-113.8,0.2075]},
    {name: "碎石迷宫", planets: [{x: 520, y: 760, r: 30, m: 2500000, hue: 60}], rocks: [{x: 200, y: 600, r: 28},{x: 410, y: 570, r: 30},{x: 300, y: 400, r: 26},{x: 140, y: 300, r: 24},{x: 460, y: 270, r: 28},{x: 300, y: 230, r: 20}], motes: [[327,736],[397,411],[382,476]], portal: [301,128], hint: [-80.8,0.6388]},
    {name: "环中弹弓", planets: [{x: 380, y: 420, r: 48, m: 6000000, hue: 350}], rocks: [{x: 480, y: 720, r: 30},{x: 110, y: 240, r: 26}], rings: [{x: 180, y: 540, k: 1.5}], motes: [[233,699],[168,453],[303,215]], portal: [500,179], hint: [-110.35,0.3138]},
    {name: "陨石雨", planets: [{x: 80, y: 180, r: 30, m: 3000000, hue: 210}], rocks: [{x: 120, y: 650, r: 18},{x: 250, y: 560, r: 20},{x: 390, y: 650, r: 18},{x: 510, y: 540, r: 20},{x: 170, y: 420, r: 18},{x: 340, y: 390, r: 22},{x: 470, y: 320, r: 18},{x: 230, y: 250, r: 18},{x: 410, y: 190, r: 20}], rings: [{x: 300, y: 760, k: 1.35}], motes: [[283,653],[271,484],[256,291]], portal: [322,121], hint: [-94,0.545]},
    {name: "伴月", planets: [{x: 300, y: 460, r: 44, m: 5000000, hue: 160}], moons: [{cx: 300, cy: 460, orbit: 112, r: 13, m: 1000000, w: 1.1, ph: 0.4}], motes: [[215,656],[211,425],[334,265]], portal: [458,168], hint: [-112.45,0.195]},
    {name: "深渊", holes: [{x: 300, y: 430, r: 16, m: 22000000}], motes: [[215,651],[218,434],[339,346]], portal: [519,377], hint: [-115.15,0.195]},
    {name: "双月舞", planets: [{x: 300, y: 480, r: 48, m: 6000000, hue: 25, ring: true}], moons: [{cx: 300, cy: 480, orbit: 108, r: 12, m: 900000, w: 1.5, ph: 0},{cx: 300, cy: 480, orbit: 168, r: 15, m: 1400000, w: -0.8, ph: 2.2}], motes: [[402,713],[422,444],[291,261]], portal: [144,160], hint: [-55.6,0.195]},
    {name: "事件视界", planets: [{x: 160, y: 580, r: 40, m: 4000000, hue: 300}], holes: [{x: 440, y: 380, r: 16, m: 24000000}], motes: [[365,721],[441,498],[300,247]], portal: [141,152], hint: [-68.5,0.9325]},
    {name: "潮汐锁定", planets: [{x: 300, y: 640, r: 34, m: 3000000, hue: 90}], holes: [{x: 120, y: 380, r: 15, m: 16000000},{x: 480, y: 380, r: 15, m: 16000000}], moons: [{cx: 300, cy: 640, orbit: 84, r: 11, m: 600000, w: 2, ph: 3.6}], motes: [[354,565],[321,369],[308,223]], portal: [299,112], hint: [-71.8,0.3763]},
    {name: "穿越", planets: [{x: 300, y: 440, r: 72, m: 4000000, hue: 220}], rocks: [{x: 230, y: 160, r: 26},{x: 420, y: 230, r: 26}], worms: [{a: [470,700], b: [130,300]}], motes: [[402,782],[188,248]], portal: [329,133], hint: [-46.45,0.995]},
    {name: "折跃", planets: [{x: 180, y: 520, r: 40, m: 4500000, hue: 140},{x: 430, y: 300, r: 40, m: 4500000, hue: 40}], worms: [{a: [470,760], b: [120,200]}], motes: [[464,780],[173,261],[309,480]], portal: [382,596], hint: [-95.65,0.5075]},
    {name: "镜像", planets: [{x: 130, y: 280, r: 30, m: 2500000, hue: 0},{x: 470, y: 660, r: 30, m: 2500000, hue: 200}], holes: [{x: 300, y: 470, r: 16, m: 20000000}], worms: [{a: [120,650], b: [480,260]}], motes: [[219,725],[436,280],[315,329]], portal: [304,139], hint: [-121.45,0.2638]},
    {name: "迷途", planets: [{x: 300, y: 160, r: 36, m: 4000000, hue: 280}], rocks: [{x: 200, y: 480, r: 30},{x: 400, y: 480, r: 30},{x: 300, y: 330, r: 24},{x: 120, y: 200, r: 22},{x: 480, y: 180, r: 22}], worms: [{a: [300,600], b: [520,330]}], rings: [{x: 420, y: 760, k: 1.4}], motes: [[349,670],[522,317],[338,481]], portal: [179,617], hint: [-77.5,0.9325]},
    {name: "星轨终章", planets: [{x: 160, y: 620, r: 40, m: 5000000, hue: 190},{x: 450, y: 250, r: 36, m: 4000000, hue: 30}], holes: [{x: 430, y: 560, r: 15, m: 14000000}], rocks: [{x: 280, y: 330, r: 26}], moons: [{cx: 160, cy: 620, orbit: 95, r: 12, m: 800000, w: 1.6, ph: 1}], worms: [{a: [100,400], b: [520,820]}], rings: [{x: 300, y: 450, k: 1.3}], motes: [[350,823],[408,430],[216,202],[379,396]], portal: [152,122], hint: [-51.7,0.5325]},
  ];
  /* LEVELS:END */

  // ---------------- 每日星图 ----------------
  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function hashStr(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    return h >>> 0;
  }

  const D2R = Math.PI / 180;
  const R = Math.round;

  /**
   * 生成第 k 张星图。思路：先随机摆放天体，再随机挑一发“好看”的轨迹，
   * 把星尘与星门放在这条轨迹上 —— 因此必然可解；再检查附近扰动的命中率，保证人手可控。
   */
  function genDaily(seed, k) {
    const rnd = mulberry32(hashStr(seed + '#' + k));
    const d = Math.min(1, k / 7);
    const rr = (a, b) => a + rnd() * (b - a);
    for (let attempt = 0; attempt < 400; attempt++) {
      const lv = { start: [R(rr(200, 400)), 890], planets: [], holes: [], rocks: [], moons: [], worms: [], rings: [] };
      const bodies = [];
      const place = (r, ymin, ymax, gap) => {
        for (let i = 0; i < 40; i++) {
          const x = rr(40 + r * 0.6, 560 - r * 0.6), y = rr(ymin, ymax);
          if (Math.hypot(x - lv.start[0], y - lv.start[1]) < r + 150) continue;
          if (bodies.every(b => Math.hypot(b.x - x, b.y - y) > b.r + r + (gap == null ? 50 : gap))) { bodies.push({ x, y, r }); return [R(x), R(y)]; }
        }
        return null;
      };
      const np = 1 + Math.floor(rnd() * 2) + (d > 0.5 && rnd() < 0.5 ? 1 : 0);
      for (let i = 0; i < np; i++) {
        const r = R(rr(26, 54));
        const withMoon = d > 0.35 && i === 0 && rnd() < 0.55;
        const orbit = withMoon ? R(r + rr(38, 70)) : 0;
        const at = place(withMoon ? orbit + 14 : r, 160, 720);
        if (!at) continue;
        const m = R(r * r * rr(2300, 3600) / 1000) * 1000;
        lv.planets.push({ x: at[0], y: at[1], r, m, hue: R(rnd() * 360), ring: rnd() < 0.3 });
        if (withMoon) lv.moons.push({ cx: at[0], cy: at[1], orbit, r: R(rr(10, 14)), m: R(rr(6, 12)) * 1e5, w: +((rnd() < 0.5 ? -1 : 1) * rr(0.8, 1.9)).toFixed(2), ph: +(rnd() * 6.28).toFixed(2) });
      }
      if (d > 0.1) {
        const nr = Math.floor(rnd() * (1 + d * 4));
        for (let i = 0; i < nr; i++) { const r = R(rr(16, 30)); const at = place(r, 120, 800, 30); if (at) lv.rocks.push({ x: at[0], y: at[1], r }); }
      }
      if (d > 0.25 && rnd() < 0.3 + d * 0.3) { const at = place(26, 250, 760, 30); if (at) lv.rings.push({ x: at[0], y: at[1], k: +rr(1.3, 1.6).toFixed(2) }); }
      if (d > 0.45 && rnd() < 0.5) { const at = place(40, 220, 700, 60); if (at) lv.holes.push({ x: at[0], y: at[1], r: 15, m: R(rr(12, 22)) * 1e6 }); }
      if (d > 0.6 && rnd() < 0.45) {
        const a = place(24, 150, 800, 40), b = place(24, 150, 800, 40);
        if (a && b && Math.hypot(a[0] - b[0], a[1] - b[1]) > 260) lv.worms.push({ a, b });
      }
      const L = P.prepare(lv);
      for (let tr = 0; tr < 24; tr++) {
        const ang = (-90 + (rnd() - 0.5) * 140) * D2R, pow = rr(0.28, 0.95);
        const r = P.simulate(L, ang, pow, { path: true, every: 2, maxT: 7 });
        const path = r.path, n = path.length;
        const tEnd = path[n - 1][2] - (r.end === 'crash' || r.end === 'swallow' ? 0.15 : 0);
        if (tEnd < 1.6) continue;
        let turn = 0;
        for (let i = 4; i < n; i += 4) {
          const a1 = Math.atan2(path[i - 2][1] - path[i - 4][1], path[i - 2][0] - path[i - 4][0]);
          const a2 = Math.atan2(path[i][1] - path[i - 2][1], path[i][0] - path[i - 2][0]);
          let da = Math.abs(a2 - a1); if (da > Math.PI) da = 2 * Math.PI - da; turn += da;
        }
        if (turn < 0.9) continue;
        const tp = rr(1.4, Math.min(tEnd, 4.5 + d));
        const pi = path.findIndex(q => q[2] >= tp);
        if (pi < 0) continue;
        const pq = path[pi];
        if (pq[0] < 40 || pq[0] > 560 || pq[1] < 90 || pq[1] > 960) continue;
        if (Math.hypot(pq[0] - lv.start[0], pq[1] - lv.start[1]) < 200) continue;
        const nm = 2 + (d > 0.3 ? 1 : 0) + (d > 0.75 ? 1 : 0);
        const motes = []; let ok = true;
        for (let j = 0; j < nm && ok; j++) {
          const tm = tp * (j + 1) / (nm + 1) + (rnd() - 0.5) * tp * 0.12;
          const q = path.find(z => z[2] >= tm);
          if (!q || q[0] < 30 || q[0] > 570 || q[1] < 80 || q[1] > 965) { ok = false; break; }
          const m = [R(q[0]), R(q[1])];
          if (Math.hypot(m[0] - lv.start[0], m[1] - lv.start[1]) < 80) ok = false;
          if (Math.hypot(m[0] - pq[0], m[1] - pq[1]) < 50) ok = false;
          for (const o of motes) if (Math.hypot(o[0] - m[0], o[1] - m[1]) < 48) ok = false;
          motes.push(m);
        }
        if (!ok) continue;
        lv.motes = motes; lv.portal = [R(pq[0]), R(pq[1])];
        const L2 = P.prepare(lv);
        if (P.simulate(L2, ang, pow).end !== 'win') continue;
        let wins = 0;
        const pert = [[0.5, 0], [-0.5, 0], [1, 0], [-1, 0], [0, 0.015], [0, -0.015], [0, 0.03], [0, -0.03]];
        for (const [da, dp] of pert) if (P.simulate(L2, ang + da * D2R, pow + dp).end === 'win') wins++;
        if (wins < (d < 0.4 ? 5 : 3)) continue;
        lv.name = '星图 ' + (k + 1);
        lv.hint = [+(ang / D2R).toFixed(2), +pow.toFixed(4)];
        return lv;
      }
    }
    // 兜底：一颗行星的简单星图
    return { name: '星图 ' + (k + 1), start: [300, 890], planets: [{ x: 420, y: 470, r: 44, m: 4.2e6, hue: 200 }], motes: [[301, 692], [306, 481]], portal: [343, 149] };
  }

  return { CHAPTERS, LEVELS, TIPS, genDaily, mulberry32, hashStr };
});
