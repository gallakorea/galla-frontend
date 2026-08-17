#!/usr/bin/env python3
"""
갈라 궁합 OG 카드 생성기 — assets/og/match/<TYPE>.png (1200x630) 16장 + intro.png

카톡·페북 크롤러는 JS를 안 돌리므로 결과 카드를 실시간 렌더할 수 없다.
유형은 16개로 고정이니 미리 구워두면 비용 0·지연 0으로 유형별 카드가 뜬다.
(점수 게이지는 유형의 대표값 75/25 로 그린다 — 카드 인상은 유형이 결정한다.)

    python3 scripts/gen-match-og.py
"""
import math
import os

from PIL import Image, ImageDraw, ImageFont

OUT = os.path.join(os.path.dirname(__file__), "..", "assets", "og", "match")
W, H = 1200, 630

KR = "/System/Library/Fonts/AppleSDGothicNeo.ttc"
EMOJI = "/System/Library/Fonts/Apple Color Emoji.ttc"

# match.html TYPES / functions/share MATCH_TYPES 와 동일 순서·내용
TYPES = [
    ("HAPM", "📣", "광화문 확성기", "옳다고 믿는 쪽에 서서 제일 크게 소리치는 사람"),
    ("HAPU", "💥", "혼자 싸우는 반란군", "전부가 반대해도 혼자 돌격하는 사람"),
    ("HAEM", "🎪", "판 키우는 흥행사", "누가 이기든 상관없다, 판이 커지면 그만"),
    ("HAEU", "🃏", "청개구리 트롤러", "분위기가 쏠리는 순간 반대편에 서는 사람"),
    ("HDPM", "🛡️", "우리 편 방패", "내 편이 맞으면 몸으로 막는 사람"),
    ("HDPU", "⛰️", "고집불통 요새", "세상이 다 바뀌어도 자리를 안 옮기는 사람"),
    ("HDEM", "🤝", "열혈 중재자", "싸움판에 뛰어들어 말리는 사람"),
    ("HDEU", "🕊️", "소수의견 변호인", "지고 있는 쪽에 마음이 가는 사람"),
    ("CAPM", "🎯", "냉혈 저격수", "감정 없이 급소만 정확히 찌르는 사람"),
    ("CAPU", "🐍", "여론 암살자", "대세를 조용히 무너뜨리는 사람"),
    ("CAEM", "📊", "팩트 폭격기", "감정 대신 근거를 쏟아붓는 사람"),
    ("CAEU", "🔬", "악마의 변호인", "이긴 쪽 논리를 끝까지 해부하는 사람"),
    ("CDPM", "🧊", "침착한 방패", "흔들리지 않고 자기 자리를 지키는 사람"),
    ("CDPU", "🗿", "침묵의 바위", "말은 안 하지만 절대 안 바뀌는 사람"),
    ("CDEM", "🧘", "강 건너 불구경", "싸움을 구경하되 절대 안 들어가는 사람"),
    ("CDEU", "👻", "관전만 하는 유령", "다 보고 다 알지만 흔적을 안 남기는 사람"),
]


def kr(size, weight=8):
    """AppleSDGothicNeo.ttc 인덱스: 0~ 로 굵기가 올라간다(환경차 있어 안전하게 폴백)."""
    for idx in (weight, 4, 2, 0):
        try:
            return ImageFont.truetype(KR, size, index=idx)
        except Exception:
            continue
    return ImageFont.load_default()


def emoji_img(ch, px=160):
    """Apple Color Emoji 는 sbix 비트맵이라 지정된 크기(160)에서만 열린다 → 열고 리사이즈."""
    try:
        f = ImageFont.truetype(EMOJI, 160)
        im = Image.new("RGBA", (200, 200), (0, 0, 0, 0))
        ImageDraw.Draw(im).text((100, 100), ch, font=f, anchor="mm", embedded_color=True)
        return im.crop(im.getbbox() or (0, 0, 200, 200)).resize((px, px), Image.LANCZOS)
    except Exception:
        return None


