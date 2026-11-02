// Builder-deployed markets (xyz:XYZ100, the Nasdaq 100) traded through the server.
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
await fetch(`${MOCK}/set`, { method: 'POST', body: JSON.stringify({ px: { 'xyz:XYZ100': 25000 } }) }); await sleep(3000);
const t = await tok({ uid: 'm-' + Math.random().toString(36).slice(2, 7), name: 'Nas Daq' });
let r = await call('/api/order', t, { coin: 'xyz:XYZ100', side: 'buy', size: 50000, unit: 'usd', leverage: 30 });
const p = r.j.state && r.j.state.positions['xyz:XYZ100'];
ok(r.status === 200 && p && p.size > 0, 'long XYZ100 at 30x through the server', JSON.stringify(r.j.messages || r.j.error));
ok(/Bought [\d.]+ XYZ100 at/.test((r.j.messages || [])[0] || ''), 'fill message says XYZ100, not xyz:XYZ100');
ok((await call('/api/order', t, { coin: 'XYZ100', side: 'buy', size: 100, unit: 'usd' })).status === 400, 'the bare ticker is not a market of its own');
await fetch(`${MOCK}/set`, { method: 'POST', body: JSON.stringify({ px: { 'xyz:XYZ100': 25500 } }) }); await sleep(3000);
r = await call('/api/account', t);
ok(r.j.state.positions['xyz:XYZ100'] && r.j.state.balance > 0, 'position held after a price move');
r = await call('/api/close', t, { coin: 'xyz:XYZ100' });
const last = r.j.state.trades[r.j.state.trades.length - 1];
ok(r.status === 200 && last.realized > 0, 'closed XYZ100 for a profit', `${last && last.realized.toFixed(2)}`);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
