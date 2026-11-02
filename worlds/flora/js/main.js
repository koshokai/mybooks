import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SEASONS, PLANTS, STAT_KEYS } from './data.js';
import { BUILDERS, normalizePlant, SHARED } from './plants.js';
import * as W from './world.js';
import { PHOTOS } from './photos.js';

const V3 = THREE.Vector3, TAU = Math.PI * 2;
const $ = (s) => document.querySelector(s);
const params = new URLSearchParams(location.search);
const LOW = Math.min(innerWidth, innerHeight) < 600 || (navigator.hardwareConcurrency || 8) <= 4;

/* ---------------- 渲染器 ---------------- */
const canvas = $('#scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
const DPR = Math.min(window.devicePixelRatio || 1, 2);
renderer.setPixelRatio(DPR);
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x000000, 0.02);
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 1200);

const rt = new THREE.WebGLRenderTarget(innerWidth * DPR, innerHeight * DPR, { type: THREE.HalfFloatType, samples: DPR > 1.5 ? 2 : 4 });
const composer = new EffectComposer(renderer, rt);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.85, 0.6, 0.62);
composer.addPass(bloom);
composer.addPass(new OutputPass());
composer.setSize(innerWidth, innerHeight);

/* ---------------- 光照 ---------------- */
const hemi = new THREE.HemisphereLight(0xffffff, 0x222222, 1.3);
scene.add(hemi);
const key = new THREE.DirectionalLight(0xffffff, 1.7);
key.position.set(-14, 22, -20);
scene.add(key);
const fill = new THREE.DirectionalLight(0xffffff, 0.7);
fill.position.set(12, 10, 20);
scene.add(fill);
const coreLight = new THREE.PointLight(0xffffff, 80, 28, 1.6);
coreLight.position.set(0, 9, 0);
scene.add(coreLight);

/* ---------------- 世界 ---------------- */
const sky = W.createSky(scene);
const ground = W.createGround(scene);
const tree = W.createTree(scene, { low: LOW });
const grass = W.createGrass(scene, { low: LOW });
const shafts = W.createShafts(scene);
const burst = W.createBurst(scene);
const SEASON_FX = [
  W.createSeasonParticles(scene, { mode: 'fall', shape: 0, count: LOW ? 450 : 900, box: new V3(16, 22, 16), size: 2.3, colA: '#ffd6e8', colB: '#ff86b8', fall: 0.9, sway: 1.0, bright: 1.2 }),
  W.createSeasonParticles(scene, { mode: 'wander', shape: 1, count: LOW ? 160 : 280, box: new V3(18, 11, 18), size: 3.4, colA: '#eaff7a', colB: '#7dffb0', rise: 0.12, blink: 1, additive: true, bright: 3.2 }),
  W.createSeasonParticles(scene, { mode: 'fall', shape: 2, count: LOW ? 380 : 700, box: new V3(16, 22, 16), size: 2.6, colA: '#ffd84a', colB: '#ff9a2a', fall: 0.8, sway: 1.4, bright: 1.15 }),
  W.createSeasonParticles(scene, { mode: 'fall', shape: 3, count: LOW ? 900 : 1700, box: new V3(24, 24, 24), size: 1.25, colA: '#ffffff', colB: '#cfe8ff', fall: 1.25, sway: 0.6, additive: true, bright: 1.1 }),
];
const spores = W.createSeasonParticles(scene, { mode: 'wander', shape: 1, count: LOW ? 220 : 400, box: new V3(22, 16, 22), size: 0.85, colA: '#ffffff', colB: '#ffffff', rise: 0.35, additive: true, bright: 1.8 });
spores.u.uOpacity.value = 0.85;
const mist = W.createSeasonParticles(scene, { mode: 'wander', shape: 4, count: 46, box: new V3(26, 3.5, 26), size: 110, colA: '#ffffff', colB: '#ffffff', rise: 0.02, bright: 1 });
mist.u.uOpacity.value = 0.5;

/* ---------------- 季节调色 ---------------- */
const COLOR_KEYS = ['skyTop', 'skyMid', 'skyBot', 'fog', 'aur', 'ground', 'groundIn', 'glow', 'rim', 'spore', 'shaft', 'moon', 'grassTip', 'grassBase', 'hemiSky', 'hemiGround', 'key'];
const NUM_KEYS = ['grassH', 'bloom', 'stars'];
const cur = {}, tgt = {};
for (const k of COLOR_KEYS) { cur[k] = new THREE.Color(); tgt[k] = new THREE.Color(); }
const BURST_COLS = [['#ffc6de', '#ff6fae'], ['#f0ff8a', '#62ffb8'], ['#ffd84a', '#ff8a2a'], ['#ffffff', '#a8dcff']];
let season = 0, seasonAnim = 1;
const lu = tree.lu.uniforms ?? tree.lu;

