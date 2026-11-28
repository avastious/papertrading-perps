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
  [128, 'Bigsby goes from shock to fear'], [150, 'Bigsby turns toward the noise'], [165, 'CUT to two-shot'], [169, 'Bigsby starts walking over'], [196, 'paper starts coming out'],
  [235, 'Bigsby stops, feet together, and leans in'], [240, 'Faxie grins'], [246, 'Bigsby points: "a fax?!"'], [255, 'CUT to wide'],
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

// Bigsby: a hurried walk from his desk to the fax, frames 156-228: two stride cycles of 26 frames, then the last step
// lands and the back foot is brought up beside it, so he ends standing on both feet.
// The feet are planned first and the leg angles worked back from them (two-bone IK):
//   planted foot: slides straight back along the floor from +D to -D (so the body moves forward by exactly that);
//   swinging foot: lifts in an arc and only ever moves forward, from -D to +D.
// walkTrack then moves the body by exactly how far the planted foot pushes back, so nothing slides.
const WALK = { start: 169, cycle: 22, from: -0.25, strides: 2.25, close: 0.5 };   // from -0.25: both feet on the floor (ready stance)
WALK.end = WALK.start + Math.round((WALK.strides + WALK.close - WALK.from) * WALK.cycle);
const B_START_X = 1.9, B_Z = 0.15;
const LEG_HALF = BIG.legs.len / 2, STRIDE_D = 32, LIFT = 26;
const HIP_H = Math.sqrt((2 * LEG_HALF) ** 2 - STRIDE_D ** 2) * 0.985;   // hip height that keeps the leg just short of straight at full stride
function legIK(fx, fy) {                     // foot (fx forward, fy down) from the hip → [thigh, shin] angles (0 = down, + = forward)
  const d = Math.min(Math.hypot(fx, fy), 2 * LEG_HALF - 1e-6), phi = Math.atan2(fx, fy) * 180 / Math.PI;
  const alpha = Math.acos(d / (2 * LEG_HALF)) * 180 / Math.PI;
  return [phi + alpha, phi - alpha];          // knee bends forward, shin trails
}
function footAt(q) {                         // q in [0,1): 0-0.5 planted, 0.5-1 swinging
  q = ((q % 1) + 1) % 1;
  if (q < 0.5) return [STRIDE_D - 2 * STRIDE_D * (q / 0.5), HIP_H];
  const u = (q - 0.5) / 0.5;
  return [-STRIDE_D + 2 * STRIDE_D * ease(u), HIP_H - LIFT * Math.sin(Math.PI * u)];
}
function gait(phase) {
  const sw = Math.sin(Math.min(phase, WALK.strides) * 2 * Math.PI) * (1 - ease(seq(phase, WALK.strides, WALK.strides + WALK.close)));
  const arms = { armL: [26 * sw, 26 * sw + 22], armR: [12 - 14 * sw, 120 - 10 * sw] };   // near hand holds the phone up in front
  let fL, fR;
  if (phase <= WALK.strides) { fL = footAt(phase + 0.25); fR = footAt(phase + 0.75); }   // phase 0: left planted mid-stride, right mid-swing
  else {                                   // closing step: right foot planted at the front, left foot swings up beside it
    const u = clamp((phase - WALK.strides) / WALK.close);
    fR = [STRIDE_D * (1 - u), HIP_H];
    fL = [-STRIDE_D + STRIDE_D * ease(u), HIP_H - LIFT * 0.8 * Math.sin(Math.PI * u)];
  }
  return { lean: 6 * (1 - seq(phase, WALK.strides, WALK.strides + WALK.close)), bob: 0, head: 4, ...arms,
    legL: legIK(...fL), legR: legIK(...fR), shoeL: 0, shoeR: 0 };
}
const WALK_LEGS_END = (() => { const g = gait(WALK.strides + WALK.close); return { legL: g.legL, legR: g.legR, shoeL: 0, shoeR: 0 }; })();   // feet together
const walkPoseAt = n => gait(WALK.from + clamp(n - WALK.start, 0, WALK.end - WALK.start) / WALK.cycle);
let BX, B_STOP_X, FAX_X;
const FAX_Z = -0.55, TABLE_H = 1.35;

