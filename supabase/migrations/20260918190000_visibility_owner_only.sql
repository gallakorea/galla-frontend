-- 공개 범위(나만 보기) 전환은 작성자 본인만. 운영진이 남의 글을 '나만 보기'로 돌리면
-- 작성자만 보게 되어 뜻이 뒤틀린다(26.9.18 사장님: 내 글도 아닌데 나만 보기가 된다).
CREATE OR REPLACE FUNCTION public.set_content_visibility(p_kind text, p_id text, p_vis text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare me uuid := auth.uid(); n int;
begin
  if me is null then return jsonb_build_object('ok', false, 'reason', 'unauthorized'); end if;
  if p_vis not in ('public','private') then return jsonb_build_object('ok', false, 'reason', 'bad_vis'); end if;
  if p_kind = 'issue' then
    update issues set visibility = p_vis where id::text = p_id and user_id = me;
  elsif p_kind = 'plaza' then
    update plaza_posts set visibility = p_vis where id::text = p_id and user_id = me;
  elsif p_kind = 'post' then
    update posts set visibility = p_vis where id::text = p_id and user_id = me;
  else return jsonb_build_object('ok', false, 'reason', 'bad_kind'); end if;
  get diagnostics n = row_count;
  return jsonb_build_object('ok', n > 0, 'visibility', p_vis, 'reason', case when n = 0 then 'not_owner' end);
end $function$;
