-- ============================================================
-- 알림 전면 보강 — 예측 · 광장 · 마이페이지(소셜/정산)에서 빠져 있던 알림 추가
--
-- 기존:  댓글 · 답글 · 좋아요/싫어요 · 전투(공격/방어/지원) · 투표 · 광장 · 팔로우
-- 추가:  후원 받음 · DM · 일기토 신청 · 예측 정산 · 출금 처리 · 이슈 승리(버그수정)
--
-- ⚠️ _notify()는 p_from이 null이면 무시한다(사람→사람 전용).
--    시스템 알림(정산·출금 등)은 보낸 사람이 없으므로 _notify_sys()를 새로 둔다.
-- ============================================================

-- 0) 시스템 알림 헬퍼 (보낸 사람 없음)
create or replace function public._notify_sys(
  p_user uuid, p_type text, p_issue bigint, p_message text, p_link text
) returns void
language plpgsql security definer set search_path to 'public'
as $$
begin
  if p_user is null then return; end if;
  insert into public.notifications(user_id, from_user, type, issue_id, message, link, read, created_at)
  values (p_user, null, p_type, p_issue, p_message, p_link, false, now());
end $$;


-- 1) 🐛 버그수정 — settle_issue의 알림 INSERT가 존재하지 않는 컬럼(title/body)을 써서
--    exception 블록에 삼켜지고 있었다(= 승리 알림이 아예 안 갔음).
create or replace function public.settle_issue(p_issue bigint)
returns jsonb
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_iss record; f record; v_winner text; v_pro numeric;
  r record; v_reward numeric; v_n int := 0;
begin
  select * into v_iss from issues where id = p_issue;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if v_iss.settled_at is not null then return jsonb_build_object('ok', false, 'reason', 'already_settled'); end if;
  if v_iss.ends_at is null or v_iss.ends_at > now() then
    return jsonb_build_object('ok', false, 'reason', 'not_ended');
  end if;

  select * into f from issue_frontline(p_issue);
  v_pro := round(f.final_pro * 100, 1);
  v_winner := case when v_pro > 50 then 'pro' when v_pro < 50 then 'con' else 'draw' end;

  update issues set
    settled_at = now(), winner = v_winner, final_pro_pct = v_pro,
    final_vote_pct = round(f.vote_pro * 100, 1),
    final_battle_pct = round(f.battle_pro * 100, 1)
  where id = p_issue;

  if v_winner in ('pro', 'con') then
    for r in
      select distinct user_id from votes
      where issue_id = p_issue and type = v_winner and user_id is not null
    loop
      select 30 + least(70, coalesce(sum(
               (greatest(0, least(100, coalesce(c.hp, 0)))::numeric / 100) * 10), 0))
        into v_reward
      from comments c
      where c.issue_id = p_issue and c.user_id = r.user_id and c.faction = v_winner
        and coalesce(c.status, 'normal') = 'normal' and coalesce(c.hp, 0) > 0;

      insert into point_balances (user_id) values (r.user_id) on conflict (user_id) do nothing;
      update point_balances set balance = balance + v_reward, updated_at = now() where user_id = r.user_id;
      insert into point_ledger (user_id, delta, reason) values (r.user_id, v_reward, 'issue_win:' || p_issue);

      perform public._notify_sys(r.user_id, 'issue_win', p_issue,
        '참전한 이슈에서 우리 진영이 승리했어요! ' || v_reward || ' GP를 받았습니다.',
        'issue.html?id=' || p_issue);

      v_n := v_n + 1;
    end loop;
  end if;

  return jsonb_build_object('ok', true, 'winner', v_winner, 'pro_pct', v_pro, 'rewarded', v_n);
end $$;
revoke execute on function public.settle_issue(bigint) from public, anon, authenticated;


-- 2) 💝 후원 받음 — 발의자에게 (슈퍼챗형, 금액이 커서 가장 중요한 알림)
create or replace function public.trg_notify_donation()
returns trigger language plpgsql security definer set search_path to 'public'
as $$
declare v_who text;
begin
  -- 결제 완료된 것만
  if coalesce(NEW.status, '') not in ('paid', 'succeeded', 'completed') then return NEW; end if;
  -- UPDATE로 결제완료가 된 경우, 이미 완료였으면 중복 알림 방지
  if TG_OP = 'UPDATE' and coalesce(OLD.status, '') = coalesce(NEW.status, '') then return NEW; end if;

  v_who := case when NEW.is_anonymous then '익명의 후원자' else public._nick(NEW.supporter_id) end;

  if NEW.is_anonymous then
    perform public._notify_sys(NEW.creator_id, 'donation', NEW.issue_id,
      v_who || '님이 ' || NEW.amount || ' GP를 후원했어요! 💝'
        || coalesce(' — "' || nullif(NEW.message, '') || '"', ''),
      'issue.html?id=' || NEW.issue_id);
  else
    perform public._notify(NEW.creator_id, NEW.supporter_id, 'donation', NEW.issue_id,
      v_who || '님이 ' || NEW.amount || ' GP를 후원했어요! 💝'
        || coalesce(' — "' || nullif(NEW.message, '') || '"', ''),
      'issue.html?id=' || NEW.issue_id);
  end if;
  return NEW;
