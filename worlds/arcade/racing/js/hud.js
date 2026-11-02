/* 星际竞速 · HUD：名次、圈数、计时、速度、能量、小地图、提示信息 */
const $ = (s) => document.querySelector(s);

export function fmt(t, digits = 2) {
  if (t == null || !isFinite(t)) return '--:--.' + '-'.repeat(digits);
  const neg = t < 0; t = Math.abs(t);
  const m = Math.floor(t / 60), s = t - m * 60;
  const ss = s.toFixed(digits).padStart(3 + digits, '0');
  return (neg ? '-' : '') + m + ':' + ss;
}

export class HUD {
  constructor() {
    this.el = $('#hud');
    this.pos = $('#h-pos'); this.posOf = $('#h-posof');
    this.lap = $('#h-lap'); this.lapOf = $('#h-lapof');
    this.time = $('#h-time'); this.lt = $('#h-lt'); this.best = $('#h-best');
    this.speed = $('#h-speed'); this.sbar = $('#h-sbar');
    this.energy = [...document.querySelectorAll('#h-energy i')];
    this.msg = $('#h-msg'); this.count = $('#h-count');
    this.delta = $('#h-delta');
    this.tagSlip = $('#tag-slip'); this.tagDrift = $('#tag-drift');
    this.boostN = $('#t-boost-n'); this.tBoost = $('#t-boost');
    this.map = $('#minimap');
    this.mapCtx = this.map.getContext('2d');
    this.cache = {};
    this.msgTimer = 0;
  }

  set(key, el, val) { if (this.cache[key] !== val) { this.cache[key] = val; el.textContent = val; } }
  cls(key, el, name, on) { const k = key + name; if (this.cache[k] !== on) { this.cache[k] = on; el.classList.toggle(name, on); } }

  show(on) { this.el.classList.toggle('show', on); }

  setupMap(track, palette) {
    this.track = track;
    this.pal = palette;
    const css = this.map.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = Math.max(60, Math.round(css.width || 150)), H = Math.max(60, Math.round(css.height || 150));
    this.map.width = W * dpr; this.map.height = H * dpr;
    this.mw = W; this.mh = H; this.mdpr = dpr;
    const b = track.bounds;
    const pad = 9;
    const sx = (W - pad * 2) / (b.maxX - b.minX), sz = (H - pad * 2) / (b.maxZ - b.minZ);
    const sc = Math.min(sx, sz);
    const ox = (W - (b.maxX - b.minX) * sc) / 2, oz = (H - (b.maxZ - b.minZ) * sc) / 2;
    this.proj = (x, z) => [ox + (x - b.minX) * sc, oz + (z - b.minZ) * sc];
    // 预渲染赛道轮廓
    const off = document.createElement('canvas');
    off.width = this.map.width; off.height = this.map.height;
    const c = off.getContext('2d');
    c.scale(dpr, dpr);
    const path = new Path2D();
    for (let i = 0; i <= track.n; i += 6) {
      const k = (i % track.n) * 3;
      const [x, y] = this.proj(track.P[k], track.P[k + 2]);
      if (i === 0) path.moveTo(x, y); else path.lineTo(x, y);
    }
    path.closePath();
    c.lineJoin = 'round'; c.lineCap = 'round';
    c.strokeStyle = 'rgba(0,0,0,.55)'; c.lineWidth = 7; c.stroke(path);
    c.shadowColor = palette.accent; c.shadowBlur = 8;
    c.strokeStyle = palette.accent; c.globalAlpha = 0.85; c.lineWidth = 2.2; c.stroke(path);
    c.shadowBlur = 0; c.globalAlpha = 1;
    // 起点
    const [sx0, sy0] = this.proj(track.P[0], track.P[2]);
    c.fillStyle = '#fff'; c.fillRect(sx0 - 1.5, sy0 - 4, 3, 8);
    this.mapBase = off;
  }

