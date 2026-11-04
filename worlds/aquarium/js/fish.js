// 鱼群行为与游动运动学：鲹科式行进波、爆发—滑行、转弯弯身、横滚俯仰、群游、领地、底栖、吸附玻璃、虾的行走与拾食；饲料
import * as THREE from "three";
import { T, clamp, lerp } from "./gfx.js";
import { SP } from "./data.js";
import { makeFishMesh } from "./fishgeo.js";

const V = () => new THREE.Vector3();
const tmp = V(), tmp2 = V(), tmp3 = V();
const UP = new THREE.Vector3(0, 1, 0);
const angDiff = (a, b) => { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };

/* ---------------- 饲料 ---------------- */
export class Food {
  constructor(scene, W) {
    this.W = W; this.max = 140; this.list = [];
    const g = new THREE.CircleGeometry(0.034, 7); g.rotateX(-Math.PI / 2);
    const p = g.attributes.position; for (let i = 0; i < p.count; i++) p.setY(i, (Math.random() - 0.5) * 0.008);
    g.computeVertexNormals();
    this.mesh = new THREE.InstancedMesh(g, new THREE.MeshStandardMaterial({ roughness: 0.85, side: THREE.DoubleSide }), this.max);
    this.mesh.count = 0; this.mesh.frustumCulled = false; scene.add(this.mesh);
    this.cols = ["#d9852f", "#b8562a", "#7d9a3a", "#e0b04a", "#a0402a"].map((c) => new THREE.Color(c));
    this.m = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.e = new THREE.Euler(); this.s = new THREE.Vector3();
    this.wasted = 0;
  }
  drop(x, z, n = 8) {
    for (let i = 0; i < n && this.list.length < this.max; i++) {
      this.list.push({
        p: new THREE.Vector3(clamp(x + (Math.random() - 0.5) * 0.7, T.X0 + 0.2, T.X1 - 0.2), T.WATER - 0.01, clamp(z + (Math.random() - 0.5) * 0.7, T.Z0 + 0.2, T.Z1 - 0.2)),
        float: 0.6 + Math.random() * 1.6, sink: 0.13 + Math.random() * 0.1, rx: Math.random() * 6, ry: Math.random() * 6, spin: (Math.random() - 0.5) * 3, ph: Math.random() * 6,
        c: this.cols[Math.floor(Math.random() * this.cols.length)], floor: 0, s: 0.7 + Math.random() * 0.6,
      });
    }
  }
  remove(f) { const i = this.list.indexOf(f); if (i >= 0) this.list.splice(i, 1); }
  update(dt, t) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const f = this.list[i];
      if (f.float > 0) { f.float -= dt; f.p.x += Math.sin(t * 0.7 + f.ph) * 0.02 * dt; }
      else if (!f.floor) {
        f.p.y -= f.sink * dt; f.p.x += Math.sin(t * 2 + f.ph) * 0.05 * dt; f.p.z += Math.cos(t * 1.7 + f.ph) * 0.04 * dt;
        f.rx += f.spin * dt; f.ry += f.spin * 0.7 * dt;
        const g = this.W.ground(f.p.x, f.p.z) + 0.015;
        if (f.p.y <= g) { f.p.y = g; f.floor = 0.001; f.rx = 0; }
      } else {
        f.floor += dt;
        if (f.floor > 40) { this.list.splice(i, 1); this.wasted++; }
      }
    }
    const n = (this.mesh.count = this.list.length);
    for (let i = 0; i < n; i++) {
      const f = this.list[i];
      this.e.set(f.rx, f.ry, 0); this.q.setFromEuler(this.e);
      const fade = f.floor > 34 ? 1 - (f.floor - 34) / 6 : 1;
      this.s.setScalar(f.s * fade);
      this.m.compose(f.p, this.q, this.s); this.mesh.setMatrixAt(i, this.m); this.mesh.setColorAt(i, f.c);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
  nearest(p, r, pred) {
    let best = null, bd = r * r;
    for (const f of this.list) { if (pred && !pred(f)) continue; const d = f.p.distanceToSquared(p); if (d < bd) { bd = d; best = f; } }
    return best;
  }
}

