import { WorldDO, parseZone, isNamedZone, type Env } from "./world";
import { getAccount, quote, withdraw, confirmWithdraw, deposit, poolInfo, simSettlement, type Settlement } from "./metro";
import { verifyWalletLogin } from "./auth";
import { loginMessage } from "../../src/net/protocol";
import { simulatedSettlementLocked } from "./bridgePolicy";
import { resolveSettlementFamily, settlementFamilyLabel } from "./settlementFamily";

export { WorldDO };

/** Mint from either METRO_MINT (preferred) or legacy METRO_DEVNET_MINT. */
function metroMint(env: Env): string | undefined {
  const m = (env.METRO_MINT || env.METRO_DEVNET_MINT || "").trim();
  return m || undefined;
}

/** True for value-bearing mainnets (Robinhood 4663, Ethereum mainnet, Solana mainnet). */
function rpcIsMainnet(rpc: string, chainId?: number): boolean {
  if (chainId === 4663) return true; // Robinhood Chain mainnet
  if (chainId === 46630) return false; // Robinhood Chain testnet
  if (/testnet\.chain\.robinhood|rpc\.testnet\.chain\.robinhood/i.test(rpc)) return false;
  if (/mainnet\.chain\.robinhood/i.test(rpc)) return true;
  return /mainnet/i.test(rpc) && !/sepolia|goerli|holesky|devnet|testnet/i.test(rpc);
}

function isEvmMintAddr(mint: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(mint);
}

function isEvmTreasurySecret(secret: string | undefined): boolean {
  const s = (secret || "").trim();
  if (/^0x[0-9a-fA-F]{64}$/.test(s) || /^[0-9a-fA-F]{64}$/.test(s)) return true;
  try {
    return atob(s).length === 32;
  } catch {
    return false;
  }
}

/** Preferred EVM defaults: Robinhood Chain testnet (safe); mainnet when chain id 4663. */
function defaultEvmRpc(chainId?: number): string {
  if (chainId === 4663) return "https://rpc.mainnet.chain.robinhood.com";
  return "https://rpc.testnet.chain.robinhood.com"; // 46630 testnet
}

function defaultEvmChainId(env: Env): number {
  if (env.METRO_CHAIN_ID) {
    const n = parseInt(env.METRO_CHAIN_ID, 10);
    if (Number.isFinite(n)) return n;
  }
  // Counsel-armed + mint → mainnet Robinhood; else testnet.
  if (env.METRO_MAINNET_ARMED === "1") return 4663;
  return 46630;
}

export type SettlementKind = "sim" | "evm" | "solana";

/**
 * Choose the bridge settlement (Solana SPL primary; Robinhood ERC-20 legacy).
 * Family from mint shape (base58 → Solana, 0x → RH/EVM) or METRO_SETTLEMENT force.
 * Mainnet requires METRO_MAINNET_ARMED=1. Missing mint/treasury → sim.
 */
async function pickSettlement(env: Env): Promise<{ settlement: Settlement; kind: SettlementKind; family: string }> {
  const mint = metroMint(env);
  const secret = env.METRO_TREASURY_SECRET?.trim();
  const family = resolveSettlementFamily(mint, env);
  if (!mint || !secret || family === "off") {
    return { settlement: simSettlement, kind: "sim", family: family === "off" ? "off" : family };
  }

  // Solana SPL first when family is solana (base58 mint or force).
  if (family === "solana" || (!isEvmMintAddr(mint) && family !== "robinhood")) {
    const rpc = (env.METRO_RPC || "https://api.devnet.solana.com").trim();
    if (rpcIsMainnet(rpc) && env.METRO_MAINNET_ARMED !== "1") {
      return { settlement: simSettlement, kind: "sim", family: "solana" };
    }
    const { makeSolanaSettlement } = await import("./solana");
    return {
      settlement: makeSolanaSettlement({ rpc, mint, treasurySecretB64: secret }),
      kind: "solana",
      family: "solana",
    };
  }

  // Robinhood / EVM ERC-20 path (0x mint).
  if (family === "robinhood" || isEvmMintAddr(mint)) {
    const chainId = defaultEvmChainId(env);
    const rpc = (env.METRO_RPC || defaultEvmRpc(chainId)).trim();
    if (rpcIsMainnet(rpc, chainId) && env.METRO_MAINNET_ARMED !== "1") {
      return { settlement: simSettlement, kind: "sim", family: "robinhood" };
    }
    const { makeEvmSettlement, robinhoodRpcs } = await import("./evm");
    return {
      settlement: makeEvmSettlement({
        rpcs: robinhoodRpcs(chainId, rpc),
        mint,
        treasuryPrivateKey: secret,
        chainId,
        db: env.DB,
      }),
      kind: "evm",
      family: "robinhood",
    };
  }

  return { settlement: simSettlement, kind: "sim", family: "off" };
}

