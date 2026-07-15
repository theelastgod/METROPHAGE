import { hasSavedSettings, updateSettings, getSettings } from "./Settings";

/**
 * Mobile / touch UX helpers.
 *
 * Phones and tablets get tap-to-walk, larger chrome, and conservative graphics
 * by default. Desktop browsers keep normal defaults even when touch hardware
 * reports coarse/no-hover pointer media quirks.
 */

let cached: boolean | null = null;

/** True when this browser should use the mobile control scheme. */
export function prefersMobileUx(): boolean {
  if (cached !== null) return cached;
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    cached = false;
    return false;
  }
  try {
    // Dev/QA override: ?mobile=1 forces the phone UX on desktop, ?mobile=0 forces it
    // off on a phone. Real devices never send the param, so detection is untouched.
    const forced = new URLSearchParams(window.location.search).get("mobile");
    if (forced === "1") {
      cached = true;
      return true;
    }
    if (forced === "0") {
      cached = false;
      return false;
    }
    const ua = navigator.userAgent || "";
    const nav = navigator as Navigator & {
      userAgentData?: {
        mobile?: boolean;
        platform?: string;
      };
    };
    const mobileUa = /Android|iPhone|iPod|Mobile|webOS|BlackBerry|IEMobile|Opera Mini/i.test(ua);
    // iPadOS 13+ reports as MacIntel but has multi-touch.
    const iPadOs =
      /iPad/i.test(ua) ||
      (navigator.platform === "MacIntel" && (navigator.maxTouchPoints ?? 0) > 1);
    const uaDataPlatform = nav.userAgentData?.platform ?? "";
    const chromiumDesktop =
      nav.userAgentData?.mobile === false &&
      /Windows|macOS|Chrome OS|Linux/i.test(uaDataPlatform);
    const desktopUa =
      !mobileUa &&
      !iPadOs &&
      /Windows NT|Win(?:32|64)|Macintosh|X11|CrOS|Linux (?:x86_64|i[3-6]86)/i.test(ua);
    if (chromiumDesktop || desktopUa) {
      cached = false;
      return false;
    }
    const coarse =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(pointer: coarse)").matches;
    const noHover =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(hover: none)").matches;
    const narrow =
      Math.min(window.innerWidth || 9999, window.innerHeight || 9999) < 820;
    // Prefer mobile UX when clearly a phone/tablet, or a coarse+no-hover device.
    cached = mobileUa || iPadOs || (coarse && noHover) || (coarse && narrow);
  } catch {
    cached = false;
  }
  return cached;
}

/** Force re-evaluate (orientation / window resize). */
export function refreshMobileUxCache(): void {
  cached = null;
}

/**
 * First-run defaults for phones: tap-to-walk, lean HUD, low FX.
 * Never overrides an existing saved settings blob.
 */
export function applyMobileDefaultsIfNeeded(): void {
  if (!prefersMobileUx()) return;
  if (hasSavedSettings()) {
    // Tap-to-walk is required to play without a keyboard — always enable on phone.
    // Leave FX / quality choices the player already made alone.
    if (!getSettings().rsControls) updateSettings({ rsControls: true });
    return;
  }
  updateSettings({
    // Tap-to-path still useful; D-pad is primary on mobile landscape.
    rsControls: true,
    lowFx: true,
    uiDensity: "new",
    graphicsQuality: "auto",
    autoTierCap: "low",
    firstSessionCoach: true,
    shake: 0.55,
  });
}

/** Minimum comfortable design-px touch target (before UI_SCALE). */
export function touchTargetDesign(px = 48): number {
  return prefersMobileUx() ? Math.max(px, 52) : px;
}

/** True when the viewport is portrait (taller than wide). */
export function isPortrait(): boolean {
  if (typeof window === "undefined") return false;
  return window.innerHeight > window.innerWidth;
}

/** Mobile + portrait — block play until the phone is turned sideways. */
export function needsLandscape(): boolean {
  return prefersMobileUx() && isPortrait();
}

/**
 * This device's landscape aspect ratio (long edge ÷ short edge), clamped sane.
 *
 * When already landscape, prefer the live *visible* viewport (visualViewport) so
 * browser chrome / notches don't leave letterbox bars after rotate. When still
 * portrait at boot, use long/short of the window (or screen) so the buffer is
 * ready before the player turns the phone. Clamped to [16:9, 21:9].
 */
