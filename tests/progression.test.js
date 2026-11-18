// Progreso y equipo: curva de experiencia, desbloqueos y balística de los lanzamientos.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { xpForLevel, levelFromXp, levelInfo, unlocksBetween, isUnlocked, matchXp, UNLOCKS, MAX_LEVEL } from '../shared/progression.js';
import { WEAPONS } from '../shared/weapons.js';
import { GEAR, blastDamage, ballistic } from '../shared/gear.js';
import { DEFAULT_LOADOUT } from '../shared/weapons.js';

test('curva de experiencia creciente y coherente', () => {
  assert.equal(xpForLevel(1), 0);
  for (let n = 2; n <= MAX_LEVEL; n++) {
    assert.ok(xpForLevel(n) > xpForLevel(n - 1), `nivel ${n}`);
    assert.equal(levelFromXp(xpForLevel(n)), n);
    assert.equal(levelFromXp(xpForLevel(n) - 1), n - 1);
  }
  assert.equal(levelFromXp(1e9), MAX_LEVEL);
  const i = levelInfo(xpForLevel(4) + 100);
  assert.equal(i.level, 4); assert.equal(i.cur, 100); assert.ok(i.frac > 0 && i.frac < 1);
});

test('desbloqueos: todas las armas existen y el equipo inicial está disponible', () => {
  for (const id of Object.keys(WEAPONS)) assert.ok(id in UNLOCKS.weapon, `${id} sin nivel de desbloqueo`);
  assert.ok(isUnlocked('weapon', DEFAULT_LOADOUT.primary, 1));
  assert.ok(isUnlocked('weapon', DEFAULT_LOADOUT.secondary, 1));
  const u = unlocksBetween(1, 5).map((x) => x.id);
  assert.ok(u.includes('akv') && u.includes('flash') && !u.includes('mk4'));
});

test('experiencia por partida', () => {
  assert.equal(matchXp({ mode: 'training', score: 999 }).total, 0);
  const w = matchXp({ score: 1000, won: true, minutes: 10 }).total, l = matchXp({ score: 1000, minutes: 10 }).total;
  assert.ok(w > l && l > 1000);
});

test('granada: daño decreciente y lanzamiento que llega al objetivo', () => {
  const f = GEAR.frag;
  assert.ok(blastDamage(f, 0) >= 100, 'letal en el centro');
  assert.ok(blastDamage(f, 2) > blastDamage(f, 5));
  assert.equal(blastDamage(f, f.radius + 0.1), 0);
  const o = { x: 0, y: 1.5, z: 0 }, t = { x: 18, y: 0, z: -6 }, g = 15, v = ballistic(o, t, g);
  const x = o.x + v.x * v.T, y = o.y + v.y * v.T - 0.5 * g * v.T * v.T, z = o.z + v.z * v.T;
  assert.ok(Math.hypot(x - t.x, y - t.y, z - t.z) < 1e-6);
});
