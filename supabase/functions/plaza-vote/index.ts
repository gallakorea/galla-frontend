import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.112.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  try {
    // ✅ PRE-FLIGHT
    if (req.method === "OPTIONS") {
      return new Response("ok", {
        status: 200,
        headers: corsHeaders,
      });
    }

    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "Method not allowed" }),
        { status: 405, headers: corsHeaders }
      );
    }

    const { post_id, vote } = await req.json();

    if (!post_id) {
      return new Response(
        JSON.stringify({ error: "post_id missing" }),
        { status: 400, headers: corsHeaders }
      );
    }

    const authHeader = req.headers.get("authorization");

    let user_id: string | null = null;

    if (authHeader) {
      const anon = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        {
          global: {
            headers: { Authorization: authHeader },
          },
        }
      );

      const { data } = await anon.auth.getUser();
      user_id = data?.user?.id ?? null;
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    let oldVote = 0;
    let newVote = 0;

    if (vote !== undefined) {
      if (!user_id) {
        return new Response(
          JSON.stringify({ error: "login required" }),
          { status: 401, headers: corsHeaders }
        );
      }

      const { data: existing } = await admin
        .from("plaza_votes")
        .select("vote")
        .eq("post_id", post_id)
        .eq("user_id", user_id)
        .maybeSingle();

      oldVote = existing?.vote ?? 0;
      newVote = vote;

      if (!existing) {
        await admin.from("plaza_votes").insert({
          post_id,
          user_id,
          vote: newVote,
        });
      } else if (oldVote !== newVote) {
        await admin
          .from("plaza_votes")
          .update({ vote: newVote })
          .eq("post_id", post_id)
          .eq("user_id", user_id);
      }
    }

    const { data: votes } = await admin
      .from("plaza_votes")
      .select("vote, user_id")
      .eq("post_id", post_id);

    const score = votes?.reduce((s, v) => s + v.vote, 0) ?? 0;
    const my_vote =
      user_id
        ? votes?.find(v => v.user_id === user_id)?.vote ?? 0
        : 0;

    return new Response(
      JSON.stringify({
        ok: true,
        post_id,
        score,
        my_vote,
      }),
      { status: 200, headers: corsHeaders }
    );

  } catch (e) {
    // ❗❗ 여기 매우 중요
    return new Response(
      JSON.stringify({ error: String(e) }),
      { status: 500, headers: corsHeaders }
    );
  }
});