// 沉没之后 · 序章：清晨航班的机舱（第一至第三幕）
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { clamp, lerp, damp, noise1, rng, canvasTex, jitterLine, FONT, HAND, GLSL_NOISE, disposeTree } from "./util.js";
import { loadPBR } from "./assets.js";
import { loadVRM, seatedVRM } from "./characters.js";
import { skyUniforms, applyPalette } from "./ocean.js";
import { ANIME_SKY_GLSL, toonUniforms, toonify, outlineUniforms, addOutlines } from "./anime.js";

const ROW = 0.82;
const WALL_X = 1.75;
const WIN_Y = 1.22, WIN_RX = 0.125, WIN_RY = 0.18;
const SEAT_X = [-1.42, -0.92, -0.42, 0.42, 0.92, 1.42];
const ROW_MIN = -15, ROW_MAX = 3;
const winZ = (r) => r * ROW - 0.12;

/* ---------- 窗外的天空：清晨云海 → 风暴 → 过近的海面 ---------- */
function makeCabinSky() {
  const uniforms = {
    ...skyUniforms(),
    uStorm: { value: 0 }, uSea: { value: 0 }, uRoll: { value: 0 }, uPitch: { value: 0 }, uInCloud: { value: 0 }, uCity: { value: 0 }, uFlood: { value: 0 }, uDusk: { value: 0 },
  };
  uniforms.uSunDir.value.set(-1, 0.09, -0.55).normalize();
  uniforms.uFlashDir.value.set(-0.8, 0.2, -0.6).normalize();
  applyPalette(uniforms, "sunset");
  const mat = new THREE.ShaderMaterial({
    uniforms, side: THREE.BackSide, depthWrite: false,
    vertexShader: /* glsl */ `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uTime, uSunSize, uCloud, uFlash, uWind, uCb, uStars;
      uniform vec3 uZen, uMid, uHor, uSunDir, uSunCol, uCloudLit, uCloudDark, uCloudRim, uFlashDir;
      uniform float uStorm, uSea, uRoll, uPitch, uInCloud, uCity, uFlood, uDusk;
      varying vec3 vP;
      ${GLSL_NOISE}
      ${ANIME_SKY_GLSL}
      void main(){
        vec3 d = normalize(vP);
        float cr = cos(uRoll), sr = sin(uRoll);
        d.xy = vec2(cr * d.x - sr * d.y, sr * d.x + cr * d.y);
        float cp = cos(uPitch), sp = sin(uPitch);
        d.yz = vec2(cp * d.y - sp * d.z, sp * d.y + cp * d.z);
        float y = d.y;
        vec3 col = animeSky(d);
        // 脚下的云海：手绘分层（亮面 / 中间调 / 蓝紫阴影 + 金色描边）
        float H = mix(1.0, 0.18, uSea);
        float t = H / max(0.03 - y, 0.03);
        vec2 p = d.xz * t;
        vec2 flow = vec2(0.0, -uTime * mix(0.22, 2.4, uSea));
        float n = fbm((p + flow) * 0.75);
        float n2 = fbm((p + flow) * 0.75 + uSunDir.xz * 0.1);
        float lit = clamp(0.5 + (n - n2) * 5.0, 0.0, 1.0);
        float band = smoothstep(0.34, 0.42, lit) * 0.55 + smoothstep(0.66, 0.74, lit) * 0.45;
        float th = 0.5 - uStorm * 0.15;
        float dens = smoothstep(th - 0.02, th + 0.02, n);
        vec3 cl = mix(uCloudDark, uCloudLit, band);
        float rim = smoothstep(th - 0.02, th + 0.015, n) - smoothstep(th + 0.02, th + 0.09, n);
        float sunF = max(dot(normalize(vec3(d.x, 0.0, d.z) + 1e-4), normalize(vec3(uSunDir.x, 0.0, uSunDir.z))), 0.0);
        cl += uCloudRim * rim * (0.25 + sunF * sunF * 1.5);
        vec3 gap = mix(uMid * 0.45, uCloudDark * 0.8, 0.5);
        cl = mix(gap, cl, dens);
        cl = mix(cl, uHor * 0.9, 1.0 - exp(-t * 0.03));
        vec2 ps = (p + flow * 3.0) * vec2(0.9, 0.35);
        float w = fbm(ps);
        vec3 sea = mix(vec3(0.02, 0.05, 0.1), vec3(0.08, 0.2, 0.3), smoothstep(0.4, 0.6, w));
        sea += vec3(0.75, 0.85, 1.0) * smoothstep(0.74, 0.76, fbm(ps * 2.3 + 3.0));
        sea = mix(sea, uHor * 0.55, 1.0 - exp(-t * 0.04));
        // 海潮市的灯火与淹没它的水
        vec2 gp = (p + flow * 3.0) * 0.9;
        vec2 cc = fract(gp), ci = floor(gp);
        float edge = min(min(cc.x, 1.0 - cc.x), min(cc.y, 1.0 - cc.y));
        float street = 1.0 - smoothstep(0.0, 0.07, edge);
        vec2 sub = fract(gp * 4.0);
        float alley = (1.0 - smoothstep(0.0, 0.05, min(min(sub.x, 1.0 - sub.x), min(sub.y, 1.0 - sub.y)))) * 0.35;
        float win = step(0.86, hash12(floor(gp * 16.0))) * (1.0 - street);
        float lights = street * (0.55 + 0.45 * hash12(ci)) + alley * hash12(floor(gp * 4.0)) + win * 0.8;
        lights *= 0.75 + 0.25 * sin(uTime * 3.0 + hash12(floor(gp * 16.0)) * 30.0);
        float fl = fbm(gp * 0.35 + vec2(3.1, 7.7)) + (gp.x * 0.04);
        float water = smoothstep(fl - 0.05, fl + 0.05, uFlood * 1.25);
        vec3 flooded = mix(vec3(0.03, 0.03, 0.07), sea * 0.9, water);
        flooded = mix(flooded, uHor * 0.5, 1.0 - exp(-t * 0.05));
        float below = 1.0 - smoothstep(-0.015, 0.012, y);
        vec3 glow = vec3(2.4, 1.3, 0.5) * lights * (1.0 - water) * exp(-t * 0.03) * uCity * uSea * below;
        vec3 lower = mix(cl, mix(sea, flooded, uCity), uSea);
        col = mix(col, lower, below);
        float st = fbm(vec2(d.x * 3.0 + d.z * 2.0, d.y * 9.0) + vec2(uTime * 2.6, 0.0));
        col = mix(col, mix(uCloudDark, uCloudLit, 0.5) * (0.7 + 0.5 * st), uInCloud);
        col *= 0.82 * (1.0 - uDusk * 0.72);
        col += glow;
        col += uFlash * vec3(0.8, 0.72, 1.1) * (0.45 + 0.6 * n);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(40, 32, 16), mat);
  mesh.renderOrder = 10;
  mesh.frustumCulled = false;
  return { mesh, uniforms };
}

/* ---------- 画布贴图 ---------- */
function carpetTex() {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = "#1d2433"; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 2600; i++) { g.fillStyle = `rgba(${90 + Math.random() * 60},${100 + Math.random() * 50},${140 + Math.random() * 60},${Math.random() * 0.12})`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
    g.strokeStyle = "rgba(120,140,190,0.18)"; g.lineWidth = 3;
    for (let y = 16; y < h; y += 64) for (let x = 16; x < w; x += 64) { g.beginPath(); g.arc(x, y, 10, 0, Math.PI * 2); g.stroke(); }
  }, { repeat: true });
}
function seatTex() {
  return canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = "#24476a"; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 1800; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? "255,255,255" : "0,0,0"},${Math.random() * 0.07})`; g.fillRect(Math.random() * w, Math.random() * h, 1, 2); }
  }, { repeat: true });
}
function fabricTex() {
  const N = 128, hgt = new Float32Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const wx = Math.sin((x / N) * Math.PI * 32), wy = Math.sin((y / N) * Math.PI * 32);
    hgt[y * N + x] = ((x >> 2) + (y >> 2)) % 2 ? wx * 0.5 + 0.5 : wy * 0.5 + 0.5;
    hgt[y * N + x] += (Math.random() - 0.5) * 0.25;
  }
  const map = canvasTex(N, N, (g) => {
    const id = g.createImageData(N, N);
    for (let i = 0; i < N * N; i++) { const v = 200 + hgt[i] * 40 + (Math.random() - 0.5) * 18; id.data[i * 4] = id.data[i * 4 + 1] = id.data[i * 4 + 2] = Math.max(0, Math.min(255, v)); id.data[i * 4 + 3] = 255; }
    g.putImageData(id, 0, 0);
  }, { repeat: true });
  const normal = canvasTex(N, N, (g) => {
    const id = g.createImageData(N, N);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const hx = hgt[y * N + ((x + 1) % N)] - hgt[y * N + ((x + N - 1) % N)], hy = hgt[((y + 1) % N) * N + x] - hgt[((y + N - 1) % N) * N + x];
      const nx = -hx * 1.5, ny = -hy * 1.5, l = Math.hypot(nx, ny, 1), i = (y * N + x) * 4;
      id.data[i] = (nx / l * 0.5 + 0.5) * 255; id.data[i + 1] = (ny / l * 0.5 + 0.5) * 255; id.data[i + 2] = (1 / l * 0.5 + 0.5) * 255; id.data[i + 3] = 255;
    }
    g.putImageData(id, 0, 0);
  }, { repeat: true, srgb: false });
  map.repeat.set(10, 10); normal.repeat.set(10, 10);
  return { map, normal };
}
function screenTex() {
  return canvasTex(128, 96, (g, w, h) => {
    g.fillStyle = "#06090d"; g.fillRect(0, 0, w, h);
    const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, "rgba(40,80,120,0.55)"); gr.addColorStop(1, "rgba(10,20,40,0.2)");
    g.fillStyle = gr; g.fillRect(4, 4, w - 8, h - 8);
    g.strokeStyle = "rgba(240,200,120,0.8)"; g.lineWidth = 1.5; g.setLineDash([3, 3]);
    g.beginPath(); g.moveTo(18, 70); g.quadraticCurveTo(60, 20, 108, 34); g.stroke(); g.setLineDash([]);
    g.fillStyle = "#f0c878"; g.beginPath(); g.arc(62, 38, 3, 0, Math.PI * 2); g.fill();
    g.fillStyle = "rgba(220,230,240,0.7)"; g.font = "9px sans-serif"; g.fillText("剩余 3:52", 10, 88);
  });
}
function paneTex() {
  return canvasTex(256, 360, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    const gr = g.createRadialGradient(w / 2, h / 2, w * 0.25, w / 2, h / 2, w * 0.62);
    gr.addColorStop(0, "rgba(255,255,255,0)"); gr.addColorStop(1, "rgba(235,242,250,0.45)");
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 70; i++) { // 细小划痕
      g.strokeStyle = `rgba(255,255,255,${0.04 + Math.random() * 0.1})`; g.lineWidth = 0.6 + Math.random();
      const x = Math.random() * w, y = Math.random() * h, a = Math.random() * Math.PI, l = 8 + Math.random() * 50;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
    }
    for (let i = 0; i < 260; i++) { const x = Math.random() * w, y = Math.random() * h, d = Math.hypot(x - w / 2, (y - h / 2) * 0.7) / (w * 0.5); if (d > 0.75) { g.fillStyle = `rgba(250,252,255,${0.15 + Math.random() * 0.25})`; g.fillRect(x, y, 1.5, 1.5); } }
    g.fillStyle = "rgba(30,30,30,0.6)"; g.beginPath(); g.arc(w / 2, h * 0.86, 3, 0, Math.PI * 2); g.fill(); // 透气小孔
  }, { srgb: true });
}
function binTex() {
  return canvasTex(512, 128, (g, w, h) => {
    g.fillStyle = "#e8e4dc"; g.fillRect(0, 0, w, h);
    g.strokeStyle = "rgba(60,60,70,0.35)"; g.lineWidth = 2;
    for (let x = 0; x <= w; x += w / 4) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
    for (let x = w / 8; x < w; x += w / 4) {
      g.fillStyle = "rgba(40,40,48,0.45)"; g.fillRect(x - 18, h * 0.78, 36, 10);
      g.fillStyle = "rgba(255,255,255,0.5)"; g.fillRect(x - 16, h * 0.78, 32, 2);
    }
    g.fillStyle = "rgba(0,0,0,0.12)"; g.fillRect(0, h * 0.92, w, h * 0.08);
  }, { repeat: true });
}
function exitTex() {
  return canvasTex(256, 96, (g, w, h) => {
    g.fillStyle = "#0c2a16"; g.fillRect(0, 0, w, h);
    g.fillStyle = "#7dffae"; g.font = `bold 46px ${FONT}`; g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText("出口  EXIT", w / 2, h / 2 + 2);
  });
}
// 小女孩的画：海上漂着的小房子
export function drawingTex() {
  return canvasTex(512, 384, (g, w, h) => {
    g.fillStyle = "#f7f1e3"; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 600; i++) { g.fillStyle = `rgba(150,130,90,${Math.random() * 0.05})`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
    g.lineCap = "round"; g.lineJoin = "round";
    // 太阳
    g.strokeStyle = "#f2a531"; g.lineWidth = 6;
    jitterLine(g, Array.from({ length: 21 }, (_, i) => [430 + Math.cos(i / 20 * Math.PI * 2) * 34, 70 + Math.sin(i / 20 * Math.PI * 2) * 34]), 3);
    for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; jitterLine(g, [[430 + Math.cos(a) * 46, 70 + Math.sin(a) * 46], [430 + Math.cos(a) * 64, 70 + Math.sin(a) * 64]], 2, 1); }
    // 海浪
    g.strokeStyle = "#3a78c9"; g.lineWidth = 7;
    for (let row = 0; row < 4; row++) {
      const y0 = 268 + row * 30;
      jitterLine(g, Array.from({ length: 40 }, (_, i) => [8 + i * 13, y0 + Math.sin(i * 0.9 + row) * 7]), 2.5);
    }
    // 木筏
    g.strokeStyle = "#8a5a2b"; g.lineWidth = 9;
    for (let i = 0; i < 4; i++) jitterLine(g, [[150, 250 + i * 6], [370, 250 + i * 6]], 3, 1);
    // 小房子
    g.strokeStyle = "#c2412f"; g.lineWidth = 7;
    jitterLine(g, [[180, 170], [250, 110], [320, 170]], 3);
    g.strokeStyle = "#4b3a2a"; g.lineWidth = 6;
    jitterLine(g, [[192, 170], [192, 246], [308, 246], [308, 170]], 3);
    g.strokeStyle = "#3a78c9"; g.lineWidth = 5; jitterLine(g, [[212, 188], [242, 188], [242, 214], [212, 214], [212, 188]], 2);
    g.strokeStyle = "#4b3a2a"; jitterLine(g, [[262, 246], [262, 200], [290, 200], [290, 246]], 2);
    // 小树
    g.strokeStyle = "#5a3d22"; g.lineWidth = 6; jitterLine(g, [[350, 246], [350, 190]], 2);
    g.strokeStyle = "#3f9a4a"; g.lineWidth = 8;
    jitterLine(g, Array.from({ length: 16 }, (_, i) => [350 + Math.cos(i / 15 * Math.PI * 2) * 24, 172 + Math.sin(i / 15 * Math.PI * 2) * 20]), 3);
    // 两个小人
    g.strokeStyle = "#333"; g.lineWidth = 4;
    for (const [x, s] of [[150, 1], [128, 0.75]]) {
      jitterLine(g, Array.from({ length: 12 }, (_, i) => [x + Math.cos(i / 11 * Math.PI * 2) * 9 * s, 196 * 1 + (1 - s) * 18 + Math.sin(i / 11 * Math.PI * 2) * 9 * s]), 1);
      const y0 = 205 + (1 - s) * 18;
      jitterLine(g, [[x, y0], [x, y0 + 26 * s]], 1, 1);
      jitterLine(g, [[x - 12 * s, y0 + 10 * s], [x + 12 * s, y0 + 10 * s]], 1, 1);
      jitterLine(g, [[x, y0 + 26 * s], [x - 9 * s, y0 + 40 * s]], 1, 1);
      jitterLine(g, [[x, y0 + 26 * s], [x + 9 * s, y0 + 40 * s]], 1, 1);
    }
    // 字
    g.fillStyle = "#2e5fa8"; g.font = `bold 40px ${HAND}`; g.textAlign = "left";
    g.save(); g.translate(28, 66); g.rotate(-0.05); g.fillText("我们的新家", 0, 0); g.restore();
    g.fillStyle = "#777"; g.font = `22px ${HAND}`; g.fillText("小满 画", 28, 104);
  });
}

