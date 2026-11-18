// Partida local: une mundo, jugador, armas, bots, efectos, audio, modo de juego y HUD.
// Toda la detección de impactos pasa por shootFrom() (rayo contra el mundo + cajas de impacto
// por zona), igual que en el servidor autoritativo.
import * as THREE from 'three';
import { getMapDef, MAPS } from '../../shared/maps/index.js';
import { NavGraph } from '../../shared/nav.js';
import { F_BULLET, F_MOVE, rayVsCharacter, rayBox, BODY } from '../../shared/collision.js';
import { damageAt, WEAPONS, WEAPON_LIST } from '../../shared/weapons.js';
import { MapRenderer } from '../world/MapRenderer.js';
import { Effects } from '../gfx/Effects.js';
import { ViewModel } from '../weapons/ViewModel.js';
import { WeaponSystem } from '../weapons/WeaponSystem.js';
import { Player } from '../player/Player.js';
import { Bot, Squad, BOT_NAMES, BOT_WEAPONS } from '../ai/Bot.js';
import { Soldier } from '../entities/Soldier.js';
import { createMode } from './Modes.js';
import { audio } from '../core/Audio.js';
import { store, SKINS } from '../core/Settings.js';
import { disposeMaterials } from '../gfx/Materials.js';
import { disposeTextures } from '../gfx/Textures.js';
import { Equipment } from '../weapons/Equipment.js';
import { DEFAULT_LOADOUT } from '../../shared/weapons.js';
import { levelFromXp, isUnlocked, matchXp, unlocksBetween } from '../../shared/progression.js';

const _o = new THREE.Vector3(), _d = new THREE.Vector3(), _e = new THREE.Vector3(), _hit = {}, _wh = {};

export class Game {
  /** opts: {mode, map, difficulty, bots, scoreLimit, timeLimit, hostileBots} */
  constructor(engine, input, hud, opts) {
    this.engine = engine; this.input = input; this.hud = hud; this.opts = opts;
    this.time = 0; this.paused = false; this.over = false;
    this.combatants = []; this.bots = []; this.squads = {}; this.targets = [];
    this.tmpV = new THREE.Vector3(); this.tmpDir = new THREE.Vector3();
    this._impactSnd = 0; this._whizT = 0;
    this.onExit = null;
  }

  async load(onProgress = () => {}) {
    const o = this.opts;
    this.mapDef = getMapDef(o.map);
    this.mapInfo = MAPS[o.map];
    this.world = this.mapDef.buildCollision();
    const d = this.mapDef;
    onProgress(0.02, 'Generando navegación');
    await new Promise((r) => setTimeout(r, 0));
    this.nav = new NavGraph(this.world, { seeds: [...d.spawns.a, ...d.spawns.b, ...d.spawns.ffa, ...d.dummies] });
    this.mapRenderer = new MapRenderer(this.engine);
    await this.mapRenderer.build(d, this.world, (p, l) => onProgress(0.05 + p * 0.85, l));
    this.effects = new Effects(this.engine, this.world, d);
    this.effects.setEmitters(this.mapRenderer.emitters);
    this.effects.onShellLand = (p) => { if (this.distToPlayer(p) < 6) audio.mech('shellLand', p); };
    this.equipment = new Equipment(this);
    onProgress(0.93, 'Desplegando unidades');
    this.mode = createMode(o.mode, this, o);
    // Jugador
    const pl = (this.player = new Player(this, store.settings.name || 'Jugador', this.mode.playerTeam()));
    this.vm = new ViewModel(this.engine);
    this.weapons = new WeaponSystem(this, pl, this.vm);
    // armas bloqueadas por nivel: se usa el equipo por defecto (el campo de tiro permite todo)
    const lvl = levelFromXp(store.progress.xp), free = o.mode === 'training', lo = store.loadout;
    this.weapons.setLoadout(free || isUnlocked('weapon', lo.primary, lvl) ? lo.primary : DEFAULT_LOADOUT.primary,
      free || isUnlocked('weapon', lo.secondary, lvl) ? lo.secondary : DEFAULT_LOADOUT.secondary);
    this.weapons.infinite = o.mode === 'training';
    this.combatants.push(pl);
    // Bots
    for (const r of this.mode.roster()) this.addBot(r);
    if (o.mode === 'training') this._buildTargets();
    this.mode.init();
    for (const c of this.combatants) this.spawn(c, true);
    this.hud.attach(this);
    audio.startAmbience(d.env.ambience, d.env.reverb);
    audio.startCombatMusic(d.era);
    this._music = 0;
    onProgress(1, 'Listo');
  }

