-- 26.10.16 유튜브 쿼터 증설(하루 10만 유닛) 승인 → 핫튜브 수집 30분 → 10분 주기. 정각 몰림 피해 8분 오프셋 유지.
select cron.alter_job(73, schedule := '8-59/10 * * * *');  -- collect_youtube_hot_job
