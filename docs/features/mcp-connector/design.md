# mcp-connector — design

## 1. 영향 받는 흐름

**셋 다다** — 온보딩(프로젝트 생성·표면 추가) · 편집 UI의 쓰기 전부(번역 저장 · Revert · Sync · Publish · 설정 · 멤버) · pull(Publish
트리거). 새 흐름은 없고 **새 진입점 하나**(`/api/mcp`)가 기존 흐름의 코어를 부른다.

```
CLI 에이전트 ──POST /api/mcp (Authorization: Bearer mlm_…)──▶ route.ts
   └ 인증: sha256(token) → ApiToken 행 → userId   (쿠키를 읽지 않는다)
   └ 크기: readBoundedText (1 MiB)
   └ 디스패치: tools/call name → tool handler(userId, args)
        └ 인가: getProjectAccess / getSurfaceAccess / lockProjectAccess  ← Server Action과 같은 함수
        └ 코어: lib/** (applyKeySave · runSync · executeKeyRevert · …) ← Server Action과 같은 함수
        └ revalidatePath: 화면을 보는 사람의 캐시를 Action과 같은 경로로 무효화
```

**Server Action과 도구는 같은 코어의 형제 껍데기다.** 도구가 Action을 부르지 않는다 — Action은 `readSession()`으로 주체를 얻는데
이 진입점엔 세션이 없다. 그리고 CLAUDE.md "외부가 부르는 진입점을 Server Action으로 만들지 않는다"가 그 반대 방향을 이미 막는다.

### 1.1 프로토콜 — 2026-07-28 stateless

- 세션·`initialize`가 없다. 요청마다 `_meta`에 버전·클라이언트 능력이 실린다. `server/discover`를 구현한다(MUST).
- **2025-11-25 클라이언트도 받는다** — 아직 `initialize`를 보내는 클라이언트가 대부분일 것이다. 받는 쪽 호환은 SDK가 드는지
  **T1에서 먼저 잰다**(`@modelcontextprotocol/server` 2.x — 2.0.0이 2026-07-27, 2.1.0이 2026-09-23. `mcp-handler`는 SSE용 Redis를
  끌고 와 쓰지 않는다). SDK가 둘 중 하나만 들면 **2025-11-25 stateless 모드**(세션 id 미발급 + JSON 응답)를 먼저 세운다 — 에이전트
  CLI의 현재 지원이 그쪽이다.
- 응답은 **JSON 한 벌**(SSE 스트림 없음). 진행 알림을 보낼 긴 작업이 Publish·첫 적재 둘이고 둘 다 60초 안이다.
- 호출 사이 상태 = **서버 발급 핸들**(스펙 SEP-2567의 권고형). Publish 지문은 신규이며,
  샘플 HMAC은 기존 발급/검증 함수를 재사용하되 생성·소스 추가 소비 경로를 새로 연결한다:

| 핸들 | 발급 | 소비 | 이미 있나 |
|---|---|---|---|
| 샘플 확인값(HMAC, 30분) | `detect_formats` | `create_project` · `add_sources` | 발급/검증 함수는 기존, 두 쓰기 도구의 소비는 신규(§2.2) |
| Sync 폐기 지문 | `preview_sync` | `sync_repository` | ✅ `readDiscardApproval` |
| Revert 확인값 | `preview_revert` | `revert_to_last_sent` | ✅ `previewKeyRevert` |
| **Publish 지문** | `preview_publish` | `publish` | ❌ **신규** — §3 |
| 목록 cursor | `list_keys` · `list_events` | 같은 도구 | ✅ `loadTranslationList` · `loadEvents` |

### 1.2 인증

- 토큰 형: `mlm_` + 32바이트 base64url. 접두는 비밀 스캐너(GitHub secret scanning 등록은 비목표)와 사람 눈이 알아보게 하는 것이다.
- 저장은 **sha256 hex만**이라 발급 뒤 원문은 **어디에도 없다** — 목록은 `prefix`(앞 8자)만 보인다. 잃어버리면 재발급 + Revoke다 (✅ 사용자 확인).
  해시 규칙은 `hashInviteToken` 한 벌이다(push 토큰·초대와 같다). **조회 방향은 해시 → 행**이고(PRODUCT §7.8의 교훈),
  행이 `userId`를 준다. 비교 연산이 없어 타이밍 축이 없다.
- 판정 `planApiTokenUse({ row, now })` → `ok | rejected` 두 갈래(만료·폐기·없음을 한 갈래로 접는다 — 401 하나).
- `lastUsedAt`은 **1분 단위로만** 갱신한다(호출마다 UPDATE하면 에이전트 루프가 행 잠금을 두드린다). 판정은 순수 `shouldTouch`.
- ⚠️ **쿠키를 읽지 않는다.** `auth()`·`readSession()`을 이 route에서 부르지 않고 소스 스캔이 센다 — 쿠키를 받으면 브라우저의
  제3자 페이지가 POST로 이 진입점을 부를 수 있다(CSRF). `Origin` 헤더가 있으면 거부한다(스펙의 DNS rebinding 권고; CLI는 안 싣는다).
- 사용자 삭제는 `onDelete: Cascade`(토큰은 자격증명이라 사건과 달리 보존할 이유가 없다).

### 1.25 토큰 권한 — 역할 ∩ 토큰

```ts
type TokenGrant = Permission | "project:create";          // 토큰 전용 어휘 하나만 더한다
type TokenScope = { kind: "all" } | { kind: "projects"; projectIds: readonly string[] };

// 순수 — lib/mcp/grant.ts
planToolAccess({ role, grants, scope, projectId, rolePermission, tokenGrant }) →
  | { status: "ok" }
  | { status: "not-found" }      // 범위 밖 — 존재를 말하지 않는다(멤버 아님과 같은 갈래)
  | { status: "forbidden" }      // 역할이 못 한다 — 화면과 같은 사유
  | { status: "token-scope" }    // 역할은 되는데 이 토큰이 안 받았다
```

- **판정 순서가 계약이다**: 범위 → 멤버십·보관(`planProjectAccess`) → 역할 → 토큰. 범위를 먼저 봐야 범위 밖 프로젝트의 보관·역할이
  새지 않는다. 역할을 토큰보다 먼저 봐야 EDITOR에게 "토큰을 고치면 된다"는 거짓 안내가 안 선다.
