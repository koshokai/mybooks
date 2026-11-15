// 沉没之后 · 序章：上岸、黎明、沉没的城市（第六幕 + 结尾）
import * as THREE from "three";
import { clamp, lerp, damp, smooth, noise1, rng, canvasTex, FONT, GLSL_NOISE, disposeTree } from "./util.js";
import { skyUniforms, makeSky, makeOcean, makeRain, makeBolt, waveAt } from "./ocean.js";
import { makeSuitcase } from "./sea.js";

const hillH = (x, z) => {
  const r = Math.hypot(x, z);
  const n = noise1(x * 0.21 + 3.1) * noise1(z * 0.19 - 7.7);
  return 16.3 * Math.exp(-1.3 * (r / 19) * (r / 19)) - 0.8 + n * 0.5 * smooth(8, 22, r) - smooth(30, 46, r) * 2.5;
};

/* ---------- 城市建筑的着色器：窗格、湿痕、雾、黎明光 ---------- */
function cityMaterial(CU) {
  return new THREE.ShaderMaterial({
    uniforms: CU,
    vertexShader: /* glsl */ `
      varying vec3 vW; varying vec3 vN; varying vec3 vC;
      void main(){
        mat4 m = modelMatrix;
        #ifdef USE_INSTANCING
          m = m * instanceMatrix;
        #endif
        vec4 w = m * vec4(position, 1.0);
        vW = w.xyz; vN = normalize(mat3(m) * normal);
        vC = vec3(1.0);
        #ifdef USE_INSTANCING_COLOR
          vC = instanceColor;
        #endif
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uSunDir, uSunCol, uSky, uGround, uFogCol; uniform float uFogD, uNight, uFlash, uTime;
      varying vec3 vW; varying vec3 vN; varying vec3 vC;
      ${GLSL_NOISE}
      void main(){
        vec3 n = normalize(vN);
        vec3 base = vC;
        float side = 1.0 - step(0.6, abs(n.y));
        // 窗格
        float u = abs(n.x) > 0.5 ? vW.z : vW.x;
        float fy = fract(vW.y / 3.1), fu = fract(u / 2.6);
        float win = side * step(0.28, fy) * step(fy, 0.78) * step(0.18, fu) * step(fu, 0.82);
        float broken = step(0.82, hash12(floor(vec2(u / 2.6, vW.y / 3.1)) + floor(vW.xz * 0.01)));
        vec3 glass = mix(vec3(0.03, 0.04, 0.05), uSky * 0.45, 0.35 + 0.4 * hash12(floor(vec2(u / 2.6, vW.y / 3.1))));
        glass = mix(glass, vec3(0.01), broken);
        base = mix(base, glass, win * 0.9);
        // 污渍 / 水线
        float grime = fbm3(vec2(u * 0.3, vW.y * 0.8));
        base *= 0.82 + 0.3 * grime;
        float wet = 1.0 - smoothstep(0.0, 1.6 + grime * 0.8, vW.y);
        base = mix(base, base * vec3(0.38, 0.45, 0.38), wet * side);
        float roof = step(0.6, n.y);
        base = mix(base, base * 0.75 + vec3(0.03), roof);
        // 光照
        float dif = max(dot(n, uSunDir), 0.0);
        vec3 hemi = mix(uGround, uSky, n.y * 0.5 + 0.5);
        vec3 col = base * (hemi + uSunCol * dif * 1.2);
        float rim = max(dot(n, -uSunDir), 0.0);
        col += uSunCol * win * 0.08 * (1.0 - rim);
        col = mix(col, base * 0.05 + uFlash * base * 0.6, uNight);
        float d = length(vW - cameraPosition) * uFogD;
        col = mix(col, uFogCol + uFlash * 0.2 * uNight, 1.0 - exp(-d * d));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
}

function textPlate(w, h, draw) { return canvasTex(w, h, draw, { aniso: 8 }); }

export function buildDawn({ renderer, lowEnd }) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x8a9ab0);
  scene.fog = new THREE.FogExp2(0xe8b48a, 0.0022);
  const camera = new THREE.PerspectiveCamera(60, 1, 0.05, 2500);
  camera.rotation.order = "YXZ";
  const R = rng(21);

  const SU = skyUniforms();
  const sky = makeSky(SU); scene.add(sky);
  const ocean = makeOcean(SU, { N: lowEnd ? 160 : 210, R: 900 }); scene.add(ocean.mesh);
  const rain = makeRain(lowEnd ? 700 : 1200); scene.add(rain.mesh);
  const bolt = makeBolt(); scene.add(bolt.mesh);

  const hemi = new THREE.HemisphereLight(0xbcd2ff, 0x5a4636, 0.9); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffc690, 2.2); scene.add(sun); scene.add(sun.target);
  const flashL = new THREE.DirectionalLight(0xc8d4ff, 0); flashL.position.set(0, 50, -80); scene.add(flashL);

  const CU = {
    uSunDir: { value: new THREE.Vector3() }, uSunCol: { value: new THREE.Color() }, uSky: { value: new THREE.Color() }, uGround: { value: new THREE.Color() },
    uFogCol: { value: new THREE.Color() }, uFogD: { value: 0.0022 }, uNight: { value: 0 }, uFlash: { value: 0 }, uTime: { value: 0 },
  };
  const cityM = cityMaterial(CU);

  // ---------- 小岛：其实是城市公园的山丘 ----------
  {
    const N = lowEnd ? 110 : 150, S = 110;
    const g = new THREE.PlaneGeometry(S, S, N, N); g.rotateX(-Math.PI / 2);
    const p = g.attributes.position, col = new Float32Array(p.count * 3), c = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i), y = hillH(x, z);
      p.setY(i, y);
      const n = noise1(x * 0.7 + z * 0.3) * 0.5 + 0.5, n2 = noise1(x * 0.13 - z * 0.17 + 40) * 0.5 + 0.5;
      if (y < 0.25) c.setRGB(0.36, 0.3, 0.24);
      else if (y < 1.6) c.setRGB(0.78 + n * 0.06, 0.66 + n * 0.05, 0.5);
      else if (n2 > 0.72) c.setRGB(0.42, 0.4, 0.36);
      else c.setRGB(0.22 + n * 0.08, 0.3 + n * 0.08, 0.13);
      c.toArray(col, i * 3);
    }
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    g.computeVertexNormals();
    const terrain = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
    scene.add(terrain);
  }
  // 石阶小路（从沙滩通向山顶）
  {
    const pts = [[2, 28], [1.6, 22], [0.4, 15], [-0.3, 8], [0, 3]];
    const curve = new THREE.CatmullRomCurve3(pts.map(([x, z]) => new THREE.Vector3(x, 0, z)));
    const m = new THREE.MeshLambertMaterial({ color: 0xa8a092, emissive: 0x1c1a18 });
    const steps = new THREE.InstancedMesh(new THREE.BoxGeometry(1.4, 0.18, 0.5), m, 60);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    for (let i = 0; i < 60; i++) {
      const t = i / 59, v = curve.getPoint(t), tan = curve.getTangent(t);
      q.setFromEuler(e.set(0, Math.atan2(tan.x, tan.z), 0));
      m4.compose(new THREE.Vector3(v.x, hillH(v.x, v.z) + 0.04, v.z), q, new THREE.Vector3(1, 1, 1)); steps.setMatrixAt(i, m4);
    }
    scene.add(steps);
  }
  // 树（有些被风暴吹倒）
  {
    const trunkM = new THREE.MeshStandardMaterial({ color: 0x4a3626, roughness: 1 });
    const leafM = new THREE.MeshStandardMaterial({ color: 0x3d5a2a, roughness: 0.95, flatShading: true });
    const leafG = new THREE.IcosahedronGeometry(1.5, 0), trunkG = new THREE.CylinderGeometry(0.12, 0.2, 2.6, 6).translate(0, 1.3, 0);
    for (let i = 0; i < 34; i++) {
      const a = R() * Math.PI * 2, r = 5 + R() * 18;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (Math.abs(x) < 3.5 && z > 0) continue; // 给小路让出来
      if (z < 2 && Math.abs(x) < 7 - z * 1.2) continue; // 不挡住远眺
      const y = hillH(x, z);
      if (y < 1.8) continue;
      const t = new THREE.Group();
      const tr = new THREE.Mesh(trunkG, trunkM); t.add(tr);
      const s = 0.8 + R() * 0.8;
      for (let k = 0; k < 3; k++) { const l = new THREE.Mesh(leafG, leafM); l.position.set((R() - 0.5) * 1.2, 2.6 + R() * 1.2, (R() - 0.5) * 1.2); l.scale.setScalar(0.7 + R() * 0.5); t.add(l); }
      t.scale.setScalar(s);
      t.position.set(x, y - 0.1, z); t.rotation.y = R() * 6;
      if (R() < 0.15) t.rotation.z = 1.35;
      scene.add(t);
    }
  }
  // 山顶的“观潮亭”
  const pavilion = new THREE.Group();
  {
    const red = new THREE.MeshStandardMaterial({ color: 0x8e2a22, roughness: 0.7 });
    const tile = new THREE.MeshStandardMaterial({ color: 0x3c4045, roughness: 0.8, flatShading: true });
    const stone = new THREE.MeshStandardMaterial({ color: 0xa59f94, roughness: 0.95 });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.7, 0.5, 6), stone); base.position.y = 0.15; pavilion.add(base);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 3.0, 10), red); c.position.set(Math.cos(a) * 2.9, 1.9, Math.sin(a) * 2.9); pavilion.add(c);
    }
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(3.05, 3.05, 0.3, 6, 1, true), red); beam.position.y = 3.35; beam.rotation.y = Math.PI / 6; pavilion.add(beam);
    const roofG = new THREE.ConeGeometry(4.4, 2.2, 6, 1, true);
    const rp = roofG.attributes.position;
    for (let i = 0; i < rp.count; i++) { const x = rp.getX(i), z = rp.getZ(i), r = Math.hypot(x, z); rp.setY(i, rp.getY(i) - Math.sin(r / 4.4 * Math.PI) * 0.35 + (r > 4.2 ? 0.25 : 0)); }
    roofG.computeVertexNormals();
    const roof = new THREE.Mesh(roofG, tile); roof.position.y = 4.55; roof.rotation.y = Math.PI / 6; pavilion.add(roof);
    const under = new THREE.Mesh(new THREE.CircleGeometry(4.2, 6).rotateX(Math.PI / 2), red); under.position.y = 3.5; under.rotation.y = Math.PI / 6; pavilion.add(under);
    const fin = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), new THREE.MeshStandardMaterial({ color: 0xb08a4a, metalness: 0.7, roughness: 0.3 })); fin.position.y = 5.8; pavilion.add(fin);
    const plaque = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.5), new THREE.MeshStandardMaterial({ map: textPlate(320, 100, (g, w, h) => {
      g.fillStyle = "#2a1d14"; g.fillRect(0, 0, w, h); g.strokeStyle = "#b08a4a"; g.lineWidth = 6; g.strokeRect(5, 5, w - 10, h - 10);
      g.fillStyle = "#d9b46a"; g.font = `bold 62px ${FONT}`; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("观 潮 亭", w / 2, h / 2 + 3);
    }), roughness: 0.6 }));
    plaque.position.set(0, 3.35, 2.7); pavilion.add(plaque);
    pavilion.position.set(0, hillH(0, 0) - 0.15, 0);
    scene.add(pavilion);
  }
  // 公园的长椅与倒下的路灯
  {
    const wood = new THREE.MeshStandardMaterial({ color: 0x6b4a2e, roughness: 0.9 });
    const iron = new THREE.MeshStandardMaterial({ color: 0x2b2f33, roughness: 0.5, metalness: 0.6 });
    const bench = new THREE.Group();
    for (let i = 0; i < 3; i++) { const s = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.05, 0.12), wood); s.position.set(0, 0.45, i * 0.14); bench.add(s); }
    for (const x of [-0.7, 0.7]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.45, 0.4), iron); l.position.set(x, 0.22, 0.14); bench.add(l); }
    bench.position.set(3.6, hillH(3.6, 9) , 9); bench.rotation.y = -0.4; scene.add(bench);
    const lamp = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 3.4, 8).translate(0, 1.7, 0), iron); lamp.add(pole);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), new THREE.MeshStandardMaterial({ color: 0xe8e2d0, roughness: 0.3 })); head.position.y = 3.45; lamp.add(head);
    lamp.position.set(-2.4, hillH(-2.4, 17), 17); lamp.rotation.z = 0.5; lamp.rotation.x = -0.2; scene.add(lamp);
  }
  // 沙滩上的箱子与冲上岸的残骸
  const suit = makeSuitcase();
  suit.position.set(3.1, hillH(3.1, 29.6) + 0.12, 29.6); suit.rotation.set(0.12, 2.4, 0.05); scene.add(suit);
  {
    const vest = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.45), new THREE.MeshStandardMaterial({ color: 0xff6a1a, roughness: 0.6 }));
    vest.position.set(-3.5, hillH(-3.5, 30.5) + 0.05, 30.5); vest.rotation.y = 0.7; scene.add(vest);
    const plank = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.08, 0.3), new THREE.MeshStandardMaterial({ color: 0x8a6440, roughness: 0.9 }));
    plank.position.set(6, hillH(6, 29) + 0.05, 29); plank.rotation.y = 1.1; scene.add(plank);
  }

  // ---------- 沉没的城市 ----------
  const buildings = [];
  {
    const avoid = (x, z) => Math.hypot(x, z) < 38 || (z > 18 && Math.abs(x) < 40 + (z - 18) * 0.6);
    for (let gx = -24; gx <= 24; gx++) for (let gz = -34; gz <= 8; gz++) {
      const x = gx * 17 + (R() - 0.5) * 6, z = gz * 17 + (R() - 0.5) * 6;
      if (avoid(x, z)) continue;
      const dist = Math.hypot(x, z);
      if (R() < 0.18 + dist / 2400) continue;
      let h = 0.3 + Math.pow(R(), 3) * 11;
      if (R() < 0.05) h = 18 + R() * 22;
      if (z < -280 && R() < 0.35) h += 12 + R() * 20;
      buildings.push({ x, z, w: 7 + R() * 7, d: 7 + R() * 7, h, ry: (R() - 0.5) * 0.12 });
    }
    // 游泳时路过的那几处楼顶（与夜里看见的剪影一致）
    for (const [x, z, w, h, d] of [[16, 46, 7, 1.6, 9], [-22, 58, 5, 2.4, 6], [26, 70, 9, 0.9, 7], [-14, 36, 4, 3.2, 4]]) buildings.push({ x, z, w, d, h, ry: 0 });
    // 远眺时眼前几栋（让构图有层次）
    for (const [x, z, w, h, d] of [[-24, -46, 10, 6, 9], [20, -52, 9, 3.5, 12], [-6, -70, 12, 9, 10], [36, -40, 8, 1.2, 8], [-44, -32, 8, 2.2, 10], [10, -96, 14, 13, 12]]) buildings.push({ x, z, w, d, h, ry: 0.05 });
    const pal = [[0.62, 0.57, 0.5], [0.52, 0.55, 0.58], [0.66, 0.58, 0.48], [0.45, 0.5, 0.55], [0.6, 0.47, 0.42], [0.7, 0.68, 0.64], [0.44, 0.46, 0.43], [0.55, 0.6, 0.62]];
    const box = new THREE.BoxGeometry(1, 1, 1);
    const im = new THREE.InstancedMesh(box, cityM, buildings.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), c = new THREE.Color();
    buildings.forEach((b, i) => {
      const bottom = -6;
      q.setFromEuler(e.set(0, b.ry, 0));
      m4.compose(new THREE.Vector3(b.x, (b.h + bottom) / 2, b.z), q, new THREE.Vector3(b.w, b.h - bottom, b.d));
      im.setMatrixAt(i, m4);
      const p = pal[Math.floor(R() * pal.length)];
      im.setColorAt(i, c.setRGB(p[0], p[1], p[2]));
    });
    im.frustumCulled = false;
    scene.add(im);
    // 屋顶上的水箱、楼梯间、空调外机
    const tanks = [], huts = [];
    for (const b of buildings) {
      if (R() < 0.35) tanks.push([b.x + (R() - 0.5) * b.w * 0.5, b.h, b.z + (R() - 0.5) * b.d * 0.5, 0.9 + R() * 0.6]);
      if (R() < 0.45) huts.push([b.x + (R() - 0.5) * b.w * 0.4, b.h, b.z + (R() - 0.5) * b.d * 0.4, 2 + R() * 1.5]);
    }
    const tg = new THREE.CylinderGeometry(1, 1, 1, 12);
    const ti = new THREE.InstancedMesh(tg, cityM, tanks.length);
    tanks.forEach(([x, y, z, r], i) => { m4.compose(new THREE.Vector3(x, y + 1.6, z), q.identity(), new THREE.Vector3(r, 1.8, r)); ti.setMatrixAt(i, m4); ti.setColorAt(i, c.setRGB(0.55, 0.6, 0.66)); });
    ti.frustumCulled = false; scene.add(ti);
    const hi = new THREE.InstancedMesh(box, cityM, huts.length);
    huts.forEach(([x, y, z, s], i) => { m4.compose(new THREE.Vector3(x, y + 1.1, z), q.identity(), new THREE.Vector3(s, 2.2, s * 1.2)); hi.setMatrixAt(i, m4); hi.setColorAt(i, c.setRGB(0.66, 0.64, 0.6)); });
    hi.frustumCulled = false; scene.add(hi);
  }
  const concrete = new THREE.MeshStandardMaterial({ color: 0xc9c2b6, roughness: 0.9 });
  // 钟楼（停在 6:41）
  {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(7, 34, 7), concrete); body.position.y = 7; g.add(body);
    const face = textPlate(256, 256, (c, w, h) => {
      c.fillStyle = "#efe6d2"; c.beginPath(); c.arc(w / 2, h / 2, 120, 0, Math.PI * 2); c.fill();
      c.strokeStyle = "#2c2a26"; c.lineWidth = 8; c.stroke();
      for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; c.lineWidth = i % 3 ? 4 : 9; c.beginPath(); c.moveTo(w / 2 + Math.sin(a) * 92, h / 2 - Math.cos(a) * 92); c.lineTo(w / 2 + Math.sin(a) * 110, h / 2 - Math.cos(a) * 110); c.stroke(); }
      const hand = (a, len, wd) => { c.lineWidth = wd; c.lineCap = "round"; c.beginPath(); c.moveTo(w / 2, h / 2); c.lineTo(w / 2 + Math.sin(a) * len, h / 2 - Math.cos(a) * len); c.stroke(); };
      hand(((6 + 41 / 60) / 12) * Math.PI * 2, 58, 11); hand((41 / 60) * Math.PI * 2, 92, 7);
    });
    const fm = new THREE.MeshStandardMaterial({ map: face, roughness: 0.6 });
    for (let i = 0; i < 4; i++) { const f = new THREE.Mesh(new THREE.CircleGeometry(2.6, 32), fm); const a = i * Math.PI / 2; f.position.set(Math.sin(a) * 3.52, 20.5, Math.cos(a) * 3.52); f.rotation.y = a; g.add(f); }
    const cap = new THREE.Mesh(new THREE.BoxGeometry(8, 1, 8), concrete); cap.position.y = 24.5; g.add(cap);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(5.6, 8, 4), new THREE.MeshStandardMaterial({ color: 0x3f5a57, roughness: 0.6, metalness: 0.3 })); roof.position.y = 29; roof.rotation.y = Math.PI / 4; g.add(roof);
    g.position.set(-38, 0, -55); g.rotation.y = 0.35; scene.add(g);
  }
  // 电视塔（塔顶的航标灯还在闪）
  let beacon;
  {
    const g = new THREE.Group();
    const sh = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 3.2, 120, 14), concrete); sh.position.y = 50; g.add(sh);
    const pod = new THREE.Mesh(new THREE.SphereGeometry(7, 24, 16), new THREE.MeshStandardMaterial({ color: 0xd8d4cc, roughness: 0.4, metalness: 0.3 })); pod.position.y = 86; pod.scale.y = 0.72; g.add(pod);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(7.4, 0.6, 8, 32), new THREE.MeshStandardMaterial({ color: 0x5e6a74 })); ring.position.y = 86; ring.rotation.x = Math.PI / 2; g.add(ring);
    const pod2 = new THREE.Mesh(new THREE.SphereGeometry(3.2, 16, 12), concrete); pod2.position.y = 106; g.add(pod2);
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.6, 40, 6), new THREE.MeshStandardMaterial({ color: 0xb7b9bc })); ant.position.y = 128; g.add(ant);
    beacon = new THREE.Mesh(new THREE.SphereGeometry(0.9, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 0.4, 0.2), toneMapped: false, fog: false }));
    beacon.position.y = 149; g.add(beacon);
    g.position.set(90, 0, -230); scene.add(g);
  }
  // 半沉的摩天轮
  {
    const g = new THREE.Group();
    const steel = new THREE.MeshStandardMaterial({ color: 0xe9ecef, roughness: 0.4, metalness: 0.4 });
    const rim = new THREE.Mesh(new THREE.TorusGeometry(26, 0.5, 6, 64), steel); g.add(rim);
    const rim2 = rim.clone(); rim2.scale.setScalar(0.96); g.add(rim2);
    for (let i = 0; i < 16; i++) { const s = new THREE.Mesh(new THREE.BoxGeometry(0.3, 52, 0.3), steel); s.rotation.z = (i / 16) * Math.PI; g.add(s); }
    const cols = [0xe86a5a, 0xf2c14e, 0x6cc3d5, 0x8fd18a, 0xf4a6c1];
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const cab = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.6, 2.2), new THREE.MeshStandardMaterial({ color: cols[i % cols.length], roughness: 0.6 }));
      cab.position.set(Math.cos(a) * 26, Math.sin(a) * 26 - 2, 0); g.add(cab);
    }
    g.position.set(-120, 6, -150); g.rotation.y = 0.5; scene.add(g);
  }
  // 远处的斜拉桥桥塔
  {
    const m = concrete;
    for (const z of [-120, -300]) {
      const g = new THREE.Group();
      for (const x of [-4, 4]) { const l = new THREE.Mesh(new THREE.BoxGeometry(2, 70, 2.5), m); l.position.set(x * (1 - 0), 30, 0); l.rotation.z = -x * 0.012; g.add(l); }
      const t = new THREE.Mesh(new THREE.BoxGeometry(10, 2, 2.5), m); t.position.y = 55; g.add(t);
      const pts = [];
      for (let i = 1; i <= 8; i++) for (const s of [-1, 1]) pts.push(0, 62 - i * 0.6, 0, 0, 3, s * i * 8.5);
      const cg = new THREE.BufferGeometry(); cg.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
      g.add(new THREE.LineSegments(cg, new THREE.LineBasicMaterial({ color: 0xd8d2c6, transparent: true, opacity: 0.7 })));
      g.position.set(230, 0, z); scene.add(g);
    }
  }
  // 路牌：露出水面的城市痕迹
  {
    const blue = (lines) => textPlate(512, 240, (g, w, h) => {
      g.fillStyle = "#1d4f9c"; g.fillRect(0, 0, w, h); g.strokeStyle = "#f2f2f2"; g.lineWidth = 8; g.strokeRect(10, 10, w - 20, h - 20);
      g.fillStyle = "#fff"; g.textBaseline = "middle";
      lines(g, w, h);
      g.fillStyle = "rgba(60,90,70,0.35)"; g.fillRect(0, h - 26, w, 26);
    });
    const iron = new THREE.MeshStandardMaterial({ color: 0x6c7277, roughness: 0.5, metalness: 0.6 });
    // 大路牌：灯塔街
    const g1 = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 12, 10), iron); pole.position.y = -2.0; g1.add(pole);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.2, 0.2), iron); arm.position.set(1.5, 3.4, 0); g1.add(arm);
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 2.15), new THREE.MeshStandardMaterial({ map: blue((g, w, h) => {
      g.textAlign = "center"; g.font = `900 84px ${FONT}`; g.fillText("灯 塔 街", w / 2, 92);
      g.font = `600 30px ${FONT}`; g.fillText("DENGTA  ST.", w / 2, 150);
      g.font = `600 34px ${FONT}`; g.textAlign = "left"; g.fillText("← 潮汐路", 34, 196); g.textAlign = "right"; g.fillText("市图书馆 →", w - 34, 196);
    }), roughness: 0.5, side: THREE.DoubleSide }));
    plate.position.set(2.2, 2.25, 0.12); g1.add(plate);
    g1.position.set(-5, -1.2, -31); g1.rotation.set(0.04, 0.12, -0.06); g1.scale.setScalar(1.6); scene.add(g1);
    // 公交站牌
    const g2 = new THREE.Group();
    const p2 = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 6, 8), iron); p2.position.y = -1; g2.add(p2);
    const plate2 = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.1), new THREE.MeshStandardMaterial({ map: textPlate(256, 188, (g, w, h) => {
      g.fillStyle = "#e9eef2"; g.fillRect(0, 0, w, h); g.fillStyle = "#127a4f"; g.fillRect(0, 0, w, 60);
      g.fillStyle = "#fff"; g.font = `bold 40px ${FONT}`; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("公交车站", w / 2, 32);
      g.fillStyle = "#1a1a1a"; g.font = `bold 52px ${FONT}`; g.fillText("17 路", w / 2, 106);
      g.font = `26px ${FONT}`; g.fillText("灯塔街 → 海港", w / 2, 158);
    }), roughness: 0.5, side: THREE.DoubleSide }));
    plate2.position.y = 1.9; g2.add(plate2);
    g2.position.set(9.5, 0, -32.5); g2.rotation.set(-0.05, -0.2, 0.1); scene.add(g2);
    // 歪斜的红绿灯
    const g3 = new THREE.Group();
    const p3 = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 8, 8), iron); p3.position.y = 0; g3.add(p3);
    const hb = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.3, 0.4), new THREE.MeshStandardMaterial({ color: 0x222426 })); hb.position.y = 4.5; g3.add(hb);
    for (let i = 0; i < 3; i++) { const l = new THREE.Mesh(new THREE.CircleGeometry(0.14, 12), new THREE.MeshStandardMaterial({ color: [0x401010, 0x403510, 0x103a18][i] })); l.position.set(0, 4.9 - i * 0.4, 0.21); g3.add(l); }
    g3.position.set(17, 0, -36); g3.rotation.z = -0.28; scene.add(g3);
    // 屋顶广告牌
    const g4 = new THREE.Mesh(new THREE.PlaneGeometry(9, 3.4), new THREE.MeshStandardMaterial({ map: textPlate(512, 194, (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, "#c8452f"); gr.addColorStop(1, "#e2873a"); g.fillStyle = gr; g.fillRect(0, 0, w, h);
      g.fillStyle = "#fff7e6"; g.font = `900 92px ${FONT}`; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("海潮百货", w / 2, h / 2 - 10);
      g.font = `26px ${FONT}`; g.fillText("周年庆 · 全场五折起", w / 2, h - 28);
      g.fillStyle = "rgba(0,0,0,0.25)"; g.fillRect(w * 0.62, 0, 40, h);
    }), roughness: 0.7, side: THREE.DoubleSide }));
    g4.position.set(-24, 6 + 4.8, -46); g4.rotation.y = 0.25; scene.add(g4);
    const legs = new THREE.Mesh(new THREE.BoxGeometry(7, 3.2, 0.3), iron); legs.position.set(-24, 6 + 1.6, -46.3); legs.rotation.y = 0.25; scene.add(legs);
  }
  // 海鸥
  const gulls = [];
  {
    const wm = new THREE.MeshBasicMaterial({ color: 0x2b2a2e, side: THREE.DoubleSide, fog: true });
    const wg = new THREE.BufferGeometry(); wg.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0, 0.9, 0.05, -0.15, 0, 0, -0.35], 3));
    for (let i = 0; i < 6; i++) {
      const g = new THREE.Group();
      const l = new THREE.Mesh(wg, wm), r = new THREE.Mesh(wg, wm); r.scale.x = -1; g.add(l, r);
      g.userData = { l, r, a: R() * 6, rad: 14 + R() * 26, y: 22 + R() * 14, cx: (R() - 0.5) * 30, cz: -30 - R() * 40, sp: 0.15 + R() * 0.1 };
      scene.add(g); gulls.push(g);
    }
  }

  // ---------- 光照预设 ----------
  const P = {
    night: {
      zen: [0.012, 0.016, 0.022], hor: [0.035, 0.042, 0.05], sun: [0, 0, 0], cloud: 1, cl: [0.07, 0.08, 0.095], cd: [0.012, 0.015, 0.02],
      deep: [0.006, 0.014, 0.02], sc: [0.02, 0.05, 0.055], fog: [0.03, 0.036, 0.045], hemi: 0.18, sunI: 0, amp: 0.55, foam: 0.7, glint: 0, light: 0.1, night: 1, fogD: 0.004,
    },
    dawn: {
      zen: [0.17, 0.3, 0.56], hor: [1.0, 0.7, 0.48], sun: [1.6, 0.95, 0.5], cloud: 0.38, cl: [1.15, 0.86, 0.72], cd: [0.42, 0.42, 0.55],
      deep: [0.02, 0.07, 0.095], sc: [0.06, 0.17, 0.18], fog: [0.92, 0.72, 0.58], hemi: 0.95, sunI: 2.4, amp: 0.13, foam: 0.12, glint: 1, light: 0.9, night: 0, fogD: 0.0021,
    },
  };
  const L = { k: 0 }; // 0 = 夜，1 = 黎明
  const sunDir = new THREE.Vector3(0.32, 0.075, -1).normalize();
  const mixc = (a, b, k, out) => out.setRGB(lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k));
  function applyLight(k, flash) {
    const A = P.night, B = P.dawn;
    mixc(A.zen, B.zen, k, SU.uZen.value); mixc(A.hor, B.hor, k, SU.uHor.value); mixc(A.sun, B.sun, k, SU.uSunCol.value);
    mixc(A.cl, B.cl, k, SU.uCloudLit.value); mixc(A.cd, B.cd, k, SU.uCloudDark.value);
    SU.uCloud.value = lerp(A.cloud, B.cloud, k); SU.uSunDir.value.copy(sunDir); SU.uSunSize.value = 0.0009; SU.uWind.value = lerp(0.05, 0.008, k);
    const O = ocean.U;
    mixc(A.deep, B.deep, k, O.uDeep.value); mixc(A.sc, B.sc, k, O.uScatter.value); mixc(A.fog, B.fog, k, O.uFogCol.value);
    O.uFoam.value = lerp(A.foam, B.foam, k); O.uGlint.value = lerp(A.glint, B.glint, k); O.uLight.value = lerp(A.light, B.light, k); O.uFogD.value = lerp(0.006, 0.0016, k);
    O.uAmp.value = lerp(A.amp, B.amp, k);
    hemi.intensity = lerp(A.hemi, B.hemi, k) + flash * 0.8; sun.intensity = lerp(A.sunI, B.sunI, k);
    sun.position.copy(sunDir).multiplyScalar(200); sun.target.position.set(0, 0, 0);
    scene.fog.color.copy(O.uFogCol.value); scene.fog.density = lerp(A.fogD, B.fogD, k);
    CU.uSunDir.value.copy(sunDir); CU.uSunCol.value.copy(SU.uSunCol.value).multiplyScalar(0.8);
    CU.uSky.value.setRGB(lerp(0.05, 0.42, k), lerp(0.06, 0.48, k), lerp(0.08, 0.62, k)); CU.uGround.value.setRGB(lerp(0.02, 0.32, k), lerp(0.02, 0.27, k), lerp(0.02, 0.24, k));
    CU.uFogCol.value.copy(O.uFogCol.value); CU.uFogD.value = scene.fog.density; CU.uNight.value = 1 - k; CU.uFlash.value = flash;
    flashL.intensity = flash * 2.5;
    rain.U.uOpacity.value = 0.4 * (1 - k);
  }

  // ---------- 相机路径 ----------
  const walk = new THREE.CatmullRomCurve3([[2.2, 29.4], [1.7, 24], [1.0, 18.5], [0.2, 12.5], [-0.3, 7.5], [0, 3.6], [0, 0.6], [0, -1.6]].map(([x, z]) => new THREE.Vector3(x, 0, z)));
  const S = { focus: 0, focusT: 0, mode: "crawl", t: 0, flash: 0, light: 0, lightT: 0, nextBolt: 1.2, title: 0, portrait: false };
  let time = 0;
  const cam = { pos: new THREE.Vector3(2.2, 0.8, 35), yaw: 0, pitch: 0, roll: 0 };
  const tmp = { h: 0, gx: 0, gz: 0 };

  const api = {
    scene, camera, S,
    setMode(m) { S.mode = m; S.t = 0; },
    focusSign(on) { S.focusT = on ? 1 : 0; },
    setLight(k, instant = false) { S.lightT = k; if (instant) S.light = k; },
    strike() { const dir = bolt.strike(new THREE.Vector3(cam.pos.x, 0, cam.pos.z), (Math.random() - 0.5) * 1.2, 170); SU.uFlashDir.value.copy(dir); S.flash = 1; },
    look: { uyaw: 0, upitch: 0 },
    lookDrag(dx, dy) { api.look.uyaw = clamp(api.look.uyaw + dx * 0.004, -1.2, 1.2); api.look.upitch = clamp(api.look.upitch + dy * 0.003, -0.5, 0.5); },
    resize(w, h) { S.portrait = w / h < 0.8; camera.aspect = w / h; camera.fov = S.portrait ? 70 : 55; camera.updateProjectionMatrix(); },
    update(dt, t) {
      time = t; S.t += dt;
      SU.uTime.value = t; CU.uTime.value = t;
      S.light = damp(S.light, S.lightT, 0.8, dt);
      if (S.mode === "crawl") {
        S.nextBolt -= dt;
        if (S.nextBolt <= 0) { api.strike(); S.nextBolt = 3 + Math.random() * 3; }
      }
      S.flash = Math.max(0, S.flash - dt * 2.6);
      const fl = S.flash * (0.7 + 0.3 * Math.sin(t * 60));
      SU.uFlash.value = fl; bolt.update(dt);
      applyLight(S.light, fl);

      // 相机
      const m = S.mode, k = S.t;
      let px = 0, py = 0, pz = 0, yaw = 0, pitch = 0, roll = 0;
      if (m === "crawl") {
        const u = smooth(0, 7, k);
        px = 2.2; pz = lerp(35.5, 30.8, u);
        waveAt(px, pz, t, ocean.U.uAmp.value, tmp);
        const ground = hillH(px, pz) + 0.35;
        py = Math.max(ground, tmp.h + 0.3);
        yaw = 0.05 + noise1(t * 0.4) * 0.1; pitch = 0.05 + noise1(t * 0.5 + 3) * 0.06 - u * 0.15; roll = 0.12 + noise1(t * 0.6) * 0.08;
        pitch += Math.sin(k * 2.2) * 0.04 * (1 - u * 0.5);
      } else if (m === "wake") {
        // 躺在沙滩上 → 坐起来 → 回头看海
        const sit = smooth(4, 8.5, k), turn = smooth(7, 12, k);
        px = 2.2; pz = 30.0; py = hillH(px, pz) + lerp(0.3, 1.0, sit);
        pitch = lerp(1.15, -0.04, sit); yaw = lerp(0.3, Math.PI + 0.35, turn) + noise1(t * 0.3) * 0.03; roll = lerp(0.25, 0, sit);
      } else if (m === "walk") {
        const dur = 18, u = clamp(k / dur), e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
        const p = walk.getPoint(lerp(0, 1, e * 0.98 + u * 0.02));
        const stride = k * 5.2;
        px = p.x; pz = p.z; py = hillH(px, pz) + 1.62 + Math.abs(Math.sin(stride)) * 0.05 * (1 - smooth(0.9, 1, u));
        if (pz < 3.4) py = Math.max(py, pavilion.position.y + 0.4 + 1.62);
        const tan = walk.getTangent(Math.min(0.999, e));
        yaw = damp(cam.yaw, Math.atan2(-tan.x, -tan.z), 2, dt) + Math.sin(stride * 0.5) * 0.01;
        if (k < 1.5) yaw = lerp(Math.PI + 0.35, yaw, smooth(0, 1.5, k));
        pitch = lerp(0.14, -0.06, smooth(0.6, 1, u)); roll = Math.sin(stride * 0.5) * 0.008;
      } else if (m === "vista" || m === "orbit") {
        const kk = m === "orbit" ? k + 30 : k;
        px = 0; pz = lerp(-1.6, -2.6, smooth(0, 30, kk)); py = pavilion.position.y + 0.4 + 1.62;
        const sweep = S.portrait ? 0.48 : 0.22;
        yaw = Math.sin(kk * 0.07) * sweep * smooth(3, 10, kk); pitch = -0.12 + Math.sin(kk * 0.05) * 0.015; roll = 0;
      }
      S.focus = damp(S.focus, S.focusT, 1.1, dt);
      if (m === "vista") { yaw = lerp(yaw, 0.08, S.focus); pitch = lerp(pitch, -0.36, S.focus); }
      cam.pos.set(px, py, pz); cam.yaw = yaw; cam.pitch = pitch; cam.roll = roll;
      const ly = m === "walk" ? 0.25 : 1;
      camera.position.copy(cam.pos);
      camera.rotation.set(pitch + api.look.upitch * ly, yaw + api.look.uyaw * ly, roll);
      api.look.uyaw *= Math.exp(-dt * 0.25); api.look.upitch *= Math.exp(-dt * 0.25);

      sky.position.copy(camera.position);
      ocean.mesh.position.set(Math.round(camera.position.x / 4) * 4, 0, Math.round(camera.position.z / 4) * 4);
      rain.U.uTime.value = t; rain.U.uCenter.value.copy(camera.position); rain.U.uFlash.value = fl;
      rain.mesh.visible = S.light < 0.98;
      bolt.mesh.visible = bolt.mesh.visible && S.light < 0.5;
      beacon.visible = Math.sin(t * 2.2) > 0.55;
      for (const g of gulls) {
        const u = g.userData; u.a += u.sp * dt;
        g.position.set(u.cx + Math.cos(u.a) * u.rad, u.y + Math.sin(u.a * 2) * 2, u.cz + Math.sin(u.a) * u.rad);
        g.rotation.y = -u.a;
        const f = Math.sin(t * 7 + u.rad) * 0.5;
        u.l.rotation.z = f; u.r.rotation.z = -f;
        g.visible = S.light > 0.5;
      }
    },
    dispose() { disposeTree(scene); },
  };
  applyLight(0, 0);
  return api;
}
