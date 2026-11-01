// The Aureous exchange: one Durable Object holding every account in SQLite.
//
// It runs the same engine as the website (aureous/web/engine.js), but here it is the
// authority: prices come straight from Hyperliquid, balances live only in this database,
// and the browser can only ask for actions. Every minute it also settles funding and fills
// stops, take-profits, limits and liquidations for all open accounts.
import {DurableObject} from "cloudflare:workers";
import "../aureous/web/engine.js";

const {HyperliquidClient, PaperExchange, LocalApp, PaperError, APIError} = globalThis.Aureous;

const START_BALANCE = 10000;                 // everyone starts here: the leaderboard ranks account value
const ACTIONS = new Set(["/api/order", "/api/close", "/api/cancel", "/api/tpsl", "/api/leverage", "/api/reset"]);
const HISTORY = ["trades", "funding_log", "equity_curve"];
const MAX_ACTIONS_PER_MIN = 40, MAX_EVENTS = 50, BOARD_TTL = 20000, CURVE_MS = 10 * 60 * 1000;
const NAME_RE = /^[\p{L}\p{N}][\p{L}\p{N} ._-]{1,22}[\p{L}\p{N}._-]$/u;

// Shares Hyperliquid responses between accounts so one price snapshot serves everyone.
class SharedClient {
  constructor(base) { this.hl = new HyperliquidClient(base, (...a) => fetch(...a)); this.cache = new Map(); }
  cached(key, ttl, fn) {
    const hit = this.cache.get(key), now = Date.now();
    if (hit && now - hit.t < ttl) return hit.p;
    const p = fn(); this.cache.set(key, {t: now, p});
    p.catch(() => this.cache.delete(key));
    if (this.cache.size > 500) for (const [k, v] of this.cache) if (now - v.t > 600000) this.cache.delete(k);
    return p;
  }
  metaAndCtxs() { return this.cached("meta", 2500, () => this.hl.metaAndCtxs()); }
  l2Book(coin) { return this.cached("book:" + coin, 1000, () => this.hl.l2Book(coin)); }
  async fundingHistory(coin, start, end) {
    const hour = Math.floor(end / 3600000), from = (hour - 72) * 3600000;
    if (start < from) return this.hl.fundingHistory(coin, start, end);
    const all = await this.cached(`funding:${coin}:${hour}`, 3600000, () => this.hl.fundingHistory(coin, from, end));
    return all.filter(h => +h.time >= start && +h.time <= end);
  }
  candles(...a) { return this.hl.candles(...a); }
}

const split = st => {
  const core = {...st}, hist = {};
  for (const k of HISTORY) { hist[k] = st[k] || []; delete core[k]; }
  return [core, hist];
};
const fail = e => ({ok: false, status: e instanceof PaperError ? 400 : e instanceof APIError ? 502 : 500,
                    error: e instanceof APIError ? "Couldn't reach Hyperliquid: " + e.message : e.message});

