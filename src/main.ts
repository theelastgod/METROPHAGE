import Phaser from "phaser";
// MUST be the first project import: fixes the backing resolution (render tier) at
// module-evaluation time, before any scene/UI module captures uiDim()-derived sizes.
import "./render/renderTier";
import {
  applyMobileDefaultsIfNeeded,
  prefersMobileUx,
  refreshMobileUxCache,
  installLandscapeGate,
} from "./systems/Mobile";
import { VIEW_W, VIEW_H, COLORS } from "./config";

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

// Mobile: FIT never exceeds the browser window (ENVELOP was overflowing past the
// viewport and looking "zoomed past" the phone screen). We still maximize size
// inside the visual viewport and try true browser fullscreen on first tap.
const mobile = prefersMobileUx();

/** Pin #game-root to the real visible phone viewport (handles URL-bar show/hide). */
function sizeMobileRoot() {
  if (typeof document === "undefined" || typeof window === "undefined") return;
  const root = document.getElementById("game-root");
  if (!root) return;
  const vv = window.visualViewport;
  // visualViewport is the *visible* area; innerWidth can include off-screen chrome.
  const w = Math.max(1, Math.floor(vv?.width ?? window.innerWidth));
  const h = Math.max(1, Math.floor(vv?.height ?? window.innerHeight));
  root.style.width = `${w}px`;
  root.style.height = `${h}px`;
  root.style.left = `${Math.floor(vv?.offsetLeft ?? 0)}px`;
  root.style.top = `${Math.floor(vv?.offsetTop ?? 0)}px`;
  root.style.right = "auto";
  root.style.bottom = "auto";
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
    // FIT = largest size that still fits entirely inside the parent (no overflow).
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: VIEW_W,
    height: VIEW_H,
    expandParent: true,
    ...(mobile
      ? {
          fullscreenTarget: "game-root",
          resizeInterval: 80,
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

const game = new Phaser.Game(config);

/** Refit canvas after rotate / chrome collapse — never larger than the phone window. */
function refreshMobileScale() {
  if (!mobile) return;
  sizeMobileRoot();
  try {
    game.scale.refresh();
  } catch {
    /* game may not be ready */
  }
  // Hard clamp: if anything still overshoots the phone window, scale down to fit.
  const canvas = game.canvas;
  const root = document.getElementById("game-root");
  if (canvas && root) {
    const maxW = root.clientWidth;
    const maxH = root.clientHeight;
    canvas.style.maxWidth = `${maxW}px`;
    canvas.style.maxHeight = `${maxH}px`;
    const cw = canvas.offsetWidth || parseFloat(canvas.style.width) || 0;
    const ch = canvas.offsetHeight || parseFloat(canvas.style.height) || 0;
    if (cw > maxW + 1 || ch > maxH + 1) {
      const s = Math.min(maxW / Math.max(1, cw), maxH / Math.max(1, ch));
      canvas.style.width = `${Math.floor(cw * s)}px`;
      canvas.style.height = `${Math.floor(ch * s)}px`;
    }
  }
}

if (mobile && typeof window !== "undefined") {
  window.addEventListener("orientationchange", () => window.setTimeout(refreshMobileScale, 150));
  window.addEventListener("resize", () => refreshMobileScale());
  window.visualViewport?.addEventListener("resize", () => refreshMobileScale());
  window.visualViewport?.addEventListener("scroll", () => refreshMobileScale());
  // First layout after Phaser boots.
  window.setTimeout(refreshMobileScale, 0);
  window.setTimeout(refreshMobileScale, 250);
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

  // True browser fullscreen when supported (Android Chrome / some Chromium).
  // iOS Safari does not allow element fullscreen for canvas — FIT + visualViewport
  // keeps us inside the browser window there.
  if (prefersMobileUx()) {
    const goFs = () => {
      const root = document.getElementById("game-root") ?? document.documentElement;
      const anyRoot = root as HTMLElement & {
        webkitRequestFullscreen?: () => void;
        requestFullscreen?: (opts?: FullscreenOptions) => Promise<void>;
      };
      const anyDoc = document as Document & {
        webkitFullscreenElement?: Element | null;
        webkitExitFullscreen?: () => void;
      };
      try {
        if (document.fullscreenElement || anyDoc.webkitFullscreenElement) {
          refreshMobileScale();
          return;
        }
        if (anyRoot.requestFullscreen) {
          void anyRoot.requestFullscreen({ navigationUI: "hide" }).catch(() => undefined);
        } else if (anyRoot.webkitRequestFullscreen) {
          anyRoot.webkitRequestFullscreen();
        }
      } catch {
        /* denied / unsupported — stay windowed FIT */
      }
      window.setTimeout(refreshMobileScale, 100);
      window.setTimeout(refreshMobileScale, 400);
    };
    document.addEventListener("pointerdown", goFs, { once: true, passive: true });
    document.addEventListener("fullscreenchange", () => refreshMobileScale());
  }
}

// $METRO bridge panel — dormant unless the on-chain layer is enabled (a valid CA).
mountMetroPanel(getOnlinePlayer);

// Dev-only handle for debugging/verification in the browser console.
if (import.meta.env.DEV) {
  (window as unknown as { __game: Phaser.Game; __enterCity: () => void }).__game = game;
  const w = window as unknown as {
    __game: Phaser.Game;
    __enterCity: () => void;
    __playtest: { offline: () => void; drill: () => void };
  };
  w.__enterCity = () => {
    if (!game.registry.get("classId")) game.registry.set("classId", "metrophage");
    if (!game.registry.get("customization")) game.registry.set("customization", randomCustomization("metrophage"));
    // route through the ACTIVE scene's plugin so it stops (game-level start leaves the
    // menu running behind the world — it silently halved measured FPS in profiling)
    const cur = game.scene.getScenes(true)[0];
    if (cur) cur.scene.start("Online", { zone: "safe" });
    else game.scene.start("Online", { zone: "safe" });
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
  };
  // Surface the $METRO gate state so it's obvious whether the on-chain layer is live.
  const m = getMetroStatus();
  console.info(
    `[$METRO] ${
      m.enabled
        ? `ENABLED · ${m.networkName} · ${m.cluster}${m.chainId ? ` · id ${m.chainId}` : ""}${m.mainnetLive ? " · MAINNET LIVE" : ""}`
        : "disabled (off-chain only) · MetaMask sign-up uses Robinhood Chain"
    }`,
  );
}
