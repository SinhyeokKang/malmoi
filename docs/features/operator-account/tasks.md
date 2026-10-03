# operator-account — 태스크

순서: 순수 함수 → 껍데기 → 상한 배선 → 문서. 모든 커밋 경계에서 `pnpm typecheck && pnpm test` green.

- **T1. 순수 함수**
  - `lib/operator/allowlist.ts`: `parseOperatorGithubIds` · `isOperator`. `lib/onboarding/create-plan.ts`: `projectLimitFor`.
  - 테스트 먼저: `parseOperatorGithubIds` — `undefined`·`""`·`" "` → 빈 집합 / `"1, 2,,x,3 "` → `{1,2,3}` / `"__proto__"` 무시. `isOperator` — 교집합 있음/없음/빈 배열. `projectLimitFor(true)` → `Infinity`, `false` → `PROJECT_LIMIT`.
  - 검증: `lib/operator/__tests__/allowlist.test.ts`·`lib/onboarding/__tests__/create-plan.test.ts` green.
  - `[commit] feat(operator): parse the static operator allowlist`
- **T2. 껍데기 `lib/operator/user.ts`의 `isOperatorUser`**
  - 테스트(Prisma 대역): env 없음 → `account.findMany` 미호출 · `false` / env에 든 GitHub id를 가진 `Account(provider = 로그인 공급자)` → `true` / 같은 id라도 `provider`가 `APP_ACCOUNT_PROVIDER`면 `false` / `where.userId`로 좁힌다.
  - 검증: 테스트 green. 소스에 모듈 최상위 `optionalEnv` 호출 0. `lib/github-connect/__tests__/credential-separation.test.ts` green(자격증명 경계).
  - `[commit] feat(operator): resolve operators from the GitHub sign-in account`
- **T3. 상한 배선 (첫 소비자)**
  - `listConnectableRepos`(`repos.ts:57`) · `createProject` 선조회(`create.ts:120-137`) · 잠금 안 재집계(`create.ts:224-225`)가 `projectLimitFor(await isOperatorUser(...))`의 한 값을 쓴다. MCP `create_project`는 같은 코어 — 그 경로 테스트 하나로 확인.
  - 테스트: 운영자가 OWNER 활성 3개일 때 ①이 `limit-reached`를 내지 않고 생성 성공 / 비운영자는 기존 테스트 그대로 `limit-reached`(C5) / env 미설정이면 같은 계정도 3에서 막힘(C2) / 운영자라도 남의 프로젝트 인가는 그대로 거부(C6 — 기존 인가 테스트 하나에 운영자 env를 켠 케이스).
  - 검증: 위 테스트 green. 기존 `limit-reached` 테스트(온보딩·MCP) 무수정 green. 트리거되면 `pnpm test:projects:postgres` green(`pnpm gate`가 판정).
  - `[commit] feat(onboarding): exempt operators from the project limit`
- **T4. 환경·문서**
  - `.env.example`에 `OPERATOR_GITHUB_IDS=""` + 주석(형식 · fail-closed · 로그인 공급자 계정 기준 · 프로젝트 역할 아님 · GitHub 숫자 id 얻는 법).
  - PRODUCT §3·§4.2, ARCHITECTURE §3.1 + 운영자 판정 절, OPERATIONS(값 넣기·확인 — dev `.env.local`은 사람이 채운다, Vercel은 환경별), 필요 시 CLAUDE.md 한 줄 — 문서별 커밋.
  - 검증: `pnpm sync:agents:check` green. grep: PRODUCT에 `운영자`·`OPERATOR_GITHUB_IDS` 존재, §3 역할 표는 둘 그대로.
  - `[commit] docs(PRODUCT|ARCHITECTURE|OPERATIONS): …` · `chore(env): document OPERATOR_GITHUB_IDS`
- **T5. 수동 확인 (dev)**
  - 사람이 `.env.local`에 본인 GitHub id를 넣고(⚠️ 에이전트가 `.env.local`을 편집하지 않는다) `pnpm dev` → OWNER 활성 3개 상태에서 `/projects/new` ①이 리포 목록을 보이고 생성이 된다. 값을 빼면 다시 막힌다.
  - 검증: 수동(`/runtime-test`).
- **T6.** `pnpm gate` green → `/push`. Production 값은 `/merge` 전 사람이 Vercel에 넣는다(OPERATIONS 절차).
