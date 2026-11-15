// 沉没之后 · 序章：通用小工具（数学、画布贴图、GLSL 片段）
import * as THREE from "three";

export const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a || 1e-6)); return t * t * (3 - 2 * t); };
export const damp = (a, b, k, dt) => lerp(a, b, 1 - Math.exp(-k * dt));
export const rnd = (a = 0, b = 1) => a + Math.random() * (b - a);

// 可复现的伪随机
export function rng(seed = 1) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 100000) / 100000; };
}

// 平滑的一维噪声（相机晃动等）
export function noise1(x) {
  const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
  const h = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
  return lerp(h(i), h(i + 1), u) * 2 - 1;
}

export const FONT = '"Noto Serif SC","Songti SC","STSong","SimSun","Source Han Serif SC","WenQuanYi Zen Hei",serif';
export const HAND = '"Kaiti SC","STKaiti","KaiTi","Noto Serif SC","WenQuanYi Zen Hei",serif';

export function canvasTex(w, h, draw, { repeat = false, srgb = true, aniso = 4 } = {}) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const g = c.getContext("2d");
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = aniso;
  t.needsUpdate = true;
  return t;
}

// 抖动的手绘线
export function jitterLine(g, pts, j = 1.5, passes = 2) {
  for (let p = 0; p < passes; p++) {
    g.beginPath();
    pts.forEach(([x, y], i) => {
      const xx = x + (Math.random() - 0.5) * j, yy = y + (Math.random() - 0.5) * j;
      i ? g.lineTo(xx, yy) : g.moveTo(xx, yy);
    });
    g.stroke();
  }
}

// 释放一个对象树里的几何体、材质与贴图
export function disposeTree(root) {
  root.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
    for (const m of ms) {
      for (const k in m) { const v = m[k]; if (v && v.isTexture) v.dispose(); }
      if (m.uniforms) for (const k in m.uniforms) { const v = m.uniforms[k].value; if (v && v.isTexture) v.dispose(); }
      m.dispose();
    }
  });
}

// GLSL：哈希 / 值噪声 / 分形噪声（全部无负底数的 pow、无除零）
export const GLSL_NOISE = /* glsl */ `
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x), mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y); }
float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++){ s += a * vnoise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; } return s; }
float fbm3(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 3; i++){ s += a * vnoise(p); p = p * 2.07 + vec2(5.1, 1.3); a *= 0.5; } return s; }
float pow5(float x){ float y = clamp(x, 0.0, 1.0); float y2 = y * y; return y2 * y2 * y; }
`;
