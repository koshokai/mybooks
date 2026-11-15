// 沉没之后 · 序章：海面、天空、雨与闪电（海上 / 求生 / 上岸 共用）
import * as THREE from "three";
import { GLSL_NOISE } from "./util.js";

/* ---------- 波浪：GPU 与 CPU 用同一套公式（浮力、玩家起伏都靠它）---------- */
// [方向角, 波长, 振幅, 尖锐度]；波浪整体朝 +Z 方向推进（从岛那边朝你涌来）
export const WAVES = [
  [0.0, 46, 1.25, 1.4],
  [0.55, 27, 0.7, 1.6],
  [-0.5, 16, 0.42, 1.9],
  [0.12, 9.5, 0.24, 2.0],
  [1.2, 6.2, 0.12, 2.2],
  [-1.25, 4.1, 0.07, 2.2],
];
const WD = WAVES.map(([a, L, A, s], i) => {
  const k = (Math.PI * 2) / L;
  return { dx: Math.sin(a), dz: Math.cos(a), k, A, s, w: Math.sqrt(9.8 * k) * 0.9, ph: i * 1.7 };
});
export const RHYTHM_WAVE = 3; // 划水节奏跟随的那道涌浪

export function waveAt(x, z, t, amp, out = { h: 0, gx: 0, gz: 0 }) {
  let h = 0, gx = 0, gz = 0;
  for (const W of WD) {
    const th = W.k * (W.dx * x + W.dz * z) - W.w * t + W.ph;
    const s = Math.sin(th), c = Math.cos(th);
    const f = Math.exp(W.s * (s - 1));
    h += W.A * (2 * f - 1);
    const d = W.A * 2 * f * W.s * c * W.k;
    gx += d * W.dx; gz += d * W.dz;
  }
  out.h = h * amp; out.gx = gx * amp; out.gz = gz * amp;
  return out;
}
// 节奏浪的相位（0..1，0.25 = 波峰）
export function rhythmPhase(x, z, t) {
  const W = WD[RHYTHM_WAVE];
  const th = W.k * (W.dx * x + W.dz * z) - W.w * t + W.ph;
  const p = (th / (Math.PI * 2)) % 1;
  return p < 0 ? p + 1 : p;
}
export const RHYTHM_PERIOD = (Math.PI * 2) / WD[RHYTHM_WAVE].w;

const wU = WD.map((W) => new THREE.Vector4(W.dx, W.dz, W.k, W.A));
const wB = WD.map((W) => new THREE.Vector3(W.w, W.s, W.ph));

/* ---------- 天空（共用 uniforms）---------- */
export function skyUniforms() {
  return {
    uTime: { value: 0 },
    uZen: { value: new THREE.Color(0.012, 0.016, 0.022) },
    uHor: { value: new THREE.Color(0.035, 0.042, 0.05) },
    uSunDir: { value: new THREE.Vector3(0.3, 0.1, -1).normalize() },
    uSunCol: { value: new THREE.Color(0, 0, 0) },
    uSunSize: { value: 0.0006 },
    uCloud: { value: 1 },
    uCloudLit: { value: new THREE.Color(0.07, 0.08, 0.095) },
    uCloudDark: { value: new THREE.Color(0.012, 0.015, 0.02) },
    uFlash: { value: 0 },
    uFlashDir: { value: new THREE.Vector3(0, 0.2, -1).normalize() },
    uWind: { value: 0.05 },
  };
}
const SKY_GLSL = /* glsl */ `
uniform float uTime, uSunSize, uCloud, uFlash, uWind;
uniform vec3 uZen, uHor, uSunDir, uSunCol, uCloudLit, uCloudDark, uFlashDir;
${GLSL_NOISE}
vec3 skyBase(vec3 d){
  float y = d.y;
  vec3 c = mix(uHor, uZen, smoothstep(-0.02, 0.6, y));
  float sd = max(dot(d, uSunDir), 0.0);
  float s2 = sd * sd, s4 = s2 * s2, s8 = s4 * s4, s16 = s8 * s8, s64 = s16 * s16 * s16 * s16;
  c += uSunCol * (s4 * 0.12 + s16 * 0.3 + s64 * 0.6);
  float fd = max(dot(d, uFlashDir), 0.0);
  c += uFlash * vec3(0.55, 0.6, 0.78) * (0.35 + fd * fd * 1.2);
  return c;
}
vec3 skyFull(vec3 d){
  vec3 c = skyBase(d);
  float sd = dot(d, uSunDir);
  float disc = smoothstep(1.0 - uSunSize, 1.0 - uSunSize * 0.5, sd);
  vec2 p = d.xz / (max(d.y, 0.0) + 0.1);
  vec2 wind = vec2(uTime * uWind * 0.3, uTime * uWind);
  float n = fbm(p * 0.55 + wind);
  float n2 = fbm(p * 0.55 + wind + uSunDir.xz * 0.12);
  float dens = smoothstep(0.75 - uCloud * 0.55, 1.0 - uCloud * 0.35, n) * smoothstep(-0.02, 0.18, d.y);
  float lit = clamp(0.55 + (n - n2) * 4.0, 0.0, 1.0);
  vec3 cc = mix(uCloudDark, uCloudLit, lit);
  float s2 = max(sd, 0.0); s2 *= s2; s2 *= s2;
  cc += uSunCol * s2 * 0.25 * (1.0 - dens * 0.5);
  float fd = max(dot(d, uFlashDir), 0.0);
  cc += uFlash * vec3(0.7, 0.75, 0.95) * (0.25 + fd * fd * 2.2) * (0.6 + n);
  c += uSunCol * 7.0 * disc * (1.0 - dens * 0.85);
  return mix(c, cc, dens);
}
`;

