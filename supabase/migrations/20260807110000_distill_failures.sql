-- 🎓 자동 교사 증류 파이프라인 — 저reward 실샘플(불만 산 응답)을 매일 교사 모델이 정답으로 재생성.
--   엣지 distill-failures가 처리, 여기는 마킹 RPC + 크론 스케줄.

-- 원본 재처리 방지 마킹(tags에 'distilled' 추가). 엣지(service_role)만 호출.
create or replace function public.sft_mark_distilled(p_id bigint)
returns void language sql security definer set search_path = public as $$
  update sft_samples set tags = array_append(coalesce(tags,'{}'), 'distilled')
  where id = p_id and not (coalesce(tags,'{}') @> array['distilled']);
$$;
revoke all on function public.sft_mark_distilled(bigint) from anon, authenticated;

-- 크론: 매일 UTC 20:00 (보상 갱신 curate-sft-daily 19:30 이후 = 신선한 reward로 선별)
-- ⚠️ x-cron-key는 반드시 vault 'cron_secret' 현재값으로(하드코딩 금지 — 로테이트되면 403으로 조용히 죽는다. job93 선톡이 실제로 6일 죽었음).
--    엣지 함수는 --no-verify-jwt 배포 필수(크론 http_post엔 Authorization 헤더가 없어 게이트웨이에서 401).
select cron.schedule('distill-failures-daily', '0 20 * * *', $$
select net.http_post(
  url:='https://bidqauputnhkqepvdzrr.supabase.co/functions/v1/distill-failures',
  headers:=jsonb_build_object('x-cron-key',(select decrypted_secret from vault.decrypted_secrets where name='cron_secret'),'Content-Type','application/json'),
  body:='{}'::jsonb)
$$);
