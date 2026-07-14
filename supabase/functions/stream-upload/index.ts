// 대용량 영상을 Cloudflare Stream으로 "직접 재개가능(tus) 업로드"하기 위한 일회용 업로드 URL 발급.
// 클라이언트가 이 URL로 청크를 PATCH 업로드 → R2 경유 없이, 네트워크가 끊겨도 이어서 재개.
// (기존 R2 단일 PUT + stream-ingest 복사 방식은 대용량/모바일에서 실패·이중전송 문제가 있었음)
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CF_ACCOUNT = Deno.env.get("CF_STREAM_ACCOUNT")!;
const CF_TOKEN = Deno.env.get("CF_STREAM_TOKEN")!;
const CF_SUBDOMAIN = Deno.env.get("CF_STREAM_SUBDOMAIN")!; // customer-xxxx.cloudflarestream.com

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
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

    const { size, name } = await req.json();
    const uploadLength = Number(size);
    if (!uploadLength || uploadLength <= 0) return json({ error: "missing size" }, 400);
    // 최대 6GB 가드 (Stream 계정 한도 내)
    if (uploadLength > 6 * 1024 * 1024 * 1024) return json({ error: "too_large" }, 413);

    // Upload-Metadata: "key base64value,key2 base64value2" — name만 설정(공개)
    const b64 = btoa(unescape(encodeURIComponent(name || `galla-${user.id}`)));
    const meta = `name ${b64}`;

    // direct_user=true → 인증 없이 클라이언트가 PATCH할 수 있는 일회용 tus 업로드 URL
    const cfRes = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT}/stream?direct_user=true`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${CF_TOKEN}`,
          "Tus-Resumable": "1.0.0",
          "Upload-Length": String(uploadLength),
          "Upload-Metadata": meta,
        },
      }
    );
    if (cfRes.status !== 201) {
      const detail = await cfRes.text().catch(() => "");
      return json({ error: "stream_create_failed", status: cfRes.status, detail }, 502);
    }
    const uploadURL = cfRes.headers.get("Location");
    const uid = cfRes.headers.get("stream-media-id");
    if (!uploadURL || !uid) return json({ error: "no_upload_url" }, 502);

    return json({
      uploadURL,
      uid,
      hls: `https://${CF_SUBDOMAIN}/${uid}/manifest/video.m3u8`,
      thumbnail: `https://${CF_SUBDOMAIN}/${uid}/thumbnails/thumbnail.jpg`,
    });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