/** EVM addresses compare case-insensitively; Solana base58 is case-sensitive. */
function walletsEqual(a: string, b: string): boolean {
  const x = (a || "").trim();
  const y = (b || "").trim();
  if (!x || !y) return false;
  if (/^0x[a-fA-F0-9]{40}$/i.test(x) || /^0x[a-fA-F0-9]{40}$/i.test(y)) {
    return x.toLowerCase() === y.toLowerCase();
  }
  return x === y;
}

/** Same freshness window as game login (`auth.ts` FRESH_MS = 2 min). */
const BRIDGE_SIG_FRESH_MS = 120_000;

/** Require a wallet signature that proves `player` is the wallet owner (w:<addr>).
 *  EVM uses personal_sign; Solana uses ed25519 SIWS.
 *  Freshness matches login (±2 min) — was 10 min for EVM, which widened replay windows. */
async function requireWalletPlayer(
  b: { player?: string; wallet?: string; sig?: string; ts?: number },
  kind: SettlementKind,
): Promise<{ ok: true; player: string; wallet: string } | { ok: false; reason: string }> {
  const wallet = (b.wallet || "").trim();
  const player = (b.player || "").trim();
  const ts = Number(b.ts);
  const sig = b.sig ?? "";
  if (!wallet || !sig || !Number.isFinite(ts)) {
    return { ok: false, reason: "wallet sign-in required — missing wallet/sig/ts" };
  }
  if (Math.abs(Date.now() - ts) > BRIDGE_SIG_FRESH_MS) {
    return { ok: false, reason: "wallet sign-in required — stale timestamp" };
  }
  // Prefer unified verifier (EVM + Solana, 2 min freshness). Fall back to EVM helper for
  // settlement-kind edge cases that already signed the same login message.
  const id = verifyWalletLogin({ wallet, sig, ts });
  if (id) {
    if (player && player !== id && player.toLowerCase() !== wallet.toLowerCase() && player !== id.slice(2)) {
      return { ok: false, reason: "player id does not match signed wallet" };
    }
    return { ok: true, player: id, wallet };
  }
  if (kind === "evm" || /^0x[a-fA-F0-9]{40}$/.test(wallet)) {
    const { verifyEvmLogin } = await import("./evm");
    const eid = verifyEvmLogin(wallet, loginMessage(wallet, ts), sig);
    if (!eid) return { ok: false, reason: "wallet sign-in required — bad EVM signature" };
    if (player && player !== eid && player.toLowerCase() !== wallet.toLowerCase() && player !== eid.slice(2)) {
      return { ok: false, reason: "player id does not match signed wallet" };
    }
    return { ok: true, player: eid, wallet };
  }
  return { ok: false, reason: "wallet sign-in required — bad or stale signature" };
}

/**
 * Bridge auth for mutators + private account reads.
 * - Live settlement: always wallet signature.
 * - Sim + METRO_ALLOW_SIM=1 only: allow unsigned player+wallet (local smoke harness).
 *   Never available when settlement is live or sim is locked.
 */
