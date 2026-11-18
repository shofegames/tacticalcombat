// Guarda la versión actual del juego en «versiones tactic/»:
//   versiones tactic/v<versión> (<fecha>)/TACTICAL COMBAT v<versión>.html  ← se abre con doble clic
//   versiones tactic/v<versión> (<fecha>)/NOTAS.txt                         ← commit y cambios
// El HTML lleva el JS y el CSS incrustados, así funciona sin servidor (file://).
// Uso: npm run guardar-version        (añade --forzar para sobrescribir una versión existente)
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const version = pkg.version.replace(/\.0$/, '');
const d = new Date(), fecha = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const baseDir = join(root, 'versiones tactic');
const forzar = process.argv.includes('--forzar');

const previa = existsSync(baseDir) && readdirSync(baseDir).find((d) => d.startsWith(`v${version} (`));
if (previa && !forzar) {
  console.error(`La versión v${version} ya existe en «versiones tactic/${previa}».`);
  console.error('Sube "version" en package.json para guardar una nueva, o usa --forzar para sobrescribirla.');
  process.exit(1);
}
const outDir = join(baseDir, previa || `v${version} (${fecha})`);

const sh = (cmd) => { try { return execSync(cmd, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(); } catch { return ''; } };

console.log(`Compilando TACTICAL COMBAT v${version}…`);
execSync('npx vite build --logLevel warn', { cwd: root, stdio: 'inherit' });

// Incrusta los recursos de dist/ dentro del HTML.
const dist = join(root, 'dist');
let html = readFileSync(join(dist, 'index.html'), 'utf8');
html = html.replace(/<link rel="stylesheet"[^>]*href="\/?([^"]+\.css)"[^>]*>/g, (_, f) => `<style>\n${readFileSync(join(dist, f), 'utf8')}\n</style>`);
html = html.replace(/<script type="module"[^>]*src="\/?([^"]+\.js)"[^>]*><\/script>/g, (_, f) => {
  const js = readFileSync(join(dist, f), 'utf8').replace(/<\/script/gi, '<\\/script');
  return `<script type="module">\n${js}\n</script>`;
});
if (/src="\/?assets\//.test(html) || /href="\/?assets\//.test(html)) throw new Error('Quedaron recursos sin incrustar en el HTML.');

mkdirSync(outDir, { recursive: true });
const file = join(outDir, `TACTICAL COMBAT v${version}.html`);
writeFileSync(file, html);

const commit = sh('git log -1 --format="%h · %ad · %s" --date=short');
const sucio = sh('git status --porcelain -- src shared index.html package.json');
const cambios = sh('git log -1 --format=%b').split('\n').filter((l) => l.startsWith('- ') || l.startsWith('  ')).join('\n');
writeFileSync(join(outDir, 'NOTAS.txt'), [
  `TACTICAL COMBAT v${version}`,
  `Guardada: ${fecha}`,
  `Commit: ${commit || '(sin git)'}${sucio ? '  + cambios sin commitear' : ''}`,
  '',
  'Cómo jugar: abre el archivo .html con Chrome, Edge o Firefox (doble clic).',
  'Hace falta conexión solo para las fuentes tipográficas; el resto funciona sin internet.',
  '',
  cambios ? `Cambios de esta versión:\n${cambios}` : '',
].join('\n'));

console.log(`Versión guardada en: versiones tactic/${outDir.split(/[\\/]/).pop()}/`);
console.log(`Tamaño: ${(Buffer.byteLength(html) / 1024 / 1024).toFixed(2)} MB`);
