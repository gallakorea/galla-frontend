// 🔑 운영용 R2 업로드 주소 발급 — 큰 파일(갈라톡 PC 설치본 등)을 우리 저장소(cdn.galla.im)에 직접 올릴 때 쓴다.
//   x-cron-secret 필수. 키는 desktop/ 아래만 허용(아무 데나 덮어쓰지 못하게). 15분짜리 서명 PUT 주소를 돌려준다.
//   (26.9.19: galla-desktop 저장소가 비공개라 깃허브 릴리스 주소는 일반 사용자에게 404 — 설치본을 R2 로 옮긴다)
import { AwsClient } from "https://esm.sh/aws4fetch@1.0.20";
const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";
const CF_ACCOUNT = Deno.env.get("CF_ACCOUNT_ID") || "";
const R2_BUCKET = Deno.env.get("R2_BUCKET") || "";
const R2_PUBLIC_URL = Deno.env.get("R2_PUBLIC_URL") || "";
const r2 = new AwsClient({
  accessKeyId: Deno.env.get("R2_ACCESS_KEY_ID") || "",
  secretAccessKey: Deno.env.get("R2_SECRET_ACCESS_KEY") || "",
  service: "s3", region: "auto",
});
const j = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json" } });
Deno.serve(async (req) => {
  if (!CRON_SECRET || req.headers.get("x-cron-secret") !== CRON_SECRET) return j({ ok: false, reason: "unauthorized" }, 401);
  const { key, type } = await req.json().catch(() => ({}));
  if (!/^desktop\/[A-Za-z0-9._-]{1,120}$/.test(String(key || ""))) return j({ ok: false, reason: "bad_key" }, 400);
  const url = new URL(`https://${CF_ACCOUNT}.r2.cloudflarestorage.com/${R2_BUCKET}/${key}`);
  url.searchParams.set("X-Amz-Expires", "900");
  const signed = await r2.sign(new Request(url, { method: "PUT", headers: { "content-type": type || "application/octet-stream" } }), { aws: { signQuery: true } });
  return j({ ok: true, put: signed.url, public: `${R2_PUBLIC_URL}/${key}` });
});
