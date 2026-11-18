// Modos de juego: reglas, plantilla de equipos, selección de spawn, objetivos de la IA,
// marcador, condiciones de victoria. TEAM DEATHMATCH, FREE FOR ALL, DOMINATION y TRAINING.
import * as THREE from 'three';
import { BOT_NAMES } from '../ai/Bot.js';
import { F_SIGHT } from '../../shared/collision.js';
import { audio } from '../core/Audio.js';
import { store, keyLabel } from '../core/Settings.js';

export const MODES = {
  tdm: { id: 'tdm', name: 'TEAM DEATHMATCH', short: 'TDM', desc: 'Dos equipos. Gana el primero en alcanzar el límite de bajas o el que lleve más al acabar el tiempo.', score: 50, time: 10, bots: 11 },
  ffa: { id: 'ffa', name: 'FREE FOR ALL', short: 'FFA', desc: 'Todos contra todos. Gana el primero en llegar al límite de bajas.', score: 25, time: 10, bots: 7 },
  dom: { id: 'dom', name: 'DOMINATION', short: 'DOM', desc: 'Captura y mantén las zonas A, B y C. Cada zona controlada suma un punto por segundo.', score: 200, time: 12, bots: 11 },
  training: { id: 'training', name: 'TRAINING', short: 'ENT', desc: 'Campo de tiro y casa de asalto con bots.', score: 0, time: 0, bots: 0 },
};
export const TEAM_NAMES = { a: 'FUERZA ATLAS', b: 'VANGUARDIA ROJA' };

const R = (a, b) => a + Math.random() * (b - a);

class BaseMode {
  constructor(game, opts) {
    this.game = game; this.opts = opts; this.def = MODES[opts.mode];
    this.scoreLimit = opts.scoreLimit ?? this.def.score;
    this.timeLimit = (opts.timeLimit ?? this.def.time) * 60;
    this.timeLeft = this.timeLimit; this.state = 'pre'; this.preT = 3.5; this._cd = 4;
    this.ffa = false; this.scores = { a: 0, b: 0 };
  }
  playerTeam() { return 'a'; }
  roster() {
    const n = this.opts.bots ?? this.def.bots, names = [...BOT_NAMES].sort(() => Math.random() - 0.5), out = [];
    for (let i = 0; i < n; i++) out.push({ name: names[i % names.length], team: i % 2 === 0 ? 'b' : 'a' });
    return out;
  }
  init() {}
  respawnTime() { return 4; }
  spawnList(c) { const s = this.game.mapDef.spawns; return c.team === 'b' ? s.b : s.a; }
  /** Spawn más seguro: lejos de enemigos vivos y fuera de su línea de visión. */
  pickSpawn(c, initial) {
    const list = this.spawnList(c), g = this.game, w = g.world;
    if (initial) { // reparto inicial sin superposición
      const used = g.combatants.filter((o) => o !== c && o.alive);
      const free = list.filter((s) => used.every((o) => Math.hypot(o.body.x - s.x, o.body.z - s.z) > 1.2));
      return (free.length ? free : list)[(Math.random() * (free.length || list.length)) | 0];
    }
    let best = null, bs = -Infinity;
    for (const s of list) {
      let minD = 60, seen = 0, crowd = 0;
      for (const o of g.combatants) {
        if (!o.alive || o === c) continue;
        const d = Math.hypot(o.body.x - s.x, o.body.z - s.z);
        if (d < 1.2) crowd++;
        if (!g.hostile(c, o)) continue;
        minD = Math.min(minD, d);
        if (d < 50 && w.los(s.x, s.y + 1.6, s.z, o.body.x, o.eyeY, o.body.z, F_SIGHT)) seen++;
      }
      const sc = minD - seen * 25 - crowd * 100 + Math.random() * 6;
      if (sc > bs) { bs = sc; best = s; }
    }
    return best || list[0];
  }
  _node(x, z, r) { const n = this.game.nav.around(x, z, r, []); return n.length ? n[(Math.random() * n.length) | 0] : this.game.nav.random(); }
  botGoal(bot) {
    const d = this.game.mapDef, r = Math.random();
    let n;
    if (r < 0.45 && d.zones.length) { const z = d.zones[(Math.random() * d.zones.length) | 0]; n = this._node(z.x, z.z, 8); }
    else if (r < 0.75) { const e = bot.team === 'a' ? d.spawns.b : d.spawns.a, s = e[(Math.random() * e.length) | 0]; n = this._node(s.x * 0.55, s.z * 0.55, 10); }
    else n = this.game.nav.random();
    return n ? { x: n.x, y: n.y, z: n.z, type: 'patrol' } : null;
  }
  onKill(victim, killer) {
    if (killer && killer !== victim && this.game.hostile(killer, victim) && !this.ffa && this.def.id === 'tdm') this.scores[killer.team]++;
    this.check();
  }
  check() {}
  update(dt) {
    const g = this.game;
    if (this.state === 'pre') {
      this.preT -= dt;
      const c = Math.ceil(this.preT);
      if (c !== this._cd && c >= 0) { this._cd = c; if (c > 0) audio.uiSound('countdown'); }
      if (this.preT <= 0) { this.state = 'live'; audio.uiSound('go'); g.hud.toast(this.def.name, 2.2); }
      return;
    }
    if (this.state !== 'live') return;
    if (this.timeLimit > 0) {
      this.timeLeft -= dt;
      if (this.timeLeft <= 0) { this.timeLeft = 0; this.end('time'); }
    }
  }
  winnerTeam() { return this.scores.a === this.scores.b ? null : this.scores.a > this.scores.b ? 'a' : 'b'; }
  end(reason) {
    if (this.state === 'end') return;
    this.state = 'end';
    this.game.finish({ reason, winner: this.winnerTeam(), scores: { ...this.scores }, mode: this.def });
  }
  /** Datos para el HUD. */
  hudInfo() {
    const me = this.game.player.team, op = me === 'a' ? 'b' : 'a';
    return { kind: 'teams', mine: this.scores[me], theirs: this.scores[op], limit: this.scoreLimit, objective: `Elimina al equipo enemigo · ${this.scoreLimit} bajas` };
  }
}

