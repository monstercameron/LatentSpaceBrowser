import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './',
  // A local .env in the repository root may hold VITE_APIKEY for development.
  // It is only read by the dev server: production builds never include it.
  envDir: '../',
  build: {
    outDir: '../docs', // served by GitHub Pages
    emptyOutDir: true,
  },
});
