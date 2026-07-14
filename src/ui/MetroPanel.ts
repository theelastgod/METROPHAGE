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
#metro-fab{position:fixed;right:18px;bottom:150px;z-index:9999;min-height:42px;min-width:118px;
  font-family:'Orbitron',monospace;font-weight:700;background:linear-gradient(180deg,#15102a 0%,#060514 100%);
  color:#ff2bd6;border:1px solid #ff2bd6;border-radius:8px;padding:10px 14px;cursor:pointer;
  letter-spacing:.12em;font-size:11px;text-transform:uppercase;box-shadow:0 0 18px rgba(255,43,214,.34),inset 0 0 14px rgba(255,43,214,.08);
  transition:box-shadow .2s,transform .15s;touch-action:manipulation}
#metro-fab:hover{box-shadow:0 0 25px rgba(255,43,214,.55);transform:translateY(-1px)}
#metro-fab.warn{border-color:#f7ff3c;color:#f7ff3c;box-shadow:0 0 20px rgba(247,255,60,.28)}
#metro-panel{position:fixed;right:18px;bottom:198px;z-index:9999;width:min(440px,calc(100vw - 36px));display:none;
  font-family:'IBM Plex Mono',monospace;background:rgba(6,6,18,.98);color:#eafdff;border:1px solid rgba(0,229,255,.92);
  border-radius:8px;overflow:hidden;max-height:min(86dvh,720px);overflow-y:auto;overscroll-behavior:contain;
  box-shadow:0 0 34px rgba(0,229,255,.24),0 0 58px rgba(255,43,214,.13),inset 0 0 42px rgba(0,229,255,.04)}
#metro-panel *{box-sizing:border-box}
#metro-panel.open{display:block;animation:metroIn .24s ease-out}
@keyframes metroIn{from{opacity:0;transform:translateY(10px) scale(.985)}to{opacity:1;transform:none}}
#metro-panel .head{position:sticky;top:0;z-index:2;background:linear-gradient(95deg,rgba(18,10,36,.98),rgba(5,20,32,.96));
  padding:15px 16px 13px;border-bottom:1px solid rgba(0,229,255,.35)}
#metro-panel .titlebar{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
#metro-panel .eyebrow{font-size:9px;color:#9aa3b2;letter-spacing:.1em;text-transform:uppercase}
#metro-panel h3{margin:2px 0 0;color:#00e5ff;font-family:'Orbitron',monospace;font-size:18px;letter-spacing:.08em;text-transform:uppercase;font-weight:800}
#metro-panel .sub{margin:7px 0 0;font-size:10px;color:#8b94a8;letter-spacing:.03em;line-height:1.45}
#metro-panel .body{padding:14px 16px 16px}
#metro-panel .x{width:34px;height:34px;display:grid;place-items:center;background:#090818;border:1px solid rgba(255,59,107,.5);
  color:#ff8a9a;border-radius:8px;font-size:15px;padding:0;line-height:1}
#metro-panel .x:hover{color:#ffffff;box-shadow:0 0 12px rgba(255,59,107,.36)}
#metro-panel .pool-band{display:grid;grid-template-columns:1fr auto;gap:12px;align-items:center;margin:0 0 10px;
  padding:13px 14px;border:1px solid rgba(0,229,255,.28);border-radius:8px;background:linear-gradient(135deg,rgba(0,229,255,.08),rgba(255,43,214,.055))}
#metro-panel .pool-band>*{min-width:0}
#metro-panel .pool-value{margin-top:3px;color:#ff2bd6;font-size:26px;font-weight:700;letter-spacing:.02em;overflow-wrap:anywhere}
#metro-panel .chip-stack{display:flex;flex-direction:column;align-items:flex-end;gap:6px}
#metro-panel .row{display:flex;justify-content:space-between;align-items:center;margin:8px 0;font-size:11px;gap:9px}
#metro-panel .row>*{min-width:0}
#metro-panel .row>*:last-child{text-align:right}
#metro-panel .muted{color:#7d879b;letter-spacing:.06em;text-transform:uppercase;font-size:10px}
#metro-panel .big{color:#39ff88;font-size:14px;font-weight:700}
#metro-panel .mono-value{color:#eafdff;font-size:11px;font-weight:600;word-break:break-word;overflow-wrap:anywhere}
#metro-panel .chip{font-size:9px;color:#b8c3d4;border:1px solid #2a3450;background:rgba(8,12,28,.82);border-radius:999px;padding:4px 9px;white-space:nowrap}
#metro-panel .chip.warn{border-color:rgba(247,255,60,.55);color:#f7ff3c}
#metro-panel .chip.ok{border-color:rgba(57,255,136,.5);color:#9dffc0}
#metro-panel .notice{margin:9px 0 0;padding:9px 10px;background:rgba(10,16,34,.72);border:1px solid rgba(0,229,255,.2);
  border-radius:8px;font-size:10px;color:#9aa3b2;letter-spacing:.02em;line-height:1.45}
