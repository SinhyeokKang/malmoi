# mcp-connector — tasks

순서: 문서 판정 → SDK 실측 → 순수 함수 → 스키마 → 코어 추출 → 진입점 → 도구 → 페이지 → 가이드·실물.
커밋 경계는 `──`로 표시한다.

## T0. 정본 판정 갱신 (문서, `/implement` 첫 커밋)

- PRODUCT §4.3 ⑤ → "열었다"로 바꾸고 결론을 §4.1로 올린다: 전용 페이지(뒤집는 근거 — 사용자 구색 판단) · 사용자 단위 토큰 ·
  도구 목록/쓰기 범위의 정본은 ARCHITECTURE 새 절(§6.45 안) · "역할 ∩ 토큰, 좁히기만".
- PRODUCT §4.2 "세밀한 RBAC" 옆에 한 줄: 토큰 권한은 역할의 부분집합이라 이 비범위가 아니다 — 역할·`Permission`을 늘리는 순간 든다.
- PRODUCT §4.2 "AI 번역" 옆에 한 줄: Malmoi는 LLM을 부르지 않는다, 외부 에이전트의 저장은 편집자 저장이다(2026-09-28 사용자 확정).
- PRODUCT §7.7 IA 트리에 `/mcp`.
- 같은 IA 절의 별도 “MCP 토큰 화면은 라우트로 만들지 않는다” 문단도 전용 페이지 결정으로 갱신한다(검수 14).
  §4.3만 고쳐 정본 안에 반대 판정이 남지 않게 한다.
- 검증: `pnpm test`(문서 인용 테스트가 있으면 green) · 눈으로 §4.3 번호 연속성.

── `docs(PRODUCT): open the MCP connector (§4.3 ⑤)`

## T1. SDK 실측 (`.scratch/`, 커밋 없음)

- `@modelcontextprotocol/server` 2.1.0을 `.scratch/`에 깔고 Next route 하나로: (a) 2026-07-28 `server/discover` + `_meta` 요청,
  (b) 2025-11-25 `initialize` 요청을 **세션 id 없이** 둘 다 받는지. JSON 응답 모드. Claude Code·Codex로 실제 `tools/list`.
- 결과로 design §1.1의 "받는 쪽 호환" 문장을 확정한다. 한쪽만 되면 2025-11-25 stateless를 먼저 세운다.
- ⚠️ `pnpm-workspace.yaml`의 `minimumReleaseAge`·`onlyBuiltDependencies`를 확인한다(스크립트 없는 패키지를 화이트리스트에 넣지 않는다).
- 검증: 두 클라이언트의 `tools/list` 출력 캡처.

## T2. 순수 함수 (`/tdd interface` → `/implement`)

- `lib/mcp/token.ts` — `generateApiToken` · `hashApiToken` · `parseBearer` · `planApiTokenUse` · `shouldTouch`
- `lib/mcp/grant.ts` — `planToolAccess`(판정 순서 · 역할 × 토큰 × 범위 매트릭스 · 보관 · 역할 조건과 token grant 조건 분리)
- `lib/mcp/issue-plan.ts` — 발급: `planApiTokenIssue`(새 범위 ⊆ 현재 멤버십의 비보관 프로젝트 · 활성 10개 · grant 어휘 · 만료 필수 30/90/365).
  수정: `planApiTokenUpdate`(기존 범위 보존 · 추가 범위만 멤버십/보관 검증 · 명시적 제거). 이름/grant 수정에는 발급 한도와 만료 선택을 다시 요구하지 않는다.
- 검증: 탈퇴·보관된 기존 범위가 있어도 이름/grant 수정 성공과 범위 보존, 접근 불가 범위 명시적 제거,
  남의 프로젝트를 신규 범위로 추가하면 거부, 제거 뒤 재초대돼도 범위가 되살아나지 않는 것을 고정한다.
