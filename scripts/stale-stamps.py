#!/usr/bin/env python3
"""바꾼 JS 인데 HTML 의 ?v= 스탬프가 안 올라간 것을 잡는다.

왜 필요한가: 배포 도장(galla-ver)만 올려도 nav.js 가 주입하는 파일은 갱신되지만,
HTML 이 <script src="js/x.js?v=0814190"> 처럼 직접 참조하는 파일은 그 값이 그대로다.
2026-08-30 에 dm.js(12곳)·plans.js(app.html)가 이 상태였고, 고친 코드가 앱에
전달되지 않았다. 커밋 전에 돌린다:

    python3 scripts/stale-stamps.py            # 워킹트리 변경분
    python3 scripts/stale-stamps.py HEAD~3     # 그 이후 변경분
"""
import re, subprocess, sys, pathlib, collections

ROOT = pathlib.Path(__file__).resolve().parent.parent
base = sys.argv[1] if len(sys.argv) > 1 else None

if base:
    out = subprocess.run(["git", "diff", "--name-only", base, "--", "js/"],
                         cwd=ROOT, capture_output=True, text=True).stdout
else:
    out = subprocess.run(["git", "status", "--porcelain", "--", "js/"],
                         cwd=ROOT, capture_output=True, text=True).stdout
    out = "\n".join(l[3:] for l in out.splitlines())

changed = sorted({l.strip() for l in out.splitlines()
                  if l.strip().startswith("js/") and l.strip().endswith(".js")})
if not changed:
    print("바뀐 JS 없음 — 검사할 것이 없다"); sys.exit(0)

app = (ROOT / "app.html").read_text(encoding="utf-8", errors="ignore")
m = re.search(r'name="galla-ver"\s+content="(\d+)"', app)
if not m:
    print("app.html 에서 galla-ver 를 못 찾았다"); sys.exit(2)
cur = m.group(1)

stale = collections.defaultdict(list)
for html in sorted(ROOT.glob("**/*.html")):
    if "node_modules" in html.parts:
        continue
    txt = html.read_text(encoding="utf-8", errors="ignore")
    for js in changed:
        for ver in re.findall(re.escape(js) + r"\?v=(\d+)", txt):
            if ver != cur:
                stale[js].append(f"{html.relative_to(ROOT)} (?v={ver})")

print(f"현재 배포 도장: {cur} · 바뀐 JS {len(changed)}개")
if not stale:
    print("✅ 스탬프 누락 없음"); sys.exit(0)

for js, where in sorted(stale.items()):
    print(f"\n❌ {js} — {len(where)}곳이 옛 스탬프")
    for w in where[:12]:
        print(f"     {w}")
    if len(where) > 12:
        print(f"     … 외 {len(where)-12}곳")
print(f"\n고친 코드가 이 페이지들에 전달되지 않는다. ?v= 를 {cur} 로 올려라.")
sys.exit(1)
