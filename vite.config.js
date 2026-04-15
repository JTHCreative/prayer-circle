import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// On GitHub Pages the app lives at https://<user>.github.io/prayer-circle/,
// so production builds need a base path. Local dev stays on '/'.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/prayer-circle/' : '/',
  plugins: [react()],
  build: {
    outDir: 'dist'
  }
}));
