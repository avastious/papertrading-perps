// The new trader tools in a real browser (Playwright): distance to liquidation and the warning before a risky trade,
// alerts, the economic calendar, news on the chart, the journal, the monthly season, following a trader, and the
// replay page. Run scripts/dev.sh first (site on 8400, server on 8787 with the stand-ins), then:
//   node tests/server/extras.browser.cjs [screenshot dir]
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const MOCK = 'http://127.0.0.1:8500', API = 'http://127.0.0.1:8787', SITE = 'http://127.0.0.1:8400/';
const OUT = process.argv[2] || '';
let pass = 0, fail = 0;
const ok = (c, l, x = '') => { c ? pass++ : fail++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const j = async (path, body) => (await fetch(path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {})).json();
const R = Math.random().toString(36).slice(2, 6);
const backend = (uid, name, email) => `window.AUREOUS_TEST_BACKEND = (() => { let cb = null, user = ${uid ? `{uid:'${uid}', name:'${name}', email:'${email}', emailVerified:true, provider:'google.com'}` : 'null'};
  return { onUser(f){ cb = f; setTimeout(() => f(user), 30); },
    async token(){ const r = await fetch('${MOCK}/token?uid=' + user.uid + '&name=' + encodeURIComponent(user.name) + '&email=' + encodeURIComponent(user.email) + '&verified=1'); return (await r.json()).token; },
    async signInWith(){}, async signInEmail(){}, async signUpEmail(){}, async resetPassword(){}, async signOut(){ user = null; cb && cb(null); }, async reauth(){}, async deleteUser(){} }; })();`;
async function newContext(browser, opts) {
  const ctx = await browser.newContext(opts);
  await ctx.route('https://api.hyperliquid.xyz/**', async route => {
    const hdr = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'content-type': 'application/json' };
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: hdr });
    const rr = await fetch(MOCK + '/info', { method: 'POST', body: route.request().postData() });
    route.fulfill({ status: 200, headers: hdr, body: await rr.text() });
  });
  return ctx;
}
const tokenFor = async (uid, name, email) => (await j(`${MOCK}/token?uid=${uid}&name=${encodeURIComponent(name)}&email=${encodeURIComponent(email)}&verified=1`)).token;
const as = token => (path, body) => fetch(API + path, { method: body ? 'POST' : 'GET', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) }).then(r => r.json());

