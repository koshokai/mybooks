// 离屏小渲染器：给鱼店和造景面板生成真实的 3D 缩略图
import * as THREE from "three";
import { makeFishMesh } from "./fishgeo.js";
import { rockGeo, woodGeo, plantGeo } from "./scape.js";
import { patch } from "./gfx.js";

let MATS = null;
function SCAPE_THUMB(t, k) {
  MATS ||= {
    rock: patch(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82 }), "decor"),
    plant: patch(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, side: THREE.DoubleSide, emissive: 0x0c2a08, emissiveIntensity: 0.35 }), "plant"),
  };
  const seed = 4242;
  const G = t === "rock" ? rockGeo(k, seed) : t === "wood" ? woodGeo(k, seed) : plantGeo(k, seed);
  return new THREE.Mesh(G.geo, t === "plant" ? MATS.plant : MATS.rock);
}

let R = null, scene, cam;
const cache = new Map();
function init() {
  if (R) return true;
  try {
    const cv = document.createElement("canvas"); cv.width = 240; cv.height = 150;
    R = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true, preserveDrawingBuffer: true });
    R.setPixelRatio(1); R.setSize(240, 150, false);
    R.toneMapping = THREE.ACESFilmicToneMapping; R.toneMappingExposure = 1.1;
    scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xdff4ff, 0x40301c, 1.4));
    const d = new THREE.DirectionalLight(0xffffff, 2.4); d.position.set(1, 3, 4); scene.add(d);
    const b = new THREE.DirectionalLight(0x9fd8ff, 1.2); b.position.set(-2, 1, -3); scene.add(b);
    cam = new THREE.PerspectiveCamera(30, 240 / 150, 0.01, 100);
    return true;
  } catch (e) { R = null; return false; }
}
const still = () => ({ uPhase: { value: 1.2 }, uAmp: { value: 0.05 }, uWave: { value: 5.6 }, uTurn: { value: 0 }, uFlut: { value: 0 }, uFlutK: { value: 0 }, uBreath: { value: 0 }, uDroop: { value: 0 } });

function shoot(obj, fitW, fitH, center, elev = 0) {
  scene.add(obj);
  const t = Math.tan((cam.fov * Math.PI) / 360);
  const dist = Math.max(fitH / 2 / t, fitW / 2 / (t * cam.aspect)) * 1.08;
  cam.position.set(center.x, center.y + dist * Math.sin(elev), center.z + dist * Math.cos(elev));
  cam.lookAt(center);
  R.setClearColor(0x000000, 0); R.clear();
  R.render(scene, cam);
  const url = R.domElement.toDataURL("image/png");
  scene.remove(obj);
  return url;
}

export function fishThumb(sp, v = 0, sex) {
  const key = "f:" + sp + v + sex;
  if (cache.has(key)) return cache.get(key);
  if (!init()) return "";
  const g = makeFishMesh(sp, { sp, v, sex }, still());
  const box = new THREE.Box3().setFromObject(g), c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3());
  g.rotation.y = 0.18; g.rotation.x = 0.0;
  const url = shoot(g, s.x * (sp === "shrimp" ? 1.0 : 1.05), s.y * 1.25, c, 0.08);
  cache.set(key, url); return url;
}

export function scapeThumb(t, k) {
  const key = "s:" + t + k;
  if (cache.has(key)) return cache.get(key);
  if (!init()) return "";
  const m = SCAPE_THUMB(t, k);
  const box = new THREE.Box3().setFromObject(m), c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3());
  const url = shoot(m, Math.max(s.x, s.z) * 1.15, s.y * 1.25, c, 0.35);
  cache.set(key, url); return url;
}
