// METROPHAGE — $METRO bridge panel (Phase 5 · 2c). A DOM overlay (the game is a
// canvas; a wallet/finance UI is far better as HTML). DORMANT BY DEFAULT: mounts only
// when `metroEnabled`, so with no CA the game shows nothing crypto. Withdraw is wired
// to the server bridge (works today against the devnet-sim settlement); the on-chain
// $METRO balance + real deposit signing arrive in 2c-2 (need the devnet mint).

import { metroEnabled, getMetroStatus, metroApiBase, fmtMetro } from "../economy/metro";
import { walletAvailable, connectWallet, disconnectWallet, connectedWallet } from "../economy/wallet";

const short = (a: string) => (a.length > 10 ? `${a.slice(0, 4)}…${a.slice(-4)}` : a);

const STYLE = `
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600;700&family=Orbitron:wght@500;700;900&display=swap');
#metro-fab{position:fixed;right:18px;bottom:18px;z-index:9999;font-family:'Orbitron',monospace;font-weight:700;
  background:linear-gradient(180deg,#120a24 0%,#07061a 100%);color:#ff2bd6;border:1px solid #ff2bd6;
  border-radius:6px;padding:10px 14px;cursor:pointer;letter-spacing:.14em;font-size:11px;text-transform:uppercase;
  box-shadow:0 0 16px rgba(255,43,214,.35),inset 0 0 12px rgba(255,43,214,.08);transition:box-shadow .2s,transform .15s}
#metro-fab:hover{box-shadow:0 0 24px rgba(255,43,214,.55);transform:translateY(-1px)}
#metro-panel{position:fixed;right:18px;bottom:64px;z-index:9999;width:320px;display:none;
  font-family:'IBM Plex Mono',monospace;background:rgba(7,6,26,.97);color:#eafdff;
  border:2px solid #00e5ff;border-radius:4px;padding:0;overflow:hidden;
  box-shadow:0 0 32px rgba(0,229,255,.22),0 0 48px rgba(255,43,214,.12),inset 0 0 40px rgba(0,229,255,.04)}
#metro-panel::before{content:'';position:absolute;inset:0;pointer-events:none;
  background:repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(0,229,255,.03) 3px,rgba(0,229,255,.03) 4px)}
#metro-panel.open{display:block;animation:metroIn .28s ease-out}
@keyframes metroIn{from{opacity:0;transform:translateY(8px) scale(.98)}to{opacity:1;transform:none}}
#metro-panel .head{background:linear-gradient(90deg,rgba(18,10,36,.95),rgba(10,24,48,.85));padding:14px 16px 12px;
  border-bottom:1px solid rgba(0,229,255,.35)}
#metro-panel h3{margin:0;color:#00e5ff;font-family:'Orbitron',monospace;font-size:12px;letter-spacing:.16em;
  display:flex;justify-content:space-between;align-items:center;text-transform:uppercase;font-weight:700}
#metro-panel .sub{margin:6px 0 0;font-size:10px;color:#5a6172;letter-spacing:.06em}
#metro-panel .body{padding:12px 16px 14px}
#metro-panel .x{cursor:pointer;color:#6b7184;font-size:14px;transition:color .15s}
#metro-panel .x:hover{color:#ff3b6b}
#metro-panel .row{display:flex;justify-content:space-between;align-items:center;margin:8px 0;font-size:11px}
#metro-panel .muted{color:#6b7184;letter-spacing:.04em;text-transform:uppercase;font-size:10px}
#metro-panel .big{color:#39ff88;font-size:14px;font-weight:600}
#metro-panel .metro-big{color:#ff2bd6;font-size:14px;font-weight:600}
#metro-panel input{background:#05030d;border:1px solid #2a2440;color:#eafdff;border-radius:4px;padding:7px 9px;
  font-family:inherit;font-size:11px;width:100%;transition:border-color .15s,box-shadow .15s}
#metro-panel input:focus{outline:none;border-color:#00e5ff;box-shadow:0 0 10px rgba(0,229,255,.25)}
#metro-panel button{background:#0e0c1c;border:1px solid #00e5ff;color:#eafdff;border-radius:4px;padding:7px 12px;
  cursor:pointer;font-family:'Orbitron',monospace;font-size:10px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;
  transition:box-shadow .15s,background .15s}
#metro-panel button:hover:not(:disabled){box-shadow:0 0 12px rgba(0,229,255,.45);background:#141030}
#metro-panel button.accent{border-color:#ff2bd6;color:#ff2bd6}
#metro-panel button.accent:hover:not(:disabled){box-shadow:0 0 12px rgba(255,43,214,.4)}
#metro-panel button:disabled{opacity:.35;cursor:not-allowed;box-shadow:none}
#metro-panel .sep{border-top:1px solid rgba(42,36,64,.8);margin:12px 0}
#metro-panel .status{min-height:16px;font-size:10px;color:#f7ff3c;margin-top:10px;word-break:break-word;line-height:1.4}
#metro-panel .pill{font-size:9px;color:#9aa3b2;border:1px solid #2a2440;border-radius:12px;padding:2px 8px;letter-spacing:.06em}
#metro-panel .strip{margin-top:10px;padding:8px 10px;background:rgba(14,24,48,.5);border:1px solid rgba(0,229,255,.2);
  font-size:9px;color:#4a5266;text-align:center;letter-spacing:.08em;text-transform:uppercase}
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
    <div class="head">
      <h3>◈ $METRO BRIDGE <span class="x" id="m-x">✕</span></h3>
      <div class="sub">premium economy · world market · crucible contests</div>
    </div>
    <div class="body">
      <div class="row"><span class="muted">network</span><span class="pill">${st.cluster}${st.mainnetLive ? " · LIVE" : " · rehearsal"}</span></div>
      <div class="row"><span class="muted">wallet</span><span id="m-wallet">—</span></div>
      <div class="row"><button id="m-connect">Connect Wallet</button><input id="m-addr" placeholder="or paste address" style="display:none"/></div>
      <div class="sep"></div>
      <div class="row"><span class="muted">token</span><span class="pill">1B fixed supply</span></div>
      <div class="row"><span class="muted">player</span><span id="m-player">—</span></div>
      <div class="row"><span class="muted">credits</span><span id="m-credits" class="big">—</span></div>
      <div class="row"><span class="muted">in-game $METRO</span><span id="m-metro" class="metro-big">—</span></div>
      <div class="row"><span class="muted">≈ credit value</span><span id="m-value">—</span></div>
      <div class="sep"></div>
      <div class="row"><span class="muted">withdraw → $METRO</span></div>
      <div class="row"><input id="m-amt" type="number" min="0" placeholder="credits to bridge out"/></div>
      <div class="row"><button id="m-withdraw" class="accent">Withdraw</button><button id="m-refresh">Refresh</button></div>
      <div class="row"><span class="muted">deposit $METRO → credits</span><span class="pill">2c-2</span></div>
      <div class="row"><button id="m-deposit" disabled title="needs the devnet mint (2c-2)">Deposit (soon)</button></div>
      <div class="strip">world market · pvp buy-in · cross-zone trade</div>
      <div class="status" id="m-status"></div>
    </div>
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
        $("m-metro").textContent = `◈ ${fmtMetro(r.metro ?? 0)}`;
        $("m-value").textContent = `${fmtMetro(r.metroValue)} $METRO`;
      } else {
        $("m-credits").textContent = "—";
        $("m-metro").textContent = "—";
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
      status(r.ok ? `✓ withdrew ${r.credits} credits → ${fmtMetro(r.metro)} $METRO` : `✗ ${r.reason}`);
      void refresh();
    } catch {
      status("withdraw failed (server unreachable)");
    }
  };

  if (addrInput) addrInput.onchange = () => void refresh();
}
