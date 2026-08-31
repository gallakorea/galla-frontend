#!/usr/bin/env python3
"""배포된 엣지 함수와 저장소를 대조한다.

왜 필요한가(2026-08-31):
  배포 69개 vs 저장소 53개 — **16개가 소스 없이 프로덕션에서 돌고 있었다.**
  고칠 수도 감사할 수도 없는 코드다. 그중 get-video-upload-url 은 로그아웃
  상태에서 Cloudflare Stream 업로드 URL 을 발급했다(우리 계정으로 과금).

실행:
  SUPABASE_ACCESS_TOKEN=... python3 scripts/edge-fn-drift.py
  (토큰 없으면 `supabase functions list` 출력을 파일로 주고 --list <파일>)
"""
import json, os, re, subprocess, sys, pathlib, urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
REF = "bidqauputnhkqepvdzrr"
FN_DIR = ROOT / "supabase" / "functions"

repo = sorted(p.name for p in FN_DIR.iterdir()
              if p.is_dir() and p.name != "_shared" and (p / "index.ts").exists())

deployed = None
if "--list" in sys.argv:
    path = sys.argv[sys.argv.index("--list") + 1]
    deployed = sorted(set(re.findall(r"^\s*\S+\s+(\S+)", open(path).read(), re.M)))
else:
    tok = os.environ.get("SUPABASE_ACCESS_TOKEN")
    if not tok:
        print("SUPABASE_ACCESS_TOKEN 이 없다. --list <supabase functions list 출력파일> 로도 된다.")
        sys.exit(2)
    req = urllib.request.Request(
        f"https://api.supabase.com/v1/projects/{REF}/functions",
        headers={"Authorization": f"Bearer {tok}"})
    data = json.load(urllib.request.urlopen(req))
    deployed = sorted(f["slug"] for f in data)
    no_jwt = [f["slug"] for f in data if f.get("verify_jwt") is False]

only_deployed = [f for f in deployed if f not in repo]
only_repo = [f for f in repo if f not in deployed]

print(f"저장소 {len(repo)} · 배포 {len(deployed)}")
fail = False
if only_deployed:
    fail = True
    print(f"\n❌ 배포됐는데 소스가 없다 {len(only_deployed)}개 — 고칠 수도 감사할 수도 없다")
    print("   되찾기: supabase functions download <slug> --project-ref " + REF)
    for f in only_deployed:
        print(f"     {f}")
if only_repo:
    print(f"\n⚠️ 소스는 있는데 미배포 {len(only_repo)}개 (의도적으로 내린 것일 수 있다)")
    for f in only_repo:
        print(f"     {f}")
if not only_deployed and not only_repo:
    print("✅ 저장소 == 배포")

if deployed and "--list" not in sys.argv and no_jwt:
    print(f"\nℹ️ verify_jwt 꺼진 함수 {len(no_jwt)}개 — 각자 자체 인증이 있어야 한다")
    for f in no_jwt:
        print(f"     {f}")

sys.exit(1 if fail else 0)
