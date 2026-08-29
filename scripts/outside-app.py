#!/usr/bin/env python3
"""📦 #app 밖에 남은 UI 검사 — SPA 뷰 로더는 **#app 안만** 추출한다.

MPA 는 문서 전체가 화면이라 #app 밖에 둬도 보인다. SPA(app.html)는 #app 안만 가져오므로
밖에 둔 것은 **네이티브 앱에서 통째로 사라진다**. 웹에선 멀쩡해서 안 보인다.
실측 2026-08-29: account-edit.html 의 '변경사항 저장' 버튼이 #app 밖에 있어
네이티브에서 프로필을 고쳐도 저장할 수가 없었다.

셸이 담당하는 것은 제외한다: nav.nav(하단 네비) · script · 주석 · 빈 텍스트.
(view-loader 가 nav.nav 와 script 를 지운다 — 같은 기준)

실행:  python3 -I scripts/outside-app.py
"""
import os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SKIP = re.compile(r'(nav-test|header-nav-test|agora-test|mic-test|admin|preview|app\.html|app-shell|offline|naver[0-9a-f]{10,})')

# body 안에서 #app 형제로 남은 최상위 엘리먼트만 본다(대략적 스캔 — 정확한 파싱 대신 태그 시작만).
OPEN = re.compile(r'<(div|section|main|aside|footer|header|form|button|dialog)\b[^>]*>', re.I)

def outside_blocks(src: str):
    i = src.find('<div id="app"')
    if i < 0:
        return []                      # #app 이 없는 페이지는 body 전체가 쓰인다(로더가 합성)
    # #app 의 닫는 </div> 를 깊이로 찾는다
    depth, j = 0, i
    while j < len(src):
        m = re.compile(r'<div\b[^>]*>|</div>', re.I).search(src, j)
        if not m:
            break
        depth += 1 if m.group(0).lower().startswith('<div') else -1
        j = m.end()
        if depth == 0:
            break
    tail = src[j:]
    tail = re.sub(r'<!--[\s\S]*?-->', '', tail)
    tail = re.sub(r'<script[\s\S]*?</script>', '', tail, flags=re.I)
    tail = re.sub(r'<nav class="nav"[\s\S]*?</nav>', '', tail, flags=re.I)
    tail = re.sub(r'</body>[\s\S]*', '', tail, flags=re.I)
    return [m.group(0)[:70] for m in OPEN.finditer(tail)]

# 검토 완료 — SPA 에서 JS 가 직접 만들어 쓰므로 #app 밖에 있어도 사라지지 않는다
REVIEWED = {
    "index.html": ["modal"],   # index.js 의 ensureModal() 이 SPA 에선 body 에 직접 생성
}

fail = 0
for f in sorted(os.listdir(ROOT)):
    if not f.endswith('.html') or SKIP.search(f):
        continue
    blocks = outside_blocks(open(os.path.join(ROOT, f), encoding='utf-8', errors='ignore').read())
    ok = REVIEWED.get(f, [])
    blocks = [b for b in blocks if not any(k in b for k in ok)]
    if blocks:
        fail += len(blocks)
        print(f"❌ {f} — #app 밖에 UI {len(blocks)}개 (네이티브에서 사라진다)")
        for b in blocks[:6]:
            print(f"      {b}")

print("✅ #app 밖에 남은 UI 없음" if not fail else f"\n❌ {fail}건 — #app 안으로 옮겨라")
sys.exit(1 if fail else 0)
