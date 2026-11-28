'use strict';
// Aureous cast: original characters drawn entirely in code as SVG.
// Style: flat 2D, big heads, simple faces, thick outlines.
//
// A character is a spec of swappable parts (head, hair, hat, face, outfit, prop, accessories)
// plus body proportions. Poses are joint angles; faces are expressions. Nothing is hand-drawn:
// change a field in CAST and every pose and face redraws.
//
//   drawCharacter(spec, pose, expr, {x, y, s, frame})  -> SVG <g>, feet on y
//   drawHeadOnly(spec, expr, {x, y, s})                -> SVG <g>, head centred on x,y
//
// Angles are degrees from straight down; positive swings toward screen-right.

const OUT = '#211D1A';   // outline colour
const OW = 4.5;          // outline width at scale 1

// ---------- tiny geometry + svg helpers ----------
const f = n => Math.round(n * 10) / 10;
const rad = d => d * Math.PI / 180;
const vec = (a, len) => [Math.sin(rad(a)) * len, Math.cos(rad(a)) * len];
const add = (p, q) => [p[0] + q[0], p[1] + q[1]];
// template tag that rounds every number: D`M${x} ${y}`
const D = (s, ...v) => s.reduce((a, str, i) => a + str + (i < v.length ? (typeof v[i] === 'number' ? f(v[i]) : v[i]) : ''), '');

function shade(hex, amt) {             // amt < 0 darker, > 0 lighter
  const n = parseInt(hex.slice(1), 16), t = amt < 0 ? 0 : 255, k = Math.abs(amt);
  const c = [n >> 16, (n >> 8) & 255, n & 255].map(x => Math.round(x + (t - x) * k));
  return '#' + ((1 << 24) | (c[0] << 16) | (c[1] << 8) | c[2]).toString(16).slice(1);
}
const shape = (d, fill, sw = OW, extra = '') =>
  `<path d="${d}" fill="${fill}" stroke="${OUT}" stroke-width="${sw}" stroke-linejoin="round" stroke-linecap="round"${extra}/>`;
const stroke = (d, w = 3, color = OUT, extra = '') =>
  `<path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"${extra}/>`;
const ell = (cx, cy, rx, ry, fill, sw = OW) =>
  `<ellipse cx="${f(cx)}" cy="${f(cy)}" rx="${f(rx)}" ry="${f(ry)}" fill="${fill}"${sw ? ` stroke="${OUT}" stroke-width="${sw}"` : ''}/>`;
const dot = (cx, cy, r, fill, extra = '') => `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" fill="${fill}"${extra}/>`;
const rr = (x, y, w, h, r, fill, sw = OW) =>
  `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" rx="${f(r)}" fill="${fill}"${sw ? ` stroke="${OUT}" stroke-width="${sw}"` : ''}/>`;
const polyD = pts => 'M' + pts.map(p => `${f(p[0])} ${f(p[1])}`).join(' L');
// thick limb with outline: outline stroke underneath, colour stroke on top
const limb = (pts, w, color) => stroke(polyD(pts), w + 2 * OW, OUT) + stroke(polyD(pts), w, color);
function part(pts, t) {                // first fraction t of a polyline (for sleeves and trouser legs)
  const out = [pts[0]];
  const L = pts.slice(1).map((p, i) => Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]));
  let want = L.reduce((a, b) => a + b, 0) * t;
  for (let i = 1; i < pts.length; i++) {
    if (want >= L[i - 1] - 1e-6) { out.push(pts[i]); want -= L[i - 1]; continue; }
    const k = want / L[i - 1];
    out.push([pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * k, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * k]);
    break;
  }
  return out;
}

// ---------- PARTS: heads ----------
// each head: sx/sy (how hair and hats stretch to fit) and its outline path for radius R
const HEADS = {
  round:  { sx: 1.00, sy: 1.00, d: R => ellD(0, 0, R, R) },
  wide:   { sx: 1.10, sy: 0.93, d: R => ellD(0, 0, R * 1.1, R * 0.93) },
  tall:   { sx: 0.90, sy: 1.07, d: R => ellD(0, 0, R * 0.9, R * 1.07) },
  square: { sx: 0.98, sy: 0.96, d: R => rrD(-R * 0.98, -R * 0.96, R * 1.96, R * 1.92, R * 0.46) },
  bean:   { sx: 1.00, sy: 1.00, d: R => D`M0 ${-R} C${R * 0.98} ${-R} ${R * 1.04} ${-R * 0.25} ${R * 1.02} ${R * 0.3} C${R * 0.98} ${R * 0.98} ${-R * 0.98} ${R * 0.98} ${-R * 1.02} ${R * 0.3} C${-R * 1.04} ${-R * 0.25} ${-R * 0.98} ${-R} 0 ${-R} Z` },
};
function ellD(cx, cy, rx, ry) { return D`M${cx - rx} ${cy} A${rx} ${ry} 0 1 0 ${cx + rx} ${cy} A${rx} ${ry} 0 1 0 ${cx - rx} ${cy} Z`; }
function rrD(x, y, w, h, r) {
  return D`M${x + r} ${y} H${x + w - r} Q${x + w} ${y} ${x + w} ${y + r} V${y + h - r} Q${x + w} ${y + h} ${x + w - r} ${y + h} H${x + r} Q${x} ${y + h} ${x} ${y + h - r} V${y + r} Q${x} ${y} ${x + r} ${y} Z`;
}

