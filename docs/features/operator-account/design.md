# operator-account — 설계

## 영향 받는 흐름

**프로젝트 생성(온보딩 ①·④ · MCP `list_repositories`·`create_project`), 복원(설정 · MCP `unarchive_project`), OWNER 승격(Members · MCP `change_member`), OWNER 초대 수락(`/invite`).** push·pull·export·편집·인가(`ProjectMember`)·인증 경계는 건드리지 않는다.

| 자리 | 지금 | 바뀜 |
|---|---|---|
| `lib/onboarding-run/repos.ts:57` — `listRepositories`(코어, `:49`)의 선조회 | `count(ownedActiveProjects) >= PROJECT_LIMIT` → `limit-reached` | 상한이면 `isOperatorUser`를 보고 운영자면 통과 |
| `lib/onboarding-run/create.ts:118-138` — `createProjectFromRepo`(코어, `:87`)의 선조회 + `planProjectCreate({ limit: PROJECT_LIMIT })` | 고정 3 | `limit = projectLimitFor(operator)` — `operator`는 `:118`의 `Promise.all`에 함께 넣어 기존 `ownerCount` 조회와 같은 실패 경로를 탄다 |
| `lib/onboarding-run/create.ts:224-225` — 잠금 안 재집계 | `owned >= PROJECT_LIMIT` → 롤백 | 같은 `limit`(tx 밖에서 한 번 계산 — allowlist는 정적이다) |
| `lib/projects/archive.ts:47-68` — `runUnarchive` | 상한을 안 본다 | `lockProjectAccess` 뒤 OWNER 전원을 잠그고 다시 센다(아래) |
| `lib/auth/members.ts:91` — `changeMemberRole` | 상한을 안 본다 | `nextRole === "OWNER"`이고 지금 OWNER가 아니면 대상자를 잠그고 다시 센다 |
| `app/invite/actions.ts:99` — `acceptInvitation` | 상한을 안 본다 | `invitation.role === "OWNER"`이면 소비(`updateMany`) 전에 수락자를 잠그고 다시 센다 |

**면제는 코어 안에서 계산한다, Action 래퍼에서가 아니다** — `listConnectableRepos`(`app/(edit)/projects/actions.ts:399`)·`createProject`(`:594`)는 코어를 감싼 Action이고, 래퍼에 넣으면 MCP `list_repositories`(`lib/mcp/tools/repos.ts:37`)·`create_project`가 계속 막힌다.

**모든 자리가 한 판정을 쓴다** — `repos.ts:13-17` 주석이 경고하듯 하나만 바뀌면 앞이 통과시킨 것을 뒤가 거부한다.

## 순수 함수 (= `/tdd interface` 진입점)

| 모듈 | 함수 | 계약 |
|---|---|---|
| `lib/operator/allowlist.ts` (신규 — import는 `lib/auth/email.ts` 하나, 그 파일은 import 0) | `parseOperatorEmails(raw: string \| undefined): ReadonlySet<string>` | 쉼표 분리 · 조각마다 `normalizeEmail`(trim + `toLowerCase` — 저장·병합과 **같은 함수**, gmail 점·`+` 태그를 접지 않는다) · `@`가 정확히 하나이고 앞뒤가 비지 않은 것만 · 빈 조각 무시 · 중복은 Set이 접는다(대소문자만 다른 둘도 하나) · `undefined`/빈 문자열 → 빈 집합. Set이라 프로토타입 키 문제 없음 |
| `lib/onboarding/create-plan.ts` | `projectLimitFor(operator: boolean): number` | 운영자면 `Infinity`, 아니면 `PROJECT_LIMIT` — 상한 상수 옆에 둔다 |

- `planProjectCreate`는 이미 `limit`을 인자로 받는다(`create-plan.ts:31-40`). `Infinity`를 넣으면 `ownerCount >= limit`이 늘 거짓이라 **그 함수는 바뀌지 않는다.** `@param limit` JSDoc("테스트가 경계를 밟기 위해서")과 `PROJECT_LIMIT` 머리 주석(`:12-15`)은 사용자별 값이 들어오는 사실로 고친다.
- ⚠️ **`projectLimitFor`의 반환값은 비교에만 쓴다** — 문구·결과 타입(`ConnectableReposResult` 등)·MCP 응답에 싣지 않는다. 문구는 계속 `PROJECT_LIMIT` 상수를 보간한다(`lib/onboarding/message.ts:141`, `components/onboarding/steps/repo.tsx:433`). 실으면 화면에 `∞`, MCP JSON에 `null`이 나간다.
- ⚠️ **`create-plan.ts`는 클라이언트 그래프다**(`"use client"`인 `components/onboarding/steps/repo.tsx:22`가 import) — `projectLimitFor`는 순수해야 하고 `lib/operator/`를 import하지 않는다.
- 교집합 함수(`isOperator`)는 두지 않는다 — 껍데기가 그 사용자의 `emailLookup` 하나를 집합에 견준다(아래).

