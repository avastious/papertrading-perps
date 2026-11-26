// Extras for traders, all on the one Exchange Durable Object:
//   - alerts: "tell me when BTC goes above 80,000" and "when a position gets within 5% of liquidation".
//     Checked every minute by the cron job. They arrive as notifications on the site (and as a browser
//     notification if allowed), and by email if the trader asked for that and email is set up (mailer.js).
//   - following: follow a trader and be told when they open a trade (only for traders whose trades are public).
//   - journal: a private note on any trade (the stats are worked out on the page from the trade history).
//   - seasons: a monthly leaderboard ranked by return since the season began; the top 3 get a trophy.
//   - economic calendar: US market-moving releases (Fed decisions, inflation, jobs) for the countdown on the
//     trade screen, read about once an hour from a free public feed (CAL_URL), plus the Fed's published meeting dates.
import {alertEmail} from "./mailer.js";

const MAX_ALERTS = 20, MAX_FOLLOWS = 100, MAX_NOTES = 1000, NOTE_LEN = 500, ALERT_EMAILS_PER_DAY = 10;
const START = 10000, SEASON_MIN_DAYS = 7, CAL_EVERY = 3600000, CAL_KEEP = 30 * 86400000;
const CAL_URL = "https://nfs.faireconomy.media/ff_calendar_thisweek.json";
// Fed rate decisions on the Federal Reserve's published schedule (statement at 2pm New York time).
// The weekly feed adds each one again in its week, with the forecast; this list covers the weeks beyond.
export const FOMC = ["2026-12-09T19:00:00Z"];
const DAY = 86400000;
const name = c => String(c).replace(/^[a-z]+:/, "");
const px = x => { const a = Math.abs(x), d = a >= 1000 ? 2 : a >= 1 ? 4 : 8; return (+x.toFixed(d)).toLocaleString("en-US", {maximumFractionDigits: d}); };

// ------------------------------------------------------------------ calendar helpers
// Plain-English names for the feed's titles; anything not listed keeps its own title.
const LABELS = [
  [/^Federal Funds Rate/i, "Fed rate decision"], [/^FOMC Statement/i, "Fed statement"], [/^FOMC Press Conference/i, "Fed press conference"],
  [/^FOMC Meeting Minutes/i, "Fed meeting minutes"], [/^Fed Chair .* (Speaks|Testifies)/i, "Fed Chair speaks"],
  [/^Core CPI m\/m/i, "Core inflation (CPI)"], [/^CPI m\/m/i, "Inflation (CPI)"], [/^CPI y\/y/i, "Inflation (CPI, yearly)"],
  [/^Core PCE Price Index m\/m/i, "Inflation (PCE)"], [/^Non-Farm Employment Change/i, "Jobs report (NFP)"],
  [/^Unemployment Rate/i, "Unemployment rate"], [/^(Advance|Prelim|Final) GDP q\/q/i, "GDP (economic growth)"],
  [/^Core Retail Sales m\/m/i, "Core retail sales"], [/^Retail Sales m\/m/i, "Retail sales"], [/^Core PPI m\/m/i, "Core producer prices (PPI)"],
  [/^PPI m\/m/i, "Producer prices (PPI)"], [/^Unemployment Claims/i, "Jobless claims"], [/^ISM Manufacturing PMI/i, "Factory activity (ISM)"],
  [/^ISM Services PMI/i, "Services activity (ISM)"], [/^JOLTS Job Openings/i, "Job openings (JOLTS)"],
];
export const calLabel = t => { for (const [re, l] of LABELS) if (re.test(t)) return l; return t; };
// the feed -> US events worth knowing about
export function parseCalendar(list) {
  return (Array.isArray(list) ? list : []).filter(e => e && e.country === "USD" && /^(High|Medium)$/.test(e.impact) && Date.parse(e.date))
    .map(e => ({id: `${String(e.title).slice(0, 80)}|${e.date}`, title: String(e.title).slice(0, 80), at: Date.parse(e.date), impact: e.impact,
                forecast: String(e.forecast || "").slice(0, 20), previous: String(e.previous || "").slice(0, 20)}));
}
// seasons run from the 1st of a month (UTC); the first one, started mid-month, runs to the end of the next
// month if fewer than SEASON_MIN_DAYS are left
export function seasonBounds(start, first = false) {
  const d = new Date(start);
  let end = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
  if (first && end - start < SEASON_MIN_DAYS * DAY) end = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 2, 1);
  const last = new Date(end - 1);
  return {start, end, id: last.toISOString().slice(0, 7), name: last.toLocaleString("en-US", {month: "long", year: "numeric", timeZone: "UTC"})};
}

