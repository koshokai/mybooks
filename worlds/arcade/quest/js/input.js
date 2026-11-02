/* 远征 · 输入：键盘、鼠标、触屏虚拟摇杆 */
(function () {
  'use strict';
  const Q = window.Q;
  const IN = (Q.input = {
    mx: 0, my: 0, keys: Object.create(null), mouseX: 0, mouseY: 0, hasMouse: false, touch: false,
    joy: { active: false, id: -1, ox: 0, oy: 0, x: 0, y: 0, vx: 0, vy: 0 },
    dashQ: false, skillQ: false,
  });
  const JR = 56;
  const MOVE = { KeyW: [0, -1], KeyS: [0, 1], KeyA: [-1, 0], KeyD: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };

  function setTouch(on) {
    IN.touch = on;
    document.body.classList.toggle('touch', on);
    if (Q.G) Q.G.autoAim = on || Q.save.settings.autoAim;
  }
  IN.setTouch = setTouch;

  IN.init = () => {
    const coarse = window.matchMedia && window.matchMedia('(hover: none) and (pointer: coarse)').matches;
    if (coarse) setTouch(true);
    window.addEventListener('keydown', (e) => {
      if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
      Q.audio.init();
      const c = e.code;
      if (MOVE[c] || c === 'Space') e.preventDefault();
      if (IN.keys[c]) { return; }
      IN.keys[c] = true;
      if (IN.touch && (MOVE[c] || c === 'Space')) setTouch(false);
      const st = Q.G.state;
      if (st === 'level') {
        const n = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3, Numpad1: 0, Numpad2: 1, Numpad3: 2, Numpad4: 3 }[c];
        if (n != null) { Q.ui.pickCard(n); return; }
        if (c === 'KeyR') { Q.game.reroll(); return; }
        return;
      }
      if (st === 'play') {
        if (c === 'Space') IN.dashQ = true;
        else if (c === 'KeyQ' || c === 'KeyE' || c === 'KeyK') IN.skillQ = true;
        else if (c === 'Escape' || c === 'KeyP') Q.ui.pause();
        else if (c === 'KeyF') Q.ui.toggleAim();
        else if (c === 'KeyL' && e.shiftKey) Q.ui.toggleSetting('numbers');
      } else if (st === 'pause') {
        if (c === 'Escape' || c === 'KeyP') Q.ui.resume();
      } else if (c === 'Escape') Q.ui.escape();
      if (c === 'KeyM') Q.ui.toggleSetting('sfx');
    }, { passive: false });
    window.addEventListener('keyup', (e) => { IN.keys[e.code] = false; });
    window.addEventListener('blur', () => { for (const k in IN.keys) IN.keys[k] = false; IN.joy.active = false; });

    const cv = document.getElementById('cv');
    window.addEventListener('mousemove', (e) => { IN.mouseX = e.clientX; IN.mouseY = e.clientY; if (!IN.touch) IN.hasMouse = true; });
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
    cv.addEventListener('mousedown', (e) => {
      Q.audio.init();
      if (e.button === 2 && Q.G.state === 'play') { IN.skillQ = true; e.preventDefault(); }
    });

    cv.addEventListener('pointerdown', (e) => {
      Q.audio.init();
      if (e.pointerType === 'mouse') return;
      if (!IN.touch) setTouch(true);
      if (Q.G.state !== 'play') return;
      if (IN.joy.active) return;
      const J = IN.joy;
      J.active = true; J.id = e.pointerId; J.ox = e.clientX; J.oy = e.clientY; J.x = e.clientX; J.y = e.clientY; J.vx = 0; J.vy = 0;
      try { cv.setPointerCapture(e.pointerId); } catch (x) { /* 忽略 */ }
      e.preventDefault();
    }, { passive: false });
    const move = (e) => {
      const J = IN.joy;
      if (!J.active || e.pointerId !== J.id) return;
      let dx = e.clientX - J.ox, dy = e.clientY - J.oy;
      const d = Math.hypot(dx, dy);
      if (d > JR * 1.4) { const f = (d - JR * 1.4) / d; J.ox += dx * f; J.oy += dy * f; dx = e.clientX - J.ox; dy = e.clientY - J.oy; }
      const dd = Math.hypot(dx, dy);
      const cl = Math.min(dd, JR);
      J.x = J.ox + (dd ? (dx / dd) * cl : 0); J.y = J.oy + (dd ? (dy / dd) * cl : 0);
      const mag = Math.min(1, Math.max(0, (dd - 6) / (JR * 0.55)));
      J.vx = dd ? (dx / dd) * mag : 0; J.vy = dd ? (dy / dd) * mag : 0;
      e.preventDefault();
    };
    const up = (e) => {
      const J = IN.joy;
      if (J.active && e.pointerId === J.id) { J.active = false; J.vx = J.vy = 0; }
    };
    cv.addEventListener('pointermove', move, { passive: false });
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', up);
    document.addEventListener('gesturestart', (e) => e.preventDefault());
  };

  IN.update = () => {
    if (Q.G.bot) return;
    let x = 0, y = 0;
    for (const c in MOVE) if (IN.keys[c]) { x += MOVE[c][0]; y += MOVE[c][1]; }
    if (x || y) { const m = Math.hypot(x, y); IN.mx = x / m; IN.my = y / m; }
    else if (IN.joy.active) { IN.mx = IN.joy.vx; IN.my = IN.joy.vy; }
    else { IN.mx = 0; IN.my = 0; }
  };
})();
