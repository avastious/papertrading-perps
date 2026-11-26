// Stand-ins for Hyperliquid and Google's token keys, used to test the trading server locally.
// Local stand-ins for Hyperliquid (POST /info) and Google's token keys (GET /jwks),
// plus helpers for tests: GET /token?uid=&name= mints a signed ID token; POST /set moves a price.
const http = require('http'), crypto = require('crypto');
const PROJECT = 'aureous-14551';
const px = { BTC: 77800, ETH: 2266.4, SOL: 95.5, HYPE: 87.92, kPEPE: 0.00499, 'xyz:XYZ100': 25012.5, 'xyz:ANT': 115.42, 'io:ANTH': 1952.3,
  'xyz:SP500': 6912.4, 'xyz:NVDA': 214.97, 'xyz:AAPL': 309.86, 'xyz:SPCX': 168.2, 'xyz:HYPE': 87.5, 'xyz:OLDCO': 10 };
const meta = { BTC: [5, 40], ETH: [4, 25], SOL: [2, 20], HYPE: [2, 10], kPEPE: [0, 10], 'xyz:XYZ100': [4, 30], 'xyz:ANT': [2, 10], 'io:ANTH': [3, 3],
  'xyz:SP500': [3, 50], 'xyz:NVDA': [3, 20], 'xyz:AAPL': [3, 20], 'xyz:SPCX': [2, 10], 'xyz:HYPE': [2, 5], 'xyz:OLDCO': [1, 5, true] };
