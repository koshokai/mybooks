// 驰 · 星环列车 —— 主程序
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { LANE_X, ROOF_H, POW_INFO, BIOME_SECONDS, JET_T } from './config.js';
import { Sim, laneOf } from './sim.js';
import { BIOMES, MIX, snapshot, blendFrom, blendBiomes } from './gfx/biomes.js';
import { BEND, makeAtlas } from './gfx/util.js';
import { Sky } from './gfx/sky.js';
import { Track } from './gfx/track.js';
import { Props } from './gfx/props.js';
import { Robot } from './gfx/robot.js';
import { FX } from './gfx/fx.js';
import { Decor } from './gfx/decor.js';
import { Sound } from './audio.js';
import { Save } from './missions.js';

const $ = (s) => document.querySelector(s);
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const lerp = (a, b, t) => a + (b - a) * t;
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
const smooth = (t) => t * t * (3 - 2 * t);
const smoother = (t) => t * t * t * (t * (t * 6 - 15) + 10);
const fmt = (n) => Math.floor(n).toLocaleString('zh-CN');
const params = new URLSearchParams(location.search);

const AR = window.WXArcade || {
  getStardust: () => 0, addStardust: () => 0, spendStardust: () => false, getBest: () => null, recordBest: () => false, unlock: () => false,
};
const GAME_ID = 'metro';
const REVIVE_COST = 50;
const TITLE_BIOME = 1;

function fail(msg) {
  document.body.classList.remove('is-loading');
  const d = document.createElement('div');
  d.className = 'fail';
  d.innerHTML = `<div>${msg}<br><a href="../index.html" style="color:#ffb547">← 游戏厅</a></div>`;
  document.body.appendChild(d);
}

// ———————————————————— 渲染器 ————————————————————
const canvas = $('#gl');
const MOBILE = matchMedia('(pointer: coarse)').matches || Math.min(screen.width, screen.height) < 700;
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
  if (!renderer.capabilities.isWebGL2) throw new Error('webgl2');
} catch (e) {
  fail('你的浏览器暂不支持 WebGL 2，无法运行星环列车。<br>请换用较新的 Chrome / Safari / Edge。');
  throw e;
}
const QLOCK = params.get('q'); // high / low：锁定画质（截图、测试用）
const PR_MAX = MOBILE ? 1.5 : 2;
let PR = Math.min(window.devicePixelRatio || 1, PR_MAX);
if (QLOCK === 'low') PR = 1;
renderer.setPixelRatio(PR);
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x000000, 50, 330);
const hemi = new THREE.HemisphereLight(0xffffff, 0x222233, 1);
const key = new THREE.DirectionalLight(0xffffff, 2);
scene.add(hemi, key, key.target);
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.3, 440);

// ———————————————————— 等字体，再画贴图 ————————————————————
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await Promise.race([
  Promise.all([
    document.fonts?.load('900 40px "Noto Serif SC"', '星环货运滑小心').catch(() => {}),
    document.fonts?.load('700 40px "Cormorant Garamond"', '0123×2').catch(() => {}),
  ]),
  sleep(1600),
]);

const atlas = makeAtlas();
const sky = new Sky(renderer, { mobile: MOBILE });
const track = new Track(scene);
const props = new Props(scene, atlas);
const robot = new Robot(scene);
const fx = new FX(scene, renderer);
const decor = new Decor(scene);
const sound = new Sound();
const save = new Save();
const sim = new Sim();

// ———————————————————— 后期 ————————————————————
const FinishShader = {
  uniforms: {
    tDiffuse: { value: null }, uVig: { value: 0.32 }, uCA: { value: 0 }, uFlash: { value: 0 }, uFlashCol: { value: new THREE.Color(1, 1, 1) },
    uTint: { value: new THREE.Color(1, 0.2, 0.15) }, uTintAmt: { value: 0 }, uTime: { value: 0 }, uGrain: { value: 0.018 }, uAspect: { value: 1 },
  },
  vertexShader: /* glsl */`varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform float uVig, uCA, uFlash, uTintAmt, uTime, uGrain, uAspect; uniform vec3 uFlashCol, uTint; varying vec2 vUv;
    void main() {
      vec2 c = vUv - 0.5;
      vec2 cc = vec2(c.x * uAspect, c.y);
      float r2 = dot(cc, cc) / max(1.0, uAspect * uAspect * 0.5 + 0.5);
      vec3 col;
      if (uCA > 0.0005) { vec2 o = c * uCA; col = vec3(texture2D(tDiffuse, vUv + o).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - o).b); }
      else col = texture2D(tDiffuse, vUv).rgb;
      float edge = smoothstep(0.08, 0.42, dot(c, c) * 1.6);
      col = mix(col, uTint, edge * uTintAmt);
      col *= 1.0 - uVig * smoothstep(0.1, 0.6, dot(c, c) * 1.8);
      col += uFlashCol * uFlash;
      col += (fract(sin(dot(vUv * (uTime + 1.7), vec2(12.9898, 78.233))) * 43758.5453) - 0.5) * uGrain;
      gl_FragColor = vec4(col, 1.0);
    }`,
};
const rt = new THREE.WebGLRenderTarget(16, 16, { type: THREE.HalfFloatType, samples: QLOCK === 'low' ? 0 : MOBILE ? 2 : 4 });
const composer = new EffectComposer(renderer, rt);
composer.setPixelRatio(PR);
composer.setSize(innerWidth, innerHeight);
const skyPass = new RenderPass(sky.scene, sky.cam);
const mainPass = new RenderPass(scene, camera);
mainPass.clear = false; mainPass.clearDepth = true;
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.6, 0.5, 0.82);
if (MOBILE) { const bs = bloom.setSize.bind(bloom); bloom.setSize = (w, h) => bs(Math.max(2, Math.round(w * 0.6)), Math.max(2, Math.round(h * 0.6))); }
const outPass = new OutputPass();
const finish = new ShaderPass(FinishShader);
composer.addPass(skyPass); composer.addPass(mainPass); composer.addPass(bloom); composer.addPass(outPass); composer.addPass(finish);

