// 星海 · 星 —— 主程序
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { BODIES, STAT_DEFS, DEEP } from './data.js';
import * as TX from './textures.js';
import { shared } from './shaders.js';
import { buildSky, buildIntroDust, buildMeteors } from './sky.js';
import { buildSolar } from './solar.js';
import { buildDeep, GAL_CENTER } from './deep.js';

const $ = (s) => document.querySelector(s);
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const lerp = (a, b, t) => a + (b - a) * t;
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const isMobile = () => innerWidth <= 760;
const tick = () => new Promise((r) => setTimeout(r, 0));

const canvas = $('#stage');
const ui = {
  loader: $('#loader'), pct: $('#loader-pct'), fill: $('#loader-fill'),
  intro: $('#intro'), skip: $('#skip'), hud: $('#hud'), hint: $('#hint'),
  cards: $('#cards'), dockTitle: $('#dock-title'), dockSub: $('#dock-sub'),
  regionZh: $('#region-zh'), regionEn: $('#region-en'), labels: $('#labels'),
  panel: $('#panel'), pMark: $('#p-mark'), pIndex: $('#p-index'), pKind: $('#p-kind'), pName: $('#p-name'), pEn: $('#p-en'),
  pTag: $('#p-tag'), pDist: $('#p-dist'), pStats: $('#p-stats'), pFacts: $('#p-facts'), pNote: $('#p-note'),
};

function fail(msg) {
  ui.loader.classList.add('done');
  const d = document.createElement('div');
  d.className = 'fail';
  d.innerHTML = `<div>${msg}<br><a href="../../index.html" style="color:#9fb4ff">← 返回</a></div>`;
  document.body.appendChild(d);
}

// ---------------- 渲染器 ----------------
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
} catch (e) {
  fail('你的浏览器暂不支持 WebGL，无法展示三维星海。');
  throw e;
}
const PR = Math.min(window.devicePixelRatio || 1, 2);
renderer.setPixelRatio(PR);
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
shared.pr.value = PR;
shared.scale.value = innerHeight / 2;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x010208);
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.3, 90000);

const composer = new EffectComposer(renderer);
composer.setPixelRatio(PR);
composer.setSize(innerWidth, innerHeight);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.95, 0.62, 0.8);
composer.addPass(bloom);
composer.addPass(new OutputPass());

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.07;
controls.enablePan = false;
controls.rotateSpeed = 0.55;
controls.zoomSpeed = 0.9;
controls.minDistance = 8;
controls.maxDistance = 700;
controls.enabled = false;

// ---------------- 状态 ----------------
const state = {
  mode: 'solar', // solar | deep
  focus: null, // 当前聚焦的天体 id
  intro: true,
  simTime: 0, timeScale: 1,
  lastInteract: performance.now(),
  mouse: new THREE.Vector2(), mouseS: new THREE.Vector2(),
  viewOff: new THREE.Vector2(), viewOffTarget: new THREE.Vector2(),
  deepFade: 0, bandFade: 1,
};
let sky, solar, deep, dust, meteors;
const tex = {};
const tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3(), lastTarget = new THREE.Vector3();

// ---------------- 补间与镜头飞行 ----------------
const tweens = [];
function tween(dur, fn, done) { tweens.push({ t: 0, dur, fn, done }); }

let fly = null;
function flyTo({ getTarget, dir, dist, dur = 2.4, fov = null, arc = 0.18, done = null }) {
  fly = {
    t: 0, dur, getTarget, dir: dir.clone().normalize(), dist, done, arc,
    p0: camera.position.clone(), t0: controls.target.clone(), fov0: camera.fov, fov1: fov ?? camera.fov,
  };
  controls.enabled = false;
}

function updateFly(dt) {
  if (!fly) return;
  fly.t += dt;
  const k = clamp(fly.t / fly.dur);
  const e = easeInOut(k);
  const tgt = fly.getTarget(tmpV);
  const end = tmpV2.copy(fly.dir).multiplyScalar(fly.dist).add(tgt);
  const span = fly.p0.distanceTo(end);
  camera.position.lerpVectors(fly.p0, end, e);
  camera.position.y += Math.sin(Math.PI * e) * span * fly.arc;
  controls.target.lerpVectors(fly.t0, tgt, easeOut(clamp(k * 1.25)));
  if (fly.fov0 !== fly.fov1) { camera.fov = lerp(fly.fov0, fly.fov1, e); camera.updateProjectionMatrix(); }
  camera.lookAt(controls.target);
  if (k >= 1) {
    const d = fly.done;
    lastTarget.copy(tgt);
    fly = null;
    if (!state.intro) controls.enabled = true;
    d && d();
  }
}

