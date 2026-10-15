#!/usr/bin/env python3
"""galla.im/about 배경음악 — 웅장한 우주전쟁 테마(26.10.15)
D단조 · 92BPM · 16마디 루프(약 42초). 끝의 잔향을 앞에 겹쳐 이음매 없이 돈다.
층: 현악 8분 리프 / 저음 금관 화음 / 합창 패드 / 전쟁 북 / 영웅 금관 선율(후반) / 상승 노이즈·타격
출력: assets/about/bgm.m4a (ffmpeg aac)
"""
import numpy as np, subprocess, os, sys
from scipy.signal import butter, sosfilt, fftconvolve

SR = 44100
BPM = 92
BEAT = 60 / BPM
BAR = BEAT * 4
BARS = 16
LEN = BAR * BARS
N = int(LEN * SR)
TAIL = int(4 * SR)
rng = np.random.default_rng(7)
out = np.zeros((N + TAIL, 2))

def midi(m): return 440.0 * 2 ** ((m - 69) / 12)
def lp(x, f, order=2): return sosfilt(butter(order, min(f, SR / 2 - 100), "low", fs=SR, output="sos"), x)
def hp(x, f, order=2): return sosfilt(butter(order, f, "high", fs=SR, output="sos"), x)
def bp(x, f1, f2): return sosfilt(butter(2, [f1, f2], "band", fs=SR, output="sos"), x)

def saw(f, n, detune=0.0, phase=None):
    t = np.arange(n) / SR
    ph = rng.random() if phase is None else phase
    return 2 * ((f * (1 + detune) * t + ph) % 1.0) - 1

def env_adsr(n, a, d, s, r):
    e = np.ones(n) * s
    na, nd, nr = int(a * SR), int(d * SR), int(r * SR)
    na = min(na, n); e[:na] = np.linspace(0, 1, na)
    nd = min(nd, n - na); e[na:na + nd] = np.linspace(1, s, nd)
    if nr and nr < n: e[-nr:] *= np.linspace(1, 0, nr)
    return e

def put(sig, start, pan=0.0, gain=1.0):
    i = int(start * SR)
    j = min(i + len(sig), len(out))
    if j <= i: return
    l = np.cos((pan + 1) * np.pi / 4); r = np.sin((pan + 1) * np.pi / 4)
    out[i:j, 0] += sig[: j - i] * l * gain
    out[i:j, 1] += sig[: j - i] * r * gain

