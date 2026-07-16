// Lightweight DOM splash shown while Phaser tears down one zone and decodes the next
// zone's deferred art pack. DOM keeps it visible across scene.restart().

const SPLASH_ID = "mp-zone-loading-art";

export function zoneLoadingArtFor(zone: string): string | null {
  if (zone === "subway") return "assets/ui/hf_loading_subway.png";
  if (zone === "safe" || /^d[0-2]$/.test(zone)) return "assets/ui/hf_loading_early_city.png";
  if (zone === "hotel" || /^h\d+$/.test(zone)) return "assets/ui/hf_loading_hotel.png";
  return null;
}

export function showZoneLoadingSplash(zone: string): void {
  if (typeof document === "undefined") return;
  const art = zoneLoadingArtFor(zone);
  if (!art) return;
  document.getElementById(SPLASH_ID)?.remove();
  const splash = document.createElement("div");
  splash.id = SPLASH_ID;
  splash.setAttribute("aria-hidden", "true");
  Object.assign(splash.style, {
    position: "fixed",
    inset: "0",
    zIndex: "7",
    pointerEvents: "none",
    backgroundColor: "#04020a",
    backgroundImage: `linear-gradient(rgba(4,2,10,.08), rgba(4,2,10,.2)), url('${art}')`,
    backgroundPosition: "center",
    backgroundRepeat: "no-repeat",
    backgroundSize: "cover",
    opacity: "1",
    transition: "opacity 260ms ease",
  });
  document.body.appendChild(splash);
}

export function dismissZoneLoadingSplash(delayMs = 160): void {
  if (typeof document === "undefined") return;
  const splash = document.getElementById(SPLASH_ID);
  if (!splash) return;
  window.setTimeout(() => {
    splash.style.opacity = "0";
    window.setTimeout(() => splash.remove(), 300);
  }, delayMs);
}
