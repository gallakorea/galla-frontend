-- 🛠 관제 — 콘텐츠 유형별 맞춤 발행 RPC (이슈/광장/뉴스). 마켓은 기존 create_market 재사용
drop function if exists public.admin_publish_issue(text, text, text);

-- 이슈: 제목/설명/카테고리/한줄요약/진영명/썸네일
create or replace function public.admin_publish_issue(
  p_title text, p_desc text default null, p_category text default '사회',
  p_one_line text default null, p_faction_a text default null, p_faction_b text default null, p_thumb text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id bigint;
begin
  if not _is_admin() then return jsonb_build_object('ok',false,'reason','forbidden'); end if;
  if coalesce(btrim(p_title),'')='' then return jsonb_build_object('ok',false,'reason','no_title'); end if;
  insert into issues(user_id, title, description, category, one_line, faction_a, faction_b, thumbnail_url, author_stance)
    values (auth.uid(), left(p_title,140), p_desc, coalesce(p_category,'사회'),
            p_one_line, nullif(btrim(coalesce(p_faction_a,'')),''), nullif(btrim(coalesce(p_faction_b,'')),''), nullif(btrim(coalesce(p_thumb,'')),''), 'pro')
    returning id into v_id;
  perform _admin_log('publish_issue', v_id::text, null);
  return jsonb_build_object('ok',true,'id',v_id);
end $$;

-- 광장: 제목/본문/카테고리/커버
create or replace function public.admin_publish_plaza(
  p_title text, p_body text, p_category text default '자유', p_cover text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_nick text;
begin
  if not _is_admin() then return jsonb_build_object('ok',false,'reason','forbidden'); end if;
  if coalesce(btrim(p_title),'')='' then return jsonb_build_object('ok',false,'reason','no_title'); end if;
  select nickname into v_nick from users where id=auth.uid();
  insert into plaza_posts(user_id, title, body, category, cover_image, nickname)
    values (auth.uid(), left(p_title,140), p_body, coalesce(p_category,'자유'),
            nullif(btrim(coalesce(p_cover,'')),''), coalesce(v_nick,'운영자'))
    returning id into v_id;
  perform _admin_log('publish_plaza', v_id::text, null);
  return jsonb_build_object('ok',true,'id',v_id);
end $$;

-- 뉴스: 제목/요약/본문/카테고리/대표이미지 (즉시 게시)
create or replace function public.admin_publish_news(
  p_title text, p_summary text, p_body text, p_category text default '사회', p_hero text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not _is_admin() then return jsonb_build_object('ok',false,'reason','forbidden'); end if;
  if coalesce(btrim(p_title),'')='' then return jsonb_build_object('ok',false,'reason','no_title'); end if;
  insert into galla_news(title, summary, body, category, hero_image, status, published_at, topic_key)
    values (left(p_title,200), p_summary, p_body, coalesce(p_category,'사회'),
            nullif(btrim(coalesce(p_hero,'')),''), 'published', now(), 'admin_'||extract(epoch from now())::bigint)
    returning id into v_id;
  perform _admin_log('publish_news', v_id::text, null);
  return jsonb_build_object('ok',true,'id',v_id);
end $$;

grant execute on function public.admin_publish_issue(text,text,text,text,text,text,text) to authenticated;
grant execute on function public.admin_publish_plaza(text,text,text,text)                to authenticated;
grant execute on function public.admin_publish_news(text,text,text,text,text)            to authenticated;