// ---------- PARTS: hair (back = behind the head, front = over it) ----------
const HAIR = {
  none: () => ({}),
  swoop: (R, c) => ({
    front: shape(D`M${-R * 1.03} ${R * 0.12} C${-R * 1.12} ${-R * 0.9} ${-R * 0.35} ${-R * 1.28} ${R * 0.35} ${-R * 1.1}
      C${R * 0.95} ${-R * 0.95} ${R * 1.12} ${-R * 0.45} ${R * 1.03} ${R * 0.08} L${R * 0.86} ${-R * 0.22}
      C${R * 0.62} ${-R * 0.5} ${R * 0.25} ${-R * 0.42} ${-R * 0.05} ${-R * 0.18} L${-R * 0.18} ${-R * 0.45}
      C${-R * 0.42} ${-R * 0.36} ${-R * 0.72} ${-R * 0.32} ${-R * 0.84} ${R * 0.12} Z`, c)
      + stroke(D`M${R * 0.15} ${-R * 0.95} Q${R * 0.55} ${-R * 0.85} ${R * 0.72} ${-R * 0.6}`, 3, shade(c, 0.25)),
  }),
  bald: (R, c) => ({
    front: shape(D`M${-R * 1.02} ${R * 0.12} C${-R * 1.16} ${-R * 0.05} ${-R * 1.08} ${-R * 0.42} ${-R * 0.86} ${-R * 0.5}
      C${-R * 0.82} ${-R * 0.3} ${-R * 0.86} ${-R * 0.05} ${-R * 0.8} ${R * 0.12} Z`, c)
      + shape(D`M${R * 1.02} ${R * 0.12} C${R * 1.16} ${-R * 0.05} ${R * 1.08} ${-R * 0.42} ${R * 0.86} ${-R * 0.5}
      C${R * 0.82} ${-R * 0.3} ${R * 0.86} ${-R * 0.05} ${R * 0.8} ${R * 0.12} Z`, c)
      + stroke(D`M${-R * 0.5} ${-R * 0.72} Q${-R * 0.25} ${-R * 0.88} ${R * 0.05} ${-R * 0.9}`, 4, 'rgba(255,255,255,.55)'),
  }),
  bangs: (R, c) => ({
    back: shape(D`M${R * 0.7} ${-R * 0.35} C${R * 1.45} ${-R * 0.45} ${R * 1.45} ${R * 0.4} ${R * 1.22} ${R * 1.05}
      C${R * 1.08} ${R * 0.6} ${R * 0.98} ${R * 0.25} ${R * 0.75} ${R * 0.05} Z`, c),
    front: shape(D`M${-R * 1.03} ${R * 0.25} C${-R * 1.08} ${-R * 1.02} ${R * 1.08} ${-R * 1.02} ${R * 1.03} ${R * 0.25}
      L${R * 0.84} ${R * 0.25} L${R * 0.8} ${-R * 0.3} Q0 ${-R * 0.44} ${-R * 0.8} ${-R * 0.3} L${-R * 0.84} ${R * 0.25} Z`, c)
      + stroke(D`M${-R * 0.35} ${-R * 0.82} Q0 ${-R * 0.92} ${R * 0.35} ${-R * 0.82}`, 3, shade(c, 0.22)),
  }),
  buzz: (R, c) => ({
    front: shape(D`M${-R * 1.02} ${R * 0.05} C${-R * 1.06} ${-R * 1.04} ${R * 1.06} ${-R * 1.04} ${R * 1.02} ${R * 0.05}
      L${R * 0.9} ${R * 0.05} C${R * 0.88} ${-R * 0.42} ${-R * 0.88} ${-R * 0.42} ${-R * 0.9} ${R * 0.05} Z`, c),
  }),
  slick: (R, c) => ({
    front: shape(D`M${-R * 1.0} ${R * 0.05} C${-R * 1.12} ${-R * 0.95} ${-R * 0.45} ${-R * 1.38} ${R * 0.3} ${-R * 1.26}
      C${R * 1.02} ${-R * 1.18} ${R * 1.16} ${-R * 0.6} ${R * 1.0} ${R * 0.05} L${R * 0.9} ${-R * 0.42}
      Q${R * 0.3} ${-R * 0.78} ${-R * 0.38} ${-R * 0.55} Q${-R * 0.8} ${-R * 0.42} ${-R * 0.88} ${R * 0.05} Z`, c)
      + stroke(D`M${-R * 0.42} ${-R * 0.58} Q${-R * 0.2} ${-R * 1.0} ${R * 0.3} ${-R * 1.12}`, 3, shade(c, -0.3))
      + stroke(D`M${R * 0.1} ${-R * 0.95} Q${R * 0.6} ${-R * 1.0} ${R * 0.82} ${-R * 0.62}`, 3.5, shade(c, 0.35)),
  }),
};

