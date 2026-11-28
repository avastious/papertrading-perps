// Beat 1 (10 s): "Friday the thirteenth of November, 2026. In a finance office in Taiwan, a machine nobody
// has touched in years shrieks to life."
// Everything below is worked out from the frame number n (0..299). No clocks, no randomness.
import { LIVE, createStage, createCard, box, panel, checkFrame, walkTrack, lerpPose, seq, ease, lerp, clamp, rng, FPS, INK, S } from '../stage.js';

const P = globalThis.Puppet, CAST = globalThis.CAST;
export const FRAMES = 300;

// ---------------- shot plan ----------------
// Camera always on the +z side of the action: Faxie stays screen-left, Bigsby screen-right, in every shot.
export const SHOTS = [
  { id: 'A', name: 'Wide: the trading floor, a dusty fax wakes up', from: 0, to: 90 },
  { id: 'B', name: 'Close-up reaction: Bigsby jumps', from: 90, to: 165 },
  { id: 'C', name: 'Two-shot: Bigsby walks over to Faxie', from: 165, to: 255 },
  { id: 'D', name: 'Wide: the whole floor turns to look', from: 255, to: 300 },
];
// Something on screen changes at each of these frames (checked: never more than 2 s apart).
export const EVENTS = [
  [0, 'open on the floor; Bigsby taps refresh'], [30, 'Bigsby gets cross with his screen'], [48, "Faxie's light flickers on"],
  [66, 'Faxie shakes off the dust and shrieks'], [78, 'back-row traders turn'], [90, 'CUT to close-up'], [100, 'Bigsby jumps'],
  [128, 'Bigsby goes from shock to fear'], [146, 'Bigsby starts walking over'], [165, 'CUT to two-shot'], [196, 'paper starts coming out'],
  [218, 'Bigsby stops and leans in'], [236, 'Faxie grins'], [244, 'Bigsby points: "a fax?!"'], [255, 'CUT to wide'],
  [270, 'a trader points, another covers her ears'], [285, 'the page drops into the tray'],
];
export const shotAt = n => SHOTS.find(s => n >= s.from && n < s.to);

// ---------------- characters ----------------
const BIG = CAST.bigsby, FAX = CAST.fax;
// Two anonymous back-row traders, recoloured from the stock rig parts.
const T1 = JSON.parse(JSON.stringify(CAST.sam));
Object.assign(T1, { name: 'Trader 1', skin: '#d79e78' }); T1.hair.color = '#2b2230'; T1.head.hood = '#2f5d8c';
Object.assign(T1.body, { color: '#2f5d8c' }); Object.assign(T1.arms, { color: '#2f5d8c', hand: '#d79e78', cuff: '#284f78' }); T1.prop = 'phone'; T1.face.freckles = null; T1.face.browColor = '#2b2230';
const T2 = JSON.parse(JSON.stringify(CAST.penny));
Object.assign(T2, { name: 'Trader 2', skin: '#f0c7a4' }); T2.hair.color = '#7a4a24';
Object.assign(T2.body, { color: '#c8643c', color2: '#a54e2c' }); Object.assign(T2.arms, { color: '#c8643c', hand: '#f0c7a4' }); T2.legs.color = '#3b3f4a'; T2.prop = 'phone'; T2.face.browColor = '#7a4a24';

// Bigsby: a hurried walk from his desk to the fax, frames 146-218 (three stride cycles of 24 frames).
// The body moves exactly as far as the planted foot pushes back (walkTrack), so the feet never slide.
const WALK = { start: 146, end: 218, cycle: 24 };
const B_START_X = 2.4, B_Z = 0.15;
function gait(phase) {                     // like Puppet.walkPose, with a longer stride for a hurried walk
  const a = -phase * 2 * Math.PI, s = Math.sin(a), c = Math.cos(a), k = x => Math.max(0, x);
  return { lean: 6, bob: 0, head: 4, armL: [28 * s, 28 * s + 20], armR: [-28 * s, -28 * s + 20],
    legL: [-32 * s, -32 * s - 34 * k(c)], legR: [32 * s, 32 * s - 34 * k(-c)] };
}
const walkPoseAt = n => gait(clamp(n - WALK.start, 0, WALK.end - WALK.start) / WALK.cycle);
let BX, B_STOP_X, FAX_X;
const FAX_Z = -0.55, TABLE_H = 1.35;

