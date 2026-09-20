#!/usr/bin/env python3
"""
🔔 갈라 브랜드 사운드 생성기 (26.9.20 사장님: 「파일 3개로 가되」)

앱 안의 소리는 전부 코드로 합성하지만(에셋 0개 방침), OS 가 '파일'을 요구하는
자리가 셋 있다 — iOS 푸시 알림음, 안드로이드 푸시 알림음, CallKit 수신 벨.
그 셋만 여기서 만든다. 세 소리는 같은 모티브(갈라 3음)를 공유해, 어디서 들어도
「갈라구나」 하고 알아채게 한다.

  갈라 3음: E5 → B5 → G#5  (E 장조의 1-5-3, 밝고 짧게 떨어지는 인사)

쓰는 법:  python3 scripts/make-sounds.py
결과:     assets/sound/ 에 wav 원본, 그리고 각 플랫폼 포맷으로 변환본
          · galla-alert.caf  (iOS 푸시 — aps.sound)
          · galla-alert.ogg  (Android 푸시 — res/raw)
          · galla-ring.caf   (CallKit 수신 벨, 루프용 4초)
⚠️ 사인파 합성이라 저작권 걱정이 없고, 파일도 수십 KB 수준이다.
"""
import math, os, struct, subprocess, wave

SR = 44100
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "assets", "sound")

def note(freq, dur, amp=0.5, attack=0.004, decay=None, detune=0.0, shimmer=True):
    """한 음 — 사인 기본파에 옥타브 배음을 살짝 얹고, 뒤를 길게 떨어뜨린다(종소리 느낌)."""
    n = int(SR * dur)
    decay = decay if decay is not None else dur
    buf = []
    for i in range(n):
        t = i / SR
        # 엔벨로프: 아주 짧게 올라갔다가 지수로 사그라든다
        env = min(1.0, t / attack) * math.exp(-3.2 * t / decay)
        s = math.sin(2 * math.pi * freq * t)
        s += 0.32 * math.sin(2 * math.pi * freq * 2 * t)          # 한 옥타브 위 배음 — 맑기
        if shimmer:
            s += 0.12 * math.sin(2 * math.pi * freq * 3.01 * t)   # 살짝 어긋난 배음 — 금속성 반짝임
        if detune:
            s += 0.25 * math.sin(2 * math.pi * (freq * (1 + detune)) * t)
        buf.append(amp * env * s / 1.6)
    return buf

def mix(layers):
    """길이가 다른 조각들을 시작 시각에 맞춰 겹친다. [(시작초, 샘플들), ...]"""
    total = max(int(st * SR) + len(sm) for st, sm in layers)
    out = [0.0] * total
    for st, sm in layers:
        off = int(st * SR)
        for i, v in enumerate(sm):
            out[off + i] += v
    return out

def normalize(buf, peak=0.82):
    m = max(abs(v) for v in buf) or 1.0
    k = peak / m
    return [v * k for v in buf]

def fade_tail(buf, ms=60):
    """끝을 부드럽게 — 뚝 끊기면 '툭' 하는 잡음이 들린다."""
    n = min(len(buf), int(SR * ms / 1000))
    for i in range(n):
        buf[len(buf) - n + i] *= (1 - i / n)
    return buf

def write_wav(path, buf):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with wave.open(path, "w") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes(b"".join(struct.pack("<h", int(max(-1, min(1, v)) * 32767)) for v in buf))
    return path

# ── 음정 ────────────────────────────────────────────────
E5, GS5, B5, E6 = 659.25, 830.61, 987.77, 1318.51

def alert():
    """푸시 알림음 — 0.9초. 갈라 3음을 빠르게 굴리고 끝을 살짝 울린다."""
    return fade_tail(normalize(mix([
        (0.00, note(E5,  0.55, 0.55, decay=0.30)),
        (0.085, note(B5, 0.60, 0.50, decay=0.32)),
        (0.175, note(GS5, 0.75, 0.62, decay=0.45)),
        (0.175, note(E6, 0.70, 0.18, decay=0.38)),   # 옥타브 위로 얇게 겹쳐 반짝임
    ])), 90)

def ring_once():
    """전화 벨 한 마디 — 2초. 같은 3음을 두 번 굴려 '따르릉' 리듬을 만든다."""
    pat = []
    for base in (0.0, 0.42):                          # 한 마디 안에서 두 번
        pat += [
            (base + 0.00, note(E5,  0.34, 0.50, decay=0.20)),
            (base + 0.075, note(B5, 0.34, 0.46, decay=0.20)),
            (base + 0.150, note(GS5, 0.46, 0.54, decay=0.30)),
        ]
    body = mix(pat)
    body += [0.0] * int(SR * (2.0 - len(body) / SR))  # 뒤 정적 — 벨 사이 숨
    return body

def ring():
    """CallKit 벨 — 2초 마디를 두 번(4초). iOS 가 알아서 반복한다."""
    one = ring_once()
    return fade_tail(normalize(one + one), 80)

def conv(src, dst, args):
    subprocess.run(args, check=True)
    print("  →", os.path.relpath(dst, os.path.dirname(OUT)), os.path.getsize(dst), "bytes")

if __name__ == "__main__":
    print("🔔 갈라 소리 만드는 중…")
    a = write_wav(os.path.join(OUT, "galla-alert.wav"), alert())
    r = write_wav(os.path.join(OUT, "galla-ring.wav"), ring())
    print("  원본 wav 2개")

    # iOS: .caf (IMA4 압축 — 애플 권장, 30초 이내)
    for src, name in ((a, "galla-alert.caf"), (r, "galla-ring.caf")):
        dst = os.path.join(OUT, name)
        conv(src, dst, ["afconvert", "-f", "caff", "-d", "ima4", src, dst])
    # Android: .ogg (res/raw 는 소문자·언더스코어만 허용해서 이름을 바꾼다)
    dst = os.path.join(OUT, "galla_alert.ogg")
    conv(a, dst, ["ffmpeg", "-y", "-loglevel", "error", "-i", a, "-c:a", "libopus", "-b:a", "96k", dst])
    print("완료 — assets/sound/")
