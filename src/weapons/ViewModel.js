// Arma en primera persona: brazos, balanceo, retroceso visual y animaciones procedurales
// (equipar, enfundar, disparo, recarga por tipo, cerrojo, bomba). Es una función pura del
// estado del WeaponSystem, así que animación y lógica nunca se desincronizan.
import * as THREE from 'three';
import { buildWeaponModel } from './WeaponModels.js';
import { flashSprite } from '../gfx/Textures.js';
import { SKINS, store } from '../core/Settings.js';

const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3();

function buildArm(skin, left) {
  const g = new THREE.Group();
  const cloth = new THREE.MeshStandardMaterial({ color: skin.cloth, roughness: 0.92 });
  const glove = new THREE.MeshStandardMaterial({ color: skin.glove, roughness: 0.7 });
  const fore = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.036, 0.44, 10), cloth);
  fore.rotation.x = Math.PI / 2; fore.position.z = 0.27; g.add(fore);
  const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.038, 0.05, 10), glove); cuff.rotation.x = Math.PI / 2; cuff.position.z = 0.065; g.add(cuff);
  const palm = new THREE.Mesh(new THREE.BoxGeometry(0.078, 0.042, 0.095), glove); palm.position.set(0, 0, 0.0); g.add(palm);
  const fingers = new THREE.Mesh(new THREE.BoxGeometry(0.074, 0.05, 0.045), glove); fingers.position.set(0, -0.03, -0.045); fingers.rotation.x = 0.5; g.add(fingers);
  const thumb = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.03, 0.06), glove); thumb.position.set(left ? 0.045 : -0.045, 0.0, -0.02); thumb.rotation.y = left ? -0.5 : 0.5; g.add(thumb);
  const knuckle = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.012, 0.03), new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.5 })); knuckle.position.set(0, 0.026, -0.03); g.add(knuckle);
  return g;
}

