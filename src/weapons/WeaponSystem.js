// Lógica de armas del jugador: munición, cadencia, modos de disparo, dispersión, retroceso,
// recargas por tipo (cargador, cartucho a cartucho, peine, célula, cinta) y cambio de arma.
import * as THREE from 'three';
import { WEAPONS } from '../../shared/weapons.js';
import { audio } from '../core/Audio.js';

const RELOAD_SOUNDS = {
  mag: [[0.15, 'magOut'], [0.62, 'magIn']],
  cell: [[0.15, 'cellOut'], [0.62, 'cellIn']],
  clip: [[0.05, 'boltUp'], [0.6, 'clipIn']],
  belt: [[0.08, 'cover'], [0.26, 'magOut'], [0.5, 'belt'], [0.62, 'magIn'], [0.8, 'cover']],
};
const _dir = new THREE.Vector3(), _o = new THREE.Vector3(), _r = new THREE.Vector3(), _u = new THREE.Vector3(), _mz = new THREE.Vector3(), _vel = new THREE.Vector3();

export class WeaponSystem {
  constructor(game, player, vm) {
    this.game = game; this.player = player; this.vm = vm;
    this.slots = []; this.cur = 0;
    this.state = 'equip'; this.t = 0; this.dur = 0.5;
    this.cool = 0; this.bloom = 0; this.ads = 0; this.sprintOut = 0;
    this.pending = -1; this.fired = []; this.infinite = false; this.emptyStart = false; this.needCycle = false;
    this.anim = { kind: 'equip', u: 0, empty: false, reloadType: 'mag' };
    this.shotsFired = 0;
  }
  setLoadout(primary, secondary) {
    this.slots = [primary, secondary].map((id) => { const d = WEAPONS[id]; return { def: d, mag: d.mag, reserve: d.reserve }; });
    this.cur = 0; this._equip();
  }
  /** Sustituye el arma del hueco actual (armero del campo de entrenamiento). */
  give(id) {
    const d = WEAPONS[id], i = d.slot === 'secondary' ? 1 : 0;
    this.slots[i] = { def: d, mag: d.mag, reserve: d.reserve };
    this.cur = i; this._equip();
  }
  refill() { for (const s of this.slots) { s.mag = s.def.mag; s.reserve = s.def.reserve; } }
  get slot() { return this.slots[this.cur]; }
  get def() { return this.slot.def; }

  _equip() {
    const d = this.def;
    this.vm.setWeapon(d);
    this.state = 'equip'; this.t = 0; this.dur = d.equipTime; this.cool = 0; this.bloom = 0; this.needCycle = false;
    this.player.weaponId = d.id;
    audio.mech('equip');
    this.game.onWeaponChanged?.(d);
  }
  switchTo(i) {
    if (i === this.cur || i < 0 || i >= this.slots.length || this.state === 'holster') return;
    this.pending = i; this.state = 'holster'; this.t = 0; this.dur = 0.2;
  }
  startReload() {
    const s = this.slot, d = s.def;
    if (this.state !== 'ready' || s.mag >= d.mag || (s.reserve <= 0 && !this.infinite)) return;
    this.emptyStart = s.mag === 0;
    this._ev = 0;
    if (d.reloadType === 'shell') { this.state = 'shellStart'; this.t = 0; this.dur = 0.38; }
    else { this.state = 'reload'; this.t = 0; this.dur = d.reloadTime + (this.emptyStart && d.reloadType !== 'clip' ? 0.3 : 0); }
  }
  _commitReload() {
    const s = this.slot, need = s.def.mag - s.mag, take = this.infinite ? need : Math.min(need, s.reserve);
    s.mag += take; if (!this.infinite) s.reserve -= take;
  }

  /** Dispersión actual en grados. */
  spread() {
    const d = this.def, p = this.player;
    const base = d.spreadHip + (d.spreadAds - d.spreadHip) * this.ads;
    const move = Math.min(1, p.speed / 4.5) * d.spreadMove * (1 - this.ads * 0.7);
    const air = p.body.onGround ? 0 : 2.5;
    const crouch = p.crouch ? 0.75 : 1;
    return (base + move + air + this.bloom * (1 - this.ads * 0.6)) * crouch;
  }