- `lib/publish/fingerprint.ts` — `publishFingerprint`(design §3.1의 전체 export 입력, 표시 상한 미적용).
  입력 순서가 달라도 같은 지문이고, 번역·편집 토큰·키/로케일·표면 설정·리포/브랜치·base head가 바뀌면 달라지는 테스트를 먼저 쓴다.
- `lib/mcp/batch.ts` — `planBatchSave`와 키 시작 예산 판정(100개 · 중복 키 · 입력 순서 결과 · 미시작만 `notAttempted`).
  주입한 시각으로 55초 작업 기한과 41초 시작 예산의 경계 테스트를 먼저 쓴다(기존 maxWait 10초 + timeout 30초 + 완료 여유 1초).
- `lib/mcp/result.ts` — `toToolResult`(거부 코드 → `messages/en.tsx` 문장 · `unavailable`만 retryable · 예외 문구 미포함)
- `lib/mcp/catalog.ts` — `toolCatalog`(이름·순서·annotations·필요 grant 스냅샷)
- `lib/mcp/http.ts` — `checkOrigin`
- MCP 생성/추가 입력에 후보별 `confirmation`을 필수로 둔다. 기존 HMAC 함수와 포맷 대조를 재사용하는 검증부터 작성한다:
  누락·변조·TTL 경계/초과·미래 시각·사용자/리포/설치/ref/head 불일치·adapter/pathTemplate/baseLocale 불일치.
- 검증: `pnpm test` green. `grant.test.ts`에 **사용자 둘 · 토큰 둘** 시드(POSTMORTEM 2026-09-06).

── `feat(mcp): pure token, grant and result planners`

## T3. 스키마 (`/db`)

- `ApiToken` · `ApiTokenProject` — additive(`ProjectEvent`는 안 바뀐다). `--create-only`로 SQL을 보고 dev 적용.
- `lib/privacy/collected.ts` 등재 · `schema-contract.test.ts` 갱신.
- 검증: `pnpm db:status` 깨끗 · dev `has_schema_privilege(... 'USAGE')`가 `false` · `pnpm typecheck` green.
- **배포 순서** (검수 12): dev DB additive 적용 → 로컬 게이트 → `/push`로 preview 배포 → T9 실물 확인 →
  `/merge` 전에 `pnpm db:deploy`로 prod additive 적용 → `pnpm db:status:prod` 및 prod `has_schema_privilege` 확인 → `/merge`로 앱 배포.
  prod 적용을 `/push` 앞으로 당기지 않는다. Codex는 문서/코드·커밋까지이며 `/push`·`/merge`는 Claude Code에서 수행한다.

── `feat(db): add api tokens and their project scope`

## T4. 코어 추출 (동작 불변 리팩터)

- design §3의 코어 추출 대응표를 기준으로 도구 전부를 기존 진입점과 연결한다. 온보딩뿐 아니라 두 브랜치 조회·
  push 토큰 회전·보관/복원·초대 발급/메일 발송·초대 무효·멤버 변경·이름/base branch·기준 로케일 코어를 추출한다.
- 저장·Publish·Sync·Revert는 기존 코어를 재사용하되 Action에 남은 인가·readiness·리포 확인·거부 결과/사건 조립도 공유한다.
  목록/Home/멤버 페이지 안 조회 조립은 기존 조회·마스킹 함수를 재사용하도록 추출한다.
- 세션 해석·리다이렉트·캐시 무효화는 껍데기에 남긴다. 공유 코어에는 명시적 주체를 전달하고 입력 스키마·결과 타입은
  Next/세션에 의존하지 않는 모듈로 이동한다. 사건은 기존 변경 tx 안에 두고, 커밋 후 캐시 실패 처리도 보존한다.
- `createProject` 코어는 design §1.25의 서버 주체로 MCP 호출을 구분하고, 잠금 뒤 읽은 토큰이 선택 범위일 때만
  **같은 tx**에서 `ApiTokenProject`를 쓴다. 별도 클라이언트 `tokenId`나 신뢰되지 않은 범위 추가 플래그를 받지 않는다.
