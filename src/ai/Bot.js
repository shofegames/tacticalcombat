// IA de los bots: percepción (visión con cono + línea de visión, oído, memoria), máquina de estados
// (objetivo → combate → cobertura/asomarse → flanqueo → búsqueda → retirada), navegación A* multinivel
// y coordinación de escuadra mediante una pizarra compartida por equipo.
import { Combatant } from '../entities/Combatant.js';
import { BODY, F_SIGHT } from '../../shared/collision.js';
import { WEAPONS } from '../../shared/weapons.js';
import { audio } from '../core/Audio.js';

export const DIFFICULTY = {
  recruit: { label: 'Recluta', react: 0.8, aimErr: 6.0, turn: 3.2, burst: [2, 4], rest: [0.6, 1.2], fov: 95, range: 50, hearing: 0.7, cover: 0.3, head: 0.03, flank: 0.2 },
  regular: { label: 'Regular', react: 0.48, aimErr: 3.6, turn: 5.0, burst: [3, 6], rest: [0.35, 0.85], fov: 110, range: 70, hearing: 1.0, cover: 0.6, head: 0.08, flank: 0.45 },
  veteran: { label: 'Veterano', react: 0.3, aimErr: 2.2, turn: 7.5, burst: [4, 8], rest: [0.22, 0.55], fov: 120, range: 90, hearing: 1.3, cover: 0.85, head: 0.14, flank: 0.65 },
  elite: { label: 'Élite', react: 0.19, aimErr: 1.3, turn: 10, burst: [5, 10], rest: [0.15, 0.4], fov: 130, range: 115, hearing: 1.6, cover: 1.0, head: 0.22, flank: 0.8 },
};
export const BOT_WEAPONS = {
  modern: ['mk4', 'mk4', 'akv', 'akv', 'viper9', 'swift45', 'breacher', 'striker', 'sentinel', 'hammer', 'longbow'],
  historic: ['garrison', 'garrison', 'chicago', 'chicago', 'jager98', 'jager98', 'garrison', 'chicago'],
  future: ['pulse', 'pulse', 'pulse', 'rail', 'mk4', 'swift45', 'striker', 'sentinel'],
};
export const BOT_NAMES = ['Vargas', 'Kowalski', 'Okafor', 'Reyes', 'Lindqvist', 'Tanaka', 'Moreau', 'Castillo', 'Novak', 'Hale', 'Ibarra', 'Petrov',
  'Sato', 'Mendoza', 'Brandt', 'Quiroga', 'Adeyemi', 'Rossi', 'Keller', 'Duarte', 'Molina', 'Fischer', 'Aguirre', 'Larsen'];

const R = (a, b) => a + Math.random() * (b - a);
const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };
const _res = {}, _tmpNodes = [];
const RUN = 5.7, WALK = 3.3, CROUCHSPD = 2.0;

/** Pizarra de escuadra: avistamientos compartidos, coberturas reservadas y reparto de papeles. */
export class Squad {
  constructor(team) { this.team = team; this.sightings = new Map(); this.reserved = new Map(); this.engaging = new Map(); this.members = []; }
  report(target, time, by) { this.sightings.set(target.id, { x: target.body.x, y: target.body.y, z: target.body.z, t: time, by: by.id, target }); }
  latest(time, maxAge = 6) { let best = null; for (const s of this.sightings.values()) if (time - s.t < maxAge && s.target.alive && (!best || s.t > best.t)) best = s; return best; }
  reserve(node, bot) { this.release(bot); this.reserved.set(node.i, bot.id); bot._resNode = node.i; }
  release(bot) { if (bot._resNode != null && this.reserved.get(bot._resNode) === bot.id) this.reserved.delete(bot._resNode); bot._resNode = null; }
  taken(node, bot) { const o = this.reserved.get(node.i); return o != null && o !== bot.id; }
  engage(bot, target) { this.disengage(bot); if (!this.engaging.has(target.id)) this.engaging.set(target.id, new Set()); this.engaging.get(target.id).add(bot.id); bot._eng = target.id; }
  disengage(bot) { if (bot._eng != null) { this.engaging.get(bot._eng)?.delete(bot.id); bot._eng = null; } }
  countOn(target) { return this.engaging.get(target.id)?.size || 0; }
}

