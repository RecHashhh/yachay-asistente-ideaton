import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// Si VITE_API_URL no está definido, el frontend usa el simulador de src/lib/mock.ts.
export default defineConfig(({ mode }) => {
  const api = loadEnv(mode, process.cwd(), 'VITE_').VITE_API_URL ?? '';
  return {
  plugins: [react()],
  // Prioriza los fuentes frente a .js emitidos junto a los .tsx por herramientas externas.
  resolve: { extensions: ['.mjs', '.ts', '.tsx', '.js', '.jsx', '.json'] },
  server: {
    port: 5180,
    // El navegador usa el mismo origen incluso si Vite cambia de puerto.
    proxy: /^https?:\/\//.test(api) ? {
      '/__yachi_api': { target: api, changeOrigin: true, rewrite: (path) => path.replace(/^\/__yachi_api/, '') },
    } : undefined,
  },
  };
});
