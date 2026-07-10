// METROPHAGE — $METRO bridge panel (Robinhood Chain ERC-20).
// One-click MetaMask deposit, empty-pool honesty, sim-lock fail-loud, treasury gas warn.

import {
  metroEnabled,
  getMetroStatus,
  metroApiBase,
  metroRpc,
  fmtMetro,
  metroIsEvm,
  METRO_MINT,
} from "../economy/metro";
import {
  walletAvailable,
  connectWallet,
  disconnectWallet,
  connectedWallet,
  signWalletLogin,
  ensureRobinhoodNetwork,
} from "../economy/wallet";
import { submitClaim } from "../economy/claim";
import { sendErc20Deposit } from "../economy/erc20Deposit";
import { loginMessage } from "../net/protocol";
import { ROBINHOOD_TESTNET, ROBINHOOD_MAINNET } from "../economy/robinhoodChain";

const short = (a: string) => (a.length > 10 ? `${a.slice(0, 4)}…${a.slice(-4)}` : a);

const STYLE = `
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600;700&family=Orbitron:wght@500;700;900&display=swap');
#metro-fab{position:fixed;right:18px;bottom:150px;z-index:9999;font-family:'Orbitron',monospace;font-weight:700;
  background:linear-gradient(180deg,#120a24 0%,#07061a 100%);color:#ff2bd6;border:1px solid #ff2bd6;
  border-radius:6px;padding:10px 14px;cursor:pointer;letter-spacing:.14em;font-size:11px;text-transform:uppercase;
  box-shadow:0 0 16px rgba(255,43,214,.35),inset 0 0 12px rgba(255,43,214,.08);transition:box-shadow .2s,transform .15s}
#metro-fab:hover{box-shadow:0 0 24px rgba(255,43,214,.55);transform:translateY(-1px)}
#metro-fab.warn{border-color:#f7ff3c;color:#f7ff3c}
#metro-panel{position:fixed;right:18px;bottom:196px;z-index:9999;width:340px;display:none;
  font-family:'IBM Plex Mono',monospace;background:rgba(7,6,26,.97);color:#eafdff;
  border:2px solid #00e5ff;border-radius:4px;padding:0;overflow:hidden;max-height:min(90vh,640px);overflow-y:auto;
  box-shadow:0 0 32px rgba(0,229,255,.22),0 0 48px rgba(255,43,214,.12),inset 0 0 40px rgba(0,229,255,.04)}
#metro-panel.open{display:block;animation:metroIn .28s ease-out}
@keyframes metroIn{from{opacity:0;transform:translateY(8px) scale(.98)}to{opacity:1;transform:none}}
#metro-panel .head{background:linear-gradient(90deg,rgba(18,10,36,.95),rgba(10,24,48,.85));padding:14px 16px 12px;
  border-bottom:1px solid rgba(0,229,255,.35)}
#metro-panel h3{margin:0;color:#00e5ff;font-family:'Orbitron',monospace;font-size:12px;letter-spacing:.16em;
  display:flex;justify-content:space-between;align-items:center;text-transform:uppercase;font-weight:700}
#metro-panel .sub{margin:6px 0 0;font-size:10px;color:#5a6172;letter-spacing:.06em;line-height:1.45}
#metro-panel .body{padding:12px 16px 14px}
#metro-panel .x{cursor:pointer;color:#6b7184;font-size:14px}
#metro-panel .x:hover{color:#ff3b6b}
#metro-panel .row{display:flex;justify-content:space-between;align-items:center;margin:8px 0;font-size:11px;gap:8px}
#metro-panel .muted{color:#6b7184;letter-spacing:.04em;text-transform:uppercase;font-size:10px}
#metro-panel .big{color:#39ff88;font-size:14px;font-weight:600}
#metro-panel .metro-big{color:#ff2bd6;font-size:14px;font-weight:600}
#metro-panel input{background:#05030d;border:1px solid #2a2440;color:#eafdff;border-radius:4px;padding:7px 9px;
  font-family:inherit;font-size:11px;width:100%;box-sizing:border-box}
#metro-panel input:focus{outline:none;border-color:#00e5ff}
#metro-panel button{background:#0e0c1c;border:1px solid #00e5ff;color:#eafdff;border-radius:4px;padding:7px 12px;
  cursor:pointer;font-family:'Orbitron',monospace;font-size:10px;font-weight:600;letter-spacing:.08em;text-transform:uppercase}
#metro-panel button:hover:not(:disabled){box-shadow:0 0 12px rgba(0,229,255,.45)}
#metro-panel button.accent{border-color:#ff2bd6;color:#ff2bd6}
#metro-panel button:disabled{opacity:.35;cursor:not-allowed}
#metro-panel .sep{border-top:1px solid rgba(42,36,64,.8);margin:12px 0}
#metro-panel .status{min-height:16px;font-size:10px;color:#f7ff3c;margin-top:10px;word-break:break-word;line-height:1.4}
#metro-panel .pill{font-size:9px;color:#9aa3b2;border:1px solid #2a2440;border-radius:12px;padding:2px 8px}
#metro-panel .strip{margin-top:8px;padding:8px 10px;background:rgba(14,24,48,.5);border:1px solid rgba(0,229,255,.2);
  font-size:9px;color:#4a5266;text-align:center;letter-spacing:.04em;line-height:1.45;text-transform:none}
#metro-panel .strip.warn{border-color:rgba(255,59,107,.45);color:#ff8a9a}
#metro-panel .strip.ok{border-color:rgba(57,255,136,.35);color:#9dffc0}
#metro-panel a.link{color:#00e5ff;font-size:10px}
`;

