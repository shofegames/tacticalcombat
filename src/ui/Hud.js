// HUD de partida: retícula dinámica, mira telescópica, marcadores de impacto, indicadores de daño,
// vida, munición, radar, marcador del modo, killfeed, avisos, pantalla de muerte, tabla (Tab)
// y pantalla de resultados. Todo en DOM sobre el canvas; las escrituras se cachean por frame.
import { F_MOVE } from '../../shared/collision.js';
import { MODES, TEAM_NAMES } from '../game/Modes.js';
import { store, keyLabel } from '../core/Settings.js';

const DEG = Math.PI / 180;
const FIRE_MODE = { auto: 'AUTO', semi: 'SEMI', bolt: 'CERROJO', pump: 'CORREDERA', burst: 'RÁFAGA' };
const ZONE_LABEL = { head: 'CABEZA', torso: 'TORSO', legs: 'PIERNAS' };
const STREAKS = { 3: 'RACHA ×3', 5: 'IMPARABLE ×5', 7: 'DEVASTADOR ×7', 10: 'LEYENDA ×10', 15: 'INTOCABLE ×15' };

const h = (tag, cls, parent, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  if (parent) parent.appendChild(e);
  return e;
};
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fmtTime = (s) => { s = Math.max(0, Math.ceil(s)); return `${(s / 60) | 0}:${String(s % 60).padStart(2, '0')}`; };

export class Hud {
  constructor(parent) {
    const root = (this.root = h('div', 'hud hidden', parent));
    root.id = 'hud';
    this.vignette = h('div', 'hud-vignette', root);
    this.scope = h('div', 'hud-scope', root);
    h('div', 'scope-lines', this.scope);
    // retícula
    this.cross = h('div', 'crosshair', root);
    this.crossBars = ['t', 'b', 'l', 'r'].map((s) => h('i', 'cb cb-' + s, this.cross));
    this.crossDot = h('i', 'cdot', this.cross);
    this.hitm = h('div', 'hitmarker', root);
    for (let i = 0; i < 4; i++) h('i', '', this.hitm);
    this.dmgDirs = h('div', 'dmg-dirs', root);
    this.dirs = [];
    // marcador superior
    this.top = h('div', 'hud-top', root);
    this.scoreEl = h('div', 'score', this.top);
    this.zonesEl = h('div', 'zones', this.top);
    this.objective = h('div', 'objective', this.top);
    // radar
    this.radarWrap = h('div', 'radar', root);
    this.radar = h('canvas', '', this.radarWrap);
    this.radar.width = this.radar.height = 200;
    this.rctx = this.radar.getContext('2d');
    // killfeed y notas
    this.feed = h('div', 'killfeed', root);
    // vida
    this.healthEl = h('div', 'health', root);
    this.hpNum = h('div', 'hp-num', this.healthEl);
    const bar = h('div', 'hp-bar', this.healthEl);
    this.hpFill = h('div', 'hp-fill', bar);
    this.hpLag = h('div', 'hp-lag', bar);
    // munición
    this.ammoEl = h('div', 'ammo', root);
    this.wName = h('div', 'w-name', this.ammoEl);
    const row = h('div', 'ammo-row', this.ammoEl);
    this.magEl = h('span', 'mag', row);
    this.resEl = h('span', 'reserve', row);
    this.wMode = h('div', 'w-mode', this.ammoEl);
    this.slotsEl = h('div', 'slots', this.ammoEl);
    this.hint = h('div', 'hint', root);
    // centro: avisos, banner de baja, entrenamiento
    this.toastEl = h('div', 'toast', root);
    this.banner = h('div', 'kill-banner', root);
    this.trainEl = h('div', 'train-info', root);
    this.fpsEl = h('div', 'fps', root);
    this.preEl = h('div', 'pre-count', root);
    // muerte
    this.deathEl = h('div', 'death hidden', root);
    // marcador completo y resultados
    this.board = h('div', 'scoreboard hidden', root);
    this.resultsEl = h('div', 'results hidden', root);
    this.onExit = null; this.onRematch = null;
    this._c = {};
  }

