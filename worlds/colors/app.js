// 色 · 中国传统色 —— 交互
import { COLORS, FAMILIES, SEASONS, SOLAR_TERMS } from './data.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const pad = (n) => String(n).padStart(2, '0');
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const DPR = Math.min(window.devicePixelRatio || 1, 2);
const canHover = matchMedia('(hover: hover)').matches;

/* =========================================================
   色彩计算
   ========================================================= */
const hexToRgb = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const rgbToHex = (rgb) => '#' + rgb.map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('').toUpperCase();
function rgbToHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return [h, s, l];
}
function hslToRgb(h, s, l) {
  h = ((h % 360) + 360) % 360 / 360;
  if (s === 0) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const f = (t) => { t = (t + 1) % 1; if (t < 1 / 6) return p + (q - p) * 6 * t; if (t < 1 / 2) return q; if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6; return p; };
  return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
}
function toCmyk([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const k = 1 - Math.max(r, g, b);
  if (k >= 1) return [0, 0, 0, 100];
  return [(1 - r - k) / (1 - k), (1 - g - k) / (1 - k), (1 - b - k) / (1 - k), k].map((v) => Math.round(v * 100));
}
function lum([r, g, b]) {
  const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const rgba = (rgb, a) => `rgba(${rgb.map(Math.round).join(',')},${a})`;
const chroma = (c) => c.hsl[1] * (1 - Math.abs(2 * c.hsl[2] - 1));
const hueDist = (a, b) => { const d = Math.abs(((a - b) % 360 + 360) % 360); return Math.min(d, 360 - d) / 180; };

const FAM = Object.fromEntries(FAMILIES.map((f) => [f.id, f]));
const SEA = Object.fromEntries(SEASONS.map((s) => [s.id, s]));

COLORS.forEach((c, i) => {
  c.i = i;
  c.rgb = hexToRgb(c.h);
  c.hsl = rgbToHsl(c.rgb);
  c.lum = lum(c.rgb);
  // 与深墨/浅纸的对比度，取较高者
  const cDark = (c.lum + 0.05) / (0.012 + 0.05), cLight = (0.88 + 0.05) / (c.lum + 0.05);
  c.light = cLight > cDark; // 背景深 → 用浅色字
  const ink = c.light ? mix(c.rgb, [250, 246, 238], 0.9) : mix(c.rgb, [14, 10, 8], 0.84);
  c.ink = rgbToHex(ink);
  c.inkRgb = ink;
  c.chroma = chroma(c);
});

/* =========================================================
   状态
   ========================================================= */
const state = { list: COLORS.slice(), cur: null, fam: null, season: null, atlasMode: 'wheel' };
const track = $('#track'), rail = $('#rail'), root = document.documentElement;
const metaTheme = $('meta[name="theme-color"]');

/* =========================================================
   宣纸纹理
   ========================================================= */
function makePaper(size = 256) {
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  const x = cv.getContext('2d'), img = x.createImageData(size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 128 + (Math.random() - 0.5) * 70;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  // 纤维
  x.globalAlpha = 0.18;
  for (let i = 0; i < 60; i++) {
    x.strokeStyle = Math.random() < 0.5 ? '#fff' : '#555';
    x.lineWidth = Math.random() * 0.8 + 0.2;
    x.beginPath();
    const sx = Math.random() * size, sy = Math.random() * size, a = Math.random() * Math.PI * 2, L = 8 + Math.random() * 30;
    x.moveTo(sx, sy);
    x.quadraticCurveTo(sx + Math.cos(a + 0.6) * L * 0.5, sy + Math.sin(a + 0.6) * L * 0.5, sx + Math.cos(a) * L, sy + Math.sin(a) * L);
    x.stroke();
  }
  return cv;
}
const paperCanvas = makePaper();
root.style.setProperty('--paper', `url(${paperCanvas.toDataURL()})`);

/* =========================================================
   背景粒子 / 墨云
   ========================================================= */
const fx = (() => {
  const cv = $('#fx'), ctx = cv.getContext('2d');
  let w = 0, h = 0;
  const motes = [], clouds = [];
  const cur = { a: [200, 200, 200], b: [180, 180, 180] }, tgt = { a: [200, 200, 200], b: [180, 180, 180] };
  let spriteA = null, spriteB = null, lastA = '', lastB = '';
  let scrollKick = 0;

  function resize() {
    w = innerWidth; h = innerHeight;
    cv.width = w * DPR; cv.height = h * DPR;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  function seed() {
    const n = w < 600 ? 46 : 80;
    motes.length = 0; clouds.length = 0;
    for (let i = 0; i < n; i++) motes.push({ x: Math.random() * w, y: Math.random() * h, r: 1 + Math.random() ** 2 * 7, vx: (Math.random() - 0.5) * 0.15, vy: -0.08 - Math.random() * 0.3, ph: Math.random() * 6.28, a: 0.3 + Math.random() * 0.6 });
    for (let i = 0; i < 6; i++) clouds.push({ x: Math.random() * w, y: Math.random() * h, r: (0.25 + Math.random() * 0.35) * Math.max(w, h), vx: (Math.random() - 0.5) * 0.12, vy: (Math.random() - 0.5) * 0.1, ph: Math.random() * 6.28 });
  }
  function sprite(rgb) {
    const s = 128, c = document.createElement('canvas'); c.width = c.height = s;
    const x = c.getContext('2d'), g = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, rgba(rgb, 1)); g.addColorStop(0.18, rgba(rgb, 0.7)); g.addColorStop(0.5, rgba(rgb, 0.18)); g.addColorStop(1, rgba(rgb, 0));
    x.fillStyle = g; x.fillRect(0, 0, s, s);
    return c;
  }
  function setColor(c) {
    const [hh, s, l] = c.hsl;
    const sat = clamp(Math.max(s, 0.22), 0.22, 0.75);
    const la = l > 0.74 ? l - 0.3 : clamp(l + 0.3, 0.74, 0.93);
    tgt.a = hslToRgb(hh + 180, c.chroma < 0.08 ? 0.2 : sat * 0.8, la);
    tgt.b = c.light ? hslToRgb(hh, clamp(s, 0, 0.6), clamp(l - 0.12, 0, 1)) : hslToRgb(hh, clamp(s * 1.1, 0, 0.8), clamp(l - 0.16, 0, 1));
  }
  let t = 0;
  function frame() {
    t += 1;
    for (const k of ['a', 'b']) cur[k] = mix(cur[k], tgt[k], 0.035);
    const ka = cur.a.map(Math.round).join(), kb = cur.b.map(Math.round).join();
    if (ka !== lastA) { spriteA = sprite(cur.a); lastA = ka; }
    if (kb !== lastB) { spriteB = sprite(cur.b); lastB = kb; }
    ctx.clearRect(0, 0, w, h);
    const kick = scrollKick; scrollKick *= 0.9;
    // 墨云
    ctx.globalAlpha = 0.34;
    for (const c of clouds) {
      c.x += c.vx + Math.sin(t * 0.002 + c.ph) * 0.15; c.y += c.vy + kick * 0.1;
      if (c.x < -c.r) c.x = w + c.r; if (c.x > w + c.r) c.x = -c.r;
      if (c.y < -c.r) c.y = h + c.r; if (c.y > h + c.r) c.y = -c.r;
      const r = c.r * (1 + Math.sin(t * 0.003 + c.ph) * 0.08);
      ctx.drawImage(spriteB, c.x - r, c.y - r, r * 2, r * 2);
    }
    // 颗粒
    for (const m of motes) {
      m.x += m.vx + Math.sin(t * 0.01 + m.ph) * 0.12; m.y += m.vy + kick * (0.2 + m.r * 0.05);
      if (m.y < -20) { m.y = h + 20; m.x = Math.random() * w; }
      if (m.y > h + 20) { m.y = -20; m.x = Math.random() * w; }
      if (m.x < -20) m.x = w + 20; if (m.x > w + 20) m.x = -20;
      ctx.globalAlpha = m.a * (0.55 + 0.45 * Math.sin(t * 0.02 + m.ph));
      const r = m.r * 3;
      ctx.drawImage(spriteA, m.x - r, m.y - r, r * 2, r * 2);
    }
    ctx.globalAlpha = 1;
    requestAnimationFrame(frame);
  }
  addEventListener('resize', () => { resize(); seed(); });
  resize(); seed();
  requestAnimationFrame(frame);
  return { setColor, kick: (v) => { scrollKick = clamp(scrollKick + v, -30, 30); }, snap(c) { setColor(c); cur.a = tgt.a.slice(); cur.b = tgt.b.slice(); } };
})();

/* =========================================================
   今日之色 / 节气
   ========================================================= */
function solarTerm(d = new Date()) {
  const m = d.getMonth() + 1, day = d.getDate();
  let term = SOLAR_TERMS[SOLAR_TERMS.length - 1];
  for (const t of SOLAR_TERMS) if (m > t[0] || (m === t[0] && day >= t[1])) term = t;
  return { name: term[2], season: term[3] };
}
function todayColor() {
  const d = new Date(), term = solarTerm(d);
  const pool = COLORS.filter((c) => c.s === term.season);
  const key = d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
  let hsh = key; hsh = ((hsh >>> 16) ^ hsh) * 0x45d9f3b; hsh = ((hsh >>> 16) ^ hsh) * 0x45d9f3b; hsh = (hsh >>> 16) ^ hsh;
  return { c: pool[Math.abs(hsh) % pool.length], term };
}
const TODAY = todayColor();

/* =========================================================
   主轨道
   ========================================================= */
function slideHTML(c, idx) {
  const fam = FAM[c.f], sea = SEA[c.s];
  return `<section class="slide" data-i="${c.i}" style="--len:${[...c.n].length}">
    <div class="name-col"><div class="nw">
      <div class="seal">${fam.name.length > 1 ? fam.name : fam.name + '色'}</div>
      <h2 class="v-name">${c.n}</h2>
      <div class="v-pin">${c.p}</div>
    </div></div>
    <div class="info-col">
      <div class="meta"><span>No.${pad(idx + 1)}</span><span class="fam">${fam.label}</span><span class="fam">${sea.name}</span></div>
      <div class="hexline" data-copy="${c.h}" title="点击复制"><b>${c.h}</b><small>参考色值</small></div>
      <p class="desc">${c.d}</p>
      ${c.q ? `<blockquote class="quote">${c.q}<cite>—— ${c.a}</cite></blockquote>` : ''}
      <div><button class="more" data-detail="${c.i}">详 情 <span aria-hidden="true">→</span></button></div>
    </div>
  </section>`;
}
let io = null, booted = false;
function buildTrack(keep) {
  track.innerHTML = state.list.map(slideHTML).join('');
  rail.innerHTML = state.list.map((c) => `<button data-go="${c.i}" style="background:${c.h}" aria-label="${c.n}"><span>${c.n}</span></button>`).join('');
  io && io.disconnect();
  io = new IntersectionObserver((ents) => {
    for (const e of ents) if (e.isIntersecting) setActive(COLORS[+e.target.dataset.i]);
  }, { root: track, threshold: 0.55 });
  $$('.slide', track).forEach((s) => io.observe(s));
  const target = keep && state.list.includes(keep) ? keep : state.list[0];
  jump(target, false);
}
function setActive(c) {
  if (state.cur === c) return;
  const first = !booted; booted = true;
  state.cur = c;
  root.style.setProperty('--bg', c.h);
  root.style.setProperty('--ink', c.ink);
  root.style.setProperty('--ink-2', rgba(c.inkRgb, 0.66));
  root.style.setProperty('--ink-3', rgba(c.inkRgb, 0.22));
  root.style.setProperty('--glass', c.light ? 'rgba(255,255,255,.08)' : 'rgba(255,255,255,.24)');
  root.style.setProperty('--seal-bg', c.f === 'red' || c.f === 'purple' ? c.ink : '#b3261e');
  metaTheme.setAttribute('content', c.h);
  first ? fx.snap(c) : fx.setColor(c);
  $$('.slide', track).forEach((s) => s.classList.toggle('on', +s.dataset.i === c.i));
  $$('button', rail).forEach((b) => b.classList.toggle('on', +b.dataset.go === c.i));
  $('#counter').textContent = `${pad(state.list.indexOf(c) + 1)} / ${pad(state.list.length)}`;
  try { history.replaceState(null, '', '#' + encodeURIComponent(c.n)); } catch (e) { /* file:// */ }
  if (!first) $('#hint').classList.add('gone');
}
function jump(c, smooth = true) {
  let idx = state.list.indexOf(c);
  if (idx < 0) { state.fam = null; state.season = null; renderFilters(); state.list = COLORS.slice(); buildTrack(c); return; }
  const far = state.cur && Math.abs(state.list.indexOf(state.cur) - idx) > 2;
  track.scrollTo({ top: idx * track.clientHeight, behavior: smooth && !far ? 'smooth' : 'instant' });
  if (!smooth || far) setActive(c);
}
function step(d) {
  const idx = state.list.indexOf(state.cur);
  const n = state.list[clamp(idx + d, 0, state.list.length - 1)];
  if (n) jump(n);
}
let lastTop = 0;
track.addEventListener('scroll', () => { const t = track.scrollTop; fx.kick((lastTop - t) * 0.05); lastTop = t; }, { passive: true });
addEventListener('resize', () => { if (state.cur) track.scrollTop = state.list.indexOf(state.cur) * track.clientHeight; });

/* ---------- 筛选 ---------- */
function renderFilters() {
  const f = $('#filters');
  f.innerHTML = `<button class="chip ${!state.fam && !state.season ? 'on' : ''}" data-all>全部</button>`
    + FAMILIES.map((x) => `<button class="chip ${state.fam === x.id ? 'on' : ''}" data-fam="${x.id}">${x.name}</button>`).join('')
    + '<i class="chip-sep"></i>'
    + SEASONS.map((x) => `<button class="chip ${state.season === x.id ? 'on' : ''}" data-season="${x.id}">${x.name}</button>`).join('');
}
$('#filters').addEventListener('click', (e) => {
  const b = e.target.closest('.chip'); if (!b) return;
  let fam = state.fam, season = state.season;
  if (b.hasAttribute('data-all')) { fam = null; season = null; }
  if (b.dataset.fam) fam = fam === b.dataset.fam ? null : b.dataset.fam;
  if (b.dataset.season) season = season === b.dataset.season ? null : b.dataset.season;
  const list = COLORS.filter((c) => (!fam || c.f === fam) && (!season || c.s === season));
  if (!list.length) { toast(`${FAM[fam].name}色之中，暂无${SEA[season].name}日之色`); return; }
  state.fam = fam; state.season = season; state.list = list;
  renderFilters();
  const keep = state.cur;
  state.cur = null;
  buildTrack(keep);
  const tag = [fam && FAM[fam].label, season && SEA[season].name + '日'].filter(Boolean).join(' · ');
  toast(tag ? `${tag} · 共 ${list.length} 色` : `全部 ${list.length} 色`);
});

/* =========================================================
   复制 / 提示
   ========================================================= */
let toastTimer = 0;
function toast(msg, color) {
  const t = $('#toast');
  t.innerHTML = (color ? `<i style="background:${color}"></i>` : '') + `<span>${msg}</span>`;
  t.classList.add('on');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('on'), 2000);
}
async function copy(text, color) {
  let ok = false;
  try { await navigator.clipboard.writeText(text); ok = true; } catch (e) {
    const ta = document.createElement('textarea'); ta.value = text; ta.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(ta); ta.select();
    try { ok = document.execCommand('copy'); } catch (e2) { ok = false; }
    ta.remove();
  }
  toast(ok ? `已复制 ${text}` : `色值 ${text}`, color);
}

/* =========================================================
   配色
   ========================================================= */
function harmonies(c) {
  const [h, , l] = c.hsl, used = new Set([c.i]), out = [];
  const pick = (label, note, fn) => {
    let best = null, bs = Infinity;
    for (const d of COLORS) { if (used.has(d.i)) continue; const s = fn(d); if (s < bs) { bs = s; best = d; } }
    if (best) { used.add(best.i); out.push({ c: best, label, note }); }
  };
  const grey = (d) => d.chroma < 0.1;
  if (c.chroma >= 0.1) {
    pick('邻近', '色相相近，柔和过渡', (d) => hueDist(d.hsl[0], h + 26) * 3 + Math.abs(d.hsl[2] - l) * 0.5 + (grey(d) ? 3 : 0) + (hueDist(d.hsl[0], h) < 0.05 ? 1 : 0));
    pick('互补', '对面之色，相激相生', (d) => hueDist(d.hsl[0], h + 180) * 3 + Math.abs(d.chroma - c.chroma * 0.8) + (grey(d) ? 3 : 0));
    pick('分补', '偏开一步，更显雅致', (d) => hueDist(d.hsl[0], h + 140) * 3 + Math.abs(d.hsl[2] - 0.5) * 0.5 + (grey(d) ? 3 : 0));
  } else {
    pick('点睛', '素底之上一点暖红', (d) => hueDist(d.hsl[0], 355) * 2 + Math.abs(d.chroma - 0.5) + (d.chroma < 0.2 ? 3 : 0));
    pick('相衬', '清冷青蓝，相映成趣', (d) => hueDist(d.hsl[0], 205) * 2 + Math.abs(d.chroma - 0.35) + (d.chroma < 0.15 ? 3 : 0));
    pick('同调', '同一色调，深浅相宜', (d) => hueDist(d.hsl[0], h) + (d.chroma > 0.25 ? 1.5 : 0) + Math.abs(Math.abs(d.hsl[2] - l) - 0.3) * 2);
  }
  pick(l > 0.55 ? '压色' : '留白', l > 0.55 ? '以深色压住画面' : '以素白留出呼吸', (d) => (d.chroma > 0.12 ? 3 : 0) + (l > 0.55 ? d.hsl[2] : 1 - d.hsl[2]) * 2 + hueDist(d.hsl[0], h) * 0.4);
  return out;
}

/* =========================================================
   详情
   ========================================================= */
const sheet = $('#sheet');
function openDetail(c) {
  const [r, g, b] = c.rgb, [hh, s, l] = c.hsl, cm = toCmyk(c.rgb), hs = harmonies(c);
  const swInk = c.ink;
  $('#sheetPanel').style.setProperty('--sw-ink', swInk);
  $('#sheetBody').innerHTML = `
    <div class="sw" style="background:${c.h}">
      <canvas id="swc"></canvas>
      <div class="sw-name"><h2>${c.n}</h2><p>${c.p}</p></div>
    </div>
    <div class="sheet-content">
      <div class="codes">
        <button class="code wide" data-copy="${c.h}"><span><small>HEX · 参考色值</small><b>${c.h}</b></span><em>点击复制</em></button>
        <button class="code" data-copy="rgb(${r}, ${g}, ${b})"><small>RGB</small><b>${r}, ${g}, ${b}</b></button>
        <button class="code" data-copy="cmyk(${cm.join('%, ')}%)"><small>CMYK</small><b>${cm.join(', ')}</b></button>
        <button class="code" data-copy="hsl(${Math.round(hh)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%)"><small>HSL</small><b>${Math.round(hh)}°, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%</b></button>
        <div class="code"><small>色系 · 时令</small><b style="font-family:var(--serif);font-size:15px">${FAM[c.f].label} · ${SEA[c.s].name}</b></div>
      </div>
      <p class="s-note">色名的取值在不同典籍与色谱中各有出入，此处为参考色值；CMYK 由 RGB 直接换算，仅供参考。</p>
      <div class="s-label">色 说</div>
      <p class="s-desc">${c.d}</p>
      ${c.q ? `<div class="s-label">出 处</div><blockquote class="s-quote">${c.q}<cite>—— ${c.a}</cite></blockquote>` : ''}
      <div class="s-label">配 色</div>
      <div class="harmony">
        <button data-go="${c.i}" style="background:${c.h};color:${c.ink}"><b>${c.n}</b><small>主色</small></button>
        ${hs.map((x) => `<button data-go="${x.c.i}" style="background:${x.c.h};color:${x.c.ink}"><b>${x.c.n}</b><small>${x.label}</small></button>`).join('')}
      </div>
      <div class="h-list">
        ${hs.map((x) => `<button class="h-item" data-go="${x.c.i}"><i style="background:${x.c.h}"></i><span>${x.c.n}<small>${x.label} · ${x.note}</small></span></button>`).join('')}
      </div>
      <div class="s-actions">
        <button class="btn" data-copy="${c.h}">复制色值</button>
        <button class="btn solid" data-poster="${c.i}">生成色卡</button>
      </div>
    </div>`;
  sheet.hidden = false;
  $('#sheetPanel').scrollTop = 0;
  requestAnimationFrame(() => paintSwatch($('#swc'), c, hs));
}
function closeDetail() { sheet.hidden = true; }
function paintSwatch(cv, c, hs) {
  const w = cv.clientWidth, h = cv.clientHeight;
  cv.width = w * DPR; cv.height = h * DPR;
  const x = cv.getContext('2d'); x.scale(DPR, DPR);
  const blobs = [[w * 0.92, h * 0.1, h * 0.9], [w * 0.75, h * 1.05, h * 0.7], [w * 1.02, h * 0.75, h * 0.5]];
  hs.slice(0, 3).forEach((hx, k) => {
    const [bx, by, br] = blobs[k];
    const g = x.createRadialGradient(bx, by, 0, bx, by, br);
    g.addColorStop(0, rgba(hx.c.rgb, 0.55)); g.addColorStop(0.5, rgba(hx.c.rgb, 0.2)); g.addColorStop(1, rgba(hx.c.rgb, 0));
    x.fillStyle = g; x.fillRect(0, 0, w, h);
  });
  x.setTransform(1, 0, 0, 1, 0, 0); x.globalCompositeOperation = 'soft-light'; x.globalAlpha = 0.35;
  x.fillStyle = x.createPattern(paperCanvas, 'repeat'); x.fillRect(0, 0, cv.width, cv.height);
}

/* =========================================================
   色谱
   ========================================================= */
const atlas = $('#atlas');
let wheelBuilt = false, gridBuilt = false, preview = null;
function buildWheel() {
  const wheel = $('#wheel');
  const pts = COLORS.map((c) => {
    const neutral = c.chroma < 0.1;
    const a = (c.hsl[0] - 90) * Math.PI / 180;
    const r = 0.62 + clamp(c.chroma, 0, 0.7) / 0.7 * 0.34;
    return { c, a, r, neutral, x: Math.cos(a) * r, y: Math.sin(a) * r, rMin: 0.6, rMax: 0.97 };
  });
  // 无彩之色（白、灰、黑）按明度排成内环
  const ns = pts.filter((p) => p.neutral).sort((p, q) => q.c.hsl[2] - p.c.hsl[2]);
  ns.forEach((p, k) => { const a = -Math.PI / 2 + (k / ns.length) * Math.PI * 2; p.x = Math.cos(a) * 0.44; p.y = Math.sin(a) * 0.44; p.rMin = 0.42; p.rMax = 0.47; });
  // 简单的斥力松弛，避免重叠
  const D = 0.122;
  for (let it = 0; it < 200; it++) {
    for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
      const p = pts[i], q = pts[j], dx = q.x - p.x, dy = q.y - p.y, d = Math.hypot(dx, dy) || 1e-4;
      if (d < D) { const m = (D - d) / 2 / d; p.x -= dx * m; p.y -= dy * m; q.x += dx * m; q.y += dy * m; }
    }
    for (const p of pts) {
      const d = Math.hypot(p.x, p.y), r = clamp(d, p.rMin, p.rMax);
      if (d !== r) { p.x *= r / d; p.y *= r / d; }
    }
  }
  wheel.insertAdjacentHTML('beforeend', pts.map((p, k) => `<button class="dot" data-dot="${p.c.i}" aria-label="${p.c.n}"
    style="left:${50 + p.x * 50}%;top:${50 + p.y * 50}%;background:${p.c.h};--sz:6.2%;animation-delay:${(k % 30) * 12}ms"></button>`).join(''));
  wheelBuilt = true;
}
function coreShow(c, hint) {
  const core = $('#wheelCore');
  core.style.background = c ? c.h : '#1f1a17';
  core.style.color = c ? c.ink : '#f4eee2';
  core.innerHTML = c ? `<b>${c.n}</b><small>${c.h}</small><small>${hint || ''}</small>` : '<b>色</b><small>按色相排列</small>';
}
function buildGrid() {
  $('#grid').innerHTML = FAMILIES.map((f) => {
    const cs = COLORS.filter((c) => c.f === f.id);
    return `<h3>${f.label}<small style="font-family:var(--latin);letter-spacing:.1em;opacity:.5">${cs.length}</small></h3>
      <div class="tiles">${cs.map((c, k) => `<button class="tile" data-dot="${c.i}" style="background:${c.h};color:${c.ink};animation-delay:${k * 25}ms"><b>${c.n}</b><small>${c.h}</small></button>`).join('')}</div>`;
  }).join('');
  gridBuilt = true;
}
function setAtlasMode(m) {
  state.atlasMode = m;
  $$('.seg button').forEach((b) => b.classList.toggle('on', b.dataset.mode === m));
  $('#wheelWrap').hidden = m !== 'wheel';
  $('#grid').hidden = m !== 'grid';
  if (m === 'wheel' && !wheelBuilt) buildWheel();
  if (m === 'grid' && !gridBuilt) buildGrid();
  markCur();
}
function markCur() { $$('[data-dot]', atlas).forEach((d) => d.classList.toggle('cur', state.cur && +d.dataset.dot === state.cur.i)); }
function openAtlas() { atlas.hidden = false; setAtlasMode(state.atlasMode); preview = null; coreShow(state.cur, '当前'); }
function closeAtlas() { atlas.hidden = true; }
$('.seg').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) setAtlasMode(b.dataset.mode); });
atlas.addEventListener('pointerover', (e) => { const d = e.target.closest('.dot'); if (d && canHover) coreShow(COLORS[+d.dataset.dot], '点击进入'); });
atlas.addEventListener('pointerleave', () => canHover && coreShow(state.cur, '当前'), true);
atlas.addEventListener('click', (e) => {
  const d = e.target.closest('[data-dot]');
  if (d) {
    const c = COLORS[+d.dataset.dot];
    if (d.classList.contains('dot') && !canHover && preview !== c) { preview = c; coreShow(c, '再点一下 · 进入'); return; }
    closeAtlas(); jump(c); return;
  }
  if (e.target.closest('#wheelCore') && preview) { const c = preview; closeAtlas(); jump(c); }
});
$('#atlasClose').addEventListener('click', closeAtlas);

