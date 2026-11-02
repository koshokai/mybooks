/* 星际竞速 · 场景装饰：行星、红巨星、黑洞、陨石带、霓虹城市、空间站环、晶体、全息广告牌 */
import * as THREE from 'three';
import { makeTextPlane, mergeGeos } from './track.js';

const C = (h) => new THREE.Color(h);

/* ---------- 简单 3D 值噪声（JS，用于陨石变形） ---------- */
function hash3(x, y, z) { let h = (x * 374761393 + y * 668265263 + z * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967295; }
function vnoise(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const l = (a, b, t) => a + (b - a) * t;
  return l(l(l(hash3(xi, yi, zi), hash3(xi + 1, yi, zi), u), l(hash3(xi, yi + 1, zi), hash3(xi + 1, yi + 1, zi), u), v),
    l(l(hash3(xi, yi, zi + 1), hash3(xi + 1, yi, zi + 1), u), l(hash3(xi, yi + 1, zi + 1), hash3(xi + 1, yi + 1, zi + 1), u), v), w);
}

function rockGeometry(seed, detail = 2) {
  const g = new THREE.IcosahedronGeometry(1, detail);
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = vnoise(v.x * 1.6 + seed, v.y * 1.6, v.z * 1.6) * 0.55 + vnoise(v.x * 4 + seed, v.y * 4, v.z * 4) * 0.18;
    v.multiplyScalar(0.72 + n);
    v.y *= 0.82;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  const ng = g.index ? g.toNonIndexed() : g;
  ng.computeVertexNormals();
  if (ng !== g) g.dispose();
  return ng;
}

/** 距离赛道是否足够远（粗网格查询） */
function makeClearance(track, cell = 40) {
  const grid = new Map();
  for (let i = 0; i < track.n; i += 4) {
    const x = track.P[i * 3], y = track.P[i * 3 + 1], z = track.P[i * 3 + 2];
    const k = `${Math.floor(x / cell)},${Math.floor(z / cell)}`;
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(x, y, z);
  }
  return (x, y, z, r) => {
    const cx = Math.floor(x / cell), cz = Math.floor(z / cell), span = Math.ceil(r / cell) + 1;
    for (let a = -span; a <= span; a++) for (let b = -span; b <= span; b++) {
      const arr = grid.get(`${cx + a},${cz + b}`);
      if (!arr) continue;
      for (let i = 0; i < arr.length; i += 3) {
        const dx = arr[i] - x, dy = arr[i + 1] - y, dz = arr[i + 2] - z;
        if (dx * dx + dy * dy + dz * dz < r * r) return false;
      }
    }
    return true;
  };
}

/* ---------- 行星 ---------- */
function planet(radius, colA, colB, colAtm, sunDir, seed, bands = 7) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uA: { value: C(colA) }, uB: { value: C(colB) }, uAtm: { value: C(colAtm) }, uSun: { value: sunDir.clone().normalize() }, uSeed: { value: seed }, uBands: { value: bands } },
    vertexShader: /* glsl */`
      varying vec3 vN; varying vec3 vP; varying vec3 vW;
      void main() { vN = normalize(mat3(modelMatrix) * normal); vP = position; vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */`
      uniform vec3 uA, uB, uAtm, uSun; uniform float uSeed, uBands; varying vec3 vN; varying vec3 vP; varying vec3 vW;
      float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
      float noise(vec3 x) { vec3 i = floor(x), f = fract(x); f = f*f*(3.0-2.0*f);
        return mix(mix(mix(hash(i), hash(i+vec3(1,0,0)), f.x), mix(hash(i+vec3(0,1,0)), hash(i+vec3(1,1,0)), f.x), f.y),
                   mix(mix(hash(i+vec3(0,0,1)), hash(i+vec3(1,0,1)), f.x), mix(hash(i+vec3(0,1,1)), hash(i+vec3(1,1,1)), f.x), f.y), f.z); }
      float fbm(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * noise(p); p *= 2.1; a *= 0.5; } return s; }
      void main() {
        vec3 p = normalize(vP);
        float lat = p.y;
        float turb = fbm(p * 3.0 + uSeed) * 0.9;
        float b = sin((lat + turb * 0.18) * uBands * 3.1416) * 0.5 + 0.5;
        float b2 = fbm(vec3(lat * 14.0, p.x * 2.0, p.z * 2.0) + uSeed);
        vec3 col = mix(uA, uB, smoothstep(0.2, 0.8, b * 0.7 + b2 * 0.5));
        vec3 N = normalize(vN);
        float dl = dot(N, normalize(uSun));
        float lit = smoothstep(-0.15, 0.6, dl);
        vec3 V = normalize(cameraPosition - vW);
        float rim = pow(1.0 - max(dot(N, V), 0.0), 3.0);
        col = col * (0.02 + lit * 0.42) + uAtm * rim * (0.12 + lit * 0.75);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(radius, 64, 40), mat);
  return m;
}

