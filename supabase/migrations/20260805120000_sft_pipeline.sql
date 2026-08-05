-- 🧬 SFT 데이터셋 자동 정제 파이프라인 — chat_log에서 '깨끗한 (맥락→좋은응답)' 쌍만 축적.
--    미래 파인튜닝(오픈모델→갈라 친구)용 실탄. LLM 안 씀=비용 0. 우리가 만든 가드를 그대로 품질필터로 재활용.
create table if not exists public.sft_samples (
  id bigint generated always as identity primary key,
  source text default 'friend_chat',                    -- 출처(친구챗/광장/이슈...)
  ctx jsonb,                                             -- 페르소나·프로필요약 스냅샷(system 조립용)
  messages jsonb not null,                               -- [{role,content}] 정제된 창(좋은 assistant 턴으로 끝남)
  turns int,
  quality_score int default 80,
  tags text[] default '{}',
  norm text generated always as (md5(messages::text)) stored,   -- 중복 방지
  created_at timestamptz default now()
);
create unique index if not exists sft_samples_norm_uidx on public.sft_samples(norm);
alter table public.sft_samples enable row level security;
revoke all on public.sft_samples from anon, authenticated;   -- 서비스롤/크론만

-- 정제 함수: assistant 턴마다 품질필터 통과 시 [앞 맥락 p_ctx턴 + 그 응답]을 한 샘플로 적재.
create or replace function public.curate_sft_samples(p_ctx int default 6)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r record; log jsonb; n int; i int; j int;
  tgt jsonb; content text; clean text; cc text; bad boolean;
  ctx jsonb; ins int := 0; scn int := 0;
begin
  for r in
    select user_id, chat_log, persona, profile_summary
    from friend_relationship
    where jsonb_typeof(chat_log) = 'array' and jsonb_array_length(chat_log) >= 2
  loop
    log := r.chat_log; n := jsonb_array_length(log);
    for i in 0 .. n-1 loop
      tgt := log -> i;
      if coalesce(tgt->>'role','') <> 'assistant' then continue; end if;
      scn := scn + 1;
      content := coalesce(tgt->>'content','');
      -- 내부 마커 제거(스티커/이모/괄호주석)
      clean := regexp_replace(content, '\[(stk|emo):[^\]]*\]', '', 'gi');
      clean := regexp_replace(clean, '\(\([^)]*\)\)', '', 'g');
      clean := btrim(clean);
      -- 🛡 품질필터 = 우리 가드 패턴 재활용: 실패 턴은 학습에서 제외
      bad := false;
      if clean = '' or char_length(clean) < 2 then bad := true;
      elsif clean ~ '(찾아\s*(줄게|줄께|볼게|볼께|봐줄게)|기다려|잠깐만|잠시만|이따|검색\s*해볼게|다시\s*(찾|검색))' then bad := true;   -- 미래약속
      elsif clean ~ '(밑에|아래|하단)[^.!?\n]{0,6}(칩|링크|버튼)[^.!?\n]{0,4}(눌러|클릭|탭|터치)' then bad := true;              -- UI지시
      elsif clean ~ '(헷갈렸어|뭐라\s*해야\s*할지|딱\s*뜨는\s*게\s*없)' then bad := true;                                        -- 폴백/무응답
      elsif clean ~ '(point_to|open_link|web_search|hot_issues|hot_videos|draft_issue|draft_plaza|find_user)' then bad := true;   -- 툴이름 누수
      end if;
      if bad then continue; end if;
      -- 앞 맥락 p_ctx턴 수집(마커 제거, 빈 것 스킵)
      ctx := '[]'::jsonb; j := greatest(0, i - p_ctx);
      while j < i loop
        cc := btrim(regexp_replace(regexp_replace(coalesce(log->j->>'content',''), '\[(stk|emo):[^\]]*\]','','gi'), '\(\([^)]*\)\)','','g'));
        if cc <> '' then
          ctx := ctx || jsonb_build_array(jsonb_build_object('role', coalesce(log->j->>'role','user'), 'content', cc));
        end if;
        j := j + 1;
      end loop;
      -- 맥락에 유저 발화가 하나도 없으면 학습쌍으로 부적합
      if not exists (select 1 from jsonb_array_elements(ctx) e where e->>'role' = 'user') then continue; end if;
      insert into sft_samples(source, ctx, messages, turns, quality_score, tags)
      values('friend_chat',
        jsonb_build_object('persona', r.persona, 'profile_summary', r.profile_summary),
        ctx || jsonb_build_array(jsonb_build_object('role','assistant','content', clean)),
        jsonb_array_length(ctx) + 1, 80, array['auto'])
      on conflict (norm) do nothing;
      if found then ins := ins + 1; end if;
    end loop;
  end loop;
  return jsonb_build_object('inserted', ins, 'scanned', scn, 'at', now());
end $$;
revoke all on function public.curate_sft_samples(int) from anon, authenticated;