  addBot(r) {
    const era = this.mapDef.era, pool = BOT_WEAPONS[era] || BOT_WEAPONS.modern;
    const b = new Bot(this, r.name, r.team, r.difficulty || this.opts.difficulty, r.weapon || pool[(Math.random() * pool.length) | 0]);
    b.passive = !!r.passive; b.patrol = r.patrol || null; b.home = r.home || null;
    const skins = Object.keys(SKINS);
    b.model = new Soldier({ team: r.team, skin: r.team === 'a' ? store.loadout.skin : skins[(b.id * 7) % skins.length], seed: b.id, helmet: ['standard', 'standard', 'cap', 'beret'][b.id % 4] });
    b.model.setWeapon(b.weaponId);
    this.engine.scene.add(b.model.root);
    if (r.team !== 'ffa' && !this.squads[r.team]) this.squads[r.team] = new Squad(r.team);
    this.squads[r.team]?.members.push(b);
    this.bots.push(b); this.combatants.push(b);
    return b;
  }

  hostile(a, b) { if (a === b) return false; if (this.mode.ffa) return true; return a.team !== b.team; }

  spawn(c, initial = false) {
    const s = c.home && initial !== null ? c.home : this.mode.pickSpawn(c, initial);
    c.spawnAt({ x: s.x, y: s.y, z: s.z, yaw: s.yaw ?? this._facing(s) });
    c._dmgBy = new Map();
    this.equipment.resupply(c);
    if (c === this.player) {
      this.vm.visible = true; this.weapons.refill(); this.weapons.cur = 0; this.weapons._equip();
      this.hud.onSpawn();
      if (!initial) audio.uiSound('spawn');
    }
    if (c.model) { c.model.revive(); c.model.root.visible = true; }
  }
  /** Orientación inicial: mirando hacia el centro del mapa. */
  _facing(s) { return Math.atan2(s.x, s.z); }

  // ------------------------------------------------------------------ disparos
  shoot(src, o, dir, def, muzzle) { this.shootFrom(src, o.x, o.y, o.z, dir, def, muzzle); }

