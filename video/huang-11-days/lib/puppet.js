// Puppet rig for "The Day Email Stopped".
// Every character is a spec of swappable parts (head, hair/hat, face, outfit, prop).
// renderCharacter(spec, opts) returns an SVG <g> string with feet on y=0, centred on x=0.
// Works in Node (module.exports) and in the browser (globalThis.Puppet).

(function () {
  const INK = '#1d1a24';
  const OW = 6; // outline width

  const rad = (d) => (d * Math.PI) / 180;
  const f = (n) => (Math.round(n * 10) / 10).toString();
  const end = (x, y, ang, len) => [x + len * Math.sin(rad(ang)), y + len * Math.cos(rad(ang))];

  function shade(hex, k) {
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    const m = (c) => Math.max(0, Math.min(255, Math.round(k < 0 ? c * (1 + k) : c + (255 - c) * k)));
    return '#' + [m(r), m(g), m(b)].map((c) => c.toString(16).padStart(2, '0')).join('');
  }

  function strokePath(pts, w, color) {
    const d = 'M' + pts.map((p) => f(p[0]) + ' ' + f(p[1])).join(' L');
    return (
      `<path d="${d}" fill="none" stroke="${INK}" stroke-width="${w + OW * 2}" stroke-linecap="round" stroke-linejoin="round"/>` +
      `<path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`
    );
  }

  // ---------------------------------------------------------------- poses
  // Angles: 0 = straight down, +90 = forward (+x, the way the character faces), 180 = up.
  // Arms/legs: [upper, lower] absolute angles. L = far side (drawn behind), R = near side.
  const POSES = {
    stand: { lean: 0, bob: 0, armL: [-9, -4], armR: [9, 14], legL: [-4, -3], legR: [4, 3], head: 0 },
    walk: { lean: 3, bob: 0, armL: [22, 34], armR: [-22, -10], legL: [-20, -38], legR: [24, 8], head: 2 },
    run: { lean: 14, bob: -16, armL: [55, 140], armR: [-50, 35], legL: [-30, -105], legR: [70, 4], head: 4 },
    point: { lean: -3, bob: 0, armL: [-38, 40], armR: [93, 93], legL: [-6, -4], legR: [8, 5], head: -4, handR: 'point', propHand: 'L' },
    shrug: { lean: 0, bob: 0, lift: 12, armL: [-32, -105], armR: [32, 105], legL: [-5, -3], legR: [5, 3], head: 9, handL: 'open', handR: 'open', propHand: 'none' },
    surprised: { lean: -8, bob: -14, armL: [-150, -170], armR: [150, 170], legL: [-14, -6], legR: [14, 6], head: -6, handL: 'open', handR: 'open', propHand: 'none' },
  };

  // Continuous cycles for animation (phase in turns, 0..1).
  // Phase runs backwards inside these so the planted (straight) leg sweeps back while the bent leg swings
  // forward; the first version had them the other way round, which made the feet moonwalk.
  function walkPose(phase) {
    phase = -phase;
    const s = Math.sin(phase * 2 * Math.PI);
    const c = Math.cos(phase * 2 * Math.PI);
    const k = (x) => Math.max(0, x);
    return {
      lean: 3, bob: -Math.abs(c) * 6 + 3, head: 2,
      armL: [24 * s, 24 * s + 14], armR: [-24 * s, -24 * s + 14],
      legL: [-24 * s, -24 * s - 30 * k(c)], legR: [24 * s, 24 * s - 30 * k(-c)],
    };
  }
  function runPose(phase) {
    phase = -phase;
    const s = Math.sin(phase * 2 * Math.PI);
    const c = Math.cos(phase * 2 * Math.PI);
    const k = (x) => Math.max(0, x);
    return {
      lean: 12, bob: -14 - Math.abs(s) * 10, head: 4,
      armL: [50 * s, 50 * s + 90], armR: [-50 * s, -50 * s + 90],
      legL: [48 * s, 48 * s - 80 * k(-s) - 20], legR: [-48 * s, -48 * s - 80 * k(s) - 20],
    };
  }

  // ---------------------------------------------------------------- faces
  const EXPR = {
    neutral: { eyes: 'open', open: 1, pupil: 1, brow: 0, raise: 0, mouth: 'smallSmile' },
    happy: { eyes: 'arc', open: 1, pupil: 1, brow: -2, raise: 5, mouth: 'grin' },
    angry: { eyes: 'open', open: 0.72, pupil: 1, brow: 14, raise: -4, mouth: 'grit' },
    scared: { eyes: 'open', open: 1.25, pupil: 0.55, brow: -12, raise: 9, mouth: 'wobble' },
    surprised: { eyes: 'open', open: 1.3, pupil: 0.6, brow: -4, raise: 14, mouth: 'O' },
    blink: { eyes: 'closed', open: 1, pupil: 1, brow: 0, raise: 0, mouth: 'smallSmile' },
    talkA: { eyes: 'open', open: 1, pupil: 1, brow: 0, raise: 3, mouth: 'talkA' },
    talkB: { eyes: 'open', open: 1, pupil: 1, brow: 0, raise: 1, mouth: 'talkB' },
    worried: { eyes: 'open', open: 1.15, pupil: 1.0, brow: -10, raise: 7, mouth: 'wobble' },   // scared, but with full-size pupils so the eyeline reads
    shriek: { eyes: 'open', open: 1.35, pupil: 0.45, brow: 16, raise: 8, mouth: 'shriek' },   // added for beat 1: a full-volume scream
  };

  function drawEye(fc, side, e, look) {
    const cx = side * fc.eyeDX, cy = fc.eyeY;
    const rx = fc.eyeRx, ry = fc.eyeRy * e.open;
    const led = fc.style === 'led';
    const col = led ? fc.ledColor : INK;
    if (e.eyes === 'closed') {
      return `<path d="M${f(cx - rx)} ${f(cy)} Q${f(cx)} ${f(cy + ry * 0.55)} ${f(cx + rx)} ${f(cy)}" fill="none" stroke="${col}" stroke-width="5" stroke-linecap="round"/>`;
    }
    if (e.eyes === 'arc') {
      return `<path d="M${f(cx - rx)} ${f(cy + 3)} Q${f(cx)} ${f(cy - ry * 1.3)} ${f(cx + rx)} ${f(cy + 3)}" fill="none" stroke="${col}" stroke-width="6" stroke-linecap="round"/>`;
    }
    if (led) {
      return `<rect x="${f(cx - rx)}" y="${f(cy - ry)}" width="${f(rx * 2)}" height="${f(ry * 2)}" rx="${f(Math.min(rx, ry) * 0.6)}" fill="${fc.ledColor}"/>` +
        `<rect x="${f(cx - rx * 0.5)}" y="${f(cy - ry * 0.7)}" width="${f(rx * 0.5)}" height="${f(ry * 0.5)}" rx="3" fill="#ffffff" opacity="0.7"/>`;
    }
    const pr = rx * 0.52 * e.pupil;
    const px = cx + look * rx * 0.35;
    return `<ellipse cx="${f(cx)}" cy="${f(cy)}" rx="${f(rx)}" ry="${f(ry)}" fill="#ffffff" stroke="${INK}" stroke-width="4"/>` +
      `<circle cx="${f(px)}" cy="${f(cy + ry * 0.08)}" r="${f(pr)}" fill="${INK}"/>` +
      `<circle cx="${f(px + pr * 0.35)}" cy="${f(cy - pr * 0.3)}" r="${f(Math.max(2, pr * 0.32))}" fill="#ffffff"/>`;
  }

  function drawBrow(fc, side, e) {
    if (fc.noBrows) return '';
    const cx = side * fc.eyeDX;
    const cy = fc.eyeY - fc.eyeRy * Math.max(1, e.open) - 12 - e.raise;
    const bl = fc.eyeRx * 1.05;
    const inner = [cx - side * bl, cy + e.brow * 0.5];
    const outer = [cx + side * bl, cy - e.brow * 0.5];
    const col = fc.style === 'led' ? fc.ledColor : fc.browColor || INK;
    return `<path d="M${f(outer[0])} ${f(outer[1])} Q${f(cx)} ${f(cy - 5 - Math.abs(e.brow) * 0.1)} ${f(inner[0])} ${f(inner[1])}" fill="none" stroke="${col}" stroke-width="${fc.browW || 6}" stroke-linecap="round"/>`;
  }

  function drawMouth(fc, m) {
    const y = fc.mouthY, s = fc.mouthScale || 1;
    const led = fc.style === 'led';
    const line = led ? fc.ledColor : INK;
    const dark = led ? shade(fc.ledColor, -0.55) : '#5a1f2b';
    const g = (inner) => `<g transform="translate(0 ${f(y)}) scale(${s})">${inner}</g>`;
    switch (m) {
      case 'smallSmile':
        return g(`<path d="M-15 -2 Q0 10 15 -2" fill="none" stroke="${line}" stroke-width="5" stroke-linecap="round"/>`);
      case 'grin':
        return g(`<path d="M-26 -5 Q0 34 26 -5 Z" fill="${dark}" stroke="${line}" stroke-width="5" stroke-linejoin="round"/>` +
          (led ? '' : `<path d="M-20 -3 L20 -3 L17 4 L-17 4 Z" fill="#fff"/><ellipse cx="2" cy="15" rx="9" ry="5" fill="#e0707a"/>`));
      case 'frown':
        return g(`<path d="M-17 7 Q0 -6 17 7" fill="none" stroke="${line}" stroke-width="5" stroke-linecap="round"/>`);
      case 'grit':
        return g(`<rect x="-22" y="-8" width="44" height="18" rx="6" fill="${led ? dark : '#fff'}" stroke="${line}" stroke-width="5"/>` +
          `<path d="M-20 1 L20 1 M-8 -8 L-8 10 M7 -8 L7 10" stroke="${line}" stroke-width="3"/>`);
      case 'wobble':
        return g(`<path d="M-20 3 q5 -8 10 0 t10 0 t10 0 t10 0" fill="none" stroke="${line}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`);
      case 'O':
        return g(`<ellipse cx="0" cy="4" rx="11" ry="15" fill="${dark}" stroke="${line}" stroke-width="5"/>`);
      case 'talkA':
        return g(`<path d="M-17 -4 Q0 -8 17 -4 Q16 20 0 21 Q-16 20 -17 -4 Z" fill="${dark}" stroke="${line}" stroke-width="5" stroke-linejoin="round"/>` +
          (led ? '' : `<ellipse cx="0" cy="13" rx="9" ry="5" fill="#e0707a"/>`));
      case 'shriek':
        return g(`<path d="M-30 -10 L30 -10 L22 26 Q0 34 -22 26 Z" fill="${dark}" stroke="${line}" stroke-width="5" stroke-linejoin="round"/>` +
          (led ? '' : `<path d="M-27 -8 L27 -8 L25 -1 L-25 -1 Z" fill="#fff"/><path d="M-16 24 L16 24 L13 19 L-13 19 Z" fill="#fff"/><ellipse cx="0" cy="13" rx="11" ry="5" fill="#e0707a"/>`));
      case 'talkB':
        return g(`<ellipse cx="0" cy="2" rx="11" ry="7" fill="${dark}" stroke="${line}" stroke-width="5"/>`);
      default:
        return '';
    }
  }

  function drawFace(spec, exprName, look, skipBrows) {
    const fc = spec.face;
    const e = EXPR[exprName] || EXPR.neutral;
    let s = '';
    if (fc.blush) {
      s += `<ellipse cx="${f(-fc.eyeDX - 6)}" cy="${f(fc.eyeY + fc.eyeRy + 14)}" rx="13" ry="7" fill="${fc.blush}" opacity="0.55"/>`;
      s += `<ellipse cx="${f(fc.eyeDX + 6)}" cy="${f(fc.eyeY + fc.eyeRy + 14)}" rx="13" ry="7" fill="${fc.blush}" opacity="0.55"/>`;
    }
    if (fc.freckles) {
      for (const sd of [-1, 1]) for (const [dx, dy] of [[0, 0], [9, 4], [-6, 7]])
        s += `<circle cx="${f(sd * (fc.eyeDX + 2) + dx)}" cy="${f(fc.eyeY + fc.eyeRy + 10 + dy)}" r="2.2" fill="${fc.freckles}"/>`;
    }
    if (fc.bags && e.eyes !== 'closed') {
      for (const sd of [-1, 1]) {
        const cx = sd * fc.eyeDX, cy = fc.eyeY + fc.eyeRy * e.open + 5;
        s += `<path d="M${f(cx - fc.eyeRx * 0.8)} ${f(cy)} Q${f(cx)} ${f(cy + 9)} ${f(cx + fc.eyeRx * 0.8)} ${f(cy)}" fill="none" stroke="${fc.bags}" stroke-width="4" stroke-linecap="round"/>`;
      }
    }
    s += drawEye(fc, -1, e, look) + drawEye(fc, 1, e, look);
    if (!skipBrows) s += drawBrow(fc, -1, e) + drawBrow(fc, 1, e);
    if (fc.nose) s += `<path d="M${f(look * 4 - 2)} ${f(fc.eyeY + fc.eyeRy + 4)} q${f(6 + look * 3)} 9 0 14" fill="none" stroke="${shade(spec.skin, -0.35)}" stroke-width="4" stroke-linecap="round"/>`;
    s += drawMouth(fc, e.mouth);
    if (fc.mustache) {
      const y = fc.mouthY - 9;
      s += `<path d="M0 ${f(y - 4)} C-10 ${f(y - 10)} -30 ${f(y - 8)} -38 ${f(y + 6)} C-26 ${f(y + 2)} -12 ${f(y + 6)} 0 ${f(y + 2)} C12 ${f(y + 6)} 26 ${f(y + 2)} 38 ${f(y + 6)} C30 ${f(y - 8)} 10 ${f(y - 10)} 0 ${f(y - 4)} Z" fill="${fc.mustache}" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>`;
    }
    return s;
  }

  // ---------------------------------------------------------------- parts
  // Hair & hats are drawn in head-local coordinates (head centre at 0,0; R = head radius).
  const HAIR = {
    bun: {
      back: (R, c) => `<circle cx="${f(R * 0.12)}" cy="${f(-R * 1.02)}" r="${f(R * 0.4)}" fill="${c}" stroke="${INK}" stroke-width="${OW}"/>` +
        `<path d="M${f(-R * 0.2)} ${f(-R * 0.8)} q${f(R * 0.3)} ${f(-R * 0.18)} ${f(R * 0.6)} 0" fill="none" stroke="${shade(c, 0.25)}" stroke-width="5" stroke-linecap="round"/>`,
      front: (R, c) =>
        `<path d="M${f(-R * 0.99)} ${f(R * 0.05)} C${f(-R * 1.08)} ${f(-R * 1.36)} ${f(R * 1.08)} ${f(-R * 1.38)} ${f(R * 0.99)} ${f(R * 0.02)} ` +
        `C${f(R * 0.86)} ${f(-R * 0.4)} ${f(R * 0.55)} ${f(-R * 0.62)} ${f(R * 0.1)} ${f(-R * 0.64)} ` +
        `C${f(-R * 0.1)} ${f(-R * 0.5)} ${f(-R * 0.5)} ${f(-R * 0.6)} ${f(-R * 0.72)} ${f(-R * 0.62)} ` +
        `C${f(-R * 0.88)} ${f(-R * 0.45)} ${f(-R * 0.95)} ${f(-R * 0.2)} ${f(-R * 0.99)} ${f(R * 0.05)} Z" fill="${c}" stroke="${INK}" stroke-width="${OW}" stroke-linejoin="round"/>` +
        `<path d="M${f(-R * 0.15)} ${f(-R * 0.88)} q${f(R * 0.4)} ${f(-R * 0.06)} ${f(R * 0.62)} ${f(R * 0.2)}" fill="none" stroke="${shade(c, 0.25)}" stroke-width="5" stroke-linecap="round"/>`,
    },
    messy: {
      back: () => '',
      front: (R, c) => {
        const pts = [[-1.0, 0.0], [-1.12, -0.42], [-0.86, -0.55], [-0.98, -0.92], [-0.55, -0.85], [-0.5, -1.22], [-0.12, -0.98], [0.12, -1.3], [0.38, -0.98], [0.75, -1.18], [0.74, -0.8], [1.12, -0.78], [0.94, -0.45], [1.1, -0.1], [0.98, 0.04],
          [0.82, -0.32], [0.5, -0.42], [0.42, -0.6], [0.1, -0.44], [-0.15, -0.62], [-0.38, -0.42], [-0.66, -0.52], [-0.78, -0.22]];
        const d = 'M' + pts.map(([x, y]) => f(x * R) + ' ' + f(y * R)).join(' L') + ' Z';
        return `<path d="${d}" fill="${c}" stroke="${INK}" stroke-width="${OW}" stroke-linejoin="round"/>`;
      },
    },
    fringe: {
      back: () => '',
      front: (R, c) =>
        [-1, 1].map((sd) =>
          `<path d="M${f(sd * R * 0.98)} ${f(R * 0.12)} C${f(sd * R * 1.14)} ${f(-R * 0.1)} ${f(sd * R * 1.1)} ${f(-R * 0.42)} ${f(sd * R * 0.86)} ${f(-R * 0.52)} C${f(sd * R * 0.8)} ${f(-R * 0.3)} ${f(sd * R * 0.78)} ${f(-R * 0.05)} ${f(sd * R * 0.98)} ${f(R * 0.12)} Z" fill="${c}" stroke="${INK}" stroke-width="${OW - 1}" stroke-linejoin="round"/>`
        ).join('') +
        `<path d="M${f(-R * 0.25)} ${f(-R * 0.88)} q${f(R * 0.25)} ${f(-R * 0.2)} ${f(R * 0.5)} ${f(-R * 0.02)}" fill="none" stroke="${INK}" stroke-width="4" stroke-linecap="round"/>` +
        `<ellipse cx="${f(-R * 0.4)}" cy="${f(-R * 0.62)}" rx="${f(R * 0.16)}" ry="${f(R * 0.08)}" fill="#ffffff" opacity="0.35"/>`,
    },
  };

  const ACCESSORY = {
    headset: (R, spec) =>
      `<path d="M${f(-R * 1.0)} ${f(R * 0.05)} C${f(-R * 1.1)} ${f(-R * 1.45)} ${f(R * 1.1)} ${f(-R * 1.45)} ${f(R * 1.0)} ${f(R * 0.05)}" fill="none" stroke="${INK}" stroke-width="16" stroke-linecap="round"/>` +
      `<path d="M${f(-R * 1.0)} ${f(R * 0.05)} C${f(-R * 1.1)} ${f(-R * 1.45)} ${f(R * 1.1)} ${f(-R * 1.45)} ${f(R * 1.0)} ${f(R * 0.05)}" fill="none" stroke="#3b3f4a" stroke-width="8" stroke-linecap="round"/>` +
      `<rect x="${f(R * 0.86)}" y="${f(-R * 0.18)}" width="${f(R * 0.32)}" height="${f(R * 0.46)}" rx="10" fill="#3b3f4a" stroke="${INK}" stroke-width="${OW}"/>` +
      `<rect x="${f(-R * 1.18)}" y="${f(-R * 0.18)}" width="${f(R * 0.32)}" height="${f(R * 0.46)}" rx="10" fill="#3b3f4a" stroke="${INK}" stroke-width="${OW}"/>` +
      `<path d="M${f(R * 1.0)} ${f(R * 0.25)} Q${f(R * 0.95)} ${f(R * 0.75)} ${f(R * 0.4)} ${f(R * 0.72)}" fill="none" stroke="${INK}" stroke-width="9" stroke-linecap="round"/>` +
      `<path d="M${f(R * 1.0)} ${f(R * 0.25)} Q${f(R * 0.95)} ${f(R * 0.75)} ${f(R * 0.4)} ${f(R * 0.72)}" fill="none" stroke="#3b3f4a" stroke-width="4" stroke-linecap="round"/>` +
      `<circle cx="${f(R * 0.36)}" cy="${f(R * 0.72)}" r="8" fill="#e85d4a" stroke="${INK}" stroke-width="4"/>`,
  };

  // Hats for headless (appliance) characters sit on the torso top; coords: (0, 0) = top centre.
  const HAT = {
    doorman: (w) =>
      `<path d="M${f(-w * 0.36)} 4 L${f(-w * 0.42)} -62 Q0 -84 ${f(w * 0.42)} -62 L${f(w * 0.36)} 4 Z" fill="#8e2b3a" stroke="${INK}" stroke-width="${OW}" stroke-linejoin="round"/>` +
      `<rect x="${f(-w * 0.39)}" y="-22" width="${f(w * 0.78)}" height="14" fill="#e9b949" stroke="${INK}" stroke-width="4"/>` +
      `<ellipse cx="0" cy="6" rx="${f(w * 0.46)}" ry="11" fill="${INK}"/>` +
      `<path d="M-12 -48 L0 -60 L12 -48 L0 -36 Z" fill="#e9b949" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>`,
  };

  // Outfit / body details, torso-local coords: hip centre (0,0), shoulders at y=-H.
  const OUTFIT = {
    cardigan: (sp) => {
      const H = sp.body.torsoH, c = sp.body.color2;
      return `<path d="M-20 ${f(-H + 2)} L0 ${f(-H + 48)} L20 ${f(-H + 2)} Z" fill="#fbf7ef" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>` +
        `<path d="M-14 ${f(-H + 2)} L0 ${f(-H + 26)} L14 ${f(-H + 2)}" fill="none" stroke="${c}" stroke-width="5" stroke-linejoin="round"/>` +
        `<path d="M0 ${f(-H + 48)} L0 -4" stroke="${INK}" stroke-width="4"/>` +
        [-H + 64, -H + 92, -H + 120].map((y) => `<circle cx="9" cy="${f(y)}" r="5" fill="#f4d35e" stroke="${INK}" stroke-width="3"/>`).join('') +
        `<rect x="-36" y="-34" width="22" height="18" rx="4" fill="none" stroke="${shade(sp.body.color, -0.3)}" stroke-width="4"/>`;
    },
    hoodie: (sp) => {
      const H = sp.body.torsoH;
      return `<path d="M-14 ${f(-H + 8)} L-12 ${f(-H + 52)} M14 ${f(-H + 8)} L12 ${f(-H + 52)}" stroke="#f2f2f2" stroke-width="4" stroke-linecap="round"/>` +
        `<circle cx="-12" cy="${f(-H + 55)}" r="4" fill="#f2f2f2"/><circle cx="12" cy="${f(-H + 55)}" r="4" fill="#f2f2f2"/>` +
        `<path d="M-40 -10 L-32 -46 L32 -46 L40 -10 Z" fill="${shade(sp.body.color, -0.12)}" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>` +
        `<path d="M-24 ${f(-H * 0.62)} l8 8 l8 -8" fill="none" stroke="#9ff3c9" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`; // tiny logo-free chevron print
    },
    banker: (sp) => {
      const H = sp.body.torsoH;
      let s = '';
      for (let x = -50; x <= 50; x += 16) s += `<path d="M${x} ${f(-H + 6)} L${x} -6" stroke="#9cc3e6" stroke-width="5"/>`;
      s += `<path d="M-15 ${f(-H + 2)} L0 ${f(-H + 18)} L15 ${f(-H + 2)} Z" fill="#fff" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>`;
      s += `<path d="M-8 ${f(-H + 16)} L8 ${f(-H + 16)} L12 ${f(-H + 100)} L0 ${f(-H + 116)} L-12 ${f(-H + 100)} Z" fill="#d9483b" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>`;
      s += `<path d="M-38 ${f(-H + 4)} L-30 -4 M38 ${f(-H + 4)} L30 -4" stroke="#2c3e66" stroke-width="12" stroke-linecap="round"/>`;
      s += `<path d="M-60 -10 L60 -10" stroke="${INK}" stroke-width="12"/><rect x="-10" y="-17" width="20" height="14" rx="3" fill="#e9b949" stroke="${INK}" stroke-width="3"/>`;
      return s;
    },
    doormanCabinet: (sp) => {
      const H = sp.body.torsoH, W = sp.body.torsoW;
      let s = `<rect x="${f(-W / 2 + 14)}" y="${f(-H + 24)}" width="${f(W - 28)}" height="72" rx="14" fill="#1e2a38" stroke="${INK}" stroke-width="5"/>`;
      s += `<path d="M${f(-W / 2)} ${f(-H + 108)} L0 ${f(-H + 150)} L${f(W / 2)} ${f(-H + 108)}" fill="none" stroke="#e9b949" stroke-width="6"/>`;
      for (const y of [-H + 160, -H + 192, -H + 224]) for (const x of [-22, 22])
        s += `<circle cx="${x}" cy="${f(y)}" r="7" fill="#e9b949" stroke="${INK}" stroke-width="3"/>`;
      for (const sd of [-1, 1])
        s += `<path d="M${f(sd * (W / 2 - 34))} ${f(-H)} l${f(sd * 38)} 0 l0 12 l${f(-sd * 38)} 0 Z" fill="#e9b949" stroke="${INK}" stroke-width="4"/>` +
          `<path d="M${f(sd * (W / 2 - 30))} ${f(-H + 12)} l0 12 M${f(sd * (W / 2 - 18))} ${f(-H + 12)} l0 14 M${f(sd * (W / 2 - 6))} ${f(-H + 12)} l0 12" stroke="#e9b949" stroke-width="3"/>`;
      // rack LEDs down the side
      for (let i = 0; i < 4; i++) s += `<circle cx="${f(W / 2 - 16)}" cy="${f(-H + 160 + i * 22)}" r="4" fill="${i % 2 ? '#7cf29a' : '#6ef0ff'}"/>`;
      s += `<path d="M${f(-W / 2 + 12)} -8 L${f(W / 2 - 12)} -8" stroke="${shade(sp.body.color, -0.3)}" stroke-width="5"/>`;
      return s;
    },
    chip: (sp) => {                              // a GPU chip: dark package, gold pins along both sides, a shiny die
      const H = sp.body.torsoH, W = sp.body.torsoW; let s = '';
      for (let i = 0; i < 6; i++) { const y = -H + 18 + i * (H - 30) / 5; s += `<rect x="${f(-W / 2 - 14)}" y="${f(y - 4)}" width="14" height="9" fill="#e9b949" stroke="${INK}" stroke-width="3"/><rect x="${f(W / 2)}" y="${f(y - 4)}" width="14" height="9" fill="#e9b949" stroke="${INK}" stroke-width="3"/>`; }
      s += `<rect x="${f(-W / 2 + 22)}" y="${f(-H + 22)}" width="${f(W - 44)}" height="${f(H - 44)}" rx="8" fill="#5d6a7e" stroke="${INK}" stroke-width="4"/>`;
      return s;
    },
    envelope: (sp) => {                       // a letter with legs: body is the envelope, the flap is drawn on it
      const H = sp.body.torsoH, W = sp.body.torsoW;
      return `<path d="M${f(-W / 2 + 6)} ${f(-H + 6)} L0 ${f(-H * 0.42)} L${f(W / 2 - 6)} ${f(-H + 6)}" fill="none" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>` +
        `<path d="M${f(-W / 2 + 6)} -6 L${f(-W * 0.12)} ${f(-H * 0.5)} M${f(W / 2 - 6)} -6 L${f(W * 0.12)} ${f(-H * 0.5)}" stroke="${shade(sp.body.color, -0.18)}" stroke-width="4"/>` +
        (sp.body.stamp ? `<rect x="${f(W / 2 - 34)}" y="${f(-H + 12)}" width="22" height="26" rx="2" fill="${sp.body.stamp}" stroke="${INK}" stroke-width="3"/>` : '');
    },
    fax: (sp) => {
      const H = sp.body.torsoH, W = sp.body.torsoW;
      let s = `<path d="M${f(-W / 2 + 22)} ${f(-H)} L${f(-W / 2 + 36)} ${f(-H - 44)} L${f(W / 2 - 50)} ${f(-H - 44)} L${f(W / 2 - 40)} ${f(-H)} Z" fill="#ffffff" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>`;
      s += `<path d="M${f(-W / 2 + 46)} ${f(-H - 30)} L${f(W / 2 - 56)} ${f(-H - 30)} M${f(-W / 2 + 44)} ${f(-H - 18)} L${f(W / 2 - 60)} ${f(-H - 18)}" stroke="#b9c2cc" stroke-width="4"/>`;
      s += `<rect x="${f(-W / 2 + 12)}" y="${f(-H + 6)}" width="${f(W - 24)}" height="10" rx="4" fill="${shade(sp.body.color, -0.25)}"/>`;
      // keypad on the right
      for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++)
        s += `<rect x="${f(W / 2 - 52 + c * 13)}" y="${f(-H + 28 + r * 13)}" width="9" height="9" rx="2" fill="#7d8796"/>`;
      s += `<rect x="${f(-W / 2 + 18)}" y="-20" width="${f(W - 36)}" height="10" rx="5" fill="${INK}"/>`;
      return s;
    },
  };

  // Props, drawn at the holding hand, upright. (0,0) = hand centre.
  const PROPS = {
    mug: () => `<g transform="translate(14 -14)"><path d="M18 -2 q20 0 20 16 q0 16 -20 16" fill="none" stroke="${INK}" stroke-width="12"/><path d="M18 -2 q20 0 20 16 q0 16 -20 16" fill="none" stroke="#f4d35e" stroke-width="5"/>` +
      `<rect x="-14" y="-14" width="36" height="46" rx="6" fill="#f4d35e" stroke="${INK}" stroke-width="${OW}"/><path d="M-4 -24 q6 -8 0 -16 M8 -24 q6 -8 0 -16" fill="none" stroke="#c8c3d4" stroke-width="4" stroke-linecap="round"/></g>`,
    laptop: () => `<g transform="translate(6 -30) rotate(-8)"><rect x="-10" y="0" width="74" height="54" rx="6" fill="#aeb6c2" stroke="${INK}" stroke-width="${OW}"/><circle cx="27" cy="27" r="7" fill="#e85d4a"/></g>`,
    phone: () => `<g transform="translate(-4 -42)"><rect x="-12" y="0" width="26" height="46" rx="6" fill="#2b2f3a" stroke="${INK}" stroke-width="5"/><rect x="-7" y="6" width="16" height="30" rx="2" fill="#6ef0ff"/></g>`,
    keys: () => `<g transform="translate(0 6)"><circle cx="0" cy="12" r="12" fill="none" stroke="${INK}" stroke-width="9"/><circle cx="0" cy="12" r="12" fill="none" stroke="#e9b949" stroke-width="4"/>` +
      `<path d="M-4 24 l-6 26 M6 24 l8 22" stroke="${INK}" stroke-width="10" stroke-linecap="round"/><path d="M-4 24 l-6 26 M6 24 l8 22" stroke="#e9b949" stroke-width="5" stroke-linecap="round"/></g>`,
    paper: () => `<g transform="translate(4 -10) rotate(8)"><path d="M0 0 L44 0 L44 58 L0 58 Z" fill="#ffffff" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/><path d="M8 14 L36 14 M8 26 L36 26 M8 38 L28 38" stroke="#9aa4b1" stroke-width="4"/></g>`,
  };

  function hand(x, y, ang, r, color, kind) {
    let s = '';
    if (kind === 'point') {
      const [fx, fy] = end(x, y, ang, r * 2.0);
      s += strokePath([[x, y], [fx, fy]], r * 0.7, color);
    }
    s += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="${color}" stroke="${INK}" stroke-width="${OW}"/>`;
    if (kind === 'open') {
      const [tx, ty] = end(x, y, ang + 40, r * 1.1);
      s += `<circle cx="${f(tx)}" cy="${f(ty)}" r="${f(r * 0.42)}" fill="${color}" stroke="${INK}" stroke-width="4"/>`;
    }
    return s;
  }

  // shoeAng: optional shoe tilt in degrees (default follows the shin); walk cycles pass 0 to keep a planted shoe flat.
  function leg(spec, hip, a, back, shoeAng) {
    const L = spec.legs;
    const [kx, ky] = end(hip[0], hip[1], a[0], L.len / 2);
    const [ax, ay] = end(kx, ky, a[1], L.len / 2);
    const pants = back ? shade(L.color, -0.18) : L.color;
    let s = strokePath([hip, [kx, ky], [ax, ay]], L.w, pants);
    const shoe = back ? shade(L.shoe, -0.18) : L.shoe;
    s += `<g transform="rotate(${f(shoeAng != null ? shoeAng : -a[1])} ${f(ax)} ${f(ay)})"><path d="M${f(ax - L.w * 0.55)} ${f(ay + L.shoeH * 0.55)} L${f(ax - L.w * 0.55)} ${f(ay - L.shoeH * 0.2)} Q${f(ax + L.shoeLen * 0.3)} ${f(ay - L.shoeH * 0.75)} ${f(ax + L.shoeLen * 0.62)} ${f(ay + L.shoeH * 0.3)} L${f(ax + L.shoeLen * 0.62)} ${f(ay + L.shoeH * 0.55)} Z" fill="${shoe}" stroke="${INK}" stroke-width="${OW}" stroke-linejoin="round"/></g>`;
    return s;
  }

  function arm(spec, sh, a, back, handKind, propName) {
    const A = spec.arms;
    const [ex, ey] = end(sh[0], sh[1], a[0], A.len / 2);
    const [hx, hy] = end(ex, ey, a[1], A.len / 2);
    const col = back ? shade(A.color, -0.18) : A.color;
    let s = strokePath([sh, [ex, ey], [hx, hy]], A.w, col);
    if (A.cuff) {
      const [cx, cy] = end(ex, ey, a[1], A.len / 2 - A.w * 0.4);
      s += strokePath([[cx, cy], [hx, hy]], A.w * 0.9, A.cuff);
    }
    if (propName && PROPS[propName]) s += `<g transform="translate(${f(hx)} ${f(hy)})">${PROPS[propName]()}</g>`;
    s += hand(hx, hy, a[1], A.w * 0.62, back ? shade(A.hand, -0.1) : A.hand, handKind);
    return s;
  }

  function torsoPath(b) {
    const H = b.torsoH, sw = b.torsoW / 2, hw = (b.hipW || b.torsoW) / 2, r = Math.min(b.radius || 26, sw);
    if (b.shape === 'box') {
      return `<rect x="${f(-sw)}" y="${f(-H)}" width="${f(sw * 2)}" height="${f(H)}" rx="${f(r)}" fill="${b.color}" stroke="${INK}" stroke-width="${OW}"/>`;
    }
    if (b.shape === 'belly') {
      return `<path d="M${f(-hw)} -4 Q${f(-hw - 26)} ${f(-H * 0.45)} ${f(-sw)} ${f(-H + r)} Q${f(-sw)} ${f(-H)} ${f(-sw + r)} ${f(-H)} L${f(sw - r)} ${f(-H)} Q${f(sw)} ${f(-H)} ${f(sw)} ${f(-H + r)} Q${f(hw + 26)} ${f(-H * 0.45)} ${f(hw)} -4 Q0 8 ${f(-hw)} -4 Z" fill="${b.color}" stroke="${INK}" stroke-width="${OW}" stroke-linejoin="round"/>`;
    }
    return `<path d="M${f(-hw)} 0 L${f(hw)} 0 Q${f(hw + 2)} 0 ${f(hw)} -6 L${f(sw)} ${f(-H + r)} Q${f(sw)} ${f(-H)} ${f(sw - r)} ${f(-H)} L${f(-sw + r)} ${f(-H)} Q${f(-sw)} ${f(-H)} ${f(-sw)} ${f(-H + r)} L${f(-hw)} -6 Q${f(-hw - 2)} 0 ${f(-hw)} 0 Z" fill="${b.color}" stroke="${INK}" stroke-width="${OW}" stroke-linejoin="round"/>`;
  }

  // turn: -1..1 turns the head toward +x (the way the character faces) by sliding the face across it (a 3/4 view).
  function drawHead(spec, expr, look, turn) {
    const tx = (turn || 0) * spec.head.r * 0.22;
    const h = spec.head, R = h.r;
    let s = '';
    if (h.hood) s += `<ellipse cx="0" cy="${f(R * 0.25)}" rx="${f(R * 1.18)}" ry="${f(R * 1.08)}" fill="${shade(h.hood, -0.12)}" stroke="${INK}" stroke-width="${OW}"/>`;
    if (spec.hair && HAIR[spec.hair.type]) s += HAIR[spec.hair.type].back(R, spec.hair.color);
    for (const sd of [-1, 1]) s += `<circle cx="${f(sd * R * 0.96)}" cy="${f(R * 0.12)}" r="${f(R * 0.19)}" fill="${spec.skin}" stroke="${INK}" stroke-width="${OW}"/>`;
    s += `<ellipse cx="0" cy="0" rx="${f(R * (h.sx || 1))}" ry="${f(R * (h.sy || 1))}" fill="${spec.skin}" stroke="${INK}" stroke-width="${OW}"/>`;
    s += `<g transform="translate(${f(tx)} 0)">${drawFace(spec, expr, look, true)}</g>`;
    if (spec.hair && HAIR[spec.hair.type]) s += HAIR[spec.hair.type].front(R, spec.hair.color);
    { const e = EXPR[expr] || EXPR.neutral; s += `<g transform="translate(${f(tx)} 0)">${drawBrow(spec.face, -1, e) + drawBrow(spec.face, 1, e)}</g>`; }
    if (spec.accessory && ACCESSORY[spec.accessory]) s += ACCESSORY[spec.accessory](R, spec);
    return s;
  }

  // ---------------------------------------------------------------- main
  function renderCharacter(spec, opts = {}) {
    const p = Object.assign({}, POSES.stand, typeof opts.pose === 'string' ? POSES[opts.pose] : opts.pose || {});
    const expr = opts.face || 'neutral';
    const look = opts.look != null ? opts.look : 0.25;
    const flip = opts.flip ? -1 : 1;
    const b = spec.body, L = spec.legs;

    // Ground the lowest foot.
    const reach = (a) => (L.len / 2) * Math.cos(rad(a[0])) + (L.len / 2) * Math.cos(rad(a[1]));
    const hipH = Math.max(reach(p.legL), reach(p.legR)) + L.shoeH * 0.55 - (p.bob || 0);
    const hipX = b.hipW ? b.hipW * 0.22 : b.torsoW * 0.22;

    let s = `<g transform="translate(${f(opts.x || 0)} ${f(opts.y || 0)}) scale(${f(flip * (opts.scale || 1))} ${f(opts.scale || 1)})">`;
    if (opts.shadow !== false) s += `<ellipse cx="0" cy="4" rx="${f(Math.max(b.torsoW, b.hipW || 0) * 0.75)}" ry="12" fill="#000" opacity="0.18"/>`;
    s += `<g transform="translate(0 ${f(-hipH)})">`;
    s += leg(spec, [-hipX, -4], p.legL, true, p.shoeL);
    s += leg(spec, [hipX, -4], p.legR, false, p.shoeR);
    s += `<g transform="rotate(${f(-(p.lean || 0))})">`;
    const H = b.torsoH;
    const shY = -H + (b.shoulderDrop != null ? b.shoulderDrop : spec.arms.w * 0.55) - (p.lift || 0);
    const shX = b.torsoW / 2 - (b.shoulderIn != null ? b.shoulderIn : spec.arms.w * 0.35);
    const propHand = p.propHand || 'R';
    s += arm(spec, [-shX, shY], p.armL, true, p.handL, propHand === 'L' ? spec.prop : null);
    if (spec.head.r && spec.head.neck) s += `<rect x="-14" y="${f(-H - spec.head.neck - 6)}" width="28" height="${f(spec.head.neck + 14)}" fill="${shade(spec.skin, -0.12)}" stroke="${INK}" stroke-width="${OW}"/>`;
    s += torsoPath(b);
    if (b.outfit && OUTFIT[b.outfit]) s += OUTFIT[b.outfit](spec);
    if (spec.head.r) {
      const neckY = -H - spec.head.neck;
      const hy = neckY - spec.head.r * (spec.head.sy || 1) * 0.86;
      s += `<g transform="rotate(${f(-(p.head || 0))} 0 ${f(neckY)}) translate(0 ${f(hy)})">${drawHead(spec, expr, look, opts.turn)}</g>`;
    } else {
      // Appliance: face lives on the body, hat sits on top.
      s += `<g transform="translate(0 ${f(-H + spec.face.panelY)})">${drawFace(spec, expr, look)}</g>`;
      if (spec.hat && HAT[spec.hat]) s += `<g transform="rotate(${f(-(p.head || 0) * 0.5)} 0 ${f(-H)}) translate(0 ${f(-H - 6)})">${HAT[spec.hat](b.torsoW)}</g>`;
    }
    s += arm(spec, [shX, shY], p.armR, false, p.handR, propHand === 'R' ? spec.prop : null);
    s += `</g></g></g>`;
    return s;
  }

  const api = { renderCharacter, POSES, EXPR, walkPose, runPose, INK, shade };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof globalThis !== 'undefined') globalThis.Puppet = api;
})();
