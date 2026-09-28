# mcp-connector — tasks

순서: 문서 판정 → SDK 실측 → 순수 함수 → 스키마 → 코어 추출(가족별) → 진입점 + 토큰 Action → `/push` ① → 읽기 도구 → Publish 지문 →
쓰기 도구 → 페이지 → `/push` ② → 가이드·실물.
커밋 경계는 `──`로 표시한다. **`/push`는 두 번이다**(검수 S) — 로컬 게이트의 `pnpm build`가 RSC 경계를 보는 유일한 자리라 route가 선
직후와 페이지가 선 직후에 잡는다.

**전제**: `pnpm test:projects:postgres`는 로컬 PostgreSQL 바이너리(`CREDENTIAL_PG_BIN`, 기본 `/opt/homebrew/opt/postgresql@17/bin`)를
요구하고 CI가 돌리지 않는다(OPERATIONS "격리 PostgreSQL"). 아래 "PG"라고 적힌 검증은 전부 **수동 실행이고 결과를 보고에 붙인다**.
새 `*.integration.ts`는 파일마다 고유 포트로 부트스트랩을 복사한다(공유 헬퍼 없음).

## T0. 정본 판정 갱신 (문서, `/implement` 첫 커밋)

- PRODUCT §4.3 ⑤ → "열었다"로 바꾸고 결론을 §4.1로 올린다: 전용 페이지(뒤집는 근거 — 사용자 구색 판단) · 계정당 하나의 불변 토큰 ·
  도구 목록/쓰기 범위의 정본은 ARCHITECTURE 새 절(§6.45 안) · "역할 ∩ 토큰, 좁히기만".
- PRODUCT §4.2 "세밀한 RBAC" 옆에 한 줄: 토큰 권한은 역할의 부분집합이라 이 비범위가 아니다 — 역할·`Permission`을 늘리는 순간 든다.
- PRODUCT §4.2 "AI 번역" 옆에 한 줄: Malmoi는 LLM을 부르지 않는다, 외부 에이전트의 저장은 편집자 저장이다(2026-09-28 사용자 확정).
- PRODUCT §7.7 IA 트리에 `/mcp`. 같은 절의 별도 "MCP 토큰 화면은 라우트로 만들지 않는다" 문단도 전용 페이지 결정으로 갱신한다 —
  §4.3만 고쳐 정본 안에 반대 판정이 남지 않게 한다.
- 검증: `pnpm test` green · 눈으로 §4.3 번호 연속성.

── `docs(PRODUCT): open the MCP connector (§4.3 ⑤)`

## T1. SDK 실측 (커밋 없음)

- **미커밋 `app/api/mcp-probe/route.ts`**(끝에 삭제 — `.scratch/`의 파일은 Next가 서빙하지 않는다)에 SDK를 붙여 design §1.1 체크리스트
  넷을 잰다: (a) Web `Request`/`Response` 전송 (b) JSON 응답 + 세션 id 미발급 (c) Bearer를 앞단에서 끝내고 넘기기 (d) `tools/list` 순서
  결정성. 2026-07-28 `server/discover` 요청과 2025-11-25 `initialize` 요청을 둘 다 보낸다. Claude Code·Codex로 실제 `tools/list`.
- ⚠️ `pnpm-workspace.yaml`의 `minimumReleaseAge`·`onlyBuiltDependencies`를 확인한다(스크립트 없는 패키지를 화이트리스트에 넣지 않는다).
- **결과를 design §1.1에 되먹인다** — 가정 A/B 중 무엇이 됐는지, 넷 중 안 된 것, 폴백(JSON-RPC 세 메서드 직접 수신)을 쓰는지를 확정문으로
  다시 쓴다. T5는 그 확정문으로 디스패치한다.
- 검증: 두 클라이언트의 `tools/list` 출력 캡처 · design §1.1이 조건문에서 확정문으로 바뀜.

## T2. 순수 함수 (`/tdd interface` → `/implement`)

