// 着色器与材质工厂
import * as THREE from 'three';

export const SNOISE = /* glsl */`
vec3 mod289(vec3 x){return x-floor(x*(1./289.))*289.;}
vec4 mod289(vec4 x){return x-floor(x*(1./289.))*289.;}
vec4 permute(vec4 x){return mod289(((x*34.)+1.)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1./6.,1./3.); const vec4 D=vec4(0.,.5,1.,2.);
  vec3 i=floor(v+dot(v,C.yyy)); vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz); vec3 l=1.-g; vec3 i1=min(g.xyz,l.zxy); vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx; vec3 x2=x0-i2+C.yyy; vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.,i1.z,i2.z,1.))+i.y+vec4(0.,i1.y,i2.y,1.))+i.x+vec4(0.,i1.x,i2.x,1.));
  float n_=0.142857142857; vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.*floor(p*ns.z*ns.z);
  vec4 x_=floor(j*ns.z); vec4 y_=floor(j-7.*x_);
  vec4 x=x_*ns.x+ns.yyyy; vec4 y=y_*ns.x+ns.yyyy; vec4 h=1.-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy); vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.+1.; vec4 s1=floor(b1)*2.+1.; vec4 sh=-step(h,vec4(0.));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy; vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x); vec3 p1=vec3(a0.zw,h.y); vec3 p2=vec3(a1.xy,h.z); vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
  vec4 m=max(.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.); m=m*m;
  return 42.*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}`;

export const shared = {
  time: { value: 0 },
  pr: { value: 1 },
  scale: { value: 400 },
};

