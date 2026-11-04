// 造景：可雕刻的底床、程序化石头（青龙石 / 松皮石 / 鹅卵石）、沉木（杜鹃根 / 沉木）、水草；布局管理与地面高度查询
import * as THREE from "three";
import { T, U, Geo, col, mix, clamp, lerp, smooth, rng, fbm3, noise3, icosphere, patch } from "./gfx.js";
import { NX, NZ } from "./presets.js";
import { PL } from "./data.js";

/* ---------------- 石头 ---------------- */
export function rockGeo(style, seed) {
  const R = rng(seed * 13 + 7), { v, f } = icosphere(4);
  const g = new Geo();
  const sx = style === "pebble" ? 1.0 + R() * 0.3 : 0.75 + R() * 0.35, sy = style === "seiryu" ? 1.0 + R() * 0.7 : style === "matsu" ? 0.75 + R() * 0.5 : 0.45 + R() * 0.15, sz = style === "pebble" ? 0.75 + R() * 0.2 : 0.6 + R() * 0.3;
  const lean = (R() - 0.5) * 0.5, off = R() * 100;
  const pts = v.map(([x, y, z]) => {
    let d;
    if (style === "seiryu") {
      const rid = 1 - Math.abs(fbm3(x * 1.4 + off, y * 1.4, z * 1.4, 4));
      d = 0.82 + 0.32 * rid * rid + 0.07 * fbm3(x * 6 + off, y * 6, z * 6, 3);
      // 平切面让棱角更分明
      const pl = Math.abs(noise3(x * 2 + off, y * 2, z * 2, 5)); d -= 0.06 * smooth(0.0, 0.25, pl);
    } else if (style === "matsu") {
      d = 0.9 + 0.2 * fbm3(x * 1.2 + off, y * 1.2, z * 1.2, 3) + 0.035 * Math.sin(y * 26 + fbm3(x * 3, y * 3, z * 3, 2) * 5) + 0.04 * fbm3(x * 8, y * 8, z * 8 + off, 2);
    } else d = 1 + 0.06 * fbm3(x * 1.5 + off, y * 1.5, z * 1.5, 3) + 0.01 * fbm3(x * 9, y * 9, z * 9, 2);
    let px = x * d * sx, py = y * d * sy, pz = z * d * sz;
    px += py * lean;
    if (py < -0.25 * sy) py = -0.25 * sy + (py + 0.25 * sy) * 0.15;
    return [px, py + 0.22 * sy, pz, d, x, y, z];
  });
  const base = style === "seiryu" ? ["#545c62", "#6f787d", "#8a9296"] : style === "matsu" ? ["#5a4636", "#7e6a58", "#9a8a78"] : ["#7c776c", "#a39c8d", "#bdb6a6"];
  const B = base.map(col), vein = col("#d9ddd8"), rust = col("#7a4426");
  for (const p of pts) {
    const [, , , d, x, y, z] = p;
    const n = fbm3(x * 3 + off, y * 3, z * 3, 3);
    let c = mix(B[0], B[1], clamp(0.5 + n * 1.4, 0, 1));
    c = mix(c, B[2], smooth(0.95, 1.12, d) * 0.6);
    c = mix(c, B[0].map((q) => q * 0.55), smooth(0.92, 0.8, d) * 0.7);
    if (style === "seiryu") { const vv = Math.abs(fbm3(x * 2.2 + 9, y * 5.5, z * 2.2, 3)); c = mix(c, vein, smooth(0.05, 0.0, vv) * 0.85); }
    if (style === "matsu") { const bandv = Math.sin(y * 26 + n * 4); c = mix(c, bandv > 0.5 ? rust : B[2], Math.abs(bandv) * 0.35); }
    if (style === "pebble") c = mix(c, col("#5c574e"), smooth(0.35, 0.6, noise3(x * 14, y * 14, z * 14, 2)) * 0.5);
    g.v(p[0], p[1], p[2], c);
  }
  for (const [a, b, c] of f) g.t(a, b, c);
  const geo = g.build();
  const bb = geo.boundingBox;
  return { geo, r: Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z) * 0.42, h: bb.max.y };
}

