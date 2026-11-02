(() => {
  "use strict";

  const WORLDS = [
    { id: "gallery", glyph: "画", name: "画廊", en: "The Open Gallery", tag: "艺术 · 世界名画", color: "#e3b866", deep: "#2a1d0c",
      desc: "七个主题展厅，数百幅公有领域世界名画。在挂满画框的长廊里漫步，按颜色看画，把喜欢的挂进你的私人展厅。",
      stats: [["艺术", 98], ["宁静", 82], ["探索", 74]], href: "worlds/gallery/" },
    { id: "cosmos", glyph: "星", name: "星海", en: "The Star Sea", tag: "深空 · 太阳系 · 星系", color: "#86a8ff", deep: "#070b1f",
      desc: "从深空一路飞进太阳系。点开每颗行星的角色档案，再退到银河之外，看看我们在哪里。深邃，浩瀚，无边。",
      stats: [["深邃", 99], ["探索", 95], ["震撼", 92]], href: "worlds/cosmos/" },
    { id: "flora", glyph: "植", name: "植物", en: "Flora", tag: "世界之树 · 四季", color: "#86e3a9", deep: "#06180f",
      desc: "一棵随春夏秋冬变换的世界之树，周围漂浮着十二种植物。每一株都像游戏角色，可以转动、查看属性与故事。",
      stats: [["生机", 98], ["治愈", 94], ["奇幻", 86]], href: "worlds/flora/" },
    { id: "colors", glyph: "色", name: "传统色", en: "Chinese Colors", tag: "月白 · 天青 · 胭脂", color: "#e0685a", deep: "#1f0b0a",
      desc: "月白、天青、胭脂、黛蓝……走进中国传统色。每一种颜色都会铺满整个屏幕，带着它的名字、出处与温度。",
      stats: [["美感", 97], ["文化", 95], ["灵感", 90]], href: "worlds/colors/" },
    { id: "game", glyph: "游", name: "游戏厅", en: "Wanxiang Arcade", tag: "五款原创游戏 · 共享星尘", color: "#ff7ad9", deep: "#1a0718",
      desc: "一座霓虹游戏厅，五台原创游戏机：奇幻远征、飞船竞速、引力解谜、空间站潜行、星环列车跑酷。所有游戏共用一个星尘账户。",
      stats: [["趣味", 99], ["刺激", 95], ["上瘾", 97]], href: "worlds/arcade/" },
    { id: "books", glyph: "书", name: "书房", en: "The Library", tag: "拟真书架 · 名家书单", color: "#d9b26a", deep: "#1c120a",
      desc: "一面像真的一样的书墙，六十多本好书，樊登读书与董宇辉推荐的书单。抽出一本，转一转，读一句。",
      stats: [["知识", 95], ["宁静", 90], ["温度", 86]], href: "worlds/books/" },
  ];

  const $ = (s) => document.querySelector(s);
  const isReady = (w) => (window.WX_READY || {})[w.id] !== false;
  const roster = $("#roster");
  const store = { get() { try { return +localStorage.getItem("wx.sel") || 0; } catch { return 0; } }, set(v) { try { localStorage.setItem("wx.sel", v); } catch {} } };
  let sel = Math.min(store.get(), WORLDS.length - 1);

  /* ---------- 每个世界的卡面场景（纯 CSS 元素） ---------- */
  const rnd = (a, b) => a + Math.random() * (b - a);
  function scene(w) {
    switch (w.id) {
      case "gallery":
        return `<div class="sc sc-gallery"><i class="beam"></i><i class="pf p1"></i><i class="pf p2"></i><i class="pf p3"></i></div>`;
      case "cosmos":
        return `<div class="sc sc-cosmos"><i class="stars s1"></i><i class="stars s2"></i><i class="neb"></i><i class="planet"><i class="ring"></i></i></div>`;
      case "flora":
        return `<div class="sc sc-flora"><i class="ph p1"></i><i class="ph p2"></i><i class="ph p3"></i><i class="glow"></i>${Array.from({ length: 14 }, () =>
          `<i class="leaf" style="left:${rnd(0, 100)}%;animation-duration:${rnd(7, 14)}s;animation-delay:${-rnd(0, 14)}s;--r:${rnd(-180, 180)}deg;--s:${rnd(0.6, 1.3)}"></i>`).join("")}
          ${Array.from({ length: 18 }, () => `<i class="fly" style="left:${rnd(5, 95)}%;top:${rnd(10, 90)}%;animation-delay:${-rnd(0, 6)}s;animation-duration:${rnd(4, 8)}s"></i>`).join("")}</div>`;
      case "colors":
        return `<div class="sc sc-colors"><i class="ink k1"></i><i class="ink k2"></i><i class="ink k3"></i><i class="ink k4"></i></div>`;
      case "game":
        return `<div class="sc sc-game"><i class="grid"></i><i class="orb o1"></i><i class="orb o2"></i><i class="track"><i class="comet"></i></i></div>`;
      case "books":
        return `<div class="sc sc-books">${["#7a2a20", "#1d2b45", "#c9a46a", "#23412f", "#ece1c8", "#4a2a4f", "#2d5a63", "#9b3b3b", "#151515", "#8c5a2b"].map((c, i) =>
          `<i class="sp" style="background:${c};height:${58 + ((i * 37) % 30)}%;width:${9 + ((i * 13) % 6)}%"></i>`).join("")}<i class="shelf"></i></div>`;
    }
    return "";
  }

  roster.innerHTML = WORLDS.map((w, i) => `
    <article class="card ${isReady(w) ? "" : "soon"}" role="option" tabindex="0" data-i="${i}" style="--c:${w.color};--deep:${w.deep};animation-delay:${0.12 + i * 0.07}s">
      ${scene(w)}
      <div class="shade"></div>
      <div class="glyph-big">${w.glyph}</div>
      <div class="collapsed"><b>${w.glyph}</b><span>${w.name}</span>${isReady(w) ? "" : '<em class="soon-tag">建设中</em>'}</div>
      <div class="detail">
        <div class="tag">${String(i + 1).padStart(2, "0")} · ${w.tag}${isReady(w) ? "" : ' <em class="soon-tag">建设中</em>'}</div>
        <h2>${w.name}<em>${w.en}</em></h2>
        <p>${w.desc}</p>
        <ul class="stats">${w.stats.map(([k, v]) => `<li><span>${k}</span><i><b style="--v:${v}%"></b></i><em>${v}</em></li>`).join("")}</ul>
        ${isReady(w) ? `<a class="enter" href="${w.href}" data-enter="${i}">进入世界<span>→</span></a>` : `<span class="enter disabled" aria-disabled="true">正在建造 · 敬请期待</span>`}
      </div>
    </article>`).join("");
  $("#total").textContent = String(WORLDS.length).padStart(2, "0");

  const cards = [...roster.children];
  function select(i, fromUser) {
    sel = (i + WORLDS.length) % WORLDS.length;
    cards.forEach((c, k) => { c.classList.toggle("active", k === sel); c.setAttribute("aria-selected", k === sel); });
    const w = WORLDS[sel];
    document.documentElement.style.setProperty("--accent", w.color);
    document.documentElement.style.setProperty("--deep", w.deep);
    $("#ghost").textContent = w.glyph;
    $("#idx").textContent = String(sel + 1).padStart(2, "0");
    fx.setColor(w.color);
    store.set(sel);
    if (fromUser && matchMedia("(max-width: 760px)").matches) {
      setTimeout(() => cards[sel].scrollIntoView({ behavior: "smooth", block: "nearest" }), 380);
    }
  }

  function enter(i) {
    const w = WORLDS[i];
    if (!isReady(w)) { const c = cards[i]; c.classList.remove("nudge"); void c.offsetWidth; c.classList.add("nudge"); return; }
    const card = cards[i].getBoundingClientRect();
    const warp = $("#warp");
    warp.style.setProperty("--x", card.left + card.width / 2 + "px");
    warp.style.setProperty("--y", card.top + card.height / 2 + "px");
    warp.style.setProperty("--c", w.color);
    warp.style.setProperty("--deep", w.deep);
    $("#warpGlyph").textContent = w.glyph;
    warp.classList.add("go");
    setTimeout(() => (location.href = w.href), 820);
  }
  // 从子世界返回时（bfcache）撤掉转场
  addEventListener("pageshow", () => $("#warp").classList.remove("go"));

  const canHover = matchMedia("(hover: hover) and (pointer: fine)").matches;
  roster.addEventListener("mouseover", (e) => {
    if (!canHover) return;
    const c = e.target.closest(".card");
    if (c && +c.dataset.i !== sel) select(+c.dataset.i);
  });
  roster.addEventListener("click", (e) => {
    const c = e.target.closest(".card");
    if (!c) return;
    const i = +c.dataset.i;
    e.preventDefault();
    if (i === sel && (canHover || e.target.closest(".enter") || c.classList.contains("active"))) enter(i);
    else select(i, true);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight" || e.key === "ArrowDown") { select(sel + 1, true); e.preventDefault(); }
    if (e.key === "ArrowLeft" || e.key === "ArrowUp") { select(sel - 1, true); e.preventDefault(); }
    if (e.key === "Enter" || e.key === " ") { enter(sel); e.preventDefault(); }
  });

  /* ---------- 背景粒子：颜色随选中的世界变化 ---------- */
  const fx = (() => {
    const cv = $("#fx"), ctx = cv.getContext("2d");
    let W, H, dpr, parts = [], target = [255, 255, 255], cur = [255, 255, 255], mx = 0, my = 0, running = true;
    const toRgb = (h) => [1, 3, 5].map((k) => parseInt(h.slice(k, k + 2), 16));
    function resize() {
      dpr = Math.min(2, devicePixelRatio || 1);
      W = cv.width = innerWidth * dpr; H = cv.height = innerHeight * dpr;
      cv.style.width = innerWidth + "px"; cv.style.height = innerHeight + "px";
      const n = Math.round(Math.min(140, (innerWidth * innerHeight) / 9000));
      parts = Array.from({ length: n }, () => ({ x: Math.random() * W, y: Math.random() * H, z: Math.random(), vx: (Math.random() - 0.5) * 0.15, vy: -0.1 - Math.random() * 0.35, tw: Math.random() * 6.28 }));
    }
    addEventListener("resize", resize);
    addEventListener("pointermove", (e) => { mx = e.clientX / innerWidth - 0.5; my = e.clientY / innerHeight - 0.5; });
    document.addEventListener("visibilitychange", () => { running = !document.hidden; if (running) requestAnimationFrame(loop); });
    resize();
    let t = 0;
    // 预先画好一张光点贴图，颜色变化时才重画（避免每帧为每个粒子新建渐变）
    const sprite = document.createElement("canvas");
    sprite.width = sprite.height = 64;
    const sctx = sprite.getContext("2d");
    let spriteKey = "";
    function paintSprite() {
      const key = cur.map((v) => v | 0).join(",");
      if (key === spriteKey) return;
      spriteKey = key;
      sctx.clearRect(0, 0, 64, 64);
      const g = sctx.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0, `rgba(${key},1)`);
      g.addColorStop(1, `rgba(${key},0)`);
      sctx.fillStyle = g;
      sctx.fillRect(0, 0, 64, 64);
    }
    function loop() {
      if (!running) return;
      t += 0.016;
      for (let k = 0; k < 3; k++) cur[k] += (target[k] - cur[k]) * 0.05;
      paintSprite();
      ctx.clearRect(0, 0, W, H);
      ctx.globalCompositeOperation = "lighter";
      for (const p of parts) {
        p.x += p.vx * dpr * (0.4 + p.z); p.y += p.vy * dpr * (0.4 + p.z);
        if (p.y < -10) { p.y = H + 10; p.x = Math.random() * W; }
        if (p.x < -10) p.x = W + 10; if (p.x > W + 10) p.x = -10;
        const px = p.x + mx * 30 * p.z * dpr, py = p.y + my * 30 * p.z * dpr;
        const r = (0.6 + p.z * 1.8) * dpr * 5;
        ctx.globalAlpha = (0.25 + 0.55 * p.z) * (0.6 + 0.4 * Math.sin(t * 2 + p.tw));
        ctx.drawImage(sprite, px - r, py - r, r * 2, r * 2);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
      requestAnimationFrame(loop);
    }
    if (!matchMedia("(prefers-reduced-motion: reduce)").matches) requestAnimationFrame(loop);
    return { setColor(h) { target = toRgb(h); } };
  })();

  select(sel);
})();
