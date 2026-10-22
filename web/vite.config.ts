import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// Si VITE_API_URL no está definido, el frontend usa el simulador de src/lib/mock.ts.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const api = env.VITE_API_URL ?? '';
  const mapsProxyTarget = /^https?:\/\//.test(api) ? api : 'http://127.0.0.1:8000';
  const mapTestMode = (env.MAP_TEST_MODE ?? env.VITE_MAP_TEST_MODE ?? '').trim().toLowerCase() === 'true';
  return {
  plugins: [react()],
  define: { __MAP_TEST_MODE__: JSON.stringify(mapTestMode) },
  // Prioriza los fuentes frente a .js emitidos junto a los .tsx por herramientas externas.
  resolve: { extensions: ['.mjs', '.ts', '.tsx', '.js', '.jsx', '.json'] },
  optimizeDeps: {
    exclude: ['maplibre-gl'],
  },
  server: {
    port: 5180,
    // El navegador usa el mismo origen incluso si Vite cambia de puerto.
    proxy: {
      ...(/^https?:\/\//.test(api) ? {
        '/__yachi_api': { target: api, changeOrigin: true, rewrite: (path: string) => path.replace(/^\/__yachi_api/, '') },
      } : {}),
      '/__maps_api': { target: mapsProxyTarget, changeOrigin: true, rewrite: (path: string) => path.replace(/^\/__maps_api/, '') },
    },
  },
  preview: {
    proxy: {
      '/__maps_api': { target: mapsProxyTarget, changeOrigin: true, rewrite: (path: string) => path.replace(/^\/__maps_api/, '') },
    },
  },
  };
});
