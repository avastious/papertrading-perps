// Posts tab in a real browser (Playwright): shows posts from the stand-in X, filters to the current market,
// opens markets from cashtags, shows new posts live, works on phones, and the owner's admin card.
// Run scripts/dev.sh first (site on 8400, server on 8787 with the stand-in X), then:
//   node tests/server/posts.browser.cjs [screenshot dir]
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const MOCK = 'http://127.0.0.1:8500', API = 'http://127.0.0.1:8787', SITE = 'http://127.0.0.1:8400/';
const OUT = process.argv[2] || '';
let pass = 0, fail = 0;
const ok = (c, l, x = '') => { c ? pass++ : fail++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const j = async (path, body) => (await fetch(path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {})).json();
const backend = (uid, name, email) => `window.AUREOUS_TEST_BACKEND = (() => { let cb = null, user = ${uid ? `{uid:'${uid}', name:'${name}', email:'${email}', emailVerified:true, provider:'google.com'}` : 'null'};
  return { onUser(f){ cb = f; setTimeout(() => f(user), 30); },
    async token(){ const r = await fetch('${MOCK}/token?uid=' + user.uid + '&name=' + encodeURIComponent(user.name) + '&email=' + encodeURIComponent(user.email) + '&verified=1'); return (await r.json()).token; },
    async signInWith(){}, async signInEmail(){}, async signUpEmail(){}, async resetPassword(){}, async signOut(){ user = null; cb && cb(null); }, async reauth(){}, async deleteUser(){} }; })();`;

// the site asks Hyperliquid for prices directly; send those requests to the stand-in
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

(async () => {
  await j(MOCK + '/x/reset');
  const owner = (await j(`${MOCK}/token?uid=posts-owner&name=Owner&email=owner@example.com&verified=1`)).token;
  const admin = (path, body) => fetch(API + path, { method: body ? 'POST' : 'GET', headers: { Authorization: 'Bearer ' + owner, 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) }).then(r => r.json());
  const RUN = Math.random().toString(36).slice(2, 6);   // marks this run's posts (the server keeps earlier ones)
  const seed = [
    ['NickTimiraos', 'Officials are split on whether another cut is needed this year; several want more evidence that inflation is cooling. https://t.co/w1', 48,
      { urls: [{ url: 'https://t.co/w1', expanded_url: 'https://www.wsj.com/economy/central-banking/example', display_url: 'wsj.com/economy/centra…' }] }],
    ['KobeissiLetter', 'BREAKING: $NVDA reports record data center revenue, shares up 6% after hours.\n\nThe AI trade is far from over.', 31],
    ['saylor', 'Strategy has acquired more $BTC. Bitcoin treasury keeps growing.', 22],
    ['federalreserve', 'Federal Reserve Board issues statement on balance sheet policy. $SPX https://t.co/f1 https://t.co/p1', 12,
      { urls: [{ url: 'https://t.co/f1', expanded_url: 'https://www.federalreserve.gov/newsevents/pressreleases.htm', display_url: 'federalreserve.gov/newsevents/pres…' },
               { url: 'https://t.co/p1', expanded_url: 'https://x.com/federalreserve/status/1/photo/1', display_url: 'pic.x.com/p1', media_key: '3_1' }] }],
    ['BillAckman', 'Long-term holders of quality businesses get paid. Nvidia is a good example: patience beats trading.', 5],
  ];
  for (const [handle, text, minsAgo, entities] of seed) await j(MOCK + '/x/post', { handle, text: text + ' #' + RUN, at: Date.now() - minsAgo * 60000, entities, media: !!(entities && entities.urls.some(u => u.media_key)) });
  let st = await admin('/api/admin/posts', { posts_accounts: 'NickTimiraos, KobeissiLetter, saylor, federalreserve, BillAckman, elonmusk', posts_cap: 100, posts_on: true, refresh: true });
  ok(st.ok && /5 new posts/.test(st.messages.join(' ')), 'server read the seeded posts', st.messages && st.messages.join(' '));

  const browser = await chromium.launch();
  // ---------------- desktop
  let ctx = await newContext(browser, { viewport: { width: 1440, height: 900 }, colorScheme: 'dark' });
  await ctx.addInitScript(backend());
  await ctx.addInitScript(() => { try { localStorage.setItem('aureous.coin', JSON.stringify('xyz:NVDA')); } catch {} });
  let page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(SITE, { waitUntil: 'networkidle' });
  await page.waitForSelector('#bookTabs [data-bk=posts]:not([hidden])', { timeout: 15000 }).catch(() => {});
  ok(await page.isVisible('#bookTabs [data-bk=posts]'), 'Posts tab appears when the server has posts on');
  ok(await page.isVisible('#navPosts'), 'and a Posts link in the top menu');
  await page.click('#bookTabs [data-bk=posts]');
  await page.waitForSelector('#postsList .po');
  const n = await page.$$eval('#postsList .po', (els, run) => els.filter(e => e.textContent.includes(run)).length, RUN);
  ok(n === 5, 'all five posts show', `${n} posts`);
  const firstName = await page.$$eval('#postsList .po', (els, run) => els.filter(e => e.textContent.includes(run))[0].querySelector('.po-who b').textContent, RUN);
  ok(firstName === 'BillAckman', 'newest first', firstName);
  ok(await page.$eval('#poLive', e => e.textContent.trim()) === 'Live', 'Live indicator is on');
  const fed = await page.$('#postsList .po:has-text("balance sheet")');
  ok(fed && await fed.$('a[href^="https://www.federalreserve.gov/"]') && await fed.$('.po-extra a') && !(await fed.innerText()).includes('t.co'), 'links show real addresses; photos become a Photo button');
  ok(await page.$eval('#postsList .po-x', a => a.href.startsWith('https://x.com/') && a.target === '_blank'), 'each post links to it on X');
  if (OUT) await page.screenshot({ path: OUT + '/posts-desktop.png' });
  if (OUT) await page.locator('.book').screenshot({ path: OUT + '/posts-panel.png' });

  // filter to this market (NVDA): the $NVDA post and the one that says "Nvidia"
  const hereLabel = await page.textContent('#poHere');
  await page.click('#poHere');
  const here = await page.$$eval('#postsList .po', (els, run) => els.filter(e => e.textContent.includes(run)).map(e => e.querySelector('.po-who span').textContent), RUN);
  ok(hereLabel === 'NVDA' && here.length === 2 && here.includes('@KobeissiLetter') && here.includes('@BillAckman'), '"NVDA" shows only posts about Nvidia ($NVDA or the name)', here.join(' '));
  await page.click('#poFilter [data-here="0"]');
  // a cashtag opens its market
  await page.click('#postsList .po-tag:text("$BTC")');
  await sleep(500);
  ok(await page.evaluate(() => S.coin) === 'BTC', 'clicking $BTC opens the BTC market');
  ok(await page.isVisible('#postsList .po-tag.on:text("$BTC")'), 'and the tag for the open market is highlighted');
  const unknown = await page.$$eval('#postsList .po-cash', els => els.map(e => e.textContent));
  ok(!unknown.length || unknown.every(t => t.startsWith('$')), 'cashtags with no market stay plain text');

  // a new post arrives while watching
  await j(MOCK + '/x/post', { handle: 'elonmusk', text: 'Starship flight test went great. $TSLA' });
  const arrived = await page.waitForSelector('#postsList .po.new:has-text("Starship")', { timeout: 45000 }).then(() => true).catch(() => false);
  ok(arrived, 'a new post appears on its own, highlighted');
  // ...and on another tab it counts as unread
  await page.click('#bookTabs [data-bk=book]');
  await j(MOCK + '/x/post', { handle: 'saylor', text: 'Another update on the $BTC treasury.' });
  const badge = await page.waitForSelector('#bookTabs .po-badge:not([hidden])', { timeout: 70000 }).then(e => e.textContent()).catch(() => null);
  ok(badge === '1', 'on another tab, new posts show as an unread count', String(badge));
  await page.click('#bookTabs [data-bk=posts]');
  ok(await page.isHidden('#bookTabs .po-badge'), 'opening Posts clears it');
  ok(!errors.length, 'no page errors', errors.join(' | '));
  await ctx.close();

  // ---------------- phone
  ctx = await newContext(browser, { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark' });
  await ctx.addInitScript(backend());
  page = await ctx.newPage();
  await page.goto(SITE + '#posts', { waitUntil: 'networkidle' });
  await page.waitForSelector('#postsList .po', { timeout: 15000 }).catch(() => {});
  ok(await page.isVisible('#postsList .po') && await page.$eval('#mswitch [data-mv=posts]', b => b.classList.contains('on')), 'on a phone, #posts opens the Posts view');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
  ok(!overflow, 'nothing sticks out sideways on a phone');
  if (OUT) await page.screenshot({ path: OUT + '/posts-phone.png' });
  await ctx.close();

  // ---------------- admin card
  ctx = await newContext(browser, { viewport: { width: 1280, height: 1000 }, colorScheme: 'dark' });
  await ctx.addInitScript(backend('posts-owner', 'Owner', 'owner@example.com'));
  page = await ctx.newPage();
  await page.goto(SITE + 'admin.html', { waitUntil: 'networkidle' });
  await page.waitForSelector('#poStatus .li', { timeout: 15000 }).catch(() => {});
  const status = await page.textContent('#poStatus').catch(() => '');
  ok(/Live/.test(status) && /Posts read today\s*\d+ of 100/.test(status), 'admin shows status and posts read today', status.replace(/\s+/g, ' ').slice(0, 120));
  ok(/not found/.test(await page.textContent('#poAccts')) === false, 'every account was found');
  await page.fill('#poAccounts', 'NickTimiraos, saylor, not-a-handle!');
  await page.click('#poSave');
  await sleep(800);
  ok(/isn't an X username/.test(await page.textContent('#toast')), 'a bad username is explained');
  await page.fill('#poAccounts', 'NickTimiraos, saylor, federalreserve, KobeissiLetter, BillAckman, elonmusk, nosuchuser123');
  await page.click('#poSave');
  await page.waitForSelector('#poAccts:has-text("not found")', { timeout: 8000 }).catch(() => {});
  ok(/not found/.test(await page.textContent('#poAccts')), 'unknown accounts are marked "not found"');
  await page.locator('#postsCard').scrollIntoViewIfNeeded();
  if (OUT) await page.locator('#postsCard').screenshot({ path: OUT + '/posts-admin.png' });
  await admin('/api/admin/posts', { posts_accounts: 'NickTimiraos, KobeissiLetter, saylor, federalreserve, BillAckman, elonmusk' });
  await ctx.close();
  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
