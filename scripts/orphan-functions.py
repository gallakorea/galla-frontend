#!/usr/bin/env python3
"""👻 소스 없는 엣지 함수 검사 — 크론이 부르는데 레포에 코드가 없는 것.

Supabase 대시보드에서 바로 만든 엣지 함수는 레포에 안 남는다.
그 함수가 죽으면 **고칠 소스가 없다** — 리뷰도, 재배포도, 롤백도 못 한다.
실측 2026-08-30: 크론이 부르는 22개 중 4개가 레포에 없었다
  (categorize-raw-news · group-related-news · fetch_article_thumbnail · fetch_missing_thumbnails)

크론 정의는 DB(cron.job)에 있어 이 스크립트만으론 못 읽는다 →
`scripts/cron-functions.txt` 에 '크론이 부르는 함수 목록'을 적어 두고 대조한다.
목록 갱신은 아래 SQL 결과를 붙여 넣으면 된다:

  select distinct m[1] from cron.job,
    lateral regexp_matches(command, 'functions/v1/([A-Za-z0-9_-]+)', 'g') m
  order by 1;

실행:  python3 -I scripts/orphan-functions.py
"""
import os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FNDIR = os.path.join(ROOT, "supabase", "functions")
LIST = os.path.join(ROOT, "scripts", "cron-functions.txt")

if not os.path.isdir(FNDIR):
    print("supabase/functions 없음 — 건너뜀"); sys.exit(0)
if not os.path.exists(LIST):
    print(f"⚠️  {os.path.relpath(LIST, ROOT)} 가 없다 — 대조할 목록이 없어 검사를 건너뛴다")
    sys.exit(0)

have = set(os.listdir(FNDIR))
want = [l.strip() for l in open(LIST, encoding="utf-8")
        if l.strip() and not l.startswith("#")]
missing = [f for f in want if f not in have]

for f in missing:
    print(f"❌ {f} — 크론이 부르는데 supabase/functions/ 에 소스가 없다")

if missing:
    print(f"\n❌ {len(missing)}건 — 대시보드에서 코드를 받아 레포에 커밋해라."
          f"\n   (supabase functions download <name> 또는 대시보드에서 복사)")
else:
    print(f"✅ 크론이 부르는 함수 {len(want)}개 전부 레포에 있다")
sys.exit(1 if missing else 0)
