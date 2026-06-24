// METROPHAGE — $METRO bridge panel (Phase 5 · 2c). A DOM overlay (the game is a
// canvas; a wallet/finance UI is far better as HTML). DORMANT BY DEFAULT: mounts only
// when `metroEnabled`, so with no CA the game shows nothing crypto. Withdraw is wired
// to the server bridge (works today against the devnet-sim settlement); the on-chain
// $METRO balance + real deposit signing arrive in 2c-2 (need the devnet mint).

import { metroEnabled, getMetroStatus, metroApiBase, fmtMetro, metroUsdLabel } from "../economy/metro";
import { walletAvailable, connectWallet, disconnectWallet, connectedWallet } from "../economy/wallet";

const short = (a: string) => (a.length > 10 ? `${a.slice(0, 4)}…${a.slice(-4)}` : a);

const STYLE = `
#metro-fab{position:fixed;right:16px;bottom:16px;z-index:9999;font-family:ui-monospace,Menlo,monospace;
  background:#0a0716;color:#00e5ff;border:1px solid #00e5ff;border-radius:8px;padding:8px 12px;cursor:pointer;
  box-shadow:0 0 12px rgba(0,229,255,.35);letter-spacing:.04em;font-size:13px}
#metro-fab:hover{box-shadow:0 0 18px rgba(0,229,255,.6)}
#metro-panel{position:fixed;right:16px;bottom:60px;z-index:9999;width:300px;display:none;
  font-family:ui-monospace,Menlo,monospace;background:rgba(8,5,18,.97);color:#cfeefe;
  border:1px solid #ff2bd6;border-radius:10px;padding:14px;box-shadow:0 0 26px rgba(255,43,214,.3)}
#metro-panel.open{display:block}
#metro-panel h3{margin:0 0 8px;color:#ff2bd6;font-size:13px;letter-spacing:.12em;display:flex;justify-content:space-between}
#metro-panel .x{cursor:pointer;color:#7a6e9a}
#metro-panel .row{display:flex;justify-content:space-between;align-items:center;margin:7px 0;font-size:12px}
#metro-panel .muted{color:#7a6e9a}
#metro-panel .big{color:#39ff88;font-size:15px}
#metro-panel input{background:#05030d;border:1px solid #2a2046;color:#cfeefe;border-radius:5px;padding:5px 7px;
  font-family:inherit;font-size:12px;width:100%}
#metro-panel button{background:#0a0716;border:1px solid #00e5ff;color:#00e5ff;border-radius:6px;padding:6px 10px;
  cursor:pointer;font-family:inherit;font-size:12px}
#metro-panel button:hover{box-shadow:0 0 10px rgba(0,229,255,.5)}
#metro-panel button:disabled{opacity:.4;cursor:not-allowed;box-shadow:none}
#metro-panel .sep{border-top:1px solid #1b1140;margin:11px 0}
#metro-panel .status{min-height:14px;font-size:11px;color:#f7ff3c;margin-top:8px;word-break:break-word}
#metro-panel .pill{font-size:10px;color:#7a6e9a;border:1px solid #2a2046;border-radius:10px;padding:1px 7px}
`;

