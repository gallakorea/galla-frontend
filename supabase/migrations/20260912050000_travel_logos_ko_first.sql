-- 여행 「누가 다녀갔나」 마무리 (2026-09-12 사장님 "추천 작업도 실행")
--
-- ① 로고 없던 3채널 — 'EB'·'KB' 글자로 떴다. yt_channel_id 는 이미 확정돼 있어 채널 페이지의
--    og:image(아바타)를 그대로 넣는다(API 쿼터 0). 채널명도 페이지 제목과 대조했다:
--      UCbeZPOz8uaHstEIbkqBOnGg = EBS 세계테마기행
--      UCFw4M1BJYYdN1YtS8SzlDzg = KBS 트래블-걸어서 세계속으로
--      UCXw1ddyrUmib3zmCmvSI1ow = More Best Ever Food Review Show
-- ② 맨 위 아바타 줄을 한국 채널 먼저 — 본문 줄(travel_browse)과 같은 순서 규칙.
--    예전엔 장소 수 순이라 Mark Wiens(영어권)가 1번이었다. 시트는 한국/해외로 묶여 있어 영향 없음.

update travel_channels set thumb = 'https://yt3.googleusercontent.com/s9JbLvTmFQuY-jP9R_2uRdkWz_YgEK3LYGLa5mdgldqhWnpGrLJMVJCgQOL_VCfBqb-T7_IWgA=s240-c-k-c0x00ffffff-no-rj'
 where slug = 'ebstheme' and yt_channel_id = 'UCbeZPOz8uaHstEIbkqBOnGg' and (thumb is null or thumb = '');
update travel_channels set thumb = 'https://yt3.googleusercontent.com/WxhBRYzV4BTnr6CBXVyxg6QZ-ZgGUo5zQiluYLX_Tlg-nAHPKfMEdJJqmZUE4HiC-ngM13f3Xw=s240-c-k-c0x00ffffff-no-rj'
 where slug = 'kbstravel' and yt_channel_id = 'UCFw4M1BJYYdN1YtS8SzlDzg' and (thumb is null or thumb = '');
update travel_channels set thumb = 'https://yt3.googleusercontent.com/v70bwrmGxhPGqaCNpnANpV8ql6kl01N1XETELwD10KjdTKz3xNH1o-PMaWhpGt8m0KAPO-S12Q=s240-c-k-c0x00ffffff-no-rj'
 where slug = 'bestever' and yt_channel_id = 'UCXw1ddyrUmib3zmCmvSI1ow' and (thumb is null or thumb = '');

create or replace function public.travel_channel_stats()
 returns jsonb
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select jsonb_build_object('ok', true, 'channels', coalesce(jsonb_agg(jsonb_build_object(
      'slug', c.slug, 'name', c.name, 'thumb', c.thumb, 'lang', c.lang, 'total', c.place_n
    ) order by (c.lang is distinct from 'ko'), c.place_n desc, c.slug), '[]'::jsonb))
  from travel_channels c
  where c.active and c.place_n > 0;
$function$;

grant execute on function public.travel_channel_stats() to anon, authenticated;