class TDM extends BaseMode {
  check() { if (this.scores.a >= this.scoreLimit || this.scores.b >= this.scoreLimit) this.end('score'); }
}

class FFA extends BaseMode {
  constructor(g, o) { super(g, o); this.ffa = true; }
  playerTeam() { return 'ffa'; }
  roster() { return super.roster().map((r) => ({ ...r, team: 'ffa' })); }
  spawnList() { const s = this.game.mapDef.spawns; return [...s.ffa, ...s.a, ...s.b]; }
  respawnTime() { return 3; }
  botGoal(bot) {
    const n = Math.random() < 0.6 ? this.game.nav.random() : (() => { const z = this.game.mapDef.zones[(Math.random() * 3) | 0]; return this._node(z.x, z.z, 10); })();
    return n ? { x: n.x, y: n.y, z: n.z, type: 'patrol' } : null;
  }
  leader() { return [...this.game.combatants].sort((a, b) => b.kills - a.kills)[0]; }
  check() { const l = this.leader(); if (l && l.kills >= this.scoreLimit) this.end('score'); }
  end(reason) {
    if (this.state === 'end') return;
    this.state = 'end';
    const l = this.leader();
    this.game.finish({ reason, winner: l === this.game.player ? 'me' : null, winnerC: l, scores: {}, mode: this.def });
  }
  hudInfo() {
    const p = this.game.player, l = this.leader();
    const best = [...this.game.combatants].filter((c) => c !== p).sort((a, b) => b.kills - a.kills)[0];
    return { kind: 'ffa', mine: p.kills, theirs: best ? best.kills : 0, leaderName: best ? best.name : '', limit: this.scoreLimit, lead: l === p, objective: `Todos contra todos · ${this.scoreLimit} bajas` };
  }
}

