#!/usr/bin/env python3
"""저장소 마이그레이션 파일과 DB 적용 기록이 어긋나는지 본다.

왜 필요한가(2026-08-31):
  supabase_migrations 스키마 자체가 없었다 — 363개 파일이 있는데 DB 는 어느 게
  적용됐는지 몰랐다. 그 상태로 `supabase db push` 를 돌리면 363개를 처음부터
  다시 실행하려 든다. 게다가 **같은 타임스탬프를 쓰는 파일이 3쌍** 있어
  적용 순서가 보장되지 않았다(추적 테이블에도 하나만 들어간다).

실행:  python3 scripts/migration-drift.py        # 파일명 중복만 검사(오프라인)
       python3 scripts/migration-drift.py --db   # DB 기록과 대조(sb.sh 필요)
"""
import re, sys, pathlib, collections, subprocess, json, os

ROOT = pathlib.Path(__file__).resolve().parent.parent
MIG = ROOT / "supabase" / "migrations"

files = sorted(p.name for p in MIG.glob("*.sql"))
vers = []
bad_name = []
for f in files:
    m = re.match(r"^(\d{14})_(.+)\.sql$", f)
    if not m:
        bad_name.append(f); continue
    vers.append((m.group(1), m.group(2)))

dup = [v for v, n in collections.Counter(v for v, _ in vers).items() if n > 1]

print(f"마이그레이션 파일 {len(files)}개")
fail = False
if bad_name:
    fail = True
    print(f"\n❌ 이름 규칙 위반 {len(bad_name)}개 (YYYYMMDDHHMMSS_이름.sql 이어야 한다)")
    for f in bad_name[:10]:
        print(f"     {f}")
if dup:
    fail = True
    print(f"\n❌ 버전 중복 {len(dup)}개 — 적용 순서가 보장되지 않는다")
    for v in dup:
        for f in files:
            if f.startswith(v + "_"):
                print(f"     {f}")
if not bad_name and not dup:
    print("✅ 파일명·버전 중복 없음")

if "--db" in sys.argv:
    sb = os.environ.get("SB") or str(ROOT / "scripts" / "sb.sh")
    if not pathlib.Path(sb).exists():
        print("\n⚠️ sb.sh 를 못 찾았다 — SB 환경변수로 경로를 주면 DB 대조를 한다")
    else:
        out = subprocess.run([sb, "select version from supabase_migrations.schema_migrations;"],
                             capture_output=True, text=True).stdout
        try:
            applied = {r["version"] for r in json.loads(out)}
        except Exception:
            print("\n❌ DB 기록을 못 읽었다 — supabase_migrations.schema_migrations 가 있는지 확인")
            sys.exit(1)
        repo = {v for v, _ in vers}
        only_repo = sorted(repo - applied)
        only_db = sorted(applied - repo)
        print(f"\nDB 기록 {len(applied)}개")
        if only_repo:
            fail = True
            print(f"❌ 저장소에만 있음 {len(only_repo)}개 — 미적용이거나 기록 누락")
            for v in only_repo[:10]:
                print(f"     {v}")
        if only_db:
            fail = True
            print(f"❌ DB 에만 있음 {len(only_db)}개 — 파일이 지워졌다")
            for v in only_db[:10]:
                print(f"     {v}")
        if not only_repo and not only_db:
            print("✅ 저장소 == DB")

sys.exit(1 if fail else 0)
