# 전체 세션 회수 — 작업 순서

- [x] S1 (순수 계약): identifier·nonce·state·TTL·세션/계정 일치 판정, 쿠키·결과 URL 테스트 red→green.
- [x] S2 (저장): VerificationToken 목적 분리·단일 요청, User 잠금·조건부 소비·전체 세션 삭제. 단위 및 격리 PG에서 타인 보존·롤백·경합 검증.
- [x] S3 (인증): 시작 Action·Auth.js callback·응답 쿠키 정리. 실제 Auth.js에서 재인증 성공 후 새 세션이 없는지, 실패/정상 로그인 회귀를 검증.
- [x] S4 (UI): account 버튼/설명·오류·로그인 완료 문구. 사전·접근성/인가 경계 검사.
- [x] S5 (검수): implement 4관점·code-review·refactor, 전체 테스트/타입/격리 DB. red→green 근거 기록.
- [x] S6 (문서): doc-check·postmortem, sec-audit #38/SAAS/ARCHITECTURE/credential 참조와 VerificationToken 용도를 갱신.
- [ ] S7 (실물): dev의 GitHub/Google 왕복·취소·잘못된 계정·두 브라우저 회수·키보드/포커스. credential 운영 전환 후 수행하며 미수행은 완료로 표시하지 않는다.

커밋 경계는 S1~S4 구현, S5 회귀 수정, S6 문서다. 아직 커밋·배포하지 않는다. 기존 credential 미커밋 변경과 같은 워크트리에 있으므로 파일 목록과 기능별 테스트로 리뷰 범위를 구별한다.


## 로컬 검증 기록 (2026-09-10)

- **TDD:** policy/store/http/action은 인터페이스 부재로 red를 확인한 뒤 구현했다. 회귀는 프록시 HTTPS 판정·취소·nonce 유실에서 red→green, 요청 교체/소비 후 목적 유실은 실제 Auth.js+PostgreSQL에서 새 User가 생기는 red→green을 확인했다. 일반 로그인 두 화면도 쿠키 정리 누락 red→green을 검증했다.
- **implement:** 불변식·원칙·타입/경계·단순성 4관점 자체 검수. export/번역/프로젝트 인가 변경 없음. 새 테이블/환경변수 없음(VerificationToken 주석만 변경). 기존 credential 스키마 전환은 별도 게이트다.
- **code-review/refactor:** nonce 유실에 따른 일반 로그인 전환, Secure 판정 불일치, 취소의 장애 오분류, 이탈 후 일반/초대 로그인 방해를 수정했다. 2차 검수에서 DB 목적 기록만으로는 교체/소비 경합을 막지 못함을 재현해 별도 Auth.js state 쿠키 이름/salt로 바꿨다. 최종 동일 지적 미해소 없음.
- **전체 검사:** `pnpm test` **161파일 / 2,536 passed**, `pnpm typecheck` 통과. `pnpm test:credentials:postgres` **32 passed**(기존 credential 16 + 회수 후속 16). 독립 Unix socket PostgreSQL과 설치 Auth.js, 가짜 OAuth 공급자 응답이며 실제 GitHub/Google OIDC 브라우저 검증을 대체하지 않는다. `pnpm sync:agents:check`, `git diff --check` 통과.
- **doc-check:** ARCHITECTURE·SAAS·features를 문서별 병렬 대조했다. VerificationToken/회수 목적/운영 경계 반영 뒤 남은 ARCHITECTURE의 unique-only 조회 단언·account 오류 한 종류 단언·진입점 고정 개수를 정정했다. #37은 제외, #38은 로컬 검증으로 구분한다.
- **postmortem:** `docs/POSTMORTEM.md`에 확인 요청 교체/소비 뒤 OAuth 목적 유실과 일반 가입 실행을 기록했다. 재발 방지 grep에서 로그인 시작 세 곳(일반 둘, 회수 하나)을 확인했다.

## 리뷰 범위

`lib/session-revocation/**`, `components/session-revocation.tsx`, `app/(edit)/account/actions.ts`·`page.tsx`, `auth.ts`, 루트/초대 로그인 시작, `messages/en.tsx`, 인증 진입점 테스트와 `lib/credentials/__tests__/{sign-in.test.ts,postgres.integration.ts}` 후속 회귀다. 기존 credential 미커밋 구현과 공통 파일이 있으므로 전체 diff를 sec-audit-2 단독 변경으로 읽지 않는다.

S7과 credential 운영 전환 게이트는 미완료다. 이번 라운드는 빌드·커밋·push·배포·공유 DB 변경을 수행하지 않았다.


2026-09-10 후속: 사용자 요청으로 credential과 함께 dev 통합·워크트리 정리를 진행한다. dev 자동 Preview 배포는 `vercel.json`에서 보류하며 실제 전환은 credential 운영 절차를 따른다. 위 빌드·커밋 미수행 표시는 구현 라운드 당시 기록이다.