// ---------- PARTS: hats ----------
const HATS = {
  none: () => '',
  beanie: (R, c) => {
    const band = shade(c, -0.14), y0 = -R * 0.5, y1 = -R * 0.2;
    let ribs = '';
    for (let x = -R * 0.95; x < R * 0.95; x += R * 0.17) ribs += stroke(D`M${x} ${y0 + 5} V${y1 - 5}`, 2.2, shade(c, -0.3));
    return dot(0, -R * 1.12, R * 0.2, c, ` stroke="${OUT}" stroke-width="${OW}"`)
      + shape(D`M${-R * 1.04} ${-R * 0.3} C${-R * 1.06} ${-R * 1.3} ${R * 1.06} ${-R * 1.3} ${R * 1.04} ${-R * 0.3} Z`, c)
      + stroke(D`M${-R * 0.3} ${-R * 0.95} Q0 ${-R * 1.05} ${R * 0.3} ${-R * 0.95}`, 3, shade(c, 0.3))
      + rr(-R * 1.1, y0, R * 2.2, y1 - y0, 9, band) + ribs;
  },
  bucket: (R, c, acc) => {
    const crown = shape(D`M${-R * 0.8} ${-R * 0.42} L${-R * 0.64} ${-R * 1.12} Q0 ${-R * 1.26} ${R * 0.64} ${-R * 1.12} L${R * 0.8} ${-R * 0.42} Z`, c);
    const stripe = shape(D`M${-R * 0.78} ${-R * 0.5} L${-R * 0.73} ${-R * 0.68} Q0 ${-R * 0.76} ${R * 0.73} ${-R * 0.68} L${R * 0.78} ${-R * 0.5} Z`, shade(c, -0.25), 3);
    const brim = shape(D`M${-R * 1.3} ${-R * 0.16} Q${-R * 1.0} ${-R * 0.6} 0 ${-R * 0.56} Q${R * 1.0} ${-R * 0.6} ${R * 1.3} ${-R * 0.16} Q0 ${-R * 0.34} ${-R * 1.3} ${-R * 0.16} Z`, c);
    const shades = acc.includes('shadesUp')
      ? stroke(D`M${-R * 0.62} ${-R * 0.88} H${R * 0.62}`, 4) + shape(rrD(-R * 0.58, -R * 1.02, R * 0.48, R * 0.3, 7), '#2B2F38', 4)
        + shape(rrD(R * 0.1, -R * 1.02, R * 0.48, R * 0.3, 7), '#2B2F38', 4)
        + stroke(D`M${-R * 0.5} ${-R * 0.94} L${-R * 0.38} ${-R * 0.82}`, 2.5, 'rgba(255,255,255,.7)')
        + stroke(D`M${R * 0.18} ${-R * 0.94} L${R * 0.3} ${-R * 0.82}`, 2.5, 'rgba(255,255,255,.7)')
      : '';
    return crown + stripe + shades + brim;
  },
};

// ---------- PARTS: accessories over the head ----------
const ACCESSORIES = {
  headphones: (R, c) => stroke(D`M${-R * 1.0} ${-R * 0.05} C${-R * 1.08} ${-R * 1.42} ${R * 1.08} ${-R * 1.42} ${R * 1.0} ${-R * 0.05}`, 9 + 2 * OW, OUT)
    + stroke(D`M${-R * 1.0} ${-R * 0.05} C${-R * 1.08} ${-R * 1.42} ${R * 1.08} ${-R * 1.42} ${R * 1.0} ${-R * 0.05}`, 9, c)
    + rr(-R * 1.18, -R * 0.3, R * 0.36, R * 0.62, 9, '#3B3F4A') + rr(R * 0.82, -R * 0.3, R * 0.36, R * 0.62, 9, '#3B3F4A')
    + rr(-R * 1.06, -R * 0.18, R * 0.12, R * 0.38, 4, c, 0) + rr(R * 0.94, -R * 0.18, R * 0.12, R * 0.38, 4, c, 0),
};

// ---------- PARTS: outfits (drawn on the torso) ----------
// g = {tT: torso top y, wt: half width at shoulders, wb: half width at hips}
function torsoD(g) {
  const { tT, wt, wb } = g, r = 15;
  return D`M${-wb} 4 L${-wt} ${tT + r} Q${-wt} ${tT} ${-wt + r} ${tT} L${wt - r} ${tT} Q${wt} ${tT} ${wt} ${tT + r} L${wb} 4 Q0 9 ${-wb} 4 Z`;
}
const OUTFITS = {
  hoodie: (o, g) => ({
    behind: ell(0, g.tT + 3, g.wt * 0.82, 13, shade(o.color, -0.1)),
    body: shape(torsoD(g), o.color)
      + shape(D`M${-g.wb * 0.6} -2 L${-g.wb * 0.42} -22 L${g.wb * 0.42} -22 L${g.wb * 0.6} -2 Z`, shade(o.color, -0.12), 3.5)
      + stroke(D`M-6 ${g.tT + 6} V${g.tT + 22}`, 2.5) + stroke(D`M6 ${g.tT + 6} V${g.tT + 22}`, 2.5)
      + dot(-6, g.tT + 24, 2.6, OUT) + dot(6, g.tT + 24, 2.6, OUT)
      + (o.mark ? stroke(D`M-7 ${g.tT + 38} L0 ${g.tT + 30} L7 ${g.tT + 38}`, 3.5, o.mark) : ''),
  }),
  cardigan: (o, g) => ({
    body: shape(torsoD(g), o.color)
      + shape(D`M-11 ${g.tT} L-3 ${g.tT + 26} L-3 6 L3 6 L3 ${g.tT + 26} L11 ${g.tT} Z`, o.shirt, 3.5)
      + [0, 1, 2].map(i => dot(8, g.tT + 32 + i * 10, 2.8, shade(o.color, -0.35))).join('')
      + (o.bowtie ? shape(D`M0 ${g.tT + 5} L-10 ${g.tT} L-10 ${g.tT + 11} Z M0 ${g.tT + 5} L10 ${g.tT} L10 ${g.tT + 11} Z`, o.bowtie, 3) + dot(0, g.tT + 5, 3, o.bowtie, ` stroke="${OUT}" stroke-width="2.5"`) : ''),
  }),
  tee: (o, g) => ({
    body: shape(torsoD(g), o.color)
      + stroke(D`M-10 ${g.tT + 1} Q0 ${g.tT + 10} 10 ${g.tT + 1}`, 3)
      + (o.graphic ? shape(D`M3 ${g.tT + 16} L-8 ${g.tT + 34} L-1 ${g.tT + 34} L-4 ${g.tT + 48} L8 ${g.tT + 28} L1 ${g.tT + 28} Z`, o.graphic, 3) : ''),
  }),
  puffer: (o, g) => {
    let quilt = '';
    for (let y = g.tT + 14; y < -4; y += 12) quilt += stroke(D`M${-g.wt + 3} ${y} Q0 ${y + 4} ${g.wt - 3} ${y}`, 2.5, shade(o.color, -0.3));
    return {
      body: shape(torsoD(g), o.color) + quilt + stroke(D`M0 ${g.tT + 2} V4`, 3)
        + shape(rrD(-12, g.tT - 4, 24, 10, 5), shade(o.color, -0.1), 3.5),
    };
  },
  blazer: (o, g) => ({
    body: shape(torsoD(g), o.color)
      + shape(D`M-12 ${g.tT} L0 ${g.tT + 28} L12 ${g.tT} Z`, o.shirt, 3.5)
      + shape(D`M0 ${g.tT + 4} L-4 ${g.tT + 9} L-3 ${g.tT + 26} L0 ${g.tT + 31} L3 ${g.tT + 26} L4 ${g.tT + 9} Z`, o.tie, 3)
      + stroke(D`M-12 ${g.tT} L-5 ${g.tT + 32}`, 3) + stroke(D`M12 ${g.tT} L5 ${g.tT + 32}`, 3)
      + dot(0, g.tT + 40, 3, shade(o.color, -0.4))
      + shape(D`M${g.wt - 17} ${g.tT + 18} L${g.wt - 13} ${g.tT + 12} L${g.wt - 10} ${g.tT + 17} L${g.wt - 7} ${g.tT + 12} L${g.wt - 5} ${g.tT + 18} Z`, o.pocket, 2.5),
  }),
};

