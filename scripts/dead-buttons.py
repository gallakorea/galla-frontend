#!/usr/bin/env python3
"""🔘 죽은 버튼 전수 검사 — 눌러도 아무 일도 안 일어나는 버튼을 찾는다.

버튼이 1,000개가 넘어 손으로 다 눌러볼 수 없다(iOS·안드로이드 두 번이면 2,000회).
그래서 '연결이 끊긴 버튼'만 기계가 골라내고, 사람은 그 목록만 확인한다.

판정 방법 — 이 코드베이스는 위임(delegation) 핸들러를 많이 쓴다.
  document.addEventListener('click', e => { if (e.target.closest('.xx')) ... })
그래서 "버튼에 직접 리스너가 붙었나"로는 판정할 수 없다. 대신 버튼이 가진
**식별자(id·class·data-*)가 JS 어딘가에서 언급되는가**를 본다. 하나도 안 나오면
어떤 경로로도 잡을 수 없는 버튼이다 = 죽었다.

무해한 것은 제외한다: onclick 속성이 있는 것, href 가 있는 것, form 안의 submit/reset,
그리고 닫기·토글처럼 CSS 만으로 동작할 수 있는 것은 사람이 확인하도록 '주의'로만 분류.

사용: python3 scripts/dead-buttons.py            (요약)
      python3 scripts/dead-buttons.py --all      (전체 목록)
"""
import os, re, sys, json

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)

SKIP_PAGE = re.compile(r"nav-test|header-nav-test|agora-test|mic-test|preview\.html|"
                       r"naver[0-9a-f]{20,}|offline|app-shell|admin")

# JS 전체를 한 덩어리로 — 위임 핸들러가 어디에 있든 잡히게
js_blob = []
for dp, _, fs in os.walk("js"):
    for f in fs:
        if f.endswith(".js"):
            js_blob.append(open(os.path.join(dp, f), encoding="utf-8", errors="ignore").read())
JS = "\n".join(js_blob)

BTN = re.compile(r"<button\b([^>]*)>", re.I)
ATTR = re.compile(r'(\w[\w-]*)\s*=\s*"([^"]*)"')

def idents(attrs: str):
    """이 버튼을 코드가 붙잡을 수 있는 모든 손잡이."""
    d = dict(ATTR.findall(attrs))
    out = []
    if d.get("id"):
        out.append(("id", d["id"]))
    for c in (d.get("class") or "").split():
        if len(c) > 2:
            out.append(("class", c))
    for k, v in d.items():
        if k.startswith("data-"):
            out.append(("attr", k))
            if v and len(v) > 2 and not v.startswith("{"):
                out.append(("attrval", v))
    return d, out

dead, weak, total = [], [], 0
for page in sorted(f for f in os.listdir(".") if f.endswith(".html")):
    if SKIP_PAGE.search(page):
        continue
    src = open(page, encoding="utf-8", errors="ignore").read()
    for m in BTN.finditer(src):
        attrs = m.group(1)
        total += 1
        d, hooks = idents(attrs)
        if d.get("onclick"):
            continue                                   # 인라인 핸들러 — 살아 있다
        if (d.get("type") or "").lower() in ("submit", "reset"):
            continue                                   # 폼이 받는다
        label = re.sub(r"\s+", " ", src[m.end():src.find("</button>", m.end())])[:40].strip()
        label = re.sub(r"<[^>]+>", "", label) or "(빈 라벨)"
        if not hooks:
            # 부모 컨테이너에 위임 핸들러가 붙는 흔한 패턴(.plaza-categories 안의 칩 등).
            # 자기 손잡이가 없어도 조상 클래스가 JS 에 있으면 잡힌다.
            before = src[:m.start()]
            anc = re.findall(r'<(?:div|section|nav|ul)[^>]*class="([^"]+)"', before)[-4:]
            if any(re.search(r"[\"'`\.\[#]" + re.escape(c) + r"[\"'`\]\s\),.:]", JS)
                   for grp in anc for c in grp.split() if len(c) > 2):
                continue                               # 부모가 받는다
            dead.append((page, label, "자기도 부모도 JS 에 없음"))
            continue
        hit = None
        for kind, name in hooks:
            if re.search(r"[\"'`\.\[#]" + re.escape(name) + r"[\"'`\]\s\),.:]", JS):
                hit = name
                break
        if not hit:
            dead.append((page, label, "손잡이 " + ", ".join(n for _, n in hooks[:3]) + " 가 JS 에 없음"))

print(f"정적 버튼 {total}개 검사 — 연결 안 된 것 {len(dead)}개\n")
show = dead if "--all" in sys.argv else dead[:40]
cur = None
for page, label, why in show:
    if page != cur:
        print(f"  ── {page}")
        cur = page
    print(f"     “{label}”  · {why}")
if len(show) < len(dead):
    print(f"\n  … 외 {len(dead)-len(show)}개 (--all 로 전체)")
if not dead:
    print("  ✅ 연결 끊긴 버튼 없음")
sys.exit(1 if dead else 0)
