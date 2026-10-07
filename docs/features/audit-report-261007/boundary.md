# Boundary audit — 2026-10-07

## 결론 및 검증 한계

- 발견: 🔴 0 · 🟡 2 · ⚪ 0. GitHub 설치별 리포 조회의 401 분류 누락과 신규 프로젝트 생성의 요청 전체 다운로드 예산 누락이다. 인증 우회·테넌트 간 데이터 유출은 이번 정적 검사에서 확인하지 못했다.
- 기준: 시작 HEAD `bc8b204f18fa1aa88a0423e28f0789876f1fbf54` 일치. 최근 diff가 아니라 담당 경로의 전체 실행 경계를 검사했다.
- 미실행: 사용자 지시에 따라 빌드·typecheck·단위/DOM/통합 테스트·브라우저 왕복·실 GitHub OAuth 재인가를 실행하지 않았다. 아래 테스트 언급은 소스 독해 근거이며 실행 통과를 뜻하지 않는다.
- Vercel 실제 환경변수·Supabase Advisors 화면·실제 배포 RSC 응답은 검사하지 않았다. DB ACL은 dev/prod에 직접 읽기 전용 질의를 실행했다.
- 적용 스킬: `.agents/skills/source-command-audit/SKILL.md`, `/Users/sinhyeok/.agents/skills/orchestration/SKILL.md`. 정본 `CLAUDE.md`, `docs/PRODUCT.md`, `docs/ARCHITECTURE.md` 우선. UI는 리포 소유이며 자동 적재 보류는 pending/open PR/publish-raced까지 포함한다.
- 병렬 탐색: Codex 하위 에이전트 authz(auth/API/OAuth/MCP), tenancy(DB/env/credential/query), actions(Server Actions/GitHub 연결/초대/계정/업로드) 셋. 상위에서 DB ACL·검색/Inbox·사건 PII·교차 검토를 수행했다.

## 발견

### 1. 🟡 [boundary] 설치별 GitHub 401이 재인가 대신 일시 장애로 접힌다

- 위치: `lib/onboarding-run/access.ts:79`, `lib/onboarding-run/access.ts:97`, `lib/onboarding-run/access.ts:100`, `lib/onboarding-run/access.ts:109`.
- 근거: `checkRepoAccess`는 `listInstallationRepos` reject를 `{repos: [], error}`로 바꿔 Promise를 성공시킨다. 해당 실패는 바깥 catch의 401→reauthorize 분기로 도달하지 않는다. 전 설치 실패면 상태 코드와 무관하게 `unavailable`; 다른 설치만 성공했으나 요청 리포를 찾지 못하면 `repo-not-installed`다.
- 실패 시나리오: `ensureUserToken`이 아직 유효하다고 판단한 토큰으로 설치 목록을 받은 뒤, 설치별 리포 요청이 401을 받는다(두 요청 사이 인가 회수/만료). 설치가 하나라면 `createProject` 등 공유 코어 소비자는 재연결이 필요한 실패를 `unavailable`로 응답한다. 결과 분류 자체는 정적으로 확정되며 실제 GitHub에서 이 경합을 유발하지는 않았다.
- 정본: ARCHITECTURE §6.00·§6.4·§6.5.1, POSTMORTEM 「2026-09-19 — 인가를 철회한 사용자가 “잠시 뒤 다시”에 갇혔고, 그 자리만 401 규칙을 어기고 있었다」. 같은 파일 `listFailure`(`access.ts:30`)는 401 우선 규칙을 이미 구현하고, `lib/onboarding-run/repos.ts:153`은 이를 사용한다.
- 기존 테스트가 놓치는 이유: `app/(edit)/__tests__/onboarding.test.ts:1210`은 checkRepoAccess 경로의 설치별 전 실패에 **503만** 넣는다. 같은 파일 `:502`의 설치별 401 검사는 형제 `listConnectableRepos` 경로라 서로 다른 분기를 검사한다. 401을 주입해 실제 checkRepoAccess 소비자의 결과가 reauthorize인지 보는 검사가 비어 있다.
- 영향: 실패 폐쇄는 유지된다. 토큰/데이터 유출이 아니라 잘못된 복구 안내이므로 심각 등급으로 올리지 않았다.
- 수정 방향: 요청 리포를 찾지 못한 설치별 실패 목록에서 401을 먼저 분류하고, 기존 부분 성공 허용 정책은 보존한다.

### 2. 🟡 [boundary] 신규 프로젝트 생성은 소스마다 예산을 초기화해 요청 전체 상한을 넘긴다

- 위치: `lib/onboarding-run/create.ts:168`, `:172`, `:183`; `lib/import/read.ts:19` 및 `:20`.
- 근거: `CreateProjectInput.surfaces`는 min(1)만 요구하고(`create.ts:43`), 각 소스에서 `readFiles`를 새로 호출한다. `readFiles`는 매 호출마다 경로 수를 검사하고 `totalBytes=0`으로 시작한다. 생성 요청 전체의 파일 수/바이트를 합치는 검사는 없다. `prepared`가 각 결과 payload를 끝까지 보관한다.
- 실패 시나리오: 쓰기 권한을 가진 자신의 리포에서 겹치지 않는 JSON 소스 둘을 제출한다. 각 소스가 파일당 2MB 미만인 파일 넷으로 약 6MB를 이루면, 두 `readFiles` 호출은 각각 10MB 이하로 통과하지만 생성 요청은 총 12MB를 다운로드·파싱한다. 값/키/행 상한 내의 정상 카탈로그로 구성할 수 있고, 결과 경로가 겹치지 않아 소유권 검사도 이 초과를 막지 않는다. 이는 코드 흐름으로 판정했으며 실물 대용량 요청은 보내지 않았다.
- 같은 결함의 증폭 경로: 동일 소스를 반복 제출해도 `create.ts:205`의 소유권 검사가 다운로드·파싱 **뒤**에 있어 실패 전에 같은 작업을 반복한다. 입력 본문은 경로만 담으므로 Server Action 4MB 본문 제한이 원격 다운로드 합계를 제한하지 않는다. 플랫폼 실행시간 상한은 있으므로 무제한 실행 또는 실제 서비스 장애를 주장하지 않는다.
- 정본: PRODUCT §4.2 첫 적재 200파일/파일당 2MB/합계 10MB; ARCHITECTURE `:1559` 공통 예산. 형제 `lib/onboarding-run/add.ts:81`은 “표면별 다운로드는 상한을 N배로 넓힌다”는 이유로 `:82`에서 선택 파일 합집합을 한 번만 읽는다.
- 기존 테스트가 놓치는 이유: `app/(edit)/__tests__/onboarding.test.ts:1890`의 다중 소스 budget fixture는 두 번째 소스 **파일 하나**를 2,000,001바이트로 만들어 개별 파일 제한만 검사한다. `:1906`의 중복 표면 테스트는 최종 path-conflict/DB 쓰기 0만 단언하며 다운로드 선차단을 보지 않는다. 요청 합산 예산 검사는 `:2178`에 있으나 **addSurfaces** 경로만 검사한다.
- 영향: 요청당 자원 상한 계약 위반. 인가된 리포만 읽으므로 SSRF/테넌시 우회로 분류하지 않는다.
- 수정 방향: create도 소스별 준비 전에 선택 파일 합집합의 예산을 검사하고 한 번 읽어 재사용하며, 중복 선택은 다운로드 전에 거부한다.

