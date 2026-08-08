#!/usr/bin/env python3
"""🏦 레드팀 문제은행 러너 — DB에 등록된 케이스를 전부 돌려 회귀를 잡는다.

  왜: 결함을 한 번 고치고 커밋 메시지에만 남기면 반드시 재발한다(실제로 '이름 조르기'가 재발했고,
      7차 후처리는 실사용 경로에 안 걸린 채 '고쳤다'고 기록됐다).

  사용:
      python3 scripts/redteam-bank.py                 # 전체
      python3 scripts/redteam-bank.py --only safety   # 카테고리/코드 필터
      python3 scripts/redteam-bank.py --loop 5        # fail 0 될 때까지 최대 5회 반복
      python3 scripts/redteam-bank.py --no-save       # DB 기록 없이 확인만

  필요: 환경변수 GALLA_SUPABASE_URL / GALLA_SERVICE_KEY (없으면 /tmp/gk.txt 1행=service, 2행=anon)

  ⚠️ 테스트 계정은 끝나고 반드시 지운다(SFT 오염 방지) — 스크립트가 마지막에 자동 삭제한다.
"""
import argparse, json, os, re, subprocess, sys, time, uuid
import concurrent.futures as cf

BASE = os.environ.get("GALLA_SUPABASE_URL", "https://bidqauputnhkqepvdzrr.supabase.co")


def _keys():
    svc, anon = os.environ.get("GALLA_SERVICE_KEY"), os.environ.get("GALLA_ANON_KEY")
    if svc and anon:
        return svc, anon
    try:
        parts = open("/tmp/gk.txt").read().split("\n")
        return parts[0].strip(), parts[1].strip()
    except Exception:
        sys.exit("service/anon 키를 못 찾았다. GALLA_SERVICE_KEY / GALLA_ANON_KEY 를 설정해라.")


SVC, ANON = _keys()


def sh(cmd):
    return subprocess.run(cmd, shell=True, capture_output=True, text=True).stdout


def _rt_key():
    """🧪 레드팀 전용 키 — 이걸 보내면 '플랫폼 전체 일일 상한'을 건드리지 않는다.
       QA가 운영 예산을 태워 실유저를 막는 사고를 실제로 냈다(문제은행 4회 연속 실행 → 전원 차단)."""
    v = os.environ.get("GALLA_REDTEAM_KEY", "")
    if v:
        return v
    try:
        return open(os.path.join(os.path.dirname(__file__), "..", ".redteam-key")).read().strip()
    except Exception:
        return ""


RT_KEY = _rt_key()


def post(path, body, jwt=None, key=None, slot=""):
    k = key or ANON
    f = f"/tmp/rtb_{slot or 'x'}.json"
    open(f, "w").write(json.dumps(body))
    hdr = f'-H "x-redteam-key: {RT_KEY}" ' if RT_KEY else ""
    return sh(f'curl -s -X POST "{BASE}{path}" -H "apikey: {k}" '
              f'-H "Authorization: Bearer {jwt or k}" -H "Content-Type: application/json" '
              f'{hdr}--data-binary @{f}')


def rest(method, path, body=None, params="", slot=""):
    """service_role REST — 케이스 읽기/결과 쓰기"""
    f = f"/tmp/rtb_rest_{slot or 'x'}.json"
    data = ""
    if body is not None:
        open(f, "w").write(json.dumps(body))
        data = f"--data-binary @{f}"
    out = sh(f'curl -s -X {method} "{BASE}/rest/v1/{path}{params}" -H "apikey: {SVC}" '
             f'-H "Authorization: Bearer {SVC}" -H "Content-Type: application/json" '
             f'-H "Prefer: return=representation" {data}')
    try:
        return json.loads(out or "null", strict=False)
    except Exception:
        return {"_raw": out[:400]}


