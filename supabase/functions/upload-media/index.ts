import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { AwsClient } from "https://esm.sh/aws4fetch@1.0.20";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.112.4";

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
const ALLOWED_AUDIO = ["webm", "m4a", "mp4", "ogg", "mp3", "aac", "3gp", "3gpp"];   // 음성 메시지(MediaRecorder — 안드로이드는 3gp/aac로 떨어지기도)
// DM 파일 전송 — 문서·압축 위주. 실행형(exe/sh)·웹렌더형(html/svg, 공개 URL XSS)은 금지
const ALLOWED_FILE = ["pdf", "txt", "md", "csv", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "hwp", "hwpx", "zip", "7z", "key", "pages", "numbers"];

/* ⚠️ Content-Type 은 클라이언트를 믿지 않는다.
   예전엔 요청 본문의 contentType 을 그대로 R2 PUT 헤더에 실었다. 확장자 화이트리스트는
   있었지만, 브라우저는 확장자가 아니라 Content-Type 을 따른다 — `evil.png` 를
   `text/html` 로 올리면 cdn.galla.im 이 HTML 을 서빙한다(우리 도메인의 저장형 XSS·피싱).
   → 이미 통과한 확장자에서 서버가 직접 유도한다. 목록에 없으면 octet-stream. */
const MIME: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif",
  webp: "image/webp", avif: "image/avif", heic: "image/heic",
  mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm", m4v: "video/x-m4v",
  m4a: "audio/mp4", ogg: "audio/ogg", mp3: "audio/mpeg", aac: "audio/aac",
  "3gp": "video/3gpp", "3gpp": "video/3gpp",
  pdf: "application/pdf", txt: "text/plain", md: "text/plain", csv: "text/csv",
  doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint", pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  hwp: "application/x-hwp", hwpx: "application/x-hwpx", zip: "application/zip", "7z": "application/x-7z-compressed",
  key: "application/octet-stream", pages: "application/octet-stream", numbers: "application/octet-stream",
};

/* 종류별 용량 상한. 예전엔 상한이 아예 없어 프록시 경로가 무제한 arrayBuffer 를 받았다. */
const MAX_BYTES: Record<string, number> = {
  image: 20 * 1024 * 1024,
  video: 200 * 1024 * 1024,
  audio: 20 * 1024 * 1024,
  file: 30 * 1024 * 1024,
};

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

    if (kind !== "image" && kind !== "video" && kind !== "audio" && kind !== "file") {
      return json({ error: "invalid kind" }, 400);
    }

    const ext = (filename?.split(".").pop() || "bin").toLowerCase();
    const allowed = kind === "image" ? ALLOWED_IMAGE : kind === "audio" ? ALLOWED_AUDIO : kind === "file" ? ALLOWED_FILE : ALLOWED_VIDEO;
    if (!allowed.includes(ext)) {
      return json({ error: `unsupported ${kind} type: ${ext}` }, 400);
    }

    const key = `${kind}s/${user.id}/${crypto.randomUUID()}.${ext}`;
    const url = `https://${CF_ACCOUNT_ID}.r2.cloudflarestorage.com/${R2_BUCKET}/${key}`;
    // 랜덤 UUID 키라 내용이 절대 안 바뀜 → 1년 immutable 캐시. cdn.galla.im 엣지가 캐싱하도록 저장
    const CACHE = "public, max-age=31536000, immutable";

    // 🔒 클라이언트가 준 contentType 은 여기서 버린다(위 MIME 주석 참고).
    const safeType = MIME[ext] || "application/octet-stream";
    // 문서류는 브라우저에 렌더시키지 않고 내려받게 한다 — 예상 못 한 타입의 안전망.
    const disposition = kind === "file" ? "attachment" : undefined;
    const putHeaders: Record<string, string> = {
      "content-type": safeType,
      "cache-control": CACHE,
      ...(disposition ? { "content-disposition": disposition } : {}),
    };


    if (isProxy) {
      const body = new Uint8Array(await req.arrayBuffer());
      const cap = MAX_BYTES[kind] ?? MAX_BYTES.file;
      if (body.byteLength > cap) {
        return json({ error: `too_large`, max: cap, got: body.byteLength }, 413);
      }
      const putRes = await r2.fetch(url, {
        method: "PUT",
        headers: putHeaders,
        body,
      });
      if (!putRes.ok) {
        return json({ error: `r2_put_failed_${putRes.status}` }, 502);
      }
      return json({ kind, publicUrl: `${R2_PUBLIC_URL}/${key}` });
    }

    const signed = await r2.sign(
      new Request(url, { method: "PUT", headers: putHeaders }),
      { aws: { signQuery: true }, expiresIn: 3600 }
    );
    return json({
      kind,
      uploadUrl: signed.url,
      method: "PUT",
      // ⚠️ 서명에 넣은 헤더와 클라가 실제로 보낼 헤더가 다르면 R2 가 서명 불일치로 거부한다.
      //    그래서 서버가 정한 헤더를 그대로 돌려주고, 클라는 이걸 그대로 써야 한다.
      headers: putHeaders,
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
