# B6c — 공개 설치 안내 (README → 가이드) + 남은 문서 결함

공통 규칙: `docs/features/self-hosting/brief-common.md`. 정본 문서·가이드만(코드 0). 사실 대조 소스: dev의 `Dockerfile`·`deploy/**`·`lib/deployment/`·`scripts/preflight.ts`, 그리고 B7이 실측한 OPERATIONS "셀프 호스팅 실습 기록"(`/private/tmp/claude-501/-Users-sinhyeok-code-malmoi/f5cf1603-70aa-4e36-9752-284510968f3e/scratchpad/handoff-B7.md`).

## 사용자 결정 (2026-10-09)
README에 Plausible식 **Hosted vs Self-hosted 비교**를 두고, 자세한 절차는 **우리 가이드로 보낸다.**

1. **README(영문)** — 새 "Self-hosting" 절: 비교표(행 예: Infrastructure · Updates/releases · Where data lives · Sign-in & email requirements · Limits · Support · Cost · Analytics/SEO) — 값은 PRODUCT·spec §3·§7(지원: 최신 태그·GitHub Issues best-effort, 이미지는 매 앱 태그 GHCR)에서. 그 아래 한두 줄 + `https://mal-moi.com/docs/self-hosting` 링크. 기존 README 톤·길이에 맞춘다(배지·Privacy 절과 모순 없게).
2. **가이드 `self-hosting` 페이지(en 원문 + ko·es 구조 동형)** — `guide/AUTHORING.md` 규칙(`/guide` 스킬)대로 SUMMARY 등재. 공개 운영자용 **정본 절차**: 요구사항 · 외부 앱 등록 · 설치(Compose) · 업데이트 · 백업/복원 · 키 회전 · 장애 진단(preflight 사유 코드) · 운영자 개인정보 재료. 명령은 B7이 실측한 형태로.
3. **OPERATIONS 정리** — 설치·업데이트·백업/복원·키 회전·진단 **절차 본문은 가이드로 옮기고** OPERATIONS에는 상류 유지자 몫만 남긴다(이미지 발행 확인, 복원 실습은 다른 호스트에서, **실습 기록 표는 그대로**). 옮긴 자리는 가이드를 가리킨다. 두 벌을 남기지 않는다.
4. **남은 문서 결함**(옮기면서 함께 고친다):
   - Astra 🟡4: 계정 삭제의 `PROJECT_IDS`를 export(끝나면 unset), 프로젝트 0개(빈 문자열) 처리.
   - Astra 🟡5: 업데이트는 **백업 뒤 정지 유지 → migrate → smoke(외부 쓰기·scheduler 막은 채) → 성공 시 proxy·scheduler 재개**. 단순 백업 뒤 재개와 구분.
   - B7 ⚪6: 복원 4단계 `docker volume create` 경고, 6단계 migrate 재실행(멱등) 서술, 백업 manifest 권한.
   - B4 ⚪5: 비443 포트 origin이면 nginx `$http_host`.
   - 접근 로그: B8이 nginx 로그 마스킹을 넣는 중이다 — **아직 dev에 없으므로 서술하지 않는다**(지휘자가 통합 뒤 한 줄 얹는다).
5. PRODUCT·DIRECTORY에 가이드 새 페이지가 걸리면 같이(문서별 커밋).

## 건드리지 않는 것
코드, `deploy/**`, `.claude/commands/**`. 가이드 스크린샷은 찍지 않는다(텍스트 페이지).