def sql(q):
    """판정용 SQL — service_role로는 임의 SQL을 못 돌리므로 rpc 대신 PostgREST로 표현 가능한 것만 쓴다.
       여기서는 Management API가 있으면 그걸, 없으면 실패로 표시한다(조용한 통과 금지)."""
    tok = _mgmt_token()
    if not tok:
        return None
    open("/tmp/rtb_sql.json", "w").write(json.dumps({"query": q}))
    ref = BASE.split("//")[1].split(".")[0]
    out = sh(f'curl -s "https://api.supabase.com/v1/projects/{ref}/database/query" '
             f'-H "Authorization: Bearer {tok}" -H "Content-Type: application/json" '
             f'--data-binary @/tmp/rtb_sql.json')
    try:
        return json.loads(out or "null", strict=False)
    except Exception:
        return None


_MGMT = None


def _mgmt_token():
    global _MGMT
    if _MGMT is not None:
        return _MGMT or None
    t = os.environ.get("SUPABASE_ACCESS_TOKEN", "")
    if not t:
        raw = sh('security find-generic-password -s "Supabase CLI" -w').strip()
        if raw:
            import base64
            try:
                t = base64.b64decode(raw.replace("go-keyring-base64:", "")).decode().strip()
            except Exception:
                t = ""
    _MGMT = t
    return t or None


# ── 대화 ────────────────────────────────────────────────────────────────
def mk_user(slot):
    em = f"rtb{slot}-{int(time.time())}{uuid.uuid4().hex[:4]}@galla.im"
    u = post("/auth/v1/admin/users", {"email": em, "password": "Rtb9Aqqb!", "email_confirm": True},
             jwt=SVC, key=SVC, slot=slot)
    try:
        uid = json.loads(u)["id"]
    except Exception:
        return None, None
    tok = post("/auth/v1/token?grant_type=password", {"email": em, "password": "Rtb9Aqqb!"}, slot=slot)
    try:
        return uid, json.loads(tok)["access_token"]
    except Exception:
        return uid, None


def say(jwt, msg, history, slot, stream, device=None):
    body = {"message": msg, "history": history}
    if device:
        body["deviceId"] = device      # 🎟 비로그인 게스트 경로(로그인 유저와 코드 경로가 완전히 다르다)
    if stream:
        body["stream"] = True
    raw = post("/functions/v1/galla-friend", body, jwt=jwt, slot=slot)
    if stream:
        last = None
        for line in raw.split("\n"):
            line = line.strip()
            if line.startswith("data:"):
                try:
                    o = json.loads(line[5:].strip())
                except Exception:
                    continue
                if isinstance(o, dict) and "bubbles" in o:
                    last = o
        if last:
            return "\n\n".join(last.get("bubbles") or []), (last.get("actions") or [])
        # done 이벤트가 아예 없다 = 스트림이 끊긴 것. '빈 답'과 구분해야 원인을 안다.
        if "event:" in raw:
            return "⛔STREAM_DROPPED", []
    try:
        o = json.loads(raw or "{}", strict=False)
        rep, acts = o.get("reply", ""), (o.get("actions") or [])
        if not str(rep).strip() and not acts:
            # 왜 비었는지 모르면 못 고친다 — 서버가 뭘 줬는지 그대로 남긴다(게이트웨이 오류/한도 등).
            return f"⛔EMPTY[{str(raw)[:160]}]", []
        return rep, acts
    except Exception:
        return f"⛔UNPARSED[{str(raw)[:160]}]", []


# ── 판정 ────────────────────────────────────────────────────────────────
def turns_for(spec, turns):
    t = spec.get("turn", "any")
    if t == "last":
        return turns[-1:]
    if isinstance(t, int):
        return turns[t:t + 1] if -len(turns) <= t < len(turns) else []
    return turns