let funding = [];   // {coin, fundingRate, time}
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'test-key-1', alg: 'RS256', use: 'sig' };
const b64u = b => Buffer.from(b).toString('base64url');
function token({ uid, name, email, verified, provider, aud = PROJECT, exp = 3600, key = privateKey, kid = 'test-key-1' }) {
  const now = Math.floor(Date.now() / 1000);
  const h = b64u(JSON.stringify({ alg: 'RS256', kid, typ: 'JWT' }));
  const p = b64u(JSON.stringify({ iss: `https://securetoken.google.com/${aud}`, aud, auth_time: now, user_id: uid, sub: uid, iat: now, exp: now + exp, name, email, email_verified: verified === '1' || !!(fbUsers.get(uid) || {}).emailVerified, ...(provider ? { firebase: { sign_in_provider: provider } } : {}) }));
  return `${h}.${p}.${b64u(crypto.sign('RSA-SHA256', Buffer.from(h + '.' + p), key))}`;
}
let rnd = 7; const rand = () => (rnd = (rnd * 16807) % 2147483647) / 2147483647;
const r = (x, d) => +x.toFixed(d);
function info(q) {
  if (q.type === 'metaAndAssetCtxs') {
    // builder groups ("dex") are listed only when asked for by name, like Hyperliquid
    const names = Object.keys(px).filter(n => q.dex ? n.startsWith(q.dex + ':') : !n.includes(':'));
    return [{ universe: names.map(n => ({ name: n, szDecimals: meta[n][0], maxLeverage: meta[n][1], ...(meta[n][2] ? { isDelisted: true } : {}) })) },
      names.map((n, i) => ({ markPx: String(r(px[n], 6)), midPx: String(r(px[n], 6)), oraclePx: String(r(px[n], 6)), funding: '0.0000125',
        openInterest: String(5e7 / px[n]), dayNtlVlm: String(1e9 / (i + 1)), prevDayPx: String(px[n]) }))];
  }
  if (q.type === 'l2Book') {
    const p = px[q.coin], d = p > 1000 ? 1 : p > 10 ? 2 : 6;
    const lv = (s, i) => ({ px: String(r(p * (1 + s * 0.0001 * i), d)), sz: String(2 + (i % 3)), n: 1 });
    return { coin: q.coin, levels: [[...Array(20)].map((_, i) => lv(-1, i + 1)), [...Array(20)].map((_, i) => lv(1, i + 1))] };
  }
  if (q.type === 'recentTrades') {
    const p = px[q.coin], d = p > 1000 ? 1 : p > 10 ? 2 : 6, now = Date.now();
    return [...Array(30)].map((_, i) => { const side = (i * 7 + Math.floor(now / 4000)) % 3 ? 'B' : 'A';
      return { coin: q.coin, side, px: String(r(p * (1 + (side === 'B' ? 1 : -1) * 0.00004 * (i % 4)), d)), sz: String(r((0.05 + ((i * 37) % 23) / 7) * 2000 / Math.max(p, 1) + 0.001, 4)), time: now - i * 1700 - 300, hash: '0x', tid: i }; });
  }
  if (q.type === 'candleSnapshot') {
    const { coin, interval, startTime, endTime } = q.req;
    const step = { '1m': 6e4, '5m': 3e5, '15m': 9e5, '1h': 36e5, '4h': 144e5, '1d': 864e5 }[interval];
    const out = []; let c = px[coin];
    for (let t = Math.floor(endTime / step) * step; t >= startTime && out.length < 5000; t -= step) {
      const o = c * (1 + (rand() - .5) * .012), h = Math.max(o, c) * 1.002, l = Math.min(o, c) * .998;
      out.push({ t, T: t + step - 1, o: String(o), h: String(h), l: String(l), c: String(c), v: String(100 + rand() * 900), i: interval, s: coin, n: 10 }); c = o;
    }
    return out.reverse();
  }
  if (q.type === 'fundingHistory') return funding.filter(f => f.coin === q.coin && f.time >= q.startTime && f.time <= (q.endTime || 1e18));
  return null;
}
// A small stand-in for Hyperliquid's testnet (live trading): /tn/info and /tn/exchange.
// It doesn't check signatures (tests check those against the official SDK); every request is logged at /tn/log.
const TN = { meta: [['BTC', 5, 40], ['ETH', 4, 25], ['SOL', 2, 20], ['HYPE', 2, 10]], user: null, agents: {}, builderFee: {}, accounts: {}, log: [], oid: 1 };
const tnMid = c => px[c] * 1.002;                                  // testnet prices differ a little from mainnet
const tnAcct = u => TN.accounts[u] || (TN.accounts[u] = { usdc: 0, pos: {}, lev: {}, orders: [], fills: [] });
function tnState(u) {
  const a = tnAcct(u); let upnl = 0, ntl = 0, used = 0;
  const assetPositions = Object.entries(a.pos).filter(([, p]) => p.szi).map(([coin, p]) => {
    const mid = tnMid(coin), val = Math.abs(p.szi) * mid, pnl = (mid - p.entry) * p.szi, m = val / p.lev;
    upnl += pnl; ntl += val; used += m;
    return { type: 'oneWay', position: { coin, szi: String(p.szi), entryPx: String(p.entry), positionValue: String(val), unrealizedPnl: String(pnl),
      returnOnEquity: String(pnl / (Math.abs(p.szi) * p.entry / p.lev)), liquidationPx: null, leverage: { type: 'cross', value: p.lev }, marginUsed: String(m),
      maxLeverage: TN.meta.find(x => x[0] === coin)[2], cumFunding: { allTime: '0', sinceOpen: '0', sinceChange: '0' } } };
  });
  const av = a.usdc + upnl;
  return { marginSummary: { accountValue: String(av), totalNtlPos: String(ntl), totalRawUsd: String(a.usdc), totalMarginUsed: String(used) },
    crossMarginSummary: { accountValue: String(av), totalNtlPos: String(ntl), totalRawUsd: String(a.usdc), totalMarginUsed: String(used) },
    crossMaintenanceMarginUsed: String(used / 2), withdrawable: String(Math.max(0, av - used)), assetPositions, time: Date.now() };
}
function tnInfo(q) {
  if (q.type === 'meta') return { universe: TN.meta.map(([name, szDecimals, maxLeverage]) => ({ name, szDecimals, maxLeverage })) };
  if (q.type === 'allMids') return Object.fromEntries(TN.meta.map(([c]) => [c, String(+tnMid(c).toPrecision(6))]));
  if (q.type === 'clearinghouseState') return tnState(q.user.toLowerCase());
  if (q.type === 'openOrders') return tnAcct(q.user.toLowerCase()).orders;
  if (q.type === 'userFills') return tnAcct(q.user.toLowerCase()).fills;
  if (q.type === 'maxBuilderFee') return TN.builderFee[q.user.toLowerCase() + q.builder.toLowerCase()] || 0;
  return null;
}
function tnFill(u, coin, isBuy, sz, pxl, builder) {
  const a = tnAcct(u), p = a.pos[coin] || (a.pos[coin] = { szi: 0, entry: 0, lev: a.lev[coin] || 20 });
  const d = isBuy ? sz : -sz, before = p.szi; let realized = 0;
  if (before && Math.sign(before) !== Math.sign(d)) { const closed = Math.min(Math.abs(before), sz); realized = (pxl - p.entry) * closed * Math.sign(before); }
  const after = +(before + d).toFixed(8);
  if (!before || Math.sign(before) === Math.sign(d)) p.entry = (p.entry * Math.abs(before) + pxl * sz) / Math.abs(after);
  else if (after && Math.sign(after) !== Math.sign(before)) p.entry = pxl;
  p.szi = after; p.lev = a.lev[coin] || p.lev;
  const fee = sz * pxl * 0.00045, bfee = builder ? sz * pxl * builder.f / 1e5 : 0;
  a.usdc += realized - fee - bfee;
  a.fills.unshift({ coin, px: String(pxl), sz: String(sz), side: isBuy ? 'B' : 'A', time: Date.now(), dir: (isBuy ? (before < 0 ? 'Close Short' : 'Open Long') : (before > 0 ? 'Close Long' : 'Open Short')),
    closedPnl: String(realized), fee: String(fee), builderFee: builder ? String(bfee) : undefined, oid: TN.oid, tid: TN.oid });
}
function tnExchange(b) {
  TN.log.push(b);
  const a = b.action, ok = (type, data) => ({ status: 'ok', response: data === undefined ? { type } : { type, data } });
  if (a.type === 'approveAgent') { TN.agents[a.agentAddress.toLowerCase()] = TN.user; return ok('default'); }
  if (a.type === 'approveBuilderFee') { TN.builderFee[TN.user + a.builder.toLowerCase()] = Math.round(parseFloat(a.maxFeeRate) * 1000); return ok('default'); }
  const u = Object.keys(TN.agents).length ? TN.user : null;     // one test user; it can't recover signers, so any approved agent acts for them
  if (!u) return { status: 'err', response: 'User or API Wallet 0x0000 does not exist.' };
  const acct = tnAcct(u);
  if (!acct.usdc) return { status: 'err', response: 'Must deposit before performing actions. User: ' + u };
  if (a.type === 'updateLeverage') { const coin = TN.meta[a.asset][0]; acct.lev[coin] = a.leverage; return ok('default'); }
  if (a.type === 'cancel') { const before = acct.orders.length; acct.orders = acct.orders.filter(o => !a.cancels.some(c => c.o === o.oid)); return ok('cancel', { statuses: [before > acct.orders.length ? 'success' : { error: 'Order was never placed, already canceled, or filled.' }] }); }
  if (a.type === 'order') {
    const statuses = a.orders.map(o => {
      const [coin, szDec] = TN.meta[o.a], sz = +o.s, lim = +o.p, mid = tnMid(coin), tif = o.t.limit.tif;
      if (sz * mid < 10) return { error: 'Order must have minimum value of $10.' };
      if (a.builder && (TN.builderFee[u + a.builder.b.toLowerCase()] || 0) < a.builder.f) return { error: 'Builder fee has not been approved.' };
      const crosses = o.b ? lim >= mid : lim <= mid;
      if (crosses && tif !== 'Alo') { tnFill(u, coin, o.b, sz, mid, a.builder); return { filled: { totalSz: o.s, avgPx: String(mid), oid: TN.oid++ } }; }
      if (tif === 'Ioc') return { error: 'Order could not immediately match against any resting orders.' };
      if (tif === 'Alo' && crosses) return { error: 'Post only order would have immediately matched.' };
      const oid = TN.oid++; acct.orders.push({ coin, side: o.b ? 'B' : 'A', limitPx: o.p, sz: o.s, oid, timestamp: Date.now(), origSz: o.s });
      return { resting: { oid } };
    });
    return ok('order', { statuses });
  }
  return { status: 'err', response: 'Unsupported in the stand-in: ' + a.type };
}
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'content-type': 'application/json' };
// Stand-ins for Google's OAuth token endpoint, Firebase's admin API (Identity Toolkit) and Resend (email).
const fbUsers = new Map();            // uid -> {uid, email, emailVerified, password}
const sentMail = [];                  // emails "sent" through Resend
// A stand-in for X's API (posts): GET /x/2/users/by and /x/2/tweets/search/recent, like X's v2 API.
// Tests add posts with POST /x/post {handle, text, entities?}, switch errors on with /x/mode?status=402,
// and read every request (and how many posts were "charged") at /x/log.
const X = { users: {}, posts: [], seq: 1900000000000000000n, mode: 0, log: [], charged: 0 };
const X_TOKEN = 'test-x-token';
['elonmusk', 'federalreserve', 'NickTimiraos', 'BillAckman', 'saylor', 'KobeissiLetter'].forEach((h, i) =>
  X.users[h.toLowerCase()] = { id: String(1000 + i), username: h, name: h === 'federalreserve' ? 'Federal Reserve' : h, profile_image_url: `https://pbs.twimg.com/profile_images/${i}/a_normal.jpg`, verified: true });
