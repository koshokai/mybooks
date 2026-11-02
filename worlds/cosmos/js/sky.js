// 星空背景：多层星场、银河光带、星云、流星、片头穿越星尘
import * as THREE from 'three';
import { starMaterial, dustMaterial, meteorMaterial } from './shaders.js';
import { nebulaTexture, glowTexture } from './textures.js';

const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
const gauss = () => { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

// 恒星颜色（按光谱型的大致比例）
function starColor(out, boost = 1) {
  const r = Math.random();
  let c;
  if (r < 0.1) c = [0.62, 0.74, 1.0];
  else if (r < 0.3) c = [0.8, 0.87, 1.0];
  else if (r < 0.62) c = [1.0, 0.98, 0.95];
  else if (r < 0.82) c = [1.0, 0.9, 0.72];
  else if (r < 0.95) c = [1.0, 0.76, 0.5];
  else c = [1.0, 0.58, 0.42];
  out[0] = c[0] * boost; out[1] = c[1] * boost; out[2] = c[2] * boost;
  return out;
}

function points(count, fill, material) {
  const pos = new Float32Array(count * 3), col = new Float32Array(count * 3);
  const size = new Float32Array(count), phase = new Float32Array(count);
  const tmp = { p: [0, 0, 0], c: [1, 1, 1], s: 1, ph: 0 };
  for (let i = 0; i < count; i++) {
    fill(tmp, i);
    pos.set(tmp.p, i * 3); col.set(tmp.c, i * 3); size[i] = tmp.s; phase[i] = tmp.ph;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  g.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
  const p = new THREE.Points(g, material);
  p.frustumCulled = false;
  return p;
}

// 通用螺旋星系生成器（银河系、仙女座星系、背景小星系共用）
export function makeGalaxy({ count = 50000, R = 1000, arms = 2, pitch = 0.32, bar = 0.22, thick = 0.02,
  bulgeColor = [1.0, 0.78, 0.5], armColor = [0.62, 0.72, 1.0], hii = 0.05, size = 1, bright = 1, opacity = 1 } = {}) {
  const mat = dustMaterial({ opacity, max: 40, soft: 1.2 });
  const b = Math.max(0.15, pitch);
  const pts = points(count, (o) => {
    const k = Math.random();
    let x, y, z, c, s;
    if (k < 0.16) { // 核球
      const r = Math.abs(gauss()) * 0.11 * R;
      const th = rand(0, Math.PI * 2), ph = Math.acos(rand(-1, 1));
      x = r * Math.sin(ph) * Math.cos(th); z = r * Math.sin(ph) * Math.sin(th); y = r * Math.cos(ph) * 0.55;
      const f = 0.55 + Math.random() * 0.6;
      c = [bulgeColor[0] * f, bulgeColor[1] * f, bulgeColor[2] * f]; s = rand(1.2, 2.6);
    } else if (k < 0.23 && bar > 0) { // 棒
      const t = gauss() * bar * 0.5 * R;
      x = t; z = gauss() * 0.035 * R; y = gauss() * 0.02 * R;
      const f = 0.5 + Math.random() * 0.5;
      c = [bulgeColor[0] * f, bulgeColor[1] * f * 0.95, bulgeColor[2] * f * 0.9]; s = rand(1.2, 2.2);
    } else if (k < 0.84) { // 旋臂
      const arm = Math.floor(Math.random() * arms);
      const t = 0.09 + Math.pow(Math.random(), 0.85) * 0.91;
      const r = t * R;
      const th = arm * (Math.PI * 2 / arms) + Math.log(t / 0.09) / b + (bar > 0 ? 0 : 0);
      const spread = (0.03 + 0.07 * t) * R;
      const ox = gauss() * spread, oz = gauss() * spread;
      x = Math.cos(th) * r + ox; z = Math.sin(th) * r + oz; y = gauss() * thick * R * (1.2 - t * 0.5);
      const near = Math.exp(-(ox * ox + oz * oz) / (2 * spread * spread * 0.3));
      if (Math.random() < hii * near) { c = [1.0, 0.35, 0.55]; s = rand(2.5, 5); }
      else if (Math.random() < 0.08 * near) { c = [0.75, 0.85, 1.0]; s = rand(2.2, 3.8); }
      else {
        const f = 0.35 + Math.random() * 0.5;
        const w = Math.min(1, t * 1.4);
        c = [(bulgeColor[0] * (1 - w) + armColor[0] * w) * f, (bulgeColor[1] * (1 - w) + armColor[1] * w) * f, (bulgeColor[2] * (1 - w) + armColor[2] * w) * f];
        s = rand(1, 2.2);
      }
    } else { // 盘面弥散星
      const r = -Math.log(1 - Math.random() * 0.97) * 0.3 * R;
      const th = rand(0, Math.PI * 2);
      x = Math.cos(th) * r; z = Math.sin(th) * r; y = gauss() * thick * R * 1.5;
      const f = 0.2 + Math.random() * 0.3;
      c = [armColor[0] * f, armColor[1] * f, armColor[2] * f * 0.95]; s = rand(0.8, 1.8);
    }
    o.p = [x, y, z];
    o.c = [c[0] * bright, c[1] * bright, c[2] * bright];
    o.s = s * size * R * 0.006;
  }, mat);
  const group = new THREE.Group();
  group.add(pts);
  // 核心辉光
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture('rgba(255,214,160,1)', 'rgba(255,180,120,0)', 128, 0.18),
    blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.55 * opacity,
  }));
  glow.scale.setScalar(R * 0.75);
  group.add(glow);
  const disk = new THREE.Mesh(new THREE.PlaneGeometry(R * 2.4, R * 2.4), new THREE.MeshBasicMaterial({
    map: glowTexture('rgba(150,160,255,0.5)', 'rgba(80,90,200,0)', 128, 0.2),
    blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.25 * opacity, side: THREE.DoubleSide,
  }));
  disk.rotation.x = -Math.PI / 2;
  group.add(disk);
  group.userData = { pts, glow, disk, baseGlow: 0.55, baseDisk: 0.25 };
  group.setOpacity = (f) => {
    mat.uniforms.uOpacity.value = f * opacity;
    glow.material.opacity = 0.55 * opacity * f;
    disk.material.opacity = 0.25 * opacity * f;
    group.visible = f > 0.001;
  };
  group.material = mat;
  return group;
}

