// 星环列车 · 轨道：甲板（单个着色器画出轨枕、导光线、灯光、断轨、警示）、钢轨、桁架、路灯
import * as THREE from 'three';
import { BEND_GLSL, BEND, GB, bend } from './util.js';
import { MIX } from './biomes.js';
import { LANE_X, LANE_W, DECK_HW } from '../config.js';

const Z_NEAR = 34, Z_FAR = -262; // 甲板覆盖的渲染 z 范围
const LEN = Z_NEAR - Z_FAR;
const MAX_GAPS = 10;

export class Track {
  constructor(scene) {
    this.gaps = [];
    for (let i = 0; i < MAX_GAPS; i++) this.gaps.push(new THREE.Vector4(0, 0, 0, 0));
    this.u = {
      uBendY: BEND.y, uBendX: BEND.x,
      uDist: { value: 0 }, uTime: { value: 0 },
      uBase: { value: MIX.deckBase }, uLine: { value: MIX.deckLine }, uGlow: { value: MIX.deckGlow }, uLamp: { value: MIX.lamp },
      uHaze: { value: MIX.haze }, uHazeAmt: { value: 0.5 }, uHemi: { value: MIX.hemiSky }, uKey: { value: MIX.keyCol }, uKeyInt: { value: 1 },
      uRail: { value: MIX.rail },
      uGaps: { value: this.gaps }, uWarn: { value: new THREE.Vector3() }, uPulse: { value: 0 },
    };
    // —— 甲板 ——
    const g = new THREE.PlaneGeometry(DECK_HW * 2, LEN, 12, 150);
    g.rotateX(-Math.PI / 2);
    g.translate(0, 0, (Z_NEAR + Z_FAR) / 2);
    this.deck = new THREE.Mesh(g, new THREE.ShaderMaterial({
      uniforms: this.u,
      extensions: { derivatives: true },
      vertexShader: BEND_GLSL + /* glsl */`
        varying vec3 vP; varying float vFog;
        void main() {
          vec4 w = modelMatrix * vec4(position, 1.0);
          vP = w.xyz;
          vec4 mv = viewMatrix * vec4(bendWorld(w.xyz), 1.0);
          vFog = -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`
        uniform float uDist, uTime, uHazeAmt, uKeyInt, uPulse;
        uniform vec3 uBase, uLine, uGlow, uLamp, uHaze, uHemi, uKey, uWarn;
        uniform vec4 uGaps[${MAX_GAPS}];
        varying vec3 vP; varying float vFog;
        float band(float d, float w) { float fw = fwidth(d) * 1.2 + 1e-4; return 1.0 - smoothstep(w - fw, w + fw, abs(d)); }
        void main() {
          float s = uDist - vP.z;
          float x = vP.x;
          float lanef = clamp(floor((x + ${(LANE_W * 1.5).toFixed(3)}) / ${LANE_W.toFixed(3)}), 0.0, 2.0);
          int li = int(lanef);
          float lx = x - (lanef - 1.0) * ${LANE_W.toFixed(3)};
          float ax = abs(x);
          // 断轨
          float gapEdge = 99.0;
          for (int i = 0; i < ${MAX_GAPS}; i++) {
            vec4 gp = uGaps[i];
            if (gp.w < 0.5) continue;
            int m = int(gp.z + 0.5);
            if (((m >> li) & 1) == 1) {
              if (s > gp.x && s < gp.y) discard;
              gapEdge = min(gapEdge, min(abs(s - gp.x), abs(s - gp.y)));
            }
          }
          float fw = fwidth(s);
          vec3 base = uBase;
          // 轨道槽（较暗）与走道板（较亮）
          float inLane = 1.0 - smoothstep(0.92, 0.98, abs(lx));
          float edge = smoothstep(3.42, 3.5, ax);
          vec3 col = mix(base * 1.25, base * 0.62, inLane);
          // 板缝
          float seamS = band(fract(s / 4.0) - 0.5, 0.012) * (1.0 - inLane);
          col *= 1.0 - seamS * 0.35;
          // 轨枕
          float sl = fract(s / 1.15);
          float sleeper = (1.0 - smoothstep(0.26, 0.3, abs(sl - 0.5))) * (1.0 - smoothstep(0.84, 0.9, abs(lx)));
          col = mix(col, base * 1.55 + vec3(0.03), sleeper * inLane * (1.0 - smoothstep(60.0, 150.0, vFog) * 0.7));
          // 车道中心的导引灯点 + 前行的能量脉冲
          float dotS = band(fract(s / 3.0) - 0.5, 0.05) * band(lx, 0.07) * inLane * (1.0 - sleeper);
          float wave = pow(fract(s / 36.0 - uTime * (0.55 + uPulse * 0.5)), 6.0);
          vec3 glow = uLine * dotS * (0.4 + wave * 2.4);
          // 车道分隔线
          float divD = abs(abs(x) - ${(LANE_W / 2).toFixed(3)});
          float div = band(divD, 0.03) * step(ax, ${(LANE_W * 1.5).toFixed(3)});
          float dash = 0.55 + 0.45 * step(0.5, fract(s / 6.0 + uTime * 0.0));
          glow += uLine * div * dash * 0.55;
          // 甲板边缘发光带
          float rim = band(ax - 3.62, 0.05);
          glow += uGlow * rim * (0.45 + 0.7 * pow(fract(s / 18.0 - uTime * 0.8), 8.0));
          col = mix(col, base * 0.5, edge);
          // 路灯光斑（与灯柱位置一致：左侧每 30 米，右侧错开 15 米）
          float dl = abs(mod(s + 15.0 - 9.0, 30.0) - 15.0), dr = abs(mod(s - 9.0, 30.0) - 15.0);
          float pool = exp(-(dl * dl) / 26.0 - pow(x + 3.9, 2.0) / 5.0) + exp(-(dr * dr) / 26.0 - pow(x - 3.9, 2.0) / 5.0);
          // 光照：半球光 + 主光 + 掠射反光
          vec3 V = normalize(cameraPosition - vP);
          float fres = pow(1.0 - max(V.y, 0.0), 4.0);
          vec3 lit = col * (uHemi * 0.55 + uKey * uKeyInt * 0.32) + uLamp * pool * 0.55 * col * 2.0;
          lit += uHaze * fres * 0.35;
          // 断轨边缘：琥珀警示 + 断口发光
          if (gapEdge < 2.2) {
            float stripes = step(0.5, fract((s + lx * 0.6) / 0.7));
            float warnZone = 1.0 - smoothstep(1.4, 2.2, gapEdge);
            lit = mix(lit, mix(vec3(0.02), uGlow * 1.2, stripes), warnZone * 0.85);
            glow += uGlow * (1.0 - smoothstep(0.0, 0.25, gapEdge)) * 3.0;
          }
          // 迎面来车警示：本车道红色箭头向玩家涌来
          float wv = li == 0 ? uWarn.x : li == 1 ? uWarn.y : uWarn.z;
          if (wv > 0.001) {
            float chev = step(0.55, fract((s + abs(lx) * 0.9) / 3.2 + uTime * 2.6));
            glow += vec3(1.0, 0.16, 0.1) * chev * inLane * (1.0 - sleeper * 0.5) * wv * 1.6;
            lit = mix(lit, lit * vec3(1.4, 0.55, 0.5), wv * inLane * 0.6);
          }
          vec3 c = lit + glow;
          float haze = smoothstep(55.0, 245.0, vFog) * uHazeAmt;
          c = mix(c, uHaze * 0.9, haze);
          gl_FragColor = vec4(c, 1.0);
        }`,
    }));
    this.deck.frustumCulled = false;
    scene.add(this.deck);

    // —— 钢轨、侧墙、纵梁（一个几何体，按 kind 着色） ——
    const gb = new GB();
    const segs = 150;
    for (let l = 0; l < 3; l++) for (const side of [-1, 1]) {
      gb.add(new THREE.BoxGeometry(0.085, 0.14, LEN, 1, 1, segs), { x: LANE_X[l] + side * 0.62, y: 0.07, z: (Z_NEAR + Z_FAR) / 2, color: new THREE.Color(l, 0, 0), glow: 0 });
    }
    for (const side of [-1, 1]) {
      gb.add(new THREE.BoxGeometry(0.34, 0.5, LEN, 1, 1, segs), { x: side * (DECK_HW - 0.17), y: 0.1, z: (Z_NEAR + Z_FAR) / 2, color: new THREE.Color(0, 0, 0), glow: 1 });
      gb.add(new THREE.BoxGeometry(0.5, 0.7, LEN, 1, 1, segs), { x: side * 3.1, y: -0.75, z: (Z_NEAR + Z_FAR) / 2, color: new THREE.Color(0, 0, 0), glow: 2 });
    }
    gb.add(new THREE.BoxGeometry(0.7, 0.5, LEN, 1, 1, segs), { x: 0, y: -2.6, z: (Z_NEAR + Z_FAR) / 2, color: new THREE.Color(0, 0, 0), glow: 2 });
    const rg = gb.build();
    this.rails = new THREE.Mesh(rg, new THREE.ShaderMaterial({
      uniforms: this.u,
      vertexShader: BEND_GLSL + /* glsl */`
        attribute float glow; attribute vec3 color;
        varying vec3 vP; varying vec3 vN; varying float vKind; varying float vLane; varying float vFog;
        void main() {
          vec4 w = modelMatrix * vec4(position, 1.0);
          vP = w.xyz; vN = normal; vKind = glow; vLane = color.r;
          vec4 mv = viewMatrix * vec4(bendWorld(w.xyz), 1.0);
          vFog = -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`
        uniform float uDist, uTime, uHazeAmt, uKeyInt;
        uniform vec3 uBase, uLine, uGlow, uHaze, uHemi, uKey, uRail, uWarn;
        uniform vec4 uGaps[${MAX_GAPS}];
        varying vec3 vP; varying vec3 vN; varying float vKind; varying float vLane; varying float vFog;
        void main() {
          float s = uDist - vP.z;
          vec3 c;
          if (vKind < 0.5) {
            int li = int(vLane + 0.5);
            for (int i = 0; i < ${MAX_GAPS}; i++) {
              vec4 gp = uGaps[i];
              if (gp.w < 0.5) continue;
              int m = int(gp.z + 0.5);
              if (((m >> li) & 1) == 1 && s > gp.x + 0.15 && s < gp.y - 0.15) discard;
            }
            float top = step(0.5, vN.y);
            vec3 V = normalize(cameraPosition - vP);
            float sheen = pow(1.0 - max(V.y, 0.0), 2.0);
            c = mix(uBase * 0.7, uRail * (0.16 + sheen * 0.32) + uKey * uKeyInt * 0.05, top);
            float wv = li == 0 ? uWarn.x : li == 1 ? uWarn.y : uWarn.z;
            c += vec3(1.0, 0.15, 0.08) * wv * top * (0.6 + 0.6 * sin(uTime * 18.0)) * 1.4;
            c *= 1.0 - smoothstep(90.0, 220.0, vFog) * 0.5;
          } else if (vKind < 1.5) {
            float inner = step(0.5, abs(vN.x)) * step(0.0, -vN.x * sign(vP.x));
            float strip = smoothstep(0.24, 0.3, vP.y) * (1.0 - smoothstep(0.3, 0.36, vP.y));
            c = uBase * (0.7 + 0.6 * max(vN.y, 0.0)) * (uHemi * 0.6 + 0.25);
            c += uGlow * strip * inner * 0.9;
            c += uGlow * step(0.5, vN.y) * 0.08;
          } else {
            c = uBase * 0.35 * (0.5 + 0.5 * max(vN.y, 0.0)) * (uHemi * 0.8 + 0.2);
            c += uLine * 0.08 * step(0.5, abs(vN.x));
          }
          float haze = smoothstep(55.0, 245.0, vFog) * uHazeAmt;
          gl_FragColor = vec4(mix(c, uHaze * 0.9, haze), 1.0);
        }`,
    }));
    this.rails.frustumCulled = false;
    scene.add(this.rails);

    // —— 桁架横撑与斜撑（每 6 米重复，整体随里程滚动） ——
    const tg = new GB();
    tg.box(6.6, 0.32, 0.32, { y: -0.75, color: 0x404a5e });
    tg.box(0.24, 2.4, 0.24, { x: -1.6, y: -1.7, rz: 0.62, color: 0x353d4e });
    tg.box(0.24, 2.4, 0.24, { x: 1.6, y: -1.7, rz: -0.62, color: 0x353d4e });
    tg.box(0.22, 3.2, 0.22, { x: 0, y: -1.7, rx: 0.9, z: -1.5, color: 0x2c3342 });
    tg.box(0.5, 0.12, 0.5, { x: -3.1, y: -1.15, color: 0xffb547, glow: 1 });
    tg.box(0.5, 0.12, 0.5, { x: 3.1, y: -1.15, color: 0xffb547, glow: 1 });
    const tgeo = tg.build();
    const tmat = bend(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.4 }));
    this.truss = new THREE.InstancedMesh(tgeo, tmat, 52);
    const m = new THREE.Matrix4();
    for (let i = 0; i < 52; i++) { m.makeTranslation(0, 0, Z_NEAR - 4 - i * 6); this.truss.setMatrixAt(i, m); }
    this.truss.frustumCulled = false;
    this.trussGroup = new THREE.Group();
    this.trussGroup.add(this.truss);
    scene.add(this.trussGroup);

