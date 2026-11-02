// Tests for the browser engine (aureous/web/engine.js), mirroring tests/test_engine.py.
// Run with:  node --test tests/
import test from "node:test";
import assert from "node:assert/strict";
import "../aureous/web/engine.js";

const {PaperExchange, LocalApp, PaperError, applyFill, roundSize, roundPx, HOUR_MS} = globalThis.Aureous;
const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} != ${b}`);

class FakeClient {
  constructor() { this.px = {BTC: 60000, ETH: 3000}; this.fundingEvents = []; this.depth = 1; }
  async metaAndCtxs() {
    const universe = [{name: "BTC", szDecimals: 5, maxLeverage: 40}, {name: "ETH", szDecimals: 4, maxLeverage: 25},
                      {name: "OLD", szDecimals: 0, maxLeverage: 3, isDelisted: true}];
    const ctxs = Object.values(this.px).map(p => ({markPx: String(p), midPx: String(p), oraclePx: String(p), funding: "0.0000125",
      openInterest: "1000", dayNtlVlm: "1000000000", prevDayPx: String(p)}));
    ctxs.push({markPx: "1", midPx: null, oraclePx: "1"});
    return [{universe}, ctxs];
  }
  async l2Book(coin) {
    const p = this.px[coin], lvl = px => ({px: String(px), sz: String(this.depth), n: 1});
    const r = x => Math.round(x * 100) / 100;
    return {coin, levels: [Array.from({length: 20}, (_, i) => lvl(r(p * (1 - 0.0001 * (i + 1))))),
                           Array.from({length: 20}, (_, i) => lvl(r(p * (1 + 0.0001 * (i + 1)))))]};
  }
  async fundingHistory(coin, start, end) { return this.fundingEvents.filter(e => e.coin === coin && e.time >= start && e.time <= (end ?? 1e18)); }
  async candles() { return []; }
}
class MemStore { constructor() { this.m = {}; } getItem(k) { return this.m[k] ?? null; } setItem(k, v) { this.m[k] = String(v); } }

async function env() {
  const client = new FakeClient(), clock = {t: 1_700_000_000_000}, storage = new MemStore();
  const ex = new PaperExchange(client, {storage, startingBalance: 10000, refreshMs: 0, now: () => clock.t});
  await ex.refresh(true);
  return {ex, client, clock, storage};
}
const rejects = (p, re) => assert.rejects(p, e => e instanceof PaperError && (!re || re.test(e.message)));
const throws = (f, re) => assert.throws(f, e => e instanceof PaperError && (!re || re.test(e.message)));

test("helpers", () => {
  assert.equal(roundSize(0.123456789, 5), 0.12345);
  assert.equal(roundPx(60123.456, 5), 60123);
  assert.equal(roundPx(3.141592, 0), 3.1416);
  assert.equal(roundPx(0.000123456, 0), 0.000123);
  assert.deepEqual(applyFill(1, 100, 1, 200), [2, 150, 0]);
  assert.deepEqual(applyFill(2, 100, -1, 150), [1, 100, 50]);
  assert.deepEqual(applyFill(1, 100, -3, 90), [-2, 90, -10]);
});

test("markets skip delisted, case-insensitive", async () => {
  const {ex} = await env();
  assert.equal(ex.market("btc").name, "BTC");
  throws(() => ex.market("OLD"));
});

test("market long pnl and close", async () => {
  const {ex, client} = await env();
  const t = await ex.marketOrder("BTC", 0.1);
  assert.equal(t.sz, 0.1); near(t.px, 60006);
  near(ex.state.balance, 10000 - 0.1 * 60006 * 0.00045);
  client.px.BTC = 61000; await ex.update();
  near(ex.upnl("BTC"), 0.1 * (61000 - 60006));
  const c = await ex.close("BTC");
  near(c.realized, 0.1 * (c.px - 60006));
  assert.equal(ex.state.positions.BTC, undefined);
});

test("book sweep and partial fills", async () => {
  const {ex, client} = await env();
  client.depth = 0.05;
  const t = await ex.marketOrder("ETH", 0.12);
  assert.equal(t.sz, 0.12); assert.ok(t.px > 3000.3);
  client.depth = 0.001; ex.setLeverage("BTC", 40);
  const p = await ex.marketOrder("BTC", 1);
  near(p.sz, 0.02); assert.equal(p.requested, 1);
});

test("margin and leverage checks", async () => {
  const {ex} = await env();
  ex.setLeverage("BTC", 2);
  await rejects(ex.marketOrder("BTC", 0.5), /Insufficient margin/);
  throws(() => ex.setLeverage("BTC", 1001));
  ex.setLeverage("BTC", 40);
  await ex.marketOrder("BTC", 0.5);
  throws(() => ex.setLeverage("BTC", 1), /lower leverage/);
  await ex.close("BTC");
});

test("leverage above Hyperliquid's cap (up to 1000x)", async () => {
  const {ex} = await env();
  await ex.refresh();
  const m = ex.market("BTC");
  ex.setLeverage("BTC", 40); assert.equal(ex.mmr("BTC"), m.mmr);
  ex.setLeverage("BTC", 1000); near(ex.mmr("BTC"), 1 / 2000);
  ex.client.depth = 50;
  await ex.marketOrder("BTC", 100);                 // $6M on $10k at 1000x
  const p = ex.state.positions.BTC;
  const gap = (p.entry - ex.liqPrice("BTC")) / p.entry;
  assert.ok(gap > 0 && gap < 0.002, `liquidation is a tiny move away (${gap})`);
});

test("flip and reduce-only", async () => {
  const {ex} = await env();
  await ex.marketOrder("ETH", 1); await ex.marketOrder("ETH", -3);
  assert.equal(ex.state.positions.ETH.size, -2);
  await rejects(ex.marketOrder("ETH", -1, true), /Reduce-only/);
  const t = await ex.marketOrder("ETH", 5, true);
  assert.equal(t.sz, 2); assert.equal(ex.state.positions.ETH, undefined);
});

test("limit rests, fills as maker; post-only rejects", async () => {
  const {ex, client} = await env();
  const r = await ex.limitOrder("ETH", 1, 2900);
  assert.ok(r.order && !r.fill); near(ex.orderMargin(), 290);
  await rejects(ex.limitOrder("ETH", 1, 3100, "alo"), /Post-only/);
  client.px.ETH = 2899;
  const ev = await ex.update();
  assert.ok(ev.some(e => e.includes("filled")));
  assert.equal(ex.state.positions.ETH.entry, 2900);
  near(ex.state.trades.at(-1).fee, 2900 * 0.00015);
});

test("marketable limit fills as taker; IOC", async () => {
  const {ex} = await env();
  const r = await ex.limitOrder("BTC", 0.01, 61000);
  assert.equal(r.fill.sz, 0.01); assert.equal(r.order, null);
  assert.deepEqual(await ex.limitOrder("BTC", 0.01, 59000, "ioc"), {fill: null, order: null});
});

test("stop-loss and take-profit", async () => {
  const {ex, client} = await env();
  await ex.marketOrder("BTC", 0.1);
  throws(() => ex.triggerOrder("BTC", "sl", 61000), /below/);
  ex.triggerOrder("BTC", "sl", 59000); ex.triggerOrder("BTC", "tp", 65000);
  client.px.BTC = 58900;
  const ev = await ex.update();
  assert.ok(ev.some(e => e.includes("SL")));
  assert.equal(ex.state.positions.BTC, undefined); assert.deepEqual(ex.state.orders, []);
});

test("short partial take-profit", async () => {
  const {ex, client} = await env();
  await ex.marketOrder("ETH", -2);
  ex.triggerOrder("ETH", "tp", 2800, 1);
  client.px.ETH = 2790; await ex.update();
  assert.equal(ex.state.positions.ETH.size, -1);
});

test("hourly funding, no double counting", async () => {
  const {ex, client, clock} = await env();
  await ex.marketOrder("BTC", 0.1);
  const first = (Math.floor(ex.now() / HOUR_MS) + 1) * HOUR_MS;
  client.fundingEvents = [{coin: "BTC", fundingRate: "0.0001", time: first}, {coin: "BTC", fundingRate: "-0.00005", time: first + HOUR_MS}];
  const bal = ex.state.balance;
  clock.t += 2.5 * HOUR_MS;
  await ex.update();
  const expected = -0.1 * 60000 * 0.0001 + 0.1 * 60000 * 0.00005;
  near(ex.state.balance - bal, expected);
  await ex.update();
  near(ex.state.balance - bal, expected);
});

test("liquidation", async () => {
  const {ex, client} = await env();
  ex.setLeverage("BTC", 40);
  await ex.marketOrder("BTC", 6);
  const liq = ex.liqPrice("BTC");
  assert.ok(liq > 58000 && liq < 60000);
  client.px.BTC = liq * 1.001; assert.ok(!(await ex.update()).some(e => e.includes("LIQUIDATED")));
  client.px.BTC = liq * 0.999; assert.ok((await ex.update()).some(e => e.includes("LIQUIDATED")));
  assert.deepEqual(ex.state.positions, {});
});

test("persists to storage", async () => {
  const {ex, client, clock, storage} = await env();
  await ex.marketOrder("ETH", 1); await ex.limitOrder("BTC", 0.01, 50000);
  const ex2 = new PaperExchange(client, {storage, refreshMs: 0, now: () => clock.t});
  await ex2.refresh(true);
  assert.equal(ex2.state.positions.ETH.size, 1); assert.equal(ex2.state.orders.length, 1);
  near(ex2.equity(), ex.equity());
});

test("local API flow mirrors the Python server", async () => {
  const {ex} = await env();
  const app = new LocalApp(ex);
  await app.handle("/api/order", {}, {coin: "btc", side: "buy", type: "market", size: 3000, unit: "usd", leverage: 20, tp: 65000, sl: 58000});
  assert.equal(ex.state.positions.BTC.size, 0.05); assert.equal(ex.leverage("BTC"), 20);
  await app.handle("/api/order", {}, {coin: "BTC", side: "buy", type: "market", size: 0.01, unit: "coin", tp: 66000});
  const tps = ex.state.orders.filter(o => o.type === "tp");
  assert.equal(tps.length, 1); assert.equal(tps[0].trigger_px, 66000);
  await app.handle("/api/tpsl", {}, {coin: "BTC", tp: "", sl: "59000"});
  assert.deepEqual(ex.state.orders.map(o => o.type), ["sl"]);
  await rejects(app.handle("/api/tpsl", {}, {coin: "BTC", tp: "50000"}));
  assert.deepEqual(ex.state.orders.map(o => o.trigger_px), [59000]);
  const s = await app.handle("/api/state", {since: "0"});
  assert.equal(s.positions[0].coin, "BTC"); assert.equal(s.saved, true);
  await app.handle("/api/close", {}, {coin: "BTC", fraction: 0.5});
  await app.handle("/api/cancel", {}, {target: "all"}); assert.deepEqual(ex.state.orders, []);
  await rejects(app.handle("/api/order", {}, {coin: "BTC", side: "buy", size: 1e7}), /Insufficient/);
  const b = await app.handle("/api/book", {coin: "eth"}); assert.equal(b.coin, "ETH"); assert.equal(b.bids.length, 14);
  await app.handle("/api/reset", {}, {balance: 5000}); assert.equal(ex.state.balance, 5000);
});

test("builder markets (xyz:XYZ100) are merged in, and kept if their group can't be reached", async () => {
  const {HyperliquidClient, displayName} = globalThis.Aureous;
  let xyzDown = false;
  const fetchFn = async (url, init) => {
    const q = JSON.parse(init.body);
    if (q.dex === "xyz" && xyzDown) return {ok: false, status: 500, json: async () => ({})};
    const body = q.dex === "xyz"
      ? [{universe: [{name: "xyz:XYZ100", szDecimals: 4, maxLeverage: 30}, {name: "xyz:TSLA", szDecimals: 3, maxLeverage: 10}]}, [{markPx: "25000"}, {markPx: "400"}]]
      : [{universe: [{name: "BTC", szDecimals: 5, maxLeverage: 40}]}, [{markPx: "60000"}]];
    return {ok: true, status: 200, json: async () => body};
  };
  const hl = new HyperliquidClient("https://example.test", fetchFn);
  let [meta, ctxs] = await hl.metaAndCtxs();
  assert.deepEqual(meta.universe.map(u => u.name), ["BTC", "xyz:XYZ100"]);   // only the markets we chose
  assert.equal(ctxs[1].markPx, "25000");
  xyzDown = true;
  [meta] = await hl.metaAndCtxs();
  assert.deepEqual(meta.universe.map(u => u.name), ["BTC", "xyz:XYZ100"]);   // last good copy reused
  assert.equal(displayName("xyz:XYZ100"), "XYZ100"); assert.equal(displayName("kPEPE"), "kPEPE");
});
