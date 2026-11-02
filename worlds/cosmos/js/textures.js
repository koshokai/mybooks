// 程序化纹理：全部在本地用 Canvas 生成，不依赖任何网络图片
import * as THREE from 'three';

// ---------- 3D 梯度噪声（Perlin 改进版） ----------
function makeNoise(seed = 1) {
  const p = new Uint8Array(512);
  const perm = new Uint8Array(256);
  for (let i = 0; i < 256; i++) perm[i] = i;
  let s = seed * 9301 + 49297;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const t = perm[i]; perm[i] = perm[j]; perm[j] = t;
  }
  for (let i = 0; i < 512; i++) p[i] = perm[i & 255];
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  const lerp = (a, b, t) => a + t * (b - a);
  const grad = (h, x, y, z) => {
    const hh = h & 15;
    const u = hh < 8 ? x : y;
    const v = hh < 4 ? y : hh === 12 || hh === 14 ? x : z;
    return ((hh & 1) ? -u : u) + ((hh & 2) ? -v : v);
  };
  return function noise(x, y, z) {
    const X = Math.floor(x) & 255, Y = Math.floor(y) & 255, Z = Math.floor(z) & 255;
    x -= Math.floor(x); y -= Math.floor(y); z -= Math.floor(z);
    const u = fade(x), v = fade(y), w = fade(z);
    const A = p[X] + Y, AA = p[A] + Z, AB = p[A + 1] + Z;
    const B = p[X + 1] + Y, BA = p[B] + Z, BB = p[B + 1] + Z;
    return lerp(
      lerp(lerp(grad(p[AA], x, y, z), grad(p[BA], x - 1, y, z), u),
        lerp(grad(p[AB], x, y - 1, z), grad(p[BB], x - 1, y - 1, z), u), v),
      lerp(lerp(grad(p[AA + 1], x, y, z - 1), grad(p[BA + 1], x - 1, y, z - 1), u),
        lerp(grad(p[AB + 1], x, y - 1, z - 1), grad(p[BB + 1], x - 1, y - 1, z - 1), u), v),
      w);
  };
}

function fbmFactory(noise) {
  return (x, y, z, oct = 5, lac = 2.0, gain = 0.5) => {
    let a = 0.5, f = 1, sum = 0, norm = 0;
    for (let i = 0; i < oct; i++) {
      sum += a * noise(x * f, y * f, z * f);
      norm += a; a *= gain; f *= lac;
    }
    return sum / norm; // 约 -0.7..0.7
  };
}

const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const mix = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
function hex(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function mixc(c1, c2, t) { return [mix(c1[0], c2[0], t), mix(c1[1], c2[1], t), mix(c1[2], c2[2], t)]; }
function ramp(stops, t) {
  t = clamp(t);
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i][0]) {
      const [t0, c0] = stops[i - 1], [t1, c1] = stops[i];
      return mixc(c0, c1, (t - t0) / (t1 - t0 || 1));
    }
  }
  return stops[stops.length - 1][1];
}

