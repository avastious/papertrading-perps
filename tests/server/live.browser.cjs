// Live trading on Hyperliquid's testnet, end to end in a browser, against the local stand-ins:
// the owner turns it on, a trader connects a (fake, test-key) wallet, enables trading, opens and closes a position.
// Needs: mock-hyperliquid.js on 8500, wrangler dev on 8787 (with --var ADMIN_EMAILS:owner@example.com), the site on
// 8400 with apiUrl pointed at 8787, and Playwright. Then run tests/server/live_signatures.py to check every signature.
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const MOCK = 'http://127.0.0.1:8500', API = 'http://127.0.0.1:8787', BASE = process.env.BASE || 'http://127.0.0.1:8400/';
const USER_KEY = '0x' + require('crypto').randomBytes(32).toString('hex');   // a fresh throwaway test key each run
const BUILDER = '0x1111111111111111111111111111111111111111';
let pass = 0, fail = 0;
const ok = (c, l, x = '') => { c ? pass++ : fail++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const tok = async q => (await (await fetch(`${MOCK}/token?${new URLSearchParams(q)}`)).json()).token;
const admin = async (token, body) => (await fetch(API + '/api/admin/settings', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify(body) })).json();

// Stand-in sign-in (no Firebase), as in the other browser tests: live mode itself doesn't need an Aureous account.
const SIGNIN = `window.AUREOUS_TEST_BACKEND = { onUser(f){ setTimeout(() => f(null), 30); }, async token(){ throw new Error('signed out'); },
  async signInWith(){}, async signInEmail(){}, async signUpEmail(){}, async resetPassword(){}, async signOut(){}, async reauth(){}, async deleteUser(){} };`;
// A browser wallet (EIP-1193) that signs with a test key, using the page's own bundled viem once it has loaded.
const WALLET = `
window.AUREOUS_LIVE_API = '${MOCK}/tn';
window.__walletCalls = [];
window.ethereum = { isMetaMask: true, async request({ method, params }) {
  window.__walletCalls.push(method);
  for (let i = 0; i < 100 && !window.AureousHL; i++) await new Promise(r => setTimeout(r, 50));
  const acct = window.AureousHL.privateKeyToAccount('${USER_KEY}');
  if (method === 'eth_requestAccounts' || method === 'eth_accounts') return [acct.address];
  if (method === 'eth_chainId') return '0x66eee';
  if (method === 'eth_signTypedData_v4') { const d = JSON.parse(params[1]); delete d.types.EIP712Domain; return acct.signTypedData(d); }
  throw new Error('unsupported ' + method);
} };`;

