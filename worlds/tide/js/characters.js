// 沉没之后 · 序章：可替换的 VRM 角色（@pixiv/three-vrm，MIT）
// assets/characters/manifest.json 里登记了文件名的角色才会加载；没有登记或加载失败都回退到程序化角色，不报错。
import * as THREE from "three";
import { GLTFLoader } from "./lib/GLTFLoader.js";

const BASE = new URL("../assets/characters/", import.meta.url).href;
let manifestP = null;
export function characterManifest() {
  if (!manifestP) manifestP = fetch(BASE + "manifest.json").then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
  return manifestP;
}

export async function loadVRM(key) {
  const man = await characterManifest();
  const file = man && man[key];
  if (!file || typeof file !== "string") return null;
  try {
    const { VRMLoaderPlugin, VRMUtils } = await import("./lib/three-vrm.module.min.js");
    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));
    const gltf = await loader.loadAsync(BASE + file);
    const vrm = gltf.userData.vrm;
    if (!vrm) return null;
    VRMUtils.removeUnnecessaryVertices(gltf.scene);
    if (VRMUtils.combineSkeletons) VRMUtils.combineSkeletons(gltf.scene); else if (VRMUtils.removeUnnecessaryJoints) VRMUtils.removeUnnecessaryJoints(gltf.scene);
    if (vrm.meta && vrm.meta.metaVersion === "0") VRMUtils.rotateVRM0(vrm);
    vrm.scene.traverse((o) => { o.frustumCulled = false; o.userData.noToon = true; o.userData.noOutline = true; });
    return vrm;
  } catch (e) {
    return null;
  }
}

// 坐姿 + 眨眼 + 呼吸 + 跟随视线的头部
export function seatedVRM(vrm) {
  const h = vrm.humanoid;
  const bone = (n) => (h && h.getNormalizedBoneNode ? h.getNormalizedBoneNode(n) : null);
  const set = (n, x, y, z) => { const b = bone(n); if (b) b.rotation.set(x, y, z); };
  set("leftUpperLeg", -1.45, 0, 0.05); set("rightUpperLeg", -1.45, 0, -0.05);
  set("leftLowerLeg", 1.45, 0, 0); set("rightLowerLeg", 1.45, 0, 0);
  set("leftUpperArm", 0.2, 0, 1.1); set("rightUpperArm", 0.2, 0, -1.1);
  set("leftLowerArm", 0, -0.9, 0); set("rightLowerArm", 0, 0.9, 0);
  let blinkT = 2, blink = 0;
  return {
    update(dt, t, look = 0, down = 0.3) {
      blinkT -= dt; if (blinkT <= 0) { blink = 0.16; blinkT = 2.5 + Math.random() * 3; }
      blink = Math.max(0, blink - dt);
      const em = vrm.expressionManager;
      if (em) em.setValue("blink", blink > 0 ? Math.sin((blink / 0.16) * Math.PI) : 0);
      const hd = bone("head"), sp = bone("spine");
      if (hd) hd.rotation.set(down + Math.sin(t * 0.7) * 0.02, look, 0);
      if (sp) sp.rotation.x = 0.06 + Math.sin(t * 1.6) * 0.01;
      vrm.update(dt);
    },
  };
}
