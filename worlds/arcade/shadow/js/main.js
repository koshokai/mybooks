/* =========================================================
   影 · 暗域 —— 界面、输入、主循环与进度
   ========================================================= */
(function () {
  'use strict';
  const U = window.Umbra, R = U.Render, A = U.Audio;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const clamp = U.clamp;
  const store = U.store.load();
  const AR = window.WXArcade || null;
  const arc = (fn, ...a) => { try { return AR && typeof AR[fn] === 'function' ? AR[fn](...a) : null; } catch (e) { return null; } };
  const GID = 'shadow';
  const QS = new URLSearchParams(location.search);

  const cv = $('#cv');
  const coarse = !!(window.matchMedia && matchMedia('(pointer: coarse)').matches);
  let touchMode = coarse || QS.get('touch') === '1';
  R.init(cv, touchMode);
  document.body.classList.toggle('touch', touchMode);

  let mode = 'title';
  let paused = false;
  let game = null, attract = null;
  let diff = store.diff && U.DIFF[store.diff] ? store.diff : 'normal';
  let run = null;
  const fx = { hurt: 0, cracks: null, crackLvl: 0, glitch: 0, beat: 0, beatT: 0, endFade: 0 };
  let acc = 0, lastTs = 0, hold = false, still = 0;

  /* ---------------- 输入 ---------------- */
  const keys = Object.create(null);
  const inp = { mx: 0, my: 0, sprint: false, interact: false, interactP: false, flareP: false, scanP: false, torchP: false, aim: null, aimDist: null, autoAim: false };
  const dbg = { input: null };
  const mouse = { x: 0, y: 0, has: false };
  const touch = { stickId: null, sx: 0, sy: 0, vx: 0, vy: 0, aimId: null, ax: 0, ay: 0, aim: null, act: false, run: false };

  function gesture() {
    A.init();
    A.setMuted(!!store.muted);
  }
  window.addEventListener('pointerdown', gesture, { capture: true });
  window.addEventListener('keydown', gesture, { capture: true });

  const KEYMAP = { KeyW: 'u', ArrowUp: 'u', KeyS: 'd', ArrowDown: 'd', KeyA: 'l', ArrowLeft: 'l', KeyD: 'r', ArrowRight: 'r' };
  window.addEventListener('keydown', e => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    const k = e.code;
    if (touchMode && !e.repeat && (KEYMAP[k] || k === 'KeyE')) setTouchMode(false);
    if (mode === 'play') {
      if (k === 'Escape' || k === 'KeyP') { e.preventDefault(); paused ? resume() : pause(); return; }
      if (paused) return;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(k)) e.preventDefault();
      if (!e.repeat) {
        if (k === 'KeyE' || k === 'Space' || k === 'Enter') inp.interactP = true;
        if (k === 'KeyQ') inp.flareP = true;
        if (k === 'KeyF') inp.scanP = true;
        if (k === 'KeyR') inp.torchP = true;
        if (k === 'KeyM') toggleMini();
      }
      keys[k] = true;
    } else if (mode === 'title') {
      if (k === 'Enter' && !anyModal()) { e.preventDefault(); startRun({ diff }); }
    } else if (mode === 'result') {
      if (k === 'Enter') { e.preventDefault(); startRun({ diff: run ? run.diff : diff }); }
    }
    if (k === 'Escape') closeModals();
  });
  window.addEventListener('keyup', e => { keys[e.code] = false; });
  window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; if (mode === 'play' && !paused && game && !game.ending) pause(); });
  // 鼠标：在窗口层面监听（触屏层盖在画布上时也能收到）
  let mouseMoves = 0;
  window.addEventListener('pointermove', e => {
    if (e.pointerType !== 'mouse') return;
    mouse.x = e.clientX; mouse.y = e.clientY; mouse.has = true;
    if (touchMode && ++mouseMoves > 6) setTouchMode(false);
  });
  window.addEventListener('pointerdown', e => { if (e.pointerType === 'mouse' && touchMode && mode === 'play' && !e.target.closest('.modal,.hud')) setTouchMode(false); });
  cv.addEventListener('contextmenu', e => { e.preventDefault(); if (mode === 'play' && !paused) inp.torchP = true; });
  cv.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse') {
      if (touchMode) setTouchMode(false);
      mouse.x = e.clientX; mouse.y = e.clientY; mouse.has = true;
    }
  });

  function setTouchMode(on) {
    if (touchMode === on) return;
    touchMode = on;
    R.mobile = on;
    document.body.classList.toggle('touch', on);
  }

  // 触屏：左侧摇杆 + 右侧拖动瞄准 + 按钮
  const tz = $('#touch');
  const stickEl = $('#stick'), knob = $('.stick-knob'), base = $('.stick-base');
  const STICK_R = 54;
  tz.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse') return;
    mouseMoves = 0;
    setTouchMode(true);
    const btn = e.target.closest('.tbtn');
    if (btn) return;
    e.preventDefault();
    if (e.clientX < window.innerWidth * 0.5 && touch.stickId == null) {
      touch.stickId = e.pointerId;
      touch.sx = e.clientX; touch.sy = e.clientY; touch.vx = 0; touch.vy = 0;
      stickEl.classList.add('on');
      stickEl.style.transform = 'translate(' + (e.clientX - 70) + 'px,' + (e.clientY - 70) + 'px)';
      knob.style.transform = 'translate(0px,0px)';
    } else if (touch.aimId == null) {
      touch.aimId = e.pointerId;
      touch.ax = e.clientX; touch.ay = e.clientY;
    }
    try { tz.setPointerCapture(e.pointerId); } catch (x) { /* noop */ }
  });
  tz.addEventListener('pointermove', e => {
    if (e.pointerId === touch.stickId) {
      let dx = e.clientX - touch.sx, dy = e.clientY - touch.sy;
      const d = Math.hypot(dx, dy);
      if (d > STICK_R) {
        // 摇杆跟随手指
        const k = (d - STICK_R) / d;
        touch.sx += dx * k; touch.sy += dy * k;
        dx = e.clientX - touch.sx; dy = e.clientY - touch.sy;
        stickEl.style.transform = 'translate(' + (touch.sx - 70) + 'px,' + (touch.sy - 70) + 'px)';
      }
      const m = Math.hypot(dx, dy);
      const dead = 8;
      const mag = m < dead ? 0 : clamp((m - dead) / (STICK_R - dead), 0, 1);
      touch.vx = m > 0 ? (dx / m) * mag : 0;
      touch.vy = m > 0 ? (dy / m) * mag : 0;
      knob.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
    } else if (e.pointerId === touch.aimId) {
      const dx = e.clientX - touch.ax, dy = e.clientY - touch.ay;
      if (Math.hypot(dx, dy) > 14) touch.aim = Math.atan2(dy, dx);
    }
  });
  const endTouch = e => {
    if (e.pointerId === touch.stickId) {
      touch.stickId = null; touch.vx = 0; touch.vy = 0;
      stickEl.classList.remove('on');
      knob.style.transform = 'translate(0px,0px)';
    }
    if (e.pointerId === touch.aimId) { touch.aimId = null; touch.aimHold = touch.aim; touch.aim = null; }
  };
  tz.addEventListener('pointerup', endTouch);
  tz.addEventListener('pointercancel', endTouch);

  function bindBtn(id, down, up) {
    const el = $(id);
    el.addEventListener('pointerdown', e => {
      e.preventDefault();
      e.stopPropagation();
      setTouchMode(true);
      gesture();
      el.classList.add('down');
      try { el.setPointerCapture(e.pointerId); } catch (x) { /* noop */ }
      down();
    });
    const u = e => { el.classList.remove('down'); if (up) up(); };
    el.addEventListener('pointerup', u);
    el.addEventListener('pointercancel', u);
    el.addEventListener('contextmenu', e => e.preventDefault());
  }
  bindBtn('#b-act', () => { touch.act = true; inp.interactP = true; }, () => { touch.act = false; });
  bindBtn('#b-run', () => { touch.run = true; }, () => { touch.run = false; });
  bindBtn('#b-flare', () => { inp.flareP = true; });
  bindBtn('#b-scan', () => { inp.scanP = true; });
  bindBtn('#b-torch', () => { inp.torchP = true; });

  function gatherInput() {
    const p = game ? game.player : null;
    let mx = 0, my = 0;
    if (keys.KeyW || keys.ArrowUp) my -= 1;
    if (keys.KeyS || keys.ArrowDown) my += 1;
    if (keys.KeyA || keys.ArrowLeft) mx -= 1;
    if (keys.KeyD || keys.ArrowRight) mx += 1;
    if (mx || my) { const l = Math.hypot(mx, my); mx /= l; my /= l; }
    if (touchMode && (touch.vx || touch.vy)) { mx = touch.vx; my = touch.vy; }
    inp.mx = mx; inp.my = my;
    inp.sprint = !!(keys.ShiftLeft || keys.ShiftRight) || touch.run;
    inp.interact = !!(keys.KeyE || keys.Space || keys.Enter) || touch.act;
    inp.autoAim = touchMode;
    inp.aim = null; inp.aimDist = null;
    if (p) {
      if (touchMode) {
        if (touch.aim != null) inp.aim = touch.aim;
        else if (touch.aimHold != null) {
          if (Math.hypot(mx, my) > 0.3) touch.aimHold = null; else inp.aim = touch.aimHold;
        }
      } else if (mouse.has) {
        const w = R.screenToWorld(mouse.x, mouse.y);
        inp.aim = Math.atan2(w.y - p.y, w.x - p.x);
        inp.aimDist = Math.hypot(w.x - p.x, w.y - p.y);
      }
    }
    if (dbg.input) Object.assign(inp, dbg.input);
  }
  function clearEdges() { inp.interactP = inp.flareP = inp.scanP = inp.torchP = false; }

  /* ---------------- 界面元素 ---------------- */
  const el = {
    title: $('#scr-title'), hud: $('#hud'), tray: $('#tray'), prompt: $('#prompt'), calib: $('#calib'), calibCv: $('#calib-cv'),
    toast: $('#toast'), hint: $('#hint'), achPop: $('#ach-pop'), vent: $('#vent-ov'), fade: $('#fade'), intro: $('#intro'),
    obj: $('#obj'), pips: $('#pips'), eye: $('#eye'), eyeTxt: $('#eye-txt'), lid: $('#eye-lid'), visor: $('#visor'),
    mini: $('#mini'), flareN: $('#flare-n'), scanCd: $('#scan-cd'), torchT: $('#tool-torch'),
    bAct: $('#b-act span'), bFlare: $('#b-flare b'), bScan: $('#b-scan'), bTorch: $('#b-torch'),
  };

  function showScreen(name) {
    el.title.classList.toggle('show', name === 'title');
    document.body.classList.toggle('in-game', name === 'play');
  }
  function anyModal() { return !!$('.modal.show'); }
  function openModal(id) { $$('.modal').forEach(m => m.classList.toggle('show', m.id === id)); }
  function closeModals() {
    if (mode === 'play' && paused) return; // 暂停菜单只能用「继续」关闭
    $$('.modal').forEach(m => { if (m.id !== 'm-result') m.classList.remove('show'); });
  }

  let toastQ = [], toastBusy = false;
  function toast(text, kind, dur) {
    toastQ.push({ text, kind: kind || '', dur: dur || 2.2 });
    if (toastQ.length > 4) toastQ.shift();
    if (!toastBusy) nextToast();
  }
  function nextToast() {
    const t = toastQ.shift();
    if (!t) { toastBusy = false; return; }
    toastBusy = true;
    el.toast.className = 'toast show ' + t.kind;
    el.toast.innerHTML = t.text;
    setTimeout(() => { el.toast.classList.remove('show'); setTimeout(nextToast, 260); }, t.dur * 1000);
  }

  let hintQ = [], hintBusy = false, hintTimer = 0;
  const tut = store.tut && typeof store.tut === 'object' ? store.tut : (store.tut = {});
  function hint(key, text, dur) {
    if (tut[key] || !game || game.attract) return;
    tut[key] = 1;
    U.store.save();
    hintQ.push({ text, dur: dur || 6 });
    if (!hintBusy) nextHint();
  }
  function nextHint() {
    const h = hintQ.shift();
    if (!h) { hintBusy = false; el.hint.classList.remove('show'); return; }
    hintBusy = true;
    el.hint.innerHTML = h.text;
    el.hint.classList.add('show');
    hintTimer = h.dur;
  }
  el.hint.addEventListener('click', () => { hintTimer = 0; });

  let achQ = [], achBusy = false;
  function achieve(id) {
    const a = U.ACH.find(x => x.id === id);
    if (!a) return false;
    const first = arc('unlock', GID + ':' + id, a.name) === true;
    if (!first) return false;
    achQ.push(a.name);
    if (!achBusy) nextAch();
    return true;
  }
  function nextAch() {
    const n = achQ.shift();
    if (!n) { achBusy = false; return; }
    achBusy = true;
    el.achPop.innerHTML = '<span class="ic">✦</span><span><small>成就解锁</small><b>' + n + '</b></span>';
    el.achPop.classList.add('show');
    A.play('ach');
    setTimeout(() => { el.achPop.classList.remove('show'); setTimeout(nextAch, 400); }, 2600);
  }
  function unlockedSet() {
    const list = arc('achievements') || [];
    const s = new Set();
    list.forEach(a => { if (a && typeof a.id === 'string' && a.id.indexOf(GID + ':') === 0) s.add(a.id.slice(GID.length + 1)); });
    return s;
  }

  /* ---------------- 标题 ---------------- */
  function refreshTitle() {
    $$('.diff button').forEach(b => {
      const on = b.dataset.diff === diff;
      b.classList.toggle('on', on);
      b.setAttribute('aria-checked', on ? 'true' : 'false');
    });
    $('#diff-desc').textContent = U.DIFF[diff].desc;
    const dust = arc('getStardust');
    $('#t-dust').innerHTML = dust == null ? '' : '<span class="dust-ic">✦</span> 星尘 <b>' + dust + '</b>';
    const best = arc('getBest', GID + ':' + diff);
    $('#t-best').innerHTML = best != null ? '最佳 · ' + U.DIFF[diff].name + ' <b>' + U.fmtTime(best) + '</b>' : '<span class="dim">' + U.DIFF[diff].name + '难度尚未逃脱</span>';
    $('#daily-date').textContent = U.todayCN();
    const db = store.daily[U.todayStr()];
    $('#daily-best').textContent = db ? '今日最佳 ' + U.fmtTime(db) : '';
    const s = unlockedSet();
    $('#ach-count').textContent = s.size + '/' + U.ACH.length;
  }
  if (AR && AR.on) AR.on('change', () => { if (mode === 'title') refreshTitle(); });
  $$('.diff button').forEach(b => b.addEventListener('click', () => {
    diff = b.dataset.diff;
    store.diff = diff;
    U.store.save();
    A.play('ui');
    refreshTitle();
  }));
  $('#btn-start').addEventListener('click', () => { A.play('ui'); startRun({ diff }); });
  $('#btn-daily').addEventListener('click', () => { A.play('ui'); startRun({ diff: 'normal', daily: true }); });
  $('#btn-howto').addEventListener('click', () => { A.play('ui'); openModal('m-howto'); });
  $('#btn-ach').addEventListener('click', () => { A.play('ui'); buildAchList(); openModal('m-ach'); });
  $$('[data-close]').forEach(b => b.addEventListener('click', () => { A.play('uiBack'); b.closest('.modal').classList.remove('show'); }));
  $('#btn-tut-reset').addEventListener('click', () => {
    for (const k in tut) delete tut[k];
    U.store.save();
    $('#btn-tut-reset').textContent = '新手提示已重新开启';
  });
  function buildAchList() {
    const s = unlockedSet();
    $('#ach-list').innerHTML = U.ACH.map(a => '<li class="' + (s.has(a.id) ? 'got' : '') + '"><span class="ic">' + (s.has(a.id) ? '✦' : '◇') + '</span><span><b>' + a.name + '</b><small>' + a.desc + '</small></span></li>').join('');
  }

  // 声音开关
  function setMuted(m) {
    store.muted = !!m;
    U.store.save();
    A.setMuted(store.muted);
    document.body.classList.toggle('muted', store.muted);
  }
  $$('.snd-btn').forEach(b => b.addEventListener('click', () => { gesture(); setMuted(!store.muted); A.play('ui'); }));
  document.body.classList.toggle('muted', !!store.muted);

  /* ---------------- 一局 ---------------- */
  function newSeed() { return (Math.random() * 4294967295) >>> 0; }

  function startRun(opts) {
    gesture();
    const d = U.DIFF[opts.diff] ? opts.diff : 'normal';
    const seed = opts.daily ? U.hashStr('umbra-daily-' + U.todayStr()) : opts.seed != null ? opts.seed >>> 0 : newSeed();
    run = { diff: d, seed, daily: !!opts.daily, t0: performance.now() };
    game = new U.Game({ seed, diff: d, daily: !!opts.daily });
    window.__game = game;
    mode = 'play';
    paused = false;
    acc = 0;
    fx.hurt = 0; fx.cracks = null; fx.crackLvl = 0; fx.glitch = 0; fx.endFade = 0;
    toastQ = []; hintQ = []; hintBusy = false; el.hint.classList.remove('show');
    $$('.modal').forEach(m => m.classList.remove('show'));
    showScreen('play');
    R.camInit = false;
    R.chunks.clear();
    A.resetRun();
    A.setAmbience(0.9, 1.2);
    A.play('intro');
    store.runs = (store.runs | 0) + 1;
    U.store.save();
    // 开场
    el.fade.style.transition = 'none';
    el.fade.style.opacity = '1';
    el.fade.offsetWidth;
    el.fade.style.transition = 'opacity 1.4s ease';
    el.fade.style.opacity = '0';
    const D = U.DIFF[d];
    $('#intro-a').textContent = (run.daily ? '每日站点 · ' + U.todayCN() : '暗域站 · 站点 #' + U.seedCode(seed)) + ' · ' + D.name;
    $('#intro-b').textContent = '恢复 ' + game.map.relays.length + ' 座信标';
    $('#intro-c').textContent = '然后乘逃生舱离开。别让它看见你。';
    el.intro.classList.remove('show');
    el.intro.offsetWidth;
    el.intro.classList.add('show');
    clearTimeout(startRun._t);
    startRun._t = setTimeout(() => el.intro.classList.remove('show'), 3400);
    buildPips();
    lastHud = {};
    if (opts.skipIntro) { el.intro.classList.remove('show'); el.fade.style.opacity = '0'; }
  }

  function pause() {
    if (mode !== 'play' || paused || (game && game.ending)) return;
    paused = true;
    $('#pause-sub').textContent = (run.daily ? '每日站点' : '站点 #' + U.seedCode(run.seed)) + ' · ' + U.DIFF[run.diff].name + ' · 信标 ' + game.relaysDone + '/' + game.map.relays.length + ' · ' + U.fmtTime(game.t * 1000);
    openModal('m-pause');
    A.setAmbience(0.25, 0.3);
  }
  function resume() {
    if (!paused) return;
    paused = false;
    $('#m-pause').classList.remove('show');
    A.setAmbience(0.9, 0.3);
    lastTs = 0;
  }
  function toTitle() {
    mode = 'title';
    paused = false;
    game = null;
    $$('.modal').forEach(m => m.classList.remove('show'));
    showScreen('title');
    el.fade.style.transition = 'opacity .6s ease';
    el.fade.style.opacity = '0';
    el.calib.classList.remove('show');
    el.prompt.classList.remove('show');
    el.vent.classList.remove('show');
    A.setAmbience(0.5, 0.8);
    R.camInit = false;
    refreshTitle();
  }
  $$('[data-act]').forEach(b => b.addEventListener('click', () => {
    const a = b.dataset.act;
    A.play('ui');
    if (a === 'resume') resume();
    else if (a === 'retry') startRun({ diff: run.diff, daily: run.daily, seed: run.seed });
    else if (a === 'new') startRun({ diff: run ? run.diff : diff, daily: false });
    else if (a === 'title') toTitle();
    else if (a === 'howto') openModal('m-howto');
  }));
  $('#btn-pause').addEventListener('click', () => { A.play('ui'); pause(); });

  /* ---------------- 事件 → 声音 / 画面 / 提示 ---------------- */
  const lastEvt = {};
  function handleEvents(g) {
    const p = g.player, w = g.warden;
    for (const e of g.events) {
      switch (e.type) {
        case 'step': A.play('step', e); break;
        case 'wstep': {
          A.play('wstep', e);
          const d = Math.hypot(e.x - p.x, e.y - p.y);
          if (d < 7) R.shake = Math.max(R.shake, (1 - d / 7) * (e.chase ? 0.6 : 0.42));
          break;
        }
        case 'door': if (e.open || Math.hypot(e.d.x - p.x, e.d.y - p.y) < 6) A.play('door', e); break;
        case 'locker': A.play('locker', e); if (e.enter) hint('hidden', touchMode ? '你躲进了储物柜。点「离开」出来。' : '你躲进了储物柜。按 <kbd>E</kbd> 出来。', 4); break;
        case 'vent': A.play('vent', e); break;
        case 'ventOut': A.play('ventOut', e); break;
        case 'calibStart':
          A.play('calibStart');
          hint('calib', touchMode ? '相位漂移！<b>两道波形重合的瞬间</b>，再点一次「互动」。失败会爆出火花，把它引来。' : '相位漂移！<b>两道波形重合的瞬间</b>，再按一次 <kbd>E</kbd>。失败会爆出火花，把它引来。', 7);
          break;
        case 'calibOk': A.play('calibOk'); toast('相位锁定', 'ok', 1.2); break;
        case 'calibCancel': break;
        case 'spark': A.play('spark', e); R.shake = Math.max(R.shake, 0.55); toast('火花四溅——它可能听见了', 'bad', 2); break;
        case 'relayDone': {
          A.play('relayDone');
          const left = e.total - e.n;
          toast(left > 0 ? '信标已恢复 <b>' + e.n + '/' + e.total + '</b>' : '全部信标已恢复', 'ok', 2.4);
          buildPips();
          break;
        }
        case 'relaySeen': A.play('relaySeen'); break;
        case 'podUnlock':
          A.play('podUnlock');
          toast('逃生舱已解锁 · 警报响起', 'big', 3.2);
          hint('pod', '所有信标都亮了！警报惊动了它——跟随<b class="g">绿色箭头</b>赶到逃生舱。', 6);
          break;
        case 'chaseStart':
          A.play('notice');
          R.shake = Math.max(R.shake, 0.5);
          hint('chase', touchMode ? '被发现了！按住「冲刺」，借拐角和门甩开它的视线，或者躲进储物柜。' : '被发现了！按住 <kbd>Shift</kbd> 冲刺，借拐角和门甩开它的视线，或者躲进储物柜。', 6);
          break;
        case 'chaseEnd': break;
        case 'windup': A.play('windup', e); break;
        case 'lunge': A.play('lunge', e); R.shake = Math.max(R.shake, 0.35); break;
        case 'lungeMiss': A.play('lungeMiss'); break;
        case 'hit':
          A.play('hit');
          fx.hurt = 1;
          R.shake = Math.max(R.shake, 1);
          fx.crackLvl = 1;
          fx.cracks = R.makeCracks(1, (run.seed ^ 77) >>> 0);
          toast('面罩破裂！再被抓到一次就完了', 'bad', 2.6);
          break;
        case 'rip': A.play('rip'); break;
        case 'caught':
          A.play('caught');
          fx.hurt = 1;
          R.shake = 1.2;
          fx.crackLvl = 2;
          fx.cracks = R.makeCracks(2, (run.seed ^ 99) >>> 0);
          break;
        case 'win': A.play('win'); break;
        case 'flareThrow': A.play('flareThrow'); break;
        case 'flareIgnite': A.play('flareIgnite', e); break;
        case 'stun':
          A.play('stun');
          toast('守夜者被强光致盲', 'ok', 2);
          if (!g.daily || true) achieve('flare');
          break;
        case 'scan':
          A.play('scan');
          if (e.warden) { A.play('scanWarden'); toast('扫描：附近有它的信号', 'bad', 2); }
          break;
        case 'torch': A.play('torch'); break;
        case 'heard':
          if (Math.hypot(e.x - p.x, e.y - p.y) < 4 && (!lastEvt.heard || g.t - lastEvt.heard > 4)) {
            lastEvt.heard = g.t;
            A.play('heard', e);
            fx.heardT = 1.6;
          }
          break;
        case 'giveUp': A.play('giveUp'); toast('它放弃了搜寻', '', 1.8); break;
        case 'sniff': A.play('sniff'); break;
        case 'closeCall': {
          A.play('closeCall');
          const name = e.kind === 'dodge' ? '险些被扑中' : e.kind === 'escape' ? '甩掉了它' : '屏住了呼吸';
          toast('惊险时刻 +1 · ' + name, 'cc', 1.8);
          break;
        }
        case 'exhausted': A.play('exhausted'); break;
        case 'zap': A.play('zap', e); break;
      }
    }
    g.events.length = 0;
  }

  /* ---------------- 新手提示（情境触发） ---------------- */
  function tutorial(g) {
    const p = g.player, w = g.warden;
    if (g.t > 1.2) hint('move', touchMode ? '左下拖动<b>摇杆</b>移动，手电跟着你走的方向；在右侧空白处拖动可以单独瞄准。' : '<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> 移动，<b>鼠标</b>控制手电方向。', 6);
    if (g.t > 8 && !g.map.relays.some(r => r.known)) hint('scan', touchMode ? '点「扫描」可以显示信标的位置——但扫描声会被它听见。' : '按 <kbd>F</kbd> 扫描，可以显示信标的位置——但扫描声会被它听见。', 6);
    if (p.ctx && p.ctx.kind === 'relay') hint('relay', touchMode ? '<b>按住「互动」</b>修复信标。修复时会发出嗡嗡声。' : '<b>按住</b> <kbd>E</kbd> 修复信标。修复时会发出嗡嗡声。', 6);
    if (p.ctx && p.ctx.kind === 'locker' && g.t > 4) hint('locker', touchMode ? '点「互动」躲进储物柜——只要它<b>没看见你进去</b>，就找不到你。' : '按 <kbd>E</kbd> 躲进储物柜——只要它<b>没看见你进去</b>，就找不到你。', 6);
    if (p.ctx && p.ctx.kind === 'vent') hint('vent', touchMode ? '点「互动」钻进通风管，从另一头钻出来。' : '按 <kbd>E</kbd> 钻进通风管，会从另一头钻出来。', 5);
    if (w.state !== 'chase' && w.susp > 0.3 && !p.hidden) hint('notice', '上方的<b>眼睛</b>正在睁开：它注意到你了。离开它的光束，或者关掉手电。', 6);
    if (w.state === 'chase' && p.flares > 0 && g.wDist < 6.5 && g.t - g.ccT > 1) hint('flare', touchMode ? '点「照明弹」——会自动扔向它，强光能让它短暂失明。' : '按 <kbd>Q</kbd> 朝鼠标方向扔照明弹，强光能让它短暂失明。', 5);
    if (g.t > 45 && w.state !== 'chase') hint('torch', touchMode ? '「手电」可以开关。关掉更难被发现，但你也几乎看不见。' : '<kbd>R</kbd> 或右键开关手电。关掉更难被发现，但你也几乎看不见。', 6);
  }

  /* ---------------- HUD ---------------- */
  let lastHud = {};
  function buildPips() {
    if (!game) return;
    el.pips.innerHTML = game.map.relays.map(r => '<i class="' + (r.done ? 'on' : '') + '"></i>').join('');
  }
  function setText(node, key, val) { if (lastHud[key] !== val) { lastHud[key] = val; node.innerHTML = val; } }
  function setClass(node, key, cls, on) { const k = key + cls; if (lastHud[k] !== on) { lastHud[k] = on; node.classList.toggle(cls, on); } }
  let miniT = 0, miniOn = store.mini !== false;
  function toggleMini() { miniOn = !miniOn; store.mini = miniOn; U.store.save(); el.mini.classList.toggle('off', !miniOn); }
  el.mini.classList.toggle('off', !miniOn);
  el.mini.addEventListener('click', () => toggleMini());

  function updateHUD(g, dt, now) {
    const p = g.player, w = g.warden, M = g.map;
    // 目标
    const total = M.relays.length;
    setText(el.obj, 'obj', g.podUnlocked ? '<b class="g">前往逃生舱</b>' : '修复信标 <b>' + g.relaysDone + '/' + total + '</b>');
    // 面罩
    setText(el.visor, 'visor', '<i class="' + (p.hp >= 1 ? 'on' : '') + '"></i><i class="' + (p.hp >= 2 ? 'on' : '') + '"></i>');
    // 眼睛
    const chase = w.state === 'chase' || w.state === 'openLocker' || w.state === 'recover';
    const open = chase ? 1 : w.state === 'stunned' ? 0 : clamp(w.susp, 0, 1);
    const st = w.state === 'stunned' ? 'stun' : chase ? 'chase' : w.state === 'search' ? 'search' : w.susp > 0.4 || (w.state === 'investigate' && w.urgency > 0.6) ? 'alert' : 'calm';
    let label = { stun: '致盲', chase: '追逐中', search: '搜寻中', alert: '警觉', calm: '' }[st];
    if (p.hidden && !p.hidden.attract && g.wDist < 4 && !chase) label = '屏住呼吸';
    if (fx.heardT > 0 && st !== 'chase') label = '它听见了';
    setText(el.eyeTxt, 'eyet', label);
    const lidY = 12 - open * 9;
    if (Math.abs((lastHud.lid || 0) - lidY) > 0.2) { lastHud.lid = lidY; el.lid.setAttribute('d', 'M2 12 Q16 ' + (lidY * 2 - 12) + ' 30 12 Q16 ' + (24 - (lidY * 2 - 12)) + ' 2 12Z'); }
    if (lastHud.eyeSt !== st) { el.eye.className = 'eye ' + st; lastHud.eyeSt = st; }
    // 道具
    setText(el.flareN, 'fl', String(p.flares));
    setText(el.bFlare, 'fl2', String(p.flares));
    const cdk = p.scanCd > 0 ? p.scanCd / g.D.scanCd : 0;
    if (Math.abs((lastHud.cd || 0) - cdk) > 0.01 || (cdk === 0 && lastHud.cd !== 0)) {
      lastHud.cd = cdk;
      el.scanCd.style.setProperty('--cd', cdk.toFixed(3));
      el.bScan.style.setProperty('--cd', cdk.toFixed(3));
      el.bScan.classList.toggle('cool', cdk > 0);
      $('#tool-scan').classList.toggle('cool', cdk > 0);
    }
    setClass($('#tool-flare'), 'tf', 'empty', p.flares <= 0);
    setClass($('#b-flare'), 'bf', 'empty', p.flares <= 0);
    setClass(el.torchT, 'tt', 'off', !p.torch && !p.hidden);
    setClass(el.bTorch, 'bt', 'off', !p.torch && !p.hidden);
    // 互动按钮 / 提示
    const c = p.ctx;
    let act = '互动', ptxt = '', px = 0, py = 0;
    if (c && !g.ending) {
      if (c.kind === 'relay') {
        act = p.calib ? '校准' : '修复';
        ptxt = p.calib ? '' : p.restoring ? '修复中 ' + Math.floor(c.obj.progress * 100) + '%' : (touchMode ? '按住「互动」修复信标' : '按住 <kbd>E</kbd> 修复信标');
        px = c.obj.x; py = c.obj.y - 0.9;
      } else if (c.kind === 'locker') { act = '躲藏'; ptxt = touchMode ? '躲进储物柜' : '<kbd>E</kbd> 躲进储物柜'; px = c.obj.cx; py = c.obj.cy - 0.8; }
      else if (c.kind === 'vent') { act = '钻入'; ptxt = touchMode ? '钻进通风管' : '<kbd>E</kbd> 钻进通风管'; px = c.obj.x; py = c.obj.y - 0.8; }
      else if (c.kind === 'exit') { act = '离开'; ptxt = touchMode ? '点「离开」走出储物柜' : '<kbd>E</kbd> 离开储物柜'; px = c.obj.cx; py = c.obj.cy - 1.1; }
      else if (c.kind === 'pod') { act = '互动'; ptxt = g.podUnlocked ? '进入逃生舱' : '逃生舱已上锁 · 先恢复所有信标'; px = c.obj.hx; py = c.obj.hy - 1.0; }
    }
    setText(el.bAct, 'act', act);
    setClass($('#b-act'), 'ba', 'ctx', !!c && c.kind !== 'pod');
    if (ptxt) {
      setText(el.prompt, 'pt', ptxt);
      const s = R.worldToScreen(px, py);
      el.prompt.style.transform = 'translate(' + Math.round(s.x) + 'px,' + Math.round(s.y) + 'px) translate(-50%,-100%)';
      setClass(el.prompt, 'pv', 'show', true);
    } else setClass(el.prompt, 'pv', 'show', false);
    // 校准
    if (p.calib) { setClass(el.calib, 'cv', 'show', true); drawCalib(p.calib, now); }
    else setClass(el.calib, 'cv', 'show', false);
    setClass(document.body, 'bc', 'calibrating', !!p.calib);
    setClass(el.vent, 'vv', 'show', !!p.vent);
    if (p.vent) el.vent.style.setProperty('--k', (1 - p.ventT / 1.25).toFixed(3));
    // 小地图
    miniT -= dt;
    if (miniOn && miniT <= 0) { miniT = 0.12; R.drawMinimap(el.mini, g, now); }
    // 提示计时
    if (hintBusy) { hintTimer -= dt; if (hintTimer <= 0) { el.hint.classList.remove('show'); hintBusy = false; setTimeout(nextHint, 350); } }
    fx.heardT = Math.max(0, (fx.heardT || 0) - dt);
  }

  function drawCalib(c, now) {
    const cvs = el.calibCv;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = Math.round(cvs.clientWidth * dpr), H = Math.round(cvs.clientHeight * dpr);
    if (!W || !H) return;
    if (cvs.width !== W || cvs.height !== H) { cvs.width = W; cvs.height = H; }
    const x = cvs.getContext('2d');
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    const w = W / dpr, h = H / dpr;
    x.clearRect(0, 0, w, h);
    const wh = h - 16;
    // 网格
    x.strokeStyle = 'rgba(180,140,255,0.12)';
    x.lineWidth = 1;
    x.beginPath();
    for (let i = 1; i < 8; i++) { x.moveTo((w * i) / 8, 0); x.lineTo((w * i) / 8, wh); }
    x.moveTo(0, wh / 2); x.lineTo(w, wh / 2);
    x.stroke();
    const aligned = Math.abs(c.phase) <= c.win;
    const k = (Math.PI * 2 * 2.5) / w;
    const amp = wh * 0.36;
    const t = now * 0.004;
    x.setLineDash([4, 4]);
    x.strokeStyle = 'rgba(200,170,255,0.55)';
    x.lineWidth = 1.5;
    x.beginPath();
    for (let i = 0; i <= w; i += 2) { const y = wh / 2 + Math.sin(i * k + t) * amp; i ? x.lineTo(i, y) : x.moveTo(i, y); }
    x.stroke();
    x.setLineDash([]);
    x.strokeStyle = aligned ? '#f1e6ff' : '#7fd8ff';
    x.shadowColor = aligned ? '#b48cff' : '#3fa8ff';
    x.shadowBlur = aligned ? 12 : 6;
    x.lineWidth = aligned ? 2.6 : 2;
    x.beginPath();
    for (let i = 0; i <= w; i += 2) { const y = wh / 2 + Math.sin(i * k + t + c.phase * Math.PI) * amp * (aligned ? 1 : 0.92); i ? x.lineTo(i, y) : x.moveTo(i, y); }
    x.stroke();
    x.shadowBlur = 0;
    // 下方进度条
    const by = h - 8;
    x.fillStyle = 'rgba(255,255,255,0.1)';
    x.fillRect(8, by - 2, w - 16, 4);
    const cx = w / 2, half = (w - 16) / 2;
    x.fillStyle = 'rgba(180,140,255,0.55)';
    x.fillRect(cx - half * c.win, by - 3, half * c.win * 2, 6);
    x.fillStyle = aligned ? '#fff' : '#7fd8ff';
    const mx = cx + c.phase * half;
    x.fillRect(mx - 2, by - 6, 4, 12);
    // 剩余时间
    const left = 1 - c.t / c.dur;
    x.fillStyle = 'rgba(255,255,255,0.35)';
    x.fillRect(0, 0, w * left, 2);
  }

  /* ---------------- 结束与结算 ---------------- */
  function finishRun() {
    const g = game;
    if (!g || mode !== 'play') return;
    mode = 'result';
    const win = g.ending.type === 'win';
    const D = g.D;
    const ms = Math.round(g.t * 1000);
    const st = g.stats;
    const total = g.map.relays.length;
    let dust = 0;
    const parts = [];
    const newAch = [];
    let record = false;
    if (win) {
      parts.push(['逃脱', D.dust]);
      parts.push(['信标', total * 4]);
      if (st.hits === 0) parts.push(['零受伤', 15]);
      if (st.closeCalls) parts.push(['惊险时刻', Math.min(8, st.closeCalls) * 2]);
      const sp = clamp(Math.round((D.par - g.t) / 12), 0, 20);
      if (sp) parts.push(['速度', sp]);
      if (run.daily) parts.push(['每日', 10]);
      dust = parts.reduce((a, b) => a + b[1], 0);
      record = arc('recordBest', GID + ':' + run.diff, ms, 'low') === true;
      store.wins = (store.wins | 0) + 1;
      if (run.daily) {
        const k = U.todayStr();
        if (!store.daily[k] || ms < store.daily[k]) store.daily[k] = ms;
      }
      const tryAch = id => { if (achieve(id)) newAch.push(U.ACH.find(a => a.id === id).name); };
      tryAch('first-escape');
      if (st.hits === 0) tryAch('untouched');
      if (run.diff === 'nightmare') tryAch('nightmare');
      if (st.chases === 0) tryAch('unseen');
      if (st.calibTotal >= 4 && st.calibOk === st.calibTotal) tryAch('steady');
      if (run.daily) tryAch('daily');
    } else {
      if (g.relaysDone) parts.push(['信标', g.relaysDone * 3]);
      if (st.closeCalls) parts.push(['惊险时刻', Math.min(5, st.closeCalls)]);
      dust = parts.reduce((a, b) => a + b[1], 0);
    }
    if (st.closeCalls >= 5 && achieve('close')) newAch.push('擦肩而过');
    U.store.save();
    const totalDust = dust > 0 ? arc('addStardust', dust, GID) : arc('getStardust');
    const best = arc('getBest', GID + ':' + run.diff);
    // 填充结算
    const m = $('#m-result');
    m.classList.toggle('win', win);
    m.classList.toggle('lose', !win);
    $('#r-eyebrow').textContent = win ? '成功逃脱' : '信号中断';
    $('#r-title').textContent = win ? '你离开了暗域站' : '守夜者找到了你';
    $('#r-time').textContent = U.fmtTime(ms);
    $('#r-timelabel').innerHTML = win ? (record ? '<b class="rec">新纪录</b>' : best != null ? '最佳 ' + U.fmtTime(best) : '用时') : '坚持了';
    $('#r-stats').innerHTML = [
      ['信标', g.relaysDone + '/' + total],
      ['惊险时刻', st.closeCalls],
      ['受伤', st.hits],
      ['相位校准', st.calibTotal ? st.calibOk + '/' + st.calibTotal : '—'],
    ].map(([a, b]) => '<div><small>' + a + '</small><b>' + b + '</b></div>').join('');
    $('#r-dust').innerHTML = dust > 0 ? '<span class="dust-ic">✦</span> 星尘 <b>+' + dust + '</b>' + (totalDust != null ? '<small>共 ' + totalDust + '</small>' : '') : '<span class="dim">这次没有带回星尘</span>';
    $('#r-parts').textContent = parts.map(p2 => p2[0] + ' ' + p2[1]).join(' · ');
    $('#r-ach').innerHTML = newAch.map(n => '<span>✦ ' + n + '</span>').join('');
    $('#r-sub').textContent = (run.daily ? '每日站点 · ' + U.todayCN() : '站点 #' + U.seedCode(run.seed)) + ' · ' + U.DIFF[run.diff].name;
    openModal('m-result');
    showScreen('result');
    still = 0;
    fx.endFade = 0;
    el.fade.style.transition = 'opacity 1.2s ease';
    el.fade.style.opacity = win ? '0.15' : '0.35';
    el.calib.classList.remove('show');
    el.prompt.classList.remove('show');
    el.vent.classList.remove('show');
    A.setAmbience(0.35, 1);
    lastResult = { win, ms, dust, record, newAch, stats: Object.assign({}, st), relays: g.relaysDone, total };
  }
  let lastResult = null;

  /* ---------------- 主循环 ---------------- */
  const STEP = 1 / 60;
  function stepSim(g, dt) {
    gatherInput();
    g.update(dt, inp);
    clearEdges();
  }
  function checkEnding(g) {
    if (!g.ending || mode !== 'play') return;
    const t = g.ending.t;
    const win = g.ending.type === 'win';
    fx.endFade = win ? clamp((t - 1.0) / 1.1, 0, 1) : clamp((t - 1.5) / 0.9, 0, 1);
    if (t > (win ? 2.3 : 2.6)) finishRun();
  }

  function frame(ts) {
    requestAnimationFrame(frame);
    const now = ts || performance.now();
    let dt = lastTs ? (now - lastTs) / 1000 : 1 / 60;
    lastTs = now;
    dt = Math.min(dt, 0.1);
    if (document.hidden) return;
    try {
      if (mode === 'play' && game) {
        if (!paused && !hold) {
          acc += dt;
          let n = 0;
          while (acc >= STEP && n < 5) { stepSim(game, STEP); acc -= STEP; n++; }
          if (n === 5) acc = 0;
          handleEvents(game);
          tutorial(game);
          checkEnding(game);
        }
        // 暂停时画面静止（省电：弹窗的背景模糊不必每帧重算）
        if (game && (!paused || still++ < 2)) renderGame(game, paused ? 0 : dt, now);
        if (!paused) still = 0;
      } else if (mode === 'result' && game) {
        if (still++ < 2) renderGame(game, 0, now);
      } else if (mode === 'title' || mode === 'result') {
        if (!attract) attract = new U.Game({ seed: 20261102, diff: 'normal', attract: true });
        let a = Math.min(dt, 0.05);
        while (a > 0) { const s = Math.min(STEP, a); attract.update(s, null); a -= s; }
        attract.events.length = 0;
        renderGame(attract, dt, now);
      }
      A.lx = game && mode === 'play' ? listenerX() : attract ? attract.warden.x : 0;
      A.ly = game && mode === 'play' ? listenerY() : attract ? attract.warden.y + 6 : 0;
      const ag = mode === 'play' && game ? game : attract;
      if (ag) A.losFn = (x, y) => ag.map.los(A.lx, A.ly, x, y);
      A.update(dt, ag, mode === 'play' && !paused ? 'play' : mode === 'title' ? 'title' : 'other');
      R.adapt(dt);
    } catch (err) {
      console.error(err);
    }
  }
  function listenerX() { const p = game.player; return p.hidden && p.hidden.cx != null ? p.hidden.cx : p.x; }
  function listenerY() { const p = game.player; return p.hidden && p.hidden.cy != null ? p.hidden.cy : p.y; }

  function renderGame(g, dt, now) {
    fx.hurt = Math.max(0, fx.hurt - dt * 1.6);
    const danger = g.attract ? 0 : g.danger;
    // 没有声音时也让红晕跟着“心跳”跳动
    let beat = A.active ? A.beatPulse : 0;
    if (!A.active && danger > 0.1) {
      fx.beatT -= dt;
      if (fx.beatT <= 0) { fx.beat = 1; fx.beatT = U.lerp(1.05, 0.34, danger); }
      fx.beat = Math.max(0, fx.beat - dt * 3.2);
      beat = fx.beat;
    }
    let glitch = danger > 0.82 ? (danger - 0.82) * 2.4 : 0;
    if (g.ending && g.ending.type === 'caught') glitch = mode === 'result' ? 0 : Math.min(1, 0.3 + g.ending.t * 0.5);
    R.draw(g, dt, now, {
      danger, beat, hurt: fx.hurt, cracks: g.attract ? null : fx.cracks, glitch,
      shake: g.ending && g.ending.type === 'win' && g.ending.t > 0.4 ? Math.min(0.35, (g.ending.t - 0.4) * 0.4) : 0,
      markers: mode === 'play',
    });
    if (mode === 'play' && !g.attract) updateHUD(g, dt, now);
    if (mode === 'play') {
      const win = g.ending && g.ending.type === 'win';
      el.fade.classList.toggle('white', !!win);
      if (g.ending) { el.fade.style.transition = 'none'; el.fade.style.opacity = String(fx.endFade); }
      else if (fx.wasEnding) el.fade.classList.remove('white');
      fx.wasEnding = !!g.ending;
    }
  }

  window.addEventListener('resize', () => { R.resize(); fx.cracks = fx.crackLvl ? R.makeCracks(fx.crackLvl, run ? (run.seed ^ (fx.crackLvl === 1 ? 77 : 99)) >>> 0 : 7) : null; });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (mode === 'play' && game && !game.ending) pause();
      A.suspend();
    } else {
      A.resume();
      lastTs = 0;
    }
  });

  /* ---------------- 调试接口（自动化测试用） ---------------- */
  window.__debug = {
    get mode() { return mode; },
    get paused() { return paused; },
    get game() { return game; },
    get result() { return lastResult; },
    set hold(v) { hold = !!v; },
    get hold() { return hold; },
    start(o) { startRun(Object.assign({ diff: 'normal', skipIntro: true }, o || {})); return { seed: run.seed, diff: run.diff }; },
    setInput(o) { dbg.input = o ? Object.assign({}, o) : null; },
    press(name) { inp[name] = true; },
    advance(sec, input) {
      if (!game) return null;
      const n = Math.round(sec / STEP);
      const keep = dbg.input;
      if (input) dbg.input = Object.assign({}, keep || {}, input);
      for (let i = 0; i < n && mode === 'play'; i++) {
        stepSim(game, STEP);
        handleEvents(game);
        checkEnding(game);
      }
      dbg.input = keep;
      return this.state();
    },
    teleport(x, y) { const p = game.player; p.x = x; p.y = y; p.vx = p.vy = 0; },
    warden(x, y, state) {
      const w = game.warden;
      if (x != null) { w.x = x; w.y = y; w.path = null; }
      if (state === 'chase') { game.startChase(); w.lastSeenT = game.t; w.lastSeen = { x: game.player.x, y: game.player.y }; }
      else if (state) { w.state = state; }
      return { x: w.x, y: w.y, state: w.state };
    },
    freeze(v) { game.freeze = !!v; },
    state() {
      const g = game;
      if (!g) return { mode };
      const p = g.player, w = g.warden;
      return {
        mode, paused, t: g.t, diff: g.diff, seed: g.seed,
        ending: g.ending ? g.ending.type : null,
        player: { x: p.x, y: p.y, hp: p.hp, hidden: !!(p.hidden && !p.hidden.attract), hidePhase: p.hidePhase, stamina: p.stamina, flares: p.flares, ctx: p.ctx ? p.ctx.kind : null, calib: p.calib ? { phase: p.calib.phase, win: p.calib.win, t: p.calib.t } : null, restoring: p.restoring ? p.restoring.id : null },
        warden: { x: w.x, y: w.y, state: w.state, susp: w.susp, seeing: w.seeing, sawHide: !!w.sawHide, dist: Math.hypot(w.x - p.x, w.y - p.y) },
        relays: g.map.relays.map(r => ({ id: r.id, x: r.x, y: r.y, done: r.done, progress: r.progress, known: r.known })),
        relaysDone: g.relaysDone, podUnlocked: g.podUnlocked, pod: { hx: g.map.pod.hx, hy: g.map.pod.hy, face: g.map.pod.face },
        stats: Object.assign({}, g.stats), danger: g.danger,
      };
    },
    lockers() { return game.map.lockers.map(L => ({ id: L.id, x: L.x, y: L.y, cx: L.cx, cy: L.cy, dir: L.dir })); },
    los(ax, ay, bx, by) { return game.map.los(ax, ay, bx, by); },
    path(ax, ay, bx, by) { const p = game.map.findPath(ax, ay, bx, by, null, 0.3); return p ? p.map(q => [q.x, q.y]) : null; },
    walkable(x, y) { const M = game.map; return !!M.walkBase[M.I(Math.floor(x), Math.floor(y))]; },
    pause, resume, toTitle,
    quality(q, lock) { if (q != null) R.setQuality(q); if (lock != null) R.qLock = !!lock; return { q: R.q, work: R.workAvg }; },
    snap() { R.camInit = false; },
  };

  /* ---------------- 启动 ---------------- */
  refreshTitle();
  showScreen('title');
  el.fade.style.opacity = '0';
  requestAnimationFrame(frame);
})();
