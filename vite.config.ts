import { defineConfig } from 'vite';

export default defineConfig({
  appType: 'spa',
  build: {
    sourcemap: false,
    target: 'baseline-widely-available',
    assetsInlineLimit: 0,
  },
  worker: {
    format: 'es',
  },
});
