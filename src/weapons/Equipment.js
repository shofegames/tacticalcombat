// Equipo del combate: granadas (fragmentación, humo, aturdidora) y cuchillo, para el jugador y los bots.
// Proyectiles con rebote contra el mundo de colisiones, explosiones con daño por línea de visión,
// cortinas de humo que bloquean la visión de la IA, cegueras por destello y ataque cuerpo a cuerpo.
// Incluye la mano en primera persona que lanza la granada o empuña el cuchillo.
import * as THREE from 'three';
import { GEAR, blastDamage, ballistic } from '../../shared/gear.js';
import { F_MOVE, F_BULLET, F_SIGHT } from '../../shared/collision.js';
import { Particles } from '../gfx/Effects.js';
import { smokeSprite } from '../gfx/Textures.js';
import { audio } from '../core/Audio.js';
import { store, SKINS } from '../core/Settings.js';

export const GRAVITY = 15;
const R = (a, b) => a + Math.random() * (b - a);
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const _o = new THREE.Vector3(), _d = new THREE.Vector3(), _r = new THREE.Vector3(), _u = new THREE.Vector3(), _wh = {};

// Tiempos de las acciones del jugador (s): duración total y momento en que ocurre el efecto.
const THROW = { dur: 0.72, act: 0.42 };
const MELEE = { dur: 0.52, act: 0.2 };

function grenadeMesh(type) {
  const g = new THREE.Group(), def = GEAR[type];
  const body = new THREE.MeshStandardMaterial({ color: def.color, roughness: 0.6, metalness: 0.3 });
  const metal = new THREE.MeshStandardMaterial({ color: 0x9a9a92, roughness: 0.35, metalness: 0.9 });
  if (type === 'frag') {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.034, 12, 10), body); b.scale.set(1, 1.22, 1); g.add(b);
  } else {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.1, 12), body); g.add(b);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.031, 0.031, 0.012, 12), new THREE.MeshStandardMaterial({ color: type === 'smoke' ? 0xd8d8d0 : 0xd8b030, roughness: 0.6 }));
    band.position.y = 0.02; g.add(band);
  }
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.016, 0.024, 8), metal); cap.position.y = type === 'frag' ? 0.045 : 0.06; g.add(cap);
  const spoon = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.07, 0.006), metal); spoon.position.set(0.02, type === 'frag' ? 0.022 : 0.03, 0); spoon.rotation.z = -0.25; g.add(spoon);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}
function knifeMesh() {
  const g = new THREE.Group();
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.03, 0.17), new THREE.MeshStandardMaterial({ color: 0xc8ccd0, roughness: 0.22, metalness: 1 }));
  blade.position.z = -0.1; g.add(blade);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.015, 0.04, 4), blade.material); tip.rotation.x = -Math.PI / 2; tip.position.z = -0.205; tip.scale.set(0.33, 1, 1); g.add(tip);
  const guard = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.05, 0.012), new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.5, metalness: 0.6 })); g.add(guard);
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.016, 0.11, 8), new THREE.MeshStandardMaterial({ color: 0x1b1b1a, roughness: 0.85 }));
  handle.rotation.x = Math.PI / 2; handle.position.z = 0.058; g.add(handle);
  return g;
}

