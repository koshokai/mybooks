/* 星际竞速 · 输入：键盘 + 多点触控（左右半屏转向、漂移/加速按钮） */

const KEYMAP = {
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
  ArrowUp: 'up', KeyW: 'up', ArrowDown: 'brake', KeyS: 'brake',
  ShiftLeft: 'drift', ShiftRight: 'drift', Space: 'drift',
  KeyE: 'boost', Enter: 'boost', NumpadEnter: 'boost',
};

export class Input {
  constructor() {
    this.held = new Set();
    this.zone = new Map(); // pointerId -> 'left' | 'right'
    this.btn = { drift: 0, boost: 0 };
    this.driftTap = false;
    this.touchMode = false;
    this.enabled = false;
    this.handlers = {};
    window.addEventListener('keydown', (e) => this.key(e, true));
    window.addEventListener('keyup', (e) => this.key(e, false));
    window.addEventListener('blur', () => { this.held.clear(); this.zone.clear(); this.btn.drift = this.btn.boost = 0; });
  }

  on(name, fn) { this.handlers[name] = fn; }

  key(e, down) {
    const act = KEYMAP[e.code];
    if (down && !e.repeat) {
      if (e.code === 'Escape' || e.code === 'KeyP') { this.handlers.pause && this.handlers.pause(); }
      if (e.code === 'KeyM') { this.handlers.mute && this.handlers.mute(); }
      if (e.code === 'KeyC' || e.code === 'KeyV') { this.handlers.camera && this.handlers.camera(); }
    }
    if (!act) return;
    if (this.enabled) {
      e.preventDefault();
      if (down) this.touchMode = false;
    }
    if (down) {
      if (act === 'drift' && !this.held.has('drift')) this.driftTap = true;
      this.held.add(act);
    } else this.held.delete(act);
  }

  /** 绑定触屏：zoneEl 覆盖全屏，按钮单独处理 */
  bindTouch(zoneEl, driftEl, boostEl, onVisual) {
    const zoneOf = (x) => (x < window.innerWidth / 2 ? 'left' : 'right');
    const vis = () => onVisual && onVisual(this.touchSteerSides());
    zoneEl.addEventListener('pointerdown', (e) => {
      if (!this.enabled) return;
      e.preventDefault();
      this.touchMode = e.pointerType !== 'mouse';
      this.zone.set(e.pointerId, zoneOf(e.clientX));
      try { zoneEl.setPointerCapture(e.pointerId); } catch (_) {}
      vis();
    });
    zoneEl.addEventListener('pointermove', (e) => {
      if (!this.zone.has(e.pointerId)) return;
      const z = zoneOf(e.clientX);
      if (z !== this.zone.get(e.pointerId)) { this.zone.set(e.pointerId, z); vis(); }
    });
    const up = (e) => { if (this.zone.delete(e.pointerId)) vis(); };
    zoneEl.addEventListener('pointerup', up);
    zoneEl.addEventListener('pointercancel', up);
    zoneEl.addEventListener('lostpointercapture', up);
    const bindBtn = (el, name) => {
      const ids = new Set();
      el.addEventListener('pointerdown', (e) => {
        if (!this.enabled) return;
        e.preventDefault(); e.stopPropagation();
        this.touchMode = e.pointerType !== 'mouse';
        ids.add(e.pointerId); this.btn[name] = ids.size;
        if (name === 'drift') this.driftTap = true;
        el.classList.add('on');
        try { el.setPointerCapture(e.pointerId); } catch (_) {}
      });
      const rel = (e) => { if (ids.delete(e.pointerId)) { this.btn[name] = ids.size; if (!ids.size) el.classList.remove('on'); } };
      el.addEventListener('pointerup', rel);
      el.addEventListener('pointercancel', rel);
      el.addEventListener('lostpointercapture', rel);
      el.addEventListener('contextmenu', (e) => e.preventDefault());
    };
    bindBtn(driftEl, 'drift');
    bindBtn(boostEl, 'boost');
  }

  touchSteerSides() {
    let l = false, r = false;
    for (const z of this.zone.values()) { if (z === 'left') l = true; else r = true; }
    return { l, r };
  }

  reset() { this.held.clear(); this.zone.clear(); this.btn.drift = this.btn.boost = 0; this.driftTap = false; }

  /** 写入赛车输入（左正右负） */
  apply(inp) {
    const t = this.touchSteerSides();
    const left = this.held.has('left') || t.l;
    const right = this.held.has('right') || t.r;
    inp.steer = (left ? 1 : 0) - (right ? 1 : 0);
    inp.drift = this.held.has('drift') || this.btn.drift > 0;
    inp.latch = this.touchMode;
    if (this.driftTap) { inp.driftTap = true; this.driftTap = false; }
    inp.boost = this.held.has('boost') || this.btn.boost > 0;
    inp.brake = this.held.has('brake');
    inp.throttle = 1;
  }
}