(async () => {
  await j(MOCK + '/set', { px: { BTC: 77800, ETH: 2266.4 } });
  const inDays = (d, hhmm = '08:30') => new Date(Date.now() + d * 864e5).toISOString().slice(0, 10) + `T${hhmm}:00-05:00`;
  await j(MOCK + '/cal/set', [
    { title: 'CPI m/m', country: 'USD', date: inDays(2), impact: 'High', forecast: '0.3%', previous: '0.2%' },
    { title: 'Unemployment Claims', country: 'USD', date: inDays(1), impact: 'Medium', forecast: '220K', previous: '215K' },
    { title: 'Prelim GDP q/q', country: 'USD', date: new Date(Date.now() - 2 * 3600e3).toISOString(), impact: 'High', forecast: '3.5%', previous: '3.4%' },
  ]);
  await j(MOCK + '/ts/post', { handle: 'realDonaldTrump', html: `<p>Interest rates must come down NOW! TS-${R}</p>`, at: Date.now() - 50 * 60e3 });
  const U = { uid: 'xb-u-' + R, name: 'Uma Ulm', email: `uma-${R}@example.com` }, V = { uid: 'xb-v-' + R, name: 'Vic Vance', email: `vic-${R}@example.com` };
  const u = as(await tokenFor(U.uid, U.name, U.email)), v = as(await tokenFor(V.uid, V.name, V.email));
  await u('/api/account'); const pidV = (await v('/api/account')).profile.pid;
  await v('/api/order', { coin: 'ETH', side: 'buy', type: 'market', size: 2000, unit: 'usd', leverage: 5 });
  await u('/api/order', { coin: 'BTC', side: 'buy', type: 'market', size: 400000, unit: 'usd', leverage: 50 });   // close to liquidation
  await u('/api/close', { coin: 'BTC' }); await u('/api/order', { coin: 'BTC', side: 'buy', type: 'market', size: 420000, unit: 'usd', leverage: 50 });
  await fetch(API + '/api/test/calendar', { method: 'POST' });   // read the calendar stand-in now (test hook)

  const browser = await chromium.launch();
  let ctx = await newContext(browser, { viewport: { width: 1440, height: 900 }, colorScheme: 'dark' });
  await ctx.addInitScript(backend(U.uid, U.name, U.email));
  await ctx.addInitScript(() => { try { localStorage.setItem('aureous.coin', JSON.stringify('BTC')); localStorage.setItem('aureous.askedNotify', 'true'); } catch {} });
  let page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(SITE, { waitUntil: 'networkidle' });
  await page.waitForSelector('#bview .liqd', { timeout: 20000 }).catch(() => {});

  // ---------------- 1. distance to liquidation
  const liqTxt = await page.textContent('#bview .liqd').catch(() => '');
  ok(/^\d+(\.\d)?% away$/.test(liqTxt) && await page.$('#bview .liqd.danger'), 'positions show how far liquidation is, in red when under 3%', liqTxt);
  await page.click('[data-side=sell]').catch(() => {});      // a short against the long: reduces it, no warning
  await page.click('[data-side=buy]');
  await page.fill('#size', '9000'); await page.click('#levChips [data-lev="50"]');
  await sleep(300);
  const sliq = await page.textContent('#sLiq');
  ok(/\d.*% away/.test(sliq), 'the order form shows where the new trade would be liquidated', sliq);
  await page.click('#submit');
  await page.waitForSelector('#confirmDlg[open]', { timeout: 3000 }).catch(() => {});
  ok(await page.isVisible('#cfWarn') && /Close to liquidation/.test(await page.textContent('#cfWarn')) && (await page.textContent('#cfOk')) === 'Place it anyway' && await page.isHidden('#cfNoAskWrap'),
     'a trade under 3% from liquidation asks first, even with confirmations off');
  if (OUT) await page.locator('#confirmDlg').screenshot({ path: OUT + '/risky.png' });
  await page.click('#confirmDlg button[value=cancel]');
  await page.fill('#size', '');

  // ---------------- 2. alerts
  ok(await page.isVisible('#alertsBtn') && await page.isVisible('#alertHere'), 'alert buttons: bell in the top bar, Alert on the chart');
  await page.click('#alertHere');
  await page.waitForSelector('#alertsDlg[open]');
  ok((await page.textContent('#alCoin')) === 'BTC' && /now 77,800/.test(await page.textContent('#alNow')), 'the alert window opens on the current market and price');
  await page.click('#alChips [data-move="0.05"]');
  ok(+(await page.inputValue('#alPx')) > 81000, '+5% fills in the price', await page.inputValue('#alPx'));
  await page.click('#alAdd');
  await page.waitForSelector('#alList .al-item', { timeout: 5000 }).catch(() => {});
  ok(/BTC rises to/.test(await page.textContent('#alList')) && /Alert set/.test(await page.textContent('#alMsg')), 'adding an alert lists it as waiting');
  await page.check('#alLiqOn');
  await page.waitForFunction(() => /within 5%/.test(document.querySelector('#alMsg').textContent), null, { timeout: 5000 }).catch(() => {});
  ok(/within 5% of its liquidation/.test(await page.textContent('#alMsg')), 'the liquidation warning can be switched on');
  if (OUT) await page.locator('#alertsDlg').screenshot({ path: OUT + '/alerts.png' });
  await page.click('#alClose');
  ok((await page.textContent('#alertsBadge')) === '1', 'the bell shows how many price alerts are waiting');

  // ---------------- 4. calendar
  await page.waitForSelector('#calChip:not([hidden])', { timeout: 10000 }).catch(() => {});
  const chip = await page.textContent('#calChip').catch(() => '');
  ok(/(Inflation \(CPI\)|Fed rate decision|GDP).* (in|ago)/.test(chip), 'the price bar counts down to the next big release', chip.replace(/\s+/g, ' '));
  await page.click('#calChip');
  const cal = await page.textContent('#calList');
  ok(/Inflation \(CPI\)/.test(cal) && /Forecast 0\.3%/.test(cal) && /Jobless claims/.test(cal), 'the calendar lists the week, in plain names with forecasts');
  if (OUT) await page.locator('#calDlg').screenshot({ path: OUT + '/calendar.png' });
  await page.click('#calClose');

  // ---------------- 3. news on the chart
  await page.click('#bookTabs [data-bk=posts]');           // the Posts tab checks for new posts every 15s (others every minute)
  await page.waitForFunction(() => S.newsByBar && S.newsByBar.size >= 2, null, { timeout: 40000 }).catch(() => {});
  await page.click('#bookTabs [data-bk=book]');
  const marks = await page.evaluate(() => [...(S.newsByBar || new Map()).values()].flat().map(n => n.who));
  ok(marks.some(w => /Trump/.test(w)) && marks.some(w => /GDP/.test(w)), 'Trump\'s post and the GDP release are marked on the chart', marks.join(', '));
  const tipShown = await page.evaluate(() => { const [t] = [...S.newsByBar.keys()]; newsTip({ time: t, point: { x: 300, y: 50 } }); return !document.querySelector('#newsTip').hidden && document.querySelector('#newsTip').textContent; });
  ok(tipShown && tipShown.length > 5, 'hovering a marker shows what was said', String(tipShown).slice(0, 80));
  await page.click('#newsBtn');
  ok(await page.evaluate(() => S.newsByBar.size === 0) && (await page.getAttribute('#newsBtn', 'aria-pressed')) === 'false', 'the News button hides them');
  await page.click('#newsBtn');
  if (OUT) await page.locator('.chartbox').screenshot({ path: OUT + '/chart-news.png' });

  // ---------------- 8. journal
  await u('/api/close', { coin: 'BTC' });
  await sleep(2500);
  await page.click('#btabs [data-t=journal]');
  await page.waitForSelector('.journal', { timeout: 5000 }).catch(() => {});
  ok(/Closed trades/.test(await page.textContent('#bview')) && /Win rate/.test(await page.textContent('#bview')), 'the Journal tab shows the trading record');
  await page.click('#bview [data-jr-edit]');
  await page.fill('#bview [data-jr-text]', 'Too much leverage. Next time 10x with a stop.');
  await sleep(2000);                                     // the page redraws every 1.5s: typing must survive it
  ok((await page.inputValue('#bview [data-jr-text]')) === 'Too much leverage. Next time 10x with a stop.', 'a note being typed survives the page refreshing');
  await page.click('#bview [data-jr-save]');
  await page.waitForSelector('#bview .jr-note', { timeout: 5000 }).catch(() => {});
  ok(/Too much leverage/.test(await page.textContent('#bview .jr-note').catch(() => '')), 'the note is saved on the trade');
  ok(Object.values((await u('/api/notes')).notes).includes('Too much leverage. Next time 10x with a stop.'), 'and kept on the server');
  if (OUT) await page.locator('.bottom').screenshot({ path: OUT + '/journal.png' });

  // ---------------- 5. season, 7. following
  await page.click('#btabs [data-t=board]');
  await page.click('#bview [data-view=season]');
  await page.waitForSelector('#bview .board-head', { timeout: 8000 }).catch(() => {});
  ok(/[A-Z][a-z]+ \d{4} season/.test(await page.textContent('#bview')), 'the leaderboard has a This month view with the season');
  if (OUT) await page.locator('.bottom').screenshot({ path: OUT + '/season.png' });
  await page.evaluate(pid => openTrader(pid), pidV);
  await page.waitForSelector('#trFollow:not([hidden])', { timeout: 8000 }).catch(() => {});
  ok(/0 followers/.test(await page.textContent('#trSub')), 'profiles show their follower count', await page.textContent('#trSub'));
  await page.click('#trFollow');
  await page.waitForFunction(() => /Following/.test(document.querySelector('#trFollow').textContent), null, { timeout: 5000 }).catch(() => {});
  ok(/Following/.test(await page.textContent('#trFollow')) && /1 follower\b/.test(await page.textContent('#trSub')), 'Follow works from the profile');
  await page.click('#trClose');
  await page.click('#bview [data-view=following]');
  await page.waitForSelector('#bview [data-unfollow]', { timeout: 8000 }).catch(() => {});
  ok(/Vic V\./.test(await page.textContent('#bview')), 'the Following view lists them');
  await v('/api/order', { coin: 'BTC', side: 'sell', type: 'market', size: 1000, unit: 'usd', leverage: 3 });
  const told = await page.waitForSelector('.toast.follow', { timeout: 30000 }).then(e => e.textContent()).catch(() => null);
  ok(told && /Vic V\. opened a short BTC at 3x/.test(told) && !/#trader-/.test(told), 'a pop-up says when they open a trade', told);
  if (told) { await page.click('.toast.follow'); await page.waitForSelector('#traderDlg[open]', { timeout: 3000 }).catch(() => {}); ok(await page.isVisible('#traderDlg'), 'clicking it opens their profile'); await page.click('#trClose'); }
  ok(!errors.length, 'no page errors', errors.join(' | '));
  await ctx.close();

  // ---------------- phone
  ctx = await newContext(browser, { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark' });
  await ctx.addInitScript(backend(U.uid, U.name, U.email));
  page = await ctx.newPage();
  await page.goto(SITE, { waitUntil: 'networkidle' });
  await sleep(1500);
  ok(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)), 'nothing sticks out sideways on a phone');
  if (OUT) await page.screenshot({ path: OUT + '/phone.png' });
  await ctx.close();

  // ---------------- 9. replay
  ctx = await newContext(browser, { viewport: { width: 1440, height: 900 }, colorScheme: 'dark' });
  page = await ctx.newPage();
  const rerrors = []; page.on('pageerror', e => rerrors.push(e.message));
  const old = new Date(Date.now() - 60 * 864e5), day = `${old.getFullYear()}-${String(old.getMonth() + 1).padStart(2, '0')}-${String(old.getDate()).padStart(2, '0')}`;
  await page.goto(SITE + `replay.html?coin=BTC&day=${day}`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !document.querySelector('#play').disabled, null, { timeout: 15000 }).catch(() => {});
  ok(/1-hour candles/.test(await page.textContent('#log')), 'a day two months ago loads (with 1-hour candles, all Hyperliquid keeps that far back)');
  await page.click('#step'); await page.click('#step');
  await page.fill('#margin', '2000'); await page.selectOption('#lev', '10');
  await page.click('[data-side=buy]');
  await sleep(300);
  ok(/Long 10x/.test(await page.textContent('#acct')) && /Bought/.test(await page.textContent('#log')), 'a long opens at the replay price');
  await page.click('#step'); await page.click('#step');
  await page.click('#close');
  await sleep(300);
  ok(/Sold/.test(await page.textContent('#log')) && /Closed trades\s*1/.test(await page.textContent('#acct')), 'and closes with its profit or loss');
  await page.selectOption('#speed', '30'); await page.click('#play');
  await page.waitForSelector('#result:not([hidden])', { timeout: 20000 }).catch(() => {});
  ok(/Day over/.test(await page.textContent('#result').catch(() => '')), 'playing to the end shows the result');
  if (OUT) await page.screenshot({ path: OUT + '/replay.png' });
  ok(!rerrors.length, 'no errors on the replay page', rerrors.join(' | '));
  await ctx.close();
  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