- `lib/mcp/token.ts` — `generateApiToken` · `hashApiToken` · `parseBearer` · `planApiTokenUse`(`expiresAt == now`가 거부) · `shouldTouch`
- `lib/mcp/grant.ts` — `planToolAccess`(판정 순서 · 역할 × 토큰 × 범위 매트릭스 · 보관 · 역할 조건과 grant 조건 분리)
- `lib/mcp/issue-plan.ts` — `planApiTokenIssue`(범위 ⊆ 현재 멤버십의 비보관 프로젝트 · 멤버십 0이면 `projects` 범위 거부 · grant 어휘 ·
  만료 30/90/365)
- `lib/publish/fingerprint.ts` — `publishFingerprint(state, baseHead)`. 입력 순서가 달라도 같은 지문이고, 번역·편집 토큰·키/로케일·표면
  설정·리포/브랜치·base head가 바뀌면 달라지는 테스트를 먼저 쓴다.
- `lib/mcp/batch.ts` — `planBatchSave`(100개 상한 · 중복 키 거부 · 입력 순서 유지)
- `lib/mcp/result.ts` — `toToolResult`(거부 코드 → `messages/en.tsx` 문장 · `unavailable`만 retryable · 예외 문구 미포함)
- `lib/mcp/catalog.ts` — `toolCatalog`(이름·순서·annotations·필요 grant — **명시적 배열 동치**로 고정, 잎 데이터 모듈)
- `lib/mcp/http.ts` — `checkOrigin`(없으면 통과 · `ALLOWED_HOSTS` 대조 · 다른 host 거부)
- MCP 생성/추가 입력에 후보별 `confirmation`을 필수로 둔다. 기존 HMAC 함수와 포맷 대조를 재사용하는 검증부터 작성한다:
  누락·변조·TTL 경계/초과·미래 시각·사용자/리포/설치/ref/head 불일치·adapter/pathTemplate/baseLocale 불일치.
- 검증: `pnpm test` green. `grant.test.ts`에 **사용자 둘 · 토큰 둘** 시드(POSTMORTEM 2026-09-06). 순수 모듈에 `server-only` 없음.

── `feat(mcp): pure token, grant and result planners`

## T3. 스키마 (`/db`)

- `ApiToken`(`userId` PK · `projectIds String[]` · `tokenHash @unique`) — additive(`ProjectEvent`는 안 바뀐다). `--create-only`로 SQL을
  보고 dev 적용.
- `lib/privacy/collected.ts` 등재(`personal` 분류 — 스칼라 전 필드) · `prisma/__tests__/schema-contract.test.ts`에 `ApiToken` describe
  블록 **신규**(PK·`tokenHash @unique`·Cascade). "인덱스는 `projectId` 선두" 규칙이 있으면 사용자 축 예외 등재.
- 검증: `pnpm db:status` 깨끗 · dev `has_schema_privilege` **네 칸**(USAGE·CREATE × anon·authenticated) 전부 `false` · `pnpm typecheck` ·
  `pnpm test` green.
- **배포 순서**: dev DB additive 적용 → 로컬 게이트 → `/push` ①(T5 뒤) → preview 실물 → `/push` ②(T8 뒤) → `/merge` 전에
  `pnpm db:deploy`로 prod additive 적용 → `pnpm db:status:prod` + prod `has_schema_privilege` 네 칸 → `/merge`로 앱 배포.
  prod 적용을 `/push` 앞으로 당기지 않는다. Codex는 문서/코드·커밋까지이며 `/push`·`/merge`는 Claude Code에서 수행한다.

── `feat(db): add per-user api token`

## T4. 코어 추출 (동작 불변 리팩터 — **가족별 4커밋**, 검수 F·S)

한 커밋으로는 24개 Action + `SITES` 16자리 + export 가드 스캔을 한꺼번에 움직여 회귀를 특정할 수 없다. 각 커밋의 검증은
`pnpm test` green + 그 가족의 PG 스위트 + `locked-access.test.ts`의 `SITES`(`file#function`, `function` 선언만 해석)·`entry-points.test.ts`
export 가드 갱신 + `client-graph.test.ts` green이다.

