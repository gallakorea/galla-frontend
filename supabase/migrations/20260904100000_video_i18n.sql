-- 영상 설명의 **번역본**을 같이 보관한다. 원문에 없는 주소·메뉴가 거기 들어 있다.
--
-- 실측 2026-09-04 (채널당 최근 50편, 설명에 한국어 주소가 없는 것만):
--   먹을텐데  번역 50/50 · 원문보다 긴 번역 87건
--     [Mie Dangke Olle] Mie Dangke Olle, 4 Pyoseondangpo-ro, Pyoseon-myeon, Seogwipo-si, Jeju
--     → 한국어 설명엔 없는 **완전한 주소**가 인도네시아어 번역에 있다.
--   입짧은햇님 영어 번역에 'Apple Cinnamon Gelato Cup 5,000 won' 처럼 **메뉴·가격**까지 있다.
--   또간집   한국어는 '#또간집 #풍자 #사직야구장' 인데 영어는 '#Busan #Sajik' — 지역이 영어에만.
--
-- ⚠️ 내가 처음에 "번역에 주소 없음"이라고 보고한 건 틀렸다. **한국어 주소 정규식으로만** 재서
--    'Seogwipo-si'·'Pyoseondangpo-ro' 같은 로마자를 통째로 못 잡았다. 표본도 3편뿐이었다.
alter table food_videos add column if not exists desc_i18n text;
alter table food_videos add column if not exists i18n_at timestamptz;

-- 주소 신호: 한국어 도로명 **또는** 로마자(-ro/-gil/-si/-gun/-gu/-dong/-myeon/-eup, 광역시명)
create or replace function food_has_addr(t text) returns boolean
language sql immutable as $$
  select coalesce(t,'') ~ '[가-힣]+(시|군|구)\s*[가-힣0-9]+(로|길)\s*[0-9]'
      or coalesce(t,'') ~ '[A-Za-z]+-(ro|gil|dong|gu|si|gun|eup|myeon)\M'
      or coalesce(t,'') ~ '\m(Seoul|Busan|Daegu|Incheon|Gwangju|Daejeon|Ulsan|Jeju|Gyeonggi)\M';
$$;

-- 번역을 아직 안 받아온 영상을 집어준다(50편씩 = videos.list 1유닛)
create or replace function food_videos_need_i18n(p_channel text default null, p_limit int default 50)
returns table(video_id text) language sql stable security definer set search_path to 'public' as $$
  select v.video_id from food_videos v
   where v.i18n_at is null
     and (p_channel is null or v.channel = p_channel)
     /* 원문에 이미 주소가 있으면 번역이 없어도 수확된다 — 없는 것부터 채운다 */
     and not food_has_addr(v.description)
   order by v.published_at desc nulls last
   limit greatest(coalesce(p_limit,50),1);
$$;

create or replace function food_video_i18n_set(p_rows jsonb)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare r jsonb; n int := 0; hit int := 0;
begin
  for r in select * from jsonb_array_elements(coalesce(p_rows,'[]'::jsonb)) loop
    update food_videos
       set desc_i18n = nullif(btrim(coalesce(r->>'text','')), ''),
           i18n_at = now()
     where video_id = r->>'video_id';
    n := n + 1;
    if food_has_addr(r->>'text') then hit := hit + 1; end if;
  end loop;
  return jsonb_build_object('ok', true, 'saved', n, 'withAddr', hit);
end $$;

-- 수확 대상: 원문 **또는 번역**에 주소가 있으면 잡는다
create or replace function food_videos_to_harvest(p_channel text, p_limit integer default 20)
returns table(video_id text, title text, description text, published_at timestamptz)
language sql stable security definer set search_path to 'public' as $$
  select v.video_id, v.title,
         /* 번역을 원문 뒤에 붙여 LLM 에 같이 준다 — 주소·메뉴가 거기 있을 수 있다 */
         btrim(coalesce(v.description,'') ||
               case when v.desc_i18n is not null then E'\n\n[번역]\n' || v.desc_i18n else '' end),
         v.published_at
    from food_videos v
   where v.channel = p_channel
     and v.harvested_at is null
     and (food_has_addr(v.description) or food_has_addr(v.desc_i18n))
   order by v.published_at desc nulls last
   limit greatest(coalesce(p_limit, 20), 1);
$$;

revoke all on function food_videos_need_i18n(text,int) from public, anon, authenticated;
revoke all on function food_video_i18n_set(jsonb)      from public, anon, authenticated;
grant execute on function food_videos_need_i18n(text,int) to service_role;
grant execute on function food_video_i18n_set(jsonb)      to service_role;