export class Bot extends Combatant {
  constructor(game, name, team, difficulty = 'regular', weaponId = 'mk4') {
    super(name, team);
    this.game = game; this.isBot = true;
    this.diff = DIFFICULTY[difficulty] || DIFFICULTY.regular;
    this.setWeapon(weaponId);
    this.state = 'objective';
    this.target = null; this.memory = new Map();   // id -> {x,y,z,t,vis,seen}
    this.path = null; this.pi = 0; this.repathT = 0; this.goal = null; this.goalT = 0;
    this.percT = Math.random() * 0.15; this.thinkT = Math.random() * 0.2;
    this.errYaw = 0; this.errPitch = 0; this.errTY = 0; this.errTP = 0; this.errT = 0;
    this.burst = 0; this.restT = 0; this.cool = 0; this.reloadT = 0; this.firing = false;
    this.coverNode = null; this.coverPhase = 'hide'; this.coverT = 0; this.peekNode = null; this.coverCrouchOnly = false;
    this.stuckT = 0; this.stuckX = 0; this.stuckZ = 0; this.stuckN = 0;
    this.lookYaw = 0; this.scanT = 0; this.strafe = 1; this.strafeT = 0; this.investigate = null; this.alertT = 0;
    this.role = 'assault'; this.passive = false; this.moveSpeed = 0; this.fwd = 1; this.stepDist = 0; this.wantCrouch = false;
  }
  setWeapon(id) { this.def = WEAPONS[id] || WEAPONS.mk4; this.weaponId = this.def.id; this.mag = this.def.mag; }

  spawnAt(s) {
    const b = this.body;
    b.x = s.x; b.y = s.y; b.z = s.z; b.h = BODY.standH; b.onGround = false;
    this.vx = this.vy = this.vz = 0; this.yaw = this.lookYaw = s.yaw ?? Math.random() * 6.28; this.pitch = 0; this.crouch = false;
    this.health = this.maxHealth; this.alive = true; this.spawnProtect = 1.5;
    this.target = null; this.memory.clear(); this.path = null; this.state = 'objective'; this.goal = null; this.goalT = 0;
    this.mag = this.def.mag; this.reloadT = 0; this.burst = 0; this.restT = 0.3; this.coverNode = null; this.investigate = null;
    this.game.squads[this.team]?.release(this); this.game.squads[this.team]?.disengage(this);
    if (this.model) this.model.revive();
  }

  // ------------------------------------------------------------------ percepción
  canSee(t) {
    if (this.blindT > 0) return false;
    const b = this.body, tb = t.body, w = this.game.world, ey = this.eyeY, eq = this.game.equipment;
    const dx = tb.x - b.x, dz = tb.z - b.z, d = Math.hypot(dx, dz);
    if (d > this.diff.range) return false;
    if (d > 5) { // cono de visión (de cerca se «siente» al enemigo)
      const a = Math.abs(angDiff(Math.atan2(-dx, -dz), this.yaw));
      if (a > (this.diff.fov * Math.PI / 180) / 2) return false;
    }
    const th = t.crouch ? BODY.crouchH : BODY.standH;
    const see = (x, y, z) => w.los(b.x, ey, b.z, x, y, z, F_SIGHT) && !(eq && eq.smokeBlocks(b.x, ey, b.z, x, y, z));
    if (see(tb.x, tb.y + th - 0.2, tb.z) || see(tb.x, tb.y + th * 0.55, tb.z)) return true;
    // cabeza asomada por una esquina
    return (Math.abs(t.leanOX) + Math.abs(t.leanOZ) > 0.12) && see(tb.x + t.leanOX, tb.y + th - 0.2, tb.z + t.leanOZ);
  }
  /** Cegado por una granada aturdidora. */
  blind(t) {
    if (!this.alive || t < 0.2) return;
    this.blindT = Math.max(this.blindT || 0, t);
    this.alertT = Math.max(this.alertT, t + 3);
    for (const m of this.memory.values()) m.vis = 0;
  }
  perceive(dt, now) {
    const squad = this.game.squads[this.team];
    let best = null, bestScore = -Infinity;
    for (const e of this.game.combatants) {
      if (!e.alive || e === this || !this.game.hostile(this, e)) continue;
      let m = this.memory.get(e.id);
      const vis = this.canSee(e);
      if (vis) {
        if (!m) this.memory.set(e.id, (m = { x: 0, y: 0, z: 0, t: 0, vis: 0, seen: false }));
        const d = Math.hypot(e.body.x - this.body.x, e.body.z - this.body.z);
        // el tiempo de reacción crece con la distancia y si el objetivo está agachado o quieto
        m.vis += dt / (this.diff.react * (0.6 + d / 60) * (e.crouch ? 1.35 : 1) * (now - e.lastShotT < 1 ? 0.5 : 1) * (this.alertT > 0 ? 0.6 : 1));
        if (m.vis >= 1 || m.seen) { m.seen = true; m.x = e.body.x; m.y = e.body.y; m.z = e.body.z; m.t = now; squad?.report(e, now, this); }
      } else if (m) { m.vis = Math.max(0, m.vis - dt * 2); }
      if (m && m.seen && now - m.t < 5) {
        const d = Math.hypot(m.x - this.body.x, m.z - this.body.z);
        let score = -d + (vis ? 40 : 0) + (e === this.target ? 12 : 0) - (squad ? squad.countOn(e) * 4 : 0) + (e.health < 50 ? 6 : 0);
        if (score > bestScore) { bestScore = score; best = e; }
      } else if (m && now - m.t >= 5) m.seen = false;
    }
    if (best !== this.target) {
      this.target = best;
      if (best) { squad?.engage(this, best); this.errT = 0; this.burst = 0; this.restT = Math.max(this.restT, 0.05); }
      else squad?.disengage(this);
    }
    this.targetVisible = !!(best && this.canSee(best));
  }
  /** Ruido cercano (disparos, pasos): investigar si no hay objetivo. */
  hear(x, y, z, radius, source) {
    if (!this.alive || this.passive || this.target || !this.game.hostile(this, source)) return;
    const d = Math.hypot(x - this.body.x, z - this.body.z);
    if (d > radius * this.diff.hearing) return;
    this.investigate = { x: x + R(-2, 2), y, z: z + R(-2, 2), t: this.game.time }; this.alertT = 6;
    this.lookYaw = Math.atan2(-(x - this.body.x), -(z - this.body.z));
  }
  onHurt(attacker) {
    this.alertT = 8;
    if (!attacker || !this.game.hostile(this, attacker)) return;
    let m = this.memory.get(attacker.id);
    if (!m) this.memory.set(attacker.id, (m = { x: 0, y: 0, z: 0, t: 0, vis: 0, seen: false }));
    m.seen = true; m.vis = 1; m.x = attacker.body.x; m.y = attacker.body.y; m.z = attacker.body.z; m.t = this.game.time;
    if (!this.target) this.lookYaw = Math.atan2(-(m.x - this.body.x), -(m.z - this.body.z));
    if (this.state === 'objective' || this.state === 'search') this.thinkT = 0;
  }

