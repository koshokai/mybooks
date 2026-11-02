/* 星际竞速 · 数据：赛道、车手、涂装（全部原创） */

/* ---------- 赛道生成：用“海龟绘图”指令描述赛道 ----------
 * ['S', 长度, 高度变化]            直道
 * ['L'|'R', 角度°, 半径, 高度变化]  左/右弯
 * 起点在第一段直道开头，朝 +x 方向。闭合误差会均匀分摊到整条赛道上。 */
export function buildPath(cmds, step = 8) {
  // 先用最小范数调整直道长度，使赛道首尾在平面上精确闭合
  const fixed = closeCmds(cmds);
  return turtle(fixed, step);
}

function closeCmds(cmds) {
  // 每个元素（直道长度 / 弯道半径）对终点位移的贡献是线性的：直道 = 方向 × 长度，弯道 = 单位半径弦向量 × 半径。
  // 用加权最小范数解把闭合误差分摊到所有元素上，迭代两次以处理下限约束。
  let out = cmds.map((c) => c.slice());
  for (let iter = 0; iter < 3; iter++) {
    let x = 0, z = 0, h = 0;
    const els = [];
    out.forEach((c, i) => {
      if (c[0] === 'S') {
        const ux = Math.cos(h), uz = Math.sin(h);
        els.push({ i, ux, uz, w: c[1] * 1.0, min: 30 }); x += ux * c[1]; z += uz * c[1];
      } else {
        const ang = c[1] * Math.PI / 180, r = c[2], dir = c[0] === 'L' ? -1 : 1;
        const n = Math.max(2, Math.round(ang * r / 8)), dh = dir * ang / n, seg = 2 * Math.sin(ang / n / 2);
        let ux = 0, uz = 0;
        for (let k = 0; k < n; k++) { h += dh / 2; ux += Math.cos(h) * seg; uz += Math.sin(h) * seg; h += dh / 2; }
        els.push({ i, ux, uz, w: r * 0.35, min: r * 0.8 }); x += ux * r; z += uz * r;
      }
    });
    if (Math.hypot(x, z) < 0.05) break;
    let a = 0, b = 0, d = 0;
    for (const e of els) { a += e.w * e.ux * e.ux; b += e.w * e.ux * e.uz; d += e.w * e.uz * e.uz; }
    const det = a * d - b * b;
    if (Math.abs(det) < 1e-9) break;
    const ix = (d * x - b * z) / det, iz = (-b * x + a * z) / det;
    for (const e of els) {
      const delta = -e.w * (e.ux * ix + e.uz * iz);
      const c = out[e.i];
      if (c[0] === 'S') c[1] = Math.max(e.min, c[1] + delta);
      else c[2] = Math.max(e.min, c[2] + delta);
    }
  }
  return out;
}

function turtle(cmds, step) {
  let x = 0, y = 0, z = 0, h = 0, turn = 0;
  const pts = [{ x, y, z }];
  const ease = (t) => t * t * (3 - 2 * t);
  for (const c of cmds) {
    const y0 = y;
    if (c[0] === 'S') {
      const len = c[1], dy = c[2] || 0, n = Math.max(1, Math.round(len / step));
      for (let i = 1; i <= n; i++) {
        x += Math.cos(h) * len / n; z += Math.sin(h) * len / n;
        y = y0 + dy * ease(i / n); pts.push({ x, y, z });
      }
    } else {
      const ang = c[1] * Math.PI / 180, r = c[2], dy = c[3] || 0;
      const dir = c[0] === 'L' ? -1 : 1;
      const n = Math.max(2, Math.round(ang * r / step));
      const dh = dir * ang / n, seg = 2 * r * Math.sin(ang / n / 2);
      for (let i = 1; i <= n; i++) {
        h += dh / 2; x += Math.cos(h) * seg; z += Math.sin(h) * seg; h += dh / 2;
        y = y0 + dy * ease(i / n); pts.push({ x, y, z });
      }
      turn += dir * c[1];
    }
  }
  const end = pts[pts.length - 1], st = pts[0];
  const ex = end.x - st.x, ey = end.y - st.y, ez = end.z - st.z;
  let total = 0; const cum = [0];
  for (let i = 1; i < pts.length; i++) { total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z); cum.push(total); }
  for (let i = 0; i < pts.length; i++) { const f = cum[i] / total; pts[i].x -= ex * f; pts[i].y -= ey * f; pts[i].z -= ez * f; }
  pts.pop();
  return { pts, turn, closeErr: Math.hypot(ex, ez), dyErr: ey, length: total, cmds };
}

