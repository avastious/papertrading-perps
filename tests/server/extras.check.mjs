// Alerts (price and liquidation, on the site and by email), following traders, journal notes, monthly seasons
// and the economic calendar. Needs a fresh server with email pointed at the stand-in and test hooks on:
//   npx wrangler dev --port 8788 --persist-to <empty dir> --test-scheduled --var HL_API_URL:http://127.0.0.1:8500 \
//     --var JWKS_URL:http://127.0.0.1:8500/jwks --var TEST_HOOKS:1 --var CAL_URL:http://127.0.0.1:8500/cal/week.json \
//     --var RESEND_API_KEY:re_test_key --var RESEND_API_URL:http://127.0.0.1:8500/resend \
//     --var TRUTH_API_URL:http://127.0.0.1:8500/ts --var TRUMP_FEED_URL:http://127.0.0.1:8500/ts/feed
//   API=http://127.0.0.1:8788 node tests/server/extras.check.mjs
const API = process.env.API || 'http://127.0.0.1:8787', MOCK = process.env.MOCK || 'http://127.0.0.1:8500';
let pass = 0, fail = 0;
const ok = (c, l, x = '') => { c ? pass++ : fail++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const R = Math.random().toString(36).slice(2, 7);
const tok = async q => (await (await fetch(`${MOCK}/token?${new URLSearchParams(q)}`)).json()).token;
async function call(path, token, body) {
  const h = { 'Content-Type': 'application/json' }; if (token) h.Authorization = 'Bearer ' + token;
  const r = await fetch(API + path, { method: body ? 'POST' : 'GET', headers: h, body: body && JSON.stringify(body) });
  return { status: r.status, j: await r.json() };
}
const mock = async (path, body) => (await fetch(MOCK + path, body ? { method: 'POST', body: JSON.stringify(body) } : {})).json();
const setPx = p => mock('/set', { px: p });
const cron = async () => { await fetch(`${API}/__scheduled?cron=*+*+*+*+*`).then(r => r.text()); await sleep(2500); };
let seen = {};
const newEvents = async (token, who) => { const r = await call(`/api/account?since=${seen[who] || 0}`, token); const ev = r.j.events || []; if (ev.length) seen[who] = ev[ev.length - 1].id; return ev; };

await setPx({ BTC: 77800, ETH: 2266.4, SOL: 95.5 });
// the calendar feed's events for this week (the server reads it on its first minute check, then hourly)
const inDays = (d, h = 13.5) => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10) + `T${String(Math.floor(h - 5)).padStart(2, '0')}:30:00-05:00`;
await mock('/cal/set', [
  { title: 'CPI m/m', country: 'USD', date: inDays(2), impact: 'High', forecast: '0.3%', previous: '0.2%' },
  { title: 'Non-Farm Employment Change', country: 'USD', date: inDays(3), impact: 'High', forecast: '180K', previous: '150K' },
  { title: 'German Ifo', country: 'EUR', date: inDays(1), impact: 'High', forecast: '', previous: '' },
  { title: 'Crude Oil Inventories', country: 'USD', date: inDays(1), impact: 'Low', forecast: '', previous: '' },
]);
const A = await tok({ uid: 'ex-a-' + R, name: 'Alice Ames', email: `alice-${R}@example.com`, verified: '1' });
const B = await tok({ uid: 'ex-b-' + R, name: 'Bob Bell', email: `bob-${R}@example.com`, verified: '1' });
const C = await tok({ uid: 'ex-c-' + R, name: 'Cara Cole' });
for (const [t, w] of [[A, 'a'], [B, 'b'], [C, 'c']]) await newEvents(t, w);
const pidA = (await call('/api/account', A)).j.profile.pid;

