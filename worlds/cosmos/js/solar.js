// 太阳系：太阳、八大行星、月球、小行星带、柯伊伯带、轨道线
import * as THREE from 'three';
import { sunMaterial, coronaMaterial, atmosphereMaterial, dustMaterial, ringMaterial } from './shaders.js';
import { canvasTexture, ringCanvas, glowTexture } from './textures.js';

// 视觉尺度（经过压缩，否则行星小到看不见；相对大小与顺序保持正确）
export const LAYOUT = {
  sun: { r: 7 },
  mercury: { r: 0.62, a: 16, P: 88, tilt: 0.03, spin: 0.06 },
  venus: { r: 1.25, a: 22, P: 224.7, tilt: 177.4, spin: 0.05 },
  earth: { r: 1.32, a: 30, P: 365.25, tilt: 23.4, spin: 0.32 },
  mars: { r: 0.85, a: 39, P: 687, tilt: 25.2, spin: 0.31 },
  jupiter: { r: 4.3, a: 72, P: 4333, tilt: 3.1, spin: 0.7 },
  saturn: { r: 3.7, a: 98, P: 10759, tilt: 26.7, spin: 0.66 },
  uranus: { r: 2.3, a: 122, P: 30687, tilt: 97.8, spin: 0.45 },
  neptune: { r: 2.2, a: 142, P: 60190, tilt: 28.3, spin: 0.48 },
  moon: { r: 0.36, a: 3.2, P: 27.3 },
};

const EARTH_ORBIT_SECONDS = 90;
const omega = (P) => (Math.PI * 2 / EARTH_ORBIT_SECONDS) * Math.pow(365.25 / P, 0.55);

function orbitLine(a, color = 0x8fa8ff, opacity = 0.14) {
  const pts = [];
  for (let i = 0; i <= 256; i++) { const t = i / 256 * Math.PI * 2; pts.push(new THREE.Vector3(Math.cos(t) * a, 0, Math.sin(t) * a)); }
  const g = new THREE.BufferGeometry().setFromPoints(pts);
  const m = new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending });
  const l = new THREE.Line(g, m);
  l.userData.base = opacity;
  return l;
}

function beltPoints(n, rIn, rOut, thick, colorFn, sizeRange, spin) {
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), size = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = Math.random();
    const r = rIn + (rOut - rIn) * (0.5 + 0.5 * Math.sin((t - 0.5) * Math.PI)) + (Math.random() - 0.5) * 2;
    const a = Math.random() * Math.PI * 2;
    pos[i * 3] = Math.cos(a) * r; pos[i * 3 + 1] = (Math.random() - 0.5) * thick * (0.3 + Math.random()); pos[i * 3 + 2] = Math.sin(a) * r;
    const c = colorFn();
    col.set(c, i * 3);
    size[i] = sizeRange[0] + Math.pow(Math.random(), 3) * (sizeRange[1] - sizeRange[0]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  const p = new THREE.Points(g, dustMaterial({ spin, max: 5, soft: 0.4 }));
  p.frustumCulled = false;
  return p;
}

