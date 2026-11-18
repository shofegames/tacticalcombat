// Soldado en tercera persona: esqueleto articulado con animación procedural
// (andar, correr, agacharse, apuntar en vertical, estremecerse al recibir impactos y caer al morir).
import * as THREE from 'three';
import { PropBatch } from '../world/Props.js';
import { buildWeaponModel } from '../weapons/WeaponModels.js';
import { SKINS } from '../core/Settings.js';

export const TEAM_COLORS = { a: 0x2f7fd8, b: 0xd8452f, ffa: 0xd8a02f };

function seg(fn) {
  const b = new PropBatch(); b.base.identity(); fn(b);
  // rendimiento: un único material (con colores por vértice) por segmento del cuerpo = una sola llamada de dibujo
  const all = []; for (const list of b.byMat.values()) all.push(...list);
  b.byMat.clear(); b.byMat.set('fabric', all);
  const meshes = b.build(256);
  const g = new THREE.Group();
  for (const m of meshes) g.add(m);
  return g;
}
const SKIN_TONES = [0xc99a7a, 0x8d5a3c, 0xe0b596, 0x6b4630, 0xb98262];

export class Soldier {
  /** look: {skin, team, helmet} */
  constructor(look = {}) {
    const sk = SKINS[look.skin] || SKINS.woodland, tc = TEAM_COLORS[look.team] ?? TEAM_COLORS.ffa;
    const tone = SKIN_TONES[(look.seed ?? 0) % SKIN_TONES.length], helmet = look.helmet || 'standard';
    const C = sk.cloth, V = sk.vest, H = sk.helmet, G = sk.glove, BOOT = 0x1c1a17;
    this.root = new THREE.Group();
    this.hips = new THREE.Group(); this.root.add(this.hips);
    this.spine = new THREE.Group(); this.hips.add(this.spine);
    // Torso: camisa + chaleco portaplacas + portacargadores + distintivo de equipo
    this.spine.add(seg((b) => {
      b.box(0.4, 0.56, 0.22, 0, 0.3, 0, 'fabric', C);
      b.box(0.44, 0.4, 0.27, 0, 0.32, -0.005, 'fabric', V);
      for (const x of [-0.13, 0, 0.13]) b.box(0.1, 0.15, 0.06, x, 0.2, -0.16, 'fabric', V);
      b.box(0.32, 0.26, 0.1, 0, 0.36, 0.17, 'fabric', V);                      // mochila
      b.box(0.36, 0.12, 0.24, 0, 0.02, 0, 'fabric', C);                        // cinturón
      b.box(0.46, 0.06, 0.25, 0, 0.0, 0, 'flat', 0x2a2a26);
      b.box(0.09, 0.07, 0.01, -0.13, 0.46, -0.142, 'flat', tc);                // parche de equipo
      b.box(0.14, 0.05, 0.01, 0, 0.5, 0.222, 'flat', tc);
    }));
    // Cabeza
    this.head = new THREE.Group(); this.head.position.set(0, 0.62, 0); this.spine.add(this.head);
    this.head.add(seg((b) => {
      b.cyl(0.05, 0.055, 0.1, 0, -0.02, 0, 'flat', tone, 0, 0, 0, 8);
      b.sph(0.105, 0, 0.1, 0, 'flat', tone, 0.92, 1.08, 1, 1);
      b.box(0.16, 0.035, 0.03, 0, 0.115, -0.09, 'darkglass', 0x111111);        // gafas balísticas
      if (helmet === 'standard') { b.sph(0.128, 0, 0.135, 0.008, 'fabric', H, 1, 0.82, 1.08, 1); b.box(0.2, 0.03, 0.12, 0, 0.1, 0.05, 'fabric', H); b.box(0.05, 0.035, 0.04, 0, 0.2, -0.11, 'flat', 0x1a1a1a); }
      else if (helmet === 'cap') { b.sph(0.112, 0, 0.14, 0.0, 'fabric', H, 1, 0.6, 1.02, 1); b.box(0.15, 0.012, 0.1, 0, 0.15, -0.14, 'fabric', H, 0.15, 0, 0); }
      else if (helmet === 'beret') { b.sph(0.118, 0.015, 0.165, 0.0, 'fabric', H, 1.08, 0.38, 1.05, 1); }
      else b.sph(0.108, 0, 0.13, 0.01, 'flat', 0x2a211a, 0.95, 0.85, 1, 1);
      b.box(0.05, 0.1, 0.03, 0.1, 0.09, 0, 'flat', 0x1a1a1a);                  // auricular
    }));
    // Brazos
    const arm = (side) => {
      const sh = new THREE.Group(); sh.position.set(side * 0.24, 0.5, 0);
      sh.add(seg((b) => { b.cyl(0.052, 0.058, 0.3, 0, -0.14, 0, 'fabric', C, 0, 0, 0, 8); b.box(0.09, 0.07, 0.012, side * 0.05, -0.08, 0, 'flat', tc, 0, 0, 0); b.sph(0.07, 0, 0, 0, 'fabric', C, 1, 1, 1, 0); }));
      const el = new THREE.Group(); el.position.set(0, -0.29, 0); sh.add(el);
      el.add(seg((b) => { b.cyl(0.04, 0.05, 0.27, 0, -0.13, 0, 'fabric', C, 0, 0, 0, 8); b.box(0.07, 0.09, 0.05, 0, -0.3, 0, 'flat', G); }));
      this.spine.add(sh);
      return { sh, el };
    };
    this.armL = arm(-1); this.armR = arm(1);
    // Piernas
    const leg = (side) => {
      const hip = new THREE.Group(); hip.position.set(side * 0.11, 0, 0);
      hip.add(seg((b) => { b.cyl(0.075, 0.09, 0.44, 0, -0.22, 0, 'fabric', C, 0, 0, 0, 8); b.box(0.1, 0.16, 0.07, side * 0.07, -0.18, 0, 'fabric', V); }));
      const knee = new THREE.Group(); knee.position.set(0, -0.44, 0); hip.add(knee);
      knee.add(seg((b) => {
        b.cyl(0.055, 0.07, 0.42, 0, -0.21, 0, 'fabric', C, 0, 0, 0, 8);
        b.box(0.1, 0.1, 0.03, 0, -0.02, -0.06, 'flat', 0x2a2a26);              // rodillera
        b.box(0.11, 0.13, 0.26, 0, -0.45, -0.04, 'flat', BOOT); b.box(0.1, 0.2, 0.12, 0, -0.36, 0.02, 'flat', BOOT);
      }));
      this.hips.add(hip);
      return { hip, knee };
    };
    this.legL = leg(-1); this.legR = leg(1);
    this.gunMount = new THREE.Group(); this.gunMount.position.set(0.13, 0.36, -0.28); this.spine.add(this.gunMount);
    this.gun = null;
    this.root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; } });
    this.phase = Math.random() * 6; this.crouchK = 0; this.deathK = 0; this.dead = false; this.flinch = 0; this.aimK = 1; this.fall = 1;
    this.fadeMats = null;
  }

  setWeapon(id) {
    if (this.weaponId === id) return;
    if (this.gun) { this.gunMount.remove(this.gun); this.gun.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); }
    this.gun = buildWeaponModel(id, 'standard', { lod: true }); this.weaponId = id;   // versión ligera: una sola malla
    this.gun.traverse((o) => { if (o.isMesh) o.castShadow = this._shadow ?? true; });
    this.gunMount.add(this.gun);
  }
  muzzleWorld(out) {
    if (!this.gun) return out.copy(this.root.position).setY(this.root.position.y + 1.4);
    this.root.updateMatrixWorld(true);
    return this.gun.localToWorld(out.copy(this.gun.userData.muzzle));
  }
  /** Proyectar sombra solo cuando está cerca de la cámara (las sombras de soldados son lo más caro de dibujar). */
  setShadow(on) {
    if (this._shadow === on) return;
    this._shadow = on;
    this.root.traverse((o) => { if (o.isMesh) o.castShadow = on; });
  }
  hit() { this.flinch = 1; }
  die(dx = 0, dz = 1) {
    this.dead = true; this.deathK = 0;
    // caer en la dirección del impacto (relativa a la orientación del cuerpo)
    const yaw = this.root.rotation.y, fwd = -(dx * Math.sin(yaw) + dz * Math.cos(yaw));
    this.fall = fwd > 0 ? -1 : 1;
  }
  revive() { this.dead = false; this.deathK = 0; this.root.visible = true; this.root.rotation.set(0, this.root.rotation.y, 0); this.hips.rotation.set(0, 0, 0); this.spine.rotation.set(0, 0, 0); }

  /** s: {x,y,z,yaw,pitch,speed,crouch,fwd(-1..1 avance relativo), firing} */
  update(dt, s) {
    const r = this.root;
    r.position.set(s.x, s.y, s.z);
    if (this.dead) {
      this.deathK = Math.min(1, this.deathK + dt / 0.55);
      const e = 1 - Math.pow(1 - this.deathK, 3);
      this.hips.rotation.x = this.fall * e * 1.5;
      this.hips.position.y = 0.9 - e * 0.72 + Math.sin(Math.min(1, this.deathK * 1.3) * Math.PI) * 0.06;
      this.spine.rotation.x = -this.fall * e * 0.25; this.spine.rotation.z = e * 0.3;
      this.legL.hip.rotation.x = e * 0.5 * this.fall; this.legR.hip.rotation.x = -e * 0.2; this.legL.knee.rotation.x = e * 0.7; this.legR.knee.rotation.x = e * 0.3;
      this.armL.sh.rotation.set(-0.5 + e * 1.4, 0, -e * 0.9); this.armR.sh.rotation.set(-0.5 + e * 1.0, 0, e * 0.8);
      this.armL.el.rotation.x = -0.4; this.armR.el.rotation.x = -0.5;
      this.gunMount.position.y = 0.36 - e * 0.25; this.gunMount.rotation.z = e * 1.2;
      return;
    }
    r.rotation.y = s.yaw;
    this.crouchK += ((s.crouch ? 1 : 0) - this.crouchK) * Math.min(1, dt * 10);
    this.flinch = Math.max(0, this.flinch - dt * 5);
    const c = this.crouchK, sp = Math.min(1.5, s.speed / 4.7), run = Math.max(0, Math.min(1, (s.speed - 4.9) / 2));
    this.phase += dt * (3.2 + s.speed * 1.45) * (s.speed > 0.15 ? 1 : 0) * (s.fwd < -0.3 ? -1 : 1);
    const ph = this.phase, sw = Math.sin(ph), cw = Math.cos(ph), A = (0.55 + run * 0.25) * Math.min(1, sp * 1.4);
    // cadera: altura + balanceo vertical
    this.hips.position.y = 0.9 - c * 0.36 - Math.abs(cw) * 0.035 * Math.min(1, sp) + (sp < 0.05 ? Math.sin(ph * 0 + performance.now() * 0.0018 + this.fall) * 0.004 : 0);
    this.hips.rotation.set(run * 0.16 + c * 0.1, 0, 0);
    // piernas
    const cr = c * 1.05;
    this.legL.hip.rotation.x = -sw * A - cr; this.legR.hip.rotation.x = sw * A - cr;
    this.legL.knee.rotation.x = Math.max(0, cw) * A * 1.3 + cr * 1.75 + 0.05; this.legR.knee.rotation.x = Math.max(0, -cw) * A * 1.3 + cr * 1.75 + 0.05;
    this.legL.hip.rotation.z = -0.03 - c * 0.12; this.legR.hip.rotation.z = 0.03 + c * 0.12;
    // tronco: apunta en vertical y se inclina ligeramente al correr
    this.aimK += ((run > 0.5 && !s.firing ? 0.35 : 1) - this.aimK) * Math.min(1, dt * 8);
    const pitch = s.pitch * 0.85 * this.aimK;
    this.spine.rotation.set(pitch - run * 0.1 - c * 0.06 - this.flinch * 0.22, sw * 0.05 * sp, this.flinch * 0.12);
    this.head.rotation.x = s.pitch * 0.15;
    // brazos sujetando el arma (pose fija con vaivén sutil); al correr, arma baja
    const low = (1 - this.aimK) * 0.6, k = sw * 0.03 * sp;
    this.armR.sh.rotation.set(-0.75 + low + k, 0.1, 0.28); this.armR.el.rotation.set(-1.25 + low * 0.4, 0, -0.5);
    this.armL.sh.rotation.set(-1.25 + low * 0.7 + k, 0.2, -0.5); this.armL.el.rotation.set(-0.55, 0, 0.75);
    this.gunMount.position.set(0.13, 0.36 - low * 0.16, -0.28 + low * 0.03); this.gunMount.rotation.set(-low * 0.9 + (s.firing ? Math.random() * 0.03 : 0), low * 0.5, 0);
  }

  dispose() { this.root.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); if (this.root.parent) this.root.parent.remove(this.root); }
}
