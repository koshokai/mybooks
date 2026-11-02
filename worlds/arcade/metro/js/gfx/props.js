// 星环列车 · 障碍、星尘、道具（全部用 InstancedMesh 池，每帧按可见特征重建）
import * as THREE from 'three';
import { GB, bend, BEND_GLSL, BEND, ATLAS, canvasTex, radialTex } from './util.js';
import { LANE_X, DECK_HW, CAR_LEN, CAR_GAP, RAMP_LEN, ROOF_H, VIEW_AHEAD } from '../config.js';
import { BARRIER, GANTRY, BLOCK, GAP, TRAIN, ONCOMING } from '../gen.js';
import { MIX } from './biomes.js';

const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(1, 1, 1), _c = new THREE.Color();
const _e = new THREE.Euler();

// 面向相机的发光贴片（同样会被世界弯曲）
export function glowMaterial(tex, color, { opacity = 1, size = 1, additive = true } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: { uMap: { value: tex }, uColor: { value: new THREE.Color(color) }, uOpacity: { value: opacity }, uSize: { value: size }, uBendY: BEND.y, uBendX: BEND.x },
    transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, fog: false,
    vertexShader: BEND_GLSL + /* glsl */`
      uniform float uSize; varying vec2 vUv; varying float vF;
      void main() {
        vUv = uv;
        vec4 c = vec4(0.0, 0.0, 0.0, 1.0);
        #ifdef USE_INSTANCING
          c = instanceMatrix * c;
          float sc = length(instanceMatrix[0].xyz);
        #else
          float sc = 1.0;
        #endif
        vec4 w = modelMatrix * c;
        w.xyz = bendWorld(w.xyz);
        vec4 mv = viewMatrix * w;
        mv.xy += position.xy * uSize * sc;
        vF = clamp(1.0 - (-mv.z - 150.0) / 120.0, 0.0, 1.0) * smoothstep(2.0, 7.0, -mv.z);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D uMap; uniform vec3 uColor; uniform float uOpacity; varying vec2 vUv; varying float vF;
      void main() { vec4 t = texture2D(uMap, vUv); gl_FragColor = vec4(uColor * t.rgb * t.a * uOpacity * vF, t.a * uOpacity * vF); }`,
  });
}

// 一组共享实例矩阵的 InstancedMesh
class Pool {
  constructor(scene, cap, parts) {
    this.cap = cap; this.n = 0;
    this.meshes = parts.map(([geo, mat, colored]) => {
      const im = new THREE.InstancedMesh(geo, mat, cap);
      im.frustumCulled = false; im.count = 0;
      if (colored) im.setColorAt(0, new THREE.Color(1, 1, 1));
      im.userData.colored = colored;
      scene.add(im);
      return im;
    });
  }
  begin() { this.n = 0; }
  push(m, color) {
    if (this.n >= this.cap) return -1;
    for (const im of this.meshes) {
      im.setMatrixAt(this.n, m);
      if (im.userData.colored && color) im.setColorAt(this.n, color);
    }
    return this.n++;
  }
  end() {
    for (const im of this.meshes) {
      im.count = this.n;
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
    }
  }
}

const CONT_COLORS = ['#e07a2f', '#1f8a8a', '#b8403a', '#2f5fa8', '#d6d2c8', '#d8a82a'].map((c) => new THREE.Color(c));
const CAR_COLORS = ['#e8873a', '#2f8f9a', '#b8443c', '#5a6478'].map((c) => new THREE.Color(c));