/* ---------------- 单条鱼 ---------------- */
const WALLS = [
  { n: [0, 0, -1], at: (a, b) => [a, b, T.Z1 - 0.045] },
  { n: [0, 0, 1], at: (a, b) => [a, b, T.Z0 + 0.06] },
  { n: [1, 0, 0], at: (a, b) => [T.X0 + 0.045, b, a * 0.48] },
  { n: [-1, 0, 0], at: (a, b) => [T.X1 - 0.045, b, a * 0.48] },
];

export class Fish {
  constructor(d, scene, W, school) {
    this.d = d; this.sp = SP[d.sp]; this.W = W; this.school = school;
    this.u = {
      uPhase: { value: Math.random() * 6 }, uAmp: { value: 0.08 }, uWave: { value: d.sp === "betta" ? 4.6 : 5.6 }, uTurn: { value: 0 },
      uFlut: { value: 7 + Math.random() * 2 }, uFlutK: { value: 1 }, uBreath: { value: 2.6 + Math.random() * 1.5 }, uDroop: { value: 0 },
    };
    this.obj = makeFishMesh(d.sp, d, this.u);
    this.obj.rotation.order = "YZX";
    scene.add(this.obj);
    this.indiv = 0.9 + Math.random() * 0.18;
    this.pos = V(); this.head = new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
    this.speed = 0; this.yaw = Math.atan2(-this.head.z, this.head.x); this.pitch = 0; this.roll = 0; this.yawRate = 0;
    this.burst = 0; this.thrust = 0; this.wt = V(); this.wtT = 0; this.startle = 0; this.flee = V();
    this.mode = "swim"; this.modeT = 0; this.seed = Math.random() * 100; this.target = null; this.flare = 0;
    this.wall = null; this.wallA = 0; this.wallB = 0; this.wallDir = Math.random() * 6;
    this.place(d.enter);
    delete d.enter;
    this.applyScale();
  }
  get size() { return this.sp.size * this.indiv * (this.d.fry ? 0.38 + 0.62 * clamp((Date.now() - this.d.born) / (4 * 864e5), 0, 1) : 1) * (this.d.sp === "guppy" && this.d.sex === "f" ? 1.12 : 1); }
  applyScale() { this.obj.scale.setScalar(this.size); }
  zoneY() {
    const g = this.W.ground(this.pos.x, this.pos.z) + 0.2 + this.size * 0.25, top = T.WATER - 0.22;
    let [a, b] = this.sp.zone;
    const night = this.W.night;
    if (night > 0.5 && this.sp.beh !== "shrimp") { a *= 0.5; b = b * 0.5 + 0.12; }
    if (this.d.hunger > 72 && night < 0.5) { a = Math.min(0.9, a + 0.25); b = Math.min(1, b + 0.15); }
    if (this.d.happy < 35) { a *= 0.6; b *= 0.7; }
    return [lerp(g, top, a), lerp(g, top, b), g, top];
  }
  place(enter) {
    const b = this.sp.beh;
    const x = lerp(T.X0 + 0.8, T.X1 - 0.8, Math.random()), z = lerp(T.Z0 + 0.7, T.Z1 - 0.7, Math.random());
    this.pos.set(x, 0, z);
    const [lo, hi] = this.zoneY();
    this.pos.y = lerp(lo, hi, Math.random());
    if (b === "bottom" || b === "shrimp") { this.pos.y = this.W.ground(x, z) + 0.03; this.mode = "rest"; this.modeT = Math.random() * 3; }
    if (b === "glass") this.attachWall(Math.floor(Math.random() * 4));
    if (enter) { this.pos.set((Math.random() - 0.5) * 3, T.WATER - 0.15, (Math.random() - 0.5) * 2); this.head.set(Math.random() - 0.5, -0.8, 0.2).normalize(); this.speed = 0.6; this.mode = "swim"; this.wall = null; this.enterT = 2.5; }
  }
  attachWall(i) {
    this.wall = WALLS[i]; this.mode = "wall"; this.modeT = 3 + Math.random() * 8;
    const g = Math.max(this.W.ground(0, i === 0 ? 2.3 : -2.3), 0.8) + 0.4;
    this.wallA = lerp(-4.2, 4.2, Math.random()); this.wallB = lerp(g, T.WATER - 0.6, Math.random() * 0.8);
    if (i >= 2) this.wallA = lerp(-4.2, 4.2, Math.random());
  }

