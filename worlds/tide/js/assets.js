// 沉没之后 · 序章：真实素材（Poly Haven CC0）的按需加载
// 每个世界先用程序化的替身立刻开画，素材到了再换上；任何文件加载失败都静默回退。
import * as THREE from "three";
import { GLTFLoader } from "./lib/GLTFLoader.js";
import { RGBELoader } from "./lib/RGBELoader.js";

const BASE = new URL("../assets/", import.meta.url).href;
const cache = new Map();
let pending = 0;
const pill = () => document.getElementById("loadPill");
function track(p) {
  pending++; const el = pill(); if (el) el.classList.add("on");
  const done = () => { pending = Math.max(0, pending - 1); if (!pending) { const e = pill(); if (e) e.classList.remove("on"); } };
  p.then(done, done);
  return p;
}
export const assetsPending = () => pending;

// 低端设备：降一档贴图（跳过 4k 天空、关阴影）
export const tier = { low: false, mid: false };

const texLoader = new THREE.TextureLoader();
export function loadTex(name, { srgb = true, repeat = null, aniso = 4 } = {}) {
  const key = "t:" + name + (srgb ? ":s" : ":l") + (repeat ? ":" + repeat.join("x") : "");
  if (cache.has(key)) return cache.get(key);
  const p = track(new Promise((res) => {
    texLoader.load(BASE + name, (t) => {
      if (srgb) t.colorSpace = THREE.SRGBColorSpace;
      if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
      t.anisotropy = aniso;
      res(t);
    }, undefined, () => res(null));
  }));
  cache.set(key, p);
  return p;
}

// PBR 材质组：<name>_diff / _nor / _rough
export async function loadPBR(name, repeat = [1, 1], { diff = true } = {}) {
  const [map, normalMap, roughnessMap] = await Promise.all([
    diff ? loadTex(`tex/${name}_diff.jpg`, { repeat }) : Promise.resolve(null),
    loadTex(`tex/${name}_nor.jpg`, { srgb: false, repeat }),
    loadTex(`tex/${name}_rough.jpg`, { srgb: false, repeat }),
  ]);
  return { map, normalMap, roughnessMap };
}

const gltf = new GLTFLoader();
export function loadModel(id) {
  const key = "m:" + id;
  if (cache.has(key)) return cache.get(key);
  const p = track(new Promise((res) => {
    gltf.load(`${BASE}models/${id}/${id}.gltf`, (g) => {
      g.scene.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      res(g.scene);
    }, undefined, () => res(null));
  }));
  cache.set(key, p);
  return p;
}
// 克隆一份（共享几何与材质）
export async function modelInstance(id) {
  const m = await loadModel(id);
  return m ? m.clone(true) : null;
}

const rgbe = new RGBELoader();
export function loadHDR(name) {
  const key = "h:" + name;
  if (cache.has(key)) return cache.get(key);
  const p = track(new Promise((res) => {
    rgbe.load(BASE + "hdri/" + name, (t) => { t.mapping = THREE.EquirectangularReflectionMapping; res(t); }, undefined, () => res(null));
  }));
  cache.set(key, p);
  return p;
}

// 把 HDR 全景按指定角度旋转后做成 PMREM 环境光（r160 还没有 environmentRotation）
export function envFromHDR(renderer, hdr, rot = 0, gain = 1) {
  const s = new THREE.Scene();
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { tHdr: { value: hdr }, uRot: { value: rot }, uGain: { value: gain } },
    vertexShader: "varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: `uniform sampler2D tHdr; uniform float uRot, uGain; varying vec3 vP;
      void main(){ vec3 d = normalize(vP);
        float u = atan(d.z, d.x + 1e-5) * 0.1591549 + 0.5 + uRot * 0.1591549;
        float v = asin(clamp(d.y, -1.0, 1.0)) * 0.3183099 + 0.5;
        vec3 c = texture2D(tHdr, vec2(fract(u), v)).rgb * uGain;
        gl_FragColor = vec4(min(c, vec3(64.0)), 1.0); }`,
  });
  s.add(new THREE.Mesh(new THREE.SphereGeometry(10, 48, 24), mat));
  const pm = new THREE.PMREMGenerator(renderer);
  const rt = pm.fromScene(s, 0.02);
  pm.dispose(); mat.dispose();
  return rt.texture;
}
