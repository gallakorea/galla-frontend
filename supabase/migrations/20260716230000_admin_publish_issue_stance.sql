-- =========================================================
-- admin_publish_issue: 작성자 입장(찬성/반대) 선택 인자 추가 (2026-07-16)
-- 기존 'pro' 하드코딩 → p_stance('pro'|'con', 기본 'pro')로 관리자가 선택.
-- =========================================================
drop function if exists public.admin_publish_issue(text,text,text,text,text,text,text,jsonb,text,jsonb,text,text);

create or replace function public.admin_publish_issue(
  p_title text,
  p_desc text default null,
  p_category text default '사회',
  p_one_line text default null,
  p_faction_a text default null,
  p_faction_b text default null,
  p_thumb text default null,
  p_links jsonb default '[]'::jsonb,
  p_video text default null,
  p_images jsonb default '[]'::jsonb,
  p_card_thumb text default null,
  p_donation text default null,
  p_stance text default 'pro'
) returns jsonb
language plpgsql security definer set search_path to 'public' as $function$
declare v_id bigint; v_imgs jsonb; v_stance text;
begin
  if not _is_admin() then return jsonb_build_object('ok',false,'reason','forbidden'); end if;
  if coalesce(btrim(p_title),'')='' then return jsonb_build_object('ok',false,'reason','no_title'); end if;
  v_imgs := case when p_images is null or jsonb_typeof(p_images)<>'array' or jsonb_array_length(p_images)=0
                 then null else p_images end;
  v_stance := case when lower(coalesce(p_stance,'pro'))='con' then 'con' else 'pro' end;
  insert into issues(user_id, title, description, category, one_line, faction_a, faction_b,
                     thumbnail_url, video_url, images, card_thumb_url, donation_target,
                     author_stance, related_links)
    values (auth.uid(), left(p_title,140), p_desc, coalesce(p_category,'사회'),
            p_one_line,
            nullif(btrim(coalesce(p_faction_a,'')),''), nullif(btrim(coalesce(p_faction_b,'')),''),
            nullif(btrim(coalesce(p_thumb,'')),''),
            nullif(btrim(coalesce(p_video,'')),''),
            v_imgs,
            nullif(btrim(coalesce(p_card_thumb,'')),''),
            nullif(btrim(coalesce(p_donation,'')),''),
            v_stance,
            coalesce(p_links,'[]'::jsonb))
    returning id into v_id;
  perform _admin_log('publish_issue', v_id::text, null);
  return jsonb_build_object('ok',true,'id',v_id);
end $function$;

revoke all on function public.admin_publish_issue(text,text,text,text,text,text,text,jsonb,text,jsonb,text,text,text) from public, anon;
grant execute on function public.admin_publish_issue(text,text,text,text,text,text,text,jsonb,text,jsonb,text,text,text) to authenticated;
