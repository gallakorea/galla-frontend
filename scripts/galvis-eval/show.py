# -*- coding: utf-8 -*-
"""채점 결과 보기 — python3 scripts/galvis-eval/show.py [결과파일] [--all]
기본은 불합격만. 읽기만 한다."""
import json, glob, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
args = [a for a in sys.argv[1:] if not a.startswith("--")]
path = args[0] if args else sorted(glob.glob(os.path.join(HERE, "runs", "*.json")))[-1]
d = json.load(open(path, encoding="utf-8"))
s = d["summary"]
print(f"합격 {s['합격']}/{s['전체']} ({s['합격률']}%) · 맥락 {s['맥락']} · 사람다움 {s['사람다움']} · 갈비스다움 {s['갈비스다움']}")
print("코드결함:", s["코드결함"])
for k, r in d["results"].items():
    j = r.get("judge") or {}
    bad = r["code"] or not j.get("pass")
    if not bad and "--all" not in sys.argv:
        continue
    print(f"■ {k} [{r['st']}] 코드:{r['code']} 심판:{'합격' if j.get('pass') else '불합격'} 맥락{j.get('ctx')} 사람{j.get('human')} | {j.get('why')}")
    for t, a, kd in zip(r["turns"], r["replies"], r["kinds"]):
        kk = [x for x in kd if x]
        print(f"   유: {t or '(창)'}  →  갈: {a.replace(chr(10), ' ')[:220]} {kk if kk else ''}")