  // ------------------------------------------------------------------ navegación
  goTo(x, y, z, avoid = null) {
    const nav = this.game.nav, b = this.body;
    const a = nav.nearest(b.x, b.y, b.z), d = nav.nearest(x, y, z);
    if (!a || !d) { this.path = null; return false; }
    let pen = null;
    if (avoid) { // penaliza los nodos expuestos al enemigo => rutas de flanqueo
      const w = this.game.world, ax = avoid.x, ay = avoid.y + 1.5, az = avoid.z; let n = 0;
      pen = (node) => { if ((node.i + n++) % 3) return 0; const dd = Math.hypot(node.x - ax, node.z - az); return dd < 45 && w.los(node.x, node.y + 1.4, node.z, ax, ay, az, F_SIGHT) ? 5 : 0; };
    }
    const p = nav.findPath(a, d, pen, 7000);
    if (!p) { this.path = null; return false; }
    this.path = nav.smooth(p); this.pi = this.path.length > 1 ? 1 : 0; this.dest = d;
    return true;
  }
  /** Sigue la ruta. Devuelve true al llegar. */
  follow(speed) {
    if (!this.path) return true;
    const b = this.body;
    let n = this.path[this.pi];
    while (n && Math.hypot(n.x - b.x, n.z - b.z) < 0.42 && Math.abs(n.y - b.y) < 1.2) { this.pi++; n = this.path[this.pi]; }
    if (!n) { this.path = null; this.wishX = this.wishZ = 0; return true; }
    const dx = n.x - b.x, dz = n.z - b.z, d = Math.hypot(dx, dz) || 1;
    this.wishX = (dx / d) * speed; this.wishZ = (dz / d) * speed;
    return false;
  }