export function buildSky() {
  const sky = new THREE.Group();
  const inner = new THREE.Group(); // 用于鼠标视差
  sky.add(inner);
  const R = 30000;
  const c = [0, 0, 0];

  // 三层星场
  const layers = [
    { n: 9000, s: [0.9, 1.8], b: 0.55 },
    { n: 4500, s: [1.6, 2.8], b: 0.9 },
    { n: 900, s: [2.8, 5.0], b: 1.5 },
  ];
  const starMats = [];
  for (const L of layers) {
    const m = starMaterial();
    starMats.push(m);
    inner.add(points(L.n, (o) => {
      const u = rand(-1, 1), th = rand(0, Math.PI * 2), r = Math.sqrt(1 - u * u);
      const d = R * rand(0.85, 1);
      o.p = [r * Math.cos(th) * d, u * d, r * Math.sin(th) * d];
      o.c = starColor(c, L.b * rand(0.6, 1.2)).slice();
      o.s = rand(L.s[0], L.s[1]);
      o.ph = Math.random();
    }, m));
  }

  // 银河光带（太阳系视角下看到的银河盘面）
  const band = new THREE.Group();
  band.rotation.set(1.05, 0.4, 0.35);
  const bandMat = starMaterial();
  band.add(points(20000, (o) => {
    let l = rand(-Math.PI, Math.PI);
    if (Math.random() < 0.45) l = gauss() * 0.7; // 朝向银心更密
    const centerness = Math.exp(-l * l / 1.2);
    const bLat = gauss() * (0.06 + 0.1 * centerness);
    const d = R * 0.9;
    o.p = [Math.cos(bLat) * Math.cos(l) * d, Math.sin(bLat) * d, Math.cos(bLat) * Math.sin(l) * d];
    const f = rand(0.18, 0.5) * (0.6 + centerness * 0.8);
    const warm = Math.random() < 0.3 + centerness * 0.4;
    o.c = warm ? [f, f * 0.85, f * 0.65] : [f * 0.8, f * 0.88, f];
    o.s = rand(0.8, 2.0);
    o.ph = Math.random();
  }, bandMat));
  // 星云与暗尘带
  const nebPalette = [['#5a6bff', '#b06bff'], ['#ff6b9a', '#ffb36b'], ['#4fd1ff', '#6b7bff'], ['#ffd28a', '#ff7b5a'], ['#8a5bff', '#ff5fb0']];
  const nebulae = [];
  for (let i = 0; i < 9; i++) {
    const pal = nebPalette[i % nebPalette.length];
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({
      map: nebulaTexture(pal[0], pal[1], i + 3, 256), blending: THREE.AdditiveBlending,
      transparent: true, depthWrite: false, opacity: rand(0.18, 0.32),
    }));
    const l = i < 5 ? gauss() * 0.6 : rand(-Math.PI, Math.PI);
    const bLat = gauss() * 0.08;
    const d = R * 0.85;
    sp.position.set(Math.cos(bLat) * Math.cos(l) * d, Math.sin(bLat) * d, Math.cos(bLat) * Math.sin(l) * d);
    sp.scale.setScalar(rand(5000, 11000));
    sp.material.rotation = rand(0, Math.PI * 2);
    sp.userData.base = sp.material.opacity;
    band.add(sp); nebulae.push(sp);
  }
  const darkTex = nebulaTexture('#000000', '#050308', 99, 128);
  for (let i = 0; i < 7; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: darkTex, transparent: true, depthWrite: false, opacity: 0.5, color: 0x000000 }));
    const l = gauss() * 0.9, d = R * 0.84;
    sp.position.set(Math.cos(l) * d, gauss() * 0.02 * d, Math.sin(l) * d);
    sp.scale.set(rand(3000, 6000), rand(900, 1600), 1);
    sp.renderOrder = 2;
    sp.userData.base = 0.5;
    band.add(sp); nebulae.push(sp);
  }
  inner.add(band);

  // 远处的一个小旋涡星系作点缀
  const deco = makeGalaxy({ count: 5000, R: 3000, arms: 2, pitch: 0.28, bright: 0.9, size: 2, opacity: 0.9 });
  deco.position.set(-14000, 9000, -20000);
  deco.rotation.set(0.9, 0.3, 0.5);
  deco.lookAt(0, 0, 0); deco.rotateX(1.1);
  inner.add(deco);

  sky.userData = { starMats, bandMat, band, nebulae, deco, inner };
  sky.setBandOpacity = (f) => {
    bandMat.uniforms.uOpacity.value = f;
    for (const n of nebulae) n.material.opacity = n.userData.base * f;
    deco.setOpacity(f * 0.9);
    band.visible = f > 0.001;
  };
  return sky;
}