class Domination extends BaseMode {
  init() {
    const g = this.game;
    this.zones = g.mapDef.zones.map((z) => ({ ...z, owner: null, prog: 0, contested: false, cap: null }));
    this._tick = 0;
    // Marcadores 3D: anillo en el suelo + haz vertical + letra flotante
    this.group = new THREE.Group(); g.engine.scene.add(this.group);
    for (const z of this.zones) {
      const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false });
      const ring = new THREE.Mesh(new THREE.RingGeometry(z.r - 0.12, z.r, 64), ringMat); ring.rotation.x = -Math.PI / 2;
      const gy = g.world.groundAt(z.x, z.y + 3, z.z) + 0.04; ring.position.set(z.x, gy, z.z);
      const beamMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.08, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(z.r, z.r, 3.5, 48, 1, true), beamMat); beam.position.set(z.x, gy + 1.75, z.z);
      const c = document.createElement('canvas'); c.width = c.height = 128;
      const x = c.getContext('2d'); x.font = 'bold 90px Rajdhani, Arial'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.lineWidth = 8; x.strokeStyle = 'rgba(0,0,0,0.6)'; x.strokeText(z.name, 64, 68); x.fillStyle = '#fff'; x.fillText(z.name, 64, 68);
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false, transparent: true }));
      sp.scale.set(1.1, 1.1, 1); sp.position.set(z.x, gy + 4.3, z.z); sp.renderOrder = 30;
      this.group.add(ring, beam, sp);
      z.vis = { ringMat, beamMat, sp, gy };
    }
  }
  respawnTime() { return 5; }
  /** Spawn cerca de las zonas propias si están seguras. */
  spawnList(c) {
    const base = super.spawnList(c);
    const own = this.zones.filter((z) => z.owner === c.team && !z.contested);
    if (!own.length || Math.random() < 0.5) return base;
    const z = own[(Math.random() * own.length) | 0], extra = [];
    for (const n of this.game.nav.around(z.x, z.z, z.r + 9, [])) { const d = Math.hypot(n.x - z.x, n.z - z.z); if (d > z.r + 3 && Math.abs(n.y - z.y) < 1 && Math.random() < 0.08) extra.push({ x: n.x, y: n.y + 0.05, z: n.z }); }
    return extra.length ? extra : base;
  }
  botGoal(bot) {
    const zs = this.zones, me = bot.team;
    const wanted = zs.filter((z) => z.owner !== me).sort((a, b) => Math.hypot(a.x - bot.body.x, a.z - bot.body.z) - Math.hypot(b.x - bot.body.x, b.z - bot.body.z));
    let z;
    if (wanted.length && Math.random() < 0.75) z = Math.random() < 0.7 ? wanted[0] : wanted[(Math.random() * wanted.length) | 0];
    else z = zs[(Math.random() * zs.length) | 0];
    const n = this._node(z.x, z.z, z.r * 0.7);
    return n ? { x: n.x, y: n.y, z: n.z, type: z.owner === me ? 'defend' : 'capture' } : null;
  }
  update(dt) {
    super.update(dt);
    const g = this.game, t = g.time;
    for (const z of this.zones) {
      if (this.state === 'live') {
        let a = 0, b = 0;
        for (const c of g.combatants) {
          if (!c.alive || Math.abs(c.body.y - z.y) > 3 || Math.hypot(c.body.x - z.x, c.body.z - z.z) > z.r) continue;
          if (c.team === 'a') a++; else b++;
        }
        z.contested = a > 0 && b > 0; z.inA = a; z.inB = b;
        if (!z.contested && (a || b)) {
          const team = a ? 'a' : 'b', n = a || b, dir = team === 'a' ? 1 : -1;
          if (z.owner !== team) {
            const prev = z.prog;
            z.prog = Math.max(-1, Math.min(1, z.prog + dir * dt * (1 + Math.min(2, n - 1) * 0.5) / 7));
            if (z.owner && Math.sign(prev) !== Math.sign(z.prog)) { this._announce(z, null, z.owner); z.owner = null; }
            if (Math.abs(z.prog) >= 1) {
              z.owner = team; this._announce(z, team);
              for (const c of g.combatants) if (c.alive && c.team === team && Math.hypot(c.body.x - z.x, c.body.z - z.z) <= z.r) {
                c.score += 200; c.captures++;
                if (c === g.player) { store.stats.captures++; g.hud.toast(`ZONA ${z.name} CAPTURADA · +200`); }
              }
            }
          } else z.prog += (dir - z.prog) * Math.min(1, dt * 2);
        } else if (!a && !b && !z.owner) z.prog *= Math.max(0, 1 - dt * 0.15);
      }
      // visual
      const col = z.owner === 'a' ? 0x3a8dff : z.owner === 'b' ? 0xff4a3a : 0xeeeeee;
      z.vis.ringMat.color.set(col).multiplyScalar(z.contested ? 1 + Math.sin(t * 12) * 0.5 : 1.6);
      z.vis.beamMat.color.set(col); z.vis.beamMat.opacity = 0.06 + (z.contested ? 0.05 : 0) + Math.sin(t * 2 + z.x) * 0.015;
      z.vis.sp.position.y = z.vis.gy + 4.3 + Math.sin(t * 1.5 + z.z) * 0.1;
    }
    if (this.state === 'live') {
      this._tick += dt;
      while (this._tick >= 1) {
        this._tick -= 1;
        for (const z of this.zones) if (z.owner) this.scores[z.owner]++;
      }
      if (this.scores.a >= this.scoreLimit || this.scores.b >= this.scoreLimit) this.end('score');
    }
  }
  _announce(z, team, lostBy) {
    const g = this.game, me = g.player.team;
    if (team) { g.hud.feedNote(`${TEAM_NAMES[team]} capturó ${z.name}`, team === me); audio.uiSound(team === me ? 'capture' : 'lost'); }
    else g.hud.feedNote(`Zona ${z.name} neutralizada`, lostBy !== me);
  }
  onKill() {}
  hudInfo() {
    const me = this.game.player.team, op = me === 'a' ? 'b' : 'a';
    const p = this.game.player, inside = this.zones.find((z) => p.alive && Math.hypot(p.body.x - z.x, p.body.z - z.z) <= z.r && Math.abs(p.body.y - z.y) < 3);
    return { kind: 'teams', mine: this.scores[me], theirs: this.scores[op], limit: this.scoreLimit, zones: this.zones, me, inside,
      objective: inside ? (inside.contested ? `ZONA ${inside.name} DISPUTADA` : inside.owner === me ? `Defiende la zona ${inside.name}` : `Capturando zona ${inside.name}`) : 'Captura y mantén las zonas A · B · C' };
  }
}