// ---------------- 构图计算 ----------------
function fitDistance(extent) {
  const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const tanH = tanV * camera.aspect;
  if (isMobile()) return extent / Math.min(tanV * 0.3, tanH * 0.78);
  const avail = (innerWidth - 420) / innerWidth;
  return extent / Math.min(tanV * 0.5, tanH * avail * 0.55);
}
function overviewSolar() {
  const tanH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect;
  const dist = clamp(78 / tanH, 210, 560);
  const elev = isMobile() ? 0.62 : 0.4;
  return { dir: new THREE.Vector3(0, Math.sin(elev), Math.cos(elev)), dist };
}
function updateViewOffsetTarget() {
  if (state.focus) {
    if (isMobile()) state.viewOffTarget.set(0, ui.panel.offsetHeight / 2);
    else state.viewOffTarget.set(ui.panel.offsetWidth / 2, 0);
  } else state.viewOffTarget.set(0, 0);
}
function applyViewOffset(dt) {
  state.viewOff.lerp(state.viewOffTarget, 1 - Math.exp(-dt * 4));
  const w = innerWidth, h = innerHeight;
  if (Math.abs(state.viewOff.x) < 0.5 && Math.abs(state.viewOff.y) < 0.5 && state.viewOffTarget.lengthSq() === 0) {
    if (camera.view && camera.view.enabled) camera.clearViewOffset();
  } else {
    camera.setViewOffset(w, h, state.viewOff.x, state.viewOff.y, w, h);
  }
}