// ———————————————————— 状态 ————————————————————
const G = {
  mode: 'loading', time: 0, t0: 0,
  env: { from: null, b: TITLE_BIOME, w: 1 }, forceBiome: null,
  camBlend: 0, camX: 0, camBase: 0, trauma: 0, fovKick: 0, fov: 60, roll: 0,
  flash: 0, ca: 0, tint: 0, slowmo: 1, slowT: 0,
  combo: 0, comboT: 0, committed: 0, reviveT: 0, countT: 0, countN: 0,
  dispScore: 0, lastStep: 0, missionT: 0, runStart: 0, pwEls: {}, bannerBiome: -1,
  fps: 60, ema: 16, qT: 0, bloomOn: true,
};
blendBiomes(TITLE_BIOME, TITLE_BIOME, 1);
G.env.from = snapshot();

// ———————————————————— 相机 ————————————————————
function camParams() {
  const a = innerWidth / innerHeight;
  const p = clamp((1.15 - a) / (1.15 - 0.46), 0, 1); // 0 横屏 → 1 手机竖屏
  return {
    p, fov: lerp(56, 70, p), back: lerp(6.6, 8.9, p), up: lerp(3.25, 4.5, p), ahead: lerp(9, 12, p), lookY: lerp(1.05, 0.9, p), follow: lerp(0.72, 0.62, p),
  };
}
const _look = new THREE.Vector3(), _tp = new THREE.Vector3(), _tl = new THREE.Vector3(), _cp = new THREE.Vector3(), _cl = new THREE.Vector3();
function titlePose(t, pos, look) {
  const cp = camParams();
  const sw = Math.sin(t * 0.18) * 0.35;
  if (cp.p > 0.5) { // 竖屏：机器人在画面中下部
    pos.set(-0.6 + sw * 0.8, 1.55, 5.4);
    look.set(0.15, 2.35, -2);
  } else {
    pos.set(-2.1 + sw, 1.75, 5.0);
    look.set(-1.25 + sw * 0.4, 1.55, -1.2);
  }
}
function chasePose(dt, pos, look) {
  const cp = camParams();
  const p = sim.p;
  const jet = sim.pw.jet > 0;
  G.camX = damp(G.camX, p.x * cp.follow, 6.5, dt);
  const target = jet || p.grounded ? p.y : Math.min(p.y, G.camBase + 1.2) * 0.6 + G.camBase * 0.4;
  G.camBase = damp(G.camBase, Math.max(0, target), jet ? 3 : 5, dt);
  pos.set(G.camX, cp.up + G.camBase, cp.back);
  look.set(G.camX * 0.85 + p.x * 0.12, cp.lookY + G.camBase * 0.92, -cp.ahead);
}
function updateCamera(dt) {
  const cp = camParams();
  titlePose(G.time, _tp, _tl);
  if (G.camBlend > 0) chasePose(dt, _cp, _cl);
  const b = smoother(clamp(G.camBlend, 0, 1));
  camera.position.lerpVectors(_tp, _cp, b);
  _look.lerpVectors(_tl, _cl, b);
  // 震动
  G.trauma = Math.max(0, G.trauma - dt * 1.6);
  const sh = G.trauma * G.trauma;
  if (sh > 0) {
    const t = G.time * 40;
    camera.position.x += (Math.sin(t * 1.3) + Math.sin(t * 2.9)) * 0.18 * sh;
    camera.position.y += (Math.sin(t * 1.7 + 1) + Math.sin(t * 3.3)) * 0.14 * sh;
  }
  if (G.camOverride) { camera.position.fromArray(G.camOverride.pos); _look.fromArray(G.camOverride.look); }
  camera.lookAt(_look);
  const vx = robot.vx || 0;
  G.roll = damp(G.roll, b * clamp(-vx * 0.006, -0.08, 0.08) + sh * Math.sin(G.time * 31) * 0.05, 8, dt);
  camera.rotateZ(G.roll);
  const speedF = clamp((sim.speed - 14) / 16, 0, 1);
  const jetW = robot.jetW || 0;
  G.fovKick = damp(G.fovKick, 0, 3, dt);
  const fov = cp.fov + b * (speedF * 7 + jetW * 8) + G.fovKick;
  if (Math.abs(fov - camera.fov) > 0.01 || camera.aspect !== innerWidth / innerHeight) {
    camera.fov = fov; camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
    fx.setViewport(innerHeight * PR, fov);
  }
}

