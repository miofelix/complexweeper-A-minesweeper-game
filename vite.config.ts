import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';
import { writeServiceWorker } from './scripts/build-service-worker';

let workerOutputDir: string;
let workerTemplatePath: string;

export default defineConfig({
  base: './',
  plugins: [{
    name: 'precache-production-build',
    apply: 'build',
    configResolved(config) {
      workerOutputDir = resolve(config.root, config.build.outDir);
      workerTemplatePath = resolve(config.publicDir, 'sw.js');
    },
    async closeBundle() {
      await writeServiceWorker(workerOutputDir, workerTemplatePath);
    },
  }],
  build: {
    target: 'es2020',
    outDir: 'dist',
  },
  test: {
    environment: 'node',
  },
});