  findCover(threat, maxR = 13) {
    const nav = this.game.nav, w = this.game.world, b = this.body, squad = this.game.squads[this.team];
    const tx = threat.x, ty = threat.y + 1.5, tz = threat.z;
    const list = nav.around(b.x, b.z, maxR, _tmpNodes);
    let best = null, bestS = Infinity, crouchOnly = false;
    const stepN = Math.max(1, Math.floor(list.length / 90));
    for (let i = (Math.random() * stepN) | 0; i < list.length; i += stepN) {
      const n = list[i];
      if (Math.abs(n.y - b.y) > 2.2 || squad?.taken(n, this)) continue;
      const dT = Math.hypot(n.x - tx, n.z - tz);
      if (dT < 7) continue;
      if (w.los(n.x, n.y + 0.95, n.z, tx, ty, tz, F_SIGHT)) continue;           // expuesto incluso agachado
      const standSafe = !w.los(n.x, n.y + 1.6, n.z, tx, ty, tz, F_SIGHT);
      const dMe = Math.hypot(n.x - b.x, n.z - b.z);
      const ideal = Math.min(this.def.rangeFar * 0.6, 28);
      const s = dMe * 1.4 + Math.abs(dT - ideal) * 0.25 + (standSafe ? 2.5 : 0) + Math.random() * 1.5;   // se prefiere cobertura baja (permite asomarse)
      if (s < bestS) { bestS = s; best = n; crouchOnly = !standSafe; }
    }
    if (!best) return false;
    squad?.reserve(best, this);
    this.coverNode = best; this.coverCrouchOnly = crouchOnly; this.peekNode = null;
    if (!crouchOnly) { // buscar un nodo vecino desde el que asomarse
      for (const ni of best.nb) { const m = nav.nodes[ni]; if (w.los(m.x, m.y + 1.6, m.z, tx, ty, tz, F_SIGHT)) { this.peekNode = m; break; } }
    }
    return this.goTo(best.x, best.y, best.z);
  }

  // ------------------------------------------------------------------ decisión
  think(now) {
    const t = this.target, hp = this.health / this.maxHealth, squad = this.game.squads[this.team];
    if (this.passive) { this.state = 'idle'; return; }
    if (t) {
      const m = this.memory.get(t.id);
      const lowHp = hp < 0.38 && now - this.lastHurt < 4;
      if (lowHp && this.state !== 'retreat') {
        if (this.findCover(m, 20)) {
          this.state = 'retreat'; this.coverT = R(3.5, 5.5);
          // cortina de humo para cubrir la retirada
          if (this.gear?.tactical > 0 && Math.random() < 0.55 && Math.hypot(m.x - this.body.x, m.z - this.body.z) > 6) {
            const d = Math.hypot(m.x - this.body.x, m.z - this.body.z), k = Math.min(4, d * 0.4) / d;
            if (this.game.equipment.botThrow(this, 'smoke', { x: this.body.x + (m.x - this.body.x) * k, y: this.body.y, z: this.body.z + (m.z - this.body.z) * k })) this.gear.tactical--;
          }
          return;
        }
      }
      if (this.state === 'retreat') { if (hp > 0.7 || this.coverT <= 0) this.state = 'combat'; else return; }
      if (!this.targetVisible && now - m.t > 1.2) {
        // objetivo perdido: ir a su última posición conocida (flanqueando si la dificultad lo permite)
        if (this.state !== 'search') {
          this.state = 'search'; this.goTo(m.x, m.y, m.z, Math.random() < this.diff.flank ? m : null); squad?.release(this); this.coverNode = null;
          // granada a la última posición conocida (enemigo a cubierto)
          const d = Math.hypot(m.x - this.body.x, m.z - this.body.z);
          if (this.gear?.lethal > 0 && d > 8 && d < 26 && now - m.t < 3 && now - (this._grenT ?? -99) > 15 && Math.random() < 0.25 + this.diff.flank * 0.35) {
            if (this.game.equipment.botThrow(this, 'frag', m)) { this.gear.lethal--; this._grenT = now; }
          }
        }
        return;
      }
      if (this.state === 'cover') return;
      // papel en la escuadra: el primero fija al enemigo; el resto flanquea
      const n = squad ? squad.countOn(t) : 1;
      this.role = n >= 2 && Math.random() < this.diff.flank * 0.5 ? 'flank' : 'assault';
      const d = Math.hypot(m.x - this.body.x, m.z - this.body.z);
      const wantCover = Math.random() < this.diff.cover && d > 9 && (this.state !== 'combat' || now - this.lastHurt < 1.5 || this.mag === 0);
      if (wantCover && this.findCover(m)) { this.state = 'cover'; this.coverPhase = 'move'; return; }
      if (this.state !== 'combat') { this.state = 'combat'; this.path = null; this.strafeT = 0; }
      return;
    }
    // sin objetivo
    squad?.release(this); this.coverNode = null;
    if (this.state === 'cover' || this.state === 'combat' || this.state === 'retreat') this.state = 'objective';
    if (this.investigate && now - this.investigate.t < 9) {
      if (this.state !== 'investigate') { this.state = 'investigate'; this.goTo(this.investigate.x, this.investigate.y, this.investigate.z); }
      return;
    }
    if (this.state === 'search' && this.path) return;
    if (this.state === 'investigate' || this.state === 'search') { this.state = 'objective'; this.goal = null; }
    // apoyo a compañeros que han avistado enemigos
    const s = squad?.latest(now, 5);
    if (s && this.state === 'objective' && (!this.goal || this.goal.type !== 'support') && Math.hypot(s.x - this.body.x, s.z - this.body.z) < 55) {
      this.goal = { x: s.x, y: s.y, z: s.z, type: 'support' }; this.goalT = 7; this.alertT = 6;
      this.goTo(s.x, s.y, s.z, Math.random() < this.diff.flank ? s : null);
      return;
    }
    if (!this.goal || this.goalT <= 0 || !this.path) {
      this.goal = this.game.mode.botGoal(this); this.goalT = R(10, 18);
      if (this.goal && !this.goTo(this.goal.x, this.goal.y, this.goal.z)) this.goal = null;
    }
  }

