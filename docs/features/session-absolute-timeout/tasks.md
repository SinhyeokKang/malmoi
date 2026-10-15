# session-absolute-timeout — tasks

순서: 실측 → 테스트 → 어댑터·설정 → 문서·방침 → 실물 확인 → 회고. 커밋 경계는 `──`. 스키마 변경이 없어 `/db`·마이그레이션 순서 판정이 없다.

0. ✅ **실측(구현 전, 로컬 dev)** — 로그인 직후 세션 쿠키의 Expires와 dev DB `Session.expires`를 기록한다. 1시간 넘게 화면을 오가며 활동한 뒤 응답에 `Set-Cookie: authjs.session-token`이 없는지, 쿠키 Expires가 그대로이고 DB `expires`만 늘었는지 본다.
   검증: 수동 — 세 값(로그인 직후 쿠키 Expires · 1시간 뒤 쿠키 Expires · 1시간 뒤 DB `expires`)을 `/implement` 보고에 첨부. **쿠키가 재발급되고 있으면 여기서 멈추고 설계를 다시 본다**(design §2의 전제).
1. **테스트 먼저(어댑터)** — `lib/credentials/__tests__/adapter.test.ts:39-44`("삭제된 세션을 갱신으로 생성하지 않는다", `where.expires: { gt }` 단언)를 **교체**한다: `updateSession`이 `null`을 돌려주고 prisma `session`의 어떤 메서드도 부르지 않는다. 격리 PG 스위트 `lib/credentials/__tests__/postgres.integration.ts` — fixture(`:254`)를 `maxAge`·`updateAge` 7일로, `:333-335`의 연장 단언을 "실제 Auth.js 경로로 `read(raw)`한 뒤에도 `expires`가 그대로"로 바꾼다.
   검증: `pnpm test lib/credentials/__tests__/adapter.test.ts` red(기존 구현은 `updateMany`를 부른다).
2. **어댑터** — `credentialAdapter.updateSession`을 no-op(`null`)으로(design §5). 고아 import 제거.
   검증: `adapter.test.ts` green.
3. **설정** — `auth.ts` `maxAge: 60 * 60 * 24 * 7`, `updateAge: 60 * 60 * 24 * 7`, `:118-121` 주석을 "로그인 뒤 7일 고정, 연장 없음 — 쿠키가 재발급되지 않으므로"로 고친다. 그다음 `lib/auth/__tests__/provider-config.test.ts`의 "세션이 슬라이딩한다"(`:41-43`)를 "로그인 뒤 7일 고정 — `maxAge`·`updateAge` 리터럴이 둘 다 `60 * 60 * 24 * 7`"로 바꾼다.
   ⚠️ **`auth.ts`를 먼저 고친다** — `lib/auth/*` 편집은 PostToolUse 훅이 `pnpm test`를 돌려 red면 exit 2로 막는다(`.claude/settings.json`). 테스트를 먼저 고치면 그 편집이 막힌다.
   검증: `provider-config.test.ts` green · `pnpm test` green · `pnpm test:credentials:postgres` green(`pnpm gate`가 붙인다).
   ── `feat(auth): fix sessions at 7 days from sign-in`
4. **방침** — design §7 표의 en·ko 네 문장, `REVISIONS` 행(digest·koDigest는 실패 메시지 값), `effectiveDate` 둘(`en.tsx:716`·`ko-privacy.tsx:15`), en·ko `changes` 절, `policy-gate.test.tsx:316`의 하드코딩 날짜. 날짜 = 머지일 — 머지일이 바뀌면 날짜 다섯 자리를 옮기고 digest를 다시 받는다. Analytics 문장(`en.tsx:818`·`ko-privacy.tsx:110`)은 건드리지 않는다.
   검증: `policy-gate.test.tsx` green · `pnpm test` green.
   ── `docs(privacy): session lifetime 7 days from sign-in`
5. **가이드** — `guide/{en,ko,es}/self-hosting/troubleshooting.md:76·100`, `guide/{en,ko,es}/self-hosting/operate.md:112`(열린 세션이 사는 최대 기간 7일). `/guide` 규칙, 세 언어 같은 커밋.
   검증: `pnpm test` green.
   ── `docs(guide): session lifetime 7 days from sign-in`
6. **ARCHITECTURE §6.1.1** — 제목("로그인 뒤 7일 고정"), `session:` 설정 줄, 쿠키가 재발급되지 않는 근거(design §2-3), Codex #6 서술 갱신(그때의 sliding은 DB에만 닿았다), 연장 없음의 보증이 어댑터 no-op이라는 것, 기각한 대안 셋.
   검증: `rg -n '24시간|24 hours|24 horas|마지막 활동|last activity|última actividad|슬라이딩' docs/ARCHITECTURE.md auth.ts messages guide lib/auth` 결과가 JWT 이력(`ARCHITECTURE.md:2429`·`auth.ts:83`·`provider-config.test.ts:36`)과 Analytics 두 줄뿐이다.
   ── `docs(ARCHITECTURE): fixed 7-day session lifetime`
7. **실물 확인(로컬 dev)** — 대상은 **자기 세션 하나만**(상주 QA 사용자의 세션은 건드리지 않는다). 복구는 다시 로그인하면 된다.
   - 로그인 직후 쿠키 Expires와 DB `expires`가 같은 시각(로그인 + 7일)이다.
   - 1시간 넘게 활동한 뒤에도 DB `expires`가 그대로다(쓰기 없음).
   - DB `expires`를 1분 전으로 당기고 보호 페이지를 새로고침 → `/signin` 이동·행 삭제.
   - 같은 상태를 다시 만든 뒤 번역 워크스페이스에서 셀을 blur 저장 → draft가 화면에 남고 세션 danger Alert가 뜬다.
   검증: 수동 — `/runtime-test` 리포트 또는 `/implement` 보고에 쿼리 결과·쿠키 값 첨부.
8. **회고** — T0에서 쿠키 고정이 확인됐으면 `/postmortem`: 2026-09-06부터 방침·가이드·ARCHITECTURE가 "마지막 활동 뒤 24시간"이라 썼지만 실제는 로그인 뒤 24시간 고정이었다(Codex #6 수정이 DB에만 닿았다). 재발 방지 grep은 `rg -n '\bauth\(\)' app lib`(Set-Cookie를 버리는 호출부).
   검증: `docs/POSTMORTEM.md`에 항목 하나.