function planetRing(inner, outer, col, sunDir) {
  const g = new THREE.RingGeometry(inner, outer, 128, 1);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uCol: { value: C(col) }, uIn: { value: inner }, uOut: { value: outer } },
    vertexShader: /* glsl */`varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: /* glsl */`
      uniform vec3 uCol; uniform float uIn, uOut; varying vec3 vP;
      float h(float x){ return fract(sin(x * 91.7) * 43758.5453); }
      void main() {
        float r = (length(vP.xy) - uIn) / (uOut - uIn);
        float bands = 0.5 + 0.5 * sin(r * 90.0) * sin(r * 23.0 + 1.0);
        float gaps = smoothstep(0.02, 0.06, abs(r - 0.62)) * smoothstep(0.01, 0.03, abs(r - 0.3));
        float a = bands * gaps * smoothstep(0.0, 0.08, r) * smoothstep(1.0, 0.85, r);
        gl_FragColor = vec4(uCol * a * 0.9, a * 0.85);
      }`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
  return new THREE.Mesh(g, mat);
}

function glowSprite(color, size, power = 1.6) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 256;
  const x = cv.getContext('2d');
  const gr = x.createRadialGradient(128, 128, 0, 128, 128, 128);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.18, 'rgba(255,255,255,0.55)');
  gr.addColorStop(0.45, 'rgba(255,255,255,0.12)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = gr; x.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(cv);
  const mat = new THREE.SpriteMaterial({ map: tex, color: C(color).multiplyScalar(power), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
  const s = new THREE.Sprite(mat);
  s.scale.set(size, size, 1);
  return s;
}

/* ---------- 陨石带 ---------- */
function asteroids(track, count, opts) {
  const clear = makeClearance(track);
  const geos = [rockGeometry(1.3), rockGeometry(7.7), rockGeometry(13.1)];
  const mat = new THREE.MeshStandardMaterial({ color: opts.color || '#5a524c', roughness: 0.92, metalness: 0.08, flatShading: true });
  const groups = geos.map((g) => new THREE.InstancedMesh(g, mat, Math.ceil(count / 3)));
  const spins = [];
  const c = track.center;
  const R = track.radius;
  let placed = 0, tries = 0;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), p = new THREE.Vector3();
  const counts = [0, 0, 0];
  while (placed < count && tries < count * 40) {
    tries++;
    const a = Math.random() * Math.PI * 2;
    const rr = R * (opts.rMin + Math.random() * (opts.rMax - opts.rMin));
    p.set(c.x + Math.cos(a) * rr, 40 + (Math.random() - 0.5) * opts.ySpread + (opts.yOff || 0), c.z + Math.sin(a) * rr);
    const big = Math.random() < 0.12;
    const size = big ? 18 + Math.random() * 40 : 2 + Math.pow(Math.random(), 2) * 14;
    if (!clear(p.x, p.y, p.z, size + track.half + 16)) continue;
    const gi = placed % 3;
    e.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    q.setFromEuler(e);
    s.set(size, size * (0.7 + Math.random() * 0.5), size * (0.8 + Math.random() * 0.4));
    m4.compose(p, q, s);
    groups[gi].setMatrixAt(counts[gi], m4);
    spins.push({ g: gi, i: counts[gi], p: p.clone(), q: q.clone(), s: s.clone(), axis: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize(), w: (Math.random() - 0.5) * 0.3 });
    counts[gi]++;
    placed++;
  }
  const grp = new THREE.Group();
  groups.forEach((g, i) => { g.count = counts[i]; g.instanceMatrix.needsUpdate = true; g.frustumCulled = false; grp.add(g); });
  const dq = new THREE.Quaternion();
  grp.userData.update = (t, dt) => {
    // 每帧只更新一部分，节省 CPU
    const step = 3, off = Math.floor(t * 60) % step;
    for (let k = off; k < spins.length; k += step) {
      const sp = spins[k];
      dq.setFromAxisAngle(sp.axis, sp.w * dt * step);
      sp.q.premultiply(dq);
      m4.compose(sp.p, sp.q, sp.s);
      groups[sp.g].setMatrixAt(sp.i, m4);
    }
    groups.forEach((g) => { g.instanceMatrix.needsUpdate = true; });
  };
  return grp;
}

/* ---------- 霓虹城市（远在赛道下方） ---------- */
function neonCity(track, count, pal) {
  const geo = new THREE.BoxGeometry(1, 1, 1);
  geo.translate(0, 0.5, 0);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uW1: { value: C(pal.accent) }, uW2: { value: C(pal.accent2) }, uW3: { value: C('#ffd9a0') }, uFacade: { value: C('#070912') }, uFog: { value: C(pal.sky) } },
    vertexShader: /* glsl */`
      varying vec3 vL; varying vec3 vNL; varying float vSeed; varying float vDist;
      void main() {
        vec3 sc = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
        vL = position * sc; vNL = normal;
        vSeed = fract(instanceMatrix[3].x * 0.0137 + instanceMatrix[3].z * 0.0071);
        vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
        vDist = length(w.xyz - cameraPosition);
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uW1, uW2, uW3, uFacade, uFog; varying vec3 vL; varying vec3 vNL; varying float vSeed; varying float vDist;
      float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      void main() {
        vec3 n = abs(vNL);
        vec3 col = uFacade;
        if (n.y > 0.5) {
          col = uFacade * 2.0 + uW1 * 0.12;
        } else {
          vec2 f = n.x > 0.5 ? vec2(vL.z, vL.y) : vec2(vL.x, vL.y);
          vec2 cs = vec2(5.0, 6.5);
          vec2 cell = floor(f / cs); vec2 g = fract(f / cs);
          float win = step(0.2, g.x) * step(g.x, 0.8) * step(0.25, g.y) * step(g.y, 0.75);
          float on = step(0.5, h(cell + vSeed * 31.0));
          float k = h(cell * 1.7 + vSeed * 7.0);
          vec3 wc = k < 0.45 ? uW1 : (k < 0.7 ? uW2 : uW3);
          // 远处窗户融合为平均亮度，避免闪烁
          float far = smoothstep(500.0, 1400.0, vDist);
          col += wc * mix(win * on * 1.6, 0.22, far);
          // 楼顶霓虹边
          col += uW1 * smoothstep(1.5, 0.0, abs(vL.y - (vL.y > 0.0 ? 0.0 : 0.0))) * 0.0;
        }
        col = mix(col, uFog, 1.0 - exp(-vDist * 0.00035));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const inst = new THREE.InstancedMesh(geo, mat, count);
  const c = track.center, R = track.radius * 1.6;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()) * R;
    const tall = Math.random() < 0.15;
    const hgt = tall ? 140 + Math.random() * 200 : 30 + Math.random() * 110;
    p.set(c.x + Math.cos(a) * rr, -340, c.z + Math.sin(a) * rr);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * Math.PI);
    s.set(20 + Math.random() * 40, hgt, 20 + Math.random() * 40);
    m4.compose(p, q, s);
    inst.setMatrixAt(i, m4);
  }
  inst.instanceMatrix.needsUpdate = true;
  inst.frustumCulled = false;
  const grp = new THREE.Group();
  grp.add(inst);
  // 城市的地面光晕
  const glow = new THREE.Mesh(new THREE.CircleGeometry(R * 1.1, 64), new THREE.MeshBasicMaterial({ color: C(pal.accent).multiplyScalar(0.05), transparent: true, opacity: 1, depthWrite: false, blending: THREE.AdditiveBlending }));
  glow.rotation.x = -Math.PI / 2;
  glow.position.set(c.x, -342, c.z);
  grp.add(glow);
  // 光柱
  const beamGeo = new THREE.CylinderGeometry(2.5, 2.5, 900, 8, 1, true);
  beamGeo.translate(0, 450, 0);
  const beamMat = new THREE.ShaderMaterial({
    uniforms: { uCol: { value: C(pal.accent2) } },
    vertexShader: /* glsl */`varying float vY; void main(){ vY = position.y / 900.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: /* glsl */`uniform vec3 uCol; varying float vY; void main(){ gl_FragColor = vec4(uCol * pow(1.0 - vY, 3.0) * 1.4, 1.0); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  for (let i = 0; i < 7; i++) {
    const b = new THREE.Mesh(beamGeo, beamMat);
    const a = Math.random() * Math.PI * 2, rr = (0.3 + Math.random() * 0.9) * R;
    b.position.set(c.x + Math.cos(a) * rr, -340, c.z + Math.sin(a) * rr);
    b.rotation.z = (Math.random() - 0.5) * 0.25;
    grp.add(b);
  }
  return grp;
}

/* ---------- 赛道环（空间站环，赛道从中间穿过） ---------- */
function stationRings(track, fracs, pal) {
  const grp = new THREE.Group();
  const f = { P: new THREE.Vector3(), T: new THREE.Vector3(), L: new THREE.Vector3(), U: new THREE.Vector3() };
  const R = track.half + 16;
  const ringGeo = new THREE.TorusGeometry(R, 2.4, 10, 96);
  const lightGeo = new THREE.TorusGeometry(R - 2.6, 0.35, 6, 96);
  const dark = new THREE.MeshStandardMaterial({ color: '#1b2233', metalness: 0.9, roughness: 0.3 });
  const lightMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uA: { value: C(pal.accent) }, uB: { value: C(pal.accent2) } },
    vertexShader: /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: /* glsl */`uniform float uTime; uniform vec3 uA, uB; varying vec2 vUv;
      void main(){ float x = fract(vUv.x * 24.0 - uTime * 0.6); float d = smoothstep(0.0, 0.1, x) * smoothstep(0.7, 0.5, x); gl_FragColor = vec4(mix(uA, uB, step(0.5, fract(vUv.x * 12.0))) * (0.4 + d * 2.6), 1.0); }`,
  });
  const updaters = [];
  const lampMat = new THREE.MeshBasicMaterial({ color: C(pal.accent2).multiplyScalar(4) });
  for (const fr of fracs) {
    track.frameAt(fr * track.length, f);
    const holder = new THREE.Group();
    const m = new THREE.Matrix4().makeBasis(f.L.clone().negate(), f.U, f.T.clone().negate());
    holder.quaternion.setFromRotationMatrix(m);
    holder.position.copy(f.P).addScaledVector(f.U, 4);
    const spin = new THREE.Group();
    // 环体 + 6 个舱段合并成一个网格，灯合并成一个网格
    const parts = [ringGeo.clone()], lamps = [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const pod = new THREE.BoxGeometry(5, 5, 7);
      pod.rotateZ(a); pod.translate(Math.cos(a) * (R + 3), Math.sin(a) * (R + 3), 0);
      parts.push(pod);
      const lamp = new THREE.SphereGeometry(1.1, 10, 8);
      lamp.translate(Math.cos(a) * (R + 6.2), Math.sin(a) * (R + 6.2), 0);
      lamps.push(lamp);
    }
    spin.add(new THREE.Mesh(mergeGeos(parts), dark));
    spin.add(new THREE.Mesh(lightGeo, lightMat));
    spin.add(new THREE.Mesh(mergeGeos(lamps), lampMat));
    holder.add(spin);
    grp.add(holder);
    const dir = fracs.indexOf(fr) % 2 ? 1 : -1;
    updaters.push((t) => { spin.rotation.z = t * 0.12 * dir; });
  }
  grp.userData.update = (t) => { lightMat.uniforms.uTime.value = t; updaters.forEach((u) => u(t)); };
  return grp;
}

