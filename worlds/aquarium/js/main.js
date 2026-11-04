// 鱼 · 水族箱：主程序（渲染、交互、云养进度、界面）
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { BokehPass } from "three/addons/postprocessing/BokehPass.js";
import { autoQuality } from "../../../shared/perf.js";
import { T, U, clamp, lerp } from "./gfx.js";
import { SP, SPECIES, MAX_FISH } from "./data.js";
import { loadState, saveState, newState, catchUp, awayStories, advance, makeFish, dayKey, algaeMean, avg, AG } from "./state.js";
import { Env, phaseName } from "./env.js";
import { Scape } from "./scape.js";
import { School, Food, Fish } from "./fish.js";
import { audio } from "./audio.js";
import { fishThumb } from "./thumbs.js";
import { Editor } from "./editor.js";

const $ = (s) => document.querySelector(s);
const A = window.WXArcade || { getStardust: () => 0, addStardust: () => 0, spendStardust: () => false, unlock: () => false, achievements: () => [], on() {} };
const loadEl = $("#load");
const say = (t) => { if (loadEl) loadEl.textContent = t; };

/* ---------------- 存档 ---------------- */
let state = loadState();
const fresh = !state;
if (!state) state = newState();
const summary = fresh ? null : catchUp(state);
if (!state.gifted) { state.gifted = true; if (A.getStardust() === 0) A.addStardust(20, "aquarium"); }
saveState(state);

/* ---------------- 渲染器 ---------------- */
const canvas = $("#scene");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance", preserveDrawingBuffer: false });
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x03070b);
scene.fog = new THREE.Fog(0x2b6a86, 10, 34);
const camera = new THREE.PerspectiveCamera(38, innerWidth / innerHeight, 0.1, 200);
const target = new THREE.Vector3(0, 2.9, 0);

say("正在铺底床…");
const env = new Env(scene);
const scape = new Scape(scene, env);
scape.load(state.layout);
U.uAlgae.value = algaeMean(state) * 0.5;

const W = {
  env, night: 0, hide: [], obst: [],
  ground: (x, z) => scape.ground(x, z),
  onEat: (f) => onEat(f),
};
Object.defineProperty(W, "hide", { get: () => scape.hide });
Object.defineProperty(W, "obst", { get: () => scape.obst });
const food = new Food(scene, W); W.food = food;
say("鱼儿们正在入缸…");
const school = new School(scene, W);
school.sync(state.fish);

/* 后期：景深（选中鱼时）→ 泛光 → 输出 → 颗粒与暗角 */
const rt = new THREE.WebGLRenderTarget(innerWidth, innerHeight, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, rt);
composer.addPass(new RenderPass(scene, camera));
const bokeh = new BokehPass(scene, camera, { focus: 15, aperture: 0.0016, maxblur: 0.006 });
bokeh.enabled = false; composer.addPass(bokeh);
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.32, 0.5, 0.93);
composer.addPass(bloom);
composer.addPass(new OutputPass());
const grain = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uGrain: { value: 0.035 }, uVig: { value: 0.9 } },
  vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
  fragmentShader: /* glsl */ `uniform sampler2D tDiffuse; uniform float uTime; uniform float uGrain; uniform float uVig; varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){ vec4 c = texture2D(tDiffuse, vUv);
      float n = h(vUv * 1000.0 + fract(uTime * 7.3) * 100.0) - 0.5;
      c.rgb += n * uGrain * (1.0 - dot(c.rgb, vec3(0.3)));
      vec2 d = vUv - 0.5; c.rgb *= 1.0 - dot(d, d) * uVig;
      gl_FragColor = c; }`,
});
composer.addPass(grain);

let maxPR = Math.min(2, window.devicePixelRatio || 1);
let curPR = 1, started = false, studioFish = null;
const q = autoQuality({
  id: "aquarium", maxPR,
  setPR: (pr) => { curPR = pr; renderer.setPixelRatio(pr); composer.setPixelRatio(pr); if (started) resize(); },
  setBloom: (on) => { bloom.enabled = on; },
});

/* ---------------- 相机 ---------------- */
let baseDist = 16;
function fit() {
  const w = innerWidth, h = innerHeight, asp = w / h;
  camera.aspect = asp; camera.fov = asp < 0.8 ? 44 : 36; camera.updateProjectionMatrix();
  const t = Math.tan((camera.fov * Math.PI) / 360);
  const vH = asp < 0.8 ? 7.4 : 7.6, vW = asp < 0.8 ? 6.6 : 11.6;
  baseDist = Math.max(vH / 2 / t, vW / 2 / (t * asp));
  if (!studioFish) { controls.minDistance = Math.max(4.5, baseDist * 0.32); controls.maxDistance = baseDist * 1.22; }
}
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false); composer.setSize(w, h);
  fit();
}