function applyTargets(S) {
  for (const k of COLOR_KEYS) tgt[k].set(S[k]);
  for (const k of NUM_KEYS) tgt[k] = S[k];
}
function setSeason(i, instant = false) {
  const S = SEASONS[i];
  // 收尾上一次过渡
  lu.uA1.value.copy(lu.uB1.value); lu.uA2.value.copy(lu.uB2.value);
  lu.uShapeA.value = lu.uShapeB.value; lu.uScaleA.value = lu.uScaleB.value;
  lu.uB1.value.set(S.leafA); lu.uB2.value.set(S.leafB);
  lu.uShapeB.value = S.shape; lu.uScaleB.value = S.scale;
  lu.uSeasonT.value = instant ? 1 : 0;
  seasonAnim = instant ? 1 : 0;
  season = i;
  applyTargets(S);
  if (instant) { for (const k of COLOR_KEYS) cur[k].copy(tgt[k]); for (const k of NUM_KEYS) cur[k] = tgt[k]; }
  burst.u.uShape.value = S.shape;
  burst.u.uA.value.set(BURST_COLS[i][0]); burst.u.uB.value.set(BURST_COLS[i][1]);
  specimens.forEach((sp) => sp.api.season && sp.api.season(i));
  document.querySelectorAll('.seasons button').forEach((b, j) => b.classList.toggle('on', j === i));
  document.documentElement.style.setProperty('--season', S.glow);
  if (!instant) toast(S.name, S.line);
}

/* ---------------- 标本（植物角色） ---------------- */
const L = {}; // 布局
function computeLayout() {
  const a = innerWidth / innerHeight;
  L.mobile = innerWidth < 760;
  L.portrait = a < 0.8;
  L.ringR = L.portrait ? 8.6 : 11.5;
  L.R0 = L.portrait ? 31 : a < 1.25 ? 30 : 26.5;
  L.H0 = L.portrait ? 8.5 : 8.5;
  L.ty = L.portrait ? 6.4 : 6.2;
  L.fov = L.portrait ? 56 : 45;
  L.dist = L.portrait ? 12 : 7.4;
}
computeLayout();
camera.fov = L.fov; camera.updateProjectionMatrix();
const SEL = 1.5;

function makePedestal(color) {
  const c = new THREE.Color(color);
  const g = new THREE.Group();
  const top = new THREE.Mesh(new THREE.CylinderGeometry(1.18, 0.92, 0.22, 6), new THREE.MeshStandardMaterial({ color: '#191626', roughness: 0.25, metalness: 0.7, flatShading: true, emissive: c, emissiveIntensity: 0.08 }));
  top.position.y = -0.11;
  g.add(top);
  const under = new THREE.Mesh(new THREE.ConeGeometry(0.98, 1.1, 6), new THREE.MeshStandardMaterial({ color: '#120f1c', roughness: 0.4, metalness: 0.6, flatShading: true, emissive: c, emissiveIntensity: 0.12 }));
  under.rotation.x = Math.PI; under.position.y = -0.77;
  g.add(under);
  const ringMat = new THREE.MeshBasicMaterial({ color: c.clone().multiplyScalar(1.25), transparent: true, opacity: 0.9, depthWrite: false });
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.1, 1.18, 6, 1), ringMat);
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.005;
  g.add(ring);
  const runeU = { uCol: { value: c.clone().multiplyScalar(1.6) }, uTime: W.U.uTime, uOp: { value: 0.8 } };
  const rune = new THREE.Mesh(new THREE.RingGeometry(1.42, 1.58, 72, 1), new THREE.ShaderMaterial({
    uniforms: runeU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: `uniform vec3 uCol; uniform float uTime, uOp; varying vec2 vP;
      void main(){ float a = atan(vP.y, vP.x)/6.2831853 + 0.5; float r = length(vP);
        float seg = fract(a*30.0 + uTime*0.05); float m = smoothstep(0.0, 0.06, seg) * smoothstep(0.55, 0.45, seg);
        float tick = step(0.85, fract(a*90.0)) * 0.6;
        float band = smoothstep(1.42, 1.46, r) * smoothstep(1.58, 1.54, r);
        gl_FragColor = vec4(uCol * (m*band + tick*smoothstep(1.5,1.52,r)*smoothstep(1.58,1.56,r)) * uOp, 1.0); }`,
  }));
  rune.rotation.x = -Math.PI / 2; rune.position.y = -0.2;
  g.add(rune);
  const beamU = { uCol: { value: c.clone() }, uOp: { value: 0.35 } };
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.2, 3.2, 32, 1, true).translate(0, 1.6, 0), new THREE.ShaderMaterial({
    uniforms: beamU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: `uniform vec3 uCol; uniform float uOp; varying vec2 vUv;
      void main(){ float f = pow(1.0 - vUv.y, 2.2); float st = 0.6 + 0.4*step(0.5, fract(vUv.x*48.0)); gl_FragColor = vec4(uCol * f * st * uOp, 1.0); }`,
  }));
  g.add(beam);
  const bubU = { uCol: { value: c.clone() }, uOp: { value: 0.0 }, uTime: W.U.uTime };
  const bubble = new THREE.Mesh(new THREE.SphereGeometry(1.75, 40, 24), new THREE.ShaderMaterial({
    uniforms: bubU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: 'varying vec3 vN; varying vec3 vV; varying vec3 vP; void main(){ vP = position; vec4 mv = modelViewMatrix*vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }',
    fragmentShader: `uniform vec3 uCol; uniform float uOp, uTime; varying vec3 vN; varying vec3 vV; varying vec3 vP;
      void main(){ float f = pow(1.0 - abs(dot(vN, vV)), 2.6);
        vec3 iri = 0.5 + 0.5*cos(6.2831*(f*0.8 + vP.y*0.15 + uTime*0.05 + vec3(0.0, 0.33, 0.67)));
        gl_FragColor = vec4(mix(uCol, iri, 0.45) * f * uOp, 1.0); }`,
  }));
  bubble.position.y = 1.25;
  g.add(bubble);
  return { g, ringMat, runeU, beamU, bubU, rune };
}

