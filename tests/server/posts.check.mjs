// Posts from X and Truth Social: the owner's account lists, reading only new posts, the daily cap, errors, and the public feed.
// Needs a fresh server started with the stand-in X:
//   npx wrangler dev --port 8788 --persist-to <empty dir> --test-scheduled --var HL_API_URL:http://127.0.0.1:8500 \
//     --var JWKS_URL:http://127.0.0.1:8500/jwks --var ADMIN_EMAILS:owner@example.com \
//     --var X_API_URL:http://127.0.0.1:8500/x --var X_BEARER_TOKEN:test-x-token --var TRUTH_API_URL:http://127.0.0.1:8500/ts
//   API=http://127.0.0.1:8788 node tests/server/posts.check.mjs
const API = process.env.API || 'http://127.0.0.1:8787', MOCK = process.env.MOCK || 'http://127.0.0.1:8500';
let pass = 0, fail = 0;
const ok = (c, l, x = '') => { c ? pass++ : fail++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const tok = async q => (await (await fetch(`${MOCK}/token?${new URLSearchParams(q)}`)).json()).token;
async function call(path, token, body) {
  const h = { 'Content-Type': 'application/json' }; if (token) h.Authorization = 'Bearer ' + token;
  const r = await fetch(API + path, { method: body ? 'POST' : 'GET', headers: h, body: body && JSON.stringify(body) });
  return { status: r.status, j: await r.json() };
}
const mock = async (path, body) => (await fetch(MOCK + path, body ? { method: 'POST', body: JSON.stringify(body) } : {})).json();
const post = (handle, text, extra = {}) => mock('/x/post', { handle, text, ...extra });
const searches = async () => (await mock('/x/log')).log.filter(l => l.path.endsWith('/search/recent'));

await mock('/x/reset'); await mock('/ts/reset');
const owner = await tok({ uid: 'posts-owner', name: 'Owner', email: 'owner@example.com', verified: '1' });
const user = await tok({ uid: 'posts-user', name: 'Someone' });

let r = await call('/api/admin/posts', owner);
ok(r.status === 200 && r.j.key && r.j.live && r.j.cap === 100 && r.j.accounts.length === 12, 'the X key is seen; on by default with 12 accounts and a cap of 100', `${r.j.accounts.length} accounts, cap ${r.j.cap}`);
r = await call('/api/admin/posts', user, { posts_on: false });
ok(r.status === 403, 'only the owner can change posts');
r = await call('/api/admin/posts', owner, { posts_accounts: 'elonmusk, bad handle!' });
ok(r.status === 400 && /isn't an X username/.test(r.j.error), 'a bad username is refused', r.j.error);
r = await call('/api/admin/posts', owner, { posts_cap: 3 });
ok(r.status === 400, 'a cap below 10 is refused');

// one post from before the first check's 3-hour window, one inside it
await post('federalreserve', 'Old statement from this morning', { at: Date.now() - 5 * 3600000 });
const fedText = 'Federal Reserve issues FOMC statement. Rates unchanged; watching $NVDA &amp; $spx closely https://t.co/abc123 https://t.co/pic999';
await post('federalreserve', fedText, { at: Date.now() - 3600000, media: true, entities: { urls: [
  { url: 'https://t.co/abc123', expanded_url: 'https://www.federalreserve.gov/newsevents/pressreleases/monetary20261124a.htm', display_url: 'federalreserve.gov/newsevents/pres…' },
  { url: 'https://t.co/pic999', expanded_url: 'https://x.com/federalreserve/status/1/photo/1', display_url: 'pic.x.com/pic999', media_key: '3_1' }] } });
r = await call('/api/admin/posts', owner, { posts_accounts: '@elonmusk\nhttps://x.com/federalreserve, NickTimiraos nosuchuser123', posts_cap: 30, refresh: true });
ok(r.status === 200 && r.j.accounts.map(a => a.handle).join() === 'elonmusk,federalreserve,NickTimiraos,nosuchuser123', 'accounts saved from @names, links and plain names', r.j.accounts.map(a => a.handle).join());
ok(/1 new post/.test(r.j.messages.join(' ')), 'first check reads only the last 3 hours', r.j.messages.join(' '));
ok(r.j.accounts.find(a => a.handle === 'nosuchuser123').status === 'not found' && r.j.accounts.find(a => a.handle === 'federalreserve').status === 'ok', 'unknown accounts are flagged');

r = await call('/api/posts');
let p = r.j.posts && r.j.posts[0];
ok(r.status === 200 && r.j.on && r.j.posts.length === 1, 'the feed is public (no sign-in)');
ok(p && p.author.name === 'Federal Reserve' && p.author.handle === 'federalreserve' && /^https:\/\/pbs\.twimg\.com\/.*_bigger\.jpg$/.test(p.author.avatar), 'posts carry the name, @handle and picture', p && p.author.avatar);
const segs = p ? p.segs : [];
ok(segs.some(s => s.c === 'NVDA') && segs.some(s => s.c === 'SPX'), 'cashtags are picked out', JSON.stringify(segs.filter(s => s.c)));
ok(segs.some(s => s.u && s.u.startsWith('https://www.federalreserve.gov/') && s.d.startsWith('federalreserve.gov')), 'links show their real address');
ok(p && p.media && !JSON.stringify(segs).includes('pic.x.com') && !JSON.stringify(segs).includes('t.co'), 'photo links become a Photo marker');
ok(segs.some(s => typeof s === 'string' && s.includes('& ')) && !JSON.stringify(segs).includes('&amp;'), 'X text escapes are undone');

r = await call('/api/account', user);
ok(r.j.config && r.j.config.posts === true, 'the site is told posts are on');

// live: watching the feed makes the server check every 20s
const before = (await searches()).length;
const first = p.id;
await post('elonmusk', 'Tesla AI day was epic. $TSLA');
let got = null;
for (let i = 0; i < 40 && !got; i++) { await sleep(1000); r = await call(`/api/posts?after=${first}`); if (r.j.posts.length) got = r.j.posts; }
ok(got && got.length === 1 && got[0].author.handle === 'elonmusk', 'a new post shows up while the feed is open', got ? `after ${(await searches()).length - before} check(s)` : 'never arrived');
const last = (await searches()).slice(-1)[0];
ok(last && last.q.since_id && !last.q.start_time && /-is:retweet -is:reply/.test(last.q.query), 'later checks ask only for newer posts, no reposts or replies', last && last.q.since_id);

// daily cap
let st = (await call('/api/admin/posts', owner)).j;
r = await call('/api/admin/posts', owner, { posts_cap: st.today + 9 });
for (let i = 0; i < 12; i++) await post('NickTimiraos', `Fed officials signal patience on cuts, part ${i + 1}`);
const n0 = (await searches()).length;
r = await call('/api/admin/posts', owner, { refresh: true });
ok(r.j.capped && (await searches()).length === n0, 'once fewer than 10 posts are left under the cap, X isn\'t asked', `today ${r.j.today} of ${r.j.cap}`);
r = await call('/api/admin/posts', owner, { posts_cap: 200, refresh: true });
ok(r.j.today === st.today + 12 && !r.j.capped, 'raising the cap reads them (the background check may get there first)', `today ${r.j.today}`);
const x = await mock('/x/log');
ok(Math.abs(r.j.month_cost - x.charged * 0.005) < 0.006, 'the cost estimate matches what X would charge', `$${r.j.month_cost}`);

// errors pause checks but keep the feed
await mock('/x/mode?status=402');
await post('elonmusk', 'Another one');
r = await call('/api/admin/posts', owner, { refresh: true });
ok(/credits/i.test(r.j.error || '') && /credits/i.test(r.j.messages.join(' ')), 'running out of X credits is reported plainly', r.j.error);
r = await call('/api/posts');
ok(r.j.posts.length === 14, 'posts already read stay on the site', `${r.j.posts.length} posts`);
await mock('/x/mode?status=0');
r = await call('/api/admin/posts', owner, { refresh: true });
ok(!r.j.error && /1 new post/.test(r.j.messages.join(' ')), 'and it picks up again once credits are back', r.j.messages.join(' '));

// changing the list hides posts from removed accounts; turning off hides everything
r = await call('/api/admin/posts', owner, { posts_accounts: 'federalreserve NickTimiraos' });
r = await call('/api/posts');
ok(r.j.posts.length && r.j.posts.every(p => p.author.handle !== 'elonmusk'), 'removing an account hides its posts', `${r.j.posts.length} left`);
r = await call('/api/admin/posts', owner, { posts_on: false });
r = await call('/api/posts');
ok(r.j.on === false && !r.j.posts.length && (await call('/api/account', user)).j.config.posts === false, 'turned off: no feed and no Posts tab');
const n1 = (await searches()).length;
await call('/api/admin/posts', owner, { refresh: true });
ok((await searches()).length === n1, 'turned off: nothing is read from X');
await call('/api/admin/posts', owner, { posts_on: true });

// ---------------- Truth Social (free, no key): on by default with realDonaldTrump
r = await call('/api/admin/posts', owner);
ok(r.j.truth && r.j.truth.on && r.j.truth.live && r.j.truth.accounts.map(a => a.handle).join() === 'realDonaldTrump', 'Truth Social is on by default, following realDonaldTrump', JSON.stringify(r.j.truth && r.j.truth.accounts));
r = await call('/api/admin/posts', owner, { truth_accounts: 'bad-name' });
ok(r.status === 400 && /Truth Social username/.test(r.j.error), 'a bad Truth Social username is refused');
r = await call('/api/admin/posts', user, { truth_on: false });
ok(r.status === 403, 'only the owner can change Truth Social');
const tpost = (handle, html, extra = {}) => mock('/ts/post', { handle, html, ...extra });
await tpost('realDonaldTrump', '<p>Too old to show</p>', { at: Date.now() - 4 * 86400000 });
await tpost('realDonaldTrump', '<p>The Fed should CUT RATES NOW! $SPY to the moon. <a href="https://truthsocial.com/@WhiteHouse" class="u-url mention">@<span>WhiteHouse</span></a></p>', { at: Date.now() - 2 * 3600000, media: true });
await tpost('realDonaldTrump', '<p>a reply</p>', { reply: true });
await tpost('realDonaldTrump', '<p>a repost</p>', { reblog: true });
r = await call('/api/admin/posts', owner, { truth_accounts: 'https://truthsocial.com/@realDonaldTrump, @WhiteHouse nosuchtruth', refresh: true });
ok(r.status === 200 && r.j.truth.accounts.map(a => a.handle).join() === 'realDonaldTrump,WhiteHouse,nosuchtruth', 'Truth Social accounts saved from links and @names');
ok(/Checked Truth Social: 1 new post\b/.test(r.j.messages.join(' ')), 'only the recent post is read (no replies, reposts or old posts)', r.j.messages.join(' '));
ok(r.j.truth.accounts.find(a => a.handle === 'nosuchtruth').status === 'not found' && r.j.truth.accounts[0].name === 'Donald J. Trump', 'unknown Truth Social accounts are flagged; names are read');
r = await call('/api/posts');
let tp = r.j.posts.find(p => p.src === 'ts');
ok(tp && tp.author.handle === 'realDonaldTrump' && tp.author.name === 'Donald J. Trump' && tp.media && /^https:\/\/truthsocial\.com\/@realDonaldTrump\/posts\/\d+$/.test(tp.url) && tp.author.url === 'https://truthsocial.com/@realDonaldTrump',
   'Truth Social posts are in the feed with links to Truth Social', tp && tp.url);
ok(tp && tp.segs.some(s => s.c === 'SPY') && tp.segs.some(s => s.u === 'https://truthsocial.com/@WhiteHouse' && s.d === '@WhiteHouse') && !JSON.stringify(tp.segs).includes('<'), 'Truth Social text: cashtags, mention links, no HTML', JSON.stringify(tp && tp.segs));
ok(r.j.posts.some(p => p.src === 'x' && /^https:\/\/x\.com\//.test(p.url)), 'X posts carry their x.com link too');
// live while the feed is open
await tpost('WhiteHouse', '<p>President signs executive order on crypto. $BTC</p>');
got = null;
const topId = r.j.posts[0].id;
for (let i = 0; i < 70 && !got; i++) { await sleep(1000); r = await call(`/api/posts?after=${encodeURIComponent(topId)}`); if (r.j.posts.length) got = r.j.posts; }
ok(got && got.length === 1 && got[0].src === 'ts' && got[0].author.handle === 'WhiteHouse', 'a new Truth Social post shows up while the feed is open', got ? '' : 'never arrived');
const tlog = (await mock('/ts/log')).log.filter(l => l.path.endsWith('/statuses'));
const trumpCalls = tlog.filter(l => l.path.includes('/107780257626128497/'));
ok(trumpCalls.length > 1 && trumpCalls.slice(-1)[0].q.since_id && tlog.every(l => l.q.exclude_replies === 'true' && l.q.exclude_reblogs === 'true'), 'later checks ask only for newer posts, no replies or reposts');
// errors keep the feed
await mock('/ts/mode?status=403');
r = await call('/api/admin/posts', owner, { refresh: true });
ok(/refused/i.test(r.j.truth.error || '') && /Checked Truth Social: .*refused/.test(r.j.messages.join(' ')), 'Truth Social refusing is reported plainly', r.j.truth.error);
r = await call('/api/posts');
ok(r.j.posts.filter(p => p.src === 'ts').length === 2, 'Truth Social posts already read stay on the site');
await mock('/ts/mode?status=0');
// switches: X off leaves Truth Social; Truth Social off hides its posts
r = await call('/api/admin/posts', owner, { x_on: false });
const nx = (await searches()).length;
await call('/api/admin/posts', owner, { refresh: true });
r = await call('/api/posts');
ok((await searches()).length === nx && r.j.on && r.j.posts.length === 2 && r.j.posts.every(p => p.src === 'ts'), 'X off: nothing read from X, Truth Social still shows', `${r.j.posts.length} posts`);
await call('/api/admin/posts', owner, { x_on: true, truth_on: false });
r = await call('/api/posts');
ok(r.j.posts.length && r.j.posts.every(p => p.src === 'x'), 'Truth Social off hides its posts');
await call('/api/admin/posts', owner, { truth_on: true });

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