  drawMap(racers, player, t) {
    if (!this.mapBase) return;
    const c = this.mapCtx, dpr = this.mdpr;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, this.map.width, this.map.height);
    c.drawImage(this.mapBase, 0, 0);
    c.scale(dpr, dpr);
    const tr = this.track;
    for (const r of racers) {
      if (r === player) continue;
      const k = Math.floor(tr.wrap(r.dist) / tr.ds) % tr.n * 3;
      const [x, y] = this.proj(tr.P[k], tr.P[k + 2]);
      c.fillStyle = r.color; c.beginPath(); c.arc(x, y, 2.6, 0, Math.PI * 2); c.fill();
    }
    if (player) {
      const k = Math.floor(tr.wrap(player.dist) / tr.ds) % tr.n * 3;
      const [x, y] = this.proj(tr.P[k], tr.P[k + 2]);
      const pr = 5 + Math.sin(t * 6) * 1.5;
      c.strokeStyle = 'rgba(255,255,255,.6)'; c.lineWidth = 1.2; c.beginPath(); c.arc(x, y, pr + 2, 0, Math.PI * 2); c.stroke();
      c.fillStyle = '#ffffff'; c.beginPath(); c.arc(x, y, 3.6, 0, Math.PI * 2); c.fill();
    }
  }

  update(race, p, t) {
    const n = race.racers.length;
    this.set('pos', this.pos, String(p.finished ? p.place : p.place || n));
    this.set('posof', this.posOf, '/' + n);
    this.cls('pos', this.pos.parentElement, 'solo', n === 1);
    const lap = Math.min(race.laps, Math.max(1, p.lap + 1));
    this.set('lap', this.lap, String(lap));
    this.set('lapof', this.lapOf, '/' + race.laps);
    const now = Math.max(0, race.clock);
    this.set('time', this.time, fmt(p.finished ? p.finishTime : now));
    this.set('lt', this.lt, fmt(race.started && !p.finished ? now - p.lapStart : (p.lapTimes[p.lapTimes.length - 1] || 0), 1));
    const best = p.lapTimes.length ? Math.min(...p.lapTimes) : null;
    this.set('best', this.best, best ? fmt(best, 2) : '--:--');
    const kmh = Math.round(p.speed * 5.2);
    this.set('spd', this.speed, String(kmh));
    const sp = Math.min(1, p.speed / (p.topSpeed * 1.4));
    if (Math.abs((this.cache.sbar || 0) - sp) > 0.004) { this.cache.sbar = sp; this.sbar.style.transform = `scaleX(${sp.toFixed(3)})`; }
    this.cls('sbar', this.sbar, 'boost', p.boosting);
    for (let i = 0; i < 3; i++) {
      const f = Math.max(0, Math.min(1, p.energy - i));
      const key = 'e' + i;
      const v = Math.round(f * 100);
      if (this.cache[key] !== v) { this.cache[key] = v; this.energy[i].style.setProperty('--f', (v / 100).toFixed(2)); this.energy[i].classList.toggle('full', v >= 100); }
    }
    const nE = Math.floor(p.energy);
    this.set('bn', this.boostN, String(nE));
    this.cls('tb', this.tBoost, 'ready', nE > 0);
    this.cls('slip', this.tagSlip, 'on', p.slip > 0.5);
    this.cls('drift', this.tagDrift, 'on', !!p.drifting);
    if (p.drifting) this.set('dl', this.tagDrift, '漂移 ' + p.driftT.toFixed(1) + 's');
    // 幽灵差值
    if (race.ghost && race.mode === 'trial' && race.started && !p.finished) {
      const gt = race.ghostTimeAt(p.dist - p.lap * race.track.length);
      if (gt != null) {
        const d = (now - p.lapStart) - gt;
        this.set('delta', this.delta, (d >= 0 ? '+' : '−') + Math.abs(d).toFixed(2));
        this.cls('delta', this.delta, 'ahead', d < 0);
        this.cls('deltaS', this.delta, 'show', true);
      } else this.cls('deltaS', this.delta, 'show', false);
    } else this.cls('deltaS', this.delta, 'show', false);
  }

  message(text, sub = '', kind = '', dur = 1.6) {
    this.msg.innerHTML = `<b>${text}</b>${sub ? `<small>${sub}</small>` : ''}`;
    this.msg.className = 'msg show ' + kind;
    clearTimeout(this.msgT);
    this.msgT = setTimeout(() => { this.msg.className = 'msg ' + kind; }, dur * 1000);
  }

  countdown(n) {
    this.count.textContent = n > 0 ? String(n) : '出发';
    this.count.className = 'count ' + (n > 0 ? 'num' : 'go');
    void this.count.offsetWidth;
    this.count.classList.add('pop');
    clearTimeout(this.countT);
    this.countT = setTimeout(() => { this.count.className = 'count'; }, n > 0 ? 900 : 1100);
  }
}
