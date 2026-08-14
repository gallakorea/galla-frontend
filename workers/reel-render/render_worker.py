#!/usr/bin/env python3
# 🎬 갈라 릴스 렌더 워커 — 유저 원본 클립 + 내레이션 + 구절 자막 → 완성 릴스 mp4
#
# 갈비스 릴스 실행 에이전트의 마지막 단계. Shotstack 같은 외부 합성 API 없이
# ffmpeg로 직접 편집한다(트림→9:16 통일→이어붙이기→ASS 자막 번인→보이스 믹스).
# 자막 스타일은 사장님 실제 완성본(Vrew→FCP fcpxml)에서 역산한 규격.
#
# 사용법:
#   테스트(단독):  python3 render_worker.py --job job.json --out out.mp4
#   상주(큐 폴링): python3 render_worker.py --poll        (agent_jobs state='render_queued' 픽업)
#
# job 스펙(JSON):
# {
#   "segments":  [{"src": "경로|URL", "in": 0.0, "dur": 3.2}, ...],   # 배치 확정된 타임라인(순서대로)
#   "voice":     "경로|URL",                                          # 내레이션(m4a/webm/mp3)
#   "subtitles": [{"text": "가락시장", "start": 0.0, "len": 0.46}, ...],
#   "width": 1080, "height": 1920, "fps": 30
# }

import argparse, json, os, re, shlex, subprocess, sys, tempfile, time, urllib.request

# 맥 홈브루 기본 ffmpeg는 슬림 빌드(libass 없음) — 자막 번인에는 ffmpeg-full 필요(keg-only 경로 우선)
_FULL = "/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg"
FFMPEG = os.environ.get("FFMPEG") or (_FULL if os.path.exists(_FULL) else "ffmpeg")

