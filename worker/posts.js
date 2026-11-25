// Posts: live posts on X and Truth Social from market-moving people (Fed, Treasury, CEOs, investors, the President),
// shown on the trade screen. Truth Social is read further down (free, no key); X first.
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

// Truth Social: a Mastodon-style public API (no key, no cost). One request per account per check, asking only for
// statuses newer than the last one seen; at most every 30s. TRUTH_API_URL overrides https://truthsocial.com for tests;
// an optional TRUTH_TOKEN secret is sent if Truth Social ever starts asking for sign-in.
export const DEFAULT_TRUTH = ["realDonaldTrump"];
export const MAX_TRUTH = 20;
const TRUTH_GAP = 30000, TRUTH_HANDLE_RE = /^[A-Za-z0-9_]{1,30}$/;

export function setupPosts(sql) {
  sql.exec(`CREATE TABLE IF NOT EXISTS posts (
    id TEXT PRIMARY KEY, author TEXT NOT NULL, created INTEGER NOT NULL, segs TEXT NOT NULL, media INTEGER NOT NULL DEFAULT 0,
    quote TEXT, fetched INTEGER NOT NULL)`);
  sql.exec("CREATE INDEX IF NOT EXISTS posts_created ON posts(created)");
  sql.exec(`CREATE TABLE IF NOT EXISTS x_users (
    id TEXT PRIMARY KEY, handle TEXT NOT NULL, name TEXT NOT NULL, avatar TEXT NOT NULL DEFAULT '', verified INTEGER NOT NULL DEFAULT 0,
    updated INTEGER NOT NULL)`);
  sql.exec("CREATE INDEX IF NOT EXISTS x_users_handle ON x_users(handle)");
  // where each post and account comes from: 'x' or 'ts' (Truth Social; its ids are stored as "ts:<id>")
  for (const t of ["posts", "x_users"]) {
    try { sql.exec(`ALTER TABLE ${t} ADD COLUMN src TEXT NOT NULL DEFAULT 'x'`); } catch (e) { if (!/duplicate column/i.test(e.message)) throw e; }
  }
}