/* =========================================================
   色卡海报
   ========================================================= */
async function fontsReady(text) {
  if (!document.fonts) return;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  await Promise.race([Promise.all([
    document.fonts.load(`900 200px "Noto Serif SC"`, text),
    document.fonts.load(`400 40px "Noto Serif SC"`, text),
    document.fonts.load(`italic 400 40px "Cormorant Garamond"`, 'abc'),
  ]).catch(() => {}), wait(1800)]);
}
const SERIF = '"Noto Serif SC","Songti SC","STSong","SimSun",serif';
const LATIN = '"Cormorant Garamond","Times New Roman",Georgia,serif';
function vText(x, str, cx, top, size, gap = 1.06) {
  [...str].forEach((ch, k) => x.fillText(ch, cx, top + k * size * gap));
}
async function makePoster(c) {
  toast('正在研墨…', c.h);
  await fontsReady(c.n + (c.q || c.d) + (c.a || '') + '中国传统色参考色值今日');
  const W = 1080, H = 1620, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const x = cv.getContext('2d');
  const ink = c.ink, inkRgb = c.inkRgb, hs = harmonies(c);
  x.fillStyle = c.h; x.fillRect(0, 0, W, H);
  // 晕染
  const blobs = [[W * 0.05, H * 0.08, 760], [W * 1.0, H * 0.62, 640], [W * 0.15, H * 1.02, 560]];
  hs.slice(0, 3).forEach((hx, k) => {
    const [bx, by, br] = blobs[k];
    for (let j = 0; j < 4; j++) {
      const ox = bx + (Math.random() - 0.5) * 160, oy = by + (Math.random() - 0.5) * 160, rr = br * (0.6 + Math.random() * 0.5);
      const g = x.createRadialGradient(ox, oy, 0, ox, oy, rr);
      g.addColorStop(0, rgba(hx.c.rgb, 0.22)); g.addColorStop(0.6, rgba(hx.c.rgb, 0.08)); g.addColorStop(1, rgba(hx.c.rgb, 0));
      x.fillStyle = g; x.fillRect(0, 0, W, H);
    }
  });
  x.save(); x.globalCompositeOperation = 'soft-light'; x.globalAlpha = 0.7;
  x.fillStyle = x.createPattern(paperCanvas, 'repeat'); x.fillRect(0, 0, W, H); x.restore();
  // 边框
  x.strokeStyle = rgba(inkRgb, 0.35); x.lineWidth = 2; x.strokeRect(50, 50, W - 100, H - 100);
  x.strokeStyle = rgba(inkRgb, 0.18); x.lineWidth = 1; x.strokeRect(62, 62, W - 124, H - 124);
  x.fillStyle = ink; x.textAlign = 'center'; x.textBaseline = 'top';
  // 页眉
  x.font = `400 26px ${SERIF}`;
  x.textAlign = 'left'; x.fillStyle = rgba(inkRgb, 0.7);
  x.fillText('中 国 传 统 色', 110, 110);
  x.textAlign = 'right'; x.font = `italic 400 32px ${LATIN}`;
  x.fillText(`No.${pad(c.i + 1)}  ·  ${FAM[c.f].label}  ·  ${SEA[c.s].name}`, W - 110, 106);
  // 大字
  const chars = [...c.n], size = Math.min(300, 1000 / chars.length);
  const nameX = W * 0.68, nameTop = 210;
  x.textAlign = 'center'; x.fillStyle = ink; x.font = `900 ${size}px ${SERIF}`;
  vText(x, c.n, nameX, nameTop, size, 1.04);
  const nameBottom = nameTop + chars.length * size * 1.04;
  // 拼音（竖排旋转）
  x.save(); x.translate(nameX + size / 2 + 50, nameTop + 10); x.rotate(Math.PI / 2);
  x.textAlign = 'left'; x.font = `italic 400 44px ${LATIN}`; x.fillStyle = rgba(inkRgb, 0.75);
  x.fillText(c.p.toUpperCase().split('').join(' '), 0, -22); x.restore();
  // 印章
  const sx = nameX - size / 2 - 70, sy = nameBottom - 100;
  x.fillStyle = c.f === 'red' || c.f === 'purple' ? ink : '#b3261e';
  roundRect(x, sx - 34, sy, 68, 92, 6); x.fill();
  x.fillStyle = c.f === 'red' || c.f === 'purple' ? c.h : '#fbf3e6'; x.font = `600 40px ${SERIF}`; x.textAlign = 'center';
  x.fillText('色', sx, sy + 10); x.font = `400 24px ${SERIF}`; x.fillText('谱', sx, sy + 56);
  // 诗句 / 描述（竖排）
  const text = c.q || c.d;
  const cols = text.split(/[，。；：！？、“”]/).map((s) => s.trim()).filter(Boolean);
  const colsSplit = [];
  cols.forEach((s) => { const a = [...s]; while (a.length) colsSplit.push(a.splice(0, 11).join('')); });
  const fz = c.q ? 44 : 38;
  x.font = `400 ${fz}px ${SERIF}`; x.fillStyle = ink;
  let cx = sx - 110;
  const maxCols = Math.min(colsSplit.length, 7);
  colsSplit.slice(0, maxCols).forEach((s, k) => vText(x, s, cx - k * (fz + 26), 260, fz, 1.18));
  if (c.q) {
    x.font = `400 26px ${SERIF}`; x.fillStyle = rgba(inkRgb, 0.68);
    vText(x, '—' + c.a.replace(/[《》·]/g, (m) => (m === '·' ? '・' : m === '《' ? '︽' : '︾')), cx - maxCols * (fz + 26) + 4, 300, 26, 1.12);
  }
  // 色值
  const by = H - 330;
  x.strokeStyle = rgba(inkRgb, 0.3); x.beginPath(); x.moveTo(110, by); x.lineTo(W - 110, by); x.stroke();
  x.textAlign = 'left'; x.fillStyle = ink; x.font = `500 92px ${LATIN}`;
  x.fillText(c.h, 106, by + 34);
  x.font = `400 24px ${SERIF}`; x.fillStyle = rgba(inkRgb, 0.65);
  x.fillText('参考色值', 112, by + 140);
  const cm = toCmyk(c.rgb);
  x.font = `500 30px ${LATIN}`; x.fillStyle = rgba(inkRgb, 0.85);
  x.fillText(`RGB  ${c.rgb.join(' · ')}`, 112, by + 190);
  x.fillText(`CMYK  ${cm.join(' · ')}`, 112, by + 232);
  // 配色条
  const sw = 64;
  hs.slice(0, 4).forEach((hx, k) => {
    const px = W - 110 - (4 - k) * (sw + 12);
    x.fillStyle = hx.c.h; x.fillRect(px, by + 44, sw, sw);
    x.strokeStyle = rgba(inkRgb, 0.25); x.strokeRect(px + 0.5, by + 44.5, sw - 1, sw - 1);
    x.fillStyle = rgba(inkRgb, 0.75); x.font = `400 20px ${SERIF}`; x.textAlign = 'center';
    x.fillText(hx.c.n, px + sw / 2, by + 120);
  });
  x.textAlign = 'right'; x.font = `400 22px ${SERIF}`; x.fillStyle = rgba(inkRgb, 0.6);
  const d = new Date();
  x.fillText(`${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} · ${TODAY.term.name}`, W - 110, by + 232);
  x.fillText('配 色', W - 110, by + 16 - 4);
  return cv.toDataURL('image/png');
}
function roundRect(x, X, Y, w, h, r) {
  x.beginPath(); x.moveTo(X + r, Y); x.arcTo(X + w, Y, X + w, Y + h, r); x.arcTo(X + w, Y + h, X, Y + h, r);
  x.arcTo(X, Y + h, X, Y, r); x.arcTo(X, Y, X + w, Y, r); x.closePath();
}
async function openPoster(c) {
  const url = await makePoster(c);
  $('#posterImg').src = url;
  const a = $('#posterDl'); a.href = url; a.download = `中国传统色-${c.n}.png`;
  $('#poster').hidden = false;
  $('#toast').classList.remove('on');
}
$('#posterClose').addEventListener('click', () => { $('#poster').hidden = true; });
$('#poster').addEventListener('click', (e) => { if (e.target.id === 'poster') $('#poster').hidden = true; });