  update(dt, input, canAct) {
    const p = this.player, s = this.slot, d = s.def;
    this.cool -= dt;
    this.bloom = Math.max(0, this.bloom - d.bloomRecover * dt);
    this.fired.length = 0;
    // apuntado (ADS)
    const sprinting = p.sprinting;
    if (sprinting) this.sprintOut = 0.16; else this.sprintOut = Math.max(0, this.sprintOut - dt);
    const wantAds = canAct && input.mouse.right && !sprinting && (this.state === 'ready' || this.state === 'cycle');
    const prev = this.ads;
    this.ads = Math.max(0, Math.min(1, this.ads + (wantAds ? dt : -dt) / d.adsTime));
    if (prev === 0 && this.ads > 0) audio.mech('ads');
    p.adsK = this.ads; p.adsZoom = d.adsZoom; p.moveMult = d.moveMult * (1 - 0.38 * this.ads);

    // --- máquina de estados ---
    this.t += dt;
    const u = Math.min(1, this.t / this.dur);
    switch (this.state) {
      case 'equip': if (u >= 1) this.state = 'ready'; break;
      case 'holster': if (u >= 1) { this.cur = this.pending; this.pending = -1; this._equip(); } break;
      case 'reload': {
        const evs = RELOAD_SOUNDS[d.reloadType] || RELOAD_SOUNDS.mag;
        while (this._ev < evs.length && u >= evs[this._ev][0]) audio.mech(evs[this._ev++][1]);
        if (!this._committed && u >= 0.68) { this._commitReload(); this._committed = true; }
        if (this.emptyStart && d.reloadType !== 'clip' && !this._charged && u >= 0.84) { audio.mech('bolt'); this._charged = true; }
        if (u >= 1) { this.state = 'ready'; this._committed = false; this._charged = false; }
        break;
      }
      case 'shellStart': if (u >= 1) { this.state = 'shell'; this.t = 0; this.dur = d.shellTime; this._ev = 0; } break;
      case 'shell':
        if (!this._ev && u >= 0.5) { this._ev = 1; audio.mech('shell'); s.mag++; if (!this.infinite) s.reserve--; }
        if (u >= 1) {
          const more = s.mag < d.mag && (s.reserve > 0 || this.infinite) && !this._interrupt;
          this._interrupt = false; this._ev = 0; this.t = 0;
          if (more) this.dur = d.shellTime; else { this.state = 'shellEnd'; this.dur = 0.36; }
        } else if (canAct && input.mouse.leftPressed && s.mag > 0) this._interrupt = true;
        break;
      case 'shellEnd':
        if (u >= 1) { if (this.emptyStart || this.needCycle) this._startCycle(); else this.state = 'ready'; }
        break;
      case 'cycle':
        if (!this._ev && u >= 0.06) { this._ev = 1; audio.mech(d.mode === 'pump' ? 'pump' : 'boltUp'); }
        if (this._ev === 1 && u >= 0.36) { this._ev = 2; this._ejectShell(); }
        if (this._ev === 2 && u >= 0.56) { this._ev = 3; if (d.mode !== 'pump') audio.mech('boltDown'); }
        if (u >= 1) { this.state = 'ready'; this.needCycle = false; }
        break;
      default: break;
    }

    // --- entradas ---
    if (canAct) {
      if (input.hit('reload')) this.startReload();
      if (input.hit('primary')) this.switchTo(0);
      if (input.hit('secondary')) this.switchTo(1);
      if (input.hit('swap') || input.mouse.wheel !== 0) this.switchTo(this.cur ? 0 : 1);
      const trig = (d.mode === 'auto') ? input.mouse.left : input.mouse.leftPressed;
      if (trig && this.state === 'ready' && this.cool <= 0 && this.sprintOut <= 0) {
        if (s.mag > 0) this._fire();
        else if (input.mouse.leftPressed) { if (s.reserve > 0 || this.infinite) this.startReload(); else audio.mech('dry'); }
      }
      // recarga automática al vaciar el cargador
      if (s.mag === 0 && this.state === 'ready' && this.cool <= 0 && (s.reserve > 0 || this.infinite) && !input.mouse.left) this.startReload();
    }
    const a = this.anim;
    a.kind = this.state === 'ready' ? 'idle' : this.state; a.u = Math.min(1, this.t / this.dur); a.empty = this.emptyStart; a.reloadType = d.reloadType;
  }

  _startCycle() { this.state = 'cycle'; this.t = 0; this.dur = this.def.mode === 'pump' ? 0.5 : 0.78; this._ev = 0; }

  _ejectShell() {
    const d = this.def;
    if (d.energy) return;
    const cam = this.game.engine.camera;
    this.vm.ejectWorld(_mz, cam);
    _r.setFromMatrixColumn(cam.matrixWorld, 0); _u.setFromMatrixColumn(cam.matrixWorld, 1);
    _vel.copy(_r).multiplyScalar(1.6 + Math.random()).addScaledVector(_u, 1.4 + Math.random() * 0.8).add(_dir.set(this.player.vx, 0, this.player.vz));
    this.game.effects.shell(_mz, _vel, d.category === 'shotgun' ? 1.8 : d.category === 'pistol' || d.category === 'smg' ? 0.8 : 1.15);
  }

  _fire() {
    const s = this.slot, d = s.def, p = this.player, cam = this.game.engine.camera;
    if (!this.infinite || d.reloadType !== 'none') s.mag--;
    this.cool = d.interval;
    this.shotsFired++;
    p.lastShotT = this.game.time;
    const spread = THREE.MathUtils.degToRad(this.spread());
    cam.getWorldPosition(_o);
    _r.setFromMatrixColumn(cam.matrixWorld, 0); _u.setFromMatrixColumn(cam.matrixWorld, 1);
    this.vm.muzzleWorld(_mz, cam);
    for (let i = 0; i < d.pellets; i++) {
      // distribución uniforme en disco
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * Math.tan(spread);
      cam.getWorldDirection(_dir).addScaledVector(_r, Math.cos(a) * r).addScaledVector(_u, Math.sin(a) * r).normalize();
      this.game.shoot(p, _o, _dir, d, _mz);
    }
    this.bloom = Math.min(d.bloomMax, this.bloom + d.bloom);
    // retroceso de cámara (menor apuntando y agachado)
    const k = (1 - this.ads * 0.3) * (p.crouch ? 0.8 : 1);
    p.addRecoil(d.recoilV * k, (Math.random() - 0.5) * 2 * d.recoilH * k);
    this.vm.fire(d);
    audio.gunshot(d.sound, null, 1);
    this.game.effects.lightPulse(_mz, d.energy ? d.tracer : 0xffc27a, Math.min(1.4, 0.6 + d.kick * 0.4));
    if (d.mode === 'bolt' || d.mode === 'pump') { if (s.mag > 0) this._startCycle(); else this.needCycle = true; }
    else this._ejectShell();
    if (d.sound.ping && s.mag === 0) audio.ping();
    this.game.onPlayerFired?.(d);
  }
}
