#!/usr/bin/env python3
"""Original soundtrack for an edit, synthesised here (no samples, nothing licensed).
usage: sound.py <out.wav> <total seconds> <replay start s> <close s>"""
import sys, wave, numpy as np
SR = 44100
out, total, rstart, close = sys.argv[1], float(sys.argv[2]), float(sys.argv[3]), float(sys.argv[4])
n = int(total * SR); mix = np.zeros(n)
t_all = np.arange(n) / SR
rng = np.random.default_rng(7)

def add(sig, at, gain=1.):
    i = int(at * SR); j = min(n, i + len(sig))
    if i < n: mix[i:j] += sig[:j - i] * gain
def env(length, a=.005, d=.2):
    t = np.arange(int(length * SR)) / SR
    return np.minimum(1, t / a) * np.exp(-t / d)
def kick(g=1.):
    t = np.arange(int(.45 * SR)) / SR
    f = 48 + 110 * np.exp(-t * 28)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * env(.45, .002, .16) * g
def hat(g=.12):
    s = rng.standard_normal(int(.06 * SR)); s = np.diff(s, prepend=0)       # crude high-pass
    return s * env(.06, .001, .018) * g
def tone(freq, length, a=.01, d=.5, g=.2, harm=(1, .35, .12)):
    t = np.arange(int(length * SR)) / SR
    s = sum(h * np.sin(2 * np.pi * freq * (k + 1) * t) for k, h in enumerate(harm))
    return s * env(length, a, d) * g
def pad(freqs, length, g=.06):
    t = np.arange(int(length * SR)) / SR
    s = sum(np.sin(2 * np.pi * f * t + .3 * np.sin(2 * np.pi * .3 * t)) for f in freqs)
    shape = np.minimum(1, t / 1.2) * np.minimum(1, (length - t) / 1.5).clip(0)
    return s * shape * g

A, Cs, E, Fs, B = 110., 138.59, 164.81, 185., 123.47
# hook: low pad and a soft thump; then a beat through the replay, rising into the close
add(pad([A, E, A * 2], rstart + .3, .05), 0)
add(kick(.9), 0.02)
bpm = 112; beat = 60 / bpm
t = rstart
while t < close - .05:
    add(kick(.75), t)
    add(hat(), t + beat / 2)
    if (t - rstart) / beat % 2 >= 1: add(hat(.08), t + beat * .75)
    t += beat
# riser: noise swell + rising tone in the last two seconds before the close
rl = min(2.2, close - rstart)
rt = np.arange(int(rl * SR)) / SR
riser = rng.standard_normal(len(rt)) * (rt / rl) ** 2 * .07
riser += np.sin(2 * np.pi * np.cumsum(220 + 660 * (rt / rl) ** 2) / SR) * (rt / rl) ** 2 * .05
add(riser, close - rl)
# the close: impact and a bright major arpeggio
add(kick(1.2), close)
burst = rng.standard_normal(int(.5 * SR)) * env(.5, .001, .12) * .18
add(burst, close)
for i, f in enumerate([A * 4, Cs * 4, E * 4, A * 8]):
    add(tone(f, 1.4, .004, .45, .09), close + i * .07)
# result card: warm chord and a slower pulse
add(pad([A, Cs * 2, E * 2, A * 2], total - close, .045), close)
t = close + beat * 2
while t < total - .4:
    add(kick(.45), t); t += beat * 2
# master: gentle compression + fade out
mix = np.tanh(mix * 1.6) * .8
fade = int(.6 * SR); mix[-fade:] *= np.linspace(1, 0, fade)
pcm = (np.stack([mix, mix], 1) * 32767).astype(np.int16)
with wave.open(out, "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
print("wrote", out)
