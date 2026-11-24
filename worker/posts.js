// Posts: live posts on X from market-moving people (Fed, Treasury, CEOs, investors), shown on the trade screen.
//
// The server reads X's API, never the browser, so one copy serves every visitor and the X key stays secret.
// X charges per post read (pay-per-use credits), so cost is kept low and capped:
//   - one search per minute for all accounts together, asking only for posts newer than the last one seen
//     (a search that finds nothing new costs nothing), plus every 20s while someone is looking at the feed;
//   - reposts and replies are skipped;
//   - a daily cap on posts read (admin setting, default 100 = about US$0.50 a day at $0.005 each);
//   - account profiles (name, picture) are read once and refreshed weekly.
// The real limit is the spending limit set in X's Developer Console; this cap just keeps well inside it.
//
// Needs the X_BEARER_TOKEN secret (Cloudflare → aureous-api → Settings → Variables and Secrets).
// X_API_URL overrides https://api.x.com for tests.

export const DEFAULT_ACCOUNTS = ["elonmusk", "realDonaldTrump", "federalreserve", "SecScottBessent", "NickTimiraos", "BillAckman",
  "CathieDWood", "chamath", "LizAnnSonders", "KobeissiLetter", "jimcramer", "saylor"];
export const DEFAULT_CAP = 100, MAX_ACCOUNTS = 40, PRICE_POST = 0.005, PRICE_USER = 0.010;
const KEEP_MS = 3 * 86400000, KEEP_ROWS = 400, FEED_SIZE = 60, PROFILE_MS = 7 * 86400000;
const MIN_GAP = 15000, VIEWER_MS = 120000, ALARM_MS = 20000, QUERY_MAX = 480;
const HANDLE_RE = /^[A-Za-z0-9_]{1,15}$/;

export function setupPosts(sql) {
  sql.exec(`CREATE TABLE IF NOT EXISTS posts (
    id TEXT PRIMARY KEY, author TEXT NOT NULL, created INTEGER NOT NULL, segs TEXT NOT NULL, media INTEGER NOT NULL DEFAULT 0,
    quote TEXT, fetched INTEGER NOT NULL)`);
  sql.exec("CREATE INDEX IF NOT EXISTS posts_created ON posts(created)");
  sql.exec(`CREATE TABLE IF NOT EXISTS x_users (
    id TEXT PRIMARY KEY, handle TEXT NOT NULL, name TEXT NOT NULL, avatar TEXT NOT NULL DEFAULT '', verified INTEGER NOT NULL DEFAULT 0,
    updated INTEGER NOT NULL)`);
  sql.exec("CREATE INDEX IF NOT EXISTS x_users_handle ON x_users(handle)");
}