## dev/prod 직접 DB ACL 검사

실행: 설치된 `pg`와 dotenv를 Node stdin으로 사용. `.env.local`의 `DIRECT_URL`/`DIRECT_URL_PROD`는 프로세스 안에서만 읽었고 원문·호스트·비밀번호는 출력하지 않았다. 연결 옵션 `default_transaction_read_only=on`, `BEGIN READ ONLY`, 종료 `ROLLBACK`; 데이터 쓰기·DDL·마이그레이션 없음. 접속·statement timeout 15초.

| 검사 | dev | prod | 판정 |
|---|---|---|---|
| transaction_read_only | on | on | 읽기 전용 |
| 실행 역할 / bypassrls | postgres / true | postgres / true | 정본의 알려진 상태 |
| anon public USAGE / CREATE | false / false | false / false | 차단 |
| authenticated public USAGE / CREATE | false / false | false / false | 차단 |
| role_table_grants의 두 API 역할 | 0행 | 0행 | 현재 직접 테이블 grant 없음 |
| has_table_privilege로 계산한 SELECT/INSERT/UPDATE/DELETE | 0행 | 0행 | 현재 상속 포함 권한 없음 |
| public/global default ACL | 0행 | 6행 | 아래 설명 |
| public 테이블 RLS / FORCE RLS | 22개 모두 false / false | 22개 모두 false / false | 스키마 USAGE가 방어선이며 RLS 미사용은 알려진 결정 |

prod 기본 ACL: `supabase_admin` 소유 table/sequence/function 3행은 anon/authenticated/service_role 허용을 유지한다. `postgres` 소유 3행은 postgres/service_role만 허용한다. ARCHITECTURE §7(`docs/ARCHITECTURE.md:3821`)에 이미 명시된 차이로 신규 결함이 아니다. 새 테이블 grant가 생겨도 스키마 USAGE 회수가 접근을 막는다. 관련 마이그레이션은 `prisma/migrations/20260926175555_revoke_public_schema_usage_from_api_roles/migration.sql:7` 및 `:19`(PUBLIC 상속도 회수).

검사 SQL(대상별 동일 실행; 결과에는 자격증명이 없다):

```sql
SELECT current_user,current_setting('transaction_read_only') AS read_only,rolbypassrls
FROM pg_roles WHERE rolname=current_user;
SELECT rolname,has_schema_privilege(rolname,'public','USAGE') AS usage,
 has_schema_privilege(rolname,'public','CREATE') AS create
FROM pg_roles WHERE rolname IN ('anon','authenticated');
SELECT grantee,table_name,string_agg(DISTINCT privilege_type,',')
FROM information_schema.role_table_grants
WHERE table_schema='public' AND grantee IN ('anon','authenticated') GROUP BY 1,2;
SELECT r.rolname,c.relname FROM pg_roles r CROSS JOIN pg_class c
JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE r.rolname IN ('anon','authenticated') AND n.nspname='public'
AND c.relkind IN ('r','v','m','p','f')
AND (has_table_privilege(r.oid,c.oid,'SELECT') OR has_table_privilege(r.oid,c.oid,'INSERT')
 OR has_table_privilege(r.oid,c.oid,'UPDATE') OR has_table_privilege(r.oid,c.oid,'DELETE'));
SELECT pg_get_userbyid(defaclrole),coalesce(n.nspname,'GLOBAL'),defaclobjtype,
 array_to_string(defaclacl,' | ') FROM pg_default_acl d
LEFT JOIN pg_namespace n ON n.oid=d.defaclnamespace
WHERE n.nspname='public' OR d.defaclnamespace=0;
SELECT relname,relrowsecurity,relforcerowsecurity FROM pg_class c
JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND relkind IN ('r','p') ORDER BY 1;
```

대조된 22개 테이블: Account, ApiToken, DeliveryConfirmation, KeyRef, Locale, OAuthAuthorizationRequest, OAuthCode, OAuthConnection, OAuthRefreshHistory, Project, ProjectEvent, ProjectInvitation, ProjectMember, Session, StringKey, SyncRun, Translation, TranslationBaseline, TranslationSurface, User, VerificationToken, _prisma_migrations.

## 상위 교차 검사

- `app/search/actions.ts` → `lib/keys/search.ts`: 세션 userId로 `ProjectMember` 및 비보관 Project를 SQL 안에서 확정한다. activeSlug는 정렬 힌트이고 인가 범위가 아니다. 키/번역 양쪽 질의가 이 집합에 묶인다.
- `app/inbox/actions.ts` → `lib/inbox/load.ts`: 현재 userId의 비보관 프로젝트 목록에서 ids를 만들어 집계하며, 읽음 시각 쓰기도 세션 userId에만 조건부 적용한다.
- `lib/events/query.ts:112,134,150,292`: 목록·상세·행위자·소스 조회에 projectId를 넣는다. `present`는 사용자 id 중복을 제거하고 마스킹하므로 사건 2개가 자기 이메일을 노출하던 #146 패턴이 남지 않았다.
- `lib/failure.ts`·`lib/github-connect/log.ts`: 외부 오류 전문 대신 분류만 로그에 남긴다. `rg -n 'console\.|logger\.|fetch\(|\$queryRawUnsafe|\$executeRawUnsafe|dangerouslySetInnerHTML|rewrites' app lib auth.ts middleware.ts next.config.ts --glob '!**/__tests__/**'`의 히트를 검토했다. backfill Unsafe 호출은 상수 SQL이고 JSON-LD는 `jsonLdHtml`로 script 탈출 문자를 이스케이프한다.
- `lib/seo/analytics.ts`: 공개 경로 허용목록과 query/hash 제거. 초대·프로젝트·OAuth URL은 통과하지 않는다.
- `lib/upload/store.ts:42`: 외부 요청에 브라우저 헤더를 전달하지 않고 redirect를 거부한다. 본문 await가 catch 안(`:59`)에 있다.
- `lib/oauth-server/client-metadata-fetch.ts:43,57,68`: DNS와 HTTPS가 공통 마감을 쓰고, 고정 IP/redirect 금지/응답 byte 제한이 있다.