**모듈을 나누는 근거**: 순수 파싱과 DB 껍데기(`server-only` — `lookupEmail`이 키를 읽는다)의 분리, 그리고 **축의 분리** — 운영자는 계정 축 판정이고 상한 소비는 `lib/onboarding/`·`lib/projects/`에 남는다.

## 껍데기

### `lib/operator/user.ts` (신규, `server-only`)

`isOperatorUser(db: Pick<PrismaClient, "user"> | Prisma.TransactionClient, userId: string, source = process.env): Promise<boolean>`

- `optionalEnv("OPERATOR_EMAILS", source)`를 **함수 안에서** 읽는다(모듈 최상위·기본 인자 평가 금지 — POSTMORTEM 2026-08-31). `source`는 `lib/env.ts:28`이 이미 받는 형이고, 테스트와 postgres 스위트가 셸 env에 기대지 않게 한다.
- 집합이 비면 DB를 읽지 않고 `false`(운영자가 없는 환경의 비용 0).
- 아니면 `user.findUnique({ where: { id: userId }, select: { emailLookup: true } })` → 그 값이 `new Set([...emails].map(e => lookupEmail(e)))`에 들어 있나. PK로 한 행이다.
  - `lookupEmail`(`lib/credentials/storage.ts:66`, 스코프 `user`)은 **병합·로그인이 `User.emailLookup`을 만든 것과 같은 HMAC**이고 안에서 `normalizeEmail`을 지난다(`lib/credentials/crypto.ts:58-62`) — 그래서 대소문자만 다른 env 주소도 맞는다. 평문 `User.email`을 복호해 비교하지 않는다(봉투를 열 이유가 없다).
  - `emailLookup`이 `null`인 행(전환 도구의 미채움 — `prisma/schema.prisma:551-557`)은 운영자가 아니다.
  - ⚠️ **lookup 키를 회전하는 도중**에는 저장값이 옛 키라 일치하지 않을 수 있다 — 그때 결과는 "운영자 아님"(fail-closed)이고 회전이 끝나면 돌아온다. 키 자체가 없으면 `lookupEmail`이 던진다(아래 catch 없음과 같은 경로).
  - `id`로 좁힌다(POSTMORTEM 2026-09-06 — 사용자에 속한 행은 그 사용자로).
- **catch하지 않는다** — 조회 실패는 던진다(spec C4).

### 상한 재집계 — `lib/projects/owner-limit.ts` (신규, `server-only`)

복원·승격·수락이 같은 형을 쓴다:

`lockOwnerSlots(tx, userIds: readonly string[]): Promise<string[]>` — 상한을 넘게 될(운영자가 아닌) userId 목록. 빈 배열이면 통과.

1. `userIds`를 **id 순으로 정렬**해 `SELECT "id" FROM "User" WHERE "id" = … FOR UPDATE`로 잠근다 — 생성 경로(`create.ts:219`)와 같은 잠금이라 같은 사용자의 동시 생성·복원이 직렬화된다.
2. 각자 `projectMember.count({ where: ownedActiveProjects(id) })`.
3. `owned >= PROJECT_LIMIT`인 사람만 `isOperatorUser(tx, id)`를 본다(상한에 안 닿은 사람은 조회 0).
4. 운영자가 아닌 사람을 돌려준다.

- **잠금 순서**: 복원·승격은 `lockProjectAccess`(Project) → User 순이고, 생성은 User만, 수락은 초대 판정 → User다. Project↔User 역순 잠금이 없어 교착이 생기지 않는다. 여러 User는 id 순이다.
- 복원: OWNER 전원(`projectMember.findMany({ where: { projectId, role: "OWNER" } })` — 보관된 프로젝트라 지금 그들의 활성 수에 안 들어 있다)을 넘긴다.
- 승격·수락: 대상자 하나를 넘긴다.
- 생성의 재집계(`create.ts:224-225`)는 이 함수로 옮기지 않는다 — 이미 잠금이 있고, `limit`이 tx 밖에서 계산된다. 판정의 단위(`ownedActiveProjects` · `PROJECT_LIMIT` · `isOperatorUser`)가 같으면 된다.

### 거부 결과

| 자리 | 결과 | 문구 |
|---|---|---|
| 복원 | `{ ok: false, error: "owner-limit-reached" }` | `accessErrorMessage`(`lib/auth/message.ts:57`)에 한 줄 — 행위자 본인인지 다른 OWNER인지 가르지 않는다(누가 넘는지는 Members에서 보인다) |
| 승격 | 같은 코드 | 같은 문구 |
| 수락 | `InviteError`에 `"limit-reached"` 추가(`lib/auth/message.ts:67` — union이라 문구 누락은 `satisfies`가 잡는다) | "보관한 뒤 이 링크로 다시 수락" — 초대는 롤백으로 살아 있다 |
| MCP | `unarchive_project`·`change_member`는 같은 코어의 결과를 기존 매핑(`lib/mcp/result.ts`)으로 낸다 | 같은 문구 |

숫자는 `PROJECT_LIMIT` 상수를 보간한다(운영자는 거부를 받지 않으므로 3이 참이다).