/* =========================================================
   全局事件
   ========================================================= */
document.addEventListener('click', (e) => {
  const cp = e.target.closest('[data-copy]');
  if (cp) { copy(cp.dataset.copy, state.cur && state.cur.h); return; }
  const dt = e.target.closest('[data-detail]');
  if (dt) { openDetail(COLORS[+dt.dataset.detail]); return; }
  const pst = e.target.closest('[data-poster]');
  if (pst) { openPoster(COLORS[+pst.dataset.poster]); return; }
  const go = e.target.closest('[data-go]');
  if (go) {
    const c = COLORS[+go.dataset.go];
    if (!sheet.hidden) { closeDetail(); jump(c); setTimeout(() => openDetail(c), 350); } else jump(c);
    return;
  }
  if (e.target.closest('[data-close]')) closeDetail();
});
$('#btnMap').addEventListener('click', openAtlas);
$('#btnToday').addEventListener('click', () => { closeAtlas(); jump(TODAY.c); toast(`今日 ${TODAY.term.name} · ${TODAY.c.n}`, TODAY.c.h); });
document.addEventListener('keydown', (e) => {
  if (!$('#intro').classList.contains('gone')) { if (e.key === 'Enter' || e.key === ' ') enter(); return; }
  if (e.key === 'Escape') { if (!$('#poster').hidden) $('#poster').hidden = true; else if (!sheet.hidden) closeDetail(); else closeAtlas(); return; }
  if (!sheet.hidden || !atlas.hidden || !$('#poster').hidden) return;
  if (['ArrowDown', 'PageDown', 'j'].includes(e.key)) { e.preventDefault(); step(1); }
  else if (['ArrowUp', 'PageUp', 'k'].includes(e.key)) { e.preventDefault(); step(-1); }
  else if (e.key === 'Enter' && state.cur) openDetail(state.cur);
  else if (e.key === 'm') openAtlas();
});
// 详情面板：手机上下拉关闭
(() => {
  const p = $('#sheetPanel'); let y0 = null, dy = 0;
  p.addEventListener('touchstart', (e) => { if (p.scrollTop <= 0) { y0 = e.touches[0].clientY; dy = 0; } }, { passive: true });
  p.addEventListener('touchmove', (e) => { if (y0 == null) return; dy = e.touches[0].clientY - y0; if (dy > 0) p.style.transform = `translateY(${dy}px)`; }, { passive: true });
  p.addEventListener('touchend', () => { if (y0 == null) return; p.style.transform = ''; if (dy > 110) closeDetail(); y0 = null; });
})();

