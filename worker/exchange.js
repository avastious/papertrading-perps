// The Aureous exchange: one Durable Object holding every account in SQLite.
//
// It runs the same engine as the website (aureous/web/engine.js), but here it is the
// authority: prices come straight from Hyperliquid, balances live only in this database,
// and the browser can only ask for actions. Every minute it also settles funding and fills
// stops, take-profits, limits and liquidations for all open accounts.
import {DurableObject} from "cloudflare:workers";
import "../aureous/web/engine.js";
import {BOTS, BOT_PREFIX, BOT_BY_UID, isBot, decide, describe} from "./bots.js";

const {HyperliquidClient, PaperExchange, LocalApp, PaperError, APIError, TIERS, SPOTLIGHT_MS} = globalThis.Aureous;

const START_BALANCE = 10000;                 // everyone starts here: the leaderboard ranks account value
const ACTIONS = new Set(["/api/order", "/api/close", "/api/cancel", "/api/tpsl", "/api/leverage", "/api/reset"]);
const HISTORY = ["trades", "funding_log", "equity_curve"];
const MAX_ACTIONS_PER_MIN = 40, MAX_EVENTS = 50, BOARD_TTL = 20000, CURVE_MS = 10 * 60 * 1000;
const PEAK_STEP = 1.002;                      // only store a new peak when it's 0.2% higher (saves writes)
const newPid = () => [...crypto.getRandomValues(new Uint8Array(6))].map(b => b.toString(16).padStart(2, "0")).join("");
const NAME_RE = /^[\p{L}\p{N}][\p{L}\p{N} ._-]{1,22}[\p{L}\p{N}._-]$/u;
const TAG_RE = /^[A-Z0-9]{2,5}$/, CLAN_MAX = 50, CLAN_MIN_RANKED = 2;
const newInvite = () => [...crypto.getRandomValues(new Uint8Array(6))].map(b => "abcdefghjkmnpqrstuvwxyz23456789"[b % 31]).join("") +
                        [...crypto.getRandomValues(new Uint8Array(4))].map(b => "abcdefghjkmnpqrstuvwxyz23456789"[b % 31]).join("");

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
    this.sql.exec(`CREATE TABLE IF NOT EXISTS milestones (
      id INTEGER PRIMARY KEY AUTOINCREMENT, uid TEXT NOT NULL, tier TEXT NOT NULL, at INTEGER NOT NULL, equity REAL NOT NULL)`);
    this.sql.exec("CREATE INDEX IF NOT EXISTS milestones_at ON milestones(at)");
    // v2 columns (public profiles, badges); added in place so existing accounts keep their data
    const cols = new Set(this.sql.exec("PRAGMA table_info(accounts)").toArray().map(c => c.name));
    const add = (name, def) => { if (!cols.has(name)) this.sql.exec(`ALTER TABLE accounts ADD COLUMN ${name} ${def}`); };
    add("pid", "TEXT"); add("badges", "TEXT NOT NULL DEFAULT '[]'"); add("peak", "REAL NOT NULL DEFAULT 10000");
    add("spotlight_until", "INTEGER NOT NULL DEFAULT 0"); add("resets", "INTEGER NOT NULL DEFAULT 0"); add("private", "INTEGER NOT NULL DEFAULT 0");
    add("last_seen", "INTEGER NOT NULL DEFAULT 0");
    add("clan", "INTEGER"); add("clan_joined", "INTEGER NOT NULL DEFAULT 0");
    this.sql.exec(`CREATE TABLE IF NOT EXISTS clans (
      id INTEGER PRIMARY KEY AUTOINCREMENT, tag TEXT NOT NULL UNIQUE, name TEXT NOT NULL, owner TEXT NOT NULL,
      invite TEXT NOT NULL UNIQUE, created INTEGER NOT NULL)`);
    this.sql.exec("CREATE INDEX IF NOT EXISTS accounts_clan ON accounts(clan)");
    for (const r of this.sql.exec("SELECT uid FROM accounts WHERE pid IS NULL").toArray()) this.sql.exec("UPDATE accounts SET pid = ? WHERE uid = ?", newPid(), r.uid);
    this.sql.exec("CREATE UNIQUE INDEX IF NOT EXISTS accounts_pid ON accounts(pid)");
    this.client = new SharedClient(env.HL_API_URL || "https://api.hyperliquid.xyz");
    this.locks = new Map();      // one operation at a time per account (fetches can interleave otherwise)
    this.rate = new Map();
    this.board = null;
    this.seen = new Map();       // uid -> last request time (who's online), saved to SQL at most every 5 minutes
    this.adminCache = null;
    this.botCache = new Map();   // 15-minute candles for the bots, kept 10 minutes
  }
  touch(uid) {
    const now = Date.now(), prev = this.seen.get(uid);
    this.seen.set(uid, now);
    if (!prev || now - (this.seenSaved?.get(uid) || 0) > 300000) {
      (this.seenSaved ||= new Map()).set(uid, now);
      this.sql.exec("UPDATE accounts SET last_seen = ? WHERE uid = ?", now, uid);
    }
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
    this.sql.exec("INSERT INTO accounts (uid, pid, name, core, history, active, created, updated) VALUES (?, ?, ?, ?, ?, 0, ?, ?)",
                  uid, newPid(), this.defaultName(profile), JSON.stringify(core), JSON.stringify(hist), now, now);
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
    this.persistState(row, ex, histLoaded);
    this.checkMilestones(row.uid, ex);
  }
  // award badges for account value; each new one also starts a 7-day spotlight
  checkMilestones(uid, ex) {
    let eq;
    try { eq = ex.equity(); } catch { return; }
    if (!isFinite(eq)) return;
    const r = this.sql.exec("SELECT badges, peak FROM accounts WHERE uid = ?", uid).toArray()[0];
    if (!r) return;
    const badges = JSON.parse(r.badges || "[]"), have = new Set(badges.map(b => b.tier)), now = Date.now();
    const earned = TIERS.filter(t => eq >= t.at && !have.has(t.id));
    if (earned.length && isBot(uid)) {
      for (const t of earned) badges.push({tier: t.id, at: now, equity: Math.round(eq * 100) / 100});
      this.sql.exec("UPDATE accounts SET badges = ?, peak = MAX(peak, ?) WHERE uid = ?", JSON.stringify(badges), eq, uid);
      this.board = null;
    } else if (earned.length) {
      for (const t of earned) {
        badges.push({tier: t.id, at: now, equity: Math.round(eq * 100) / 100});
        this.sql.exec("INSERT INTO milestones (uid, tier, at, equity) VALUES (?, ?, ?, ?)", uid, t.id, now, eq);
      }
      const top = earned[earned.length - 1];
      this.sql.exec("UPDATE accounts SET badges = ?, peak = MAX(peak, ?), spotlight_until = ? WHERE uid = ?",
                    JSON.stringify(badges), eq, now + SPOTLIGHT_MS, uid);
      this.addEvents(uid, [{kind: "milestone", msg: `Milestone reached: ${top.name} ($${top.at.toLocaleString("en-US")}). ` +
        `Your badge is on the leaderboard and you're in the spotlight for 7 days.`}]);
      this.board = null;
    } else if (eq > r.peak * PEAK_STEP) {
      this.sql.exec("UPDATE accounts SET peak = ? WHERE uid = ?", eq, uid);
    }
  }
  persistState(row, ex, histLoaded) {
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
        this.touch(uid);
        const ex = this.exchangeFor(row);
        this.addEvents(uid, await this.catchUp(ex));
        this.persist(row, ex, true);
        return {ok: true, state: ex.state, profile: this.ownProfile(uid), events: this.eventsSince(uid, since)};
      } catch (e) { return fail(e); }
    });
  }

  async act(uid, profile, path, body, since = 0) {
    if (!ACTIONS.has(path)) return {ok: false, status: 404, error: "Not found"};
    if (this.limited(uid)) return {ok: false, status: 429, error: "Too many orders. Wait a moment and try again."};
    return this.withLock(uid, async () => {
      try {
        const row = this.row(uid) || this.create(uid, profile);
        this.touch(uid);
        const ex = this.exchangeFor(row);
        const app = new LocalApp(ex);
        const events = await this.catchUp(ex);
        if (path === "/api/reset") body = {};             // always back to the same starting balance
        let result, error = null;
        try { result = await app.handle(path, {}, body && typeof body === "object" ? body : {}); }
        catch (e) { error = e; }
        events.push(...app.events.map(e => ({kind: e.kind, msg: e.msg})));
        if (path === "/api/reset") {
          this.sql.exec("DELETE FROM events WHERE uid = ?", uid);
          if (!error) this.sql.exec("UPDATE accounts SET resets = resets + 1 WHERE uid = ?", uid);
        }
        else this.addEvents(uid, events);
        this.persist(row, ex, true);
        if (error) return {...fail(error), state: ex.state, events: this.eventsSince(uid, since)};
        return {ok: true, ...result, state: ex.state, profile: this.ownProfile(uid), events: this.eventsSince(uid, since)};
      } catch (e) { return fail(e); }
    });
  }

  ownProfile(uid) {
    const r = this.sql.exec("SELECT pid, name, badges, peak, spotlight_until, private, resets, clan FROM accounts WHERE uid = ?", uid).toArray()[0];
    if (!r) return null;
    const c = r.clan ? this.sql.exec("SELECT tag, name, owner FROM clans WHERE id = ?", r.clan).toArray()[0] : null;
    return {pid: r.pid, name: r.name, badges: JSON.parse(r.badges || "[]"), peak: r.peak, spotlight_until: r.spotlight_until,
            private: !!r.private, resets: r.resets, clan: c ? {tag: c.tag, name: c.name, owner: c.owner === uid} : null};
  }

  async setPrivate(uid, priv) {
    if (!this.row(uid)) return {ok: false, status: 404, error: "No account yet."};
    this.sql.exec("UPDATE accounts SET private = ? WHERE uid = ?", priv ? 1 : 0, uid);
    return {ok: true, profile: this.ownProfile(uid),
            messages: [priv ? "Your positions and trades are now hidden from other traders." : "Other traders can now see your positions and trades."]};
  }

  async setName(uid, name) {
    name = String(name || "").trim().replace(/\s+/g, " ");
    if (!NAME_RE.test(name)) return {ok: false, status: 400, error: "Use 3–24 letters, numbers, spaces, dots, dashes or underscores."};
    if (!this.row(uid)) return {ok: false, status: 404, error: "No account yet."};
    this.sql.exec("UPDATE accounts SET name = ? WHERE uid = ?", name, uid);
    this.board = null;
    return {ok: true, profile: this.ownProfile(uid), messages: [`Leaderboard name set to ${name}`]};
  }

  async remove(uid) {
    return this.withLock(uid, async () => {
      this.leaveClan(uid);
      this.sql.exec("DELETE FROM accounts WHERE uid = ?", uid);
      this.sql.exec("DELETE FROM events WHERE uid = ?", uid);
      this.sql.exec("DELETE FROM milestones WHERE uid = ?", uid);
      this.board = null; this.adminCache = null; this.seen.delete(uid);
      return {ok: true, messages: ["Account removed."]};
    });
  }

  async leaderboard(uid = null) {
    try {
      if (!this.board || Date.now() - this.board.t > BOARD_TTL) {
        const ex = new PaperExchange(this.client, {storage: null, refreshMs: 0});
        await ex.refresh();
        const tags = new Map(this.sql.exec("SELECT id, tag FROM clans").toArray().map(c => [c.id, c.tag]));
        const rows = this.sql.exec("SELECT uid, pid, name, core, badges, spotlight_until, clan, clan_joined FROM accounts").toArray().map(r => {
          const core = JSON.parse(r.core);
          let equity = core.balance;
          for (const [coin, p] of Object.entries(core.positions)) {
            let mark = p.entry;
            try { mark = ex.market(coin).mark; } catch {}
            equity += p.size * (mark - p.entry);
          }
          const badges = JSON.parse(r.badges || "[]");
          const top = TIERS.filter(t => badges.some(b => b.tier === t.id)).pop();
          return {uid: r.uid, pid: r.pid, name: r.name, equity, positions: Object.keys(core.positions).length, bot: isBot(r.uid),
                  clan: r.clan || null, clan_tag: r.clan ? tags.get(r.clan) || null : null, clan_joined: r.clan_joined,
                  badge: top ? top.id : null, spotlight_until: r.spotlight_until > Date.now() ? r.spotlight_until : 0};
        }).sort((a, b) => b.equity - a.equity);
        rows.forEach((r, i) => { r.rank = i + 1; r.return = r.equity / START_BALANCE - 1; });
        this.board = {t: Date.now(), rows};
      }
      const pub = r => ({rank: r.rank, pid: r.pid, name: r.name, equity: r.equity, return: r.return, positions: r.positions,
                         badge: r.badge, spotlight_until: r.spotlight_until > Date.now() ? r.spotlight_until : 0, ...(r.bot ? {bot: true} : {}),
                         ...(r.clan_tag ? {clan: r.clan_tag} : {})});
      const me = uid ? this.board.rows.find(r => r.uid === uid) : null;
      const milestones = this.sql.exec(`SELECT m.tier, m.at, a.name, a.pid FROM milestones m JOIN accounts a ON a.uid = m.uid
                                        WHERE m.at > ? ORDER BY m.at DESC LIMIT 10`, Date.now() - SPOTLIGHT_MS).toArray();
      return {ok: true, updated: this.board.t, total: this.board.rows.length, start: START_BALANCE,
              rows: this.board.rows.slice(0, 100).map(pub), me: me ? pub(me) : null, milestones};
    } catch (e) { return fail(e); }
  }

  // a trader's public profile: value, badges and (unless they hide them) open positions and recent trades
  async trader(pid, viewerUid = null) {
    try {
      if (typeof pid !== "string" || !/^[0-9a-f]{12}$/.test(pid)) return {ok: false, status: 404, error: "Trader not found."};
      const row = this.sql.exec("SELECT * FROM accounts WHERE pid = ?", pid).toArray()[0];
      if (!row) return {ok: false, status: 404, error: "Trader not found."};
      await this.leaderboard();                                   // makes sure ranks are fresh
      const ranked = this.board.rows.find(r => r.uid === row.uid);
      const ex = this.exchangeFor(row);
      await ex.refresh();
      const st = ex.state, equity = ex.equity(), self = viewerUid === row.uid;
      const out = {
        ok: true, pid, name: row.name, self, rank: ranked ? ranked.rank : null, total: this.board.rows.length,
        equity, return: equity / START_BALANCE - 1, peak: Math.max(row.peak, equity), resets: row.resets, joined: row.created,
        badges: JSON.parse(row.badges || "[]"), spotlight_until: row.spotlight_until > Date.now() ? row.spotlight_until : 0,
        private: !!row.private, stats: ex.stats(),
      };
      if (row.clan) { const c = this.sql.exec("SELECT tag, name FROM clans WHERE id = ?", row.clan).toArray()[0]; if (c) out.clan = {tag: c.tag, name: c.name}; }
      if (isBot(row.uid)) { out.bot = true; const b = BOT_BY_UID.get(row.uid); if (b) out.strategy = describe(b); }
      delete out.stats.equity; delete out.stats.start;
      if (!row.private || self) {
        out.positions = Object.entries(st.positions).map(([coin, p]) => {
          let mark = p.entry, lev = 1;
          try { mark = ex.market(coin).mark; lev = ex.leverage(coin); } catch {}
          return {coin, size: p.size, entry: p.entry, mark, value: Math.abs(p.size) * mark, upnl: p.size * (mark - p.entry),
                  lev, opened: p.opened_ms, funding: p.funding};
        });
        out.trades = st.trades.slice(-50).reverse().map(t => ({ts: t.ts, coin: t.coin, side: t.side, sz: t.sz, px: t.px, realized: t.realized, kind: t.kind, lev: t.lev}));
        out.curve = st.equity_curve.slice(-300);
      }
      return out;
    } catch (e) { return fail(e); }
  }

  // ------------------------------------------------------------------ clans
  // A clan is a group of friends competing together: one clan per trader, joined by invite link,
  // ranked by its members' average account value (clans need 2+ members to be ranked).
  clanRow(id) { return this.sql.exec("SELECT * FROM clans WHERE id = ?", id).toArray()[0] || null; }
  memberCount(id) { return this.sql.exec("SELECT COUNT(*) AS n FROM accounts WHERE clan = ?", id).toArray()[0].n; }
  leaveClan(uid) {                                 // no lock: callers hold the account's lock or don't need it
    const r = this.sql.exec("SELECT clan FROM accounts WHERE uid = ?", uid).toArray()[0];
    if (!r || !r.clan) return null;
    const c = this.clanRow(r.clan);
    this.sql.exec("UPDATE accounts SET clan = NULL, clan_joined = 0 WHERE uid = ?", uid);
    this.board = null;
    if (!c) return null;
    if (c.owner === uid) {                         // hand the clan to the longest-standing member, or close it
      const next = this.sql.exec("SELECT uid FROM accounts WHERE clan = ? ORDER BY clan_joined, created LIMIT 1", c.id).toArray()[0];
      if (next) this.sql.exec("UPDATE clans SET owner = ? WHERE id = ?", next.uid, c.id);
      else this.sql.exec("DELETE FROM clans WHERE id = ?", c.id);
      return {clan: c, closed: !next};
    }
    return {clan: c, closed: false};
  }
  async clanAction(uid, profile, action, body) {
    if (this.limited(uid)) return {ok: false, status: 429, error: "Too many requests. Wait a moment and try again."};
    return this.withLock(uid, async () => {
      const row = this.row(uid) || this.create(uid, profile);
      this.touch(uid);
      const mine = row.clan ? this.clanRow(row.clan) : null;
      const done = (messages, extra = {}) => { this.board = null; return {ok: true, messages, profile: this.ownProfile(uid), ...extra}; };
      if (action === "create") {
        if (mine) return {ok: false, status: 400, error: `You're already in ${mine.name}. Leave it first.`};
        const name = String(body.name || "").trim().replace(/\s+/g, " "), tag = String(body.tag || "").trim().toUpperCase();
        if (!NAME_RE.test(name)) return {ok: false, status: 400, error: "Clan name: use 3–24 letters, numbers, spaces, dots, dashes or underscores."};
        if (!TAG_RE.test(tag)) return {ok: false, status: 400, error: "Clan tag: use 2–5 letters or numbers."};
        if (this.sql.exec("SELECT 1 FROM clans WHERE tag = ?", tag).toArray().length) return {ok: false, status: 409, error: `The tag ${tag} is taken. Try another.`};
        const now = Date.now();
        this.sql.exec("INSERT INTO clans (tag, name, owner, invite, created) VALUES (?, ?, ?, ?, ?)", tag, name, uid, newInvite(), now);
        const id = this.sql.exec("SELECT id FROM clans WHERE tag = ?", tag).toArray()[0].id;
        this.sql.exec("UPDATE accounts SET clan = ?, clan_joined = ? WHERE uid = ?", id, now, uid);
        return done([`Clan ${name} [${tag}] created. Send your invite link to friends.`], {clan: tag});
      }
      if (action === "join") {
        const code = String(body.code || "").trim().toLowerCase();
        const c = /^[a-z0-9]{6,16}$/.test(code) ? this.sql.exec("SELECT * FROM clans WHERE invite = ?", code).toArray()[0] : null;
        if (!c) return {ok: false, status: 404, error: "That invite link doesn't work any more. Ask for a new one."};
        if (mine && mine.id === c.id) return done([`You're already in ${c.name}.`], {clan: c.tag});
        if (mine) return {ok: false, status: 400, error: `You're in ${mine.name}. Leave it before joining ${c.name}.`};
        if (this.memberCount(c.id) >= CLAN_MAX) return {ok: false, status: 400, error: `${c.name} is full (${CLAN_MAX} members).`};
        this.sql.exec("UPDATE accounts SET clan = ?, clan_joined = ? WHERE uid = ?", c.id, Date.now(), uid);
        return done([`You joined ${c.name} [${c.tag}].`], {clan: c.tag});
      }
      if (!mine) return {ok: false, status: 400, error: "You're not in a clan."};
      if (action === "leave") {
        const r = this.leaveClan(uid);
        return done([r && r.closed ? `You left ${mine.name}. It had no other members, so it's closed.` : `You left ${mine.name}.`]);
      }
      if (mine.owner !== uid) return {ok: false, status: 403, error: "Only the clan's leader can do that."};
      if (action === "invite") {
        this.sql.exec("UPDATE clans SET invite = ? WHERE id = ?", newInvite(), mine.id);
        return done(["New invite link made. The old link no longer works."], {clan: mine.tag});
      }
      if (action === "kick") {
        const t = typeof body.pid === "string" ? this.sql.exec("SELECT uid, name, clan FROM accounts WHERE pid = ?", body.pid).toArray()[0] : null;
        if (!t || t.clan !== mine.id) return {ok: false, status: 404, error: "That trader isn't in your clan."};
        if (t.uid === uid) return {ok: false, status: 400, error: "To leave your own clan, use Leave clan."};
        this.sql.exec("UPDATE accounts SET clan = NULL, clan_joined = 0 WHERE uid = ?", t.uid);
        this.addEvents(t.uid, [{kind: "event", msg: `You were removed from the clan ${mine.name}.`}]);
        return done([`${t.name} was removed from the clan.`], {clan: mine.tag});
      }
      if (action === "rename") {
        const name = String(body.name || "").trim().replace(/\s+/g, " ");
        if (!NAME_RE.test(name)) return {ok: false, status: 400, error: "Clan name: use 3–24 letters, numbers, spaces, dots, dashes or underscores."};
        this.sql.exec("UPDATE clans SET name = ? WHERE id = ?", name, mine.id);
        return done([`Clan renamed to ${name}.`], {clan: mine.tag});
      }
      return {ok: false, status: 404, error: "Not found"};
    });
  }
  // public: what an invite link leads to
  clanPreview(code) {
    code = String(code || "").toLowerCase();
    const c = /^[a-z0-9]{6,16}$/.test(code) ? this.sql.exec("SELECT * FROM clans WHERE invite = ?", code).toArray()[0] : null;
    if (!c) return {ok: false, status: 404, error: "That invite link doesn't work any more. Ask for a new one."};
    const leader = this.sql.exec("SELECT name FROM accounts WHERE uid = ?", c.owner).toArray()[0];
    return {ok: true, tag: c.tag, name: c.name, members: this.memberCount(c.id), max: CLAN_MAX, leader: leader ? leader.name : null};
  }
  clanStats(rows) {
    const n = rows.length, total = rows.reduce((s, r) => s + r.equity, 0), avg = n ? total / n : 0;
    return {members: n, total, average: avg, return: avg / START_BALANCE - 1, best: n ? Math.max(...rows.map(r => r.return)) : 0};
  }
  // clan leaderboard, built from the same numbers as the trader leaderboard
  async clans(uid = null) {
    const lb = await this.leaderboard();
    if (lb.ok === false) return lb;
    const byClan = new Map();
    for (const r of this.board.rows) if (r.clan) (byClan.get(r.clan) || byClan.set(r.clan, []).get(r.clan)).push(r);
    const list = this.sql.exec("SELECT id, tag, name, created FROM clans").toArray().map(c => {
      const rows = byClan.get(c.id) || [], st = this.clanStats(rows);
      const top = rows.slice().sort((a, b) => b.equity - a.equity)[0];
      return {id: c.id, tag: c.tag, name: c.name, created: c.created, ...st, ranked: st.members >= CLAN_MIN_RANKED,
              top: top ? {pid: top.pid, name: top.name, return: top.return} : null};
    }).sort((a, b) => (b.ranked - a.ranked) || b.average - a.average || b.members - a.members);
    let rank = 0; for (const c of list) c.rank = c.ranked ? ++rank : null;
    this.clanRanks = new Map(list.map(c => [c.id, c.rank]));
    const mineId = uid ? (this.sql.exec("SELECT clan FROM accounts WHERE uid = ?", uid).toArray()[0] || {}).clan : null;
    const pub = c => { const {id, ...rest} = c; return rest; };
    const me = mineId ? list.find(c => c.id === mineId) : null;
    return {ok: true, updated: this.board.t, total: list.length, ranked: rank, min_members: CLAN_MIN_RANKED,
            rows: list.slice(0, 100).map(pub), me: me ? pub(me) : null};
  }
  // a clan's page: its members ranked, plus the invite link for members
  async clanInfo(tag, uid = null) {
    tag = String(tag || "").toUpperCase();
    const c = TAG_RE.test(tag) ? this.sql.exec("SELECT * FROM clans WHERE tag = ?", tag).toArray()[0] : null;
    if (!c) return {ok: false, status: 404, error: "Clan not found."};
    const board = await this.clans();
    if (board.ok === false) return board;
    const rows = this.board.rows.filter(r => r.clan === c.id).sort((a, b) => b.equity - a.equity);
    const member = uid ? rows.find(r => r.uid === uid) : null;
    const out = {ok: true, tag: c.tag, name: c.name, created: c.created, rank: this.clanRanks.get(c.id) || null, ranked_total: board.ranked,
                 total: board.total, min_members: CLAN_MIN_RANKED, max: CLAN_MAX, ...this.clanStats(rows),
                 members: rows.map((r, i) => ({pos: i + 1, pid: r.pid, name: r.name, equity: r.equity, return: r.return, positions: r.positions,
                                               badge: r.badge, rank: r.rank, leader: r.uid === c.owner, joined: r.clan_joined}))};
    if (member) out.me = {member: true, leader: c.owner === uid, invite: c.invite};
    return out;
  }

  // ------------------------------------------------------------------ admin (site owner only)
  lastSeen(r) { return Math.max(this.seen.get(r.uid) || 0, r.last_seen || 0); }
  async adminOverview() {
    try {
      if (this.adminCache && Date.now() - this.adminCache.t < 15000) return this.adminCache.data;
      const ex = new PaperExchange(this.client, {storage: null, refreshMs: 0});
      await ex.refresh();
      const now = Date.now(), day0 = new Date(); day0.setUTCHours(0, 0, 0, 0);
      const today = day0.getTime(), DAY = 864e5;
      const rows = this.sql.exec("SELECT uid, pid, name, core, history, badges, created, last_seen, resets, private, spotlight_until FROM accounts").toArray();
      const users = [], markets = new Map(), signups = new Map(), badgeCount = {};
      let tradesToday = 0, trades7 = 0, volumeToday = 0, openPositions = 0, liquidationsToday = 0;
      for (const r of rows) {
        if (isBot(r.uid)) {
          const core = JSON.parse(r.core); let equity = core.balance;
          for (const [coin, p] of Object.entries(core.positions)) { let mark = p.entry; try { mark = ex.market(coin).mark; } catch {} equity += p.size * (mark - p.entry); }
          const trades = (JSON.parse(r.history).trades || []);
          users.push({uid: r.uid, pid: r.pid, name: r.name, bot: true, created: r.created, last_seen: 0, online: false, equity, return: equity / START_BALANCE - 1,
                      positions: Object.keys(core.positions).length, orders: core.orders.length, trades: trades.length,
                      trades_today: trades.filter(t => t.ts >= today).length, volume: trades.reduce((s, t) => s + t.sz * t.px, 0),
                      resets: r.resets, private: false, badges: JSON.parse(r.badges || "[]").map(b => b.tier), spotlight: false});
          continue;
        }
        const core = JSON.parse(r.core), hist = JSON.parse(r.history), trades = hist.trades || [];
        let equity = core.balance;
        for (const [coin, p] of Object.entries(core.positions)) {
          let mark = p.entry; try { mark = ex.market(coin).mark; } catch {}
          equity += p.size * (mark - p.entry);
          const m = markets.get(coin) || {coin, positions: 0, trades: 0, volume: 0}; m.positions++; markets.set(coin, m);
        }
        openPositions += Object.keys(core.positions).length;
        let tToday = 0, vToday = 0, volume = 0;
        for (const t of trades) {
          const v = t.sz * t.px; volume += v;
          if (t.ts >= now - 7 * DAY) trades7++;
          if (t.ts >= today) {
            tToday++; vToday += v; if (t.kind === "liquidation") liquidationsToday++;
            const m = markets.get(t.coin) || {coin: t.coin, positions: 0, trades: 0, volume: 0}; m.trades++; m.volume += v; markets.set(t.coin, m);
          }
        }
        tradesToday += tToday; volumeToday += vToday;
        const dayKey = new Date(r.created).toISOString().slice(0, 10);
        signups.set(dayKey, (signups.get(dayKey) || 0) + 1);
        const badges = JSON.parse(r.badges || "[]");
        for (const b of badges) badgeCount[b.tier] = (badgeCount[b.tier] || 0) + 1;
        const seen = this.lastSeen(r);
        users.push({uid: r.uid, pid: r.pid, name: r.name, created: r.created, last_seen: seen, online: now - seen < 60000,
                    equity, return: equity / START_BALANCE - 1, positions: Object.keys(core.positions).length, orders: core.orders.length,
                    trades: trades.length, trades_today: tToday, volume, resets: r.resets, private: !!r.private,
                    badges: badges.map(b => b.tier), spotlight: r.spotlight_until > now});
      }
      users.sort((a, b) => b.last_seen - a.last_seen);
      const bots = users.filter(u => u.bot), people = users.filter(u => !u.bot);
      const days = [];
      for (let i = 29; i >= 0; i--) { const k = new Date(today - i * DAY).toISOString().slice(0, 10); days.push({day: k, signups: signups.get(k) || 0}); }
      const count = ms => people.filter(u => u.last_seen >= now - ms).length;
      const data = {
        ok: true, at: now,
        totals: {traders: people.length, bots: bots.length, online: people.filter(u => u.online).length, active_1h: count(3600000), active_24h: count(DAY), active_7d: count(7 * DAY),
                 new_today: people.filter(u => u.created >= today).length, new_7d: people.filter(u => u.created >= now - 7 * DAY).length,
                 trades_today: tradesToday, trades_7d: trades7, volume_today: volumeToday, open_positions: openPositions,
                 liquidations_today: liquidationsToday, private_profiles: people.filter(u => u.private).length},
        signups: days, badges: badgeCount,
        clans: this.sql.exec(`SELECT c.tag, c.name, c.created, (SELECT COUNT(*) FROM accounts a WHERE a.clan = c.id) AS members,
                              (SELECT name FROM accounts a WHERE a.uid = c.owner) AS leader FROM clans c ORDER BY members DESC, c.created`).toArray(),
        markets: [...markets.values()].sort((a, b) => b.volume - a.volume || b.positions - a.positions).slice(0, 12),
        users,
      };
      this.adminCache = {t: now, data};
      return data;
    } catch (e) { return fail(e); }
  }
  async adminUser(uid) {
    const row = this.row(uid);
    if (!row) return {ok: false, status: 404, error: "No such trader."};
    const pub = await this.trader(row.pid, row.uid);           // full view (as if the trader were looking)
    if (!pub.ok) return pub;
    const core = JSON.parse(row.core);
    return {...pub, uid, created: row.created, last_seen: this.lastSeen(row), online: Date.now() - this.lastSeen(row) < 60000,
            orders: core.orders, events: this.eventsSince(uid, 0)};
  }
  async adminAction(action, uid, body = {}) {
    const row = this.row(uid);
    if (!row) return {ok: false, status: 404, error: "No such trader."};
    if (isBot(uid) && action === "rename") return {ok: false, status: 400, error: "Bots keep their names."};
    this.adminCache = null;
    if (action === "rename") return this.setName(uid, body.name);
    if (action === "remove") return this.remove(uid);
    if (action === "reset") {
      return this.withLock(uid, async () => {
        const ex = this.exchangeFor(this.row(uid));
        await ex.refresh();
        ex.reset(null);
        this.persist(this.row(uid), ex, true);
        this.sql.exec("UPDATE accounts SET resets = resets + 1 WHERE uid = ?", uid);
        this.sql.exec("DELETE FROM events WHERE uid = ?", uid);
        this.addEvents(uid, [{kind: "event", msg: "Your account was reset to $10,000 by Aureous."}]);
        return {ok: true, messages: [`${row.name}'s account was reset to $10,000.`]};
      });
    }
    return {ok: false, status: 404, error: "Unknown action."};
  }

  adminClanRemove(tag) {
    const c = this.sql.exec("SELECT * FROM clans WHERE tag = ?", String(tag || "").toUpperCase()).toArray()[0];
    if (!c) return {ok: false, status: 404, error: "No such clan."};
    for (const m of this.sql.exec("SELECT uid FROM accounts WHERE clan = ?", c.id).toArray())
      this.addEvents(m.uid, [{kind: "event", msg: `The clan ${c.name} was closed by Aureous.`}]);
    this.sql.exec("UPDATE accounts SET clan = NULL, clan_joined = 0 WHERE clan = ?", c.id);
    this.sql.exec("DELETE FROM clans WHERE id = ?", c.id);
    this.board = null; this.adminCache = null;
    return {ok: true, messages: [`Clan ${c.name} [${c.tag}] closed.`]};
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
          const events = await this.catchUp(ex);
          if (!isBot(uid)) this.addEvents(uid, events);
          this.persist(row, ex, false);
          processed++;
        } catch (e) { failed++; console.error("tick", uid, e.message); }
      });
    }
    let bots = null;
    try { bots = await this.runBots(); } catch (e) { console.error("bots", e.message); }
    return {ok: true, active: rows.length, processed, failed, bots};
  }

  // ------------------------------------------------------------------ bots (see bots.js)
  async runBots() {
    if (String(this.env.BOTS || "on").toLowerCase() === "off") {      // switched off: remove them
      const gone = this.sql.exec(`SELECT uid FROM accounts WHERE uid LIKE '${BOT_PREFIX}%'`).toArray();
      for (const {uid} of gone) await this.remove(uid);
      return {off: true, removed: gone.length};
    }
    const have = new Set(this.sql.exec(`SELECT uid FROM accounts WHERE uid LIKE '${BOT_PREFIX}%'`).toArray().map(r => r.uid));
    for (const b of BOTS) {
      const uid = BOT_PREFIX + b.id;
      if (have.has(uid)) continue;
      this.create(uid, null);
      this.sql.exec("UPDATE accounts SET name = ? WHERE uid = ?", b.name, uid);
    }
    const budget = {left: 4};                        // new candle downloads per minute (keeps well inside request limits)
    let woke = 0, orders = 0, resets = 0;
    for (const bot of BOTS) {
      if (Math.random() > bot.wake) continue;
      woke++;
      const uid = BOT_PREFIX + bot.id;
      await this.withLock(uid, async () => {
        const row = this.row(uid);
        if (!row) return;
        try {
          let ex = this.exchangeFor(row, false);
          await ex.update();
          if (!Object.keys(ex.state.positions).length && ex.equity() < 1000) {     // blown up: start again
            ex = this.exchangeFor(row, true);
            ex.reset(START_BALANCE);
            this.persistState(row, ex, true);
            this.sql.exec("UPDATE accounts SET resets = resets + 1 WHERE uid = ?", uid);
            resets++;
            return;
          }
          const app = new LocalApp(ex);
          for (const a of await decide(bot, ex, coin => this.botCandles(coin, budget))) {
            try { await app.handle(a.path, {}, a.body); orders++; }
            catch (e) { if (!(e instanceof PaperError)) throw e; }
          }
          this.persist(row, ex, false);
        } catch (e) { console.error("bot", bot.id, e.message); }
      });
    }
    return {woke, orders, resets};
  }
  async botCandles(coin, budget) {
    const hit = this.botCache.get(coin), now = Date.now();
    if (hit && now - hit.t < 600000) return hit.data;
    if (budget.left <= 0) return null;
    budget.left--;
    try {
      const raw = await this.client.candles(coin, "15m", now - 100 * 900000, now);
      const bars = raw.slice(0, -1);                 // completed candles; the live price is added by the bot
      const data = {close: bars.map(k => +k.c), high: bars.map(k => +k.h), low: bars.map(k => +k.l)};
      this.botCache.set(coin, {t: now, data});
      return data;
    } catch { return null; }
  }
}
