// 沉没之后 · 序章：主程序（渲染、后期、导演调度、输入、存档、界面）
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { autoQuality } from "../../../shared/perf.js";
import { Sound } from "./audio.js";
import { clamp, damp, noise1 } from "./util.js";
import { buildCabin } from "./cabin.js";
import { buildSea } from "./sea.js";
import { buildDawn } from "./dawn.js";
import { SCENES } from "./story.js";

const $ = (s) => document.querySelector(s);
const loadEl = $("#load");
const say = (t) => { if (loadEl) loadEl.textContent = t; };

/* ---------------- 存档 ---------------- */
const SAVE_KEY = "wx.tide.v1";
function loadSave() { try { return JSON.parse(localStorage.getItem(SAVE_KEY)) || {}; } catch { return {}; } }
let save = loadSave();
function writeSave(patch) { save = { ...save, ...patch, v: 1, at: Date.now() }; try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch {} }

/* ---------------- 渲染器与后期 ---------------- */
const canvas = $("#gl");
const lowEnd = Math.min(screen.width, screen.height) < 500 || (navigator.deviceMemory && navigator.deviceMemory <= 4);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setSize(innerWidth, innerHeight, false);

const dpr = Math.min(2, window.devicePixelRatio || 1);
const rt = new THREE.WebGLRenderTarget(innerWidth, innerHeight, { type: THREE.HalfFloatType, samples: dpr > 1.4 ? 0 : 4 });
const composer = new EffectComposer(renderer, rt);
const renderPass = new RenderPass(new THREE.Scene(), new THREE.PerspectiveCamera());
composer.addPass(renderPass);
// 安全过滤：把 NaN / 无穷大 / 过亮的像素在泛光之前清掉（手机上它们会被泛光扩散成大片黑块）
composer.addPass(new ShaderPass({
  uniforms: { tDiffuse: { value: null } },
  vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
  fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv;
    void main(){ vec4 c = texture2D(tDiffuse, vUv);
      bool bad = !(c.r == c.r) || !(c.g == c.g) || !(c.b == c.b) || !(c.a == c.a) || any(greaterThan(abs(c), vec4(1e4)));
      gl_FragColor = bad ? vec4(0.0, 0.0, 0.0, 1.0) : clamp(c, vec4(0.0), vec4(32.0)); }`,
}));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.45, 0.5, 0.85);
composer.addPass(bloom);
composer.addPass(new OutputPass());
const grade = new ShaderPass({
  uniforms: {
    tDiffuse: { value: null }, uRes: { value: new THREE.Vector2(innerWidth, innerHeight) }, uTime: { value: 0 },
    uFade: { value: 1 }, uFlash: { value: 0 }, uVig: { value: 0.9 }, uGrain: { value: 0.04 }, uLid: { value: 0 },
    uBlur: { value: 0 }, uAber: { value: 0 }, uSat: { value: 1 }, uTint: { value: new THREE.Color(1, 1, 1) },
  },
  vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform vec2 uRes; uniform float uTime, uFade, uFlash, uVig, uGrain, uLid, uBlur, uAber, uSat; uniform vec3 uTint;
    varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){
      vec2 uv = vUv;
      vec4 c = texture2D(tDiffuse, uv);
      if (uBlur > 0.01) {
        vec2 px = uBlur / max(uRes, vec2(1.0));
        vec4 s = c * 0.2;
        s += texture2D(tDiffuse, uv + vec2(px.x, 0.0)) * 0.1; s += texture2D(tDiffuse, uv - vec2(px.x, 0.0)) * 0.1;
        s += texture2D(tDiffuse, uv + vec2(0.0, px.y)) * 0.1; s += texture2D(tDiffuse, uv - vec2(0.0, px.y)) * 0.1;
        s += texture2D(tDiffuse, uv + px * 1.6) * 0.1; s += texture2D(tDiffuse, uv - px * 1.6) * 0.1;
        s += texture2D(tDiffuse, uv + vec2(px.x, -px.y) * 1.6) * 0.1; s += texture2D(tDiffuse, uv + vec2(-px.x, px.y) * 1.6) * 0.1;
        c = s;
      }
      if (uAber > 0.0005) { vec2 d = (uv - 0.5) * uAber; c.r = texture2D(tDiffuse, uv + d).r; c.b = texture2D(tDiffuse, uv - d).b; }
      float l = dot(c.rgb, vec3(0.299, 0.587, 0.114));
      c.rgb = mix(vec3(l), c.rgb, uSat) * uTint;
      vec2 d = uv - 0.5; c.rgb *= 1.0 - dot(d, d) * uVig;
      float n = h(uv * uRes + fract(uTime * 7.3) * 100.0) - 0.5;
      c.rgb += n * uGrain * (1.0 - l * 0.6);
      if (uLid > 0.001) {
        float y = abs(uv.y - 0.5) * 2.0, x = (uv.x - 0.5) * 2.0;
        float edge = (1.0 - uLid) * (1.0 - x * x * 0.4) * 1.15;
        c.rgb *= 1.0 - smoothstep(edge - 0.18, edge + 0.02, y);
      }
      c.rgb = mix(c.rgb, vec3(1.0, 0.98, 0.95), clamp(uFlash, 0.0, 1.0));
      c.rgb *= 1.0 - clamp(uFade, 0.0, 1.0);
      gl_FragColor = vec4(c.rgb, 1.0);
    }`,
});
composer.addPass(grade);
const G = grade.uniforms;

let curPR = 1;

/* ---------------- 声音 ---------------- */
const snd = new Sound();
if (typeof save.vol === "number") snd.vol = save.vol;
snd.muted = !!save.muted;

/* ---------------- 界面 ---------------- */
const ui = {
  sub: $("#sub"), subZh: $("#subZh"), subEn: $("#subEn"), hint: $("#hint"), chapter: $("#chapter"),
  acts: $("#acts"), phone: $("#phone"), swim: $("#swim"), title: $("#title"), end: $("#end"), pause: $("#pause"),
  hud: $("#hud"), under: $("#under"), ring: $("#ring"), ringIn: $("#ringIn"), stamB: $("#stamB"), dir: $("#dir"), swimHelp: $("#swimHelp"),
};

/* ---------------- 导演 ---------------- */
const fx = {
  fade: 1, fadeT: 1, fadeK: 1.2, flash: 0, lid: 0, lidT: 0, lidK: 1.5, blur: 0, blurT: 0, sat: 1, satT: 1, vig: 0.9, vigT: 0.9,
  shake: 0, shakeT: 0, kick: 0, aber: 0, under: 0,
};
const D = { i: -1, t: 0, ci: 0, gate: null, time: 0, paused: false, manual: false, started: false, pendingNext: -1, timers: [], tweens: [], flags: {}, subT: 0, hintT: 0, chT: 0 };
const worlds = {};
let W = null, worldName = "";

const BLOOM = { cabin: [0.42, 0.55, 0.86], sea: [0.55, 0.6, 0.8], dawn: [0.32, 0.5, 0.9] };
const EXPOSURE = { cabin: 0.88, sea: 1.0, dawn: 0.86 };
function getWorld(name) {
  if (!worlds[name]) {
    const B = { cabin: buildCabin, sea: buildSea, dawn: buildDawn }[name];
    worlds[name] = B({ renderer, lowEnd });
    worlds[name].resize(innerWidth, innerHeight);
    try { renderer.compile(worlds[name].scene, worlds[name].camera); } catch {}
  }
  return worlds[name];
}
function setWorld(name) {
  if (worldName === name && W) return W;
  for (const k of Object.keys(worlds)) if (k !== name && !(k === "dawn" && name === "dawn")) { worlds[k].dispose(); delete worlds[k]; }
  W = getWorld(name); worldName = name;
  renderPass.scene = W.scene; renderPass.camera = W.camera;
  renderer.toneMappingExposure = EXPOSURE[name];
  const b = BLOOM[name]; bloom.strength = b[0]; bloom.radius = b[1]; bloom.threshold = b[2];
  return W;
}
// 空闲时提前把下一个世界搭好，避免切幕时卡顿
function prebuild(name) { setTimeout(() => { if (!worlds[name]) getWorld(name); }, 200); }

const ctx = {
  get W() { return W; }, D, fx, snd, ui, worlds,
  get time() { return D.time; },
  get flags() { return D.flags; },
  world: setWorld, prebuild,
  sub(zh, en = "", dur = 4) {
    if (!zh) { ui.sub.classList.remove("on"); return; }
    ui.subZh.innerHTML = zh; ui.subEn.textContent = en;
    ui.sub.classList.add("on"); D.subT = dur;
  },
  hint(text, dur = 0) {
    if (!text) { ui.hint.classList.remove("on"); D.hintT = 0; return; }
    ui.hint.textContent = text; ui.hint.classList.add("on"); D.hintT = dur || 1e9;
  },
  chapter(zh, en, dur = 3) { $("#chZh").textContent = zh; $("#chEn").textContent = en; ui.chapter.classList.add("on"); D.chT = dur; },
  bars(mode) { document.body.classList.toggle("thin", mode === "thin"); document.body.classList.toggle("nobars", mode === "none"); },
  after(sec, fn) { D.timers.push({ t: D.time + sec, fn }); },
  wait(cond, timeout) { D.gate = { cond, left: timeout }; },
  tween(obj, key, to, sec, ease = (x) => x * x * (3 - 2 * x)) { D.tweens = D.tweens.filter((w) => !(w.obj === obj && w.key === key)); D.tweens.push({ obj, key, from: obj[key], to, t: 0, sec: Math.max(0.001, sec), ease }); },
  next(opts = {}) {
    if (D.pendingNext >= 0) return;
    if (opts.cut) { goto(D.i + 1); return; }
    fx.fadeT = 1; fx.fadeK = 3; D.pendingNext = opts.delay ?? 0.9;
  },
  save: writeSave,
  replay() { writeSave({ scene: 0, done: false }); goto(0); },
};

function clearScene() {
  D.timers = []; D.tweens = []; D.gate = null; D.pendingNext = -1;
  ctx.sub(null); ctx.hint(null);
  ui.acts.hidden = true; ui.phone.hidden = true; ui.swim.hidden = true; ui.under.classList.remove("on");
  ui.title.classList.remove("on", "up"); ui.end.classList.remove("on"); ui.end.hidden = true;
  fx.shakeT = 0; fx.blurT = 0; fx.satT = 1; fx.vigT = 0.9; fx.lidT = 0; fx.aber = 0; fx.under = 0;
  snd.alarmOn(false);
}

function goto(i) {
  i = clamp(i, 0, SCENES.length - 1);
  const prev = SCENES[D.i];
  if (prev && prev.exit) prev.exit(ctx);
  clearScene();
  D.i = i; D.t = 0; D.ci = 0;
  if (i === 0) D.flags = {};
  const S = SCENES[i];
  setWorld(S.world);
  S.enter && S.enter(ctx);
  if (i < SCENES.length - 1) writeSave({ scene: i, done: false }); else writeSave({ scene: i, done: true });
  if (S.prebuild) prebuild(S.prebuild);
}

function step(dt) {
  D.time += dt;
  const S = SCENES[D.i];
  if (!S) return;
  // 剧本时间（等待玩家时暂停）
  if (D.gate) {
    D.gate.left -= dt;
    if (D.gate.cond() || D.gate.left <= 0) D.gate = null;
  } else D.t += dt;
  while (!D.gate && S.cues && D.ci < S.cues.length && D.t >= S.cues[D.ci][0]) { const c = S.cues[D.ci++]; c[1](ctx); }
  if (S.update) S.update(ctx, dt);
  for (let k = D.timers.length - 1; k >= 0; k--) if (D.time >= D.timers[k].t) { const tm = D.timers.splice(k, 1)[0]; tm.fn(ctx); }
  for (let k = D.tweens.length - 1; k >= 0; k--) {
    const w = D.tweens[k]; w.t += dt;
    const u = clamp(w.t / w.sec);
    w.obj[w.key] = w.from + (w.to - w.from) * w.ease(u);
    if (u >= 1) D.tweens.splice(k, 1);
  }
  if (D.pendingNext >= 0) { D.pendingNext -= dt; if (D.pendingNext < 0) { D.pendingNext = -1; goto(D.i + 1); return; } }
  // 界面计时
  if (D.subT > 0) { D.subT -= dt; if (D.subT <= 0) ui.sub.classList.remove("on"); }
  if (D.hintT > 0) { D.hintT -= dt; if (D.hintT <= 0) ui.hint.classList.remove("on"); }
  if (D.chT > 0) { D.chT -= dt; if (D.chT <= 0) ui.chapter.classList.remove("on"); }
  // 画面效果
  fx.fade = damp(fx.fade, fx.fadeT, fx.fadeK, dt);
  fx.lid = damp(fx.lid, fx.lidT, fx.lidK, dt);
  fx.blur = damp(fx.blur, fx.blurT, 1.5, dt);
  fx.sat = damp(fx.sat, fx.satT, 1.5, dt);
  fx.vig = damp(fx.vig, fx.vigT, 1.5, dt);
  fx.shake = damp(fx.shake, fx.shakeT, 2.5, dt);
  fx.flash = Math.max(0, fx.flash - dt * 1.2);
  fx.kick = Math.max(0, fx.kick - dt * 2.5);
  W.update(dt, D.time);
  snd.tick();
}

function render() {
  if (!W) return;
  const s = fx.shake + fx.kick, t = D.time;
  if (s > 0.001) {
    const cam = W.camera;
    cam.position.x += noise1(t * 13) * 0.02 * s; cam.position.y += noise1(t * 17 + 5) * 0.025 * s;
    cam.rotation.x += noise1(t * 11 + 9) * 0.02 * s; cam.rotation.z += noise1(t * 9 + 2) * 0.03 * s; cam.rotation.y += noise1(t * 7 + 4) * 0.012 * s;
  }
  G.uTime.value = t; G.uFade.value = fx.fade; G.uFlash.value = fx.flash; G.uLid.value = fx.lid; G.uBlur.value = fx.blur * curPR;
  G.uSat.value = fx.sat; G.uVig.value = fx.vig; G.uAber.value = fx.aber + s * 0.004;
  composer.render();
}

/* ---------------- 尺寸 ---------------- */
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false); composer.setSize(w, h);
  G.uRes.value.set(w * curPR, h * curPR);
  for (const k in worlds) worlds[k].resize(w, h);
}
addEventListener("resize", resize);

