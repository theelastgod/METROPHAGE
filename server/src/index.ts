import { WorldDO, parseZone, NAMED_ZONES, type Env } from "./world";
import { getAccount, quote, withdraw, confirmWithdraw, deposit, poolInfo, simSettlement, type Settlement } from "./metro";
import { verifyWalletLogin } from "./auth";

export { WorldDO };

/**
 * Choose the bridge settlement. With the devnet treasury configured (.dev.vars), use
 * real Solana — dynamically imported so @solana/web3.js never loads on the game's hot
 * path. Otherwise the devnet-sim settlement (the accounting still works end-to-end).
 */
async function pickSettlement(env: Env): Promise<Settlement> {
  if (env.METRO_TREASURY_SECRET && env.METRO_DEVNET_MINT) {
    const { makeSolanaSettlement } = await import("./solana");
    return makeSolanaSettlement({
      rpc: env.METRO_RPC || "https://api.devnet.solana.com",
      mint: env.METRO_DEVNET_MINT,
      treasurySecretB64: env.METRO_TREASURY_SECRET,
    });
  }
  return simSettlement;
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
  const stat = (url.searchParams.get("stat") || "kills").replace(/[^a-z]/g, "").slice(0, 24);
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
  try {
    if (url.pathname === "/metro/account" && req.method === "GET")
      return json(await getAccount(env.DB, url.searchParams.get("player") ?? ""));
    if (url.pathname === "/metro/pool" && req.method === "GET") {
      const info = await poolInfo(env.DB);
      // players deposit by sending $METRO to the treasury, so publish its address
      // (public key only — the secret never leaves the server) + which settlement runs
      if (env.METRO_TREASURY_SECRET && env.METRO_DEVNET_MINT) {
        const { treasuryPubkey } = await import("./solana");
        info.treasury = treasuryPubkey(env.METRO_TREASURY_SECRET);
        info.settlement = "solana";
      } else {
        info.settlement = "sim";
      }
      return json(info);
    }
    if (url.pathname === "/metro/quote" && req.method === "GET")
      return json(quote(Number(url.searchParams.get("credits") ?? "0")));
    if (url.pathname === "/metro/withdraw" && req.method === "POST") {
      const b = (await req.json()) as { player?: string; wallet?: string; credits?: number };
      return json(await withdraw(env.DB, settlement, { player: b.player ?? "", wallet: b.wallet ?? "", credits: Number(b.credits) }));
    }
    // finalize a claim after the player submitted it (they paid the network fee)
    if (url.pathname === "/metro/withdraw/confirm" && req.method === "POST") {
      const b = (await req.json()) as { player?: string; withdrawId?: number; txSig?: string };
      return json(
        await confirmWithdraw(env.DB, settlement, { player: b.player ?? "", withdrawId: Number(b.withdrawId), txSig: b.txSig ?? "" }),
      );
    }
    if (url.pathname === "/metro/deposit" && req.method === "POST") {
      const b = (await req.json()) as { player?: string; wallet?: string; txSig?: string; metro?: number };
      return json(
        await deposit(env.DB, settlement, { player: b.player ?? "", wallet: b.wallet ?? "", txSig: b.txSig ?? "", metro: Number(b.metro) }),
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
      const zone = raw && NAMED_ZONES.has(raw) ? raw : "d" + parseZone(raw);
      const stub = env.WORLD.get(env.WORLD.idFromName(zone));
      return stub.fetch(new Request(`https://world/stats?zone=${zone}`));
    }

    if (url.pathname === "/leaderboard") return handleLeaderboard(url, env);

    if (url.pathname === "/identity" && req.method === "POST") return handleIdentity(req, env);

    if (url.pathname.startsWith("/metro/")) return handleMetro(url, req, env);

    if (url.pathname === "/ws") {
      const raw = url.searchParams.get("zone");
      const zone = raw && NAMED_ZONES.has(raw) ? raw : "d" + parseZone(raw); // canonical; interiors pass through
      const stub = env.WORLD.get(env.WORLD.idFromName(zone));
      return stub.fetch(req);
    }

    return new Response("metrophage-server", { status: 200 });
  },
};