export function setupExtras(sql) {
  sql.exec(`CREATE TABLE IF NOT EXISTS alerts (id INTEGER PRIMARY KEY AUTOINCREMENT, uid TEXT NOT NULL, kind TEXT NOT NULL, coin TEXT,
    dir TEXT, value REAL NOT NULL, email TEXT, created INTEGER NOT NULL, fired INTEGER NOT NULL DEFAULT 0, fired_px REAL,
    state TEXT NOT NULL DEFAULT '{}', emailed INTEGER NOT NULL DEFAULT 0)`);
  sql.exec("CREATE INDEX IF NOT EXISTS alerts_uid ON alerts(uid)");
  sql.exec("CREATE TABLE IF NOT EXISTS follows (uid TEXT NOT NULL, target TEXT NOT NULL, created INTEGER NOT NULL, PRIMARY KEY (uid, target))");
  sql.exec("CREATE INDEX IF NOT EXISTS follows_target ON follows(target)");
  sql.exec("CREATE TABLE IF NOT EXISTS notes (uid TEXT NOT NULL, key TEXT NOT NULL, text TEXT NOT NULL, updated INTEGER NOT NULL, PRIMARY KEY (uid, key))");
  sql.exec("CREATE TABLE IF NOT EXISTS season_start (season TEXT NOT NULL, uid TEXT NOT NULL, equity REAL NOT NULL, PRIMARY KEY (season, uid))");
  sql.exec("CREATE TABLE IF NOT EXISTS seasons (id TEXT PRIMARY KEY, name TEXT NOT NULL, start INTEGER NOT NULL, end INTEGER NOT NULL, results TEXT NOT NULL)");
  sql.exec(`CREATE TABLE IF NOT EXISTS cal_events (id TEXT PRIMARY KEY, title TEXT NOT NULL, at INTEGER NOT NULL, impact TEXT NOT NULL,
    forecast TEXT NOT NULL DEFAULT '', previous TEXT NOT NULL DEFAULT '')`);
  sql.exec("CREATE INDEX IF NOT EXISTS cal_events_at ON cal_events(at)");
}

