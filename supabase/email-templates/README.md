# GALLA 인증 이메일 템플릿

발송: **Resend SMTP**(smtp.resend.com) 경유, 발신자 `"갈라" <no-reply@galla.im>`.
템플릿의 **원본(source of truth)은 Supabase Auth 설정**(Management API `config/auth`
의 `mailer_templates_confirmation_content` / `mailer_templates_recovery_content`).
여기 파일은 참고·버전관리용 사본. 수정 시 Supabase 설정도 함께 갱신할 것.

- `confirmation.html` — 가입 이메일 인증 (제목: "이메일 인증하고 여론 전투에 참전하세요 ⚔️")
- 비밀번호 재설정 제목: "갈라 비밀번호 재설정"
- 톤: 다크 + 우주 레드/블루 그라데이션 + GALLA 로고(galla.im/assets/logo.png) + 인디고 버튼.
- Go 템플릿 변수 `{{ .ConfirmationURL }}` 사용.

⚠️ 설정 변경은 GoTrue 반영에 ~10~15분 걸림(즉시 안 바뀜).
