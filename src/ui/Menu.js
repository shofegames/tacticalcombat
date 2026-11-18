// Menús: principal (jugar, entrenamiento, equipamiento, ajustes, estadísticas), pausa y carga.
import { MAPS, PLAYABLE_MAPS } from '../../shared/maps/index.js';
import { WEAPONS, WEAPON_LIST, CATEGORIES } from '../../shared/weapons.js';
import { DIFFICULTY } from '../ai/Bot.js';
import { MODES } from '../game/Modes.js';
import { store, QUALITY, SKINS, WEAPON_FINISHES, KEY_LABELS } from '../core/Settings.js';
import { keyName } from '../core/Input.js';
import { audio } from '../core/Audio.js';
import { version as PKG_VERSION } from '../../package.json';
import { GEAR, TACTICALS } from '../../shared/gear.js';
import { levelInfo, unlockLevel, isUnlocked } from '../../shared/progression.js';

const level = () => levelInfo(store.progress.xp).level;
const lockTag = (kind, id) => `<em class="lock">🔒 NIVEL ${unlockLevel(kind, id)}</em>`;

export const VERSION = 'v' + PKG_VERSION.replace(/\.0$/, '');

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const loadJSON = (k, d) => { try { return { ...d, ...JSON.parse(localStorage.getItem(k) || '{}') }; } catch { return d; } };
const saveJSON = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sin almacenamiento */ } };
const TABS = [['play', 'JUGAR'], ['training', 'ENTRENAMIENTO'], ['loadout', 'EQUIPAMIENTO'], ['settings', 'AJUSTES'], ['stats', 'ESTADÍSTICAS']];
const TIPS = [
  'Agacharse reduce la dispersión y el retroceso.',
  'Correr te impide disparar durante un instante: suelta Mayús antes de girar una esquina.',
  'Los enemigos que disparan aparecen unos segundos en el radar.',
  'La vida se regenera tras cinco segundos sin recibir daño.',
  'Las escopetas pierden daño muy rápido con la distancia.',
  'En Dominación, varios aliados en una zona la capturan más rápido.',
  'Un disparo a la cabeza multiplica el daño. Apunta alto.',
  'Las balas que pasan cerca te desestabilizan: busca cobertura.',
  'Asómate con Q y E para disparar sin salir de la cobertura.',
  'Agáchate mientras corres para deslizarte y llegar antes a cubierto.',
  'Una granada de humo bloquea la visión de los bots durante 15 segundos.',
  'Si una aturdidora te pilla de espaldas, el efecto es mucho menor.',
  'Si ves el icono de granada en pantalla, ¡corre en dirección contraria!',
  'Cada partida da experiencia: sube de nivel para desbloquear armas y camuflajes.',
];

/** Valores normalizados (0‒1) para las barras de estadísticas de un arma. */
export function weaponStats(d) {
  const dmg = Math.min(1, (d.damage * Math.min(d.pellets, 5)) / 110);
  const rate = Math.min(1, d.rpm / 1100);
  const range = Math.min(1, (d.rangeNear + d.rangeFar) / 220);
  const control = Math.max(0.05, Math.min(1, 1 - (d.recoilV - 0.5) / 4.5));
  const mobility = Math.max(0.05, Math.min(1, (d.moveMult - 0.8) / 0.3));
  return [['Daño', dmg], ['Cadencia', rate], ['Alcance', range], ['Control', control], ['Movilidad', mobility]];
}

