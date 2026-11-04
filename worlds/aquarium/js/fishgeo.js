// 逼真的程序化鱼：放样体型（侧视+俯视轮廓）、画布绘制的体色贴图（鳞片、背深腹浅的反荫蔽、物种斑纹）、
// 鳞片法线贴图、带鳍条的半透明鳍、带瞳孔与高光的眼睛；樱花虾单独构建
import * as THREE from "three";
import { Geo, col, mix, clamp, smooth, noise3, rng, patch } from "./gfx.js";

/* ---------------- 共享贴图：鳞片法线、鳍条 ---------------- */
let bodyM_n = 0, SCALE_N = null, FIN_T = null, SCALE_H = null;
const scaleRep = (sp) => { const perim = Math.PI * 0.5 * (Math.max(...sp.prof.map((p) => p[1] + p[2])) + Math.max(...sp.prof.map((p) => p[3])) * 2); return [sp.scales / 8, (sp.scales * perim / sp.bf) / 8]; };
function scaleNormal() {
  if (SCALE_N) return SCALE_N;
  const S = 256, C = 8, h = new Float32Array(S * S);
  const r = 0.72;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const gx = (x / S) * C, gy = (y / S) * C;
    let best = 1e9, hv = 0;
    for (let j = Math.floor(gy) - 1; j <= Math.floor(gy) + 1; j++) for (let i = Math.floor(gx) - 1; i <= Math.floor(gx) + 1; i++) {
      const cx = i + ((j & 1) ? 0.5 : 0) + 0.5, cy = j + 0.5;
      let dx = gx - cx, dy = gy - cy;
      const d = Math.hypot(dx * 1.05, dy);
      if (d < r && cx < best && dx > -0.15) { best = cx; hv = 0.35 + 0.65 * Math.pow(1 - d / r, 0.7) * (0.6 + 0.4 * clamp(dx / r + 0.5, 0, 1)); }
    }
    h[y * S + x] = hv;
  }
  SCALE_H = h;
  const cv = document.createElement("canvas"); cv.width = cv.height = S;
  const ctx = cv.getContext("2d"), img = ctx.createImageData(S, S);
  const H = (x, y) => h[((y + S) % S) * S + ((x + S) % S)];
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const nx = (H(x - 1, y) - H(x + 1, y)) * 2.2, ny = (H(x, y - 1) - H(x, y + 1)) * 2.2;
    const l = Math.hypot(nx, ny, 1), k = (y * S + x) * 4;
    img.data[k] = (nx / l * 0.5 + 0.5) * 255; img.data[k + 1] = (ny / l * 0.5 + 0.5) * 255; img.data[k + 2] = (1 / l * 0.5 + 0.5) * 255; img.data[k + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  SCALE_N = new THREE.CanvasTexture(cv); SCALE_N.wrapS = SCALE_N.wrapT = THREE.RepeatWrapping; SCALE_N.colorSpace = THREE.NoColorSpace;
  return SCALE_N;
}
function finTex() {
  if (FIN_T) return FIN_T;
  const W = 64, H = 256, cv = document.createElement("canvas"); cv.width = W; cv.height = H;
  const ctx = cv.getContext("2d"), img = ctx.createImageData(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const u = x / W, r = 1 - y / H;
    const ray = Math.pow(Math.max(0, Math.cos((u - 0.5) * Math.PI * 2)), 10);
    const seg = 1 - 0.35 * Math.pow(Math.max(0, Math.cos(r * 38 + Math.sin(u * 6.28) * 0.5)), 30) * ray;
    const branch = Math.pow(Math.max(0, Math.cos((u - 0.25) * Math.PI * 4)), 14) * smooth(0.45, 0.7, r) * 0.6;
    const R = Math.max(ray, branch) * seg;
    const k = (y * W + x) * 4;
    const v = 232 + 23 * R;
    img.data[k] = v; img.data[k + 1] = v; img.data[k + 2] = v; img.data[k + 3] = (0.86 + 0.14 * R) * 255;
  }
  ctx.putImageData(img, 0, 0);
  FIN_T = new THREE.CanvasTexture(cv); FIN_T.wrapS = THREE.RepeatWrapping; FIN_T.colorSpace = THREE.SRGBColorSpace;
  return FIN_T;
}

/* ---------------- 体型与配色 ---------------- */
const C = (h) => { h = h.slice(1); if (h.length === 3) h = h.split("").map((x) => x + x).join(""); return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255); }; // sRGB 0..1（画布用）
const toLin = (c) => c.map((x) => Math.pow(x, 2.2));
const L3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const band = (x, c, w, soft = 0.4) => 1 - smooth(w * (1 - soft), w, Math.abs(x - c));

const clearFin = (tint = "#e8eef0", a = 0.28, edge = 0.1) => (u, r) => ({ c: L3(C(tint), [0.6, 0.66, 0.66], 0.35), a: (a + edge * r) * 0.42 });
const GUPPY_PAL = [["#ff4a14", "#ff8a2a", "#140c0c", "#1b3570"], ["#2a6bff", "#8fe4ff", "#0b1c50", "#24406a"], ["#ff2e6e", "#ffb0d0", "#5a0a2a", "#5a2a50"], ["#3fd27a", "#f2ff6a", "#0d3a20", "#2a5a40"]];
const BETTA_PAL = [["#4a5ad8", "#b0101e", "#8a9cff"], ["#a80c24", "#e01f3c", "#3a4aff"], ["#e8e2f6", "#9a5cff", "#ffffff"], ["#0f8f8c", "#2ad8c8", "#1a3a8a"]];

