/* 远征 · 界面：标题、英雄选择、符文盘、升级卡、暂停、结算 */
(function () {
  'use strict';
  const Q = window.Q, G = Q.G;
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  const esc = Q.esc;
  const sfx = (n) => Q.audio.play(n);
  const UI = (Q.ui = {});
  let screen = 'title', selHero = Q.save.lastHero || 'guard', selMode = Q.save.lastMode || 'normal';
  let lvShownAt = 0, portraits = [], bannerT = 0, toastQ = [], toastBusy = false;

  const gl = (glyph, color, cls) => `<span class="gl ${cls || ''}" style="--c:${color}">${esc(glyph)}</span>`;

  function show(id) {
    screen = id;
    $$('.screen').forEach((s) => s.classList.toggle('show', s.id === 'scr-' + id));
    if (id === 'title') refreshTitle();
    if (id === 'select') refreshSelect();
    if (id === 'runes') refreshRunes();
    if (id !== 'sum') document.body.classList.remove('playing');
  }
  UI.show = show;

  /* ---------- 标题 ---------- */
  function refreshTitle() {
    $('#t-dust').innerHTML = `${Q.arcade.dust()} <i>星尘</i>`;
    const best = Q.arcade.getBest(), S = Q.save.stats;
    const parts = [];
    if (best != null) parts.push(`最长远征 ${Q.fmtTime(best)}`);
    if (S.wins) parts.push(`告捷 ${S.wins} 次`);
    if (S.runs) parts.push(`共出征 ${S.runs} 次`);
    $('#t-best').textContent = parts.join(' · ') || '群星在等待第一位远征者';
  }

  /* ---------- 英雄选择 ---------- */
  function buildHeroes() {
    const box = $('#heroes');
    box.innerHTML = Q.HERO_ORDER.map((id) => {
      const H = Q.HEROES[id];
      return `<div class="hero-card" data-h="${id}" style="--c:${H.color}" role="button" tabindex="0" aria-label="${H.cls}·${H.name}">
        <canvas></canvas>
        <div class="hc-name"><b>${H.cls}</b><small>${H.en}</small></div>
        <div class="lock" hidden></div>
      </div>`;
    }).join('');
    portraits = $$('.hero-card').map((el) => ({ el, cv: el.querySelector('canvas'), id: el.dataset.h }));
    portraits.forEach((p) => {
      p.el.addEventListener('click', (e) => {
        if (e.target.closest('.btn')) return;
        selHero = p.id; sfx('ui'); refreshSelect();
      });
      p.el.addEventListener('keydown', (e) => { if (e.key === 'Enter') { selHero = p.id; refreshSelect(); } });
    });
  }
  function sizePortraits() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    for (const p of portraits) { const r = p.el.getBoundingClientRect(); const w = Math.round(r.width * dpr), h = Math.round(r.height * dpr); if (w && (p.cv.width !== w || p.cv.height !== h)) { p.cv.width = w; p.cv.height = h; } }
  }
  function refreshSelect() {
    const dust = Q.arcade.dust();
    $('#sel-dust').innerHTML = `${dust}`;
    if (!Q.save.unlocked[selHero]) { /* 允许查看未解锁英雄 */ }
    for (const p of portraits) {
      const H = Q.HEROES[p.id], locked = !Q.save.unlocked[p.id];
      p.el.classList.toggle('on', p.id === selHero);
      const lk = p.el.querySelector('.lock');
      lk.hidden = !locked;
      if (locked) {
        lk.innerHTML = `<span class="lk">⚿</span><span>击败首个首领后解锁</span><button class="btn btn-primary sm" data-unlock="${p.id}" ${dust < H.unlockCost ? 'disabled' : ''}>✦ ${H.unlockCost}</button>`;
        lk.querySelector('button').onclick = (e) => {
          e.stopPropagation();
          if (Q.arcade.spend(H.unlockCost)) { Q.save.unlocked[p.id] = true; Q.persist(); sfx('buy'); selHero = p.id; refreshSelect(); UI.toast('英雄解锁', H.cls + ' · ' + H.name); }
        };
      }
    }
    const H = Q.HEROES[selHero];
    const W = Q.UPG[H.weapon], K = Q.UPG[H.skill];
    $('#hero-info').style.setProperty('--hc', H.color);
    $('#hero-info').innerHTML = `
      <div>
        <div class="hi-name"><b>${H.name}</b><span>${H.cls} · ${H.en}</span></div>
        <p class="hi-title">${H.title}</p>
        <p class="hi-lore">${H.lore}</p>
        <div class="bars">${H.bars.map(([n, v]) => `<div class="bar"><span>${n}</span><span class="pips">${[0, 1, 2, 3, 4].map((i) => `<i class="${i < v ? 'on' : ''}"></i>`).join('')}</span></div>`).join('')}</div>
      </div>
      <div>
        <div class="abil">${gl(W.glyph, W.color)}<div><b>${W.name}<small>主武器 · 自动</small></b><p>${W.lv[0]}</p></div></div>
        <div class="abil">${gl(K.glyph, K.color)}<div><b>${K.name}<small>技能 · ${H.skillCd} 秒</small></b><p>${K.lv[0]}</p></div></div>
        <div class="abil">${gl('天', H.color)}<div><b>${H.passive.name}<small>天赋</small></b><p>${H.passive.desc}</p></div></div>
      </div>`;
    $$('.mode').forEach((b) => b.classList.toggle('on', b.dataset.mode === selMode));
    const locked = !Q.save.unlocked[selHero];
    const go = $('#btn-go');
    go.disabled = locked;
    go.textContent = locked ? '尚未解锁' : '出征';
    requestAnimationFrame(sizePortraits);
  }

  /* ---------- 符文盘 ---------- */
  function refreshRunes() {
    const dust = Q.arcade.dust();
    $('#runes-dust').innerHTML = `${dust}`;
    $('#runes').innerHTML = Q.RUNES.map((r) => {
      const lv = Q.runeLv(r.id), max = lv >= r.max, cost = Q.runeCost(r, lv);
      const cur = lv ? r.fmt(+(r.per * lv).toFixed(2)) : '尚未镌刻';
      const nxt = max ? '' : `下一级：<em>${r.fmt(+(r.per * (lv + 1)).toFixed(2))}</em>`;
      const col = ['#ff8aa8', '#ff7a5a', '#9dffb0', '#7fe8ff', '#8ff0ff', '#c69bff', '#e0bf94', '#7dffb5', '#ffd36b', '#ffe9b0', '#ffcf6b', '#ff9a3c'][Q.RUNES.indexOf(r)];
      return `<div class="rune ${lv ? 'has' : ''} ${max ? 'max' : ''}" style="--c:${col}" data-r="${r.id}">
        ${gl(r.glyph, col)}
        <h4>${r.name}</h4>
        <div class="rp">${Array.from({ length: r.max }, (_, i) => `<i class="${i < lv ? 'on' : ''}"></i>`).join('')}</div>
        <p class="eff">${lv ? `<em>${cur}</em>` : cur}<br>${nxt}</p>
        ${max ? '<button class="btn max" disabled>已圆满</button>' : `<button class="btn btn-primary" data-buy="${r.id}" ${dust < cost ? 'disabled' : ''}>✦ ${cost}</button>`}
      </div>`;
    }).join('');
    $$('[data-buy]').forEach((b) => b.addEventListener('click', () => {
      const r = Q.RUNES.find((x) => x.id === b.dataset.buy);
      const lv = Q.runeLv(r.id), cost = Q.runeCost(r, lv);
      if (lv >= r.max) return;
      if (Q.arcade.spend(cost)) {
        Q.save.runes[r.id] = lv + 1; Q.persist(); sfx('buy');
        refreshRunes();
        const el = document.querySelector(`.rune[data-r="${r.id}"]`);
        if (el) el.classList.add('flash');
      } else sfx('ui');
    }));
    const H = Q.HEROES.ranger;
    $('#runes-unlock').innerHTML = Q.save.unlocked.ranger ? '' :
      `<div class="rune" style="--c:${H.color};flex-direction:row;justify-content:space-between;text-align:left;gap:14px">${gl('猎', H.color)}<div style="flex:1"><h4 style="letter-spacing:.1em">解锁英雄 · ${H.cls}</h4><p class="eff" style="min-height:0">${H.title}。也可以通过击败首个首领免费解锁。</p></div><button class="btn btn-primary" style="width:auto" id="unlock-ranger" ${dust < H.unlockCost ? 'disabled' : ''}>✦ ${H.unlockCost}</button></div>`;
    const ub = $('#unlock-ranger');
    if (ub) ub.onclick = () => { if (Q.arcade.spend(H.unlockCost)) { Q.save.unlocked.ranger = true; Q.persist(); sfx('buy'); UI.toast('英雄解锁', H.cls + ' · ' + H.name); refreshRunes(); } };
    const spent = Q.RUNES.reduce((s, r) => { let t = 0; for (let i = 0; i < Q.runeLv(r.id); i++) t += Q.runeCost(r, i); return s + t; }, 0);
    const rb = $('#runes-reset');
    rb.hidden = spent <= 0;
    rb.dataset.armed = '';
    rb.textContent = `重置符文（返还 ${spent} 星尘）`;
  }
  function resetRunes() {
    const rb = $('#runes-reset');
    if (!rb.dataset.armed) { rb.dataset.armed = '1'; rb.textContent = '再点一次确认重置'; setTimeout(() => { if (rb.dataset.armed) refreshRunes(); }, 3000); return; }
    const spent = Q.RUNES.reduce((s, r) => { let t = 0; for (let i = 0; i < Q.runeLv(r.id); i++) t += Q.runeCost(r, i); return s + t; }, 0);
    if (spent > 0) Q.arcade.refund(spent);
    Q.save.runes = {}; Q.persist(); sfx('ui');
    refreshRunes();
  }

  /* ---------- 出征 ---------- */
  function startRun(hero, mode) {
    Q.audio.init();
    if (!Q.save.unlocked[hero]) return;
    selHero = hero; selMode = mode;
    Q.save.lastHero = hero; Q.save.lastMode = mode; Q.persist();
    $$('.screen').forEach((s) => s.classList.remove('show'));
    screen = 'play';
    $('#m-pause').classList.remove('show');
    $('#ov-level').classList.remove('show');
    document.body.classList.add('playing');
    Q.game.start(hero, mode);
    G.camSnap = true;
    $('#skill-glyph').textContent = Q.UPG[Q.HEROES[hero].skill].glyph;
    $('#btn-skill').style.setProperty('--c', Q.HEROES[hero].color);
    const B = Q.BIOMES[0];
    const runId = (UI.runId = (UI.runId || 0) + 1);
    setTimeout(() => {
      if (UI.runId !== runId || (G.state !== 'play' && G.state !== 'level')) return;
      UI.banner(B.name, Q.input.touch ? '左侧拖动移动 · 自动攻击 · 右下技能与闪避' : 'WASD 移动 · 鼠标瞄准 · Q 技能 · 空格闪避', B.accent);
    }, 400);
    if ((Q.save.stats.runs | 0) < 2) {
      setTimeout(() => { if (UI.runId === runId && G.state === 'play') UI.banner('', '拾取星晶升级 · 法术满级再配上对应天赋，即可进化', '#ffe9b0'); }, 3600);
      setTimeout(() => { if (UI.runId === runId && G.state === 'play') UI.banner('', Q.MODES[mode].stageDur + ' 秒后，首领将随坠星降临 · 留意地面的预警圈', '#ff9a3c'); }, 7400);
    }
  }
  UI.startRun = startRun;

  /* ---------- 升级卡 ---------- */
  UI.showLevel = (choices, title, sub, rerolls, again) => {
    const ov = $('#ov-level');
    $('#lv-title').textContent = title;
    $('#lv-sub').textContent = sub || '';
    $('#cards').innerHTML = choices.map((c, i) => {
      const pips = c.max ? Array.from({ length: c.max }, (_, k) => `<i class="${k < c.cur ? 'on' : k === c.cur ? 'nw' : ''}"></i>`).join('') : '';
      return `<button class="upc ${c.type === 'evo' ? 'evo' : ''}" style="--c:${c.color};--i:${i}" data-i="${i}" type="button">
        <span class="key">${i + 1}</span>
        <span class="tag">${c.tag}</span>
        ${gl(c.glyph, c.color)}
        <span class="mid">
          <h3>${esc(c.name)}</h3>
          ${c.lvl ? `<span class="lvl">${c.lvl}</span>` : ''}
          ${pips ? `<span class="pip">${pips}</span>` : ''}
          <span class="desc">${esc(c.desc)}</span>
          ${c.hint ? `<span class="hint">${esc(c.hint)}</span>` : ''}
        </span>
      </button>`;
    }).join('');
    $$('#cards .upc').forEach((el) => el.addEventListener('click', () => UI.pickCard(+el.dataset.i)));
    const rb = $('#btn-reroll');
    rb.hidden = rerolls <= 0;
    $('#reroll-n').textContent = `×${rerolls}`;
    ov.classList.add('show');
    lvShownAt = performance.now() - (again ? 300 : 0);
  };
  UI.pickCard = (i) => {
    if (G.state !== 'level') return;
    if (performance.now() - lvShownAt < 320) return;
    const el = document.querySelector(`#cards .upc[data-i="${i}"]`);
    if (!el) return;
    el.classList.add('picked');
    Q.game.choose(i);
  };
  UI.hideLevel = () => { $('#ov-level').classList.remove('show'); };

  /* ---------- 暂停 ---------- */
  const TOG = [['sfx', '音效'], ['music', '音乐'], ['autoAim', '自动瞄准'], ['numbers', '伤害数字'], ['shake', '屏幕震动']];
  function refreshToggles() {
    $('#toggles').innerHTML = TOG.map(([k, n]) => `<button class="tg ${Q.save.settings[k] ? 'on' : ''}" data-t="${k}" type="button">${n}<i></i></button>`).join('');
    $$('#toggles .tg').forEach((b) => b.addEventListener('click', () => { UI.toggleSetting(b.dataset.t); refreshToggles(); }));
  }
  UI.toggleSetting = (k) => {
    const S = Q.save.settings;
    S[k] = !S[k];
    if (k === 'sfx') { Q.audio.setSfx(S.sfx); document.body.classList.toggle('muted', !S.sfx); }
    if (k === 'music') Q.audio.setMusic(S.music);
    if (k === 'autoAim') G.autoAim = S.autoAim || Q.input.touch;
    Q.persist();
    if (k === 'sfx' && G.state === 'play') UI.banner('', S.sfx ? '音效：开' : '音效：关');
  };
  UI.toggleAim = () => { UI.toggleSetting('autoAim'); UI.banner('', G.autoAim ? '自动瞄准：开' : '鼠标瞄准'); };
  UI.pause = () => {
    if (!Q.game.pause()) return;
    const M = Q.MODES[G.mode], B = Q.BIOMES[Q.STAGES[G.stage].biome];
    $('#pause-sub').textContent = `${G.hero.cls}·${G.hero.name} · ${M.name} · ${B.name} · ${Q.fmtTime(G.t)} · 击杀 ${G.kills}`;
    const items = G.weapons.map((w) => { const U = Q.UPG[w.id]; const nm = w.evo ? Q.EVOS[U.evo].name : U.name; return `<div class="pb-item">${gl(w.evo ? Q.EVOS[U.evo].glyph : U.glyph, U.color, 'sm')}<span>${nm}</span><small>${w.evo ? '★' : 'Lv' + w.lvl}</small></div>`; });
    const K = Q.UPG[G.hero.skill];
    items.push(`<div class="pb-item">${gl(K.glyph, K.color, 'sm')}<span>${K.name}</span><small>Lv${G.skillLv}</small></div>`);
    for (const id of Q.PASSIVES) if (G.lv[id]) { const U = Q.UPG[id]; items.push(`<div class="pb-item">${gl(U.glyph, U.color, 'sm')}<span>${U.name}</span><small>Lv${G.lv[id]}</small></div>`); }
    $('#pause-build').innerHTML = items.join('');
    refreshToggles();
    $('#m-pause').classList.add('show');
  };
  UI.resume = () => { $('#m-pause').classList.remove('show'); Q.game.resume(); };
  UI.escape = () => {
    if ($('#m-help').classList.contains('show')) { $('#m-help').classList.remove('show'); return; }
    if (screen === 'select' || screen === 'runes') show('title');
  };

  /* ---------- 结算 ---------- */
  const SRC = { blast: ['爆', '#ff9a3c'], bomb: ['雷', '#c58bff'], revive: ['涅', '#ffe9b0'], impact: ['坠', '#ffffff'] };
  UI.summary = (r) => {
    $('#m-pause').classList.remove('show');
    $('#ov-level').classList.remove('show');
    document.body.classList.remove('playing');
    const B = Q.BIOMES[Q.STAGES[r.stage].biome], M = Q.MODES[r.mode];
    const card = $('#sum-card');
    card.classList.toggle('win', r.victory);
    $('#sum-eyebrow').textContent = (r.victory ? '远征告捷' : '远征止步') + ' · ' + M.name;
    $('#sum-title').innerHTML = r.victory ? '群星归位' : `止步${B.name}`;
    $('#sum-sub').innerHTML = `${r.hero.cls} · ${r.hero.name}　坚持 ${Q.fmtTime(r.time)}${r.newBest ? '<span class="new-best">新纪录</span>' : ''}`;
    const stats = [
      [Q.fmtTime(r.time), '用时', r.newBest], [r.kills.toLocaleString(), '击杀'], [r.level, '等级'],
      [r.bossKills + '/3', '首领', r.bossKills === 3], [Q.fmtNum(r.dmg), '总伤害'], [r.bestCombo, '最高连斩'],
    ];
    $('#sum-stats').innerHTML = stats.map(([v, n, hl]) => `<div class="stat ${hl ? 'hl' : ''}"><b>${v}</b><span>${n}</span></div>`).join('');
    const top = r.dmgBy.slice(0, 8), mx = top.length ? top[0][1] : 1, tot = r.dmgBy.reduce((s, x) => s + x[1], 0) || 1;
    $('#sum-dmg').innerHTML = top.length ? top.map(([src, v], i) => {
      const U = Q.UPG[src];
      let glyph, col;
      if (U) { const evo = r.build.find((b) => b.id === src && b.evo); glyph = evo ? Q.EVOS[U.evo].glyph : U.glyph; col = U.color; }
      else [glyph, col] = SRC[src] || ['?', '#aaaaaa'];
      const nm = U ? (r.build.find((b) => b.id === src && b.evo) ? Q.EVOS[U.evo].name : U.name) : Q.game.srcName(src);
      return `<div class="dmg-row" style="--c:${col}">${gl(glyph, col, 'xs')}<span class="nm">${esc(nm)}</span><span class="br"><i style="width:${(v / mx) * 100}%;animation-delay:${i * 70}ms"></i></span><span class="vl">${Q.fmtNum(v)}<small>${Math.round((v / tot) * 100)}%</small></span></div>`;
    }).join('') : '<p style="color:var(--muted);font-size:13px">还没来得及出手……</p>';
    const bi = r.build.map((b) => {
      const U = Q.UPG[b.id]; const evo = b.evo;
      return `<div class="sb-item ${evo ? 'evo' : ''}">${gl(evo ? Q.EVOS[U.evo].glyph : U.glyph, U.color, 'sm')}<span>${evo ? Q.EVOS[U.evo].name : U.name}</span><small>${evo ? '★' : 'Lv' + b.lvl}</small></div>`;
    });
    const K = Q.UPG[r.hero.skill];
    bi.splice(1, 0, `<div class="sb-item">${gl(K.glyph, K.color, 'sm')}<span>${K.name}</span><small>Lv${r.skillLv}</small></div>`);
    $('#sum-build').innerHTML = bi.join('');
    const chips = r.dustParts.filter((p) => p[1] > 0).map(([n, v]) => `<span class="chip">${n} ${Math.round(v * M.dustMul)}</span>`);
    if (r.dustPicked) chips.push(`<span class="chip">拾取 ${r.dustPicked}</span>`);
    if (r.dustMul > 1) chips.push(`<span class="chip">星运 ×${r.dustMul.toFixed(1)}</span>`);
    $('#sum-dust').innerHTML = `<span class="big">${r.dust}</span>${chips.join('')}<span class="tot">星尘总计 ✦ ${r.total} · 可在「符文盘」镌刻永久强化</span>`;
    const ach = r.ach.map((id) => `<span class="a">${esc(Q.ACH[id])}</span>`);
    if (r.unlocked) { const H = Q.HEROES[r.unlocked]; ach.unshift(`<span class="a unlock">新英雄解锁：${H.cls} · ${H.name}</span>`); }
    $('#sum-ach').innerHTML = ach.join('');
    show('sum');
    $('#scr-sum .sum-scroll').scrollTop = 0;
  };

  /* ---------- 横幅、首领名片、成就 ---------- */
  UI.banner = (big, small, col) => {
    const b = $('#banner');
    b.querySelector('b').textContent = big || '';
    b.querySelector('small').textContent = small || '';
    b.style.setProperty('--c', col || '#ff6b4a');
    b.classList.add('show');
    bannerT = big ? 2.6 : 1.6;
  };
  UI.bossCard = (title, name, line, col) => {
    const c = $('#boss-card');
    c.querySelector('small').textContent = title;
    c.querySelector('b').textContent = name;
    c.querySelector('p').textContent = line;
    c.style.setProperty('--c', col);
    c.classList.remove('show'); void c.offsetWidth; c.classList.add('show');
    $('#banner').classList.remove('show');
  };
  UI.toast = (small, big) => { toastQ.push([small, big]); if (!toastBusy) nextToast(); };
  function nextToast() {
    const t = toastQ.shift();
    if (!t) { toastBusy = false; return; }
    toastBusy = true;
    const el = $('#toast');
    el.querySelector('small').textContent = t[0];
    el.querySelector('b').textContent = t[1];
    el.classList.add('show');
    sfx('chest');
    setTimeout(() => { el.classList.remove('show'); setTimeout(nextToast, 450); }, 2600);
  }

  /* ---------- 帧更新 ---------- */
  let pt = 0;
  UI.update = (dt) => {
    pt += dt;
    if (bannerT > 0) { bannerT -= dt; if (bannerT <= 0) $('#banner').classList.remove('show'); }
    if (screen === 'select') {
      for (const p of portraits) Q.render.heroPortrait(p.cv, p.id, pt + (p.id === 'mage' ? 1 : p.id === 'ranger' ? 2 : 0), { move: p.id === selHero, locked: !Q.save.unlocked[p.id] });
    }
    if (document.body.classList.contains('playing') && Q.input.touch && G.p && G.st) {
      const sk = clamp01(G.p.skillCd / Q.game.skillCd()), da = clamp01(G.p.dashCd / 1.5);
      const bs = $('#btn-skill'), bd = $('#btn-dash');
      bs.style.setProperty('--cd', sk.toFixed(3)); bd.style.setProperty('--cd', da.toFixed(3));
      bs.classList.toggle('ready', sk <= 0); bd.classList.toggle('ready', da <= 0);
    }
  };
  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

  /* ---------- 初始化 ---------- */
  UI.init = () => {
    buildHeroes();
    $('#btn-play').addEventListener('click', () => { Q.audio.init(); sfx('uiOk'); show('select'); });
    $('#btn-runes').addEventListener('click', () => { Q.audio.init(); sfx('ui'); show('runes'); });
    $('#btn-help').addEventListener('click', () => { Q.audio.init(); sfx('ui'); $('#m-help').classList.add('show'); Q.save.seenHelp = true; Q.persist(); });
    $('#sel-back').addEventListener('click', () => { sfx('ui'); show('title'); });
    $('#runes-back').addEventListener('click', () => { sfx('ui'); show('title'); });
    $('#runes-reset').addEventListener('click', resetRunes);
    $$('.mode').forEach((b) => b.addEventListener('click', () => { selMode = b.dataset.mode; sfx('ui'); refreshSelect(); }));
    $('#btn-go').addEventListener('click', () => { if (!Q.save.unlocked[selHero]) return; sfx('uiOk'); startRun(selHero, selMode); });
    $('#btn-pause').addEventListener('click', () => UI.pause());
    $('#btn-reroll').addEventListener('click', () => Q.game.reroll());
    $('#m-pause').addEventListener('click', (e) => {
      const a = e.target.closest('[data-act]');
      if (!a) return;
      const act = a.dataset.act;
      if (act === 'resume') UI.resume();
      else if (act === 'restart') { $('#m-pause').classList.remove('show'); Q.game.quit(); startRun(G.hero.id, G.mode); }
      else if (act === 'quit') { $('#m-pause').classList.remove('show'); G.state = 'play'; Q.game.endRun(false); }
    });
    $('#m-help').addEventListener('click', (e) => { if (e.target.closest('[data-act="close"]') || e.target.id === 'm-help') $('#m-help').classList.remove('show'); });
    $('#scr-sum').addEventListener('click', (e) => {
      const a = e.target.closest('[data-act]');
      if (!a) return;
      sfx('ui');
      const act = a.dataset.act;
      G.state = 'off';
      if (act === 'again') startRun(selHero = G.hero.id, G.mode);
      else if (act === 'select') show('select');
      else { show('title'); Q.audio.music('title'); }
    });
    const press = (el, fn) => el.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); Q.audio.init(); fn(); }, { passive: false });
    press($('#btn-skill'), () => { Q.input.skillQ = true; });
    press($('#btn-dash'), () => { Q.input.dashQ = true; });
    $('#btn-sound').addEventListener('click', () => {
      Q.audio.init();
      const S = Q.save.settings, on = !(S.sfx || S.music);
      S.sfx = on; S.music = on; Q.audio.setSfx(on); Q.audio.setMusic(on);
      document.body.classList.toggle('muted', !on); Q.persist();
    });
    $('#evo-list').innerHTML = Object.values(Q.EVOS).map((E) => {
      const B = Q.UPG[E.base], N = Q.UPG[E.need];
      return `<div class="evo-row">${gl(B.glyph, B.color, 'xs')}<span class="plus">+</span>${gl(N.glyph, N.color, 'xs')}<span class="plus">→</span><span><b>${E.name}</b><em>${B.name}${B.hero ? '（' + Q.HEROES[B.hero].cls + '）' : ''} + ${N.name}</em></span></div>`;
    }).join('');
    document.body.classList.toggle('muted', !Q.save.settings.sfx);
    Q.audio.setSfx(Q.save.settings.sfx); Q.audio.setMusic(Q.save.settings.music);
    if (window.WXArcade && window.WXArcade.on) window.WXArcade.on('change', () => { if (screen === 'title') refreshTitle(); if (screen === 'runes') refreshRunes(); if (screen === 'select') $('#sel-dust').textContent = Q.arcade.dust(); });
    window.addEventListener('resize', () => { if (screen === 'select') requestAnimationFrame(sizePortraits); });
    show('title');
  };
  UI.screen = () => screen;
})();