/* ---------- 机舱 ---------- */
export function buildCabin({ renderer }) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b0d12);
  const camera = new THREE.PerspectiveCamera(62, 1, 0.03, 120);
  camera.rotation.order = "YXZ";
  const R = rng(7);

  const sky = makeCabinSky();
  scene.add(sky.mesh);

  // 灯光
  const hemi = new THREE.HemisphereLight(0xfff1e2, 0x6e6258, 0.85);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffb36e, 2.1);
  sun.position.set(-6, 2.2, -3.5); scene.add(sun); scene.add(sun.target);
  const lamp = new THREE.PointLight(0xffe6c4, 1.2, 6, 1.6);
  lamp.position.set(-0.9, 2.0, -0.4); scene.add(lamp);
  const red = new THREE.PointLight(0xff2a1a, 0, 9, 1.4);
  red.position.set(0, 2.0, -1.5); scene.add(red);

  // 材质
  const fab = fabricTex();
  const M = {
    wall: new THREE.MeshStandardMaterial({ color: 0xffffff, map: canvasTex(512, 256, (g, w, h) => {
      g.fillStyle = "#ebe6dc"; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 1400; i++) { g.fillStyle = `rgba(120,110,95,${Math.random() * 0.05})`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
      g.strokeStyle = "rgba(90,85,75,0.35)"; g.lineWidth = 2;
      for (let x = 0; x <= w; x += w / 2) { g.beginPath(); g.moveTo(x + 1, 0); g.lineTo(x + 1, h); g.stroke(); }
      g.fillStyle = "rgba(60,58,55,0.18)"; g.fillRect(0, h * 0.88, w, h * 0.12);
    }, { repeat: true }), roughness: 0.75, side: THREE.DoubleSide }),
    trim: new THREE.MeshStandardMaterial({ color: 0xcfc9be, roughness: 0.6 }),
    tunnel: new THREE.MeshStandardMaterial({ color: 0xdcd6cb, roughness: 0.7, side: THREE.BackSide }),
    shade: new THREE.MeshStandardMaterial({ color: 0xd8d2c6, roughness: 0.85, side: THREE.DoubleSide }),
    seat: new THREE.MeshStandardMaterial({ color: 0x3a5f86, roughness: 0.95 }),
    cover: new THREE.MeshStandardMaterial({ color: 0xeef0f2, roughness: 0.9 }),
    plastic: new THREE.MeshStandardMaterial({ color: 0x5b5f68, roughness: 0.55 }),
    tray: new THREE.MeshStandardMaterial({ color: 0x8b8f97, roughness: 0.5 }),
    floor: new THREE.MeshStandardMaterial({ map: carpetTex(), roughness: 1 }),
    bin: new THREE.MeshStandardMaterial({ map: binTex(), roughness: 0.6 }),
    strip: new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.35, 1.0), toneMapped: false }),
    wash: new THREE.MeshBasicMaterial({ color: new THREE.Color(1.1, 0.95, 0.78), toneMapped: false }),
    path: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.15, 0.05, 0.04), toneMapped: false }),
    hair: new THREE.MeshStandardMaterial({ color: 0x15110f, roughness: 0.8 }),
    skin: new THREE.MeshStandardMaterial({ color: 0xe6b897, roughness: 0.7 }),
  };
  M.floor.map.repeat.set(3, 18);
  M.seat.map = fab.map; M.seat.normalMap = fab.normal; M.seat.normalScale = new THREE.Vector2(0.6, 0.6);
  M.cover.map = fab.map;
  // 真实的面料与地毯（Poly Haven），到了就换上
  loadPBR("fabric_pattern_05", [5, 5], { diff: false }).then((t) => { if (t.normalMap) { M.seat.normalMap = t.normalMap; M.seat.roughnessMap = t.roughnessMap; M.seat.normalScale.set(1, 1); M.seat.roughness = 1; M.seat.needsUpdate = true; } });
  loadPBR("dirty_carpet", [3, 16]).then((t) => { if (t.map) { Object.assign(M.floor, t); M.floor.color.set(0x7d8aa6); M.floor.needsUpdate = true; } });
  M.wall.map.repeat.set(1 / (2 * ROW), 1 / 1.86); M.wall.map.offset.x = 0.3;
  M.bin.map.repeat.set(1, 1);

  const root = new THREE.Group(); scene.add(root);

  // --- 侧壁（带舷窗洞）---
  const zFront = -12.8, zBack = 3.2;
  const winRows = [];
  const paneTx = paneTex();
  for (let r = ROW_MIN; r <= ROW_MAX; r++) winRows.push(r);
  for (const side of [-1, 1]) {
    const s = new THREE.Shape();
    const u0 = side < 0 ? -zBack : zFront, u1 = side < 0 ? -zFront : zBack;
    s.moveTo(u0, 0); s.lineTo(u1, 0); s.lineTo(u1, 1.86); s.lineTo(u0, 1.86); s.lineTo(u0, 0);
    for (const r of winRows) {
      const u = side < 0 ? -winZ(r) : winZ(r);
      const hole = new THREE.Path();
      hole.absellipse(u, WIN_Y, WIN_RX, WIN_RY, 0, Math.PI * 2, true);
      s.holes.push(hole);
    }
    const wall = new THREE.Mesh(new THREE.ShapeGeometry(s, 24), M.wall);
    wall.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2;
    wall.position.x = side * WALL_X;
    root.add(wall);
    // 窗洞的内壁（椭圆筒）与窗框
    const tg = new THREE.CylinderGeometry(1, 1, 1, 28, 1, true); tg.rotateZ(Math.PI / 2);
    const tunnels = new THREE.InstancedMesh(tg, M.tunnel, winRows.length);
    const ring = new THREE.Shape(); ring.absellipse(0, 0, WIN_RX + 0.035, WIN_RY + 0.035, 0, Math.PI * 2, false);
    const rh = new THREE.Path(); rh.absellipse(0, 0, WIN_RX, WIN_RY, 0, Math.PI * 2, true); ring.holes.push(rh);
    const rg = new THREE.ShapeGeometry(ring, 32); rg.rotateY(side < 0 ? Math.PI / 2 : -Math.PI / 2);
    const rings = new THREE.InstancedMesh(rg, M.trim, winRows.length);
    const shades = new THREE.InstancedMesh(new THREE.PlaneGeometry(WIN_RX * 2.4, WIN_RY * 2.2).rotateY(Math.PI / 2), M.shade, winRows.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3();
    winRows.forEach((r, i) => {
      const z = winZ(r);
      m4.compose(p.set(side * (WALL_X + 0.045), WIN_Y, z), q.identity(), sc.set(0.07, WIN_RY, WIN_RX)); tunnels.setMatrixAt(i, m4);
      m4.compose(p.set(side * (WALL_X - 0.004), WIN_Y, z), q.identity(), sc.set(1, 1, 1)); rings.setMatrixAt(i, m4);
      // 别人的遮光板：有的拉下一半，有的全拉下
      const isOurs = side < 0 && r === 0;
      const down = isOurs ? -1 : R() < 0.45 ? R() * 0.8 : 0;
      m4.compose(p.set(side * (WALL_X + 0.085), WIN_Y + (1 - down) * WIN_RY * 2.2 * (isOurs ? 5 : 1), z), q.identity(), sc.set(1, 1, 1)); shades.setMatrixAt(i, m4);
    });
    const paneM = new THREE.MeshStandardMaterial({ map: paneTx, transparent: true, depthWrite: false, roughness: 0.05, metalness: 0.0, color: 0xffffff, side: THREE.DoubleSide, envMapIntensity: 0 });
    const paneG = new THREE.PlaneGeometry(WIN_RX * 2, WIN_RY * 2).rotateY(Math.PI / 2);
    const inner = new THREE.InstancedMesh(paneG, paneM, winRows.length);
    const outerM = new THREE.MeshBasicMaterial({ color: 0x9fb4c8, transparent: true, opacity: 0.08, depthWrite: false, side: THREE.DoubleSide });
    const outer = new THREE.InstancedMesh(paneG, outerM, winRows.length);
    winRows.forEach((r, i) => {
      m4.compose(p.set(side * (WALL_X + 0.012), WIN_Y, winZ(r)), q.identity(), sc.set(1, 0.98, 0.98)); inner.setMatrixAt(i, m4);
      m4.compose(p.set(side * (WALL_X + 0.07), WIN_Y, winZ(r)), q.identity(), sc.set(1, 1.04, 1.04)); outer.setMatrixAt(i, m4);
    });
    inner.renderOrder = outer.renderOrder = 12;
    root.add(tunnels, rings, shades, inner, outer);
  }
  // 我们的遮光板（单独控制）
  const myShade = new THREE.Mesh(new THREE.PlaneGeometry(WIN_RX * 2.4, WIN_RY * 2.2).rotateY(Math.PI / 2), M.shade);
  myShade.position.set(-(WALL_X + 0.085), WIN_Y + WIN_RY * 2.2, winZ(0));
  root.add(myShade);
  // 窗户点击区域
  const winHit = new THREE.Mesh(new THREE.PlaneGeometry(WIN_RX * 3, WIN_RY * 2.6).rotateY(Math.PI / 2), new THREE.MeshBasicMaterial({ visible: false }));
  winHit.position.set(-WALL_X + 0.01, WIN_Y, winZ(0)); winHit.name = "shade"; root.add(winHit);

  // --- 地板、行李架、天花板、灯带 ---
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(WALL_X * 2, zBack - zFront).rotateX(-Math.PI / 2), M.floor);
  floor.position.z = (zBack + zFront) / 2; root.add(floor);
  const binLen = zBack - zFront;
  for (const side of [-1, 1]) {
    const bin = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.42, binLen), [M.trim, M.trim, M.trim, M.bin, M.trim, M.trim]);
    bin.position.set(side * (WALL_X - 0.39), 2.0, (zBack + zFront) / 2);
    M.bin.map.repeat.set(1, 1);
    root.add(bin);
    // 行李架正面（带分格）
    const front = new THREE.Mesh(new THREE.PlaneGeometry(binLen, 0.42), M.bin);
    front.material = M.bin.clone(); front.material.map = M.bin.map.clone(); front.material.map.repeat.set(binLen / 3.3, 1); front.material.map.needsUpdate = true;
    front.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2;
    front.position.set(side * (WALL_X - 0.785), 2.0, (zBack + zFront) / 2);
    root.add(front);
    const cove = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.02, binLen), M.strip);
    cove.position.set(side * (WALL_X - 0.8), 2.23, (zBack + zFront) / 2); root.add(cove);
    const wash = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, binLen), M.wash);
    wash.position.set(side * (WALL_X - 0.03), 1.78, (zBack + zFront) / 2); root.add(wash);
    const pathL = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.012, binLen), M.path);
    pathL.position.set(side * 0.27, 0.01, (zBack + zFront) / 2); root.add(pathL);
  }
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(1.6, binLen).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xe9e4da, emissive: 0x6a645a, roughness: 0.8 }));
  ceil.position.set(0, 2.36, (zBack + zFront) / 2); root.add(ceil);
  // 阅读灯 / 服务面板
  {
    const g = new THREE.CircleGeometry(0.018, 10).rotateX(Math.PI / 2);
    const dots = new THREE.InstancedMesh(g, new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.5, 1.2), toneMapped: false }), 30);
    const m4 = new THREE.Matrix4(); let i = 0;
    for (let r = -12; r <= 2 && i < 30; r++) for (const x of [-1.2, 1.2]) if (R() < 0.35 && i < 30) { m4.makeTranslation(x + (R() - 0.5) * 0.5, 1.785, r * ROW + 0.1); dots.setMatrixAt(i++, m4); }
    dots.count = i; root.add(dots);
  }
  // 前后隔板
  const fb = new THREE.Mesh(new THREE.PlaneGeometry(WALL_X * 2, 2.4), M.wall); fb.position.set(0, 1.2, zFront); root.add(fb);
  const curtain = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 1.9), new THREE.MeshStandardMaterial({ color: 0x29324a, roughness: 1 }));
  curtain.position.set(0, 0.95, zFront + 0.01); root.add(curtain);
  const exit = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.18), new THREE.MeshBasicMaterial({ map: exitTex(), toneMapped: false }));
  exit.position.set(0, 2.06, zFront + 0.02); root.add(exit);
  const bb = new THREE.Mesh(new THREE.PlaneGeometry(WALL_X * 2, 2.4), M.wall); bb.position.set(0, 1.2, zBack); bb.rotation.y = Math.PI; root.add(bb);

  // --- 座椅（实例化）---
  const seats = [];
  for (let r = ROW_MIN; r <= ROW_MAX; r++) for (const x of SEAT_X) seats.push({ r, x, z: r * ROW });
  const geo = {
    cushion: new RoundedBoxGeometry(0.46, 0.12, 0.48, 2, 0.04),
    back: new RoundedBoxGeometry(0.46, 0.7, 0.1, 2, 0.04),
    cover: new RoundedBoxGeometry(0.4, 0.2, 0.02, 1, 0.008),
    arm: new THREE.BoxGeometry(0.05, 0.05, 0.4),
    stow: new THREE.BoxGeometry(0.36, 0.3, 0.012),
    base: new THREE.BoxGeometry(0.44, 0.38, 0.3),
  };
  const inst = (g, m, n) => { const im = new THREE.InstancedMesh(g, m, n); root.add(im); return im; };
  const I = {
    cushion: inst(geo.cushion, M.seat, seats.length), back: inst(geo.back, M.seat, seats.length),
    cover: inst(geo.cover, M.cover, seats.length), arm: inst(geo.arm, M.plastic, seats.length * 2),
    stow: inst(geo.stow, M.tray, seats.length), base: inst(geo.base, M.plastic, seats.length),
    screen: inst(new THREE.PlaneGeometry(0.17, 0.115), new THREE.MeshBasicMaterial({ map: screenTex(), color: 0xb8c4d0 }), seats.length),
  };
  {
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), one = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
    seats.forEach((s, i) => {
      const lean = 0.12;
      q.setFromEuler(e.set(lean, 0, 0));
      m4.compose(p.set(s.x, 0.44, s.z), q.identity(), one); I.cushion.setMatrixAt(i, m4);
      m4.compose(p.set(s.x, 0.18, s.z + 0.02), q.identity(), one); I.base.setMatrixAt(i, m4);
      q.setFromEuler(e.set(lean, 0, 0));
      m4.compose(p.set(s.x, 0.84, s.z + 0.27), q, one); I.back.setMatrixAt(i, m4);
      m4.compose(p.set(s.x, 1.08, s.z + 0.212), q, one); I.cover.setMatrixAt(i, m4);
      // 前排两个座位的小桌板放下了（我们和小女孩的）
      const down = s.r === -1 && (s.x === -1.42 || s.x === -0.92);
      if (down) m4.compose(p.set(s.x, 0.7, s.z + 0.5), q.identity(), new THREE.Vector3(1.15, 1, 1.0)), m4.multiply(new THREE.Matrix4().makeRotationX(-Math.PI / 2));
      else m4.compose(p.set(s.x, 0.82, s.z + 0.33), q, one);
      I.stow.setMatrixAt(i, m4);
      for (const k of [0, 1]) { m4.compose(p.set(s.x + (k ? 0.245 : -0.245), 0.62, s.z + 0.02), q.identity(), one); I.arm.setMatrixAt(i * 2 + k, m4); }
      q.setFromEuler(e.set(lean, 0, 0)); m4.compose(p.set(s.x, 1.04, s.z + 0.346), q, one); I.screen.setMatrixAt(i, m4);
    });
  }

  // --- 我们面前这块屏幕：航线图（南屿 → 远川，途经海潮市上空）---
  const mapCan = document.createElement("canvas"); mapCan.width = 512; mapCan.height = 340;
  const mapTex = new THREE.CanvasTexture(mapCan); mapTex.colorSpace = THREE.SRGBColorSpace; mapTex.anisotropy = 8;
  function drawMap(stage, prog) {
    const g = mapCan.getContext("2d"), w = 512, h = 340;
    g.fillStyle = "#07121c"; g.fillRect(0, 0, w, h);
    // 海与陆地
    g.fillStyle = "#0d2a40"; g.fillRect(0, 0, w, h);
    g.fillStyle = "#1c3a2c"; g.beginPath(); g.moveTo(150, 0); g.bezierCurveTo(200, 80, 160, 150, 230, 210); g.bezierCurveTo(280, 250, 250, 300, 300, 340); g.lineTo(512, 340); g.lineTo(512, 0); g.closePath(); g.fill();
    g.strokeStyle = "rgba(140,190,170,0.5)"; g.lineWidth = 2; g.beginPath(); g.moveTo(150, 0); g.bezierCurveTo(200, 80, 160, 150, 230, 210); g.bezierCurveTo(280, 250, 250, 300, 300, 340); g.stroke();
    g.fillStyle = "#1c3a2c"; g.beginPath(); g.ellipse(70, 280, 34, 22, -0.4, 0, Math.PI * 2); g.fill();
    // 风暴
    if (stage >= 1) {
      for (let i = 0; i < 5; i++) { g.strokeStyle = `rgba(240,120,90,${0.25 + i * 0.1})`; g.lineWidth = 3; g.beginPath(); g.arc(205, 175, 70 - i * 12, 0.4 + i * 0.3, 4.6 + i * 0.3); g.stroke(); }
    }
    // 航线
    const A = [70, 280], B = [460, 50], C = [330, 120];
    g.setLineDash([7, 6]); g.strokeStyle = "rgba(240,210,140,0.85)"; g.lineWidth = 3;
    g.beginPath(); g.moveTo(A[0], A[1]); g.quadraticCurveTo(C[0], C[1], B[0], B[1]); g.stroke(); g.setLineDash([]);
    const qp = (t) => [(1 - t) * (1 - t) * A[0] + 2 * (1 - t) * t * C[0] + t * t * B[0], (1 - t) * (1 - t) * A[1] + 2 * (1 - t) * t * C[1] + t * t * B[1]];
    // 城市
    const city = (x, y, name, big) => { g.fillStyle = big ? "#ffd27a" : "#cfd8e0"; g.beginPath(); g.arc(x, y, big ? 7 : 5, 0, Math.PI * 2); g.fill(); g.fillStyle = "#e8eef4"; g.font = `${big ? "bold 24" : "20"}px ${FONT}`; g.fillText(name, x + 10, y - 8); };
    city(A[0], A[1], "南屿"); city(B[0] - 4, B[1], "远川");
    const hc = qp(0.38); city(hc[0] + 2, hc[1] + 16, "海潮市", true);
    // 飞机
    const pp = qp(prog), pn = qp(Math.min(1, prog + 0.01));
    g.save(); g.translate(pp[0], pp[1]); g.rotate(Math.atan2(pn[1] - pp[1], pn[0] - pp[0]));
    g.fillStyle = "#ffffff"; g.beginPath(); g.moveTo(14, 0); g.lineTo(-10, -11); g.lineTo(-5, 0); g.lineTo(-10, 11); g.closePath(); g.fill(); g.restore();
    // 信息栏
    g.fillStyle = "rgba(0,0,0,0.55)"; g.fillRect(0, h - 58, w, 58);
    g.fillStyle = stage >= 1 ? "#ffb08a" : "#f0d9a0"; g.font = `bold 26px ${FONT}`;
    g.fillText(stage >= 1 ? "下方：海潮市　·　风暴潮预警" : "下方：海潮市", 16, h - 22);
    g.fillStyle = "#cfd8e0"; g.font = `20px ${FONT}`; g.fillText(stage >= 1 ? "剩余 3:31" : "剩余 3:52", w - 110, h - 22);
    g.fillStyle = "#cfd8e0"; g.font = `18px ${FONT}`; g.fillText("南屿 → 远川　CA·7175", 16, 30);
    mapTex.needsUpdate = true;
  }
  drawMap(0, 0.34);
  const myScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.19, 0.126), new THREE.MeshBasicMaterial({ map: mapTex, color: 0xd8dde4 }));
  myScreen.position.set(-1.42, 1.04, -0.82 + 0.348); myScreen.rotation.x = 0.12; root.add(myScreen);

  // --- 乘客的后脑勺 ---
  {
    const heads = [];
    for (let r = -12; r <= -1; r++) for (const x of SEAT_X) {
      if (r === -1 && x < -0.5) continue;
      if (R() < 0.55) heads.push([x + (R() - 0.5) * 0.06, 1.13 + R() * 0.09, r * ROW + 0.16, R()]);
    }
    // 头（真实比例）、脖子、露出椅背的肩膀轮廓，统一偏暗
    const hg = new THREE.SphereGeometry(0.083, 16, 12); hg.scale(0.92, 1.15, 1.05);
    const ng = new THREE.CylinderGeometry(0.04, 0.05, 0.1, 10);
    const sg = new THREE.SphereGeometry(0.1, 14, 10); sg.scale(2.0, 0.75, 1.1);
    const hm = new THREE.InstancedMesh(hg, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7 }), heads.length);
    const nm = new THREE.InstancedMesh(ng, new THREE.MeshStandardMaterial({ color: 0x6b5446, roughness: 0.8 }), heads.length);
    const smsh = new THREE.InstancedMesh(sg, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 }), heads.length);
    const pal = [0x120e0c, 0x21170f, 0x2e2219, 0x58524c, 0x0d0d0d, 0x3a2a1c];
    const cloth = [0x1d2129, 0x2a2622, 0x3a3f46, 0x23303d, 0x4a3b32, 0x1a1a1a];
    const m4 = new THREE.Matrix4(), c = new THREE.Color();
    heads.forEach(([x, y, z, k], i) => {
      const yy = y + 0.07;
      m4.makeTranslation(x, yy, z); hm.setMatrixAt(i, m4); hm.setColorAt(i, c.setHex(pal[Math.floor(k * pal.length)]));
      m4.makeTranslation(x, yy - 0.11, z + 0.01); nm.setMatrixAt(i, m4);
      m4.makeTranslation(x, yy - 0.2, z + 0.02); smsh.setMatrixAt(i, m4); smsh.setColorAt(i, c.setHex(cloth[Math.floor(((k * 7.3) % 1) * cloth.length)]));
    });
    root.add(hm, nm, smsh);
  }

  // --- 小桌板上的水杯 ---
  const cup = new THREE.Group();
  {
    const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.027, 0.09, 24, 1, true), new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.22, roughness: 0.05, side: THREE.DoubleSide, depthWrite: false }));
    glass.position.y = 0.045;
    const water = new THREE.Mesh(new THREE.CylinderGeometry(0.031, 0.026, 0.06, 24), new THREE.MeshStandardMaterial({ color: 0x9fc4d6, transparent: true, opacity: 0.35, roughness: 0.1, depthWrite: false }));
    water.position.y = 0.03;
    const su = { uTime: { value: 0 }, uRip: { value: 0 } };
    const surf = new THREE.Mesh(new THREE.CircleGeometry(0.031, 32).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({
      uniforms: su, transparent: true, depthWrite: false,
      vertexShader: "varying vec2 vU; void main(){ vU = uv - 0.5; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
      fragmentShader: `uniform float uTime, uRip; varying vec2 vU;
        void main(){ float r = length(vU) * 2.0; float w = sin(r * 38.0 - uTime * 14.0) * 0.5 + 0.5; float a = 0.25 + uRip * w * 0.55 * (1.0 - r * 0.5);
          vec3 c = mix(vec3(0.55, 0.7, 0.8), vec3(1.0, 0.95, 0.88), w * uRip + 0.2); gl_FragColor = vec4(c, a); }`,
    }));
    surf.position.y = 0.061;
    cup.add(water, surf, glass);
    cup.userData.su = su;
    cup.position.set(-1.33, 0.712, -0.28);
    root.add(cup);
  }
  // 我们小桌板上的一本旧杂志
  {
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.006, 0.22), new THREE.MeshStandardMaterial({ map: canvasTex(128, 176, (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, "#2d6f8f"); gr.addColorStop(1, "#e7c38a"); g.fillStyle = gr; g.fillRect(0, 0, w, h);
      g.fillStyle = "#fff"; g.font = `bold 22px ${FONT}`; g.fillText("云上", 10, 32); g.font = `12px ${FONT}`; g.fillText("机上读物 · 十一月", 10, 52);
    }), roughness: 0.8 }));
    mag.position.set(-1.5, 0.708, -0.32); mag.rotation.y = 0.25; root.add(mag);
  }

  // --- 小女孩 ---
  const girl = new THREE.Group();
  const G = {};
  {
    // 写实一些的孩子比例：头不大，肩窄，穿一件连帽卫衣
    const hoodie = new THREE.MeshStandardMaterial({ color: 0xb85a4c, roughness: 0.92, map: fab.map, normalMap: fab.normal, normalScale: new THREE.Vector2(0.4, 0.4) });
    const denim = new THREE.MeshStandardMaterial({ color: 0x2f3b52, roughness: 0.9 });
    const skin = new THREE.MeshStandardMaterial({ color: 0xc89a82, roughness: 0.6 });
    const hairM = new THREE.MeshStandardMaterial({ color: 0x1b1310, roughness: 0.55 });
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.095, 0.2, 6, 14), hoodie);
    torso.scale.set(1.2, 1, 0.82); torso.position.set(0, 0.73, 0.07); torso.rotation.x = 0.06;
    const hood = new THREE.Mesh(new THREE.TorusGeometry(0.065, 0.032, 8, 16), hoodie);
    hood.position.set(0, 0.88, 0.12); hood.rotation.x = 1.0; hood.scale.set(1.15, 1, 0.8);
    const pocket = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.05, 0.01), new THREE.MeshStandardMaterial({ color: 0x9c4a3f, roughness: 0.95 }));
    pocket.position.set(0, 0.66, -0.008);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.03, 0.06, 10), skin); neck.position.set(0, 0.9, 0.05);
    // 动画风格的头部：比写实略大的头、分层的发片（带天使环高光）、大眼睛贴片
    const head = new THREE.Group(); head.position.set(0, 1.0, 0.045);
    const face = new THREE.Mesh(new THREE.SphereGeometry(0.084, 28, 20), skin); face.scale.set(0.92, 1.08, 0.98);
    const chin = new THREE.Mesh(new THREE.SphereGeometry(0.05, 16, 12), skin); chin.position.set(0, -0.05, -0.028); chin.scale.set(1.05, 0.75, 0.9);
    const ears = [-1, 1].map((k) => { const e = new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 6), skin); e.position.set(k * 0.077, -0.006, 0.006); e.scale.set(0.5, 1, 0.8); return e; });
    const eyeTex = canvasTex(128, 128, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      g.fillStyle = "#fff"; g.beginPath(); g.ellipse(64, 70, 40, 46, 0, 0, Math.PI * 2); g.fill();
      const gr = g.createLinearGradient(0, 30, 0, 110); gr.addColorStop(0, "#1b0f0c"); gr.addColorStop(0.6, "#6a3a24"); gr.addColorStop(1, "#c98a52");
      g.fillStyle = gr; g.beginPath(); g.ellipse(64, 74, 30, 40, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = "#120806"; g.beginPath(); g.ellipse(64, 76, 14, 20, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = "#fff"; g.beginPath(); g.ellipse(52, 56, 10, 12, 0, 0, Math.PI * 2); g.fill(); g.beginPath(); g.arc(76, 96, 5, 0, Math.PI * 2); g.fill();
      g.strokeStyle = "#1a0e0a"; g.lineWidth = 9; g.lineCap = "round"; g.beginPath(); g.ellipse(64, 70, 42, 48, 0, Math.PI * 1.1, Math.PI * 1.9); g.stroke();
    }, { srgb: true });
    const eyeM = new THREE.MeshBasicMaterial({ map: eyeTex, transparent: true, depthWrite: false });
    const eyes = [-1, 1].map((k) => { const e = new THREE.Mesh(new THREE.PlaneGeometry(0.034, 0.036), eyeM); e.position.set(k * 0.03, 0.006, -0.077); e.rotation.y = Math.PI + k * 0.28; e.userData.noOutline = true; return e; });
    const brows = [-1, 1].map((k) => { const b = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.003, 0.004), new THREE.MeshBasicMaterial({ color: 0x2a1610 })); b.position.set(k * 0.03, 0.034, -0.078); b.rotation.z = k * 0.12; return b; });
    const blush = new THREE.MeshBasicMaterial({ color: 0xff8f8a, transparent: true, opacity: 0.35, depthWrite: false });
    const cheeks = [-1, 1].map((k) => { const c = new THREE.Mesh(new THREE.CircleGeometry(0.011, 12), blush); c.position.set(k * 0.042, -0.02, -0.071); c.rotation.y = Math.PI + k * 0.5; return c; });
    // 发色：深栗色 + 天使环高光
    const hairTex = canvasTex(64, 256, (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, 0, h);
      gr.addColorStop(0, "#2a1a14"); gr.addColorStop(0.3, "#3b2419"); gr.addColorStop(0.36, "#9c6a4c"); gr.addColorStop(0.42, "#3b2419"); gr.addColorStop(1, "#1e120e");
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 30; i++) { g.strokeStyle = `rgba(0,0,0,${0.1 + Math.random() * 0.15})`; g.beginPath(); const x = Math.random() * w; g.moveTo(x, 0); g.lineTo(x + (Math.random() - 0.5) * 6, h); g.stroke(); }
    });
    const hairM2 = new THREE.MeshStandardMaterial({ map: hairTex, roughness: 0.5, side: THREE.DoubleSide });
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.091, 28, 18, 0, Math.PI * 2, 0, Math.PI * 0.6), hairM2);
    cap.scale.set(0.95, 1.08, 1.02); cap.rotation.x = 0.5; cap.position.set(0, 0.008, 0.006);
    const backHair = new THREE.Mesh(new THREE.SphereGeometry(0.088, 22, 16), hairM2); backHair.scale.set(0.96, 1.08, 0.92); backHair.position.set(0, 0.0, 0.02);
    // 发片：刘海、鬓角、后脑的尖角
    const strand = (len, wid) => { const g = new THREE.CapsuleGeometry(wid * 0.6, len, 3, 8); g.translate(0, -len / 2, 0); g.scale(1, 1, 0.38); return g; };
    const cards = [];
    const addCard = (x, y, z, len, wid, rx, rz, ry = 0) => { const c = new THREE.Mesh(strand(len, wid), hairM2); c.position.set(x, y, z); c.rotation.set(rx, ry, rz); cards.push(c); };
    for (let i = -3; i <= 3; i++) addCard(i * 0.022, 0.065, -0.07 + Math.abs(i) * 0.006, 0.045 + (i % 2 ? 0.01 : 0), 0.02, -0.3, i * 0.07);
    for (const k of [-1, 1]) { addCard(k * 0.078, 0.03, -0.035, 0.11, 0.02, -0.12, k * 0.12); addCard(k * 0.08, 0.02, 0.0, 0.1, 0.022, 0.05, k * 0.18); }
    for (let i = -2; i <= 2; i++) addCard(i * 0.03, 0.02, 0.085, 0.1, 0.024, 0.35, i * 0.12);
    const tail = new THREE.Mesh(new THREE.CapsuleGeometry(0.026, 0.12, 4, 10), hairM2); tail.position.set(0, -0.06, 0.1); tail.rotation.x = 0.4;
    const tie = new THREE.Mesh(new THREE.TorusGeometry(0.021, 0.007, 6, 12), new THREE.MeshStandardMaterial({ color: 0xe6c44d, roughness: 0.5 })); tie.position.set(0, 0.0, 0.095); tie.rotation.x = 1.2;
    head.add(face, chin, ...ears, ...eyes, ...brows, ...cheeks, backHair, cap, ...cards, tail, tie);
    G.hairCards = cards;
    G.head = head;
    const mkArm = (k) => {
      const a = new THREE.Group(); a.position.set(k * 0.115, 0.86, 0.06);
      const up = new THREE.Mesh(new THREE.CapsuleGeometry(0.027, 0.13, 4, 10).translate(0, -0.09, 0), hoodie); a.add(up);
      const el = new THREE.Group(); el.position.y = -0.18; el.rotation.x = 1.15; a.add(el);
      const fo = new THREE.Mesh(new THREE.CapsuleGeometry(0.023, 0.15, 4, 10).translate(0, -0.095, 0), hoodie); el.add(fo);
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.022, 10, 8), skin); hand.position.y = -0.2; hand.scale.set(0.9, 1.2, 0.7); el.add(hand);
      a.userData.hand = el;
      a.rotation.x = 0.45; a.rotation.z = -k * 0.1; return a;
    };
    G.armR = mkArm(1); G.armL = mkArm(-1);
    const legs = new THREE.Group();
    for (const k of [-1, 1]) {
      const th = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.24, 4, 10), denim); th.rotation.x = Math.PI / 2; th.position.set(k * 0.055, 0.55, -0.08); legs.add(th);
      const sh = new THREE.Mesh(new THREE.CapsuleGeometry(0.036, 0.22, 4, 10), denim); sh.position.set(k * 0.055, 0.42, -0.23); legs.add(sh);
      const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 0.13), new THREE.MeshStandardMaterial({ color: 0xe8e4dc, roughness: 0.7 })); shoe.position.set(k * 0.055, 0.29, -0.26); legs.add(shoe);
    }
    girl.add(hood, pocket, neck);
    // 速写本
    const book = new THREE.Group(), inner = new THREE.Group();
    const cover = new THREE.Mesh(new THREE.BoxGeometry(0.27, 0.008, 0.2), new THREE.MeshStandardMaterial({ color: 0x3b6f5c, roughness: 0.8 }));
    const page = new THREE.Mesh(new THREE.PlaneGeometry(0.25, 0.185).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: drawingTex(), roughness: 0.9 }));
    page.position.y = 0.0045;
    inner.add(cover, page); inner.rotation.x = Math.PI / 2; inner.rotation.y = Math.PI;
    book.add(inner); G.book = book;
    book.position.set(0, 0.712, -0.3);
    G.qBase = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, Math.PI, "XYZ"));
    G.qShow = new THREE.Quaternion();
    const crayon = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.07, 6), new THREE.MeshStandardMaterial({ color: 0x3a78c9 }));
    crayon.rotation.x = 1.2; crayon.position.y = -0.21; G.armR.userData.hand.add(crayon);
    girl.add(torso, head, G.armR, G.armL, legs);
    girl.position.set(-0.84, 0, 0.02);
    root.add(girl);
    book.position.x += -0.86; root.add(book);
    G.bookBase = book.position.clone();
    const hit = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.7, 0.6), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.set(-0.84, 0.85, -0.05); hit.name = "girl"; root.add(hit);
  }

  // --- 空乘与餐车（风格化剪影）---
  const crew = new THREE.Group();
  {
    const uni = new THREE.MeshStandardMaterial({ color: 0x1f2a44, roughness: 0.8 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 0.95, 16), uni); body.position.y = 1.15;
    const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.5, 16), uni); skirt.position.y = 0.45;
    const legs = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.07, 0.25, 10), new THREE.MeshStandardMaterial({ color: 0x2b2420 })); legs.position.y = 0.1;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 18, 14), M.skin); head.position.y = 1.74;
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.118, 18, 14, 0, Math.PI * 2, 0, Math.PI * 0.55), M.hair); hair.position.y = 1.75; hair.rotation.x = 0.4;
    const bun = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 10), M.hair); bun.position.set(0, 1.78, -0.11);
    const scarf = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.12, 4), new THREE.MeshStandardMaterial({ color: 0xe2574c })); scarf.position.set(0, 1.56, 0.12); scarf.rotation.x = Math.PI;
    crew.add(body, skirt, legs, head, hair, bun, scarf);
    const cart = new THREE.Group();
    const metal = new THREE.MeshStandardMaterial({ color: 0xb9bdc4, roughness: 0.35, metalness: 0.4 });
    const box = new THREE.Mesh(new RoundedBoxGeometry(0.32, 0.98, 0.72, 2, 0.02), metal); box.position.y = 0.5;
    const top = new THREE.Mesh(new THREE.BoxGeometry(0.33, 0.02, 0.73), new THREE.MeshStandardMaterial({ color: 0x3a3d44 })); top.position.y = 1.0;
    cart.add(box, top);
    const bm = [0xd9e6ef, 0xc96f3b, 0x6aa36f, 0xeae2c8];
    for (let i = 0; i < 7; i++) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.16, 8), new THREE.MeshStandardMaterial({ color: bm[i % 4], roughness: 0.3 })); b.position.set((R() - 0.5) * 0.2, 1.09, (R() - 0.5) * 0.55); cart.add(b); }
    cart.position.z = 0.62;
    crew.add(cart);
    crew.position.set(0.02, 0, -9);
    root.add(crew);
  }

  // --- 氧气面罩（实例化，第三幕落下）---
  const masks = { list: [], cups: null, tubes: null, t: -1 };
  {
    for (let r = -7; r <= 0; r++) for (const x of SEAT_X) if (!(r === 0 && x < -1)) masks.list.push({ x: x + (R() - 0.5) * 0.06, z: r * ROW + 0.05, d: R() * 0.4, ph: R() * 6 });
    masks.cups = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.045, 0.06, 0.07, 14), new THREE.MeshStandardMaterial({ color: 0xf2c230, roughness: 0.5 }), masks.list.length);
    const tg = new THREE.CylinderGeometry(0.004, 0.004, 1, 5); tg.translate(0, -0.5, 0);
    masks.tubes = new THREE.InstancedMesh(tg, new THREE.MeshStandardMaterial({ color: 0xe8e8e0 }), masks.list.length);
    masks.cups.visible = masks.tubes.visible = false;
    root.add(masks.cups, masks.tubes);
  }

  // --- 窗口射进来的晨光 + 浮尘 ---
  const beam = new THREE.Group();
  const beamU = { uI: { value: 1 } };
  {
    const mat = new THREE.ShaderMaterial({
      uniforms: beamU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      vertexShader: "varying vec2 vU; void main(){ vU = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
      fragmentShader: `uniform float uI; varying vec2 vU; void main(){ float along = 1.0 - vU.x; float edge = smoothstep(0.0, 0.35, vU.y) * smoothstep(1.0, 0.65, vU.y);
        float a = along * along * edge * 0.16 * uI * smoothstep(0.0, 0.08, vU.x); gl_FragColor = vec4(vec3(1.0, 0.78, 0.5) * a, 1.0); }`,
    });
    const g1 = new THREE.PlaneGeometry(1.6, 0.36); g1.translate(0.8, 0, 0);
    const p1 = new THREE.Mesh(g1, mat), p2 = new THREE.Mesh(g1, mat); p2.rotation.x = Math.PI / 2;
    beam.add(p1, p2);
    beam.position.set(-WALL_X + 0.02, WIN_Y, winZ(0));
    beam.lookAt(new THREE.Vector3(0.8, 0.45, 0.2)); beam.rotateY(-Math.PI / 2);
    root.add(beam);
    const n = 70, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { pos[i * 3] = -1.72 + R() * 0.3; pos[i * 3 + 1] = 0.95 + R() * 0.45; pos[i * 3 + 2] = -0.45 + R() * 0.5; }
    const dg = new THREE.BufferGeometry(); dg.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const motes = new THREE.Points(dg, new THREE.PointsMaterial({ color: 0xffe2b8, size: 0.0035, map: canvasTex(32, 32, (g) => { const r = g.createRadialGradient(16, 16, 0, 16, 16, 16); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 32, 32); }), transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }));
    beam.userData.motes = motes; root.add(motes);
  }

  // ---------- 状态与视角 ----------
  const S = {
    city: 0, flood: 0, dusk: 0, storm: 0, sea: 0, inCloud: 0, roll: 0, pitch: 0, flash: 0, flicker: 0, emergency: 0,
    shade: 0, shadeT: 0, showDrawing: 0, showT: 0, cartZ: -9, cartT: -9, cupRip: 0, lightsOff: 0,
  };
  const VIEWS = {
    window: { yaw: 0.78, pyaw: 1.0, pitch: -0.12, fov: 0 },
    cart: { yaw: -0.38, pyaw: -0.42, pitch: -0.04, fov: 0 },
    wide: { yaw: 0.55, pitch: -0.05, fov: 0 },
    forward: { yaw: 0.12, pitch: -0.1, fov: 0 },
    girl: { yaw: -0.85, pyaw: -1.05, pitch: -0.42, fov: 4, off: [-0.07, 0.07, 0.02] },
    drawing: { yaw: -0.62, pitch: -0.42, fov: -6, off: [-0.05, 0.05, 0.02] },
    cup: { yaw: 0.06, pitch: -0.78, fov: -10 },
    screen: { yaw: 0.17, pitch: -0.2, fov: -26, pfov: -14 },
    aisle: { yaw: -0.25, pitch: -0.06, fov: 0 },
    up: { yaw: 0.3, pitch: 0.5, fov: 0 },
  };
  const look = { yaw: 0.98, pitch: 0.02, fovOff: 0, uyaw: 0, upitch: 0, target: VIEWS.window, k: 1.6 };
  const camBase = new THREE.Vector3(-1.3, 1.17, 0.2);
  let portrait = false;

  // 动画画风：赛璐璐着色 + 描边（小女孩、空乘、座椅）
  const TU = toonUniforms({ key: 0.42, shade: [0.52, 0.46, 0.78], rim: [0.55, 0.38, 0.25], post: 0.5 });
  const OU = outlineUniforms({ px: 1.4, col: [0.09, 0.06, 0.12], far0: 2.5, far1: 10 });
  toonify(root, TU);
  addOutlines(girl, OU); addOutlines(crew, OU);
  for (const k of ["cushion", "back", "cover"]) addOutlines(I[k], OU);
  let toonTick = 0;
  // 可替换的 VRM 小满（manifest 里登记了才会加载）
  let girlVRM = null;
  loadVRM("xiaoman").then((vrm) => {
    if (!vrm) return;
    vrm.scene.position.set(-0.84, 0.42, 0.06); vrm.scene.rotation.y = Math.PI;
    const box = new THREE.Box3().setFromObject(vrm.scene), hgt = box.max.y - box.min.y;
    if (hgt > 0.2) vrm.scene.scale.setScalar(1.2 / hgt);
    root.add(vrm.scene); girl.visible = false; girlVRM = { vrm, ctl: seatedVRM(vrm) };
  });

  const api = {
    scene, camera, S, TU, OU,
    get sunDir() { return sky.uniforms.uSunDir.value; },
    get sunVis() { return (1 - S.storm) * (1 - S.shade) * (1 - S.dusk); },
    setView(name, k = 1.6) { look.target = VIEWS[name] || VIEWS.window; look.k = k; },
    lookDrag(dx, dy) {
      look.uyaw = clamp(look.uyaw + dx * 0.0042, -1.6, 1.6);
      look.upitch = clamp(look.upitch + dy * 0.0035, -0.8, 0.7);
    },
    resetLook() { look.uyaw = 0; look.upitch = 0; },
    setShade(down) { S.shadeT = down ? 1 : 0; },
    setMap(stage, prog) { drawMap(stage, prog); },
    toggleShade() { S.shadeT = S.shadeT > 0.5 ? 0 : 1; return S.shadeT > 0.5; },
    showDrawing(on) { S.showT = on ? 1 : 0; },
    dropMasks() { masks.t = 0; masks.cups.visible = masks.tubes.visible = true; },
    pick(ndc) {
      const ray = new THREE.Raycaster(); ray.setFromCamera(ndc, camera);
      const hits = ray.intersectObjects([winHit, root.getObjectByName("girl")], false);
      return hits.length ? hits[0].object.name : null;
    },
    resize(w, h) {
      OU.uRes.value.set(w, h);
      portrait = w / h < 0.8;
      camera.aspect = w / h; camera.updateProjectionMatrix();
    },
    update(dt, time) {
      // 视角：剧本目标 + 玩家拖动偏移
      const T = look.target;
      const pY = portrait ? (T.pyaw ?? (T === VIEWS.wide ? 0.85 : T === VIEWS.forward ? 0.25 : T.yaw)) : T.yaw;
      look.yaw = damp(look.yaw, pY + look.uyaw, look.k, dt);
      look.pitch = damp(look.pitch, T.pitch + look.upitch, look.k, dt);
      look.fovOff = damp(look.fovOff, portrait && T.pfov !== undefined ? T.pfov : T.fov, 2, dt);
      camera.fov = (portrait ? 66 : 58) + look.fovOff;
      camera.updateProjectionMatrix();
      const off = T.off || [0, 0, 0];
      look.ox = damp(look.ox || 0, off[0], 1.5, dt); look.oy = damp(look.oy || 0, off[1], 1.5, dt); look.oz = damp(look.oz || 0, off[2], 1.5, dt);
      camera.position.set(camBase.x + look.ox, camBase.y + look.oy, camBase.z + look.oz);
      camera.rotation.set(look.pitch, look.yaw, 0);
      look.uyaw *= Math.exp(-dt * 0.08); look.upitch *= Math.exp(-dt * 0.08);

      if (girlVRM) girlVRM.ctl.update(dt, time, -S.showDrawing * 0.3, 0.35 - S.showDrawing * 0.3);
      // 新加载的贴图 / 材质也要赛璐璐化
      if ((toonTick -= dt) <= 0) { toonTick = 1; toonify(root, TU); }
      TU.uKey.value = 0.42 * (1 - S.lightsOff * 0.6) + S.flash * 0.3;
      // 天空
      const u = sky.uniforms;
      applyPalette(u, "sunset", "stormDusk", S.storm); u.uTime.value = time; u.uStorm.value = S.storm; u.uSea.value = S.sea; u.uInCloud.value = S.inCloud; u.uCity.value = S.city; u.uFlood.value = S.flood; u.uDusk.value = S.dusk;
      u.uFlash.value = S.flash; u.uRoll.value = S.roll; u.uPitch.value = S.pitch;
      sky.mesh.position.copy(camera.position);
      S.flash = Math.max(0, S.flash - dt * 3.5);

      // 遮光板
      S.shade = damp(S.shade, S.shadeT, 5, dt);
      myShade.position.y = WIN_Y + (1 - S.shade) * WIN_RY * 2.2 * 1.02;
      const open = 1 - S.shade;
      beamU.uI.value = open * (1 - S.storm) * (1 - S.lightsOff);
      beam.userData.motes.material.opacity = 0.7 * beamU.uI.value;
      const mp = beam.userData.motes.geometry.attributes.position;
      for (let i = 0; i < mp.count; i++) { mp.array[i * 3 + 1] += Math.sin(time * 0.3 + i) * 0.00015; mp.array[i * 3] += 0.00003; if (mp.array[i * 3] > -1.42) mp.array[i * 3] = -1.72; }
      mp.needsUpdate = true;

      // 灯光：平静 → 闪烁 → 红色应急
      const flick = S.flicker > 0 ? (noise1(time * 23) > 0.35 - S.flicker * 0.5 ? 0.15 : 1) : 1;
      const on = (1 - S.lightsOff) * flick;
      sun.intensity = 2.1 * open * (1 - S.storm) + S.flash * 3;
      hemi.intensity = (0.95 - S.storm * 0.35) * (0.35 + 0.65 * on) + S.flash * 1.2;
      hemi.color.setRGB(1, 0.94 - S.emergency * 0.5, 0.86 - S.emergency * 0.6);
      lamp.intensity = 1.2 * on * (1 - S.emergency);
      M.strip.color.setRGB(1.6 * on + S.emergency * 0.9, 1.35 * on * (1 - S.emergency), 1.0 * on * (1 - S.emergency));
      M.wash.color.setRGB(1.1 * on + S.emergency, 0.95 * on * (1 - S.emergency), 0.78 * on * (1 - S.emergency));
      const pulse = S.emergency * (0.6 + 0.4 * Math.sin(time * 6));
      red.intensity = 1.6 * pulse;
      M.path.color.setRGB(0.15 + 2.2 * S.emergency, 0.05 + 0.5 * S.emergency, 0.04 + 0.2 * S.emergency);

      // 小女孩：画画的手、偶尔看看你
      const g = time;
      G.armR.rotation.x = 0.45 + Math.sin(g * 5.2) * 0.05 * (1 - S.storm);
      G.armR.rotation.z = -0.12 + Math.sin(g * 3.1) * 0.07 * (1 - S.storm);
      const lookAtYou = clamp(S.showDrawing, 0, 1);
      G.head.rotation.y = damp(G.head.rotation.y, lookAtYou * 0.3 + Math.sin(g * 0.4) * 0.06, 3, dt);
      G.head.rotation.x = damp(G.head.rotation.x, -(1 - lookAtYou) * 0.42 - S.storm * 0.25, 3, dt);
      S.showDrawing = damp(S.showDrawing, S.showT, 3, dt);
      const sd = S.showDrawing;
      G.book.position.set(G.bookBase.x - 0.12 * sd, G.bookBase.y + 0.24 * sd, G.bookBase.z + 0.1 * sd);
      if (sd > 0.001) {
        const o = new THREE.Object3D(); o.position.copy(G.book.position); o.lookAt(camera.position); o.rotateZ(Math.PI); G.qShow.copy(o.quaternion);
        G.book.quaternion.copy(G.qBase).slerp(G.qShow, sd);
      } else G.book.quaternion.copy(G.qBase);
      G.armL.rotation.x = 0.45 + S.showDrawing * 0.45;

      // 餐车
      S.cartZ = damp(S.cartZ, S.cartT, 0.35, dt);
      crew.position.z = S.cartZ;
      crew.rotation.z = Math.sin(time * 9) * 0.02 * S.storm;

      // 水杯
      cup.userData.su.uTime.value = time;
      cup.userData.su.uRip.value = S.cupRip;
      cup.position.x = -1.33 + noise1(time * 18) * 0.004 * S.cupRip;
      cup.position.z = -0.28 + noise1(time * 15 + 9) * 0.004 * S.cupRip;

      // 氧气面罩
      if (masks.t >= 0) {
        masks.t += dt;
        const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3(1, 1, 1);
        masks.list.forEach((mk, i) => {
          const t = Math.max(0, masks.t - mk.d);
          const drop = Math.min(1, t * t * 7);
          const bounce = t > 0.38 ? Math.exp(-(t - 0.38) * 3) * Math.sin((t - 0.38) * 18) * 0.05 : 0;
          const len = 0.06 + drop * 0.52 + bounce;
          const sw = Math.sin(time * 2.4 + mk.ph) * 0.18 * (S.storm + 0.3) + noise1(time * 3 + mk.ph) * 0.1;
          q.setFromEuler(e.set(sw * 0.6, 0, sw));
          const tip = new THREE.Vector3(0, -len, 0).applyQuaternion(q);
          m4.compose(p.set(mk.x, 1.79, mk.z), q, s.set(1, len, 1)); masks.tubes.setMatrixAt(i, m4);
          m4.compose(p.set(mk.x + tip.x, 1.79 + tip.y - 0.03, mk.z + tip.z), q, s.set(1, 1, 1)); masks.cups.setMatrixAt(i, m4);
        });
        masks.cups.instanceMatrix.needsUpdate = masks.tubes.instanceMatrix.needsUpdate = true;
      }
    },
    dispose() { disposeTree(scene); },
  };
  api.update(0.016, 0);
  return api;
}
