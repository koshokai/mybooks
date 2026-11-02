/* 星际竞速 · 特效：火花粒子、速度线 */
import * as THREE from 'three';

export class Sparks {
  constructor(max, dpr) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.base = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.cursor = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo = g;
    const m = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 380 * dpr } },
      vertexShader: /* glsl */`
        attribute float aSize; varying vec3 vC; uniform float uScale;
        void main() { vC = color; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = clamp(aSize * uScale / -mv.z, 0.0, 64.0); }`,
      fragmentShader: /* glsl */`
        varying vec3 vC; void main() { float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.05, d); gl_FragColor = vec4(vC * a, 1.0); }`,
      vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(g, m);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    this.alive = 0;
  }

  emit(p, v, color, n, opts = {}) {
    const spread = opts.spread ?? 6, life = opts.life ?? 0.45, size = opts.size ?? 0.35, bright = opts.bright ?? 2.5;
    for (let k = 0; k < n; k++) {
      const i = this.cursor; this.cursor = (this.cursor + 1) % this.max;
      this.pos[i * 3] = p.x + (Math.random() - 0.5) * (opts.jitter ?? 0.4);
      this.pos[i * 3 + 1] = p.y + (Math.random() - 0.5) * (opts.jitter ?? 0.4);
      this.pos[i * 3 + 2] = p.z + (Math.random() - 0.5) * (opts.jitter ?? 0.4);
      if (opts.sphere) {
        // 球面方向 × 速度：烟花呈圆形绽放
        const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, s = Math.sqrt(1 - u * u);
        const sp = spread * 0.5 * (0.75 + Math.random() * 0.25);
        this.vel[i * 3] = v.x + Math.cos(th) * s * sp;
        this.vel[i * 3 + 1] = v.y + u * sp + (opts.up ?? 0);
        this.vel[i * 3 + 2] = v.z + Math.sin(th) * s * sp;
      } else {
        this.vel[i * 3] = v.x + (Math.random() - 0.5) * spread;
        this.vel[i * 3 + 1] = v.y + (Math.random() - 0.5) * spread + (opts.up ?? 0);
        this.vel[i * 3 + 2] = v.z + (Math.random() - 0.5) * spread;
      }
      const b = bright * (0.6 + Math.random() * 0.6);
      this.base[i * 3] = color.r * b; this.base[i * 3 + 1] = color.g * b; this.base[i * 3 + 2] = color.b * b;
      this.maxLife[i] = this.life[i] = life * (0.6 + Math.random() * 0.7);
      this.size[i] = size * (0.6 + Math.random() * 0.8);
    }
  }

  update(dt) {
    const drag = Math.exp(-2.2 * dt);
    let alive = 0;
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) { if (this.col[i * 3] !== 0) { this.col[i * 3] = this.col[i * 3 + 1] = this.col[i * 3 + 2] = 0; } continue; }
      alive++;
      this.life[i] -= dt;
      const k = Math.max(0, this.life[i] / this.maxLife[i]);
      this.vel[i * 3] *= drag; this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * drag - 9 * dt; this.vel[i * 3 + 2] *= drag;
      this.pos[i * 3] += this.vel[i * 3] * dt; this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt; this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      const f = k * k;
      this.col[i * 3] = this.base[i * 3] * f; this.col[i * 3 + 1] = this.base[i * 3 + 1] * f; this.col[i * 3 + 2] = this.base[i * 3 + 2] * f;
    }
    this.alive = alive;
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
    this.geo.attributes.aSize.needsUpdate = true;
  }

  clear() { this.life.fill(0); this.col.fill(0); this.geo.attributes.color.needsUpdate = true; }
}

/** 镜头前的速度线（挂在相机上） */
export class SpeedLines {
  constructor(count) {
    this.count = count;
    this.data = [];
    const pos = new Float32Array(count * 6), col = new Float32Array(count * 6);
    for (let i = 0; i < count; i++) this.data.push(this.spawn({}, true));
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo = g;
    this.mat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    this.lines = new THREE.LineSegments(g, this.mat);
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 10;
    this.color = new THREE.Color('#bfefff');
  }
  spawn(d, init) {
    const a = Math.random() * Math.PI * 2;
    const r = 2.2 + Math.pow(Math.random(), 0.6) * 9;
    d.x = Math.cos(a) * r; d.y = Math.sin(a) * r * 0.75 + 0.6;
    d.z = init ? -Math.random() * 90 - 4 : -90 - Math.random() * 20;
    d.b = 0.4 + Math.random() * 0.6;
    return d;
  }
  update(dt, speed, intensity, color) {
    const pos = this.geo.attributes.position.array, col = this.geo.attributes.color.array;
    const v = speed * 1.15;
    const len = Math.min(22, 1.5 + speed * 0.09 * (1 + intensity));
    if (color) this.color.copy(color);
    for (let i = 0; i < this.count; i++) {
      const d = this.data[i];
      d.z += v * dt;
      if (d.z > -1.5) this.spawn(d, false);
      pos[i * 6] = d.x; pos[i * 6 + 1] = d.y; pos[i * 6 + 2] = d.z;
      pos[i * 6 + 3] = d.x; pos[i * 6 + 4] = d.y; pos[i * 6 + 5] = d.z - len;
      const fade = Math.min(1, (d.z + 100) / 30) * Math.min(1, -d.z / 8);
      const b = intensity * d.b * fade;
      col[i * 6] = this.color.r * b; col[i * 6 + 1] = this.color.g * b; col[i * 6 + 2] = this.color.b * b;
      col[i * 6 + 3] = 0; col[i * 6 + 4] = 0; col[i * 6 + 5] = 0;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
    this.lines.visible = intensity > 0.01;
  }
}
