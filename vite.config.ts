import { defineConfig } from "vite";

// METROPHAGE — Phase 0 vertical slice.
// Single-page browser game, no backend. Phaser is heavy, so give it its own chunk.
export default defineConfig({
  server: {
    host: true,
    port: 5173,
  },
  build: {
    target: "es2020",
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      output: {
        manualChunks: {
          phaser: ["phaser"],
        },
      },
    },
  },
});
