// 星环列车 · 天空：星空、星云、行星（昼夜、城市灯火）、大气辉光、远处的另一条星环、极光
import * as THREE from 'three';
import { MIX } from './biomes.js';

const NOISE = /* glsl */`
float hash3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float noise3(vec3 x) {
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash3(i), hash3(i + vec3(1,0,0)), f.x), mix(hash3(i + vec3(0,1,0)), hash3(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash3(i + vec3(0,0,1)), hash3(i + vec3(1,0,1)), f.x), mix(hash3(i + vec3(0,1,1)), hash3(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm3(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 6; i++) { s += a * noise3(p); p = p * 2.03 + 17.1; a *= 0.5; } return s; }
`;

const FS_QUAD_V = /* glsl */`varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const PLANET_BAKE = NOISE + /* glsl */`
varying vec2 vUv;
void main() {
  float lon = (vUv.x - 0.5) * 6.2831853, lat = (vUv.y - 0.5) * 3.1415927;
  vec3 d = vec3(sin(lat), cos(lat) * cos(lon), cos(lat) * sin(lon));
  vec3 w = vec3(fbm3(d * 1.6 + 3.1), fbm3(d * 1.6 + 8.7), fbm3(d * 1.6 + 13.3));
  float h = fbm3(d * 2.2 + w * 1.25);
  vec3 cw = vec3(fbm3(d * 3.0 + 31.0), fbm3(d * 3.0 + 37.0), fbm3(d * 3.0 + 41.0));
  float cl = fbm3(vec3(d.x * 7.5, d.y * 2.6, d.z * 2.6) + cw * 2.2 + 21.0);
  cl = mix(cl, fbm3(d * 9.0 + cw * 3.0), 0.35);
  float cluster = smoothstep(0.48, 0.7, fbm3(d * 4.5 + 40.0));
  float dots = noise3(d * 170.0) * noise3(d * 95.0 + 5.0);
  float roads = 1.0 - smoothstep(0.0, 0.045, abs(fbm3(d * 8.0 + 60.0) - 0.5));
  float city = cluster * (0.18 + 1.6 * smoothstep(0.25, 0.7, dots)) + roads * 0.5 * smoothstep(0.3, 0.6, fbm3(d * 4.5 + 40.0));
  gl_FragColor = vec4(h, cl, clamp(city, 0.0, 1.0), fbm3(d * 14.0 + 3.0));
}`;

const NEBULA_BAKE = NOISE + /* glsl */`
varying vec2 vUv;
void main() {
  float lon = (vUv.x - 0.5) * 6.2831853, lat = (vUv.y - 0.5) * 3.1415927;
  vec3 d = vec3(cos(lat) * cos(lon), sin(lat), cos(lat) * sin(lon));
  vec3 w = vec3(fbm3(d * 2.0 + 1.0), fbm3(d * 2.0 + 6.0), fbm3(d * 2.0 + 11.0));
  float band = exp(-pow(dot(d, normalize(vec3(0.35, 0.85, -0.4))) / 0.3, 2.0));
  float n1 = fbm3(d * 2.4 + w * 1.6 + 5.0);
  float n2 = fbm3(d * 3.8 + w * 2.0 + 9.0);
  float dark = smoothstep(0.45, 0.7, fbm3(d * 6.0 + w * 2.5 + 3.0));
  float r = smoothstep(0.42, 0.85, n1) * (0.35 + band * 1.1);
  float g = smoothstep(0.48, 0.9, n2) * (0.25 + band * 0.9);
  r *= 1.0 - dark * 0.7; g *= 1.0 - dark * 0.6;
  gl_FragColor = vec4(r, g, band * (1.0 - dark * 0.5), 1.0);
}`;

function bake(renderer, frag, w, h) {
  const rt = new THREE.WebGLRenderTarget(w, h, {
    generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false,
  });
  rt.texture.wrapS = THREE.RepeatWrapping;
  rt.texture.wrapT = THREE.ClampToEdgeWrapping;
  const sc = new THREE.Scene();
  const q = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({ vertexShader: FS_QUAD_V, fragmentShader: frag, depthTest: false }));
  sc.add(q);
  const cam = new THREE.Camera();
  const prev = renderer.getRenderTarget();
  renderer.setRenderTarget(rt);
  renderer.render(sc, cam);
  renderer.setRenderTarget(prev);
  q.geometry.dispose(); q.material.dispose();
  return rt.texture;
}

// 行星：方向固定在远方（天空场景的相机只跟随主相机的旋转）
const P_DIST = 1400, P_PITCH = THREE.MathUtils.degToRad(62), P_ANG = THREE.MathUtils.degToRad(60);
export const PLANET_C = new THREE.Vector3(0, -Math.sin(P_PITCH), -Math.cos(P_PITCH)).multiplyScalar(P_DIST);
export const PLANET_R = P_DIST * Math.sin(P_ANG);

export class Sky {
  constructor(renderer, { mobile = false } = {}) {
    this.scene = new THREE.Scene();
    this.cam = new THREE.PerspectiveCamera(60, 1, 10, 7000);
    this.time = 0; this.rot = 0;
    const planetTex = bake(renderer, PLANET_BAKE, mobile ? 1024 : 2048, mobile ? 512 : 1024);
    const nebTex = bake(renderer, NEBULA_BAKE, 1024, 512);
    this.u = {
      uTime: { value: 0 },
      uTop: { value: MIX.skyTop }, uMid: { value: MIX.skyMid }, uBot: { value: MIX.skyBot },
      uNebA: { value: MIX.nebA }, uNebB: { value: MIX.nebB }, uNeb: { value: 0 },
      uSunDir: { value: MIX.sunDir }, uSunCol: { value: MIX.sunCol }, uSunAmt: { value: 0 },
      uNebTex: { value: nebTex },
    };
    // —— 天空穹顶 ——
    const dome = new THREE.Mesh(new THREE.SphereGeometry(5000, 48, 24), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, uniforms: this.u,
      vertexShader: /* glsl */`varying vec3 vDir; void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */`
        uniform vec3 uTop, uMid, uBot, uNebA, uNebB, uSunDir, uSunCol; uniform float uNeb, uSunAmt; uniform sampler2D uNebTex;
        varying vec3 vDir;
        void main() {
          vec3 d = normalize(vDir);
          float e = d.y;
          vec3 col = e > 0.0 ? mix(uMid, uTop, pow(clamp(e * 1.25, 0.0, 1.0), 0.55)) : mix(uMid, uBot, pow(clamp(-e * 2.0, 0.0, 1.0), 0.6));
          vec2 uv = vec2(atan(d.z, d.x) / 6.2831853 + 0.5, asin(clamp(d.y, -1.0, 1.0)) / 3.1415927 + 0.5);
          vec4 nb = textureLod(uNebTex, uv, 0.0);
          col += (uNebA * nb.r + uNebB * nb.g) * uNeb * 1.6;
          float sd = max(dot(d, uSunDir), 0.0);
          col += uSunCol * (pow(sd, 2400.0) * 40.0 + pow(sd, 260.0) * 2.0 + pow(sd, 22.0) * 0.35 + pow(sd, 4.0) * 0.08) * uSunAmt;
          gl_FragColor = vec4(col, 1.0);
        }`,
    }));
    dome.renderOrder = 0;
    this.scene.add(dome);

    // —— 星星 ——
    const N = mobile ? 2600 : 4200;
    const pos = new Float32Array(N * 3), col = new Float32Array(N * 3), sz = new Float32Array(N), ph = new Float32Array(N);
    const c = new THREE.Color();
    for (let i = 0; i < N; i++) {
      const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, r = Math.sqrt(1 - u * u);
      pos[i * 3] = r * Math.cos(a) * 4000; pos[i * 3 + 1] = u * 4000; pos[i * 3 + 2] = r * Math.sin(a) * 4000;
      const t = Math.random();
      c.setHSL(t < 0.2 ? 0.08 : t < 0.55 ? 0.6 : 0.58, t < 0.2 ? 0.7 : 0.35, 0.82);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
      sz[i] = Math.pow(Math.random(), 7) * 3.2 + 0.7;
      ph[i] = Math.random() * 100;
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    sg.setAttribute('color', new THREE.BufferAttribute(col, 3));
    sg.setAttribute('size', new THREE.BufferAttribute(sz, 1));
    sg.setAttribute('phase', new THREE.BufferAttribute(ph, 1));
    this.starU = { uTime: this.u.uTime, uStars: { value: 1 }, uPR: { value: renderer.getPixelRatio() } };
    const stars = new THREE.Points(sg, new THREE.ShaderMaterial({
      uniforms: this.starU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */`
        attribute float size; attribute float phase; attribute vec3 color; uniform float uTime, uStars, uPR; varying vec3 vC; varying float vA;
        void main() {
          vC = color; float tw = 0.65 + 0.35 * sin(uTime * (1.3 + fract(phase) * 2.0) + phase);
          vA = uStars * tw;
          gl_PointSize = size * uPR * (0.85 + 0.3 * tw);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */`
        varying vec3 vC; varying float vA;
        void main() { vec2 p = gl_PointCoord - 0.5; float d = dot(p, p); float a = exp(-d * 18.0); gl_FragColor = vec4(vC * a * vA * 1.6, 1.0); }`,
    }));
    stars.renderOrder = 1; stars.frustumCulled = false;
    this.scene.add(stars);

    // —— 行星 ——
    this.pu = {
      uTex: { value: planetTex }, uRot: { value: 0 }, uLight: { value: MIX.pLight },
      uOcean: { value: MIX.pOcean }, uDeep: { value: MIX.pDeep }, uLand: { value: MIX.pLand }, uDesert: { value: MIX.pDesert },
      uCloud: { value: MIX.pCloud }, uCloudAmt: { value: 1 }, uCity: { value: MIX.pCity }, uCityAmt: { value: 0 },
      uAtmo: { value: MIX.pAtmo }, uAtmoN: { value: MIX.pAtmoN }, uTerm: { value: MIX.pTerm }, uSpec: { value: 0.6 }, uSunCol: { value: MIX.sunCol },
      uCenter: { value: PLANET_C }, uR: { value: PLANET_R }, uTime: this.u.uTime,
    };
    const planet = new THREE.Mesh(new THREE.SphereGeometry(PLANET_R, 192, 128), new THREE.ShaderMaterial({
      uniforms: this.pu,
      vertexShader: /* glsl */`
        varying vec3 vN; varying vec3 vW;
        void main() { vN = normalize(position); vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: /* glsl */`
        uniform sampler2D uTex; uniform float uRot, uCloudAmt, uCityAmt, uSpec, uTime;
        uniform vec3 uLight, uOcean, uDeep, uLand, uDesert, uCloud, uCity, uAtmo, uAtmoN, uTerm, uSunCol;
        varying vec3 vN; varying vec3 vW;
        void main() {
          vec3 n = normalize(vN);
          float lat = asin(clamp(n.x, -1.0, 1.0));
          float lon = atan(n.z, n.y) - uRot;
          float u1 = fract(lon / 6.2831853 + 0.5), u2 = fract(lon / 6.2831853) - 0.5;
          float u = fwidth(u1) <= fwidth(u2) + 1e-5 ? u1 : u2;
          vec2 uv = vec2(u, lat / 3.1415927 + 0.5);
          vec4 t = texture2D(uTex, uv);
          // 云层单独慢慢漂移
          float lonC = lon + uTime * 0.004;
          float c1 = fract(lonC / 6.2831853 + 0.5), c2 = fract(lonC / 6.2831853) - 0.5;
          float cl = texture2D(uTex, vec2(fwidth(c1) <= fwidth(c2) + 1e-5 ? c1 : c2, uv.y)).g;
          float land = smoothstep(0.515, 0.545, t.r);
          vec3 ocean = mix(uDeep, uOcean, smoothstep(0.25, 0.515, t.r));
          vec3 ground = mix(uLand, uDesert, smoothstep(0.58, 0.72, t.r + (t.a - 0.5) * 0.15));
          ground *= 0.75 + 0.5 * t.a;
          vec3 col = mix(ocean, ground, land);
          float cloud = smoothstep(0.5, 0.74, cl) * uCloudAmt;
          vec3 V = normalize(cameraPosition - vW);
          float ndl = dot(n, uLight);
          float day = smoothstep(-0.08, 0.35, ndl);
          vec3 surf = mix(col, uCloud, cloud);
          vec3 lit = surf * (0.015 + 1.35 * max(ndl, 0.0));
          lit += uTerm * pow(max(1.0 - abs(ndl * 2.2), 0.0), 3.0) * 0.32 * (0.4 + cloud);
          vec3 H = normalize(uLight + V);
          lit += uSunCol * pow(max(dot(n, H), 0.0), 90.0) * uSpec * (1.0 - land) * (1.0 - cloud) * day * 1.4;
          float night = 1.0 - smoothstep(-0.12, 0.12, ndl);
          lit += uCity * t.b * land * night * (1.0 - cloud * 0.75) * uCityAmt * 2.6;
          float fres = pow(1.0 - max(dot(n, V), 0.0), 3.0);
          vec3 atmo = mix(uAtmoN * 0.35, uAtmo, smoothstep(-0.25, 0.45, ndl));
          lit = mix(lit, atmo * 1.1, clamp(fres * 1.15, 0.0, 1.0));
          lit += atmo * pow(1.0 - max(dot(n, V), 0.0), 1.2) * 0.08;
          gl_FragColor = vec4(lit, 1.0);
        }`,
    }));
    planet.position.copy(PLANET_C);
    planet.renderOrder = 2;
    this.scene.add(planet);
    this.planet = planet;

    // —— 另一条星环（远处的轨道，带移动的列车灯光） ——
    this.ringU = { uTime: this.u.uTime, uCol: { value: MIX.ring }, uAmt: { value: 1 } };
    const ring = new THREE.Mesh(new THREE.TorusGeometry(PLANET_R * 1.32, 2.2, 6, 720), new THREE.ShaderMaterial({
      uniforms: this.ringU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */`varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */`
        uniform float uTime, uAmt; uniform vec3 uCol; varying vec2 vUv;
        void main() {
          float a = vUv.x * 720.0;
          float dash = smoothstep(0.85, 1.0, fract(a * 0.5 - uTime * 0.6)) * 0.8;
          float train = smoothstep(0.96, 1.0, fract(vUv.x * 9.0 + uTime * 0.012)) * 3.0;
          float base = 0.28 + dash + train;
          gl_FragColor = vec4(uCol * base * uAmt, 1.0);
        }`,
    }));
    ring.position.copy(PLANET_C);
    ring.rotation.set(THREE.MathUtils.degToRad(-14), THREE.MathUtils.degToRad(-28), THREE.MathUtils.degToRad(8));
    ring.renderOrder = 3;
    this.scene.add(ring);

    // —— 大气辉光（解析计算视线到球心的最近距离） ——
    const halo = new THREE.Mesh(new THREE.SphereGeometry(PLANET_R * 1.075, 128, 96), new THREE.ShaderMaterial({
      uniforms: this.pu, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */`varying vec3 vW; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: /* glsl */`
        uniform vec3 uCenter, uLight, uAtmo, uAtmoN, uTerm; uniform float uR; varying vec3 vW;
        void main() {
          vec3 rd = normalize(vW - cameraPosition);
          vec3 oc = uCenter - cameraPosition;
          float tca = dot(oc, rd);
          float d = sqrt(max(dot(oc, oc) - tca * tca, 0.0)) / uR;
          vec3 limbN = normalize(cameraPosition + rd * tca - uCenter);
          float ndl = dot(limbN, uLight);
          float glow = d > 1.0 ? exp(-(d - 1.0) / 0.016) : exp(-(1.0 - d) / 0.012) * 0.6;
          float wide = d > 1.0 ? exp(-(d - 1.0) / 0.06) * 0.25 : 0.0;
          vec3 col = mix(uAtmoN * 0.45, uAtmo, smoothstep(-0.35, 0.35, ndl));
          col += uTerm * pow(max(1.0 - abs(ndl * 2.0), 0.0), 2.0) * 0.9;
          float back = pow(max(dot(rd, uLight), 0.0), 6.0) * 1.2;
          gl_FragColor = vec4(col * (glow + wide) * (0.55 + back + smoothstep(-0.2, 0.3, ndl) * 0.7), 1.0);
        }`,
    }));
    halo.position.copy(PLANET_C);
    halo.renderOrder = 4;
    this.scene.add(halo);

    // —— 极光帷幕 ——
    this.auU = { uTime: this.u.uTime, uA: { value: MIX.auroraA }, uB: { value: MIX.auroraB }, uAmt: { value: 0 } };
    const auMat = new THREE.ShaderMaterial({
      uniforms: this.auU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      vertexShader: /* glsl */`varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */`
        uniform float uTime, uAmt; uniform vec3 uA, uB; varying vec2 vUv;
        float h1(float x) { return fract(sin(x * 127.1) * 43758.5453); }
        float n1(float x) { float i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f); return mix(h1(i), h1(i + 1.0), f); }
        void main() {
          float x = vUv.x, y = vUv.y;
          float fold = sin(x * 9.0 + uTime * 0.25 + sin(x * 3.0 - uTime * 0.17) * 2.4) * 0.08;
          float base = 0.12 + fold + n1(x * 14.0 + uTime * 0.3) * 0.05;
          float bottom = smoothstep(base - 0.02, base + 0.04, y);
          float top = 1.0 - smoothstep(base + 0.18, 0.98, y);
          float rays = 0.45 + 0.9 * pow(n1(x * 70.0 + uTime * 0.6), 2.0) + 0.5 * n1(x * 23.0 - uTime * 0.4);
          float edge = smoothstep(0.0, 0.12, x) * (1.0 - smoothstep(0.88, 1.0, x));
          vec3 col = mix(uA, uB, smoothstep(base + 0.05, 0.8, y));
          float a = bottom * top * rays * edge * uAmt;
          gl_FragColor = vec4(col * a * 1.25, 1.0);
        }`,
    });
    this.auroras = [];
    for (let i = 0; i < 3; i++) {
      const g = new THREE.CylinderGeometry(900 + i * 140, 900 + i * 140, 420 - i * 60, 96, 1, true, Math.PI * (0.62 + i * 0.12), Math.PI * (0.55 - i * 0.08));
      const m = new THREE.Mesh(g, auMat);
      m.position.y = 120 + i * 40;
      m.rotation.y = -0.15 + i * 0.35;
      m.renderOrder = 5;
      m.frustumCulled = false;
      this.scene.add(m);
      this.auroras.push(m);
    }
  }

  setPixelRatio(pr) { this.starU.uPR.value = pr; }

  update(dt, mainCam, speed) {
    this.time += dt;
    this.u.uTime.value = this.time;
    this.rot += dt * (0.0035 + speed * 0.00016);
    this.pu.uRot.value = this.rot;
    const B = MIX;
    this.u.uNeb.value = B.neb;
    this.u.uSunAmt.value = B.sunAmt;
    this.starU.uStars.value = B.stars;
    this.pu.uCloudAmt.value = B.pCloudAmt;
    this.pu.uCityAmt.value = B.pCityAmt;
    this.pu.uSpec.value = B.pSpec;
    this.ringU.uAmt.value = B.ringAmt;
    this.auU.uAmt.value = B.aurora;
    for (const a of this.auroras) a.visible = B.aurora > 0.01;
    this.cam.quaternion.copy(mainCam.quaternion);
    if (this.cam.fov !== mainCam.fov || this.cam.aspect !== mainCam.aspect) {
      this.cam.fov = mainCam.fov; this.cam.aspect = mainCam.aspect; this.cam.updateProjectionMatrix();
    }
  }
}
