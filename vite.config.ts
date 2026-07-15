import { defineConfig, loadEnv, type Plugin } from "vite";
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { nodePolyfills } from "vite-plugin-node-polyfills";

/** Keep in lockstep with `export const PROTOCOL_VERSION` in src/net/protocol.ts. */
function readProtocolVersion(): number {
  try {
    const src = readFileSync(resolve(process.cwd(), "src/net/protocol.ts"), "utf8");
    const m = src.match(/export const PROTOCOL_VERSION\s*=\s*(\d+)/);
    if (m) return Number(m[1]);
  } catch {
    /* fall through */
  }
  return 4;
}

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

  const buildId =
    process.env.CF_PAGES_COMMIT_SHA ||
    process.env.GITHUB_SHA ||
    process.env.VITE_BUILD_ID ||
    `local-${Date.now().toString(36)}`;
  const buildTime = new Date().toISOString();

  const protocolVersion = readProtocolVersion();
  const versionPayload = () =>
    JSON.stringify(
      {
        buildId,
        protocol: protocolVersion,
        time: buildTime,
      },
      null,
      0,
    );

  /** Emit /version.json so long-lived tabs can detect a new client ship without hard refresh. */
  const metroVersionPlugin = (): Plugin => ({
    name: "metro-version-json",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split("?")[0] ?? "";
        if (url === "/version.json") {
          res.setHeader("Content-Type", "application/json");
          res.setHeader("Cache-Control", "no-store");
          res.end(versionPayload());
          return;
        }
        next();
      });
    },
    closeBundle() {
      try {
        const outDir = resolve(process.cwd(), "dist");
        mkdirSync(outDir, { recursive: true });
        writeFileSync(resolve(outDir, "version.json"), versionPayload() + "\n");
      } catch (e) {
        console.warn("[metro-version-json] write failed", e);
      }
    },
  });

  return {
    // Relative asset URLs so the static build runs from any path — domain root
    // (Cloudflare Pages / Netlify) OR a subpath / itch.io zip (which serves from a CDN root).
    base: "./",
    define: {
      __BUILD_ID__: JSON.stringify(buildId),
      __BUILD_TIME__: JSON.stringify(buildTime),
    },
    plugins: [
      // WalletConnect / noble crypto need Node buffer + process shims in the browser.
      nodePolyfills({
        include: ["buffer", "process", "util", "stream", "events"],
        globals: { Buffer: true, global: true, process: true },
      }),
      metroVersionPlugin(),
    ],
    server: {
      host: true,
      port: 5173,
    },
    build: {
      target: "es2020",
      chunkSizeWarningLimit: 2000,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes("node_modules/phaser")) return "phaser";
            if (id.includes("node_modules/@walletconnect") || id.includes("node_modules/@reown")) {
              return "walletconnect";
            }
          },
        },
      },
    },
  };
});