const q = autoQuality({
  id: "tide", maxPR: dpr,
  setPR: (pr) => { curPR = pr; renderer.setPixelRatio(pr); composer.setPixelRatio(pr); resize(); },
  setBloom: (on) => { bloom.enabled = on; },
});

/* ---------------- 主循环 ---------------- */
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const raw = (now - last) / 1000; last = now;
  if (document.hidden) return;
  if (!D.manual) q.tick(raw);
  if (D.manual) return; // 自动化测试：时间与渲染都由 __tide 控制
  if (D.started && !D.paused) step(Math.min(Math.max(raw, 0), 0.1));
  render();
}

document.addEventListener("visibilitychange", () => {
  if (document.hidden) snd.suspend();
  else if (!D.paused) { snd.resume(); last = performance.now(); }
});

/* ---------------- 输入 ---------------- */
const ndcOf = (x, y) => new THREE.Vector2((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1);
let ptr = null;
const input = { steerKeys: 0, mouseSteer: 0, touchSteer: 0 };
ctx.input = input;
canvas.addEventListener("pointerdown", (e) => {
  if (!D.started || D.paused) return;
  snd.start();
  ptr = { id: e.pointerId, x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, moved: 0, type: e.pointerType };
  try { canvas.setPointerCapture(e.pointerId); } catch {}
  const S = SCENES[D.i];
  if (S && S.onDown) S.onDown(ctx, ndcOf(e.clientX, e.clientY), e);
});
canvas.addEventListener("pointermove", (e) => {
  const S = SCENES[D.i];
  if (e.pointerType === "mouse") input.mouseSteer = (e.clientX / innerWidth - 0.5) * 2;
  if (!ptr || ptr.id !== e.pointerId) return;
  const dx = e.clientX - ptr.lx, dy = e.clientY - ptr.ly;
  ptr.lx = e.clientX; ptr.ly = e.clientY; ptr.moved += Math.abs(dx) + Math.abs(dy);
  if (S && S.onDrag) S.onDrag(ctx, dx, dy, e.clientX - ptr.x, ptr);
  else if (W && W.lookDrag) W.lookDrag(dx, dy);
});
const up = (e) => {
  if (!ptr || ptr.id !== e.pointerId) return;
  const S = SCENES[D.i];
  if (ptr.moved < 10 && S && S.onTap) S.onTap(ctx, ndcOf(e.clientX, e.clientY), e);
  if (S && S.onUp) S.onUp(ctx, ptr);
  ptr = null; input.touchSteer = 0;
};
canvas.addEventListener("pointerup", up);
canvas.addEventListener("pointercancel", up);
canvas.addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse") input.mouseSteer = 0; });
const keys = new Set();
addEventListener("keydown", (e) => {
  if (!D.started) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); startGame(); } return; }
  if (e.key === "Escape" || e.key === "p" || e.key === "P") { togglePause(); return; }
  if (D.paused) return;
  const k = e.key.toLowerCase();
  if (k === " " || k === "spacebar") e.preventDefault();
  keys.add(k);
  input.steerKeys = (keys.has("d") || keys.has("arrowright") ? 1 : 0) - (keys.has("a") || keys.has("arrowleft") ? 1 : 0);
  const S = SCENES[D.i];
  if (S && S.onKey && !e.repeat) S.onKey(ctx, k);
});
addEventListener("keyup", (e) => {
  const k = e.key.toLowerCase(); keys.delete(k);
  input.steerKeys = (keys.has("d") || keys.has("arrowright") ? 1 : 0) - (keys.has("a") || keys.has("arrowleft") ? 1 : 0);
});

