/*
 * 万象游戏厅 · 共享进度
 * 所有游戏共用一个"星尘"账户和各自的最高纪录，只保存在本机浏览器（localStorage）。
 *
 * 用法（普通 <script> 或 ES 模块均可，加载后使用全局 window.WXArcade）：
 *   <script src="../../shared/arcade.js"></script>
 *   WXArcade.addStardust(30, "racing");          // 增加星尘，返回新的总数
 *   WXArcade.getStardust();                       // 当前星尘总数
 *   WXArcade.recordBest("racing", 12345, "high"); // 记录最高分（"high" 越大越好，"low" 越小越好，如用时）；返回 true 表示刷新纪录
 *   WXArcade.getBest("racing");                   // 读取纪录（没有则为 null）
 *   WXArcade.unlock("racing:first-win", "首胜"); // 解锁成就（重复解锁无效），返回 true 表示首次解锁
 *   WXArcade.achievements();                      // 全部已解锁成就 [{id, name, t}]
 *   WXArcade.on("change", fn);                    // 数据变化时回调
 */
(function () {
  "use strict";
  var KEY = "wx.arcade.v1";
  var listeners = [];

  function load() {
    try {
      var v = JSON.parse(localStorage.getItem(KEY) || "null");
      if (v && typeof v === "object") return { stardust: v.stardust | 0, best: v.best || {}, ach: v.ach || [], earned: v.earned || {} };
    } catch (e) {}
    return { stardust: 0, best: {}, ach: [], earned: {} };
  }
  function save(d) {
    try { localStorage.setItem(KEY, JSON.stringify(d)); } catch (e) {}
    listeners.forEach(function (fn) { try { fn(d); } catch (e) {} });
  }

  var api = {
    getStardust: function () { return load().stardust; },
    addStardust: function (n, gameId) {
      n = Math.max(0, Math.round(+n || 0));
      var d = load();
      d.stardust += n;
      if (gameId) d.earned[gameId] = (d.earned[gameId] | 0) + n;
      save(d);
      return d.stardust;
    },
    spendStardust: function (n) {
      n = Math.max(0, Math.round(+n || 0));
      var d = load();
      if (d.stardust < n) return false;
      d.stardust -= n;
      save(d);
      return true;
    },
    getBest: function (gameId) { var b = load().best[gameId]; return b == null ? null : b; },
    recordBest: function (gameId, score, mode) {
      var d = load();
      var old = d.best[gameId];
      var better = old == null || (mode === "low" ? score < old : score > old);
      if (better) { d.best[gameId] = score; save(d); }
      return better;
    },
    unlock: function (id, name) {
      var d = load();
      if (d.ach.some(function (a) { return a.id === id; })) return false;
      d.ach.push({ id: id, name: name || id, t: Date.now() });
      save(d);
      return true;
    },
    achievements: function () { return load().ach.slice(); },
    earnedBy: function (gameId) { return load().earned[gameId] | 0; },
    on: function (ev, fn) { if (ev === "change" && typeof fn === "function") listeners.push(fn); },
  };

  // 其他标签页修改时同步
  try {
    window.addEventListener("storage", function (e) {
      if (e.key === KEY) { var d = load(); listeners.forEach(function (fn) { try { fn(d); } catch (x) {} }); }
    });
  } catch (e) {}

  window.WXArcade = api;
})();
