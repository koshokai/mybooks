// 沉没之后 · 序章：动画电影画风（手绘感天空、赛璐璐着色、描边）
import * as THREE from "three";

/* ---------- 手绘感的天空：渐变 + 积云层 + 地平线上的积雨云塔 ---------- */
// 依赖 GLSL_NOISE（hash12 / vnoise / fbm / fbm3）
// uniforms：uZen uMid uHor uSunDir uSunCol uCloudLit uCloudDark(阴影色) uCloudRim uCloud(覆盖率) uCb(云塔高度) uStars uFlash uFlashDir uTime
export const ANIME_SKY_GLSL = /* glsl */ `
vec3 animeSkyBase(vec3 d){
  float y = d.y;
  vec3 c = mix(uHor, uMid, smoothstep(-0.02, 0.22, y));
  c = mix(c, uZen, smoothstep(0.18, 0.8, y));
  float sd = max(dot(d, uSunDir), 0.0);
  float s2 = sd * sd, s4 = s2 * s2, s8 = s4 * s4, s32 = s8 * s8 * s8 * s8, s128 = s32 * s32 * s32 * s32;
  c += uSunCol * (s128 * 1.2 + s32 * 0.22 + s8 * 0.08 + s2 * 0.02);
  c += uSunCol * 9.0 * smoothstep(0.99935, 0.99965, dot(d, uSunDir));
  return c;
}
// 地平线上的积雨云塔（返回 rgb + 覆盖度）
vec4 animeTowers(vec3 d, float lod){
  float y = d.y;
  float az = atan(d.z, d.x + 1e-5);
  float hgt = uCb * (0.03 + 0.3 * smoothstep(0.38, 0.8, fbm3(vec2(az * 1.3, 3.7))) + 0.06 * fbm3(vec2(az * 5.0, 1.1)));
  vec2 bp = vec2(az * 9.0, y * 15.0) + vec2(uTime * 0.003, 0.0);
  float bill = lod > 0.5 ? fbm(bp) : fbm3(bp);
  float edge = hgt + (bill - 0.5) * 0.08 - y;
  float tower = smoothstep(-0.004, 0.004, edge) * smoothstep(-0.05, 0.0, y);
  vec2 hz = vec2(d.x, d.z); float hl = length(hz); hz = hl > 1e-4 ? hz / hl : vec2(0.0, 1.0);
  vec2 sz = vec2(uSunDir.x, uSunDir.z); float sl = length(sz); sz = sl > 1e-4 ? sz / sl : vec2(0.0, 1.0);
  float sAz = max(dot(hz, sz), 0.0);
  float shade = clamp(y / (hgt + 0.02), 0.0, 1.0) * 0.55 + bill * 0.45 + sAz * 0.25;
  float band = smoothstep(0.42, 0.5, shade) * 0.55 + smoothstep(0.66, 0.74, shade) * 0.45;
  vec3 cc = mix(uCloudDark, uCloudLit, band);
  float rim = smoothstep(0.0, 0.01, edge) - smoothstep(0.012, 0.045, edge);
  cc += uCloudRim * rim * (0.35 + sAz * 1.6);
  float fd = max(dot(d, uFlashDir), 0.0);
  cc += uFlash * vec3(0.85, 0.75, 1.1) * (0.12 + fd * fd * 1.4) * (0.3 + bill * 0.8);
  return vec4(cc, tower);
}
vec3 animeSky(vec3 d){
  vec3 c = animeSkyBase(d);
  float y = d.y;
  // 星星（只在夜里）
  if (uStars > 0.01 && y > 0.05) { vec2 sp = d.xz / (y + 0.3) * 260.0; c += vec3(0.9, 0.95, 1.1) * uStars * step(0.9975, hash12(floor(sp))) * smoothstep(0.05, 0.3, y); }
  // 高空积云层
  if (y > 0.0) {
    vec2 p = d.xz / (y + 0.16) * 0.65 + vec2(uTime * 0.004, uTime * 0.011);
    float n = fbm(p * 1.25);
    float n2 = fbm(p * 1.25 + uSunDir.xz * 0.07);
    float th = 1.02 - uCloud * 0.5;
    float dens = smoothstep(th - 0.015, th + 0.025, n) * smoothstep(0.0, 0.07, y);
    float lit = clamp((n - n2) * 7.0 + 0.5, 0.0, 1.0);
    float band = smoothstep(0.32, 0.4, lit) * 0.6 + smoothstep(0.68, 0.76, lit) * 0.4;
    vec3 cc = mix(uCloudDark, uCloudLit, band);
    float rim = smoothstep(th - 0.015, th + 0.02, n) - smoothstep(th + 0.025, th + 0.11, n);
    float sunF = max(dot(d, uSunDir), 0.0); sunF *= sunF;
    cc += uCloudRim * rim * (0.3 + sunF * 2.2);
    float fd = max(dot(d, uFlashDir), 0.0);
    cc += uFlash * vec3(0.8, 0.72, 1.1) * (0.1 + fd * fd * 1.3) * (0.3 + n * 0.8);
    c = mix(c, cc, dens);
  }
  vec4 tw = animeTowers(d, 1.0);
  c = mix(c, tw.rgb, tw.a);
  c += uFlash * vec3(0.35, 0.3, 0.55) * 0.18;
  return c;
}
`;

