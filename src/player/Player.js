// Controlador FPS: caminar, correr, saltar, agacharse, desplazamiento lateral, cámara con balanceo,
// retroceso y transiciones suaves. Movimiento resuelto contra el mundo de colisiones (sin atravesar
// paredes ni deslizamiento artificial: aceleración y fricción altas).
import * as THREE from 'three';
import { Combatant } from '../entities/Combatant.js';
import { BODY, F_MOVE, F_BULLET } from '../../shared/collision.js';
import { store } from '../core/Settings.js';
import { audio } from '../core/Audio.js';

export const MOVE = { walk: 4.7, sprint: 7.0, crouch: 2.4, accel: 62, friction: 52, airAccel: 14, gravity: 17, jump: 5.9, slideTime: 0.8, lean: 0.45 };
const _res = { hitX: false, hitZ: false, hitCeil: false, landed: false, stepped: 0 };
const DEG = Math.PI / 180;

export class Player extends Combatant {
  constructor(game, name, team) {
    super(name, team);
    this.game = game; this.isPlayer = true;
    this.crouchK = 0; this.sprinting = false;
    this.adsK = 0; this.adsZoom = 1; this.moveMult = 1;
    this.bobPhase = 0; this.stepDist = 0; this.stepSmooth = 0; this.landK = 0; this.landedImpact = 0;
    this.recT = 0; this.recC = 0; this.recYawT = 0; this.recYawC = 0;
    this.roll = 0; this.surf = 'concrete'; this.viewLight = 1; this._lt = 0;
    this.shake = 0; this.deathT = 0; this.killerPos = null;
    this.mdx = 0; this.mdy = 0;
    this.leanK = 0; this.leanOff = 0; this.slideT = 0; this.slideCd = 0; this.crouchToggle = false; this.sprintToggle = false;
  }

  /**
   * Asistencia de apuntado («fricción»): con la mira sobre un enemigo visible, la sensibilidad baja
   * para no pasarse de largo. No mueve la mira por el jugador. Devuelve el factor de sensibilidad.
   */
  _aimAssist(dt, input, s) {
    const mode = s.aimAssist || 'auto';
    if (mode === 'off' || (mode === 'auto' && !input.touch)) return 1;
    this._aaT = (this._aaT ?? 0) - dt;
    if (this._aaT <= 0) {
      this._aaT = 0.05;
      const g = this.game, cam = g.engine.camera, cx = cam.position.x, cy = cam.position.y, cz = cam.position.z;
      const cp = Math.cos(this.pitch), fx = -Math.sin(this.yaw) * cp, fy = Math.sin(this.pitch), fz = -Math.cos(this.yaw) * cp;
      let on = false;
      for (const c of g.combatants) {
        if (c === this || !c.alive || !g.hostile(this, c)) continue;
        const dx = c.body.x - cx, dy = c.body.y + (c.crouch ? 0.8 : 1.15) - cy, dz = c.body.z - cz, d = Math.hypot(dx, dy, dz);
        if (d > 70 || d < 0.5) continue;
        const along = dx * fx + dy * fy + dz * fz;
        if (along <= 0) continue;
        const off = Math.sqrt(Math.max(0, d * d - along * along));        // distancia del enemigo a la línea de la mira
        if (off > 0.55 + d * 0.012) continue;
        if (!g.world.los(cx, cy, cz, c.body.x, c.body.y + 1.2, c.body.z, F_BULLET)) continue;
        on = true; break;
      }
      this._aaOn = on;
    }
    this._aaK = (this._aaK ?? 1) + ((this._aaOn ? 0.5 : 1) - (this._aaK ?? 1)) * Math.min(1, dt * 12);
    return this._aaK;
  }

