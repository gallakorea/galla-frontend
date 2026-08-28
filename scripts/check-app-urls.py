#!/usr/bin/env python3
"""🚦 배포 전 검사 — 앱에서만 조용히 깨지는 두 종류를 잡는다.

  ① 앱 origin 함정
     앱 웹뷰의 location.origin 은 capacitor://localhost(iOS)·http://localhost(안드)다.
     여기에 /share/... 를 붙이면 "capacitor://localhost/share/issue/123" 같은 죽은 링크가
     카톡으로 나가고, "/imgproxy?u=..." 는 로컬 번들로 떨어져 404 가 된다.
     웹에서는 멀쩡해서 눈으로는 절대 안 잡힌다. 2026-08-28 실측으로 공유 16곳·썸네일 2곳이
     이렇게 깨져 있었다 — 초대·공유가 성장 루프인데 앱에서만 통째로 끊긴 상태였다.
     → 정본 주소는 window.GALLA_SITE (js/supabase.js). 엣지 경유는 gallaEdgeBase().

  ② 버전 스탬프 정체
     HTML 의 ?v= 가 파일보다 오래되면 브라우저가 옛 파일을 계속 준다.
     특히 nav.js 는 자기 ?v= 를 friend/plans/agent-hub/workbench 에 물려준다 —
     nav.js 하나가 밀리면 주입 목록째 낡아 새 스크립트가 아예 안 실린다
     (실측: 그래서 GALLA_AGENT_READY 가 undefined 가 되어 창작 에이전트 잠금이 열려 있었다).
     meta[galla-ver] 는 PWA 리로드와 SPA 스냅샷 무효화를 동시에 좌우하므로 같이 본다.

사용: python3 scripts/check-app-urls.py      (문제 있으면 exit 1)
"""
import os, re, subprocess, sys, time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)

problems = []

# ── ① 앱 origin 함정 ────────────────────────────────────────────────
# 공유/엣지 경로를 location.origin 으로 조립하는 곳. 비교·postMessage 용도는 제외한다.
ORIGIN_BUILD = re.compile(
    r"location\.origin\s*\+\s*[\"'`]/|"          # location.origin + "/share/..."
    r"\$\{location\.origin\}/"                   # `${location.origin}/share/...`
)
# 엣지 함수는 galla.im 에만 있다 — 뿌리경로로 부르면 앱에서 404.
EDGE_ROOT = re.compile(r"[\"'`]/(imgproxy|share/|yt/|archive)")

for name in sorted(os.listdir("js")):
    if not name.endswith(".js"):
        continue
    path = os.path.join("js", name)
    lines = open(path, encoding="utf-8", errors="ignore").read().splitlines()
    for i, line in enumerate(lines, 1):
        if "GALLA_SITE" in line or "gallaEdgeBase" in line:
            continue                                     # 이미 정본 주소를 쓴다
        # 예외 표시는 그 줄 끝이나 바로 윗줄에 붙인다 — 사유가 코드 옆에 남아야 안 썩는다
        if "app-url-ok" in line or (i >= 2 and "app-url-ok" in lines[i - 2]):
            continue
        if line.lstrip().startswith(("*", "//", "/*")):
            continue                                     # 주석
        if ORIGIN_BUILD.search(line):
            problems.append((f"{path}:{i}", "location.origin 으로 링크를 조립한다 → GALLA_SITE 를 써라"))
        elif EDGE_ROOT.search(line) and "fetch" in line:
            problems.append((f"{path}:{i}", "엣지 경로를 뿌리경로로 부른다 → gallaEdgeBase() 를 앞에 붙여라"))

# ── ② 버전 스탬프 ──────────────────────────────────────────────────
REF = re.compile(r'(?:src|href)="\.?/?((?:js|css|vendor)/[\w./-]+\.(?:js|css))\?v=(\d+)"')
STAMP = re.compile(r'name="galla-ver" content="(\d+)"')

_dirty = set(
    l[3:].strip().strip('"')
    for l in subprocess.run(["git", "status", "--porcelain"], capture_output=True, text=True).stdout.splitlines()
)

