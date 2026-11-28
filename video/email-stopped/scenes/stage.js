// Shared stage for every scene: a three.js world, puppet cards that face the camera, ground shadows,
// flat-shaded set pieces with thick ink outlines, and the frame-check rules.
// Everything is a pure function of the frame number, so the same frame always renders the same.
import * as THREE from '../node_modules/three/build/three.module.js';

export const FPS = 30, W = 1920, H = 1080;
export const INK = '#1d1a24';
export const S = 0.01;                     // world units per puppet pixel (puppets are ~450 px tall → 4.5 units)
const PAD = 34;                            // puppet bbox ignores stroke width: pad so no stroke touches a card edge
const TEX = 3;                             // texture pixels per puppet pixel (sharp in close-ups)

// ---------- deterministic helpers ----------
export const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const ease = t => { t = clamp(t); return t * t * (3 - 2 * t); };
export const seq = (n, a, b) => clamp((n - a) / (b - a));      // 0→1 across frames a..b
export function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
export function lerpPose(a, b, t) {                            // blend two pose objects (angles and numbers)
  const out = { ...a, ...(t >= 0.5 ? b : a) };
  for (const k of ['lean', 'bob', 'head', 'lift']) out[k] = lerp(a[k] || 0, b[k] || 0, t);
  for (const k of ['armL', 'armR', 'legL', 'legR']) out[k] = [0, 1].map(i => lerp((a[k] || [0, 0])[i], (b[k] || [0, 0])[i], t));
  return out;
}

// ---------- the stage ----------
export function createStage(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(W, H, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, W / H, 0.1, 200);
  scene.add(new THREE.HemisphereLight(0xfff6e8, 0x8a7f74, 2.2));
  const sun = new THREE.DirectionalLight(0xffffff, 1.4); sun.position.set(-4, 10, 8); scene.add(sun);
  return { renderer, scene, camera, THREE };
}

// Flat box with an ink outline (inverted hull). Returns the group.
export function box(scene, { w, h, d, color, x = 0, y = 0, z = 0, ry = 0, outline = 0.05 }) {
  const g = new THREE.Group();
  const geo = new THREE.BoxGeometry(w, h, d);
  g.add(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color })));
  if (outline) {
    const o = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide }));
    o.scale.set((w + outline * 2) / w, (h + outline * 2) / h, (d + outline * 2) / d);
    g.add(o);
  }
  g.position.set(x, y + h / 2, z); g.rotation.y = ry;
  scene.add(g);
  return g;
}

export const LIVE = [];                    // panels redrawn every frame

// A flat picture (canvas texture) on a plane, e.g. windows, screens, posters. draw(ctx, w, h, n) is called per frame if live.
export function panel(scene, { w, h, x, y, z, ry = 0, px = 256, draw, live = false, outline = 0.05, basic = true }) {
  const c = document.createElement('canvas'); c.width = Math.round(px * w / h); c.height = px;
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  const mat = basic ? new THREE.MeshBasicMaterial({ map: tex }) : new THREE.MeshLambertMaterial({ map: tex });
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat));
  if (outline) { const o = new THREE.Mesh(new THREE.PlaneGeometry(w + outline * 2, h + outline * 2), new THREE.MeshBasicMaterial({ color: INK })); o.position.z = -0.01; g.add(o); }
  g.position.set(x, y, z); g.rotation.y = ry; scene.add(g);
  const api = { group: g, update(n) { draw(c.getContext('2d'), c.width, c.height, n); tex.needsUpdate = true; } };
  api.update(0);
  if (live) LIVE.push(api);
  return api;
}

// Soft ground shadow texture (shared).
let shadowTex;
function shadowTexture() {
  if (shadowTex) return shadowTex;
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d'), gr = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(20,16,30,0.42)'); gr.addColorStop(0.6, 'rgba(20,16,30,0.22)'); gr.addColorStop(1, 'rgba(20,16,30,0)');
  x.fillStyle = gr; x.fillRect(0, 0, 128, 128);
  return (shadowTex = new THREE.CanvasTexture(c));
}

// ---------- puppet cards ----------
// A card shows one SVG puppet drawing. Its origin is the point between the feet; it turns about the
// vertical axis to face the camera (so it never tips over), and casts a soft shadow on the ground below it.
const measureSvg = (() => {
  let svg;
  return inner => {
    if (!svg) { svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('style', 'position:absolute;left:-9999px;top:0;width:10px;height:10px'); document.body.appendChild(svg); }
    svg.innerHTML = `<g>${inner}</g>`;
    const b = svg.firstChild.getBBox();
    return { x: b.x - PAD, y: b.y - PAD, w: b.width + PAD * 2, h: b.height + PAD * 2 };
  };
})();