#metro-panel .notice.warn{border-color:rgba(255,59,107,.48);color:#ff9aaa;background:rgba(50,8,22,.34)}
#metro-panel .notice.ok{border-color:rgba(57,255,136,.38);color:#9dffc0;background:rgba(8,34,22,.3)}
#metro-panel .metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:10px 0 2px}
#metro-panel .metric{padding:9px 8px;border-top:1px solid rgba(0,229,255,.24);border-bottom:1px solid rgba(255,43,214,.16);background:rgba(4,7,18,.55)}
#metro-panel .metric span{display:block;color:#7d879b;font-size:9px;text-transform:uppercase;letter-spacing:.06em}
#metro-panel .metric b{display:block;margin-top:4px;color:#eafdff;font-size:11px;line-height:1.25}
#metro-panel .section{margin-top:14px;padding-top:13px;border-top:1px solid rgba(42,52,80,.78)}
#metro-panel .section-title{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px;color:#00e5ff;
  font-family:'Orbitron',monospace;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase}
#metro-panel .section-title .hint{font-family:'IBM Plex Mono',monospace;font-size:9px;color:#7d879b;letter-spacing:.03em;text-transform:none;text-align:right}
#metro-panel .field-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:center;margin-top:8px}
#metro-panel .field-row.two{grid-template-columns:minmax(0,1fr) minmax(132px,auto)}
#metro-panel .action-row{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px}
#metro-panel input{min-height:36px;background:#050713;border:1px solid #28314d;color:#eafdff;border-radius:8px;padding:8px 10px;
  font-family:inherit;font-size:12px;width:100%;min-width:0;box-sizing:border-box;letter-spacing:0}
#metro-panel input:focus{outline:none;border-color:#00e5ff;box-shadow:0 0 0 2px rgba(0,229,255,.12)}
#metro-panel button{min-height:36px;background:#0d1022;border:1px solid #00e5ff;color:#eafdff;border-radius:8px;padding:8px 12px;
  cursor:pointer;font-family:'Orbitron',monospace;font-size:10px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;touch-action:manipulation;line-height:1.2;white-space:normal;overflow-wrap:anywhere}
#metro-panel button:hover:not(:disabled){box-shadow:0 0 12px rgba(0,229,255,.42)}
#metro-panel button.accent{border-color:#ff2bd6;color:#ff2bd6;background:rgba(255,43,214,.055)}
#metro-panel button.secondary{border-color:#394461;color:#c9d6e8}
#metro-panel button.copy{min-width:72px}
#metro-panel button:disabled{opacity:.35;cursor:not-allowed}
#metro-panel .status{position:sticky;bottom:0;margin:13px -16px -16px;padding:11px 16px;min-height:18px;font-size:10px;color:#f7ff3c;
  word-break:break-word;line-height:1.45;background:linear-gradient(180deg,rgba(6,6,18,.84),rgba(6,6,18,.98));border-top:1px solid rgba(247,255,60,.2)}
