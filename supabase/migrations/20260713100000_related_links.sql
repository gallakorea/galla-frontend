-- 이슈에 수동 "관련 뉴스" 외부 링크 (jsonb 배열: {url,title,source,image})
alter table public.issues add column if not exists related_links jsonb not null default '[]'::jsonb;

-- 관리자 이슈 발행에 관련 뉴스 링크(p_links) 추가 (기존 7-arg 오버로드 제거 후 재정의)
drop function if exists public.admin_publish_issue(text,text,text,text,text,text,text);
create or replace function public.admin_publish_issue(
  p_title text, p_desc text default null, p_category text default '사회',
  p_one_line text default null, p_faction_a text default null, p_faction_b text default null,
  p_thumb text default null, p_links jsonb default '[]'::jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id bigint;
begin
  if not _is_admin() then return jsonb_build_object('ok',false,'reason','forbidden'); end if;
  if coalesce(btrim(p_title),'')='' then return jsonb_build_object('ok',false,'reason','no_title'); end if;
  insert into issues(user_id, title, description, category, one_line, faction_a, faction_b, thumbnail_url, author_stance, related_links)
    values (auth.uid(), left(p_title,140), p_desc, coalesce(p_category,'사회'),
            p_one_line, nullif(btrim(coalesce(p_faction_a,'')),''), nullif(btrim(coalesce(p_faction_b,'')),''),
            nullif(btrim(coalesce(p_thumb,'')),''), 'pro',
            coalesce(p_links, '[]'::jsonb))
    returning id into v_id;
  perform _admin_log('publish_issue', v_id::text, null);
  return jsonb_build_object('ok',true,'id',v_id);
end $$;

grant execute on function public.admin_publish_issue(text,text,text,text,text,text,text,jsonb) to authenticated;