(async () => {
  const logStart = (await (await fetch(MOCK + '/tn/log')).json()).log.length;   // this run's requests only
  const owner = await tok({ uid: 'live-owner', name: 'Owner', email: 'owner@example.com', verified: '1' });
  let r = await admin(owner, { live: 'testnet', builder: BUILDER, builder_fee: 50 });
  ok(r.live === 'testnet', 'owner turns on live trading (testnet) with a 0.05% builder fee', (r.messages || []).join(' ') || r.error);

  const b = await chromium.launch(); const errs = [];
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript(SIGNIN); await ctx.addInitScript(WALLET);
  await ctx.route('https://api.hyperliquid.xyz/**', async route => {
    const hdr = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'content-type': 'application/json' };
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: hdr });
    const rr = await fetch(MOCK + '/info', { method: 'POST', body: route.request().postData() });
    route.fulfill({ status: 200, headers: hdr, body: await rr.text() });
  });
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
  p.on('dialog', d => d.accept());
  await p.goto(BASE); await p.waitForTimeout(2500);
  ok(await p.isVisible('#modeSwitch'), 'the Paper / Live switch shows');
  ok(!(await p.isVisible('.live-banner')), 'paper mode by default, no live banner');

  await p.click('[data-mode="live"]'); await p.waitForTimeout(1500);
  ok(await p.isVisible('.live-banner'), 'live mode shows the testnet banner');
  ok(await p.isVisible('#liveAcct') && !(await p.isVisible('#paperAcct')), 'the live account panel replaces the paper one');
  ok((await p.textContent('#submit')).includes('Connect wallet'), 'order button asks to connect a wallet', await p.textContent('#submit'));
  ok(!(await p.isVisible('#tpslWrap')), 'TP/SL hidden in live mode (not wired to Hyperliquid yet)');

  await p.click('[data-live="connect"]'); await p.waitForTimeout(1500);
  const user = await p.evaluate(() => window.AureousLive.user);
  ok(/^0x[0-9a-f]{40}$/.test(user || ''), 'wallet connected', user);
  ok((await p.textContent('#liveAcct')).includes('No test USDC yet'), 'an empty account is pointed at the faucet');

  await fetch(`${MOCK}/tn/fund?user=${user}&amount=1000`); await p.waitForTimeout(3500);
  ok((await p.textContent('#liveAcct')).includes('$1,000.00'), 'funded testnet account shows $1,000', (await p.textContent('#liveAcct')).slice(0, 160));

  await p.click('[data-live="enable"]'); await p.waitForTimeout(2500);
  let log = (await (await fetch(MOCK + '/tn/log')).json());
  const types = log.log.map(x => x.action.type);
  ok(types.includes('approveAgent') && types.includes('approveBuilderFee'), 'enabling signs a trading key and the builder fee', types.join(','));
  const ab = log.log.find(x => x.action.type === 'approveBuilderFee');
  ok(ab && ab.action.maxFeeRate === '0.05%' && ab.action.hyperliquidChain === 'Testnet', 'builder fee approved at 0.05% on Testnet', ab && JSON.stringify(ab.action));
  ok((await p.textContent('#submit')).includes('on testnet'), 'order button is ready', await p.textContent('#submit'));
  const stored = await p.evaluate(() => JSON.parse(localStorage.getItem('aureous.live.v1')));
  ok(stored.key && stored.user === user && stored.network === 'testnet', 'trading key kept in this browser only');

  await p.click('[data-lev="10"]').catch(() => {});
  await p.fill('#size', '50'); await p.waitForTimeout(300);
  await p.click('#submit'); await p.waitForTimeout(600);
  if (await p.isVisible('#confirmDlg')) { ok((await p.textContent('#confirmDlg')).includes('testnet'), 'confirm dialog says it is the testnet'); await p.click('#cfOk'); }
  await p.waitForTimeout(3500);
  log = (await (await fetch(MOCK + '/tn/log')).json());
  const ord = log.log.filter(x => x.action.type === 'order').pop();
  ok(ord && ord.action.builder && ord.action.builder.b === BUILDER && ord.action.builder.f === 50, 'order carries the Aureous builder code', ord && JSON.stringify(ord.action.builder));
  ok(ord && ord.action.orders[0].t.limit.tif === 'Ioc' && ord.action.orders[0].b === true, 'market long sent as an IOC buy', ord && JSON.stringify(ord.action.orders[0]));
  ok(log.log.some(x => x.action.type === 'updateLeverage' && x.action.leverage === 10), 'leverage set to 10x on Hyperliquid first');
  const toastText = (await p.$$eval('.toast', t => t.map(x => x.textContent))).join(' | ');
  ok(/Testnet: bought/.test(toastText), 'fill confirmed', toastText.slice(-160));
  ok((await p.textContent('#bview')).includes('BTC') && (await p.textContent('#bview')).includes('Long'), 'live tab shows the BTC long');
  await p.screenshot({ path: '/tmp/live-desktop.png' });

  await p.click('[data-live="close"][data-coin="BTC"]'); await p.waitForTimeout(600);
  if (await p.isVisible('#confirmDlg')) await p.click('#cfOk');
  await p.waitForTimeout(3500);
  ok((await p.textContent('#bview')).includes('No live positions'), 'position closed with a reduce-only order');
  log = (await (await fetch(MOCK + '/tn/log')).json());
  ok(log.log.filter(x => x.action.type === 'order').pop().action.orders[0].r === true, 'the close was reduce-only');

  await p.click('#coinBtn'); await p.click('#mkList [data-coin="kPEPE"]'); await p.waitForTimeout(800);
  ok((await p.textContent('#submit')).includes("isn't on testnet"), 'markets missing from testnet are flagged', await p.textContent('#submit'));
  await p.click('#coinBtn'); await p.click('#mkList [data-coin="BTC"]'); await p.waitForTimeout(500);

  await p.click('[data-mode="paper"]'); await p.waitForTimeout(800);
  ok(await p.isVisible('#paperAcct') && !(await p.isVisible('.live-banner')), 'back to paper: paper account, no banner');

  r = await admin(owner, { live: 'off' });
  await p.reload(); await p.waitForTimeout(2500);
  ok(!(await p.isVisible('#modeSwitch')), 'owner turns live trading off: the switch disappears');
  ok(!errs.length, 'no page errors', errs.join(' | '));
  await b.close();
  require('fs').writeFileSync('/tmp/live-log.json', JSON.stringify((await (await fetch(MOCK + '/tn/log')).json()).log.slice(logStart)));
  console.log(`\n${pass} passed, ${fail} failed  (signatures: python3 tests/server/live_signatures.py /tmp/live-log.json ${user})`);
  process.exit(fail ? 1 : 0);
})();