export function mountMetroPanel(getPlayerId: () => string | null): void {
  if (!metroEnabled) return; // dormant — no CA, no panel
  const st = getMetroStatus();

  const style = document.createElement("style");
  style.textContent = STYLE;
  document.head.appendChild(style);

  const fab = document.createElement("button");
  fab.id = "metro-fab";
  fab.textContent = "◈ $METRO";
  document.body.appendChild(fab);

  const panel = document.createElement("div");
  panel.id = "metro-panel";
  panel.innerHTML = `
    <h3>◈ $METRO BRIDGE <span class="x" id="m-x">✕</span></h3>
    <div class="row"><span class="muted">network</span><span class="pill">${st.cluster}${st.mainnetLive ? " · LIVE" : " · rehearsal"}</span></div>
    <div class="row"><span class="muted">wallet</span><span id="m-wallet">—</span></div>
    <div class="row"><button id="m-connect">Connect Wallet</button><input id="m-addr" placeholder="or paste address" style="display:none"/></div>
    <div class="sep"></div>
    <div class="row"><span class="muted">token</span><span class="pill">1B supply · ~$4.2K launch</span></div>
    <div class="row"><span class="muted">player</span><span id="m-player">—</span></div>
    <div class="row"><span class="muted">credits</span><span id="m-credits" class="big">—</span></div>
    <div class="row"><span class="muted">≈ value</span><span id="m-value">—</span></div>
    <div class="sep"></div>
    <div class="row"><span class="muted">withdraw → $METRO</span></div>
    <div class="row"><input id="m-amt" type="number" min="0" placeholder="credits"/></div>
    <div class="row"><button id="m-withdraw">Withdraw</button><button id="m-refresh">Refresh</button></div>
    <div class="row"><span class="muted">deposit $METRO → credits</span><span class="pill">2c-2</span></div>
    <div class="row"><button id="m-deposit" disabled title="needs the devnet mint (2c-2)">Deposit (soon)</button></div>
    <div class="status" id="m-status"></div>
  `;
  document.body.appendChild(panel);

  const $ = (id: string) => panel.querySelector<HTMLElement>("#" + id)!;
  const status = (msg: string) => ($("m-status").textContent = msg);
  const addrInput = $("m-addr") as HTMLInputElement;

  // a paste-address fallback when no injected wallet is present (dev / preview)
  if (!walletAvailable()) {
    ($("m-connect") as HTMLButtonElement).textContent = "No wallet — paste address";
    addrInput.style.display = "block";
  }

  const currentWallet = (): string => connectedWallet() ?? addrInput.value.trim();

  const refresh = async () => {
    const player = getPlayerId();
    $("m-player").textContent = player ?? "— (log in online)";
    if (!player) {
      $("m-credits").textContent = "—";
      $("m-value").textContent = "—";
      return;
    }
    try {
      const r = await fetch(`${metroApiBase()}/metro/account?player=${encodeURIComponent(player)}`).then((x) => x.json());
      if (r.ok) {
        $("m-credits").textContent = String(r.credits);
        $("m-value").textContent = `${fmtMetro(r.metroValue)} $METRO (${metroUsdLabel(r.metroValue)})`;
      } else {
        $("m-credits").textContent = "—";
        status(r.reason ?? "account unavailable");
      }
    } catch {
      status("server unreachable");
    }
  };

  fab.onclick = () => {
    panel.classList.toggle("open");
    if (panel.classList.contains("open")) void refresh();
  };
  $("m-x").onclick = () => panel.classList.remove("open");
  $("m-refresh").onclick = () => void refresh();

  $("m-connect").onclick = async () => {
    if (!walletAvailable()) {
      addrInput.style.display = "block";
      status("paste a wallet address to use the bridge");
      return;
    }
    if (connectedWallet()) {
      await disconnectWallet();
      $("m-wallet").textContent = "—";
      ($("m-connect") as HTMLButtonElement).textContent = "Connect Wallet";
      return;
    }
    const addr = await connectWallet();
    if (addr) {
      $("m-wallet").textContent = short(addr);
      ($("m-connect") as HTMLButtonElement).textContent = "Disconnect";
      status("wallet connected");
    } else status("connect cancelled / no wallet");
  };

  $("m-withdraw").onclick = async () => {
    const player = getPlayerId();
    const wallet = currentWallet();
    const credits = Math.floor(Number(($("m-amt") as HTMLInputElement).value));
    if (!player) return status("log in online first");
    if (!wallet) return status("connect or paste a wallet address");
    if (!(credits > 0)) return status("enter a credit amount");
    status("withdrawing…");
    try {
      const r = await fetch(`${metroApiBase()}/metro/withdraw`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ player, wallet, credits }),
      }).then((x) => x.json());
      status(r.ok ? `✓ withdrew ${r.credits} credits → ${fmtMetro(r.metro)} $METRO (${metroUsdLabel(r.metro)})` : `✗ ${r.reason}`);
      void refresh();
    } catch {
      status("withdraw failed (server unreachable)");
    }
  };

  if (addrInput) addrInput.onchange = () => void refresh();
}
