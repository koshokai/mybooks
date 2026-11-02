// 世界环境：天空、地面、世界之树、草地、粒子、光柱
import * as THREE from 'three';
import { rng, rvec, taperTube, bendDir, Parts, stdMat, SHARED } from './plants.js';

const V3 = THREE.Vector3, TAU = Math.PI * 2;

export const U = {
  uTime: { value: 0 },
  uGrow: { value: 0 },
  uTotal: { value: 1 },
};

const WIND = `
vec3 wind(vec3 p){
  float h = max(p.y - 3.0, 0.0);
  float a = h * h * 0.0026;
  return vec3(sin(uTime*0.8 + p.y*0.15 + p.z*0.12), 0.0, cos(uTime*0.63 + p.y*0.12 + p.x*0.1)) * a;
}`;

/* ---------------- 天空 ---------------- */
export function createSky(scene) {
  const u = {
    uTop: { value: new THREE.Color() }, uMid: { value: new THREE.Color() }, uBot: { value: new THREE.Color() },
    uAur: { value: new THREE.Color() }, uStars: { value: 1 }, uTime: U.uTime,
  };
  const m = new THREE.ShaderMaterial({
    uniforms: u, side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: `varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `
      uniform vec3 uTop,uMid,uBot,uAur; uniform float uStars,uTime; varying vec3 vDir;
      float hash(vec3 p){ p = fract(p*0.3183099+0.1); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
      void main(){
        vec3 d = normalize(vDir); float h = d.y;
        vec3 col = mix(uBot, uMid, smoothstep(-0.08, 0.28, h));
        col = mix(col, uTop, smoothstep(0.25, 0.9, h));
        vec3 sp = d*180.0; vec3 id = floor(sp); float r = hash(id);
        float st = step(0.982, r) * smoothstep(0.42, 0.0, length(fract(sp)-0.5));
        st *= smoothstep(0.06, 0.45, h) * (0.55 + 0.45*sin(uTime*(1.0+r*3.0) + r*90.0));
        col += st * vec3(1.0, 0.95, 0.9) * 1.6 * uStars;
        float a = sin(d.x*3.1 + uTime*0.05)*0.5 + sin(d.z*4.3 - uTime*0.07)*0.5;
        float band = smoothstep(0.05, 0.3, h) * smoothstep(0.85, 0.35, h) * pow(max(0.0, sin(h*8.0 + a*2.2 + uTime*0.03)), 5.0);
        col += uAur * band * 0.45;
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(400, 48, 24), m);
  mesh.renderOrder = -10;
  scene.add(mesh);

  // 月亮
  const mu = { uCol: { value: new THREE.Color() } };
  const moon = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({
    uniforms: mu, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv*2.0-1.0; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `uniform vec3 uCol; varying vec2 vUv; void main(){ float r = length(vUv);
      float disc = smoothstep(0.22, 0.2, r);
      float crater = 0.88 + 0.12*sin(vUv.x*23.0+vUv.y*9.0)*sin(vUv.y*17.0-vUv.x*5.0);
      float halo = exp(-r*5.0)*0.55 + exp(-r*12.0)*0.4;
      gl_FragColor = vec4(uCol*(disc*1.8*crater + halo), 1.0); }`,
  }));
  moon.scale.setScalar(150);
  moon.position.set(-150, 120, -260);
  moon.renderOrder = -9;
  scene.add(moon);
  return { u, mu, mesh, moon };
}

/* ---------------- 地面 ---------------- */
export function createGround(scene) {
  const u = {
    uCol: { value: new THREE.Color() }, uIn: { value: new THREE.Color() }, uGlow: { value: new THREE.Color() },
    uFog: { value: new THREE.Color() }, uRing: { value: 11 }, uTime: U.uTime, uGrow: U.uGrow,
  };
  const m = new THREE.ShaderMaterial({
    uniforms: u,
    vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `
      uniform vec3 uCol,uIn,uGlow,uFog; uniform float uRing,uTime,uGrow; varying vec3 vP;
      float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
      float n2(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(h2(i),h2(i+vec2(1,0)),f.x), mix(h2(i+vec2(0,1)),h2(i+vec2(1,1)),f.x), f.y); }
      void main(){
        float r = length(vP.xz); float ang = atan(vP.z, vP.x);
        float nz = n2(vP.xz*0.35)*0.6 + n2(vP.xz*1.3)*0.4;
        vec3 col = mix(uIn, uCol, smoothstep(0.0, 14.0, r)) * (0.75 + 0.5*nz);
        float veins = pow(max(0.0, sin(ang*9.0 + sin(r*1.1)*1.6 + nz*1.5)), 36.0) * smoothstep(10.0, 1.5, r) * smoothstep(0.9, 1.8, r);
        float pulse = 0.5 + 0.5*sin(r*1.4 - uTime*2.2);
        float reach = smoothstep(uGrow*14.0, uGrow*14.0 - 2.0, r);
        float ring1 = smoothstep(0.07, 0.0, abs(r - 2.9)) * (0.6 + 0.4*sin(ang*24.0 + uTime));
        float ring2 = smoothstep(0.05, 0.0, abs(r - uRing)) * step(0.0, sin(ang*60.0 - uTime*0.3));
        float ring3 = smoothstep(0.03, 0.0, abs(r - uRing - 0.6)) * 0.5;
        col += uGlow * ((veins*(0.4 + pulse) * 1.6 + ring1*1.2) * reach + (ring2*0.6 + ring3) * smoothstep(0.5, 0.9, uGrow));
        float f = smoothstep(14.0, 60.0, r);
        col = mix(col, uFog, f);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const g = new THREE.CircleGeometry(90, 96).rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(g, m);
  scene.add(mesh);
  return { u, mesh };
}

/* ---------------- 世界之树 ---------------- */
export function createTree(scene, { low }) {
  const R = rng(20241);
  const segs = [], tips = [], lanterns = [];
  const MAX = low ? 5 : 6;
  function rec(start, dir, len, r, d, birth, r1) {
    const dur = 0.35 + len * 0.11;
    const end = start.clone().addScaledVector(dir, len);
    const mid = start.clone().lerp(end, 0.5).add(rvec(R).multiplyScalar(len * (d === 0 ? 0.05 : 0.17)));
    segs.push({ c: new THREE.QuadraticBezierCurve3(start.clone(), mid, end), r0: r, r1: r1 ?? r * 0.7, birth, dur, d });
    const nb = birth + dur;
    if (d >= MAX) { tips.push({ p: end, b: nb }); return; }
    if (d >= MAX - 2 && R() < 0.6) tips.push({ p: start.clone().lerp(end, 0.6), b: nb, small: true });
    if (d >= 2 && d <= 4 && R() < 0.4) lanterns.push(start.clone().lerp(end, 0.4 + R() * 0.5).add(new V3(0, -0.45 - R() * 0.4, 0)));
    const n = d === 0 ? 4 : R() < 0.45 ? 3 : 2;
    const az0 = R() * TAU;
    for (let i = 0; i < n; i++) {
      const az = az0 + (i / n) * TAU + (R() - 0.5) * 0.7;
      const tilt = d === 0 ? 0.8 + R() * 0.3 : 0.35 + R() * 0.45;
      const nd = bendDir(dir, az, tilt);
      nd.y += 0.12; if (nd.y < -0.05) nd.y = -0.05; nd.normalize();
      rec(end, nd, len * (d === 0 ? 0.62 : 0.76) * (0.85 + R() * 0.3), r * 0.64, d + 1, nb + R() * 0.12);
    }
  }
  rec(new V3(0, 0, 0), new V3(0.03, 1, 0).normalize(), 5.2, 0.85, 0, 0, 0.6);
  // 树干中段侧枝
  for (const [h, az] of [[3.4, 0.6], [4.2, 3.0], [3.9, 4.8]]) {
    const dir = new V3(Math.cos(az), 0.7, Math.sin(az)).normalize();
    rec(new V3(0.03 * h, h, 0), dir, 2.2, 0.28, 2, 0.6);
  }
  // 根
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + R() * 0.4;
    const d = new V3(Math.cos(a), 0, Math.sin(a));
    const s = new V3(0, 1.0, 0).addScaledVector(d, 0.35);
    const e = new V3(0, -0.25, 0).addScaledVector(d, 2.4 + R() * 1.2);
    const m = s.clone().lerp(e, 0.4).add(new V3(0, 0.25, 0));
    segs.push({ c: new THREE.QuadraticBezierCurve3(s, m, e), r0: 0.42, r1: 0.06, birth: 0, dur: 0.9, d: 1 });
  }

  // 合并树枝几何体
  const pos = [], nor = [], base = [], grow = [], idx = [];
  let n = 0, total = 0;
  for (const s of segs) {
    const radial = [12, 9, 7, 5, 4, 4, 4][s.d], tub = s.d < 2 ? 8 : s.d < 4 ? 4 : 2;
    const g = taperTube(s.c, s.r0, s.r1, tub, radial);
    const p = g.attributes.position.array, q = g.attributes.normal.array, ia = g.index.array;
    const b = s.c.v0;
    for (let i = 0; i < p.length; i += 3) {
      pos.push(p[i], p[i + 1], p[i + 2]); nor.push(q[i], q[i + 1], q[i + 2]);
      base.push(b.x, b.y, b.z); grow.push(s.birth, s.dur);
    }
    for (let i = 0; i < ia.length; i++) idx.push(n + ia[i]);
    n += p.length / 3;
    total = Math.max(total, s.birth + s.dur);
  }
  U.uTotal.value = total + 0.9;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('aBase', new THREE.Float32BufferAttribute(base, 3));
  geo.setAttribute('aGrow', new THREE.Float32BufferAttribute(grow, 2));
  geo.setIndex(idx);
  geo.boundingSphere = new THREE.Sphere(new V3(0, 7, 0), 14);

  const barkU = { uGlowC: { value: new THREE.Color() } };
  const bark = new THREE.MeshStandardMaterial({ color: 0x2c2232, roughness: 0.85, metalness: 0.05 });
  bark.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U, barkU, { uRim: SHARED.rim });
    sh.vertexShader = `attribute vec3 aBase; attribute vec2 aGrow; uniform float uGrow, uTotal, uTime; varying vec3 vWP;\n${WIND}\n` +
      sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        float gp = clamp((uGrow*uTotal - aGrow.x)/aGrow.y, 0.0, 1.0); gp = gp*gp*(3.0-2.0*gp);
        transformed = aBase + (transformed - aBase)*gp;
        transformed += wind(transformed);
        vWP = transformed;`);
    sh.fragmentShader = `uniform vec3 uGlowC; uniform vec3 uRim; uniform float uTime; varying vec3 vWP;\n` +
      sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float fres = pow(1.0 - abs(dot(normal, normalize(vViewPosition))), 3.0);
        float vein = sin(vWP.y*1.7 + sin(vWP.x*2.1 + vWP.z*1.7)*2.4 + atan(vWP.z, vWP.x)*3.0);
        vein = smoothstep(0.9, 1.0, vein);
        float flow = 0.3 + 0.7*pow(0.5+0.5*sin(vWP.y*0.8 - uTime*1.8), 4.0);
        totalEmissiveRadiance += uRim*fres*0.8 + uGlowC*vein*flow*2.4;`);
  };
  const trunk = new THREE.Mesh(geo, bark);
  scene.add(trunk);

  // ---- 叶 / 花（随季节变换形状与颜色）
  const per = low ? 9 : 13;
  const leafCount = tips.length * per;
  const quad = new THREE.PlaneGeometry(0.6, 0.6);
  const lu = Object.assign(THREE.UniformsUtils.clone(THREE.UniformsLib.fog), {
    uTime: U.uTime, uGrow: U.uGrow, uTotal: U.uTotal,
    uSeasonT: { value: 0 }, uScaleA: { value: 1 }, uScaleB: { value: 1 },
    uShapeA: { value: 0 }, uShapeB: { value: 0 },
    uA1: { value: new THREE.Color() }, uA2: { value: new THREE.Color() },
    uB1: { value: new THREE.Color() }, uB2: { value: new THREE.Color() }, uBright: { value: 1.5 },
  });
  const leafMat = new THREE.ShaderMaterial({
    uniforms: lu, side: THREE.DoubleSide, fog: true,
    vertexShader: `
      attribute vec3 aR; uniform float uTime, uGrow, uTotal, uSeasonT, uScaleA, uScaleB;
      varying vec2 vUv; varying float vRand; varying float vB;
      #include <fog_pars_vertex>
      ${WIND}
      void main(){
        vUv = uv*2.0-1.0; vRand = aR.x;
        float g = smoothstep(aR.y, aR.y + 0.9, uGrow*uTotal);
        float k = clamp(uSeasonT*2.0 - aR.z, 0.0, 1.0);
        float s = k < 0.5 ? (1.0-2.0*k)*uScaleA : (2.0*k-1.0)*uScaleB;
        vB = step(0.5, k);
        vec3 p = position * g * s;
        p.z += sin(uTime*2.3 + aR.x*40.0) * 0.12 * (p.y + 0.3);
        vec3 c = (instanceMatrix * vec4(0.0,0.0,0.0,1.0)).xyz;
        vec4 wp = modelMatrix * instanceMatrix * vec4(p, 1.0);
        wp.xyz += wind(c);
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `
      uniform vec3 uA1,uA2,uB1,uB2; uniform float uShapeA, uShapeB, uTime, uBright;
      varying vec2 vUv; varying float vRand; varying float vB;
      #include <fog_pars_fragment>
      float mask(float s, vec2 uv){
        float r = length(uv), th = atan(uv.y, uv.x);
        if (s < 0.5) { return step(r, 0.32 + 0.62*pow(abs(cos(th*2.5)), 0.55)); }
        if (s < 1.5) { return step(abs(uv.x), 0.5*pow(max(0.0, 1.0-uv.y*uv.y), 0.9)); }
        if (s < 2.5) { vec2 q = uv - vec2(0.0,-0.9); float a = atan(q.x, q.y); float rr = length(q);
          float fan = step(abs(a), 0.95) * step(rr, 1.75 - 0.5*exp(-a*a*28.0)) * step(0.35, rr);
          float stem = step(abs(uv.x), 0.05) * step(uv.y, -0.4);
          return max(fan, stem); }
        return step(r, 0.16 + 0.84*pow(abs(cos(th*3.0)), 10.0)) * step(r, 0.95);
      }
      void main(){
        float sh = vB > 0.5 ? uShapeB : uShapeA;
        if (mask(sh, vUv) < 0.5) discard;
        vec3 c = vB > 0.5 ? mix(uB1, uB2, vRand) : mix(uA1, uA2, vRand);
        float center = 1.0 - length(vUv)*0.55;
        c *= (0.5 + 0.7*center) * uBright * (0.85 + 0.3*sin(uTime*1.7 + vRand*60.0));
        gl_FragColor = vec4(c, 1.0);
        #include <fog_fragment>
      }`,
  });
  const leaves = new THREE.InstancedMesh(quad, leafMat, leafCount);
  const aR = new Float32Array(leafCount * 3);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new V3();
  let k = 0;
  for (const t of tips) {
    const nn = t.small ? Math.ceil(per * 0.5) : per;
    for (let i = 0; i < nn && k < leafCount; i++, k++) {
      const p = t.p.clone().addScaledVector(rvec(R), (t.small ? 0.5 : 0.95) * Math.cbrt(R()));
      p.y += 0.15;
      q.setFromEuler(new THREE.Euler(R() * TAU, R() * TAU, R() * TAU));
      const s = 0.75 + R() * 0.6;
      m.compose(p, q, sc.set(s, s, s));
      leaves.setMatrixAt(k, m);
      const hN = Math.min(1, Math.max(0, p.y / 15));
      aR[k * 3] = R(); aR[k * 3 + 1] = t.b + R() * 0.25; aR[k * 3 + 2] = (1 - hN) * 0.75 + R() * 0.25;
    }
  }
  leaves.count = k;
  quad.setAttribute('aR', new THREE.InstancedBufferAttribute(aR, 3));
  leaves.frustumCulled = false;
  scene.add(leaves);

  // ---- 发光果实 / 灯笼
  const lanU = { uCol: { value: new THREE.Color() }, uOp: { value: 0 } };
  const lanMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false });
  lanMat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U, lanU);
    sh.vertexShader = `uniform float uTime;\n${WIND}\n` + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      vec3 ic = (instanceMatrix*vec4(0.0,0.0,0.0,1.0)).xyz;
      transformed += wind(ic) / max(0.001, length(instanceMatrix[0].xyz));`);
    sh.fragmentShader = `uniform vec3 uCol; uniform float uOp;\n` + sh.fragmentShader.replace('vec4 diffuseColor = vec4( diffuse, opacity );', 'vec4 diffuseColor = vec4( uCol, uOp );');
  };
  const lan = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.11, 2), lanMat, lanterns.length);
  lanterns.forEach((p, i) => { const s = 0.7 + R() * 0.8; m.compose(p, q.identity(), sc.set(s, s, s)); lan.setMatrixAt(i, m); });
  lan.frustumCulled = false;
  scene.add(lan);

  // ---- 树下发光蘑菇
  const P = new Parts();
  for (let i = 0; i < (low ? 18 : 30); i++) {
    const a = R() * TAU, r = 1.4 + R() * 3.2;
    const x = Math.cos(a) * r, z = Math.sin(a) * r, h = 0.12 + R() * 0.22, cr = 0.06 + R() * 0.09;
    P.add('stem', new THREE.CylinderGeometry(cr * 0.25, cr * 0.32, h, 6).translate(x, h / 2, z), null, '#cfc6e0', '#f0eaff');
    const hue = R() < 0.5 ? ['#3fd7ff', '#b5f6ff'] : ['#c27bff', '#f1d5ff'];
    P.add('cap', new THREE.SphereGeometry(cr, 10, 6, 0, TAU, 0, Math.PI / 2).translate(x, h, z), null, hue[0], hue[1]);
  }
  const shroom = P.build({ stem: stdMat({ glow: 0.15 }), cap: stdMat({ glow: 0.9, side: THREE.DoubleSide }) });
  shroom.scale.setScalar(0.001);
  scene.add(shroom);

  return { trunk, leaves, lu, lan, lanU, barkU, shroom };
}

/* ---------------- 草地 ---------------- */
export function createGrass(scene, { low }) {
  const N = low ? 1400 : 3200;
  const blade = new THREE.BufferGeometry();
  blade.setAttribute('position', new THREE.Float32BufferAttribute([-0.05, 0, 0, 0.05, 0, 0, -0.03, 0.5, 0, 0.03, 0.5, 0, 0, 1, 0], 3));
  blade.setIndex([0, 1, 2, 1, 3, 2, 2, 3, 4]);
  const u = Object.assign(THREE.UniformsUtils.clone(THREE.UniformsLib.fog), {
    uTime: U.uTime, uGrow: U.uGrow, uBase: { value: new THREE.Color() }, uTip: { value: new THREE.Color() }, uH: { value: 1 },
  });
  const mat = new THREE.ShaderMaterial({
    uniforms: u, side: THREE.DoubleSide, fog: true,
    vertexShader: `
      uniform float uTime, uGrow, uH; attribute float aRnd; varying float vY; varying float vR;
      #include <fog_pars_vertex>
      void main(){
        vec3 c = (instanceMatrix*vec4(0.0,0.0,0.0,1.0)).xyz;
        float rr = length(c.xz);
        float g = smoothstep(rr - 3.0, rr, uGrow * 26.0);
        vec3 p = position; p.y *= uH * g;
        vec4 wp = modelMatrix * instanceMatrix * vec4(p, 1.0);
        float sw = position.y*position.y;
        wp.x += sin(uTime*1.3 + c.x*0.4 + c.z*0.3) * 0.18 * sw * uH;
        wp.z += cos(uTime*1.1 + c.z*0.4) * 0.12 * sw * uH;
        vY = position.y; vR = aRnd;
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `
      uniform vec3 uBase, uTip; varying float vY; varying float vR;
      #include <fog_pars_fragment>
      void main(){
        vec3 c = mix(uBase, uTip * (0.5 + vR), pow(vY, 1.6));
        gl_FragColor = vec4(c, 1.0);
        #include <fog_fragment>
      }`,
  });
  const inst = new THREE.InstancedMesh(blade, mat, N);
  const R = rng(5);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new V3();
  const rnd = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const a = R() * TAU, r = 2.2 + Math.pow(R(), 0.7) * 24;
    q.setFromAxisAngle(new V3(0, 1, 0), R() * TAU);
    const h = 0.25 + R() * 0.55;
    m.compose(new V3(Math.cos(a) * r, 0, Math.sin(a) * r), q, s.set(1 + R(), h, 1));
    inst.setMatrixAt(i, m);
    rnd[i] = R();
  }
  blade.setAttribute('aRnd', new THREE.InstancedBufferAttribute(rnd, 1));
  inst.frustumCulled = false;
  scene.add(inst);
  return { u, inst };
}

