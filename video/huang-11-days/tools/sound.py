#!/usr/bin/env python3
"""Soundtrack for "The Day Email Stopped", made entirely in code (no recordings, no samples, no downloads).
Every sound is synthesised here from sine waves and seeded noise, so we own it outright.

usage: python3 tools/sound.py audio/cues.json audio/soundtrack.wav
  cues.json comes from tools/dump_cues.js (beats 2-99, read from the beat specs); beat 1's cues are written below.
Output: 48 kHz stereo WAV, exactly as long as the picture (beat 1 = 300 frames, then each beat's frames, at 30 fps).
"""
import json, sys, wave
import numpy as np

SR = 48000
FPS = 30
RNG = np.random.default_rng(1312)
cues_path, out_path = sys.argv[1], sys.argv[2]
BEATS = json.load(open(cues_path))
HAS_B1 = any(b['beat'] == 1 for b in BEATS)          # template: beat 1 is an engine beat like the rest
B1_FRAMES = 0 if HAS_B1 else 300

# ---------------------------------------------------------------- timeline
starts, t = ({} if HAS_B1 else {1: 0.0}), B1_FRAMES / FPS
for b in BEATS:
    starts[b['beat']] = t
    t += b['frames'] / FPS
TOTAL = t
N = int(round(TOTAL * SR))
fx = np.zeros((N, 2), np.float32)
amb = np.zeros((N, 2), np.float32)
mus = np.zeros((N, 2), np.float32)

def secs(d): return np.arange(int(d * SR)) / SR
def env(d, a=0.005, r=0.1, hold=0.0):
    t = secs(d); e = np.minimum(1, t / max(a, 1e-4)); e *= np.where(t > a + hold, np.exp(-(t - a - hold) / r), 1); return e
def put(buf, sig, at, gain=1.0, pan=0.0):
    i = int(at * SR)
    if i >= N or i + len(sig) <= 0: return
    j = min(N, i + len(sig)); s = sig[: j - i] * gain
    l, r = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
    buf[i:j, 0] += s * l * 1.414; buf[i:j, 1] += s * r * 1.414
def sweep(f0, f1, d, curve=1.0):
    t = secs(d); f = f0 + (f1 - f0) * (t / d) ** curve; return np.sin(2 * np.pi * np.cumsum(f) / SR)
def noise(d): return RNG.standard_normal(int(d * SR))
def lowpass(x, cutoff):                         # FFT brick-ish lowpass with soft edge
    X = np.fft.rfft(x); f = np.fft.rfftfreq(len(x), 1 / SR); X *= 1 / (1 + (f / cutoff) ** 4); return np.fft.irfft(X, len(x))
def bandpass(x, lo, hi):
    X = np.fft.rfft(x); f = np.fft.rfftfreq(len(x), 1 / SR); X *= (1 / (1 + (lo / np.maximum(f, 1)) ** 4)) * (1 / (1 + (f / hi) ** 4)); return np.fft.irfft(X, len(x))
def norm(x, peak=1.0): m = np.max(np.abs(x)) or 1; return x / m * peak
def mixs(*xs):                                   # add signals of different lengths (padded with silence)
    L = max(len(x) for x in xs); out = np.zeros(L)
    for x in xs: out[:len(x)] += x
    return out
def pan_of(k): return ((k * 0.6180339) % 1 - 0.5) * 0.8      # deterministic gentle spread

# ---------------------------------------------------------------- effects
def s_step(soft=False):
    th = np.sin(2 * np.pi * np.cumsum(np.linspace(95, 55, int(0.12 * SR))) / SR) * env(0.12, 0.002, 0.035)
    cl = lowpass(noise(0.05), 1800 if soft else 3500) * env(0.05, 0.001, 0.012)
    return norm(mixs(th, cl * 0.5), 0.5)