async function authorizeBridgeActor(
  b: { player?: string; wallet?: string; sig?: string; ts?: number },
  kind: SettlementKind,
  allowSim: boolean,
): Promise<{ ok: true; player: string; wallet: string } | { ok: false; reason: string }> {
  const signed = await requireWalletPlayer(b, kind);
  if (signed.ok) return signed;
  if (kind === "sim" && allowSim) {
    const wallet = (b.wallet || "").trim();
    const rawPlayer = (b.player || "").trim();
    // Guest/smoke ids are bare callsigns; wallet players are w:<addr>.
    const player =
      rawPlayer ||
      (/^0x[a-fA-F0-9]{40}$/i.test(wallet)
        ? "w:" + wallet
        : wallet
          ? "w:" + wallet
          : "");
    const { isValidWallet } = await import("./metro");
    if (player && isValidWallet(wallet)) {
      return { ok: true, player: player.replace(/[^A-Za-z0-9:_-]/g, "").slice(0, 64) || player, wallet };
    }
    return { ok: false, reason: "sim harness requires player + valid wallet (or a real signature)" };
  }
  return signed;
}

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    // CORS so the browser client (Vite dev origin) can read the HTTP economy/board APIs.
    headers: { "content-type": "application/json", "access-control-allow-origin": "*" },
  });

/**
 * Cross-zone leaderboards. Reads the shared D1 player_stats (every zone DO contributes),
 * ranking players by a stat. Lives in the Worker, not a DO, because it aggregates across
 * ALL zones — the whole point of keeping global state in D1.
 */
/** Wallet-authenticated character lookup — used by the title screen before WS login. */
async function handleIdentity(req: Request, env: Env): Promise<Response> {
  try {
    const b = (await req.json()) as { wallet?: string; sig?: string; ts?: number };
    const id = verifyWalletLogin({ wallet: b.wallet ?? "", sig: b.sig ?? "", ts: Number(b.ts) });
    if (!id) return json({ ok: false, reason: "wallet sign-in failed" }, 401);
    const row = await env.DB.prepare("SELECT name, look FROM players WHERE id = ?")
      .bind(id)
      .first<{ name: string; look: string | null }>();
    let look: unknown = null;
    if (row?.look) {
      try {
        look = JSON.parse(row.look);
      } catch {
        look = null;
      }
    }
    const locked = !!row?.look;
    return json({ ok: true, id, name: row?.name ?? null, look, locked });
  } catch (e) {
    return json({ ok: false, reason: String((e as Error)?.message ?? e) }, 400);
  }
}

async function handleLeaderboard(url: URL, env: Env): Promise<Response> {
  // digits allowed: weekly stats are keyed "wk<week>" and rotate with the epoch week
  const stat = (url.searchParams.get("stat") || "kills").replace(/[^a-z0-9]/g, "").slice(0, 24);
  const n = Math.min(50, Math.max(1, parseInt(url.searchParams.get("n") || "10", 10)));
  try {
    const { results } = await env.DB.prepare(
      "SELECT s.player AS player, COALESCE(p.name, s.player) AS name, s.v AS v " +
        "FROM player_stats s LEFT JOIN players p ON p.id = s.player WHERE s.stat = ? AND s.v > 0 ORDER BY s.v DESC LIMIT ?",
    )
      .bind(stat, n)
      .all<{ player: string; name: string; v: number }>();
    return json({ ok: true, stat, rows: results ?? [] });
  } catch (e) {
    return json({ ok: false, reason: String((e as Error)?.message ?? e), rows: [] }, 200);
  }
}

/**
 * $METRO custodial bridge endpoints (Phase 5). Account-level economy — operates on the
 * global `credits` ledger in D1, independent of which zone DO a player is in. Settlement
 * is the devnet sim for now (step 2a); step 2b selects a real settlement when armed.
 */
