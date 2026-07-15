// METROPHAGE — keep long-lived tabs on the live client after deploys.
// Stale Pages caches / open tabs after a Worker+client ship used to leave runners
// "stuck out of multiplayer" (protocol half-break or silent reconnect death).
// This module: polls same-origin version.json + server /health, then hard-reloads.

import { BUILD_ID } from "../buildInfo";
import { PROTOCOL_VERSION } from "../net/protocol";

const RELOAD_GUARD = "metro_client_reload_at";
const SEEN_SERVER_BUILD = "metro_seen_server_build";
const POLL_MS = 45_000;

type VersionFile = {
  buildId?: string;
  protocol?: number;
  time?: string;
};

type HealthSnap = {
  ok?: boolean;
  build?: string;
  protocol?: number;
};

let installed = false;
let reloading = false;
let overlayEl: HTMLDivElement | null = null;

function httpApiBase(): string {
  const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env ?? {};
  const ws = env.VITE_SERVER_URL ?? "ws://127.0.0.1:8787/ws";
  return ws.replace(/^ws/i, "http").replace(/\/ws\/?$/, "");
}

function showOverlay(title: string, body: string, opts?: { autoMs?: number; onAction?: () => void }) {
  if (typeof document === "undefined") return;
  overlayEl?.remove();
  const el = document.createElement("div");
  el.id = "metro-update-gate";
  el.setAttribute("role", "alertdialog");
  el.innerHTML = `
    <div class="mug-card">
      <div class="mug-eyebrow">metrophage · client update</div>
      <h2>${title}</h2>
      <p>${body}</p>
      <button type="button" id="mug-reload">Reload now</button>
      <div class="mug-hint">Your runner save is on the server — progress is not wiped by a reload.</div>
    </div>`;
  const style = document.createElement("style");
  style.textContent = `
#metro-update-gate{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;
  padding:max(16px,env(safe-area-inset-top)) max(16px,env(safe-area-inset-right)) max(16px,env(safe-area-inset-bottom)) max(16px,env(safe-area-inset-left));
  background:rgba(4,2,10,.88);backdrop-filter:blur(6px);font-family:'IBM Plex Mono',ui-monospace,monospace;color:#eafdff}
#metro-update-gate .mug-card{width:min(420px,100%);padding:22px 20px 18px;border-radius:12px;
  background:linear-gradient(160deg,rgba(18,10,36,.98),rgba(6,10,22,.98));border:1px solid rgba(0,229,255,.55);
  box-shadow:0 0 40px rgba(0,229,255,.18),0 16px 48px rgba(0,0,0,.55)}
#metro-update-gate .mug-eyebrow{font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:#9aa3b2;margin-bottom:8px}
#metro-update-gate h2{margin:0 0 10px;font-family:Orbitron,sans-serif;font-size:18px;letter-spacing:.06em;color:#00e5ff;text-transform:uppercase}
#metro-update-gate p{margin:0 0 16px;font-size:12px;line-height:1.5;color:#c8d0dc}
#metro-update-gate button{width:100%;min-height:48px;border-radius:8px;border:1px solid #ff2bd6;background:rgba(255,43,214,.12);
  color:#ff8ae6;font-family:Orbitron,sans-serif;font-size:12px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;cursor:pointer}
#metro-update-gate button:hover{box-shadow:0 0 16px rgba(255,43,214,.35)}
#metro-update-gate .mug-hint{margin-top:12px;font-size:10px;line-height:1.4;color:#7d879b}`;
  el.prepend(style);
  document.body.appendChild(el);
  overlayEl = el;
  const go = () => {
    opts?.onAction?.();
    hardReloadNow();
  };
  el.querySelector("#mug-reload")?.addEventListener("click", go);
  if (opts?.autoMs && opts.autoMs > 0) {
    window.setTimeout(go, opts.autoMs);
  }
}

function hardReloadNow() {
  if (typeof location === "undefined") return;
  try {
    const u = new URL(location.href);
    u.searchParams.set("_mp", Date.now().toString(36));
    // Drop prior cache-buster noise if any, keep one.
    location.replace(u.toString());
  } catch {
    location.reload();
  }
}

/**
 * Force a hard reload (cache-busting query). Guarded against infinite reload loops
 * when both old and new assets mis-detect for a few seconds after deploy.
 */