/** Mano en primera persona para lanzar granadas y acuchillar. */
class GearView {
  constructor(engine) {
    this.engine = engine;
    this.root = new THREE.Group(); this.root.visible = false; engine.vmScene.add(this.root);
    const skin = SKINS[store.loadout.skin] || SKINS.woodland;
    this.hand = new THREE.Group(); this.root.add(this.hand);
    const glove = new THREE.MeshStandardMaterial({ color: skin.glove, roughness: 0.7 });
    const cloth = new THREE.MeshStandardMaterial({ color: skin.cloth, roughness: 0.92 });
    const palm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.095, 0.05), glove); this.hand.add(palm);
    const fingers = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.04, 0.05), glove); fingers.position.set(0, 0.035, -0.035); fingers.rotation.x = 0.7; this.hand.add(fingers);
    const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.45, 10), cloth); sleeve.position.set(0, -0.26, 0.04); this.hand.add(sleeve);
    this.items = { frag: grenadeMesh('frag'), smoke: grenadeMesh('smoke'), flash: grenadeMesh('flash'), knife: knifeMesh() };
    this.items.knife.position.set(0, 0.01, -0.02);
    for (const [k, m] of Object.entries(this.items)) { m.visible = false; if (k !== 'knife') m.position.set(0, 0.06, -0.03); this.hand.add(m); }
    this.kind = null; this.t = 0; this.dur = 1;
  }
  play(kind, dur) { this.kind = kind; this.t = 0; this.dur = dur; this.root.visible = true; for (const [k, m] of Object.entries(this.items)) m.visible = k === kind; }
  stop() { this.kind = null; this.root.visible = false; }
  update(dt) {
    if (!this.kind) return;
    this.t += dt;
    const u = this.t / this.dur, h = this.hand;
    if (u >= 1) { this.stop(); return; }
    if (this.kind === 'knife') {
      // entra por la derecha, tajo diagonal hacia la izquierda y sale
      const a = sstep(0, 0.2, u), s = sstep(0.2, 0.55, u), o = sstep(0.6, 1, u);
      h.position.set(0.32 - 0.5 * s + 0.1 * o, -0.42 + 0.26 * a + 0.06 * s - 0.3 * o, -0.42 - 0.08 * s);
      h.rotation.set(-0.2 - 0.6 * s, 0.6 - 1.1 * s, -0.9 + 1.4 * s);
    } else {
      // sube con la granada, se echa atrás y lanza hacia delante
      const a = sstep(0, 0.25, u), back = sstep(0.25, 0.55, u), fw = sstep(0.55, 0.7, u), o = sstep(0.7, 1, u);
      h.position.set(0.2 + 0.06 * back - 0.12 * fw, -0.5 + 0.32 * a + 0.12 * back - 0.08 * fw - 0.35 * o, -0.38 + 0.12 * back - 0.3 * fw);
      h.rotation.set(0.3 * back - 1.1 * fw, -0.2, -0.15);
      const m = this.items[this.kind]; if (m) m.visible = u < THROW.act / THROW.dur + 0.02;
    }
  }
  dispose() { this.engine.vmScene.remove(this.root); this.root.traverse((o) => { o.geometry?.dispose(); o.material?.dispose?.(); }); }
}

export class Equipment {
  constructor(game) {
    this.game = game;
    const eng = game.engine;
    this.group = new THREE.Group(); eng.scene.add(this.group);
    this.projectiles = []; this.smokes = [];
    this.smokeFx = new Particles(Math.round(420 * Math.max(0.6, eng.q.particles)), smokeSprite(), false);
    this.smokeFx.mat.uniforms.uFog.value = (game.mapDef.env.fogDensity || 0.01) * 0.6;
    this.group.add(this.smokeFx.mesh);
    this.view = new GearView(eng);
    this.meshes = { frag: grenadeMesh('frag'), smoke: grenadeMesh('smoke'), flash: grenadeMesh('flash') };
    this.flashT = 0; this.flashMax = 1; this.meleeCd = 0; this.busy = 0;
  }

  /** Recarga de granadas al reaparecer. */
  resupply(c) {
    const tac = c.isPlayer ? (store.loadout.tactical || 'smoke') : 'smoke';
    c.gear = c.isPlayer ? { lethal: GEAR.frag.count, tactical: GEAR[tac].count, tacType: tac } : { lethal: 1, tactical: 1, tacType: 'smoke' };
    if (this.game.weapons?.infinite && c.isPlayer) c.gear.infinite = true;
  }