// ---------- PARTS: hand props (grip at 0,0; dir = 1 for a hand on the right) ----------
const PROPS = {
  none: () => '',
  phone: () => rr(-9, -28, 18, 30, 4, '#1A1B20') + rr(-5.5, -24, 11, 19, 2, '#D1A85A', 0)
    + stroke('M-3 -9 L0 -14 L2 -12 L4 -19', 2, '#26B58A'),
  mug: dir => {
    const cx = dir * 14;
    return stroke(D`M${cx - 4} -22 q3 -5 0 -9 q-3 -4 0 -8`, 2.5, 'rgba(33,29,26,.45)')
      + stroke(D`M${cx + 4} -22 q3 -5 0 -9`, 2.5, 'rgba(33,29,26,.45)')
      + stroke(D`M${cx - dir * 10} -10 q${-dir * 9} 0 ${-dir * 9} 7 q0 7 ${dir * 9} 7`, 4 + 2 * OW, OUT)
      + stroke(D`M${cx - dir * 10} -10 q${-dir * 9} 0 ${-dir * 9} 7 q0 7 ${dir * 9} 7`, 4, '#F4F0EA')
      + rr(cx - 10, -16, 20, 24, 4, '#F4F0EA') + rr(cx - 10, -8, 20, 5, 0, '#D1A85A', 0);
  },
  can: () => rr(-8, -28, 16, 32, 4, '#26B58A') + rr(-8, -28, 16, 5, 2, '#C8CDD3', 3)
    + shape('M2 -21 L-4 -11 L0 -11 L-2 -3 L4 -14 L0 -14 Z', '#F4D06F', 2),
  tablet: dir => {
    const cx = dir * 8;
    return rr(cx - 19, -36, 38, 30, 4, '#2A2D35') + rr(cx - 15, -32, 30, 22, 2, '#ECE8E1', 0)
      + stroke(D`M${cx - 12} -14 L${cx - 5} -19 L${cx + 1} -16 L${cx + 6} -26 L${cx + 12} -23`, 2.5, '#26B58A')
      + stroke(D`M${cx - 12} -27 H${cx - 4}`, 2, '#9B978F');
  },
  mic: () => rr(-4.5, -14, 9, 26, 4, '#2A2D35') + rr(-6, -17, 12, 6, 2, '#D1A85A', 3)
    + dot(0, -24, 9, '#9AA0A8', ` stroke="${OUT}" stroke-width="${OW}"`)
    + stroke('M-6 -27 H6 M-7 -22 H7 M-2 -32 V-16 M3 -32 V-16', 1.6, 'rgba(33,29,26,.55)'),
};

// ---------- FACES: expressions ----------
// eye: open | happy | closed | wide; brow: [angle (+ = inner end down, angry), lift px]; mouth: see drawMouth
const EXPRESSIONS = {
  neutral:   { eye: 'open',   brow: [0, 0],    mouth: 'neutral' },
  happy:     { eye: 'happy',  brow: [-8, 4],   mouth: 'smile', blush: 0.5 },
  angry:     { eye: 'open',   eyeH: 0.7, brow: [26, -5], mouth: 'grit', blush: 0.35 },
  scared:    { eye: 'wide',   brow: [-24, 7],  mouth: 'wavy', sweat: true },
  surprised: { eye: 'wide',   brow: [0, 11],   mouth: 'o' },
  blink:     { eye: 'closed', brow: [0, -1],   mouth: 'neutral' },
  talkM:     { eye: 'open',   brow: [0, 1],    mouth: 'M' },
  talkE:     { eye: 'open',   brow: [0, 2],    mouth: 'E' },
  talkA:     { eye: 'open',   brow: [-3, 4],   mouth: 'A' },
  talkO:     { eye: 'open',   brow: [0, 3],    mouth: 'O' },
};
// talking = cycle these mouth shapes on the beat of the line; blink = swap in 'blink' for 3 frames every 2–4 s
const TALK_CYCLE = ['talkM', 'talkA', 'talkE', 'talkO', 'talkA', 'talkM'];

