import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    watch: {
      /**
       * Vite's default ignore list covers `node_modules` and `.git` only.
       * This repo keeps several artefact trees at the root — `.tmp/` alone can
       * hold tens of thousands of throwaway browser-profile files (measured at
       * 295k files / 56 GB in one workspace) — and an unignored watcher crawls
       * all of them. That starves the dev server: it accepts the TCP connection
       * but never answers a request, while burning gigabytes of RAM.
       *
       * These are outputs of scripts in `scripts/`, never sources. `shell/` is a
       * separate Vite project with its own server, so the lab does not need to
       * watch it either.
       */
      ignored: [
        '**/.tmp/**',
        '**/.tmp-*/**',
        '**/dist/**',
        '**/shots/**',
        '**/review/**',
        '**/shell/**',
      ],
    },
  },
  preview: { host: '127.0.0.1', port: 4173 },
  build: { target: 'es2022' },
});