- **역할 조건과 토큰 grant 조건은 별개다** (2026-09-28 검수 6 반영). `rolePermission`은 기존 역할 판정,
  `tokenGrant`는 위임 동작 판정이며 `null`이면 해당 조건을 요구하지 않는다. 프로젝트 조회의 멤버십·범위·보관 정책은 계속 적용한다.
  빈 grants는 아래 표의 grant 없는 조회만 허용한다. OWNER 전용 조회는 읽기 전용 토큰이어도 OWNER여야 한다.
  리포 목록·브랜치 조회·포맷 탐지는 생성/설정 준비 경로여서 해당 grant를 요구한다. `readOnlyHint`는 인가 조건이 아니다.
- `project:create`는 프로젝트 판정을 지나지 않는다 — `create_project`·`list_repositories`와 신규 프로젝트용 `detect_formats`가
  그것을 본다. 기존 프로젝트용 탐지는 범위·OWNER·`project:settings`를 요구하고 `project:create`는 요구하지 않는다(§2.1).
  **고른-프로젝트 범위 토큰이 만든 프로젝트는 같은 트랜잭션에서 그 토큰의 범위에 들어간다** — 안 넣으면 방금 만든 프로젝트를 그
  토큰이 못 만진다.
- ⚠️ **모든 쓰기 코어가 잠금 뒤 토큰 판정을 다시 지난다** — 호출 시작과 잠금 사이에 권한을 줄였으면 잠금 뒤가 이긴다.
  `lockProjectAccess`만 변경해서는 충분하지 않다. 직접 잠금을 잡는 코어와 프로젝트 생성까지 아래 계약을 적용한다.
- 권한 변경은 **행 갱신**이고 다음 호출부터 반영된다(매 호출 DB 조회 — ARCHITECTURE §6.00 ④와 같은 이유).

#### 쓰기 주체와 재인가 경계 (2026-09-28 검수 2 반영)

- 서버가 구성한 쓰기 주체는 웹 `{ kind: "session", userId }`와 MCP `{ kind: "api-token", userId, tokenId }`를 구별한다.
  도구 입력으로 주체를 받지 않는다. MCP 껍데기는 이 주체를 코어까지 전달하며 `userId`만 넘겨 웹 경로로 바꾸지 않는다.
  사건의 actor는 두 경우 모두 기존 USER다. cron의 기존 시스템 주체는 그대로 둔다.
- 기존 `Project` → `TranslationSurface` 잠금 뒤, 같은 쓰기 tx에서 ApiToken과 범위를 다시 읽는다. 토큰의 `userId` 일치,
  존재·만료부터 확인하고 §1.25의 범위 → 멤버십/보관 → 역할 → grant 순서를 적용한다. 입구에서 얻은 grants/scope를 재사용하지 않는다.
  유효하지 않은 토큰은 인증 거부로 접고, 이 재판정 실패 자체로 프로젝트 사건을 남기지 않는다.
- 토큰 행과 범위는 **한 시점의 상태**로 읽는다. 코어는 재판정 동안 토큰 부모 행을 공유 잠금하고, 토큰 권한/범위 수정·폐기도
  같은 부모 행을 배타 잠금한 뒤 변경한다. 범위 수정만 할 때도 부모 행을 잠근다. 기존 프로젝트/표면 잠금 뒤 토큰 잠금 순서를
  유지하고, 토큰 관리 tx에서 역으로 프로젝트 잠금을 잡지 않는다. 재판정을 통과한 짧은 tx가 먼저 끝나거나 회수가 먼저 반영되게 한다.

| 쓰기 경로 | 재판정 위치 |
|---|---|
| 키 저장 | `lib/keys/save-key.ts`의 키별 tx, Project → Surface 잠금 뒤. 배치도 키마다 확인 |
| Publish | `lib/sync/run.ts`의 실행권 획득 tx, Project 잠금 뒤·SyncRun 생성 전 |
| 수동 Sync | `lib/import/run.ts`의 실행권 획득 tx, 직접 잡는 Project 잠금 뒤·import token 기록 전 |
| Revert | `lib/keys/revert.ts`의 Project → Surface 잠금 뒤·번역/사건 쓰기 전 |
| 소스 추가 | `lib/surfaces/create.ts`의 Project 잠금 뒤·표면/첫 적재 쓰기 전 |
| 프로젝트 생성 | 추출할 생성 코어의 User 잠금 뒤. 토큰 유효성과 `project:create`를 확인한 뒤 생성과 토큰 범위 추가를 같은 tx에서 수행 |
| 설정·기준 로케일·push 토큰 회전·멤버/초대·보관/복원 | 각 추출/재사용 코어의 기존 쓰기 tx에서 해당 Project/Surface 잠금 뒤·변경/사건 쓰기 전 |

Publish·Sync처럼 외부 I/O가 이어지는 작업의 권한 확정 시점은 위 **실행권 획득**이다. 이후 폐기가 이미 시작된 외부 작업을
취소하는 계약은 아니다. 토큰 잠금을 GitHub/메일 I/O 동안 유지하지 않으며, 미시작 작업과 배치의 다음 키는 새 판정을 지난다.
샘플 확인값·폐기 지문·Revert/Publish 지문은 이 재인가를 대신하지 않는다.

### 1.3 GitHub 자격증명 — 세 축 그대로

MCP 토큰은 **넷째 GitHub 자격증명이 아니라 Malmoi 신원**이다. 도구 안에서 GitHub을 부르는 방식은 Action과 같다: 사용자 확인은
`ensureUserToken(prisma, userId)`(user-to-server, GET만), 쓰기는 installation 토큰. `credential-separation.test.ts`의 대상 목록에
`app/api/mcp/**`·`lib/mcp/**`를 넣는다.

⚠️ **POSTMORTEM 2026-09-16** — 에이전트는 도구를 **병렬로** 부른다(`list_repositories` + `list_branches`를 한 턴에). 같은 사용자의
만료 토큰을 두 요청이 동시에 갱신하는 모양이 탭 둘보다 훨씬 흔해진다. `token-store.ts`의 조건부 쓰기 + `afterRace`는 **요청 사이**
경합용이고 이것이 그 경우다 — 동작은 맞지만 `reauthorize` 오판 창이 넓어지므로 T6에 동시 호출 테스트를 넣는다.

## 2. 도구 목록과 쓰기 범위 (PRODUCT §4.3 ⑤의 개방 조건)

**역할은 기존 `Permission` 셋으로, 토큰은 그 셋과 토큰 전용 `project:create`로 판정한다.** 역할 표에 넷째를 만들지 않는다.
읽기 표는 역할과 grant를 분리한다. 쓰기 표의 권한은 역할과 grant 둘 다 요구하며, `project:create`만 프로젝트 역할이 없다.
"쓰기 범위"는 그 도구가 바꿀 수 있는 것이다.
`annotations`는 MCP 클라이언트가 확인창을 띄우는 근거다(`readOnlyHint` · `destructiveHint`).

