// 星环列车 · 每日任务、永久倍率、本地存档
const KEY = 'wx.metro.v1';
export const MAX_LEVEL = 29;
const BIOME_NAMES = ['昼侧', '晨昏线', '夜侧', '碎星带', '极光环'];

const POOL = [
  { id: 'dust', fmt: (n) => `收集 ${n} 星尘`, mode: 'sum', key: 'motes', tiers: [150, 260, 400, 650] },
  { id: 'slide', fmt: (n) => `滑铲 ${n} 次`, mode: 'sum', key: 'slides', tiers: [12, 20, 32, 50] },
  { id: 'jump', fmt: (n) => `跳跃 ${n} 次`, mode: 'sum', key: 'jumps', tiers: [20, 35, 55, 85] },
  { id: 'dist', fmt: (n) => `单局跑满 ${n} 米`, mode: 'best', key: 'dist', tiers: [800, 1500, 2500, 4000] },
  { id: 'roof', fmt: (n) => `在车顶上奔跑 ${n} 米`, mode: 'sum', key: 'roof', tiers: [120, 250, 420, 700] },
  { id: 'power', fmt: (n) => `拾取 ${n} 个道具`, mode: 'sum', key: 'powerups', tiers: [3, 5, 8, 12] },
  { id: 'jet', fmt: (n) => `使用喷射背包 ${n} 次`, mode: 'sum', key: 'jets', tiers: [1, 2, 3, 5] },
  { id: 'near', fmt: (n) => `与迎面穿梭车擦肩 ${n} 次`, mode: 'sum', key: 'nearMiss', tiers: [3, 6, 10, 16] },
  { id: 'score', fmt: (n) => `单局得分 ${n.toLocaleString('zh-CN')}`, mode: 'best', key: 'score', tiers: [4000, 9000, 18000, 35000] },
  { id: 'lanes', fmt: (n) => `变道 ${n} 次`, mode: 'sum', key: 'switches', tiers: [50, 100, 170, 260] },
  { id: 'clean', fmt: (n) => `不磕碰连续跑 ${n} 米`, mode: 'best', key: 'maxClean', tiers: [500, 900, 1500, 2400] },
  { id: 'biome', fmt: (n) => `单局抵达「${BIOME_NAMES[n]}」`, mode: 'best', key: 'biome', tiers: [1, 2, 3, 4] },
];

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

export class Save {
  constructor() {
    this.d = this.load();
    this.ensureDay();
  }
  load() {
    try {
      const v = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (v && typeof v === 'object') return { level: 0, day: '', missions: [], muted: false, runs: 0, totalDist: 0, ...v };
    } catch (e) {}
    return { level: 0, day: '', missions: [], muted: false, runs: 0, totalDist: 0 };
  }
  save() { try { localStorage.setItem(KEY, JSON.stringify(this.d)); } catch (e) {} }
  get level() { return Math.min(MAX_LEVEL, this.d.level | 0); }
  get mult() { return 1 + this.level; }
  get muted() { return !!this.d.muted; }
  set muted(v) { this.d.muted = !!v; this.save(); }

  ensureDay() {
    const day = today();
    if (this.d.day === day && this.d.missions.length === 3) return;
    let h = hash(day + ':ring');
    const ids = [];
    const pool = POOL.slice();
    while (ids.length < 3) {
      h = Math.imul(h ^ (h >>> 13), 0x5bd1e995) >>> 0;
      const p = pool.splice(h % pool.length, 1)[0];
      ids.push(p);
    }
    const tierBase = Math.min(3, Math.floor(this.level / 3));
    this.d.day = day;
    this.d.missions = ids.map((p, i) => {
      const tier = Math.min(3, tierBase + ((h >>> (i * 3)) % 2));
      return { id: p.id, n: p.tiers[tier], base: 0, done: false };
    });
    this.save();
  }

  list() {
    return this.d.missions.map((m) => {
      const p = POOL.find((x) => x.id === m.id);
      return { ...m, text: p ? p.fmt(m.n) : m.id, mode: p ? p.mode : 'sum', key: p ? p.key : '' };
    });
  }

  runValue(key, run) { return run[key] ?? 0; }
  progress(m, run) {
    const v = run ? this.runValue(m.key, run) : 0;
    return m.mode === 'sum' ? m.base + v : Math.max(m.base, v);
  }

  // 局中实时检查：返回本次新完成的任务
  check(run) {
    const done = [];
    for (const m of this.list()) {
      if (m.done) continue;
      if (this.progress(m, run) >= m.n) {
        const raw = this.d.missions.find((x) => x.id === m.id);
        raw.done = true;
        this.d.level = Math.min(MAX_LEVEL, (this.d.level | 0) + 1);
        done.push(m);
      }
    }
    if (done.length) this.save();
    return done;
  }

  // 一局结束：把本局数据累计进任务进度
  commit(run, dist) {
    for (const raw of this.d.missions) {
      const p = POOL.find((x) => x.id === raw.id);
      if (!p) continue;
      const v = run[p.key] ?? 0;
      raw.base = p.mode === 'sum' ? raw.base + v : Math.max(raw.base, v);
    }
    this.d.runs = (this.d.runs | 0) + 1;
    this.d.totalDist = (this.d.totalDist || 0) + dist;
    this.save();
  }
}