// ---------------- price alerts
let r = await call('/api/alerts', A, { action: 'add', kind: 'price', coin: 'BTC', value: 79000, email: true });
ok(r.status === 200 && r.j.alerts.length === 1 && r.j.alerts[0].dir === 'above' && r.j.alerts[0].email && /rising to 79,000/.test(r.j.messages[0]), 'price alert set; direction worked out from the current price', r.j.messages && r.j.messages[0]);
r = await call('/api/alerts', A, { action: 'add', kind: 'price', coin: 'BTC', value: 70000 });
ok(r.j.alerts.length === 2 && r.j.alerts[0].dir === 'below', 'a "falling to" alert too');
r = await call('/api/alerts', A, { action: 'add', kind: 'price', coin: 'NOPE', value: 5 });
ok(r.status === 400 && /Unknown market/.test(r.j.error), 'unknown market refused', r.j.error);
r = await call('/api/alerts', A, { action: 'add', kind: 'price', coin: 'BTC', value: -1 });
ok(r.status === 400, 'a price of zero or less is refused');
r = await call('/api/alerts', C, { action: 'add', kind: 'price', coin: 'BTC', value: 90000, email: true });
ok(r.status === 400 && /confirmed email/.test(r.j.error), 'email alerts need a confirmed email', r.j.error);
ok((await call('/api/alerts', B)).j.alerts.length === 0 && (await call('/api/alerts', A)).j.email_ok === true, "alerts are private; email alerts are available");
await setPx({ BTC: 79100 });
await cron();
let ev = await newEvents(A, 'a');
ok(ev.some(e => e.kind === 'alert' && /BTC is above 79,000, now 79,100/.test(e.msg)), 'the alert goes off on the next minute check', JSON.stringify(ev.map(e => e.msg)));
const mail = await mock(`/sent?to=${encodeURIComponent(`alice-${R}@example.com`)}`);
ok(/BTC rose to 79,000/.test(mail.subject || '') && /79,100/.test(mail.text || ''), 'and by email, as asked', mail.subject);
r = await call('/api/alerts', A);
ok(r.j.alerts.find(a => a.value === 79000).fired > 0 && !r.j.alerts.find(a => a.value === 70000).fired, 'it goes off once; the other alert still waits');
await cron();
ev = await newEvents(A, 'a');
ok(!ev.some(e => e.kind === 'alert'), "a fired alert doesn't go off again");
r = await call('/api/alerts', A, { action: 'clear' });
ok(r.j.alerts.length === 1, 'clearing removes alerts that went off');
r = await call('/api/alerts', A, { action: 'remove', id: r.j.alerts[0].id });
ok(r.j.alerts.length === 0, 'an alert can be removed');

// ---------------- liquidation warnings
await call('/api/order', A, { coin: 'BTC', side: 'buy', type: 'market', size: 450000, unit: 'usd', leverage: 50 });   // cross margin: needs a big position to be close
r = await call('/api/alerts', A, { action: 'add', kind: 'liq', value: 5 });
ok(r.status === 200 && r.j.alerts.some(a => a.kind === 'liq' && a.value === 5), 'liquidation warning set at 5%');
ok((await call('/api/alerts', A, { action: 'add', kind: 'liq', value: 90 })).status === 400, 'a silly distance is refused');
await cron();
ev = await newEvents(A, 'a');
ok(ev.some(e => e.kind === 'alert' && /long BTC is \d+(\.\d)?% from liquidation/.test(e.msg)), 'a 50x position close to liquidation triggers the warning', JSON.stringify(ev.map(e => e.msg)));
await cron();
ev = await newEvents(A, 'a');
ok(!ev.some(e => /from liquidation/.test(e.msg)), "it doesn't repeat every minute for the same position");
await call('/api/close', A, { coin: 'BTC' });

// ---------------- following
r = await call('/api/follow', A, { pid: pidA });
ok(r.status === 400 && /yourself/.test(r.j.error), "you can't follow yourself");
r = await call('/api/follow', B, { pid: pidA });
ok(r.status === 200 && r.j.following && r.j.followers === 1 && /told when they open a trade/.test(r.j.messages[0]), 'B follows A');
r = await call(`/api/trader/${pidA}`, B);
ok(r.j.following === true && r.j.followers === 1, "A's profile shows B follows, and the follower count");
ok((await call('/api/leaderboard', B)).j.following.includes(pidA), 'the leaderboard knows who B follows');
ok((await call('/api/following', B)).j.following[0].name === 'Alice A.', 'B can list who they follow');
await newEvents(B, 'b');
await call('/api/order', A, { coin: 'ETH', side: 'sell', type: 'market', size: 1000, unit: 'usd', leverage: 5 });
ev = await newEvents(B, 'b');
ok(ev.some(e => e.kind === 'follow' && /Alice A\. opened a short ETH at 5x/.test(e.msg) && e.msg.includes('#trader-' + pidA)), 'B is told when A opens a trade', JSON.stringify(ev.map(e => e.msg)));
await call('/api/order', A, { coin: 'ETH', side: 'sell', type: 'market', size: 500, unit: 'usd', leverage: 5 });
ev = await newEvents(B, 'b');
ok(!ev.some(e => e.kind === 'follow'), 'adding to the same position is not a new trade');
await call('/api/privacy', A, { private: true });
await call('/api/order', A, { coin: 'SOL', side: 'buy', type: 'market', size: 500, unit: 'usd', leverage: 3 });
ev = await newEvents(B, 'b');
ok(!ev.some(e => e.kind === 'follow'), 'nothing is shared once A hides their trades');
await call('/api/privacy', A, { private: false });
r = await call('/api/follow', B, { pid: pidA, on: false });
ok(r.j.following === false && r.j.followers === 0, 'unfollow');

