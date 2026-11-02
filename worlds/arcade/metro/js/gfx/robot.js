// 星环列车 · 小轨：原创的快递机器人（程序建模 + 程序动画）
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { canvasTex, radialTex } from './util.js';

const TAU = Math.PI * 2;
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));

function eyesTexture() {
  // 4 帧表情：普通、开心(^ ^)、受伤(x x)、专注(> <)
  return canvasTex(512, 128, (g) => {
    g.clearRect(0, 0, 512, 128);
    g.fillStyle = '#fff'; g.strokeStyle = '#fff'; g.lineCap = 'round'; g.lineJoin = 'round';
    const rr = (x, y, w, h, r) => { g.beginPath(); g.roundRect(x, y, w, h, r); g.fill(); };
    // 普通
    rr(22, 30, 30, 56, 15); rr(76, 30, 30, 56, 15);
    // 开心
    g.lineWidth = 13;
    for (const cx of [128 + 37, 128 + 91]) { g.beginPath(); g.arc(cx, 76, 20, Math.PI * 1.1, Math.PI * 1.9); g.stroke(); }
    // 受伤
    g.lineWidth = 12;
    for (const cx of [256 + 37, 256 + 91]) { g.beginPath(); g.moveTo(cx - 15, 44); g.lineTo(cx + 15, 80); g.moveTo(cx + 15, 44); g.lineTo(cx - 15, 80); g.stroke(); }
    // 专注
    g.lineWidth = 12;
    g.beginPath(); g.moveTo(384 + 24, 44); g.lineTo(384 + 50, 62); g.lineTo(384 + 24, 80); g.stroke();
    g.beginPath(); g.moveTo(384 + 104, 44); g.lineTo(384 + 78, 62); g.lineTo(384 + 104, 80); g.stroke();
  }, { mip: false });
}

export class Robot {
  constructor(scene) {
    this.root = new THREE.Group();
    scene.add(this.root);
    this.pivot = new THREE.Group(); // 翻滚 / 倾斜的轴心（身体中心）
    this.pivot.position.y = 0.78;
    this.root.add(this.pivot);
    this.body = new THREE.Group();
    this.body.position.y = -0.78;
    this.pivot.add(this.body);

    const shell = new THREE.MeshStandardMaterial({ color: 0xf3eee6, roughness: 0.32, metalness: 0.08, emissive: 0x000000 });
    const joint = new THREE.MeshStandardMaterial({ color: 0x2a2f3a, roughness: 0.5, metalness: 0.5 });
    const visor = new THREE.MeshStandardMaterial({ color: 0x0b0f18, roughness: 0.12, metalness: 0.7 });
    const box = new THREE.MeshStandardMaterial({ color: 0xc8935a, roughness: 0.7, metalness: 0.0 });
    this.accent = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffb547').multiplyScalar(2.2), toneMapped: false });
    this.shellMat = shell;
    const M = (geo, mat, x = 0, y = 0, z = 0, parent = this.body) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; };

