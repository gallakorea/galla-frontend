#!/usr/bin/env python3
"""갈라 홍보 영상 v2 소리: 곡 A 를 b48(27.632초)에서 곡의 b66(37.244초) 엔딩으로 잘라 붙이고,
타격음·휙 소리·인트로 상승음을 영상 타이밍(timing-*.json)에 맞춰 얹은 뒤 영상과 합친다.
  python3 scripts/promo/mux2.py      → build/galla-promo-{16x9,9x16}.mp4 + assets/about/video 경량본·포스터"""
import json, os, subprocess
import numpy as np
from scipy.signal import butter, sosfilt
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
B = os.path.join(ROOT, "scripts/promo/build"); V = os.path.join(ROOT, "assets/about/video"); os.makedirs(V, exist_ok=True)
SR = 48000
tm = json.load(open(os.path.join(B, "timing-16x9.json")))
END = tm["END"]; CUT_V, CUT_S = tm["CUT"]
raw = subprocess.run(["ffmpeg", "-v", "error", "-i", os.path.join(ROOT, "assets/about/bgm-a.m4a"), "-f", "f32le", "-ac", "2", "-ar", str(SR), "-"], capture_output=True, check=True).stdout
song = np.frombuffer(raw, np.float32).reshape(-1, 2).astype(np.float64)
N = int(END * SR); mix = np.zeros((N, 2))
a = song[: int(CUT_V * SR)]
b = song[int(CUT_S * SR): int(CUT_S * SR) + N - len(a)]
xf = int(.02 * SR); r = np.linspace(0, 1, xf)[:, None]
mix[: len(a)] = a; mix[len(a) - xf: len(a)] = a[-xf:] * (1 - r) + b[:xf] * r; mix[len(a): len(a) + len(b) - xf] = b[xf:]
fo = int(1.2 * SR); mix[-fo:] *= np.linspace(1, 0, fo)[:, None]
rng = np.random.default_rng(3)
lp = lambda x, f: sosfilt(butter(2, f, "low", fs=SR, output="sos"), x)
bp = lambda x, f1, f2: sosfilt(butter(2, [f1, f2], "band", fs=SR, output="sos"), x)
def put(t, sig, g):
    i = int(t * SR); j = min(N, i + len(sig))
    if j > i: mix[i:j] += (sig[: j - i] * g)[:, None]
def impact(big):
    n = int(SR * .9); t = np.arange(n) / SR
    f = 40 + 90 * np.exp(-t * 20); thump = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 6)
    crack = lp(rng.standard_normal(n), 4000) * np.exp(-t * 35)
    return np.tanh((thump + crack * .6) * (1.2 + big))
def whoosh(d=.32):
    n = int(SR * d); t = np.arange(n) / SR; x = rng.standard_normal(n); y = np.zeros(n); k = 2048
    for i in range(0, n, k):
        p = i / n; y[i:i + k] = bp(x[max(0, i - k): i + k], 400 + 3000 * p, 1200 + 7000 * p)[-len(x[i:i + k]):]
    return y * np.sin(np.pi * t / d) ** 2
for t0, amp in tm["hits"]: put(t0, impact(amp), .16 * amp)
for t0 in tm["whoosh"]: put(t0, whoosh(), .22)
n = int(SR * 1.6); tt = np.arange(n) / SR; ris = np.zeros(n); x = rng.standard_normal(n); k = 2048
for i in range(0, n, k):
    p = i / n; ris[i:i + k] = bp(x[max(0, i - k): i + k], 200 + 4000 * p * p, 500 + 9000 * p * p)[-len(x[i:i + k]):]
put(.4, ris * (tt / tt[-1]) ** 2.5, .3)
mix /= max(1.0, np.max(np.abs(mix)) / .95)
wav = os.path.join(B, "audio2.wav")
import wave
with wave.open(wav, "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes((mix * 32000).astype("<i2").tobytes())
run = lambda *a: subprocess.run(["ffmpeg", "-v", "error", "-y", *a], check=True)
for ar, sc in (("16x9", "1280:720"), ("9x16", "720:1280")):
    full = os.path.join(B, f"galla-promo-{ar}.mp4")
    run("-i", os.path.join(B, f"video-{ar}.mp4"), "-i", wav, "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-shortest", full)
    run("-i", full, "-vf", f"scale={sc}", "-c:v", "libx264", "-preset", "slow", "-crf", "25", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-c:a", "aac", "-b:a", "128k", os.path.join(V, f"promo-{ar}.mp4"))
    png = os.path.join(B, f"poster-{ar}.png")
    run("-ss", str(CUT_V + 2.2), "-i", os.path.join(B, f"video-{ar}.mp4"), "-frames:v", "1", "-vf", f"scale={sc}", png)
    subprocess.run(["cwebp", "-quiet", "-q", "78", png, "-o", os.path.join(V, f"promo-{ar}.webp")], check=True)
print("ok", END)
