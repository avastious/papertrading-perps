// Sound cues for every engine beat, read straight from the beat specs (same timing as the picture).
// Returns [{ beat, frames, set, cues: [{ t (s), kind, dur?, x? }] }]
import { BEATS } from './beats/all.js';
const FPS = 30;
const validSteps = s => { s = Math.max(3, Math.round(s)); return s % 2 ? s : s + 1; };
export function allCues(narr) {
  const out = [];
  for (const b of Object.keys(BEATS).map(Number).sort((x, y) => x - y)) {
    const spec = BEATS[b], meta = narr[b - 1], frames = spec.frames || meta.frames, T = t => Math.round(t * FPS), cues = [];
    const actors = spec.actors || {};
    for (const [t, id, c] of spec.tl || []) {
      const a = actors[id] || {}, who = typeof a.who === 'string' ? a.who : (a.who && a.who.name) || '';
      if (c.walk) { const steps = validSteps(c.walk.steps || 5), cyc = c.walk.cycle || 24; for (let k = 1; k <= steps; k++) cues.push({ t: (T(t) + Math.round(k * cyc / 2)) / FPS, kind: who === 'envelope' || /email/i.test(who) || (a.scale || 1) < 0.9 ? 'patter' : 'step' }); }
      if (c.hop) cues.push({ t: t + (c.hop.dur || 0.4), kind: 'land' });
      if (c.talk) cues.push({ t, kind: 'mumble', dur: c.talk });
      if (c.face === 'talkA' || c.face === 'talkB') cues.push({ t, kind: 'mumble', dur: 0.5 });
      if (c.pose === 'surprised' || c.face === 'surprised') cues.push({ t, kind: 'boing' });
      if (c.visible === true) cues.push({ t, kind: 'pop' });
      if (c.visible === false) cues.push({ t, kind: 'swish' });
    }
    // fax shrieks: from a 'shriek' face until the fax's next face change
    for (const [id, a] of Object.entries(actors)) {
      if (a.who !== 'fax') continue;
      let on = a.face === 'shriek' ? 0 : null;
      for (const [t, aid, c] of (spec.tl || []).filter(e => e[1] === id)) {
        if (c.face === 'shriek' && on == null) on = t;
        else if (c.face && c.face !== 'shriek' && on != null) { cues.push({ t: on, kind: 'shriek', dur: t - on }); on = null; }
      }
      if (on != null) cues.push({ t: on, kind: 'shriek', dur: frames / FPS - on });
      if (a.visible === false) cues.push({ t: 0, kind: 'none' });
    }
    for (const [id, s] of Object.entries(spec.sprites || {})) {
      const from = s.from ?? (s.keys && s.keys[0] && s.keys[0][1].s === 0.05 ? s.keys[0][0] : null);
      if (from != null && from > 0.05) cues.push({ t: from, kind: s.draw === 'stamp' ? 'stamp' : s.draw === 'word' ? 'zing' : 'pop' });
      if (s.draw === 'phone' && ((typeof s.args === 'object' && s.args && s.args.buzz) || (typeof s.args === 'function' && /buzz/.test(String(s.args))))) cues.push({ t: from ?? 0, kind: 'buzz', dur: frames / FPS - (from ?? 0) });
      if (s.draw === 'fly') cues.push({ t: s.from ?? 0, kind: 'flutter', dur: frames / FPS - (s.from ?? 0) });
      if (s.draw === 'counter') cues.push({ t: 0, kind: 'ticker', dur: 5.0 });
      if (s.draw === 'domino' && typeof s.args === 'function' && /fall/.test(String(s.args))) { const m = String(s.args).match(/n - (\d+)/); if (m) cues.push({ t: (+m[1] + 12) / FPS, kind: 'clack' }); }
      if (s.draw === 'lever' && typeof s.args === 'function' && /broken/.test(String(s.args))) cues.push({ t: 36 / FPS, kind: 'snap' });
      if (s.draw === 'van') cues.push({ t: 0, kind: 'van', dur: 6.6 });
      if (s.draw === 'stopwatch' && typeof s.args === 'function') cues.push({ t: 0, kind: 'tick', dur: 5.0 }, { t: 5.0, kind: 'ding' });
      if (s.draw === 'calendar' && typeof s.args === 'function') for (let k = 1; k < 5; k++) cues.push({ t: k * 1.5, kind: 'flip' });
      if (s.draw === 'word' && s.args && s.args.text === 'DING!') cues.push({ t: s.from, kind: 'ding' });
      if (s.draw === 'whiteboard') for (const t of [0.2, 2.0, 4.0]) cues.push({ t, kind: 'marker' });
    }
    if (spec.title) cues.push({ t: spec.titleAt ?? 0.3, kind: 'swoosh' });
    out.push({ beat: b, frames, set: spec.set, cues: cues.filter(c => c.kind !== 'none' && c.t < frames / FPS) });
  }
  return out;
}
