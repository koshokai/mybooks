// 造景编辑器：雕刻底床、放置 / 移动 / 旋转 / 缩放 / 收起素材、套用模板
import * as THREE from "three";
import { T, clamp } from "./gfx.js";
import { PLANTS, DECOR, PRESETS, PL, DE } from "./data.js";
import { presetLayout } from "./presets.js";
import { scapeThumb } from "./thumbs.js";

const $ = (s) => document.querySelector(s);
const TOOLS = [
  ["none", "视角", '<path d="M12 4v16M4 12h16M12 4l-2.5 2.5M12 4l2.5 2.5M12 20l-2.5-2.5M12 20l2.5-2.5M4 12l2.5-2.5M4 12l2.5 2.5M20 12l-2.5-2.5M20 12l-2.5 2.5"/>'],
  ["raise", "堆高", '<path d="M3 19c4-1 5-9 9-9s5 8 9 9"/><path d="M12 3v5M9.5 5.5 12 3l2.5 2.5"/>'],
  ["lower", "挖低", '<path d="M3 9c4 1 5 9 9 9s5-8 9-9"/><path d="M12 3v5M9.5 5.5 12 8l2.5-2.5"/>'],
  ["smooth", "抹平", '<path d="M3 15c3-3 6 3 9 0s6 3 9 0"/><path d="M5 9h14"/>'],
  ["sand", "铺沙", '<circle cx="7" cy="15" r="1"/><circle cx="12" cy="13" r="1"/><circle cx="16" cy="16" r="1"/><circle cx="10" cy="18" r="1"/><path d="M3 20h18"/>'],
  ["soil", "铺土", '<path d="M3 20h18M5 17h14M7 14h10"/>'],
];
const TABS = [["sub", "底床"], ["rock", "石头"], ["wood", "沉木"], ["plant", "水草"], ["preset", "模板"]];
const nid = () => "u" + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);

