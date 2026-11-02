/* 远征 · 工具：数学、随机、存档 */
(function () {
  'use strict';
  const Q = (window.Q = window.Q || {});
  const TAU = Math.PI * 2;
  Q.TAU = TAU;
  Q.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  Q.lerp = (a, b, t) => a + (b - a) * t;
  Q.rand = (a, b) => a + Math.random() * (b - a);
  Q.randi = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
  Q.pick = (arr) => arr[(Math.random() * arr.length) | 0];
  Q.chance = (p) => Math.random() < p;
  Q.angDiff = (a, b) => {
    let d = (b - a) % TAU;
    if (d > Math.PI) d -= TAU; else if (d < -Math.PI) d += TAU;
    return d;
  };
  Q.hash2 = (x, y, s) => {
    let h = (x | 0) * 374761393 + (y | 0) * 668265263 + ((s | 0) * 2147483647);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
  Q.mulberry = (seed) => {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  Q.easeOut = (t) => 1 - (1 - t) * (1 - t) * (1 - t);
  Q.easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  Q.fmtTime = (s) => {
    s = Math.max(0, Math.floor(s));
    return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  };
  Q.fmtNum = (n) => {
    n = Math.round(n);
    if (n >= 1e8) return (n / 1e8).toFixed(2).replace(/\.?0+$/, '') + '亿';
    if (n >= 1e4) return (n / 1e4).toFixed(1).replace(/\.0$/, '') + '万';
    return String(n);
  };
  /** 按权重随机抽取（不放回），list 元素需有 w 属性 */
  Q.weightedPick = (list, n) => {
    const pool = list.slice();
    const out = [];
    while (out.length < n && pool.length) {
      let sum = 0;
      for (const it of pool) sum += it.w;
      let r = Math.random() * sum;
      let idx = 0;
      for (; idx < pool.length; idx++) { r -= pool[idx].w; if (r <= 0) break; }
      if (idx >= pool.length) idx = pool.length - 1;
      out.push(pool[idx]);
      pool.splice(idx, 1);
    }
    return out;
  };
  Q.hexToRgb = (hex) => {
    const h = hex.replace('#', '');
    const v = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  };
  Q.rgba = (hex, a) => { const c = Q.hexToRgb(hex); return `rgba(${c[0]},${c[1]},${c[2]},${a})`; };
  Q.mix = (h1, h2, t) => {
    const a = Q.hexToRgb(h1), b = Q.hexToRgb(h2);
    const c = a.map((v, i) => Math.round(v + (b[i] - v) * t));
    return '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
  };
  Q.esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ---------- 本地存档 ---------- */
  const KEY = 'wx.quest.v1';
  const DEF = () => ({
    runes: {},
    unlocked: { guard: true, mage: true, ranger: false },
    settings: { sfx: true, music: true, autoAim: false, numbers: true, shake: true },
    stats: { runs: 0, wins: 0, quickWins: 0, kills: 0, bestTime: 0, bestStage: 0, heroWins: {}, bossKills: 0 },
    seenHelp: false,
    lastHero: 'guard',
    lastMode: 'normal',
  });
  function loadSave() {
    const d = DEF();
    try {
      const v = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (v && typeof v === 'object') {
        Object.assign(d.runes, v.runes || {});
        Object.assign(d.unlocked, v.unlocked || {});
        Object.assign(d.settings, v.settings || {});
        Object.assign(d.stats, v.stats || {});
        d.stats.heroWins = Object.assign({}, (v.stats && v.stats.heroWins) || {});
        d.seenHelp = !!v.seenHelp;
        if (v.lastHero) d.lastHero = v.lastHero;
        if (v.lastMode) d.lastMode = v.lastMode;
      }
    } catch (e) { /* 忽略损坏的存档 */ }
    return d;
  }
  Q.save = loadSave();
  Q.persist = () => {
    try { localStorage.setItem(KEY, JSON.stringify(Q.save)); } catch (e) { /* 存储不可用 */ }
  };
  Q.reloadSave = () => { Q.save = loadSave(); return Q.save; };

  /* 共享星尘账户的安全包装（arcade.js 不存在时也能运行） */
  const A = () => window.WXArcade;
  Q.arcade = {
    dust: () => { try { return A() ? A().getStardust() : 0; } catch (e) { return 0; } },
    add: (n) => { try { return A() ? A().addStardust(n, 'quest') : 0; } catch (e) { return 0; } },
    refund: (n) => { try { return A() ? A().addStardust(n) : 0; } catch (e) { return 0; } },
    spend: (n) => { try { return A() ? A().spendStardust(n) : false; } catch (e) { return false; } },
    best: (sec) => { try { return A() ? A().recordBest('quest', Math.round(sec), 'high') : false; } catch (e) { return false; } },
    getBest: () => { try { return A() ? A().getBest('quest') : null; } catch (e) { return null; } },
    unlock: (id, name) => { try { return A() ? A().unlock('quest:' + id, name) : false; } catch (e) { return false; } },
    has: (id) => { try { return A() ? A().achievements().some((a) => a.id === 'quest:' + id) : false; } catch (e) { return false; } },
  };
})();