/* ---------------- 控制按钮 ---------------- */
function togglePause(force) {
  if (!D.started) return;
  D.paused = force ?? !D.paused;
  ui.pause.hidden = !D.paused;
  if (D.paused) snd.suspend(); else { snd.resume(); last = performance.now(); }
}
$("#bPause").onclick = () => togglePause(true);
$("#bResume").onclick = () => togglePause(false);
$("#bSkip").onclick = () => { if (D.i < SCENES.length - 1) goto(D.i + 1); };
$("#bSkipAll").onclick = () => { togglePause(false); goto(SCENES.length - 1); };
$("#bRestart").onclick = () => { togglePause(false); ctx.replay(); };
$("#bReplay").onclick = () => ctx.replay();
const vol = $("#vol"), volR = $("#volR"), bMute = $("#bMute"), bSound = $("#bSound");
const syncSound = () => { volR.value = Math.round(snd.vol * 100); bMute.textContent = snd.muted ? "取消静音" : "静音"; bSound.classList.toggle("off", snd.muted || snd.vol === 0); };
bSound.onclick = (e) => { e.stopPropagation(); vol.hidden = !vol.hidden; syncSound(); };
volR.oninput = () => { snd.setVolume(volR.value / 100); if (snd.muted && snd.vol > 0) snd.setMuted(false); writeSave({ vol: snd.vol, muted: snd.muted }); syncSound(); };
bMute.onclick = () => { snd.setMuted(!snd.muted); writeSave({ muted: snd.muted }); syncSound(); };
document.addEventListener("pointerdown", (e) => { if (!vol.hidden && !vol.contains(e.target) && e.target !== bSound && !bSound.contains(e.target)) vol.hidden = true; });
syncSound();