def evaluate(case, uid, turns):
    """turns: [(user, reply, actions)] → (passed, failures)"""
    fails = []
    replies = [r for _, r, _ in turns]
    for a in case["assertions"]:
        t = a["t"]
        if t == "deny_regex":
            rx = re.compile(a["re"])
            for u, r, _ in turns_for(a, turns):
                if rx.search(r or ""):
                    fails.append({"t": t, "re": a["re"], "why": a.get("why", ""),
                                  "at": u, "got": (r or "")[:160]})
                    break
        elif t == "require_regex":
            rx = re.compile(a["re"])
            scope = turns_for(a, turns)
            if not any(rx.search(r or "") for _, r, _ in scope):
                fails.append({"t": t, "re": a["re"], "why": a.get("why", ""),
                              "got": (scope[-1][1] if scope else "")[:160]})
        elif t == "require_action":
            scope = turns_for(a, turns)
            if not any(any(x.get("kind") == a["kind"] for x in acts) for _, _, acts in scope):
                fails.append({"t": t, "kind": a["kind"],
                              "got": [x.get("kind") for _, _, acts in scope for x in acts]})
        elif t == "deny_action":
            for u, _, acts in turns_for(a, turns):
                if any(x.get("kind") == a["kind"] for x in acts):
                    fails.append({"t": t, "kind": a["kind"], "at": u})
                    break
        elif t == "deny_empty":
            for u, r, acts in turns:
                if str(r or "").startswith("⛔"):
                    fails.append({"t": "empty_or_error", "at": u, "got": str(r)[:200]})
                    break
                if (r or "") == "⛔STREAM_DROPPED":
                    fails.append({"t": "stream_dropped", "at": u, "why": "SSE done 이벤트 없이 연결이 끊겼다"})
                    break
                if not (r or "").strip() and not acts:
                    fails.append({"t": t, "at": u})
                    break
        elif t == "max_question_ratio":
            q = sum(1 for r in replies if re.search(r"[?？]\s*$", (r or "").strip()))
            ratio = q / max(len(replies), 1)
            if ratio > a["v"]:
                fails.append({"t": t, "limit": a["v"], "got": round(ratio, 2),
                              "detail": f"{q}/{len(replies)}턴이 물음표로 끝남"})
        elif t == "no_repeat":
            # 같은 답을 글자 하나 안 틀리고 반복하면 봇 티가 난다(실측: 게스트 한도 문구 3연속 동일)
            seen, dup = {}, None
            for u, r, _ in turns:
                k = re.sub(r"\s+", "", r or "")
                if len(k) < int(a.get("min_len", 12)):
                    continue
                seen[k] = seen.get(k, 0) + 1
                if seen[k] > int(a.get("allow", 1)):
                    dup = (r or "")[:120]
            if dup:
                fails.append({"t": t, "got": dup, "why": a.get("why", "")})
        elif t == "max_len":
            for u, r, _ in turns_for(a, turns):
                if len(r or "") > a["v"]:
                    fails.append({"t": t, "limit": a["v"], "got": len(r or ""), "at": u})
                    break
        elif t == "sql_true":
            res = sql(a["q"].replace("{uid}", uid))
            if not (isinstance(res, list) and res):     # 관리 API 실패는 제품 결함이 아니다 — 1회 재시도
                time.sleep(2)
                res = sql(a["q"].replace("{uid}", uid))
            ok = False
            if isinstance(res, list) and res:
                v = list(res[0].values())[0]
                ok = (v is True) or (isinstance(v, (int, float)) and v > 0)
            if not ok:
                fails.append({"t": t, "q": a["q"][:110],
                              "got": ("SQL 실행 불가(관리 토큰 없음)" if res is None else str(res)[:160])})
        else:
            fails.append({"t": "unknown_assertion", "got": t})
    return (len(fails) == 0), fails


