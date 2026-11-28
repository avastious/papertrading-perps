// Builds the cast sheet and the lead pose sheet as HTML, then screenshots them with headless Chrome.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const P = require('../lib/puppet.js');
const CAST = require('../lib/cast.js');

const OUT = path.join(__dirname, '..', 'out', 'step1');
fs.mkdirSync(OUT, { recursive: true });

const FONT = `font-family="'Baloo 2','Fredoka','Comic Neue','Trebuchet MS',sans-serif"`;
const page = (svg) => `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:#f6efe3}</style></head><body>${svg}</body></html>`;

// Find Chrome on macOS, Windows or Linux (override with CHROME_PATH).
function chromePath() {
  const cands = [process.env.CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].filter(Boolean);
  return cands.find((c) => { try { return fs.existsSync(c); } catch { return false; } }) || 'google-chrome';
}
const CHROME = chromePath();

function shoot(name, svg) {
  const html = path.join(OUT, name + '.html');
  fs.writeFileSync(html, page(svg));
  execFileSync(CHROME, ['--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
    '--window-size=1920,1080', `--screenshot=${path.join(OUT, name + '.png')}`, require('url').pathToFileURL(html).href], { stdio: 'ignore' });
}

const label = (x, y, t, size, weight = 700, fill = P.INK) => `<text x="${x}" y="${y}" text-anchor="middle" ${FONT} font-size="${size}" font-weight="${weight}" fill="${fill}">${t}</text>`;

function wrap(text, n) {
  const words = text.split(' '); const lines = []; let cur = '';
  for (const w of words) { if ((cur + ' ' + w).trim().length > n) { lines.push(cur.trim()); cur = w; } else cur += ' ' + w; }
  if (cur.trim()) lines.push(cur.trim());
  return lines;
}

// ---------------- Cast sheet
{
  const order = ['gate', 'sam', 'penny', 'bigsby', 'fax'];
  const xs = [230, 560, 960, 1360, 1700];
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080">`;
  svg += `<rect width="1920" height="1080" fill="#f6efe3"/>`;
  svg += `<rect x="0" y="780" width="1920" height="300" fill="#ead9c0"/><line x1="0" y1="780" x2="1920" y2="780" stroke="${P.INK}" stroke-width="5"/>`;
  svg += label(960, 92, 'THE DAY EMAIL STOPPED — CAST', 60, 800);
  svg += label(960, 138, 'All characters drawn in code (SVG puppets). Original designs.', 26, 500, '#6b6374');
  order.forEach((id, i) => {
    const sp = CAST[id];
    svg += P.renderCharacter(sp, { pose: 'stand', face: id === 'penny' ? 'happy' : 'neutral', x: xs[i], y: 790, look: i < 2 ? 0.6 : -0.4 });
    svg += label(xs[i], 860, sp.name, 40, 800);
    wrap(sp.role, 26).forEach((ln, j) => (svg += label(xs[i], 902 + j * 32, ln, 25, 500, '#4a4352')));
  });
  // height ruler
  svg += `<g stroke="#9c92a6" stroke-width="3">` + [0, 100, 200, 300, 400, 500].map((h) => `<line x1="40" y1="${790 - h}" x2="${h % 200 ? 56 : 66}" y2="${790 - h}"/>`).join('') + `<line x1="40" y1="790" x2="40" y2="290"/></g>`;
  svg += `</svg>`;
  shoot('cast_sheet', svg);
}

// ---------------- Lead pose + face sheet
{
  const sp = CAST.penny;
  const poses = [['stand', 'neutral'], ['walk', 'neutral'], ['run', 'scared'], ['point', 'happy'], ['shrug', 'neutral'], ['surprised', 'surprised']];
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080">`;
  svg += `<rect width="1920" height="1080" fill="#f6efe3"/>`;
  svg += label(960, 70, 'PENNY PARK — POSES & FACES', 52, 800);
  const y0 = 600;
  svg += `<line x1="60" y1="${y0}" x2="1860" y2="${y0}" stroke="${P.INK}" stroke-width="4"/>`;
  poses.forEach(([pose, face], i) => {
    const x = 190 + i * 308;
    svg += P.renderCharacter(sp, { pose, face, x, y: y0, scale: 0.92, look: 0.5 });
    svg += label(x, y0 + 46, pose.toUpperCase(), 32, 800);
  });
  // faces row: head-only renders
  const faces = ['neutral', 'happy', 'angry', 'scared', 'blink', 'talkA', 'talkB'];
  const names = ['neutral', 'happy', 'angry', 'scared', 'blink', 'talk (open)', 'talk (mid)'];
  svg += `<rect x="60" y="690" width="1800" height="360" rx="24" fill="#fffaf2" stroke="${P.INK}" stroke-width="4"/>`;
  faces.forEach((fc, i) => {
    const x = 200 + i * 255;
    // render full character but clip to head
    svg += `<svg x="${x - 125}" y="700" width="250" height="300" viewBox="-125 -560 250 300" overflow="hidden">${P.renderCharacter(sp, { pose: 'stand', face: fc, shadow: false, look: 0 })}</svg>`;
    svg += label(x, 1030, names[i], 28, 700);
  });
  svg += `</svg>`;
  shoot('penny_poses', svg);
}
console.log('done');