const MOUTH_IN = '#6B2430', TONGUE = '#E58585';
function drawMouth(kind, x, y, k) {
  const g = s => `<g transform="translate(${f(x)} ${f(y)}) scale(${k})">${s}</g>`;
  switch (kind) {
    case 'neutral': return g(stroke('M-8 0 Q0 4 8 0', 4));
    case 'smile': return g(shape('M-14 -3 Q0 0 14 -3 Q13 17 0 17 Q-13 17 -14 -3 Z', MOUTH_IN, 3.5)
      + shape('M-7 13 Q0 7 7 13 Q0 16.5 -7 13 Z', TONGUE, 0) + shape('M-12.5 -1.6 Q0 1 12.5 -1.6 L11.8 2.4 Q0 4.6 -11.8 2.4 Z', '#fff', 0));
    case 'grit': return g(rr(-14, -6, 28, 12, 5, '#fff', 3.5) + stroke('M-13 0 H13 M-5 -5 V5 M4 -5 V5', 2.2));
    case 'wavy': return g(stroke('M-13 1 q3.25 -5 6.5 0 t6.5 0 t6.5 0 t6.5 0', 3.6));
    case 'o': return g(ell(0, 2, 7, 9, MOUTH_IN, 3.5));
    case 'M': return g(stroke('M-7 1 Q0 2.5 7 1', 4.2));
    case 'E': return g(shape('M-12 -3 Q0 -5 12 -3 Q11 6 0 6 Q-11 6 -12 -3 Z', MOUTH_IN, 3.5) + shape('M-11 -2.6 Q0 -4 11 -2.6 L10.5 0.4 Q0 -0.6 -10.5 0.4 Z', '#fff', 0));
    case 'A': return g(shape('M-10 -3 Q0 -5 10 -3 Q10 15 0 15 Q-10 15 -10 -3 Z', MOUTH_IN, 3.5) + shape('M-6 11 Q0 6 6 11 Q0 14 -6 11 Z', TONGUE, 0));
    case 'O': return g(ell(0, 2, 6, 7.5, MOUTH_IN, 3.5));
  }
  return '';
}

function drawEye(kind, x, y, look, F, e) {
  const big = F.eyes === 'bean' ? 1.18 : 1;
  const t = s => `<g transform="translate(${f(x)} ${f(y)}) scale(${big})">${s}</g>`;
  switch (kind) {
    case 'open': {
      const h = 7.6 * (e.eyeH || 1);
      return t(ell(look[0] * 0.15, 0, 5.4, h, OUT, 0) + dot(look[0] * 0.15 + 1.8, -h * 0.35, 1.9, '#fff'));
    }
    case 'happy': return t(stroke('M-6.5 2.5 Q0 -7 6.5 2.5', 4));
    case 'closed': return t(stroke('M-6.5 0 Q0 4.5 6.5 0', 4));
    case 'wide': return t(ell(0, 0, 8.6, 10.4, '#fff', 3.2) + dot(look[0] * 0.25, 0.5, 3.6, OUT));
  }
  return '';
}