export const SPEC = {
  neon: {
    bf: 0.8, prof: [[0, 0.012, 0.012, 0.01], [0.05, 0.055, 0.045, 0.04], [0.15, 0.095, 0.075, 0.056], [0.33, 0.112, 0.086, 0.06], [0.55, 0.096, 0.074, 0.05], [0.78, 0.06, 0.045, 0.03], [1, 0.038, 0.03, 0.015]],
    eye: { t: 0.1, r: 0.046, y: 0.016, iris: "#a8c4d4" }, scales: 30, irid: 1, rough: 0.32, scaleShade: 0.35,
    paint(t, s, c, n) {
      const stripeC = 0.32 - 0.06 * t, inStripe = band(s, stripeC, 0.25, 0.4) * smooth(0.08, 0.16, t) * (1 - smooth(0.72, 0.8, t));
      let base = L3(C("#aeb8b8"), C("#4c4a36"), smooth(0.3, 0.65, s));
      base = L3(base, C("#24221a"), smooth(0.65, 1, s) * 0.8);
      base = L3(base, C("#e2e8ea"), band(s, -0.25, 0.25) * band(t, 0.32, 0.14) * 0.5);
      const red = smooth(0.4, 0.5, t) * (1 - smooth(stripeC - 0.2, stripeC - 0.05, s)) * smooth(-0.95, -0.55, s);
      base = L3(base, L3(C("#ff2a33"), C("#d8102a"), t), red);
      const blue = L3(C("#20d8ff"), C("#1a6cff"), smooth(0.15, 0.75, t) + n * 0.3);
      base = L3(base, blue, inStripe);
      return { c: base, g: inStripe * 1.3 + red * 0.15 };
    },
    fins: [
      { at: "top", t0: 0.4, t1: 0.5, f: (u) => [-0.06 - 0.03 * u, 0.1 * (1 - u * 0.7)], col: clearFin("#f2f4ef", 0.22, 0.25), fl: 0.6, rays: 8 },
      { at: "top", t0: 0.76, t1: 0.8, f: (u) => [-0.03, 0.025 * (1 - u)], col: clearFin("#c8c6a8", 0.4), fl: 0.2, rays: 1 },
      { at: "bot", t0: 0.56, t1: 0.76, f: (u) => [-0.04, -0.07 * (1 - u * 0.6)], col: (u, r) => ({ c: C("#f4f2ee"), a: 0.22 + (u < 0.15 ? 0.4 * r : 0.05) }), fl: 0.5, rays: 12 },
      { at: "tail", len: 0.2, f: (u) => { const k = u * 2 - 1; return [-0.2 * (0.55 + 0.45 * Math.abs(k) ** 1.2), k * 0.13]; }, col: (u, r) => ({ c: L3(C("#ffe8e0"), C("#ff6a5a"), 0.35 * (1 - r)), a: 0.26 }), fl: 0.7, rays: 18 },
      { at: "side", t: 0.2, f: () => [-0.07, -0.02, 0.05], col: clearFin(), fl: 1, rays: 8, y: -0.4 },
      { at: "side", t: 0.42, f: () => [-0.05, -0.04, 0.02], col: clearFin(), fl: 0.6, rays: 6, y: -0.9 },
    ],
  },
  rummy: {
    bf: 0.79, prof: [[0, 0.014, 0.012, 0.01], [0.05, 0.055, 0.05, 0.04], [0.18, 0.1, 0.085, 0.055], [0.38, 0.11, 0.085, 0.056], [0.6, 0.09, 0.07, 0.045], [0.8, 0.055, 0.04, 0.026], [1, 0.035, 0.03, 0.014]],
    eye: { t: 0.1, r: 0.04, y: 0.016, iris: "#ff5a4a" }, scales: 30, irid: 0.55, rough: 0.3,
    paint(t, s, c, n) {
      let base = L3(C("#c8d0cc"), C("#8e9878"), smooth(0.2, 0.9, s));
      base = L3(base, C("#e6ecea"), band(s, -0.2, 0.3) * band(t, 0.38, 0.16) * 0.6);
      const red = (1 - smooth(0.14, 0.3, t + (s > 0 ? -0.05 : 0.06) * s)) ;
      base = L3(base, L3(C("#ff2b2e"), C("#c8121e"), n * 0.5 + 0.3), red * 0.95);
      base = L3(base, C("#1c1c1c"), smooth(0.9, 1, t) * band(s, 0, 0.35) * 0.8);
      return { c: base, g: red * 0.12 };
    },
    fins: [
      { at: "top", t0: 0.42, t1: 0.52, f: (u) => [-0.06, 0.1 * (1 - u * 0.7)], col: clearFin("#f0f2ee", 0.22, 0.2), fl: 0.6, rays: 8 },
      { at: "bot", t0: 0.56, t1: 0.77, f: (u) => [-0.04, -0.065 * (1 - u * 0.6)], col: clearFin("#f0f2ee", 0.2), fl: 0.5, rays: 12 },
      {
        at: "tail", len: 0.22, f: (u) => { const k = u * 2 - 1; return [-0.22 * (0.5 + 0.5 * Math.abs(k) ** 1.1), k * 0.14]; },
        col: (u, r) => { const k = Math.abs(u * 2 - 1); const blk = (k < 0.18 && r > 0.05) || (k > 0.45 && k < 0.72 && r > 0.25); return { c: blk ? C("#0c0c0e") : C("#fbfbf8"), a: blk ? 0.92 : 0.55 + 0.3 * r }; }, fl: 0.7, rays: 18,
      },
      { at: "side", t: 0.2, f: () => [-0.07, -0.02, 0.05], col: clearFin(), fl: 1, rays: 8, y: -0.4 },
      { at: "side", t: 0.44, f: () => [-0.05, -0.04, 0.02], col: clearFin(), fl: 0.6, rays: 6, y: -0.9 },
    ],
  },
  lampeye: {
    bf: 0.78, prof: [[0, 0.016, 0.012, 0.012], [0.07, 0.048, 0.05, 0.042], [0.25, 0.072, 0.085, 0.05], [0.52, 0.07, 0.074, 0.045], [0.78, 0.05, 0.04, 0.025], [1, 0.036, 0.03, 0.015]],
    eye: { t: 0.11, r: 0.054, y: 0.022, iris: "#bfe8ff", glow: "#38c8ff" }, scales: 24, irid: 0.9, rough: 0.28,
    paint(t, s, c, n) {
      let base = L3(C("#c6cabb"), C("#8c9076"), smooth(0.2, 0.95, s));
      base = L3(base, C("#e0e6e4"), band(s, -0.3, 0.25) * band(t, 0.35, 0.15) * 0.5);
      base = L3(base, C("#9fd8f0"), band(s, 0.05, 0.25) * smooth(0.2, 0.5, t) * 0.4);
      return { c: base, g: band(s, 0.05, 0.2) * 0.12 };
    },
    fins: [
      { at: "top", t0: 0.62, t1: 0.74, f: (u) => [-0.05, 0.07 * (1 - u * 0.5)], col: clearFin("#dfe8f0", 0.24, 0.3), fl: 0.6, rays: 7 },
      { at: "bot", t0: 0.52, t1: 0.78, f: (u) => [-0.05, -0.075 * (1 - u * 0.5)], col: clearFin("#dfe8f0", 0.24, 0.3), fl: 0.6, rays: 12 },
      { at: "tail", len: 0.2, f: (u) => { const k = u * 2 - 1; return [-0.2 * (1 - 0.25 * k * k), k * 0.11]; }, col: clearFin("#e6eef4", 0.26, 0.3), fl: 0.7, rays: 14 },
      { at: "side", t: 0.2, f: () => [-0.07, -0.01, 0.05], col: clearFin(), fl: 1, rays: 8, y: -0.2 },
    ],
  },
  zebra: {
    bf: 0.8, prof: [[0, 0.012, 0.01, 0.01], [0.06, 0.05, 0.045, 0.04], [0.2, 0.086, 0.08, 0.054], [0.45, 0.09, 0.08, 0.05], [0.75, 0.058, 0.048, 0.03], [1, 0.034, 0.03, 0.014]],
    eye: { t: 0.09, r: 0.036, y: 0.012, iris: "#d8c890" }, scales: 34, irid: 0.6, rough: 0.3,
    paint(t, s, c, n) {
      const st = Math.sin((s + 0.06 * Math.sin(t * 9)) * Math.PI * 3.6 + 0.5);
      const stripe = smooth(0.1, 0.4, st) * smooth(0.06, 0.18, t) * smooth(-0.85, -0.6, s) * (1 - smooth(0.62, 0.8, s));
      let base = L3(C("#d9c27e"), C("#8a7c4a"), smooth(0.45, 0.95, s));
      base = L3(base, C("#e6dcc0"), smooth(-0.6, -0.95, s));
      base = L3(base, L3(C("#18246a"), C("#2a3e9a"), n * 0.5 + 0.5), stripe);
      return { c: base, g: stripe * 0.06 };
    },
    fins: [
      { at: "top", t0: 0.43, t1: 0.55, f: (u) => [-0.05, 0.07 * (1 - u * 0.5)], col: clearFin("#e8e0c0", 0.3), fl: 0.6, rays: 8 },
      { at: "bot", t0: 0.52, t1: 0.74, f: (u) => [-0.05, -0.08 * (1 - u * 0.5)], col: (u, r) => ({ c: Math.sin(r * 14) > 0.1 ? C("#2a3a9a") : C("#f2e8c0"), a: 0.55 }), fl: 0.5, rays: 12 },
      { at: "tail", len: 0.22, f: (u) => { const k = u * 2 - 1; return [-0.22 * (0.6 + 0.4 * Math.abs(k)), k * 0.12]; }, col: (u, r) => { const k = u * 2 - 1; return { c: Math.abs(Math.sin(k * 6.5)) < 0.45 ? C("#24369a") : C("#f2e8c8"), a: 0.48 }; }, fl: 0.7, rays: 18 },
      { at: "side", t: 0.2, f: () => [-0.07, -0.02, 0.05], col: clearFin(), fl: 1, rays: 8, y: -0.5 },
    ],
  },
  harlequin: {
    bf: 0.78, prof: [[0, 0.014, 0.012, 0.012], [0.07, 0.075, 0.065, 0.038], [0.28, 0.15, 0.125, 0.052], [0.52, 0.14, 0.11, 0.048], [0.78, 0.07, 0.05, 0.028], [1, 0.04, 0.034, 0.015]],
    eye: { t: 0.1, r: 0.042, y: 0.02, iris: "#e8a080" }, scales: 22, irid: 0.45, rough: 0.33,
    paint(t, s, c, n) {
      let base = L3(C("#f2b090"), C("#d9724a"), smooth(-0.2, 0.7, s));
      base = L3(base, C("#8a5032"), smooth(0.75, 1, s) * 0.7);
      base = L3(base, C("#f3e4dc"), smooth(-0.6, -0.95, s) * 0.8);
      const w = (t - 0.42) * 1.5;
      const wedge = smooth(0.4, 0.45, t) * (1 - smooth(w - 0.05, w + 0.04, Math.abs(s - 0.08))) * (1 - smooth(0.88, 0.95, t)) * smooth(-0.8, -0.6, s);
      base = L3(base, C("#120c12"), wedge);
      return { c: base, g: 0.03 };
    },
    fins: [
      { at: "top", t0: 0.4, t1: 0.52, f: (u) => [-0.06, 0.11 * (1 - u * 0.6)], col: clearFin("#ff9a70", 0.35), fl: 0.6, rays: 8 },
      { at: "bot", t0: 0.55, t1: 0.75, f: (u) => [-0.05, -0.07 * (1 - u * 0.5)], col: clearFin("#ff9a70", 0.3), fl: 0.5, rays: 10 },
      { at: "tail", len: 0.22, f: (u) => { const k = u * 2 - 1; return [-0.22 * (0.5 + 0.5 * Math.abs(k) ** 1.2), k * 0.15]; }, col: (u, r) => { const k = Math.abs(u * 2 - 1); return { c: L3(C("#f8e0d0"), C("#ff5a2a"), smooth(0.4, 0.9, k) * r), a: 0.32 + 0.3 * smooth(0.5, 1, k) }; }, fl: 0.7, rays: 18 },
      { at: "side", t: 0.2, f: () => [-0.07, -0.02, 0.05], col: clearFin(), fl: 1, rays: 8, y: -0.5 },
    ],
  },
  guppy: {
    variantKey: (f) => (f.sex === "f" ? "f" : "m" + ((f.v | 0) % 4)),
    build(key) {
      if (key === "f") return {
        bf: 0.72, prof: [[0, 0.014, 0.014, 0.012], [0.07, 0.06, 0.06, 0.045], [0.3, 0.11, 0.135, 0.07], [0.55, 0.095, 0.1, 0.055], [0.8, 0.06, 0.045, 0.03], [1, 0.042, 0.034, 0.016]],
        eye: { t: 0.09, r: 0.044, y: 0.018, iris: "#c8c0a0" }, scales: 22, irid: 0.3, rough: 0.36,
        paint(t, s, c, n) {
          let base = L3(C("#d8d4c0"), C("#8c8a70"), smooth(0.1, 0.9, s));
          base = L3(base, C("#f0eadc"), smooth(-0.5, -0.9, s));
          base = L3(base, C("#3a3428"), band(t, 0.42, 0.06) * band(s, -0.45, 0.25) * 0.8);
          return { c: base, g: 0 };
        },
        fins: [
          { at: "top", t0: 0.5, t1: 0.62, f: (u) => [-0.06, 0.07 * (1 - u * 0.5)], col: clearFin("#d8d0b8", 0.3), fl: 0.6, rays: 8 },
          { at: "bot", t0: 0.6, t1: 0.7, f: (u) => [-0.04, -0.05], col: clearFin(), fl: 0.5, rays: 6 },
          { at: "tail", len: 0.26, f: (u) => { const k = u * 2 - 1; return [-0.26 * (1 - 0.2 * k * k), k * 0.14]; }, col: (u, r) => ({ c: L3(C("#d8d4c8"), C(GUPPY_PAL[0][0]), 0.25 * r), a: 0.34 }), fl: 0.8, rays: 16 },
          { at: "side", t: 0.2, f: () => [-0.07, -0.02, 0.05], col: clearFin(), fl: 1, rays: 8, y: -0.4 },
        ],
      };
      const P = GUPPY_PAL[+key[1]];
      return {
        bf: 0.56, prof: [[0, 0.012, 0.012, 0.01], [0.07, 0.055, 0.05, 0.04], [0.28, 0.1, 0.09, 0.055], [0.55, 0.09, 0.08, 0.046], [0.8, 0.06, 0.045, 0.028], [1, 0.045, 0.04, 0.016]],
        eye: { t: 0.1, r: 0.048, y: 0.018, iris: "#d8c890" }, scales: 18, irid: 0.8, rough: 0.3,
        paint(t, s, c, n) {
          let base = L3(C("#c8ccc0"), C("#8a8a74"), smooth(0.1, 0.9, s));
          const rear = smooth(0.3, 0.55, t + s * 0.08);
          base = L3(base, L3(C(P[3]), C("#6aa8e8"), smooth(0.1, 0.7, noise3(t * 30, s * 14, c * 3, 4)) * 0.6), rear * 0.92);
          base = L3(base, C(P[0]), smooth(0.85, 1, t) * 0.5);
          return { c: base, g: rear * 0.12 };
        },
        fins: [
          { at: "top", t0: 0.48, t1: 0.62, f: (u) => [-0.2 - 0.05 * u, 0.09 * (1 - u * 0.4)], col: (u, r) => ({ c: L3(C(P[1]), C(P[0]), r), a: 0.6 }), fl: 0.9, rays: 9 },
          { at: "bot", t0: 0.55, t1: 0.66, f: (u) => [-0.08, -0.06], col: clearFin(P[1], 0.4), fl: 0.5, rays: 6 },
          {
            at: "tail", len: 0.46, f: (u) => { const k = u * 2 - 1; return [-0.44 * (0.92 + 0.08 * (1 - k * k)), k * 0.34]; },
            col: (u, r) => { const sp = noise3(u * 7, r * 5, 1, 7); const c0 = L3(C(P[0]), C(P[1]), smooth(-0.2, 0.5, sp)); const ret = Math.abs(Math.sin(u * 46 + noise3(u * 9, r * 9, 2, 3) * 4)) * Math.abs(Math.sin(r * 30 + noise3(u * 8, r * 8, 5, 3) * 4)); return { c: L3(c0, C(P[2]), smooth(0.25, 0.55, ret) * 0.9 * smooth(0.05, 0.25, r)), a: 0.78 + 0.18 * smooth(0.0, 0.25, r) }; }, fl: 1.3, rays: 26, pleat: 0.012,
          },
          { at: "side", t: 0.2, f: () => [-0.07, -0.02, 0.05], col: clearFin(), fl: 1, rays: 8, y: -0.4 },
        ],
      };
    },
  },
  betta: {
    variantKey: (f) => "v" + ((f.v | 0) % 4),
    build(key) {
      const P = BETTA_PAL[+key[1]];
      const finC = (u, r) => { const sh = noise3(u * 6, r * 5, 3, 1) * 0.5 + 0.5; const base = L3(L3(C(P[0]), C(P[1]), smooth(0.15, 0.5, r)), C(P[1]), sh * 0.3); return { c: L3(base, L3(C(P[1]), C("#ff6070"), 0.3), smooth(0.88, 0.99, r) * 0.6), a: 0.8 + 0.15 * r }; };
      return {
        bf: 0.6, prof: [[0, 0.02, 0.02, 0.016], [0.08, 0.075, 0.07, 0.048], [0.25, 0.115, 0.105, 0.062], [0.55, 0.11, 0.1, 0.055], [0.85, 0.08, 0.07, 0.034], [1, 0.065, 0.055, 0.02]],
        eye: { t: 0.09, r: 0.04, y: 0.02, iris: "#2a1a1a" }, scales: 22, irid: 0.85, rough: 0.28,
        paint(t, s, c, n) {
          let base = L3(C(P[0]), C(P[2]), smooth(0.1, 0.6, noise3(t * 22, s * 12, c * 4, 3)) * 0.6);
          base = L3(base, C(P[1]), smooth(0.25, 0.7, noise3(t * 4, s * 3, 1, 8)) * 0.35 + smooth(0.0, 0.12, t) * 0.4);
          base = L3(base, L3(base, C("#000"), 0.45), smooth(0.5, 1, s) * 0.7);
          return { c: base, g: 0.05 };
        },
        fins: [
          { at: "top", t0: 0.42, t1: 0.96, f: (u) => [-0.14 - 0.22 * u, 0.24 + 0.1 * Math.sin(Math.PI * u)], col: finC, fl: 1.5, rays: 14, pleat: 0.012, droop: 0.04 },
          { at: "bot", t0: 0.18, t1: 0.96, f: (u) => [-0.14 - 0.24 * u, -0.3 - 0.08 * Math.sin(Math.PI * u)], col: finC, fl: 1.5, rays: 22, pleat: 0.012, droop: 0.06 },
          { at: "tail", len: 0.46, f: (u) => { const k = u * 2 - 1; return [-0.46 * (1 - 0.12 * k * k), k * 0.42]; }, col: finC, fl: 1.6, rays: 30, pleat: 0.012, droop: 0.05 },
          { at: "bot", t0: 0.22, t1: 0.25, f: () => [-0.12, -0.32], col: finC, fl: 1.2, rays: 2, droop: 0.04 },
          { at: "side", t: 0.2, f: () => [-0.08, -0.02, 0.05], col: clearFin(P[1], 0.25), fl: 1, rays: 8, y: -0.3 },
        ],
      };
    },
  },
  angel: {
    bf: 0.72, prof: [[0, 0.03, 0.03, 0.02], [0.08, 0.12, 0.11, 0.04], [0.22, 0.27, 0.25, 0.055], [0.4, 0.3, 0.28, 0.055], [0.62, 0.22, 0.2, 0.045], [0.85, 0.09, 0.08, 0.025], [1, 0.05, 0.045, 0.015]],
    eye: { t: 0.1, r: 0.04, y: 0.04, iris: "#c83a2a" }, scales: 26, irid: 0.35, rough: 0.3,
    bars: [[0.12, 0.035], [0.4, 0.06], [0.68, 0.035], [0.93, 0.05]],
    paint(t, s, c, n) {
      let base = L3(C("#e8ecec"), C("#b7b8a6"), smooth(0.4, 1, s));
      base = L3(base, C("#d8c890"), smooth(0.6, 1, s) * (1 - smooth(0.0, 0.3, t)) * 0.6);
      let bar = 0; for (const [bc, bw] of this.bars) bar = Math.max(bar, band(t + s * 0.04, bc, bw, 0.5));
      base = L3(base, C("#1a1a1e"), bar * 0.9);
      return { c: base, g: 0 };
    },
    fins: [
      { at: "top", t0: 0.2, t1: 0.7, f: (u) => [-0.12 - 0.5 * Math.pow(1 - u, 1.2), 0.62 * Math.pow(1 - u, 0.8) + 0.02], col: (u, r) => ({ c: C("#c8ccc8"), a: 0.4 + 0.25 * r }), bars: true, fl: 0.8, rays: 12, pleat: 0 },
      { at: "bot", t0: 0.3, t1: 0.72, f: (u) => [-0.12 - 0.42 * Math.pow(1 - u, 1.2), -0.55 * Math.pow(1 - u, 0.8) - 0.02], col: (u, r) => ({ c: C("#c8ccc8"), a: 0.4 + 0.25 * r }), bars: true, fl: 0.8, rays: 12, pleat: 0 },
      { at: "bot", t0: 0.2, t1: 0.23, f: () => [-0.32, -0.62], col: () => ({ c: C("#e6e2d8"), a: 0.75 }), fl: 1, rays: 1, droop: 0.02 },
      { at: "tail", len: 0.3, f: (u) => { const k = u * 2 - 1; return [-0.3 * (0.7 + 0.6 * Math.abs(k) ** 3), k * 0.22]; }, col: (u, r) => ({ c: C("#eef0ee"), a: 0.3 }), fl: 0.7, rays: 16 },
      { at: "side", t: 0.22, f: () => [-0.08, -0.02, 0.05], col: clearFin(), fl: 1.2, rays: 8, y: -0.2 },
    ],
  },
  discus: {
    variantKey: (f) => "v" + ((f.v | 0) % 3),
    build(key) {
      const v = +key[1];
      return {
        bf: 0.87, prof: [[0, 0.06, 0.05, 0.02], [0.05, 0.2, 0.18, 0.045], [0.18, 0.36, 0.34, 0.065], [0.42, 0.42, 0.4, 0.072], [0.66, 0.37, 0.35, 0.062], [0.86, 0.2, 0.18, 0.04], [1, 0.07, 0.06, 0.02]],
        eye: { t: 0.11, r: 0.035, y: 0.06, iris: "#d81a1a" }, scales: 34, irid: 0.25, rough: 0.34,
        paint(t, s, c, n) {
          const wx = noise3(t * 3, s * 3, c, 21), wy = noise3(t * 3 + 7, s * 3, c, 22);
          const fld = noise3(t * 3.2 + wx * 0.9, s * 2.6 + wy * 0.9, c * 1.5, 23) * 2.4 + s * 1.6 + t * 0.8;
          const maze = Math.abs(Math.sin(fld * Math.PI * 1.6));
          const line = 1 - smooth(0.32, 0.55, maze);
          let base;
          if (v === 0) { base = L3(C("#fbf3ea"), C("#f2e4d6"), n * 0.5 + 0.5); base = L3(base, L3(C("#e8401a"), C("#ff6a20"), n + 0.5), line); base = L3(base, C("#ff7a2a"), smooth(0.75, 1, Math.abs(s)) * 0.6); }
          else if (v === 1) { base = L3(C("#c0401c"), C("#d8562a"), n * 0.5 + 0.5); base = L3(base, C("#38c4c0"), line); }
          else { base = L3(C("#3c86d6"), C("#62b6ee"), line * 0.6 + n * 0.2); base = L3(base, C("#8a3a2a"), (1 - line) * 0.15); }
          let bar = 0; for (let i = 0; i < 9; i++) bar = Math.max(bar, band(t, 0.08 + i * 0.105, 0.018));
          base = L3(base, L3(base, C("#1a0a06"), 0.6), bar * 0.25);
          base = L3(base, C("#3a1a10"), band(t, 0.1, 0.03) * 0.3);
          if (v === 0) base = L3(base, C("#ff6a1a"), (1 - smooth(0.1, 0.22, t)) * 0.8);
          return { c: base, g: 0.02 };
        },
        fins: [
          { at: "top", t0: 0.12, t1: 0.97, f: (u) => [-0.06 - 0.1 * u, 0.13 * Math.sin(Math.PI * (0.15 + u * 0.8))], col: (u, r) => ({ c: L3(L3(C(v === 2 ? "#4a8ad0" : v === 0 ? "#f4e2d0" : "#c86030"), C("#e8401a"), 0.6 * Math.abs(Math.sin(u * 30 + r * 4))), C(v === 2 ? "#ff6a3a" : "#ff4a2a"), smooth(0.65, 0.95, r)), a: 0.8 }), fl: 0.6, rays: 30 },
          { at: "bot", t0: 0.3, t1: 0.97, f: (u) => [-0.06 - 0.1 * u, -0.12 * Math.sin(Math.PI * (0.15 + u * 0.8))], col: (u, r) => ({ c: L3(L3(C(v === 2 ? "#4a8ad0" : v === 0 ? "#f4e2d0" : "#c86030"), C("#e8401a"), 0.6 * Math.abs(Math.sin(u * 30 + r * 4))), C(v === 2 ? "#ff6a3a" : "#ff4a2a"), smooth(0.65, 0.95, r)), a: 0.8 }), fl: 0.6, rays: 26 },
          { at: "tail", len: 0.14, f: (u) => { const k = u * 2 - 1; return [-0.14 * (1 - 0.2 * k * k), k * 0.1]; }, col: clearFin("#e8c8b0", 0.4), fl: 0.6, rays: 14 },
          { at: "side", t: 0.22, f: () => [-0.08, -0.02, 0.05], col: clearFin("#f0d8c8", 0.22), fl: 1.3, rays: 8, y: -0.1 },
        ],
      };
    },
  },
  goldfish: {
    variantKey: (f) => "v" + ((f.v | 0) % 2),
    build(key) {
      const v = +key[1];
      const fc = (u, r) => ({ c: v === 0 ? L3(C("#ff7a14"), C("#ffb060"), r * 0.4) : L3(C("#f8f0e8"), C("#ff4a2a"), smooth(0.3, 0.7, noise3(u * 5, r * 3, 7, 1) + 0.2) * 0.8), a: 0.6 + 0.25 * (1 - r) });
      return {
        bf: 0.76, prof: [[0, 0.04, 0.035, 0.03], [0.08, 0.12, 0.105, 0.075], [0.3, 0.2, 0.16, 0.105], [0.55, 0.18, 0.145, 0.095], [0.82, 0.09, 0.07, 0.045], [1, 0.055, 0.045, 0.022]],
        eye: { t: 0.1, r: 0.048, y: 0.045, iris: "#e8a040" }, scales: 24, irid: 0.35, rough: 0.26, scaleN: 0.9, scaleShade: 1,
        paint(t, s, c, n) {
          let base;
          if (v === 0) { base = L3(C("#ffa030"), C("#ff6a08"), smooth(-0.6, 0.5, s)); base = L3(base, C("#c84006"), smooth(0.6, 1, s) * 0.5); base = L3(base, C("#ffc040"), (1 - smooth(0.05, 0.22, t)) * 0.5); }
          else { const red = smooth(0.0, 0.25, noise3(t * 3.5, s * 2.5, c * 2, 11) + 0.15 * s); base = L3(C("#fbf4ec"), C("#e02a14"), red); }
          return { c: base, g: 0.02 };
        },
        fins: [
          { at: "top", t0: 0.3, t1: 0.66, f: (u) => [-0.08 - 0.04 * u, 0.16 * (1 - u * 0.75)], col: fc, fl: 0.7, rays: 14 },
          { at: "bot", t0: 0.68, t1: 0.8, f: () => [-0.08, -0.1], col: fc, fl: 0.8, rays: 8 },
          { at: "tail", len: 0.26, f: (u) => { const k = u * 2 - 1; return [-0.25 * (0.55 + 0.45 * Math.abs(k) ** 1.3), k * 0.17]; }, col: fc, fl: 0.9, rays: 20 },
          { at: "side", t: 0.24, f: () => [-0.11, -0.05, 0.05], col: fc, fl: 1.1, rays: 10, y: -0.6 },
          { at: "side", t: 0.5, f: () => [-0.09, -0.07, 0.03], col: fc, fl: 0.8, rays: 8, y: -0.95 },
        ],
      };
    },
  },
  cory: {
    bf: 0.8, prof: [[0, 0.03, 0.015, 0.035], [0.08, 0.11, 0.05, 0.085], [0.28, 0.19, 0.085, 0.11], [0.55, 0.15, 0.075, 0.09], [0.82, 0.075, 0.045, 0.045], [1, 0.05, 0.035, 0.024]],
    eye: { t: 0.12, r: 0.036, y: 0.06, iris: "#c8c0a8" }, scales: 14, irid: 0.1, rough: 0.42, scaleN: 0.5,
    paint(t, s, c, n) {
      let base = L3(C("#f6ece2"), C("#e0cfc0"), smooth(-0.3, 0.8, s));
      base = L3(base, C("#f0d8d0"), smooth(-0.2, -0.9, s) * 0.5);
      const plate = Math.pow(Math.abs(Math.sin(t * Math.PI * 22)), 18) * smooth(0.22, 0.3, t) * (1 - smooth(0.85, 0.95, t)) * smooth(-0.7, -0.4, s);
      base = L3(base, C("#a89888"), Math.max(plate * 0.5, band(s, 0.05, 0.02) * smooth(0.25, 0.35, t) * 0.5));
      const patch = band(t, 0.125, 0.05, 0.5) * smooth(-0.45, -0.2, s);
      base = L3(base, C("#e8c8bc"), (1 - smooth(0.0, 0.07, t)) * 0.6);
      base = L3(base, C("#17120f"), patch);
      base = L3(base, C("#17120f"), smooth(0.84, 0.9, t) * smooth(-0.4, 0, s) * 0.95);
      return { c: base, g: 0 };
    },
    fins: [
      { at: "top", t0: 0.28, t1: 0.42, f: (u) => [-0.08 - 0.03 * u, 0.2 * (1 - u * 0.8)], col: (u, r) => ({ c: C("#141010"), a: 0.88 - 0.4 * u }), fl: 0.4, rays: 7 },
      { at: "top", t0: 0.76, t1: 0.82, f: () => [-0.04, 0.035], col: clearFin("#e8dccc", 0.5), fl: 0.2, rays: 1 },
      { at: "bot", t0: 0.68, t1: 0.8, f: () => [-0.06, -0.06], col: clearFin(), fl: 0.4, rays: 6 },
      { at: "tail", len: 0.2, f: (u) => { const k = u * 2 - 1; return [-0.2 * (0.6 + 0.4 * Math.abs(k)), k * 0.14]; }, col: (u, r) => ({ c: C("#e8e0d4"), a: 0.3 + 0.2 * Math.abs(Math.sin(r * 12)) }), fl: 0.6, rays: 16 },
      { at: "side", t: 0.2, f: () => [-0.13, -0.02, 0.1], col: clearFin("#e8dccc", 0.35), fl: 0.9, rays: 9, y: -0.85 },
      { at: "side", t: 0.5, f: () => [-0.08, -0.03, 0.05], col: clearFin(), fl: 0.6, rays: 6, y: -0.95 },
    ],
    barbels: true,
  },
  oto: {
    bf: 0.82, prof: [[0, 0.03, 0.014, 0.048], [0.12, 0.068, 0.034, 0.075], [0.35, 0.078, 0.04, 0.07], [0.65, 0.058, 0.034, 0.05], [1, 0.03, 0.02, 0.02]],
    eye: { t: 0.15, r: 0.03, y: 0.035, iris: "#c8b080" }, scales: 18, irid: 0.15, rough: 0.45, scaleN: 0.6,
    paint(t, s, c, n) {
      let base = L3(C("#a8925a"), C("#6e5c34"), smooth(0.0, 0.9, s) + n * 0.25);
      base = L3(base, C("#ece2c4"), smooth(-0.3, -0.75, s));
      base = L3(base, C("#2a2214"), band(s, 0.02, 0.12, 0.5) * smooth(0.0, 0.08, t));
      base = L3(base, C("#3a3020"), smooth(0.35, 0.6, noise3(t * 14, s * 6, 3, 5)) * smooth(0.2, 0.6, s) * 0.6);
      return { c: base, g: 0 };
    },
    fins: [
      { at: "top", t0: 0.32, t1: 0.44, f: (u) => [-0.05, 0.08 * (1 - u * 0.6)], col: clearFin("#c8b890", 0.35), fl: 0.3, rays: 7 },
      { at: "tail", len: 0.18, f: (u) => { const k = u * 2 - 1; return [-0.18 * (0.6 + 0.4 * Math.abs(k)), k * 0.1]; }, col: (u, r) => ({ c: band(u, 0.5, 0.2) * (1 - r) > 0.3 ? C("#2a2014") : C("#d8ccaa"), a: 0.45 }), fl: 0.5, rays: 14 },
      { at: "side", t: 0.2, f: () => [-0.1, -0.01, 0.09], col: clearFin("#c8b890", 0.35), fl: 0.8, rays: 8, y: -0.8 },
      { at: "side", t: 0.5, f: () => [-0.08, -0.01, 0.06], col: clearFin("#c8b890", 0.3), fl: 0.6, rays: 6, y: -0.9 },
    ],
    sucker: true,
  },
};