  /**
   * Trepar a un borde (si arriba hay sitio) o saltar por encima de un obstáculo bajo y estrecho.
   * Devuelve true si empieza la maniobra.
   */
  _tryMantle(air) {
    const b = this.body, w = this.game.world, fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    const hit = w.raycast(b.x, b.y + 0.42, b.z, fx, 0, fz, 0.85, F_MOVE);
    if (!hit || Math.abs(hit.ny) > 0.4) return false;
    const d = hit.t + 0.08 + b.r;
    const px = b.x + fx * d, pz = b.z + fz * d;
    const top = w.groundAt(px, b.y + 2.6, pz);
    const h = top - b.y;
    if (!(h > 0.48 && h < (air ? 2.15 : 1.7))) return false;
    if (!w.fits(b.x, b.y, b.z, b.r * 0.9, Math.min(3, h + BODY.crouchH))) return false;   // sitio para subir
    let to = null, vault = false, crouch = false;
    if (w.fits(px, top + 0.02, pz, b.r, BODY.standH)) to = { x: px, y: top, z: pz };
    else if (w.fits(px, top + 0.02, pz, b.r, BODY.crouchH)) { to = { x: px, y: top, z: pz }; crouch = true; }
    if ((!to || h < 1.15) && h < 1.3 && w.fits(px, top + 0.04, pz, b.r * 0.7, 0.6)) {
      // obstáculo estrecho: buscar dónde caer al otro lado
      for (const extra of [0.55, 0.85, 1.2]) {
        const qx = b.x + fx * (d + extra), qz = b.z + fz * (d + extra), qy = w.groundAt(qx, top + 0.3, qz);
        if (top - qy > 0.35 && qy > b.y - 2.5 && w.fits(qx, qy + 0.02, qz, b.r, BODY.standH)) { to = { x: qx, y: qy, z: qz }; vault = true; crouch = false; break; }
      }
    }
    if (!to) return false;
    this.mantle = { t: 0, dur: vault ? 0.5 : 0.3 + h * 0.14, vault, top, fx: b.x, fy: b.y, fz: b.z, tx: to.x, ty: to.y, tz: to.z, dx: fx, dz: fz };
    if (crouch) { this.crouch = true; this.crouchToggle = true; }
    this.vx = this.vy = this.vz = 0; this.sprinting = false; this.slideT = 0;
    audio.jump(); audio.slide('concrete');
    this.game.onNoise?.(this, 9);
    return true;
  }
  _mantleStep(dt) {
    const m = this.mantle, b = this.body;
    m.t += dt / m.dur;
    const t = Math.min(1, m.t), sm = (a, c, x) => { const k = Math.min(1, Math.max(0, (x - a) / (c - a))); return k * k * (3 - 2 * k); };
    if (m.vault) {
      const hk = sm(0, 1, t), lift = Math.sin(Math.PI * t) * (m.top + 0.25 - Math.max(m.fy, m.ty));
      b.x = m.fx + (m.tx - m.fx) * hk; b.z = m.fz + (m.tz - m.fz) * hk;
      b.y = m.fy + (m.ty - m.fy) * t + Math.max(0, lift);
    } else {
      const up = sm(0, 0.65, t), fw = sm(0.35, 1, t);
      b.y = m.fy + (m.ty - m.fy) * up; b.x = m.fx + (m.tx - m.fx) * fw; b.z = m.fz + (m.tz - m.fz) * fw;
    }
    this.mantleK = Math.sin(Math.PI * t);
    this.bobPhase += dt * 6;
    if (t >= 1) {
      this.mantle = null; this.mantleK = 0; b.onGround = true; b.y = m.ty;
      this.vx = m.dx * (m.vault ? 3.5 : 1.5); this.vz = m.dz * (m.vault ? 3.5 : 1.5); this.vy = 0;
      this.landK = 0.05; audio.land(this.surf, null, 0.5);
    }
  }

