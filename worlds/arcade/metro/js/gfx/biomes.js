// 星环列车 · 五段环境（每 45 秒平滑过渡）
import * as THREE from 'three';

export const BIOMES = [
  {
    id: 'day', name: '昼侧', en: 'DAYSIDE', sub: '阳光正照着整颗星球',
    skyTop: '#01030a', skyMid: '#0d2a5c', skyBot: '#081228', nebA: '#34306a', nebB: '#1d4f72', neb: 0.12, stars: 0.22,
    sunDir: [0.62, 0.36, -0.7], sunCol: '#fff2dc', sunAmt: 0.8,
    pLight: [0.25, 0.7, 0.67], pOcean: '#1450a8', pDeep: '#061a46', pLand: '#4b8a46', pDesert: '#c2a46c', pCloud: '#ffffff', pCloudAmt: 1.0,
    pCity: '#ffc46a', pCityAmt: 0.0, pAtmo: '#5cb6ff', pAtmoN: '#1a3a8a', pTerm: '#ff8a46', pSpec: 0.7,
    ring: '#ffe0b0', ringAmt: 0.55,
    hemiSky: '#cfe2ff', hemiGround: '#3a4766', hemiInt: 1.15, keyCol: '#fff4e2', keyInt: 2.4, keyDir: [0.45, 0.8, 0.35],
    haze: '#5d8fd6', hazeAmt: 0.55,
    deckBase: '#3a4458', deckLine: '#7fe8ff', deckGlow: '#ffb547', rail: '#e8f2ff', lamp: '#fff1d0',
    exposure: 1.0, bloom: 0.5, asteroids: 0, aurora: 0, auroraA: '#3dffb0', auroraB: '#7a5cff', dust: '#cfe2ff',
  },
  {
    id: 'dusk', name: '晨昏线', en: 'TERMINATOR', sub: '白昼与黑夜在脚下交界',
    skyTop: '#06030f', skyMid: '#3a1838', skyBot: '#120a1c', nebA: '#6a2a5a', nebB: '#2a2a6a', neb: 0.22, stars: 0.5,
    sunDir: [-0.7, 0.05, -0.71], sunCol: '#ffb070', sunAmt: 0.85,
    pLight: [-0.92, 0.32, -0.2], pOcean: '#173f86', pDeep: '#071637', pLand: '#4a6e3c', pDesert: '#b88a5a', pCloud: '#ffe6d0', pCloudAmt: 0.95,
    pCity: '#ffbe5c', pCityAmt: 0.8, pAtmo: '#ff9a5a', pAtmoN: '#3a2a7a', pTerm: '#ff6a2a', pSpec: 1.0,
    ring: '#ffc890', ringAmt: 0.8,
    hemiSky: '#ffb890', hemiGround: '#40284a', hemiInt: 1.0, keyCol: '#ffae6e', keyInt: 2.4, keyDir: [-0.8, 0.45, -0.3],
    haze: '#b65a4a', hazeAmt: 0.55,
    deckBase: '#3e3446', deckLine: '#ffb547', deckGlow: '#ff6a4a', rail: '#ffd9b8', lamp: '#ffc890',
    exposure: 1.05, bloom: 0.65, asteroids: 0, aurora: 0, auroraA: '#3dffb0', auroraB: '#7a5cff', dust: '#ffc8a0',
  },
  {
    id: 'night', name: '夜侧', en: 'NIGHTSIDE', sub: '万家灯火铺满大陆',
    skyTop: '#010208', skyMid: '#060c22', skyBot: '#03050e', nebA: '#3a2a8a', nebB: '#1a5a7a', neb: 0.5, stars: 1.0,
    sunDir: [0.05, -0.55, -0.83], sunCol: '#ffd6a8', sunAmt: 0.0,
    pLight: [0.05, -0.45, -0.89], pOcean: '#0d2b66', pDeep: '#040c22', pLand: '#2a4a30', pDesert: '#6a5a40', pCloud: '#9aa8c8', pCloudAmt: 0.8,
    pCity: '#ffc062', pCityAmt: 1.35, pAtmo: '#3a7aff', pAtmoN: '#2a4aaa', pTerm: '#ff7a4a', pSpec: 0.0,
    ring: '#a8c8ff', ringAmt: 1.0,
    hemiSky: '#6a8cff', hemiGround: '#1a1a3a', hemiInt: 0.75, keyCol: '#9fc0ff', keyInt: 1.5, keyDir: [-0.3, 0.9, 0.2],
    haze: '#1a2a6a', hazeAmt: 0.6,
    deckBase: '#232a44', deckLine: '#ff5ad8', deckGlow: '#5ae8ff', rail: '#b8c8ff', lamp: '#8fd8ff',
    exposure: 1.1, bloom: 0.85, asteroids: 0, aurora: 0, auroraA: '#3dffb0', auroraB: '#7a5cff', dust: '#9fb8ff',
  },
  {
    id: 'belt', name: '碎星带', en: 'ASTEROID BELT', sub: '穿过古老的岩石环',
    skyTop: '#04020c', skyMid: '#1a0f3a', skyBot: '#080616', nebA: '#8a3aa8', nebB: '#1a8a9a', neb: 0.85, stars: 0.8,
    sunDir: [0.85, 0.25, -0.46], sunCol: '#e8f0ff', sunAmt: 0.6,
    pLight: [0.95, 0.15, -0.25], pOcean: '#2a2a5a', pDeep: '#0a0a22', pLand: '#5a4a6a', pDesert: '#8a6a7a', pCloud: '#c8b8e8', pCloudAmt: 0.7,
    pCity: '#ff9ad0', pCityAmt: 0.6, pAtmo: '#b07aff', pAtmoN: '#4a2a8a', pTerm: '#ff6ad0', pSpec: 0.4,
    ring: '#d8b8ff', ringAmt: 0.7,
    hemiSky: '#b89aff', hemiGround: '#2a1a40', hemiInt: 0.95, keyCol: '#e8f0ff', keyInt: 2.6, keyDir: [0.8, 0.5, 0.1],
    haze: '#4a2a7a', hazeAmt: 0.55,
    deckBase: '#2e2a46', deckLine: '#5af0d8', deckGlow: '#c87aff', rail: '#d8d0ff', lamp: '#c8f8ff',
    exposure: 1.05, bloom: 0.7, asteroids: 1, aurora: 0, auroraA: '#3dffb0', auroraB: '#7a5cff', dust: '#d8c8ff',
  },
  {
    id: 'aurora', name: '极光环', en: 'AURORA RIBBON', sub: '磁极上空的光之帷幕',
    skyTop: '#000308', skyMid: '#04182a', skyBot: '#020a10', nebA: '#1a6a5a', nebB: '#3a2a8a', neb: 0.35, stars: 0.95,
    sunDir: [0.0, -0.6, -0.8], sunCol: '#ffd6a8', sunAmt: 0.0,
    pLight: [-0.2, -0.5, -0.84], pOcean: '#0a2a4a', pDeep: '#030c18', pLand: '#244a3a', pDesert: '#4a5a4a', pCloud: '#a8d8d0', pCloudAmt: 0.85,
    pCity: '#9affd8', pCityAmt: 0.9, pAtmo: '#3affc8', pAtmoN: '#1a6a8a', pTerm: '#5affb0', pSpec: 0.0,
    ring: '#a8ffe8', ringAmt: 0.9,
    hemiSky: '#6affd0', hemiGround: '#0a2030', hemiInt: 0.85, keyCol: '#a8ffe8', keyInt: 1.6, keyDir: [0.2, 0.9, -0.3],
    haze: '#0a4a4a', hazeAmt: 0.6,
    deckBase: '#1e3038', deckLine: '#5affb0', deckGlow: '#ff6ad8', rail: '#c8fff0', lamp: '#b8ffe8',
    exposure: 1.1, bloom: 0.85, asteroids: 0, aurora: 1, auroraA: '#3dffb0', auroraB: '#c45cff', dust: '#b8ffe8',
  },
];