/* ---------------- 构建 ---------------- */
function profAt(prof, t) {
  // Catmull-Rom 样条插值：轮廓连续光滑，没有分段的“瓶子”感
  let i = 0; while (i < prof.length - 2 && t > prof[i + 1][0]) i++;
  const p0 = prof[Math.max(0, i - 1)], p1 = prof[i], p2 = prof[i + 1], p3 = prof[Math.min(prof.length - 1, i + 2)];
  const u = clamp((t - p1[0]) / (p2[0] - p1[0]), 0, 1), u2 = u * u, u3 = u2 * u;
  const out = [];
  for (let k = 1; k <= 3; k++) {
    const m1 = ((p2[k] - p0[k]) / Math.max(1e-3, p2[0] - p0[0])) * (p2[0] - p1[0]), m2 = ((p3[k] - p1[k]) / Math.max(1e-3, p3[0] - p1[0])) * (p2[0] - p1[0]);
    const v = (2 * u3 - 3 * u2 + 1) * p1[k] + (u3 - 2 * u2 + u) * m1 + (-2 * u3 + 3 * u2) * p2[k] + (u3 - u2) * m2;
    out.push(Math.max(0.004, Math.min(v, Math.max(p1[k], p2[k]) * 1.08)));
  }
  // 吻部收尖：头最前端更圆润地收拢成嘴
  if (t < 0.06) { const k = Math.sqrt(t / 0.06); out[0] *= 0.55 + 0.45 * k; out[1] *= 0.55 + 0.45 * k; out[2] *= 0.6 + 0.4 * k; }
  return out;
}