export function buildSolar(tex) {
  const group = new THREE.Group();
  const bodies = new Map();
  const updaters = [];

  // 灯光
  const sunLight = new THREE.PointLight(0xfff2e0, 3.4, 0, 0);
  group.add(sunLight);
  group.add(new THREE.AmbientLight(0x3a4466, 0.35));

  // —— 太阳 ——
  const S = LAYOUT.sun.r;
  const sun = new THREE.Mesh(new THREE.SphereGeometry(S, 96, 64), sunMaterial());
  group.add(sun);
  const CORE = 0.19;
  const corona = new THREE.Mesh(new THREE.PlaneGeometry(S * 2 / CORE, S * 2 / CORE), coronaMaterial(CORE));
  group.add(corona);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture('rgba(255,170,90,1)', 'rgba(255,120,40,0)', 128, 0.08), blending: THREE.AdditiveBlending,
    transparent: true, depthWrite: false, opacity: 0.22,
  }));
  halo.scale.setScalar(S * 13);
  group.add(halo);
  const sunHit = new THREE.Mesh(new THREE.SphereGeometry(S * 1.15, 16, 12), new THREE.MeshBasicMaterial());
  sunHit.visible = false;
  group.add(sunHit);
  bodies.set('sun', {
    id: 'sun', r: S, mesh: sun, hit: sunHit, anchor: sun,
    getPos: (v) => v.set(0, 0, 0),
  });
  updaters.push((dt, sim, cam, focusId) => {
    sun.rotation.y += dt * (focusId === 'sun' ? 0.06 : 0.02);
    corona.quaternion.copy(cam.quaternion);
  });

  // —— 行星 ——
  const ids = ['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune'];
  const orbitLines = new Map();
  ids.forEach((id, idx) => {
    const L = LAYOUT[id];
    const holder = new THREE.Group();
    const tilt = new THREE.Group();
    tilt.rotation.z = THREE.MathUtils.degToRad(L.tilt);
    holder.add(tilt);
    const seg = L.r > 2 ? 96 : 64;
    const map = canvasTexture(tex[id]);
    const rocky = ['mercury', 'mars'].includes(id);
    const mat = new THREE.MeshStandardMaterial({
      map, roughness: id === 'earth' ? 0.75 : 0.95, metalness: 0,
      bumpMap: rocky ? map : null, bumpScale: rocky ? 3 : 0,
    });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(L.r, seg, seg * 0.66 | 0), mat);
    tilt.add(mesh);

    // 大气层
    const atm = {
      venus: ['#ffd9a0', 1.0, 2.6], earth: ['#5aa8ff', 1.6, 3.2], mars: ['#ff9a6a', 0.6, 3.5],
      jupiter: ['#ffd9b0', 0.5, 3.5], saturn: ['#ffe6b0', 0.5, 3.5], uranus: ['#a8fff6', 0.9, 3.0], neptune: ['#6f8cff', 1.0, 3.0],
    }[id];
    if (atm) {
      const a = new THREE.Mesh(new THREE.SphereGeometry(L.r * (id === 'earth' ? 1.07 : 1.05), 64, 40), atmosphereMaterial(atm[0], atm[1], atm[2]));
      tilt.add(a);
    }
    let clouds = null;
    if (id === 'earth') {
      clouds = new THREE.Mesh(new THREE.SphereGeometry(L.r * 1.012, 96, 64), new THREE.MeshStandardMaterial({
        map: canvasTexture(tex.earthClouds), transparent: true, depthWrite: false, roughness: 1,
      }));
      tilt.add(clouds);
    }
    // 光环
    if (id === 'saturn' || id === 'uranus') {
      const rin = L.r * (id === 'saturn' ? 1.24 : 1.6), rout = L.r * (id === 'saturn' ? 2.27 : 2.05);
      const t = new THREE.CanvasTexture(ringCanvas(id));
      t.colorSpace = THREE.SRGBColorSpace;
      const rm = ringMaterial(t, L.r);
      rm.uniforms.uIn.value = rin; rm.uniforms.uOut.value = rout;
      if (id === 'uranus') rm.uniforms.uOpacity.value = 0.55;
      const ring = new THREE.Mesh(new THREE.RingGeometry(rin, rout, 192, 1), rm);
      ring.rotation.x = -Math.PI / 2;
      ring.renderOrder = 1;
      tilt.add(ring);
    }
    // 小卫星（装饰）
    const minis = [];
    const miniDefs = {
      mars: [[0.08, 1.6, 2.2], [0.06, 2.3, 1.2]],
      jupiter: [[0.22, 6.6, 1.3], [0.2, 8.2, 0.9], [0.3, 10.2, 0.6], [0.27, 12.6, 0.4]],
      saturn: [[0.3, 10.5, 0.45], [0.12, 6.0, 0.9]],
      neptune: [[0.18, 4.2, -0.7]],
    }[id] || [];
    for (const [mr, ma, mw] of miniDefs) {
      const piv = new THREE.Group();
      piv.rotation.y = Math.random() * 6.28;
      piv.rotation.x = (Math.random() - 0.5) * 0.15;
      const m = new THREE.Mesh(new THREE.SphereGeometry(mr, 16, 12), new THREE.MeshStandardMaterial({ color: 0xbfb6a8, roughness: 1 }));
      m.position.x = ma;
      piv.add(m);
      holder.add(piv);
      minis.push([piv, mw]);
    }

    const hit = new THREE.Mesh(new THREE.SphereGeometry(Math.max(L.r * 1.7, 2.4), 12, 8), new THREE.MeshBasicMaterial());
    hit.visible = false;
    holder.add(hit);
    group.add(holder);

    const line = orbitLine(L.a);
    group.add(line);
    orbitLines.set(id, line);

    const phase = (idx * 2.399 + 0.6) % (Math.PI * 2);
    const w = omega(L.P);
    const body = {
      id, r: L.r, mesh, hit, holder, anchor: mesh, line,
      extent: id === 'saturn' ? L.r * 2.3 : L.r,
      getPos: (v) => holder.getWorldPosition(v),
    };
    bodies.set(id, body);
    updaters.push((dt, sim, cam, focusId) => {
      const th = phase + sim * w;
      holder.position.set(Math.cos(th) * L.a, 0, -Math.sin(th) * L.a);
      const sp = L.spin * (focusId === id ? 1.6 : 1) * (L.tilt > 90 ? -1 : 1);
      mesh.rotation.y += dt * sp;
      if (clouds) clouds.rotation.y += dt * sp * 1.12;
      for (const [piv, mw] of minis) piv.rotation.y += dt * mw * 0.6;
    });

    // 月球
    if (id === 'earth') {
      const ML = LAYOUT.moon;
      const piv = new THREE.Group();
      piv.rotation.x = THREE.MathUtils.degToRad(5.1);
      const inner = new THREE.Group();
      piv.add(inner);
      const mmap = canvasTexture(tex.moon);
      const moon = new THREE.Mesh(new THREE.SphereGeometry(ML.r, 64, 40), new THREE.MeshStandardMaterial({ map: mmap, bumpMap: mmap, bumpScale: 3, roughness: 1 }));
      moon.position.x = ML.a;
      inner.add(moon);
      const mhit = new THREE.Mesh(new THREE.SphereGeometry(1.0, 10, 8), new THREE.MeshBasicMaterial());
      mhit.visible = false;
      moon.add(mhit);
      holder.add(piv);
      const mline = new THREE.LineLoop(
        new THREE.BufferGeometry().setFromPoints(Array.from({ length: 128 }, (_, i) => new THREE.Vector3(Math.cos(i / 128 * 6.283) * ML.a, 0, Math.sin(i / 128 * 6.283) * ML.a))),
        new THREE.LineBasicMaterial({ color: 0x9fb0d0, transparent: true, opacity: 0.12, depthWrite: false }));
      piv.add(mline);
      bodies.set('moon', { id: 'moon', r: ML.r, mesh: moon, hit: mhit, anchor: moon, extent: ML.r, line: mline, getPos: (v) => moon.getWorldPosition(v) });
      updaters.push((dt, sim, cam, focusId) => {
        inner.rotation.y = sim * (Math.PI * 2 / 14) + 1.0;
      });
    }
  });

  // 小行星带与柯伊伯带
  const belt = beltPoints(7000, 48, 58, 1.6, () => { const f = 0.25 + Math.random() * 0.35; return [f * 1.0, f * 0.88, f * 0.74]; }, [0.12, 0.42], 0.6);
  group.add(belt);
  const kuiper = beltPoints(3500, 165, 215, 8, () => { const f = 0.12 + Math.random() * 0.2; return [f * 0.75, f * 0.85, f * 1.0]; }, [0.3, 0.9], 0.2);
  group.add(kuiper);

  return {
    group, bodies, orbitLines, sun, corona, halo,
    update(dt, sim, cam, focusId) { for (const u of updaters) u(dt, sim, cam, focusId); },
  };
}
