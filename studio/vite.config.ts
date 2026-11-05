import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * The Creator Studio: a separate private site built from this folder.
 * Cloudflare Pages project "skars-elysium-studio" uses `studio` as its root
 * directory, so it picks up studio/functions (the API) and studio/dist.
 */
const here = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  root: here,
  plugins: [react()],
  build: {
    outDir: `${here}dist`,
    emptyOutDir: true,
    target: 'es2022',
  },
  server: {
    port: 5180,
    // `npm run studio:local` serves the API on 8788; the page proxies to it while developing.
    proxy: { '/api': 'http://localhost:8788' },
  },
});