// ———————————————————— 环境 ————————————————————
const BANNER = $('#banner');
function showBanner(i, first) {
  const B = BIOMES[i % BIOMES.length];
  BANNER.querySelector('small').textContent = first ? `第一站 · ${B.en}` : B.en;
  BANNER.querySelector('b').textContent = B.name;
  BANNER.querySelector('i').textContent = B.sub;
  BANNER.style.setProperty('--bc', B.deckLine);
  BANNER.classList.remove('show'); void BANNER.offsetWidth; BANNER.classList.add('show');
}
function envUpdate(dt) {
  let target = TITLE_BIOME;
  if (G.mode !== 'title' && G.mode !== 'loading') target = sim.biomeIndex() % BIOMES.length;
  if (G.forceBiome != null) target = G.forceBiome;
  if (target !== G.env.b) {
    G.env.from = snapshot(); G.env.b = target; G.env.w = 0;
    if (G.mode !== 'title' && G.forceBiome == null) { showBanner(target, sim.t < 5); sound.biomeWhoosh(); }
    sound.biome = target;
  }
  G.env.w = Math.min(1, G.env.w + dt / (G.forceBiome != null ? 0.6 : 6.5));
  blendFrom(G.env.from, G.env.b, smooth(G.env.w));
  hemi.color.copy(MIX.hemiSky); hemi.groundColor.copy(MIX.hemiGround); hemi.intensity = MIX.hemiInt;
  key.color.copy(MIX.keyCol); key.intensity = MIX.keyInt; key.position.copy(MIX.keyDir).multiplyScalar(30);
  scene.fog.color.copy(MIX.haze);
  renderer.toneMappingExposure = MIX.exposure;
  bloom.strength = MIX.bloom;
  decor.dustU.uCol.value.copy(MIX.dust);
}

// ———————————————————— HUD ————————————————————
const UI = {
  title: $('#title'), score: $('#h-score'), dist: $('#h-dist'), dust: $('#h-dust'), dustBox: $('.h-dust'), mult: $('#h-mult'),
  pw: $('#h-pw'), warn: $('#h-warn'), stumble: $('#h-stumble'), toasts: $('#toasts'), popups: $('#popups'), count: $('#count'),
  mPause: $('#m-pause'), mRevive: $('#m-revive'), mOver: $('#m-over'),
};
function toast(title, sub, icon = '✦') {
  const d = document.createElement('div');
  d.className = 'toast';
  d.innerHTML = `<span class="ti">${icon}</span><span><small>${sub}</small>${title}</span>`;
  UI.toasts.appendChild(d);
  while (UI.toasts.children.length > 3) UI.toasts.firstChild.remove();
  setTimeout(() => d.remove(), 3300);
}
const _pv = new THREE.Vector3();
function popup(text, sub, x, y, z, color = '#ffb547') {
  _pv.set(x, y, z).project(camera);
  const d = document.createElement('div');
  d.className = 'pop';
  d.style.left = `${(_pv.x * 0.5 + 0.5) * innerWidth}px`;
  d.style.top = `${(-_pv.y * 0.5 + 0.5) * innerHeight}px`;
  d.style.setProperty('--c', color);
  d.innerHTML = `${text}${sub ? `<small>${sub}</small>` : ''}`;
  UI.popups.appendChild(d);
  setTimeout(() => d.remove(), 1000);
}
function pwPill(type) {
  const info = POW_INFO[type];
  const d = document.createElement('div');
  d.className = 'pw';
  d.style.setProperty('--c', info.color);
  const ic = { magnet: 'U', shield: '◆', jet: '▲', double: '×2' }[type];
  d.innerHTML = `<svg viewBox="0 0 36 36"><circle class="bg" cx="18" cy="18" r="14"/><circle class="fg" cx="18" cy="18" r="14" stroke-dasharray="88" stroke-dashoffset="0"/></svg><span class="ic">${ic}</span><span>${info.name}</span>`;
  UI.pw.appendChild(d);
  return d;
}
let lastHud = { score: -1, dist: -1, dust: -1, mult: '' };
function updateHud(dt) {
  G.dispScore = sim.score < G.dispScore ? sim.score : damp(G.dispScore, sim.score, 12, dt);
  const sc = Math.round(G.dispScore);
  if (sc !== lastHud.score) { UI.score.textContent = fmt(sc); lastHud.score = sc; }
  const ds = Math.floor(sim.dist);
  if (ds !== lastHud.dist) { UI.dist.textContent = `${fmt(ds)} 米`; lastHud.dist = ds; }
  if (sim.motes !== lastHud.dust) {
    UI.dust.textContent = sim.motes; lastHud.dust = sim.motes;
    UI.dustBox.classList.remove('bump'); void UI.dustBox.offsetWidth; UI.dustBox.classList.add('bump');
  }
  const m = `×${sim.mult}`;
  if (m !== lastHud.mult) { UI.mult.textContent = m; UI.mult.classList.toggle('x2', sim.pw.double > 0); lastHud.mult = m; }
  for (const k of ['jet', 'shield', 'magnet', 'double']) {
    const v = sim.pw[k];
    let el = G.pwEls[k];
    if (v > 0 && !el) el = G.pwEls[k] = pwPill(k);
    if (el) {
      if (v <= 0) { el.remove(); delete G.pwEls[k]; continue; }
      const f = v / POW_INFO[k].dur;
      el.querySelector('.fg').setAttribute('stroke-dashoffset', String(88 * (1 - f)));
      el.classList.toggle('ending', v < 2.2);
    }
  }
  // 迎面来车警示
  let danger = 0;
  for (const ch of sim.chunks) for (const f of ch.feats) {
    if (f.t !== 6 || f.dead) continue;
    const fr = sim.oncFront(f);
    if (fr > sim.dist && fr - sim.dist < 135 && f.lane === sim.p.lane && sim.pw.jet <= 0) danger = Math.max(danger, 1 - (fr - sim.dist) / 135);
  }
  UI.warn.classList.toggle('on', danger > 0 && G.mode === 'run');
  G.danger = damp(G.danger || 0, danger, 8, dt);
  UI.stumble.classList.toggle('on', sim.p.stumbleT > 0 && G.mode === 'run');
}