export class Menu {
  constructor(root, input) {
    this.root = root; this.input = input;
    this.onStart = null;      // (opts) => void
    this.match = loadJSON('tc.match', { mode: 'tdm', map: 'modern', difficulty: 'regular', bots: null, scoreLimit: null, timeLimit: null });
    this.train = loadJSON('tc.train', { hostileBots: false, difficulty: 'regular' });
    this.tab = 'play';
    root.innerHTML = `
      <div class="menu-shade"></div>
      <header class="m-head">
        <div class="logo"><b>TACTICAL</b><span>COMBAT</span></div>
        <nav>${TABS.map(([id, l]) => `<button data-tab="${id}">${l}</button>`).join('')}</nav>
        <div class="m-user"><div class="m-lvl"><b></b><div class="xp"><i></i></div><small class="xp-txt"></small></div><div><span class="m-name"></span><small>${VERSION}</small></div></div>
      </header>
      <main class="m-body"></main>
      <footer class="m-foot"><span>Ratón para apuntar · Clic izq. disparar · Clic der. apuntar · Esc pausa</span></footer>`;
    this.body = root.querySelector('.m-body');
    root.querySelectorAll('[data-tab]').forEach((b) => { b.onclick = () => { audio.uiSound('click'); this.show(b.dataset.tab); }; });
    root.addEventListener('mouseover', (e) => { if (e.target.closest('button, .card, .w-item') && e.target !== this._hov) { this._hov = e.target; audio.uiSound('hover'); } });
    this.show('play');
  }

  setVisible(v) { this.root.classList.toggle('hidden', !v); if (v) this.show(this.tab); }

  show(tab) {
    this.tab = tab;
    this.root.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
    this.root.querySelector('.m-name').textContent = store.settings.name;
    const li = levelInfo(store.progress.xp);
    this.root.querySelector('.m-lvl b').textContent = li.level;
    this.root.querySelector('.m-lvl .xp i').style.width = `${Math.round(li.frac * 100)}%`;
    this.root.querySelector('.m-lvl .xp-txt').textContent = li.max ? 'NIVEL MÁXIMO' : `${li.cur} / ${li.need} EXP`;
    this.body.className = 'm-body tab-' + tab;
    this['_' + tab](this.body);
  }

  // ------------------------------------------------------------------ JUGAR
  _play(el) {
    const m = this.match, md = MODES[m.mode];
    const bots = m.bots ?? md.bots, score = m.scoreLimit ?? md.score, time = m.timeLimit ?? md.time;
    const scoreMax = m.mode === 'dom' ? 500 : 150, scoreStep = m.mode === 'dom' ? 50 : 5;
    el.innerHTML = `
      <section class="panel">
        <h2>MODO DE JUEGO</h2>
        <div class="cards modes">${['tdm', 'ffa', 'dom'].map((id) => `<div class="card mode ${m.mode === id ? 'on' : ''}" data-mode="${id}">
          <b>${MODES[id].name}</b><p>${MODES[id].desc}</p></div>`).join('')}</div>
        <h2>MAPA</h2>
        <div class="cards maps">${PLAYABLE_MAPS.map((id) => `<div class="card map map-${id} ${m.map === id ? 'on' : ''}" data-map="${id}">
          <small>${MAPS[id].tag}</small><b>${MAPS[id].name}</b><p>${MAPS[id].desc}</p></div>`).join('')}</div>
      </section>
      <section class="panel side">
        <h2>OPCIONES DE PARTIDA</h2>
        <label class="opt">Dificultad de los bots<div class="seg">${Object.entries(DIFFICULTY).map(([k, d]) => `<button data-diff="${k}" class="${m.difficulty === k ? 'on' : ''}">${d.label}</button>`).join('')}</div></label>
        <label class="opt">Bots <output>${bots}</output><input type="range" min="1" max="15" step="1" value="${bots}" data-k="bots"></label>
        <label class="opt">${m.mode === 'dom' ? 'Puntos para ganar' : 'Bajas para ganar'} <output>${score}</output><input type="range" min="${scoreStep}" max="${scoreMax}" step="${scoreStep}" value="${score}" data-k="scoreLimit"></label>
        <label class="opt">Tiempo límite <output>${time} min</output><input type="range" min="3" max="30" step="1" value="${time}" data-k="timeLimit"></label>
        <div class="loadout-mini">${this._loadoutMini()}</div>
        <button class="btn primary big" data-go>DESPLEGAR</button>
      </section>
      <div class="m-deploy"><span>${MODES[m.mode].short} · ${esc(MAPS[m.map].name)}</span><button class="btn primary big" data-go>DESPLEGAR</button></div>`;
    el.querySelectorAll('[data-mode]').forEach((c) => { c.onclick = () => { audio.uiSound('click'); Object.assign(m, { mode: c.dataset.mode, bots: null, scoreLimit: null, timeLimit: null }); this._saveMatch(); this._play(el); }; });
    el.querySelectorAll('[data-map]').forEach((c) => { c.onclick = () => { audio.uiSound('click'); m.map = c.dataset.map; this._saveMatch(); this._play(el); }; });
    el.querySelectorAll('[data-diff]').forEach((c) => { c.onclick = () => { audio.uiSound('click'); m.difficulty = c.dataset.diff; this._saveMatch(); this._play(el); }; });
    el.querySelectorAll('input[type=range]').forEach((r) => {
      r.oninput = () => { m[r.dataset.k] = +r.value; r.previousElementSibling.textContent = r.dataset.k === 'timeLimit' ? `${r.value} min` : r.value; this._saveMatch(); };
    });
    el.querySelector('.loadout-mini').onclick = () => this.show('loadout');
    el.querySelectorAll('[data-go]').forEach((b) => { b.onclick = () => {
      audio.uiSound('click');
      this.onStart?.({ mode: m.mode, map: m.map, difficulty: m.difficulty, bots, scoreLimit: m.scoreLimit ?? score, timeLimit: m.timeLimit ?? time });
    }; });
  }
  _saveMatch() { saveJSON('tc.match', this.match); }
  _loadoutMini() {
    const l = store.loadout, lv = level();
    const p = isUnlocked('weapon', l.primary, lv) ? l.primary : 'mk4', s = isUnlocked('weapon', l.secondary, lv) ? l.secondary : 'p9';
    const tac = isUnlocked('tactical', l.tactical, lv) ? l.tactical : 'smoke';
    return `<small>EQUIPAMIENTO</small><div><b>${esc(WEAPONS[p].name)}</b> · ${esc(WEAPONS[s].name)}</div><div class="lm-gear">2× Granada · 2× ${GEAR[tac].short} · Cuchillo</div><span>Cambiar ›</span>`;
  }

