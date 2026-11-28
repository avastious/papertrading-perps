// The beat engine: turns a beat spec (set, actors, timeline, sprites, shots) into a deterministic scene.
// Everything is a pure function of the frame number. Rules enforced (and checked by checkAll):
//  - camera on the +z side, square to the set, one locked camera per shot, auto-framed to fit its subjects above the captions;
//  - walks are planned from the feet (two-bone IK); the body moves exactly as far as the planted foot pushes back;
//    every puppet stands in the same stance a walk starts and ends in, so legs never blend (no sliding);
//  - nothing targeted is cut by the frame; background actors/sprites are fully in or fully out; signs never sliced;
//  - something changes at least every 2 s.
import * as THREE from '../node_modules/three/build/three.module.js';
import { createStage, createCard, checkFrame, lerpPose, seq, ease, lerp, clamp, FPS, S, LIVE } from './stage.js';
import { SETS } from './sets.js';
import { SPRITES } from './sprites.js';

const P = globalThis.Puppet, CAST = globalThis.CAST;
const FOV = 34, ASPECT = 16 / 9, TANH = Math.tan(FOV / 2 * Math.PI / 180);
const R2D = 180 / Math.PI;

// ---------- upper-body poses (legs always come from the stance or the walk) ----------
export const POSES = {
  stand: {}, point: { ...P.POSES.point }, shrug: { ...P.POSES.shrug }, surprised: { ...P.POSES.surprised },
  armsUp: { armL: [-150, -170], armR: [150, 170], lean: -4 },
  ears: { lean: -6, armR: [150, 215], armL: [-150, -215], head: -6 },
  phone: { armR: [40, 150], armL: [-8, -4], head: -4 },
  phoneEar: { armR: [150, 200], armL: [-8, -4], head: -6 },
  wave: { armR: [150, 175], armL: [-8, -4] },
  think: { armR: [40, 160], armL: [-30, 60], head: 8 },
  type: { armR: [60, 95], armL: [55, 90], lean: 6, head: -6 },
  facepalm: { armR: [70, 175], armL: [-8, -4], head: 10, lean: 6 },
  hips: { armR: [30, -40], armL: [-30, 40] },
  reach: { armR: [85, 90], armL: [60, 80], lean: 12 },
  cheer: { armR: [150, 175], armL: [-150, -175] },
  slump: { armR: [8, 4], armL: [-8, -4], lean: 10, head: 14 },
  tip: { armR: [150, 200], armL: [-8, -4], head: 6 },
  hold: { armR: [60, 120], armL: [60, 110] },
  sweat: { armR: [120, 190], armL: [-8, -4], head: 4 },
};
const NO_BLINK = new Set(['blink', 'happy', 'shriek', 'angry']);

// ---------- walking: feet first ----------
function gaitKit(spec) {
  const len = spec.legs.len, half = len / 2, D = 0.235 * len, LIFT = 0.19 * len;
  const HIP_H = Math.sqrt((2 * half) ** 2 - D ** 2) * 0.985, HIP_X = (spec.body.hipW || spec.body.torsoW) * 0.22;
  const IK = (fx, fy) => {
    const d = Math.min(Math.hypot(fx, fy), 2 * half - 1e-6), phi = Math.atan2(fx, fy) * R2D, al = Math.acos(d / (2 * half)) * R2D;
    return [phi + al, phi - al];
  };
  const legs = (fL, fR) => ({ legL: IK(fL[0] + HIP_X, fL[1]), legR: IK(fR[0] - HIP_X, fR[1]), shoeL: 0, shoeR: 0 });
  const footAt = q => { q = ((q % 1) + 1) % 1; if (q < 0.5) return [D - 2 * D * (q / 0.5), HIP_H]; const u = (q - 0.5) / 0.5; return [-D + 2 * D * ease(u), HIP_H - LIFT * Math.sin(Math.PI * u)]; };
  const stance = legs([-0.55 * D, HIP_H], [0, HIP_H]);
  // steps: 1 opening + m (odd) middle + 1 closing; u in [0, steps] (each step = half a stride cycle)
  const at = (u, steps) => {
    const m = steps - 2;
    if (u <= 0) return stance;
    if (u < 1) return legs([-0.55 * D + 1.55 * D * ease(u), HIP_H - LIFT * Math.sin(Math.PI * u)], [-D * u, HIP_H]);
    if (u < 1 + m) { const p = 0.75 + (u - 1) * 0.5; return legs(footAt(p + 0.25), footAt(p + 0.75)); }
    if (u < steps) { const v = u - 1 - m; return legs([-D + 0.45 * D * ease(v), HIP_H - LIFT * 0.8 * Math.sin(Math.PI * v)], [D * (1 - v), HIP_H]); }
    return stance;
  };
  return { at, stance, half, HIP_X, D };
}
const validSteps = s => { s = Math.max(3, Math.round(s)); return s % 2 ? s : s + 1; };   // 1 open + odd middle + 1 close