// pose helpers (angles: 0 = down, +90 = forward, 180 = up; Bigsby is flipped to face screen-left)
const POSE = {
  tapA: { lean: 4, armL: [62, 160], armR: [62, 92], legL: [-4, -3], legR: [4, 3], head: -4, propHand: 'L' },    // phone at ear, tapping keys
  tapB: { lean: 4, armL: [62, 160], armR: [56, 80], legL: [-4, -3], legR: [4, 3], head: -4, propHand: 'L' },
  cross: { lean: 7, armL: [62, 160], armR: [70, 104], legL: [-4, -3], legR: [4, 3], head: -9, propHand: 'L' },
  jump: { ...P.POSES.surprised, propHand: 'L' },
  fear: { lean: -6, bob: 0, armL: [-20, 60], armR: [30, 120], legL: [-8, -5], legR: [8, 5], head: 6, propHand: 'L' },
  lean: { lean: 16, bob: 0, armL: [10, 30], armR: [40, 70], legL: [-10, -6], legR: [10, 6], head: 10, propHand: 'L' },
  point: { ...P.POSES.point, lean: 8, head: 4, propHand: 'L' },
};

function bigsbyPose(n) {
  let pose, face = 'neutral', look = 0.6;
  if (n < 30) { pose = Math.floor(n / 6) % 2 ? POSE.tapA : POSE.tapB; }
  else if (n < 100) { pose = Math.floor(n / 5) % 2 ? POSE.cross : lerpPose(POSE.cross, POSE.tapB, 0.6); face = n < 70 ? 'angry' : (n < 80 ? 'blink' : 'angry'); }
  else if (n < 128) { const t = seq(n, 100, 106); pose = lerpPose(POSE.cross, POSE.jump, ease(t)); pose.bob = -26 * Math.sin(Math.PI * seq(n, 100, 116)); face = 'surprised'; look = 1; }
  else if (n < WALK.start) { pose = lerpPose(POSE.jump, POSE.fear, ease(seq(n, 128, 136))); face = n >= 140 && n < 143 ? 'blink' : 'scared'; look = 1; }
  else if (n < WALK.end) { pose = { ...walkPoseAt(n), propHand: 'L' }; if (n < WALK.start + 6) pose = lerpPose(POSE.fear, pose, ease(seq(n, WALK.start, WALK.start + 6))); face = 'scared'; look = 1; }
  else if (n < 244) { pose = lerpPose({ ...walkPoseAt(WALK.end), propHand: 'L' }, POSE.lean, ease(seq(n, WALK.end, WALK.end + 8))); face = n < 230 ? 'surprised' : 'scared'; look = 1; }
  else { pose = lerpPose(POSE.lean, POSE.point, ease(seq(n, 244, 250))); face = ['talkA', 'talkB', 'surprised', 'talkA'][Math.floor((n - 244) / 5) % 4]; look = 1; }
  return { pose, face, look };
}
function bigsbyAt(n) {
  const { pose, face, look } = bigsbyPose(n);
  return { svg: P.renderCharacter(BIG, { pose, face, look, flip: true, shadow: false }), x: BX[n], z: B_Z };
}
// Track Bigsby's x through every frame from the poses actually shown (including the blends in and out of the walk).
BX = walkTrack(P, BIG, { from: B_START_X, frames: FRAMES, start: WALK.start, to: WALK.end + 8, dir: -1, poseAt: n => bigsbyPose(n).pose });
B_STOP_X = BX[FRAMES - 1];
FAX_X = B_STOP_X - 2.75;