// pose helpers (angles: 0 = down, +90 = forward, 180 = up; Bigsby is flipped to face screen-left)
const STANCE = { legL: [-6, -4], legR: [6, 4] };
const POSE = {
  phoneA: { lean: 4, armR: [40, 150], armL: [55, 95], ...STANCE, head: -4, propHand: 'R' },     // staring at the phone, jabbing keys
  phoneB: { lean: 4, armR: [40, 138], armL: [62, 112], ...STANCE, head: -6, propHand: 'R' },
  shake: { lean: 8, armR: [52, 150], armL: [60, 100], ...STANCE, head: -10, propHand: 'R' },
  flinch: { lean: -9, bob: -6, armR: [18, 140], armL: [-24, 40], ...STANCE, head: -10, propHand: 'R' },
  jump: { ...P.POSES.surprised, ...gait(WALK.from), lean: -8, head: -6, armL: P.POSES.surprised.armL, armR: P.POSES.surprised.armR, propHand: 'R' },   // lands in walk-ready stance (legs move in the air)
  fear: { lean: -6, bob: 0, armR: [30, 120], armL: [-20, 60], legL: gait(WALK.from).legL, legR: gait(WALK.from).legR, shoeL: 0, shoeR: 0, head: 6, propHand: 'R' },
  lean: { lean: 16, bob: 0, armR: [30, 80], armL: [40, 70], ...WALK_LEGS_END, head: 10, propHand: 'R' },
  point: { lean: 6, bob: 0, armR: [88, 96], armL: [-10, -4], ...WALK_LEGS_END, head: 2, propHand: 'R' },          // jabs the phone at the page
  cheer: { lean: 2, bob: 0, armR: [150, 175], armL: [-30, -60], ...WALK_LEGS_END, head: -4, propHand: 'R' },
};

function bigsbyPose(n) {
  let pose, face = 'scared', look = 1.5, turn = 0.6;   // + = the way he faces = screen-left once flipped (phone/desk, then the fax). Measured: see checkAll.
  if (n < 30) { pose = Math.floor(n / 5) % 2 ? POSE.phoneA : POSE.phoneB; face = 'scared'; }                 // jab, jab: nothing (worried)
  else if (n < 66) { pose = lerpPose(POSE.shake, POSE.phoneB, (Math.sin(n * 1.3) + 1) / 2 * 0.7); face = 'angry'; }  // shakes the phone
  else if (n < 100) { pose = lerpPose(POSE.shake, POSE.flinch, ease(seq(n, 66, 71))); face = n < 76 ? 'surprised' : 'scared'; look = 1.6; turn = 0.8; }  // flinches at the shriek
  else if (n < 128) { pose = lerpPose(POSE.flinch, POSE.jump, ease(seq(n, 100, 106))); pose.bob = -26 * Math.sin(Math.PI * seq(n, 100, 116)); face = 'surprised'; look = 1.6; turn = 0.8; }
  else if (n < WALK.start) { pose = lerpPose(POSE.jump, POSE.fear, ease(seq(n, 128, 136))); face = 'scared'; look = 1.6; turn = n < 150 ? 0.3 : 0.3 + 0.5 * ease(seq(n, 150, 156)); if (n >= 150) pose = { ...pose, head: lerp(pose.head || 0, 14, ease(seq(n, 150, 156))) }; }
  else if (n < WALK.end) { pose = { ...walkPoseAt(n), propHand: 'R' }; if (n < WALK.start + 6) { const w = pose; pose = { ...lerpPose(POSE.fear, w, ease(seq(n, WALK.start, WALK.start + 6))), legL: w.legL, legR: w.legR, shoeL: 0, shoeR: 0 }; } face = 'scared'; look = 1.6; turn = 0.8; }   // blend the upper body only; legs stay on their planned paths
  else if (n < 246) { pose = lerpPose({ ...walkPoseAt(WALK.end), propHand: 'R' }, POSE.lean, ease(seq(n, WALK.end, WALK.end + 6))); face = n < 241 ? 'surprised' : 'scared'; look = 1.6; turn = 0.8; }
  else if (n < 284) { pose = lerpPose(POSE.lean, POSE.point, ease(seq(n, 246, 252))); face = ['talkA', 'talkB', 'surprised', 'talkA'][Math.floor((n - 246) / 5) % 4]; look = 1.6; turn = 0.8; }
  else { pose = lerpPose(POSE.point, POSE.cheer, ease(seq(n, 284, 290))); face = 'happy'; look = 1.6; turn = 0.8; }        // the page lands: he cheers
  return { pose, face, look, turn };
}
function bigsbyAt(n) {
  const { pose, face, look, turn } = bigsbyPose(n);
  return { svg: P.renderCharacter(BIG, { pose, face, look, turn, flip: true, shadow: false }), x: BX[n], z: B_Z };
}
// Track Bigsby's x through every frame from the poses actually shown (including the blends in and out of the walk).
BX = walkTrack(P, BIG, { from: B_START_X, frames: FRAMES, start: WALK.start, to: WALK.end, dir: -1, poseAt: n => bigsbyPose(n).pose });
B_STOP_X = BX[FRAMES - 1];
FAX_X = B_STOP_X - 2.75;