export class Props {
  constructor(scene, atlas) {
    this.scene = scene;
    this.atlas = atlas;
    const paint = bend(new THREE.MeshStandardMaterial({ map: atlas, vertexColors: true, roughness: 0.55, metalness: 0.25 }));
    const frame = bend(new THREE.MeshStandardMaterial({ map: atlas, vertexColors: true, roughness: 0.6, metalness: 0.45 }));
    const glow = bend(new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, color: new THREE.Color(1.7, 1.7, 1.7) }));
    this.glowMat = glow;
    this.blinkMat = bend(new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, color: new THREE.Color(3, 3, 3) }));
    const signMat = bend(new THREE.MeshBasicMaterial({ map: atlas, vertexColors: true, toneMapped: false, color: new THREE.Color(1.5, 1.5, 1.5) }));
    const RED = new THREE.Color(1, 0.18, 0.12), AMBER = new THREE.Color('#ffb547'), WHITE = new THREE.Color(1, 1, 1);

    // —— 警示栏 ——
    {
      const f = new GB(), g = new GB(), b = new GB();
      for (const sx of [-0.92, 0.92]) {
        f.box(0.14, 0.95, 0.14, { x: sx, y: 0.475, color: 0x2a2f3a });
        f.box(0.42, 0.06, 0.5, { x: sx, y: 0.03, color: 0x2a2f3a });
        b.box(0.17, 0.1, 0.17, { x: sx, y: 1.0, color: RED });
      }
      f.box(1.96, 0.34, 0.12, { y: 0.7, color: 0xffffff, uv: ATLAS.hazard });
      f.box(1.96, 0.07, 0.08, { y: 0.3, color: 0x3a3f4a });
      g.box(1.96, 0.035, 0.13, { y: 0.885, color: AMBER });
      this.barrier = new Pool(scene, 40, [[f.build(), frame, false], [g.build(), glow, false], [b.build(), this.blinkMat, false]]);
    }
    // —— 信号门架（单车道） ——
    const gantry = (wide) => {
      const f = new GB(), g = new GB(), b = new GB(), sg = new GB();
      const hw = wide ? DECK_HW - 0.05 : 1.16;
      for (const sx of [-hw, hw]) {
        f.box(0.2, 3.65, 0.34, { x: sx, y: 1.82, color: 0x2a3040 });
        f.box(0.5, 0.1, 0.6, { x: sx, y: 0.05, color: 0x2a3040 });
      }
      f.box(hw * 2 + 0.2, 0.55, 0.5, { y: 1.475, color: 0xffffff, uv: ATLAS.hazard });
      f.box(hw * 2 + 0.2, 0.28, 0.42, { y: 3.48, color: 0x2a3040 });
      f.box(hw * 2 - 0.1, 1.5, 0.16, { y: 2.5, color: 0x1a1e28 });
      const signs = wide ? [-LANE_X[2], 0, LANE_X[2]] : [0];
      for (const sx of signs) sg.box(0.95, 0.95, 0.2, { x: sx, y: 2.5, z: 0.02, color: 0xffffff, uv: ATLAS.sign });
      g.box(hw * 2 - 0.1, 0.05, 0.46, { y: 1.19, color: new THREE.Color(1, 0.35, 0.18) });
      const lanes = wide ? [-LANE_X[2], 0, LANE_X[2]] : [0];
      for (const lx of lanes) for (const cx of [-0.42, 0, 0.42]) {
        g.add(new THREE.ConeGeometry(0.11, 0.2, 3), { x: lx + cx, y: 1.02, rx: Math.PI, color: new THREE.Color(1, 0.3, 0.15) });
      }
      for (const sx of wide ? [-2.8, -1.4, 0, 1.4, 2.8] : [-0.6, 0, 0.6]) b.sphere(0.1, 8, 6, { x: sx, y: 3.72, color: RED });
      return [[f.build(), frame, false], [g.build(), glow, false], [b.build(), this.blinkMat, false], [sg.build(), signMat, false]];
    };
    this.gantry = new Pool(scene, 24, gantry(false));
    this.gantryWide = new Pool(scene, 10, gantry(true));

    // —— 货柜（长度 1，按实例缩放） ——
    {
      const p = new GB(), f = new GB();
      p.box(2.1, 2.5, 1, { y: 1.3, z: -0.5, color: 0xffffff, uv: ATLAS.cont });
      f.box(2.16, 0.08, 1, { y: 2.58, z: -0.5, color: 0x3a3f4a });
      f.box(2.16, 0.08, 1, { y: 0.04, z: -0.5, color: 0x3a3f4a });
      for (const sx of [-1.04, 1.04]) f.box(0.1, 2.6, 0.08, { x: sx, y: 1.3, z: -0.04, color: 0x3a3f4a });
      this.cont = new Pool(scene, 40, [[p.build(), paint, true], [f.build(), frame, false]]);
    }
    // —— 货运车厢（长 10，车头朝 +z） ——
    {
      const p = new GB(), f = new GB(), g = new GB();
      p.box(2.16, 1.7, 9.8, { y: 1.55, z: -5, color: 0xffffff, uv: ATLAS.car });
      f.box(1.5, 0.04, 9.5, { y: 2.42, z: -5, color: 0xffffff, uv: ATLAS.roof });
      f.box(2.0, 0.3, 10, { y: 0.55, z: -5, color: 0x22262e });
      for (const bz of [-1.7, -8.3]) {
        f.box(1.8, 0.42, 2.3, { y: 0.32, z: bz, color: 0x1a1d24 });
        for (const wz of [-0.65, 0.65]) for (const wx of [-0.78, 0.78]) f.cyl(0.3, 0.3, 0.12, 12, { x: wx, y: 0.3, z: bz + wz, rz: Math.PI / 2, color: 0x4a505c });
      }
      f.box(2.12, 0.26, 0.1, { y: 0.82, z: 0.04, color: 0xffffff, uv: ATLAS.hazard });
      f.box(0.32, 0.3, 1.2, { y: 0.8, z: -10.5, color: 0x22262e });
      g.box(0.05, 0.05, 9.4, { x: -0.98, y: 2.44, z: -5, color: AMBER.clone().multiplyScalar(0.6) });
      g.box(0.05, 0.05, 9.4, { x: 0.98, y: 2.44, z: -5, color: AMBER.clone().multiplyScalar(0.6) });
      for (const sx of [-0.78, 0.78]) g.box(0.22, 0.16, 0.05, { x: sx, y: 1.25, z: 0.03, color: RED });
      this.car = new Pool(scene, 48, [[p.build(), paint, true], [f.build(), frame, false], [g.build(), glow, false]]);
    }
    // —— 坡道（低端 z=0，高端 z=-8） ——
    {
      const f = new GB(), g = new GB();
      const th = Math.atan2(ROOF_H, RAMP_LEN), L = Math.hypot(ROOF_H, RAMP_LEN);
      f.box(2.1, 0.12, L, { y: ROOF_H / 2 - 0.06, z: -RAMP_LEN / 2, rx: th, color: 0xffffff, uv: ATLAS.ramp });
      for (const sx of [-1.02, 1.02]) {
        f.box(0.1, 0.32, L, { x: sx, y: ROOF_H / 2 + 0.06, z: -RAMP_LEN / 2, rx: th, color: 0x2a3040 });
        g.box(0.05, 0.04, L, { x: sx, y: ROOF_H / 2 + 0.24, z: -RAMP_LEN / 2, rx: th, color: AMBER.clone().multiplyScalar(0.5) });
        f.box(0.16, ROOF_H, 0.16, { x: sx * 0.85, y: ROOF_H / 2, z: -RAMP_LEN + 0.3, color: 0x2a3040 });
        f.box(0.14, ROOF_H * 0.5, 0.14, { x: sx * 0.85, y: ROOF_H * 0.25, z: -RAMP_LEN / 2, color: 0x2a3040 });
      }
      for (let i = 0; i < 4; i++) {
        const t = (i + 0.7) / 4.4, z = -RAMP_LEN * t, y = ROOF_H * t + 0.02;
        for (const sd of [-1, 1]) g.box(0.5, 0.03, 0.085, { x: sd * 0.22, y, z: z + 0.1, rx: th, ry: sd * 0.7, color: AMBER.clone().multiplyScalar(0.8) });
      }
      this.ramp = new Pool(scene, 14, [[f.build(), frame, false], [g.build(), glow, false]]);
    }
    // —— 迎面穿梭车（Group 池） ——
    this.shuttleTex = radialTex([[0, 'rgba(255,255,255,1)'], [0.18, 'rgba(255,248,230,.85)'], [0.45, 'rgba(255,220,160,.22)'], [1, 'rgba(255,200,120,0)']]);
    this.shuttles = [];
    {
      const body = new GB(), dark = new GB(), lit = new GB();
      body.sphere(1, 24, 14, { sx: 1.08, sy: 1.0, sz: 2.6, y: 1.48, z: -2.6, color: 0xeef2f6 });
      body.box(2.16, 2.0, 7.4, { y: 1.48, z: -6.3, color: 0xeef2f6 });
      dark.box(2.2, 0.55, 7.2, { y: 1.85, z: -6.3, color: 0x141a26 });
      dark.sphere(1, 20, 10, { sx: 1.0, sy: 0.42, sz: 1.9, y: 1.95, z: -2.7, color: 0x101624 });
      dark.box(2.1, 0.42, 9.8, { y: 0.26, z: -5, color: 0x1a1e26 });
      for (let i = 0; i < 6; i++) for (const sx of [-1.105, 1.105]) lit.box(0.02, 0.32, 0.8, { x: sx, y: 1.86, z: -3.6 - i * 1.1, color: new THREE.Color(0.55, 0.95, 1) });
      for (const sx of [-1.1, 1.1]) lit.box(0.03, 0.07, 9.4, { x: sx, y: 0.98, z: -5, color: new THREE.Color(0.4, 0.9, 1) });
      for (const sx of [-0.55, 0.55]) lit.cyl(0.24, 0.24, 0.06, 16, { x: sx, y: 1.02, z: -0.42, rx: Math.PI / 2 - 0.35, color: new THREE.Color(1, 0.97, 0.85) });
      const nose = [body.build(), dark.build(), lit.build()];
      const b2 = new GB(), d2 = new GB(), l2 = new GB();
      b2.box(2.16, 2.0, 9.8, { y: 1.48, z: -5, color: 0xeef2f6 });
      d2.box(2.2, 0.55, 9.6, { y: 1.85, z: -5, color: 0x141a26 });
      d2.box(2.1, 0.42, 9.8, { y: 0.26, z: -5, color: 0x1a1e26 });
      for (let i = 0; i < 8; i++) for (const sx of [-1.105, 1.105]) l2.box(0.02, 0.32, 0.8, { x: sx, y: 1.86, z: -0.8 - i * 1.15, color: new THREE.Color(0.55, 0.95, 1) });
      for (const sx of [-1.1, 1.1]) l2.box(0.03, 0.07, 9.4, { x: sx, y: 0.98, z: -5, color: new THREE.Color(0.4, 0.9, 1) });
      for (const sx of [-0.7, 0.7]) l2.box(0.3, 0.16, 0.05, { x: sx, y: 1.0, z: -9.93, color: RED });
      const rear = [b2.build(), d2.build(), l2.build()];
      const mBody = bend(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.25, metalness: 0.35 }));
      const mDark = bend(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.15, metalness: 0.6 }));
      const mLit = bend(new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, color: new THREE.Color(3.2, 3.2, 3.2) }));
      this.beaconMat = bend(new THREE.MeshBasicMaterial({ toneMapped: false, color: new THREE.Color(4, 0.5, 0.3) }));
      const beaconGeo = new THREE.BoxGeometry(0.5, 0.18, 0.3);
      const beamMat = new THREE.ShaderMaterial({
        uniforms: { uBendY: BEND.y, uBendX: BEND.x, uI: { value: 1 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
        vertexShader: BEND_GLSL + /* glsl */`varying float vT; varying float vR; void main() { vT = uv.y; vR = uv.x; vec4 w = modelMatrix * vec4(position, 1.0); w.xyz = bendWorld(w.xyz); gl_Position = projectionMatrix * viewMatrix * w; }`,
        fragmentShader: /* glsl */`uniform float uI; varying float vT; varying float vR; void main() { float a = pow(vT, 1.6) * (0.5 + 0.5 * sin(vR * 6.2831 * 3.0) * 0.2) * 0.22 * uI; gl_FragColor = vec4(vec3(1.0, 0.95, 0.8) * a, a); }`,
      });
      const beamGeo = new THREE.ConeGeometry(2.6, 34, 24, 1, true);
      beamGeo.rotateX(-Math.PI / 2); // 锥尖朝 -z
      beamGeo.translate(0, 0, 17);
      for (let i = 0; i < 4; i++) {
        const grp = new THREE.Group();
        const cars = [];
        for (let k = 0; k < 3; k++) {
          const parts = k === 0 ? nose : rear;
          const cg = new THREE.Group();
          cg.add(new THREE.Mesh(parts[0], mBody), new THREE.Mesh(parts[1], mDark), new THREE.Mesh(parts[2], mLit));
          cg.position.z = -k * (CAR_LEN + CAR_GAP);
          cg.children.forEach((c) => (c.frustumCulled = false));
          grp.add(cg); cars.push(cg);
        }
        const beacon = new THREE.Mesh(beaconGeo, this.beaconMat); beacon.position.set(0, 2.55, -1.8); beacon.frustumCulled = false;
        const beam = new THREE.Mesh(beamGeo, beamMat); beam.position.set(0, 1.0, -0.2); beam.frustumCulled = false;
        const flare = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), glowMaterial(this.shuttleTex, 0xfff2d8, { size: 6.5, opacity: 1 }));
        flare.position.set(0, 1.05, 0.2); flare.frustumCulled = false;
        grp.add(beacon, beam, flare);
        grp.visible = false;
        scene.add(grp);
        this.shuttles.push({ grp, cars, flare, beam });
      }
    }
    // —— 道具 ——
    this.powTex = radialTex([[0, 'rgba(255,255,255,1)'], [0.25, 'rgba(255,255,255,.5)'], [1, 'rgba(255,255,255,0)']]);
    this.pows = [];
    const x2Tex = canvasTex(128, 128, (g) => {
      g.fillStyle = '#fff'; g.font = '900 86px "Cormorant Garamond", Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('×2', 64, 70);
    });
    const iconGeo = {
      magnet: (() => { const b = new GB(); b.add(new THREE.TorusGeometry(0.27, 0.085, 10, 24, Math.PI), { rz: Math.PI, y: 0.05, color: 0xffffff }); b.box(0.17, 0.16, 0.17, { x: -0.27, y: 0.12, color: new THREE.Color(1, 0.4, 0.35) }); b.box(0.17, 0.16, 0.17, { x: 0.27, y: 0.12, color: new THREE.Color(1, 0.4, 0.35) }); return b.build(); })(),
      shield: (() => { const b = new GB(); b.add(new THREE.IcosahedronGeometry(0.3, 0), { color: 0xffffff }); return b.build(); })(),
      jet: (() => { const b = new GB(); b.cyl(0.12, 0.14, 0.42, 12, { color: 0xffffff }); b.add(new THREE.ConeGeometry(0.12, 0.22, 12), { y: 0.32, color: 0xffffff }); for (const a of [0, 2.09, 4.19]) b.box(0.03, 0.16, 0.14, { x: Math.cos(a) * 0.14, z: Math.sin(a) * 0.14, y: -0.18, ry: -a, color: 0xffd0a0 }); return b.build(); })(),
    };
    const ringGeo = new THREE.TorusGeometry(0.62, 0.035, 8, 48);
    for (let i = 0; i < 6; i++) {
      const grp = new THREE.Group();
      const icons = {};
      for (const t of ['magnet', 'shield', 'jet', 'double']) {
        let mesh;
        if (t === 'double') mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.7), bend(new THREE.MeshBasicMaterial({ map: x2Tex, transparent: true, toneMapped: false, color: new THREE.Color(3, 3, 3), side: THREE.DoubleSide, depthWrite: false })));
        else mesh = new THREE.Mesh(iconGeo[t], bend(new THREE.MeshBasicMaterial({ toneMapped: false, vertexColors: true, color: new THREE.Color(2.4, 2.4, 2.4), wireframe: t === 'shield' })));
        mesh.frustumCulled = false;
        grp.add(mesh); icons[t] = mesh;
      }
      const ringMat = bend(new THREE.MeshBasicMaterial({ toneMapped: false, color: new THREE.Color(2, 2, 2) }));
      const r1 = new THREE.Mesh(ringGeo, ringMat), r2 = new THREE.Mesh(ringGeo, ringMat);
      r1.frustumCulled = r2.frustumCulled = false;
      const halo = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), glowMaterial(this.powTex, 0xffffff, { size: 2.6, opacity: 0.7 }));
      halo.frustumCulled = false;
      grp.add(r1, r2, halo);
      grp.visible = false;
      scene.add(grp);
      this.pows.push({ grp, icons, ringMat, r1, r2, halo });
    }
    // —— 星尘 ——
    {
      const b = new GB();
      const oct = new THREE.OctahedronGeometry(0.27, 0);
      b.add(oct, { sy: 1.4, color: 0xffffff });
      const geo = b.build();
      const col = geo.attributes.color;
      for (let i = 0; i < col.count; i++) { const f = Math.floor(i / 3) % 2 ? 1.0 : 0.62; col.setXYZ(i, f, f * 0.92, f * 0.75); }
      this.moteMat = bend(new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, color: new THREE.Color('#ffc65a').multiplyScalar(2.6) }));
      this.motes = new THREE.InstancedMesh(geo, this.moteMat, 700);
      this.motes.frustumCulled = false; this.motes.count = 0;
      scene.add(this.motes);
      this.moteHaloMat = glowMaterial(this.powTex, 0xffb547, { size: 0.8, opacity: 0.26 });
      this.moteHalo = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), this.moteHaloMat, 700);
      this.moteHalo.frustumCulled = false; this.moteHalo.count = 0;
      scene.add(this.moteHalo);
    }
  }

  // 每帧：根据模拟状态摆放所有可见物体
  sync(sim, dist, time) {
    const far = dist + VIEW_AHEAD, near = dist - 16;
    this.barrier.begin(); this.gantry.begin(); this.gantryWide.begin(); this.cont.begin(); this.car.begin(); this.ramp.begin();
    let si = 0;
    const gaps = this._gaps || (this._gaps = []);
    gaps.length = 0;
    const warn = this._warn || (this._warn = [0, 0, 0]);
    warn[0] = warn[1] = warn[2] = 0;
    for (const ch of sim.chunks) {
      if (ch.s0 > far + 130 || ch.s0 + ch.len < near - 80) continue;
      for (const f of ch.feats) {
        if (f.dead) continue;
        if (f.t === ONCOMING) {
          const fr = sim.oncFront(f, dist);
          if (fr > dist + 175 || fr + f.Lt < dist - 20) continue;
          const S = this.shuttles[si++];
          if (!S) continue;
          S.grp.visible = true;
          S.grp.position.set(LANE_X[f.lane], 0, dist - fr);
          for (let k = 0; k < 3; k++) S.cars[k].visible = k < f.cars;
          const close = 1 - Math.min(1, Math.max(0, (fr - dist) / 160));
          warn[f.lane] = Math.max(warn[f.lane], fr > dist - 2 ? 0.35 + close * 0.65 : 0);
          // 车头离玩家（镜头）很近时，大光晕与光锥淡出，避免整屏泛白
          const nearFade = Math.min(1, Math.max(0, (fr - dist - 6) / 30));
          S.beam.material.uniforms.uI.value = (0.6 + close * 0.6) * nearFade;
          S.flare.material.uniforms.uOpacity.value = nearFade;
          S.beam.visible = nearFade > 0.01;
          continue;
        }
        if (f.s0 > far || f.s1 < near - (f.t === TRAIN ? 0 : 0)) continue;
        if (f.t === GAP) { gaps.push(f); continue; }
        const z0 = dist - f.s0;
        if (f.t === BARRIER) {
          for (let l = 0; l < 3; l++) if (f.mask & (1 << l)) { _m.makeTranslation(LANE_X[l], 0, dist - (f.s0 + f.s1) / 2); this.barrier.push(_m); }
        } else if (f.t === GANTRY) {
          _m.makeTranslation(f.wide ? 0 : LANE_X[f.lane], 0, dist - (f.s0 + f.s1) / 2);
          (f.wide ? this.gantryWide : this.gantry).push(_m);
        } else if (f.t === BLOCK) {
          _m.makeScale(1, 1, f.len); _m.setPosition(LANE_X[f.lane], 0, z0);
          this.cont.push(_m, CONT_COLORS[f.var % CONT_COLORS.length]);
        } else if (f.t === TRAIN) {
          const base = CAR_COLORS[f.var % CAR_COLORS.length];
          for (let k = 0; k < f.cars; k++) {
            const cs = f.s0 + k * (CAR_LEN + CAR_GAP);
            if (cs > far || cs + CAR_LEN < near) continue;
            _m.makeTranslation(LANE_X[f.lane], 0, dist - cs);
            _c.copy(base).multiplyScalar(k % 2 ? 0.86 : 1.0);
            this.car.push(_m, _c);
          }
          if (f.ramp) { _m.makeTranslation(LANE_X[f.lane], 0, dist - (f.s0 - RAMP_LEN)); this.ramp.push(_m); }
        }
      }
    }
    for (; si < this.shuttles.length; si++) this.shuttles[si].grp.visible = false;
    this.barrier.end(); this.gantry.end(); this.gantryWide.end(); this.cont.end(); this.car.end(); this.ramp.end();
    const blink = 0.35 + 0.65 * (Math.sin(time * 7) > 0 ? 1 : 0.15);
    this.blinkMat.color.setRGB(3 * blink, 3 * blink, 3 * blink);
    this.beaconMat.color.setRGB(Math.sin(time * 14) > 0 ? 5 : 0.4, 0.5, 0.3);
    this.glowMat.color.setScalar(1.7);

    // 星尘
    let n = 0;
    const lists = sim.chunks.map((c) => c.motes);
    if (sim.sky.motes.length) lists.push(sim.sky.motes);
    for (const ms of lists) {
      for (let i = 0; i < ms.length && n < 700; i++) {
        const m = ms[i];
        if (!m.alive) continue;
        if (m.s < dist - 2.6 && !(m.home > 0)) continue; // 错过的星尘越过小轨后就收起，不在镜头前放大
        if (m.s > far) break;
        const ph = m.s * 0.37;
        _e.set(0, time * 2.6 + ph, 0); _q.setFromEuler(_e);
        _p.set(m.x, m.y + Math.sin(time * 3 + ph) * 0.07, dist - m.s);
        const passed = m.home > 0 ? 1 : Math.min(1, Math.max(0, (m.s - dist + 2.6) / 2.6));
        const sc = (m.home > 0 ? 1 - Math.min(1, m.home) * 0.6 : 1) * passed;
        _s.set(sc, sc, sc);
        _m.compose(_p, _q, _s);
        this.motes.setMatrixAt(n, _m);
        this.moteHalo.setMatrixAt(n, _m);
        n++;
      }
    }
    this.motes.count = this.moteHalo.count = n;
    this.motes.instanceMatrix.needsUpdate = this.moteHalo.instanceMatrix.needsUpdate = true;
    const dbl = sim.pw && sim.pw.double > 0;
    this.moteMat.color.set(dbl ? '#ff8ae0' : '#ffc65a').multiplyScalar(2.6);
    this.moteHaloMat.uniforms.uColor.value.set(dbl ? '#ff6fd8' : '#ffb547');

    // 道具
    let pi = 0;
    for (const ch of sim.chunks) for (const w of ch.pows) {
      if (!w.alive || w.s < near || w.s > far) continue;
      const P = this.pows[pi++];
      if (!P) break;
      P.grp.visible = true;
      P.grp.position.set(w.x, w.y + Math.sin(time * 2.4 + w.s) * 0.12, dist - w.s);
      const col = POW_COL[w.type];
      for (const k in P.icons) P.icons[k].visible = k === w.type;
      P.icons[w.type].rotation.y = time * 2.2;
      P.ringMat.color.copy(col).multiplyScalar(2.2);
      P.icons[w.type].material.color.copy(col).multiplyScalar(w.type === 'double' ? 3 : 2.2);
      P.halo.material.uniforms.uColor.value.copy(col);
      P.r1.rotation.set(time * 1.3, time * 0.7, 0);
      P.r2.rotation.set(-time * 0.9 + 1.2, 0, time * 1.1);
    }
    for (; pi < this.pows.length; pi++) this.pows[pi].grp.visible = false;
    return { gaps, warn };
  }
}

const POW_COL = {
  magnet: new THREE.Color('#6fc8ff'), shield: new THREE.Color('#5ff2c4'), jet: new THREE.Color('#ff9a4a'), double: new THREE.Color('#ff6fd8'),
};
