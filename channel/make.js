// Chronicle Sketch: channel banner (2560x1440, YouTube) and profile picture (800x800), drawn in code.
// usage: node channel/make.js   -> channel/banner.png, channel/pfp.png (+ .svg)
const fs = require('fs'), path = require('path'); const { chromium } = require('playwright');
const P = require('../video/email-stopped/lib/puppet.js'), C = require('../video/email-stopped/lib/cast.js');
const INK = '#1d1a24', PAPER = '#f4ecd8', GOLD = '#f2b33d', RED = '#e85d4a', TEAL = '#3fa37a';
const D = __dirname;
const font = `font-family="Inter Display, Inter, sans-serif"`;

// a pencil from (x1,y1) to its tip at (x2,y2)
function pencil(x1, y1, x2, y2, w) {
  const L = Math.hypot(x2 - x1, y2 - y1), a = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI, h = w / 2, tip = w * 1.5;
  return `<g transform="translate(${x1} ${y1}) rotate(${a})" stroke="${INK}" stroke-width="${w * 0.14}" stroke-linejoin="round">
    <rect x="${-w * 0.5}" y="${-h}" width="${w * 0.9}" height="${w}" rx="${w * 0.25}" fill="#f08aa0"/>
    <rect x="${w * 0.3}" y="${-h}" width="${w * 0.45}" height="${w}" fill="#c9c1b2"/>
    <rect x="${w * 0.75}" y="${-h}" width="${L - tip - w * 0.75}" height="${w}" fill="${GOLD}"/>
    <path d="M${w * 0.75} ${-h / 3} H${L - tip} M${w * 0.75} ${h / 3} H${L - tip}" stroke="#d6952a" stroke-width="${w * 0.08}"/>
    <path d="M${L - tip} ${-h} L${L} 0 L${L - tip} ${h} Z" fill="#f3d6a8"/>
    <path d="M${L - tip * 0.38} ${-h * 0.38} L${L} 0 L${L - tip * 0.38} ${h * 0.38} Z" fill="${INK}"/></g>`;
}
// a sketchy play button (two offset strokes, like a quick drawing)
function play(cx, cy, r) {
  const tri = (dx, dy) => `M${cx - r * 0.45 + dx} ${cy - r * 0.6 + dy} L${cx + r * 0.65 + dx} ${cy + dy} L${cx - r * 0.45 + dx} ${cy + r * 0.6 + dy} Z`;
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${RED}" stroke="${INK}" stroke-width="${r * 0.12}"/>
    <path d="M${cx - r * 1.04} ${cy + r * 0.1} A${r * 1.05} ${r * 1.02} 0 1 1 ${cx - r * 0.7} ${cy + r * 0.78}" fill="none" stroke="${INK}" stroke-width="${r * 0.05}" stroke-linecap="round" opacity="0.6"/>
    <path d="${tri(0, 0)}" fill="#fffaf0" stroke="${INK}" stroke-width="${r * 0.1}" stroke-linejoin="round"/>`;
}
function paper(W, H, grid = 64) {
  let s = `<rect width="${W}" height="${H}" fill="${PAPER}"/>`;
  for (let x = grid; x < W; x += grid) s += `<path d="M${x} 0 V${H}" stroke="#e3d6bb" stroke-width="2"/>`;
  for (let y = grid; y < H; y += grid) s += `<path d="M0 ${y} H${W}" stroke="#e3d6bb" stroke-width="2"/>`;
  return s;
}
// ---------- profile picture: the mark (a pencil drawing a play button) ----------
function mark(cx, cy, R) {
  return `<circle cx="${cx}" cy="${cy}" r="${R}" fill="${PAPER}" stroke="${INK}" stroke-width="${R * 0.07}"/>
    <path d="M${cx - R * 0.78} ${cy + R * 0.42} q${R * 0.3} ${-R * 0.12} ${R * 0.55} ${R * 0.02}" fill="none" stroke="${INK}" stroke-width="${R * 0.035}" stroke-linecap="round" opacity="0.45"/>
    ${play(cx - R * 0.08, cy - R * 0.06, R * 0.5)}
    ${pencil(cx + R * 0.88, cy + R * 0.86, cx + R * 0.28, cy + R * 0.3, R * 0.24)}`;
}
const pfpSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 800 800">
  <rect width="800" height="800" fill="${INK}"/>${mark(400, 400, 360)}</svg>`;

// ---------- banner ----------
const W = 2560, H = 1440, SAFE_W = 1546, SAFE_H = 423;      // YouTube: everything important inside the centre 1546x423
const ch = (spec, opts, x, y, s) => `<g transform="translate(${x} ${y}) scale(${s})">${P.renderCharacter(spec, { shadow: true, ...opts })}</g>`;
const word = (x, y, t, size, fill, extra = '') => `<text x="${x}" y="${y}" ${font} font-weight="900" font-size="${size}" fill="${fill}" ${extra}>${t}</text>`;
const cy = H / 2, L0 = (W - SAFE_W) / 2 + 150;
const bannerSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  ${paper(W, H)}
  <!-- a marker band across the middle, where every device shows the banner -->
  <path d="M0 ${cy - 250} C${W * 0.3} ${cy - 270} ${W * 0.7} ${cy - 230} ${W} ${cy - 255} V${cy + 250} C${W * 0.7} ${cy + 270} ${W * 0.3} ${cy + 230} 0 ${cy + 255} Z" fill="#efe1c3"/>
  <!-- cast, outside the mobile safe area (seen on desktop and TV): safe area is x ${(W - SAFE_W) / 2}..${(W + SAFE_W) / 2} -->
  ${ch(C.fax, { pose: { armL: [-70, -130], armR: [70, 130], legL: [-6, -4], legR: [6, 4], propHand: 'none' }, face: 'happy' }, 150, cy + 190, 0.9)}
  ${ch(C.penny, { pose: { ...P.POSES.point, armR: [70, 60] }, face: "happy", look: 1 }, 330, cy + 195, 0.8)}
  ${ch(C.gate, { pose: { armR: [150, 200], armL: [-8, -4], legL: [-4, -3], legR: [4, 3], propHand: 'none' }, face: 'happy', flip: true }, W - 410, cy + 195, 0.66)}
  ${ch(C.bigsby, { pose: 'stand', face: 'surprised', flip: true, look: 1 }, W - 175, cy + 195, 0.8)}
  <!-- wordmark: inside the safe area -->
  ${mark(L0 + 125, cy, 125)}
  ${word(L0 + 290, cy - 22, 'CHRONICLE', 150, INK, 'letter-spacing="1"')}
  <path d="M${L0 + 292} ${cy + 8} C${L0 + 500} ${cy - 6} ${L0 + 850} ${cy + 20} ${L0 + 1080} ${cy + 2}" fill="none" stroke="${GOLD}" stroke-width="24" stroke-linecap="round" opacity="0.9"/>
  ${word(L0 + 292, cy + 122, 'SKETCH', 100, RED, 'letter-spacing="10"')}
  <text x="${L0 + 795}" y="${cy + 88}" ${font} font-weight="700" font-size="40" fill="${INK}">Big events, drawn simple.</text>
  <text x="${L0 + 795}" y="${cy + 132}" ${font} font-weight="500" font-size="29" fill="#6b6475">Animated sketches of the news</text>
</svg>`;

(async () => {
  fs.writeFileSync(path.join(D, 'pfp.svg'), pfpSvg); fs.writeFileSync(path.join(D, 'banner.svg'), bannerSvg);
  const b = await chromium.launch();
  for (const [name, svg, w, h] of [['pfp', pfpSvg, 800, 800], ['banner', bannerSvg, W, H]]) {
    const p = await b.newPage({ viewport: { width: w, height: h } });
    await p.setContent(`<html><body style="margin:0">${svg}</body></html>`); await p.waitForTimeout(300);
    await p.screenshot({ path: path.join(D, name + '.png') }); await p.close();
  }
  // previews: how YouTube crops them (circle pfp; banner on mobile = centre 1546x423, desktop = full-width 423 band)
  const u = n => 'data:image/png;base64,' + fs.readFileSync(path.join(D, n)).toString('base64');
  const p = await b.newPage({ viewport: { width: 2600, height: 1200 } });
  await p.setContent(`<html><body style="margin:0;background:#202020;font:24px sans-serif;color:#ccc">
    <div style="padding:20px">Desktop (2560×423 band):</div><div style="width:2560px;height:423px;margin-left:20px;background:url(${u('banner.png')}) center/2560px 1440px"></div>
    <div style="display:flex;gap:40px;padding:20px;align-items:center"><div>Mobile (1546×423):<div style="width:1546px;height:423px;margin-top:10px;background:url(${u('banner.png')}) center/2560px 1440px"></div></div>
    <div>Profile:<img src="${u('pfp.png')}" style="display:block;width:220px;height:220px;border-radius:50%;margin-top:10px"><img src="${u('pfp.png')}" style="width:48px;height:48px;border-radius:50%;margin-top:12px"></div></div></body></html>`);
  await p.waitForTimeout(400); await p.screenshot({ path: path.join(D, 'preview.png') }); await b.close();
  console.log('wrote banner.png, pfp.png, preview.png');
})();
