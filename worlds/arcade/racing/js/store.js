/* 星际竞速 · 本地存档（涂装、纪录、幽灵、设置），只保存在本机浏览器 */
const KEY = 'wx.racing.v1';

function load() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (v && typeof v === 'object') return v;
  } catch (e) {}
  return {};
}

const data = Object.assign({ paints: ['aurora'], paint: 'aurora', best: {}, ghosts: {}, settings: { muted: false, music: true, cam: 0 }, races: 0, wins: {} }, load());
data.settings = Object.assign({ muted: false, music: true, cam: 0 }, data.settings || {});

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) {
    // 存储满了：丢掉幽灵数据再试
    try { data.ghosts = {}; localStorage.setItem(KEY, JSON.stringify(data)); } catch (e2) {}
  }
}

export const Store = {
  get data() { return data; },
  save,
  owns(id) { return data.paints.includes(id); },
  addPaint(id) { if (!data.paints.includes(id)) data.paints.push(id); save(); },
  setPaint(id) { data.paint = id; save(); },
  best(track) { return data.best[track] || (data.best[track] = {}); },
  setSetting(k, v) { data.settings[k] = v; save(); },
  ghost(track) { return data.ghosts[track] || null; },
  setGhost(track, g) { data.ghosts[track] = g; save(); },
};

/* 共享星尘（游戏厅）——若脚本缺失则退化为本地 */
export const Arcade = (() => {
  const A = window.WXArcade;
  if (A) return A;
  let local = 0;
  return {
    getStardust: () => local, addStardust: (n) => (local += n), spendStardust: (n) => { if (local < n) return false; local -= n; return true; },
    recordBest: () => false, getBest: () => null, unlock: () => false, achievements: () => [], on: () => {}, earnedBy: () => 0,
  };
})();
