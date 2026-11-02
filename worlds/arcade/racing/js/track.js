/* 星际竞速 · 赛道：样条采样、倾斜坐标系、赛车线、赛道网格与着色器 */
import * as THREE from 'three';
import { buildPath } from './config.js';

const UP = new THREE.Vector3(0, 1, 0);

function gaussSmooth(src, n, sigma, wrap = true) {
  const r = Math.ceil(sigma * 2.5), w = [];
  let sum = 0;
  for (let k = -r; k <= r; k++) { const v = Math.exp(-(k * k) / (2 * sigma * sigma)); w.push(v); sum += v; }
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let acc = 0;
    for (let k = -r; k <= r; k++) {
      let j = i + k;
      if (wrap) j = ((j % n) + n) % n; else j = Math.min(n - 1, Math.max(0, j));
      acc += src[j] * w[k + r];
    }
    out[i] = acc / sum;
  }
  return out;
}

export class Track {
  constructor(def) {
    this.def = def;
    this.width = def.width;
    this.half = def.width / 2;
    const path = buildPath(def.cmds);
    const pts = path.pts.map((p) => new THREE.Vector3(p.x, p.y + 40, p.z));
    const curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal');
    curve.arcLengthDivisions = pts.length * 10;
    this.curve = curve;
    this.length = curve.getLength();
    const n = Math.round(this.length);
    this.n = n;
    this.ds = this.length / n;

    const P = new Float32Array(n * 3);
    const tmp = new THREE.Vector3();
    for (let i = 0; i < n; i++) { curve.getPointAt(i / n, tmp); P[i * 3] = tmp.x; P[i * 3 + 1] = tmp.y; P[i * 3 + 2] = tmp.z; }
    // 切线（中心差分）与水平左向量
    const T = new Float32Array(n * 3), L0 = new Float32Array(n * 3), U0 = new Float32Array(n * 3);
    const a = new THREE.Vector3(), b = new THREE.Vector3(), t = new THREE.Vector3(), l = new THREE.Vector3(), u = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      const ip = (i + 1) % n, im = (i - 1 + n) % n;
      a.fromArray(P, im * 3); b.fromArray(P, ip * 3);
      t.subVectors(b, a).normalize();
      l.crossVectors(UP, t).normalize();
      u.crossVectors(t, l).normalize();
      t.toArray(T, i * 3); l.toArray(L0, i * 3); u.toArray(U0, i * 3);
    }
    // 水平曲率（左转为正）
    const kRaw = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const ip = (i + 1) % n, im = (i - 1 + n) % n;
      const hx = T[ip * 3] - T[im * 3], hy = T[ip * 3 + 1] - T[im * 3 + 1], hz = T[ip * 3 + 2] - T[im * 3 + 2];
      kRaw[i] = (hx * L0[i * 3] + hy * L0[i * 3 + 1] + hz * L0[i * 3 + 2]) / (2 * this.ds);
    }
    const kS = gaussSmooth(kRaw, n, 5);
    const kBank = gaussSmooth(kRaw, n, 26);
    // 倾斜：弯道向内侧压低
    const bank = new Float32Array(n);
    const maxBank = 0.38;
    for (let i = 0; i < n; i++) bank[i] = Math.max(-maxBank, Math.min(maxBank, kBank[i] * 30));
    const L = new Float32Array(n * 3), U = new Float32Array(n * 3), K = new Float32Array(n), slope = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const c = Math.cos(bank[i]), s = Math.sin(bank[i]);
      for (let k = 0; k < 3; k++) {
        U[i * 3 + k] = U0[i * 3 + k] * c + L0[i * 3 + k] * s;
        L[i * 3 + k] = L0[i * 3 + k] * c - U0[i * 3 + k] * s;
      }
      K[i] = kS[i] * c;
      slope[i] = T[i * 3 + 1];
    }
    // 赛车线：弯心偏向内侧，预先平滑并略微提前
    const lineRaw = new Float32Array(n);
    const kLine = gaussSmooth(kRaw, n, 40);
    for (let i = 0; i < n; i++) {
      const j = (i + 18) % n;
      lineRaw[i] = Math.max(-1, Math.min(1, kLine[j] * 130));
    }
    const line = gaussSmooth(lineRaw, n, 22);
    for (let i = 0; i < n; i++) line[i] *= this.half - 3.6;

    Object.assign(this, { P, T, L, U, K, slope, bank, line });

    // 加速带与拱门
    this.pads = def.pads.map(([f, xo]) => ({ s: f * this.length, x: xo * (this.half - 4), len: 11, w: 6.2 }));
    this.gates = def.gates.map((f) => f * this.length);

    // 小地图投影
    let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
    for (let i = 0; i < n; i++) { const x = P[i * 3], z = P[i * 3 + 2]; minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z); }
    this.bounds = { minX, maxX, minZ, maxZ };
    this.center = new THREE.Vector3((minX + maxX) / 2, 0, (minZ + maxZ) / 2);
    this.radius = Math.max(maxX - minX, maxZ - minZ) / 2;

    this._f = { P: new THREE.Vector3(), T: new THREE.Vector3(), L: new THREE.Vector3(), U: new THREE.Vector3(), k: 0, slope: 0, line: 0, bank: 0 };
  }

  wrap(s) { const L = this.length; return ((s % L) + L) % L; }

  /** 在弧长 s 处的坐标系（复用对象，调用者需立即使用） */
  frameAt(s, out = this._f) {
    const n = this.n;
    const idx = this.wrap(s) / this.ds;
    const i0 = Math.floor(idx) % n, i1 = (i0 + 1) % n, f = idx - Math.floor(idx);
    const g = 1 - f;
    const { P, T, L, U } = this;
    const a = i0 * 3, b = i1 * 3;
    out.P.set(P[a] * g + P[b] * f, P[a + 1] * g + P[b + 1] * f, P[a + 2] * g + P[b + 2] * f);
    out.T.set(T[a] * g + T[b] * f, T[a + 1] * g + T[b + 1] * f, T[a + 2] * g + T[b + 2] * f).normalize();
    out.L.set(L[a] * g + L[b] * f, L[a + 1] * g + L[b + 1] * f, L[a + 2] * g + L[b + 2] * f).normalize();
    out.U.set(U[a] * g + U[b] * f, U[a + 1] * g + U[b + 1] * f, U[a + 2] * g + U[b + 2] * f).normalize();
    out.k = this.K[i0] * g + this.K[i1] * f;
    out.slope = this.slope[i0] * g + this.slope[i1] * f;
    out.line = this.line[i0] * g + this.line[i1] * f;
    out.bank = this.bank[i0] * g + this.bank[i1] * f;
    return out;
  }

  kappaAt(s) { const idx = Math.floor(this.wrap(s) / this.ds) % this.n; return this.K[idx]; }
  lineAt(s) { const idx = Math.floor(this.wrap(s) / this.ds) % this.n; return this.line[idx]; }

  /** 前方一段距离内的最大 |曲率|（带符号） */
  maxKappaAhead(s, dist) {
    let best = 0;
    const steps = Math.max(1, Math.round(dist / 4));
    for (let i = 1; i <= steps; i++) {
      const k = this.kappaAt(s + i * 4);
      if (Math.abs(k) > Math.abs(best)) best = k;
    }
    return best;
  }

  /** 世界坐标：赛道 s、横向 x（左正）、离地高度 h */
  worldPos(s, x, h, out) {
    const f = this.frameAt(s);
    return out.copy(f.P).addScaledVector(f.L, x).addScaledVector(f.U, h);
  }

  /* ============ 网格 ============ */
  buildMeshes(palette, quality, envTex) {
    const group = new THREE.Group();
    group.name = 'track';
    const step = quality.low ? 3 : 2;
    const m = Math.ceil(this.length / step);
    const sAt = (i) => (i * this.length) / m;
    const f = { P: new THREE.Vector3(), T: new THREE.Vector3(), L: new THREE.Vector3(), U: new THREE.Vector3() };
    const half = this.half;
    const C = (hex) => new THREE.Color(hex);

    /* ---- 路面 ---- */
    {
      const pos = [], nor = [], uv = [], idx = [];
      for (let i = 0; i <= m; i++) {
        const s = sAt(i);
        this.frameAt(s, f);
        for (const side of [1, -1]) {
          const p = f.P.clone().addScaledVector(f.L, side * half);
          pos.push(p.x, p.y, p.z); nor.push(f.U.x, f.U.y, f.U.z); uv.push(side * half, s);
        }
        if (i < m) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx);
      g.computeBoundingSphere();
      const mat = new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 }, uHalf: { value: half }, uLen: { value: this.length },
          uBase: { value: C(palette.road) }, uLine: { value: C(palette.roadLine) },
          uEdge: { value: C(palette.accent) }, uEdge2: { value: C(palette.accent2) },
          uEnv: { value: envTex }, uFog: { value: C(palette.sky) },
          uShipPos: { value: Array.from({ length: 6 }, () => new THREE.Vector3(0, -9999, 0)) },
          uShipCol: { value: Array.from({ length: 6 }, () => new THREE.Color(0, 0, 0)) },
        },
        vertexShader: /* glsl */`
          varying vec2 vRoad; varying vec3 vWorld; varying vec3 vN;
          void main() {
            vRoad = uv;
            vec4 wp = modelMatrix * vec4(position, 1.0);
            vWorld = wp.xyz; vN = normalize(mat3(modelMatrix) * normal);
            gl_Position = projectionMatrix * viewMatrix * wp;
          }`,
        fragmentShader: /* glsl */`
          uniform float uTime, uHalf, uLen;
          uniform vec3 uBase, uLine, uEdge, uEdge2, uFog;
          uniform samplerCube uEnv;
          uniform vec3 uShipPos[6]; uniform vec3 uShipCol[6];
          varying vec2 vRoad; varying vec3 vWorld; varying vec3 vN;
          float gl(float c, float w) { float d = abs(fract(c - 0.5) - 0.5); float fw = fwidth(c); return 1.0 - smoothstep(w - fw, w + fw, d); }
          void main() {
            float lat = vRoad.x, s = vRoad.y;
            float ax = abs(lat) / uHalf;
            vec3 col = uBase * (0.75 + 0.5 * ax);
            // 面板网格
            float g = max(gl(lat / 3.75, 0.018), gl(s / 7.5, 0.012));
            col += uLine * g * 0.6;
            // 六边形细纹
            float hex = gl(s / 1.875 + lat / 3.75, 0.01) * 0.25;
            col += uLine * hex * (1.0 - ax);
            // 中线虚线
            float fw = fwidth(lat);
            float dash = step(0.42, fract(s / 9.0));
            col += uEdge2 * (1.0 - smoothstep(0.1, 0.1 + fw * 1.5, abs(lat))) * dash * 0.9;
            // 车道线
            float lane = (1.0 - smoothstep(0.06, 0.06 + fw * 1.5, abs(abs(lat) - uHalf * 0.5))) * step(0.6, fract(s / 6.0));
            col += uLine * lane * 0.9;
            // 边缘光带
            float e = smoothstep(0.78, 1.0, ax);
            col += uEdge * e * e * 1.3;
            float el = smoothstep(uHalf - 0.75 - fw, uHalf - 0.75, abs(lat)) * (1.0 - smoothstep(uHalf - 0.3, uHalf - 0.3 + fw, abs(lat)));
            col += uEdge * el * 2.2;
            // 向前流动的能量脉冲
            float ph = fract((s - uTime * 58.0) / 96.0);
            float pulse = smoothstep(0.0, 0.012, ph) * (1.0 - smoothstep(0.012, 0.08, ph));
            col += mix(uEdge, uEdge2, 0.35) * pulse * (0.1 + 0.9 * e);
            // 星空倒影（假光泽）
            vec3 V = normalize(vWorld - cameraPosition);
            vec3 N = normalize(vN);
            vec3 R = reflect(V, N);
            vec3 env = textureCube(uEnv, R).rgb;
            float fres = pow(1.0 - clamp(dot(-V, N), 0.0, 1.0), 4.0);
            col += env * (0.025 + 0.3 * fres);
            // 飞船灯光投影
            for (int i = 0; i < 6; i++) {
              vec3 d = vWorld - uShipPos[i];
              float dd = dot(d, d);
              col += uShipCol[i] * (exp(-dd * 0.045) * 0.55 + exp(-dd * 0.5) * 0.5);
            }
            float dist = length(vWorld - cameraPosition);
            col = mix(col, uFog, 1.0 - exp(-dist * 0.00045));
            gl_FragColor = vec4(col, 1.0);
          }`,
      });
      mat.extensions = { derivatives: true };
      const mesh = new THREE.Mesh(g, mat);
      mesh.frustumCulled = false;
      group.add(mesh);
      this.roadMat = mat;
    }

    /* ---- 底座（梯形截面）---- */
    {
      const depth = 2.4, inset = 1.6;
      const pos = [], nor = [], idx = [];
      const prof = [ // [lateral, up]
        [half, 0], [half - inset, -depth], [-(half - inset), -depth], [-half, 0],
      ];
      let v = 0;
      for (let seg = 0; seg < 3; seg++) {
        const a = prof[seg], b = prof[seg + 1];
        for (let i = 0; i <= m; i++) {
          this.frameAt(sAt(i), f);
          const pa = f.P.clone().addScaledVector(f.L, a[0]).addScaledVector(f.U, a[1]);
          const pb = f.P.clone().addScaledVector(f.L, b[0]).addScaledVector(f.U, b[1]);
          const dl = b[0] - a[0], du = b[1] - a[1];
          const nl = du, nu = -dl; // 截面法线（朝外）
          const nn = f.L.clone().multiplyScalar(nl).addScaledVector(f.U, nu).normalize();
          if (seg === 1) nn.copy(f.U).negate();
          pos.push(pa.x, pa.y, pa.z, pb.x, pb.y, pb.z);
          nor.push(nn.x, nn.y, nn.z, nn.x, nn.y, nn.z);
          if (i < m) { const q = v + i * 2; idx.push(q, q + 2, q + 1, q + 1, q + 2, q + 3); }
        }
        v += (m + 1) * 2;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
      g.setIndex(idx);
      g.computeBoundingSphere();
      const mat = new THREE.MeshStandardMaterial({ color: C(palette.under), metalness: 0.8, roughness: 0.38, envMap: envTex, envMapIntensity: 0.8, side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(g, mat);
      mesh.frustumCulled = false;
      group.add(mesh);
    }

    /* ---- 侧面与底部霓虹灯条 ---- */
    {
      const pos = [], idx = [];
      const strips = [ // [lateral, up, halfwidth along L/U dir, dirIsUp]
        [half + 0.02, -0.45, 0.16, true], [-(half + 0.02), -0.45, 0.16, true],
        [0, -2.45, 0.5, false],
      ];
      let v = 0;
      for (const [lat, up, hw, vertical] of strips) {
        for (let i = 0; i <= m; i++) {
          this.frameAt(sAt(i), f);
          const c = f.P.clone().addScaledVector(f.L, lat).addScaledVector(f.U, up);
          const d = vertical ? f.U : f.L;
          const p1 = c.clone().addScaledVector(d, hw), p2 = c.clone().addScaledVector(d, -hw);
          pos.push(p1.x, p1.y, p1.z, p2.x, p2.y, p2.z);
          if (i < m) { const q = v + i * 2; idx.push(q, q + 1, q + 2, q + 1, q + 3, q + 2); }
        }
        v += (m + 1) * 2;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setIndex(idx);
      const col = C(palette.accent2).multiplyScalar(2.2);
      const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: col, side: THREE.DoubleSide, toneMapped: true }));
      mesh.frustumCulled = false;
      group.add(mesh);
    }

    /* ---- 能量护栏 ---- */
    {
      const H = 2.6;
      const pos = [], uv = [], side = [], idx = [];
      let v = 0;
      for (const sd of [1, -1]) {
        for (let i = 0; i <= m; i++) {
          const s = sAt(i);
          this.frameAt(s, f);
          const b = f.P.clone().addScaledVector(f.L, sd * (half + 0.05));
          const t = b.clone().addScaledVector(f.U, H).addScaledVector(f.L, sd * 0.35);
          pos.push(b.x, b.y, b.z, t.x, t.y, t.z);
          uv.push(s, 0, s, 1); side.push(sd, sd);
          if (i < m) { const q = v + i * 2; idx.push(q, q + 1, q + 2, q + 1, q + 3, q + 2); }
        }
        v += (m + 1) * 2;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setAttribute('aSide', new THREE.Float32BufferAttribute(side, 1));
      g.setIndex(idx);
      const mat = new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 }, uLen: { value: this.length },
          uColor: { value: C(palette.accent) }, uColor2: { value: C(palette.glow3) },
          uHits: { value: Array.from({ length: 4 }, () => new THREE.Vector4(0, 0, 99, 0)) },
        },
        vertexShader: /* glsl */`
          attribute float aSide; varying vec2 vUv; varying float vSide; varying vec3 vWorld;
          void main() { vUv = uv; vSide = aSide; vec4 wp = modelMatrix * vec4(position, 1.0); vWorld = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`,
        fragmentShader: /* glsl */`
          uniform float uTime, uLen; uniform vec3 uColor, uColor2; uniform vec4 uHits[4];
          varying vec2 vUv; varying float vSide; varying vec3 vWorld;
          void main() {
            float h = vUv.y, s = vUv.x;
            float a = pow(1.0 - h, 2.4) * 0.38;
            a += smoothstep(0.12, 0.0, h) * 0.85;
            a += smoothstep(0.9, 1.0, h) * 0.55;
            float bx = abs(fract(s / 4.0 - 0.5) - 0.5); float fw = fwidth(s / 4.0);
            a += (1.0 - smoothstep(0.03 - fw, 0.03 + fw, bx)) * 0.35 * (1.0 - h * 0.6);
            a += pow(0.5 + 0.5 * sin((h * 3.0 - uTime * 1.6 + s * 0.02) * 6.2831), 10.0) * 0.18;
            vec3 col = uColor * a;
            for (int i = 0; i < 4; i++) {
              vec4 hh = uHits[i];
              if (hh.w <= 0.0) continue;
              float ds = mod(s - hh.x + uLen * 0.5, uLen) - uLen * 0.5;
              float same = step(0.0, hh.y * vSide);
              float t = hh.z;
              float ring = exp(-abs(abs(ds) - t * 30.0) * 0.6) * exp(-t * 4.0);
              float core = exp(-abs(ds) * 0.3) * exp(-t * 6.0);
              col += uColor2 * same * hh.w * (ring * 2.0 + core * 3.0) * (1.0 - h * 0.5);
            }
            float dist = length(vWorld - cameraPosition);
            col *= smoothstep(1100.0, 260.0, dist);
            gl_FragColor = vec4(col, 1.0);
          }`,
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      });
      mat.extensions = { derivatives: true };
      const mesh = new THREE.Mesh(g, mat);
      mesh.frustumCulled = false;
      mesh.renderOrder = 2;
      group.add(mesh);
      this.fenceMat = mat;
    }

    /* ---- 路灯柱 ---- */
    {
      const spacing = 16;
      const count = Math.floor(this.length / spacing);
      const geo = new THREE.BoxGeometry(0.28, 3.4, 0.28);
      geo.translate(0, 1.7, 0);
      const colors = [];
      const pa = geo.attributes.position;
      for (let i = 0; i < pa.count; i++) { const y = pa.getY(i); const k = y > 3.0 ? 1 : 0.06; colors.push(k, k, k); }
      geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      const mat = new THREE.MeshBasicMaterial({ vertexColors: true });
      const inst = new THREE.InstancedMesh(geo, mat, count * 2);
      const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(1, 1, 1), basis = new THREE.Matrix4();
      const ca = C(palette.accent).multiplyScalar(3), cb = C(palette.accent2).multiplyScalar(3);
      let k = 0;
      for (let i = 0; i < count; i++) {
        const s = i * spacing + 4;
        this.frameAt(s, f);
        basis.makeBasis(f.L.clone().negate(), f.U, f.T.clone().negate());
        q.setFromRotationMatrix(basis);
        for (const sd of [1, -1]) {
          const p = f.P.clone().addScaledVector(f.L, sd * (half + 0.7)).addScaledVector(f.U, -0.3);
          mtx.compose(p, q, sc);
          inst.setMatrixAt(k, mtx);
          inst.setColorAt(k, i % 4 === 0 ? cb : ca);
          k++;
        }
      }
      inst.instanceMatrix.needsUpdate = true;
      if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
      inst.frustumCulled = false;
      group.add(inst);
    }

    /* ---- 拱门 ---- */
    group.add(this._buildGates(palette, envTex));

    /* ---- 加速带 ---- */
    {
      const pos = [], uv = [], idx = [];
      let v = 0;
      const segs = 6;
      for (const pad of this.pads) {
        for (let i = 0; i <= segs; i++) {
          const s = pad.s - pad.len / 2 + (pad.len * i) / segs;
          this.frameAt(s, f);
          for (const sd of [-1, 1]) {
            const p = f.P.clone().addScaledVector(f.L, pad.x + sd * pad.w / 2).addScaledVector(f.U, 0.06);
            pos.push(p.x, p.y, p.z); uv.push(sd < 0 ? 1 : 0, i / segs);
          }
          if (i < segs) { const q = v + i * 2; idx.push(q, q + 1, q + 2, q + 1, q + 3, q + 2); }
        }
        v += (segs + 1) * 2;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx);
      const mat = new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 }, uColor: { value: C(palette.accent2) }, uColor2: { value: C('#ffffff') } },
        vertexShader: /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: /* glsl */`
          uniform float uTime; uniform vec3 uColor, uColor2; varying vec2 vUv;
          void main() {
            float x = abs(vUv.x - 0.5);
            float v = fract(vUv.y * 3.0 - x * 1.6 - uTime * 2.6);
            float chev = smoothstep(0.0, 0.08, v) * (1.0 - smoothstep(0.35, 0.5, v));
            float border = smoothstep(0.42, 0.5, x) + smoothstep(0.06, 0.0, vUv.y) + smoothstep(0.94, 1.0, vUv.y);
            vec3 col = uColor * (0.35 + chev * 2.6) + uColor2 * chev * 0.6 + uColor * border * 1.8;
            gl_FragColor = vec4(col, 1.0);
          }`,
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
        polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      });
      const mesh = new THREE.Mesh(g, mat);
      mesh.frustumCulled = false;
      mesh.renderOrder = 1;
      group.add(mesh);
      this.padMat = mat;
    }

    /* ---- 起终点线 ---- */
    {
      const cv = document.createElement('canvas');
      cv.width = 256; cv.height = 32;
      const x = cv.getContext('2d');
      for (let i = 0; i < 16; i++) for (let j = 0; j < 2; j++) { x.fillStyle = (i + j) % 2 ? '#0b0f1a' : '#f4f8ff'; x.fillRect(i * 16, j * 16, 16, 16); }
      const tex = new THREE.CanvasTexture(cv);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      const pos = [], uv = [], idx = [];
      const segs = 2, len = 4;
      for (let i = 0; i <= segs; i++) {
        const s = -len / 2 + (len * i) / segs;
        this.frameAt(s, f);
        for (const sd of [-1, 1]) {
          const p = f.P.clone().addScaledVector(f.L, sd * half).addScaledVector(f.U, 0.05);
          pos.push(p.x, p.y, p.z); uv.push(sd < 0 ? 0 : 1, i / segs);
        }
        if (i < segs) { const q = i * 2; idx.push(q, q + 1, q + 2, q + 1, q + 3, q + 2); }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx);
      const mat = new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(1.6, 1.6, 1.6), polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
      const mesh = new THREE.Mesh(g, mat);
      mesh.frustumCulled = false;
      group.add(mesh);
    }

    return group;
  }

  _buildGates(palette, envTex) {
    const half = this.half;
    const f = { P: new THREE.Vector3(), T: new THREE.Vector3(), L: new THREE.Vector3(), U: new THREE.Vector3() };
    const grp = new THREE.Group();
    // 六边形拱门的折线（横向, 高度）
    const w = half + 2.6;
    const poly = [[-w, -2], [-w, 10], [-w + 5, 15], [w - 5, 15], [w, 10], [w, -2]];
    const frameGeos = [], glowGeos = [];
    const mkBeam = (a, b, thick, depth, out) => {
      const dx = b[0] - a[0], dy = b[1] - a[1];
      const len = Math.hypot(dx, dy);
      const g = new THREE.BoxGeometry(len, thick, depth);
      g.rotateZ(Math.atan2(dy, dx));
      g.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 0);
      out.push(g);
    };
    for (let i = 0; i < poly.length - 1; i++) {
      mkBeam(poly[i], poly[i + 1], 1.3, 2.2, frameGeos);
      // 前后两面的发光条
      mkBeam(poly[i], poly[i + 1], 0.13, 2.45, glowGeos);
    }
    const proto = mergeGeos(frameGeos), protoGlow = mergeGeos(glowGeos);
    const frames = [], glows = [];
    const mtx = new THREE.Matrix4();
    this.gates.forEach((s, gi) => {
      this.frameAt(s, f);
      // 局部：x = 赛道右向(-L)，y = U，z = -T
      mtx.makeBasis(f.L.clone().negate(), f.U, f.T.clone().negate());
      mtx.setPosition(f.P);
      const g1 = proto.clone(); g1.applyMatrix4(mtx); frames.push(g1);
      const g2 = protoGlow.clone(); g2.applyMatrix4(mtx); glows.push(g2);
    });
    if (frames.length) {
      const frameMesh = new THREE.Mesh(mergeGeos(frames), new THREE.MeshStandardMaterial({ color: new THREE.Color(palette.under).multiplyScalar(1.6), metalness: 0.85, roughness: 0.3, envMap: envTex }));
      const glowMesh = new THREE.Mesh(mergeGeos(glows), new THREE.MeshBasicMaterial({ color: new THREE.Color(palette.accent).multiplyScalar(1.7) }));
      frameMesh.frustumCulled = glowMesh.frustumCulled = false;
      grp.add(frameMesh, glowMesh);
    }
    return grp;
  }

  /** 起点拱门（带倒计时灯）——返回 { group, lights[] } */
  buildStartGate(palette, envTex) {
    const half = this.half;
    const f = this.frameAt(-6);
    const grp = new THREE.Group();
    const w = half + 3.2;
    const mtx = new THREE.Matrix4().makeBasis(f.L.clone().negate(), f.U, f.T.clone().negate());
    mtx.setPosition(f.P);
    grp.applyMatrix4(mtx);
    const dark = new THREE.MeshStandardMaterial({ color: new THREE.Color(palette.under).multiplyScalar(1.8), metalness: 0.9, roughness: 0.25, envMap: envTex });
    const glow = new THREE.MeshBasicMaterial({ color: new THREE.Color(palette.accent).multiplyScalar(1.8) });
    const pillarG = new THREE.BoxGeometry(2.2, 20, 2.6);
    for (const sd of [-1, 1]) {
      const p = new THREE.Mesh(pillarG, dark); p.position.set(sd * w, 8, 0); grp.add(p);
      const l = new THREE.Mesh(new THREE.BoxGeometry(0.14, 18, 2.75), glow); l.position.set(sd * (w - 1.15), 8, 0); grp.add(l);
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(w * 2 + 2.2, 3.6, 2.6), dark); beam.position.set(0, 18.6, 0); grp.add(beam);
    const beamGlow = new THREE.Mesh(new THREE.BoxGeometry(w * 2, 0.14, 2.75), glow); beamGlow.position.set(0, 16.7, 0); grp.add(beamGlow);
    // 倒计时灯
    const lights = [];
    const lg = new THREE.SphereGeometry(0.75, 16, 12);
    for (let i = 0; i < 5; i++) {
      const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.08, 0.02, 0.02) });
      const s = new THREE.Mesh(lg, m); s.position.set((i - 2) * 2.4, 18.6, 1.45); grp.add(s); lights.push(s);
    }
    // 招牌
    const sign = makeTextPlane(['星际竞速', 'STAR RACER · 起点'], palette.accent, 512, 128);
    sign.scale.set(16, 4, 1);
    sign.position.set(0, 23.6, 0.3);
    grp.add(sign);
    return { group: grp, lights };
  }
}

