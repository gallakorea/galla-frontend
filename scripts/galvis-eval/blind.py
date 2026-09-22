# -*- coding: utf-8 -*-
"""블라인드 평가 화면 만들기 — 두 결과 파일(같은 상황 세트)의 갈비스 답을 A/B 로 섞어 HTML 한 장으로.
  python3 scripts/galvis-eval/blind.py <결과A.json> <결과B.json> <출력.html>
어느 쪽이 어느 엔진인지는 화면에 없다(정답표는 페이지 안에 섞어 숨겨 두고, 다 고른 뒤 '공개'를 눌러야 보인다).
"""
import json, random, sys, html

a_path, b_path, out = sys.argv[1], sys.argv[2], sys.argv[3]
A = json.load(open(a_path, encoding="utf-8"))["results"]
B = json.load(open(b_path, encoding="utf-8"))["results"]
name_a = sys.argv[4] if len(sys.argv) > 4 else ("기존 엔진" if "v1" in a_path else "A")
name_b = sys.argv[5] if len(sys.argv) > 5 else ("새 엔진" if "v2" in b_path else "B")
ids = [k for k in A if k in B]
random.seed(20260922)
items = []
for k in ids:
    left_is_a = random.random() < 0.5
    L, R = (A[k], B[k]) if left_is_a else (B[k], A[k])
    items.append({"id": k, "st": A[k]["st"], "turns": A[k]["turns"],
                  "L": L["replies"], "R": R["replies"], "Lk": L["kinds"], "Rk": R["kinds"],
                  "key": "L" if left_is_a else "R"})   # key = 기존 엔진이 어느 쪽인지
random.shuffle(items)

def bubbles(turns, reps, kinds):
    h = []
    for t, r, kd in zip(turns, reps, kinds):
        h.append(f'<div class="u">{html.escape(t or "(창을 엶)")}</div>')
        card = [x for x in (kd or []) if x in ("view", "open", "news", "local", "weather", "crisis")]
        h.append(f'<div class="g">{html.escape(r or "(빈 답)")}' + (f'<span class="cd">카드 {len(card)}장</span>' if card else "") + '</div>')
    return "".join(h)

cards = []
for i, it in enumerate(items):
    cards.append(f'''<section class="q" data-i="{i}">
  <div class="meta">{i+1} / {len(items)} · {html.escape(it["st"])}</div>
  <div class="pair">
    <div class="col"><div class="lab">A</div>{bubbles(it["turns"], it["L"], it["Lk"])}</div>
    <div class="col"><div class="lab">B</div>{bubbles(it["turns"], it["R"], it["Rk"])}</div>
  </div>
  <div class="pick"><button data-v="L">A가 낫다</button><button data-v="S">비슷</button><button data-v="R">B가 낫다</button></div>
</section>''')