  /** Inclinación limitada por las paredes; expone el desplazamiento de la cabeza (leanOX/OZ) para la IA y los impactos. */
  _lean(dt, cos, sin) {
    const b = this.body, k = this.leanK;
    let target = 0;
    if (Math.abs(k) > 0.01) {
      const dir = Math.sign(k), rx = cos * dir, rz = -sin * dir, ey = b.y + (this.crouch ? BODY.eyeCrouch : BODY.eyeStand);
      const hit = this.game.world.raycast(b.x, ey, b.z, rx, 0, rz, MOVE.lean + 0.22, F_MOVE);
      const lim = hit ? Math.max(0, hit.t - 0.22) : MOVE.lean;
      target = dir * Math.min(Math.abs(k) * MOVE.lean, lim);
    }
    this.leanOff += (target - this.leanOff) * Math.min(1, dt * 14);
    this.leanOX = cos * this.leanOff; this.leanOZ = -sin * this.leanOff;
  }

  spawnAt(s) {
    const b = this.body;
    b.x = s.x; b.y = s.y; b.z = s.z; b.h = BODY.standH; b.onGround = false;
    this.vx = this.vy = this.vz = 0;
    this.yaw = s.yaw ?? 0; this.pitch = 0; this.crouch = false; this.crouchK = 0;
    this.health = this.maxHealth; this.alive = true; this.recT = this.recC = this.recYawT = this.recYawC = 0;
    this.deathT = 0; this.stepSmooth = 0; this.spawnProtect = 1.5;
    this.leanK = this.leanOff = this.leanOX = this.leanOZ = 0; this.slideT = 0; this.crouchToggle = this.sprintToggle = false;
    this.mantle = null; this.mantleK = 0;
  }

  addRecoil(v, h) { this.recT += v * DEG; this.recYawT += h * DEG; this.shake = Math.min(1, this.shake + v * 0.05); }

