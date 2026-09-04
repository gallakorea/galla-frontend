#!/usr/bin/env python3
"""CDN 에 옛 내용이 박제된 자산을 찾는다.

왜 필요한가 (2026-09-04):
  여행 탭이 새로고침에서 검색 탭으로 튕겼다. 코드는 맞았다 — 주소가 문제였다.
  여행 탭을 추가하면서 search.js?v= 를 안 올려서, 그 주소의 옛 응답이 CDN 에 박혔다.
      /js/search.js            → [... "food", "travel", "plaza"]   원본은 맞음
      /js/search.js?v=0901012  → [... "food", "plaza"]             박제
  travel 이 없으니 ?tab=travel 이 else 로 떨어져 검색 탭이 됐다.

⚠️ scripts/stale-stamps.py 로는 못 잡는다.
   그 도구는 '스탬프가 서로 맞는가'를 보고, 이 도구는 '그 주소에 옛 내용이 박혔는가'를 본다.
   스탬프가 완벽히 일치해도 박제는 남아 있을 수 있다 — 실제로 오늘 셋이 나왔다.

  사용:  python3 scripts/stale-cdn.py [호스트]
  고침:  나온 파일의 ?v= 를 배포 도장으로 올리고 배포한다.
"""
import re, sys, pathlib, hashlib, urllib.request, concurrent.futures as cf

HOST = (sys.argv[1] if len(sys.argv) > 1 else "https://galla.im").rstrip("/")
ROOT = pathlib.Path(__file__).resolve().parent.parent

refs = set()
for f in ROOT.glob("*.html"):
    s = f.read_text(encoding="utf-8", errors="ignore")
    for m in re.finditer(r'(?:src|href)="\.?/?((?:js|css)/[A-Za-z0-9_./-]+\.(?:js|css))\?v=(\d+)"', s):
        refs.add((m.group(1), m.group(2)))

def md5(url):
    try:
        r = urllib.request.Request(url, headers={"User-Agent": "curl/8.4.0"})
        return hashlib.md5(urllib.request.urlopen(r, timeout=25).read()).hexdigest()
    except Exception:
        return None

def check(item):
    path, v = item
    # 같은 파일을 '박힌 주소'와 '아무 주소'로 두 번 받아 해시를 견준다.
    # 다르면 박힌 주소에 옛 응답이 남아 있는 것이다.
    return path, v, md5(f"{HOST}/{path}?v={v}"), md5(f"{HOST}/{path}?v=98765432")

bad = []
with cf.ThreadPoolExecutor(max_workers=12) as ex:
    for path, v, a, b in ex.map(check, sorted(refs)):
        if a and b and a != b:
            bad.append((path, v))

print(f"검사한 자산 {len(refs)}개 · {HOST}")
if not bad:
    print("✅ 박제된 자산 없음")
    sys.exit(0)
print(f"❌ 옛 내용이 박제된 주소 {len(bad)}개 — 고친 코드가 이 주소로는 안 간다")
for p, v in bad:
    print(f"   {p:<34} ?v={v}")
print("\n?v= 를 현재 배포 도장으로 올리고 배포하라:")
print('   grep -o \'name="galla-ver" content="[0-9]*"\' index.html')
sys.exit(1)