export function landscapeAspect(): number {
  if (typeof window === "undefined") return 16 / 9;

  const clamp = (r: number) => Math.min(Math.max(r, 16 / 9), 21 / 9);

  // Live landscape: match what the player actually sees (URL bar, safe areas).
  try {
    const vv = window.visualViewport;
    const w = Math.floor(vv?.width ?? window.innerWidth) || 0;
    const h = Math.floor(vv?.height ?? window.innerHeight) || 0;
    if (w > 0 && h > 0 && w >= h) return clamp(w / h);
  } catch {
    /* privacy modes */
  }

  // Portrait / unknown: long edge will be horizontal once landscape-gated.
  let long = Math.max(window.innerWidth || 0, window.innerHeight || 0);
  let short = Math.min(window.innerWidth || 0, window.innerHeight || 0);
  if (!(long > 0 && short > 0)) {
    try {
      long = Math.max(window.screen?.width || 0, window.screen?.height || 0);
      short = Math.min(window.screen?.width || 0, window.screen?.height || 0);
    } catch {
      /* screen may be blocked in some privacy modes */
    }
  }
  if (!(long > 0 && short > 0)) return 16 / 9;
  return clamp(long / short);
}

/**
 * Visible phone viewport in CSS pixels (visualViewport when available).
 * Used to pin #game-root edge-to-edge in landscape.
 */
export function mobileVisibleSize(): { w: number; h: number; left: number; top: number } {
  if (typeof window === "undefined") return { w: 1, h: 1, left: 0, top: 0 };
  try {
    const vv = window.visualViewport;
    if (vv && vv.width > 0 && vv.height > 0) {
      return {
        w: Math.max(1, Math.floor(vv.width)),
        h: Math.max(1, Math.floor(vv.height)),
        left: Math.floor(vv.offsetLeft ?? 0),
        top: Math.floor(vv.offsetTop ?? 0),
      };
    }
  } catch {
    /* ignore */
  }
  return {
    w: Math.max(1, Math.floor(window.innerWidth || 1)),
    h: Math.max(1, Math.floor(window.innerHeight || 1)),
    left: 0,
    top: 0,
  };
}

/** Bottom-left thumb region for the floating movement stick. */
export function mobileStickSafeRegion(width: number, height: number) {
  const shortSide = Math.min(width, height);
  const widthCap = Math.max(154, shortSide * 0.42);
  return {
    x: 0,
    y: Math.max(height * 0.48, height - shortSide * 0.48),
    w: Math.min(width * 0.28, widthCap),
    h: Math.max(shortSide * 0.42, height * 0.46),
  };
}

/**
 * Full-screen "turn phone sideways" gate for phones.
 * Hides the game canvas until landscape; tries Screen Orientation lock when available.
 */
export function installLandscapeGate(): void {
  if (typeof document === "undefined" || !prefersMobileUx()) return;

  let overlay = document.getElementById("mp-landscape-gate");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "mp-landscape-gate";
    overlay.innerHTML = `
      <div class="mp-land-inner">
        <div class="mp-land-phone" aria-hidden="true">📱</div>
        <div class="mp-land-title">TURN PHONE SIDEWAYS</div>
        <div class="mp-land-body">METROPHAGE plays in landscape — long edge left ↔ right.</div>
        <div class="mp-land-hint">rotate · lock orientation if it flips back</div>
      </div>`;
    document.body.appendChild(overlay);
  }

  const tryLockLandscape = () => {
    try {
      const so = screen.orientation as ScreenOrientation & {
        lock?: (o: string) => Promise<void>;
      };
      void so?.lock?.("landscape")?.catch(() => undefined);
    } catch {
      /* iOS Safari has no lock */
    }
  };

  const sync = () => {
    const need = needsLandscape();
    overlay!.classList.toggle("mp-show", need);
    document.documentElement.classList.toggle("mp-portrait-block", need);
    document.body.classList.toggle("mp-portrait-block", need);
    // Keep mobile class for full-bleed CSS even after rotate.
    document.documentElement.classList.add("mp-mobile");
    document.body.classList.add("mp-mobile");
    if (!need) tryLockLandscape();
  };

  sync();
  window.addEventListener("orientationchange", () => {
    refreshMobileUxCache();
    window.setTimeout(sync, 120);
  });
  window.addEventListener("resize", () => {
    refreshMobileUxCache();
    sync();
  });
  // Some mobile browsers (and emulated viewports) skip window.resize on rotate —
  // the orientation media query and visualViewport are extra, more reliable triggers.
  try {
    window.matchMedia("(orientation: portrait)").addEventListener("change", () => {
      refreshMobileUxCache();
      sync();
    });
  } catch {
    /* very old engines lack addEventListener on MediaQueryList */
  }
  window.visualViewport?.addEventListener("resize", () => sync());
  // Orientation lock usually requires a user gesture.
  document.addEventListener(
    "pointerdown",
    () => {
      if (!needsLandscape()) tryLockLandscape();
    },
    { passive: true },
  );
}

