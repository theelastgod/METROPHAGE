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
 * Choose the bridge settlement (dual-path: Robinhood ERC-20 OR Solana SPL).
 * Family from mint shape (0x → RH/EVM, base58 → Solana) or METRO_SETTLEMENT force.
 * Mainnet requires METRO_MAINNET_ARMED=1. Missing mint/treasury → sim.
 */
async function pickSettlement(env: Env): Promise<{ settlement: Settlement; kind: SettlementKind; family: string }> {
  const mint = metroMint(env);
  const secret = env.METRO_TREASURY_SECRET?.trim();
  const family = resolveSettlementFamily(mint, env);
  if (!mint || !secret || family === "off") {
    return { settlement: simSettlement, kind: "sim", family: family === "off" ? "off" : family };
  }

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

  // Solana SPL path (active alternate when CA is base58).
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

/** Require a wallet signature that proves `player` is the wallet owner (w:<addr>).
 *  EVM uses personal_sign; Solana uses ed25519 SIWS. */
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
  if (kind === "evm" || /^0x[a-fA-F0-9]{40}$/.test(wallet)) {
    const { verifyEvmLogin } = await import("./evm");
    const age = Math.abs(Date.now() - ts);
    if (age > 10 * 60_000) return { ok: false, reason: "wallet sign-in required — stale timestamp" };
    const id = verifyEvmLogin(wallet, loginMessage(wallet, ts), sig);
    if (!id) return { ok: false, reason: "wallet sign-in required — bad EVM signature" };
    if (player && player !== id && player.toLowerCase() !== wallet.toLowerCase() && player !== id.slice(2)) {
      return { ok: false, reason: "player id does not match signed wallet" };
    }
    return { ok: true, player: id, wallet };
  }
  const id = verifyWalletLogin({ wallet, sig, ts });
  if (!id) return { ok: false, reason: "wallet sign-in required — bad or stale signature" };
  if (player && player !== id && player !== wallet && player !== id.slice(2)) {
    return { ok: false, reason: "player id does not match signed wallet" };
  }
  return { ok: true, player: id, wallet };
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
    if (url.pathname === "/metro/account" && req.method === "GET")
      return json(await getAccount(env.DB, url.searchParams.get("player") ?? "", settlement));
    if (url.pathname === "/metro/pool" && req.method === "GET") {
      const info = (await poolInfo(env.DB)) as Record<string, unknown>;
      info.mintConfigured = !!mint;
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
        family === "solana"
          ? "Solana SPL $METRO — Phantom (or Solana wallet) signs claims; player pays SOL fee."
          : "Robinhood Chain ≠ Robinhood app. Use MetaMask on chain " +
            (cid ?? "46630") +
            " to deposit/withdraw.";
      info.getMetroHint =
        family === "solana"
          ? "Get $METRO SPL, deposit to treasury ATA, confirm in this panel."
          : cid === 4663
            ? "Trade $METRO on Robinhood Chain DEXes or peer transfers — not the Robinhood stock app."
            : "Testnet: mint/get test $METRO on RH testnet, then deposit via MetaMask in this panel.";
      if (hasTreasury) {
        const treasuryIsEvm = (mint && isEvmMintAddr(mint)) || (!mint && isEvmTreasurySecret(env.METRO_TREASURY_SECRET));
        if (treasuryIsEvm) {
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
        if (simLocked) {
          info.reason = "LOCKED — simulated settlement is read-only (prevents fake deposits)";
        } else if (hasTreasury && mint && rpcIsMainnet(rpc, cid ?? undefined) && !armed) {
          info.reason = "mainnet RPC set but METRO_MAINNET_ARMED is off — settlement stays sim";
        } else if (!mint) {
          info.reason = "awaiting mint CA — set METRO_MINT to an ERC-20 on Robinhood Chain";
        } else if (!hasTreasury) {
          info.reason = "awaiting METRO_TREASURY_SECRET (EVM hex key)";
        }
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
      if (live) {
        const auth = await requireWalletPlayer(b, kind);
        if (!auth.ok) return json(auth, 401);
        // Money wallet must match authenticated identity
        if (b.wallet && auth.wallet.toLowerCase() !== b.wallet.trim().toLowerCase()) {
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
      return json(await withdraw(env.DB, settlement, { player: b.player ?? "", wallet: b.wallet ?? "", credits: Number(b.credits) }));
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
      let player = b.player ?? "";
      if (live) {
        const auth = await requireWalletPlayer(b, kind);
        if (!auth.ok) return json(auth, 401);
        player = auth.player;
      }
      return json(
        await confirmWithdraw(env.DB, settlement, {
          player,
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
      if (live) {
        const auth = await requireWalletPlayer(b, kind);
        if (!auth.ok) return json(auth, 401);
        if (b.wallet && auth.wallet.toLowerCase() !== b.wallet.trim().toLowerCase()) {
          return json({ ok: false, reason: "wallet must match signed identity" }, 401);
        }
        // On-chain amount only — ignore client metro for trust (settlement re-reads logs)
        return json(
          await deposit(env.DB, settlement, {
            player: auth.player,
            wallet: auth.wallet,
            txSig: b.txSig ?? "",
            metro: Number(b.metro) || 0,
          }),
        );
      }
      return json(
        await deposit(env.DB, settlement, {
          player: b.player ?? "",
          wallet: b.wallet ?? "",
          txSig: b.txSig ?? "",
          metro: Number(b.metro),
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
      return new Response(JSON.stringify({ ok: true, ts: Date.now() }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
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
