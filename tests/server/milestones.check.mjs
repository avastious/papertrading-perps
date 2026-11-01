// Run against a local server: see README > Tests.
const API = process.env.API || 'http://127.0.0.1:8787', MOCK = process.env.MOCK || 'http://127.0.0.1:8500';
let pass = 0, fail = 0;
const ok = (c, l, x = '') => { c ? pass++ : fail++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`); };
const tok = async q => (await (await fetch(`${MOCK}/token?${new URLSearchParams(q)}`)).json()).token;
const setPx = px => fetch(`${MOCK}/set`, { method: 'POST', body: JSON.stringify({ px }) });
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function call(path, { token, body } = {}) {
  const h = { 'Content-Type': 'application/json' }; if (token) h.Authorization = 'Bearer ' + token;
  const r = await fetch(API + path, { method: body !== undefined ? 'POST' : 'GET', headers: h, body: body !== undefined ? JSON.stringify(body) : undefined });
  return { status: r.status, j: await r.json() };
}
const cron = async () => { await sleep(2700); await fetch(`${API}/__scheduled?cron=*+*+*+*+*`); await sleep(800); };

await setPx({ BTC: 77800, ETH: 2266.4 }); await sleep(3000);   // let the server's 2.5 s price cache catch up
const max = await tok({ uid: 'm-max', name: 'Max Power' }), vic = await tok({ uid: 'm-vic', name: 'Vic Viewer' });
let r = await call('/api/account', { token: max });
ok(r.j.profile && /^[0-9a-f]{12}$/.test(r.j.profile.pid) && r.j.profile.badges.length === 0, 'new account has a public id and no badges', r.j.profile && r.j.profile.pid);
const pid = r.j.profile.pid;
await call('/api/account', { token: vic });
r = await call('/api/order', { token: max, body: { coin: 'BTC', side: 'buy', size: 350000, unit: 'usd', leverage: 40 } });
ok(r.status === 200, 'big leveraged long', r.j.messages && r.j.messages[0]);
await call('/api/order', { token: max, body: { coin: 'ETH', side: 'sell', type: 'limit', size: 1, unit: 'coin', price: 2600 } });

await setPx({ BTC: 77800 * 1.03 }); await cron();
r = await call('/api/account', { token: max });
ok(r.j.profile.badges.map(b => b.tier).join() === 'sestertius', '$20k reached -> Sestertius badge', `equity≈${Math.round(r.j.state.balance + 0)}`);
ok(r.j.events.some(e => e.kind === 'milestone' && /Sestertius/.test(e.msg)), 'milestone notification sent', r.j.events.filter(e => e.kind === 'milestone').map(e => e.msg)[0]);
ok(r.j.profile.spotlight_until > Date.now() + 6.9 * 864e5, 'spotlight runs for 7 days');

await setPx({ BTC: 77800 * 1.30 }); await cron();
r = await call('/api/account', { token: max });
ok(r.j.profile.badges.map(b => b.tier).join() === 'sestertius,denarius,aureus', 'jump past $50k and $100k awards both', r.j.profile.badges.map(b => b.tier).join());

r = await call('/api/leaderboard');
const row = r.j.rows.find(x => x.pid === pid);
ok(row && row.badge === 'aureus' && row.spotlight_until > 0, 'leaderboard shows top badge and spotlight');
ok(r.j.milestones.length === 3 && r.j.milestones[0].pid === pid, 'recent milestones listed', r.j.milestones.map(m => m.tier).join());
ok(!JSON.stringify(r.j).includes('m-max'), 'still no user ids on the leaderboard');

r = await call(`/api/trader/${pid}`);
ok(r.status === 200 && r.j.positions.length === 1 && r.j.positions[0].coin === 'BTC' && r.j.trades.length >= 1, 'anyone can see open positions and trades', `rank #${r.j.rank}, ${r.j.trades.length} trades`);
ok(r.j.self === false && !JSON.stringify(r.j).includes('m-max') && r.j.badges.length === 3, 'profile has badges, no private ids');
ok(!('orders' in r.j) && !('state' in r.j), 'resting orders and raw state are not exposed');

r = await call('/api/privacy', { token: max, body: { private: true } });
ok(r.status === 200 && r.j.profile.private === true, 'trader hides their trades');
r = await call(`/api/trader/${pid}`, { token: vic });
ok(r.j.private === true && !r.j.positions && !r.j.trades && r.j.badges.length === 3, 'others now see only the summary and badges');
r = await call(`/api/trader/${pid}`, { token: max });
ok(r.j.self && r.j.positions && r.j.positions.length === 1, 'the trader still sees their own');
await call('/api/privacy', { token: max, body: { private: false } });

r = await call('/api/trader/ffffffffffff'); ok(r.status === 404, 'unknown trader -> 404');
r = await call('/api/trader/../account'); ok(r.status !== 200, 'odd profile path rejected', `status=${r.status}`);

r = await call('/api/reset', { token: max, body: {} });
ok(r.j.state.balance === 10000 && r.j.profile.badges.length === 3 && r.j.profile.resets === 1, 'reset keeps earned badges and counts the reset');
await setPx({ BTC: 77800 }); await cron();
r = await call('/api/account', { token: max });
ok(r.j.profile.badges.length === 3 && !r.j.events.some(e => e.kind === 'milestone' && e.id > 0 && /Sestertius/.test(e.msg) && e.ts > Date.now() - 5000), 'badges are not awarded twice');

r = await call('/api/delete', { token: max, body: {} });
r = await call('/api/leaderboard');
ok(!r.j.milestones.some(m => m.pid === pid) && !r.j.rows.some(x => x.pid === pid), 'deleting removes milestones and profile');
r = await call(`/api/trader/${pid}`); ok(r.status === 404, 'deleted profile is gone');
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
