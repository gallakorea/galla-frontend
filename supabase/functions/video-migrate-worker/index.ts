/* 🔁 신규 영상 자동 이관 워커 — 큐를 집어 Stream → R2로 옮긴다
 *
 *  크론이 5분마다 부른다. 큐에 있는 영상 중 인코딩이 끝난 것부터 옮기고,
 *  아직 안 끝난 건 실패로 기록해 다음 회차에 다시 시도한다(최대 20회 ≈ 100분).
 *
 *  ⚠️ 이관 자체는 stream-to-r2가 한다. 여기서 로직을 복붙하지 마라 —
 *     두 벌이 되면 한쪽만 고쳐서 미묘하게 어긋난다.
 */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.112.4";

const SUPA_URL = Deno.env.get("SUPABASE_URL")!;
const SRK = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: { "Access-Control-Allow-Origin": "*" } });
  try {
    /* 🔒 호출자 검증 — 크론(x-cron-secret) 또는 service_role만.
       ⚠️ 열어두면 아무나 이관을 돌릴 수 있고, 그때마다 Stream delivered 분이 과금된다.
          (처음에 검증을 빼먹었다) */
    const supaAdmin = createClient(SUPA_URL, SRK);
    const secretHdr = req.headers.get("x-cron-secret") || "";
    let allowed = false;
    if (secretHdr) {
      const { data } = await supaAdmin.rpc("cron_secret_matches", { p_secret: secretHdr });
      allowed = data === true;
    }
    if (!allowed) {
      const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer /, "");
      try {
        const p = JSON.parse(atob(jwt.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
        allowed = p?.role === "service_role";
      } catch { /* 무시 */ }
    }
    if (!allowed) return json({ ok: false, reason: "forbidden" }, 403);

    const supa = supaAdmin;

    let limit = 5;
    try { const b = await req.json(); if (b?.limit) limit = Math.min(Number(b.limit) || 5, 20); } catch { /* 크론은 본문 없이 부른다 */ }

    const { data: uids, error } = await supa.rpc("next_video_migrations", { p_limit: limit });
    if (error) return json({ ok: false, reason: error.message }, 500);
    const list: string[] = Array.isArray(uids) ? uids : [];
    if (!list.length) return json({ ok: true, processed: 0, note: "대기 없음" });

    const done: string[] = [], failed: string[] = [];
    for (const uid of list) {
      try {
        const r = await fetch(`${SUPA_URL}/functions/v1/stream-to-r2`, {
          method: "POST",
          headers: { Authorization: `Bearer ${SRK}`, "Content-Type": "application/json" },
          body: JSON.stringify({ uid }),
        });
        const out = await r.json();
        if (!out?.ok) {
          // 인코딩이 아직이면 master_fetch로 떨어진다 — 실패가 아니라 '아직'이다
          await supa.rpc("fail_video_migration", { p_uid: uid, p_err: String(out?.reason || r.status) });
          failed.push(uid);
          continue;
        }
        // ⚠️ 주소 교체는 미러가 끝난 뒤에만. 순서가 반대면 아직 없는 파일을 가리키게 된다.
        const { error: aErr } = await supa.rpc("apply_video_migration", {
          p_uid: uid, p_url: out.url, p_thumb: out.thumb ?? null,
        });
        if (aErr) { await supa.rpc("fail_video_migration", { p_uid: uid, p_err: aErr.message }); failed.push(uid); continue; }
        done.push(uid);
      } catch (e) {
        await supa.rpc("fail_video_migration", { p_uid: uid, p_err: String(e).slice(0, 300) });
        failed.push(uid);
      }
    }
    return json({ ok: true, processed: list.length, done: done.length, retry: failed.length, done_uids: done });
  } catch (e) {
    return json({ ok: false, reason: String(e).slice(0, 300) }, 500);
  }
});