// ---------------- 列表 ----------------
const SOLAR_ORDER = ['sun', 'mercury', 'venus', 'earth', 'moon', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune'];
const bodyData = new Map(BODIES.map((b) => [b.id, b]));
const deepData = new Map(DEEP.map((d) => [d.id, d]));
const DEEP_ORDER = DEEP.map((d) => d.id);
const currentList = () => (state.mode === 'solar' ? SOLAR_ORDER : DEEP_ORDER);
const dataOf = (id) => bodyData.get(id) || deepData.get(id);

// ---------------- 卡片头像 ----------------
function sunPortrait(size) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'); const m = size / 2;
  let gr = g.createRadialGradient(m, m, 0, m, m, m);
  gr.addColorStop(0, 'rgba(255,190,90,0.9)'); gr.addColorStop(0.45, 'rgba(255,120,30,0.45)'); gr.addColorStop(1, 'rgba(255,80,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, size, size);
  gr = g.createRadialGradient(m * 0.85, m * 0.8, 0, m, m, m * 0.5);
  gr.addColorStop(0, '#fffbe8'); gr.addColorStop(0.5, '#ffd36b'); gr.addColorStop(0.9, '#ff8a1f'); gr.addColorStop(1, '#e8550a');
  g.fillStyle = gr; g.beginPath(); g.arc(m, m, m * 0.5, 0, Math.PI * 2); g.fill();
  return c;
}
function planetPortrait(id, size) {
  if (id === 'sun') return sunPortrait(size);
  const src = tex[id];
  if (id !== 'saturn' && id !== 'uranus') return TX.portrait(src, size);
  // 带光环的头像：环的后半 → 星球 → 环的前半
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'); const m = size / 2;
  const ball = TX.portrait(src, Math.round(size * 0.62));
  const tilt = id === 'saturn' ? -0.38 : 1.2;
  const ring = (front) => {
    g.save(); g.translate(m, m); g.rotate(tilt);
    const rx = size * 0.49, ry = size * 0.12;
    const bands = id === 'saturn' ? [[1.0, 'rgba(230,210,170,0.55)', 3], [0.9, 'rgba(240,222,180,0.85)', 4], [0.76, 'rgba(200,180,140,0.5)', 3]] : [[0.95, 'rgba(190,230,240,0.5)', 1.2], [0.82, 'rgba(190,230,240,0.35)', 1]];
    for (const [k, col, w] of bands) {
      g.beginPath(); g.ellipse(0, 0, rx * k, ry * k, 0, front ? 0 : Math.PI, front ? Math.PI : Math.PI * 2);
      g.strokeStyle = col; g.lineWidth = w * size / 120; g.stroke();
    }
    g.restore();
  };
  ring(false);
  g.drawImage(ball, m - ball.width / 2, m - ball.height / 2);
  ring(true);
  return c;
}
function deepPortrait(id, size) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'); const m = size / 2;
  const glow = (x, y, r, col) => { const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); };
  g.globalCompositeOperation = 'lighter';
  const spiral = (arms, tiltY, warm, cool, n) => {
    g.save(); g.translate(m, m); g.scale(1, tiltY); g.rotate(0.5);
    for (let i = 0; i < n; i++) {
      const arm = i % arms; const t = Math.random();
      const r = (0.06 + t * 0.88) * m * 0.92; const th = arm * Math.PI * 2 / arms + Math.log(0.06 + t) * 2.6 + (Math.random() - 0.5) * 0.5;
      const x = Math.cos(th) * r + (Math.random() - 0.5) * 6, y = Math.sin(th) * r + (Math.random() - 0.5) * 6;
      g.fillStyle = t < 0.3 ? warm : cool; g.globalAlpha = 0.25 + Math.random() * 0.5;
      g.fillRect(x, y, 1.4, 1.4);
    }
    g.restore(); g.globalAlpha = 1;
  };
  switch (id) {
    case 'milkyway':
      glow(m, m, m * 0.95, 'rgba(120,110,255,0.35)'); spiral(4, 0.9, '#ffd9a0', '#b9c8ff', 1600); glow(m, m, m * 0.3, 'rgba(255,220,170,0.9)'); break;
    case 'andromeda':
      glow(m, m, m * 0.9, 'rgba(255,200,140,0.25)'); spiral(2, 0.4, '#ffe0b0', '#ffd0a0', 1400); glow(m, m, m * 0.28, 'rgba(255,230,190,0.95)'); break;
    case 'orion':
      for (let i = 0; i < 26; i++) glow(m + (Math.random() - 0.5) * m, m + (Math.random() - 0.5) * m * 0.9, m * (0.2 + Math.random() * 0.4), i % 3 ? 'rgba(255,70,120,0.25)' : 'rgba(90,220,230,0.28)');
      glow(m, m, m * 0.18, 'rgba(255,255,255,0.9)'); break;
    case 'pleiades':
      glow(m, m, m * 0.9, 'rgba(90,140,255,0.3)');
      for (const [x, y, r] of [[0, 0, 1], [0.35, 0.2, 0.8], [-0.3, 0.3, 0.7], [0.1, -0.35, 0.9], [-0.4, -0.15, 0.6], [0.45, -0.2, 0.55], [-0.1, 0.5, 0.6]]) {
        const px = m + x * m, py = m + y * m, rr = m * 0.22 * r;
        glow(px, py, rr, 'rgba(200,225,255,0.95)');
        g.fillStyle = 'rgba(220,235,255,0.6)'; g.fillRect(px - rr * 1.2, py - 0.5, rr * 2.4, 1); g.fillRect(px - 0.5, py - rr * 1.2, 1, rr * 2.4);
      }
      break;
    case 'crab':
      for (let i = 0; i < 40; i++) { const a = Math.random() * 6.28, r = m * (0.35 + Math.random() * 0.35); glow(m + Math.cos(a) * r * 1.2, m + Math.sin(a) * r * 0.85, m * 0.18, 'rgba(255,120,50,0.35)'); }
      glow(m, m, m * 0.45, 'rgba(110,160,255,0.55)'); glow(m, m, m * 0.08, 'rgba(255,255,255,1)'); break;
    case 'sgra': case 'm87': {
      glow(m, m, m * 0.95, 'rgba(255,110,40,0.35)');
      g.globalCompositeOperation = 'source-over';
      g.save(); g.translate(m, m);
      for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(0, 0, m * (0.42 + i * 0.05), 0, Math.PI * 2); g.strokeStyle = `rgba(255,${170 - i * 40},${80 - i * 20},${0.9 - i * 0.25})`; g.lineWidth = m * 0.07; g.stroke(); }
      g.beginPath(); g.arc(0, 0, m * 0.34, 0, Math.PI * 2); g.fillStyle = '#000'; g.fill();
      g.restore(); break;
    }
  }
  return c;
}

