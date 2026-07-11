import { hasSavedSettings, updateSettings, getSettings } from "./Settings";

/**
 * Mobile / touch UX helpers.
 *
 * Phones and tablets get tap-to-walk, larger chrome, and conservative graphics
 * by default. Desktop hybrid laptops with a touchscreen keep normal defaults
 * unless the primary pointer is coarse (phone-like).
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
    const mobileUa = /Android|iPhone|iPod|Mobile|webOS|BlackBerry|IEMobile|Opera Mini/i.test(ua);
    // iPadOS 13+ reports as MacIntel but has multi-touch.
    const iPadOs =
      /iPad/i.test(ua) ||
      (navigator.platform === "MacIntel" && (navigator.maxTouchPoints ?? 0) > 1);
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
