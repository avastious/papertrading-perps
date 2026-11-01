// Owner-only admin API. Run against a local server started with --var ADMIN_EMAILS:owner@example.com (see README > Tests).
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
await fetch(`${MOCK}/set`, { method: 'POST', body: JSON.stringify({ px: { BTC: 77800, ETH: 2266.4 } }) }); await sleep(3000);

const run = Math.random().toString(36).slice(2, 7);         // fresh traders each run
const owner = await tok({ uid: 'a-owner', name: 'Owner Person', email: 'owner@example.com', verified: '1' });
const ownerUnverified = await tok({ uid: 'a-owner2', name: 'Fake Owner', email: 'owner@example.com', verified: '0' });
const PAT = 'a-pat-' + run, LEE = 'a-lee-' + run;
const before = (await call('/api/admin/overview', owner)).j.totals;
await sleep(16000);                                          // past the dashboard's 15 s cache
const pat = await tok({ uid: PAT, name: 'Pat Trader', email: 'pat@example.com', verified: '1' });
const lee = await tok({ uid: LEE, name: 'Lee Quiet', email: 'lee@example.com', verified: '1' });

await call('/api/account', pat);
await call('/api/order', pat, { coin: 'BTC', side: 'buy', size: 5000, unit: 'usd', leverage: 10 });
await call('/api/order', pat, { coin: 'ETH', side: 'buy', type: 'limit', size: 1, unit: 'coin', price: 2000 });
await call('/api/account', lee);

ok((await call('/api/admin/overview')).status === 401, 'no sign-in -> 401');
ok((await call('/api/admin/overview', pat)).status === 403, 'ordinary trader -> 403');
ok((await call('/api/admin/overview', ownerUnverified)).status === 403, "owner's email without verification -> 403");
let r = await call('/api/admin/overview', owner);
ok(r.status === 200, 'site owner -> 200');
const t = r.j.totals;
const d = k => t[k] - before[k];
ok(d('traders') === 2 && t.online >= 2 && d('new_today') === 2, 'counts traders, online now and new today', JSON.stringify({ traders: t.traders, online: t.online, new: t.new_today }));
ok(d('trades_today') === 1 && d('open_positions') === 1 && Math.round(d('volume_today')) > 4900, 'counts trades, open positions and volume today', `+${d('trades_today')} trades, +$${Math.round(d('volume_today'))}`);
ok(r.j.markets.some(m => m.coin === 'BTC'), 'popular markets', JSON.stringify(r.j.markets.map(m => m.coin)));
ok(r.j.signups.length === 30 && r.j.signups[29].signups >= 2, '30-day sign-up chart includes today');
const patRow = r.j.users.find(u => u.uid === PAT);
ok(patRow && patRow.name === 'Pat T.' && patRow.online && patRow.orders === 1 && patRow.positions === 1, 'user list has id, online flag, positions and orders');
r = await call('/api/admin/user/' + PAT, owner);
ok(r.status === 200 && r.j.orders.length === 1 && r.j.positions.length === 1 && r.j.trades.length === 1 && r.j.uid === PAT, 'user detail includes orders, positions and trades');
ok((await call('/api/admin/user/' + PAT, pat)).status === 403, 'traders cannot open admin user details');
r = await call('/api/admin/rename', owner, { uid: PAT, name: '<b>x</b>' }); ok(r.status === 400, 'rename rejects unsafe names');
r = await call('/api/admin/rename', owner, { uid: PAT, name: 'Pat Renamed' }); ok(r.status === 200, 'rename works');
r = await call('/api/admin/reset', owner, { uid: PAT });
const acct = await call('/api/account', pat);
ok(r.status === 200 && acct.j.state.balance === 10000 && acct.j.profile.resets === 1 && acct.j.profile.name === 'Pat Renamed', 'reset puts the trader back to $10,000 and counts it');
ok(acct.j.events.some(e => /reset to \$10,000 by Aureous/.test(e.msg)), 'trader is told their account was reset');
ok((await call('/api/admin/reset', pat, { uid: LEE })).status === 403, 'traders cannot reset others');
r = await call('/api/admin/remove', owner, { uid: LEE }); ok(r.status === 200, 'remove works');
r = await call('/api/admin/overview', owner);
ok(r.j.totals.traders === before.traders + 1 && !r.j.users.some(u => u.uid === LEE), 'removed trader is gone');
ok((await call('/api/admin/user/nobody', owner)).status === 404, 'unknown trader -> 404');
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
