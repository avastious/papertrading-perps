// Stand-ins for Hyperliquid and Google's token keys, used to test the trading server locally.
// Local stand-ins for Hyperliquid (POST /info) and Google's token keys (GET /jwks),
// plus helpers for tests: GET /token?uid=&name= mints a signed ID token; POST /set moves a price.
const http = require('http'), crypto = require('crypto');
const PROJECT = 'aureous-14551';
const px = { BTC: 77800, ETH: 2266.4, SOL: 95.5, HYPE: 87.92, kPEPE: 0.00499 };
const meta = { BTC: [5, 40], ETH: [4, 25], SOL: [2, 20], HYPE: [2, 10], kPEPE: [0, 10] };
let funding = [];   // {coin, fundingRate, time}
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'test-key-1', alg: 'RS256', use: 'sig' };
const b64u = b => Buffer.from(b).toString('base64url');
function token({ uid, name, email, aud = PROJECT, exp = 3600, key = privateKey, kid = 'test-key-1' }) {
  const now = Math.floor(Date.now() / 1000);
  const h = b64u(JSON.stringify({ alg: 'RS256', kid, typ: 'JWT' }));
  const p = b64u(JSON.stringify({ iss: `https://securetoken.google.com/${aud}`, aud, auth_time: now, user_id: uid, sub: uid, iat: now, exp: now + exp, name, email }));
  return `${h}.${p}.${b64u(crypto.sign('RSA-SHA256', Buffer.from(h + '.' + p), key))}`;
}
let rnd = 7; const rand = () => (rnd = (rnd * 16807) % 2147483647) / 2147483647;
const r = (x, d) => +x.toFixed(d);
function info(q) {
  if (q.type === 'metaAndAssetCtxs') {
    const names = Object.keys(px);
    return [{ universe: names.map(n => ({ name: n, szDecimals: meta[n][0], maxLeverage: meta[n][1] })) },
      names.map((n, i) => ({ markPx: String(r(px[n], 6)), midPx: String(r(px[n], 6)), oraclePx: String(r(px[n], 6)), funding: '0.0000125',
        openInterest: String(5e7 / px[n]), dayNtlVlm: String(1e9 / (i + 1)), prevDayPx: String(px[n]) }))];
  }
  if (q.type === 'l2Book') {
    const p = px[q.coin], d = p > 1000 ? 1 : p > 10 ? 2 : 6;
    const lv = (s, i) => ({ px: String(r(p * (1 + s * 0.0001 * i), d)), sz: String(2 + (i % 3)), n: 1 });
    return { coin: q.coin, levels: [[...Array(20)].map((_, i) => lv(-1, i + 1)), [...Array(20)].map((_, i) => lv(1, i + 1))] };
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
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'content-type': 'application/json' };
http.createServer((req, res) => {
  let body = ''; req.on('data', c => body += c); req.on('end', () => {
    const u = new URL(req.url, 'http://x');
    if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
    const send = (o, s = 200) => { res.writeHead(s, cors); res.end(JSON.stringify(o)); };
    if (u.pathname === '/info') return send(info(JSON.parse(body)));
    if (u.pathname === '/jwks') { res.writeHead(200, { ...cors, 'cache-control': 'public, max-age=60' }); return res.end(JSON.stringify({ keys: [jwk] })); }
    if (u.pathname === '/token') {
      const q = Object.fromEntries(u.searchParams);
      if (q.forge === '1') { const { privateKey: other } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }); return send({ token: token({ ...q, key: other }) }); }
      return send({ token: token({ uid: q.uid, name: q.name, email: q.email, aud: q.aud || PROJECT, exp: q.exp ? +q.exp : 3600 }) });
    }
    if (u.pathname === '/set') { const q = JSON.parse(body); if (q.px) Object.assign(px, q.px); if (q.funding) funding = q.funding; return send({ ok: true, px }); }
    send({ error: 'not found' }, 404);
  });
}).listen(8500, '127.0.0.1', () => console.log('mock on 8500'));