function paintTex(sp) {
  scaleNormal();
  const [ru, rv] = scaleRep(sp), sk = (sp.scaleShade ?? 0.35) * 0.6;
  const W = 512, H = 256;
  const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
  const ctx = cv.getContext("2d"), img = ctx.createImageData(W, H);
  const gv = document.createElement("canvas"); gv.width = W / 2; gv.height = H / 2;
  const gctx = gv.getContext("2d"), gimg = gctx.createImageData(W / 2, H / 2);
  let glowAny = false;
  for (let y = 0; y < H; y++) {
    const a = -Math.PI / 2 + ((y + 0.5) / H) * Math.PI * 2, s = Math.sin(a), c = Math.cos(a);
    for (let x = 0; x < W; x++) {
      const t = (x + 0.5) / W;
      const n = noise3(t * 18, s * 6, c * 4, 5) * 0.6 + noise3(t * 60, s * 22, c * 9, 9) * 0.4;
      const o = sp.paint(t, s, c, n);
      // 眼睛也画进贴图（保证任何角度都看得到瞳孔与虹膜）
      if (sp.eye && Math.abs(c) > 0.2) {
        const et = sp.eye.t + 0.045, [etp, ebt] = profAt(sp.prof, t);
        const yy = s > 0 ? etp * s : ebt * s;
        const dd = Math.hypot((t - et) * sp.bf, yy - sp.eye.y) / (sp.eye.r * 0.86);
        if (dd < 1.15) {
          const ir = C(sp.eye.iris);
          let ec = dd < 0.58 ? [0.02, 0.02, 0.03] : dd < 0.95 ? L3(ir.map((q) => q * 0.7), L3(ir, [0, 0, 0], 0.65), smooth(0.65, 0.95, dd)) : L3(o.c, [0.1, 0.1, 0.1], 0.5);
          if (dd < 0.16 && (t - et) * sp.bf < 0 && yy > sp.eye.y) ec = [0.85, 0.9, 0.95];
          o.c = L3(ec, o.c, smooth(1.0, 1.15, dd));
        }
      }
      // 细鳞的明暗、侧线
      const hu = Math.floor((((t * ru) % 1) + 1) % 1 * 256), hv2 = Math.floor((((((y + 0.5) / H) * rv) % 1) + 1) % 1 * 256);
      const sc = (1 + n * 0.06) * (1 - sk * 0.28 * (1 - SCALE_H[hv2 * 256 + hu])) * (o.k ?? 1);
      // 鳃盖缝、嘴线、背深腹浅
      const gillT = (sp.gill ?? 0.25) + 0.035 * s * s;
      const gill = smooth(gillT - 0.05, gillT, t) * (1 - smooth(gillT, gillT + 0.012, t)) * (1 - smooth(0.5, 0.85, Math.abs(s)));
      const mouth = (1 - smooth(0.0, 0.035, t)) * band(s, -0.15, 0.08, 0.5);
      const cs = (1 - 0.16 * smooth(0.35, 1, s)) * (1 + 0.08 * smooth(-0.3, -1, s)) * (1 - 0.12 * gill) * (1 - 0.5 * mouth) * (1 + 0.06 * (1 - smooth(0.0, gillT, t)) * smooth(-0.2, 0.5, s));
      const k = (y * W + x) * 4;
      img.data[k] = clamp(o.c[0] * sc * cs, 0, 1) * 255; img.data[k + 1] = clamp(o.c[1] * sc * cs, 0, 1) * 255; img.data[k + 2] = clamp(o.c[2] * sc * cs, 0, 1) * 255; img.data[k + 3] = 255;
      if ((x & 1) === 0 && (y & 1) === 0) {
        const g = clamp(o.g || 0, 0, 1), gk = ((y >> 1) * (W / 2) + (x >> 1)) * 4;
        if (g > 0.01) glowAny = true;
        gimg.data[gk] = o.c[0] * g * 255; gimg.data[gk + 1] = o.c[1] * g * 255; gimg.data[gk + 2] = o.c[2] * g * 255; gimg.data[gk + 3] = 255;
      }
    }
  }
  ctx.putImageData(img, 0, 0); gctx.putImageData(gimg, 0, 0);
  const map = new THREE.CanvasTexture(cv); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 4;
  let emis = null;
  if (glowAny) { emis = new THREE.CanvasTexture(gv); emis.colorSpace = THREE.SRGBColorSpace; }
  return { map, emis };
}