// draw a head in head-local coords (centre 0,0). look = [x, y] px: where the face turns.
function drawHead(c, exprName, look = [0, 0]) {
  const e = EXPRESSIONS[exprName] || EXPRESSIONS.neutral;
  const R = c.head.r, H = HEADS[c.head.shape], F = c.face;
  const hair = HAIR[c.hair.style](R, c.hair.color);
  const scaled = s => s ? `<g transform="scale(${H.sx} ${H.sy})">${s}</g>` : '';
  const acc = c.accessories || [];
  const lx = look[0], ly = look[1];
  const ex = R * (F.eyeGap || 0.36) * H.sx, ey = R * (F.eyeY || 0.06) + ly;
  let s = '';
  s += scaled(hair.back);
  // ears
  s += ell(-R * 0.98 * H.sx + lx * 0.15, R * 0.12, 9, 11, c.skin) + ell(R * 0.98 * H.sx + lx * 0.15, R * 0.12, 9, 11, c.skin);
  s += shape(H.d(R), c.skin);
  // cheeks, beard
  const blush = Math.max(F.blush || 0, e.blush || 0);
  if (blush) for (const sx of [-1, 1]) s += ell(sx * (ex + 6) + lx, ey + R * 0.3, 8.5, 4.8, `rgba(229,87,94,${blush})`, 0);
  if (F.freckles) for (const sx of [-1, 1]) for (const [dx, dy] of [[0, 0], [6, 2], [3, 6]]) s += dot(sx * (ex - 2 + dx) + lx, ey + R * 0.24 + dy, 1.5, shade(c.skin, -0.45));
  if (F.beard) {
    s += shape(D`M${-R * 0.96 * H.sx} ${R * 0.05} C${-R * 0.98} ${R * 1.0} ${-R * 0.45} ${R * 1.32} ${lx * 0.5} ${R * 1.32}
      C${R * 0.45} ${R * 1.32} ${R * 0.98} ${R * 1.0} ${R * 0.96 * H.sx} ${R * 0.05}
      C${R * 0.8} ${R * 0.3} ${R * 0.62} ${R * 0.3} ${R * 0.5 + lx} ${R * 0.36} Q${lx} ${R * 0.2} ${-R * 0.5 + lx} ${R * 0.36}
      C${-R * 0.62} ${R * 0.3} ${-R * 0.8} ${R * 0.3} ${-R * 0.96 * H.sx} ${R * 0.05} Z`, F.beard);
  }
  // nose
  if (F.nose === 'button') s += stroke(D`M${lx - 3.5} ${ey + R * 0.24} Q${lx} ${ey + R * 0.31} ${lx + 3.5} ${ey + R * 0.24}`, 3, shade(c.skin, -0.4));
  if (F.nose === 'long') s += stroke(D`M${lx + 1} ${ey + R * 0.08} Q${lx + 6} ${ey + R * 0.28} ${lx - 1} ${ey + R * 0.32}`, 3, shade(c.skin, -0.4));
  if (F.nose === 'round') s += ell(lx, ey + R * 0.27, 6.5, 5, shade(c.skin, -0.1), 3);
  // mouth (over beard)
  const my = R * (F.mouthY || 0.52) + ly;
  if (F.moustache) s += shape(D`M${lx} ${my - 9} C${lx + 8} ${my - 14} ${lx + 18} ${my - 9} ${lx + 17} ${my - 3} C${lx + 10} ${my - 6} ${lx + 4} ${my - 5} ${lx} ${my - 4} C${lx - 4} ${my - 5} ${lx - 10} ${my - 6} ${lx - 17} ${my - 3} C${lx - 18} ${my - 9} ${lx - 8} ${my - 14} ${lx} ${my - 9} Z`, F.moustache, 3);
  s += drawMouth(e.mouth, lx * 0.9, my + (F.moustache ? 3 : 0), F.mouthScale || 1);
  // eyes + brows
  for (const side of [-1, 1]) {
    const x = side * ex + lx;
    s += drawEye(e.eye, x, ey, look, F, e);
    const [ang, lift] = e.brow, bw = F.browW || 4.5, bl = F.browLen || 14;
    const by = ey - 15 - (F.eyes === 'bean' ? 2 : 0) - lift + (F.glasses ? -3 : 0);
    s += `<g transform="translate(${f(x)} ${f(by)}) rotate(${f(side * -ang)})">${stroke(D`M${-bl / 2} 0 H${bl / 2}`, bw, F.browColor || OUT)}</g>`;
  }
  // glasses
  if (F.glasses === 'round') s += ell(-ex + lx, ey, 13, 12, 'rgba(255,255,255,.18)', 3.5) + ell(ex + lx, ey, 13, 12, 'rgba(255,255,255,.18)', 3.5) + stroke(D`M${-ex + lx + 13} ${ey - 2} Q${lx} ${ey - 7} ${ex + lx - 13} ${ey - 2}`, 3.5);
  if (F.glasses === 'square') s += shape(rrD(-ex + lx - 13, ey - 10, 26, 19, 6), 'rgba(255,255,255,.18)', 3.5) + shape(rrD(ex + lx - 13, ey - 10, 26, 19, 6), 'rgba(255,255,255,.18)', 3.5) + stroke(D`M${-ex + lx + 13} ${ey - 3} H${ex + lx - 13}`, 3.5);
  if (e.sweat) s += shape(D`M${R * 0.78} ${-R * 0.42} Q${R * 0.78 + 6.5} ${-R * 0.42 + 10} ${R * 0.78 + 6} ${-R * 0.42 + 14} A6 6 0 0 1 ${R * 0.78 - 6} ${-R * 0.42 + 14} Q${R * 0.78 - 6.5} ${-R * 0.42 + 10} ${R * 0.78} ${-R * 0.42} Z`, '#8FD0F2', 3);
  s += scaled(hair.front);
  s += scaled(HATS[c.hat.style](R, c.hat.color, acc));
  for (const a of acc) if (ACCESSORIES[a]) s += scaled(ACCESSORIES[a](R, c.accessoryColor || '#ECE8E1'));
  return s;
}

// ---------- POSES ----------
// view: front | side (3/4, facing right). legs/arms: [upper, lower] absolute angles.
// hands: fist | point | open | spread. prop: which hand holds the prop. air: px off the ground.
// shrug: shoulders up. armsOver: draw arms over the head (hands by the face).
// walk and run have two keys each (A = contact/stride, B = passing); mirror them for the other foot.
const POSES = {
  stand: [{ view: 'front', legs: { L: [-2, -2], R: [2, 2] }, arms: { L: [-10, -5], R: [10, 5] }, prop: 'R', face: 'neutral' }],
  walk: [
    { view: 'side', lean: 4, legs: { L: [-22, -40], R: [24, 14] }, arms: { L: [24, 50], R: [-24, -8] }, prop: 'L', face: 'happy' },
    { view: 'side', lean: 3, legs: { L: [14, -28], R: [-2, -2] }, arms: { L: [4, 22], R: [-4, 8] }, prop: 'L', face: 'happy', air: 3 },
  ],
  run: [
    { view: 'side', lean: 13, legs: { L: [-38, -95], R: [68, 8] }, arms: { L: [55, 140], R: [-50, 35] }, prop: 'L', face: 'scared', air: 10 },
    { view: 'side', lean: 13, legs: { L: [62, 4], R: [-34, -88] }, arms: { L: [-50, 35], R: [55, 140] }, prop: 'L', face: 'scared', air: 4 },
  ],
  point: [{ view: 'front', tilt: 4, look: [9, -2], legs: { L: [-7, -7], R: [9, 4] }, arms: { L: [-12, -6], R: [92, 98] }, hands: { R: 'point' }, prop: 'L', face: 'happy' }],
  shrug: [{ view: 'front', tilt: -8, shrug: true, legs: { L: [-3, -3], R: [3, 3] }, arms: { L: [-18, -100], R: [18, 100] }, hands: { L: 'open', R: 'open' }, prop: 'none', face: 'neutral' }],
  surprised: [{ view: 'front', lean: -5, air: 12, armsOver: true, legs: { L: [-14, -6], R: [14, 6] }, arms: { L: [-122, -168], R: [122, 168] }, hands: { L: 'spread', R: 'spread' }, prop: 'none', face: 'surprised' }],
};
const POSE_NAMES = Object.keys(POSES);

