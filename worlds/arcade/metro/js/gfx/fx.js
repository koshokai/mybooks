// 星环列车 · 粒子与速度线
import * as THREE from 'three';
import { BEND_GLSL, BEND } from './util.js';

const KINDS = {
  //          n   life  size  spd   up   drag grav anchor  colors
  mote:    [7, 0.45, 0.2, 4.2, 1.5, 3.0, 0, 0.92, ['#ffe39a', '#ffb547', '#ffffff']],
  moteX:   [8, 0.5, 0.22, 4.6, 1.5, 3.0, 0, 0.92, ['#ffb0f0', '#ff6fd8', '#ffffff']],
  spark:   [2, 0.32, 0.12, 3.2, 2.5, 1.5, -14, 0.0, ['#fff2c0', '#ffb547', '#ff7a3a']],
  dust:    [14, 0.55, 0.55, 3.4, 0.6, 5.0, 0, 0.7, ['#9fb0d0', '#c0c8e0', '#7a88a8']],
  flame:   [3, 0.26, 0.32, 1.2, -5.5, 2.0, 0, 0.75, ['#fff0b0', '#ffb05a', '#ff5a2a']],
  shard:   [40, 0.8, 0.22, 9.0, 3, 2.2, -10, 0.85, ['#c8fff0', '#5ff2c4', '#ffffff']],
  boom:    [60, 0.95, 0.5, 9.5, 4, 2.6, -9, 0.0, ['#ffffff', '#ffd37a', '#ff7a3a', '#ff4a2a']],
  power:   [36, 0.7, 0.28, 7.0, 0, 3.2, 0, 0.95, ['#ffffff']],
  smash:   [50, 0.9, 0.35, 11, 5, 2.0, -12, 0.2, ['#ffffff', '#ffd37a', '#9fdcff']],
  revive:  [70, 1.1, 0.32, 8, 2, 2.2, 0, 0.95, ['#ffffff', '#ffb547', '#7fe8ff']],
};