/* ---------------- 粒子 ---------------- */
const SHAPES = `
  mat2 rot(float a){ float c=cos(a), s=sin(a); return mat2(c,-s,s,c); }
  float pshape(float s, vec2 uv){
    float r = length(uv);
    if (s < 0.5) { float d = length(vec2(uv.x*1.7, uv.y*1.0 + 0.1)); float notch = smoothstep(0.18, 0.0, abs(uv.x)) * smoothstep(0.55, 0.95, uv.y);
      return smoothstep(1.0, 0.8, d) * (1.0 - notch); }
    if (s < 1.5) { return exp(-r*r*7.0) + smoothstep(0.25, 0.0, r); }
    if (s < 2.5) { vec2 q = uv - vec2(0.0, -0.85); float a = atan(q.x, q.y); float rr = length(q);
      float fan = smoothstep(1.0, 0.9, abs(a)) * smoothstep(1.7, 1.6, rr - 0.0 + 0.5*exp(-a*a*28.0)) * step(0.3, rr);
      float stem = step(abs(uv.x), 0.06) * step(uv.y, -0.4) * step(-1.0, uv.y);
      return max(fan, stem); }
    if (s < 3.5) { return smoothstep(1.0, 0.0, r) * (0.4 + 0.6*smoothstep(0.5, 0.0, r)); }
    return smoothstep(1.0, 0.0, r) * 0.25;
  }`;