// —— 太阳表面 ——
export function sunMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: shared.time },
    vertexShader: /* glsl */`
      varying vec3 vPos; varying vec3 vN; varying vec3 vW;
      void main(){
        vPos = position;
        vN = normalize(mat3(modelMatrix) * normal);
        vec4 w = modelMatrix * vec4(position,1.);
        vW = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */`
      uniform float uTime;
      varying vec3 vPos; varying vec3 vN; varying vec3 vW;
      ${SNOISE}
      void main(){
        vec3 p = normalize(vPos);
        float n = 0.; float a = .5; vec3 q = p*2.6;
        for(int i=0;i<5;i++){
          n += a*snoise(q + vec3(0., uTime*0.04*(float(i)+1.), uTime*0.025));
          q *= 2.13; a *= .5;
        }
        float cells = snoise(p*34. + vec3(uTime*0.12))*.5+.5;
        float spots = smoothstep(0.72, 0.86, snoise(p*3.2 + vec3(7.0, uTime*0.006, 0.)));
        vec3 V = normalize(cameraPosition - vW);
        float mu = max(dot(normalize(vN), V), 0.);
        float t = clamp(0.5 + n*0.75 + (cells-.5)*0.45, 0., 1.);
        vec3 col = mix(vec3(0.9,0.2,0.02), vec3(1.0,0.52,0.1), t);
        col = mix(col, vec3(1.0,0.82,0.45), smoothstep(0.7, 1.0, t));
        col *= 1. - spots*0.75;
        col *= mix(0.35, 1.0, pow(mu, 0.6)) * 1.05;
        col += vec3(1.0,0.35,0.05) * pow(1.-mu, 2.5) * 0.7;
        gl_FragColor = vec4(col, 1.);
      }`,
  });
}

// —— 太阳日冕（始终朝向镜头的广告牌） ——
export function coronaMaterial(core = 0.14, tint = [1.0, 0.5, 0.12]) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: shared.time, uCore: { value: core }, uTint: { value: new THREE.Vector3(...tint) }, uOpacity: { value: 1 } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: /* glsl */`
      varying vec2 vUv; uniform float uTime; uniform float uCore; uniform vec3 uTint; uniform float uOpacity;
      ${SNOISE}
      void main(){
        vec2 c = vUv - .5; float r = length(c)*2.; float ang = atan(c.y, c.x);
        float d = max(r - uCore, 0.);
        float rays = snoise(vec3(cos(ang)*2.5, sin(ang)*2.5, uTime*0.12 - d*2.0))*.5+.5;
        float rays2 = snoise(vec3(cos(ang)*7., sin(ang)*7., uTime*0.2 - d*4.0))*.5+.5;
        rays = pow(rays, 3.0)*0.9 + pow(rays2, 4.0)*0.4;
        float glow = exp(-d*10.)*0.9 + exp(-d*3.0)*0.22 + exp(-d*1.2)*0.05;
        float a = (glow + rays*exp(-d*3.2)) * (1.0 - smoothstep(0.55, 1.0, r));
        vec3 col = mix(uTint, vec3(1.0,0.9,0.7), exp(-d*5.));
        gl_FragColor = vec4(col*a*uOpacity, 1.);
      }`,
  });
}

// —— 大气辉光（菲涅尔） ——
export function atmosphereMaterial(color, intensity = 1.2, power = 3.0) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uInt: { value: intensity }, uPow: { value: power } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.FrontSide,
    vertexShader: `varying vec3 vN; varying vec3 vW;
      void main(){ vN = normalize(mat3(modelMatrix)*normal); vec4 w = modelMatrix*vec4(position,1.); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`,
    fragmentShader: `uniform vec3 uColor; uniform float uInt; uniform float uPow; varying vec3 vN; varying vec3 vW;
      void main(){
        vec3 V = normalize(cameraPosition - vW); vec3 N = normalize(vN);
        float fr = pow(1. - max(dot(N, V), 0.), uPow);
        vec3 L = normalize(-vW); // 太阳在原点
        float lit = smoothstep(-0.35, 0.5, dot(N, L));
        gl_FragColor = vec4(uColor * fr * uInt * (0.08 + lit), 1.);
      }`,
  });
}

// —— 星点（屏幕像素大小，带闪烁） ——
export function starMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: shared.time, uPR: shared.pr, uOpacity: { value: 1 } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `attribute float aSize; attribute vec3 aColor; attribute float aPhase;
      uniform float uTime; uniform float uPR; varying vec3 vC; varying float vT;
      void main(){
        vec4 mv = modelViewMatrix*vec4(position,1.);
        gl_Position = projectionMatrix*mv;
        float tw = 0.6 + 0.4*sin(uTime*(0.6 + aPhase*2.2) + aPhase*61.);
        vT = tw;
        gl_PointSize = aSize * uPR * (0.75 + 0.45*tw);
        vC = aColor;
      }`,
    fragmentShader: `varying vec3 vC; varying float vT; uniform float uOpacity;
      void main(){
        vec2 c = gl_PointCoord - .5; float d = length(c);
        float a = 1.0 - smoothstep(.0, .5, d); a = a*a*a + (1.0 - smoothstep(.0, .12, d))*0.6;
        if (a < 0.003) discard;
        gl_FragColor = vec4(vC * a * (0.55 + 0.45*vT) * uOpacity, 1.);
      }`,
  });
}

// —— 世界空间粒子（随距离缩放，用于星系、星云、小行星带） ——
export function dustMaterial(opts = {}) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uPR: shared.pr, uScale: shared.scale, uTime: shared.time,
      uOpacity: { value: opts.opacity ?? 1 }, uMax: { value: opts.max ?? 48 },
      uSoft: { value: opts.soft ?? 1.0 }, uSpin: { value: opts.spin ?? 0 },
    },
    transparent: true, depthWrite: false, blending: opts.blending ?? THREE.AdditiveBlending,
    vertexShader: `attribute float aSize; attribute vec3 aColor;
      uniform float uPR; uniform float uScale; uniform float uMax; uniform float uTime; uniform float uSpin;
      varying vec3 vC;
      void main(){
        vec3 p = position;
        if (uSpin != 0.) {
          float r = length(p.xz);
          float a = uTime * uSpin / max(sqrt(r), 1.0);
          float c = cos(a), s = sin(a);
          p.xz = mat2(c, -s, s, c) * p.xz;
        }
        vec4 mv = modelViewMatrix*vec4(p,1.);
        gl_Position = projectionMatrix*mv;
        gl_PointSize = clamp(aSize * uPR * uScale / -mv.z, 0.0, uMax * uPR);
        vC = aColor;
      }`,
    fragmentShader: `varying vec3 vC; uniform float uOpacity; uniform float uSoft;
      void main(){
        vec2 c = gl_PointCoord - .5; float d = length(c)*2.;
        float a = pow(max(1. - d, 0.), 1.0 + uSoft*1.5);
        if (a < 0.003) discard;
        gl_FragColor = vec4(vC * a * uOpacity, 1.);
      }`,
  });
}

// —— 吸积盘 ——
export function diskMaterial(inner, outer) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: shared.time, uIn: { value: inner }, uOut: { value: outer }, uOpacity: { value: 1 } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: /* glsl */`
      varying vec3 vP; uniform float uTime; uniform float uIn; uniform float uOut; uniform float uOpacity;
      ${SNOISE}
      void main(){
        float r = length(vP.xy); float t = (r - uIn)/(uOut - uIn);
        float ang = atan(vP.y, vP.x);
        float swirl = ang + uTime*1.6/(0.3 + t*2.0) ;
        float n = snoise(vec3(cos(swirl)*2.0, sin(swirl)*2.0, t*6.0)) * .5 + .5;
        float n2 = snoise(vec3(cos(swirl)*6.0, sin(swirl)*6.0, t*18.0 - uTime*0.3)) * .5 + .5;
        float band = pow(n, 1.5)*0.7 + n2*0.5;
        float fall = smoothstep(0.0, 0.06, t) * pow(1.0 - clamp(t,0.,1.), 1.6);
        float doppler = 0.55 + 0.45*cos(ang - 0.6);
        vec3 hot = vec3(1.0, 0.95, 0.85), warm = vec3(1.0, 0.55, 0.15), cool = vec3(0.7, 0.15, 0.05);
        vec3 col = mix(hot, warm, smoothstep(0.0, 0.35, t));
        col = mix(col, cool, smoothstep(0.35, 1.0, t));
        float a = fall * band * doppler * 2.6;
        gl_FragColor = vec4(col * a * uOpacity, 1.);
      }`,
  });
}

// —— 光子环（朝向镜头） ——
export function photonRingMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: shared.time, uOpacity: { value: 1 } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: `varying vec2 vUv; uniform float uTime; uniform float uOpacity;
      void main(){
        vec2 c = vUv - .5; float r = length(c)*2.; float ang = atan(c.y, c.x);
        float ring = exp(-pow((r - 0.36)/0.018, 2.)) * 1.8 + exp(-pow((r - 0.38)/0.07, 2.)) * 0.5;
        float halo = exp(-max(r-0.36,0.)*7.) * 0.25 * step(0.33, r);
        float bright = 0.6 + 0.4*cos(ang + 1.0);
        vec3 col = mix(vec3(1.0, 0.5, 0.15), vec3(1.0, 0.85, 0.6), ring*0.4);
        gl_FragColor = vec4(col * (ring*bright + halo) * uOpacity * (1.0 - smoothstep(.7, 1., r)), 1.);
      }`,
  });
}

// —— 流星 ——
export function meteorMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uOpacity: { value: 0 } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: `varying vec2 vUv; uniform float uOpacity;
      void main(){
        float along = vUv.x; float across = abs(vUv.y - .5)*2.;
        float a = pow(along, 3.0) * pow(max(1. - across, 0.), 2.5);
        a += smoothstep(0.985, 1.0, along) * (1.-across) * 2.0;
        gl_FragColor = vec4(vec3(0.75, 0.85, 1.0) * a * 2.2 * uOpacity, 1.);
      }`,
  });
}

// 土星环（带简单光照：被行星阴影遮挡的部分变暗）
export function ringMaterial(tex, planetRadius) {
  return new THREE.ShaderMaterial({
    uniforms: { uTex: { value: tex }, uIn: { value: 0 }, uOut: { value: 1 }, uR: { value: planetRadius }, uOpacity: { value: 1 } },
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: `varying vec3 vP; varying vec3 vW; varying vec3 vC;
      void main(){ vP = position; vec4 w = modelMatrix*vec4(position,1.); vW = w.xyz; vC = (modelMatrix*vec4(0.,0.,0.,1.)).xyz;
        gl_Position = projectionMatrix*viewMatrix*w; }`,
    fragmentShader: `uniform sampler2D uTex; uniform float uIn; uniform float uOut; uniform float uR; uniform float uOpacity;
      varying vec3 vP; varying vec3 vW; varying vec3 vC;
      void main(){
        float r = length(vP.xy); float t = (r - uIn)/(uOut - uIn);
        if (t < 0. || t > 1.) discard;
        vec4 tx = texture2D(uTex, vec2(t, .5));
        // 行星投下的阴影：判断从此点指向太阳（原点）的射线是否穿过行星
        vec3 L = normalize(-vW); vec3 oc = vW - vC;
        float b = dot(oc, L); float c = dot(oc, oc) - uR*uR;
        float shadow = (b < 0. && b*b - c > 0.) ? 0.15 : 1.0;
        gl_FragColor = vec4(tx.rgb * 1.15 * shadow, tx.a * uOpacity);
      }`,
  });
}