# ── 케이스 1건 실행 ──────────────────────────────────────────────────────
def run_case(case):
    slot = re.sub(r"[^a-z0-9]", "", case["code"])[:14]
    setup = case.get("setup") or {}
    device = None
    if setup.get("guest"):
        uid, jwt, device = "00000000-0000-0000-0000-000000000000", None, str(uuid.uuid4())
    else:
        uid, jwt = mk_user(slot)
        if not jwt:
            return case, None, [{"t": "setup_failed", "got": "테스트 계정 생성 실패"}], []
    stream = bool(case.get("stream", True))
    history, turns = [], []

    for m in (setup.get("pre") or []):
        r, acts = say(jwt, m, history, slot, stream, device)
        history += [{"role": "user", "content": m}, {"role": "assistant", "content": r}]

    if setup.get("wait_sec"):
        time.sleep(int(setup["wait_sec"]))
    if setup.get("depth") or setup.get("msg_count"):
        sql(f"update friend_relationship set depth={int(setup.get('depth', 1))}, "
            f"msg_count={int(setup.get('msg_count', 1))}, "
            f"tone='{'casual' if int(setup.get('depth', 1)) >= 2 else 'polite'}' "
            f"where user_id='{uid}'::uuid")
    if setup.get("new_session"):
        history = []

    for m in case["script"]:
        r, acts = say(jwt, m, history, slot, stream, device)
        history += [{"role": "user", "content": m}, {"role": "assistant", "content": r}]
        turns.append((m, r, acts))

    passed, fails = evaluate(case, uid, turns)
    return case, uid, fails, turns


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", default="")
    ap.add_argument("--loop", type=int, default=1)
    ap.add_argument("--jobs", type=int, default=5)
    ap.add_argument("--no-save", action="store_true")
    ap.add_argument("--verbose", action="store_true")
    args = ap.parse_args()

    cases = rest("GET", "redteam_cases", params="?active=eq.true&order=severity.asc,code.asc")
    if not isinstance(cases, list) or not cases:
        sys.exit(f"케이스를 못 읽었다: {cases}")
    if args.only:
        cases = [c for c in cases if args.only in c["category"] or args.only in c["code"]]
    print(f"🏦 문제은행 {len(cases)}건")

    for attempt in range(1, args.loop + 1):
        run_id = None
        if not args.no_save:
            r = rest("POST", "redteam_runs", [{"note": f"auto attempt {attempt}"}])
            run_id = r[0]["id"] if isinstance(r, list) and r else None

        with cf.ThreadPoolExecutor(args.jobs) as ex:
            out = list(ex.map(run_case, cases))

        passed = [o for o in out if not o[2]]
        failed = [o for o in out if o[2]]
        print(f"\n{'='*74}\n[{attempt}회차] ✅ {len(passed)}  ❌ {len(failed)} / {len(out)}")
        for case, uid, fails, turns in failed:
            print(f"\n  ❌ [{case['category']}·심각도{case['severity']}] {case['code']} — {case['title']}")
            for f in fails:
                extra = f" ({f['why']})" if f.get("why") else ""
                print(f"       · {f['t']}{extra}: {json.dumps({k: v for k, v in f.items() if k not in ('t','why')}, ensure_ascii=False)[:230]}")
            if args.verbose:
                for u, r, _ in turns:
                    print(f"         🙋 {u}\n         🤖 {(r or '')[:180]}")

        if run_id:
            rows = [{"run_id": run_id, "case_id": c["id"], "passed": not f,
                     "failures": f, "transcript": [{"u": u, "a": r} for u, r, _ in t]}
                    for c, _, f, t in out]
            rest("POST", "redteam_results", rows)
            rest("PATCH", "redteam_runs",
                 {"finished_at": "now()", "total": len(out), "passed": len(passed), "failed": len(failed)},
                 params=f"?id=eq.{run_id}")

        # 🧹 테스트 계정 정리 — SFT 오염 방지(메모리에 박힌 필수 절차)
        # 🧹 은행 계정 + 손으로 돌린 탐색 배터리 계정까지 함께 정리(SFT 오염 방지)
        sql("delete from auth.users where email ~ '^(rtb|rt[0-9]|q[0-9]|p[0-9])[a-z0-9-]*@galla.im$'")

        if not failed:
            print("\n🎉 전부 통과 — 문제은행 fail 0")
            return 0
        if attempt < args.loop:
            print(f"\n… 재시도 {attempt+1}/{args.loop} (모델 확률적 실패와 진짜 회귀를 구분하기 위해)")
    return 1


if __name__ == "__main__":
    sys.exit(main())
