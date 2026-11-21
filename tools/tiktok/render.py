#!/usr/bin/env python3
"""TikTok edits (1080x1920, 30 fps) of a winning Aureous trade: hook, chart replay, result card.
usage: render.py <trade id> [--frames t1,t2,...]   (frames: write PNG stills at those seconds instead of a video)
Candles come from candles/<id>.json: [[t ms, o, h, l, c, v], ...] fetched from Hyperliquid."""
import json, math, os, subprocess, sys, datetime
from PIL import Image, ImageDraw, ImageFont, ImageFilter

W, H, FPS = 1080, 1920, 30
D = os.path.dirname(os.path.abspath(__file__))
F = lambda w, s: ImageFont.truetype(f"{D}/fonts/ibm-plex-sans-latin-{w}-normal.ttf", s)
CINZEL = lambda s: ImageFont.truetype(f"{D}/fonts/cinzel-latin-600-normal.ttf", s)
BG, PANEL, LINE, TEXT, MUTED, FAINT = (12, 13, 16), (19, 20, 24), (39, 42, 49), (236, 232, 225), (155, 151, 143), (103, 100, 94)
GOLD, GOLD2, LONG, SHORT = (209, 168, 90), (230, 196, 127), (38, 181, 138), (229, 87, 94)
# TikTok covers the right edge (buttons) and the bottom (caption): keep everything inside this box
X0, X1, Y0, Y1 = 64, 900, 170, 1480

T = {t["id"]: t for t in json.load(open(f"{D}/trades.json"))}[int(sys.argv[1])]
K = json.load(open(f"{D}/{os.environ.get('CANDLES', 'candles')}/{T['id']}.json"))
SIGN = 1 if T["side"] == "long" else -1
E_T, E_PX = T["entry"]; X_T, X_PX = T["exit"]
MARGIN = T["sz"] * E_PX / T["lev"]
ROE = T["pnl"] / MARGIN
HELD = (X_T - E_T) / 1000

def ease(x): x = max(0., min(1., x)); return 1 - (1 - x) ** 3
def ease_io(x): x = max(0., min(1., x)); return 3 * x * x - 2 * x * x * x
def lerp(a, b, t): return a + (b - a) * t
def mix(c1, c2, t): return tuple(int(lerp(a, b, t)) for a, b in zip(c1, c2))
def money(x, d=2): return ("+" if x >= 0 else "-") + "$" + f"{abs(x):,.{d}f}"
def pxfmt(x):
    d = 0 if x >= 10000 else 1 if x >= 1000 else 2 if x >= 10 else 4
    return f"{x:,.{d}f}"
