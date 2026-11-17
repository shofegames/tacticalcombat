// CAMPO DE ENTRENAMIENTO: galería de tiro con dianas a distancias marcadas + casa de asalto con bots.
import { MapDef } from './builder.js';

export function buildTraining() {
  const m = new MapDef('training', 'CAMPO DE TIRO', {
    era: 'modern',
    desc: 'Galería de tiro con dianas fijas y móviles a 10, 25, 50 y 75 m, y una casa de asalto para practicar contra bots.',
    bounds: { minx: -34, minz: -50, maxx: 34, maxz: 44 },
    env: {
      sky: { elevation: 38, azimuth: 150, turbidity: 4, rayleigh: 1.1 },
      sunColor: 0xfff1dc, sunIntensity: 3.6, ambient: 0xa9c0e0, ambientIntensity: 0.9,
      fog: 0xb7c8d8, fogDensity: 0.0045, exposure: 0.85, ambience: 'field', reverb: 0.9, dust: 0xffffff,
    },
  });
  m.span(-60, -0.3, -70, 60, 0, 60, 'grass', { collide: false, surf: 'dirt' });
  m.span(-10, 0, -48, 12, 0.02, 36, 'dirt', { collide: false });
  // Taludes perimetrales
  m.box(0, 0, -53, 80, 6, 6, 'grass', { surf: 'dirt' }); m.box(0, 0, 47, 80, 3, 6, 'hedge');
  m.box(-37, 0, 0, 6, 4, 110, 'hedge'); m.box(37, 0, 0, 6, 4, 110, 'hedge');

  // ---- Línea de tiro cubierta ----
  m.span(-10, 0, 33, 12, 0.12, 39, 'concrete');
  for (const x of [-10, -4.5, 1, 6.5, 12]) m.box(x, 0.12, 33.2, 0.25, 2.9, 0.25, 'metal');
  m.span(-10.5, 3.0, 32.6, 12.5, 3.15, 39.6, 'rust', { tint: 0x7d868c });
  for (const x of [-7.2, -1.7, 3.8, 9.2]) { m.box(x, 0.12, 33.6, 2.6, 0.95, 0.5, 'wood'); }
  // Armero / cajas de munición
  m.box(-8.5, 0.12, 38.2, 2.4, 1.0, 0.9, 'crate'); m.box(10, 0.12, 38.2, 2.4, 1.0, 0.9, 'crate');
  // ---- Calles con dianas ----
  for (const [d, lab] of [[10, 0], [25, 1], [50, 2], [75, 3]]) {
    const z = 33.5 - d;
    m.box(-9.4, 0, z, 0.2, 1.4, 0.2, 'wood'); m.box(-9.4, 1.4, z, 1.0, 0.5, 0.06, 'em', { collide: false, tint: 0xf2f2f2, em: 0.05 });
    m.targets.push({ x: -6, y: 0, z, yaw: 0 }, { x: 4, y: 0, z, yaw: 0 });
    m.targets.push({ x: -1, y: 0, z: z - 1.5, yaw: 0, move: { axis: 'x', range: 3.5, speed: 1.2 + lab * 0.5 } });
    if (lab > 0) { m.box(7.5, 0, z + 2, 2.4, 1.1, 0.4, 'sandbag', { surf: 'dirt' }); }
  }
  // ---- Casa de asalto (madera contrachapada) ----
  const hx = -22, hz = 6;
  m.wallX(hz + 12, hx - 8, hx + 8, 0, 2.7, 0.2, 'planks', [{ a: hx - 1, b: hx + 1, y1: 2.2 }]);
  m.wallX(hz - 12, hx - 8, hx + 8, 0, 2.7, 0.2, 'planks', [{ a: hx + 3, b: hx + 5, y1: 2.2 }]);
  m.wallZ(hx - 8, hz - 12, hz + 12, 0, 2.7, 0.2, 'planks', [{ a: hz - 2, b: hz - 0.4, y0: 1, y1: 2.1 }]);
  m.wallZ(hx + 8, hz - 12, hz + 12, 0, 2.7, 0.2, 'planks', [{ a: hz + 3, b: hz + 5, y1: 2.2 }, { a: hz - 8, b: hz - 6.4, y0: 1, y1: 2.1 }]);
  m.wallX(hz + 4, hx - 8, hx + 8, 0, 2.7, 0.2, 'planks', [{ a: hx + 3.4, b: hx + 5.2, y1: 2.2 }]);
  m.wallX(hz - 4, hx - 8, hx + 8, 0, 2.7, 0.2, 'planks', [{ a: hx - 5.5, b: hx - 3.7, y1: 2.2 }]);
  m.wallZ(hx, hz - 4, hz + 4, 0, 2.7, 0.2, 'planks', [{ a: hz - 1, b: hz + 0.8, y1: 2.2 }]);
  m.box(hx - 4, 0, hz + 8, 1.3, 1.1, 1.3, 'crate'); m.box(hx + 4, 0, hz - 8, 2.4, 1.0, 1.0, 'crate');
  m.box(hx + 3.5, 0, hz + 0.5, 1.2, 1.2, 1.2, 'crate');
  m.span(hx - 8, 0, hz - 12, hx + 8, 0.02, hz + 12, 'concreteDark', { collide: false });
  // Bots de práctica dentro y alrededor de la casa
  for (const [x, z] of [[hx - 4, hz + 1], [hx + 4.5, hz - 1.5], [hx - 3, hz - 8], [hx + 2, hz + 8], [hx + 5, hz - 9.5]]) m.dummy(x, 0.1, z);
  // ---- Pista de obstáculos (derecha) ----
  m.box(22, 0, 20, 6, 1.0, 0.5, 'concrete'); m.box(22, 0, 14, 3, 1.6, 3, 'crate');
  m.ramp(22, 0, 6, 3, 2.4, 6, '-z', 'wood'); m.box(22, 0, 0, 5, 2.4, 6, 'container', { tint: 0x2a5d8a });
  m.box(22, 0, -8, 0.4, 2.0, 6, 'concrete'); m.prop('barrier', 26, 0, -14, 0); m.prop('sandbags', 20, 0, -18, 0);
  m.prop('car', 24, 0, -26, 1, { tint: 0x6a6f66 }); m.prop('barrel', 19, 0, -8, 0, { tint: 0xc77a1a });
  m.dummy(24, 0.1, -20); m.dummy(20, 0.1, -32); m.dummy(27, 0.1, -6);
  m.prop('tree', -30, 0, 34, 0); m.prop('tree', 30, 0, 38, 0); m.prop('tree', 30, 0, -40, 0); m.prop('bush', 15, 0, 28, 0);

  m.spawn('a', 1, 0.2, 36.5, 0); m.spawn('ffa', 1, 0.2, 36.5, 0);
  m.spawn('b', -22, 0.1, 6);
  return m;
}
