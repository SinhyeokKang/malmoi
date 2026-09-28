# mcp-connector — design

## 1. 영향 받는 흐름

**셋 다다** — 온보딩(프로젝트 생성·표면 추가) · 편집 UI의 쓰기 전부(번역 저장 · Revert · Sync · Publish · 설정 · 멤버) · pull(Publish
트리거). 새 흐름은 없고 **새 진입점 하나**(`/api/mcp`)가 기존 흐름의 코어를 부른다.

```
CLI 에이전트 ──POST /api/mcp (Authorization: Bearer mlm_…)──▶ route.ts
   └ Origin: 없으면 통과, 있으면 ALLOWED_HOSTS 대조
   └ 인증: sha256(token) → ApiToken 행 → userId   (쿠키를 읽지 않는다)
   └ 크기: readBoundedText (1 MiB)
   └ 디스패치: tools/call name → tool handler(subject, args)
        └ 인가: getProjectAccess / getSurfaceAccess / lockProjectAccess  ← Server Action과 같은 함수
        └ 코어: lib/** (applyKeySave · runSync · executeKeyRevert · …) ← Server Action과 같은 함수
        └ revalidatePath: 화면을 보는 사람의 캐시를 Action과 같은 경로로 무효화
```

**Server Action과 도구는 같은 코어의 형제 껍데기다.** 도구가 Action을 부르지 않는다 — Action은 `readSession()`으로 주체를 얻는데
이 진입점엔 세션이 없다. 그리고 CLAUDE.md "외부가 부르는 진입점을 Server Action으로 만들지 않는다"가 그 반대 방향을 이미 막는다.

### 1.1 프로토콜 — T1 실측으로 확정 (2026-09-28)

**SDK를 쓴다 — `@modelcontextprotocol/server` 2.1.0**(exact 고정, 의존성은 `@modelcontextprotocol/core` 2.1.0 + `zod ^4.2` —
빌드 스크립트 없음이라 `onlyBuiltDependencies`를 건드리지 않는다. 2.1.0은 2026-09-23 publish라 `minimumReleaseAge`를 넘었다). JSON-RPC
직접 수신 폴백은 쓰지 않는다. 실측은 미커밋 `app/api/mcp-probe/route.ts`를 `next dev`(DB·env 없이 뜬다)에 올려 curl과 두 CLI로 쟀다.

- **가정 A와 B가 둘 다 맞다 — 클라이언트마다 개정이 다르다.** Claude Code 2.1.283은 **2026-07-28**(`server/discover` →
  `tools/list` → `tools/call`, 요청마다 `_meta` 봉투 + `MCP-Protocol-Version`·`Mcp-Method` 헤더)이고, Codex CLI 0.157.1은
  **2025-era**(`initialize` → `notifications/initialized` → `tools/list` → `tools/call`, `MCP-Protocol-Version: 2025-06-18`)다.
  **그래서 두 개정을 같은 도구 정의로 받는다** — 하나만 받으면 한쪽 CLI가 안 붙는다.
