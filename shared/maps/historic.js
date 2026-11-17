// MAPA 2 — HISTÓRICO: «LÍNEA DE HIERRO, 1944». Pueblo en ruinas entre dos líneas de trincheras.
// Trincheras excavadas de verdad (suelo a -1,7 m), iglesia con campanario, granja, colinas con búnker.
import { MapDef } from './builder.js';

export function buildHistoric() {
  const TD = -1.7; // profundidad de trinchera
  const m = new MapDef('historic', 'LÍNEA DE HIERRO · 1944', {
    era: 'historic',
    desc: 'Un pueblo en ruinas entre dos líneas de trincheras. Niebla al amanecer, barro, alambradas y un campanario que domina el frente.',
    bounds: { minx: -56, minz: -42, maxx: 56, maxz: 42 },
    floorY: TD,
    env: {
      sky: { elevation: 14, azimuth: 120, turbidity: 14, rayleigh: 1.2 },
      sunColor: 0xe6dccb, sunIntensity: 2.3, ambient: 0x9aa39a, ambientIntensity: 0.95,
      fog: 0xa9ada3, fogDensity: 0.016, exposure: 0.82, ambience: 'battlefield', reverb: 2.2, dust: 0xcfd2c4,
    },
  });
  const P = (fn) => { fn(1); fn(-1); };

  // ---- Trincheras: recortes del terreno ----
  const cuts = [];
  P((s) => {
    const c = (x0, z0, x1, z1) => cuts.push([Math.min(s * x0, s * x1), Math.min(s * z0, s * z1), Math.max(s * x0, s * x1), Math.max(s * z0, s * z1)]);
    c(-34, -28, -31.8, -8);      // tramo norte
    c(-34, -10, -28, -8);        // enlace
    c(-30.2, -10, -28, 10);      // tramo central adelantado
    c(-34, 8, -28, 10);          // enlace
    c(-34, 8, -31.8, 28);        // tramo sur
    c(-47, -20, -34, -18);       // ramal de comunicación norte
    c(-47, 18, -34, 20);         // ramal de comunicación sur
    c(-28, -1.1, -21, 1.1);      // zapa de avance
  });
  // Terreno (hierba/tierra) con las trincheras recortadas, y fondo de barro
  m.slab(-70, -56, 70, 56, TD, 0, 'grass', cuts, { surf: 'dirt' });
  m.span(-60, TD - 0.3, -46, 60, TD, 46, 'mud', { collide: false });
  // Camino de tierra central y calle del pueblo
  m.span(-56, 0, -3, 56, 0.015, 3, 'dirt', { collide: false });
  m.span(-3, 0, -18, 3, 0.015, 18, 'dirt', { collide: false });

  P((s) => {
    // Rampas de salida de las trincheras
    m.ramp(-s * 45, TD, -s * 19, 4, -TD, 2, s > 0 ? '-x' : '+x', 'dirt');
    m.ramp(-s * 45, TD, s * 19, 4, -TD, 2, s > 0 ? '-x' : '+x', 'dirt');
    m.ramp(-s * 23, TD, 0, 4, -TD, 2.2, s > 0 ? '+x' : '-x', 'dirt');
    m.ramp(-s * 32.9, TD, -s * 26, 2.2, -TD, 4, s > 0 ? '-z' : '+z', 'dirt');
    m.ramp(-s * 32.9, TD, s * 26, 2.2, -TD, 4, s > 0 ? '+z' : '-z', 'dirt');
    // Entibado de madera en el tramo adelantado
    for (let z = -9; z <= 9; z += 3) {
      m.box(-s * 28.04, TD, s * z, 0.08, 1.7, 2.6, 'planks', { collide: false });
      m.box(-s * 30.16, TD, s * z, 0.08, 1.7, 2.6, 'planks', { collide: false });
    }
    // Parapeto de sacos en el borde de la trinchera (lado enemigo)
    for (const z of [-24, -18, -12, 14, 20, 26]) m.prop('sandbags', -s * 31.2, 0, s * z, 1);
    for (const z of [-6, 6]) m.prop('sandbags', -s * 27.4, 0, s * z, 1);
    // Alambradas en tierra de nadie
    for (const z of [-30, -22, -14, 12, 20, 30]) m.prop('barbwire', -s * 24, 0, s * z, 1);
    m.prop('barbwire', -s * 19, 0, s * 8, 0);
    m.prop('barbwire', -s * 17, 0, -s * 9, 0);
    // Nido de ametralladora (zona A / C)
    m.prop('sandbags', -s * 18, 0, -s * 3.6, 0);
    m.prop('sandbags', -s * 18, 0, s * 3.6, 0);
    m.prop('sandbags', -s * 15.6, 0, 0, 1);
    m.box(-s * 19.5, 0, 0, 1.1, 0.8, 1.1, 'crate');
    // Colina con búnker (altura)
    const hx = -s * 20, hz = s * 31;
    m.span(hx - 9, 0, hz - 7, hx + 9, 2, hz + 7, 'grass', { surf: 'dirt' });
    m.ramp(hx + s * 11.5, 0, hz - s * 2, 5, 2, 4, s > 0 ? '-x' : '+x', 'grass', { surf: 'dirt' });
    m.ramp(hx - s * 4, 0, hz - s * 9.5, 4, 2, 5, s > 0 ? '+z' : '-z', 'grass', { surf: 'dirt' });
    // Búnker de hormigón con tronera
    const bz = hz + s * 2;
    m.wallX(bz - s * 2.5, hx - 4, hx + 4, 2, 2.4, 0.5, 'concreteDark', [{ a: hx - 2.6, b: hx + 2.6, y0: 1.05, y1: 1.6 }]);
    m.wallX(bz + s * 2.5, hx - 4, hx + 4, 2, 2.4, 0.5, 'concreteDark', [{ a: hx - 0.8, b: hx + 0.8, y1: 2.0 }]);
    m.wallZ(hx - s * 3.75, bz - 2.25, bz + 2.25, 2, 2.4, 0.5, 'concreteDark');
    m.wallZ(hx + s * 3.75, bz - 2.25, bz + 2.25, 2, 2.4, 0.5, 'concreteDark', [{ a: bz - 0.9, b: bz + 0.9, y0: 1.05, y1: 1.6 }]);
    m.span(hx - 4.3, 4.4, bz - 3, hx + 4.3, 4.9, bz + 3, 'concreteDark');
    m.prop('sandbags', hx - s * 6, 2, hz - s * 5.8, 0);
    // Muros de piedra, setos y árboles
    m.box(-s * 10, 0, -s * 12, 9, 1.15, 0.6, 'stone');
    m.box(-s * 14.5, 0, -s * 16.5, 0.6, 1.15, 9, 'stone');
    m.box(-s * 8, 0, s * 12.5, 0.6, 1.15, 7, 'stone');
    m.box(-s * 40, 0, s * 5, 0.9, 1.9, 12, 'hedge');
    m.box(-s * 12, 0, -s * 36, 14, 1.9, 0.9, 'hedge');
    m.prop('tree', -s * 40, 0, -s * 8, 0);
    m.prop('tree', -s * 46, 0, s * 30, 0);
    m.prop('deadtree', -s * 21, 0, -s * 21, 0);
    m.prop('deadtree', -s * 12, 0, s * 6.5, 0);
    m.prop('tree', -s * 6, 0, s * 37, 0);
    m.prop('bush', -s * 36.5, 0, -s * 33, 0);
    m.prop('bush', -s * 9, 0, -s * 27, 0);
    // Artillería, carros y cráteres
    m.prop('cannon', -s * 37.5, 0, -s * 13, s > 0 ? 0 : 2);
    m.prop('cart', -s * 8, 0, -s * 5.2, 0);
    m.prop('haystack', -s * 13, 0, s * 20, 0);
    m.prop('crater', -s * 22, 0, s * 13, 0);
    m.prop('crater', -s * 9, 0, -s * 20, 0);
    m.prop('crater', -s * 17, 0, -s * 30, 0);
    m.box(-s * 49, 0, -s * 30, 1.2, 1.2, 1.2, 'crate');
    m.box(-s * 50, 0, s * 8, 2.6, 1.0, 1.1, 'crate');
    m.prop('barrel', -s * 49, 0, s * 10, 0, { tint: 0x4a5a3a });
    m.prop('smoke', -s * 22, 0.2, s * 13, 0);
    m.prop('fire', -s * 9, 0.1, -s * 20, 0);
  });

  // ---- Tanque destruido en el centro ----
  m.prop('tank', 5.5, 0, -8.5, 1);
  m.prop('smoke', 5.5, 2.3, -8.5, 0);
  m.prop('fire', 5.2, 1.6, -9.5, 0);
  m.prop('tank', -6, 0, 9.5, 3, { tint: 0x5c5f52 });
  // Pozo del pueblo (zona B)
  m.prop('well', 0, 0, 0, 0);

  // ---- Iglesia en ruinas (norte) con campanario ----
  const cz = -25;
  m.wallX(cz + 9, -6, 6, 0, 5.5, 0.6, 'stone', [{ a: -1.3, b: 1.3, y1: 3.2 }]);           // fachada sur con portón
  m.wallZ(-6, cz - 9, cz + 8.7, 0, 4.2, 0.6, 'stone', [{ a: cz - 5.6, b: cz - 4.2, y0: 1.2, y1: 3.4 }, { a: cz + 0.2, b: cz + 3.6, y0: 0, y1: 4.2 }, { a: cz + 5.4, b: cz + 6.8, y0: 1.2, y1: 3.4 }]);
  m.wallZ(6, cz - 9, cz + 8.7, 0, 4.2, 0.6, 'stone', [{ a: cz - 5.6, b: cz - 4.2, y0: 1.2, y1: 3.4 }, { a: cz - 1, b: cz + 0.6, y0: 1.2, y1: 3.4 }, { a: cz + 4.8, b: cz + 6.6, y0: 0, y1: 2.6 }]);
  m.span(-6.3, 0, cz - 9.3, 6.3, 0.03, cz + 9.3, 'tile', { collide: false, tint: 0x8d8778 });
  for (const z of [cz - 2, cz + 2, cz + 6]) { m.box(-3.4, 0, z, 2.6, 0.55, 0.6, 'wood'); m.box(3.4, 0, z, 2.6, 0.55, 0.6, 'wood'); }
  m.box(0, 0, cz - 5.5, 2.4, 1.1, 1.0, 'stone');                                          // altar
  m.box(-3.5, 0, cz + 0.5, 2.2, 0.9, 1.6, 'stone', { tint: 0x7a766c });                   // escombros
  m.box(4.6, 0, cz + 7.2, 1.6, 0.6, 1.4, 'stone', { tint: 0x7a766c });
  // Campanario (3 niveles; el superior es mirador)
  m.building(0, cz - 12.8, 7.6, 7.6, { floors: 2, floorH: 3.6, mat: 'stone', floorMat: 'planks', roofAccess: true, winSpacing: 6, winW: 1.0,
    doors: [{ side: 's', at: 0, w: 1.5 }], groundMat: 'tile', stairMat: 'wood' });
  m.span(-6, 0, cz - 9.3, -3.8, 4.2, cz - 8.7, 'stone'); m.span(3.8, 0, cz - 9.3, 6, 4.2, cz - 8.7, 'stone');

  // ---- Granja en ruinas (sur) ----
  m.building(0, 27, 12, 9, { floors: 2, floorH: 3.2, mat: 'stone', tint: 0xb3a78e, floorMat: 'planks', roofAccess: false,
    doors: [{ side: 'n', at: -2, w: 1.5 }, { side: 'w', at: 1, w: 1.4 }, { side: 'e', at: -1, w: 1.4 }], roofMat: 'roof', groundMat: 'planks' });
  m.box(-3, 0, 28.5, 2.2, 0.9, 1, 'wood');
  m.box(2.5, 3.2, 25, 1.2, 1.0, 2.2, 'crate');
  m.wallX(20.5, -8, 8, 0, 1.15, 0.6, 'stone', [{ a: -3, b: -1, y1: 1.15 }]);
  m.prop('haystack', 9.5, 0, 26, 0);
  m.prop('cart', -9.5, 0, 31, 1);
  m.prop('tree', 10, 0, 36, 0);
  m.prop('tree', -9, 0, -37.5, 0);

  // ---- Perímetro: taludes, setos y bosque ----
  for (let x = -56; x < 56; x += 8) {
    m.box(x + 4, 0, -44.5, 8, 3.2 + ((x * 7) % 3) * 0.3, 5, 'hedge');
    m.box(x + 4, 0, 44.5, 8, 3.2 + ((x * 5) % 3) * 0.3, 5, 'hedge');
    m.prop('tree', x + 2 + ((x * 13) % 5), 0, -47 - ((x * 3) % 4), 0, { scale: 1.3, ghost: true });
    m.prop('tree', x + 5 - ((x * 11) % 4), 0, 47 + ((x * 7) % 4), 0, { scale: 1.4, ghost: true });
  }
  for (let z = -42; z < 42; z += 7) {
    m.box(-58.5, 0, z + 3.5, 5, 3.4, 7, 'hedge'); m.box(58.5, 0, z + 3.5, 5, 3.4, 7, 'hedge');
    m.prop('tree', -60 - ((z * 3) % 3), 0, z + 2, 0, { scale: 1.35, ghost: true });
    m.prop('tree', 60 + ((z * 5) % 3), 0, z + 4, 0, { scale: 1.3, ghost: true });
  }

  // ---- Spawns ----
  for (const z of [-36, -30, -24, -8, 0, 8, 26, 34]) {
    m.spawn('a', -52, 0.1, z, -Math.PI / 2);
    m.spawn('b', 52, 0.1, -z, Math.PI / 2);
  }
  P((s) => {
    m.spawn('ffa', s * 52, 0.1, s * 34); m.spawn('ffa', s * 50, 0.1, -s * 30); m.spawn('ffa', s * 38, 0.1, s * 2);
    m.spawn('ffa', s * 20, 0.1, s * 38); m.spawn('ffa', s * 14, 0.1, s * 8); m.spawn('ffa', s * 10, 0.1, -s * 38);
    m.spawn('ffa', s * 24, 0.1, -s * 14); m.spawn('ffa', s * 3, 0.1, s * 13);
  });

  m.zone('A', -18, 0, 0, 5);
  m.zone('B', 0, 0, 0, 6);
  m.zone('C', 18, 0, 0, 5);
  return m;
}
