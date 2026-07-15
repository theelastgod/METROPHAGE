import { WorldDO, parseZone, isNamedZone, type Env } from "./world";
import { getAccount, quote, withdraw, confirmWithdraw, deposit, poolInfo, simSettlement, type Settlement } from "./metro";
import { verifyWalletLogin } from "./auth";
import { loginMessage, PROTOCOL_VERSION } from "../../src/net/protocol";
import { simulatedSettlementLocked } from "./bridgePolicy";
import { resolveSettlementFamily, settlementFamilyLabel } from "./settlementFamily";
import { launchFlagsFromEnv } from "../../src/game/featureFlags";
import {
  doName,
  hardCapFor,
  isShardableZone,
  maxInstancesFor,
  parseInstParam,
  pickInstance,
  softCapFor,
  type InstanceLoad,
} from "./zoneRouting";

export { WorldDO };

// ── Load-aware zone instance router (per-isolate cache; fine for sticky-ish picks) ──
const LOAD_CACHE_MS = 2500;
const loadCache = new Map<string, { players: number; tickMsAvg: number; at: number }>();

async function probeInstanceLoad(env: Env, zone: string, inst: number): Promise<InstanceLoad> {
  const key = doName(zone, inst);
  const hit = loadCache.get(key);
  if (hit && Date.now() - hit.at < LOAD_CACHE_MS) {
    return { inst, players: hit.players, tickMsAvg: hit.tickMsAvg };
  }
  try {
    const stub = env.WORLD.get(env.WORLD.idFromName(key));
    const res = await stub.fetch(
      new Request(`https://world/stats?zone=${encodeURIComponent(zone)}&inst=${inst}`),
    );
    if (!res.ok) {
      loadCache.set(key, { players: 0, tickMsAvg: 0, at: Date.now() });
      return { inst, players: 0, tickMsAvg: 0, error: true };
    }
    const s = (await res.json()) as { players?: number; tickMsAvg?: number };
    const players = Math.max(0, Math.floor(Number(s.players) || 0));
    const tickMsAvg = Number(s.tickMsAvg) || 0;
    loadCache.set(key, { players, tickMsAvg, at: Date.now() });
    return { inst, players, tickMsAvg };
  } catch {
    loadCache.set(key, { players: 0, tickMsAvg: 0, at: Date.now() });
    return { inst, players: 0, tickMsAvg: 0, error: true };
  }
}

/**
 * Resolve which DO shard hosts this logical zone for a new / reconnecting client.
 * Sticky `inst` is honored while under hard cap; otherwise least-loaded under soft.
 */
async function resolveZoneInstance(
  env: Env,
  zone: string,
  stickyInst?: number,
): Promise<{ inst: number; doKey: string }> {
  const maxInst = maxInstancesFor(zone, env);
  if (!isShardableZone(zone) || maxInst <= 1) {
    return { inst: 0, doKey: doName(zone, 0) };
  }
  const flags = launchFlagsFromEnv(env);
  const soft = softCapFor(zone, env, flags);
  const hard = hardCapFor(zone, env, flags);

  // Probe in parallel — cold DOs report 0 players cheaply enough for join path.
  const loads = await Promise.all(
    Array.from({ length: maxInst }, (_, i) => probeInstanceLoad(env, zone, i)),
  );
  const inst = pickInstance(loads, {
    sticky: stickyInst,
    softCap: soft,
    hardCap: hard,
    maxInst,
  });
  return { inst, doKey: doName(zone, inst) };
}

function canonicalZone(raw: string | null): string {
  return isNamedZone(raw) ? raw! : "d" + parseZone(raw);
}

/** Forward HTTP/WS to a zone DO with zone+inst query so the DO binds correctly. */
function forwardToWorld(env: Env, req: Request, zone: string, inst: number): Promise<Response> {
  const doKey = doName(zone, inst);
  const stub = env.WORLD.get(env.WORLD.idFromName(doKey));
  const u = new URL(req.url);
  u.searchParams.set("zone", zone);
  u.searchParams.set("inst", String(inst));
  return stub.fetch(new Request(u.toString(), req));
}

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

