#!/usr/bin/env python3
"""
🔔 갈라 소리 만들기 (26.9.20 사장님: 「소리 유형을 다양하게 — 사용자가 고르게」)

앱 안의 소리는 전부 코드로 합성하지만(에셋 0개 방침), OS 가 '파일'을 요구하는 자리가 있다
— 푸시 알림음과 CallKit 벨. 그 자리에 넣을 소리를 여기서 만든다.

⚖️ 전부 사인파·사각파 합성이다. 스타워즈·가오갤 같은 실제 음원은 한 조각도 쓰지 않는다
   (쓰면 스토어에서 바로 내려간다). 분위기만 우리 손으로 흉내 낸다.

소리 목록(알림음 8종 + 벨 3종):
  galla   기본 3음 — E5·B5·G#5, 밝고 짧은 인사
  space   우주 신호 — 낮은 곳에서 솟아 반짝이며 사라진다
  warp    워프 — 훅 빨려 들어갔다 쿵
  laser   광선 — 짧게 쏘고 튕긴다
  arcade  오락실 — 동전 먹는 8비트
  pager   삐삐 — 90년대 사각파 삐삐삐
  bell    맑은 종 — 조용한 자리용
  boing   뿅 — 스프링 튕기는 병맛
  quack   꽥 — 오리 같은 병맛
벨(4초 루프):
  ring-galla  기본 3음 반복
  ring-space  우주선 호출음
  ring-retro  옛날 전화 따르릉

쓰는 법:  python3 scripts/make-sounds.py
결과:     assets/sound/*.wav (미리듣기·원본)
          assets/sound/ios/*.caf  (iOS 푸시·CallKit)
          assets/sound/android/*.ogg (안드로이드 채널)
"""
import math, os, random, struct, subprocess, wave

SR = 44100
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "assets", "sound")

# ── 기본 파형 ────────────────────────────────────────────
def env_exp(t, dur, attack=0.004, decay=None):
    decay = decay or dur
    return min(1.0, t / attack) * math.exp(-3.2 * t / decay)

def tone(freq, dur, amp=0.5, wave_kind="sine", attack=0.004, decay=None, harm=0.32, shimmer=0.12, vib=0.0):
    """한 음. wave_kind: sine(맑음) / square(레트로) / saw(거침)"""
    n = int(SR * dur); buf = []
    for i in range(n):
        t = i / SR
        f = freq * (1 + (vib * math.sin(2 * math.pi * 6 * t)) if vib else 1)
        ph = 2 * math.pi * f * t
        if wave_kind == "square":
            s = 1.0 if math.sin(ph) >= 0 else -1.0
            s *= 0.55
        elif wave_kind == "saw":
            s = 2 * ((f * t) % 1.0) - 1
            s *= 0.5
        else:
            s = math.sin(ph) + harm * math.sin(2 * ph) + shimmer * math.sin(3.01 * ph)
        buf.append(amp * env_exp(t, dur, attack, decay) * s / 1.6)
    return buf

def sweep(f0, f1, dur, amp=0.5, wave_kind="sine", curve=1.0, attack=0.006, decay=None):
    """미끄러지는 소리 — 워프·레이저의 뼈대"""
    n = int(SR * dur); buf = []; ph = 0.0
    for i in range(n):
        t = i / SR; k = (t / dur) ** curve
        f = f0 + (f1 - f0) * k
        ph += 2 * math.pi * f / SR
        s = (1.0 if math.sin(ph) >= 0 else -1.0) * 0.5 if wave_kind == "square" else math.sin(ph) + 0.25 * math.sin(2 * ph)
        buf.append(amp * env_exp(t, dur, attack, decay) * s / 1.4)
    return buf

def noise(dur, amp=0.25, decay=None, lp=0.35):
    """쉭 하는 바람 — 우주선 느낌의 재료(간단 저역통과)"""
    n = int(SR * dur); buf = []; prev = 0.0
    for i in range(n):
        t = i / SR
        x = random.uniform(-1, 1)
        prev = prev + lp * (x - prev)
        buf.append(amp * env_exp(t, dur, 0.01, decay) * prev)
    return buf

