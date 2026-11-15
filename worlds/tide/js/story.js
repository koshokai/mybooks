// 沉没之后 · 序章：分镜脚本（七幕）
import * as THREE from "three";
import { clamp } from "./util.js";
import { ISLAND } from "./sea.js";

const $ = (s) => document.querySelector(s);
const isTouch = matchMedia("(pointer: coarse)").matches;
const PA = (s) => `<i>广播</i>　${s}`;

/* ---------- 机舱里的小动作：遮光板 / 手机 / 小女孩 ---------- */
let actsBound = false;
function bindActs(ctx) {
  if (actsBound) return;
  actsBound = true;
  $("#acts").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    ctx.snd.start();
    const a = b.dataset.act;
    if (a === "shade") shade(ctx);
    if (a === "phone") openPhone(ctx);
    if (a === "girl") girl(ctx);
  });
  $("#phDraft").addEventListener("click", () => {
    const body = $("#phBody");
    const p = document.createElement("p"); p.className = "out fail"; p.textContent = "嗯，到了就告诉你。"; body.appendChild(p);
    const n = document.createElement("p"); n.className = "note"; n.textContent = "飞行模式中 · 消息未能发出"; body.appendChild(n);
    $("#phInput").classList.add("sent");
    ctx.flags.sent = true;
    ctx.snd.click(0.06);
    setTimeout(() => { if (!ctx.ui.phone.hidden) closePhone(ctx); }, 2600);
  });
  $("#phClose").addEventListener("click", () => closePhone(ctx));
}
function shade(ctx) {
  if (!ctx.W.toggleShade) return;
  const down = ctx.W.toggleShade();
  ctx.snd.shade(!down);
  $("#actShade").textContent = down ? "拉起遮光板" : "遮光板";
  ctx.flags.shade = (ctx.flags.shade || 0) + 1;
}
function openPhone(ctx) {
  if (ctx.D.i > 1) return;
  ctx.ui.phone.hidden = false;
  $("#phoneDot").classList.remove("on");
  document.querySelector('[data-act="phone"]').classList.remove("pulse");
  ctx.flags.phoneOpen = true;
  ctx.snd.click(0.05);
  ctx.zoom(0.9, 0.6); ctx.dof(1.2);
}
function closePhone(ctx) {
  ctx.ui.phone.hidden = true;
  ctx.flags.phoneDone = true;
  ctx.zoom(1, 0.6); ctx.dof(0);
  if (ctx.D.i === 0 && !ctx.flags.phoneLine) {
    ctx.flags.phoneLine = true;
    if (ctx.flags.sent) ctx.sub("消息没发出去。没关系，落地再说。", "The message didn't send. That's fine — I'll tell her when we land.", 4.5);
    else ctx.sub("等落地了，再回她吧。", "I'll reply when we land.", 3.6);
  }
}
function resetPhone() {
  const body = $("#phBody");
  body.querySelectorAll(".fail, .note").forEach((n) => n.remove());
  $("#phInput").classList.remove("sent");
}
function girl(ctx) {
  if (ctx.D.i !== 0 || !ctx.W.showDrawing) return;
  if (ctx.flags.girlShown) { ctx.W.setView("drawing"); return; }
  ctx.flags.girlShown = true;
  ctx.hint(null);
  ctx.W.setView("drawing", 1.4);
  ctx.W.showDrawing(true);
  ctx.zoom(0.84, 0.4); ctx.dof(1, 0.45, 0.55);
  ctx.snd.murmur(1.1, { f: 2500, v: 0.05 });
  ctx.sub("小女孩：「你看！这是我们的新家。」", "Girl: \"Look! This is our new home.\"", 3.6);
  ctx.after(3.8, () => { ctx.snd.murmur(1.4, { f: 2500, v: 0.05 }); ctx.sub("「它漂在海上，下雨也不怕。」", "\"It floats on the sea. It's not afraid of rain.\"", 4); });
  ctx.after(8.2, () => { ctx.W.showDrawing(false); ctx.W.setView("window", 1); ctx.flags.girlDone = true; ctx.zoom(1, 0.4); ctx.dof(0); });
}
function cabinTap(ctx, ndc) {
  const hit = ctx.W.pick(ndc);
  if (hit === "shade") shade(ctx);
  else if (hit === "girl") girl(ctx);
}