## POSTMORTEM 재검 기록

항목 번호는 현재 파일의 `^### 20` 순서다(총 143). 과거 파일명·정책은 현재 정본과 실제 이관 경로로 해석했다. 실행 금지된 테스트 명령 대신 검색 및 소스 검토를 수행했으며, 런타임만 판정 가능한 항목은 미완으로 표기한다.

### 상위가 추가로 재검한 항목

| 항목 헤딩 | 실행 명령 / 소스 근거 | 판정 |
|---|---|---|
| #38 2026-09-09 — 앱 층 인가를 촘촘히 만들었는데 DB가 인터넷에 열려 있었다 (Supabase advisor가 알려줬다) | 위 여섯 읽기 전용 SQL, `rg -n 'REVOKE.*USAGE|FROM PUBLIC|authenticated|anon' prisma/migrations --glob '*.sql'` | dev/prod 스키마 USAGE 차단 확인. Advisors 화면은 미검사 |
| #45 2026-09-09 — 검증이 탐지 경로에만 있었고 적재 경로에 없어, 페이로드가 리포 경로를 정했다 | `rg -n 'replaceAll\("\{locale\}"|path\.join\(' lib app --glob '!**/__tests__/**'`; `rg -n 'isPathSafe(Locale|RepoPath)\(' lib app --glob '!**/__tests__/**'`; `lib/pull/plan.ts:132` 안전/모양 검사, `lib/push/plan.ts` 경계 스키마 | 정적 재발 없음. survey는 읽기 전용, adapter writer의 경로는 상위 검증값 |
| #46 2026-09-09 — 주석이 방어를 서술하고 코드는 안 했다 (catch는 오류일 때만 돈다) | `rg -n 'statSync\(' lib scripts --glob '!**/__tests__/**'`; `lib/cli/walk.ts:49` inode 식별, 뒤 withFileTypes + isSymbolicLink 제외; `lib/survey/run.ts:61` lstat 선검사; `scripts/guide-check.ts:67` 자사 guide 소스 목록 | 외부 트리 링크 추종 패턴 정적 재발 없음 |
| #49 2026-09-10 — YAML 자원 제한이 문자열을 구조로 읽어 우회와 오탐을 함께 만들었다 | `rg -n 'quote|parseDocument|new Parser' lib/onboarding/budget.ts lib/adapters --glob '!**/__tests__/**'`; budget.ts:65의 실제 Lexer/Parser 및 stack 검사 | 정적 재발 없음. Parser 내부 API 실동작은 미실행 |
| #111 2026-09-19 — 개인정보처리방침이 코드와 어긋난 문장 셋을 실은 채 green이었다 | `rg -n 'projectInvitation.delete|session.deleteMany|verificationToken.delete|id_token:|session_state:|token_type:' app lib --glob '*.ts' --glob '!**/__tests__/**'`; credential adapter/회수 store가 제시·시도 시 청소; OAuth token_type은 저장 아닌 응답 계약 | 옛 로그인 provider 필드 쓰기 및 초대 삭제 재발 없음. 방침 전체 법률 검수는 대상 외 |
| #117 2026-09-20 — 활동 판정은 통과했지만 조회·렌더·적재 연결에서 사실이 달라졌다 | `rg -n 'pendingEdits !== null|finishedAt: row.finishedAt|PROJECT_WIDE|before: project\.' lib/events components/logs app`; query.ts는 syncRun.finishedAt 우선, PROJECT_WIDE 별도 분기, 멤버 payload display 래퍼 | boundary 관련 정적 재발 없음. DOM 동작은 미완 |
| #131 2026-09-28 — Next 외부 rewrite가 세션 쿠키를 제3자 호스트로 넘긴다 | `rg -n 'async rewrites|destination:\s*[`"]https?://' next.config.ts vercel.json` 0건; readImage fetch 옵션에 headers 없음 | 정적 재발 없음 |
| #133 2026-09-29 — 사건 목록의 행위자 라벨이 사건 2개 이상인 사람의 원문 이메일을 실었다 | `rg -n 'maskedEmailLabels\(|people\.has|new Set|distinct:' lib/events/query.ts lib/auth/query.ts lib/keys/query.ts app components --glob '!**/__tests__/**'`; events/query.ts:151,183 및 auth/query.ts:188 | 사람/주소 단위 중복 제거 확인. events/query.integration.ts:354 직렬화 노출 가드 소스 확인, 실행 안 함 |
| #143 2026-10-07 — 비동기 경계와 검증 트리거가 구현의 끝까지 닿지 않았다 | `rg -n 'arrayBuffer|withinDeadline|timeoutMs' lib/upload/store.ts lib/oauth-server/client-metadata-fetch.ts`; `rg -n 'oauth-server|lib/mcp' scripts/gate-plan.ts vitest.projects.config.ts` | 본문 await catch 및 공통 마감, OAuth/MCP 게이트 경로 정적 확인. 테스트 미실행 |

### 병렬 탐색 통합 재검표

POSTMORTEM 전체 2706행은 세 탐색 에이전트가 분담하여 출력 잘림 구간까지 보완했다: authz 1–900(150행 단위, 751–900은 75행 및 800–826 보충), actions 901–1800(150행 단위), tenancy 1801–2706(2160–2195·2550–2585·2580–2635 보충). 모든 143개 헤딩을 분류했으며 아래는 boundary 관련 항목이다. 앞 표와 같은 항목은 교차 확인이다. “재발 없음”은 정적 소스 판정 범위다.

검색 명령 묶음(각 에이전트 또는 상위에서 실제 실행한 명령; 파일 전문/해당 함수 읽기를 함께 수행):