export const extrasMethods = {
  // ================================================================ alerts
  alertRows(uid) {
    return this.sql.exec("SELECT * FROM alerts WHERE uid = ? AND (fired = 0 OR fired > ?) ORDER BY id DESC", uid, Date.now() - 7 * DAY).toArray()
      .map(a => ({id: a.id, kind: a.kind, coin: a.coin, dir: a.dir, value: a.value, email: !!a.email, created: a.created, fired: a.fired || 0, fired_px: a.fired_px}));
  },
  alertsList(uid) { return {ok: true, alerts: this.alertRows(uid), email_ok: !!this.mailer}; },
  async freshMarkets() {
    const {PaperExchange} = globalThis.Aureous;
    const ex = new PaperExchange(this.client, {storage: null, refreshMs: 0});
    await ex.refresh();
    return ex;
  },
  async alertsAction(user, body) {
    const uid = user.uid;
    if (this.limited(uid)) return {ok: false, status: 429, error: "Too many requests. Wait a moment and try again."};
    if (!this.row(uid)) return {ok: false, status: 404, error: "No account yet."};
    const action = body.action;
    if (action === "remove") {
      this.sql.exec("DELETE FROM alerts WHERE uid = ? AND id = ?", uid, Math.floor(+body.id) || 0);
      return {...this.alertsList(uid), messages: ["Alert removed."]};
    }
    if (action === "clear") {
      this.sql.exec("DELETE FROM alerts WHERE uid = ? AND fired > 0", uid);
      return {...this.alertsList(uid), messages: ["Cleared alerts that already went off."]};
    }
    if (action !== "add") return {ok: false, status: 400, error: "Unknown action."};
    let email = null;
    if (body.email === true) {
      if (!this.mailer) return {ok: false, status: 400, error: "Email alerts aren't switched on yet."};
      if (!user.email || !user.emailVerified) return {ok: false, status: 400, error: "Your account needs a confirmed email address for email alerts."};
      email = String(user.email).toLowerCase();
    }
    if (body.kind === "liq") {
      const pct = Math.round(+body.value * 10) / 10;
      if (!(pct >= 0.5 && pct <= 50)) return {ok: false, status: 400, error: "Pick a distance between 0.5% and 50%."};
      this.sql.exec("DELETE FROM alerts WHERE uid = ? AND kind = 'liq'", uid);
      this.sql.exec("INSERT INTO alerts (uid, kind, value, email, created) VALUES (?, 'liq', ?, ?, ?)", uid, pct, email, Date.now());
      this.liqAlerts = null;
      return {...this.alertsList(uid), messages: [`You'll be told whenever a position gets within ${pct}% of its liquidation price.`]};
    }
    if (body.kind !== "price") return {ok: false, status: 400, error: "Unknown kind of alert."};
    const value = +body.value;
    if (!(value > 0 && isFinite(value))) return {ok: false, status: 400, error: "Enter the price to be alerted at."};
    const n = this.sql.exec("SELECT COUNT(*) AS n FROM alerts WHERE uid = ? AND kind = 'price' AND fired = 0", uid).one().n;
    if (n >= MAX_ALERTS) return {ok: false, status: 400, error: `You have ${MAX_ALERTS} price alerts waiting, the most at once. Remove one first.`};
    let m;
    try { m = (await this.freshMarkets()).market(String(body.coin || "")); }
    catch (e) { return {ok: false, status: 400, error: e.message}; }
    if (Math.abs(value / m.mark - 1) < 1e-9) return {ok: false, status: 400, error: `${name(m.name)} is already at ${px(value)}.`};
    const dir = value > m.mark ? "above" : "below";
    this.sql.exec("INSERT INTO alerts (uid, kind, coin, dir, value, email, created) VALUES (?, 'price', ?, ?, ?, ?, ?)", uid, m.name, dir, value, email, Date.now());
    return {...this.alertsList(uid), messages: [`Alert set: ${name(m.name)} ${dir === "above" ? "rising to" : "falling to"} ${px(value)} (now ${px(m.mark)}).`]};
  },
  // notify on the site (events), and by email when asked, within the email limits
  async fireAlert(a, msg, subject) {
    this.addEvents(a.uid, [{kind: "alert", msg}]);
    if (!a.email || !this.mailer) return;
    const since = Date.now() - DAY;
    const sent = this.sql.exec("SELECT COUNT(*) AS n FROM alerts WHERE uid = ? AND emailed > ?", a.uid, since).one().n;
    if (sent >= ALERT_EMAILS_PER_DAY) return;
    const hour = Math.floor(Date.now() / 3600000), cap = +(this.env.MAIL_HOURLY_LIMIT || 60);
    if (!this.mailHour || this.mailHour.hour !== hour) this.mailHour = {hour, n: 0};
    if (this.mailHour.n >= cap) return;
    try { await this.mailer.send({to: a.email, ...alertEmail(subject, msg)}); this.mailHour.n++; this.sql.exec("UPDATE alerts SET emailed = ? WHERE id = ?", Date.now(), a.id); }
    catch (e) { console.error("alert email", e.message); }
  },
  // every minute: price alerts against fresh marks
  async checkPriceAlerts() {
    const list = this.sql.exec("SELECT * FROM alerts WHERE kind = 'price' AND fired = 0").toArray();
    if (!list.length) return {checked: 0, fired: 0};
    const ex = await this.freshMarkets();
    let fired = 0;
    for (const a of list) {
      let mark; try { mark = ex.market(a.coin).mark; } catch { continue; }
      if (!(a.dir === "above" ? mark >= a.value : mark <= a.value)) continue;
      this.sql.exec("UPDATE alerts SET fired = ?, fired_px = ? WHERE id = ?", Date.now(), mark, a.id);
      fired++;
      await this.fireAlert(a, `Price alert: ${name(a.coin)} is ${a.dir} ${px(a.value)}, now ${px(mark)}.`,
                           `${name(a.coin)} ${a.dir === "above" ? "rose to" : "fell to"} ${px(a.value)}`);
    }
    return {checked: list.length, fired};
  },
  // during the cron job, for each account with open positions: how close is liquidation?
  async checkLiqAlert(uid, ex) {
    if (!this.liqAlerts) this.liqAlerts = new Map(this.sql.exec("SELECT * FROM alerts WHERE kind = 'liq'").toArray().map(a => [a.uid, a]));
    const a = this.liqAlerts.get(uid);
    if (!a) return;
    const state = JSON.parse(a.state || "{}"), next = {};
    let changed = false;
    for (const [coin, p] of Object.entries(ex.state.positions)) {
      let liq, mark;
      try { liq = ex.liqPrice(coin); mark = ex.market(coin).mark; } catch { continue; }
      const key = String(p.opened_ms || 0);
      if (state[coin] === key) next[coin] = key;
      if (!liq || !(mark > 0)) continue;
      const dist = Math.abs(mark - liq) / mark * 100;
      if (state[coin] === key) {
        if (dist > a.value * 2) { delete next[coin]; changed = true; }     // well clear again: warn again next time
        continue;
      }
      if (dist >= a.value) continue;
      next[coin] = key; changed = true;
      await this.fireAlert(a, `Liquidation warning: your ${p.size > 0 ? "long" : "short"} ${name(coin)} is ${dist.toFixed(1)}% from liquidation ` +
        `(price ${px(mark)}, liquidation ${px(liq)}). Add margin by closing other positions, or cut the position.`,
        `${name(coin)} is ${dist.toFixed(1)}% from liquidation`);
    }
    if (changed || Object.keys(state).length !== Object.keys(next).length) {
      a.state = JSON.stringify(next);
      this.sql.exec("UPDATE alerts SET state = ?, fired = ? WHERE id = ?", a.state, Object.keys(next).length ? Date.now() : 0, a.id);
    }
  },

  // ================================================================ following
  followCount(target) { return this.sql.exec("SELECT COUNT(*) AS n FROM follows WHERE target = ?", target).one().n; },
  isFollowing(uid, target) { return !!uid && this.sql.exec("SELECT 1 FROM follows WHERE uid = ? AND target = ?", uid, target).toArray().length > 0; },
  follow(uid, body) {
    if (this.limited(uid)) return {ok: false, status: 429, error: "Too many requests. Wait a moment and try again."};
    if (!this.row(uid)) return {ok: false, status: 404, error: "No account yet."};
    const t = typeof body.pid === "string" && /^[0-9a-f]{12}$/.test(body.pid) ? this.sql.exec("SELECT uid, name, private FROM accounts WHERE pid = ?", body.pid).toArray()[0] : null;
    if (!t) return {ok: false, status: 404, error: "Trader not found."};
    if (t.uid === uid) return {ok: false, status: 400, error: "You can't follow yourself."};
    const on = body.on !== false;
    if (on) {
      const n = this.sql.exec("SELECT COUNT(*) AS n FROM follows WHERE uid = ?", uid).one().n;
      if (n >= MAX_FOLLOWS && !this.isFollowing(uid, t.uid)) return {ok: false, status: 400, error: `You follow ${MAX_FOLLOWS} traders, the most at once. Unfollow someone first.`};
      this.sql.exec("INSERT OR IGNORE INTO follows (uid, target, created) VALUES (?, ?, ?)", uid, t.uid, Date.now());
    } else this.sql.exec("DELETE FROM follows WHERE uid = ? AND target = ?", uid, t.uid);
    return {ok: true, following: on, followers: this.followCount(t.uid),
            messages: [on ? (t.private ? `Following ${t.name}. They keep their trades private, so you won't be told about their trades unless they make them public.`
                                       : `Following ${t.name}. You'll be told when they open a trade.`) : `Unfollowed ${t.name}.`]};
  },
  async following(uid) {
    const rows = this.sql.exec(`SELECT a.uid, a.pid, a.name, a.private, f.created FROM follows f JOIN accounts a ON a.uid = f.target WHERE f.uid = ? ORDER BY f.created DESC`, uid).toArray();
    try { await this.leaderboard(); } catch {}
    const ranked = new Map(((this.board && this.board.rows) || []).map(r => [r.uid, r]));
    return {ok: true, following: rows.map(r => { const b = ranked.get(r.uid) || {};
      return {pid: r.pid, name: r.name, private: !!r.private, since: r.created, rank: b.rank || null, equity: b.equity ?? null, return: b.return ?? null,
              positions: b.positions ?? null, badge: b.badge || null, trophy: b.trophy || null, ...(b.clan_tag ? {clan: b.clan_tag} : {})}; })};
  },
  // called whenever an account is saved: tell followers about newly opened positions
  notifyFollowers(row, ex) {
    if (row.private) return;
    const before = JSON.parse(row.core).positions || {}, after = ex.state.positions;
    const opened = Object.entries(after).filter(([c, p]) => !before[c] || Math.sign(before[c].size) !== Math.sign(p.size));
    if (!opened.length) return;
    const fans = this.sql.exec("SELECT uid FROM follows WHERE target = ?", row.uid).toArray();
    if (!fans.length) return;
    const msg = opened.map(([c, p]) => {
      let lev = ""; try { lev = ` at ${ex.leverage(c)}x`; } catch {}
      return `${p.size > 0 ? "long" : "short"} ${name(c)}${lev} (entry ${px(p.entry)})`;
    }).join(" and ");
    for (const f of fans) this.addEvents(f.uid, [{kind: "follow", msg: `${row.name} opened a ${msg}. #trader-${row.pid}`}]);
  },

  // ================================================================ journal notes
  notes(uid) {
    return {ok: true, notes: Object.fromEntries(this.sql.exec("SELECT key, text FROM notes WHERE uid = ?", uid).toArray().map(r => [r.key, r.text]))};
  },
  setNote(uid, body) {
    if (this.limited(uid)) return {ok: false, status: 429, error: "Too many requests. Wait a moment and try again."};
    const key = String(body.key || ""), text = String(body.text || "").replace(/\r/g, "").trim();
    if (!/^\d{10,15}:[A-Za-z0-9:_-]{1,40}$/.test(key)) return {ok: false, status: 400, error: "That isn't one of your trades."};
    if (text.length > NOTE_LEN) return {ok: false, status: 400, error: `Notes can be up to ${NOTE_LEN} characters.`};
    if (!this.row(uid)) return {ok: false, status: 404, error: "No account yet."};
    if (!text) { this.sql.exec("DELETE FROM notes WHERE uid = ? AND key = ?", uid, key); return {ok: true, messages: ["Note removed."]}; }
    const exists = this.sql.exec("SELECT 1 FROM notes WHERE uid = ? AND key = ?", uid, key).toArray().length;
    if (!exists && this.sql.exec("SELECT COUNT(*) AS n FROM notes WHERE uid = ?", uid).one().n >= MAX_NOTES)
      return {ok: false, status: 400, error: `You have ${MAX_NOTES} notes, the most. Remove an old one first.`};
    this.sql.exec("INSERT INTO notes (uid, key, text, updated) VALUES (?, ?, ?, ?) ON CONFLICT(uid, key) DO UPDATE SET text = excluded.text, updated = excluded.updated",
                  uid, key, text, Date.now());
    return {ok: true, messages: ["Note saved."]};
  },

  // ================================================================ seasons
  season() { return this.setting("season", null); },
  async snapshotSeason(s) {
    this.board = null;                                   // fresh values, not the 20-second cache
    await this.leaderboard();
    for (const r of this.board.rows) this.sql.exec("INSERT OR REPLACE INTO season_start (season, uid, equity) VALUES (?, ?, ?)", s.id, r.uid, r.equity);
  },
  // start the first season, or end the current one and start the next (cron job, and before showing the season)
  async ensureSeason(now = Date.now(), forceEnd = false) {
    let s = this.season();
    if (s && !forceEnd && now < s.end) return s;
    if (this.seasonBusy) return this.seasonBusy;
    this.seasonBusy = (async () => {
      try {
        s = this.season();
        if (!s) {
          s = seasonBounds(now, true);
          await this.snapshotSeason(s);
          this.putSetting("season", s);
          return s;
        }
        if (!forceEnd && now < s.end) return s;
        // the season is over: rank it (on fresh values), hand out trophies, start the next one
        this.board = null;
        const ranked = (await this.seasonRanking(s)).filter(r => r.ranked);
        const results = ranked.slice(0, 10).map((r, i) => ({place: i + 1, pid: r.pid, name: r.name, return: r.return}));
        this.sql.exec("INSERT OR REPLACE INTO seasons (id, name, start, end, results) VALUES (?, ?, ?, ?, ?)", s.id, s.name, s.start, Math.min(now, s.end), JSON.stringify(results));
        const medal = ["gold", "silver", "bronze"];
        ranked.slice(0, 3).forEach((r, i) => {
          const t = this.sql.exec("SELECT trophies FROM accounts WHERE uid = ?", r.uid).toArray()[0];
          if (!t) return;
          const list = JSON.parse(t.trophies || "[]").filter(x => x.season !== s.id);
          list.push({season: s.id, name: s.name, place: i + 1, return: r.return});
          this.sql.exec("UPDATE accounts SET trophies = ? WHERE uid = ?", JSON.stringify(list), r.uid);
          this.addEvents(r.uid, [{kind: "milestone", msg: `You finished #${i + 1} in the ${s.name} season with ${(r.return * 100).toFixed(1)}%. ` +
            `Your ${medal[i]} trophy is on your profile and the leaderboard.`}]);
        });
        const next = seasonBounds(forceEnd || now - s.end > DAY ? now : s.end);
        this.sql.exec("DELETE FROM season_start WHERE season != ?", next.id);
        await this.snapshotSeason(next);
        this.putSetting("season", next);
        this.board = null;
        return next;
      } finally { this.seasonBusy = null; }
    })();
    return this.seasonBusy;
  },
  // a reset starts the trader's season again from $10,000 (so resetting can't fake a return)
  seasonReset(uid) {
    const s = this.season();
    if (s) this.sql.exec("INSERT OR REPLACE INTO season_start (season, uid, equity) VALUES (?, ?, ?)", s.id, uid, START);
  },
  async seasonRanking(s) {
    await this.leaderboard();
    const starts = new Map(this.sql.exec("SELECT uid, equity FROM season_start WHERE season = ?", s.id).toArray().map(r => [r.uid, r.equity]));
    return this.board.rows.map(r => {
      const start = starts.get(r.uid) ?? START, ret = start > 0 ? r.equity / start - 1 : 0;
      return {...r, start, return: ret, ranked: Math.abs(ret) > 1e-9 || r.positions > 0};
    }).sort((a, b) => (b.ranked - a.ranked) || b.return - a.return);
  },
  async seasonBoard(uid = null) {
    try {
      const s = await this.ensureSeason();
      const rows = await this.seasonRanking(s);
      let rank = 0; for (const r of rows) r.srank = r.ranked ? ++rank : null;
      const pub = r => ({rank: r.srank, pid: r.pid, name: r.name, return: r.return, equity: r.equity, start: r.start, positions: r.positions,
                         badge: r.badge, ...(r.clan_tag ? {clan: r.clan_tag} : {}), ...(r.trophy ? {trophy: r.trophy} : {})});
      const me = uid ? rows.find(r => r.uid === uid) : null;
      const last = this.sql.exec("SELECT * FROM seasons ORDER BY end DESC LIMIT 1").toArray()[0];
      return {ok: true, season: {id: s.id, name: s.name, start: s.start, end: s.end}, ranked: rank,
              rows: rows.filter(r => r.ranked).slice(0, 100).map(pub), me: me ? pub(me) : null,
              last: last ? {id: last.id, name: last.name, results: JSON.parse(last.results).slice(0, 3)} : null};
    } catch (e) { return {ok: false, status: 500, error: e.message}; }
  },

  // ================================================================ economic calendar
  async fetchCalendar(force = false) {
    const st = this.setting("cal_state", {});
    if (!force && Date.now() - (st.at || 0) < CAL_EVERY) return {skipped: true};
    st.at = Date.now();
    try {
      const headers = {Accept: "application/json", "User-Agent": "Aureous/1.0 (+https://aureous.trade)"};
      if (st.etag) headers["If-None-Match"] = st.etag;
      const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 10000);
      let r; try { r = await fetch(this.env.CAL_URL || CAL_URL, {headers, signal: ctl.signal}); } finally { clearTimeout(timer); }
      if (r.status === 304) { st.ok = Date.now(); st.error = null; }
      else if (!r.ok) throw new Error(`calendar feed error ${r.status}`);
      else {
        const list = parseCalendar(await r.json());
        for (const e of list) this.sql.exec(`INSERT INTO cal_events (id, title, at, impact, forecast, previous) VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET at = excluded.at, impact = excluded.impact, forecast = excluded.forecast, previous = excluded.previous`,
          e.id, e.title, e.at, e.impact, e.forecast, e.previous);
        // the feed moved an event (new date): drop this week's copies it no longer lists
        const ids = new Set(list.map(e => e.id)), lo = Math.min(...list.map(e => e.at)), hi = Math.max(...list.map(e => e.at));
        if (list.length) for (const row of this.sql.exec("SELECT id FROM cal_events WHERE at >= ? AND at <= ?", lo, hi).toArray()) if (!ids.has(row.id)) this.sql.exec("DELETE FROM cal_events WHERE id = ?", row.id);
        this.sql.exec("DELETE FROM cal_events WHERE at < ?", Date.now() - CAL_KEEP);
        st.etag = r.headers.get("ETag") || null; st.ok = Date.now(); st.error = null;
        this.calCache = null;
      }
    } catch (e) { st.error = e.message; console.error("calendar", e.message); }
    this.putSetting("cal_state", st);
    return {ok: !st.error, error: st.error || undefined};
  },
  async calendar() {
    if (Date.now() - (this.setting("cal_state", {}).at || 0) > CAL_EVERY) this.ctx.waitUntil(this.fetchCalendar().catch(() => {}));
    if (!this.calCache || Date.now() - this.calCache.t > 60000) {
      const now = Date.now();
      const rows = this.sql.exec("SELECT * FROM cal_events WHERE at > ? AND at < ? ORDER BY at", now - 7 * DAY, now + 60 * DAY).toArray();
      const events = rows.map(r => ({title: r.title, label: calLabel(r.title), at: r.at, impact: r.impact, forecast: r.forecast, previous: r.previous}));
      for (const iso of FOMC) {
        const at = Date.parse(iso);
        if (at < now - 7 * DAY || events.some(e => e.label === "Fed rate decision" && Math.abs(e.at - at) < DAY)) continue;
        events.push({title: "Federal Funds Rate", label: "Fed rate decision", at, impact: "High", forecast: "", previous: ""});
      }
      events.sort((a, b) => a.at - b.at);
      this.calCache = {t: now, events};
    }
    const st = this.setting("cal_state", {});
    return {ok: true, events: this.calCache.events, updated: st.ok || 0};
  },
};
