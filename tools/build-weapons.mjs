// Genera src/assets/weapons.glb con Blender a partir de las recetas de src/weapons/WeaponModels.js.
// Uso: npm run armas            (BLENDER=ruta\blender.exe para otra instalación)
import { writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { weaponSpecs } from '../src/weapons/WeaponModels.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const specPath = join(root, 'tools', 'blender', 'weapon-specs.json');
const outPath = join(root, 'src', 'assets', 'weapons.glb');
const candidates = [process.env.BLENDER, 'C:\\Program Files\\Blender Foundation\\Blender 5.3\\blender.exe', '/Applications/Blender.app/Contents/MacOS/Blender', 'blender'].filter(Boolean);
const blender = candidates.find((p) => p === 'blender' || existsSync(p));

const specs = weaponSpecs();
mkdirSync(dirname(specPath), { recursive: true }); mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(specPath, JSON.stringify(specs));
const nOps = Object.values(specs).reduce((s, w) => s + w.ops.length, 0);
console.log(`Recetas: ${Object.keys(specs).length} armas, ${nOps} piezas → ${specPath}`);

console.log(`Blender: ${blender}`);
const t0 = Date.now();
execFileSync(blender, ['-b', '--factory-startup', '--python', join(root, 'tools', 'blender', 'build_weapons.py'), '--', specPath, outPath], { stdio: 'inherit' });
console.log(`Listo en ${((Date.now() - t0) / 1000).toFixed(1)} s · ${(statSync(outPath).size / 1024).toFixed(0)} KB → ${outPath}`);