```sh
# ENV
rg -n 'requireEnv\(|optionalEnv\(|process\.env' lib app scripts auth.ts prisma.config.ts next.config.ts
# AUTH
rg -n 'requireUser\(|readSession|requireAccess|authorize|assert|lockProjectAccess' 'app/(edit)' app/invite app/ui-locale --glob '*actions.ts'
# OWNER
rg -n 'prisma\.(account|session|user)\.' app lib -g '*.ts' -g '!**/__tests__/**'
# GITHUB
rg -n 'requirePush|checkRepoAccess|validateTokenWriteKey|refreshUserToken|exchangeCode' lib/onboarding-run lib/github-connect 'app/(edit)/projects/[slug]/settings/actions.ts'
# INVITE
rg -n 'acceptedAt|expiresAt|lockProjectAccess|updateMany|deleteMany' lib/auth/members.ts lib/invitation-email/issue.ts app/invite/actions.ts
# ROUNDTRIP
rg -n 'signIn\(|beginConnect|clearAuthRoundtripCookies|console.error' 'app/(edit)/account/actions.ts' lib/account-connect/http.ts lib/account-connect/store.ts
# REQUEST
rg -n 'new NextRequest\(' lib app --glob '!**/__tests__/**'
# SAMPLE
rg -n 'planConfirmedFormat|templatePaths|verifySampleConfirmation|readFiles' 'app/(edit)/projects/actions.ts'
# IMAGE
rg -n 'validate.*WriteKey|putImage\(|console\.error|stage =' 'app/(edit)/account/actions.ts' lib/credentials/storage.ts scripts/smoke-blob.ts
# CHALLENGE
rg -n 'findFirst|lockUser' lib/login-link/store.ts lib/session-revocation/store.ts lib/account-connect/store.ts
# TOKEN
rg -n 'ensureUserToken' lib app --glob '!**/__tests__/**'
# CREATE
rg -n 'project\.create\(' app lib scripts --glob '*.ts' --glob '!**/__tests__/**'
# TX
rg -n '\$transaction.*in|in.*\$transaction' lib app --glob '*.ts'
# CACHE
rg -n 'revalidatePath|revalidateAfterCommit|settleRevalidate|lockProjectAccess' 'app/(edit)' --glob '*actions.ts'
# FAILURES
rg -n 'startSessionRevocation|beginRevocation|clearAuthRoundtripCookies|401|listInstallationRepos' 'app/(edit)/__tests__/github-connect.test.ts' lib/session-revocation/__tests__ lib/onboarding-run/__tests__ 'app/(edit)/__tests__/onboarding.test.ts'
# BUDGET
rg -n 'surfaces:|readFiles|prepared|path-conflict|union|totalBytes|checkDownloadBudget' lib/onboarding-run/create.ts lib/onboarding-run/add.ts lib/import/read.ts
# IMPORT
rg -n 'lastImportStartedAt|lastImportError|importToken|projectImportToken|importRevision' lib/import/run.ts lib/projects/import-status-store.ts lib/push/apply.ts
# GUARD
rg -n 'callsGuard|stripComments|import·주석|resolveBearer' app/__tests__/entry-points.test.ts app/__tests__/exempt-route-guards.test.ts
# CONSTANT
rg -n 'timingSafeEqual' lib -g '!**/__tests__/**'
# PUBLISH
rg -n 'lastPublishedAt|applyProtectedPush|runAutomationImport' lib/push/apply.ts lib/nightly/run.ts lib/import/run.ts app/api/push/route.ts
# COOKIELESS
rg -n 'auth\(|readSession\(|cookies\(' lib/mcp lib/oauth lib/oauth-server app/oauth/token app/oauth/revoke -g '!**/__tests__/**'
```

