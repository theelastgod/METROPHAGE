import Phaser from "phaser";
// MUST be the first project import: fixes the backing resolution (render tier) at
// module-evaluation time, before any scene/UI module captures uiDim()-derived sizes.
import "./render/renderTier";
import {
  applyMobileDefaultsIfNeeded,
  prefersMobileUx,
  refreshMobileUxCache,
  installLandscapeGate,
  installMobileFullscreenButton,
  mobileVisibleSize,
  isPortrait,
  isBrowserFullscreen,
} from "./systems/Mobile";
import { VIEW_W, VIEW_H, COLORS, setRenderResolution } from "./config";

// Phone defaults (tap-to-walk, low FX) before scenes read settings.
applyMobileDefaultsIfNeeded();
// Force landscape on phones — long edge left↔right.
installLandscapeGate();
import BootScene from "./scenes/BootScene";
import SelectScene from "./scenes/SelectScene";
import CustomizeScene from "./scenes/CustomizeScene";
import Prologue from "./scenes/Prologue";
import OnlineScene from "./scenes/OnlineScene";
import ColdOpenScene from "./scenes/ColdOpenScene";


import { getMetroStatus } from "./economy/metro";
import { installQualityGovernor } from "./systems/QualityGovernor";
import { mountMetroPanel } from "./ui/MetroPanel";
import { getOnlinePlayer } from "./economy/session";
import { randomCustomization } from "./game/customization";
import { installClientUpdateWatch } from "./systems/ClientUpdate";
import { showBetaNotice } from "./ui/BetaNotice";

// Mobile landscape: FIT shows the full game (no crop). ENVELOP used to fill the
// screen by clipping HUD/world edges — that was the "cut off" bug on phones.
showBetaNotice();
const mobile = prefersMobileUx();

/** Pin #game-root to the real visible phone viewport (handles URL-bar show/hide). */
function sizeMobileRoot() {
  if (typeof document === "undefined" || typeof window === "undefined") return;
  const root = document.getElementById("game-root");
  if (!root) return;
  const { w, h, left, top } = mobileVisibleSize();
  root.style.width = `${w}px`;
  root.style.height = `${h}px`;
  root.style.left = `${left}px`;
  root.style.top = `${top}px`;
  root.style.right = "auto";
  root.style.bottom = "auto";
  // Do not freeze html/body to the current pixel dimensions. Phantom and other
  // wallet webviews reuse that layout box after rotation, which can leave the
  // page permanently portrait even though visualViewport is landscape.
  document.documentElement.style.removeProperty("width");
  document.documentElement.style.removeProperty("height");
  document.body.style.removeProperty("width");
  document.body.style.removeProperty("height");
}

// Assigned after Phaser.Game construction — resize handlers guard on this.
let game: Phaser.Game;

/**
 * Match game buffer aspect to the live phone aspect so FIT fills the whole
 * landscape window (max width + height) without cropping HUD/world edges.
 * Design height stays VIEW_H; width flexes to the phone's long/short ratio.
 */
function syncMobileGameSize() {
  if (!mobile || !game || typeof window === "undefined") return;
  if (isPortrait()) return; // landscape gate owns portrait
  const root = document.getElementById("game-root");
  if (!root) return;
  // Prefer live visualViewport so FS / URL-bar changes are reflected immediately.
  const vis = mobileVisibleSize();
  const pw = root.clientWidth || vis.w;
  const ph = root.clientHeight || vis.h;
  if (pw < 2 || ph < 2 || pw < ph) return;

  // Use the actual parent box aspect (post-safe-area / fullscreen) so the canvas
  // aspect matches the phone → FIT scales to use full width with no side crop.
  const aspect = Math.max(1.2, Math.min(2.6, pw / ph));
  const h = VIEW_H;
  const w = Math.round((h * aspect) / 2) * 2;
  if (!(w > 0 && h > 0)) return;
  if (Math.abs(w - (game.scale.gameSize?.width || 0)) <= 2) return;
  try {
    setRenderResolution(w, h);
    game.scale.setGameSize(w, h);
  } catch {
    /* scale may not be ready */
  }
}