// 天空调色板
export const SKY_PALETTES = {
  sunset: { zen: [0.03, 0.09, 0.36], mid: [0.16, 0.42, 0.78], hor: [1.0, 0.5, 0.26], sun: [1.7, 0.95, 0.45], lit: [1.35, 0.78, 0.52], dark: [0.34, 0.26, 0.5], rim: [1.8, 1.05, 0.55], cloud: 0.5, cb: 0.9, stars: 0 },
  stormDusk: { zen: [0.04, 0.04, 0.12], mid: [0.12, 0.13, 0.28], hor: [0.3, 0.28, 0.42], sun: [0.2, 0.1, 0.1], lit: [0.34, 0.33, 0.52], dark: [0.08, 0.07, 0.16], rim: [0.45, 0.4, 0.7], cloud: 0.95, cb: 1.0, stars: 0 },
  stormNight: { zen: [0.012, 0.016, 0.045], mid: [0.025, 0.04, 0.085], hor: [0.04, 0.09, 0.12], sun: [0, 0, 0], lit: [0.07, 0.085, 0.15], dark: [0.012, 0.014, 0.035], rim: [0.14, 0.18, 0.32], cloud: 1.0, cb: 0.85, stars: 0 },
  dawn: { zen: [0.04, 0.14, 0.5], mid: [0.22, 0.48, 0.82], hor: [0.95, 0.6, 0.36], sun: [1.6, 1.1, 0.65], lit: [1.35, 1.1, 0.9], dark: [0.42, 0.46, 0.74], rim: [2.0, 1.5, 0.9], cloud: 0.42, cb: 0.95, stars: 0 },
};

/* ---------- 赛璐璐着色：就地改造 MeshStandardMaterial ---------- */
// 把漫反射光量化成 3 档，暗部偏蓝紫，加边缘光；贴图轻度色阶化。共享 uniforms，世界可随时调光。
export function toonUniforms(o = {}) {
  return {
    uToon: { value: 1 },
    uKey: { value: o.key ?? 1 },
    uShade: { value: new THREE.Color(...(o.shade || [0.46, 0.44, 0.72])) },
    uRimCol: { value: new THREE.Color(...(o.rim || [0.35, 0.3, 0.25])) },
    uPost: { value: o.post ?? 0.5 },
  };
}
const patched = new WeakSet();
export function toonPatch(mat, U) {
  if (!mat || patched.has(mat) || !mat.isMeshStandardMaterial) return;
  patched.add(mat);
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.fragmentShader = sh.fragmentShader
      .replace("void main() {", "uniform float uToon, uKey, uPost; uniform vec3 uShade, uRimCol;\nvoid main() {")
      .replace("#include <map_fragment>", "#include <map_fragment>\n diffuseColor.rgb = mix(diffuseColor.rgb, floor(diffuseColor.rgb * 7.0 + 0.5) / 7.0, uPost * uToon);")
      .replace("#include <opaque_fragment>", /* glsl */ `
        {
          vec3 dc = max(diffuseColor.rgb, vec3(0.02));
          vec3 irr = totalDiffuse / dc;
          float L = max(luminance(irr), 1e-4);
          float r = L / max(uKey, 1e-3);
          float band = smoothstep(0.2, 0.26, r) * 0.42 + smoothstep(0.58, 0.66, r) * 0.58;
          vec3 hue = irr / L;
          float Lq = mix(L * 2.1, uKey * mix(0.42, 1.0, band) * (0.85 + 0.15 * clamp(r, 0.0, 2.0)), smoothstep(0.12, 0.2, r));
          vec3 tirr = hue * Lq * mix(uShade, vec3(1.0), band);
          vec3 vd = normalize(vViewPosition);
          float rim = 1.0 - clamp(dot(normalize(normal), vd), 0.0, 1.0); rim = rim * rim * rim;
          vec3 toonOut = diffuseColor.rgb * tirr + totalSpecular * 0.35 + totalEmissiveRadiance + uRimCol * rim * diffuseColor.rgb * uKey;
          outgoingLight = mix(outgoingLight, toonOut, uToon);
        }
        #include <opaque_fragment>`);
  };
  mat.customProgramCacheKey = () => "toon1";
  if (mat.metalness > 0.3) mat.metalness = 0.3;
  if (mat.normalMap) mat.normalScale.multiplyScalar(0.45);
  mat.needsUpdate = true;
}
export function toonify(root, U) {
  root.traverse((o) => {
    if (!o.isMesh || o.userData.noToon) return;
    const ms = Array.isArray(o.material) ? o.material : [o.material];
    ms.forEach((m) => toonPatch(m, U));
  });
}

