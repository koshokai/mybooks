// 沉没之后 · 序章：暴风雨夜的海面（第四幕 海上 · 第五幕 求生）
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { clamp, lerp, damp, noise1, rng, canvasTex, FONT, HAND, disposeTree } from "./util.js";
import { skyUniforms, makeSky, makeOcean, makeRain, makeBolt, waveAt, rhythmPhase, RHYTHM_PERIOD } from "./ocean.js";
import { loadModel, modelInstance, loadHDR, envFromHDR } from "./assets.js";

export const ISLAND = new THREE.Vector3(0, 0, -96);
export const BEACH_R = 9;

/* ---------- 那只旧箱子（海上与沙滩共用）---------- */
export function tagTex() {
  return canvasTex(256, 400, (g, w, h) => {
    g.fillStyle = "#e9dcc0"; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(110,85,50,${Math.random() * 0.08})`; g.fillRect(Math.random() * w, Math.random() * h, 3, 3); }
    // 水渍
    const gr = g.createRadialGradient(w * 0.7, h * 0.8, 10, w * 0.7, h * 0.8, 160); gr.addColorStop(0, "rgba(120,100,70,0.35)"); gr.addColorStop(1, "rgba(120,100,70,0)");
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    // 穿绳的孔
    g.fillStyle = "#6b5a40"; g.beginPath(); g.arc(w / 2, 34, 13, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#e9dcc0"; g.beginPath(); g.arc(w / 2, 34, 8, 0, Math.PI * 2); g.fill();
    g.strokeStyle = "rgba(90,70,40,0.5)"; g.lineWidth = 2; g.strokeRect(14, 64, w - 28, h - 80);
    g.fillStyle = "#7a6a52"; g.font = `20px ${FONT}`; g.textAlign = "center";
    g.fillText("若 拾 获 · 请 寄 还", w / 2, 100);
    g.fillStyle = "#1d2b52"; g.font = `bold 66px ${HAND}`;
    g.save(); g.translate(w / 2, 196); g.rotate(-0.04); g.fillText("林知秋", 0, 0); g.restore();
    g.filter = "blur(2.5px)"; g.globalAlpha = 0.75; g.font = `30px ${HAND}`; g.fillStyle = "#2a3f6e";
    g.fillText("灯塔街 7 号", w / 2, 270);
    g.filter = "blur(5px)"; g.fillText("…… 收", w / 2, 320);
    g.filter = "none"; g.globalAlpha = 1;
  });
}
function leatherTex() {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = "#5a3a22"; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 3000; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? "20,10,5" : "160,120,80"},${Math.random() * 0.12})`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
    g.strokeStyle = "rgba(200,170,130,0.18)"; g.lineWidth = 1;
    for (let i = 0; i < 40; i++) { g.beginPath(); const x = Math.random() * w, y = Math.random() * h; g.moveTo(x, y); g.lineTo(x + (Math.random() - 0.5) * 40, y + (Math.random() - 0.5) * 10); g.stroke(); }
    g.strokeStyle = "rgba(230,200,150,0.35)"; g.setLineDash([6, 5]); g.lineWidth = 2; g.strokeRect(8, 8, w - 16, h - 16);
  });
}
export function makeSuitcase() {
  const grp = new THREE.Group();
  const leather = new THREE.MeshStandardMaterial({ map: leatherTex(), roughness: 0.55, metalness: 0 });
  const strapM = new THREE.MeshStandardMaterial({ color: 0x2e1d12, roughness: 0.6 });
  const brass = new THREE.MeshStandardMaterial({ color: 0xb08a4a, roughness: 0.35, metalness: 0.8 });
  const body = new THREE.Mesh(new RoundedBoxGeometry(0.72, 0.22, 0.5, 3, 0.05), leather);
  grp.add(body);
  for (const x of [-0.2, 0.2]) { const s = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.235, 0.515), strapM); s.position.x = x; grp.add(s); const b = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.02, 0.05), brass); b.position.set(x, 0.12, 0.17); grp.add(b); }
  for (const x of [-0.33, 0.33]) for (const z of [-0.23, 0.23]) { const c = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), brass); c.position.set(x, 0.1, z); c.scale.y = 0.6; grp.add(c); }
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.016, 8, 18, Math.PI), strapM);
  handle.position.set(0, 0.0, 0.25); handle.rotation.x = Math.PI / 2; handle.rotation.z = 0; grp.add(handle);
  // 行李牌
  const tag = new THREE.Mesh(new THREE.PlaneGeometry(0.085, 0.133).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: tagTex(), roughness: 0.9, side: THREE.DoubleSide }));
  tag.position.set(0.09, 0.118, 0.12); tag.rotation.y = -0.35; grp.add(tag);
  const str = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.14, 4), new THREE.MeshStandardMaterial({ color: 0xa0342c }));
  str.position.set(0.05, 0.116, 0.2); str.rotation.set(Math.PI / 2, 0, 0.9); grp.add(str);
  grp.userData.tag = tag; grp.userData.keep = [tag, str];
  return grp;
}

