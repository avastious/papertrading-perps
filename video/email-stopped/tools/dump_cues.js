// node tools/dump_cues.js > audio/cues.json
const http = require('http'), fs = require('fs'), path = require('path'); const { chromium } = require('playwright');
const ROOT = path.join(__dirname, '..');
const srv = http.createServer((q, r) => { const p = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': p.endsWith('.js') ? 'text/javascript' : p.endsWith('.json') ? 'application/json' : 'text/html' }); fs.createReadStream(p).pipe(r); });
(async () => { await new Promise(r => srv.listen(0, r)); const b = await chromium.launch(); const pg = await b.newPage(); pg.on('pageerror', e => console.error('ERR', String(e))); pg.on('console', m => console.error('LOG', m.text()));
  await pg.goto(`http://127.0.0.1:${srv.address().port}/scenes/cues.html`); await pg.waitForFunction(() => window.ready);
  process.stdout.write(JSON.stringify(await pg.evaluate(() => window.cues))); await b.close(); srv.close(); })();