export class Exchange extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS accounts (
      uid TEXT PRIMARY KEY, name TEXT NOT NULL, core TEXT NOT NULL, history TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 0, created INTEGER NOT NULL, updated INTEGER NOT NULL)`);
    this.sql.exec("CREATE INDEX IF NOT EXISTS accounts_active ON accounts(active)");
    this.sql.exec(`CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT, uid TEXT NOT NULL, ts INTEGER NOT NULL, kind TEXT NOT NULL, msg TEXT NOT NULL)`);
    this.sql.exec("CREATE INDEX IF NOT EXISTS events_uid ON events(uid, id)");
    this.client = new SharedClient(env.HL_API_URL || "https://api.hyperliquid.xyz");
    this.locks = new Map();      // one operation at a time per account (fetches can interleave otherwise)
    this.rate = new Map();
    this.board = null;
  }

  // ------------------------------------------------------------------ storage
  withLock(uid, fn) {
    const prev = this.locks.get(uid) || Promise.resolve();
    const run = prev.then(fn, fn);
    const tail = run.catch(() => {});
    this.locks.set(uid, tail);
    tail.then(() => { if (this.locks.get(uid) === tail) this.locks.delete(uid); });
    return run;
  }
  row(uid) { return this.sql.exec("SELECT * FROM accounts WHERE uid = ?", uid).toArray()[0] || null; }
  defaultName(profile) {
    const n = (profile && profile.name || "").trim().split(/\s+/).filter(Boolean);
    const guess = n.length ? n[0] + (n.length > 1 ? " " + n[n.length - 1][0] + "." : "") : "";
    return NAME_RE.test(guess) ? guess : "Trader " + Math.floor(1000 + Math.random() * 9000);
  }
  create(uid, profile) {
    const ex = new PaperExchange(this.client, {storage: null});
    const [core, hist] = split(ex.newState(START_BALANCE));
    const now = Date.now();
    this.sql.exec("INSERT INTO accounts (uid, name, core, history, active, created, updated) VALUES (?, ?, ?, ?, 0, ?, ?)",
                  uid, this.defaultName(profile), JSON.stringify(core), JSON.stringify(hist), now, now);
    this.board = null;
    return this.row(uid);
  }
  exchangeFor(row, withHistory = true) {
    const core = JSON.parse(row.core);
    const hist = withHistory ? JSON.parse(row.history) : {trades: [], funding_log: [], equity_curve: core.curve_ts ? [[core.curve_ts, 0]] : []};
    const ex = new PaperExchange(this.client, {storage: null, refreshMs: 0, curveMs: CURVE_MS});
    ex.state = {...core, ...hist};
    return ex;
  }
  persist(row, ex, histLoaded) {
    const st = ex.state;
    ex.save();                                   // trims history to the engine's caps
    const [core, hist] = split(st);
    const curve = st.equity_curve;
    core.curve_ts = curve.length ? curve[curve.length - 1][0] : core.curve_ts || null;
    const coreJson = JSON.stringify(core);
    let histJson = null;
    if (histLoaded) histJson = JSON.stringify(hist);
    else if (hist.trades.length || hist.funding_log.length || (curve.length && curve[curve.length - 1][1] !== 0)) {
      // background run: append the new entries to the stored history
      const stored = JSON.parse(row.history);
      for (const k of HISTORY) stored[k] = stored[k].concat(k === "equity_curve" ? curve.filter(p => p[1] !== 0) : hist[k]);
      const tmp = new PaperExchange(this.client, {storage: null}); tmp.state = {...core, ...stored}; tmp.save();
      histJson = JSON.stringify(stored);
    }
    const active = Object.keys(st.positions).length || st.orders.length ? 1 : 0;
    if (coreJson === row.core && (histJson === null || histJson === row.history) && active === row.active) return;
    if (histJson === null) histJson = row.history;
    this.sql.exec("UPDATE accounts SET core = ?, history = ?, active = ?, updated = ? WHERE uid = ?", coreJson, histJson, active, Date.now(), row.uid);
    this.board = null;
  }
  addEvents(uid, list) {
    const now = Date.now();
    for (const e of list) this.sql.exec("INSERT INTO events (uid, ts, kind, msg) VALUES (?, ?, ?, ?)", uid, now, e.kind, String(e.msg).slice(0, 500));
    if (list.length) this.sql.exec(`DELETE FROM events WHERE uid = ? AND id <= COALESCE((SELECT id FROM events WHERE uid = ? ORDER BY id DESC LIMIT 1 OFFSET ${MAX_EVENTS}), -1)`, uid, uid);
  }
  eventsSince(uid, since) {
    return this.sql.exec("SELECT id, ts, kind, msg FROM events WHERE uid = ? AND id > ? ORDER BY id LIMIT 50", uid, since || 0).toArray();
  }
  limited(uid) {
    const now = Date.now(), hits = (this.rate.get(uid) || []).filter(t => now - t < 60000);
    hits.push(now); this.rate.set(uid, hits);
    return hits.length > MAX_ACTIONS_PER_MIN;
  }
  // settle anything due (funding, triggers, limits, liquidation) before showing or changing an account
  async catchUp(ex) {
    return (await ex.update()).map(e => ({kind: e.includes("LIQUIDATED") ? "liquidation" : "event", msg: e}));
  }

  // ---------------------------------------------------------------- RPC methods
  async account(uid, profile, since = 0) {
    return this.withLock(uid, async () => {
      try {
        const row = this.row(uid) || this.create(uid, profile);
        const ex = this.exchangeFor(row);
        this.addEvents(uid, await this.catchUp(ex));
        this.persist(row, ex, true);
        return {ok: true, state: ex.state, profile: {name: this.row(uid).name}, events: this.eventsSince(uid, since)};
      } catch (e) { return fail(e); }
    });
  }

  async act(uid, profile, path, body, since = 0) {
    if (!ACTIONS.has(path)) return {ok: false, status: 404, error: "Not found"};
    if (this.limited(uid)) return {ok: false, status: 429, error: "Too many orders. Wait a moment and try again."};
    return this.withLock(uid, async () => {
      try {
        const row = this.row(uid) || this.create(uid, profile);
        const ex = this.exchangeFor(row);
        const app = new LocalApp(ex);
        const events = await this.catchUp(ex);
        if (path === "/api/reset") body = {};             // always back to the same starting balance
        let result, error = null;
        try { result = await app.handle(path, {}, body && typeof body === "object" ? body : {}); }
        catch (e) { error = e; }
        events.push(...app.events.map(e => ({kind: e.kind, msg: e.msg})));
        if (path === "/api/reset") this.sql.exec("DELETE FROM events WHERE uid = ?", uid);
        else this.addEvents(uid, events);
        this.persist(row, ex, true);
        if (error) return {...fail(error), state: ex.state, events: this.eventsSince(uid, since)};
        return {ok: true, ...result, state: ex.state, profile: {name: this.row(uid).name}, events: this.eventsSince(uid, since)};
      } catch (e) { return fail(e); }
    });
  }

  async setName(uid, name) {
    name = String(name || "").trim().replace(/\s+/g, " ");
    if (!NAME_RE.test(name)) return {ok: false, status: 400, error: "Use 3–24 letters, numbers, spaces, dots, dashes or underscores."};
    if (!this.row(uid)) return {ok: false, status: 404, error: "No account yet."};
    this.sql.exec("UPDATE accounts SET name = ? WHERE uid = ?", name, uid);
    this.board = null;
    return {ok: true, profile: {name}, messages: [`Leaderboard name set to ${name}`]};
  }

  async remove(uid) {
    return this.withLock(uid, async () => {
      this.sql.exec("DELETE FROM accounts WHERE uid = ?", uid);
      this.sql.exec("DELETE FROM events WHERE uid = ?", uid);
      this.board = null;
      return {ok: true};
    });
  }

  async leaderboard(uid = null) {
    try {
      if (!this.board || Date.now() - this.board.t > BOARD_TTL) {
        const ex = new PaperExchange(this.client, {storage: null, refreshMs: 0});
        await ex.refresh();
        const rows = this.sql.exec("SELECT uid, name, core FROM accounts").toArray().map(r => {
          const core = JSON.parse(r.core);
          let equity = core.balance;
          for (const [coin, p] of Object.entries(core.positions)) {
            let mark = p.entry;
            try { mark = ex.market(coin).mark; } catch {}
            equity += p.size * (mark - p.entry);
          }
          return {uid: r.uid, name: r.name, equity, positions: Object.keys(core.positions).length};
        }).sort((a, b) => b.equity - a.equity);
        rows.forEach((r, i) => { r.rank = i + 1; r.return = r.equity / START_BALANCE - 1; });
        this.board = {t: Date.now(), rows};
      }
      const pub = r => ({rank: r.rank, name: r.name, equity: r.equity, return: r.return, positions: r.positions});
      const me = uid ? this.board.rows.find(r => r.uid === uid) : null;
      return {ok: true, updated: this.board.t, total: this.board.rows.length, start: START_BALANCE,
              rows: this.board.rows.slice(0, 100).map(pub), me: me ? pub(me) : null};
    } catch (e) { return fail(e); }
  }

  // every minute (Cron Trigger): settle all accounts with open positions or orders
  async tick() {
    this.client.cache.clear();                  // start every run from fresh prices
    const rows = this.sql.exec("SELECT uid FROM accounts WHERE active = 1").toArray();
    let processed = 0, failed = 0;
    for (const {uid} of rows) {
      await this.withLock(uid, async () => {
        const row = this.row(uid);
        if (!row || !row.active) return;
        try {
          const ex = this.exchangeFor(row, false);
          this.addEvents(uid, await this.catchUp(ex));
          this.persist(row, ex, false);
          processed++;
        } catch (e) { failed++; console.error("tick", uid, e.message); }
      });
    }
    return {ok: true, active: rows.length, processed, failed};
  }
}