#metro-panel a.link{color:#00e5ff;font-size:10px;text-decoration:none}
#metro-panel a.link:hover{text-decoration:underline}
@media (max-width:700px){
  #metro-fab{right:12px;bottom:calc(env(safe-area-inset-bottom,0px) + 18px);min-width:112px}
  #metro-panel{left:10px;right:10px;bottom:calc(env(safe-area-inset-bottom,0px) + 70px);width:auto;max-height:calc(100dvh - 92px);border-radius:8px}
  #metro-panel .head{padding:13px 14px 11px}
  #metro-panel h3{font-size:16px}
  #metro-panel .body{padding:12px 12px 14px}
  #metro-panel .pool-band{grid-template-columns:1fr;gap:8px;padding:12px}
  #metro-panel .chip-stack{flex-direction:row;align-items:flex-start;justify-content:space-between}
  #metro-panel .pool-value{font-size:24px}
  #metro-panel .metrics{grid-template-columns:1fr}
  #metro-panel .field-row,#metro-panel .field-row.two,#metro-panel .action-row{grid-template-columns:1fr}
  #metro-panel .section-title{align-items:flex-start;flex-direction:column;gap:3px}
  #metro-panel .section-title .hint{text-align:left}
  #metro-panel .status{margin-left:-12px;margin-right:-12px;margin-bottom:-14px}
}
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
      <div class="titlebar">
        <div>
          <div class="eyebrow">Robinhood Chain bridge</div>
          <h3>◈ $METRO</h3>
        </div>
        <button class="x" id="m-x" aria-label="Close">×</button>
      </div>
      <div class="sub">${st.networkName}${st.chainId ? ` · id ${st.chainId}` : ""} · player-funded pool · mainnet ${st.mainnetLive ? "LIVE" : "OFF until counsel"}</div>
    </div>
    <div class="body">
      <div class="pool-band">
        <div>
          <div class="muted">cash-out pool</div>
          <div class="pool-value" id="m-pool">—</div>
        </div>
        <div class="chip-stack">
          <span class="chip" id="m-net">${(st.networkName || st.chain || "Robinhood").toUpperCase()}</span>
          <span class="chip" id="m-phase-pill">PRE-CA</span>
        </div>
      </div>
      <div class="notice" id="m-phase">Loading pool status…</div>
      <div class="notice" id="m-treasury-health" style="display:none"></div>
      <div class="notice" id="m-economy" style="display:none"></div>

      <div class="metrics">
        <div class="metric"><span>Deposit</span><b id="m-rate-in">—</b></div>
        <div class="metric"><span>Withdraw</span><b id="m-rate-out">—</b></div>
        <div class="metric"><span>Minimum</span><b id="m-rate-min">—</b></div>
      </div>

      <div class="section">
        <div class="section-title"><span>Chain Details</span><a class="link" id="m-get" href="${explorer}" target="_blank" rel="noopener">Explorer ↗</a></div>
        <div class="field-row">
          <div>
            <div class="muted">treasury</div>
            <div id="m-treasury" class="mono-value" title="copy">—</div>
          </div>
          <button id="m-copy-treasury" class="secondary copy">Copy</button>
        </div>
        <div class="notice" id="m-get-hint">Earn ₵ in-game. Cash-outs use the player-funded $METRO pool on Robinhood Chain.</div>
      </div>

      <div class="section">
        <div class="section-title"><span>Wallet</span><span class="hint">MetaMask on Robinhood Chain</span></div>
        <div class="row"><span class="muted">wallet</span><span id="m-wallet" class="mono-value">—</span></div>
        <div class="field-row two"><button id="m-connect">Connect MetaMask</button><input id="m-addr" placeholder="or paste 0x address" style="display:none"/></div>
        <div class="row"><span class="muted">player</span><span id="m-player" class="mono-value">—</span></div>
        <div class="row"><span class="muted">credits</span><span id="m-credits" class="big">—</span></div>
        <div class="row"><span class="muted">cash-out value</span><span id="m-value" class="mono-value">—</span></div>
        <div class="row"><span class="muted">daily cash-out</span><span id="m-daily" class="mono-value">—</span></div>
      </div>

      <div class="section" id="m-sec-deposit">
        <div class="section-title"><span>Deposit</span><span class="hint">$METRO → ₵</span></div>
        <div class="field-row two"><input id="m-dep-amt" type="number" min="0" step="any" placeholder="$METRO amount"/>
          <button id="m-send" class="accent">Send via MetaMask</button></div>
        <div class="field-row"><input id="m-txsig" placeholder="tx hash (auto-filled after send)"/></div>
        <div class="action-row"><button id="m-deposit">Claim deposit</button><button id="m-refresh" class="secondary">Refresh</button></div>
      </div>

      <div class="section" id="m-sec-withdraw">
        <div class="section-title"><span>Withdraw</span><span class="hint">₵ → $METRO</span></div>
        <div class="field-row two"><input id="m-amt" type="number" min="0" placeholder="credits to cash out"/><button id="m-max" class="secondary">MAX</button></div>
        <div class="action-row"><button id="m-withdraw" class="accent">Withdraw</button><button id="m-refresh-bottom" class="secondary">Refresh</button></div>
      </div>
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
    simLocked?: boolean;
    /** Backward compatibility with Workers deployed before the fail-closed rename. */
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
      $("m-net").textContent = String(p.networkName || p.chain || st.networkName || st.chain || "ROBINHOOD").toUpperCase();
      $("m-rate-in").textContent = `1◈ → ${p.depositCreditsPerMetro}₵`;
      $("m-rate-out").textContent = `${p.withdrawCreditsPerMetro}₵ → 1◈`;
      $("m-rate-min").textContent = `${p.minWithdrawCredits ?? 250}₵`;

      const phaseEl = $("m-phase");
      const phasePill = $("m-phase-pill");
      phaseEl.classList.remove("warn", "ok");
      phasePill.classList.remove("warn", "ok");
      fab.classList.remove("warn");
      const secDep = $("m-sec-deposit");
      const secWd = $("m-sec-withdraw");
      const setActions = (depositOn: boolean, withdrawOn: boolean) => {
        secDep.style.opacity = depositOn ? "1" : "0.45";
        secWd.style.opacity = withdrawOn ? "1" : "0.45";
        for (const id of ["m-send", "m-deposit", "m-dep-amt", "m-txsig"] as const) {
          const el = $(id) as HTMLButtonElement | HTMLInputElement;
          el.disabled = !depositOn;
        }
        for (const id of ["m-withdraw", "m-amt", "m-max"] as const) {
          const el = $(id) as HTMLButtonElement | HTMLInputElement;
          el.disabled = !withdrawOn;
        }
      };

      // Honest phases: awaiting CA ≠ broken; empty pool ≠ broken; sim lock is expected pre-mint.
      const mintReady = !!(p.mintConfigured || METRO_MINT);
      const live = p.settlement && p.settlement !== "sim" && !p.simLocked && !p.dangerousSim;
      if (!mintReady || p.readyForCa || p.family === "off") {
        phasePill.textContent = "AWAITING CA";
        phaseEl.textContent =
          "Bridge is standing by. In-game ₵ works fully — $METRO deposit/withdraw turns on when the mint CA is configured on the server. Earn credits, gear up, run contracts.";
        setActions(false, false);
        status("earn ₵ in-game · $METRO cash-out opens with the token CA");
      } else if (p.simLocked || p.dangerousSim) {
        phaseEl.classList.add("warn");
        phasePill.classList.add("warn");
        phasePill.textContent = "PRE-LIVE";
        phaseEl.textContent =
          "Settlement is not live yet (sim locked). Your ₵ balance is real server-side — chain deposit/cash-out stays off until live mint + treasury are armed. This is intentional, not a crash.";
        fab.classList.add("warn");
        setActions(false, false);
        status("₵ economy is live · chain bridge arms with mint + settlement");
      } else if (p.phase === "bootstrap" || (p.poolMetro ?? 0) <= 0) {
        phaseEl.classList.add("warn");
        phasePill.classList.add("warn");
        phasePill.textContent = "BOOTSTRAP";
        phaseEl.textContent =
          "Player-funded pool is empty — cash-outs pause until someone deposits $METRO into the treasury. You can still deposit to fill the pool and earn ₵ from play. Not a faucet.";
        setActions(!!live, false);
        status("deposit $METRO to open cash-outs · or keep earning ₵");
      } else if (p.settlement === "sim") {
        phasePill.textContent = "SIM";
        phaseEl.textContent = "Rehearsal settlement (local/dev). Not real chain value.";
        setActions(true, true);
      } else {
        phaseEl.classList.add("ok");
        phasePill.classList.add("ok");
        phasePill.textContent = "OPEN";
        phaseEl.textContent = `POOL OPEN on ${p.networkName || "Robinhood Chain"} — deposit via MetaMask · cash-out is treasury-signed (treasury pays ETH gas).`;
        setActions(true, true);
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

      // Economy dashboard strip: how well the treasury covers the circulating
      // credit supply + the deposit forecast (see server /economy).
      try {
        const e = await fetch(`${metroApiBase()}/economy`).then((x) => x.json());
        if (e?.ok) {
          const cov = e.token.coverageRatio;
          const covPct = cov === null ? "∞" : `${Math.round(cov * 100)}%`;
          const eco = $("m-economy");
          if (eco) {
            eco.style.display = "block";
            eco.classList.toggle("warn", cov !== null && cov < 0.5);
            eco.textContent =
              `Treasury covers ${covPct} of the ${e.credits.circulating.toLocaleString()}₵ in circulation · ` +
              `deposits ~◈${e.forecast.depositsPerDayMetro}/day · rewards minted ~${e.forecast.emittedCreditsPerDay}₵/day` +
              (e.forecast.daysUntilDry !== null ? ` · ⚠ pool dry in ~${e.forecast.daysUntilDry}d at current flow` : "");
          }
        }
      } catch {
        /* dashboard is best-effort — never block the pool panel */
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
      $("m-daily").textContent = "—";
      return;
    }
    try {
      // Live: signed wallet. Sim harness: player id alone (server allows under ALLOW_SIM).
      const wallet = currentWallet();
      const qs = new URLSearchParams({ player });
      if (pool?.settlement && pool.settlement !== "sim" && wallet && walletAvailable()) {
        const ts = Date.now();
        const signed = await signWalletLogin(loginMessage(wallet, ts), wallet);
        if (!signed) {
          status("sign-in cancelled — balance hidden");
          return;
        }
        qs.set("wallet", wallet);
        qs.set("sig", signed.signature);
        qs.set("ts", String(ts));
      } else if (wallet) {
        qs.set("wallet", wallet);
      }
      const r = await fetch(`${metroApiBase()}/metro/account?${qs}`).then((x) => x.json());
      if (r.ok) {
        acct = r;
        $("m-credits").textContent = `₵ ${r.credits}`;
        $("m-value").textContent = `◈ ${fmtMetro(r.metroValue)}`;
        const used = r.dailyUsedCredits ?? 0;
        const cap = r.dailyCapCredits ?? 50_000;
        const left = Math.max(0, cap - used);
        $("m-daily").textContent = `₵ ${used.toLocaleString()} / ${cap.toLocaleString()} (₵${left.toLocaleString()} left)`;
        if (r.cooldownMsLeft > 0) {
          $("m-daily").textContent += ` · cool ${Math.ceil(r.cooldownMsLeft / 1000)}s`;
        }
      } else {
        $("m-credits").textContent = "—";
        $("m-daily").textContent = "—";
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
  $("m-refresh-bottom").onclick = () => void refresh();

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

  const copyTreasury = () => {
    const full = $("m-treasury").dataset.full;
    if (!full) return;
    void navigator.clipboard?.writeText(full);
    status("treasury copied — use Send via MetaMask or transfer $METRO there");
  };
  $("m-treasury").onclick = copyTreasury;
  $("m-copy-treasury").onclick = copyTreasury;

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

  /**
   * Live settlement: re-sign every money action (fresh ≤2 min).
   * Sim + METRO_ALLOW_SIM: server accepts player+wallet without a signature (local smoke).
   */
  async function walletAuth(wallet: string): Promise<{ sig?: string; ts?: number; error?: string }> {
    if (pool?.simLocked || pool?.dangerousSim) return { error: "bridge locked (simulated settlement is read-only)" };
    if (pool?.settlement === "sim" || !pool?.settlement) return {};
    if (!walletAvailable() || !connectedWallet()) {
      return { error: "connect MetaMask to sign bridge actions" };
    }
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
    if (pool?.simLocked || pool?.dangerousSim) return status("bridge locked — cannot deposit while settlement is sim");
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
    if (pool?.simLocked || pool?.dangerousSim) return status("bridge locked (simulated settlement is read-only)");
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
    if (pool?.simLocked || pool?.dangerousSim) return status("bridge locked (simulated settlement is read-only)");
    if (pool && pool.poolMetro <= 0)
      return status("✗ insufficient $METRO in the treasury — come back and try again later (it refills as runners deposit)");
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
