import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Si VITE_API_URL no está definido, el frontend usa el simulador de src/lib/mock.ts.
export default defineConfig({
  plugins: [react()],
  server: { port: 5180 },
});
