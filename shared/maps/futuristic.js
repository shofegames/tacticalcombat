// MAPA 3 — FUTURISTA: «ESTACIÓN HELIOS». Instalación orbital: sala del reactor con pasarela anular,
// hangares, laboratorios, sala de servidores y un corredor elevado. Simetría puntual.
import { MapDef } from './builder.js';

export function buildFuturistic() {
  const m = new MapDef('futuristic', 'ESTACIÓN HELIOS', {
    era: 'future',
    desc: 'Instalación de investigación orbital. Un reactor de fusión en el centro, pasarelas elevadas, laboratorios y hangares bañados en luz de neón.',
    bounds: { minx: -54, minz: -40, maxx: 54, maxz: 40 },
    env: {
      indoor: true, sky: null, background: 0x03060c,
      sunColor: 0x9fc4ff, sunIntensity: 0.9, sunDir: [0.25, 1, 0.18], ambient: 0x5a78a8, ambientIntensity: 0.85,
      fog: 0x0a1626, fogDensity: 0.011, exposure: 1.0, ambience: 'station', reverb: 2.6, dust: 0x7fd4ff, bloom: 1.25,
    },
  });
  const P = (fn) => { fn(1); fn(-1); };
  const CY = 0x35d6ff, OR = 0xff8a2a, WH = 0xdcefff, RD = 0xff3a4a;
  const strip = (x, y, z, w, h, d, c = CY, e = 2.2) => m.box(x, y, z, w, h, d, 'em', { collide: false, tint: c, em: e });
  const T = 0.4, Hc = 4.2;

  // ---- Suelo general y casco exterior ----
  m.span(-56, -0.3, -42, 56, 0, 42, 'scifiFloor', { collide: false });
  m.wallX(-40.4, -55, 55, 0, 14, 0.8, 'scifiWall'); m.wallX(40.4, -55, 55, 0, 14, 0.8, 'scifiWall');
  m.wallZ(-54.4, -40, 40, 0, 14, 0.8, 'scifiWall'); m.wallZ(54.4, -40, 40, 0, 14, 0.8, 'scifiWall');

  // ================= SALA DEL REACTOR (centro) =================
  // Muros de la sala (x,z ∈ ±17), con puertas a los cuatro lados y accesos elevados E/O
  m.wallX(-17, -17, 17, 0, 12, T, 'scifiWall', [{ a: -2.2, b: 2.2, y1: 3.2 }]);
  m.wallX(17, -17, 17, 0, 12, T, 'scifiWall', [{ a: -2.2, b: 2.2, y1: 3.2 }]);
  for (const wx of [-17, 17]) {
    m.wallZ(wx, -17, 17, 0, 3.6, T, 'scifiWall', [{ a: -3, b: 3, y1: 3.3 }]);
    m.wallZ(wx, -17, 17, 3.6, 8.4, T, 'scifiWall', [{ a: -2, b: 2, y1: 2.8 }]);
  }
  m.span(-17, 12, -17, 17, 12.4, 17, 'scifiDark');
  // Núcleo del reactor
  m.box(0, 0, 0, 4.6, 0.5, 4.6, 'scifiDark');
  m.box(0, 0.5, 0, 3.0, 11.5, 3.0, 'scifiDark', { visual: false });
  m.props.push({ type: 'core', x: 0, y: 0.5, z: 0, q: 0 });
  m.light(0, 3, 0, CY, 90, 26); m.light(0, 8, 0, CY, 70, 26);
  // Pasarela anular a 3,6 m (exterior 13, interior 10)
  const RY = 3.6;
  m.span(-13, RY - 0.2, -13, 13, RY, -10, 'scifiPanel'); m.span(-13, RY - 0.2, 10, 13, RY, 13, 'scifiPanel');
  m.span(-13, RY - 0.2, -10, -10, RY, 10, 'scifiPanel'); m.span(10, RY - 0.2, -10, 13, RY, 10, 'scifiPanel');
  // Barandillas de vidrio (interior del anillo)
  m.span(-10, RY, -10.05, 10, RY + 1.0, -9.97, 'glass'); m.span(-10, RY, 9.97, 10, RY + 1.0, 10.05, 'glass');
  m.span(-10.05, RY, -10, -9.97, RY + 1.0, 10, 'glass'); m.span(9.97, RY, -10, 10.05, RY + 1.0, 10, 'glass');
  strip(0, RY - 0.24, -9.96, 20, 0.05, 0.05); strip(0, RY - 0.24, 9.96, 20, 0.05, 0.05);
  strip(-9.96, RY - 0.24, 0, 0.05, 0.05, 20); strip(9.96, RY - 0.24, 0, 0.05, 0.05, 20);
  // Pilares
  for (const [px, pz] of [[-11.5, -11.5], [11.5, -11.5], [-11.5, 11.5], [11.5, 11.5]]) {
    m.box(px, 0, pz, 0.7, RY - 0.2, 0.7, 'scifiDark');
    strip(px, 0.4, pz + 0.36, 0.1, 2.6, 0.02, OR, 1.6);
  }
  P((s) => {
    // Rampas N/S de subida a la pasarela (junto al muro)
    m.ramp(-s * 8, 0, -s * 15, 9.5, RY, 3.4, s > 0 ? '+x' : '-x', 'scifiPanel');
    m.span(Math.min(-s * 3.25, s * 0.5), RY - 0.2, Math.min(-s * 16.7, -s * 13), Math.max(-s * 3.25, s * 0.5), RY, Math.max(-s * 16.7, -s * 13), 'scifiPanel');
    // Puentes elevados E/O hacia el corredor superior
    m.span(Math.min(s * 13, s * 17), RY - 0.2, -2, Math.max(s * 13, s * 17), RY, 2, 'scifiPanel');
    // Cobertura a nivel de suelo
    m.prop('fcrate', s * 7, 0, s * 5.5, 0); m.prop('fcrate', s * 7, 0, s * 7.0, 0);
    m.prop('console', -s * 6.5, 0, s * 6.5, 0);
    m.prop('generator', s * 14.6, 0, s * 9, 1);
    m.prop('pod', -s * 14.8, 0, s * 14.8, 0);
    m.box(s * 5.5, 0, -s * 6, 0.5, 1.3, 3.2, 'scifiPanel');
    strip(s * 5.5, 1.3, -s * 6, 0.1, 0.04, 3.2, OR, 1.5);
    // Tiras de luz de la sala
    strip(s * 16.75, 5.6, s * 9.5, 0.06, 0.12, 12, CY); strip(s * 16.75, 9, 0, 0.06, 0.12, 30, WH, 1.4);
    strip(0, 9, s * 16.75, 30, 0.12, 0.06, WH, 1.4);
    m.light(s * 11, 7.5, -s * 11, WH, 55, 22);
    m.prop('steam', s * 15, 0.2, -s * 3.5, 0);
  });

  // ================= CORREDOR CENTRAL (2 niveles) entre hangar y reactor =================
  P((s) => {
    const xa = s * 17, xb = s * 34, x0 = Math.min(xa, xb), x1 = Math.max(xa, xb);
    m.wallX(-3.2, x0, x1, 0, 7.2, T, 'scifiWall'); m.wallX(3.2, x0, x1, 0, 7.2, T, 'scifiWall');
    m.span(x0, 3.4, -3, x1, RY, 3, 'scifiPanel');                 // forjado: techo inferior / suelo superior
    m.span(x0, 7.0, -3.4, x1, 7.4, 3.4, 'scifiDark');             // techo superior
    strip((xa + xb) / 2, 3.34, -2.9, 16, 0.05, 0.08, CY); strip((xa + xb) / 2, 3.34, 2.9, 16, 0.05, 0.08, CY);
    strip((xa + xb) / 2, 6.94, 0, 15, 0.05, 0.3, WH, 1.6);
    m.light((xa + xb) / 2, 2.8, 0, CY, 22, 13); m.light((xa + xb) / 2, 6.2, 0, WH, 22, 13);
    m.prop('fcrate', s * 25.5, 0, s * 1.9, 0);
    m.box(s * 23, RY, -s * 1.7, 1.4, 1.1, 1.0, 'scifiPanel');
    // Marco de puerta al hangar
    m.wallZ(s * 34, -3, 3, 0, RY, T, 'scifiWall', [{ a: -2.4, b: 2.4, y1: 3.2 }]);
    m.wallZ(s * 34, -3, 3, RY, 3.6, T, 'scifiWall', [{ a: -2.4, b: 2.4, y1: 3.0 }]);
  });

  // ================= HANGARES (bases de equipo) =================
  P((s) => {
    const xi = s * 34, xo = s * 54;                               // interior / exterior
    const x0 = Math.min(xi, xo), x1 = Math.max(xi, xo);
    // Muro interior del hangar (hacia la estación), con puertas a los corredores norte y sur
    m.wallZ(xi, -22, -3.4, 0, 9.4, T, 'scifiWall'); m.wallZ(xi, 3.4, 22, 0, 9.4, T, 'scifiWall');
    m.wallX(-22, x0, x1, 0, 9.4, T, 'scifiWall', [{ a: s * 40 - 2, b: s * 40 + 2, y1: 3.2 }]);
    m.wallX(22, x0, x1, 0, 9.4, T, 'scifiWall', [{ a: s * 40 - 2, b: s * 40 + 2, y1: 3.2 }]);
    m.span(x0, 9.4, -22, x1, 9.8, 22, 'scifiDark');
    // Balcón elevado + rampa de acceso
    m.span(Math.min(xi, xi + s * 4.5), RY - 0.2, -8, Math.max(xi, xi + s * 4.5), RY, 8, 'scifiPanel');
    m.span(Math.min(xi + s * 4.45, xi + s * 4.55), RY, -8, Math.max(xi + s * 4.45, xi + s * 4.55), RY + 1.0, 8, 'glass');
    m.ramp(xi + s * 2.4, 0, s * 12.75, 3.4, RY, 9.5, s > 0 ? '-z' : '+z', 'scifiPanel');
    m.box(xi + s * 1.0, 0, -s * 7.4, 0.7, RY - 0.2, 0.7, 'scifiDark'); m.box(xi + s * 4.1, 0, -s * 7.4, 0.7, RY - 0.2, 0.7, 'scifiDark');
    // Nave de descenso, cajas y generadores
    m.prop('dropship', s * 46.5, 0, -s * 11, 0);
    m.prop('fcrate', s * 42, 0, s * 4, 0); m.prop('fcrate', s * 43.5, 0, s * 4.3, 0); m.prop('fcrate', s * 42.6, 1.1, s * 4.1, 0);
    m.prop('generator', s * 51, 0, s * 16, 1);
    m.prop('fcrate', s * 40, 0, -s * 3, 0);
    m.box(s * 46, 0, s * 12, 3.2, 1.25, 0.5, 'scifiPanel'); strip(s * 46, 1.25, s * 12, 3.2, 0.04, 0.1, OR, 1.5);
    m.box(s * 44, 0, -s * 18, 0.5, 1.25, 3.2, 'scifiPanel');
    // Marcas de peligro y luces
    m.span(Math.min(s * 41, s * 52), 0, -s * 16 - 5.2, Math.max(s * 41, s * 52), 0.012, -s * 16 + 5.2 + (s > 0 ? 0 : 0), 'hazard', { collide: false });
    strip(xo - s * 0.42, 6.5, 0, 0.06, 0.2, 40, s > 0 ? RD : CY, 1.8);
    strip((xi + xo) / 2, 9.36, -s * 11, 14, 0.05, 0.5, WH, 2.0); strip((xi + xo) / 2, 9.36, s * 11, 14, 0.05, 0.5, WH, 2.0);
    m.light(s * 44, 7.6, -s * 10, WH, 80, 26); m.light(s * 44, 7.6, s * 10, WH, 80, 26);
    m.light(xo - s * 2, 3, 0, s > 0 ? RD : CY, 30, 16);
  });

  // ================= CORREDORES NORTE Y SUR (laboratorios / servidores) =================
  P((s) => {
    const zi = -s * 22, zo = -s * 40;                             // borde interior / exterior
    const z0 = Math.min(zi, zo), z1 = Math.max(zi, zo), zc = -s * 31;
    m.span(-54, Hc, z0, 54, Hc + 0.4, z1, 'scifiDark');           // techo
    // Muro interior entre corredor y bloques técnicos / sala del reactor
    m.wallX(zi, -34, -17, 0, Hc, T, 'scifiWall'); m.wallX(zi, 17, 34, 0, Hc, T, 'scifiWall');
    m.wallX(zi, -17, 17, 0, Hc, T, 'scifiWall', [{ a: -2.2, b: 2.2, y1: 3.2 }]);
    // Pasillo de enlace sala-corredor (entre z=±17 y z=±22)
    m.wallZ(-2.4, Math.min(-s * 17, zi), Math.max(-s * 17, zi), 0, Hc, T, 'scifiWall'); m.wallZ(2.4, Math.min(-s * 17, zi), Math.max(-s * 17, zi), 0, Hc, T, 'scifiWall');
    m.span(-2.6, Hc, Math.min(-s * 17, zi), 2.6, Hc + 0.4, Math.max(-s * 17, zi), 'scifiDark');
    strip(0, Hc - 0.06, -s * 19.5, 0.3, 0.05, 4.4, CY);
    m.light(0, 3.2, -s * 19.5, CY, 16, 10);
    // Laboratorio acristalado (lado exterior), con isla central
    const lx = -s * 20;
    m.wallX(zc - s * 1.2, lx - 9, lx + 9, 0, Hc, 0.25, 'scifiPanel', [
      { a: lx - 8, b: lx - 3, y0: 0.9, y1: 3.0, glass: true }, { a: lx - 1.1, b: lx + 1.1, y1: 3.0 }, { a: lx + 3, b: lx + 8, y0: 0.9, y1: 3.0, glass: true }]);
    m.wallZ(lx - 9, Math.min(zc - s * 1.2, zo), Math.max(zc - s * 1.2, zo), 0, Hc, 0.25, 'scifiPanel');
    m.wallZ(lx + 9, Math.min(zc - s * 1.2, zo), Math.max(zc - s * 1.2, zo), 0, Hc, 0.25, 'scifiPanel', [{ a: zc - s * 5 - 1, b: zc - s * 5 + 1, y1: 3.0 }]);
    m.prop('holotable', lx, 0, zc - s * 5, 0);
    m.prop('pod', lx - s * 7.6, 0, zo + s * 1.6, 0); m.prop('pod', lx - s * 5.6, 0, zo + s * 1.6, 0);
    m.prop('console', lx + s * 5, 0, zo + s * 1.3, 0);
    m.light(lx, 3.4, zc - s * 5, 0x8affd0, 30, 14);
    strip(lx, Hc - 0.06, zc - s * 5, 12, 0.05, 0.4, 0x8affd0, 1.6);
    // Sala de servidores (lado opuesto del mismo corredor)
    const sx = s * 20;
    for (let i = -2; i <= 2; i++) { m.prop('rack', sx + i * 2.4, 0, zo + s * 2.2, 0); if (i % 2) m.prop('rack', sx + i * 2.4, 0, zc - s * 2.2, 0); }
    m.light(sx, 3.4, zc - s * 3, OR, 26, 14);
    strip(sx, Hc - 0.06, zc - s * 4, 12, 0.05, 0.3, OR, 1.6);
    // Cobertura en el corredor
    m.prop('fcrate', -s * 6, 0, zi - s * 1.4, 0); m.prop('fcrate', s * 8, 0, zc + s * 2.5, 0);
    m.box(s * 2, 0, zc, 0.5, 1.25, 3, 'scifiPanel'); m.box(-s * 33, 0, zc - s * 2, 3, 1.25, 0.5, 'scifiPanel');
    m.prop('console', s * 30, 0, zi - s * 0.9, 2);
    m.prop('steam', -s * 9, 0.2, zo + s * 0.8, 0);
    // Tira de guía del corredor
    strip(0, Hc - 0.06, zi - s * 3.2, 104, 0.05, 0.25, WH, 1.5);
    strip(0, 0.02, zi - s * 0.4, 104, 0.02, 0.08, CY, 1.4);
    for (const x of [-44, -28, -10, 10, 28, 44]) m.light(x, 3.4, zc + s * 3, WH, 20, 13);
    // Bloques técnicos macizos entre corredor central y corredores laterales
    m.span(Math.min(-s * 17, -s * 34), 0, Math.min(-s * 3.4, zi), Math.max(-s * 17, -s * 34), 9, Math.max(-s * 3.4, zi), 'scifiWall', {});
    m.span(Math.min(s * 17, s * 34), 0, Math.min(-s * 3.4, zi), Math.max(s * 17, s * 34), 9, Math.max(-s * 3.4, zi), 'scifiWall', {});
  });

  // ---- Hologramas decorativos ----
  m.prop('holo', -20, 1.0, -36, 0); m.prop('holo', 20, 1.0, 36, 0);

  // ---- Spawns ----
  for (const z of [-18, -13, -6, -2, 2, 6, 14, 19]) {
    m.spawn('a', -51, 0.1, z, -Math.PI / 2);
    m.spawn('b', 51, 0.1, -z, Math.PI / 2);
  }
  P((s) => {
    m.spawn('ffa', s * 51, 0.1, s * 18); m.spawn('ffa', s * 50, 0.1, -s * 36); m.spawn('ffa', s * 38, 0.1, s * 36);
    m.spawn('ffa', s * 14, 0.1, s * 14); m.spawn('ffa', s * 4, 0.1, s * 36); m.spawn('ffa', s * 28, 0.1, -s * 30);
    m.spawn('ffa', s * 20, 0.1, s * 0); m.spawn('ffa', s * 11.5, 3.7, -s * 6);
  });

  m.zone('A', -26, 0, -28, 4.5);
  m.zone('B', 0, 0, 0, 8.5);
  m.zone('C', 26, 0, 28, 4.5);
  return m;
}