export function makeSky(U) {
  const mat = new THREE.ShaderMaterial({
    uniforms: U, side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: "varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: SKY_GLSL + "varying vec3 vP; void main(){ vec3 d = normalize(vP); gl_FragColor = vec4(skyFull(d), 1.0); }",
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(900, 48, 24), mat);
  mesh.renderOrder = 10; mesh.frustumCulled = false;
  return mesh;
}

/* ---------- 海面 ---------- */
// 网格越靠近中心越密：近处细节足、远处顶点少
function oceanGeometry(N, R) {
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array((N + 1) * (N + 1) * 3);
  const map = (u) => Math.sign(u) * u * u * R;
  let k = 0;
  for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
    const u = (i / N) * 2 - 1, v = (j / N) * 2 - 1;
    pos[k++] = map(u); pos[k++] = 0; pos[k++] = map(v);
  }
  const idx = [];
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const a = j * (N + 1) + i, b = a + 1, c = a + N + 1, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), R * 1.5);
  return g;
}

export function makeOcean(skyU, { N = 220, R = 700 } = {}) {
  const U = {
    ...skyU,
    uAmp: { value: 1 },
    uW: { value: wU }, uWB: { value: wB },
    uDeep: { value: new THREE.Color(0.006, 0.014, 0.02) },
    uScatter: { value: new THREE.Color(0.02, 0.05, 0.055) },
    uFoam: { value: 0.8 },
    uFogCol: { value: new THREE.Color(0.03, 0.036, 0.045) },
    uFogD: { value: 0.006 },
    uGlint: { value: 0 },
    uDetail: { value: 1 },
    uLight: { value: 0.3 },
  };
  const waveFn = /* glsl */ `
    uniform vec4 uW[6]; uniform vec3 uWB[6]; uniform float uAmp;
    void waves(vec2 p, out float h, out vec2 g){
      h = 0.0; g = vec2(0.0);
      for (int i = 0; i < 6; i++){
        vec4 w = uW[i]; vec3 b = uWB[i];
        float th = w.z * dot(w.xy, p) - b.x * uTime + b.z;
        float s = sin(th), c = cos(th);
        float f = exp(b.y * (s - 1.0));
        h += w.w * (2.0 * f - 1.0);
        g += (w.w * 2.0 * f * b.y * c * w.z) * w.xy;
      }
      h *= uAmp; g *= uAmp;
    }`;
  const mat = new THREE.ShaderMaterial({
    uniforms: U,
    vertexShader: /* glsl */ `
      uniform float uTime;
      ${waveFn}
      varying vec3 vW; varying float vH;
      void main(){
        vec4 w = modelMatrix * vec4(position, 1.0);
        float h; vec2 g; waves(w.xz, h, g);
        w.y += h; vH = h; vW = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      ${SKY_GLSL}
      ${waveFn}
      uniform vec3 uDeep, uScatter, uFogCol; uniform float uFoam, uFogD, uGlint, uDetail, uLight;
      varying vec3 vW; varying float vH;
      void main(){
        float h; vec2 g; waves(vW.xz, h, g);
        float dist = length(vW - cameraPosition);
        float det = uDetail * exp(-dist * 0.02);
        vec2 q = vW.xz * 0.45 + vec2(uTime * 0.12, uTime * 0.35);
        float e = 0.2;
        float n0 = fbm3(q), nx = fbm3(q + vec2(e, 0.0)), nz = fbm3(q + vec2(0.0, e));
        vec2 q2 = vW.xz * 1.7 - vec2(uTime * 0.3, uTime * 0.6);
        float m0 = vnoise(q2), mx = vnoise(q2 + vec2(e, 0.0)), mz = vnoise(q2 + vec2(0.0, e));
        vec2 dn = vec2(nx - n0, nz - n0) * 2.2 + vec2(mx - m0, mz - m0) * 0.9;
        vec3 n = normalize(vec3(-g.x - dn.x * det, 1.0, -g.y - dn.y * det));
        vec3 v = normalize(cameraPosition - vW);
        float ndv = max(dot(n, v), 0.0);
        float fr = 0.02 + 0.98 * pow5(1.0 - ndv);
        vec3 r = reflect(-v, n); r.y = max(abs(r.y), 0.02); r = normalize(r);
        vec3 refl = skyBase(r);
        float crest = clamp(h / (2.4 * uAmp + 0.05) * 0.5 + 0.5, 0.0, 1.0);
        vec3 water = uDeep + uScatter * crest * (0.4 + uLight);
        vec3 col = mix(water, refl, fr);
        float sp = max(dot(r, uSunDir), 0.0);
        float s2 = sp * sp, s4 = s2 * s2, s8 = s4 * s4, s16 = s8 * s8, s64 = s16 * s16 * s16 * s16;
        col += uSunCol * (s64 * s64 * 6.0 + s16 * 0.08) * uGlint;
        float fn = fbm3(vW.xz * 0.8 + vec2(uTime * 0.2, uTime * 0.5));
        float foam = smoothstep(0.8, 1.0, crest + fn * 0.3 - 0.12 + length(g) * 0.05) * uFoam;
        foam += smoothstep(0.72, 0.9, fn) * smoothstep(0.55, 0.8, crest) * 0.25 * uFoam;
        vec3 foamCol = vec3(0.55, 0.6, 0.65) * (0.12 + uLight) + uFlash * vec3(0.5, 0.55, 0.7);
        col = mix(col, foamCol, foam * 0.75);
        col += uFlash * vec3(0.25, 0.28, 0.36) * (0.25 + fr);
        float fog = 1.0 - exp(-dist * uFogD);
        col = mix(col, uFogCol + uFlash * vec3(0.3, 0.33, 0.42), fog);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(oceanGeometry(N, R), mat);
  mesh.frustumCulled = false;
  return { mesh, U };
}

/* ---------- 雨 ---------- */
export function makeRain(count = 1400) {
  const seeds = new Float32Array(count * 2 * 3), ends = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    const s = [Math.random(), Math.random(), Math.random()];
    for (let k = 0; k < 2; k++) { seeds.set(s, (i * 2 + k) * 3); ends[i * 2 + k] = k; }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(seeds, 3));
  g.setAttribute("aEnd", new THREE.BufferAttribute(ends, 1));
  const U = { uTime: { value: 0 }, uCenter: { value: new THREE.Vector3() }, uWind: { value: new THREE.Vector2(3, 6) }, uFlash: { value: 0 }, uOpacity: { value: 0.5 }, uLight: { value: 0.1 } };
  const mat = new THREE.ShaderMaterial({
    uniforms: U, transparent: true, depthWrite: false,
    vertexShader: /* glsl */ `
      uniform float uTime; uniform vec3 uCenter; uniform vec2 uWind; attribute float aEnd; varying float vA;
      void main(){
        vec3 box = vec3(26.0, 16.0, 26.0);
        float sp = 15.0 + position.z * 4.0;
        vec3 vel = vec3(uWind.x, -sp, uWind.y);
        float y = mod(position.y * box.y - uTime * sp, box.y);
        vec3 p;
        p.x = mod(position.x * box.x + uWind.x * uTime * 1.0 - uCenter.x, box.x) - box.x * 0.5 + uCenter.x;
        p.z = mod(position.z * box.z + uWind.y * uTime * 1.0 - uCenter.z, box.z) - box.z * 0.5 + uCenter.z;
        p.y = uCenter.y - 4.0 + y;
        p -= normalize(vel) * aEnd * 0.55;
        vA = 1.0 - aEnd * 0.8;
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */ `uniform float uFlash, uOpacity, uLight; varying float vA;
      void main(){ vec3 c = vec3(0.55, 0.6, 0.7) * (0.25 + uLight) + uFlash * vec3(0.8, 0.85, 1.0); gl_FragColor = vec4(c, vA * uOpacity); }`,
  });
  const lines = new THREE.LineSegments(g, mat);
  lines.frustumCulled = false; lines.renderOrder = 20;
  return { mesh: lines, U };
}

/* ---------- 闪电 ---------- */
export function makeBolt() {
  const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 3.3, 4.2), toneMapped: false, transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(new THREE.BufferGeometry(), mat);
  mesh.frustumCulled = false; mesh.visible = false; mesh.renderOrder = 15;
  let life = 0;
  let px = 1, pz = 0;
  function ribbon(pts, w, out) {
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const ww = w * (1 - i / pts.length * 0.6), wx = ww * px, wz = ww * pz;
      out.push(a.x - wx, a.y, a.z - wz, a.x + wx, a.y, a.z + wz, b.x - wx, b.y, b.z - wz, b.x - wx, b.y, b.z - wz, a.x + wx, a.y, a.z + wz, b.x + wx, b.y, b.z + wz);
    }
  }
  return {
    mesh,
    strike(center, az, dist, height = 90) {
      const base = new THREE.Vector3(center.x + Math.sin(az) * dist, 0, center.z - Math.cos(az) * dist);
      px = Math.cos(az); pz = Math.sin(az);
      const pts = []; const j0 = (Math.random() - 0.5) * 20; let p = new THREE.Vector3(base.x + j0 * px, height, base.z + j0 * pz);
      const n = 14;
      const verts = [];
      for (let i = 0; i <= n; i++) {
        pts.push(p.clone());
        const j = (Math.random() - 0.5) * height * 0.12;
        p = new THREE.Vector3(p.x + j * px + (base.x - p.x) * 0.15, height * (1 - (i + 1) / n), p.z + j * pz + (base.z - p.z) * 0.15);
        if (i > 3 && i < 10 && Math.random() < 0.3) {
          const br = [pts[i].clone()]; let q = pts[i].clone();
          const sgn = Math.random() < 0.5 ? -1 : 1;
          for (let k = 0; k < 4; k++) { const j2 = sgn * (Math.random() * 0.8 + 0.2) * height * 0.06; q = q.clone().add(new THREE.Vector3(j2 * px, -height * 0.05, j2 * pz)); br.push(q); }
          ribbon(br, 0.25, verts);
        }
      }
      ribbon(pts, 0.6, verts);
      // 让宽度方向大致垂直于视线：整体绕 Y 转到面向中心
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
      mesh.geometry.dispose(); mesh.geometry = geo;
      mesh.position.set(0, 0, 0);
      mesh.visible = true; life = 0.32;
      const dir = new THREE.Vector3(Math.sin(az), 0.25, -Math.cos(az)).normalize();
      return dir;
    },
    update(dt) {
      if (life <= 0) { mesh.visible = false; return; }
      life -= dt;
      mat.opacity = life > 0.2 ? 1 : (Math.sin(life * 90) > 0 ? 0.9 : 0.15) * (life / 0.2);
      mesh.visible = life > 0;
    },
  };
}