/* ---------- 赛道 ---------- */
export const TRACKS = [
  {
    id: 'harbor', name: '霓虹星港', en: 'NEON HARBOR', diff: 1, laps: 3, width: 30,
    desc: '环绕气态巨星的港口环线，弯道宽缓、直道悠长，适合热身。',
    tag: '新手友好',
    cmds: [
      ['S', 340],
      ['L', 75, 210, 8],
      ['S', 170, 14],
      ['R', 40, 230],
      ['L', 95, 165, -6],
      ['S', 230, -16],
      ['L', 45, 260],
      ['R', 50, 190, 6],
      ['L', 110, 150, 10],
      ['S', 180],
      ['L', 60, 200, -10],
      ['R', 35, 250],
      ['L', 100, 175, -6],
      ['S', 170],
    ],
    pads: [[0.06, 0], [0.205, -0.45], [0.33, 0.5], [0.47, 0], [0.62, -0.5], [0.79, 0.45], [0.93, 0]],
    gates: [0.14, 0.38, 0.55, 0.71, 0.86],
    palette: {
      accent: '#4de8ff', accent2: '#ff5ad1', glow3: '#8a7bff',
      road: '#060b18', roadLine: '#1f4a7a', under: '#0a1222',
      sky: '#030616', neb1: '#1d4fb8', neb2: '#c03aa0', neb3: '#0aa6b8',
      sun: '#cfeaff', sunDir: [0.5, 0.35, -0.8], hemi: ['#5a7cc8', '#1a0f2a'],
    },
    scenery: 'harbor', music: 0, aiSkill: [0.885, 0.93],
  },
  {
    id: 'ember', name: '赤炎环带', en: 'CRIMSON BELT', diff: 2, laps: 3, width: 27,
    desc: '穿过红巨星旁的陨石带，起伏的坡道与连续 S 弯，中段立交飞越。',
    tag: '起伏 · 立交',
    cmds: [
      ['S', 300],
      ['L', 90, 140, 10],
      ['S', 120, 26],
      ['R', 60, 120, 6],
      ['L', 60, 120],
      ['R', 120, 105, -10],
      ['S', 300, -36],
      ['R', 85, 130],
      ['S', 150, 24],
      ['R', 95, 120, 14],
      ['L', 40, 160],
      ['S', 230, -6],
      ['L', 150, 110, -16],
      ['S', 120, -12],
      ['R', 50, 160],
      ['L', 70, 150],
      ['S', 140],
    ],
    pads: [[0.05, 0.4], [0.16, -0.4], [0.3, 0], [0.42, 0.45], [0.58, -0.4], [0.7, 0.4], [0.86, 0], [0.95, -0.4]],
    gates: [0.1, 0.24, 0.37, 0.52, 0.66, 0.8],
    palette: {
      accent: '#ff8a3d', accent2: '#ffd34d', glow3: '#ff3d6e',
      road: '#120806', roadLine: '#6a2a14', under: '#1a0d08',
      sky: '#0a0306', neb1: '#a8331c', neb2: '#e0902a', neb3: '#6a1a5a',
      sun: '#ffd2a0', sunDir: [-0.6, 0.25, -0.7], hemi: ['#c86a3a', '#2a0a10'],
    },
    scenery: 'ember', music: 1, aiSkill: [0.915, 0.965],
  },
  {
    id: 'abyss', name: '幽冥视界', en: 'VOID HORIZON', diff: 3, laps: 3, width: 25,
    desc: '在黑洞吸积盘边缘盘旋：急弯、连续发卡、陡降与立交，只为高手准备。',
    tag: '急弯 · 陡降',
    cmds: [
      ['S', 260],
      ['R', 80, 105, 6],
      ['L', 60, 90],
      ['R', 60, 90],
      ['S', 170, 20],
      ['R', 100, 78, 8],
      ['S', 120, 16],
      ['R', 400, 88, -56],
      ['S', 180, 10],
      ['L', 75, 82],
      ['R', 120, 72, 6],
      ['L', 50, 115],
      ['R', 140, 96, -10],
      ['S', 150],
    ],
    pads: [[0.045, 0], [0.135, 0.45], [0.27, -0.4], [0.4, 0.4], [0.5, 0], [0.63, -0.45], [0.76, 0.4], [0.9, -0.3]],
    gates: [0.09, 0.2, 0.33, 0.46, 0.58, 0.7, 0.83],
    palette: {
      accent: '#b26bff', accent2: '#4dffc3', glow3: '#ff4fa3',
      road: '#0a0614', roadLine: '#3c2470', under: '#100a1c',
      sky: '#030208', neb1: '#4a1aa0', neb2: '#127a7a', neb3: '#a01a6a',
      sun: '#e0d0ff', sunDir: [0.2, 0.6, 0.75], hemi: ['#7a5ac8', '#0a0618'],
    },
    scenery: 'abyss', music: 2, aiSkill: [0.94, 0.99],
  },
];