export function createSeasonParticles(scene, { mode, shape, count, box, size, colA, colB, fall = 1, sway = 1, rise = 0.3, blink = 0, additive = false, center = new V3(0, 0, 0), bright = 1 }) {
  const seeds = new Float32Array(count * 4);
  for (let i = 0; i < count * 4; i++) seeds[i] = Math.random();
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(count * 3), 3));
  g.setAttribute('aSeed', new THREE.Float32BufferAttribute(seeds, 4));
  const u = {
    uTime: U.uTime, uSize: { value: size }, uPR: { value: 1 }, uOpacity: { value: 0 }, uBox: { value: box },
    uCenter: { value: center }, uFall: { value: fall }, uSway: { value: sway }, uRise: { value: rise }, uBlink: { value: blink },
    uA: { value: new THREE.Color(colA) }, uB: { value: new THREE.Color(colB) }, uShape: { value: shape }, uBright: { value: bright },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms: u, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    vertexShader: `
      attribute vec4 aSeed; uniform float uTime, uSize, uPR, uFall, uSway, uRise, uBlink; uniform vec3 uBox, uCenter;
      varying float vA; varying float vRot; varying float vR; varying float vFlip;
      void main(){
        float t = uTime, r = aSeed.w; vec3 p;
        ${mode === 'fall' ? `
        float sp = (0.45 + r*0.55) * uFall;
        float y = mod(aSeed.y*uBox.y - t*sp, uBox.y);
        p = vec3((aSeed.x-0.5)*2.0*uBox.x, y, (aSeed.z-0.5)*2.0*uBox.z);
        p.x += sin(t*0.7 + r*20.0)*uSway + sin(t*0.13 + y*0.2)*uSway*1.5;
        p.z += cos(t*0.5 + r*13.0)*uSway;
        vA = smoothstep(0.0, 1.5, y) * smoothstep(uBox.y, uBox.y - 3.0, y);` : `
        float y = mod(aSeed.y*uBox.y + t*uRise*(0.3 + r), uBox.y);
        p = vec3((aSeed.x-0.5)*2.0*uBox.x + sin(t*0.3*(1.0+r) + r*30.0)*1.6, y, (aSeed.z-0.5)*2.0*uBox.z + cos(t*0.27*(1.0+r) + r*17.0)*1.6);
        vA = smoothstep(0.0, 1.2, y) * smoothstep(uBox.y, uBox.y - 2.0, y);
        if (uBlink > 0.5) vA *= 0.15 + 0.85*pow(0.5 + 0.5*sin(t*(1.2 + r*2.0) + r*50.0), 3.0);`}
        p += uCenter;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = uSize * (0.6 + r*0.8) * uPR * (10.0 / max(0.5, -mv.z));
        vRot = t*(0.4 + r)*(r > 0.5 ? 1.0 : -1.0) + r*6.28;
        vFlip = cos(t*(0.8 + r*1.6) + r*9.0);
        vR = r;
      }`,
    fragmentShader: `
      uniform vec3 uA, uB; uniform float uOpacity, uShape, uBright;
      varying float vA; varying float vRot; varying float vR; varying float vFlip;
      ${SHAPES}
      void main(){
        vec2 uv = gl_PointCoord*2.0 - 1.0;
        uv = rot(vRot) * uv;
        if (uShape < 0.5 || (uShape > 1.5 && uShape < 2.5)) uv.x /= max(abs(vFlip), 0.2);
        float a = pshape(uShape, uv);
        if (a < 0.01) discard;
        vec3 c = mix(uA, uB, vR) * uBright * (uShape < 0.5 || (uShape > 1.5 && uShape < 2.5) ? (0.75 + 0.35*abs(vFlip)) : 1.0);
        gl_FragColor = vec4(c, a * vA * uOpacity);
      }`,
  });
  const pts = new THREE.Points(g, mat);
  pts.frustumCulled = false;
  scene.add(pts);
  return { pts, u };
}

