import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  // A local .env in the repository root may hold VITE_APIKEY for development only.
  // The app reads it in dev builds and never in production.
  envDir: '../',
});