const holderRoot = new THREE.Group();
scene.add(holderRoot);
const colliders = [];
const specimens = PLANTS.map((p, i) => {
  const api = BUILDERS[p.id]();
  const plant = normalizePlant(api.group, 2.25, 1.2);
  const holder = new THREE.Group();
  const spin = new THREE.Group();
  spin.add(plant);
  const ped = makePedestal(p.color);
  holder.add(ped.g, spin);
  const col = new THREE.Mesh(new THREE.SphereGeometry(1.6, 12, 8), new THREE.MeshBasicMaterial({ visible: false }));
  col.position.y = 1.1; col.userData.idx = i;
  holder.add(col);
  colliders.push(col);
  const mats = [];
  plant.traverse((o) => { if (o.material && o.material.userData.uBoost) mats.push(o.material.userData.uBoost); });
  holderRoot.add(holder);
  holder.scale.setScalar(0.001);
  return { p, i, api, plant, inner: api.group, holder, spin, ped, mats, angle: 0, baseY: 0, s: 0.001, vel: 0, boost: 0, pop: 0 };
});
function placeSpecimens() {
  specimens.forEach((sp, i) => {
    sp.angle = (i / specimens.length) * TAU + 0.26;
    sp.baseY = 2.3 + (i % 3) * 1.05 + (L.portrait ? 0.2 : 0);
    sp.holder.position.set(Math.cos(sp.angle) * L.ringR, sp.baseY, Math.sin(sp.angle) * L.ringR);
    sp.holder.rotation.y = -sp.angle + Math.PI / 2; // 正面朝外
  });
  ground.u.uRing.value = L.ringR;
}
placeSpecimens();

/* ---------------- 详情背景（聚光） ---------------- */
const backU = { uDark: { value: new THREE.Color() }, uAcc: { value: new THREE.Color() }, uOp: { value: 0 }, uTime: W.U.uTime };
const backdrop = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({
  uniforms: backU, transparent: true, depthWrite: false,
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv*2.0-1.0; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
  fragmentShader: `uniform vec3 uDark, uAcc; uniform float uOp, uTime; varying vec2 vUv;
    void main(){ float r = length(vUv); float a = atan(vUv.y, vUv.x);
      float dark = smoothstep(1.0, 0.15, r) * 0.78;
      float ring = smoothstep(0.012, 0.0, abs(r - 0.42)) * (0.55 + 0.45*sin(a*3.0 + uTime*0.6));
      float ring2 = smoothstep(0.006, 0.0, abs(r - 0.47)) * step(0.5, fract(a/6.2831*64.0 - uTime*0.04)) * 0.7;
      float glow = exp(-r*4.0) * 0.35;
      vec3 c = mix(uDark, uAcc * 1.4, clamp(ring + ring2 + glow, 0.0, 1.0));
      gl_FragColor = vec4(c, clamp(dark + ring + ring2, 0.0, 1.0) * uOp); }`,
}));
backdrop.renderOrder = -1;
scene.add(backdrop);

/* ---------------- UI ---------------- */
const tagsEl = $('#tags');
specimens.forEach((sp) => {
  const t = document.createElement('button');
  t.className = 'tag';
  t.style.setProperty('--acc', sp.p.color);
  t.innerHTML = `<b>${sp.p.glyph}</b><span>${sp.p.name}</span>`;
  t.addEventListener('click', () => select(sp.i));
  tagsEl.appendChild(t);
  sp.tag = t;
});