  // ------------------------------------------------------------------ puntería y disparo
  aim(dt, tx, ty, tz, precise) {
    const b = this.body, dx = tx - b.x, dz = tz - b.z, d = Math.hypot(dx, dz);
    let yaw = Math.atan2(-dx, -dz), pitch = Math.atan2(ty - this.eyeY, d);
    if (precise) { yaw += this.errYaw; pitch += this.errPitch; }
    const rate = this.diff.turn * dt;
    const dy = angDiff(yaw, this.yaw), dp = pitch - this.pitch;
    this.yaw += Math.max(-rate, Math.min(rate, dy * Math.min(1, dt * 14) * 4));
    this.pitch += Math.max(-rate, Math.min(rate, dp * Math.min(1, dt * 14) * 4));
    return Math.abs(dy) + Math.abs(dp);
  }
  updateAimError(dt, t) {
    this.errT -= dt;
    if (this.errT <= 0) {
      this.errT = R(0.25, 0.6);
      const d = Math.hypot(t.body.x - this.body.x, t.body.z - this.body.z);
      const k = this.diff.aimErr * (Math.PI / 180) * (1 + t.speed * 0.12 + this.moveSpeed * 0.1) * (0.55 + Math.min(1.2, 14 / Math.max(6, d)));
      const g = () => (Math.random() + Math.random() + Math.random() - 1.5) * 1.1;
      this.errTY = g() * k; this.errTP = g() * k * 0.7;
    }
    const s = Math.min(1, dt * 5);
    this.errYaw += (this.errTY - this.errYaw) * s; this.errPitch += (this.errTP - this.errPitch) * s;
  }
  tryFire(dt, t) {
    const d = this.def, g = this.game;
    this.firing = false;
    if (this.reloadT > 0 || this.spawnProtect > 1.2) return;
    if (this.mag <= 0) { this.reloadT = d.reloadType === 'shell' ? 0.7 + d.shellTime * d.mag * 0.7 : d.reloadTime; audio.mech('magOut', this._pos()); return; }
    if (this.restT > 0 || this.cool > 0) return;
    if (this.burst <= 0) {
      const auto = d.mode === 'auto';
      this.burst = auto ? Math.round(R(this.diff.burst[0], this.diff.burst[1])) : 1;
      if (d.category === 'lmg') this.burst *= 2;
    }
    // origen en los ojos; dirección = hacia donde realmente apunta + dispersión del arma
    const sp = (d.spreadAds + (d.spreadHip - d.spreadAds) * 0.35 + Math.min(1, this.moveSpeed / 4) * d.spreadMove * 0.5) * Math.PI / 180;
    const ox = this.body.x, oy = this.eyeY, oz = this.body.z;
    const muzzle = this.model ? this.model.muzzleWorld(g.tmpV) : g.tmpV.set(ox, oy, oz);
    for (let i = 0; i < d.pellets; i++) {
      const a = Math.random() * 6.283, r = Math.sqrt(Math.random()) * sp;
      const yaw = this.yaw + Math.cos(a) * r, pitch = this.pitch + Math.sin(a) * r, cp = Math.cos(pitch);
      g.tmpDir.set(-Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp);
      g.shootFrom(this, ox, oy, oz, g.tmpDir, d, muzzle);
    }
    this.mag--; this.firing = true; this.lastShotT = g.time;
    this.cool = d.mode === 'auto' ? d.interval : Math.max(d.interval, R(0.22, 0.42) / (0.6 + this.diff.cover * 0.6));
    if (d.mode === 'bolt' || d.mode === 'pump') this.cool = d.interval + R(0, 0.3);
    if (--this.burst <= 0) this.restT = R(this.diff.rest[0], this.diff.rest[1]);
    g.onBotFired(this, d, muzzle);
  }
  _pos() { return { x: this.body.x, y: this.body.y + 1.3, z: this.body.z }; }

