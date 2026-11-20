// The owner's leverage switch (over Hyperliquid's caps). Run against a local server started with
// --var ADMIN_EMAILS:owner@example.com (see README > Tests). Leaves the switch on.
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
const owner = await tok({ uid: 's-owner', name: 'Owner', email: 'owner@example.com', verified: '1' });
const ann = await tok({ uid: 's-ann-' + Math.random().toString(36).slice(2, 7), name: 'Ann' });
await call('/api/admin/settings', owner, { over_cap: true });

let c = (await call('/api/config')).j;
ok(c.ok && c.over_cap === true && c.max_leverage === 1000, 'public config: over the cap, up to 1000x', JSON.stringify(c));
let r = await call('/api/order', ann, { coin: 'BTC', side: 'buy', size: 100, unit: 'usd', leverage: 500 });
ok(r.status === 200 && r.j.state.positions.BTC, 'a 500x BTC position opens while the switch is on', r.j.error);
ok(r.j.config && r.j.config.over_cap === true, 'trading responses carry the config');

ok((await call('/api/admin/settings', ann, { over_cap: false })).status === 403, 'only the owner can flip the switch');
r = await call('/api/admin/settings', owner, { over_cap: false });
ok(r.status === 200 && r.j.over_cap === false, 'owner turns it off', r.j.messages && r.j.messages[0]);
ok((await call('/api/config')).j.over_cap === false, 'public config says off');
ok((await call('/api/admin/overview', owner)).j.settings.over_cap === false, 'admin overview shows it off');

r = await call('/api/leverage', ann, { coin: 'ETH', leverage: 100 });
ok(r.status === 400 && /switched off/.test(r.j.error), 'leverage above the market cap refused', r.j.error);
ok((await call('/api/leverage', ann, { coin: 'ETH', leverage: 25 })).status === 200, "the market's own cap still allowed");
r = await call('/api/order', ann, { coin: 'BTC', side: 'buy', size: 100, unit: 'usd' });
ok(r.status === 400 && /Lower it/.test(r.j.error), 'adding to the 500x position is refused', r.j.error);
await fetch(`${API}/__scheduled?cron=*+*+*+*+*`); await sleep(1500);
r = await call('/api/account', ann);
ok(r.j.state.positions.BTC && r.j.state.leverage.BTC === 500, 'the open 500x position is kept (not liquidated by the switch)');
r = await call('/api/close', ann, { coin: 'BTC' });
ok(r.status === 200 && !r.j.state.positions.BTC, 'and it can still be closed');

r = await call('/api/admin/settings', owner, { over_cap: true });
ok(r.j.over_cap === true && (await call('/api/leverage', ann, { coin: 'ETH', leverage: 1000 })).status === 200, 'back on: 1000x allowed again');

// live trading (Hyperliquid testnet): off by default, owner-only, testnet only, builder address and fee checked
c = (await call('/api/config')).j;
ok(c.live === 'off' || c.live === 'testnet', 'config reports live trading', c.live);
await call('/api/admin/settings', owner, { live: 'off', builder: '', builder_fee: 50 });
ok((await call('/api/config')).j.live === 'off', 'live trading off');
ok((await call('/api/admin/settings', ann, { live: 'testnet' })).status === 403, 'only the owner can turn live trading on');
r = await call('/api/admin/settings', owner, { live: 'mainnet' });
ok(r.status === 400 && /testnet/.test(r.j.error), 'real-money mainnet cannot be switched on from admin', r.j.error);
r = await call('/api/admin/settings', owner, { live: 'testnet' });
ok(r.status === 200 && r.j.live === 'testnet', 'owner turns on live trading on testnet', r.j.messages && r.j.messages[0]);
r = await call('/api/admin/settings', owner, { builder: 'not-an-address' });
ok(r.status === 400 && /0x/.test(r.j.error), 'a bad builder address is refused', r.j.error);
r = await call('/api/admin/settings', owner, { builder_fee: 101 });
ok(r.status === 400 && /0\.1%/.test(r.j.error), "a fee above Hyperliquid's 0.1% cap is refused", r.j.error);
r = await call('/api/admin/settings', owner, { builder: '0x1111111111111111111111111111111111111111', builder_fee: 50 });
ok(r.status === 200 && r.j.builder === '0x1111111111111111111111111111111111111111' && r.j.builder_fee === 50, 'builder address and 0.05% fee saved', r.j.messages && r.j.messages.join(' '));
c = (await call('/api/config')).j;
ok(c.live === 'testnet' && c.builder === '0x1111111111111111111111111111111111111111' && c.builder_fee === 50, 'public config carries them for the site');
await call('/api/admin/settings', owner, { live: 'off' });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