function buildGeo(sp) {
  const bf = sp.bf, xAt = (t) => 0.5 - t * bf;
  const body = new Geo(), fins = new Geo(), eyes = new Geo();
  const NT = 46, NA = 28;
  const ts = []; for (let i = 0; i <= NT; i++) ts.push(Math.pow(i / NT, 1.25));
  // 鼻尖
  const tipI = body.v(0.5 + 0.004, profAt(sp.prof, 0)[0] * 0.2 - profAt(sp.prof, 0)[1] * 0.2, 0, [1, 1, 1], 1, 0, 0, 0, 0.5);
  const ring = [];
  for (let i = 1; i <= NT; i++) {
    const t = ts[i], [tp, bt, wd] = profAt(sp.prof, t), r = [];
    for (let k = 0; k <= NA; k++) {
      const v = k / NA, a = -Math.PI / 2 + v * Math.PI * 2, s = Math.sin(a), c = Math.cos(a);
      const y = s > 0 ? tp * s : bt * s;
      const z = wd * Math.sign(c) * Math.pow(Math.abs(c), 0.82);
      r.push(body.v(xAt(t), y, z, [1, 1, 1], 1, 0, 0, t, v));
    }
    ring.push(r);
  }
  for (let k = 0; k < NA; k++) body.t(tipI, ring[0][k + 1], ring[0][k]);
  for (let i = 0; i < ring.length - 1; i++) for (let k = 0; k < NA; k++) body.q(ring[i][k], ring[i][k + 1], ring[i + 1][k + 1], ring[i + 1][k]);
  const endI = body.v(xAt(1) - 0.004, 0, 0, [1, 1, 1], 1, 0, 0, 1, 0.5);
  const last = ring[ring.length - 1];
  for (let k = 0; k < NA; k++) body.t(endI, last[k], last[k + 1]);

  // 鳍
  const [eTop, eBot] = profAt(sp.prof, 1);
  for (const F of sp.fins) {
    const sides = F.at === "side" ? [1, -1] : F.dz ? [1, -1] : [0];
    for (const sd of sides) {
      const base = (u) => {
        if (F.at === "tail") return [xAt(1) + 0.01, -eBot * 0.9 + u * (eTop + eBot) * 0.9, 0];
        if (F.at === "side") { const [tp, bt, wd] = profAt(sp.prof, F.t); const y = F.y < 0 ? bt * F.y : tp * F.y; return [xAt(F.t) - u * 0.035, y, sd * wd * 0.85]; }
        const t = F.t0 + (F.t1 - F.t0) * u, [tp, bt] = profAt(sp.prof, t);
        return [xAt(t), F.at === "top" ? tp * 0.9 : -bt * 0.9, 0];
      };
      const nu = Math.max(2, Math.min(40, (F.rays || 8) * 2)), nr = F.at === "tail" || (F.fl || 0) > 1 ? 14 : 8;
      fins.grid(nu, nr, (u, r) => {
        const b = base(u), o = F.f(u);
        const dz = F.at === "side" ? sd * (o[2] || 0) : F.dz ? sd * F.dz * r : 0;
        const bow = Math.sin(r * Math.PI) * 0.012;
        const pleat = Math.sin(u * (F.rays || 8) * Math.PI) * (F.pleat ?? (F.fl > 1 ? 0.008 : 0.002)) * 0.5 * r;
        let { c, a } = F.col(u, r);
        if (F.bars && sp.bars) { const t = F.t0 + (F.t1 - F.t0) * u; const xt = (0.5 - (b[0] + o[0] * r)) / bf; let bar = 0; for (const [bc, bw] of sp.bars) bar = Math.max(bar, band(xt + (b[1] + o[1] * r) * 0.04, bc, bw * 1.1, 0.5)); c = L3(c, C("#1a1a1e"), bar * 0.85); a = Math.max(a, bar * 0.8); void t; }
        const fade = (smooth(0, 0.08, r) * 0.25 + 0.75) * 1.25;
        const lin = toLin(c);
        return { p: [b[0] + o[0] * r, b[1] + o[1] * r - (F.droop || 0) * r * r, b[2] + dz + bow * (F.at === "side" ? sd : 0) + pleat], c: lin, a: a * fade, A: (F.fl || 0.5) * Math.pow(r, 1.3), B: r, u: u * (F.rays || 8), w: r };
      });
    }
  }

  // 眼睛
  const E = { ...sp.eye, t: sp.eye.t + 0.045 }, [etp, ebt, ewd] = profAt(sp.prof, E.t);
  const iris = col(E.iris), pupil = col("#050506"), white = col("#d8dcdc"), glow = E.glow ? col(E.glow) : null;
  for (const sd of [1, -1]) {
    const R = E.r * 0.86, cx = xAt(E.t), cy = E.y, cz = sd * (ewd * 0.9 + R * 0.1);
    const s0 = eyes.n, NU = 14, NV = 10;
    for (let i = 0; i <= NV; i++) for (let j = 0; j <= NU; j++) {
      const th = (i / NV) * Math.PI, ph = (j / NU) * Math.PI * 2;
      const nx = Math.sin(th) * Math.cos(ph), ny = Math.cos(th), nz = Math.sin(th) * Math.sin(ph);
      const out = nz * sd;
      let c = out > 0.78 ? pupil : out > 0.2 ? mix(iris.map((q) => q * 0.7), pupil, smooth(0.68, 0.78, out)) : iris.map((q) => q * 0.25);
      if (out > 0.2 && out < 0.32) c = c.map((q) => q * 0.45);
      let g = 0;
      if (glow && out > 0.3 && out < 0.8 && ny > 0.1) { c = glow; g = 1; }
      eyes.v(cx + nx * R, cy + ny * R, cz + nz * R * 0.62, c, 1, 0, g);
    }
    for (let i = 0; i < NV; i++) for (let j = 0; j < NU; j++) { const a = s0 + i * (NU + 1) + j, b = a + NU + 1; eyes.q(a, b, b + 1, a + 1); }
  }
  // 触须（鼠鱼）与吸盘嘴（小精灵）
  if (sp.barbels) for (const sd of [1, -1]) for (let b = 0; b < 2; b++) {
    const bx = 0.49 - b * 0.02, s0 = eyes.n;
    for (let i = 0; i <= 6; i++) { const r = i / 6; for (const w of [-1, 1]) eyes.v(bx - r * 0.02, -0.02 - r * 0.05, sd * (0.012 + r * (0.04 + b * 0.02)) + w * 0.004 * (1 - r), col("#e8dccc"), 1, 0, 0); }
    for (let i = 0; i < 6; i++) eyes.q(s0 + i * 2, s0 + i * 2 + 1, s0 + i * 2 + 3, s0 + i * 2 + 2);
  }
  if (sp.sucker) {
    const s0 = eyes.n, cxs = 0.44, cy = -0.012;
    eyes.v(cxs, cy - 0.004, 0, col("#6a5a40"));
    for (let k = 0; k <= 16; k++) { const a = (k / 16) * Math.PI * 2; eyes.v(cxs + Math.cos(a) * 0.035, cy, Math.sin(a) * 0.04, col("#b8a888")); }
    for (let k = 0; k < 16; k++) eyes.t(s0, s0 + 1 + k, s0 + 2 + k);
  }
  return { body: body.build(), fins: fins.build(), eyes: eyes.build() };
}

