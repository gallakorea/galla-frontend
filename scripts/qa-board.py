#!/usr/bin/env python3
"""docs/qa-checklist.md → 런칭 QA 현황판(HTML) 을 **다시 만든다**.

현황판(아티팩트)은 2026-08-31 8차본에서 손으로 뽑아 만들었더니 그날로 굳어버렸다.
체크리스트는 매일 바뀌는데 현황판은 안 바뀌니, 사장님이 보는 숫자와 실제가 어긋난다.
→ 이제 이 스크립트로만 만든다. 체크리스트를 고쳤으면 이걸 돌리고 아티팩트를 다시 올린다.

    python3 scripts/qa-board.py            # docs/qa-board.html 생성
    python3 scripts/qa-board.py --out /tmp/board.html

판정 규칙은 scripts/qa-progress.py 와 **같다**(행 단위):
  ✅만 → 확인 · ⛔만 → 막힘 · ❌ 있고 ✅·🔶 없음 → 미확인 · 그 밖 → 부분
"""
import re, sys, pathlib, html as _h

ROOT = pathlib.Path(__file__).resolve().parent.parent
DOC = ROOT / "docs" / "qa-checklist.md"
CSS = ROOT / "docs" / "qa-board.css"
MARKS = ("✅", "🔶", "❌", "⛔")

# '먼저 봐야 할 것' — 출시를 막을 수 있는 장. 사람이 고른 목록이라 여기 박아둔다.
BLOCKER_SECTIONS = ("인증·계정", "플랫폼 고유", "심사·규정", "법무·심사 표시",
                    "계정 상태·어뷰징", "개인정보 국외이전", "보안")

# 2026-08-31 에 손으로 만들어 올렸던 첫 현황판(8차본)의 수치. 비교선으로 남긴다 —
# 이 판이 왜 굳었는지, 그 뒤로 얼마나 움직였는지가 한 줄로 보여야 한다.
PREV = {"date": "2026-08-31", "n": 298, "done": 67, "part": 33, "todo": 172, "block": 26}

def rows():
    """(구역, 항목, 상태, 근거) 를 순서대로 낸다."""
    sec = "(머리말)"
    for ln in DOC.read_text().splitlines():
        s = ln.strip()
        if s.startswith("## "):
            sec = s[3:].strip()
            continue
        if not s.startswith("|"):
            continue
        if set(s.replace("|", "").replace(" ", "")) <= set("-:"):
            continue
        note = ""
        m = re.search(r"<!--\s*(.*?)\s*-->", s)
        if m:
            note = m.group(1)
            s = s[:m.start()].strip()
        cells = [c.strip() for c in s.strip("|").split("|")]
        if len(cells) < 2:
            continue
        found = {k for c in cells[1:] for k in MARKS if k in c}
        if not found:
            continue
        if found == {"✅"}:        st = "done"
        elif found == {"⛔"}:      st = "block"
        elif "❌" in found and not (found & {"✅", "🔶"}): st = "todo"
        else:                      st = "part"
        # 표 안에 적어둔 근거(마크·기호 제거)도 같이 보여준다
        if not note:
            body = " ".join(cells[1:])
            for k in MARKS: body = body.replace(k, " ")
            note = re.sub(r"\s+", " ", body).strip(" ·-")
        note = re.sub(r"^[\s—·\-]+|[\s—·\-]+$", "", note)
        if len(note) < 3:
            note = ""
        yield sec, re.sub(r"\*\*|`", "", cells[0]).strip(), st, note

def esc(t):
    return _h.escape(t, quote=False)

def li(item, st, note):
    n = f'<span class="n">{esc(note[:160])}</span>' if note else ""
    return f'<li class="{st}"><span class="t">{esc(item)}</span>{n}</li>'

def area(sec, items, done, total):
    lis = "\n".join(li(i, st, nt) for i, st, nt in items)
    return (f'<section class="area">\n  <h4>{esc(sec)}'
            f'<span class="ratio">{done}<i>/</i>{total}</span></h4>\n'
            f'  <ul class="list">{lis}</ul>\n</section>')