  shootFrom(src, ox, oy, oz, dir, def, muzzle) {
    const maxD = 320, w = this.world;
    const wh = w.raycast(ox, oy, oz, dir.x, dir.y, dir.z, maxD, F_BULLET, _wh);
    let tMax = wh ? wh.t : maxD, hitC = null, zone = null, hitT = null;
    for (const c of this.combatants) {
      if (c === src || !c.alive || (!this.hostile(src, c) && !c.isDummy)) continue;
      // descarte rápido por distancia punto-rayo
      const px = c.body.x - ox, py = c.body.y + 0.9 - oy, pz = c.body.z - oz, along = px * dir.x + py * dir.y + pz * dir.z;
      if (along < 0 || along > tMax + 1) continue;
      if (px * px + py * py + pz * pz - along * along > 2.5) continue;
      let r = rayVsCharacter(ox, oy, oz, dir.x, dir.y, dir.z, c.body.x, c.body.y, c.body.z, c.crouch, tMax, _hit);
      // cabeza y hombros asomados por una esquina
      if (!r && Math.abs(c.leanOX) + Math.abs(c.leanOZ) > 0.12) {
        r = rayVsCharacter(ox, oy, oz, dir.x, dir.y, dir.z, c.body.x + c.leanOX, c.body.y, c.body.z + c.leanOZ, c.crouch, tMax, _hit);
        if (r && r.zone === 'legs') r = null;
      }
      if (r) { tMax = r.t; hitC = c; zone = r.zone; }
    }
    if (src === this.player) for (const t of this.targets) {
      if (t.down) continue;
      const tt = rayBox(ox, oy, oz, dir.x, dir.y, dir.z, t.pos.x - 0.3, t.pos.y + 0.75, t.pos.z - 0.06, t.pos.x + 0.3, t.pos.y + 1.85, t.pos.z + 0.06, tMax);
      if (tt >= 0 && tt < tMax) { tMax = tt; hitT = t; hitC = null; }
    }
    _e.set(ox + dir.x * tMax, oy + dir.y * tMax, oz + dir.z * tMax);
    const tracerFrom = muzzle || _o.set(ox, oy, oz);
    if (src === this.player) { if (def.energy || def.pellets === 1 || Math.random() < 0.3) this.effects.tracer(tracerFrom, _e, def.tracer, def.id === 'rail'); }
    else if (Math.random() < (def.energy ? 1 : 0.55)) this.effects.tracer(tracerFrom, _e, def.tracer, def.id === 'rail');

    if (hitC) {
      const dmg = damageAt(def, tMax, zone);
      this.effects.hitBody(_e.x, _e.y, _e.z, dir.x, dir.y, dir.z);
      if (hitC !== this.player && this.distToPlayer(_e) < 40) audio.bodyHit(_e);
      this.damage(hitC, src, dmg, def, zone, dir);
      if (src === this.player) this._shotHit = true;
    } else if (hitT) {
      const zt = _e.y - hitT.pos.y > 1.55 ? 'head' : _e.y - hitT.pos.y > 1.15 ? 'torso' : 'legs';
      const dmg = damageAt(def, tMax, zt);
      this.effects.impact(_e.x, _e.y, _e.z, 0, 0, 1, 'wood', def.energy, false);
      audio.impact('wood', _e);
      hitT.hp -= dmg;
      this.hud.hitmarker(zt === 'head', hitT.hp <= 0);
      this.hud.trainingHit(zt, dmg, tMax);
      if (hitT.hp <= 0) { hitT.down = true; hitT.t = 2.5; audio.uiSound('kill'); }
      this._shotHit = true;
    } else if (wh) {
      const surf = wh.box.surf || 'concrete';
      this.effects.impact(_e.x, _e.y, _e.z, wh.nx, wh.ny, wh.nz, surf, def.energy, !wh.box.floor || this.mapDef.floorY === 0);
      if (this._impactSnd <= 0) { audio.impact(surf, _e); this._impactSnd = 0.04; }
    }
    // silbido de bala cerca de la cabeza del jugador
    const p = this.player;
    if (src !== p && p.alive && hitC !== p && this._whizT <= 0) {
      const hx = p.body.x - ox, hy = p.eyeY - oy, hz = p.body.z - oz, al = hx * dir.x + hy * dir.y + hz * dir.z;
      if (al > 2 && al < tMax) {
        const d2 = hx * hx + hy * hy + hz * hz - al * al;
        if (d2 < 2.2) { audio.whiz(_o.set(ox + dir.x * al, oy + dir.y * al, oz + dir.z * al)); this._whizT = 0.12; p.shake = Math.min(1, p.shake + 0.25); this.hud.suppress(); }
      }
    }
  }

  // ------------------------------------------------------------------ daño y bajas
  damage(target, attacker, amount, def, zone, dir = null) {
    if (!target.alive || this.over) return;
    if (target.spawnProtect > 0 && zone !== 'fall') return;
    if (this.mode.state === 'pre') return;
    amount = Math.max(1, Math.round(amount));
    target.health -= amount; target.lastHurt = this.time;
    if (attacker && attacker !== target) {
      const e = target._dmgBy.get(attacker.id) || { a: attacker, dmg: 0, t: 0 };
      e.dmg += amount; e.t = this.time; target._dmgBy.set(attacker.id, e);
    }
    if (target.isBot) { target.onHurt(attacker); target.model?.hit(); }
    if (target === this.player) {
      this.hud.hurt(attacker, amount);
      audio.uiSound('hurt');
      target.shake = Math.min(1, target.shake + 0.5);
    }
    const kill = target.health <= 0;
    if (attacker === this.player && target !== this.player) {
      this.hud.hitmarker(zone === 'head', kill);
      audio.uiSound(kill ? 'kill' : zone === 'head' ? 'headshot' : 'hit');
    }
    if (kill) this.kill(target, attacker, def, zone, dir);
  }