// Faxie: asleep and dusty → light flickers → shakes the dust off and shrieks → prints → grins.
function faxieAt(n) {
  const awake = n >= 48, shriek = n >= 66;
  const face = !awake ? 'blink' : !shriek ? 'surprised' : n >= 236 ? 'happy' : ['talkA', 'surprised', 'talkA', 'talkB'][Math.floor(n / 3) % 4];
  const hop = shriek && n < 236 ? Math.abs(Math.sin(n * 0.9)) * 10 : 0;
  const shake = shriek ? Math.sin(n * 2.3) * 5 : 0;
  const pose = { lean: shriek ? Math.sin(n * 1.7) * 3 : 0, bob: -hop, armL: shriek ? [-60 - 30 * Math.sin(n * 0.8), -120] : [-6, -4], armR: shriek ? [60 + 30 * Math.sin(n * 0.8), 120] : [6, 4], legL: [-6, -4], legR: [6, 4], propHand: 'none' };
  let svg = P.renderCharacter(FAX, { pose, face, look: 0, shadow: false, x: shake });
  const W = FAX.body.torsoW, H = FAX.body.torsoH, top = -(FAX.legs.len + 30 + H);
  // dust (fades and flies off when it wakes)
  const fly = seq(n, 66, 84), dustA = 1 - seq(n, 66, 80);
  if (dustA > 0) {
    const r = rng(7);
    for (let i = 0; i < 26; i++) {
      const dx = (r() - 0.5) * W * 0.9, dy = top + r() * (H + 40), ang = r() * Math.PI * 2, d = ease(fly) * 160;
      svg += `<circle cx="${(dx + Math.cos(ang) * d).toFixed(1)}" cy="${(dy + Math.sin(ang) * d - ease(fly) * 40).toFixed(1)}" r="${(3 + r() * 5).toFixed(1)}" fill="#a49c8c" opacity="${(0.75 * dustA).toFixed(2)}"/>`;
    }
    svg += `<path d="M${(-W / 2 - 10).toFixed(0)} ${(top - 30).toFixed(0)} q40 30 30 70 M${(-W / 2 - 10).toFixed(0)} ${(top - 30).toFixed(0)} q60 6 74 40" fill="none" stroke="#d8d2c6" stroke-width="3" opacity="${dustA.toFixed(2)}"/>`;
  }
  // power light: flickers from 48, steady from 60
  const on = n >= 60 || (n >= 48 && [0, 1, 0, 0, 1, 1, 0, 1, 1, 1, 0, 1][n - 48]);
  svg += `<circle cx="${(-W / 2 + 26 + shake).toFixed(1)}" cy="${(top + 30).toFixed(1)}" r="8" fill="${on ? '#7cf29a' : '#5b6352'}" stroke="${INK}" stroke-width="4"/>`;
  if (on) svg += `<circle cx="${(-W / 2 + 26 + shake).toFixed(1)}" cy="${(top + 30).toFixed(1)}" r="16" fill="#7cf29a" opacity="0.3"/>`;
  // shriek waves on both sides
  if (shriek && n < 290) {
    for (let k = 0; k < 3; k++) {
      const ph = ((n * 0.09 + k / 3) % 1), rr = 40 + ph * 120, op = (1 - ph) * 0.9;
      for (const sd of [-1, 1]) svg += `<path d="M${(sd * (W / 2 + 10 + ph * 60)).toFixed(1)} ${(top + H * 0.2 - rr * 0.4).toFixed(1)} q${(sd * rr * 0.35).toFixed(1)} ${(rr * 0.4).toFixed(1)} 0 ${(rr * 0.8).toFixed(1)}" fill="none" stroke="#e85d4a" stroke-width="7" stroke-linecap="round" opacity="${op.toFixed(2)}"/>`;
    }
  }
  // the page coming out of the front slot (from 196), dropping into the tray at 285
  const out = ease(seq(n, 196, 250)), drop = ease(seq(n, 285, 292));
  if (out > 0) {
    const len = 18 + out * 92, y0 = -(FAX.legs.len + 30) - 16 + drop * 30;
    svg += `<g transform="translate(${shake.toFixed(1)} 0)"><path d="M-46 ${y0.toFixed(1)} L46 ${y0.toFixed(1)} L50 ${(y0 + len).toFixed(1)} L-42 ${(y0 + len + 4).toFixed(1)} Z" fill="#fffdf6" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>` +
      `<path d="M-30 ${(y0 + 18).toFixed(1)} h56 M-30 ${(y0 + 32).toFixed(1)} h44 M-30 ${(y0 + 46).toFixed(1)} h52" stroke="#9aa4b1" stroke-width="4" opacity="${clamp(len / 60).toFixed(2)}"/>` +
      (out > 0.85 ? `<text x="-30" y="${(y0 + 80).toFixed(1)}" font-family="Arial, sans-serif" font-weight="700" font-size="17" fill="#d9483b">CONFIRM</text>` : '') + '</g>';
  }
  return { svg, x: FAX_X, z: FAX_Z, y: TABLE_H };
}

// Back-row traders (behind desks, so only their top halves show).
function traderAt(spec, n, { x, flipStart, turnAt, react, react2, react2At }) {
  const turned = n >= turnAt;
  let pose = Math.floor(n / 9) % 2 ? { armL: [30, 100], armR: [40, 80], head: -4 } : { armL: [30, 100], armR: [46, 92], head: -6 };
  let face = 'neutral';
  if (turned) { pose = P.POSES[n >= react2At ? react2 : react]; face = n >= react2At && react2 === 'point' ? 'talkA' : 'surprised'; if (react2 === 'surprised' && n >= react2At) face = 'scared'; }
  return { svg: P.renderCharacter(spec, { pose: { ...pose, propHand: 'none' }, face, look: turned ? 1 : 0.5, flip: turned ? true : flipStart, shadow: false }), x, z: -4.3 };
}