### 2.1 읽기 (`readOnlyHint: true`)

| 도구 | 프로젝트 역할 조건 | 토큰 grant 조건 | 코어·비고 |
|---|---|---|---|
| `whoami` | 없음(계정 조회) | 없음 | 유효 토큰 필수. 이름·GitHub 연결·프로젝트 수/한도(3)·토큰 권한/범위 |
| `list_projects` | OWNER / EDITOR | 없음 | 기존 목록 조회·표시 판정. 멤버십 ∩ 범위로 필터 |
| `get_project` | OWNER / EDITOR (`translation:write`) | 없음 | Home 집계. 표면·로케일·To send·열린 PR·연결 건강 |
| `list_repositories` | 없음(생성 준비) | `project:create` | `listConnectableRepos`. GitHub 연결/설치가 없으면 `needs-browser` |
| `list_branches` | 신규: 없음 / 기존: OWNER (`project:settings`) | 신규: `project:create` / 기존: `project:settings` | `listRepoBranches` / `listProjectBranches`. sync 브랜치 제외 |
| `detect_formats` | 신규: 없음 / 기존: OWNER (`project:settings`) | 신규: `project:create` / 기존: `project:settings` | 두 경로 모두 GitHub 쓰기 권한 확인. 기존은 저장된 리포·base branch만 탐지 |
| `list_keys` | OWNER / EDITOR (surface `translation:write`) | 없음 | `loadTranslationList`. 검색·상태 필터·cursor, 페이지 50 |
| `get_key` | OWNER / EDITOR (surface `translation:write`) | 없음 | `lib/keys/query`. 로케일 값·설명·사용처·플래그 |
| `preview_publish` | OWNER / EDITOR (`translation:write`) | 없음 | `readPublishPreview` + Publish 지문 |
| `preview_sync` | OWNER (`project:settings`) | 없음 | `readDiscardApproval` + `planImportConfirmation` |
| `preview_revert` | OWNER (surface `project:settings`) | 없음 | `previewKeyRevert` |
| `list_events` | OWNER / EDITOR (`translation:write`) | 없음 | `loadEvents`. 보관 중 읽기 예외 유지 |
| `get_workflow` | OWNER (`project:settings`) | 없음 | `renderProjectWorkflowYaml`. push 토큰 원문 없음 |
| `list_members` | OWNER / EDITOR | 없음 | 멤버 조회. 남의 이메일 마스킹 유지 |

프로젝트 대상 조회는 토큰 범위·현재 멤버십을 확인하며 표면 조회는 해당 프로젝트의 표면으로 좁힌다.
grant 없이 미리보기 핸들을 얻어도 실행은 역할과 쓰기 grant를 다시 검사한다.

**`detect_formats`의 두 입력 경로** (2026-09-28 검수 5 반영): 신규 프로젝트는 `{ owner, repo, ref? }`,
기존 프로젝트는 `{ slug }`다. 둘을 섞은 입력은 거부한다. 기존 경로는 범위 → 멤버십·보관 → OWNER → 토큰의
`project:settings`를 확인한 뒤, 인가된 프로젝트에 저장된 리포와 base branch로 탐지한다. 호출자가 다른 리포나 ref로
바꿀 수 없으며 GitHub 리포 쓰기 권한도 확인한다. 후보와 확인값은 `add_sources`에 전달한다.
따라서 기존 프로젝트 하나에 `Project settings`만 허용한 토큰으로 탐지 → 소스 추가가 끝난다.
범위 밖은 `not-found`, EDITOR는 `forbidden`, OWNER지만 grant가 없으면 `token-scope`이며,
기존 프로젝트 탐지가 거부됐다고 신규 탐지 경로로 자동 전환하지 않는다.

### 2.2 쓰기

| 도구 | 권한 | 쓰기 범위 | 확인 | hint |
|---|---|---|---|---|
| `create_project` | `project:create` + `repo push` | Project·OWNER·Surface N·첫 적재·push 토큰 · 고른-범위 토큰이면 그 범위에 추가 | 샘플 확인값 | — |
| `add_sources` | `project:settings` + `repo push` | Surface 추가·첫 적재 | 샘플 확인값 | — |
| `set_translations` | surface `translation:write` | 키 ≤100개의 로케일 값·`needsReview` 해제(키별 원자) | — | — |
| `publish` | `translation:write` | sync 브랜치 커밋·PR 생성/갱신 | **Publish 지문** | — |
| `sync_repository` | `project:settings` | 리포 값으로 번역 덮기(미전달 폐기 포함) | 폐기 지문 | destructive |
| `revert_to_last_sent` | surface `project:settings` | 키 하나의 미전달 셀 복원 | Revert 확인값 | destructive |
| `update_project` | `project:settings` | 이름 · base branch | — | — |
| `set_base_locale` | surface `project:settings` | 기준 로케일 **선언** | — | — |
| `rotate_push_token` | `project:settings` + `repo push` | push 토큰 교체(원문 반환) | — | destructive |
| `invite_members` | `member:manage` | 초대 발급 + **메일 발송** | — | — |
| `revoke_invitation` · `change_member` | `member:manage` | 초대 무효 · 역할 변경/제거 | — | destructive |
| `archive_project` · `unarchive_project` | `project:settings` | `archivedAt` | — | archive만 destructive |

**생성·소스 추가의 샘플 확인 계약** (2026-09-28 검수 4 반영): 현재 `verifySampleConfirmation`의 소비자는
`loadCandidateSample`이다. 기존 웹 `createProject`·`addSurfaces`는 확인값을 받지 않고 파일을 다시 읽어
`planConfirmedFormat`으로 검증한다. MCP의 두 쓰기 도구에 확인값 소비를 **새로 추가**하며 웹 입력 계약은 유지한다.

- MCP에서는 선택한 후보마다 `confirmation`을 필수로 받는다. 기존 `signSampleConfirmation`·`verifySampleConfirmation`과
  `APP_SIGNING_SECRET`을 재사용한다. 인가된 사용자·repositoryId·installationId·ref·현재 head SHA가 서명된 값과 같아야 한다.
- 검증 함수가 반환한 포맷과 선택한 adapter·pathTemplate을 대조하고, baseLocale은 서명된 locales에 포함돼야 한다.
  다른 사용자/리포/설치/브랜치/head의 확인값을 쓰거나 서명과 다른 포맷을 제출해 생성·추가할 수 없다.