| 번호·항목 헤딩 | 검사 명령·읽기 | 근거·판정 |
|---|---|---|
| #1 2026-08-31 — 모듈 로드 시점에 환경변수를 요구해 CI가 red | ENV; lib/db.ts / prisma.config.ts / auth.ts 전문 | lazy DB 생성 및 조건부 datasource. 모듈 최상위 필수 env 평가 재발 없음. 빌드 미실행 |
| #3 2026-08-31 — 레이아웃 인증 검사가 데이터 노출을 막지 못했다 | AUTH; lib/auth/cookie.ts 및 middleware/entry-points 검사 | 렌더 쿠키 힌트와 진입점 본인가 분리. RSC 실제 응답은 미완 |
| #4 2026-08-31 — 외부 계약 페이로드를 리터럴로 조립해 필수 필드가 늘어도 컴파일러가 침묵했다 | rg -n 'z.infer\|PushPayloadType\|SaveKeyInput\|buildPushPayload' lib/push/payload.ts scripts/push-local.ts lib/keys/save.ts components/translations/workspace/workspace.tsx | buildPushPayload 반환/리터럴이 PushPayloadType에 묶이고 CLI가 사용. 경계 타입 단절 재발 미발견 |
| #5 2026-09-01 — 라이브러리가 이미 하는 인코딩을 또 해서 조용한 404를 만들었다 | rg -n 'requireEnv\|encodeURIComponent\|encodeURI' lib/github.ts lib/github-connect app --glob '*.ts' --glob '!**/__tests__/**' | Octokit ref 인자 추가 인코딩 없음. 실제 API 스모크 미실행 |
| #15 2026-09-03 — 실패한 조회를 "없음"으로 읽어 경고가 존재하지 않는 것과 구별되지 않았다 | rg -n 'gh pr\|pull-requests\|open\|warning\|failed\|permissions\|set -e\|head_commit' .github/actions/malmoi-i18n-push/action.yml | action.yml:152 조회 실패를 경고로 구분. 인증 조회는 readSession unavailable 구분. 후속 GitHub 401 분류는 발견1 |
| #19 2026-09-05 — 검증은 했는데 검증한 값을 저장하지 않아 두 주소가 갈릴 뻔했다 | rg -n 'verifiedEmailFrom' auth.ts lib/auth | auth.ts:59, profile.ts:32 검증한 이메일을 저장값 생산에 사용. 재발 없음 |
| #20 2026-09-05 — 테스트 가짜가 실제 제약보다 관대해서 결함 하나를 원리적으로 못 봤다 | rg -n '@@unique\|@unique' prisma/schema.prisma; rg -n 'P2002\|pushTokenHash\|slug' 'app/(edit)/__tests__/harness.test.ts' | 하네스 slug/pushTokenHash/복합 제약 검토. 실제 DB 제약 동등성 실행은 미완 |
| #21 2026-09-05 — 경고는 문서에 있었는데 배선이 지키지 않았고, 부하가 낮아 오래 안 드러났다 | ENV; lib/db.ts / prisma.config.ts / .env.example | runtime6543/DDL5432 정적 배선. Vercel 실값·부하 미완 |
| #23 2026-09-06 — 실패 사유를 쿼리로 넘겨놓고 읽는 쪽을 안 만들어 거부가 통째로 무음이었다 | rg -n 'case "\|InviteError' lib/auth/invite-view.ts lib/auth/message.ts | invite-view:39–47의 오류 9종에 limit-reached 포함. 재발 없음 |
| #24 2026-09-06 — 리다이렉트 횟수로 검증해서 전면 장애를 "정상"으로 읽었다 | lib/auth/read-session.ts / outage.ts / cookie.ts 전문 | none/unavailable 구분. 실물 성공+거부 대조 미완 |
| #25 2026-09-06 — 인가는 지났는데 조회를 그 사용자로 좁히지 않아 남의 GitHub 계정이 화면에 뜰 뻔했다 | OWNER; account Actions 및 account-link 소유권 대조 | userId 범위. provider 복합키 전역 읽기는 소유자 충돌 판정. 재발 없음 |
| #26 2026-09-06 — GitHub App 개인키를 하나 지웠더니 네 곳이 동시에 끊겼고, 증상은 "App이 설치돼 있지 않다"였다 | rg -n '401\|404\|403' lib/github-connect/health.ts; GITHUB | health.ts:69의401은 error,403/404는 not-installed. App 키 운영 회전 검증 미완; 사용자 GET401은 발견1 |
| #27 2026-09-07 — 클라이언트 번들에 7.2MB가 들어갔고, 확인이 잘못된 패턴을 grep해서 "안전"으로 읽었다 | components/__tests__/client-graph.test.ts 및 client import 경계 검토 | server-only/잎 모듈 경계 정적 검사. 실제 번들 크기·산출물 그래프는 빌드 금지로 미완 |
| #30 2026-09-07 — 방어선 셋이 "검사한다"고 주장한 것을 검사하지 못했고, 전부 green이었다 | rg -n 'scan\|paginate\|graphql\|request\(\|rest\.' lib/github-connect/__tests__/credential-separation.test.ts | 검사가 request/paginate/rest/GraphQL 쓰기를 세고 메타 공격 fixture를 가진다(:242). 실행 미완 |
| #31 2026-09-08 — `?? 폴백`이 프로토타입 키를 못 막아 문자열 자리에 **함수**가 왔다 | rg -n '\[[A-Za-z_][A-Za-z0-9_.]*\]\s*\?\?\|as [A-Z][A-Za-z]*Error' lib/auth lib/mcp lib/oauth app/api | 오류 판정은 pick/switch. 배열 인덱스 폴백을 프로토타입 record 조회로 오판하지 않음 |
| #37 2026-09-09 — 마스킹한 이메일이 두 초대를 같은 행으로 만들었고, 되돌릴 수 없는 버튼이 그 위에 있었다 ([malmoi#18](https://github.com/SinhyeokKang/malmoi/issues/18)) | rg -n 'maskedEmailLabels\(\|emailLabel:\|email:' lib/auth/query.ts lib/mcp/tools | 초대 주소 distinct→서버 라벨; 최종 UI 클릭은 미완 |
| #38 2026-09-09 — 앱 층 인가를 촘촘히 만들었는데 DB가 인터넷에 열려 있었다 (Supabase advisor가 알려줬다) | 상위 DB ACL SQL 6종 | dev/prod 스키마 USAGE/CREATE 모두 false. 기존 admin ACL은 정본상 정상 |
| #45 2026-09-09 — 검증이 **탐지** 경로에만 있었고 **적재** 경로에 없어, 페이로드가 리포 경로를 정했다 | 상위 경로 보간/안전 술어 검색; SAMPLE/GITHUB | 저장 경계와 pull에서 경로/locale 검사. 요청 전체 크기 경계는 발견2로 별도 분류 |
| #46 2026-09-09 — 주석이 방어를 서술하고 코드는 안 했다 (`catch`는 오류일 때만 돈다) | 상위 statSync 검색과 walk/survey 소스 | lstat/Dirent로 링크 제외. 재발 미발견 |
| #47 2026-09-09 — 문서가 단언한 통제가 배선되지 않아, 마스킹이 화장품이었다 | auth/query,keys/query,translation-list,public-session 반환 소스 | 서버 마스킹 DTO, 공개 세션 허용목록. 재발 미발견 |
| #48 2026-09-09 — 주석이 이유를 정확히 적었는데 **재는 자**가 어긋나 거부가 500이 됐다 | CONSTANT | digest 비교 또는 Buffer 길이/ASCII43 선검증. UTF16 길이로 비교하지 않음 |
| #49 2026-09-10 — YAML 자원 제한이 문자열을 구조로 읽어 우회와 오탐을 함께 만들었다 | 상위 YAML Parser/quote 검색 | YAML은 실제 Lexer/CST Parser stack. 동적 parser 검증 미완 |
| #50 2026-09-10 — 초대 만료 조건이 있어도 취소 전 조회의 권한이 살아남았다 | INVITE | app/invite/actions.ts:102의 acceptedAt:null + expiresAt snapshot/현재 미만료 CAS. 재발 없음 |
| #51 2026-09-10 — DB URL의 겉보기 대상과 드라이버가 접속할 대상이 달랐다 | rg -n 'new URL\|connectionString' lib/credentials/command.ts scripts | command.ts의 대상/포트/protocol/query 허용목록. 전환 CLI 미실행 |
| #52 2026-09-10 — 일회용 자격증명을 소비한 뒤에야 저장 키 오류가 드러났다 | GITHUB; IMAGE | token-store:59→63 및 callback:76→85 쓰기 키 선검사 후 일회용 교환. 재발 없음 |
| #53 2026-09-10 — 재인증 목적이 사라진 OAuth callback이 일반 가입을 실행했다 | ROUNDTRIP; auth.ts wrapper 순서 | 목적 state로 일반 가입 분리, 일반 로그인 시작 시 정리. 실 OAuth 왕복 미완 |
| #54 2026-09-10 — `pnpm test`가 2553 green인데 단언 하나가 거짓이었다 — 그 스위트는 애초에 안 돌아간다 | rg -n 'include:\|passWithNoTests\|credentials\|oauth\|integration' vitest*.ts scripts/gate-plan* | 격리 스위트 include/trigger 확인. 테스트 실행 금지로 실행 여부는 미완 |
| #60 2026-09-12 — 테스트가 만든 `NextRequest`는 복사되고 런타임이 준 것은 던졌다 | REQUEST; lib/login-link/http.ts:101 | 현재는 new NextRequest(request.url,init); 위험한 객체 복사 new NextRequest(request)가 아님. 최신 주석/소스 우선 |
| #61 2026-09-12 — OAuth 오류 화면이 초대 복귀 지점을 표시하지 않았다 | rg -n 'pages:\|destFromCallbackUrl\|callback-url' auth.ts app/signin app/invite lib/login-link --glob '!**/__tests__/**' | auth.ts:113→signin/page.tsx:56 복귀 지점 소비. 실제 오류 화면 미완 |
| #62 2026-09-13 — 🔁 모달로 이관한 상태가 이전 파일 검증과 늦은 응답을 재사용했다 | AUTH; 모달 데이터 Actions/관련 핸들러 독해 | 조회 실패는 readSession union. client 늦은 응답 UI 검증은 boundary 밖 |
| #63 2026-09-13 — 샘플 검증 테스트가 실제 트리에 없는 경로만 공격해 순서와 예산 위반을 놓쳤다 | SAMPLE; BUDGET | 샘플 서명/인가 뒤 요청 파일 읽기. 생성 요청 전체 예산은 발견2(개별 호출 검사가 전체를 덮지 않음) |
| #65 2026-09-13 — 원격 신호 하나의 실패가 워커 풀의 동시 제한을 풀었다 | lib/projects/remote.ts 전문 | Promise.allSettled에 PR·모든 compare를 한 층으로 펼친 뒤 슬롯 반납. 미완 remote 작업을 반환 마감이 취소하지 않는 것은 명시된 결정 |
| #66 2026-09-13 — 임포트 종료의 소유권과 실패 캐시 무효화가 빠졌다 | IMPORT; CACHE | token/revision 소유권과 무효화 경계 확인. 실제 경합 미완 |
| #69 2026-09-13 — 이미지 쓰기 키 오류를 외부 업로드 뒤에 발견했다 | IMAGE | account/actions.ts:99 validatePiiWriteKey→103 putImage. 외부 업로드 전 키 검사 |
| #70 2026-09-13 — 일회용 연결 요청을 락 전에 읽어 재사용 결과가 달라졌다 | CHALLENGE; ROUNDTRIP | account-connect/store.ts:49 잠금 뒤 challenge 재조회/조건부 소비. connect 시작 실패는 :268 정리 |
| #73 2026-09-14 — 확인 Dialog의 유일한 논거가 반대 방향으로 거짓이었다 | TOKEN; GitHub 자격증명 소비 경로 | 사용자 토큰은 연결 조회, push/pull 쓰기는 installation. Dialog UX 전수는 밖 |
| #75 2026-09-14 — 낡은 Prisma 클라이언트가 로그인만 죽였고, 삼킨 catch 둘이 원인을 두 단계 감췄다 | credentials/access,adapter,log 및 auth/package 전문 | credentialIO 안전 로그 + auth outage 구분; build 앞 prisma generate. 실제 generated 산출물 검증 미완 |
| #76 2026-09-14 — nullable 경계 추가만으로 옛 upsert의 소유권 충돌이 사라지지 않는다 | rg -n 'ON CONFLICT' lib app scripts -g '*.ts' -g '!**/__tests__/**' | 현재 Locale project/surface/code conflict 및 Translation 복합 FK. nullable 전환 옛 상태는 아님 |
| #77 2026-09-14 — 표면 복합 FK 추가 뒤 새 프로젝트 생성이 Project.id NULL로 실패했다 | CREATE | onboarding-run/create.ts:232의 명시 id. 실제 PG 생성 실행 미완 |
| #78 2026-09-14 — TransactionClient를 런타임 속성으로 구별해 첫 적재가 자기 잠금을 기다렸다 | TX | 런타임 in 속성 판별 없음; 관련 hit는 주석/테스트/메서드 호출 |
| #89 2026-09-15 — 설정 변경으로 Sync 적용을 거부한 뒤 자기 진행 표시가 남았다 | IMPORT; lib/import/run.ts:398–407 | finally가 repositoryImportToken 및 자기 lastImportToken에 한정하여 표시 해제. 정적 재발 없음 |
| #91 2026-09-15 — 컬럼을 더하며 쓰는 자리를 전수로 안 세서 종료 경로 다섯 중 둘에만 붙었다 | IMPORT; import-status-store.ts:82–103 | reported failure는 남의 진행 표시를 건드리지 않는 예외. 종료 경로가 importOutcomeFields 사용 |
| #100 2026-09-16 — 같은 요청의 `Promise.all`이 토큰 회전을 둘로 겹쳤고, 내가 단 주석이 그것을 "안전하다"고 정당화했다 | TOKEN; rg -n 'loadAccountView\|loadInstalledRepoCount\|Promise.all' 'app/(edit)/account/page.tsx' | account/page.tsx:88–108 순차 await. 동일 요청 병렬 refresh 재발 없음 |
| #108 2026-09-18 — 인가 방어선이 호출이 아니라 이름을 셌다 — `import` 줄과 주석 인용만으로 green | GUARD | stripComments 후 호출 검증 + import/comment 뮤테이션 fixture. 실제 테스트 미실행 |
| #110 2026-09-19 — 인가를 철회한 사용자가 "잠시 뒤 다시"에 갇혔고, 그 자리만 401 규칙을 어기고 있었다 | GITHUB; FAILURES | 발견1. 후속 설치별 GET401이 값으로 삼켜져 outer catch에 못 닿음 |
| #111 2026-09-19 — 개인정보처리방침이 코드와 어긋난 문장 셋을 실은 채 green이었다 | 상위 개인정보 필드/삭제 검색; safe-adapter/schema | 로그인 응답 미사용 필드 저장 없음. OAuth token_type 응답은 별개 |
| #115 2026-09-20 — 소스 추가 커밋 뒤 캐시 오류가 전체 롤백으로 보고될 수 있었다 | CACHE | 쓰기 후 settleRevalidate/revalidateAfterCommit 분리. 재발 미발견 |
| #117 2026-09-20 — 활동 판정은 통과했지만 조회·렌더·적재 연결에서 사실이 달라졌다 | 상위 events/query/필터 검사 | 시각/결과·projectId·마스킹 경계 정적 확인. DOM은 미완 |
| #119 2026-09-23 — Revert가 잠금 대기 중 회수된 OWNER 권한으로 실행됐다 | AUTH; INVITE; auth/lock.ts / save-key.ts / revert.ts | 잠금 뒤 credential/membership 재확인. 병렬 요청 실험 미완 |
| #124 2026-09-24 — 연 채로 보관된 Settings가 거부만 받고 보관 상태로 옮겨 가지 않았다 | AUTH; CACHE; settings/actions.ts의 lockProjectAccess | 서버 archived 쓰기 거부 유지. 열린 화면의 후속 이동 UI 실물은 미완 |
| #127 2026-09-24 — chrome `"placeholders": null`이 push→pull 왕복에서 사라졌다 (Prisma가 JSON null과 SQL NULL을 같게 읽는다) | rg -n 'NULLIF\|placeholders\|nestedByPath' lib/pull/load.ts | load.ts:94–99 SQL JSON null 좌표 복원 + tenant 범위 확인. 왕복 미실행 |
| #129 2026-09-27 — 경로 **안전**만 검사해 경로가 **옳은지**를 안 봤고, 토큰을 받는 사람이 리포에 쓸 수 있는지도 안 봤다 (sec-audit-3 발견 1) | GITHUB; SAMPLE; 상위 isPathSafe 검색 | create/add/detect/rotate requirePush:true; Sync는 명시 false. locale 모양과 경로 안전 모두 검사 |
| #131 2026-09-28 — Next 외부 rewrite가 세션 쿠키를 제3자 호스트로 넘긴다 | 상위 rewrite 검색 / upload fetch 독해 | 외부 rewrite0, 브라우저 헤더 전달 없음 |
| #133 2026-09-29 — 사건 목록의 행위자 라벨이 사건 2개 이상인 사람의 원문 이메일을 실었다 ([malmoi#146](https://github.com/SinhyeokKang/malmoi/issues/146)) | 상위 maskedEmailLabels 전수 | 사건 userId 및 초대 주소 distinct, serialized PII 가드 소스 존재 |
| #137 2026-10-02 — 테스트가 전부 통과했는데 PR CI가 `EnvironmentTeardownError`로 red였다 — 게이트 재시도가 진짜 결함을 가렸다 (PR #171) | rg -n 'setTimeout\|clearTimeout' lib/github-wait.ts lib/__tests__/fast-github-wait.ts; rg -n 'fast-github-wait' app/api/__tests__/pull-nightly.test.ts app/api/__tests__/push-open-pr.test.ts | production/helper clearTimeout 및 두 테스트 공유 helper 확인. CI 미실행 |
| #141 2026-10-07 — 허용된 CI 경합이 재Publish 뒤 PR의 복구본까지 지울 수 있었다 | PUBLISH | route.ts:87→263 stamp 전달, apply.ts:151 잠금→157 비교, nightly/import도 전달. publish-raced 현재 계약 적용 |
| #143 2026-10-07 — 비동기 경계와 검증 트리거가 구현의 끝까지 닿지 않았다 | 상위 arrayBuffer/deadline/gate 검색 | await body/동일 deadline/구현 트리거 확인. 재발 미발견 |

