// 存档与“云养”：离开期间按真实时间推算饥饿、心情、水质、藻类、水草生长与孔雀鱼繁殖
import { SP, NAMES, MAX_FISH } from "./data.js";
import { presetLayout } from "./presets.js";

const KEY = "wx.aquarium.v1";
export const AG = { X: 40, Y: 24 }; // 前玻璃藻类网格

export const RATE = {
  hunger: 3.4,          // 每小时饥饿 +（约 30 小时从饱到饿）
  water: 0.32,          // 每小时水质 −（基础）
  waterPerFish: 0.012,  // 每条鱼每小时额外 −
  algae: 0.0125,        // 每小时藻类 +（乘以分布系数）
  plant: 0.0055,        // 每小时水草生长 +
  happy: 9,             // 每小时心情向目标靠拢的速度
  fryPerHour: 0.011,    // 心情好时每小时产仔概率
};

const rnd = (a, b) => a + Math.random() * (b - a);
let uid = Date.now() % 1e6;
export const newId = () => "f" + (uid++).toString(36) + Math.floor(Math.random() * 36).toString(36);

export function pickName(state) {
  const used = new Set(state.fish.map((f) => f.name));
  const free = NAMES.filter((n) => !used.has(n));
  if (free.length) return free[Math.floor(Math.random() * free.length)];
  return NAMES[Math.floor(Math.random() * NAMES.length)] + (state.fish.length + 1);
}

export function makeFish(state, sp, opt = {}) {
  const s = SP[sp];
  const f = {
    id: newId(), sp, name: opt.name || pickName(state), born: opt.born || Date.now(),
    hunger: opt.hunger ?? 20, happy: opt.happy ?? 75, v: opt.v ?? Math.floor(Math.random() * 4),
    sex: opt.sex || (sp === "guppy" || sp === "betta" ? (sp === "betta" ? "m" : Math.random() < 0.5 ? "m" : "f") : undefined),
  };
  if (opt.fry) f.fry = true;
  if (s.beh === "school" || s.beh === "bottom") f.v = 0;
  return f;
}

/** 藻类分布系数：角落与底部长得更快 */
export const algaeMult = (() => {
  const m = new Float32Array(AG.X * AG.Y);
  for (let j = 0; j < AG.Y; j++) for (let i = 0; i < AG.X; i++) {
    const u = i / (AG.X - 1), v = j / (AG.Y - 1);
    const edge = Math.max(Math.abs(u - 0.5) * 2, 1 - v * 1.3);
    const n = Math.sin(u * 17.3 + v * 5.1) * 0.5 + Math.sin(u * 7.7 - v * 13.9) * 0.5;
    m[j * AG.X + i] = Math.max(0.15, 0.55 + 0.6 * edge * edge + 0.35 * n);
  }
  return m;
})();

export function newState() {
  const now = Date.now();
  const s = {
    v: 1, created: now, lastTick: now, water: 96, algae: new Array(AG.X * AG.Y).fill(0),
    fish: [], layout: presetLayout("dutch"), storage: {}, gifted: false,
    daily: { date: "", fed: 0, clean: 0, water: 0, trim: 0, earned: 0 }, streak: { last: "", n: 0, days: 0 },
    stats: { feeds: 0, flakes: 0, cleans: 0, changes: 0, trims: 0, bought: 0, fry: 0 },
    settings: { mute: false, tags: false, light: "auto" },
  };
  const add = (sp, n, o) => { for (let i = 0; i < n; i++) s.fish.push(makeFish(s, sp, { born: now - rnd(2, 20) * 864e5, ...(typeof o === "function" ? o(i) : o) })); };
  add("neon", 7); add("guppy", 3, (i) => ({ sex: i === 0 ? "m" : "f", v: i })); add("cory", 3); add("shrimp", 4); add("oto", 1);
  return s;
}

export function loadState() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || "null");
    if (s && s.v === 1 && Array.isArray(s.fish) && s.layout) {
      const d = newState();
      for (const k of Object.keys(d)) if (s[k] === undefined) s[k] = d[k];
      s.settings = { ...d.settings, ...s.settings };
      s.stats = { ...d.stats, ...s.stats };
      if (!Array.isArray(s.algae) || s.algae.length !== AG.X * AG.Y) s.algae = d.algae;
      return s;
    }
  } catch (e) {}
  return null;
}
export function saveState(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); return true; } catch (e) { return false; }
}