- 확인값 누락은 입력 오류다. 변조·컨텍스트 불일치·만료·미래 발급 시각은 기존 `sample-expired`로 접고,
  `detect_formats`를 다시 호출해 확인값을 받아 선택하도록 안내한다. 포맷/기준 로케일 불일치는 기존 `manual-no-match`다.
  기존 TTL 경계(30분 이내 유효, 초과 시 만료)를 유지하며, 자동 재탐지로 새 확인값을 만들어 쓰기를 계속하지 않는다.
- **같은 스냅샷을 검증과 적재에 쓴다.** 인가 후 읽은 리포 스냅샷으로 HMAC을 확인하고, 해당 head에 고정된 파일을
  `planConfirmedFormat` → 첫 적재 준비에 전달한다. 확인 뒤 다시 ref를 읽어 다른 head의 파일을 적재하지 않는다.
  HMAC은 기존 포맷 재검증·다운로드 예산·리포 쓰기 권한·tx 안 재인가를 대체하지 않는다.
- 여러 후보 중 하나라도 확인이 실패하면 생성/추가 tx에 들어가지 않는다. Project·Surface·번역·사건·토큰 범위에
  부분 변경을 남기지 않는다. 선택한 후보 전부의 확인과 첫 적재 준비가 끝난 뒤 기존 원자적 쓰기를 수행한다.

- **`set_translations`는 한 호출에 키 최대 100개, 키마다 원자다** (✅ 2026-09-28 사용자). 키마다 화면 Save와 같은 `applyKeySave`를
  **순차로** 돌리고 결과를 키별로 돌려준다(`saved` · `cannot-clear` · `not-found` · …) — 일부 실패가 정상 결과다. 사건도 키마다 하나로
  지금과 같다. 순차인 이유: 같은 `Project`→`Surface` 잠금을 병렬로 잡으면 서로 기다리기만 한다. 아래 실행 기한으로
  새 키 시작을 멈추고, **아직 시작하지 않은 키만** `notAttempted`로 돌려준다(불변식 9).
- **`runFirstIngest`는 도구로 따로 두지 않는다** — `create_project`가 첫 적재까지 한 트랜잭션이다(ARCHITECTURE §3.1). 실패한 표면의
  재시도는 `add_sources`와 같은 경로가 아니라 Sources 화면의 버튼이다 — 필요해지면 `retry_first_ingest`를 더한다.
- **push 토큰 원문이 도구 결과로 나간다** (✅ 2026-09-28 사용자). 결과는 에이전트 대화(= LLM 공급자)에 실린다. 받아들이는 근거: 프로젝트
  한정 · `/api/push` 한 곳의 쓰기 · 재발급이 곧 폐기이고, 어차피 그 토큰이 가는 곳이 그 에이전트가 쓰는 리포의 secret이다.
  도구 설명은 `gh secret set PUSH_TOKEN --repo OWNER/REPO`의 **표준입력**으로 원문을 전달하도록 안내한다.
  생성 YAML의 `${{ secrets.PUSH_TOKEN }}`과 같은 이름이다. `--body`를 생략해야 표준입력을 읽으며,
  `--body -`는 문자 `-`를 저장하므로 쓰지 않는다. `OWNER/REPO`는 생성 결과의 대상 리포로 지정한다.

#### 일괄 저장의 실행 기한 (2026-09-28 검수 10 반영)

- route 진입 때 단조 시계로 시작 시각을 잡는다. 인증·본문 읽기·입력 검증 시간도 포함해 **55초를 작업 기한**으로 두고,
  `maxDuration = 60`의 마지막 5초는 결과 직렬화·반환 여유로 남긴다. 100키는 입력 상한이며 한 요청에서 전부 처리한다는 보장이 아니다.
- 기존 `applyKeySave`는 키 하나에 `maxWait = 10초`, `timeout = 30초`를 허용한다. 새 키는 작업 기한까지
  **41초 이상**(기존 대기+실행 상한 40초와 완료 처리 여유 1초)이 남았을 때만 시작한다. 남은 시간이 부족하면
  다음 키부터 끝까지 `notAttempted`로 채우고 바로 반환한다. 웹 저장의 기존 timeout은 바꾸지 않는다.
- 시작한 키는 tx 종료를 기다려 커밋 확인 시 `saved`, 정상 거부 시 그 사유, 롤백이 확인된 시간 초과 시 실패로 기록한다.
  결과를 모르는 통신 장애는 `unconfirmed`다. 시작한 키를 `notAttempted`로 바꾸거나 `Promise.race`로 응답만 먼저 보내고
  저장을 뒤에서 계속 돌리지 않는다. 시간 초과·결과 미확인이면 후속 키는 시작하지 않는다.
- 결과는 입력 순서대로 모든 키에 하나씩 반환한다. 이미 커밋된 키는 이후 실패 때문에 롤백하지 않고,
  미시도 키에는 번역 변경·사건이 없어야 한다. 응답 전체가 유실되면 수신자는 저장 여부를 단정하지 말고 다시 조회한다.
  프로세스 강제 종료·네트워크 단절까지 응답 전달을 보장하는 계약은 아니다.
- 시계 입력을 받는 순수 예산 판정과 I/O 루프를 분리한다. 41초 경계·인증 지연·50초 시점의 다음 키 시작 차단,
  100키의 성공/거부/미시도 혼합, tx 시간 초과·결과 미확인을 검증한다. PG 검증은 반환 결과와 실제 번역·사건 상태를 함께 대조한다.

### 2.3 결과 모양

- 성공은 `structuredContent`(JSON) + 짧은 `text` 요약. 거부는 **`isError: true` + 기존 거부 코드**(`archived` · `not-found` · `forbidden` ·
  `reconfirm` · `repo-read-only` · …)와 `messages/en.tsx`의 **같은 문장**이다 — 에이전트가 사용자에게 옮길 문장이 화면과 같아야 한다.
- 순수 `toToolResult(union)` 하나가 모든 도구의 union → MCP 결과 변환을 든다. **장애는 거부가 아니다**(§6.00 ②) — `unavailable`은
  `retryable: true`를 싣고 나머지는 싣지 않는다.
- 500 본문 규칙(§6.0)을 따른다 — 예외 메시지·스택을 결과에 싣지 않는다.

### 2.4 브라우저가 필요한 갈래 — `needs-browser`