// ---------------- camera per shot ----------------
function cameraAt(n) {
  const s = shotAt(n), t = (n - s.from) / (s.to - s.from), bx = BX[n];
  switch (s.id) {
    case 'A': return { pos: [lerp(-0.6, -0.8, t), 3.3, lerp(14.2, 13.2, ease(t))], look: [-0.8, 2.95, -1.4], fov: 36 };
    case 'B': return { pos: [bx + 1.2, 3.7, 7.4], look: [bx + 0.2, 3.25, 0], fov: 32 };
    case 'C': { const cx = lerp(FAX_X + 2.6, FAX_X + 1.55, ease(t)); return { pos: [cx + 0.2, 3.25, lerp(10.6, 9.8, ease(t))], look: [cx, 2.6, -0.2], fov: 34 }; }
    case 'D': return { pos: [lerp(-6.2, -5.6, t), 4.2, 13.6], look: [-1.5, 2.3, -1.8], fov: 38 };
  }
}
// Which edges of which characters must stay in frame, per shot (close-ups crop at the waist on purpose).
const FRAME_RULES = {
  A: { bigsby: 'lrtb', faxie: 'lrtb', t1: 'lrt', t2: 'lrt' },
  B: { bigsby: 'lrt' },
  C: { bigsby: 'lrtb', faxie: 'lrtb' },
  D: { bigsby: 'lrtb', faxie: 'lrtb', t1: 'lrt', t2: 'lrt' },
};