export function forceHardReload(reason: string, detail?: string) {
  if (reloading) return;
  reloading = true;
  let looped = false;
  try {
    const last = Number(sessionStorage.getItem(RELOAD_GUARD) || 0);
    if (last && Date.now() - last < 20_000) looped = true;
    else sessionStorage.setItem(RELOAD_GUARD, String(Date.now()));
  } catch {
    /* private mode */
  }
  const body =
    (detail ? `${detail} ` : "") +
    (looped
      ? "Auto-reload already tried — tap Reload (or close the tab and reopen the game)."
      : "Reloading to the live client. Your runner is saved server-side.");
  showOverlay(reason, body, {
    autoMs: looped ? 0 : 1400,
    onAction: () => {
      try {
        sessionStorage.setItem(RELOAD_GUARD, String(Date.now()));
      } catch {
        /* ignore */
      }
    },
  });
  if (!looped) {
    window.setTimeout(() => hardReloadNow(), 1400);
  }
}

/** Called from NetClient when welcome.protocol ≠ local PROTOCOL_VERSION. */
export function notifyProtocolMismatch(serverProtocol: number, clientProtocol: number) {
  forceHardReload(
    "Client outdated",
    `Server protocol ${serverProtocol} · this tab has ${clientProtocol}.`,
  );
}

async function fetchJson<T>(url: string, ms = 6000): Promise<T | null> {
  try {
    const ac = new AbortController();
    const t = window.setTimeout(() => ac.abort(), ms);
    const r = await fetch(url, { cache: "no-store", signal: ac.signal });
    window.clearTimeout(t);
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  }
}

async function checkClientVersionFile(): Promise<boolean> {
  // Same-origin Pages asset — changes every client deploy.
  const v = await fetchJson<VersionFile>(`${location.origin}/version.json?t=${Date.now()}`);
  if (!v?.buildId) return false;
  if (v.buildId !== BUILD_ID && BUILD_ID !== "dev") {
    forceHardReload(
      "New game version live",
      `Client ${BUILD_ID.slice(0, 8)}… → ${String(v.buildId).slice(0, 8)}…`,
    );
    return true;
  }
  if (typeof v.protocol === "number" && v.protocol !== PROTOCOL_VERSION) {
    // version.json from a newer deploy; this tab's JS is still old.
    forceHardReload(
      "Client outdated",
      `Protocol ${PROTOCOL_VERSION} → ${v.protocol}.`,
    );
    return true;
  }
  return false;
}

async function checkServerHealth(): Promise<boolean> {
  const base = httpApiBase();
  if (!base || /localhost|127\.0\.0\.1/.test(base) && !/localhost|127\.0\.0\.1/.test(location.hostname)) {
    // Public page talking to localhost is a misbuild — handled elsewhere.
  }
  const h = await fetchJson<HealthSnap>(`${base}/health`);
  if (!h) return false;
  if (typeof h.protocol === "number" && h.protocol !== PROTOCOL_VERSION) {
    forceHardReload(
      "Client outdated",
      `Server protocol ${h.protocol} · tab ${PROTOCOL_VERSION}.`,
    );
    return true;
  }
  // Track Worker build: if it changes while this tab is open, DO restarts may
  // drop sockets — reload client so reconnect + assets stay paired.
  if (h.build && h.build !== "unset") {
    try {
      const prev = sessionStorage.getItem(SEEN_SERVER_BUILD);
      if (prev && prev !== h.build) {
        // Accept the new stamp BEFORE reload so the post-reload check does not loop.
        sessionStorage.setItem(SEEN_SERVER_BUILD, h.build);
        forceHardReload("Server updated", `Worker ${prev.slice(0, 12)} → ${h.build.slice(0, 12)}.`);
        return true;
      }
      sessionStorage.setItem(SEEN_SERVER_BUILD, h.build);
    } catch {
      /* ignore */
    }
  }
  return false;
}

async function runChecks() {
  if (reloading) return;
  if (await checkClientVersionFile()) return;
  await checkServerHealth();
}

/**
 * Install once at boot. Polls for deploys; also checks on tab focus / online.
 */
export function installClientUpdateWatch(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;

  // First paint: after a short delay so boot/assets aren't fighting for bandwidth.
  window.setTimeout(() => void runChecks(), 2500);
  window.setInterval(() => void runChecks(), POLL_MS);

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void runChecks();
  });
  window.addEventListener("focus", () => void runChecks());
  window.addEventListener("online", () => void runChecks());
}