  // ------------------------------------------------------------------ jugador
  playerInput(dt, input, canAct) {
    const g = this.game, p = g.player, ws = g.weapons;
    this.meleeCd -= dt; this.busy -= dt;
    if (!canAct || !p.alive || this.busy > 0 || !ws.canGear()) return;
    const gear = p.gear;
    if (input.hit('melee') && this.meleeCd <= 0) {
      this.busy = MELEE.dur; this.meleeCd = GEAR.knife.cooldown;
      ws.startGear(MELEE.dur, MELEE.act / MELEE.dur, () => this.melee(p));
      this.view.play('knife', MELEE.dur); audio.knife();
      return;
    }
    let type = null;
    if (input.hit('lethal')) { if (gear.lethal > 0 || gear.infinite) type = 'frag'; else g.hud.toast('Sin granadas', 1); }
    else if (input.hit('tactical')) { if (gear.tactical > 0 || gear.infinite) type = gear.tacType; else g.hud.toast(`Sin ${GEAR[gear.tacType].short.toLowerCase()}`, 1); }
    if (!type) return;
    if (!gear.infinite) { if (type === 'frag') gear.lethal--; else gear.tactical--; }
    this.busy = THROW.dur;
    ws.startGear(THROW.dur, THROW.act / THROW.dur, () => this._playerThrow(type));
    this.view.play(type, THROW.dur); audio.mech('pin');
  }
  _playerThrow(type) {
    const g = this.game, p = g.player, cam = g.engine.camera, def = GEAR[type];
    cam.getWorldPosition(_o); cam.getWorldDirection(_d);
    _r.setFromMatrixColumn(cam.matrixWorld, 0); _u.setFromMatrixColumn(cam.matrixWorld, 1);
    const o = _o.clone().addScaledVector(_d, 0.45).addScaledVector(_r, 0.16).addScaledVector(_u, -0.08);
    // no lanzar a través de una pared pegada a la cara
    const block = g.world.raycast(_o.x, _o.y, _o.z, o.x - _o.x, o.y - _o.y, o.z - _o.z, 0.5, F_MOVE, _wh);
    if (block) o.copy(_o).addScaledVector(_d, Math.max(0, block.t - 0.12));
    const v = _d.clone().multiplyScalar(def.throwSpeed).addScaledVector(_u, 2.6);
    v.x += p.vx * 0.6; v.z += p.vz * 0.6; v.y += Math.max(0, p.vy) * 0.5;
    this.spawn(type, p, o, v);
    audio.throwWhoosh();
  }

  // ------------------------------------------------------------------ bots
  /** Lanza una granada de bot hacia un punto (con error según la dificultad). */
  botThrow(bot, type, target) {
    const g = this.game, def = GEAR[type];
    const err = bot.diff.aimErr * 0.35;
    const t = { x: target.x + R(-err, err), y: target.y, z: target.z + R(-err, err) };
    const o = new THREE.Vector3(bot.body.x, bot.eyeY + 0.1, bot.body.z);
    const v = ballistic(o, t, GRAVITY);
    const sp = Math.hypot(v.x, v.y, v.z);
    if (sp > def.throwSpeed * 1.35) return false;          // demasiado lejos para lanzarla
    bot.yaw = Math.atan2(-(t.x - o.x), -(t.z - o.z));
    this.spawn(type, bot, o, new THREE.Vector3(v.x, v.y, v.z));
    if (g.distToPlayer(o) < 30) audio.throwWhoosh(o);
    bot.lastShotT = g.time;                                 // el lanzamiento delata (radar)
    return true;
  }
  /** Cuchillada de un bot a corta distancia. */
  botMelee(bot, target) {
    const g = this.game;
    const dx = target.body.x - bot.body.x, dz = target.body.z - bot.body.z, d = Math.hypot(dx, dz);
    if (d > 2 || !g.world.los(bot.body.x, bot.eyeY, bot.body.z, target.body.x, target.body.y + 1.2, target.body.z, F_BULLET)) return false;
    bot.yaw = Math.atan2(-dx, -dz);
    if (g.distToPlayer(bot.body) < 25) audio.knife(bot._pos());
    g.damage(target, bot, GEAR.knife.botDamage, GEAR.knife, 'torso', _d.set(dx / (d || 1), 0, dz / (d || 1)));
    return true;
  }

  // ------------------------------------------------------------------ proyectiles
  spawn(type, owner, pos, vel) {
    const mesh = this.meshes[type].clone();
    mesh.position.copy(pos); this.group.add(mesh);
    const def = GEAR[type];
    this.projectiles.push({ type, def, owner, p: pos.clone(), v: vel.clone(), t: 0, mesh, rest: false, spin: new THREE.Vector3(R(-12, 12), R(-6, 6), R(-12, 12)), bounces: 0 });
  }

  /** Granada de fragmentación viva más cercana dentro de r (para el aviso del HUD y la huida de los bots). */
  dangerNear(x, y, z, r) {
    let best = null, bd = r;
    for (const pr of this.projectiles) {
      if (pr.type !== 'frag') continue;
      const d = Math.hypot(pr.p.x - x, pr.p.z - z);
      if (d < bd && Math.abs(pr.p.y - y) < 4) { bd = d; best = pr; }
    }
    return best;
  }

  /** ¿Algún humo corta el segmento a→b? */
  smokeBlocks(ax, ay, az, bx, by, bz) {
    for (const s of this.smokes) {
      if (s.r < 0.6) continue;
      const dx = bx - ax, dy = by - ay, dz = bz - az, L2 = dx * dx + dy * dy + dz * dz || 1;
      let k = ((s.x - ax) * dx + (s.y + 1.2 - ay) * dy + (s.z - az) * dz) / L2; k = Math.max(0, Math.min(1, k));
      const px = ax + dx * k - s.x, py = ay + dy * k - (s.y + 1.2), pz = az + dz * k - s.z;
      if (px * px + py * py * 1.6 + pz * pz < s.r * s.r * 0.8) return true;
    }
    return false;
  }

