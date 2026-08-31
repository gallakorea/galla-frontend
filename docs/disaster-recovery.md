# 복구 절차 (2026-08-31 리허설 완료)

> 사고가 난 다음에 처음 읽으면 늦는다. **리허설에서 두 번 막혔고**, 그 두 개를 모르면
> 복구가 그 자리에서 실패한다. 아래는 실제로 돌려본 절차다.

## 1. 지금 갖춰진 것

| 항목 | 상태 |
|---|---|
| 일일 물리 백업 | ✅ 매일 22:15 UTC · 최근 7일 · 실패 0건 |
| WAL-G | ✅ 켜짐 |
| **PITR(시점 복구)** | ❌ **꺼짐** |
| 복구 리허설 | ✅ 2026-08-31 (이 문서) |

⚠️ **PITR 이 꺼져 있어 복구 단위가 '하루'다.** 오전에 사고가 나면 전날 22:15 로 돌아가고
**최대 24시간치를 잃는다.** 유료 결제(GC)를 켠 뒤엔 이 손실이 곧 돈이다 —
PITR 활성화를 검토해야 한다(Supabase 대시보드 → Database → Backups).

## 2. 복구 시 반드시 밟는 함정 둘

리허설에서 실제로 두 번 실패했다.

### ① 생성 컬럼은 값을 넣을 수 없다

```
ERROR: cannot insert a non-DEFAULT value into column "author_id"
DETAIL: Column "author_id" is a generated column.
```

`insert into comments select * from 백업` 이 그대로 죽는다.
`comments.author_id` 는 `CASE WHEN is_anonymous THEN NULL ELSE user_id END` 생성 컬럼이다.

**→ 컬럼을 명시하되 생성 컬럼은 뺀다:**

```sql
select string_agg(quote_ident(column_name), ', ' order by ordinal_position)
  from information_schema.columns
 where table_schema='public' and table_name='<대상>' and is_generated='NEVER';
```

### ② 업무 규칙 트리거가 복구를 막는다

```
ERROR: no_ghost_pass
CONTEXT: PL/pgSQL function _enforce_ghost()
```

익명 댓글을 되살리려는데 "유령권이 있느냐"고 묻는다. 과거 데이터는 **이미 그 규칙을
통과해 저장된 것**이므로 다시 검사할 이유가 없다.

**→ 복구 동안만 사용자 트리거를 끈다:**

```sql
alter table <대상> disable trigger user;   -- ⚠️ user: 시스템/FK 트리거는 살려둔다
-- insert …
alter table <대상> enable trigger user;
```

## 3. 검증된 복구 스크립트

```sql
do $do$
declare cols text; diff int;
begin
  -- 생성 컬럼 제외한 실제 컬럼 목록
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position) into cols
    from information_schema.columns
   where table_schema='public' and table_name='comments' and is_generated='NEVER';

  -- (사고 상황이라면 이 백업은 이미 있는 스냅샷/덤프로 대체한다)
  execute 'create temp table bk as select ' || cols || ' from comments';

  -- 자식부터 지우고 부모를 지운다
  delete from comment_actions; delete from comment_likes; delete from comments;

  alter table comments disable trigger user;
  execute 'insert into comments (' || cols || ') select ' || cols || ' from bk';
  alter table comments enable trigger user;

  -- 건수가 아니라 행 단위로 대조한다
  execute 'select count(*) from (select ' || cols || ' from comments
           except select ' || cols || ' from bk) x' into diff;
  if diff <> 0 then raise exception '복구 불일치 % 행', diff; end if;
end $do$;
```

## 4. 리허설 결과 (2026-08-31)

```
원본 150 → 전부 삭제 0 → 복구 150   일치
행 단위 내용 불일치        0건
생성 컬럼 재계산 정상       150/150
```

전 과정을 하나의 트랜잭션에서 돌리고 롤백했다 — 운영 데이터는 건드리지 않았다.

## 5. 아직 리허설 안 한 것

- **물리 백업으로부터의 전체 복원.** Supabase 대시보드에서 백업을 고르면 새 프로젝트로
  복원되는데, 그러면 **프로젝트 ref 가 바뀌어** 앱·엣지함수·크론의 URL 을 전부 갈아야 한다.
  실제로 해보지 않았다 — 사고 시 이 갈아끼우기가 가장 오래 걸릴 것이다.
- **Storage 복원.** DB 백업에 스토리지 객체는 포함되지 않는다. 별도 백업이 필요하다
  (2026-08-31 현재 `issues` 버킷 1.16GB 를 로컬로 내려받아 둔 상태).
- **엣지 함수·크론 재구성.** 코드는 저장소에 있지만 시크릿(API 키·vault)은 없다.
  복구 시 수동 재입력이 필요하다.
