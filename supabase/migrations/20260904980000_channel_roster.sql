-- 맛집 크리에이터 명단 정리 + 수확 큐 순서 — 실측(2026-09-04) 기반.
--
-- 【실측】 수확 시도 5,667편 중 성공 2,186편(38.6%). 그런데 채널별로 갈렸다:
--   A 60%+  7채널 1,627시도 → 1,199성공   (윤호찌·대구형제·김사원세끼·상해기·공간탐닉·정육왕·식객허영만)
--   B 25-60% 6채널 1,934시도 →   808성공   (야식이·임해장·먹을텐데·백종원·한국인의밥상·맛상무)
--   C 1-25%  3채널 1,106시도 →    61성공   (입짧은햇님·쯔양·히밥)
--   D 0%     8채널 1,160시도 →     0성공
--
-- D 는 매칭 실패가 아니다. **가게에 안 가는 채널**이다:
--   또리네가족 = 육아 브이로그(음식 채널도 아니다), 홍유·소유·문복희·떵개떵 = 스튜디오 ASMR 먹방,
--   츄더 = 자취요리 브이로그, 나름 = 육아 브이로그로 전향.
--   설명이 부실해서가 아니다 — 홍유는 설명 평균 359자인데 0%, 윤호찌는 185자인데 62%.
--   → 명단에서 내린다. 명단 실수지 기술 문제가 아니다.
--
-- 또간집·맛있는 녀석들은 **진짜 맛집 프로**인데 0% 다. 업로드가 쇼츠 위주고(또간집 700편 중
-- 226편이 쇼츠, 611편이 설명 40자 미만) 가게 이름을 설명에 안 적는다. 브랜드는 남기되
-- 수확 큐에서만 뺀다 — 그래서 active 가 아니라 harvest 로 나눈다.

alter table food_channels add column if not exists harvest boolean not null default true;
comment on column food_channels.harvest is
  '영상 수확 대상인가. active(=화면에 뜨는가)와 다르다. 가게에 안 가는 채널은 false.';

-- 🔴 잘못 박힌 yt_channel_id 를 비운다. 이름만 보고 팬·재업로드 채널을 잡았다.
--    이대로 두면 '누가 갔나'에 엉뚱한 채널이 뜬다.
update food_channels set yt_channel_id = null, active = false
 where slug in ('saengsaeng','sooyo','diningcode','baengnyeon');

-- 가게에 안 가는 채널 — 화면에서도 내린다
update food_channels set active = false, harvest = false
 where slug in ('ddorine','hongyu','soyou','moonbokhee','ddeonggae','chuder','nareum');

-- 맛집 프로지만 설명에 가게 이름이 없다 — 브랜드는 남기고 수확만 끈다
update food_channels set harvest = false where slug in ('ttoganjib','matnyeoseok');

-- 【큐 순서】 지금은 published_at desc 단일 정렬이라 **매일 올리는 채널이 큐를 독차지**했다.
--   실측: 미수확 8,839편 중 앞자리를 쇼츠 채널이 채우고, 부산촌놈·전현무계획·육식맨·풍자 등
--         9채널 880편은 단 한 번도 차례가 오지 않았다(시도 0).
--   → 채널별로 한 편씩 돌아가며 가져간다. 채널 수만큼 폭이 넓어져 편식이 사라진다.
create or replace function public.food_videos_to_harvest_title(p_limit integer default 20)
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select coalesce(jsonb_agg(x order by rn, published_at desc), '[]'::jsonb) from (
    select row_number() over (partition by v.channel order by v.published_at desc nulls last) rn,
           v.published_at,
           jsonb_build_object(
             'video_id', v.video_id,
             'title', v.title,
             'channel', v.channel,
             'published_at', v.published_at,
             'description', left(
               coalesce(v.description, '')
               || case when v.desc_i18n is not null then E'\n\n[번역]\n' || v.desc_i18n else '' end
               || case when v.tags is not null      then E'\n\n[태그] '  || v.tags      else '' end,
               2600)
           ) x
      from food_videos v
      join food_channels c on c.slug = v.channel and c.harvest
     where v.harvested_at is null
       and length(coalesce(v.title, '')) >= 6
     order by rn, v.published_at desc nulls last
     limit greatest(coalesce(p_limit, 20), 1)
  ) q;
$$;
