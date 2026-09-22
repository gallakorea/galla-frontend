# -*- coding: utf-8 -*-
"""갈비스 채점판 — scenarios.json 의 상황들을 라이브 galla-friend 에 돌려 코드 검사 + AI 심판으로 점수를 낸다.

  python3 scripts/galvis-eval/run.py                 # 전부
  python3 scripts/galvis-eval/run.py --only emo,ctx  # id 접두어로 골라서
  python3 scripts/galvis-eval/run.py --tag 기준선      # 결과 파일 이름표

- 계정은 레드팀 영구 풀(redteam_pool 3개)만 쓴다. 새 계정 생성 0. 상황마다·끝날 때 대화·기억을 반드시 지운다
  (안 지우면 합성 대화가 학습 데이터 수집 크론에 빨려 들어간다 — [[galla-galvis-redteam]]).
- 키는 파일에서만 읽는다: /tmp/.gservice_role /tmp/.ganon /tmp/.gcron .redteam-key
- 결과: scripts/galvis-eval/runs/<시각>-<이름표>.json + 화면 요약. 심판은 서버(galvis-redteam op=judge)가 한다.
"""
import json, os, re, sys, time, threading, queue, urllib.request, urllib.error, datetime

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
SB = "https://bidqauputnhkqepvdzrr.supabase.co"
ANON = open("/tmp/.ganon").read().strip()
SVC = open("/tmp/.gservice_role").read().strip()
CRON = open("/tmp/.gcron").read().strip()
RT = open(os.path.join(ROOT, ".redteam-key")).read().strip()