- **T4-0 `/tdd` 선행**: 오늘 실행 테스트가 없는 Action 셋 — `prepareRepositorySync` · `previewTranslationRevert` · `revertTranslationKey`
  (컴포넌트 mock으로만 참조된다) — 에 `app/(edit)/__tests__/harness.ts` 기반 테스트를 먼저 박는다: `project:settings` → `blocked` 변환,
  `not-ready`, 커밋 후 `revalidateTranslationReaders`. 이것 없이 "기존 테스트로 회귀 확인"은 존재하지 않는 테스트를 가리킨다.
  ── `test(actions): pin sync-prepare and revert actions before extraction`
- **T4-a 이미 lib에 위임하는 것**: `saveTranslationKey`·`revert*`·`loadMoreTranslationKeys`·`triggerPullAction`·`prepareRepositorySync`·
  `loadPublishPreview`·두 브랜치 조회. `applyKeySaveBatch` 신설(`applyKeySave`의 판정 재사용, 잠금 한 번). 입력 스키마·결과 타입을
  세션/Next 의존 없는 공유 모듈로. ── `refactor(actions): share key, publish and branch cores`
- **T4-b 작은 tx**: 설정(`lib/settings/update.ts`) · 보관(`lib/projects/archive.ts`) · push 토큰 회전(`lib/projects/rotate-token.ts`) ·
  멤버/초대(`lib/auth/members.ts` · `lib/invitation-email/create.ts`) · 기준 로케일(`lib/sources/base-locale.ts`). `lockProjectAccess`에
  `token?` 인자 추가 + 잠금 뒤 `ApiToken` 재읽기(design §1.25). ── `refactor(actions): share settings, member and archive cores`
- **T4-c 온보딩(두 자격증명 만남점) → `lib/onboarding-run/`**: `checkRepoAccess`·`detectRepoFormats`·`listConnectableRepos`·`addSurfaces`·
  `runRepositoryImport`. `credential-separation.test.ts`에 새 루트를 Server Action 규칙 집합으로 추가(`lib/onboarding` 규칙에 넣으면 red).
  raw 잠금 자리(import·surfaces/create·revert)에 `lockApiToken` 헬퍼. ── `refactor(onboarding): move credential meeting points to onboarding-run`
- **T4-d `createProject`**: `lib/onboarding-run/create.ts`. User 잠금 뒤 토큰 유효성·`project:create` 재확인, 선택 범위 토큰이면 **같은 tx**에서
  `projectIds`에 추가. 별도 클라이언트 `tokenId`나 범위 추가 플래그를 받지 않는다. ── `refactor(onboarding): extract project creation core`
- 회귀 검증(가족마다): 역할·보관·readiness 거부, 마지막 OWNER 보호, 초대 발급 후 메일 실패, 브랜치 변경 시 전달 확인 무효화, 토큰 회전의
  리포 쓰기 권한, 각 변경과 사건의 원자성, 커밋 후 `revalidatePath` 예외 주입 → `{ ok: true }`(POSTMORTEM 2026-09-20).
- 검증: 가족마다 `pnpm test` · PG(`lib/events/__tests__/locked-access.integration.ts` 포함) · `client-graph.test.ts` green.

## T5. 토큰 저장소 + 진입점 + 토큰 Action

- `lib/mcp/token-store.ts` — `resolveApiToken(prisma, bearer, now)` → `{ userId, tokenId, grants, scope } | null`, `lastUsedAt` 스로틀 쓰기.
  **`tokenId` = `ApiToken.tokenHash`**(2026-09-28 결정 — `id` 컬럼 없음). 잠금 뒤 재읽기는 `userId` **AND** `tokenHash`다(design §1.25) —
  잠금 대기 중 재발급된 토큰(같은 `userId`, 새 해시)이 거부돼야 한다.
  `server-only`.