export function mountMetroPanel(getPlayerId: () => string | null): void {
  if (!metroEnabled) return;
  const st = getMetroStatus();

  const style = document.createElement("style");
  style.textContent = STYLE;
  document.head.appendChild(style);

  const fab = document.createElement("button");
  fab.id = "metro-fab";
  fab.textContent = "◈ $METRO";
  document.body.appendChild(fab);

  const explorer =
    st.chainId === 4663 ? ROBINHOOD_MAINNET.explorerUrl : ROBINHOOD_TESTNET.explorerUrl;

  const panel = document.createElement("div");
  panel.id = "metro-panel";
  panel.innerHTML = `
    <div class="head">
      <h3>◈ $METRO BRIDGE <span class="x" id="m-x">✕</span></h3>
      <div class="sub">Robinhood <b>Chain</b> (ETH L2) — not the Robinhood stock app.
        ${st.networkName}${st.chainId ? ` · id ${st.chainId}` : ""} · pool player-funded · mainnet ${st.mainnetLive ? "LIVE" : "OFF until counsel"}</div>
    </div>
    <div class="body">
      <div class="row"><span class="muted">network</span><span class="pill" id="m-net">${(st.networkName || st.chain).toUpperCase()}</span></div>
      <div class="row"><span class="muted">cash-out pool</span><span id="m-pool" class="metro-big">—</span></div>
      <div class="row"><span class="muted">rates</span><span class="pill" id="m-rates">—</span></div>
      <div class="strip" id="m-phase">loading pool status…</div>
      <div class="strip" id="m-treasury-health" style="display:none"></div>
      <div class="sep"></div>
      <div class="row"><span class="muted">how to get ◈</span>
        <a class="link" id="m-get" href="${explorer}" target="_blank" rel="noopener">explorer ↗</a></div>
      <div class="strip" id="m-get-hint">Earn ₵ in-game. Cash-out needs pool $METRO from player deposits. Buy/transfer $METRO on Robinhood Chain (MetaMask), not the Robinhood brokerage app.</div>
      <div class="sep"></div>
      <div class="row"><span class="muted">wallet</span><span id="m-wallet">—</span></div>
      <div class="row"><button id="m-connect">Connect MetaMask</button><input id="m-addr" placeholder="or paste 0x address" style="display:none"/></div>
      <div class="row"><span class="muted">player</span><span id="m-player">—</span></div>
      <div class="row"><span class="muted">credits</span><span id="m-credits" class="big">—</span></div>
      <div class="row"><span class="muted">≈ cash-out value</span><span id="m-value">—</span></div>
      <div class="sep"></div>
      <div class="row"><span class="muted">deposit $METRO → ₵</span></div>
      <div class="row"><span class="muted">treasury</span><span id="m-treasury" class="pill" style="cursor:pointer" title="copy">—</span></div>
      <div class="row"><input id="m-dep-amt" type="number" min="0" step="any" placeholder="$METRO amount" style="width:48%"/>
        <button id="m-send" class="accent">Send via MetaMask</button></div>
      <div class="row"><input id="m-txsig" placeholder="tx hash (auto-filled after send)"/></div>
      <div class="row"><button id="m-deposit">Claim deposit → ₵</button></div>
      <div class="sep"></div>
      <div class="row"><span class="muted">withdraw ₵ → $METRO</span></div>
      <div class="row"><input id="m-amt" type="number" min="0" placeholder="credits to cash out" style="width:58%"/><button id="m-max">MAX</button></div>
      <div class="row"><button id="m-withdraw" class="accent">Withdraw</button><button id="m-refresh">Refresh</button></div>
      <div class="status" id="m-status"></div>
    </div>
  `;
  document.body.appendChild(panel);

  const $ = (id: string) => panel.querySelector<HTMLElement>("#" + id)!;
  const status = (msg: string) => ($("m-status").textContent = msg);
  const addrInput = $("m-addr") as HTMLInputElement;

  if (!walletAvailable()) {
    ($("m-connect") as HTMLButtonElement).textContent = "No MetaMask — paste 0x";
    addrInput.style.display = "block";
  }

  const currentWallet = (): string => connectedWallet() ?? addrInput.value.trim();

  let acct: {
    credits: number;
    dailyCapCredits: number;
    dailyUsedCredits: number;
    minWithdrawCredits: number;
  } | null = null;
  let pool: {
    poolMetro: number;
    phase: string;
    withdrawCreditsPerMetro: number;
    depositCreditsPerMetro: number;
    minWithdrawCredits?: number;
    treasury?: string;
    settlement?: string;
    dangerousSim?: boolean;
    treasuryWarn?: string;
    treasuryEth?: string;
    treasuryMetro?: string;
    getMetroHint?: string;
    note?: string;
  } | null = null;

  const refreshPool = async () => {
    try {
      const p = await fetch(`${metroApiBase()}/metro/pool`).then((x) => x.json());
      if (!p.ok && !p.poolMetro && p.poolMetro !== 0) {
        if (p.reason) status(p.reason);
        return;
      }
      pool = p;
      $("m-pool").textContent = `◈ ${fmtMetro(p.poolMetro ?? 0)}`;
      $("m-rates").textContent = `in: 1◈ → ${p.depositCreditsPerMetro}₵ · out: ${p.withdrawCreditsPerMetro}₵ → 1◈ · min ${p.minWithdrawCredits ?? 250}₵`;

      const phaseEl = $("m-phase");
      phaseEl.classList.remove("warn", "ok");
      if (p.dangerousSim) {
        phaseEl.classList.add("warn");
        phaseEl.textContent =
          "⚠ BRIDGE LOCKED — mint configured but settlement is still SIM. Deposits rejected (no fake credits). Fix server secrets / arm, or unset client mint.";
        fab.classList.add("warn");
      } else if (p.phase === "bootstrap" || (p.poolMetro ?? 0) <= 0) {
        phaseEl.classList.add("warn");
        phaseEl.textContent =
          "Pool EMPTY — cash-outs closed until someone deposits $METRO on Robinhood Chain. Earn ₵ now; withdraw when the pool fills. Not a faucet.";
      } else if (p.settlement === "sim") {
        phaseEl.textContent = "REHEARSAL (sim) — not real chain value. OK for local smoke only.";
      } else {
        phaseEl.classList.add("ok");
        phaseEl.textContent = `POOL OPEN on ${p.networkName || "Robinhood Chain"} — deposit via MetaMask · cash-out is treasury-signed (treasury pays ETH gas).`;
      }

      if (p.getMetroHint) $("m-get-hint").textContent = p.getMetroHint;
      $("m-treasury").textContent = p.treasury ? short(p.treasury) : "—";
      if (p.treasury) $("m-treasury").dataset.full = p.treasury;

      const th = $("m-treasury-health");
      if (p.treasuryWarn || p.treasuryEth) {
        th.style.display = "block";
        th.classList.toggle("warn", !!p.treasuryWarn);
        th.textContent = p.treasuryWarn
          ? `⚠ ${p.treasuryWarn} (ETH ${p.treasuryEth ?? "?"} · $METRO ${p.treasuryMetro ?? "?"})`
          : `Treasury OK · ETH ${p.treasuryEth} · $METRO ${p.treasuryMetro}`;
      } else {
        th.style.display = "none";
      }

      if (p.mint && METRO_MINT) {
        ($("m-get") as HTMLAnchorElement).href = `${explorer}/token/${METRO_MINT}`;
      }
    } catch {
      status("pool unreachable");
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
      status("paste a 0x address or install MetaMask");
      return;
    }
    if (connectedWallet()) {
      await disconnectWallet();
      $("m-wallet").textContent = "—";
      ($("m-connect") as HTMLButtonElement).textContent = "Connect MetaMask";
      return;
    }
    status("switching MetaMask to Robinhood Chain…");
    await ensureRobinhoodNetwork();
    const addr = await connectWallet();
    if (addr) {
      $("m-wallet").textContent = short(addr);
      ($("m-connect") as HTMLButtonElement).textContent = "Disconnect";
      status("MetaMask on Robinhood Chain");
    } else status("connect cancelled");
  };

  $("m-treasury").onclick = () => {
    const full = $("m-treasury").dataset.full;
    if (!full) return;
    void navigator.clipboard?.writeText(full);
    status("treasury copied — use Send via MetaMask or transfer $METRO there");
  };

  $("m-max").onclick = () => {
    if (!acct || !pool) return status("refresh first");
    const capLeft = Math.max(0, acct.dailyCapCredits - acct.dailyUsedCredits);
    const poolCredits = Math.floor(pool.poolMetro * pool.withdrawCreditsPerMetro);
    const max = Math.min(acct.credits, capLeft, poolCredits);
    const floor = acct.minWithdrawCredits ?? pool.minWithdrawCredits ?? 250;
    if (max < floor) {
      status(
        pool.poolMetro <= 0
          ? "pool is empty — deposit $METRO first (or wait for other players)"
          : `under min cash-out (${floor}₵)`,
      );
      ($("m-amt") as HTMLInputElement).value = "";
      return;
    }
    ($("m-amt") as HTMLInputElement).value = String(max);
  };

  /** Always re-sign for live money (fresh ≤2 min). */
  async function walletAuth(wallet: string): Promise<{ sig?: string; ts?: number; error?: string }> {
    if (pool?.settlement === "sim" || !pool?.settlement) return {};
    if (pool.dangerousSim) return { error: "bridge locked (sim+mint)" };
    const ts = Date.now();
    const signed = await signWalletLogin(loginMessage(wallet, ts), wallet);
    if (!signed) return { error: "MetaMask signature cancelled" };
    return { sig: signed.signature, ts };
  }

  // One-click MetaMask ERC-20 transfer → auto-fill hash → claim
  $("m-send").onclick = async () => {
    if (!metroIsEvm) return status("one-click deposit is ERC-20 / Robinhood only");
    const treasury = pool?.treasury || $("m-treasury").dataset.full;
    const amount = Number(($("m-dep-amt") as HTMLInputElement).value);
    if (!treasury) return status("refresh — no treasury address yet");
    if (!(amount > 0)) return status("enter $METRO amount to send");
    if (!connectedWallet()) {
      status("connect MetaMask first");
      return;
    }
    if (pool?.dangerousSim) return status("bridge locked — cannot deposit while settlement is sim");
    status("approve $METRO transfer in MetaMask (you pay RH ETH gas)…");
    const sent = await sendErc20Deposit({ treasury, amount });
    if (!sent.ok || !sent.txHash) {
      status(`✗ ${sent.reason ?? "send failed"}`);
      return;
    }
    ($("m-txsig") as HTMLInputElement).value = sent.txHash;
    status("tx sent — waiting a few seconds then claiming deposit…");
    await new Promise((r) => setTimeout(r, 4000));
    ($("m-deposit") as HTMLButtonElement).click();
  };

  $("m-deposit").onclick = async () => {
    const player = getPlayerId();
    const wallet = currentWallet();
    const txSig = ($("m-txsig") as HTMLInputElement).value.trim();
    const metro = Number(($("m-dep-amt") as HTMLInputElement).value);
    if (!player) return status("log in online first");
    if (!wallet) return status("connect MetaMask");
    if (!txSig) return status("send via MetaMask or paste tx hash");
    if (pool?.dangerousSim) return status("bridge locked (sim+mint)");
    status("verifying deposit on-chain (amount from Transfer logs, not your form)…");
    try {
      const auth = await walletAuth(wallet);
      if (auth.error) return status(`✗ ${auth.error}`);
      const r = await fetch(`${metroApiBase()}/metro/deposit`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ player, wallet, txSig, metro: metro || 0, sig: auth.sig, ts: auth.ts }),
      }).then((x) => x.json());
      status(r.ok ? `✓ deposited ◈ ${fmtMetro(r.metro)} → +${r.credits}₵` : `✗ ${r.reason}`);
      void refresh();
    } catch {
      status("deposit failed (server unreachable)");
    }
  };

  const confirmClaim = async (
    player: string,
    withdrawId: number,
    txSig: string,
    auth: { sig?: string; ts?: number },
  ): Promise<{ ok: boolean; reason?: string; metro?: number; credits?: number }> => {
    let last: { ok: boolean; reason?: string; metro?: number; credits?: number } = { ok: false, reason: "no attempt" };
    for (let i = 0; i < 12; i++) {
      last = await fetch(`${metroApiBase()}/metro/withdraw/confirm`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ player, withdrawId, txSig, wallet: currentWallet(), ...auth }),
      }).then((x) => x.json());
      if (last.ok || !/not found on-chain/.test(last.reason ?? "")) return last;
      await new Promise((res) => setTimeout(res, 1500));
    }
    return last;
  };

  $("m-withdraw").onclick = async () => {
    const player = getPlayerId();
    const wallet = currentWallet();
    const credits = Math.floor(Number(($("m-amt") as HTMLInputElement).value));
    if (!player) return status("log in online first");
    if (!wallet) return status("connect MetaMask");
    if (!(credits > 0)) return status("enter a credit amount");
    if (pool?.dangerousSim) return status("bridge locked (sim+mint)");
    if (pool && pool.poolMetro <= 0) return status("pool empty — deposit $METRO first");
    status("requesting cash-out…");
    try {
      const auth = await walletAuth(wallet);
      if (auth.error) return status(`✗ ${auth.error}`);
      const r = await fetch(`${metroApiBase()}/metro/withdraw`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ player, wallet, credits, sig: auth.sig, ts: auth.ts }),
      }).then((x) => x.json());
      if (!r.ok) {
        status(`✗ ${r.reason}`);
        void refresh();
        return;
      }
      const sim =
        !pool?.settlement || pool.settlement === "sim" || String(r.claimTx).startsWith("devnet-sim-claim:");
      if (sim) {
        const c = await confirmClaim(player, r.withdrawId, `sim:${r.withdrawId}:${Date.now()}`, auth);
        status(c.ok ? `✓ cashed out ${r.credits}₵ → ◈ ${fmtMetro(r.metro)} (sim)` : `✗ ${c.reason}`);
        void refresh();
        return;
      }
      status("broadcasting treasury-signed payout on Robinhood Chain…");
      const sub = await submitClaim(r.claimTx, metroRpc());
      if (!sub.ok || !sub.sig) {
        status(`✗ ${sub.reason ?? "broadcast failed"} — credits auto-refund in ~10 min if unconfirmed`);
        void refresh();
        return;
      }
      status("confirming on-chain…");
      const c = await confirmClaim(player, r.withdrawId, sub.sig, auth);
      status(c.ok ? `✓ cashed out ${r.credits}₵ → ◈ ${fmtMetro(r.metro)}` : `✗ ${c.reason}`);
      void refresh();
    } catch {
      status("withdraw failed (server unreachable)");
    }
  };

  if (addrInput) addrInput.onchange = () => void refresh();
}
