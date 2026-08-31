/* 개인정보처리방침 §6-1 은 "회사가 자체 서비스 품질 개선을 위해 대화를 보관·활용하는
   경우, 닉네임 등 식별정보를 제거한 형태로만 이용합니다" 라고 약속한다. 실제로는
   curate_sft_samples 가 friend_relationship.profile_summary 를 통째로 sft_samples.ctx 에
   넣고 있었다 — 평균 270자(최대 362자)짜리 '그 사람에 대한 요약'이 127건.
   게다가 sft_samples 에는 user_id 가 없어 **탈퇴해도 지울 수 없다.** 방침의 다른 문장
   ("대화 기록과 기억 정보는 회원 탈퇴 시 지체 없이 파기")과도 어긋난다.

   대화 원본(friend_relationship.chat_log)은 CASCADE 로 정상 파기된다 — 문제는 복사본이다.
   profile_summary 를 아예 안 넣는다. 학습 맥락이 조금 줄지만 방침과 맞추는 쪽이 먼저다.
   (닉네임 유출은 실측 0건이었다 — '갈라'가 두 글자 닉네임이라 생긴 오탐이었다.) */

create or replace function public._sft_scrub(t text) returns text
language sql immutable as $$
  -- 자유 서술은 완벽한 비식별화가 불가능하다. 형태가 뚜렷한 것만이라도 걷어낸다.
  select regexp_replace(
           regexp_replace(coalesce(t,''), '[가-힣A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}', '{{메일}}', 'g'),
           '01[0-9][- ]?[0-9]{3,4}[- ]?[0-9]{4}', '{{전화}}', 'g')
$$;
CREATE OR REPLACE FUNCTION public.curate_sft_samples(p_ctx integer DEFAULT 6)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  r record; log jsonb; n int; i int; j int;
  tgt jsonb; content text; clean text; cc text; bad boolean;
  ctx jsonb; last_user text; brn text; nxt text; rwd int; ins int := 0; scn int := 0;
begin
  for r in
    select user_id, chat_log, persona
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
      clean := btrim(public._sft_scrub(clean));
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
        cc := public._sft_scrub(cc);
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
        jsonb_build_object('persona', r.persona),
        ctx || jsonb_build_array(jsonb_build_object('role','assistant','content', clean)),
        jsonb_array_length(ctx) + 1, 80, rwd, array['auto', brn])
      on conflict (norm) do update set reward = excluded.reward;   -- 재실행 시 최신 반응으로 보상 갱신
      ins := ins + 1;
    end loop;
  end loop;
  return jsonb_build_object('inserted', ins, 'scanned', scn, 'at', now());
end $function$;

-- 이미 저장된 것에서 걷어낸다. messages 는 건드리지 않으므로 norm(md5(messages)) 이 안 바뀐다 → 중복도 안 깨진다.
update sft_samples set ctx = ctx - 'profile_summary' where ctx ? 'profile_summary';
