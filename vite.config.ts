import { defineConfig, loadEnv } from "vite";

function assertProductionServerUrl(raw: string | undefined): void {
  const value = raw?.trim();
  if (!value) {
    throw new Error(
      "Production builds require VITE_SERVER_URL (for example, wss://metrophage-server.wendellphillips.workers.dev/ws).",
    );
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`Production VITE_SERVER_URL is not a valid URL: ${value}`);
  }

  if (url.protocol !== "wss:") {
    throw new Error(`Production VITE_SERVER_URL must use wss://, received: ${value}`);
  }

  const host = url.hostname.toLowerCase();
  const loopback =
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host === "0.0.0.0" ||
    host === "::" ||
    host === "::1" ||
    /^127(?:\.\d{1,3}){3}$/.test(host);
  if (loopback) {
    throw new Error(`Production VITE_SERVER_URL cannot target localhost or loopback: ${value}`);
  }
}

// METROPHAGE — Phase 0 vertical slice.
// Single-page browser game, no backend. Phaser is heavy, so give it its own chunk.
export default defineConfig(({ command, mode }) => {
  if (command === "build" && mode === "production") {
    const env = loadEnv(mode, process.cwd(), "");
    assertProductionServerUrl(env.VITE_SERVER_URL);
  }

  return {
    // Relative asset URLs so the static build runs from any path — domain root
    // (Cloudflare Pages / Netlify) OR a subpath / itch.io zip (which serves from a CDN root).
    base: "./",
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
  };
});