def mix(layers):
    total = max(int(st * SR) + len(sm) for st, sm in layers)
    out = [0.0] * total
    for st, sm in layers:
        off = int(st * SR)
        for i, v in enumerate(sm):
            out[off + i] += v
    return out

def norm(buf, peak=0.82):
    m = max(abs(v) for v in buf) or 1.0
    return [v * (peak / m) for v in buf]

def tail(buf, ms=70):
    n = min(len(buf), int(SR * ms / 1000))
    for i in range(n):
        buf[len(buf) - n + i] *= (1 - i / n)
    return buf

def pad(buf, sec):
    need = int(SR * sec) - len(buf)
    return buf + [0.0] * need if need > 0 else buf

def write_wav(path, buf):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with wave.open(path, "w") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes(b"".join(struct.pack("<h", int(max(-1, min(1, v)) * 32767)) for v in buf))
    return path

# ── 음정 ────────────────────────────────────────────────
E4, A4, E5, GS5, B5, E6, B6 = 329.63, 440.0, 659.25, 830.61, 987.77, 1318.51, 1975.53

# ── 알림음 8종 ───────────────────────────────────────────
def s_galla():
    """기본 — 갈라 3음"""
    return tail(norm(mix([
        (0.000, tone(E5, 0.55, 0.55, decay=0.30)),
        (0.085, tone(B5, 0.60, 0.50, decay=0.32)),
        (0.175, tone(GS5, 0.75, 0.62, decay=0.45)),
        (0.175, tone(E6, 0.70, 0.18, decay=0.38)),
    ])), 90)

def s_space():
    """우주 신호 — 낮은 데서 솟아올라 반짝이고 사라진다(스페이스 오페라 톤)"""
    return tail(norm(mix([
        (0.00, sweep(180, 900, 0.50, 0.42, curve=0.6, decay=0.40)),
        (0.18, tone(B5, 0.70, 0.34, decay=0.45)),
        (0.26, tone(E6, 0.75, 0.30, decay=0.50)),
        (0.34, tone(B6, 0.80, 0.20, decay=0.55)),
        (0.05, noise(0.45, 0.10, decay=0.28)),
    ])), 110)

def s_warp():
    """워프 — 훅 빨려 들어갔다가 쿵"""
    return tail(norm(mix([
        (0.00, sweep(1400, 160, 0.45, 0.45, curve=1.8, decay=0.40)),
        (0.05, noise(0.40, 0.16, decay=0.30)),
        (0.42, tone(E4, 0.55, 0.55, decay=0.30, harm=0.5)),
        (0.44, tone(A4, 0.45, 0.22, decay=0.26)),
    ])), 100)

def s_laser():
    """광선 — 짧게 쏘고 한 번 튕긴다"""
    return tail(norm(mix([
        (0.00, sweep(2200, 420, 0.16, 0.55, wave_kind="square", curve=1.4, decay=0.14)),
        (0.14, sweep(1500, 600, 0.14, 0.30, wave_kind="square", curve=1.2, decay=0.12)),
        (0.30, tone(B5, 0.34, 0.22, decay=0.22)),
    ])), 70)

def s_arcade():
    """오락실 — 동전 먹는 8비트(레트로 게임 톤)"""
    return tail(norm(mix([
        (0.000, tone(B5, 0.10, 0.50, wave_kind="square", decay=0.09)),
        (0.075, tone(E6, 0.34, 0.55, wave_kind="square", decay=0.28)),
        (0.075, tone(B6, 0.30, 0.16, wave_kind="square", decay=0.24)),
    ])), 60)

def s_pager():
    """삐삐 — 90년대 사각파 삐삐삐"""
    l = []
    for k in range(3):
        l.append((k * 0.16, tone(1046.5, 0.12, 0.50, wave_kind="square", attack=0.002, decay=0.10)))
    return tail(norm(mix(l)), 50)

def s_bell():
    """맑은 종 — 조용한 자리용, 길게 울린다"""
    return tail(norm(mix([
        (0.00, tone(A4 * 2, 1.10, 0.50, decay=0.75, harm=0.45, shimmer=0.22)),
        (0.02, tone(A4 * 3, 0.90, 0.18, decay=0.55)),
    ])), 140)

