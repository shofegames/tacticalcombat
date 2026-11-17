// Controlador FPS: caminar, correr, saltar, agacharse, desplazamiento lateral, cámara con balanceo,
// retroceso y transiciones suaves. Movimiento resuelto contra el mundo de colisiones (sin atravesar
// paredes ni deslizamiento artificial: aceleración y fricción altas).
import * as THREE from 'three';
import { Combatant } from '../entities/Combatant.js';
import { BODY, F_MOVE } from '../../shared/collision.js';
import { store } from '../core/Settings.js';
import { audio } from '../core/Audio.js';

export const MOVE = { walk: 4.7, sprint: 7.0, crouch: 2.4, accel: 62, friction: 52, airAccel: 14, gravity: 17, jump: 5.9 };
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
  }

  spawnAt(s) {
    const b = this.body;
    b.x = s.x; b.y = s.y; b.z = s.z; b.h = BODY.standH; b.onGround = false;
    this.vx = this.vy = this.vz = 0;
    this.yaw = s.yaw ?? 0; this.pitch = 0; this.crouch = false; this.crouchK = 0;
    this.health = this.maxHealth; this.alive = true; this.recT = this.recC = this.recYawT = this.recYawC = 0;
    this.deathT = 0; this.stepSmooth = 0; this.spawnProtect = 1.5;
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
      const sens = 0.0022 * s.sensitivity * (1 + (s.adsSensitivity * zoomK - 1) * this.adsK);
      this.mdx = input.mouse.dx; this.mdy = input.mouse.dy;
      this.yaw -= input.mouse.dx * sens;
      this.pitch -= input.mouse.dy * sens * (s.invertY ? -1 : 1);
      this.pitch = Math.max(-1.5, Math.min(1.5, this.pitch));
    }
    // ---- intención de movimiento ----
    let ix = 0, iz = 0;
    if (canAct) {
      if (input.down('forward')) iz -= 1; if (input.down('back')) iz += 1;
      if (input.down('left')) ix -= 1; if (input.down('right')) ix += 1;
    }
    const len = Math.hypot(ix, iz);
    if (len > 0) { ix /= len; iz /= len; }
    // agacharse (mantener). Para levantarse hace falta espacio libre.
    const wantCrouch = canAct && input.down('crouch');
    if (wantCrouch) this.crouch = true;
    else if (this.crouch && w.fits(b.x, b.y, b.z, b.r, BODY.standH)) this.crouch = false;
    this.crouchK += ((this.crouch ? 1 : 0) - this.crouchK) * Math.min(1, dt * 12);
    b.h = this.crouch ? BODY.crouchH : BODY.standH;
    this.sprinting = canAct && input.down('sprint') && iz < 0 && !this.crouch && b.onGround && this.adsK < 0.2 && Math.abs(ix) < 0.8;
    const max = (this.crouch ? MOVE.crouch : this.sprinting ? MOVE.sprint : MOVE.walk) * this.moveMult * (iz > 0 ? 0.85 : 1);
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    const wx = ix * cos + iz * sin, wz = -ix * sin + iz * cos;
    if (b.onGround) {
      // fricción firme: sin deslizamiento al soltar las teclas
      const sp = Math.hypot(this.vx, this.vz);
      if (sp > 0) { const drop = Math.min(sp, MOVE.friction * dt * (len > 0 ? 0.35 : 1)); this.vx -= (this.vx / sp) * drop; this.vz -= (this.vz / sp) * drop; }
      this.vx += wx * MOVE.accel * dt; this.vz += wz * MOVE.accel * dt;
      const sp2 = Math.hypot(this.vx, this.vz);
      if (sp2 > max) { this.vx *= max / sp2; this.vz *= max / sp2; }
      if (canAct && input.hit('jump') && w.fits(b.x, b.y + 0.05, b.z, b.r, b.h + 0.3)) {
        this.vy = MOVE.jump; b.onGround = false; audio.jump();
      }
    } else {
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
    if (!this.alive) {
      const k = Math.min(1, this.deathT / 0.7), e = k * k * (3 - 2 * k);
      y = b.y + eye * (1 - e) + 0.28 * e; roll += e * 0.9; pitch = pitch * (1 - e) - 0.25 * e;
    }
    if (this.shake > 0.001) { yaw += (Math.random() - 0.5) * 0.004 * this.shake; pitch += (Math.random() - 0.5) * 0.004 * this.shake; }
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    cam.position.set(b.x + cos * bobX, y, b.z - sin * bobX);
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
