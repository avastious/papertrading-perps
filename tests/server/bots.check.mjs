// House bots. Run against a fresh local server started with BOTS on (the default) and
// --var ADMIN_EMAILS:owner@example.com (see README > Tests).
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
const cron = async n => { for (let i = 0; i < n; i++) { await fetch(`${API}/__scheduled?cron=*+*+*+*+*`); await sleep(350); } await sleep(1500); };
const board = async () => { await sleep(21000); return (await call('/api/leaderboard')).j; };   // past the board's 20 s cache

await cron(25);
let b = await board();
const bots = b.rows.filter(r => r.bot);
ok(bots.length === 20, '20 bots on the leaderboard', `(${bots.length})`);
ok(new Set(bots.map(r => r.name)).size === 20, 'bots have distinct names');
ok(bots.some(r => r.positions > 0), 'bots have opened positions', `(${bots.filter(r => r.positions).length} with positions)`);
ok(b.rows.every(r => r.bot === true || r.bot === undefined), 'only bots carry the bot flag');

const cato = bots.find(r => r.name === 'Cato');
const prof = (await call('/api/trader/' + cato.pid)).j;
ok(prof.ok && prof.bot === true && /Trend follower/.test(prof.strategy || ''), "a bot's profile says it's a bot and shows its strategy", prof.strategy);
ok(prof.private === false && Array.isArray(prof.trades), "bots' trades are public");

// nobody can sign in as a bot
const fake = await tok({ uid: 'bot:cato', name: 'Cato' });
ok((await call('/api/account', fake)).status === 401, 'a token for a bot user ID is refused');
ok((await call('/api/order', fake, { coin: 'BTC', side: 'buy', size: 100, unit: 'usd' })).status === 401, '...and cannot trade');

// people are unaffected and bots stay out of the owner's numbers
const run = Math.random().toString(36).slice(2, 7);
const pat = await tok({ uid: 'b-pat-' + run, name: 'Pat Person', email: 'pat@example.com', verified: '1' });
const r = await call('/api/order', pat, { coin: 'BTC', side: 'buy', size: 2000, unit: 'usd', leverage: 5 });
ok(r.status === 200 && r.j.state.positions.BTC, 'a person can still trade alongside the bots');
b = await board();
const me = b.rows.find(x => x.name === 'Pat P.');
ok(me && !me.bot, 'the person is on the board without a bot tag');
ok(!(b.milestones || []).some(m => bots.some(x => x.pid === m.pid)), 'bot badges never appear in the milestone feed');
const owner = await tok({ uid: 'b-owner', name: 'Owner', email: 'owner@example.com', verified: '1' });
const o = (await call('/api/admin/overview', owner)).j;
ok(o.ok && o.totals.bots === 20, 'admin counts bots separately', `(${o.totals && o.totals.bots})`);
ok(o.ok && o.users.filter(u => !u.bot).length === o.totals.traders, "admin's trader count leaves bots out");
const ren = await call('/api/admin/rename', owner, { uid: 'bot:cato', name: 'Not Cato' });
ok(ren.status === 400, 'bots keep their names');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