// Faxie: asleep and dusty → light flickers → shakes the dust off and shrieks → prints → grins.
function faxieAt(n) {
  const awake = n >= 48, shriek = n >= 66;
  const face = !awake ? 'blink' : !shriek ? 'surprised' : n >= 240 ? 'happy' : (Math.floor(n / 4) % 3 ? 'shriek' : 'surprised');
  const hop = shriek && n < 240 ? Math.abs(Math.sin(n * 0.9)) * 10 : 0;
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
  // the page coming out of the front slot (from 196), dropping into the tray at 285
  const out = ease(seq(n, 196, 250)), drop = ease(seq(n, 285, 292));
  if (out > 0) {
    const len = 18 + out * 70, y0 = -(FAX.legs.len + FAX.legs.shoeH * 0.55) - 12 + drop * 22;
    svg += `<g transform="translate(${shake.toFixed(1)} 0)"><path d="M-46 ${y0.toFixed(1)} L46 ${y0.toFixed(1)} L50 ${(y0 + len).toFixed(1)} L-42 ${(y0 + len + 4).toFixed(1)} Z" fill="#fffdf6" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>` +
      `<path d="M-30 ${(y0 + 18).toFixed(1)} h56 M-30 ${(y0 + 32).toFixed(1)} h44 M-30 ${(y0 + 46).toFixed(1)} h52" stroke="#9aa4b1" stroke-width="4" opacity="${clamp(len / 60).toFixed(2)}"/>` +
      (out > 0.85 ? `<text x="4" y="${(y0 + 66).toFixed(1)}" text-anchor="middle" font-family="Arial, sans-serif" font-weight="700" font-size="14" letter-spacing="0.5" fill="#d9483b">CONFIRM</text>` : '') + '</g>';
  }
  return { svg, x: FAX_X, z: FAX_Z, y: TABLE_H };
}
// Shriek waves: an effect on its own card, so they may enter a close-up from off-screen (the noise is off-camera).
function wavesAt(n) {
  const W = FAX.body.torsoW, H = FAX.body.torsoH, top = -(FAX.legs.len + 30 + H);
  const shriek = n >= 66;
  let svg = '<rect x="0" y="0" width="1" height="1" fill="none"/>';
  if (shriek && n < 290) {
    for (let k = 0; k < 3; k++) {
      const ph = ((n * 0.11 + k / 3) % 1), rr = 60 + ph * 190, op = (1 - ph * ph) * 0.95;
      for (const sd of [-1, 1]) svg += `<path d="M${(sd * (W / 2 + 14 + ph * 110)).toFixed(1)} ${(top + H * 0.3 - rr * 0.45).toFixed(1)} q${(sd * rr * 0.4).toFixed(1)} ${(rr * 0.45).toFixed(1)} 0 ${(rr * 0.9).toFixed(1)}" fill="none" stroke="#e85d4a" stroke-width="${(12 - ph * 6).toFixed(1)}" stroke-linecap="round" opacity="${op.toFixed(2)}"/>`;
    }
  }
  return svg;
}

// Back-row traders (behind desks, so only their top halves show).
function traderAt(spec, n, { x, flipStart, turnAt, react, react2, react2At }) {
  const turned = n >= turnAt;
  let pose = Math.floor(n / 9) % 2 ? { armL: [30, 100], armR: [40, 80], head: -4 } : { armL: [30, 100], armR: [46, 92], head: -6 };
  let face = 'scared';                        // email is down: worried, eyes on their own screens
  if (turned) {
    const base = P.POSES[n >= react2At ? react2 : react], w = Math.sin(n * 0.35) * 8;          // keep moving a little
    pose = { ...base, armL: [base.armL[0] + w, base.armL[1] + w], armR: [base.armR[0] - w, base.armR[1] - w], head: (base.head || 0) + Math.sin(n * 0.2) * 4 };
    face = n >= react2At ? (react2 === 'point' ? ['talkA', 'talkB'][Math.floor(n / 6) % 2] : 'happy') : 'surprised';
  }
  return { svg: P.renderCharacter(spec, { pose: { ...pose, propHand: 'none' }, face, look: turned ? 1.5 : 1.5, turn: turned ? 0.7 : 0.7, flip: turned ? true : flipStart, shadow: false }), x, z: -4.3 };
}