  update(dt, input, canAct) {
    const b = this.body, w = this.game.world, s = store.settings;
    if (!this.alive) { this._deathCam(dt); return; }
    this.spawnProtect = Math.max(0, this.spawnProtect - dt);
    // ---- mirada ----
    this.mdx = 0; this.mdy = 0;
    if (canAct) {
      const zoomK = 1 / (1 + (this.adsZoom - 1) * this.adsK);
      const assist = this._aimAssist(dt, input, s);
      const sens = 0.0022 * s.sensitivity * (1 + (s.adsSensitivity * zoomK - 1) * this.adsK) * assist;
      this.mdx = input.mouse.dx; this.mdy = input.mouse.dy;
      this.yaw -= input.mouse.dx * sens;
      this.pitch -= input.mouse.dy * sens * (s.invertY ? -1 : 1);
      // mirar con las flechas del teclado (laptops sin mouse)
      const kl = 2.3 * (s.keyLook ?? 1) * dt / (1 + (this.adsZoom - 1) * this.adsK);
      const kx = (input.down('lookLeft') ? 1 : 0) - (input.down('lookRight') ? 1 : 0), ky = (input.down('lookUp') ? 1 : 0) - (input.down('lookDown') ? 1 : 0);
      if (kx || ky) { this.yaw += kx * kl; this.pitch += ky * kl * 0.7; this.mdx -= kx * 6; this.mdy -= ky * 4; }
      this.pitch = Math.max(-1.5, Math.min(1.5, this.pitch));
    }
    // ---- trepando o saltando un obstáculo: movimiento guiado ----
    if (this.mantle) { this._mantleStep(dt); this.regen(dt, this.game.time); return; }
    // ---- intención de movimiento ----
    let ix = 0, iz = 0;
    if (canAct) {
      if (input.down('forward')) iz -= 1; if (input.down('back')) iz += 1;
      if (input.down('left')) ix -= 1; if (input.down('right')) ix += 1;
      if (input.move && (input.move.x || input.move.z)) { ix = input.move.x; iz = input.move.z; }   // joystick táctil (analógico)
    }
    const len = Math.hypot(ix, iz);
    if (len > 1) { ix /= len; iz /= len; }
    // correr: mantener o alternar (se corta al dejar de avanzar)
    let sprintIn = canAct && (input.down('sprint') || !!input.move?.sprint);
    if (s.sprintMode === 'toggle') {
      if (canAct && input.hit('sprint')) this.sprintToggle = !this.sprintToggle;
      if (iz >= 0 || !canAct) this.sprintToggle = false;
      sprintIn = this.sprintToggle || (canAct && !!input.move?.sprint);
    }
    // agacharse: mantener o alternar. Agacharse corriendo = deslizarse.
    const crouchHit = canAct && input.hit('crouch');
    const crouchToggle = s.crouchMode === 'toggle' || input.touch;   // en el celular, agacharse es un interruptor
    this.slideCd -= dt;
    if (crouchHit && this.sprinting && b.onGround && this.slideT <= 0 && this.slideCd <= 0) {
      const sp = Math.hypot(this.vx, this.vz) || 1;
      this.slideT = MOVE.slideTime; this.slideCd = 0.9;
      this.slideDx = this.vx / sp; this.slideDz = this.vz / sp; this.slideSpeed = Math.max(MOVE.sprint, sp) * 1.35;
      audio.slide(this.surf);
      this.game.onNoise?.(this, 10);
    } else if (crouchHit && crouchToggle) this.crouchToggle = !this.crouchToggle;
    if (this.slideT > 0 && crouchToggle) this.crouchToggle = false;
    const wantCrouch = this.slideT > 0 || (canAct && (crouchToggle ? this.crouchToggle : input.down('crouch')));
    if (wantCrouch) this.crouch = true;
    else if (this.crouch && w.fits(b.x, b.y, b.z, b.r, BODY.standH)) this.crouch = false;
    this.crouchK += ((this.crouch ? 1 : 0) - this.crouchK) * Math.min(1, dt * 12);
    b.h = this.crouch ? BODY.crouchH : BODY.standH;
    // asomarse (Q/E): desplaza la cabeza sin sacar el cuerpo de la cobertura
    const leanIn = canAct && !this.sprinting && this.slideT <= 0 && b.onGround ? (input.down('leanRight') ? 1 : 0) - (input.down('leanLeft') ? 1 : 0) : 0;
    this.leanK += (leanIn - this.leanK) * Math.min(1, dt * 10);
    this.sprinting = sprintIn && iz < 0 && !this.crouch && b.onGround && this.adsK < 0.2 && Math.abs(ix) < 0.8 && Math.abs(this.leanK) < 0.3;
    const max = (this.crouch ? MOVE.crouch : this.sprinting ? MOVE.sprint : MOVE.walk) * this.moveMult * (iz > 0 ? 0.85 : 1) * (1 - 0.4 * Math.abs(this.leanK));
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    this._lean(dt, cos, sin);
    const wx = ix * cos + iz * sin, wz = -ix * sin + iz * cos;
    if (this.slideT > 0 && b.onGround) {
      // deslizamiento: impulso que se frena, con un poco de control lateral
      this.slideT -= dt;
      const k = Math.max(0, this.slideT / MOVE.slideTime), steer = ix * dt * 0.9;
      const dx = this.slideDx * Math.cos(steer) + this.slideDz * Math.sin(steer), dz = -this.slideDx * Math.sin(steer) + this.slideDz * Math.cos(steer);
      this.slideDx = dx; this.slideDz = dz;
      const sp = this.slideSpeed * (0.3 + 0.7 * k * k);
      this.vx = dx * sp; this.vz = dz * sp;
      if (canAct && input.hit('jump') && w.fits(b.x, b.y + 0.05, b.z, b.r, BODY.standH + 0.3)) { this.slideT = 0; this.vy = MOVE.jump; b.onGround = false; audio.jump(); }
    } else if (b.onGround) {
      // fricción firme: sin deslizamiento al soltar las teclas
      const sp = Math.hypot(this.vx, this.vz);
      if (sp > 0) { const drop = Math.min(sp, MOVE.friction * dt * (len > 0 ? 0.35 : 1)); this.vx -= (this.vx / sp) * drop; this.vz -= (this.vz / sp) * drop; }
      this.vx += wx * MOVE.accel * dt; this.vz += wz * MOVE.accel * dt;
      const sp2 = Math.hypot(this.vx, this.vz);
      if (sp2 > max) { this.vx *= max / sp2; this.vz *= max / sp2; }
      if (canAct && input.hit('jump')) {
        if (iz <= 0 && this._tryMantle(false)) return;
        if (w.fits(b.x, b.y + 0.05, b.z, b.r, b.h + 0.3)) { this.vy = MOVE.jump; b.onGround = false; audio.jump(); }
      }
    } else {
      this.slideT = 0;
      // en el aire con salto pulsado: agarrarse a un borde que quede a mano
      if (canAct && input.down('jump') && iz <= 0 && this.vy < 2.5 && this._tryMantle(true)) return;
      this.vx += wx * MOVE.airAccel * dt; this.vz += wz * MOVE.airAccel * dt;
      const sp2 = Math.hypot(this.vx, this.vz), lim = Math.max(max, MOVE.walk);
      if (sp2 > lim) { this.vx *= lim / sp2; this.vz *= lim / sp2; }
    }
    this.vy -= MOVE.gravity * dt;
    if (this.vy < -40) this.vy = -40;
    const vyBefore = this.vy, px = b.x, pz = b.z;
    w.move(b, this.vx * dt, this.vy * dt, this.vz * dt, _res);
    if (_res.hitX) this.vx = 0;
    if (_res.hitZ) this.vz = 0;
    if ((_res.hitX || _res.hitZ) && this.slideT > 0) this.slideT = 0;
    if (_res.hitCeil && this.vy > 0) this.vy = 0;
    if (b.onGround) {
      if (_res.landed && vyBefore < -3) {
        const k = Math.min(1.6, -vyBefore / 9);
        this.landK = k * 0.11; this.landedImpact = k * 5; audio.land(this.surf, null, k * 0.7);
        if (vyBefore < -15) this.game.damage(this, null, Math.round((-vyBefore - 15) * 6), null, 'fall');
      }
      this.vy = Math.min(0, this.vy); if (this.vy < -2) this.vy = -2;
    }
    // suavizado de escalones en la cámara
    if (_res.stepped) this.stepSmooth += _res.stepped;
    this.stepSmooth *= Math.max(0, 1 - dt * 14);
    // ---- pasos y balanceo ----
    const moved = Math.hypot(b.x - px, b.z - pz);
    if (b.onGround && moved > 0.0005) {
      const stride = this.sprinting ? 2.5 : this.crouch ? 1.5 : 2.0;
      this.bobPhase += (moved / stride) * Math.PI * 2 * 0.5;
      this.stepDist += moved;
      if (this.stepDist >= stride * 0.5) {
        this.stepDist = 0; this._surface();
        audio.footstep(this.surf, null, this.sprinting, this.crouch ? 0.45 : 1);
        this.game.onNoise?.(this, this.sprinting ? 14 : this.crouch ? 3 : 8);
      }
    }
    // ---- retroceso de cámara ----
    this.recC += (this.recT - this.recC) * Math.min(1, dt * 28); this.recYawC += (this.recYawT - this.recYawC) * Math.min(1, dt * 28);
    const rec = this.game.weapons ? this.game.weapons.def.recoilRecover : 7;
    this.recT *= Math.max(0, 1 - rec * dt); this.recYawT *= Math.max(0, 1 - rec * dt);
    this.landK *= Math.max(0, 1 - dt * 8); this.shake *= Math.max(0, 1 - dt * 9);
    const lateral = (this.vx * cos - this.vz * sin) / MOVE.walk;
    this.roll += (-lateral * 0.022 - this.roll) * Math.min(1, dt * 9);
    // luz local para el arma (interiores)
    this._lt -= dt;
    if (this._lt <= 0) {
      this._lt = 0.25;
      const cover = w.raycast(b.x, b.y + 1.7, b.z, 0, 1, 0, 14, F_MOVE);
      this._lightT = cover ? (this.game.mapDef.env.indoor ? 1 : 0.4) : 1;
    }
    this.viewLight += ((this._lightT ?? 1) - this.viewLight) * Math.min(1, dt * 4);
    this.regen(dt, this.game.time);
  }