// METROPHAGE — Path A: one server-authoritative world; personal campaign per player.
const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.WEBGL,
  parent: "game-root",
  backgroundColor: COLORS.bgVoid,
  pixelArt: true,
  roundPixels: true,
  render: {
    antialias: false,
    powerPreference: "high-performance",
  },
  scale: {
    // FIT on mobile + desktop: entire design canvas always visible (letterbox OK).
    // Never ENVELOP on phones — that crops HUD chrome and world edges.
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: VIEW_W,
    height: VIEW_H,
    expandParent: true,
    ...(mobile
      ? {
          fullscreenTarget: "game-root",
          resizeInterval: 50,
        }
      : {}),
  },
  physics: {
    default: "arcade",
    arcade: {
      gravity: { x: 0, y: 0 },
      debug: false,
    },
  },
  input: {
    gamepad: true,
    // D-pad + action buttons + world taps can all be down at once on phones.
    activePointers: 5,
  },
  scene: [BootScene, ColdOpenScene, SelectScene, CustomizeScene, Prologue, OnlineScene],
};

if (mobile) sizeMobileRoot();

game = new Phaser.Game(config);

/** Refit canvas after rotate / chrome collapse / fullscreen — max width, nothing cut off. */
function refreshMobileScale() {
  if (!mobile || !game) return;
  sizeMobileRoot();
  syncMobileGameSize();
  try {
    game.scale.refresh();
  } catch {
    /* game may not be ready */
  }
  // FIT clamps to parent. When game aspect matches the phone (syncMobileGameSize),
  // Phaser fills the full width with no crop. Don't force canvas width/height —
  // that desyncs pointer mapping.
  const canvas = game.canvas;
  if (canvas) {
    canvas.style.maxWidth = "100%";
    canvas.style.maxHeight = "100%";
    canvas.style.margin = "0 auto";
  }
}

if (mobile && typeof window !== "undefined") {
  const delayedRefresh = () => {
    window.setTimeout(refreshMobileScale, 50);
    window.setTimeout(refreshMobileScale, 200);
    window.setTimeout(refreshMobileScale, 500);
  };
  window.addEventListener("orientationchange", delayedRefresh);
  window.addEventListener("resize", () => refreshMobileScale());
  window.visualViewport?.addEventListener("resize", () => refreshMobileScale());
  window.visualViewport?.addEventListener("scroll", () => refreshMobileScale());
  window.addEventListener("pageshow", delayedRefresh);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") delayedRefresh();
  });
  try {
    window.matchMedia("(orientation: landscape)").addEventListener("change", delayedRefresh);
  } catch {
    /* old engines */
  }
  // First layout after Phaser boots + after landscape settle.
  window.setTimeout(refreshMobileScale, 0);
  window.setTimeout(refreshMobileScale, 250);
  window.setTimeout(refreshMobileScale, 800);
}

// Adaptive quality: measure real FPS and tune the auto tier — boot heuristics lie.
installQualityGovernor(game);