export function createCard(scene, name) {
  const group = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, alphaTest: 0.01 });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
  group.add(mesh);
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2;
  scene.add(group); scene.add(shadow);
  const cache = new Map();
  const card = { name, group, mesh, shadow, bbox: null, svg: '', visible: true };

  // Set the drawing (sync: measures it). Texture is loaded by card.load().
  card.set = (inner, { x, y = 0, z, ground = 0, shadowW = 1.2 }) => {
    card.svg = inner;
    card.bbox = measureSvg(inner);
    const b = card.bbox;
    mesh.scale.set(b.w * S, b.h * S, 1);
    mesh.position.set((b.x + b.w / 2) * S, -(b.y + b.h / 2) * S, 0);
    group.position.set(x, y, z);
    shadow.position.set(x, ground + 0.012, z);
    const lift = clamp(1 - (y - ground) / 2.5, 0.35, 1);
    shadow.scale.set(shadowW * lift, shadowW * 0.38 * lift, 1);
    shadow.material.opacity = lift;
  };
  // Face the camera: the card turns (about the vertical only) to lie parallel to the picture plane, so a puppet
  // walking across the frame keeps the same angle to the lens and its planted foot stays put on screen.
  card.face = cam => { const f = new THREE.Vector3(); cam.getWorldDirection(f); group.rotation.y = Math.atan2(-f.x, -f.z); };
  card.load = async () => {
    if (!card.visible) { mesh.visible = shadow.visible = false; return; }
    mesh.visible = shadow.visible = true;
    const key = card.svg;
    if (!cache.has(key)) {
      const b = card.bbox;
      const svgText = `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.ceil(b.w * TEX)}" height="${Math.ceil(b.h * TEX)}" viewBox="${b.x} ${b.y} ${b.w} ${b.h}">${key}</svg>`;
      const img = new Image();
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgText);
      await img.decode();
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      c.getContext('2d').drawImage(img, 0, 0);
      const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
      if (cache.size > 40) { for (const t of cache.values()) t.dispose(); cache.clear(); }
      cache.set(key, tex);
    }
    mat.map = cache.get(key); mat.needsUpdate = true;
  };
  // Card corners in screen space (0..1). edges = which sides must stay in frame.
  card.screenBox = cam => {
    const b = card.bbox, pts = [];
    for (const [sx, sy] of [[b.x + PAD, b.y + PAD], [b.x + b.w - PAD, b.y + PAD], [b.x + PAD, b.y + b.h - PAD], [b.x + b.w - PAD, b.y + b.h - PAD]]) {
      const v = new THREE.Vector3(sx * S, -sy * S, 0).applyMatrix4(group.matrixWorld).project(cam);
      pts.push([(v.x + 1) / 2, (1 - v.y) / 2]);
    }
    return { l: Math.min(...pts.map(p => p[0])), r: Math.max(...pts.map(p => p[0])), t: Math.min(...pts.map(p => p[1])), b: Math.max(...pts.map(p => p[1])) };
  };
  return card;
}

// Rules check for one frame: every card that must be in frame is, on the sides that matter.
export function checkFrame(n, cards, cam, rules) {
  const out = [];
  cam.updateMatrixWorld();
  for (const [name, sides] of Object.entries(rules)) {
    const c = cards[name];
    c.group.updateMatrixWorld(true);
    const s = c.screenBox(cam), m = 0.004;
    if (sides === 'x') {                                     // background extra: fully in frame or fully out, never half
      const outside = s.r < 0 || s.l > 1 || s.b < 0 || s.t > 1, inside = s.l >= 0 && s.r <= 1 && s.t >= 0 && s.b <= 1;
      if (!outside && !inside) out.push(`${n}: ${name} is half in frame at an edge`);
      continue;
    }
    if (sides.includes('l') && s.l < m) out.push(`${n}: ${name} cut off on the left`);
    if (sides.includes('r') && s.r > 1 - m) out.push(`${n}: ${name} cut off on the right`);
    if (sides.includes('t') && s.t < m) out.push(`${n}: ${name} cut off at the top`);
    if (sides.includes('b') && s.b > 1 - m) out.push(`${n}: ${name} cut off at the bottom`);
  }
  return out;
}

// Walking without foot slide: move the body by exactly how far the planted foot moved back.
// Returns world x for every frame (dir = -1 walks toward −x).
export function walkTrack(P, spec, { from, to, frames, start, cycle, dir, scale = 1, poseAt }) {
  const xs = new Float64Array(frames);
  const hipX = (spec.body.hipW || spec.body.torsoW) * 0.22, half = spec.legs.len / 2, r = Math.PI / 180;
  const foot = (p, leg) => (leg === 'L' ? -hipX : hipX) + half * (Math.sin(p[leg === 'L' ? 'legL' : 'legR'][0] * r) + Math.sin(p[leg === 'L' ? 'legL' : 'legR'][1] * r));
  const reach = a => half * (Math.cos(a[0] * r) + Math.cos(a[1] * r));
  let x = from;
  for (let n = 0; n < frames; n++) {
    if (n > start && n <= to) {
      const a = poseAt(n - 1), b = poseAt(n);
      const leg = reach(a.legL) >= reach(a.legR) ? 'L' : 'R';
      x += -(foot(b, leg) - foot(a, leg)) * S * scale * dir;   // planted foot goes back → body goes forward
    }
    xs[n] = x;
  }
  return xs;
}
