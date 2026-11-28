#!/usr/bin/env python3
"""Contact sheets for reviewing a render: every Nth frame, labelled with its frame number, plus each cut
(two frames either side) at a larger size.  usage: python3 tools/contact.py out/step4/beat01/v1 [step]"""
import os, sys, glob
from PIL import Image, ImageDraw, ImageFont
d = sys.argv[1]; step = int(sys.argv[2]) if len(sys.argv) > 2 else 5
frames = sorted(glob.glob(os.path.join(d, 'frames', 'f*.png')))
font = ImageFont.truetype(os.path.join(os.path.dirname(__file__), '..', '..', '..', 'tools', 'tiktok', 'fonts', 'ibm-plex-sans-latin-600-normal.ttf'), 22)
out = os.path.join(d, 'review'); os.makedirs(out, exist_ok=True)
def sheet(idx, cols, w, name):
    h = w * 9 // 16; rows = (len(idx) + cols - 1) // cols
    S = Image.new('RGB', (cols * w, rows * h), '#111')
    for k, n in enumerate(idx):
        im = Image.open(frames[n]).convert('RGB').resize((w, h), Image.LANCZOS)
        dr = ImageDraw.Draw(im); dr.rectangle([0, 0, 92, 30], fill='#000'); dr.text((6, 2), f'f{n}', font=font, fill='#ffd36b')
        S.paste(im, ((k % cols) * w, (k // cols) * h))
    S.save(os.path.join(out, name)); print('wrote', os.path.join(out, name))
idx = list(range(0, len(frames), step))
for i in range(0, len(idx), 30): sheet(idx[i:i + 30], 6, 400, f'every{step}_{i // 30 + 1}.png')
cuts = [int(x) for x in os.environ.get('CUTS', '90,165,255').split(',')]
sheet([n for c in cuts for n in (c - 2, c - 1, c, c + 1)], 4, 640, 'cuts.png')