// ---------- build ----------
export function makeBeat(spec, meta) {
  const FRAMES = spec.frames || meta.frames;
  const T = t => Math.round(t * FPS);
  const actors = Object.entries(spec.actors || {}).map(([id, a]) => {
    const sp = typeof a.who === 'string' ? CAST[a.who] : a.who;
    return { id, a, sp, gait: sp.legs ? gaitKit(sp) : null, isHuman: !!sp.head?.r };
  });
  const tl = (spec.tl || []).map(e => ({ n: T(e[0]), id: e[1], c: e[2] })).sort((x, y) => x.n - y.n);
  const sprites = Object.entries(spec.sprites || {}).map(([id, s]) => ({ id, s }));

  // ---- actor state at frame n (pose, face, flip, walking) ----
  function stateAt(A, n) {
    const a = A.a; const st = { pose: a.pose || 'stand', face: a.face || 'neutral', look: a.look ?? 0.5, turn: a.turn ?? 0, flip: !!a.flip, visible: a.visible !== false,
      prevPose: a.pose || 'stand', poseN: -99, walk: null, hop: null, talk: null, flipN: -99, extra: {} };
    for (const e of tl) {
      if (e.id !== A.id || e.n > n) continue;
      const c = e.c;
      if (c.pose) { st.prevPose = st.pose; st.pose = c.pose; st.poseN = e.n; }
      if (c.face) st.face = c.face; if (c.look != null) st.look = c.look; if (c.turn != null) st.turn = c.turn;
      if (c.flip != null && c.flip !== st.flip) { st.flip = c.flip; st.flipN = e.n; }
      if (c.visible != null) st.visible = c.visible;
      if (c.walk) { const steps = validSteps(c.walk.steps || 5), cyc = c.walk.cycle || 24; st.walk = { n0: e.n, steps, cyc, dir: c.walk.dir || 1, len: Math.round(steps * cyc / 2) };
        const fl = st.walk.dir < 0; if (fl !== st.flip) { st.flip = fl; st.flipN = e.n; } }
      if (c.hop) st.hop = { n0: e.n, h: c.hop.h || 30, len: T(c.hop.dur || 0.4) };
      if (c.talk) st.talk = { n0: e.n, len: T(c.talk) };
      if (c.extra) Object.assign(st.extra, c.extra);
    }
    return st;
  }
  function poseAt(A, n, st = stateAt(A, n)) {
    const name = st.pose, cur = typeof name === 'object' ? name : POSES[name] || {}, prev = typeof st.prevPose === 'object' ? st.prevPose : POSES[st.prevPose] || {};
    let p = lerpPose({ ...P.POSES.stand, ...prev }, { ...P.POSES.stand, ...cur }, ease(seq(n, st.poseN, st.poseN + 6)));
    p.head = (p.head || 0) + Math.sin(n * 0.07 + A.id.length) * 2;                           // idle sway
    if (A.gait) Object.assign(p, A.gait.stance);
    let walking = false;
    if (st.walk && A.gait && n >= st.walk.n0 && n < st.walk.n0 + st.walk.len) {
      const u = (n - st.walk.n0) / st.walk.len * st.walk.steps; walking = true;
      Object.assign(p, A.gait.at(u, st.walk.steps));
      const sw = Math.sin(u * Math.PI) * (u > 0.5 && u < st.walk.steps - 0.5 ? 1 : 0.4);
      if (!cur.armR) { p.armL = [26 * sw, 26 * sw + 22]; p.armR = [-26 * sw, -26 * sw + 22]; }
      p.lean = (p.lean || 0) + 5;
    }
    p.bob = 0;
    if (st.hop && n >= st.hop.n0 && n < st.hop.n0 + st.hop.len) p.bob = -st.hop.h * Math.sin(Math.PI * (n - st.hop.n0) / st.hop.len);
    p.propHand = A.a.propHand || (A.sp.prop && A.sp.prop !== 'none' ? 'R' : 'none');
    if (A.a.noProp) p.propHand = 'none';
    let face = st.face;
    if (st.talk && n >= st.talk.n0 && n < st.talk.n0 + st.talk.len) face = ['talkA', 'talkB', 'talkA', st.face][Math.floor((n - st.talk.n0) / 4) % 4];
    else if (!NO_BLINK.has(face) && (n + A.id.length * 17) % 97 < 3) face = 'blink';
    return { p, face, walking };
  }
  // x track: integrate planted-foot motion during walks
  const XS = new Map();
  for (const A of actors) {
    const xs = new Float64Array(FRAMES); let x = A.a.x || 0;
    const footX = (p, leg) => { const r = Math.PI / 180, half = A.sp.legs.len / 2, hx = A.gait.HIP_X; const a = leg === 'L' ? p.legL : p.legR; return (leg === 'L' ? -hx : hx) + half * (Math.sin(a[0] * r) + Math.sin(a[1] * r)); };
    const reach = a => Math.cos(a[0] * Math.PI / 180) + Math.cos(a[1] * Math.PI / 180);
    for (let n = 0; n < FRAMES; n++) {
      if (n > 0 && A.gait) {
        const st = stateAt(A, n);
        if (st.walk && n > st.walk.n0 && n <= st.walk.n0 + st.walk.len) {
          const pa = poseAt(A, n - 1).p, pb = poseAt(A, n).p;
          const dl = reach(pa.legL) - reach(pa.legR), dn = reach(pb.legL) - reach(pb.legR);
          const leg = Math.abs(dl) > 1e-6 ? (dl > 0 ? 'L' : 'R') : (dn >= 0 ? 'L' : 'R');
          x += -(footX(pb, leg) - footX(pa, leg)) * S * (A.a.scale || 1) * st.walk.dir;
        }
      }
      xs[n] = x;
    }
    XS.set(A.id, xs);
  }
  const spriteAt = (Sp, n) => {
    const s = Sp.s, keys = s.keys || [];
    let st = { x: s.x || 0, y: s.y || 0, z: s.z ?? 0, s: s.s ?? 1, o: s.o ?? 1, r: s.r || 0 };
    for (let i = 0; i < keys.length; i++) {
      const [t, k] = keys[i], kn = T(t), prev = i ? T(keys[i - 1][0]) : kn;
      if (n >= kn) Object.assign(st, k);
      else if (i && n > prev) { const u = ease((n - prev) / (kn - prev)); for (const key in k) st[key] = lerp(st[key], k[key], u); break; }
      else break;
    }
    const on = n >= T(s.from ?? 0) && n < T(s.to ?? 1e9) && st.o > 0.01;
    return { ...st, on };
  };

  let stage, cards = {}, sets, SHOTS = [], CAMS = [];
  const shotList = (spec.shots || [{ t: 0, kind: 'wide' }]).map((s, i, arr) => ({ ...s, from: T(s.t), to: i + 1 < arr.length ? T(arr[i + 1].t) : FRAMES, id: String.fromCharCode(65 + i) }));
  const shotAt = n => shotList.find(s => n >= s.from && n < s.to) || shotList[shotList.length - 1];

  function place(n) {
    for (const A of actors) {
      const st = stateAt(A, n), c = cards[A.id];
      const { p, face } = poseAt(A, n, st);
      const svg = P.renderCharacter(A.sp, { pose: p, face, look: st.look * (st.flip ? 1 : 1), turn: st.turn, flip: st.flip, shadow: false, scale: A.a.scale || 1 })
        + (A.a.overlay ? A.a.overlay(n, st) : '');
      c.set(svg, { x: XS.get(A.id)[n], y: A.a.y || 0, z: A.a.z || 0, ground: A.a.y || 0, shadowW: (A.sp.body.torsoW || 120) * 0.014 * (A.a.scale || 1) });
      c.visible = st.visible;
    }
    for (const Sp of sprites) {
      const st = spriteAt(Sp, n), c = cards['s:' + Sp.id];
      const draw = SPRITES[Sp.s.draw];
      const inner = `<g transform="rotate(${st.r}) scale(${st.s})">${draw(typeof Sp.s.args === 'function' ? Sp.s.args(n) : (Sp.s.args || {}), n)}</g>`;
      c.set(inner, { x: st.x, y: st.y, z: st.z, ground: 0, shadowW: Sp.s.shadow ? Sp.s.shadow * st.s : 0 });
      c.visible = st.on; c.mesh.material.opacity = st.o; c.mesh.renderOrder = Sp.s.behind ? -1 : 0;
    }
  }
  // world rectangle of a card (camera square-on, so local x = world x)
  const rectOf = (c, topFrac = 1) => {
    const b = c.bbox, g = c.group.position, PAD = 24;          // include the ink strokes (bbox has 34 px padding; strokes ~9 px)
    const x0 = g.x + (b.x + PAD) * S, x1 = g.x + (b.x + b.w - PAD) * S, top = g.y - (b.y + PAD) * S, bot = g.y - (b.y + b.h - PAD) * S;
    return { x0, x1, top, bot: topFrac < 1 ? top - (top - bot) * topFrac : bot, z: g.z };
  };
  // Camera per shot: fit the subjects above the caption band, then search nearby cameras (zoom, raise, slide) for the
  // first one that obeys every framing rule over the whole shot. Positions are recorded once per shot and the
  // candidates are tested by projection only, so the search is cheap.
  function fitCameras() {
    const tmp = new THREE.PerspectiveCamera(FOV, ASPECT, 0.1, 200);
    const signRects = Object.values(sets.signs || {}).map(sg => { const g = sg.group, m = g.children[0]; g.updateMatrixWorld(true); const w = m.geometry.parameters.width / 2, h = m.geometry.parameters.height / 2;
      return [[-w, -h], [w, -h], [-w, h], [w, h]].map(([x, y]) => new THREE.Vector3(x, y, 0).applyMatrix4(g.matrixWorld)); });
    const proj = (cam, pts) => { const s = pts.map(v => v.clone().project(cam)).map(v => [(v.x + 1) / 2, (1 - v.y) / 2]); return { l: Math.min(...s.map(p => p[0])), r: Math.max(...s.map(p => p[0])), t: Math.min(...s.map(p => p[1])), b: Math.max(...s.map(p => p[1])) }; };
    CAMS = shotList.map(sh => {
      const ids = sh.on || [...actors.filter(A => !A.a.extra).map(A => A.id), ...sprites.filter(s => !s.s.fx && !s.s.extra).map(s => 's:' + s.id)];
      const samples = [];
      let X0 = 1e9, X1 = -1e9, TOP = -1e9, BOT = 1e9, Z = -1e9, any = false;
      for (let n = sh.from; n < sh.to; n += 3) {
        place(n); const rec = [];
        for (const id in cards) { const c = cards[id]; if (!c.visible || (id.startsWith('s:') && sprites.find(s => 's:' + s.id === id).s.fx)) continue;
          const full = rectOf(c), r = ids.includes(id) && sh.kind === 'close' ? rectOf(c, sh.crop || 0.55) : full;
          rec.push({ id, target: ids.includes(id), pts: [[r.x0, r.top], [r.x1, r.top], [r.x0, r.bot], [r.x1, r.bot]].map(([x, y]) => new THREE.Vector3(x, y, r.z)) });
          if (ids.includes(id)) { X0 = Math.min(X0, r.x0); X1 = Math.max(X1, r.x1); TOP = Math.max(TOP, r.top); BOT = Math.min(BOT, r.bot); Z = Math.max(Z, r.z); any = true; } }
        samples.push(rec);
      }
      if (sh.kind === 'wide' && sets.frame) { X0 = Math.min(X0, sets.frame.x0); X1 = Math.max(X1, sets.frame.x1); TOP = Math.max(TOP, sets.frame.top); BOT = Math.min(BOT, sets.frame.bot); any = true; Z = Math.max(Z, 0); }
      if (!any) { X0 = -3; X1 = 3; TOP = 4; BOT = 0; Z = 0; }
      const w = X1 - X0, h = TOP - BOT, minH = { wide: 7.5, medium: 5, two: 5.5, close: 2.6 }[sh.kind] || 5;
      const base = { Hf: Math.max(h / 0.7, w / (0.86 * ASPECT), minH) * (sh.zoom || 1), cx: (X0 + X1) / 2 + (sh.dx || 0), bot: BOT, h };
      const make = (zf, dy, dx) => { const Hf = base.Hf * zf, d = Hf / 2 / TANH, frameBot = base.bot - 0.21 * Hf - (Hf - base.h / 0.7) * 0.15, cy = frameBot + Hf / 2 + dy, cx = base.cx + dx;
        return { pos: [cx, cy + 0.35, Z + d], look: [cx, cy, Z], fov: FOV, ids }; };
      const ok = cam => {
        tmp.position.set(...cam.pos); tmp.lookAt(...cam.look); tmp.updateMatrixWorld(); tmp.updateProjectionMatrix();
        for (const rec of samples) for (const r of rec) { const s = proj(tmp, r.pts);
          if (r.target) { if (s.l < 0.006 || s.r > 0.994 || s.t < 0.006 || ((sh.kind !== 'close' || (sh.crop || 0.55) >= 1) && s.b > 0.86)) return false; }
          else { const out = s.r < 0 || s.l > 1 || s.b < 0 || s.t > 1, inn = s.l >= 0 && s.r <= 1 && s.t >= 0 && s.b <= 1; if (!out && !inn) return false; } }
        for (const pts of signRects) { const s = proj(tmp, pts); const out = s.r < 0 || s.l > 1 || s.b < 0 || s.t > 1, inn = s.l >= 0 && s.r <= 1 && s.t >= 0 && s.b <= 1; if (!out && !inn) return false; }
        return true;
      };
      for (const zf of [1, 1.08, 1.17, 1.28, 1.4, 1.55, 0.93, 0.85, 1.75, 2.0, 2.4]) for (const dy of [0, 0.4, -0.4, 0.8, -0.8, 1.3, -1.3, 1.9]) for (const dx of [0, 0.5, -0.5, 1.0, -1.0, 1.6, -1.6]) {
        const cam = make(zf, dy, dx); if (ok(cam)) return cam;
      }
      return make(1, 0, 0);
    });
  }
  function aim(n) {
    const cam = CAMS[shotList.indexOf(shotAt(n))], c = stage.camera;
    c.position.set(...cam.pos); c.fov = cam.fov; c.updateProjectionMatrix(); c.lookAt(...cam.look); c.updateMatrixWorld();
    for (const k in cards) cards[k].face(c);
  }

  // ---------- overlay text (HTML) ----------
  function overlay(n) {
    const cap = document.getElementById('cap'), lab = document.getElementById('label'), tit = document.getElementById('title');
    cap.textContent = meta.line; cap.style.opacity = (seq(n, 2, 8) * (1 - seq(n, FRAMES - 4, FRAMES))).toFixed(3);
    const label = spec.label ?? meta.text;
    lab.style.display = label && !spec.title ? 'block' : 'none'; lab.textContent = label || '';
    lab.style.opacity = seq(n, T(spec.labelAt ?? 0.4), T(spec.labelAt ?? 0.4) + 8).toFixed(3);
    if (spec.title) {
      tit.style.display = 'flex';
      const lines = spec.title, attrib = lines.length > 1 && spec.attrib !== false ? lines.length - 1 : -1;
      const words = lines.map(l => l.split(' ')), total = words.reduce((k, w, i) => k + (i === attrib ? 1 : w.length), 0);
      const t0 = T(spec.titleAt ?? 0.3), t1 = Math.max(t0 + 20, FRAMES - 48), shown = Math.ceil(total * seq(n, t0, t1));   // words appear steadily
      let k = 0;
      tit.innerHTML = words.map((w, i) => { const cls = i === attrib ? 'sub' : ''; const html = i === attrib ? (k++ < shown ? w.join(' ') : '') : w.map(x => `<span style="opacity:${k++ < shown ? 1 : 0}">${x.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</span>`).join(' ');
        return `<div class="${cls}">${html || '&nbsp;'}</div>`; }).join('');
      tit.style.opacity = '1';
    } else tit.style.display = 'none';
  }

  // ---------- events (for the 2-second rule) ----------
  const EVENTS = [...new Set([0, ...tl.map(e => e.n), ...shotList.map(s => s.from), ...sprites.flatMap(s => [T(s.s.from ?? 0), ...(s.s.keys || []).map(k => T(k[0]))]),
    ...(spec.events || []).map(T), ...(spec.title ? Array.from({ length: Math.ceil(FRAMES / 30) }, (_, i) => Math.max(T(spec.titleAt ?? 0.3), i * 30)).filter(x => x < Math.max(T(spec.titleAt ?? 0.3) + 20, FRAMES - 48)).concat([Math.max(T(spec.titleAt ?? 0.3) + 20, FRAMES - 48)]) : []),
    ...tl.filter(e => e.c.walk).flatMap(e => { const steps = validSteps(e.c.walk.steps || 5), len = Math.round(steps * (e.c.walk.cycle || 24) / 2); return Array.from({ length: Math.ceil(len / 15) + 1 }, (_, i) => e.n + Math.min(len, i * 15)); }),
    ...sprites.flatMap(Sp => (Sp.s.keys || []).slice(1).flatMap((k, i) => { const a = T(Sp.s.keys[i][0]), b = T(k[0]); return b - a > 20 ? Array.from({ length: Math.floor((b - a) / 15) }, (_, j) => a + (j + 1) * 15) : []; }))])].filter(n => n < FRAMES).sort((a, b) => a - b);

  // ---------- public ----------
  async function setup(canvas) {
    stage = createStage(canvas); LIVE.length = 0;
    sets = SETS[spec.set](stage.scene, spec.setOpts || {});
    for (const Sp of sprites) cards['s:' + Sp.id] = createCard(stage.scene, 's:' + Sp.id);
    for (const A of actors) cards[A.id] = createCard(stage.scene, A.id);
    SHOTS = shotList; fitCameras();
  }
  async function renderFrame(n) {
    place(n); aim(n);
    for (const p of LIVE) p.update(n);
    await Promise.all(Object.values(cards).map(c => c.load()));
    stage.renderer.render(stage.scene, stage.camera);
    overlay(n);
  }
  function soleWorld(A, n, leg) {
    const st = stateAt(A, n), { p } = poseAt(A, n, st), r = Math.PI / 180, L = A.sp.legs, half = L.len / 2, hx = A.gait.HIP_X;
    const reach = a => half * (Math.cos(a[0] * r) + Math.cos(a[1] * r));
    const a = leg === 'L' ? p.legL : p.legR, hipH = Math.max(reach(p.legL), reach(p.legR)) + L.shoeH * 0.55 - (p.bob || 0);
    const fx = (leg === 'L' ? -hx : hx) + half * (Math.sin(a[0] * r) + Math.sin(a[1] * r)), fy = -hipH - 4 + reach(a);
    const grounded = Math.abs(Math.max(reach(p.legL), reach(p.legR)) - reach(a)) < 1.0 && !(p.bob < -0.5);
    const sh = (leg === 'L' ? p.shoeL : p.shoeR), ang = (sh != null ? sh : -a[1]) * r, sc = A.a.scale || 1, sgn = st.flip ? -1 : 1;
    const pts = [[-L.w * 0.55, L.shoeH * 0.55], [L.shoeLen * 0.62, L.shoeH * 0.55]].map(([dx, dy]) => [fx + dx * Math.cos(ang) - dy * Math.sin(ang), fy + dx * Math.sin(ang) + dy * Math.cos(ang)]);
    const x0 = XS.get(A.id)[n];
    return { grounded, flipN: st.flipN, sole: pts.map(([x, y]) => [x0 + sgn * x * S * sc, -y * S * sc]) };
  }
  function checkAll() {
    const out = [];
    for (let n = 0; n < FRAMES; n++) {
      place(n); aim(n);
      const sh = shotAt(n), cam = CAMS[shotList.indexOf(sh)], rules = {};
      for (const A of actors) if (cards[A.id].visible) rules[A.id] = cam.ids.includes(A.id) && !A.a.edgeOk ? (sh.kind === 'close' && (sh.crop || 0.55) < 1 ? 'lrt' : 'lrtb') : 'x';
      for (const Sp of sprites) if (cards['s:' + Sp.id].visible && !Sp.s.fx) rules['s:' + Sp.id] = cam.ids.includes('s:' + Sp.id) ? (sh.kind === 'close' && (sh.crop || 0.55) < 1 ? 'lrt' : 'lrtb') : 'x';
      out.push(...checkFrame(n, cards, stage.camera, rules));
      for (const [name, sg] of Object.entries(sets.signs || {})) {
        const g = sg.group, m = g.children[0]; g.updateMatrixWorld(true);
        const pts = [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b]) => { const v = new THREE.Vector3(a * m.geometry.parameters.width / 2, b * m.geometry.parameters.height / 2, 0).applyMatrix4(g.matrixWorld).project(stage.camera); return [(v.x + 1) / 2, (1 - v.y) / 2]; });
        const inside = pts.every(([x, y]) => x >= 0 && x <= 1 && y >= 0 && y <= 1), outside = pts.every(p => p[1] < 0) || pts.every(p => p[1] > 1) || pts.every(p => p[0] < 0) || pts.every(p => p[0] > 1);
        if (!inside && !outside) out.push(`${n}: the ${name} sign is sliced by the frame edge`);
      }
      if (cam.pos[2] <= Math.max(...actors.map(A => A.a.z || 0))) out.push(`${n}: camera crossed the line`);
    }
    // feet: a shoe on the floor never moves (in the room), except on the frame a character turns round
    for (const A of actors) {
      if (!A.gait || A.a.allowShake) continue;
      for (const leg of ['L', 'R']) {
        let anchor = null;
        for (let n = 0; n < FRAMES; n++) {
          const f = soleWorld(A, n, leg);
          if (!f.grounded || f.flipN === n || (n && shotAt(n) !== shotAt(n - 1))) { anchor = f.grounded ? f : null; continue; }
          if (!anchor) { anchor = f; continue; }
          const d = Math.max(...[0, 1].map(i => Math.hypot(anchor.sole[i][0] - f.sole[i][0], anchor.sole[i][1] - f.sole[i][1]))) / S;
          if (d > 1) { out.push(`${n}: ${A.id} ${leg} shoe slides ${d.toFixed(1)} px`); anchor = f; }
        }
      }
    }
    for (let i = 1; i <= EVENTS.length; i++) { const a = EVENTS[i - 1], b = i < EVENTS.length ? EVENTS[i] : FRAMES; if (b - a > 60) out.push(`nothing changes between frame ${a} and ${b}`); }
    return { problems: out, frames: FRAMES, shots: shotList.map(s => `${s.id} ${s.kind} ${s.from}-${s.to}`) };
  }
  function debug(n = 33) { place(n); aim(n); const sh = shotAt(n), cam = CAMS[shotList.indexOf(sh)];
    return Object.fromEntries(Object.entries(cards).map(([k, c]) => [k, { vis: c.visible, target: cam.ids.includes(k), box: c.visible ? (c.group.updateMatrixWorld(true), c.screenBox(stage.camera)) : null }])); }
  return { FRAMES, get SHOTS() { return SHOTS; }, EVENTS, setup, renderFrame, checkAll, debug };
}
