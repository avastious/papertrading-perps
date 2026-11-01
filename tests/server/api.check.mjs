// Run against a local server: see README > Tests.
const API = process.env.API || 'http://127.0.0.1:8787', MOCK = process.env.MOCK || 'http://127.0.0.1:8500';
let pass = 0, fail = 0;
const ok = (cond, label, extra = '') => { cond ? pass++ : fail++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${extra ? '  ' + extra : ''}`); };
const tok = async q => (await (await fetch(`${MOCK}/token?${new URLSearchParams(q)}`)).json()).token;
const setPx = (px, extra = {}) => fetch(`${MOCK}/set`, { method: 'POST', body: JSON.stringify({ px, ...extra }) });
async function call(path, { token, body, origin, raw } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  if (origin) headers.Origin = origin;
  const r = await fetch(API + path, { method: body !== undefined || raw ? 'POST' : 'GET', headers, body: raw ?? (body !== undefined ? JSON.stringify(body) : undefined) });
  return { status: r.status, j: await r.json().catch(() => null), h: r.headers };
}
const cron = () => fetch(`${API}/__scheduled?cron=*+*+*+*+*`).then(r => r.text());
const sleep = ms => new Promise(r => setTimeout(r, ms));

const billy = await tok({ uid: 'uid-billy', name: 'Billy Storrs', email: 'b@x.com' });
const sam = await tok({ uid: 'uid-sam', name: 'Sam', email: 's@x.com' });
await setPx({ BTC: 77800, ETH: 2266.4 });

// --- sign-in checks
ok((await call('/api/account')).status === 401, 'no token -> 401');
ok((await call('/api/account', { token: await tok({ uid: 'x', forge: '1' }) })).status === 401, 'token signed by another key -> 401');
ok((await call('/api/account', { token: await tok({ uid: 'x', aud: 'someone-else' }) })).status === 401, 'token for another Firebase project -> 401');
ok((await call('/api/account', { token: await tok({ uid: 'x', exp: -300 }) })).status === 401, 'expired token -> 401');
ok((await call('/api/account', { token: 'abc.def.ghi' })).status === 401, 'garbage token -> 401');

// --- account + trading
let r = await call('/api/account', { token: billy });
ok(r.status === 200 && r.j.state.balance === 10000, 'new account starts with $10,000', `name=${r.j.profile && r.j.profile.name}`);
r = await call('/api/order', { token: billy, body: { coin: 'BTC', side: 'buy', type: 'market', size: 20000, unit: 'usd', leverage: 20, tp: 80000, sl: 76000 } });
ok(r.status === 200 && r.j.state.positions.BTC && r.j.state.orders.length === 2, 'market long with TP/SL', r.j.messages.join(' | '));
r = await call('/api/order', { token: billy, body: { coin: 'BTC', side: 'buy', size: 1e9, unit: 'usd' } });
ok(r.status === 400 && /Insufficient/.test(r.j.error), 'oversized order rejected', r.j.error);
r = await call('/api/order', { token: billy, body: { coin: 'BTC', side: 'buy', size: -5, unit: 'usd' } });
ok(r.status === 400, 'negative size rejected', r.j.error);
r = await call('/api/leverage', { token: billy, body: { coin: 'BTC', leverage: 500 } });
ok(r.status === 400, 'leverage above market max rejected', r.j.error);
r = await call('/api/order', { token: sam, body: { coin: 'ETH', side: 'sell', type: 'limit', size: 2, unit: 'coin', price: 2300 } });
ok(r.status === 200 && r.j.state.orders.length === 1, 'sam rests a sell limit at 2300');

// --- the every-minute job fills things while nobody is looking
await setPx({ BTC: 75900, ETH: 2301 });
await cron(); await sleep(1500);
r = await call('/api/account', { token: billy, });
ok(!r.j.state.positions.BTC && r.j.events.some(e => /SL/.test(e.msg)), 'cron: stop-loss filled with page closed', r.j.events.map(e => e.msg).slice(-1)[0]);
ok(r.j.state.orders.length === 0, 'cron: take-profit removed with the position');
r = await call('/api/account', { token: sam });
ok(r.j.state.positions.ETH && r.j.state.positions.ETH.size === -2, 'cron: resting limit filled', r.j.events.map(e => e.msg).slice(-1)[0]);

// --- liquidation by cron
r = await call('/api/order', { token: billy, body: { coin: 'BTC', side: 'buy', size: 300000, unit: 'usd', leverage: 40 } });
const liqBefore = r.j.state.balance;
await setPx({ BTC: 75900 * 0.95 }); await cron(); await sleep(1500);
r = await call('/api/account', { token: billy });
ok(!r.j.state.positions.BTC && r.j.events.some(e => /LIQUIDATED/.test(e.msg)), 'cron: liquidation at maintenance margin');

// --- cheating attempts
r = await call('/api/reset', { token: billy, body: { balance: 1e9 } });
ok(r.status === 200 && r.j.state.balance === 10000, 'reset asking for $1B still gives $10,000');
r = await call('/api/order', { token: billy, body: { coin: 'BTC', side: 'buy', size: 1000, unit: 'usd', state: { balance: 1e9 } } });
ok(r.j.state.balance < 10000, 'sending a fake state is ignored', `balance=${r.j.state.balance.toFixed(2)}`);
r = await call('/api/order', { token: billy, raw: JSON.stringify({ coin: 'BTC', pad: 'x'.repeat(5000) }) });
ok(r.status === 413, 'oversized request body rejected');
r = await call('/api/account/../order', { token: billy, body: {} });
ok(r.status !== 200 || !r.j.state, 'odd paths do nothing', `status=${r.status}`);

// --- names
r = await call('/api/profile', { token: billy, body: { name: '<script>alert(1)</script>' } });
ok(r.status === 400, 'script in leaderboard name rejected');
r = await call('/api/profile', { token: billy, body: { name: 'Billy the Bull' } });
ok(r.status === 200, 'valid leaderboard name accepted');

// --- leaderboard
await setPx({ ETH: 2200 }); await sleep(3000);    // sam's short is in profit (past the price cache)
r = await call('/api/leaderboard');
ok(r.status === 200 && r.j.total === 2 && r.j.rows[0].name === 'Sam' && r.j.me === null, 'public leaderboard ranks by account value', JSON.stringify(r.j.rows.map(x => [x.rank, x.name, Math.round(x.equity)])));
ok(!JSON.stringify(r.j).includes('uid-'), 'leaderboard never exposes user ids or emails', '');
r = await call('/api/leaderboard', { token: billy });
ok(r.j.me && r.j.me.rank === 2 && r.j.me.name === 'Billy the Bull', 'signed-in leaderboard shows your rank');

// --- CORS
r = await call('/api/leaderboard', { origin: 'http://127.0.0.1:8400' });
ok(r.h.get('access-control-allow-origin') === 'http://127.0.0.1:8400', 'your site may call the server');
r = await call('/api/leaderboard', { origin: 'https://evil.example' });
ok(!r.h.get('access-control-allow-origin'), 'other websites may not');

// --- rate limit
let got429 = false;
for (let i = 0; i < 45 && !got429; i++) { const x = await call('/api/cancel', { token: sam, body: { target: 'all' } }); got429 = x.status === 429; }
ok(got429, 'order spam is rate limited');

// --- delete
r = await call('/api/delete', { token: sam, body: {} });
ok(r.status === 200, 'delete account');
r = await call('/api/leaderboard');
ok(r.j.total === 1 && !r.j.rows.some(x => x.name === 'Sam'), 'deleted account gone from leaderboard');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