def main():
    out = pathlib.Path(sys.argv[sys.argv.index("--out") + 1]) if "--out" in sys.argv \
          else ROOT / "docs" / "qa-board.html"
    data, order = {}, []
    for sec, item, st, note in rows():
        if sec not in data:
            data[sec] = []; order.append(sec)
        data[sec].append((item, st, note))

    tot = {"done": 0, "part": 0, "todo": 0, "block": 0}
    for sec in order:
        for _, st, _ in data[sec]:
            tot[st] += 1
    n = sum(tot.values())
    ok = tot["done"] + tot["part"]
    no = tot["todo"] + tot["block"]
    pct = lambda v: f"{v / n * 100:.4f}%"

    def group(pick, sections=None):
        blocks = []
        for sec in order:
            if sections and not any(sec.startswith(s) or s in sec for s in sections):
                continue
            items = [(i, st, nt) for i, st, nt in data[sec] if pick(st)]
            if not items:
                continue
            done = sum(1 for _, st, _ in data[sec] if st in ("done", "part"))
            blocks.append(area(sec, items, done, len(data[sec])))
        return "\n".join(blocks)

    warn = group(lambda st: st in ("todo", "block"), BLOCKER_SECTIONS)
    blocked = group(lambda st: st == "block")
    okay = group(lambda st: st in ("done", "part"))
    def not_blocker(sec):
        return not any(sec.startswith(b) or b in sec for b in BLOCKER_SECTIONS)
    rest_blocks = []
    for sec in order:
        if not not_blocker(sec):
            continue
        items = [(i, st, nt) for i, st, nt in data[sec] if st == "todo"]
        if not items:
            continue
        done = sum(1 for _, st, _ in data[sec] if st in ("done", "part"))
        rest_blocks.append(area(sec, items, done, len(data[sec])))
    rest = "\n".join(rest_blocks)
    warn_n = warn.count('<li class="')
    ok_n = okay.count('<li class="')
    rest_n = rest.count('<li class="')
    block_n = blocked.count('<li class="')

    from datetime import datetime, timezone, timedelta
    today = datetime.now(timezone(timedelta(hours=9))).strftime("%Y-%m-%d")

    doc = f"""<title>갈라 런칭 QA 현황판</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+KR:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500;600&display=swap">
<style>
{CSS.read_text()}
</style>

<div class="wrap">

<header>
  <h1>갈라 런칭 QA 현황판</h1>
  <p class="sub">항목 <b class="mono">{n}</b>개 · {today} 기준 · <span class="mono">docs/qa-checklist.md</span> 에서 <span class="mono">scripts/qa-board.py</span> 로 자동 생성</p>
</header>

<div class="scale">
  <div class="scale-head">
    <div class="side l">
      <div class="num mono">{ok}</div>
      <div class="lab">된 것</div>
      <div class="of">확인 {tot['done']} · 부분 {tot['part']}</div>
    </div>
    <div class="side r">
      <div class="num mono">{no}</div>
      <div class="lab">안 된 것</div>
      <div class="of">미확인 {tot['todo']} · 막힘 {tot['block']}</div>
    </div>
  </div>
  <div class="bar" role="img" aria-label="된 것 {ok}개, 안 된 것 {no}개">
    <span class="b-done" style="width:{pct(tot['done'])}"></span>
    <span class="b-part" style="width:{pct(tot['part'])}"></span>
    <span class="b-block" style="width:{pct(tot['block'])}"></span>
    <span class="b-todo" style="width:{pct(tot['todo'])}"></span>
  </div>
  <div class="keys">
    <span><i class="dot" style="background:var(--done)"></i><b>확인 {tot['done']}</b> — 실제로 눌러보고 DB까지 대조</span>
    <span><i class="dot" style="background:var(--part)"></i><b>부분 {tot['part']}</b> — 한 플랫폼만, 또는 코드만</span>
    <span><i class="dot" style="background:var(--block)"></i><b>막힘 {tot['block']}</b> — 키·실기기·결제 등 외부 조건</span>
    <span><i class="dot" style="background:var(--todo);opacity:.5"></i><b>미확인 {tot['todo']}</b> — 아직 손 못 댐</span>
  </div>
  <p class="judge"><b>{PREV['date']} 첫 판(8차본) 대비.</b> 그때는 항목 {PREV['n']}개 · 된 것 {PREV['done'] + PREV['part']}(확인 {PREV['done']} · 부분 {PREV['part']}) · 안 된 것 {PREV['todo'] + PREV['block']}(미확인 {PREV['todo']} · 막힘 {PREV['block']})였습니다.
  지금은 항목 {n}개 · 된 것 {ok}(확인 {tot['done']} · 부분 {tot['part']}) · 안 된 것 {no}(미확인 {tot['todo']} · 막힘 {tot['block']}).
  <b>미확인 {PREV['todo']} → {tot['todo']}.</b> 항목 수가 는 건 체크리스트에 장이 추가돼서입니다.
  ⚠️ 첫 판은 손으로 만들어 그날로 굳었고, 그 사이 상세 섹션에서 확인한 12행이 표에는 ❌ 로 남아 있었습니다. 그래서 이제 스크립트로만 만듭니다.</p>
</div>

<div class="card warn">
  <h2>먼저 봐야 할 것 <span class="cnt">{warn_n}</span></h2>
  <p class="lede">출시를 실제로 막을 수 있는 것들. 심사에서 걸리거나(앱스토어·법정 표기), 사고가 나면 되돌리기 어려운 것(보안·가입 경로)입니다.</p>
  {warn}
  <p class="judge"><b>이건 데이터가 아니라 판단입니다.</b> 체크리스트에 '출시 차단' 표시가 따로 없어서, 앱스토어 필수 항목·전자상거래법 표기·보안 회귀·가입 경로를 기준으로 골랐습니다.</p>
</div>

<div class="card">
  <h2>된 것 <span class="cnt">{ok_n}</span></h2>
  <p class="lede">'확인'은 화면에서 눌러보고 DB 행까지 대조한 것, '부분'은 한 플랫폼만 봤거나 코드만 확인한 것입니다. 각 줄 아래 회색 글씨가 근거입니다.</p>
  {okay}
</div>

<div class="card">
  <h2>막힘 <span class="cnt">{block_n}</span></h2>
  <p class="lede">제가 뚫을 수 없는 것들. 사장님 키 등록·실기기·결제 오픈이 있어야 진행됩니다.</p>
  {blocked}
</div>

<div class="card">
  <h2>아직 안 본 것 <span class="cnt">{rest_n}</span></h2>
  <p class="lede">위 '먼저 봐야 할 것'을 뺀 나머지입니다. 대부분 부가 기능·운영 도구·호환성이라 출시를 막지는 않지만, 하나씩은 봐야 합니다.</p>
  {rest}
</div>

<footer>
  이 페이지는 <span class="mono">docs/qa-checklist.md</span> 에서 <span class="mono">python3 scripts/qa-board.py</span> 로 만듭니다.<br>체크리스트를 고쳤으면 이 스크립트를 다시 돌려서 아티팩트를 갱신하세요.
</footer>

</div>
"""
    out.write_text(doc)
    print(f"{out} — 항목 {n} · 확인 {tot['done']} · 부분 {tot['part']} · 미확인 {tot['todo']} · 막힘 {tot['block']}")

main()
