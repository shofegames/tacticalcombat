// Validación automática de mapas: colisiones, spawns libres y conectividad de la navegación.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAPS, getMapDef } from '../shared/maps/index.js';
import { NavGraph } from '../shared/nav.js';
import { BODY } from '../shared/collision.js';

for (const id of Object.keys(MAPS)) {
  test(`mapa ${id}: spawns libres, zonas y navegación conectadas`, () => {
    const def = getMapDef(id);
    const world = def.buildCollision();
    const nav = new NavGraph(world, { seeds: [...def.spawns.a, ...def.spawns.b, ...def.spawns.ffa] });
    assert.ok(nav.nodes.length > 500, 'el grafo de navegación tiene nodos');
    const pts = [];
    for (const team of ['a', 'b', 'ffa']) for (const s of def.spawns[team]) {
      assert.ok(world.fits(s.x, s.y, s.z, BODY.radius, BODY.standH), `spawn ${team} bloqueado en ${s.x},${s.y},${s.z}`);
      pts.push({ ...s, label: `spawn ${team}` });
    }
    for (const z of def.zones) pts.push({ ...z, label: `zona ${z.name}` });
    for (const d of def.dummies) pts.push({ ...d, label: 'dummy' });
    const origin = nav.nearest(pts[0].x, pts[0].y, pts[0].z);
    assert.ok(origin, 'nodo de origen');
    for (const p of pts) {
      const n = nav.nearest(p.x, p.y, p.z);
      assert.ok(n && Math.hypot(n.x - p.x, n.z - p.z) < 4 && Math.abs(n.y - p.y) < 1, `${p.label} sin nodo cercano (${p.x},${p.y},${p.z})`);
      const there = nav.findPath(origin, n, null, 60000), back = nav.findPath(n, origin, null, 60000);
      assert.ok(there, `${p.label} inalcanzable (${p.x},${p.y},${p.z})`);
      assert.ok(back, `sin ruta de vuelta desde ${p.label} (${p.x},${p.y},${p.z})`);
    }
  });
}

test('alturas alcanzables: azoteas, pasarelas, campanario y trincheras', () => {
  const cases = [
    ['modern', [-30, 7.05, -23], 'azotea de oficinas'], ['modern', [30, 7.05, 23], 'azotea de viviendas'],
    ['modern', [-40, 3.2, 33], 'pasarela del almacén'], ['modern', [-9.6, 2.6, 23], 'techo del contenedor'],
    ['historic', [0, 7.2, -37.8], 'campanario'], ['historic', [-33, -1.7, -15], 'trinchera oeste'], ['historic', [29, -1.7, 0], 'trinchera este'],
    ['historic', [-20, 2, 28], 'colina del búnker'], ['historic', [0, 3.2, 27], 'planta alta de la granja'],
    ['futuristic', [11.5, 3.6, 0], 'pasarela del reactor'], ['futuristic', [-25, 3.6, 0], 'corredor superior'], ['futuristic', [36, 3.6, -5], 'balcón del hangar'],
  ];
  for (const [id, [x, y, z], label] of cases) {
    const def = getMapDef(id), nav = new NavGraph(def.buildCollision(), { seeds: def.spawns.a });
    const s = def.spawns.a[0], a = nav.nearest(s.x, s.y, s.z), b = nav.nearest(x, y, z);
    assert.ok(b && Math.abs(b.y - y) < 0.6 && Math.hypot(b.x - x, b.z - z) < 3, `${label}: no hay nodo en esa altura (encontrado ${b && [b.x, b.y, b.z]})`);
    assert.ok(nav.findPath(a, b, null, 80000), `${label}: inalcanzable desde el spawn`);
  }
});
