import { WorldDO, parseZone, type Env } from "./world";

export { WorldDO };

/**
 * Worker entry. Routes a WebSocket upgrade to the authoritative Durable Object for
 * its zone — one DO per district (canonical "dN"). The DO reads the same ?zone= and
 * binds itself to that district. Players hand off by reconnecting with a new zone.
 */
export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);

    if (url.pathname === "/health") {
      return new Response("ok", { status: 200, headers: { "content-type": "text/plain" } });
    }

    if (url.pathname === "/ws") {
      const zone = "d" + parseZone(url.searchParams.get("zone")); // canonical
      const stub = env.WORLD.get(env.WORLD.idFromName(zone));
      return stub.fetch(req);
    }

    return new Response("metrophage-server", { status: 200 });
  },
};