- 회귀 검증: 역할·보관·readiness 거부, 마지막 OWNER 보호, 초대 발급 후 메일 실패, 브랜치 변경 시 전달 확인 무효화,
  토큰 회전의 리포 쓰기 권한, 각 변경과 사건의 원자성을 기존 Action과 추출 코어에서 확인한다.
  `locked-access.test.ts`의 `SITES`와 기존 소스 스캔의 경로를 실제 tx 소유 함수로 갱신하고 가드를 약화하지 않는다.
- 검증: 기존 `pnpm test` 전부 green(회귀 방어) · `pnpm test:projects:postgres` green · `client-graph.test.ts` green.

── `refactor(actions): share user-scoped cores with MCP tools`

## T5. 토큰 저장소 + 진입점

- `lib/mcp/token-store.ts` — `resolveApiToken(prisma, bearer, now)` → `{ userId, tokenId, grants, scope } | null`, `lastUsedAt` 스로틀 쓰기.
- `app/api/mcp/route.ts` — POST만 · `checkOrigin` → 인증 → `readBoundedText(1 MiB)` → SDK 디스패치 · `maxDuration = 60` · 쿠키 미사용.
- route 진입 시 단조 시계 시작 시각을 캡처해 배치에 전달한다. 인증·본문 처리 시간을 포함하고, 마지막 5초는 응답 여유로 남긴다.
- `app/__tests__/entry-points.test.ts`에 route 등록(가드 = `resolveApiToken(` 호출). **가드 호출을 지우는 뮤테이션을 한 번 걸어 red 확인**.
- 소스 스캔: route·`lib/mcp/**`가 `auth(`·`readSession(`·`cookies(`를 부르지 않는다. `credential-separation.test.ts` 대상에 추가.
- 검증: `pnpm test` green · 로컬 `curl`로 401 네 갈래가 같은 본문 · 쿠키만 실은 요청 401 · 초과 본문 400.

── `feat(mcp): authenticated stateless entry point`

## T6. 도구 — 읽기

- `whoami` · `list_projects` · `get_project` · `list_keys` · `get_key` · `list_events` · `list_members` · `get_workflow` ·
  `list_repositories` · `list_branches` · `detect_formats` · `preview_publish` · `preview_sync` · `preview_revert`.
- 각 도구 = `planToolAccess` → 기존 인가(`getProjectAccess`/`getSurfaceAccess`) → 코어 → `toToolResult`. 인자에 `projectId`·`userId` 없음.
- design §2.1의 역할 조건/token grant 조건을 카탈로그와 판정에 각각 등록한다. 기존 인가 함수에 넘기는 permission을
  토큰의 필수 grant로 자동 복제하지 않는다.
- 검증: OWNER/EDITOR × 빈 grants로 `list_keys`·`preview_publish` 성공, OWNER만 `preview_sync`·`preview_revert`·
  `get_workflow` 성공, EDITOR는 `forbidden`을 고정한다. 빈 grants의 리포/신규 브랜치 조회·신규 탐지는 `token-scope`,
  기존 브랜치 조회·탐지는 OWNER `token-scope` / EDITOR `forbidden`이다. 범위 밖은 모든 프로젝트 조회에서 `not-found`이며,
  읽기 전용 토큰이 받은 미리보기 핸들로 쓰기를 실행할 수 없는지도 검증한다.
- `detect_formats`는 신규 `{ owner, repo, ref? }`와 기존 `{ slug }` 입력을 구별한다. 기존 경로는 범위·OWNER·
  `project:settings` 및 GitHub 쓰기 권한을 확인하고 저장된 리포·base branch만 탐지한다. 두 입력의 혼합과 거부 후 경로 폴백은 허용하지 않는다.
- 검증: 기존 프로젝트 하나에 `Project settings`만 허용한 토큰의 탐지 성공과 `project:create` 불필요를 고정한다.
  범위 밖 `not-found`·EDITOR `forbidden`·grant 없음 `token-scope`·리포 읽기 전용 거부·리포/ref 덮어쓰기 입력 거부를 검증한다.
