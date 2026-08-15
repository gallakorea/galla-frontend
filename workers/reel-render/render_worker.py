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

def probe_dur(path: str) -> float:
    """클립 실제 길이(초). 실패 시 8초로 가정."""
    try:
        # ⚠️ FFMPEG 경로에 'ffmpeg-full' 같은 디렉터리명이 섞여 있어 단순 치환하면 엉뚱한 경로가 된다(실사고:
        #    모든 클립 길이를 8초로 오인 → 컷 분할·음성 커버 계산이 통째로 틀어짐). 파일명만 바꾼다.
        probe = os.path.join(os.path.dirname(FFMPEG), "ffprobe") if os.path.dirname(FFMPEG) else "ffprobe"
        p = subprocess.run([probe, "-v", "error",
                            "-show_entries", "format=duration", "-of", "csv=p=0", path],
                           capture_output=True, text=True)
        return float(p.stdout.strip())
    except Exception:
        return 8.0

_motion_cache = {}
def motion_profile(path: str):
    """프레임 차분(YDIF)으로 '움직임 곡선'을 뽑는다 — 붓기·자르기·건져올리기 같은 결정적 순간을 찾기 위한 재료."""
    if path in _motion_cache: return _motion_cache[path]
    try:
        p = subprocess.run(
            [FFMPEG, "-v", "info", "-i", path, "-vf",
             "scale=160:-2,signalstats,metadata=print:key=lavfi.signalstats.YDIF:file=-",
             "-an", "-f", "null", "-"],
            capture_output=True, text=True)
        out = p.stdout + p.stderr
        times, vals, tcur = [], [], None
        for line in out.splitlines():
            line = line.strip()
            if line.startswith("frame:"):
                m = re.search(r"pts_time:([0-9.]+)", line)
                tcur = float(m.group(1)) if m else None
            elif "YDIF=" in line and tcur is not None:
                try: vals.append(float(line.split("=")[1])); times.append(tcur)
                except ValueError: pass
        prof = list(zip(times, vals))
        _motion_cache[path] = prof
        return prof
    except Exception:
        _motion_cache[path] = []
        return []

def frame_stats(path: str, t: float, workdir: str):
    """그 시각의 화면이 '쓸 만한 그림'인지 실측 — 선명도(엣지 에너지)와 노출을 본다.
    ⚠️ 지금까지 못 잡던 것: 클립 안에서 카메라가 휘둘려 벽·바닥만 스치는 구간이 뽑히던 문제.
       움직임만 보면 그런 구간이 오히려 '동작 큼'으로 뽑힌다 — 실제 화면을 봐야 걸러진다."""
    try:
        from PIL import Image, ImageFilter, ImageStat
        f = os.path.join(workdir, f"q_{abs(hash((path, round(t, 2)))) % 10**9}.jpg")
        subprocess.run([FFMPEG, "-y", "-v", "error", "-ss", f"{t:.2f}", "-i", path,
                        "-frames:v", "1", "-vf", "scale=240:-2", f],
                       capture_output=True, text=True)
        if not os.path.exists(f): return 0.0
        im = Image.open(f).convert("L")
        edges = im.filter(ImageFilter.FIND_EDGES)
        sharp = ImageStat.Stat(edges).stddev[0]          # 초점·디테일
        mean = ImageStat.Stat(im).mean[0]                 # 노출
        try: os.remove(f)
        except OSError: pass
        # ⚠️ 선명도를 '높을수록 좋다'로 쓰면 벽에 붙은 기사·메뉴판처럼 글자 많은 화면이 최고점을 받는다
        #    (실사고: 그래서 쓸데없는 장면이 더 뽑혔다). 점수가 아니라 '불합격 판정'에만 쓴다.
        return sharp, mean
    except Exception:
        return None