// ———————————————————— 任务与成就 ————————————————————
function runStats() {
  const s = sim.stats;
  return { motes: sim.motes, slides: s.slides, jumps: s.jumps, dist: sim.dist, roof: s.roof, powerups: s.powerups, jets: s.jets, nearMiss: s.nearMiss, score: sim.score, switches: s.switches, maxClean: s.maxClean, biome: s.biome };
}
function ach(id, name) { if (AR.unlock(`${GAME_ID}:${id}`, name)) toast(name, '成就解锁', '★'); }
function missionsHtml(list, run) {
  return list.map((m) => {
    const prog = Math.min(m.n, save.progress(m, run));
    const pct = Math.round((prog / m.n) * 100);
    return `<li class="${m.done ? 'done' : ''}"><span class="mk">✓</span><span class="mt">${m.text}</span><span class="mp">${m.done ? '完成' : `${fmt(prog)}/${fmt(m.n)}`}</span><span class="bar"><i style="width:${m.done ? 100 : pct}%"></i></span></li>`;
  }).join('');
}
function checkMissions() {
  const done = save.check(runStats());
  for (const m of done) {
    sim.level = save.level;
    AR.addStardust(25, GAME_ID);
    toast(`${m.text}`, `任务完成 · 倍率升至 ×${save.mult} · 星尘 +25`, '✓');
    sound.fanfare();
    ach('mission', '使命必达');
  }
}
function refreshTitle() {
  save.ensureDay();
  $('#t-dust').textContent = fmt(AR.getStardust());
  const best = AR.getBest(GAME_ID);
  $('#t-best').textContent = best == null ? '—' : fmt(best);
  $('#t-mult').textContent = `×${save.mult}`;
  $('#t-missions').innerHTML = missionsHtml(save.list(), null);
}

// ———————————————————— 流程 ————————————————————
function newWorld() {
  const seed = params.get('seed') ? +params.get('seed') : (Math.random() * 2 ** 31) | 0;
  sim.reset(seed, save.level);
  sim.mode = 'idle';
  G.committed = 0; G.dispScore = 0; G.combo = 0; G.camX = 0; G.camBase = 0;
  for (const k in G.pwEls) { G.pwEls[k].remove(); delete G.pwEls[k]; }
  robot.trailPts.length = 0;
  sound.stopLoops();
}

function goTitle() {
  newWorld();
  G.mode = 'title';
  G.camBlend = 0;
  hideModals();
  document.body.classList.remove('playing');
  UI.title.classList.add('show');
  refreshTitle();
  sound.intensity = 0; sound.startMusic(0);
}

function startRun(fromTitle) {
  sound.unlock(); sound.click();
  hideModals();
  if (!fromTitle) newWorld();
  UI.title.classList.remove('show');
  document.body.classList.add('playing');
  sim.mode = 'run';
  sim.bot = !!G.botOn;
  G.mode = 'run';
  G.runStart = G.time;
  G.forceBiome = null;
  if (!fromTitle) G.camBlend = 1;
  sound.intensity = 1; sound.startMusic(1);
  G.bannerShown = false;
}

function hideModals() { for (const m of [UI.mPause, UI.mRevive, UI.mOver]) m.classList.remove('show'); }

function pause() {
  if (G.mode !== 'run' && G.mode !== 'countdown') return;
  G.mode = 'paused';
  sound.stopLoops(); sound.duckMusic(0.35, 999);
  $('#pause-sub').innerHTML = `已跑 <b>${fmt(sim.dist)}</b> 米 · 得分 <b>${fmt(sim.score)}</b>`;
  $('#p-missions').innerHTML = missionsHtml(save.list(), runStats());
  UI.mPause.classList.add('show');
}
function resume() {
  if (G.mode !== 'paused') return;
  UI.mPause.classList.remove('show');
  sound.unlock(); sound.duckMusic(1, 0.01);
  G.mode = 'countdown'; G.countT = 0; G.countN = 3;
  showCount(3);
}
function showCount(n) { UI.count.innerHTML = `<span>${n}</span>`; sound.countdown(false); }

