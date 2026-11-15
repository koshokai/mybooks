// 沉没之后 · 序章：清晨航班的机舱（第一至第三幕）
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { clamp, lerp, damp, noise1, rng, canvasTex, jitterLine, FONT, HAND, GLSL_NOISE, disposeTree } from "./util.js";

const ROW = 0.82;
const WALL_X = 1.75;
const WIN_Y = 1.22, WIN_RX = 0.125, WIN_RY = 0.18;
const SEAT_X = [-1.42, -0.92, -0.42, 0.42, 0.92, 1.42];
const ROW_MIN = -15, ROW_MAX = 3;
const winZ = (r) => r * ROW - 0.12;

/* ---------- 窗外的天空：清晨云海 → 风暴 → 过近的海面 ---------- */
function makeCabinSky() {
  const uniforms = {
    uTime: { value: 0 }, uStorm: { value: 0 }, uSea: { value: 0 }, uFlash: { value: 0 },
    uRoll: { value: 0 }, uPitch: { value: 0 }, uInCloud: { value: 0 },
    uSun: { value: new THREE.Vector3(-1, 0.17, -0.55).normalize() },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms, side: THREE.BackSide, depthWrite: false,
    vertexShader: /* glsl */ `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uTime, uStorm, uSea, uFlash, uRoll, uPitch, uInCloud; uniform vec3 uSun; varying vec3 vP;
      ${GLSL_NOISE}
      void main(){
        vec3 d = normalize(vP);
        float cr = cos(uRoll), sr = sin(uRoll);
        d.xy = vec2(cr * d.x - sr * d.y, sr * d.x + cr * d.y);
        float cp = cos(uPitch), sp = sin(uPitch);
        d.yz = vec2(cp * d.y - sp * d.z, sp * d.y + cp * d.z);
        float y = d.y;
        vec3 zen = mix(vec3(0.16, 0.34, 0.72), vec3(0.13, 0.15, 0.19), uStorm);
        vec3 hor = mix(vec3(1.0, 0.72, 0.5), vec3(0.36, 0.39, 0.44), uStorm);
        vec3 col = mix(hor, zen, smoothstep(0.0, 0.32, y));
        float sd = max(dot(d, uSun), 0.0);
        float s2 = sd * sd, s4 = s2 * s2, s8 = s4 * s4, s32 = s8 * s8 * s8 * s8;
        col += (1.0 - uStorm) * (vec3(1.0, 0.62, 0.32) * (s32 * 0.7 + s8 * 0.18) + vec3(7.0, 5.6, 3.8) * smoothstep(0.9988, 0.9995, sd));
        if (y > 0.0) {
          vec2 p = d.xz / (y + 0.15);
          float n = fbm(p * 0.8 + vec2(0.0, -uTime * 0.04));
          float cov = smoothstep(0.62 - uStorm * 0.4, 0.85, n) * mix(0.35, 1.0, uStorm);
          vec3 cc = mix(vec3(1.05, 0.9, 0.8), vec3(0.2, 0.22, 0.26), uStorm) * (0.75 + 0.35 * n);
          col = mix(col, cc, cov * smoothstep(0.0, 0.12, y));
        }
        float H = mix(1.0, 0.18, uSea);
        float t = H / max(0.03 - y, 0.03);
        vec2 p = d.xz * t;
        vec2 flow = vec2(0.0, -uTime * mix(0.22, 2.4, uSea));
        float n = fbm((p + flow) * 0.8);
        float n2 = fbm((p + flow) * 0.8 + vec2(0.12, -0.08));
        float lit = clamp(0.5 + (n - n2) * 3.0, 0.0, 1.0);
        vec3 cl = mix(vec3(0.30, 0.40, 0.58), mix(vec3(0.78, 0.74, 0.78), vec3(1.25, 1.02, 0.82), lit), smoothstep(0.42, 0.62, n));
        cl = mix(cl, vec3(0.26, 0.29, 0.34) * (0.55 + 0.7 * n), uStorm);
        cl = mix(cl, hor * 0.9, 1.0 - exp(-t * 0.035));
        vec2 ps = (p + flow * 3.0) * vec2(0.9, 0.35);
        float w = fbm(ps);
        vec3 sea = mix(vec3(0.02, 0.05, 0.07), vec3(0.14, 0.19, 0.23), w);
        sea += vec3(0.55) * smoothstep(0.7, 0.86, fbm(ps * 2.3 + 3.0));
        sea = mix(sea, hor * 0.55, 1.0 - exp(-t * 0.04));
        vec3 below = mix(cl, sea, uSea);
        col = mix(below, col, smoothstep(-0.015, 0.012, y));
        float st = fbm(vec2(d.x * 3.0 + d.z * 2.0, d.y * 9.0) + vec2(uTime * 2.6, 0.0));
        col = mix(col, vec3(0.46, 0.49, 0.54) * (0.6 + 0.5 * st), uInCloud);
        col *= 0.72;
        col += uFlash * vec3(0.85, 0.9, 1.05) * (0.5 + 0.7 * n);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(40, 32, 16), mat);
  mesh.renderOrder = 10; // 画在机舱之后，靠深度测试只在窗口里计算
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
function binTex() {
  return canvasTex(512, 128, (g, w, h) => {
    g.fillStyle = "#e8e4dc"; g.fillRect(0, 0, w, h);
    g.strokeStyle = "rgba(60,60,70,0.35)"; g.lineWidth = 2;
    for (let x = 0; x <= w; x += w / 4) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
    g.fillStyle = "rgba(60,60,70,0.25)";
    for (let x = w / 8; x < w; x += w / 4) g.fillRect(x - 14, h * 0.18, 28, 6);
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
  const hemi = new THREE.HemisphereLight(0xe6ecf6, 0x8a7f72, 0.95);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffc28a, 1.6);
  sun.position.set(-6, 2.2, -3.5); scene.add(sun); scene.add(sun.target);
  const lamp = new THREE.PointLight(0xffe6c4, 1.2, 6, 1.6);
  lamp.position.set(-0.9, 2.0, -0.4); scene.add(lamp);
  const red = new THREE.PointLight(0xff2a1a, 0, 9, 1.4);
  red.position.set(0, 2.0, -1.5); scene.add(red);

  // 材质
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
    seat: new THREE.MeshStandardMaterial({ color: 0xffffff, map: seatTex(), roughness: 0.9 }),
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
  M.wall.map.repeat.set(1 / (2 * ROW), 1 / 1.86); M.wall.map.offset.x = 0.3;
  M.bin.map.repeat.set(1, 1);

  const root = new THREE.Group(); scene.add(root);

  // --- 侧壁（带舷窗洞）---
  const zFront = -12.8, zBack = 3.2;
  const winRows = [];
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
    root.add(tunnels, rings, shades);
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
    cover: new THREE.BoxGeometry(0.38, 0.16, 0.012),
    arm: new THREE.BoxGeometry(0.05, 0.05, 0.4),
    stow: new THREE.BoxGeometry(0.36, 0.3, 0.012),
    base: new THREE.BoxGeometry(0.44, 0.38, 0.3),
  };
  const inst = (g, m, n) => { const im = new THREE.InstancedMesh(g, m, n); root.add(im); return im; };
  const I = {
    cushion: inst(geo.cushion, M.seat, seats.length), back: inst(geo.back, M.seat, seats.length),
    cover: inst(geo.cover, M.cover, seats.length), arm: inst(geo.arm, M.plastic, seats.length * 2),
    stow: inst(geo.stow, M.tray, seats.length), base: inst(geo.base, M.plastic, seats.length),
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
      m4.compose(p.set(s.x, 1.08, s.z + 0.248), q, one); I.cover.setMatrixAt(i, m4);
      // 前排两个座位的小桌板放下了（我们和小女孩的）
      const down = s.r === -1 && (s.x === -1.42 || s.x === -0.92);
      if (down) m4.compose(p.set(s.x, 0.7, s.z + 0.5), q.identity(), new THREE.Vector3(1.15, 1, 1.0)), m4.multiply(new THREE.Matrix4().makeRotationX(-Math.PI / 2));
      else m4.compose(p.set(s.x, 0.82, s.z + 0.33), q, one);
      I.stow.setMatrixAt(i, m4);
      for (const k of [0, 1]) { m4.compose(p.set(s.x + (k ? 0.245 : -0.245), 0.62, s.z + 0.02), q.identity(), one); I.arm.setMatrixAt(i * 2 + k, m4); }
    });
  }

  // --- 乘客的后脑勺 ---
  {
    const heads = [];
    for (let r = -12; r <= -1; r++) for (const x of SEAT_X) {
      if (r === -1 && x < -0.5) continue;
      if (R() < 0.55) heads.push([x + (R() - 0.5) * 0.06, 1.13 + R() * 0.09, r * ROW + 0.16, R()]);
    }
    const hg = new THREE.SphereGeometry(0.1, 16, 12); hg.scale(1, 1.12, 1.05);
    const hm = new THREE.InstancedMesh(hg, M.hair, heads.length);
    const pal = [0x15110f, 0x2a1d16, 0x3b2b20, 0x6c6560, 0x111111];
    const m4 = new THREE.Matrix4(), c = new THREE.Color();
    heads.forEach(([x, y, z, k], i) => { m4.makeTranslation(x, y, z); hm.setMatrixAt(i, m4); hm.setColorAt(i, c.setHex(pal[Math.floor(k * pal.length)])); });
    root.add(hm);
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
    const sweater = new THREE.MeshStandardMaterial({ color: 0xf0c04a, roughness: 0.95 });
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 0.34, 16), sweater); torso.position.set(0, 0.68, 0.08);
    const head = new THREE.Group(); head.position.set(0, 0.95, 0.04);
    const face = new THREE.Mesh(new THREE.SphereGeometry(0.095, 24, 18), M.skin);
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.102, 24, 18, 0, Math.PI * 2, 0, Math.PI * 0.62), M.hair);
    hair.rotation.x = 0.42; hair.position.z = 0.01;
    const back = new THREE.Mesh(new THREE.SphereGeometry(0.1, 20, 14), M.hair); back.position.set(0, -0.01, 0.03); back.scale.set(1, 1, 0.9);
    const tails = [-1, 1].map((s) => { const t = new THREE.Mesh(new THREE.SphereGeometry(0.04, 12, 10), M.hair); t.position.set(s * 0.1, -0.02, 0.05); t.scale.set(0.8, 1.4, 0.8); return t; });
    const bowM = new THREE.MeshStandardMaterial({ color: 0xd8424f, roughness: 0.6 });
    const bows = [-1, 1].map((s) => { const b = new THREE.Mesh(new THREE.SphereGeometry(0.022, 10, 8), bowM); b.position.set(s * 0.095, 0.03, 0.05); b.scale.set(1.4, 0.8, 0.8); return b; });
    const eyeM = new THREE.MeshBasicMaterial({ color: 0x1a1210 });
    const eyes = [-1, 1].map((s) => { const e = new THREE.Mesh(new THREE.SphereGeometry(0.009, 8, 6), eyeM); e.position.set(s * 0.033, 0.0, -0.088); return e; });
    head.add(back, face, hair, ...tails, ...bows, ...eyes);
    G.head = head;
    const armG = new THREE.CylinderGeometry(0.03, 0.026, 0.24, 10); armG.translate(0, -0.12, 0);
    const mkArm = (s) => { const a = new THREE.Group(); a.position.set(s * 0.12, 0.8, 0.06); const m = new THREE.Mesh(armG, sweater); a.add(m); const hand = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), M.skin); hand.position.y = -0.25; a.add(hand); a.rotation.x = -1.05; a.rotation.z = s * 0.25; return a; };
    G.armR = mkArm(1); G.armL = mkArm(-1);
    const legs = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.08, 0.3), new THREE.MeshStandardMaterial({ color: 0x3b4f7a, roughness: 0.9 }));
    legs.position.set(0, 0.54, -0.08);
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
    const crayon = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.08, 6), new THREE.MeshStandardMaterial({ color: 0x3a78c9 }));
    crayon.rotation.x = 1.2; crayon.position.y = -0.27; G.armR.add(crayon);
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
    storm: 0, sea: 0, inCloud: 0, roll: 0, pitch: 0, flash: 0, flicker: 0, emergency: 0,
    shade: 0, shadeT: 0, showDrawing: 0, showT: 0, cartZ: -9, cartT: -9, cupRip: 0, lightsOff: 0,
  };
  const VIEWS = {
    window: { yaw: 0.78, pyaw: 1.0, pitch: -0.12, fov: 0 },
    cart: { yaw: -0.38, pyaw: -0.42, pitch: -0.04, fov: 0 },
    wide: { yaw: 0.55, pitch: -0.05, fov: 0 },
    forward: { yaw: 0.12, pitch: -0.1, fov: 0 },
    girl: { yaw: -1.2, pitch: -0.36, fov: 0 },
    drawing: { yaw: -0.72, pitch: -0.4, fov: -10 },
    cup: { yaw: 0.06, pitch: -0.78, fov: -10 },
    aisle: { yaw: -0.25, pitch: -0.06, fov: 0 },
    up: { yaw: 0.3, pitch: 0.5, fov: 0 },
  };
  const look = { yaw: 0.98, pitch: 0.02, fovOff: 0, uyaw: 0, upitch: 0, target: VIEWS.window, k: 1.6 };
  const camBase = new THREE.Vector3(-1.3, 1.17, 0.2);
  let portrait = false;

  const api = {
    scene, camera, S,
    setView(name, k = 1.6) { look.target = VIEWS[name] || VIEWS.window; look.k = k; },
    lookDrag(dx, dy) {
      look.uyaw = clamp(look.uyaw + dx * 0.0042, -1.6, 1.6);
      look.upitch = clamp(look.upitch + dy * 0.0035, -0.8, 0.7);
    },
    resetLook() { look.uyaw = 0; look.upitch = 0; },
    setShade(down) { S.shadeT = down ? 1 : 0; },
    toggleShade() { S.shadeT = S.shadeT > 0.5 ? 0 : 1; return S.shadeT > 0.5; },
    showDrawing(on) { S.showT = on ? 1 : 0; },
    dropMasks() { masks.t = 0; masks.cups.visible = masks.tubes.visible = true; },
    pick(ndc) {
      const ray = new THREE.Raycaster(); ray.setFromCamera(ndc, camera);
      const hits = ray.intersectObjects([winHit, root.getObjectByName("girl")], false);
      return hits.length ? hits[0].object.name : null;
    },
    resize(w, h) {
      portrait = w / h < 0.8;
      camera.aspect = w / h; camera.updateProjectionMatrix();
    },
    update(dt, time) {
      // 视角：剧本目标 + 玩家拖动偏移
      const T = look.target;
      const pY = portrait ? (T.pyaw ?? (T === VIEWS.wide ? 0.85 : T === VIEWS.forward ? 0.25 : T.yaw)) : T.yaw;
      look.yaw = damp(look.yaw, pY + look.uyaw, look.k, dt);
      look.pitch = damp(look.pitch, T.pitch + look.upitch, look.k, dt);
      look.fovOff = damp(look.fovOff, T.fov, 2, dt);
      camera.fov = (portrait ? 66 : 58) + look.fovOff;
      camera.updateProjectionMatrix();
      camera.position.copy(camBase);
      camera.rotation.set(look.pitch, look.yaw, 0);
      look.uyaw *= Math.exp(-dt * 0.08); look.upitch *= Math.exp(-dt * 0.08);

      // 天空
      const u = sky.uniforms;
      u.uTime.value = time; u.uStorm.value = S.storm; u.uSea.value = S.sea; u.uInCloud.value = S.inCloud;
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
      sun.intensity = 1.6 * open * (1 - S.storm) + S.flash * 3;
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
      G.armR.rotation.x = -1.05 + Math.sin(g * 5.2) * 0.06 * (1 - S.storm);
      G.armR.rotation.z = 0.25 + Math.sin(g * 3.1) * 0.08 * (1 - S.storm);
      const lookAtYou = clamp((look.yaw < -0.5 ? 1 : 0) + S.showDrawing, 0, 1);
      G.head.rotation.y = damp(G.head.rotation.y, lookAtYou * 0.95 + Math.sin(g * 0.4) * 0.08, 3, dt);
      G.head.rotation.x = damp(G.head.rotation.x, (1 - lookAtYou) * 0.38 - S.storm * 0.2, 3, dt);
      S.showDrawing = damp(S.showDrawing, S.showT, 3, dt);
      const sd = S.showDrawing;
      G.book.position.set(G.bookBase.x - 0.12 * sd, G.bookBase.y + 0.24 * sd, G.bookBase.z + 0.1 * sd);
      if (sd > 0.001) {
        const o = new THREE.Object3D(); o.position.copy(G.book.position); o.lookAt(camera.position); o.rotateZ(Math.PI); G.qShow.copy(o.quaternion);
        G.book.quaternion.copy(G.qBase).slerp(G.qShow, sd);
      } else G.book.quaternion.copy(G.qBase);
      G.armL.rotation.x = -1.05 - S.showDrawing * 0.5;

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