/* ---------------- 交互 ---------------- */
let mode = "view"; // view | feed | clean | trim | edit
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
let down = null, wiping = false, editorDrag = false, wipeN = 0, lastAlgaeDraw = 0;
function rayAt(x, y) { ndc.set((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1); ray.setFromCamera(ndc, camera); return ray; }
const planeHit = (n, c) => { const p = new THREE.Plane(n, -c), v = new THREE.Vector3(); return ray.ray.intersectPlane(p, v) ? v : null; };
const cursor = $("#cursor");

canvas.addEventListener("pointerdown", (e) => {
  audio.start(); syncSound();
  down = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId };
  if (mode === "clean") { wiping = true; controls.enabled = false; wipeAt(e.clientX, e.clientY); }
  if (mode === "edit" && editor.down(e, rayAt(e.clientX, e.clientY))) { editorDrag = true; controls.enabled = false; }
});
addEventListener("pointermove", (e) => {
  cursor.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
  if (wiping && down && e.pointerId === down.id) wipeAt(e.clientX, e.clientY);
  if (editorDrag) editor.move(e, rayAt(e.clientX, e.clientY));
});
addEventListener("pointerup", (e) => {
  if (!down || e.pointerId !== down.id) return;
  const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y), dtp = performance.now() - down.t;
  if (editorDrag) { editor.up(e); editorDrag = false; }
  if (wiping) { wiping = false; finishWipe(); }
  controls.enabled = mode !== "clean";
  if (e.target === canvas && moved < 9 && dtp < 500) tap(e.clientX, e.clientY);
  down = null;
});
addEventListener("pointercancel", () => { down = null; wiping = false; editorDrag = false; controls.enabled = mode !== "clean"; });

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true; controls.dampingFactor = 0.08; controls.enablePan = false;
controls.minAzimuthAngle = -0.75; controls.maxAzimuthAngle = 0.75;
controls.minPolarAngle = 1.05; controls.maxPolarAngle = 1.78;
controls.rotateSpeed = 0.55; controls.zoomSpeed = 0.8;
controls.target.copy(target);
started = true;
fit();
camera.position.set(0, target.y + 0.5, baseDist);
camera.position.set(-baseDist * 0.12, target.y + 0.6, baseDist * 1.08);
controls.update();

function tap(x, y) {
  rayAt(x, y);
  if (mode === "edit") return editor.tap(ray);
  if (mode === "feed") return feedAt();
  if (mode === "trim") return trimAt();
  if (mode === "clean") return;
  const f = school.pick(x, y, camera, innerWidth, innerHeight);
  if (f) { openCard(f); audio.blip(0.08, 700); return; }
  if (sel) closeCard();
  const p = planeHit(new THREE.Vector3(0, 0, 1), T.Z1);
  if (p && Math.abs(p.x) < T.X1 && p.y > 0 && p.y < T.H) {
    audio.tap(); school.startle(new THREE.Vector3(p.x, p.y, T.Z1 - 0.3), 3.4);
    hintOnce("tap", "鱼儿被吓了一跳 · 别敲太多次哦");
  }
}

/* 喂食 */
function feedAt() {
  const p = planeHit(new THREE.Vector3(0, 0, 1), 0) || new THREE.Vector3();
  const x = clamp(p.x, T.X0 + 0.5, T.X1 - 0.5), z = (Math.random() - 0.5) * 1.6;
  food.drop(x, z, 9); env.ripple(x, z, 1); audio.sprinkle();
  state.stats.feeds++;
  if (A.unlock("aquarium:first-feed", "第一次喂食")) toast("解锁成就 · <b>第一次喂食</b>");
  credit("fed", 2, "喂食");
}
function onEat(f) {
  f.d.hunger = Math.max(0, f.d.hunger - 14); f.d.happy = Math.min(100, f.d.happy + 1.5);
  state.stats.flakes++;
  if (audio.on && Math.random() < 0.5) audio.blip(0.03, 900 + Math.random() * 400);
}

/* 擦玻璃 */
function wipeAt(x, y) {
  rayAt(x, y);
  const p = planeHit(new THREE.Vector3(0, 0, 1), T.Z1); if (!p) return;
  const u = (p.x - T.X0) / T.W, v = p.y / T.H;
  if (u < -0.05 || u > 1.05 || v < -0.05 || v > 1.05) return;
  const R = 2.6; let any = 0;
  for (let j = 0; j < AG.Y; j++) for (let i = 0; i < AG.X; i++) {
    const d = Math.hypot((i / (AG.X - 1) - u) * AG.X, (j / (AG.Y - 1) - v) * AG.Y);
    if (d < R) { const k = j * AG.X + i, o = state.algae[k]; state.algae[k] = Math.max(0, o - 0.5 * (1 - d / R)); any += o - state.algae[k]; }
  }
  wipeN++;
  if (any > 0.01 || wipeN % 6 === 0) { const now = performance.now(); if (now - lastAlgaeDraw > 45) { env.drawAlgae(state.algae); lastAlgaeDraw = now; } if (wipeN % 4 === 0) audio.wipe(); }
}
function finishWipe() {
  env.drawAlgae(state.algae);
  U.uAlgae.value = algaeMean(state) * 0.5;
  if (algaeMean(state) < 0.04 && wipeN > 12) {
    env.glassU.uWipe.value = U.uTime.value;
    if (!state.daily.clean) { state.stats.cleans++; audio.chime(); }
    if (A.unlock("aquarium:clean", "窗明几净")) toast("解锁成就 · <b>窗明几净</b>");
    credit("clean", 1, "擦玻璃");
  }
  updateMeters(); save();
}

