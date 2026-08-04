import { defineConfig, type Plugin } from 'vite';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

/**
 * Lets `tools/roomshot.ts` write its contact sheets to `shots/`. Dev only - the
 * review tool is not part of the game, and nothing in `src/` knows it exists.
 * See docs/art/ROOM_REVIEW.md.
 */
function roomshotSave(): Plugin {
  const root = r('./shots');

  return {
    name: 'roomshot-save',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__roomshot/save', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end('POST only');
          return;
        }

        const chunks: Buffer[] = [];
        req.on('data', (chunk: Buffer) => chunks.push(chunk));
        req.on('end', () => {
          void (async () => {
            try {
              const { file, data } = JSON.parse(Buffer.concat(chunks).toString()) as { file: string; data: string };
              // Stay inside shots/: this middleware runs with the dev server's
              // full file permissions.
              if (!/^[\w-]+(\/[\w-]+)*\.png$/.test(file)) throw new Error(`unsafe file name "${file}"`);

              const target = join(root, file);
              await mkdir(dirname(target), { recursive: true });
              await writeFile(target, Buffer.from(data, 'base64'));

              res.setHeader('content-type', 'application/json');
              res.end(JSON.stringify({ written: target }));
            } catch (error) {
              res.statusCode = 400;
              res.end(error instanceof Error ? error.message : String(error));
            }
          })();
        });
      });
    },
  };
}

export default defineConfig({
  root: '.',
  publicDir: 'assets',
  plugins: [roomshotSave()],
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