def http(method, path, body=None, headers=None, timeout=120):
    h = {"Content-Type": "application/json"}
    h.update(headers or {})
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(SB + path, data=data, headers=h, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as f:
            t = f.read().decode()
            return f.status, t
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()
    except Exception as e:  # 네트워크
        return 0, str(e)


def svc_headers():
    return {"apikey": SVC, "Authorization": "Bearer " + SVC}


def pool_login():
    st, t = http("GET", "/rest/v1/redteam_pool?select=email,password,uid&order=id", headers=svc_headers())
    out = []
    for r in json.loads(t):
        st, tj = http("POST", "/auth/v1/token?grant_type=password", {"email": r["email"], "password": r["password"]}, {"apikey": ANON})
        j = json.loads(tj)
        if j.get("access_token"):
            out.append({"uid": j["user"]["id"], "jwt": j["access_token"]})
    return out


def wipe(uid):
    for tb in ("friend_memory", "friend_relationship"):
        http("DELETE", f"/rest/v1/{tb}?user_id=eq.{uid}", headers=svc_headers())


ENGINE = None   # --engine v1|v2 (레드팀 계정만 서버가 받아준다)


def talk(jwt, msg, hist):
    for a in range(5):
        b = {"message": msg, "history": hist}
        if ENGINE: b["engine"] = ENGINE
        st, t = http("POST", "/functions/v1/galla-friend", b,
                     {"apikey": ANON, "Authorization": "Bearer " + jwt, "x-redteam-key": RT})
        if st in (429, 503, 0, 502, 504):
            time.sleep(3 * (a + 1)); continue
        try:
            j = json.loads(t, strict=False)
        except Exception:
            time.sleep(2); continue
        return {"reply": j.get("reply") or "", "actions": j.get("actions") or [], "status": st}
    return {"reply": "", "actions": [], "status": "fail"}


# ── 코드 검사(결정적·무료) ──
CONTENT_KINDS = {"view", "open", "news", "local", "weather", "draft", "editdraft", "plan", "episode"}
PUSH_RE = re.compile(r"(보여줄까|볼래\?|틀어줄까|띄워\s*줄|띄울\s*수\s*있|이거\s*봐|추천해\s*줄까|판\s*(한번|하나)?\s*(서|세워|열어)\s*볼래)")
BODY_RE = re.compile(r"(나|나도|난|내가|나는)\s*[^.!?\n]{0,14}(폰|핸드폰)\s*(붙잡|보다|보고|하다|만지)|(나|나도|난|내가|나는)\s*[^.!?\n]{0,12}(술\s*(마셔|마셨|먹)|취기|취해|밥\s*(먹었|먹고)|배불|잠\s*(잤|자고|못\s*잤|깼)|졸려|산책\s*(했|하고)|출근|퇴근|샤워)")
HON_RE = re.compile(r"(요|니다|세요|십시오)\s*[.!?~]*\s*$")
LEAK_RE = re.compile(r"\[?\(\s*(id|type|point_to)\s*:|\bpoint_to\b|\bhot_(issues|videos)\b|\bweb_search\b|\bgalla_news\b|\{\"|\bkind\b", re.I)
GREET_RE = re.compile(r"(왔네|왔구나|반가워|어서\s*와|오랜만)")


def sentences(t):
    t = re.sub(r"\s+", " ", t).strip()
    parts = re.split(r"(?<=[.!?…~])\s+|(?<=[ㅋㅎ]{2})\s+", t)
    return [p for p in parts if len(re.sub(r"[ㅋㅎㅠㅜ.!?~\s]", "", p)) >= 2]


def code_checks(sc, logs):
    fails = []
    chk = set(sc.get("chk") or [])
    for i, lg in enumerate(logs):
        r = lg["reply"]
        if not r.strip() and not (i == 0 and sc["turns"][0] == "" and False):
            fails.append(f"t{i+1}:빈답")
            continue
        ns = len(sentences(r))
        is_deliver_turn = any(a.get("kind") in CONTENT_KINDS for a in lg["actions"])
        # 길이 = 글자 수로 본다(짧은 감탄·물음이 문장으로 세지는 오판 방지). 카드 턴은 조금 여유
        if len(r) > (150 if is_deliver_turn else 90) or (ns >= 5):
            fails.append(f"t{i+1}:김({ns}문장·{len(r)}자)")
        if BODY_RE.search(r): fails.append(f"t{i+1}:사람흉내")
        if any(HON_RE.search(s) for s in sentences(r)): fails.append(f"t{i+1}:존댓말")
        if LEAK_RE.search(r): fails.append(f"t{i+1}:코드노출")
        pushed = any(a.get("kind") in CONTENT_KINDS for a in lg["actions"]) or bool(PUSH_RE.search(r))
        if "nopush" in chk and pushed: fails.append(f"t{i+1}:콘텐츠던짐")
        if "nopush_last" in chk and i == len(logs) - 1 and pushed: fails.append(f"t{i+1}:콘텐츠던짐")
        if "nogreet" in chk and i >= 1 and GREET_RE.search(r): fails.append(f"t{i+1}:뜬금인사")
        # 용건을 말했는데 「오 왔네!」로 시작 — 사장님이 제일 싫어한 버릇(인사 상황 제외)
        ut = sc["turns"][i] if i < len(sc["turns"]) else ""
        if ut and not re.search(r"(안녕|왔어|하이|굿모닝|잘\s*자|ㅎㅇ)", ut) and re.match(r"\s*(오+|아)?\s*(왔네|왔구나)", r): fails.append(f"t{i+1}:뜬금인사")
        if sc.get("mustnot") and re.search(sc["mustnot"], r): fails.append(f"t{i+1}:금지어")
    last = logs[-1] if logs else {"reply": "", "actions": []}
    if "deliver" in chk and not any(a.get("kind") in CONTENT_KINDS for a in last["actions"]):
        fails.append("마지막:콘텐츠안줌")
    if sc.get("must") and not re.search(sc["must"], last["reply"]):
        fails.append("마지막:필수어없음")
    return fails


def convo_text(sc, logs):
    out = []
    for t, lg in zip(sc["turns"], logs):
        out.append("유저: " + (t if t else "(창을 엶)"))
        kinds = [a.get("kind") for a in lg["actions"] if a.get("kind") in CONTENT_KINDS or a.get("kind") == "crisis"]   # 위기 상담 카드(109)도 심판이 봐야 한다
        out.append("갈비스: " + lg["reply"].replace("\n", " ") + (f"  [카드: {','.join(kinds)}]" if kinds else ""))
    return "\n".join(out)


def judge(batch):
    st, t = http("POST", "/functions/v1/galvis-redteam", {"op": "judge", "items": batch}, {"apikey": ANON, "Authorization": "Bearer " + ANON, "x-cron-key": CRON}, timeout=180)
    try:
        return {x["id"]: x for x in json.loads(t).get("r", [])}
    except Exception:
        return {}


def main():
    args = sys.argv[1:]
    only = None; tag = "run"
    if "--only" in args: only = args[args.index("--only") + 1].split(",")
    if "--tag" in args: tag = args[args.index("--tag") + 1]
    global ENGINE
    if "--engine" in args: ENGINE = args[args.index("--engine") + 1]
    setf = args[args.index("--set") + 1] if "--set" in args else "scenarios"   # --set holdout = 검증용(튜닝 금지)
    items = json.load(open(os.path.join(HERE, setf + ".json"), encoding="utf-8"))["items"]
    if only: items = [x for x in items if any(x["id"].startswith(o) for o in only)]
    pool = pool_login()
    if not pool: sys.exit("풀 계정 로그인 실패")
    print(f"상황 {len(items)}개 · 계정 {len(pool)}개로 시작", flush=True)
    q = queue.Queue()
    for x in items: q.put(x)
    results = {}
    lock = threading.Lock()

    def lane(u):
        while True:
            try: sc = q.get_nowait()
            except queue.Empty: return
            wipe(u["uid"])
            hist, logs = [], list()
            hist.extend(sc.get("seed") or [])   # 앞 대화가 있어야 하는 상황(예: 갈비스가 이미 '물은 마고'라고 한 뒤)
            for t in sc["turns"]:
                o = talk(u["jwt"], t, list(hist))
                logs.append(o)
                if t: hist.append({"role": "user", "content": t})
                hist.append({"role": "assistant", "content": o["reply"]})
                time.sleep(0.6)
            time.sleep(7)          # 기억 저장이 뒤늦게 끝난다 — 기다렸다 지워야 다음 상황에 안 샌다
            wipe(u["uid"])
            with lock:
                results[sc["id"]] = {"sc": sc, "logs": logs, "code": code_checks(sc, logs)}
                print(f"  {len(results)}/{len(items)} {sc['id']} {'✓' if not results[sc['id']]['code'] else '✗ ' + ' '.join(results[sc['id']]['code'])}", flush=True)

    ths = [threading.Thread(target=lane, args=(u,)) for u in pool]
    for th in ths: th.start()
    for th in ths: th.join()
    for u in pool: wipe(u["uid"])

    # 심판 — 8개씩
    ids = [x["id"] for x in items if x["id"] in results]
    for i in range(0, len(ids), 8):
        batch = [{"id": k, "st": results[k]["sc"]["st"], "expect": results[k]["sc"]["expect"], "convo": convo_text(results[k]["sc"], results[k]["logs"])} for k in ids[i:i + 8]]
        jr = judge(batch)
        for k in ids[i:i + 8]: results[k]["judge"] = jr.get(k)
        print(f"  심판 {min(i + 8, len(ids))}/{len(ids)}", flush=True)

    # 요약
    def ok(r):
        j = r.get("judge") or {}
        return not r["code"] and j.get("pass") is True
    by = {}
    for k in ids:
        r = results[k]; st = r["sc"]["st"]; j = r.get("judge") or {}
        b = by.setdefault(st, {"n": 0, "ok": 0, "ctx": 0, "human": 0, "persona": 0, "jn": 0})
        b["n"] += 1; b["ok"] += 1 if ok(r) else 0
        if j: b["jn"] += 1; b["ctx"] += j.get("ctx", 0); b["human"] += j.get("human", 0); b["persona"] += j.get("persona", 0)
    tot = sum(1 for k in ids if ok(results[k]))
    jall = [results[k].get("judge") or {} for k in ids]
    jn = max(1, sum(1 for j in jall if j))
    summ = {
        "합격": tot, "전체": len(ids), "합격률": round(tot * 100 / max(1, len(ids)), 1),
        "맥락": round(sum(j.get("ctx", 0) for j in jall) / jn, 2),
        "사람다움": round(sum(j.get("human", 0) for j in jall) / jn, 2),
        "갈비스다움": round(sum(j.get("persona", 0) for j in jall) / jn, 2),
        "코드결함": {},
        "상태별": {st: {"합격": f"{b['ok']}/{b['n']}", "맥락": round(b["ctx"] / max(1, b["jn"]), 1), "사람다움": round(b["human"] / max(1, b["jn"]), 1), "갈비스다움": round(b["persona"] / max(1, b["jn"]), 1)} for st, b in by.items()},
    }
    for k in ids:
        for f in results[k]["code"]:
            key = f.split(":", 1)[1].split("(")[0]
            summ["코드결함"][key] = summ["코드결함"].get(key, 0) + 1
    os.makedirs(os.path.join(HERE, "runs"), exist_ok=True)
    stamp = datetime.datetime.now().strftime("%m%d-%H%M")
    path = os.path.join(HERE, "runs", f"{stamp}-{tag}.json")
    json.dump({"summary": summ, "results": {k: {"st": results[k]["sc"]["st"], "turns": results[k]["sc"]["turns"], "expect": results[k]["sc"]["expect"],
                                                "replies": [l["reply"] for l in results[k]["logs"]],
                                                "kinds": [[a.get("kind") for a in l["actions"]] for l in results[k]["logs"]],
                                                "code": results[k]["code"], "judge": results[k].get("judge")} for k in ids}},
              open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(json.dumps(summ, ensure_ascii=False, indent=1))
    print("저장:", os.path.relpath(path, ROOT))


if __name__ == "__main__":
    main()