/* =========================================================
   开场：墨色晕染
   ========================================================= */
const intro = $('#intro');
const inkAnim = (() => {
  const cv = $('#ink'), x = cv.getContext('2d');
  let w, h, run = true, t0 = performance.now();
  const pal = ['胭脂', '石青', '藤黄', '竹青', '黛蓝', '海棠红', '群青', '石绿', '琥珀', '丁香紫'].map((n) => COLORS.find((c) => c.n === n));
  let blooms = [];
  function setup() {
    w = innerWidth; h = innerHeight;
    cv.width = w * DPR; cv.height = h * DPR; x.setTransform(DPR, 0, 0, DPR, 0, 0);
    x.fillStyle = '#f3ede0'; x.fillRect(0, 0, w, h);
    x.save(); x.globalAlpha = 0.25; x.globalCompositeOperation = 'multiply';
    x.fillStyle = x.createPattern(paperCanvas, 'repeat'); x.fillRect(0, 0, w, h); x.restore();
    const m = Math.min(w, h), n = w < 600 ? 7 : 10;
    blooms = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.5;
      const dist = (0.62 + Math.random() * 0.3) * Math.hypot(w, h) / 2;
      const c = pal[i % pal.length];
      blooms.push({
        x: w / 2 + Math.cos(a) * dist * (w / Math.hypot(w, h)) * 1.3,
        y: h / 2 + Math.sin(a) * dist * (h / Math.hypot(w, h)) * 1.3,
        R: m * (0.2 + Math.random() * 0.16), rgb: c.rgb,
        start: i * 180 + Math.random() * 200, dur: 2600 + Math.random() * 1600,
        harm: Array.from({ length: 6 }, (_, k) => ({ k: k + 2, amp: (0.5 + Math.random()) * 0.11 / (k * 0.5 + 1), ph: Math.random() * 6.28, sp: (Math.random() - 0.5) * 0.0012 })),
        drops: Array.from({ length: 5 + Math.floor(Math.random() * 6) }, () => ({ a: Math.random() * 6.28, d: 1.02 + Math.random() * 0.4, r: 0.02 + Math.random() * 0.06 })),
      });
    }
  }
  function blob(b, r, time) {
    x.beginPath();
    const N = 64;
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * Math.PI * 2;
      let k = 1;
      for (const hm of b.harm) k += hm.amp * Math.sin(hm.k * a + hm.ph + time * hm.sp);
      const px = b.x + Math.cos(a) * r * k, py = b.y + Math.sin(a) * r * k;
      i ? x.lineTo(px, py) : x.moveTo(px, py);
    }
    x.closePath();
  }
  function frame(now) {
    if (!run) return;
    const time = now - t0;
    x.globalCompositeOperation = 'multiply';
    for (const b of blooms) {
      const p = clamp((time - b.start) / b.dur, 0, 1);
      if (p <= 0 || p >= 1) continue;
      const e = 1 - (1 - p) ** 3, r = b.R * e;
      blob(b, r, time);
      x.fillStyle = rgba(b.rgb, 0.011);
      x.fill();
      x.lineWidth = 1.4; x.strokeStyle = rgba(b.rgb, 0.07 * (1 - p)); x.stroke();
      for (const d of b.drops) {
        const q = clamp((p - 0.25 - d.r * 4) / 0.5, 0, 1);
        if (q <= 0 || q >= 1) continue;
        const dx = b.x + Math.cos(d.a) * b.R * d.d, dy = b.y + Math.sin(d.a) * b.R * d.d;
        x.beginPath(); x.arc(dx, dy, b.R * d.r * (1 - (1 - q) ** 3), 0, 6.29);
        x.fillStyle = rgba(b.rgb, 0.03); x.fill();
      }
    }
    x.globalCompositeOperation = 'source-over';
    requestAnimationFrame(frame);
  }
  setup();
  requestAnimationFrame(frame);
  return { stop() { run = false; } };
})();

function enter() {
  if (intro.classList.contains('gone')) return;
  intro.classList.add('leaving', 'gone');
  $('#hint').classList.remove('gone');
  setTimeout(() => { inkAnim.stop(); intro.hidden = true; }, 1300);
}
$('#introToday').innerHTML = `今日 ${TODAY.term.name} · 宜 <b>${TODAY.c.n}</b>`;
$('#introToday').style.setProperty('--td', TODAY.c.h);
setTimeout(() => intro.classList.add('show'), 900);
intro.addEventListener('click', () => { if (intro.classList.contains('show')) enter(); });
$('#introGo').addEventListener('click', (e) => { e.stopPropagation(); enter(); });

/* =========================================================
   启动
   ========================================================= */
renderFilters();
const fromHash = (() => { try { const n = decodeURIComponent(location.hash.slice(1)); return COLORS.find((c) => c.n === n); } catch (e) { return null; } })();
buildTrack(fromHash || TODAY.c);
if (fromHash) setTimeout(enter, 400); // 分享链接直接进入