def s_patter(): return norm(mixs(np.sin(2 * np.pi * 420 * secs(0.06)) * env(0.06, 0.001, 0.015), lowpass(noise(0.03), 5000) * env(0.03, 0.001, 0.006) * 0.4), 0.28)
def s_land(): return norm(mixs(s_step(), sweep(260, 180, 0.18) * env(0.18, 0.004, 0.06) * 0.3), 0.55)
def s_boing(): t = secs(0.38); f = 220 + 300 * (t / 0.38) + 18 * np.sin(2 * np.pi * 14 * t); return norm(np.sin(2 * np.pi * np.cumsum(f) / SR) * env(0.38, 0.005, 0.14), 0.32)
def s_pop(): return norm(mixs(sweep(520, 1250, 0.07) * env(0.07, 0.001, 0.025), lowpass(noise(0.02), 6000) * env(0.02, 0.0005, 0.004) * 0.5), 0.3)
def s_zing(): return norm(sweep(900, 2600, 0.26, 0.6) * env(0.26, 0.01, 0.09) * 0.7 + sweep(1350, 3900, 0.26, 0.6) * env(0.26, 0.01, 0.07) * 0.3, 0.2)
def s_swish(d=0.3): x = noise(d); X = np.fft.rfft(x); f = np.fft.rfftfreq(len(x), 1 / SR); X *= np.exp(-((f - 2500) / 1800) ** 2); x = np.fft.irfft(X, len(x)); return norm(x * np.sin(np.pi * secs(d) / d) ** 2, 0.25)
def s_stamp(): return norm(mixs(s_step() * 1.2, bandpass(noise(0.09), 400, 4000) * env(0.09, 0.001, 0.02) * 0.9), 0.7)
def s_clack(): t = secs(0.12); return norm((np.sign(np.sin(2 * np.pi * 1150 * t)) * 0.4 + np.sin(2 * np.pi * 420 * t)) * env(0.12, 0.0005, 0.02), 0.45)
def s_snap(): return norm(mixs(bandpass(noise(0.08), 1500, 9000) * env(0.08, 0.0003, 0.012), sweep(700, 120, 0.25) * env(0.25, 0.002, 0.07) * 0.6), 0.75)
def s_ding():
    t = secs(1.8); x = sum(a * np.sin(2 * np.pi * 988 * m * t) * np.exp(-t / (0.9 / m ** 0.7)) for m, a in [(1, 1), (2.76, 0.4), (5.4, 0.18), (8.9, 0.08)])
    return norm(x * np.minimum(1, t / 0.002), 0.35)
def s_tick(): return norm(bandpass(noise(0.015), 2000, 7000) * env(0.015, 0.0002, 0.003), 0.18)
def s_flip(): return s_swish(0.18) * 0.8
def s_marker(d=0.9):
    t = secs(d); squeak = np.sin(2 * np.pi * np.cumsum(2300 + 400 * np.sin(2 * np.pi * 6 * t)) / SR) * 0.15
    gate = (np.sin(2 * np.pi * 3.2 * t) > -0.2).astype(float); gate = lowpass(gate, 40)
    return norm((bandpass(noise(d), 1500, 6000) * 0.5 + squeak) * gate * np.sin(np.pi * t / d), 0.12)
def s_mumble(d):
    out = np.zeros(int(d * SR)); i = 0; k = 0
    while i < len(out):
        L = int(RNG.uniform(0.09, 0.16) * SR); f0 = RNG.uniform(150, 260); t = np.arange(L) / SR
        f = f0 * (1 + 0.12 * np.sin(np.pi * t / (L / SR)))
        ph = 2 * np.pi * np.cumsum(f) / SR; F1, F2 = RNG.uniform(500, 900), RNG.uniform(1200, 2200)
        syl = sum((1 / h) * np.sin(h * ph) * (np.exp(-((h * f0 - F1) / 250) ** 2) + 0.6 * np.exp(-((h * f0 - F2) / 350) ** 2) + 0.15) for h in range(1, 16))
        syl *= np.sin(np.pi * t / (L / SR)) ** 1.5; j = min(len(out), i + L); out[i:j] += syl[: j - i]; i += L + int(RNG.uniform(0.02, 0.06) * SR); k += 1
    return norm(out, 0.2)
def s_buzz(d):
    t = secs(d); gate = ((t % 0.7) < 0.42).astype(float); gate = lowpass(gate, 60)
    return norm(np.sign(np.sin(2 * np.pi * 155 * t)) * 0.3 * gate + np.sin(2 * np.pi * 155 * t) * gate, 0.13)