// 片头：沿飞行路径分布的星尘，镜头穿过时呼啸而过
export function buildIntroDust(fromZ, toZ) {
  const mat = dustMaterial({ opacity: 1, max: 6, soft: 0.6 });
  const n = 5000;
  const p = points(n, (o) => {
    const z = rand(toZ, fromZ);
    const a = rand(0, Math.PI * 2), r = 40 + Math.pow(Math.random(), 0.6) * 900;
    o.p = [Math.cos(a) * r, 120 + Math.sin(a) * r * 0.7, z];
    o.c = starColor([0, 0, 0], rand(0.6, 1.4)).slice();
    o.s = rand(2, 5);
  }, mat);
  p.setOpacity = (f) => { mat.uniforms.uOpacity.value = f; p.visible = f > 0.001; };
  return p;
}

// 流星
export function buildMeteors(scene) {
  const list = [];
  for (let i = 0; i < 3; i++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), meteorMaterial());
    m.frustumCulled = false; m.visible = false;
    m.userData = { life: 0, dur: 1, vel: new THREE.Vector3(), len: 1 };
    scene.add(m); list.push(m);
  }
  let next = 3;
  const X = new THREE.Vector3(), Y = new THREE.Vector3(), Z = new THREE.Vector3(), M = new THREE.Matrix4();
  return function update(dt, camera, enabled) {
    next -= dt;
    if (next <= 0 && enabled) {
      next = rand(3.5, 9);
      const m = list.find((x) => !x.visible);
      if (m) {
        const dist = rand(2500, 4000);
        const dir = new THREE.Vector3(rand(-1, 1), rand(0.1, 0.8), rand(-1, 1)).normalize();
        // 偏向镜头前方
        const fwd = new THREE.Vector3(); camera.getWorldDirection(fwd);
        dir.lerp(fwd, 0.55).normalize();
        m.position.copy(camera.position).addScaledVector(dir, dist);
        const tangent = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1))).normalize();
        tangent.y = -Math.abs(tangent.y) - 0.2; tangent.normalize();
        m.userData.vel.copy(tangent).multiplyScalar(dist * rand(0.5, 0.9));
        m.userData.len = dist * rand(0.08, 0.14);
        m.userData.width = dist * 0.0022;
        m.userData.life = 0; m.userData.dur = rand(0.7, 1.3);
        m.visible = true;
      }
    }
    for (const m of list) {
      if (!m.visible) continue;
      const u = m.userData;
      u.life += dt;
      const k = u.life / u.dur;
      if (k >= 1) { m.visible = false; continue; }
      m.position.addScaledVector(u.vel, dt);
      m.material.uniforms.uOpacity.value = Math.sin(Math.PI * k);
      X.copy(u.vel).normalize();
      Z.copy(camera.position).sub(m.position).normalize();
      Y.crossVectors(Z, X).normalize();
      Z.crossVectors(X, Y);
      M.makeBasis(X, Y, Z);
      m.quaternion.setFromRotationMatrix(M);
      m.scale.set(u.len, u.width, 1);
    }
  };
}