export class Editor {
  constructor(ctx) {
    this.c = ctx; this.tab = "plant"; this.tool = "none"; this.brush = 1.0; this.armed = null; this.selM = null; this.changed = false;
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.92, 1, 48), new THREE.MeshBasicMaterial({ color: 0x9ff4ff, transparent: true, opacity: 0.8, depthWrite: false, depthTest: false, side: THREE.DoubleSide, fog: false }));
    this.ring.rotation.x = -Math.PI / 2; this.ring.visible = false; this.ring.renderOrder = 20;
    ctx.scape.scene.add(this.ring);
    this.ui();
  }
  get S() { return this.c.state(); }
  ui() {
    $("#eTabs").innerHTML = TABS.map(([k, n]) => `<button data-tab="${k}">${n}</button>`).join("");
    $("#eTabs").addEventListener("click", (e) => { const b = e.target.closest("[data-tab]"); if (b) { this.tab = b.dataset.tab; this.armed = null; this.render(); } });
    $("#eBody").addEventListener("click", (e) => this.cardClick(e));
    $("#eBody").addEventListener("input", (e) => { if (e.target.id === "eBrush") this.brush = +e.target.value / 100; });
    $("#eDone").addEventListener("click", () => this.c.exit());
    $("#eRot").addEventListener("input", (e) => { const it = this.selItem; if (!it) return; it.ry = (+e.target.value * Math.PI) / 180; this.c.scape.place(it); this.changed = true; });
    $("#eScale").addEventListener("input", (e) => { const it = this.selItem; if (!it) return; it.s = +e.target.value / 100; this.c.scape.place(it); this.posRing(); this.changed = true; });
    $("#eScale").addEventListener("change", () => this.c.scape.refresh());
    $("#eRot").addEventListener("change", () => this.c.scape.refresh());
    $("#eDel").addEventListener("click", () => this.removeSel());
    $("#eOk").addEventListener("click", () => this.select(null));
  }
  open() {
    document.body.classList.add("editing");
    $("#editor").hidden = false; $("#eTop").hidden = false;
    this.changed = false; this.render();
    this.c.hint("", 1);
  }
  close() {
    this.select(null); this.armed = null; this.tool = "none";
    document.body.classList.remove("editing", "m-sculpt");
    $("#editor").hidden = true; $("#eTop").hidden = true;
    this.c.scape.refresh(); this.c.save();
    if (this.changed) {
      this.c.toast("造景已保存");
      if (this.S.layout.items.length >= 12) { if (this.c.A.unlock("aquarium:scaper", "造景师")) setTimeout(() => this.c.toast("解锁成就 · <b>造景师</b>"), 2600); }
    }
  }
  setHint(t) { $("#eHint").textContent = t; }
  cost(t, k) { return (t === "plant" ? PL[k] : DE[k]).price; }
  stock(t, k) { return this.S.storage[t + ":" + k] | 0; }
  render() {
    for (const b of document.querySelectorAll("#eTabs button")) b.classList.toggle("on", b.dataset.tab === this.tab);
    const body = $("#eBody");
    let h = "";
    if (this.tab === "sub") {
      h = TOOLS.map(([k, n, svg]) => `<button class="ecard tool ${this.tool === k ? "on" : ""}" data-tool="${k}"><svg viewBox="0 0 24 24">${svg}</svg>${n}</button>`).join("");
      h += `<label class="ecard slider">笔刷大小<input id="eBrush" type="range" min="40" max="220" value="${Math.round(this.brush * 100)}" /></label>`;
      this.setHint(this.tool === "none" ? "选择工具后在底床上拖动 · 选「视角」可旋转查看" : `在底床上拖动来${TOOLS.find((t) => t[0] === this.tool)[1]}`);
    } else if (this.tab === "preset") {
      h = PRESETS.map((p) => `<button class="ecard wide ${this.confirm === p.id ? "on" : ""}" data-preset="${p.id}"><b>${p.name}</b><em>${p.en}</em><p>${this.confirm === p.id ? "再点一次确认替换当前布局（已购买的素材会收进收纳箱）" : p.desc}</p></button>`).join("");
      this.setHint("套用模板是免费的");
    } else {
      const list = this.tab === "plant" ? PLANTS : DECOR.filter((d) => d.t === this.tab);
      h = list.map((d) => {
        const st = this.stock(this.tab, d.id), on = this.armed && this.armed.k === d.id;
        return `<button class="ecard ${on ? "on" : ""}" data-item="${d.id}" title="${d.desc}"><img alt="" data-st="${this.tab}" data-sk="${d.id}" />${d.name}${st ? `<small class="st">收纳 ×${st}</small>` : `<small>✦ ${d.price}</small>`}</button>`;
      }).join("");
      this.setHint(this.armed ? `点击${PL[this.armed.k]?.epi ? "石头、沉木或底床" : "底床"}放置${(PL[this.armed.k] || DE[this.armed.k]).name} · 再点卡片取消` : "选一样素材放进缸里 · 点缸里的素材可以移动、旋转、缩放");
    }
    body.innerHTML = h;
    document.body.classList.toggle("m-sculpt", this.tab === "sub" && this.tool !== "none");
    const imgs = [...body.querySelectorAll("img[data-st]")]; let i = 0;
    const next = () => { if (i >= imgs.length || $("#editor").hidden) return; const im = imgs[i++]; if (im.isConnected) im.src = scapeThumb(im.dataset.st === "plant" ? "plant" : im.dataset.st, im.dataset.sk); setTimeout(next, 16); };
    next();
  }
  cardClick(e) {
    const t = e.target.closest("[data-tool]"), it = e.target.closest("[data-item]"), p = e.target.closest("[data-preset]");
    if (t) { this.tool = t.dataset.tool; this.select(null); this.render(); this.c.controls.enabled = true; }
    if (it) { const k = it.dataset.item; this.armed = this.armed && this.armed.k === k ? null : { t: this.tab, k }; this.select(null); this.render(); }
    if (p) {
      if (this.confirm !== p.dataset.preset) { this.confirm = p.dataset.preset; this.render(); return; }
      this.applyPreset(p.dataset.preset); this.confirm = null; this.render();
    }
    this.c.audio.click();
  }
  applyPreset(id) {
    const S = this.S;
    for (const it of S.layout.items) if (!it.free) S.storage[it.t + ":" + it.k] = (S.storage[it.t + ":" + it.k] | 0) + 1;
    S.layout = presetLayout(id);
    this.c.scape.load(S.layout);
    this.c.refreshAll(); this.changed = true; this.c.save();
    this.c.toast(`已套用「${PRESETS.find((p) => p.id === id).name}」`); this.c.audio.place();
  }
  hitSub(ray) { return ray.intersectObject(this.c.scape.sub, false)[0]; }
  hitDecorOrSub(ray, except) { const l = this.c.scape.decorMeshes.filter((m) => m !== except).concat([this.c.scape.sub]); return ray.intersectObjects(l, false)[0]; }
  get selItem() { return this.selM && this.selM.userData.item; }
  down(e, ray) {
    if (this.tab === "sub" && this.tool !== "none") { const h = this.hitSub(ray); if (h) { this.sculpting = true; this.sculptAt(h.point); return true; } return false; }
    if (this.selM) { const h = ray.intersectObject(this.selM, false)[0]; if (h) { this.dragging = true; return true; } }
    return false;
  }
  move(e, ray) {
    if (this.sculpting) { const h = this.hitSub(ray); if (h) this.sculptAt(h.point); return; }
    if (this.dragging && this.selM) {
      const it = this.selItem, epi = it.t === "plant" && PL[it.k].epi;
      const h = epi ? this.hitDecorOrSub(ray, this.selM) : this.hitSub(ray);
      if (!h) return;
      it.x = clamp(h.point.x, T.X0 + 0.2, T.X1 - 0.2); it.z = clamp(h.point.z, T.Z0 + 0.2, T.Z1 - 0.2);
      it.y = h.point.y - 0.02; it.on = h.object === this.c.scape.sub ? "sub" : "decor";
      this.c.scape.place(it); this.posRing(); this.changed = true;
    }
  }
  up() {
    if (this.sculpting) { this.sculpting = false; this.c.scape.updateSub(); this.c.scape.refresh(); this.changed = true; this.c.save(); }
    if (this.dragging) { this.dragging = false; this.c.scape.refresh(); this.c.audio.place(); this.c.save(); }
  }
  sculptAt(p) {
    this.c.scape.sculpt(p.x, p.z, this.brush, 0.05, this.tool);
    const now = performance.now();
    if (!this.lastSub || now - this.lastSub > 70) { this.lastSub = now; this.c.scape.updateSub(); for (const it of this.S.layout.items) if (it.on !== "decor") { it.y = this.c.scape.subH(it.x, it.z); this.c.scape.place(it); } }
  }
  tap(ray) {
    if (this.tab === "sub" && this.tool !== "none") return;
    if (this.armed) {
      const { t, k } = this.armed, epi = t === "plant" && PL[k].epi;
      const h = epi ? this.hitDecorOrSub(ray) : this.hitSub(ray);
      if (!h) return this.c.toast("请点在底床上");
      const S = this.S, key = t + ":" + k;
      if (S.storage[key] > 0) S.storage[key]--;
      else if (!this.c.A.spendStardust(this.cost(t, k))) return this.c.toast(`星尘不足 · 需要 ✦ ${this.cost(t, k)}`);
      else this.c.bumpDust();
      const it = { id: nid(), t, k, x: clamp(h.point.x, T.X0 + 0.2, T.X1 - 0.2), z: clamp(h.point.z, T.Z0 + 0.2, T.Z1 - 0.2), y: h.point.y - 0.02, s: t === "rock" ? 0.8 : 1, ry: Math.random() * 6.28, seed: Math.floor(Math.random() * 1e5), on: h.object === this.c.scape.sub ? "sub" : "decor" };
      if (t === "plant") it.g = 0.7;
      S.layout.items.push(it);
      this.c.scape.addMesh(it);
      this.changed = true; this.c.audio.place(); this.c.save(); this.render();
      return;
    }
    const all = [...this.c.scape.items.values()];
    const h = ray.intersectObjects(all, false)[0];
    this.select(h ? h.object : null);
  }
  select(m) {
    this.selM = m;
    $("#eSel").hidden = !m; this.ring.visible = !!m;
    if (!m) return;
    const it = m.userData.item;
    $("#eSelName").textContent = (it.t === "plant" ? PL[it.k] : DE[it.k]).name + " · 拖动可移动";
    $("#eRot").value = Math.round((((it.ry || 0) * 180) / Math.PI) % 360 + 360) % 360;
    $("#eScale").value = Math.round((it.s || 1) * 100);
    this.posRing(); this.c.audio.click();
  }
  posRing() {
    const m = this.selM; if (!m) return;
    const b = new THREE.Box3().setFromObject(m), s = b.getSize(new THREE.Vector3());
    const r = Math.max(0.25, Math.max(s.x, s.z) * 0.55);
    this.ring.scale.setScalar(r); this.ring.position.set(m.position.x, m.position.y + 0.03, m.position.z);
  }
  removeSel() {
    const it = this.selItem; if (!it) return;
    const S = this.S;
    S.layout.items = S.layout.items.filter((x) => x !== it);
    if (!it.free) S.storage[it.t + ":" + it.k] = (S.storage[it.t + ":" + it.k] | 0) + 1;
    this.c.scape.removeMesh(it.id); this.select(null); this.c.scape.refresh();
    this.c.toast(it.free ? "已移除" : "已收进收纳箱，随时可以免费放回"); this.changed = true; this.c.save(); this.render();
  }
  tick() { if (this.ring.visible) this.ring.material.opacity = 0.55 + 0.3 * Math.sin(performance.now() / 300); }
}