/* 修剪 */
function trimAt() {
  const hit = ray.intersectObjects(scape.plantMeshes, false)[0];
  if (!hit) return toast("点一下想修剪的水草");
  const it = hit.object.userData.item, info = scape.plantInfo(it);
  if ((it.g ?? 0.8) < 0.95) return toast(`${info.name}还很精神，不需要修剪`);
  it.g = Math.max(0.6, it.g - 0.45); scape.place(it); scape.refresh();
  audio.snip(); env.ripple(hit.point.x, hit.point.z, 0.3);
  state.stats.trims++;
  toast(`修剪了${info.name}`);
  if (A.unlock("aquarium:trim", "小园丁")) toast("解锁成就 · <b>小园丁</b>");
  credit("trim", 1, "修剪水草"); updateMeters(); save();
}

/* 换水 */
let waterAnim = 0;
function changeWater() {
  if (waterAnim > 0) return;
  if (state.water > 92) return toast("水还很清澈，过几天再换吧");
  waterAnim = 3.6; audio.pour();
  school.startle(new THREE.Vector3(0, T.WATER, 0), 2.5);
  setMode("view");
  hint("正在换水 · 换掉三分之一的旧水");
}

/* ---------------- 每日照料与星尘 ---------------- */
function dailyCheck() {
  const k = dayKey();
  if (state.daily.date === k) return;
  const y = dayKey(Date.now() - 864e5);
  state.streak.n = state.streak.last === y ? state.streak.n + 1 : 1;
  state.streak.last = k; state.streak.days++;
  state.daily = { date: k, fed: 0, clean: 0, water: 0, trim: 0, earned: 0 };
  if (state.streak.n >= 7 && A.unlock("aquarium:week", "一周照料")) setTimeout(() => toast("解锁成就 · <b>一周照料</b>"), 2500);
}
function credit(task, amt, name) {
  if (state.daily[task]) return;
  state.daily[task] = 1;
  const give = Math.min(amt, 5 - state.daily.earned);
  if (give > 0) { A.addStardust(give, "aquarium"); state.daily.earned += give; setTimeout(() => toast(`今日照料 · ${name} <b>+${give} ✦</b>`), 900); bumpDust(); }
  updateDock(); save();
}

/* ---------------- 界面 ---------------- */
let toastT = 0;
function toast(html, ms = 2600) {
  const el = $("#toast"); el.innerHTML = html; el.classList.add("show");
  clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove("show"), ms);
}
let hintT = 0; const hinted = new Set();
function hint(t, ms = 4200) { const el = $("#hint"); el.textContent = t; el.style.opacity = 1; clearTimeout(hintT); if (ms) hintT = setTimeout(() => (el.style.opacity = 0), ms); }
function hintOnce(k, t) { if (hinted.has(k)) return; hinted.add(k); hint(t); }
function bumpDust() { const el = $("#dust"); el.classList.remove("bump"); void el.offsetWidth; el.classList.add("bump"); updateDust(); }
function updateDust() { $("#dustN").textContent = A.getStardust(); }
A.on("change", updateDust);

const MODE_HINT = { feed: "轻点水面撒下饲料 · 再点一次「喂食」结束", clean: "在玻璃上来回擦拭，抹掉藻斑", trim: "轻点长得茂盛的水草进行修剪", view: "" };
function setMode(m) {
  if (mode === "edit" && m !== "edit") editor.close();
  mode = m;
  document.body.classList.toggle("m-feed", m === "feed"); document.body.classList.toggle("m-clean", m === "clean"); document.body.classList.toggle("m-trim", m === "trim");
  for (const b of document.querySelectorAll(".dock [data-mode]")) b.classList.toggle("on", b.dataset.mode === m);
  controls.enabled = m !== "clean";
  if (MODE_HINT[m]) hint(MODE_HINT[m], 0); else $("#hint").style.opacity = 0;
  if (m === "clean") { wipeN = 0; if (algaeMean(state) < 0.02) toast("玻璃很干净，随手擦一擦也不错"); }
}
$("#dock").addEventListener("click", (e) => {
  const b = e.target.closest("button"); if (!b) return;
  audio.start(); syncSound(); audio.click();
  if (b.dataset.mode) return setMode(mode === b.dataset.mode ? "view" : b.dataset.mode);
  const a = b.dataset.act;
  if (a === "water") changeWater();
  if (a === "shop") openShop();
  if (a === "edit") { closeCard(); closeSheet(); setMode("edit"); editor.open(); }
});

