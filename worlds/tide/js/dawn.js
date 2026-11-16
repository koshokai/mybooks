// 沉没之后 · 序章：上岸、黎明、沉没的城市（第六幕 + 结尾）
import * as THREE from "three";
import { clamp, lerp, damp, smooth, noise1, rng, canvasTex, FONT, GLSL_NOISE, disposeTree } from "./util.js";
import { skyUniforms, makeSky, makeOcean, makeRain, makeBolt, waveAt } from "./ocean.js";
import { makeSuitcase, upgradeSuitcase, ROOFTOP, CITY_LANDMARKS } from "./sea.js";
import { loadTex, loadPBR, loadHDR, modelInstance, envFromHDR, tier } from "./assets.js";


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
      uniform vec3 uSunDir, uSunCol, uSky, uGround, uFogCol, uFogWarm; uniform float uFogD, uNight, uFlash, uTime, uPlain, uTex, uSkyMix, uSkyRot;
      uniform sampler2D tFacA, tFacAN, tFacB, tFacBN, tPla, tPlaN, tRoof, tSky;
      vec3 photoSky(vec3 d){
        float u = atan(d.z, d.x + 1e-5) * 0.1591549 + 0.5 + uSkyRot * 0.1591549;
        float v = asin(clamp(max(d.y, 0.004), -1.0, 1.0)) * 0.3183099 + 0.5;
        return texture2D(tSky, vec2(fract(u), v)).rgb;
      }
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
        base *= 0.85 + 0.2 * fbm3(vec2(u * 0.35, vW.y * 0.35) + seed * 9.0);
        // 真实的外墙材质（瓷砖 / 混凝土面砖 / 抹灰），按楼随机选一种，并用法线贴图扰动
        vec2 fuv = vec2(u, vW.y) / 3.2;
        vec3 nm = vec3(0.0, 0.0, 1.0);
        if (uTex > 0.5 && side > 0.5) {
          vec3 tx; vec3 tn;
          if (seed < 0.4) { tx = texture2D(tFacA, fuv).rgb; tn = texture2D(tFacAN, fuv).xyz; }
          else if (seed < 0.72) { tx = texture2D(tFacB, fuv * 0.8).rgb; tn = texture2D(tFacBN, fuv * 0.8).xyz; }
          else { tx = texture2D(tPla, fuv * 0.6).rgb; tn = texture2D(tPlaN, fuv * 0.6).xyz; }
          base = mix(base, tx * (vC * 1.25 + 0.15), 0.85);
          nm = tn * 2.0 - 1.0;
        }
        float streak = fbm3(vec2(u * 2.2, vW.y * 0.09 + seed * 13.0));
        // 窗：窗框 + 玻璃 + 中梃；部分破碎、部分挂着褪色窗帘
        float wx0 = 0.2, wx1 = 0.8, wy0 = 0.3, wy1 = 0.84;
        float inWin = step(wx0, fc.x) * step(fc.x, wx1) * step(wy0, fc.y) * step(fc.y, wy1);
        float inFrame = step(wx0 - 0.045, fc.x) * step(fc.x, wx1 + 0.045) * step(wy0 - 0.05, fc.y) * step(fc.y, wy1 + 0.05) - inWin;
        float mull = inWin * (1.0 - step(0.025, abs(fc.x - 0.5)));
        vec3 vv = normalize(cameraPosition - vW);
        vec3 glass = mix(vec3(0.025, 0.035, 0.045), uSky * 0.55 + uSunCol * 0.08, 0.25 + 0.55 * fc.y * (0.4 + rnd));
        if (uSkyMix > 0.01) { vec3 rr = reflect(-vv, n); rr.y = abs(rr.y); glass = mix(glass, vec3(0.02, 0.025, 0.03) + photoSky(rr) * (0.18 + 0.25 * rnd), uSkyMix * 0.85); }
        glass = mix(glass, vec3(0.008, 0.008, 0.01), step(rnd, 0.04));
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
        vec3 roofc = vec3(0.2, 0.19, 0.18) * (0.7 + 0.6 * rf) + base * 0.15;
        if (uTex > 0.5) roofc = mix(roofc, texture2D(tRoof, vW.xz / 4.0).rgb * 0.85, 0.8);
        col = mix(col, roofc, roof * (1.0 - uPlain));
        col = mix(col, col * vec3(0.7, 0.72, 0.75), roof * smoothstep(0.55, 0.8, rf) * 0.5 * (1.0 - uPlain)); // 昨夜的积水
        // 水线：刚被泥水泡过的一圈湿痕（不是常年的苔藓）
        float wl = 1.0 - smoothstep(0.05, 0.55 + streak * 0.4, vW.y);
        col = mix(col, col * vec3(0.45, 0.42, 0.34), wl);
        // 光照
        if (side > 0.5 && inWin < 0.5) {
          vec3 T = abs(n.x) > 0.5 ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0);
          n = normalize(T * nm.x * 0.7 + vec3(0.0, 1.0, 0.0) * nm.y * 0.7 + n * max(nm.z, 0.2));
        }
        float dif = max(dot(n, uSunDir), 0.0);
        vec3 hemi = mix(uGround, uSky, n.y * 0.5 + 0.5);
        vec3 lit = col * (hemi + uSunCol * dif * 1.35);
        vec3 v = normalize(cameraPosition - vW);
        vec3 r = reflect(-v, n);
        float sp = max(dot(r, uSunDir), 0.0); sp *= sp; sp *= sp; sp *= sp; sp *= sp;
        lit += uSunCol * sp * inWin * side * (1.0 - step(rnd, 0.17)) * 1.4;
        // 少数窗户还亮着应急灯
        float emer = inWin * side * step(0.975, rnd) * step(0.4, vW.y);
        lit += vec3(1.5, 1.0, 0.55) * emer * (0.6 + 0.4 * sin(uTime * 1.3 + rnd * 40.0));
        lit = mix(lit, col * 0.09 + uFlash * col * 0.6 + vec3(1.2, 0.8, 0.4) * emer, uNight);
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
  let roofLamp = null, trafficY = null;

  const SU = skyUniforms();
  const sky = makeSky(SU); scene.add(sky);
  const ocean = makeOcean(SU, { N: lowEnd ? 160 : 210, R: 900 }); scene.add(ocean.mesh);
  const rain = makeRain(lowEnd ? 700 : 1200); scene.add(rain.mesh);
  const bolt = makeBolt(); scene.add(bolt.mesh);

  const hemi = new THREE.HemisphereLight(0xbcd2ff, 0x5a4636, 0.9); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffd6a8, 2.2); scene.add(sun); scene.add(sun.target);
  sun.castShadow = !tier.low;
  sun.shadow.mapSize.set(tier.mid ? 1024 : 2048, tier.mid ? 1024 : 2048);
  Object.assign(sun.shadow.camera, { left: -13, right: 13, top: 13, bottom: -13, near: 1, far: 120 });
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
  let envTex = null;
  const flashL = new THREE.DirectionalLight(0xc8d4ff, 0); flashL.position.set(0, 50, -80); scene.add(flashL);

  const CU = {
    uSunDir: { value: new THREE.Vector3() }, uSunCol: { value: new THREE.Color() }, uSky: { value: new THREE.Color() }, uGround: { value: new THREE.Color() },
    uFogCol: { value: new THREE.Color() }, uFogWarm: { value: new THREE.Color() }, uFogD: { value: 0.0022 }, uNight: { value: 0 }, uFlash: { value: 0 }, uTime: { value: 0 }, uPlain: { value: 0 }, uTex: { value: 0 },
    tFacA: { value: null }, tFacAN: { value: null }, tFacB: { value: null }, tFacBN: { value: null }, tPla: { value: null }, tPlaN: { value: null }, tRoof: { value: null },
  };
  CU.tSky = SU.tSky; CU.uSkyMix = SU.uSkyMix; CU.uSkyRot = SU.uSkyRot;
  const cityM = cityMaterial(CU);

  // ---------- 我们爬上来的这栋楼：只剩最上面两层露出水面 ----------
  const RT = ROOFTOP, RY = RT.h;
  const roofG = new THREE.Group(); scene.add(roofG);
  {
    const wall = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), cityM, 2);
    const m4 = new THREE.Matrix4();
    m4.compose(new THREE.Vector3(0, (RY - 12) / 2, 0), new THREE.Quaternion(), new THREE.Vector3(RT.w, RY + 12, RT.d)); wall.setMatrixAt(0, m4); wall.setColorAt(0, new THREE.Color(0.62, 0.58, 0.52));
    m4.compose(new THREE.Vector3(-3, RY + 1.2, -2), new THREE.Quaternion(), new THREE.Vector3(3.2, 2.4, 2.6)); wall.setMatrixAt(1, m4); wall.setColorAt(1, new THREE.Color(0.58, 0.56, 0.52));
    wall.frustumCulled = false; roofG.add(wall);
    // 碎石屋面 + 积水
    const gravel = canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = "#5e5a55"; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 5000; i++) { const v = 60 + Math.random() * 90; g.fillStyle = `rgb(${v},${v * 0.97},${v * 0.92})`; g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2.5, 1 + Math.random() * 2.5); }
    }, { repeat: true });
    gravel.repeat.set(5, 4);
    const topM = new THREE.MeshStandardMaterial({ map: gravel, roughness: 0.95 });
    const top = new THREE.Mesh(new THREE.PlaneGeometry(RT.w - 0.5, RT.d - 0.5).rotateX(-Math.PI / 2), topM);
    top.receiveShadow = true;
    loadPBR("tarred_gravel", [3.5, 3]).then((t) => { if (t.map) { Object.assign(topM, t); topM.color.set(0xb8b2aa); topM.roughness = 1; topM.needsUpdate = true; } });
    top.position.y = RY + 0.02; roofG.add(top);
    const pudM = new THREE.MeshStandardMaterial({ color: 0x050607, roughness: 0.18, metalness: 0.0, envMapIntensity: 0.35, transparent: true, opacity: 0.85 });
    for (const [x, z, r] of [[1.0, 0.6, 0.7], [-2.2, 3.6, 0.5], [3.8, -4.4, 0.45], [-5, -3.8, 0.6]]) { const pd = new THREE.Mesh(new THREE.CircleGeometry(r, 20).rotateX(-Math.PI / 2), pudM); pd.scale.set(1.4, 1, 0.8); pd.position.set(x, RY + 0.035, z); roofG.add(pd); }
    // 女儿墙（在消防梯那里留个口）
    const parM = new THREE.MeshStandardMaterial({ color: 0x8c857b, roughness: 0.9 });
    loadPBR("concrete_wall_008", [2, 0.5]).then((t) => { if (t.map) { Object.assign(parM, t); parM.color.set(0xd8d2c8); parM.needsUpdate = true; } });
    const par = (x, z, w, d) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.7, d), parM); m.position.set(x, RY + 0.35, z); roofG.add(m); };
    par(-2.6, RT.d / 2, RT.w / 2 + 1.8, 0.25); par(5.0, RT.d / 2, 4.0, 0.25); par(0, -RT.d / 2, RT.w, 0.25); par(-RT.w / 2, 0, 0.25, RT.d); par(RT.w / 2, 0, 0.25, RT.d);
    // 生锈的消防梯
    const rustM = new THREE.MeshStandardMaterial({ color: 0x6a3a24, roughness: 0.6, metalness: 0.5 });
    loadPBR("rusty_metal_02", [0.3, 2]).then((t) => { if (t.map) { Object.assign(rustM, t); rustM.color.set(0xffffff); rustM.metalness = 0.6; rustM.needsUpdate = true; } });
    for (const x of [2.2, 2.8]) { const r = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 10, 6), rustM); r.position.set(x, RY - 3.6 + 0.8, RT.d / 2 + 0.25); roofG.add(r); const hk = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.03, 6, 10, Math.PI), rustM); hk.position.set(x, RY + 1.0, RT.d / 2 - 0.05); hk.rotation.y = Math.PI / 2; roofG.add(hk); }
    for (let y = -2; y < RY + 0.8; y += 0.32) { const r = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.6, 5), rustM); r.rotation.z = Math.PI / 2; r.position.set(2.5, y, RT.d / 2 + 0.25); roofG.add(r); }
    // 空调外机、水塔、航标灯杆、倒下的天线
    const acM = new THREE.MeshStandardMaterial({ color: 0xd8d6d0, roughness: 0.6 });
    for (const [x, z, ry] of [[-5.2, 1.0, 0], [-5.2, -0.4, 0], [0.5, -4.6, 1.57]]) {
      const ac = new THREE.Group(); const b = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.7, 0.45), acM); b.position.y = 0.35; ac.add(b);
      const fan = new THREE.Mesh(new THREE.CircleGeometry(0.25, 16), new THREE.MeshStandardMaterial({ color: 0x33363a })); fan.position.set(0.15, 0.37, 0.231); ac.add(fan);
      ac.position.set(x, RY, z); ac.rotation.y = ry; roofG.add(ac);
    }
    const tankM = new THREE.MeshStandardMaterial({ color: 0x9fb5c4, roughness: 0.5, metalness: 0.3 });
    for (const [x, z] of [[3.2, -3.2], [5.2, -3.2], [3.2, -1.2], [5.2, -1.2]]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.15, 2.2, 0.15), acM); l.position.set(x, RY + 1.1, z); roofG.add(l); }
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 2.2, 20), tankM); tank.position.set(4.2, RY + 3.3, -2.2); roofG.add(tank);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 7, 8), acM); mast.position.set(-4.5, RY + 3.5, 3.5); roofG.add(mast);
    roofLamp = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(8, 0.5, 0.25), toneMapped: false, fog: false }));
    roofLamp.position.set(-4.5, RY + 7.1, 3.5); roofG.add(roofLamp);
    const fallen = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 5.5, 6), acM); pole.rotation.z = Math.PI / 2; fallen.add(pole);
    const dish = new THREE.Mesh(new THREE.SphereGeometry(0.5, 14, 8, 0, Math.PI * 2, 0, 0.9), new THREE.MeshStandardMaterial({ color: 0xe6e4de, side: THREE.DoubleSide })); dish.position.set(2.6, 0.2, 0); dish.rotation.z = 1.2; fallen.add(dish);
    fallen.position.set(-1.0, RY + 0.12, -2.8); fallen.rotation.y = 0.5; fallen.rotation.x = 0.05; roofG.add(fallen);
    const door = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.9), new THREE.MeshStandardMaterial({ color: 0x3f4a52, roughness: 0.6 })); door.position.set(-3, RY + 0.95, -0.69); roofG.add(door);
  }
  const redL = new THREE.PointLight(0xff3020, 0, 26, 1.4); redL.position.set(-4.5, RY + 6.6, 3.5); scene.add(redL);
  roofG.traverse((o) => { if (o.isMesh && o !== roofLamp) { o.castShadow = true; o.receiveShadow = true; } });
  // 消防梯（Poly Haven 模型，作为楼体侧面的装饰）
  modelInstance("modular_fire_escape").then((m) => { if (!m) return; m.scale.setScalar(1.0); m.position.set(-3.6, RY - 5.6, RT.d / 2 + 0.85); m.rotation.y = Math.PI; roofG.add(m); });
  // 箱子：我把它拖上了楼顶
  const suit = makeSuitcase(); upgradeSuitcase(suit);
  suit.position.set(1.4, RY + 0.12, 3.9); suit.rotation.set(0, 2.6, 0); scene.add(suit);

  // ---------- 沉没的城市 ----------
  const buildings = [];
  {
    const avoid = (x, z) => Math.hypot(x, z) < 16 || CITY_LANDMARKS.some(([lx, lz, w, d]) => Math.abs(x - lx) < w / 2 + 9 && Math.abs(z - lz) < d / 2 + 9);
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
    // 夜里在闪电下看见的那几栋（与海上的剪影一致）
    for (const [x, z, w, d, h] of CITY_LANDMARKS) buildings.push({ x, z, w, d, h, ry: 0 });
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
  // 钟楼（停在 7:47——昨晚水漫进城、全城断电的那一刻）
  {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(7, 34, 7), concrete); body.position.y = 7; g.add(body);
    const face = textPlate(256, 256, (c, w, h) => {
      c.fillStyle = "#efe6d2"; c.beginPath(); c.arc(w / 2, h / 2, 120, 0, Math.PI * 2); c.fill();
      c.strokeStyle = "#2c2a26"; c.lineWidth = 8; c.stroke();
      for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; c.lineWidth = i % 3 ? 4 : 9; c.beginPath(); c.moveTo(w / 2 + Math.sin(a) * 92, h / 2 - Math.cos(a) * 92); c.lineTo(w / 2 + Math.sin(a) * 110, h / 2 - Math.cos(a) * 110); c.stroke(); }
      const hand = (a, len, wd) => { c.lineWidth = wd; c.lineCap = "round"; c.beginPath(); c.moveTo(w / 2, h / 2); c.lineTo(w / 2 + Math.sin(a) * len, h / 2 - Math.cos(a) * len); c.stroke(); };
      hand(((7 + 47 / 60) / 12) * Math.PI * 2, 58, 11); hand((47 / 60) * Math.PI * 2, 92, 7);
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
    pole.visible = arm.visible = false; g1.position.set(-6.2, 1.0, -18.86); scene.add(g1); // 钉在对面楼墙上的路牌
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
    g2.position.set(10, -0.6, -17); g2.rotation.set(-0.05, -0.2, 0.1); scene.add(g2);
    // 歪斜的红绿灯
    const g3 = new THREE.Group();
    const p3 = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 8, 8), iron); p3.position.y = 0; g3.add(p3);
    const hb = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.3, 0.4), new THREE.MeshStandardMaterial({ color: 0x222426 })); hb.position.y = 4.5; g3.add(hb);
    for (let i = 0; i < 3; i++) { const lm = i === 1 ? (trafficY = new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 2.6, 0.3), toneMapped: false })) : new THREE.MeshStandardMaterial({ color: [0x401010, 0x403510, 0x103a18][i] }); const l = new THREE.Mesh(new THREE.CircleGeometry(0.14, 12), lm); l.position.set(0, 4.9 - i * 0.4, 0.21); g3.add(l); }
    g3.position.set(6.5, -3.0, -14); g3.rotation.z = -0.22; g3.rotation.y = -0.3; scene.add(g3);
    // 屋顶广告牌
    const g4 = new THREE.Mesh(new THREE.PlaneGeometry(9, 3.4), new THREE.MeshStandardMaterial({ map: textPlate(512, 194, (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, "#c8452f"); gr.addColorStop(1, "#e2873a"); g.fillStyle = gr; g.fillRect(0, 0, w, h);
      g.fillStyle = "#fff7e6"; g.font = `900 92px ${FONT}`; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("海潮百货", w / 2, h / 2 - 10);
      g.font = `26px ${FONT}`; g.fillText("周年庆 · 全场五折起", w / 2, h - 28);
      g.fillStyle = "rgba(0,0,0,0.25)"; g.fillRect(w * 0.62, 0, 40, h);
    }), roughness: 0.7, side: THREE.DoubleSide }));
    g4.position.set(-19.5, 13 + 4.6, -5.8); g4.rotation.y = 1.3; scene.add(g4);
    const legs = new THREE.Mesh(new THREE.BoxGeometry(7, 3.2, 0.3), iron); legs.position.set(-19.8, 13 + 1.6, -5.9); legs.rotation.y = 1.3; scene.add(legs);
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
  // 昨夜才漫上来的洪水：漂着的车、垃圾桶、雨伞、雪糕筒、木板
  const floaters = [];
  {
    const R2 = rng(77);
    const add = (obj, x, z, off, spin = 0) => { scene.add(obj); floaters.push({ m: obj, x, z, off, ph: R2() * 6, yaw: R2() * 6, spin }); };
    const carCols = [0xc8ccd0, 0x2a3540, 0x8c1f1f, 0xe8e6e0, 0x304a6a, 0x1a1a1a];
    for (let i = 0; i < 7; i++) {
      const car = new THREE.Group(), cm = new THREE.MeshStandardMaterial({ color: carCols[i % 6], roughness: 0.35, metalness: 0.5 });
      const body = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.7, 4.2), cm); car.add(body);
      const cab = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.55, 2.2), new THREE.MeshStandardMaterial({ color: 0x1b2229, roughness: 0.1, metalness: 0.6 })); cab.position.set(0, 0.6, -0.2); car.add(cab);
      const roofP = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.06, 1.9), cm); roofP.position.set(0, 0.9, -0.2); car.add(roofP);
      const [x, z] = [[9, -12], [-11, -15], [16, 4], [-15, 9], [26, -18], [-30, -16], [4, 16]][i];
      add(car, x, z, -0.25, 0.01);
    }
    const binM = new THREE.MeshStandardMaterial({ color: 0x2f7a3e, roughness: 0.6 }), bin2 = new THREE.MeshStandardMaterial({ color: 0x3a5f9a, roughness: 0.6 });
    for (let i = 0; i < 9; i++) { const g = new THREE.Group(); const b = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.9, 0.7), i % 2 ? binM : bin2); g.add(b); const l = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.06, 0.74), i % 2 ? binM : bin2); l.position.y = 0.48; g.add(l); g.rotation.z = 1.4; const a = R2() * 6.28, r = 10 + R2() * 40; add(g, Math.cos(a) * r, Math.sin(a) * r - 10, 0.05, 0.05); }
    const umCols = [0xe0473c, 0xf2c14e, 0x3b82c4, 0x7a4fa0, 0x2fa37a];
    for (let i = 0; i < 8; i++) { const g = new THREE.Group(); const c = new THREE.Mesh(new THREE.ConeGeometry(0.8, 0.35, 8, 1, true), new THREE.MeshStandardMaterial({ color: umCols[i % 5], roughness: 0.6, side: THREE.DoubleSide })); c.rotation.x = Math.PI; g.add(c); const h = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.9, 5), new THREE.MeshStandardMaterial({ color: 0x222222 })); h.position.y = 0.3; g.add(h); const a = R2() * 6.28, r = 9 + R2() * 35; add(g, Math.cos(a) * r, Math.sin(a) * r - 8, 0.12, 0.2); }
    { const g = new THREE.Group(); const cn = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.7, 12), new THREE.MeshStandardMaterial({ color: 0xff6a1a, roughness: 0.5 })); g.add(cn); const st = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.16, 0.12, 12), new THREE.MeshStandardMaterial({ color: 0xf2f2f2 })); st.position.y = 0.02; g.add(st); g.rotation.z = 1.2; add(g, 3.5, -10, 0.05, 0.3); }
    const plankM = new THREE.MeshStandardMaterial({ color: 0x8a6a48, roughness: 0.9 });
    for (let i = 0; i < 14; i++) { const a = R2() * 6.28, r = 9 + R2() * 60; add(new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.1, 0.3), plankM), Math.cos(a) * r, Math.sin(a) * r - 10, 0.02, 0.03); }
    const bottleM = new THREE.MeshStandardMaterial({ color: 0xbfe0e8, roughness: 0.2, transparent: true, opacity: 0.7 });
    for (let i = 0; i < 18; i++) { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.3, 8).rotateZ(Math.PI / 2), bottleM); const a = R2() * 6.28, r = 8 + R2() * 30; add(m, Math.cos(a) * r, Math.sin(a) * r - 6, 0.0, 0.2); }
  }
  // 真实模型的漂浮物（加载到了再放进水里）
  {
    const R3 = rng(91);
    const spots = (n, r0, r1) => Array.from({ length: n }, () => { const a = R3() * 6.28, r = r0 + R3() * (r1 - r0); return [Math.cos(a) * r, Math.sin(a) * r - 8]; });
    const place = (id, n, scale, off, r0 = 9, r1 = 40, tilt = 0) => modelInstance(id).then((m0) => {
      if (!m0) return;
      for (const [x, z] of spots(n, r0, r1)) {
        const g = new THREE.Group(); const m = n > 1 ? m0.clone(true) : m0; m.scale.setScalar(scale); m.rotation.z = tilt; g.add(m); scene.add(g);
        floaters.push({ m: g, x, z, off, ph: R3() * 6, yaw: R3() * 6, spin: (R3() - 0.5) * 0.1 });
      }
    });
    place("covered_car", 3, 1, -0.75, 12, 34);
    place("plastic_crate_01", 5, 1.2, -0.05);
    place("plastic_jerrycan", 4, 1.2, -0.08);
    place("cardboard_box_01", 4, 1.3, -0.1);
    place("old_tyre", 3, 1.2, -0.04, 9, 40, Math.PI / 2);
    place("wooden_crate_01", 3, 1.1, -0.12);
    place("lifebuoy", 2, 1, -0.02, 9, 30, Math.PI / 2);
    place("metal_trash_can", 2, 1, -0.55, 9, 30);
    // 露出水面的路灯
    modelInstance("street_lamp_01").then((m0) => { if (!m0) return; for (const [x, z, ry] of [[-11, -14, 0], [13, -13.6, 0.2], [-24, -13, 0], [26, 9, 2]]) { const m = m0.clone(true); m.scale.setScalar(1.7); m.position.set(x, -3.2, z); m.rotation.y = ry; scene.add(m); } });
  }
  // 倒伏的电线杆与垂进水里的电线
  {
    const poleM = new THREE.MeshStandardMaterial({ color: 0x6b6258, roughness: 0.9 });
    const tops = [];
    for (const [x, z, tilt] of [[-16, -13, 0.12], [-4, -13.5, -0.35], [8, -13, 0.25], [20, -12.5, 0.05]]) {
      const g = new THREE.Group(); const p = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 9, 8), poleM); p.position.y = 0; g.add(p);
      const cr = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.12, 0.12), poleM); cr.position.y = 4.2; g.add(cr);
      g.position.set(x, 0, z); g.rotation.z = tilt; scene.add(g); g.updateMatrixWorld();
      tops.push([-0.7, 0.7].map((dx) => new THREE.Vector3(dx, 4.2, 0).applyMatrix4(g.matrixWorld)));
    }
    const pts = [];
    for (let i = 0; i < tops.length - 1; i++) for (let k = 0; k < 2; k++) {
      const A = tops[i][k], B = tops[i + 1][k], sag = i === 1 ? 6 : 1.6; let prev = A;
      for (let j = 1; j <= 12; j++) { const u = j / 12; const q = A.clone().lerp(B, u); q.y -= Math.sin(u * Math.PI) * sag; if (q.y < 0.02) q.y = 0.02; pts.push(prev.x, prev.y, prev.z, q.x, q.y, q.z); prev = q; }
    }
    const lg = new THREE.BufferGeometry(); lg.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    scene.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0x1a1a1a })));
  }
  // 对面楼顶上的一只小狗（活着，安全）
  const dog = new THREE.Group();
  {
    const fur = new THREE.MeshStandardMaterial({ color: 0xc89a5a, roughness: 0.9 }), dark = new THREE.MeshStandardMaterial({ color: 0x3a2a1a, roughness: 0.9 });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.5, 4, 10), fur); body.rotation.z = Math.PI / 2; body.position.y = 0.55; dog.add(body);
    const head = new THREE.Group(); head.position.set(0.48, 0.82, 0); dog.add(head);
    const hd = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 10), fur); head.add(hd);
    const snout = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.11, 0.13), fur); snout.position.set(0.17, -0.04, 0); head.add(snout);
    for (const z of [-0.09, 0.09]) { const e = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.14, 6), dark); e.position.set(-0.02, 0.17, z); head.add(e); }
    for (const [x, z] of [[0.28, 0.12], [0.28, -0.12], [-0.28, 0.12], [-0.28, -0.12]]) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.38, 6), fur); l.position.set(x, 0.2, z); dog.add(l); }
    const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.3, 6), fur); tail.position.set(-0.5, 0.75, 0); tail.rotation.z = 0.8; dog.add(tail);
    dog.userData = { head, tail };
    dog.scale.setScalar(1.3);
    dog.position.set(20, 4, -6); dog.rotation.y = 2.7; scene.add(dog);
  }
  // 水面倒影（平面反射，低端设备 / 夜里关闭）
  const reflRT = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType });
  ocean.U.tRefl.value = reflRT.texture;
  const vcam = new THREE.PerspectiveCamera();
  const _p = new THREE.Vector3(), _l = new THREE.Vector3(), _t = new THREE.Vector3(), _u = new THREE.Vector3(), _rot = new THREE.Matrix4();
  const _plane = new THREE.Plane(), _clip = new THREE.Vector4(), _q = new THREE.Vector4();
  const reflScale = lowEnd ? 0.33 : 0.5;
  function renderReflection(renderer, level) {
    sun.castShadow = !tier.low && level < 4 && S.light > 0.5;
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
      deep: [0.006, 0.014, 0.02], sc: [0.02, 0.05, 0.055], fog: [0.03, 0.036, 0.045], hemi: 0.34, sunI: 0, amp: 0.55, foam: 0.7, glint: 0, light: 0.1, night: 1, fogD: 0.004,
    },
    dawn: {
      zen: [0.17, 0.3, 0.56], hor: [1.0, 0.7, 0.48], sun: [1.6, 1.2, 0.85], cloud: 0.38, cl: [1.15, 0.86, 0.72], cd: [0.42, 0.42, 0.55],
      deep: [0.05, 0.05, 0.03], sc: [0.2, 0.17, 0.09], fog: [0.2, 0.3, 0.42], hemi: 0.55, sunI: 2.6, amp: 0.13, foam: 0.1, glint: 1, light: 0.9, night: 0, fogD: 0.0021,
    },
  };
  const L = { k: 0 }; // 0 = 夜，1 = 黎明
  // 太阳方向与 HDRI 里的太阳对齐（HDRI 绕竖轴转 SKY_ROT）
  const sunDir = new THREE.Vector3(0.288, 0.331, -0.899).normalize();
  const SKY_ROT = 0.902 - Math.atan2(sunDir.z, sunDir.x);
  SU.uSkyRot.value = SKY_ROT;
  let skyReady = 0;
  loadTex(tier.low ? "hdri/dawn_sky_1k.jpg" : tier.mid ? "hdri/dawn_sky_2k.jpg" : "hdri/dawn_sky_4k.jpg").then((t) => { if (!t) return; t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; SU.tSky.value = t; skyReady = 1; });
  loadHDR("dawn_1k.hdr").then((h) => { if (h) { envTex = envFromHDR(renderer, h, SKY_ROT, 1.0); h.dispose(); } });
  Promise.all([loadTex("tex/rectangular_facade_tiles_diff.jpg", { repeat: [1, 1] }), loadTex("tex/rectangular_facade_tiles_nor.jpg", { srgb: false, repeat: [1, 1] }),
    loadTex("tex/concrete_tile_facade_diff.jpg", { repeat: [1, 1] }), loadTex("tex/concrete_tile_facade_nor.jpg", { srgb: false, repeat: [1, 1] }),
    loadTex("tex/white_plaster_02_diff.jpg", { repeat: [1, 1] }), loadTex("tex/white_plaster_02_nor.jpg", { srgb: false, repeat: [1, 1] }),
    loadTex("tex/tarred_gravel_diff.jpg", { repeat: [1, 1] })]).then((a) => {
    if (a.some((x) => !x)) return;
    [CU.tFacA.value, CU.tFacAN.value, CU.tFacB.value, CU.tFacBN.value, CU.tPla.value, CU.tPlaN.value, CU.tRoof.value] = a;
    CU.uTex.value = 1;
  });
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
    sun.position.copy(sunDir).multiplyScalar(60).add(new THREE.Vector3(0, RY, 0)); sun.target.position.set(0, RY, 0);
    SU.uSkyMix.value = k * skyReady;
    scene.environment = k > 0.5 ? envTex : null;
    scene.fog.color.copy(O.uFogCol.value); scene.fog.density = lerp(A.fogD, B.fogD, k);
    CU.uSunDir.value.copy(sunDir); CU.uSunCol.value.copy(SU.uSunCol.value).multiplyScalar(0.8);
    CU.uSky.value.setRGB(lerp(0.05, 0.42, k), lerp(0.06, 0.48, k), lerp(0.08, 0.62, k)); CU.uGround.value.setRGB(lerp(0.02, 0.32, k), lerp(0.02, 0.27, k), lerp(0.02, 0.24, k));
    CU.uFogCol.value.copy(O.uFogCol.value); CU.uFogWarm.value.setRGB(lerp(0.03, 0.85, k), lerp(0.036, 0.66, k), lerp(0.045, 0.52, k)); O.uFogWarm.value.copy(CU.uFogWarm.value); CU.uFogD.value = scene.fog.density; CU.uNight.value = 1 - k; CU.uFlash.value = flash;
    flashL.intensity = flash * 2.5;
    rain.U.uOpacity.value = 0.4 * (1 - k);
  }

  // ---------- 相机 ----------
  const S = { focus: 0, focusT: 0, focusName: "sign", mode: "climb", t: 0, flash: 0, light: 0, lightT: 0, nextBolt: 1.2, portrait: false, climb: 0, climbT: 0, over: 0, overT: 0 };
  const FOCUS = { sign: [0.3, -0.29], clock: [0.64, 0.2], dog: [-1.5, -0.14], tower: [-0.33, 0.28] };
  let time = 0;
  const cam = { pos: new THREE.Vector3(2.5, 0.8, 9), yaw: 0, pitch: 0, roll: 0 };
  const tmp = { h: 0, gx: 0, gz: 0 };
  const LADDER_Z = RT.d / 2 + 0.95;

  const api = {
    scene, camera, S,
    setMode(m) { S.mode = m; S.t = 0; },
    focusSign(on) { S.focusName = "sign"; S.focusT = on ? 1 : 0; },
    focusOn(name) { if (name) { S.focusName = name; S.focusT = 1; } else S.focusT = 0; },
    climbStep(n = 0.09) { S.climbT = Math.min(1, S.climbT + n); return S.climbT; },
    get climbDone() { return S.climb > 0.985; },
    overTop() { S.overT = 1; },
    bark() { dog.userData.bark = 0.8; },
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
      if (S.mode === "climb" && S.light < 0.5) {
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
      S.climb = damp(S.climb, S.climbT, 3, dt); S.over = damp(S.over, S.overT, 0.9, dt);
      if (m === "climb") {
        // 夜里：在水里抓住消防梯，一级一级往上爬，翻过女儿墙
        const c = S.climb, o = S.over;
        waveAt(2.5, LADDER_Z + 1.2, t, ocean.U.uAmp.value, tmp);
        const inWater = tmp.h + 0.32;
        px = 2.5; pz = lerp(LADDER_Z + 3.2 - Math.min(1, k / 6) * 1.6, LADDER_Z, Math.min(1, c * 5));
        py = Math.max(inWater * (1 - Math.min(1, c * 6)), lerp(0.4, RY + 0.95, c)) + Math.sin(c * 60) * 0.04 * (1 - o);
        pitch = lerp(0.42, 0.3, c) + noise1(t * 0.5) * 0.04; yaw = noise1(t * 0.3) * 0.06; roll = noise1(t * 0.4 + 2) * 0.05 * (1 - c);
        if (o > 0.001) { pz = lerp(pz, 3.4, o); py = lerp(py, RY + 0.42, o); pitch = lerp(pitch, -0.35, o); yaw = lerp(yaw, 0.55, o); roll = lerp(roll, 0.35, o); }
      } else if (m === "wake") {
        // 躺在楼顶 → 坐起来，看见身边的箱子
        const sit = smooth(4, 8.5, k);
        px = 2.4; pz = 3.6; py = RY + lerp(0.25, 1.0, sit);
        pitch = lerp(1.15, -0.32, sit); yaw = lerp(0.4, 0.75, sit) + noise1(t * 0.3) * 0.03; roll = lerp(0.3, 0, sit);
      } else if (m === "stand") {
        // 站起来，走到朝向城市那一侧的女儿墙边
        const u = smooth(0, 7.5, k), stride = k * 5;
        px = lerp(2.4, 0.4, u); pz = lerp(3.6, -RT.d / 2 + 0.75, u); py = RY + lerp(1.0, 1.65, smooth(0, 1.5, k)) + Math.abs(Math.sin(stride)) * 0.04 * (1 - u);
        yaw = lerp(0.75, 0.05, smooth(0, 3, k)); pitch = lerp(-0.32, -0.05, smooth(0.5, 4, k)); roll = Math.sin(stride * 0.5) * 0.006 * (1 - u);
      } else if (m === "vista" || m === "orbit") {
        const kk = m === "orbit" ? k + 40 : k;
        px = 0.4; pz = -RT.d / 2 + 0.75; py = RY + 1.65;
        const sweep = S.portrait ? 0.5 : 0.25;
        yaw = 0.05 + Math.sin(kk * 0.07) * sweep * smooth(3, 10, kk); pitch = -0.06 + Math.sin(kk * 0.05) * 0.015; roll = 0;
      }
      S.focus = damp(S.focus, S.focusT, 1.1, dt);
      if (m === "vista") { const F = FOCUS[S.focusName] || FOCUS.sign; yaw = lerp(yaw, F[0], S.focus); pitch = lerp(pitch, F[1], S.focus); }
      cam.pos.set(px, py, pz); cam.yaw = yaw; cam.pitch = pitch; cam.roll = roll;
      const ly = m === "stand" ? 0.25 : 1;
      camera.position.copy(cam.pos);
      camera.rotation.set(pitch + api.look.upitch * ly, yaw + api.look.uyaw * ly, roll);
      api.look.uyaw *= Math.exp(-dt * 0.25); api.look.upitch *= Math.exp(-dt * 0.25);

      sky.position.copy(camera.position);
      ocean.mesh.position.set(Math.round(camera.position.x / 4) * 4, 0, Math.round(camera.position.z / 4) * 4);
      rain.U.uTime.value = t; rain.U.uCenter.value.copy(camera.position); rain.U.uFlash.value = fl;
      rain.mesh.visible = S.light < 0.98;
      bolt.mesh.visible = bolt.mesh.visible && S.light < 0.5;
      beacon.visible = Math.sin(t * 2.2) > 0.55;
      if (roofLamp) { const on = (t % 1.6) < 0.55; roofLamp.visible = on; redL.intensity = on ? 9 * (1 - S.light) : 0; }
      if (trafficY) { const on = (t % 1.0) < 0.5 ? 1 : 0.05; trafficY.color.setRGB(4 * on, 2.6 * on, 0.3 * on); }
      { const d = dog.userData; d.tail.rotation.x = Math.sin(t * 9) * 0.5; d.bark = Math.max(0, (d.bark || 0) - dt); d.head.rotation.z = d.bark > 0 ? Math.abs(Math.sin(d.bark * 18)) * 0.25 : Math.sin(t * 0.7) * 0.05; }
      for (const f of floaters) { f.yaw += f.spin * dt; f.x += 0.05 * dt; waveAt(f.x, f.z, t, ocean.U.uAmp.value, tmp); f.m.position.set(f.x, tmp.h + f.off + Math.sin(t * 0.7 + f.ph) * 0.04, f.z); f.m.rotation.y = f.yaw; }
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