// ---------------- 卡片 ----------------
function buildCards() {
  ui.cards.innerHTML = '';
  const list = currentList();
  list.forEach((id, i) => {
    const d = dataOf(id);
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'card'; b.dataset.id = id;
    b.style.setProperty('--c', d.color);
    const img = document.createElement('img');
    img.alt = ''; img.draggable = false;
    img.src = (state.mode === 'solar' ? portraitCache.get(id) : deepPortraitCache.get(id)) || '';
    b.innerHTML = `<span class="no">${String(i + 1).padStart(2, '0')}</span><span class="zh">${d.zh}</span><span class="en">${d.en.replace(/^The /, '')}</span>`;
    b.prepend(img);
    b.addEventListener('click', () => { if (state.focus === id) return; select(id); });
    ui.cards.appendChild(b);
  });
  syncCards();
}
function syncCards() {
  for (const c of ui.cards.children) c.classList.toggle('active', c.dataset.id === state.focus);
  const a = ui.cards.querySelector('.card.active');
  if (a) a.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
}
const portraitCache = new Map(), deepPortraitCache = new Map();

// ---------------- 标签 ----------------
const labels = new Map();
function makeLabel(id, text, color, cls = '') {
  const el = document.createElement('div');
  el.className = 'label hidden ' + cls;
  el.style.setProperty('--c', color);
  el.innerHTML = text;
  el.addEventListener('click', (e) => { e.stopPropagation(); if (id !== 'here') select(id); });
  ui.labels.appendChild(el);
  labels.set(id, { el, visible: false });
}
function screenOf(pos, out) {
  tmpV.copy(pos).project(camera);
  out.z = tmpV.z;
  out.x = (tmpV.x * 0.5 + 0.5) * innerWidth;
  out.y = (-tmpV.y * 0.5 + 0.5) * innerHeight;
  return out;
}
const scr = { x: 0, y: 0, z: 0 };
function projRadius(pos, r) {
  const d = camera.position.distanceTo(pos);
  return (r / (d * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)))) * innerHeight / 2;
}
const posCache = new THREE.Vector3();
function updateLabels() {
  const showSolar = state.mode === 'solar' && !state.focus && !state.intro && !fly;
  const showDeep = state.mode === 'deep' && !state.focus && !fly && state.deepFade > 0.95;
  for (const [id, L] of labels) {
    let vis = false, pos = posCache, r = 0;
    if (solar.bodies.has(id) && bodyData.has(id)) {
      if (showSolar) {
        const b = solar.bodies.get(id);
        b.getPos(pos); r = b.extent || b.r;
        vis = true;
        if (id === 'moon') vis = camera.position.distanceTo(pos) < 70;
      }
    } else if (id === 'here') {
      if (showDeep) { pos.set(0, 0, 0); vis = true; r = 20; }
    } else if (deep.objects.has(id)) {
      if (showDeep && id !== 'milkyway') { pos.copy(deep.objects.get(id).pos); vis = true; r = 10; }
      if (showDeep && id === 'milkyway') { pos.copy(GAL_CENTER).add(tmpV2.set(0, 0, 2600)); vis = true; r = 0; }
    }
    if (vis) {
      screenOf(pos, scr);
      if (scr.z > 1 || scr.x < -50 || scr.x > innerWidth + 50 || scr.y < -30 || scr.y > innerHeight + 30) vis = false;
    }
    if (vis !== L.visible) { L.el.classList.toggle('hidden', !vis); L.visible = vis; }
    if (vis) {
      const pr = Math.min(projRadius(pos, r), 120);
      L.el.style.transform = `translate3d(${(scr.x + pr + 6) | 0}px, ${(scr.y - 10) | 0}px, 0)`;
    }
  }
}

// ---------------- 拾取 ----------------
function pickAt(x, y) {
  let best = null, bestD = Infinity;
  const cands = state.mode === 'solar' ? SOLAR_ORDER : DEEP_ORDER.filter((i) => i !== 'milkyway');
  for (const id of cands) {
    let pos = posCache, r;
    if (state.mode === 'solar') { const b = solar.bodies.get(id); b.getPos(pos); r = b.extent || b.r; }
    else { const o = deep.objects.get(id); pos.copy(o.pos); r = o.dist / 5; }
    screenOf(pos, scr);
    if (scr.z > 1) continue;
    const pr = projRadius(pos, r);
    const d = Math.hypot(scr.x - x, scr.y - y);
    const thr = Math.max(pr * 1.15, isMobile() ? 30 : 22);
    if (d < thr && d - pr * 0.5 < bestD) { bestD = d - pr * 0.5; best = id; }
  }
  return best;
}