function isEvmTreasurySecret(secret: string | undefined): boolean {
  const s = (secret || "").trim();
  if (/^0x[0-9a-fA-F]{64}$/.test(s) || /^[0-9a-fA-F]{64}$/.test(s)) return true;
  try {
    return atob(s).length === 32;
  } catch {
    return false;
  }
}

/** Preferred EVM defaults: Robinhood Chain mainnet; testnet only when chain id 46630. */
function defaultEvmRpc(chainId?: number): string {
  if (chainId === 46630) return "https://rpc.testnet.chain.robinhood.com";
  return "https://rpc.mainnet.chain.robinhood.com"; // 4663 mainnet
}

function defaultEvmChainId(env: Env): number {
  if (env.METRO_CHAIN_ID) {
    const n = parseInt(env.METRO_CHAIN_ID, 10);
    if (Number.isFinite(n)) return n;
  }
  // Explicit testnet RPC → testnet; otherwise Robinhood mainnet.
  if (/testnet\.chain\.robinhood/i.test(env.METRO_RPC || "")) return 46630;
  return 4663;
}

export type SettlementKind = "sim" | "evm" | "solana";

/**
 * Choose the bridge settlement.
 * AUTHORITATIVE: Robinhood Chain ERC-20 (default METRO_SETTLEMENT=robinhood).
 * Dormant alternate: Solana SPL only when METRO_SETTLEMENT=solana.
 * Mainnet requires METRO_MAINNET_ARMED=1. Missing mint/treasury → sim.
 */
