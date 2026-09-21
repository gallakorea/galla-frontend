-- 🫂 갈비스가 먼저 말 걸기 — 사용자 행동에 반응하는 규칙 기반 알림(LLM 0원). 26.9.22 사장님 「다음 고도화 다 해」.
--    지금 사건: 내가 건 예측이 곧 마감(45~75분 전). 같은 건 1회, 사람당 2시간 1회, 선톡 끈 사람(ping_off) 제외.
--    notifications(type:friend) → trg_notify_push → send-push 가 「🫂 갈비스」로 푸시. pending_ping 에도 넣어 챗을 열면 그 말로 시작.
create table if not exists public.galvis_nudges (
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  ref text not null,
  at timestamptz not null default now(),
  primary key (user_id, kind, ref)
);
alter table public.galvis_nudges enable row level security;   -- 정책 없음 = 클라이언트 접근 불가(서버 전용)

create or replace function public.galvis_event_nudges() returns int
language plpgsql security definer set search_path = public as $$
declare r record; n int := 0; v_msg text;
begin
  for r in
    select distinct on (b.user_id) b.user_id, m.id as mid, left(m.question, 40) as q,
           round(extract(epoch from (m.close_at - now())) / 60)::int as mins
      from predict_bets b join markets m on m.id = b.market_id
     where m.status = 'open' and m.close_at between now() + interval '45 minutes' and now() + interval '75 minutes'
       and not exists (select 1 from galvis_nudges g where g.user_id = b.user_id and g.kind = 'predict_close' and g.ref = m.id::text)
       and not exists (select 1 from galvis_nudges g where g.user_id = b.user_id and g.at > now() - interval '2 hours')
       and not exists (select 1 from friend_relationship f where f.user_id = b.user_id and coalesce(f.ping_off, false))
     order by b.user_id, m.close_at
  loop
    v_msg := format('야 네가 건 「%s」 마감 %s분 남았다 — 판세 바뀌었는지 볼래?', r.q, r.mins);
    insert into galvis_nudges(user_id, kind, ref) values (r.user_id, 'predict_close', r.mid::text) on conflict do nothing;
    insert into notifications(user_id, type, message, link) values (r.user_id, 'friend', v_msg, 'predict-market.html?id=' || r.mid);
    update friend_relationship set pending_ping = v_msg where user_id = r.user_id and pending_ping is null;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.galvis_event_nudges() from public, anon, authenticated;

-- 15분마다(정각 몰림 피해 7분 오프셋 — galla-cron-stagger)
select cron.unschedule('galvis_event_nudges') where exists (select 1 from cron.job where jobname = 'galvis_event_nudges');
select cron.schedule('galvis_event_nudges', '7,22,37,52 * * * *', $$select public.galvis_event_nudges();$$);
