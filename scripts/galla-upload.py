#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
galla-upload.py — 지정 폴더에 영상이 떨어지면 알아서 숏판에 올린다.

  1) 한 번만:  python3 scripts/galla-upload.py login
  2) 감시:     python3 scripts/galla-upload.py watch --dir ~/Movies/갈라업로드

파일 이름이 그대로 숏판 본문이 된다.  예)
  "오늘 사장님이 미쳤어요 #맛집 #여주.mp4"  →  본문 "오늘 사장님이 미쳤어요", 태그 [맛집, 여주]

웹 글쓰기와 같은 경로를 그대로 탄다(upload-media 서명 PUT → R2, check-issue 모더레이션,
posts insert).  다른 경로를 새로 파면 앱에서 안 보이는 판이 생긴다.
"""
import argparse, getpass, hashlib, json, os, re, shutil, subprocess, sys, time, urllib.error, urllib.request

SB_URL = "https://bidqauputnhkqepvdzrr.supabase.co"
SB_ANON = ("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJpZHFhdXB1"
           "dG5oa3FlcHZkenJyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUyNzg1NDIsImV4cCI6MjA4MDg1NDU0Mn0"
           ".D-UGDPuBaNO8v-ror5-SWgUNLRvkOO-yrf2wDVZtyEM")

HOME_DIR = os.path.expanduser("~/.galla")
CONF_PATH = os.path.join(HOME_DIR, "upload.json")      # watch_dir 등 설정
SESS_PATH = os.path.join(HOME_DIR, "upload-session.json")  # refresh_token 만(비밀번호는 저장 안 함)
SEEN_PATH = os.path.join(HOME_DIR, "upload-seen.json")     # 중복 발행 방지

VIDEO_EXT = {".mp4", ".mov", ".m4v", ".webm"}
MAX_VIDEO_MB = 900          # R2 직접 PUT. 이보다 크면 사람이 판단하게 남긴다.
STABLE_CHECKS = 3           # 크기가 이만큼 연속 동일해야 "다운로드 끝"으로 본다
STABLE_GAP = 2.0


# ── 저수준 HTTP ─────────────────────────────────────────────────────────
# 클라우드플레어 앞단이 python-urllib 기본 UA 를 403 으로 막는다(실측). 브라우저 UA 로 나간다.
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15"


def _req(url, method="GET", headers=None, body=None, timeout=600):
    r = urllib.request.Request(url, method=method, data=body)
    r.add_header("User-Agent", UA)
    for k, v in (headers or {}).items():
        r.add_header(k, v)
    try:
        with urllib.request.urlopen(r, timeout=timeout) as res:
            raw = res.read()
            return res.status, raw
    except urllib.error.HTTPError as e:
        return e.code, e.read()


def _json(url, method="GET", headers=None, obj=None, timeout=600):
    h = dict(headers or {})
    body = None
    if obj is not None:
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        h["Content-Type"] = "application/json"
    st, raw = _req(url, method, h, body, timeout)
    try:
        return st, json.loads(raw.decode("utf-8"))
    except Exception:
        return st, {"_raw": raw[:400].decode("utf-8", "replace")}


# ── 설정·세션 ───────────────────────────────────────────────────────────
def load(path, default):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return default


def save(path, obj, private=False):
    os.makedirs(HOME_DIR, exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=2)
    os.replace(tmp, path)
    if private:
        os.chmod(path, 0o600)


def cmd_login(args):
    """비밀번호는 여기서만 쓰고 버린다 — 디스크에 남는 건 refresh_token 뿐."""
    if args.token:
        return login_by_token()
    email = input("갈라 계정 이메일: ").strip()
    pw = getpass.getpass("비밀번호(화면에 안 보임): ")
    st, data = _json(f"{SB_URL}/auth/v1/token?grant_type=password", "POST",
                     {"apikey": SB_ANON}, {"email": email, "password": pw}, timeout=30)
    pw = None
    if st != 200 or "refresh_token" not in data:
        msg = data.get("error_description") or data.get("msg") or data
        print(f"✗ 로그인 실패({st}): {msg}")
        if "Invalid login" in str(msg):
            print("  구글로만 가입한 계정이면 비밀번호가 없습니다.")
            print("  갈라 설정 → 비밀번호 변경 에서 하나 만들거나, `login --token` 을 쓰세요.")
        return 1
    _store(data, email)
    return 0


def login_by_token():
    """비밀번호 없이(구글 로그인 계정) 붙이는 길.
       ⚠️ 슈파베이스 refresh_token 은 한 번 쓰면 회전한다 — 브라우저와 같은 토큰을 나눠 쓰면
       서로를 로그아웃시킨다. 붙인 뒤 브라우저에서 다시 로그인하면 별도 세션이 생겨 둘 다 산다."""
    print("갈라에 로그인한 브라우저에서:")
    print("  개발자도구(⌥⌘I) → Application → Local Storage → https://galla.im")
    print("  → 키 sb-bidqauputnhkqepvdzrr-auth-token 의 값을 통째로 복사")
    raw = input("붙여넣기: ").strip()
    tok = None
    try:
        blob = json.loads(raw)
        tok = blob.get("refresh_token") or (blob.get("currentSession") or {}).get("refresh_token")
    except Exception:
        tok = raw            # refresh_token 만 복사해 온 경우
    if not tok:
        print("✗ refresh_token 을 찾지 못했습니다.")
        return 1
    st, data = _json(f"{SB_URL}/auth/v1/token?grant_type=refresh_token", "POST",
                     {"apikey": SB_ANON}, {"refresh_token": tok}, timeout=30)
    if st != 200 or "refresh_token" not in data:
        print(f"✗ 토큰이 유효하지 않습니다({st}). 브라우저에서 다시 로그인한 뒤 새로 복사하세요.")
        return 1
    _store(data, (data.get("user") or {}).get("email") or "?")
    print("  ↳ 브라우저 쪽은 이 토큰을 잃었습니다. 갈라에서 한 번 다시 로그인해 주세요.")
    return 0


def _store(data, email):
    save(SESS_PATH, {"refresh_token": data["refresh_token"],
                     "user_id": data["user"]["id"], "email": email}, private=True)
    print(f"✓ {email} 로 연결됨 (user_id {data['user']['id'][:8]}…)")
    print(f"  세션 저장: {SESS_PATH}  (비밀번호는 저장하지 않았습니다)")


def get_session():
    """refresh_token 으로 access_token 을 받는다. 슈파베이스는 토큰을 회전시키므로 새 것을 반드시 저장."""
    sess = load(SESS_PATH, None)
    if not sess:
        sys.exit("먼저 `python3 scripts/galla-upload.py login` 을 실행하세요.")
    st, data = _json(f"{SB_URL}/auth/v1/token?grant_type=refresh_token", "POST",
                     {"apikey": SB_ANON}, {"refresh_token": sess["refresh_token"]}, timeout=30)
    if st != 200 or "access_token" not in data:
        sys.exit(f"세션이 만료됐습니다({st}). 다시 login 하세요.")
    sess["refresh_token"] = data["refresh_token"]
    save(SESS_PATH, sess, private=True)
    return data["access_token"], data["user"]["id"]


# ── 파일 → 글감 ─────────────────────────────────────────────────────────
TAG_RE = re.compile(r"#([0-9A-Za-z가-힣_]{1,20})")

def parse_name(path):
    stem = os.path.splitext(os.path.basename(path))[0]
    tags = TAG_RE.findall(stem)
    text = TAG_RE.sub("", stem)
    text = re.sub(r"[\s_]+", " ", text).strip(" -·")
    return (text or "새 숏판"), tags[:10]


def _duration(path):
    p = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                        "-of", "default=nw=1:nk=1", path],
                       capture_output=True, text=True)
    try: return float(p.stdout.strip())
    except Exception: return 0.0


def _brightness(path):
    """1×1 로 뭉갠 회색값 = 그 프레임의 평균 밝기(0~255)."""
    p = subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-i", path,
                        "-vf", "scale=1:1", "-f", "rawvideo", "-pix_fmt", "gray", "-"],
                       capture_output=True)
    return p.stdout[0] if p.stdout else 0


DARK = 26          # 이보다 어두우면 사실상 검은 화면으로 본다(실측: 페이드인 구간 0x0b)

def make_thumb(video_path, out_path):
    """대표 프레임 한 장.
       ⚠️ 예전엔 '1초 지점' 한 방이었다. 요즘 영상은 앞이 페이드인이라 검은 장을 뽑는다
          (실측: 평균밝기 0x0b 짜리가 그대로 홈 피드에 걸렸다).
          → 여러 지점을 떠 보고 '검지 않은' 첫 장을 쓰고, 다 어두우면 그중 제일 밝은 장."""
    dur = _duration(video_path)
    spots = [dur * r for r in (0.10, 0.25, 0.5, 0.75)] if dur > 1 else []
    spots += [1.0, 0.0]
    best, best_b = None, -1
    for i, ss in enumerate(spots):
        cand = f"{out_path}.{i}.jpg"
        p = subprocess.run(
            ["ffmpeg", "-nostdin", "-y", "-ss", f"{ss:.2f}", "-i", video_path,
             "-frames:v", "1", "-vf", "scale='min(720,iw)':-2", "-q:v", "3", cand],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        if p.returncode != 0 or not os.path.exists(cand) or os.path.getsize(cand) == 0:
            continue
        b = _brightness(cand)
        if b >= DARK:
            shutil.move(cand, out_path)
            for j in range(len(spots)):
                try: os.remove(f"{out_path}.{j}.jpg")
                except OSError: pass
            return out_path
        if b > best_b:
            best_b, best = b, cand
    if best:
        shutil.move(best, out_path)
        for j in range(len(spots)):
            try: os.remove(f"{out_path}.{j}.jpg")
            except OSError: pass
        return out_path
    return None


# ── 업로드 ──────────────────────────────────────────────────────────────
def upload_file(token, path, kind):
    """웹과 동일: upload-media 가 서명 PUT URL + 헤더를 주고, 그 헤더 그대로 PUT.
       헤더가 하나라도 다르면 R2 가 서명 불일치로 거절한다."""
    st, data = _json(f"{SB_URL}/functions/v1/upload-media", "POST",
                     {"apikey": SB_ANON, "Authorization": f"Bearer {token}"},
                     {"kind": kind, "filename": os.path.basename(path),
                      "contentType": "application/octet-stream"}, timeout=60)
    if st != 200 or not data.get("uploadUrl"):
        raise RuntimeError(f"서명 URL 발급 실패({st}): {data}")
    with open(path, "rb") as f:
        body = f.read()
    ps, praw = _req(data["uploadUrl"], "PUT", data.get("headers") or {}, body)
    if ps < 200 or ps >= 300:
        raise RuntimeError(f"R2 PUT 실패({ps}): {praw[:200]!r}")
    return data["publicUrl"]


def moderate(token, title, caption):
    """웹 글쓰기와 같은 게이트. 검사 자체가 실패하면 막지 않고 pending 으로 넘긴다."""
    try:
        st, chk = _json(f"{SB_URL}/functions/v1/check-issue", "POST",
                        {"apikey": SB_ANON, "Authorization": f"Bearer {token}"},
                        {"title": title, "description": caption}, timeout=60)
        if st == 200 and isinstance(chk, dict):
            if chk.get("risk_level") == "위험":
                return "blocked"
            return "ok"
    except Exception:
        pass
    return "pending"


def publish(token, user_id, title, tags, video_url, thumb_url, mod):
    payload = {
        "user_id": user_id,
        "kind": "vertical",
        "title": title,
        "caption": title,
        "media": [{"type": "video", "url": video_url, "thumb": thumb_url}],
        "video_url": video_url,
        "thumbnail_url": thumb_url,
        "tags": tags or None,
        "is_published": True,
        "moderation_status": mod,
    }
    st, data = _json(f"{SB_URL}/rest/v1/posts?select=id", "POST",
                     {"apikey": SB_ANON, "Authorization": f"Bearer {token}",
                      "Prefer": "return=representation"}, payload, timeout=60)
    if st not in (200, 201):
        raise RuntimeError(f"posts insert 실패({st}): {data}")
    return (data[0] if isinstance(data, list) and data else {}).get("id")


# ── 감시 루프 ───────────────────────────────────────────────────────────
def trash(path):
    """올린 파일은 폴더에서 치운다. 단 완전 삭제가 아니라 휴지통 —
       잘못 올라갔을 때 글은 지울 수 있어도 원본 영상은 되돌릴 데가 없다."""
    dest_dir = os.path.expanduser("~/.Trash")
    if not os.path.isdir(dest_dir):
        os.remove(path)               # 휴지통이 없는 환경(리눅스 등)이면 그냥 지운다
        return "삭제"
    base = os.path.basename(path)
    dest = os.path.join(dest_dir, base)
    stem, ext = os.path.splitext(base)
    n = 1
    while os.path.exists(dest):       # 같은 이름이 이미 휴지통에 있으면 덮어쓰지 않는다
        dest = os.path.join(dest_dir, f"{stem} ({n}){ext}")
        n += 1
    shutil.move(path, dest)
    return "휴지통"


def file_key(path):
    stt = os.stat(path)
    h = hashlib.sha1()
    with open(path, "rb") as f:
        h.update(f.read(1 << 20))          # 앞 1MB + 크기면 실사용 중복판정엔 충분
    return f"{h.hexdigest()}:{stt.st_size}"


def stable(path):
    """다운로드가 끝났는지. 크기가 STABLE_CHECKS 회 연속 같아야 손댄다."""
    last = -1
    for _ in range(STABLE_CHECKS):
        try:
            sz = os.path.getsize(path)
        except OSError:
            return False
        if sz == 0 or sz != last:
            last = sz
            time.sleep(STABLE_GAP)
        else:
            return True
    return os.path.getsize(path) == last


def process(path, token, user_id, seen, dry):
    title, tags = parse_name(path)
    mb = os.path.getsize(path) / 1048576
    print(f"\n▶ {os.path.basename(path)}  ({mb:.1f}MB)")
    print(f"   본문: {title}" + (f"   태그: {' '.join('#' + t for t in tags)}" if tags else ""))
    if mb > MAX_VIDEO_MB:
        raise RuntimeError(f"{mb:.0f}MB — 상한 {MAX_VIDEO_MB}MB 초과. 줄여서 다시 넣으세요.")
    if dry:
        print("   (dry-run — 올리지 않음)")
        return None

    mod = moderate(token, title, title)
    if mod == "blocked":
        raise RuntimeError("모더레이션 차단 — 제목 표현을 다듬어 다시 넣으세요.")

    thumb_url = None
    tmp = os.path.join(HOME_DIR, "thumb.jpg")
    if make_thumb(path, tmp):
        thumb_url = upload_file(token, tmp, "image")
        print(f"   썸네일 ✓")
    else:
        print("   ! 썸네일 추출 실패 — 영상만 올립니다")

    video_url = upload_file(token, path, "video")
    print(f"   영상 ✓")
    pid = publish(token, user_id, title, tags, video_url, thumb_url, mod)
    print(f"   숏판 발행 ✓  id={pid}" + ("  (검토대기)" if mod == "pending" else ""))
    seen[file_key(path)] = {"id": pid, "at": int(time.time()), "name": os.path.basename(path)}
    save(SEEN_PATH, seen)
    return pid


def cmd_watch(args):
    conf = load(CONF_PATH, {})
    d = args.dir or conf.get("watch_dir")
    if not d:
        sys.exit("감시할 폴더를 --dir 로 주세요 (한 번 주면 기억합니다).")
    d = os.path.abspath(os.path.expanduser(d))
    if not os.path.isdir(d):
        sys.exit(f"폴더가 없습니다: {d}")
    if not args.dry_run:            # 연습 실행이 실제 감시 폴더 설정을 덮어쓰지 않게
        conf["watch_dir"] = d
        save(CONF_PATH, conf)

    done_dir, fail_dir = os.path.join(d, "_올림"), os.path.join(d, "_실패")
    if args.keep: os.makedirs(done_dir, exist_ok=True)
    os.makedirs(fail_dir, exist_ok=True)   # 실패한 건 사람이 봐야 하니 항상 남긴다
    seen = load(SEEN_PATH, {})
    token = user_id = None

    # ⚠️ 켤 때 이미 폴더에 있던 영상은 건드리지 않는다.
    #    한 번 이걸 안 해서, 감시기를 켰다는 이유만으로 예전 파일들이 통째로 발행됐다.
    #    "지금부터 새로 들어오는 것"만이 자동 업로드의 대상이다.
    preexisting = set()
    if not args.include_existing:
        for n in os.listdir(d):
            fp = os.path.join(d, n)
            if os.path.isfile(fp) and os.path.splitext(n)[1].lower() in VIDEO_EXT:
                preexisting.add(n)
        if preexisting:
            print(f"⏸  이미 있던 영상 {len(preexisting)}개는 건너뜁니다 (자동 발행 안 함):")
            for n in sorted(preexisting)[:10]:
                print(f"     · {n}")
            if len(preexisting) > 10:
                print(f"     · … 외 {len(preexisting) - 10}개")
            print("   이것들도 올리려면 --include-existing 를 붙여 다시 실행하세요.\n")
    print(f"👀 감시 중: {d}")
    print("   파일명이 곧 숏판 본문입니다. " + ("올린 원본은 _올림/ 에 보관합니다." if args.keep else "올린 원본은 휴지통으로 보냅니다."))
    print("   Ctrl+C 로 종료\n")

    while True:
        try:
            names = sorted(os.listdir(d))
        except OSError:
            names = []
        for n in names:
            p = os.path.join(d, n)
            if n.startswith(".") or not os.path.isfile(p):
                continue
            if os.path.splitext(n)[1].lower() not in VIDEO_EXT:
                continue
            if n in preexisting:
                continue
            if not stable(p):
                continue
            try:
                if file_key(p) in seen:
                    print(f"· 이미 올린 파일 — 건너뜀: {n}")
                    if args.keep: shutil.move(p, os.path.join(done_dir, n))
                    else: trash(p)
                    continue
            except OSError:
                continue
            try:
                if not args.dry_run and token is None:
                    token, user_id = get_session()
                process(p, token, user_id, seen, args.dry_run)
                if not args.dry_run:
                    if args.keep:
                        shutil.move(p, os.path.join(done_dir, n))
                        print("   원본 → _올림/")
                    else:
                        print(f"   원본 → {trash(p)}")
            except Exception as e:
                print(f"   ✗ 실패: {e}")
                if not args.dry_run:
                    shutil.move(p, os.path.join(fail_dir, n))
                    with open(os.path.join(fail_dir, n + ".error.txt"), "w", encoding="utf-8") as f:
                        f.write(str(e) + "\n")
                token = None      # 토큰 문제였을 수 있으니 다음 건에서 새로 받는다
        if args.once:
            return 0
        time.sleep(args.interval)


def main():
    ap = argparse.ArgumentParser(description="지정 폴더의 영상을 갈라 숏판에 자동 업로드")
    sub = ap.add_subparsers(dest="cmd", required=True)
    lg = sub.add_parser("login", help="숏판 업로드 계정 연결(1회)")
    lg.add_argument("--token", action="store_true",
                    help="비밀번호 대신 브라우저 세션 토큰을 붙여넣어 연결(구글 로그인 계정용)")
    lg.set_defaults(fn=cmd_login)
    w = sub.add_parser("watch", help="폴더 감시 + 자동 업로드")
    w.add_argument("--dir", help="감시할 폴더 (한 번 주면 기억)")
    w.add_argument("--once", action="store_true", help="한 바퀴만 돌고 종료")
    w.add_argument("--dry-run", action="store_true", help="본문·태그만 보여주고 올리지 않음")
    w.add_argument("--keep", action="store_true",
                   help="올린 원본을 지우지 않고 _올림/ 으로 옮겨 보관")
    w.add_argument("--include-existing", action="store_true",
                   help="켤 때 폴더에 이미 있던 영상도 올린다(기본은 건너뜀)")
    w.add_argument("--interval", type=float, default=5.0, help="폴링 간격(초, 기본 5)")
    w.set_defaults(fn=cmd_watch)
    a = ap.parse_args()
    sys.exit(a.fn(a) or 0)


if __name__ == "__main__":
    main()
