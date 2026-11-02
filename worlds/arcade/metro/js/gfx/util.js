// 星环列车 · 图形工具：世界弯曲、几何合并、程序贴图
import * as THREE from 'three';

// ———————————————————— 世界弯曲（轨道顺着星球弧度向下、并左右缓缓转弯） ————————————————————
export const BEND = { y: { value: 0.00022 }, x: { value: 0 } };
export const BEND_GLSL = /* glsl */`
uniform float uBendY;
uniform float uBendX;
vec3 bendWorld(vec3 p) {
  float d = max(0.0, -p.z);
  p.y -= uBendY * d * d;
  p.x += uBendX * d * d;
  return p;
}
`;
const PROJECT_BENT = /* glsl */`
vec4 mvPosition = vec4( transformed, 1.0 );
#ifdef USE_INSTANCING
  mvPosition = instanceMatrix * mvPosition;
#endif
vec4 bentWorld = modelMatrix * mvPosition;
bentWorld.xyz = bendWorld(bentWorld.xyz);
mvPosition = viewMatrix * bentWorld;
gl_Position = projectionMatrix * mvPosition;
`;
export function bend(mat, extra) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uBendY = BEND.y;
    sh.uniforms.uBendX = BEND.x;
    sh.vertexShader = BEND_GLSL + sh.vertexShader.replace('#include <project_vertex>', PROJECT_BENT);
    if (extra) extra(sh);
  };
  mat.customProgramCacheKey = () => 'bend-' + (extra ? extra.key || 'x' : '0');
  return mat;
}

// ———————————————————— 几何合并 ————————————————————
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3();
export class GB {
  constructor() { this.parts = []; }
  add(geo, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1, color = 0xffffff, uv = null, glow = 0 } = {}) {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    _e.set(rx, ry, rz); _q.setFromEuler(_e); _v.set(x, y, z); _s.set(sx, sy, sz);
    _m.compose(_v, _q, _s);
    g.applyMatrix4(_m);
    const n = g.attributes.position.count;
    const c = new THREE.Color(color);
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    const uvA = g.attributes.uv;
    if (uv) { // 映射到图集中的子矩形 [u0,v0,u1,v1]
      for (let i = 0; i < n; i++) uvA.setXY(i, uv[0] + uvA.getX(i) * (uv[2] - uv[0]), uv[1] + uvA.getY(i) * (uv[3] - uv[1]));
    } else {
      for (let i = 0; i < n; i++) uvA.setXY(i, 0.995, 0.995); // 图集右上角为纯白
    }
    const gl = new Float32Array(n).fill(glow);
    g.setAttribute('glow', new THREE.BufferAttribute(gl, 1));
    this.parts.push(g);
    return this;
  }
  box(w, h, d, o = {}) { return this.add(new THREE.BoxGeometry(w, h, d), o); }
  cyl(rt, rb, h, seg, o = {}) { return this.add(new THREE.CylinderGeometry(rt, rb, h, seg), o); }
  sphere(r, ws, hs, o = {}) { return this.add(new THREE.SphereGeometry(r, ws, hs), o); }
  plane(w, h, o = {}) { return this.add(new THREE.PlaneGeometry(w, h), o); }
  build() {
    const names = ['position', 'normal', 'uv', 'color', 'glow'];
    let total = 0;
    for (const p of this.parts) total += p.attributes.position.count;
    const out = new THREE.BufferGeometry();
    for (const name of names) {
      const size = this.parts[0].attributes[name].itemSize;
      const arr = new Float32Array(total * size);
      let off = 0;
      for (const p of this.parts) { arr.set(p.attributes[name].array, off); off += p.attributes[name].array.length; }
      out.setAttribute(name, new THREE.BufferAttribute(arr, size));
    }
    out.computeBoundingSphere();
    for (const p of this.parts) p.dispose();
    this.parts = [];
    return out;
  }
}

