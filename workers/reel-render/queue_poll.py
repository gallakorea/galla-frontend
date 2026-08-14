# 🎬 렌더 큐 폴링 — reel-agent 엣지의 워커 API로 잡을 받아 렌더하고 결과를 R2에 올린다.
# 인증은 REEL_WORKER_KEY 하나(서비스키 불필요 — DB 접근은 전부 엣지가 대행).
# 설정: 이 폴더의 .env.local (git 제외)
#   REEL_AGENT_URL=https://<ref>.supabase.co/functions/v1/reel-agent
#   REEL_WORKER_KEY=<시크릿>
#   SUPABASE_ANON_KEY=<anon>            # 엣지 게이트웨이 통과용
# 실행: python3 render_worker.py --poll   (nohup 상주 가능 — galla-quant 랩과 같은 패턴)

import json, os, subprocess, sys, tempfile, time, urllib.request

def _env():
    here = os.path.dirname(os.path.abspath(__file__))
    envf = os.path.join(here, ".env.local")
    if os.path.exists(envf):
        for line in open(envf):
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip())
    url = os.environ.get("REEL_AGENT_URL"); key = os.environ.get("REEL_WORKER_KEY"); anon = os.environ.get("SUPABASE_ANON_KEY")
    if not url or not key or not anon:
        sys.exit("REEL_AGENT_URL / REEL_WORKER_KEY / SUPABASE_ANON_KEY 필요 (.env.local)")
    return url, key, anon

def _call(url, key, anon, payload):
    req = urllib.request.Request(url, data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json", "x-worker-key": key, "apikey": anon, "Authorization": "Bearer " + anon})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode())

def poll_loop(render_fn):
    url, key, anon = _env()
    print(f"[worker] 큐 폴링 시작 → {url}", flush=True)
    while True:
        try:
            d = _call(url, key, anon, {"op": "pick"})
            job = d.get("job")
            if not job:
                time.sleep(5); continue
            jid = job["id"]; spec = job["spec"]
            print(f"[worker] 잡 {jid} — 세그먼트 {len(spec['segments'])}개", flush=True)
            def prog(msg):
                print(f"[worker] {jid} {msg}", flush=True)
                try: _call(url, key, anon, {"op": "progress", "id": jid, "msg": "렌더: " + msg})
                except Exception: pass
            try:
                with tempfile.TemporaryDirectory() as wd:
                    out = os.path.join(wd, "out.mp4")
                    render_fn({"segments": [{"src": s["src"], "in": s.get("in", 0), "dur": s["dur"]} for s in spec["segments"]],
                               "voice": spec["voice"], "subtitles": [{"text": x["text"], "start": x["start"], "len": x.get("len", 0.5)} for x in spec["subtitles"]],
                               "width": spec.get("width", 1080), "height": spec.get("height", 1920), "fps": spec.get("fps", 30)}, out, wd, progress=prog)
                    ps = _call(url, key, anon, {"op": "presign", "id": jid})
                    put = urllib.request.Request(ps["url"], data=open(out, "rb").read(), method="PUT",
                        headers={"Content-Type": "video/mp4"})
                    with urllib.request.urlopen(put, timeout=300) as r:
                        if r.status >= 300: raise RuntimeError(f"r2_put_{r.status}")
                    done = _call(url, key, anon, {"op": "done", "id": jid, "key": ps["key"]})
                    print(f"[worker] 완성 → {done.get('video_url')}", flush=True)
            except Exception as e:
                print(f"[worker] 실패: {e}", flush=True)
                try: _call(url, key, anon, {"op": "fail", "id": jid, "error": str(e)[:250]})
                except Exception: pass
        except KeyboardInterrupt:
            print("[worker] 종료"); return
        except Exception as e:
            print(f"[worker] 폴링 오류(계속): {e}", flush=True)
            time.sleep(10)
