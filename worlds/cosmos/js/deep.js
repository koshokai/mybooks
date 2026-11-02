// 深空：银河系全景 + 著名深空天体
import * as THREE from 'three';
import { makeGalaxy } from './sky.js';
import { dustMaterial, diskMaterial, photonRingMaterial, shared } from './shaders.js';
import { glowTexture, nebulaTexture } from './textures.js';

const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
const gauss = () => { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

// 银河系尺度：1 单位 ≈ 16.7 光年（银河系直径 10 万光年 ≈ 6000 单位）
export const GAL_R = 3000;
export const GAL_CENTER = new THREE.Vector3(-1560, 0, 0); // 太阳（原点）距银心约 2.6 万光年

function cloud(n, fill, opts) {
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), size = new Float32Array(n);
  const o = { p: [0, 0, 0], c: [1, 1, 1], s: 1 };
  for (let i = 0; i < n; i++) { fill(o, i); pos.set(o.p, i * 3); col.set(o.c, i * 3); size[i] = o.s; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  const p = new THREE.Points(g, dustMaterial(opts));
  p.frustumCulled = false;
  return p;
}

function sprite(tex, scale, opacity, color) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity, color: color || 0xffffff }));
  s.scale.setScalar(scale);
  s.userData.base = opacity;
  return s;
}