  update(dt) {
    const g = this.game, w = g.world;
    this.view.update(dt);
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const pr = this.projectiles[i];
      pr.t += dt;
      if (!pr.rest) {
        // subpasos para no atravesar paredes delgadas
        const steps = Math.max(1, Math.ceil(pr.v.length() * dt / 0.25));
        const h = dt / steps;
        for (let s = 0; s < steps && !pr.rest; s++) {
          pr.v.y -= GRAVITY * h;
          const len = pr.v.length() * h;
          if (len < 1e-5) continue;
          _d.copy(pr.v).normalize();
          const hit = w.raycast(pr.p.x, pr.p.y, pr.p.z, _d.x, _d.y, _d.z, len + 0.06, F_MOVE | F_BULLET, _wh);
          if (hit) {
            pr.p.addScaledVector(_d, Math.max(0, hit.t - 0.06));
            const n = _r.set(hit.nx, hit.ny, hit.nz), vn = pr.v.dot(n);
            pr.v.addScaledVector(n, -(1 + pr.def.bounce) * vn).multiplyScalar(0.72);
            pr.spin.multiplyScalar(0.6);
            if (Math.abs(vn) > 2 && pr.bounces < 4 && g.distToPlayer(pr.p) < 30) audio.grenadeBounce(pr.p, Math.min(1, Math.abs(vn) / 10));
            pr.bounces++;
            if (hit.ny > 0.7 && pr.v.length() < 1.2) { pr.rest = true; pr.v.set(0, 0, 0); pr.p.y += 0.0; }
          } else pr.p.addScaledVector(pr.v, h);
        }
        pr.mesh.rotation.x += pr.spin.x * dt; pr.mesh.rotation.y += pr.spin.y * dt; pr.mesh.rotation.z += pr.spin.z * dt;
        if (pr.p.y < (g.mapDef.floorY ?? 0) - 30) { this._remove(i); continue; }
      } else if (pr.type !== 'frag') pr.mesh.rotation.z += dt * 0.5;
      pr.mesh.position.copy(pr.p);
      if (pr.t >= pr.def.fuse) { this._detonate(pr); this._remove(i); }
    }
    // humo
    for (let i = this.smokes.length - 1; i >= 0; i--) {
      const s = this.smokes[i];
      s.t += dt;
      const grow = Math.min(1, s.t / 2.2), fade = Math.min(1, (s.dur - s.t) / 2.5);
      s.r = s.max * Math.min(grow, Math.max(0, fade + 0.15));
      if (s.t < s.dur - 3) {
        s.emit -= dt;
        while (s.emit <= 0) {
          s.emit += 0.045;
          const a = Math.random() * 6.283, rr = Math.sqrt(Math.random()) * s.max * grow * 0.75;
          const gy = 0.6 + Math.random() * 1.8 * grow;
          const c = 0.62 + Math.random() * 0.12;
          this.smokeFx.emit(s.x + Math.cos(a) * rr, s.y + gy, s.z + Math.sin(a) * rr, R(-0.25, 0.25), R(0.02, 0.18), R(-0.25, 0.25), R(4.5, 6.5), 4, 11, c, c, c * 1.02, 0.6, -0.01, 0.35);
        }
      }
      if (s.t >= s.dur) this.smokes.splice(i, 1);
    }
    this.smokeFx.update(dt);
    // ceguera del jugador
    if (this.flashT > 0) {
      this.flashT = Math.max(0, this.flashT - dt);
      g.hud.setFlash(Math.min(1, (this.flashT / this.flashMax) * 1.6));
    }
  }
  _remove(i) { const pr = this.projectiles[i]; this.group.remove(pr.mesh); this.projectiles.splice(i, 1); }

  _detonate(pr) {
    const g = this.game, p = pr.p;
    if (pr.type === 'frag') this._explode(pr);
    else if (pr.type === 'smoke') {
      this.smokes.push({ x: p.x, y: g.world.groundAt(p.x, p.y + 0.3, p.z), z: p.z, r: 0, max: pr.def.radius, t: 0, dur: pr.def.duration, emit: 0 });
      audio.smokePop(p);
    } else this._flash(pr);
  }

  _explode(pr) {
    const g = this.game, p = pr.p, def = pr.def, w = g.world, fx = g.effects;
    const ox = p.x, oy = p.y + 0.25, oz = p.z;
    // efectos: bola de fuego, metralla, humo negro, luz y polvo
    for (let i = 0; i < 26; i++) fx.sparks.emit(ox + R(-0.3, 0.3), oy + R(0, 0.4), oz + R(-0.3, 0.3), R(-3, 3), R(0.5, 4), R(-3, 3), R(0.18, 0.4), R(3, 5), R(7, 10), 3, 1.4, 0.4, 1, -1, 3);
    for (let i = 0; i < 34; i++) { const s = R(8, 20); fx.sparks.emit(ox, oy, oz, R(-1, 1) * s, R(0.1, 1) * s, R(-1, 1) * s, R(0.2, 0.6), 0.12, 0.04, 3, 1.8, 0.6, 1, 14, 0.5); }
    for (let i = 0; i < 18; i++) { const k = R(0.08, 0.16); fx.smoke.emit(ox + R(-0.6, 0.6), oy + R(0, 1), oz + R(-0.6, 0.6), R(-1.5, 1.5), R(1, 3), R(-1.5, 1.5), R(2.5, 4.5), 2, 9, k, k, k, 0.75, -0.2, 1.2); }
    for (let i = 0; i < 10; i++) { const d = fx.dustColor; fx.smoke.emit(ox + R(-1.5, 1.5), p.y + 0.1, oz + R(-1.5, 1.5), R(-3, 3), R(0.2, 1), R(-3, 3), R(1.5, 2.5), 1, 6, d.r * 0.55, d.g * 0.5, d.b * 0.45, 0.5, 0, 2); }
    fx.lightPulse(_o.set(ox, oy + 0.5, oz), 0xff9a4a, 3.2);
    audio.explosion(_o.set(ox, oy, oz), g.distToPlayer(_o));
    // daño por línea de visión (los compañeros no reciben daño; el lanzador sí)
    for (const c of g.combatants) {
      if (!c.alive) continue;
      if (c !== pr.owner && !g.hostile(pr.owner, c)) continue;
      const cx = c.body.x, cy = c.body.y + (c.crouch ? 0.6 : 0.9), cz = c.body.z;
      const d = Math.hypot(cx - ox, cy - oy, cz - oz);
      if (d > def.radius) continue;
      if (!w.los(ox, oy, oz, cx, cy, cz, F_BULLET) && !w.los(ox, oy + 0.6, oz, cx, c.body.y + 1.5, cz, F_BULLET)) continue;
      const dmg = blastDamage(def, d);
      const hd = Math.hypot(cx - ox, cz - oz) || 1;
      g.damage(c, pr.owner, dmg, def, 'torso', _d.set((cx - ox) / hd, 0, (cz - oz) / hd));
    }
    // dianas del campo de tiro
    for (const t of g.targets) if (!t.down && Math.hypot(t.pos.x - ox, t.pos.z - oz) < def.radius * 0.6) { t.down = true; t.t = 2.5; t.hp = 0; }
    // sacudida y ruido
    const pd = g.distToPlayer(_o.set(ox, oy, oz));
    if (pd < 30) { g.player.shake = Math.min(1, g.player.shake + (1 - pd / 30) * 1.2); if (pd < 14) g.hud.suppress(); }
    g.onNoise(pr.owner, 90);
  }

  _flash(pr) {
    const g = this.game, p = pr.p, def = pr.def, w = g.world;
    const ox = p.x, oy = p.y + 0.3, oz = p.z;
    g.effects.lightPulse(_o.set(ox, oy + 0.3, oz), 0xffffff, 4);
    for (let i = 0; i < 16; i++) g.effects.sparks.emit(ox, oy, oz, R(-6, 6), R(0, 6), R(-6, 6), R(0.1, 0.25), 0.5, 0.1, 3, 3, 3, 1, 4, 1);
    g.effects.sparks.emit(ox, oy, oz, 0, 0, 0, 0.12, 14, 4, 4, 4, 4, 1, 0, 0);
    const seen = (cx, cy, cz) => w.los(ox, oy, oz, cx, cy, cz, F_SIGHT) && !this.smokeBlocks(ox, oy, oz, cx, cy, cz);
    // jugador
    const pl = g.player, cam = g.engine.camera;
    const pd = g.distToPlayer(_o.set(ox, oy, oz));
    audio.flashbang(_o, pd);
    if (pl.alive && pd < def.radius && seen(pl.body.x, pl.eyeY, pl.body.z)) {
      cam.getWorldDirection(_d);
      const fx = (ox - cam.position.x) / (pd || 1), fy = (oy - cam.position.y) / (pd || 1), fz = (oz - cam.position.z) / (pd || 1);
      const facing = _d.x * fx + _d.y * fy + _d.z * fz;
      const k = Math.pow(1 - pd / def.radius, 0.55) * (facing > 0.35 ? 1 : facing > -0.2 ? 0.55 : 0.25);
      const dur = def.duration * k;
      if (dur > 0.25) { this.flashT = Math.max(this.flashT, dur); this.flashMax = Math.max(this.flashT, 0.6); audio.tinnitus(Math.min(1, k * 1.2), dur); }
    }
    // bots
    for (const b of g.bots) {
      if (!b.alive) continue;
      const d = Math.hypot(b.body.x - ox, b.eyeY - oy, b.body.z - oz);
      if (d > def.radius || !seen(b.body.x, b.eyeY, b.body.z)) continue;
      const dirYaw = Math.atan2(-(ox - b.body.x), -(oz - b.body.z));
      let a = dirYaw - b.yaw; while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI;
      const k = Math.pow(1 - d / def.radius, 0.55) * (Math.abs(a) < 1.1 ? 1 : 0.35);
      b.blind(def.duration * k);
      if (b !== pr.owner && g.hostile(pr.owner, b) && pr.owner === pl && k > 0.4) g.hud.hitmarker(false, false);
    }
    g.onNoise(pr.owner, 80);
  }

  // ------------------------------------------------------------------ cuchillo
  melee(att) {
    const g = this.game, def = GEAR.knife, cam = g.engine.camera, w = g.world;
    cam.getWorldPosition(_o); cam.getWorldDirection(_d);
    const fl = Math.hypot(_d.x, _d.z) || 1, fx = _d.x / fl, fz = _d.z / fl;
    let best = null, bd = def.range + 0.4;
    for (const c of g.combatants) {
      if (c === att || !c.alive || (!g.hostile(att, c) && !c.isDummy)) continue;
      const dx = c.body.x - _o.x, dz = c.body.z - _o.z, d = Math.hypot(dx, dz);
      if (d > def.range + 0.35 || Math.abs(c.body.y - att.body.y) > 1.6) continue;
      const cosA = (dx * fx + dz * fz) / (d || 1);
      if (cosA < Math.cos(def.angle * Math.PI / 180) && d > 0.7) continue;
      if (!w.los(_o.x, _o.y, _o.z, c.body.x, c.body.y + 1.1, c.body.z, F_BULLET)) continue;
      if (d < bd) { bd = d; best = c; }
    }
    // dianas
    if (!best) for (const t of g.targets) {
      if (t.down) continue;
      const dx = t.pos.x - _o.x, dz = t.pos.z - _o.z, d = Math.hypot(dx, dz);
      if (d < def.range && (dx * fx + dz * fz) / (d || 1) > 0.7) { t.down = true; t.t = 2.5; t.hp = 0; g.hud.hitmarker(false, true); audio.uiSound('kill'); return; }
    }
    if (!best) {
      // golpe contra la pared
      const wh = w.raycast(_o.x, _o.y, _o.z, _d.x, _d.y, _d.z, def.range * 0.8, F_BULLET, _wh);
      if (wh) { g.effects.impact(_o.x + _d.x * wh.t, _o.y + _d.y * wh.t, _o.z + _d.z * wh.t, wh.nx, wh.ny, wh.nz, wh.box.surf || 'concrete', false, false); audio.impact(wh.box.surf || 'concrete', null); }
      return;
    }
    _e.set(best.body.x, best.body.y + 1.1, best.body.z);
    g.effects.hitBody(_e.x, _e.y, _e.z, fx, 0, fz);
    audio.bodyHit(null);
    g.damage(best, att, def.damage, def, 'torso', _d.set(fx, 0, fz));
  }

  dispose() {
    this.view.dispose();
    this.game.engine.scene.remove(this.group);
    this.group.traverse((o) => { o.geometry?.dispose(); });
    for (const m of Object.values(this.meshes)) m.traverse((o) => { o.geometry?.dispose(); o.material?.dispose?.(); });
    this.smokeFx.mat.dispose();
  }
}
const _e = new THREE.Vector3();