  // ------------------------------------------------------------------ ENTRENAMIENTO
  _training(el) {
    const t = this.train;
    el.innerHTML = `
      <section class="panel wide">
        <h2>CAMPO DE TIRO</h2>
        <p class="lead">${MAPS.training.desc} Galería con dianas fijas y móviles a varias distancias, y una casa de asalto con bots.
        Munición infinita y armero: pulsa ${document.body.classList.contains('is-touch') ? 'el botón ARMERO' : `<kbd>${keyName(store.settings.keys.interact)}</kbd>`} para probar todas las armas del arsenal.</p>
        <label class="opt check"><input type="checkbox" data-k="hostileBots" ${t.hostileBots ? 'checked' : ''}> Bots hostiles en la casa de asalto</label>
        <label class="opt">Dificultad<div class="seg">${Object.entries(DIFFICULTY).map(([k, d]) => `<button data-diff="${k}" class="${t.difficulty === k ? 'on' : ''}">${d.label}</button>`).join('')}</div></label>
        <button class="btn primary big" data-go>ENTRAR AL CAMPO DE TIRO</button>
      </section>
      <div class="m-deploy"><span>CAMPO DE TIRO</span><button class="btn primary big" data-go>ENTRAR</button></div>`;
    el.querySelector('[data-k=hostileBots]').onchange = (e) => { t.hostileBots = e.target.checked; saveJSON('tc.train', t); };
    el.querySelectorAll('[data-diff]').forEach((c) => { c.onclick = () => { t.difficulty = c.dataset.diff; saveJSON('tc.train', t); this._training(el); }; });
    el.querySelectorAll('[data-go]').forEach((b) => { b.onclick = () => { audio.uiSound('click'); this.onStart?.({ mode: 'training', map: 'training', difficulty: t.difficulty, hostileBots: t.hostileBots }); }; });
  }