GitHub App 설치·user-to-server 인가는 state 쿠키가 방어선인 브라우저 왕복이다(§6.4) — 도구가 대신하지 않는다. `ensureUserToken`이
`not-connected`·`reauthorize`이거나 설치 목록이 비면 결과가 `{ status: "needs-browser", url, reason }`이고 `url`은 **고정 경로 둘 중
하나**(`/projects/new` · `/account`)다. 서명·nonce를 URL에 싣지 않는다 — 버튼을 누르는 곳은 여전히 그 화면이다.

**자동 탐지 후보 없음** (2026-09-28 검수 7 반영): `detect_formats`가 정상 조회 후 `no-candidates`를 반환하면
`{ status: "needs-browser", reason: "no-candidates", url }`로 안내한다. 신규 경로는 `routes.newProject()`에 해당하는
`/projects/new`, 기존 경로는 인가된 slug로 만든 `routes.sources(slug)`(`/projects/<slug>/sources`)다.
기존 프로젝트에서는 Sources의 Add source를 열어 수동 경로를 입력하도록 설명한다. 브라우저는 기존 `confirmManualFormat`과
생성/추가 검증을 사용한다. MCP 수동 확정 도구나 확인값 생략 경로는 추가하지 않는다.
URL은 서버 라우트 헬퍼로 조립하고 토큰·확인값·임의 return URL을 싣지 않는다. scope/역할 거부·GitHub 장애·예산 초과는
각 원래 결과를 유지하며 브라우저 전환으로 숨기지 않는다. 브라우저에서 완료한 뒤 에이전트는 기존 조회 도구로 결과를 확인한다.

## 3. 순수 함수로 분리 가능한 부분 (`/tdd` 대상)

| 함수 | 위치(안) | 무엇을 고정하나 |
|---|---|---|
| `generateApiToken` · `hashApiToken` · `parseBearer` | `lib/mcp/token.ts` | 접두·길이·base64url, `Bearer` 파싱(대소문자·공백·빈 값) |
| `planApiTokenUse({ row, now })` | `lib/mcp/token.ts` | 없음·만료·폐기 → 한 갈래, 경계 시각 |
| `shouldTouch(lastUsedAt, now)` | `lib/mcp/token.ts` | 1분 스로틀 |
| `planApiTokenIssue({ activeCount, name, expiresIn, grants, scope, memberProjectIds })` | `lib/mcp/issue-plan.ts` | 이름 1–60자 · 사용자당 활성 **10개** · 만료 선택지 · grant 어휘 밖 거부 · 새 범위는 현재 멤버십의 비보관 프로젝트만 허용 |
| `planApiTokenUpdate({ currentScope, addedProjectIds, removedProjectIds, memberProjectIds, name, grants })` | `lib/mcp/issue-plan.ts` | 추가 범위만 현재 멤버십·비보관 여부 검증. 기존 범위는 명시적 제거 외 보존. 이름/grant 수정에 발급 한도·만료 선택을 다시 요구하지 않음 |
| `planToolAccess({ role, grants, scope, projectId, rolePermission, tokenGrant })` | `lib/mcp/grant.ts` | §1.25의 네 갈래와 **판정 순서**. 역할 × 토큰 × 범위 매트릭스 |
| `publishFingerprint(input)` | `lib/publish/fingerprint.ts` | §3.1의 전체 export 입력을 결정적으로 직렬화한다. 같은 입력은 같은 지문, 번역·전달 토큰·키/로케일·표면 설정·리포/브랜치·base head 변경은 다른 지문. 표시 상한을 적용하지 않는다 |
| `planBatchSave(entries)` · 키 시작 예산 판정 | `lib/mcp/batch.ts` | 100개 상한 · 중복 키 거부 · 주입한 시각으로 55초 기한/41초 시작 예산 판정 · 입력 순서 결과(`saved`/거부/실패/`unconfirmed`/`notAttempted`) |
| `toToolResult(result)` | `lib/mcp/result.ts` | union → `{ isError, structuredContent, content }`, `unavailable`만 `retryable` |
| 도구 입력 스키마(zod) | `lib/mcp/tools/*.ts` | 기존 Action 스키마를 **재사용**한다(`KeySaveInput` 등) — 복제하면 한쪽만 좁아진다 |
| `toolCatalog()` | `lib/mcp/catalog.ts` | 도구 이름·순서(결정적 — 스펙 minor 3)·annotations. 스냅샷 테스트 |
| `checkOrigin(headers)` | `lib/mcp/http.ts` | `Origin` 있으면 거부 |

**껍데기**: `app/api/mcp/route.ts`(인증·크기·디스패치) · `lib/mcp/tools/*`(인가 + 코어 호출 + `revalidatePath`) · `lib/mcp/token-store.ts`.

**코어 추출 대응표** (2026-09-28 검수 3 반영). 아래 `projects/actions.ts`는 `app/(edit)/projects/actions.ts`,
`settings/actions.ts`·`sources/actions.ts`는 그 아래 `[slug]/`의 파일이다. 새 경로는 추출 위치 안이며 기존 파일이라는 뜻이 아니다.