_mmdd_cache = {}

def mmdd(p):
    """파일이 '실제로' 바뀐 날. (파일당 git 호출은 한 번만 — 참조가 1,200건이라 캐시가 없으면 분 단위로 걸린다)

    ⚠️ 파일시스템 mtime 만 보면 안 된다 — git checkout·merge 가 내용은 그대로 두고 mtime 만
       오늘로 바꿔서, 멀쩡한 스탬프가 전부 낡은 것으로 잡힌다(실측: main 머지 직후 3건 오탐).
       작업 트리에서 수정 중인 파일만 mtime 을 믿고, 나머지는 마지막 커밋 날짜를 쓴다.
    """
    if p in _mmdd_cache:
        return _mmdd_cache[p]
    if p in _dirty:
        r = time.strftime("%m%d", time.localtime(os.path.getmtime(p)))
    else:
        r = subprocess.run(["git", "log", "-1", "--format=%ad", "--date=format:%m%d", p],
                           capture_output=True, text=True).stdout.strip() \
            or time.strftime("%m%d", time.localtime(os.path.getmtime(p)))
    _mmdd_cache[p] = r
    return r

htmls = [f for f in os.listdir(".") if f.endswith(".html")]
stale = []
for h in htmls:
    s = open(h, encoding="utf-8", errors="ignore").read()
    for asset, ver in REF.findall(s):
        if os.path.exists(asset) and ver[:4] < mmdd(asset):
            stale.append(f"{h} → {asset} (스탬프 {ver[:4]} < 수정 {mmdd(asset)})")
if stale:
    problems.append((f"버전 스탬프 {len(stale)}건", "파일이 스탬프보다 새롭다 — 캐시가 안 깨진다"))

stamps = {m for h in htmls for m in STAMP.findall(open(h, encoding="utf-8", errors="ignore").read())}
if len(stamps) > 1:
    problems.append(("meta[galla-ver]", f"페이지마다 도장이 다르다: {sorted(stamps)}"))
try:
    vt = open("version.txt").read().strip()
    if stamps and vt not in stamps:
        problems.append(("version.txt", f"{vt} 인데 HTML 도장은 {sorted(stamps)} — PWA 가 무한 리로드하거나 영영 안 받는다"))
except FileNotFoundError:
    problems.append(("version.txt", "없음 — 버전 프로브가 폴백 경로로 샌다"))

# ── GALLA_V 가 도장에서 오는가 ─────────────────────────────────────
# 🔴 앱(SPA)은 각 페이지의 <script ?v=> 를 읽지 않는다. js/spa/views/*.js 가
#    "/js/xxx.js?v=" + GALLA_V 로 직접 주입한다. 그래서 GALLA_V 를 손으로 박아두면
#    배포 도장만 올라가고 **앱만 옛 js 에 갇힌다** — 8/17~8/28 실제로 그랬다.
if os.path.exists("app.html"):
    shell = open("app.html", encoding="utf-8", errors="ignore").read()
    m = re.search(r'window\.GALLA_V\s*=\s*(.+?);', shell)
    if not m:
        problems.append(("app.html GALLA_V", "정의가 없다 — 뷰 스크립트가 캐시버스터 없이 주입된다"))
    elif not re.search(r'galla-ver', m.group(1)):
        problems.append(("app.html GALLA_V",
                         f"도장이 아니라 상수를 박았다({m.group(1).strip()[:40]}) — 웹만 갱신되고 앱은 옛 js 를 쓴다"))

# ── 결과 ───────────────────────────────────────────────────────────
if not problems:
    print("✅ 앱 origin·버전 스탬프 이상 없음")
    sys.exit(0)

print(f"❌ {len(problems)}건\n")
for where, what in problems:
    print(f"  {where}\n      {what}")
if stale:
    print("\n  낡은 스탬프 (앞 10건):")
    for s in stale[:10]:
        print(f"      {s}")
    if len(stale) > 10:
        print(f"      … 외 {len(stale)-10}건")
sys.exit(1)