def s_flutter(d):
    t = secs(d); am = 0.5 + 0.5 * np.sin(2 * np.pi * (10 + 3 * np.sin(2 * np.pi * 0.7 * t)) * t)
    return norm(bandpass(noise(d), 700, 5000) * am * np.minimum(1, t / 0.4) * np.minimum(1, (d - t) / 0.4), 0.09)
def s_van(d):
    t = secs(d); eng = np.sin(2 * np.pi * np.cumsum(55 + 8 * np.sin(2 * np.pi * 0.4 * t)) / SR) + 0.5 * np.sin(2 * np.pi * np.cumsum(110 + 16 * np.sin(2 * np.pi * 0.4 * t)) / SR)
    x = (eng + lowpass(noise(d), 300) * 0.8) * np.minimum(1, t / 0.8) * np.minimum(1, (d - t) / 0.8)
    sq = np.zeros_like(x); k = int(1.5 * SR); s = sweep(2600, 2200, 0.4) * env(0.4, 0.02, 0.15) * 0.3; sq[k:k + len(s)] = s
    return norm(x * 0.6 + sq, 0.3)
def s_ticker(d):
    out = np.zeros(int(d * SR)); tk = s_tick(); tt = 0.0
    while tt < d - 0.02: i = int(tt * SR); out[i:i + len(tk)] += tk; tt += max(0.035, 0.18 * (1 - tt / d) ** 1.5)
    return out
def s_shriek(d, rise=0.0, seed=7):
    """An original fax-handshake style screech: calling beeps, an answer tone, warbling two-tone data, hiss and sweeps."""
    rg = np.random.default_rng(seed); t = secs(d); n = len(t); x = np.zeros(n)
    seg = lambda a, b: (t >= a) & (t < b)
    # calling beeps (0.5 s on / 0.3 off) in the first second
    for k in range(2):
        m = seg(k * 0.45, k * 0.45 + 0.3); x[m] += np.sin(2 * np.pi * 1100 * t[m]) * 0.6
    # answer tone
    m = seg(0.9, 1.6); x[m] += np.sin(2 * np.pi * 2100 * t[m] + 2 * np.sin(2 * np.pi * 15 * t[m])) * 0.7
    # warbling data: random two-tone FSK at ~300 baud plus a second channel, with hiss bursts and sweeps
    data_from = min(1.6, d * 0.3)                   # short shrieks go straight into the warble
    m = t >= data_from; tt = t[m]
    if len(tt) < 64: return np.tanh(x * 1.2) * 0.42
    bits = rg.integers(0, 2, int(d * 300) + 2); f = np.where(bits[(tt * 300).astype(int)] == 1, 1650, 1850)
    bits2 = rg.integers(0, 2, int(d * 150) + 2); f2 = np.where(bits2[(tt * 150).astype(int)] == 1, 980, 1180)
    data = np.sin(2 * np.pi * np.cumsum(f) / SR) * 0.5 + np.sin(2 * np.pi * np.cumsum(f2) / SR) * 0.3
    hiss = bandpass(rg.standard_normal(len(tt)), 1500, 7000) * 0.25 * (np.sin(2 * np.pi * 0.9 * tt) > 0.3)
    swp = np.sin(2 * np.pi * np.cumsum(1200 + 1600 * ((tt * 1.3) % 1) ** 2) / SR) * 0.35 * (np.sin(2 * np.pi * 0.45 * tt + 1) > 0.5)
    flutter = 0.75 + 0.25 * np.sin(2 * np.pi * 9 * tt)
    x[m] += (data + hiss + swp) * flutter
    x *= np.minimum(1, t / 0.01) * np.minimum(1, (d - t) / 0.03)
    x *= (1 + rise * (t / d) ** 2)
    return np.tanh(x * 1.2) * 0.42

FX = {'step': s_step, 'patter': s_patter, 'land': s_land, 'boing': s_boing, 'pop': s_pop, 'zing': s_zing, 'swish': s_swish, 'swoosh': lambda: s_swish(0.6),
      'stamp': s_stamp, 'clack': s_clack, 'snap': s_snap, 'ding': s_ding, 'flip': s_flip}
LONG = {'mumble': s_mumble, 'buzz': s_buzz, 'flutter': s_flutter, 'van': s_van, 'ticker': s_ticker, 'shriek': s_shriek, 'marker': lambda d: s_marker(d)}
CACHE = {k: f() for k, f in FX.items()}

