import { WorldDO, parseZone, isNamedZone, type Env } from "./world";
import { getAccount, quote, withdraw, confirmWithdraw, deposit, poolInfo, simSettlement, type Settlement } from "./metro";
import { verifyWalletLogin } from "./auth";

export { WorldDO };

/** Mint from either METRO_MINT (preferred) or legacy METRO_DEVNET_MINT. */
function metroMint(env: Env): string | undefined {
  const m = (env.METRO_MINT || env.METRO_DEVNET_MINT || "").trim();
  return m || undefined;
}

function rpcIsMainnet(rpc: string): boolean {
  return /mainnet/i.test(rpc);
}

/**
 * Choose the bridge settlement.
 * - Real Solana when treasury secret + mint are both set.
 * - Mainnet RPC additionally requires METRO_MAINNET_ARMED=1 (counsel gate).
 * - Otherwise sim (ledger math works; deposits would be forgeable — panel must stay off).
 */
async function pickSettlement(env: Env): Promise<Settlement> {
  const mint = metroMint(env);
  const secret = env.METRO_TREASURY_SECRET?.trim();
  if (!mint || !secret) return simSettlement;

  const rpc = (env.METRO_RPC || "https://api.devnet.solana.com").trim();
  if (rpcIsMainnet(rpc) && env.METRO_MAINNET_ARMED !== "1") {
    // Refuse real mainnet settlement until armed — stay on sim so a mis-set RPC
    // cannot move value without the counsel flag.
    return simSettlement;
  }

  const { makeSolanaSettlement } = await import("./solana");
  return makeSolanaSettlement({
    rpc,
    mint,
    treasurySecretB64: secret,
  });
}

/** Require a wallet signature that proves `player` is the wallet owner (w:<addr>). */
function requireWalletPlayer(b: {
  player?: string;
  wallet?: string;
  sig?: string;
  ts?: number;
}): { ok: true; player: string; wallet: string } | { ok: false; reason: string } {
  const wallet = (b.wallet || "").trim();
  const player = (b.player || "").trim();
  const id = verifyWalletLogin({ wallet, sig: b.sig ?? "", ts: Number(b.ts) });
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
  const settlement = await pickSettlement(env);
  const mint = metroMint(env);
  const hasTreasury = !!(env.METRO_TREASURY_SECRET && env.METRO_TREASURY_SECRET.trim());
  const rpc = (env.METRO_RPC || "").trim();
  const armed = env.METRO_MAINNET_ARMED === "1";
  try {
    if (url.pathname === "/metro/account" && req.method === "GET")
      return json(await getAccount(env.DB, url.searchParams.get("player") ?? ""));
    if (url.pathname === "/metro/pool" && req.method === "GET") {
      const info = await poolInfo(env.DB) as Record<string, unknown>;
      // Always publish readiness metadata so ops can see pre-CA state.
      info.mintConfigured = !!mint;
      info.treasuryConfigured = hasTreasury;
      info.mainnetArmed = armed;
      info.rpc = rpc || null;
      info.readyForCa = hasTreasury && !mint; // treasury ready, waiting for mint
      info.liveBridge = hasTreasury && !!mint && settlement !== simSettlement;
      if (hasTreasury) {
        const { treasuryPubkey } = await import("./solana");
        info.treasury = treasuryPubkey(env.METRO_TREASURY_SECRET!);
      }
      if (hasTreasury && mint && settlement !== simSettlement) {
        info.settlement = "solana";
      } else {
        info.settlement = "sim";
        if (hasTreasury && mint && rpcIsMainnet(rpc) && !armed) {
          info.reason = "mainnet RPC set but METRO_MAINNET_ARMED is off — settlement stays sim";
        } else if (!mint) {
          info.reason = "awaiting mint CA — set METRO_MINT after pump.fun launch";
        } else if (!hasTreasury) {
          info.reason = "awaiting METRO_TREASURY_SECRET";
        }
      }
      return json(info);
    }
    if (url.pathname === "/metro/status" && req.method === "GET") {
      // Ops probe — no secrets, only readiness.
      return json({
        ok: true,
        mintConfigured: !!mint,
        treasuryConfigured: hasTreasury,
        mainnetArmed: armed,
        settlement: hasTreasury && mint && settlement !== simSettlement ? "solana" : "sim",
        readyForCa: hasTreasury && !mint,
        clusterHint: rpcIsMainnet(rpc) ? "mainnet-beta" : rpc ? "custom/devnet" : "unset",
      });
    }
    if (url.pathname === "/metro/quote" && req.method === "GET")
      return json(quote(Number(url.searchParams.get("credits") ?? "0")));
    if (url.pathname === "/metro/withdraw" && req.method === "POST") {
      const b = (await req.json()) as {
        player?: string;
        wallet?: string;
        credits?: number;
        sig?: string;
        ts?: number;
      };
      // Wallet proof required for real settlement; sim still accepts player id for smoke tests.
      if (settlement !== simSettlement) {
        const auth = requireWalletPlayer(b);
        if (!auth.ok) return json(auth, 401);
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
      const b = (await req.json()) as {
        player?: string;
        withdrawId?: number;
        txSig?: string;
        wallet?: string;
        sig?: string;
        ts?: number;
      };
      let player = b.player ?? "";
      if (settlement !== simSettlement) {
        const auth = requireWalletPlayer(b);
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
      const b = (await req.json()) as {
        player?: string;
        wallet?: string;
        txSig?: string;
        metro?: number;
        sig?: string;
        ts?: number;
      };
      if (settlement !== simSettlement) {
        const auth = requireWalletPlayer(b);
        if (!auth.ok) return json(auth, 401);
        return json(
          await deposit(env.DB, settlement, {
            player: auth.player,
            wallet: auth.wallet,
            txSig: b.txSig ?? "",
            metro: Number(b.metro),
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