export class ViewModel {
  constructor(engine) {
    this.engine = engine;
    this.rig = new THREE.Group(); engine.vmScene.add(this.rig);
    this.pivot = new THREE.Group(); this.rig.add(this.pivot);
    this.models = new Map();
    this.gun = null; this.def = null;
    const skin = SKINS[store.loadout.skin] || SKINS.woodland;
    this.armR = buildArm(skin, false); this.armL = buildArm(skin, true);
    this.rig.add(this.armR, this.armL);
    this.flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashSprite(), blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, transparent: true }));
    this.flash.visible = false; this.flash.renderOrder = 20;
    this.flashT = 0;
    // muelles de retroceso y balanceo
    this.kz = 0; this.kzv = 0; this.kr = 0; this.krv = 0; this.kroll = 0; this.krollv = 0; this.ky = 0; this.kyv = 0;
    this.swayX = 0; this.swayY = 0; this.slideT = 0; this.landDip = 0; this.sprintK = 0; this.adsK = 0; this.moveK = 0;
    this.leftW = new THREE.Vector3(); this.rightW = new THREE.Vector3();
    this.visible = true;
  }

  setWeapon(def) {
    if (this.gun) this.pivot.remove(this.gun);
    if (!this.models.has(def.id)) this.models.set(def.id, buildWeaponModel(def.model, store.loadout.finish));
    this.gun = this.models.get(def.id); this.def = def;
    this.pivot.add(this.gun);
    this.gun.add(this.flash); this.flash.position.copy(this.gun.userData.muzzle);
    const pistol = def.category === 'pistol';
    this.hip = pistol ? new THREE.Vector3(0.11, -0.13, -0.42) : new THREE.Vector3(0.15, -0.165, -0.4);
    const u = this.gun.userData;
    this.ads = new THREE.Vector3(-u.sight.x, -u.sight.y, -u.adsDist - u.sight.z * 0 - (pistol ? 0.1 : 0.12));
    this._resetParts();
  }
  _resetParts() {
    const p = this.gun.userData.parts;
    for (const k in p) if (k !== 'main') { p[k].position.copy(p[k].userData.base); p[k].rotation.set(0, 0, 0); p[k].visible = true; }
    if (this.def.reloadType === 'clip' && p.mag) p.mag.visible = false;
  }

  /** Impulso de retroceso + fogonazo. */
  fire(def) {
    const k = def.kick, a = 1 - this.adsK * 0.45;
    this.kzv += 1.5 * k * a; this.krv += 2.6 * k * a; this.krollv += (Math.random() - 0.5) * 1.6 * k; this.kyv += 0.5 * k * a;
    this.slideT = 1;
    this.flash.visible = true; this.flashT = 0.045;
    const s = (def.energy ? 0.16 : 0.2) * (0.8 + Math.random() * 0.5) * Math.min(1.7, 0.7 + def.kick * 0.4);
    this.flash.scale.set(s, s, 1); this.flash.material.rotation = Math.random() * 6.28;
    this.flash.material.color.set(def.energy ? def.tracer : 0xffd9a0).multiplyScalar(2.4);
  }

  /** Posición mundial de la boca del cañón (para trazadoras) proyectada desde la cámara del mundo. */
  muzzleWorld(out, camera) {
    this.gun.localToWorld(out.copy(this.gun.userData.muzzle));   // espacio de la escena del arma == espacio de cámara
    // compensar la diferencia de FOV entre arma y mundo
    const f = Math.tan(THREE.MathUtils.degToRad(this.engine.vmCamera.fov / 2)) / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    out.x /= f; out.y /= f;
    return out.applyMatrix4(camera.matrixWorld);
  }
  ejectWorld(out, camera) { this.gun.localToWorld(out.copy(this.gun.userData.eject)); return out.applyMatrix4(camera.matrixWorld); }

  /**
   * ctx: {dt, anim:{kind,u,empty,reloadType}, ads, sprint, speed, onGround, vy, bobPhase, mdx, mdy, landed, bobScale}
   */
  update(ctx) {
    const dt = ctx.dt, def = this.def, gun = this.gun, u = gun.userData, parts = u.parts, an = ctx.anim;
    // --- muelles ---
    const spring = (x, v, k, c) => { v += (-k * x - c * v) * dt; return [x + v * dt, v]; };
    [this.kz, this.kzv] = spring(this.kz, this.kzv, 320, 24); [this.kr, this.krv] = spring(this.kr, this.krv, 260, 22);
    [this.kroll, this.krollv] = spring(this.kroll, this.krollv, 240, 18); [this.ky, this.kyv] = spring(this.ky, this.kyv, 300, 22);
    this.adsK = ctx.ads;
    this.sprintK += ((ctx.sprint ? 1 : 0) - this.sprintK) * Math.min(1, dt * 9);
    this.moveK += (Math.min(1, ctx.speed / 4.5) * (ctx.onGround ? 1 : 0.2) - this.moveK) * Math.min(1, dt * 8);
    // inercia con el ratón
    const sm = Math.min(1, dt * 10);
    this.swayX += (THREE.MathUtils.clamp(-ctx.mdx * 0.0016, -0.06, 0.06) - this.swayX) * sm;
    this.swayY += (THREE.MathUtils.clamp(ctx.mdy * 0.0016, -0.05, 0.05) - this.swayY) * sm;
    if (ctx.landed) this.landDip = Math.min(0.06, ctx.landed * 0.012);
    this.landDip *= Math.max(0, 1 - dt * 7);

    const a = this.adsK, hipK = 1 - a, bob = ctx.bobScale;
    let px = lerp(this.hip.x, this.ads.x, a), py = lerp(this.hip.y, this.ads.y, a), pz = lerp(this.hip.z, this.ads.z, a);
    let rx = 0, ry = 0, rz = 0;
    // balanceo al andar + respiración
    const ph = ctx.bobPhase, amp = this.moveK * (0.25 + 0.75 * hipK) * bob;
    px += Math.cos(ph) * 0.009 * amp; py += -Math.abs(Math.sin(ph)) * 0.012 * amp + Math.sin(ctx.time * 1.6) * 0.0016 * hipK;
    rz += Math.cos(ph) * 0.02 * amp; rx += Math.sin(ph * 2) * 0.008 * amp;
    // inercia
    ry += this.swayX * (0.4 + 0.6 * hipK); rx += this.swayY * (0.4 + 0.6 * hipK); rz += this.swayX * 0.8; px += this.swayX * 0.12; py += -this.swayY * 0.1;
    // salto / aterrizaje
    py += THREE.MathUtils.clamp(-ctx.vy * 0.004, -0.03, 0.03) * hipK - this.landDip; rx += -this.landDip * 1.2;
    // carrera: el arma baja y gira
    const sp = this.sprintK * hipK;
    px += -0.05 * sp; py += -0.05 * sp + Math.sin(ph * 2) * 0.01 * sp; ry += 0.55 * sp; rx += -0.22 * sp; rz += 0.2 * sp;
    // retroceso
    pz += this.kz * 0.05; rx += this.kr * 0.05; rz += this.kroll * 0.04; py += this.ky * 0.012;

    // --- animaciones de estado ---
    let leftT = null, rightT = null, slide = 0;
    if (this.slideT > 0) { this.slideT = Math.max(0, this.slideT - dt / 0.075); slide = Math.sin(this.slideT * Math.PI); }
    const mag = parts.mag, bolt = parts.bolt, pump = parts.pump, cover = parts.cover, sl = parts.slide;
    if (mag) { mag.position.copy(mag.userData.base); mag.visible = def.reloadType !== 'clip'; }
    if (bolt) { bolt.position.copy(bolt.userData.base); bolt.rotation.z = 0; }
    if (pump) pump.position.copy(pump.userData.base);
    if (cover) cover.position.copy(cover.userData.base);
    let slideZ = slide * (def.category === 'pistol' ? 0.03 : 0.028);
    const k = an.kind, t = an.u;

    if (k === 'equip') { const e = 1 - sstep(0, 1, t); py -= 0.26 * e; rx += 0.9 * e; rz += 0.25 * e; }
    else if (k === 'holster') { const e = sstep(0, 1, t); py -= 0.26 * e; rx += 0.8 * e; rz -= 0.2 * e; }
    else if (k === 'reload') {
      const tilt = sstep(0, 0.12, t) * (1 - sstep(0.86, 1, t));
      const rt = an.reloadType;
      if (rt === 'clip') {
        rx += 0.16 * tilt; rz += -0.2 * tilt; py += 0.015 * tilt;
        slideZ = 0.07 * (1 - sstep(0.66, 0.7, t));
        if (mag && t > 0.2 && t < 0.66) { mag.visible = true; const d = 1 - sstep(0.2, 0.6, t); mag.position.y += 0.16 * d; leftT = _v2.copy(u.magPos).setY(u.magPos.y - 0.08 + 0.16 * d); }
        if (t > 0.1 && t <= 0.2) leftT = _v2.copy(u.left).lerp(u.magPos, sstep(0.1, 0.2, t));
      } else if (rt === 'belt') {
        rx += 0.1 * tilt; rz += 0.3 * tilt; py -= 0.03 * tilt;
        const open = sstep(0.06, 0.16, t) * (1 - sstep(0.76, 0.86, t));
        if (cover) { cover.position.y += 0.05 * open; cover.position.z += 0.03 * open; }
        if (mag) { const out = sstep(0.2, 0.36, t), inn = sstep(0.46, 0.64, t); mag.position.y -= 0.3 * (out - inn); mag.position.x -= 0.1 * (out - inn); mag.visible = !(t > 0.36 && t < 0.46); }
        if (t > 0.14 && t < 0.72) leftT = _v2.copy(u.magPos).add(_v.subVectors(mag.position, mag.userData.base));
        if (an.empty) slideZ = 0.05 * Math.sin(Math.PI * sstep(0.88, 0.97, t));
      } else {
        const cell = rt === 'cell';
        rx += 0.2 * tilt; rz += 0.42 * tilt; py -= 0.02 * tilt; px -= 0.02 * tilt;
        if (mag) {
          const out = sstep(0.14, 0.32, t), inn = sstep(0.42, 0.64, t), d = out - inn;
          if (cell) { mag.position.z += 0.05 * Math.min(1, d * 3); mag.position.y -= 0.28 * Math.max(0, d - 0.15); }
          else { mag.position.y -= 0.3 * d; mag.position.z += 0.04 * d; }
          mag.visible = !(t > 0.33 && t < 0.42);
          const w = sstep(0.06, 0.14, t) * (1 - sstep(0.68, 0.78, t));
          if (w > 0) leftT = _v2.copy(u.left).lerp(_v.subVectors(mag.position, mag.userData.base).add(u.magPos), w);
        }
        if (an.empty) slideZ = 0.05 * Math.sin(Math.PI * sstep(0.8, 0.92, t));
      }
    } else if (k === 'shellStart' || k === 'shell' || k === 'shellEnd') {
      const tilt = k === 'shellStart' ? sstep(0, 1, t) : k === 'shellEnd' ? 1 - sstep(0.2, 1, t) : 1;
      const top = def.mode === 'bolt';
      rx += (top ? 0.12 : 0.28) * tilt; rz += (top ? -0.25 : 0.38) * tilt; py += (top ? 0.01 : -0.01) * tilt;
      if (top && bolt) { bolt.rotation.z = 0.9 * tilt; bolt.position.z += 0.075 * tilt; }
      if (k === 'shell') {
        const inn = Math.sin(Math.PI * t);
        leftT = _v2.copy(u.magPos); leftT.y += (top ? 0.12 : -0.14) * (1 - inn); leftT.z += 0.06 * (1 - inn);
      } else if (k === 'shellStart') leftT = _v2.copy(u.left).lerp(_v.copy(u.magPos).setY(u.magPos.y + (top ? 0.12 : -0.14)), sstep(0.3, 1, t));
    } else if (k === 'cycle') {
      if (def.mode === 'bolt' && bolt) {
        const up = sstep(0.05, 0.22, t) * (1 - sstep(0.78, 0.95, t)), back = sstep(0.2, 0.42, t) * (1 - sstep(0.5, 0.76, t));
        bolt.rotation.z = 0.9 * up; bolt.position.z += 0.075 * back;
        rz += -0.16 * up; rx += 0.05 * up; py -= 0.008 * up;
        if (u.boltHand) { const w = sstep(0, 0.1, t) * (1 - sstep(0.9, 1, t)); rightT = _v2.copy(u.boltHand); rightT.z += 0.075 * back; rightT.y += 0.035 * up; rightT.x -= 0.02 * up; this._rw = w; }
      } else if (pump) {
        const back = sstep(0.05, 0.38, t) * (1 - sstep(0.45, 0.85, t));
        pump.position.z += 0.085 * back; pz += 0.012 * back; rx += 0.03 * back;
      } else slideZ = 0.05 * Math.sin(Math.PI * t);
    }
    if (sl) { sl.position.copy(sl.userData.base); sl.position.z += slideZ; }

    this.pivot.position.set(px, py, pz); this.pivot.rotation.set(rx, ry, rz);
    // --- brazos ---
    this.pivot.updateMatrixWorld(true);
    const grip = _v.set(0.004, -0.05, 0.035);
    if (rightT) grip.lerp(rightT, this._rw ?? 1);
    gun.localToWorld(grip); this.rig.worldToLocal(grip);
    this.armR.position.copy(grip); this.armR.lookAt(_v.set(0.3, -0.42, 0.28)); this.armR.rotateZ(-0.5);
    let lp = _v.copy(u.left);
    if (u.leftOnPump && pump) lp.add(pump.position).sub(pump.userData.base);
    if (leftT) lp = leftT;
    lp = _v.copy(lp); gun.localToWorld(lp); this.rig.worldToLocal(lp);
    this.armL.position.copy(lp); this.armL.lookAt(_v2.set(-0.22, -0.46, 0.2)); this.armL.rotateZ(1.0);

    if (this.flashT > 0) { this.flashT -= dt; if (this.flashT <= 0) this.flash.visible = false; }
    // con mira telescópica totalmente apuntada se oculta el modelo (se dibuja la retícula en el HUD)
    this.rig.visible = this.visible && !(def.scope && a > 0.92);
  }

  dispose() {
    this.engine.vmScene.remove(this.rig);
    this.rig.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
  }
}