  // ------------------------------------------------------------------ ciclo de vida
  attach(game) {
    this.game = game;
    this.root.classList.remove('hidden');
    this.root.classList.toggle('training', game.opts.mode === 'training');
    this.feed.innerHTML = ''; this.dmgDirs.innerHTML = ''; this.dirs = [];
    this.resultsEl.classList.add('hidden'); this.deathEl.classList.add('hidden'); this.board.classList.add('hidden');
    game._statsAtStart = { shots: store.stats.shots, hits: store.stats.hits };
    this._boardOn = false;
    this._c = {}; this._toastT = 0; this._bannerT = 0; this._hitT = 0; this._sup = 0; this._trainT = 0; this._lag = 100; this._boardT = 0;
    this.zonesEl.innerHTML = ''; this._zoneEls = null;
    this._buildRadarImage();
    this.weaponChanged(game.weapons.def);
  }
  detach() {
    this.root.classList.add('hidden');
    this.game = null;
    const fx = this._fx(); if (fx) { fx.uDamage.value = 0; fx.uDesat.value = 0; fx.uFlash.value = 0; }
  }
  _fx() { return this.game?.engine.fx; }
  _set(key, el, prop, val) { if (this._c[key] !== val) { this._c[key] = val; el[prop] = val; } }

  // ------------------------------------------------------------------ eventos de juego
  onSpawn() {
    this.deathEl.classList.add('hidden');
    this._lag = 100;
    const fx = this._fx(); if (fx) fx.uDesat.value = 0;
  }
  weaponChanged(def) {
    if (!this.game) return;
    this._set('wname', this.wName, 'textContent', def.name.toUpperCase());
    this._set('wmode', this.wMode, 'textContent', FIRE_MODE[def.mode] || def.mode.toUpperCase());
    const ws = this.game.weapons;
    this.slotsEl.innerHTML = ws.slots.map((s, i) => `<span class="${i === ws.cur ? 'on' : ''}"><b>${i + 1}</b>${esc(s.def.name)}</span>`).join('');
  }
  hitmarker(head, kill) {
    this._hitT = kill ? 0.45 : 0.22;
    this.hitm.className = 'hitmarker show' + (kill ? ' kill' : head ? ' head' : '');
    this.hitm.style.animation = 'none'; void this.hitm.offsetWidth; this.hitm.style.animation = '';
  }
  trainingHit(zone, dmg, dist) {
    this.trainEl.innerHTML = `<b>${ZONE_LABEL[zone] || zone}</b> · ${Math.round(dmg)} de daño · ${dist.toFixed(1)} m`;
    this.trainEl.classList.add('show'); this._trainT = 2.5;
  }
  suppress() { this._sup = Math.min(1, this._sup + 0.35); }
  hurt(attacker, amount) {
    this._hurtPulse = Math.min(1, (this._hurtPulse || 0) + amount / 60);
    if (!attacker || attacker === this.game.player) return;
    let d = this.dirs.find((x) => x.a === attacker);
    if (!d) { d = { a: attacker, el: h('div', 'dmg-dir', this.dmgDirs), t: 0 }; h('i', '', d.el); this.dirs.push(d); }
    d.t = 1.6; d.x = attacker.body.x; d.z = attacker.body.z;
  }
  killBanner(victim, head, streak) {
    const s = STREAKS[streak];
    this.banner.innerHTML = `<div class="kb-main">${head ? '<span class="hs">⌖ DISPARO A LA CABEZA</span>' : 'ELIMINADO'}</div><div class="kb-name">${esc(victim.name)}</div>`
      + `<div class="kb-pts">+${100 + (head ? 25 : 0)}</div>` + (s ? `<div class="kb-streak">${s}</div>` : '');
    this._bannerT = 2.2; this.banner.classList.remove('show'); void this.banner.offsetWidth; this.banner.classList.add('show');
  }
  assist(victim) { this.feedNote(`Asistencia · ${victim.name} · +50`, true); }
  died(killer, def, respawnT) {
    const g = this.game, by = killer && killer !== g.player;
    const wname = def ? def.name : 'Caída';
    this.deathEl.innerHTML = `<div class="d-title">${by ? 'ELIMINADO' : 'HAS MUERTO'}</div>`
      + (by ? `<div class="d-by">por <b class="${this._side(killer)}">${esc(killer.name)}</b> · ${esc(wname)}</div>`
        + `<div class="d-hp">Le quedaba ${Math.max(1, Math.round(killer.health))} de vida</div>` : `<div class="d-by">${esc(wname)}</div>`)
      + `<div class="d-resp">Reapareces en <span>${Math.ceil(respawnT)}</span></div>`;
    this._deathResp = this.deathEl.querySelector('.d-resp span');
    this.deathEl.classList.remove('hidden');
    this.scope.classList.remove('show');
  }
  killfeed(killer, victim, def, head) {
    const e = h('div', 'kf');
    const k = killer && killer !== victim ? `<b class="${this._side(killer)}">${esc(killer.name)}</b>` : '';
    const w = def ? esc(def.name) : 'caída';
    e.innerHTML = `${k}<span class="kf-w">${w}${head ? ' <em>⌖</em>' : ''}</span><b class="${this._side(victim)}">${esc(victim.name)}</b>`;
    if (killer === this.game.player || victim === this.game.player) e.classList.add('me');
    this._pushFeed(e);
  }
  feedNote(text, good) { this._pushFeed(h('div', 'kf note ' + (good ? 'good' : 'bad'), null, text)); }
  _pushFeed(e) {
    e._t = 6; this.feed.prepend(e);
    while (this.feed.children.length > 6) this.feed.lastChild.remove();
  }
  toast(text, dur = 2) {
    this.toastEl.textContent = text; this._toastT = dur;
    this.toastEl.classList.remove('show'); void this.toastEl.offsetWidth; this.toastEl.classList.add('show');
  }
  showScoreboard(on) {
    if (!this.game || this.game.over || on === this._boardOn) return;
    this._boardOn = on;
    this.board.classList.toggle('hidden', !on);
    if (on) { this._boardT = 0.5; this.board.innerHTML = this._boardHTML(); }
  }

