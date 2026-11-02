// 程序化植物「角色」：由少量参数化原型拼装而成
import * as THREE from 'three';

const V3 = THREE.Vector3, M4 = THREE.Matrix4, Q = THREE.Quaternion, Color = THREE.Color;
const UP = new V3(0, 1, 0);
const TAU = Math.PI * 2;

export const SHARED = { rim: { value: new Color('#ff9ec7') } };

export function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const col = (c) => (c instanceof Color ? c : new Color(c));
export function rvec(R) {
  const u = R() * 2 - 1, a = R() * TAU, s = Math.sqrt(1 - u * u);
  return new V3(Math.cos(a) * s, u, Math.sin(a) * s);
}

/* ---------------- 材质 ---------------- */
export function stdMat({ side = THREE.FrontSide, glow = 0.04, rough = 0.72, metal = 0, flat = false, color = 0xffffff, transparent = false, opacity = 1 } = {}) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, color, roughness: rough, metalness: metal, side, flatShading: flat, transparent, opacity });
  const uGlow = { value: glow }, uBoost = { value: 0 };
  m.userData.uGlow = uGlow; m.userData.uBoost = uBoost;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uGlow = uGlow; sh.uniforms.uBoost = uBoost; sh.uniforms.uRim = SHARED.rim;
    sh.fragmentShader = 'uniform float uGlow;\nuniform float uBoost;\nuniform vec3 uRim;\n' + sh.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
      float fresF = pow(1.0 - abs(dot(normal, normalize(vViewPosition))), 2.5);
      totalEmissiveRadiance += diffuseColor.rgb * (uGlow + uBoost * 0.5) + (uRim * 0.5 + diffuseColor.rgb * 0.5) * fresF * (0.5 + uBoost);`
    );
  };
  return m;
}

/* ---------------- 几何工具 ---------------- */
export function taperTube(curve, r0, r1, tub = 8, rad = 6, rfn = null) {
  const frames = curve.computeFrenetFrames(tub, false);
  const pos = [], nor = [], idx = [];
  const p = new V3();
  for (let i = 0; i <= tub; i++) {
    const t = i / tub;
    curve.getPointAt(t, p);
    const N = frames.normals[i], B = frames.binormals[i];
    for (let j = 0; j <= rad; j++) {
      const a = (j / rad) * TAU, c = Math.cos(a), s = Math.sin(a);
      const r = rfn ? rfn(t, a) : r0 + (r1 - r0) * t;
      const nx = c * N.x + s * B.x, ny = c * N.y + s * B.y, nz = c * N.z + s * B.z;
      pos.push(p.x + nx * r, p.y + ny * r, p.z + nz * r);
      nor.push(nx, ny, nz);
    }
  }
  for (let i = 0; i < tub; i++) for (let j = 0; j < rad; j++) {
    const a = i * (rad + 1) + j, b = a + rad + 1;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  return g;
}

// 叶片：沿 +Y 生长，宽度沿 X，向 -Z 弯曲
export function leafGeo(len, wid, { bend = 0.2, fold = 0.25, segs = 6, prof = (v) => Math.sin(Math.PI * Math.pow(v, 0.8)), twist = 0 } = {}) {
  const pos = [], idx = [];
  for (let i = 0; i <= segs; i++) {
    const v = i / segs, y = v * len, w = wid * 0.5 * Math.max(0, prof(v));
    const z = -bend * len * v * v;
    const tw = twist * v, ct = Math.cos(tw), st = Math.sin(tw);
    const L = [-w * ct, z - w * st], R = [w * ct, z + w * st];
    pos.push(L[0], y, L[1], 0, y, z + fold * w, R[0], y, R[1]);
  }
  for (let i = 0; i < segs; i++) {
    const L = i * 3, M = L + 1, R = L + 2, L2 = L + 3, M2 = L + 4, R2 = L + 5;
    idx.push(L, M, L2, M, M2, L2, M, R, M2, R, R2, M2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// 银杏扇形叶
function fanGeo(size) {
  const pos = [0, 0, 0, 0, size * 0.35, 0], idx = [];
  const n = 14, spread = 0.95;
  for (let i = 0; i <= n; i++) {
    const a = -spread + (i / n) * spread * 2;
    const r = size * (1 - 0.32 * Math.exp(-(a * a) / 0.012));
    pos.push(Math.sin(a) * r, size * 0.35 + Math.cos(a) * r, -0.15 * r * Math.abs(a));
  }
  for (let i = 0; i < n; i++) idx.push(1, i + 2, i + 3);
  // 叶柄
  const w = size * 0.04;
  const b = pos.length / 3;
  pos.push(-w, 0, 0, w, 0, 0, -w, size * 0.36, 0, w, size * 0.36, 0);
  idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// 荷叶：碗状圆盘（带缺口）
function padGeo(r, cup = 0.15, notch = 0.22) {
  const pos = [0, -cup * r * 0.2, 0], idx = [];
  const rings = 5, segs = 28;
  for (let k = 1; k <= rings; k++) {
    const rr = (k / rings) * r;
    for (let j = 0; j <= segs; j++) {
      const a = notch + (j / segs) * (TAU - notch * 2);
      const wav = Math.sin(a * 7) * 0.025 * r * (k / rings);
      pos.push(Math.cos(a) * rr, cup * (rr * rr) / r + wav, Math.sin(a) * rr);
    }
  }
  for (let j = 0; j < segs; j++) idx.push(0, 1 + j, 2 + j);
  for (let k = 1; k < rings; k++) for (let j = 0; j < segs; j++) {
    const a = 1 + (k - 1) * (segs + 1) + j, b = a + segs + 1;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/* ---------------- 合并器 ---------------- */
export class Parts {
  constructor() { this.b = {}; }
  add(key, geo, m, c0, c1 = c0, grad = 'y') {
    const B = this.b[key] || (this.b[key] = { pos: [], nor: [], col: [], idx: [], n: 0 });
    if (!geo.attributes.normal) geo.computeVertexNormals();
    const pa = geo.attributes.position, na = geo.attributes.normal;
    const gv = grad === 'r' ? (i) => Math.hypot(pa.getX(i), pa.getZ(i)) : (i) => pa.getY(i);
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < pa.count; i++) { const v = gv(i); if (v < lo) lo = v; if (v > hi) hi = v; }
    const span = hi - lo || 1;
    const nm = m ? new THREE.Matrix3().getNormalMatrix(m) : null;
    const v = new V3(), nn = new V3(), c = new Color(), A = col(c0), Bc = col(c1);
    for (let i = 0; i < pa.count; i++) {
      v.fromBufferAttribute(pa, i); if (m) v.applyMatrix4(m);
      nn.fromBufferAttribute(na, i); if (nm) nn.applyMatrix3(nm).normalize();
      c.copy(A).lerp(Bc, (gv(i) - lo) / span);
      B.pos.push(v.x, v.y, v.z); B.nor.push(nn.x, nn.y, nn.z); B.col.push(c.r, c.g, c.b);
    }
    const base = B.n;
    if (geo.index) { const ia = geo.index.array; for (let i = 0; i < ia.length; i++) B.idx.push(base + ia[i]); }
    else for (let i = 0; i < pa.count; i++) B.idx.push(base + i);
    B.n += pa.count;
  }
  build(mats) {
    const g = new THREE.Group();
    for (const k in this.b) {
      const B = this.b[k];
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(B.pos, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(B.nor, 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(B.col, 3));
      geo.setIndex(B.idx);
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, mats[k]);
      g.add(mesh);
    }
    return g;
  }
}

function makeMats(extra = {}) {
  return Object.assign({
    solid: stdMat({ glow: 0.03 }),
    leaf: stdMat({ side: THREE.DoubleSide, glow: 0.07 }),
    glow: stdMat({ side: THREE.DoubleSide, glow: 0.4, rough: 0.5 }),
    rock: stdMat({ flat: true, rough: 0.95, glow: 0.02 }),
  }, extra);
}

function orientM(pos, dir, roll = 0, s = 1) {
  const q = new Q().setFromUnitVectors(UP, dir.clone().normalize());
  if (roll) q.multiply(new Q().setFromAxisAngle(UP, roll));
  const sc = typeof s === 'number' ? new V3(s, s, s) : s;
  return new M4().compose(pos, q, sc);
}
function basisM(pos, yDir, zDir, s = 1) {
  const Y = yDir.clone().normalize();
  const X = Y.clone().cross(zDir).normalize();
  const Z = X.clone().cross(Y).normalize();
  const m = new M4().makeBasis(X, Y, Z);
  m.scale(new V3(s, s, s));
  m.setPosition(pos);
  return m;
}
export function bendDir(dir, az, tilt) {
  const perp = Math.abs(dir.y) < 0.9 ? new V3(0, 1, 0) : new V3(1, 0, 0);
  const a = perp.clone().cross(dir).normalize();
  const b = dir.clone().cross(a).normalize();
  const side = a.multiplyScalar(Math.cos(az)).add(b.multiplyScalar(Math.sin(az)));
  return dir.clone().multiplyScalar(Math.cos(tilt)).add(side.multiplyScalar(Math.sin(tilt))).normalize();
}
const sphereCache = {};
function ball(r, d = 1) { const k = r + '_' + d; return sphereCache[k] || (sphereCache[k] = new THREE.IcosahedronGeometry(r, d)); }

function addFlower(P, key, M, { n = 5, len = 0.1, wid = 0.08, open = 1.2, cup = 0.3, c0, c1, center, cr = 0.02, layers = 1, prof, layerStep = 0.35 }) {
  const g = leafGeo(len, wid, { bend: cup, fold: 0.12, segs: 4, prof: prof || ((v) => Math.sqrt(Math.max(0, Math.sin(Math.PI * Math.pow(v, 0.7))))) });
  for (let L = 0; L < layers; L++) for (let i = 0; i < n; i++) {
    const m = new M4().makeRotationY((i / n) * TAU + (L * Math.PI) / n).multiply(new M4().makeRotationX(open - L * layerStep));
    if (L) m.scale(new V3(1 - L * 0.12, 1 - L * 0.12, 1 - L * 0.12));
    P.add(key, g, M.clone().multiply(m), c0, c1);
  }
  if (center) P.add(key, ball(cr, 1), M, center, center);
}

function miniTree(P, R, o) {
  const rec = (start, dir, len, r, d) => {
    const end = start.clone().addScaledVector(dir, len);
    const mid = start.clone().lerp(end, 0.5).add(rvec(R).multiplyScalar(len * o.gnarl));
    const curve = new THREE.QuadraticBezierCurve3(start, mid, end);
    P.add('solid', taperTube(curve, r, r * 0.66, d < 2 ? 6 : 4, d < 2 ? 7 : 5), null, o.barkA, o.barkB);
    o.onSeg && o.onSeg(curve, d, r);
    if (d >= o.depth) { o.onTip && o.onTip(end, dir, d); return; }
    const n = typeof o.kids === 'function' ? o.kids(d) : o.kids;
    const az0 = R() * TAU;
    for (let i = 0; i < n; i++) {
      const az = az0 + (i / n) * TAU + (R() - 0.5) * 0.8;
      const tilt = o.angle * (0.7 + R() * 0.6);
      const nd = bendDir(dir, az, tilt).lerp(UP, o.upBias).normalize();
      rec(end, nd, len * o.decay * (0.8 + R() * 0.4), r * 0.64, d + 1);
    }
  };
  rec(new V3(0, 0, 0), new V3(0, 1, 0), o.trunkLen, o.r0, 0);
}

/* ================= 原型们 ================= */

function ginkgo() {
  const R = rng(11), P = new Parts();
  const leafMat = stdMat({ side: THREE.DoubleSide, glow: 0.12, color: '#8fd16a' });
  const mats = makeMats({ gleaf: leafMat });
  const fan = fanGeo(0.075);
  const addCluster = (p, n, spread) => {
    for (let i = 0; i < n; i++) {
      const d = rvec(R); d.y = Math.abs(d.y) * 0.8 + 0.2;
      const pos = p.clone().addScaledVector(rvec(R), spread * R());
      P.add('gleaf', fan, orientM(pos, d, R() * TAU, 0.8 + R() * 0.5), '#d9d9c0', '#ffffff');
    }
  };
  miniTree(P, R, {
    trunkLen: 0.75, r0: 0.07, depth: 3, kids: (d) => (d === 0 ? 4 : 2), angle: 0.55, decay: 0.72, gnarl: 0.06, upBias: 0.3,
    barkA: '#4a3a30', barkB: '#6b5444',
    onSeg: (c, d) => { if (d >= 1) for (let t = 0.35; t <= 1; t += 0.22) addCluster(c.getPointAt(t), 4, 0.06); },
    onTip: (p) => addCluster(p, 9, 0.12),
  });
  const group = P.build(mats);
  const green = new Color('#8fd16a'), gold = new Color('#ffcf3a'), target = new Color('#8fd16a');
  return {
    group,
    season(i) { target.copy(i === 2 || i === 3 ? gold : green); },
    update(dt) { leafMat.color.lerp(target, 1 - Math.exp(-dt * 2)); },
  };
}

function sakura() {
  const R = rng(22), P = new Parts();
  const mats = makeMats();
  const blossom = (p, n, spread) => {
    for (let i = 0; i < n; i++) {
      const pos = p.clone().addScaledVector(rvec(R), spread * Math.cbrt(R()));
      const d = rvec(R); d.y += 0.4; d.normalize();
      addFlower(P, 'glow', orientM(pos, d, R() * TAU, 0.75 + R() * 0.4), {
        n: 5, len: 0.055, wid: 0.05, open: 1.05, cup: 0.25, c0: '#ff7fae', c1: '#ffe4ef', center: '#ffd36b', cr: 0.008,
        prof: (v) => Math.sqrt(Math.max(0, Math.sin(Math.PI * Math.pow(v, 0.6)))) * (v > 0.85 ? 0.75 : 1),
      });
    }
  };
  miniTree(P, R, {
    trunkLen: 0.6, r0: 0.075, depth: 4, kids: (d) => (d === 0 ? 3 : R() < 0.4 ? 3 : 2), angle: 0.8, decay: 0.74, gnarl: 0.14, upBias: 0.05,
    barkA: '#3d2a2c', barkB: '#6b4448',
    onSeg: (c, d) => { if (d >= 2) blossom(c.getPointAt(0.6), 3, 0.08); },
    onTip: (p) => blossom(p, 9, 0.14),
  });
  return { group: P.build(mats) };
}

function bamboo() {
  const R = rng(33), P = new Parts();
  const mats = makeMats();
  const ring = new THREE.TorusGeometry(1, 0.16, 5, 14);
  const lf = leafGeo(0.24, 0.035, { bend: 0.35, fold: 0.2, segs: 5, prof: (v) => Math.pow(Math.sin(Math.PI * Math.pow(v, 0.5)), 0.8) });
  const culms = [[0, 0, 2.3], [0.2, 0.08, 1.9], [-0.16, 0.15, 2.05], [0.05, -0.2, 1.65], [-0.2, -0.12, 1.4]];
  for (const [x, z, h] of culms) {
    const lean = new V3((R() - 0.5) * 0.3, 1, (R() - 0.5) * 0.3).normalize();
    const p0 = new V3(x, 0, z), p2 = p0.clone().addScaledVector(lean, h);
    const p1 = p0.clone().lerp(p2, 0.6).add(new V3((R() - 0.5) * 0.12, 0, (R() - 0.5) * 0.12));
    const curve = new THREE.QuadraticBezierCurve3(p0, p1, p2);
    const r0 = 0.03 + h * 0.009;
    P.add('solid', taperTube(curve, r0, r0 * 0.6, 12, 9), null, '#3f8a3e', '#86c95e');
    const nodes = Math.round(h / 0.2);
    for (let k = 1; k < nodes; k++) {
      const t = k / nodes, p = curve.getPointAt(t), tan = curve.getTangentAt(t);
      const r = (r0 + (r0 * 0.6 - r0) * t) * 1.08;
      P.add('solid', ring, orientM(p, tan, 0, new V3(r, r, r)).multiply(new M4().makeRotationX(Math.PI / 2)), '#b6e08a', '#d8f2a8');
      if (t > 0.38) {
        const az = k * 2.4 + R();
        const out = new V3(Math.cos(az), 0.5 + R() * 0.4, Math.sin(az)).normalize();
        const tl = 0.12 + R() * 0.12;
        const tw = new THREE.LineCurve3(p, p.clone().addScaledVector(out, tl));
        P.add('solid', taperTube(tw, 0.007, 0.004, 1, 4), null, '#6aa84c', '#8cc463');
        const tip = p.clone().addScaledVector(out, tl);
        const nl = 3 + Math.floor(R() * 4);
        for (let j = 0; j < nl; j++) {
          const d = bendDir(out, (j / nl) * TAU + R(), 0.9 + R() * 0.5); d.y -= 0.35; d.normalize();
          P.add('leaf', lf, orientM(tip, d, R() * TAU, 0.85 + R() * 0.4), '#2f8a3a', '#9de07a');
        }
      }
    }
  }
  // 竹笋
  P.add('solid', new THREE.ConeGeometry(0.05, 0.22, 8), new M4().makeTranslation(0.28, 0.11, -0.05), '#6b4a2a', '#c9a86a');
  return { group: P.build(mats) };
}

function lotus() {
  const R = rng(44), P = new Parts();
  const water = new THREE.MeshStandardMaterial({ color: '#0e3d4c', roughness: 0.12, metalness: 0.4, transparent: true, opacity: 0.88, emissive: '#0b5b66', emissiveIntensity: 0.55 });
  const mats = makeMats();
  // 叶
  const pads = [[0.55, 0.02, 0.15, 0.36, 0], [-0.5, 0.02, 0.3, 0.32, 0], [0.1, 0.02, -0.6, 0.3, 0], [-0.3, 0.02, -0.4, 0.22, 0], [0.45, 0.62, -0.25, 0.34, 1], [-0.35, 0.85, 0.05, 0.3, 1]];
  for (const [x, y, z, r, raised] of pads) {
    const g = padGeo(r, raised ? 0.35 : 0.06);
    const m = new M4().makeRotationY(R() * TAU);
    if (raised) m.premultiply(new M4().makeRotationZ((R() - 0.5) * 0.4));
    m.setPosition(x, y, z);
    P.add('leaf', g, m, '#7ad06a', '#256b3a', 'r');
    if (raised) {
      const st = new THREE.QuadraticBezierCurve3(new V3(x * 0.6, 0, z * 0.6), new V3(x * 0.9, y * 0.5, z * 0.9), new V3(x, y, z));
      P.add('solid', taperTube(st, 0.014, 0.012, 6, 5), null, '#3c7f3a', '#5fa64a');
    }
  }
  // 主花
  const top = new V3(0.05, 1.15, 0.05);
  const stem = new THREE.QuadraticBezierCurve3(new V3(0, 0, 0), new V3(0.12, 0.6, 0), top);
  P.add('solid', taperTube(stem, 0.018, 0.014, 8, 6), null, '#3d8040', '#6bb04e');
  const fm = orientM(top, new V3(0.05, 1, 0.03), 0, 1);
  const petalProf = (v) => Math.pow(Math.sin(Math.PI * Math.pow(v, 0.75)), 0.7);
  addFlower(P, 'glow', fm, { n: 7, len: 0.3, wid: 0.17, open: 1.05, cup: 0.35, c0: '#fff2f6', c1: '#ff5f97', prof: petalProf });
  addFlower(P, 'glow', fm.clone().multiply(new M4().makeRotationY(0.4)), { n: 7, len: 0.27, wid: 0.15, open: 0.62, cup: 0.4, c0: '#fff6f8', c1: '#ff6fa1', prof: petalProf });
  addFlower(P, 'glow', fm.clone().multiply(new M4().makeRotationY(0.9)), { n: 5, len: 0.22, wid: 0.13, open: 0.3, cup: 0.45, c0: '#ffffff', c1: '#ff8ab3', prof: petalProf });
  // 莲蓬与雄蕊
  P.add('glow', new THREE.CylinderGeometry(0.07, 0.04, 0.07, 14), fm.clone().multiply(new M4().makeTranslation(0, 0.05, 0)), '#b9d65a', '#e8f07a');
  P.add('glow', new THREE.TorusGeometry(0.075, 0.016, 5, 18), fm.clone().multiply(new M4().makeTranslation(0, 0.04, 0)).multiply(new M4().makeRotationX(Math.PI / 2)), '#ffd84a', '#ffe98a');
  // 花苞
  const bt = new V3(-0.32, 0.8, -0.18);
  P.add('solid', taperTube(new THREE.QuadraticBezierCurve3(new V3(-0.1, 0, -0.05), new V3(-0.3, 0.4, -0.1), bt), 0.012, 0.01, 6, 5), null, '#3d8040', '#6bb04e');
  addFlower(P, 'glow', orientM(bt, new V3(-0.2, 1, 0), 0, 1), { n: 5, len: 0.2, wid: 0.12, open: 0.14, cup: 0.5, c0: '#ffd6e4', c1: '#ff4f8b', prof: petalProf });
  const group = P.build(mats);
  const wm = new THREE.Mesh(new THREE.CircleGeometry(1.15, 48).rotateX(-Math.PI / 2), water);
  group.add(wm);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.035, 6, 48).rotateX(Math.PI / 2), stdMat({ glow: 0.05 }));
  rim.geometry.setAttribute('color', new THREE.Float32BufferAttribute(new Array(rim.geometry.attributes.position.count * 3).fill(0.35), 3));
  group.add(rim);
  return { group };
}

function mei() {
  const R = rng(55), P = new Parts();
  const mats = makeMats();
  const flower = (p, s) => {
    const d = rvec(R); d.y += 0.3; d.normalize();
    if (R() < 0.25) { P.add('glow', ball(0.022, 1), new M4().makeTranslation(p.x, p.y, p.z), '#c3123f', '#ff4f7a'); return; }
    addFlower(P, 'glow', orientM(p, d, R() * TAU, s), {
      n: 5, len: 0.05, wid: 0.052, open: 1.2, cup: 0.2, c0: '#b80e3a', c1: '#ff7e9e', center: '#ffe27a', cr: 0.011,
      prof: (v) => Math.sqrt(Math.max(0, Math.sin(Math.PI * Math.pow(v, 0.55)))),
    });
  };
  miniTree(P, R, {
    trunkLen: 0.7, r0: 0.085, depth: 4, kids: (d) => (d === 0 ? 3 : 2), angle: 0.75, decay: 0.76, gnarl: 0.32, upBias: 0.12,
    barkA: '#241517', barkB: '#4b2f2c',
    onSeg: (c, d) => { if (d >= 1) { const n = 2 + d; for (let i = 0; i < n; i++) { const t = 0.25 + R() * 0.75; const p = c.getPointAt(t).add(rvec(R).multiplyScalar(0.025)); flower(p, 0.9 + R() * 0.4); } } },
    onTip: (p) => { for (let i = 0; i < 2; i++) flower(p.clone().add(rvec(R).multiplyScalar(0.04)), 1); },
  });
  P.add('rock', new THREE.DodecahedronGeometry(0.28, 0), new M4().compose(new V3(0.05, 0.02, 0), new Q(), new V3(1.4, 0.45, 1.1)), '#3a3442', '#5b5566');
  return { group: P.build(mats) };
}

function pine() {
  const R = rng(66), P = new Parts();
  const mats = makeMats({ pad: stdMat({ flat: true, glow: 0.08, rough: 0.8 }) });
  P.add('rock', new THREE.DodecahedronGeometry(0.5, 0), new M4().compose(new V3(0, -0.05, 0), new Q().setFromEuler(new THREE.Euler(0.2, 0.5, 0.1)), new V3(1.5, 0.7, 1.2)), '#4a4a58', '#8a8a9a');
  P.add('rock', new THREE.DodecahedronGeometry(0.3, 0), new M4().compose(new V3(0.5, 0.0, 0.2), new Q().setFromEuler(new THREE.Euler(0.5, 0.2, 0.3)), new V3(1, 0.8, 1)), '#4a4a58', '#7a7a8a');
  const trunk = new THREE.CubicBezierCurve3(new V3(-0.1, 0.2, 0), new V3(0.3, 0.8, 0.1), new V3(-0.25, 1.3, -0.05), new V3(0.05, 1.85, 0));
  P.add('solid', taperTube(trunk, 0.1, 0.035, 16, 8), null, '#3a2a22', '#7a5440');
  const padG = new THREE.IcosahedronGeometry(1, 1);
  const pad = (p, sx) => {
    P.add('pad', padG, new M4().compose(p, new Q().setFromEuler(new THREE.Euler(0, R() * TAU, 0)), new V3(sx, sx * 0.28, sx * 0.8)), '#174a32', '#58c47e');
  };
  const branches = [
    [0.42, 1.3, 0.0, 0.15, 0.05], // 迎客长臂
    [0.58, 0.95, 2.6, 0.25, 0.02], [0.72, 0.8, 4.3, 0.12, 0.0], [0.85, 0.7, 1.4, 0.3, 0.01], [0.95, 0.55, 3.5, 0.2, 0.0],
  ];
  for (const [t, len, az, rise] of branches) {
    const s = trunk.getPointAt(t);
    const dir = new V3(Math.cos(az), rise, Math.sin(az)).normalize();
    const e = s.clone().addScaledVector(dir, len);
    const m = s.clone().lerp(e, 0.5).add(new V3(0, -0.08 * len, 0));
    const c = new THREE.QuadraticBezierCurve3(s, m, e);
    P.add('solid', taperTube(c, 0.035 * (1.3 - t * 0.5), 0.012, 8, 5), null, '#3a2a22', '#6d4a38');
    const n = Math.round(len * 4);
    for (let i = 0; i < n; i++) {
      const tt = 0.4 + (i / Math.max(1, n - 1)) * 0.6;
      const p = c.getPointAt(tt); p.y += 0.06;
      pad(p.add(new V3((R() - 0.5) * 0.1, 0, (R() - 0.5) * 0.1)), 0.16 + R() * 0.1 + len * 0.05);
    }
  }
  pad(new V3(0.05, 1.92, 0), 0.34); pad(new V3(0.2, 1.86, 0.1), 0.22); pad(new V3(-0.15, 1.88, -0.1), 0.24);
  // 松果
  for (let i = 0; i < 5; i++) P.add('solid', new THREE.ConeGeometry(0.03, 0.08, 7).rotateX(Math.PI), new M4().makeTranslation((R() - 0.5) * 1.2, 1.0 + R() * 0.6, (R() - 0.5) * 0.8), '#7a4a26', '#b07a45');
  return { group: P.build(mats) };
}

function orchid() {
  const R = rng(77), P = new Parts();
  const mats = makeMats();
  P.add('rock', new THREE.IcosahedronGeometry(0.32, 1), new M4().compose(new V3(0, -0.04, 0), new Q(), new V3(1.2, 0.35, 1.1)), '#233a28', '#4e7a44');
  for (let i = 0; i < 16; i++) {
    const az = (i / 16) * TAU + R() * 0.3;
    const len = 0.8 + R() * 0.45;
    const g = leafGeo(len, 0.045, { bend: 0.3 + R() * 0.3, fold: 0.35, segs: 12, prof: (v) => Math.min(1, v * 10) * (1 - v * 0.75), twist: (R() - 0.5) * 0.8 });
    const dir = new V3(Math.cos(az) * 0.35, 1, Math.sin(az) * 0.35).normalize();
    // 让叶片向外弯：-Z 方向对准外侧
    const m = orientM(new V3(Math.cos(az) * 0.03, 0.05, Math.sin(az) * 0.03), dir, -az - Math.PI / 2, 1);
    P.add('leaf', g, m, '#1f5f34', '#74c66a');
  }
  const scapes = [[0.3, 0.75, 0.15], [2.4, 0.62, 0.25], [4.3, 0.7, 0.2]];
  for (const [az, h, lean] of scapes) {
    const top = new V3(Math.cos(az) * lean, h, Math.sin(az) * lean);
    const c = new THREE.QuadraticBezierCurve3(new V3(0, 0.05, 0), new V3(Math.cos(az) * lean * 0.3, h * 0.6, Math.sin(az) * lean * 0.3), top);
    P.add('solid', taperTube(c, 0.008, 0.006, 8, 4), null, '#6a9a4a', '#b8d890');
    const face = new V3(Math.cos(az), 0.25, Math.sin(az)).normalize();
    const F = orientM(top, face, 0, 1);
    const sep = leafGeo(0.16, 0.045, { bend: 0.15, fold: 0.2, segs: 5 });
    for (const a of [0, 2.2, -2.2]) P.add('glow', sep, F.clone().multiply(new M4().makeRotationY(a)).multiply(new M4().makeRotationX(1.25)), '#c8e6a0', '#f2ffd8');
    const pet = leafGeo(0.1, 0.045, { bend: -0.3, fold: 0.1, segs: 4 });
    for (const a of [0.9, -0.9]) P.add('glow', pet, F.clone().multiply(new M4().makeRotationY(a)).multiply(new M4().makeRotationX(0.6)), '#e8f4cf', '#fbfff0');
    const lip = leafGeo(0.09, 0.06, { bend: 0.6, fold: 0.3, segs: 4, prof: (v) => Math.sqrt(Math.sin(Math.PI * Math.pow(v, 0.6))) });
    P.add('glow', lip, F.clone().multiply(new M4().makeRotationY(Math.PI)).multiply(new M4().makeRotationX(1.6)), '#fff8f8', '#e8436a');
  }
  return { group: P.build(mats) };
}

function sunflower() {
  const R = rng(88), P = new Parts();
  const mats = makeMats();
  const top = new V3(0.06, 1.65, 0.06);
  const stem = new THREE.CubicBezierCurve3(new V3(0, 0, 0), new V3(0.08, 0.6, -0.04), new V3(-0.05, 1.2, 0.05), top);
  P.add('solid', taperTube(stem, 0.038, 0.026, 14, 7), null, '#3f7a2e', '#7ab446');
  const lf = leafGeo(0.42, 0.3, { bend: 0.35, fold: 0.18, segs: 8, prof: (v) => Math.sin(Math.PI * Math.pow(v, 0.55)) });
  for (let i = 0; i < 8; i++) {
    const t = 0.12 + i * 0.1;
    const p = stem.getPointAt(t);
    const az = i * 2.4;
    const out = new V3(Math.cos(az), 0.25 - t * 0.2, Math.sin(az)).normalize();
    const s = 1.1 - t * 0.6;
    const pe = p.clone().addScaledVector(out, 0.1 * s);
    P.add('solid', taperTube(new THREE.LineCurve3(p, pe), 0.008, 0.006, 1, 4), null, '#4f8a36', '#6aa848');
    P.add('leaf', lf, orientM(pe, out, Math.PI / 2 - az, s).multiply(new M4().makeRotationY(Math.PI / 2)), '#2e6e2a', '#6fbf4a');
  }
  // 花盘（局部 +Y 为正面）
  const face = new V3(0.1, 0.55, 1).normalize();
  const H = orientM(top, face, 0, 1);
  P.add('solid', new THREE.CylinderGeometry(0.3, 0.22, 0.07, 28), H.clone().multiply(new M4().makeTranslation(0, -0.01, 0)), '#3d6a26', '#557f30');
  const seed = new THREE.OctahedronGeometry(0.0115, 0);
  const N = 520, ca = new Color('#d8c43a'), cb = new Color('#3a1f0e'), c = new Color();
  for (let n = 0; n < N; n++) {
    const r = 0.27 * Math.sqrt(n / N), th = n * 2.39996323;
    const y = 0.03 + 0.03 * (1 - (r * r) / 0.073);
    c.copy(ca).lerp(cb, Math.min(1, Math.sqrt(n / N) * 1.6));
    P.add('solid', seed, H.clone().multiply(new M4().makeTranslation(Math.cos(th) * r, y, Math.sin(th) * r)), c, c);
  }
  const ray = leafGeo(0.2, 0.06, { bend: -0.08, fold: 0.25, segs: 5, prof: (v) => Math.sin(Math.PI * Math.pow(v, 0.6)) });
  for (let L = 0; L < 2; L++) for (let i = 0; i < 21; i++) {
    const a = (i / 21) * TAU + L * 0.15;
    const m = H.clone().multiply(new M4().makeRotationY(a)).multiply(new M4().makeTranslation(0, 0.02 - L * 0.01, 0.26)).multiply(new M4().makeRotationX(1.42 + L * 0.12 + (R() - 0.5) * 0.15));
    P.add('glow', ray, m, '#ff9a00', '#ffe14a');
  }
  return { group: P.build(mats) };
}

function saguaro() {
  const R = rng(99), P = new Parts();
  const mats = makeMats();
  P.add('rock', new THREE.IcosahedronGeometry(0.5, 1), new M4().compose(new V3(0, -0.12, 0), new Q(), new V3(1.5, 0.35, 1.3)), '#a07a4a', '#e2c48a');
  const ribs = 12;
  const prof = (R0, cap) => (t, a) => {
    const base = t < cap ? 1 : Math.sqrt(Math.max(0.004, 1 - Math.pow((t - cap) / (1 - cap), 2)));
    return R0 * base * (1 + 0.09 * Math.cos(ribs * a)) * (t < 0.04 ? 1.06 : 1);
  };
  const addCol = (curve, R0, cap) => {
    const g = taperTube(curve, 0, 0, 22, 48, prof(R0, cap));
    g.computeVertexNormals();
    P.add('solid', g, null, '#2f6e34', '#5ea64c');
  };
  const main = new THREE.LineCurve3(new V3(0, 0, 0), new V3(0, 2.0, 0));
  addCol(main, 0.17, 0.88);
  const arms = [[0.0, 0.75, 0.48, 0.65], [3.3, 1.0, 0.4, 0.5], [1.7, 0.6, 0.35, 0.45]];
  for (const [az, h, out, up] of arms) {
    const d = new V3(Math.cos(az), 0, Math.sin(az));
    const p0 = new V3(0, h, 0).addScaledVector(d, 0.05);
    const c = new THREE.CubicBezierCurve3(p0, p0.clone().addScaledVector(d, out * 0.9), p0.clone().addScaledVector(d, out).add(new V3(0, 0.12, 0)), p0.clone().addScaledVector(d, out).add(new V3(0, up + 0.2, 0)));
    addCol(c, 0.1, 0.8);
    const tip = c.getPointAt(1);
    for (let i = 0; i < 3; i++) addFlower(P, 'glow', orientM(tip.clone().add(new V3((R() - 0.5) * 0.08, -0.02, (R() - 0.5) * 0.08)), new V3((R() - 0.5) * 0.6, 1, (R() - 0.5) * 0.6), 0, 0.8), { n: 7, len: 0.05, wid: 0.035, open: 0.9, cup: 0.3, c0: '#f6f2dc', c1: '#ffffff', center: '#ffd23a', cr: 0.014 });
  }
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU;
    addFlower(P, 'glow', orientM(new V3(Math.cos(a) * 0.07, 1.98, Math.sin(a) * 0.07), new V3(Math.cos(a) * 0.5, 1, Math.sin(a) * 0.5), 0, 1), { n: 7, len: 0.06, wid: 0.04, open: 0.9, cup: 0.3, c0: '#f6f2dc', c1: '#ffffff', center: '#ffd23a', cr: 0.016 });
  }
  // 刺座（沿棱）
  const sp = ball(0.008, 0);
  for (let k = 0; k < ribs; k++) {
    const a = (k / ribs) * TAU;
    for (let y = 0.1; y < 1.8; y += 0.11) P.add('glow', sp, new M4().makeTranslation(Math.cos(a) * 0.186, y + (k % 2) * 0.05, Math.sin(a) * 0.186), '#fff3c0', '#fff3c0');
  }
  return { group: P.build(mats) };
}

function treefern() {
  const R = rng(111), P = new Parts();
  const mats = makeMats();
  P.add('rock', new THREE.IcosahedronGeometry(0.35, 1), new M4().compose(new V3(0, -0.05, 0), new Q(), new V3(1.3, 0.4, 1.2)), '#22362a', '#46684a');
  const trunk = new THREE.QuadraticBezierCurve3(new V3(0, 0, 0), new V3(0.08, 0.7, 0), new V3(-0.02, 1.35, 0.02));
  P.add('solid', taperTube(trunk, 0, 0, 16, 10, (t, a) => (0.09 - t * 0.02) * (1 + 0.12 * Math.cos(a * 7) * Math.cos(t * 50))), null, '#2b1d14', '#5a4030');
  const top = trunk.getPointAt(1);
  const pin = leafGeo(1, 0.13, { bend: 0.1, fold: 0.15, segs: 9, prof: (v) => Math.sin(Math.PI * Math.pow(v, 0.7)) * (0.65 + 0.35 * Math.abs(Math.sin(v * 28))) });
  const NF = 13;
  for (let f = 0; f < NF; f++) {
    const az = (f / NF) * TAU + R() * 0.2;
    const d = new V3(Math.cos(az), 0, Math.sin(az));
    const L = 0.95 + R() * 0.3, lift = 0.25 + R() * 0.3;
    const c = new THREE.CubicBezierCurve3(top.clone(), top.clone().addScaledVector(d, 0.25 * L).add(new V3(0, 0.35 * L + lift * 0.3, 0)), top.clone().addScaledVector(d, 0.75 * L).add(new V3(0, 0.2 * L + lift * 0.2, 0)), top.clone().addScaledVector(d, 1.1 * L).add(new V3(0, -0.3 * L + lift * 0.3, 0)));
    P.add('solid', taperTube(c, 0.014, 0.003, 12, 4), null, '#4a5a2a', '#7aa04a');
    for (let t = 0.08; t < 0.97; t += 0.042) {
      const p = c.getPointAt(t), T = c.getTangentAt(t);
      const S = T.clone().cross(UP).normalize();
      const Nrm = S.clone().cross(T).normalize();
      const pl = 0.27 * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.05)), 0.7) * (1 - 0.35 * t) + 0.02;
      for (const side of [1, -1]) {
        const dir = S.clone().multiplyScalar(side).addScaledVector(T, 0.45).normalize();
        P.add('leaf', pin, basisM(p, dir, Nrm, 1).multiply(new M4().makeScale(pl * 0.35 / 0.13 * 0.13 / 0.35, pl, 1)), '#1e6a3a', '#7ee08a');
      }
    }
  }
  // 卷曲的嫩芽（提琴头）
  for (let k = 0; k < 3; k++) {
    const az = k * 2.1 + 0.5;
    const d = new V3(Math.cos(az), 0, Math.sin(az));
    const pts = [top.clone(), top.clone().add(new V3(0, 0.12, 0)).addScaledVector(d, 0.03)];
    const c0 = top.clone().add(new V3(0, 0.28, 0)).addScaledVector(d, 0.08);
    for (let i = 0; i <= 16; i++) {
      const th = (i / 16) * Math.PI * 2.6, r = 0.09 * Math.pow(0.86, i);
      pts.push(c0.clone().addScaledVector(d, Math.sin(th) * r).add(new V3(0, Math.cos(th) * r - 0.0, 0)));
    }
    const cv = new THREE.CatmullRomCurve3(pts);
    P.add('glow', taperTube(cv, 0.016, 0.008, 40, 5), null, '#8a9a3a', '#c8e070');
  }
  return { group: P.build(mats) };
}

function nepenthes() {
  const R = rng(122), P = new Parts();
  const mats = makeMats();
  P.add('rock', new THREE.IcosahedronGeometry(0.35, 1), new M4().compose(new V3(0, -0.05, 0), new Q(), new V3(1.3, 0.35, 1.2)), '#2a2a1e', '#4e5a34');
  // 攀援茎
  const pts = [];
  for (let i = 0; i <= 20; i++) { const t = i / 20; pts.push(new V3(Math.cos(t * 7) * 0.08 * (1 - t * 0.4), t * 1.85, Math.sin(t * 7) * 0.08 * (1 - t * 0.4))); }
  const stem = new THREE.CatmullRomCurve3(pts);
  P.add('solid', taperTube(stem, 0.022, 0.012, 40, 6), null, '#4a6a2a', '#8a4a3a');
  const lathePts = [[0.0, 0], [0.05, 0.008], [0.085, 0.05], [0.092, 0.11], [0.072, 0.19], [0.056, 0.25], [0.062, 0.29], [0.074, 0.31]].map(([r, y]) => new THREE.Vector2(r, y));
  const pitcherG = new THREE.LatheGeometry(lathePts, 18);
  const lidG = leafGeo(0.12, 0.11, { bend: -0.15, fold: 0.05, segs: 4, prof: (v) => Math.sqrt(Math.sin(Math.PI * Math.pow(v, 0.7))) });
  const lf = leafGeo(0.42, 0.1, { bend: 0.15, fold: 0.15, segs: 7 });
  const nodes = [[0.15, 0.3, 1.25, true], [0.3, 2.4, 1.0, true], [0.45, 4.3, 0.85, false], [0.6, 1.0, 0.9, false], [0.75, 3.2, 0.75, false], [0.9, 5.5, 0.6, false]];
  for (const [t, az, s, ground] of nodes) {
    const p = stem.getPointAt(t);
    const out = new V3(Math.cos(az), 0.15, Math.sin(az)).normalize();
    P.add('leaf', lf, orientM(p, out, 0, s).multiply(new M4().makeRotationY(Math.PI / 2)), '#3f8a2e', '#9ad65a');
    const leafTip = p.clone().addScaledVector(out, 0.42 * s);
    let pp;
    if (ground) pp = new V3(leafTip.x * 1.1, 0.04, leafTip.z * 1.1);
    else pp = leafTip.clone().add(new V3(out.x * 0.08, -0.35 * s, out.z * 0.08));
    const mid = leafTip.clone().lerp(pp, 0.5).add(new V3(out.x * 0.12, ground ? 0.02 : -0.1, out.z * 0.12));
    const tc = new THREE.QuadraticBezierCurve3(leafTip, mid, pp.clone().add(new V3(0, 0.0, 0)));
    P.add('solid', taperTube(tc, 0.006, 0.005, 8, 4), null, '#5a8a2e', '#8a6a2e');
    const ps = s * 1.35;
    const PM = new M4().compose(pp, new Q().setFromEuler(new THREE.Euler((R() - 0.5) * 0.2, az, ground ? 0 : 0.08)), new V3(ps, ps, ps));
    P.add('leaf', pitcherG, PM, '#6fb23a', '#d0304e');
    P.add('glow', new THREE.TorusGeometry(0.068, 0.014, 6, 20), PM.clone().multiply(new M4().makeTranslation(0, 0.31, 0)).multiply(new M4().makeRotationX(Math.PI / 2)), '#ff4a6a', '#7a0e2a');
    P.add('leaf', lidG, PM.clone().multiply(new M4().makeTranslation(0, 0.31, -0.06)).multiply(new M4().makeRotationX(-0.55)), '#9a2a3a', '#d84a5a');
  }
  return { group: P.build(mats) };
}

function mimosa() {
  const R = rng(133), P = new Parts();
  const mats = makeMats();
  P.add('rock', new THREE.IcosahedronGeometry(0.3, 1), new M4().compose(new V3(0, -0.04, 0), new Q(), new V3(1.3, 0.35, 1.2)), '#2e2a20', '#5a5a3a');
  const leafletG = leafGeo(0.05, 0.016, { bend: 0.05, fold: 0.1, segs: 3 }).rotateZ(-Math.PI / 2); // 指向 +X
  const records = []; // 每片小叶：{frame, s, side, leaf}
  const leaves = []; // 每片复叶的折叠状态
  const stems = [[0.0, 1.2], [2.1, 1.0], [4.2, 0.85]];
  for (const [az, h] of stems) {
    const d = new V3(Math.cos(az), 0, Math.sin(az));
    const top = new V3(0, h, 0).addScaledVector(d, 0.25);
    const c = new THREE.QuadraticBezierCurve3(new V3(0, 0, 0).addScaledVector(d, 0.03), new V3(0, h * 0.5, 0).addScaledVector(d, 0.05), top);
    P.add('solid', taperTube(c, 0.016, 0.008, 10, 5), null, '#6a3a2a', '#b06a48');
    for (let t = 0.22; t < 0.98; t += 0.15) {
      const p = c.getPointAt(t);
      const la = az + t * 9 + R() * 0.5;
      const out = new V3(Math.cos(la), 0.4, Math.sin(la)).normalize();
      const pe = p.clone().addScaledVector(out, 0.18);
      P.add('solid', taperTube(new THREE.LineCurve3(p, pe), 0.005, 0.004, 1, 4), null, '#7a4a32', '#9a6a3a');
      const leaf = { f: 0, target: 0, delay: 0, hold: 0, pos: pe.clone() };
      leaves.push(leaf);
      const horiz = new V3(out.x, 0, out.z).normalize();
      const sideV = new V3(-horiz.z, 0, horiz.x);
      for (let k = 0; k < 4; k++) {
        const spread = -0.45 + k * 0.3;
        const pd = horiz.clone().multiplyScalar(Math.cos(spread)).addScaledVector(sideV, Math.sin(spread)); pd.y = 0.08; pd.normalize();
        const pl = 0.3;
        P.add('solid', taperTube(new THREE.LineCurve3(pe, pe.clone().addScaledVector(pd, pl)), 0.003, 0.002, 1, 3), null, '#7aa04a', '#9ac060');
        const frame = basisM(pe, pd, UP, 1);
        for (let j = 1; j <= 14; j++) {
          const s = (j / 14.5) * pl;
          const sz = 1.05 - Math.abs(j - 7) / 20;
          for (const side of [1, -1]) records.push({ frame, s, side, leaf, sz });
        }
      }
    }
    // 粉色绒球花
    const fp = top.clone().add(new V3(0, 0.12, 0));
    P.add('solid', taperTube(new THREE.LineCurve3(top, fp), 0.004, 0.003, 1, 3), null, '#8a5a3a', '#8a5a3a');
    const fil = new THREE.CylinderGeometry(0.0035, 0.0035, 0.1, 3).translate(0, 0.05, 0);
    P.add('glow', ball(0.025, 1), new M4().makeTranslation(fp.x, fp.y, fp.z), '#ff6ad0', '#ff6ad0');
    for (let i = 0; i < 46; i++) {
      const y = 1 - (i / 45) * 2, r = Math.sqrt(1 - y * y), th = i * 2.39996;
      P.add('glow', fil, orientM(fp, new V3(Math.cos(th) * r, y, Math.sin(th) * r), 0, 1), '#ff4fc8', '#ffe0f6');
    }
  }
  const group = P.build(mats);
  const lm = stdMat({ side: THREE.DoubleSide, glow: 0.1 });
  const inst = new THREE.InstancedMesh(leafletG, lm, records.length);
  const cAttr = new Float32Array(leafletG.attributes.position.count * 3);
  const ca = new Color('#3f9a3a'), cb = new Color('#a8f07a');
  for (let i = 0; i < leafletG.attributes.position.count; i++) { const t = Math.min(1, leafletG.attributes.position.getX(i) / 0.05); const c = ca.clone().lerp(cb, t); cAttr.set([c.r, c.g, c.b], i * 3); }
  leafletG.setAttribute('color', new THREE.BufferAttribute(cAttr, 3));
  group.add(inst);
  const m = new M4(), r = new M4(), sc = new M4();
  const OPEN = 0.12, CLOSED = 1.35;
  function write() {
    for (let i = 0; i < records.length; i++) {
      const o = records[i];
      const ang = OPEN + (CLOSED - OPEN) * o.leaf.f;
      m.copy(o.frame).multiply(r.makeTranslation(0, o.s, 0));
      // 小叶随叶轴前倾，合拢时朝上贴紧
      m.multiply(r.makeRotationY(-o.side * ang)).multiply(r.makeRotationZ(o.side * 0.35 * (1 - o.leaf.f)));
      m.multiply(sc.makeScale(o.side * o.sz, o.sz, o.sz));
      inst.setMatrixAt(i, m);
    }
    inst.instanceMatrix.needsUpdate = true;
  }
  write();
  inst.computeBoundingSphere();
  let dirty = false;
  return {
    group,
    touch(localPoint) {
      for (const L of leaves) {
        const d = localPoint ? L.pos.distanceTo(localPoint) : R();
        L.delay = d * 0.9; L.target = 1; L.hold = 3.2 + d * 0.9;
      }
      dirty = true;
    },
    update(dt) {
      if (!dirty) return;
      let moving = false;
      for (const L of leaves) {
        if (L.delay > 0) { L.delay -= dt; moving = true; continue; }
        if (L.target === 1) {
          L.f = Math.min(1, L.f + dt * 3.2);
          L.hold -= dt; if (L.hold <= 0) L.target = 0;
          moving = true;
        } else if (L.f > 0) { L.f = Math.max(0, L.f - dt * 0.35); moving = true; }
      }
      write();
      dirty = moving;
    },
  };
}

export const BUILDERS = { ginkgo, sakura, bamboo, lotus, mei, pine, orchid, sunflower, saguaro, treefern, nepenthes, mimosa };

export function normalizePlant(group, H = 2.2, Rm = 1.25) {
  group.updateMatrixWorld(true);
  const box = new THREE.Box3();
  group.traverse((o) => { if (o.isMesh && !o.isInstancedMesh) { o.geometry.computeBoundingBox(); box.union(o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld)); } });
  const size = box.getSize(new V3());
  const s = Math.min(H / size.y, (2 * Rm) / Math.max(size.x, size.z));
  const wrap = new THREE.Group();
  wrap.add(group);
  group.scale.setScalar(s);
  group.position.set((-(box.min.x + box.max.x) / 2) * s, -box.min.y * s, (-(box.min.z + box.max.z) / 2) * s);
  return wrap;
}