const BODY = { legs: 54, torso: 56, wTop: 42, wBot: 46, arm: 50, limb: 12 };

function drawHand(kind, at, foreAng, skin) {
  const dirv = vec(foreAng, 1);
  if (kind === 'point') return limb([at, add(at, [dirv[0] * 13, dirv[1] * 13])], 6, skin) + dot(at[0], at[1], 8.5, skin, ` stroke="${OUT}" stroke-width="${OW}"`);
  if (kind === 'spread') {
    let s = '';
    for (const da of [-55, -18, 18, 55]) { const d = vec(foreAng + da, 12); s += limb([at, add(at, d)], 5, skin); }
    return s + dot(at[0], at[1], 8.5, skin, ` stroke="${OUT}" stroke-width="${OW}"`) + dot(at[0], at[1], 8.5 - OW / 2, skin);
  }
  if (kind === 'open') return limb([at, add(at, vec(foreAng - 70, 9))], 5, skin) + ell(at[0], at[1], 9.5, 7.5, skin);
  return dot(at[0], at[1], 8.5, skin, ` stroke="${OUT}" stroke-width="${OW}"`);
}

function drawCharacter(c, poseName, exprName, opt = {}) {
  const P = POSES[poseName][opt.frame || 0], B = { ...BODY, ...c.body };
  const side = P.view === 'side', o = c.outfit;
  const g = { tT: -B.torso, wt: B.wTop / 2 * (side ? 0.8 : 1), wb: B.wBot / 2 * (side ? 0.82 : 1) };
  const hipX = side ? 4 : 11;
  const back = col => (side ? shade(col, -0.16) : col);

  // legs (hip at 0,0)
  const legs = {};
  for (const s of ['L', 'R']) {
    const hip = [s === 'L' ? -hipX : hipX, -2], [a1, a2] = P.legs[s];
    const knee = add(hip, vec(a1, B.legs / 2)), foot = add(knee, vec(a2, B.legs / 2));
    legs[s] = { pts: [hip, knee, foot], a2 };
  }
  const lowest = Math.max(legs.L.pts[2][1], legs.R.pts[2][1]);
  const dy = -(lowest + 8) - (P.air || 0);
  const drawLeg = s => {
    const L = legs[s], isBack = side && s === 'L', foot = L.pts[2];
    const skin = isBack ? back(c.skin) : c.skin, pants = isBack ? back(o.pants) : o.pants, shoe = isBack ? back(o.shoes) : o.shoes;
    let out = limb(L.pts, B.limb + 2, skin) + limb(part(L.pts, o.pantsLen || 1), B.limb + 4, pants);
    const toe = side ? 1 : (s === 'L' ? -1 : 1), rot = side ? -L.a2 * 0.45 : 0;
    out += `<g transform="translate(${f(foot[0])} ${f(foot[1] + 2)}) rotate(${f(rot)})">`
      + shape(D`M${-9 * toe} 6 Q${-11 * toe} -6 ${1 * toe} -6 Q${13 * toe} -5 ${14 * toe} 6 Z`, shoe)
      + stroke(D`M${-8 * toe} 3.5 H${13 * toe}`, 2.5, o.sole || '#F4F0EA') + '</g>';
    return out;
  };

  // upper body (rotated by lean around the hip)
  const lift = P.shrug ? 7 : 0;
  const shoulder = s => side ? [s === 'L' ? 3 : -2, g.tT + 13 - lift] : [s === 'L' ? -(g.wt - 5) : g.wt - 5, g.tT + 13 - lift];
  const drawArm = s => {
    const isBack = side && s === 'L';
    const sh = shoulder(s), [a1, a2] = P.arms[s];
    const el = add(sh, vec(a1, B.arm / 2)), hand = add(el, vec(a2, B.arm / 2));
    const skin = isBack ? back(c.skin) : c.skin, sleeve = isBack ? back(o.sleeveColor || o.color) : (o.sleeveColor || o.color);
    let out = limb([sh, el, hand], B.limb, skin) + limb(part([sh, el, hand], o.sleeve ?? 0.88), B.limb + 3, sleeve);
    const holds = P.prop === s && c.prop !== 'none';
    if (holds) out += `<g transform="translate(${f(hand[0])} ${f(hand[1])})">${PROPS[c.prop](s === 'L' ? -1 : 1)}</g>`;
    out += drawHand((P.hands && P.hands[s]) || 'fist', hand, a2, skin);
    return out;
  };
  const outfit = OUTFITS[o.type](o, g);
  const look = P.look || (side ? [11, 0] : [0, 0]);
  const headY = g.tT - c.head.r * (HEADS[c.head.shape].sy * 0.8) + (P.shrug ? 5 : 0);
  const head = `<g transform="rotate(${P.tilt || 0} 0 ${g.tT}) translate(${side ? 4 : 0} ${f(headY)})">${drawHead(c, exprName || P.face, look)}</g>`;
  const up = s => `<g transform="rotate(${P.lean || 0} 0 0)">${s}</g>`;

  let s = '';
  if (side) s += up(drawArm('L'));
  s += drawLeg('L') + drawLeg('R');
  s += up(outfit.behind || '') + up(outfit.body);
  if (side) s += up(head) + up(drawArm('R'));
  else if (P.armsOver) s += up(head) + up(drawArm('L') + drawArm('R'));
  else s += up(drawArm('L') + drawArm('R')) + up(head);

  const { x = 0, y = 0, s: k = 1 } = opt;
  const shadowW = 46 * (1 - Math.min(P.air || 0, 20) / 40);
  return `<g transform="translate(${f(x)} ${f(y)}) scale(${k})">`
    + (opt.shadow === false ? '' : ell(0, 1, shadowW, 7, 'rgba(33,29,26,.13)', 0))
    + `<g transform="translate(0 ${f(dy)})">${s}</g></g>`;
}

