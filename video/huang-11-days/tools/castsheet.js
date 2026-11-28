// Cast sheet for a project: node tools/castsheet.js  -> out/cast_sheet.png
const fs = require('fs'), path = require('path'); const { chromium } = require('playwright');
const P = require('../lib/puppet.js'), C = require('../lib/cast.js');
const V = C.variant, ROOT = path.join(__dirname, '..');
const LIST = [
  ['Chip', 'Lead. A GPU who explains it all.', C.chip, { face: 'happy', pose: 'point' }],
  ['Rita', 'Reporter. First to every story.', C.rita, { face: 'neutral', pose: 'stand' }],
  ['Dev', 'Engineer. Starts the open letter.', V('sam', { body: { color: '#2f5d8c' }, arms: { color: '#2f5d8c', cuff: '#284f78' }, head: { r: 82, sx: 0.96, sy: 1, neck: 8, hood: '#2f5d8c' } }), { face: 'worried', pose: 'stand' }],
  ['Mr Bigsby', 'Investor. Watches every tick.', C.bigsby, { face: 'surprised', pose: 'shrug' }],
  ['The Board', 'Directors (generic, unnamed).', V('bigsby', { skin: '#c99271', hair: { type: 'fringe', color: '#3b2a20' }, body: { color: '#2c3e66' }, arms: { color: '#2c3e66', hand: '#c99271', cuff: '#ffffff' }, prop: 'none' }), { face: 'neutral', pose: 'stand' }],
];
const chair = `<g><rect x="-70" y="-300" width="140" height="190" rx="26" fill="#1d1a24"/><path d="M-60 -290 q60 30 120 0 v150 q-60 20 -120 0 z" fill="#2b2f3a" stroke="#000" stroke-width="4"/>
  <path d="M-58 -282 l20 120 M58 -282 l-20 120" stroke="#3b3f4a" stroke-width="8"/><rect x="-85" y="-115" width="170" height="34" rx="10" fill="#3b3f4a" stroke="#1d1a24" stroke-width="6"/>
  <path d="M0 -81 v50 M-50 -10 l50 -21 l50 21" stroke="#1d1a24" stroke-width="10" fill="none" stroke-linecap="round"/><circle cx="-50" cy="-6" r="8" fill="#1d1a24"/><circle cx="50" cy="-6" r="8" fill="#1d1a24"/></g>`;
let cells = LIST.map(([n, r, sp, o], i) => `<g transform="translate(${170 + i * 300} 0)">${P.renderCharacter(sp, { ...o, x: 0, y: 520, scale: 0.9 })}
  <text x="0" y="580" text-anchor="middle" font-family="Inter, sans-serif" font-weight="800" font-size="30" fill="#1d1a24">${n}</text>
  <text x="0" y="612" text-anchor="middle" font-family="Inter, sans-serif" font-size="17" fill="#6b6475">${r}</text></g>`).join('');
cells += `<g transform="translate(${170 + LIST.length * 300} 520)">${chair}</g><text x="${170 + LIST.length * 300}" y="580" text-anchor="middle" font-family="Inter, sans-serif" font-weight="800" font-size="30" fill="#1d1a24">The Chair</text>
  <text x="${170 + LIST.length * 300}" y="612" text-anchor="middle" font-family="Inter, sans-serif" font-size="17" fill="#6b6475">Stands in for the CEO (never drawn).</text>`;
const W = 340 + LIST.length * 300 + 150, svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="680"><rect width="100%" height="100%" fill="#f4ecd8"/>
  <text x="40" y="60" font-family="Inter Display, Inter" font-weight="900" font-size="40" fill="#1d1a24">11 DAYS · CAST</text>${cells}</svg>`;
(async () => { const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: W, height: 680 } });
  await p.setContent(`<body style="margin:0">${svg}</body>`); fs.mkdirSync(path.join(ROOT, 'out'), { recursive: true });
  await p.screenshot({ path: path.join(ROOT, 'out/cast_sheet.png') }); await b.close(); console.log('wrote out/cast_sheet.png'); })();
