-- 한 번호 = 한 계정(휴대폰 확인 끝난 번호만). phone-verify 가 unique 위반을 phone_taken 으로 돌려준다.
create unique index if not exists user_profiles_phone_verified_uniq
  on public.user_profiles (phone) where phone_verified;
