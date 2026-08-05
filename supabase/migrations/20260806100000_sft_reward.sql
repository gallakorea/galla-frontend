-- 🏆 내부 학습 엔진 — 보상(reward) 수집 레이어. 사람 라벨 없이 '실사용 행동=정답'.
--    각 응답 뒤 유저 반응으로 자동 점수(RLHF 라이트). 나중에 파인튜닝시 고보상 응답만 학습=우리 모델이 '먹히는 것'을 스스로 배움.
alter table public.sft_samples add column if not exists reward int default 0;

-- curate_sft_samples 갱신: 응답(assistant) 다음 유저 발화로 reward 계산.
create or replace function public.curate_sft_samples(p_ctx int default 6)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r record; log jsonb; n int; i int; j int;
  tgt jsonb; content text; clean text; cc text; bad boolean;
  ctx jsonb; last_user text; brn text; nxt text; rwd int; ins int := 0; scn int := 0;
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
      clean := regexp_replace(content, '\[(stk|emo):[^\]]*\]', '', 'gi');
      clean := regexp_replace(clean, '\(\([^)]*\)\)', '', 'g');
      clean := btrim(clean);
      bad := false;
      if clean = '' or char_length(clean) < 2 then bad := true;
      elsif clean ~ '(찾아\s*(줄게|줄께|볼게|볼께|봐줄게)|기다려|잠깐만|잠시만|이따|검색\s*해볼게|다시\s*(찾|검색))' then bad := true;
      elsif clean ~ '(밑에|아래|하단)[^.!?\n]{0,6}(칩|링크|버튼)[^.!?\n]{0,4}(눌러|클릭|탭|터치)' then bad := true;
      elsif clean ~ '(헷갈렸어|뭐라\s*해야\s*할지|딱\s*뜨는\s*게\s*없)' then bad := true;
      elsif clean ~ '(point_to|open_link|web_search|hot_issues|hot_videos|draft_issue|draft_plaza|find_user)' then bad := true;
      end if;
      if bad then continue; end if;
      ctx := '[]'::jsonb; j := greatest(0, i - p_ctx);
      while j < i loop
        cc := btrim(regexp_replace(regexp_replace(coalesce(log->j->>'content',''), '\[(stk|emo):[^\]]*\]','','gi'), '\(\([^)]*\)\)','','g'));
        if cc <> '' then ctx := ctx || jsonb_build_array(jsonb_build_object('role', coalesce(log->j->>'role','user'), 'content', cc)); end if;
        j := j + 1;
      end loop;
      select e->>'content' into last_user
      from jsonb_array_elements(ctx) with ordinality t(e, ord)
      where e->>'role' = 'user' order by ord desc limit 1;
      if last_user is null then continue; end if;
      brn := case when last_user ~
        '(만들|썸네일|영상|대본|숏판|롱판|짜줘|그려|생성|검색|찾아|열어|보여|예측|글\s*(써|올려)|dm|디엠|전화|통화|설정|프로필|바꿔|맛집|유튜브|먹방|인스타|이슈|뉴스|광장)'
        then 'agent' else 'companion' end;
      -- 🏆 보상: 응답 직후 유저 반응 = 실사용 정답 신호
      rwd := 0;
      if i+1 < n and coalesce(log->(i+1)->>'role','') = 'user' then
        rwd := 1;   -- 대화가 이어짐(긍정 기본)
        nxt := coalesce(log->(i+1)->>'content','');
        if nxt ~ '(ㅋㅋ|ㅎㅎ|고마워|고맙|좋아|좋다|대박|헐|짱|최고|맞아|재밌|웃겨|사랑|굿|오오|우와|와\s|딱\s)' then rwd := rwd + 2; end if;   -- 긍정 반응
        if nxt ~ '(뭐야|뭔\s*개소리|그게\s*아니|답답|짜증|왜\s*그래|아까\s*(말|한|보여|줬)|틀렸|또\s*그|짜증|하\s세월|그만)' then rwd := rwd - 3; end if;   -- 불만/실패
      end if;
      insert into sft_samples(source, brain, ctx, messages, turns, quality_score, reward, tags)
      values('friend_chat', brn,
        jsonb_build_object('persona', r.persona, 'profile_summary', r.profile_summary),
        ctx || jsonb_build_array(jsonb_build_object('role','assistant','content', clean)),
        jsonb_array_length(ctx) + 1, 80, rwd, array['auto', brn])
      on conflict (norm) do update set reward = excluded.reward;   -- 재실행 시 최신 반응으로 보상 갱신
      ins := ins + 1;
    end loop;
  end loop;
  return jsonb_build_object('inserted', ins, 'scanned', scn, 'at', now());
end $$;
revoke all on function public.curate_sft_samples(int) from anon, authenticated;
