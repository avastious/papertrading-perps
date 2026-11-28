#!/usr/bin/env python3
"""AI voice-over with Kokoro-82M (Apache-2.0), run locally through kokoro-onnx. Nothing is sent to any service.
usage: .venv-tts/bin/python tools/voice.py <voice> <out_dir> [beats e.g. 1-99]
Writes one WAV per beat (24 kHz mono) and voice.json with each line's length."""
import json, sys, os, numpy as np, soundfile as sf
from kokoro_onnx import Kokoro
D = os.path.join(os.path.dirname(__file__), '..')
voice, out = sys.argv[1], sys.argv[2]
rng = sys.argv[3] if len(sys.argv) > 3 else None
narr = json.load(open(f'{D}/scenes/beats/narration.json'))
rng = rng or f'1-{len(narr)}'
a, b = (int(x) for x in rng.split('-')) if '-' in rng else (int(rng), int(rng))
k = Kokoro(f'{D}/audio/tts-model/kokoro-v1.0.onnx', f'{D}/audio/tts-model/voices-v1.0.bin')
os.makedirs(out, exist_ok=True)
info = json.load(open(f'{out}/voice.json')) if os.path.exists(f'{out}/voice.json') else {}
FIX = {'EX1550543': 'E X 1 5 5 0 5 4 3', 'EX1545193': 'E X 1 5 4 5 1 9 3', 'UTC': 'U T C', '16:20': 'sixteen twenty', '16:10': 'sixteen ten',
       'Outlook.com': 'Outlook dot com', '3.6 million': 'three point six million', '1843': 'eighteen forty-three', '1876': 'eighteen seventy-six'}
for n in range(a, b + 1):
    line = narr[n - 1]['line']
    for x, y in FIX.items(): line = line.replace(x, y)
    beat_s = narr[n - 1]['frames'] / 30
    samples, sr = k.create(line, voice=voice, speed=1.0, lang='en-us' if voice[0] == 'a' else 'en-gb')
    dur = len(samples) / sr; speed = 1.0
    if dur > beat_s - 0.7:                                  # too long for its beat: speak a little faster (at most 1.18x)
        speed = min(1.18, dur / (beat_s - 0.7)); samples, sr = k.create(line, voice=voice, speed=speed, lang='en-us' if voice[0] == 'a' else 'en-gb'); dur = len(samples) / sr
    sf.write(f'{out}/b{n:02d}.wav', samples, sr)
    info[str(n)] = {'dur': round(dur, 3), 'beat': round(beat_s, 3), 'speed': round(speed, 3), 'fits': dur <= beat_s - 0.4}
    print(n, info[str(n)], flush=True)
json.dump(info, open(f'{out}/voice.json', 'w'), indent=0)