// ---------------- 面板 ----------------
function statPct(def, s) {
  if (!s || s.v == null) return 0;
  if (def.log) {
    const o = def.offset || 0;
    const lo = Math.log10(def.min + o || 1e-9), hi = Math.log10(def.max + o);
    return clamp((Math.log10(Math.max(s.v + o, 1e-9)) - lo) / (hi - lo));
  }
  return clamp((s.v - def.min) / (def.max - def.min));
}
function fillPanel(id) {
  const d = dataOf(id);
  const list = currentList();
  const idx = list.indexOf(id);
  ui.panel.style.setProperty('--c', d.color);
  ui.pMark.textContent = d.zh[0];
  ui.pIndex.textContent = `${String(idx + 1).padStart(2, '0')} / ${String(list.length).padStart(2, '0')}`;
  ui.pKind.textContent = d.kind;
  ui.pName.textContent = d.zh;
  ui.pEn.textContent = d.en;
  ui.pTag.textContent = d.tagline;
  ui.pDist.textContent = d.distance || '';
  ui.pStats.innerHTML = '';
  const bars = [];
  if (d.stats) {
    for (const def of STAT_DEFS) {
      const s = d.stats[def.key];
      const row = document.createElement('div');
      row.className = 'stat';
      row.innerHTML = `<div class="stat-row"><span>${def.zh}</span><b>${s ? s.t : '—'}</b></div><div class="stat-bar"><i></i></div>`;
      ui.pStats.appendChild(row);
      bars.push([row.querySelector('i'), statPct(def, s)]);
    }
  } else if (d.rows) {
    for (const [k, v] of d.rows) {
      const row = document.createElement('div');
      row.className = 'kv';
      row.innerHTML = `<span>${k}</span><b>${v}</b>`;
      ui.pStats.appendChild(row);
    }
  }
  requestAnimationFrame(() => requestAnimationFrame(() => { for (const [el, p] of bars) el.style.width = (p * 100).toFixed(1) + '%'; }));
  ui.pFacts.innerHTML = '';
  d.facts.forEach((f, i) => {
    const li = document.createElement('li');
    li.textContent = f;
    li.style.transitionDelay = (0.25 + i * 0.09) + 's';
    ui.pFacts.appendChild(li);
  });
  if (state.mode === 'deep') ui.pNote.textContent = '※ 场景中天体的位置与大小为示意，并非真实比例；银河系内天体按大致方位摆放。';
  else if (id === 'sun' || id === 'moon') ui.pNote.textContent = '※ 为便于观察，场景中天体的大小与距离经过压缩。';
  else ui.pNote.textContent = '※ 为便于观察，场景中行星的大小与距离经过压缩。卫星数为截至 2025 年已确认的数量，仍可能随新发现增加。';
  ui.panel.querySelector('.panel-scroll').scrollTop = 0;
}
function openPanel(id) {
  const wasOpen = ui.panel.classList.contains('open');
  if (wasOpen) {
    ui.panel.classList.remove('open');
    // 快速重播入场动画
    void ui.panel.offsetWidth;
  }
  fillPanel(id);
  ui.panel.classList.add('open');
  ui.panel.setAttribute('aria-hidden', 'false');
  document.body.classList.add('panel-open');
}
function closePanelUI() {
  ui.panel.classList.remove('open');
  ui.panel.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('panel-open');
}

// ---------------- 选择 / 返回 ----------------
function setOrbitHighlight(id) {
  for (const [bid, line] of solar.orbitLines) {
    const on = bid === id || (id === 'moon' && bid === 'earth');
    line.material.opacity = on ? 0.55 : (id ? 0.06 : line.userData.base);
    line.material.color.set(on ? bodyData.get(bid).color : 0x8fa8ff);
  }
}