  kill(victim, killer, def, zone, dir) {
    victim.alive = false; victim.health = 0; victim.deaths++; victim.streak = 0;
    victim.respawnT = this.mode.respawnTime(victim);
    const st = store.stats;
    if (killer && killer !== victim) {
      killer.kills++; killer.streak++; killer.score += 100 + (zone === 'head' ? 25 : 0);
      if (killer === this.player) {
        st.kills++; if (zone === 'head') st.headshots++;
        st.weaponKills[def.id] = (st.weaponKills[def.id] || 0) + 1;
        st.bestStreak = Math.max(st.bestStreak, killer.streak);
        const dist = Math.hypot(victim.body.x - killer.body.x, victim.body.z - killer.body.z);
        st.longestKill = Math.max(st.longestKill || 0, Math.round(dist));
        this.hud.killBanner(victim, zone === 'head', killer.streak);
      }
    } else if (zone === 'fall' || !killer) victim.score = Math.max(0, victim.score - 50);
    // asistencias
    for (const e of victim._dmgBy.values()) {
      if (e.a !== killer && e.a.alive !== undefined && this.time - e.t < 10 && e.dmg >= 25) { e.a.assists++; e.a.score += 50; if (e.a === this.player) this.hud.assist(victim); }
    }
    if (victim === this.player) {
      st.deaths++;
      this.vm.visible = false; this.weapons.ads = 0;
      this.player.killerPos = killer ? { x: killer.body.x, y: killer.eyeY, z: killer.body.z } : null;
      this.hud.died(killer, def, victim.respawnT);
      audio.uiSound('death');
    }
    if (victim.isBot) {
      victim.model?.die(dir ? dir.x : 0, dir ? dir.z : 1);
      this.squads[victim.team]?.release(victim); this.squads[victim.team]?.disengage(victim);
    }
    this.hud.killfeed(killer, victim, def, zone === 'head');
    this.mode.onKill(victim, killer);
  }

  // ------------------------------------------------------------------ eventos para la IA / HUD
  onBotFired(bot, def, muzzle) {
    const d = this.distToPlayer(muzzle);
    if (d < 260) { audio.gunshot(def.sound, muzzle, 1); if (def.sound.ping && bot.mag === 0) audio.ping(muzzle); }
    this.effects.muzzleFlash(muzzle, def.energy ? def.tracer : 0xffc27a, def.category === 'shotgun' || def.category === 'sniper' ? 0.85 : 0.6);
    bot._pingT = this.time;
    this.onNoise(bot, 70);
  }
  onPlayerFired(def) {
    store.stats.shots++;
    if (this._shotHit) store.stats.hits++;
    this._shotHit = false;
    this.player._pingT = this.time;
    this.onNoise(this.player, 75);
  }
  onNoise(src, radius) { for (const b of this.bots) if (b !== src && b.alive) b.hear(src.body.x, src.body.y, src.body.z, radius, src); }
  distToPlayer(p) { const b = this.player.body; return Math.hypot(p.x - b.x, (p.y ?? b.y) - b.y, p.z - b.z); }
  surfaceAt(body) {
    const a = this.world.query(body.x - 0.1, body.z - 0.1, body.x + 0.1, body.z + 0.1);
    let best = null;
    for (const bx of a) if ((bx.flags & F_MOVE) && Math.abs(bx.maxy - body.y) < 0.06 && (!best || bx.maxy > best.maxy)) best = bx;
    return best ? best.surf : 'dirt';
  }
  onWeaponChanged(def) { this.hud?.weaponChanged(def); }

