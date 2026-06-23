import { WorldDO, type Env } from "./world";

export { WorldDO };

/**
 * Worker entry. Routes WebSocket upgrades to the authoritative zone Durable Object.
 * The spike runs a single "world" zone; per-district zones + handoff arrive in Step 3.
 */
export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);

    if (url.pathname === "/health") {
      return new Response("ok", { status: 200, headers: { "content-type": "text/plain" } });
    }

    if (url.pathname === "/ws") {
      const zone = url.searchParams.get("zone") || "world";
      const id = env.WORLD.idFromName(zone);
      const stub = env.WORLD.get(id);
      return stub.fetch(req);
    }

    return new Response("metrophage-server", { status: 200 });
  },
};