  setStartle(from) {
    this.flee.copy(this.pos).sub(from); this.flee.y *= 0.5;
    if (this.flee.lengthSq() < 1e-4) this.flee.set(Math.random() - 0.5, 0.1, -1);
    this.flee.normalize(); this.startle = 1; this.burst = 0.45;
    if (this.mode === "wall" && Math.random() < 0.5) this.leaveWall();
    if (this.sp.beh === "shrimp") { this.jump = 0.5; }
    if (this.mode === "rest") this.mode = "swim";
  }
  leaveWall() { this.mode = "swim"; this.wall = null; this.modeT = 2 + Math.random() * 3; this.nextWall = Math.floor(Math.random() * 4); }

  update(dt, t, mates) {
    const b = this.sp.beh;
    if (b === "glass" && this.mode === "wall") return this.updWall(dt, t);
    if (b === "glass") {
      this.modeT -= dt;
      if (this.modeT <= 0) {
        if (!this.wallGoal) { const i = this.nextWall ?? 0, w = WALLS[i]; const a = lerp(-4, 4, Math.random()), bb = lerp(1.2, T.WATER - 0.7, Math.random()); this.wallGoal = { i, a, b: bb, p: new THREE.Vector3(...w.at(a, bb)) }; }
        this.wt.copy(this.wallGoal.p); this.wtT = 5;
        if (this.pos.distanceTo(this.wallGoal.p) < 0.85) { const g = this.wallGoal; this.attachWall(g.i); this.wallA = g.a; this.wallB = g.b; this.wallGoal = null; return; }
      }
    }
    if (b === "shrimp") return this.updShrimp(dt, t);
    if (b === "bottom" && this.mode !== "swim" && this.mode !== "gulp") return this.updBottom(dt, t);
    return this.updSwim(dt, t, mates);
  }