  _surface() {
    const b = this.body, a = this.game.world.query(b.x - 0.1, b.z - 0.1, b.x + 0.1, b.z + 0.1);
    let best = null;
    for (const bx of a) if ((bx.flags & F_MOVE) && Math.abs(bx.maxy - b.y) < 0.06 && (!best || bx.maxy > best.maxy)) best = bx;
    this.surf = best ? best.surf : (this.game.mapDef.floorSurf || 'dirt');
  }

  _deathCam(dt) {
    this.deathT += dt;
    const b = this.body;
    this.vy -= MOVE.gravity * dt;
    this.game.world.move(b, 0, this.vy * dt, 0, _res);
    if (b.onGround) this.vy = 0;
  }

  /** Coloca la cámara del mundo. */
  applyCamera(cam, time) {
    const b = this.body, s = store.settings;
    const eye = BODY.eyeStand + (BODY.eyeCrouch - BODY.eyeStand) * this.crouchK;
    const bobA = Math.min(1, this.speed / MOVE.walk) * (b.onGround ? 1 : 0) * s.headBob * (1 - this.adsK * 0.7);
    const bobY = -Math.abs(Math.sin(this.bobPhase)) * 0.035 * bobA, bobX = Math.cos(this.bobPhase) * 0.018 * bobA;
    let y = b.y + eye + bobY - this.landK - this.stepSmooth;
    let pitch = this.pitch + this.recC, yaw = this.yaw + this.recYawC, roll = this.roll + Math.cos(this.bobPhase) * 0.004 * bobA;
    roll -= (this.leanOff / MOVE.lean) * 0.13;                         // inclinación al asomarse
    if (this.mantleK) { pitch -= this.mantleK * 0.1; roll += this.mantleK * (this.mantle?.vault ? 0.07 : 0.03); }
    if (this.slideT > 0) roll += Math.sin((this.slideT / MOVE.slideTime) * Math.PI) * 0.05;
    if (!this.alive) {
      const k = Math.min(1, this.deathT / 0.7), e = k * k * (3 - 2 * k);
      y = b.y + eye * (1 - e) + 0.28 * e; roll += e * 0.9; pitch = pitch * (1 - e) - 0.25 * e;
    }
    if (this.shake > 0.001) { yaw += (Math.random() - 0.5) * 0.004 * this.shake; pitch += (Math.random() - 0.5) * 0.004 * this.shake; }
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    cam.position.set(b.x + cos * bobX + (this.alive ? this.leanOX : 0), y - Math.abs(this.leanOff) * 0.08, b.z - sin * bobX + (this.alive ? this.leanOZ : 0));
    cam.rotation.set(pitch, yaw, roll);
    const base = s.fov, zoom = 1 + (this.adsZoom - 1) * this.adsK * this.adsK * (3 - 2 * this.adsK);
    const sprintFov = this.sprinting ? 4 : 0;
    this._fov = (this._fov ?? base) + ((base + sprintFov) - (this._fov ?? base)) * 0.12;
    const fov = 2 * Math.atan(Math.tan((this._fov * DEG) / 2) / zoom) / DEG;
    if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = fov; cam.updateProjectionMatrix(); }
    cam.updateMatrixWorld();
    void time;
  }
}

export const _tmpV = new THREE.Vector3();