- 후보 없음은 `needs-browser`·`reason: "no-candidates"`로 변환한다. 신규는 `/projects/new`, 기존은 인가된
  `routes.sources(slug)`로 안내하며 기존 화면의 수동 설정을 사용한다. MCP 수동 포맷 확정 도구는 만들지 않는다.
- 검증: 신규/기존 후보 없음의 URL과 사유, URL에 비밀값이 없는 것을 확인한다. 권한 거부·GitHub 장애·예산 초과는
  `no-candidates`로 접히지 않아야 한다. 수동 확인에서는 두 링크에서 기존 수동 설정을 거쳐 생성/추가까지 도달하는지 본다.
- 동시 호출 테스트: 같은 사용자의 만료 user-to-server 토큰으로 `list_repositories` + `list_branches` 병렬 → 둘 다 성공(POSTMORTEM 2026-09-16).
- `preview_publish`: `lib/publish/read.ts`의 셀 조회·변경 파일 렌더·지문이 동일한 DB 스냅샷과 고정 base head를 공유하게 한다(design §3.1).
  표시 상한은 응답에만 적용한다. 미리보기 도중 저장을 끼워 넣어 셀·파일·지문이 서로 다른 상태를 보지 않는지 검증한다.
- 검증: `pnpm test` green · 로컬에서 Claude Code로 각 도구 1회.

── `feat(mcp): read tools`

## T7. 도구 — 쓰기

- `set_translations` · `publish`(지문 대조) · `sync_repository` · `revert_to_last_sent` · `update_project` · `set_base_locale` ·
  `rotate_push_token` · `invite_members` · `revoke_invitation` · `change_member` · `archive_project` · `unarchive_project` ·
  `create_project` · `add_sources`.
- `set_translations`: 키마다 남은 작업 예산을 확인하고 41초 미만이면 후속 키를 시작하지 않는다. 시작한 tx는 종료를 기다려
  저장·거부·롤백 확인 실패·결과 미확인을 구별한다. 시간 초과/결과 미확인 뒤에는 중단하고 나머지만 `notAttempted`로 반환한다.
  응답만 먼저 끝내고 저장을 계속하는 방식은 쓰지 않는다. 웹 저장의 timeout은 유지한다.
- 검증: 인증 지연·41초 시작 경계·요청 50초 시점의 추가 저장 차단·100키 혼합 결과를 주입한 시계로 검증한다.
  PG에서 성공 키는 저장과 사건이 남고, 거부/롤백/미시도 키는 둘 다 불변인지 대조한다. 결과 미확인을 미시도로 오기하지 않는지도 검증한다.
- 검증: 위 설정 전용 토큰으로 T6의 `detect_formats({ slug })` 결과를 받아 `add_sources`까지 완료한다.
  토큰 범위 밖 프로젝트로 소스를 추가할 수 없고, 신규 프로젝트 생성 권한도 생기지 않는지 함께 확인한다.
- `create_project`·`add_sources`의 HMAC 소비는 신규 동작이다(design §2.2). 후보 전부를 인가된 리포 스냅샷과 대조하고,
  같은 head의 파일을 기존 포맷 재검증·첫 적재 코어에 전달한다. 기존 웹 Action에는 확인값을 필수로 추가하지 않는다.
- 검증: 만료/대상 불일치 시 `sample-expired`와 재탐지 안내, 포맷 불일치 시 `manual-no-match`, 여러 후보 중 하나 실패 시
  Project·Surface·번역·사건·토큰 범위 쓰기 0회를 확인한다. 검증 뒤 ref 변경을 끼워 넣어 다른 head를 적재하지 않는지,
  기존 웹 생성·소스 추가가 확인값 없이도 기존 검증을 거쳐 동작하는지 회귀 검증한다.