/* ---------- 描边（反向外壳，屏幕空间等宽，随距离淡出）---------- */
export function outlineUniforms(o = {}) {
  return {
    uPx: { value: o.px ?? 1.6 }, uRes: { value: new THREE.Vector2(1280, 720) },
    uCol: { value: new THREE.Color(...(o.col || [0.07, 0.05, 0.1])) },
    uFar0: { value: o.far0 ?? 6 }, uFar1: { value: o.far1 ?? 30 },
  };
}
function outlineMaterial(U) {
  return new THREE.ShaderMaterial({
    uniforms: U, side: THREE.BackSide,
    vertexShader: /* glsl */ `
      uniform float uPx, uFar0, uFar1; uniform vec2 uRes;
      void main(){
        mat4 m = modelMatrix;
        #ifdef USE_INSTANCING
          m = m * instanceMatrix;
        #endif
        vec4 wp = m * vec4(position, 1.0);
        vec3 wn = mat3(m) * normal;
        float wl = length(wn); wn = wl > 1e-6 ? wn / wl : vec3(0.0, 1.0, 0.0);
        vec4 mv = viewMatrix * wp;
        gl_Position = projectionMatrix * mv;
        vec2 dir = (projectionMatrix * vec4(mat3(viewMatrix) * wn, 0.0)).xy;
        float l = length(dir); dir = l > 1e-5 ? dir / l : vec2(0.0);
        float fade = clamp(1.0 - (-mv.z - uFar0) / max(uFar1, 1.0), 0.0, 1.0);
        gl_Position.xy += dir * uPx * 2.0 / max(uRes, vec2(1.0)) * gl_Position.w * fade;
      }`,
    fragmentShader: "uniform vec3 uCol; void main(){ gl_FragColor = vec4(uCol, 1.0); }",
  });
}
const outlined = new WeakSet();
export function addOutlines(root, U) {
  const mat = U.__mat || (U.__mat = outlineMaterial(U));
  const list = [];
  root.traverse((o) => {
    if (!o.isMesh || o.isPoints || outlined.has(o) || o.userData.isOutline || o.userData.noOutline) return;
    const m0 = Array.isArray(o.material) ? o.material[0] : o.material;
    if (!m0 || m0.transparent || m0.isShaderMaterial || m0.isMeshBasicMaterial || m0.isPointsMaterial) return;
    list.push(o);
  });
  for (const o of list) {
    outlined.add(o);
    let ol;
    if (o.isInstancedMesh) { ol = new THREE.InstancedMesh(o.geometry, mat, o.count); ol.instanceMatrix = o.instanceMatrix; ol.frustumCulled = false; ol.onBeforeRender = () => { ol.count = o.count; }; }
    else ol = new THREE.Mesh(o.geometry, mat);
    ol.userData.isOutline = true; ol.castShadow = false; ol.receiveShadow = false; ol.renderOrder = o.renderOrder;
    o.add(ol);
  }
}

// 3 档渐变贴图（给需要 MeshToonMaterial 的场合）
export function stepTexture() {
  const t = new THREE.DataTexture(new Uint8Array([90, 90, 90, 255, 170, 170, 170, 255, 255, 255, 255, 255]), 3, 1);
  t.minFilter = t.magFilter = THREE.NearestFilter; t.generateMipmaps = false; t.needsUpdate = true;
  return t;
}