// ── Browser fullscreen (Android Chrome / Chromium; limited on iOS Safari) ──

type FsDoc = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => void;
};
type FsEl = HTMLElement & {
  webkitRequestFullscreen?: () => void;
  requestFullscreen?: (opts?: FullscreenOptions) => Promise<void>;
};

/** True when the page (or #game-root) is in browser fullscreen. */
export function isBrowserFullscreen(): boolean {
  if (typeof document === "undefined") return false;
  const d = document as FsDoc;
  return !!(document.fullscreenElement || d.webkitFullscreenElement);
}

/** Whether the browser exposes element Fullscreen API (often false on iOS Safari). */
export function canBrowserFullscreen(): boolean {
  if (typeof document === "undefined") return false;
  const el = document.documentElement as FsEl;
  return typeof el.requestFullscreen === "function" || typeof el.webkitRequestFullscreen === "function";
}

/**
 * Enter/exit browser fullscreen on the whole page (documentElement).
 * Using #game-root alone left browser chrome / sibling UI unfilled on phones.
 */
export async function toggleBrowserFullscreen(): Promise<boolean> {
  if (typeof document === "undefined") return false;
  const d = document as FsDoc;
  try {
    if (isBrowserFullscreen()) {
      if (document.exitFullscreen) await document.exitFullscreen();
      else d.webkitExitFullscreen?.();
      return false;
    }
    // Full document → phone display; navigationUI:hide removes browser chrome on Android.
    const root = document.documentElement as FsEl;
    if (typeof root.requestFullscreen === "function") {
      await root.requestFullscreen({ navigationUI: "hide" });
      return true;
    }
    if (typeof root.webkitRequestFullscreen === "function") {
      root.webkitRequestFullscreen();
      return true;
    }
    // Fallback: try the game root if documentElement is blocked.
    const gameRoot = document.getElementById("game-root") as FsEl | null;
    if (gameRoot?.requestFullscreen) {
      await gameRoot.requestFullscreen({ navigationUI: "hide" });
      return true;
    }
    if (gameRoot?.webkitRequestFullscreen) {
      gameRoot.webkitRequestFullscreen();
      return true;
    }
  } catch {
    /* user denied / unsupported (common on iOS Safari) */
  }
  return isBrowserFullscreen();
}

/**
 * Floating FULL / EXIT for phones that support the Fullscreen API (Android Chrome).
 * iOS Safari cannot fullscreen a web game — button is omitted; FIT max-width is the path.
 */
export function installMobileFullscreenButton(opts?: { onChange?: () => void }): void {
  if (typeof document === "undefined" || !prefersMobileUx()) return;
  if (document.getElementById("mp-fs-btn")) return;

  // No fake FULL button on browsers that cannot actually fullscreen (iOS Safari).
  if (!canBrowserFullscreen()) return;

  const btn = document.createElement("button");
  btn.id = "mp-fs-btn";
  btn.type = "button";
  btn.setAttribute("aria-label", "Toggle fullscreen");
  btn.title = "Fullscreen — use the whole phone display";

  const paint = () => {
    const fs = isBrowserFullscreen();
    btn.classList.toggle("on", fs);
    btn.textContent = fs ? "EXIT" : "FULL";
    document.documentElement.classList.toggle("mp-fs", fs);
    document.body.classList.toggle("mp-fs", fs);
  };
  paint();

  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    void (async () => {
      await toggleBrowserFullscreen();
      paint();
      opts?.onChange?.();
      // Browser chrome / visualViewport settle after FS enter/exit.
      window.setTimeout(() => {
        paint();
        opts?.onChange?.();
      }, 120);
      window.setTimeout(() => {
        paint();
        opts?.onChange?.();
      }, 400);
    })();
  });

  document.addEventListener("fullscreenchange", paint);
  document.addEventListener("webkitfullscreenchange", paint);
  document.body.appendChild(btn);
}