/* ---------- 工具 ---------- */
export function mergeGeos(geos) {
  let vCount = 0, iCount = 0;
  const hasUv = geos.every((g) => g.attributes.uv);
  const parts = geos.map((g) => { const gg = g.index ? g : g; return gg; });
  for (const g of parts) { vCount += g.attributes.position.count; iCount += g.index ? g.index.count : g.attributes.position.count; }
  const pos = new Float32Array(vCount * 3), nor = new Float32Array(vCount * 3), uv = hasUv ? new Float32Array(vCount * 2) : null;
  const idx = new Uint32Array(iCount);
  let vo = 0, io = 0;
  for (const g of parts) {
    const p = g.attributes.position, n = g.attributes.normal;
    pos.set(p.array, vo * 3);
    if (n) nor.set(n.array, vo * 3);
    if (uv) uv.set(g.attributes.uv.array, vo * 2);
    if (g.index) { const a = g.index.array; for (let i = 0; i < a.length; i++) idx[io + i] = a[i] + vo; io += a.length; }
    else { for (let i = 0; i < p.count; i++) idx[io + i] = vo + i; io += p.count; }
    vo += p.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  if (uv) out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  out.computeBoundingSphere();
  return out;
}

const FONT = '"Noto Serif SC", "Songti SC", "PingFang SC", "Microsoft YaHei", "WenQuanYi Zen Hei", sans-serif';

/** 全息文字牌（加色混合） */
export function makeTextPlane(lines, color, w = 512, h = 128) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const x = cv.getContext('2d');
  x.clearRect(0, 0, w, h);
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.shadowColor = color; x.shadowBlur = 18;
  x.fillStyle = '#ffffff';
  x.font = `900 ${Math.round(h * 0.48)}px ${FONT}`;
  x.fillText(lines[0], w / 2, h * (lines[1] ? 0.4 : 0.52));
  if (lines[1]) {
    x.shadowBlur = 8;
    x.fillStyle = color;
    x.font = `600 ${Math.round(h * 0.17)}px ${FONT}`;
    x.fillText(lines[1], w / 2, h * 0.82);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.ShaderMaterial({
    uniforms: { map: { value: tex }, uTime: { value: 0 }, uColor: { value: new THREE.Color(color) } },
    vertexShader: /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: /* glsl */`
      uniform sampler2D map; uniform float uTime; uniform vec3 uColor; varying vec2 vUv;
      void main() {
        vec4 t = texture2D(map, vUv);
        float scan = 0.82 + 0.18 * sin(vUv.y * 120.0 - uTime * 6.0);
        float flick = 0.92 + 0.08 * sin(uTime * 23.0) * sin(uTime * 7.3);
        vec3 col = (t.rgb * 1.6 + uColor * 0.25 * t.a) * t.a * scan * flick;
        gl_FragColor = vec4(col, 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
  mesh.userData.holo = mat;
  return mesh;
}