- `app/api/mcp/route.ts` — POST만 · `checkOrigin` → 인증 → `readBoundedText(1 MiB)` → 디스패치(T1이 확정한 개정 또는 JSON-RPC 폴백) ·
  `maxDuration = 60` · 쿠키 미사용 · `server-only`.
- **토큰 Server Action**(T8에서 앞당김 — T6·T9가 토큰을 필요로 한다): `issueApiToken`(기존 행 삭제 + 삽입 한 tx — Create와 Rotate가
  같다) · `revokeApiToken`. `requireUser`, `userId`로 좁힌다. `app/(edit)/mcp/actions.ts`.
- **새 메타 테스트 둘**(검수 S — 기존 `entry-points.test.ts`는 route를 `EXEMPT`에 넣을 뿐 가드를 못 센다): ① "EXEMPT route → 필수 가드
  호출" 맵(`api/mcp/route.ts` → 주석 제거 후 `resolveApiToken(`) ② `lib/mcp/**`·`app/api/mcp/**`의 `auth(`·`readSession(`·`cookies(` 금지 스캔.
  둘 다 양성·음성 케이스를 먹이고(POSTMORTEM 2026-09-07) **가드 호출을 지우는 뮤테이션을 한 번 걸어 red 확인**(2026-09-18).
- `credential-separation.test.ts` 대상에 `lib/mcp` 루트 추가(Server Action 규칙 집합).
- 검증: `pnpm test` green · 로컬 `curl`로 401 네 갈래가 같은 본문 · 쿠키만 실은 요청 401 · `content-length: 1048577` 400 / `1048576` 통과
  (route 층 — `push-failure.test.ts:121` 형) · JSON-RPC 배치 배열·id 없는 notification·미지 메서드·미지 도구 이름 각각의 응답 고정 ·
  `Origin: https://evil.example` 거부, `Origin` 없음 통과.

── `feat(mcp): authenticated stateless entry point and token actions`

**→ `/push` ①** (route와 토큰 Action이 preview에 선다. T6의 로컬 확인용 토큰은 `issueApiToken`을 `.scratch/` 스크립트로 부른다.)

## T6. 도구 — 읽기

- `whoami` · `list_projects` · `get_project` · `list_keys` · `get_key` · `list_events` · `list_members` · `get_workflow` ·
  `list_repositories` · `list_branches` · `detect_formats` · `preview_publish` · `preview_sync` · `preview_revert`.
- 각 도구 = `planToolAccess` → 기존 인가(`getProjectAccess`/`getSurfaceAccess`) → 코어 → `toToolResult`. 인자에 `projectId`·`userId` 없음.
  `lib/mcp/tools/*`는 `server-only`이고 `toolCatalog`(잎)를 import한다 — 반대 방향 금지.
- design §2.1의 역할 조건/grant 조건을 카탈로그와 판정에 각각 등록한다. 기존 인가 함수에 넘기는 permission을 토큰의 필수 grant로 자동
  복제하지 않는다.
- 검증: OWNER/EDITOR × 빈 grants로 `list_keys`·`preview_publish`·**기존 프로젝트 `list_branches`** 성공, OWNER만 `preview_sync`·
  `preview_revert`·`get_workflow` 성공, EDITOR는 `forbidden`. 빈 grants의 `list_repositories`·신규 `list_branches`·신규 `detect_formats`는
  `token-scope`, 기존 `detect_formats`는 OWNER `token-scope` / EDITOR `forbidden`. 범위 밖은 모든 프로젝트 조회에서 `not-found`.
  `allProjects=false` + `projectIds` 빈 토큰은 모든 프로젝트가 `not-found`. 읽기 전용 토큰이 받은 미리보기 핸들로 쓰기를 실행할 수 없다.
