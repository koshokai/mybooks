// 星环列车 · 环境装饰：小行星、全息广告牌、信标塔、远处的平行轨道、太空尘埃
import * as THREE from 'three';
import { GB, bend, canvasTex, BEND_GLSL, BEND } from './util.js';
import { MIX } from './biomes.js';
import { DECK_HW } from '../config.js';

const MSGS = [
  ['星环货运', '第七环线 · RING LINE 07'],
  ['小心迎面穿梭车', '看到红色箭头请立即变道'],
  ['星尘包裹', '准时必达 · 使命必达'],
  ['货运优先', '限速 ∞ · 请勿停留'],
  ['欢迎来到夜侧', '城市灯火正在你的脚下'],
  ['碎星带', '注意落石 · ASTEROID ZONE'],
  ['极光区', '磁暴活跃 · 请保持微笑'],
  ['小轨加油', '你已经跑得比彗星还快啦'],
  ['距离补给站', '三万两千公里'],
  ['晨昏线', '白昼与黑夜在此交接'],
];

export class Decor {
  constructor(scene) {
    this.scene = scene;
    const R = Math.random;
    // —— 小行星 ——
    {
      const geo = new THREE.IcosahedronGeometry(1, 2);
      const p = geo.attributes.position, v = new THREE.Vector3();
      const seedOff = [R() * 10, R() * 10, R() * 10];
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i);
        const n = Math.sin(v.x * 3.1 + seedOff[0]) * Math.sin(v.y * 2.7 + seedOff[1]) * Math.sin(v.z * 3.3 + seedOff[2]);
        v.multiplyScalar(1 + n * 0.28 + (Math.sin(v.x * 9 + v.y * 7) * 0.05));
        p.setXYZ(i, v.x, v.y * 0.8, v.z);
      }
      geo.computeVertexNormals();
      const mat = bend(new THREE.MeshStandardMaterial({ color: 0x8a7f86, roughness: 0.95, metalness: 0.05, flatShading: true }));
      this.AN = 46;
      this.rocks = new THREE.InstancedMesh(geo, mat, this.AN);
      this.rocks.frustumCulled = false;
      this.ad = [];
      for (let i = 0; i < this.AN; i++) this.ad.push(this.spawnRock({}, R() * 340 - 20));
      const col = new THREE.Color();
      for (let i = 0; i < this.AN; i++) { col.setHSL(0.02 + R() * 0.08, 0.15 + R() * 0.2, 0.35 + R() * 0.25); this.rocks.setColorAt(i, col); }
      scene.add(this.rocks);
      this.rockW = 0;
    }
    // —— 全息广告牌 ——
    this.msgTex = MSGS.map(([a, b]) => canvasTex(1024, 256, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      g.fillStyle = 'rgba(255,255,255,.08)'; g.fillRect(0, 0, w, h);
      g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = 6; g.strokeRect(8, 8, w - 16, h - 16);
      g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = '900 104px "Noto Serif SC", "Songti SC", serif'; g.fillText(a, w / 2, h * 0.42);
      g.font = '600 40px "Noto Serif SC", "Cormorant Garamond", serif'; g.fillText(b, w / 2, h * 0.8);
    }));
    this.boards = [];
    const bMat = (tex) => new THREE.ShaderMaterial({
      uniforms: { uMap: { value: tex }, uTime: { value: 0 }, uCol: { value: new THREE.Color('#7fe8ff') }, uA: { value: 1 }, uBendY: BEND.y, uBendX: BEND.x },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      vertexShader: BEND_GLSL + /* glsl */`varying vec2 vUv; void main() { vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); w.xyz = bendWorld(w.xyz); gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: /* glsl */`
        uniform sampler2D uMap; uniform float uTime, uA; uniform vec3 uCol; varying vec2 vUv;
        void main() {
          vec4 t = texture2D(uMap, vUv);
          float scan = 0.75 + 0.25 * sin(vUv.y * 160.0 - uTime * 6.0);
          float flick = 0.88 + 0.12 * sin(uTime * 37.0) * sin(uTime * 13.0);
          float a = t.a * scan * flick * uA;
          gl_FragColor = vec4(uCol * a * 1.8, a);
        }`,
    });
    const frame = new GB();
    frame.box(0.25, 9, 0.25, { x: -3.6, y: 0.5, color: 0x2a3040 });
    frame.box(0.25, 9, 0.25, { x: 3.6, y: 0.5, color: 0x2a3040 });
    frame.box(7.6, 0.18, 0.3, { y: 6.0, color: 0x2a3040 });
    frame.box(7.6, 0.18, 0.3, { y: 4.1, color: 0x2a3040 });
    const frameGeo = frame.build();
    const frameMat = bend(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.5 }));
    for (let i = 0; i < 3; i++) {
      const grp = new THREE.Group();
      const f = new THREE.Mesh(frameGeo, frameMat); f.frustumCulled = false;
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(7.2, 1.8), bMat(this.msgTex[i]));
      panel.position.y = 5.05; panel.frustumCulled = false;
      grp.add(f, panel);
      grp.visible = false;
      scene.add(grp);
      this.boards.push({ grp, panel, s: -1e9, side: 1 });
    }
    this.nextBoard = 120; this.boardSide = 1;

    // —— 信标塔（远处两侧，每 90 米） ——
    {
      const t = new GB(), gl = new GB();
      t.box(0.7, 26, 0.7, { y: -6, color: 0x2a3040 });
      t.box(2.4, 0.3, 2.4, { y: 7, color: 0x3a4252 });
      for (let k = 0; k < 6; k++) t.box(1.6, 0.12, 0.12, { y: -16 + k * 4, ry: k * 0.8, color: 0x3a4252 });
      gl.sphere(0.32, 10, 8, { y: 7.6, color: new THREE.Color(1, 0.2, 0.15) });
      gl.box(0.08, 18, 0.08, { x: 0.38, y: -4, color: new THREE.Color('#ffb547') });
      const tm = bend(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.5 }));
      this.towerGlow = bend(new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, color: new THREE.Color(3, 3, 3) }));
      const n = 8;
      this.towers = new THREE.InstancedMesh(t.build(), tm, n);
      this.towerLights = new THREE.InstancedMesh(gl.build(), this.towerGlow, n);
      const m = new THREE.Matrix4();
      for (let i = 0; i < n; i++) {
        const left = i % 2 === 0, k = Math.floor(i / 2);
        m.makeTranslation(left ? -15 : 17, 0, left ? 40 - k * 180 : -50 - k * 180);
        this.towers.setMatrixAt(i, m); this.towerLights.setMatrixAt(i, m);
      }
      this.towers.frustumCulled = this.towerLights.frustumCulled = false;
      this.towerGroup = new THREE.Group();
      this.towerGroup.add(this.towers, this.towerLights);
      scene.add(this.towerGroup);
    }

    // —— 远处的平行轨道与小列车 ——
    {
      this.lineMat = bend(new THREE.MeshBasicMaterial({ toneMapped: false, color: new THREE.Color(1.2, 1.2, 1.2) }));
      const lines = [[-46, -18], [64, 9], [-120, 26]];
      this.far = [];
      for (const [x, y] of lines) {
        const g = new THREE.BoxGeometry(0.9, 0.5, 700, 1, 1, 140);
        const mesh = new THREE.Mesh(g, this.lineMat);
        mesh.position.set(x, y, -300); mesh.frustumCulled = false;
        scene.add(mesh);
        const trains = [];
        for (let k = 0; k < 2; k++) {
          const tg = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.2, 26), bend(new THREE.MeshBasicMaterial({ toneMapped: false, color: new THREE.Color(2.2, 2.0, 1.6) })));
          tg.frustumCulled = false;
          scene.add(tg);
          trains.push({ mesh: tg, s: R() * 400, v: (R() < 0.5 ? -1 : 1) * (8 + R() * 22) });
        }
        this.far.push({ x, y, mesh, trains });
      }
    }

    // —— 太空尘埃 ——
    {
      const N = 520, pos = new Float32Array(N * 3), sz = new Float32Array(N);
      for (let i = 0; i < N; i++) {
        let x = (R() - 0.5) * 70; if (Math.abs(x) < 5) x += Math.sign(x || 1) * 5;
        pos[i * 3] = x; pos[i * 3 + 1] = -12 + R() * 34; pos[i * 3 + 2] = R() * 260; sz[i] = 0.5 + R() * 1.6;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('sz', new THREE.BufferAttribute(sz, 1));
      this.dustU = { uDist: { value: 0 }, uCol: { value: MIX.dust }, uPR: { value: 1 }, uA: { value: 0.6 } };
      this.dust = new THREE.Points(g, new THREE.ShaderMaterial({
        uniforms: this.dustU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        vertexShader: /* glsl */`
          attribute float sz; uniform float uDist, uPR; varying float vA;
          void main() {
            vec3 p = position; p.z = mod(p.z + uDist, 260.0) - 235.0;
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            vA = smoothstep(-235.0, -150.0, p.z) * (1.0 - smoothstep(-6.0, 12.0, p.z));
            gl_PointSize = sz * uPR * 26.0 / max(1.0, -mv.z) + 0.6;
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: /* glsl */`uniform vec3 uCol; uniform float uA; varying float vA; void main() { vec2 p = gl_PointCoord - 0.5; float a = exp(-dot(p, p) * 16.0) * vA * uA; gl_FragColor = vec4(uCol * a, a); }`,
      }));
      this.dust.frustumCulled = false;
      scene.add(this.dust);
    }
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._e = new THREE.Euler(); this._v = new THREE.Vector3(); this._s = new THREE.Vector3();
  }

  spawnRock(o, sOff) {
    const R = Math.random;
    const side = R() < 0.5 ? -1 : 1;
    o.x = side * (10 + Math.pow(R(), 0.7) * 70);
    o.y = -34 + R() * 62;
    if (Math.abs(o.x) < 18 && o.y > -6 && o.y < 12) o.y += 16;
    o.s = (this.lastDist || 0) + sOff;
    o.sc = 0.6 + Math.pow(R(), 2.5) * 7;
    o.rx = R() * 6; o.ry = R() * 6; o.vr = (R() - 0.5) * 0.8; o.vs = (R() - 0.5) * 3;
    return o;
  }

  update(dt, dist, time, speed) {
    this.lastDist = dist;
    // 小行星：随环境淡入
    this.rockW += (MIX.asteroids - this.rockW) * (1 - Math.exp(-dt * 1.5));
    this.rocks.visible = this.rockW > 0.01;
    if (this.rocks.visible) {
      for (let i = 0; i < this.AN; i++) {
        const a = this.ad[i];
        a.s += a.vs * dt;
        if (a.s < dist - 25) this.spawnRock(a, 300 + Math.random() * 40);
        a.rx += a.vr * dt; a.ry += a.vr * 0.7 * dt;
        this._e.set(a.rx, a.ry, 0); this._q.setFromEuler(this._e);
        const sc = a.sc * this.rockW;
        this._v.set(a.x, a.y, dist - a.s); this._s.set(sc, sc, sc);
        this._m.compose(this._v, this._q, this._s);
        this.rocks.setMatrixAt(i, this._m);
      }
      this.rocks.instanceMatrix.needsUpdate = true;
    }
    // 广告牌
    if (dist + 240 > this.nextBoard) {
      const b = this.boards.reduce((a, c) => (c.s < a.s ? c : a));
      b.s = this.nextBoard; b.side = this.boardSide; this.boardSide *= -1;
      b.panel.material.uniforms.uMap.value = this.msgTex[Math.floor(Math.random() * this.msgTex.length)];
      this.nextBoard += 190 + Math.random() * 120;
    }
    for (const b of this.boards) {
      const z = dist - b.s;
      b.grp.visible = z < 30 && z > -260;
      if (!b.grp.visible) continue;
      b.grp.position.set(b.side * (DECK_HW + 5.2), 0, z);
      b.grp.rotation.y = -b.side * 0.32;
      const u = b.panel.material.uniforms;
      u.uTime.value = time; u.uCol.value.copy(MIX.deckLine);
    }
    // 信标塔
    this.towerGroup.position.z = dist % 180;
    const bl = Math.sin(time * 3.2) > 0.6 ? 1 : 0.15;
    this.towerGlow.color.setRGB(3 * bl + 0.6, 3 * bl + 0.6, 3 * bl + 0.6);
    // 远处轨道
    this.lineMat.color.copy(MIX.deckGlow).multiplyScalar(0.9);
    for (const L of this.far) {
      for (const t of L.trains) {
        t.s += (t.v + speed) * dt * 0 + t.v * dt;
        let z = dist - t.s;
        if (z > 60) { t.s = dist + 380 + Math.random() * 200; z = dist - t.s; }
        if (z < -640) { t.s = dist - 40; z = dist - t.s; }
        t.mesh.position.set(L.x, L.y + 0.8, z);
      }
    }
    // 尘埃
    this.dustU.uDist.value = dist;
  }

  setPixelRatio(pr) { this.dustU.uPR.value = pr; }
}