// 十字星芒贴图
function spikeTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.08, 'rgba(220,235,255,0.8)'); gr.addColorStop(0.3, 'rgba(150,190,255,0.15)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  g.globalCompositeOperation = 'lighter';
  for (const [w, h] of [[128, 3], [3, 128]]) {
    const lg = w > h ? g.createLinearGradient(0, 0, 128, 0) : g.createLinearGradient(0, 0, 0, 128);
    lg.addColorStop(0, 'rgba(180,210,255,0)'); lg.addColorStop(0.5, 'rgba(230,240,255,0.9)'); lg.addColorStop(1, 'rgba(180,210,255,0)');
    g.fillStyle = lg; g.fillRect(64 - w / 2, 64 - h / 2, w, h);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function blackHole(R, withJet) {
  const g = new THREE.Group();
  const horizon = new THREE.Mesh(new THREE.SphereGeometry(R, 48, 32), new THREE.MeshBasicMaterial({ color: 0x000000 }));
  g.add(horizon);
  const disk = new THREE.Mesh(new THREE.RingGeometry(R * 1.5, R * 6, 160, 1), diskMaterial(R * 1.5, R * 6));
  disk.rotation.x = -Math.PI / 2 + 0.22;
  g.add(disk);
  const ring = new THREE.Mesh(new THREE.PlaneGeometry(R * 7.5, R * 7.5), photonRingMaterial());
  g.add(ring);
  const glow = sprite(glowTexture('rgba(255,150,70,1)', 'rgba(255,90,30,0)', 128, 0.12), R * 22, 0.35);
  g.add(glow);
  let jet = null;
  if (withJet) {
    jet = cloud(2200, (o) => {
      const t = Math.pow(Math.random(), 1.4);
      const side = Math.random() < 0.82 ? 1 : -1;
      const L = R * 60 * t;
      const w = R * (0.4 + t * 3.5) * Math.abs(gauss()) * 0.5;
      const a = rand(0, Math.PI * 2);
      o.p = [Math.cos(a) * w, side * (R * 1.3 + L), Math.sin(a) * w];
      const f = (1 - t * 0.7) * rand(0.4, 0.9) * (side > 0 ? 1 : 0.4);
      o.c = [f * 0.55, f * 0.75, f * 1.1];
      o.s = R * rand(0.4, 1.2);
    }, { max: 30, soft: 1.2 });
    jet.rotation.z = 0.22;
    g.add(jet);
  }
  const mats = [disk.material, ring.material];
  return {
    group: g,
    update(cam) { ring.quaternion.copy(cam.quaternion); },
    setOpacity(f) {
      for (const m of mats) m.uniforms.uOpacity.value = f;
      glow.material.opacity = glow.userData.base * f;
      if (jet) jet.material.uniforms.uOpacity.value = f;
      horizon.visible = f > 0.02;
    },
  };
}

export function buildDeep() {
  const group = new THREE.Group();
  const objects = new Map();
  const fade = []; // setOpacity 回调

  // —— 银河系 ——
  const mw = makeGalaxy({ count: 62000, R: GAL_R, arms: 4, pitch: 0.24, bar: 0.26, thick: 0.018, bright: 0.8, size: 1.0 });
  mw.position.copy(GAL_CENTER);
  mw.rotation.y = 0.5;
  group.add(mw);
  fade.push((f) => mw.setOpacity(f));
  objects.set('milkyway', { id: 'milkyway', pos: GAL_CENTER.clone(), view: new THREE.Vector3(0.0, 0.62, 0.78), dist: 7600, anchor: mw });

  // 银心黑洞 人马座 A*
  const sgr = blackHole(10, false);
  sgr.group.position.copy(GAL_CENTER);
  group.add(sgr.group);
  fade.push((f) => sgr.setOpacity(f));
  objects.set('sgra', { id: 'sgra', pos: GAL_CENTER.clone(), view: new THREE.Vector3(0.3, 0.28, 1).normalize(), dist: 150, bh: sgr });

  // 「你在这里」标记
  const here = new THREE.Group();
  const ringGeo = new THREE.RingGeometry(1, 1.12, 64);
  const hereRings = [];
  for (let i = 0; i < 2; i++) {
    const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0x9fe7ff, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    m.rotation.x = -Math.PI / 2;
    here.add(m); hereRings.push(m);
  }
  const hereDot = sprite(glowTexture('rgba(255,240,200,1)', 'rgba(255,200,120,0)', 64, 0.15), 60, 1);
  here.add(hereDot);
  group.add(here);
  fade.push((f) => { here.visible = f > 0.01; hereDot.material.opacity = f; });

  const spikes = spikeTexture();

  // —— 猎户座大星云 M42 ——（位置为示意，大小已放大）
  const orion = new THREE.Group();
  orion.position.set(80, -14, -40);
  const oR = 16;
  const orionCloud = cloud(4200, (o) => {
    let x, y, z, d;
    do { x = rand(-1, 1); y = rand(-1, 1); z = rand(-1, 1); d = x * x + y * y + z * z; } while (d > 1 || Math.random() > Math.pow(1 - Math.sqrt(d), 0.6) * (0.5 + 0.5 * Math.sin(x * 7 + y * 5) * Math.cos(z * 6 - x * 3)));
    o.p = [x * oR * 1.3, y * oR, z * oR * 0.6];
    const core = Math.exp(-d * 6);
    const k = Math.random();
    o.c = core > 0.4 && k < 0.6 ? [0.4, 0.9, 0.85] : (k < 0.65 ? [1.0, 0.25, 0.42] : (k < 0.85 ? [0.9, 0.45, 0.7] : [0.5, 0.6, 1.0]));
    const f = rand(0.25, 0.6) * (0.5 + core);
    o.c = o.c.map((v) => v * f);
    o.s = rand(1.5, 4.5);
  }, { max: 70, soft: 2 });
  orion.add(orionCloud);
  orion.add(sprite(nebulaTexture('#ff4f7a', '#5fd4ff', 42, 256), oR * 3.4, 0.55));
  for (let i = 0; i < 4; i++) {
    const s = sprite(spikes, oR * 0.45, 0.9);
    s.position.set(rand(-1, 1) * 1.5, rand(-1, 1) * 1.5, rand(-1, 1));
    orion.add(s);
  }
  group.add(orion);
  fade.push((f) => { orionCloud.material.uniforms.uOpacity.value = f; orion.children.forEach((c) => { if (c.isSprite) c.material.opacity = c.userData.base * f; }); orion.visible = f > 0.01; });
  objects.set('orion', { id: 'orion', pos: orion.position, view: new THREE.Vector3(0.2, 0.25, 1).normalize(), dist: oR * 4.6 });

  // —— 昴星团 M45 ——
  const ple = new THREE.Group();
  ple.position.set(40, 10, 32);
  const pR = 10;
  const bright = [[0, 0, 0], [0.5, 0.25, 0.2], [-0.45, 0.4, -0.1], [0.15, -0.5, 0.3], [-0.6, -0.25, 0.2], [0.75, -0.2, -0.3], [-0.15, 0.7, 0.1], [0.3, 0.6, -0.4], [-0.8, 0.1, -0.3]];
  for (const [x, y, z] of bright) {
    const s = sprite(spikes, pR * rand(0.5, 0.85), 1, 0xcfe0ff);
    s.position.set(x * pR, y * pR, z * pR);
    ple.add(s);
  }
  const pleStars = cloud(380, (o) => {
    const r = Math.abs(gauss()) * pR * 0.8, a = rand(0, 6.28), b = Math.acos(rand(-1, 1));
    o.p = [r * Math.sin(b) * Math.cos(a), r * Math.cos(b), r * Math.sin(b) * Math.sin(a)];
    const f = rand(0.4, 1.1); o.c = [f * 0.8, f * 0.88, f]; o.s = rand(0.3, 0.8);
  }, { max: 8, soft: 0.6 });
  ple.add(pleStars);
  ple.add(sprite(nebulaTexture('#4f7dff', '#9fd0ff', 77, 256), pR * 3.2, 0.4));
  group.add(ple);
  fade.push((f) => { pleStars.material.uniforms.uOpacity.value = f; ple.children.forEach((c) => { if (c.isSprite) c.material.opacity = c.userData.base * f; }); ple.visible = f > 0.01; });
  objects.set('pleiades', { id: 'pleiades', pos: ple.position, view: new THREE.Vector3(-0.3, 0.2, 1).normalize(), dist: pR * 4.2 });

  // —— 蟹状星云 M1 ——
  const crab = new THREE.Group();
  crab.position.set(240, 4, -70);
  const cR = 12;
  const crabFil = cloud(3200, (o) => {
    // 椭球壳上的丝状结构
    const a = rand(0, 6.28), b = Math.acos(rand(-1, 1));
    const fil = Math.sin(a * 9 + b * 5) * Math.sin(a * 4 - b * 11);
    const shell = 0.75 + 0.25 * Math.random() + (fil > 0.6 ? 0.1 : 0);
    const r = cR * shell;
    o.p = [r * Math.sin(b) * Math.cos(a) * 1.35, r * Math.cos(b) * 0.95, r * Math.sin(b) * Math.sin(a)];
    const f = rand(0.35, 0.8) * (fil > 0.3 ? 1.3 : 0.6);
    o.c = Math.random() < 0.7 ? [f, f * 0.42, f * 0.2] : [f, f * 0.75, f * 0.35];
    o.s = rand(0.8, 2.2);
  }, { max: 40, soft: 1.4 });
  const crabCore = cloud(1400, (o) => {
    const r = Math.abs(gauss()) * cR * 0.4, a = rand(0, 6.28), b = Math.acos(rand(-1, 1));
    o.p = [r * Math.sin(b) * Math.cos(a) * 1.3, r * Math.cos(b), r * Math.sin(b) * Math.sin(a)];
    const f = rand(0.2, 0.5); o.c = [f * 0.55, f * 0.75, f * 1.2]; o.s = rand(2, 5);
  }, { max: 60, soft: 2 });
  const pulsar = sprite(spikes, cR * 0.5, 1, 0xd8e8ff);
  crab.add(crabFil, crabCore, pulsar);
  group.add(crab);
  fade.push((f) => { crabFil.material.uniforms.uOpacity.value = f; crabCore.material.uniforms.uOpacity.value = f; pulsar.userData.f = f; crab.visible = f > 0.01; });
  objects.set('crab', { id: 'crab', pos: crab.position, view: new THREE.Vector3(0.4, 0.3, 1).normalize(), dist: cR * 4.4 });

  // —— 仙女座星系 M31 ——（距离为示意）
  const m31 = makeGalaxy({ count: 22000, R: 2400, arms: 2, pitch: 0.2, bar: 0.0, thick: 0.02, bright: 0.85, size: 1.1,
    bulgeColor: [1.0, 0.8, 0.55], armColor: [0.7, 0.75, 1.0] });
  m31.position.set(-6500, 3200, -10500);
  m31.rotation.set(1.25, 0.3, 0.4);
  group.add(m31);
  fade.push((f) => m31.setOpacity(f));
  objects.set('andromeda', { id: 'andromeda', pos: m31.position, view: new THREE.Vector3(0.5, 0.35, 1).normalize(), dist: 6800, anchor: m31 });

  // —— M87* ——（距离为示意）
  const m87 = blackHole(40, true);
  m87.group.position.set(9000, -1800, -9500);
  m87.group.rotation.set(0.2, 0.4, 0.15);
  const m87host = cloud(6000, (o) => {
    const r = Math.abs(gauss()) * 650, a = rand(0, 6.28), b = Math.acos(rand(-1, 1));
    o.p = [r * Math.sin(b) * Math.cos(a), r * Math.cos(b) * 0.85, r * Math.sin(b) * Math.sin(a)];
    if (r < 260) { o.p = [0, 99999, 0]; }
    const f = rand(0.1, 0.25); o.c = [f, f * 0.82, f * 0.6]; o.s = rand(8, 18);
  }, { max: 30, soft: 1.5 });
  m87.group.add(m87host);
  group.add(m87.group);
  fade.push((f) => { m87.setOpacity(f); m87host.material.uniforms.uOpacity.value = f; m87.group.visible = f > 0.01; });
  objects.set('m87', { id: 'm87', pos: m87.group.position, view: new THREE.Vector3(0.1, 0.3, 1).normalize(), dist: 620, bh: m87 });

  let opacity = 0, dimS = 1;
  const api = {
    group, objects, here,
    setOpacity(f) { opacity = f; group.visible = f > 0.001; for (const cb of fade) cb(f); },
    update(dt, cam, focusId) {
      if (!group.visible) return;
      mw.rotation.y += dt * 0.004;
      m31.rotation.y += dt * 0.006;
      sgr.update(cam); m87.update(cam);
      // 银心聚焦时压暗银河，免得遮住黑洞
      const dim = focusId === 'sgra' ? 0.3 : 1;
      dimS += (dim - dimS) * Math.min(1, dt * 2);
      mw.material.uniforms.uOpacity.value = opacity * dimS;
      const t = shared.time.value;
      for (let i = 0; i < hereRings.length; i++) {
        const k = ((t * 0.5 + i * 0.5) % 1);
        const camD = cam.position.distanceTo(here.position);
        hereRings[i].scale.setScalar(camD * (0.01 + k * 0.03));
        hereRings[i].material.opacity = (1 - k) * 0.8 * opacity;
      }
      hereDot.scale.setScalar(cam.position.distanceTo(here.position) * 0.03);
      pulsar.material.opacity = (pulsar.userData.f ?? 0) * (0.55 + 0.45 * Math.abs(Math.sin(t * 6)));
    },
  };
  api.setOpacity(0);
  return api;
}
