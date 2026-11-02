/* 星际竞速 · 镜头：追尾镜头、发车运镜、标题电影镜头、环绕镜头、震动 */
import * as THREE from 'three';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const UP = new THREE.Vector3(0, 1, 0);
const ease = (t) => t * t * (3 - 2 * t);

export class CameraDirector {
  constructor(camera) {
    this.cam = camera;
    this.track = null;
    this.psi = 0; this.x = 0; this.boostV = 0; this.speedV = 0;
    this.shakeAmp = 0;
    this.far = false;
    this.pos = new THREE.Vector3(); this.look = new THREE.Vector3(); this.up = new THREE.Vector3(0, 1, 0);
    this.cine = null; this.cineT = 0; this.cineIdx = 0;
    this.orbitA = 0;
    this.fovKick = 0;
    this._v = new THREE.Vector3(); this._w = new THREE.Vector3(); this._u = new THREE.Vector3();
    this.cut = null;
  }

  setTrack(tr) { this.track = tr; this.cine = null; }
  shake(a) { this.shakeAmp = Math.min(1.2, this.shakeAmp + a); }

  baseFov() {
    const asp = this.cam.aspect;
    if (asp >= 1) return 66;
    const h = 56 * Math.PI / 180;
    return clamp(2 * Math.atan(Math.tan(h / 2) / asp) * 180 / Math.PI, 66, 96);
  }

  /** 追尾镜头的目标姿态写入 out */
  chasePose(r, dt, out, snap = false) {
    const tr = this.track;
    const portrait = this.cam.aspect < 0.9;
    let back = portrait ? 9.6 : 8.4, height = portrait ? 4.4 : 3.1, ahead = portrait ? 22 : 17, lookH = portrait ? 0.2 : 1.1;
    if (this.far) { back *= 1.5; height *= 1.7; ahead *= 1.2; }
    const k = snap ? 1 : 1 - Math.exp(-dt * 5);
    const motion = r.psi + Math.atan2(r.vp, Math.max(1, r.vf)) * 0.55;
    this.psi += (motion - this.psi) * k;
    this.x += (r.x - this.x) * (snap ? 1 : 1 - Math.exp(-dt * 9));
    const sp = clamp(r.speed / r.topSpeed, 0, 1.6);
    this.speedV += (sp - this.speedV) * (snap ? 1 : 1 - Math.exp(-dt * 3));
    this.boostV += ((r.boosting ? 1 : 0) - this.boostV) * (snap ? 1 : 1 - Math.exp(-dt * 3.5));
    const dist = back + this.speedV * 1.0 + this.boostV * 1.8;
    const sC = r.dist - dist * Math.cos(this.psi);
    const xC = this.x - dist * Math.sin(this.psi) * 0.8;
    const f = tr.frameAt(sC);
    out.pos.copy(f.P).addScaledVector(f.L, xC).addScaledVector(f.U, height);
    out.up.copy(UP).lerp(f.U, 0.7).normalize();
    const f2 = tr.frameAt(r.dist + ahead);
    const lx = this.x * 0.75 + Math.sin(this.psi) * ahead * 0.35;
    out.look.copy(f2.P).addScaledVector(f2.L, lx).addScaledVector(f2.U, lookH + 1.2);
    out.fov = this.baseFov() + this.speedV * 7 + this.boostV * 9;
    return out;
  }

  apply(pose, dt) {
    const c = this.cam;
    c.position.copy(pose.pos);
    if (this.shakeAmp > 0.001) {
      const a = this.shakeAmp;
      c.position.x += (Math.random() - 0.5) * a * 0.9;
      c.position.y += (Math.random() - 0.5) * a * 0.7;
      c.position.z += (Math.random() - 0.5) * a * 0.9;
      this.shakeAmp *= Math.exp(-dt * 7);
    }
    c.up.copy(pose.up);
    c.lookAt(pose.look);
    if (Math.abs(c.fov - pose.fov) > 0.01) { c.fov += (pose.fov - c.fov) * Math.min(1, dt * 6); c.updateProjectionMatrix(); }
  }