/* ---------- 声音预设 ---------- */
function cabinSound(ctx, storm = 0) {
  const s = ctx.snd;
  s.muffle(0); s.set("engine", 0.32 + storm * 0.15); s.set("air", 0.1); s.set("rumble", storm * 0.6); s.setEngine(storm);
  for (const k of ["rain", "waves", "wind", "tinnitus", "breeze"]) s.set(k, 0);
  s.heartbeat(0);
}
function cabinBase(ctx, o = {}) {
  const S = ctx.W.S;
  Object.assign(S, { storm: 0, sea: 0, inCloud: 0, roll: 0, pitch: 0, flicker: 0, emergency: 0, cupRip: 0, lightsOff: 0 }, o);
  bindActs(ctx);
}

/* ---------- 游泳 ---------- */
const swimState = { lowWarn: 0, offT: 0, half: false, near: false, lastSub: 0 };
function swimHelpText() {
  return isTouch ? "轻点屏幕划水 · 按住左右拖动转向" : "空格 / 点击 划水 · A D 或 鼠标左右 转向";
}

export const SCENES = [
  /* ===== 一 · 出发 ===== */
  {
    key: "depart", chapter: ["一 · 出发", "I · DEPARTURE"], world: "cabin", prebuild: null,
    enter(ctx) {
      cabinBase(ctx);
      const W = ctx.W;
      W.setShade(false); W.showDrawing(false); W.resetLook(); W.setView("window", 10);
      W.S.cartZ = W.S.cartT = -9;
      resetPhone();
      ctx.fx.fade = 1; ctx.fx.fadeT = 1; ctx.fx.lid = 0;
      ctx.bars("full");
      ctx.chapter("一 · 出发", "I · DEPARTURE", 3);
      cabinSound(ctx, 0);
      ctx.snd.set("engine", 0, 0.01); ctx.after(0.4, () => cabinSound(ctx, 0));
    },
    cues: [
      [3.2, (c) => { c.fx.fadeT = 0; c.fx.fadeK = 0.7; c.fx.zoom = 1.06; c.zoom(0.96, 0.12); }],
      [4.6, (c) => c.sub("清晨六点四十一分。云在脚下铺开，像一片没有尽头的雪原。", "6:41 a.m. The clouds spread beneath us like an endless field of snow.", 5.4)],
      [8.5, (c) => { c.ui.acts.hidden = false; }],
      [10.5, (c) => { c.snd.chime(); c.after(1.1, () => c.snd.murmur(3.6)); c.sub(PA("女士们、先生们，早上好。本次航班预计飞行四小时二十分钟。"), "\"Good morning. Our flight time today is four hours and twenty minutes.\"", 5); }],
      [12.5, (c) => { c.W.setView("wide", 0.8); c.zoom(1, 0.3); }],
      [16, (c) => { c.snd.murmur(2.6); c.sub(PA("早餐稍后供应。祝您旅途愉快。"), "\"Breakfast will be served shortly. Enjoy your flight.\"", 4); c.W.S.cartT = -5.6; }],
      [20.5, (c) => {
        c.snd.buzz(); $("#phoneDot").classList.add("on");
        document.querySelector('[data-act="phone"]').classList.add("pulse");
        c.hint("手机震了一下 —— 看看手机");
        c.wait(() => c.flags.phoneDone, 16);
      }],
      [20.6, (c) => { c.hint(null); $("#phoneDot").classList.remove("on"); document.querySelector('[data-act="phone"]').classList.remove("pulse"); if (!c.flags.phoneOpen) c.sub("是妈妈昨晚发来的消息：「到了给我报个平安。」", "A message from Mom last night: \"Let me know when you land.\"", 4.5); }],
      [22, (c) => { if (!c.ui.phone.hidden) c.ui.phone.hidden = true; c.W.setView("girl", 1.2); c.sub("邻座的小女孩一直在画画，手里的蜡笔已经短得快握不住了。", "The girl beside me has been drawing all along, her crayon worn to a stub.", 4.5); }],
      [25.5, (c) => { if (!c.flags.girlShown) c.hint("点一点她，看看她在画什么"); c.wait(() => c.flags.girlShown, 6); }],
      [25.6, (c) => { if (!c.flags.girlShown) girl(c); c.wait(() => c.flags.girlDone, 12); }],
      [26.5, (c) => c.hint(isTouch ? "拖动画面看看四周 · 点舷窗可以拉下遮光板" : "拖动鼠标看看四周 · 点舷窗可以拉下遮光板", 6)],
      [28, (c) => c.sub("妈妈说过，云的下面是海。", "Mom used to say: beneath the clouds, there is the sea.", 4.5)],
      [33, (c) => { c.W.setView("cart", 0.9); c.W.S.cartT = -1.9; c.snd.murmur(1.2, { f: 1700, v: 0.06 }); c.sub("空乘：「请问需要喝点什么？」", "Attendant: \"Anything to drink?\"", 3.2); }],
      [36.5, (c) => c.sub("「一杯温水，谢谢。」", "\"Some warm water, please.\"", 2.8)],
      [39.5, (c) => { c.W.setView("cup", 0.9); c.dof(0.9, 0.5, 0.45); c.sub("水面很平静。", "The water lies perfectly still.", 3.2); }],
      [43, (c) => c.next()],
    ],
    onTap: cabinTap,
  },

  /* ===== 二 · 异变 ===== */
  {
    key: "turbulence", chapter: ["二 · 异变", "II · TURBULENCE"], world: "cabin", prebuild: "sea",
    enter(ctx) {
      cabinBase(ctx);
      const W = ctx.W; W.showDrawing(false); W.setView("cup", 10); W.S.cartT = -1.9;
      ctx.fx.fade = 1; ctx.fx.fadeT = 1;
      ctx.bars("full");
      ctx.chapter("二 · 异变", "II · TURBULENCE", 2.6);
      cabinSound(ctx, 0);
      ctx.ui.acts.hidden = false;
      document.querySelector('[data-act="phone"]').hidden = true;
      document.querySelector('[data-act="girl"]').hidden = true;
    },
    exit() { document.querySelector('[data-act="phone"]').hidden = false; document.querySelector('[data-act="girl"]').hidden = false; },
    cues: [
      [2.8, (c) => { c.fx.fadeT = 0; c.fx.fadeK = 1.2; }],
      [3.4, (c) => { c.snd.chime(); c.after(1.0, () => c.snd.murmur(4.5)); c.sub(PA("各位旅客，前方有一段颠簸。请回到座位，系好安全带。"), "\"We're expecting some turbulence ahead. Please return to your seats and fasten your seatbelts.\"", 5.5);
        c.tween(c.W.S, "storm", 0.4, 10); c.fx.shakeT = 0.18; c.W.S.cartT = -9; c.tween(c.W.S, "cupRip", 0.7, 4); c.snd.set("rumble", 0.25, 2); }],
      [5, (c) => c.dof(0.9, 0.5, 0.45)],
      [7.5, (c) => c.sub("杯子里的水，一圈一圈地晃起了波纹。", "Rings tremble across the water in the cup.", 4)],
      [11.5, (c) => { c.dof(0); c.W.setView("window", 0.9); c.tween(c.W.S, "storm", 0.85, 6); c.tween(c.W.S, "inCloud", 0.65, 5); c.W.S.flicker = 0.4; c.fx.shakeT = 0.35; c.snd.set("rumble", 0.5, 2); c.snd.setEngine(0.5);
        c.sub("窗外的云，变成了铁灰色。", "Outside, the clouds have turned the color of iron.", 4); c.ui.acts.hidden = true; }],
      [15, (c) => { c.W.S.flash = 0.7; c.snd.thunder(0.25); c.snd.creak(); }],
      [17.5, (c) => { c.W.setView("girl", 1.2); c.snd.murmur(1.2, { f: 2500, v: 0.05 }); c.sub("小女孩：「……我们会掉下去吗？」", "Girl: \"…Are we going to fall?\"", 3.5); }],
      [21.5, (c) => c.sub("「不会的。」我听见自己这么说。", "\"No, we won't,\" I hear myself say.", 3.6)],
      [25, (c) => { c.W.S.flash = 1; c.snd.thunder(0.5); c.fx.kick = 0.8; c.snd.gasp(0.12); }],
      [26, (c) => { c.W.setView("window", 1.2); c.tween(c.W.S, "inCloud", 0, 2.5); c.tween(c.W.S, "sea", 1, 3); c.tween(c.W.S, "storm", 1, 3); c.tween(c.W.S, "pitch", 0.12, 4);
        c.sub("云层裂开了。下面是海——", "The clouds tear open. Below is the sea —", 3.4); }],
      [30, (c) => { c.sub("太近了。", "Far too close.", 3); c.fx.shakeT = 0.65; c.snd.set("rumble", 0.85, 1); c.snd.creak(); c.W.S.flicker = 0.8; c.snd.alarmOn(true); }],
      [33, (c) => c.next({ cut: true })],
    ],
    onTap: cabinTap,
  },

  /* ===== 三 · 空难 ===== */
  {
    key: "crash", chapter: ["三 · 空难", "III · THE FALL"], world: "cabin", prebuild: "sea",
    enter(ctx) {
      cabinBase(ctx, { storm: 1, sea: 1, flicker: 0.8, pitch: 0.12 });
      const W = ctx.W; W.showDrawing(false); W.setView("window", 3);
      ctx.fx.fade = 0; ctx.fx.fadeT = 0;
      ctx.bars("full");
      ctx.chapter("三 · 空难", "III · THE FALL", 2.2);
      cabinSound(ctx, 1);
      ctx.fx.shakeT = 0.8;
      ctx.snd.alarmOn(true);
    },
    cues: [
      [0.1, (c) => { c.W.S.flash = 1; c.snd.thunder(1); c.fx.kick = 1.2; c.snd.gasp(0.22); c.tween(c.W.S, "emergency", 1, 0.6); c.tween(c.W.S, "lightsOff", 0.7, 0.4); c.tween(c.W.S, "roll", -0.32, 5); }],
      [0.9, (c) => { c.W.dropMasks(); c.snd.masks(); c.W.setView("up", 2.2); }],
      [2.2, (c) => { c.snd.murmur(2.8, { f: 1400, v: 0.1 }); c.sub(PA("戴好氧气面罩！低头！抱紧！"), "\"Put on your masks! Heads down! Brace!\"", 3.4); c.fx.shakeT = 1; }],
      [4.2, (c) => { c.W.setView("girl", 2); c.snd.creak(); c.sub("我握住了她的手。", "I take her hand.", 3); }],
      [7.4, (c) => { c.W.setView("window", 2); c.tween(c.W.S, "roll", -0.55, 3); c.tween(c.W.S, "pitch", 0.3, 3); c.snd.gasp(0.2); c.fx.shakeT = 1.4; }],
      [8.6, (c) => c.sub("……妈妈。", "…Mom.", 2.2)],
      [10.6, (c) => { c.fx.flash = 1.6; c.snd.impact(1); c.fx.kick = 2.5; c.snd.alarmOn(false); }],
      [10.9, (c) => { c.fx.fade = 1; c.fx.fadeT = 1; c.ui.sub.classList.remove("on"); c.snd.silence(0.25); c.snd.muffle(1, 0.2); c.fx.shakeT = 0; }],
      [11.6, (c) => { c.snd.set("tinnitus", 0.05, 0.4); c.snd.muffle(0, 0.5); c.snd.heartbeat(54, 0.55); }],
      [14, (c) => c.sub("……", "…", 3)],
      [18.5, (c) => { c.snd.set("tinnitus", 0.015, 3); c.next({ delay: 0.1 }); }],
    ],
  },

  /* ===== 四 · 海上 ===== */
  {
    key: "adrift", chapter: ["四 · 海上", "IV · ADRIFT"], world: "sea", prebuild: "dawn",
    enter(ctx) {
      const W = ctx.W;
      W.S.mode = "wake"; W.S.autoBolt = false; W.S.tagT = 0; W.S.tagView = 0; W.S.eye = W.S.eyeT = 0.42;
      W.setLook(2.0, 0.45, 10);
      ctx.fx.fade = 1; ctx.fx.fadeT = 1; ctx.fx.lid = 1; ctx.fx.lidT = 1; ctx.fx.blurT = 4; ctx.fx.blur = 4;
      ctx.bars("full");
      ctx.chapter("四 · 海上", "IV · ADRIFT", 3);
      const s = ctx.snd;
      s.silence(0.5); s.heartbeat(54, 0.5); s.set("tinnitus", 0.02); s.muffle(0.85, 0.5);
      s.set("waves", 0.35, 2); s.set("rain", 0.18, 2);
      ctx.fx.lensT = 0.8;
    },
    cues: [
      [3.6, (c) => { c.fx.fadeT = 0; c.fx.fadeK = 1.5; c.fx.lidT = 0.62; c.fx.lidK = 1.2; c.snd.breath(0.25); c.snd.muffle(0.5, 1); }],
      [5.6, (c) => { c.fx.lidT = 1; c.fx.lidK = 3; }],
      [6.8, (c) => { c.fx.lidT = 0.3; c.fx.lidK = 1.2; c.fx.blurT = 1.6; }],
      [8.4, (c) => { c.fx.lidT = 0; c.fx.blurT = 0; c.snd.muffle(0, 1.2); c.snd.set("tinnitus", 0, 2); c.snd.set("rain", 0.5, 1.5); c.snd.set("waves", 0.65, 1.5); c.snd.set("wind", 0.32, 2); c.snd.heartbeat(84, 0.32); c.snd.breath(0.3); c.sub("冷。", "Cold.", 2.4); c.W.setLook(1.6, 0.04, 0.5); }],
      [12.5, (c) => c.W.dip(1)],
      [11, (c) => c.sub("我还活着。四周是黑色的海，和一场不肯停的雨。", "I'm alive. Around me: black sea, and rain that will not stop.", 4.6)],
      [14.5, (c) => c.W.setLook(2.75, 0.0, 0.8)],
      [16, (c) => { c.W.strike(-2.6, 0.5); c.snd.thunder(0.45); c.fx.flash = 0.2; }],
      [16.8, (c) => c.sub("浪里漂着飞机的残骸：座椅、救生衣，还有半截还在烧的机翼。", "Wreckage drifts in the waves: seats, life vests, half a burning wing.", 4.8)],
      [21.5, (c) => { c.W.setLook(2.2, -0.3, 0.9); c.snd.heartbeat(0); }],
      [22.5, (c) => {
        c.sub("一只旧皮箱，正朝我漂过来。", "An old leather suitcase drifts toward me.", 3.5);
        c.hint(isTouch ? "点击那只旧箱子，抓住它" : "点击那只旧箱子，抓住它（或按空格）");
        c.flags.canGrab = true;
        c.wait(() => c.flags.grabbed, 16);
      }],
      [22.6, (c) => { if (!c.flags.grabbed) grab(c); }],
      [26.5, (c) => { c.W.tagView(true); c.zoom(0.82, 0.3); c.dof(1.1, 0.5, 0.5); c.fx.lensT = 0.25; c.after(1.6, () => { c.W.strike(-2.2, 0.3); c.snd.thunder(0.35); }); c.sub("箱子上挂着一张行李牌，字迹被海水洇开了一半——", "A luggage tag hangs from it, its ink half-bled by the sea —", 4.6); }],
      [31.4, (c) => c.sub("「<i>林知秋</i>」。不是我的名字。", "\"Lin Zhiqiu.\" Not my name.", 4.2)],
      [35.5, (c) => { c.W.tagView(false); c.W.setEye(1.1); c.W.setLook(0, 0.02, 0.55); c.zoom(1, 0.5); c.dof(0); c.fx.lensT = 0.8; }],
      [39, (c) => { c.W.strikeIsland(0.7); c.snd.thunder(0.7); c.fx.kick = 0.4; c.fx.flash = 0.3; c.sub("闪电亮起的一瞬，我看见了远处的陆地。", "In a flash of lightning, I see land in the distance.", 4.6); }],
      [42, (c) => { c.W.strikeIsland(0.5); c.snd.thunder(0.5); }],
      [44.5, (c) => c.next()],
    ],
    onTap(ctx, ndc) { if (ctx.flags.canGrab && !ctx.flags.grabbed) grab(ctx); },
    onKey(ctx, k) { if (k === " " && ctx.flags.canGrab && !ctx.flags.grabbed) grab(ctx); },
  },

  /* ===== 五 · 求生 ===== */
  {
    key: "swim", chapter: ["五 · 求生", "V · THE SWIM"], world: "sea", prebuild: "dawn",
    enter(ctx) {
      const W = ctx.W;
      W.grab(); W.S.tagT = 0;
      ctx.fx.fade = 1; ctx.fx.fadeT = 0.75; ctx.fx.lid = 0; ctx.fx.lidT = 0; ctx.fx.blurT = 0; ctx.fx.blur = 0;
      ctx.bars("thin");
      ctx.chapter("五 · 求生", "V · THE SWIM", 2.4);
      const s = ctx.snd;
      s.muffle(0); s.set("rain", 0.5); s.set("waves", 0.7); s.set("wind", 0.35); s.set("tinnitus", 0); s.heartbeat(0);
      ctx.fx.lensT = 0.7;
      Object.assign(swimState, { lowWarn: 0, offT: 0, half: false, near: false, lastSub: 0 });
    },
    cues: [
      [2.4, (c) => {
        c.fx.fadeT = 0; c.W.startSwim(); c.W.S.autoBolt = true; c.ui.swim.hidden = false;
        c.ui.swimHelp.textContent = swimHelpText(); c.ui.swimHelp.style.opacity = 0.8;
        c.sub("推着箱子，朝那片陆地游过去。", "Push the suitcase. Swim toward the land.", 4.4);
      }],
      [7.5, (c) => c.sub("等浪把我托起来的那一刻再划，能省不少力气。", "Stroke as the swell lifts me — it saves strength.", 5)],
      [20, (c) => { c.ui.swimHelp.style.opacity = 0; }],
    ],
    update(ctx, dt) {
      const W = ctx.W;
      if (W.S.mode === "wake") return;
      const P = W.P, ui = ctx.ui, inp = ctx.input;
      // 转向：键盘 > 触摸拖动 > 鼠标位置
      let steer = inp.steerKeys;
      if (!steer && inp.touchSteer) steer = inp.touchSteer;
      if (!steer && Math.abs(inp.mouseSteer) > 0.22) steer = (inp.mouseSteer - Math.sign(inp.mouseSteer) * 0.22) / 0.78;
      W.setSteer(-steer);
      // 事件
      for (const e of W.S.events.splice(0)) {
        if (e.type === "plank") { ctx.sub("一块木板！抓住它，歇一口气。", "A plank! Hold on and catch your breath.", 3.6); ctx.snd.splash(0.3); ctx.hint("划水就会松开木板", 3); }
        if (e.type === "under") { ctx.sub("没力气了——", "No strength left —", 2.6); ui.under.classList.add("on"); ctx.fx.blurT = 2; }
        if (e.type === "surface") { ui.under.classList.remove("on"); ctx.fx.blurT = 0; ctx.sub("……一道浪把我托出水面，推着我往前。", "…A wave lifts me back up, and carries me forward.", 4); }
        if (e.type === "big") { ctx.hint("大浪来了 —— 等它托起你时划水！", 2.6); ctx.snd.splash(0.9); ctx.fx.kick = 0.5; }
        if (e.type === "ride") { ctx.hint("乘浪而上！", 1.6); }
        if (e.type === "bolt") { ctx.snd.thunder(e.near); if (e.near > 0.55) ctx.fx.flash = Math.max(ctx.fx.flash, 0.22); }
        if (e.type === "shore") { ctx.next(); }
      }
      // 进度台词
      const total = Math.hypot(ISLAND.x, ISLAND.z) - 33;
      const prog = 1 - W.islandDist() / total;
      if (!swimState.half && prog > 0.5) { swimState.half = true; ctx.sub("胳膊像灌了铅。可那片黑影，确实在变大。", "My arms are lead. But the dark shape is growing.", 4.5); }
      if (!swimState.near && prog > 0.86) { swimState.near = true; ctx.sub("我听见了——浪打在岸上的声音。", "I can hear it — waves breaking on a shore.", 4); }
      // 偏航提示
      const want = Math.atan2(-(ISLAND.x - P.x), -(ISLAND.z - P.z));
      let err = want - P.heading; while (err > Math.PI) err -= Math.PI * 2; while (err < -Math.PI) err += Math.PI * 2;
      swimState.offT = Math.abs(err) > 0.55 ? swimState.offT + dt : 0;
      if (swimState.offT > 3 && ctx.time - swimState.lastSub > 9) { swimState.lastSub = ctx.time; ctx.hint("方向偏了……等下一道闪电，看清陆地在哪儿", 4); }
      // 体力
      const st = P.stamina;
      ui.stamB.style.transform = `scaleX(${clamp(st / 100, 0.001, 1)})`;
      ui.stamB.parentElement.parentElement.classList.toggle("low", st < 22);
      ctx.fx.vigT = 0.9 + (st < 30 ? (30 - st) / 30 * 1.6 : 0);
      ctx.fx.satT = st < 25 ? 0.6 : 1;
      if (st < 22) { swimState.lowWarn -= dt; if (swimState.lowWarn <= 0) { ctx.snd.breath(0.22); swimState.lowWarn = 1.4; } }
      // 节奏圈
      const s = 0.3 + 0.7 * ((P.phase + 0.785) % 1);
      ui.ringIn.style.transform = `scale(${s.toFixed(3)})`;
      ui.ring.classList.toggle("good", P.good);
      $("#ringT").textContent = P.hold ? "歇" : "划";
      // 闪电后指示方向
      const recent = W.time - W.S.lastBoltT < 2.6;
      const v = new THREE.Vector3(ISLAND.x, 18, ISLAND.z).project(W.camera);
      const behind = v.z > 1;
      let x = behind ? -v.x : v.x, y = behind ? -1 : v.y;
      const onScreen = !behind && Math.abs(x) < 0.85 && y < 0.8 && y > -0.8;
      let px, py, rot;
      if (onScreen) { px = x; py = y + 0.18; rot = 180; }
      else { const a = Math.atan2(y, x); px = Math.cos(a) * 0.8; py = Math.sin(a) * 0.6; rot = 90 - (a * 180) / Math.PI; }
      ui.dir.style.transform = `translate(${(px * innerWidth) / 2}px, ${(-py * innerHeight) / 2}px) rotate(${rot}deg)`;
      ui.dir.classList.toggle("on", recent);
    },
    onDown(ctx, ndc, e) { stroke(ctx); },
    onDrag(ctx, dx, dy, tx, ptr) { if (ptr.type !== "mouse") ctx.input.touchSteer = clamp(tx / 90, -1, 1); },
    onUp(ctx) { ctx.input.touchSteer = 0; },
    onKey(ctx, k) { if (k === " " || k === "w" || k === "arrowup" || k === "enter") stroke(ctx); },
    exit(ctx) { ctx.ui.swim.hidden = true; ctx.ui.under.classList.remove("on"); ctx.fx.vigT = 0.9; ctx.fx.satT = 1; },
  },

  /* ===== 六 · 上岸 ===== */
  {
    key: "landfall", chapter: ["六 · 上岸", "VI · LANDFALL"], world: "dawn",
    enter(ctx) {
      const W = ctx.W;
      W.setMode("crawl"); W.setLight(0, true);
      ctx.fx.fade = 1; ctx.fx.fadeT = 1; ctx.fx.lid = 0; ctx.fx.lidT = 0; ctx.fx.blurT = 0;
      ctx.bars("full");
      ctx.chapter("六 · 上岸", "VI · LANDFALL", 2.6);
      const s = ctx.snd;
      s.silence(0.3); s.muffle(0); s.set("rain", 0.45, 1); s.set("waves", 0.75, 1); s.set("wind", 0.3, 1);
      ctx.fx.lensT = 0.6;
    },
    cues: [
      [2.6, (c) => { c.fx.fadeT = 0; c.fx.fadeK = 1.4; }],
      [3.5, (c) => { c.sub("脚尖碰到了沙子。", "My toes touch sand.", 3); c.snd.breath(0.3); }],
      [7, (c) => c.sub("我爬上了岸。后来的事，就不记得了。", "I crawl ashore. After that, I remember nothing.", 3.8)],
      [9.6, (c) => { c.fx.lidT = 1; c.fx.lidK = 0.9; c.fx.blurT = 2; c.snd.muffle(0.8, 1.5); c.snd.set("rain", 0, 2.5); c.snd.set("wind", 0, 2.5); c.snd.set("waves", 0.2, 2.5); }],
      [13, (c) => { c.fx.lensT = 0; c.fx.lens = 0; c.fx.splitT = 0.9; c.fx.fade = 1; c.fx.fadeT = 1; c.W.setLight(1, true); c.W.setMode("wake"); c.fx.blur = 0; c.fx.blurT = 0; c.snd.muffle(0, 1); c.snd.set("waves", 0.22, 2); c.snd.set("breeze", 0.35, 3); }],
      [14.5, (c) => { c.fx.fadeT = 0; c.fx.fadeK = 0.8; c.fx.lidT = 0.5; c.fx.lidK = 1; }],
      [15.6, (c) => { c.fx.lidT = 0.85; c.fx.lidK = 3; }],
      [16.4, (c) => { c.fx.lidT = 0; c.fx.lidK = 0.9; c.snd.gull(); }],
      [17.2, (c) => c.sub("风暴过去了。", "The storm has passed.", 3)],
      [21, (c) => { c.sub("海面平静得像什么都没发生过。", "The sea is calm, as if nothing had ever happened.", 4.2); c.snd.gull(1.5); }],
      [26, (c) => { c.W.setMode("walk"); c.sub("身后有一道长满青苔的石阶，一直通到山顶。", "Behind me, a mossy stone stair climbs toward the hilltop.", 4.4); }],
      [31.5, (c) => c.sub("……石阶？", "…A stair?", 2.6)],
      [36, (c) => c.sub("山顶有一座亭子。匾额上写着：<i>观潮亭</i>。", "At the top stands a pavilion. The plaque reads: Tide-Watching Pavilion.", 4.6)],
      [44.5, (c) => { c.W.setMode("vista"); c.snd.motif(0.4); c.bars("thin"); c.fx.zoom = 1.08; c.zoom(1, 0.12); }],
      [46.5, (c) => c.sub("这不是一座岛。", "This is not an island.", 3.6)],
      [51, (c) => c.sub("是一座城市的最高处。", "It is the highest point of a city.", 4)],
      [56, (c) => { c.sub("屋顶、钟楼、路牌……一直淹到天边。", "Rooftops, a clock tower, street signs… drowned all the way to the horizon.", 4.8); c.snd.gull(2); }],
      [60.5, (c) => { c.W.focusSign(true); c.zoom(0.78, 0.35); }],
      [61.5, (c) => c.sub("路牌上写着：<i>灯塔街</i>。", "The sign reads: Dengta Street — Lighthouse Street.", 4)],
      [66, (c) => c.sub("——和箱子上写的地址，是同一条街。", "The same street as the address on the suitcase.", 4.6)],
      [70.5, (c) => { c.W.focusSign(false); c.zoom(1, 0.35); }],
      [71.5, (c) => { c.ui.title.classList.add("on"); c.snd.piano(57, 0, 0.12, 5); c.snd.piano(64, 0.05, 0.08, 5); }],
      [80, (c) => c.next({ cut: true })],
    ],
  },

  /* ===== 结尾 ===== */
  {
    key: "end", chapter: ["序章 · 完", "END"], world: "dawn",
    enter(ctx) {
      const W = ctx.W;
      W.setLight(1, true); W.setMode("orbit"); ctx.fx.splitT = 0.9;
      ctx.fx.fadeT = 0; ctx.fx.fadeK = 0.8; ctx.fx.lidT = 0; ctx.fx.blurT = 0;
      ctx.bars("thin");
      ctx.ui.title.classList.add("on");
      ctx.after(0.6, () => ctx.ui.title.classList.add("up"));
      ctx.ui.end.hidden = false;
      ctx.after(1.6, () => ctx.ui.end.classList.add("on"));
      const s = ctx.snd;
      s.silence(1.5); s.muffle(0); s.set("waves", 0.2, 2); s.set("breeze", 0.3, 2);
      if (!ctx.flags.motif) { ctx.flags.motif = true; ctx.after(1.2, () => s.motif(0)); }
    },
    cues: [],
  },
];

function grab(ctx) {
  if (ctx.flags.grabbed) return;
  ctx.flags.grabbed = true;
  ctx.hint(null);
  ctx.W.grab();
  ctx.snd.splash(0.5);
  ctx.sub("我抓住了它。箱子浮得很稳。", "I grab hold. The suitcase floats steadily.", 3.6);
}
function stroke(ctx) {
  const r = ctx.W.stroke && ctx.W.stroke();
  if (!r) return;
  ctx.snd.splash(r.good ? 0.7 : 0.4);
  if (r.good) { ctx.ui.ring.classList.remove("hit"); void ctx.ui.ring.offsetWidth; ctx.ui.ring.classList.add("hit"); }
  ctx.fx.kick = Math.max(ctx.fx.kick, r.good ? 0.25 : 0.12);
}
