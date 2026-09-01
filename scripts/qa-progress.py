#!/usr/bin/env python3
"""docs/qa-checklist.md 의 진도를 **같은 규칙으로** 센다.

왜 필요한가: 세션마다 손으로 세다 보니 숫자가 안 맞았다(인계문 293건 vs 실제 표 행 318개).
"몇 % 했나"는 결함 수가 아니라 **체크리스트 행**으로만 세야 한다(과거 47% 과대보고 이력).

규칙(행 단위):
  ✅만        → 완료
  ⛔만        → 막힘(사유 있는 보류)
  ❌ 있고 ✅·🔶 없음 → 미착수
  그 밖(섞임) → 부분

    python3 scripts/qa-progress.py            # 요약
    python3 scripts/qa-progress.py --todo     # 미착수 행 전부
    python3 scripts/qa-progress.py --part     # 부분 행 전부
"""
import sys, pathlib, re

DOC = pathlib.Path(__file__).resolve().parent.parent / "docs" / "qa-checklist.md"
MARKS = ("✅", "🔶", "❌", "⛔")

def rows():
    sec = "(머리말)"
    for ln in DOC.read_text().splitlines():
        s = ln.strip()
        if s.startswith("## "):
            sec = s[3:].strip(); continue
        if not s.startswith("|"):
            continue
        if set(s.replace("|", "").replace(" ", "")) <= set("-:"):
            continue
        cells = [c.strip() for c in s.strip("|").split("|")]
        if len(cells) < 2:
            continue
        found = {m for c in cells[1:] for m in MARKS if m in c}
        if not found:
            continue
        if found == {"✅"}:        st = "완료"
        elif found == {"⛔"}:      st = "막힘"
        elif "❌" in found and not (found & {"✅", "🔶"}): st = "미착수"
        else:                      st = "부분"
        yield sec, st, cells[0], found

def main():
    want = None
    if "--todo" in sys.argv: want = "미착수"
    if "--part" in sys.argv: want = "부분"
    per, tot = {}, {"완료": 0, "부분": 0, "미착수": 0, "막힘": 0}
    listed = []
    for sec, st, name, found in rows():
        per.setdefault(sec, {"완료": 0, "부분": 0, "미착수": 0, "막힘": 0})[st] += 1
        tot[st] += 1
        if want and st == want:
            listed.append(f"  [{sec}] {name}  {''.join(sorted(found))}")
    w = max(len(s) for s in per)
    print(f"{'구역'.ljust(w)}  완료  부분  미착수  막힘")
    for sec, c in per.items():
        print(f"{sec.ljust(w)}  {c['완료']:>4}  {c['부분']:>4}  {c['미착수']:>6}  {c['막힘']:>4}")
    n = sum(tot.values())
    print(f"\n합계 {n}행 — 완료 {tot['완료']} · 부분 {tot['부분']} · 미착수 {tot['미착수']} · 막힘 {tot['막힘']}")
    print(f"완료율 {tot['완료']/n*100:.1f}%  (완료+부분 {(tot['완료']+tot['부분'])/n*100:.1f}%)")
    # 칸 단위 — 웹/iOS/AOS 표는 한 행이 세 칸이라, 행 판정만 보면 '웹만 확인'이 안 보인다.
    cell = {m: 0 for m in MARKS}
    for ln in DOC.read_text().splitlines():
        t = ln.strip()
        if not t.startswith("|"):
            continue
        if set(t.replace("|", "").replace(" ", "")) <= set("-:"):
            continue
        cells = [c.strip() for c in t.strip("|").split("|")]
        for c in cells[1:]:
            for m in MARKS:
                if m in c:
                    cell[m] += 1
    print(f"칸 단위 — ✅ {cell['✅']} · 🔶 {cell['🔶']} · ❌ {cell['❌']} · ⛔ {cell['⛔']}")
    if want:
        print(f"\n── {want} {len(listed)}행 ──")
        print("\n".join(listed))

main()