// Mobile shell: block page scroll/bounce and re-check coarse-pointer on rotate.
if (typeof document !== "undefined") {
  const blockScroll = (e: Event) => {
    // Allow text inputs (chat) to receive focus; block body rubber-banding.
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
    e.preventDefault();
  };
  document.addEventListener("touchmove", blockScroll, { passive: false });
  document.addEventListener(
    "gesturestart",
    (e) => {
      e.preventDefault();
    },
    { passive: false },
  );
  window.addEventListener("orientationchange", () => {
    refreshMobileUxCache();
    applyMobileDefaultsIfNeeded();
  });
  if (prefersMobileUx()) {
    document.documentElement.classList.add("mp-mobile");
    document.body.classList.add("mp-mobile");
  }
  // Re-sync landscape gate after Phaser scales the canvas.
  window.addEventListener("resize", () => {
    refreshMobileUxCache();
  });

  // Explicit FULLSCREEN control (user gesture). No auto-enter — that fought iOS
  // and still cropped under ENVELOP. FIT + optional FS is the reliable path.
  if (prefersMobileUx()) {
    installMobileFullscreenButton({
      onChange: () => {
        window.setTimeout(refreshMobileScale, 60);
        window.setTimeout(refreshMobileScale, 280);
        window.setTimeout(refreshMobileScale, 600);
      },
    });
    document.addEventListener("fullscreenchange", () => {
      document.documentElement.classList.toggle("mp-fs", isBrowserFullscreen());
      refreshMobileScale();
    });
    document.addEventListener("webkitfullscreenchange", () => {
      document.documentElement.classList.toggle("mp-fs", isBrowserFullscreen());
      refreshMobileScale();
    });
  }
}

// $METRO bridge panel — dormant unless the on-chain layer is enabled (a valid CA).
mountMetroPanel(getOnlinePlayer);

// Long-lived tabs after a deploy: detect new client/server and hard-reload so
// runners aren't stuck offline on a stale multiplayer protocol.
installClientUpdateWatch();

// Dev-only handle for debugging/verification in the browser console.
if (import.meta.env.DEV) {
  (window as unknown as { __game: Phaser.Game; __enterCity: () => void }).__game = game;
  const w = window as unknown as {
    __game: Phaser.Game;
    __enterCity: () => void;
    __playtest: { offline: () => void; drill: () => void; gotoZone: (zone: string) => void };
  };
  w.__enterCity = () => {
    if (!game.registry.get("classId")) game.registry.set("classId", "metrophage");
    if (!game.registry.get("customization")) game.registry.set("customization", randomCustomization("metrophage"));
    // Deterministic even mid-transition: stop every active scene, start Online at the
    // manager level, then sweep stragglers (a queued Select start can land AFTER this
    // call and would otherwise paint + steal input over the world — or worse, a probe
    // catches the gap between Boot stopping and Select starting).
    const sweep = () => {
      for (const s of game.scene.getScenes(true)) {
        if (s.scene.key !== "Online") s.scene.stop();
      }
    };
    sweep();
    game.scene.start("Online", { zone: "safe" });
    window.setTimeout(sweep, 400);
    window.setTimeout(sweep, 1500);
  };
  w.__playtest = {
    offline: () => {
      game.registry.set("guestPlay", true);
      game.registry.remove("offlinePlay");
      game.registry.remove("characterLocked");
      game.registry.remove("walletAddress");
      game.scene.start("Select");
    },
    drill: () => game.scene.start("Online", { zone: "tutorial", tutorialMode: "quick" }),
    // World-tour hook (tools/world-tour.mjs): jump straight to any zone for
    // screenshot sweeps. Same deterministic sweep discipline as __enterCity.
    gotoZone: (zone: string) => {
      if (!game.registry.get("classId")) game.registry.set("classId", "metrophage");
      if (!game.registry.get("customization")) game.registry.set("customization", randomCustomization("metrophage"));
      game.registry.set("guestPlay", true);
      for (const s of game.scene.getScenes(true)) if (s.scene.key !== "Online") s.scene.stop();
      game.scene.getScene("Online")?.scene.isActive()
        ? game.scene.getScene("Online")!.scene.restart({ zone })
        : game.scene.start("Online", { zone });
    },
  };
  // Surface the $METRO gate state so it's obvious whether the on-chain layer is live.
  const m = getMetroStatus();
  console.info(
    `[$METRO] ${
      m.enabled
        ? `ENABLED · ${m.networkName} · ${m.cluster}${m.chainId ? ` · id ${m.chainId}` : ""}${m.mainnetLive ? " · MAINNET LIVE" : ""}`
        : // dualChainSummary already names the family, network and the env var to set.
          m.summary
    }`,
  );
}
