/* 星际竞速 · 飞船：程序化建模、涂装、尾焰、光轨、幽灵全息材质 */
import * as THREE from 'three';
import { mergeGeos } from './track.js';

const geoCache = new Map();

function hullGeometry(body) {
  const key = JSON.stringify(body);
  if (geoCache.has(key)) return geoCache.get(key);
  const W = 0.95 * body.wid, Lf = 2.6 * body.len, Lb = 1.9;
  const sh = new THREE.Shape();
  sh.moveTo(0, Lf);
  sh.lineTo(0.26 * W, Lf * 0.6);
  sh.lineTo(0.6 * W, 0.4);
  sh.lineTo(0.92 * W, -0.95);
  sh.lineTo(0.74 * W, -Lb);
  sh.lineTo(-0.74 * W, -Lb);
  sh.lineTo(-0.92 * W, -0.95);
  sh.lineTo(-0.6 * W, 0.4);
  sh.lineTo(-0.26 * W, Lf * 0.6);
  sh.closePath();
  const hull = new THREE.ExtrudeGeometry(sh, { depth: 0.34, bevelEnabled: true, bevelThickness: 0.14, bevelSize: 0.13, bevelSegments: 2, steps: 1, curveSegments: 4 });
  hull.translate(0, 0, -0.17);
  hull.rotateX(-Math.PI / 2);
  // 楔形：机头薄、机尾厚
  const p = hull.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const z = p.getZ(i), y = p.getY(i);
    const t = Math.min(1, Math.max(0, (z + Lf) / (Lf + Lb)));
    const k = t < 0.7 ? (t / 0.7) * (t / 0.7) * (3 - 2 * (t / 0.7)) : 1;
    p.setY(i, y > 0 ? y * (0.32 + 0.68 * k) : y * (0.55 + 0.45 * t));
  }
  hull.computeVertexNormals();
  const podR = body.pod;
  const podX = 0.92 * W + 0.22;
  const pods = [];
  for (const sd of [-1, 1]) {
    const c = new THREE.CylinderGeometry(0.2 * podR, 0.36 * podR, 2.5, 16, 1);
    c.rotateX(-Math.PI / 2);
    c.translate(sd * podX, 0.06, 0.32);
    pods.push(c);
    const cone = new THREE.SphereGeometry(0.2 * podR, 12, 8);
    cone.scale(1, 1, 2.2);
    cone.translate(sd * podX, 0.06, 0.32 - 1.25);
    pods.push(cone);
  }
  const wings = [];
  for (const sd of [-1, 1]) {
    const w = new THREE.BoxGeometry(0.95, 0.07, 1.5);
    w.translate(sd * (podX - 0.45), 0.02, 0.45);
    wings.push(w);
    const c = new THREE.BoxGeometry(0.9, 0.05, 0.5); // 前翼
    c.rotateY(sd * 0.5);
    c.translate(sd * 0.55, -0.02, -1.25 * body.len);
    wings.push(c);
  }
  const fins = [];
  if (body.fin === 2) {
    for (const sd of [-1, 1]) {
      const f = new THREE.BoxGeometry(0.07, 0.62, 1.0);
      f.translate(0, 0.31, 0);
      f.rotateX(-0.35);
      f.rotateZ(sd * -0.42);
      f.translate(sd * 0.48, 0.3, 1.35);
      fins.push(f);
    }
  } else if (body.fin === 1) {
    const f = new THREE.BoxGeometry(0.08, 0.8, 1.2);
    f.translate(0, 0.4, 0);
    f.rotateX(-0.45);
    f.translate(0, 0.32, 1.25);
    fins.push(f);
  } else {
    for (const sd of [-1, 1]) {
      const f = new THREE.BoxGeometry(0.9, 0.06, 0.8);
      f.rotateZ(sd * 0.25);
      f.translate(sd * (podX + 0.55), 0.14, 1.2);
      fins.push(f);
    }
  }
  const canopy = new THREE.SphereGeometry(0.5, 22, 12, 0, Math.PI * 2, 0, Math.PI / 2);
  canopy.scale(0.56, 0.5, 1.55);
  canopy.translate(0, 0.16, -0.3);
  // 发光线条与喷口
  const stripes = [];
  for (const sd of [-1, 1]) {
    const s = new THREE.BoxGeometry(0.05, 0.05, 2.5 * body.len);
    s.rotateY(sd * 0.13);
    s.translate(sd * 0.5 * W, 0.2, 0.0);
    stripes.push(s);
    const s2 = new THREE.BoxGeometry(0.05, 0.05, 2.2);
    s2.translate(sd * podX, 0.06 + 0.33 * podR, 0.4);
    stripes.push(s2);
  }
  const nozzles = [];
  const nozzlePos = [];
  for (const sd of [-1, 1]) {
    const r = new THREE.TorusGeometry(0.3 * podR, 0.06, 8, 20);
    r.translate(sd * podX, 0.06, 1.57);
    nozzles.push(r);
    nozzlePos.push(new THREE.Vector3(sd * podX, 0.06, 1.6));
  }
  const center = new THREE.TorusGeometry(0.22, 0.05, 8, 16);
  center.scale(1.5, 0.7, 1);
  center.translate(0, 0.12, 1.92);
  nozzles.push(center);
  nozzlePos.push(new THREE.Vector3(0, 0.12, 1.95));
  const glowDisc = [];
  nozzlePos.forEach((np, i) => {
    const d = new THREE.CircleGeometry(i < 2 ? 0.27 * podR : 0.2, 18);
    if (i === 2) d.scale(1.5, 0.7, 1);
    d.translate(np.x, np.y, np.z + 0.01);
    glowDisc.push(d);
  });

  const out = {
    primary: mergeGeos([hull]),
    secondary: mergeGeos([...pods, ...fins]),
    dark: mergeGeos([...wings, ...nozzles]),
    canopy,
    glow: mergeGeos([...stripes, ...glowDisc]),
    nozzlePos, podX, podR,
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
        vec3 col = mix(vec3(1.0), uColor, smoothstep(0.0, 0.45, t)) * core * edge * flick * (1.3 + uPower * 1.6);
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
      for (const g of [G.primary, G.secondary, G.dark, G.canopy]) this.tilt.add(new THREE.Mesh(g, hm));
    } else {
      this.matPrimary = new THREE.MeshStandardMaterial({ envMap: this.envMap });
      this.matSecondary = new THREE.MeshStandardMaterial({ envMap: this.envMap });
      this.matDark = new THREE.MeshStandardMaterial({ color: '#15171d', metalness: 0.85, roughness: 0.35, envMap: this.envMap });
      this.matCanopy = new THREE.MeshStandardMaterial({ color: '#070a14', metalness: 0.95, roughness: 0.06, envMap: this.envMap, envMapIntensity: 1.8 });
      this.matGlow = new THREE.MeshBasicMaterial({ color: '#ffffff' });
      this.meshPrimary = new THREE.Mesh(G.primary, this.matPrimary);
      this.tilt.add(this.meshPrimary,
        new THREE.Mesh(G.secondary, this.matSecondary),
        new THREE.Mesh(G.dark, this.matDark),
        new THREE.Mesh(G.canopy, this.matCanopy),
        new THREE.Mesh(G.glow, this.matGlow));
      // 尾焰
      this.flames = [];
      this.flameMat = flameMaterial(paint.glow);
      G.nozzlePos.forEach((np, i) => {
        const fl = new THREE.Mesh(flameGeo, this.flameMat);
        fl.position.copy(np);
        if (i === 2) fl.scale.set(1.1, 0.6, 1);
        else fl.scale.set(G.podR, G.podR, 1);
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
    this.matGlow.color.set(paint.glow).multiplyScalar(2.6);
    this.matCanopy.emissive = new THREE.Color(paint.glow).multiplyScalar(0.06);
    if (this.flameMat) this.flameMat.uniforms.uColor.value.set(paint.glow);
  }

  /** power: 0..1 正常推力，boost: 0..1 */
  updateFlames(t, power, boost) {
    if (this.holoMat) { this.holoMat.uniforms.uTime.value = t; return; }
    this.flameMat.uniforms.uTime.value = t;
    this.flameMat.uniforms.uPower.value = power * 0.6 + boost * 1.4;
    const len = 0.5 + power * 1.4 + boost * 2.6;
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

/* ---------- 光轨 ---------- */
export class Trail {
  constructor(color, n = 36, width = 0.32) {
    this.n = n; this.width = width;
    this.pts = Array.from({ length: n }, () => new THREE.Vector3());
    this.sides = Array.from({ length: n }, () => new THREE.Vector3(1, 0, 0));
    this.count = 0;
    const pos = new Float32Array(n * 2 * 3);
    const t = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) { t[i * 2] = t[i * 2 + 1] = i / (n - 1); }
    const idx = [];
    for (let i = 0; i < n - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aT', new THREE.BufferAttribute(t, 1));
    g.setIndex(idx);
    this.geo = g;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(color) }, uAlpha: { value: 1 } },
      vertexShader: /* glsl */`attribute float aT; varying float vT; void main(){ vT = aT; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: /* glsl */`uniform vec3 uColor; uniform float uAlpha; varying float vT; void main(){ float a = pow(1.0 - vT, 1.6) * uAlpha; gl_FragColor = vec4(uColor * a * 1.6, 1.0); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
  }
  reset() { this.count = 0; }
  push(p, side) {
    // 环形缓冲改为整体后移（n 很小）
    const last = this.pts[this.n - 1], lastS = this.sides[this.n - 1];
    for (let i = this.n - 1; i > 0; i--) { this.pts[i] = this.pts[i - 1]; this.sides[i] = this.sides[i - 1]; }
    this.pts[0] = last.copy(p); this.sides[0] = lastS.copy(side);
    this.count = Math.min(this.n, this.count + 1);
  }
  update(headP, headSide) {
    const a = this.geo.attributes.position.array;
    const n = this.n;
    for (let i = 0; i < n; i++) {
      const j = Math.min(i, this.count - 1);
      const p = i === 0 ? headP : (j >= 0 ? this.pts[j] : headP);
      const sd = i === 0 ? headSide : (j >= 0 ? this.sides[j] : headSide);
      const w = this.width * (1 - i / n);
      a[i * 6] = p.x + sd.x * w; a[i * 6 + 1] = p.y + sd.y * w; a[i * 6 + 2] = p.z + sd.z * w;
      a[i * 6 + 3] = p.x - sd.x * w; a[i * 6 + 4] = p.y - sd.y * w; a[i * 6 + 5] = p.z - sd.z * w;
    }
    this.geo.attributes.position.needsUpdate = true;
  }
}