// ———————————————————— 画布贴图 ————————————————————
export function canvasTex(w, h, draw, { repeat = false, mip = true, srgb = true } = {}) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const g = cv.getContext('2d');
  draw(g, w, h);
  const t = new THREE.CanvasTexture(cv);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  if (!mip) { t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; }
  return t;
}

export function radialTex(stops = [[0, 'rgba(255,255,255,1)'], [0.35, 'rgba(255,255,255,.45)'], [1, 'rgba(255,255,255,0)']], size = 128) {
  return canvasTex(size, size, (g, w, h) => {
    const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    for (const [o, c] of stops) gr.addColorStop(o, c);
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
}

// 各种道具共用的一张图集（1024×1024）：
//  [0, .5]×[.5, 1]  车厢侧面        [.5, 1]×[.5, 1]  货柜侧面（瓦楞）
//  [0, .5]×[.25,.5] 警示条纹        [.5, 1]×[.25,.5] 坡道格栅 + 箭头
//  [0, .5]×[0, .25] 车顶格栅        [.5, .75]×[0,.25] 门架标识     右上角纯白
export const ATLAS = {
  car: [0, 0.5, 0.5, 1], cont: [0.5, 0.5, 1, 0.97], hazard: [0, 0.25, 0.5, 0.5], ramp: [0.5, 0.25, 1, 0.5],
  roof: [0, 0, 0.5, 0.25], sign: [0.5, 0, 0.75, 0.25], shuttle: [0.75, 0, 1, 0.25],
};
export function makeAtlas() {
  return canvasTex(1024, 1024, (g) => {
    g.fillStyle = '#fff'; g.fillRect(0, 0, 1024, 1024);
    // 画布 y 向下，贴图 v 向上：子矩形 [u0,v0,u1,v1] → 画布 (u0*W, (1-v1)*H)
    const R = (r) => [r[0] * 1024, (1 - r[3]) * 1024, (r[2] - r[0]) * 1024, (r[3] - r[1]) * 1024];
    // —— 车厢侧面 ——
    {
      const [x, y, w, h] = R(ATLAS.car);
      g.fillStyle = '#d9d4cc'; g.fillRect(x, y, w, h);
      for (let i = 0; i < 18; i++) { // 竖向加强筋
        const xx = x + 8 + i * (w - 16) / 17;
        g.fillStyle = 'rgba(0,0,0,.16)'; g.fillRect(xx, y, 5, h);
        g.fillStyle = 'rgba(255,255,255,.25)'; g.fillRect(xx + 5, y, 2, h);
      }
      g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(x, y + h * 0.78, w, h * 0.06);
      g.fillStyle = '#ffb547'; g.fillRect(x, y + h * 0.84, w, h * 0.05);
      g.fillStyle = 'rgba(20,24,36,.85)';
      g.font = `900 ${h * 0.2}px "Noto Serif SC", "Songti SC", serif`;
      g.textBaseline = 'middle'; g.textAlign = 'left';
      g.fillText('星环货运', x + w * 0.08, y + h * 0.4);
      g.font = `600 ${h * 0.085}px "Cormorant Garamond", serif`;
      g.fillText('RING · RAIL  FREIGHT', x + w * 0.08, y + h * 0.6);
      g.font = `700 ${h * 0.07}px monospace`;
      g.fillText('XR-07 · 载重 62t', x + w * 0.62, y + h * 0.7);
      g.strokeStyle = 'rgba(20,24,36,.7)'; g.lineWidth = 6;
      g.beginPath(); g.arc(x + w * 0.83, y + h * 0.38, h * 0.12, 0, Math.PI * 2); g.stroke();
      g.beginPath(); g.ellipse(x + w * 0.83, y + h * 0.38, h * 0.19, h * 0.05, -0.4, 0, Math.PI * 2); g.stroke();
    }
    // —— 货柜瓦楞 ——
    {
      const [x, y, w, h] = R(ATLAS.cont);
      g.fillStyle = '#e8e8e8'; g.fillRect(x, y, w, h);
      for (let i = 0; i < 32; i++) {
        const xx = x + i * w / 32;
        const gr = g.createLinearGradient(xx, 0, xx + w / 32, 0);
        gr.addColorStop(0, 'rgba(0,0,0,.22)'); gr.addColorStop(0.5, 'rgba(255,255,255,.28)'); gr.addColorStop(1, 'rgba(0,0,0,.22)');
        g.fillStyle = gr; g.fillRect(xx, y, w / 32, h);
      }
      g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(x, y, w, 10); g.fillRect(x, y + h - 10, w, 10);
      g.fillStyle = 'rgba(25,25,30,.7)';
      g.font = `900 ${h * 0.16}px "Noto Serif SC", serif`; g.textBaseline = 'middle';
      g.fillText('星环物流', x + w * 0.1, y + h * 0.45);
      g.font = `700 ${h * 0.07}px monospace`;
      g.fillText('SRGU 2077·45 ✦', x + w * 0.1, y + h * 0.66);
    }
    // —— 警示条纹 ——
    {
      const [x, y, w, h] = R(ATLAS.hazard);
      g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
      g.fillStyle = '#16161c'; g.fillRect(x, y, w, h);
      g.fillStyle = '#ffb547';
      for (let i = -8; i < 24; i++) {
        g.beginPath();
        g.moveTo(x + i * 48, y + h); g.lineTo(x + i * 48 + 24, y + h); g.lineTo(x + i * 48 + 24 + h, y); g.lineTo(x + i * 48 + h, y);
        g.fill();
      }
      g.restore();
    }
    // —— 坡道格栅 ——
    {
      const [x, y, w, h] = R(ATLAS.ramp);
      g.fillStyle = '#3a4152'; g.fillRect(x, y, w, h);
      g.strokeStyle = 'rgba(0,0,0,.45)'; g.lineWidth = 3;
      for (let i = 0; i < w; i += 16) { g.beginPath(); g.moveTo(x + i, y); g.lineTo(x + i, y + h); g.stroke(); }
      for (let j = 0; j < h; j += 16) { g.beginPath(); g.moveTo(x, y + j); g.lineTo(x + w, y + j); g.stroke(); }
    }
    // —— 车顶走道 ——
    {
      const [x, y, w, h] = R(ATLAS.roof);
      g.fillStyle = '#4a5162'; g.fillRect(x, y, w, h);
      g.fillStyle = 'rgba(255,255,255,.08)';
      for (let i = 0; i < w; i += 12) g.fillRect(x + i, y, 6, h);
      g.fillStyle = '#ffb547'; g.fillRect(x, y, w, 10); g.fillRect(x, y + h - 10, w, 10);
    }
    // —— 门架标识 ——
    {
      const [x, y, w, h] = R(ATLAS.sign);
      g.fillStyle = '#101219'; g.fillRect(x, y, w, h);
      g.fillStyle = '#ff5a4a';
      g.font = `900 ${h * 0.62}px "Noto Serif SC", serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('滑', x + w * 0.5, y + h * 0.52);
      g.textAlign = 'left';
    }
    // —— 穿梭车车窗 ——
    {
      const [x, y, w, h] = R(ATLAS.shuttle);
      g.fillStyle = '#eef3f7'; g.fillRect(x, y, w, h);
      g.fillStyle = '#1a2233'; g.fillRect(x, y + h * 0.3, w, h * 0.3);
      g.fillStyle = '#9ff3ff';
      for (let i = 0; i < 6; i++) g.fillRect(x + 6 + i * w / 6, y + h * 0.34, w / 6 - 12, h * 0.22);
      g.fillStyle = '#ffb547'; g.fillRect(x, y + h * 0.72, w, h * 0.06);
    }
    // 右上角一条纯白（未贴图的部件都采样这里）
    g.fillStyle = '#fff'; g.fillRect(512, 0, 512, 30);
  });
}
