import { WorldDO, parseZone, type Env } from "./world";
import { getAccount, quote, withdraw, deposit, simSettlement } from "./metro";

export { WorldDO };

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/**
 * $METRO custodial bridge endpoints (Phase 5). Account-level economy — operates on the
 * global `credits` ledger in D1, independent of which zone DO a player is in. Settlement
 * is the devnet sim for now (step 2a); step 2b selects a real settlement when armed.
 */
async function handleMetro(url: URL, req: Request, env: Env): Promise<Response> {
  const settlement = simSettlement;
  try {
    if (url.pathname === "/metro/account" && req.method === "GET")
      return json(await getAccount(env.DB, url.searchParams.get("player") ?? ""));
    if (url.pathname === "/metro/quote" && req.method === "GET")
      return json(quote(Number(url.searchParams.get("credits") ?? "0")));
    if (url.pathname === "/metro/withdraw" && req.method === "POST") {
      const b = (await req.json()) as { player?: string; wallet?: string; credits?: number };
      return json(await withdraw(env.DB, settlement, { player: b.player ?? "", wallet: b.wallet ?? "", credits: Number(b.credits) }));
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

    if (url.pathname === "/health") {
      return new Response(JSON.stringify({ ok: true, ts: Date.now() }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    // Ops: forward a per-zone metrics probe to that zone's DO.
    if (url.pathname === "/stats") {
      const zone = "d" + parseZone(url.searchParams.get("zone"));
      const stub = env.WORLD.get(env.WORLD.idFromName(zone));
      return stub.fetch(new Request(`https://world/stats?zone=${zone}`));
    }

    if (url.pathname.startsWith("/metro/")) return handleMetro(url, req, env);

    if (url.pathname === "/ws") {
      const zone = "d" + parseZone(url.searchParams.get("zone")); // canonical
      const stub = env.WORLD.get(env.WORLD.idFromName(zone));
      return stub.fetch(req);
    }

    return new Response("metrophage-server", { status: 200 });
  },
};
