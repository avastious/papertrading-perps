// Render a scene with headless Chrome.
//   node tools/render.js beat01 --check            run the rules check over every frame
//   node tools/render.js beat01 --stills v1        one still per shot  -> out/step4/beat01/v1/stills/
//   node tools/render.js beat01 --video  v1        every frame + FFmpeg -> out/step4/beat01/v1/beat01.mp4
// Never overwrites: refuses if the version folder already has that output.
const http = require('http'), fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const [beat, mode, version = 'v1'] = process.argv.slice(2);
if (!beat || !['--check', '--stills', '--video'].includes(mode)) { console.error('usage: node tools/render.js <beat> --check|--stills|--video [version]'); process.exit(2); }

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  const p = path.normalize(path.join(ROOT, decodeURIComponent(req.url.split('?')[0])));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}/scenes/${beat}/index.html`;
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(url);
  await page.waitForFunction(() => window.ready === true, null, { timeout: 60000 }).catch(() => {});
  if (errors.length) { console.error(errors.join('\n')); process.exit(1); }

  const outDir = path.join(ROOT, 'out', 'step4', beat, version);
  const shoot = async (n, file) => { await page.evaluate(n => window.scene.renderFrame(n), n); await page.screenshot({ path: file }); };

  if (mode === '--check') {
    const r = await page.evaluate(() => window.scene.checkAll());
    console.log(JSON.stringify({ walk: r.walk, faxX: r.faxX }, null, 0));
    console.log(r.problems.length ? r.problems.join('\n') : 'all frames pass');
  }
  if (mode === '--stills') {
    const dir = path.join(outDir, 'stills');
    if (fs.existsSync(dir)) throw new Error(`${dir} already exists; pick a new version`);
    fs.mkdirSync(dir, { recursive: true });
    const shots = await page.evaluate(() => window.scene.SHOTS.map(s => ({ ...s, still: s.still })));
    const picks = (process.env.FRAMES || '').split(',').filter(Boolean).map(Number);
    for (const [i, s] of shots.entries()) {
      const n = picks[i] ?? Math.round((s.from + s.to) / 2);
      const file = path.join(dir, `shot${s.id}_f${String(n).padStart(3, '0')}.png`);
      await shoot(n, file); console.log('wrote', path.relative(ROOT, file), '·', s.name);
    }
  }
  if (mode === '--video') {
    const frames = path.join(outDir, 'frames');
    const mp4 = path.join(outDir, `${beat}.mp4`);
    if (fs.existsSync(mp4)) throw new Error(`${mp4} already exists; pick a new version`);
    fs.mkdirSync(frames, { recursive: true });
    const total = await page.evaluate(() => window.scene.FRAMES);
    for (let n = 0; n < total; n++) {
      await shoot(n, path.join(frames, `f${String(n).padStart(4, '0')}.png`));
      if (n % 30 === 0) console.log(`frame ${n}/${total}`);
    }
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '30', '-i', path.join(frames, 'f%04d.png'),
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '17', '-preset', 'slow', '-movflags', '+faststart', '-s', '1920x1080', mp4], { stdio: 'inherit' });
    console.log('wrote', path.relative(ROOT, mp4));
  }
  if (errors.length) console.error(errors.join('\n'));
  await browser.close(); server.close();
})().catch(e => { console.error(e); process.exit(1); });