function onDead() {
  const have = AR.getStardust() + (sim.motes - G.committed);
  if (!sim.revived && have >= REVIVE_COST) {
    G.mode = 'revive'; G.reviveT = 5;
    $('#rv-cost').textContent = REVIVE_COST;
    $('#rv-have').textContent = `可用星尘 ✦ ${fmt(have)}（含本局已收集 ${sim.motes - G.committed}）`;
    UI.mRevive.classList.add('show');
  } else gameOver();
}
function acceptRevive() {
  if (G.mode !== 'revive') return;
  if (AR.getStardust() < REVIVE_COST) { const add = sim.motes - G.committed; AR.addStardust(add, GAME_ID); G.committed += add; }
  if (!AR.spendStardust(REVIVE_COST)) { gameOver(); return; }
  UI.mRevive.classList.remove('show');
  sim.revive();
  G.mode = 'run';
  fx.emit('revive', sim.p.x, 1, sim.dist + 0.5);
  sound.revive(); sound.duckMusic(1, 0.01);
  G.flash = 0.6; FinishShader.uniforms.uFlashCol.value.set('#ffd8a0');
  robot.setExpr(1, 1.5);
  ach('revive', '重启核心');
}
function gameOver() {
  G.mode = 'over';
  UI.mRevive.classList.remove('show');
  sound.stopLoops();
  const add = sim.motes - G.committed; AR.addStardust(add, GAME_ID); G.committed = sim.motes;
  const score = sim.score;
  const isBest = AR.recordBest(GAME_ID, score, 'high');
  checkMissions();
  const st = runStats();
  save.commit(st, sim.dist);
  // 成就
  ach('first-run', '首次发车');
  if (sim.dist >= 1000) ach('km1', '千米快递');
  if (sim.dist >= 5000) ach('km5', '环轨老手');
  if (sim.stats.roof >= 200) ach('roof', '车顶漫步');
  if (sim.motes >= 500) ach('dust500', '星尘满仓');
  if (score >= 20000) ach('score20k', '星环传说');
  // 结算卡
  const mult = 1 + sim.level;
  $('#o-eyebrow').textContent = isBest ? 'NEW RECORD' : '运单结算';
  $('#o-title').textContent = sim.dist > 3000 ? '跑出了一条传说' : sim.dist > 1200 ? '漂亮的一程' : '再快一点就送到了';
  $('#o-dist').textContent = `${fmt(sim.dist)} 米`;
  $('#o-distpts').textContent = fmt(sim.distPts);
  $('#o-motes').textContent = `✦ ${sim.motes}`;
  $('#o-motepts').textContent = fmt(sim.motePts);
  $('#o-near').textContent = `${sim.stats.nearMiss} 次`;
  $('#o-bonus').textContent = fmt(sim.bonusPts);
  $('#o-mult').textContent = `×${mult}${sim.stats.powerups ? ` · 道具 ${sim.stats.powerups} 个` : ''}`;
  $('#o-dust').innerHTML = `本局星尘 <b>+${sim.motes}</b> 已存入星尘账户 · 现有 ✦ <b>${fmt(AR.getStardust())}</b>`;
  $('#o-missions').innerHTML = missionsHtml(save.list(), null);
  $('#o-record').classList.toggle('on', isBest && score > 0);
  UI.mOver.classList.add('show');
  // 分数滚动
  const el = $('#o-score'); const t0 = performance.now();
  const roll = (now) => { const u = Math.min(1, (now - t0) / 900); el.textContent = fmt(score * (1 - Math.pow(1 - u, 3))); if (u < 1 && G.mode === 'over') requestAnimationFrame(roll); };
  requestAnimationFrame(roll);
  if (isBest && score > 0) setTimeout(() => sound.fanfare(), 450);
  sound.intensity = 0;
  document.body.classList.remove('playing');
}