- design §1.25의 쓰기 주체를 모든 쓰기 코어까지 전달한다. `lockProjectAccess` 경로뿐 아니라 import·Revert·소스 추가의
  직접 잠금 경로와 생성 코어의 User 잠금 경로도 토큰 유효성·grant·범위를 재판정한다. Action과 같은 `revalidatePath`.
  토큰 부모 행의 공유/배타 잠금으로 재판정과 권한·범위 수정/폐기를 직렬화하고, 기존 Project → Surface 순서를 유지한다.
- 검증: 실제 PG 잠금 대기를 관측한 뒤 Revoke·만료·grant 축소·범위 제거를 적용해, 대기하던 쓰기가 번역·설정·사건·실행권을
  남기지 않는지 확인한다. 생성은 User 잠금 대기 중 `project:create` 회수 시 Project·OWNER·토큰 범위가 생기지 않아야 한다.
  배치의 다음 키도 재판정하고, 웹/cron 기존 경로는 유지한다. 신규 MCP PG 테스트 경로는 `vitest.projects.config.ts`에 등록한다.
- `publish`: `lib/sync/run.ts` · `lib/pull/trigger.ts` · `lib/pull/run.ts`의 경계를 변경해 실행권 확보 뒤 캡처한 입력으로
  지문을 대조하고 그 입력을 그대로 렌더·전달 확인에 쓴다. 불일치는 GitHub 쓰기 없이 `reconfirm`이고 실행권도 정리한다.
  DB/head 재조회나 자동 재시도로 확인하지 않은 입력을 보내지 않는다. GitHub I/O 동안 DB 잠금을 잡지 않는다.
- Publish 회귀 검증: 미리보기 뒤/실행 입력 캡처 전 저장, base head·표면 설정 변경, 200행 상한 밖 편집,
  미전달 토큰 없는 export 입력 변경 → `reconfirm`·GitHub 쓰기 0회. 대조 뒤 저장 → 확인된 입력만 커밋하고 새 편집은
  미전달로 보존한다. 기존 웹·cron Publish와 전달 확인 CAS도 검증한다. 테스트를 먼저 작성한 뒤 실행기 경계를 수정한다.
- 검증: `pnpm test` · `pnpm test:projects:postgres` green · EDITOR/OWNER × 토큰 grant 매트릭스의 거부 사유가 화면과 같은 문장.

── `feat(mcp): write tools`

## T8. `/mcp` 페이지 (`/design-sync`)

- Claude Design 핸드오프 요청(정적 시안 — 빈 · 목록 · 발급 · 원문 1회 · 편집 · Revoke 확인 · 진행 · 거부 · 결과 미확인 · 복사 실패).
  링크를 받는 즉시 design §8에 붙인다.
- Server Action: `issueApiToken` · `updateApiToken` · `revokeApiToken`(`requireUser`, 전부 `userId`로 좁힌다) · 사이드바 항목 ·
  `routes.mcp()` · `isProtectedPath` · `m.common.nav.mcp` · 연결 조각(`$MALMOI_TOKEN`).
- `updateApiToken`·`revokeApiToken`은 design §1.25의 토큰 부모 행 잠금 규칙을 지킨다. 범위 행만 수정하는 경우도 포함하며,
  쓰기 코어의 재판정과 경합해도 토큰 grant와 범위가 서로 다른 시점의 조합으로 읽히지 않는지 PG에서 검증한다.
- 범위 편집은 서버에서 읽은 기존 범위에 명시적인 추가/제거를 적용한다. 현재 멤버십 목록으로 범위 전체를 덮지 않는다.
  편집 Dialog는 접근 불가/보관 범위도 식별·제거할 수 있게 표시하고, 신규 선택 목록과 구분한다.
- 검증: 기존 범위가 탈퇴/보관 상태일 때 이름만 저장해도 범위가 보존되고, 사용자가 제거한 경우에만 삭제되는지 확인한다.
  접근 불가 행의 최신 프로젝트 정보가 노출되지 않고 여러 행의 제거 컨트롤이 구별되는지도 확인한다.
