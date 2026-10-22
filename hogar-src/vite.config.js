import { defineConfig } from 'vite';
import fs from 'fs';
// Reutiliza la URL y la clave pública (anon) que ya usa la app principal,
// así no se copia a mano ninguna credencial en el código del Hogar.
const idx = fs.readFileSync('../duolectorpc/index.html', 'utf8');
const url = (idx.match(/SUPABASE_URL:'([^']+)'/) || [])[1] || '';
const key = (idx.match(/SUPABASE_KEY:'([^']+)'/) || [])[1] || '';
export default defineConfig({
  base: '/hogar/',
  define: { __SB_URL__: JSON.stringify(url), __SB_KEY__: JSON.stringify(key) },
  build: { outDir: '../duolectorpc/hogar', emptyOutDir: true, chunkSizeWarningLimit: 1200 },
  server: { port: 4370 },
});
