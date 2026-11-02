/* 星际竞速 · 飞船：程序化建模、涂装、尾焰、光轨、幽灵全息材质 */
import * as THREE from 'three';
import { mergeGeos } from './track.js';

const geoCache = new Map();

/** 沿 z 放样：sections = [{z, w, h, y, x}]，ring = 顺时针截面点 */
function loft(sections, ring, tipFront = 0, tipBack = 0) {
  const R = ring.length, S = sections.length;
  const pos = [];
  for (const s of sections) for (const [rx, ry] of ring) pos.push((s.x || 0) + rx * s.w, s.y + ry * s.h, s.z);
  const s0 = sections[0], s1 = sections[S - 1];
  pos.push(s0.x || 0, s0.y, s0.z - tipFront, s1.x || 0, s1.y, s1.z + tipBack);
  const idx = [];
  for (let i = 0; i < S - 1; i++) for (let j = 0; j < R; j++) {
    const a = i * R + j, b = i * R + (j + 1) % R, c = (i + 1) * R + j, d = (i + 1) * R + (j + 1) % R;
    idx.push(a, c, b, b, c, d);
  }
  const nose = S * R, tail = S * R + 1;
  for (let j = 0; j < R; j++) { idx.push(nose, j, (j + 1) % R); idx.push(tail, (S - 1) * R + (j + 1) % R, (S - 1) * R + j); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** 平面形状挤出成薄板：pts 为 [x, z] 平面轮廓 */
function plate(pts, thick) {
  const sh = new THREE.Shape();
  pts.forEach(([x, z], i) => (i ? sh.lineTo(x, z) : sh.moveTo(x, z)));
  sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, { depth: thick, bevelEnabled: true, bevelThickness: thick * 0.4, bevelSize: thick * 0.5, bevelSegments: 1 });
  g.translate(0, 0, -thick / 2);
  g.rotateX(Math.PI / 2); // 形状 y(-z) → z，挤出方向 → -y
  return g;
}

const HULL_RING = [[0, 1], [0.5, 0.88], [0.9, 0.42], [1, 0], [0.82, -0.42], [0.42, -0.66], [0, -0.72], [-0.42, -0.66], [-0.82, -0.42], [-1, 0], [-0.9, 0.42], [-0.5, 0.88]];
const POD_RING = Array.from({ length: 12 }, (_, k) => { const a = Math.PI / 2 - (k / 12) * Math.PI * 2; return [Math.cos(a), Math.sin(a)]; });

function hullGeometry(body) {
  const key = JSON.stringify(body);
  if (geoCache.has(key)) return geoCache.get(key);
  const Ln = body.len, Wd = body.wid, pr = body.pod;
  // 机身：流线型放样
  const hull = loft([
    { z: -2.75 * Ln, w: 0.07 * Wd, h: 0.05, y: -0.02 },
    { z: -2.3 * Ln, w: 0.26 * Wd, h: 0.13, y: 0.0 },
    { z: -1.6 * Ln, w: 0.46 * Wd, h: 0.22, y: 0.03 },
    { z: -0.8 * Ln, w: 0.64 * Wd, h: 0.3, y: 0.06 },
    { z: 0.1, w: 0.74 * Wd, h: 0.34, y: 0.08 },
    { z: 1.0, w: 0.72 * Wd, h: 0.32, y: 0.08 },
    { z: 1.65, w: 0.6 * Wd, h: 0.25, y: 0.07 },
    { z: 1.85, w: 0.5 * Wd, h: 0.19, y: 0.07 },
  ], HULL_RING, 0.08, 0);
  const podX = 0.74 * Wd + 0.42 * pr + 0.18;
  const pods = [];
  for (const sd of [-1, 1]) {
    pods.push(loft([
      { z: -1.05, w: 0.05, h: 0.05, y: 0.02, x: sd * podX },
      { z: -0.7, w: 0.22 * pr, h: 0.2 * pr, y: 0.03, x: sd * podX },
      { z: 0.0, w: 0.33 * pr, h: 0.3 * pr, y: 0.04, x: sd * podX },
      { z: 1.1, w: 0.36 * pr, h: 0.32 * pr, y: 0.04, x: sd * podX },
      { z: 1.62, w: 0.31 * pr, h: 0.28 * pr, y: 0.04, x: sd * podX },
    ], POD_RING, 0.12, 0));
  }
  // 机翼（后掠）
  const wings = [];
  for (const sd of [-1, 1]) {
    const x0 = sd * 0.45 * Wd, x1 = sd * (podX - 0.1);
    wings.push(plate([[x0, -0.6], [x1, 0.15], [x1, 1.25], [x0, 1.45]], 0.05));
    // 前鸭翼
    wings.push(plate([[sd * 0.2 * Wd, -1.9 * Ln], [sd * (0.62 * Wd + 0.35), -1.35 * Ln], [sd * (0.62 * Wd + 0.35), -1.15 * Ln], [sd * 0.3 * Wd, -1.25 * Ln]], 0.035));
  }
  wings.forEach((w) => w.translate(0, 0.02, 0));
  const fins = [];
  const fin = (sd, cant, h) => {
    const g = new THREE.Shape();
    g.moveTo(0, 0); g.lineTo(0.75, 0); g.lineTo(0.95, h); g.lineTo(0.6, h); g.closePath();
    const geo = new THREE.ExtrudeGeometry(g, { depth: 0.05, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 1 });
    geo.translate(0, 0, -0.025);
    geo.rotateY(-Math.PI / 2); // 形状 x → +z（向后）
    geo.rotateZ(sd * cant);
    return geo;
  };
  if (body.fin === 2) {
    for (const sd of [-1, 1]) { const f = fin(sd, -0.38, 0.62); f.translate(sd * 0.42 * Wd, 0.28, 0.75); fins.push(f); }
  } else if (body.fin === 1) {
    const f = fin(1, 0, 0.78); f.translate(0, 0.33, 0.7); fins.push(f);
  } else {
    for (const sd of [-1, 1]) { const f = fin(sd, -1.15, 0.5); f.translate(sd * (podX + 0.05), 0.1, 0.85); fins.push(f); }
  }
  // 驾驶舱
  const canopy = new THREE.SphereGeometry(0.5, 24, 14, 0, Math.PI * 2, 0, Math.PI / 2);
  canopy.scale(0.48 * Wd, 0.44, 1.5 * Ln);
  canopy.translate(0, 0.3, -0.55 * Ln);
  // 发光线条：机身两侧腰线 + 尾灯条 + 吊舱环
  const glow = [];
  for (const sd of [-1, 1]) {
    const s1 = loft([
      { z: -2.0 * Ln, w: 0.025, h: 0.025, y: 0.06, x: sd * 0.4 * Wd },
      { z: -0.8 * Ln, w: 0.03, h: 0.03, y: 0.1, x: sd * 0.66 * Wd },
      { z: 0.6, w: 0.03, h: 0.03, y: 0.12, x: sd * 0.76 * Wd },
      { z: 1.5, w: 0.03, h: 0.03, y: 0.1, x: sd * 0.68 * Wd },
    ], POD_RING.filter((_, i) => i % 2 === 0));
    glow.push(s1);
    const ring = new THREE.TorusGeometry(0.3 * pr, 0.035, 6, 20);
    ring.translate(sd * podX, 0.04, 1.6);
    glow.push(ring);
  }
  const bar = new THREE.BoxGeometry(0.95 * Wd, 0.06, 0.05);
  bar.translate(0, 0.16, 1.86);
  glow.push(bar);
  // 喷口
  const nozzlePos = [new THREE.Vector3(-podX, 0.04, 1.64), new THREE.Vector3(podX, 0.04, 1.64), new THREE.Vector3(0, 0.05, 1.88)];
  const discs = [];
  nozzlePos.forEach((np, i) => {
    const d = new THREE.CircleGeometry(i < 2 ? 0.24 * pr : 0.16, 20);
    if (i === 2) d.scale(1.8, 0.7, 1);
    d.translate(np.x, np.y, np.z + 0.005);
    discs.push(d);
  });
  const dark = [];
  for (const sd of [-1, 1]) {
    const r = new THREE.TorusGeometry(0.29 * pr, 0.05, 8, 24);
    r.translate(sd * podX, 0.04, 1.62);
    dark.push(r);
  }
  const out = {
    primary: mergeGeos([hull]),
    secondary: mergeGeos([...pods, ...fins]),
    dark: mergeGeos([...wings, ...dark]),
    canopy,
    glow: mergeGeos(glow),
    discs: mergeGeos(discs),
    nozzlePos, podX, podR: pr,
  };
  geoCache.set(key, out);
  return out;
}

/* ---------- 尾焰 ---------- */
const flameGeo = (() => {
  const g = new THREE.ConeGeometry(0.26, 1, 14, 1, true);
  g.rotateX(Math.PI / 2);
  g.translate(0, 0, 0.5);
  return g;
})();

function flameMaterial(color) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uTime: { value: 0 }, uPower: { value: 1 } },
    vertexShader: /* glsl */`
      varying float vT; varying vec3 vN; varying vec3 vV;
      void main() {
        vT = position.z;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor; uniform float uTime, uPower; varying float vT; varying vec3 vN; varying vec3 vV;
      void main() {
        float t = clamp(vT, 0.0, 1.0);
        float core = pow(1.0 - t, 2.2);
        float edge = pow(abs(dot(vN, vV)), 1.2);
        float flick = 0.85 + 0.15 * sin(uTime * 60.0 + t * 20.0);
        vec3 col = mix(vec3(1.0), uColor, smoothstep(0.0, 0.4, t)) * core * edge * flick * (0.8 + uPower * 0.9);
        gl_FragColor = vec4(col, 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
}

/* ---------- 全息（幽灵）材质 ---------- */
export function holoMaterial(color) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uTime: { value: 0 } },
    vertexShader: /* glsl */`
      varying vec3 vN; varying vec3 vV; varying float vY;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz);
        vY = (modelMatrix * vec4(position, 1.0)).y;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor; uniform float uTime; varying vec3 vN; varying vec3 vV; varying float vY;
      void main() {
        float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.0);
        float scan = 0.55 + 0.45 * sin(vY * 30.0 - uTime * 9.0);
        vec3 col = uColor * (0.12 + f * 1.4) * scan;
        gl_FragColor = vec4(col, 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
}