export const dayKey = (t = Date.now()) => { const d = new Date(t); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
export const algaeMean = (s) => s.algae.reduce((a, b) => a + b, 0) / s.algae.length;
export const avg = (arr, k) => (arr.length ? arr.reduce((a, b) => a + b[k], 0) / arr.length : 0);

export function happyTarget(s, f) {
  const plants = s.layout.items.filter((i) => i.t === "plant").length;
  let t = 100 - f.hunger * 0.55 - Math.max(0, 75 - s.water) * 0.7 - algaeMean(s) * 22 + Math.min(10, plants * 0.6) - 4;
  if (s.fish.length > 36) t -= (s.fish.length - 36) * 0.8;
  return Math.max(5, Math.min(100, t));
}

/**
 * 推进 hours 小时（离线或在线）。返回事件列表（新生小鱼等）。
 */
export function advance(s, hours, live = false) {
  const ev = { fry: [] };
  if (!(hours > 0)) return ev;
  const n = s.fish.length;
  // 每条鱼
  for (const f of s.fish) {
    f.hunger = Math.min(100, f.hunger + RATE.hunger * hours);
    const tgt = happyTarget(s, f);
    const k = 1 - Math.exp(-RATE.happy * hours / 40);
    f.happy = f.happy + (tgt - f.happy) * k;
    if (f.fry && Date.now() - f.born > 4 * 864e5) delete f.fry;
  }
  // 水质
  s.water = Math.max(18, s.water - (RATE.water + RATE.waterPerFish * n) * hours);
  // 藻类：水质越差长得越快；小精灵与虾会吃掉一点
  const grazers = s.fish.filter((f) => f.sp === "oto" || f.sp === "shrimp").length;
  const g = RATE.algae * hours * (1 + (100 - s.water) / 70) * Math.max(0.35, 1 - grazers * 0.06);
  for (let i = 0; i < s.algae.length; i++) s.algae[i] = Math.min(1, s.algae[i] + g * algaeMult[i]);
  // 水草
  for (const it of s.layout.items) if (it.t === "plant") it.g = Math.min(1.6, (it.g ?? 0.8) + RATE.plant * hours * (s.water > 50 ? 1 : 0.5));
  // 孔雀鱼繁殖
  const gup = s.fish.filter((f) => f.sp === "guppy" && !f.fry);
  if (gup.some((f) => f.sex === "m") && gup.some((f) => f.sex === "f") && avg(gup, "happy") > 62) {
    let p = 1 - Math.pow(1 - RATE.fryPerHour, hours);
    let litters = 0;
    while (Math.random() < p && litters < 3) { litters++; p *= 0.35; }
    for (let L = 0; L < litters; L++) {
      const k = 1 + Math.floor(Math.random() * 3);
      for (let i = 0; i < k && s.fish.length < MAX_FISH; i++) {
        const mom = gup.find((f) => f.sex === "f");
        const f = makeFish(s, "guppy", { fry: true, v: Math.floor(Math.random() * 4), hunger: 30, happy: 80, born: Date.now() - Math.random() * hours * 36e5 * (live ? 0 : 1) });
        s.fish.push(f); ev.fry.push(f);
        s.stats.fry++;
        void mom;
      }
    }
  }
  return ev;
}

/** 载入时计算离开期间发生了什么 */
export function catchUp(s, now = Date.now()) {
  const ms = Math.min(now - (s.lastTick || now), 30 * 864e5);
  const before = {
    hunger: avg(s.fish, "hunger"), happy: avg(s.fish, "happy"), water: s.water, algae: algaeMean(s),
    plant: avg(s.layout.items.filter((i) => i.t === "plant"), "g"), count: s.fish.length,
  };
  // 分段推进，让心情跟随饥饿变化
  let left = ms / 36e5; const ev = { fry: [] };
  while (left > 0) { const h = Math.min(left, 2); const e = advance(s, h); ev.fry.push(...e.fry); left -= h; }
  s.lastTick = now;
  const after = {
    hunger: avg(s.fish, "hunger"), happy: avg(s.fish, "happy"), water: s.water, algae: algaeMean(s),
    plant: avg(s.layout.items.filter((i) => i.t === "plant"), "g"), count: s.fish.length,
  };
  return { ms, before, after, fry: ev.fry };
}

/** 温馨的“离开期间”小事件 */
export function awayStories(s, sum) {
  const has = (sp) => s.fish.some((f) => f.sp === sp);
  const h = sum.ms / 36e5;
  const out = [];
  const nights = Math.floor(h / 24) + (h > 8 ? 1 : 0);
  if (sum.fry.length) out.push(`孔雀鱼妈妈生下了 ${sum.fry.length} 条小鱼苗，正躲在水草里`);
  if (has("betta") && h > 3) out.push("斗鱼在水面吐了一小团泡巢，看起来很得意");
  if (has("cory") && h > 1) out.push("熊猫鼠鱼们在沙地里翻找了好几回，还偷偷冲上水面吸了口气");
  if (has("shrimp") && h > 12) out.push("一只樱花虾蜕了一次壳，长大了一点点");
  if (has("neon") && nights > 0) out.push("夜里红绿灯们的颜色变淡了，安安静静地睡在水草间");
  if (has("oto") && h > 6) out.push("小精灵把玻璃角落的藻类啃掉了一些");
  if (has("guppy") && h > 2 && !sum.fry.length) out.push("雄孔雀鱼一直在雌鱼面前展示它的大尾巴");
  if (has("goldfish") && h > 2) out.push("金鱼在底沙上翻来翻去，想找点吃的");
  if (h > 4 && s.settings.light !== "night") out.push("水草在灯光下吐出了一串串细小的氧气泡");
  const pg = sum.after.plant - sum.before.plant;
  if (pg > 0.02) out.push(`水草长高了约 ${Math.round(pg * 60)}%`);
  if (sum.after.algae - sum.before.algae > 0.06) out.push("玻璃上冒出了一些绿色的藻斑");
  if (sum.after.hunger > 60) out.push("鱼儿们有点饿了，正聚在水面附近张望");
  return out.slice(0, 5);
}