async function handleMetro(url: URL, req: Request, env: Env): Promise<Response> {
  const { settlement, kind, family } = await pickSettlement(env);
  const mint = metroMint(env);
  const hasTreasury = !!(env.METRO_TREASURY_SECRET && env.METRO_TREASURY_SECRET.trim());
  const rpc = (env.METRO_RPC || "").trim();
  const armed = env.METRO_MAINNET_ARMED === "1";
  const live = kind !== "sim";
  // CRITICAL: simulated settlement trusts client-reported amounts, so it must never
  // mutate a public ledger. It is read-only by default even when no mint is configured.
  // Local smoke/dev runs opt in explicitly with METRO_ALLOW_SIM=1.
  const allowSim = env.METRO_ALLOW_SIM === "1";
  const simLocked = simulatedSettlementLocked(kind, env.METRO_ALLOW_SIM);

  const rejectIfSimLocked = (): Response | null => {
    if (!simLocked) return null;
    return json(
      {
        ok: false,
        reason:
          "bridge locked: simulated settlement is read-only (configure live settlement, or set METRO_ALLOW_SIM=1 for local harness only)",
        settlement: kind,
        mintConfigured: !!mint,
      },
      503,
    );
  };

  try {
    if (url.pathname === "/metro/account" && req.method === "GET") {
      // Private balances: wallet proof on live; sim+METRO_ALLOW_SIM may use player id only.
      const qPlayer = url.searchParams.get("player") ?? "";
      const qWallet = url.searchParams.get("wallet") ?? "";
      const qSig = url.searchParams.get("sig") ?? "";
      const qTs = Number(url.searchParams.get("ts"));
      if (kind === "sim" && allowSim && qPlayer && !qSig) {
        // Local smoke: account by player id without MetaMask (never on live settlement).
        return json(await getAccount(env.DB, qPlayer, settlement));
      }
      const auth = await authorizeBridgeActor(
        { player: qPlayer, wallet: qWallet, sig: qSig, ts: qTs },
        kind,
        allowSim,
      );
      if (!auth.ok) return json(auth, 401);
      return json(await getAccount(env.DB, auth.player, settlement));
    }
    if (url.pathname === "/metro/pool" && req.method === "GET") {
      const info = (await poolInfo(env.DB)) as Record<string, unknown>;
      info.mintConfigured = !!mint;
      // Public mint CA so clients can deposit even when the build-time env is empty.
      if (mint) info.mint = mint;
      info.treasuryConfigured = hasTreasury;
      info.mainnetArmed = armed;
      info.rpc = rpc || null;
      const cid = family === "robinhood" || (mint && isEvmMintAddr(mint)) ? defaultEvmChainId(env) : null;
      info.family = family;
      info.familyLabel = settlementFamilyLabel(family as "robinhood" | "solana" | "off");
      info.chain =
        family === "robinhood" || (mint && isEvmMintAddr(mint))
          ? cid === 4663 || cid === 46630
            ? "robinhood"
            : "evm"
          : family === "solana" || mint
            ? "solana"
            : null;
      info.chainId = cid;
      info.networkName =
        family === "solana"
          ? /mainnet/i.test(rpc)
            ? "Solana Mainnet"
            : "Solana Devnet"
          : cid === 4663
            ? "Robinhood Chain"
            : cid === 46630
              ? "Robinhood Chain Testnet"
              : info.chain;
      info.readyForCa = hasTreasury && !mint;
      info.liveBridge = live;
      info.settlement = kind;
      info.simLocked = simLocked;
      info.simAllowed = allowSim;
      info.dualPathReady = { robinhood: true, solana: true };
      info.note =
        family === "solana" || (!mint && !isEvmMintAddr(mint || ""))
          ? "Solana SPL $METRO — Phantom signs claims; player pays SOL fee. Treasury never spends SOL."
          : "Robinhood Chain ≠ Robinhood app. Use MetaMask on chain " +
            (cid ?? "46630") +
            " to deposit/withdraw.";
      info.getMetroHint =
        family === "solana" || (mint && !isEvmMintAddr(mint))
          ? "Get $METRO (SPL), Send via Phantom to treasury, then Claim deposit."
          : cid === 4663
            ? "Trade $METRO on Robinhood Chain DEXes or peer transfers — not the Robinhood stock app."
            : "Testnet: mint/get test $METRO on RH testnet, then deposit via MetaMask in this panel.";
      if (hasTreasury) {
        // Prefer Solana treasury decode when mint is SPL or secret is base64 keypair (not EVM hex).
        const treasuryIsEvm =
          (mint && isEvmMintAddr(mint)) ||
          (family === "robinhood" && isEvmTreasurySecret(env.METRO_TREASURY_SECRET)) ||
          (!mint && isEvmTreasurySecret(env.METRO_TREASURY_SECRET) && family !== "solana");
        if (treasuryIsEvm && family !== "solana") {
          const { treasuryEvmAddress, treasuryHealth, robinhoodRpcs } = await import("./evm");
          info.treasury = treasuryEvmAddress(env.METRO_TREASURY_SECRET!);
          info.treasuryChain = "evm";
          if (live && mint) {
            try {
              const health = await treasuryHealth({
                rpcs: robinhoodRpcs(cid ?? 46630, rpc || undefined),
                mint,
                treasuryPrivateKey: env.METRO_TREASURY_SECRET!,
              });
              info.treasuryEth = health.eth;
              info.treasuryMetro = health.metro;
              info.treasuryOk = health.ok;
              if (health.warn) info.treasuryWarn = health.warn;
            } catch {
              /* non-fatal */
            }
          }
        } else {
          try {
            const { treasuryPubkey } = await import("./solana");
            info.treasury = treasuryPubkey(env.METRO_TREASURY_SECRET!);
            info.treasuryChain = "solana";
          } catch {
            info.treasury = null;
          }
        }
      }
      if (!live) {
        if (!mint) {
          info.reason = "awaiting mint CA — set METRO_MINT (in-game ₵ is fully live meanwhile)";
          info.phaseHint = "awaiting_ca";
        } else if (simLocked) {
          info.reason =
            "pre-live — simulated settlement is read-only on public hosts (set METRO_ALLOW_SIM=1 only for local harness)";
          info.phaseHint = "pre_live";
        } else if (hasTreasury && mint && rpcIsMainnet(rpc, cid ?? undefined) && !armed) {
          info.reason = "mainnet RPC set but METRO_MAINNET_ARMED is off — settlement stays sim";
          info.phaseHint = "mainnet_gated";
        } else if (!hasTreasury) {
          info.reason =
            family === "solana" || (mint && !isEvmMintAddr(mint))
              ? "awaiting METRO_TREASURY_SECRET (base64 Solana keypair)"
              : "awaiting METRO_TREASURY_SECRET (EVM hex key or Solana base64 keypair)";
          info.phaseHint = "awaiting_treasury";
        }
      } else if ((info.poolMetro as number) <= 0) {
        info.phaseHint = "bootstrap";
      } else {
        info.phaseHint = "open";
      }
      return json(info);
    }
    if (url.pathname === "/metro/status" && req.method === "GET") {
      const status: Record<string, unknown> = {
        ok: true,
        mintConfigured: !!mint,
        treasuryConfigured: hasTreasury,
        mainnetArmed: armed,
        settlement: kind,
        simLocked,
        simAllowed: allowSim,
        chain: mint && isEvmMintAddr(mint) ? (defaultEvmChainId(env) === 4663 || defaultEvmChainId(env) === 46630 ? "robinhood" : "evm") : mint ? "solana" : null,
        chainId: mint && isEvmMintAddr(mint) ? defaultEvmChainId(env) : null,
        readyForCa: hasTreasury && !mint,
        clusterHint: rpcIsMainnet(rpc, mint && isEvmMintAddr(mint) ? defaultEvmChainId(env) : undefined)
          ? "mainnet"
          : rpc
            ? "testnet/custom"
            : "unset",
      };
      if (hasTreasury && isEvmTreasurySecret(env.METRO_TREASURY_SECRET)) {
        const { treasuryEvmAddress } = await import("./evm");
        status.treasury = treasuryEvmAddress(env.METRO_TREASURY_SECRET!);
        status.treasuryChain = "evm";
      }
      return json(status);
    }
    if (url.pathname === "/metro/quote" && req.method === "GET")
      return json(quote(Number(url.searchParams.get("credits") ?? "0")));
    if (url.pathname === "/metro/withdraw" && req.method === "POST") {
      const locked = rejectIfSimLocked();
      if (locked) return locked;
      const b = (await req.json()) as {
        player?: string;
        wallet?: string;
        credits?: number;
        sig?: string;
        ts?: number;
      };
      // Live: wallet signature required. Sim+METRO_ALLOW_SIM: unsigned player+wallet for smoke.
      const auth = await authorizeBridgeActor(b, kind, allowSim);
      if (!auth.ok) return json(auth, 401);
      if (b.wallet && !walletsEqual(auth.wallet, b.wallet)) {
        return json({ ok: false, reason: "wallet must match signed identity" }, 401);
      }
      return json(
        await withdraw(env.DB, settlement, {
          player: auth.player,
          wallet: auth.wallet,
          credits: Number(b.credits),
        }),
      );
    }
    if (url.pathname === "/metro/withdraw/confirm" && req.method === "POST") {
      const locked = rejectIfSimLocked();
      if (locked) return locked;
      const b = (await req.json()) as {
        player?: string;
        withdrawId?: number;
        txSig?: string;
        wallet?: string;
        sig?: string;
        ts?: number;
      };
      const auth = await authorizeBridgeActor(b, kind, allowSim);
      if (!auth.ok) return json(auth, 401);
      return json(
        await confirmWithdraw(env.DB, settlement, {
          player: auth.player,
          withdrawId: Number(b.withdrawId),
          txSig: b.txSig ?? "",
        }),
      );
    }
    if (url.pathname === "/metro/deposit" && req.method === "POST") {
      const locked = rejectIfSimLocked();
      if (locked) return locked;
      const b = (await req.json()) as {
        player?: string;
        wallet?: string;
        txSig?: string;
        metro?: number;
        sig?: string;
        ts?: number;
      };
      const auth = await authorizeBridgeActor(b, kind, allowSim);
      if (!auth.ok) return json(auth, 401);
      if (b.wallet && !walletsEqual(auth.wallet, b.wallet)) {
        return json({ ok: false, reason: "wallet must match signed identity" }, 401);
      }
      // On-chain amount only for live settlement; sim may use claimed metro under ALLOW_SIM.
      return json(
        await deposit(env.DB, settlement, {
          player: auth.player,
          wallet: auth.wallet,
          txSig: b.txSig ?? "",
          metro: Number(b.metro) || 0,
        }),
      );
    }
    return json({ ok: false, reason: "not found" }, 404);
  } catch (e) {
    return json({ ok: false, reason: String((e as Error)?.message ?? e) }, 400);
  }
}

