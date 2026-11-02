/* =========================================================
   影 · 暗域 —— 公共工具、随机数与难度配置
   ========================================================= */
(function () {
  'use strict';
  const U = (window.Umbra = window.Umbra || {});
  const TAU = (U.TAU = Math.PI * 2);

  U.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  U.lerp = (a, b, t) => a + (b - a) * t;
  U.smooth = t => t * t * (3 - 2 * t);
  U.dist = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);
  U.angDiff = (a, b) => {
    let d = (b - a) % TAU;
    if (d > Math.PI) d -= TAU;
    if (d < -Math.PI) d += TAU;
    return d;
  };
  // 朝目标角度转动，限制每次的最大转角
  U.turnTo = (a, target, maxStep) => {
    const d = U.angDiff(a, target);
    if (Math.abs(d) <= maxStep) return target;
    return a + Math.sign(d) * maxStep;
  };

  U.mulberry32 = function (a) {
    a = a >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  U.hashStr = function (s) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  };
  // 坐标哈希 → [0,1)
  U.hash2 = function (x, y, s) {
    let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul((s | 0) + 1, 2246822519)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
  // 平滑的一维噪声（闪烁用）
  U.noise1 = function (x, s) {
    const i = Math.floor(x), f = x - i;
    const a = U.hash2(i, 7, s), b = U.hash2(i + 1, 7, s);
    return a + (b - a) * f * f * (3 - 2 * f);
  };

  U.store = {
    KEY: 'mybooks.arcade.shadow.v1',
    _d: null,
    load() {
      if (this._d) return this._d;
      let d = null;
      try { d = JSON.parse(localStorage.getItem(this.KEY) || 'null'); } catch (e) { d = null; }
      if (!d || typeof d !== 'object') d = {};
      d.daily = d.daily && typeof d.daily === 'object' ? d.daily : {};
      d.runs = d.runs | 0;
      d.wins = d.wins | 0;
      this._d = d;
      return d;
    },
    save() {
      try { localStorage.setItem(this.KEY, JSON.stringify(this._d || {})); } catch (e) { /* 隐私模式 */ }
    },
  };

  U.todayStr = () => {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  };
  U.todayCN = () => {
    const d = new Date();
    return d.getMonth() + 1 + '月' + d.getDate() + '日';
  };
  U.fmtTime = ms => {
    const s = Math.max(0, Math.round(ms / 1000));
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  };
  U.seedCode = seed => (seed >>> 0).toString(36).toUpperCase().slice(-5).padStart(5, '0');

  /* ---------------- 玩家常量 ---------------- */
  U.PLAYER = {
    r: 0.27,
    walk: 3.15,
    sprint: 5.05,
    adren: 5.6,
    drain: 0.205, // 每秒体力消耗（满体力约 4.9 秒冲刺）
    regen: 0.135,
    regenDelay: 0.9,
    exhaustTo: 0.35,
    flashRange: 9.5,
    flashHalf: 0.62, // 外圈半角（弧度）
  };

  /* ---------------- 难度 ---------------- */
  U.DIFF = {
    easy: {
      key: 'easy', name: '轻松', en: 'CALM',
      desc: '它走得慢，也不太警觉。3 座信标，3 枚照明弹。',
      cols: 3, rows: 3, cellW: 14, cellH: 12, relays: 3,
      hubChance: 0.12, loopChance: 0.5, doorChance: 0.72,
      wPatrol: 1.7, wInvest: 2.45, wChase: 3.55,
      vision: 7, half: 0.48, glimpse: 9, hearing: 0.75, memory: 1.4,
      lungeRange: 2.1, windup: 0.5, lungeCd: 3.0, searchTime: 7,
      flares: 3, scanCd: 10, restore: 6, checks: 1, calibWin: 0.25, calibPeriod: 1.7,
      stunTime: 3.8, grace: 26, calmLimit: 46, dust: 20, par: 300,
    },
    normal: {
      key: 'normal', name: '标准', en: 'STANDARD',
      desc: '完整的暗域体验。4 座信标，2 枚照明弹。',
      cols: 4, rows: 3, cellW: 14, cellH: 12, relays: 4,
      hubChance: 0.14, loopChance: 0.42, doorChance: 0.7,
      wPatrol: 2.05, wInvest: 2.95, wChase: 4.1,
      vision: 8.5, half: 0.54, glimpse: 11, hearing: 1, memory: 2.1,
      lungeRange: 2.35, windup: 0.42, lungeCd: 2.4, searchTime: 9,
      flares: 2, scanCd: 14, restore: 7, checks: 2, calibWin: 0.17, calibPeriod: 1.35,
      stunTime: 3.0, grace: 18, calmLimit: 32, dust: 35, par: 360,
    },
    nightmare: {
      key: 'nightmare', name: '噩梦', en: 'NIGHTMARE',
      desc: '它更快、更敏锐、更执着。5 座信标，扫描冷却更久。',
      cols: 4, rows: 4, cellW: 14, cellH: 12, relays: 5,
      hubChance: 0.16, loopChance: 0.38, doorChance: 0.68,
      wPatrol: 2.35, wInvest: 3.3, wChase: 4.5,
      vision: 10, half: 0.58, glimpse: 13, hearing: 1.3, memory: 2.9,
      lungeRange: 2.6, windup: 0.34, lungeCd: 1.85, searchTime: 12,
      flares: 2, scanCd: 18, restore: 8, checks: 2, calibWin: 0.12, calibPeriod: 1.1,
      stunTime: 2.3, grace: 12, calmLimit: 24, dust: 60, par: 480,
    },
  };

  /* ---------------- 成就 ---------------- */
  U.ACH = [
    { id: 'first-escape', name: '首次逃脱', desc: '第一次乘逃生舱离开暗域站' },
    { id: 'untouched', name: '零受伤逃脱', desc: '面罩完好无损地逃脱' },
    { id: 'nightmare', name: '噩梦难度逃脱', desc: '在噩梦难度下成功逃脱' },
    { id: 'unseen', name: '来去无影', desc: '整局没有被守夜者追逐过，并成功逃脱' },
    { id: 'steady', name: '稳如磐石', desc: '一局里所有相位校准全部成功（至少 4 次）' },
    { id: 'close', name: '擦肩而过', desc: '一局中经历 5 次惊险时刻' },
    { id: 'flare', name: '灼目', desc: '用照明弹击退守夜者' },
    { id: 'daily', name: '每日航线', desc: '完成一次每日站点' },
  ];
})();