// "@Foo, bar\nbaz" -> ["Foo", "bar", "baz"]; returns {list} or {error}
export function parseAccounts(input) {
  const raw = Array.isArray(input) ? input : String(input || "").split(/[\s,]+/);
  const out = [], seen = new Set();
  for (let h of raw) {
    h = String(h).trim().replace(/^https?:\/\/(www\.)?(x|twitter)\.com\//i, "").replace(/^@/, "").replace(/[/?#].*$/, "");
    if (!h) continue;
    if (!HANDLE_RE.test(h)) return {error: `"${h}" isn't an X username (letters, numbers and _ only, up to 15).`};
    if (!seen.has(h.toLowerCase())) { seen.add(h.toLowerCase()); out.push(h); }
  }
  if (out.length > MAX_ACCOUNTS) return {error: `That's ${out.length} accounts; the most is ${MAX_ACCOUNTS}.`};
  return {list: out};
}

// One search query per group of accounts, each under X's query length limit.
export function queryGroups(handles) {
  const tail = ") -is:retweet -is:reply", groups = [];
  let cur = [];
  for (const h of handles) {
    const next = [...cur, h];
    if (cur.length && ("(" + next.map(x => "from:" + x).join(" OR ") + tail).length > QUERY_MAX) { groups.push(cur); cur = [h]; }
    else cur = next;
  }
  if (cur.length) groups.push(cur);
  return groups.map(g => "(" + g.map(x => "from:" + x).join(" OR ") + tail);
}

const decode = s => s.replace(/&(amp|lt|gt|quot|#39|apos);/g, (m, e) => ({amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", apos: "'"}[e]));

// Post text -> safe pieces the site renders as text: plain strings, {u, d} links, {c} cashtags, {m} mentions.
// Photo/video links are dropped (the post shows a "Photo" marker instead); t.co links show their real address.
export function segments(text, entities) {
  const urls = new Map();
  let media = 0;
  for (const u of (entities && entities.urls) || []) {
    const isMedia = !!u.media_key || /^pic\.(x|twitter)\.com\//.test(u.display_url || "");
    if (isMedia) media++;
    urls.set(u.url, isMedia ? null : {u: u.expanded_url || u.url, d: u.display_url || u.url});
  }
  const out = [], re = /(https:\/\/t\.co\/[A-Za-z0-9]+)|\$([A-Za-z][A-Za-z0-9]{0,9})(?![A-Za-z0-9])|@([A-Za-z0-9_]{1,15})/g;
  const push = s => { if (!s) return; if (typeof out[out.length - 1] === "string") out[out.length - 1] += s; else out.push(s); };
  let last = 0, m;
  while ((m = re.exec(text))) {
    push(decode(text.slice(last, m.index)));
    if (m[1]) {
      const u = urls.has(m[1]) ? urls.get(m[1]) : {u: m[1], d: m[1].replace(/^https:\/\//, "")};
      if (u && /^https?:\/\//i.test(u.u)) out.push({u: u.u, d: u.d.length > 40 ? u.d.slice(0, 39) + "…" : u.d});
    } else if (m[2]) out.push({c: m[2].toUpperCase()});
    else if (m[3]) out.push({m: m[3]});
    last = re.lastIndex;
  }
  push(decode(text.slice(last)));
  if (typeof out[out.length - 1] === "string") out[out.length - 1] = out[out.length - 1].replace(/\s+$/, "");
  if (typeof out[0] === "string") out[0] = out[0].replace(/^\s+/, "");
  return {segs: out.filter(s => s !== ""), media};
}

const day = t => new Date(t).toISOString().slice(0, 10), month = t => new Date(t).toISOString().slice(0, 7);
const newer = (a, b) => !b || a.length > b.length || (a.length === b.length && a > b);   // X ids are big numbers as text

export const postsMethods = {
  postsToken() { return this.env.X_BEARER_TOKEN || ""; },
  postsAccounts() { return this.setting("posts_accounts", DEFAULT_ACCOUNTS); },
  postsOn() { return !!this.postsToken() && this.setting("posts_on", true) !== false && this.postsAccounts().length > 0; },
  postsState() {
    const now = Date.now(), s = {groups: {}, day: day(now), today: 0, month: month(now), monthPosts: 0, monthUsers: 0, ...this.setting("posts_state", {})};
    if (s.day !== day(now)) { s.day = day(now); s.today = 0; }
    if (s.month !== month(now)) { s.month = month(now); s.monthPosts = 0; s.monthUsers = 0; }
    return s;
  },

  async xGet(path, params) {
    const base = (this.env.X_API_URL || "https://api.x.com").replace(/\/$/, "");
    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 8000);
    let r;
    try { r = await fetch(`${base}${path}?${new URLSearchParams(params)}`, {headers: {Authorization: "Bearer " + this.postsToken()}, signal: ctl.signal}); }
    catch (e) { throw new Error("Couldn't reach X" + (e.name === "AbortError" ? " (timed out)." : ".")); }
    finally { clearTimeout(timer); }
    let body = null; try { body = await r.json(); } catch {}
    if (r.ok) return body || {};
    const detail = body && (body.detail || body.title || (body.errors && body.errors[0] && body.errors[0].message)) || "";
    const err = new Error(
      r.status === 401 ? "X rejected the key (X_BEARER_TOKEN). Make a new Bearer Token in the X Developer Console and save it again." :
      r.status === 402 || /credit/i.test(detail) ? "Out of X credits, or X's spending limit was reached. Add credits in the X Developer Console." :
      r.status === 403 ? "X refused access: " + (detail || "check the app's permissions in the X Developer Console.") :
      r.status === 429 ? "X says too many requests; trying again shortly." : `X error ${r.status}${detail ? ": " + detail : ""}`);
    err.status = r.status; throw err;
  },

  // Read profiles for accounts we don't know yet (or haven't refreshed for a week).
  async refreshProfiles(st) {
    const now = Date.now(), known = new Map(this.sql.exec("SELECT handle, updated FROM x_users").toArray().map(r => [r.handle.toLowerCase(), r.updated]));
    const missing = new Set((st.missing || []).map(h => h.toLowerCase()));
    const want = this.postsAccounts().filter(h => !missing.has(h.toLowerCase()) && !(now - (known.get(h.toLowerCase()) || 0) < PROFILE_MS));
    if (!want.length) return;
    const r = await this.xGet("/2/users/by", {usernames: want.join(","), "user.fields": "name,username,profile_image_url,verified"});
    for (const u of r.data || []) {
      this.sql.exec(`INSERT INTO x_users (id, handle, name, avatar, verified, updated) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET handle = excluded.handle, name = excluded.name, avatar = excluded.avatar, verified = excluded.verified, updated = excluded.updated`,
        String(u.id), String(u.username), String(u.name || u.username).slice(0, 60),
        /^https:\/\/pbs\.twimg\.com\//.test(u.profile_image_url || "") ? u.profile_image_url.replace("_normal.", "_bigger.") : "", u.verified ? 1 : 0, now);
    }
    st.monthUsers += (r.data || []).length;
    const notFound = (r.errors || []).map(e => String(e.value || "")).filter(Boolean);
    st.missing = [...new Set([...(st.missing || []).filter(h => this.postsAccounts().some(a => a.toLowerCase() === h.toLowerCase())), ...notFound])];
  },

  // Fetch new posts from X. Safe to call often: it runs at most every 15s and never past the daily cap.
  async fetchPosts(force = false) {
    if (!this.postsOn()) return {skipped: "off"};
    if (this.postsBusy) return this.postsBusy;
    const now = Date.now(), st0 = this.postsState();
    if (!force && now - (st0.lastRun || 0) < MIN_GAP) return {skipped: "recent"};
    if (!force && st0.pausedUntil && now < st0.pausedUntil) return {skipped: "paused"};
    this.postsBusy = (async () => {
      const st = this.postsState(), cap = this.setting("posts_cap", DEFAULT_CAP);
      st.lastRun = now;
      let added = 0;
      try {
        await this.refreshProfiles(st);
        const groups = queryGroups(this.postsAccounts()), sinces = {};
        for (const q of groups) {
          const left = cap - st.today;
          if (left < 10) { st.capped = true; break; }       // X's smallest page is 10 posts
          st.capped = false;
          const params = {query: q, max_results: String(Math.min(100, left)),
            "tweet.fields": "created_at,author_id,entities,note_tweet,attachments,referenced_tweets"};
          if (st.groups[q]) params.since_id = st.groups[q];
          else params.start_time = new Date(now - 3 * 3600000).toISOString().replace(/\.\d+Z$/, "Z");   // first run: the last 3 hours only
          const r = await this.xGet("/2/tweets/search/recent", params);
          const data = r.data || [];
          st.today += data.length; st.monthPosts += data.length;
          sinces[q] = (r.meta && r.meta.newest_id) || st.groups[q] || data.reduce((a, t) => newer(t.id, a) ? t.id : a, null);
          for (const t of data) {
            if (!t || !t.id || !t.author_id) continue;
            const long = t.note_tweet && t.note_tweet.text;
            const {segs, media} = segments(long || t.text || "", (long ? t.note_tweet.entities : t.entities) || {});
            const ref = (t.referenced_tweets || []).find(x => x.type === "quoted");
            const created = Date.parse(t.created_at) || now;
            const res = this.sql.exec(`INSERT OR IGNORE INTO posts (id, author, created, segs, media, quote, fetched) VALUES (?, ?, ?, ?, ?, ?, ?)`,
              String(t.id), String(t.author_id), created, JSON.stringify(segs), media + ((t.attachments && t.attachments.media_keys) ? 1 : 0) > 0 ? 1 : 0,
              ref ? String(ref.id) : null, now);
            added += res.rowsWritten ? 1 : 0;
          }
        }
        st.groups = Object.fromEntries(groups.map(q => [q, sinces[q] || st.groups[q]]).filter(([, v]) => v));
        st.lastOk = Date.now(); st.error = null; st.pausedUntil = 0;
      } catch (e) {
        st.error = e.message; st.errorAt = Date.now();
        st.pausedUntil = Date.now() + (e.status === 429 ? 60000 : e.status === 401 || e.status === 402 || e.status === 403 ? 15 * 60000 : 120000);
        console.error("posts", e.message);
      }
      this.sql.exec("DELETE FROM posts WHERE created < ?", now - KEEP_MS);
      this.sql.exec("DELETE FROM posts WHERE id NOT IN (SELECT id FROM posts ORDER BY created DESC LIMIT ?)", KEEP_ROWS);
      this.putSetting("posts_state", st);
      if (added) this.postsCache = null;
      return {added, today: st.today, error: st.error || undefined};
    })();
    try { return await this.postsBusy; } finally { this.postsBusy = null; }
  },

  // GET /api/posts?after=<id>: the newest posts (or only those newer than `after`), for the site to show.
  async postsFeed(after) {
    if (!this.postsOn()) return {ok: true, on: false, posts: []};
    this.postsViewer = Date.now();
    await this.keepPostsFresh();
    if (!this.postsCache) {
      const handles = new Set(this.postsAccounts().map(h => h.toLowerCase()));
      const users = new Map(this.sql.exec("SELECT * FROM x_users").toArray().filter(u => handles.has(u.handle.toLowerCase())).map(u => [u.id, u]));
      const rows = this.sql.exec("SELECT * FROM posts ORDER BY created DESC, length(id) DESC, id DESC LIMIT ?", FEED_SIZE * 2).toArray();
      this.postsCache = rows.filter(r => users.has(r.author)).slice(0, FEED_SIZE).map(r => {
        const u = users.get(r.author);
        return {id: r.id, at: r.created, author: {handle: u.handle, name: u.name, avatar: u.avatar, verified: !!u.verified},
                segs: JSON.parse(r.segs), media: !!r.media, quote: r.quote || undefined};
      });
    }
    const st = this.postsState();
    const posts = after && /^\d{1,25}$/.test(after) ? this.postsCache.filter(p => newer(p.id, after) && p.id !== after) : this.postsCache;
    return {ok: true, on: true, posts, updated: st.lastOk || 0};
  },

  // While someone is watching the feed, check X every 20s (Durable Object alarm) instead of once a minute.
  async keepPostsFresh() {
    if (this.postsAlarm && this.postsAlarm > Date.now() - 5000) return;
    const at = await this.ctx.storage.getAlarm();
    if (at) { this.postsAlarm = at; return; }
    const st = this.postsState();
    this.postsAlarm = Date.now() + (Date.now() - (st.lastRun || 0) > ALARM_MS ? 500 : ALARM_MS);
    await this.ctx.storage.setAlarm(this.postsAlarm);
  },
  async alarm() {
    this.postsAlarm = 0;
    try { await this.fetchPosts(); } catch (e) { console.error("posts alarm", e.message); }
    if (this.postsOn() && Date.now() - (this.postsViewer || 0) < VIEWER_MS) {
      this.postsAlarm = Date.now() + ALARM_MS;
      await this.ctx.storage.setAlarm(this.postsAlarm);
    }
  },

  // ---- admin
  postsStatus() {
    const st = this.postsState(), accounts = this.postsAccounts();
    const users = new Map(this.sql.exec("SELECT handle, name, avatar FROM x_users").toArray().map(u => [u.handle.toLowerCase(), u]));
    const missing = new Set((st.missing || []).map(h => h.toLowerCase()));
    return {
      ok: true, key: !!this.postsToken(), on: this.setting("posts_on", true) !== false, live: this.postsOn(),
      cap: this.setting("posts_cap", DEFAULT_CAP), today: st.today, capped: !!st.capped,
      month: st.month, month_posts: st.monthPosts, month_users: st.monthUsers,
      month_cost: Math.round((st.monthPosts * PRICE_POST + st.monthUsers * PRICE_USER) * 100) / 100,
      last_ok: st.lastOk || 0, error: st.error || null, error_at: st.errorAt || 0, stored: this.sql.exec("SELECT COUNT(*) AS n FROM posts").one().n,
      accounts: accounts.map(h => { const u = users.get(h.toLowerCase());
        return {handle: h, name: u ? u.name : null, status: missing.has(h.toLowerCase()) ? "not found" : u ? "ok" : "waiting"}; }),
    };
  },
  async adminPosts(body) {
    const messages = [];
    let cap;
    if (body.posts_cap !== undefined) {
      cap = Math.round(Number(body.posts_cap));
      if (!(cap >= 10 && cap <= 5000)) return {ok: false, status: 400, error: "The daily cap must be between 10 and 5,000 posts."};
    }
    let parsed;
    if (body.posts_accounts !== undefined) {
      parsed = parseAccounts(body.posts_accounts);
      if (parsed.error) return {ok: false, status: 400, error: parsed.error};
    }
    if (typeof body.posts_on === "boolean") {
      this.putSetting("posts_on", body.posts_on);
      messages.push(body.posts_on ? "Posts are on." : "Posts are off: nothing is read from X and the Posts tab is hidden.");
    }
    if (cap !== undefined) {
      this.putSetting("posts_cap", cap);
      messages.push(`Daily cap: ${cap} posts (at most about US$${(cap * PRICE_POST).toFixed(2)} a day).`);
    }
    if (parsed) {
      this.putSetting("posts_accounts", parsed.list);
      const st = this.postsState(); st.missing = []; st.pausedUntil = 0; this.putSetting("posts_state", st);
      this.postsCache = null;
      messages.push(`Following ${parsed.list.length} account${parsed.list.length === 1 ? "" : "s"}.`);
    }
    if (body.refresh) {
      const r = await this.fetchPosts(true);
      messages.push(r.error ? "Checked X: " + r.error : r.skipped === "off" ? "Posts are off or the X key isn't set." : `Checked X: ${r.added} new post${r.added === 1 ? "" : "s"}.`);
    }
    return {...this.postsStatus(), messages: messages.length ? messages : ["Nothing changed."]};
  },
};
