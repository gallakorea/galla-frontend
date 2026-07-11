import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { AwsClient } from "https://esm.sh/aws4fetch@1.0.20";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CF_ACCOUNT_ID = Deno.env.get("CF_ACCOUNT_ID")!;
const R2_ACCESS_KEY_ID = Deno.env.get("R2_ACCESS_KEY_ID")!;
const R2_SECRET = Deno.env.get("R2_SECRET_ACCESS_KEY")!;
const R2_BUCKET = Deno.env.get("R2_BUCKET")!;
const R2_PUBLIC_URL = Deno.env.get("R2_PUBLIC_URL")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info, x-upload-mode, x-upload-kind, x-upload-filename",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ALLOWED_IMAGE = ["jpg", "jpeg", "png", "gif", "webp", "avif", "heic"];
const ALLOWED_VIDEO = ["mp4", "mov", "webm", "m4v"];

const r2 = new AwsClient({
  accessKeyId: R2_ACCESS_KEY_ID,
  secretAccessKey: R2_SECRET,
  service: "s3",
  region: "auto",
});

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "unauthorized" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return json({ error: "unauthorized" }, 401);

    // 프록시 모드: 파일 바이트를 직접 받아 서버에서 R2로 PUT
    // (브라우저 → R2 직접 업로드가 CORS로 막힌 오리진에서의 폴백 경로)
    const isProxy = req.headers.get("x-upload-mode") === "proxy";

    let kind: string, filename: string, contentType: string;
    if (isProxy) {
      kind = req.headers.get("x-upload-kind") || "";
      filename = req.headers.get("x-upload-filename") || "";
      contentType = req.headers.get("content-type") || "application/octet-stream";
    } else {
      ({ kind, filename, contentType } = await req.json());
    }

    if (kind !== "image" && kind !== "video") {
      return json({ error: "invalid kind" }, 400);
    }

    const ext = (filename?.split(".").pop() || "bin").toLowerCase();
    const allowed = kind === "image" ? ALLOWED_IMAGE : ALLOWED_VIDEO;
    if (!allowed.includes(ext)) {
      return json({ error: `unsupported ${kind} type: ${ext}` }, 400);
    }

    const key = `${kind}s/${user.id}/${crypto.randomUUID()}.${ext}`;
    const url = `https://${CF_ACCOUNT_ID}.r2.cloudflarestorage.com/${R2_BUCKET}/${key}`;

    if (isProxy) {
      const body = new Uint8Array(await req.arrayBuffer());
      const putRes = await r2.fetch(url, {
        method: "PUT",
        headers: { "content-type": contentType },
        body,
      });
      if (!putRes.ok) {
        return json({ error: `r2_put_failed_${putRes.status}` }, 502);
      }
      return json({ kind, publicUrl: `${R2_PUBLIC_URL}/${key}` });
    }

    const signed = await r2.sign(
      new Request(url, { method: "PUT", headers: { "content-type": contentType } }),
      { aws: { signQuery: true }, expiresIn: 3600 }
    );
    return json({
      kind,
      uploadUrl: signed.url,
      method: "PUT",
      headers: { "content-type": contentType },
      publicUrl: `${R2_PUBLIC_URL}/${key}`,
    });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