/* ---------- 红巨星 ---------- */
function redGiant(pos, radius, pal) {
  const grp = new THREE.Group();
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uA: { value: C('#ff5a1a') }, uB: { value: C('#ffd27a') } },
    vertexShader: /* glsl */`varying vec3 vP; varying vec3 vN; varying vec3 vW; void main(){ vP = position; vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */`
      uniform float uTime; uniform vec3 uA, uB; varying vec3 vP; varying vec3 vN; varying vec3 vW;
      float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
      float noise(vec3 x) { vec3 i = floor(x), f = fract(x); f = f*f*(3.0-2.0*f);
        return mix(mix(mix(hash(i), hash(i+vec3(1,0,0)), f.x), mix(hash(i+vec3(0,1,0)), hash(i+vec3(1,1,0)), f.x), f.y),
                   mix(mix(hash(i+vec3(0,0,1)), hash(i+vec3(1,0,1)), f.x), mix(hash(i+vec3(0,1,1)), hash(i+vec3(1,1,1)), f.x), f.y), f.z); }
      float fbm(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * noise(p); p *= 2.07; a *= 0.5; } return s; }
      void main() {
        vec3 p = normalize(vP) * 3.0;
        float n = fbm(p + vec3(uTime * 0.03, uTime * 0.02, 0.0) + fbm(p * 2.0 - uTime * 0.02));
        vec3 V = normalize(cameraPosition - vW);
        float limb = pow(max(dot(normalize(vN), V), 0.0), 0.5);
        vec3 col = mix(uA, uB, smoothstep(0.35, 0.75, n)) * (1.4 + n * 2.2) * (0.35 + 0.65 * limb);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const sun = new THREE.Mesh(new THREE.SphereGeometry(radius, 64, 40), mat);
  grp.add(sun);
  const corona = glowSprite('#ff7a30', radius * 5.2, 1.4);
  const corona2 = glowSprite('#ffb060', radius * 2.6, 1.2);
  grp.add(corona, corona2);
  grp.position.copy(pos);
  grp.userData.update = (t) => { mat.uniforms.uTime.value = t; };
  return grp;
}

