# Hogar 3D de DuoLector — código fuente

La versión publicada está en `/hogar/` (generada con `npm run build` desde esta carpeta).

- `src/room.js` — la habitación (día y noche, ventana, sillón, marcos, biblioteca).
- `src/avatar.js` — personas (Quaternius Universal Base Characters + Universal Animation Library, CC0) con ropa generada como capa de tela.
- `src/robot.js` — Lumi, el robot propio de DuoLector.
- `src/net.js` — conexión en vivo por Supabase Realtime (nada se guarda en el servidor); fotos sólo en IndexedDB de cada dispositivo.
- `build-assets.mjs` — prepara los modelos CC0 (texturas WebP 1024, sólo las animaciones usadas). Necesita los paquetes originales en `raw/`.

Prueba local entre dos pestañas sin servidor: `/hogar/?local=1`.