// ---------------- the set ----------------
const DESK = { x: 0.95, w: 2.5 };
function buildSet(stage) {
  const { scene } = stage;
  scene.background = new stage.THREE.Color('#efe3cf');
  box(scene, { w: 40, h: 0.1, d: 26, color: '#6f7f8f', y: -0.1, z: -1, outline: 0 });                         // carpet
  box(scene, { w: 40, h: 8, d: 0.3, color: '#e9dcc4', z: -7.2, outline: 0 });                                // back wall
  const r = rng(3);
  panel(scene, { w: 22, h: 4.2, x: 1, y: 4.6, z: -7.0, px: 420, outline: 0.08, draw: (x, w, h) => {      // windows: early-morning city
    const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#f6c9a0'); g.addColorStop(0.7, '#fbe6c8'); x.fillStyle = g; x.fillRect(0, 0, w, h);
    x.fillStyle = '#ffd98a'; x.beginPath(); x.arc(w * 0.78, h * 0.62, h * 0.1, 0, 7); x.fill();
    for (let i = 0; i < 26; i++) { const bw = 40 + r() * 70, bh = h * (0.25 + r() * 0.6), bx = i * (w / 26) + r() * 10; x.fillStyle = i % 3 ? '#9a8fa8' : '#86799a'; x.fillRect(bx, h - bh, bw, bh);
      x.fillStyle = '#f7e2b0'; for (let yy = h - bh + 12; yy < h - 10; yy += 22) for (let xx = bx + 8; xx < bx + bw - 10; xx += 16) if (r() > 0.55) x.fillRect(xx, yy, 7, 10); }
    x.fillStyle = INK; for (let i = 1; i < 6; i++) x.fillRect(i * w / 6 - 4, 0, 8, h);                         // mullions
  } });
  // market clock + ticker board on the back wall
  panel(scene, { w: 7, h: 0.8, x: -2.5, y: 7.2, z: -6.98, px: 90, outline: 0.06, live: true, draw: (x, w, h, n) => {
    x.fillStyle = '#16141c'; x.fillRect(0, 0, w, h); x.font = 'bold 56px Arial, sans-serif'; x.fillStyle = '#ffb347';
    const msg = 'MARKET OPENS 09:00   ·   EMAIL: NOT CONNECTED   ·   ';
    const off = (n * 6) % (x.measureText(msg).width); x.fillText(msg + msg, -off, 66);
  } });
  panel(scene, { w: 1.3, h: 1.3, x: 6.5, y: 6.6, z: -6.98, px: 200, outline: 0, live: true, draw: (x, w, h, n) => {
    x.clearRect(0, 0, w, h); x.fillStyle = '#e9dcc4'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#fffaf0'; x.strokeStyle = INK; x.lineWidth = 12; x.beginPath(); x.arc(100, 100, 88, 0, 7); x.fill(); x.stroke();
    const hand = (a, l, wd) => { x.lineWidth = wd; x.beginPath(); x.moveTo(100, 100); x.lineTo(100 + Math.sin(a) * l, 100 - Math.cos(a) * l); x.stroke(); };
    const sec = 47 * 60 + 12 + n / FPS;                                                                         // 08:47:12 at frame 0
    hand((8 + sec / 3600) / 12 * 2 * Math.PI, 46, 10); hand(sec / 3600 * 2 * Math.PI, 70, 7); x.strokeStyle = '#d9483b'; hand((sec % 60) / 60 * 2 * Math.PI, 74, 3);
  } });
  // desks: Bigsby's (front), two in the back row
  const desk = (x, z, w, d) => { box(scene, { w, h: 0.14, d, color: '#c9b79a', x, y: 2.0, z }); for (const sx of [-1, 1]) box(scene, { w: 0.14, h: 2.0, d: d * 0.9, color: '#8b7a64', x: x + sx * (w / 2 - 0.2), z }); };
  desk(DESK.x, -1.3, DESK.w, 1.6);
  desk(-1.3, -3.5, 3.6, 1.4); box(scene, { w: 3.6, h: 1.9, d: 0.08, color: '#b6a385', x: -1.3, z: -2.82 });            // modesty panels hide back-row legs
  desk(5.6, -3.5, 3.6, 1.4); box(scene, { w: 3.6, h: 1.9, d: 0.08, color: '#b6a385', x: 5.6, z: -2.82 });
  const screen = (x, z, ry, live) => panel(scene, { w: 1.5, h: 0.95, x, y: 2.75, z, ry, px: 180, live, outline: 0.07, draw: (c, w, h, n) => {
    c.fillStyle = '#1e2a38'; c.fillRect(0, 0, w, h);
    c.strokeStyle = '#e8e2d4'; c.lineWidth = 8; c.strokeRect(w * 0.3, h * 0.22, w * 0.4, h * 0.36); c.beginPath(); c.moveTo(w * 0.3, h * 0.22); c.lineTo(w * 0.5, h * 0.42); c.lineTo(w * 0.7, h * 0.22); c.stroke();
    c.strokeStyle = '#e85d4a'; c.lineWidth = 10; c.beginPath(); c.moveTo(w * 0.6, h * 0.45); c.lineTo(w * 0.76, h * 0.62); c.moveTo(w * 0.76, h * 0.45); c.lineTo(w * 0.6, h * 0.62); c.stroke();
    c.fillStyle = '#e8e2d4'; c.font = 'bold 22px Arial, sans-serif'; c.textAlign = 'center'; c.fillText('CANNOT CONNECT', w / 2, h * 0.84);
    const a = (n || 0) * 0.25; c.strokeStyle = '#6ef0ff'; c.lineWidth = 6; c.beginPath(); c.arc(w * 0.18, h * 0.4, 16, a, a + 4.2); c.stroke();
  } });
  const SCREENS = [[DESK.x - 0.5, -1.4, 0.75], [-0.2, -3.7, -0.3], [6.0, -3.7, -0.3]];
  for (const [x, z, ry] of SCREENS) screen(x, z, ry, true);
  for (const [x, z, ry] of SCREENS) box(scene, { w: 0.16, h: 0.3, d: 0.16, color: '#2b2f3a', x, y: 2.14, z: z - 0.05, ry });
  box(scene, { w: 1.0, h: 0.08, d: 0.45, color: '#3b3f4a', x: DESK.x + 0.4, y: 2.14, z: -0.8, ry: 0.2 });                            // keyboard
  // Faxie's corner: pillar, side table, filing cabinet, a dead plant
  box(scene, { w: 1.2, h: 8, d: 1.2, color: '#d8cab0', x: FAX_X - 2.4, z: -1.6 });
  box(scene, { w: 2.8, h: TABLE_H, d: 1.5, color: '#9c8b72', x: FAX_X, z: FAX_Z - 0.1 });
  box(scene, { w: 1.4, h: 2.6, d: 1.4, color: '#7d8796', x: FAX_X - 2.4, z: 0.2 });
  for (let i = 0; i < 3; i++) box(scene, { w: 1.0, h: 0.06, d: 0.02, color: INK, x: FAX_X - 2.4, y: 0.6 + i * 0.8, z: 0.92, outline: 0 });
  box(scene, { w: 0.7, h: 0.7, d: 0.7, color: '#b5674a', x: FAX_X + 3.6, z: -3.0 });
  panel(scene, { w: 1.2, h: 1.6, x: FAX_X + 3.6, y: 1.55, z: -3.0, px: 160, outline: 0, draw: (c, w, h) => {
    c.clearRect(0, 0, w, h); c.strokeStyle = '#8a7a4a'; c.lineWidth = 8; c.lineCap = 'round';
    for (const [a, l] of [[-0.6, 0.7], [0.1, 0.9], [0.7, 0.6], [-0.2, 0.5]]) { c.beginPath(); c.moveTo(w / 2, h); c.quadraticCurveTo(w / 2 + Math.sin(a) * 40, h * (1 - l / 2), w / 2 + Math.sin(a) * w * 0.45, h * (1 - l) + 20); c.stroke(); }
  } }).group.children[0].material.transparent = true;
}