function select(id) {
  if (state.intro) return;
  const inSolar = SOLAR_ORDER.includes(id);
  if (inSolar && state.mode !== 'solar') return;
  if (!inSolar && state.mode !== 'deep') return;
  state.focus = id;
  state.lastInteract = performance.now();
  openPanel(id);
  syncCards();
  updateViewOffsetTarget();

  if (inSolar) {
    const b = solar.bodies.get(id);
    const extent = b.extent || b.r;
    const p = b.getPos(new THREE.Vector3());
    let dir;
    if (id === 'sun') {
      dir = camera.position.clone().setY(0).normalize().multiplyScalar(0.92).setY(0.38);
    } else {
      // 让镜头处在被照亮的一侧，约 3/4 侧光
      const s = p.clone().setY(0).normalize();
      const side = new THREE.Vector3(-s.z, 0, s.x);
      if (side.dot(camera.position.clone().sub(p)) < 0) side.negate();
      dir = s.clone().multiplyScalar(-0.55).add(side.multiplyScalar(0.8)).setY(0.22);
    }
    const dist = fitDistance(extent);
    controls.minDistance = extent * 1.35;
    controls.maxDistance = Math.max(dist * 6, 60);
    setOrbitHighlight(id);
    flyTo({ getTarget: (v) => b.getPos(v), dir, dist, dur: 2.2, arc: 0.12 });
  } else {
    const o = deep.objects.get(id);
    const dist = o.dist * (isMobile() ? 1.55 : 1);
    controls.minDistance = id === 'milkyway' ? 1500 : o.dist * 0.25;
    controls.maxDistance = id === 'milkyway' ? 26000 : o.dist * 6;
    flyTo({ getTarget: (v) => v.copy(o.pos), dir: o.view, dist, dur: id === 'milkyway' ? 2.6 : 3.0, arc: 0.1 });
  }
}

function unfocus() {
  if (!state.focus) return;
  state.focus = null;
  closePanelUI();
  syncCards();
  updateViewOffsetTarget();
  state.lastInteract = performance.now();
  if (state.mode === 'solar') {
    setOrbitHighlight(null);
    goSolarOverview(2.2);
  } else {
    goDeepOverview(2.6);
  }
}

function goSolarOverview(dur) {
  const ov = overviewSolar();
  controls.minDistance = 8; controls.maxDistance = 700;
  // 保留当前的水平方位角，更自然
  const az = Math.atan2(camera.position.x, camera.position.z);
  const dir = new THREE.Vector3(Math.sin(az) * ov.dir.z, ov.dir.y, Math.cos(az) * ov.dir.z);
  flyTo({ getTarget: (v) => v.set(0, 0, 0), dir, dist: ov.dist, dur, arc: 0.08 });
}
function goDeepOverview(dur) {
  const o = deep.objects.get('milkyway');
  controls.minDistance = 300; controls.maxDistance = 26000;
  flyTo({ getTarget: (v) => v.copy(GAL_CENTER), dir: o.view, dist: o.dist * (isMobile() ? 1.6 : 1), dur, arc: 0.05 });
}

function setMode(mode) {
  if (state.intro || mode === state.mode) return;
  document.querySelectorAll('.mode').forEach((b) => b.classList.toggle('active', b.dataset.mode === mode));
  if (state.focus) { state.focus = null; closePanelUI(); updateViewOffsetTarget(); }
  state.mode = mode;
  document.body.classList.toggle('deep', mode === 'deep');
  ui.regionZh.textContent = mode === 'solar' ? '太阳系' : '深空';
  ui.regionEn.textContent = mode === 'solar' ? 'The Solar System' : 'Deep Space';
  ui.dockTitle.textContent = mode === 'solar' ? '选择天体' : '深空图鉴';
  ui.dockSub.textContent = mode === 'solar' ? 'Choose your world' : 'Deep-sky atlas';
  buildCards();
  const f0 = state.deepFade, b0 = state.bandFade;
  if (mode === 'deep') {
    setOrbitHighlight(null);
    tween(3.6, (e) => { state.deepFade = lerp(f0, 1, clamp(e * 1.4 - 0.2)); state.bandFade = lerp(b0, 0, clamp(e * 1.6)); },
      () => { solar.group.visible = false; });
    // 从太阳系一路拉远到银河系全景
    const o = deep.objects.get('milkyway');
    controls.minDistance = 300; controls.maxDistance = 26000;
    flyTo({ getTarget: (v) => v.copy(GAL_CENTER), dir: o.view, dist: o.dist * (isMobile() ? 1.6 : 1), dur: 4.2, arc: 0.0 });
  } else {
    solar.group.visible = true;
    tween(3.6, (e) => { state.deepFade = lerp(f0, 0, clamp(e * 1.5)); state.bandFade = lerp(b0, 1, clamp(e * 1.4 - 0.3)); });
    goSolarOverview(4.0);
  }
}