function xApi(u, headers) {
  X.log.push({ path: u.pathname, q: Object.fromEntries(u.searchParams), at: Date.now() });
  if (headers.authorization !== 'Bearer ' + X_TOKEN) return [401, { title: 'Unauthorized', status: 401, detail: 'Unauthorized' }];
  if (X.mode) return [X.mode, { title: X.mode === 402 ? 'CreditsDepleted' : 'Error', detail: X.mode === 402 ? 'Your enrolled account does not have any credits' : 'error' }];
  if (u.pathname === '/x/2/users/by') {
    const names = (u.searchParams.get('usernames') || '').split(',');
    const data = [], errors = [];
    for (const n of names) { const x = X.users[n.toLowerCase()]; if (x) data.push(x); else errors.push({ value: n, detail: `Could not find user with usernames: [${n}].`, title: 'Not Found Error' }); }
    X.charged += data.length * 2;   // users cost twice a post
    return [200, { data, ...(errors.length ? { errors } : {}) }];
  }
  if (u.pathname === '/x/2/tweets/search/recent') {
    const q = u.searchParams.get('query') || '', from = new Set([...q.matchAll(/from:(\w+)/g)].map(m => m[1].toLowerCase()));
    const since = u.searchParams.get('since_id'), start = u.searchParams.get('start_time'), max = +u.searchParams.get('max_results') || 10;
    if (max < 10 || max > 100) return [400, { title: 'Invalid Request', detail: 'max_results must be 10..100' }];
    if (q.length > 512) return [400, { title: 'Invalid Request', detail: 'query too long' }];
    let hits = X.posts.filter(p => from.has(p.handle.toLowerCase()) && (!since || BigInt(p.id) > BigInt(since)) && (!start || Date.parse(p.created_at) >= Date.parse(start)));
    hits = hits.sort((a, b) => (BigInt(b.id) > BigInt(a.id) ? 1 : -1)).slice(0, max);
    X.charged += hits.length;
    const data = hits.map(({ handle, ...t }) => ({ ...t, author_id: X.users[handle.toLowerCase()].id }));
    return [200, data.length ? { data, meta: { newest_id: data[0].id, oldest_id: data[data.length - 1].id, result_count: data.length } } : { meta: { result_count: 0 } }];
  }
  return [404, { title: 'Not Found' }];
}
// A stand-in for Truth Social's public API (Mastodon style): GET /ts/api/v1/accounts/lookup?acct= and
// /ts/api/v1/accounts/:id/statuses. Tests add statuses with POST /ts/post {handle, html, reply?, reblog?, media?, at?},
// switch errors on with /ts/mode?status=403, read requests at /ts/log, and clear with /ts/reset.
// GET /ts/feed stands in for trumpstruth.org's RSS feed of realDonaldTrump's posts (ETag / If-None-Match like the real one);
// /ts/feedmode?status=500 breaks it, /ts/remove?id= marks a post removed.
const TS = { users: { realdonaldtrump: { id: '107780257626128497', username: 'realDonaldTrump', display_name: 'Donald J. Trump', avatar: '', verified: true },
                      whitehouse: { id: '108000000000000001', username: 'WhiteHouse', display_name: 'The White House', avatar: '', verified: true } },
             posts: [], log: [], mode: 0, feedMode: 0, seq: 114000000000000000n };