- `detect_formats`는 신규 `{ owner, repo, ref? }`와 기존 `{ slug }` 입력을 구별한다. 두 입력의 혼합과 거부 후 경로 폴백은 허용하지 않는다.
- 검증: 기존 프로젝트 하나에 `Project settings`만 허용한 토큰의 탐지 성공과 `project:create` 불필요 · 범위 밖 `not-found` · EDITOR
  `forbidden` · grant 없음 `token-scope` · 리포 읽기 전용 거부 · 리포/ref 덮어쓰기 입력 거부.
- `detect_formats`의 확인값 발급(`signSampleConfirmation`)은 `APP_SIGNING_SECRET`이 비면 **던진다** — 도구가 `unavailable`로 접는다
  (`sample-expired`·`no-candidates`로 접지 않는다). T7의 소비(`planSampleConfirmations`)도 같다(design §2.2).
- `needs-browser`: 연결 안 됨·재인가·설치 0 전부 `routes.account()`. 후보 없음은 `reason: "no-candidates"` + 신규 `routes.newProject()` /
  기존 `routes.sources(slug)`.
- 검증: 연결됐지만 설치 0인 사용자도 `/account` · URL에 비밀값 없음 · 권한 거부·GitHub 장애·예산 초과는 `no-candidates`로 접히지 않음 ·
  (수동, `/runtime-test`) 두 링크에서 기존 수동 설정을 거쳐 생성/추가까지 도달.
- 동시 호출 테스트(POSTMORTEM 2026-09-16 · 2026-09-13): `account.updateMany` count=0 경로를 deferred promise로 붙잡아 같은 사용자의 만료
  user-to-server 토큰으로 `list_repositories` + `list_branches`를 겹치게 하고, 한쪽 실패 + 다른 쪽 대기 케이스를 포함해 둘 다 성공.
- 검증: `pnpm test` green · 로컬에서 Claude Code로 각 도구 1회(토큰은 `/push` ① 뒤 `.scratch/` 스크립트로 발급).

── `feat(mcp): read tools`

## T6.5. Publish 지문 — `expectedFingerprint` (엔진 변경이라 별도 커밋, 검수 D)

- 테스트를 먼저 쓴다: `lib/pull/__tests__/{run,trigger,delivery-wiring}.test.ts` · `lib/publish/__tests__/read.test.ts` ·
  `lib/keys/__tests__/delivery-invariants.integration.ts`(PG).
- `preview_publish`는 `readPublishPreview`가 이미 부르는 `loadPullState` + `head`로 지문을 낸다. `runSync`→`triggerPull`→`runPull`에
  `expectedFingerprint?` 인자 하나 — `loadState()`·head 직후·GitHub 쓰기 전 비교, 불일치는 `reconfirm`. 실행권 tx·`startRun`·CAS·웹·cron은
  바뀌지 않는다.
- `reconfirm`을 `too-soon` 기준(`status ∈ {SUCCEEDED, SKIPPED}`)에서 제외 · `lib/pull/__tests__/error-codes.test.ts` 양방향 목록 등재.
- 검증: 미리보기 뒤 저장 · base head 변경 · 표면 설정 변경 · 200행 상한 밖 편집 · 미전달 토큰 없는 export 입력 변경 → `reconfirm`·GitHub 쓰기
  0회. 대조 뒤 저장 → 확인된 입력만 커밋, 새 편집은 미전달 보존. `already-running`·`too-soon`·보낼 것 없음 각각 고정. 기존 웹·cron
  Publish와 전달 확인 CAS 회귀. **`/roundtrip`**(폐기용 `i18n-order-check` — 표현 5축; 포크 픽스처 둘은 쓰기 금지).

── `feat(publish): verify export input fingerprint before writing`

## T7. 도구 — 쓰기

- `set_translations` · `publish` · `sync_repository` · `revert_to_last_sent` · `update_project` · `set_base_locale` · `rotate_push_token` ·
  `invite_members` · `revoke_invitation` · `change_member` · `archive_project` · `unarchive_project` · `create_project` · `add_sources`.