// ---------------- 交互 ----------------
let down = null;
canvas.addEventListener('pointerdown', (e) => {
  down = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId, multi: !e.isPrimary };
  state.lastInteract = performance.now();
  ui.hint.classList.add('gone');
});
canvas.addEventListener('pointerup', (e) => {
  if (!down || !e.isPrimary) { down = null; return; }
  const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
  const quick = performance.now() - down.t < 600;
  down = null;
  if (moved > 8 || !quick || state.intro || fly) return;
  const id = pickAt(e.clientX, e.clientY);
  if (id) { if (id !== state.focus) select(id); }
});
canvas.addEventListener('pointermove', (e) => {
  state.mouse.set(e.clientX / innerWidth * 2 - 1, e.clientY / innerHeight * 2 - 1);
  if (e.pointerType === 'mouse' && !down && !state.intro && !fly) {
    canvas.classList.toggle('pointer', !!pickAt(e.clientX, e.clientY));
  }
});
controls.addEventListener('start', () => { state.lastInteract = performance.now(); });
canvas.addEventListener('wheel', () => { state.lastInteract = performance.now(); ui.hint.classList.add('gone'); }, { passive: true });

$('#p-close').addEventListener('click', unfocus);
const step = (k) => {
  const list = currentList();
  const i = list.indexOf(state.focus);
  select(list[(i + k + list.length) % list.length]);
};
$('#p-prev').addEventListener('click', () => step(-1));
$('#p-next').addEventListener('click', () => step(1));
document.querySelectorAll('.mode').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));
window.addEventListener('keydown', (e) => {
  if (state.intro) { if (e.key === 'Escape' || e.key === ' ') skipIntro(); return; }
  if (e.key === 'Escape') unfocus();
  else if (e.key === 'ArrowRight' && state.focus) step(1);
  else if (e.key === 'ArrowLeft' && state.focus) step(-1);
});

// 手机面板：下拉手柄关闭
(() => {
  const grip = ui.panel.querySelector('.panel-grip');
  const top = ui.panel.querySelector('.panel-top');
  let sy = null;
  const start = (e) => { sy = e.touches[0].clientY; };
  const move = (e) => {
    if (sy == null) return;
    const dy = e.touches[0].clientY - sy;
    if (dy > 0) ui.panel.style.transform = `translateY(${dy}px)`;
  };
  const end = (e) => {
    if (sy == null) return;
    const dy = (e.changedTouches[0]?.clientY ?? sy) - sy;
    sy = null;
    ui.panel.style.transform = '';
    if (dy > 70) unfocus();
  };
  for (const el of [grip, top]) {
    el.addEventListener('touchstart', start, { passive: true });
    el.addEventListener('touchmove', move, { passive: true });
    el.addEventListener('touchend', end);
  }
})();

function onResize() {
  const w = innerWidth, h = innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  composer.setSize(w, h);
  bloom.resolution.set(w, h);
  shared.scale.value = h / 2;
  updateViewOffsetTarget();
  state.viewOff.copy(state.viewOffTarget);
}
window.addEventListener('resize', onResize);

// ---------------- 片头 ----------------
const INTRO_START = new THREE.Vector3(60, 420, 9000);
function startIntro() {
  camera.position.copy(INTRO_START);
  controls.target.set(0, 0, 0);
  camera.fov = 72; camera.updateProjectionMatrix();
  camera.lookAt(0, 0, 0);
  setTimeout(() => ui.intro.classList.add('show'), 400);
  introTimers.push(setTimeout(() => { ui.intro.classList.add('hide'); }, 5600));
  const ov = overviewSolar();
  flyTo({
    getTarget: (v) => v.set(0, 0, 0), dir: ov.dir, dist: ov.dist, dur: 7.6, fov: 45, arc: 0.0,
    done: endIntro,
  });
}
const introTimers = [];
function endIntro() {
  if (!state.intro) return;
  state.intro = false;
  introTimers.forEach(clearTimeout);
  ui.intro.classList.add('hide');
  ui.intro.classList.remove('show');
  setTimeout(() => { ui.intro.style.display = 'none'; }, 1700);
  ui.hud.classList.add('show');
  controls.enabled = true;
  state.lastInteract = performance.now();
  tween(2.5, (e) => dust.setOpacity(1 - e), () => { dust.visible = false; });
  setTimeout(() => ui.hint.classList.add('gone'), 9000);
}
function skipIntro() {
  if (!state.intro || !fly) return;
  // 快进到最后一段
  fly.t = Math.max(fly.t, fly.dur * 0.86);
  ui.intro.classList.add('hide');
}
ui.skip.addEventListener('click', skipIntro);
ui.intro.addEventListener('click', skipIntro);