export class FX {
  constructor(scene, renderer) {
    const N = this.N = 1400;
    this.x = new Float32Array(N); this.y = new Float32Array(N); this.s = new Float32Array(N);
    this.vx = new Float32Array(N); this.vy = new Float32Array(N); this.vs = new Float32Array(N);
    this.life = new Float32Array(N); this.max = new Float32Array(N); this.size = new Float32Array(N);
    this.drag = new Float32Array(N); this.grav = new Float32Array(N); this.anchor = new Float32Array(N);
    this.r = new Float32Array(N); this.g = new Float32Array(N); this.b = new Float32Array(N);
    this.next = 0;
    const geo = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(new Float32Array(N * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.BufferAttribute(new Float32Array(N * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.BufferAttribute(new Float32Array(N), 1).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.aPos); geo.setAttribute('pcol', this.aCol); geo.setAttribute('psize', this.aSize);
    this.u = { uScale: { value: 600 }, uBendY: BEND.y, uBendX: BEND.x };
    this.points = new THREE.Points(geo, new THREE.ShaderMaterial({
      uniforms: this.u, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: BEND_GLSL + /* glsl */`
        attribute vec4 pcol; attribute float psize; uniform float uScale; varying vec4 vC;
        void main() {
          vC = pcol;
          vec4 w = modelMatrix * vec4(position, 1.0);
          w.xyz = bendWorld(w.xyz);
          vec4 mv = viewMatrix * w;
          gl_PointSize = psize * uScale / max(0.5, -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`varying vec4 vC; void main() { vec2 p = gl_PointCoord - 0.5; float d = dot(p, p); float a = exp(-d * 14.0) * vC.a; gl_FragColor = vec4(vC.rgb * a, a); }`,
    }));
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    scene.add(this.points);
    this.geo = geo;
    this._c = new THREE.Color();

    // 速度线
    const SL = this.SL = 80;
    const lg = new THREE.PlaneGeometry(0.035, 1);
    lg.rotateX(-Math.PI / 2);
    this.lineMat = new THREE.MeshBasicMaterial({ color: 0xcfe8ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    this.lines = new THREE.InstancedMesh(lg, this.lineMat, SL);
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 6;
    this.lp = [];
    for (let i = 0; i < SL; i++) this.lp.push(this.spawnLine({}, true));
    scene.add(this.lines);
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._v = new THREE.Vector3(); this._s = new THREE.Vector3();
  }

  setViewport(h, fov) { this.u.uScale.value = h / (2 * Math.tan(THREE.MathUtils.degToRad(fov) / 2)); }

  emit(kind, x, y, s, opt = {}) {
    const K = KINDS[kind];
    const n = opt.n ?? K[0];
    const cols = opt.colors || K[8];
    for (let k = 0; k < n; k++) {
      const i = this.next; this.next = (this.next + 1) % this.N;
      const a = Math.random() * Math.PI * 2, b = Math.acos(Math.random() * 2 - 1);
      const sp = K[3] * (0.45 + Math.random() * 0.75) * (opt.spd ?? 1);
      this.x[i] = x + (opt.jx || 0) * (Math.random() - 0.5);
      this.y[i] = y + (opt.jy || 0) * (Math.random() - 0.5);
      this.s[i] = s + (opt.js || 0) * (Math.random() - 0.5);
      if (kind === 'power' || kind === 'revive') { // 竖直平面里的光环
        this.vx[i] = Math.cos(a) * sp; this.vy[i] = Math.sin(a) * sp; this.vs[i] = (Math.random() - 0.5) * 1.5;
      } else if (kind === 'dust') {
        this.vx[i] = Math.cos(a) * sp; this.vy[i] = Math.random() * K[4]; this.vs[i] = Math.sin(a) * sp;
      } else {
        this.vx[i] = Math.sin(b) * Math.cos(a) * sp + (opt.vx || 0);
        this.vy[i] = Math.cos(b) * sp * 0.6 + K[4] + (opt.vy || 0);
        this.vs[i] = Math.sin(b) * Math.sin(a) * sp + (opt.vs || 0);
      }
      this.life[i] = this.max[i] = K[1] * (0.6 + Math.random() * 0.6);
      this.size[i] = K[2] * (0.6 + Math.random() * 0.8) * (opt.size ?? 1);
      this.drag[i] = K[5]; this.grav[i] = K[6]; this.anchor[i] = opt.anchor ?? K[7];
      this._c.set(cols[Math.floor(Math.random() * cols.length)]);
      this.r[i] = this._c.r; this.g[i] = this._c.g; this.b[i] = this._c.b;
    }
  }

  update(dt, dist, speed) {
    const P = this.aPos.array, C = this.aCol.array, S = this.aSize.array;
    for (let i = 0; i < this.N; i++) {
      if (this.life[i] <= 0) { S[i] = 0; C[i * 4 + 3] = 0; continue; }
      this.life[i] -= dt;
      const dr = Math.exp(-this.drag[i] * dt);
      this.vx[i] *= dr; this.vy[i] *= dr; this.vs[i] *= dr;
      this.vy[i] += this.grav[i] * dt;
      this.x[i] += this.vx[i] * dt; this.y[i] += this.vy[i] * dt;
      this.s[i] += (this.vs[i] + speed * this.anchor[i]) * dt;
      const t = Math.max(0, this.life[i] / this.max[i]);
      P[i * 3] = this.x[i]; P[i * 3 + 1] = this.y[i]; P[i * 3 + 2] = dist - this.s[i];
      C[i * 4] = this.r[i] * 2.2; C[i * 4 + 1] = this.g[i] * 2.2; C[i * 4 + 2] = this.b[i] * 2.2; C[i * 4 + 3] = Math.min(1, t * 1.6);
      S[i] = this.size[i] * (0.4 + 0.6 * t);
    }
    this.aPos.needsUpdate = this.aCol.needsUpdate = this.aSize.needsUpdate = true;
  }

  spawnLine(o, initial) {
    const a = Math.random() * Math.PI * 2;
    const r = 2.2 + Math.random() * 7;
    o.x = Math.cos(a) * r * 1.3; o.y = Math.sin(a) * r * 0.8 + 1.5;
    if (o.y < 0.6 && Math.abs(o.x) < 4) o.y += 4;
    o.z = initial ? -Math.random() * 70 : -55 - Math.random() * 20;
    o.len = 1.5 + Math.random() * 3.5;
    o.v = 1.6 + Math.random() * 0.9;
    return o;
  }

  updateLines(dt, cam, speed, intensity) {
    const m = this._m;
    this.lineMat.opacity = intensity * 0.3;
    this.lines.visible = intensity > 0.02;
    if (!this.lines.visible) return;
    for (let i = 0; i < this.SL; i++) {
      const o = this.lp[i];
      o.z += (speed * o.v + 15) * dt;
      if (o.z > 4) this.spawnLine(o, false);
      this._v.set(cam.position.x + o.x, cam.position.y + o.y - 3.5, cam.position.z - 8 + o.z);
      this._s.set(1, 1, o.len * (0.4 + intensity));
      m.compose(this._v, this._q, this._s);
      this.lines.setMatrixAt(i, m);
    }
    this.lines.instanceMatrix.needsUpdate = true;
  }
}
