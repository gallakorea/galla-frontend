-- 26.9.24 애플 Guideline 1.2 — 익명(유령) 댓글 작성자도 차단 가능하게.
-- 익명 댓글은 클라이언트에 user_id 가 안 내려가(null) 차단이 안 됐다. 서버가 숨은 실
-- user_id 를 찾아 user_blocks 에 넣어 차단한다(클라이언트엔 id 를 노출하지 않음 → 익명 유지).
create or replace function public.block_comment_author(p_table text, p_id bigint)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_uid uuid; v_me uuid := auth.uid(); v_allowed text[] := array[
  'comments','food_comments','galla_news_comments','market_comments','plaza_comments',
  'post_comments','travel_comments','video_comments','weather_comments'];
begin
  if v_me is null then return jsonb_build_object('ok',false,'reason','auth'); end if;
  if not (p_table = any(v_allowed)) then return jsonb_build_object('ok',false,'reason','bad_table'); end if;
  execute format('select user_id from public.%I where id = $1', p_table) into v_uid using p_id;
  if v_uid is null then return jsonb_build_object('ok',false,'reason','not_found'); end if;
  if v_uid = v_me then return jsonb_build_object('ok',false,'reason','self'); end if;
  insert into user_blocks(blocker_id, blocked_id) values (v_me, v_uid)
    on conflict (blocker_id, blocked_id) do nothing;
  return jsonb_build_object('ok',true);  -- v_uid 는 절대 반환하지 않는다(익명 보호)
end $$;

revoke execute on function public.block_comment_author(text,bigint) from anon, public;
grant execute on function public.block_comment_author(text,bigint) to authenticated;
