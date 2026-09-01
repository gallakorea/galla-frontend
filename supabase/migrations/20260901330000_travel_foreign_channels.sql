-- 해외 여행 크리에이터 (2026-09-01) — 사장님: "번역 뒤져"
--
-- 실측이 이유다. 한국 여행 채널의 제목·설명은 지역 단위에서 멈춘다("방글라데시","에티오피아").
-- 반면 영어권 여행 채널은 설명란에 **다녀온 장소를 나열하는 관행**이 있다
-- (호텔·식당·투어 링크를 제휴 링크로 걸기 때문이다). 그게 우리에겐 공짜 원천이다.
-- 게다가 영문 표기라 OSM·위키데이터에 그대로 걸린다 — 한국어 음차의 매칭 손실이 없다.
--
-- 번역은 반대 방향으로 한다: 영문/현지 표기로 검증하고, **한국어 표기는 위키데이터 ko 라벨**
-- (없으면 LLM)로 만든다. 우리 유저가 읽는 건 한국어여야 한다.
--
-- ⚠️ 핸들(@…)만 넣는다. channels.list?forHandle = 1유닛이라 search.list(100유닛)의 1/100이다.
alter table public.travel_channels add column if not exists lang text not null default 'ko';
alter table public.travel_channels add column if not exists scope text not null default 'world';

insert into public.travel_channels (slug, name, kind, yt_handle, lang, sort, resolved, active) values
  ('drewbinsky',    'Drew Binsky',        'yt', '@DrewBinsky',      'en', 60, false, true),
  ('markwiens',     'Mark Wiens',         'yt', '@MarkWiens',       'en', 61, false, true),
  ('karaandnate',   'Kara and Nate',      'yt', '@KaraandNate',     'en', 62, false, true),
  ('lostleblanc',   'Lost LeBlanc',       'yt', '@LostLeBlanc',     'en', 63, false, true),
  ('abroadinjapan', 'Abroad in Japan',    'yt', '@AbroadinJapan',   'en', 64, false, true),
  ('itchyboots',    'Itchy Boots',        'yt', '@ItchyBoots',      'en', 65, false, true),
  ('evazubeck',     'Eva zu Beck',        'yt', '@EvazuBeck',       'en', 66, false, true),
  ('baldbankrupt',  'bald and bankrupt',  'yt', '@baldandbankrupt', 'en', 67, false, true),
  ('paolofromtokyo','Paolo fromTOKYO',    'yt', '@PaolofromTOKYO',  'en', 68, false, true),
  ('flyingthenest', 'Flying The Nest',    'yt', '@FlyingTheNest',   'en', 69, false, true)
on conflict (slug) do update set yt_handle = excluded.yt_handle, lang = excluded.lang, active = true;