# ── 자막 스타일 — 수현이네 4K 완성본 '픽셀 실측' 재현(사장님 "실측으로 완전히 맞춰") ──
#    실측치: 글자블록 높이 2.81%H · 박스 높이 3.88%H · 박스 = 화면폭 60% '고정폭 바'(텍스트 비례 아님)
#            · 세로 중앙 49.2% · 박스 불투명도 ≈30%(검정) · Noto Sans KR ExtraBold
#    구현: 박스는 별도 레이어의 ASS 사각형 드로잉(고정폭), 글자는 그 위 레이어(테두리·그림자 없음).
ASS_HEADER = """[Script Info]
ScriptType: v4.00+
PlayResX: {w}
PlayResY: {h}
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Reel,{font},{size},&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,0,0,5,40,40,0,1
Style: Box,Arial,20,&HB2000000,&HB2000000,&HB2000000,&HB2000000,0,0,0,0,100,100,0,0,1,0,0,5,0,0,0,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""

def ass_time(t: float) -> str:
    t = max(0.0, t)
    h = int(t // 3600); m = int(t % 3600 // 60); s = t % 60
    return f"{h}:{m:02d}:{s:05.2f}"

_font_cache = {}
def _text_metrics(text: str, px_size: int):
    """(잉크폭, 잉크중심의 advance중심 대비 오프셋) — libass는 advance로 중앙정렬하므로
    박스를 '잉크 중심'에 맞추려면 오프셋 보정이 필요(실측: 맵부심 잉크가 advance보다 좌측)."""
    try:
        from PIL import ImageFont
        # libass는 Fontsize를 '줄높이'로 해석(NotoKR 줄높이≈1.46em) — PIL(em)과 스케일 보정(실측 104/152)
        ps = max(8, round(px_size * 0.684))
        if ps not in _font_cache:
            fp = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fonts", "NotoSansKR-ExtraBold.ttf")
            _font_cache[ps] = ImageFont.truetype(fp, ps)
        f = _font_cache[ps]
        px_size = ps
        adv = f.getlength(text)
        # ⚠️ 이 폰트(가변폰트 인스턴스)는 getbbox가 advance 박스를 돌려줌(잉크 아님) —
        #    실제 비트맵으로 그려서 잉크 경계를 잰다(원본 박스는 잉크 기준이라 이게 맞다).
        from PIL import Image, ImageDraw
        pad = px_size
        img = Image.new("L", (int(adv) + pad * 2, px_size * 3), 0)
        ImageDraw.Draw(img).text((pad, px_size), text, font=f, fill=255)
        bb = img.getbbox()
        if not bb: return adv, 0.0
        ink_w = bb[2] - bb[0]
        off = (bb[0] + bb[2]) / 2 - (pad + adv / 2)   # 잉크중심 − advance중심
        return ink_w, off
    except Exception:
        return sum(0.33 if ch == " " else 0.9 for ch in text) * px_size, 0.0

def build_ass(subtitles, w, h, font):
    size = round(h * 0.0459)              # 무배경 캘리브레이션: 이 폰트 한글블록=0.61em → 블록 2.81%H 정확
    box_h = round(h * 0.0388)             # 박스 높이 3.88%H
    pad_h = round(size * 0.35)            # 좌우 패딩: 원본 실측 = 글자높이×0.57 = 0.35em (잉크폭 기준)
    cy = round(h * 0.492)                 # 세로 중앙 49.2%
    cx = round(w / 2)
    out = ASS_HEADER.format(w=w, h=h, font=font, size=size)
    for s in subtitles:
        text = re.sub(r"[\r\n]+", " ", str(s["text"])).replace("{", "").replace("}", "")
        start = float(s["start"]); end = start + max(0.2, float(s.get("len", 0.5)))
        t0, t1 = ass_time(start), ass_time(end)
        ink_w, off = _text_metrics(text, size)         # 사장님 확인: 박스 폭은 글자에 맞게 자동
        bw = round(ink_w) + pad_h * 2
        bcx = cx + off                                  # 박스를 잉크 중심에
        x0, x1 = round(bcx - bw / 2), round(bcx + bw / 2)
        y0, y1 = cy - box_h // 2, cy + box_h // 2
        out += (f"Dialogue: 0,{t0},{t1},Box,,0,0,0,,{{\\an7\\p1\\pos(0,0)}}m {x0} {y0} l {x1} {y0} {x1} {y1} {x0} {y1}{{\\p0}}\n"
                f"Dialogue: 1,{t0},{t1},Reel,,0,0,0,,{{\\pos({cx},{cy})}}{text}\n")
    return out

def run(cmd):
    p = subprocess.run(cmd, capture_output=True, text=True)
    if p.returncode != 0:
        raise RuntimeError(f"ffmpeg failed: {' '.join(shlex.quote(c) for c in cmd)}\n{p.stderr[-1200:]}")
    return p

def fetch(src, dest):
    if re.match(r"^https?://", src):
        # ⚠️ R2/Cloudflare가 python-urllib 기본 UA를 403으로 막는다 — 브라우저형 UA 필수
        req = urllib.request.Request(src, headers={"User-Agent": "galla-reel-worker/1.0"})
        with urllib.request.urlopen(req, timeout=120) as r, open(dest, "wb") as f:
            f.write(r.read())
        return dest
    if not os.path.exists(src):
        raise FileNotFoundError(src)
    return src

def render(job: dict, out_path: str, workdir: str, progress=lambda msg: None):
    w = int(job.get("width", 1080)); h = int(job.get("height", 1920)); fps = int(job.get("fps", 30))
    font = job.get("font", "Noto Sans KR ExtraBold")
    segs = job["segments"]
    if not segs: raise ValueError("no segments")

    # 1) 소스 확보(URL이면 다운로드)
    progress("소스 내려받는 중")
    local = []
    for i, sg in enumerate(segs):
        local.append(fetch(sg["src"], os.path.join(workdir, f"src{i}{os.path.splitext(sg['src'].split('?')[0])[1] or '.mp4'}")))
    voice = fetch(job["voice"], os.path.join(workdir, "voice" + (os.path.splitext(job["voice"].split("?")[0])[1] or ".m4a")))

    # 2) 세그먼트 트림 + 9:16 통일(커버 크롭) — 코덱 통일해 무손실 concat 가능하게
    seg_files = []
    for i, sg in enumerate(segs):
        progress(f"클립 다듬는 중 {i + 1}/{len(segs)}")
        sf = os.path.join(workdir, f"seg{i}.mp4")
        vf = f"scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h},fps={fps},setsar=1"
        cmd = [FFMPEG, "-y", "-v", "error"]
        if float(sg.get("in", 0)) > 0: cmd += ["-ss", str(sg["in"])]
        cmd += ["-t", str(sg["dur"]), "-i", local[i], "-vf", vf, "-an",
                "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", sf]
        run(cmd)
        seg_files.append(sf)

    # 3) 이어붙이기
    progress("이어붙이는 중")
    lst = os.path.join(workdir, "list.txt")
    with open(lst, "w") as f:
        for sf in seg_files: f.write(f"file '{sf}'\n")
    video = os.path.join(workdir, "video.mp4")
    run([FFMPEG, "-y", "-v", "error", "-f", "concat", "-safe", "0", "-i", lst, "-c", "copy", video])

    # 4) 자막 번인 + 내레이션 믹스(클립 원음은 이미 제거됨)
    progress("자막·음성 입히는 중")
    ass = os.path.join(workdir, "subs.ass")
    with open(ass, "w") as f: f.write(build_ass(job.get("subtitles", []), w, h, font))
    # 번들 폰트 우선(워커와 함께 배포되는 fonts/ — 컨테이너 이식 시에도 동일), 없으면 시스템 폰트
    bundled = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fonts")
    fontsdir = job.get("fontsdir") or (bundled if os.path.isdir(bundled) else "/System/Library/Fonts")
    tempo = float(job.get("voice_tempo") or 1)   # ⏱ 30초 타겟 — 에이전트가 정한 배속(자막·컷 타이밍도 같은 비율로 이미 압축됨)
    cmd = [FFMPEG, "-y", "-v", "error", "-i", video, "-i", voice,
           "-map", "0:v", "-map", "1:a",
           "-vf", f"ass=filename='{ass}':fontsdir='{fontsdir}'"]
    if tempo > 1.001:
        cmd += ["-filter:a", f"atempo={tempo:.3f}"]
    cmd += ["-c:v", "libx264", "-preset", "medium", "-crf", "19",
            "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", "-shortest", out_path]
    run(cmd)
    progress("완성")
    return out_path

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--job", help="job JSON 파일(단독 렌더 테스트)")
    ap.add_argument("--out", default="reel_out.mp4")
    ap.add_argument("--poll", action="store_true", help="agent_jobs 큐 폴링 상주 모드")
    args = ap.parse_args()

    if args.job:
        with open(args.job) as f: job = json.load(f)
        with tempfile.TemporaryDirectory() as wd:
            t0 = time.time()
            render(job, args.out, wd, progress=lambda m: print(f"[render] {m}", flush=True))
            print(f"[render] done {args.out} ({time.time() - t0:.1f}s)")
        return

    if args.poll:
        from queue_poll import poll_loop   # 큐 연결(에이전트 잡 시스템)은 별도 모듈
        poll_loop(render)
        return

    ap.print_help()

if __name__ == "__main__":
    main()