function updateMeters() {
  const full = 100 - avg(state.fish, "hunger"), happy = avg(state.fish, "happy"), water = state.water, clean = 100 - algaeMean(state) * 100;
  for (const [k, v] of [["full", full], ["happy", happy], ["water", water], ["clean", clean]]) {
    const el = document.querySelector(`.meter[data-k="${k}"]`);
    el.querySelector("b").style.width = clamp(v, 3, 100) + "%";
    el.classList.toggle("low", v < (k === "clean" ? 75 : 45));
  }
  updateDock();
}
function updateDock() {
  const set = (sel, on) => { const b = document.querySelector(sel); if (b) b.classList.toggle("todo", on); };
  set('[data-mode="feed"]', !state.daily.fed || avg(state.fish, "hunger") > 55);
  set('[data-mode="clean"]', algaeMean(state) > 0.12);
  set('[data-act="water"]', state.water < 70);
  set('[data-mode="trim"]', state.layout.items.some((i) => i.t === "plant" && (i.g ?? 0) > 1.2));
}
function reminders() {
  if (avg(state.fish, "hunger") > 60) return toast("鱼儿们有点饿了，正在水面附近张望 · 去喂喂它们吧", 4200);
  if (state.water < 60) return toast("水有点浑了 · 换一次水，鱼儿会更开心", 4200);
  if (algaeMean(state) > 0.2) return toast("玻璃上长了些藻斑 · 拿海绵擦一擦吧", 4200);
  if (state.layout.items.some((i) => i.t === "plant" && (i.g ?? 0) > 1.25)) return toast("水草长得有点茂盛了 · 修剪一下更好看", 4200);
}

/* 灯光与时间 */
let hourOverride = null;
const LIGHT_ICON = {
  auto: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/></svg>',
  day: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2"/></svg>',
  night: '<svg viewBox="0 0 24 24"><path d="M19 15A8 8 0 0 1 9 5a8 8 0 1 0 10 10z"/></svg>',
};
const LIGHT_NAME = { auto: "灯光跟随真实时间", day: "开灯（白天）", night: "关灯（月光）" };
function curHour() {
  if (hourOverride != null) return hourOverride;
  if (state.settings.light === "day") return 12;
  if (state.settings.light === "night") return 23;
  const d = new Date(); return d.getHours() + d.getMinutes() / 60;
}
function updateLightBtn() { $("#bLight").innerHTML = LIGHT_ICON[state.settings.light]; $("#bLight").title = LIGHT_NAME[state.settings.light]; }
$("#bLight").addEventListener("click", () => {
  const order = ["auto", "day", "night"]; state.settings.light = order[(order.indexOf(state.settings.light) + 1) % 3];
  updateLightBtn(); toast(LIGHT_NAME[state.settings.light]); save(); audio.click();
});
updateLightBtn();

/* 菜单 */
const menu = $("#menu");
$("#bMore").addEventListener("click", (e) => { e.stopPropagation(); menu.hidden = !menu.hidden; });
addEventListener("click", (e) => { if (!menu.hidden && !menu.contains(e.target) && e.target !== $("#bMore")) menu.hidden = true; });
function syncSound() { audio.setMuted(state.settings.mute); $("#mSound").textContent = state.settings.mute ? "关" : audio.on ? "开" : "轻触后开启"; $("#mTags").textContent = state.settings.tags ? "开" : "关"; }
menu.addEventListener("click", (e) => {
  const b = e.target.closest("button"); if (!b) return;
  const a = b.dataset.act;
  if (a === "sound") { state.settings.mute = !state.settings.mute; audio.start(); syncSound(); }
  if (a === "tags") { state.settings.tags = !state.settings.tags; syncSound(); }
  if (a === "dex") { menu.hidden = true; openDex(); }
  if (a === "ach") { menu.hidden = true; openAch(); }
  if (a === "photo") { menu.hidden = true; photo(); }
  save();
});