def dur(s):
    h, m = int(s // 3600), int(s % 3600 // 60)
    return f"{h}h {m}m" if h else f"{m}m {int(s % 60)}s" if m < 10 else f"{m}m"
COIN = T["coin"]
SIDE = "Long" if SIGN > 0 else "Short"

def text(d, xy, s, font, fill, anchor="la"): d.text(xy, s, font=font, fill=fill, anchor=anchor)

def background():
    im = Image.new("RGB", (W, H), BG)
    glow = Image.new("RGB", (W, H), BG); g = ImageDraw.Draw(glow)
    g.ellipse((-300, -700, W + 300, 700), fill=(34, 30, 22))
    return Image.blend(im, glow.filter(ImageFilter.GaussianBlur(160)), 1.0)
BGIMG = background()

def mark(d, cx, cy, r, col=GOLD):
    d.ellipse((cx - r, cy - r, cx + r, cy + r), outline=col, width=max(2, r // 11))
    rr = r * .82
    for i in range(30):
        a = i / 30 * 2 * math.pi; x, y = cx + rr * math.cos(a), cy + rr * math.sin(a); s = max(1.5, r / 16)
        d.ellipse((x - s, y - s, x + s, y + s), fill=col)
    text(d, (cx, cy + r * .06), "A", CINZEL(int(r * .95)), col, "mm")

def chrome(d, alpha=1.):
    """brand line at the top and the paper-money note at the bottom (on every frame)"""
    mark(d, X0 + 26, Y0 + 26, 26)
    text(d, (X0 + 66, Y0 + 27), "AUREOUS", CINZEL(30), TEXT, "lm")
    text(d, (X0, Y1 + 30), "Paper trading on live Hyperliquid prices. No real money.", F(400, 26), FAINT)

def counter_font(s, maxw, start=150, weight=600):
    size = start
    while size > 40 and F(weight, size).getlength(s) > maxw: size -= 4
    return F(weight, size)

# ------------------------------------------------------------------ scenes
HOOK, REPLAY, CARD = 2.6, 8.4, 5.0

def scene_hook(t):
    im = BGIMG.copy(); d = ImageDraw.Draw(im); chrome(d)
    p = ease(t / 1.3)
    cy = 820
    text(d, (X0, cy - 210), "A trader on Aureous made", F(500, 54), mix(BG, TEXT, ease(t / .35)))
    s = money(T["pnl"] * p, 0)
    f = counter_font(s, X1 - X0, 190)
    text(d, (X0 - 6, cy), s, f, mix(BG, LONG, ease(t / .25)), "lm")
    a = ease((t - .9) / .5)
    text(d, (X0, cy + 150), f"on one {COIN} {SIDE.lower()}", F(500, 54), mix(BG, TEXT, a))
    text(d, (X0, cy + 225), f"{T['lev']}x leverage, held {dur(HELD)}", F(400, 42), mix(BG, MUTED, a))
    if t > 1.6:   # underline sweep
        w = (X1 - X0) * ease((t - 1.6) / .6)
        d.rectangle((X0, cy + 300, X0 + w, cy + 304), fill=GOLD)
    return im

# chart replay -------------------------------------------------------------
pre = [k for k in K if k[0] <= E_T]
i0 = max(0, len(pre) - 26)                          # some context before the entry
i1 = next((i for i, k in enumerate(K) if k[0] > X_T), len(K) - 1)
KK = K[i0:min(len(K), i1 + 7)]
TSTART, TEND = KK[0][0], KK[-1][0] + T["step"]
CH = (X0, 600, X1 - 96, 1400)                       # plot box; price labels to its right
lo = min(k[3] for k in KK); hi = max(k[2] for k in KK)
pad = (hi - lo) * .12; lo -= pad; hi += pad
def X(tms): return CH[0] + (tms - TSTART) / (TEND - TSTART) * (CH[2] - CH[0])
def Y(p): return CH[3] - (p - lo) / (hi - lo) * (CH[3] - CH[1])
# replay clock: ease in, linger near the exit
def clock(t):
    u = t / (REPLAY - 1.1)
    return TSTART + ease_io(min(1, u)) * (TEND - TSTART)

def price_at(tms):
    for k in KK:
        if k[0] <= tms < k[0] + T["step"]:
            f = (tms - k[0]) / T["step"]
            return lerp(k[1], k[4], f)
    return KK[-1][4]

SS = 2   # supersample the chart for smooth lines
def chart_layer(now, show_exit, flash):
    w, h = (W) * SS, (CH[3] - CH[1] + 160) * SS
    oy = CH[1] - 80
    im = Image.new("RGBA", (w, h), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    S = lambda x, y: (x * SS, (y - oy) * SS)
    # grid + price labels
    for i in range(5):
        p = lo + (hi - lo) * (i + .5) / 5; y = Y(p)
        d.line([S(CH[0], y), S(CH[2], y)], fill=(30, 32, 37, 255), width=SS)
        text(d, S(CH[2] + 14, y), pxfmt(p), F(400, 22 * SS), FAINT + (255,), "lm")
    cw = (CH[2] - CH[0]) / ((TEND - TSTART) / T["step"]) * .66
    for k in KK:
        if k[0] > now: break
        o, c = k[1], k[4]; hh, ll = k[2], k[3]
        if now < k[0] + T["step"]:                    # the candle still forming
            f = (now - k[0]) / T["step"]; c = lerp(o, c, f); hh = max(o, c, lerp(o, hh, f)); ll = min(o, c, lerp(o, ll, f))
        x = X(k[0] + T["step"] / 2); col = (LONG if c >= o else SHORT) + (255,)
        d.line([S(x, Y(hh)), S(x, Y(ll))], fill=col, width=max(SS, int(SS * 1.5)))
        y1, y2 = sorted((Y(o), Y(c)))
        d.rectangle([S(x - cw / 2, y1), S(x + cw / 2, max(y2, y1 + 1.5))], fill=col)
    if now >= E_T:
        ex = X(E_T); ey = Y(E_PX)
        cur = X_PX if show_exit else price_at(min(now, X_T))
        right = X(min(now, X_T)) if not show_exit else X(X_T)
        # shaded profit band between entry and price
        good = (cur - E_PX) * SIGN >= 0
        band = (LONG if good else SHORT) + (46,)
        y_a, y_b = sorted((ey, Y(cur)))
        d.rectangle([S(ex, y_a), S(right, y_b)], fill=band)
        # dashed entry line across the plot
        x = CH[0]
        while x < CH[2]:
            d.line([S(x, ey), S(min(x + 10, CH[2]), ey)], fill=GOLD + (230,), width=2 * SS); x += 18
        r = 11
        d.ellipse([S(ex - r, ey - r), S(ex + r, ey + r)], fill=GOLD + (255,), outline=BG + (255,), width=3 * SS)
        lab = f"Entry {pxfmt(E_PX)}"; f = F(600, 24 * SS); tw = f.getlength(lab) / SS
        ly = ey + (40 if SIGN > 0 else -40)
        d.rounded_rectangle([S(ex - tw / 2 - 12, ly - 19), S(ex + tw / 2 + 12, ly + 19)], radius=8 * SS, fill=GOLD + (255,))
        text(d, S(ex, ly), lab, f, BG + (255,), "mm")
    if show_exit:
        xx, xy = X(X_T), Y(X_PX)
        r = 12 + 26 * flash
        d.ellipse([S(xx - r, xy - r), S(xx + r, xy + r)], outline=TEXT + (int(255 * (1 - flash * .7)),), width=3 * SS)
        d.ellipse([S(xx - 10, xy - 10), S(xx + 10, xy + 10)], fill=TEXT + (255,))
        lab = ("Take profit " if T["how"] == "tp" else "Closed ") + pxfmt(X_PX)
        f = F(600, 24 * SS); tw = f.getlength(lab) / SS
        ly = xy - 44 * SIGN; lx = min(xx, CH[2] - tw / 2 - 14)
        d.rounded_rectangle([S(lx - tw / 2 - 12, ly - 19), S(lx + tw / 2 + 12, ly + 19)], radius=8 * SS, fill=TEXT + (255,))
        text(d, S(lx, ly), lab, f, BG + (255,), "mm")
    return im.resize((W, h // SS), Image.LANCZOS), oy

def scene_replay(t):
    im = BGIMG.copy(); d = ImageDraw.Draw(im); chrome(d)
    now = clock(t)
    closed = now >= X_T
    t_close = None
    if closed:   # find when the clock crossed the exit
        lo_t, hi_t = 0., t
        for _ in range(30):
            m = (lo_t + hi_t) / 2
            if clock(m) >= X_T: hi_t = m
            else: lo_t = m
        t_close = hi_t
    flash = 0. if not closed else max(0., 1 - (t - t_close) / .6)
    # header: market + side
    text(d, (X0, 300), f"{COIN}-USD", F(600, 50), TEXT, "lm")
    chip = f"{SIDE} {T['lev']}x"; f = F(600, 34); cw = f.getlength(chip)
    cx = X0 + F(600, 50).getlength(f"{COIN}-USD") + 22
    col = LONG if SIGN > 0 else SHORT
    d.rounded_rectangle((cx, 276, cx + cw + 32, 324), radius=10, fill=mix(BG, col, .22))
    text(d, (cx + 16, 300), chip, f, col, "lm")
    # live PnL
    if now < E_T:
        pnl, sub, pc = None, "Waiting for the entry", MUTED
    elif not closed:
        p = price_at(now); pnl = (p - E_PX) * SIGN * T["sz"]; sub = f"Held {dur((now - E_T) / 1000)}"; pc = LONG if pnl >= 0 else SHORT
    else:
        pnl = T["pnl"]; sub = f"Closed after {dur(HELD)}"; pc = LONG
    if pnl is None:
        text(d, (X0, 430), "$0.00", F(600, 110), MUTED, "lm")
    else:
        s = money(pnl); f = counter_font(s, X1 - X0, 110)
        if flash: pc = mix(pc, (255, 255, 255), flash * .6)
        text(d, (X0, 430), s, f, pc, "lm")
        roe = pnl / MARGIN
        text(d, (X1, 430), f"{'+' if roe >= 0 else ''}{roe * 100:.1f}%", F(500, 44), pc, "rm")
    text(d, (X0, 510), sub, F(400, 34), MUTED, "lm")
    layer, oy = chart_layer(now, closed, flash)
    im.paste(layer, (0, oy), layer)
    # time axis
    dt = datetime.datetime.fromtimestamp(now / 1000, datetime.timezone.utc)
    text(d, (X0, CH[3] + 50), dt.strftime("%d %b %Y, %H:%M UTC"), F(400, 28), FAINT, "lm")
    text(d, (CH[2], CH[3] + 50), f"{T['iv']} candles", F(400, 28), FAINT, "rm")
    if flash:
        ov = Image.new("RGB", (W, H), (255, 255, 255)); im = Image.blend(im, ov, flash * .18)
    return im

def scene_card(t):
    im = BGIMG.copy(); d = ImageDraw.Draw(im); chrome(d)
    a = lambda s, l=.45: ease((t - s) / l)
    y = 360
    text(d, (X0, y), f"{COIN} {SIDE.lower()}, {T['lev']}x", F(500, 44), mix(BG, MUTED, a(0)), "lm")
    s = money(T["pnl"]); f = counter_font(s, X1 - X0, 170)
    yy = y + 150 - 30 * (1 - a(.1))
    text(d, (X0 - 4, yy), s, f, mix(BG, LONG, a(.1)), "lm")
    text(d, (X0, y + 290), f"+{ROE * 100:.1f}% on the margin used", F(500, 46), mix(BG, LONG, a(.3)), "lm")
    rows = [("Entry", pxfmt(E_PX)), ("Exit", pxfmt(X_PX)), ("Size", f"{T['sz']:,.4f}".rstrip("0").rstrip(".") + f" {COIN}"),
            ("Margin", "$" + f"{MARGIN:,.0f}"), ("Held", dur(HELD))]
    for i, (k, v) in enumerate(rows):
        ry = y + 420 + i * 76; al = a(.45 + i * .08, .35)
        d.line((X0, ry - 38, X1, ry - 38), fill=mix(BG, LINE, al), width=2)
        text(d, (X0, ry), k, F(400, 38), mix(BG, MUTED, al), "lm")
        text(d, (X1, ry), v, F(500, 38), mix(BG, TEXT, al), "rm")
    # call to action
    al = a(1.6, .5); cy = 1250 + 20 * (1 - al)
    d.rounded_rectangle((X0, cy - 70, X1, cy + 70), radius=22, fill=mix(BG, (30, 27, 21), al), outline=mix(BG, GOLD, al), width=3)
    mark(d, X0 + 70, int(cy), 40, mix(BG, GOLD, al))
    text(d, (X0 + 132, cy - 20), "Try it free at aureous.trade", F(600, 44), mix(BG, TEXT, al), "lm")
    text(d, (X0 + 132, cy + 30), "$10,000 of paper money, live markets", F(400, 32), mix(BG, MUTED, al), "lm")
    return im

SCENES = [("hook", HOOK, scene_hook), ("replay", REPLAY, scene_replay), ("card", CARD, scene_card)]

def at(sec):
    for name, length, fn in SCENES:
        if sec < length: return fn(sec)
        sec -= length
    return SCENES[-1][2](SCENES[-1][1] - 1 / FPS)

if "--frames" in sys.argv:
    out = f"{D}/stills"; os.makedirs(out, exist_ok=True)
    for s in sys.argv[sys.argv.index("--frames") + 1].split(","):
        at(float(s)).save(f"{out}/{T['id']}_{s}.png")
    sys.exit()

os.makedirs(f"{D}/out", exist_ok=True)
parts = []
for name, length, fn in SCENES:
    tmp, final = f"{D}/out/{T['id']}_{name}.tmp.mp4", f"{D}/out/{T['id']}_{name}.mp4"
    p = subprocess.Popen(["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
                          "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", "-r", str(FPS), tmp], stdin=subprocess.PIPE)
    for i in range(round(length * FPS)):
        p.stdin.write(fn(i / FPS).tobytes())
    p.stdin.close()
    if p.wait() != 0: sys.exit("ffmpeg failed on " + name)
    os.replace(tmp, final); parts.append(final)
lst = f"{D}/out/{T['id']}_list.txt"
open(lst, "w").write("".join(f"file '{x}'\n" for x in parts))
subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", lst, "-c", "copy", f"{D}/out/{T['id']}_silent.mp4"], check=True)
# when the replay clock reaches the exit: the sound's big moment
lo_t, hi_t = 0., REPLAY
for _ in range(40):
    m = (lo_t + hi_t) / 2
    if clock(m) >= X_T: hi_t = m
    else: lo_t = m
total = sum(l for _, l, _ in SCENES)
subprocess.run([sys.executable, f"{D}/sound.py", f"{D}/out/{T['id']}.wav", str(total), str(HOOK), str(HOOK + hi_t)], check=True)
subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", f"{D}/out/{T['id']}_silent.mp4", "-i", f"{D}/out/{T['id']}.wav", "-map", "0:v", "-map", "1:a",
                "-c:v", "copy", "-c:a", "aac", "-b:a", "160k", "-shortest", "-movflags", "+faststart", f"{D}/out/{T['id']}.tmp.mp4"], check=True)
os.replace(f"{D}/out/{T['id']}.tmp.mp4", f"{D}/out/aureous-trade-{T['id']}.mp4")
print("ok", f"{D}/out/aureous-trade-{T['id']}.mp4", total)