/* ---------- 对手（原创车队与飞船） ---------- */
export const RIVALS = [
  { id: 'gale', name: '烈风', team: '焰心车队', motto: '永远贴身，永远进攻',
    paint: { primary: '#d8352a', secondary: '#2a0b0b', glow: '#ff7a2a' }, body: { len: 1.05, wid: 0.95, fin: 2, pod: 1.0 },
    skill: 1.0, aggr: 0.9, line: 0.9, wobble: 0.15, boost: 0.9, drift: 1.0 },
  { id: 'beluga', name: '白鲸', team: '北辰工坊', motto: '稳如磐石的线路',
    paint: { primary: '#dfe9ef', secondary: '#1d4f63', glow: '#5dffe8' }, body: { len: 1.12, wid: 1.08, fin: 1, pod: 1.15 },
    skill: 0.985, aggr: 0.15, line: 1.0, wobble: 0.05, boost: 0.6, drift: 0.8 },
  { id: 'owl', name: '夜枭', team: '暗流俱乐部', motto: '把你挤到墙上',
    paint: { primary: '#1a1626', secondary: '#4b2a7a', glow: '#c65bff' }, body: { len: 0.98, wid: 1.0, fin: 0, pod: 0.95 },
    skill: 0.975, aggr: 1.0, line: 0.75, wobble: 0.2, boost: 0.8, drift: 0.9 },
  { id: 'luan', name: '青鸾', team: '云岫重工', motto: '最快的单圈',
    paint: { primary: '#1fb89a', secondary: '#0b2f3a', glow: '#7dffb0' }, body: { len: 1.1, wid: 0.9, fin: 2, pod: 0.9 },
    skill: 1.015, aggr: 0.3, line: 1.0, wobble: 0.08, boost: 1.0, drift: 1.0 },
  { id: 'cicada', name: '金蝉', team: '琥珀联合', motto: '飘忽不定的怪才',
    paint: { primary: '#e8b33a', secondary: '#3a250a', glow: '#ffe36a' }, body: { len: 0.95, wid: 1.05, fin: 1, pod: 1.05 },
    skill: 0.99, aggr: 0.5, line: 0.8, wobble: 0.3, boost: 0.7, drift: 1.0 },
];

export const PLAYER_SHIP = { name: '流光', team: '自由车手', body: { len: 1.0, wid: 1.0, fin: 2, pod: 1.0 } };

/* ---------- 涂装（用星尘购买） ---------- */
export const PAINTS = [
  { id: 'aurora', name: '极光白', en: 'AURORA', price: 0, primary: '#e8f0ff', secondary: '#1b2748', glow: '#4de8ff' },
  { id: 'ember', name: '余烬红', en: 'EMBER', price: 40, primary: '#ff3b3b', secondary: '#1e0808', glow: '#ff9a3a' },
  { id: 'deep', name: '深海蓝', en: 'DEEP SEA', price: 60, primary: '#1d5cff', secondary: '#07122e', glow: '#5df2ff' },
  { id: 'jade', name: '翡翠', en: 'JADE', price: 90, primary: '#16c784', secondary: '#062a1d', glow: '#b5ff6a' },
  { id: 'gilt', name: '鎏金', en: 'GILDED', price: 120, primary: '#f2c14e', secondary: '#2a1a05', glow: '#fff1a8', metal: 1.0, rough: 0.18 },
  { id: 'sakura', name: '樱绯', en: 'SAKURA', price: 160, primary: '#ff9ccf', secondary: '#3a0f2a', glow: '#ff5ad1' },
  { id: 'nebula', name: '星云虹彩', en: 'NEBULA', price: 220, primary: '#9fb4ff', secondary: '#1a1040', glow: '#c98bff', irid: true, metal: 0.9, rough: 0.15 },
  { id: 'void', name: '暗物质', en: 'DARK MATTER', price: 300, primary: '#0c0d12', secondary: '#050507', glow: '#4dffc3', rough: 0.35 },
];

export const PLACE_DUST = [60, 42, 30, 20, 14, 10];
export const TRACK_MULT = [1, 1.25, 1.5];