/* 资料卡 */
let sel = null, follow = false;
const card = $("#card");
function ageText(f) { const d = (Date.now() - f.born) / 864e5; return d < 1 ? "不到 1 天" : `${Math.floor(d)} 天`; }
function moodText(f) {
  if (W.night > 0.6) return "正在休息";
  if (f.hunger > 70) return "肚子饿了";
  if (f.happy < 35) return "有点难过，躲起来了";
  if (f.happy > 80) return "心情很好";
  return "悠闲自在";
}
function openCard(f) {
  sel = f; const d = f.d, s = SP[d.sp];
  card.hidden = false; card.style.animation = "none"; void card.offsetWidth; card.style.animation = "";
  $("#cName").value = d.name;
  $("#cSp").textContent = s.name + (s.alias ? ` · ${s.alias}` : "");
  $("#cLatin").textContent = s.latin;
  const tags = [ageText(d), moodText(d)];
  if (d.sex) tags.unshift(d.sex === "m" ? "雄" : "雌");
  if (d.fry) tags.unshift("鱼苗");
  $("#cTags").innerHTML = tags.map((t) => `<span>${t}</span>`).join("");
  $("#cOrigin").textContent = s.origin; $("#cHabit").textContent = s.habit;
  $("#cFacts").innerHTML = s.facts.map((t) => `<li>${t}</li>`).join("");
  const ph = $("#cPhoto");
  if (s.photo && s.photo.src) {
    ph.hidden = false; ph.querySelector("img").src = s.photo.src;
    const p = s.photo;
    ph.querySelector("figcaption").innerHTML = `© ${p.author || ""}${p.license ? ` · <a href="${p.licenseUrl || "#"}" target="_blank" rel="noopener">${p.license}</a>` : ""}${p.source ? ` · <a href="${p.source}" target="_blank" rel="noopener">来源</a>` : ""}`;
  } else ph.hidden = true;
  updateCardBars();
  follow = false; $("#cFollow").classList.remove("on"); $("#cFollow").textContent = "跟随它";
}
function updateCardBars() { if (!sel) return; $("#cHappy").style.width = clamp(sel.d.happy, 3, 100) + "%"; $("#cFull").style.width = clamp(100 - sel.d.hunger, 3, 100) + "%"; }
function closeCard() { sel = null; card.hidden = true; follow = false; }
$("#cClose").addEventListener("click", closeCard);
$("#cName").addEventListener("change", () => { if (!sel) return; const v = $("#cName").value.trim().slice(0, 10); if (v) { sel.d.name = v; toast(`它现在叫「${v}」`); save(); } else $("#cName").value = sel.d.name; });
$("#cName").addEventListener("keydown", (e) => { if (e.key === "Enter") e.target.blur(); e.stopPropagation(); });
$("#cFollow").addEventListener("click", () => { follow = !follow; $("#cFollow").classList.toggle("on", follow); $("#cFollow").textContent = follow ? "停止跟随" : "跟随它"; });