// ———————————————————— 事件（模拟 → 画面 / 声音） ————————————————————
const POWC = { magnet: '#6fc8ff', shield: '#5ff2c4', jet: '#ff9a4a', double: '#ff6fd8' };
function handleEvents() {
  const p = sim.p;
  for (const e of sim.events) {
    switch (e.type) {
      case 'lane': sound.lane(e.dir); break;
      case 'edge': sound.edge(e.dir); G.trauma = Math.min(1, G.trauma + 0.12); break;
      case 'jump': sound.jump(); robot.squash(0.84, 1.2); if (e.flip) robot.flipStart = true; fx.emit('dust', p.x, p.y + 0.05, sim.dist, { n: 6, size: 0.6 }); break;
      case 'dive': sound.dive(); break;
      case 'land':
        sound.land(e.impact); robot.squash(1 + Math.min(0.28, e.impact * 0.022), 1 - Math.min(0.3, e.impact * 0.024));
        if (e.impact > 8) { fx.emit('dust', p.x, p.y + 0.05, sim.dist, { n: 10 + Math.min(10, e.impact) }); G.trauma = Math.min(1, G.trauma + Math.min(0.35, e.impact * 0.02)); }
        break;
      case 'slide': sound.slide(); robot.squash(1.12, 0.88); break;
      case 'mote': {
        G.combo = Math.min(G.combo + 1, 10); G.comboT = 0.75;
        sound.mote(G.combo, clamp(e.x / 4, -0.8, 0.8));
        fx.emit(e.dbl > 1 ? 'moteX' : 'mote', e.x, e.y, e.s);
        break;
      }
      case 'power': {
        sound.power(e.pw);
        fx.emit('power', e.x, e.y, e.s, { colors: [POWC[e.pw], '#ffffff'] });
        G.flash = 0.42; FinishShader.uniforms.uFlashCol.value.set(POWC[e.pw]);
        G.fovKick += 5; robot.setExpr(1, 1.2);
        popup(`${POW_INFO[e.pw].name}！`, '', p.x, p.y + 2.4, 0, POWC[e.pw]);
        if (e.pw === 'magnet') sound.loop('magnet', true);
        if (e.pw === 'jet') ach('jet', '喷射升空');
        break;
      }
      case 'jetstart': sound.jetStart(); sound.intensity = 2; G.fovKick += 6; G.trauma = Math.min(1, G.trauma + 0.3); break;
      case 'powend':
        if (e.pw === 'jet') { sound.loop('jet', false); sound.intensity = 1; }
        if (e.pw === 'magnet') sound.loop('magnet', false);
        if (e.pw !== 'shield') sound.powEnd();
        break;
      case 'shieldbreak': {
        sound.shieldBreak();
        fx.emit('shard', p.x, p.y + 0.9, sim.dist, { jx: 1, jy: 1 });
        if (e.f) fx.emit('smash', LANE_X[e.f.lane] ?? p.x, 1.3, Math.max(sim.dist + 1, e.f.t === 6 ? sim.oncFront(e.f) : e.f.s0), { jx: 2, jy: 2, js: 2 });
        G.flash = 0.55; FinishShader.uniforms.uFlashCol.value.set('#7affd8');
        G.trauma = Math.min(1, G.trauma + 0.55); G.slowmo = 0.35; G.slowT = 0.35; G.ca = 0.012;
        popup('护盾抵挡', '', p.x, p.y + 2.4, 0, '#5ff2c4');
        ach('shield', '护盾挡灾');
        break;
      }
      case 'stumble':
        sound.stumble(); G.trauma = Math.min(1, G.trauma + 0.5); robot.setExpr(2, 0.8);
        G.flash = 0.18; FinishShader.uniforms.uFlashCol.value.set('#ff4a3a'); G.ca = 0.008;
        break;
      case 'crash':
        sound.crash(); sound.stopLoops();
        G.trauma = 1; G.flash = 0.7; FinishShader.uniforms.uFlashCol.value.set('#ffe0c0'); G.ca = 0.02;
        fx.emit('boom', p.x, p.y + 0.9, sim.dist + 0.6, { jx: 0.6, jy: 0.6 });
        robot.setExpr(2, 30);
        G.mode = 'dying'; G.slowmo = 0.3; G.slowT = 0.8;
        if (navigator.vibrate) try { navigator.vibrate(120); } catch (er) {}
        break;
      case 'dead': onDead(); break;
      case 'horn': sound.horn(e.same); break;
      case 'passby': sound.passby(e.adj); if (e.adj) G.trauma = Math.min(1, G.trauma + 0.18); break;
      case 'nearmiss':
        sound.nearMiss(); popup(`+${e.bonus}`, '擦肩', p.x, p.y + 2.2, 0, '#ff8a6a');
        ach('near', '擦肩而过');
        break;
      case 'biome': if (e.index >= 4) ach('aurora', '极光之下'); break;
      case 'revive': break;
    }
  }
  sim.events.length = 0;
}

// ———————————————————— 输入 ————————————————————
function act(a) {
  if (G.mode !== 'run') return;
  sim.input(a);
}
addEventListener('keydown', (e) => {
  sound.unlock();
  const k = e.key;
  const code = e.code;
  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' '].includes(k)) e.preventDefault();
  if (G.mode === 'title' && (k === 'Enter' || k === ' ')) { beginFromTitle(); return; }
  if (G.mode === 'over' && (k === 'Enter' || k === ' ' || k === 'r' || k === 'R')) { startRun(false); return; }
  if (G.mode === 'revive' && k === 'Enter') { acceptRevive(); return; }
  if (k === 'Escape' || k === 'p' || k === 'P') { if (G.mode === 'run' || G.mode === 'countdown') pause(); else if (G.mode === 'paused') resume(); return; }
  if (k === 'm' || k === 'M') { toggleMute(); return; }
  if (G.mode === 'paused' && (k === 'Enter' || k === ' ')) { resume(); return; }
  if (e.repeat) return;
  if (k === 'ArrowLeft' || code === 'KeyA') act('left');
  else if (k === 'ArrowRight' || code === 'KeyD') act('right');
  else if (k === 'ArrowUp' || code === 'KeyW' || k === ' ') act('jump');
  else if (k === 'ArrowDown' || code === 'KeyS') act('slide');
});
// 触屏：手指移动超过阈值立即触发（不等抬手）
const ptrs = new Map();
const SW_TH = 20;
canvas.addEventListener('pointerdown', (e) => {
  sound.unlock();
  if (G.mode !== 'run' && G.mode !== 'countdown') return;
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, dir: null });
  try { canvas.setPointerCapture(e.pointerId); } catch (er) {}
});
const onMove = (e) => {
  const s = ptrs.get(e.pointerId);
  if (!s) return;
  const dx = e.clientX - s.x, dy = e.clientY - s.y;
  const ad = Math.max(Math.abs(dx), Math.abs(dy));
  if (ad < (s.dir ? SW_TH * 1.6 : SW_TH)) return;
  const dir = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'jump' : 'slide');
  s.x = e.clientX; s.y = e.clientY;
  if (dir === s.dir) return; // 同一次触摸里同方向只算一次
  s.dir = dir;
  act(dir);
};
canvas.addEventListener('pointermove', (e) => {
  if (e.getCoalescedEvents) { for (const ce of e.getCoalescedEvents()) { onMove(ce); } } else onMove(e);
});
const endPtr = (e) => ptrs.delete(e.pointerId);
canvas.addEventListener('pointerup', endPtr);
canvas.addEventListener('pointercancel', endPtr);
document.addEventListener('touchmove', (e) => { if (e.target === canvas) e.preventDefault(); }, { passive: false });
document.addEventListener('gesturestart', (e) => e.preventDefault());

