// Thumbnail for "The Day Email Stopped" (1280x720, YouTube). usage: node channel/thumb.js
const fs = require('fs'), path = require('path'); const { chromium } = require('playwright');
const P = require('../video/email-stopped/lib/puppet.js'), C = require('../video/email-stopped/lib/cast.js');
const INK = '#1d1a24', RED = '#e85d4a', GOLD = '#f2b33d', D = __dirname, W = 1280, H = 720;
const font = `font-family="Inter Display, Inter, sans-serif" font-weight="900"`;
const ch = (spec, opts, x, y, s) => `<g transform="translate(${x} ${y}) scale(${s})">${P.renderCharacter(spec, { shadow: false, ...opts })}</g>`;
// sunburst behind the fax
let rays = ''; for (let i = 0; i < 24; i++) { const a = i * 15 * Math.PI / 180, b = (i * 15 + 7.5) * Math.PI / 180, cx = 330, cy = 430, R = 1100;
  rays += `<path d="M${cx} ${cy} L${cx + R * Math.cos(a)} ${cy + R * Math.sin(a)} L${cx + R * Math.cos(b)} ${cy + R * Math.sin(b)} Z" fill="#ffd56b"/>`; }
// shriek waves around Faxie
let waves = ''; for (let k = 0; k < 3; k++) for (const sd of [-1, 1]) { const r = 90 + k * 55;
  waves += `<path d="M${330 + sd * (290 + k * 42)} ${400 - r * 0.5} q${sd * r * 0.45} ${r * 0.5} 0 ${r}" fill="none" stroke="${RED}" stroke-width="${16 - k * 3}" stroke-linecap="round" opacity="${1 - k * 0.22}"/>`; }
const outlined = (x, y, t, size, fill, sw, rot = 0, anchor = 'start') => `<text x="${x}" y="${y}" ${font} font-size="${size}" text-anchor="${anchor}" fill="${fill}" stroke="${INK}" stroke-width="${sw}" stroke-linejoin="round" paint-order="stroke" transform="rotate(${rot} ${x} ${y})">${t}</text>`;
const envX = `<g transform="translate(740 470) rotate(-10) scale(0.72)"><rect x="-95" y="-62" width="190" height="124" rx="10" fill="#fffaf0" stroke="${INK}" stroke-width="10"/>
  <path d="M-88 -55 L0 10 L88 -55" fill="none" stroke="${INK}" stroke-width="9" stroke-linejoin="round"/>
  <path d="M-120 -95 L120 95 M120 -95 L-120 95" stroke="${RED}" stroke-width="26" stroke-linecap="round"/><path d="M-120 -95 L120 95 M120 -95 L-120 95" stroke="${INK}" stroke-width="34" stroke-linecap="round" opacity="0" /></g>`;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${GOLD}"/>${rays}
  ${waves}
  ${ch(C.fax, { pose: { armL: [-110, -160], armR: [110, 160], legL: [-8, -5], legR: [8, 5], propHand: 'none' }, face: 'shriek' }, 330, 690, 2.1)}
  ${ch(C.bigsby, { pose: { lean: -8, armR: [150, 215], armL: [-150, -215], legL: [-6, -4], legR: [6, 4], head: -6, propHand: 'none' }, face: 'angry', flip: true, look: 1.5 }, 1040, 790, 0.95)}
  ${outlined(1235, 150, 'EMAIL', 132, '#fffaf0', 24, -4, 'end')}
  ${outlined(1240, 285, 'STOPPED', 132, RED, 24, -4, 'end')}
  ${envX}
  ${outlined(70, 92, 'SKREEEEE!', 64, '#fffaf0', 14, -8, 'start')}
</svg>`;
(async () => {
  fs.writeFileSync(path.join(D, 'thumbnail.svg'), svg);
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: W, height: H } });
  await p.setContent(`<html><body style="margin:0">${svg}</body></html>`); await p.waitForTimeout(300);
  await p.screenshot({ path: path.join(D, 'thumbnail.png') });
  // preview at YouTube feed size, with the duration badge where YouTube puts it
  const u = 'data:image/png;base64,' + fs.readFileSync(path.join(D, 'thumbnail.png')).toString('base64');
  const q = await b.newPage({ viewport: { width: 760, height: 260 } });
  await q.setContent(`<body style="margin:0;background:#0f0f0f;display:flex;gap:20px;padding:20px;font:14px sans-serif">
    <div style="position:relative"><img src="${u}" style="width:360px;border-radius:12px;display:block"><span style="position:absolute;right:8px;bottom:8px;background:rgba(0,0,0,.8);color:#fff;padding:1px 5px;border-radius:4px;font-weight:600">13:42</span></div>
    <div style="position:relative"><img src="${u}" style="width:168px;border-radius:8px;display:block"><span style="position:absolute;right:4px;bottom:4px;background:rgba(0,0,0,.8);color:#fff;padding:0 4px;border-radius:3px;font-size:11px">13:42</span></div></body>`);
  await q.waitForTimeout(200); await q.screenshot({ path: path.join(D, 'thumbnail-preview.png') }); await b.close();
  console.log('wrote thumbnail.png', fs.statSync(path.join(D, 'thumbnail.png')).size, 'bytes');
})();
