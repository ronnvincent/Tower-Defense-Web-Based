import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative base so the production build works from any sub-folder
  // (e.g. GitHub Pages or opening dist/ through a static file server).
  base: './',
  server: {
    open: false,
    watch: {
      ignored: ['**/*.zip', '**/src/assets/**', '**/scripts/**'],
    },
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