- 토큰 관리의 진행/거부/결과 미확인을 구분한다. 응답 유실은 자동 재시도하지 않고 목록 재조회로 복구한다.
  발급 후 원문 미수령은 목록 확인 → 해당 토큰 폐기 → 재발급, 복사 실패는 원문 유지·수동 복사로 안내한다.
- DOM 검증: 서버 성공 뒤 응답 유실·수정/폐기 응답 유실·목록 재조회 실패·세션 만료·clipboard 거부를 주입한다.
  중복/자동 발급이 없고, 원문/입력과 복구 안내가 유지되며, 서버 확인 전 성공으로 표시하지 않는지 확인한다.
- 키보드 검증: Dialog 취소의 트리거 복귀, Revoke 후 목록 제목 착지, 마지막 토큰 폐기 후 Create token 착지,
  진행/거부 상태에서 포커스 유지와 완료 알림의 `role="status"` 보존을 DOM 테스트 및 수동 확인으로 검증한다.
- 검증: `pnpm test`(no-korean-ui · brand-spelling · entry-points · structure) · `/design-sync` computed style 실측 · `/runtime-test`.

── `feat(mcp): connector page for tokens`

## T9. 방침·가이드·실물

- `/privacy` 본문(저장 항목 · 개정 이력 · 시행일) — `policy-gate.test.tsx` green.
- `/guide` — `Connect an AI agent` 페이지, `/guide-shots` — `/mcp` 컷.
- ARCHITECTURE 새 절(인증 경계 표에 `/api/mcp` 행 · §1.25 판정 순서 · 핸들 표) · DIRECTORY · DESIGN(새 raw 색이 있으면 §6.2) · `.env.example` 변화 없음 확인.
- **preview 보호 선행 확인**: design §4.1에 따라 CLI와 GitHub Actions 각각 SSO 보호를 통과하도록 준비한다.
  보호를 통과한 무효 앱 토큰은 앱의 401, 유효 토큰은 MCP/CI 응답을 받아야 한다. 302·SSO HTML은 앱 검증 성공으로 세지 않는다.
  CLI는 환경변수에서 읽은 자동화 bypass 값을 별도 헤더로 전달한다. CI의 기존 composite action에는 그 헤더 입력이 없으므로,
  폐기용 리포의 테스트 전용 전송 래퍼에서 기존 payload 생성 경로를 재사용하고 bypass 헤더만 추가한다. 보호 우회용 URL 쿼리는 쓰지 않는다.
  앱/공개 action에 테스트용 환경변수나 헤더 입력을 추가하거나 불변 action 태그를 옮기지 않는다. 래퍼 사용 여부를 실측 기록에 남긴다.
- **실물(preview, `dev.mal-moi.com`)**: 폐기용 리포로 Claude Code에서 "이 리포를 Malmoi에 연결해 줘" → 프로젝트 `ready` → 에이전트가
  워크플로 커밋·`gh secret set PUSH_TOKEN --repo OWNER/REPO`에 원문 표준입력 전달(`--body` 생략) → CI 첫 push 200 → 번역 채우기 → `publish` → PR. EDITOR 계정 토큰으로 같은 프로젝트의 번역·Publish는
  되고 Sync는 `forbidden`.
- 연결 안내의 secret 이름이 생성 YAML의 `${{ secrets.PUSH_TOKEN }}`과 일치하는지 검증한다. 실물 확인에서 토큰 원문을 출력하거나 캡처하지 않는다.
- 검증: 위 왕복의 PR URL과 Logs 화면 캡처 · `pnpm build` green.
- 검증 기록에는 CLI/CI 각각의 보호 통과 여부·앱 상태 코드·dev DB 사용을 남긴다. 토큰/bypass 원문은 로그·URL·캡처에 남기지 않는다.

── `docs(ARCHITECTURE|DIRECTORY|privacy|guide): …` (문서별 별도 커밋)