/* ---------- 飞船 ---------- */
export class ShipModel {
  constructor(paint, body, opts = {}) {
    this.root = new THREE.Group();
    this.tilt = new THREE.Group(); // 视觉倾斜层
    this.root.add(this.tilt);
    const G = hullGeometry(body);
    this.G = G;
    this.envMap = opts.envMap || null;
    this.lowQ = !!opts.low;
    if (opts.holo) {
      const hm = holoMaterial(opts.holo);
      this.holoMat = hm;
      for (const g of [G.primary, G.secondary, G.dark, G.canopy, G.glow]) this.tilt.add(new THREE.Mesh(g, hm));
    } else {
      this.matPrimary = new THREE.MeshStandardMaterial({ envMap: this.envMap });
      this.matSecondary = new THREE.MeshStandardMaterial({ envMap: this.envMap });
      this.matDark = new THREE.MeshStandardMaterial({ color: '#15171d', metalness: 0.85, roughness: 0.35, envMap: this.envMap });
      this.matCanopy = new THREE.MeshStandardMaterial({ color: '#070a14', metalness: 0.95, roughness: 0.06, envMap: this.envMap, envMapIntensity: 1.8 });
      this.matGlow = new THREE.MeshBasicMaterial({ color: '#ffffff' });
      this.matDisc = new THREE.MeshBasicMaterial({ color: '#ffffff' });
      this.meshPrimary = new THREE.Mesh(G.primary, this.matPrimary);
      this.tilt.add(this.meshPrimary,
        new THREE.Mesh(G.secondary, this.matSecondary),
        new THREE.Mesh(G.dark, this.matDark),
        new THREE.Mesh(G.canopy, this.matCanopy),
        new THREE.Mesh(G.glow, this.matGlow),
        new THREE.Mesh(G.discs, this.matDisc));
      // 尾焰
      this.flames = [];
      this.flameMat = flameMaterial(paint.glow);
      G.nozzlePos.forEach((np, i) => {
        const fl = new THREE.Mesh(flameGeo, this.flameMat);
        fl.position.copy(np);
        if (i === 2) fl.scale.set(1.0, 0.5, 1);
        else fl.scale.set(G.podR * 0.85, G.podR * 0.85, 1);
        fl.userData.base = fl.scale.clone();
        this.tilt.add(fl);
        this.flames.push(fl);
      });
      this.setPaint(paint);
    }
    this.paint = paint;
    this.root.traverse((o) => { o.frustumCulled = false; });
  }

