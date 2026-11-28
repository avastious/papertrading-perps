// The sets: 3D worlds built from outlined boxes and drawn panels. Each builder returns
// { signs: {name: panel} } — signs are checked to be fully in or fully out of frame.
import * as THREE from '../node_modules/three/build/three.module.js';
import { box, panel, rng, INK, FPS } from './stage.js';

function floor(scene, colorA, colorB, size = 256, lines = 'rgba(29,26,36,0.22)') {
  const c = document.createElement('canvas'); c.width = c.height = size; const x = c.getContext('2d');
  x.fillStyle = colorA; x.fillRect(0, 0, size, size); x.fillStyle = colorB; x.fillRect(0, 0, size / 2, size / 2); x.fillRect(size / 2, size / 2, size / 2, size / 2);
  x.strokeStyle = lines; x.lineWidth = 3; x.strokeRect(0, 0, size, size); x.beginPath(); x.moveTo(size / 2, 0); x.lineTo(size / 2, size); x.moveTo(0, size / 2); x.lineTo(size, size / 2); x.stroke();
  const tex = new THREE.CanvasTexture(c); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(24, 16); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(48, 32), new THREE.MeshLambertMaterial({ map: tex }));
  m.rotation.x = -Math.PI / 2; m.position.set(0, 0, -2); scene.add(m);
}
function skyline(scene, { w = 34, h = 4.4, x = 0, y = 4.7, z = -7, sky = 'dawn', seed = 3 }) {
  const r = rng(seed);
  const SK = { dawn: ['#f6c9a0', '#fbe6c8', '#9a8fa8', '#f7e2b0'], day: ['#9fd3f2', '#dff1fb', '#8fa0b8', '#ffffff'], night: ['#1d2340', '#3a3f66', '#2a2d45', '#ffd86b'], dusk: ['#e9876b', '#f6c39a', '#6b5f86', '#ffd86b'] }[sky];
  panel(scene, { w, h, x, y, z, px: 420, outline: 0.08, draw: (c, W, H) => {
    const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, SK[0]); g.addColorStop(0.75, SK[1]); c.fillStyle = g; c.fillRect(0, 0, W, H);
    const nb = Math.round(w * 1.15);
    for (let i = 0; i < nb; i++) { const bw = 40 + r() * 70, bh = H * (0.25 + r() * 0.6), bx = i * (W / nb) + r() * 10; c.fillStyle = i % 3 ? SK[2] : '#86799a'; c.fillRect(bx, H - bh, bw, bh);
      c.fillStyle = SK[3]; for (let yy = H - bh + 12; yy < H - 10; yy += 22) for (let xx = bx + 8; xx < bx + bw - 10; xx += 16) if (r() > 0.55) c.fillRect(xx, yy, 7, 10); }
    c.fillStyle = INK; const nm = Math.round(w / 4); for (let i = 1; i < nm; i++) c.fillRect(i * W / nm - 4, 0, 8, H);
  } });
}
function sign(scene, { text, x, y, z = -6.98, w = 7, color = '#ffb347', live, flash }) {
  return panel(scene, { w, h: 0.8, x, y, z, px: 90, outline: 0.06, live: !!(live || flash), draw: (c, W, H, n) => {
    c.fillStyle = '#16141c'; c.fillRect(0, 0, W, H); c.textAlign = 'center';
    const t = typeof live === 'function' ? live(n || 0) : text;
    let fs = 56; c.font = `bold ${fs}px Arial, sans-serif`; while (c.measureText(t).width > W - 40 && fs > 20) { fs -= 2; c.font = `bold ${fs}px Arial, sans-serif`; }
    c.fillStyle = flash && Math.floor((n || 0) / 12) % 2 ? '#c9453a' : color; c.fillText(t, W / 2, 66);
  } });
}
function clock(scene, { x, y, z = -6.98, start = 8 * 3600 + 47 * 60 }) {
  const p = panel(scene, { w: 1.3, h: 1.3, x, y, z, px: 200, outline: 0, live: true, draw: (c, W, H, n) => {
    c.clearRect(0, 0, W, H); c.fillStyle = '#fffaf0'; c.strokeStyle = INK; c.lineWidth = 12; c.beginPath(); c.arc(100, 100, 88, 0, 7); c.fill(); c.stroke();
    const hand = (a, l, wd) => { c.lineWidth = wd; c.beginPath(); c.moveTo(100, 100); c.lineTo(100 + Math.sin(a) * l, 100 - Math.cos(a) * l); c.stroke(); };
    const sec = start + (n || 0) / FPS; hand((sec / 3600) / 12 * 2 * Math.PI, 46, 10); hand((sec % 3600) / 3600 * 2 * Math.PI, 70, 7); c.strokeStyle = '#d9483b'; hand((sec % 60) / 60 * 2 * Math.PI, 74, 3);
  } });
  p.group.children[0].material.transparent = true;
  return p;
}
function screen(scene, x, z, ry, { w = 1.3, l1 = 'CANNOT CONNECT', ok = false } = {}) {
  panel(scene, { w, h: 0.9, x, y: 2.75, z, ry, px: 160, live: true, outline: 0.07, draw: (c, W, H, n) => {
    c.fillStyle = ok ? '#e9f6ee' : '#1e2a38'; c.fillRect(0, 0, W, H);
    c.strokeStyle = ok ? '#2a4b8c' : '#e8e2d4'; c.lineWidth = 7; c.strokeRect(W * 0.3, H * 0.2, W * 0.4, H * 0.36); c.beginPath(); c.moveTo(W * 0.3, H * 0.2); c.lineTo(W * 0.5, H * 0.4); c.lineTo(W * 0.7, H * 0.2); c.stroke();
    if (!ok) { c.strokeStyle = '#e85d4a'; c.lineWidth = 9; c.beginPath(); c.moveTo(W * 0.6, H * 0.44); c.lineTo(W * 0.75, H * 0.6); c.moveTo(W * 0.75, H * 0.44); c.lineTo(W * 0.6, H * 0.6); c.stroke();
      const a = (n || 0) * 0.25; c.strokeStyle = '#6ef0ff'; c.lineWidth = 5; c.beginPath(); c.arc(W * 0.18, H * 0.4, 13, a, a + 4.2); c.stroke(); }
    c.fillStyle = ok ? '#2a4b8c' : '#e8e2d4'; c.font = `bold ${W < 200 ? 17 : 20}px Arial, sans-serif`; c.textAlign = 'center'; c.fillText(ok ? 'INBOX' : l1, W / 2, H * 0.84);
  } });
  box(scene, { w: 0.14, h: 0.26, d: 0.1, color: '#2b2f3a', x: x - 0.15 * Math.sin(ry), y: 2.14, z: z - 0.15 * Math.cos(ry), ry });
}
function desk(scene, x, z, w, d, color = '#c9b79a') {
  box(scene, { w, h: 0.14, d, color, x, y: 2.0, z });
  for (const sx of [-1, 1]) box(scene, { w: 0.14, h: 2.0, d: d * 0.9, color: '#8b7a64', x: x + sx * (w / 2 - 0.2), z });
}

