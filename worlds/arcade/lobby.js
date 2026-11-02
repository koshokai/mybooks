(() => {
  "use strict";
  const A = window.WXArcade;
  const $ = (s) => document.querySelector(s);
  const isReady = (g) => (window.WX_READY || {})[g.id] !== false;

  const GAMES = [
    { id: "quest", glyph: "征", name: "远征", en: "Starfall Expedition", genre: "奇幻 · 动作 RPG", color: "#ff6b4a",
      desc: "选一位英雄，在星陨之地的怪潮里升级、挑技能、打首领。", href: "quest/", best: (v) => `最佳 ${fmtTime(v)}` },
    { id: "racing", glyph: "速", name: "星际竞速", en: "Star Racer", genre: "飞船 · 竞速", color: "#4de8ff",
      desc: "悬浮飞船在霓虹赛道上漂移、蓄力加速，和五名对手抢第一。", href: "racing/",
      rec: () => pickRecord([["abyss", "幽冥视界"], ["ember", "赤炎环带"], ["harbor", "霓虹星港"]], "racing", (v, n) => `最快 ${n} ${fmtMs(v)}`) },
    { id: "orbit", glyph: "轨", name: "星轨", en: "Orbit Sling", genre: "引力 · 解谜", color: "#ff7ad9",
      desc: "拉开、松手，借行星引力绕出完美弧线，收集星尘、穿过虫洞。", href: "../game/", best: (v) => `已得 ${v} 星` },
    { id: "shadow", glyph: "影", name: "暗域", en: "Umbra Station", genre: "潜行 · 追逐", color: "#b48cff",
      desc: "漂流的废弃空间站里，打着手电修复信标——有什么东西在跟着你。", href: "shadow/",
      rec: () => pickRecord([["nightmare", "噩梦"], ["normal", "标准"], ["easy", "轻松"]], "shadow", (v, n) => `${n}逃脱 ${fmtTime(v / 1000)}`) },
    { id: "metro", glyph: "驰", name: "星环列车", en: "Ring Rail", genre: "跑酷 · 列车", color: "#ffb547",
      desc: "小机器人「小轨」在环绕星球的货运轨道上狂奔、换轨、飞跃。", href: "metro/", best: (v) => `最高 ${Number(v).toLocaleString()} 分` },
  ];
  const fmtTime = (s) => { s = Math.round(+s || 0); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
  const fmtMs = (ms) => { const s = (+ms || 0) / 1000; return `${Math.floor(s / 60)}:${(s % 60).toFixed(2).padStart(5, "0")}`; };
  // 依次查找各赛道 / 难度的纪录，显示最难的那一项
  const pickRecord = (list, prefix, fmt) => {
    for (const [id, name] of list) { const v = A.getBest(`${prefix}:${id}`); if (v != null) return fmt(v, name); }
    return null;
  };

  /* ---------- 机台 ---------- */
  const hall = $("#hall");
  hall.innerHTML = GAMES.map((g, i) => `
    <article class="cab ${isReady(g) ? "" : "soon"}" style="--c:${g.color};animation-delay:${0.08 * i}s" data-i="${i}" tabindex="0" aria-label="${g.name}">
      <div class="marquee"><b>${g.glyph}</b><span>${g.en}</span></div>
      <div class="bezel">
        <canvas class="screen" width="320" height="240"></canvas>
        <div class="scan"></div>
        <div class="screen-ui">
          <div class="genre">${g.genre}</div>
          <h2>${g.name}</h2>
          <p>${g.desc}</p>
          <div class="rec" data-rec="${g.id}"></div>
          ${isReady(g) ? `<a class="play" href="${g.href}" data-play="${i}">开始游戏 <span>▶</span></a>` : `<div class="play off">即将开放</div>`}
        </div>
      </div>
      <div class="panel"><i class="stick"></i><i class="btn b1"></i><i class="btn b2"></i><i class="btn b3"></i></div>
      <div class="base"><span>${String(i + 1).padStart(2, "0")}</span></div>
      <div class="glow"></div>
    </article>`).join("");
  const cabs = [...hall.children];
  $("#dots").innerHTML = GAMES.map((g, i) => `<i style="--c:${g.color}" data-i="${i}"></i>`).join("");
  const dots = [...$("#dots").children];

  let sel = 0;
  try { sel = Math.min(GAMES.length - 1, +localStorage.getItem("wx.arcade.sel") || 0); } catch {}
  function select(i, scroll) {
    sel = (i + GAMES.length) % GAMES.length;
    cabs.forEach((c, k) => c.classList.toggle("on", k === sel));
    dots.forEach((d, k) => d.classList.toggle("on", k === sel));
    document.documentElement.style.setProperty("--accent", GAMES[sel].color);
    try { localStorage.setItem("wx.arcade.sel", sel); } catch {}
    if (scroll) cabs[sel].scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }

  function start(i) {
    const g = GAMES[i];
    if (!isReady(g)) { const c = cabs[i]; c.classList.remove("nudge"); void c.offsetWidth; c.classList.add("nudge"); return; }
    const scr = cabs[i].querySelector(".bezel").getBoundingClientRect();
    const z = $("#zoom");
    z.style.cssText = `--c:${g.color};left:${scr.left}px;top:${scr.top}px;width:${scr.width}px;height:${scr.height}px`;
    z.innerHTML = `<b>${g.glyph}</b>`;
    z.classList.remove("go");
    void z.offsetWidth;
    z.classList.add("go");
    setTimeout(() => (location.href = g.href), 700);
  }
  addEventListener("pageshow", () => $("#zoom").classList.remove("go"));

  const fine = matchMedia("(hover: hover) and (pointer: fine)").matches;
  hall.addEventListener("mouseover", (e) => { const c = e.target.closest(".cab"); if (fine && c && +c.dataset.i !== sel) select(+c.dataset.i); });
  hall.addEventListener("click", (e) => {
    const c = e.target.closest(".cab");
    if (!c) return;
    const i = +c.dataset.i;
    if (e.target.closest("[data-play]") || (i === sel && fine)) { e.preventDefault(); start(i); }
    else { e.preventDefault(); select(i, true); }
  });
  $("#dots").addEventListener("click", (e) => { const d = e.target.closest("i"); if (d) select(+d.dataset.i, true); });
  document.addEventListener("keydown", (e) => {
    if (!$("#drawer").hidden) { if (e.key === "Escape") closeDrawer(); return; }
    if (e.key === "ArrowRight") select(sel + 1, true);
    if (e.key === "ArrowLeft") select(sel - 1, true);
    if (e.key === "Enter") start(sel);
  });
  // 手机上横向滑动时，自动选中居中的机台
  let st;
  hall.addEventListener("scroll", () => {
    clearTimeout(st);
    st = setTimeout(() => {
      const mid = innerWidth / 2;
      let best = 0, bd = 1e9;
      cabs.forEach((c, k) => { const r = c.getBoundingClientRect(); const d = Math.abs(r.left + r.width / 2 - mid); if (d < bd) { bd = d; best = k; } });
      if (best !== sel) select(best);
    }, 90);
  }, { passive: true });

  /* ---------- 星尘与档案 ---------- */
  function refresh() {
    $("#dust").textContent = A.getStardust().toLocaleString();
    $("#dust2").textContent = A.getStardust().toLocaleString();
    GAMES.forEach((g) => {
      const el = hall.querySelector(`[data-rec="${g.id}"]`);
      const best = A.getBest(g.id), earned = A.earnedBy(g.id);
      const parts = [];
      if (g.rec) { const r = g.rec(); if (r) parts.push(r); }
      else if (best != null && g.best) parts.push(g.best(best));
      if (earned) parts.push(`累计星尘 ${earned.toLocaleString()}`);
      el.textContent = parts.join(" · ") || "尚未开局";
    });
  }
  A.on("change", refresh);
  refresh();

  function openDrawer() {
    $("#per").innerHTML = GAMES.map((g) => `<div style="--c:${g.color}"><b>${g.glyph}</b><span>${g.name}</span><em>${A.earnedBy(g.id).toLocaleString()}</em></div>`).join("");
    const ach = A.achievements().sort((a, b) => b.t - a.t);
    $("#achCount").textContent = `· ${ach.length}`;
    $("#ach").innerHTML = ach.length
      ? ach.map((a) => { const g = GAMES.find((x) => a.id.startsWith(x.id + ":")); return `<li style="--c:${g ? g.color : "#fff"}"><b>${g ? g.glyph : "★"}</b>${a.name}<time>${new Date(a.t).toLocaleDateString("zh-CN")}</time></li>`; }).join("")
      : `<li class="none">还没有成就——随便挑一台机器开一局吧</li>`;
    $("#drawer").hidden = false;
  }
  const closeDrawer = () => ($("#drawer").hidden = true);
  $("#wallet").addEventListener("click", openDrawer);
  $("#drawer").addEventListener("click", (e) => { if (e.target.closest("[data-close]")) closeDrawer(); });

  /* ---------- 屏幕里的小动画（每台机器一个） ---------- */
  const scenes = {
    quest(x, t, W, H, c) {
      x.fillStyle = "#14070a"; x.fillRect(0, 0, W, H);
      const cx = W / 2, cy = H / 2;
      for (let i = 0; i < 14; i++) { // 怪潮
        const a = i / 14 * 6.283 + t * 0.3, r = 95 - ((t * 18 + i * 9) % 60);
        x.fillStyle = i % 4 ? "#7a2a3a" : "#c24a2a";
        x.beginPath(); x.arc(cx + Math.cos(a) * r * 1.4, cy + Math.sin(a) * r, 6, 0, 6.283); x.fill();
      }
      x.globalCompositeOperation = "lighter";
      for (let i = 0; i < 3; i++) { // 星弹
        const a = t * 3 + i * 2.09;
        x.fillStyle = c; x.shadowColor = c; x.shadowBlur = 14;
        x.beginPath(); x.arc(cx + Math.cos(a) * 34, cy + Math.sin(a) * 26, 4, 0, 6.283); x.fill();
      }
      const nova = (t * 0.7) % 1;
      x.strokeStyle = `rgba(255,140,90,${1 - nova})`; x.lineWidth = 3;
      x.beginPath(); x.arc(cx, cy, nova * 120, 0, 6.283); x.stroke();
      x.shadowBlur = 0; x.globalCompositeOperation = "source-over";
      x.fillStyle = "#ffe0c8"; x.beginPath(); x.arc(cx, cy, 8, 0, 6.283); x.fill();
    },
    racing(x, t, W, H, c) {
      const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, "#020611"); g.addColorStop(1, "#06243a");
      x.fillStyle = g; x.fillRect(0, 0, W, H);
      const hy = H * 0.42, cx = W / 2 + Math.sin(t * 0.8) * 30;
      x.strokeStyle = c; x.lineWidth = 2; x.shadowColor = c; x.shadowBlur = 10;
      x.beginPath(); x.moveTo(cx - 8, hy); x.lineTo(-40, H); x.moveTo(cx + 8, hy); x.lineTo(W + 40, H); x.stroke();
      for (let i = 0; i < 9; i++) { // 赛道横线
        const p = ((i / 9 + t * 0.9) % 1) ** 2, y = hy + p * (H - hy), w = 16 + p * (W + 80);
        x.globalAlpha = p; x.beginPath(); x.moveTo(cx - w / 2 + (W / 2 - cx) * p, y); x.lineTo(cx + w / 2 + (W / 2 - cx) * p, y); x.stroke();
      }
      x.globalAlpha = 1; x.shadowBlur = 0;
      for (let i = 0; i < 30; i++) { // 速度线
        const a = i * 2.4, p = (t * 1.6 + i * 0.13) % 1;
        x.strokeStyle = `rgba(200,250,255,${p * 0.6})`; x.lineWidth = 1;
        x.beginPath(); x.moveTo(W / 2 + Math.cos(a) * p * 200, hy + Math.sin(a) * p * 140); x.lineTo(W / 2 + Math.cos(a) * (p * 200 + 18), hy + Math.sin(a) * (p * 140 + 13)); x.stroke();
      }
      x.fillStyle = "#e9fdff"; x.shadowColor = c; x.shadowBlur = 20; // 飞船
      x.beginPath(); x.moveTo(W / 2, H - 70); x.lineTo(W / 2 - 34, H - 34); x.lineTo(W / 2 + 34, H - 34); x.closePath(); x.fill();
      x.shadowBlur = 0;
    },
    orbit(x, t, W, H, c) {
      x.fillStyle = "#0b0410"; x.fillRect(0, 0, W, H);
      const px = W * 0.52, py = H * 0.5;
      const g = x.createRadialGradient(px - 8, py - 8, 4, px, py, 34); g.addColorStop(0, "#ffd0f2"); g.addColorStop(0.5, c); g.addColorStop(1, "#3a0a30");
      x.fillStyle = g; x.beginPath(); x.arc(px, py, 30, 0, 6.283); x.fill();
      x.globalCompositeOperation = "lighter";
      for (let k = 0; k < 26; k++) { // 彗星尾迹
        const a = t * 2 - k * 0.06, r = 70 + Math.sin(a * 2) * 8;
        x.fillStyle = `rgba(255,170,230,${(1 - k / 26) * 0.8})`;
        x.beginPath(); x.arc(px + Math.cos(a) * r * 1.5, py + Math.sin(a) * r * 0.75, 4 - k * 0.12, 0, 6.283); x.fill();
      }
      for (let i = 0; i < 5; i++) { const a = i * 1.3 + 0.4; x.fillStyle = `rgba(255,240,180,${0.5 + 0.5 * Math.sin(t * 4 + i)})`; x.beginPath(); x.arc(px + Math.cos(a) * 125, py + Math.sin(a) * 70, 3, 0, 6.283); x.fill(); }
      x.globalCompositeOperation = "source-over";
    },
    shadow(x, t, W, H, c) {
      x.fillStyle = "#050308"; x.fillRect(0, 0, W, H);
      x.strokeStyle = "#1c1426"; x.lineWidth = 6;
      for (let i = 0; i < 5; i++) { x.strokeRect(20 + i * 62, 30, 46, 180); }
      const px = W * 0.3 + Math.sin(t * 0.6) * 40, py = H * 0.6, a = Math.sin(t * 0.9) * 0.6 - 0.2;
      const g = x.createRadialGradient(px, py, 4, px, py, 170); g.addColorStop(0, "rgba(255,240,210,.55)"); g.addColorStop(1, "rgba(255,240,210,0)");
      x.fillStyle = g; x.beginPath(); x.moveTo(px, py); x.arc(px, py, 170, a - 0.35, a + 0.35); x.closePath(); x.fill();
      x.fillStyle = "#ffe9c4"; x.beginPath(); x.arc(px, py, 5, 0, 6.283); x.fill();
      const blink = Math.sin(t * 1.3) > -0.85; // 猎手的眼
      const ex = W * 0.78 + Math.sin(t * 0.4) * 12, ey = H * 0.32;
      if (blink) { x.fillStyle = c; x.shadowColor = c; x.shadowBlur = 24; x.beginPath(); x.ellipse(ex, ey, 7, 4, 0, 0, 6.283); x.fill(); x.shadowBlur = 0; }
      x.fillStyle = `rgba(120,40,140,${0.15 + 0.1 * Math.sin(t * 8)})`; x.fillRect(0, 0, W, H);
    },
    metro(x, t, W, H, c) {
      const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, "#1a0d24"); g.addColorStop(0.5, "#7a3a2a"); g.addColorStop(1, "#1b1008");
      x.fillStyle = g; x.fillRect(0, 0, W, H);
      x.fillStyle = "rgba(255,200,130,.25)"; x.beginPath(); x.arc(W * 0.7, H * 0.2, 60, 0, 6.283); x.fill();
      const hx = W / 2, hy = H * 0.38;
      x.strokeStyle = "#ffd7a0"; x.lineWidth = 2;
      for (const l of [-1, -0.33, 0.33, 1]) { x.beginPath(); x.moveTo(hx + l * 6, hy); x.lineTo(hx + l * 200, H); x.stroke(); }
      for (let i = 0; i < 10; i++) { const p = ((i / 10 + t * 1.2) % 1) ** 2, y = hy + p * (H - hy); x.strokeStyle = `rgba(255,181,71,${p})`; x.beginPath(); x.moveTo(hx - 6 - p * 194, y); x.lineTo(hx + 6 + p * 194, y); x.stroke(); }
      const lane = Math.round(Math.sin(t * 1.1)) , bx = hx + lane * 60, jump = Math.max(0, Math.sin(t * 3)) * 18;
      x.fillStyle = c; x.shadowColor = c; x.shadowBlur = 16; x.fillRect(bx - 12, H - 62 - jump, 24, 26); x.shadowBlur = 0;
      x.fillStyle = "#fff"; x.fillRect(bx - 6, H - 56 - jump, 12, 6);
    },
  };
  const canvases = cabs.map((c) => c.querySelector("canvas"));
  const ctxs = canvases.map((cv) => cv.getContext("2d"));
  let run = !matchMedia("(prefers-reduced-motion: reduce)").matches;
  document.addEventListener("visibilitychange", () => { run = !document.hidden; if (run) requestAnimationFrame(loop); });
  const t0 = performance.now();
  function loop(now) {
    if (!run) return;
    const t = Math.max(0, now - t0) / 1000 + 1;
    GAMES.forEach((g, i) => {
      // 选中的机台每帧刷新，其余降频，省电
      if (i !== sel && Math.floor(t * 60) % 4) return;
      const x = ctxs[i];
      x.save(); scenes[g.id](x, t, 320, 240, g.color); x.restore();
    });
    requestAnimationFrame(loop);
  }
  if (run) requestAnimationFrame(loop);
  else GAMES.forEach((g, i) => scenes[g.id](ctxs[i], 1, 320, 240, g.color));

  select(sel);
  if (!fine) setTimeout(() => cabs[sel].scrollIntoView({ inline: "center", block: "nearest" }), 50);
})();