const roster = $('#roster');
PLANTS.forEach((p, i) => {
  const c = document.createElement('button');
  c.className = 'card';
  c.style.setProperty('--acc', p.color);
  c.innerHTML = `<i class="card-no">${String(i + 1).padStart(2, '0')}</i><b class="card-glyph">${p.glyph}</b><span class="card-name">${p.name}</span><em class="card-latin">${p.latin}</em>`;
  const ph = (PHOTOS[p.id] || [])[0];
  if (ph) { c.classList.add('has-photo'); c.style.setProperty('--img', `url("${ph.thumb}")`); }
  c.addEventListener('click', () => (state.mode === 'detail' && state.sel === i ? closeDetail() : select(i)));
  roster.appendChild(c);
});

const seasonsEl = $('.seasons');
SEASONS.forEach((S, i) => {
  const b = document.createElement('button');
  b.style.setProperty('--c', S.glow);
  b.innerHTML = `<b>${S.glyph}</b><small>${S.en}</small>`;
  b.title = S.name;
  b.addEventListener('click', () => { if (i !== season) setSeason(i); });
  seasonsEl.appendChild(b);
});

let toastTimer;
function toast(title, line) {
  const el = $('#toast');
  el.innerHTML = `<b>${title}</b><span>${line}</span>`;
  el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
}

const panel = $('#panel');

/* ---------------- 实拍照片（iNaturalist 开放授权） ---------------- */
const escHTML = (t) => String(t).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
const creditHTML = (ph) => `<span class="cam">📷</span> ${escHTML(ph.author)} · <a href="${ph.licenseUrl}" target="_blank" rel="noopener">${ph.license}</a> · <a href="${ph.source}" target="_blank" rel="noopener">iNaturalist</a>`;
let photoSel = 0;
function fillPhotos(p) {
  const list = PHOTOS[p.id] || [];
  const sec = $('#pPhotos');
  sec.hidden = !list.length;
  if (!list.length) return;
  photoSel = 0;
  const main = $('#pMain');
  const show = (k) => {
    photoSel = k;
    const ph = list[k];
    main.innerHTML = `<img src="${ph.src}" alt="${escHTML(p.name)}实拍" style="aspect-ratio:${ph.w}/${ph.h}" />`;
    const img = main.querySelector('img');
    img.addEventListener('load', () => img.classList.add('in'));
    if (img.complete) img.classList.add('in');
    $('#pCredit').innerHTML = creditHTML(ph);
    $('#pThumbs').querySelectorAll('button').forEach((b, j) => b.classList.toggle('on', j === k));
  };
  $('#pThumbs').innerHTML = list.map((ph, k) => `<button aria-label="第 ${k + 1} 张"><img src="${ph.thumb}" alt="" loading="lazy" /></button>`).join('');
  $('#pThumbs').querySelectorAll('button').forEach((b, k) => b.addEventListener('click', () => show(k)));
  main.onclick = () => openLightbox(p, photoSel);
  show(0);
}

