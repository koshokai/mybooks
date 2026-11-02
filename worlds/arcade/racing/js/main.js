/* 星际竞速 · 主程序：界面流程、比赛生命周期、特效与音效调度、奖励与存档 */
import * as THREE from 'three';
import { TRACKS, PAINTS, PLAYER_SHIP, PLACE_DUST, TRACK_MULT } from './config.js';
import { Track } from './track.js';
import { World } from './world.js';
import { buildScenery } from './scenery.js';
import { ShipModel, Trail } from './ship.js';
import { Race } from './race.js';
import { CameraDirector } from './camera.js';
import { Sparks, SpeedLines } from './fx.js';
import { AudioEngine } from './audio.js';
import { Input } from './input.js';
import { HUD, fmt } from './hud.js';
import { Store, Arcade } from './store.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

/* ---------- 画质 ---------- */
const params = new URLSearchParams(location.search);
const coarse = matchMedia('(pointer: coarse)').matches || params.has('touch');
const smallScreen = Math.min(innerWidth, innerHeight) < 600;
const LOW = coarse || smallScreen || params.has('low');
const Q = {
  low: LOW,
  dpr: Math.min(window.devicePixelRatio || 1, LOW ? 1.5 : 2),
  msaa: LOW ? 0 : 4,
  bloomScale: LOW ? 0.5 : 1,
  skySize: LOW ? 512 : 1024,
  stars: LOW ? 1200 : 2600,
  sparks: LOW ? 420 : 900,
};
if (coarse) document.body.classList.add('touch');

/* ---------- 核心对象 ---------- */
let world;
try { world = new World($('#cv'), Q); }
catch (e) {
  $('#ld-text').textContent = '抱歉，你的浏览器不支持 WebGL，无法运行这款 3D 游戏。';
  throw e;
}
const director = new CameraDirector(world.camera);
const audio = new AudioEngine();
const input = new Input();
const hud = new HUD();
const sparks = new Sparks(Q.sparks, Q.dpr);
world.scene.add(sparks.points);
const speedLines = new SpeedLines(LOW ? 70 : 140);
world.camera.add(speedLines.lines);
const shipLayer = new THREE.Group();
world.scene.add(shipLayer);

const S = Store.data;
let state = 'boot';
let trackIdx = clamp(S.lastTrack | 0, 0, TRACKS.length - 1);
let mode = 'race';
let track = null, pal = null, scenery = null, startGate = null;
let race = null, attract = null;
const ships = new Map();
let ghostShip = null, showcase = null;
let paused = false, time = 0, timeScale = 1;
let previewPaint = S.paint;
let resultTimer = 0;
let loading = false;

const paintById = (id) => PAINTS.find((p) => p.id === id) || PAINTS[0];
const curPaint = () => paintById(S.paint);

/* ---------- 设置 ---------- */
function applyMute(m) { document.body.classList.toggle('muted', m); audio.setMuted(m); }
applyMute(!!S.settings.muted);
audio.setMusic(S.settings.music !== false);
director.far = S.settings.cam === 1;
function syncToggles() {
  $('#music-toggle').textContent = '音乐 ' + (S.settings.music !== false ? '开' : '关');
  $('#cam-toggle').textContent = '镜头 ' + (director.far ? '远' : '近');
}
syncToggles();

/* ---------- 加载遮罩 ---------- */
function showLoading(on, text) {
  if (text) $('#ld-text').textContent = text;
  $('#loading').classList.toggle('show', on);
}

/* ---------- 星尘 ---------- */
function refreshDust() { $$('.dust-val').forEach((el) => { el.textContent = Arcade.getStardust().toLocaleString(); }); }
Arcade.on('change', refreshDust);
refreshDust();

/* ---------- 提示（成就等） ---------- */
const toastQ = [];
let toastBusy = false;
function toast(html) {
  toastQ.push(html);
  if (!toastBusy) nextToast();
}
function nextToast() {
  const el = $('#toast');
  const h = toastQ.shift();
  if (!h) { toastBusy = false; return; }
  toastBusy = true;
  el.innerHTML = h;
  el.classList.add('show');
  setTimeout(() => { el.classList.remove('show'); setTimeout(nextToast, 400); }, 2600);
}
function unlock(id, name) {
  if (Arcade.unlock('racing:' + id, name)) { toast(`✦ 成就解锁 · <b>${name}</b>`); audio.ach(); }
}

/* ============ 世界构建 ============ */
async function loadTrack(idx) {
  try { await buildTrackWorld(idx); }
  catch (e) {
    console.error(e);
    loading = false;
    showLoading(true, '赛道加载失败，请刷新页面重试');
    throw e;
  }
}
async function buildTrackWorld(idx) {
  loading = true;
  showLoading(true, '正在生成赛道 · ' + TRACKS[idx].name);
  await nextFrame(); await nextFrame();
  clearShips();
  if (showcase) { shipLayer.remove(showcase.root); showcase.dispose(); showcase = null; }
  world.clear();
  trackIdx = idx;
  const def = TRACKS[idx];
  pal = def.palette;
  track = new Track(def);
  director.setTrack(track);
  world.buildSky(pal, idx * 3.7 + 1.3);
  world.content.add(world.buildLights(pal));
  world.stars = world.buildStars(Q.stars, pal);
  world.content.add(world.stars);
  world.content.add(track.buildMeshes(pal, Q, world.envCube));
  startGate = track.buildStartGate(pal, world.envMap);
  world.content.add(startGate.group);
  scenery = buildScenery(def.scenery, track, pal, Q);
  world.content.add(scenery);
  sparks.clear();
  hud.setupMap(track, pal);
  world.final.uniforms.uFlashColor.value.set(pal.accent2);
  speedLines.color.set(pal.accent);
  try { world.renderer.compile(world.scene, world.camera); } catch (e) {}
  S.lastTrack = idx; Store.save();
  await nextFrame();
  showLoading(false);
  loading = false;
}

function clearShips() {
  $('#nametags').innerHTML = ''; tagEls.clear();
  for (const v of ships.values()) { shipLayer.remove(v.model.root); v.trails.forEach((t) => { shipLayer.remove(t.mesh); t.geo.dispose(); t.mat.dispose(); }); v.model.dispose(); }
  ships.clear();
  if (ghostShip) { shipLayer.remove(ghostShip.root); ghostShip.dispose(); ghostShip = null; }
}

