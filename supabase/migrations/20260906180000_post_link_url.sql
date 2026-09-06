-- 🔗 링크 발행 — 원본을 내려받아 재업로드하는 대신, 원본으로 보내는 링크 카드로 낸다.
-- posts.link_url 이 있으면 그 글은 '링크 카드'다: 영상 파일을 R2 에 복사하지 않고
-- 썸네일(OG 이미지)과 원본 URL 만 갖는다. 조회는 원작자에게 간다.
alter table public.posts add column if not exists link_url text;
comment on column public.posts.link_url is
  '외부 원본 링크(인스타·틱톡 등). 있으면 이 글은 재업로드가 아니라 원본으로 보내는 링크 카드다.';

-- ⚠️ admin_publish_post 는 오버로드가 2개(7인자·8인자)로 갈라져 있었다. 여기에 p_link 를
--    더하면 3개가 되어 PostgREST 가 후보를 못 고른다(PGRST203). 하나로 합친다.
drop function if exists public.admin_publish_post(text,text,text,jsonb,text,text,text[]);
drop function if exists public.admin_publish_post(text,text,text,jsonb,text,text,text[],jsonb);

create or replace function public.admin_publish_post(
  p_kind text,
  p_title text default null,
  p_caption text default null,
  p_images jsonb default null,
  p_video text default null,
  p_thumbnail text default null,
  p_tags text[] default null,
  p_media jsonb default null,
  p_link text default null
) returns jsonb
language plpgsql security definer set search_path to 'public'
as $function$
declare v_id bigint; v_kind text; v_imgs jsonb; v_media jsonb; v_tags text[]; v_link text;
begin
  if not _is_admin() then return jsonb_build_object('ok',false,'reason','forbidden'); end if;
  v_kind := case when lower(coalesce(p_kind,'vertical'))='horizontal' then 'horizontal' else 'vertical' end;
  v_imgs := case when p_images is null or jsonb_typeof(p_images)<>'array' or jsonb_array_length(p_images)=0 then null else p_images end;
  v_media := case when p_media is null or jsonb_typeof(p_media)<>'array' or jsonb_array_length(p_media)=0 then null else p_media end;
  v_tags := case when p_tags is null or array_length(p_tags,1) is null then null else p_tags end;
  -- 링크는 http(s) 만 받는다 — javascript: 같은 스킴이 카드에 박히면 그대로 클릭 유도가 된다
  v_link := nullif(btrim(coalesce(p_link,'')),'');
  if v_link is not null and v_link !~* '^https?://' then
    return jsonb_build_object('ok',false,'reason','bad_link');
  end if;

  if v_kind='horizontal' and coalesce(btrim(p_title),'')='' then
    return jsonb_build_object('ok',false,'reason','no_title');
  end if;
  -- 링크 카드는 미디어 파일이 없다 — 링크가 있으면 썸네일만으로 성립한다.
  if v_link is null and v_imgs is null and v_media is null and coalesce(btrim(p_video),'')='' then
    return jsonb_build_object('ok',false,'reason','no_media');
  end if;

  insert into posts(user_id, kind, title, caption, images, media, video_url, thumbnail_url, tags,
                    link_url, is_published, moderation_status)
    values (auth.uid(), v_kind,
            nullif(btrim(coalesce(p_title,'')),''), nullif(btrim(coalesce(p_caption,'')),''),
            v_imgs, v_media, nullif(btrim(coalesce(p_video,'')),''), nullif(btrim(coalesce(p_thumbnail,'')),''),
            v_tags, v_link, true, 'approved')
    returning id into v_id;
  begin perform _admin_log('publish_post', v_id::text, null); exception when others then null; end;
  return jsonb_build_object('ok',true,'id',v_id);
end $function$;
