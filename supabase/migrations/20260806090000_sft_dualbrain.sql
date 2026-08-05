-- 🧬🧠 SFT 이중 브레인 축적 확장 — 샘플을 brain(컴패니언/에이전트)으로 라벨링 + 창작 레퍼런스를 에이전트 실탄으로.
--    이중 브레인(컴패니언 AI/에이전트 AI)에 맞춰 데이터도 두 갈래로. 미래 파인튜닝시 브레인별 분리학습 가능. 비용 0.
alter table public.sft_samples add column if not exists brain text default 'companion';

-- 실행/창작 신호 정규식(핸들러 execSignal과 동형) — 마지막 유저 발화 기준으로 brain 판정.
-- 기존 대화 샘플 백필
update public.sft_samples s set brain = (
  case when exists (
    select 1 from jsonb_array_elements(s.messages) e
    where e->>'role' = 'user' and e->>'content' ~
      '(만들|썸네일|영상|대본|숏판|롱판|짜줘|그려|생성|검색|찾아|열어|보여|예측|글\s*(써|올려)|dm|디엠|전화|통화|설정|프로필|바꿔|맛집|유튜브|먹방|인스타|이슈|뉴스|광장)'
  ) then 'agent' else 'companion' end)
where source = 'friend_chat';

-- 대화 정제함수: 이제 brain 라벨도 함께(마지막 유저 발화로)
create or replace function public.curate_sft_samples(p_ctx int default 6)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r record; log jsonb; n int; i int; j int;
  tgt jsonb; content text; clean text; cc text; bad boolean;
  ctx jsonb; last_user text; brn text; ins int := 0; scn int := 0;
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
      if last_user is null then continue; end if;   -- 유저 발화 없는 창은 부적합
      brn := case when last_user ~
        '(만들|썸네일|영상|대본|숏판|롱판|짜줘|그려|생성|검색|찾아|열어|보여|예측|글\s*(써|올려)|dm|디엠|전화|통화|설정|프로필|바꿔|맛집|유튜브|먹방|인스타|이슈|뉴스|광장)'
        then 'agent' else 'companion' end;
      insert into sft_samples(source, brain, ctx, messages, turns, quality_score, tags)
      values('friend_chat', brn,
        jsonb_build_object('persona', r.persona, 'profile_summary', r.profile_summary),
        ctx || jsonb_build_array(jsonb_build_object('role','assistant','content', clean)),
        jsonb_array_length(ctx) + 1, 80, array['auto', brn])
      on conflict (norm) do nothing;
      if found then ins := ins + 1; end if;
    end loop;
  end loop;
  return jsonb_build_object('inserted', ins, 'scanned', scn, 'at', now());
end $$;
revoke all on function public.curate_sft_samples(int) from anon, authenticated;

-- 🎬 창작 레퍼런스(1등 유튜버 패턴) → 에이전트/PD 학습샘플로. brain='agent', source='creator_ref'.
create or replace function public.curate_creation_samples()
returns jsonb language plpgsql security definer set search_path = public as $$
declare p record; ins int := 0; kname text; q text; a text;
begin
  for p in select kind, content_type, style, style_desc, formula, examples, guide from public.creator_patterns where coalesce(active, true) loop
    kname := case p.kind when 'title' then '제목' when 'script' then '대본' when 'hook' then '훅' when 'thumbnail' then '썸네일' else coalesce(p.kind,'콘텐츠') end;
    q := btrim(format('[%s] 잘 먹히는 %s 뽑는 공식 알려줘%s', coalesce(p.content_type,'콘텐츠'), kname,
           case when coalesce(p.style_desc, p.style) is not null then ' (스타일: '||coalesce(p.style_desc,p.style)||')' else '' end));
    a := btrim(concat_ws(E'\n', nullif(btrim(coalesce(p.formula,'')),''), nullif(btrim(coalesce(p.examples::text,'')),'null'), nullif(btrim(coalesce(p.guide,'')),'')));
    if a = '' or char_length(a) < 4 then continue; end if;
    insert into sft_samples(source, brain, ctx, messages, turns, quality_score, tags)
    values('creator_ref', 'agent',
      jsonb_build_object('kind', p.kind, 'content_type', p.content_type, 'style', p.style),
      jsonb_build_array(jsonb_build_object('role','user','content', q), jsonb_build_object('role','assistant','content', a)),
      2, 85, array['creator_ref','agent', coalesce(p.kind,'creation')])
    on conflict (norm) do nothing;
    if found then ins := ins + 1; end if;
  end loop;
  return jsonb_build_object('inserted', ins, 'at', now());
end $$;
revoke all on function public.curate_creation_samples() from anon, authenticated;