| 도구 | 현재 진입점/코어 | 추출·재사용 범위 |
|---|---|---|
| `list_repositories` | `projects/actions.ts`의 `listConnectableRepos` | `lib/onboarding/*-run.ts`로 사용자별 설치·리포 조회 조립 추출 |
| `list_branches` | 같은 파일의 `listRepoBranches`·`listProjectBranches` | 신규/기존 프로젝트의 인가·브랜치 조회 조립 추출 |
| `detect_formats` | 같은 파일의 `detectRepoFormats`·private `checkRepoAccess` | 탐지와 리포 접근 확인 추출. 기존 프로젝트용 분기는 §2.1 계약 적용 |
| `create_project` | 같은 파일의 `createProject` | 생성·첫 적재·사건·push 토큰·YAML 조립 추출. User 잠금과 한도 검사 유지 |
| `add_sources` | 같은 파일의 `addSurfaces` → `lib/surfaces/create.ts`의 `addSurfacesFromSnapshot` | 리포 확인·다운로드·포맷 재검증·결과 조립 추출. 표면 생성 tx는 기존 코어 재사용 |
| `rotate_push_token` | 같은 파일의 `rotatePushToken` | `lib/projects/*-run.ts`로 리포 쓰기 권한 확인·토큰 교체 tx·사건 추출 |
| `archive_project`·`unarchive_project` | 같은 파일의 `archiveProject`·`unarchiveProject` | `lib/projects/*-run.ts`로 보관 전환 tx·사건 추출 |
| `invite_members` | 같은 파일의 `createInvitations` → `issueInvitations`·`sendInvitationEmails` | `lib/invitation-email/`에 수신자 검증·발급·메일 발송·결과 조립 추출. 기존 발급/발송 코어 재사용 |
| `revoke_invitation`·`change_member` | 같은 파일의 `revokeInvitation`·`changeMember` | `lib/auth/*-run.ts`로 tx·사건 추출. 마지막 OWNER·멤버 한도·자기 변경 판정 유지 |
| `update_project` | `settings/actions.ts`의 `updateProjectName`·`updateRepositorySettings` | `lib/settings/*-run.ts`로 이름·base branch 변경 조립 추출. 브랜치 검증·전달 확인 무효화 유지 |
| `set_base_locale` | `sources/actions.ts`의 `updateBaseLocale` | `lib/sources/*-run.ts`로 기준 로케일 선언 tx·사건 추출 |
| `set_translations`·`get_key`·`list_keys` | `app/(edit)/actions.ts` 및 기존 `lib/keys/`·목록 조회 코어 | 저장/조회 코어 재사용. Action이 가진 입력 검증·readiness 등 선행 조건도 공유 경계로 옮김 |
| `publish`·`preview_publish` | `app/(edit)/actions.ts`의 `triggerPullAction`, `app/(edit)/publish-actions.ts`, `lib/sync/run.ts`·`lib/publish/read.ts` | readiness·거부 결과/사건 조립을 공유하고 §3.1의 입력 캡처 경계 적용 |
| `sync_repository`·`preview_sync` | `projects/actions.ts`의 `runRepositoryImport`·`prepareRepositorySync`, `lib/import/run.ts`·`approval.ts` | 리포 접근·실행 준비 조립 추출, 기존 실행/폐기 지문 코어 재사용 |
| `revert_to_last_sent`·`preview_revert` | `app/(edit)/actions.ts`, `lib/keys/revert.ts` | 기존 코어 재사용, Action의 선행 인가·readiness 유지 |
| `list_projects`·`get_project`·`list_events`·`list_members`·`get_workflow` | 목록/Home/멤버 페이지의 조회 조립, `lib/keys/query.ts`·`lib/events/query.ts`·`lib/auth/query.ts`·`lib/onboarding/workflow.ts` | 기존 조회·집계·마스킹·YAML 함수를 재사용하고 페이지 안 조립만 해당 `lib/`로 추출 |
| `whoami` | 신규 | 사용자/토큰에 한정한 얇은 조회. 기존 코어 추출 대상 없음 |

**추출 경계**: Action은 세션 해석·웹 응답/리다이렉트·캐시 무효화를, 도구는 Bearer 주체·MCP 응답·동일 경로의 캐시 무효화를 든다.
공유 코어는 명시적 서버 주체와 검증된 입력을 받아 인가·readiness·잠금·변경/사건 tx·외부 I/O 결과 판정을 수행한다.
기존 입력 스키마·결과 타입은 세션/Next 의존성이 없는 공유 모듈로 옮긴다. `readSession` 다음 줄을 통째로 옮겨
`cookies`·`redirect`·`revalidatePath`를 코어에 끌어오지 않는다. 커밋 후 캐시 실패를 저장 실패로 바꾸지 않는 기존 처리도 유지한다.
추출 후 Action/도구는 같은 코어를 호출하며, 도구에서 Action을 import하거나 인가·사건 쓰기를 복제하지 않는다.
`app/__tests__/locked-access.test.ts`의 `SITES` 등 파일/함수 위치를 고정한 검사는 추출된 tx 소유 함수로 갱신한다.

### 3.1 Publish 확인과 실행 입력 (2026-09-28 검수 1 반영)

**도구 입구에서 지문만 비교한 뒤 기존 실행기를 부르는 것으로는 부족하다.** 현재 `readPublishPreview`는 표시할 셀과
파일 렌더용 DB 상태를 따로 읽고, `runSync` → `triggerPull` → `runPull`은 DB와 base head를 다시 읽는다.
MCP Publish에서는 이 재조회 사이에 다른 편집이 섞이지 않도록 입력 캡처와 실행 경계를 바꾼다.

- **입력 한 벌**: 프로젝트/리포 식별자·base/sync 브랜치, 활성 표면의 포맷·경로·기준 로케일·로케일 집합,
  export에 쓰는 키·번역 값·orphan 상태·미전달 토큰을 한 DB 스냅샷에서 읽는다. base head SHA를 한 번 정하고,
  원본 트리·blob은 그 SHA에 고정한다. 지문에는 이 입력 전체를 넣는다 — 200행 표시 상한이나 미전달 셀 필터로 줄이지 않는다.
  미전달 토큰이 없어도 orphan 제거·재전송 등으로 파일이 바뀔 수 있기 때문이다.
- **미리보기**: 셀 표시·변경 파일 목록·지문이 위 입력 한 벌을 공유한다. 표시 상한은 응답에만 적용한다.
  입력을 캡처한 뒤 발생한 편집을 일부 조회에만 섞지 않는다. 핸들은 상태 digest이며 DB 스냅샷을 서버에 영속 저장하지 않는다.
- **실행**: 기존 실행권·인가 게이트를 통과한 뒤 실행용 입력을 캡처하고 그 입력의 지문을 핸들과 비교한다.
  불일치하면 GitHub 쓰기 전에 `reconfirm`으로 끝낸다. 일치한 입력을 `triggerPull`/`runPull`의 렌더·전달 확인까지
  넘기며, 그 뒤 DB나 branch ref를 다시 읽어 렌더 입력을 교체하지 않는다. base 변경을 감지했을 때 새 head로
  자동 재렌더·재시도하지 않고 재확인을 요구한다. 이 거부에서도 실행권은 기존 종료 경로로 정리한다.
- **캡처 뒤 편집**: 이번 실행은 확인된 입력만 보낸다. 전달 확인은 캡처한 편집 토큰을 기존 CAS로 대조하므로
  이후 새 편집의 미전달 토큰을 지우지 않는다. GitHub I/O 동안 DB 잠금을 유지하지 않는다.
- **기존 경로**: 웹 Publish·cron의 확인 절차는 바꾸지 않는다. 공유 입력 캡처/렌더를 재사용하되 MCP의 핸들 대조만
  추가한다. 어댑터의 값 선택·결정성·blob SHA 비교·커밋 규칙은 그대로 유지한다.

검증은 지문 함수만으로 끝내지 않는다. 미리보기 조회 도중 저장, 실행 입력 대조 뒤 저장, base head 변경,
표시 상한 밖 편집, 미전달 토큰 없는 export 입력 변경을 끼워 넣어 **응답의 지문과 실제 커밋 내용**을 대조한다.
실행 입력 캡처 전에 달라진 경우는 `reconfirm`과 GitHub 쓰기 0회, 캡처 뒤 편집은 전송 제외와 미전달 보존을 확인한다.

