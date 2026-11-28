#!/usr/bin/env bash
# Start a new explainer video from the template (the engine, rig, tools) of email-stopped.
# usage: video/new_project.sh <slug>      e.g. video/new_project.sh huang-11-days
set -euo pipefail; cd "$(dirname "$0")"; S=${1:?slug}; [ -e "$S" ] && { echo "$S exists"; exit 1; }
mkdir -p "$S"/{lib,scenes/beats,tools,script,audio,out}
cp email-stopped/lib/puppet.js email-stopped/lib/cast.js "$S"/lib/
cp email-stopped/scenes/{stage.js,engine.js,engine.html,sets.js,sprites.js,cues.js,cues.html} "$S"/scenes/
cp email-stopped/tools/{render_full.js,assemble.sh,sound.py,voice.py,dump_cues.js,contact.py} "$S"/tools/
cp email-stopped/package.json "$S"/ ; cp email-stopped/.gitignore "$S"/
ln -s ../email-stopped/node_modules "$S"/node_modules; ln -s ../email-stopped/.venv-tts "$S"/.venv-tts
mkdir -p "$S"/audio && ln -s ../../email-stopped/audio/tts-model "$S"/audio/tts-model
echo "created video/$S — next: script/beats.py, scenes/beats/all.js (see .claude/skills/explainer-video/SKILL.md)"