function addShip(r, paint, body) {
  const model = new ShipModel(paint, body, { envMap: world.envMap, low: Q.low });
  const n = Q.low ? 22 : 34;
  const tw = r.isPlayer ? 0.12 : 0.24;
  const trails = [new Trail(paint.glow, n, tw), new Trail(paint.glow, n, tw)];
  if (r.isPlayer) trails.forEach((t) => t.mat.uniforms.uNear.value.set(9, 26));
  shipLayer.add(model.root);
  trails.forEach((t) => shipLayer.add(t.mesh));
  ships.set(r, { model, trails, seed: Math.random() * 10, gapSign: 0, paint, col: new THREE.Color(paint.glow) });
}

function spawnShips(rc) {
  clearShips();
  for (const r of rc.racers) {
    if (r.isPlayer) addShip(r, curPaint(), PLAYER_SHIP.body);
    else addShip(r, r.persona.paint, r.persona.body || PLAYER_SHIP.body);
  }
}

/* ---------- 标题背景：AI 表演赛 ---------- */
function startAttract() {
  race = null;
  attract = new Race(track, 'attract', { paint: curPaint(), seed: (Math.random() * 1e6) | 0 });
  attract.clock = 0; attract.started = true;
  attract.racers.forEach((r, i) => { r.reset(120 + i * 26 + Math.random() * 8, (Math.random() - 0.5) * 10); r.vf = 60 + Math.random() * 10; });
  spawnShips(attract);
  director.cine = null;
  setLights(-1);
}

/* ============ 界面流程 ============ */
function showScreen(id) {
  $$('.screen').forEach((s) => s.classList.toggle('show', s.id === id));
}

function toTitle() {
  state = 'title';
  hud.show(false);
  document.body.classList.remove('racing');
  input.enabled = false;
  $$('.modal').forEach((m) => m.classList.remove('show'));
  if (!attract || race) startAttract();
  showScreen('scr-title');
  refreshDust();
  audio.setEngine(false, 0, 0, 0, 0);
  audio.playMusic(3, 0);
  audio.setLevel(0);
  audio.setDuck(1);
}

function toSelect(m) {
  if (m) mode = m;
  state = 'select';
  if (!attract) startAttract();
  showScreen('scr-select');
  renderCards();
  syncModeSwitch();
}

function syncModeSwitch() {
  $$('.mode-switch button').forEach((b) => b.classList.toggle('on', b.dataset.mode === mode));
  $('#sel-mode').textContent = mode === 'race' ? 'GRAND PRIX · SIX SHIPS · THREE LAPS' : 'TIME TRIAL · RACE YOUR GHOST';
  $('#sel-title').textContent = mode === 'race' ? '大奖赛' : '计时赛';
  $('#sel-hint').textContent = mode === 'race' ? '前三名登上领奖台 · 名次越高星尘越多' : '独自跑三圈，刷新纪录后会留下你的幽灵';
}

function renderCards() {
  const box = $('#cards');
  box.innerHTML = '';
  TRACKS.forEach((def, i) => {
    const b = S.best[def.id] || {};
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'card-track' + (i === trackIdx ? ' on' : '');
    el.style.setProperty('--c', def.palette.accent);
    const medal = b.place ? `<span class="ct-medal">${b.place === 1 ? '★ 冠军' : '最佳第 ' + b.place + ' 名'}</span>` : '';
    el.innerHTML = `${medal}<canvas width="560" height="240"></canvas>
      <div class="ct-name"><b>${def.name}</b><span>${def.en}</span></div>
      <div class="ct-meta"><span class="ct-stars">${'★'.repeat(def.diff)}${'☆'.repeat(3 - def.diff)}</span><span>${def.tag}</span><span>${(trackLen(def) / 1000).toFixed(2)} km</span></div>
      <p class="ct-desc">${def.desc}</p>
      <div class="ct-best"><span>最快单圈 <b>${b.lap ? fmt(b.lap) : '--'}</b></span><span>最佳总时 <b>${b.total ? fmt(b.total) : '--'}</b></span></div>`;
    drawTrackThumb(el.querySelector('canvas'), def);
    el.addEventListener('click', () => selectTrack(i));
    box.appendChild(el);
  });
  const on = box.children[trackIdx];
  if (on && on.scrollIntoView) on.scrollIntoView({ block: 'nearest', inline: 'center' });
}

