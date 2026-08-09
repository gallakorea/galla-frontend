-- 🌐 뉴스·예측 댓글에도 작성 언어를 각인한다 (2026-08-09)
--   번역 버튼이 '무슨 언어에서' 옮길지 알아야 동작한다. 없으면 전부 ko로 가정해 엉뚱하게 번역된다.
do $$
declare t text;
begin
  foreach t in array array['galla_news_comments','market_comments'] loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I add column if not exists locale text not null default ''ko''', t);
      execute format('create index if not exists %I on public.%I(locale)', 'idx_' || t || '_locale', t);
      execute format('drop trigger if exists trg_%s_locale on public.%I', t, t);
      execute format('create trigger trg_%s_locale before insert on public.%I
                      for each row execute function public.stamp_locale()', t, t);
    end if;
  end loop;
end $$;
