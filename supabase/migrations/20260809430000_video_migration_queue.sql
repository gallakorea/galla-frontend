-- 🔁 신규 영상 자동 이관 큐 (2026-08-09)
--
--  기존 41건은 손으로 옮겼지만, 앞으로 올라오는 영상은 그대로 두면 다시 Stream 재생비가 붙는다.
--  (시청 1,000분당 $1 — 영상 시청은 무료 기능이라 매출로 회수되지 않는다)
--
--  왜 큐인가: 업로드 직후엔 **Stream 인코딩이 안 끝나** 세그먼트가 없다. 그 순간 이관하면 실패한다.
--  글 저장 시점엔 큐에만 넣고, 크론이 주기적으로 집어서 인코딩이 끝난 것부터 옮긴다.
--  실패하면 다음 회차에 다시 시도된다(인코딩이 늦어도 결국 옮겨진다).

create table if not exists public.video_migrations (
  uid         text primary key,                       -- Cloudflare Stream video id
  status      text not null default 'pending',        -- pending | done | failed
  attempts    int  not null default 0,
  last_error  text,
  r2_url      text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_vm_pending on public.video_migrations(status, attempts)
  where status = 'pending';
alter table public.video_migrations enable row level security;
revoke all on public.video_migrations from anon, authenticated;   -- 서버 전용

-- ─── 본문에서 Stream video id를 뽑아 큐에 넣는다.
--     ⚠️ media(JSON)까지 봐야 한다. 피드가 실제로 재생하는 건 video_url이 아니라 media다
--        (이번 이관에서 이걸 놓쳐서 옮기고도 피드가 계속 Stream을 쓰고 있었다).
create or replace function public._enqueue_stream_videos()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare v_txt text; m text;
begin
  v_txt := coalesce(new.video_url, '') || ' ' || coalesce(new.media::text, '')
        || ' ' || coalesce(to_jsonb(new) ->> 'thumbnail_url', '');
  if v_txt not like '%cloudflarestream%' then return new; end if;
  for m in select (regexp_matches(v_txt, 'cloudflarestream\.com/([a-f0-9]{20,})', 'g'))[1] loop
    insert into video_migrations (uid) values (m)
      on conflict (uid) do nothing;     -- 이미 옮겼거나 대기 중이면 그대로 둔다
  end loop;
  return new;
end $$;

drop trigger if exists trg_enqueue_video_issues on public.issues;
create trigger trg_enqueue_video_issues
  after insert or update of video_url, media, thumbnail_url on public.issues
  for each row execute function public._enqueue_stream_videos();

drop trigger if exists trg_enqueue_video_posts on public.posts;
create trigger trg_enqueue_video_posts
  after insert or update of video_url, media on public.posts
  for each row execute function public._enqueue_stream_videos();

-- ─── 이관 결과를 콘텐츠에 반영. 주소가 흩어져 있어 한 곳에서 전부 바꾼다.
--     ⚠️ 원본 주소는 video_url_stream에 남긴다. 미러가 잘못됐을 때 되돌릴 유일한 길이다.
create or replace function public.apply_video_migration(p_uid text, p_url text, p_thumb text default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_n int := 0; v_c int;
begin
  if p_uid is null or p_url is null then return jsonb_build_object('ok', false, 'reason', 'bad_args'); end if;

  update issues
     set video_url_stream = coalesce(video_url_stream, video_url),
         video_url = p_url
   where video_url like '%' || p_uid || '%';
  get diagnostics v_c = row_count; v_n := v_n + v_c;

  update posts
     set video_url_stream = coalesce(video_url_stream, video_url),
         video_url = p_url
   where video_url like '%' || p_uid || '%';
  get diagnostics v_c = row_count; v_n := v_n + v_c;

  -- media JSON 안의 매니페스트 주소
  update issues set media = regexp_replace(media::text,
      'https://customer-[a-z0-9]+\.cloudflarestream\.com/' || p_uid || '/manifest/video\.m3u8',
      p_url, 'g')::jsonb
   where media::text like '%' || p_uid || '/manifest%';
  get diagnostics v_c = row_count; v_n := v_n + v_c;

  update posts set media = regexp_replace(media::text,
      'https://customer-[a-z0-9]+\.cloudflarestream\.com/' || p_uid || '/manifest/video\.m3u8',
      p_url, 'g')::jsonb
   where media::text like '%' || p_uid || '/manifest%';
  get diagnostics v_c = row_count; v_n := v_n + v_c;

  -- 썸네일 — 빼먹으면 Stream 원본을 지우는 순간 피드 썸네일이 전부 깨진다
  if p_thumb is not null then
    update issues set thumbnail_url = p_thumb
     where thumbnail_url like '%' || p_uid || '/thumbnails%';
    get diagnostics v_c = row_count; v_n := v_n + v_c;

    update issues set media = regexp_replace(media::text,
        'https://customer-[a-z0-9]+\.cloudflarestream\.com/' || p_uid || '/thumbnails/thumbnail\.jpg[^"]*',
        p_thumb, 'g')::jsonb
     where media::text like '%' || p_uid || '/thumbnails%';
    get diagnostics v_c = row_count; v_n := v_n + v_c;
  end if;

  update video_migrations
     set status = 'done', r2_url = p_url, updated_at = now(), last_error = null
   where uid = p_uid;

  return jsonb_build_object('ok', true, 'updated', v_n);
end $$;

-- ─── 큐에서 처리할 것 꺼내기 (워커용)
create or replace function public.next_video_migrations(p_limit int default 5)
returns jsonb language sql security definer set search_path to 'public' as $$
  select coalesce(jsonb_agg(uid), '[]'::jsonb) from (
    select uid from video_migrations
     where status = 'pending' and attempts < 20
     order by attempts, created_at
     limit greatest(1, least(coalesce(p_limit, 5), 20))) t;
$$;

create or replace function public.fail_video_migration(p_uid text, p_err text)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  update video_migrations
     set attempts = attempts + 1,
         last_error = left(coalesce(p_err, ''), 400),
         -- 20회(약 100분)까지 재시도한다. 인코딩이 오래 걸리는 긴 영상도 결국 통과한다.
         status = case when attempts + 1 >= 20 then 'failed' else 'pending' end,
         updated_at = now()
   where uid = p_uid;
end $$;

-- 이미 옮긴 41건은 큐에 넣지 않는다(중복 이관 방지)
insert into public.video_migrations (uid, status, r2_url)
select distinct (regexp_matches(video_url_stream, 'cloudflarestream\.com/([a-f0-9]{20,})'))[1],
       'done', video_url
  from issues where video_url_stream is not null
on conflict (uid) do nothing;