# ---------------------------------------------------------------- beat 1 (only for the email video's hand-built beat 1)
if not HAS_B1:
    B1 = [(0.2 + 0.35 * k, 'pop') for k in range(5)] + [(0.27 + 0.35 * k, 'tick') for k in range(5)]
    B1 += [(1.6, 'stamp')] + [(66 / 30, 'land'), (116 / 30, 'land')] + [((180 + 11 * k) / 30, 'step') for k in range(6)]
    for at, kind in B1: put(fx, CACHE.get(kind, s_tick()) * (0.5 if kind == 'stamp' else 1), at, 0.8 if kind != 'stamp' else 0.35)
    put(fx, s_buzz(0.45) * 2, 1.6, 0.5)                                   # Faxie's power flickers on
    put(fx, s_shriek(10.0 - 2.2, rise=0.9, seed=1), 2.2, 1.0)            # the shriek, louder to the end (peaks at 9.4 s)

# ---------------------------------------------------------------- cues for beats 2-99
k = 0
for b in BEATS:
    s0 = starts[b['beat']]
    for c in b['cues']:
        k += 1; at = s0 + c['t']; kind = c['kind']; pan = pan_of(k)
        if kind in CACHE: put(fx, CACHE[kind], at, 0.9, pan)
        elif kind == 'tick':
            for q in np.arange(0, c.get('dur', 4), 0.5): put(fx, s_tick(), at + q, 0.9, 0.2)
        elif kind in LONG:
            d = min(c.get('dur', 1.0), b['frames'] / FPS - c['t'])
            if d <= 0.05: continue
            sig = LONG[kind](d) if kind != 'shriek' else s_shriek(d, rise=0.3, seed=b['beat'])
            put(fx, sig, at, 0.75 if kind == 'shriek' else 1.0, pan * 0.5)

# ---------------------------------------------------------------- ambience per set
def loop(d, make): x = make(d); fade = int(0.5 * SR); x[:fade] *= np.linspace(0, 1, fade); x[-fade:] *= np.linspace(1, 0, fade); return x
def amb_room(d, keys=False):
    t = secs(d); x = lowpass(noise(d), 380) * 0.5 + np.sin(2 * np.pi * 60 * t) * 0.08 + np.sin(2 * np.pi * 120 * t) * 0.04
    if keys:
        for q in RNG.uniform(0, d, int(d * 1.5)): i = int(q * SR); c = bandpass(noise(0.02), 2000, 6000) * env(0.02, 0.0005, 0.004) * 0.25; x[i:i + len(c)] += c[: len(x) - i]
    return x
def amb_lobby(d): t = secs(d); return lowpass(noise(d), 260) * 0.6 + np.sin(2 * np.pi * 50 * t) * 0.05
def amb_city(d):
    t = secs(d); x = lowpass(noise(d), 500) * 0.7
    for q in RNG.uniform(0, d, int(d / 3)): i = int(q * SR); L = int(2.5 * SR); car = lowpass(noise(2.5), 700) * np.sin(np.pi * np.arange(L) / L) ** 2 * 0.6; x[i:i + L] += car[: len(x) - i]
    return x
def amb_map(d):
    t = secs(d); x = np.sin(2 * np.pi * 55 * t) * 0.12 + np.sin(2 * np.pi * 3100 * t) * 0.01 + lowpass(noise(d), 300) * 0.3
    for q in np.arange(0.3, d, 1.4): i = int(q * SR); bl = np.sin(2 * np.pi * 1760 * secs(0.05)) * env(0.05, 0.001, 0.015) * 0.15; x[i:i + len(bl)] += bl[: len(x) - i]
    return x
def amb_hall(d): t = secs(d); return lowpass(noise(d), 180) * 0.8 + bandpass(noise(d), 4000, 9000) * 0.03
def amb_card(d): return lowpass(noise(d), 300) * 0.1
AMB = {'trade': lambda d: amb_room(d, True), 'office': lambda d: amb_room(d, True), 'door': amb_lobby, 'city': amb_city, 'map': amb_map, 'hall': amb_hall, 'card': amb_card}
AMB_GAIN = {'trade': 0.05, 'office': 0.05, 'door': 0.05, 'city': 0.06, 'map': 0.05, 'hall': 0.05, 'card': 0.03}
if not HAS_B1: put(amb, norm(loop(B1_FRAMES / FPS + 0.3, AMB['trade'])) * AMB_GAIN['trade'], 0)
for b in BEATS:
    d = b['frames'] / FPS + 0.3
    put(amb, norm(loop(d, AMB[b['set']])) * AMB_GAIN[b['set']], starts[b['beat']] - 0.15)

