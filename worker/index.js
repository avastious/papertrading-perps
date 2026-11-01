// aureous-api: the Aureous trading server on Cloudflare Workers.
//
//   GET  /api/leaderboard          public; top accounts by value (plus your rank when signed in)
//   GET  /api/account?since=N      your account (created on first visit with $10,000)
//   POST /api/order|close|cancel|tpsl|leverage|reset   trade (same bodies as the local server)
//   POST /api/profile {name}       set your leaderboard name
//   POST /api/delete               delete your account data
//
// Every request except the leaderboard needs "Authorization: Bearer <Firebase ID token>".
import {verifyIdToken, AuthError} from "./firebase-auth.js";
export {Exchange} from "./exchange.js";

const MAX_BODY = 4096;

function corsHeaders(req, env) {
  const origin = req.headers.get("Origin");
  const allowed = (env.ALLOWED_ORIGINS || "").split(",").map(s => s.trim()).filter(Boolean);
  if (!origin || !allowed.includes(origin)) return {};
  return {"Access-Control-Allow-Origin": origin, "Access-Control-Allow-Headers": "Authorization, Content-Type",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Max-Age": "86400", "Vary": "Origin"};
}
const json = (obj, status, headers) => new Response(JSON.stringify(obj), {status,
  headers: {"Content-Type": "application/json", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...headers}});
const exchange = env => env.EXCHANGE.get(env.EXCHANGE.idFromName("global"));

export default {
  async fetch(req, env) {
    const cors = corsHeaders(req, env);
    const url = new URL(req.url);
    if (req.method === "OPTIONS") return new Response(null, {status: cors["Access-Control-Allow-Origin"] ? 204 : 403, headers: cors});
    const reply = r => json(r.ok === false ? {ok: false, error: r.error, state: r.state, events: r.events} : r, r.ok === false ? r.status || 500 : 200, cors);

    try {
      if (url.pathname === "/" || url.pathname === "/api/health") return json({ok: true, service: "aureous-api"}, 200, cors);

      // who is asking (optional for the leaderboard, required for everything else)
      let user = null;
      const auth = req.headers.get("Authorization") || "";
      if (auth.startsWith("Bearer ")) {
        user = await verifyIdToken(auth.slice(7), env.FIREBASE_PROJECT_ID, env.JWKS_URL || undefined);
      }
      const ex = exchange(env);

      if (url.pathname === "/api/leaderboard" && req.method === "GET") return reply(await ex.leaderboard(user ? user.uid : null));
      if (!user) return json({ok: false, error: "Sign in to trade."}, 401, cors);

      if (url.pathname === "/api/account" && req.method === "GET") {
        return reply(await ex.account(user.uid, {name: user.name}, +url.searchParams.get("since") || 0));
      }
      if (req.method !== "POST") return json({ok: false, error: "Not found"}, 404, cors);
      const text = await req.text();
      if (text.length > MAX_BODY) return json({ok: false, error: "Request too large."}, 413, cors);
      let body = {};
      try { body = text ? JSON.parse(text) : {}; } catch { return json({ok: false, error: "Body must be JSON."}, 400, cors); }
      if (!body || typeof body !== "object" || Array.isArray(body)) body = {};

      if (url.pathname === "/api/profile") return reply(await ex.setName(user.uid, body.name));
      if (url.pathname === "/api/delete") return reply(await ex.remove(user.uid));
      return reply(await ex.act(user.uid, {name: user.name}, url.pathname, body, +body.since || 0));
    } catch (e) {
      if (e instanceof AuthError) return json({ok: false, error: e.message}, 401, cors);
      console.error(e);
      return json({ok: false, error: "Server error."}, 500, cors);
    }
  },

  // Cron Trigger (see wrangler.jsonc): settle stops, limits, funding and liquidations every minute
  async scheduled(event, env, ctx) {
    ctx.waitUntil(exchange(env).tick().then(r => console.log("tick", JSON.stringify(r))));
  },
};