// "SKREEEE!" sound word over Faxie: bounces in at the shriek, jitters, gone once Faxie grins.
function sfxAt(n) {
  const on = (n >= 66 && n < 90) || (n >= 165 && n < 238);
  if (!on) return { svg: '', visible: false };
  const t = n < 90 ? seq(n, 66, 72) : 1, k = 0.4 + 0.6 * ease(t) + 0.06 * Math.sin(n * 1.9);
  const jx = Math.sin(n * 3.1) * 4, jy = Math.cos(n * 2.7) * 3;
  const word = n < 90 ? 'SKREEEE!' : 'SKREE!';
  const txt = (fill, sw) => `<text x="0" y="0" text-anchor="middle" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="64" font-style="italic" letter-spacing="2" fill="${fill}" stroke="${INK}" stroke-width="${sw}" stroke-linejoin="round" paint-order="stroke">${word}</text>`;
  return { visible: true, svg: `<g transform="translate(${jx.toFixed(1)} ${(-310 + jy).toFixed(1)}) rotate(-6) scale(${k.toFixed(3)})">${txt('#ffd23f', 12)}</g>` };
}

// ---------------- camera per shot ----------------
export const EXTRAS = { t2: 4.2, t2b: 4.2, t1: 5.35 };   // both colleagues sit on Bigsby's right (screen side never changes)
export const C_CAM = { dx: 3.1, z: 10.6 }, D_CAM = { x: 0.5, z: 15, lx: -1.1, ly: 3.6 };
export const B_CAM = { dx: 0.8, lx: 1.0, z: 6.9 };
function cameraAt(n) {
  const s = shotAt(n), t = (n - s.from) / (s.to - s.from), bx = BX[n];
  switch (s.id) {
    case 'A': return { pos: [lerp(-0.6, -0.8, t), 3.3, lerp(14.2, 13.2, ease(t))], look: [-0.8, 2.95, -1.4], fov: 36 };
    case 'B': { const ax = BX[90]; return { pos: [ax + B_CAM.dx, 3.6, B_CAM.z], look: [ax + B_CAM.lx, 3.3, 0], fov: 32 }; }
    case 'C': { const cx = FAX_X + C_CAM.dx; return { pos: [cx, 3.25, C_CAM.z], look: [cx, 2.6, -0.2], fov: 34 }; }   // square to the set: cards and walk share one axis
    case 'D': return { pos: [lerp(D_CAM.x, D_CAM.x - 0.3, t), 3.5, lerp(D_CAM.z, D_CAM.z - 0.5, t)], look: [D_CAM.lx, D_CAM.ly, -1.6], fov: 36 };
  }
}
// Which edges of which characters must stay in frame, per shot (close-ups crop at the waist on purpose).
const FRAME_RULES = {
  A: { bigsby: 'lrtb', faxie: 'lrtb', t1: 'lrt', t2: 'lrt', sfx: 'lrtb' },
  B: { bigsby: 'lrt', faxie: 'x', t1: 'x', t2: 'x' },
  C: { bigsby: 'lrtb', faxie: 'lrtb', t1: 'x', t2: 'x', sfx: 'lrtb' },
  D: { bigsby: 'lrtb', faxie: 'lrtb', t1: 'lrt', t2: 'lrt' },
};

