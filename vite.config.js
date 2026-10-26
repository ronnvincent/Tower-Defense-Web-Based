import { defineConfig } from 'vitest/config';

// The duel relay (`npm run pvp:relay`) sits behind the same origin as the game,
// so a phone that only knows the page URL can still reach it. Both the dev
// server and `vite preview` need this: two-device duels are usually tested on
// the preview URL, not on localhost.
const pvpProxy = {
  '/pvp': { target: 'ws://127.0.0.1:8787', ws: true, changeOrigin: true },
};

// The local ledger stand-in (`npm run cloud:dev`, server/cloud-dev.mjs). It
// speaks the same seven-function contract as the Supabase migration, so the
// page only ever talks to its own origin and the preview works without a
// Supabase project. A real project is configured with VITE_SUPABASE_URL +
// VITE_SUPABASE_ANON_KEY and never touches this path.
const cloudProxy = {
  '/supabase-dev': { target: 'http://127.0.0.1:8791', changeOrigin: true },
};

export default defineConfig({
  // Relative base so the production build works from any sub-folder
  // (e.g. GitHub Pages or opening dist/ through a static file server).
  base: './',
  server: {
    open: false,
    // Allow proxied preview hosts (e.g. *.e2b.app) to reach the dev server.
    allowedHosts: true,
    proxy: { ...pvpProxy, ...cloudProxy },
    watch: {
      ignored: ['**/*.zip', '**/src/assets/**', '**/scripts/**'],
    },
  },
  preview: {
    open: false,
    // Same public-preview contract as `dev`, plus the relay path.
    allowedHosts: true,
    proxy: { ...pvpProxy, ...cloudProxy },
  },
  build: {
    outDir: 'dist',
    // Phaser is large (~1.2 MB minified); split it into its own cached chunk.
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      output: {
        manualChunks: {
          phaser: ['phaser'],
        },
      },
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
  },
});
