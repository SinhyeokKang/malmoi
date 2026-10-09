# B3 — DB·운영 명령 (self-hosting)

공통 규칙: `docs/features/self-hosting/brief-common.md`를 먼저 읽는다.

## 담당 태스크
tasks §3 전부 + tasks §1의 "self-hosted credential target 파서" 항목(orch.md 결정 — B3로 옮김).

1. `deploy/bootstrap.sql`(design §4의 1~3: 런타임 롤 멱등 생성 · `GRANT USAGE` + `GRANT … ON ALL TABLES/SEQUENCES` · `ALTER DEFAULT PRIVILEGES FOR ROLE <migrate 소유자>`). 롤 이름·비밀번호 공급 방식은 psql 변수 등 단순한 쪽. `prisma/migrations/`에 넣지 않는다.
2. `lib/__tests__/self-hosted-bootstrap.integration.ts`를 기존 projects 스위트(`test:projects:postgres`)에 넣는다 — 사례 ①②③(tasks §3). `postgres` 롤로 SQL을 붓는 기존 방식으로 가리지 않는다.
3. `scripts/gate-plan.ts` projects 트리거에 `deploy/`·`lib/onboarding/workflow.ts`·`lib/oauth/endpoint.ts`·`lib/github-connect/origin.ts` 추가 + `gate-plan.test.ts` 단언. 새 GateStep 금지.
4. `CREDENTIAL_TARGET=self-hosted` — `lib/credentials/command.ts` 타입 확장·파서(hosted allowlist 유지 · query override 거절 · `postgres` 호스트만 평문), `scripts/finalize-credentials.ts:26-27` target별 명시 분기(self-hosted가 `PRISMA_TARGET=dev`를 세우지 않음), `conversion.test.ts` 사례 추가.

⚠️ `pnpm test:projects:postgres`·`test:credentials:postgres`는 로컬 PG 바이너리로 돈다 — `pnpm gate --base dev`가 트리거 경로면 스스로 붙인다. 스킵으로 green을 만들지 않는다(POSTMORTEM 2026-09-10).
검증은 tasks §3의 "검증:" 줄. 커밋 제목 제안: `feat(self-hosting): support standalone database operations`.