  /** Bando de un combatiente respecto al jugador (para colores). */
  _side(c) {
    const p = this.game.player;
    if (c === p) return 'self';
    if (this.game.mode.ffa) return 'enemy';
    return c.team === p.team ? 'ally' : 'enemy';
  }

  // ------------------------------------------------------------------ tabla
  _boardHTML() {
    const g = this.game, m = g.mode, p = g.player, dom = g.opts.mode === 'dom';
    const row = (c) => `<tr class="${c === p ? 'me' : ''}${c.alive ? '' : ' dead'}"><td class="n ${this._side(c)}">${esc(c.name)}${c.isBot ? '' : ' ★'}</td>`
      + `<td>${c.score}</td><td>${c.kills}</td><td>${c.deaths}</td><td>${c.assists}</td>${dom ? `<td>${c.captures}</td>` : ''}`
      + `<td>${c.deaths ? (c.kills / c.deaths).toFixed(2) : c.kills.toFixed(2)}</td></tr>`;
    const head = `<tr><th>Nombre</th><th>Puntos</th><th>Bajas</th><th>Muertes</th><th>Asist.</th>${dom ? '<th>Capt.</th>' : ''}<th>K/D</th></tr>`;
    const sort = (l) => l.sort((a, b) => b.score - a.score || b.kills - a.kills);
    const title = `<div class="sb-title">${m.def.name} · ${esc(g.mapInfo.name)}${m.timeLimit > 0 ? ` · ${fmtTime(m.timeLeft)}` : ''}</div>`;
    if (m.ffa || g.opts.mode === 'training') return `${title}<table>${head}${sort([...g.combatants]).map(row).join('')}</table>`;
    const mine = p.team, op = mine === 'a' ? 'b' : 'a';
    const block = (t, cls) => `<div class="sb-team ${cls}"><div class="sb-th"><span>${TEAM_NAMES[t]}</span><b>${m.scores[t]}</b></div>`
      + `<table>${head}${sort(g.combatants.filter((c) => c.team === t)).map(row).join('')}</table></div>`;
    return title + block(mine, 'ally') + block(op, 'enemy');
  }

