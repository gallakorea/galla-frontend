-- 🎫 이용권에 커뮤니티 혜택 얹기 (2026-08-09)
--
--  문제: 이용권 혜택이 AI 일색이라 **여론·배틀 유저는 살 이유가 없다.** 갈라 유저의
--  다수가 그쪽인데 구독 상품이 창작자 전용처럼 보인다. 구독자 0명인 지금이 고칠 때다.
--
--  원칙: 얹는 혜택은 **밸런스와 무관한 것만.** 방패·부활 지급, 전투 보정, 진영 가중치는
--  절대 넣지 마라 — pay-to-win이고, 여론 플랫폼에서 그건 사행성보다 더 치명적이다.
--  '보이는 것'(배지·꾸미기)과 '편한 것'(통계·용량)만 준다.

-- ─── 1) 등급별 커뮤니티 혜택 플래그
--     badge         : 댓글·프로필 이름 옆 구독자 배지
--     nickstyle_all : 프리미엄 닉네임 스타일을 구매 없이 장착 (구독 끊기면 자동 해제)
--     stats         : 내 글 유입·조회 추이
update public.app_settings
   set v = jsonb_set(v, '{lite,features}',   (v #> '{lite,features}')   || '["badge","nickstyle_all"]'::jsonb)
 where k = 'ai_tiers';
update public.app_settings
   set v = jsonb_set(v, '{friend,features}', (v #> '{friend,features}') || '["badge","nickstyle_all","stats"]'::jsonb)
 where k = 'ai_tiers';
update public.app_settings
   set v = jsonb_set(v, '{pro,features}',    (v #> '{pro,features}')    || '["badge","nickstyle_all","stats"]'::jsonb)
 where k = 'ai_tiers';

-- ─── 2) 배지용 공개 등급 조회 (배치)
--  ⚠️ subscriptions는 본인 것만 SELECT 가능하다(subs_self_read). 배지는 남의 것도 봐야 하므로
--     **등급 문자열만** 돌려주는 전용 RPC를 연다. 만료일·결제수단·금액은 절대 노출하지 않는다.
--     무료/게스트는 아예 결과에 넣지 않는다 — "이 사람은 무과금"이라는 정보도 흘리지 않는다.
create or replace function public.tiers_of(p_uids uuid[])
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select coalesce(jsonb_object_agg(s.user_id, s.tier), '{}'::jsonb)
    from subscriptions s
   where s.user_id = any(p_uids)
     and s.expires_at > now()
     and s.tier in ('lite','friend','pro');
$$;
grant execute on function public.tiers_of(uuid[]) to anon, authenticated;

-- ─── 3) 구독자는 프리미엄 닉네임 스타일을 구매 없이 장착
--  ⚠️ '소유'를 주지 않고 '장착 권한'만 준다. 구독이 끝나면 자동으로 못 쓰게 되어야 하는데,
--     user_nickstyles에 행을 심어버리면 영구 소유가 되어 되돌릴 수 없다.
create or replace function public.equip_nickstyle(p_key text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_user uuid := auth.uid(); v_name text; v_price int; v_sub boolean;
begin
  if v_user is null then return jsonb_build_object('ok',false,'reason','unauthorized'); end if;
  if p_key is null or p_key = 'none' then
    -- '기본'은 명시값 'none'으로 저장 — null이면 도색기가 골드(nick_gold) 폴백과
    -- 구분을 못 해 골드 구매자는 기본을 영원히 못 고른다(사장님 재현 버그)
    insert into user_cosmetics(user_id, nick_style) values (v_user, 'none')
      on conflict (user_id) do update set nick_style='none', updated_at=now();
    return jsonb_build_object('ok',true,'style','none');
  end if;
  select name, price into v_name, v_price from _nickstyle_info(p_key);
  if v_name is null then return jsonb_build_object('ok',false,'reason','bad_key'); end if;

  -- 🎫 이용권(라이트 이상) 보유자는 전 스타일 장착 가능
  v_sub := coalesce((select v -> tier_of(v_user) -> 'features' from app_settings where k='ai_tiers')
                    ? 'nickstyle_all', false);

  if v_price > 0 and not v_sub
     and not exists (select 1 from user_nickstyles where user_id=v_user and style_key=p_key) then
    return jsonb_build_object('ok',false,'reason','not_owned'); end if;
  insert into user_cosmetics(user_id, nick_style) values (v_user, p_key)
    on conflict (user_id) do update set nick_style=p_key, updated_at=now();
  return jsonb_build_object('ok',true,'style',p_key,'by_sub',v_sub);
end $$;

-- ─── 4) 구독이 끝난 사람의 '빌려 쓰던' 스타일은 도색 단계에서 걸러야 한다.
--     실제 소유(user_nickstyles)가 없고 구독도 없으면 기본으로 보이게 하는 판정 함수.
create or replace function public.nickstyle_effective(p_uid uuid)
returns text language sql stable security definer set search_path to 'public' as $$
  select case
    when c.nick_style is null or c.nick_style = 'none' then c.nick_style
    when exists (select 1 from user_nickstyles n where n.user_id=p_uid and n.style_key=c.nick_style) then c.nick_style
    when coalesce((select v -> tier_of(p_uid) -> 'features' from app_settings where k='ai_tiers')
                  ? 'nickstyle_all', false) then c.nick_style
    else null                      -- 구독 만료 + 미소유 → 기본으로
  end
  from user_cosmetics c where c.user_id = p_uid;
$$;
grant execute on function public.nickstyle_effective(uuid) to anon, authenticated;