/* ---------------- 沉木 ---------------- */
export function woodGeo(style, seed) {
  const R = rng(seed * 31 + 3), g = new Geo(), spheres = [];
  const dark = col("#2e2116"), mid = col("#5a3e28"), light = col("#8a7058"), grey = col("#9a8e80");
  const spider = style === "spider";
  const branch = (p0, dir, len, r0, depth) => {
    const pts = [p0.clone()], n = spider ? 7 : 6;
    let d = dir.clone();
    for (let i = 1; i <= n; i++) {
      d.add(new THREE.Vector3((R() - 0.5) * 0.7, (R() - 0.4) * 0.35 * (spider ? 1 : 0.6), (R() - 0.5) * 0.7)).normalize();
      if (!spider) d.y = clamp(d.y, -0.15, 0.55);
      pts.push(pts[i - 1].clone().addScaledVector(d, len / n));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    const S = 22, A = 9, fr = curve.computeFrenetFrames(S, false), s0 = g.n;
    for (let i = 0; i <= S; i++) {
      const u = i / S, c = curve.getPointAt(u), rad = r0 * (1 - u * 0.78) * (1 + 0.12 * Math.sin(u * 20 + seed));
      for (let k = 0; k <= A; k++) {
        const a = (k / A) * Math.PI * 2, N = fr.normals[i], Bn = fr.binormals[i];
        const gr = noise3(k * 0.9, u * 18 + depth * 7, seed, 4);
        const rr = rad * (1 + 0.16 * gr);
        const p = c.clone().addScaledVector(N, Math.cos(a) * rr).addScaledVector(Bn, Math.sin(a) * rr);
        let cc = mix(dark, mid, clamp(0.5 + gr * 1.2, 0, 1));
        cc = mix(cc, light, smooth(0.25, 0.6, Math.abs(Math.sin(a * 3 + u * 9 + gr * 3))) * 0.35);
        cc = mix(cc, grey, smooth(0.6, 1, u) * 0.35 + (depth > 1 ? 0.1 : 0));
        g.v(p.x, p.y, p.z, cc);
      }
      if (i % 4 === 0) spheres.push([c.x, c.y, c.z, Math.max(rad * 1.6, 0.08)]);
    }
    for (let i = 0; i < S; i++) for (let k = 0; k < A; k++) { const a = s0 + i * (A + 1) + k, b = a + A + 1; g.q(a, a + 1, b + 1, b); }
    // 端头封口
    const end = curve.getPointAt(1), ei = g.v(end.x, end.y, end.z, grey);
    for (let k = 0; k < A; k++) g.t(s0 + S * (A + 1) + k, s0 + S * (A + 1) + k + 1, ei);
    if (depth < (spider ? 3 : 2)) {
      const kids = spider ? 2 + Math.floor(R() * 2) : 1 + Math.floor(R() * 2);
      for (let j = 0; j < kids; j++) {
        const u = 0.3 + R() * 0.55, p = curve.getPointAt(u), t = curve.getTangentAt(u);
        const nd = t.clone().add(new THREE.Vector3((R() - 0.5) * 1.6, R() * (spider ? 1.1 : 0.4), (R() - 0.5) * 1.6)).normalize();
        branch(p, nd, len * (0.5 + R() * 0.25), r0 * (1 - u * 0.75) * 0.75, depth + 1);
      }
    }
  };
  if (spider) {
    const n = 2 + Math.floor(R() * 2);
    for (let i = 0; i < n; i++) branch(new THREE.Vector3((R() - 0.5) * 0.3, 0.0, (R() - 0.5) * 0.3), new THREE.Vector3((R() - 0.5) * 0.9, 1, (R() - 0.5) * 0.6).normalize(), 1.6 + R() * 0.8, 0.07 + R() * 0.03, 0);
  } else {
    branch(new THREE.Vector3(-0.8, 0.05, 0), new THREE.Vector3(1, 0.35, (R() - 0.5) * 0.4).normalize(), 2.0 + R() * 0.6, 0.17 + R() * 0.05, 0);
    branch(new THREE.Vector3(-0.6, 0.1, 0.05), new THREE.Vector3(-0.6, 0.6, (R() - 0.5)).normalize(), 0.9, 0.12, 1);
  }
  return { geo: g.build(), spheres };
}

/* ---------------- 水草 ---------------- */
function blade(g, bx, bz, ang, H, W, lean, c0, c1, sway, segs = 5, twist = 0) {
  const dx = Math.cos(ang), dz = Math.sin(ang), px = -dz, pz = dx, s0 = g.n;
  for (let i = 0; i <= segs; i++) {
    const s = i / segs, w = W * Math.pow(1 - s, 0.6) + W * 0.08;
    const cx = bx + dx * lean * s * s, cy = s * H, cz = bz + dz * lean * s * s;
    const tw = twist * s, qx = px * Math.cos(tw), qz = pz * Math.cos(tw);
    const c = mix(c0, c1, s);
    g.v(cx - qx * w, cy, cz - qz * w, c, 1, sway * Math.pow(s, 1.5) * H, 0);
    g.v(cx + qx * w, cy + Math.sin(tw) * w, cz + qz * w, mix(c, c1, 0.15), 1, sway * Math.pow(s, 1.5) * H, 0);
  }
  for (let i = 0; i < segs; i++) g.q(s0 + i * 2, s0 + i * 2 + 1, s0 + i * 2 + 3, s0 + i * 2 + 2);
}
/** 叶片：中脉略凸、边缘有起伏 */
function leaf(g, base, dir, up, len, wid, c0, c1, swayAt, shape = 0.8, curl = 0.1, rib = 0.3) {
  const side = new THREE.Vector3().crossVectors(dir, up).normalize();
  const nu = 6, s0 = g.n;
  for (let i = 0; i <= nu; i++) {
    const l = i / nu, prof = Math.pow(Math.sin(Math.PI * Math.min(1, l * 0.98 + 0.02)), shape);
    for (const w of [-1, 0, 1]) {
      const p = base.clone().addScaledVector(dir, l * len).addScaledVector(side, w * wid * prof).addScaledVector(up, curl * l * l * len - Math.abs(w) * wid * prof * 0.25);
      const c = w === 0 ? mix(mix(c0, c1, l), [1, 1, 0.8], rib * 0.25) : mix(c0, c1, l * 0.9 + Math.abs(w) * 0.1);
      g.v(p.x, p.y, p.z, c, 1, swayAt + l * len * 0.6, 0);
    }
  }
  for (let i = 0; i < nu; i++) { const a = s0 + i * 3; g.q(a, a + 3, a + 4, a + 1); g.q(a + 1, a + 4, a + 5, a + 2); }
}

export function plantGeo(kind, seed) {
  const R = rng(seed * 17 + 5), g = new Geo(), V = (x, y, z) => new THREE.Vector3(x, y, z);
  let top = 0.3, spread = 0.5;
  if (kind === "hairgrass") {
    for (let i = 0; i < 190; i++) {
      const r = Math.sqrt(R()) * 0.55, a = R() * 6.28, H = 0.16 + R() * 0.26;
      blade(g, Math.cos(a) * r, Math.sin(a) * r, R() * 6.28, H, 0.006, 0.04 + R() * 0.08, col(R() < 0.5 ? "#2f6f22" : "#3d7f28"), col(R() < 0.6 ? "#9ad85a" : "#7cc444"), 1.2, 4, R() * 2);
    }
    top = 0.3;
  } else if (kind === "hc") {
    const c0 = col("#3f9a26"), c1 = col("#8fe04a");
    for (let i = 0; i < 300; i++) {
      const r = Math.sqrt(R()) * 0.5, a = R() * 6.28, y = 0.02 + 0.09 * (1 - r * r / 0.25) + R() * 0.02;
      const dir = V(Math.cos(R() * 6.28), 0.35 + R() * 0.4, Math.sin(R() * 6.28)).normalize();
      leaf(g, V(Math.cos(a) * r, y, Math.sin(a) * r), dir, V(0, 1, 0), 0.04 + R() * 0.015, 0.016, mix(c0, c1, R()), c1, 0.05, 0.9, 0.2, 0);
    }
    top = 0.12;
  } else if (kind === "rotala" || kind === "macrandra") {
    const red = kind === "macrandra";
    const n = red ? 6 : 8;
    for (let s = 0; s < n; s++) {
      const bx = (R() - 0.5) * 0.45, bz = (R() - 0.5) * 0.35, H = (red ? 1.0 : 1.2) + R() * 0.8, lean = (R() - 0.5) * 0.3;
      blade(g, bx, bz, R() * 6.28, H, 0.008, lean, col(red ? "#5a2a1a" : "#3a5a22"), col(red ? "#a03a2a" : "#7a9a4a"), 0.7, 8);
      const nodes = Math.floor(H / (red ? 0.075 : 0.05));
      for (let k = 1; k <= nodes; k++) {
        const s01 = k / nodes, y = s01 * H;
        const cx = bx + Math.cos(0) * lean * s01 * s01, cz = bz;
        const tip = smooth(0.45, 1, s01);
        const c0 = red ? mix(col("#7a3a1e"), col("#e0303a"), tip) : mix(col("#3f8a2e"), col("#e07890"), tip * 0.9);
        const c1 = red ? mix(col("#c8483a"), col("#ff6a5a"), tip) : mix(col("#7ac04a"), col("#ffa0b0"), tip * 0.9);
        const L = (red ? 0.13 : 0.075) * (1 - s01 * 0.35), Wd = red ? 0.045 : 0.018;
        for (const sd of [0, Math.PI]) {
          const a = k * 1.7 + sd + R() * 0.3;
          const dir = V(Math.cos(a), 0.45 + s01 * 0.5, Math.sin(a)).normalize();
          leaf(g, V(cx, y, cz), dir, V(0, 1, 0), L, Wd, c0, c1, 0.7 * y, 0.85, red ? 0.05 : 0.15, 0.5);
        }
      }
    }
    top = 1.6; spread = 0.3;
  } else if (kind === "vallis") {
    for (let i = 0; i < 16; i++) {
      const r = Math.sqrt(R()) * 0.3, a = R() * 6.28, H = 2.6 + R() * 1.6;
      blade(g, Math.cos(a) * r, Math.sin(a) * r, R() * 6.28, H, 0.032, 0.4 + R() * 0.8, col("#4f8f2f"), col(R() < 0.5 ? "#a8d870" : "#8cc85a"), 0.9, 14, (R() - 0.5) * 3);
    }
    top = 3.2; spread = 0.3;
  } else if (kind === "sword") {
    for (let i = 0; i < 15; i++) {
      const a = (i / 15) * 6.28 + R() * 0.4, out = 0.25 + R() * 0.45;
      const L = 0.75 + R() * 0.6;
      const dir = V(Math.cos(a) * out, 1, Math.sin(a) * out).normalize();
      // 叶柄
      blade(g, 0, 0, a, L * 0.35 * dir.y, 0.008, L * 0.35 * out, col("#4a7a2a"), col("#5f9a32"), 0.6, 3);
      const b = V(Math.cos(a) * L * 0.35 * out * 0.9, L * 0.35 * dir.y, Math.sin(a) * L * 0.35 * out * 0.9);
      const d2 = V(Math.cos(a) * (out + 0.35), 1, Math.sin(a) * (out + 0.35)).normalize();
      leaf(g, b, d2, V(-Math.sin(a), 0, Math.cos(a)).cross(d2).normalize().negate(), L * 0.75, 0.075, col("#2f7a24"), col("#6cc040"), 0.35, 0.75, -0.08, 0.8);
    }
    top = 1.0; spread = 0.5;
  } else if (kind === "anubias") {
    blade(g, -0.12, 0, 0, 0.02, 0.03, 0.24, col("#5a4a30"), col("#6a5a38"), 0.1, 3);
    for (let i = 0; i < 9; i++) {
      const a = R() * 6.28, b = V((R() - 0.5) * 0.24, 0.02, (R() - 0.5) * 0.08);
      const st = V(Math.cos(a) * 0.5, 0.8 + R() * 0.4, Math.sin(a) * 0.5).normalize();
      blade(g, b.x, b.z, a, 0.08, 0.006, 0.04, col("#2a4a1a"), col("#3a6a22"), 0.2, 3);
      const lb = b.clone().addScaledVector(st, 0.09);
      leaf(g, lb, V(Math.cos(a), 0.6, Math.sin(a)).normalize(), V(0, 1, 0), 0.2 + R() * 0.07, 0.07, col("#163f16"), col("#2d6a24"), 0.08, 0.55, -0.05, 0.6);
    }
    top = 0.25; spread = 0.3;
  } else if (kind === "fern") {
    for (let i = 0; i < 9; i++) {
      const a = R() * 6.28, L = 0.4 + R() * 0.25;
      leaf(g, V((R() - 0.5) * 0.12, 0.02, (R() - 0.5) * 0.06), V(Math.cos(a) * 0.55, 1, Math.sin(a) * 0.55).normalize(), V(0, 0, 1), L, 0.045, col("#2a5f22"), col("#5f9a3a"), 0.1, 0.7, -0.35, 0.9);
    }
    top = 0.5; spread = 0.3;
  } else if (kind === "moss") {
    for (let i = 0; i < 260; i++) {
      const r = Math.sqrt(R()) * 0.3, a = R() * 6.28, h = 0.03 + (1 - r / 0.3) * 0.12 * R();
      blade(g, Math.cos(a) * r, Math.sin(a) * r, R() * 6.28, h + 0.04, 0.012, 0.06 + R() * 0.05, col("#1f3f16"), col(R() < 0.5 ? "#4f7f2a" : "#3f6f22"), 0.4, 2, R() * 3);
    }
    top = 0.12; spread = 0.3;
  }
  return { geo: g.build(), top, spread };
}

/* ---------------- 布局管理 ---------------- */
const GX = 60, GZ = 30;
export class Scape {
  constructor(scene, env) {
    this.scene = scene; this.env = env; this.items = new Map(); this.obst = []; this.hide = []; this.decorMeshes = []; this.plantMeshes = [];
    this.grid = new Float32Array((GX + 1) * (GZ + 1));
    this.root = new THREE.Group(); scene.add(this.root);
    this.mats = {
      sub: patch(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96 }), "sub"),
      rock: patch(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0.02 }), "decor"),
      wood: patch(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }), "decor"),
      plant: patch(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, side: THREE.DoubleSide, emissive: 0x0c2a08, emissiveIntensity: 0.35 }), "plant"),
    };
    this.geoCache = new Map();
  }
  load(layout) {
    this.layout = layout;
    for (const id of [...this.items.keys()]) this.removeMesh(id);
    this.buildSub();
    for (const it of layout.items) this.addMesh(it, true);
    this.resolveDrops();
    this.refresh();
  }
  /* 底床 */
  hAt(i, j) { const s = this.layout.sub; return s.h[clamp(j, 0, NZ) * (NX + 1) + clamp(i, 0, NX)]; }
  mAt(i, j) { const s = this.layout.sub; return s.m[clamp(j, 0, NZ) * (NX + 1) + clamp(i, 0, NX)]; }
  subH(x, z) {
    const fx = clamp((x - T.X0) / T.W * NX, 0, NX), fz = clamp((z - T.Z0) / T.D * NZ, 0, NZ);
    const i = Math.min(NX - 1, Math.floor(fx)), j = Math.min(NZ - 1, Math.floor(fz)), u = fx - i, v = fz - j;
    return lerp(lerp(this.hAt(i, j), this.hAt(i + 1, j), u), lerp(this.hAt(i, j + 1), this.hAt(i + 1, j + 1), u), v);
  }
  ground(x, z) {
    const fx = clamp((x - T.X0) / T.W * GX, 0, GX), fz = clamp((z - T.Z0) / T.D * GZ, 0, GZ);
    const i = Math.min(GX - 1, Math.floor(fx)), j = Math.min(GZ - 1, Math.floor(fz)), u = fx - i, v = fz - j, G = this.grid, w = GX + 1;
    return lerp(lerp(G[j * w + i], G[j * w + i + 1], u), lerp(G[(j + 1) * w + i], G[(j + 1) * w + i + 1], u), v);
  }
  subColor(i, j, y01) {
    const soil = mix(col("#2a2119"), col("#3d2f22"), 0.5), sand = col("#c8b38c");
    let m = 0, n = 0;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { m += this.mAt(i + di, j + dj); n++; }
    return mix(soil, sand, m / n);
  }
  buildSub() {
    if (this.sub) { this.root.remove(this.sub); this.sub.geometry.dispose(); }
    const g = new Geo();
    for (let j = 0; j <= NZ; j++) for (let i = 0; i <= NX; i++) {
      const x = T.X0 + (i / NX) * T.W, z = T.Z0 + (j / NZ) * T.D;
      g.v(x, this.hAt(i, j), z, this.subColor(i, j));
    }
    for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) { const a = j * (NX + 1) + i; g.q(a, a + NX + 1, a + NX + 2, a + 1); }
    // 前、左、右的断面：分层的颜色
    const skirt = (pts, normalSign) => {
      const s0 = g.n, L = 6;
      for (const [x, z, h, mm] of pts) for (let k = 0; k <= L; k++) {
        const y = (k / L) * h, f = k / L;
        let c = mix(col("#1d1712"), col("#3a2c20"), f);
        if (f > 0.55) c = mix(c, mix(col("#4a3a2a"), col("#c8b38c"), mm), smooth(0.55, 1, f) * (0.3 + 0.7 * mm));
        if (f < 0.3) c = mix(c, col("#6a5a48"), 0.25 * (1 - f / 0.3));
        g.v(x, y + 0.025, z, c);
      }
      for (let i = 0; i < pts.length - 1; i++) for (let k = 0; k < L; k++) {
        const a = s0 + i * (L + 1) + k, b = a + L + 1;
        if (normalSign > 0) g.q(a, b, b + 1, a + 1); else g.q(a, a + 1, b + 1, b);
      }
    };
    const front = [], left = [], right = [];
    for (let i = 0; i <= NX; i++) front.push([T.X0 + (i / NX) * T.W, T.Z1 - 0.005, this.hAt(i, NZ), this.mAt(i, NZ)]);
    for (let j = 0; j <= NZ; j++) { left.push([T.X0 + 0.005, T.Z0 + (j / NZ) * T.D, this.hAt(0, j), this.mAt(0, j)]); right.push([T.X1 - 0.005, T.Z0 + (j / NZ) * T.D, this.hAt(NX, j), this.mAt(NX, j)]); }
    skirt(front, 1); skirt(left, 1); skirt(right, -1);
    this.sub = new THREE.Mesh(g.build(), this.mats.sub);
    this.sub.name = "substrate";
    this.root.add(this.sub);
  }
  /** 只更新顶点高度和颜色（雕刻时调用） */
  updateSub() { this.buildSub(); }

  /* 素材 */
  geoFor(it) {
    const key = it.t + ":" + it.k + ":" + it.seed;
    if (this.geoCache.has(key)) return this.geoCache.get(key);
    let r;
    if (it.t === "rock") r = rockGeo(it.k, it.seed);
    else if (it.t === "wood") r = woodGeo(it.k, it.seed);
    else r = plantGeo(it.k, it.seed);
    this.geoCache.set(key, r);
    return r;
  }
  addMesh(it, bulk) {
    const G = this.geoFor(it);
    const mat = it.t === "rock" ? this.mats.rock : it.t === "wood" ? this.mats.wood : this.mats.plant;
    const m = new THREE.Mesh(G.geo, mat);
    m.userData.item = it; m.userData.G = G;
    this.items.set(it.id, m);
    this.root.add(m);
    if (it.y == null && !it.drop) it.y = this.subH(it.x, it.z);
    this.place(it);
    if (it.t === "plant") this.plantMeshes.push(m); else this.decorMeshes.push(m);
    if (!bulk) this.refresh();
    return m;
  }
  removeMesh(id) {
    const m = this.items.get(id); if (!m) return;
    this.root.remove(m); this.items.delete(id);
    this.plantMeshes = this.plantMeshes.filter((q) => q !== m); this.decorMeshes = this.decorMeshes.filter((q) => q !== m);
  }
  place(it) {
    const m = this.items.get(it.id); if (!m) return;
    m.position.set(it.x, it.y ?? 0, it.z);
    m.rotation.set(0, it.ry || 0, 0);
    let s = it.s || 1;
    if (it.t === "plant") {
      const g = it.g ?? 0.8, carpet = it.k === "hc" || it.k === "hairgrass" || it.k === "moss";
      if (carpet) m.scale.set(s * (0.75 + 0.3 * g), s * (0.65 + 0.4 * g), s * (0.75 + 0.3 * g));
      else m.scale.set(s * (0.85 + 0.15 * g), s * (0.45 + 0.55 * g), s * (0.85 + 0.15 * g));
      if (it.k === "vallis") m.scale.y = Math.min(m.scale.y, (T.WATER - 0.1 - (it.y ?? 0)) / 3.6);
    } else m.scale.setScalar(s);
    m.updateMatrixWorld();
  }
  /** 预设里的附着植物：从上往下落到石木或底床上 */
  resolveDrops() {
    const rc = new THREE.Raycaster(); rc.ray.direction.set(0, -1, 0);
    for (const it of this.layout.items) if (it.drop) {
      rc.ray.origin.set(it.x, 8, it.z);
      const hit = rc.intersectObjects(this.decorMeshes, false)[0];
      it.y = hit ? hit.point.y - 0.02 : this.subH(it.x, it.z);
      it.on = hit ? "decor" : "sub";
      delete it.drop; this.place(it);
    }
  }
  /** 布局改变后：重算地面高度、障碍、藏身点、光合气泡 */
  refresh() {
    for (const it of this.layout.items) if (it.on !== "decor" && it.y != null) { const ny = this.subH(it.x, it.z); if (it.t !== "plant" || Math.abs(ny - it.y) > 1e-4) { it.y = ny; this.place(it); } }
    const G = this.grid, w = GX + 1;
    for (let j = 0; j <= GZ; j++) for (let i = 0; i <= GX; i++) G[j * w + i] = this.subH(T.X0 + (i / GX) * T.W, T.Z0 + (j / GZ) * T.D);
    const rc = new THREE.Raycaster(); rc.ray.direction.set(0, -1, 0);
    this.obst = [];
    const box = new THREE.Box3();
    for (const m of this.decorMeshes) {
      m.updateMatrixWorld(); box.setFromObject(m);
      const i0 = Math.max(0, Math.floor((box.min.x - T.X0) / T.W * GX)), i1 = Math.min(GX, Math.ceil((box.max.x - T.X0) / T.W * GX));
      const j0 = Math.max(0, Math.floor((box.min.z - T.Z0) / T.D * GZ)), j1 = Math.min(GZ, Math.ceil((box.max.z - T.Z0) / T.D * GZ));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        rc.ray.origin.set(T.X0 + (i / GX) * T.W, 9, T.Z0 + (j / GZ) * T.D);
        const h = rc.intersectObject(m, false)[0];
        if (h && h.point.y > G[j * w + i]) G[j * w + i] = Math.min(h.point.y, T.WATER - 1.2);
      }
      const it = m.userData.item, Gd = m.userData.G;
      if (it.t === "rock") this.obst.push({ x: it.x, y: it.y + Gd.h * it.s * 0.45, z: it.z, r: Gd.r * it.s * 1.05 });
      else for (const s of Gd.spheres) { const v = new THREE.Vector3(s[0], s[1], s[2]).applyMatrix4(m.matrixWorld); this.obst.push({ x: v.x, y: v.y, z: v.z, r: s[3] * it.s }); }
    }
    this.hide = []; const pearls = [];
    for (const m of this.plantMeshes) {
      const it = m.userData.item, Gd = m.userData.G;
      this.hide.push([it.x, it.y, it.z]);
      pearls.push([it.x, it.y + Gd.top * m.scale.y * 0.85, it.z, Gd.spread * m.scale.x]);
    }
    for (const m of this.decorMeshes) { const it = m.userData.item; if (it.t === "wood") this.hide.push([it.x, it.y, it.z]); }
    if (this.env) { this.env.setPearlOrigins(pearls); this.env.setStoneGround(this.subH(this.env.stoneXZ[0], this.env.stoneXZ[1])); }
    U.uAlgae.value = U.uAlgae.value;
  }
  /* 雕刻底床 */
  sculpt(x, z, r, amt, mode) {
    const s = this.layout.sub;
    for (let j = 0; j <= NZ; j++) for (let i = 0; i <= NX; i++) {
      const px = T.X0 + (i / NX) * T.W, pz = T.Z0 + (j / NZ) * T.D, d = Math.hypot(px - x, pz - z);
      if (d > r) continue;
      const f = Math.pow(1 - d / r, 2) * (3 - 2 * (1 - d / r)) * 0.5 + 0.5 * (1 - d / r) ** 2, k = j * (NX + 1) + i;
      if (mode === "raise") s.h[k] = clamp(s.h[k] + amt * f, 0.12, 2.6);
      else if (mode === "lower") s.h[k] = clamp(s.h[k] - amt * f, 0.12, 2.6);
      else if (mode === "smooth") { const av = (this.hAt(i - 1, j) + this.hAt(i + 1, j) + this.hAt(i, j - 1) + this.hAt(i, j + 1)) / 4; s.h[k] = lerp(s.h[k], av, clamp(amt * 6 * f, 0, 1)); }
      else if (mode === "sand") { if (f > 0.25) s.m[k] = 1; }
      else if (mode === "soil") { if (f > 0.25) s.m[k] = 0; }
      s.h[k] = +s.h[k].toFixed(3);
    }
  }
  plantInfo(it) { return PL[it.k]; }
}
