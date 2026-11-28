// Render many beats of the full video in parallel, with headless Chrome.
//   node tools/render_full.js check 2-99            rules check only (prints problems per beat)
//   node tools/render_full.js stills 2-12 v1        middle frame of each shot -> out/step4/full/v1/stills/
//   node tools/render_full.js video 2-99 v1 [jobs]  every frame -> one mp4 per beat in out/step4/full/v1/ (frames deleted after)
// Never overwrites an existing beat mp4 of the same version.
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os'), { execFileSync } = require('child_process');
const { chromium } = require('playwright');
const ROOT = path.join(__dirname, '..');
const [mode, range, version = 'v1', jobsArg] = process.argv.slice(2);
const beats = []; for (const part of (range || '').split(',')) { const [a, b] = part.split('-').map(Number); for (let i = a; i <= (b || a); i++) beats.push(i); }
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const p = path.normalize(path.join(ROOT, decodeURIComponent(req.url.split('?')[0])));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res);
});
const OUT = path.join(ROOT, 'out', 'step4', 'full', version);
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/scenes/engine.html`;
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const queue = beats.slice(); let failed = 0;
  const worker = async () => {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
    const errors = []; page.on('pageerror', e => errors.push(String(e))); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    while (queue.length) {
      const n = queue.shift(), tag = 'b' + String(n).padStart(2, '0');
      errors.length = 0;
      try {
        await page.goto(`${base}?beat=${n}`); await page.waitForFunction(() => window.ready === true, null, { timeout: 120000 });
        if (errors.length) throw new Error(errors.join('\n'));
        if (mode === 'check') {
          const r = await page.evaluate(() => window.scene.checkAll());
          const uniq = [...new Set(r.problems.map(p => p.replace(/^\d+: /, '')))];
          console.log(`${tag} ${r.frames}f [${r.shots.join(', ')}] ${r.problems.length ? 'PROBLEMS ' + r.problems.length + ': ' + uniq.slice(0, 4).join(' | ') + ' (first at ' + r.problems[0].split(':')[0] + ')' : 'ok'}`);
          if (r.problems.length) failed++;
        } else if (mode === 'stills') {
          const dir = path.join(OUT, 'stills'); fs.mkdirSync(dir, { recursive: true });
          const shots = await page.evaluate(() => window.scene.SHOTS.map(s => [s.id, s.from, s.to]));
          for (const [id, a, b] of shots) { const f = Math.round((a + b) / 2); await page.evaluate(f => window.scene.renderFrame(f), f); await page.screenshot({ path: path.join(dir, `${tag}_${id}_f${f}.jpg`), type: 'jpeg', quality: 85 }); }
          console.log(tag, 'stills', shots.length);
        } else if (mode === 'video') {
          const mp4 = path.join(OUT, `${tag}.mp4`); if (fs.existsSync(mp4)) { console.log(tag, 'exists, skipped'); continue; }
          const tmp = fs.mkdtempSync(path.join(os.tmpdir(), tag + '-'));
          const total = await page.evaluate(() => window.scene.FRAMES);
          for (let f = 0; f < total; f++) { await page.evaluate(f => window.scene.renderFrame(f), f); await page.screenshot({ path: path.join(tmp, `f${String(f).padStart(4, '0')}.jpg`), type: 'jpeg', quality: 93 }); }
          fs.mkdirSync(OUT, { recursive: true });
          execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '30', '-i', path.join(tmp, 'f%04d.jpg'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-preset', 'medium', mp4]);
          // keep a contact sheet's worth of frames (every 15th) for review, then delete the rest
          const keep = path.join(OUT, 'review', tag); fs.mkdirSync(keep, { recursive: true });
          for (let f = 0; f < total; f += 15) fs.copyFileSync(path.join(tmp, `f${String(f).padStart(4, '0')}.jpg`), path.join(keep, `f${String(f).padStart(4, '0')}.jpg`));
          fs.rmSync(tmp, { recursive: true, force: true });
          console.log(tag, 'video', total, 'frames');
        }
      } catch (e) { failed++; console.log(tag, 'ERROR', String(e).slice(0, 400)); }
    }
    await page.close();
  };
  await Promise.all(Array.from({ length: +(jobsArg || 1) }, worker));
  await browser.close(); server.close();
  if (failed) process.exitCode = 1;
})();