class Training extends BaseMode {
  constructor(g, o) { super(g, o); this.timeLimit = 0; this.preT = 0.5; }
  roster() {
    const names = [...BOT_NAMES].sort(() => Math.random() - 0.5);
    return this.game.mapDef.dummies.map((d, i) => ({ name: `Bot ${names[i]}`, team: 'b', passive: !this.opts.hostileBots, patrol: d, home: { ...d, yaw: Math.random() * 6.28 },
      weapon: ['mk4', 'viper9', 'akv', 'breacher', 'swift45', 'mk4', 'akv', 'viper9'][i % 8] }));
  }
  init() { for (const b of this.game.bots) b.isDummy = !this.opts.hostileBots; }
  respawnTime() { return 3; }
  pickSpawn(c, initial) {
    if (c.home) return { ...c.home, yaw: Math.random() * 6.28 };
    return super.pickSpawn(c, initial);
  }
  botGoal(bot) { const n = this._node(bot.home.x, bot.home.z, 6); return n ? { x: n.x, y: n.y, z: n.z, type: 'patrol' } : null; }
  onKill(victim) { if (victim === this.game.player) victim.respawnT = 2; }
  update(dt) { super.update(dt); }
  hudInfo() {
    const p = this.game.player;
    return { kind: 'training', kills: p.kills, objective: `[${keyLabel('interact')}] cambiar de arma · Munición infinita${this.opts.hostileBots ? ' · Bots hostiles' : ' · Bots pasivos'}` };
  }
}

export function createMode(id, game, opts) {
  switch (id) {
    case 'ffa': return new FFA(game, opts);
    case 'dom': return new Domination(game, opts);
    case 'training': return new Training(game, opts);
    default: return new TDM(game, opts);
  }
}