/**
 * Worker entry. Routes a WebSocket upgrade to the authoritative Durable Object for
 * its zone — one DO per district (canonical "dN"). The DO reads the same ?zone= and
 * binds itself to that district. Players hand off by reconnecting with a new zone.
 */
export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);

    // CORS preflight — the browser client POSTs JSON (identity, metro bridge) from the
    // game origin, which always preflights. Without this, every POST fails in-browser.
    if (req.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-methods": "GET, POST, OPTIONS",
          "access-control-allow-headers": "content-type",
          "access-control-max-age": "86400",
        },
      });
    }

    if (url.pathname === "/health") {
      // Sample a few hot zones so ops can see load without hammering every DO.
      const sampleZones = ["safe", "d0", "d1", "d2"];
      const zones: Array<Record<string, unknown>> = [];
      let errTotal = 0;
      let playersTotal = 0;
      for (const z of sampleZones) {
        try {
          const stub = env.WORLD.get(env.WORLD.idFromName(z));
          const res = await stub.fetch(new Request(`https://world/stats?zone=${z}`));
          if (res.ok) {
            const s = (await res.json()) as Record<string, unknown>;
            zones.push({
              zone: s.zone,
              players: s.players,
              tickMsAvg: s.tickMsAvg,
              hubFull: s.hubFull,
              floodKills: s.floodKills,
              errCount: s.errCount,
            });
            errTotal += Number(s.errCount) || 0;
            playersTotal += Number(s.players) || 0;
          }
        } catch {
          zones.push({ zone: z, error: true });
          errTotal++;
        }
      }
      const { launchFlagsFromEnv } = await import("../../src/game/featureFlags");
      const flags = launchFlagsFromEnv(env);
      // Lightweight economy snapshot for launch dashboards (never fail health).
      let economy: Record<string, unknown> | null = null;
      const warnings: string[] = [];
      try {
        const { handleEconomy } = await import("./economy");
        const ecoRes = await handleEconomy(env);
        if (ecoRes.ok) {
          const body = (await ecoRes.json()) as {
            credits?: { emittedToday?: number; burnedToday?: number; sinkEfficiency7d?: number; emitted7d?: number; burned7d?: number };
          };
          const c = body.credits ?? {};
          economy = {
            emittedToday: c.emittedToday ?? 0,
            burnedToday: c.burnedToday ?? 0,
            emitted7d: c.emitted7d ?? 0,
            burned7d: c.burned7d ?? 0,
            sinkEfficiency7d: c.sinkEfficiency7d ?? 0,
          };
          const sink = Number(c.sinkEfficiency7d) || 0;
          const emit7 = Number(c.emitted7d) || 0;
          if (emit7 > 500 && sink < 0.05) warnings.push("sink_efficiency_low");
          if ((c.emittedToday ?? 0) > 5000 && (c.burnedToday ?? 0) === 0) warnings.push("emit_spike_no_burn");
        }
      } catch {
        warnings.push("economy_unavailable");
      }
      for (const z of zones) {
        if (Number((z as { tickMsAvg?: number }).tickMsAvg) > 40) warnings.push(`tick_hot:${(z as { zone?: string }).zone}`);
        if ((z as { hubFull?: boolean }).hubFull) warnings.push("hub_full");
      }
      if (errTotal > 50) warnings.push("err_elevated");
      return new Response(
        JSON.stringify({
          ok: true,
          degraded: warnings.length > 0,
          ts: Date.now(),
          build: env.METRO_BUILD || "unset",
          paidTier: env.METRO_PAID_TIER === "1",
          plan: env.METRO_PAID_TIER === "1" ? "workers-paid" : "workers-free",
          flags,
          sample: { playersTotal, errTotal, zones },
          economy,
          warnings,
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
            "access-control-allow-origin": "*",
            "cache-control": "no-store",
          },
        },
      );
    }

    // Ops: forward a per-zone metrics probe to that zone's DO.
    if (url.pathname === "/stats") {
      const raw = url.searchParams.get("zone");
      const zone = isNamedZone(raw) ? raw! : "d" + parseZone(raw);
      const stub = env.WORLD.get(env.WORLD.idFromName(zone));
      return stub.fetch(new Request(`https://world/stats?zone=${zone}`));
    }

    if (url.pathname === "/leaderboard") return handleLeaderboard(url, env);

    // Economy dashboard: emissions vs sinks, treasury coverage, deposit forecast.
    if (url.pathname === "/economy") {
      const { handleEconomy } = await import("./economy");
      return handleEconomy(env);
    }

    if (url.pathname === "/identity" && req.method === "POST") return handleIdentity(req, env);

    if (url.pathname.startsWith("/metro/")) return handleMetro(url, req, env);

    if (url.pathname === "/ws") {
      const raw = url.searchParams.get("zone");
      const zone = isNamedZone(raw) ? raw! : "d" + parseZone(raw); // canonical; interiors + building interiors pass through
      const stub = env.WORLD.get(env.WORLD.idFromName(zone));
      return stub.fetch(req);
    }

    return new Response("metrophage-server", { status: 200 });
  },
};