    // 躯干
    M(new RoundedBoxGeometry(0.56, 0.46, 0.42, 4, 0.14), shell, 0, 0.74, 0);
    M(new THREE.TorusGeometry(0.255, 0.028, 8, 32), this.accent, 0, 0.6, 0).rotation.x = Math.PI / 2;
    M(new THREE.CylinderGeometry(0.06, 0.06, 0.04, 16), this.accent, 0, 0.8, -0.215).rotation.x = Math.PI / 2;
    M(new THREE.CylinderGeometry(0.12, 0.14, 0.12, 16), joint, 0, 0.98, 0);
    // 头
    this.head = new THREE.Group(); this.head.position.set(0, 1.22, 0); this.body.add(this.head);
    M(new RoundedBoxGeometry(0.8, 0.6, 0.66, 5, 0.2), shell, 0, 0, 0, this.head);
    M(new RoundedBoxGeometry(0.66, 0.42, 0.06, 3, 0.03), visor, 0, -0.01, -0.315, this.head);
    this.eyesTex = eyesTexture();
    this.eyesTex.repeat.set(0.25, 1);
    this.eyeMat = new THREE.MeshBasicMaterial({ map: this.eyesTex, transparent: true, color: new THREE.Color('#7fe8ff').multiplyScalar(2.4), toneMapped: false, depthWrite: false });
    this.eyes = M(new THREE.PlaneGeometry(0.5, 0.125 * 4 * 0.5 / 1), this.eyeMat, 0, -0.01, -0.35, this.head);
    this.eyes.scale.set(1, 0.5, 1);
    this.eyes.rotation.y = Math.PI;
    for (const sx of [-0.41, 0.41]) {
      M(new THREE.CylinderGeometry(0.1, 0.1, 0.06, 16), joint, sx, 0.02, 0, this.head).rotation.z = Math.PI / 2;
      M(new THREE.TorusGeometry(0.075, 0.018, 6, 20), this.accent, sx + Math.sign(sx) * 0.035, 0.02, 0, this.head).rotation.y = Math.PI / 2;
    }
    // 天线（弹簧摆动）
    this.ant = new THREE.Group(); this.ant.position.set(0.12, 0.3, 0.05); this.head.add(this.ant);
    M(new THREE.CylinderGeometry(0.014, 0.018, 0.34, 6), joint, 0, 0.17, 0, this.ant);
    this.tipMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffb547').multiplyScalar(3), toneMapped: false });
    this.tip = M(new THREE.SphereGeometry(0.055, 12, 8), this.tipMat, 0, 0.36, 0, this.ant);
    this.antV = new THREE.Vector2(); this.antA = new THREE.Vector2();
    // 背包（包裹 + 推进器）
    this.pack = new THREE.Group(); this.pack.position.set(0, 0.78, 0.29); this.body.add(this.pack);
    M(new RoundedBoxGeometry(0.5, 0.46, 0.26, 3, 0.05), box, 0, 0, 0, this.pack);
    M(new THREE.BoxGeometry(0.06, 0.47, 0.27), this.accent, 0, 0, 0, this.pack);
    M(new THREE.BoxGeometry(0.51, 0.05, 0.27), this.accent, 0, 0.06, 0, this.pack);
    this.packLogo = M(new THREE.TorusGeometry(0.075, 0.016, 6, 24), this.accent, 0.15, -0.12, 0.135, this.pack);
    this.nozzles = [];
    for (const sx of [-0.15, 0.15]) {
      M(new THREE.CylinderGeometry(0.06, 0.08, 0.12, 12), joint, sx, -0.28, 0, this.pack);
      const fl = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.55, 12, 1, true), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffb070').multiplyScalar(3), transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
      fl.rotation.x = Math.PI; fl.position.set(sx, -0.6, 0); fl.visible = false;
      this.pack.add(fl); this.nozzles.push(fl);
    }
    // 手臂
    this.arms = [];
    for (const sx of [-1, 1]) {
      const a = new THREE.Group(); a.position.set(sx * 0.33, 0.88, 0); this.body.add(a);
      M(new THREE.SphereGeometry(0.075, 12, 8), joint, 0, 0, 0, a);
      M(new THREE.CapsuleGeometry(0.06, 0.2, 4, 8), shell, sx * 0.02, -0.16, 0, a);
      M(new THREE.SphereGeometry(0.075, 12, 8), shell, sx * 0.02, -0.3, 0, a);
      this.arms.push(a);
    }
    // 腿
    this.legs = [];
    for (const sx of [-1, 1]) {
      const l = new THREE.Group(); l.position.set(sx * 0.14, 0.5, 0); this.body.add(l);
      M(new THREE.CapsuleGeometry(0.07, 0.24, 4, 8), joint, 0, -0.18, 0, l);
      const foot = M(new RoundedBoxGeometry(0.17, 0.12, 0.27, 3, 0.05), shell, 0, -0.42, -0.03, l);
      M(new THREE.BoxGeometry(0.16, 0.025, 0.25), this.accent, 0, -0.06, 0, foot);
      this.legs.push(l);
    }
    this.body.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });

    // 影子
    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.4), new THREE.MeshBasicMaterial({
      map: radialTex([[0, 'rgba(0,0,0,.62)'], [0.55, 'rgba(0,0,0,.28)'], [1, 'rgba(0,0,0,0)']]), transparent: true, depthWrite: false, toneMapped: false,
    }));
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.renderOrder = 2;
    scene.add(this.shadow);

    // 护盾
    this.shieldU = { uTime: { value: 0 }, uA: { value: 0 }, uCol: { value: new THREE.Color('#5ff2c4') } };
    this.shield = new THREE.Mesh(new THREE.IcosahedronGeometry(1.08, 4), new THREE.ShaderMaterial({
      uniforms: this.shieldU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */`varying vec3 vN; varying vec3 vV; varying vec3 vP; void main() { vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.0); vV = normalize(-mv.xyz); vP = position; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: /* glsl */`
        uniform float uTime, uA; uniform vec3 uCol; varying vec3 vN; varying vec3 vV; varying vec3 vP;
        void main() {
          float f = pow(1.0 - abs(dot(vN, vV)), 2.2);
          vec3 p = vP * 7.0;
          float hex = abs(fract(p.x + p.y * 0.5) - 0.5) + abs(fract(p.y - p.z * 0.3) - 0.5) + abs(fract(p.z + p.x * 0.4) - 0.5);
          float grid = smoothstep(0.08, 0.0, abs(hex - 0.75)) * 0.6;
          float scan = smoothstep(0.0, 0.05, abs(fract(vP.y * 0.8 - uTime * 0.6) - 0.5) - 0.44) * 0.0 + pow(max(0.0, sin(vP.y * 3.0 - uTime * 4.0)), 18.0) * 0.6;
          float a = (f * 0.9 + grid * (0.25 + f) + scan * 0.4 + 0.04) * uA;
          gl_FragColor = vec4(uCol * a, a);
        }`,
    }));
    this.shield.position.y = 0.8;
    this.root.add(this.shield);
    this.shield.visible = false;
    // 磁吸光环
    this.magMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#6fc8ff').multiplyScalar(2.6), toneMapped: false, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
    this.mag = new THREE.Group();
    for (let i = 0; i < 2; i++) {
      const r = new THREE.Mesh(new THREE.TorusGeometry(0.85 + i * 0.12, 0.022, 6, 64), this.magMat);
      r.rotation.x = Math.PI / 2 + (i ? 0.35 : -0.25);
      this.mag.add(r);
    }
    this.mag.position.y = 0.75;
    this.root.add(this.mag);
    this.mag.visible = false;

    // 光带拖尾
    this.TN = 44;
    this.trailPts = [];
    const tpos = new Float32Array(this.TN * 2 * 3), tuv = new Float32Array(this.TN * 2 * 2);
    const idx = [];
    for (let i = 0; i < this.TN; i++) {
      tuv.set([0, i / (this.TN - 1), 1, i / (this.TN - 1)], i * 4);
      if (i < this.TN - 1) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.BufferAttribute(tpos, 3));
    tg.setAttribute('uv', new THREE.BufferAttribute(tuv, 2));
    tg.setIndex(idx);
    this.trailU = { uCol: { value: new THREE.Color('#ffb547') }, uA: { value: 1 } };
    this.trail = new THREE.Mesh(tg, new THREE.ShaderMaterial({
      uniforms: this.trailU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      vertexShader: /* glsl */`varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */`uniform vec3 uCol; uniform float uA; varying vec2 vUv;
        void main() { float t = 1.0 - vUv.y; float edge = 1.0 - pow(abs(vUv.x - 0.5) * 2.0, 2.0); float a = t * t * edge * uA; gl_FragColor = vec4(uCol * a * 2.2, a); }`,
    }));
    this.trail.frustumCulled = false;
    scene.add(this.trail);

    // 动画状态
    this.phase = 0; this.t = 0; this.blinkT = 2; this.expr = 0; this.exprT = 0;
    this.sq = new THREE.Vector3(1, 1, 1); this.sqV = new THREE.Vector3();
    this.lean = 0; this.yaw = 0; this.flip = 0; this.flipOn = false;
    this.slideW = 0; this.jetW = 0; this.airW = 0; this.crashT = -1; this.stumbleT = 0;
    this.lastX = 0; this.vx = 0; this.lastY = 0;
  }

  setExpr(i, dur = 0.8) { this.expr = i; this.exprT = dur; }
  squash(sx, sy) { this.sq.set(sx, sy, sx); }

  // st: { x, y, floor, dist, speed, grounded, sliding, jet, airT, flip, mode, shield, magnet, double, inv, stumble, idle }
  update(dt, st) {
    this.t += dt;
    const R = this.root;
    R.position.set(st.x, st.y, 0);
    const vx = (st.x - this.lastX) / Math.max(dt, 1e-4); this.lastX = st.x;
    const vy = (st.y - this.lastY) / Math.max(dt, 1e-4); this.lastY = st.y;
    this.vx = damp(this.vx, vx, 14, dt);

    // 表情与眨眼
    this.exprT -= dt;
    let ex = this.exprT > 0 ? this.expr : (st.mode === 'dying' || st.mode === 'dead' ? 2 : 0);
    this.eyesTex.offset.x = ex * 0.25;
    this.blinkT -= dt;
    let blink = 1;
    if (this.blinkT < 0.12) blink = Math.abs(this.blinkT - 0.06) / 0.06;
    if (this.blinkT < 0) this.blinkT = 2 + Math.random() * 3;
    this.eyes.scale.y = 0.5 * (ex === 0 ? Math.max(0.12, blink) : 1);

    const crashing = st.mode === 'dying' || st.mode === 'dead';
    // 姿态权重
    this.slideW = damp(this.slideW, st.sliding && !crashing ? 1 : 0, 16, dt);
    this.jetW = damp(this.jetW, st.jet ? 1 : 0, 6, dt);
    this.airW = damp(this.airW, !st.grounded && !st.jet && !crashing ? 1 : 0, 12, dt);
    const runRate = st.idle ? 0 : clamp(st.speed / 7.5, 0.6, 3.4);
    this.phase += dt * runRate * TAU * (st.grounded ? 1 : 0.25);
    const ph = this.phase;
    const sp = Math.sin(ph), cp = Math.cos(ph);

    // 腿 / 手臂
    const run = (1 - this.slideW) * (1 - this.airW) * (1 - this.jetW) * (st.idle ? 0 : 1);
    const idle = st.idle ? 1 : 0;
    const [lL, lR] = this.legs, [aL, aR] = this.arms;
    lL.rotation.x = sp * 0.95 * run - 1.25 * this.airW * (0.6 + 0.4 * Math.sin(this.t * 4)) - 1.35 * this.slideW + Math.sin(this.t * 5) * 0.25 * this.jetW;
    lR.rotation.x = -sp * 0.95 * run - 0.7 * this.airW - 1.35 * this.slideW - Math.sin(this.t * 5 + 1) * 0.25 * this.jetW;
    aL.rotation.x = -sp * 0.85 * run - 2.4 * this.airW + 0.8 * this.jetW + Math.sin(this.t * 1.7) * 0.05 * idle;
    aR.rotation.x = sp * 0.85 * run - 2.1 * this.airW + 0.8 * this.jetW + Math.sin(this.t * 1.7 + 1) * 0.05 * idle;
    aL.rotation.z = -0.15 - 0.9 * this.slideW - 0.35 * this.jetW - 0.25 * this.airW;
    aR.rotation.z = 0.15 + 0.9 * this.slideW + 0.35 * this.jetW + 0.25 * this.airW;
    if (st.idle && Math.sin(this.t * 0.7) > 0.93) aR.rotation.z = 2.4 + Math.sin(this.t * 14) * 0.35; // 挥手

    // 身体：起伏、前倾、侧倾
    const bob = Math.abs(sp) * 0.07 * run + Math.sin(this.t * 2.2) * 0.012 * idle;
    this.body.position.y = -0.78 + bob - 0.36 * this.slideW;
    const targetLean = clamp(-this.vx * 0.055, -0.45, 0.45);
    this.lean = damp(this.lean, targetLean, 12, dt);
    this.yaw = damp(this.yaw, clamp(-this.vx * 0.02, -0.25, 0.25), 10, dt);
    // 翻转
    if (st.flipStart) { this.flipOn = true; this.flip = 0; }
    if (this.flipOn) {
      this.flip += dt / Math.max(0.3, st.airT || 0.58);
      if (this.flip >= 1 || st.grounded) { this.flipOn = false; this.flip = 0; }
    }
    let pitch = 0.13 * run - 0.95 * this.slideW * -1 - 0.32 * this.jetW + 0.1 * this.airW;
    pitch = 0.13 * run + 0.95 * this.slideW - 0.38 * this.jetW + 0.08 * this.airW;
    let roll = this.lean;
    // 踉跄
    if (st.stumble > 0) { roll += Math.sin(this.t * 30) * 0.25 * Math.min(1, st.stumble); }
    // 撞车翻滚
    if (crashing) {
      if (this.crashT < 0) this.crashT = 0;
      this.crashT += dt;
      const c = this.crashT;
      pitch = Math.min(1, c * 2.2) * 1.5 + Math.sin(c * 9) * 0.1 * Math.exp(-c * 3);
      roll = Math.sin(c * 7) * 0.4 * Math.exp(-c * 2);
      this.body.position.y = -0.78 - Math.min(0.4, c * 1.2);
    } else this.crashT = -1;
    this.pivot.rotation.set(pitch - (this.flipOn ? this.flip * TAU : 0), this.yaw + (st.idle ? Math.sin(this.t * 0.4) * 0.35 : 0), roll);
    this.head.rotation.set(-0.06 * run + Math.sin(this.t * 1.1) * 0.05 * idle, Math.sin(this.t * 0.6) * 0.4 * idle - this.vx * 0.015, 0);

    // 挤压拉伸（弹簧）
    const k = 220, d = 18;
    this.sqV.x += ((1 - this.sq.x) * k - this.sqV.x * d) * dt; this.sq.x += this.sqV.x * dt;
    this.sqV.y += ((1 - this.sq.y) * k - this.sqV.y * d) * dt; this.sq.y += this.sqV.y * dt;
    this.sq.z = this.sq.x;
    this.pivot.scale.copy(this.sq);

    // 天线弹簧（受竖直 / 横向加速度驱动）
    this.antA.set(-vx * 0.0015 - this.ant.rotation.z * 60, -vy * 0.004 - this.ant.rotation.x * 60);
    this.antV.addScaledVector(this.antA, dt * 1).multiplyScalar(Math.exp(-6 * dt));
    this.ant.rotation.z = clamp(this.ant.rotation.z + this.antV.x * dt * 8, -0.7, 0.7);
    this.ant.rotation.x = clamp(this.ant.rotation.x + this.antV.y * dt * 8, -0.7, 0.7);
    this.tipMat.color.set(st.double ? '#ff6fd8' : st.magnet ? '#6fc8ff' : '#ffb547').multiplyScalar(2.6 + Math.sin(this.t * 6) * 0.6);

    // 喷射火焰
    for (const n of this.nozzles) {
      n.visible = this.jetW > 0.05;
      n.scale.set(1, (0.7 + Math.random() * 0.6) * this.jetW, 1);
      n.material.opacity = 0.85 * this.jetW;
    }

    // 无敌闪烁 / 踉跄发红
    const flick = st.inv > 0 && !st.jet ? (Math.sin(this.t * 40) > 0 ? 1 : 0.35) : 1;
    this.body.visible = flick > 0.5 || st.inv <= 0;
    this.shellMat.emissive.setRGB(st.stumble > 0 ? 0.35 * Math.max(0, Math.sin(this.t * 20)) : 0, 0, 0);

    // 护盾 / 磁吸
    this.shield.visible = st.shield > 0;
    if (st.shield > 0) {
      this.shieldU.uTime.value = this.t;
      const warnS = st.shield < 3 ? (Math.sin(this.t * 18) > 0 ? 1 : 0.3) : 1;
      this.shieldU.uA.value = 0.85 * warnS;
      this.shield.rotation.y = this.t * 0.6;
      this.shield.scale.setScalar(1 + Math.sin(this.t * 5) * 0.015);
    }
    this.mag.visible = st.magnet > 0;
    if (st.magnet > 0) { this.mag.rotation.y = this.t * 3.2; this.magMat.opacity = st.magnet < 2.5 ? (Math.sin(this.t * 18) > 0 ? 0.9 : 0.3) : 0.9; }

    // 影子
    const h = Math.max(0, st.y - (st.floor ?? 0));
    const fl = st.floor === -Infinity || st.floor == null ? -10 : st.floor;
    this.shadow.visible = fl > -5 && !crashing;
    this.shadow.position.set(st.x, fl + 0.03, 0.05);
    const ss = clamp(1 - h * 0.12, 0.35, 1) * (1 - this.slideW * 0.1);
    this.shadow.scale.set(ss * 1.1, ss, 1);
    this.shadow.material.opacity = clamp(1 - h * 0.15, 0.2, 1);

    // 拖尾：记录背包位置（轨道坐标）
    const pts = this.trailPts;
    const wp = this.pack.getWorldPosition(this._tmp || (this._tmp = new THREE.Vector3()));
    if (!st.idle) {
      pts.unshift({ x: wp.x, y: wp.y - 0.05, s: st.dist });
      if (pts.length > this.TN) pts.length = this.TN;
    } else pts.length = 0;
    const pos = this.trail.geometry.attributes.position;
    const w0 = 0.2 + 0.12 * this.jetW;
    for (let i = 0; i < this.TN; i++) {
      const p = pts[Math.min(i, pts.length - 1)] || { x: st.x, y: st.y + 0.8, s: st.dist };
      const z = st.dist - p.s + 0.32;
      const w = w0 * (1 - i / this.TN);
      pos.setXYZ(i * 2, p.x - w, p.y, z);
      pos.setXYZ(i * 2 + 1, p.x + w, p.y, z);
    }
    pos.needsUpdate = true;
    this.trailU.uCol.value.set(st.double ? '#ff6fd8' : st.jet ? '#ff9a4a' : st.magnet ? '#6fc8ff' : '#ffb547');
    this.trailU.uA.value = st.idle || crashing ? 0 : clamp(st.speed / 18, 0.3, 1) * (0.55 + 0.45 * this.jetW);
  }
}