def lerp(c1, c2, t):
    return tuple(round(a + (b - a) * t) for a, b in zip(c1, c2))


def hexc(s):
    s = s.lstrip("#")
    return tuple(int(s[i:i + 2], 16) for i in (0, 2, 4))


def crest(size, key, c1, c2):
    """match.html 의 캔버스 문장과 같은 규칙으로 그린다(온도=색, 공격=가시, 확신=링, 대세=중심)."""
    S = size * 3  # 슈퍼샘플링
    im = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    cx = cy = S / 2
    R = S * 0.42

    attack = key[1] == "A"
    spikes = 12 if attack else 8
    sharp = 0.36 if attack else 0.18

    pts = []
    for i in range(spikes * 2):
        ang = math.pi / spikes * i - math.pi / 2
        rr = R * (1 - sharp) if i % 2 else R
        pts.append((cx + math.cos(ang) * rr, cy + math.sin(ang) * rr))
    d.polygon(pts, fill=(255, 255, 255, 10))
    d.line(pts + [pts[0]], fill=c1 + (255,), width=int(S * 0.014), joint="curve")

    if key[2] == "P":  # 확신 = 두꺼운 단일 링
        d.ellipse([cx - R * .66, cy - R * .66, cx + R * .66, cy + R * .66],
                  outline=c2 + (255,), width=int(S * 0.026))
    else:              # 균형 = 얇은 이중 링
        for k in (.72, .58):
            d.ellipse([cx - R * k, cy - R * k, cx + R * k, cy + R * k],
                      outline=c2 + (255,), width=int(S * 0.008))

    if key[3] == "M":  # 대세 추종 = 꽉 찬 중심
        d.ellipse([cx - R * .4, cy - R * .4, cx + R * .4, cy + R * .4], fill=(255, 255, 255, 24))
    else:              # 역행 = 안쪽으로 꺾인 화살촉
        for k in range(8):
            a0 = math.pi / 4 * k
            d.line([(cx + math.cos(a0) * R * .46, cy + math.sin(a0) * R * .46),
                    (cx + math.cos(a0 + .28) * R * .3, cy + math.sin(a0 + .28) * R * .3)],
                   fill=c2 + (255,), width=int(S * 0.011))

    d.ellipse([cx - R * 1.1, cy - R * 1.1, cx + R * 1.1, cy + R * 1.1],
              outline=(255, 255, 255, 40), width=int(S * 0.004))
    if key[0] == "H":  # 열혈 = 외곽에 이글거리는 점
        for k in range(12):
            a0 = math.pi / 6 * k
            r = S * 0.012
            px, py = cx + math.cos(a0) * R * 1.1, cy + math.sin(a0) * R * 1.1
            d.ellipse([px - r, py - r, px + r, py + r], fill=c2 + (255,))

    return im.resize((size, size), Image.LANCZOS)


def backdrop(c1):
    """세로 그라디언트 + 좌측 후광 + 격자."""
    im = Image.new("RGB", (W, H), (8, 8, 11))
    d = ImageDraw.Draw(im)
    for y in range(H):
        d.line([(0, y), (W, y)], fill=lerp(hexc("#12131a"), hexc("#07070a"), y / H))
    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    for r in range(360, 0, -6):
        a = int(46 * (1 - r / 360) ** 2)
        gd.ellipse([300 - r, H / 2 - r, 300 + r, H / 2 + r], fill=c1 + (a,))
    im = Image.alpha_composite(im.convert("RGBA"), glow)
    gr = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    gd = ImageDraw.Draw(gr)
    for x in range(0, W, 60):
        gd.line([(x, 0), (x, H)], fill=(255, 255, 255, 9))
    for y in range(0, H, 60):
        gd.line([(0, y), (W, y)], fill=(255, 255, 255, 9))
    return Image.alpha_composite(im, gr)