  // ------------------------------------------------------------------ EQUIPAMIENTO
  _loadout(el) {
    const l = store.loadout, lv = level();
    // si algo equipado quedó bloqueado (p. ej. progreso reiniciado), volver a lo básico
    if (!isUnlocked('weapon', l.primary, lv)) l.primary = 'mk4';
    if (!isUnlocked('weapon', l.secondary, lv)) l.secondary = 'p9';
    if (!isUnlocked('skin', l.skin, lv)) l.skin = 'woodland';
    if (!isUnlocked('finish', l.finish, lv)) l.finish = 'standard';
    if (!isUnlocked('tactical', l.tactical, lv)) l.tactical = 'smoke';
    this._sel = this._sel && WEAPONS[this._sel] ? this._sel : l.primary;
    const groups = {};
    for (const w of WEAPON_LIST) (groups[w.category] ||= []).push(w);
    const item = (w) => {
      const eq = w.id === l.primary || w.id === l.secondary, open = isUnlocked('weapon', w.id, lv);
      return `<div class="w-item ${w.id === this._sel ? 'sel' : ''} ${eq ? 'eq' : ''} ${open ? '' : 'locked'}" data-w="${w.id}"><span>${esc(w.name)}</span>${eq ? `<em>${w.slot === 'secondary' ? 'SECUNDARIA' : 'PRINCIPAL'}</em>` : open ? '' : lockTag('weapon', w.id)}</div>`;
    };
    const d = WEAPONS[this._sel];
    const equipped = d.id === l.primary || d.id === l.secondary, dOpen = isUnlocked('weapon', d.id, lv);
    const opt = (kind, k, cur, label, swatch) => {
      const open = isUnlocked(kind, k, lv);
      return `<button data-${kind}="${k}" class="${cur === k ? 'on' : ''} ${open ? '' : 'locked'}" ${open ? '' : 'disabled'} title="${open ? '' : `Se desbloquea en el nivel ${unlockLevel(kind, k)}`}">${swatch}${label}${open ? '' : ` <small>🔒${unlockLevel(kind, k)}</small>`}</button>`;
    };
    el.innerHTML = `
      <section class="panel list">
        ${Object.entries(groups).map(([cat, ws]) => `<h3>${CATEGORIES[cat]}</h3>${ws.map(item).join('')}`).join('')}
      </section>
      <section class="panel detail">
        <small class="cat">${CATEGORIES[d.category]} · ${d.slot === 'secondary' ? 'Arma secundaria' : 'Arma principal'}</small>
        <h2 class="w-title">${esc(d.name)}</h2>
        <p class="lead">${esc(d.desc || '')}</p>
        <div class="stats">${weaponStats(d).map(([n, v]) => `<div class="stat"><span>${n}</span><div class="bar"><i style="width:${Math.round(v * 100)}%"></i></div></div>`).join('')}</div>
        <div class="specs">
          <div><b>${d.damage}${d.pellets > 1 ? ` ×${d.pellets}` : ''}</b><span>Daño</span></div>
          <div><b>${d.rpm}</b><span>Disp./min</span></div>
          <div><b>${d.mag}</b><span>Cargador</span></div>
          <div><b>${d.reloadType === 'shell' ? `${d.shellTime}s/u` : `${d.reloadTime}s`}</b><span>Recarga</span></div>
        </div>
        <button class="btn primary" data-equip ${equipped || !dOpen ? 'disabled' : ''}>${!dOpen ? `🔒 SE DESBLOQUEA EN EL NIVEL ${unlockLevel('weapon', d.id)}` : equipped ? 'EQUIPADA' : d.slot === 'secondary' ? 'EQUIPAR COMO SECUNDARIA' : 'EQUIPAR COMO PRINCIPAL'}</button>
        <h3>GRANADAS</h3>
        <p class="lead small">Siempre llevas 2 granadas de fragmentación (<b>${keyName(store.settings.keys.lethal)}</b>) y un cuchillo (<b>${keyName(store.settings.keys.melee)}</b>). Elige tu granada táctica (<b>${keyName(store.settings.keys.tactical)}</b>):</p>
        <div class="seg wrap tac">${TACTICALS.map((k) => opt('tactical', k, l.tactical, GEAR[k].name, `<i class="ico ${k}"></i>`)).join('')}</div>
        <p class="lead small tac-desc">${esc(GEAR[l.tactical].desc)}</p>
        <h3>APARIENCIA</h3>
        <label class="opt">Camuflaje del uniforme<div class="seg wrap">${Object.entries(SKINS).map(([k, s]) => opt('skin', k, l.skin, s.name, `<i class="sw" style="background:#${s.cloth.toString(16).padStart(6, '0')}"></i>`)).join('')}</div></label>
        <label class="opt">Acabado del arma<div class="seg wrap">${Object.entries(WEAPON_FINISHES).map(([k, f]) => opt('finish', k, l.finish, f.name, `<i class="sw" style="background:${f.color != null ? '#' + f.color.toString(16).padStart(6, '0') : '#2b2d2f'}"></i>`)).join('')}</div></label>
      </section>`;
    el.querySelectorAll('[data-w]').forEach((e) => { e.onclick = () => { audio.uiSound('click'); this._sel = e.dataset.w; this._loadout(el); }; });
    el.querySelector('[data-equip]').onclick = () => {
      if (!dOpen) return;
      audio.uiSound('click');
      if (d.slot === 'secondary') l.secondary = d.id; else l.primary = d.id;
      store.saveLoadout(); this._loadout(el);
    };
    el.querySelectorAll('[data-skin]').forEach((e) => { e.onclick = () => { l.skin = e.dataset.skin; store.saveLoadout(); this._loadout(el); }; });
    el.querySelectorAll('[data-finish]').forEach((e) => { e.onclick = () => { l.finish = e.dataset.finish; store.saveLoadout(); this._loadout(el); }; });
    el.querySelectorAll('[data-tactical]').forEach((e) => { e.onclick = () => { l.tactical = e.dataset.tactical; store.saveLoadout(); this._loadout(el); }; });
    const sel = el.querySelector('.w-item.sel'); if (sel) sel.scrollIntoView({ block: 'nearest' });
  }