function toggleMute() {
  save.muted = !save.muted;
  sound.setMuted(save.muted);
  document.body.classList.toggle('muted', save.muted);
}
document.querySelectorAll('.mute-btn').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); sound.unlock(); toggleMute(); }));
$('#btn-start').addEventListener('click', () => beginFromTitle());
$('#btn-pause').addEventListener('click', (e) => { e.stopPropagation(); sound.unlock(); pause(); });
$('#rv-yes').addEventListener('click', () => acceptRevive());
$('#rv-no').addEventListener('click', () => { if (G.mode === 'revive') gameOver(); });
document.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => {
  sound.unlock(); sound.click();
  const a = b.dataset.act;
  if (a === 'resume') resume();
  else if (a === 'restart') startRun(false);
  else if (a === 'home') goTitle();
}));
document.body.classList.toggle('muted', save.muted);
sound.setMuted(save.muted);

function beginFromTitle() {
  if (G.mode !== 'title') return;
  startRun(true);
  G.camBlend = 0.0001;
}

// ———————————————————— 可见性 / 尺寸 / 画质 ————————————————————
let raf = 0, last = performance.now();
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (G.mode === 'run' || G.mode === 'countdown') pause();
    sound.suspend();
    cancelAnimationFrame(raf); raf = 0;
  } else {
    if (!save.muted) sound.resume();
    if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); }
  }
});
addEventListener('blur', () => { if (G.mode === 'run') pause(); });
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h);
  composer.setSize(w, h);
  camera.aspect = w / h; camera.updateProjectionMatrix();
  fx.setViewport(h * PR, camera.fov);
  FinishShader.uniforms.uAspect.value = w / h;
}
addEventListener('resize', resize);
if (window.visualViewport) visualViewport.addEventListener('resize', resize);
function setPR(p) {
  PR = p;
  renderer.setPixelRatio(PR); composer.setPixelRatio(PR);
  sky.setPixelRatio(PR); decor.setPixelRatio(PR);
  resize();
}
function qualityTick(dt) {
  if (QLOCK) return;
  G.ema = lerp(G.ema, dt * 1000, 0.05);
  G.qT += dt;
  if (G.qT < 2.5) return;
  G.qT = 0;
  if (G.ema > 25) {
    if (PR > 1.01) setPR(Math.max(1, PR - 0.25));
    else if (G.bloomOn && G.ema > 30) { G.bloomOn = false; bloom.enabled = false; }
  }
}