  /* ---------- 比赛中 ---------- */
  updateRace(dt, race, r) {
    const pose = this.chasePose(r, dt, { pos: this._v, look: this._w, up: this._u, fov: 66 });
    // 发车前：从车头前方高处摇到车尾
    if (race && !race.started) {
      const t = ease(clamp((race.clock + 3.6) / 2.6, 0, 1));
      const f = this.track.frameAt(r.dist + 16 - t * 4);
      const p0 = this._tmpA || (this._tmpA = new THREE.Vector3());
      p0.copy(f.P).addScaledVector(f.L, r.x + 7 * (1 - t)).addScaledVector(f.U, 6 + 3 * (1 - t));
      const l0 = this._tmpB || (this._tmpB = new THREE.Vector3());
      const fs = this.track.frameAt(r.dist);
      l0.copy(fs.P).addScaledVector(fs.L, r.x).addScaledVector(fs.U, 1);
      pose.pos.lerpVectors(p0, pose.pos, t);
      pose.look.lerpVectors(l0, pose.look, t);
    }
    this.apply(pose, dt);
  }

  /* ---------- 环绕（机库 / 结算） ---------- */
  updateOrbit(dt, center, frameU, radius, height, speed) {
    this.orbitA += dt * speed;
    const c = this.cam;
    const f = this.track.frameAt(this.orbitS || 0);
    const a = this.orbitA;
    this._v.copy(center)
      .addScaledVector(f.T, Math.cos(a) * radius)
      .addScaledVector(f.L, Math.sin(a) * radius)
      .addScaledVector(frameU || f.U, height);
    const pose = { pos: this._v, look: this._w.copy(center), up: this._u.copy(UP).lerp(f.U, 0.5).normalize(), fov: this.cam.aspect < 0.9 ? 62 : 44 };
    this.apply(pose, dt);
  }

  /* ---------- 标题画面电影镜头 ---------- */
  updateCine(dt, race) {
    const tr = this.track;
    const rs = race.racers;
    if (!this.cine || (this.cineT -= dt) <= 0) {
      const types = ['chase', 'side', 'trackside', 'front', 'high', 'trackside', 'chase'];
      const type = types[this.cineIdx++ % types.length];
      const sorted = rs.slice().sort((a, b) => b.dist - a.dist);
      const target = type === 'front' ? sorted[0] : sorted[Math.floor(Math.random() * Math.min(4, sorted.length))];
      this.cine = { type, target, side: Math.random() < 0.5 ? 1 : -1, s0: target.dist + 70 + Math.random() * 60, x0: 0 };
      this.cineT = type === 'trackside' ? 4.2 : 5.2;
      this.cut = performance.now();
      this.psi = target.psi; this.x = target.x;
    }
    const q = this.cine, r = q.target;
    const pose = { pos: this._v, look: this._w, up: this._u.copy(UP), fov: this.baseFov() };
    const rp = this._tmpR || (this._tmpR = new THREE.Vector3());
    tr.worldPos(r.dist, r.x, 1.0, rp);
    const half = tr.half;
    if (q.type === 'chase') {
      this.chasePose(r, dt, pose);
      const f = tr.frameAt(r.dist);
      pose.pos.addScaledVector(f.U, -0.8);
      pose.fov -= 4;
    } else if (q.type === 'side') {
      const f = tr.frameAt(r.dist + 3);
      pose.pos.copy(f.P).addScaledVector(f.L, q.side * (half - 2)).addScaledVector(f.U, 2.2);
      pose.look.copy(rp);
      pose.up.copy(UP).lerp(f.U, 0.6).normalize();
      pose.fov = 58;
    } else if (q.type === 'trackside') {
      const f = tr.frameAt(q.s0);
      pose.pos.copy(f.P).addScaledVector(f.L, q.side * (half + 9)).addScaledVector(f.U, 4.5);
      pose.look.copy(rp);
      pose.up.copy(UP).lerp(f.U, 0.3).normalize();
      pose.fov = 46;
    } else if (q.type === 'front') {
      const f = tr.frameAt(r.dist + 12);
      pose.pos.copy(f.P).addScaledVector(f.L, r.x * 0.6 + q.side * 3).addScaledVector(f.U, 2.6);
      const fb = tr.frameAt(r.dist - 20);
      pose.look.copy(fb.P).addScaledVector(fb.L, r.x * 0.5).addScaledVector(fb.U, 1.2);
      pose.up.copy(UP).lerp(f.U, 0.6).normalize();
      pose.fov = 60;
    } else {
      const f = tr.frameAt(r.dist - 26);
      pose.pos.copy(f.P).addScaledVector(f.L, q.side * 8).addScaledVector(f.U, 34);
      pose.look.copy(rp);
      pose.fov = 55;
    }
    this.apply(pose, dt);
  }
}
