-- 🇹🇼 대만(번체 중국어) 추가 (2026-08-09)
--   ⚠️ 첫 '지역 포함 언어코드'다(zh-TW). 중국 본토는 간체(zh-CN)라 문자부터 다르므로
--      'zh'로 뭉뚱그리면 안 된다. 대만·홍콩(zh-HK)은 번체, 본토는 간체.
--   상담 창구(대만): 1925 안심전화(衛福部, 24시간 무료) · 1995 생명선 · 1980 장선생(청소년)
--      미성년은 113 보호전화(아동보호·가정폭력)가 우선 창구다.
update public.app_settings
   set v = jsonb_set(v, '{zh-TW}', jsonb_build_object(
     'name', '繁體中文', 'tz', 'Asia/Taipei', 'currency', 'TWD', 'currency_symbol', 'NT$',
     'crisis', jsonb_build_array(
       jsonb_build_object('label','安心專線','tel','1925','sub','24小時 · 免費 · 匿名'),
       jsonb_build_object('label','生命線協談專線','tel','1995','sub','24小時')),
     'crisis_minor', jsonb_build_array(
       jsonb_build_object('label','113保護專線','tel','113','sub','24小時 · 兒少保護'),
       jsonb_build_object('label','張老師專線','tel','1980','sub','青少年輔導'),
       jsonb_build_object('label','安心專線','tel','1925','sub','24小時 · 免費'))
   ))
 where k = 'locales';