  setPaint(paint) {
    if (!this.matPrimary) return;
    this.paint = paint;
    const irid = !!paint.irid;
    if (irid && !(this.matPrimary instanceof THREE.MeshPhysicalMaterial) && !this.lowQ) {
      const m = new THREE.MeshPhysicalMaterial({ envMap: this.envMap, iridescence: 1, iridescenceIOR: 1.45, iridescenceThicknessRange: [180, 900], clearcoat: 1, clearcoatRoughness: 0.1 });
      this.meshPrimary.material = m; this.matPrimary.dispose(); this.matPrimary = m;
    } else if (!irid && this.matPrimary instanceof THREE.MeshPhysicalMaterial) {
      const m = new THREE.MeshStandardMaterial({ envMap: this.envMap });
      this.meshPrimary.material = m; this.matPrimary.dispose(); this.matPrimary = m;
    }
    this.matPrimary.color.set(paint.primary);
    this.matPrimary.metalness = paint.metal != null ? paint.metal : 0.55;
    this.matPrimary.roughness = paint.rough != null ? paint.rough : 0.28;
    this.matPrimary.envMapIntensity = 1.25;
    this.matPrimary.needsUpdate = true;
    this.matSecondary.color.set(paint.secondary);
    this.matSecondary.metalness = 0.7; this.matSecondary.roughness = 0.35;
    this.matGlow.color.set(paint.glow).multiplyScalar(2.2);
    this.matDisc.color.set(paint.glow).lerp(new THREE.Color('#ffffff'), 0.35).multiplyScalar(1.15);
    this.matCanopy.emissive = new THREE.Color(paint.glow).multiplyScalar(0.06);
    if (this.flameMat) this.flameMat.uniforms.uColor.value.set(paint.glow);
  }

