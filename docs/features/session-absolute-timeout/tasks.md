# session-absolute-timeout — tasks

순서: 순수 함수 → 스키마 → 어댑터 → 설정 → 문서·방침. 커밋 경계는 `──`.

1. **테스트 먼저** — `lib/credentials/__tests__/session-expiry.test.ts`(design §4의 다섯 경우) · `provider-config.test.ts`에 `maxAge: 60 * 60 * 24 * 7` 리터럴과 `updateAge` 유지 · `schema-contract.test.ts`에 `Session.createdAt` · `adapter.test.ts`에 `updateSession`의 잘림·무쓰기·CAS 경우.
   검증: 새 테스트가 red.
   ── `test(auth): pin 7-day idle and 30-day absolute session expiry`
2. **스키마 + 마이그레이션** — `Session.createdAt` additive(design §6), 스키마 주석. `/db`로 생성·dev 적용, SQL 눈으로 확인.
   검증: `pnpm db:status` 깨끗 · `schema-contract.test.ts` green.
   ── `feat(db): add Session.createdAt` (스키마+마이그레이션만, `/db` 규칙)
3. **순수 함수** — `lib/credentials/session-expiry.ts`.
   검증: `session-expiry.test.ts` green.
4. **어댑터** — `credentialAdapter.updateSession`을 design §5대로.
   검증: `adapter.test.ts` green · `pnpm test:credentials:postgres` green(`pnpm gate`가 붙인다).
5. **설정** — `auth.ts` `maxAge` 7일, 머리 주석을 "마지막 활동 뒤 7일, 로그인 뒤 30일"로.
   검증: `provider-config.test.ts` green.
6. **개인정보 등재** — `lib/privacy/collected.ts`에 `Session.createdAt`.
   검증: `pnpm typecheck` green.
   ── `feat(auth): cap sessions at 30 days and extend idle to 7 days`
7. **방침** — en·ko 본문·쿠키 표, `REVISIONS` 행·`effectiveDate`·`changes`(날짜 = 머지일, 머지일이 바뀌면 옮긴다).
   검증: `policy-gate.test.tsx` green.
   ── `docs(privacy): session lifetime 7 days idle, 30 days absolute`
8. **가이드** — `guide/{en,ko,es}/self-hosting/troubleshooting.md` 76·100행(`/guide` 규칙, 세 언어 같은 커밋).
   검증: `pnpm test` green.
   ── `docs(guide): session lifetime in self-hosting stored fields`
9. **ARCHITECTURE §6.1.1** — 제목·본문(잘림 위치·쿠키가 DB보다 오래 남는 구간·마지막 7일 읽기 비용·`maxAge` 이제 테스트가 고정).
   ── `docs(ARCHITECTURE): session absolute expiry`
10. **실물 확인(로컬)** — dev DB에서 한 세션의 `createdAt`을 31일 전으로 당긴 뒤 새로고침 → `/signin` 이동·행 삭제. `createdAt`을 29일 전으로 두고 요청 두 번 → 두 번째에 `expires`가 그대로(쓰기 없음).
    검증: 수동 — `/runtime-test` 리포트 또는 `/implement` 보고에 쿼리 결과 첨부.
