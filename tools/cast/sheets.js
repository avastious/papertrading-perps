'use strict';
// Builds the review sheets: sheets/cast.svg (+ .png) and sheets/rio-poses.svg (+ .png).
// usage: node tools/cast/sheets.js
const fs = require('fs'), path = require('path');
const { CAST, POSES, drawCharacter, drawHeadOnly } = require('./cast');

const DIR = __dirname, OUTDIR = path.join(DIR, 'sheets');
const FONTS = path.join(DIR, '..', 'tiktok', 'fonts');
const font = (w) => `@font-face{font-family:Plex;font-weight:${w};src:url(data:font/ttf;base64,${fs.readFileSync(path.join(FONTS, `ibm-plex-sans-latin-${w}-normal.ttf`)).toString('base64')})}`;
const CSS = `<style>${font(400)}${font(600)}@font-face{font-family:Cinzel;src:url(data:font/ttf;base64,${fs.readFileSync(path.join(FONTS, 'cinzel-latin-600-normal.ttf')).toString('base64')})}
text{font-family:Plex,sans-serif;fill:#211D1A}.t{font-family:Cinzel,serif;font-size:34px;fill:#211D1A;letter-spacing:3px}
.n{font-size:30px;font-weight:600}.r{font-size:15px;fill:#5E5A54}.l{font-size:14px;font-weight:600;fill:#8A857D;letter-spacing:1.5px}.k{font-size:13px;fill:#8A857D}</style>`;
const PAPER = '#F4EFE6', CARD = '#FBF8F3', RULE = '#E3DCD0', GOLD = '#D1A85A';

const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
function wrap(text, n) { const w = text.split(' '), out = ['']; for (const x of w) { if ((out[out.length - 1] + ' ' + x).trim().length > n) out.push(x); else out[out.length - 1] = (out[out.length - 1] + ' ' + x).trim(); } return out; }
const svg = (W, H, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${CSS}<rect width="${W}" height="${H}" fill="${PAPER}"/>${body}</svg>`;
const card = (x, y, w, h) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="18" fill="${CARD}" stroke="${RULE}" stroke-width="2"/>`;
const swatches = (c, x, y) => {
  const cols = [c.skin, c.hair.color, c.hat.color, c.outfit.color, c.outfit.sleeveColor, c.outfit.shirt, c.outfit.pants, c.outfit.shoes]
    .filter((v, i, a) => v && a.indexOf(v) === i).slice(0, 7);
  return cols.map((v, i) => `<circle cx="${x + i * 24}" cy="${y}" r="9" fill="${v}" stroke="#211D1A" stroke-width="2"/>`).join('');
};

// ---- sheet 1: whole cast ----
function castSheet() {
  const colW = 330, W = 60 + colW * CAST.length + 20, H = 1010;
  let b = `<text x="60" y="78" class="t">AUREOUS · CAST</text><text x="62" y="106" class="r">Flat 2D · big heads · simple faces · thick outlines. Every part is code — swap any field and it redraws.</text>`;
  CAST.forEach((c, i) => {
    const x = 60 + i * colW, cx = x + (colW - 20) / 2;
    b += card(x, 140, colW - 20, 830);
    if (c.lead) b += `<rect x="${x + 18}" y="158" width="64" height="24" rx="12" fill="${GOLD}"/><text x="${x + 50}" y="175" text-anchor="middle" style="font-size:12px;font-weight:600;letter-spacing:1.5px">LEAD</text>`;
    b += drawCharacter(c, 'stand', 'neutral', { x: cx, y: 580, s: 1.5 });
    b += `<text x="${x + 24}" y="632" class="n">${c.name}</text>`;
    wrap(c.role, 36).forEach((ln, j) => { b += `<text x="${x + 24}" y="${660 + j * 21}" class="r">${esc(ln)}</text>`; });
    b += swatches(c, x + 33, 732);
    b += `<text x="${x + 24}" y="776" class="l">FACES</text>`;
    ['neutral', 'happy', 'angry', 'scared'].forEach((e, j) => {
      const hx = x + 60 + j * 70;
      b += drawHeadOnly(c, e, { x: hx, y: 845, s: 0.46 });
      b += `<text x="${hx}" y="908" text-anchor="middle" class="k">${e}</text>`;
    });
    b += `<text x="${x + 24}" y="946" class="k">${c.head.shape} head · ${c.hair.style}${c.hat.style !== 'none' ? ' + ' + c.hat.style : ''} · ${c.outfit.type} · ${c.prop}</text>`;
  });
  return svg(W, H, b);
}

// ---- sheet 2: the lead's poses and faces ----
function leadSheet() {
  const c = CAST.find(x => x.lead), W = 1700, H = 1300;
  let b = `<text x="60" y="78" class="t">${c.name.toUpperCase()} · POSES &amp; FACES</text><text x="62" y="106" class="r">${esc(c.role)}</text>`;
  const keys = [];
  for (const [p, frames] of Object.entries(POSES)) frames.forEach((_, i) => keys.push([p, i, frames.length > 1 ? `${p} ${'AB'[i]}` : p]));
  const cw = (W - 120) / 4;
  keys.forEach(([p, i, label], j) => {
    const col = j % 4, row = Math.floor(j / 4), x = 60 + col * cw, y = 140 + row * 420;
    b += card(x, y, cw - 20, 400);
    b += drawCharacter(c, p, null, { x: x + (cw - 20) / 2, y: y + 345, s: 1.35, frame: i });
    b += `<text x="${x + 20}" y="${y + 384}" class="l">${label.toUpperCase()}</text>`;
    b += `<text x="${x + cw - 40}" y="${y + 384}" text-anchor="end" class="k">face: ${POSES[p][i].face}</text>`;
  });
  const fy = 1000;
  b += card(60, fy, W - 140, 260);
  b += `<text x="84" y="${fy + 34}" class="l">FACES</text><text x="${W - 104}" y="${fy + 34}" text-anchor="end" class="k">talking = cycle M · A · E · O on the syllables · blink 3 frames every 2–4 s</text>`;
  const faces = ['neutral', 'happy', 'angry', 'scared', 'surprised', 'blink', 'talkM', 'talkE', 'talkA', 'talkO'];
  const fw = (W - 200) / faces.length;
  faces.forEach((e, j) => {
    const hx = 100 + fw * j + fw / 2;
    b += drawHeadOnly(c, e, { x: hx, y: fy + 140, s: 0.95 });
    b += `<text x="${hx}" y="${fy + 236}" text-anchor="middle" class="k">${e.startsWith('talk') ? 'talk ' + e.slice(4) : e}</text>`;
  });
  return svg(W, H, b);
}

async function main() {
  fs.mkdirSync(OUTDIR, { recursive: true });
  const sheets = { cast: castSheet(), 'rio-poses': leadSheet() };
  const { chromium } = require('playwright');
  const browser = await chromium.launch();
  for (const [name, s] of Object.entries(sheets)) {
    fs.writeFileSync(path.join(OUTDIR, name + '.svg'), s);
    const [, W, H] = s.match(/width="(\d+)" height="(\d+)"/);
    const page = await browser.newPage({ viewport: { width: +W, height: +H }, deviceScaleFactor: +(process.env.DPR || 1) });
    await page.setContent(`<html><body style="margin:0">${s}</body></html>`);
    await page.waitForTimeout(150);
    await page.screenshot({ path: path.join(OUTDIR, name + '.png') });
    await page.close();
    console.log('wrote', name);
  }
  await browser.close();
}
main().catch(e => { console.error(e); process.exit(1); });
