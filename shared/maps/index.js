// Registro de mapas. Añadir un mapa = un módulo con buildXxx() + una entrada aquí.
import { buildModern } from './modern.js';
import { buildHistoric } from './historic.js';
import { buildFuturistic } from './futuristic.js';
import { buildTraining } from './training.js';

export const MAPS = {
  modern: { id: 'modern', name: 'DISTRITO 7', tag: 'MODERNO', build: buildModern, desc: 'Cruce urbano al atardecer: oficinas, viviendas y zona industrial.' },
  historic: { id: 'historic', name: 'LÍNEA DE HIERRO · 1944', tag: 'HISTÓRICO', build: buildHistoric, desc: 'Trincheras, un pueblo en ruinas y un campanario entre la niebla.' },
  futuristic: { id: 'futuristic', name: 'ESTACIÓN HELIOS', tag: 'FUTURISTA', build: buildFuturistic, desc: 'Reactor de fusión, pasarelas elevadas y hangares de neón.' },
  training: { id: 'training', name: 'CAMPO DE TIRO', tag: 'ENTRENAMIENTO', build: buildTraining, desc: 'Galería de tiro y casa de asalto.', hidden: true },
};
export const PLAYABLE_MAPS = ['modern', 'historic', 'futuristic'];

const cache = new Map();
/** Devuelve la definición del mapa ya construida (con caché). */
export function getMapDef(id) {
  if (!cache.has(id)) cache.set(id, MAPS[id].build());
  return cache.get(id);
}