/* ---------- 黑洞 ---------- */
function blackHole(pos, radius, pal) {
  const grp = new THREE.Group();
  const hole = new THREE.Mesh(new THREE.SphereGeometry(radius, 48, 32), new THREE.MeshBasicMaterial({ color: '#000000' }));
  hole.renderOrder = 3;
  const diskMat = (lensed) => new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uIn: { value: radius * (lensed ? 1.02 : 1.35) }, uOut: { value: radius * (lensed ? 1.9 : 5.2) }, uHot: { value: C('#fff3d6') }, uA: { value: C(pal.accent2) }, uB: { value: C(pal.accent) }, uLensed: { value: lensed ? 1 : 0 } },
    vertexShader: /* glsl */`varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: /* glsl */`
      uniform float uTime, uIn, uOut, uLensed; uniform vec3 uHot, uA, uB; varying vec3 vP;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 x) { vec2 i = floor(x), f = fract(x); f = f*f*(3.0-2.0*f); return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y); }
      void main() {
        float r = length(vP.xy);
        float t = (r - uIn) / (uOut - uIn);
        if (t < 0.0 || t > 1.0) discard;
        float ang = atan(vP.y, vP.x);
        float sp = uTime * (0.25 / (0.15 + t));
        float n = noise(vec2(ang * 6.0 + sp * 3.0 + t * 9.0, t * 26.0)) * 0.6 + noise(vec2(ang * 15.0 + sp * 5.0, t * 60.0)) * 0.4;
        float bright = pow(1.0 - t, 2.2) * (0.5 + n * 0.9);
        float doppler = 1.0 + 0.55 * sin(ang + 0.6);
        vec3 col = mix(uHot, mix(uA, uB, smoothstep(0.2, 0.8, t)), smoothstep(0.0, 0.35, t));
        float edge = smoothstep(0.0, 0.04, t) * smoothstep(1.0, 0.6, t);
        if (uLensed > 0.5) { bright *= 0.7; }
        gl_FragColor = vec4(col * bright * doppler * edge * 3.2, 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const disk = new THREE.Mesh(new THREE.RingGeometry(radius * 1.35, radius * 5.2, 160, 8), diskMat(false));
  disk.rotation.x = -Math.PI / 2 + 0.2;
  const lensMat = diskMat(true);
  const lens = new THREE.Mesh(new THREE.RingGeometry(radius * 1.02, radius * 1.9, 128, 4), lensMat);
  const halo = glowSprite(pal.accent, radius * 9, 0.9);
  grp.add(halo, disk, lens, hole);
  grp.position.copy(pos);
  grp.userData.update = (t, dt, cam) => {
    disk.material.uniforms.uTime.value = t;
    lensMat.uniforms.uTime.value = t;
    lens.quaternion.copy(cam.quaternion); // 透镜环始终面向镜头
  };
  return grp;
}

/* ---------- 漂浮晶体 ---------- */
function crystals(track, count, pal) {
  const clear = makeClearance(track);
  const geo = new THREE.OctahedronGeometry(1, 0);
  geo.scale(0.5, 1.6, 0.5);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uA: { value: C(pal.accent) }, uB: { value: C(pal.accent2) }, uTime: { value: 0 } },
    vertexShader: /* glsl */`
      varying vec3 vN; varying vec3 vV; varying float vS;
      void main() { vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0); vN = normalize(mat3(modelMatrix * instanceMatrix) * normal); vV = normalize(cameraPosition - w.xyz); vS = fract(instanceMatrix[3].x * 0.01); gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */`
      uniform vec3 uA, uB; uniform float uTime; varying vec3 vN; varying vec3 vV; varying float vS;
      void main() { float f = pow(1.0 - abs(dot(normalize(vN), vV)), 2.0); vec3 c = mix(uA, uB, step(0.6, vS)); float pulse = 0.7 + 0.3 * sin(uTime * 1.5 + vS * 40.0); gl_FragColor = vec4(c * (0.12 + f * 2.2) * pulse, 1.0); }`,
  });
  const inst = new THREE.InstancedMesh(geo, mat, count);
  const c = track.center, R = track.radius;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), e = new THREE.Euler();
  let k = 0, tries = 0;
  while (k < count && tries < count * 30) {
    tries++;
    const a = Math.random() * Math.PI * 2, rr = R * (0.2 + Math.random() * 1.5);
    p.set(c.x + Math.cos(a) * rr, 40 + (Math.random() - 0.4) * 220, c.z + Math.sin(a) * rr);
    const sz = 4 + Math.random() * 18;
    if (!clear(p.x, p.y, p.z, sz * 1.8 + track.half + 12)) continue;
    e.set((Math.random() - 0.5) * 0.8, Math.random() * 6, (Math.random() - 0.5) * 0.8);
    q.setFromEuler(e);
    s.set(sz, sz, sz);
    m4.compose(p, q, s);
    inst.setMatrixAt(k++, m4);
  }
  inst.count = k;
  inst.instanceMatrix.needsUpdate = true;
  inst.frustumCulled = false;
  inst.userData.update = (t) => { mat.uniforms.uTime.value = t; };
  return inst;
}

/* ---------- 全息广告牌 ---------- */
function holoSigns(track, list, pal) {
  const grp = new THREE.Group();
  const f = { P: new THREE.Vector3(), T: new THREE.Vector3(), L: new THREE.Vector3(), U: new THREE.Vector3() };
  const mats = [];
  list.forEach(([fr, side, texts, color], i) => {
    track.frameAt(fr * track.length, f);
    const sign = makeTextPlane(texts, color || (i % 2 ? pal.accent2 : pal.accent), 512, 160);
    sign.scale.set(30, 9.4, 1);
    const pos = f.P.clone().addScaledVector(f.L, side * (track.half + 15)).addScaledVector(f.U, 12);
    sign.position.copy(pos);
    // 面向迎面驶来的车（略朝向赛道中心）
    const look = pos.clone().addScaledVector(f.T, -60).addScaledVector(f.L, -side * 22);
    sign.lookAt(look);
    grp.add(sign);
    mats.push(sign.userData.holo);
    // 支架
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 14, 6), new THREE.MeshStandardMaterial({ color: '#202634', metalness: 0.8, roughness: 0.4 }));
    pole.position.copy(f.P).addScaledVector(f.L, side * (track.half + 15)).addScaledVector(f.U, 1);
    pole.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), f.U);
    grp.add(pole);
  });
  grp.userData.update = (t) => { mats.forEach((m) => { m.uniforms.uTime.value = t; }); };
  return grp;
}

/** 螺旋核心（幽冥视界中央） */
function spiralCore(track, pal) {
  // 找螺旋段（0.36~0.58）中心
  const c = new THREE.Vector3(); let n = 0;
  for (let fr = 0.37; fr < 0.57; fr += 0.005) { const i = Math.floor(fr * track.n) * 3; c.x += track.P[i]; c.y += track.P[i + 1]; c.z += track.P[i + 2]; n++; }
  c.divideScalar(n);
  const grp = new THREE.Group();
  grp.position.copy(c);
  const orbMat = new THREE.ShaderMaterial({
    uniforms: { uA: { value: C(pal.accent2) }, uB: { value: C(pal.accent) }, uTime: { value: 0 } },
    vertexShader: /* glsl */`varying vec3 vN; varying vec3 vV; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vN = normalize(mat3(modelMatrix)*normal); vV = normalize(cameraPosition - w.xyz); gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */`uniform vec3 uA, uB; uniform float uTime; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1.0 - max(dot(normalize(vN), vV), 0.0), 1.5); float p = 0.8 + 0.2 * sin(uTime * 3.0); gl_FragColor = vec4(mix(uA * 2.5, uB * 3.0, f) * p * (0.4 + f), 1.0); }`,
  });
  const orb = new THREE.Mesh(new THREE.SphereGeometry(14, 40, 28), orbMat);
  grp.add(orb);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 600, 16, 1, true), new THREE.ShaderMaterial({
    uniforms: { uCol: { value: C(pal.accent) } },
    vertexShader: /* glsl */`varying float vY; varying vec3 vN; varying vec3 vV; void main(){ vY = position.y / 300.0; vec4 w = modelMatrix * vec4(position,1.0); vN = normalize(mat3(modelMatrix)*normal); vV = normalize(cameraPosition - w.xyz); gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */`uniform vec3 uCol; varying float vY; varying vec3 vN; varying vec3 vV; void main(){ float f = abs(dot(normalize(vN), vV)); gl_FragColor = vec4(uCol * (1.0 - abs(vY)) * f * 1.6, 1.0); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  }));
  grp.add(beam);
  grp.add(glowSprite(pal.accent2, 140, 1.2));
  const rings = [];
  for (let i = 0; i < 3; i++) {
    const r = new THREE.Mesh(new THREE.TorusGeometry(26 + i * 9, 0.5, 6, 80), new THREE.MeshBasicMaterial({ color: C(i % 2 ? pal.accent : pal.accent2).multiplyScalar(2.5) }));
    grp.add(r); rings.push(r);
  }
  grp.userData.update = (t) => {
    orbMat.uniforms.uTime.value = t;
    rings.forEach((r, i) => { r.rotation.x = t * (0.3 + i * 0.17); r.rotation.y = t * (0.21 - i * 0.11); });
  };
  return grp;
}

