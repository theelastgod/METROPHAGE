/** First-visit production notice. Shown before Phaser is ready, including on slow links. */
export const BETA_NOTICE_SEEN_KEY = "metrophage_beta_notice_v1";

export function showBetaNotice(): void {
  if (typeof document === "undefined") return;
  try {
    if (localStorage.getItem(BETA_NOTICE_SEEN_KEY) === "1") return;
  } catch {
    // Private wallet webviews can reject storage; the warning still needs to appear.
  }
  if (document.getElementById("mp-beta-notice")) return;
  const modal = document.createElement("section");
  modal.id = "mp-beta-notice";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.style.cssText = "position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;padding:20px;background:rgba(3,5,12,.88);backdrop-filter:blur(8px);font-family:ui-monospace,SFMono-Regular,Menlo,monospace";
  const card = document.createElement("div");
  card.style.cssText = "width:min(520px,100%);box-sizing:border-box;padding:28px;border:1px solid #29e7ff;border-radius:8px;background:linear-gradient(145deg,#101827,#070b13);box-shadow:0 0 36px rgba(41,231,255,.24);color:#eafdff;text-align:center";
  const title = document.createElement("h1");
  title.textContent = "METROPHAGE — PLAYTEST BETA";
  title.style.cssText = "margin:0 0 16px;color:#61e7ff;font-size:clamp(18px,4vw,25px);letter-spacing:.08em";
  const copy = document.createElement("p");
  copy.textContent = "METROPHAGE has not launched. This build is available only for beta playtesting and may change, reset, or contain bugs. Please do not treat in-game systems, balances, or content as final.";
  copy.style.cssText = "margin:0 0 22px;line-height:1.55;color:#c8d2e0;font-size:14px";
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "I UNDERSTAND — ENTER PLAYTEST";
  button.style.cssText = "width:100%;padding:13px 16px;border:1px solid #39ff88;border-radius:4px;background:#102b25;color:#dfffee;font:700 13px ui-monospace,monospace;letter-spacing:.04em;cursor:pointer";
  button.addEventListener("click", () => {
    try { localStorage.setItem(BETA_NOTICE_SEEN_KEY, "1"); } catch { /* show next time if blocked */ }
    modal.remove();
  }, { once: true });
  card.append(title, copy, button);
  modal.append(card);
  document.body.append(modal);
  button.focus();
}