# 화성: 2마디씩 Dm  Bb  Gm  A | Dm  Bb  C  A  (16마디 = 진행 2바퀴)
D = 50  # D3
CH = [
    [D, D + 3, D + 7], [D - 4, D, D + 3], [D - 7, D - 4, D], [D - 5, D - 1, D + 2],
    [D, D + 3, D + 7], [D - 4, D, D + 3], [D - 2, D + 2, D + 5], [D - 5, D - 1, D + 2],
]
def chord_at(bar): return CH[(bar // 2) % len(CH)]

# 1) 현악 리프 — 8분음표, 근음·근음·5도·근음·8도·5도·근음·5도
PAT = [0, 0, 7, 0, 12, 7, 0, 7]
for bar in range(BARS):
    root = chord_at(bar)[0] + 12
    for k in range(8):
        t0 = bar * BAR + k * BEAT / 2
        n = int(BEAT / 2 * SR * 0.95)
        f = midi(root + PAT[k])
        x = sum(saw(f, n, d) for d in (-0.004, 0, 0.005)) / 3
        acc = 1.0 if k % 4 == 0 else 0.72
        x = lp(x, 1500 + 1600 * (bar / BARS)) * env_adsr(n, 0.005, 0.08, 0.55, 0.05) * acc
        g = 0.16 if bar < 4 else 0.2
        put(x, t0, pan=-0.35, gain=g)
        put(lp(saw(f * 2, n), 2400) * env_adsr(n, 0.005, 0.06, 0.4, 0.05) * acc, t0, pan=0.35, gain=g * 0.45)

# 2) 저음 금관 화음 — 2마디 단위, 서서히 열리는 필터
for seg in range(BARS // 2):
    t0 = seg * 2 * BAR
    n = int(2 * BAR * SR)
    notes = chord_at(seg * 2)
    x = np.zeros(n)
    for m in [notes[0] - 12] + notes:
        for d in (-0.006, -0.002, 0.003, 0.007):
            x += saw(midi(m), n, d)
    x /= 16
    tt = np.arange(n) / n
    # 필터 스윕: 블록별로 컷오프를 올린다
    y = np.zeros(n); blk = 4096
    for b in range(0, n, blk):
        fc = 400 + 1500 * np.sin(np.pi * min(1, tt[b] * 1.1)) ** 2 + (500 if seg >= 4 else 0)
        y[b:b + blk] = lp(x[max(0, b - 2048):b + blk], fc)[-len(x[b:b + blk]):]
    y *= env_adsr(n, 0.6, 0.4, 0.85, 0.5)
    put(y, t0, pan=0, gain=0.36 if seg >= 2 else 0.34)

# 3) 합창 패드 — 배음 합에 '아' 모음 포먼트
def choir(m, n):
    f = midi(m); t = np.arange(n) / SR
    vib = 1 + 0.004 * np.sin(2 * np.pi * 5.2 * t)
    x = np.zeros(n)
    for h in range(1, 14):
        x += np.sin(2 * np.pi * f * h * np.cumsum(vib) / SR + rng.random() * 6) / h
    x = bp(x, 600, 1300) * 1.6 + bp(x, 2300, 3100) * 0.6 + lp(x, 400) * 0.4
    return x
for seg in range(2, BARS // 2):
    t0 = seg * 2 * BAR
    n = int(2 * BAR * SR)
    notes = chord_at(seg * 2)
    x = sum(choir(m + 12, n) for m in notes) / 3
    x *= env_adsr(n, 1.2, 0.5, 0.8, 0.8)
    put(x, t0, pan=-0.2, gain=0.13); put(x[::-1] * 0 + x, t0 + 0.012, pan=0.25, gain=0.1)

# 4) 전쟁 북 — 피치가 떨어지는 저음 + 껍질 노이즈
def boom(big=1.0):
    n = int(1.4 * SR); t = np.arange(n) / SR
    f = 46 + 70 * np.exp(-t * 14)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 3.2)
    skin = lp(rng.standard_normal(n), 1800) * np.exp(-t * 28) * 0.7
    return (body + skin) * big
def snare():
    n = int(0.5 * SR); t = np.arange(n) / SR
    return (hp(rng.standard_normal(n), 900) * np.exp(-t * 16) * 0.55 + np.sin(2 * np.pi * 190 * t) * np.exp(-t * 30) * 0.4)
for bar in range(0, BARS):
    full = bar >= 8
    hits = [0, 1.5, 2, 3] if full else ([0, 2.5] if bar >= 4 else [0, 2])   # 1~4마디는 심장박동처럼 두 번
    for h in hits:
        put(boom(1.0 if h in (0, 2) else 0.7), bar * BAR + h * BEAT, pan=0, gain=0.62 if bar >= 4 else 0.45)
    if full:
        for h in (1, 3): put(snare(), bar * BAR + h * BEAT, pan=0.1, gain=0.24)
    if bar % 4 == 3 and bar >= 4:  # 마디 끝 필인
        for k, h in enumerate([3.0, 3.25, 3.5, 3.75]):
            put(boom(0.5 + k * 0.15), bar * BAR + h * BEAT, pan=(-0.3 + k * 0.2), gain=0.5)

# 5) 영웅 금관 선율(9~16마디)
MEL = [  # (박 위치, 반음, 길이 박)  D단조 위에서 위로 치고 올라가는 동기
    (0, 12, 1.5), (1.5, 19, 0.5), (2, 17, 1), (3, 16, 1), (4, 14, 3), (7, 12, 1),
    (8, 10, 1.5), (9.5, 12, 0.5), (10, 14, 1), (11, 17, 1), (12, 16, 4),
    (16, 12, 1.5), (17.5, 19, 0.5), (18, 22, 1), (19, 21, 1), (20, 19, 2), (22, 17, 2),
    (24, 17, 1.5), (25.5, 16, 0.5), (26, 14, 1), (27, 13, 1), (28, 14, 4),
]
for b, semi, L in MEL:
    t0 = 8 * BAR + b * BEAT
    n = int(L * BEAT * SR)
    f = midi(D + semi)
    x = sum(saw(f, n, d) for d in (-0.003, 0.0, 0.004)) / 3
    t = np.arange(n) / SR
    x *= 1 + 0.01 * np.sin(2 * np.pi * 5.5 * t)
    y = np.zeros(n); blk = 2048
    for i in range(0, n, blk):
        fc = 700 + 2600 * min(1, (i / SR) / 0.18)  # 금관 특유의 '빠-' 하고 열리는 소리
        y[i:i + blk] = lp(x[max(0, i - 1024):i + blk], fc)[-len(x[i:i + blk]):]
    y *= env_adsr(n, 0.04, 0.15, 0.8, 0.12)
    put(y, t0, pan=0.15, gain=0.2)
    put(lp(y, 900), t0, pan=-0.15, gain=0.12)

# 6) 8마디 직전 상승 노이즈 + 타격
n = int(BAR * SR); t = np.arange(n) / SR
riser = np.zeros(n); blk = 2048; nz = rng.standard_normal(n)
for i in range(0, n, blk):
    riser[i:i + blk] = bp(nz[max(0, i - 2048):i + blk], 300 + 5000 * (i / n) ** 2, 600 + 9000 * (i / n) ** 2)[-len(nz[i:i + blk]):]
riser *= (t / t[-1]) ** 2.5
put(riser, 7 * BAR, pan=0, gain=0.16)
put(boom(1.4), 8 * BAR, gain=0.7)
n = int(3 * SR); t = np.arange(n) / SR
crash = hp(rng.standard_normal(n), 3000) * np.exp(-t * 1.6)
put(crash, 8 * BAR, pan=-0.2, gain=0.12); put(crash[::-1][::-1], 8 * BAR + 0.01, pan=0.2, gain=0.12)

# 잔향(합성 임펄스) — 넓은 홀
ir_n = int(2.6 * SR); it = np.arange(ir_n) / SR
ir = rng.standard_normal((ir_n, 2)) * np.exp(-it * 2.4)[:, None]
ir[:, 0] = lp(ir[:, 0], 6000); ir[:, 1] = lp(ir[:, 1], 6000)
wet = np.stack([fftconvolve(out[:, c], ir[:, c])[: len(out)] for c in range(2)], 1)
mix = out * 0.8 + wet * 0.09

# 루프: 끝 꼬리를 앞에 겹치고 본문 길이로 자른다
loop = mix[:N].copy()
loop[:TAIL] += mix[N:N + TAIL]
loop = hp(loop.T, 30).T
loop /= np.max(np.abs(loop)) / 0.89
loop = np.tanh(loop * 1.15) / np.tanh(1.15)

base = os.path.join(os.path.dirname(__file__), "..", "..", "assets", "about")
wav = os.path.join(base, "_bgm.wav")
import wave
with wave.open(wav, "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((loop * 32000).astype("<i2").tobytes())
m4a = os.path.join(base, "bgm.m4a")
subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", wav, "-c:a", "aac", "-b:a", "128k", m4a], check=True)
os.remove(wav)
print("ok", m4a, round(LEN, 1), "s")