## 새 환경변수

- `OPERATOR_EMAILS` — `optionalEnv`. 형식 `"me@example.com,other@example.com"`. `.env.example`에 주석과 함께 추가(실제 주소는 넣지 않는다).
- 값의 출처: 운영자가 로그인한 계정의 이메일 주소(GitHub·Google 어느 쪽으로 들어와도 같은 `User`다). ⚠️ **개인정보다** — Vercel에 Sensitive로 넣는다. **도메인 단위 지정은 하지 않는다**(spec 비목표).
- Vercel: Production·Preview **환경별 변수**로 넣는다(CLAUDE.md — 한 변수로 묶으면 `vercel env rm … preview`가 Production까지 지운다). ⚠️ env는 **다음 배포부터** 적용된다 — Preview는 `/push` 전, Production은 `/merge` 전에 넣는다(나중이면 재배포). ⚠️ `vercel env add`의 성공 메시지를 근거로 삼지 않는다(OPERATIONS 확인 절차).

## 스키마 변경

없음.

## 불변식 영향

- export·blob SHA·병합 없음 원칙과 무관하다.
- **불변식 7(권한은 로그인 provider가 아니라 `ProjectMember`)은 유지되고 단서가 붙는다**: 프로젝트 권한은 여전히 `ProjectMember`뿐이고, 운영자는 계정 축 **쿼터**만 바꾼다. ARCHITECTURE 인증 경계 표에 `운영자 판정 | User.emailLookup × OPERATOR_EMAILS | 인가 아님` 행을 더한다.
- 인가(`lockProjectAccess` 16자리)는 바뀌지 않는다 — 복원·승격은 그 뒤에 User 잠금을 더할 뿐이다.

## 개인정보 방침

새 목적·전송처·쿠키·보존 없음 — 주소는 이미 `User.email`(봉투)·`emailLookup`으로 저장되는 값이고, 환경변수에 운영자 본인 주소를 둘 뿐이다. `/push` 4단계에서 확인만 한다.

## 과거 함정 (POSTMORTEM)

- **2026-09-07 리뷰 🟡7 / ARCHITECTURE §3.1** — 상한의 실제 방어선은 트랜잭션 안 재집계다. 면제를 선조회에만 넣으면 재집계가 거부한다 → 같은 판정 + 테스트(tasks T3). 복원·승격·수락도 같은 이유로 **잠금 안에서** 센다.
- **2026-08-31 모듈 로드 시점 환경변수 요구로 CI red** — 환경변수는 `isOperatorUser` 안에서만 읽는다.
- **2026-09-06 사용자 축 조회의 주체 누락** — 판정 쿼리는 그 사용자의 `id`로 좁히고, 테스트는 주체를 둘 이상 둔다.
- **2026-09-03 실패를 "없음"으로 읽지 않는다** — 조회 실패는 던진다.

## 문서 갱신 (`/implement`·`/push` 신선도 단계 — 여기서 직접 고치지 않는다)

- PRODUCT §3:57(문장 개정 — 미뤄 둔 플랫폼 관리자의 최소형 · 권한은 소비자마다 PRODUCT 판정) · §3:199(이메일 주소는 식별자일 뿐 역할이 아님) · §4.2 계정 축(:351 — 운영자 면제와 그 근거 "자율 가입자가 아니다" · 상한이 걸리는 자리 넷 · 기존 초과 유지) · :366(삭제 화면을 안 만드는 근거 "프로젝트 3"에 "운영자 제외").
- ARCHITECTURE §0 불변식 7 단서 · §3.1(판정이 사용자별 · 자리 넷 · 같은 판정) · §5.6.4(:1901 — 보관이 슬롯을 비우고 복원은 잠금 안에서 다시 센다) · :1384(`ProjectMember` 인덱스 근거 "사용자당 프로젝트 3"에 "운영자 제외") · :1498(대화형 tx 사용처에 복원·승격·수락의 User 잠금) · 인증 경계 표 운영자 판정 행 · 운영자 판정 절(병합과 같은 `emailLookup` 기준 · fail-closed · 도메인 지정을 안 하는 이유 · lookup 키 회전 중 동작 · `AUTH_ALLOWED_LOGINS`와의 차이).
- OPERATIONS: 값 넣기(Sensitive — 개인정보) · 확인 한 문장(spec C14) · 환경별 변수 · 다음 배포부터 적용.
- DIRECTORY: `lib/operator/` · `lib/projects/owner-limit.ts`.
- 가이드 `guide/reference/limits.md:7` — "Archiving frees a slot"에 복원·OWNER 승격·OWNER 초대 수락도 상한에서 막힌다는 문장. **운영자는 언급하지 않는다**(C13). `guide/setup/create-project.md:5`는 그대로.
- `guide/SHOOTING.md` 진행 상태의 "보관해서 자리 만들기" 절차 — 운영자를 켠 뒤 낡는다.
- `.env.example`.
- **CLAUDE.md는 고치지 않는다.**
