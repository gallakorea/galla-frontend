// R2에 올라간 영상을 Cloudflare Stream으로 이관(copy-from-URL) → HLS URL 반환.
// 신규 업로드가 어댑티브 스트리밍(즉시 재생)이 되도록. 트랜스코딩은 비동기(수십 초~).
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

    const { url, name } = await req.json();
    if (!url || typeof url !== "string") return json({ error: "missing url" }, 400);

    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT}/stream/copy`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${CF_TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify({ url, meta: { name: name || `galla-${user.id}` }, requireSignedURLs: false }),
      }
    );
    const data = await res.json();
    if (!data.success) return json({ error: "stream_copy_failed", detail: data.errors }, 502);

    const uid = data.result.uid;
    return json({
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