# ---------------------------------------------------------------- music (original, written here)
BPM = 96; BEAT = 60 / BPM
NOTE = lambda name: 440 * 2 ** ((name - 69) / 12)
def pad(freqs, d, g=0.05):
    t = secs(d); x = sum(np.sin(2 * np.pi * f * (1 + det) * t + 0.4 * np.sin(2 * np.pi * 0.2 * t)) for f in freqs for det in (-0.004, 0.004))
    return x * g * np.minimum(1, t / 0.6) * np.minimum(1, (d - t) / 0.6)
def pluck(f, d=0.5, g=0.12):
    t = secs(d); return (np.sin(2 * np.pi * f * t) + 0.4 * np.sin(4 * np.pi * f * t) + 0.15 * np.sin(6 * np.pi * f * t)) * np.exp(-t / 0.16) * np.minimum(1, t / 0.003) * g
def bass(f, d, g=0.16): t = secs(d); return (np.sin(2 * np.pi * f * t) + 0.3 * np.sin(4 * np.pi * f * t)) * np.exp(-t / 0.3) * np.minimum(1, t / 0.005) * g
def kick(g=0.3): t = secs(0.35); return np.sin(2 * np.pi * np.cumsum(50 + 100 * np.exp(-t * 30)) / SR) * np.exp(-t / 0.12) * g
def hat(g=0.05): return bandpass(noise(0.05), 6000, 14000) * env(0.05, 0.0005, 0.012) * g
def block(g=0.12): t = secs(0.08); return np.sin(2 * np.pi * 900 * t) * np.exp(-t / 0.02) * g
# chords as MIDI roots + quality; each act: (beats from, beats to, progression, pattern)
MIN, MAJ = (0, 3, 7), (0, 4, 7)
ACTS = [
    (2, 8, [(57, MIN), (53, MAJ), (57, MIN), (52, MAJ)], 'pulse'),       # cold open: tense
    (9, 18, [(60, MAJ), (57, MIN), (53, MAJ), (55, MAJ)], 'arp'),       # how email travels: curious
    (19, 26, [(62, MIN), (58, MAJ), (62, MIN), (57, MIN)], 'sparse'),   # the sleeping bug: mysterious
    (27, 35, [(64, MIN), (60, MAJ), (64, MIN), (59, MAJ)], 'pulse'),    # the trigger: building
    (36, 52, [(54, MIN), (50, MAJ), (57, MAJ), (52, MAJ)], 'busy'),     # the world notices: chaos
    (53, 62, [(55, MIN), (51, MAJ), (53, MAJ), (50, MAJ)], 'heavy'),    # the fix that failed
    (63, 71, [(53, MAJ), (58, MAJ), (60, MAJ), (53, MAJ)], 'bounce'),   # the fax comeback: comic
    (72, 86, [(60, MAJ), (55, MAJ), (57, MIN), (53, MAJ)], 'arp'),      # doors reopen: hopeful
    (87, 96, [(57, MIN), (53, MAJ), (60, MAJ), (55, MAJ)], 'sparse'),   # what went wrong: reflective
    (97, 99, [(60, MAJ), (53, MAJ), (55, MAJ), (60, MAJ)], 'arp'),      # ending
]
def act_music(d, prog, style):
    out = np.zeros(int(d * SR) + 6 * SR); bar = 4 * BEAT; nb = int(np.ceil(d / bar))
    for i in range(nb):
        root, q = prog[i % len(prog)]; t0 = i * bar; chord = [NOTE(root + iv) for iv in q]
        p = pad(chord, bar + 0.6, 0.035 if style != 'sparse' else 0.045); j = int(t0 * SR); out[j:j + len(p)] += p[: len(out) - j]
        for s in range(16):
            ts = t0 + s * BEAT / 4; j = int(ts * SR)
            def add(sig):
                k = min(len(sig), len(out) - j)
                if k > 0: out[j:j + k] += sig[:k]
            if style == 'pulse' and s % 2 == 0: add(bass(NOTE(root - 12), 0.3, 0.12))
            if style == 'arp' and s % 2 == 0: add(pluck(chord[(s // 2) % 3] * 2, 0.4, 0.07))
            if style == 'arp' and s % 4 == 2: add(hat(0.025))
            if style == 'sparse' and s in (0, 6, 10): add(pluck(chord[s % 3] * 2, 0.8, 0.06))
            if style == 'busy': (s % 4 == 0) and add(kick(0.2)); (s % 2 == 1) and add(hat(0.035)); (s % 2 == 0) and add(bass(NOTE(root - 12), 0.2, 0.1))
            if style == 'heavy': (s in (0, 10)) and add(kick(0.26)); (s % 8 == 4) and add(hat(0.04)); (s == 0) and add(bass(NOTE(root - 12), 1.2, 0.14))
            if style == 'bounce': (s % 4 == 0) and add(bass(NOTE(root - 12 + (7 if s % 8 == 4 else 0)), 0.2, 0.13)); (s % 4 == 2) and add(block(0.08)); (s % 2 == 0) and add(pluck(chord[(s // 2) % 3] * 2, 0.2, 0.05))
    return out[: int(d * SR)]
for a, z, prog, style in ACTS:
    s0, s1 = starts[a], (starts[z + 1] if z + 1 in starts else TOTAL)
    d = s1 - s0 + 1.0; m = act_music(d, prog, style)
    fade = int(1.0 * SR); m[:fade] *= np.linspace(0, 1, fade); m[-fade:] *= np.linspace(1, 0, fade)
    put(mus, m, s0 - 0.5, 1.0)
# beat 1: a short tense synth pulse under the first 2 s, then the shriek owns the soundtrack
p1 = np.zeros(int(2.4 * SR))
for s in range(8): j = int(s * BEAT / 2 * SR); b_ = bass(NOTE(45), 0.3, 0.14); p1[j:j + len(b_)] += b_[: len(p1) - j]
p1 += pad([NOTE(57), NOTE(60), NOTE(64)], 2.4, 0.03); p1[-int(0.4 * SR):] *= np.linspace(1, 0, int(0.4 * SR))
put(mus, p1, 0, 1.0)
# duck the music under shrieks
duck = np.ones(N, np.float32)
def duck_span(a, b, depth=0.25):
    i, j = int(a * SR), min(N, int(b * SR)); r = int(0.3 * SR)
    duck[i:j] = np.minimum(duck[i:j], depth)
    if i - r > 0: duck[i - r:i] = np.minimum(duck[i - r:i], np.linspace(1, depth, r))
    if j + r < N: duck[j:j + r] = np.minimum(duck[j:j + r], np.linspace(depth, 1, r))
duck_span(2.2, B1_FRAMES / FPS, 0.0)
for b in BEATS:
    for c in b['cues']:
        if c['kind'] == 'shriek': duck_span(starts[b['beat']] + c['t'], starts[b['beat']] + c['t'] + c.get('dur', 1))
mus *= duck[:, None]

# ---------------------------------------------------------------- voice-over (Kokoro-82M, see audio/LICENCES.md)
import os
VDIR = os.path.join(os.path.dirname(cues_path), 'voice')
voice = np.zeros(N, np.float32); talk = np.zeros(N, np.float32); vlog = []
if os.path.isdir(VDIR):
    prev_end = 0.0
    for n in range(1, len(BEATS) + 2):
        f = os.path.join(VDIR, f'b{n:02d}.wav')
        if not os.path.exists(f): continue
        with wave.open(f) as w: v = np.frombuffer(w.readframes(w.getnframes()), np.int16 if w.getsampwidth() == 2 else np.int32).astype(np.float32); vsr = w.getframerate(); v /= (32768 if w.getsampwidth() == 2 else 2 ** 31)
        nz = np.nonzero(np.abs(v) > 0.01)[0]; v = v[max(0, nz[0] - int(0.03 * vsr)): nz[-1] + int(0.12 * vsr)] if len(nz) else v   # trim silence
        v = np.interp(np.arange(int(len(v) * SR / vsr)) * vsr / SR, np.arange(len(v)), v)                                    # 24 kHz -> 48 kHz
        v = v / (np.sqrt(np.mean(v ** 2)) + 1e-9) * 0.12                                                                    # even loudness, about -18 dBFS
        at = max(starts[n] + 0.3, prev_end + 0.25); i = int(at * SR); j = min(N, i + len(v)); voice[i:j] += v[: j - i]; talk[i:j] = 1
        prev_end = at + len(v) / SR; vlog.append((n, round(at - starts[n], 2), round(prev_end - (starts[n + 1] if n + 1 in starts else TOTAL), 2)))
    late = [x for x in vlog if x[1] > 0.35]
    sbr = None
    # duck everything else under speech (smooth 0.25 s ramps)
    k = int(0.25 * SR); sm = np.convolve(talk, np.ones(k) / k, mode='same')
    mus *= (1 - 0.6 * sm)[:, None]; amb *= (1 - 0.4 * sm)[:, None]; fx *= (1 - 0.45 * sm)[:, None]
    # keep speech at least 10 dB above everything else: measure in 0.2 s windows, then apply as one smooth gain curve
    W = int(0.2 * SR); gw = np.ones(N // W + 1)
    for q, i in enumerate(range(0, N - W, W)):
        if talk[i:i + W].mean() < 0.5: continue
        bg = np.sqrt(np.mean((fx[i:i + W] + amb[i:i + W] + mus[i:i + W] * 0.9) ** 2)) + 1e-9; sp = np.sqrt(np.mean(voice[i:i + W] ** 2)) + 1e-9
        gw[q] = min(1.0, sp / bg / 3.16)
    gw = np.minimum.reduce([gw, np.r_[gw[1:], 1], np.r_[1, gw[:-1]]])                  # look one window either side
    gain = np.interp(np.arange(N), np.arange(len(gw)) * W + W / 2, gw).astype(np.float32)
    gain = np.convolve(gain, np.ones(int(0.1 * SR)) / int(0.1 * SR), mode='same').astype(np.float32)
    fx *= gain[:, None]; amb *= gain[:, None]; mus *= gain[:, None]
    sbr = None
    print('voice lines', len(vlog), '| started late (beat, s):', [(a, b) for a, b, c in late], '| ran past beat end:', [(a, c) for a, b, c in vlog if c > 0])
    # duck everything else under speech (smooth 0.25 s ramps)
    k = int(0.25 * SR); sm = np.convolve(talk, np.ones(k) / k, mode='same')
    mus *= (1 - 0.6 * sm)[:, None]; amb *= (1 - 0.4 * sm)[:, None]; fx *= (1 - 0.45 * sm)[:, None]
    # keep speech at least 10 dB above everything else, window by window (the shrieks need extra room)
    W = int(0.2 * SR)
    for i in range(0, N - W, W):
        if talk[i:i + W].mean() < 0.5: continue
        bg = np.sqrt(np.mean((fx[i:i + W] + amb[i:i + W] + mus[i:i + W] * 0.9) ** 2)) + 1e-9; sp = np.sqrt(np.mean(voice[i:i + W] ** 2)) + 1e-9
        g = min(1.0, sp / bg / 3.16)
        if g < 1: fx[i:i + W] *= g; amb[i:i + W] *= g; mus[i:i + W] *= g
    fx[:] = np.stack([np.convolve(fx[:, c], np.ones(64) / 64, mode='same') if False else fx[:, c] for c in (0, 1)], 1)

# ---------------------------------------------------------------- mix + master
mix = fx * 1.0 + amb * 1.0 + mus * 0.9 + voice[:, None] * 1.0
mix = np.tanh(mix * 1.1) / np.tanh(1.1)                                 # gentle soft-clip
mix = mix / max(1e-9, np.max(np.abs(mix))) * 0.89                        # peak at about -1 dBFS
pcm = (mix * 32767).astype(np.int16)
with wave.open(out_path, 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
print(f'{out_path}: {TOTAL:.2f} s, {len(BEATS) + 1} beats, rms {20 * np.log10(np.sqrt(np.mean(mix ** 2)) + 1e-9):.1f} dBFS')
