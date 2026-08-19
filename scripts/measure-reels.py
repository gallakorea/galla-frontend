#!/usr/bin/env python3
"""완성본 스타일 측정 — 사장님 릴스에서 '자동으로 잴 수 있는 것'만 뽑는다.
컷 수·컷 길이 분포·첫 컷 시점·라우드니스. 취향을 회귀 검사로 바꾸기 위한 재료."""
import json, os, re, subprocess, sys
FF = "/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg"
FP = os.path.join(os.path.dirname(FF), "ffprobe")

def dur(p):
    r = subprocess.run([FP, "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", p],
                       capture_output=True, text=True)
    try: return float(r.stdout.strip())
    except Exception: return 0.0

def cuts(p):
    # 240px로 줄여서 검출(4K 원본 그대로 돌리면 몇 분씩 걸린다)
    r = subprocess.run([FF, "-v", "error", "-i", p, "-vf",
                        "scale=240:-2,select='gt(scene,0.35)',metadata=print:file=-",
                        "-an", "-f", "null", "-"], capture_output=True, text=True)
    return [round(float(m), 2) for m in re.findall(r"pts_time:([0-9.]+)", r.stdout + r.stderr)]

def lufs(p):
    r = subprocess.run([FF, "-hide_banner", "-i", p, "-af", "ebur128=framelog=quiet", "-f", "null", "-"],
                       capture_output=True, text=True)
    m = re.findall(r"I:\s*(-?[0-9.]+) LUFS", r.stdout + r.stderr)
    return float(m[-1]) if m else None

out = []
for path in sys.argv[1:]:
    d = dur(path)
    if d < 5 or d > 120: continue
    c = cuts(path)
    bounds = [0.0] + c + [d]
    lens = [round(bounds[i+1]-bounds[i], 2) for i in range(len(bounds)-1)]
    lens = [x for x in lens if x > 0.2]
    if not lens: continue
    first5 = len([x for x in c if x <= 5.0])
    out.append({"name": os.path.basename(path), "dur": round(d,1), "cuts": len(lens),
                "avg": round(sum(lens)/len(lens),2), "min": min(lens), "max": max(lens),
                "first5_cuts": first5 + 1, "lufs": lufs(path)})
    print(json.dumps(out[-1], ensure_ascii=False), flush=True)
json.dump(out, open("/tmp/reel_style.json","w"), ensure_ascii=False)
