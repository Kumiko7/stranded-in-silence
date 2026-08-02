import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  root: '.',
  publicDir: 'assets',
  resolve: {
    alias: {
      '@': r('./src'),
      '@art': r('./art'),
      '@config': r('./config'),
      '@shared': r('./src/shared'),
    },
  },
  server: {
    port: 5173,
    strictPort: false,
  },
  build: {
    outDir: 'dist',
    target: 'es2022',
    sourcemap: true,
    chunkSizeWarningLimit: 1500,
  },
});