def s_boing():
    """뿅 — 스프링 튕기는 병맛"""
    return tail(norm(mix([
        (0.00, sweep(240, 1200, 0.16, 0.50, curve=0.7, decay=0.14)),
        (0.15, sweep(1200, 300, 0.22, 0.45, curve=1.6, decay=0.18)),
        (0.36, sweep(300, 900, 0.14, 0.26, curve=0.8, decay=0.12)),
    ])), 70)

def s_quack():
    """꽥 — 오리 같은 병맛(사각파 비브라토)"""
    return tail(norm(mix([
        (0.00, tone(420, 0.20, 0.52, wave_kind="saw", decay=0.16, vib=0.06)),
        (0.16, tone(330, 0.24, 0.42, wave_kind="saw", decay=0.18, vib=0.08)),
    ])), 60)

ALERTS = {
    "galla": s_galla, "space": s_space, "warp": s_warp, "laser": s_laser,
    "arcade": s_arcade, "pager": s_pager, "bell": s_bell, "boing": s_boing, "quack": s_quack,
}

# ── 벨소리 3종(4초 루프) ─────────────────────────────────
def r_galla():
    one = []
    for base in (0.0, 0.42):
        one += [
            (base + 0.000, tone(E5, 0.34, 0.50, decay=0.20)),
            (base + 0.075, tone(B5, 0.34, 0.46, decay=0.20)),
            (base + 0.150, tone(GS5, 0.46, 0.54, decay=0.30)),
        ]
    body = pad(mix(one), 2.0)
    return tail(norm(body + body), 80)

def r_space():
    one = mix([
        (0.00, sweep(200, 1000, 0.40, 0.40, curve=0.6, decay=0.34)),
        (0.30, tone(B5, 0.45, 0.34, decay=0.30)),
        (0.42, tone(E6, 0.50, 0.28, decay=0.34)),
        (0.02, noise(0.40, 0.09, decay=0.24)),
    ])
    body = pad(one, 2.0)
    return tail(norm(body + body), 80)

def r_retro():
    """따르릉 — 옛날 전화. 두 음을 빠르게 번갈아 울린다"""
    one = []
    t = 0.0
    while t < 1.0:
        one.append((t, tone(1000, 0.045, 0.45, wave_kind="square", attack=0.002, decay=0.04)))
        one.append((t + 0.05, tone(800, 0.045, 0.45, wave_kind="square", attack=0.002, decay=0.04)))
        t += 0.1
    body = pad(mix(one), 2.0)
    return tail(norm(body + body), 80)

RINGS = {"galla": r_galla, "space": r_space, "retro": r_retro}

def run(cmd):
    subprocess.run(cmd, check=True)

if __name__ == "__main__":
    random.seed(7)                       # 잡음이 매번 같게 — 다시 돌려도 같은 소리
    print("🔔 갈라 소리 만드는 중…")
    ios = os.path.join(OUT, "ios"); andr = os.path.join(OUT, "android")
    os.makedirs(ios, exist_ok=True); os.makedirs(andr, exist_ok=True)

    for name, fn in ALERTS.items():
        wav = write_wav(os.path.join(OUT, f"alert-{name}.wav"), fn())
        run(["afconvert", "-f", "caff", "-d", "ima4", wav, os.path.join(ios, f"alert-{name}.caf")])
        run(["ffmpeg", "-y", "-loglevel", "error", "-i", wav, "-c:a", "libopus", "-b:a", "96k",
             os.path.join(andr, f"alert_{name}.ogg")])
        print(f"  알림음 {name}")

    for name, fn in RINGS.items():
        wav = write_wav(os.path.join(OUT, f"ring-{name}.wav"), fn())
        run(["afconvert", "-f", "caff", "-d", "ima4", wav, os.path.join(ios, f"ring-{name}.caf")])
        run(["ffmpeg", "-y", "-loglevel", "error", "-i", wav, "-c:a", "libopus", "-b:a", "96k",
             os.path.join(andr, f"ring_{name}.ogg")])
        print(f"  벨소리 {name}")

    print(f"완료 — 알림음 {len(ALERTS)}종, 벨소리 {len(RINGS)}종")
