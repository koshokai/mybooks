/* 星际竞速 · 渲染世界：渲染器、后期（辉光/速度模糊）、星云天空盒、星点、灯光 */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const FinalShader = {
  uniforms: {
    tDiffuse: { value: null }, uBlur: { value: 0 }, uAberr: { value: 0.0015 }, uVignette: { value: 0.55 },
    uFlash: { value: 0 }, uFlashColor: { value: new THREE.Color(1, 1, 1) }, uCenter: { value: new THREE.Vector2(0.5, 0.52) },
    uWarn: { value: new THREE.Vector2(0, 0) }, uWarnColor: { value: new THREE.Color(1, 0.3, 0.2) },
  },
  vertexShader: /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform float uBlur, uAberr, uVignette, uFlash; uniform vec3 uFlashColor, uWarnColor; uniform vec2 uCenter, uWarn;
    varying vec2 vUv;
    void main() {
      vec2 dir = vUv - uCenter;
      float d = length(dir);
      vec3 col;
      if (uBlur > 0.002) {
        col = vec3(0.0);
        float tot = 0.0;
        for (int i = 0; i < SAMPLES; i++) {
          float t = float(i) / float(SAMPLES - 1);
          float w = 1.0 - t * 0.5;
          col += texture2D(tDiffuse, vUv - dir * t * uBlur * smoothstep(0.05, 0.6, d)).rgb * w;
          tot += w;
        }
        col /= tot;
      } else {
        col = texture2D(tDiffuse, vUv).rgb;
      }
      float ab = uAberr * d;
      col.r = mix(col.r, texture2D(tDiffuse, vUv + dir * ab).r, 0.85);
      col.b = mix(col.b, texture2D(tDiffuse, vUv - dir * ab).b, 0.85);
      col *= 1.0 - uVignette * smoothstep(0.38, 0.95, d * 1.25);
      float wl = smoothstep(0.22, 0.0, vUv.x) * uWarn.x + smoothstep(0.78, 1.0, vUv.x) * uWarn.y;
      col += uWarnColor * wl * 0.35;
      col += uFlashColor * uFlash;
      gl_FragColor = vec4(col, 1.0);
    }`,
};

export class World {
  constructor(canvas, quality) {
    this.q = quality;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
    renderer.setPixelRatio(quality.dpr);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer = renderer;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(68, 1, 0.3, 24000);
    this.scene.add(this.camera);

    const rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: quality.msaa });
    this.composer = new EffectComposer(renderer, rt);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(this.renderPass);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.62, 0.42, 0.74);
    if (quality.bloomScale < 1) {
      const orig = this.bloom.setSize.bind(this.bloom);
      this.bloom.setSize = (w, h) => orig(Math.max(64, Math.round(w * quality.bloomScale)), Math.max(64, Math.round(h * quality.bloomScale)));
    }
    this.composer.addPass(this.bloom);
    const fs = { ...FinalShader, fragmentShader: '#define SAMPLES ' + (quality.low ? 5 : 9) + '\n' + FinalShader.fragmentShader };
    fs.uniforms = THREE.UniformsUtils.clone(FinalShader.uniforms);
    this.final = new ShaderPass(fs);
    this.composer.addPass(this.final);
    this.composer.addPass(new OutputPass());

    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.content = new THREE.Group();
    this.scene.add(this.content);
    this.resize();
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.w = w; this.h = h;
  }

  setDpr(d) { this.renderer.setPixelRatio(d); this.resize(); }

  clear() {
    const old = this.content;
    this.scene.remove(old);
    old.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) { const ms = Array.isArray(o.material) ? o.material : [o.material]; ms.forEach((m) => { for (const k in m) { const v = m[k]; if (v && v.isTexture && v !== this.envCube && v !== this.envMap) v.dispose(); } if (m.uniforms) for (const k in m.uniforms) { const v = m.uniforms[k].value; if (v && v.isTexture && v !== this.envCube) v.dispose(); } m.dispose(); }); }
    });
    this.content = new THREE.Group();
    this.scene.add(this.content);
    if (this.skyRT) { this.skyRT.dispose(); this.skyRT = null; }
    if (this.envRT) { this.envRT.dispose(); this.envRT = null; }
  }

  /** 烘焙星云天空盒，并生成 PBR 环境贴图 */
  buildSky(palette, seed = 1) {
    const size = this.q.skySize;
    const rt = new THREE.WebGLCubeRenderTarget(size, { type: THREE.HalfFloatType, generateMipmaps: false });
    const cam = new THREE.CubeCamera(1, 1000, rt);
    const sc = new THREE.Scene();
    const C = (h) => new THREE.Color(h);
    const sd = new THREE.Vector3(...palette.sunDir).normalize();
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false,
      uniforms: { uSky: { value: C(palette.sky) }, uN1: { value: C(palette.neb1) }, uN2: { value: C(palette.neb2) }, uN3: { value: C(palette.neb3) }, uSun: { value: C(palette.sun) }, uSunDir: { value: sd }, uSeed: { value: seed } },
      vertexShader: /* glsl */`varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: /* glsl */`
        uniform vec3 uSky, uN1, uN2, uN3, uSun, uSunDir; uniform float uSeed; varying vec3 vDir;
        float hash(vec3 p) { p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3)); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
        float noise(vec3 x) {
          vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
                     mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
        }
        float fbm(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 6; i++) { s += a * noise(p); p = p * 2.02 + vec3(1.7, 9.2, 3.1); a *= 0.5; } return s; }
        float stars(vec3 d, float sc, float th) {
          vec3 p = d * sc; vec3 i = floor(p); vec3 f = fract(p);
          float h = hash(i + uSeed);
          if (h < th) return 0.0;
          vec3 c = vec3(hash(i + 1.3), hash(i + 2.7), hash(i + 4.1)) * 0.7 + 0.15;
          return smoothstep(0.16, 0.0, length(f - c)) * (h - th) / (1.0 - th);
        }
        void main() {
          vec3 d = normalize(vDir);
          vec3 q = d * 2.1 + uSeed * 3.17;
          float w = fbm(q * 1.4);
          float n1 = fbm(q + w * 1.3);
          float n2 = fbm(q * 1.9 + 7.3 + w);
          float n3 = fbm(q * 3.1 - 2.0);
          vec3 bandN = normalize(vec3(0.25, 1.0, 0.35));
          float band = exp(-pow(dot(d, bandN), 2.0) * 7.0);
          vec3 col = uSky * (0.8 + 0.4 * band);
          col += uN1 * pow(n1, 2.6) * (0.55 + 1.6 * band);
          col += uN2 * pow(n2, 3.4) * (0.25 + 1.9 * band);
          col += uN3 * pow(max(n1 * n3 * 1.6, 0.0), 2.4) * 0.9;
          col *= 0.5 + 0.5 * smoothstep(0.25, 0.62, fbm(q * 3.4 + 3.0));
          float st = stars(d, 300.0, 0.86) * 0.55 + stars(d, 140.0, 0.93) * 0.9;
          col += vec3(st) * mix(vec3(1.0, 0.86, 0.72), vec3(0.72, 0.84, 1.0), hash(floor(d * 140.0)));
          float sdot = max(dot(d, normalize(uSunDir)), 0.0);
          col += uSun * (pow(sdot, 1600.0) * 7.0 + pow(sdot, 120.0) * 0.3 + pow(sdot, 10.0) * 0.06);
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    const box = new THREE.Mesh(new THREE.BoxGeometry(100, 100, 100), mat);
    sc.add(box);
    cam.update(this.renderer, sc);
    box.geometry.dispose(); mat.dispose();
    this.skyRT = rt;
    this.envCube = rt.texture;
    this.scene.background = rt.texture;
    const env = this.pmrem.fromCubemap(rt.texture);
    this.envRT = env;
    this.envMap = env.texture;
    this.scene.environment = null; // 只给需要的材质单独指定
    return rt.texture;
  }

  /** 清晰的亮星（点精灵），补充天空盒分辨率 */
  buildStars(count, palette) {
    const pos = new Float32Array(count * 3), col = new Float32Array(count * 3), size = new Float32Array(count);
    const c1 = new THREE.Color('#ffffff'), c2 = new THREE.Color(palette.neb3), c3 = new THREE.Color('#ffd9b0'), c = new THREE.Color();
    for (let i = 0; i < count; i++) {
      const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, r = 9000;
      const s = Math.sqrt(1 - u * u);
      pos[i * 3] = Math.cos(th) * s * r; pos[i * 3 + 1] = u * r; pos[i * 3 + 2] = Math.sin(th) * s * r;
      const k = Math.random();
      c.copy(k < 0.6 ? c1 : k < 0.8 ? c2 : c3).lerp(c1, 0.4);
      const b = Math.pow(Math.random(), 6);
      const bright = 0.5 + b * 5.5;
      col[i * 3] = c.r * bright; col[i * 3 + 1] = c.g * bright; col[i * 3 + 2] = c.b * bright;
      size[i] = 1.2 + b * 3.4 + Math.random() * 0.6;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    const m = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uScale: { value: this.renderer.getPixelRatio() } },
      vertexShader: /* glsl */`
        attribute float aSize; varying vec3 vCol; uniform float uTime, uScale;
        void main() {
          vCol = color * (0.8 + 0.2 * sin(uTime * 2.0 + position.x * 0.01 + position.z * 0.013));
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = aSize * uScale;
        }`,
      fragmentShader: /* glsl */`
        varying vec3 vCol;
        void main() { vec2 p = gl_PointCoord - 0.5; float d = length(p); float a = smoothstep(0.5, 0.0, d); a = a * a; gl_FragColor = vec4(vCol * a, 1.0); }`,
      vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const pts = new THREE.Points(g, m);
    pts.frustumCulled = false;
    pts.renderOrder = -1;
    this.starMat = m;
    return pts;
  }

  buildLights(palette) {
    const grp = new THREE.Group();
    const hemi = new THREE.HemisphereLight(palette.hemi[0], palette.hemi[1], 1.1);
    const sun = new THREE.DirectionalLight(palette.sun, 2.6);
    sun.position.set(...palette.sunDir).multiplyScalar(100);
    const amb = new THREE.AmbientLight('#ffffff', 0.18);
    grp.add(hemi, sun, sun.target, amb);
    return grp;
  }

  render() { this.composer.render(); }
}