/* 面板：鱼店 / 我的鱼 / 成就 */
const sheet = $("#sheet");
function openSheet(title, sub, html) { closeCard(); sheet.hidden = false; $("#sTitle").textContent = title; $("#sSub").innerHTML = sub; $("#sBody").innerHTML = html; }
function closeSheet() { sheet.hidden = true; }
$("#sClose").addEventListener("click", closeSheet);
function openShop() {
  const own = (id) => state.fish.filter((f) => f.sp === id).length;
  const html = SPECIES.map((s) => `<div class="scard" data-sp="${s.id}"><img alt="" data-thumb="${s.id}" /><b>${s.name}</b><i>${s.latin}</i><small>缸里有 ${own(s.id)} ${s.id === "shrimp" ? "只" : "条"}</small><button class="buy" data-buy="${s.id}" ${s.max && own(s.id) >= s.max ? "disabled" : ""}>✦ ${s.price}</button></div>`).join("");
  openSheet("鱼店", `用星尘迎接新伙伴 · 现有 <b style="color:var(--gold)">✦ ${A.getStardust()}</b>`, html);
  fillThumbs();
}
function fillThumbs() {
  const imgs = [...sheet.querySelectorAll("img[data-thumb]")];
  let i = 0;
  const next = () => { if (i >= imgs.length || sheet.hidden) return; const im = imgs[i++]; const sp = im.dataset.thumb; im.src = fishThumb(sp, +(im.dataset.v || 0), sp === "guppy" ? im.dataset.sex || "m" : sp === "betta" ? "m" : undefined); setTimeout(next, 16); };
  next();
}
$("#sBody").addEventListener("click", (e) => {
  const b = e.target.closest("[data-buy]");
  if (b) return buy(b.dataset.buy);
  const r = e.target.closest("[data-fish]");
  if (r) { const f = school.byId.get(r.dataset.fish); if (f) { closeSheet(); openCard(f); follow = true; $("#cFollow").classList.add("on"); $("#cFollow").textContent = "停止跟随"; } }
});
function buy(id) {
  const s = SP[id];
  if (state.fish.length >= MAX_FISH) return toast("缸里已经很热闹了，再多就挤啦");
  if (s.max && state.fish.filter((f) => f.sp === id).length >= s.max) return toast("一缸只能养一条雄性斗鱼");
  if (!A.spendStardust(s.price)) return toast(`星尘不足 · 需要 ✦ ${s.price}，每天照料鱼缸、或去游戏厅都能获得`);
  const f = makeFish(state, id); f.enter = true;
  state.fish.push(f); school.sync(state.fish);
  state.stats.bought++;
  audio.chime(); bumpDust();
  toast(`欢迎新成员「${f.name}」（${s.name}）`);
  env.ripple(school.byId.get(f.id).pos.x, school.byId.get(f.id).pos.z, 1.2);
  if (A.unlock("aquarium:new-fish", "新成员")) setTimeout(() => toast("解锁成就 · <b>新成员</b>"), 2700);
  if (new Set(state.fish.map((x) => x.sp)).size >= 6 && A.unlock("aquarium:collector", "小小图鉴")) setTimeout(() => toast("解锁成就 · <b>小小图鉴</b>"), 5400);
  if (state.fish.length >= 30) A.unlock("aquarium:full", "热闹的一缸");
  save(); openShop();
}
function openDex() {
  const html = state.fish.map((f) => { const s = SP[f.sp]; return `<div class="scard row" data-fish="${f.id}"><img alt="" data-thumb="${f.sp}" data-v="${f.v | 0}" data-sex="${f.sex || ""}" /><div><b>${f.name}</b><small>${s.name}${f.fry ? " · 鱼苗" : ""} · ${ageText(f)}</small><small>心情 ${Math.round(f.happy)} · 饱腹 ${Math.round(100 - f.hunger)}</small></div></div>`; }).join("");
  openSheet("我的鱼", `共 ${state.fish.length} 位 · 点一下跟随它`, html); fillThumbs();
}
const ACH = [["first-feed", "第一次喂食", "撒下第一把饲料"], ["clean", "窗明几净", "把玻璃擦得干干净净"], ["water", "清水一缸", "第一次换水"], ["trim", "小园丁", "修剪一次水草"], ["new-fish", "新成员", "从鱼店迎来新的鱼"],
  ["scaper", "造景师", "完成一次至少 12 件素材的造景"], ["fry", "新生命", "孔雀鱼生下了小鱼苗"], ["night", "夜观鱼眠", "在夜里看鱼儿们睡觉"], ["collector", "小小图鉴", "缸里同时有 6 种生物"], ["week", "一周照料", "连续 7 天照料鱼缸"], ["full", "热闹的一缸", "缸里有 30 位居民"]];
function openAch() {
  const got = new Set(A.achievements().map((a) => a.id));
  const html = ACH.map(([id, n, d]) => `<div class="scard"><b style="color:${got.has("aquarium:" + id) ? "var(--gold)" : "var(--mute)"}">${got.has("aquarium:" + id) ? "✦ " : ""}${n}</b><small>${d}</small></div>`).join("");
  openSheet("成就", `已解锁 ${ACH.filter(([id]) => got.has("aquarium:" + id)).length} / ${ACH.length} · 连续照料 ${state.streak.n} 天`, html);
}

/* 名牌 */
const tagsEl = $("#tags"), tagPool = new Map();
const pv = new THREE.Vector3();
function updateTags() {
  const on = state.settings.tags && mode !== "edit";
  tagsEl.style.display = on ? "" : "none";
  if (!on) return;
  const seen = new Set();
  for (const f of school.list) {
    let el = tagPool.get(f.d.id);
    if (!el) { el = document.createElement("div"); el.className = "tag"; tagsEl.appendChild(el); tagPool.set(f.d.id, el); }
    if (el.textContent !== f.d.name) el.textContent = f.d.name;
    pv.copy(f.pos); pv.y += f.size * 0.45; pv.project(camera);
    el.style.transform = `translate(${(pv.x * 0.5 + 0.5) * innerWidth}px, ${(-pv.y * 0.5 + 0.5) * innerHeight}px) translate(-50%, -120%)`;
    seen.add(f.d.id);
  }
  for (const [id, el] of tagPool) if (!seen.has(id)) { el.remove(); tagPool.delete(id); }
}

/* 拍照 */
function photo() {
  document.body.classList.add("photo");
  requestAnimationFrame(() => requestAnimationFrame(() => {
    render();
    canvas.toBlob((b) => {
      document.body.classList.remove("photo");
      if (!b) return toast("保存失败");
      const a = document.createElement("a"); const d = new Date();
      a.download = `aquarium-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}-${d.getHours()}${d.getMinutes()}.png`;
      a.href = URL.createObjectURL(b); document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      toast("照片已保存"); audio.tone(1200, 0.1, 0.08);
    }, "image/png");
  }));
}

