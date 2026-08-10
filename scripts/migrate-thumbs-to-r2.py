#!/usr/bin/env python3
"""
🖼 Stream 썸네일을 R2로 이관 (영상 이관의 마무리)

  영상은 R2로 옮겼는데 썸네일이 Stream에 남아 있으면, 나중에 Stream에서 영상을 지우는 순간
  **피드 썸네일이 전부 깨진다.** 영상은 잘 나오는데 썸네일만 X표가 뜨는, 원인 찾기 제일
  어려운 상태가 된다. 지우기 전에 반드시 끝내야 하는 작업이다.

  대상: issues.thumbnail_url, issues.media[].thumb 안의 Stream 주소
  사용:  python3 scripts/migrate-thumbs-to-r2.py [--dry]
"""
import json, subprocess, sys, re, base64, urllib.request

PROJECT = "bidqauputnhkqepvdzrr"
FN = f"https://{PROJECT}.supabase.co/functions/v1/stream-to-r2"
UA = {"User-Agent": "curl/8.0"}          # ⚠️ 기본 UA는 Management API가 403으로 막는다


def mgmt_token():
    raw = subprocess.check_output(
        ["security", "find-generic-password", "-s", "Supabase CLI", "-w"], text=True).strip()
    return base64.b64decode(raw.replace("go-keyring-base64:", "")).decode().strip()


def sql(q):
    req = urllib.request.Request(
        f"https://api.supabase.com/v1/projects/{PROJECT}/database/query",
        data=json.dumps({"query": q}).encode(),
        headers={"Authorization": f"Bearer {mgmt_token()}", "Content-Type": "application/json", **UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read())


def service_key():
    out = subprocess.check_output(
        ["supabase", "projects", "api-keys", "--project-ref", PROJECT, "-o", "json"], text=True)
    for k in json.loads(out):
        if k.get("name") == "service_role":
            return k["api_key"]
    raise SystemExit("service_role 키를 못 찾았다")


def mirror(uid, key):
    """이미 옮긴 영상이어도 다시 부르면 썸네일까지 채워진다(멱등)."""
    req = urllib.request.Request(FN, data=json.dumps({"uid": uid}).encode(),
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json", **UA})
    with urllib.request.urlopen(req, timeout=300) as r:
        return json.loads(r.read())


def main():
    dry = "--dry" in sys.argv
    rows = sql("select id::text id, thumbnail_url from issues "
               "where thumbnail_url like '%cloudflarestream%'")
    print(f"썸네일 이관 대상 {len(rows)}건" + (" (dry-run)" if dry else ""))
    if dry:
        for r in rows[:5]:
            print("  -", r["id"], r["thumbnail_url"][:70])
        return
    if not rows:
        return

    key = service_key()
    ok = fail = 0
    for i, r in enumerate(rows, 1):
        m = re.search(r"cloudflarestream\.com/([a-f0-9]{20,})", r["thumbnail_url"])
        if not m:
            fail += 1
            continue
        uid = m.group(1)
        try:
            res = mirror(uid, key)
        except Exception as e:
            print(f"  [{i}] {uid[:12]} 실패: {e}")
            fail += 1
            continue
        if not res.get("ok") or not res.get("thumb"):
            print(f"  [{i}] {uid[:12]} 썸네일 없음: {res.get('reason')}")
            fail += 1
            continue
        new = res["thumb"].replace("'", "''")
        sql(f"update issues set thumbnail_url = '{new}' where id = '{r['id']}'")
        ok += 1
        print(f"  [{i}/{len(rows)}] {uid[:12]} → {new.split('/')[-2][:12]}/thumbnail.jpg")

    # media[].thumb 안에 남은 Stream 썸네일도 같은 규칙으로 치환
    sql("""update issues set media = regexp_replace(media::text,
             'https://customer-[a-z0-9]+\\.cloudflarestream\\.com/([a-f0-9]+)/thumbnails/thumbnail\\.jpg[^"]*',
             'https://cdn.galla.im/hls/\\1/thumbnail.jpg', 'g')::jsonb
           where media::text like '%cloudflarestream%thumbnail%'""")

    left = sql("select (select count(*) from issues where thumbnail_url like '%cloudflarestream%') a, "
               "(select count(*) from issues where media::text like '%cloudflarestream%') b")[0]
    print(f"\n완료: 성공 {ok} / 실패 {fail}")
    print(f"남은 Stream 참조 — thumbnail_url {left['a']}건, media {left['b']}건")


if __name__ == "__main__":
    main()