/* ---------- 汇总 ---------- */
export function buildScenery(kind, track, pal, q) {
  const grp = new THREE.Group();
  const updaters = [];
  const add = (o) => { grp.add(o); if (o.userData.update) updaters.push(o.userData.update); };
  const sunDir = new THREE.Vector3(...pal.sunDir).normalize();
  const c = track.center.clone(); c.y = 40;
  const R = track.radius;
  if (kind === 'harbor') {
    const gp = new THREE.Vector3(-0.62, 0.2, -0.76).normalize();
    const giant = planet(1100, '#1d6f9a', '#bfe9ff', '#7fd8ff', sunDir, 3.1, 9);
    giant.position.copy(c).addScaledVector(gp, 5200);
    giant.rotation.z = 0.35;
    add(giant);
    const ring = planetRing(1400, 2500, '#9fd8ff', sunDir);
    ring.position.copy(giant.position);
    ring.rotation.set(-Math.PI / 2 + 0.42, 0, 0.35);
    add(ring);
    const moon = planet(220, '#6a5a8a', '#c9b8ff', '#c08bff', sunDir, 7.7, 4);
    moon.position.copy(c).addScaledVector(new THREE.Vector3(0.7, 0.32, -0.55).normalize(), 3800);
    add(moon);
    add(neonCity(track, q.low ? 170 : 420, pal));
    add(stationRings(track, [0.27, 0.66], pal));
    add(asteroids(track, q.low ? 40 : 90, { rMin: 0.9, rMax: 2.2, ySpread: 260, color: '#4a4f5a' }));
    add(holoSigns(track, [
      [0.035, 1, ['星港欢迎你', 'WELCOME TO NEON HARBOR']],
      [0.19, -1, ['银河速度联赛', 'GALACTIC SPEED LEAGUE · 第七赛季'], pal.accent2],
      [0.42, 1, ['限速：光速', 'SPEED LIMIT · c']],
      [0.6, -1, ['加速带 ▶▶', 'BOOST LANE AHEAD'], pal.accent2],
      [0.83, 1, ['星港不夜城', 'THE CITY THAT NEVER DIMS']],
    ], pal));
  } else if (kind === 'ember') {
    add(redGiant(c.clone().addScaledVector(sunDir, 7000), 1500, pal));
    const p2 = planet(380, '#3a1a12', '#a8502a', '#ff8a4a', sunDir, 5.5, 5);
    p2.position.copy(c).addScaledVector(new THREE.Vector3(0.75, 0.28, 0.6).normalize(), 3600);
    add(p2);
    add(asteroids(track, q.low ? 120 : 280, { rMin: 0.15, rMax: 2.0, ySpread: 300, color: '#6a4a3a' }));
    add(holoSigns(track, [
      [0.03, -1, ['赤炎环带', 'CRIMSON BELT']],
      [0.25, 1, ['危险 · 陨石区', 'CAUTION · DEBRIS FIELD'], '#ff4f4f'],
      [0.5, -1, ['立交飞越', 'SKY BRIDGE · 40 M'], pal.accent2],
      [0.74, 1, ['能量补给 ▲', 'BOOST PADS'], pal.accent2],
    ], pal));
  } else {
    const bhDir = new THREE.Vector3(0.35, 0.1, 0.93).normalize();
    add(blackHole(c.clone().addScaledVector(bhDir, 3600), 300, pal));
    add(crystals(track, q.low ? 60 : 140, pal));
    add(asteroids(track, q.low ? 40 : 80, { rMin: 0.6, rMax: 2.2, ySpread: 320, color: '#3a3448' }));
    add(spiralCore(track, pal));
    const p3 = planet(260, '#1a1030', '#5a3a9a', '#9a7bff', sunDir, 9.3, 3);
    p3.position.copy(c).addScaledVector(new THREE.Vector3(-0.8, 0.4, -0.4).normalize(), 4200);
    add(p3);
    add(holoSigns(track, [
      [0.03, 1, ['幽冥视界', 'VOID HORIZON']],
      [0.3, -1, ['引力异常', 'GRAVITY ANOMALY'], pal.accent2],
      [0.62, 1, ['事件视界 · 请勿靠近', 'DO NOT CROSS THE HORIZON'], pal.glow3],
      [0.86, -1, ['最后的弯道', 'FINAL TURNS'], pal.accent2],
    ], pal));
  }
  grp.userData.update = (t, dt, cam) => updaters.forEach((u) => u(t, dt, cam));
  return grp;
}