  /* 普通游动：转向 + 爆发滑行 */
  updSwim(dt, t, mates) {
    const sp = this.sp, W = this.W, p = this.pos, night = W.night, sz = this.size;
    const D = tmp.set(0, 0, 0);
    const [lo, hi, gy, top] = this.zoneY();
    let cruise = sp.speed * (0.85 + 0.3 * Math.sin(t * 0.13 + this.seed));
    if (night > 0.5) cruise *= 0.3;
    if (this.d.happy < 35) cruise *= 0.65;
    // 漫游目标
    this.wtT -= dt;
    const sT = this.school && sp.beh === "school" ? this.school.target : null;
    if (this.wtT <= 0 || p.distanceTo(this.wt) < 0.4) {
      this.wtT = 3 + Math.random() * 6;
      let x = lerp(T.X0 + 0.9, T.X1 - 0.9, Math.random()), z = lerp(T.Z0 + 0.7, T.Z1 - 0.7, Math.random());
      if (night > 0.5 || this.d.happy < 35) { const h = W.hide[Math.floor(Math.random() * W.hide.length)]; if (h) { x = h[0] + (Math.random() - 0.5); z = h[2] + (Math.random() - 0.5) * 0.6; } }
      this.wt.set(x, lerp(lo, hi, Math.random()), z);
    }
    if (sT) D.add(tmp2.copy(sT).sub(p).setLength(0.9));
    else D.add(tmp2.copy(this.wt).sub(p).setLength(1));
    // 群游
    if (sp.beh === "school" && mates) {
      let n = 0; const sep = tmp3.set(0, 0, 0), ali = V(), coh = V();
      for (const m of mates) {
        if (m === this) continue;
        const d = m.pos.distanceTo(p);
        if (d < 1.4) {
          n++; ali.add(m.head); coh.add(m.pos);
          const sr = (sz + m.size) * 0.55;
          if (d < sr) sep.add(tmp2.copy(p).sub(m.pos).setLength((sr - d) / sr * 2.2));
        }
      }
      if (n) { coh.multiplyScalar(1 / n).sub(p).multiplyScalar(night > 0.5 ? 0.3 : 0.8); D.add(coh).add(ali.multiplyScalar(0.9 / n)).add(sep); }
    } else if (mates) {
      for (const m of mates) { if (m === this) continue; const d = m.pos.distanceTo(p), sr = (sz + m.size) * 0.7; if (d < sr) D.add(tmp2.copy(p).sub(m.pos).setLength((sr - d) / sr * 1.6)); }
    }
    // 斗鱼：守护领地
    if (sp.beh === "betta") {
      this.flare = Math.max(0, this.flare - dt * 0.5);
      const intr = W.school && W.school.near(p, 0.9, this);
      if (intr && night < 0.5) { this.flare = 1; D.add(tmp2.copy(intr.pos).sub(p).setLength(1.2)); cruise = sp.speed * 2.2; }
    }
    // 饲料
    const hungry = this.d.hunger > 6 && night < 0.8;
    if (hungry) {
      const f = W.food.nearest(p, 4.5, (f) => f.p.y > gy - 0.1);
      if (f) {
        D.add(tmp2.copy(f.p).sub(p).setLength(3)); cruise = sp.speed * 2.2;
        if (f.p.distanceTo(p) < sz * 0.45 + 0.06) { W.food.remove(f); W.onEat(this); this.burst = 0; this.gulpT = 0.3; }
      }
    }
    // 受惊
    if (this.startle > 0) { this.startle -= dt * 1.3; D.add(tmp2.copy(this.flee).multiplyScalar(5 * this.startle)); cruise = sp.speed * 3.2; }
    // 刚放进缸
    if (this.enterT > 0) { this.enterT -= dt; D.add(tmp2.set(0, -1.5 * this.enterT, 0)); }
    // 避开石头与沉木
    for (const o of W.obst) {
      const dx = p.x - o.x, dy = p.y - o.y, dz = p.z - o.z, d = Math.hypot(dx, dy, dz), rr = o.r + sz * 0.5 + 0.18;
      if (d < rr) { const k = (rr - d) / rr * 4 / Math.max(d, 0.01); D.x += dx * k; D.y += dy * k * 0.6 + 0.4 * (rr - d); D.z += dz * k; }
    }
    // 边界（软）
    const m = 0.45 + sz * 0.4;
    if (p.x < T.X0 + m) D.x += (T.X0 + m - p.x) * 6; if (p.x > T.X1 - m) D.x -= (p.x - T.X1 + m) * 6;
    if (p.z < T.Z0 + m) D.z += (T.Z0 + m - p.z) * 6; if (p.z > T.Z1 - m) D.z -= (p.z - T.Z1 + m) * 6;
    if (p.y < lo) D.y += (lo - p.y) * (p.y < gy + 0.1 ? 8 : 1.4); if (p.y > hi) D.y -= (p.y - hi) * (p.y > top ? 8 : 1.2);
    if (sp.beh === "bottom" && this.mode === "gulp") { D.set(0, this.gulpUp ? 3 : -3, 0).add(tmp2.copy(this.head).multiplyScalar(0.5)); if (this.gulpUp && p.y > T.WATER - 0.25) { this.gulpUp = false; W.env && W.env.ripple(p.x, p.z, 0.4); } if (!this.gulpUp && p.y < W.ground(p.x, p.z) + 0.15) { this.mode = "rest"; this.modeT = 2; } }

    // 转向：限制角速度与俯仰
    const hd = Math.hypot(D.x, D.z);
    let tYaw = hd > 1e-4 ? Math.atan2(-D.z, D.x) : this.yaw;
    let tPitch = Math.atan2(D.y, Math.max(hd, 0.3)); tPitch = clamp(tPitch, -0.55, 0.55);
    const turnMax = (sp.beh === "school" ? 3.2 : 1.8) * (this.startle > 0 ? 2.2 : 1);
    const dy = clamp(angDiff(this.yaw, tYaw), -turnMax * dt, turnMax * dt);
    this.yaw += dy; this.yawRate = clamp(lerp(this.yawRate, dy / Math.max(dt, 1e-4), 0.15), -3, 3);
    this.pitch = lerp(this.pitch, tPitch, 1 - Math.exp(-dt * 2.5));
    this.head.set(Math.cos(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.sin(this.yaw) * Math.cos(this.pitch));
    // 推进：爆发—滑行（小型脂鲤），持续划水（神仙、七彩、斗鱼、金鱼）
    const glide = sp.beh === "school" || sp.id === "guppy";
    if (glide) {
      if (this.burst > 0) { this.burst -= dt; this.thrust = lerp(this.thrust, 1, 1 - Math.exp(-dt * 12)); }
      else { this.thrust = lerp(this.thrust, 0, 1 - Math.exp(-dt * 5)); if (this.speed < cruise * 0.75) this.burst = 0.18 + Math.random() * 0.35; }
      this.speed += (this.thrust * cruise * 4.2 - this.speed * 1.5) * dt;
    } else {
      this.thrust = clamp(cruise / Math.max(sp.speed, 0.01), 0.2, 1.5);
      this.speed = lerp(this.speed, cruise, 1 - Math.exp(-dt * 1.6));
    }
    this.speed = clamp(this.speed, 0.02, sp.speed * 4);
    p.addScaledVector(this.head, this.speed * dt);
    p.x = clamp(p.x, T.X0 + 0.15, T.X1 - 0.15); p.z = clamp(p.z, T.Z0 + 0.15, T.Z1 - 0.15);
    p.y = clamp(p.y, gy - 0.12, T.WATER - 0.08);
    // 动画参数
    const rel = this.speed / Math.max(sp.speed, 0.01);
    let freq, amp;
    if (glide) { freq = 1.6 + this.thrust * 4.5 + rel * 0.8; amp = 0.03 + this.thrust * 0.07; }
    else { freq = 0.9 + rel * 1.6; amp = 0.035 + rel * 0.045; }
    if (night > 0.5) { freq *= 0.6; amp *= 0.6; }
    if (this.gulpT > 0) this.gulpT -= dt;
    this.anim(dt, freq, amp, clamp(1.3 - rel * 0.5, 0.5, 1.4) * (sp.beh === "betta" ? 1.3 + this.flare : 1));
    this.pose(dt);
  }

  anim(dt, freq, amp, flutK) {
    const u = this.u;
    u.uPhase.value += dt * freq * Math.PI * 2;
    u.uAmp.value = lerp(u.uAmp.value, Math.min(amp, 0.1), 1 - Math.exp(-dt * 6));
    u.uTurn.value = lerp(u.uTurn.value, clamp(-this.yawRate * 0.03, -0.07, 0.07), 1 - Math.exp(-dt * 6));
    u.uFlutK.value = lerp(u.uFlutK.value, flutK, 1 - Math.exp(-dt * 3));
    u.uDroop.value = this.sp.id === "betta" || this.sp.id === "goldfish" ? 0.05 * clamp(1 - this.speed / 0.4, 0, 1) : 0;
  }
  pose(dt) {
    this.roll = lerp(this.roll, clamp(this.yawRate * 0.12, -0.4, 0.4), 1 - Math.exp(-dt * 4));
    const o = this.obj;
    o.position.copy(this.pos);
    o.rotation.set(this.roll, this.yaw, this.pitch);
  }

  /* 底栖：休息、在沙上觅食、偶尔冲上水面换气 */
  updBottom(dt, t) {
    const W = this.W, p = this.pos;
    this.modeT -= dt;
    const g = W.ground(p.x, p.z) + this.size * 0.07;
    const night = W.night;
    const f = this.d.hunger > 6 ? W.food.nearest(p, 3, (f) => f.floor || f.p.y < W.ground(f.p.x, f.p.z) + 0.8) : null;
    if (this.startle > 0) { this.startle -= dt; this.mode = "forage"; this.target = tmp3.copy(p).addScaledVector(this.flee, 1.2).clone(); this.modeT = 1.2; }
    if (f) { this.mode = "forage"; this.target = f.p; this.modeT = 2; if (f.p.distanceTo(p) < this.size * 0.4 + 0.06) { W.food.remove(f); W.onEat(this); } }
    if (this.modeT <= 0) {
      if (this.mode === "rest") {
        if (night < 0.5 && Math.random() < 0.08) { this.mode = "gulp"; this.gulpUp = true; this.wtT = 0; return; }
        this.mode = "forage"; this.modeT = 2 + Math.random() * 4;
        const c = this.school && this.school.center ? this.school.center : p;
        this.target = new THREE.Vector3(clamp(c.x + (Math.random() - 0.5) * 2.4, T.X0 + 0.5, T.X1 - 0.5), 0, clamp(c.z + (Math.random() - 0.5) * 1.6, T.Z0 + 0.4, T.Z1 - 0.4));
      } else { this.mode = "rest"; this.modeT = (night > 0.5 ? 6 : 1.5) + Math.random() * 4; }
    }
    let spd = 0;
    if (this.mode === "forage" && this.target) {
      const dx = this.target.x - p.x, dz = this.target.z - p.z, d = Math.hypot(dx, dz);
      if (d > 0.05) {
        const tYaw = Math.atan2(-dz, dx); const dy = clamp(angDiff(this.yaw, tYaw), -2 * dt, 2 * dt); this.yaw += dy; this.yawRate = clamp(dy / Math.max(dt, 1e-4), -2, 2);
        spd = (this.startle > 0 ? 1.4 : 0.22) * this.sp.speed / 0.28 * (night > 0.5 ? 0.4 : 1) * clamp(d * 2, 0.3, 1);
      } else this.mode = "rest";
    } else this.yawRate *= 0.9;
    this.speed = lerp(this.speed, spd, 1 - Math.exp(-dt * 3));
    p.x += Math.cos(this.yaw) * this.speed * dt; p.z -= Math.sin(this.yaw) * this.speed * dt;
    p.x = clamp(p.x, T.X0 + 0.25, T.X1 - 0.25); p.z = clamp(p.z, T.Z0 + 0.25, T.Z1 - 0.25);
    const bob = this.mode === "forage" ? Math.abs(Math.sin(t * 5 + this.seed)) * 0.015 : 0;
    p.y = lerp(p.y, W.ground(p.x, p.z) + this.size * 0.07 + bob, 1 - Math.exp(-dt * 6));
    void g;
    this.pitch = lerp(this.pitch, this.mode === "forage" ? -0.16 : -0.05, 1 - Math.exp(-dt * 3));
    this.head.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    this.anim(dt, 0.8 + this.speed * 8, 0.02 + this.speed * 0.3, 1.1);
    this.pose(dt);
  }

  /* 小精灵：吸附在玻璃上慢慢刮食 */
  updWall(dt, t) {
    const w = this.wall; this.modeT -= dt;
    this.wallDir += Math.sin(t * 0.3 + this.seed) * dt * 0.3;
    const moving = Math.sin(t * 0.25 + this.seed * 3) > 0.3;
    const v = moving ? 0.045 : 0;
    this.wallA += Math.cos(this.wallDir) * v * dt; this.wallB += Math.sin(this.wallDir) * v * dt * 0.6;
    const lim = w.n[0] ? 4.6 : 4.5;
    if (Math.abs(this.wallA) > lim) this.wallDir = Math.PI - this.wallDir;
    const gmin = 0.9, gmax = T.WATER - 0.35;
    if (this.wallB < gmin || this.wallB > gmax) this.wallDir = -this.wallDir;
    this.wallA = clamp(this.wallA, -lim, lim); this.wallB = clamp(this.wallB, gmin, gmax);
    const pp = w.at(this.wallA, this.wallB); this.pos.set(pp[0], pp[1], pp[2]);
    const N = tmp.set(w.n[0], w.n[1], w.n[2]);
    // 平面内的前进方向
    const a = tmp2.set(w.n[2] !== 0 ? 1 : 0, 0, w.n[0] !== 0 ? 1 : 0);
    const fwd = tmp3.copy(a).multiplyScalar(Math.cos(this.wallDir)).addScaledVector(UP, Math.sin(this.wallDir)).normalize();
    const Z = new THREE.Vector3().crossVectors(fwd, N).normalize();
    const m = new THREE.Matrix4().makeBasis(fwd, N, Z);
    tmp2.copy(this.pos).addScaledVector(N, this.size * 0.035); this.obj.position.lerp(tmp2, 1 - Math.exp(-dt * 3));
    this.obj.quaternion.slerp(new THREE.Quaternion().setFromRotationMatrix(m), 1 - Math.exp(-dt * 4));
    this.head.copy(fwd);
    this.yawRate = 0;
    this.anim(dt, moving ? 1.2 : 0.4, moving ? 0.03 : 0.01, 0.7);
    if (this.modeT <= 0 && Math.random() < 0.02 * dt * 60 && this.W.night < 0.5) this.leaveWall();
    if (this.mode === "swim") this.obj.rotation.setFromQuaternion(this.obj.quaternion, "YZX");
  }

  /* 樱花虾：在底床与石面上走走停停、用小钳子拾食 */
  updShrimp(dt, t) {
    const W = this.W, p = this.pos;
    this.modeT -= dt;
    if (this.jump > 0) {
      this.jump -= dt;
      p.addScaledVector(this.head, -1.4 * this.jump * dt * 3); p.y += 0.6 * this.jump * dt * 3;
      p.x = clamp(p.x, T.X0 + 0.2, T.X1 - 0.2); p.z = clamp(p.z, T.Z0 + 0.2, T.Z1 - 0.2);
      this.u.uPhase.value += dt * 30; this.u.uAmp.value = 0.1;
    } else {
      const g = W.ground(p.x, p.z) + 0.035;
      if (p.y > g + 0.01) p.y = Math.max(g, p.y - 0.35 * dt); else p.y = lerp(p.y, g, 1 - Math.exp(-dt * 8));
      const f = this.d.hunger > 6 ? W.food.nearest(p, 2.2, (f) => f.floor) : null;
      if (f) { this.mode = "walk"; this.target = f.p; this.modeT = 1; if (f.p.distanceTo(p) < 0.12) { W.food.remove(f); W.onEat(this); this.mode = "pick"; this.modeT = 4; } }
      if (this.modeT <= 0) {
        if (this.mode === "walk") { this.mode = "pick"; this.modeT = 2 + Math.random() * 5; }
        else { this.mode = "walk"; this.modeT = 3 + Math.random() * 4; const a = Math.random() * 6.28, r = 0.4 + Math.random() * 1.2; this.target = new THREE.Vector3(clamp(p.x + Math.cos(a) * r, T.X0 + 0.3, T.X1 - 0.3), 0, clamp(p.z + Math.sin(a) * r, T.Z0 + 0.3, T.Z1 - 0.3)); }
      }
      let spd = 0;
      if (this.mode === "walk" && this.target) {
        const dx = this.target.x - p.x, dz = this.target.z - p.z, d = Math.hypot(dx, dz);
        if (d > 0.05) { const tYaw = Math.atan2(-dz, dx); this.yaw += clamp(angDiff(this.yaw, tYaw), -1.5 * dt, 1.5 * dt); spd = this.sp.speed * (W.night > 0.5 ? 0.6 : 1); }
        else { this.mode = "pick"; this.modeT = 2 + Math.random() * 3; }
      }
      this.speed = lerp(this.speed, spd, 1 - Math.exp(-dt * 4));
      p.x += Math.cos(this.yaw) * this.speed * dt; p.z -= Math.sin(this.yaw) * this.speed * dt;
      p.x = clamp(p.x, T.X0 + 0.2, T.X1 - 0.2); p.z = clamp(p.z, T.Z0 + 0.2, T.Z1 - 0.2);
      // 顺着地面坡度抬头/低头
      const ahead = W.ground(p.x + Math.cos(this.yaw) * 0.15, p.z - Math.sin(this.yaw) * 0.15) - W.ground(p.x, p.z);
      this.pitch = lerp(this.pitch, clamp(Math.atan2(ahead, 0.15), -0.6, 0.6), 1 - Math.exp(-dt * 5));
      const u = this.u;
      u.uPhase.value += dt * (this.mode === "pick" ? 2 : 4);
      u.uAmp.value = 0.012;
      u.uFlut.value = this.mode === "pick" ? 16 : 11;
      u.uFlutK.value = this.mode === "pick" ? 0.5 : 0.9;
    }
    this.head.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    this.u.uTurn.value = 0;
    this.roll = 0;
    this.obj.position.copy(p); this.obj.rotation.set(0, this.yaw, this.pitch);
  }
}

/* ---------------- 鱼群管理 ---------------- */
export class School {
  constructor(scene, W) {
    this.scene = scene; this.W = W; this.list = []; this.byId = new Map(); this.groups = {};
    W.school = this;
  }
  sync(arr) {
    const ids = new Set(arr.map((f) => f.id));
    for (const f of [...this.list]) if (!ids.has(f.d.id)) { this.scene.remove(f.obj); f.obj.traverse((o) => o.material && o.material.dispose()); this.list.splice(this.list.indexOf(f), 1); this.byId.delete(f.d.id); }
    for (const d of arr) if (!this.byId.has(d.id)) { const g = this.group(d.sp); const f = new Fish(d, this.scene, this.W, g); this.list.push(f); this.byId.set(d.id, f); }
    else this.byId.get(d.id).d = d;
    for (const k in this.groups) this.groups[k].members = this.list.filter((f) => f.d.sp === k);
  }
  group(sp) { return (this.groups[sp] ||= { target: new THREE.Vector3(0, 3, 0), tT: 0, members: [], center: new THREE.Vector3() }); }
  near(p, r, self) { for (const f of this.list) if (f !== self && f.sp.beh !== "glass" && f.sp.beh !== "shrimp" && f.sp.beh !== "bottom" && f.pos.distanceTo(p) < r) return f; return null; }
  update(dt, t) {
    for (const k in this.groups) {
      const g = this.groups[k]; g.tT -= dt;
      if (g.members.length) { g.center.set(0, 0, 0); for (const m of g.members) g.center.add(m.pos); g.center.multiplyScalar(1 / g.members.length); }
      if (g.tT <= 0 || (g.members.length && g.center.distanceTo(g.target) < 0.8)) {
        g.tT = 5 + Math.random() * 7;
        const s = SP[k], night = this.W.night;
        const gy = 0.9, top = T.WATER - 0.4;
        let [a, b] = s.zone; if (night > 0.5) { a *= 0.5; b = b * 0.5 + 0.12; }
        let x = lerp(T.X0 + 1.4, T.X1 - 1.4, Math.random()), z = lerp(T.Z0 + 0.9, T.Z1 - 0.9, Math.random());
        if (night > 0.5 && this.W.hide.length) { const h = this.W.hide[Math.floor(Math.random() * this.W.hide.length)]; x = h[0]; z = clamp(h[2] + 0.6, T.Z0 + 0.8, T.Z1 - 0.8); }
        g.target.set(x, lerp(gy, top, lerp(a, b, Math.random())) + this.W.ground(x, z) * 0.5, z);
      }
    }
    for (const f of this.list) {
      const g = this.groups[f.d.sp];
      f.update(Math.min(dt, 0.05), t, g ? g.members : null);
      // 夜里红绿灯 / 红鼻剪刀的颜色变淡
      const ud = f.obj.userData;
      if (ud.glowable) ud.bodyM.emissiveIntensity = lerp(ud.bodyM.emissiveIntensity, (1 - this.W.night * 0.8) * (f.d.happy < 35 ? 0.5 : 1), 0.05);
    }
  }
  startle(pt, r = 3.2) {
    for (const f of this.list) if (f.pos.distanceTo(pt) < r * (0.7 + Math.random() * 0.6)) f.setStartle(pt);
  }
  pick(x, y, camera, w, h) {
    let best = null, bd = 1e9;
    for (const f of this.list) {
      tmp.copy(f.pos).project(camera);
      if (tmp.z > 1) continue;
      const sx = (tmp.x * 0.5 + 0.5) * w, sy = (-tmp.y * 0.5 + 0.5) * h;
      const pr = tmp2.copy(f.pos).addScaledVector(camera.up, f.size * 0.5).project(camera);
      const rad = Math.max(26, Math.abs((pr.y - tmp.y) * 0.5 * h) * 1.6);
      const d = Math.hypot(sx - x, sy - y);
      if (d < rad && d < bd) { bd = d; best = f; }
    }
    return best;
  }
}