/* ---------------- 点击爆发 ---------------- */
export function createBurst(scene) {
  const N = 500;
  const pos = new Float32Array(N * 3), life = new Float32Array(N), rnd = new Float32Array(N);
  const vel = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) rnd[i] = Math.random();
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aLife', new THREE.BufferAttribute(life, 1));
  g.setAttribute('aRnd', new THREE.BufferAttribute(rnd, 1));
  const u = { uTime: U.uTime, uPR: { value: 1 }, uShape: { value: 0 }, uA: { value: new THREE.Color() }, uB: { value: new THREE.Color() }, uSize: { value: 2.4 } };
  const mat = new THREE.ShaderMaterial({
    uniforms: u, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `attribute float aLife; attribute float aRnd; uniform float uTime, uPR, uSize;
      varying float vA; varying float vRot; varying float vR; varying float vFlip;
      void main(){ vec4 mv = modelViewMatrix*vec4(position,1.0); gl_Position = projectionMatrix*mv;
        vA = smoothstep(0.0, 0.25, aLife); vR = aRnd;
        gl_PointSize = aLife > 0.0 ? uSize*(0.6+aRnd*0.9)*uPR*(10.0/max(0.5,-mv.z)) : 0.0;
        vRot = uTime*(1.0+aRnd*2.0) + aRnd*6.28; vFlip = cos(uTime*(2.0+aRnd*3.0) + aRnd*9.0); }`,
    fragmentShader: `uniform vec3 uA, uB; uniform float uShape; varying float vA; varying float vRot; varying float vR; varying float vFlip;
      ${SHAPES}
      void main(){ vec2 uv = gl_PointCoord*2.0-1.0; uv = rot(vRot)*uv;
        if (uShape < 0.5 || (uShape > 1.5 && uShape < 2.5)) uv.x /= max(abs(vFlip), 0.2);
        float a = pshape(uShape, uv); if (a < 0.01) discard;
        gl_FragColor = vec4(mix(uA, uB, vR)*1.6, a*vA); }`,
  });
  const pts = new THREE.Points(g, mat);
  pts.frustumCulled = false;
  scene.add(pts);
  let head = 0;
  return {
    u,
    spawn(p, n = 46, power = 1) {
      for (let k = 0; k < n; k++) {
        const i = head; head = (head + 1) % N;
        pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z;
        const d = rvec(Math.random); const sp = (1.5 + Math.random() * 3.5) * power;
        vel[i * 3] = d.x * sp; vel[i * 3 + 1] = d.y * sp + 1.5 * power; vel[i * 3 + 2] = d.z * sp;
        life[i] = 1.6 + Math.random() * 1.6;
      }
    },
    update(dt) {
      let any = false;
      for (let i = 0; i < N; i++) {
        if (life[i] <= 0) continue;
        any = true;
        life[i] -= dt;
        const drag = Math.exp(-dt * 1.6);
        vel[i * 3] *= drag; vel[i * 3 + 2] *= drag; vel[i * 3 + 1] = vel[i * 3 + 1] * drag - dt * 1.4;
        pos[i * 3] += vel[i * 3] * dt + Math.sin(life[i] * 3 + rnd[i] * 9) * dt * 0.4;
        pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
      }
      if (any || this._was) { g.attributes.position.needsUpdate = true; g.attributes.aLife.needsUpdate = true; }
      this._was = any;
    },
  };
}

