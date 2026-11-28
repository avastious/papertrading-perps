#!/usr/bin/env bash
# Join beat 1 + beats 2-99 (newest version of each), add the soundtrack, write out/final/<name>.mp4
# usage: tools/assemble.sh <name> [beat1 mp4]
set -euo pipefail
cd "$(dirname "$0")/.."
NAME=${1:?name}
OUT=out/final/$NAME.mp4; [ -e "$OUT" ] && { echo "$OUT exists"; exit 1; }
mkdir -p out/final; LIST=$(mktemp); : > "$LIST"
LAST=$(python3 -c "import json;print(len(json.load(open('scenes/beats/narration.json'))))")
for n in $(seq 1 $LAST); do t=b$(printf %02d $n)
  f=$(ls -d out/step4/full/v*/"$t".mp4 2>/dev/null | sort -V | tail -1); [ -n "$f" ] || { echo "missing $t"; exit 1; }
  echo "file '$PWD/$f'" >> "$LIST"; done
python3 tools/sound.py audio/cues.json audio/soundtrack.wav
ffmpeg -y -loglevel error -f concat -safe 0 -i "$LIST" -i audio/soundtrack.wav -map 0:v -map 1:a \
  -c:v libx264 -preset medium -crf 19 -pix_fmt yuv420p -r 30 -s 1920x1080 -c:a aac -b:a 192k -ar 48000 -movflags +faststart -shortest "$OUT"
cp "$LIST" "out/final/$NAME.sources.txt"; ffprobe -v error -show_entries format=duration -of csv=p=0 "$OUT"; echo "wrote $OUT"