_takes_cache = {}
def clip_takes(path: str, workdir: str, min_len: float = 3.0, max_len: float = 6.0):
    """🎯 '쓸 수 있는 구간'만 뽑아낸다 — 사장님 지시: 흔들리고 초점 나간 부분은 통째로 버리고,
    안정적으로 초점 맞은 3~6초 구간만 원본으로 확보한 뒤 그것들로 조합한다.

    판정 기준(전부 그 클립 '자기 자신'과 비교 — 클립 간 절대비교는 글자 많은 화면이 이기는 함정이 있다):
      · 초점: 엣지 에너지가 그 클립 최고치의 70% 이상   → 흐린 구간 탈락
      · 흔들림: 프레임 차분이 그 클립 중앙값의 1.8배 이하 → 카메라 휘두른 구간 탈락
    반환: [(start, end, score)] 점수 높은 순.
    """
    key = (path, round(min_len, 1))
    if key in _takes_cache: return _takes_cache[key]
    try:
        from PIL import Image, ImageFilter, ImageStat
        total = probe_dur(path)
        step = 0.5
        # 0.5초 간격 샘플 프레임 → 초점 점수
        focus, times = [], []
        t = 0.0
        while t < total - 0.1 and len(times) < 60:
            f = os.path.join(workdir, f"tk_{abs(hash((path, round(t,2))))%10**9}.jpg")
            subprocess.run([FFMPEG, "-y", "-v", "error", "-ss", f"{t:.2f}", "-i", path,
                            "-frames:v", "1", "-vf", "scale=240:-2", f], capture_output=True, text=True)
            if os.path.exists(f):
                try:
                    im = Image.open(f).convert("L")
                    focus.append(ImageStat.Stat(im.filter(ImageFilter.FIND_EDGES)).stddev[0])
                    times.append(t)
                except Exception:
                    pass
                try: os.remove(f)
                except OSError: pass
            t += step
        if not focus:
            _takes_cache[key] = []
            return []
        prof = motion_profile(path)                    # 흔들림(프레임 차분)
        mvals = sorted(v for _, v in prof) or [0.0]
        med = mvals[len(mvals) // 2] or 1.0
        fmax = max(focus) or 1.0
        # 각 샘플이 '쓸 만한가' 판정
        fmed = sorted(focus)[len(focus) // 2] or 1.0
        ok = []
        for i, tt in enumerate(times):
            seg = [v for (mt, v) in prof if tt <= mt < tt + step]
            mv = (sum(seg) / len(seg)) if seg else med
            peak = max(seg) if seg else mv
            sharp_ok = focus[i] >= fmax * 0.72        # 초점 나간 구간(블러) 탈락
            # 🎯 '걷는 움직임'은 살리고 '카메라 휙 돌림'만 버린다(사장님 지시).
            #    계단 오르기 = 움직임은 크지만 화면은 또렷 → 통과.
            #    휙 패닝 = 움직임 폭발 + 모션블러로 화면이 뭉개짐 → 이 조합일 때만 버린다.
            whip = (peak > med * 3.2) and (focus[i] < fmed * 0.92)
            extreme = mv > med * 4.0                  # 지속적으로 화면 전체가 휘둘리는 구간
            ok.append(sharp_ok and not whip and not extreme)
        # 연속으로 '쓸 만한' 구간 → 테이크
        takes, i = [], 0
        while i < len(ok):
            if not ok[i]: i += 1; continue
            j = i
            while j + 1 < len(ok) and ok[j + 1]: j += 1
            st, en = times[i], min(times[j] + step, total)
            if en - st >= min_len:
                seg_focus = sum(focus[i:j + 1]) / (j - i + 1)
                takes.append((round(st, 2), round(min(en, st + max_len), 2), round(seg_focus, 2)))
            i = j + 1
        if not takes:   # 전부 탈락하면 한 단계만 완화(그래도 없으면 폴백 로직이 받는다)
            i = 0
            while i < len(ok):
                relaxed = [focus[k] >= fmax * 0.62 for k in range(len(focus))]
                if not relaxed[i]: i += 1; continue
                j = i
                while j + 1 < len(relaxed) and relaxed[j + 1]: j += 1
                st, en = times[i], min(times[j] + step, total)
                if en - st >= 2.0:
                    takes.append((round(st, 2), round(min(en, st + max_len), 2), round(sum(focus[i:j+1]) / (j - i + 1), 2)))
                i = j + 1
        takes.sort(key=lambda x: (-(x[1] - x[0]) * 0.5 - x[2] * 0.05))   # 길고 선명한 순
        _takes_cache[key] = takes
        return takes
    except Exception:
        _takes_cache[key] = []
        return []

def best_start(path: str, need: float, total: float, avoid=(), role: str = "food", workdir: str = "") -> float:
    """이 클립에서 'need초짜리 가장 좋은 구간'의 시작 시각.
    프로 편집자가 하는 일 = 클립 앞부분을 그냥 쓰지 않고 동작이 살아있는 대목을 고르는 것.
    움직임이 클수록 좋되(요리 동작), 손떨림처럼 과한 값은 상한을 둬서 흔들린 컷을 뽑지 않는다."""
    # 1순위: '쓸 수 있는 구간(테이크)' 안에서 고른다 — 흔들림·초점나감 구간은 애초에 후보가 아니다
    if workdir:
        takes = clip_takes(path, workdir)
        fit = [tk for tk in takes if tk[1] - tk[0] >= need - 0.05]
        if not fit and takes: fit = [max(takes, key=lambda x: x[1] - x[0])]
        for st0, en0, _f in fit:
            if any(abs(st0 - a) < 0.4 for a in avoid): continue
            room = en0 - st0
            # 테이크 안에서 살짝 안쪽으로(경계는 보통 흔들린다)
            pad = min(0.25, max(0.0, (room - need) / 2))
            return round(min(st0 + pad, max(0.0, en0 - need)), 2)
    prof = motion_profile(path)
    if not prof or total <= need + 0.2: return 0.0
    # 🎯 역할별 전략(사장님 지적: "계단 씬에서 쓸데없는 장면이 쓰인다")
    #    음식·조리·먹방 = 동작이 큰 대목(붓기·자르기·들기)이 결정적 순간.
    #    맥락샷(간판·계단·거리) = 움직임이 크면 카메라가 휘두른 구간이라 오히려 못 쓴다 → '안정적인 앞부분'.
    ctx = role in ("place", "junk")
    cands = []
    step = 0.25
    st = 0.0
    while st + need <= total - 0.05:
        if any(abs(st - a) < 0.4 for a in avoid): st += step; continue
        seg = [v for (t, v) in prof if st <= t < st + need]
        if seg:
            avg = sum(min(v, 22.0) for v in seg) / len(seg)
            if ctx:
                # 흔들림이 적을수록 좋고, 앞쪽일수록 좋다(피사체가 프레임에 제대로 든 구간)
                sc = -avg - 2.2 * (st / max(total, 1)) * 10
            else:
                sc = avg - 0.35 * (st / max(total, 1))
            cands.append((sc, st))
        st += step
    if not cands: return 0.0
    cands.sort(reverse=True)
    # 🔬 후보 상위 4개는 '실제 화면'을 열어 확인한다 — 선명하고 노출 정상인 대목만 통과.
    if False:   # 🚫 화면검사 재랭킹 비활성(퇴행: 흐린 구간·글자 많은 화면을 뽑았다)
        checked = []
        for sc, st0 in cands[:4]:
            a = frame_stats(path, st0 + need * 0.35, workdir)
            b = frame_stats(path, st0 + need * 0.75, workdir)
            vals = [x for x in (a, b) if x]
            if not vals: checked.append((sc, st0, True)); continue
            sharp = sum(v[0] for v in vals) / len(vals)
            mean = sum(v[1] for v in vals) / len(vals)
            ok = sharp >= 6.0 and 45 <= mean <= 215     # 초점 나감·암부/화이트아웃만 걸러낸다
            checked.append((sc, st0, ok))
        passed = [(sc, st0) for sc, st0, ok in checked if ok]
        pick = passed[0] if passed else (checked[0][0], checked[0][1])
        return round(pick[1], 2)
    return round(cands[0][1], 2)

_stats_cache = {}
def clip_stats(path: str):
    """평균 밝기(YAVG)·채도(SATAVG) — 클립마다 다른 노출/색감을 한 톤으로 맞추기 위한 재료.
    이게 없으면 컷이 바뀔 때마다 화면이 밝아졌다 어두워졌다 해서 '아마추어 편집'처럼 보인다."""
    if path in _stats_cache: return _stats_cache[path]
    y, sat = [], []
    try:
        p = subprocess.run(
            [FFMPEG, "-v", "info", "-i", path, "-vf",
             "scale=160:-2,signalstats,metadata=print:file=-", "-an", "-frames:v", "60", "-f", "null", "-"],
            capture_output=True, text=True)
        for line in (p.stdout + p.stderr).splitlines():
            line = line.strip()
            if "signalstats.YAVG=" in line:
                try: y.append(float(line.split("=")[1]))
                except ValueError: pass
            elif "signalstats.SATAVG=" in line:
                try: sat.append(float(line.split("=")[1]))
                except ValueError: pass
    except Exception:
        pass
    res = (sum(y) / len(y) if y else 128.0, sum(sat) / len(sat) if sat else 60.0)
    _stats_cache[path] = res
    return res

def grade_filter(path: str, target_y: float, target_s: float) -> str:
    """이 클립을 전체 톤(중앙값)에 맞추는 보정 필터. 과보정하지 않도록 폭을 좁게 제한한다."""
    y, sat = clip_stats(path)
    b = max(-0.06, min(0.06, (target_y - y) / 255.0 * 0.9))     # 밝기 ±10%
    sc = 1.0 if sat <= 1 else max(0.92, min(1.10, target_s / sat))
    # 대비·선명도는 아주 살짝만(릴스는 폰에서 보므로 과하면 티가 난다)
    # 과하면 티가 난다 — 밝기/채도만 살짝 맞추고 대비·샤픈은 건드리지 않는다(사장님: 더 이상해짐)
    return f"eq=brightness={b:.3f}:saturation={sc:.3f}"

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


    # 1) 소스 확보(URL이면 다운로드) — 같은 소스는 한 번만 받는다
    progress("소스 내려받는 중")
    cache = {}
    for sg in segs:
        if sg["src"] not in cache:
            ext = os.path.splitext(sg["src"].split("?")[0])[1] or ".mp4"
            cache[sg["src"]] = fetch(sg["src"], os.path.join(workdir, f"src{len(cache)}{ext}"))
    local = [cache[sg["src"]] for sg in segs]
    voice = fetch(job["voice"], os.path.join(workdir, "voice" + (os.path.splitext(job["voice"].split("?")[0])[1] or ".m4a")))

    # 🛡 컷 길이 상한(최종 안전망) — 에이전트가 10초·19초짜리 컷을 보내면 정지화면처럼 보인다(실사고).
    #    총 길이는 유지하면서 '같은 클립의 다음 구간 → 다른 클립' 순으로 쪼갠다(화면이 계속 움직인다).
    CUT_MAX = 3.5   # 릴스 템포(사장님: 한 화면 오래 쓰면 이탈률↑)
    durs = {p: probe_dur(p) for p in cache.values()}
    order = list(dict.fromkeys(local))          # 등장 순서대로 중복 없는 소스 목록
    split_segs, split_local = [], []
    for path, sg in zip(local, segs):
        start, remain = float(sg.get("in", 0)), float(sg["dur"])
        rot = 0
        first_chunk = True
        while remain > 0.05:
            take = min(remain, CUT_MAX)
            avail = max(0.0, durs.get(path, 8) - 0.1 - start)
            # ⚠️ 초과분을 '같은 클립 이어서'로 채우면 컷이 안 보여 10초짜리 한 컷처럼 느껴진다(사장님 지적).
            #    두 번째 조각부터는 무조건 다른 클립으로 넘겨 눈에 보이는 컷을 만든다.
            if not first_chunk:
                cands = [p for p in order if p != path] or [path]
                path = cands[rot % len(cands)]
                rot += 1
                start = 0.0
                avail = max(0.0, durs.get(path, 8) - 0.1)
            elif avail < min(take, 1.0):        # 이 클립은 바닥 — 다른 클립의 앞부분으로 이어간다
                cands = [p for p in order if p != path] or [path]
                path = cands[rot % len(cands)]
                rot += 1
                start = 0.0
                avail = max(0.0, durs.get(path, 8) - 0.1)
            first_chunk = False
            if avail < 0.3:                     # 이 클립도 바닥 — 가장 긴 클립의 앞부분으로 강제 전환(시간 손실 금지)
                path = max(order, key=lambda p: durs.get(p, 8))
                start, avail = 0.0, max(0.0, durs.get(path, 8) - 0.1)
                if avail < 0.3: break
            take = round(min(take, avail), 2)
            split_segs.append({"src": sg["src"], "in": round(start, 2), "dur": take, "zoom": sg.get("zoom", 1)})
            split_local.append(path)
            start += take; remain -= take
    if split_segs:
        segs, local = split_segs, split_local

    # 🔊 영상이 내레이션보다 짧으면 -shortest가 '음성 끝을 잘라먹는다'(실사고: 30s 음성에 27s 영상 → 마지막 문장 실종).
    #    모자란 만큼 클립들을 5.5초 이하 컷으로 돌려가며 이어 붙여 반드시 음성 길이를 덮는다.
    vdur = probe_dur(voice)
    total = sum(s["dur"] for s in segs)
    rot = 0
    while vdur - total > 0.15 and rot < 12:
        path = order[rot % len(order)]
        take = round(min(CUT_MAX, vdur - total, durs.get(path, 8) - 0.1), 2)
        if take < 0.3: break
        segs.append({"src": segs[-1]["src"], "in": 0.0, "dur": take, "zoom": 1.3})
        local.append(path)
        total += take
        rot += 1
    progress(f"컷 {len(segs)}개 · {total:.1f}s (음성 {vdur:.1f}s)")

    # 2) 세그먼트 트림 + 9:16 통일(커버 크롭) — 코덱 통일해 무손실 concat 가능하게
    #    🎬 프로 편집 감각 ①: 클립 앞부분을 그냥 쓰지 않고 '동작이 살아있는 구간'을 골라 쓴다.
    # 🎨 전체 톤 기준 = 클립들의 중앙값(한 클립이 튀어도 전체가 끌려가지 않게)
    _ys, _ss = [], []
    for _p in set(local):
        _y, _s2 = clip_stats(_p); _ys.append(_y); _ss.append(_s2)
    _ys.sort(); _ss.sort()
    tgt_y = _ys[len(_ys) // 2] if _ys else 128.0
    tgt_s = _ss[len(_ss) // 2] if _ss else 60.0
    progress("결정적 순간 찾는 중")
    picked = {}
    for i, sg in enumerate(segs):
        path = local[i]
        need = float(sg["dur"])
        tot = durs.get(path, probe_dur(path))
        avoid = picked.get(path, [])
        st = best_start(path, need, tot, avoid, str(sg.get("role") or "food"), workdir) if float(sg.get("in", 0)) == 0 else float(sg["in"])
        picked.setdefault(path, []).append(st)
        sg["in"] = st
    seg_files = []
    for i, sg in enumerate(segs):
        progress(f"클립 다듬는 중 {i + 1}/{len(segs)}")
        sf = os.path.join(workdir, f"seg{i}.mp4")
        z = float(sg.get("zoom") or 1)
        # 🔍 재사용 컷은 확대해서 다른 그림으로(사장님 지시) — 키워서 중앙 크롭
        sw, sh = int(w * z), int(h * z)
        # 🎬 프로 편집 감각 ②: 모든 컷에 아주 느린 줌(켄번즈). 방향을 번갈아 줘서 화면이 계속 '살아있게' 한다.
        span = max(1, int(float(sg["dur"]) * fps))
        amp = 0.055
        if i % 2 == 0:
            zexp = f"min(1+{amp / span:.6f}*in,{1 + amp:.3f})"
        else:
            zexp = f"max({1 + amp:.3f}-{amp / span:.6f}*in,1)"
        kb = (f"zoompan=z='{zexp}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s={w}x{h}:fps={fps}")
        # 🎨 프로 편집 감각 ③: 클립마다 제각각인 노출·색을 전체 중앙값으로 수렴시킨다(한 카메라로 찍은 느낌)
        grade = ""   # 🚫 색보정 비활성(사장님 지시: 컷 편집 정확도가 먼저)
        vf = f"scale={sw}:{sh}:force_original_aspect_ratio=increase,crop={w}:{h}," + (grade + "," if grade else "") + f"{kb},setsar=1"
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