## 4. 스키마 변경 — additive

```prisma
model ApiToken {
  id         String    @id @default(cuid())
  userId     String
  name       String                 // 사용자가 붙인 이름(1–60)
  grants     String[]               // TokenGrant — 앱 층 어휘(enum 아님, SyncRun.errorCode와 같은 근거). 빈 배열 = 읽기 전용
  allProjects Boolean               // true면 내 멤버십 전부(이후 초대받은 프로젝트 포함), false면 ApiTokenProject만
  tokenHash  String    @unique      // sha256 hex
  prefix     String                 // 원문 앞 8자 — 목록에서 알아보는 용도
  createdAt  DateTime  @default(now())
  lastUsedAt DateTime?
  expiresAt  DateTime               // 필수 — 만료 없는 토큰은 만들 수 없다
  user       User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  projects   ApiTokenProject[]
  @@index([userId])
}

model ApiTokenProject {
  tokenId   String
  projectId String
  token     ApiToken @relation(fields: [tokenId], references: [id], onDelete: Cascade)
  project   Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  @@id([tokenId, projectId])
  @@index([projectId])
}
```

- 범위 행이 남은 채 멤버에서 빠져도 새는 것이 없다 — 판정이 멤버십을 먼저 본다. 다시 초대받으면 그 범위가 되살아나는데, 그게 맞다
  (토큰 주인이 고른 범위다).

- **범위 편집은 추가·유지·제거를 구분한다** (2026-09-28 검수 8 반영). 발급과 새 범위 추가는 현재 멤버십의 비보관 프로젝트만
  허용한다. 기존 `ApiTokenProject`는 탈퇴·보관 여부와 관계없이 유지하며 사용자가 명시적으로 제거한 행만 지운다.
  이름·grant만 바꾸면 범위 행은 건드리지 않는다. 현재 멤버십 목록과 교집합을 취해 전체 범위를 교체하지 않는다.
  서버는 사용자 소유 토큰의 현재 범위를 잠금 뒤 읽어 추가/제거를 적용한다. 클라이언트가 보낸 “기존 범위”를 신뢰하지 않는다.
  범위 보존은 프로젝트 접근을 부여하지 않으며 매 호출의 멤버십·보관 판정은 그대로다. 명시적으로 제거한 범위는 재초대돼도 복구하지 않는다.

- 폐기 = **행 삭제**(자격증명이다. 사건 보존 원칙은 `ProjectEvent`의 것이다).
- **`ProjectEvent`는 바뀌지 않는다** (✅ 2026-09-28 사용자). 에이전트가 한 일은 그 사용자가 한 일이다 — 경유 컬럼·Logs 표시 없음.
  탈취 대응은 사건이 아니라 토큰 쪽이 든다(만료 필수 · `lastUsedAt` · 권한 축소 · Revoke).
- ⚠️ 마이그레이션 뒤 dev·prod `has_schema_privilege` 확인(CLAUDE.md Supabase 절) · `lib/privacy/collected.ts` 등재(안 하면 typecheck red) ·
  `/privacy` 본문 개정 이력.

### 4.1 배포와 preview 실물 검증 (2026-09-28 검수 12 반영)

순서는 **dev DB 확장 → `/push` → preview 실물 검증 → `/merge` 전 prod DB 확장·상태/권한 확인 → 앱 배포**다.
additive 변경이라 기존 프로덕션 앱과 공존할 수 있어야 한다. dev와 prod를 같은 명령으로 적용하지 않는다.
Codex는 커밋까지 맡고 원격 `/push`·`/merge`는 Claude Code가 수행한다.

`dev.mal-moi.com`은 Vercel SSO 보호 뒤다. 앱의 Bearer만 보내면 보호층의 302에서 멈출 수 있다.
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

- **1–4(엔진)** — strict push·병합 없음·어댑터 결정성·blob SHA 비교는 유지한다. Publish는 §3.1에 따라
  캡처한 입력을 실행기에 전달하도록 경계를 변경한다. 웹·cron의 기존 동작과 전달 확인 CAS를 회귀 검증한다.
- **5(projectId 좁히기)** — 모든 도구가 `slug` → `getProjectAccess`가 돌려준 `projectId`를 쓴다. 사용자 축 조회(`ApiToken`·`Account`)는
  **토큰이 준 `userId`로** 좁힌다(POSTMORTEM 2026-09-06). 도구 인자에 `projectId`·`userId`를 받지 않는다 — 스키마가 그 필드를 모른다.
- **6(자격증명 분리)** — §1.3. 넷째 GitHub 자격증명이 아니다.
- **7(ProjectMember가 권한)** — 토큰에 역할을 넣지 않는다. 매 호출 DB 조회.
- **9(버린 값을 숨기지 않는다)** — Publish·Sync 결과의 `withheld`·`skipped`·`unconfirmed`를 도구 결과에 그대로 싣는다. 응답 유실
  (에이전트 쪽 타임아웃)은 스펙상 요청이 사라지고 재발행되므로 **Publish 재호출은 서버 게이트(`already-running`·`too-soon`)가 막는다.**
- **10(쓰기 경로는 서버가)** — `create_project`·`add_sources`의 `adapter`·`pathTemplate`은 여전히 `planConfirmedFormat` 재검증 +
  샘플 확인값을 지난다. `requirePush: true` 필수(POSTMORTEM 2026-09-27).
- **인증 경계(§6)** — 새 진입점이 하나 는다. `app/__tests__/entry-points.test.ts`에 route를 넣고 가드는 **호출 형**으로 센다
  (POSTMORTEM 2026-09-18 — 이름이 아니라 `resolveApiToken(` 호출). `/api/*`는 middleware matcher 밖이라 CSP·로그인 리다이렉트가 안
  걸린다 — 그게 맞다(JSON 진입점).
- **`maxDuration`** — route 세그먼트에 `export const maxDuration = 60`. Server Action 세그먼트 규칙(§3.1)과 별개다.
- **보관 정책** — `list_events`만 읽기 예외를 넘기고 나머지는 기본 거부(PRODUCT §3).

## 7. POSTMORTEM 인용