// 换上 Poly Haven 的复古皮箱模型（保留我们手写的行李牌）
export function upgradeSuitcase(grp) {
  loadModel("vintage_suitcase").then((m0) => {
    if (!m0) return;
    const m = m0.clone(true);
    const drop = []; m.traverse((o) => { if (o.isMesh && /_02_/.test(o.name)) drop.push(o); });
    drop.forEach((o) => o.parent.remove(o));
    const box = new THREE.Box3().setFromObject(m), size = box.getSize(new THREE.Vector3()), ctr = box.getCenter(new THREE.Vector3());
    const inner = new THREE.Group(); m.position.sub(ctr); inner.add(m);
    inner.rotation.x = -Math.PI / 2;
    const sc = 0.72 / Math.max(size.x, size.y, 0.01); inner.scale.setScalar(sc);
    grp.children.forEach((c) => { if (!grp.userData.keep.includes(c)) c.visible = false; });
    grp.add(inner);
    const topY = (size.z * sc) / 2;
    const [tag, str] = grp.userData.keep;
    tag.position.y = topY + 0.006; str.position.y = topY + 0.004;
    tag.position.x = 0.05; tag.position.z = 0.04; str.position.z = 0.1;
  });
}

/* ---------- 漂浮残骸 ---------- */
function makeSeat() {
  const g = new THREE.Group(), m = new THREE.MeshStandardMaterial({ color: 0x24476a, roughness: 0.9 });
  const a = new THREE.Mesh(new RoundedBoxGeometry(0.5, 0.12, 0.5, 2, 0.04), m);
  const b = new THREE.Mesh(new RoundedBoxGeometry(0.5, 0.7, 0.11, 2, 0.04), m); b.position.set(0, 0.32, 0.25); b.rotation.x = 0.5;
  const c = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.16, 0.015), new THREE.MeshStandardMaterial({ color: 0xeef0f2 })); c.position.set(0, 0.55, 0.37); c.rotation.x = 0.5;
  g.add(a, b, c); return g;
}
function makeVest() {
  const g = new THREE.Group(), m = new THREE.MeshStandardMaterial({ color: 0xff6a1a, roughness: 0.6, emissive: 0x220800 });
  for (const x of [-0.14, 0.14]) { const p = new THREE.Mesh(new RoundedBoxGeometry(0.24, 0.08, 0.46, 2, 0.035), m); p.position.x = x; g.add(p); }
  const col = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.035, 8, 16, Math.PI), m); col.rotation.x = -Math.PI / 2; col.position.z = -0.23; g.add(col);
  const ref = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.084, 0.03), new THREE.MeshBasicMaterial({ color: 0xcfd8dc })); ref.position.z = 0.06; g.add(ref);
  return g;
}
function makeShell(color) {
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.1 });
  const g = new THREE.Group();
  const b = new THREE.Mesh(new RoundedBoxGeometry(0.65, 0.26, 0.45, 3, 0.06), m); g.add(b);
  for (let i = -2; i <= 2; i++) { const r = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.27, 0.012), m); r.position.z = i * 0.07; g.add(r); }
  return g;
}
function makeWing() {
  const s = new THREE.Shape();
  s.moveTo(0, 0); s.lineTo(7.5, 0.9); s.lineTo(7.4, 2.1); s.lineTo(0.2, 3.3); s.lineTo(0, 0);
  const geo = new THREE.ExtrudeGeometry(s, { depth: 0.22, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 1 });
  geo.rotateX(Math.PI / 2);
  const tex = canvasTex(256, 128, (g, w, h) => {
    g.fillStyle = "#c9ccd1"; g.fillRect(0, 0, w, h);
    g.strokeStyle = "rgba(60,64,72,0.35)"; for (let x = 0; x < w; x += 18) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
    g.fillStyle = "#1e4c7a"; g.fillRect(0, h * 0.62, w, h * 0.1);
    for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(30,30,35,${Math.random() * 0.25})`; g.fillRect(Math.random() * w, Math.random() * h, 3, 1); }
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(0.15, 0.3);
  return new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.45, metalness: 0.5 }));
}
function makePlank() {
  const tex = canvasTex(256, 32, (g, w, h) => {
    g.fillStyle = "#8a6440"; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 18; i++) { g.strokeStyle = `rgba(50,30,15,${0.15 + Math.random() * 0.2})`; g.beginPath(); const y = Math.random() * h; g.moveTo(0, y); g.bezierCurveTo(w * 0.3, y + 3, w * 0.6, y - 3, w, y + 1); g.stroke(); }
  });
  return new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.08, 0.32), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 }));
}
// 远方燃着的一小团火
function makeFire() {
  const U = { uTime: { value: 0 } };
  const mat = new THREE.ShaderMaterial({
    uniforms: U, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: "varying vec2 vU; void main(){ vU = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: `uniform float uTime; varying vec2 vU;
      float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
      void main(){ vec2 p = vU; float x = (p.x - 0.5) * 2.0;
        float fl = n(vec2(p.x * 5.0, p.y * 3.0 - uTime * 4.0)) * 0.6 + n(vec2(p.x * 11.0, p.y * 7.0 - uTime * 7.0)) * 0.4;
        float shape = (1.0 - p.y) * (1.0 - x * x * 1.6) - 0.25 + fl * 0.6 - p.y * 0.4;
        float a = smoothstep(0.0, 0.45, shape);
        vec3 c = mix(vec3(1.8, 0.35, 0.05), vec3(2.6, 1.7, 0.6), smoothstep(0.3, 0.9, shape));
        gl_FragColor = vec4(c * a, 1.0); }`,
  });
  const g = new THREE.Group();
  for (let i = 0; i < 3; i++) { const p = new THREE.Mesh(new THREE.PlaneGeometry(1.4 - i * 0.3, 2.0 - i * 0.4), mat); p.position.set((i - 1) * 0.7, (1.0 - i * 0.2), i * 0.2); g.add(p); }
  g.userData.U = U;
  return g;
}

/* ---------- 远处那片“黑影”：其实是一片露出水面的楼顶（与天亮后的城市一致）---------- */
export const ROOFTOP = { w: 14, d: 12, h: 6 }; // 我们最后爬上去的那栋楼（以 ISLAND 为中心）
export const CITY_LANDMARKS = [
  // [x, z, w, d, h]  相对 ISLAND：周围的高楼
  [-2, -24, 20, 10, 4.6], [22, -8, 10, 12, 4], [-20, -6, 12, 10, 13], [17, -32, 12, 12, 22], [-27, -36, 14, 12, 30], [30, -70, 14, 14, 30], [-12, 14, 8, 8, 2.5], [18, 12, 9, 8, 1.6],
];
function makeIsland(mat) {
  const g = new THREE.Group();
  const box = (x, z, w, d, h, y0 = -2) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h - y0, d), mat); m.position.set(x, (h + y0) / 2, z); g.add(m); return m; };
  box(0, 0, ROOFTOP.w, ROOFTOP.d, ROOFTOP.h);
  box(-3, -2, 3.2, 2.6, ROOFTOP.h + 2.4); // 楼梯间
  // 楼顶水塔（支架 + 罐体）
  for (const [x, z] of [[3.2, -3.2], [5.2, -3.2], [3.2, -1.2], [5.2, -1.2]]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.2, 2.2, 0.2), mat); l.position.set(x, ROOFTOP.h + 1.1, z); g.add(l); }
  const tank = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 2.2, 14), mat); tank.position.set(4.2, ROOFTOP.h + 3.3, -2.2); g.add(tank);
  // 航标灯杆
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 7, 6), mat); mast.position.set(-4.5, ROOFTOP.h + 3.5, 3.5); g.add(mast);
  // 周围的楼与楼顶上的广告牌框架
  for (const [x, z, w, d, h] of CITY_LANDMARKS) box(x, z, w, d, h);
  const frame = new THREE.Group();
  for (const x of [-4, 0, 4]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.25, 6, 0.25), mat); p.position.set(x, 3, 0); frame.add(p); }
  const bd = new THREE.Mesh(new THREE.BoxGeometry(9.5, 3.4, 0.3), mat); bd.position.y = 4.6; frame.add(bd);
  frame.position.set(-20, 13, -6); g.add(frame);
  const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.2, 9, 6), mat); ant.position.set(30, 34.5, -70); g.add(ant);
  // 远方：钟楼、电视塔、摩天轮、更多楼顶
  const clock = new THREE.Group();
  const cb = new THREE.Mesh(new THREE.BoxGeometry(7, 34, 7), mat); cb.position.y = 7; clock.add(cb);
  const cr = new THREE.Mesh(new THREE.ConeGeometry(5.4, 8, 4), mat); cr.position.y = 28; cr.rotation.y = Math.PI / 4; clock.add(cr);
  clock.position.set(-38, 0, -55); g.add(clock);
  const tv = new THREE.Group();
  const sh = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 3, 120, 10), mat); sh.position.y = 50; tv.add(sh);
  const pod = new THREE.Mesh(new THREE.SphereGeometry(7, 16, 12), mat); pod.position.y = 86; pod.scale.y = 0.7; tv.add(pod);
  const ant2 = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.6, 40, 6), mat); ant2.position.y = 128; tv.add(ant2);
  tv.position.set(90, 0, -230); g.add(tv);
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(26, 0.8, 6, 48), mat); wheel.position.set(-120, 6, -150); wheel.rotation.y = 0.5; g.add(wheel);
  const R = rng(3);
  for (let i = 0; i < 34; i++) {
    const x = (R() - 0.5) * 360, z = -40 - R() * 280;
    if (Math.abs(x) < 34 && z > -70) continue;
    box(x, z, 8 + R() * 14, 8 + R() * 14, 1 + Math.pow(R(), 2) * 22);
  }
  // 红色航标灯：一直在闪，引着你游过去
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.35, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(8, 0.5, 0.25), toneMapped: false, fog: false }));
  lamp.position.set(-4.5, ROOFTOP.h + 7.1, 3.5); g.add(lamp);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: canvasTex(64, 64, (c) => { const r = c.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, "rgba(255,80,50,1)"); r.addColorStop(0.3, "rgba(255,40,20,0.35)"); r.addColorStop(1, "rgba(255,30,10,0)"); c.fillStyle = r; c.fillRect(0, 0, 64, 64); }), color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  glow.scale.setScalar(9); glow.position.copy(lamp.position); g.add(glow);
  g.userData.lamp = lamp; g.userData.glow = glow;
  return g;
}

/* ---------- 海上世界 ---------- */
export function buildSea({ renderer, lowEnd }) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x05070a);
  const camera = new THREE.PerspectiveCamera(70, 1, 0.05, 2000);
  camera.rotation.order = "YXZ";

  const SU = skyUniforms();
  const sky = makeSky(SU); scene.add(sky);
  const ocean = makeOcean(SU, { N: lowEnd ? 160 : 220 }); scene.add(ocean.mesh);
  ocean.U.uAmp.value = 1.25; ocean.U.uFoam.value = 1;
  const rain = makeRain(lowEnd ? 900 : 1600); scene.add(rain.mesh);
  const bolt = makeBolt(); scene.add(bolt.mesh);

  const hemi = new THREE.HemisphereLight(0x6f84a0, 0x0a0d12, 0.7); scene.add(hemi);
  const moon = new THREE.DirectionalLight(0x8fa6c8, 0.35); moon.position.set(20, 30, 40); scene.add(moon);
  const flashL = new THREE.DirectionalLight(0xc8d4ff, 0); flashL.position.set(0, 40, -60); scene.add(flashL); scene.add(flashL.target);
  const fireL = new THREE.PointLight(0xff7a2a, 0, 40, 1.5); scene.add(fireL);

  // 岛的剪影
  const silM = new THREE.MeshBasicMaterial({ color: 0x020304, fog: false });
  const island = makeIsland(silM);
  island.position.copy(ISLAND); scene.add(island);

  // 残骸
  const R = rng(11);
  const debris = [];
  const addDeb = (mesh, x, z, off = 0.05, tilt = 1, spin = 0.05) => { scene.add(mesh); debris.push({ mesh, x, z, off, tilt, spin: (R() - 0.5) * spin, yaw: R() * 6.28, vx: (R() - 0.5) * 0.08, vz: (R() - 0.5) * 0.08 }); return debris[debris.length - 1]; };
  addDeb(makeSeat(), -2.6, 3.4); addDeb(makeSeat(), 3.5, 7);
  [0xb8352f, 0xbfc4c9, 0x1f2f55, 0x2b7a78].forEach((c, i) => addDeb(makeShell(c), [2.2, -4.5, 6, -8][i], [2.5, 6, -3, 11][i]));
  for (let i = 0; i < 5; i++) addDeb(makeVest(), (R() - 0.5) * 16, 2 + R() * 14);
  const wing = addDeb(makeWing(), -9, 15, -0.6, 0.25, 0.0); wing.mesh.rotation.z = 0.25; wing.yaw = 0.7; wing.vx = wing.vz = 0;
  const fire = makeFire(); scene.add(fire);
  for (let i = 0; i < 8; i++) { const m = new THREE.Mesh(new RoundedBoxGeometry(0.45, 0.1, 0.45, 2, 0.03), new THREE.MeshStandardMaterial({ color: 0x24476a, roughness: 0.9 })); addDeb(m, (R() - 0.5) * 24, R() * 22 - 4); }

  // 可以抓住歇一歇的木板（沿着去岛的路）
  const planks = [];
  for (const [x, z] of [[1.5, -18], [-2, -34], [2.5, -50], [-1.5, -64], [3, -74], [-6, -28], [7, -44], [-5, -58]]) {
    const m = makePlank(); scene.add(m);
    planks.push({ mesh: m, x, z, yaw: (R() - 0.5) * 1.2, cool: 0 });
  }

  // 那只箱子
  const suit = makeSuitcase(); scene.add(suit); upgradeSuitcase(suit);
  loadHDR("storm_1k.hdr").then((h) => { if (h) { scene.environment = envFromHDR(renderer, h, 0, 0.12); h.dispose(); } });
  // 真实模型的残骸：救生圈、救生衣、塑料箱、油桶
  for (const [id, n, sc, off, tilt] of [["lifebuoy", 2, 1, 0.0, Math.PI / 2], ["life_jacket", 3, 1, 0.02, Math.PI / 2], ["plastic_crate_01", 2, 1.2, -0.05, 0], ["plastic_jerrycan", 2, 1.2, -0.06, 0.3], ["cardboard_box_01", 2, 1.2, -0.08, 0]]) {
    modelInstance(id).then((m0) => {
      if (!m0) return;
      for (let i = 0; i < n; i++) {
        const g = new THREE.Group(); const m = i ? m0.clone(true) : m0; m.scale.setScalar(sc); m.rotation.x = tilt; g.add(m);
        addDeb(g, (R() - 0.5) * 14, 1 + R() * 12, off, 0.8, 0.1);
      }
    });
  }
  const suitS = { x: -3.4, z: 5.2, held: false, yaw: 0.6 };

  // 水花
  const SPL = 80;
  const splG = new THREE.BufferGeometry(); const splP = new Float32Array(SPL * 3); splG.setAttribute("position", new THREE.BufferAttribute(splP, 3));
  const splV = Array.from({ length: SPL }, () => ({ v: new THREE.Vector3(), life: 0 }));
  const splash = new THREE.Points(splG, new THREE.PointsMaterial({ color: 0x9fb2c4, size: 0.022, map: canvasTex(32, 32, (g) => { const r = g.createRadialGradient(16, 16, 0, 16, 16, 16); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.5, 'rgba(255,255,255,0.5)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 32, 32); }), transparent: true, opacity: 0.85, depthWrite: false }));
  splash.frustumCulled = false; scene.add(splash);
  let splI = 0;
  const spray = (p, n, power) => {
    for (let i = 0; i < n; i++) {
      const s = splV[splI]; splI = (splI + 1) % SPL;
      s.life = 0.6 + Math.random() * 0.4;
      s.v.set((Math.random() - 0.5) * 1.6, 1 + Math.random() * 1.8 * power, (Math.random() - 0.5) * 1.6);
      splP.set([p.x + (Math.random() - 0.5) * 0.4, p.y, p.z + (Math.random() - 0.5) * 0.3], ((splI + SPL - 1) % SPL) * 3);
    }
  };

  // 浪尖被风吹起的飞沫
  const SPN = lowEnd ? 160 : 320;
  const spG = new THREE.BufferGeometry(); const spP = new Float32Array(SPN * 3).fill(-99); spG.setAttribute("position", new THREE.BufferAttribute(spP, 3));
  const spV = Array.from({ length: SPN }, () => ({ v: new THREE.Vector3(), life: 0 }));
  const sprayPts = new THREE.Points(spG, new THREE.PointsMaterial({ color: 0x8796a6, size: 0.09, map: splash.material.map, transparent: true, opacity: 0.55, depthWrite: false }));
  sprayPts.frustumCulled = false; scene.add(sprayPts);
  let spI = 0;
  const spTmp = { h: 0, gx: 0, gz: 0 };
  function updateSpray(dt, t, cx, cz) {
    const amp = ocean.U.uAmp.value;
    for (let k = 0; k < 6; k++) {
      const x = cx + (Math.random() - 0.5) * 30, z = cz - Math.random() * 26 + 4;
      waveAt(x, z, t, amp, spTmp);
      if (spTmp.h > amp * 1.25) {
        for (let j = 0; j < 6; j++) {
          const s = spV[spI]; s.life = 0.7 + Math.random() * 0.8;
          s.v.set(1.5 + Math.random() * 2.5, 1.2 + Math.random() * 2.2, 1 + Math.random() * 2);
          spP[spI * 3] = x + (Math.random() - 0.5) * 1.5; spP[spI * 3 + 1] = spTmp.h; spP[spI * 3 + 2] = z + (Math.random() - 0.5) * 1.5;
          spI = (spI + 1) % SPN;
        }
      }
    }
    for (let i = 0; i < SPN; i++) {
      const s = spV[i];
      if (s.life > 0) { s.life -= dt; s.v.y -= 6 * dt; spP[i * 3] += s.v.x * dt; spP[i * 3 + 1] += s.v.y * dt; spP[i * 3 + 2] += s.v.z * dt; if (s.life <= 0) spP[i * 3 + 1] = -99; }
    }
    spG.attributes.position.needsUpdate = true;
  }

  // 第一人称的手臂（扶着箱子 / 划水）
  const arms = new THREE.Group(); camera.add(arms); scene.add(camera);
  const sleeve = new THREE.MeshStandardMaterial({ color: 0x2f3a46, roughness: 0.9 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xc89a7c, roughness: 0.6 });
  const mkArm = (s) => {
    const a = new THREE.Group();
    const fa = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 0.5, 10).translate(0, -0.25, 0), sleeve);
    const h = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), skin); h.position.y = -0.52; h.scale.set(1, 1.3, 0.7);
    a.add(fa, h); a.userData.s = s; arms.add(a); return a;
  };
  const armL = mkArm(-1), armR = mkArm(1);
  arms.visible = false;

  // ---------- 状态 ----------
  const P = { x: 0, z: 0, heading: 0, vel: 0, stamina: 100, under: 0, hold: null, lastStroke: -9, stroke: 0, strokeSide: 1, steer: 0, swimT: 0, good: false, phase: 0, big: 0, bigT: 14, assist: 0, carried: 0, drift: 0 };
  const S = {
    mode: "wake", look: { yaw: 0.4, pitch: 0.1, uyaw: 0, upitch: 0, k: 1 }, target: { yaw: 0.4, pitch: 0.1 },
    dip: 0, dipNext: 9, sheet: 4, flash: 0, nextBolt: 4, autoBolt: false, rainK: 1, tagView: 0, tagT: 0, eye: 0.42, done: false, lastBoltT: -9, events: [],
  };
  const tmp = { h: 0, gx: 0, gz: 0 };
  let time = 0, portrait = false;

  const islandAz = () => Math.atan2(ISLAND.x - P.x, -(ISLAND.z - P.z));
  const desired = () => Math.atan2(-(ISLAND.x - P.x), -(ISLAND.z - P.z));
  const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };

  function strike(az, near = 0.5) {
    const dist = 160 + (1 - near) * 120;
    const dir = bolt.strike(new THREE.Vector3(P.x, 0, P.z), az, dist);
    SU.uFlashDir.value.copy(dir);
    S.flash = 1; S.lastBoltT = time;
    S.events.push({ type: "bolt", near });
  }

  const api = {
    scene, camera, S, P, SU,
    get time() { return time; },
    underwater: 0,
    dip(d = 1) { S.dip = d; },
    setEye(v) { S.eyeT = v; },
    islandDist: () => Math.hypot(ISLAND.x - P.x, ISLAND.z - P.z) - BEACH_R,
    strike, strikeIsland(near = 0.5) { strike(islandAz() + (Math.random() - 0.5) * 0.5, near); },
    setLook(yaw, pitch, k = 1) { S.target.yaw = yaw; S.target.pitch = pitch; S.look.k = k; },
    lookDrag(dx, dy) { S.look.uyaw = clamp(S.look.uyaw + dx * 0.004, -1.4, 1.4); S.look.upitch = clamp(S.look.upitch + dy * 0.003, -0.6, 0.6); },
    suitcasePick(ndc) {
      const ray = new THREE.Raycaster(); ray.setFromCamera(ndc, camera);
      const c = new THREE.Vector3(); suit.getWorldPosition(c);
      return ray.ray.distanceToPoint(c) < 1.2;
    },
    grab() { suitS.held = true; },
    tagView(on) { S.tagT = on ? 1 : 0; },
    startSwim() {
      S.mode = "swim"; S.eyeT = 0.42; P.heading = desired() + 0.25; P.swimT = 0; P.stamina = 100; arms.visible = true; S.nextBolt = 2.5;
    },
    stroke() {
      if (S.mode !== "swim" || P.under > 0) return null;
      if (time - P.lastStroke < 0.32) return null;
      P.lastStroke = time; P.stroke = 1; P.strokeSide *= -1;
      const good = P.good;
      let eff = good ? 1.25 : 0.3;
      if (P.stamina < 25) eff *= 0.55;
      P.vel += 3.0 * eff;
      P.stamina = Math.max(0, P.stamina - (good ? 3 : 10));
      if (P.big > 0 && good) { P.vel += 2.2; P.big = 0; S.events.push({ type: "ride" }); }
      if (P.hold) { P.hold.cool = 5; P.hold = null; }
      const fp = new THREE.Vector3(P.x - Math.sin(P.heading) * 0.9, 0, P.z - Math.cos(P.heading) * 0.9);
      waveAt(fp.x, fp.z, time, ocean.U.uAmp.value, tmp); fp.y = tmp.h;
      spray(fp, good ? 14 : 8, good ? 1 : 0.6);
      if (P.stamina <= 0) { P.under = 3.6; P.vel = 0; S.events.push({ type: "under" }); }
      return { good };
    },
    setSteer(v) { P.steer = clamp(v, -1, 1); },
    resize(w, h) { portrait = w / h < 0.8; camera.aspect = w / h; camera.fov = portrait ? 74 : 62; camera.updateProjectionMatrix(); },
    update(dt, t) {
      time = t;
      const amp = ocean.U.uAmp.value;
      SU.uTime.value = t;
      // 闪电
      if (S.autoBolt) {
        S.nextBolt -= dt;
        if (S.nextBolt <= 0) {
          const off = S.mode === "swim" ? Math.abs(angDiff(P.heading, desired())) : 0;
          api.strikeIsland(0.3 + Math.random() * 0.5);
          S.nextBolt = off > 0.5 ? 2.5 + Math.random() * 1.5 : 5 + Math.random() * 4;
        }
      }
      // 云层里的片状闪光（没有闪电柱，只照亮整片天）
      S.sheet -= dt;
      if (S.sheet <= 0) { S.sheet = 5 + Math.random() * 6; if (S.flash < 0.2) { const a = Math.random() * 6.28; SU.uFlashDir.value.set(Math.sin(a), 0.5, -Math.cos(a)).normalize(); S.flash = 0.45 + Math.random() * 0.3; } }
      S.flash = Math.max(0, S.flash - dt * 2.6);
      const fl = S.flash * (0.7 + 0.3 * Math.sin(t * 60));
      SU.uFlash.value = fl;
      bolt.update(dt);
      flashL.intensity = fl * 2.5;
      flashL.position.set(P.x + SU.uFlashDir.value.x * 80, 60, P.z + SU.uFlashDir.value.z * 80); flashL.target.position.set(P.x, 0, P.z);
      silM.color.setRGB(0.008 + fl * 0.01, 0.01 + fl * 0.012, 0.014 + fl * 0.018);
      { const on = (t % 1.6) < 0.55 ? 1 : 0.06; island.userData.lamp.material.color.setRGB(8 * on, 0.5 * on, 0.25 * on); island.userData.glow.material.opacity = on; }

      // 游泳物理
      if (S.mode === "swim") {
        P.swimT += dt;
        const ph = rhythmPhase(P.x, P.z, t);
        P.phase = ph;
        P.good = ph > 0.07 && ph < 0.36;
        P.stroke = Math.max(0, P.stroke - dt * 2.2);
        // 偏航：暗流慢慢把你推偏，玩家需要修正
        P.drift = noise1(t * 0.13 + 4) * 0.22;
        P.heading += (P.steer * 0.9 + P.drift) * dt;
        const err = angDiff(desired(), P.heading);
        if (P.swimT > 70 || Math.abs(err) > 1.0) P.heading += err * dt * (P.swimT > 70 ? 0.6 : 0.25);
        // 大浪
        P.bigT -= dt;
        if (P.bigT <= 0) { P.big = 2.6; P.bigT = 15 + Math.random() * 6; S.events.push({ type: "big" }); S.dip = 1.0; }
        S.dipNext -= dt; if (S.dipNext <= 0) { S.dip = 0.9; S.dipNext = 11 + Math.random() * 7; }
        if (P.big > 0) P.big -= dt;
        const surge = P.big > 0 ? Math.sin((1 - P.big / 2.6) * Math.PI) : 0;
        ocean.U.uAmp.value = damp(amp, 1.25 + surge * 0.7, 2, dt);
        // 速度
        P.vel *= Math.exp(-dt * 1.5);
        let back = 0.3 + surge * 1.1;
        if (P.hold) back *= 0.4;
        if (P.under > 0) {
          P.under -= dt; back = 0.35;
          if (P.under <= 0) { P.stamina = 55; P.carried = 0.8; S.events.push({ type: "surface" }); P.heading = desired(); }
        }
        if (P.carried > 0) { P.carried -= dt; P.vel = Math.max(P.vel, 1.6); }
        if (P.swimT > 90) P.assist = Math.min(1, P.assist + dt * 0.1);
        const fwd = P.vel + P.assist * 2.2;
        P.x += -Math.sin(P.heading) * fwd * dt;
        P.z += -Math.cos(P.heading) * fwd * dt + back * dt;
        // 体力恢复
        const rest = t - P.lastStroke > 0.9;
        if (P.under <= 0) P.stamina = Math.min(100, P.stamina + dt * (P.hold ? 22 : rest ? 4.5 : 0.8));
        // 木板
        for (const pk of planks) {
          pk.cool = Math.max(0, pk.cool - dt);
          if (!P.hold && pk.cool <= 0 && Math.hypot(pk.x - P.x, pk.z - P.z) < 2.0 && P.under <= 0) { P.hold = pk; S.events.push({ type: "plank" }); }
        }
        if (P.hold) { P.hold.x = damp(P.hold.x, P.x - 0.9, 3, dt); P.hold.z = damp(P.hold.z, P.z - 0.4, 3, dt); }
        if (api.islandDist() <= 0) { S.mode = "done"; S.done = true; S.events.push({ type: "shore" }); }
      }

      // 玩家在浪上的位置
      waveAt(P.x, P.z, t, ocean.U.uAmp.value, tmp);
      const h0 = tmp.h, gx = tmp.gx, gz = tmp.gz;
      const under = S.mode === "swim" && P.under > 0 ? Math.sin(clamp(1 - P.under / 3.6) * Math.PI) : 0;
      S.dip = Math.max(0, S.dip - dt);
      if (S.eyeT !== undefined) S.eye = damp(S.eye, S.eyeT, 1.2, dt);
      const dipC = S.dip > 0 ? Math.sin((1 - S.dip / 1.0) * Math.PI) : 0;
      const eye = lerp(S.eye, -0.12, under) - dipC * 0.62 * (1 - S.tagView);
      // 视角
      const L = S.look;
      let yaw, pitch;
      if (S.mode === "swim" || S.mode === "done") {
        L.yaw = damp(L.yaw, P.heading + P.steer * 0.12 + L.uyaw * 0.3, 4, dt);
        L.pitch = damp(L.pitch, -0.2 + L.upitch * 0.3 - P.stroke * 0.06, 4, dt);
        L.uyaw *= Math.exp(-dt * 1.2); L.upitch *= Math.exp(-dt * 1.2);
      } else {
        L.yaw = damp(L.yaw, S.target.yaw + L.uyaw, L.k, dt);
        L.pitch = damp(L.pitch, S.target.pitch + L.upitch, L.k, dt);
        L.uyaw *= Math.exp(-dt * 0.1); L.upitch *= Math.exp(-dt * 0.1);
      }
      S.tagView = damp(S.tagView, S.tagT, 1.6, dt);
      yaw = L.yaw; pitch = lerp(L.pitch, -1.22, S.tagView);
      const bob = noise1(t * 0.7) * 0.03;
      camera.position.set(P.x, h0 + eye + bob, P.z);
      { waveAt(camera.position.x, camera.position.z, t, ocean.U.uAmp.value, tmp); api.underwater = clamp((tmp.h - camera.position.y + 0.02) * 10); }
      camera.rotation.set(pitch + gz * 0.18 * (1 - S.tagView), yaw, (-gx * 0.25 + noise1(t * 0.5 + 7) * 0.03) * (1 - S.tagView));

      // 箱子
      if (suitS.held) {
        const fx = -Math.sin(L.yaw), fz = -Math.cos(L.yaw);
        const d = lerp(1.1 - P.stroke * 0.12, 0.55, S.tagView);
        suitS.x = damp(suitS.x, P.x + fx * d, 8, dt); suitS.z = damp(suitS.z, P.z + fz * d, 8, dt);
        suitS.yaw = damp(suitS.yaw, L.yaw, 4, dt);
      } else {
        suitS.x = damp(suitS.x, P.x - 1.05, 0.25, dt); suitS.z = damp(suitS.z, P.z + 0.85, 0.25, dt);
        suitS.yaw += dt * 0.1;
      }
      waveAt(suitS.x, suitS.z, t, ocean.U.uAmp.value, tmp);
      const sy = suitS.held ? lerp(tmp.h, h0, 0.7) - 0.02 : tmp.h + 0.02;
      suit.position.set(suitS.x, sy, suitS.z);
      suit.rotation.set(-tmp.gz * 0.5, suitS.yaw, tmp.gx * 0.5, "YXZ");
      if (S.tagView > 0.01) {
        const tp = new THREE.Vector3(); suit.updateMatrixWorld(); suit.userData.tag.getWorldPosition(tp);
        const k = S.tagView;
        camera.position.x = lerp(camera.position.x, tp.x + Math.sin(L.yaw) * 0.1, k);
        camera.position.z = lerp(camera.position.z, tp.z + Math.cos(L.yaw) * 0.1, k);
        camera.position.y = lerp(camera.position.y, tp.y + 0.3, k);
      }
      hemi.intensity = 0.7 + S.tagView * 1.6;

      // 手臂
      if (arms.visible) {
        for (const a of [armL, armR]) {
          const s = a.userData.s;
          const active = P.strokeSide === s ? P.stroke : 0;
          const sw = Math.sin(active * Math.PI);
          a.position.set(s * (0.2 + sw * 0.08), -0.36 + sw * 0.12, -0.12 - sw * 0.25);
          a.rotation.set(-1.25 - sw * 0.5 + (P.hold ? 0.2 : 0), 0, s * (0.25 - sw * 0.1));
        }
      }

      // 残骸漂浮
      for (const d of debris) {
        d.x += d.vx * dt; d.z += d.vz * dt + 0.05 * dt; d.yaw += d.spin * dt;
        waveAt(d.x, d.z, t, ocean.U.uAmp.value, tmp);
        d.mesh.position.set(d.x, tmp.h + d.off, d.z);
        d.mesh.rotation.set(-tmp.gz * 0.6 * d.tilt + (d === wing ? 0.0 : 0), d.yaw, tmp.gx * 0.6 * d.tilt + (d === wing ? 0.22 : 0), "YXZ");
      }
      fire.position.set(wing.mesh.position.x + 2.0, wing.mesh.position.y + 0.1, wing.mesh.position.z + 1.6);
      fire.lookAt(camera.position.x, fire.position.y, camera.position.z);
      fire.userData.U.uTime.value = t;
      fireL.position.copy(fire.position).add(new THREE.Vector3(0, 1.2, 0));
      fireL.intensity = (2.2 + noise1(t * 9) * 0.8) * (1 - clamp((P.swimT - 20) / 20) * 0.6);
      for (const pk of planks) {
        waveAt(pk.x, pk.z, t, ocean.U.uAmp.value, tmp);
        pk.mesh.position.set(pk.x, tmp.h + 0.02, pk.z);
        pk.mesh.rotation.set(-tmp.gz * 0.5, pk.yaw, tmp.gx * 0.5, "YXZ");
      }
      // 水花
      for (let i = 0; i < SPL; i++) {
        const s = splV[i];
        if (s.life > 0) { s.life -= dt; s.v.y -= 9 * dt; splP[i * 3] += s.v.x * dt; splP[i * 3 + 1] += s.v.y * dt; splP[i * 3 + 2] += s.v.z * dt; if (s.life <= 0) splP[i * 3 + 1] = -99; }
      }
      splG.attributes.position.needsUpdate = true;
      splash.material.color.setRGB(0.35 + fl, 0.4 + fl, 0.46 + fl);
      updateSpray(dt, t, P.x, P.z); sprayPts.material.color.setRGB(0.4 + fl, 0.45 + fl, 0.52 + fl);

      // 雨、天空跟随
      rain.U.uTime.value = t; rain.U.uCenter.value.copy(camera.position); rain.U.uFlash.value = fl; rain.U.uOpacity.value = 0.55 * S.rainK;
      rain.U.uWind.value.set(Math.sin(t * 0.1) * 3 + 2, 5);
      sky.position.copy(camera.position);
      ocean.mesh.position.set(Math.round(P.x / 4) * 4, 0, Math.round(P.z / 4) * 4);
      ocean.U.uGlint.value = 0;
    },
    dispose() { disposeTree(scene); },
  };
  return api;
}
