/* =========================================================
   影 · 暗域 —— 空间站生成、射线、碰撞与寻路
   每局由种子生成：网格化舱室 + 走廊 + 自动门 + 储物柜 + 通风管 + 道具 + 灯光
   ========================================================= */
(function () {
  'use strict';
  const U = window.Umbra;
  const T = (U.T = { VOID: 0, FLOOR: 1, CORR: 2, WALL: 3, DOOR: 4 });

  const ROOM_TYPES = [
    { key: 'cargo', name: '货舱', w: 3 },
    { key: 'quarters', name: '宿舍', w: 3 },
    { key: 'control', name: '控制室', w: 2.2 },
    { key: 'medbay', name: '医疗舱', w: 2 },
    { key: 'engine', name: '机房', w: 2.2 },
    { key: 'hydro', name: '水培室', w: 2 },
    { key: 'obs', name: '观景台', w: 1.6 },
    { key: 'storage', name: '储藏室', w: 2 },
  ];
  U.ROOM_NAMES = { start: '维修间', podbay: '逃生舱坞', hub: '' };
  ROOM_TYPES.forEach(t => (U.ROOM_NAMES[t.key] = t.name));

  /* ---------------- 二叉堆（A*） ---------------- */
  function Heap(cap) {
    this.k = new Float32Array(cap);
    this.v = new Int32Array(cap);
    this.n = 0;
  }
  Heap.prototype.push = function (v, k) {
    let i = this.n++;
    const K = this.k, V = this.v;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (K[p] <= k) break;
      K[i] = K[p]; V[i] = V[p]; i = p;
    }
    K[i] = k; V[i] = v;
  };
  Heap.prototype.pop = function () {
    const K = this.k, V = this.v;
    const top = V[0];
    const n = --this.n;
    if (n > 0) {
      const k = K[n], v = V[n];
      let i = 0;
      for (;;) {
        let c = i * 2 + 1;
        if (c >= n) break;
        if (c + 1 < n && K[c + 1] < K[c]) c++;
        if (K[c] >= k) break;
        K[i] = K[c]; V[i] = V[c]; i = c;
      }
      K[i] = k; V[i] = v;
    }
    return top;
  };

  /* ---------------- 地图对象 ---------------- */
  function StationMap() {}
  const P = StationMap.prototype;

  P.I = function (x, y) { return y * this.W + x; };
  P.inb = function (x, y) { return x >= 0 && y >= 0 && x < this.W && y < this.H; };
  P.solid = function (tx, ty) {
    if (tx < 0 || ty < 0 || tx >= this.W || ty >= this.H) return true;
    return this.coll[ty * this.W + tx] !== 0;
  };
  P.wsolid = function (x, y) {
    const tx = Math.floor(x), ty = Math.floor(y);
    if (tx < 0 || ty < 0 || tx >= this.W || ty >= this.H) return true;
    return this.walkBase[ty * this.W + tx] === 0;
  };
  P.isFloorTile = function (i) {
    const t = this.tile[i];
    return t === T.FLOOR || t === T.CORR || t === T.DOOR;
  };

  // 圆形实体与网格碰撞：把实体推出实心格
  P.collide = function (p, r) {
    for (let iter = 0; iter < 3; iter++) {
      let moved = false;
      const x0 = Math.floor(p.x - r), x1 = Math.floor(p.x + r), y0 = Math.floor(p.y - r), y1 = Math.floor(p.y + r);
      for (let ty = y0; ty <= y1; ty++) {
        for (let tx = x0; tx <= x1; tx++) {
          if (!this.solid(tx, ty)) continue;
          const cx = p.x < tx ? tx : p.x > tx + 1 ? tx + 1 : p.x;
          const cy = p.y < ty ? ty : p.y > ty + 1 ? ty + 1 : p.y;
          const dx = p.x - cx, dy = p.y - cy;
          const d2 = dx * dx + dy * dy;
          if (d2 >= r * r) continue;
          if (d2 > 1e-10) {
            const d = Math.sqrt(d2), push = r - d;
            p.x += (dx / d) * push;
            p.y += (dy / d) * push;
          } else {
            const l = p.x - tx, rr = tx + 1 - p.x, u = p.y - ty, b = ty + 1 - p.y;
            const m = Math.min(l, rr, u, b);
            if (m === l) p.x = tx - r; else if (m === rr) p.x = tx + 1 + r; else if (m === u) p.y = ty - r; else p.y = ty + 1 + r;
          }
          moved = true;
        }
      }
      if (!moved) break;
    }
  };

  // DDA 射线：返回到第一个不透光格的距离；ext>0 时向墙内多延伸一点，让墙面被照亮
  P.rayDist = function (ox, oy, dx, dy, maxD, ext, visit) {
    const W = this.W, H = this.H, opq = this.opq;
    let mx = Math.floor(ox), my = Math.floor(oy);
    if (mx < 0 || my < 0 || mx >= W || my >= H) return 0;
    if (opq[my * W + mx]) return 0;
    if (visit) visit(my * W + mx, 0);
    const sx = dx > 0 ? 1 : -1, sy = dy > 0 ? 1 : -1;
    const tdx = dx !== 0 ? Math.abs(1 / dx) : Infinity;
    const tdy = dy !== 0 ? Math.abs(1 / dy) : Infinity;
    let tmx = dx !== 0 ? (dx > 0 ? mx + 1 - ox : ox - mx) * tdx : Infinity;
    let tmy = dy !== 0 ? (dy > 0 ? my + 1 - oy : oy - my) * tdy : Infinity;
    let t = 0;
    for (;;) {
      if (tmx < tmy) { t = tmx; tmx += tdx; mx += sx; } else { t = tmy; tmy += tdy; my += sy; }
      if (t >= maxD) return maxD;
      if (mx < 0 || my < 0 || mx >= W || my >= H) return t;
      const i = my * W + mx;
      if (opq[i]) {
        if (ext > 0) {
          // 继续穿过连续的不透光格，深度一致，墙面边缘才不会出现锯齿
          if (visit) visit(i, t);
          const lim = t + ext;
          for (;;) {
            const tn = tmx < tmy ? tmx : tmy;
            if (tn >= lim) return Math.min(maxD, lim);
            if (tmx < tmy) { tmx += tdx; mx += sx; } else { tmy += tdy; my += sy; }
            if (mx < 0 || my < 0 || mx >= W || my >= H) return Math.min(maxD, tn);
            const j = my * W + mx;
            if (!opq[j]) return Math.min(maxD, tn);
            if (visit) visit(j, tn);
          }
        }
        return t;
      }
      if (visit) visit(i, t);
    }
  };

  P.los = function (ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay, d = Math.hypot(dx, dy);
    if (d < 1e-6) return true;
    return this.rayDist(ax, ay, dx / d, dy / d, d, 0) >= d - 1e-4;
  };

  // 可见多边形：从 a0 起扫过 span 弧度，n 条射线
  P.visPoly = function (ox, oy, a0, span, n, maxD, ext, out, visit) {
    for (let i = 0; i <= n; i++) {
      const a = a0 + (span * i) / n, dx = Math.cos(a), dy = Math.sin(a);
      const d = this.rayDist(ox, oy, dx, dy, maxD, ext, visit);
      out[i * 2] = ox + dx * d;
      out[i * 2 + 1] = oy + dy * d;
    }
    return n + 1;
  };

  // 粗线检测（寻路平滑）：线段两侧 r 范围内都可行走
  P.clearLine = function (ax, ay, bx, by, r) {
    const dx = bx - ax, dy = by - ay, d = Math.hypot(dx, dy);
    const n = Math.max(1, Math.ceil(d / 0.25));
    for (let i = 0; i <= n; i++) {
      const x = ax + (dx * i) / n, y = ay + (dy * i) / n;
      if (this.wsolid(x - r, y - r) || this.wsolid(x + r, y - r) || this.wsolid(x - r, y + r) || this.wsolid(x + r, y + r)) return false;
    }
    return true;
  };

  P.nearestWalk = function (i0) {
    if (this.walkBase[i0]) return i0;
    const W = this.W, x0 = i0 % W, y0 = (i0 / W) | 0;
    for (let rad = 1; rad <= 6; rad++) {
      let best = -1, bd = 1e9;
      for (let y = y0 - rad; y <= y0 + rad; y++) {
        for (let x = x0 - rad; x <= x0 + rad; x++) {
          if (!this.inb(x, y)) continue;
          const i = y * W + x;
          if (!this.walkBase[i]) continue;
          const d = (x - x0) * (x - x0) + (y - y0) * (y - y0);
          if (d < bd) { bd = d; best = i; }
        }
      }
      if (best >= 0) return best;
    }
    return -1;
  };

  // A* 寻路，返回平滑后的路径点（世界坐标）
  P.findPath = function (sx, sy, tx, ty, extra, r) {
    const W = this.W, N = this.N, walk = this.walkBase;
    let s = this.nearestWalk(this.I(U.clamp(Math.floor(sx), 0, W - 1), U.clamp(Math.floor(sy), 0, this.H - 1)));
    let gIdx = this.nearestWalk(this.I(U.clamp(Math.floor(tx), 0, W - 1), U.clamp(Math.floor(ty), 0, this.H - 1)));
    if (s < 0 || gIdx < 0) return null;
    const exactGoal = gIdx === this.I(Math.floor(tx), Math.floor(ty));
    if (!this._g) {
      this._g = new Float32Array(N);
      this._from = new Int32Array(N);
      this._seen = new Uint32Array(N);
      this._done = new Uint32Array(N);
      this._stamp = 0;
      this._heap = new Heap(N * 8);
    }
    const G = this._g, from = this._from, seen = this._seen, done = this._done, heap = this._heap;
    const stamp = ++this._stamp;
    heap.n = 0;
    const gx = gIdx % W, gy = (gIdx / W) | 0;
    const hfn = i => {
      const dx = Math.abs((i % W) - gx), dy = Math.abs(((i / W) | 0) - gy);
      return dx + dy + (1.4142 - 2) * Math.min(dx, dy);
    };
    G[s] = 0; seen[s] = stamp; from[s] = -1;
    heap.push(s, hfn(s));
    let found = false, iters = 0;
    while (heap.n > 0 && iters++ < 20000) {
      const c = heap.pop();
      if (done[c] === stamp) continue;
      done[c] = stamp;
      if (c === gIdx) { found = true; break; }
      const cx = c % W, cy = (c / W) | 0;
      for (let k = 0; k < 8; k++) {
        const dx = k < 4 ? (k === 0 ? 1 : k === 1 ? -1 : 0) : (k & 1 ? 1 : -1);
        const dy = k < 4 ? (k === 2 ? 1 : k === 3 ? -1 : 0) : (k < 6 ? 1 : -1);
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= this.H) continue;
        const ni = ny * W + nx;
        if (!walk[ni] || done[ni] === stamp) continue;
        let cost = 1;
        if (dx !== 0 && dy !== 0) {
          if (!walk[cy * W + nx] || !walk[ny * W + cx]) continue;
          cost = 1.4142;
        }
        cost += this.edgeCost[ni];
        if (extra) cost += extra[ni];
        const ng = G[c] + cost;
        if (seen[ni] !== stamp || ng < G[ni]) {
          seen[ni] = stamp; G[ni] = ng; from[ni] = c;
          heap.push(ni, ng + hfn(ni));
        }
      }
    }
    if (!found) return null;
    const raw = [];
    for (let c = gIdx; c >= 0; c = from[c]) raw.push(c);
    raw.reverse();
    const pts = [{ x: sx, y: sy }];
    for (let k = 1; k < raw.length; k++) pts.push({ x: (raw[k] % W) + 0.5, y: ((raw[k] / W) | 0) + 0.5 });
    if (exactGoal && pts.length > 1) pts[pts.length - 1] = { x: tx, y: ty };
    if (pts.length === 1) pts.push({ x: tx, y: ty });
    return this.smoothPath(pts, r || 0.36);
  };

  P.smoothPath = function (pts, r) {
    const out = [pts[0]];
    let i = 0;
    while (i < pts.length - 1) {
      let j = Math.min(pts.length - 1, i + 14);
      while (j > i + 1 && !this.clearLine(pts[i].x, pts[i].y, pts[j].x, pts[j].y, r)) j--;
      out.push(pts[j]);
      i = j;
    }
    return out;
  };

  P.roomAt = function (x, y) {
    const tx = Math.floor(x), ty = Math.floor(y);
    if (!this.inb(tx, ty)) return null;
    const id = this.roomOf[this.I(tx, ty)];
    return id >= 0 ? this.rooms[id] : null;
  };

  P.randomFloorIn = function (room, rng) {
    for (let k = 0; k < 40; k++) {
      const x = room.x + Math.floor(rng() * room.w), y = room.y + Math.floor(rng() * room.h);
      const i = this.I(x, y);
      if (this.walkBase[i]) return { x: x + 0.5, y: y + 0.5 };
    }
    return { x: room.x + room.w / 2, y: room.y + room.h / 2 };
  };

  // 随机取附近一个可达点（搜索用）
  P.randomNear = function (x, y, rad, rng) {
    for (let k = 0; k < 30; k++) {
      const a = rng() * U.TAU, d = 1.5 + rng() * rad;
      const px = x + Math.cos(a) * d, py = y + Math.sin(a) * d;
      const tx = Math.floor(px), ty = Math.floor(py);
      if (!this.inb(tx, ty) || !this.walkBase[this.I(tx, ty)]) continue;
      if (!this.los(x, y, px, py)) continue;
      return { x: tx + 0.5, y: ty + 0.5 };
    }
    return { x, y };
  };

  // 门开关后，刷新门附近静态灯的阴影
  P.setDoorState = function (d, opaque, solid) {
    let changed = false;
    if (d.opaque !== opaque) {
      d.opaque = opaque;
      for (const [x, y] of d.tiles) this.opq[this.I(x, y)] = opaque ? 1 : 0;
      changed = true;
    }
    if (d.solid !== solid) {
      d.solid = solid;
      for (const [x, y] of d.tiles) this.coll[this.I(x, y)] = solid ? 1 : 0;
    }
    if (changed) {
      for (const L of this.lights) {
        if (Math.abs(L.x - d.x) < L.r + 1.5 && Math.abs(L.y - d.y) < L.r + 1.5) this.buildLightPoly(L);
      }
    }
  };

  P.buildLightPoly = function (L) {
    const n = L.r > 4 ? 120 : 84;
    if (!L.poly || L.poly.length < (n + 1) * 2) L.poly = new Float32Array((n + 1) * 2);
    L.np = this.visPoly(L.x, L.y, 0, U.TAU, n, L.r, 0.3, L.poly, null);
  };

  /* =========================================================
     生成
     ========================================================= */
  U.generateMap = function (seed, diffKey) {
    const D = U.DIFF[diffKey] || U.DIFF.normal;
    const rng = U.mulberry32((seed ^ 0x9e3779b9) >>> 0);
    const ri = (a, b) => (b <= a ? a : a + Math.floor(rng() * (b - a + 1)));
    const shuffle = arr => {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
      }
      return arr;
    };
    const C = D.cols, R = D.rows, CW = D.cellW, CH = D.cellH;
    const W = C * CW + 2, H = R * CH + 2, N = W * H;
    const tile = new Uint8Array(N);
    const roomOf = new Int16Array(N).fill(-1);
    const I = (x, y) => y * W + x;
    const inb = (x, y) => x >= 0 && y >= 0 && x < W && y < H;

    /* ---- 1. 每个格子一间舱室（少数为走廊枢纽） ---- */
    const corners = [0, C - 1, (R - 1) * C, R * C - 1];
    const startCell = corners[Math.floor(rng() * 4)];
    const maxHubs = Math.max(1, Math.floor(C * R * 0.2));
    let hubs = 0;
    const rooms = [];
    for (let cy = 0; cy < R; cy++) {
      for (let cx = 0; cx < C; cx++) {
        const id = rooms.length;
        const ox = 1 + cx * CW, oy = 1 + cy * CH;
        let hub = id !== startCell && hubs < maxHubs && rng() < D.hubChance;
        if (hub) hubs++;
        let w, h;
        if (hub) { w = ri(3, 4); h = ri(3, 4); }
        else {
          w = rng() < 0.6 ? Math.max(ri(5, CW - 4), ri(5, CW - 4)) : ri(5, CW - 4);
          h = rng() < 0.6 ? Math.max(ri(4, CH - 4), ri(4, CH - 4)) : ri(4, CH - 4);
        }
        const x = ri(ox + 2, ox + CW - 2 - w), y = ri(oy + 2, oy + CH - 2 - h);
        rooms.push({
          id, cx, cy, x, y, w, h, hub, sides: {}, doors: [], anchors: [], links: [],
          type: hub ? 'hub' : '', name: '', code: String.fromCharCode(65 + cy) + '-' + (cx + 1),
          mx: x + w / 2, my: y + h / 2,
        });
      }
    }

    /* ---- 2. 连通：随机生成树 + 额外回路（追逐需要能绕圈） ---- */
    const edges = [];
    for (let cy = 0; cy < R; cy++) {
      for (let cx = 0; cx < C; cx++) {
        const a = cy * C + cx;
        if (cx + 1 < C) edges.push({ a, b: a + 1, dir: 'h', used: false });
        if (cy + 1 < R) edges.push({ a, b: a + C, dir: 'v', used: false });
      }
    }
    shuffle(edges);
    const par = rooms.map((_, i) => i);
    const find = i => (par[i] === i ? i : (par[i] = find(par[i])));
    for (const e of edges) {
      const ra = find(e.a), rb = find(e.b);
      if (ra !== rb) { par[ra] = rb; e.used = true; }
    }
    for (const e of edges) if (!e.used && rng() < D.loopChance) e.used = true;
    const deg = i => edges.reduce((n, e) => n + (e.used && (e.a === i || e.b === i) ? 1 : 0), 0);
    for (const r of rooms) {
      if (deg(r.id) < 2 && (r.hub || rng() < 0.7)) {
        const cand = edges.filter(e => !e.used && (e.a === r.id || e.b === r.id));
        if (cand.length) cand[Math.floor(rng() * cand.length)].used = true;
      }
    }

    /* ---- 3. 挖出舱室 ---- */
    for (const r of rooms) {
      for (let y = r.y; y < r.y + r.h; y++) {
        for (let x = r.x; x < r.x + r.w; x++) {
          tile[I(x, y)] = r.hub ? T.CORR : T.FLOOR;
          roomOf[I(x, y)] = r.id;
        }
      }
    }

    /* ---- 4. 走廊与门 ---- */
    const doors = [];
    const carve = (x, y) => { const i = I(x, y); if (tile[i] === T.VOID) tile[i] = T.CORR; };
    function addDoor(r, side, x, y) {
      const axis = side === 'E' || side === 'W' ? 'x' : 'y';
      const tiles = axis === 'x' ? [[x, y], [x, y + 1]] : [[x, y], [x + 1, y]];
      r.sides[side] = { x, y, axis, tiles };
      // 门内侧两格作为连通锚点
      for (const [tx, ty] of tiles) {
        const ix = side === 'E' ? tx - 1 : side === 'W' ? tx + 1 : tx;
        const iy = side === 'S' ? ty - 1 : side === 'N' ? ty + 1 : ty;
        r.anchors.push(I(ix, iy));
      }
      if (r.hub) return;
      if (rng() < D.doorChance) {
        const d = {
          id: doors.length, room: r.id, side, axis, tiles,
          x: axis === 'x' ? x + 0.5 : x + 1, y: axis === 'x' ? y + 1 : y + 0.5,
          open: 0, target: 0, hold: 0, opaque: true, solid: true, lastOpen: -9,
        };
        doors.push(d);
        r.doors.push(d.id);
      }
    }
    function carveH(A, B) {
      const mA = A.hub ? 0 : 1, mB = B.hub ? 0 : 1;
      const lo = Math.max(A.y + mA, B.y + mB), hi = Math.min(A.y + A.h - 2 - mA, B.y + B.h - 2 - mB);
      const xa = A.x + A.w, xb = B.x - 1;
      if (hi >= lo && rng() < 0.82) {
        const y0 = ri(lo, hi);
        for (let x = xa; x <= xb; x++) { carve(x, y0); carve(x, y0 + 1); }
        addDoor(A, 'E', xa, y0); addDoor(B, 'W', xb, y0);
      } else {
        const yA = ri(A.y + mA, A.y + A.h - 2 - mA), yB = ri(B.y + mB, B.y + B.h - 2 - mB);
        const xm = ri(xa + 1, xb - 2);
        for (let x = xa; x <= xm + 1; x++) { carve(x, yA); carve(x, yA + 1); }
        for (let y = Math.min(yA, yB); y <= Math.max(yA, yB) + 1; y++) { carve(xm, y); carve(xm + 1, y); }
        for (let x = xm; x <= xb; x++) { carve(x, yB); carve(x, yB + 1); }
        addDoor(A, 'E', xa, yA); addDoor(B, 'W', xb, yB);
      }
      A.links.push(B.id); B.links.push(A.id);
    }
    function carveV(A, B) {
      const mA = A.hub ? 0 : 1, mB = B.hub ? 0 : 1;
      const lo = Math.max(A.x + mA, B.x + mB), hi = Math.min(A.x + A.w - 2 - mA, B.x + B.w - 2 - mB);
      const ya = A.y + A.h, yb = B.y - 1;
      if (hi >= lo && rng() < 0.82) {
        const x0 = ri(lo, hi);
        for (let y = ya; y <= yb; y++) { carve(x0, y); carve(x0 + 1, y); }
        addDoor(A, 'S', x0, ya); addDoor(B, 'N', x0, yb);
      } else {
        const xA = ri(A.x + mA, A.x + A.w - 2 - mA), xB = ri(B.x + mB, B.x + B.w - 2 - mB);
        const ym = ri(ya + 1, yb - 2);
        for (let y = ya; y <= ym + 1; y++) { carve(xA, y); carve(xA + 1, y); }
        for (let x = Math.min(xA, xB); x <= Math.max(xA, xB) + 1; x++) { carve(x, ym); carve(x, ym + 1); }
        for (let y = ym; y <= yb; y++) { carve(xB, y); carve(xB + 1, y); }
        addDoor(A, 'S', xA, ya); addDoor(B, 'N', xB, yb);
      }
      A.links.push(B.id); B.links.push(A.id);
    }
    for (const e of edges) {
      if (!e.used) continue;
      if (e.dir === 'h') carveH(rooms[e.a], rooms[e.b]);
      else carveV(rooms[e.a], rooms[e.b]);
    }

    /* ---- 5. 墙 ---- */
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (tile[I(x, y)] !== T.VOID) continue;
        let near = false;
        for (let dy = -1; dy <= 1 && !near; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx, ny = y + dy;
            if (!inb(nx, ny)) continue;
            const t = tile[I(nx, ny)];
            if (t === T.FLOOR || t === T.CORR) { near = true; break; }
          }
        }
        if (near) tile[I(x, y)] = T.WALL;
      }
    }
    const doorAt = new Int16Array(N).fill(-1);
    for (const d of doors) for (const [x, y] of d.tiles) { tile[I(x, y)] = T.DOOR; doorAt[I(x, y)] = d.id; }

    const isWalkT = i => { const t = tile[i]; return t === T.FLOOR || t === T.CORR || t === T.DOOR; };

    // BFS 距离场
    function bfs(sx, sy) {
      const dist = new Int32Array(N).fill(-1);
      const q = new Int32Array(N);
      let h = 0, t = 0;
      const s = I(sx, sy);
      dist[s] = 0; q[t++] = s;
      while (h < t) {
        const c = q[h++], cx = c % W, cy = (c / W) | 0;
        const nb = [c + 1, c - 1, c + W, c - W];
        const ok = [cx + 1 < W, cx > 0, cy + 1 < H, cy > 0];
        for (let k = 0; k < 4; k++) {
          if (!ok[k]) continue;
          const n = nb[k];
          if (dist[n] >= 0 || !isWalkT(n)) continue;
          dist[n] = dist[c] + 1;
          q[t++] = n;
        }
      }
      return dist;
    }
    const centerTile = r => I(Math.floor(r.x + r.w / 2), Math.floor(r.y + r.h / 2));

    /* ---- 6. 舱室分工：起点、逃生舱、信标、守夜者巢 ---- */
    const start = rooms[startCell];
    start.type = 'start';
    const dStart = bfs(Math.floor(start.x + start.w / 2), Math.floor(start.y + start.h / 2));
    let pod = null, best = -1;
    for (const r of rooms) {
      if (r.hub || r === start) continue;
      const d = dStart[centerTile(r)];
      if (d > best) { best = d; pod = r; }
    }
    pod.type = 'podbay';
    const maxDist = best;

    const cand = rooms.filter(r => !r.hub && r !== start && r !== pod);
    const minD = new Map();
    cand.forEach(r => minD.set(r, dStart[centerTile(r)]));
    const relayRooms = [];
    for (let k = 0; k < D.relays && cand.length; k++) {
      let pick = null, bv = -1;
      for (const r of cand) {
        if (relayRooms.includes(r)) continue;
        const v = minD.get(r) * (0.7 + 0.6 * rng());
        if (v > bv) { bv = v; pick = r; }
      }
      if (!pick) break;
      relayRooms.push(pick);
      const dd = bfs(Math.floor(pick.x + pick.w / 2), Math.floor(pick.y + pick.h / 2));
      for (const r of cand) minD.set(r, Math.min(minD.get(r), dd[centerTile(r)]));
    }

    // 其他舱室类型
    const counts = {};
    const pickType = () => {
      let tot = 0;
      const ws = ROOM_TYPES.map(t => { const w = t.w / (1 + (counts[t.key] || 0) * 1.6); tot += w; return w; });
      let x = rng() * tot;
      for (let i = 0; i < ROOM_TYPES.length; i++) { x -= ws[i]; if (x <= 0) return ROOM_TYPES[i].key; }
      return 'cargo';
    };
    for (const r of rooms) {
      if (r.type) continue;
      const k = pickType();
      counts[k] = (counts[k] || 0) + 1;
      r.type = k;
    }
    rooms.forEach(r => (r.name = U.ROOM_NAMES[r.type] || ''));

    /* ---- 7. 特征 ---- */
    const res = new Uint8Array(N); // 保留格（不放道具）
    const block = new Uint8Array(N); // 1 低矮实心 2 高大不透光
    const win = new Uint8Array(N);
    const props = [];
    const lights = [];
    const lockers = [];
    const vents = [];
    const relays = [];
    const labels = [];
    const lockerAt = new Int16Array(N).fill(-1);

    // 门前两格保留
    for (const r of rooms) {
      for (const side in r.sides) {
        const sd = r.sides[side];
        for (const [tx, ty] of sd.tiles) {
          for (let k = 1; k <= 2; k++) {
            const ix = side === 'E' ? tx - k : side === 'W' ? tx + k : tx;
            const iy = side === 'S' ? ty - k : side === 'N' ? ty + k : ty;
            if (inb(ix, iy)) res[I(ix, iy)] = 1;
            const ox = side === 'E' ? tx + k : side === 'W' ? tx - k : tx;
            const oy = side === 'S' ? ty + k : side === 'N' ? ty - k : ty;
            if (inb(ox, oy)) res[I(ox, oy)] = 1;
          }
        }
      }
    }

    const roomConnected = r => {
      const anchors = r.anchors.filter(i => roomOf[i] === r.id);
      if (!anchors.length) return true;
      const seen = new Uint8Array(N);
      const q = [anchors[0]];
      seen[anchors[0]] = 1;
      while (q.length) {
        const c = q.pop(), cx = c % W, cy = (c / W) | 0;
        const nb = [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]];
        for (const [nx, ny] of nb) {
          if (!inb(nx, ny)) continue;
          const n = I(nx, ny);
          if (seen[n] || roomOf[n] !== r.id || block[n]) continue;
          seen[n] = 1;
          q.push(n);
        }
      }
      return anchors.every(a => seen[a]) && r.mustReach.every(a => seen[a]);
    };
    rooms.forEach(r => (r.mustReach = []));

    function tryBlock(r, x, y, w, h, kind, tall, extra) {
      const cells = [];
      for (let yy = y; yy < y + h; yy++) {
        for (let xx = x; xx < x + w; xx++) {
          if (!inb(xx, yy)) return null;
          const i = I(xx, yy);
          if (roomOf[i] !== r.id || tile[i] !== T.FLOOR || res[i] || block[i]) return null;
          cells.push(i);
        }
      }
      cells.forEach(i => (block[i] = tall ? 2 : 1));
      if (!roomConnected(r)) { cells.forEach(i => (block[i] = 0)); return null; }
      const p = Object.assign({ kind, x, y, w, h, tall: !!tall, room: r.id, s: rng() }, extra || {});
      props.push(p);
      return p;
    }
    // 贴墙位置：返回 {x,y,w,h,side}
    function wallSpot(r, len, depth) {
      const opts = [];
      for (let x = r.x; x <= r.x + r.w - len; x++) {
        opts.push({ x, y: r.y, w: len, h: depth, side: 'N' });
        opts.push({ x, y: r.y + r.h - depth, w: len, h: depth, side: 'S' });
      }
      for (let y = r.y; y <= r.y + r.h - len; y++) {
        opts.push({ x: r.x, y, w: depth, h: len, side: 'W' });
        opts.push({ x: r.x + r.w - depth, y, w: depth, h: len, side: 'E' });
      }
      return shuffle(opts);
    }
    function innerSpot(r, w, h) {
      const opts = [];
      for (let y = r.y + 1; y <= r.y + r.h - 1 - h; y++) for (let x = r.x + 1; x <= r.x + r.w - 1 - w; x++) opts.push({ x, y, w, h });
      return shuffle(opts);
    }
    function placeWall(r, len, depth, kind, tall, tries, extra) {
      const spots = wallSpot(r, len, depth);
      for (let k = 0; k < Math.min(tries || 12, spots.length); k++) {
        const s = spots[k];
        const p = tryBlock(r, s.x, s.y, s.w, s.h, kind, tall, Object.assign({ side: s.side }, extra || {}));
        if (p) return p;
      }
      return null;
    }
    function placeInner(r, w, h, kind, tall, tries, extra) {
      const spots = innerSpot(r, w, h);
      for (let k = 0; k < Math.min(tries || 12, spots.length); k++) {
        const s = spots[k];
        const p = tryBlock(r, s.x, s.y, s.w, s.h, kind, tall, extra);
        if (p) return p;
      }
      return null;
    }

    // 信标
    const placeRelay = r => {
      const cxr = r.x + r.w / 2, cyr = r.y + r.h / 2;
      const opts = [];
      for (let y = r.y + 1; y < r.y + r.h - 1; y++) {
        for (let x = r.x + 1; x < r.x + r.w - 1; x++) {
          opts.push({ x, y, d: Math.hypot(x + 0.5 - cxr, y + 0.5 - cyr) + rng() * 1.5 });
        }
      }
      opts.sort((a, b) => a.d - b.d);
      for (const o of opts) {
        let ok = true;
        for (let dy = -1; dy <= 1 && ok; dy++) for (let dx = -1; dx <= 1; dx++) {
          const i = I(o.x + dx, o.y + dy);
          if (roomOf[i] !== r.id || tile[i] !== T.FLOOR || block[i] || (dx === 0 && dy === 0 && res[i])) { ok = false; break; }
        }
        if (!ok) continue;
        const ring = [];
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy) ring.push(I(o.x + dx, o.y + dy));
        block[I(o.x, o.y)] = 1;
        r.mustReach.push(ring[1]);
        if (!roomConnected(r)) { block[I(o.x, o.y)] = 0; r.mustReach.pop(); continue; }
        ring.forEach(i => (res[i] = 1));
        res[I(o.x, o.y)] = 1;
        const checks = [];
        if (D.checks >= 1) checks.push(0.28 + rng() * 0.18);
        if (D.checks >= 2) checks.push(0.64 + rng() * 0.18);
        relays.push({
          id: relays.length, room: r.id, tx: o.x, ty: o.y, x: o.x + 0.5, y: o.y + 0.5,
          progress: 0, done: false, known: false, checks, checkI: 0, sparkT: -9, doneT: -9, seenT: -9,
        });
        r.relay = relays.length - 1;
        return true;
      }
      return false;
    };
    const failed = [];
    relayRooms.forEach(r => { if (!placeRelay(r)) failed.push(r); });
    if (relays.length < D.relays) {
      const rest = rooms.filter(r => !r.hub && r !== start && r !== pod && r.relay == null && !failed.includes(r))
        .sort((a, b) => dStart[centerTile(b)] - dStart[centerTile(a)]);
      for (const r of rest) { if (relays.length >= D.relays) break; placeRelay(r); }
    }

    // 逃生舱：2×2，贴着没有门的墙
    let podObj = null;
    {
      const r = pod;
      const sides = ['N', 'S', 'E', 'W'].filter(s => !r.sides[s]);
      const all = sides.length ? sides : ['N', 'S', 'E', 'W'];
      const opts = [];
      for (const s of all) {
        if (s === 'N' || s === 'S') {
          for (let x = r.x; x <= r.x + r.w - 2; x++) opts.push({ s, x, y: s === 'N' ? r.y : r.y + r.h - 2 });
        } else {
          for (let y = r.y; y <= r.y + r.h - 2; y++) opts.push({ s, x: s === 'W' ? r.x : r.x + r.w - 2, y });
        }
      }
      // 优先离门远、在墙中段
      opts.forEach(o => {
        let dmin = 99;
        for (const a of r.anchors) dmin = Math.min(dmin, Math.hypot((a % W) - o.x - 0.5, ((a / W) | 0) - o.y - 0.5));
        const mid = o.s === 'N' || o.s === 'S' ? Math.abs(o.x + 1 - (r.x + r.w / 2)) : Math.abs(o.y + 1 - (r.y + r.h / 2));
        o.score = dmin - mid * 0.6 + rng();
      });
      opts.sort((a, b) => b.score - a.score);
      for (const o of opts) {
        // 前方两格
        let fx0, fy0, fx1, fy1, hx, hy, face;
        if (o.s === 'N') { fx0 = o.x; fy0 = o.y + 2; fx1 = o.x + 1; fy1 = o.y + 2; hx = o.x + 1; hy = o.y + 2; face = Math.PI / 2; }
        else if (o.s === 'S') { fx0 = o.x; fy0 = o.y - 1; fx1 = o.x + 1; fy1 = o.y - 1; hx = o.x + 1; hy = o.y; face = -Math.PI / 2; }
        else if (o.s === 'W') { fx0 = o.x + 2; fy0 = o.y; fx1 = o.x + 2; fy1 = o.y + 1; hx = o.x + 2; hy = o.y + 1; face = 0; }
        else { fx0 = o.x - 1; fy0 = o.y; fx1 = o.x - 1; fy1 = o.y + 1; hx = o.x; hy = o.y + 1; face = Math.PI; }
        if (!inb(fx0, fy0) || roomOf[I(fx0, fy0)] !== r.id || roomOf[I(fx1, fy1)] !== r.id) continue;
        r.mustReach.push(I(fx0, fy0));
        const p = tryBlock(r, o.x, o.y, 2, 2, 'pod', false, { side: o.s, face });
        if (!p) { r.mustReach.pop(); continue; }
        res[I(fx0, fy0)] = 1; res[I(fx1, fy1)] = 1;
        podObj = { x: o.x, y: o.y, side: o.s, face, hx, hy, cx: o.x + 1, cy: o.y + 1, unlocked: false, prop: p };
        break;
      }
      if (!podObj) {
        // 极少数情况下放不下：直接放房间中央
        const cx = Math.floor(r.x + r.w / 2) - 1, cy = Math.floor(r.y + r.h / 2) - 1;
        const p = { kind: 'pod', x: cx, y: cy, w: 2, h: 2, tall: false, room: r.id, s: 0.5, side: 'N', face: Math.PI / 2 };
        props.push(p);
        for (let yy = cy; yy < cy + 2; yy++) for (let xx = cx; xx < cx + 2; xx++) block[I(xx, yy)] = 1;
        podObj = { x: cx, y: cy, side: 'N', face: Math.PI / 2, hx: cx + 1, hy: cy + 2, cx: cx + 1, cy: cy + 1, unlocked: false, prop: p };
      }
    }

    // 储物柜：嵌在墙里，正面朝向地面
    const lockerOK = (wx, wy, fx, fy) => {
      if (!inb(wx, wy) || !inb(fx, fy)) return false;
      const wi = I(wx, wy), fi = I(fx, fy);
      if (tile[wi] !== T.WALL || lockerAt[wi] >= 0 || win[wi]) return false;
      const ft = tile[fi];
      if (ft !== T.FLOOR && ft !== T.CORR) return false;
      if (res[fi] || block[fi]) return false;
      // 墙后不能是地面
      const bx = wx * 2 - fx, by = wy * 2 - fy;
      if (inb(bx, by) && isWalkT(I(bx, by))) return false;
      // 沿墙两侧必须是墙（不在墙角、不挨着门）
      const ax = fy === wy ? 0 : 1, ay = fy === wy ? 1 : 0;
      for (const s of [-1, 1]) {
        const nx = wx + ax * s, ny = wy + ay * s;
        if (!inb(nx, ny) || tile[I(nx, ny)] !== T.WALL) return false;
      }
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        if (inb(wx + dx, wy + dy) && tile[I(wx + dx, wy + dy)] === T.DOOR) return false;
      }
      for (const L of lockers) if (Math.abs(L.x - wx) + Math.abs(L.y - wy) < 3) return false;
      return true;
    };
    function addLocker(wx, wy, fx, fy) {
      const id = lockers.length;
      const dir = Math.atan2(fy - wy, fx - wx);
      lockers.push({ id, x: wx, y: wy, fx, fy, cx: fx + 0.5, cy: fy + 0.5, dir, open: 0, busy: 0, room: roomOf[I(fx, fy)] });
      lockerAt[I(wx, wy)] = id;
      res[I(fx, fy)] = 1;
      const r = roomOf[I(fx, fy)] >= 0 ? rooms[roomOf[I(fx, fy)]] : null;
      if (r) r.mustReach.push(I(fx, fy));
    }
    function roomWallSlots(r) {
      const out = [];
      for (let x = r.x; x < r.x + r.w; x++) { out.push([x, r.y - 1, x, r.y]); out.push([x, r.y + r.h, x, r.y + r.h - 1]); }
      for (let y = r.y; y < r.y + r.h; y++) { out.push([r.x - 1, y, r.x, y]); out.push([r.x + r.w, y, r.x + r.w - 1, y]); }
      return shuffle(out);
    }
    for (const r of rooms) {
      if (r.hub) continue;
      const want = r.type === 'quarters' || r.type === 'storage' ? ri(2, 3) : r.type === 'start' || r.type === 'podbay' ? 1 : ri(1, 2);
      let got = 0;
      for (const [wx, wy, fx, fy] of roomWallSlots(r)) {
        if (got >= want) break;
        if (!lockerOK(wx, wy, fx, fy)) continue;
        addLocker(wx, wy, fx, fy);
        if (!roomConnected(r)) { // 回滚
          const L = lockers.pop(); lockerAt[I(L.x, L.y)] = -1; res[I(L.fx, L.fy)] = 0; r.mustReach.pop();
          continue;
        }
        got++;
      }
    }
    {
      // 走廊里也零散放几个
      const want = Math.round(C * R * 0.3);
      const slots = [];
      for (let y = 1; y < H - 1; y++) {
        for (let x = 1; x < W - 1; x++) {
          const i = I(x, y);
          if (tile[i] !== T.CORR || roomOf[i] >= 0) continue;
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) slots.push([x + dx, y + dy, x, y]);
        }
      }
      shuffle(slots);
      let got = 0;
      for (const [wx, wy, fx, fy] of slots) {
        if (got >= want) break;
        if (!lockerOK(wx, wy, fx, fy)) continue;
        let far = true;
        for (const L of lockers) if (Math.hypot(L.x - wx, L.y - wy) < 9) { far = false; break; }
        if (!far) continue;
        addLocker(wx, wy, fx, fy);
        got++;
      }
    }

    // 通风管：成对，彼此相距较远
    {
      const pairs = D.key === 'nightmare' ? 2 : 3;
      const candV = [];
      for (let y = 1; y < H - 1; y++) {
        for (let x = 1; x < W - 1; x++) {
          const i = I(x, y);
          const t = tile[i];
          if ((t !== T.FLOOR && t !== T.CORR) || res[i] || block[i]) continue;
          let walls = 0;
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (tile[I(x + dx, y + dy)] === T.WALL) walls++;
          if (walls !== 1) continue;
          let nearDoor = false;
          for (let dy = -2; dy <= 2 && !nearDoor; dy++) for (let dx = -2; dx <= 2; dx++) if (tile[I(x + dx, y + dy)] === T.DOOR) { nearDoor = true; break; }
          if (nearDoor) continue;
          const rr = roomOf[i] >= 0 ? rooms[roomOf[i]] : null;
          if (rr && (rr.type === 'start' || rr.type === 'podbay')) continue;
          candV.push({ x, y });
        }
      }
      shuffle(candV);
      const picks = [];
      const sx0 = start.x + start.w / 2, sy0 = start.y + start.h / 2;
      for (let k = 0; k < pairs * 2 && candV.length; k++) {
        let bp = null, bv = -1;
        for (let j = 0; j < Math.min(candV.length, 160); j++) {
          const c = candV[j];
          let dm = Math.hypot(c.x - sx0, c.y - sy0) * 0.35 + 4;
          for (const p of picks) dm = Math.min(dm, Math.hypot(c.x - p.x, c.y - p.y));
          const v = dm + rng() * 2;
          if (v > bv) { bv = v; bp = c; }
        }
        if (!bp) break;
        picks.push(bp);
        candV.splice(candV.indexOf(bp), 1);
      }
      // 按角度排序后，对面配对
      const mx = W / 2, my = H / 2;
      picks.sort((a, b) => Math.atan2(a.y - my, a.x - mx) - Math.atan2(b.y - my, b.x - mx));
      const half = Math.floor(picks.length / 2);
      for (let k = 0; k < half; k++) {
        const a = picks[k], b = picks[k + half];
        const ia = vents.length;
        vents.push({ id: ia, tx: a.x, ty: a.y, x: a.x + 0.5, y: a.y + 0.5, pair: ia + 1, rattle: 0 });
        vents.push({ id: ia + 1, tx: b.x, ty: b.y, x: b.x + 0.5, y: b.y + 0.5, pair: ia, rattle: 0 });
        res[I(a.x, a.y)] = 1; res[I(b.x, b.y)] = 1;
        for (const v of [a, b]) {
          const rid = roomOf[I(v.x, v.y)];
          if (rid >= 0) rooms[rid].mustReach.push(I(v.x, v.y));
        }
      }
    }

    // 窗：外墙背后是虚空的墙段
    for (const r of rooms) {
      if (r.hub) continue;
      const wantRun = r.type === 'obs' ? 99 : rng() < 0.25 ? 2 : 0;
      if (!wantRun) continue;
      const runs = [];
      const scan = (cells) => {
        let cur = [];
        for (const c of cells) {
          const [wx, wy, ox, oy] = c;
          const ok = inb(ox, oy) && tile[I(wx, wy)] === T.WALL && tile[I(ox, oy)] !== T.FLOOR && tile[I(ox, oy)] !== T.CORR && tile[I(ox, oy)] !== T.DOOR && lockerAt[I(wx, wy)] < 0;
          if (ok) cur.push(c); else { if (cur.length) runs.push(cur); cur = []; }
        }
        if (cur.length) runs.push(cur);
      };
      const n = [], s = [], e = [], w = [];
      for (let x = r.x; x < r.x + r.w; x++) { n.push([x, r.y - 1, x, r.y - 2]); s.push([x, r.y + r.h, x, r.y + r.h + 1]); }
      for (let y = r.y; y < r.y + r.h; y++) { w.push([r.x - 1, y, r.x - 2, y]); e.push([r.x + r.w, y, r.x + r.w + 1, y]); }
      [n, s, e, w].forEach(scan);
      runs.sort((a, b) => b.length - a.length);
      if (!runs.length) continue;
      const run = runs[0];
      if (r.type === 'obs') {
        for (let k = 1; k < run.length - 1; k++) win[I(run[k][0], run[k][1])] = 1;
        if (run.length <= 2) run.forEach(c => (win[I(c[0], c[1])] = 1));
      } else if (run.length >= 3) {
        const k = ri(1, run.length - 2);
        win[I(run[k][0], run[k][1])] = 1;
        if (run.length >= 5 && rng() < 0.5) win[I(run[Math.min(run.length - 2, k + 1)][0], run[Math.min(run.length - 2, k + 1)][1])] = 1;
      }
    }

    // 道具
    for (const r of rooms) {
      if (r.hub) continue;
      const area = r.w * r.h;
      switch (r.type) {
        case 'cargo': {
          const n = ri(2, area > 40 ? 5 : 3);
          for (let k = 0; k < n; k++) {
            const big = rng() < 0.45;
            const horiz = rng() < 0.5;
            if (rng() < 0.55) placeInner(r, big ? (horiz ? 2 : 1) : 1, big ? (horiz ? 1 : 2) : 1, 'crate', true, 14);
            else placeWall(r, big ? 2 : 1, 1, 'crate', true, 14);
          }
          if (rng() < 0.6) placeInner(r, 2, 2, 'crate', true, 10, { big: true });
          break;
        }
        case 'storage': {
          const n = ri(2, 3);
          for (let k = 0; k < n; k++) placeWall(r, 3, 1, 'shelf', true, 16);
          if (rng() < 0.7) placeInner(r, 1, 1, 'crate', true, 8);
          break;
        }
        case 'quarters': {
          const n = ri(2, 4);
          for (let k = 0; k < n; k++) placeWall(r, 2, 1, 'bunk', false, 14);
          if (rng() < 0.6) placeInner(r, 2, 1, 'table', false, 8);
          break;
        }
        case 'medbay': {
          const n = ri(2, 3);
          for (let k = 0; k < n; k++) placeWall(r, 2, 1, 'bed', false, 14);
          placeWall(r, 1, 1, 'cabinet', true, 10);
          break;
        }
        case 'control': {
          const n = ri(3, 5);
          for (let k = 0; k < n; k++) placeWall(r, 1, 1, 'console', false, 14);
          if (area > 30) placeInner(r, 2, 1, 'table', false, 10, { screen: true });
          break;
        }
        case 'engine': {
          placeInner(r, 2, 2, 'machine', true, 14);
          if (area > 42) placeInner(r, 2, 2, 'machine', true, 10);
          const n = ri(1, 2);
          for (let k = 0; k < n; k++) placeWall(r, 1, 1, 'tank', true, 10);
          break;
        }
        case 'hydro': {
          const n = ri(2, 3);
          for (let k = 0; k < n; k++) {
            if (rng() < 0.5) placeInner(r, 3, 1, 'planter', false, 14);
            else placeInner(r, 1, 3, 'planter', false, 14);
          }
          break;
        }
        case 'obs': {
          placeInner(r, 2, 1, 'bench', false, 10);
          if (rng() < 0.5) placeInner(r, 2, 1, 'bench', false, 10);
          break;
        }
        case 'start': {
          placeWall(r, 2, 1, 'workbench', false, 14);
          placeWall(r, 1, 1, 'crate', true, 10);
          break;
        }
        case 'podbay': {
          if (rng() < 0.6) placeWall(r, 1, 1, 'crate', true, 10);
          break;
        }
      }
    }

    /* ---- 8. 灯光 ---- */
    const addLight = (x, y, r, col, k, mode, extra) => {
      for (const L of lights) if (Math.hypot(L.x - x, L.y - y) < 0.8) return null;
      const L = Object.assign({ x, y, r, col, k, mode, ph: rng() * 100, sd: Math.floor(rng() * 1e6) }, extra || {});
      lights.push(L);
      return L;
    };
    // 走廊应急灯
    {
      const corr = [];
      for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
        const i = I(x, y);
        if (tile[i] === T.CORR && roomOf[i] < 0) corr.push({ x, y });
      }
      shuffle(corr);
      const spacing = D.key === 'nightmare' ? 8.5 : 7;
      for (const c of corr) {
        let wdx = 0, wdy = 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (tile[I(c.x + dx, c.y + dy)] === T.WALL && lockerAt[I(c.x + dx, c.y + dy)] < 0) { wdx = dx; wdy = dy; break; }
        if (!wdx && !wdy) continue;
        let ok = true;
        for (const L of lights) if (Math.hypot(L.x - c.x, L.y - c.y) < spacing) { ok = false; break; }
        if (!ok) continue;
        const red = rng() < 0.72;
        const mode = rng() < 0.12 ? 'broken' : rng() < 0.45 ? 'flicker' : 'pulse';
        addLight(c.x + 0.5 + wdx * 0.36, c.y + 0.5 + wdy * 0.36, 3.6, red ? [255, 58, 44] : [255, 150, 64], red ? 0.62 : 0.55, mode, { wall: [wdx, wdy], fixture: true });
      }
    }
    // 舱室灯
    for (const r of rooms) {
      const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
      if (r.hub) {
        if (rng() < 0.5) addLight(cx, cy, 3.4, [255, 70, 50], 0.5, 'pulse', { ceiling: true });
        continue;
      }
      const big = Math.max(r.w, r.h) * 0.58 + 1.6;
      if (r.type === 'start') addLight(cx, cy, big + 0.4, [200, 214, 255], 0.4, 'flicker', { ceiling: true });
      else if (r.type === 'podbay') addLight(cx, cy, big, [255, 70, 56], 0.45, 'alarm', { ceiling: true, podbay: true });
      else if (rng() < 0.42) {
        const mode = rng() < 0.5 ? 'flicker' : rng() < 0.4 ? 'broken' : 'steady';
        const cool = rng() < 0.6;
        addLight(cx, cy, big, cool ? [180, 198, 255] : [255, 222, 180], 0.4, mode, { ceiling: true });
      }
    }
    for (const p of props) {
      const px = p.x + p.w / 2, py = p.y + p.h / 2;
      if (p.kind === 'planter') addLight(px, py, 2.6, [110, 255, 150], 0.36, 'steady', {});
      else if (p.kind === 'console' && rng() < 0.7) addLight(px, py, 2.0, [110, 200, 255], 0.34, rng() < 0.3 ? 'flicker' : 'steady', {});
      else if (p.kind === 'machine') addLight(px, py, 2.8, [255, 140, 60], 0.32, 'pulse', {});
    }

    /* ---- 9. 地面喷字 ---- */
    for (const r of rooms) {
      if (r.hub || !r.name) continue;
      const a = r.anchors.find(i => roomOf[i] === r.id);
      let lx = r.x + 1.2, ly = r.y + 0.7;
      if (a != null) {
        const ax = a % W, ay = (a / W) | 0;
        lx = U.clamp(ax + 0.5, r.x + 1.6, r.x + r.w - 1.6);
        ly = U.clamp(ay + 0.5, r.y + 0.8, r.y + r.h - 0.8);
        // 往房间内挪一点
        lx += (r.x + r.w / 2 - lx) * 0.35;
        ly += (r.y + r.h / 2 - ly) * 0.35;
      }
      labels.push({ x: lx, y: ly, text: r.code + ' ' + r.name, room: r.id });
    }

    /* ---- 10. 组装 ---- */
    const M = new StationMap();
    Object.assign(M, {
      seed, D, W, H, N, tile, roomOf, rooms, doors, doorAt, lockers, lockerAt, vents, relays, pod: podObj,
      lights, props, labels, win, block, res, maxDist,
    });
    M.coll = new Uint8Array(N);
    M.opq = new Uint8Array(N);
    M.walkBase = new Uint8Array(N);
    M.edgeCost = new Float32Array(N);
    M.explored = new Uint8Array(N);
    for (let i = 0; i < N; i++) {
      const t = tile[i];
      const wall = t === T.VOID || t === T.WALL;
      M.coll[i] = wall || t === T.DOOR || block[i] ? 1 : 0;
      M.opq[i] = wall || t === T.DOOR || block[i] === 2 ? 1 : 0;
      M.walkBase[i] = !wall && !block[i] ? 1 : 0;
    }
    // 被道具围死的小角落：标记为不可行走（守夜者不会把它当目标）
    {
      const seen = new Uint8Array(N);
      const s0 = I(Math.floor(start.x + start.w / 2), Math.floor(start.y + start.h / 2));
      const q = [s0];
      seen[s0] = 1;
      while (q.length) {
        const c = q.pop();
        for (const n of [c + 1, c - 1, c + W, c - W]) {
          if (n < 0 || n >= N || seen[n] || !M.walkBase[n]) continue;
          seen[n] = 1;
          q.push(n);
        }
      }
      for (let i = 0; i < N; i++) if (M.walkBase[i] && !seen[i]) { M.walkBase[i] = 0; M.coll[i] = 1; }
    }
    // 贴墙格子稍贵，让守夜者走在走廊中间
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      const i = I(x, y);
      if (!M.walkBase[i]) continue;
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (!M.walkBase[I(x + dx, y + dy)]) n++;
      M.edgeCost[i] = n ? 0.25 : 0;
    }
    lights.forEach(L => M.buildLightPoly(L));
    // 静态光照强度（潜行判定用）
    M.lightLevel = new Float32Array(N);
    for (const L of lights) {
      if (L.mode === 'broken') continue;
      const r = Math.ceil(L.r);
      for (let y = Math.floor(L.y) - r; y <= Math.floor(L.y) + r; y++) {
        for (let x = Math.floor(L.x) - r; x <= Math.floor(L.x) + r; x++) {
          if (!inb(x, y)) continue;
          const i = I(x, y);
          if (!M.walkBase[i] && tile[i] !== T.DOOR) continue;
          const d = Math.hypot(x + 0.5 - L.x, y + 0.5 - L.y);
          if (d > L.r) continue;
          if (!M.los(L.x, L.y, x + 0.5, y + 0.5)) continue;
          const v = L.k * (1 - d / L.r) * (1 - d / L.r) * 1.6;
          if (v > M.lightLevel[i]) M.lightLevel[i] = v;
        }
      }
    }
    M.start = { x: start.x + start.w / 2, y: start.y + start.h / 2, room: start.id };
    // 守夜者从远处的舱室出发
    {
      const far = rooms.filter(r => r !== pod && r !== start && dStart[centerTile(r)] >= maxDist * 0.55);
      const r = far.length ? far[Math.floor(rng() * far.length)] : rooms[rooms.length - 1];
      const p = M.randomFloorIn(r, rng);
      M.wardenStart = { x: p.x, y: p.y, room: r.id };
    }
    M.startRoom = start;
    M.podRoom = pod;
    return M;
  };
})();
