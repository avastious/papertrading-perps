// Calls: a trader publicly calls a market they hold, with a written thesis. The entry is their real fill and
// the result is tracked automatically until the position is closed, so the record is honest: calls can't be
// edited or deleted by their author (the site owner can remove abusive ones). Others can agree or disagree.
import {textProblem} from "./moderation.js";
const {PaperExchange} = globalThis.Aureous;

export const MIN_THESIS = 20, MAX_THESIS = 600, CALLS_PER_DAY = 10;
const DAY = 86400000;

export function setupCalls(sql) {
  sql.exec(`CREATE TABLE IF NOT EXISTS calls (
    id INTEGER PRIMARY KEY AUTOINCREMENT, uid TEXT NOT NULL, coin TEXT NOT NULL, side TEXT NOT NULL, entry REAL NOT NULL,
    lev REAL NOT NULL, thesis TEXT NOT NULL, created INTEGER NOT NULL, closed_at INTEGER, exit REAL, outcome TEXT NOT NULL DEFAULT 'open',
    removed INTEGER NOT NULL DEFAULT 0)`);
  sql.exec("CREATE INDEX IF NOT EXISTS calls_uid ON calls(uid, outcome)");
  sql.exec("CREATE INDEX IF NOT EXISTS calls_created ON calls(created)");
  sql.exec("CREATE TABLE IF NOT EXISTS call_votes (call_id INTEGER NOT NULL, uid TEXT NOT NULL, vote INTEGER NOT NULL, PRIMARY KEY (call_id, uid))");
}

const sideOf = size => size > 0 ? "long" : "short";
const move = (c, px) => (px / c.entry - 1) * (c.side === "long" ? 1 : -1);