  // ------------------------------------------------------------------ resultados
  results(r) {
    const g = this.game, p = g.player, training = g.opts.mode === 'training';
    this.deathEl.classList.add('hidden'); this.board.classList.add('hidden'); this.scope.classList.remove('show');
    const reason = r.reason === 'time' ? 'Tiempo agotado' : r.reason === 'score' ? 'Límite de puntuación alcanzado' : '';
    let verdict, cls;
    if (training) { verdict = 'ENTRENAMIENTO FINALIZADO'; cls = 'draw'; }
    else if (g.mode.ffa) { verdict = r.won ? 'VICTORIA' : 'DERROTA'; cls = r.won ? 'win' : 'lose'; }
    else if (!r.winner) { verdict = 'EMPATE'; cls = 'draw'; }
    else { verdict = r.won ? 'VICTORIA' : 'DERROTA'; cls = r.won ? 'win' : 'lose'; }
    const mine = p.team, op = mine === 'a' ? 'b' : 'a';
    const score = g.mode.ffa
      ? `<div class="r-sub">Ganador: <b>${esc(r.winnerC ? r.winnerC.name : '—')}</b> con ${r.winnerC ? r.winnerC.kills : 0} bajas</div>`
      : training ? '' : `<div class="r-score"><span class="ally">${TEAM_NAMES[mine]} <b>${r.scores[mine]}</b></span><i>—</i><span class="enemy"><b>${r.scores[op]}</b> ${TEAM_NAMES[op]}</span></div>`;
    const sorted = [...g.combatants].sort((a, b) => b.score - a.score);
    const place = sorted.indexOf(p) + 1;
    const acc = this._matchAcc();
    this.resultsEl.innerHTML = `<div class="r-card">
      <div class="r-verdict ${cls}">${verdict}</div><div class="r-reason">${reason}</div>${score}
      <div class="r-stats">
        <div><b>${p.kills}</b><span>Bajas</span></div><div><b>${p.deaths}</b><span>Muertes</span></div>
        <div><b>${p.assists}</b><span>Asistencias</span></div><div><b>${p.score}</b><span>Puntos</span></div>
        <div><b>${acc}</b><span>Precisión</span></div><div><b>${place}º</b><span>Posición</span></div>
      </div>
      ${this._boardHTML()}
      <div class="r-btns"><button class="btn primary" data-a="rematch">REVANCHA</button><button class="btn" data-a="exit">MENÚ PRINCIPAL</button></div>
    </div>`;
    this.resultsEl.querySelector('[data-a=rematch]').onclick = () => this.onRematch?.();
    this.resultsEl.querySelector('[data-a=exit]').onclick = () => this.onExit?.();
    this.resultsEl.classList.remove('hidden');
  }
  _matchAcc() {
    const g = this.game, st = store.stats, s0 = g._statsAtStart;
    if (!s0) return '—';
    const shots = st.shots - s0.shots, hits = st.hits - s0.hits;
    return shots ? `${Math.round((hits / shots) * 100)} %` : '—';
  }

