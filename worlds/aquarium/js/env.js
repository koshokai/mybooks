// 缸体与环境：房间、灯具、玻璃（含藻类贴图）、水面涟漪、光柱、悬浮微粒、气泡、昼夜灯光
import * as THREE from "three";
import { T, U, col, clamp, lerp, smooth } from "./gfx.js";
import { AG, algaeMult } from "./state.js";

/* ---------------- 昼夜关键帧 ---------------- */
const K = {
  night: { sun: 0.16, sunC: "#8ea6ff", sky: "#22355e", gnd: "#0a0c14", hemi: 0.42, top: "#040a18", bot: "#0b1d3c", fog: "#061428", ck: 0.05, cc: "#8fb0ff", rays: 0.0, exp: 1.0, rim: 0.35, lamp: "#2a3e8a", lampK: 0.5, n: 1, pc: "#6f86c8" },
  dawn: { sun: 1.5, sunC: "#ffb48c", sky: "#ffc7a6", gnd: "#2a2018", hemi: 0.62, top: "#0c1424", bot: "#a0705a", fog: "#1c2630", ck: 0.5, cc: "#ffd2a4", rays: 0.32, exp: 1.0, rim: 0.5, lamp: "#ffc79a", lampK: 1.6, n: 0.35, pc: "#ffd8b8" },
  day: { sun: 3.3, sunC: "#fff7ea", sky: "#cfeaff", gnd: "#2a2014", hemi: 0.5, top: "#06161c", bot: "#3f7a78", fog: "#12343c", ck: 1.0, cc: "#fff3da", rays: 0.55, exp: 1.05, rim: 0.7, lamp: "#fffaf0", lampK: 1.7, n: 0, pc: "#ffffff" },
  dusk: { sun: 1.5, sunC: "#ff9c6c", sky: "#ffb28f", gnd: "#2a1c18", hemi: 0.58, top: "#0c1020", bot: "#9a5a4a", fog: "#1c1e2c", ck: 0.48, cc: "#ffb68a", rays: 0.3, exp: 1.0, rim: 0.5, lamp: "#ffb27a", lampK: 1.5, n: 0.35, pc: "#ffc8a8" },
};
const KEYS = [[0, "night"], [5.5, "night"], [6.6, "dawn"], [8.4, "day"], [17.3, "day"], [18.8, "dusk"], [20.3, "night"], [24, "night"]];
const cA = new THREE.Color(), cB = new THREE.Color();
function lightAt(h) {
  let i = 0; while (i < KEYS.length - 2 && h >= KEYS[i + 1][0]) i++;
  const [h0, a] = KEYS[i], [h1, b] = KEYS[i + 1];
  const t = smooth(0, 1, (h - h0) / Math.max(0.001, h1 - h0));
  const A = K[a], B = K[b], o = {};
  for (const k in A) {
    if (typeof A[k] === "number") o[k] = lerp(A[k], B[k], t);
    else o[k] = cA.set(A[k]).lerp(cB.set(B[k]), t).clone();
  }
  return o;
}
export function phaseName(h) {
  if (h >= 5.5 && h < 8.4) return "清晨"; if (h >= 8.4 && h < 17.3) return "白天"; if (h >= 17.3 && h < 20.3) return "黄昏"; return "夜晚";
}

/* ---------------- 着色器 ---------------- */
const vsBasic = /* glsl */ `varying vec2 vUv; varying vec3 vW; varying vec3 vN;
void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }`;

export class Env {
  constructor(scene) {
    this.scene = scene;
    this.ripples = Array.from({ length: 10 }, () => new THREE.Vector4(0, 0, -99, 0));
    this.ripI = 0;
    this.light = lightAt(12);
    this.water = 100;
    this.buildLights(); this.buildRoom(); this.buildBackPanel(); this.buildGlass(); this.buildSurface(); this.buildRays(); this.buildParticles(); this.buildBubbles();
  }