const thumbCache = new Map(), lenCache = new Map();
function trackLen(def) {
  if (track && track.def === def) return track.length;
  if (!lenCache.has(def.id)) lenCache.set(def.id, new Track(def).length);
  return lenCache.get(def.id);
}
function drawTrackThumb(cv, def) {
  let pts = thumbCache.get(def.id);
  if (!pts) {
    const t = track && track.def === def ? track : new Track(def);
    lenCache.set(def.id, t.length);
    pts = [];
    for (let i = 0; i < t.n; i += 8) pts.push([t.P[i * 3], t.P[i * 3 + 2], t.P[i * 3 + 1]]);
    thumbCache.set(def.id, pts);
  }
  const x = cv.getContext('2d');
  const W = cv.width, H = cv.height;
  let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9, minY = 1e9, maxY = -1e9;
  for (const [a, b, y] of pts) { minX = Math.min(minX, a); maxX = Math.max(maxX, a); minZ = Math.min(minZ, b); maxZ = Math.max(maxZ, b); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
  const sc = Math.min((W - 40) / (maxX - minX), (H - 40) / (maxZ - minZ));
  const ox = (W - (maxX - minX) * sc) / 2, oz = (H - (maxZ - minZ) * sc) / 2;
  const P = (a, b) => [ox + (a - minX) * sc, oz + (b - minZ) * sc];
  x.clearRect(0, 0, W, H);
  x.lineCap = 'round'; x.lineJoin = 'round';
  // 底影
  x.beginPath(); pts.forEach(([a, b], i) => { const [u, v] = P(a, b); i ? x.lineTo(u, v) : x.moveTo(u, v); }); x.closePath();
  x.strokeStyle = 'rgba(0,0,0,.6)'; x.lineWidth = 14; x.stroke();
  // 分段着色（高度）
  for (let i = 0; i < pts.length; i++) {
    const p0 = pts[i], p1 = pts[(i + 1) % pts.length];
    const t = (p0[2] - minY) / (maxY - minY + 1e-6);
    const [u0, v0] = P(p0[0], p0[1]), [u1, v1] = P(p1[0], p1[1]);
    x.strokeStyle = t > 0.5 ? def.palette.accent2 : def.palette.accent;
    x.globalAlpha = 0.55 + t * 0.45;
    x.shadowColor = x.strokeStyle; x.shadowBlur = 10;
    x.lineWidth = 5 + t * 3;
    x.beginPath(); x.moveTo(u0, v0); x.lineTo(u1, v1); x.stroke();
  }
  x.globalAlpha = 1; x.shadowBlur = 0;
  const [sx, sy] = P(pts[0][0], pts[0][1]);
  x.fillStyle = '#fff'; x.beginPath(); x.arc(sx, sy, 7, 0, Math.PI * 2); x.fill();
}

async function selectTrack(i) {
  if (loading) return;
  audio.click();
  if (i === trackIdx) return;
  await loadTrack(i);
  startAttract();
  renderCards();
}

/* ---------- 机库 ---------- */
function toGarage() {
  state = 'garage';
  if (!attract) startAttract();
  showScreen('scr-garage');
  previewPaint = S.paint;
  if (!showcase) {
    showcase = new ShipModel(curPaint(), PLAYER_SHIP.body, { envMap: world.envMap, low: Q.low });
    const ring = new THREE.Mesh(new THREE.RingGeometry(3.2, 3.5, 64), new THREE.MeshBasicMaterial({ color: new THREE.Color(pal.accent).multiplyScalar(2.5), side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = -1.1;
    const disc = new THREE.Mesh(new THREE.CircleGeometry(3.2, 64), new THREE.MeshBasicMaterial({ color: new THREE.Color(pal.accent).multiplyScalar(0.25), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    disc.rotation.x = -Math.PI / 2; disc.position.y = -1.12;
    showcase.root.add(ring, disc);
    shipLayer.add(showcase.root);
  }
  showcase.setPaint(curPaint());
  showcase.root.visible = true;
  director.orbitS = 40;
  renderSwatches();
}

function renderSwatches() {
  const box = $('#swatches');
  box.innerHTML = '';
  PAINTS.forEach((p) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'sw' + (p.id === previewPaint ? ' on' : '');
    b.style.setProperty('--p', p.primary); b.style.setProperty('--s', p.secondary); b.style.setProperty('--g', p.glow);
    b.setAttribute('aria-label', p.name);
    const owned = Store.owns(p.id);
    b.innerHTML = `<i></i>${owned ? (p.id === S.paint ? '<span class="eq">✓</span>' : '') : `<span class="lock">✦${p.price}</span>`}`;
    b.addEventListener('click', () => { previewPaint = p.id; showcase && showcase.setPaint(p); audio.click(); renderSwatches(); });
    box.appendChild(b);
  });
  const p = paintById(previewPaint);
  $('#g-name').textContent = p.name;
  $('#g-en').textContent = p.en;
  const owned = Store.owns(p.id), dust = Arcade.getStardust();
  const btn = $('#g-action');
  btn.disabled = false;
  if (owned) {
    btn.textContent = p.id === S.paint ? '已装备' : '装备';
    btn.disabled = p.id === S.paint;
    $('#g-note').innerHTML = p.id === S.paint ? '当前涂装。比赛赢得星尘，可以解锁更多涂装。' : '已拥有，点击装备。';
  } else {
    btn.textContent = `购买 ✦ ${p.price}`;
    btn.disabled = dust < p.price;
    $('#g-note').innerHTML = dust < p.price ? `还差 <b>✦ ${p.price - dust}</b> 星尘——去赛道上赢回来吧。` : `花费 <b>✦ ${p.price}</b> 星尘解锁「${p.name}」。`;
  }
}

$('#g-action').addEventListener('click', () => {
  const p = paintById(previewPaint);
  if (Store.owns(p.id)) {
    Store.setPaint(p.id); audio.click();
  } else if (Arcade.spendStardust(p.price)) {
    Store.addPaint(p.id); Store.setPaint(p.id); audio.buy();
    toast(`已解锁涂装 · <b>${p.name}</b>`);
    unlock('paint', '焕然一新');
  } else { audio.denied(); }
  refreshDust();
  renderSwatches();
});

/* ============ 比赛 ============ */
async function startRace(m, idx) {
  if (loading) return;
  if (idx !== trackIdx || !track) await loadTrack(idx);
  mode = m;
  attract = null;
  if (showcase) showcase.root.visible = false;
  $$('.modal').forEach((md) => md.classList.remove('show'));
  showScreen(null);
  const ghost = m === 'trial' ? Store.ghost(track.def.id) : null;
  race = new Race(track, m, { paint: curPaint(), touch: coarse || input.touchMode, ghost, seed: (Math.random() * 1e6) | 0 });
  spawnShips(race);
  if (ghost && ghost.data) {
    ghostShip = new ShipModel(curPaint(), PLAYER_SHIP.body, { holo: '#7fe8ff' });
    shipLayer.add(ghostShip.root);
    ghostShip.root.visible = false;
  }
  director.psi = 0; director.x = race.player.x; director.speedV = 0; director.boostV = 0; director.shakeAmp = 0;
  setLights(0);
  state = 'race';
  paused = false;
  resultTimer = 0;
  lastPlace = 0;
  fireworks = 0;
  hintState = null;
  $('#h-hint').classList.remove('show');
  hud.show(true);
  hud.cache = {};
  document.body.classList.add('racing');
  input.reset();
  input.enabled = true;
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  audio.playMusic(track.def.music, 1);
  audio.setLevel(1);
  audio.setDuck(1);
  if (m === 'trial') hud.message('计时赛', ghost ? `幽灵 · 最佳单圈 ${fmt(ghost.lap)}` : '跑出好成绩，留下你的幽灵', 'top', 2.6);
  else hud.message(track.def.name, track.def.en + ' · 3 LAPS', 'top', 2.6);
}

function setLights(stage) {
  if (!startGate) return;
  startGate.lights.forEach((l, i) => {
    const c = l.material.color;
    if (stage < 0) c.setRGB(0.1, 0.4, 0.5);
    else if (stage === 4) c.setRGB(0.3, 3.5, 1.2);
    else if (i < stage * 2 - (stage === 3 ? 1 : 0) && stage > 0) c.setRGB(4, 0.25, 0.15);
    else c.setRGB(0.12, 0.03, 0.03);
  });
}

function pause() {
  if (!race || (state !== 'race' && state !== 'finishing') || paused) return;
  paused = true;
  input.enabled = false;
  $('#pause-sub').textContent = `${track.def.name} · ${mode === 'race' ? '大奖赛' : '计时赛'} · 第 ${Math.min(race.laps, race.player.lap + 1)} / ${race.laps} 圈`;
  $('#m-pause').classList.add('show');
  audio.setEngine(false, 0, 0, 0, 0);
  audio.setDuck(0.35);
}
function resume() {
  if (!paused) return;
  paused = false;
  $('#m-pause').classList.remove('show');
  input.reset();
  input.enabled = state === 'race';
  audio.setDuck(1);
  lastT = performance.now();
}

input.on('pause', () => {
  if (state === 'race' || state === 'finishing') { paused ? resume() : pause(); }
  else if ($('#m-help').classList.contains('show')) $('#m-help').classList.remove('show');
});
input.on('mute', () => toggleMute());
input.on('camera', () => { director.far = !director.far; Store.setSetting('cam', director.far ? 1 : 0); syncToggles(); });

function toggleMute() {
  audio.unlock();
  S.settings.muted = !S.settings.muted; Store.save();
  applyMute(S.settings.muted);
}

/* ---------- 事件 → 特效/音效 ---------- */
const V1 = new THREE.Vector3(), V2 = new THREE.Vector3(), V3 = new THREE.Vector3();
const C_HOT = new THREE.Color(1, 0.62, 0.25), C_WHITE = new THREE.Color(1, 1, 1);
let hitSlot = 0;
let flash = 0;

function racerVelocity(r, out) {
  const f = track.frameAt(r.dist);
  const c = Math.cos(r.psi), s = Math.sin(r.psi);
  const vt = r.vf * c - r.vp * s, vn = r.vf * s + r.vp * c;
  return out.copy(f.T).multiplyScalar(vt).addScaledVector(f.L, vn);
}

function handleRacerEvent(r, e) {
  const isP = r.isPlayer && race && r === race.player;
  if (e.type === 'wall') {
    const f = track.frameAt(r.dist);
    V1.copy(f.P).addScaledVector(f.L, r.x + e.side * 1.3).addScaledVector(f.U, 0.5);
    racerVelocity(r, V2).multiplyScalar(0.5).addScaledVector(f.L, -e.side * 6);
    sparks.emit(V1, V2, C_HOT, Math.min(60, 10 + e.impact * 2), { spread: 10, life: 0.6, size: 0.45, up: 3 });
    const u = track.fenceMat.uniforms.uHits.value[hitSlot++ % 4];
    u.set(track.wrap(r.dist), e.side, 0, Math.min(1.5, 0.4 + e.impact / 25));
    if (isP) { director.shake(Math.min(0.9, e.impact / 35)); audio.wall(e.impact); flash = Math.max(flash, 0.12); }
  } else if (e.type === 'grind') {
    if (Math.random() < 0.25) {
      const f = track.frameAt(r.dist);
      V1.copy(f.P).addScaledVector(f.L, r.x + e.side * 1.35).addScaledVector(f.U, 0.4);
      racerVelocity(r, V2).multiplyScalar(0.55);
      sparks.emit(V1, V2, C_HOT, 1, { spread: 5, life: 0.35, size: 0.32, up: 2 });
    }
    if (isP) grindT = 0.1;
  } else if (isP) {
    if (e.type === 'driftStart') audio.driftStart();
    else if (e.type === 'charge') { audio.charge(e.level); hudPulse(); }
    else if (e.type === 'driftRelease') { audio.driftRelease(); director.shake(0.08); }
    else if (e.type === 'boost') { audio.boost(); director.shake(0.2); flash = Math.max(flash, 0.22); }
    else if (e.type === 'pad') { audio.pad(); flash = Math.max(flash, 0.3); director.shake(0.12); }
  }
  if (e.type === 'pad' || (e.type === 'boost' && !isP)) {
    const f = track.frameAt(r.dist);
    V1.copy(f.P).addScaledVector(f.L, r.x).addScaledVector(f.U, 0.6);
    racerVelocity(r, V2).multiplyScalar(0.6);
    sparks.emit(V1, V2, ships.get(r)?.col || C_WHITE, isP ? 26 : 10, { spread: 9, life: 0.5, size: 0.4 });
  }
}
let grindT = 0;
function hudPulse() { const el = $('#h-energy'); el.classList.remove('pulse'); void el.offsetWidth; el.classList.add('pulse'); }

function handleRaceEvent(e) {
  if (e.type === 'count') { hud.countdown(e.n); audio.count(e.n); setLights(4 - e.n); }
  else if (e.type === 'go') {
    hud.countdown(0); audio.count(0); setLights(4); audio.setLevel(2);
  } else if (e.type === 'perfect') {
    hud.message('完美起步', 'PERFECT START', 'gold', 1.4); audio.perfect(); flash = 0.35; director.shake(0.25);
    unlock('perfect', '完美起步');
  } else if (e.type === 'bump') {
    const p = race.player;
    if (e.a === p || e.b === p) {
      director.shake(0.25 * e.power); audio.bump(e.power);
      const o = e.a === p ? e.b : e.a;
      const f = track.frameAt(p.dist);
      V1.copy(f.P).addScaledVector(f.L, (p.x + o.x) / 2).addScaledVector(f.U, 0.6);
      racerVelocity(p, V2).multiplyScalar(0.6);
      sparks.emit(V1, V2, C_WHITE, 16, { spread: 8, life: 0.4, size: 0.35 });
    }
  } else if (e.type === 'lap') {
    const best = Math.min(...e.r.lapTimes);
    const isBest = e.time <= best + 1e-6 && e.r.lapTimes.length > 1;
    if (e.final) { hud.message('最后一圈', 'FINAL LAP' + (isBest ? ' · 最快圈 ' + fmt(e.time) : ''), 'pink', 2); audio.lap(true); audio.setLevel(3); }
    else { hud.message(`第 ${e.lap + 1} 圈`, (isBest ? '最快圈 ' : '单圈 ') + fmt(e.time), '', 1.6); audio.lap(false); }
  } else if (e.type === 'finish') {
    if (e.r === race.player) onPlayerFinish();
  }
}

/* ---------- 完赛与结算 ---------- */
function onPlayerFinish() {
  const p = race.player;
  state = 'finishing';
  race.setAutopilot(true);
  input.enabled = false;
  document.body.classList.remove('racing');
  const place = mode === 'race' ? p.place : 1;
  const first = place === 1;
  hud.message(mode === 'trial' ? '完成' : first ? '冠军' : `第 ${place} 名`, (mode === 'trial' ? '总用时 ' : 'FINISH · ') + fmt(p.finishTime), first ? 'gold' : '', 2.6);
  audio.finish(place);
  audio.setLevel(1);
  flash = 0.4;
  resultTimer = 2.8;
  fireworks = place <= 3 || mode === 'trial' ? 2.2 : 0.8;
}
let fireworks = 0, fwAcc = 0;
const FW_COLS = [new THREE.Color('#ffd36b'), new THREE.Color('#ff5ad1'), new THREE.Color('#4de8ff'), new THREE.Color('#b98bff'), new THREE.Color('#7dffb0')];
function updateFireworks(dt) {
  if (fireworks <= 0 || !race) return;
  fireworks -= dt;
  fwAcc += dt;
  if (fwAcc < 0.18) return;
  fwAcc = 0;
  const p = race.player;
  const f = track.frameAt(p.dist + 18 + Math.random() * 20);
  V1.copy(f.P).addScaledVector(f.L, (Math.random() - 0.5) * track.width * 0.8).addScaledVector(f.U, 6 + Math.random() * 10);
  racerVelocity(p, V2).multiplyScalar(0.9);
  const c = FW_COLS[(Math.random() * FW_COLS.length) | 0];
  sparks.emit(V1, V2, c, Q.low ? 50 : 90, { spread: 32, life: 1.25, size: 0.34, bright: 3.4, jitter: 0.2, sphere: true });
}

function showResults() {
  state = 'result';
  hud.show(false);
  const p = race.player;
  const def = track.def;
  const L = mode === 'race' ? race.finalizeOthers() : [p];
  const place = mode === 'race' ? p.finalPlace : 1;
  const total = p.finishTime;
  const bestLap = Math.min(...p.lapTimes);
  const rec = Store.best(def.id);
  const newTotal = !rec.total || total < rec.total;
  const newLap = !rec.lap || bestLap < rec.lap;
  const hadRecord = !!rec.lap;
  // —— 星尘
  const lines = [];
  const mult = TRACK_MULT[trackIdx];
  if (mode === 'race') lines.push([`第 ${place} 名奖励`, Math.round(PLACE_DUST[place - 1] * mult)]);
  else lines.push(['完成计时赛', Math.round(12 * mult)]);
  if (newTotal && hadRecord) lines.push(['刷新总用时纪录', 15]);
  if (newLap && hadRecord) lines.push(['刷新单圈纪录', mode === 'trial' ? 18 : 8]);
  if (!hadRecord) lines.push(['首次完赛此赛道', 10]);
  if (p.stats.wallHits === 0) lines.push(['零碰撞护栏', 10]);
  if (p.stats.maxDrift >= 3) lines.push(['长距离漂移', 5]);
  const sum = lines.reduce((a, l) => a + l[1], 0);
  Arcade.addStardust(sum, 'racing');
  Arcade.recordBest('racing:' + def.id, Math.round(total * 1000), 'low');
  Arcade.recordBest('racing:' + def.id + ':lap', Math.round(bestLap * 1000), 'low');
  // —— 本地纪录
  if (newTotal) rec.total = total;
  if (newLap) rec.lap = bestLap;
  if (mode === 'race' && (!rec.place || place < rec.place)) rec.place = place;
  S.races = (S.races | 0) + 1;
  S.hinted = (S.hinted | 0) + 1;
  if (mode === 'race' && place === 1) { S.wins[def.id] = (S.wins[def.id] | 0) + 1; }
  // 幽灵
  let ghostMsg = '';
  if (mode === 'trial' && race.bestLapGhost) {
    const g = Store.ghost(def.id);
    if (!g || race.bestLapGhost.lap < g.lap) {
      Store.setGhost(def.id, race.bestLapGhost);
      ghostMsg = g ? '超越了幽灵！新的幽灵已保存' : '已保存你的最佳单圈幽灵';
      if (g) unlock('ghost', '超越自我');
    }
  }
  Store.save();
  // —— 成就
  unlock('first-finish', '星际首航');
  if (mode === 'race' && place <= 3) unlock('podium', '登上领奖台');
  if (mode === 'race' && place === 1) unlock('win', '星际冠军');
  if (TRACKS.every((t) => (S.wins[t.id] | 0) > 0)) unlock('triple', '三冠王');
  if (p.stats.maxDrift >= 3) unlock('drift', '漂移大师');
  if (mode === 'race' && p.stats.wallHits === 0) unlock('clean', '零失误');

  // —— 填写界面
  $('#r-eyebrow').textContent = `${def.name} · ${mode === 'race' ? '大奖赛' : '计时赛'}`;
  const pl = $('#r-place');
  const suf = ['ST', 'ND', 'RD', 'TH', 'TH', 'TH'][place - 1];
  pl.className = 'r-place' + (place === 1 ? ' p1' : '');
  pl.innerHTML = mode === 'race' ? `<b>${place}</b><span>${suf}</span>` : `<b style="font-size:64px">${fmt(total)}</b>`;
  $('#r-title').textContent = mode === 'trial' ? (ghostMsg ? '新的幽灵' : '计时赛完成') : ['星际冠军', '亚军', '季军', '第四名', '第五名', '第六名'][place - 1];
  $('#r-total').innerHTML = fmt(total) + (newTotal && hadRecord ? '<em>纪录</em>' : '');
  $('#r-lap').innerHTML = fmt(bestLap) + (newLap && hadRecord ? '<em>纪录</em>' : '');
  const tb = $('#r-table');
  if (mode === 'race') {
    const leader = L[0].finishTime;
    tb.innerHTML = L.map((r, i) => `<li class="${r === p ? 'me' : ''}"><span class="rk">${i + 1}</span><span class="dot" style="color:${r.color};background:${r.color}"></span><span class="nm">${r === p ? '你 · 流光' : r.name}<small>${r === p ? PLAYER_SHIP.team : r.team}</small></span><span class="tm">${i === 0 ? fmt(r.finishTime) : '+' + (r.finishTime - leader).toFixed(2) + 's'}</span></li>`).join('');
    tb.style.display = '';
  } else {
    tb.innerHTML = p.lapTimes.map((t, i) => `<li class="${t === bestLap ? 'me' : ''}"><span class="rk">${i + 1}</span><span class="dot" style="color:${pal.accent};background:${pal.accent}"></span><span class="nm">第 ${i + 1} 圈${t === bestLap ? '<small>最快</small>' : ''}</span><span class="tm">${fmt(t)}</span></li>`).join('') + (ghostMsg ? `<li class="me"><span class="rk">✦</span><span class="dot" style="color:#7fe8ff;background:#7fe8ff"></span><span class="nm">${ghostMsg}</span><span class="tm"></span></li>` : '');
    tb.style.display = '';
  }
  $('#r-dust').innerHTML = lines.map(([k, v]) => `<div class="ln"><span>${k}</span><b>+${v}</b></div>`).join('') + `<div class="ln tot"><span>✦ 获得星尘</span><b>+${sum}</b></div><div class="ln"><span>当前星尘</span><b>${Arcade.getStardust().toLocaleString()}</b></div>`;
  $('#r-next').style.display = trackIdx < TRACKS.length - 1 ? '' : 'none';
  $('#m-result').classList.add('show');
  refreshDust();
}

/* ============ 每帧 ============ */
const M4 = new THREE.Matrix4();
const fwd = new THREE.Vector3(), left = new THREE.Vector3(), right = new THREE.Vector3(), back = new THREE.Vector3();
const nozL = new THREE.Vector3(), nozR = new THREE.Vector3(), sideV = new THREE.Vector3();
const roadPos = [], roadCol = [];

function placeModel(model, r, dist, x, psi, roll, pitch, hover) {
  const f = track.frameAt(dist);
  const c = Math.cos(psi), s = Math.sin(psi);
  fwd.copy(f.T).multiplyScalar(c).addScaledVector(f.L, s);
  left.copy(f.L).multiplyScalar(c).addScaledVector(f.T, -s);
  right.copy(left).negate(); back.copy(fwd).negate();
  M4.makeBasis(right, f.U, back);
  model.root.quaternion.setFromRotationMatrix(M4);
  model.root.position.copy(f.P).addScaledVector(f.L, x).addScaledVector(f.U, hover);
  model.tilt.rotation.set(-pitch, 0, -roll);
  model.root.updateMatrixWorld(true);
  return f;
}

function updateShips(dt, rc) {
  if (!rc || !track) return;
  let k = 0;
  const p = rc.player;
  for (const [r, v] of ships) {
    const hover = 1.0 + Math.sin(time * 2.4 + v.seed) * 0.07;
    const f = placeModel(v.model, r, r.dist, r.x, r.psi, r.rollV, r.pitchV, hover);
    const boost = r.boosting ? 1 : 0;
    v.boostV = (v.boostV || 0) + (boost - (v.boostV || 0)) * Math.min(1, dt * 6);
    v.model.updateFlames(time, rc.started || rc.mode === 'attract' ? clamp(r.speed / r.topSpeed, 0.25, 1) : 0.3, v.boostV);
    // 光轨
    const G = v.model.G;
    nozL.set(-G.podX, 0.06, 1.7); nozR.set(G.podX, 0.06, 1.7);
    v.model.root.localToWorld(nozL); v.model.root.localToWorld(nozR);
    sideV.copy(right);
    v.trailAcc = (v.trailAcc || 0) + dt;
    if (v.trailAcc > 1 / 60) { v.trailAcc = 0; v.trails[0].push(nozL, sideV, time); v.trails[1].push(nozR, sideV, time); }
    v.trails[0].update(nozL, sideV, time); v.trails[1].update(nozR, sideV, time);
    const ta = clamp((r.speed - 20) / 60, 0, 1) * (0.55 + v.boostV * 0.9) * (r.isPlayer && rc.mode !== 'attract' ? 0.3 : 1);
    v.trails[0].mat.uniforms.uAlpha.value = ta; v.trails[1].mat.uniforms.uAlpha.value = ta;
    // 路面光斑
    if (k < 6) {
      const u = track.roadMat.uniforms;
      u.uShipPos.value[k].copy(f.P).addScaledVector(f.L, r.x);
      u.uShipCol.value[k].copy(v.col).multiplyScalar(0.5 + v.boostV * 0.7);
      k++;
    }
    // 漂移火花
    if (r.drifting && Math.random() < dt * 40) {
      const lv = Math.floor(r.energy);
      const col = lv >= 2 ? C_GOLD : lv >= 1 ? C_PINK : C_CYAN;
      const side = Math.random() < 0.5 ? nozL : nozR;
      racerVelocity(r, V2).multiplyScalar(0.7);
      V3.copy(side).addScaledVector(f.U, -0.6);
      sparks.emit(V3, V2, col, r === p ? 2 : 1, { spread: 4, life: 0.4, size: 0.3, up: 1.5 });
    }
    // 掠过声
    if (p && r !== p && rc.started) {
      const g = rc.gap(r, p);
      const sg = Math.sign(g);
      if (v.gapSign && sg !== v.gapSign && Math.abs(g) < 6 && Math.abs(r.x - p.x) < 8 && r.speed > 40) audio.passBy(clamp((p.x - r.x) / 6, -0.9, 0.9));
      v.gapSign = sg;
    }
  }
  for (; k < 6; k++) track.roadMat.uniforms.uShipPos.value[k].set(0, -9999, 0);
  // 幽灵
  if (ghostShip && rc.ghost && p) {
    const lt = rc.started && !p.finished ? rc.clock - p.lapStart : -1;
    const g = lt >= 0 ? rc.ghostState(lt) : null;
    ghostShip.root.visible = !!g;
    if (g) { placeModel(ghostShip, null, g.dist + p.lap * track.length, g.x, g.psi, g.roll, 0, 1.0); ghostShip.updateFlames(time, 1, 0); }
  }
}
const C_CYAN = new THREE.Color('#5ef0ff'), C_PINK = new THREE.Color('#ff5ad1'), C_GOLD = new THREE.Color('#ffd36b');

let lastT = performance.now();
let fpsAcc = 0, fpsN = 0, dprLevel = Q.dpr;

function frame(now) {
  requestAnimationFrame(frame);
  if (document.hidden) { lastT = now; return; }
  let dt = Math.min(0.1, Math.max(0, (now - lastT) / 1000));
  lastT = now;
  // 自适应分辨率
  fpsAcc += dt; fpsN++;
  if (fpsAcc > 2.5) {
    const avg = fpsAcc / fpsN;
    if (avg > 1 / 36 && !params.has('dev') && !loading) {
      if (dprLevel > 1) { dprLevel = Math.max(1, dprLevel - 0.25); world.setDpr(dprLevel); hud.setupMap(track, pal); }
      else if (world.bloom.enabled && avg > 1 / 30) { world.bloom.enabled = false; world.renderer.toneMappingExposure = 1.12; }
    }
    fpsAcc = 0; fpsN = 0;
  }
  if (paused || loading || !track) return;
  dt *= timeScale;
  time += dt;
  update(dt);
  world.render();
}

function update(dt) {
  const rc = race || attract;
  if (race) {
    const p = race.player;
    if (state === 'race' && !race.autopilot) input.apply(p.input);
    race.update(dt);
    for (const r of race.racers) { for (const e of r.events) handleRacerEvent(r, e); r.events.length = 0; }
    for (const e of race.events) handleRaceEvent(e);
    race.events.length = 0;
    if (state === 'finishing') { resultTimer -= dt / timeScale; if (resultTimer <= 0) showResults(); }
    if (state === 'result') {
      const f = track.frameAt(p.dist);
      director.orbitS = p.dist;
      V1.copy(f.P).addScaledVector(f.L, p.x).addScaledVector(f.U, 1.2);
      director.updateOrbit(dt, V1, null, 9.5, 2.6, 0.32);
    } else director.updateRace(dt, race, p);
    // 速度感
    const sp = clamp(p.speed / p.topSpeed, 0, 1.5);
    const bv = director.boostV;
    const inten = state === 'result' ? 0 : clamp((p.speed - 50) / 55, 0, 1) * 0.5 + bv * 0.9 + p.slip * 0.25;
    speedLines.update(dt, p.speed, inten, bv > 0.3 ? C_PINK : null);
    if (bv <= 0.3) speedLines.color.set(pal.accent);
    const fu = world.final.uniforms;
    fu.uBlur.value = state === 'result' ? 0 : (Q.low ? 0.6 : 1) * (bv * 0.045 + Math.max(0, sp - 0.85) * 0.03);
    fu.uAberr.value = 0.0012 + bv * 0.004;
    const near = track.half - 4.2;
    fu.uWarn.value.set(state === 'race' ? clamp((p.x - near) / 2.5, 0, 1) : 0, state === 'race' ? clamp((-p.x - near) / 2.5, 0, 1) : 0);
    // 引擎声
    grindT = Math.max(0, grindT - dt);
    audio.setEngine(state !== 'result', clamp(p.speed / (p.topSpeed * 1.35), 0, 1), bv, p.drifting ? Math.min(1, p.energy / 3) + 0.2 : 0, grindT > 0 ? 1 : 0);
    if (state === 'race' || state === 'finishing') { hud.update(race, p, time); hud.drawMap(race.racers, p, time); }
    updateNameTags();
    updateHints();
    // 名次变化
    if (state === 'race' && race.started) {
      if (lastPlace && p.place < lastPlace) { const el = $('#h-pos'); el.classList.remove('up'); void el.offsetWidth; el.classList.add('up'); }
      lastPlace = p.place;
    }
  } else if (attract) {
    attract.update(dt);
    for (const r of attract.racers) r.events.length = 0;
    attract.events.length = 0;
    if (state === 'garage' && showcase) {
      const f = track.frameAt(40);
      V1.copy(f.P).addScaledVector(f.U, 7.5 + Math.sin(time * 1.6) * 0.25);
      showcase.root.position.copy(V1);
      M4.makeBasis(f.L.clone().negate(), f.U, f.T.clone().negate());
      showcase.root.quaternion.setFromRotationMatrix(M4);
      showcase.tilt.rotation.set(0, time * 0.25, Math.sin(time * 1.3) * 0.04);
      showcase.updateFlames(time, 0.5, 0);
      director.orbitS = 40;
      const portrait = world.camera.aspect < 0.9;
      V2.copy(V1).addScaledVector(f.U, portrait ? -3.6 : -0.9);
      director.updateOrbit(dt, V2, null, portrait ? 13.5 : 9.2, portrait ? 4.6 : 2.6, 0.18);
    } else director.updateCine(dt, attract);
    speedLines.update(dt, 0, 0);
    const fu = world.final.uniforms;
    fu.uBlur.value = 0; fu.uWarn.value.set(0, 0); fu.uAberr.value = 0.0012;
  }
  updateShips(dt, rc);
  sparks.update(dt);
  // 着色器时间
  if (track) {
    track.roadMat.uniforms.uTime.value = time;
    track.fenceMat.uniforms.uTime.value = time;
    track.padMat.uniforms.uTime.value = time;
    for (const h of track.fenceMat.uniforms.uHits.value) { if (h.w > 0) { h.z += dt; if (h.z > 1.5) h.w = 0; } }
  }
  if (scenery) scenery.userData.update(time, dt, world.camera);
  if (world.stars) { world.stars.position.copy(world.camera.position); world.starMat.uniforms.uTime.value = time; }
  if (startGate) startGate.group.traverse((o) => { if (o.userData.holo) o.userData.holo.uniforms.uTime.value = time; });
  updateFireworks(dt);
  flash *= Math.exp(-dt * 6);
  world.final.uniforms.uFlash.value = flash * 0.32;
}
let lastPlace = 0;

/* ---------- 新手提示（前几场比赛） ---------- */
let hintState = null;
function hint(html, dur = 3.2) {
  const el = $('#h-hint');
  el.innerHTML = html; el.classList.add('show');
  clearTimeout(hint.t); hint.t = setTimeout(() => el.classList.remove('show'), dur * 1000);
}
function updateHints() {
  if (!race || state !== 'race' || !race.started || (S.hinted | 0) >= 3) return;
  const p = race.player, touch = document.body.classList.contains('touch');
  const h = hintState || (hintState = { drift: false, boost: false });
  if (!h.drift && race.clock > 2.5 && Math.abs(track.maxKappaAhead(p.s, 60)) > 0.005) {
    h.drift = true;
    hint(touch ? '弯道来了：按住方向，再点一下「漂移」，过弯蓄能' : '弯道来了：按住 <kbd>←</kbd>/<kbd>→</kbd> 的同时按住 <kbd>Shift</kbd> 漂移蓄能', 4);
  } else if (h.drift && !h.boost && p.energy >= 1 && !p.drifting) {
    h.boost = true;
    hint(touch ? '能量已就绪 · 点「加速」冲刺！' : '能量已就绪 · 按 <kbd>E</kbd> 冲刺！', 3.4);
  }
}

/* ---------- 对手名牌 ---------- */
const tagEls = new Map();
const TAGV = new THREE.Vector3();
function updateNameTags() {
  const box = $('#nametags');
  const show = race && (state === 'race') && race.started;
  if (!show) { if (box.childElementCount) { box.innerHTML = ''; tagEls.clear(); } return; }
  const cam = world.camera, W = world.w, H = world.h;
  cam.updateMatrixWorld();
  for (const r of race.racers) {
    if (r === race.player) continue;
    let el = tagEls.get(r);
    if (!el) {
      el = document.createElement('div');
      el.className = 'ntag';
      el.style.setProperty('--c', r.color);
      el.innerHTML = `<i></i><span>${r.name}</span><b></b>`;
      box.appendChild(el); tagEls.set(r, el);
    }
    track.worldPos(r.dist, r.x, 3.1, TAGV);
    const d = TAGV.distanceTo(cam.position);
    TAGV.project(cam);
    const vis = TAGV.z < 1 && d < 150 && d > 7 && Math.abs(TAGV.x) < 1.1 && Math.abs(TAGV.y) < 1.1;
    const op = vis ? Math.min(1, (150 - d) / 50) * Math.min(1, (d - 7) / 6) : 0;
    el.style.opacity = op.toFixed(2);
    if (op > 0) {
      el.style.transform = `translate3d(${((TAGV.x * 0.5 + 0.5) * W).toFixed(1)}px, ${((-TAGV.y * 0.5 + 0.5) * H).toFixed(1)}px, 0) translate(-50%, -100%)`;
      const pl = String(r.place);
      if (el._pl !== pl) { el._pl = pl; el.lastChild.textContent = 'P' + pl; }
    }
  }
}

/* ============ 界面事件 ============ */
document.addEventListener('click', (e) => {
  const go = e.target.closest('[data-go]');
  if (go) {
    audio.click();
    const g = go.dataset.go;
    if (g === 'race' || g === 'trial') toSelect(g);
    else if (g === 'garage') toGarage();
    else if (g === 'title') toTitle();
    else if (g === 'help') $('#m-help').classList.add('show');
    return;
  }
  const act = e.target.closest('[data-act]');
  if (act) {
    audio.click();
    const a = act.dataset.act;
    if (a === 'resume') resume();
    else if (a === 'restart') { paused = false; $('#m-pause').classList.remove('show'); startRace(mode, trackIdx); }
    else if (a === 'quit') { paused = false; $('#m-pause').classList.remove('show'); race = null; clearShips(); toTitle(); }
    else if (a === 'close') $('#m-help').classList.remove('show');
    else if (a === 'again') startRace(mode, trackIdx);
    else if (a === 'next') startRace(mode, Math.min(TRACKS.length - 1, trackIdx + 1));
    else if (a === 'menu') { $('#m-result').classList.remove('show'); race = null; clearShips(); startAttract(); toSelect(mode); }
    else if (a === 'garage') { $('#m-result').classList.remove('show'); race = null; clearShips(); startAttract(); toGarage(); }
  }
});
$$('.mode-switch button').forEach((b) => b.addEventListener('click', () => { mode = b.dataset.mode; audio.click(); syncModeSwitch(); }));
$('#btn-go').addEventListener('click', () => { audio.click(); startRace(mode, trackIdx); });
$('#btn-pause').addEventListener('click', () => pause());
$$('.snd-toggle').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); toggleMute(); }));
$('#music-toggle').addEventListener('click', () => { S.settings.music = S.settings.music === false; Store.save(); audio.setMusic(S.settings.music); syncToggles(); });
$('#cam-toggle').addEventListener('click', () => { director.far = !director.far; Store.setSetting('cam', director.far ? 1 : 0); syncToggles(); });
$('#m-help').addEventListener('click', (e) => { if (e.target.id === 'm-help') $('#m-help').classList.remove('show'); });
if (!coarse) $$('.btn').forEach((b) => b.addEventListener('pointerenter', () => audio.hover()));

input.bindTouch($('#touch'), $('#t-drift'), $('#t-boost'), (sd) => {
  $('.tz-l').classList.toggle('on', sd.l);
  $('.tz-r').classList.toggle('on', sd.r);
});

// 第一次交互后才启动音频
function firstGesture() {
  audio.unlock();
  if (audio.pending) { const [s, l] = audio.pending; audio.pending = null; audio.playMusic(s, l); }
  else if (!audio.seq) audio.playMusic(state === 'race' ? track.def.music : 3, state === 'race' ? 2 : 0);
}
window.addEventListener('pointerdown', firstGesture, { passive: true });
window.addEventListener('keydown', firstGesture);

// 切到后台：暂停
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { if (state === 'race') pause(); audio.hiddenPause = true; audio.suspend(); }
  else { audio.hiddenPause = false; audio.resume(); lastT = performance.now(); }
});
window.addEventListener('resize', () => {
  world.resize();
  if (track) hud.setupMap(track, pal);
});
window.addEventListener('orientationchange', () => setTimeout(() => { world.resize(); if (track) hud.setupMap(track, pal); }, 250));