  // ------------------------------------------------------------------ radar
  _buildRadarImage() {
    const g = this.game, b = g.mapDef.bounds, k = 4;
    const w = Math.ceil((b.maxx - b.minx) * k), hh = Math.ceil((b.maxz - b.minz) * k);
    const c = document.createElement('canvas'); c.width = w; c.height = hh;
    const x = c.getContext('2d');
    x.fillStyle = 'rgba(20,26,30,0.55)'; x.fillRect(0, 0, w, hh);
    const fy = g.mapDef.floorY ?? 0;
    const boxes = g.world.boxes.filter((bx) => (bx.flags & F_MOVE) && bx.maxy - bx.miny > 0.9 && bx.maxy > fy + 1.1).sort((a, b2) => a.maxy - b2.maxy);
    for (const bx of boxes) {
      const l = Math.min(1, (bx.maxy - fy) / 12);
      x.fillStyle = `rgba(${150 + l * 70},${160 + l * 70},${165 + l * 70},${0.35 + l * 0.35})`;
      x.fillRect((bx.minx - b.minx) * k, (bx.minz - b.minz) * k, (bx.maxx - bx.minx) * k, (bx.maxz - bx.minz) * k);
    }
    this._rimg = c; this._rk = k;
  }
  _drawRadar() {
    const g = this.game, p = g.player, x = this.rctx, W = 200, R = 100, scale = 2.2; // px por metro
    const b = g.mapDef.bounds, k = this._rk;
    x.clearRect(0, 0, W, W);
    x.save();
    x.beginPath(); x.arc(R, R, R - 2, 0, Math.PI * 2); x.clip();
    x.fillStyle = 'rgba(8,12,14,0.6)'; x.fillRect(0, 0, W, W);
    x.translate(R, R); x.rotate(p.yaw); x.scale(scale, scale); x.translate(-p.body.x, -p.body.z);
    x.drawImage(this._rimg, b.minx, b.minz, this._rimg.width / k, this._rimg.height / k);
    // zonas de dominación
    const zones = g.mode.zones;
    if (zones) for (const z of zones) {
      x.beginPath(); x.arc(z.x, z.z, z.r, 0, Math.PI * 2);
      x.fillStyle = z.owner ? (z.owner === p.team ? 'rgba(58,141,255,0.35)' : 'rgba(255,74,58,0.35)') : 'rgba(255,255,255,0.18)';
      x.fill();
    }
    x.restore();
    // combatientes (en coordenadas de pantalla para que no giren las flechas)
    const sin = Math.sin(p.yaw), cos = Math.cos(p.yaw), t = g.time;
    const toScr = (wx, wz) => { const dx = wx - p.body.x, dz = wz - p.body.z; return [R + (dx * cos - dz * sin) * scale, R + (dx * sin + dz * cos) * scale]; };
    if (zones) for (const z of zones) {
      let [sx, sy] = toScr(z.x, z.z); const dd = Math.hypot(sx - R, sy - R);
      if (dd > R - 12) { sx = R + ((sx - R) / dd) * (R - 12); sy = R + ((sy - R) / dd) * (R - 12); }
      x.font = 'bold 13px Rajdhani, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillStyle = z.owner ? (z.owner === p.team ? '#5aa2ff' : '#ff5a4a') : '#fff'; x.fillText(z.name, sx, sy);
    }
    for (const c of g.combatants) {
      if (c === p || !c.alive) continue;
      const enemy = g.hostile(p, c);
      const fired = t - (c._pingT ?? -99);
      if (enemy && fired > 2.2) continue;
      const [sx, sy] = toScr(c.body.x, c.body.z);
      if (Math.hypot(sx - R, sy - R) > R - 4) continue;
      x.globalAlpha = enemy ? Math.min(1, (2.2 - fired) / 0.8) : 1;
      x.fillStyle = enemy ? '#ff4a3a' : '#4aa0ff';
      x.beginPath(); x.arc(sx, sy, 4, 0, Math.PI * 2); x.fill();
      x.globalAlpha = 1;
    }
    // jugador
    x.fillStyle = '#fff'; x.beginPath(); x.moveTo(R, R - 7); x.lineTo(R + 5, R + 5); x.lineTo(R, R + 2); x.lineTo(R - 5, R + 5); x.closePath(); x.fill();
    // cono de visión
    x.fillStyle = 'rgba(255,255,255,0.06)'; x.beginPath(); x.moveTo(R, R); x.arc(R, R, R, -Math.PI / 2 - 0.6, -Math.PI / 2 + 0.6); x.closePath(); x.fill();
  }

