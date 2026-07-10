// METROPHAGE — $METRO bridge panel (Phase 5 · 2c). A DOM overlay (the game is a
// canvas; a wallet/finance UI is far better as HTML). DORMANT BY DEFAULT: mounts only
// when `metroEnabled`, so with no CA the game shows nothing crypto.
//
// $0-LAUNCH withdraw: the server returns a CLAIM (payout tx, player = fee payer,
// treasury-signed). The wallet signs + submits it here, then /metro/withdraw/confirm
// finalizes. Against the devnet-sim settlement the claim auto-confirms, so the whole
// flow works with no chain at all.

import { metroEnabled, getMetroStatus, metroApiBase, metroRpc, fmtMetro } from "../economy/metro";
import { walletAvailable, connectWallet, disconnectWallet, connectedWallet } from "../economy/wallet";
import { submitClaim } from "../economy/claim";

const short = (a: string) => (a.length > 10 ? `${a.slice(0, 4)}…${a.slice(-4)}` : a);

const STYLE = `
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600;700&family=Orbitron:wght@500;700;900&display=swap');
#metro-fab{position:fixed;right:18px;bottom:150px;z-index:9999;font-family:'Orbitron',monospace;font-weight:700;
  background:linear-gradient(180deg,#120a24 0%,#07061a 100%);color:#ff2bd6;border:1px solid #ff2bd6;
  border-radius:6px;padding:10px 14px;cursor:pointer;letter-spacing:.14em;font-size:11px;text-transform:uppercase;
  box-shadow:0 0 16px rgba(255,43,214,.35),inset 0 0 12px rgba(255,43,214,.08);transition:box-shadow .2s,transform .15s}
#metro-fab:hover{box-shadow:0 0 24px rgba(255,43,214,.55);transform:translateY(-1px)}
#metro-panel{position:fixed;right:18px;bottom:196px;z-index:9999;width:320px;display:none;
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
      <div class="sub">₵ credits = play currency · ◈ $METRO = on-chain bridge · ${st.mainnetLive ? "MAINNET LIVE" : st.enabled ? "MINT SET — check settlement" : "AWAITING MINT CA"}</div>
    </div>
    <div class="body">
      <div class="row"><span class="muted">network</span><span class="pill">${st.cluster}${st.mainnetLive ? " · ARMED" : st.mainnetArmed ? " · arm flag only" : " · not armed"}</span></div>
      <div class="row"><span class="muted">cash-out pool</span><span id="m-pool" class="metro-big">—</span></div>
      <div class="row"><span class="muted">rates</span><span class="pill" id="m-rates">—</span></div>
      <div class="strip" id="m-phase">loading pool status…</div>
      <div class="sep"></div>
      <div class="row"><span class="muted">wallet</span><span id="m-wallet">—</span></div>
      <div class="row"><button id="m-connect">Connect Wallet</button><input id="m-addr" placeholder="or paste address" style="display:none"/></div>
      <div class="row"><span class="muted">player</span><span id="m-player">—</span></div>
      <div class="row"><span class="muted">credits</span><span id="m-credits" class="big">—</span></div>
      <div class="row"><span class="muted">≈ cash-out value</span><span id="m-value">—</span></div>
      <div class="sep"></div>
      <div class="row"><span class="muted">deposit — send ◈ to the treasury, then claim it here</span></div>
      <div class="row"><span class="muted">treasury</span><span id="m-treasury" class="pill" style="cursor:pointer" title="click to copy">—</span></div>
      <div class="row"><input id="m-txsig" placeholder="paste your transfer's tx signature"/></div>
      <div class="row"><input id="m-dep-amt" type="number" min="0" step="any" placeholder="$METRO sent" style="width:46%"/><button id="m-deposit">Claim Deposit</button></div>
      <div class="sep"></div>
      <div class="row"><span class="muted">withdraw — burn credits, receive ◈ from the pool (your wallet pays the tiny network fee)</span></div>
      <div class="row"><input id="m-amt" type="number" min="0" placeholder="credits to cash out" style="width:58%"/><button id="m-max" title="max you can cash out right now">MAX</button></div>
      <div class="row"><button id="m-withdraw" class="accent">Withdraw</button><button id="m-refresh">Refresh</button></div>
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

  // latest server truth, cached for the MAX button
  let acct: { credits: number; dailyCapCredits: number; dailyUsedCredits: number; minWithdrawCredits: number } | null = null;
  let pool: {
    poolMetro: number;
    phase: string;
    withdrawCreditsPerMetro: number;
    depositCreditsPerMetro: number;
    treasury?: string;
    settlement?: string; // "sim" (rehearsal) | "solana" (real chain)
  } | null = null;

  const refreshPool = async () => {
    try {
      const p = await fetch(`${metroApiBase()}/metro/pool`).then((x) => x.json());
      if (!p.ok) return;
      pool = p;
      $("m-pool").textContent = `◈ ${fmtMetro(p.poolMetro)}`;
      $("m-rates").textContent = `in: 1◈ → ${p.depositCreditsPerMetro}₵ · out: ${p.withdrawCreditsPerMetro}₵ → 1◈`;
      $("m-phase").textContent =
        p.phase === "bootstrap"
          ? "LAUNCH PHASE — the cash-out pool is 100% player-funded and starts empty. Every ◈ deposited opens cash-outs for everyone. Earn ₵ now; withdraw as the pool fills."
          : "POOL OPEN — withdrawals are paid from the player-funded pool, first come first served.";
      $("m-treasury").textContent = p.treasury ? short(p.treasury) : "rehearsal — any tx signature is accepted";
      if (p.treasury) $("m-treasury").dataset.full = p.treasury;
    } catch {
      /* pool row keeps its last value; account fetch reports reachability */
    }
  };

  const refresh = async () => {
    void refreshPool();
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
        acct = r;
        $("m-credits").textContent = `₵ ${r.credits}`;
        $("m-value").textContent = `◈ ${fmtMetro(r.metroValue)}`;
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

  // copy the treasury address on click — the deposit flow is "send ◈ there, claim here"
  $("m-treasury").onclick = () => {
    const full = $("m-treasury").dataset.full;
    if (!full) return;
    void navigator.clipboard?.writeText(full);
    status("treasury address copied — send $METRO there, then paste the tx signature");
  };

  // MAX = what the server would actually allow right now: balance, daily headroom,
  // and the live pool all cap it; below the floor there is no valid amount.
  $("m-max").onclick = () => {
    if (!acct || !pool) return status("refresh first");
    const capLeft = Math.max(0, acct.dailyCapCredits - acct.dailyUsedCredits);
    const poolCredits = Math.floor(pool.poolMetro * pool.withdrawCreditsPerMetro);
    const max = Math.min(acct.credits, capLeft, poolCredits);
    if (max < acct.minWithdrawCredits) {
      status(
        pool.poolMetro <= 0
          ? "pool is empty — cash-outs open as players deposit"
          : `max cash-out right now is under the ${acct.minWithdrawCredits}₵ floor`,
      );
      ($("m-amt") as HTMLInputElement).value = "";
      return;
    }
    ($("m-amt") as HTMLInputElement).value = String(max);
  };

  $("m-deposit").onclick = async () => {
    const player = getPlayerId();
    const wallet = currentWallet();
    const txSig = ($("m-txsig") as HTMLInputElement).value.trim();
    const metro = Number(($("m-dep-amt") as HTMLInputElement).value);
    if (!player) return status("log in online first");
    if (!wallet) return status("connect or paste a wallet address");
    if (!txSig) return status("paste the tx signature of your $METRO transfer");
    if (!(metro > 0)) return status("enter how much $METRO you sent");
    status("verifying deposit on-chain…");
    try {
      const r = await fetch(`${metroApiBase()}/metro/deposit`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ player, wallet, txSig, metro }),
      }).then((x) => x.json());
      status(r.ok ? `✓ deposited ◈ ${fmtMetro(r.metro)} → +${r.credits}₵ (pool grew for everyone)` : `✗ ${r.reason}`);
      void refresh();
    } catch {
      status("deposit failed (server unreachable)");
    }
  };

  // finalize a claim server-side; polls briefly because a just-submitted tx can take a
  // few seconds to reach "confirmed" on the RPC the server reads from
  const confirmClaim = async (player: string, withdrawId: number, txSig: string): Promise<{ ok: boolean; reason?: string; metro?: number; credits?: number }> => {
    let last: { ok: boolean; reason?: string; metro?: number; credits?: number } = { ok: false, reason: "no attempt" };
    for (let i = 0; i < 10; i++) {
      last = await fetch(`${metroApiBase()}/metro/withdraw/confirm`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ player, withdrawId, txSig }),
      }).then((x) => x.json());
      if (last.ok || !/not found on-chain/.test(last.reason ?? "")) return last;
      await new Promise((res) => setTimeout(res, 1500));
    }
    return last;
  };

  // $0-LAUNCH WITHDRAW: the server returns a CLAIM — a payout tx the player signs and
  // pays the (tiny) network fee on. The treasury only ever signs; it never spends SOL.
  $("m-withdraw").onclick = async () => {
    const player = getPlayerId();
    const wallet = currentWallet();
    const credits = Math.floor(Number(($("m-amt") as HTMLInputElement).value));
    if (!player) return status("log in online first");
    if (!wallet) return status("connect or paste a wallet address");
    if (!(credits > 0)) return status("enter a credit amount");
    status("requesting cash-out claim…");
    try {
      const r = await fetch(`${metroApiBase()}/metro/withdraw`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ player, wallet, credits }),
      }).then((x) => x.json());
      if (!r.ok) {
        status(`✗ ${r.reason}`);
        void refresh();
        return;
      }
      // rehearsal settlement — no chain, confirm straight through
      if (pool?.settlement !== "solana" || String(r.claimTx).startsWith("devnet-sim-claim:")) {
        const c = await confirmClaim(player, r.withdrawId, `sim:${r.withdrawId}:${Date.now()}`);
        status(c.ok ? `✓ cashed out ${r.credits}₵ → ◈ ${fmtMetro(r.metro)} (rehearsal settlement)` : `✗ ${c.reason}`);
        void refresh();
        return;
      }
      // real chain: the wallet signs + submits; the player pays the network fee
      status("sign the payout in your wallet — you pay the network fee (≈0.000005 SOL)…");
      const sub = await submitClaim(r.claimTx, metroRpc());
      if (!sub.ok || !sub.sig) {
        status(`✗ ${sub.reason ?? "claim not submitted"} — unclaimed credits auto-refund in ~10 min`);
        void refresh();
        return;
      }
      status("payout submitted — confirming on-chain…");
      const c = await confirmClaim(player, r.withdrawId, sub.sig);
      status(c.ok ? `✓ cashed out ${r.credits}₵ → ◈ ${fmtMetro(r.metro)} landed in your wallet` : `✗ ${c.reason}`);
      void refresh();
    } catch {
      status("withdraw failed (server unreachable)");
    }
  };

  if (addrInput) addrInput.onchange = () => void refresh();
}