  // ------------------------------------------------------------------ campo de tiro
  _buildTargets() {
    const mat = new THREE.MeshStandardMaterial({ color: 0xd8cfb8, roughness: 0.85 });
    const ring = new THREE.MeshBasicMaterial({ color: 0xb02020 });
    const post = new THREE.MeshStandardMaterial({ color: 0x5a4630, roughness: 0.9 });
    const shape = new THREE.Shape();
    shape.moveTo(-0.3, 0); shape.lineTo(0.3, 0); shape.lineTo(0.3, 0.68); shape.lineTo(0.12, 0.8); shape.lineTo(0.12, 0.86);
    shape.absarc(0, 0.97, 0.14, -0.6, Math.PI + 0.6, false); shape.lineTo(-0.12, 0.8); shape.lineTo(-0.3, 0.68); shape.lineTo(-0.3, 0);
    const g = new THREE.ExtrudeGeometry(shape, { depth: 0.03, bevelEnabled: false }); g.translate(0, 0, -0.015);
    for (const t of this.mapDef.targets) {
      const root = new THREE.Group(); root.position.set(t.x, t.y, t.z);
      const pole = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.75, 0.06), post); pole.position.y = 0.375; root.add(pole);
      const hinge = new THREE.Group(); hinge.position.y = 0.75; root.add(hinge);
      const board = new THREE.Mesh(g, mat); board.castShadow = true; hinge.add(board);
      for (const [y, r] of [[0.45, 0.12], [0.97, 0.06]]) { const c = new THREE.Mesh(new THREE.RingGeometry(r * 0.75, r, 24), ring); c.position.set(0, y, 0.017); hinge.add(c); }
      this.engine.scene.add(root);
      this.targets.push({ root, hinge, base: new THREE.Vector3(t.x, t.y, t.z), pos: new THREE.Vector3(t.x, t.y, t.z), move: t.move, hp: 100, down: false, t: 0, ph: Math.random() * 6 });
    }
  }
  _updateTargets(dt) {
    for (const t of this.targets) {
      if (t.move) { t.ph += dt * t.move.speed / t.move.range; t.pos.x = t.base.x + Math.sin(t.ph) * t.move.range; t.root.position.x = t.pos.x; }
      if (t.down) { t.t -= dt; if (t.t <= 0) { t.down = false; t.hp = 100; } }
      const goal = t.down ? -Math.PI / 2 : 0;
      t.hinge.rotation.x += (goal - t.hinge.rotation.x) * Math.min(1, dt * 12);
    }
  }
  /** Armero del campo de tiro: siguiente arma de la lista. */
  cycleArmory(dirn = 1) {
    const i = WEAPON_LIST.findIndex((w) => w.id === this.weapons.def.id);
    const next = WEAPON_LIST[(i + dirn + WEAPON_LIST.length) % WEAPON_LIST.length];
    this.weapons.give(next.id);
    this.hud.toast(`${next.name} equipada`);
  }

  // ------------------------------------------------------------------ bucle
  update(dt) {
    if (this.paused) return;
    this.time += dt;
    this._impactSnd -= dt; this._whizT -= dt;
    const inp = this.input, p = this.player, live = this.mode.state === 'live' && !this.over;
    const canAct = inp.active && !this.over;
    p.update(dt, inp, canAct && (live || this.mode.state === 'pre'));
    if (this.mode.state === 'pre') { p.vx = p.vz = 0; }
    this.equipment.playerInput(dt, inp, canAct && live);
    if (p.alive) this.weapons.update(dt, inp, canAct && live);
    if (canAct && this.opts.mode === 'training' && inp.hit('interact')) this.cycleArmory(1);
    if (canAct && inp.keys.has(store.settings.keys.scoreboard)) this.hud.showScoreboard(true); else this.hud.showScoreboard(false);
    // bots
    if (live || this.over) for (const b of this.bots) b.update(live ? dt : 0);
    else for (const b of this.bots) if (b.model) b.model.update(dt, b._pose());
    // reapariciones
    for (const c of this.combatants) {
      if (c.alive) continue;
      c.respawnT -= dt;
      if (c.isBot && c.model && c.respawnT < 1.2) c.model.root.visible = false;
      if (c.respawnT <= 0 && live) this.spawn(c);
    }
    if (this.targets.length) this._updateTargets(dt);
    this.equipment.update(dt);
    this.mode.update(dt);
    this._updateMusic(dt);
    // cámara, arma y entorno
    const cam = this.engine.camera;
    p.applyCamera(cam, this.time);
    if (p.alive) {
      this.vm.update({ dt, time: this.time, anim: this.weapons.anim, ads: this.weapons.ads, sprint: p.sprinting, speed: p.speed, onGround: p.body.onGround,
        vy: p.vy, bobPhase: p.bobPhase, mdx: p.mdx, mdy: p.mdy, landed: p.landedImpact, bobScale: store.settings.headBob });
      p.landedImpact = 0;
    } else this.vm.rig.visible = false;
    cam.getWorldDirection(_d);
    this.mapRenderer.update(dt, this.time, cam.position, _d);
    this.mapRenderer.setViewLight(p.viewLight);
    this.effects.update(dt, this.time, cam);
    audio.setListener(cam.position.x, cam.position.y, cam.position.z, _d.x, _d.y, _d.z);
    this.hud.update(dt);
    store.stats.timePlayed += dt;
    inp.endFrame();
  }

  /** Intensidad de la música: sube con el combate cercano y baja con la calma. */
  _updateMusic(dt) {
    const p = this.player, t = this.time;
    let want = 0.15;
    if (this.mode.state === 'live') {
      want = 0.3;
      if (t - p.lastHurt < 6 || t - p.lastShotT < 4) want = 1;
      else if (this.bots.some((b) => b.alive && b.target === p)) want = 0.7;
      if (!p.alive) want = 0.2;
      const info = this.mode.timeLimit > 0 ? this.mode.timeLeft : 999;
      if (info < 60) want = Math.max(want, 0.8);
    }
    this._music += (want - this._music) * Math.min(1, dt * (want > this._music ? 1.5 : 0.25));
    audio.setCombatIntensity(this._music);
  }

  /** Fin de partida: estadísticas, experiencia y pantalla de resultados. */
  finish(result) {
    if (this.over) return;
    this.over = true;
    const st = store.stats, mine = this.mode.ffa ? 'me' : this.player.team;
    if (this.opts.mode !== 'training') {
      st.matches++;
      st.modeMatches[this.opts.mode] = (st.modeMatches[this.opts.mode] || 0) + 1;
      const won = result.winner === mine || (this.mode.ffa && result.winnerC === this.player);
      if (won) st.wins++; else st.losses++;
      result.won = won;
      audio.uiSound(won ? 'win' : 'lose');
      // experiencia y desbloqueos
      const before = store.progress.xp, lvA = levelFromXp(before);
      const xp = matchXp({ score: this.player.score, won, draw: !this.mode.ffa && !result.winner, mode: this.opts.mode, minutes: this.time / 60 });
      store.progress.xp = before + xp.total;
      const lvB = levelFromXp(store.progress.xp);
      result.xp = { ...xp, before, after: store.progress.xp, levelBefore: lvA, levelAfter: lvB, unlocks: unlocksBetween(lvA, lvB) };
      store.saveProgress();
    }
    audio.stopCombatMusic();
    store.saveStats();
    this.input.unlock();
    this.hud.results(result);
  }

  dispose() {
    audio.stopAmbience();
    audio.stopCombatMusic();
    this.equipment.dispose();
    this.hud.detach();
    for (const b of this.bots) b.model?.dispose();
    for (const t of this.targets) { this.engine.scene.remove(t.root); t.root.traverse((o) => o.geometry?.dispose()); }
    this.vm.dispose(); this.effects.dispose(); this.mapRenderer.dispose();
    const scene = this.engine.scene;
    if (this.mode?.group) { scene.remove(this.mode.group); this.mode.group.traverse((o) => { o.geometry?.dispose(); o.material?.map?.dispose(); o.material?.dispose?.(); }); }
    for (const o of [...scene.children]) if (o.isMesh) scene.remove(o);
    disposeMaterials(); disposeTextures();
    this.engine.renderer.renderLists.dispose();
  }
}

export { BODY, WEAPONS, BOT_NAMES };
