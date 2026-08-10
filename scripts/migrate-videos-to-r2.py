#!/usr/bin/env python3
"""
🎬→📦 Cloudflare Stream 영상을 R2로 일괄 이관

  왜: Stream은 시청 1,000분당 $1. 영상 시청은 무료 기능이라 매출로 회수되지 않는데
      MAU가 늘면 그대로 비례해 오른다. R2는 egress가 무료라 재생비가 $0이 된다.
      이관은 영상당 1회만 delivered로 과금된다(1.5분이면 $0.0015).

  ⚠️ 원본 Stream 주소는 video_url_stream에 남긴다. 지우지 않는다.
     Stream에서 실제 삭제는 한동안 지켜본 뒤 사람이 판단해서 한다.

  사용:  python3 scripts/migrate-videos-to-r2.py [--dry] [--limit N]
"""
import json, subprocess, sys, time, urllib.request, re, base64

PROJECT = "bidqauputnhkqepvdzrr"
FN = f"https://{PROJECT}.supabase.co/functions/v1/stream-to-r2"

def mgmt_token():
    raw = subprocess.check_output(
        ["security", "find-generic-password", "-s", "Supabase CLI", "-w"], text=True).strip()
    raw = raw.replace("go-keyring-base64:", "")
    return base64.b64decode(raw).decode().strip()

def sql(q):
    req = urllib.request.Request(
        f"https://api.supabase.com/v1/projects/{PROJECT}/database/query",
        data=json.dumps({"query": q}).encode(),
        headers={"Authorization": f"Bearer {mgmt_token()}", "Content-Type": "application/json",
                 "User-Agent": "curl/8.0"})   # ⚠️ 기본 UA는 403으로 막힌다
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read())

def service_key():
    out = subprocess.check_output(
        ["supabase", "projects", "api-keys", "--project-ref", PROJECT, "-o", "json"], text=True)
    for k in json.loads(out):
        if k.get("name") == "service_role":
            return k["api_key"]
    raise SystemExit("service_role 키를 못 찾았다")

def migrate(uid, key):
    req = urllib.request.Request(FN, data=json.dumps({"uid": uid}).encode(),
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json",
                 "User-Agent": "curl/8.0"})
    with urllib.request.urlopen(req, timeout=300) as r:
        return json.loads(r.read())

def main():
    dry = "--dry" in sys.argv
    limit = 999
    if "--limit" in sys.argv:
        limit = int(sys.argv[sys.argv.index("--limit") + 1])

    rows = []
    for tbl in ("issues", "posts"):
        rows += [dict(r, tbl=tbl) for r in sql(
            f"select id::text id, video_url from {tbl} "
            f"where video_url like '%cloudflarestream%' and video_url_stream is null")]
    print(f"이관 대상 {len(rows)}건" + (" (dry-run)" if dry else ""))
    if dry or not rows:
        for r in rows[:5]: print("  -", r["tbl"], r["id"], r["video_url"][:60])
        return

    key = service_key()
    ok = fail = 0
    for i, r in enumerate(rows[:limit], 1):
        m = re.search(r"cloudflarestream\.com/([a-f0-9]{20,})", r["video_url"])
        if not m:
            print(f"  [{i}] 건너뜀(uid 파싱 실패) {r['video_url'][:60]}"); fail += 1; continue
        uid = m.group(1)
        try:
            res = migrate(uid, key)
        except Exception as e:
            print(f"  [{i}] {uid[:12]} 실패: {e}"); fail += 1; continue
        if not res.get("ok"):
            print(f"  [{i}] {uid[:12]} 실패: {res.get('reason')}"); fail += 1; continue

        # ⚠️ 원본을 먼저 보관하고 그 다음 교체한다. 순서가 반대면 실패 시 원본을 잃는다.
        new = res["url"].replace("'", "''")
        old = r["video_url"].replace("'", "''")
        sql(f"update {r['tbl']} set video_url_stream = '{old}', video_url = '{new}' where id = '{r['id']}'")
        ok += 1
        print(f"  [{i}/{len(rows)}] {uid[:12]} → R2 ({res['files']}파일 {res['bytes']//1024}KB)")
        time.sleep(0.3)

    print(f"\n완료: 성공 {ok} / 실패 {fail}")
    left = sql("select count(*) c from issues where video_url like '%cloudflarestream%'")[0]["c"]
    print(f"남은 Stream 영상(issues): {left}")

if __name__ == "__main__":
    main()
