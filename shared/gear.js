// Equipo: granadas y cuchillo. Como las armas, son datos compartidos (cliente y futuro servidor).
// Cada entrada sirve también como «arma» para el killfeed y las estadísticas (id + name).

export const GEAR = {
  frag: {
    id: 'frag', name: 'Granada de fragmentación', short: 'Granada', kind: 'lethal', count: 2,
    fuse: 2.8, radius: 7.5, damage: 140, minDamage: 8, throwSpeed: 17, bounce: 0.32, color: 0x3d4a2c,
    desc: 'Explota a los 2,8 s. Letal en un radio de unos 3 m y peligrosa hasta 7.',
  },
  smoke: {
    id: 'smoke', name: 'Granada de humo', short: 'Humo', kind: 'tactical', count: 2,
    fuse: 1.4, radius: 5.5, duration: 15, throwSpeed: 15, bounce: 0.25, color: 0x6c7276,
    desc: 'Crea una cortina de humo de 15 s que bloquea la visión. Ideal para cruzar zonas abiertas.',
  },
  flash: {
    id: 'flash', name: 'Granada aturdidora', short: 'Aturdidora', kind: 'tactical', count: 2,
    fuse: 1.5, radius: 20, duration: 3.6, throwSpeed: 16, bounce: 0.3, color: 0x2a2c30,
    desc: 'Destello cegador y estruendo. Ciega a quien la mire hasta 3,6 s; de espaldas el efecto es mucho menor.',
  },
  knife: {
    id: 'knife', name: 'Cuchillo', short: 'Cuchillo', kind: 'melee',
    damage: 100, botDamage: 55, range: 2.2, angle: 40, cooldown: 0.75,
    desc: 'Ataque cuerpo a cuerpo. Elimina de un golpe a corta distancia.',
  },
};
export const TACTICALS = ['smoke', 'flash'];

/** Daño de una explosión a una distancia dada (caída suave hasta el borde del radio). */
export function blastDamage(g, dist) {
  if (dist >= g.radius) return 0;
  const k = 1 - dist / g.radius;
  return Math.max(g.minDamage, g.damage * k * k);
}

/**
 * Velocidad inicial para lanzar un proyectil desde o hasta t, con gravedad gr,
 * eligiendo el tiempo de vuelo según la distancia (lanzamiento de los bots).
 */
export function ballistic(o, t, gr = 15) {
  const dx = t.x - o.x, dy = t.y - o.y, dz = t.z - o.z, d = Math.hypot(dx, dz);
  const T = Math.min(2.2, Math.max(0.55, d / 13));
  return { x: dx / T, y: (dy + 0.5 * gr * T * T) / T, z: dz / T, T };
}
