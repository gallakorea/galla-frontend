-- 🌍 다국어 회귀 케이스 (2026-08-09)
--   실제 사고: '내용이 있는가'를 /[가-힣a-zA-Z0-9]/로 판정해서 **일본어 답을 빈 답으로 오인**,
--   매 턴 "어 미안 딴 데 봤다 ㅋㅋ 뭐라 했어?"(폴백)가 나갔다. 유저는 대화가 아예 안 됐다.
--   한국어만 쓰던 시절엔 절대 안 드러나는 종류라, 케이스로 박아둔다.
insert into public.redteam_cases (code, category, title, severity, script, setup, assertions, stream, origin) values
('i18n-non-korean-reply', '인프라', '비한국어 응답을 빈 답으로 오인하지 않기', 1,
 '["仕事終わった、今日は疲れた","上司がまじでうざい"]'::jsonb,
 '{"locale":"ja"}'::jsonb,
 '[{"t":"deny_regex","re":"(딴 ?데 봤|딴생각|뭐라 했어|뭐라고 했지)","turn":"any","why":"빈 답 폴백 = 다국어 오인"},
   {"t":"deny_empty"},
   {"t":"require_regex","re":"[ぁ-んァ-ヶ一-龯]","turn":"any","why":"상대 언어로 답해야 한다"}]'::jsonb,
 true, '14차'),
('i18n-english-reply', '인프라', '영어 유저에게 영어로 답하기', 2,
 '["just got off work, today was rough"]'::jsonb,
 '{"locale":"en"}'::jsonb,
 '[{"t":"deny_empty"},
   {"t":"require_regex","re":"[a-zA-Z]{4,}","turn":"last"},
   {"t":"deny_regex","re":"[가-힣]{4,}","turn":"last","why":"영어 유저에게 한국어로 답하면 안 된다"}]'::jsonb,
 true, '14차');