- `set_translations`: `planBatchSave` → `applyKeySaveBatch`(한 잠금·한 tx·키별 결과). 거부된 키는 그 키만 건너뛴다.
- 검증(PG): 100키 중 1번 키 `not-found`가 나머지 99를 막지 않음 · `orphaned` 키 저장 · 수술적 표면의 `cannot-clear` · 표면 보관 vs 프로젝트
  보관 · 중복 키 거부 · 100키 한 tx가 `timeout 30초` 안에 끝나는 실측치 기록. 성공 키는 저장과 사건이 남고 거부 키는 둘 다 불변.
- `create_project`·`add_sources`의 HMAC 소비(design §2.2): 후보 전부를 인가된 리포 스냅샷과 대조하고 같은 head의 파일을 기존 포맷
  재검증·첫 적재 코어에 전달. 기존 웹 Action에는 확인값을 필수로 추가하지 않는다.
- 검증: 만료/대상 불일치 `sample-expired` · 포맷 불일치 `manual-no-match` · 여러 후보 중 하나 실패 시 Project·Surface·번역·사건·`projectIds`
  쓰기 0회 · 검증 뒤 ref 변경을 끼워 넣어 다른 head를 적재하지 않음 · 한도 3 도달 · slug 충돌 · 기존 웹 생성·소스 추가가 확인값 없이 기존
  검증을 거쳐 동작(회귀). 설정 전용 토큰으로 T6의 `detect_formats({ slug })` → `add_sources` 완료, 범위 밖 프로젝트 불가, 생성 권한 없음.
- design §1.25의 주체 `{ userId, tokenId }`를 모든 쓰기 코어까지 전달. `lockProjectAccess({ token })` 경로와 raw 잠금 넷의 `lockApiToken`
  둘 다 잠금 뒤 토큰을 **`userId` AND `tokenHash`(= `tokenId`)로** 재읽기 — `userId`만으로 읽으면 재발급된 새 행이 통과한다. Action과 같은 `revalidatePath`.
- 검증(PG, `lib/mcp/__tests__/*.integration.ts` — `vitest.projects.config.ts` include에 등록): 실제 잠금 대기를 관측한 뒤 Revoke·만료·
  재발급을 적용해 대기하던 쓰기가 번역·설정·사건·실행권을 남기지 않음. 생성은 User 잠금 대기 중 재발급(`project:create` 없는 토큰) 시
  Project·OWNER·`projectIds`가 생기지 않음. 웹/cron 기존 경로 유지.
- 검증: `pnpm test` · PG green · EDITOR/OWNER × 토큰 grant 매트릭스의 거부 사유가 화면과 같은 문장(`messages/en.tsx` 같은 키 참조로 자동화).

── `feat(mcp): write tools`

## T8. `/mcp` 페이지 (`/design-sync`)

- Claude Design 핸드오프 요청(정적 시안 — design §8의 프레임 열 개). 링크를 받는 즉시 design §8에 붙인다.
- 페이지: `RowCard` 헤더 [Create token] / [Rotate] + [Revoke] · 카드 메타 평문 · `Expired` 배지 · `EmptyRowCard inset` · 상시 캡션 ·
  `SegmentedControl` + `components/docs/code-block.tsx` 연결 조각(`$MALMOI_TOKEN`) · 가이드 링크. 사이드바 `navWorkItems()` 항목(`Plug`,
  `exact: true`) · `routes.mcp()` · `isProtectedPath` · `m.common.nav.mcp`.
- 발급 `OnboardingModal` 2단계(폼 → 원문 칩 + Copy). 멤버십 0이면 "고른 프로젝트" `aria-disabled` + 사유. Revoke는 440 `Dialog` `danger`.
- 진행·거부·결과 미확인은 Sync 버튼 형(`Button busy` · `unconfirmed` `Alert` · 온라인이면 `router.refresh()`). 자동 재시도 없음.
- DOM 검증(jsdom): 서버 성공 뒤 응답 유실 · Revoke 응답 유실 · 세션 만료 · `navigator.clipboard.writeText` reject 주입 → 중복/자동 발급 없음,
  원문/입력과 복구 안내 유지, 서버 확인 전 성공으로 표시하지 않음. 복사 성공만으로 원문 화면이 닫히지 않음.
