// 📨 회사 소개 사이트 문의 → 메일 발송. company_inquiries INSERT 트리거가 부른다.
// 의존성 없음(fetch 만). verify_jwt=false, 공유 시크릿(INQUIRY_SECRET)으로 자체 인증.
// ⚠️ RESEND_API_KEY 가 없으면 조용히 건너뛴다 — 접수 행은 이미 DB 에 있으므로 유실은 없다.
const j = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return j({ error: "method" }, 405);
  if ((req.headers.get("x-inq-secret") || "") !== (Deno.env.get("INQUIRY_SECRET") || " "))
    return j({ error: "forbidden" }, 401);

  let b: Record<string, string>;
  try { b = await req.json(); } catch { return j({ error: "bad json" }, 400); }

  const kind  = (b.kind  || "문의").slice(0, 40);
  const name  = (b.name  || "").slice(0, 120);
  const email = (b.email || "").slice(0, 200);
  const body  = (b.body  || "").slice(0, 4000);

  const rk = Deno.env.get("RESEND_API_KEY");
  if (!rk) return j({ ok: true, mail: "no_key" });

  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${rk}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "갈라랩스 문의 <no-reply@galla.im>",
        to: [Deno.env.get("INQUIRY_EMAIL") || "gallakorea@gmail.com"],
        reply_to: email || undefined,
        subject: `[갈라랩스 문의 · ${kind}] ${name}`,
        text: `유형: ${kind}\n성함: ${name}\n회신: ${email}\n\n${body}\n\n— company.galla.im`,
      }),
    });
    return j({ ok: r.ok, mail: r.status });
  } catch (e) {
    return j({ ok: false, mail: String(e).slice(0, 160) }, 200);
  }
});
