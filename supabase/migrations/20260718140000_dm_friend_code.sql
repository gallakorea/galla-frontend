-- 🤝 친구 코드로 친구 찾기 (카톡 'ID로 추가 / 입장코드' 대응)
-- 갈라의 친구 코드 = 기존 초대 코드(user_profiles.ref_code, my_ref_code가 생성).
-- 새 코드 체계를 만들면 초대 링크와 이중이 된다 — 같은 코드가 '가입 초대'와
-- '친구 추가' 둘 다로 일한다(코드 하나로 미가입자는 가입, 가입자는 친구).
--
-- searchable(검색 허용)은 무시한다 — 코드는 본인이 직접 건넨 것이라 '찾기 거부'가 아니다.
-- 차단 관계는 존중한다 — 차단했거나 당했으면 못 찾는다(차단 사실은 비노출, 그냥 없음).
create or replace function public.dm_find_by_code(p_code text)
returns table(id uuid, nickname text, avatar_url text, bio text)
language sql security definer set search_path = public as $$
  select u.id, u.nickname, u.avatar_url, u.bio
  from user_profiles p
  join users u on u.id = p.user_id
  where upper(btrim(p_code)) = p.ref_code
    and u.id <> auth.uid()
    and not exists (select 1 from dm_blocks b
                     where (b.user_id = u.id and b.blocked = auth.uid())
                        or (b.user_id = auth.uid() and b.blocked = u.id))
  limit 1
$$;
grant execute on function public.dm_find_by_code(text) to authenticated;