/* ---------------- 樱花虾 ---------------- */
function buildShrimp(v) {
  const body = new Geo(), fins = new Geo(), eyes = new Geo();
  const red = col(v === 1 ? "#d81a20" : "#c4101c"), deep = col("#6a0410"), pale = col("#ff8a7a"), clear = col("#e8a8a0");
  const NS = 56, NA = 16;
  const spine = (s) => { const x = 0.5 - s * 0.88; const y = 0.07 * Math.sin(Math.PI * Math.min(1, s * 1.15)) - 0.06 * Math.pow(s, 3); return [x, y]; };
  const rad = (s) => { if (s < 0.08) return 0.012 + s * 0.6; if (s < 0.42) return 0.06 + 0.035 * Math.sin(((s - 0.08) / 0.34) * Math.PI * 0.8); return 0.085 * (1 - (s - 0.42) * 1.25) + 0.008; };
  const rings = [];
  for (let i = 0; i <= NS; i++) {
    const s = i / NS, [x, y] = spine(s), r = rad(s), rr = [];
    const seg = s > 0.42 ? Math.pow(Math.abs(Math.sin(((s - 0.42) / 0.5) * Math.PI * 6)), 12) : 0;
    for (let k = 0; k <= NA; k++) {
      const a = (k / NA) * Math.PI * 2, sa = Math.sin(a), ca = Math.cos(a);
      const dots = smooth(0.35, 0.55, noise3(s * 40, sa * 6, ca * 6, 3));
      let c = mix(mix(clear, red, 0.82 + 0.18 * dots), deep, seg * 0.45 + 0.15);
      if (sa > 0.75 && s > 0.15 && s < 0.45) c = mix(c, pale, 0.25);
      rr.push(body.v(x, y + sa * r * (1 + seg * 0.06), ca * r * 0.82, c, 1, 0, 0));
    }
    rings.push(rr);
  }
  for (let i = 0; i < NS; i++) for (let k = 0; k < NA; k++) body.q(rings[i][k], rings[i][k + 1], rings[i + 1][k + 1], rings[i + 1][k]);
  // 额角
  const [rx, ry] = spine(0);
  fins.grid(2, 4, (u, r) => ({ p: [rx + r * 0.1, ry + 0.01 + r * 0.02, (u - 0.5) * 0.012 * (1 - r)], c: red, a: 0.8, A: 0, B: r }));
  // 尾扇
  const [tx, ty] = spine(1);
  fins.grid(10, 6, (u, r) => { const k = u * 2 - 1; return { p: [tx - r * 0.12, ty - r * 0.02, k * (0.02 + r * 0.07)], c: mix(red, clear, r * 0.5), a: 0.75, A: 0.15 * r, B: r, u: u * 5, w: r }; });
  // 步足（5 对）与游泳足
  const leg = (s, len, ang, fl, cc, w = 0.006) => {
    for (const sd of [1, -1]) {
      const [x, y] = spine(s), r0 = rad(s);
      fins.grid(1, 5, (u, r) => ({ p: [x + Math.cos(ang) * len * r + (u - 0.5) * w, y - r0 * 0.6 - len * r * 0.85, sd * (r0 * 0.6 + len * r * 0.55)], c: cc, a: 0.85, A: fl * r, B: r }));
    }
  };
  for (let i = 0; i < 5; i++) leg(0.14 + i * 0.06, 0.1 + (i === 0 ? -0.02 : 0.015), 0.6 - i * 0.35, 0.7, mix(red, clear, 0.25), 0.004);
  for (let i = 0; i < 5; i++) leg(0.48 + i * 0.075, 0.035, -0.3, 1.4, mix(red, clear, 0.35), 0.014);
  // 触角
  for (const sd of [1, -1]) for (const [L, up] of [[0.75, 0.3], [0.35, 0.5]]) {
    fins.grid(1, 16, (u, r) => ({ p: [rx + r * 0.25 - r * r * (L - 0.25) * 0.6 + (u - 0.5) * 0.003, ry + 0.02 + up * Math.sin(r * 1.6) * L * 0.3, sd * (0.02 + r * L * 0.45)], c: red, a: 0.85, A: 0.6 * r, B: r }));
  }
  // 眼
  for (const sd of [1, -1]) {
    const s0 = eyes.n, cx = 0.43, cy = 0.05, cz = sd * 0.045, R = 0.018;
    for (let i = 0; i <= 6; i++) for (let j = 0; j <= 8; j++) { const th = (i / 6) * Math.PI, ph = (j / 8) * Math.PI * 2; eyes.v(cx + Math.sin(th) * Math.cos(ph) * R, cy + Math.cos(th) * R, cz + Math.sin(th) * Math.sin(ph) * R, col("#0a0606")); }
    for (let i = 0; i < 6; i++) for (let j = 0; j < 8; j++) { const a = s0 + i * 9 + j; eyes.q(a, a + 9, a + 10, a + 1); }
  }
  return { body: body.build(), fins: fins.build(), eyes: eyes.build() };
}