const lb = { p: null, k: 0 };
const lightbox = $('#lightbox');
const lbOpen = () => !lightbox.hidden;
function openLightbox(p, k) {
  lb.p = p; lb.k = k;
  lightbox.hidden = false;
  requestAnimationFrame(() => lightbox.classList.add('show'));
  lbRender();
}
function lbRender() {
  const list = PHOTOS[lb.p.id] || [];
  const ph = list[lb.k];
  const img = $('#lbImg');
  img.classList.remove('in');
  img.onload = () => img.classList.add('in');
  img.src = ph.src;
  img.alt = `${lb.p.name}实拍`;
  $('#lbCap').innerHTML = `<b>${lb.p.name}</b> <i>${lb.p.latin}</i> <span class="n">${lb.k + 1} / ${list.length}</span><br />${creditHTML(ph)}`;
  $('#lbPrev').hidden = $('#lbNext').hidden = list.length < 2;
}
function lbStep(d) {
  const n = (PHOTOS[lb.p.id] || []).length;
  if (n < 2) return;
  lb.k = (lb.k + d + n) % n;
  lbRender();
}
function closeLightbox() {
  lightbox.classList.remove('show');
  setTimeout(() => { lightbox.hidden = true; }, 250);
}
$('#lbClose').addEventListener('click', closeLightbox);
$('#lbPrev').addEventListener('click', (e) => { e.stopPropagation(); lbStep(-1); });
$('#lbNext').addEventListener('click', (e) => { e.stopPropagation(); lbStep(1); });
lightbox.addEventListener('click', (e) => { if (e.target === lightbox) closeLightbox(); });
{ // 手机上左右滑动切换
  let sx = null;
  lightbox.addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; }, { passive: true });
  lightbox.addEventListener('touchend', (e) => {
    if (sx == null) return;
    const dx = e.changedTouches[0].clientX - sx; sx = null;
    if (Math.abs(dx) > 50) lbStep(dx < 0 ? 1 : -1);
  });
}
function fillPanel(i) {
  const p = PLANTS[i];
  panel.style.setProperty('--acc', p.color);
  $('#pGlyph').textContent = p.glyph;
  $('#pTitle').textContent = p.title;
  $('#pName').textContent = p.name;
  $('#pLatin').textContent = p.latin;
  $('#pTags').innerHTML = p.group.map((g) => `<span>${g}</span>`).join('') + `<span class="no">No.${String(i + 1).padStart(2, '0')}</span>`;
  $('#pStats').innerHTML = STAT_KEYS.map((k, j) => `<div class="stat"><label>${k}</label><div class="bar"><i style="--w:${p.stats[j][0]}%"></i></div><span>${p.stats[j][1]}</span></div>`).join('');
  $('#pOrigin').textContent = p.origin;
  $('#pFacts').innerHTML = p.facts.map((f) => `<li>${f}</li>`).join('');
  $('#pCulture').textContent = p.culture;
  $('#pHint').textContent = p.hint || '';
  $('#pHint').hidden = !p.hint;
  $('#pCount').textContent = `${i + 1} / ${PLANTS.length}`;
  fillPhotos(p);
  panel.querySelector('.pbody').scrollTop = 0;
  panel.classList.remove('fill'); void panel.offsetWidth; panel.classList.add('fill');
}
$('#pClose').addEventListener('click', () => closeDetail());
$('#pPrev').addEventListener('click', () => select((state.sel + PLANTS.length - 1) % PLANTS.length));
$('#pNext').addEventListener('click', () => select((state.sel + 1) % PLANTS.length));
$('#pHint').addEventListener('click', () => { const sp = specimens[state.sel]; sp.api.touch && sp.api.touch(null); });

/* ---------------- 状态 / 相机 ---------------- */
const state = { mode: 'overview', sel: -1, hover: -1 };
const cam = { theta: 0.35, r: 13, h: 1.4, target: new V3(0, 4.2, 0) };
let userTheta = 0.35 + 0.55, userH = L.H0, zoom = 1, dzoom = 1;
let lastInteract = -10, introT = 0, shift = 0;
const mouse = { x: 0, y: 0, sx: 0, sy: 0 };

function select(i) {
  state.mode = 'detail'; state.sel = i;
  fillPanel(i);
  document.body.classList.add('detail');
  roster.querySelectorAll('.card').forEach((c, j) => c.classList.toggle('on', j === i));
  const card = roster.children[i];
  card && card.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  const sp = specimens[i];
  sp.vel = 2.5;
  burst.spawn(sp.holder.position.clone().add(new V3(0, 1.4, 0)), 30, 0.7);
  hideHint();
}
function closeDetail() {
  if (state.mode !== 'detail') return;
  state.mode = 'overview';
  userTheta = cam.theta; userH = L.H0;
  document.body.classList.remove('detail');
  roster.querySelectorAll('.card').forEach((c) => c.classList.remove('on'));
}
function angDiff(a, b) { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; }

const tmpV = new V3(), right = new V3(), upV = new V3();
function updateCamera(dt, t) {
  let dTheta, dR, dH, dT;
  if (state.mode === 'detail') {
    const sp = specimens[state.sel];
    const d = L.dist * dzoom;
    dTheta = sp.angle + 0.2; dR = L.ringR + d;
    dT = sp.holder.position.clone(); dT.y += 1.25 * SEL;
    dH = dT.y + d * 0.14;
  } else {
    if (t - lastInteract > 3.5 && introT > 4) userTheta += dt * 0.035;
    dTheta = userTheta; dR = L.R0 * zoom; dH = userH; dT = tmpV.set(0, L.ty, 0);
  }
  const rate = introT < 6 ? 0.55 : 2.2;
  const k = 1 - Math.exp(-dt * rate);
  cam.theta += angDiff(cam.theta, dTheta) * k;
  cam.r += (dR - cam.r) * k;
  cam.h += (dH - cam.h) * k;
  cam.target.lerp(dT, k);
  mouse.sx += (mouse.x - mouse.sx) * (1 - Math.exp(-dt * 3));
  mouse.sy += (mouse.y - mouse.sy) * (1 - Math.exp(-dt * 3));
  camera.position.set(Math.cos(cam.theta) * cam.r, cam.h, Math.sin(cam.theta) * cam.r);
  camera.lookAt(cam.target);
  camera.updateMatrixWorld();
  right.setFromMatrixColumn(camera.matrixWorld, 0);
  upV.setFromMatrixColumn(camera.matrixWorld, 1);
  const par = state.mode === 'detail' ? 0.25 : 0.9;
  camera.position.addScaledVector(right, mouse.sx * par).addScaledVector(upV, -mouse.sy * par * 0.5);
  // 让出详情面板的位置
  shift += ((state.mode === 'detail' ? 1 : 0) - shift) * k;
  const look = cam.target.clone();
  if (shift > 0.001) {
    const dist = camera.position.distanceTo(cam.target);
    const halfH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * dist;
    const pr = panel.getBoundingClientRect();
    if (L.mobile) look.addScaledVector(upV, -halfH * (pr.height / innerHeight) * 0.86 * shift);
    else look.addScaledVector(right, halfH * camera.aspect * (pr.width + 24) / innerWidth * shift).addScaledVector(upV, -halfH * 0.26 * shift);
  }
  camera.lookAt(look);
}

