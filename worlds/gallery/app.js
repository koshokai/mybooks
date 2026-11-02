(() => {
  "use strict";

  /* =======================================================
   * 数据层：芝加哥艺术博物馆开放接口（只取公有领域作品）
   * ======================================================= */
  const API = "https://api.artic.edu/api/v1";
  const IIIF = (id, w) => `https://www.artic.edu/iiif/2/${id}/full/${w},/0/default.jpg`;
  const FIELDS = "id,title,artist_title,artist_display,date_display,image_id,thumbnail,medium_display,dimensions,place_of_origin,artwork_type_title,is_boosted";
  const CACHE_V = "og.v1.";
  const CACHE_TTL = 7 * 864e5;
  const ROOMS = window.ROOMS;
  const roomById = Object.fromEntries(ROOMS.map((r) => [r.id, r]));

  const $ = (s, el = document) => el.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const hash = (s) => { let h = 2166136261; for (const c of String(s)) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const ls = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  };

  // 请求队列：控制并发，避免触发接口限流（约 60 次/分钟）
  const queue = [];
  let active = 0;
  function apiGet(url) {
    return new Promise((resolve, reject) => { queue.push({ url, resolve, reject, tries: 0 }); pump(); });
  }
  async function pump() {
    if (active >= 3 || !queue.length) return;
    const job = queue.shift();
    active++;
    try {
      const res = await fetch(job.url);
      if (res.status === 429 && job.tries < 2) { job.tries++; await sleep(4000); queue.unshift(job); }
      else if (!res.ok) job.reject(new Error("HTTP " + res.status));
      else job.resolve(await res.json());
    } catch (e) { job.reject(e); }
    await sleep(250);
    active--;
    pump();
  }

  function normalize(d, room) {
    const lines = (d.artist_display || "").split("\n");
    return {
      id: d.id, title: d.title || "Untitled", artist: d.artist_title || lines[0] || "佚名",
      life: lines.slice(1).join(" "), date: d.date_display || "", img: d.image_id,
      w: d.thumbnail?.width || 4, h: d.thumbnail?.height || 3, lqip: d.thumbnail?.lqip || "",
      medium: d.medium_display || "", dims: (d.dimensions || "").split(";")[0], place: d.place_of_origin || "",
      type: d.artwork_type_title || "", boosted: !!d.is_boosted, room: room.id,
    };
  }

  const roomData = {};      // id -> items
  const roomLoading = {};   // id -> promise
  function loadRoom(room) {
    if (roomData[room.id]) return Promise.resolve(roomData[room.id]);
    if (roomLoading[room.id]) return roomLoading[room.id];
    const cached = ls.get(CACHE_V + room.id);
    if (cached && Date.now() - cached.t < CACHE_TTL && cached.items?.length) {
      roomData[room.id] = cached.items;
      return Promise.resolve(cached.items);
    }
    roomLoading[room.id] = (async () => {
      const results = await Promise.allSettled(room.artists.map((a) =>
        apiGet(`${API}/artworks/search?q=${encodeURIComponent(a.q)}&query%5Bterm%5D%5Bis_public_domain%5D=true&limit=40&fields=${FIELDS}`)
          .then((j) => ({ a, data: j.data || [] }))
      ));
      const seen = new Set();
      const out = [];
      const perArtist = room.artists[0].match ? Math.max(3, Math.ceil(30 / room.artists.length) + 1) : 8;
      for (const r of results) {
        if (r.status !== "fulfilled") continue;
        const { a, data } = r.value;
        let list = data.filter((d) => d.image_id && d.thumbnail && !seen.has(d.id));
        if (room.types) list = list.filter((d) => room.types.includes(d.artwork_type_title));
        if (a.match) list = list.filter((d) => (d.artist_title || d.artist_display || "").toLowerCase().includes(a.match.toLowerCase()));
        if (room.place) list = list.filter((d) => (d.place_of_origin || "").includes(room.place));
        list.sort((x, y) => y.is_boosted - x.is_boosted);
        for (const d of list.slice(0, perArtist)) { seen.add(d.id); out.push({ ...normalize(d, room), group: a.cn ? a.match : null }); }
      }
      if (!out.length) {
        delete roomLoading[room.id];
        throw new Error(results.every((r) => r.status === "rejected") ? "network" : "empty");
      }
      roomData[room.id] = out;
      ls.set(CACHE_V + room.id, { t: Date.now(), items: out });
      return out;
    })();
    return roomLoading[room.id];
  }
  const allLoaded = () => ROOMS.flatMap((r) => roomData[r.id] || []);

  const cnName = (artist) => {
    for (const [k, v] of Object.entries(window.ARTIST_CN)) if (artist && artist.includes(k)) return v;
    return "";
  };

  /* ---------- 从模糊缩略图里提取色板（不依赖跨域图片） ---------- */
  const palCache = new Map();
  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
    if (max === min) return [0, 0, l];
    const d = max - min, s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [h * 60, s, l];
  }
  const hex = (r, g, b) => "#" + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
  function palette(art) {
    if (palCache.has(art.id)) return palCache.get(art.id);
    const p = new Promise((resolve) => {
      if (!art.lqip) return resolve(null);
      const im = new Image();
      im.onload = () => {
        try {
          const c = document.createElement("canvas");
          const W = (c.width = Math.max(1, Math.min(32, im.naturalWidth))), H = (c.height = Math.max(1, Math.min(32, im.naturalHeight)));
          const x = c.getContext("2d", { willReadFrequently: true });
          x.drawImage(im, 0, 0, W, H);
          const px = x.getImageData(0, 0, W, H).data;
          const buckets = new Map();
          for (let i = 0; i < px.length; i += 4) {
            const k = (px[i] >> 5) * 64 + (px[i + 1] >> 5) * 8 + (px[i + 2] >> 5);
            const b = buckets.get(k) || { n: 0, r: 0, g: 0, b: 0 };
            b.n++; b.r += px[i]; b.g += px[i + 1]; b.b += px[i + 2];
            buckets.set(k, b);
          }
          const cols = [...buckets.values()].map((b) => {
            const r = b.r / b.n, g = b.g / b.n, bl = b.b / b.n;
            const [h, s, l] = rgbToHsl(r, g, bl);
            return { r, g, b: bl, n: b.n, h, s, l };
          }).sort((a, b) => b.n - a.n);
          const picked = [];
          for (const c2 of cols) {
            if (picked.every((p2) => Math.abs(p2.r - c2.r) + Math.abs(p2.g - c2.g) + Math.abs(p2.b - c2.b) > 60)) picked.push(c2);
            if (picked.length === 5) break;
          }
          // 主色：出现得多且足够鲜艳
          const dom = [...cols].sort((a, b) => b.n * (0.25 + b.s * (1 - Math.abs(b.l - 0.5))) - a.n * (0.25 + a.s * (1 - Math.abs(a.l - 0.5))))[0];
          resolve({ colors: picked.map((c2) => ({ hex: hex(c2.r, c2.g, c2.b), l: c2.l })), h: dom.h, s: dom.s, l: dom.l, avg: hex(cols[0].r, cols[0].g, cols[0].b) });
        } catch { resolve(null); }
      };
      im.onerror = () => resolve(null);
      im.src = art.lqip;
    });
    palCache.set(art.id, p);
    return p;
  }

  /* ---------- 收藏 ---------- */
  let favs = ls.get(CACHE_V + "fav", []);
  const isFav = (id) => favs.some((f) => f.id === id);
  function toggleFav(art) {
    favs = isFav(art.id) ? favs.filter((f) => f.id !== art.id) : [art, ...favs];
    ls.set(CACHE_V + "fav", favs);
    updateFavCount();
    toast(isFav(art.id) ? "已挂进你的私人展厅 ♥" : "已从私人展厅取下");
    return isFav(art.id);
  }
  const updateFavCount = () => ($("#favCount").textContent = favs.length || "");

  let toastT;
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg; t.classList.add("show");
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("show"), 1800);
  }

  /* =======================================================
   * 大厅
   * ======================================================= */
  const lobby = $("#lobby");
  let dailyArt = null;
  async function initLobby() {
    setTimeout(() => lobby.classList.add("lit"), 250);
    try {
      const items = await loadRoom(ROOMS[0]);
      const pool = items.filter((a) => a.boosted).length >= 3 ? items.filter((a) => a.boosted) : items;
      const day = Math.floor(Date.now() / 864e5);
      dailyArt = pool[day % pool.length];
      const canvas = $(".daily .canvas");
      canvas.style.setProperty("--ar", (dailyArt.w / dailyArt.h).toFixed(3));
      canvas.style.backgroundImage = dailyArt.lqip ? `url(${dailyArt.lqip})` : "";
      canvas.innerHTML = `<img alt="${esc(dailyArt.title)}" />`;
      const img = $("img", canvas);
      img.onload = () => img.classList.add("loaded");
      img.src = IIIF(dailyArt.img, 843);
      const cn = cnName(dailyArt.artist);
      $("#dailyCap").innerHTML = `<i>${esc(dailyArt.title)}</i><br />${esc(cn || dailyArt.artist)} · ${esc(dailyArt.date)}`;
    } catch {
      $(".daily .ph").textContent = "画作暂时无法加载，请检查网络";
    }
  }
  $("#daily").addEventListener("click", () => { if (dailyArt) openViewer(roomData[dailyArt.room], roomData[dailyArt.room].indexOf(dailyArt)); });

  function leaveLobby() {
    if (lobby.hidden) return;
    lobby.classList.add("leaving");
    $("#app").hidden = false;
    setTimeout(() => (lobby.hidden = true), 900);
  }
  function showLobby() {
    lobby.hidden = false;
    requestAnimationFrame(() => lobby.classList.remove("leaving"));
    history.replaceState(null, "", location.pathname);
  }

  /* =======================================================
   * 路由
   * ======================================================= */
  const view = $("#view");
  let cleanup = null;
  function go(name, arg) {
    if (name === "lobby") return showLobby();
    if (name === "random") return randomArt();
    leaveLobby();
    if (cleanup) { cleanup(); cleanup = null; }
    document.querySelectorAll(".nav button").forEach((b) => b.classList.toggle("active", b.dataset.go === name || (name === "room" && b.dataset.go === "map")));
    view.className = "";
    window.scrollTo(0, 0);
    if (name === "map") renderMap();
    else if (name === "room") renderHall(roomById[arg] ? roomById[arg] : ROOMS[0]);
    else if (name === "color") renderColor();
    else if (name === "fav") renderFav();
    history.replaceState(null, "", "#" + name + (arg ? "/" + arg : ""));
  }
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-go]");
    if (b) { e.preventDefault(); go(b.dataset.go, b.dataset.arg); }
  });

  /* =======================================================
   * 展厅导览
   * ======================================================= */
  function renderMap() {
    view.innerHTML = `<section class="map fade-in">
      <div class="map-head">
        <div><h2>展厅导览<em>Floor Plan</em></h2><p>七个主题展厅 · 全部为公有领域作品，可自由欣赏与使用</p></div>
      </div>
      <div class="rooms">${ROOMS.map((r, i) => `
        <button class="room-card ${r.lightWall ? "light" : ""}" style="--wall:${r.wall};animation-delay:${i * 0.06}s" data-go="room" data-arg="${r.id}">
          <span class="no">${r.no}</span>
          <div class="mini-wall" data-mini="${r.id}">${'<div class="m empty" style="width:70px"></div>'.repeat(3)}</div>
          <h3>${r.name}</h3>
          <div class="en">${r.en}</div>
          <div class="cnt" data-cnt="${r.id}">${r.artists[0].cn ? r.artists.slice(0, 4).map((a) => a.cn).join(" · ") : "立轴 · 手卷 · 册页"}</div>
        </button>`).join("")}
      </div></section>`;
    // 依次加载每个展厅，填充缩略画
    let alive = true;
    cleanup = () => (alive = false);
    (async () => {
      for (const r of ROOMS) {
        try {
          const items = await loadRoom(r);
          if (!alive) return;
          const pick = [...items].sort((a, b) => b.boosted - a.boosted).slice(0, 3);
          const el = view.querySelector(`[data-mini="${r.id}"]`);
          if (el) el.innerHTML = pick.map((a) => `<div class="m" style="width:${Math.round(96 * Math.min(1.6, Math.max(0.55, a.w / a.h)))}px;background-image:url('${IIIF(a.img, 200)}'),url(${a.lqip})"></div>`).join("");
          const cnt = view.querySelector(`[data-cnt="${r.id}"]`);
          if (cnt) cnt.textContent += ` · ${items.length} 件`;
        } catch {}
      }
    })();
  }

  /* =======================================================
   * 展厅（横向长廊）
   * ======================================================= */
  function frameFor(art, room) {
    const ar = art.w / art.h;
    if (room?.id === "ink" && ar < 0.75) return "f-scroll";
    if (art.type && art.type !== "Painting") return "f-mat";
    if (room?.lightWall) return "f-mat";
    const k = hash(art.id) % 4;
    return k < 2 ? "f-gold" : k === 2 ? "f-wood" : "f-black";
  }

  function pieceHTML(art, idx, room, H) {
    const mobile = innerWidth < 640;
    const ar = art.w / art.h;
    const maxH = H * (mobile ? 0.5 : 0.6), maxW = Math.min(innerWidth * (mobile ? 0.74 : 0.56), 860);
    let ph = maxH, pw = ph * ar;
    if (pw > maxW) { pw = maxW; ph = pw / ar; }
    const fr = frameFor(art, room);
    const cn = cnName(art.artist);
    const inner = `<div class="canvas" style="background-image:url(${art.lqip})"><img data-src="${IIIF(art.img, pw > 520 ? 1686 : 843)}" alt="${esc(art.title)}" /></div>`;
    return `<figure class="panel piece" style="--pw:${pw | 0}px;--ph:${ph | 0}px">
      <div class="spot"></div><div class="lamp"></div>
      <div class="frame ${fr}" data-idx="${idx}">${fr === "f-mat" ? `<div class="mat">${inner}</div>` : inner}</div>
      <figcaption class="label">
        <b>${esc(cn || art.artist)}</b>${cn ? `<span>${esc(art.artist)}</span>` : ""}
        <i>${esc(art.title)}</i>
        <span>${esc(art.date)}</span><span>${esc(art.medium)}</span>
        ${isFav(art.id) ? '<div class="heart">♥ 已收藏</div>' : ""}
      </figcaption>
    </figure>`;
  }

  function renderHall(room, itemsOverride) {
    const isFavHall = !!itemsOverride;
    view.innerHTML = `<section class="hall ${room.lightWall ? "light-wall" : ""} fade-in" style="--wall:${room.wall};--light:${room.light}">
      <div class="floor"></div>
      <div class="track" id="track"></div>
      <div class="hall-ui"><button class="arrow" id="hPrev" aria-label="向左">‹</button><span id="hCount"></span><div class="progress"><i id="hProg"></i></div><button class="arrow" id="hNext" aria-label="向右">›</button></div>
      <div class="state" id="hState"><div><div class="loader"></div>正在布展…</div></div>
    </section>`;
    const track = $("#track"), state = $("#hState");
    let alive = true;

    const build = (items) => {
      if (!alive) return;
      state.remove();
      const H = track.clientHeight;
      let html = `<div class="panel wall-text"><div class="no">ROOM ${room.no}</div><h2>${room.name}</h2><div class="en">${room.en}</div><p>${room.intro}</p><div class="hint">向右漫步 · ${items.length} 件作品</div></div>`;
      let lastGroup;
      items.forEach((a, i) => {
        if (!isFavHall && a.group && a.group !== lastGroup) {
          lastGroup = a.group;
          const cn = cnName(a.artist);
          html += `<div class="panel artist-plate"><small>ARTIST</small><h3>${esc(cn || a.artist)}</h3><div class="en">${esc(a.artist)}</div><div class="life">${esc(a.life)}</div></div>`;
        }
        html += pieceHTML(a, i, roomById[a.room] || room, H);
      });
      const idx = ROOMS.indexOf(room);
      const next = ROOMS[(idx + 1) % ROOMS.length];
      html += isFavHall
        ? `<div class="panel end-panel"><p>— 展 览 结 束 —</p><button class="btn btn-line" data-go="map">继续逛展厅</button></div>`
        : `<div class="panel end-panel"><p>— 本 厅 完 —</p><button class="btn btn-gold" data-go="room" data-arg="${next.id}">下一展厅：${next.name}</button><button class="btn btn-text" data-go="map">返回导览</button></div>`;
      track.innerHTML = html;

      // 懒加载
      const io = new IntersectionObserver((ents) => ents.forEach((en) => {
        if (!en.isIntersecting) return;
        const img = en.target;
        io.unobserve(img);
        img.onload = () => img.classList.add("loaded");
        img.onerror = () => { if (!img.dataset.retry) { img.dataset.retry = 1; img.src = img.dataset.src.replace(/\/1686,\//, "/843,/"); } };
        img.src = img.dataset.src;
      }), { root: track, rootMargin: "0px 900px" });
      track.querySelectorAll("img[data-src]").forEach((im) => io.observe(im));

      // 画框 3D 倾斜 + 玻璃反光
      track.addEventListener("pointermove", (e) => {
        const f = e.target.closest(".frame");
        if (!f || e.pointerType !== "mouse") return;
        const r = f.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
        f.style.transform = `rotateY(${x * 7}deg) rotateX(${-y * 7}deg) translateZ(10px)`;
        f.style.setProperty("--ga", `${100 + x * 60}deg`);
      });
      track.addEventListener("pointerout", (e) => { const f = e.target.closest(".frame"); if (f && !f.contains(e.relatedTarget)) f.style.transform = ""; });
      track.addEventListener("click", (e) => { const f = e.target.closest(".frame"); if (f) openViewer(items, +f.dataset.idx); });

      // 竖向滚轮 → 横向漫步
      track.addEventListener("wheel", (e) => {
        if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { track.scrollLeft += e.deltaY * 1.1; e.preventDefault(); }
      }, { passive: false });
      const N = items.length;
      const onScroll = () => {
        const p = track.scrollLeft / Math.max(1, track.scrollWidth - track.clientWidth);
        $("#hProg").style.width = (p * 100).toFixed(1) + "%";
        $("#hCount").textContent = `${Math.min(N, Math.round(p * (N - 1)) + 1)} / ${N}`;
      };
      track.addEventListener("scroll", onScroll, { passive: true });
      onScroll();
      const step = (d) => track.scrollBy({ left: d * track.clientWidth * 0.6, behavior: "smooth" });
      $("#hPrev").onclick = () => step(-1);
      $("#hNext").onclick = () => step(1);
      const onKey = (e) => { if ($("#viewer").hidden) { if (e.key === "ArrowRight") step(1); if (e.key === "ArrowLeft") step(-1); } };
      document.addEventListener("keydown", onKey);
      let rw = innerWidth;
      const onResize = () => { if (Math.abs(innerWidth - rw) > 40) { rw = innerWidth; const p = track.scrollLeft; build(items); track.scrollLeft = p; } };
      addEventListener("resize", onResize);
      cleanup = () => { alive = false; io.disconnect(); document.removeEventListener("keydown", onKey); removeEventListener("resize", onResize); };
    };

    cleanup = () => (alive = false);
    if (itemsOverride) {
      if (!itemsOverride.length) {
        state.innerHTML = `<div><b>私人展厅还空着</b>在任意画作的详情里点「♡ 收藏」，它就会挂到这面墙上</div>`;
        return;
      }
      build(itemsOverride);
    } else {
      loadRoom(room).then(build).catch((err) => {
        if (!alive) return;
        state.innerHTML = `<div><b>灯没能亮起来</b>${err.message === "network" ? "无法连接博物馆的开放接口，请检查网络后重试" : "这个展厅暂时没有找到作品"}<br /><button class="btn btn-line" style="margin-top:18px" data-go="room" data-arg="${room.id}">重新加载</button></div>`;
      });
    }
  }

  function renderFav() {
    renderHall({ id: "fav", no: "♥", name: "我的私人展厅", en: "Your Private Collection", wall: "#3b2a33", light: "#ffe6cc", intro: "你挑中的每一幅画，都挂在这里。这是只属于你的展览，收藏保存在本机浏览器中。", artists: [{}] }, favs);
  }

  /* =======================================================
   * 色彩漫游
   * ======================================================= */
  const HUES = [
    { name: "赤", h: 5, c: "#b8402f" }, { name: "橙", h: 30, c: "#c97a35" }, { name: "黄", h: 50, c: "#d1aa3c" },
    { name: "绿", h: 110, c: "#5f8a4c" }, { name: "青", h: 175, c: "#3f8a86" }, { name: "蓝", h: 215, c: "#3c5f9a" },
    { name: "紫", h: 280, c: "#7a5390" }, { name: "素", h: -1, c: "#bdb6a8" },
  ];
  function renderColor() {
    view.innerHTML = `<section class="colorview fade-in">
      <div class="color-top">
        <div class="wheel" id="wheel"><div class="knob" id="knob"></div><div class="center"><div><b id="hueName">彩</b><small>转动色轮</small></div></div></div>
        <div class="color-intro">
          <h2>色彩漫游<em>Wander by Color</em></h2>
          <p>不按年代，不按流派，只按颜色看画。转动色轮，或选一种颜色——<br />莫奈的蓝、梵高的黄、浮世绘的靛青，会在同一面墙上相遇。</p>
          <div class="chips">${HUES.map((h, i) => `<button class="chip" data-hue="${i}" style="--c:${h.c}"><i></i>${h.name}</button>`).join("")}</div>
          <div class="color-status" id="cStatus">正在把七个展厅的画搬过来…</div>
        </div>
      </div>
      <div class="mosaic" id="mosaic"></div>
    </section>`;
    let alive = true, current = null, items = [];
    cleanup = () => (alive = false);
    const wheel = $("#wheel"), knob = $("#knob");

    const show = async (hue, label, gray) => {
      current = { hue, gray };
      $("#hueName").textContent = label;
      view.querySelectorAll(".chip").forEach((c) => c.classList.toggle("active", HUES[c.dataset.hue].name === label));
      const scored = [];
      for (const a of items) {
        const p = await palette(a);
        if (!p) continue;
        if (gray) { if (p.s < 0.18) scored.push([p.s, a, p]); }
        else if (p.s >= 0.15) { const d = Math.min(Math.abs(p.h - hue), 360 - Math.abs(p.h - hue)); if (d < 26) scored.push([d - p.s * 10, a, p]); }
      }
      if (!alive || current.hue !== hue) return;
      scored.sort((x, y) => x[0] - y[0]);
      const list = scored.map((s) => s[1]);
      $("#mosaic").innerHTML = list.length ? scored.map(([, a, p], i) => `
        <button class="tile" data-i="${i}" style="--c:${p.avg};--ar:${(a.w / a.h).toFixed(3)};animation-delay:${Math.min(i, 20) * 0.03}s">
          <img src="${IIIF(a.img, 400)}" loading="lazy" alt="" onload="this.classList.add('loaded')" />
          <div class="cap">${esc(cnName(a.artist) || a.artist)} · <i>${esc(a.title)}</i></div>
          <div class="sw">${p.colors.map((c) => `<i style="--s:${c.hex}"></i>`).join("")}</div>
        </button>`).join("") : `<p class="color-status">这个颜色暂时没有匹配的画作，换一种试试</p>`;
      $("#mosaic").onclick = (e) => { const t = e.target.closest(".tile"); if (t) openViewer(list, +t.dataset.i); };
    };

    const setFromPoint = (e) => {
      const r = wheel.getBoundingClientRect();
      const x = e.clientX - r.left - r.width / 2, y = e.clientY - r.top - r.height / 2;
      const deg = (Math.atan2(x, -y) * 180) / Math.PI;
      const hue = (deg + 360) % 360;
      const rad = r.width / 2 - 32;
      knob.style.transform = `translate(${Math.sin((hue * Math.PI) / 180) * rad}px, ${-Math.cos((hue * Math.PI) / 180) * rad}px)`;
      knob.style.background = `hsl(${hue} 65% 50%)`;
      const near = HUES.slice(0, 7).reduce((b, h) => (Math.min(Math.abs(h.h - hue), 360 - Math.abs(h.h - hue)) < Math.min(Math.abs(b.h - hue), 360 - Math.abs(b.h - hue)) ? h : b));
      show(hue, near.name, false);
    };
    let dragging = false;
    wheel.addEventListener("pointerdown", (e) => { dragging = true; wheel.setPointerCapture(e.pointerId); setFromPoint(e); });
    wheel.addEventListener("pointermove", (e) => { if (dragging) setFromPoint(e); });
    wheel.addEventListener("pointerup", () => (dragging = false));
    view.querySelector(".chips").addEventListener("click", (e) => {
      const c = e.target.closest(".chip"); if (!c) return;
      const h = HUES[c.dataset.hue];
      if (h.h >= 0) {
        const rad = wheel.clientWidth / 2 - 32;
        knob.style.transform = `translate(${Math.sin((h.h * Math.PI) / 180) * rad}px, ${-Math.cos((h.h * Math.PI) / 180) * rad}px)`;
        knob.style.background = h.c;
      }
      show(h.h, h.name, h.h < 0);
    });

    (async () => {
      let done = 0, failed = 0;
      for (const r of ROOMS) {
        try { await loadRoom(r); } catch { failed++; }
        if (!alive) return;
        done++;
        items = allLoaded();
        $("#cStatus").textContent = done < ROOMS.length ? `正在搬画 ${done}/${ROOMS.length} 个展厅 · 已有 ${items.length} 幅` : failed === ROOMS.length ? "无法连接博物馆的开放接口，请检查网络" : `共 ${items.length} 幅画作参与漫游`;
        if (done === 1 || done === ROOMS.length) { const h = current || { hue: 215, gray: false }; show(h.hue, current ? $("#hueName").textContent : "蓝", h.gray); }
      }
    })();
    knob.style.transform = `translate(${Math.sin((215 * Math.PI) / 180) * 108}px, ${-Math.cos((215 * Math.PI) / 180) * 108}px)`;
    knob.style.background = "#3c5f9a";
  }

  /* =======================================================
   * 看画（缩放 / 拖拽 / 详情）
   * ======================================================= */
  const V = { list: [], i: 0, s: 1, x: 0, y: 0 };
  const vImg = $("#vImg"), vStage = $("#vStage"), viewer = $("#viewer");
  const applyT = () => (vImg.style.transform = `translate(-50%, -50%) translate(${V.x}px, ${V.y}px) scale(${V.s})`);
  const resetT = () => { V.s = 1; V.x = 0; V.y = 0; applyT(); };

  function openViewer(list, i) {
    if (!list?.length) return;
    V.list = list; V.i = Math.max(0, i);
    viewer.hidden = false;
    document.body.style.overflow = "hidden";
    if (innerWidth < 900) viewer.classList.remove("no-info");
    showArt();
  }
  function closeViewer() {
    viewer.hidden = true;
    document.body.style.overflow = "";
    // 刷新标签上的收藏状态
    const m = location.hash.match(/^#(room|fav)/);
    if (m && m[1] === "fav") renderFav();
  }
  let showToken = 0;
  async function showArt() {
    const a = V.list[V.i], tok = ++showToken;
    resetT();
    vImg.classList.remove("show");
    $("#vLoading").hidden = false;
    vImg.onload = () => { if (tok !== showToken) return; vImg.classList.add("show"); $("#vLoading").hidden = true; upgrade(); };
    vImg.onerror = () => { $("#vLoading").hidden = true; };
    vImg.src = IIIF(a.img, 843);
    const upgrade = () => {
      const big = new Image();
      big.onload = () => { if (tok === showToken) { vImg.onload = null; vImg.src = big.src; } };
      big.src = IIIF(a.img, 1686);
    };
    $("#vPrev").hidden = $("#vNext").hidden = V.list.length < 2;

    const cn = cnName(a.artist);
    const room = roomById[a.room];
    const fav = isFav(a.id);
    $("#vInfo").innerHTML = `
      <div class="room-tag">${room ? `ROOM ${room.no} · ${room.name}` : "THE OPEN GALLERY"}</div>
      <h2>${esc(a.title)}</h2>
      <div class="artist">${esc(cn || a.artist)}${cn || a.life ? `<small>${cn ? esc(a.artist) + "\n" : ""}${esc(a.life)}</small>` : ""}</div>
      <dl>
        ${a.date ? `<dt>年代</dt><dd>${esc(a.date)}</dd>` : ""}
        ${a.medium ? `<dt>材质</dt><dd>${esc(a.medium)}</dd>` : ""}
        ${a.dims ? `<dt>尺寸</dt><dd>${esc(a.dims)}</dd>` : ""}
        ${a.place ? `<dt>产地</dt><dd>${esc(a.place)}</dd>` : ""}
        <dt>版权</dt><dd>公有领域 · CC0</dd>
      </dl>
      <div class="palette" id="vPal"></div>
      <div class="v-actions">
        <button class="btn btn-line ${fav ? "on" : ""}" id="vFav">${fav ? "♥ 已收藏" : "♡ 收藏"}</button>
        <a class="btn btn-text" href="https://www.artic.edu/artworks/${a.id}" target="_blank" rel="noopener">博物馆原页 ↗</a>
      </div>
      <h4 style="margin-top:22px">作品解读</h4>
      <div class="desc" id="vDesc"><span style="color:var(--muted);font-family:var(--serif);font-size:13px">加载中…</span></div>`;
    $("#vFav").onclick = (e) => {
      const on = toggleFav(a);
      e.currentTarget.classList.toggle("on", on);
      e.currentTarget.textContent = on ? "♥ 已收藏" : "♡ 收藏";
    };
    palette(a).then((p) => {
      if (tok !== showToken || !p) return;
      $("#vPal").innerHTML = `<h4>画中色板 · 点击复制</h4><div class="sw">${p.colors.map((c) => `<button style="--s:${c.hex};--t:${c.l > 0.6 ? "#000" : "#fff"}" data-hex="${c.hex}"><span>${c.hex}</span></button>`).join("")}</div>`;
      $("#vPal").onclick = (e) => {
        const b = e.target.closest("[data-hex]"); if (!b) return;
        (navigator.clipboard?.writeText(b.dataset.hex) || Promise.reject()).then(() => toast(`已复制 ${b.dataset.hex}`), () => toast(b.dataset.hex));
      };
    });
    apiGet(`${API}/artworks/${a.id}?fields=description,short_description`).then((j) => {
      if (tok !== showToken) return;
      const html = j.data?.description || j.data?.short_description;
      const text = html ? new DOMParser().parseFromString(html, "text/html").body.textContent.trim() : "";
      $("#vDesc").innerHTML = text ? `${esc(text)}<div class="desc-note">英文原文 · 来自芝加哥艺术博物馆</div>` : `<span style="font-family:var(--serif);font-size:13px;color:var(--muted)">这幅作品暂无文字解读，静静地看就好。</span>`;
    }).catch(() => { if (tok === showToken) $("#vDesc").innerHTML = `<span style="font-family:var(--serif);font-size:13px;color:var(--muted)">解读暂时无法加载</span>`; });
  }
  const step = (d) => { V.i = (V.i + d + V.list.length) % V.list.length; showArt(); };
  $("#vPrev").onclick = () => step(-1);
  $("#vNext").onclick = () => step(1);
  $("#vClose").onclick = closeViewer;
  $("#vInfoBtn").onclick = () => viewer.classList.toggle("no-info");
  const zoomAt = (f, cx = 0, cy = 0) => {
    const ns = Math.min(8, Math.max(1, V.s * f));
    V.x = cx - (cx - V.x) * (ns / V.s); V.y = cy - (cy - V.y) * (ns / V.s); V.s = ns;
    if (V.s === 1) { V.x = 0; V.y = 0; }
    applyT();
  };
  $("#vZoomIn").onclick = () => zoomAt(1.6);
  $("#vZoomOut").onclick = () => zoomAt(1 / 1.6);
  const rel = (e) => { const r = vStage.getBoundingClientRect(); return [e.clientX - r.left - r.width / 2, e.clientY - r.top - r.height / 2]; };
  vStage.addEventListener("wheel", (e) => { e.preventDefault(); const [x, y] = rel(e); zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, x, y); }, { passive: false });
  vStage.addEventListener("dblclick", (e) => { const [x, y] = rel(e); V.s > 1 ? resetT() : zoomAt(2.5, x, y); });
  const pts = new Map();
  let pinch = null, swipe = null;
  vStage.addEventListener("pointerdown", (e) => {
    vStage.setPointerCapture(e.pointerId);
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), s: V.s }; swipe = null; }
    else swipe = { x: e.clientX, y: e.clientY, t: Date.now() };
  });
  vStage.addEventListener("pointermove", (e) => {
    const p = pts.get(e.pointerId); if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (pts.size === 2 && pinch) {
      const [a, b] = [...pts.values()];
      const f = (pinch.s * Math.hypot(a.x - b.x, a.y - b.y)) / pinch.d / V.s;
      zoomAt(f);
    } else if (V.s > 1) { V.x += dx; V.y += dy; applyT(); }
  });
  const up = (e) => {
    pts.delete(e.pointerId);
    if (pts.size < 2) pinch = null;
    if (swipe && V.s === 1 && pts.size === 0) {
      const dx = e.clientX - swipe.x;
      if (Math.abs(dx) > 70 && Date.now() - swipe.t < 600 && V.list.length > 1) step(dx < 0 ? 1 : -1);
    }
    if (pts.size === 0) swipe = null;
  };
  vStage.addEventListener("pointerup", up);
  vStage.addEventListener("pointercancel", up);
  document.addEventListener("keydown", (e) => {
    if (viewer.hidden) return;
    if (e.key === "Escape") closeViewer();
    if (e.key === "ArrowRight") step(1);
    if (e.key === "ArrowLeft") step(-1);
  });

  /* ---------- 随机遇见 ---------- */
  async function randomArt() {
    let pool = allLoaded();
    if (!pool.length) {
      toast("正在去展厅里挑一幅…");
      const r = ROOMS[Math.floor(Math.random() * ROOMS.length)];
      try { await loadRoom(r); } catch { return toast("无法连接博物馆，请检查网络"); }
      pool = allLoaded();
    }
    const a = pool[Math.floor(Math.random() * pool.length)];
    openViewer(roomData[a.room], roomData[a.room].indexOf(a));
  }

  /* ---------- 启动 ---------- */
  updateFavCount();
  initLobby();
  const [h, arg] = location.hash.slice(1).split("/");
  if (["map", "room", "color", "fav"].includes(h)) { lobby.hidden = true; $("#app").hidden = false; go(h, arg); }
})();