/* ---------------- 外部接口：按物种 + 变体缓存几何与贴图 ---------------- */
const cache = new Map();
export function fishAssets(spId, f) {
  const def = SPEC[spId];
  let key = spId, sp;
  if (spId === "shrimp") key = "shrimp" + ((f.v | 0) % 2);
  else if (def.variantKey) key = spId + def.variantKey(f);
  if (cache.has(key)) return cache.get(key);
  let out;
  if (spId === "shrimp") {
    const g = buildShrimp((f.v | 0) % 2);
    out = { ...g, map: null, emis: null, sp: { irid: 0.2, rough: 0.3, scales: 0 }, shrimp: true };
  } else {
    sp = def.build ? def.build(key.slice(spId.length)) : def;
    const g = buildGeo(sp), tx = paintTex(sp);
    out = { ...g, ...tx, sp };
  }
  cache.set(key, out);
  return out;
}

/** 为一条鱼创建网格（材质独立，几何与贴图共享） */
export function makeFishMesh(spId, f, U) {
  const A = fishAssets(spId, f);
  const sp = A.sp;
  const grp = new THREE.Group();
  let bodyM;
  if (A.shrimp) {
    bodyM = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.2, transparent: true, opacity: 0.94, sheen: 0.2, sheenColor: new THREE.Color(0xff6050), envMapIntensity: 0.5 });
  } else {
    const nrm = scaleNormal().clone(); nrm.needsUpdate = true;
    nrm.repeat.set(...scaleRep(sp)); bodyM_n = 1;
    bodyM = new THREE.MeshPhysicalMaterial({
      map: A.map, normalMap: nrm, normalScale: new THREE.Vector2(0.3 * (sp.scaleN ?? 1), 0.3 * (sp.scaleN ?? 1)), roughness: sp.rough, metalness: 0.08,
      clearcoat: 0.6, clearcoatRoughness: 0.18, iridescence: sp.irid, iridescenceIOR: 1.35, iridescenceThicknessRange: [180, 520],
      sheen: 0.25, sheenColor: new THREE.Color(0xdfeaff), sheenRoughness: 0.5,
      emissive: A.emis ? 0xffffff : 0x000000, emissiveMap: A.emis || null, emissiveIntensity: 1, envMapIntensity: 0.55,
    });
  }
  patch(bodyM, "fish", U);
  const finM = new THREE.MeshPhysicalMaterial({ vertexColors: true, map: A.shrimp ? null : finTex(), transparent: true, side: THREE.DoubleSide, depthWrite: false, roughness: 0.45, clearcoat: 0.12, envMapIntensity: 0.35 });
  patch(finM, "fish", U);
  const eyeM = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.18, metalness: 0.35, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.1 });
  patch(eyeM, "eye", U);
  const body = new THREE.Mesh(A.body, bodyM), fins = new THREE.Mesh(A.fins, finM), eyes = new THREE.Mesh(A.eyes, eyeM);
  fins.renderOrder = 1;
  grp.add(body, eyes, fins);
  grp.userData = { body, fins, eyes, bodyM, finM, eyeM, glowable: !!A.emis || !!sp.eye?.glow };
  return grp;
}