// ---------------- 主循环 ----------------
const clock = new THREE.Clock();
let rafId = 0, running = false;
const _fwd = new THREE.Vector3();
function frame() {
  rafId = requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.05);
  shared.time.value += dt;

  for (let i = tweens.length - 1; i >= 0; i--) {
    const tw = tweens[i];
    tw.t += dt;
    const k = clamp(tw.t / tw.dur);
    tw.fn(easeInOut(k));
    if (k >= 1) { tweens.splice(i, 1); tw.done && tw.done(); }
  }

  // 模拟时间：聚焦时放慢公转，便于观察
  const wantScale = state.focus ? 0.12 : 1;
  state.timeScale = lerp(state.timeScale, wantScale, 1 - Math.exp(-dt * 2));
  if (solar.group.visible) {
    state.simTime += dt * state.timeScale;
    solar.update(dt, state.simTime, camera, state.focus);
  }
  deep.setOpacity(state.deepFade);
  deep.update(dt, camera, state.focus);
  sky.setBandOpacity(state.bandFade);

  // 镜头：飞行 / 跟随 / 自转
  if (fly) updateFly(dt);
  else {
    if (state.focus) {
      const t = state.mode === 'solar' ? solar.bodies.get(state.focus).getPos(tmpV) : tmpV.copy(deep.objects.get(state.focus).pos);
      tmpV2.copy(t).sub(lastTarget);
      camera.position.add(tmpV2);
      controls.target.add(tmpV2);
      lastTarget.copy(t);
    }
    const idle = performance.now() - state.lastInteract;
    controls.autoRotate = idle > (state.focus ? 3500 : 7000);
    controls.autoRotateSpeed = state.focus ? 0.6 : (state.mode === 'deep' ? 0.12 : 0.2);
    controls.update();
  }

  // 背景跟随镜头（始终处于无穷远），并随鼠标轻微视差
  sky.position.copy(camera.position);
  state.mouseS.lerp(state.mouse, 1 - Math.exp(-dt * 2.5));
  sky.userData.inner.rotation.set(state.mouseS.y * 0.025, state.mouseS.x * 0.04, 0);

  meteors(dt, camera, !state.intro);
  applyViewOffset(dt);
  updateLabels();
  composer.render(dt);
}
function start() {
  if (running) return;
  running = true;
  clock.getDelta();
  rafId = requestAnimationFrame(frame);
}
function stop() { running = false; cancelAnimationFrame(rafId); }
document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); else start(); });

// ---------------- 启动 ----------------
async function init() {
  const jobs = [
    ['mercury', 512], ['venus', 512], ['earth', 1024], ['earthClouds', 1024], ['moon', 512],
    ['mars', 512], ['jupiter', 1024], ['saturn', 1024], ['uranus', 512], ['neptune', 512],
  ];
  const total = jobs.length + 5;
  let done = 0;
  const progress = () => { done++; const p = Math.round(done / total * 100); ui.pct.textContent = p + '%'; ui.fill.style.width = p + '%'; };
  for (const [id, size] of jobs) { tex[id] = TX.planetCanvas(id, size); progress(); await tick(); }

  sky = buildSky(); scene.add(sky); progress(); await tick();
  solar = buildSolar(tex); scene.add(solar.group); progress(); await tick();
  deep = buildDeep(); scene.add(deep.group); progress(); await tick();
  dust = buildIntroDust(INTRO_START.z, 400); scene.add(dust);
  meteors = buildMeteors(scene);
  progress(); await tick();

  for (const id of SOLAR_ORDER) portraitCache.set(id, planetPortrait(id, 140).toDataURL());
  for (const id of DEEP_ORDER) deepPortraitCache.set(id, deepPortrait(id, 140).toDataURL());
  for (const id of SOLAR_ORDER) makeLabel(id, bodyData.get(id).zh, bodyData.get(id).color);
  for (const id of DEEP_ORDER) makeLabel(id, deepData.get(id).zh, deepData.get(id).color);
  makeLabel('here', '你在这里<small>You are here · 太阳系</small>', '#8fe3ff', 'here');
  buildCards();
  progress();

  // 预编译着色器，避免片头卡顿
  camera.position.copy(INTRO_START); camera.lookAt(0, 0, 0);
  deep.setOpacity(1);
  renderer.compile(scene, camera);
  deep.setOpacity(0);

  ui.loader.classList.add('done');
  startIntro();
  start();
}

init().catch((e) => { console.error(e); fail('星海加载失败，请刷新重试。'); });
