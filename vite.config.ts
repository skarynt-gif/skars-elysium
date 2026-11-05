import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * When the live song list comes from R2 (VITE_CONTENT_URL set), the local
 * public/content folder is only a staging area for `npm run publish-media`,
 * so it is left out of the deployed site.
 */
function excludeLocalContent(enabled: boolean): Plugin {
  let outDir = 'dist';
  return {
    name: 'exclude-local-content',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      if (enabled) rmSync(resolve(outDir, 'content'), { recursive: true, force: true });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  return {
    plugins: [react(), excludeLocalContent(Boolean(env.VITE_CONTENT_URL))],
    server: {
      // Lets phones on the same Wi-Fi open the dev server for real-device testing.
      host: true,
    },
    build: {
      target: 'es2022',
      // Keep Three.js and React in their own cached chunks so game-code updates
      // don't force visitors to re-download the engine.
      rollupOptions: {
        output: {
          manualChunks: {
            three: ['three'],
            r3f: ['@react-three/fiber', '@react-three/drei'],
            react: ['react', 'react-dom'],
          },
        },
      },
    },
  };
});
