import Phaser from "phaser";
// MUST be the first project import: fixes the backing resolution (render tier) at
// module-evaluation time, before any scene/UI module captures uiDim()-derived sizes.
import "./render/renderTier";
import {
  applyMobileDefaultsIfNeeded,
  prefersMobileUx,
  refreshMobileUxCache,
  installLandscapeGate,
  landscapeAspect,
  mobileVisibleSize,
  isPortrait,
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

// Mobile landscape: ENVELOP covers the full visual viewport (parent clips any
// tiny crop). Buffer width tracks the phone aspect so crop is usually zero.
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
  // Keep html/body in lockstep so iOS Safari doesn't leave letterbox gutters.
  try {
    document.documentElement.style.width = `${w}px`;
    document.documentElement.style.height = `${h}px`;
    document.body.style.width = `${w}px`;
    document.body.style.height = `${h}px`;
  } catch {
    /* ignore */
  }
}

// Assigned after Phaser.Game construction — resize handlers guard on this.
let game: Phaser.Game;

/**
 * Widen (or narrow) the game buffer to the live landscape aspect so ENVELOP/FIT
 * can fill edge-to-edge. Height (and RENDER_SCALE) stay fixed — only FOV width changes.
 */
function syncMobileGameSize() {
  if (!mobile || !game || typeof window === "undefined") return;
  if (isPortrait()) return; // landscape gate owns portrait
  const root = document.getElementById("game-root");
  if (!root) return;
  const pw = root.clientWidth || mobileVisibleSize().w;
  const ph = root.clientHeight || mobileVisibleSize().h;
  if (pw < 2 || ph < 2 || pw < ph) return;

  const aspect = landscapeAspect();
  const h = game.scale.gameSize?.height || VIEW_H;
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
    // Mobile: ENVELOP = cover the parent fully (parent overflow:hidden clips).
    // Desktop: FIT = whole game visible, letterbox OK on ultrawide windows.
    mode: mobile ? Phaser.Scale.ENVELOP : Phaser.Scale.FIT,
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

/** Refit canvas after rotate / chrome collapse — fill the visible phone window. */
function refreshMobileScale() {
  if (!mobile || !game) return;
  sizeMobileRoot();
  syncMobileGameSize();
  try {
    game.scale.refresh();
  } catch {
    /* game may not be ready */
  }
  // ENVELOP intentionally draws a canvas ≥ parent; do NOT clamp max size (that
  // re-letterboxes). Parent #game-root overflow:hidden clips to the screen.
  const canvas = game.canvas;
  if (canvas) {
    canvas.style.maxWidth = "none";
    canvas.style.maxHeight = "none";
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

  // True browser fullscreen when supported (Android Chrome / some Chromium).
  // iOS Safari does not allow element fullscreen for canvas — visualViewport +
  // ENVELOP keeps us edge-to-edge inside the browser window there.
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
        /* denied / unsupported — stay windowed cover-fill */
      }
      window.setTimeout(refreshMobileScale, 100);
      window.setTimeout(refreshMobileScale, 400);
    };
    // First tap + every time we enter landscape (helps after rotate-from-portrait).
    document.addEventListener("pointerdown", goFs, { once: true, passive: true });
    document.addEventListener("fullscreenchange", () => refreshMobileScale());
    document.addEventListener("webkitfullscreenchange", () => refreshMobileScale());
    try {
      window.matchMedia("(orientation: landscape)").addEventListener("change", (e) => {
        if (e.matches) {
          window.setTimeout(goFs, 80);
          window.setTimeout(refreshMobileScale, 120);
        }
      });
    } catch {
      /* ignore */
    }
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
        : "disabled (off-chain only) · Phantom sign-up · set VITE_METRO_MINT to arm SPL bridge"
    }`,
  );
}
