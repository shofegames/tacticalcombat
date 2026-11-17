// MAPA 1 — MODERNO: «DISTRITO 7». Cruce urbano con oficinas, viviendas, almacén industrial y aparcamiento.
// Simetría puntual (x,z) -> (-x,-z) para equilibrar ambos equipos.
import { MapDef } from './builder.js';

export function buildModern() {
  const m = new MapDef('modern', 'DISTRITO 7', {
    era: 'modern',
    desc: 'Cruce urbano al atardecer: oficinas, viviendas, un almacén industrial y un aparcamiento de dos niveles.',
    bounds: { minx: -58, minz: -44, maxx: 58, maxz: 44 },
    env: {
      sky: { elevation: 9, azimuth: 205, turbidity: 7, rayleigh: 2.2 },
      sunColor: 0xffd2a0, sunIntensity: 3.4, ambient: 0x8fa3c8, ambientIntensity: 0.75,
      fog: 0xc79f84, fogDensity: 0.0085, exposure: 0.9, ambience: 'city', reverb: 1.4, dust: 0xffd9b0,
    },
  });
  const P = (fn) => { fn(1); fn(-1); }; // simetría puntual

  // ---- Suelo ----
  m.span(-70, -0.3, -56, 70, 0, 56, 'concrete', { collide: false, tint: 0x8a8a86 });
  m.span(-58, 0, -5, 58, 0.02, 5, 'asphalt', { collide: false });
  m.span(-5, 0, -44, 5, 0.02, 44, 'asphalt', { collide: false });
  // Líneas de carril
  for (let x = -54; x <= 54; x += 6) if (Math.abs(x) > 8) m.box(x, 0.02, 0, 2.4, 0.012, 0.16, 'em', { collide: false, tint: 0xd8d2b8, em: 0.02 });
  for (let z = -40; z <= 40; z += 6) if (Math.abs(z) > 8) m.box(0, 0.02, z, 0.16, 0.012, 2.4, 'em', { collide: false, tint: 0xd8d2b8, em: 0.02 });
  // Aceras
  P((s) => {
    m.span(s * 5, 0, s * 5, s * 58, 0.15, s * 7.5, 'sidewalk');
    m.span(s * 5, 0, -s * 5, s * 58, 0.15, -s * 7.5, 'sidewalk');
    m.span(s * 5, 0, s * 7.5, s * 7.5, 0.15, s * 44, 'sidewalk');
    m.span(-s * 5, 0, s * 7.5, -s * 7.5, 0.15, s * 44, 'sidewalk');
  });

  // ---- Perímetro: fachadas no accesibles ----
  const facTints = [0xb9a48c, 0x9aa3ad, 0xa89384, 0x8d99a3, 0xb3ab9c];
  let k = 0;
  for (let x = -58; x < 58; x += 14.5) {
    m.box(x + 7.25, 0, -50, 14.5, 14 + (k % 3) * 5, 12, 'facade', { tint: facTints[k % 5] });
    m.box(x + 7.25, 0, 50, 14.5, 12 + ((k + 1) % 3) * 6, 12, 'facade', { tint: facTints[(k + 2) % 5] }); k++;
  }
  for (let z = -44; z < 44; z += 14.67) {
    m.box(-64, 0, z + 7.33, 12, 13 + (k % 3) * 5, 14.67, 'facade', { tint: facTints[k % 5] });
    m.box(64, 0, z + 7.33, 12, 15 + ((k + 1) % 3) * 4, 14.67, 'facade', { tint: facTints[(k + 3) % 5] }); k++;
  }

  // ---- Monumento central (zona B) ----
  m.box(0, 0, 0, 4.2, 0.4, 4.2, 'stone');
  m.box(0, 0.4, 0, 2.2, 1.3, 2.2, 'stone');
  m.box(0, 1.7, 0, 0.9, 3.6, 0.9, 'concreteDark');
  P((s) => {
    m.prop('barrier', s * 9, 0, s * 2.6, 0);
    m.prop('barrier', s * 3.2, 0, s * 9.5, 1);
    m.prop('car', s * 13, 0, -s * 2.4, 0, { tint: s > 0 ? 0x8a1f1a : 0x1d3a5f });
    m.prop('van', -s * 2.2, 0, s * 16, 1, { tint: s > 0 ? 0xd8d8d2 : 0x3a4a3a });
  });

  // ---- Oficinas (NO) y viviendas (SE): 2 plantas + azotea ----
  P((s) => {
    m.building(-s * 30, -s * 23, 22, 15, {
      floors: 2, mat: s > 0 ? 'plaster' : 'brick', tint: s > 0 ? 0xcfc6b4 : null, glass: true, roofAccess: true,
      doors: [{ side: s > 0 ? 's' : 'n', at: -s * 4, w: 1.8 }, { side: s > 0 ? 'e' : 'w', at: -s * 5, w: 1.6 }, { side: s > 0 ? 'n' : 's', at: s * 6, w: 1.5 }],
      floorMat: 'planks', groundMat: 'tile',
    });
    // Tabiques interiores y mobiliario
    m.wallZ(-s * 30, -s * 23 - 7.2, -s * 23 + 7.2, 0, 3.15, 0.2, 'plaster', [{ a: -s * 23 - 1, b: -s * 23 + 1, y1: 2.2 }, { a: -s * 23 + s * 4.5 - 0.9, b: -s * 23 + s * 4.5 + 0.9, y1: 2.2 }]);
    m.box(-s * 35, 0, -s * 26, 2.4, 0.95, 1, 'wood');
    m.box(-s * 25, 0, -s * 20, 1, 0.95, 2.6, 'wood');
    m.box(-s * 34, 3.4, -s * 21, 2.6, 1.0, 0.9, 'wood');
    m.box(-s * 27, 3.4, -s * 26.5, 0.9, 1.9, 2.2, 'metal', { tint: 0x5a6068 });
    // Azotea: casetas de climatización como cobertura
    m.box(-s * 33, 6.8, -s * 25, 2.4, 1.3, 1.8, 'metal', { tint: 0x8a9097 });
    m.box(-s * 26, 6.8, -s * 19.5, 1.6, 1.1, 1.6, 'metal', { tint: 0x8a9097 });
    // Plaza junto al cruce
    m.box(-s * 12, 0.15, -s * 13, 4.2, 0.75, 1.4, 'stone');
    m.box(-s * 15.5, 0.15, -s * 19, 1.4, 0.75, 4.2, 'stone');
    m.prop('tree', -s * 12, 0.15, -s * 18.5, 0);
    m.prop('bush', -s * 12, 0.9, -s * 13, 0);
    m.prop('lamp', -s * 8.5, 0.15, -s * 8.5, 0);
    m.light(-s * 8.5, 5, -s * 8.5, 0xffc98a, 30, 16);
    // Callejón trasero
    m.prop('dumpster', -s * 22, 0, -s * 36, 0, { tint: 0x2f5a3c });
    m.prop('dumpster', -s * 36, 0, -s * 38.5, 0, { tint: 0x2a4a6a });
    m.prop('pallets', -s * 29, 0, -s * 33.2, 0);
    m.box(-s * 44.5, 0, -s * 30, 0.25, 2.4, 9, 'rust');
    m.prop('car', -s * 46, 0, -s * 14, 1, { tint: 0x55595e });
  });

  // ---- Almacén industrial (SO) y simétrico taller (NE) ----
  P((s) => {
    const cx = -s * 30, cz = s * 25, w = 26, d = 20, H = 7;
    const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2, t = 0.3;
    const zN = s > 0 ? z0 : z1, zS = s > 0 ? z1 : z0;     // zN = lado que mira a la avenida
    const xE = s > 0 ? x1 : x0, xW = s > 0 ? x0 : x1;     // xE = lado que mira al cruce
    m.wallX(zN + s * t / 2, x0, x1, 0, H, t, 'rust', [{ a: cx - 2.4, b: cx + 2.4, y1: 4.2 }, { a: cx - s * 9 - 0.8, b: cx - s * 9 + 0.8, y1: 2.3 }], { tint: 0x9aa6ad });
    m.wallX(zS - s * t / 2, x0, x1, 0, H, t, 'rust', [{ a: cx + s * 7 - 0.9, b: cx + s * 7 + 0.9, y1: 2.3 }], { tint: 0x9aa6ad });
    m.wallZ(xE - s * t / 2, z0 + t, z1 - t, 0, H, t, 'rust', [{ a: cz - 2, b: cz + 2, y1: 3.6 }], { tint: 0x9aa6ad });
    m.wallZ(xW + s * t / 2, z0 + t, z1 - t, 0, H, t, 'rust', [{ a: cz - s * 5 - 0.8, b: cz - s * 5 + 0.8, y1: 2.3 }], { tint: 0x9aa6ad });
    m.span(x0, H, z0, x1, H + 0.25, z1, 'rust', { tint: 0x7d868c });
    m.span(x0 + t, 0, z0 + t, x1 - t, 0.03, z1 - t, 'concreteDark', { collide: false });
    // Pasarela interior (altura) en el lado sur y oeste, con escalera
    const cy = 3.2;
    m.span(Math.min(xW + s * t, xW + s * 3.2), cy - 0.2, z0 + t, Math.max(xW + s * t, xW + s * 3.2), cy, z1 - t, 'metal');
    m.span(x0 + t, cy - 0.2, Math.min(zS - s * t, zS - s * 3.2), x1 - t, cy, Math.max(zS - s * t, zS - s * 3.2), 'metal');
    m.stairs(xE - s * 2.2, 0, zS - s * 3.2 - s * 2.24, 1.3, cy, 4.48, s > 0 ? '+z' : '-z', 'metal');
    // barandillas
    m.box(xW + s * 3.2, cy, cz - s * 2, 0.08, 1.0, d - 8, 'metal', { tint: 0xc8a020 });
    m.box(cx - s * 2, cy, zS - s * 3.2, w - 10, 1.0, 0.08, 'metal', { tint: 0xc8a020 });
    // Estanterías y cajas
    m.box(cx - s * 2, 0, cz - s * 3, 7, 2.6, 1.2, 'crate');
    m.box(cx + s * 5, 0, cz + s * 1.5, 1.4, 1.4, 1.4, 'crate');
    m.box(cx + s * 6.5, 0, cz + s * 1.2, 1.2, 1.2, 1.2, 'crate');
    m.box(cx + s * 5.6, 1.4, cz + s * 1.4, 1.1, 1.1, 1.1, 'crate');
    m.prop('barrel', cx - s * 8, 0, cz - s * 7.5, 0, { tint: 0x2b5c8a });
    m.prop('barrel', cx - s * 8.8, 0, cz - s * 7.1, 0, { tint: 0x8a2b2b });
    m.prop('generator', cx + s * 9, 0, cz - s * 7.5, 0);
    m.light(cx, 6.2, cz, 0xffe2b8, 55, 24);
    // Patio de contenedores entre el almacén y el cruce
    m.box(-s * 11, 0, s * 15, 6.1, 2.6, 2.44, 'container', { tint: 0x9a3a2a });
    m.box(-s * 11, 2.6, s * 15.3, 6.1, 2.6, 2.44, 'container', { tint: 0x2a5d8a });
    m.box(-s * 9.6, 0, s * 23, 2.44, 2.6, 6.1, 'container', { tint: 0x3d7a4a });
    m.box(-s * 13.5, 0, s * 31, 6.1, 2.6, 2.44, 'container', { tint: 0xb38a2a });
    m.box(-s * 9.4, 0, s * 18.4, 1.3, 1.3, 1.3, 'crate');
    m.ramp(-s * 9.3, 0, s * 29.05, 2.0, 2.6, 6, s > 0 ? '-z' : '+z', 'planks'); // acceso al techo del contenedor
    m.prop('pallets', -s * 14.5, 0, s * 21, 1);
    m.prop('barrier', -s * 16, 0, s * 9.4, 0);
    m.prop('lamp', -s * 8.5, 0.15, s * 8.5, 0);
    m.light(-s * 8.5, 5, s * 8.5, 0xffc98a, 30, 16);
    // Zona trasera
    m.prop('van', -s * 49, 0, s * 33, 1, { tint: 0x9a8f7a });
    m.box(-s * 48, 0, s * 20, 1.4, 1.4, 1.4, 'crate');
    m.box(-s * 22, 0, s * 39.5, 5, 2.2, 0.25, 'rust');
    m.box(-s * 38, 0, s * 39, 1.3, 1.3, 1.3, 'crate');
  });

  // ---- Cobertura en la avenida ----
  P((s) => {
    m.prop('car', s * 24, 0, s * 2.6, 0, { tint: 0xc8c4bc });
    m.prop('car', s * 31, 0, -s * 3.0, 2, { tint: 0x222428 });
    m.prop('barrier', s * 38, 0, s * 1.2, 1);
    m.prop('barrier', s * 38, 0, -s * 2.4, 1);
    m.prop('sandbags', s * 44, 0, s * 4.0, 0);
    m.prop('van', s * 18.5, 0, -s * 3.2, 0, { tint: 0xa33b22 });
    m.prop('lamp', s * 28, 0.15, s * 6.4, 0);
    m.light(s * 28, 5, s * 6.4, 0xffc98a, 26, 15);
    m.prop('lamp', s * 46, 0.15, -s * 6.4, 0);
    m.prop('barrel', s * 41, 0, -s * 4.2, 0, { tint: 0xc77a1a });
    m.box(s * 52, 0, s * 10, 3, 2.2, 0.3, 'concrete');
    m.box(s * 52, 0, -s * 10, 3, 2.2, 0.3, 'concrete');
    m.prop('tree', s * 20, 0.15, s * 6.3, 0);
    m.prop('tree', s * 40, 0.15, -s * 6.3, 0);
    m.prop('smoke', s * 18.5, 2.2, -s * 3.2, 0);
  });

  // ---- Spawns ----
  for (const z of [-34, -27, -12, -3, 3, 12, 28, 35]) {
    m.spawn('a', -54.5, 0.2, z, Math.PI / 2 * -1);
    m.spawn('b', 54.5, 0.2, -z, Math.PI / 2);
  }
  P((s) => {
    m.spawn('ffa', s * 54, 0.2, s * 30); m.spawn('ffa', s * 50, 0.2, -s * 36); m.spawn('ffa', s * 20, 0.2, s * 40);
    m.spawn('ffa', s * 2, 0.2, s * 40); m.spawn('ffa', s * 34, 0.2, s * 0); m.spawn('ffa', s * 30, 0.2, s * 13);
    m.spawn('ffa', s * 18, 0.2, -s * 38); m.spawn('ffa', s * 44, 0.2, -s * 12);
  });

  // ---- Zonas de DOMINATION ----
  m.zone('A', -34, 0, 0, 5.5);
  m.zone('B', 0, 0, 0, 7);
  m.zone('C', 34, 0, 0, 5.5);
  return m;
}