exception when others then return NEW;
end $$;

drop trigger if exists notify_donation on public.donations;
create trigger notify_donation
  after insert or update of status on public.donations
  for each row execute function public.trg_notify_donation();


-- 3) ✉️ DM 새 메시지 — 스레드 상대에게
create or replace function public.trg_notify_dm()
returns trigger language plpgsql security definer set search_path to 'public'
as $$
declare t record; v_to uuid;
begin
  select user_lo, user_hi into t from dm_threads where id = NEW.thread_id;
  if not found then return NEW; end if;
  v_to := case when t.user_lo = NEW.sender_id then t.user_hi else t.user_lo end;

  perform public._notify(v_to, NEW.sender_id, 'dm', null,
    public._nick(NEW.sender_id) || '님이 메시지를 보냈습니다: ' || left(coalesce(NEW.body, ''), 40),
    'mypage.html');
  return NEW;
exception when others then return NEW;
end $$;

drop trigger if exists notify_dm on public.dm_messages;
create trigger notify_dm
  after insert on public.dm_messages
  for each row execute function public.trg_notify_dm();


-- 4) ⚔️ 일기토 신청 받음 — 상대에게
create or replace function public.trg_notify_duel()
returns trigger language plpgsql security definer set search_path to 'public'
as $$
begin
  perform public._notify(NEW.opponent, NEW.challenger, 'duel', NEW.issue_id,
    public._nick(NEW.challenger) || '님이 일기토를 신청했습니다 ⚔️ — "'
      || left(coalesce(NEW.topic, '주제 없음'), 30) || '"',
    'duel.html?id=' || NEW.id);
  return NEW;
exception when others then return NEW;
end $$;

drop trigger if exists notify_duel on public.duels;
create trigger notify_duel
  after insert on public.duels
  for each row execute function public.trg_notify_duel();


-- 5) 📈 예측 마켓 정산 — 그 마켓에 참여한 모든 유저에게
create or replace function public.trg_notify_market_resolved()
returns trigger language plpgsql security definer set search_path to 'public'
as $$
declare u record;
begin
  -- 미정산 → 정산으로 바뀐 순간에만
  if coalesce(OLD.resolved, false) or not coalesce(NEW.resolved, false) then return NEW; end if;

  for u in select distinct user_id from market_positions where market_id = NEW.id and user_id is not null
  loop
    perform public._notify_sys(u.user_id, 'market_resolved', null,
      '예측이 정산됐어요 📈 — "' || left(coalesce(NEW.question, ''), 30) || '" 결과를 확인하세요.',
      'predict-market.html?id=' || NEW.id);
  end loop;
  return NEW;
exception when others then return NEW;
end $$;

drop trigger if exists notify_market_resolved on public.markets;
create trigger notify_market_resolved
  after update of resolved on public.markets
  for each row execute function public.trg_notify_market_resolved();


-- 6) 💸 출금 처리 결과 — 승인/거절 시 본인에게
create or replace function public.trg_notify_withdrawal()
returns trigger language plpgsql security definer set search_path to 'public'
as $$
begin
  if coalesce(OLD.status, '') = coalesce(NEW.status, '') then return NEW; end if;

  if NEW.status in ('approved', 'paid', 'completed', 'done') then
    perform public._notify_sys(NEW.user_id, 'withdrawal', null,
      '출금이 완료됐어요 💸 — ' || NEW.amount || '원이 지급되었습니다.', 'withdraw.html');
  elsif NEW.status in ('rejected', 'canceled', 'cancelled') then
    perform public._notify_sys(NEW.user_id, 'withdrawal', null,
      '출금 요청이 거절됐어요. 사유는 고객지원에서 확인해 주세요.', 'withdraw.html');
  end if;
  return NEW;
exception when others then return NEW;
end $$;

drop trigger if exists notify_withdrawal on public.withdrawals;
create trigger notify_withdrawal
  after update of status on public.withdrawals
  for each row execute function public.trg_notify_withdrawal();


grant execute on function public._notify_sys(uuid, text, bigint, text, text) to service_role;
revoke execute on function public._notify_sys(uuid, text, bigint, text, text) from public, anon, authenticated;
