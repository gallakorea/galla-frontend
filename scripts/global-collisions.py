#!/usr/bin/env python3
"""💥 전역 선언 충돌 검사 — SPA 는 페이지 스크립트를 **한 문서**에 다 싣는다.

MPA 시절엔 페이지마다 독립 문서라 최상위 `let supa` · `const $` 를 마음대로 써도 됐다.
SPA(app.html)에선 그게 전부 **같은 전역 렉시컬 스코프**로 들어간다.
같은 이름이 두 번 선언되면 나중에 실린 스크립트가 통째로 죽는다:
  Uncaught SyntaxError: Identifier 'supa' has already been declared
에러는 콘솔에만 남고 화면은 그냥 비어 있어서 원인이 안 보인다.
실측 2026-08-29: gp-history.js 가 이 이유로 네이티브에서 통째로 실행 안 됨(GP 지갑 잔액 '–').

검사 대상: **최상위 let/const/class**. var/function 은 재선언이 허용되므로 제외.
제외: ES 모듈(자기 스코프) · IIFE 로 감싼 파일(predict-market.js 가 이미 이 방식).

실행:  python3 -I scripts/global-collisions.py
"""
import os, re, sys
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
JS = os.path.join(ROOT, "js")

LINE_COMMENT = re.compile(r"^\s*//.*$", re.M)
BLOCK_COMMENT = re.compile(r"/\*[\s\S]*?\*/")
DECL = re.compile(r"^(?:let|const|class)\s+([A-Za-z_$][\w$]*)", re.M)


def is_module(src):
    return bool(re.search(r"^\s*(import\s|export\s)", src, re.M))


def is_wrapped(src):
    body = BLOCK_COMMENT.sub("", src)
    body = LINE_COMMENT.sub("", body).lstrip()
    return body.startswith("(function") or body.startswith("(()") or body.startswith("!function")




def module_loaded_by_adapters():
    """어댑터가 type=module 로 싣거나 import() 하는 파일 — 모듈은 자기 스코프라 충돌하지 않는다.
       파일 안에 import/export 가 없어도 module 로 실릴 수 있어서 어댑터를 읽어야 안다."""
    out = set()
    views = os.path.join(ROOT, "js", "spa", "views")
    if not os.path.isdir(views):
        return out
    for f in os.listdir(views):
        if not f.endswith(".js"):
            continue
        src = open(os.path.join(views, f), encoding="utf-8", errors="ignore").read()
        for m in re.finditer(r'["\'](/js/([\w.-]+\.js))["\']\s*,\s*module:\s*true', src):
            out.add(m.group(2))
        for m in re.finditer(r'import\(\s*["\'](/js/([\w.-]+\.js))', src):
            out.add(m.group(2))
        for m in re.finditer(r'import\(\s*m\b', src):
            pass
    return out


MODULES = module_loaded_by_adapters()

owners = defaultdict(list)
for f in sorted(os.listdir(JS)):
    if not f.endswith(".js"):
        continue
    src = open(os.path.join(JS, f), encoding="utf-8", errors="ignore").read()
    if f in MODULES or is_module(src) or is_wrapped(src):
        continue
    for m in DECL.finditer(src):
        owners[m.group(1)].append(f)

clashes = {k: sorted(set(v)) for k, v in owners.items() if len(set(v)) > 1}
for name, files in sorted(clashes.items(), key=lambda kv: -len(kv[1])):
    print(f"❌ `{name}` — {len(files)}개 파일이 최상위 선언: {', '.join(files)}")

if clashes:
    print(f"\n❌ {len(clashes)}개 이름 충돌 — 같은 문서에 함께 실리면 뒤엣것이 죽는다.")
    print("   고치는 법: 해당 파일 전체를 IIFE 로 감싼다 — (function () { ... })();")
else:
    print("✅ 전역 선언 충돌 없음")
sys.exit(1 if clashes else 0)
