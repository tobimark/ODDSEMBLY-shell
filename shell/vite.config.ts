import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

/**
 * The shell talks to the ODDSEMBLY bridge through a same-origin `/api` prefix,
 * so the browser never needs a CORS exception and never sees OpenCode
 * credentials. `npm run bridge` must be running for live data.
 *
 * The Loom Game View is the engine from `../src` (repo root), mounted as-is: one
 * alias, no copy, so the scene and its standalone page never diverge.
 */
const LOOM_SRC = fileURLToPath(new URL('../src', import.meta.url));
const WORKSPACE = fileURLToPath(new URL('..', import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@loom': LOOM_SRC },
  },
  server: {
    port: 5180,
    strictPort: true,
    host: '127.0.0.1',
    // The engine lives outside this project root.
    fs: { allow: [WORKSPACE] },
    watch: {
      // Edits in this workspace land via atomic replace (ReplaceFileW), which
      // Windows FS events can miss — polling keeps HMR from silently serving a
      // stale module. `.tmp` holds throwaway browser profiles, so ignore it:
      // their constant churn used to trigger page reloads mid-interaction.
      usePolling: true,
      interval: 250,
      ignored: ['**/.tmp/**', '**/dist/**'],
    },
    proxy: {
      '/api': {
        target: process.env.BRIDGE_URL || 'http://127.0.0.1:8788',
        changeOrigin: false,
        // SSE needs the connection held open; Vite's proxy passes it through.
        timeout: 0,
        proxyTimeout: 0,
      },
    },
  },
  preview: {
    port: 4180,
    strictPort: true,
    host: '127.0.0.1',
    fs: { allow: [WORKSPACE] },
    proxy: {
      '/api': {
        target: process.env.BRIDGE_URL || 'http://127.0.0.1:8788',
        changeOrigin: false,
        timeout: 0,
        proxyTimeout: 0,
      },
    },
  },
  build: { outDir: 'dist', assetsInlineLimit: 0 },
});