// ———————————————————— 主循环 ————————————————————
const STEP = 1 / 120;
let stepAcc = 0;
function frame(now) {
  raf = requestAnimationFrame(frame);
  let dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
  last = now;
  G.fps = lerp(G.fps, 1 / Math.max(dt, 1e-3), 0.05);
  qualityTick(dt);
  G.time += dt;
  // 慢动作
  if (G.slowT > 0) { G.slowT -= dt; if (G.slowT <= 0) G.slowmo = 1; }
  const sdt = dt * (G.mode === 'dying' ? Math.min(G.slowmo, 0.55) : G.slowmo);

  // 标题 → 奔跑的镜头过渡
  if (G.camBlend > 0 && G.camBlend < 1) G.camBlend = Math.min(1, G.camBlend + dt / 1.25);

  // 模拟
  if (G.mode === 'run' || G.mode === 'dying') {
    const n = Math.max(1, Math.ceil(sdt / STEP));
    const h = sdt / n;
    for (let i = 0; i < n; i++) sim.step(h);
    G.comboT -= sdt; if (G.comboT <= 0) G.combo = 0;
    G.missionT += dt;
    if (G.missionT > 0.5 && G.mode === 'run') { G.missionT = 0; checkMissions(); }
  } else if (G.mode === 'countdown') {
    G.countT += dt;
    if (G.countT > 0.55) {
      G.countT = 0; G.countN--;
      if (G.countN > 0) showCount(G.countN);
      else {
        UI.count.innerHTML = '';
        sound.countdown(true);
        G.mode = 'run';
        if (sim.pw.jet > 0) sound.loop('jet', true);
        if (sim.pw.magnet > 0) sound.loop('magnet', true);
      }
    }
  } else if (G.mode === 'revive') {
    G.reviveT -= dt;
    const f = clamp(G.reviveT / 5, 0, 1);
    $('#rv-ring').style.strokeDashoffset = String(326.7 * (1 - f));
    const nn = Math.max(0, Math.ceil(G.reviveT));
    const numEl = $('#rv-num');
    if (numEl.textContent !== String(nn)) { numEl.textContent = nn; if (nn > 0) sound.countdown(false); }
    if (G.reviveT <= 0) gameOver();
  }
  handleEvents();

  // 环境与世界弯曲
  envUpdate(dt);
  const dist = sim.dist;
  BEND.x.value = G.mode === 'title' ? 0.00032 : Math.sin(dist / 420 + 0.6) * Math.sin(dist / 1310 + 1.3) * 0.00065;

  // 物体
  const { gaps, warn } = props.sync(sim, dist, G.time);
  const speedF = clamp((sim.speed - 14) / 16, 0, 1);
  track.update(dist, G.time, gaps, warn, speedF);
  decor.update(dt, dist, G.time, sim.speed);

  // 小轨
  const p = sim.p;
  const running = G.mode !== 'title' && G.mode !== 'loading';
  const floor = running ? sim.floorAt(p.x, p.s, p.y + 0.01) : 0;
  if (G.mode === 'title') robot.root.rotation.y = Math.PI * (camParams().p > 0.5 ? 0.92 : 0.8);
  else robot.root.rotation.y = damp(robot.root.rotation.y, 0, 9, dt);
  const flipStart = robot.flipStart; robot.flipStart = false;
  const simDt = G.mode === 'run' || G.mode === 'dying' ? sdt : (G.mode === 'title' ? dt : 0);
  robot.update(Math.max(simDt, G.mode === 'title' ? dt : 0), {
    x: p.x, y: p.y, floor, dist, speed: running ? sim.speed : 0, grounded: p.grounded || !running, sliding: p.slideT > 0, jet: sim.pw.jet > 0,
    airT: 0.58, flipStart, mode: running ? sim.mode : 'idle', shield: sim.pw.shield, magnet: sim.pw.magnet, double: sim.pw.double > 0,
    inv: p.inv, stumble: p.stumbleT > 2.4 ? p.stumbleT - 2.4 : 0, idle: !running,
  });
  // 脚步声
  if (G.mode === 'run' && p.grounded && p.slideT <= 0) {
    const st = Math.floor(robot.phase / Math.PI);
    if (st !== G.lastStep) { G.lastStep = st; sound.step(st % 2 ? 1 : -1); }
  }
  // 持续粒子
  if (G.mode === 'run') {
    if (p.slideT > 0 && p.grounded && Math.random() < 0.9) fx.emit('spark', p.x + (Math.random() - 0.5) * 0.4, p.y + 0.05, dist + 0.2, { n: 2 });
    if (sim.pw.jet > 0) for (const n of robot.nozzles) { n.getWorldPosition(_pv); fx.emit('flame', _pv.x, _pv.y - 0.25, dist - _pv.z, { n: 2 }); }
  }
  fx.update(sdt || dt * 0.5, dist, running ? sim.speed : 0);

  // 相机与天空
  updateCamera(dt);
  sky.update(dt, camera, running ? sim.speed : 2);
  fx.updateLines(dt, camera, running ? sim.speed : 0, running && G.mode !== 'over' ? clamp((sim.speed - 15) / 12, 0, 1) * 0.8 + (sim.pw.jet > 0 ? 0.6 : 0) : 0);

  // 后期
  const U = FinishShader.uniforms;
  G.flash = damp(G.flash, 0, 5, dt);
  G.ca = damp(G.ca, 0, 4, dt);
  U.uFlash.value = G.flash;
  U.uCA.value = G.ca + (sim.pw.jet > 0 && running ? 0.0025 : 0);
  U.uTime.value = G.time % 100;
  const dangerT = (G.danger || 0) * 0.5 + (p.stumbleT > 0 && G.mode === 'run' ? 0.25 : 0);
  if (sim.pw.shield > 0 && running && dangerT < 0.05) { U.uTint.value.set('#2affc0'); U.uTintAmt.value = damp(U.uTintAmt.value, 0.1, 4, dt); }
  else if (sim.pw.double > 0 && running && dangerT < 0.05) { U.uTint.value.set('#ff4fd8'); U.uTintAmt.value = damp(U.uTintAmt.value, 0.09, 4, dt); }
  else { U.uTint.value.set('#ff2a1a'); U.uTintAmt.value = damp(U.uTintAmt.value, dangerT * (0.75 + 0.25 * Math.sin(G.time * 14)), 8, dt); }
  U.uVig.value = 0.34 + (G.mode === 'dying' ? 0.3 : 0);

  composer.render(dt);
  if (running) updateHud(dt);

  if (G.mode === 'loading') {
    G.mode = 'title';
    document.body.classList.remove('is-loading');
    UI.title.classList.add('show');
    refreshTitle();
    if (params.get('autostart')) setTimeout(() => beginFromTitle(), 300);
  }
}

// ———————————————————— 调试接口（自动测试用） ————————————————————
window.__metro = {
  sim, G, MIX,
  get state() {
    const p = sim.p;
    return {
      mode: G.mode, simMode: sim.mode, t: +sim.t.toFixed(2), dist: Math.floor(sim.dist), speed: +sim.speed.toFixed(2), score: sim.score, motes: sim.motes,
      lane: p.lane, x: +p.x.toFixed(2), y: +p.y.toFixed(2), grounded: p.grounded, sliding: p.slideT > 0, pw: { ...sim.pw }, stats: { ...sim.stats },
      biome: G.env.b, fps: Math.round(G.fps), pr: PR, bloom: G.bloomOn, revived: sim.revived,
    };
  },
  start: () => { if (G.mode === 'title') beginFromTitle(); else startRun(false); },
  bot: (on = true) => { G.botOn = on; sim.bot = on; },
  give: (t) => sim.activate(t),
  input: (a) => act(a),
  biome: (i) => { G.forceBiome = i; },
  crash: () => { sim.p.inv = 0; sim.pw.shield = 0; sim.crash('debug', null); },
  revive: () => acceptRevive(),
  decline: () => { if (G.mode === 'revive') gameOver(); },
  pause, resume, home: goTitle,
  setQuality: (p) => setPR(p),
  cam: (pos, look) => { G.camOverride = pos ? { pos, look } : null; },
  hideMain: (h) => { mainPass.enabled = !h; },
};

newWorld();
resize();
raf = requestAnimationFrame(frame);
