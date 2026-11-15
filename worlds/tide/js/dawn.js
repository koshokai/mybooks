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
      varying vec3 vW; varying vec3 vN; varying vec3 vC; varying vec3 vO;
      void main(){
        mat4 m = modelMatrix;
        #ifdef USE_INSTANCING
          m = m * instanceMatrix;
        #endif
        vec4 w = m * vec4(position, 1.0);
        vW = w.xyz; vN = normalize(mat3(m) * normal); vO = (m * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        vC = vec3(1.0);
        #ifdef USE_INSTANCING_COLOR
          vC = instanceColor;
        #endif
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uSunDir, uSunCol, uSky, uGround, uFogCol, uFogWarm; uniform float uFogD, uNight, uFlash, uTime, uPlain;
      varying vec3 vW; varying vec3 vN; varying vec3 vC; varying vec3 vO;
      ${GLSL_NOISE}
      void main(){
        vec3 n = normalize(vN);
        float side = (1.0 - step(0.6, abs(n.y))) * (1.0 - uPlain);
        float roof = step(0.6, n.y);
        float seed = hash12(floor(vO.xz * 0.37) + 0.5);
        float u = abs(n.x) > 0.5 ? vW.z : vW.x;
        float fh = 2.9 + seed * 0.5, ww = 2.1 + fract(seed * 7.13) * 1.3;
        vec2 cell = vec2(u / ww, vW.y / fh);
        vec2 fc = fract(cell), ic = floor(cell);
        float rnd = hash12(ic + floor(vO.xz));
        // 墙面：底色 + 大块污渍 + 雨水冲刷的竖向流痕
        vec3 base = vC;
        base *= 0.78 + 0.32 * fbm3(vec2(u * 0.35, vW.y * 0.35) + seed * 9.0);
        float streak = fbm3(vec2(u * 2.2, vW.y * 0.09 + seed * 13.0));
        base *= 1.0 - 0.32 * smoothstep(0.5, 0.78, streak) * side;
        // 窗：窗框 + 玻璃 + 中梃；部分破碎、部分挂着褪色窗帘
        float wx0 = 0.2, wx1 = 0.8, wy0 = 0.3, wy1 = 0.84;
        float inWin = step(wx0, fc.x) * step(fc.x, wx1) * step(wy0, fc.y) * step(fc.y, wy1);
        float inFrame = step(wx0 - 0.045, fc.x) * step(fc.x, wx1 + 0.045) * step(wy0 - 0.05, fc.y) * step(fc.y, wy1 + 0.05) - inWin;
        float mull = inWin * (1.0 - step(0.025, abs(fc.x - 0.5)));
        vec3 glass = mix(vec3(0.025, 0.035, 0.045), uSky * 0.55 + uSunCol * 0.08, 0.25 + 0.55 * fc.y * (0.4 + rnd));
        glass = mix(glass, vec3(0.008, 0.008, 0.01), step(rnd, 0.17));
        glass = mix(glass, vec3(0.55, 0.42, 0.3) * (0.4 + 0.3 * fc.x), step(0.17, rnd) * step(rnd, 0.27));
        vec3 col = base;
        col = mix(col, mix(vec3(0.62, 0.62, 0.6), vec3(0.32, 0.22, 0.16), step(0.5, seed)), inFrame * side * 0.85);
        col = mix(col, glass, inWin * side * (1.0 - mull));
        // 阳台檐 / 楼层线
        float ledge = step(0.55, seed) * side;
        col = mix(col, base * 1.15 + 0.04, ledge * step(fc.y, 0.07));
        col *= 1.0 - ledge * 0.45 * step(0.07, fc.y) * step(fc.y, 0.16);
        // 屋顶：沥青、积水、锈斑
        float rf = fbm3(vW.xz * 0.6);
        col = mix(col, vec3(0.2, 0.19, 0.18) * (0.7 + 0.6 * rf) + base * 0.15, roof * (1.0 - uPlain));
        col = mix(col, vec3(0.36, 0.2, 0.12), roof * smoothstep(0.62, 0.78, rf) * 0.6);
        // 水线：深色浸泡带 + 贴着水面的青苔
        float wl = 1.0 - smoothstep(0.1, 1.5 + streak * 1.2, vW.y);
        col = mix(col, col * vec3(0.3, 0.33, 0.28), wl);
        float moss = (1.0 - smoothstep(0.0, 0.9, abs(vW.y - 0.3))) * smoothstep(0.35, 0.7, fbm3(vec2(u * 0.9, vW.y * 2.0)));
        col = mix(col, vec3(0.13, 0.19, 0.08), moss * 0.75);
        // 光照
        float dif = max(dot(n, uSunDir), 0.0);
        vec3 hemi = mix(uGround, uSky, n.y * 0.5 + 0.5);
        vec3 lit = col * (hemi + uSunCol * dif * 1.35);
        vec3 v = normalize(cameraPosition - vW);
        vec3 r = reflect(-v, n);
        float sp = max(dot(r, uSunDir), 0.0); sp *= sp; sp *= sp; sp *= sp; sp *= sp;
        lit += uSunCol * sp * inWin * side * (1.0 - step(rnd, 0.17)) * 1.4;
        lit = mix(lit, col * 0.05 + uFlash * col * 0.6, uNight);
        // 空气透视：逆光方向的雾偏暖，侧面偏冷；贴近水面更浓
        float dist = length(vW - cameraPosition);
        float d = dist * uFogD;
        float f = 1.0 - exp(-d * d);
        f = clamp(f + (1.0 - smoothstep(0.0, 9.0, vW.y)) * 0.18 * smoothstep(40.0, 220.0, dist), 0.0, 1.0);
        float sa = max(dot(-v, uSunDir), 0.0); sa *= sa;
        vec3 fogc = mix(uFogCol * vec3(0.78, 0.86, 1.0), uFogWarm, sa) + uFlash * 0.2 * uNight;
        gl_FragColor = vec4(mix(lit, fogc, f), 1.0);
      }`,
  });
}

function weather(g, w, h, k = 1) {
  for (let i = 0; i < 26 * k; i++) { // 锈水流痕
    const x = Math.random() * w, y0 = Math.random() * h * 0.5, len = h * (0.2 + Math.random() * 0.6);
    const gr = g.createLinearGradient(0, y0, 0, y0 + len); gr.addColorStop(0, "rgba(110,60,30,0.45)"); gr.addColorStop(1, "rgba(110,60,30,0)");
    g.fillStyle = gr; g.fillRect(x, y0, 1.5 + Math.random() * 4, len);
  }
  for (let i = 0; i < 900 * k; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? "40,35,30" : "230,225,210"},${Math.random() * 0.12})`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
  for (let i = 0; i < 18 * k; i++) { g.strokeStyle = `rgba(240,240,235,${0.1 + Math.random() * 0.25})`; g.lineWidth = 1; g.beginPath(); const x = Math.random() * w, y = Math.random() * h; g.moveTo(x, y); g.lineTo(x + (Math.random() - 0.5) * 60, y + (Math.random() - 0.5) * 14); g.stroke(); }
  const gr = g.createLinearGradient(0, h * 0.65, 0, h); gr.addColorStop(0, "rgba(50,70,45,0)"); gr.addColorStop(1, "rgba(50,70,45,0.55)");
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  g.fillStyle = "rgba(255,240,210,0.08)"; g.fillRect(0, 0, w, h); // 褪色
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
    uFogCol: { value: new THREE.Color() }, uFogWarm: { value: new THREE.Color() }, uFogD: { value: 0.0022 }, uNight: { value: 0 }, uFlash: { value: 0 }, uTime: { value: 0 }, uPlain: { value: 0 },
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
      if (y < 0.25) c.setRGB(0.52, 0.43, 0.33);
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
    const pal = [[0.6, 0.56, 0.5], [0.5, 0.53, 0.56], [0.68, 0.58, 0.46], [0.42, 0.47, 0.52], [0.62, 0.46, 0.42], [0.66, 0.64, 0.6], [0.43, 0.46, 0.4], [0.52, 0.58, 0.58], [0.58, 0.36, 0.3], [0.72, 0.62, 0.55], [0.5, 0.44, 0.38]];
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
    // 屋顶上的水箱、楼梯间、天线；立面上的空调外机与阳台
    const tanks = [], huts = [], ants = [], acs = [], balc = [];
    const facadeAt = (b, lx, ly, out) => { const c = Math.cos(b.ry), sn = Math.sin(b.ry); const lz = b.d / 2 + out; return [b.x + lx * c + lz * sn, ly, b.z - lx * sn + lz * c]; };
    for (const b of buildings) {
      if (R() < 0.4) tanks.push([b.x + (R() - 0.5) * b.w * 0.5, b.h, b.z + (R() - 0.5) * b.d * 0.5, 0.8 + R() * 0.6]);
      if (R() < 0.45) huts.push([b.x + (R() - 0.5) * b.w * 0.4, b.h, b.z + (R() - 0.5) * b.d * 0.4, 2 + R() * 1.5]);
      if (R() < 0.3) ants.push([b.x + (R() - 0.5) * b.w * 0.6, b.h, b.z + (R() - 0.5) * b.d * 0.6, 2.5 + R() * 4]);
      const near = Math.hypot(b.x, b.z) < 190;
      if (near && b.h > 2) {
        const floors = Math.floor(b.h / 3);
        for (let f = 1; f < floors && acs.length < 900; f++) if (R() < 0.55) acs.push([...facadeAt(b, (R() - 0.5) * b.w * 0.8, f * 3 + 1.0, 0.22), b.ry]);
        if (R() < 0.4) for (let f = 1; f < floors && balc.length < 700; f++) for (let x = -b.w / 2 + 1.6; x < b.w / 2 - 1.2; x += 3.2) balc.push([...facadeAt(b, x, f * 3 + 0.55, 0.45), b.ry]);
      }
    }
    const rust = [[0.42, 0.28, 0.2], [0.55, 0.58, 0.6], [0.36, 0.38, 0.38], [0.5, 0.33, 0.22]];
    const tg = new THREE.CylinderGeometry(1, 1, 1, 12);
    const ti = new THREE.InstancedMesh(tg, cityM, tanks.length);
    tanks.forEach(([x, y, z, r], i) => { m4.compose(new THREE.Vector3(x, y + 1.6, z), q.identity(), new THREE.Vector3(r, 1.8, r)); ti.setMatrixAt(i, m4); const p = rust[i % 4]; ti.setColorAt(i, c.setRGB(p[0], p[1], p[2])); });
    ti.frustumCulled = false; scene.add(ti);
    const hi = new THREE.InstancedMesh(box, cityM, huts.length);
    huts.forEach(([x, y, z, s], i) => { m4.compose(new THREE.Vector3(x, y + 1.1, z), q.identity(), new THREE.Vector3(s, 2.2, s * 1.2)); hi.setMatrixAt(i, m4); hi.setColorAt(i, c.setRGB(0.55, 0.53, 0.5)); });
    hi.frustumCulled = false; scene.add(hi);
    const plainM = cityMaterial({ ...CU, uPlain: { value: 1 } });
    const ai = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.05, 0.08, 1, 5), plainM, ants.length);
    ants.forEach(([x, y, z, hh], i) => { m4.compose(new THREE.Vector3(x, y + hh / 2, z), q.setFromEuler(e.set((R() - 0.5) * 0.15, 0, (R() - 0.5) * 0.15)), new THREE.Vector3(1, hh, 1)); ai.setMatrixAt(i, m4); ai.setColorAt(i, c.setRGB(0.3, 0.3, 0.3)); });
    ai.frustumCulled = false; scene.add(ai);
    const aci = new THREE.InstancedMesh(new THREE.BoxGeometry(0.9, 0.6, 0.42), plainM, Math.max(1, acs.length));
    acs.forEach(([x, y, z, ry], i) => { m4.compose(new THREE.Vector3(x, y, z), q.setFromEuler(e.set(0, ry, 0)), new THREE.Vector3(1, 1, 1)); aci.setMatrixAt(i, m4); const g = 0.6 + R() * 0.25; aci.setColorAt(i, c.setRGB(g, g * 0.97, g * 0.92)); });
    aci.count = acs.length; aci.frustumCulled = false; scene.add(aci);
    const bi = new THREE.InstancedMesh(new THREE.BoxGeometry(2.4, 1.0, 0.9), plainM, Math.max(1, balc.length));
    balc.forEach(([x, y, z, ry], i) => { m4.compose(new THREE.Vector3(x, y, z), q.setFromEuler(e.set(0, ry, 0)), new THREE.Vector3(1, 1, 1)); bi.setMatrixAt(i, m4); const g = 0.32 + R() * 0.22; bi.setColorAt(i, c.setRGB(g, g * 0.95, g * 0.9)); });
    bi.count = balc.length; bi.frustumCulled = false; scene.add(bi);
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
      weather(g, w, h, 1.3);
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
      weather(g, w, h, 0.8);
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
      g.clearRect(w * 0.8, h * 0.1, 70, 60); g.fillStyle = "rgba(40,30,25,0.9)"; g.fillRect(w * 0.8, h * 0.1, 70, 60); // 破了一块
      weather(g, w, h, 1.6);
    }), roughness: 0.7, side: THREE.DoubleSide }));
    g4.position.set(-24, 6 + 4.8, -46); g4.rotation.y = 0.25; scene.add(g4);
    const legs = new THREE.Mesh(new THREE.BoxGeometry(7, 3.2, 0.3), iron); legs.position.set(-24, 6 + 1.6, -46.3); legs.rotation.y = 0.25; scene.add(legs);
  }
  // 低空薄雾层（远处更浓，营造空气透视）
  const mists = [];
  {
    for (const [y, a, sc] of [[1.6, 0.32, 0.006], [4.5, 0.22, 0.004], [9, 0.12, 0.003]]) {
      const mu = { uTime: CU.uTime, uCol: CU.uFogCol, uWarm: CU.uFogWarm, uSun: CU.uSunDir, uA: { value: a }, uS: { value: sc }, uK: { value: 1 } };
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1800, 1800).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({
        uniforms: mu, transparent: true, depthWrite: false, fog: false,
        vertexShader: "varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }",
        fragmentShader: `uniform float uTime, uA, uS, uK; uniform vec3 uCol, uWarm, uSun; varying vec3 vW;
          ${GLSL_NOISE}
          void main(){ float d = length(vW.xz - cameraPosition.xz);
            float n = fbm3(vW.xz * uS + vec2(uTime * 0.004, uTime * 0.002));
            float a = uA * uK * smoothstep(45.0, 260.0, d) * smoothstep(0.3, 0.75, n) * (1.0 - smoothstep(900.0, 1200.0, d));
            vec3 v = normalize(vW - cameraPosition); float sa = max(dot(v, uSun), 0.0); sa *= sa;
            gl_FragColor = vec4(mix(uCol, uWarm, sa) * 1.05, a); }`,
      }));
      m.position.y = y; m.renderOrder = 5; m.frustumCulled = false; scene.add(m); mists.push(m);
    }
  }
  // 平静水面上漂着的杂物
  const floaters = [];
  {
    const R2 = rng(77);
    const mats = [new THREE.MeshStandardMaterial({ color: 0x7a5a3a, roughness: 0.9 }), new THREE.MeshStandardMaterial({ color: 0x9a8a70, roughness: 0.8 }), new THREE.MeshStandardMaterial({ color: 0x3f6e8a, roughness: 0.5 }), new THREE.MeshStandardMaterial({ color: 0xd8d4c8, roughness: 0.4 })];
    const geos = [new THREE.BoxGeometry(2.2, 0.1, 0.3), new THREE.BoxGeometry(0.7, 0.5, 0.6), new THREE.CylinderGeometry(0.1, 0.1, 0.35, 8).rotateZ(Math.PI / 2), new THREE.BoxGeometry(1.2, 0.08, 0.8)];
    for (let i = 0; i < 46; i++) {
      const a = R2() * Math.PI * 2, r = 32 + R2() * 70;
      const x = Math.cos(a) * r, z = Math.sin(a) * r - 10;
      const k = Math.floor(R2() * 4);
      const mm = new THREE.Mesh(geos[k], mats[k]); mm.rotation.y = R2() * 6; scene.add(mm);
      floaters.push({ m: mm, x, z, off: k === 1 ? -0.15 : 0.0, ph: R2() * 6 });
    }
  }
  // 水面倒影（平面反射，低端设备 / 夜里关闭）
  const reflRT = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType });
  ocean.U.tRefl.value = reflRT.texture;
  const vcam = new THREE.PerspectiveCamera();
  const _p = new THREE.Vector3(), _l = new THREE.Vector3(), _t = new THREE.Vector3(), _u = new THREE.Vector3(), _rot = new THREE.Matrix4();
  const _plane = new THREE.Plane(), _clip = new THREE.Vector4(), _q = new THREE.Vector4();
  const reflScale = lowEnd ? 0.33 : 0.5;
  function renderReflection(renderer, level) {
    const on = S.light > 0.5 && level < 6;
    ocean.U.uRefl.value = on ? 0.9 : 0;
    if (!on) return;
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const w = Math.max(64, Math.round(size.x * reflScale)), h = Math.max(64, Math.round(size.y * reflScale));
    if (reflRT.width !== w || reflRT.height !== h) reflRT.setSize(w, h);
    camera.updateMatrixWorld();
    _p.setFromMatrixPosition(camera.matrixWorld);
    if (_p.y < 0.2) { ocean.U.uRefl.value = 0; return; }
    _rot.extractRotation(camera.matrixWorld);
    _l.set(0, 0, -1).applyMatrix4(_rot).add(_p);
    vcam.position.set(_p.x, -_p.y, _p.z);
    _t.set(_l.x, -_l.y, _l.z);
    _u.set(0, 1, 0).applyMatrix4(_rot); _u.y = -_u.y;
    vcam.up.copy(_u); vcam.lookAt(_t);
    vcam.near = camera.near; vcam.far = camera.far; vcam.updateMatrixWorld();
    vcam.projectionMatrix.copy(camera.projectionMatrix);
    ocean.U.uReflMat.value.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1).multiply(vcam.projectionMatrix).multiply(vcam.matrixWorldInverse);
    _plane.setFromNormalAndCoplanarPoint(_u.set(0, 1, 0), _t.set(0, 0, 0)).applyMatrix4(vcam.matrixWorldInverse);
    _clip.set(_plane.normal.x, _plane.normal.y, _plane.normal.z, _plane.constant);
    const e = vcam.projectionMatrix.elements;
    _q.set((Math.sign(_clip.x) + e[8]) / e[0], (Math.sign(_clip.y) + e[9]) / e[5], -1, (1 + e[10]) / e[14]);
    _clip.multiplyScalar(2 / _clip.dot(_q));
    e[2] = _clip.x; e[6] = _clip.y; e[10] = _clip.z + 1 - 0.003; e[14] = _clip.w;
    vcam.projectionMatrixInverse.copy(vcam.projectionMatrix).invert();
    const vis = [ocean.mesh.visible, rain.mesh.visible, bolt.mesh.visible];
    ocean.mesh.visible = rain.mesh.visible = bolt.mesh.visible = false;
    for (const m of mists) m.visible = false;
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(reflRT); renderer.clear(); renderer.render(scene, vcam); renderer.setRenderTarget(prev);
    [ocean.mesh.visible, rain.mesh.visible, bolt.mesh.visible] = vis;
    for (const m of mists) m.visible = true;
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
    CU.uFogCol.value.copy(O.uFogCol.value); CU.uFogWarm.value.setRGB(lerp(0.03, 1.15, k), lerp(0.036, 0.78, k), lerp(0.045, 0.5, k)); O.uFogWarm.value.copy(CU.uFogWarm.value); CU.uFogD.value = scene.fog.density; CU.uNight.value = 1 - k; CU.uFlash.value = flash;
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
    preRender: (r, level) => renderReflection(r, level),
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
      for (const f of floaters) { waveAt(f.x, f.z, t, ocean.U.uAmp.value, tmp); f.m.position.set(f.x, tmp.h + f.off + Math.sin(t * 0.7 + f.ph) * 0.03, f.z); f.m.rotation.x = tmp.gz * 0.4; f.m.rotation.z = -tmp.gx * 0.4; }
      for (const m of mists) m.material.uniforms.uK.value = S.light;
      for (const g of gulls) {
        const u = g.userData; u.a += u.sp * dt;
        g.position.set(u.cx + Math.cos(u.a) * u.rad, u.y + Math.sin(u.a * 2) * 2, u.cz + Math.sin(u.a) * u.rad);
        g.rotation.y = -u.a;
        const f = Math.sin(t * 7 + u.rad) * 0.5;
        u.l.rotation.z = f; u.r.rotation.z = -f;
        g.visible = S.light > 0.5;
      }
    },
    dispose() { reflRT.dispose(); disposeTree(scene); },
  };
  applyLight(0, 0);
  return api;
}