/* ---------------- 交互 ---------------- */
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const pointers = new Map();
let drag = null, pinch = null;
function pick(x, y) {
  ndc.set((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const hits = ray.intersectObjects(colliders, false);
  return hits.length ? hits[0] : null;
}
canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 1) drag = { x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, t0: performance.now(), moved: false };
  else if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: zoom, dz: dzoom }; drag = null; }
});
canvas.addEventListener('pointermove', (e) => {
  if (e.pointerType === 'mouse') { mouse.x = (e.clientX / innerWidth) * 2 - 1; mouse.y = (e.clientY / innerHeight) * 2 - 1; }
  if (!pointers.has(e.pointerId)) { hoverAt(e.clientX, e.clientY); return; }
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  const now = performance.now() / 1000;
  if (pinch && pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    const f = pinch.d / Math.max(20, Math.hypot(a.x - b.x, a.y - b.y));
    if (state.mode === 'detail') dzoom = THREE.MathUtils.clamp(pinch.dz * f, 0.6, 1.6);
    else zoom = THREE.MathUtils.clamp(pinch.z * f, 0.55, 1.35);
    lastInteract = now;
    return;
  }
  if (!drag) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  drag.x = e.clientX; drag.y = e.clientY;
  if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) > 7) drag.moved = true;
  if (!drag.moved) return;
  lastInteract = now;
  if (state.mode === 'detail') {
    const sp = specimens[state.sel];
    sp.spin.rotation.y += dx * 0.012;
    sp.vel = dx * 0.6;
  } else {
    userTheta += dx * 0.005;
    userH = THREE.MathUtils.clamp(userH + dy * 0.03, 2.5, 17);
  }
});
function endPointer(e) {
  if (!pointers.has(e.pointerId)) return;
  pointers.delete(e.pointerId);
  if (pointers.size < 2) pinch = null;
  if (drag && !drag.moved && performance.now() - drag.t0 < 450) tap(e.clientX, e.clientY);
  drag = null;
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', (e) => { pointers.delete(e.pointerId); drag = null; pinch = null; });
canvas.addEventListener('pointerleave', () => { mouse.x = 0; mouse.y = 0; });
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const f = Math.exp(e.deltaY * 0.001);
  if (state.mode === 'detail') dzoom = THREE.MathUtils.clamp(dzoom * f, 0.6, 1.6);
  else zoom = THREE.MathUtils.clamp(zoom * f, 0.55, 1.35);
  lastInteract = performance.now() / 1000;
}, { passive: false });

function tap(x, y) {
  const h = pick(x, y);
  if (h) {
    const i = h.object.userData.idx;
    const sp = specimens[i];
    if (state.mode === 'detail' && state.sel === i) {
      if (sp.api.touch) {
        const lp = sp.inner.worldToLocal(h.point.clone());
        sp.api.touch(lp);
      } else { sp.vel += 3; }
      burst.spawn(h.point, 24, 0.6);
    } else select(i);
    return;
  }
  ndc.set((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const d = Math.min(16, camera.position.distanceTo(cam.target) * 0.55);
  burst.spawn(ray.ray.at(d, new V3()), 50, 1);
  hideHint();
}
let hoverQueued = null;
function hoverAt(x, y) { hoverQueued = [x, y]; }
function processHover() {
  if (!hoverQueued) return;
  const [x, y] = hoverQueued; hoverQueued = null;
  const h = pick(x, y);
  state.hover = h ? h.object.userData.idx : -1;
  canvas.style.cursor = h ? 'pointer' : 'grab';
}

addEventListener('keydown', (e) => {
  if (lbOpen()) {
    if (e.key === 'Escape') closeLightbox();
    if (e.key === 'ArrowRight') lbStep(1);
    if (e.key === 'ArrowLeft') lbStep(-1);
    return;
  }
  if (e.key === 'Escape') closeDetail();
  if (['1', '2', '3', '4'].includes(e.key)) { const i = +e.key - 1; if (i !== season) setSeason(i); }
  if (state.mode === 'detail' && e.key === 'ArrowRight') select((state.sel + 1) % PLANTS.length);
  if (state.mode === 'detail' && e.key === 'ArrowLeft') select((state.sel + PLANTS.length - 1) % PLANTS.length);
});

let hintHidden = false;
function hideHint() { if (!hintHidden) { hintHidden = true; $('#hint').classList.add('gone'); } }

/* ---------------- 尺寸 ---------------- */
function onResize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h);
  composer.setSize(w, h);
  computeLayout();
  camera.aspect = w / h; camera.fov = L.fov; camera.updateProjectionMatrix();
  placeSpecimens();
  for (const fx of [...SEASON_FX, spores, mist]) fx.u.uPR.value = DPR * (h / 900);
  burst.u.uPR.value = DPR * (h / 900);
}
addEventListener('resize', onResize);
onResize();

