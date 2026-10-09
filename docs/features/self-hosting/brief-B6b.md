# B6b — 문서 2부 (설치·복구·릴리스) (self-hosting)

공통 규칙: `docs/features/self-hosting/brief-common.md`. 정본 문서만 고친다(코드 0). 사실 대조 소스는 dev의 코드 — `Dockerfile`·`deploy/**`·`lib/deployment/`·`scripts/preflight.ts`·`deploy/bootstrap.sql`. 인계 사본(남은 문서 항목이 여기 있다): `/private/tmp/claude-501/-Users-sinhyeok-code-malmoi/f5cf1603-70aa-4e36-9752-284510968f3e/scratchpad/handoff-B2.md`·`handoff-B3.md`·`handoff-B4.md`.

## 담당 (tasks §6 중 B6a가 하지 않은 것)
1. **`docs/OPERATIONS.md` 셀프 호스팅 절**(tasks §6 세 번째 항목): 고정 버전 설치(외부 앱 등록 — GitHub OAuth App·GitHub App·Google OAuth·Resend 발신 도메인, HTTPS·DNS, GitHub Actions에서 설치 주소 접근성, `OPERATOR_EMAILS`, 공개 가입의 결과) · 업데이트(`pull --ignore-buildable` → migrate+bootstrap → 같은 digest로 web 재생성) · 백업(DB·업로드 볼륨·키를 같은 정지 구간에) · 빈 볼륨 복원 · 키 회전(`pnpm credentials:self-hosted`·`credentials:finalize:self-hosted` — argv에 비밀 없이) · 장애 진단(preflight 사유 코드 표 — `not-directory` 포함, `email-rejected` 진단, Host 전달·비443 포트면 `$http_host`, `log_statement`·`pg_stat_statements`가 CREATE ROLE 비밀번호를 담는다는 주의) · **"셀프 호스팅 실습 기록" 절**(빈 표 — B7이 채운다). 절차는 정본 "나중에 다시 실행할 절차" 규칙을 따른다.
2. **운영자 개인정보 재료**(design §7): `lib/privacy/collected.ts`에서 파생한 수집 항목표(`User.attentionSeenAt` 포함)·쿠키·전송처(Resend·GitHub·Google)·self-hosted DB용 계정 삭제 절차. 위치는 OPERATIONS 셀프 호스팅 절 안. 표 항목이 `collected.ts`와 일대일.
3. **`.env.example` 산문**: `notify.mal-moi.com` 발신자 예시가 hosted 값이라는 주석, self-hosted 키 안내가 `deploy/.env.example`을 가리키게. 키 자체는 바꾸지 않는다(SH-15 ② 게이트).
4. **`.claude/commands/merge.md`**: 매 앱 태그마다 GHCR(`ghcr.io/sinhyeokkang/malmoi`)에 이미지를 발행하는 단계 — 9단계 Release 뒤, 태그 = 앱 태그, digest 기록, 실패해도 머지는 끝났다는 규칙(9단계와 같은 실패 처리). 발행 머신에 Docker·`ghcr` 로그인이 필요하다는 전제. action 태그와 독립. CLAUDE.md의 스킬/릴리스 절에 한 줄(미러 재생성).
5. **`docs/DIRECTORY.md`**: `Dockerfile`·`.dockerignore`·`deploy/` 트리(왜 그렇게 생겼나 포함).
6. 문서별 별도 커밋.

## 건드리지 않는 것
코드·가이드(B6a 완료)·`deploy/**` 자체. 사실이 코드와 어긋나 보이면 `ask`.
모델: Sonnet.
