-- 댓글 전투 시스템 실데이터 전환
-- 2026-07-09: Management API로 원격 DB에 적용됨 (기록용)

-- 1) parent_id 타입 교정 (uuid → bigint, comments.id 참조 / 테이블 비어있어 안전)
alter table public.comments drop column if exists parent_id;
alter table public.comments add column parent_id bigint references public.comments(id) on delete cascade;
create index if not exists comments_parent_idx on public.comments (parent_id);
create index if not exists comments_issue_idx on public.comments (issue_id);

-- 2) 전투 리플 구분 (⚔공격 / 🛡방어 답글)
alter table public.comments add column if not exists battle_action text
  check (battle_action in ('attack','defend'));

-- 3) 좋아요/싫어요
create table if not exists public.comment_likes (
  comment_id bigint not null references public.comments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  value smallint not null check (value in (1,-1)),
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);
alter table public.comment_likes enable row level security;
drop policy if exists "likes public read" on public.comment_likes;
create policy "likes public read" on public.comment_likes for select using (true);
drop policy if exists "like own insert" on public.comment_likes;
create policy "like own insert" on public.comment_likes for insert with check (auth.uid() = user_id);
drop policy if exists "like own update" on public.comment_likes;
create policy "like own update" on public.comment_likes for update using (auth.uid() = user_id);
drop policy if exists "like own delete" on public.comment_likes;
create policy "like own delete" on public.comment_likes for delete using (auth.uid() = user_id);

-- 4) 전투 액션 중복 방지 (사용자당 댓글당 액션 1회)
alter table public.comment_actions alter column id set default gen_random_uuid();
create unique index if not exists comment_actions_once
  on public.comment_actions (comment_id, user_id, action_type);

-- 5) 전투 RPC: 액션 기록 + HP/카운터 원자적 갱신 (클라이언트 조작 불가)
create or replace function public.battle_action(p_comment_id bigint, p_action text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_side text;
  v_hp int;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'reason', 'unauthorized');
  end if;
  if p_action not in ('attack','defend','support') then
    return jsonb_build_object('ok', false, 'reason', 'bad_action');
  end if;

  select faction into v_side from comments where id = p_comment_id;
  if v_side is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  begin
    insert into comment_actions (comment_id, user_id, side, action_type)
    values (p_comment_id, v_user, v_side, p_action);
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'reason', 'already');
  end;

  update comments set
    hp = greatest(0, least(100,
      hp + case p_action when 'attack' then -12 when 'defend' then 8 else 12 end)),
    attack_count  = attack_count  + (p_action = 'attack')::int,
    defense_count = defense_count + (p_action = 'defend')::int,
    support_count = support_count + (p_action = 'support')::int
  where id = p_comment_id
  returning hp into v_hp;

  return jsonb_build_object('ok', true, 'hp', v_hp);
end $$;

revoke all on function public.battle_action(bigint, text) from public, anon;
grant execute on function public.battle_action(bigint, text) to authenticated;

-- 6) 보안 구멍 제거: 아무나 남의 댓글 UPDATE 가능하던 정책 (HP 갱신은 RPC가 대체)
drop policy if exists "Allow battle updates" on public.comments;