// "@Foo, bar\nbaz" -> ["Foo", "bar", "baz"]; returns {list} or {error}
export function parseAccounts(input, truth = false) {
  const raw = Array.isArray(input) ? input : String(input || "").split(/[\s,]+/);
  const out = [], seen = new Set(), max = truth ? MAX_TRUTH : MAX_ACCOUNTS;
  for (let h of raw) {
    h = String(h).trim().replace(truth ? /^https?:\/\/(www\.)?truthsocial\.com\/@?/i : /^https?:\/\/(www\.)?(x|twitter)\.com\//i, "")
      .replace(/^@/, "").replace(/[/?#].*$/, "");
    if (!h) continue;
    if (truth ? !TRUTH_HANDLE_RE.test(h) : !HANDLE_RE.test(h))
      return {error: truth ? `"${h}" isn't a Truth Social username (letters, numbers and _ only, up to 30).` : `"${h}" isn't an X username (letters, numbers and _ only, up to 15).`};
    if (!seen.has(h.toLowerCase())) { seen.add(h.toLowerCase()); out.push(h); }
  }
  if (out.length > max) return {error: `That's ${out.length} ${truth ? "Truth Social " : ""}accounts; the most is ${max}.`};
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

// Truth Social statuses come as HTML (Mastodon style). Turn them into the same safe pieces: text, {u, d} links
// (mentions and hashtags become links to Truth Social), {c} cashtags. Every other tag is dropped.
const entity = s => s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (m, e) => {
  const l = e.toLowerCase();
  if (l[0] === "#") { const n = l[1] === "x" ? parseInt(l.slice(2), 16) : parseInt(l.slice(1), 10); try { return String.fromCodePoint(n); } catch { return ""; } }
  return {amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " "}[l];
});
const stripTags = s => s.replace(/<[^>]*>/g, "");
export function htmlSegments(html) {
  const out = [], push = s => { if (!s) return; if (typeof out[out.length - 1] === "string") out[out.length - 1] += s; else out.push(s); };
  const text = t => {
    const re = /\$([A-Za-z][A-Za-z0-9]{0,9})(?![A-Za-z0-9])/g; let last = 0, m;
    while ((m = re.exec(t))) { push(t.slice(last, m.index)); out.push({c: m[1].toUpperCase()}); last = re.lastIndex; }
    push(t.slice(last));
  };
  const src = String(html || "").replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>\s*<p[^>]*>/gi, "\n\n").replace(/<\/?p[^>]*>/gi, "");
  const re = /<a\s[^>]*?href\s*=\s*"([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  let last = 0, m;
  while ((m = re.exec(src))) {
    text(entity(stripTags(src.slice(last, m.index))));
    const href = entity(m[1]).trim(), inner = m[2];
    let d = entity(stripTags(inner.replace(/<span[^>]*class="[^"]*\binvisible\b[^"]*"[^>]*>[\s\S]*?<\/span>/gi, ""))).trim();
    if (/class="[^"]*\bellipsis\b/.test(inner)) d += "…";
    if (/^https?:\/\//i.test(href) && d) out.push({u: href, d: d.length > 40 ? d.slice(0, 39) + "…" : d});
    else text(d);
    last = re.lastIndex;
  }
  text(entity(stripTags(src.slice(last))));
  if (typeof out[out.length - 1] === "string") out[out.length - 1] = out[out.length - 1].replace(/\s+$/, "");
  if (typeof out[0] === "string") out[0] = out[0].replace(/^\s+/, "");
  return out.filter(x => x !== "");
}

const day = t => new Date(t).toISOString().slice(0, 10), month = t => new Date(t).toISOString().slice(0, 7);
const newer = (a, b) => !b || a.length > b.length || (a.length === b.length && a > b);   // X ids are big numbers as text

export const postsMethods = {
  postsToken() { return this.env.X_BEARER_TOKEN || ""; },
  postsAccounts() { return this.setting("posts_accounts", DEFAULT_ACCOUNTS); },
  truthAccounts() { return this.setting("truth_accounts", DEFAULT_TRUTH); },
  // posts_on is the switch for the whole Posts tab; x_on and truth_on switch each source.
  postsMaster() { return this.setting("posts_on", true) !== false; },
  xOn() { return this.postsMaster() && !!this.postsToken() && this.setting("x_on", true) !== false && this.postsAccounts().length > 0; },
  truthOn() { return this.postsMaster() && this.setting("truth_on", true) !== false && this.truthAccounts().length > 0; },
  postsOn() { return this.xOn() || this.truthOn(); },
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
    const now = Date.now(), known = new Map(this.sql.exec("SELECT handle, updated FROM x_users WHERE src = 'x'").toArray().map(r => [r.handle.toLowerCase(), r.updated]));
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

  // Fetch new posts from X and Truth Social. Safe to call often: X at most every 15s and never past the daily cap,
  // Truth Social at most every 30s.
  async fetchPosts(force = false) {
    if (!this.postsOn()) return {skipped: "off"};
    if (this.postsBusy) return this.postsBusy;
    this.postsBusy = (async () => {
      const x = this.xOn() ? await this.fetchX(force) : {skipped: "off"};
      const ts = this.truthOn() ? await this.fetchTruth(force) : {skipped: "off"};
      const now = Date.now();
      this.sql.exec("DELETE FROM posts WHERE created < ?", now - KEEP_MS);
      this.sql.exec("DELETE FROM posts WHERE id NOT IN (SELECT id FROM posts ORDER BY created DESC LIMIT ?)", KEEP_ROWS);
      if (x.added || ts.added) this.postsCache = null;
      return {added: (x.added || 0) + (ts.added || 0), x, truth: ts, error: x.error || ts.error || undefined};
    })();
    try { return await this.postsBusy; } finally { this.postsBusy = null; }
  },

  async fetchX(force) {
    const now = Date.now(), st0 = this.postsState();
    if (!force && now - (st0.lastRun || 0) < MIN_GAP) return {skipped: "recent"};
    if (!force && st0.pausedUntil && now < st0.pausedUntil) return {skipped: "paused"};
    {
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
      this.putSetting("posts_state", st);
      return {added, today: st.today, error: st.error || undefined};
    }
  },

  // ---- Truth Social
  truthState() { return {since: {}, missing: [], ...this.setting("truth_state", {})}; },
  async truthGet(path, params = {}) {
    const base = (this.env.TRUTH_API_URL || "https://truthsocial.com").replace(/\/$/, "");
    const qs = new URLSearchParams(params).toString();
    const headers = {Accept: "application/json", "User-Agent": "Aureous/1.0 (+https://aureous.trade)"};
    if (this.env.TRUTH_TOKEN) headers.Authorization = "Bearer " + this.env.TRUTH_TOKEN;
    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 8000);
    let r;
    try { r = await fetch(`${base}${path}${qs ? "?" + qs : ""}`, {headers, signal: ctl.signal}); }
    catch (e) { throw new Error("Couldn't reach Truth Social" + (e.name === "AbortError" ? " (timed out)." : ".")); }
    finally { clearTimeout(timer); }
    let body = null; try { body = await r.json(); } catch {}
    if (r.ok && body) return body;
    const err = new Error(
      r.ok ? "Truth Social sent something that isn't a normal reply (it may be checking for bots)." :
      r.status === 401 ? "Truth Social wants a signed-in account to read posts. See README \"Posts from X and Truth Social\"." :
      r.status === 403 ? "Truth Social refused the request (it may be blocking automated reads). Trying again later." :
      r.status === 429 ? "Truth Social says too many requests; trying again shortly." :
      `Truth Social error ${r.status}${body && body.error ? ": " + body.error : ""}`);
    err.status = r.status; throw err;
  },
  async fetchTruth(force) {
    const now = Date.now(), st = this.truthState();
    if (!force && now - (st.lastRun || 0) < TRUTH_GAP) return {skipped: "recent"};
    if (!force && st.pausedUntil && now < st.pausedUntil) return {skipped: "paused"};
    st.lastRun = now;
    let added = 0;
    try {
      const handles = this.truthAccounts(), lower = new Set(handles.map(h => h.toLowerCase()));
      st.missing = st.missing.filter(h => lower.has(h.toLowerCase()));
      const known = new Map(this.sql.exec("SELECT id, handle, updated FROM x_users WHERE src = 'ts'").toArray().map(r => [r.handle.toLowerCase(), r]));
      for (const h of handles) {
        if (st.missing.some(m => m.toLowerCase() === h.toLowerCase())) continue;
        let u = known.get(h.toLowerCase());
        if (!u || now - u.updated > PROFILE_MS) {         // look the account up: its id, name and picture
          let a;
          try { a = await this.truthGet("/api/v1/accounts/lookup", {acct: h}); }
          catch (e) { if (e.status === 404) { st.missing.push(h); continue; } throw e; }
          if (!a || !a.id) { st.missing.push(h); continue; }
          const id = "ts:" + a.id, avatar = /^https:\/\//.test(a.avatar || "") && !/missing\.png/.test(a.avatar) ? String(a.avatar) : "";
          this.sql.exec(`INSERT INTO x_users (id, handle, name, avatar, verified, updated, src) VALUES (?, ?, ?, ?, ?, ?, 'ts')
            ON CONFLICT(id) DO UPDATE SET handle = excluded.handle, name = excluded.name, avatar = excluded.avatar, verified = excluded.verified, updated = excluded.updated`,
            id, String(a.username || h), stripTags(String(a.display_name || a.username || h)).slice(0, 60) || h, avatar, a.verified ? 1 : 0, now);
          u = {id, handle: String(a.username || h), updated: now};
        }
        const acct = u.id.slice(3), since = st.since[acct];
        const params = {exclude_replies: "true", exclude_reblogs: "true", limit: "20"};
        if (since) params.since_id = since;
        const list = await this.truthGet(`/api/v1/accounts/${encodeURIComponent(acct)}/statuses`, params);
        if (!Array.isArray(list)) throw new Error("Truth Social sent something that isn't a list of posts.");
        let top = since;
        for (const t of list) {
          if (!t || !t.id) continue;
          const tid = String(t.id);
          if (newer(tid, top)) top = tid;
          if (t.reblog || t.in_reply_to_id) continue;
          const created = Date.parse(t.created_at) || now;
          if (created < now - KEEP_MS) continue;
          const segs = htmlSegments(t.content || ""), media = (t.media_attachments || []).length > 0;
          if (!segs.length && !media) continue;
          const quote = t.quote_id || (t.quote && t.quote.id);
          const res = this.sql.exec(`INSERT OR IGNORE INTO posts (id, author, created, segs, media, quote, fetched, src) VALUES (?, ?, ?, ?, ?, ?, ?, 'ts')`,
            "ts:" + tid, u.id, created, JSON.stringify(segs), media ? 1 : 0, quote ? String(quote) : null, now);
          added += res.rowsWritten ? 1 : 0;
        }
        if (top) st.since[acct] = top;
      }
      st.lastOk = Date.now(); st.error = null; st.pausedUntil = 0;
    } catch (e) {
      st.error = e.message; st.errorAt = Date.now();
      st.pausedUntil = Date.now() + (e.status === 429 ? 5 * 60000 : e.status === 401 || e.status === 403 ? 15 * 60000 : 120000);
      console.error("truth", e.message);
    }
    this.putSetting("truth_state", st);
    return {added, error: st.error || undefined};
  },

  // GET /api/posts?after=<id>: the newest posts (or only those newer than `after`), for the site to show.
  async postsFeed(after) {
    if (!this.postsOn()) return {ok: true, on: false, posts: []};
    this.postsViewer = Date.now();
    await this.keepPostsFresh();
    if (!this.postsCache) {
      const follow = {x: this.xOn() ? new Set(this.postsAccounts().map(h => h.toLowerCase())) : new Set(),
                      ts: this.truthOn() ? new Set(this.truthAccounts().map(h => h.toLowerCase())) : new Set()};
      const users = new Map(this.sql.exec("SELECT * FROM x_users").toArray().filter(u => follow[u.src] && follow[u.src].has(u.handle.toLowerCase())).map(u => [u.id, u]));
      const rows = this.sql.exec("SELECT * FROM posts ORDER BY created DESC, length(id) DESC, id DESC LIMIT ?", FEED_SIZE * 3).toArray();
      this.postsCache = rows.filter(r => users.has(r.author)).slice(0, FEED_SIZE).map(r => {
        const u = users.get(r.author), ts = r.src === "ts", h = encodeURIComponent(u.handle);
        return {id: r.id, src: ts ? "ts" : "x", at: r.created, author: {handle: u.handle, name: u.name, avatar: u.avatar, verified: !!u.verified,
                  url: ts ? `https://truthsocial.com/@${h}` : `https://x.com/${h}`},
                url: ts ? `https://truthsocial.com/@${h}/posts/${r.id.slice(3)}` : `https://x.com/${h}/status/${r.id}`,
                segs: JSON.parse(r.segs), media: !!r.media, quote: r.quote || undefined};
      });
    }
    const st = this.postsState(), ts = this.truthState();
    let posts = this.postsCache;
    if (after) {
      const i = posts.findIndex(p => p.id === after);
      posts = i >= 0 ? posts.slice(0, i) : /^\d{1,25}$/.test(after) ? posts.filter(p => p.src === "x" && newer(p.id, after)) : posts;
    }
    return {ok: true, on: true, posts, updated: Math.max(this.xOn() ? st.lastOk || 0 : 0, this.truthOn() ? ts.lastOk || 0 : 0)};
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
    const users = new Map(this.sql.exec("SELECT handle, name, avatar FROM x_users WHERE src = 'x'").toArray().map(u => [u.handle.toLowerCase(), u]));
    const missing = new Set((st.missing || []).map(h => h.toLowerCase()));
    const ts = this.truthState(), tsUsers = new Map(this.sql.exec("SELECT handle, name FROM x_users WHERE src = 'ts'").toArray().map(u => [u.handle.toLowerCase(), u]));
    const tsMissing = new Set(ts.missing.map(h => h.toLowerCase()));
    return {
      ok: true, key: !!this.postsToken(), on: this.postsMaster(), live: this.postsOn(), x_on: this.setting("x_on", true) !== false, x_live: this.xOn(),
      truth: {on: this.setting("truth_on", true) !== false, live: this.truthOn(), last_ok: ts.lastOk || 0, error: ts.error || null, error_at: ts.errorAt || 0,
        stored: this.sql.exec("SELECT COUNT(*) AS n FROM posts WHERE src = 'ts'").one().n,
        accounts: this.truthAccounts().map(h => { const u = tsUsers.get(h.toLowerCase());
          return {handle: h, name: u ? u.name : null, status: tsMissing.has(h.toLowerCase()) ? "not found" : u ? "ok" : "waiting"}; })},
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
    let truthParsed;
    if (body.truth_accounts !== undefined) {
      truthParsed = parseAccounts(body.truth_accounts, true);
      if (truthParsed.error) return {ok: false, status: 400, error: truthParsed.error};
    }
    if (typeof body.posts_on === "boolean") {
      this.putSetting("posts_on", body.posts_on);
      messages.push(body.posts_on ? "Posts are on." : "Posts are off: nothing is read from X or Truth Social and the Posts tab is hidden.");
    }
    if (typeof body.x_on === "boolean") {
      this.putSetting("x_on", body.x_on);
      messages.push(body.x_on ? "X posts are on." : "X posts are off: nothing is read from X (no cost).");
    }
    if (typeof body.truth_on === "boolean") {
      this.putSetting("truth_on", body.truth_on);
      messages.push(body.truth_on ? "Truth Social posts are on." : "Truth Social posts are off.");
    }
    if (truthParsed) {
      this.putSetting("truth_accounts", truthParsed.list);
      const ts = this.truthState(); ts.missing = []; ts.pausedUntil = 0; this.putSetting("truth_state", ts);
      messages.push(`Following ${truthParsed.list.length} Truth Social account${truthParsed.list.length === 1 ? "" : "s"}.`);
    }
    this.postsCache = null;
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
      const say = (name, x) => x.skipped === "off" ? null : x.error ? `Checked ${name}: ${x.error}` : `Checked ${name}: ${x.added} new post${x.added === 1 ? "" : "s"}.`;
      if (r.skipped === "off") messages.push("Posts are off, or there's nothing to read (no X key and Truth Social off).");
      else messages.push(...[say("X", r.x), say("Truth Social", r.truth)].filter(Boolean));
    }
    return {...this.postsStatus(), messages: messages.length ? messages : ["Nothing changed."]};
  },
};