export const SETS = {
  // Taipei trading floor (beat 1's room, reusable)
  trade: (scene, o = {}) => {
    scene.background = new THREE.Color('#efe3cf');
    floor(scene, '#6f7f8f', '#67778a');
    box(scene, { w: 48, h: 11, d: 0.3, color: '#e9dcc4', z: -7.2, outline: 0 });
    skyline(scene, { sky: o.sky || 'dawn' });
    const signs = { ticker: sign(scene, { text: o.sign || 'EMAIL: NOT CONNECTED', x: 0.5, y: 8.6, color: o.signColor || '#ff6b5a', flash: o.flash }), clock: clock(scene, { x: 5.2, y: 8.6 }) };
    for (const [x, z] of [[-1.5, -3.5], [2.5, -3.5], [6.5, -3.5], [-5.5, -3.5]]) { desk(scene, x, z, 3.0, 1.4); screen(scene, x + 0.4, -3.7, -0.2, { w: 1.05, ok: o.ok }); }
    box(scene, { w: 16, h: 1.9, d: 0.06, color: '#b6a385', x: 0.5, z: -2.8 });
    if (o.table != null) box(scene, { w: 2.8, h: 1.35, d: 1.5, color: '#9c8b72', x: o.table, z: -0.65 });
    if (o.cupboard) { box(scene, { w: 2.4, h: 4.6, d: 1.2, color: '#9c8b72', x: o.cupboard, z: -1.8 }); }
    box(scene, { w: 1.2, h: 11, d: 1.2, color: '#d8cab0', x: -8, z: -1.6 });
    return { signs };
  },
  // Penny's open-plan office (daylight)
  office: (scene, o = {}) => {
    scene.background = new THREE.Color('#eef0ea');
    floor(scene, '#8a9a8f', '#83938a');
    box(scene, { w: 48, h: 11, d: 0.3, color: '#e7e3d6', z: -7.2, outline: 0 });
    skyline(scene, { sky: o.sky || 'day', seed: 9 });
    for (const [x, z] of [[-4.5, -3.6], [-0.5, -3.6], [3.5, -3.6], [7.5, -3.6]]) { desk(scene, x, z, 3.2, 1.4, '#d9cdb5'); screen(scene, x + 0.3, -3.8, -0.15, { w: 1.1, ok: o.ok }); }
    box(scene, { w: 16, h: 1.9, d: 0.06, color: '#c6b99f', x: 1.5, z: -2.9 });
    if (o.penDesk !== false) { desk(scene, o.penDesk || -1.8, -1.2, 2.6, 1.4, '#e3d6bc'); screen(scene, (o.penDesk || -1.8) + 0.5, -1.3, 0.6, { ok: o.ok }); }
    box(scene, { w: 0.9, h: 3.8, d: 0.9, color: '#3b3f4a', x: 9.5, z: -1.5 });                       // Sam's server rack
    for (let i = 0; i < 5; i++) box(scene, { w: 0.7, h: 0.05, d: 0.02, color: i % 2 ? '#7cf29a' : '#6ef0ff', x: 9.5, y: 0.8 + i * 0.55, z: -1.04, outline: 0 });
    box(scene, { w: 0.7, h: 0.7, d: 0.7, color: '#b5674a', x: -7.5, z: -3.0 });
    const signs = { sign: sign(scene, { text: o.sign || 'GOOD MORNING', x: -1, y: 8.4, color: o.signColor || '#7cf29a', flash: o.flash }), clock: clock(scene, { x: 4.6, y: 8.4, start: o.clock || 12 * 3600 + 20 * 60 }) };
    return { signs };
  },
  // The Front Door: a grand hotel-style lobby with the revolving door, lifts and the doormen
  door: (scene, o = {}) => {
    scene.background = new THREE.Color('#2a1f2b');
    floor(scene, '#e9e1d1', '#d8cdb8', 256, 'rgba(29,26,36,0.15)');
    box(scene, { w: 48, h: 11, d: 0.3, color: o.wall || '#7a2b36', z: -7.2, outline: 0 });
    box(scene, { w: 48, h: 0.3, d: 0.4, color: '#e9b949', y: 6.4, z: -7.0, outline: 0 });
    // revolving door
    box(scene, { w: 4.2, h: 5.4, d: 0.4, color: '#3b2a2f', x: o.doorX ?? 0, z: -6.9 });
    panel(scene, { w: 3.6, h: 4.8, x: o.doorX ?? 0, y: 2.6, z: -6.6, px: 200, outline: 0.06, live: true, draw: (c, W, H, n) => {
      c.fillStyle = '#bfe3f2'; c.fillRect(0, 0, W, H); const a = (o.spin ? (n || 0) * 0.08 : 0.4);
      c.strokeStyle = INK; c.lineWidth = 8; for (let k = 0; k < 4; k++) { const x = W / 2 + Math.cos(a + k * Math.PI / 2) * W * 0.42; c.beginPath(); c.moveTo(x, 10); c.lineTo(x, H - 10); c.stroke(); }
      c.strokeStyle = '#e9b949'; c.lineWidth = 10; c.strokeRect(5, 5, W - 10, H - 10);
    } });
    // lifts
    for (const [x, num] of [[7.5, 'TO THE MAILBOXES'], [-7.5, 'FLOORS 1-∞']]) { box(scene, { w: 3.2, h: 4.6, d: 0.2, color: '#c9a36b', x, z: -6.95 }); panel(scene, { w: 3.0, h: 0.5, x, y: 5.0, z: -6.8, px: 60, outline: 0.04, draw: (c, W, H) => { c.fillStyle = '#16141c'; c.fillRect(0, 0, W, H); c.fillStyle = '#ffb347'; c.font = 'bold 34px Arial'; c.textAlign = 'center'; c.fillText(num, W / 2, 44); } }); }
    // red carpet + palms
    box(scene, { w: 3.0, h: 0.03, d: 9, color: '#a8323e', x: o.doorX ?? 0, z: -2.5, outline: 0 });
    for (const x of [-11, 11]) { box(scene, { w: 0.9, h: 0.8, d: 0.9, color: '#b5674a', x, z: -4.5 }); }
    const signs = { sign: sign(scene, { text: o.sign || 'THE FRONT DOOR', x: o.doorX ?? 0, y: 7.4, color: o.signColor || '#e9b949', flash: o.flash, live: o.signLive }) };
    return { signs };
  },
  // City street: courthouse, city hall, hospital, domed building
  city: (scene, o = {}) => {
    const night = o.sky === 'night';
    scene.background = new THREE.Color(night ? '#1d2340' : '#cfe6f2');
    floor(scene, night ? '#3b3f4a' : '#9aa4b1', night ? '#353944' : '#919ba8');
    box(scene, { w: 48, h: 0.25, d: 4, color: night ? '#2b2f3a' : '#6b7280', z: 2.5, outline: 0 });   // road edge
    const fac = (x, w, h, color, kind) => panel(scene, { w, h, x, y: h / 2, z: -6.5, px: 300, outline: 0.08, draw: (c, W, H) => {
      c.fillStyle = color; c.fillRect(0, 0, W, H); c.fillStyle = night ? '#ffd86b' : '#cfe6ff'; c.strokeStyle = INK; c.lineWidth = 6;
      if (kind === 'court') { c.fillStyle = '#efe6d2'; c.beginPath(); c.moveTo(W * 0.05, H * 0.28); c.lineTo(W / 2, H * 0.06); c.lineTo(W * 0.95, H * 0.28); c.closePath(); c.fill(); c.stroke(); for (let i = 0; i < 6; i++) { c.fillRect(W * (0.12 + i * 0.14), H * 0.32, W * 0.06, H * 0.55); c.strokeRect(W * (0.12 + i * 0.14), H * 0.32, W * 0.06, H * 0.55); } }
      else if (kind === 'dome') { c.fillStyle = '#efe6d2'; c.beginPath(); c.arc(W / 2, H * 0.34, W * 0.26, Math.PI, 0); c.fill(); c.stroke(); for (let i = 0; i < 5; i++) c.fillRect(W * (0.18 + i * 0.14), H * 0.45, W * 0.06, H * 0.42); }
      else { for (let r = 0; r < 5; r++) for (let k = 0; k < 4; k++) { c.fillRect(W * (0.12 + k * 0.2), H * (0.15 + r * 0.15), W * 0.12, H * 0.09); c.strokeRect(W * (0.12 + k * 0.2), H * (0.15 + r * 0.15), W * 0.12, H * 0.09); }
        if (kind === 'hospital') { c.fillStyle = '#e85d4a'; c.fillRect(W * 0.44, H * 0.02, W * 0.12, H * 0.1); c.fillRect(W * 0.4, H * 0.045, W * 0.2, H * 0.05); } }
      c.fillStyle = '#fffdf6'; c.font = `bold ${Math.round(W / 10)}px Arial`; c.textAlign = 'center'; c.fillStyle = INK; c.fillText({ court: 'COURT', dome: '', hall: 'CITY HALL', hospital: 'HOSPITAL' }[kind] || '', W / 2, H * 0.97);
    } });
    fac(-10, 6, 7, '#d8cab0', 'court'); fac(-3.5, 5.5, 8.5, '#c9b79a', 'hall'); fac(3, 5.5, 7.5, '#e7e3d6', 'hospital'); fac(9.5, 6.5, 7, '#d8cab0', 'dome');
    box(scene, { w: 48, h: 0.3, d: 2, color: night ? '#4a4f5c' : '#c6c9cf', z: -5.2, outline: 0 });   // pavement
    const signs = {};
    if (o.sign) signs.sign = sign(scene, { text: o.sign, x: o.signX || 0, y: 9.6, z: -6.3, w: 8, color: '#ffb347' });
    return { signs };
  },
  // Ops room with a giant world map screen
  map: (scene, o = {}) => {
    scene.background = new THREE.Color('#14161f');
    floor(scene, '#2b2f3a', '#272b35');
    box(scene, { w: 48, h: 11, d: 0.3, color: '#1e2130', z: -7.2, outline: 0 });
    const r = rng(5);
    const blobs = [[0.16, 0.34, 0.13, 0.17, 'am'], [0.24, 0.66, 0.06, 0.15, 'am'], [0.48, 0.3, 0.07, 0.09, 'eu'], [0.52, 0.58, 0.08, 0.16, 'af'], [0.7, 0.33, 0.15, 0.13, 'as'], [0.84, 0.72, 0.06, 0.06, 'oc']];
    const dots = []; for (let i = 0; i < 120; i++) { const b = blobs[i % blobs.length]; const a = r() * 6.28, d = Math.sqrt(r()); dots.push([b[0] + Math.cos(a) * b[2] * d, b[1] + Math.sin(a) * b[3] * d, b[4], r()]); }
    const signs = { map: panel(scene, { w: 16, h: 7.2, x: 0, y: 4.6, z: -7.0, px: 540, outline: 0.1, live: true, draw: (c, W, H, n) => {
      c.fillStyle = '#10243a'; c.fillRect(0, 0, W, H); c.strokeStyle = 'rgba(110,240,255,0.12)'; c.lineWidth = 2; for (let x = 0; x < W; x += 40) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, H); c.stroke(); } for (let y = 0; y < H; y += 40) { c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); }
      for (const [bx, by, rx, ry] of blobs) { c.fillStyle = '#1f4f6e'; c.beginPath(); c.ellipse(bx * W, by * H, rx * W, ry * H, 0, 0, 7); c.fill(); }
      const st = o.state ? o.state(n || 0) : { grey: 0, pins: 0 };
      dots.forEach(([dx, dy, reg, k], i) => {
        const order = { am: 0, eu: 0.5, af: 0.6, as: 0.75, oc: 0.9 }[reg]; const isGrey = st.grey > order + k * 0.1;
        c.fillStyle = isGrey ? '#6b7280' : '#7cf29a'; c.beginPath(); c.arc(dx * W, dy * H, 7, 0, 7); c.fill();
        if (i < st.pins) { c.fillStyle = '#e85d4a'; c.strokeStyle = INK; c.lineWidth = 3; c.beginPath(); c.arc(dx * W, dy * H - 14, 9, 0, 7); c.fill(); c.stroke(); }
      });
      if (st.label) { c.fillStyle = 'rgba(16,20,28,0.85)'; c.fillRect(W * 0.3, H * 0.84, W * 0.4, H * 0.12); c.fillStyle = '#ffb347'; c.font = `bold ${Math.round(H * 0.07)}px Arial`; c.textAlign = 'center'; c.fillText(st.label, W / 2, H * 0.93); }
    } }) };
    for (const x of [-9.5, 9.5]) box(scene, { w: 2.4, h: 1.6, d: 1.2, color: '#3b3f4a', x, z: -3.5 });
    return { signs, frame: { x0: -8.2, x1: 8.2, top: 8.4, bot: 0 } };
  },
  // Mail hall: a warehouse waiting room for undelivered mail
  hall: (scene, o = {}) => {
    scene.background = new THREE.Color('#d9d4c8');
    floor(scene, '#a39a8c', '#9b9284');
    box(scene, { w: 48, h: 11, d: 0.3, color: '#c9c1b2', z: -7.2, outline: 0 });
    for (let i = -3; i <= 3; i++) box(scene, { w: 0.35, h: 11, d: 0.35, color: '#8b7a64', x: i * 6, z: -6.8 });
    const signs = { board: panel(scene, { w: 8, h: 1.6, x: 0, y: 8.0, z: -6.95, px: 120, outline: 0.08, live: true, draw: (c, W, H, n) => {
      c.fillStyle = '#16141c'; c.fillRect(0, 0, W, H); c.textAlign = 'center'; c.font = 'bold 42px Arial';
      const l = o.board ? o.board(n || 0) : ['WAITING TO DELIVER', '']; c.fillStyle = '#ffb347'; c.fillText(l[0], W / 2, 50); c.fillStyle = '#ff6b5a'; c.fillText(l[1] || '', W / 2, 100);
    } }) };
    for (const [x, z, h] of [[-8, -5, 3.4], [-5, -5.6, 4.6], [5.5, -5.4, 4.0], [8.5, -5, 3.0]]) box(scene, { w: 2.2, h, d: 1.4, color: '#c9a36b', x, z });
    return { signs };
  },
  // Plain studio for title and quote cards
  card: (scene, o = {}) => {
    scene.background = new THREE.Color(o.bg || '#2a2533');
    box(scene, { w: 48, h: 0.1, d: 32, color: o.floor || '#3a3346', y: -0.1, z: -2, outline: 0 });
    box(scene, { w: 48, h: 14, d: 0.3, color: o.bg || '#2a2533', z: -7.2, outline: 0 });
    for (let i = 0; i < 9; i++) box(scene, { w: 0.08, h: 14, d: 0.05, color: '#3a3346', x: -16 + i * 4, z: -7.0, outline: 0 });
    return { signs: {} };
  },
};
