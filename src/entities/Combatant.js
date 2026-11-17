// Estado común de cualquier combatiente (jugador local, bot o jugador remoto).
import { BODY } from '../../shared/collision.js';

let nextId = 1;
export class Combatant {
  constructor(name, team) {
    this.id = nextId++;
    this.name = name; this.team = team;
    this.isPlayer = false; this.isBot = false; this.isRemote = false; this.isDummy = false;
    this.body = { x: 0, y: 0, z: 0, r: BODY.radius, h: BODY.standH, onGround: true, stepHeight: 0.45 };
    this.vx = 0; this.vy = 0; this.vz = 0;
    this.yaw = 0; this.pitch = 0; this.crouch = false;
    this.health = 100; this.maxHealth = 100; this.alive = false;
    this.kills = 0; this.deaths = 0; this.assists = 0; this.score = 0; this.streak = 0; this.captures = 0;
    this.weaponId = 'mk4';
    this.respawnT = 0; this.lastHurt = -99; this.spawnProtect = 0; this.lastShotT = -99;
    this.model = null;
  }
  get eyeY() { return this.body.y + (this.crouch ? BODY.eyeCrouch : BODY.eyeStand); }
  get speed() { return Math.hypot(this.vx, this.vz); }
  /** Regeneración de vida tras unos segundos sin recibir daño. */
  regen(dt, now) { if (this.alive && this.health < this.maxHealth && now - this.lastHurt > 5) this.health = Math.min(this.maxHealth, this.health + 22 * dt); }
}