- 키보드 검증: 모달/Dialog 취소의 트리거 복귀 · Create/Rotate/Revoke 후 카드 제목 착지 · 진행/거부 상태의 포커스 유지 · 항상 DOM에 있는
  `role="status"`. **`installFocusFixup`**(`components/__tests__/invite-modal.test.tsx:23` 형을 복사)을 달고 **복귀 로직 삭제 뮤테이션이
  red**인지 확인(POSTMORTEM 2026-09-20 — 없으면 아무것도 안 잰다). 나머지는 `/runtime-test` 수동.
- 검증: `pnpm test`(no-korean-ui · brand-spelling · entry-points · structure · surface-rules · client-graph) · `/design-sync` computed style
  실측 · `/runtime-test`. 새 raw 색 0.

── `feat(mcp): connector page`

**→ `/push` ②**

## T9. 방침·가이드·실물

- `/privacy` 본문(저장 항목 · 개정 이력 · 시행일) — `policy-gate.test.tsx` green.
- `/guide` — `Connect an AI agent` 페이지(설정 · 예시 프롬프트 · 권한 설명 · 도구 묶음 — 정본), `/guide-shots` — `/mcp` 컷.
- ARCHITECTURE 새 절(인증 경계 표에 `/api/mcp` 행 · §1.25 판정 순서 · 핸들 표 · §3.1 "만나는 자리"에 `lib/onboarding-run` 추가) · DIRECTORY
  (`lib/onboarding-run/` · `lib/mcp/` · 동사형 파일명 근거) · CLAUDE.md 명령어 표의 PG 수동 실행 디렉터리에 `lib/mcp/**`·`app/api/mcp/**` 추가 ·
  DESIGN 등재 없음 확인 · `.env.example` 변화 없음 확인.
- **ARCHITECTURE §6.45 신설 + PRODUCT §4.1 "MCP 커넥터" ④의 design.md 포인터 괄호 삭제** — T0이 "(§6.45로 신설 — 신설 전까지는
  `docs/features/mcp-connector/design.md` §2)"로 적어 둔 괄호다. 기능 디렉터리를 지우기 전에 정본 포인터를 ARCHITECTURE로 옮긴다.
- **preview 보호 선행 확인**: design §4.1에 따라 CLI와 GitHub Actions 각각 SSO 보호를 통과하도록 준비한다. 보호를 통과한 무효 앱 토큰은
  앱의 401, 유효 토큰은 MCP/CI 응답을 받아야 한다. 302·SSO HTML은 앱 검증 성공으로 세지 않는다. CLI는 환경변수에서 읽은 자동화 bypass
  값을 별도 헤더로 전달한다. CI는 폐기용 리포의 테스트 전용 전송 래퍼에서 기존 payload 생성 경로를 재사용하고 bypass 헤더만 추가한다.
  앱/공개 action에 테스트용 입력을 추가하거나 불변 action 태그를 옮기지 않는다. 래퍼 사용 여부를 실측 기록에 남긴다.
- **실물(preview, `dev.mal-moi.com`, 대상 리포 = `bugshot-i18n-test`**(roundtrip 전제 1의 폐기용 셋 중 하나; 포크 픽스처 둘은 쓰기 금지)):
  Claude Code에서 "이 리포를 Malmoi에 연결해 줘" → 프로젝트 `ready` → 에이전트가 워크플로 커밋·`gh secret set PUSH_TOKEN --repo OWNER/REPO`에
  원문 표준입력 전달(`--body` 생략) → CI 첫 push 200 → 번역 채우기 → `publish` → PR → sync 브랜치·PR 정리. EDITOR 계정 토큰(두 번째
  계정은 dev DB에 `ProjectMember`를 직접 심는다 — preview의 Resend 왕복에 의존하지 않는다)으로 같은 프로젝트의 번역·Publish는 되고 Sync는
  `forbidden`.