- **2026-09-06 인가는 지났는데 사용자로 안 좁혔다** → 토큰이 준 `userId` 외의 주체를 쓰지 않는다. 테스트 시드에 사용자 둘·토큰 둘.
- **2026-09-16 `Promise.all` 토큰 회전 경합** → 에이전트 병렬 호출이 같은 모양. §1.3.
- **2026-09-18 가드를 이름으로 셌다** → entry-points 검사에 `/api/mcp` 추가 + 가드 호출 삭제 뮤테이션을 한 번 건다.
- **2026-09-27 토큰 수령자가 리포에 쓸 수 있나** → `create_project`·`add_sources`·`rotate_push_token`은 `requirePush: true`.
- **2026-09-04 `.env.local` 유출** → 개발자 설명서(가이드)의 연결 예시는 토큰을 **환경변수로** 넘기게 쓴다(`--header "Authorization: Bearer $MALMOI_TOKEN"`) — 설정 파일에 원문을 박지 않게.

## 8. 화면

**전용 페이지 `/mcp` — `MCP connector`** (2026-09-28 사용자 — PRODUCT §4.3 ⑤ "전용 라우트를 만들지 않는다"를 뒤집는다).

- **자리**: 사용자 축(`Your work`). 사이드바 사용자 구역 `Projects` · `New project` 바로 아래. 인가는 `requireUser`, `isProtectedPath`에
  `/mcp` 추가. 제목과 사이드바 라벨이 **같은 키**(`m.common.nav.mcp` — DESIGN "메뉴명 = 페이지 제목"). PRODUCT §7.7 IA 트리 갱신.
- **구성** (위→아래):
  1. **연결** — 서버 URL(`https://mal-moi.com/api/mcp`, 환경별 origin) 복사 + 클라이언트 탭 셋(Claude Code · Codex · Cursor)의 설정
     조각. 토큰은 **환경변수 참조로만** 쓰인다(`$MALMOI_TOKEN`) — 조각에 원문을 박지 않는다(POSTMORTEM 2026-09-04와 같은 축).
  2. **토큰 목록** — 행: 이름 · `mlm_abcd…` · 허용 동작 배지 · 범위(`All projects` / `3 projects`) · Created · Last used · Expires (UTC).
     행 메뉴: [Edit permissions] · [Revoke]. 빈 상태는 "무엇을 시킬 수 있나" 한 문단 + [Create token].
  3. **무엇을 시킬 수 있나** — 도구 묶음 다섯(Projects · Translations · Publish & sync · Settings · Members)과 각 묶음이 요구하는
     허용 동작. `toolCatalog()`에서 그린다 — 손으로 쓴 목록은 낡는다.
- **발급 Dialog**: 이름 · 만료(**필수** — 30 / 90 / 365일, 기본 90. "없음"은 없다 ✅ 2026-09-28 사용자: 탈취 대비) · 허용 동작 체크 넷 · 범위(All / 프로젝트 다중 선택 — 내 멤버십
  목록, 보관 제외) → 원문 1회 + 복사 + "이 창을 닫으면 다시 볼 수 없다". **역할 경고**: 고른 프로젝트 중 EDITOR인 곳이 있고
  `Project settings`·`Members`를 체크했으면 "EDITOR인 프로젝트에서는 효과가 없다" 한 줄(막지는 않는다 — 나중에 승격될 수 있다).
- **Edit permissions Dialog**: 발급과 같은 필드에서 이름·동작·범위만(만료·원문은 못 바꾼다). 저장은 다음 호출부터.
  기존의 보관/접근 불가 범위도 별도 행으로 표시하고 유지 또는 명시적 제거를 고르게 한다. 프로젝트 신규 선택 목록에서는 제외한다.
  탈퇴한 프로젝트의 현재 이름·slug를 새로 조회해 노출하지 않는다. 사용자 소유 범위 행의 안정된 식별 표시와 `Unavailable project`
  라벨로 행과 제거 컨트롤을 구별한다. 토큰 이름만 수정할 때 숨겨진 범위가 사라지거나 저장이 거부되지 않아야 한다.
- **Revoke**: 확인 Dialog → 행 삭제. 되돌릴 수 없음을 말한다.
- **진행·실패·결과 미확인** (2026-09-28 검수 9 반영): 발급·수정·폐기 중 중복 제출을 막고 진행 상태를 표시한다.
  서버의 명시적 거부는 입력을 유지한 채 해당 폼/행에서 설명한다. 세션 만료는 다시 로그인하도록 안내한다.
  응답 유실·연결 예외는 “실패해서 아무것도 바뀌지 않음”으로 단정하지 않고 결과 미확인으로 표시하며 자동 재시도하지 않는다.
  발급 결과 미확인은 목록을 다시 읽어 이름·생성 시각·prefix로 새 토큰을 확인하고, 원문을 받지 못한 토큰을 폐기한 뒤 재발급한다.
  수정/폐기 결과 미확인도 목록의 서버 상태를 확인한 뒤 다음 조작을 허용한다. 목록 조회 자체가 실패하면 기존 표시를 성공으로
  갱신하지 않고 재조회 동작을 제공한다. 원문은 재조회로 복구할 수 없다는 점을 설명한다.
- **복사 실패**: 기존 `CopyButton`의 실패 라벨을 사용하고 원문 표시를 유지한다. 원문 전체를 선택해 수동 복사할 수 있어야 한다.
  복사 성공만으로 원문 Dialog를 자동으로 닫지 않는다. 닫은 뒤에는 기존의 원문 1회 표시 계약을 따른다.
- **포커스**: Revoke 성공 후 토큰이 남아 있으면 토큰 목록 제목으로, 마지막 토큰을 지웠으면 Create token으로 착지한다.
  Dialog 취소는 호출한 컨트롤로 돌아가고, 거부/결과 미확인은 남아 있는 폼 또는 행의 복구 컨트롤에서 이어진다.
  진행 중 트리거는 기존 `busy` 패턴을 따라 포커스를 잃지 않게 한다. 폐기 완료는 행/빈 상태 전환에도 남는 `role="status"`로 알린다.
- **새 페이지라 `/design-sync` 대상이다** — Claude Design 핸드오프(정적 시안, 상태별 프레임: 빈 · 목록 · 발급 · 원문 표시 · 편집 ·
  Revoke 확인 · 진행 · 거부 · 결과 미확인 · 복사 실패)를 받아 구현한다. 시안 링크는 받는 즉시 이 문서에 붙인다.
- 가이드 `/docs`에 **Connect an AI agent** 페이지 하나(`/guide`) — 설정·예시 프롬프트("이 리포를 Malmoi에 연결해 줘", "비어 있는 fr
  번역을 채우고 Publish해 줘")·권한 설명. 페이지와 가이드가 같은 사실을 말하되 정본은 가이드다.
