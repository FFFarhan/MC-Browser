import { defineConfig } from 'vite';
import { deploymentBase } from './src/platform/deploymentBase.ts';

export default defineConfig({
  appType: 'spa',
  base: deploymentBase(process.env['GITHUB_ACTIONS'] === 'true', process.env['GITHUB_REPOSITORY']),
  build: {
    sourcemap: false,
    target: 'baseline-widely-available',
    assetsInlineLimit: 0,
  },
  worker: {
    format: 'es',
  },
});
