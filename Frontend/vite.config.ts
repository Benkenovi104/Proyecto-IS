import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // La API corre en el puerto 3001; el proxy evita problemas de CORS en desarrollo
    proxy: { '/api': 'http://localhost:3001' },
  },
});