- **체크리스트 넷 — 전부 된다, 단 (b)는 조립으로 된다.**
  - (a) Web `Request`/`Response` ✅ — `createMcpHandler(factory).fetch(request, opts)`와 `WebStandardStreamableHTTPServerTransport.
    handleRequest(request, opts)`가 둘 다 Web 표준이고 Route Handler의 `Request`를 그대로 받는다.
  - (b) JSON 응답 + 세션 id 미발급 ✅(조립) — `createMcpHandler`의 `responseMode: "json"`은 **2026-07-28 쪽에만** 걸린다. 기본
    `legacy: "stateless"`의 2025 응답은 **`text/event-stream`**이었다(실측). 그래서 **`createMcpHandler(factory, { legacy: "reject",
    responseMode: "json" })` 앞에 `isLegacyRequest(request)`로 가르고**, 2025 쪽은 요청마다 새 `WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined, enableJsonResponse: true })`로 받는다 — SDK 문서가 제시하는 "hand-wired composition" 형이다. 두 쪽 다
    `content-type: application/json`, `Mcp-Session-Id` 헤더 없음, notification은 `202` 빈 본문(실측).
  - (c) Bearer를 앞단에서 끝내기 ✅ — SDK 입구는 토큰을 검증하지 않고 `authInfo`를 **그대로 통과**시킨다("never derived from
    request headers"). route가 먼저 401을 끝내고, 통과한 요청만 `{ authInfo }`로 넘긴다. 핸들러에서는 `ctx.http?.authInfo`로
    읽힌다(실측). **주체는 팩토리 인자로 받는다** — 팩토리가 요청마다 불리고(2026-07-28 쪽은 `McpRequestContext.authInfo`, 2025 쪽은
    route가 직접 부른다) 도구 핸들러는 그 클로저의 주체만 본다. 핸들러가 `ctx.http`를 읽지 않으므로 두 개정의 경로가 갈리지 않는다.
  - (d) `tools/list` 순서 ✅ — **등록 순서 그대로**다(`zeta, alpha, mid`로 등록 → 같은 순서로 3회 동일, 두 개정 동일). ⚠️ **두 CLI가
    화면에 보이는 순서는 이름순이다**(클라이언트 쪽 정렬) — 서버의 결정성 계약은 wire 순서이고 `toolCatalog()` 배열 순서로 등록한다.
- ⚠️ **`tools.listChanged: false`를 명시한다.** `McpServer`는 도구를 등록하면 기본 `listChanged: true`를 광고하고, 그러면 Claude
  Code가 **`subscriptions/listen` SSE 스트림을 연다**(실측 — 응답이 끝나지 않는다). Vercel 함수에서는 그 스트림이 `maxDuration`까지
  함수를 붙잡고 끊기면 다시 연다. `new McpServer(info, { capabilities: { tools: { listChanged: false } } })`로 바꾸자 Claude Code가
  listen 없이 discover → list → call만 보냈다(실측). 도구 목록은 배포 사이에 안 바뀌므로 잃는 것이 없다.
- **route가 받는 모양은 이것 하나로 확정한다** (T5가 이 확정문으로 디스패치한다):
  1. `checkOrigin` → Bearer 인증(401) → `readBoundedText(1 MiB)`(400) → `JSON.parse`(실패는 JSON-RPC `-32700` — SDK에 맡겨도 된다).
  2. `isLegacyRequest(request, parsedBody)` — 이미 파싱한 본문을 넘겨 본문을 두 번 읽지 않는다.
  3. `true` → 요청마다 `factory(subject)` + `WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined,
     enableJsonResponse: true })` → `server.connect(transport)` → `transport.handleRequest(request, { parsedBody })` → `finally
     server.close()`. `false` → 모듈 한 벌의 `createMcpHandler(..., { legacy: "reject", responseMode: "json" })`의 `fetch(request,
     { parsedBody })` — 팩토리가 요청마다 불리므로 주체는 `authInfo.extra`로 실어 `McpRequestContext.authInfo`에서 읽는다.
  4. `maxRequestBodySize`는 SDK 기본 4 MiB지만 route가 이미 1 MiB로 끊었고 `parsedBody`에는 SDK 상한이 안 걸린다.
- **SDK가 이미 고정하는 JSON-RPC 응답** (2025 쪽 실측 — T5 테스트가 route 층에서 다시 고정한다): 미지 도구 `-32602 "Tool nope not
  found"`, 미지 메서드 `-32601 "Method not found"`, 배치 배열은 응답 배열, id 없는 notification은 `202`. 2026-07-28 쪽은
  `Mcp-Method` 헤더가 없거나 본문과 다르면 `400 -32020`.
- **401에서 두 CLI 모두 OAuth로 넘어가지 않는다** — Claude Code는 `Authorization` 헤더가 설정돼 있으면 "OAuth fallback is disabled"로
  멈추고 **401 본문을 사용자에게 그대로 보인다**(실측: `Error detail: { error : unauthorized }`). `/.well-known/*` 요청은 0건이었다.
  → 401 본문은 갈래를 말하지 않는 고정 문장 하나다(spec 조건 4).
- 알려진 소음: `responseMode: "json"`이면 SDK가 `createMcpHandler` 생성 시점에 `console.warn` 한 줄을 낸다(모듈 로드당 1회).
- 응답은 **JSON 한 벌**(SSE 스트림 없음). 진행 알림을 보낼 긴 작업이 Publish·첫 적재 둘이고 둘 다 60초 안이다 — `json` 모드는
  중간 알림을 버린다(SDK 문서)는 대가를 받아들인다.
- 실측에 쓴 CLI 설정(토큰은 환경변수 참조 — POSTMORTEM 2026-09-04): Claude Code `--mcp-config`의
  `{"type":"http","url":…,"headers":{"Authorization":"Bearer ${MALMOI_TOKEN}"}}`, Codex `-c mcp_servers.<name>.url=… -c
  mcp_servers.<name>.bearer_token_env_var="MALMOI_TOKEN"`. 이 두 형이 `/mcp` 연결 예시(§8)의 원형이다.
- 호출 사이 상태 = **서버 발급 핸들**. Publish 지문은 신규이며, 샘플 HMAC은 기존 발급/검증 함수를 재사용하되 생성·소스 추가의
  소비 경로를 새로 연결한다:

| 핸들 | 발급 | 소비 | 이미 있나 |
|---|---|---|---|
| 샘플 확인값(HMAC, 30분) | `detect_formats` | `create_project` · `add_sources` | 발급/검증 함수는 기존, 두 쓰기 도구의 소비는 신규(§2.2) |
| Sync 폐기 지문 | `preview_sync` | `sync_repository` | ✅ `readDiscardApproval` |
| Revert 확인값 | `preview_revert` | `revert_to_last_sent` | ✅ `previewKeyRevert` |
| **Publish 지문** | `preview_publish` | `publish` | ❌ **신규** — §3.1 (인자 하나) |
| 목록 cursor | `list_keys` · `list_events` | 같은 도구 | ✅ `loadTranslationList` · `loadEvents` |

### 1.2 인증

- 토큰 형: `mlm_` + 32바이트 base64url. 접두는 사람 눈이 알아보게 하는 것이다(secret scanning 등록은 비목표).
- 저장은 **sha256 hex만**이라 발급 뒤 원문은 **어디에도 없다**. 잃어버리면 재발급이다(✅ 사용자 확인). 해시 규칙은 `hashInviteToken`
  한 벌이다(무염 sha256 hex — push 토큰·초대와 같다). **조회 방향은 해시 → 행**이고(PRODUCT §7.8의 교훈), 행이 `userId`를 준다.
  비교 연산이 없어 타이밍 축이 없다.
- **계정당 하나** — `ApiToken.userId @id`(PK가 곧 unique). 발급은 기존 행을 지우고 새 행을 넣는 한 tx라 [Create]와 [Rotate]가 같은 Action이다.
- 판정 `planApiTokenUse({ row, now })` → `ok | rejected` 두 갈래(만료·폐기·없음을 한 갈래로 접는다 — 401 하나). 만료 경계는
  `expiresAt <= now`가 거부다.
- `lastUsedAt`은 **1분 단위로만** 갱신한다(호출마다 UPDATE하면 에이전트 루프가 행을 두드린다). 판정은 순수 `shouldTouch`.
- ⚠️ **쿠키를 읽지 않는다.** `auth()`·`readSession()`·`cookies()`를 이 route와 `lib/mcp/**`에서 부르지 않고 소스 스캔이 센다 —
  그것이 CSRF 방어의 전부다(제3자 페이지는 Bearer를 붙일 수 없다).
- **`Origin`은 검증한다, 거부하지 않는다** (검수 J). 헤더가 없으면 통과(Node `fetch`·CLI는 안 싣는다), 있으면
  `lib/github-connect/origin.ts`의 `ALLOWED_HOSTS`와 대조한다 — 스펙의 DNS rebinding 권고이고, MCP Inspector 같은 브라우저 클라이언트가
  같은 origin에서 붙을 수 있다.
- 사용자 삭제는 `onDelete: Cascade`(토큰은 자격증명이라 사건과 달리 보존할 이유가 없다).

### 1.25 토큰 권한 — 역할 ∩ 토큰

```ts
type TokenGrant = Permission | "project:create";          // 토큰 전용 어휘 하나만 더한다
type TokenScope = { kind: "all" } | { kind: "projects"; projectIds: readonly string[] };

type ApiTokenAuthority = { userId: string; grants: readonly TokenGrant[]; scope: TokenScope };

// 순수 — lib/mcp/grant.ts (T2 구현)
planToolAccess({ token: ApiTokenAuthority, member: MemberContext | null, archivedAt, archivedPolicy?, rolePermission, tokenGrant }) →
  | { status: "ok"; projectId; role; archived }   // planProjectAccess의 ok 그대로 — projectId·role은 멤버십 행의 것
  | { status: "not-found" }                       // 범위 밖 · 멤버 아님 · 없는 프로젝트 — 존재를 말하지 않는다
  | { status: "forbidden" }                       // 역할이 못 한다 — 화면과 같은 사유
  | { status: "archived"; projectId; role }       // 보관 — planProjectAccess 그대로
  | { status: "token-scope" }                     // 역할은 되는데 이 토큰이 안 받았다
planCreateAccess({ grants }) → { status: "ok" } | { status: "token-scope" }   // 프로젝트가 없는 동작 — 역할 판정 없음
```

- **판정 순서가 계약이다**: 범위 → 멤버십 → 역할 → 보관 → 토큰. 가운데 셋은 `planProjectAccess`를 **그대로 재사용**한다(보관·읽기 예외
  `archivedPolicy` 판정을 복제하지 않는다 — 그 함수의 순서가 이미 멤버십 → 역할 → 보관이다). `member`는 호출부가 **토큰의 `userId`로**
  조회한 멤버십 행이다. 범위를 먼저 봐야 범위 밖 프로젝트의 보관·역할이 새지 않는다. 역할을 토큰보다 먼저 봐야 EDITOR에게 "토큰을
  고치면 된다"는 거짓 안내가 안 선다. 보관을 토큰보다 먼저 봐야 답이 "되돌리는 법"이 된다(grant를 고쳐도 보관된 프로젝트엔 못 쓴다).
- **역할 조건과 토큰 grant 조건은 별개다.** `rolePermission`은 기존 역할 판정, `tokenGrant`는 위임 동작 판정이며 `null`이면 그 조건을
  요구하지 않는다. **grant 없는 토큰은 내 프로젝트 안의 데이터를 읽는다** — spec의 한 문장 규칙. GitHub 계정 열거·파일 다운로드
  도구(§2.1의 "신규" 경로 셋)만 grant를 요구한다. `readOnlyHint`는 인가 조건이 아니다.
- `project:create`는 프로젝트 판정을 지나지 않는다 — `create_project`·`list_repositories`와 신규 프로젝트용 `list_branches`·
  `detect_formats`가 그것을 본다. **고른-프로젝트 범위 토큰이 만든 프로젝트는 같은 tx에서 그 토큰의 `projectIds`에 들어간다** —
  안 넣으면 방금 만든 프로젝트를 그 토큰이 못 만진다.
- 권한은 토큰에 고정이다(불변). 재발급이 행을 갈아 끼우므로 **다음 호출부터** 새 권한이다(매 호출 DB 조회 — ARCHITECTURE §6.00 ④).

#### 쓰기 주체와 잠금 뒤 재판정 (검수 H 반영)

- 서버가 구성한 쓰기 주체는 `{ userId, tokenId?: string }`다 — 세션 경로는 `tokenId` 없음, MCP 경로는 있음. **`tokenId`는
  `ApiToken.tokenHash`다**(2026-09-28 오케스트레이터 결정 — `id` 컬럼이 없고 `userId`가 PK라 행을 가리키는 값이 해시뿐이다. 해시는 원문이
  아니고 로그에도 이미 무해한 값이다). 도구 입력으로 주체를 받지
  않는다. 사건의 actor는 두 경우 모두 기존 USER다. cron의 시스템 주체는 그대로다.
- **재판정은 잠금 뒤 재읽기다 — 행 잠금을 더하지 않는다.** 기존 `Project` → `TranslationSurface` 잠금을 얻은 뒤 같은 tx에서
  `ApiToken`을 다시 읽어(READ COMMITTED) **`userId` AND `tokenHash`로** 존재·만료를 확인하고 §1.25의 순서를 다시 돌린다 — `userId`만으로
  읽으면 잠금 대기 중 **재발급**된 새 행(새 해시·새 권한)이 통과한다. 두 키로 읽으므로 재발급·폐기 둘 다 "행 없음"으로 거부된다. 입구에서 얻은 grants/scope를
  재사용하지 않는다. 폐기·재발급 tx가 먼저 커밋됐으면 재읽기가 그것을 본다 — spec 조건 6은 이것으로 충족된다. `FOR SHARE`는 쓰지
  않는다: 병렬 읽기 도구의 `lastUsedAt` UPDATE가 쓰기 tx 뒤에 줄을 서게 만들고, 에이전트의 병렬 호출(§1.3)이 정확히 그 모양이다.
- **확장점은 `lockProjectAccess` 하나다** (`lib/auth/lock.ts`). `lockProjectAccess(tx, { …, token?: { id /* = tokenHash */, grant } })`로 넓혀 잠금 뒤
  토큰을 다시 읽고 `planToolAccess`를 돌린다 — `app/__tests__/locked-access.test.ts`의 `SITES` 16자리가 전부 이 함수를 지나므로
  한 자리 수정으로 전부에 붙는다. 그 AST 테스트는 "MCP가 닿는 자리의 호출에 `token` 인자가 있는가"를 추가로 센다.
- raw `FOR UPDATE`로 남은 넷(`lib/import/run.ts` · `lib/keys/revert.ts` · `lib/surfaces/create.ts` · 프로젝트 생성의 User 잠금)은
  같은 재읽기 헬퍼 `lockApiToken(tx, { tokenId, userId })`를 잠금 직후에 부른다(`where: { userId, tokenHash: tokenId }`).
- 유효하지 않은 토큰은 인증 거부로 접고, 이 재판정 실패 자체로 프로젝트 사건을 남기지 않는다.

| 쓰기 경로 | 재판정 위치 |
|---|---|
| 키 저장(배치) | `applyKeySaveBatch`의 tx, Project → Surface 잠금 뒤 — 배치 한 번에 한 번 |
| Publish | `lib/sync/run.ts`의 실행권 획득 tx, Project 잠금 뒤·SyncRun 생성 전 |
| 수동 Sync | `lib/import/run.ts`의 실행권 획득 tx, 직접 잡는 Project 잠금 뒤·import token 기록 전 |
| Revert | `lib/keys/revert.ts`의 Project → Surface 잠금 뒤·번역/사건 쓰기 전 |
| 소스 추가 | `lib/surfaces/create.ts`의 Project 잠금 뒤·표면/첫 적재 쓰기 전 |
| 프로젝트 생성 | 추출할 생성 코어의 User 잠금 뒤. 토큰 유효성과 `project:create`를 확인한 뒤 생성과 `projectIds` 추가를 같은 tx에서 |
| 설정·기준 로케일·push 토큰 회전·멤버/초대·보관/복원 | 각 코어의 `lockProjectAccess` 호출에 `token` 인자 |

Publish·Sync처럼 외부 I/O가 이어지는 작업의 권한 확정 시점은 위 **실행권 획득**이다. 이후 폐기가 이미 시작된 외부 작업을
취소하는 계약은 아니다. 샘플 확인값·폐기 지문·Revert/Publish 지문은 이 재인가를 대신하지 않는다.

### 1.3 GitHub 자격증명 — 세 축 그대로

MCP 토큰은 **넷째 GitHub 자격증명이 아니라 Malmoi 신원**이다. 도구 안에서 GitHub을 부르는 방식은 Action과 같다: 사용자 확인은
`ensureUserToken(prisma, userId, now)`(user-to-server, GET만), 쓰기는 installation 토큰.

⚠️ **두 자격증명이 만나는 코어의 거처는 `lib/onboarding-run/`이다** (검수 B). `credential-separation.test.ts`는 `lib/onboarding`을
"user-token import 없음 · `@/lib/github` import 없음" 루트로 고정하고 있어 `checkRepoAccess`(둘을 한 함수에서 부른다)를 그대로 옮기면
red다. 새 루트 하나에 Server Action과 같은 규칙("둘 다 import 가능, 쓰기는 App 토큰만")을 걸고 `lib/mcp/tools/*`도 그 집합에 넣는다.
ARCHITECTURE §3.1의 "두 자격증명이 만나는 자리는 Server Action 하나"를 "Server Action과 `lib/onboarding-run`"으로 개정한다(T9).

⚠️ **POSTMORTEM 2026-09-16** — 에이전트는 도구를 **병렬로** 부른다(`list_repositories` + `list_branches`를 한 턴에). 같은 사용자의
만료 토큰을 두 요청이 동시에 갱신하는 모양이 탭 둘보다 훨씬 흔해진다. `token-store.ts`의 조건부 쓰기는 **요청 사이** 경합용이고
이것이 그 경우다 — 동작은 맞지만 `reauthorize` 오판 창이 넓어지므로 T6에 동시 호출 테스트를 넣는다(`ensureUserToken` 병렬 호출로
잰다 — 경합 헬퍼는 export되지 않은 private이다).

## 2. 도구 목록과 쓰기 범위 (PRODUCT §4.3 ⑤의 개방 조건)

**역할은 기존 `Permission` 셋으로, 토큰은 그 셋과 토큰 전용 `project:create`로 판정한다.** 역할 표에 넷째를 만들지 않는다.
읽기 표는 역할과 grant를 분리한다. 쓰기 표의 권한은 역할과 grant 둘 다 요구하며, `project:create`만 프로젝트 역할이 없다.
"쓰기 범위"는 그 도구가 바꿀 수 있는 것이다.
`annotations`는 MCP 클라이언트가 확인창을 띄우는 근거다(`readOnlyHint` · `destructiveHint`).

### 2.1 읽기 (`readOnlyHint: true`)

| 도구 | 프로젝트 역할 조건 | 토큰 grant 조건 | 코어·비고 |
|---|---|---|---|
| `whoami` | 없음(계정 조회) | 없음 | 유효 토큰 필수. 이름·GitHub 연결 여부·토큰 권한/범위. 에이전트가 자기 권한을 아는 유일한 수단 |
| `list_projects` | OWNER / EDITOR | 없음 | 기존 목록 조회·표시 판정. 멤버십 ∩ 범위로 필터 |
| `get_project` | OWNER / EDITOR (`translation:write`) | 없음 | Home 집계. 표면·로케일·To send·열린 PR·연결 건강 |
| `list_repositories` | 없음(생성 준비) | `project:create` | `listConnectableRepos`. GitHub 연결/설치가 없으면 `needs-browser` |
| `list_branches` | 신규: 없음 / 기존: OWNER (`project:settings`) | 신규: `project:create` / **기존: 없음** | `listRepoBranches` / `listProjectBranches`. 기존 프로젝트의 브랜치 목록은 PRODUCT §3의 읽기 예외다(검수 K). sync 브랜치 제외 |
| `detect_formats` | 신규: 없음 / 기존: OWNER (`project:settings`) | 신규: `project:create` / 기존: `project:settings` | 두 경로 모두 GitHub 쓰기 권한 확인. 기존은 저장된 리포·base branch만 탐지(파일 다운로드라 grant) |
| `list_keys` | OWNER / EDITOR (surface `translation:write`) | 없음 | `loadTranslationList`. 검색·상태 필터·cursor, 페이지는 `PAGE_SIZE`(100) |
| `get_key` | OWNER / EDITOR (surface `translation:write`) | 없음 | `lib/keys/query`. 로케일 값·설명·사용처·플래그 |
| `preview_publish` | OWNER / EDITOR (`translation:write`) | 없음 | `readPublishPreview` + Publish 지문 |
| `preview_sync` | OWNER (`project:settings`) | 없음 | `readDiscardApproval` + `planImportConfirmation` |
| `preview_revert` | OWNER (surface `project:settings`) | 없음 | `previewKeyRevert` |
| `list_events` | OWNER / EDITOR (`translation:write`) | 없음 | `loadEvents`. 보관 중 읽기 예외 유지 |
| `get_workflow` | OWNER (`project:settings`) | 없음 | `renderProjectWorkflowYaml`. push 토큰 원문 없음 |
| `list_members` | OWNER / EDITOR | 없음 | 멤버 조회. 남의 이메일 마스킹 유지 |

프로젝트 대상 조회는 토큰 범위·현재 멤버십을 확인하며 표면 조회는 해당 프로젝트의 표면으로 좁힌다.
grant 없이 미리보기 핸들을 얻어도 실행은 역할과 쓰기 grant를 다시 검사한다.

**`detect_formats`의 두 입력 경로**: 신규 프로젝트는 `{ owner, repo, ref? }`, 기존 프로젝트는 `{ slug }`다. 둘을 섞은 입력은
거부한다. 기존 경로는 범위 → 멤버십·보관 → OWNER → 토큰의 `project:settings`를 확인한 뒤, 인가된 프로젝트에 저장된 리포와 base
branch로 탐지한다. 호출자가 다른 리포나 ref로 바꿀 수 없으며 GitHub 리포 쓰기 권한도 확인한다. 후보와 확인값은 `add_sources`에
전달한다. 범위 밖은 `not-found`, EDITOR는 `forbidden`, OWNER지만 grant가 없으면 `token-scope`이며, 기존 프로젝트 탐지가
거부됐다고 신규 탐지 경로로 자동 전환하지 않는다.

### 2.2 쓰기

| 도구 | 권한 | 쓰기 범위 | 확인 | hint |
|---|---|---|---|---|
| `create_project` | `project:create` + `repo push` | Project·OWNER·Surface N·첫 적재·push 토큰 · 고른-범위 토큰이면 `projectIds`에 추가 | 샘플 확인값 | — |
| `add_sources` | `project:settings` + `repo push` | Surface 추가·첫 적재 | 샘플 확인값 | — |
| `set_translations` | surface `translation:write` | 키 ≤100개의 로케일 값·`needsReview` 해제 — **한 tx, 키별 결과** | — | — |
| `publish` | `translation:write` | sync 브랜치 커밋·PR 생성/갱신 | **Publish 지문** | — |
| `sync_repository` | `project:settings` | 리포 값으로 번역 덮기(미전달 폐기 포함) | 폐기 지문 | destructive |
| `revert_to_last_sent` | surface `project:settings` | 키 하나의 미전달 셀 복원 | Revert 확인값 | destructive |
| `update_project` | `project:settings` | 이름 · base branch | — | — |
| `set_base_locale` | surface `project:settings` | 기준 로케일 **선언** | — | — |
| `rotate_push_token` | `project:settings` + `repo push` | push 토큰 교체(원문 반환) | — | destructive |
| `invite_members` | `member:manage` | 초대 발급 + **메일 발송** | — | — |
| `revoke_invitation` · `change_member` | `member:manage` | 초대 무효 · 역할 변경/제거 | — | destructive |
| `archive_project` · `unarchive_project` | `project:settings` | `archivedAt` | — | archive만 destructive |

**생성·소스 추가의 샘플 확인 계약**: 현재 `verifySampleConfirmation`의 소비자는 `loadCandidateSample`이다. 기존 웹 `createProject`·
`addSurfaces`는 확인값을 받지 않고 파일을 다시 읽어 `planConfirmedFormat`으로 검증한다. MCP의 두 쓰기 도구에 확인값 소비를
**새로 추가**하며 웹 입력 계약은 유지한다.

- MCP에서는 선택한 후보마다 `confirmation`을 필수로 받는다. 기존 `signSampleConfirmation`·`verifySampleConfirmation`과
  `APP_SIGNING_SECRET`을 재사용한다. 서명 필드는 이미 `userId·repositoryId·installationId·ref·headSha·format·issuedAt`이고 TTL 30분이라
  **서명 확장이 필요 없다**(검수에서 코드 대조).
- 검증 함수가 반환한 포맷과 선택한 adapter·pathTemplate을 대조하고, baseLocale은 서명된 locales에 포함돼야 한다.
- ⚠️ **`signSampleConfirmation`·`verifySampleConfirmation`은 `APP_SIGNING_SECRET`이 비면 던진다**(거부가 아니라 설정 장애다) —
  T2의 `planSampleConfirmations`(`lib/mcp/confirm.ts`)는 그것을 잡지 않고 올린다. 호출하는 도구(`detect_formats`의 발급 · `create_project`·
  `add_sources`의 소비)가 **`unavailable`로 접는다**. `sample-expired`로 접으면 에이전트가 재탐지를 반복하고 원인이 가려진다.
- 확인값 누락은 입력 오류다. 변조·컨텍스트 불일치·만료·미래 발급 시각은 기존 `sample-expired`로 접고, `detect_formats`를 다시 호출해
  확인값을 받도록 안내한다. 포맷/기준 로케일 불일치는 기존 `manual-no-match`다. 자동 재탐지로 새 확인값을 만들어 쓰기를 계속하지 않는다.
- **같은 스냅샷을 검증과 적재에 쓴다.** 인가 후 읽은 리포 스냅샷으로 HMAC을 확인하고, 해당 head에 고정된 파일을
  `planConfirmedFormat` → 첫 적재 준비에 전달한다. 확인 뒤 다시 ref를 읽어 다른 head의 파일을 적재하지 않는다.
- 여러 후보 중 하나라도 확인이 실패하면 생성/추가 tx에 들어가지 않는다 — Project·Surface·번역·사건·`projectIds`에 부분 변경 없음.

- **`set_translations`는 한 호출에 키 최대 100개를 한 잠금·한 tx로 저장한다** (검수 E — "키마다 원자"의 뜻은 "일부 키의 거부가
  정상 결과"다). `applyKeySaveBatch(tx, entries)`가 `Project`→`Surface` 잠금을 **한 번** 잡고 키마다 화면 Save와 같은 판정을 돌려
  키별 결과(`saved` · `cannot-clear` · `not-found` · …)를 입력 순서대로 모은다. 거부된 키는 그 키만 건너뛰고 나머지는 같은 tx로
  커밋된다. 사건은 키마다 하나로 지금과 같다. 키별 tx를 버린 이유: 잠금 tx 실측이 키당 0.5–0.7초라 100키가 60초 안에 못 들어간다.
  tx 옵션은 `applyKeySave`의 `maxWait 10초 · timeout 30초`를 그대로 쓴다 — 한 tx 안의 100키는 잠금 대기 없이 UPDATE 100회라
  그 안에 든다(T7이 실측으로 확인). 실행 기한·`notAttempted`·`unconfirmed`·단조 시계 계약은 없다.
- **`runFirstIngest`는 도구로 따로 두지 않는다** — `create_project`가 첫 적재까지 한 트랜잭션이다(ARCHITECTURE §3.1).
- **push 토큰 원문이 도구 결과로 나간다** (✅ 2026-09-28 사용자). 결과는 에이전트 대화(= LLM 공급자)에 실린다. 받아들이는 근거: 프로젝트
  한정 · `/api/push` 한 곳의 쓰기 · 재발급이 곧 폐기이고, 어차피 그 토큰이 가는 곳이 그 에이전트가 쓰는 리포의 secret이다.
  도구 설명은 `gh secret set PUSH_TOKEN --repo OWNER/REPO`의 **표준입력**으로 원문을 전달하도록 안내한다(`--body` 생략,
  `--body -`는 문자 `-`를 저장한다). 생성 YAML의 `${{ secrets.PUSH_TOKEN }}`과 같은 이름이다.

### 2.3 결과 모양

- 성공은 `structuredContent`(JSON) + 짧은 `text` 요약. 거부는 **`isError: true` + 기존 거부 코드**(`archived` · `not-found` · `forbidden` ·
  `reconfirm` · `repo-read-only` · …)와 `messages/en.tsx`의 **같은 문장**이다 — 에이전트가 사용자에게 옮길 문장이 화면과 같아야 한다.
- **`needs-browser`도 `isError: true`다**(T2 구현) — 호출이 목적을 이루지 못했고 에이전트가 사용자에게 링크를 전해야 한다.
  `structuredContent`는 `{ status: "needs-browser", reason, url, message }`, `retryable`은 없다.
- 순수 `toToolResult(union)` 하나가 모든 도구의 union → MCP 결과 변환을 든다. **장애는 거부가 아니다**(§6.00 ②) — `unavailable`은
  `retryable: true`를 싣고 나머지는 싣지 않는다.
- 500 본문 규칙(§6.0)을 따른다 — 예외 메시지·스택을 결과에 싣지 않는다.

### 2.4 브라우저가 필요한 갈래 — `needs-browser`

GitHub App 설치·user-to-server 인가는 state 쿠키가 방어선인 브라우저 왕복이다(§6.4) — 도구가 대신하지 않는다. `ensureUserToken`이
`not-connected`·`reauthorize`이거나 설치 목록이 비면 결과가 `{ status: "needs-browser", url: routes.account(), reason }`이다 —
**연결·재인가·설치 전부 `/account` 하나**(검수 Q. 연결 버튼과 설치 설정 링크가 거기 있다. `/projects/new`로 보내면 사용자가 브라우저에서
생성을 끝내 버려 에이전트 흐름이 끊긴다). 결과 문장은 "연결/설치만 마치고 돌아와 같은 도구를 다시 부르라"다. 서명·nonce를 URL에 싣지
않는다.

**자동 탐지 후보 없음**: `detect_formats`가 정상 조회 후 `no-candidates`를 반환하면 `{ status: "needs-browser", reason: "no-candidates", url }`
이고 신규 경로는 `routes.newProject()`, 기존 경로는 인가된 slug의 `routes.sources(slug)`다. 브라우저는 기존 `confirmManualFormat`과
생성/추가 검증을 사용한다. MCP 수동 확정 도구나 확인값 생략 경로는 추가하지 않는다. scope/역할 거부·GitHub 장애·예산 초과는
각 원래 결과를 유지하며 브라우저 전환으로 숨기지 않는다.

## 3. 순수 함수로 분리 가능한 부분 (`/tdd` 대상)

| 함수 | 위치(안) | 무엇을 고정하나 |
|---|---|---|
| `generateApiToken` · `hashApiToken` · `parseBearer` | `lib/mcp/token.ts` | 접두·길이·base64url, `Bearer` 파싱(대소문자·공백·빈 값) |
| `planApiTokenUse({ row, now })` | `lib/mcp/token.ts` | 없음·만료 → 한 갈래, `expiresAt <= now` 경계 |
| `shouldTouch(lastUsedAt, now)` | `lib/mcp/token.ts` | 1분 스로틀 |
| `planApiTokenIssue({ expiresIn, grants, scope, memberProjectIds })` | `lib/mcp/issue-plan.ts` | 만료 선택지 30/90/365 · grant 어휘 밖 거부 · 범위는 현재 멤버십의 비보관 프로젝트만 · 멤버십 0이면 `projects` 범위 거부 |
| `planToolAccess({ token, member, archivedAt, archivedPolicy?, rolePermission, tokenGrant })` · `planCreateAccess({ grants })` | `lib/mcp/grant.ts` | §1.25의 다섯 갈래와 **판정 순서**(범위 → 멤버십 → 역할 → 보관 → 토큰, `planProjectAccess` 재사용). 역할 × 토큰 × 범위 매트릭스 |
| `publishFingerprint(state, baseHead)` | `lib/publish/fingerprint.ts` | `PullState` + base head SHA를 `discardFingerprint`와 같은 tuple 직렬화로. 같은 입력은 같은 지문, 번역·전달 토큰·키/로케일·표면 설정·리포/브랜치·base head 변경은 다른 지문. 표시 상한과 무관 |
| `planBatchSave(entries)` | `lib/mcp/batch.ts` | 100개 상한 · 중복 키 거부 · 입력 순서 유지 |
| `checkOrigin(headers)` | `lib/mcp/http.ts` | 없으면 통과, 있으면 `ALLOWED_HOSTS` 대조 |
| `toToolResult(result)` | `lib/mcp/result.ts` | union → `{ isError, structuredContent, content }`, `unavailable`만 `retryable` |
| 도구 입력 스키마(zod) | `lib/mcp/tools/*.ts` | 기존 Action 스키마를 **재사용**한다(`KeySaveInput` zod 값 · 타입은 `KeySaveInputType`) — 복제하면 한쪽만 좁아진다 |
| `toolCatalog()` | `lib/mcp/catalog.ts` | 도구 이름·순서(결정적)·annotations·필요 grant. **잎 데이터 모듈** — 도구 구현이 이것을 import하는 방향이지 반대가 아니다(`/mcp` 페이지가 그리므로 `client-graph.test.ts`가 본다 — 검수 M). 순서는 명시적 배열 동치로 고정(스냅샷 인프라 없음) |

**`import "server-only"` 경계는 파일 단위다**: 위 순수 모듈과 `lib/publish/fingerprint.ts`에는 붙이지 않고, `app/api/mcp/route.ts` ·
`lib/mcp/tools/*` · `lib/mcp/token-store.ts`에는 붙인다.

**껍데기**: `app/api/mcp/route.ts`(Origin·인증·크기·디스패치) · `lib/mcp/tools/*`(인가 + 코어 호출 + `revalidatePath`) · `lib/mcp/token-store.ts`.

**코어 추출 대응표**. 아래 `projects/actions.ts`는 `app/(edit)/projects/actions.ts`, `settings/actions.ts`·`sources/actions.ts`는 그
아래 `[slug]/`의 파일이다. **파일명은 동사형이다**(`lib/projects/archive.ts`처럼 — `*-run.ts` 접미 선례가 없다. 기존 `run.ts`는 도메인당
하나인 실행기 이름이다). 두 자격증명이 만나는 넷은 `lib/onboarding-run/`(§1.3).

| 도구 | 현재 진입점/코어 | 추출·재사용 범위 |
|---|---|---|
| `list_repositories` | `projects/actions.ts`의 `listConnectableRepos` | `lib/onboarding-run/repos.ts` — 사용자별 설치·리포 조회 조립 |
| `list_branches` | 같은 파일의 `listRepoBranches`·`listProjectBranches` | `lib/onboarding-run/branches.ts` — 신규/기존의 인가·브랜치 조회 |
| `detect_formats` | 같은 파일의 `detectRepoFormats`·private `checkRepoAccess` | `lib/onboarding-run/detect.ts` — 탐지와 리포 접근 확인. 기존 프로젝트용 분기는 §2.1 |
| `create_project` | 같은 파일의 `createProject` | `lib/onboarding-run/create.ts` — 생성·첫 적재·사건·push 토큰·YAML. User 잠금과 한도 검사 유지 |
| `add_sources` | 같은 파일의 `addSurfaces` → `lib/surfaces/create.ts`의 `addSurfacesFromSnapshot` | 리포 확인·다운로드·포맷 재검증 조립을 `lib/onboarding-run/add.ts`로. 표면 생성 tx는 기존 코어 |
| `rotate_push_token` | 같은 파일의 `rotatePushToken` | `lib/projects/rotate-token.ts` — 리포 쓰기 권한 확인·교체 tx·사건 |
| `archive_project`·`unarchive_project` | 같은 파일의 `archiveProject`·`unarchiveProject` | `lib/projects/archive.ts` — 보관 전환 tx·사건 |
| `invite_members` | 같은 파일의 `createInvitations` → `issueInvitations`·`sendInvitationEmails` | `lib/invitation-email/create.ts` — 수신자 검증·발급·발송·결과 조립 |
| `revoke_invitation`·`change_member` | 같은 파일의 `revokeInvitation`·`changeMember` | `lib/auth/members.ts` — tx·사건. 마지막 OWNER·멤버 한도·자기 변경 판정 유지 |
| `update_project` | `settings/actions.ts`의 `updateProjectName`·`updateRepositorySettings` | `lib/settings/update.ts` — 이름·base branch. 브랜치 검증·전달 확인 무효화 유지 |
| `set_base_locale` | `sources/actions.ts`의 `updateBaseLocale` | `lib/sources/base-locale.ts` — 선언 tx·사건 |
| `set_translations`·`get_key`·`list_keys` | `app/(edit)/actions.ts` 및 `lib/keys/` | `applyKeySaveBatch` 신설(`applyKeySave`의 판정 재사용) · 조회 코어 재사용. Action의 입력 검증·readiness 선행 조건도 공유 경계로 |
| `publish`·`preview_publish` | `app/(edit)/actions.ts`의 `triggerPullAction`, `app/(edit)/publish-actions.ts`, `lib/sync/run.ts`·`lib/publish/read.ts` | readiness·거부 결과 조립 공유 + §3.1의 `expectedFingerprint` 인자 |
| `sync_repository`·`preview_sync` | `projects/actions.ts`의 `runRepositoryImport`·`prepareRepositorySync`, `lib/import/run.ts`·`approval.ts` | 리포 접근·실행 준비 조립 추출, 기존 실행/폐기 지문 코어 재사용 |
| `revert_to_last_sent`·`preview_revert` | `app/(edit)/actions.ts`, `lib/keys/revert.ts` | 기존 코어 재사용, Action의 선행 인가·readiness 유지 |
| `list_projects`·`get_project`·`list_events`·`list_members`·`get_workflow` | 목록/Home/멤버 페이지의 조회 조립, `lib/keys/query.ts`·`lib/events/query.ts`·`lib/auth/query.ts`·`lib/onboarding/workflow.ts` | 기존 조회·집계·마스킹·YAML 재사용, 페이지 안 조립만 해당 `lib/`로 |
| `whoami` | 신규 | 사용자/토큰에 한정한 얇은 조회 |

**추출 경계**: Action은 세션 해석·웹 응답/리다이렉트·캐시 무효화를, 도구는 Bearer 주체·MCP 응답·동일 경로의 캐시 무효화를 든다.
공유 코어는 명시적 서버 주체와 검증된 입력을 받아 인가·readiness·잠금·변경/사건 tx·외부 I/O 결과 판정을 수행한다.
기존 입력 스키마·결과 타입은 세션/Next 의존성이 없는 공유 모듈로 옮긴다. `readSession` 다음 줄을 통째로 옮겨
`cookies`·`redirect`·`revalidatePath`를 코어에 끌어오지 않는다. 커밋 후 캐시 실패를 저장 실패로 바꾸지 않는 기존 처리
(`revalidateAfterCommit`)도 유지한다. 추출 후 Action/도구는 같은 코어를 호출하며, 도구에서 Action을 import하거나 인가·사건 쓰기를
복제하지 않는다. `app/__tests__/locked-access.test.ts`의 `SITES`(`file#function`, `function` 선언만 해석)와 `entry-points.test.ts`의
export 단위 가드 스캔은 옮긴 코어 가족마다 같이 갱신한다.

### 3.1 Publish 확인 — `expectedFingerprint` 인자 하나 (검수 D 반영)

**실행기 경계를 바꾸지 않는다.** `runPull`은 이미 `deps.loadState()`로 스냅샷을 주입받고(`lib/pull/run.ts`), `loadPullState`는
RepeatableRead 한 tx에서 키·번역·토큰·표면을 읽으며(`lib/pull/load.ts`, ARCHITECTURE §9), `acknowledgeDelivered`의 CAS가 캡처 뒤
편집을 보호한다 — "실행권 뒤 입력 한 벌 캡처"는 지금 `runPull`이 하는 일이다. 기존 형(`readDiscardApproval` → `sameFingerprint`,
`previewKeyRevert` → `executeKeyRevert`)을 그대로 따른다.

- **지문**: `publishFingerprint(state: PullState, baseHead)` — `discardFingerprint`와 같은 tuple 직렬화. 입력은 `loadPullState`가 준
  전체(키·번역·orphan·미전달 토큰·표면 설정·로케일 집합)와 base head SHA다. 표시 상한과 무관하므로 200행 밖 편집과 토큰 없는
  export 변경(orphan 제거 등)이 지문을 바꾼다.
- **미리보기**: `preview_publish`는 `readPublishPreview`가 이미 부르는 `loadPullState`와 이미 읽은 `head`로 지문을 낸다. 셀 표시는
  표시 전용이고 어떤 판정의 입력도 아니다(ARCHITECTURE §5.6.35) — 표시와 지문의 입력을 맞출 필요가 없다.
- **실행**: `runSync` → `triggerPull` → `runPull`에 `expectedFingerprint?: string`만 꿴다. `runPull`이 `loadState()`와 head를 읽은
  직후·GitHub 쓰기 전에 비교하고, 불일치면 `reconfirm`으로 반환한다. `runSync`의 실행권 tx·`startRun`·CAS·웹·cron 경로는 바뀌지
  않는다(인자를 안 주면 비교 없음).
- **덧붙일 것 둘**: ① `reconfirm`은 리포에 아무것도 안 썼으므로 `too-soon`의 기준(`status ∈ {SUCCEEDED, SKIPPED}`, `lib/sync/run.ts`)에서
  뺀다 — SKIPPED로 닫으면 에이전트가 새 핸들로 재호출해도 30초를 기다린다. ② 새 결과 갈래를 `lib/pull/__tests__/error-codes.test.ts`의
  양방향 목록에 등재한다.
- **캡처 뒤 편집**: 기존 CAS 그대로다 — 새 편집의 미전달 토큰은 지워지지 않는다.

검증은 지문 함수만으로 끝내지 않는다. 미리보기 뒤 저장 · base head 변경 · 표시 상한 밖 편집 · 미전달 토큰 없는 export 입력 변경을
끼워 넣어 `reconfirm`과 GitHub 쓰기 0회를, 대조 뒤 저장은 전송 제외와 미전달 보존을 확인한다. export 입력 경로가 바뀌므로 `/roundtrip`
(표현 5축 — `i18n-order-check`)을 T7 검증에 넣는다.

## 4. 스키마 변경 — additive

```prisma
model ApiToken {
  userId      String   @id                 // 계정당 하나 — PK가 곧 unique
  grants      String[]                      // TokenGrant — 앱 층 어휘(enum 아님, SyncRun.errorCode와 같은 근거). 빈 배열 = 읽기 전용
  allProjects Boolean                       // true면 내 멤버십 전부(이후 초대받은 프로젝트 포함), false면 projectIds만
  projectIds  String[] @default([])         // 선례 ProjectEvent.surfaceIds. 프로젝트는 삭제 경로가 없어 FK/Cascade가 할 일이 없다
  tokenHash   String   @unique              // sha256 hex
  createdAt   DateTime @default(now())
  lastUsedAt  DateTime?
  expiresAt   DateTime                      // 필수 — 만료 없는 토큰은 만들 수 없다
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}
```

- `ApiTokenProject` 조인 테이블은 두지 않는다(검수 G). 범위 검증은 발급 시 `projectIds ⊆ 현재 멤버십의 비보관 프로젝트`이고, 그 뒤
  멤버에서 빠진 id가 남아도 판정이 멤버십을 먼저 보므로 효과 0인 값이다 — 편집이 없으니 정리할 화면도 없다. 다시 초대받으면 그 범위가
  되살아나는데, 그게 맞다(토큰 주인이 고른 범위다).
- 폐기 = **행 삭제**, 재발급 = 같은 tx의 삭제 + 삽입(자격증명이다. 사건 보존 원칙은 `ProjectEvent`의 것이다).
- **`ProjectEvent`는 바뀌지 않는다** (✅ 2026-09-28 사용자). 에이전트가 한 일은 그 사용자가 한 일이다 — 경유 컬럼·Logs 표시 없음.
  탈취 대응은 사건이 아니라 토큰 쪽이 든다(만료 필수 · `lastUsedAt` · 재발급).
- `prisma/__tests__/schema-contract.test.ts`에 "인덱스는 `projectId` 선두" 규칙이 있으면 사용자 축 모델 예외로 등재한다(`Account`·`Session`이
  선례). 새 describe 블록(PK·`tokenHash @unique`·Cascade)은 신규 작성이다.
- ⚠️ 마이그레이션 뒤 dev·prod `has_schema_privilege` **네 칸**(USAGE·CREATE × anon·authenticated) 확인(ARCHITECTURE §7) ·
  `lib/privacy/collected.ts` 등재(`personal` 분류면 스칼라 전 필드 — 안 하면 typecheck red) · `/privacy` 본문 개정 이력.

### 4.1 배포와 preview 실물 검증

순서는 **dev DB 확장 → `/push`(route까지) → preview 실물 검증 → `/push`(페이지까지) → `/merge` 전 prod DB 확장·상태/권한 확인 →
앱 배포**다. additive 변경이라 기존 프로덕션 앱과 공존한다. dev와 prod를 같은 명령으로 적용하지 않는다.
Codex는 커밋까지 맡고 원격 `/push`·`/merge`는 Claude Code가 수행한다.

`dev.mal-moi.com`은 Vercel SSO 보호 뒤다. 앱의 Bearer만 보내면 보호층의 302에서 멈춘다.
검증에서는 Vercel의 자동화 bypass 값을 `x-vercel-protection-bypass` 헤더로 보내고, Malmoi Bearer는 기존
`Authorization` 헤더에 별도로 둔다. 두 자격증명을 바꾸어 쓰지 않는다.
[공식 보호 우회 문서](https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/protection-bypass-automation).

- CLI: 클라이언트의 추가 헤더 설정에 환경변수 참조로 bypass를 넣는다. 먼저 보호층 통과 뒤 앱 401/정상 MCP 응답을 구별한다.
- CI: 현재 `.github/actions/malmoi-i18n-push/action.yml`·`scripts/push-local.ts`에는 bypass 헤더를 받는 계약이 없다.
  폐기용 리포의 **테스트 전용 전송 래퍼**에서 기존 payload 생성 경로를 재사용하고, dev 대상 요청에만 bypass 헤더를 추가한다.
  이 검증은 보호된 preview의 적재/Publish 왕복을 보는 것이며, 공개 composite action을 그대로 실행한 검증으로 보고하지 않는다.
- bypass는 로컬 프로세스 환경/테스트 리포 secret에서만 읽고 URL 쿼리·설정 파일 원문·로그·캡처에 넣지 않는다.
  운영 보호를 전역 해제하거나 공개 action의 입력/불변 태그를 변경하지 않는다. 보호 통과 준비가 안 됐으면 실물 검증 미완으로 기록한다.

## 5. 새 환경변수

**앱 런타임에 추가할 환경변수는 없다.** 개인 토큰은 해시 조회이고, 샘플 HMAC은 기존 `APP_SIGNING_SECRET`을 재사용한다.
Publish 지문은 `discardFingerprint`처럼 상태 digest다. §4.1의 bypass 값은 검증 클라이언트/테스트 리포 전용이며
앱의 `lib/env.ts`나 `.env.example`에 추가하지 않는다.

## 6. 불변식 영향

- **1–4(엔진)** — strict push·병합 없음·어댑터 결정성·blob SHA 비교는 유지한다. Publish는 §3.1에 따라 비교 한 줄만 는다.
- **5(projectId 좁히기)** — 모든 도구가 `slug` → `getProjectAccess`가 돌려준 `projectId`를 쓴다. 사용자 축 조회(`ApiToken`·`Account`)는
  **토큰이 준 `userId`로** 좁힌다(POSTMORTEM 2026-09-06). 도구 인자에 `projectId`·`userId`를 받지 않는다 — 스키마가 그 필드를 모른다.
- **6(자격증명 분리)** — §1.3. 넷째 GitHub 자격증명이 아니다. `credential-separation.test.ts`에 `lib/onboarding-run`·`lib/mcp` 루트를
  Server Action 규칙 집합으로 추가한다(`APP_TOKEN_SOURCES`에 넣으면 `ensureUserToken`을 부르는 도구가 red다).
- **7(ProjectMember가 권한)** — 토큰에 역할을 넣지 않는다. 매 호출 DB 조회.
- **9(버린 값을 숨기지 않는다)** — Publish·Sync 결과의 `withheld`·`skipped`·`unconfirmed`를 도구 결과에 그대로 싣는다. 응답 유실
  (에이전트 쪽 타임아웃)은 스펙상 요청이 사라지고 재발행되므로 **Publish 재호출은 서버 게이트(`already-running`·`too-soon`)가 막는다.**
- **10(쓰기 경로는 서버가)** — `create_project`·`add_sources`의 `adapter`·`pathTemplate`은 여전히 `planConfirmedFormat` 재검증 +
  샘플 확인값을 지난다. `requirePush: true` 필수(POSTMORTEM 2026-09-27).
- **인증 경계(§6)** — 새 진입점이 하나 는다. `app/__tests__/entry-points.test.ts`는 route를 `EXEMPT` 문자열 집합에 넣는 구조라
  **"EXEMPT route → 필수 가드 호출" 맵 검사를 새 메타 테스트로 만든다**(주석 제거 후 `resolveApiToken(` 호출 — POSTMORTEM 2026-09-18).
  `lib/mcp/**`·`app/api/mcp/**`의 쿠키 금지 스캔(`auth(`·`readSession(`·`cookies(`)도 신규다(기존은 `await auth()`만 금지).
  `/api/*`는 middleware matcher 밖이라 CSP·로그인 리다이렉트가 안 걸린다 — 그게 맞다(JSON 진입점).
- **`maxDuration`** — route 세그먼트에 `export const maxDuration = 60`(리포의 다른 10곳과 같다). Server Action 세그먼트 규칙(§3.1)과 별개다.
- **보관 정책** — `list_events`만 읽기 예외를 넘기고 나머지는 기본 거부(PRODUCT §3).

## 7. POSTMORTEM 인용

- **2026-09-06 인가는 지났는데 사용자로 안 좁혔다** → 토큰이 준 `userId` 외의 주체를 쓰지 않는다. 테스트 시드에 사용자 둘·토큰 둘.
- **2026-09-16 `Promise.all` 토큰 회전 경합** → 에이전트 병렬 호출이 같은 모양. §1.3.
- **2026-09-18 가드를 이름으로 셌다** → 새 메타 테스트 + 가드 호출 삭제 뮤테이션을 한 번 건다.
- **2026-09-23/24 잠금 대기 중 회수된 권한** → `lockProjectAccess`가 유일한 확장점. §1.25.
- **2026-09-27 토큰 수령자가 리포에 쓸 수 있나** → `create_project`·`add_sources`·`rotate_push_token`은 `requirePush: true`.
- **2026-09-04 `.env.local` 유출** → 가이드의 연결 예시는 토큰을 **환경변수로** 넘기게 쓴다(`--header "Authorization: Bearer $MALMOI_TOKEN"`).
- **2026-09-20 커밋 뒤 `revalidatePath` 실패** → 추출 코어는 `revalidateAfterCommit`을 지난다.

## 8. 화면

**전용 페이지 `/mcp` — `MCP connector`** (2026-09-28 사용자 — PRODUCT §4.3 ⑤ "전용 라우트를 만들지 않는다"를 뒤집는다).

- **자리**: 사용자 축(`Your work`). `lib/shell/nav.ts`의 `navWorkItems()`에 `Projects` · `New project` 다음으로 — 사이드바와 헤더 사용자
  메뉴가 같은 목록을 읽으므로 둘 다에 선다(의도). `exact: true`, 아이콘 `Plug`(§6.8 — 셸은 전 항목이 아이콘을 든다). 인가는
  `requireUser`, `isProtectedPath`에 `/mcp` 추가. 제목과 사이드바 라벨이 **같은 키**(`m.common.nav.mcp` — DESIGN "메뉴명 = 페이지 제목").
  PRODUCT §7.7 IA 트리 갱신.
- **구성** (위→아래, 검수 M — 첫 사용자가 없는 토큰을 참조하는 조각을 먼저 보지 않게):
  1. **토큰 카드** — `RowCard` 헤더 `action`에 [Create token](없을 때) 또는 [Rotate] `default` + [Revoke] `danger`(있을 때, 인라인 —
     kebab 메뉴는 §6.65가 기각한 숨김형이다). 본문은 메타 평문 `text-xs`: 허용 동작(`Translate & publish · Members` — 비면 **`Read only`**,
     빈 것을 안 그리면 "권한 없음"과 구별이 안 된다) · 범위(`All projects` / `3 projects`) · Created · Last used · Expires. 시각은 Members의
     `Expires in 6 days` 형(상대 라벨 + `<time dateTime>` 절대값 — `lib/relative-time.ts`). 만료됐으면 `Expired` `Badge neutral` + 메타
     `text-neutral-400`, 헤더 버튼은 [Create token]. 없을 때 본문은 `EmptyRowCard inset` 한 문단(**버튼 없음** — 할 일은 헤더다).
     상시 캡션 한 줄: `Project settings and Members apply only where you're a project owner.`(조건부 역할 경고 대신 — `All my projects`
     범위에선 계산할 수 없다).
  2. **연결** — 서버 URL(`https://mal-moi.com/api/mcp`, 환경별 origin, sans `<code>`) + `SegmentedControl` 셋(Claude Code · Codex · Cursor)
     아래 `components/docs/code-block.tsx`(파일명 줄 + Copy — mono 허용 목록 둘 중 하나라 목록이 안 는다). 토큰은 **환경변수 참조로만**
     쓰인다(`$MALMOI_TOKEN`) — 조각에 원문을 박지 않는다(POSTMORTEM 2026-09-04).
  3. **가이드 링크 한 줄** — "무엇을 시킬 수 있나"는 가이드가 정본이다. 카탈로그 섹션은 두지 않는다(낡을 사본).
- **발급 = `OnboardingModal` 2단계** (440 `Dialog`는 확인창이다 — 초대 폼과 같은 판정, §6.65): ① 만료(30 / 90 / 365일, 기본 90.
  "없음"은 없다 ✅ 2026-09-28 사용자) · 허용 동작 체크 넷 — 각 체크 옆 한 줄이 spec의 "grant 없는 조회" 규칙을 말한다 · 범위 라디오
  (All / 고른 프로젝트 — 내 멤버십, 보관 제외; **멤버십 0이면 "고른 프로젝트"를 `aria-disabled` + 사유**, 사유 없는 `disabled` 0건 원칙)
  → ② 원문 1회 — 온보딩 ④ 결과 화면의 **토큰 칩 + Copy** 형(`components/onboarding/steps/result.tsx`, `<code font-sans>`) + "이 창을
  닫으면 다시 볼 수 없다"(`<strong className="font-normal">`, 새 키 — 모달 문맥). 복사 성공만으로 닫지 않는다. Rotate는 같은 모달에 확인
  문장 한 줄("기존 에이전트 연결이 끊긴다")을 ① 위에 얹는다.
- **Revoke**: 440 `Dialog` + `danger`. 제목 `Revoke your token?`, 확정 라벨 `Revoke token`(트리거와 다른 결과형 — §10). 되돌릴 수 없음을 말한다.
- **진행·실패·결과 미확인**: 발급·재발급·폐기 중 중복 제출을 막고(`Button busy`) 진행 상태를 표시한다. 서버의 명시적 거부는 입력을 유지한
  채 폼/카드에서 설명한다. 세션 만료는 다시 로그인하도록 안내한다. 응답 유실·연결 예외는 **Sync 버튼과 같은 처리**(`unconfirmed` 인라인
  `Alert` + 온라인이면 `router.refresh()` — `home/sync-button.tsx`)이고 자동 재시도하지 않는다. 발급 미확인 문구의 다음 행동은 한 문장이다:
  "카드를 확인하고 원문을 못 받았으면 Rotate". 목록 재조회 컨트롤은 두지 않는다(서버 컴포넌트의 조회 실패는 라우트 `error.tsx` 영역).
- **복사 실패**: 기존 `CopyButton`의 실패 라벨(`Copy failed`)을 쓰고 원문 표시를 유지한다. 원문 전체를 선택해 수동 복사할 수 있어야 한다.
- **포커스**: Revoke·Rotate·Create 뒤 착지는 **카드 제목 하나**(`headingId` + `tabIndex=-1`, `member-list.tsx`와 동일 — 버튼이 헤더 하나라
  갈래가 없다). Dialog/모달 취소는 호출한 컨트롤로 돌아가고(`useLandAfter` · `neighbourFocus`), 거부/결과 미확인은 남아 있는 폼 또는 카드의
  복구 컨트롤에서 이어진다. 완료는 항상 DOM에 있는 `role="status"`로 알린다.
- **새 raw 색·새 Badge variant는 없다** — `Badge neutral` · `Button danger` · `Alert danger` · `bg-muted` 안에서 끝난다. DESIGN §6.2 등재 없음.
- **새 페이지라 `/design-sync` 대상이다** — Claude Design 핸드오프(정적 시안, 상태별 프레임: 빈 · 카드(활성) · 카드(만료) · 발급 ① ·
  발급 ②(원문) · Rotate 확인 · Revoke 확인 · 거부 · 결과 미확인 · 멤버십 0의 범위 선택)를 받아 구현한다. "진행"·"복사 실패"는 프리미티브가
  들어 프레임이 필요 없다. **시안**: https://claude.ai/design/p/b99d54cd-3034-44f1-8446-0a864da9d767?file=design_handoff_mcp_connector%2FREADME.md (2026-09-28 수령).
- 가이드 `/docs`에 **Connect an AI agent** 페이지 하나(`/guide`) — 설정·예시 프롬프트("이 리포를 Malmoi에 연결해 줘", "비어 있는 fr
  번역을 채우고 Publish해 줘")·권한 설명·도구 묶음. 페이지와 가이드가 같은 사실을 말하되 정본은 가이드다.
