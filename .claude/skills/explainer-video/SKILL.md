---
name: explainer-video
description: Make a 10-15 minute animated explainer ("Chronicle Sketch" style) about a news event — research, beat sheet, cast, code-drawn scenes, AI voice-over, sound, thumbnail. Use when the user asks for a new video "like the email one" or about a big event.
---

# Explainer video workflow (Chronicle Sketch)

Everything is drawn and voiced in code inside this repo. Template project: `video/email-stopped/` (finished example);
second project: `video/huang-11-days/`. Follow the steps in order; the user approves at the two marked gates.

## 0. Rules (never skip)
- Original characters only. **Never draw real people** (no likeness, no caricature): use stand-ins, empty chairs,
  nameplates, quote cards. No company logos. Allegations are attributed ("X reported…") and flagged; prefer primary
  sources (company filings, press releases). Don't name private individuals caught up in a story.
- Sound and voice are made in code or locally (Kokoro TTS, Apache-2.0) — record licences in `audio/LICENCES.md`.
- Keep every version (`out/.../v1`, `v2`…), never overwrite. Commit and push after each step.

## 1. Research (cheap)
- Most news sites are blocked for WebFetch here; use 2-4 targeted `WebSearch` calls (mode extended) and build a dated
  timeline from the result summaries. Note where outlets disagree. Save sources as keys in `script/beats.py`.

## 2. Project
- `video/new_project.sh <slug>` copies the engine, rig and tools (node_modules, TTS venv and model are symlinked).
- Add characters to `lib/cast.js` (variants: `CAST.variant('sam', {...})`; appliance/mascot puppets use `head: {r: 0}` +
  an `OUTFIT` in `lib/puppet.js`). `node tools/castsheet.js` → `out/cast_sheet.png`.

## 3. Beat sheet  — GATE 1: send cast sheet + beat sheet, wait for approval
- `script/beats.py`: one row per narration line `(link, line, picture, set, on-screen text, flag, sources)`.
  Rules checked by the script: 8-25 words, every beat linked BUT/THEREFORE, narration never says but/therefore/and then;
  cold open on the most dramatic moment, ending on a question. `python3 script/beats.py` → `beat_sheet.md/.csv`.
- ~65-100 beats → 10-15 min. Beat length = narration.json `frames` (export step below).

## 4. Scenes
- Export narration: see the snippet in `video/email-stopped` history (`scenes/beats/narration.json`: n, line, set, text, frames).
- `scenes/beats/all.js`: one compact spec per beat — `set`, `setOpts`, `actors` (who, x, z, flip, look, turn),
  `tl` [[t, id, {pose|face|walk|hop|talk|visible}]], `sprites` (`scenes/sprites.js` drawers with `keys`/`from`),
  `shots` [{t, kind: wide|medium|two|close, on:[ids]}], `title`, `label`. Cameras auto-frame and auto-check.
- `node tools/render_full.js check 1-N 3` must print `ok` for every beat (framing, signs, extras in/out, feet never
  slide, a change every ≤2 s, camera side). Then `stills` → look at contact sheets yourself and fix.
- `node tools/render_full.js video 1-N v1 4` (~1 h for 25k frames); frames are deleted, every 15th kept for review.

## 5. Sound, voice, assembly — GATE 2: send the full video
- `node tools/dump_cues.js > audio/cues.json`; `.venv-tts/bin/python tools/voice.py af_heart audio/voice`
  (lines too long for their beat are sped up ≤1.18×); `tools/assemble.sh <name>_v1` builds music/fx/ambience,
  ducks under speech (voice ≥10 dB clear), concatenates the newest version of every beat, muxes AAC 48 kHz.
- Check: durations equal, no clipping, sample frames across the whole video; fresh no-context reviewer on samples.

## 6. Channel assets
- `channel/make.js` (banner + pfp), `channel/thumb.js` (thumbnail 1280×720, keep the bottom-right clear for the
  duration badge). Copy `thumb.js` per video and change the scene/words.

## Known pitfalls (already fixed in the template)
- CSS overlays over the WebGL canvas made black ghost boxes in headless Chrome → the engine copies each 3D frame to a
  plain 2D canvas (`#c2`) and fades overlays with colour alpha.
- Walks are planned from the feet (IK) and planted shoes are checked in world space; poses that change legs mid-shot slide.
- Tiny pupils read as looking the wrong way — use the `worried` face (full-size pupils) for anxious looks.