/* 离开期间 */
function fmtDur(ms) { const m = Math.round(ms / 6e4); if (m < 60) return `${m} 分钟`; const h = Math.floor(m / 60); if (h < 24) return `${h} 小时 ${m % 60} 分`; return `${Math.floor(h / 24)} 天 ${h % 24} 小时`; }
function showAway(sum) {
  if (!sum || sum.ms < 5 * 6e4) return false;
  const b = sum.before, a = sum.after;
  $("#aDur").textContent = `你离开了 ${fmtDur(sum.ms)}`;
  const row = (n, x, y, inv) => { const up = inv ? y < x : y > x; return `<div>${n}<b class="${Math.abs(y - x) < 1 ? "" : up ? "up" : "dn"}">${Math.round(x)} → ${Math.round(y)}</b></div>`; };
  $("#aStats").innerHTML = row("饱腹", 100 - b.hunger, 100 - a.hunger) + row("心情", b.happy, a.happy) + row("水质", b.water, a.water) + row("洁净", 100 - b.algae * 100, 100 - a.algae * 100);
  const st = awayStories(state, sum);
  $("#aStory").innerHTML = st.map((s) => `<li>${s}</li>`).join("");
  $("#away").hidden = false;
  if (sum.fry.length && A.unlock("aquarium:fry", "新生命")) setTimeout(() => toast("解锁成就 · <b>新生命</b>"), 1500);
  return true;
}
$("#aOk").addEventListener("click", () => { $("#away").hidden = true; audio.start(); syncSound(); setTimeout(reminders, 700); });

/* ---------------- 编辑器 ---------------- */
const editor = new Editor({ scape, state: () => state, toast, hint, audio, save: () => save(), A, controls, camera, bumpDust, exit: () => setMode("view"), refreshAll: () => { school.sync(state.fish); updateMeters(); } });