/* ---------------- 光柱 ---------------- */
export function createShafts(scene) {
  const u = { uCol: { value: new THREE.Color() }, uTime: U.uTime, uOp: { value: 0.0 } };
  const mat = new THREE.ShaderMaterial({
    uniforms: u, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    vertexShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vV; uniform float uTime;
      void main(){ vUv = uv; vec4 mv = modelViewMatrix*vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `uniform vec3 uCol; uniform float uTime, uOp; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main(){ float edge = pow(abs(dot(vN, vV)), 2.0);
        float fade = smoothstep(0.0, 0.45, vUv.y) * smoothstep(1.0, 0.75, vUv.y);
        float flick = 0.8 + 0.2*sin(uTime*0.7 + vUv.x*30.0);
        gl_FragColor = vec4(uCol * edge * fade * flick * uOp, 1.0); }`,
  });
  const group = new THREE.Group();
  const geo = new THREE.CylinderGeometry(3.6, 0.5, 34, 28, 1, true).translate(0, -17, 0);
  const defs = [[-4, 30, -3, 0.25, 0.35, 1.0], [5, 30, 2, -0.2, -0.3, 0.8], [1, 30, 6, -0.32, 0.1, 0.6], [-8, 28, 4, 0.1, 0.4, 0.5]];
  for (const [x, y, z, rx, rz, s] of defs) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z); m.rotation.set(rx, 0, rz); m.scale.set(s, 1, s);
    m.renderOrder = 5;
    group.add(m);
  }
  scene.add(group);
  return { u, group };
}
