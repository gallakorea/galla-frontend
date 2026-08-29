#!/usr/bin/env python3
"""🧩 SPA 어댑터 ↔ MPA 페이지 스크립트 표류 검사.

웹(MPA)은 <script src>를 페이지가 직접 나열하고, 네이티브(SPA)는 어댑터
js/spa/views/<name>.js 의 SCRIPTS/MODULES 목록으로 다시 나열한다.
**둘이 어긋나면 네이티브에서만 기능이 통째로 죽는다** — 실측 2026-08-29:
trend 어댑터에 weather.js 가 빠져 날씨 탭이 "불러오는 중…"에서 영영 멈췄다.
웹에선 멀쩡해서 안 보인다.

셸(app.html)이 이미 로드하는 싱글턴은 어댑터에 없어도 정상이라 제외한다.

실행:  python3 -I scripts/spa-script-drift.py
"""
import os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VIEWS = os.path.join(ROOT, "js", "spa", "views")

# 셸이 로드 → 어댑터에 없어도 됨
SHELL = set()
shell_src = open(os.path.join(ROOT, "app.html"), encoding="utf-8").read()
for m in re.finditer(r'src="([^"]+\.js)[^"]*"', shell_src):
    SHELL.add(os.path.basename(m.group(1).split("?")[0]))

# MPA 크롬 — SPA 셸이 대신하거나 SPA 에선 쓰지 않음(view-loader 의 SHELL_SCRIPTS 와 같은 기준)
MPA_ONLY = {
    "splash-boot.js", "snapshot.js", "nav.js", "back.js", "desktop-pc.js", "nav-jog.js",
    "pwa.js", "a2hs.js", "pull-refresh.js", "analytics.js", "error-logger.js",
    "dm-sound.js", "dm-call.js", "duel-alert.js", "bug-report.js", "supabase.js",
}

def page_scripts(path):
    src = open(path, encoding="utf-8").read()
    out = []
    for m in re.finditer(r'<script[^>]+src="([^"]+)"', src):
        p = m.group(1).split("?")[0]
        if re.match(r'^([a-z]+:)?//', p):      # 외부
            continue
        out.append(os.path.basename(p))
    return out

def adapter_scripts(path):
    src = open(path, encoding="utf-8").read()
    return {os.path.basename(m.group(1).split("?")[0])
            for m in re.finditer(r'["\'](/js/[^"\']+\.js)["\']', src)}

# 어댑터 이름 → MPA 파일명(다른 경우만 명시)
PAGE_OF = {"trend": "search.html", "index": "index.html", "predict": "galla-predict.html"}

# 어댑터가 **일부러** 안 싣는 것 — 이유를 여기 적어 둔다(적지 않으면 다음 사람이 또 조사한다)
INTENTIONAL = {
    # SPA 광장 작성은 라우터 DOM-이동 스택 뷰라 MPA 작성 페이지 스크립트가 필요 없다.
    # 넣으면 마운트 실패 지점만 늘어난다(trend.js 주석 참조).
    ("trend.js", "composer-page.js"),
    ("predict.js", "composer-page.js"),
}

fail = 0
for f in sorted(os.listdir(VIEWS)):
    if not f.endswith(".js"):
        continue
    name = f[:-3]
    page = PAGE_OF.get(name, name + ".html")
    ppath = os.path.join(ROOT, page)
    if not os.path.exists(ppath):
        continue
    have = adapter_scripts(os.path.join(VIEWS, f))
    missing = [s for s in page_scripts(ppath)
               if s not in have and s not in SHELL and s not in MPA_ONLY
               and (f, s) not in INTENTIONAL]
    # 중복 제거(순서 유지)
    seen, uniq = set(), []
    for s in missing:
        if s not in seen:
            seen.add(s); uniq.append(s)
    if uniq:
        fail += len(uniq)
        print(f"❌ {page} → js/spa/views/{f} — 어댑터가 안 싣는 스크립트 {len(uniq)}개")
        for s in uniq:
            print(f"      {s}")

print("✅ SPA 어댑터 스크립트 누락 없음" if not fail else f"\n❌ {fail}건")
sys.exit(1 if fail else 0)