// 预先把颜色转成 THREE.Color，向量转成 Vector3
const COLOR_KEYS = [];
const VEC_KEYS = [];
const NUM_KEYS = [];
for (const k of Object.keys(BIOMES[0])) {
  const v = BIOMES[0][k];
  if (typeof v === 'string' && v[0] === '#') COLOR_KEYS.push(k);
  else if (Array.isArray(v)) VEC_KEYS.push(k);
  else if (typeof v === 'number') NUM_KEYS.push(k);
}
export const BIO = BIOMES.map((b) => {
  const o = { ...b };
  for (const k of COLOR_KEYS) o[k] = new THREE.Color(b[k]);
  for (const k of VEC_KEYS) o[k] = new THREE.Vector3(...b[k]).normalize();
  return o;
});

// 当前混合结果（复用对象，避免每帧分配）
export const MIX = (() => {
  const o = {};
  for (const k of COLOR_KEYS) o[k] = new THREE.Color();
  for (const k of VEC_KEYS) o[k] = new THREE.Vector3();
  for (const k of NUM_KEYS) o[k] = 0;
  return o;
})();

export function blendBiomes(ia, ib, w) {
  const A = BIO[ia % BIO.length], B = BIO[ib % BIO.length];
  for (const k of COLOR_KEYS) MIX[k].copy(A[k]).lerp(B[k], w);
  for (const k of VEC_KEYS) MIX[k].copy(A[k]).lerp(B[k], w).normalize();
  for (const k of NUM_KEYS) MIX[k] = A[k] + (B[k] - A[k]) * w;
  return MIX;
}

// 从任意当前状态（快照）平滑过渡到某个环境
export function snapshot() {
  const o = {};
  for (const k of COLOR_KEYS) o[k] = MIX[k].clone();
  for (const k of VEC_KEYS) o[k] = MIX[k].clone();
  for (const k of NUM_KEYS) o[k] = MIX[k];
  return o;
}
export function blendFrom(from, ib, w) {
  const B = BIO[ib % BIO.length];
  for (const k of COLOR_KEYS) MIX[k].copy(from[k]).lerp(B[k], w);
  for (const k of VEC_KEYS) MIX[k].copy(from[k]).lerp(B[k], w).normalize();
  for (const k of NUM_KEYS) MIX[k] = from[k] + (B[k] - from[k]) * w;
  return MIX;
}
