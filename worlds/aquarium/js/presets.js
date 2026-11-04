// 三套造景模板（纯数据）：底床高度 + 素材摆放
import { T } from "./gfx.js";

export const NX = 40, NZ = 20;

function heights(fn) {
  const h = [], m = [];
  for (let j = 0; j <= NZ; j++) for (let i = 0; i <= NX; i++) {
    const x = T.X0 + (i / NX) * T.W, z = T.Z0 + (j / NZ) * T.D;
    const r = fn(x, z);
    h.push(+r[0].toFixed(3)); m.push(r[1]);
  }
  return { h, m };
}
const back = (z) => (T.Z1 - z) / T.D; // 0 前 → 1 后
const mound = (x, z, cx, cz, a, r) => a * Math.exp(-((x - cx) ** 2 + (z - cz) ** 2) / (r * r));

let seq = 0;
const it = (t, k, x, z, s = 1, ry = 0, seed, extra) => ({ id: "p" + ++seq, t, k, x, z, s, ry, seed: seed ?? (seq * 7919) % 100000, free: true, g: t === "plant" ? 0.85 : undefined, ...extra });

export function presetLayout(id) {
  seq = 0;
  const items = [];
  let sub;
  if (id === "iwagumi") {
    sub = heights((x, z) => [0.32 + 0.7 * back(z) + mound(x, z, -1.3, -0.6, 0.75, 1.9) + mound(x, z, 2.1, -0.8, 0.4, 1.5), back(z) > 0.15 || Math.abs(x) > 3.6 ? 0 : 1]);
    items.push(
      it("rock", "seiryu", -1.3, -0.5, 1.55, 0.3, 11), it("rock", "seiryu", -0.15, 0.25, 0.78, 2.2, 12), it("rock", "seiryu", 1.95, -0.65, 1.08, 4.1, 13),
      it("rock", "seiryu", 2.85, 0.35, 0.55, 1.0, 14), it("rock", "seiryu", -2.85, 0.15, 0.7, 5.2, 15), it("rock", "seiryu", -3.7, -1.25, 0.95, 0.9, 16),
      it("rock", "seiryu", 0.85, 1.25, 0.34, 3.3, 17),
    );
    for (let x = -4.3; x <= 4.4; x += 1.1) {
      items.push(it("plant", "hc", x + 0.2 * Math.sin(x * 3), 1.75, 0.9 + 0.2 * Math.cos(x)));
      if (Math.abs(x + 1.3) > 0.9 && Math.abs(x - 1.9) > 0.8) items.push(it("plant", "hairgrass", x, -0.2 + 0.25 * Math.sin(x * 2), 1.0));
      if (Math.abs(x + 0.15) > 0.6) items.push(it("plant", "hairgrass", x + 0.5, 0.85, 0.85));
      items.push(it("plant", "hairgrass", x + 0.3, -1.7, 1.25));
    }
    items.push(it("plant", "moss", -0.75, -0.1, 0.8), it("plant", "moss", 1.45, -0.2, 0.7));
  } else if (id === "forest") {
    sub = heights((x, z) => [0.38 + 0.85 * back(z) + mound(x, z, 0, -1, 0.45, 2.4) - mound(x, z, 0.4, 1.4, 0.15, 1.2), z > 0.9 && Math.abs(x - 0.4 + 0.5 * (z - 1.5)) < 0.7 ? 1 : 0]);
    items.push(
      it("wood", "spider", -2.2, -0.8, 1.6, 0.4, 21), it("wood", "spider", 1.7, -1.0, 1.45, 2.6, 22), it("wood", "spider", -0.1, -1.5, 1.15, 1.7, 23),
      it("wood", "log", -0.6, 0.25, 0.95, 1.2, 24),
      it("rock", "matsu", -3.45, 0.8, 0.62, 0.3, 25), it("rock", "matsu", 3.2, 0.55, 0.72, 2.0, 26), it("rock", "pebble", 1.25, 1.45, 0.42, 0.4, 27), it("rock", "pebble", -1.6, 1.6, 0.32, 1.4, 28),
    );
    for (const [x, z] of [[-2.4, -0.9], [-1.9, -0.6], [-2.6, -0.3], [1.5, -1.1], [2.0, -0.8], [1.2, -0.7], [-0.3, -1.4], [0.2, -1.2], [-0.8, 0.3], [-0.3, 0.1], [-1.2, -1.2], [2.6, -1.3]])
      items.push(it("plant", "moss", x, z, 0.75, 0, undefined, { drop: true }));
    items.push(it("plant", "fern", -2.0, -0.5, 1, 0, undefined, { drop: true }), it("plant", "fern", 1.45, -0.75, 0.9, 0, undefined, { drop: true }),
      it("plant", "anubias", -0.45, 0.3, 1, 0, undefined, { drop: true }), it("plant", "anubias", 0.75, 0.45, 0.9), it("plant", "anubias", -3.0, 0.9, 0.9));
    for (let x = -4.5; x <= 4.6; x += 1.15) items.push(it("plant", "vallis", x, -2.1 + 0.15 * Math.sin(x * 5), 0.9 + 0.15 * Math.cos(x * 3)));
    for (let x = -4.2; x <= 4.3; x += 1.2) if (Math.abs(x - 0.6) > 0.7) items.push(it("plant", x < 0 ? "hc" : "hairgrass", x, 1.8, 0.85));
  } else {
    sub = heights((x, z) => [0.38 + 0.95 * back(z) + mound(x, z, -2.5, -1.2, 0.3, 1.6), back(z) < 0.18 && Math.abs(x) < 2.4 ? 1 : 0]);
    const P = (k, x, z, s = 1) => items.push(it("plant", k, x, z, s));
    P("vallis", -4.45, -2.1, 1.1); P("vallis", -3.75, -2.15, 1); P("vallis", 4.35, -2.1, 1.1); P("vallis", 3.7, -2.15, 1);
    P("rotala", -2.75, -1.75, 1.15); P("rotala", -2.15, -2.0, 1.05); P("macrandra", -1.05, -1.7, 1.15); P("macrandra", -0.35, -2.0, 1.05);
    P("rotala", 0.65, -1.8, 1.1); P("rotala", 1.25, -2.05, 1.0); P("macrandra", 2.4, -1.75, 1.0); P("sword", 3.0, -1.0, 1.25);
    P("sword", -3.3, -0.4, 1.1); P("macrandra", 1.85, 0.0, 0.85); P("rotala", -1.4, -0.4, 0.8); P("rotala", -0.8, -0.7, 0.75);
    P("anubias", 0.55, 0.65, 1); P("fern", -2.3, 0.45, 1); P("rotala", 3.6, 0.1, 0.8); P("macrandra", -4.2, 0.2, 0.75);
    P("rotala", -3.3, -1.5, 1.0); P("macrandra", 1.9, -2.1, 1.1); P("rotala", 2.6, -2.2, 1.05); P("vallis", -3.0, -2.2, 0.95); P("vallis", 3.1, -2.25, 0.95);
    P("rotala", -0.2, -1.2, 0.9); P("sword", -4.2, -1.0, 1.0); P("rotala", 4.1, -0.9, 0.9); P("macrandra", -2.0, -0.9, 0.85); P("fern", 2.4, 0.5, 0.9); P("anubias", -0.9, 0.6, 0.85);
    P("moss", 1.3, 0.9, 0.9); P("moss", -1.9, 1.0, 0.8);
    for (let x = -4.0; x <= 4.1; x += 0.8) P(Math.abs(x) < 2.4 ? "hc" : "hairgrass", x, 1.75 + 0.15 * Math.sin(x * 3), 0.95);
    for (let x = -3.6; x <= 3.7; x += 1.2) P("hairgrass", x + 0.3, 0.9 + 0.2 * Math.cos(x * 2), 0.85);
    P("hairgrass", -3.6, 1.6, 1); P("hairgrass", 3.5, 1.5, 1); P("hairgrass", -2.9, 1.0, 0.9); P("hairgrass", 2.9, 1.0, 0.9);
    items.push(it("rock", "matsu", 0.95, 0.75, 0.52, 0.8, 31), it("rock", "pebble", -1.65, 1.15, 0.42, 0.2, 32), it("rock", "pebble", 3.25, 1.35, 0.36, 2.2, 33), it("rock", "pebble", 0.1, 1.2, 0.28, 1.2, 34));
  }
  return { sub, items, preset: id };
}