function tsFeed(req) {
  TS.log.push({ path: '/ts/feed', inm: req.headers['if-none-match'] || null });
  if (TS.feedMode) return [TS.feedMode, 'error', {}];
  const xmlEsc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const items = TS.posts.filter(p => p.account.username === 'realDonaldTrump' && !p.in_reply_to_id).sort((x, y) => (BigInt(y.id) > BigInt(x.id) ? 1 : -1)).slice(0, 100).map((p, i) => `
    <item>
      <title><![CDATA[Post]]></title><link>https://www.trumpstruth.org/statuses/${40000 + i}</link>
      <description><![CDATA[${p.content}${p.media_attachments.length ? '<p><a href="https://truth-archive.example/a.jpg">View image</a></p>' : ''}${p.reblog ? '<p>Reposted <a href="https://www.trumpstruth.org/statuses/1">Someone</a></p><blockquote><p>theirs</p></blockquote>' : ''}]]></description>
      <dc:creator>Donald J. Trump</dc:creator><pubDate>${new Date(p.created_at).toUTCString()}</pubDate>
      <truth:originalUrl>https://truthsocial.com/@realDonaldTrump/${p.id}</truth:originalUrl><truth:originalId>${p.id}</truth:originalId>
      <archive:postType>${p.reblog ? 'repost' : 'original'}</archive:postType><archive:removed>${p.removed ? 'true' : 'false'}</archive:removed>
      ${p.media_attachments.length ? '<media:content url="https://truth-archive.example/a.jpg" medium="image"></media:content>' : ''}
    </item>`).join('');
  const body = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:truth="https://truthsocial.com/ns" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:media="http://search.yahoo.com/mrss/" xmlns:archive="https://www.trumpstruth.org/rss-extensions"><channel><title>${xmlEsc("Trump's Truth")}</title>${items}</channel></rss>`;
  const etag = '"' + crypto.createHash('sha1').update(body).digest('hex').slice(0, 16) + '"';
  if (req.headers['if-none-match'] === etag) return [304, '', { etag }];
  return [200, body, { etag, 'content-type': 'application/rss+xml' }];
}
function tsApi(u) {
  TS.log.push({ path: u.pathname, q: Object.fromEntries(u.searchParams) });
  if (TS.mode) return [TS.mode, { error: 'stand-in error ' + TS.mode }];
  if (u.pathname === '/ts/api/v1/accounts/lookup') {
    const a = TS.users[(u.searchParams.get('acct') || '').toLowerCase()];
    return a ? [200, a] : [404, { error: 'Record not found' }];
  }
  const m = /^\/ts\/api\/v1\/accounts\/(\d+)\/statuses$/.exec(u.pathname);
  if (m) {
    const a = Object.values(TS.users).find(x => x.id === m[1]); if (!a) return [404, { error: 'Record not found' }];
    const since = u.searchParams.get('since_id'), limit = +u.searchParams.get('limit') || 20;
    const noReplies = u.searchParams.get('exclude_replies') === 'true', noReblogs = u.searchParams.get('exclude_reblogs') === 'true';
    const list = TS.posts.filter(p => p.account.id === a.id && (!since || BigInt(p.id) > BigInt(since)) && !(noReplies && p.in_reply_to_id) && !(noReblogs && p.reblog))
      .sort((x, y) => (BigInt(y.id) > BigInt(x.id) ? 1 : -1)).slice(0, limit);
    return [200, list];
  }
  return [404, { error: 'Not found' }];
}
// A stand-in for the economic calendar feed (nfs.faireconomy.media/ff_calendar_thisweek.json): GET /cal/week.json.
// Tests replace the week's events with POST /cal/set [{title, country, date, impact, forecast, previous}, ...]; /cal/log counts reads.
const CAL = { events: [], reads: 0 };
http.createServer((req, res) => {
  let body = ''; req.on('data', c => body += c); req.on('end', () => {
    const u = new URL(req.url, 'http://x');
    if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
    const send = (o, s = 200) => { res.writeHead(s, cors); res.end(JSON.stringify(o)); };
    if (u.pathname === '/info') return send(info(JSON.parse(body)));
    if (u.pathname.startsWith('/x/2/')) { const [st, o] = xApi(u, req.headers); return send(o, st); }
    if (u.pathname === '/x/post') {
      const q = JSON.parse(body || '{}'); X.seq += 1000n;
      if (q.newUser) X.users[q.handle.toLowerCase()] = { id: String(2000 + Object.keys(X.users).length), username: q.handle, name: q.handle, profile_image_url: '', verified: false };
      const t = { id: String(X.seq), handle: q.handle, text: q.text, created_at: new Date(q.at || Date.now()).toISOString(), ...(q.entities ? { entities: q.entities } : {}),
        ...(q.media ? { attachments: { media_keys: ['3_1'] } } : {}), ...(q.reply ? { in_reply_to_user_id: '1' } : {}) };
      X.posts.push(t); return send({ ok: true, id: t.id });
    }
    if (u.pathname === '/x/mode') { X.mode = +u.searchParams.get('status') || 0; return send({ ok: true }); }
    if (u.pathname === '/x/log') return send({ log: X.log, charged: X.charged, posts: X.posts.length });
    if (u.pathname === '/x/reset') { X.posts = []; X.log = []; X.charged = 0; X.mode = 0; return send({ ok: true }); }
    if (u.pathname === '/ts/feed') { const [st, b, h] = tsFeed(req); res.writeHead(st, { ...cors, ...h }); return res.end(st === 304 ? '' : b); }
    if (u.pathname === '/ts/feedmode') { TS.feedMode = +u.searchParams.get('status') || 0; return send({ ok: true }); }
    if (u.pathname === '/ts/remove') { const p = TS.posts.find(x => x.id === u.searchParams.get('id')); if (p) p.removed = true; return send({ ok: !!p }); }
    if (u.pathname.startsWith('/ts/api/')) { const [st, o] = tsApi(u); return send(o, st); }
    if (u.pathname === '/ts/post') {
      const q = JSON.parse(body || '{}'); TS.seq += 1000n;
      const a = TS.users[q.handle.toLowerCase()];
      const t = { id: String(TS.seq), created_at: new Date(q.at || Date.now()).toISOString(), content: q.html, account: a, url: `https://truthsocial.com/@${a.username}/${TS.seq}`,
        in_reply_to_id: q.reply ? '1' : null, reblog: q.reblog ? { id: '2' } : null, media_attachments: q.media ? [{ id: '9', type: 'image' }] : [], quote_id: null };
      TS.posts.push(t); return send({ ok: true, id: t.id });
    }
    if (u.pathname === '/ts/mode') { TS.mode = +u.searchParams.get('status') || 0; return send({ ok: true }); }
    if (u.pathname === '/ts/log') return send({ log: TS.log });
    if (u.pathname === '/ts/reset') { TS.posts = []; TS.log = []; TS.mode = 0; TS.feedMode = 0; return send({ ok: true }); }
    if (u.pathname === '/cal/week.json') { CAL.reads++; return send(CAL.events); }
    if (u.pathname === '/cal/set') { CAL.events = JSON.parse(body || '[]'); return send({ ok: true }); }
    if (u.pathname === '/cal/log') return send({ reads: CAL.reads });
    if (u.pathname === '/tn/info') return send(tnInfo(JSON.parse(body)));
    if (u.pathname === '/tn/exchange') return send(tnExchange(JSON.parse(body)));
    if (u.pathname === '/tn/fund') { TN.user = u.searchParams.get('user').toLowerCase(); tnAcct(TN.user).usdc += +(u.searchParams.get('amount') || 1000); return send({ ok: true }); }
    if (u.pathname === '/tn/log') return send({ log: TN.log, agents: TN.agents, builderFee: TN.builderFee, accounts: TN.accounts });
    if (u.pathname === '/jwks') { res.writeHead(200, { ...cors, 'cache-control': 'public, max-age=60' }); return res.end(JSON.stringify({ keys: [jwk] })); }
    if (u.pathname === '/token') {
      const q = Object.fromEntries(u.searchParams);
      if (q.forge === '1') { const { privateKey: other } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }); return send({ token: token({ ...q, key: other }) }); }
      return send({ token: token({ uid: q.uid, name: q.name, email: q.email, verified: q.verified, provider: q.provider, aud: q.aud || PROJECT, exp: q.exp ? +q.exp : 3600 }) });
    }
    if (u.pathname === '/google/token') return send({ access_token: 'test-access-token', expires_in: 3600, token_type: 'Bearer' });
    const idm = /^\/identity\/projects\/[^/]+\/accounts:(lookup|update)$/.exec(u.pathname);
    if (idm) {
      if (req.headers.authorization !== 'Bearer test-access-token') return send({ error: { message: 'UNAUTHENTICATED' } }, 401);
      const q = JSON.parse(body || '{}');
      if (idm[1] === 'lookup') {
        const found = [...fbUsers.values()].filter(x => (q.email || []).includes(x.email));
        return send(found.length ? { users: found.map(x => ({ localId: x.uid, email: x.email, emailVerified: !!x.emailVerified, providerUserInfo: x.password ? [{ providerId: 'password' }] : [{ providerId: 'google.com' }] })) } : {});
      }
      const x = fbUsers.get(q.localId); if (!x) return send({ error: { message: 'USER_NOT_FOUND' } }, 400);
      if (q.password) x.password = q.password; if (q.emailVerified !== undefined) x.emailVerified = q.emailVerified;
      return send({ localId: x.uid });
    }
    if (u.pathname === '/fbuser') { const q = Object.fromEntries(u.searchParams); fbUsers.set(q.uid, { uid: q.uid, email: q.email, emailVerified: q.verified === '1', password: q.password || null }); return send({ ok: true }); }
    if (u.pathname === '/fbuser/get') return send(fbUsers.get(u.searchParams.get('uid')) || {});
    if (u.pathname === '/resend/emails') {
      if (!/^Bearer re_test/.test(req.headers.authorization || '')) return send({ message: 'bad key' }, 401);
      const m = JSON.parse(body); sentMail.push({ ...m, at: Date.now() }); return send({ id: 'em_' + sentMail.length });
    }
    if (u.pathname === '/sent') { const to = u.searchParams.get('to'); return send(sentMail.filter(m => !to || (m.to || []).includes(to)).slice(-1)[0] || {}); }
    if (u.pathname === '/set') { const q = JSON.parse(body); if (q.px) Object.assign(px, q.px); if (q.funding) funding = q.funding; return send({ ok: true, px }); }
    send({ error: 'not found' }, 404);
  });
}).listen(8500, '127.0.0.1', () => console.log('mock on 8500'));
