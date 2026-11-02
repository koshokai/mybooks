(() => {
  "use strict";

  const BOOKS = window.BOOKS;
  const CATS = window.CATEGORIES;
  const RECS = window.RECOMMENDERS;
  const $ = (s, el = document) => el.querySelector(s);

  /* ---------- 配色：每本书由书名哈希得到一套稳定的颜色与样式 ---------- */
  const PALETTES = [
    ["#7a2a20", "#f6e7c8", "#e0b76a"], // 朱红
    ["#1d2b45", "#efe6d2", "#d4ad62"], // 藏青
    ["#23412f", "#f0e8d2", "#d9b26a"], // 墨绿
    ["#c9a46a", "#2a1a0a", "#7a2a20"], // 驼色
    ["#ece1c8", "#2a2118", "#a3342a"], // 米白
    ["#151515", "#e9dfc7", "#c8a15a"], // 玄黑
    ["#4a2a4f", "#f2e6d6", "#e2b96e"], // 绛紫
    ["#2d5a63", "#f3ecdc", "#f0c47a"], // 青碧
    ["#8c5a2b", "#fbf0d9", "#2a1a0a"], // 赭石
    ["#5b6b3c", "#f5eedb", "#efd28f"], // 橄榄
    ["#9b3b3b", "#fff3df", "#f2d08c"], // 胭脂
    ["#3b3f52", "#ece4d3", "#b8c4d6"], // 黛灰
    ["#d8c7a6", "#3a2516", "#2d5a63"], // 宣纸
    ["#614032", "#f4e4cc", "#e6a96a"], // 栗色
  ];
  const hash = (s) => { let h = 2166136261; for (const c of s) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
  BOOKS.forEach((b) => {
    const h = hash(b.id + b.title);
    b.pal = PALETTES[h % PALETTES.length];
    b.spStyle = (h >>> 4) % 5;
    b.cvStyle = (h >>> 8) % 5;
    b.hRatio = 0.78 + ((h >>> 12) % 22) / 100; // 0.78 ~ 0.99
  });
  const byId = Object.fromEntries(BOOKS.map((b) => [b.id, b]));
  const colorVars = (b) => `--bg:${b.pal[0]};--fg:${b.pal[1]};--ac:${b.pal[2]}`;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  /* ---------- 想读（本地保存） ---------- */
  const store = {
    get() { try { return JSON.parse(localStorage.getItem("mybooks.want") || "[]"); } catch { return []; } },
    set(v) { try { localStorage.setItem("mybooks.want", JSON.stringify(v)); } catch {} },
  };
  let wants = new Set(store.get());

  /* ---------- 视图 ---------- */
  const TABS = [
    { id: "all", label: "全部藏书", en: "All Books", desc: "书房里的每一本书", filter: () => true },
    { id: "cn", label: "华语作者", en: "Chinese Authors", desc: "中文写作者的文字与山河", filter: (b) => b.region === "cn" },
    { id: "world", label: "外国作者", en: "World Authors", desc: "来自世界各地的思想与故事", filter: (b) => b.region === "world" },
    { id: "fd", label: "樊登读书", en: "Fan Deng Picks", desc: RECS.fd.desc, filter: (b) => b.recs.includes("fd") },
    { id: "dyh", label: "董宇辉推荐", en: "Dong Yuhui Picks", desc: RECS.dyh.desc, filter: (b) => b.recs.includes("dyh") },
    { id: "classic", label: "经典必读", en: "Classics", desc: RECS.classic.desc, filter: (b) => b.recs.includes("classic") },
    { id: "want", label: "♥ 我的想读", en: "Want to Read", desc: "点开一本书，标记“想读”就会出现在这里", filter: (b) => wants.has(b.id) },
  ];
  const state = { tab: "all", q: "" };

  /* ---------- 开场 ---------- */
  function initSplash() {
    // 漂浮的光尘
    const dust = $(".dust");
    for (let i = 0; i < 26; i++) {
      const s = document.createElement("span");
      s.style.left = Math.random() * 100 + "%";
      s.style.top = 60 + Math.random() * 50 + "%";
      s.style.animationDuration = 8 + Math.random() * 10 + "s";
      s.style.animationDelay = -Math.random() * 15 + "s";
      s.style.transform = `scale(${0.5 + Math.random()})`;
      dust.appendChild(s);
    }
    // 门洞里的小书脊
    const pick = { cn: (b) => b.region === "cn", world: (b) => b.region === "world", lists: (b) => b.recs.includes("fd") || b.recs.includes("dyh") };
    document.querySelectorAll("[data-mini]").forEach((el) => {
      const list = BOOKS.filter(pick[el.dataset.mini]).slice(0, 12);
      el.innerHTML = list.map((b, i) => `<i style="background:${b.pal[0]};height:${50 + ((hash(b.id) >> 3) % 40)}%;${i % 3 === 0 ? `border-top:3px solid ${b.pal[2]}` : ""}"></i>`).join("");
    });
    $('[data-count="cn"]').textContent = `${BOOKS.filter(pick.cn).length} 册`;
    $('[data-count="world"]').textContent = `${BOOKS.filter(pick.world).length} 册`;

    document.querySelectorAll("[data-enter]").forEach((btn) =>
      btn.addEventListener("click", () => {
        const t = btn.dataset.enter;
        enter(t === "lists" ? "fd" : t);
      })
    );
  }

  function enter(tab) {
    state.tab = tab;
    const splash = $("#splash");
    splash.classList.add("leaving");
    $("#app").hidden = false;
    render();
    setTimeout(() => (splash.hidden = true), 800);
    history.replaceState(null, "", "#" + tab);
  }

  function backHome() {
    const splash = $("#splash");
    splash.hidden = false;
    requestAnimationFrame(() => splash.classList.remove("leaving"));
    history.replaceState(null, "", location.pathname);
  }

  /* ---------- 渲染 ---------- */
  function renderTabs() {
    $("#tabs").innerHTML = TABS.map((t) => {
      const n = BOOKS.filter(t.filter).length;
      return `<button class="tab ${t.id === state.tab && !state.q ? "active" : ""}" data-tab="${t.id}">${t.label}<span class="n">${n}</span></button>`;
    }).join("");
  }

  function currentList() {
    if (state.q) {
      const q = state.q.toLowerCase();
      return BOOKS.filter((b) => [b.title, b.author, b.orig || "", b.country].some((s) => s.toLowerCase().includes(q)));
    }
    return BOOKS.filter(TABS.find((t) => t.id === state.tab).filter);
  }

  function renderHero(list) {
    const t = TABS.find((x) => x.id === state.tab);
    const title = state.q ? `“${esc(state.q)}”` : t.label.replace("♥ ", "");
    const en = state.q ? "Search" : t.en;
    const desc = state.q ? "搜索结果" : t.desc;
    $("#hero").innerHTML = `
      <div><h2>${title}<em>${en}</em></h2><p>${esc(desc)}</p></div>
      <div class="stat"><b>${list.length}</b>VOLUMES</div>`;
  }

  function spineSize(b) {
    const shelfH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--shelf-h")) || 210;
    const small = shelfH < 200;
    const w = Math.round(Math.max(30, Math.min(60, 22 + b.pages / 26)) * (small ? 0.86 : 1));
    const h = Math.round((shelfH - 14) * b.hRatio);
    return { w, h };
  }

  function spineHTML(b, size, extraCls = "", extraStyle = "") {
    const len = [...b.title].length;
    const avail = size.h * 0.62;
    const fs = Math.max(10, Math.min(size.w * 0.46, avail / (len * 1.14), 17));
    const author = b.author.split(/[（(]/)[0].split("、")[0];
    return `<button class="spine sp-${b.spStyle} ${extraCls}" data-id="${b.id}" title="${esc(b.title)} · ${esc(b.author)}"
      style="${colorVars(b)};--w:${size.w}px;--h:${size.h}px;--fs:${fs.toFixed(1)}px;${extraStyle}">
      <span class="s-title">${esc(b.title.replace(/[，、：]/g, ""))}</span>
      ${size.w >= 30 && size.h > 140 ? `<span class="s-author">${esc(author)}</span>` : ""}
    </button>`;
  }

  const DECORS = [
    () => `<div class="decor plant"><div class="pot"></div><div class="leaf"></div><div class="leaf"></div><div class="leaf"></div><div class="leaf"></div><div class="leaf"></div></div>`,
    () => `<div class="decor globe"><div class="arc"></div><div class="ball"></div><div class="base"></div></div>`,
    () => {
      const cs = PALETTES.slice(0, 4);
      return `<div class="decor stack">${[86, 76, 92].map((w, i) => `<i style="width:${w}%;background:${cs[(i + 1) % 4][0]}"></i>`).join("")}</div>`;
    },
  ];

  function layoutShelves(books, innerW) {
    // 贪心排书：一层放满就换下一层
    const rows = [];
    let row = [], used = 0;
    for (const b of books) {
      const size = spineSize(b);
      if (used + size.w + 2 > innerW && row.length) { rows.push({ items: row, used }); row = []; used = 0; }
      row.push({ b, size }); used += size.w + 2;
    }
    if (row.length) rows.push({ items: row, used });
    return rows;
  }

  function renderBookcase(list) {
    const bc = $("#bookcase");
    if (!list.length) {
      bc.innerHTML = `<div class="empty"><b>这一层还空着</b>${state.tab === "want" ? "去书架上挑一本，点“想读”吧" : "换个关键词试试"}</div>`;
      return;
    }
    const cs = getComputedStyle(bc);
    const innerW = bc.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - 12;

    const groups = state.q
      ? [{ name: "搜索结果", en: "RESULTS", books: list }]
      : CATS.map((c) => ({ ...c, books: list.filter((b) => b.cat === c.id) })).filter((g) => g.books.length);

    let decorIdx = 0, html = "";
    for (const g of groups) {
      html += `<section class="group"><div class="plate">${g.name}<small>${g.en}</small></div>`;
      const rows = layoutShelves(g.books, innerW);
      rows.forEach((r, ri) => {
        const free = innerW - r.used;
        const isLast = ri === rows.length - 1;
        let inner = "";
        r.items.forEach(({ b, size }, i) => {
          const leanable = isLast && i === r.items.length - 1 && free > size.h * 0.25 && r.items.length > 2;
          inner += leanable ? spineHTML(b, size, "lean", `--lean:${6 + (hash(b.id) % 5)}deg;margin-right:${Math.round(size.h * 0.16)}px`) : spineHTML(b, size);
        });
        if (isLast && free > 120) inner += `<span style="flex:1"></span>` + DECORS[decorIdx++ % DECORS.length]();
        else if (isLast && free > 30) inner += `<div class="decor bookend"></div>`;
        html += `<div class="shelf"><div class="shelf-books">${inner}</div><div class="plank"></div></div>`;
      });
      html += `</section>`;
    }
    bc.innerHTML = html;
  }

  function render() {
    const list = currentList();
    renderTabs();
    renderHero(list);
    renderBookcase(list);
    $("#totalCount").textContent = BOOKS.length;
  }

  /* ---------- 详情 ---------- */
  function coverHTML(b) {
    return `<div class="cover cv-${b.cvStyle}" style="${colorVars(b)}">
      <div class="cv-art" data-ch="${esc([...b.title][0])}"></div>
      <div class="cv-author">${esc(b.author)}</div>
      <div class="cv-title">${esc(b.title)}</div>
      ${b.orig ? `<div class="cv-orig">${esc(b.orig)}</div>` : ""}
    </div>`;
  }

  let ry = -28;
  function openDetail(id) {
    const b = byId[id];
    if (!b) return;
    const d = $("#detail");
    d.classList.remove("closing");
    d.hidden = false;
    const card = $(".detail-card", d);
    card.style.cssText = colorVars(b);
    card.style.animation = "none"; void card.offsetWidth; card.style.animation = "";

    const depth = Math.max(22, Math.min(56, b.pages / 12));
    const book = $("#book3d");
    ry = -28;
    book.style.cssText = `${colorVars(b)};--bd:${depth}px;--ry:${ry}deg`;
    book.innerHTML = `
      <div class="face front">${coverHTML(b)}</div>
      <div class="face spine-f">${esc(b.title.replace(/[，、：]/g, ""))}</div>
      <div class="face pages"></div>
      <div class="face top"></div>
      <div class="face back"></div>`;
    book.classList.remove("intro"); void book.offsetWidth; book.classList.add("intro");

    const cat = CATS.find((c) => c.id === b.cat);
    const related = BOOKS.filter((x) => x.id !== b.id && (x.cat === b.cat || x.author === b.author))
      .sort((x, y) => (y.author === b.author) - (x.author === b.author) || hash(x.id + b.id) - hash(y.id + b.id))
      .slice(0, 8);
    const on = wants.has(b.id);
    $("#info").innerHTML = `
      <div class="meta">
        <span class="chip">${b.region === "cn" ? "华语" : "外国"} · ${esc(b.country)}</span>
        <span class="chip">${esc(cat.name)}</span>
        <span class="chip">${b.year} 年</span>
        <span class="chip">约 ${b.pages} 页</span>
      </div>
      <h3>${esc(b.title)}</h3>
      ${b.orig ? `<div class="orig">${esc(b.orig)}</div>` : ""}
      <div class="by">作者　<b>${esc(b.author)}</b></div>
      <div class="recs">${b.recs.map((r) => `<span class="rec rec-${r}">${RECS[r].name}</span>`).join("")}</div>
      <blockquote class="quote"><small>${b.line.q ? "书中金句" : "一句话读懂"}</small>${esc(b.line.q || b.line.s)}</blockquote>
      <p class="intro">${esc(b.intro)}</p>
      <div class="actions">
        <button class="btn btn-line ${on ? "on" : ""}" id="wantBtn">${on ? "♥ 已想读" : "♡ 想读"}</button>
        <a class="btn btn-gold" href="https://search.douban.com/book/subject_search?search_text=${encodeURIComponent(b.title)}" target="_blank" rel="noopener">去豆瓣看看 ↗</a>
      </div>
      ${related.length ? `<div class="related"><h4>同 架 好 书</h4><div class="related-row">
        ${related.map((x) => `<button class="mini" data-open="${x.id}">${coverHTML(x)}<span>${esc(x.title)}</span></button>`).join("")}
      </div></div>` : ""}`;
    $("#info").scrollTop = 0;
    card.scrollTop = 0;
    document.body.style.overflow = "hidden";
    history.replaceState(null, "", "#book/" + b.id);

    $("#wantBtn").onclick = (e) => {
      wants.has(b.id) ? wants.delete(b.id) : wants.add(b.id);
      store.set([...wants]);
      const now = wants.has(b.id);
      e.currentTarget.classList.toggle("on", now);
      e.currentTarget.textContent = now ? "♥ 已想读" : "♡ 想读";
      renderTabs();
    };
  }

  function closeDetail() {
    const d = $("#detail");
    if (d.hidden) return;
    d.classList.add("closing");
    setTimeout(() => { d.hidden = true; d.classList.remove("closing"); }, 330);
    document.body.style.overflow = "";
    history.replaceState(null, "", "#" + state.tab);
    render(); // 想读状态可能变化
  }

  // 拖动旋转 3D 书
  function initDrag() {
    const stage = $("#stage"), book = $("#book3d");
    let startX = null, base = 0;
    stage.addEventListener("pointerdown", (e) => { startX = e.clientX; base = ry; book.classList.remove("intro"); stage.setPointerCapture(e.pointerId); });
    stage.addEventListener("pointermove", (e) => {
      if (startX === null) return;
      ry = Math.max(-180, Math.min(90, base + (e.clientX - startX) * 0.6));
      book.style.setProperty("--ry", ry + "deg");
    });
    const end = () => { startX = null; };
    stage.addEventListener("pointerup", end);
    stage.addEventListener("pointercancel", end);
  }

  /* ---------- 随机一本 ---------- */
  function randomBook() {
    const list = currentList().length ? currentList() : BOOKS;
    const b = list[Math.floor(Math.random() * list.length)];
    const el = document.querySelector(`.spine[data-id="${b.id}"]`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("pulse");
      setTimeout(() => { el.classList.remove("pulse"); openDetail(b.id); }, 1300);
    } else openDetail(b.id);
  }

  /* ---------- 事件 ---------- */
  function bind() {
    $("#tabs").addEventListener("click", (e) => {
      const t = e.target.closest("[data-tab]");
      if (!t) return;
      state.tab = t.dataset.tab; state.q = ""; $("#searchInput").value = "";
      history.replaceState(null, "", "#" + state.tab);
      render();
    });
    $("#bookcase").addEventListener("click", (e) => {
      const s = e.target.closest(".spine");
      if (s) openDetail(s.dataset.id);
    });
    $("#info").addEventListener("click", (e) => {
      const m = e.target.closest("[data-open]");
      if (m) openDetail(m.dataset.open);
    });
    $("#detail").addEventListener("click", (e) => { if (e.target.closest("[data-close]")) closeDetail(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeDetail(); });
    let timer;
    $("#searchInput").addEventListener("input", (e) => {
      clearTimeout(timer);
      timer = setTimeout(() => { state.q = e.target.value.trim(); render(); }, 150);
    });
    $("#randomBtn").addEventListener("click", randomBook);
    $("#homeBtn").addEventListener("click", backHome);
    let rw = innerWidth;
    addEventListener("resize", () => { if (Math.abs(innerWidth - rw) > 20) { rw = innerWidth; renderBookcase(currentList()); } });
  }

  /* ---------- 启动 ---------- */
  initSplash();
  initDrag();
  bind();
  // 支持直接通过链接进入，例如 #cn、#book/walden
  const h = location.hash.slice(1);
  if (h.startsWith("book/") && byId[h.slice(5)]) { enter("all"); openDetail(h.slice(5)); }
  else if (TABS.some((t) => t.id === h)) enter(h);
})();
