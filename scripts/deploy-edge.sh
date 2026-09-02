#!/bin/zsh
# 엣지 함수 배포 + 스모크 테스트 + 실패 시 자동 롤백
#
# 왜 있나: 2026-09-02 에 harvest-travel-places 에 기능을 넣고 배포했는데 **런타임에서
# 통째로 500** 이 났다. esbuild 빌드는 통과했다 — 빌드 통과는 런타임을 보장하지 않는다.
# 그 사이 수확 크론이 계속 실패했고, 사람이 눈치챌 때까지 아무도 몰랐다.
#
#   사용:  scripts/deploy-edge.sh <함수이름> [스모크 쿼리스트링]
#   예:    scripts/deploy-edge.sh harvest-travel-places "n=1"
#
# 배포 직후 그 쿼리로 한 번 호출해 HTTP 200 + ok:true 를 확인한다.
# 실패하면 **직전 커밋 버전으로 되돌려 다시 배포**하고 1 을 반환한다.
set -u
export PATH=/usr/bin:/bin:/opt/homebrew/bin:$PATH
FN="${1:-}"; SMOKE="${2:-}"
[ -z "$FN" ] && { echo "함수 이름이 필요하다"; exit 2; }
SRC="supabase/functions/$FN/index.ts"
[ -f "$SRC" ] || { echo "없는 함수: $SRC"; exit 2; }

TOKEN=$(security find-generic-password -s "Supabase CLI" -w | sed 's/^go-keyring-base64://' | base64 -d)
export SUPABASE_ACCESS_TOKEN="$TOKEN"
REF=bidqauputnhkqepvdzrr

deploy() { npx --yes supabase@latest functions deploy "$FN" --project-ref "$REF" --no-verify-jwt 2>&1 | tail -1; }

echo "▶ 배포: $FN"
deploy || exit 1

[ -z "$SMOKE" ] && { echo "✅ 배포 완료(스모크 생략 — 쿼리스트링 미지정)"; exit 0; }

python3 -c "import json;print(json.dumps({'query':\"select decrypted_secret from vault.decrypted_secrets where name='cron_secret' limit 1;\"}))" > /tmp/dq.json
S=$(curl -s -X POST "https://api.supabase.com/v1/projects/$REF/database/query" \
      -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" --data-binary @/tmp/dq.json \
    | python3 -c "import sys,json;print(json.load(sys.stdin)[0]['decrypted_secret'])")

sleep 4
echo "▶ 스모크: ?$SMOKE"
BODY=$(curl -s -w "\n%{http_code}" -X POST "https://$REF.supabase.co/functions/v1/$FN?$SMOKE" \
        -H "x-cron-secret: $S" -m 175)
CODE=$(echo "$BODY" | tail -1); JSON=$(echo "$BODY" | sed '$d')
echo "   http $CODE · $(echo "$JSON" | head -c 200)"

OK=$(echo "$JSON" | python3 -c "
import sys,json
try: print('1' if json.load(sys.stdin).get('ok') is True else '0')
except Exception: print('0')" 2>/dev/null)

if [ "$CODE" = "200" ] && [ "$OK" = "1" ]; then
  echo "✅ 스모크 통과"
  exit 0
fi

echo "❌ 스모크 실패 — 직전 커밋으로 되돌린다"
git stash push -q -- "$SRC" 2>/dev/null || cp "$SRC" "/tmp/$FN.failed.ts"
git checkout -- "$SRC" 2>/dev/null || true
deploy
echo "↩︎ 롤백 완료. 실패한 소스는 git stash 또는 /tmp/$FN.failed.ts 에 있다."
exit 1