function drawHeadOnly(c, exprName, opt = {}) {
  const { x = 0, y = 0, s: k = 1 } = opt;
  return `<g transform="translate(${f(x)} ${f(y)}) scale(${k})">${drawHead(c, exprName, opt.look || [0, 0])}</g>`;
}

// ---------- CAST ----------
const CAST = [
  {
    id: 'rio', name: 'Rio', lead: true,
    role: 'The new trader. Curious, over-eager, learns every lesson live on camera.',
    skin: '#C98F65',
    head: { shape: 'round', r: 54 },
    hair: { style: 'swoop', color: '#2B1D16' },
    hat: { style: 'beanie', color: '#D1A85A' },
    face: { eyes: 'bean', nose: 'button', freckles: true, browW: 5 },
    outfit: { type: 'hoodie', color: '#2F7A6C', mark: '#D1A85A', pants: '#2C3550', shoes: '#F4F0EA', sole: '#D1A85A' },
    prop: 'phone',
    body: {},
  },
  {
    id: 'sage', name: 'Sage',
    role: 'The old hand. Has lived through every crash. Calm, dry, never without coffee.',
    skin: '#F0C9A8',
    head: { shape: 'wide', r: 53 },
    hair: { style: 'bald', color: '#E9E4DA' },
    hat: { style: 'none' },
    face: { eyes: 'dot', nose: 'round', glasses: 'round', beard: '#E9E4DA', moustache: '#E9E4DA', browW: 6, browColor: '#BDB6AA', mouthY: 0.6 },
    outfit: { type: 'cardigan', color: '#8C3B47', shirt: '#E9E2D2', bowtie: '#D1A85A', pants: '#6B6157', shoes: '#4A3428' },
    prop: 'mug',
    body: { legs: 44, torso: 54, wTop: 46, wBot: 54 },
  },
  {
    id: 'vee', name: 'Vee',
    role: 'The degen. 100x or nothing. Loud, lucky, liquidated by lunch.',
    skin: '#7A4A30',
    head: { shape: 'bean', r: 52 },
    hair: { style: 'buzz', color: '#1C1412' },
    hat: { style: 'bucket', color: '#E5575E' },
    accessories: ['shadesUp'],
    face: { eyes: 'bean', nose: 'button', blush: 0.25, mouthScale: 1.15 },
    outfit: { type: 'tee', color: '#F4D06F', graphic: '#211D1A', sleeve: 0.42, pants: '#5B6B3A', pantsLen: 0.55, shoes: '#E5575E' },
    prop: 'can',
    body: { legs: 58, torso: 52 },
  },
  {
    id: 'nox', name: 'Nox',
    role: 'The quant. Reads the data, not the hype. Quiet, precise, usually right.',
    skin: '#E8B98F',
    head: { shape: 'tall', r: 51 },
    hair: { style: 'bangs', color: '#2A2233' },
    hat: { style: 'none' },
    accessories: ['headphones'],
    accessoryColor: '#ECE8E1',
    face: { eyes: 'dot', nose: 'long', glasses: 'square', browW: 4 },
    outfit: { type: 'puffer', color: '#5468A8', sleeveColor: '#D9D4CB', sleeve: 0.9, pants: '#2A2D35', shoes: '#ECE8E1' },
    prop: 'tablet',
    body: { legs: 62, torso: 58, wTop: 36, wBot: 40 },
  },
  {
    id: 'duke', name: 'Duke',
    role: 'The guru. Posts huge calls, rarely right, never sorry.',
    skin: '#E2A77F',
    head: { shape: 'square', r: 54 },
    hair: { style: 'slick', color: '#C4874A' },
    hat: { style: 'none' },
    face: { eyes: 'dot', nose: 'button', browW: 6, browColor: '#8E5A2B', mouthY: 0.56 },
    outfit: { type: 'blazer', color: '#4B3A7A', shirt: '#F4F0EA', tie: '#D1A85A', pocket: '#D1A85A', pants: '#4B3A7A', shoes: '#3A2A1E', sole: '#3A2A1E' },
    prop: 'mic',
    body: { legs: 52, torso: 62, wTop: 56, wBot: 44 },
  },
];

module.exports = { CAST, POSES, POSE_NAMES, EXPRESSIONS, TALK_CYCLE, HEADS, HAIR, HATS, ACCESSORIES, OUTFITS, PROPS, drawCharacter, drawHeadOnly, OUT };