현재 143개 중 boundary 관련 57개 항목을 위 표에 기록했다. 나머지는 어댑터 값/표현 결정성·코어 값 전달·UX/접근성·성능 지표·작업 운영 절차 중심으로 이 담당 차원 밖이다. 관련 번호를 제외한 항목은 통과 판정한 것이 아니다: #2, #6, #7, #8, #9, #10, #11, #12, #13, #14, #16, #17, #18, #22, #28, #29, #32, #33, #34, #35, #36, #39, #40, #41, #42, #43, #44, #55, #56, #57, #58, #59, #64, #67, #68, #71, #72, #74, #79, #80, #81, #82, #83, #84, #85, #86, #87, #88, #90, #92, #93, #94, #95, #96, #97, #98, #99, #101, #102, #103, #104, #105, #106, #107, #109, #112, #113, #114, #116, #118, #120, #121, #122, #123, #125, #126, #128, #130, #132, #134, #135, #136, #138, #139, #140, #142.

### 환경변수 교차 검사

literal requireEnv/optionalEnv 이름 집합과 `.env.example` 선언을 Python 읽기 전용 스캔으로 비교하고 ENV 검색의 직접 접근을 읽었다. 누락처럼 보이는 `CREDENTIAL_TARGET`은 package script 설정(.env.example:191), `VERCEL_ENV`는 플랫폼 주입(:216). `AUTH_*`는 Auth.js 자동 인식, `DIRECT_URL*`는 prisma.config, 암호화 키는 `${kind}_ENCRYPTION_KEYS` 동적 접근과 대응한다. APP_VERSION/NODE_ENV/PRISMA_TARGET도 빌드·런타임·스크립트 값이다. 선언/소비 불일치 신규 발견 없음. Vercel 실제 값은 미검증.