/* ============ 调试接口（自动化测试用） ============ */
window.__SR = {
  get state() { return state; },
  info() {
    const p = race && race.player;
    return { state, mode, track: trackIdx, paused, clock: race ? race.clock : null, started: race ? race.started : null,
      player: p ? { dist: p.dist, s: p.s, x: p.x, psi: p.psi, speed: p.speed, lap: p.lap, place: p.place, finished: p.finished, energy: p.energy, drifting: p.drifting, boosting: p.boosting, kappa: track.kappaAt(p.dist + 20), half: track.half, wallHits: p.stats.wallHits } : null,
      length: track ? track.length : 0 };
  },
  autopilot(on) { if (race) race.setAutopilot(on); },
  giveEnergy() { if (race && race.player) race.player.energy = Math.max(race.player.energy, 1.2); },
  timeScale(n) { timeScale = n; },
  start(m, i) { return startRace(m || 'race', i | 0); },
  toTitle() { toTitle(); },
};

/* ============ 启动 ============ */
(async function boot() {
  try {
    const texts = TRACKS.map((t) => t.name + t.en).join('') + '星际竞速起点星港欢迎你银河速度联赛限速光速加速带星港不夜城赤炎环带危险陨石区立交飞越能量补给幽冥视界引力异常事件视界请勿靠近最后的弯道';
    await Promise.race([Promise.all([document.fonts.load(`900 40px "Noto Serif SC"`, texts), document.fonts.load(`600 20px "Noto Serif SC"`, texts)]), sleep(1800)]);
  } catch (e) {}
  await loadTrack(trackIdx);
  toTitle();
  requestAnimationFrame((t) => { lastT = t; frame(t); });
})();