  // ------------------------------------------------------------------ ciclo principal
  update(dt) {
    const g = this.game, now = g.time, b = this.body, w = g.world;
    if (!this.alive) { if (this.model) this.model.update(dt, this._pose()); return; }
    this.spawnProtect = Math.max(0, this.spawnProtect - dt);
    this.cool -= dt; this.restT -= dt; this.goalT -= dt; this.coverT -= dt; this.alertT -= dt; this.repathT -= dt;
    this.blindT = Math.max(0, (this.blindT || 0) - dt); this._meleeCd = (this._meleeCd || 0) - dt;
    if (this.reloadT > 0) { this.reloadT -= dt; if (this.reloadT <= 0) { this.mag = this.def.mag; audio.mech('magIn', this._pos()); } }
    this.percT -= dt;
    if (this.percT <= 0) { this.perceive(0.15, now); this.percT = 0.15; }
    this.thinkT -= dt;
    if (this.thinkT <= 0) { this.think(now); this.thinkT = R(0.2, 0.35); }

    this.wishX = 0; this.wishZ = 0; this.wantCrouch = false; this.firing = false;
    const t = this.target, m = t ? this.memory.get(t.id) : null;
    let speed = RUN;
    switch (this.state) {
      case 'combat': {
        if (!t || !m) break;
        this.updateAimError(dt, t);
        const th = t.crouch ? BODY.crouchH : BODY.standH, head = this._head ??= Math.random() < this.diff.head;
        const off = this.aim(dt, m.x, m.y + (head ? th - 0.17 : th * 0.68), m.z, true);
        const d = Math.hypot(m.x - b.x, m.z - b.z);
        // distancia de combate según el arma + desplazamiento lateral para no ser un blanco fijo
        const ideal = this.def.category === 'shotgun' || this.def.category === 'smg' ? 9 : this.def.category === 'sniper' ? 38 : 20;
        this.strafeT -= dt;
        if (this.strafeT <= 0) { this.strafeT = R(0.6, 1.6); this.strafe = Math.random() < 0.5 ? -1 : 1; if (Math.random() < 0.25) this.strafe = 0; this._head = Math.random() < this.diff.head; }
        const fx = (m.x - b.x) / (d || 1), fz = (m.z - b.z) / (d || 1);
        let adv = d > ideal * 1.35 ? 1 : d < ideal * 0.45 ? -0.8 : 0;
        if (this.role === 'flank' && d > 10) adv = 0.6;
        this.wishX = (fx * adv + -fz * this.strafe * 0.8) * WALK; this.wishZ = (fz * adv + fx * this.strafe * 0.8) * WALK;
        this.wantCrouch = this.strafe === 0 && d > 14;
        speed = WALK;
        // cuerpo a cuerpo si el enemigo está encima
        if (this.targetVisible && d < 1.8 && this._meleeCd <= 0 && !this.passive) {
          this._meleeCd = R(1.1, 1.6);
          if (Math.random() < 0.35 + this.diff.flank * 0.5 && g.equipment.botMelee(this, t)) break;
        }
        if (this.targetVisible && off < 0.12 + 3 / Math.max(4, d)) this.tryFire(dt, t);
        else if (this.mag <= 0) this.tryFire(dt, t);
        break;
      }
      case 'retreat':
      case 'cover': {
        if (!this.coverNode) { this.state = 'combat'; break; }
        if (t && m) this.updateAimError(dt, t);
        const th = t ? (t.crouch ? BODY.crouchH : BODY.standH) : 1.6;
        if (this.path) {             // desplazándose a la cobertura (disparando si puede)
          this.follow(RUN);
          if (t && m && this.targetVisible) { const off = this.aim(dt, m.x, m.y + th * 0.68, m.z, true); if (off < 0.2) this.tryFire(dt, t); }
          else this._lookAlongPath(dt);
          if (!this.path) { this.coverPhase = 'hide'; this.coverT = this.state === 'retreat' ? this.coverT : R(0.5, 1.4); }
          break;
        }
        if (this.state === 'retreat') { this.wantCrouch = true; if (m) this.aim(dt, m.x, m.y + 1.2, m.z, false); if (this.mag < this.def.mag * 0.5 && this.reloadT <= 0) this.mag = 0, this.tryFire(dt, t); break; }
        if (!t || !m) break;
        if (this.coverPhase === 'hide') {
          this.wantCrouch = true;
          this.aim(dt, m.x, m.y + th * 0.68, m.z, true);
          if (this.peekNode) this._moveTo(this.coverNode, CROUCHSPD);
          if (this.mag < this.def.mag * 0.35 && this.reloadT <= 0) { this.mag = 0; this.tryFire(dt, t); }
          if (this.coverT <= 0 && this.reloadT <= 0) { this.coverPhase = 'peek'; this.coverT = R(1.2, 2.6); this.burst = 0; this.restT = 0.12; }
        } else {                      // asomarse y disparar
          if (this.peekNode) this._moveTo(this.peekNode, WALK);
          const off = this.aim(dt, m.x, m.y + th * 0.68, m.z, true);
          if (this.targetVisible && off < 0.14) this.tryFire(dt, t);
          if (this.coverT <= 0 || this.mag <= 0 || this.game.time - this.lastHurt < 0.25) { this.coverPhase = 'hide'; this.coverT = R(0.7, 1.8); }
          // si el enemigo ha flanqueado la cobertura, abandonarla
          if (this.coverT < 0.1 && this.game.world.los(this.coverNode.x, this.coverNode.y + 0.95, this.coverNode.z, m.x, m.y + 1.5, m.z, F_SIGHT)) { this.state = 'combat'; g.squads[this.team]?.release(this); this.coverNode = null; }
        }
        break;
      }
      case 'search': case 'investigate': {
        const done = this.follow(this.alertT > 0 ? RUN : WALK + 1);
        this._lookAlongPath(dt, true);
        if (done) { // llegó: barrer la zona con la mirada
          this.scanT -= dt; if (this.scanT <= 0) { this.scanT = R(0.5, 1.1); this.lookYaw += R(-1.6, 1.6); }
          this.aim(dt, b.x - Math.sin(this.lookYaw) * 10, this.eyeY, b.z - Math.cos(this.lookYaw) * 10, false);
          if ((this._scanDone = (this._scanDone || 0) + dt) > 2.5) { this._scanDone = 0; this.investigate = null; this.state = 'objective'; this.goal = null; if (t) this.memory.get(t.id).seen = false; }
        }
        break;
      }
      case 'objective': {
        const done = this.follow(this.alertT > 0 ? RUN : RUN * 0.92);
        this._lookAlongPath(dt, true);
        if (done && this.goal) { // en el objetivo: vigilar
          this.scanT -= dt; if (this.scanT <= 0) { this.scanT = R(1, 2.5); this.lookYaw += R(-1.8, 1.8); }
          this.aim(dt, b.x - Math.sin(this.lookYaw) * 10, this.eyeY, b.z - Math.cos(this.lookYaw) * 10, false);
          this.wantCrouch = this.goal.type === 'defend' || this.goal.type === 'capture';
          if (this.goal.type !== 'defend' && this.goal.type !== 'capture') this.goalT = Math.min(this.goalT, 1.5);
        }
        break;
      }
      default: { // 'idle' (bots pasivos del campo de entrenamiento): patrullan despacio
        if (this.patrol) {
          if (!this.path && this.repathT <= 0) { const n = g.nav.around(this.patrol.x, this.patrol.z, 6, _tmpNodes); const d = n[(Math.random() * n.length) | 0]; if (d) this.goTo(d.x, d.y, d.z); this.repathT = R(2, 5); }
          this.follow(1.6); this._lookAlongPath(dt);
        }
      }
    }
    // recargar con calma fuera de combate
    if (!t && this.mag < this.def.mag * 0.6 && this.reloadT <= 0 && !this.passive) { this.mag = 0; this.tryFire(dt, null); }
    // cegado: se tambalea, se cubre la cara y no dispara
    if (this.blindT > 0) {
      this.firing = false; this.wantCrouch = true;
      this._blindYaw = (this._blindYaw ?? this.yaw) + R(-1, 1) * dt * 3;
      this.aim(dt, b.x - Math.sin(this._blindYaw) * 10, this.eyeY - 2, b.z - Math.cos(this._blindYaw) * 10, false);
      this.wishX = Math.sin(now * 1.7 + this.id) * 1.2; this.wishZ = Math.cos(now * 1.3 + this.id) * 1.2;
    } else this._blindYaw = null;
    // granada cerca: huir (prioridad máxima)
    if (!this.passive && g.equipment) {
      const gr = g.equipment.dangerNear(b.x, b.y, b.z, 6.5);
      if (gr && (gr.owner === this || g.hostile(gr.owner, this) || gr.owner.team === this.team)) {
        const dx = b.x - gr.p.x, dz = b.z - gr.p.z, d = Math.hypot(dx, dz) || 1;
        this.wishX = (dx / d) * RUN; this.wishZ = (dz / d) * RUN; this.wantCrouch = false;
        if (this.path) { this.path = null; this.thinkT = 0.4; }
      }
    }

    // ---- agacharse ----
    if (this.wantCrouch) this.crouch = true;
    else if (this.crouch && w.fits(b.x, b.y, b.z, b.r, BODY.standH)) this.crouch = false;
    b.h = this.crouch ? BODY.crouchH : BODY.standH;
    if (this.crouch) { const s = Math.hypot(this.wishX, this.wishZ); if (s > CROUCHSPD) { this.wishX *= CROUCHSPD / s; this.wishZ *= CROUCHSPD / s; } }
    // ---- separación entre compañeros ----
    for (const o of g.combatants) {
      if (o === this || !o.alive) continue;
      const dx = b.x - o.body.x, dz = b.z - o.body.z, d2 = dx * dx + dz * dz;
      if (d2 < 0.81 && d2 > 1e-4 && Math.abs(b.y - o.body.y) < 1.5) { const d = Math.sqrt(d2), k = (0.9 - d) * 3; this.wishX += (dx / d) * k; this.wishZ += (dz / d) * k; }
    }
    // ---- física ----
    const acc = Math.min(1, dt * 11);
    this.vx += (this.wishX - this.vx) * acc; this.vz += (this.wishZ - this.vz) * acc;
    this.vy -= 17 * dt;
    const px = b.x, pz = b.z;
    w.move(b, this.vx * dt, this.vy * dt, this.vz * dt, _res);
    if (b.onGround) this.vy = Math.max(-2, Math.min(0, this.vy));
    const moved = Math.hypot(b.x - px, b.z - pz);
    this.moveSpeed = moved / Math.max(dt, 1e-4);
    this.fwd = moved > 1e-4 ? (-(b.x - px) * Math.sin(this.yaw) - (b.z - pz) * Math.cos(this.yaw)) / moved : 1;
    // pasos audibles
    this.stepDist += moved;
    if (this.stepDist > (this.moveSpeed > 4.5 ? 1.25 : 1.0) && b.onGround) { this.stepDist = 0; if (g.distToPlayer(b) < 30) audio.footstep(g.surfaceAt(b), this._pos(), this.moveSpeed > 4.5, this.crouch ? 0.4 : 0.9); }
    // ---- atasco: replanificar ----
    this.stuckT += dt;
    if (this.stuckT > 0.9) {
      const wantMove = Math.hypot(this.wishX, this.wishZ) > 1;
      if (wantMove && Math.hypot(b.x - this.stuckX, b.z - this.stuckZ) < 0.25) {
        this.stuckN++;
        if (this.path && this.dest && this.stuckN < 3) this.goTo(this.dest.x, this.dest.y, this.dest.z);
        else { this.path = null; this.goal = null; this.stuckN = 0; this.strafe = -this.strafe; if (this.state === 'cover') { this.state = 'combat'; this.coverNode = null; } }
      } else this.stuckN = 0;
      this.stuckT = 0; this.stuckX = b.x; this.stuckZ = b.z;
    }
    this.regen(dt, now);
    if (this.model) this.model.update(dt, this._pose());
  }