  // ------------------------------------------------------------------ AJUSTES
  _settings(el) { renderSettings(el, this.input); }

  // ------------------------------------------------------------------ ESTADÍSTICAS
  _stats(el) {
    const s = store.stats;
    const kd = s.deaths ? (s.kills / s.deaths).toFixed(2) : s.kills.toFixed(2);
    const acc = s.shots ? Math.round((s.hits / s.shots) * 100) + ' %' : '—';
    const hs = s.kills ? Math.round((s.headshots / s.kills) * 100) + ' %' : '—';
    const win = s.matches ? Math.round((s.wins / s.matches) * 100) + ' %' : '—';
    const hrs = s.timePlayed / 3600, time = hrs >= 1 ? `${hrs.toFixed(1)} h` : `${Math.round(s.timePlayed / 60)} min`;
    const top = Object.entries(s.weaponKills).filter(([id]) => WEAPONS[id]).sort((a, b) => b[1] - a[1]).slice(0, 6);
    const max = top.length ? top[0][1] : 1;
    const cards = [['Bajas', s.kills], ['Muertes', s.deaths], ['K/D', kd], ['Precisión', acc], ['Disparos a la cabeza', hs], ['Mejor racha', s.bestStreak],
      ['Partidas', s.matches], ['Victorias', s.wins], ['% victorias', win], ['Capturas', s.captures], ['Baja más lejana', `${s.longestKill || 0} m`], ['Tiempo jugado', time]];
    el.innerHTML = `
      <section class="panel wide">
        <h2>ESTADÍSTICAS DE SERVICIO</h2>
        <div class="stat-grid">${cards.map(([n, v]) => `<div><b>${v}</b><span>${n}</span></div>`).join('')}</div>
        <h3>ARMAS MÁS USADAS</h3>
        ${top.length ? `<div class="stats">${top.map(([id, k]) => `<div class="stat"><span>${esc(WEAPONS[id].name)}</span><div class="bar"><i style="width:${(k / max) * 100}%"></i></div><em>${k}</em></div>`).join('')}</div>` : '<p class="lead">Todavía no hay bajas registradas.</p>'}
        <button class="btn danger" data-reset>REINICIAR ESTADÍSTICAS</button>
      </section>`;
    el.querySelector('[data-reset]').onclick = (e) => {
      if (e.target.dataset.sure) { store.resetStats(); this._stats(el); return; }
      e.target.dataset.sure = '1'; e.target.textContent = '¿SEGURO? PULSA DE NUEVO';
    };
  }
}