// ---------------- the set ----------------
const DESK = { x: 0.95, w: 2.5 };
const SIGNS = {};                           // wall signs: must be fully in frame or fully out, never sliced
function buildSet(stage) {
  const { scene } = stage;
  scene.background = new stage.THREE.Color('#efe3cf');
  {                                                                                                          // carpet tiles (so camera moves read)
    const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d');
    x.fillStyle = '#6f7f8f'; x.fillRect(0, 0, 256, 256); x.fillStyle = '#67778a'; x.fillRect(0, 0, 128, 128); x.fillRect(128, 128, 128, 128);
    x.strokeStyle = 'rgba(29,26,36,0.25)'; x.lineWidth = 3; x.strokeRect(0, 0, 256, 256); x.beginPath(); x.moveTo(128, 0); x.lineTo(128, 256); x.moveTo(0, 128); x.lineTo(256, 128); x.stroke();
    const tex = new stage.THREE.CanvasTexture(c); tex.wrapS = tex.wrapT = stage.THREE.RepeatWrapping; tex.repeat.set(20, 13); tex.colorSpace = stage.THREE.SRGBColorSpace; tex.anisotropy = 8;
    const floor = new stage.THREE.Mesh(new stage.THREE.PlaneGeometry(40, 26), new stage.THREE.MeshLambertMaterial({ map: tex }));
    floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0, -1); scene.add(floor);
  }
  box(scene, { w: 40, h: 11, d: 0.3, color: '#e9dcc4', z: -7.2, outline: 0 });                                // back wall
  const r = rng(3);
  panel(scene, { w: 30, h: 4.2, x: 3, y: 4.6, z: -7.0, px: 420, outline: 0.08, draw: (x, w, h) => {      // windows: early-morning city
    const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#f6c9a0'); g.addColorStop(0.7, '#fbe6c8'); x.fillStyle = g; x.fillRect(0, 0, w, h);
    x.fillStyle = '#ffd98a'; x.beginPath(); x.arc(w * 0.78, h * 0.62, h * 0.1, 0, 7); x.fill();
    for (let i = 0; i < 34; i++) { const bw = 40 + r() * 70, bh = h * (0.25 + r() * 0.6), bx = i * (w / 34) + r() * 10; x.fillStyle = i % 3 ? '#9a8fa8' : '#86799a'; x.fillRect(bx, h - bh, bw, bh);
      x.fillStyle = '#f7e2b0'; for (let yy = h - bh + 12; yy < h - 10; yy += 22) for (let xx = bx + 8; xx < bx + bw - 10; xx += 16) if (r() > 0.55) x.fillRect(xx, yy, 7, 10); }
    x.fillStyle = INK; for (let i = 1; i < 8; i++) x.fillRect(i * w / 8 - 4, 0, 8, h);                         // mullions
  } });
  // market clock + ticker board on the back wall
  SIGNS.ticker = panel(scene, { w: 7, h: 0.8, x: 0.5, y: 8.6, z: -6.98, px: 90, outline: 0.06, live: true, draw: (x, w, h, n) => {
    x.fillStyle = '#16141c'; x.fillRect(0, 0, w, h); x.font = 'bold 56px Arial, sans-serif'; x.fillStyle = '#ffb347';
    const down = n >= 45;                                                            // from 1.5 s: email is down, and stays down
    x.textAlign = 'center'; x.fillStyle = down ? (Math.floor(n / 12) % 2 ? '#ff6b5a' : '#c9453a') : '#ffb347';
    x.fillText(down ? 'EMAIL: NOT CONNECTED' : 'MARKET OPENS 09:00', w / 2, 68);
  } });
  SIGNS.clock = panel(scene, { w: 1.3, h: 1.3, x: 5.2, y: 8.6, z: -6.98, px: 200, outline: 0, live: true, draw: (x, w, h, n) => {
    x.clearRect(0, 0, w, h); x.fillStyle = '#e9dcc4'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#fffaf0'; x.strokeStyle = INK; x.lineWidth = 12; x.beginPath(); x.arc(100, 100, 88, 0, 7); x.fill(); x.stroke();
    const hand = (a, l, wd) => { x.lineWidth = wd; x.beginPath(); x.moveTo(100, 100); x.lineTo(100 + Math.sin(a) * l, 100 - Math.cos(a) * l); x.stroke(); };
    const sec = 47 * 60 + 12 + n / FPS;                                                                         // 08:47:12 at frame 0
    hand((8 + sec / 3600) / 12 * 2 * Math.PI, 46, 10); hand(sec / 3600 * 2 * Math.PI, 70, 7); x.strokeStyle = '#d9483b'; hand((sec % 60) / 60 * 2 * Math.PI, 74, 3);
  } });
  // desks: Bigsby's (front), two in the back row
  const desk = (x, z, w, d) => { box(scene, { w, h: 0.14, d, color: '#c9b79a', x, y: 2.0, z }); for (const sx of [-1, 1]) box(scene, { w: 0.14, h: 2.0, d: d * 0.9, color: '#8b7a64', x: x + sx * (w / 2 - 0.2), z }); };
  desk(DESK.x, -1.3, DESK.w, 1.6);
  desk(0.4, -3.5, 3.0, 1.4); desk(3.9, -3.5, 3.0, 1.4);
  desk(10.0, -3.5, 3.6, 1.4); box(scene, { w: 3.6, h: 1.9, d: 0.08, color: '#b6a385', x: 10.0, z: -2.82 });
  desk(9.0, -0.6, 3.0, 1.4);
  box(scene, { w: 13.6, h: 1.9, d: 0.06, color: '#b6a385', x: 5.3, z: -2.8 });                      // one modesty panel along the whole back row            // modesty panels hide back-row legs
  desk(7.1, -3.5, 2.8, 1.4);
  const screen = (x, z, ry, live) => panel(scene, { w: 1.5, h: 0.95, x, y: 2.75, z, ry, px: 180, live, outline: 0.07, draw: (c, w, h, n) => {
    c.fillStyle = '#1e2a38'; c.fillRect(0, 0, w, h);
    c.strokeStyle = '#e8e2d4'; c.lineWidth = 8; c.strokeRect(w * 0.3, h * 0.22, w * 0.4, h * 0.36); c.beginPath(); c.moveTo(w * 0.3, h * 0.22); c.lineTo(w * 0.5, h * 0.42); c.lineTo(w * 0.7, h * 0.22); c.stroke();
    c.strokeStyle = '#e85d4a'; c.lineWidth = 10; c.beginPath(); c.moveTo(w * 0.6, h * 0.45); c.lineTo(w * 0.76, h * 0.62); c.moveTo(w * 0.76, h * 0.45); c.lineTo(w * 0.6, h * 0.62); c.stroke();
    c.fillStyle = '#e8e2d4'; c.font = 'bold 22px Arial, sans-serif'; c.textAlign = 'center'; c.fillText('CANNOT CONNECT', w / 2, h * 0.84);
    const a = (n || 0) * 0.25; c.strokeStyle = '#6ef0ff'; c.lineWidth = 6; c.beginPath(); c.arc(w * 0.18, h * 0.4, 16, a, a + 4.2); c.stroke();
  } });
  const SCREENS = [[DESK.x - 0.5, -1.4, 0.75], [EXTRAS.t2 + 0.8, -3.7, -0.3], [EXTRAS.t1 + 0.8, -3.7, -0.3]];
  for (const [x, z, ry] of SCREENS) screen(x, z, ry, true);
  screen(10.4, -3.7, -0.3, false); screen(9.2, -0.8, -0.5, false);
  for (const [x, z, ry] of SCREENS) box(scene, { w: 0.16, h: 0.26, d: 0.12, color: '#2b2f3a', x: x - 0.16 * Math.sin(ry), y: 2.14, z: z - 0.16 * Math.cos(ry), ry });   // stand sits behind its screen
  box(scene, { w: 1.0, h: 0.08, d: 0.45, color: '#3b3f4a', x: DESK.x + 0.4, y: 2.14, z: -0.8, ry: 0.2 });                            // keyboard
  // Faxie's corner: pillar, side table, filing cabinet, a dead plant
  box(scene, { w: 1.2, h: 11, d: 1.2, color: '#d8cab0', x: FAX_X - 2.4, z: -1.6 });
  box(scene, { w: 2.8, h: TABLE_H, d: 1.5, color: '#9c8b72', x: FAX_X, z: FAX_Z - 0.1 });
  box(scene, { w: 1.4, h: 2.6, d: 1.4, color: '#7d8796', x: FAX_X - 2.4, z: 0.2 });
  for (let i = 0; i < 3; i++) box(scene, { w: 1.0, h: 0.06, d: 0.02, color: INK, x: FAX_X - 2.4, y: 0.6 + i * 0.8, z: 0.92, outline: 0 });
  // (the dead plant was removed in v6: the close-up's bottom edge sliced its pot)
}