// ---------------- runtime ----------------
let stage, cards;
export async function setup(canvas) {
  stage = createStage(canvas);
  LIVE.length = 0;
  buildSet(stage);
  cards = { faxie: createCard(stage.scene, 'faxie'), t1: createCard(stage.scene, 't1'), t2: createCard(stage.scene, 't2'), bigsby: createCard(stage.scene, 'bigsby') };
}

function place(n) {
  const cam = cameraAt(n), c = stage.camera;
  c.position.set(...cam.pos); c.fov = cam.fov; c.updateProjectionMatrix(); c.lookAt(...cam.look); c.updateMatrixWorld();
  const b = bigsbyAt(n); cards.bigsby.set(b.svg, { x: b.x, z: b.z, shadowW: 1.5 });
  const f = faxieAt(n); cards.faxie.set(f.svg, { x: f.x, y: f.y, z: f.z, ground: TABLE_H, shadowW: 2.3 });
  cards.t1.set(traderAt(T1, n, { x: 4.9, flipStart: false, turnAt: 78, react: 'surprised', react2: 'point', react2At: 270 }).svg, { x: 4.9, z: -4.3, shadowW: 0 });
  cards.t2.set(traderAt(T2, n, { x: -1.0, flipStart: false, turnAt: 84, react: 'shrug', react2: 'surprised', react2At: 270 }).svg, { x: -1.0, z: -4.3, shadowW: 0 });
  for (const k in cards) { cards[k].face(c); cards[k].visible = true; }
  return cam;
}

export async function renderFrame(n) {
  place(n);
  for (const p of LIVE) p.update(n);
  await Promise.all(Object.values(cards).map(c => c.load()));
  stage.renderer.render(stage.scene, stage.camera);
  overlay(n);
}

// lower-third caption (HTML over the canvas)
function overlay(n) {
  const el = document.getElementById('lower');
  const a = clamp(seq(n, 8, 18)) * (1 - seq(n, 78, 88));
  el.style.opacity = a.toFixed(3);
  el.style.transform = `translateX(${((1 - ease(seq(n, 8, 18))) * -40).toFixed(1)}px)`;
}

// Full rules check over every frame: framing, events spacing, no foot slide.
export function checkAll() {
  const out = [];
  for (let n = 0; n < FRAMES; n++) {
    place(n);
    out.push(...checkFrame(n, cards, stage.camera, FRAME_RULES[shotAt(n).id]));
  }
  for (let i = 1; i <= EVENTS.length; i++) {
    const a = EVENTS[i - 1][0], b = i < EVENTS.length ? EVENTS[i][0] : FRAMES;
    if (b - a > 60) out.push(`nothing changes between frame ${a} and ${b} (${((b - a) / FPS).toFixed(1)} s)`);
  }
  // camera side: every camera sits on the +z side of the action line (z = B_Z)
  for (let n = 0; n < FRAMES; n++) if (cameraAt(n).pos[2] <= B_Z) out.push(`${n}: camera crossed the line`);
  // the walk gets him somewhere (toward Faxie), and his desk and Faxie's table don't overlap
  if (!(BX[WALK.end] < BX[WALK.start] - 1)) out.push('Bigsby barely moves during the walk');
  if (FAX_X + 1.4 > DESK.x - DESK.w / 2) out.push("Faxie's table overlaps Bigsby's desk");
  return { problems: out, walk: { from: BX[WALK.start], to: B_STOP_X, metres: B_START_X - B_STOP_X }, faxX: FAX_X };
}