  // ------------------------------------------------------------------ actualización por frame
  update(dt) {
    const g = this.game; if (!g) return;
    const p = g.player, ws = g.weapons, s = ws.slot, d = s.def, m = g.mode, fx = this._fx();
    if (this._c.dead !== !p.alive) { this._c.dead = !p.alive; this.root.classList.toggle('dead', !p.alive); }
    // --- retícula ---
    const scoped = p.alive && d.scope && ws.ads > 0.92;
    this.scope.classList.toggle('show', scoped);
    const crossOn = p.alive && !g.over && !scoped && ws.ads < 0.55 && !p.sprinting;
    this.cross.style.opacity = crossOn ? 1 - ws.ads / 0.55 : 0;
    if (crossOn) {
      const cam = g.engine.camera;
      const px = (Math.tan(ws.spread() * DEG) / Math.tan((cam.fov * DEG) / 2)) * (innerHeight / 2);
      const gap = Math.max(4, Math.min(90, px)) | 0;
      if (this._c.gap !== gap) {
        this._c.gap = gap;
        this.crossBars[0].style.transform = `translate(-50%, ${-gap - 10}px)`;
        this.crossBars[1].style.transform = `translate(-50%, ${gap}px)`;
        this.crossBars[2].style.transform = `translate(${-gap - 10}px, -50%)`;
        this.crossBars[3].style.transform = `translate(${gap}px, -50%)`;
      }
      const col = store.settings.crosshairColor;
      if (this._c.ccol !== col) { this._c.ccol = col; this.cross.style.setProperty('--cc', col); }
    }
    if (this._hitT > 0) { this._hitT -= dt; if (this._hitT <= 0) this.hitm.className = 'hitmarker'; }

    // --- vida ---
    const hp = Math.max(0, Math.round(p.health));
    this._set('hp', this.hpNum, 'textContent', String(hp));
    if (this._c.hpw !== hp) { this._c.hpw = hp; this.hpFill.style.width = hp + '%'; this.healthEl.classList.toggle('low', hp <= 35); }
    this._lag += (hp - this._lag) * Math.min(1, dt * (this._lag > hp ? 2.5 : 20));
    this.hpLag.style.width = this._lag.toFixed(1) + '%';
    // --- munición ---
    this._set('mag', this.magEl, 'textContent', String(s.mag));
    this._set('res', this.resEl, 'textContent', ws.infinite ? '∞' : String(s.reserve));
    const low = s.mag <= Math.ceil(d.mag * 0.25);
    this.magEl.classList.toggle('low', low);
    if (this._c.cur !== ws.cur || this._c.curId !== d.id) { this._c.cur = ws.cur; this._c.curId = d.id; this.weaponChanged(d); }
    let hint = '';
    if (p.alive && !g.over) {
      if (s.mag === 0 && s.reserve === 0 && !ws.infinite) hint = 'SIN MUNICIÓN';
      else if (low && ws.state === 'ready') hint = `[${keyLabel('reload')}] RECARGAR`;
      else if (ws.state === 'reload' || ws.state.startsWith('shell')) hint = 'RECARGANDO…';
    }
    this._set('hint', this.hint, 'textContent', hint);

    // --- marcador del modo ---
    const info = m.hudInfo();
    let sc = '';
    if (info.kind === 'teams') {
      const lim = info.limit;
      sc = `<div class="sc ally"><b>${info.mine}</b><div class="bar"><i style="width:${Math.min(100, (info.mine / lim) * 100)}%"></i></div></div>`
        + `<div class="clock">${m.timeLimit > 0 ? fmtTime(m.timeLeft) : '∞'}<small>${MODES[g.opts.mode].short} · ${lim}</small></div>`
        + `<div class="sc enemy"><b>${info.theirs}</b><div class="bar"><i style="width:${Math.min(100, (info.theirs / lim) * 100)}%"></i></div></div>`;
    } else if (info.kind === 'ffa') {
      sc = `<div class="sc ${info.lead ? 'ally' : 'neutral'}"><b>${info.mine}</b><small>TÚ</small></div>`
        + `<div class="clock">${m.timeLimit > 0 ? fmtTime(m.timeLeft) : '∞'}<small>FFA · ${info.limit}</small></div>`
        + `<div class="sc enemy"><b>${info.theirs}</b><small>${esc(info.leaderName.toUpperCase())}</small></div>`;
    } else {
      sc = `<div class="clock">ENTRENAMIENTO<small>${info.kills} bajas</small></div>`;
    }
    this._set('score', this.scoreEl, 'innerHTML', sc);
    this._set('obj', this.objective, 'textContent', info.objective);
    if (info.zones) this._updateZones(info);
    // --- cuenta atrás inicial ---
    const pre = m.state === 'pre' ? Math.ceil(m.preT) : 0;
    this._set('pre', this.preEl, 'textContent', pre > 0 ? String(pre) : '');

    // --- indicadores de daño ---
    const sin = Math.sin(p.yaw), cos = Math.cos(p.yaw);
    for (let i = this.dirs.length - 1; i >= 0; i--) {
      const dd = this.dirs[i];
      dd.t -= dt;
      if (dd.t <= 0) { dd.el.remove(); this.dirs.splice(i, 1); continue; }
      if (dd.a.alive) { dd.x = dd.a.body.x; dd.z = dd.a.body.z; }
      const dx = dd.x - p.body.x, dz = dd.z - p.body.z;
      const f = -dx * sin - dz * cos, r = dx * cos - dz * sin;
      dd.el.style.transform = `rotate(${Math.atan2(r, f)}rad)`;
      dd.el.style.opacity = Math.min(1, dd.t / 0.6).toFixed(2);
    }
    // --- efectos de pantalla ---
    this._hurtPulse = Math.max(0, (this._hurtPulse || 0) - dt * 1.8);
    this._sup = Math.max(0, this._sup - dt * 1.5);
    this.vignette.style.opacity = Math.min(1, this._sup * 0.8 + this._hurtPulse * 0.5).toFixed(2);
    if (fx) {
      const lowHp = p.alive ? Math.max(0, 1 - p.health / 55) : 0;
      fx.uDamage.value = Math.min(0.85, lowHp * 0.55 + this._hurtPulse * 0.5);
      const desat = p.alive ? lowHp * 0.4 : Math.min(0.75, p.deathT * 1.2);
      fx.uDesat.value += (desat - fx.uDesat.value) * Math.min(1, dt * 6);
    }
    // --- muerte ---
    if (!p.alive && this._deathResp && !g.over) this._deathResp.textContent = String(Math.max(0, Math.ceil(p.respawnT)));

    // --- textos temporales ---
    if (this._toastT > 0) { this._toastT -= dt; if (this._toastT <= 0) this.toastEl.classList.remove('show'); }
    if (this._bannerT > 0) { this._bannerT -= dt; if (this._bannerT <= 0) this.banner.classList.remove('show'); }
    if (this._trainT > 0) { this._trainT -= dt; if (this._trainT <= 0) this.trainEl.classList.remove('show'); }
    for (const e of this.feed.children) { e._t -= dt; if (e._t < 1) e.style.opacity = Math.max(0, e._t).toFixed(2); }
    for (const e of [...this.feed.children]) if (e._t <= 0) e.remove();
    // --- tabla abierta: refresco periódico ---
    if (this._boardOn) { this._boardT -= dt; if (this._boardT <= 0) { this._boardT = 0.5; this.board.innerHTML = this._boardHTML(); } }
    // --- radar y FPS ---
    this._radarT = (this._radarT || 0) - dt;
    if (this._radarT <= 0) { this._radarT = 1 / 30; this._drawRadar(); }
    this._set('fps', this.fpsEl, 'textContent', store.settings.showFps ? `${g.engine.fps} FPS` : '');
  }

  _updateZones(info) {
    if (!this._zoneEls) {
      this.zonesEl.innerHTML = '';
      this._zoneEls = info.zones.map((z) => { const e = h('div', 'zone', this.zonesEl); h('span', '', e, z.name); h('i', '', e); return e; });
    }
    info.zones.forEach((z, i) => {
      const e = this._zoneEls[i];
      const own = z.owner ? (z.owner === info.me ? 'ally' : 'enemy') : 'neutral';
      const progSide = z.prog === 0 ? '' : (z.prog > 0 ? 'a' : 'b') === info.me ? 'ally' : 'enemy';
      const cls = `zone ${own}${z.contested ? ' contested' : ''}${info.inside === z ? ' inside' : ''}`;
      if (e.className !== cls) e.className = cls;
      const fill = e.lastChild;
      const pct = Math.round(Math.abs(z.prog) * 100);
      if (fill._p !== pct || fill._s !== progSide) { fill._p = pct; fill._s = progSide; fill.style.height = pct + '%'; fill.className = progSide; }
    });
  }
}