/* ---------------- 开始画面 ---------------- */
say("正在搭建机舱……");
setWorld("cabin");
const CH = SCENES.map((s) => s.chapter && s.chapter[0]);
const startBtns = $("#startBtns");
const resumeAt = save.scene > 0 && save.scene < SCENES.length - 1 && !save.done ? save.scene : 0;
if (resumeAt > 0) {
  $("#bStart").textContent = `继续 · 「${CH[resumeAt]}」`;
  const b = document.createElement("button"); b.className = "btn"; b.textContent = "从头开始"; b.id = "bFresh";
  b.onclick = () => startGame(0);
  startBtns.appendChild(b);
} else if (save.done) {
  $("#bStart").textContent = "重新播放";
}
$("#bStart").onclick = () => startGame(resumeAt);
say("");
requestAnimationFrame(frame);

function startGame(at = resumeAt) {
  if (D.started) return;
  snd.start();
  D.started = true;
  $("#start").classList.add("out");
  setTimeout(() => { $("#start").hidden = true; }, 1500);
  ui.hud.hidden = false;
  last = performance.now();
  goto(at);
}

/* ---------------- 调试接口（自动化测试用）---------------- */
window.__tide = {
  goto, step, render,
  start(at = 0) { startGame(at); },
  advance(sec, fps = 30, noRender = false) { const n = Math.round(sec * fps); for (let k = 0; k < n; k++) step(1 / fps); if (!noRender) render(); return this.state; },
  set manual(v) { D.manual = !!v; }, get manual() { return D.manual; },
  get state() {
    const S = SCENES[D.i] || {};
    const st = { scene: D.i, key: S.key, t: +D.t.toFixed(2), time: +D.time.toFixed(2), gated: !!D.gate, world: worldName, flags: { ...D.flags }, fade: +fx.fade.toFixed(2), paused: D.paused, quality: q.level };
    if (worldName === "sea" && W.P) {
      const P = W.P;
      st.swim = { x: +P.x.toFixed(2), z: +P.z.toFixed(2), mode: W.S.mode, dist: +W.islandDist().toFixed(1), stamina: +P.stamina.toFixed(1), heading: +P.heading.toFixed(2), good: P.good, phase: +P.phase.toFixed(2), under: P.under > 0, hold: !!P.hold, swimT: +P.swimT.toFixed(1) };
    }
    return st;
  },
  ctx, fx, snd,
};
