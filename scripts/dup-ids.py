#!/usr/bin/env python3
"""🆔 중복 id 검사 — 같은 id 가 두 번 나오면 getElementById 는 하나만 돌려준다.
   그래서 '나머지'는 영영 갱신되지 않는다(실측: 이슈 전선 라벨의 '개 의견' 숫자가 멈춤).

   두 가지를 본다.
     1) 한 HTML 문서 안의 중복
     2) HTML 의 id 와 **JS 템플릿 문자열이 만들어 내는 id** 의 충돌
        (런타임에만 겹치므로 HTML 만 봐선 안 보인다 — 이게 실제로 물린 쪽이다)

   실행:  python3 -I scripts/dup-ids.py
"""
import os, re, sys
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ID_RE = re.compile(r'''\bid=["']([A-Za-z][\w:-]*)["']''')
# 테스트·관리자 페이지는 제외(사용자 노출 아님)
SKIP_HTML = re.compile(r'(nav-test|header-nav-test|agora-test|mic-test|admin|preview|naver[0-9a-f]{10,})')

def html_ids(path):
    src = open(path, encoding="utf-8", errors="ignore").read()
    return ID_RE.findall(src)

def js_ids(path):
    src = open(path, encoding="utf-8", errors="ignore").read()
    # 템플릿/문자열 안에서 만들어지는 id — 변수 보간(${...})이 든 것은 매번 달라지므로 제외
    out = []
    for m in re.finditer(r'''\bid=\\?["']([A-Za-z][\w:-]*)\\?["']''', src):
        out.append(m.group(1))
    return out

fail = 0
warn = 0

# 검토 완료(런타임에 겹치지 않음) — 겹칠 수 있는 새 항목만 눈에 띄게 남긴다
REVIEWED = {
    ("index.html", "js/index.js"): {"modal-close", "modal-text"},   # ensureModal()이 #modal 있으면 안 만든다
}

# 1) 문서 내 중복
for f in sorted(os.listdir(ROOT)):
    if not f.endswith(".html") or SKIP_HTML.search(f):
        continue
    seen = defaultdict(int)
    for i in html_ids(os.path.join(ROOT, f)):
        seen[i] += 1
    dupes = {k: v for k, v in seen.items() if v > 1}
    if dupes:
        fail += len(dupes)
        print(f"❌ {f} — 문서 안 중복 id")
        for k, v in sorted(dupes.items()):
            print(f"      {k} ×{v}")

# 2) HTML id ↔ JS 가 주입하는 id 충돌
jsdir = os.path.join(ROOT, "js")
js_map = {}
for dirpath, _, files in os.walk(jsdir):
    for f in files:
        if f.endswith(".js"):
            p = os.path.join(dirpath, f)
            js_map[os.path.relpath(p, ROOT)] = set(js_ids(p))

for f in sorted(os.listdir(ROOT)):
    if not f.endswith(".html") or SKIP_HTML.search(f):
        continue
    hids = set(html_ids(os.path.join(ROOT, f)))
    stem = f[:-5]
    for jsf, jids in js_map.items():
        base = os.path.basename(jsf)[:-3]
        # 이 페이지가 쓰는 스크립트만 본다(파일명이 페이지명으로 시작)
        if not (base == stem or base.startswith(stem + ".")):
            continue
        clash = (hids & jids) - REVIEWED.get((f, jsf), set())
        if clash:
            # HTML 에도 있고 JS 도 만든다 = **런타임에 겹칠 수 있다**.
            # 다만 JS 쪽이 "없을 때만 만든다"로 가드돼 있으면 안 겹친다 → 자동 판별이 안 되므로 경고로 둔다.
            warn += len(clash)
            print(f"⚠️  {f} ↔ {jsf} — 같은 id 를 양쪽에서 만든다(가드 확인 필요)")
            for k in sorted(clash):
                print(f"      {k}")

if not fail and not warn:
    print("✅ 중복 id 없음")
else:
    print(f"\n❌ {fail}건" + (f" · ⚠️ {warn}건(검토 필요)" if warn else ""))
sys.exit(1 if fail else 0)