- 연결 안내의 secret 이름이 생성 YAML의 `${{ secrets.PUSH_TOKEN }}`과 일치하는지 검증한다. 토큰·bypass 원문을 로그·URL·캡처에 남기지 않는다.
- 검증: 위 왕복의 PR URL과 Logs 화면 캡처 · CLI/CI 각각의 보호 통과 여부·앱 상태 코드·dev DB 사용 기록 · `pnpm build` green.

── `docs(ARCHITECTURE|DIRECTORY|privacy|guide): …` (문서별 별도 커밋)

## 결정 기록 (`/orchestrate`, 2026-09-28)

- **T8 시안** — Claude Design 핸드오프 수령(design §8에 링크). 워크트리엔 `.env.local`이 없어 dev 서버가 안 뜨므로, 워커는 시안을 읽고
  구현 + jsdom 검증까지, computed style 실측(`/design-sync` 루프)은 통합 뒤 main 체크아웃의 QA 워커가 한다.
- **T9 preview 보호 통과** — Vercel "Protection Bypass for Automation" secret은 사용자가 QA 직전에 준비한다(로컬 셸 환경변수 +
  폐기용 리포 secret, 값은 트랜스크립트에 남기지 않는다). 준비가 안 되면 preview 실물은 미완으로 기록한다.
- **배치** (워커는 전부 Claude Code):

| 배치 | 태스크 | 건드리는 곳 | 순서 |
|---|---|---|---|
| M1 | T0 · T1 · T2 · T3 → (M2 대기) → T5 | PRODUCT · `package.json`/lockfile · `lib/mcp/{token,grant,issue-plan,batch,result,catalog,http}.ts` · `lib/publish/fingerprint.ts` · `prisma/` · `lib/privacy/collected.ts` · `app/api/mcp/` · `app/(edit)/mcp/actions.ts` · 메타 테스트 | T3 뒤 인계 `a`, M2 통합 뒤 T5 → 인계 `b` → `/push` ① |
| M2 | T4-0 · T4-a → (M1 `a` 대기) → T4-b · T4-c · T4-d | `app/(edit)/**/actions.ts` · `lib/auth/lock.ts` · 추출 코어 · `locked-access`/`entry-points`/`credential-separation` 테스트 | M1과 병렬, T4-b 전에 `WAITING FOR M1` |
| M3 | T6 → (M4 대기) → `preview_publish` · T7 → T9 문서(ARCHITECTURE · DIRECTORY · CLAUDE.md · 가이드 본문) | `lib/mcp/tools/*` · `app/api/mcp/route.ts` 디스패치 | `/push` ① 뒤 |
| M4 | T6.5 | `lib/pull/**` · `lib/sync/run.ts` · `lib/publish/read.ts` | `/push` ① 뒤, M3와 병렬 |
| M5 | T8 · `/privacy` 본문(T9) | `app/(edit)/mcp/page.tsx` · `components/mcp/**` · `lib/shell/nav.ts` · `lib/auth/cookie.ts` · `lib/routes` · `app/privacy` | `/push` ① 뒤, M3·M4와 병렬. `messages/en.tsx`는 M3와 겹치므로 늦게 통합되는 쪽이 `git rebase dev` |
| QA | `/runtime-test` · `/design-sync` 실측 · `/roundtrip`(`i18n-order-check`) · preview 실물(T9) · `/guide-shots` | main 체크아웃 | 전부 dev에 들어간 뒤 직렬 |
- **README 히어로** (2026-09-29 사용자) — 문구와 이미지 둘 다. 문구: 태그라인/본문에 AI 에이전트(MCP) 연결 한 줄(T9 문서와 함께, 사실의 정본은
  PRODUCT·가이드). 이미지: 사이드바에 `MCP connector`가 늘어 `docs/assets/readme/hero.webp`가 낡는다 — QA 단계에서 새 셸로 재촬영.
