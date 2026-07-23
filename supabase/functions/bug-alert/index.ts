// 🤖 버그헌터 알림 발송 — 웹푸시(VAPID) + 이메일(Resend, 키 있을 때).
// run_bug_hunt()이 새 critical/high 발견 시 x-bug-secret 헤더로 호출한다.
// verify_jwt=false (공유 시크릿으로 자체 인증). 임의 호출 방지 = BUG_ALERT_SECRET.
import webpush from "npm:web-push@3.6.7";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
webpush.setVapidDetails(
  Deno.env.get("VAPID_SUBJECT") || "mailto:blackid@gmail.com",
  Deno.env.get("VAPID_PUBLIC_KEY")!,
  Deno.env.get("VAPID_PRIVATE_KEY")!,
);
const j = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return j({ error: "method" }, 405);
  if ((req.headers.get("x-bug-secret") || "") !== (Deno.env.get("BUG_ALERT_SECRET") || " "))
    return j({ error: "forbidden" }, 401);
  let b: { title?: string; body?: string };
  try { b = await req.json(); } catch { return j({ error: "bad json" }, 400); }
  const title = (b.title || "버그헌터 경보").slice(0, 120);
  const body = (b.body || "새 이상이 감지됐어요.").slice(0, 900);

  // 관리자 목록
  const { data: admins } = await sb.from("user_profiles").select("user_id").or("admin_flag.eq.true,role.eq.admin");
  const ids = (admins || []).map((a) => a.user_id).filter(Boolean);

  // 웹푸시
  let pushed = 0;
  if (ids.length) {
    const { data: subs } = await sb.from("push_subscriptions")
      .select("endpoint,p256dh,auth,user_id").in("user_id", ids).limit(200);
    await Promise.all((subs || []).map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify({ title, body, url: "/admin.html", tag: "bug-hunt" }),
        );
        pushed++;
      } catch (e) {
        const code = (e as { statusCode?: number })?.statusCode;
        if (code === 410 || code === 404) await sb.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
      }
    }));
  }

  // 이메일(Resend, 키 있을 때만)
  let emailed = false;
  const rk = Deno.env.get("RESEND_API_KEY");
  if (rk) {
    try {
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${rk}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: "GALLA 버그헌터 <no-reply@galla.im>",
          to: [Deno.env.get("BUG_ALERT_EMAIL") || "gallakorea@gmail.com"],
          subject: title,
          text: body + "\n\n— 관제센터: https://galla.im/admin.html",
        }),
      });
      emailed = r.ok;
    } catch (_) { emailed = false; }
  }

  return j({ ok: true, pushed, emailed, admins: ids.length });
});