  _moveTo(n, speed) {
    const b = this.body, dx = n.x - b.x, dz = n.z - b.z, d = Math.hypot(dx, dz);
    if (d > 0.18) { this.wishX = (dx / d) * speed; this.wishZ = (dz / d) * speed; }
  }
  _lookAlongPath(dt, scan = false) {
    const b = this.body;
    if (this.path && this.path[this.pi]) {
      const n = this.path[Math.min(this.path.length - 1, this.pi + 1)];
      const yaw = Math.atan2(-(n.x - b.x), -(n.z - b.z));
      if (scan) { this.scanT -= dt; if (this.scanT <= 0) { this.scanT = R(1.2, 3); this._scanOff = Math.random() < 0.4 ? R(-0.9, 0.9) : 0; } }
      this.lookYaw = yaw + (scan ? this._scanOff || 0 : 0);
      this.aim(dt, b.x - Math.sin(this.lookYaw) * 10, this.eyeY + (n.y - b.y) * 0.6, b.z - Math.cos(this.lookYaw) * 10, false);
    }
  }
  _pose() {
    const b = this.body;
    this._p ??= {};
    const p = this._p; p.x = b.x; p.y = b.y; p.z = b.z; p.yaw = this.yaw; p.pitch = this.pitch; p.speed = this.moveSpeed; p.crouch = this.crouch; p.fwd = this.fwd; p.firing = this.firing || this.game.time - this.lastShotT < 0.25;
    return p;
  }
}