/* ---------------- 主循环 ---------------- */
const easeOutBack = (x) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
let last = performance.now();
let elapsed = 0;
const fogC = new THREE.Color();
function loop(now) {
  const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
  last = now;
  step(dt);
  composer.render();
}
function step(dt) {
  elapsed += dt;
  introT += dt;
  const t = elapsed;
  W.U.uTime.value = t;

  // 生长
  const g = THREE.MathUtils.clamp((introT - 0.4) / 6.5, 0, 1);
  W.U.uGrow.value = 1 - Math.pow(1 - g, 2.2);
  const grow = W.U.uGrow.value;

  // 季节过渡
  if (seasonAnim < 1) { seasonAnim = Math.min(1, seasonAnim + dt / 3.2); lu.uSeasonT.value = seasonAnim; }
  const ck = 1 - Math.exp(-dt * 1.4);
  for (const k of COLOR_KEYS) cur[k].lerp(tgt[k], ck);
  for (const k of NUM_KEYS) cur[k] += (tgt[k] - cur[k]) * ck;
  sky.u.uTop.value.copy(cur.skyTop); sky.u.uMid.value.copy(cur.skyMid); sky.u.uBot.value.copy(cur.skyBot);
  sky.u.uAur.value.copy(cur.aur); sky.u.uFog.value.copy(cur.fog); sky.u.uStars.value = cur.stars; sky.mu.uCol.value.copy(cur.moon);
  scene.fog.color.copy(cur.fog);
  ground.u.uCol.value.copy(cur.ground); ground.u.uIn.value.copy(cur.groundIn); ground.u.uGlow.value.copy(cur.glow); ground.u.uFog.value.copy(cur.fog);
  SHARED.rim.value.copy(cur.rim);
  tree.barkU.uGlowC.value.copy(cur.glow);
  tree.lanU.uCol.value.copy(cur.glow).multiplyScalar(2.6 + Math.sin(t * 2) * 0.4);
  tree.lanU.uOp.value = THREE.MathUtils.clamp((grow - 0.8) * 5, 0, 1);
  const sh = THREE.MathUtils.clamp((grow - 0.3) * 2, 0, 1);
  tree.shroom.scale.setScalar(Math.max(0.001, easeOutBack(sh)));
  grass.u.uBase.value.copy(cur.grassBase); grass.u.uTip.value.copy(cur.grassTip); grass.u.uH.value = cur.grassH;
  shafts.u.uCol.value.copy(cur.shaft); shafts.u.uOp.value = 0.11 * Math.min(1, introT / 4);
  spores.u.uA.value.copy(cur.spore); spores.u.uB.value.copy(cur.glow);
  fogC.copy(cur.fog).lerp(cur.skyBot, 0.35);
  mist.u.uA.value.copy(fogC); mist.u.uB.value.copy(fogC);
  hemi.color.copy(cur.hemiSky); hemi.groundColor.copy(cur.hemiGround);
  key.color.copy(cur.key); fill.color.copy(cur.rim);
  coreLight.color.copy(cur.glow); coreLight.intensity = 80 * grow;
  bloom.strength = cur.bloom * 0.8;
  SEASON_FX.forEach((fx, i) => {
    const o = fx.u.uOpacity;
    o.value += ((i === season ? 1 : 0) * Math.min(1, introT / 3) - o.value) * (1 - Math.exp(-dt * 1.2));
    fx.pts.visible = o.value > 0.005;
  });

  // 标本
  processHover();
  specimens.forEach((sp, i) => {
    const isSel = state.mode === 'detail' && state.sel === i;
    sp.pop = THREE.MathUtils.clamp((grow - (0.4 + i * 0.035)) / 0.14, 0, 1);
    const targetS = Math.max(0.001, easeOutBack(sp.pop)) * (isSel ? SEL : L.portrait ? 0.7 : 0.74);
    sp.s += (targetS - sp.s) * (sp.pop < 1 ? 1 : 1 - Math.exp(-dt * 4));
    sp.holder.scale.setScalar(sp.s);
    const bobT = isSel ? 0 : Math.sin(t * 0.8 + i * 1.7) * 0.2;
    sp.holder.position.y += (sp.baseY + bobT - sp.holder.position.y) * (1 - Math.exp(-dt * 4));
    if (isSel) {
      if (!drag) { sp.spin.rotation.y += sp.vel * dt; sp.vel *= Math.exp(-dt * 2.2); if (Math.abs(sp.vel) < 0.2) sp.spin.rotation.y += dt * 0.18; }
    } else sp.spin.rotation.y += dt * 0.25;
    const bt = isSel ? 0.12 : state.hover === i ? 0.4 : 0;
    sp.boost += (bt - sp.boost) * (1 - Math.exp(-dt * 6));
    for (const u of sp.mats) u.value = sp.boost;
    sp.ped.bubU.uOp.value += ((isSel ? 0 : state.hover === i ? 1.3 : state.mode === 'detail' ? 0.18 : 0.55) - sp.ped.bubU.uOp.value) * (1 - Math.exp(-dt * 5));
    sp.ped.beamU.uOp.value += ((isSel ? 0.06 : state.hover === i ? 0.5 : 0.2) - sp.ped.beamU.uOp.value) * (1 - Math.exp(-dt * 5));
    sp.ped.rune.rotation.z = t * 0.15 * (i % 2 ? 1 : -1);
    sp.api.update && sp.api.update(dt);
  });

  updateCamera(dt, t);
  if (state.sel >= 0) {
    const sp = specimens[state.sel];
    const c = sp.holder.position.clone(); c.y += 1.2 * sp.s;
    const away = c.clone().sub(camera.position).normalize();
    backdrop.position.copy(c).addScaledVector(away, 2.4 * sp.s / SEL + 0.4);
    backdrop.lookAt(camera.position);
    backdrop.scale.setScalar(13);
    backU.uAcc.value.set(sp.p.color);
    backU.uDark.value.copy(cur.fog).multiplyScalar(0.25);
  }
  backU.uOp.value += ((state.mode === 'detail' ? 1 : 0) - backU.uOp.value) * (1 - Math.exp(-dt * 3));
  backdrop.visible = backU.uOp.value > 0.01;
  burst.update(dt);
  updateTags();
}

