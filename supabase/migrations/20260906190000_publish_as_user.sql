-- 🎭 발행 계정 지정 — 관리자가 콘텐츠 계정(예: '재밌는영상') 이름으로 발행한다.
-- 관리자 콘솔의 글이 전부 관리자 개인 계정으로 나가면, 채널 성격의 계정을 운영할 수 없다.
--
-- ⚠️ 남의 이름으로 글을 쓰는 기능이다. 게이트는 두 겹으로 둔다:
--    ① _is_admin() 통과한 호출자만
--    ② 실제 존재하는 계정만(오타로 유령 user_id 가 박히면 글이 주인 없이 뜬다)
--    그리고 누가 누구 이름으로 썼는지 _admin_log 에 반드시 남긴다.
-- ⚠️ 파라미터를 더하면 create or replace 는 '교체'가 아니라 '새 오버로드'를 만든다.
--    (직전 마이그레이션에서 통합해 놓고 여기서 똑같이 다시 갈라뜨렸다.)
--    새 것을 만들기 전에 옛 시그니처를 먼저 지운다.
drop function if exists public.admin_publish_post(text,text,text,jsonb,text,text,text[],jsonb,text);

create or replace function public.admin_publish_post(
  p_kind text,
  p_title text default null,
  p_caption text default null,
  p_images jsonb default null,
  p_video text default null,
  p_thumbnail text default null,
  p_tags text[] default null,
  p_media jsonb default null,
  p_link text default null,
  p_as_user uuid default null
) returns jsonb
language plpgsql security definer set search_path to 'public'
as $function$
declare v_id bigint; v_kind text; v_imgs jsonb; v_media jsonb; v_tags text[]; v_link text; v_author uuid;
begin
  if not _is_admin() then return jsonb_build_object('ok',false,'reason','forbidden'); end if;

  v_author := coalesce(p_as_user, auth.uid());
  if p_as_user is not null and not exists (select 1 from users u where u.id = p_as_user) then
    return jsonb_build_object('ok',false,'reason','no_such_user');
  end if;

  v_kind := case when lower(coalesce(p_kind,'vertical'))='horizontal' then 'horizontal' else 'vertical' end;
  v_imgs := case when p_images is null or jsonb_typeof(p_images)<>'array' or jsonb_array_length(p_images)=0 then null else p_images end;
  v_media := case when p_media is null or jsonb_typeof(p_media)<>'array' or jsonb_array_length(p_media)=0 then null else p_media end;
  v_tags := case when p_tags is null or array_length(p_tags,1) is null then null else p_tags end;
  v_link := nullif(btrim(coalesce(p_link,'')),'');
  if v_link is not null and v_link !~* '^https?://' then
    return jsonb_build_object('ok',false,'reason','bad_link');
  end if;

  if v_kind='horizontal' and coalesce(btrim(p_title),'')='' then
    return jsonb_build_object('ok',false,'reason','no_title');
  end if;
  if v_link is null and v_imgs is null and v_media is null and coalesce(btrim(p_video),'')='' then
    return jsonb_build_object('ok',false,'reason','no_media');
  end if;

  insert into posts(user_id, kind, title, caption, images, media, video_url, thumbnail_url, tags,
                    link_url, is_published, moderation_status)
    values (v_author, v_kind,
            nullif(btrim(coalesce(p_title,'')),''), nullif(btrim(coalesce(p_caption,'')),''),
            v_imgs, v_media, nullif(btrim(coalesce(p_video,'')),''), nullif(btrim(coalesce(p_thumbnail,'')),''),
            v_tags, v_link, true, 'approved')
    returning id into v_id;

  begin
    perform _admin_log('publish_post', v_id::text,
      case when p_as_user is null then null else 'as_user=' || p_as_user::text end);
  exception when others then null; end;
  return jsonb_build_object('ok',true,'id',v_id,'author',v_author);
end $function$;

-- 🔎 닉네임 → user_id (관리자 전용). 발행 계정을 닉네임으로 고르기 위한 최소 조회.
-- users 테이블을 관리자에게 통째로 열지 않기 위해 이 함수 하나만 둔다.
create or replace function public.admin_user_by_nickname(p_nickname text)
returns jsonb
language plpgsql security definer set search_path to 'public'
as $function$
declare r record;
begin
  if not _is_admin() then return jsonb_build_object('ok',false,'reason','forbidden'); end if;
  select u.id, u.nickname, u.avatar_url into r
    from users u where lower(btrim(u.nickname)) = lower(btrim(p_nickname)) limit 1;
  if r.id is null then return jsonb_build_object('ok',false,'reason','not_found'); end if;
  return jsonb_build_object('ok',true,'id',r.id,'nickname',r.nickname,'avatar_url',r.avatar_url);
end $function$;