async function pickSettlement(env: Env): Promise<{ settlement: Settlement; kind: SettlementKind; family: string }> {
  const mint = metroMint(env);
  const secret = env.METRO_TREASURY_SECRET?.trim();
  const family = resolveSettlementFamily(mint, env);
  if (!mint || !secret || family === "off") {
    return { settlement: simSettlement, kind: "sim", family: family === "off" ? "off" : family };
  }

  // Solana SPL — dormant alternate (METRO_SETTLEMENT=solana only).
  if (family === "solana") {
    const rpc = (env.METRO_RPC || "https://api.devnet.solana.com").trim();
    if (rpcIsMainnet(rpc) && env.METRO_MAINNET_ARMED !== "1") {
      return { settlement: simSettlement, kind: "sim", family: "solana" };
    }
    // Reject EVM-shaped secrets so a leftover 0x key never pretends to be Solana.
    if (/^0x[0-9a-fA-F]{64}$/.test(secret) || /^[0-9a-fA-F]{64}$/.test(secret)) {
      return { settlement: simSettlement, kind: "sim", family: "solana" };
    }
    const { makeSolanaSettlement } = await import("./solana");
    return {
      settlement: makeSolanaSettlement({ rpc, mint, treasurySecretB64: secret }),
      kind: "solana",
      family: "solana",
    };
  }

  // Robinhood / EVM — authoritative live path.
  if (family === "robinhood") {
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

/**
 * NEW RUNNER — explicit player deletion.
 *  - Guest: { callsign, secret } device key
 *  - Wallet: { wallet, sig, ts } fresh signature (only way to free a locked wallet)
 */
async function handlePlayerRetire(req: Request, env: Env): Promise<Response> {
  try {
    const b = (await req.json()) as {
      callsign?: string;
      secret?: string;
      wallet?: string;
      sig?: string;
      ts?: number;
    };
    if (b.wallet && b.sig && Number.isFinite(b.ts)) {
      const { retireWalletPlayer } = await import("./playerLink");
      const result = await retireWalletPlayer(env.DB, {
        wallet: b.wallet,
        sig: b.sig,
        ts: Number(b.ts),
      });
      if (!result.ok) return json(result, 401);
      return json(result);
    }
    const { retireGuestPlayer } = await import("./playerRetire");
    const result = await retireGuestPlayer(env.DB, b.callsign ?? "", b.secret ?? "");
    if (!result.ok) return json(result, result.reason.includes("does not match") ? 403 : 400);
    return json(result);
  } catch (e) {
    return json({ ok: false, reason: String((e as Error)?.message ?? e) }, 400);
  }
}

/** Bind a Solana wallet to an existing guest runner (permanent until NEW RUNNER). */
async function handlePlayerLinkWallet(req: Request, env: Env): Promise<Response> {
  try {
    const b = (await req.json()) as {
      callsign?: string;
      secret?: string;
      wallet?: string;
      sig?: string;
      ts?: number;
    };
    const { linkGuestToWallet } = await import("./playerLink");
    const result = await linkGuestToWallet(env.DB, {
      callsign: b.callsign ?? "",
      secret: b.secret ?? "",
      wallet: b.wallet ?? "",
      sig: b.sig ?? "",
      ts: Number(b.ts),
    });
    if (!result.ok) {
      const status = /sign-in failed|mismatch/i.test(result.reason) ? 401 : 400;
      return json(result, status);
    }
    return json(result);
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
function priceEnvFrom(env: Env) {
  return {
    METRO_MINT: env.METRO_MINT,
    METRO_DEVNET_MINT: env.METRO_DEVNET_MINT,
    METRO_CHAIN_ID: env.METRO_CHAIN_ID,
    METRO_RPC: env.METRO_RPC,
    METRO_USD_PRICE: env.METRO_USD_PRICE,
    METRO_MAINNET_ARMED: env.METRO_MAINNET_ARMED,
  };
}

async function handleMetro(url: URL, req: Request, env: Env): Promise<Response> {
  const { settlement, kind, family } = await pickSettlement(env);
  const mint = metroMint(env);
  const hasTreasury = !!(env.METRO_TREASURY_SECRET && env.METRO_TREASURY_SECRET.trim());
  const rpc = (env.METRO_RPC || "").trim();
  const armed = env.METRO_MAINNET_ARMED === "1";
  const live = kind !== "sim";
  const priceEnv = priceEnvFrom(env);
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
        return json(await getAccount(env.DB, qPlayer, settlement, priceEnv));
      }
      const auth = await authorizeBridgeActor(
        { player: qPlayer, wallet: qWallet, sig: qSig, ts: qTs },
        kind,
        allowSim,
      );
      if (!auth.ok) return json(auth, 401);
      return json(await getAccount(env.DB, auth.player, settlement, priceEnv));
    }
    if (url.pathname === "/metro/pool" && req.method === "GET") {
      const info = (await poolInfo(env.DB, priceEnv)) as Record<string, unknown>;
      info.mintConfigured = !!mint;
      // Public mint CA so clients can deposit even when the build-time env is empty.
      if (mint) info.mint = mint;
      info.treasuryConfigured = hasTreasury;
      info.mainnetArmed = armed;
      info.rpc = rpc || null;
      const force = (env.METRO_SETTLEMENT || "robinhood").toLowerCase().trim();
      const wantRobinhood =
        family === "robinhood" ||
        force === "robinhood" ||
        force === "rh" ||
        force === "evm" ||
        force === "" ||
        (!force.includes("sol") && force !== "auto");
      const cid = wantRobinhood || family === "robinhood" ? defaultEvmChainId(env) : null;
      info.family = family;
      info.familyLabel = settlementFamilyLabel(family as "robinhood" | "solana" | "off");
      // Robinhood is authoritative even while awaiting mint (family=off).
      info.chain =
        family === "solana"
          ? "solana"
          : cid === 4663 || cid === 46630
            ? "robinhood"
            : wantRobinhood
              ? "evm"
              : "robinhood";
      info.chainId = family === "solana" ? null : cid;
      info.networkName =
        family === "solana"
          ? /mainnet/i.test(rpc)
            ? "Solana Mainnet"
            : "Solana Devnet"
          : cid === 4663
            ? "Robinhood Chain"
            : "Robinhood Chain Testnet";
      info.readyForCa = hasTreasury && !mint;
      info.liveBridge = live;
      info.settlement = kind;
      info.simLocked = simLocked;
      info.simAllowed = allowSim;
      // Robinhood is authoritative; solana adapter remains loadable as alternate only.
      info.dualPathReady = { robinhood: true, solana: false, solanaAlternate: true };
      info.authoritativeChain = "robinhood";
      info.note =
        family === "solana"
          ? "Solana SPL alternate — Phantom cash-outs when forced."
          : "Robinhood Chain $METRO — MetaMask deposits; treasury pays gas on cash-outs when funded.";
      info.getMetroHint =
        family === "solana"
          ? "Alternate SPL path — deposit via Phantom."
          : "Get $METRO (ERC-20), Send via MetaMask to treasury, then Claim deposit.";
      if (hasTreasury) {
        // Prefer EVM treasury when Robinhood is primary (or secret is clearly EVM).
        if (
          (wantRobinhood || family === "robinhood" || isEvmTreasurySecret(env.METRO_TREASURY_SECRET)) &&
          isEvmTreasurySecret(env.METRO_TREASURY_SECRET)
        ) {
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
          info.reason = "awaiting mint CA — set METRO_MINT (0x) (in-game ₵ is fully live meanwhile)";
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
            family === "solana"
              ? "awaiting METRO_TREASURY_SECRET (base64 Solana keypair)"
              : "awaiting METRO_TREASURY_SECRET (EVM 0x private key)";
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
      const force = (env.METRO_SETTLEMENT || "robinhood").toLowerCase().trim();
      const wantRobinhood =
        family === "robinhood" ||
        force === "robinhood" ||
        force === "rh" ||
        force === "evm" ||
        force === "" ||
        (!force.includes("sol") && force !== "auto");
      const status: Record<string, unknown> = {
        ok: true,
        mintConfigured: !!mint,
        treasuryConfigured: hasTreasury,
        mainnetArmed: armed,
        settlement: kind,
        family,
        authoritativeChain: "robinhood",
        simLocked,
        simAllowed: allowSim,
        chain: family === "solana" ? "solana" : "robinhood",
        chainId: family === "solana" ? null : defaultEvmChainId(env),
        readyForCa: hasTreasury && !mint,
        clusterHint: rpcIsMainnet(rpc, family === "solana" ? undefined : defaultEvmChainId(env))
          ? "mainnet"
          : rpc
            ? "testnet/custom"
            : "unset",
      };
      if (hasTreasury) {
        if (
          (wantRobinhood || family === "robinhood" || isEvmTreasurySecret(env.METRO_TREASURY_SECRET)) &&
          isEvmTreasurySecret(env.METRO_TREASURY_SECRET)
        ) {
          const { treasuryEvmAddress } = await import("./evm");
          status.treasury = treasuryEvmAddress(env.METRO_TREASURY_SECRET!);
          status.treasuryChain = "evm";
        } else {
          try {
            const { treasuryPubkey } = await import("./solana");
            status.treasury = treasuryPubkey(env.METRO_TREASURY_SECRET!);
            status.treasuryChain = "solana";
          } catch {
            status.treasury = null;
          }
        }
      }
      return json(status);
    }
    if (url.pathname === "/metro/quote" && req.method === "GET") {
      const { resolveBridge: rb } = await import("./metro");
      const live = await rb(env.DB, priceEnv);
      return json(
        quote(
          Number(url.searchParams.get("credits") ?? "0"),
          live.withdrawCreditsPerMetro,
          live.depositCreditsPerMetro,
        ),
      );
    }
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
        await withdraw(
          env.DB,
          settlement,
          {
            player: auth.player,
            wallet: auth.wallet,
            credits: Number(b.credits),
          },
          priceEnv,
        ),
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
        await deposit(
          env.DB,
          settlement,
          {
            player: auth.player,
            wallet: auth.wallet,
            txSig: b.txSig ?? "",
            metro: Number(b.metro) || 0,
          },
          priceEnv,
        ),
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
      // Sample hot zones + primary overflow shards in parallel.
      const sampleTargets: Array<{ zone: string; inst: number }> = [
        { zone: "safe", inst: 0 },
        { zone: "safe", inst: 1 },
        { zone: "d0", inst: 0 },
        { zone: "d0", inst: 1 },
        { zone: "d1", inst: 0 },
        { zone: "d2", inst: 0 },
        { zone: "d3", inst: 0 },
        { zone: "subway", inst: 0 },
      ];
      const zoneResults = await Promise.all(
        sampleTargets.map(async ({ zone: z, inst }) => {
          try {
            const key = doName(z, inst);
            const stub = env.WORLD.get(env.WORLD.idFromName(key));
            const res = await stub.fetch(
              new Request(`https://world/stats?zone=${encodeURIComponent(z)}&inst=${inst}`),
            );
            if (!res.ok) return { zone: z, inst, doName: key, error: true as const };
            const s = (await res.json()) as Record<string, unknown>;
            return {
              zone: s.zone ?? z,
              inst: s.inst ?? inst,
              doName: s.doName ?? key,
              players: s.players,
              tickMsAvg: s.tickMsAvg,
              tickMsMax: s.tickMsMax,
              snapBytesPerTick: s.snapBytesPerTick,
              hubFull: s.hubFull,
              instanceFull: s.instanceFull,
              floodKills: s.floodKills,
              errCount: s.errCount,
              running: s.running,
            };
          } catch {
            return { zone: z, inst, doName: doName(z, inst), error: true as const };
          }
        }),
      );
      const zones: Array<Record<string, unknown>> = zoneResults;
      let errTotal = 0;
      let playersTotal = 0;
      let tickHot = 0;
      for (const z of zones) {
        if ((z as { error?: boolean }).error) {
          errTotal++;
          continue;
        }
        errTotal += Number((z as { errCount?: number }).errCount) || 0;
        playersTotal += Number((z as { players?: number }).players) || 0;
        if (Number((z as { tickMsAvg?: number }).tickMsAvg) > 40) tickHot++;
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
        if (Number((z as { tickMsAvg?: number }).tickMsAvg) > 40) {
          warnings.push(`tick_hot:${(z as { zone?: string }).zone}`);
        }
        if ((z as { hubFull?: boolean }).hubFull) warnings.push("hub_full");
        if (Number((z as { floodKills?: number }).floodKills) > 20) {
          warnings.push(`flood:${(z as { zone?: string }).zone}`);
        }
      }
      if (errTotal > 50) warnings.push("err_elevated");
      if (tickHot >= 2) warnings.push("tick_hot_multi_zone");
      return new Response(
        JSON.stringify({
          ok: true,
          degraded: warnings.length > 0,
          ts: Date.now(),
          build: env.METRO_BUILD || "unset",
          /** Wire protocol — clients compare to local PROTOCOL_VERSION and hard-reload on mismatch. */
          protocol: PROTOCOL_VERSION,
          paidTier: env.METRO_PAID_TIER === "1",
          plan: env.METRO_PAID_TIER === "1" ? "workers-paid" : "workers-free",
          flags,
          sample: { playersTotal, errTotal, tickHotZones: tickHot, zones },
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

    // Ops: forward a per-zone metrics probe. Optional ?inst=; omit to sample all shards.
    if (url.pathname === "/stats") {
      const zone = canonicalZone(url.searchParams.get("zone"));
      const instQ = parseInstParam(url.searchParams.get("inst"));
      const maxInst = maxInstancesFor(zone, env);
      if (instQ != null || maxInst <= 1) {
        const inst = instQ ?? 0;
        return forwardToWorld(
          env,
          new Request(`https://world/stats?zone=${encodeURIComponent(zone)}&inst=${inst}`),
          zone,
          inst,
        );
      }
      // Aggregate all instances for this zone (ops / capacity planning).
      const loads = await Promise.all(
        Array.from({ length: maxInst }, async (_, i) => {
          try {
            const res = await forwardToWorld(
              env,
              new Request(`https://world/stats?zone=${encodeURIComponent(zone)}&inst=${i}`),
              zone,
              i,
            );
            if (!res.ok) return { inst: i, error: true as const };
            return (await res.json()) as Record<string, unknown>;
          } catch {
            return { inst: i, error: true as const };
          }
        }),
      );
      const playersTotal = loads.reduce(
        (s, r) => s + (Number((r as { players?: number }).players) || 0),
        0,
      );
      return new Response(
        JSON.stringify({
          zone,
          sharded: true,
          maxInstances: maxInst,
          softCap: softCapFor(zone, env, launchFlagsFromEnv(env)),
          hardCap: hardCapFor(zone, env, launchFlagsFromEnv(env)),
          playersTotal,
          instances: loads,
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

    if (url.pathname === "/leaderboard") return handleLeaderboard(url, env);

    // Economy dashboard: emissions vs sinks, treasury coverage, deposit forecast.
    if (url.pathname === "/economy") {
      const { handleEconomy } = await import("./economy");
      return handleEconomy(env);
    }

    if (url.pathname === "/identity" && req.method === "POST") return handleIdentity(req, env);
    // NEW RUNNER — deletes guest (device secret) or wallet runner (signed).
    if (url.pathname === "/player/retire" && req.method === "POST") return handlePlayerRetire(req, env);
    // Bind Solana wallet → existing guest runner (locked until NEW RUNNER).
    if (url.pathname === "/player/link-wallet" && req.method === "POST") return handlePlayerLinkWallet(req, env);

    if (url.pathname.startsWith("/metro/")) return handleMetro(url, req, env);

    if (url.pathname === "/ws") {
      // Load-aware instance pick for hot zones; interiors stay single-DO.
      // Client may pass ?inst=N for sticky reconnect (honored under hard cap).
      const zone = canonicalZone(url.searchParams.get("zone"));
      const sticky = parseInstParam(url.searchParams.get("inst"));
      const { inst, doKey } = await resolveZoneInstance(env, zone, sticky);
      // Touch cache after join intent so back-to-back connects see fresh-ish counts.
      // (Actual count updates when DO /stats is probed again.)
      const cached = loadCache.get(doKey);
      if (cached) {
        loadCache.set(doKey, { ...cached, players: cached.players + 1, at: Date.now() });
      }
      return forwardToWorld(env, req, zone, inst);
    }

    return new Response("metrophage-server", { status: 200 });
  },

  /**
   * Cron (every 5m):
   *  - reclaim abandoned $METRO cash-out claims
   *  - refresh EVM $METRO market USD when the quote is older than 30 minutes
   * Never touches zone DO ticks.
   */
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      (async () => {
        try {
          const { settlement } = await pickSettlement(env);
          const { reclaimExpired } = await import("./metro");
          const n = await reclaimExpired(env.DB, settlement);
          if (n > 0) console.log(`[cron] reclaimed ${n} expired metro claims`);
        } catch (e) {
          console.error("[cron] reclaim failed", e);
        }
        try {
          const { maybeRefreshMetroPrice } = await import("./metroPrice");
          const q = await maybeRefreshMetroPrice({
            DB: env.DB,
            METRO_MINT: env.METRO_MINT,
            METRO_DEVNET_MINT: env.METRO_DEVNET_MINT,
            METRO_CHAIN_ID: env.METRO_CHAIN_ID,
            METRO_RPC: env.METRO_RPC,
            METRO_USD_PRICE: env.METRO_USD_PRICE,
            METRO_MAINNET_ARMED: env.METRO_MAINNET_ARMED,
          });
          console.log(
            `[cron] metro price usd=${q.usd} source=${q.source} stale=${q.stale} mult≈${(q.usd / 1).toFixed(3)}`,
          );
        } catch (e) {
          console.error("[cron] metro price refresh failed", e);
        }
      })(),
    );
  },
};