/** Panel de ajustes (compartido por el menú principal y el de pausa). */
export function renderSettings(el, input) {
  const s = store.settings;
  const range = (k, label, min, max, step, fmt = (v) => v) => `<label class="opt">${label} <output>${fmt(s[k])}</output><input type="range" min="${min}" max="${max}" step="${step}" value="${s[k]}" data-k="${k}" data-num></label>`;
  const check = (k, label) => `<label class="opt check"><input type="checkbox" data-k="${k}" ${s[k] ? 'checked' : ''}> ${label}</label>`;
  const pct = (v) => `${Math.round(v * 100)} %`;
  const seg = (k, label, opts) => `<label class="opt">${label}<div class="seg">${opts.map(([v, l]) => `<button data-set="${k}" data-v="${v}" class="${s[k] === v ? 'on' : ''}">${l}</button>`).join('')}</div></label>`;
  el.innerHTML = `
    <section class="panel">
      <h2>GRÁFICOS</h2>
      <label class="opt">Calidad<div class="seg">${Object.entries(QUALITY).map(([k, q]) => `<button data-q="${k}" class="${s.quality === k ? 'on' : ''}">${q.label}</button>`).join('')}</div></label>
      ${range('fov', 'Campo de visión', 60, 110, 1, (v) => `${v}°`)}
      ${range('headBob', 'Balanceo de cámara', 0, 1, 0.05, pct)}
      ${check('dynamicRes', 'Resolución dinámica (baja la resolución si faltan FPS)')}
      ${check('autoQuality', 'Bajar la calidad automáticamente si el equipo no llega')}
      ${check('showFps', 'Mostrar FPS')}
      <h2>AUDIO</h2>
      ${range('master', 'Volumen general', 0, 1, 0.05, pct)}
      ${range('sfx', 'Efectos', 0, 1, 0.05, pct)}
      ${range('music', 'Música', 0, 1, 0.05, pct)}
      ${range('ambience', 'Ambiente', 0, 1, 0.05, pct)}
      <h2>JUGADOR</h2>
      <label class="opt">Nombre<input type="text" maxlength="16" value="${esc(s.name)}" data-k="name"></label>
    </section>
    <section class="panel">
      <h2>CONTROLES</h2>
      ${range('sensitivity', 'Sensibilidad', 0.1, 3, 0.05, (v) => (+v).toFixed(2))}
      ${range('adsSensitivity', 'Sensibilidad apuntando', 0.2, 1.5, 0.05, (v) => (+v).toFixed(2))}
      ${check('invertY', 'Invertir eje vertical')}
      ${check('rawInput', 'Mouse en bruto, sin aceleración de Windows (solo con mouse externo)')}
      ${range('keyLook', 'Velocidad de mirar con las flechas', 0.3, 2.5, 0.05, (v) => (+v).toFixed(2))}
      ${seg('aimAssist', 'Asistencia de apuntado', [['auto', 'Solo táctil'], ['on', 'Siempre'], ['off', 'Nunca']])}
      <p class="lead small">¿Juegas con el <b>touchpad</b> de la laptop? Windows lo bloquea mientras tocas el teclado, así que no podrías apuntar
        mientras te mueves. Arréglalo en <b>Configuración → Bluetooth y dispositivos → Panel táctil → Sensibilidad: «Más sensible»</b>,
        o usa las <b>flechas</b> para mirar. Activar la <b>asistencia de apuntado</b> también ayuda.</p>
      ${seg('adsMode', 'Apuntar (clic derecho)', [['hold', 'Mantener'], ['toggle', 'Alternar']])}
      ${seg('crouchMode', 'Agacharse', [['hold', 'Mantener'], ['toggle', 'Alternar']])}
      ${seg('sprintMode', 'Correr', [['hold', 'Mantener'], ['toggle', 'Alternar']])}
      ${seg('touch', 'Controles táctiles', [['auto', 'Automático'], ['on', 'Siempre'], ['off', 'Nunca']])}
      <label class="opt">Color de la retícula<input type="color" value="${s.crosshairColor}" data-k="crosshairColor"></label>
      <h3>TECLAS</h3>
      <div class="keys">${Object.entries(KEY_LABELS).map(([a, l]) => `<div class="key"><span>${l}</span><button data-key="${a}">${keyName(s.keys[a])}</button></div>`).join('')}</div>
      <button class="btn" data-resetkeys>RESTABLECER TECLAS</button>
    </section>`;
  el.querySelectorAll('[data-q]').forEach((b) => { b.onclick = () => { store.set('quality', b.dataset.q); renderSettings(el, input); }; });
  el.querySelectorAll('[data-set]').forEach((b) => { b.onclick = () => { store.set(b.dataset.set, b.dataset.v); renderSettings(el, input); }; });
  el.querySelectorAll('input[data-num]').forEach((r) => {
    r.oninput = () => { store.set(r.dataset.k, +r.value); r.previousElementSibling.textContent = formatOut(r); };
  });
  el.querySelectorAll('input[type=checkbox][data-k]').forEach((c) => { c.onchange = () => store.set(c.dataset.k, c.checked); });
  el.querySelector('[data-k=name]').onchange = (e) => { store.set('name', e.target.value.trim().slice(0, 16) || 'Jugador'); };
  el.querySelector('[data-k=crosshairColor]').oninput = (e) => store.set('crosshairColor', e.target.value);
  el.querySelectorAll('[data-key]').forEach((b) => {
    b.onclick = () => {
      b.textContent = 'Pulsa una tecla…'; b.classList.add('wait');
      input.captureNext = (code) => {
        if (code !== 'Escape') { const keys = store.settings.keys; for (const k in keys) if (keys[k] === code) keys[k] = ''; keys[b.dataset.key] = code; store.saveSettings(); }
        renderSettings(el, input);
      };
    };
  });
  el.querySelector('[data-resetkeys]').onclick = () => { store.resetKeys(); renderSettings(el, input); };
}
/** Tabla de controles (teclado y ratón) con las teclas actuales. */
export function controlsHTML() {
  const k = (a) => `<kbd>${keyName(store.settings.keys[a])}</kbd>`;
  const rows = [
    ['Moverse', `${k('forward')}${k('left')}${k('back')}${k('right')}`], ['Apuntar / disparar', '<kbd>Clic der.</kbd><kbd>Clic izq.</kbd>'],
    ['Mirar (sin mouse)', `${k('lookLeft')}${k('lookUp')}${k('lookDown')}${k('lookRight')}`],
    ['Correr', k('sprint')], ['Saltar', k('jump')], ['Agacharse', k('crouch')], ['Deslizarse', `${k('sprint')} + ${k('crouch')}`],
    ['Asomarse', `${k('leanLeft')}${k('leanRight')}`], ['Recargar', k('reload')], ['Cambiar de arma', `${k('primary')}${k('secondary')}${k('swap')} <kbd>Rueda</kbd>`],
    ['Granada', k('lethal')], ['Granada táctica', k('tactical')], ['Cuchillo', k('melee')], ['Saltar muros / trepar', `${k('jump')} contra el borde`],
    ['Inspeccionar arma', k('inspect')], ['Marcador', k('scoreboard')], ['Pausa', '<kbd>Esc</kbd>'],
  ];
  return `<div class="controls">${rows.map(([n, v]) => `<div><span>${n}</span><span>${v}</span></div>`).join('')}</div>`;
}
function formatOut(r) {
  const k = r.dataset.k, v = +r.value;
  if (k === 'fov') return `${v}°`;
  if (k === 'sensitivity' || k === 'adsSensitivity' || k === 'keyLook') return v.toFixed(2);
  return `${Math.round(v * 100)} %`;
}

