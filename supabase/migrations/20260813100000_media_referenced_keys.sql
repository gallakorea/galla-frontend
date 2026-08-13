-- =========================================================
-- 미디어 참조 키 수집 — 고아 파일 청소의 '살려둘 목록'
--
-- 왜 동적 스캔인가:
--   미디어 URL은 17개 컬럼, 13개 테이블에 흩어져 있다(실측).
--   issues·posts 만 보고 지웠다면 DM 첨부(38건)·삐삐 음성(22건)·스티커·예측
--   이미지를 전부 날렸을 것이다.
--   하드코딩 목록은 다음에 테이블이 늘면 반드시 뒤처진다 → 그때 살아있는 파일이 지워진다.
--   그래서 public 의 모든 text/jsonb/array 컬럼을 매번 훑는다. 느리지만 하루 한 번이고,
--   '못 찾으면 지운다'는 방향의 실수를 구조적으로 막는다.
--
-- 반환: cdn.galla.im/<key> 의 key 집합 (예: images/<uid>/<uuid>.jpg)
-- =========================================================

create or replace function public.media_referenced_keys()
returns setof text language plpgsql stable security definer set search_path to 'public' as $$
declare r record; sql text;
begin
  if not ((select auth.role()) = 'service_role' or _is_admin()) then
    raise exception 'forbidden';
  end if;
  -- 전 컬럼 스캔이라 기본 타임아웃(8s)을 넘는다. 하루 한 번 도는 배치라 넉넉히 준다.
  perform set_config('statement_timeout', '180s', true);

  for r in
    select c.table_name t, c.column_name col
      from information_schema.columns c
      join information_schema.tables tb
        on tb.table_name = c.table_name and tb.table_schema = c.table_schema
     where c.table_schema = 'public'
       and tb.table_type = 'BASE TABLE'
       and c.data_type in ('text','character varying','jsonb','json','ARRAY')
       /* 전 컬럼 스캔은 뉴스 원문 같은 대용량 텍스트까지 훑어 타임아웃이 났다.
          미디어 URL 이 들어갈 수 있는 컬럼으로 좁힌다 — 이름 패턴 또는 jsonb(meta 등).
          ⚠️ 이름 규칙을 벗어난 새 컬럼은 못 잡는다 → 그 파일은 '고아'로 보여 지워질 수 있다.
             그래서 아래 청소 함수가 '참조 0건'과 '과반 삭제'를 각각 중단 조건으로 둔다.
             미디어 컬럼을 새로 만들 땐 이름에 url/image/media/thumb/video/audio/voice/
             photo/avatar/attach/file/cover/poster/sticker 중 하나를 넣을 것. */
       and (c.data_type in ('jsonb','json')
            or c.column_name ~* '(url|image|thumb|media|video|audio|voice|photo|avatar|attach|file|cover|poster|sticker)')
  loop
    -- 컬럼 값 전체에서 cdn.galla.im/<key> 를 모두 뽑는다(jsonb 배열·중첩도 ::text 로 평탄화)
    sql := format(
      'select m[1] from public.%I t, '
      || 'lateral regexp_matches(t.%I::text, ''https://cdn\.galla\.im/([A-Za-z0-9._/-]+)'', ''g'') m '
      || 'where t.%I is not null', r.t, r.col, r.col);
    begin
      return query execute sql;
    exception when others then
      -- 권한·타입 문제로 못 읽는 컬럼은 건너뛴다.
      -- ⚠️ 건너뛰면 '참조 없음'으로 보여 삭제 후보가 된다 → 청소 함수가 이 경우를 감지해 중단한다.
      raise notice 'skip %.%: %', r.t, r.col, sqlerrm;
    end;
  end loop;
end $$;

revoke execute on function public.media_referenced_keys() from anon, authenticated, public;
grant  execute on function public.media_referenced_keys() to service_role;

comment on function public.media_referenced_keys() is
  '살아있는 미디어 키 전체. purge-orphan-media 가 이 목록에 없는 R2 객체만 지운다. 동적 스캔 — 테이블이 늘어도 자동 포함.';