    // —— 路灯（左每 30 米、右错开 15 米） ——
    const lp = new GB();
    lp.box(0.16, 4.6, 0.16, { y: 2.3, color: 0x2a3140 });
    lp.box(0.12, 0.12, 1.5, { y: 4.55, z: 0, x: 0.6, ry: Math.PI / 2, color: 0x2a3140 });
    lp.box(0.5, 0.2, 0.3, { y: 4.45, x: 1.3, color: 0x1c212c });
    lp.box(0.42, 0.5, 0.42, { y: 0.25, color: 0x3a4252 });
    const lpGeo = lp.build();
    const lh = new GB();
    lh.box(0.42, 0.06, 0.24, { y: 4.33, x: 1.3, color: 0xffffff });
    lh.sphere(0.07, 8, 6, { y: 4.62, color: 0xffffff });
    const lhGeo = lh.build();
    const lpMat = bend(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.5 }));
    this.lampMat = bend(new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, color: new THREE.Color(3, 3, 3) }));
    const NL = 22;
    this.posts = new THREE.InstancedMesh(lpGeo, lpMat, NL);
    this.heads = new THREE.InstancedMesh(lhGeo, this.lampMat, NL);
    const q = new THREE.Quaternion(), sc = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
    for (let i = 0; i < NL; i++) {
      const left = i % 2 === 0;
      const k = Math.floor(i / 2);
      p.set(left ? -(DECK_HW + 0.35) : DECK_HW + 0.35, 0, left ? 30 - k * 30 : 15 - k * 30);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), left ? 0 : Math.PI);
      m.compose(p, q, sc);
      this.posts.setMatrixAt(i, m); this.heads.setMatrixAt(i, m);
    }
    this.posts.frustumCulled = this.heads.frustumCulled = false;
    this.lampGroup = new THREE.Group();
    this.lampGroup.add(this.posts, this.heads);
    scene.add(this.lampGroup);
  }

  update(dist, time, gapFeats, warn, pulse) {
    this.u.uDist.value = dist;
    this.u.uTime.value = time;
    this.u.uPulse.value = pulse;
    this.u.uHazeAmt.value = MIX.hazeAmt;
    this.u.uKeyInt.value = MIX.keyInt / 2.4;
    this.u.uWarn.value.set(warn[0], warn[1], warn[2]);
    let n = 0;
    for (const f of gapFeats) {
      if (n >= MAX_GAPS) break;
      this.gaps[n++].set(f.s0, f.s1, f.mask, 1);
    }
    for (; n < MAX_GAPS; n++) this.gaps[n].w = 0;
    this.trussGroup.position.z = dist % 6;
    this.lampGroup.position.z = (dist + 21) % 30; // 路灯位于 s ≡ 9（左）/ 24（右）(mod 30)
    this.lampMat.color.copy(MIX.lamp).multiplyScalar(1.7);
  }
}