  /** power: 0..1 正常推力，boost: 0..1 */
  updateFlames(t, power, boost) {
    if (this.holoMat) { this.holoMat.uniforms.uTime.value = t; return; }
    this.flameMat.uniforms.uTime.value = t;
    this.flameMat.uniforms.uPower.value = power * 0.6 + boost * 1.4;
    const len = 0.45 + power * 1.1 + boost * 2.1;
    for (const fl of this.flames) {
      const b = fl.userData.base;
      const flick = 1 + Math.sin(t * 47 + fl.id) * 0.06;
      fl.scale.set(b.x * (1 + boost * 0.25), b.y * (1 + boost * 0.25), len * flick);
    }
  }

  dispose() {
    this.root.traverse((o) => { if (o.material && o.material.dispose) o.material.dispose(); });
  }
}

/* ---------- 光轨（按时间窗口记录，帧率高低都保持同样长度） ---------- */
export class Trail {
  constructor(color, n = 36, width = 0.32, maxAge = 0.42) {
    this.n = n; this.width = width; this.maxAge = maxAge;
    this.pts = Array.from({ length: n }, () => ({ p: new THREE.Vector3(), s: new THREE.Vector3(1, 0, 0), t: -1 }));
    this.head = 0; this.count = 0;
    const pos = new Float32Array(n * 2 * 3);
    const age = new Float32Array(n * 2);
    const idx = [];
    for (let i = 0; i < n - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aT', new THREE.BufferAttribute(age, 1).setUsage(THREE.DynamicDrawUsage));
    g.setIndex(idx);
    this.geo = g;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(color) }, uAlpha: { value: 1 } },
      vertexShader: /* glsl */`attribute float aT; varying float vT; void main(){ vT = aT; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: /* glsl */`uniform vec3 uColor; uniform float uAlpha; varying float vT; void main(){ float a = pow(clamp(1.0 - vT, 0.0, 1.0), 1.5) * uAlpha; gl_FragColor = vec4(uColor * a * 1.5, 1.0); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
  }
  reset() { this.count = 0; }
  push(p, side, t) {
    this.head = (this.head + 1) % this.n;
    const e = this.pts[this.head];
    e.p.copy(p); e.s.copy(side); e.t = t;
    this.count = Math.min(this.n, this.count + 1);
  }
  update(headP, headSide, now) {
    const a = this.geo.attributes.position.array, ag = this.geo.attributes.aT.array;
    const n = this.n;
    let lastP = headP, lastS = headSide, lastAge = 0;
    for (let i = 0; i < n; i++) {
      let p = headP, sd = headSide, age = 0;
      if (i > 0) {
        if (i <= this.count) {
          const e = this.pts[(this.head - (i - 1) + n * 2) % n];
          age = (now - e.t) / this.maxAge;
          if (age <= 1.05) { p = e.p; sd = e.s; } else { p = lastP; sd = lastS; age = Math.max(lastAge, 1); }
        } else { p = lastP; sd = lastS; age = Math.max(lastAge, 1); }
      }
      const w = this.width * Math.max(0, 1 - age);
      a[i * 6] = p.x + sd.x * w; a[i * 6 + 1] = p.y + sd.y * w; a[i * 6 + 2] = p.z + sd.z * w;
      a[i * 6 + 3] = p.x - sd.x * w; a[i * 6 + 4] = p.y - sd.y * w; a[i * 6 + 5] = p.z - sd.z * w;
      ag[i * 2] = ag[i * 2 + 1] = age;
      lastP = p; lastS = sd; lastAge = age;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aT.needsUpdate = true;
  }
}