export const callMethods = {
  // Close any open call whose position is gone or has flipped. Runs whenever an account is saved.
  settleCalls(uid, ex) {
    const open = this.sql.exec("SELECT id, coin, side, created FROM calls WHERE uid = ? AND outcome = 'open'", uid).toArray();
    if (!open.length) return;
    const st = ex.state;
    for (const c of open) {
      const p = st.positions[c.coin];
      if (p && sideOf(p.size) === c.side) continue;
      const t = [...st.trades].reverse().find(t => t.coin === c.coin && t.ts * (t.ts < 1e12 ? 1000 : 1) >= c.created - 1000);
      let exit = t ? t.px : null;
      if (exit == null) { try { exit = ex.market(c.coin).mark; } catch { exit = null; } }
      const outcome = t && t.kind === "liquidation" ? "liquidated" : "closed";
      this.sql.exec("UPDATE calls SET outcome = ?, exit = COALESCE(?, entry), closed_at = ? WHERE id = ?", outcome, exit, Date.now(), c.id);
    }
  },

  async postCall(uid, body) {
    return this.withLock(uid, async () => {
      const row = this.row(uid);
      if (!row) return {ok: false, status: 400, error: "Open a position first, then call it."};
      const coin = String(body.coin || "");
      const thesis = String(body.thesis || "").replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim();
      if (thesis.length < MIN_THESIS) return {ok: false, status: 400, error: `Write at least ${MIN_THESIS} characters on why you're taking this trade.`};
      if (thesis.length > MAX_THESIS) return {ok: false, status: 400, error: `Keep your thesis under ${MAX_THESIS} characters.`};
      const problem = textProblem(thesis);
      if (problem) return {ok: false, status: 400, error: problem};
      const ex = this.exchangeFor(row);
      const p = ex.state.positions[coin];
      if (!p) return {ok: false, status: 400, error: "You can only call a market you hold. Open the position first."};
      const side = sideOf(p.size);
      if (this.sql.exec("SELECT id FROM calls WHERE uid = ? AND coin = ? AND outcome = 'open' AND removed = 0", uid, coin).toArray().length)
        return {ok: false, status: 400, error: "You already have an open call on this position. It closes when the position does."};
      const today = this.sql.exec("SELECT COUNT(*) AS n FROM calls WHERE uid = ? AND created > ?", uid, Date.now() - DAY).toArray()[0].n;
      if (today >= CALLS_PER_DAY) return {ok: false, status: 429, error: `That's ${CALLS_PER_DAY} calls in a day. Try again tomorrow.`};
      let lev = Math.min(+(ex.state.leverage || {})[coin] || 1, 1000);
      try { await ex.refresh(); lev = ex.leverage(coin); } catch {}
      const now = Date.now();
      this.sql.exec("INSERT INTO calls (uid, coin, side, entry, lev, thesis, created) VALUES (?, ?, ?, ?, ?, ?, ?)", uid, coin, side, p.entry, lev, thesis, now);
      const id = this.sql.exec("SELECT last_insert_rowid() AS id").toArray()[0].id;
      return {ok: true, id, messages: ["Your call is live. Its result is tracked until you close the position."]};
    });
  },

  voteCall(uid, body) {
    const id = Math.floor(+body.id), vote = Math.sign(+body.vote || 0);
    const c = this.sql.exec("SELECT uid FROM calls WHERE id = ? AND removed = 0", id).toArray()[0];
    if (!c) return {ok: false, status: 404, error: "That call isn't available."};
    if (c.uid === uid) return {ok: false, status: 400, error: "You can't vote on your own call."};
    if (vote) this.sql.exec("INSERT INTO call_votes (call_id, uid, vote) VALUES (?, ?, ?) ON CONFLICT(call_id, uid) DO UPDATE SET vote = excluded.vote", id, uid, vote);
    else this.sql.exec("DELETE FROM call_votes WHERE call_id = ? AND uid = ?", id, uid);
    return {ok: true, ...this.callVotes(id, uid)};
  },
  callVotes(id, uid) {
    const v = this.sql.exec("SELECT COALESCE(SUM(vote = 1), 0) AS agree, COALESCE(SUM(vote = -1), 0) AS disagree FROM call_votes WHERE call_id = ?", id).toArray()[0];
    const mine = uid ? this.sql.exec("SELECT vote FROM call_votes WHERE call_id = ? AND uid = ?", id, uid).toArray()[0] : null;
    return {agree: v.agree, disagree: v.disagree, my_vote: mine ? mine.vote : 0};
  },

  // Public feed. sort: latest | top (best result, last 7 days) ; status: all | open ; coin ; pid (one trader) ; id (one call)
  async calls(q = {}, viewer = null) {
    const where = ["c.removed = 0"], args = [];
    if (q.status === "open") where.push("c.outcome = 'open'");
    if (q.coin) { where.push("c.coin = ?"); args.push(String(q.coin)); }
    if (q.pid) { where.push("a.pid = ?"); args.push(String(q.pid)); }
    if (q.id) { where.push("c.id = ?"); args.push(Math.floor(+q.id)); }
    if (q.sort === "top") { where.push("c.created > ?"); args.push(Date.now() - 7 * DAY); }
    const rows = this.sql.exec(`SELECT c.*, a.pid, a.name, a.badges, a.clan FROM calls c JOIN accounts a ON a.uid = c.uid
      WHERE ${where.join(" AND ")} ORDER BY c.id DESC LIMIT ${q.sort === "top" ? 500 : 60}`, ...args).toArray();
    const px = new PaperExchange(this.client, {storage: null, refreshMs: 0});
    try { await px.refresh(); } catch {}
    const tags = new Map(this.sql.exec("SELECT id, tag FROM clans").toArray().map(c => [c.id, c.tag]));
    let out = rows.map(c => {
      let now = c.exit;
      if (c.outcome === "open") { try { now = px.market(c.coin).mark; } catch { now = c.entry; } }
      const m = move(c, now), badges = JSON.parse(c.badges || "[]");
      return {id: c.id, pid: c.pid, name: c.name, badge: badges.length ? badges[badges.length - 1].tier : null, clan: c.clan ? tags.get(c.clan) : undefined,
              coin: c.coin, side: c.side, lev: c.lev, entry: c.entry, price: now, move: m, roe: m * c.lev, thesis: c.thesis,
              created: c.created, closed_at: c.closed_at, outcome: c.outcome, self: !!viewer && viewer === c.uid, ...this.callVotes(c.id, viewer)};
    });
    if (q.sort === "top") out = out.sort((a, b) => b.roe - a.roe).slice(0, 60);
    return {ok: true, calls: out};
  },

  adminCallRemove(id) {
    const r = this.sql.exec("SELECT id FROM calls WHERE id = ?", Math.floor(+id)).toArray()[0];
    if (!r) return {ok: false, status: 404, error: "Call not found."};
    this.sql.exec("UPDATE calls SET removed = 1 WHERE id = ?", r.id);
    return {ok: true, messages: ["Call removed from the site."]};
  },
};