def gauges(d, x, y, key):
    """유형의 대표 게이지(각 축 75/25)."""
    axes = [("🔥 열혈", "🧊 냉정", key[0] == "H"), ("⚔️ 공격", "🛡️ 수비", key[1] == "A"),
            ("🎯 확신", "⚖️ 균형", key[2] == "P"), ("🌊 대세", "🦅 역행", key[3] == "M")]
    f = kr(19, 6)
    bw, pad = 340, 52
    on, off = (255, 255, 255), (108, 114, 128)
    for i, (la, lb, left) in enumerate(axes):
        yy = y + i * 40
        # 이모지 없이 텍스트만(작은 크기에선 컬러 이모지가 지저분함)
        d.text((x + pad - 8, yy), la[2:], font=f, anchor="rm", fill=on if left else off)
        d.text((x + bw - pad + 8, yy), lb[2:], font=f, anchor="lm", fill=off if left else on)
        # ⚠️ RGBA 캔버스의 ImageDraw 는 알파를 합성하지 않고 덮어쓴다 → 트랙은 불투명 회색으로.
        d.rounded_rectangle([x + pad, yy - 4, x + bw - pad, yy + 4], 4, fill=(38, 40, 50))
        span = bw - pad * 2
        fill_w = span * (0.75 if left else 0.25)
        d.rounded_rectangle([x + pad, yy - 4, x + pad + fill_w, yy + 4], 4, fill=(255, 90, 110))


def make(key, em, name, line):
    hot = key[0] == "H"
    c1 = hexc("#ff5a6e") if hot else hexc("#4d8dff")
    c2 = hexc("#ff9d3d") if hot else hexc("#6ff0ff")

    im = backdrop(c1)
    cr = crest(340, key, c1, c2)
    im.alpha_composite(cr, (130, (H - 340) // 2))
    e = emoji_img(em, 150)
    if e:
        im.alpha_composite(e, (130 + (340 - 150) // 2, (H - 340) // 2 + (340 - 150) // 2))

    d = ImageDraw.Draw(im)
    x = 540
    d.text((x, 96), "G A L L A   궁 합", font=kr(22, 8), fill=(150, 156, 170))
    d.text((x, 140), name, font=kr(62, 9), fill=(255, 255, 255))
    d.text((x, 222), line, font=kr(24, 6), fill=(168, 174, 188))
    d.text((x, 268), key, font=kr(22, 9), fill=c1)
    gauges(d, x, 340, key)
    d.text((x, 528), "우리 둘, 같은 편일까 원수일까", font=kr(27, 9), fill=(255, 255, 255))
    d.text((x, 566), "12문항 30초 · 로그인 없이 · galla.im", font=kr(21, 6), fill=(130, 136, 150))
    return im.convert("RGB")


def make_intro():
    c1, c2 = hexc("#ff5a6e"), hexc("#4d8dff")
    im = backdrop(c1)
    d = ImageDraw.Draw(im)
    a = crest(280, "HAPM", c1, hexc("#ff9d3d"))
    b = crest(280, "CDEU", c2, hexc("#6ff0ff"))
    im.alpha_composite(a, (78, 300))
    im.alpha_composite(b, (842, 300))
    d.text((W // 2, 150), "갈라 궁합", font=kr(38, 8), anchor="ma", fill=(160, 166, 180))
    d.text((W // 2, 206), "우리 둘, 같은 편일까 원수일까", font=kr(70, 9), anchor="ma", fill=(255, 255, 255))
    d.text((W // 2, 306), "12문항 30초 · 16가지 논쟁 유형 · 로그인 없이 바로", font=kr(28, 6),
           anchor="ma", fill=(170, 176, 190))
    d.text((W // 2, 380), "VS", font=kr(66, 9), anchor="ma", fill=(255, 255, 255))
    d.text((W // 2, 548), "galla.im — 여론이 에너지가 되는 곳", font=kr(24, 6),
           anchor="ma", fill=(130, 136, 150))
    return im.convert("RGB")


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    for key, em, name, line in TYPES:
        p = os.path.join(OUT, f"{key}.png")
        make(key, em, name, line).save(p, "PNG", optimize=True)
        print("✓", os.path.relpath(p))
    p = os.path.join(OUT, "intro.png")
    make_intro().save(p, "PNG", optimize=True)
    print("✓", os.path.relpath(p))
