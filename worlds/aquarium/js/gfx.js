// 共用：缸体尺寸、全局着色器参数、材质补丁（焦散 / 水草摇曳 / 鱼身摆动）、几何体构建器、噪声
import * as THREE from "three";

export const T = { W: 10, H: 6, D: 5, X0: -5, X1: 5, Z0: -2.5, Z1: 2.5, WATER: 5.55 };

export const U = {
  uTime: { value: 0 },
  uCaustK: { value: 1 },
  uCaustCol: { value: new THREE.Color(1, 0.97, 0.88) },
  uSurf: { value: T.WATER },
  uFlow: { value: 1 },
  uAlgae: { value: 0 },
};

/* ---------------- 随机与噪声 ---------------- */
export function rng(seed) {
  let a = seed >>> 0 || 1;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function h3(x, y, z, s) {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(z, 1274126177) + Math.imul(s, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const sm = (t) => t * t * (3 - 2 * t);
export function noise3(x, y, z, s = 0) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = sm(x - xi), yf = sm(y - yi), zf = sm(z - zi);
  const L = (a, b, t) => a + (b - a) * t;
  const c = (dx, dy, dz) => h3(xi + dx, yi + dy, zi + dz, s);
  return L(
    L(L(c(0, 0, 0), c(1, 0, 0), xf), L(c(0, 1, 0), c(1, 1, 0), xf), yf),
    L(L(c(0, 0, 1), c(1, 0, 1), xf), L(c(0, 1, 1), c(1, 1, 1), xf), yf),
    zf
  ) * 2 - 1;
}
export function fbm3(x, y, z, o = 4, s = 0) {
  let a = 0.5, f = 1, v = 0;
  for (let i = 0; i < o; i++) { v += a * noise3(x * f, y * f, z * f, s + i * 17); f *= 2.03; a *= 0.5; }
  return v;
}
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

const _c = new THREE.Color();
/** sRGB 十六进制 → 线性 [r,g,b] */
export function col(hex) { _c.set(hex); return [_c.r, _c.g, _c.b]; }
export const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];

/* ---------------- 几何体构建 ---------------- */
export class Geo {
  constructor() { this.P = []; this.C = []; this.A = []; this.B = []; this.I = []; this.n = 0; }
  v(x, y, z, c, a = 1, A = 0, B = 0) {
    this.P.push(x, y, z); this.C.push(c[0], c[1], c[2], a); this.A.push(A); this.B.push(B);
    return this.n++;
  }
  t(a, b, c) { this.I.push(a, b, c); }
  q(a, b, c, d) { this.I.push(a, b, c, a, c, d); }
  /** 参数网格：fn(u,r) → {p:[x,y,z], c:[r,g,b], a, A, B} */
  grid(nu, nr, fn) {
    const s = this.n;
    for (let i = 0; i <= nu; i++) for (let j = 0; j <= nr; j++) {
      const o = fn(i / nu, j / nr);
      this.v(o.p[0], o.p[1], o.p[2], o.c, o.a ?? 1, o.A ?? 0, o.B ?? 0);
    }
    for (let i = 0; i < nu; i++) for (let j = 0; j < nr; j++) {
      const a = s + i * (nr + 1) + j, b = a + nr + 1;
      this.q(a, b, b + 1, a + 1);
    }
    return s;
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.P, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(this.C, 4));
    g.setAttribute("aA", new THREE.Float32BufferAttribute(this.A, 1));
    g.setAttribute("aB", new THREE.Float32BufferAttribute(this.B, 1));
    g.setIndex(this.I);
    g.computeVertexNormals();
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

/** 细分二十面体（带索引、无接缝），用于石头 */
export function icosphere(detail = 4) {
  const t = (1 + Math.sqrt(5)) / 2;
  let v = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]]
    .map((p) => { const l = Math.hypot(...p); return p.map((x) => x / l); });
  let f = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
  for (let d = 0; d < detail; d++) {
    const cache = new Map(), nf = [];
    const mid = (a, b) => {
      const k = a < b ? a + "_" + b : b + "_" + a;
      if (cache.has(k)) return cache.get(k);
      const p = [(v[a][0] + v[b][0]) / 2, (v[a][1] + v[b][1]) / 2, (v[a][2] + v[b][2]) / 2];
      const l = Math.hypot(...p); v.push(p.map((x) => x / l));
      cache.set(k, v.length - 1); return v.length - 1;
    };
    for (const [a, b, c] of f) { const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a); nf.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]); }
    f = nf;
  }
  return { v, f };
}

/* ---------------- 材质补丁 ---------------- */
const CAUST = /* glsl */ `
float aqCaust(vec2 p, float t){
  p = mod(p * 6.28318, 6.28318) - 250.0;
  vec2 i = p; float c = 1.0; float inten = 0.005;
  for (int n = 0; n < 3; n++) {
    float tt = t * (1.0 - (3.5 / float(n + 1)));
    i = p + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
    c += 1.0 / length(vec2(p.x / (sin(i.x + tt) / inten), p.y / (cos(i.y + tt) / inten)));
  }
  c /= 3.0; c = 1.17 - pow(c, 1.4);
  return clamp(pow(abs(c), 8.0), 0.0, 1.6);
}
float aqH13(vec3 p){ p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
`;