## 검사한 파일 목록

아래 205개는 상위·하위 탐색에서 전문 또는 관련 함수/테스트 구간을 직접 읽은 파일이다. 전 파일의 모든 행을 읽었다는 뜻은 아니다. 이 밖에 위 검색 명령은 app/lib/components/scripts/prisma 전역의 해당 패턴을 검사했다. 외부 orchestration 스킬은 별도로 읽었다.

```text
.agents/skills/source-command-audit/SKILL.md
.env.example
.github/actions/malmoi-i18n-push/action.yml
CLAUDE.md
app/(edit)/__tests__/github-connect.test.ts
app/(edit)/__tests__/harness.test.ts
app/(edit)/__tests__/onboarding.test.ts
app/(edit)/account/actions.ts
app/(edit)/account/page.tsx
app/(edit)/actions.ts
app/(edit)/mcp/actions.ts
app/(edit)/preferences/actions.ts
app/(edit)/projects/[slug]/settings/actions.ts
app/(edit)/projects/[slug]/sources/actions.ts
app/(edit)/projects/actions.ts
app/(edit)/publish-actions.ts
app/__tests__/entry-points.test.ts
app/__tests__/exempt-route-guards.test.ts
app/api/__tests__/pull-nightly.test.ts
app/api/__tests__/push-open-pr.test.ts
app/api/auth/[...nextauth]/route.ts
app/api/github/callback/route.ts
app/api/images/[...key]/route.ts
app/api/images/email/[...key]/route.ts
app/api/mcp/route.ts
app/api/pull/route.ts
app/api/push/failure/route.ts
app/api/push/route.ts
app/api/search-index/[uiLocale]/route.ts
app/inbox/actions.ts
app/invite/actions.ts
app/oauth/authorize/actions.ts
app/oauth/revoke/route.ts
app/oauth/token/route.ts
app/search/actions.ts
app/signin/page.tsx
app/ui-locale/actions.ts
auth.ts
components/__tests__/client-graph.test.ts
docs/ARCHITECTURE.md
docs/POSTMORTEM.md
docs/PRODUCT.md
lib/__tests__/fast-github-wait.ts
lib/account-connect/http.ts
lib/account-connect/store.ts
lib/auth/__tests__/query.test.ts
lib/auth/access.ts
lib/auth/cookie.ts
lib/auth/email.ts
lib/auth/invitation.ts
lib/auth/invite-label.ts
lib/auth/invite-view.ts
lib/auth/landing.ts
lib/auth/lock.ts
lib/auth/member-identity.ts
lib/auth/members.ts
lib/auth/membership.ts
lib/auth/message.ts
lib/auth/outage.ts
lib/auth/pending-invitation.ts
lib/auth/permission.ts
lib/auth/profile.ts
lib/auth/public-session.ts
lib/auth/query.ts
lib/auth/read-session.ts
lib/auth/roundtrip-cookies.ts
lib/auth/roundtrip.ts
lib/auth/safe-adapter.ts
lib/auth/seat-notice.ts
lib/auth/session.ts
lib/auth/sign-out.ts
lib/auth/subject.ts
lib/cli/walk.ts
lib/credentials/access.ts
lib/credentials/adapter.ts
lib/credentials/command.ts
lib/credentials/crypto.ts
lib/credentials/finalize.ts
lib/credentials/log.ts
lib/credentials/records.ts
lib/credentials/storage.ts
lib/db.ts
lib/device-cookies/sign-in.ts
lib/device-cookies/spec.ts
lib/env.ts
lib/events/__tests__/query.integration.ts
lib/events/query.ts
lib/failure.ts
lib/github-connect/__tests__/credential-separation.test.ts
lib/github-connect/__tests__/token-store.test.ts
lib/github-connect/account-link.ts
lib/github-connect/account-view.ts
lib/github-connect/connect-plan.ts
lib/github-connect/health.ts
lib/github-connect/installed-repos.ts
lib/github-connect/log.ts
lib/github-connect/origin.ts
lib/github-connect/state.ts
lib/github-connect/token-store.ts
lib/github-connect/user.ts
lib/github-wait.ts
lib/github.ts
lib/import/read.ts
lib/import/run.ts
lib/inbox/load.ts
lib/invitation-email/create.ts
lib/invitation-email/issue.ts
lib/invitation-email/send.ts
lib/keys/query.ts
lib/keys/revert-translation.ts
lib/keys/revert.ts
lib/keys/save-key.ts
lib/keys/save-translation.ts
lib/keys/search.ts
lib/keys/translation-list.ts
lib/keys/view.ts
lib/locale-code.ts
lib/login-link/clear-cookies.ts
lib/login-link/http.ts
lib/login-link/store.ts
lib/mcp/confirm.ts
lib/mcp/grant.ts
lib/mcp/http.ts
lib/mcp/issue-plan.ts
lib/mcp/locked-token.ts
lib/mcp/server.ts
lib/mcp/token-store.ts
lib/mcp/token.ts
lib/mcp/tools/access.ts
lib/mcp/tools/account.ts
lib/mcp/tools/define.ts
lib/mcp/tools/execute.ts
lib/mcp/tools/index.ts
lib/mcp/tools/keys.ts
lib/mcp/tools/members.ts
lib/mcp/tools/onboarding.ts
lib/mcp/tools/project.ts
lib/mcp/tools/publish.ts
lib/mcp/tools/repos.ts
lib/mcp/tools/settings.ts
lib/mcp/tools/sources.ts
lib/mcp/tools/sync.ts
lib/mcp/tools/translations.ts
lib/nightly/run.ts
lib/oauth-server/authorize.ts
lib/oauth-server/client-metadata-fetch.ts
lib/oauth-server/revoke.ts
lib/oauth-server/token.ts
lib/oauth/access.ts
lib/oauth/authorize-view.ts
lib/oauth/authorize.ts
lib/oauth/bearer.ts
lib/oauth/callback.ts
lib/oauth/client-metadata.ts
lib/oauth/consent.ts
lib/oauth/endpoint.ts
lib/oauth/exchange.ts
lib/oauth/metadata.ts
lib/oauth/pkce.ts
lib/oauth/redirect.ts
lib/oauth/revoke.ts
lib/oauth/ssrf.ts
lib/oauth/token-request.ts
lib/oauth/tokens.ts
lib/onboarding-run/access.ts
lib/onboarding-run/add.ts
lib/onboarding-run/create.ts
lib/onboarding-run/repos.ts
lib/onboarding-run/rotate-token.ts
lib/onboarding/budget.ts
lib/privacy/collected.ts
lib/projects/import-status-store.ts
lib/projects/remote.ts
lib/protection/where.ts
lib/pull/load.ts
lib/pull/plan.ts
lib/push/apply.ts
lib/push/auth.ts
lib/push/payload.ts
lib/push/plan.ts
lib/search/keys.ts
lib/seo/analytics.ts
lib/seo/json-ld.ts
lib/session-revocation/__tests__/action.test.ts
lib/session-revocation/clear-cookies.ts
lib/session-revocation/http.ts
lib/session-revocation/policy.ts
lib/session-revocation/store.ts
lib/survey/run.ts
lib/upload/image.ts
lib/upload/normalize.ts
lib/upload/store.ts
middleware.ts
next.config.ts
package.json
prisma.config.ts
prisma/migrations/20260926175555_revoke_public_schema_usage_from_api_roles/migration.sql
prisma/schema.prisma
scripts/gate-plan.ts
scripts/guide-check.ts
scripts/push-local.ts
vercel.json
vitest.config.ts
vitest.credentials.config.ts
vitest.projects.config.ts
```

변경물은 이 보고서 한 개다. 소스·설정·문서 변경, DB 쓰기, 빌드·typecheck·테스트·커밋·push는 수행하지 않았다.