  buildLights() {
    const s = this.scene;
    this.sun = new THREE.DirectionalLight(0xffffff, 2); this.sun.position.set(-2, 12, 3); s.add(this.sun);
    this.hemi = new THREE.HemisphereLight(0xcfeaff, 0x4a3f2a, 0.9); s.add(this.hemi);
    this.rim = new THREE.DirectionalLight(0xbfe4ff, 0.6); this.rim.position.set(1, 3, -8); s.add(this.rim);
    this.front = new THREE.DirectionalLight(0xffffff, 0.25); this.front.position.set(0, 2, 10); s.add(this.front);
  }

  buildRoom() {
    const s = this.scene;
    // 背景墙：被鱼缸映亮的柔光
    this.wallU = { uCol: { value: new THREE.Color() }, uK: { value: 1 } };
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(120, 60), new THREE.ShaderMaterial({
      uniforms: this.wallU, depthWrite: false, fog: false,
      vertexShader: vsBasic,
      fragmentShader: /* glsl */ `uniform vec3 uCol; varying vec2 vUv; varying vec3 vW;
        void main(){ vec2 p = vec2(vW.x / 16.0, (vW.y - 3.0) / 10.0); float d = length(p);
          vec3 base = vec3(0.012, 0.016, 0.026);
          vec3 c = base + uCol * (0.30 * exp(-d * d * 2.2) + 0.05 * exp(-d * 0.8));
          gl_FragColor = vec4(c, 1.0); }`,
    }));
    wall.position.set(0, 3, -14); s.add(wall);
    // 柜子
    const wood = new THREE.MeshStandardMaterial({ color: 0x1b1511, roughness: 0.62, metalness: 0.05 }); wood.fog = false;
    const cab = new THREE.Mesh(new THREE.BoxGeometry(T.W + 0.9, 7, T.D + 0.9), wood); cab.position.set(0, -3.62, 0); s.add(cab);
    const topM = new THREE.MeshStandardMaterial({ color: 0x2a211b, roughness: 0.4, metalness: 0.1 }); topM.fog = false;
    const slab = new THREE.Mesh(new THREE.BoxGeometry(T.W + 1.1, 0.24, T.D + 1.1), topM); slab.position.set(0, -0.12, 0); s.add(slab);
    // 柜门缝
    const lineM = new THREE.MeshBasicMaterial({ color: 0x0a0806 }); lineM.fog = false;
    const seam = new THREE.Mesh(new THREE.BoxGeometry(0.03, 6.4, 0.02), lineM); seam.position.set(0, -3.6, T.D / 2 + 0.46); s.add(seam);
    // 吊灯
    const alu = new THREE.MeshStandardMaterial({ color: 0x2c3036, roughness: 0.35, metalness: 0.8 }); alu.fog = false;
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(T.W - 0.3, 0.14, 1.5), alu); lamp.position.set(0, 7.15, 0.2); s.add(lamp);
    this.lampM = new THREE.MeshBasicMaterial({ color: 0xffffff }); this.lampM.fog = false;
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(T.W - 0.6, 1.25), this.lampM); strip.rotation.x = Math.PI / 2; strip.position.set(0, 7.075, 0.2); s.add(strip);
    const cable = new THREE.MeshBasicMaterial({ color: 0x0c0d10 }); cable.fog = false;
    for (const x of [-3.6, 3.6]) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 20, 4), cable); c.position.set(x, 17.2, 0.2); s.add(c); }
  }

  buildBackPanel() {
    this.backU = { uTop: { value: new THREE.Color() }, uBot: { value: new THREE.Color() }, uTime: U.uTime };
    const m = new THREE.ShaderMaterial({
      uniforms: this.backU, fog: false, vertexShader: vsBasic,
      fragmentShader: /* glsl */ `uniform vec3 uTop; uniform vec3 uBot; uniform float uTime; varying vec2 vUv;
        void main(){ float y = vUv.y; vec3 c = mix(uBot, uTop, smoothstep(0.02, 1.0, y));
          float cx = 1.0 - pow(abs(vUv.x - 0.5) * 2.0, 2.4) * 0.35;
          float glow = exp(-pow((y - 0.18) * 2.6, 2.0)) * 0.18;
          c = c * cx + uBot * glow;
          c *= 0.96 + 0.04 * sin(vUv.x * 9.0 + uTime * 0.2) * sin(y * 7.0 - uTime * 0.13);
          // 远处水草的朦胧剪影
          float x = vUv.x;
          float stems = 0.0;
          for (int i = 0; i < 3; i++) {
            float fi = float(i);
            float sx = x * (9.0 + fi * 7.0) + fi * 3.7;
            float h = 0.35 + 0.35 * fract(sin(floor(sx) * 12.9898 + fi) * 43758.5);
            float wv = sin(y * (14.0 + fi * 6.0) + floor(sx) * 2.0 + uTime * 0.3) * 0.18;
            float blade = smoothstep(0.42, 0.12, abs(fract(sx + wv * y) - 0.5)) * smoothstep(h, h - 0.25, y);
            stems = max(stems, blade * (0.75 - fi * 0.18));
          }
          vec3 sil = mix(uBot, uTop, 0.75) * 0.35;
          c = mix(c, sil, stems * 0.85);
          gl_FragColor = vec4(c, 1.0); }`,
    });
    const p = new THREE.Mesh(new THREE.PlaneGeometry(T.W - 0.02, T.H - 0.02), m);
    p.position.set(0, T.H / 2, T.Z0 - 0.06); this.scene.add(p);
  }

  buildGlass() {
    const s = this.scene;
    // 藻类贴图
    this.algaeCanvas = document.createElement("canvas");
    this.algaeCanvas.width = 256; this.algaeCanvas.height = 154;
    this.algaeCtx = this.algaeCanvas.getContext("2d");
    this.algaeImg = this.algaeCtx.createImageData(256, 154);
    this.algaeNoise = new Float32Array(256 * 154);
    for (let y = 0; y < 154; y++) for (let x = 0; x < 256; x++) {
      const u = x / 24, v = y / 24;
      const n = Math.sin(u * 1.7 + Math.sin(v * 2.3) * 1.5) * Math.cos(v * 1.9 + Math.sin(u * 1.1) * 1.3) * 0.5
        + Math.sin(u * 4.3 + v * 3.1) * Math.sin(v * 5.2 - u * 2.2) * 0.3 + (Math.random() - 0.5) * 0.22;
      this.algaeNoise[y * 256 + x] = n;
    }
    this.algaeTex = new THREE.CanvasTexture(this.algaeCanvas);
    this.algaeTex.colorSpace = THREE.SRGBColorSpace;
    this.glassU = {
      map: { value: this.algaeTex }, uTime: U.uTime, uLight: { value: 1 }, uWipe: { value: -10 }, uWater: { value: T.WATER / T.H }, uRefl: { value: new THREE.Color(0.7, 0.85, 0.95) },
    };
    const glassFrag = (front) => /* glsl */ `uniform sampler2D map; uniform float uTime; uniform float uLight; uniform float uWipe; uniform float uWater; uniform vec3 uRefl;
      varying vec2 vUv; varying vec3 vW; varying vec3 vN;
      void main(){
        vec3 V = normalize(cameraPosition - vW);
        float fr = pow(1.0 - abs(dot(V, vN)), 3.0);
        float band = smoothstep(0.0, 0.25, vUv.y) * 0.4 + 0.6;
        float streak = smoothstep(0.92, 1.0, sin((vUv.x * 1.6 + vUv.y * 0.9) * 6.28318 * 1.5)) * 0.06;
        float a = fr * 0.38 + 0.018 + streak * 0.5;
        vec3 c = uRefl * (fr * 0.55 + streak) * band * uLight;
        float wl = exp(-pow((vUv.y - uWater) * 900.0, 2.0));
        float wl2 = exp(-pow((vUv.y - uWater + 0.004) * 260.0, 2.0)) * 0.35;
        c += vec3(0.75, 0.9, 1.0) * (wl * 0.8 + wl2) * uLight; a += wl * 0.6 + wl2 * 0.4;
        ${front ? `vec4 al = texture2D(map, vUv);
        vec3 ac = al.rgb * (0.25 + 0.75 * uLight);
        c = mix(c, ac, al.a); a = max(a, al.a);
        float sw = uTime - uWipe; float sweep = exp(-pow((vUv.x + vUv.y * 0.4 - sw * 0.9 + 0.3) * 6.0, 2.0)) * step(0.0, sw) * step(sw, 2.2);
        c += vec3(1.0) * sweep * 0.35 * uLight; a += sweep * 0.2;` : ""}
        gl_FragColor = vec4(c, clamp(a, 0.0, 1.0));
      }`;
    const mk = (front) => new THREE.ShaderMaterial({ uniforms: this.glassU, transparent: true, depthWrite: false, vertexShader: vsBasic, fragmentShader: glassFrag(front), side: front ? THREE.FrontSide : THREE.DoubleSide });
    const fg = new THREE.Mesh(new THREE.PlaneGeometry(T.W, T.H), mk(true));
    fg.position.set(0, T.H / 2, T.Z1 + 0.012); fg.renderOrder = 10; s.add(fg); this.frontGlass = fg;
    const side = mk(false);
    for (const sx of [-1, 1]) {
      const g = new THREE.Mesh(new THREE.PlaneGeometry(T.D, T.H), side);
      g.rotation.y = sx * Math.PI / 2; g.position.set(sx * (T.X1 + 0.012), T.H / 2, 0); g.renderOrder = 9; s.add(g);
    }
    // 玻璃边（超白玻璃的青绿色断面）
    const edgeM = new THREE.MeshStandardMaterial({ color: 0x9fe0d2, transparent: true, opacity: 0.42, roughness: 0.08, metalness: 0.1, emissive: 0x1d5a50, emissiveIntensity: 0.5, depthWrite: false });
    edgeM.fog = false;
    const e = 0.07, add = (w, h, d, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), edgeM); m.position.set(x, y, z); m.renderOrder = 11; s.add(m); };
    for (const x of [T.X0, T.X1]) for (const z of [T.Z0, T.Z1]) add(e, T.H, e, x, T.H / 2, z);
    for (const y of [0.02, T.H]) { for (const z of [T.Z0, T.Z1]) add(T.W + e, e, e, 0, y, z); for (const x of [T.X0, T.X1]) add(e, e, T.D, x, y, 0); }
    // 底玻璃
    const bm = new THREE.MeshStandardMaterial({ color: 0x0d1612, roughness: 0.3 }); bm.fog = false;
    const bottom = new THREE.Mesh(new THREE.BoxGeometry(T.W + 0.04, 0.05, T.D + 0.04), bm); bottom.position.y = 0.0; s.add(bottom);
    this.drawAlgae(new Array(AG.X * AG.Y).fill(0));
  }

  /** 把藻类网格画到前玻璃贴图上 */
  drawAlgae(grid) {
    const W = 256, H = 154, d = this.algaeImg.data, N = this.algaeNoise;
    for (let y = 0; y < H; y++) {
      const gy = (1 - y / (H - 1)) * (AG.Y - 1), j0 = Math.floor(gy), j1 = Math.min(AG.Y - 1, j0 + 1), fy = gy - j0;
      for (let x = 0; x < W; x++) {
        const gx = (x / (W - 1)) * (AG.X - 1), i0 = Math.floor(gx), i1 = Math.min(AG.X - 1, i0 + 1), fx = gx - i0;
        const a = (grid[j0 * AG.X + i0] * (1 - fx) + grid[j0 * AG.X + i1] * fx) * (1 - fy) + (grid[j1 * AG.X + i0] * (1 - fx) + grid[j1 * AG.X + i1] * fx) * fy;
        const n = N[y * W + x];
        const v = clamp((a * 1.25 + n * 0.55 - 0.32) * 2.2, 0, 1) * Math.min(1, a * 3);
        const k = (y * W + x) * 4;
        d[k] = 70 + n * 40; d[k + 1] = 118 + n * 30 - v * 12; d[k + 2] = 46 + n * 10; d[k + 3] = v * 205;
      }
    }
    this.algaeCtx.putImageData(this.algaeImg, 0, 0);
    this.algaeTex.needsUpdate = true;
  }

  buildSurface() {
    const g = new THREE.PlaneGeometry(T.W, T.D, 80, 40); g.rotateX(-Math.PI / 2);
    this.surfU = {
      uTime: U.uTime, uRip: { value: this.ripples }, uSky: { value: new THREE.Color() }, uDeep: { value: new THREE.Color() }, uSun: { value: new THREE.Color() }, uK: { value: 1 },
    };
    const H = /* glsl */ `uniform float uTime; uniform vec4 uRip[10];
      float H(vec2 p){
        float h = 0.012 * sin(p.x * 2.1 + uTime * 1.3) + 0.010 * sin(p.y * 2.7 - uTime * 1.1) + 0.006 * sin((p.x + p.y) * 4.3 + uTime * 2.1) + 0.004 * sin((p.x * 1.7 - p.y) * 7.0 - uTime * 2.7);
        for (int i = 0; i < 10; i++) { vec4 r = uRip[i]; float age = uTime - r.z;
          if (age > 0.0 && age < 4.0) { float d = length(p - r.xy); float f = age * 1.5; h += r.w * 0.05 * sin((d - f) * 10.0) * exp(-abs(d - f) * 2.2) * exp(-age * 0.95); } }
        return h; }`;
    const m = new THREE.ShaderMaterial({
      uniforms: this.surfU, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      vertexShader: H + /* glsl */ `varying vec3 vW; void main(){ vec3 p = position; vec4 w = modelMatrix * vec4(p, 1.0); w.y += H(w.xz); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: H + /* glsl */ `uniform vec3 uSky; uniform vec3 uDeep; uniform vec3 uSun; uniform float uK; varying vec3 vW;
        void main(){
          float e = 0.03; vec2 q = vW.xz;
          vec3 n = normalize(vec3(-(H(q + vec2(e, 0.0)) - H(q - vec2(e, 0.0))) / (2.0 * e) * 2.2, 1.0, -(H(q + vec2(0.0, e)) - H(q - vec2(0.0, e))) / (2.0 * e) * 2.2));
          vec3 V = normalize(cameraPosition - vW);
          bool below = cameraPosition.y < vW.y;
          vec3 c; float a;
          vec3 L = normalize(vec3(-0.2, 1.0, 0.25));
          if (below) {
            n = -n; float ndv = max(dot(n, V), 0.0);
            float win = smoothstep(0.62, 0.72, ndv);
            float shimmer = 0.5 + 0.5 * sin(q.x * 5.0 + n.x * 30.0 + uTime) * sin(q.y * 4.0 + n.z * 30.0);
            vec3 mirror = mix(uDeep * 0.9, uSky * 0.3, 0.12 + 0.2 * shimmer);
            c = mix(mirror, uSky * 1.25, win);
            vec3 Rt = refract(-V, n, 1.33);
            float sp = pow(max(dot(normalize(Rt + vec3(0.0001)), L), 0.0), 60.0) * win;
            float glint = pow(max(0.0, sin(n.x * 80.0 + uTime * 0.7) * sin(n.z * 80.0 - uTime * 0.5)), 24.0);
            c += uSun * (sp * 1.2 + glint * 0.5 * (1.0 - win));
            a = mix(0.82, 0.38, win) * uK;
          } else {
            float ndv = max(dot(n, V), 0.0); float fr = 0.03 + 0.97 * pow(1.0 - ndv, 5.0);
            vec3 R = reflect(-V, n);
            float sp = pow(max(dot(R, L), 0.0), 220.0);
            c = uSky * fr * 1.2 + uSun * sp * 3.0; a = clamp(0.12 + fr * 0.7 + sp, 0.0, 1.0) * uK;
          }
          gl_FragColor = vec4(c, a);
        }`,
    });
    const s = new THREE.Mesh(g, m); s.position.y = T.WATER; s.renderOrder = 5; this.scene.add(s); this.surface = s;
  }

  ripple(x, z, amp = 1) {
    const r = this.ripples[this.ripI++ % this.ripples.length];
    r.set(x, z, U.uTime.value, amp);
  }

  buildRays() {
    this.rays = [];
    this.rayU = { uK: { value: 1 }, uCol: { value: new THREE.Color() } };
    const geo = new THREE.PlaneGeometry(1, 1, 1, 1); geo.translate(0, -0.5, 0);
    const specs = [[-3.2, -1.2, 2.6], [-1.0, 0.4, 1.8], [0.9, -1.8, 3.2], [2.8, -0.4, 2.2], [4.0, 1.0, 1.6], [-4.1, 0.9, 1.4], [0.2, 1.6, 1.6]];
    specs.forEach(([x, z, w], i) => {
      const m = new THREE.ShaderMaterial({
        uniforms: { ...this.rayU, uTime: U.uTime, uSeed: { value: i * 3.7 + 1 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
        vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: /* glsl */ `uniform float uK; uniform vec3 uCol; uniform float uTime; uniform float uSeed; varying vec2 vUv;
          void main(){ float x = vUv.x;
            float s = smoothstep(0.1, 1.0, sin(x * 9.0 + uSeed + uTime * 0.13) * 0.5 + 0.5) * 0.6 + smoothstep(0.3, 1.0, sin(x * 23.0 + uSeed * 2.1 - uTime * 0.21) * 0.5 + 0.5) * 0.5;
            s *= smoothstep(0.0, 0.3, x) * smoothstep(1.0, 0.7, x);
            float breathe = 0.65 + 0.35 * sin(uTime * 0.31 + uSeed * 1.7);
            float a = s * pow(vUv.y, 1.5) * uK * breathe * 0.16;
            gl_FragColor = vec4(uCol * a, 1.0); }`,
      });
      const p = new THREE.Mesh(geo, m);
      p.scale.set(w, T.WATER - 0.2, 1); p.position.set(x, T.WATER, z); p.rotation.z = -0.22; p.renderOrder = 2;
      this.scene.add(p); this.rays.push(p);
    });
  }

  buildParticles() {
    const N = 420, pos = new Float32Array(N * 3), seed = new Float32Array(N * 4);
    for (let i = 0; i < N; i++) {
      pos[i * 3] = T.X0 + Math.random() * T.W; pos[i * 3 + 1] = 0.4 + Math.random() * (T.WATER - 0.5); pos[i * 3 + 2] = T.Z0 + Math.random() * T.D;
      seed.set([Math.random(), Math.random(), Math.random(), Math.random()], i * 4);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3)); g.setAttribute("aS", new THREE.BufferAttribute(seed, 4));
    this.partU = { uTime: U.uTime, uCol: { value: new THREE.Color() }, uScale: { value: 400 }, uDirt: { value: 0 } };
    const m = new THREE.ShaderMaterial({
      uniforms: this.partU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `uniform float uTime; uniform float uScale; uniform float uDirt; attribute vec4 aS; varying float vA;
        void main(){ vec3 p = position;
          p.x += sin(uTime * (0.05 + aS.x * 0.08) + aS.y * 30.0) * 0.5;
          p.y += sin(uTime * (0.04 + aS.z * 0.05) + aS.x * 20.0) * 0.35;
          p.z += cos(uTime * (0.05 + aS.y * 0.06) + aS.z * 10.0) * 0.4;
          p.x = clamp(p.x, -4.95, 4.95); p.z = clamp(p.z, -2.45, 2.45); p.y = clamp(p.y, 0.3, 5.5);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          float tw = pow(max(0.0, sin(uTime * (0.4 + aS.w) + aS.y * 50.0)), 30.0);
          float show = step(aS.w, 0.35 + uDirt * 0.6);
          vA = (0.22 + 0.5 * aS.z + tw * 1.6) * show;
          gl_PointSize = (0.008 + 0.012 * aS.x + tw * 0.012) * uScale / -mv.z;
          gl_Position = projectionMatrix * mv; }`,
      fragmentShader: /* glsl */ `uniform vec3 uCol; uniform float uDirt; varying float vA;
        void main(){ float d = length(gl_PointCoord - 0.5) * 2.0; float a = smoothstep(1.0, 0.0, d); a *= a;
          vec3 c = mix(uCol, vec3(0.75, 0.7, 0.45), uDirt * 0.6);
          gl_FragColor = vec4(c * a * vA * 0.55, 1.0); }`,
    });
    this.particles = new THREE.Points(g, m); this.particles.renderOrder = 3; this.particles.frustumCulled = false;
    this.scene.add(this.particles);
  }

  buildBubbles() {
    // 气泡石 + 气管
    this.stone = new THREE.Group();
    const sm = new THREE.MeshStandardMaterial({ color: 0x40464a, roughness: 0.95 });
    const st = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.19, 0.14, 20), sm); st.position.y = 0.07; this.stone.add(st);
    const tubeM = new THREE.MeshStandardMaterial({ color: 0xcfe8e2, transparent: true, opacity: 0.35, roughness: 0.1, depthWrite: false });
    this.tube = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 1, 8), tubeM); this.stone.add(this.tube);
    this.stone.position.set(4.25, 1, -2.05); this.scene.add(this.stone);
    this.stoneXZ = [4.25, -2.05];
    const mk = (N, pearl) => {
      const g = new THREE.BufferGeometry(), p = new Float32Array(N * 3), s = new Float32Array(N * 4);
      for (let i = 0; i < N; i++) { s.set([Math.random(), Math.random(), Math.random(), Math.random()], i * 4); }
      g.setAttribute("position", new THREE.BufferAttribute(p, 3)); g.setAttribute("aS", new THREE.BufferAttribute(s, 4));
      const u = { uTime: U.uTime, uScale: { value: 400 }, uTop: { value: T.WATER }, uK: { value: 1 }, uCol: { value: new THREE.Color(1, 1, 1) }, uBase: { value: 1 }, uRise: { value: pearl ? 2.4 : 5 } };
      const m = new THREE.ShaderMaterial({
        uniforms: u, transparent: true, depthWrite: false,
        vertexShader: /* glsl */ `uniform float uTime; uniform float uScale; uniform float uTop; uniform float uBase; uniform float uRise; attribute vec4 aS; varying float vA;
          void main(){ vec3 p = position;
            float sp = ${pearl ? "0.35 + aS.x * 0.3" : "0.75 + aS.x * 0.55"};
            float span = ${pearl ? "uRise * (0.5 + aS.y)" : "(uTop - p.y)"};
            float y = mod(uTime * sp + aS.y * 40.0, span + 0.4);
            p.y += y;
            p.x += sin(uTime * (5.0 + aS.z * 4.0) + aS.w * 30.0) * 0.03 * (0.3 + y * 0.25) + (aS.z - 0.5) * y * ${pearl ? "0.05" : "0.09"};
            p.z += cos(uTime * (4.0 + aS.w * 3.0) + aS.z * 20.0) * 0.03 * (0.3 + y * 0.2);
            vA = smoothstep(0.0, 0.15, y) * (1.0 - step(uTop - 0.02, p.y)) * ${pearl ? "smoothstep(span + 0.4, span * 0.6, y)" : "1.0"};
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            gl_PointSize = (${pearl ? "0.025 + aS.w * 0.02" : "0.03 + aS.w * 0.045 + y * 0.005"}) * uScale / -mv.z;
            gl_Position = projectionMatrix * mv; }`,
        fragmentShader: /* glsl */ `uniform float uK; uniform vec3 uCol; varying float vA;
          void main(){ vec2 q = gl_PointCoord - 0.5; float d = length(q) * 2.0; if (d > 1.0) discard;
            float rim = smoothstep(0.55, 0.95, d) * smoothstep(1.0, 0.9, d);
            float hl = smoothstep(0.32, 0.0, length(q - vec2(-0.16, -0.16)));
            float a = (rim * 0.7 + hl * 0.9 + 0.08) * vA * uK;
            gl_FragColor = vec4(uCol * (0.7 + hl * 1.6), a); }`,
      });
      const pts = new THREE.Points(g, m); pts.frustumCulled = false; pts.renderOrder = 4;
      return { pts, u };
    };
    const b = mk(70, false);
    this.bub = b; this.scene.add(b.pts);
    const pr = mk(160, true);
    this.pearl = pr; this.scene.add(pr.pts);
    this.bubTimer = 0;
  }

  setStoneGround(y) {
    this.stone.position.y = y;
    this.tube.scale.y = T.H + 0.4 - y; this.tube.position.set(0.05, (T.H + 0.4 - y) / 2, -0.12);
    const p = this.bub.pts.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) p.setXYZ(i, this.stoneXZ[0] + (Math.random() - 0.5) * 0.14, y + 0.12, this.stoneXZ[1] + (Math.random() - 0.5) * 0.14);
    p.needsUpdate = true;
  }

  /** 光合作用的小气泡从这些点升起 */
  setPearlOrigins(pts) {
    const p = this.pearl.pts.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      if (!pts.length) { p.setXYZ(i, 0, -50, 0); continue; }
      const o = pts[i % pts.length];
      p.setXYZ(i, o[0] + (Math.random() - 0.5) * o[3], o[1] + Math.random() * 0.2, o[2] + (Math.random() - 0.5) * o[3]);
    }
    p.needsUpdate = true;
  }

  /** hour: 0–24；water: 水质 0–100 */
  update(dt, hour, water, viewH) {
    const L = (this.light = lightAt(hour));
    this.water = water;
    const dirt = clamp((80 - water) / 60, 0, 1);
    this.sun.intensity = L.sun; this.sun.color.copy(L.sunC);
    this.hemi.intensity = L.hemi; this.hemi.color.copy(L.sky); this.hemi.groundColor.copy(L.gnd);
    this.rim.intensity = L.rim; this.rim.color.copy(L.bot).lerp(L.top, 0.3);
    this.front.intensity = 0.18 + 0.12 * (1 - L.n);
    this.backU.uTop.value.copy(L.top); this.backU.uBot.value.copy(L.bot);
    this.wallU.uCol.value.copy(L.bot).lerp(L.top, 0.5);
    U.uCaustK.value = L.ck * (1 - dirt * 0.5); U.uCaustCol.value.copy(L.cc);
    this.rayU.uK.value = L.rays * (1 - dirt * 0.4); this.rayU.uCol.value.copy(L.sunC);
    this.lampM.color.copy(L.lamp).multiplyScalar(L.lampK);
    this.partU.uCol.value.copy(L.pc).multiplyScalar(0.35 + 0.65 * (1 - L.n * 0.75)); this.partU.uDirt.value = dirt;
    this.partU.uScale.value = viewH; this.bub.u.uScale.value = viewH; this.pearl.u.uScale.value = viewH;
    this.bub.u.uCol.value.copy(L.sky).lerp(new THREE.Color(1, 1, 1), 0.6).multiplyScalar(0.55 + 0.6 * (1 - L.n));
    this.pearl.u.uK.value = clamp((1 - L.n * 1.6) * (water > 45 ? 1 : 0.4), 0, 1) * 0.9;
    this.pearl.u.uCol.value.copy(this.bub.u.uCol.value);
    this.surfU.uSky.value.copy(L.lamp).multiplyScalar(0.25 + 0.75 * L.lampK / 1.7).lerp(L.top, 0.25);
    this.surfU.uDeep.value.copy(L.fog).lerp(L.top, 0.35).multiplyScalar(1.1);
    this.surfU.uSun.value.copy(L.sunC).multiplyScalar(0.4 + 0.6 * (1 - L.n));
    this.glassU.uLight.value = 0.35 + 0.65 * (1 - L.n);
    this.glassU.uRefl.value.copy(L.top).lerp(new THREE.Color(1, 1, 1), 0.5);
    // 水质差：水变浑、偏黄绿
    const fog = this.scene.fog;
    fog.color.copy(L.fog).lerp(new THREE.Color(0x4a5a28), dirt * 0.55);
    // 气泡触到水面时荡起小涟漪
    this.bubTimer -= dt;
    if (this.bubTimer < 0) { this.bubTimer = 0.35 + Math.random() * 0.3; this.ripple(this.stoneXZ[0] + (Math.random() - 0.5) * 0.3, this.stoneXZ[1] + Math.random() * 0.2, 0.18); }
    return L;
  }
}