/**
 * kind: "static" 普通（焦散）| "sub" 底床（颗粒感）| "decor" 石木（焦散+藻色）| "plant" 水草摇曳 | "fish" 鱼身摆动 + 鳍飘动 + 发光
 */
export function patch(mat, kind, extra) {
  const defs = { static: "", sub: "#define AQ_GRAIN\n", decor: "#define AQ_ALGAE\n", plant: "#define AQ_PLANT\n", fish: "#define AQ_FISH\n" }[kind];
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    if (extra) Object.assign(sh.uniforms, extra);
    sh.vertexShader = defs + /* glsl */ `
attribute float aA; attribute float aB;
uniform float uTime; uniform float uFlow;
varying vec3 vCW; varying float vCNy; varying float vB;
#ifdef AQ_FISH
uniform float uPhase; uniform float uAmp; uniform float uWave; uniform float uTurn; uniform float uFlut; uniform float uFlutK;
#endif
` + sh.vertexShader
      .replace("#include <beginnormal_vertex>", /* glsl */ `#include <beginnormal_vertex>
#ifdef AQ_FISH
  float fs = clamp((0.5 - position.x), 0.0, 1.35);
  float fw = sin(uPhase - fs * uWave);
  float fa = uAmp * (0.05 + fs * fs);
  float fd = -uWave * cos(uPhase - fs * uWave) * fa + fw * uAmp * 2.0 * fs + 2.0 * uTurn * fs;
  float fph = atan(fd);
  float fc = cos(fph), fsn = sin(fph);
  objectNormal = vec3(objectNormal.x * fc + objectNormal.z * fsn, objectNormal.y, -objectNormal.x * fsn + objectNormal.z * fc);
#endif`)
      .replace("#include <begin_vertex>", /* glsl */ `#include <begin_vertex>
#ifdef AQ_FISH
  transformed.z += fw * fa + uTurn * fs * fs;
  transformed.z += aA * sin(uTime * uFlut + fs * 6.0 + position.y * 9.0) * 0.06 * uFlutK;
  transformed.y += aA * cos(uTime * uFlut * 0.8 + fs * 5.0) * 0.022 * uFlutK;
#endif
#ifdef AQ_PLANT
  vec3 aqo = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  float aqph = uTime * 0.8 + aqo.x * 0.7 + aqo.z * 0.5 + position.y * 0.9;
  float aqsw = aA * uFlow;
  transformed.x += (sin(aqph) + 0.35 * sin(aqph * 2.7 + 1.3)) * aqsw * 0.07;
  transformed.z += sin(aqph * 0.63 + 0.7) * aqsw * 0.05;
#endif
  vB = aB;`)
      .replace("#include <project_vertex>", /* glsl */ `#include <project_vertex>
  vec4 aqw = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
  aqw = instanceMatrix * aqw;
#endif
  aqw = modelMatrix * aqw; vCW = aqw.xyz;
  vCNy = normalize(mat3(modelMatrix) * objectNormal).y;`);
    sh.fragmentShader = defs + /* glsl */ `
uniform float uTime; uniform float uCaustK; uniform vec3 uCaustCol; uniform float uSurf; uniform float uAlgae;
#ifdef AQ_FISH
uniform float uGlow;
#endif
varying vec3 vCW; varying float vCNy; varying float vB;
` + CAUST + sh.fragmentShader
      .replace("#include <color_fragment>", /* glsl */ `#include <color_fragment>
#ifdef AQ_GRAIN
  float aqg = aqH13(floor(vCW * 48.0));
  diffuseColor.rgb *= 0.7 + 0.6 * aqg;
#endif
#ifdef AQ_ALGAE
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.10, 0.20, 0.05), uAlgae * smoothstep(0.25, 0.9, vCNy) * 0.75);
#endif`)
      .replace("#include <emissivemap_fragment>", /* glsl */ `#include <emissivemap_fragment>
  {
#ifdef AQ_PLANT
    float aqn = abs(vCNy) * 0.65 + 0.35;
#else
    float aqn = clamp(vCNy * 1.1, 0.0, 1.0);
#endif
    float aqd = clamp((uSurf - vCW.y) / uSurf, 0.0, 1.0);
    float aqc = aqCaust(vCW.xz * 0.16 + vec2(vCW.y * 0.02, 0.0), uTime * 0.42);
    totalEmissiveRadiance += uCaustCol * diffuseColor.rgb * aqc * aqn * uCaustK * (1.0 - 0.5 * aqd) * step(vCW.y, uSurf);
#ifdef AQ_FISH
    totalEmissiveRadiance += diffuseColor.rgb * vB * uGlow;
#endif
  }`);
  };
  mat.customProgramCacheKey = () => "aq-" + kind;
  return mat;
}