// ---------------- journal notes
const key = `${Date.now()}:ETH`;
r = await call('/api/note', A, { key, text: 'Shorted the rejection at resistance. Stop above the high.' });
ok(r.status === 200, 'a note is saved');
ok((await call('/api/notes', A)).j.notes[key] === 'Shorted the rejection at resistance. Stop above the high.' && !Object.keys((await call('/api/notes', B)).j.notes).length, 'notes are private to their owner');
ok((await call('/api/note', A, { key: 'nonsense', text: 'x' })).status === 400, 'a bad key is refused');
ok((await call('/api/note', A, { key, text: 'x'.repeat(501) })).status === 400, 'a note over 500 characters is refused');
await call('/api/note', A, { key, text: '' });
ok(!((await call('/api/notes', A)).j.notes[key]), 'an empty note removes it');

// ---------------- seasons
r = await call('/api/season', B);
ok(r.status === 200 && /^[A-Z][a-z]+ \d{4}$/.test(r.j.season.name) && r.j.season.end > Date.now(), 'there is a season running', r.j.season && r.j.season.name);
await call('/api/close', A, { coin: 'ETH' }); await call('/api/close', A, { coin: 'SOL' });
await call('/api/order', A, { coin: 'BTC', side: 'buy', type: 'market', size: 30000, unit: 'usd', leverage: 10 });
await call('/api/order', B, { coin: 'BTC', side: 'sell', type: 'market', size: 30000, unit: 'usd', leverage: 10 });
await setPx({ BTC: 81000 });
await sleep(21000);                                     // the leaderboard is cached for 20s
r = await call('/api/season', C);
const rowA = r.j.rows.find(x => x.pid === pidA);
ok(rowA && rowA.return > 0 && r.j.rows.every(x => x.name !== 'Cara C.'), 'traders rank by their return this season; inactive accounts are left out', rowA && rowA.return.toFixed(4));
ok(r.j.me === null || r.j.me.rank === null, "C (no trades) isn't ranked");
await call('/api/reset', B, {});
r = await call('/api/season', C);
const rowB = r.j.rows.find(x => x.name === 'Bob B.');
ok(!rowB, "a reset doesn't count as a return: B starts the season again from $10,000", rowB && rowB.return);
const winnersBefore = r.j.rows.slice(0, 3).map(x => x.pid);
await newEvents(A, 'a');
r = await call('/api/test/season-end', null, {});
ok(r.status === 200 && r.j.season, 'the season ends (test hook)');
r = await call('/api/season', C);
ok(r.j.last && r.j.last.results.length && r.j.last.results.map(x => x.pid).join() === winnersBefore.join(), "last season's top 3 are shown", JSON.stringify(r.j.last && r.j.last.results.map(x => x.name)));
const placeA = winnersBefore.indexOf(pidA) + 1;
ev = await newEvents(A, 'a');
ok(placeA > 0 && ev.some(e => new RegExp(`You finished #${placeA} in the`).test(e.msg)), 'winners are told', JSON.stringify(ev.map(e => e.msg)));
r = await call(`/api/trader/${pidA}`, C);
ok(r.j.trophies.length === 1 && r.j.trophies[0].place === placeA, 'the trophy is on their profile');
await sleep(21000);
r = await call('/api/leaderboard', C);
ok(r.j.rows.find(x => x.pid === pidA).trophy === placeA, 'and on the leaderboard');
r = await call('/api/season', C);
const newA = r.j.rows.find(x => x.pid === pidA);   // still listed while holding a position
ok(r.j.season.name !== r.j.last.name && (!newA || Math.abs(newA.return) < 1e-6), 'the new season starts everyone at 0% again', newA && newA.return);

// ---------------- economic calendar
r = await call('/api/calendar');                        // the first visit starts a read in the background
for (let i = 0; i < 10 && !r.j.events.some(e => e.label === 'Inflation (CPI)'); i++) { await sleep(1000); r = await call('/api/calendar'); }
const labels = r.j.events.map(e => e.label);
ok(labels.includes('Inflation (CPI)') && labels.includes('Jobs report (NFP)'), 'US releases are listed with plain names', labels.join(', '));
ok(!labels.includes('German Ifo') && !labels.includes('Crude Oil Inventories'), 'other countries and low-impact releases are left out');
ok(r.j.events.find(e => e.label === 'Inflation (CPI)').forecast === '0.3%', 'with the forecast');
ok(labels.includes('Fed rate decision') || Date.now() > Date.parse('2026-12-10'), "the Fed's next decision is there from its published schedule");
const reads = (await mock('/cal/log')).reads;
await call('/api/calendar'); await cron();
ok((await mock('/cal/log')).reads === reads, 'the feed is read at most once an hour');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
