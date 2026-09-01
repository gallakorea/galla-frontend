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
    out = subprocess.run(["git", "diff", "--name-only", base, "--", "js/", "css/"],
                         cwd=ROOT, capture_output=True, text=True).stdout
else:
    out = subprocess.run(["git", "status", "--porcelain", "--", "js/", "css/"],
                         cwd=ROOT, capture_output=True, text=True).stdout
    out = "\n".join(l[3:] for l in out.splitlines())

changed = sorted({l.strip() for l in out.splitlines()
                  if (l.strip().startswith("js/") or l.strip().startswith("css/"))
                  and l.strip().endswith((".js", ".css"))})
app = (ROOT / "app.html").read_text(encoding="utf-8", errors="ignore")
m = re.search(r'name="galla-ver"\s+content="(\d+)"', app)
if not m:
    print("app.html 에서 galla-ver 를 못 찾았다"); sys.exit(2)
cur = m.group(1)

PAGES = [h for h in sorted(ROOT.glob("**/*.html"))
         if not {"node_modules", ".git", ".wrangler"} & set(h.parts)]

# ⚠️ 뒤처진 배포 도장 — 이게 이 스크립트의 첫 검사여야 한다(바뀐 JS 가 없어도 돈다).
#    전수 범프를 "옛 도장 문자열 → 새 도장"으로 치환해 왔는데, 그러면 값이 다른 파일은
#    매번 조용히 건너뛰고 **영원히 뒤처진다**. auth/confirm.html 이 0901133 에 갇혀 있었다
#    (가입 인증 메일의 첫 착지점이다). 범프는 값을 특정하지 말고 정규식으로 밀어야 한다.
behind = []
for h in PAGES:
    mm = re.search(r'name="galla-ver"\s+content="(\d+)"', h.read_text(encoding="utf-8", errors="ignore"))
    if mm and mm.group(1) != cur:
        behind.append(f"{h.relative_to(ROOT)} ({mm.group(1)})")
if behind:
    print(f"현재 배포 도장: {cur}")
    print(f"\n❌ 배포 도장이 뒤처진 HTML {len(behind)}개 — 이 페이지들은 스냅샷이 안 깨진다")
    for b in behind[:12]:
        print(f"     {b}")
    if len(behind) > 12:
        print(f"     … 외 {len(behind)-12}개")
    print("\n전수 범프는 옛 값을 찾지 말고 정규식으로:")
    print(f"""     python3 -c "import re,pathlib
for f in pathlib.Path('.').rglob('*.html'):
    if {{'node_modules','.git','.wrangler'}} & set(f.parts): continue
    s=f.read_text(encoding='utf-8')
    t=re.sub(r'(name=\\"galla-ver\\"\\s+content=\\")\\d+', r'\\g<1>{cur}', s)
    if t!=s: f.write_text(t,encoding='utf-8')" """)
    sys.exit(1)

if not changed:
    print(f"현재 배포 도장: {cur} · 바뀐 JS 없음 — 도장은 전부 맞다"); sys.exit(0)

stale = collections.defaultdict(list)
for html in PAGES:
    txt = html.read_text(encoding="utf-8", errors="ignore")
    for js in changed:
        for ver in re.findall(re.escape(js) + r"\?v=(\d+)", txt):
            if ver != cur:
                stale[js].append(f"{html.relative_to(ROOT)} (?v={ver})")

# 도장 자체가 없는 HTML — 전수 범프(sed 로 옛 도장 치환)가 통째로 건너뛴다.
# auth/confirm.html 이 이 상태였고, 가입 인증 첫 착지점인데 pwa.js 가 18일 묵어 있었다.
nostamp = []
for h in PAGES:
    t = h.read_text(encoding="utf-8", errors="ignore")
    if re.search(r'(js|vendor)/[A-Za-z0-9_./-]+\.js\?v=', t) and 'name="galla-ver"' not in t:
        nostamp.append(h)

print(f"현재 배포 도장: {cur} · 바뀐 JS·CSS {len(changed)}개")
if nostamp:
    print(f"\n⚠️ 배포 도장(galla-ver)이 없는데 ?v= 를 쓰는 HTML {len(nostamp)}개 — 전수 범프가 건너뛴다")
    for h in nostamp[:10]:
        print(f"     {h.relative_to(ROOT)}")
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