/* ---------------- 主循环 ---------------- */
let simT = 0, liveAcc = 0, saveAcc = 0, nightT = 0, raf = 0, last = performance.now();
const camOff = new THREE.Vector3();
function step(dt) {
  simT += dt; U.uTime.value = simT; grain.uniforms.uTime.value = simT;
  const hour = curHour();
  const viewH = innerHeight * curPR / (2 * Math.tan((camera.fov * Math.PI) / 360));
  const L = env.update(dt, hour, state.water, viewH);
  W.night = L.n; audio.setNight(L.n);
  renderer.toneMappingExposure = L.exp;
  // 雾：与相机距离匹配
  const cd = camera.position.distanceTo(controls.target);
  const gd = Math.max(0.5, camera.position.z - T.Z1);
  scene.fog.near = gd; scene.fog.far = gd + 38 - (1 - state.water / 100) * 16;
  U.uAbs.value.copy(L.fog).multiplyScalar(0.9);
  // 换水动画
  if (waterAnim > 0) {
    waterAnim -= dt;
    env.partU.uDirt.value = Math.max(env.partU.uDirt.value, Math.sin(Math.min(1, (3.6 - waterAnim) / 3.6) * Math.PI) * 0.8);
    if (Math.random() < dt * 8) env.ripple((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 4, 1.2);
    U.uFlow.value = 1 + Math.sin(Math.min(1, (3.6 - waterAnim) / 3.6) * Math.PI) * 2.5;
    if (waterAnim <= 0) {
      U.uFlow.value = 1;
      state.water = Math.min(100, state.water + 60); state.stats.changes++;
      toast("换水完成 · 水变得清澈透亮"); audio.chime();
      if (A.unlock("aquarium:water", "清水一缸")) setTimeout(() => toast("解锁成就 · <b>清水一缸</b>"), 2700);
      credit("water", 1, "换水"); updateMeters(); save();
    }
  }
  school.update(dt, simT); food.update(dt, simT);
  if (studioFish) studioFish.update(dt);
  if (food.wasted) { state.water = Math.max(18, state.water - food.wasted * 0.25); food.wasted = 0; }
  // 实时“云养”推进
  liveAcc += dt; saveAcc += dt;
  if (liveAcc > 2) {
    const ev = advance(state, liveAcc / 3600, true); liveAcc = 0;
    state.lastTick = Date.now();
    if (ev.fry.length) { school.sync(state.fish); toast(`孔雀鱼妈妈生下了 ${ev.fry.length} 条小鱼苗！`, 4000); if (A.unlock("aquarium:fry", "新生命")) setTimeout(() => toast("解锁成就 · <b>新生命</b>"), 4200); }
    for (const f of school.list) if (f.d.fry) f.applyScale();
    updateMeters(); updateCardBars(); dailyCheck();
    $("#clock").textContent = `${phaseName(hour)} ${String(Math.floor(hour)).padStart(2, "0")}:${String(Math.floor((hour % 1) * 60)).padStart(2, "0")}`;
  }
  if (saveAcc > 10) { saveAcc = 0; save(); }
  if (L.n > 0.8) { nightT += dt; if (nightT > 6 && A.unlock("aquarium:night", "夜观鱼眠")) toast("解锁成就 · <b>夜观鱼眠</b> · 鱼儿们睡着了，轻一点哦"); } else nightT = 0;
  // 跟随
  if (sel && follow) {
    camOff.copy(sel.pos).sub(controls.target).multiplyScalar(1 - Math.exp(-dt * 2.5));
    controls.target.add(camOff); camera.position.add(camOff);
  } else if (!sel && mode !== "edit") {
    camOff.copy(target).sub(controls.target).multiplyScalar(1 - Math.exp(-dt * 1.2));
    controls.target.add(camOff); camera.position.add(camOff);
  }
  controls.update();
  // 景深：选中鱼时对焦（低画质档位关闭）
  bokeh.enabled = !!sel && q.level <= 1;
  if (bokeh.enabled) { bokeh.uniforms.focus.value = camera.position.distanceTo(sel.pos); bokeh.uniforms.aperture.value = 0.0011; bokeh.uniforms.maxblur.value = 0.0075; }
  grain.uniforms.uGrain.value = q.level >= q.levels.length - 1 ? 0 : 0.03;
  env.rays.forEach((r) => (r.visible = q.level < q.levels.length - 2));
  audio.tick(dt);
  updateTags();
  editor.tick && editor.tick(dt);
}
function render() { composer.render(); }
function frame(now) {
  raf = requestAnimationFrame(frame);
  const raw = (now - last) / 1000; last = now;
  q.tick(raw);
  step(Math.min(raw, 0.05));
  render();
}
function save() { state.lastTick = Date.now(); saveState(state); }

document.addEventListener("visibilitychange", () => {
  if (document.hidden) { cancelAnimationFrame(raf); raf = 0; save(); }
  else if (!raf) {
    const sum = catchUp(state); school.sync(state.fish); refreshFromState();
    if (sum.ms > 30 * 6e4) showAway(sum);
    last = performance.now(); raf = requestAnimationFrame(frame);
  }
});
addEventListener("pagehide", save);
addEventListener("resize", resize);

function refreshFromState() {
  for (const it of state.layout.items) if (it.t === "plant") scape.place(it);
  scape.refresh();
  env.drawAlgae(state.algae); U.uAlgae.value = algaeMean(state) * 0.5;
  updateMeters(); updateDust();
}

/* ---------------- 调试钩子 ---------------- */
window.__aq = {
  get state() { return state; }, school, scape, env, camera, controls, food, editor,
  advance(sec, fps = 30) { const n = Math.round(sec * fps); for (let i = 0; i < n; i++) step(1 / fps); render(); return n; },
  timeTravel(hours) { state.lastTick -= hours * 36e5; const sum = catchUp(state); school.sync(state.fish); refreshFromState(); showAway(sum); save(); return sum; },
  setHour(h) { hourOverride = h; },
  feed(x = 0) { food.drop(x, 0, 10); },
  wipeAll() { state.algae.fill(0); env.drawAlgae(state.algae); },
  buy, openCard: (i) => openCard(school.list[i]), select: (id) => openCard(school.byId.get(id)), openShop, openDex, openAch, setMode, photo, closeCard, closeSheet,
  render, toast, q,
  /** 近景对照：把一条鱼摆在镜头前（调试 / 截图用） */
  studio(sp, opts = {}, yaw = 0.35) {
    for (const f of school.list) f.obj.visible = false;
    if (studioFish) scene.remove(studioFish.obj);
    const d = makeFish(state, sp, opts);
    const f = (studioFish = new Fish(d, scene, W, null));
    const at = new THREE.Vector3(0, 3.4, 1.0);
    f.update = (dt) => { f.anim(dt, sp === "shrimp" ? 0.5 : 1.3, sp === "shrimp" ? 0.01 : 0.06, 1); f.pos.copy(at); f.yaw = yaw; f.pitch = 0; f.yawRate = 0; f.roll = 0; f.pose(dt); };
    f.update(0.016);
    const dist = f.size * (sp === "shrimp" ? 2.2 : 1.9) + 0.4;
    controls.minDistance = 0.2; controls.target.copy(at); camera.position.set(at.x, at.y + 0.05, at.z + dist); controls.update();
    sel = f; follow = false;
    return f;
  },
};

/* ---------------- 开始 ---------------- */
say("灯光亮起…");
resize();
dailyCheck();
refreshFromState();
syncSound();
updateDust();
setTimeout(() => {
  document.body.classList.add("ready");
  const away = showAway(summary);
  if (fresh) setTimeout(() => toast("欢迎来到你的水族箱 · 送你一缸小鱼和 <b>✦ 20</b> 星尘", 4500), 1400);
  else if (!away) setTimeout(reminders, 2200);
  setTimeout(() => hint("拖动环顾 · 双指缩放 · 轻点鱼儿查看资料", 5200), 1600);
}, 120);
last = performance.now();
raf = requestAnimationFrame(frame);