/** Pantalla de carga. */
export class Loading {
  constructor(root) {
    this.root = root;
    root.innerHTML = `<div class="ld-card"><small class="ld-mode"></small><h1 class="ld-map"></h1><p class="ld-desc"></p>
      <div class="ld-bar"><i></i></div><div class="ld-label"></div><p class="ld-tip"></p></div>`;
    this.bar = root.querySelector('.ld-bar i'); this.label = root.querySelector('.ld-label');
  }
  show(opts) {
    const m = MAPS[opts.map];
    this.root.querySelector('.ld-mode').textContent = MODES[opts.mode].name;
    this.root.querySelector('.ld-map').textContent = m.name;
    this.root.querySelector('.ld-desc').textContent = m.desc;
    this.root.querySelector('.ld-tip').textContent = 'Consejo: ' + TIPS[(Math.random() * TIPS.length) | 0];
    this.root.className = `overlay loading map-${opts.map}`;
    this.progress(0, 'Preparando');
  }
  progress(p, label) { this.bar.style.width = `${Math.round(p * 100)}%`; if (label) this.label.textContent = label; }
  hide() { this.root.classList.add('hidden'); }
}

/** Menú de pausa (y aviso de «clic para jugar»). */
export class Pause {
  constructor(root, input) {
    this.root = root; this.input = input;
    this.onResume = null; this.onQuit = null;
  }
  show(kind = 'pause') {
    this.root.className = 'overlay pause';
    if (kind === 'ready') {
      this.root.innerHTML = `<div class="p-card ready"><h1>LISTO PARA DESPLEGAR</h1>
        <p>${this.touch ? 'Joystick a la izquierda para moverte, desliza a la derecha para mirar.' : 'Haz clic para capturar el ratón y empezar.'}</p>
        ${this.touch ? '<p class="p-rotate">⟳ Pon el celular en horizontal</p>' : controlsHTML() + '<p class="lead small">Con touchpad: en Windows pon la sensibilidad del panel táctil en «Más sensible» para poder apuntar mientras te mueves, o mira con las flechas.</p>'}
        <button class="btn primary big" data-a="resume">EMPEZAR</button></div>`;
    } else {
      this.root.innerHTML = `<div class="p-card"><h1>PAUSA</h1>
        ${this.touch ? '<p class="p-rotate">⟳ Pon el celular en horizontal para seguir</p>' : ''}
        <button class="btn primary big" data-a="resume">CONTINUAR</button>
        <button class="btn" data-a="settings">AJUSTES</button>
        ${this.touch ? '' : '<button class="btn" data-a="controls">CONTROLES</button>'}
        <button class="btn danger" data-a="quit">ABANDONAR PARTIDA</button></div>
        <div class="p-settings hidden"></div>`;
      const ps = this.root.querySelector('.p-settings');
      const panel = (what) => {
        const open = !ps.classList.contains('hidden') && ps.dataset.what === what;
        if (open) { ps.classList.add('hidden'); return; }
        ps.dataset.what = what; ps.className = 'p-settings m-body tab-settings';
        if (what === 'settings') renderSettings(ps, this.input);
        else ps.innerHTML = `<section class="panel"><h2>CONTROLES</h2>${controlsHTML()}<p class="lead small">Puedes cambiar cualquier tecla en Ajustes → Teclas (también el botón central y los laterales del ratón).</p></section>`;
      };
      this.root.querySelector('[data-a=settings]').onclick = () => panel('settings');
      this.root.querySelector('[data-a=controls]')?.addEventListener('click', () => panel('controls'));
      this.root.querySelector('[data-a=quit]').onclick = (e) => {
        if (e.target.dataset.sure) { this.onQuit?.(); return; }
        e.target.dataset.sure = '1'; e.target.textContent = '¿ABANDONAR? PULSA DE NUEVO';
      };
    }
    this.root.querySelector('[data-a=resume]').onclick = () => { audio.uiSound('click'); this.onResume?.(); };
  }
  hide() { this.root.classList.add('hidden'); this.root.innerHTML = ''; }
  get visible() { return !this.root.classList.contains('hidden'); }
}
