// Rutas relativas: el mismo build funciona en GitHub Pages (https://<usuario>.github.io/<repo>/),
// en cualquier subcarpeta de un servidor y en las copias de «versiones tactic».
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: { chunkSizeWarningLimit: 1200 },
});
