# operator-account — 설계

## 영향 받는 흐름

**편집 UI의 프로젝트 생성(온보딩 ①·④)과 MCP `create_project`만.** push·pull·export·편집·인가(`ProjectMember`)·인증 경계는 건드리지 않는다.

| 자리 | 지금 | 바뀜 |
|---|---|---|
| `lib/onboarding-run/repos.ts:57` (`listConnectableRepos` 선조회) | `count(ownedActiveProjects) >= PROJECT_LIMIT` → `limit-reached` | `limit = projectLimitFor(await isOperatorUser(...))` |
| `lib/onboarding-run/create.ts:120,133-137` (선조회 + `planProjectCreate({ limit: PROJECT_LIMIT })`) | 고정 3 | 같은 `limit` |
| `lib/onboarding-run/create.ts:224-225` (잠금 안 재집계) | `owned >= PROJECT_LIMIT` → 롤백 | 같은 `limit` |

**세 자리가 한 값을 쓴다** — `repos.ts:13-17` 주석이 경고하듯 하나만 바뀌면 앞이 통과시킨 것을 뒤가 거부한다. 생성 경로는 선조회와 재집계가 한 함수 안이라 `limit`을 한 번 계산해 둘에 넘기고, ①은 별도 요청이라 같은 함수를 다시 부른다.

## 순수 함수 (= `/tdd interface` 진입점)

| 모듈 | 함수 | 계약 |
|---|---|---|
| `lib/operator/allowlist.ts` (신규, 잎 — import 0) | `parseOperatorGithubIds(raw: string \| undefined): ReadonlySet<string>` | 쉼표 분리 · trim · `^\d+$`만 · 빈 조각 무시 · `undefined`/빈 문자열 → 빈 집합. Set이라 프로토타입 키 문제 없음 |
| 같은 파일 | `isOperator(githubIds: readonly string[], operators: ReadonlySet<string>): boolean` | 교집합이 있으면 참 |
| `lib/onboarding/create-plan.ts` | `projectLimitFor(operator: boolean): number` | 운영자면 `Infinity`, 아니면 `PROJECT_LIMIT` — 상한 상수 옆에 둔다(소비자 옆) |

`planProjectCreate`는 이미 `limit`을 인자로 받는다(`create-plan.ts:28-30`). `Infinity`를 넣으면 `ownerCount >= limit`이 늘 거짓이라 **그 함수는 바뀌지 않는다.**

**운영자 판정(`lib/operator/`)과 그 소비(상한)를 다른 모듈에 둔다** — 백오피스가 올 때 `lib/operator/`만 가져다 쓰고 상한과 엮이지 않는다. 권한 표는 만들지 않는다(spec 비목표).

## 껍데기

- `lib/operator/user.ts`(신규, `server-only`): `isOperatorUser(prisma, userId): Promise<boolean>`
  - `optionalEnv("OPERATOR_GITHUB_IDS")`를 **함수 안에서** 읽는다(모듈 최상위 평가 금지 — CLAUDE.md, POSTMORTEM 2026-08-31).
  - 집합이 비면 DB를 읽지 않고 `false`(운영자가 없는 환경의 비용 0).
  - 아니면 `prisma.account.findMany({ where: { userId, provider: "github" }, select: { providerAccountId: true } })` → `isOperator`.
  - ⚠️ **`provider: "github"`는 Auth.js 로그인 공급자다** — 계정 연결용 `APP_ACCOUNT_PROVIDER`(`lib/github-connect/account-link.ts`)가 아니다. 섞으면 "이 사람이 누구인가"가 아니라 "어느 설치를 보나"로 운영자가 정해진다(CLAUDE.md "GitHub 자격증명이 셋"). 로그인 공급자 id 문자열은 `auth.ts`의 정의를 상수로 가져다 쓴다(리터럴 사본 금지).
  - 쿼리는 `userId`로 좁힌다(`Account`는 `projectId`가 없는 사용자 축).
- `createProject`의 `limit`은 **트랜잭션 밖에서 한 번** 계산해 재집계에 넘긴다 — allowlist는 정적이라 잠금 동안 바뀌지 않는다.

## 백오피스 대비 (이번에 만들지 않는다 — 판정만 남긴다)

- 백오피스가 오면 진입점(라우트·Action)이 `isOperatorUser`로 막는다. 그때 정할 것: 세션의 로그인 공급자를 GitHub으로 한정할지(지금 판정은 "GitHub 로그인 계정이 **연결된** 사용자"라 Google로 로그인한 세션도 통과한다), 운영자 행동을 `ProjectEvent`처럼 남길지. 이번 기능의 상한 면제는 둘 다 필요 없다.

## 새 환경변수

- `OPERATOR_GITHUB_IDS` — `optionalEnv`. 형식 `"12345678,23456789"`. `.env.example`에 주석과 함께 추가.
- 값의 출처: GitHub 사용자 숫자 id(`https://api.github.com/users/<login>`의 `id`). 로그인명은 바뀔 수 있어 쓰지 않는다.
- Vercel: Production·Preview **환경별 변수**로 넣는다(CLAUDE.md — 한 변수로 묶으면 `vercel env rm … preview`가 Production까지 지운다). ⚠️ `vercel env add`의 성공 메시지를 근거로 삼지 않는다(OPERATIONS 확인 절차).

## 스키마 변경

없음.

## 불변식 영향

없음 — export·blob SHA·인증 경계·병합 없음 원칙과 무관하다. 인가(`ProjectMember`)도 바뀌지 않는다: 운영자는 "몇 개를 만들 수 있나"만 바꾸고 "무엇을 볼 수 있나"는 바꾸지 않는다.

## 개인정보 방침

새 목적·전송처·쿠키·보존 없음 — GitHub 숫자 id는 이미 로그인으로 저장되는 `Account.providerAccountId`이고, 환경변수에 운영자 본인 id를 둘 뿐이다. `/push` 4단계에서 확인만 한다.

## 과거 함정 (POSTMORTEM)

- **2026-09-07 리뷰 🟡7 / ARCHITECTURE §3.1** — 상한의 실제 방어선은 트랜잭션 안 재집계다. 면제를 선조회에만 넣으면 재집계가 거부한다 → 세 자리 동일 값과 테스트(tasks T3).
- **2026-08-31 모듈 로드 시점 환경변수 요구로 CI red** — 환경변수는 `isOperatorUser` 안에서만 읽는다.

## 문서 갱신 (`/implement`·`/push` 신선도 단계 — 여기서 직접 고치지 않는다)

- PRODUCT §3(운영자 = 플랫폼 계정 축, 프로젝트 역할 아님 · 지금 소비자 = 상한 면제), §4.2 "계정 축"(운영자 면제 등재).
- ARCHITECTURE §3.1(`limit`이 사용자별로 계산된다 · 세 자리 동일 값) + 운영자 판정 절(로그인 `Account` 기준 · fail-closed · `APP_ACCOUNT_PROVIDER`와 섞지 않음).
- OPERATIONS: 값 넣기·확인 절차.
- CLAUDE.md: "GitHub 자격증명이 셋" 근처에 운영자 판정이 로그인 공급자 계정을 쓴다는 한 줄(필요 시).
- `.env.example`.