// ---------------- runtime ----------------
let stage, cards;
export async function setup(canvas) {
  stage = createStage(canvas);
  LIVE.length = 0;
  buildSet(stage);
  cards = { waves: createCard(stage.scene, 'waves'), sfx: createCard(stage.scene, 'sfx'), faxie: createCard(stage.scene, 'faxie'), t1: createCard(stage.scene, 't1'), t2: createCard(stage.scene, 't2'), bigsby: createCard(stage.scene, 'bigsby') };
}

function place(n) {
  const cam = cameraAt(n), c = stage.camera;
  c.position.set(...cam.pos); c.fov = cam.fov; c.updateProjectionMatrix(); c.lookAt(...cam.look); c.updateMatrixWorld();
  const b = bigsbyAt(n); cards.bigsby.set(b.svg, { x: b.x, z: b.z, shadowW: 1.8 });
  const f = faxieAt(n); cards.faxie.set(f.svg, { x: f.x, y: f.y, z: f.z, ground: TABLE_H, shadowW: 2.3 });
  cards.waves.set(wavesAt(n), { x: FAX_X, y: TABLE_H, z: FAX_Z + 0.01, ground: TABLE_H, shadowW: 0 });
  cards.t1.set(traderAt(T1, n, { x: EXTRAS.t1, flipStart: false, turnAt: 78, react: 'surprised', react2: 'point', react2At: 270 }).svg, { x: EXTRAS.t1, z: -4.3, shadowW: 0 });
  const t2x = lerp(EXTRAS.t2, EXTRAS.t2b, ease(seq(n, 80, 88)));
  cards.t2.set(traderAt(T2, n, { x: t2x, flipStart: false, turnAt: 84, react: 'surprised', react2: 'surprised', react2At: 270 }).svg, { x: t2x, z: -4.3, shadowW: 0 });
  const fx = sfxAt(n); cards.sfx.set(fx.svg || '<rect width="1" height="1" fill="none"/>', { x: FAX_X, y: TABLE_H, z: FAX_Z + 0.4, ground: TABLE_H, shadowW: 0 });
  for (const k in cards) { cards[k].face(c); cards[k].visible = true; }
  cards.sfx.visible = fx.visible;
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

// Screen position (px) of Bigsby's planted ankle at frame n (leg = force which leg).
function footScreen(n, leg) {
  place(n);
  const { pose } = bigsbyPose(n), p = { ...P.POSES.stand, ...pose };
  const half = BIG.legs.len / 2, r = Math.PI / 180, hipX = (BIG.body.hipW || BIG.body.torsoW) * 0.22;
  const reach = a => half * (Math.cos(a[0] * r) + Math.cos(a[1] * r));
  leg = leg || (reach(p.legL) >= reach(p.legR) ? 'L' : 'R');
  const a = leg === 'L' ? p.legL : p.legR;
  const hipH = Math.max(reach(p.legL), reach(p.legR)) + BIG.legs.shoeH * 0.55 - (p.bob || 0);
  const fx = (leg === 'L' ? -hipX : hipX) + half * (Math.sin(a[0] * r) + Math.sin(a[1] * r));
  const fy = -hipH - 4 + reach(a);
  // the sole: heel and toe of the shoe, after the shoe's tilt (as the rig draws it)
  const L = BIG.legs, sh = (leg === 'L' ? p.shoeL : p.shoeR), ang = (sh != null ? sh : -a[1]) * r;
  const rot = (dx, dy) => [fx + dx * Math.cos(ang) - dy * Math.sin(ang), fy + dx * Math.sin(ang) + dy * Math.cos(ang)];
  const pts = [rot(-L.w * 0.55, L.shoeH * 0.55), rot(L.shoeLen * 0.62, L.shoeH * 0.55)];
  cards.bigsby.group.updateMatrixWorld(true);
  // sole points in the room, in puppet pixels (1 px = 0.01 world units): a planted shoe must not move here, whatever the camera does
  const proj = ([x, y]) => { const v = new stage.THREE.Vector3(-x * S, -y * S, 0).applyMatrix4(cards.bigsby.group.matrixWorld); return [v.x / S, v.y / S, v.z / S]; };
  const sole = pts.map(proj);
  const v = new stage.THREE.Vector3(-fx * S, -fy * S, 0);          // flipped puppet: x mirrors
  v.applyMatrix4(cards.bigsby.group.matrixWorld).project(stage.camera);
  const grounded = Math.abs(hipH - (p.bob ? 0 : 0) - reach(a) - BIG.legs.shoeH * 0.55 + (p.bob || 0)) < 1.0 && !(p.bob < -0.5);
  return { leg, grounded, sole, px: [(v.x + 1) / 2 * 1920, (1 - v.y) / 2 * 1080] };
}

export function feet(n) { return { L: footScreen(n, 'L').px.map(Math.round), R: footScreen(n, 'R').px.map(Math.round), planted: footScreen(n).leg }; }

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
  // no foot slides: any foot touching the floor in two frames of the same shot must not move (on screen, visible feet only)
  for (let n = 1; n < FRAMES; n++) {
    if (shotAt(n) !== shotAt(n - 1)) continue;
    for (const leg of ['L', 'R']) {
      const a = footScreen(n - 1, leg), b = footScreen(n, leg);
      if (!a.grounded || !b.grounded || a.px[1] > 1080 || b.px[1] > 1080) continue;
      const d = Math.max(...[0, 1].map(i => Math.hypot(...[0, 1, 2].map(k => a.sole[i][k] - b.sole[i][k]))));   // heel and toe, in the room
      if (d > 0.5) out.push(`${n}: ${leg === 'L' ? 'far' : 'near'} shoe slides ${d.toFixed(1)} px along the floor`);
    }
  }
  // and no slow creep: while a shoe stays on the floor within one shot, it may not wander more than 2 px in total
  for (const leg of ['L', 'R']) {
    let anchor = null;
    for (let n = 0; n < FRAMES; n++) {
      const f = footScreen(n, leg);
      if (!f.grounded || f.px[1] > 1080 || (n && shotAt(n) !== shotAt(n - 1))) { anchor = f.grounded ? f : null; continue; }
      if (!anchor) { anchor = f; continue; }
      const d = Math.max(...[0, 1].map(i => Math.hypot(...[0, 1, 2].map(k => anchor.sole[i][k] - f.sole[i][k]))));
      if (d > 1) { out.push(`${n}: ${leg === 'L' ? 'far' : 'near'} shoe has crept ${d.toFixed(1)} px since it was planted`); anchor = f; }
    }
  }
  // eyeline: from the shriek on, Bigsby's pupils sit on the fax's side of his eyes (measured from the drawing)
  for (let n = 66; n < FRAMES; n++) {
    const { look, face } = bigsbyPose(n);
    if (face === 'blink' || face === 'happy') continue;
    const svg = P.renderCharacter(BIG, { look, face, flip: true });
    const eye = +(svg.match(/<ellipse cx="(-?[\d.]+)"[^>]*rx="13"/) || [])[1], pupil = +(svg.match(/<circle cx="(-?[\d.]+)"[^>]*r="(?:[3-9]|1\d)(?:\.\d)?" fill="#1d1a24"/) || [])[1];
    if (!(pupil > eye)) out.push(`${n}: Bigsby is not looking toward the fax`);           // flipped: local +x is screen-left
  }
  // wall signs: fully in or fully out of frame
  for (let n = 0; n < FRAMES; n++) {
    place(n);
    for (const [name, sg] of Object.entries(SIGNS)) {
      const g = sg.group, m = g.children[0]; g.updateMatrixWorld(true);
      const pts = [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b]) => { const w = m.geometry.parameters.width / 2, h = m.geometry.parameters.height / 2;
        const v = new stage.THREE.Vector3(a * w, b * h, 0).applyMatrix4(g.matrixWorld).project(stage.camera); return [(v.x + 1) / 2, (1 - v.y) / 2]; });
      const inside = pts.every(([x, y]) => x >= 0 && x <= 1 && y >= 0 && y <= 1), outside = pts.every(p => p[1] < 0) || pts.every(p => p[1] > 1) || pts.every(p => p[0] < 0) || pts.every(p => p[0] > 1);
      if (!inside && !outside) out.push(`${n}: the ${name} sign is sliced by the frame edge`);
    }
  }
  // camera side: every camera sits on the +z side of the action line (z = B_Z)
  for (let n = 0; n < FRAMES; n++) if (cameraAt(n).pos[2] <= B_Z) out.push(`${n}: camera crossed the line`);
  // the walk gets him somewhere (toward Faxie), and his desk and Faxie's table don't overlap
  if (!(BX[WALK.end] < BX[WALK.start] - 1)) out.push('Bigsby barely moves during the walk');
  if (FAX_X + 1.4 > DESK.x - DESK.w / 2) out.push("Faxie's table overlaps Bigsby's desk");
  return { problems: out, walk: { from: BX[WALK.start], to: B_STOP_X, metres: B_START_X - B_STOP_X }, faxX: FAX_X };
}
