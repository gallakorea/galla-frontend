-- =========================================================
-- admin_publish_issue 확장 (2026-07-16) — 미디어(사진/영상/카드썸네일) + 기부처
-- 관리자 이슈 작성 고도화: 붙여넣기 자동파싱 + 파일 업로드본 URL을 그대로 발행.
-- 기존 8-arg 호출처(admin.js upIssue)는 이 커밋에서 새 시그니처로 함께 교체.
-- =========================================================
drop function if exists public.admin_publish_issue(text,text,text,text,text,text,text,jsonb);

create or replace function public.admin_publish_issue(
  p_title text,
  p_desc text default null,
  p_category text default '사회',
  p_one_line text default null,
  p_faction_a text default null,
  p_faction_b text default null,
  p_thumb text default null,          -- 메인 표시 이미지(첫 사진/영상썸네일)
  p_links jsonb default '[]'::jsonb,
  p_video text default null,          -- 영상 HLS URL
  p_images jsonb default '[]'::jsonb, -- 사진 URL 배열(캐러셀)
  p_card_thumb text default null,     -- 마이페이지/카드용 3:4 썸네일
  p_donation text default null        -- 기부처
) returns jsonb
language plpgsql security definer set search_path to 'public' as $function$
declare v_id bigint; v_imgs jsonb;
begin
  if not _is_admin() then return jsonb_build_object('ok',false,'reason','forbidden'); end if;
  if coalesce(btrim(p_title),'')='' then return jsonb_build_object('ok',false,'reason','no_title'); end if;
  v_imgs := case when p_images is null or jsonb_typeof(p_images)<>'array' or jsonb_array_length(p_images)=0
                 then null else p_images end;
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
            'pro',
            coalesce(p_links,'[]'::jsonb))
    returning id into v_id;
  perform _admin_log('publish_issue', v_id::text, null);
  return jsonb_build_object('ok',true,'id',v_id);
end $function$;

revoke all on function public.admin_publish_issue(text,text,text,text,text,text,text,jsonb,text,jsonb,text,text) from public, anon;
grant execute on function public.admin_publish_issue(text,text,text,text,text,text,text,jsonb,text,jsonb,text,text) to authenticated;