key = json.dumps([it["key"] for it in items])
page = f'''<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>갈비스 블라인드 평가</title>
<style>
:root{{--bg:#0b0b10;--card:#15151d;--line:#2a2a36;--tx:#eceaf2;--sub:#9a98a8;--me:#23232e;--gal:#1b2233;--acc:#7c8cff;--gold:#d8b46a}}
@media (prefers-color-scheme: light){{:root:not([data-theme="dark"]){{--bg:#f6f5f9;--card:#fff;--line:#e3e1ea;--tx:#1b1a22;--sub:#6d6b7b;--me:#efeef4;--gal:#e9eeff;--acc:#4a5bf0;--gold:#a57d2c}}}}
*{{box-sizing:border-box}} body{{margin:0;background:var(--bg);color:var(--tx);font:15px/1.5 -apple-system,"Apple SD Gothic Neo","Pretendard",sans-serif;padding:16px}}
h1{{font-size:20px;margin:4px 0 4px}} .lead{{color:var(--sub);margin:0 0 16px;font-size:14px}}
.q{{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:14px;margin:0 0 14px}}
.meta{{color:var(--sub);font-size:12px;margin-bottom:8px}}
.pair{{display:grid;grid-template-columns:1fr 1fr;gap:10px}} @media(max-width:640px){{.pair{{grid-template-columns:1fr}}}}
.col{{border:1px solid var(--line);border-radius:12px;padding:10px}} .lab{{font-weight:700;color:var(--acc);margin-bottom:6px}}
.u{{background:var(--me);border-radius:12px;padding:7px 10px;margin:6px 0 4px auto;max-width:88%;width:fit-content;font-size:14px}}
.g{{background:var(--gal);border-radius:12px;padding:7px 10px;margin:0 auto 6px 0;max-width:92%;width:fit-content;font-size:14px}}
.cd{{display:inline-block;margin-left:6px;font-size:11px;color:var(--gold);border:1px solid var(--gold);border-radius:8px;padding:0 6px}}
.pick{{display:flex;gap:8px;margin-top:10px}} .pick button{{flex:1;padding:10px 0;border-radius:10px;border:1px solid var(--line);background:transparent;color:var(--tx);font-size:14px;cursor:pointer}}
.pick button.on{{background:var(--acc);border-color:var(--acc);color:#fff}}
#bar{{position:sticky;bottom:0;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:12px;display:flex;gap:10px;align-items:center;flex-wrap:wrap}}
#bar button{{padding:10px 14px;border-radius:10px;border:0;background:var(--acc);color:#fff;font-size:14px;cursor:pointer}} #res{{font-size:14px}}
</style></head><body>
<h1>갈비스 블라인드 평가</h1>
<p class="lead">같은 대화에 대한 갈비스 답 두 개입니다. 어느 쪽이 어느 모델인지는 숨겨져 있어요. <b>맥락을 이해하고, 앞에서 한 말을 기억하고, 말 뒤의 속뜻을 읽는 쪽</b>을 골라주세요. 특히 마지막 답을 보세요.</p>
{"".join(cards)}
<div id="bar"><span id="cnt">0 / {len(items)} 고름</span><button id="rev">결과 공개</button><span id="res"></span></div>
<script>
const SK="gv_blind_"+{json.dumps(out.split("/")[-1])}; const KEY={key}; const NA={json.dumps(name_a)}, NB={json.dumps(name_b)};
let votes={{}}; try{{votes=JSON.parse(localStorage.getItem(SK)||"{{}}")}}catch(e){{}}
function save(){{try{{localStorage.setItem(SK,JSON.stringify(votes))}}catch(e){{}}}}
function paint(){{document.querySelectorAll(".q").forEach(q=>{{const i=q.dataset.i;q.querySelectorAll("button").forEach(b=>b.classList.toggle("on",votes[i]===b.dataset.v))}});document.getElementById("cnt").textContent=Object.keys(votes).length+" / {len(items)} 고름"}}
document.querySelectorAll(".q").forEach(q=>q.querySelectorAll("button").forEach(b=>b.onclick=()=>{{votes[q.dataset.i]=b.dataset.v;save();paint()}}));
document.getElementById("rev").onclick=()=>{{let a=0,b=0,s=0;for(const i in votes){{const v=votes[i];if(v==="S")s++;else if(v===KEY[i])a++;else b++;}}
document.getElementById("res").textContent=NB+" "+b+" · "+NA+" "+a+" · 비슷 "+s;}};
window.gvTally=()=>{{let a=0,b=0,s=0;const d=[];for(const i in votes){{const v=votes[i];const w=v==="S"?"비슷":(v===KEY[i]?NA:NB);if(v==="S")s++;else if(v===KEY[i])a++;else b++;d.push(i+":"+w)}}return {{new:b,old:a,same:s,n:Object.keys(votes).length,detail:d}}}};
paint();
</script></body></html>'''
open(out, "w", encoding="utf-8").write(page)
print("저장:", out, "문항", len(items))