// 遍历等距柱状投影的每个像素，回调给出球面方向
function paint(w, h, fn) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) {
    const lat = (0.5 - (y + 0.5) / h) * Math.PI;
    const cl = Math.cos(lat), sl = Math.sin(lat);
    for (let x = 0; x < w; x++) {
      const lon = ((x + 0.5) / w) * Math.PI * 2;
      const nx = cl * Math.cos(lon), ny = sl, nz = cl * Math.sin(lon);
      const col = fn(nx, ny, nz, lat, lon);
      const i = (y * w + x) * 4;
      d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = col[3] === undefined ? 255 : col[3];
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

// 陨石坑：返回一个在球面上计算坑洼高度的函数
function craterField(count, seed, minR, maxR) {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const cs = [];
  for (let i = 0; i < count; i++) {
    const u = rnd() * 2 - 1, th = rnd() * Math.PI * 2, r = Math.sqrt(1 - u * u);
    const rad = minR + Math.pow(rnd(), 3) * (maxR - minR);
    cs.push([r * Math.cos(th), u, r * Math.sin(th), rad, Math.cos(rad * 1.6)]);
  }
  return (x, y, z) => {
    let hgt = 0;
    for (let i = 0; i < cs.length; i++) {
      const c = cs[i];
      const dt = x * c[0] + y * c[1] + z * c[2];
      if (dt < c[4]) continue;
      const ang = Math.acos(Math.min(1, dt)) / c[3];
      if (ang < 1) hgt -= (1 - ang * ang) * 0.6;
      else if (ang < 1.6) hgt += Math.sin((ang - 1) / 0.6 * Math.PI) * 0.35;
    }
    return hgt;
  };
}

const n1 = makeNoise(7), n2 = makeNoise(13), n3 = makeNoise(29);
const fbm1 = fbmFactory(n1), fbm2 = fbmFactory(n2), fbm3 = fbmFactory(n3);

const GEN = {
  mercury(w, h) {
    const cr = craterField(260, 11, 0.02, 0.16);
    const c1 = hex('#4a4440'), c2 = hex('#8f877e'), c3 = hex('#c4bbb0');
    return paint(w, h, (x, y, z) => {
      const n = fbm1(x * 3, y * 3, z * 3, 6) + cr(x, y, z) * 0.5;
      const t = clamp(0.5 + n * 0.9);
      return ramp([[0, c1], [0.5, c2], [1, c3]], t);
    });
  },
  venus(w, h) {
    const st = [[0, hex('#8a5a2b')], [0.35, hex('#c9944f')], [0.65, hex('#e9cc8c')], [1, hex('#fbefcf')]];
    return paint(w, h, (x, y, z) => {
      const q = fbm2(x * 2, y * 2, z * 2, 4);
      const n = fbm1(x * 1.5 + q * 2, y * 5 + q * 1.5, z * 1.5 + q * 2, 6);
      return ramp(st, 0.5 + n * 1.1);
    });
  },
  earth(w, h) {
    const deep = hex('#04153a'), mid = hex('#0a3a7a'), shallow = hex('#1f7fb3');
    const sand = hex('#c9b27a'), green = hex('#2f6b2a'), dgreen = hex('#1d4a22'),
      desert = hex('#b8935a'), mount = hex('#7a6a58'), ice = hex('#eef4fa'), tundra = hex('#6d7a5e');
    return paint(w, h, (x, y, z, lat) => {
      const warp = fbm3(x * 1.2, y * 1.2, z * 1.2, 3) * 0.6;
      const e = fbm1(x * 1.6 + warp, y * 1.6 + warp, z * 1.6, 7) + 0.03;
      const alat = Math.abs(lat) / (Math.PI / 2);
      if (alat > 0.86 + fbm2(x * 4, y * 4, z * 4, 3) * 0.12) return ice;
      if (e < 0) {
        const t = clamp(-e / 0.35);
        return t < 0.15 ? mixc(shallow, mid, t / 0.15) : mixc(mid, deep, clamp((t - 0.15) / 0.85));
      }
      const m = fbm2(x * 3, y * 3, z * 3, 5); // 湿度
      const dry = clamp(0.5 + m * 1.5 - Math.abs(alat - 0.28) * 1.2 + (alat < 0.15 ? -0.5 : 0));
      let c = e < 0.02 ? sand : mixc(mixc(green, dgreen, clamp(m * 2 + 0.5)), desert, smooth(0.45, 0.7, dry));
      if (alat > 0.62) c = mixc(c, tundra, smooth(0.62, 0.78, alat));
      c = mixc(c, mount, smooth(0.16, 0.3, e));
      if (e > 0.3) c = mixc(c, ice, smooth(0.3, 0.38, e));
      return c;
    });
  },
  earthClouds(w, h) {
    return paint(w, h, (x, y, z, lat) => {
      const q = fbm3(x * 2, y * 2, z * 2, 3);
      const n = fbm2(x * 2.5 + q, y * 5 + q * 2, z * 2.5 + q, 6);
      const band = Math.cos(lat * 3.2) * 0.08;
      const a = smooth(0.02, 0.32, n + band);
      return [255, 255, 255, a * 235];
    });
  },
  moon(w, h) {
    const cr = craterField(320, 5, 0.015, 0.14);
    const dark = hex('#3a3a3c'), mid = hex('#8a8783'), lite = hex('#c9c5bd');
    return paint(w, h, (x, y, z) => {
      const maria = smooth(0.05, 0.18, fbm2(x * 1.4, y * 1.4, z * 1.4, 4) + (x > 0.2 ? 0.08 : -0.1));
      const n = fbm1(x * 5, y * 5, z * 5, 5) * 0.5 + cr(x, y, z) * 0.6;
      const base = mixc(mid, dark, maria * 0.85);
      return mixc(base, lite, clamp(0.45 + n));
    });
  },
  mars(w, h) {
    const cr = craterField(120, 23, 0.02, 0.1);
    const st = [[0, hex('#3d1a10')], [0.35, hex('#7a3219')], [0.6, hex('#b5532a')], [0.85, hex('#d98a55')], [1, hex('#e9b48a')]];
    const ice = hex('#f3ece6');
    return paint(w, h, (x, y, z, lat) => {
      const n = fbm1(x * 2.2, y * 2.2, z * 2.2, 7) + cr(x, y, z) * 0.25;
      const dark = fbm3(x * 1.3, y * 1.3, z * 1.3, 4);
      let c = ramp(st, 0.58 + n * 1.0 - smooth(0.05, 0.25, dark) * 0.3);
      const alat = Math.abs(lat) / (Math.PI / 2);
      c = mixc(c, ice, smooth(0.86, 0.92, alat + n * 0.1));
      return c;
    });
  },
  jupiter(w, h) {
    const st = [[0, hex('#6b4a33')], [0.2, hex('#a7714a')], [0.38, hex('#d9b48a')], [0.55, hex('#f2e4cb')],
      [0.7, hex('#c7926a')], [0.85, hex('#e8d2b0')], [1, hex('#8c5e3e')]];
    // 大红斑位置
    const sLat = -22 * Math.PI / 180, sLon = 1.2;
    const sx = Math.cos(sLat) * Math.cos(sLon), sy = Math.sin(sLat), sz = Math.cos(sLat) * Math.sin(sLon);
    return paint(w, h, (x, y, z, lat, lon) => {
      const turb = fbm1(x * 3, y * 9, z * 3, 5) * 0.12 + fbm2(x * 8, y * 20, z * 8, 3) * 0.03;
      const v = y + turb;
      const band = Math.sin(v * 14.0) * 0.5 + Math.sin(v * 23.0 + 1.3) * 0.25 + Math.sin(v * 41.0) * 0.1;
      let c = ramp(st, 0.5 + band * 0.45);
      // 大红斑：椭圆 + 旋涡
      let dlon = lon - sLon; dlon = Math.atan2(Math.sin(dlon), Math.cos(dlon));
      const ex = dlon / 0.26, ey = (lat - sLat) / 0.11;
      const r = Math.sqrt(ex * ex + ey * ey);
      if (r < 1.5) {
        const sw = fbm3(ex * 2 + r, ey * 2, r * 3, 3) * 0.3;
        const k = smooth(1.3, 0.6, r + sw);
        c = mixc(c, mixc(hex('#b5462a'), hex('#e58a5c'), clamp(0.5 + sw * 2 - r * 0.3)), k);
        if (r > 0.9 && r < 1.3) c = mixc(c, hex('#f5e7d0'), (1 - Math.abs(r - 1.1) / 0.2) * 0.35);
      }
      void sx; void sy; void sz;
      return c;
    });
  },
  saturn(w, h) {
    const st = [[0, hex('#8a7048')], [0.3, hex('#c9a96e')], [0.55, hex('#e8d4a2')], [0.75, hex('#f3e6c3')], [1, hex('#b8975e')]];
    return paint(w, h, (x, y, z) => {
      const turb = fbm1(x * 3, y * 10, z * 3, 4) * 0.05;
      const v = y + turb;
      const band = Math.sin(v * 18.0) * 0.4 + Math.sin(v * 31.0 + 0.7) * 0.2 + Math.sin(v * 7.0) * 0.3;
      return ramp(st, 0.55 + band * 0.4);
    });
  },
  uranus(w, h) {
    const a = hex('#9fe0e4'), b = hex('#bff0ef'), c = hex('#7cc8d4');
    return paint(w, h, (x, y, z) => {
      const v = y + fbm1(x * 2, y * 6, z * 2, 3) * 0.03;
      const band = Math.sin(v * 12.0) * 0.5;
      return mixc(mixc(a, b, 0.5 + band * 0.4), c, smooth(0.6, 0.95, Math.abs(y)) * 0.6);
    });
  },
  neptune(w, h) {
    const st = [[0, hex('#0f1f7a')], [0.4, hex('#2a49c8')], [0.7, hex('#4f78ee')], [1, hex('#9db8ff')]];
    const sLat = -20 * Math.PI / 180, sLon = 2.4;
    return paint(w, h, (x, y, z, lat, lon) => {
      const turb = fbm1(x * 3, y * 8, z * 3, 5) * 0.08;
      const v = y + turb;
      const band = Math.sin(v * 10.0) * 0.4 + Math.sin(v * 27.0) * 0.15;
      let c = ramp(st, 0.5 + band * 0.5);
      let dlon = lon - sLon; dlon = Math.atan2(Math.sin(dlon), Math.cos(dlon));
      const r = Math.sqrt((dlon / 0.22) ** 2 + ((lat - sLat) / 0.1) ** 2);
      c = mixc(c, hex('#0a1250'), smooth(1.1, 0.5, r) * 0.8);
      // 亮白云带
      const wisp = smooth(0.25, 0.4, fbm2(x * 4, y * 14, z * 4, 4)) * smooth(0.12, 0.0, Math.abs(lat + 0.6));
      c = mixc(c, hex('#e8f0ff'), wisp * 0.7);
      return c;
    });
  },
};

const cache = {};
export function planetCanvas(id, size = 512) {
  const key = id + size;
  if (!cache[key]) cache[key] = GEN[id](size, size / 2);
  return cache[key];
}

export function canvasTexture(canvas) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

// 土星环：径向条带（含卡西尼缝）
export function ringCanvas(kind = 'saturn') {
  const w = 1024, c = document.createElement('canvas');
  c.width = w; c.height = 4;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, 4);
  for (let x = 0; x < w; x++) {
    const t = x / (w - 1);
    let a, col;
    if (kind === 'saturn') {
      const fine = 0.75 + 0.25 * Math.sin(t * 380) * Math.sin(t * 97 + 1) + n1(t * 60, 0.5, 0.5) * 0.5;
      a = 0;
      if (t < 0.14) a = 0.12 * (t / 0.14);              // C 环（暗淡）
      else if (t < 0.24) a = 0.22;
      else if (t < 0.58) a = 0.85 + 0.1 * Math.sin(t * 60);   // B 环（最亮）
      else if (t < 0.64) a = 0.04;                       // 卡西尼缝
      else if (t < 0.9) a = 0.6;                         // A 环
      else if (t < 0.915) a = 0.08;                      // 恩克缝
      else if (t < 0.97) a = 0.5;
      else a = 0.5 * (1 - (t - 0.97) / 0.03);
      a *= clamp(fine);
      col = mixc(hex('#7d6a52'), hex('#efe0c0'), clamp(0.3 + t * 0.9 + n1(t * 30, 2, 2)));
    } else {
      a = 0; col = [200, 220, 230];
      for (const r of [0.15, 0.3, 0.45, 0.6, 0.95]) a += Math.exp(-(((t - r) / 0.008) ** 2)) * 0.5;
    }
    for (let y = 0; y < 4; y++) {
      const i = (y * w + x) * 4;
      img.data[i] = col[0]; img.data[i + 1] = col[1]; img.data[i + 2] = col[2]; img.data[i + 3] = clamp(a) * 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

// 柔和的径向光斑贴图
export function glowTexture(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)', size = 128, mid = 0.25) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gr.addColorStop(0, inner);
  gr.addColorStop(mid, inner.replace(/[\d.]+\)$/, '0.35)'));
  gr.addColorStop(1, outer);
  g.fillStyle = gr;
  g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// 星云贴图：带噪声的彩色云团
export function nebulaTexture(c1, c2, seed = 1, size = 256) {
  const nz = fbmFactory(makeNoise(seed));
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(size, size);
  const A = hex(c1), B = hex(c2);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size - 0.5, v = y / size - 0.5;
      const r = Math.sqrt(u * u + v * v) * 2;
      const n = nz(u * 3 + 10, v * 3 + 10, seed * 0.37, 6);
      const n2v = nz(u * 6 + 3, v * 6 + 3, seed * 0.11 + 5, 4);
      const fall = clamp(1 - r);
      const a = clamp((n * 1.6 + 0.35) * fall * fall * 1.4);
      const c = mixc(A, B, clamp(0.5 + n2v * 1.5));
      const i = (y * size + x) * 4;
      img.data[i] = c[0]; img.data[i + 1] = c[1]; img.data[i + 2] = c[2]; img.data[i + 3] = a * 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// 卡片头像：把等距柱状纹理投影成一个带光照的小球
export function portrait(src, size = 120, opts = {}) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const sctx = src.getContext('2d');
  const sw = src.width, sh = src.height;
  const sd = sctx.getImageData(0, 0, sw, sh).data;
  const img = ctx.createImageData(size, size);
  const L = [-0.55, 0.35, 0.76];
  const R = size * 0.46;
  const rot = opts.rot || 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const px = (x - size / 2) / R, py = -(y - size / 2) / R;
      const r2 = px * px + py * py;
      const i = (y * size + x) * 4;
      if (r2 > 1) continue;
      const pz = Math.sqrt(1 - r2);
      const lat = Math.asin(py);
      let lon = Math.atan2(pz, px) + rot;
      lon = ((lon % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      const sx = Math.min(sw - 1, Math.floor(lon / (Math.PI * 2) * sw));
      const sy = Math.min(sh - 1, Math.floor((0.5 - lat / Math.PI) * sh));
      const si = (sy * sw + sx) * 4;
      const lam = Math.max(0, px * L[0] + py * L[1] + pz * L[2]);
      const shade = 0.12 + 1.05 * Math.pow(lam, 0.8);
      const rim = Math.pow(1 - pz, 3) * 0.6;
      const edge = clamp((1 - Math.sqrt(r2)) * R * 0.9);
      img.data[i] = clamp(sd[si] / 255 * shade + rim * 0.3) * 255;
      img.data[i + 1] = clamp(sd[si + 1] / 255 * shade + rim * 0.4) * 255;
      img.data[i + 2] = clamp(sd[si + 2] / 255 * shade + rim * 0.6) * 255;
      img.data[i + 3] = edge * 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

export const GEN_IDS = Object.keys(GEN);