const projV = new V3();
function updateTags() {
  const hide = state.mode === 'detail' || introT < 4;
  for (const sp of specimens) {
    if (hide || sp.pop < 1) { sp.tag.style.opacity = 0; sp.tag.style.pointerEvents = 'none'; continue; }
    projV.copy(sp.holder.position); projV.y += 3.15 * sp.s;
    const facing = (sp.holder.position.x * camera.position.x + sp.holder.position.z * camera.position.z) / (L.ringR * Math.hypot(camera.position.x, camera.position.z));
    projV.project(camera);
    if (projV.z > 1) { sp.tag.style.opacity = 0; continue; }
    const x = (projV.x * 0.5 + 0.5) * innerWidth, y = (-projV.y * 0.5 + 0.5) * innerHeight;
    const op = THREE.MathUtils.clamp(0.25 + (facing + 0.2) * 0.9, 0.15, 1);
    sp.tag.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%)`;
    sp.tag.style.opacity = op.toFixed(2);
    sp.tag.style.pointerEvents = op > 0.5 ? 'auto' : 'none';
    sp.tag.classList.toggle('hot', state.hover === sp.i);
    sp.tag.style.zIndex = Math.round(op * 10);
  }
}

/* ---------------- 启动 ---------------- */
const startSeason = Math.max(0, SEASONS.findIndex((s) => s.key === params.get('season')));
setSeason(startSeason, true);
if (params.has('skip')) { introT = 20; cam.theta = userTheta; cam.r = L.R0; cam.h = L.H0; cam.target.set(0, L.ty, 0); }
document.addEventListener('visibilitychange', () => {
  if (document.hidden) renderer.setAnimationLoop(null);
  else { last = performance.now(); renderer.setAnimationLoop(loop); }
});
renderer.setAnimationLoop(loop);
setTimeout(() => document.body.classList.add('ready'), params.has('skip') ? 0 : 1800);
if (params.has('plant')) { const i = PLANTS.findIndex((p) => p.id === params.get('plant')); if (i >= 0) setTimeout(() => select(i), 300); }

// 供调试/截图
window.__flora = { select, closeDetail, setSeason, specimens, state, camera, cam, scene, composer, renderer,
  advance(sec) { const n = Math.round(sec * 30); for (let i = 0; i < n; i++) step(1 / 30); composer.render(); },
  tapAt(x, y) { tap(x, y); },
  resume() { last = performance.now(); renderer.setAnimationLoop(loop); } };
