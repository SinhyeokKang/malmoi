# project-settings-rework — tasks

**두 런타임이 나눠 맡는다** (2026-09-20 사용자): **Codex가 서버·순수 함수를 1차로**, **Claude Code가
UI를** 받는다. 근거는 Codex가 Claude Design 핸드오프를 읽을 수 없다는 것 하나다 — 그래서
**시안의 px·문구·상태가 판정에 들어가는 태스크는 전부 Claude Code**이고, 캔버스를 안 봐도 스펙만으로
닫히는 태스크가 Codex다.

⚠️ **경계가 흐려지는 자리 하나**: T4(프리미티브 승격)은 코드 이동이지만 **값이 시안에서 온다**
(머리 16 · 제목 15/500 · 디바이더 둘). Claude Code가 잡는다.

✅ **결정은 전부 닫혔다** (design §11). 갈래를 다시 열지 않는다 — 특히 **D4(all-or-nothing)** 와
**D5(행 집계를 그린다)** 는 내 추천과 반대로 확정된 것이라, 구현 중에 "이게 더 단순한데"로
되돌리지 않는다.

| # | 담당 | 태스크 | 검증 | 커밋 |
|---|---|---|---|---|
| **T0** | — | ✅ **결정 완료** (2026-09-20 사용자) — design §11이 확정 표다. ⚠️ **D4·D5가 추천과 갈렸다**: 다중 추가는 **all-or-nothing**, 행 집계는 **그린다** | — | — |

## Phase 1 — 순수 함수 (Codex · `/tdd interface` → `/implement`)

테스트를 **먼저** 쓴다(CLAUDE.md 테스트 우선). 이 페이즈는 화면을 하나도 안 그린다.

| # | 담당 | 태스크 | 검증 | 커밋 |
|---|---|---|---|---|
| T1.1 | Codex | `lib/import/surface-status.ts` — `planSurfaceImportStatus` 5갈래 + `canRetry` | `pnpm test` green. design §1.1 판정표 전수 + 실행 중 이전 오류·SHA 유무·미지 오류·partial-import·시각 null. 버튼의 설치·보관·pending 결합은 T5.4에서 검증 | `feat(import): plan per-surface import status` |
| T1.2 | Codex | `lib/onboarding/readiness.ts` — `planSurfaceReadiness` 추가. **`planProjectReadiness`는 그것을 부르는 형으로 바꾸되 반환값이 안 바뀐다** | 기존 `readiness` 테스트가 **고치지 않고** green | 위와 같은 커밋 |
| T1.3 | Codex | `lib/projects/plan.ts` — `planProjectName` + `PROJECT_NAME_MAX_CHARS = 200`. `createProject`의 인라인 `.max(200)`이 그 상수를 쓴다 | `pnpm test` green + 생성/수정이 **같은 상수**를 읽는 것을 단언하는 테스트 | `feat(projects): share the project name limit between create and rename` |
| T1.4 | Codex | `lib/upload/image.ts` — `projectImageObjectKey` · `planProjectImageDelete`. ⚠️ 기존 `imageObjectKey`·`planImageDelete`의 `avatars/` 규칙을 **안 넓힌다**(둘을 한 함수로 합치면 avatar 키에 projectId가 들어갈 수 있다) | `pnpm test` green. `projects/` 아닌 키가 `planProjectImageDelete`에서 `null` | `feat(upload): add project image object keys` |
| T1.5 | Codex | `lib/upload/store.ts` — `listImages(prefix)`로 넓힌다. 스모크의 Project 조회 배선·실행은 스키마가 생긴 T2.3으로 분리 | 단위 테스트가 각 접두의 SDK 전달·목록 페이지 순회를 단언 | T1.4와 같은 커밋 |
| T1.6 | Codex | `lib/surfaces/plan-add.ts` — `planAddSources`(체크+잠금 판정 · **선택 안의 중복 `pathTemplate` 거부**) · `summarizeAddResults`. ⚠️ **D4 확정 뒤 이 함수가 세는 것은 표면 성패가 아니라 적재의 부분 실패다** — `SurfaceAdded[]`의 `failed` 합이 0이 아니면 tone `warning`(불변식 9) | `pnpm test` green. `failed`로 tone이 갈리는 케이스, read 오류 0·중복 키 > 0에서도 warning인 케이스가 테스트에 있다 | `feat(surfaces): plan multi-source selection and summarize outcomes` |
| T1.8 | Codex | `lib/surfaces/plan-add.ts` — `formatSourceCounts` (D5의 행 보조 줄 문자열). ⚠️ **`orphaned`를 뺀 수**이고 목록·Home과 **같은 술어**다 | `pnpm test` green | 위와 같은 커밋 |
| T1.7 | Codex | `lib/onboarding/workflow.ts` — `planWorkflowStale` (D8: `lastCommitSha === null`) | `pnpm test` green. 서버 첫 적재로 SHA가 생긴 소스는 CI 미등록이어도 반환 목록에서 빠짐을 단언(design §3.6) | 위와 같은 커밋 |

## Phase 2 — 스키마 (Codex · `/db`)

| # | 담당 | 태스크 | 검증 | 커밋 |
|---|---|---|---|---|
| T2.1 | Codex | `Project.image String?` 마이그레이션 (**additive**) | `pnpm db:migrate`(dev) 후 `pnpm db:status` · `pnpm db:generate` · `pnpm typecheck` green | `feat(db): add Project.image` (스키마 + 마이그레이션만) |
| T2.2 | Codex | `/db` 5단계 — 새 마이그레이션 뒤 `anon` 권한 0 확인 | Supabase에서 `anon` GRANT 0건 | — |
| T2.3 | Codex | **T1.5·T2.1 뒤**, `scripts/smoke-blob.ts`가 두 접두를 훑고 User.image·Project.image 참조셋 및 각 접두의 삭제 판정을 연결한다. 자동 삭제 없음 | 모의 목록/참조셋 검증: 참조 중 프로젝트 이미지 제외·미참조 프로젝트 이미지 포함·아바타 동작 유지. `pnpm smoke:blob` 실 API 검증으로 두 접두 조회 확인 | `feat(upload): inspect orphaned project images in the blob smoke` |

## Phase 3 — Server Action (Codex · `/implement`)

⚠️ **전부 최상단 `getProjectAccess({ permission: "project:settings" })`.** 인가가 GitHub·Blob
호출보다 먼저다.

| # | 담당 | 태스크 | 검증 | 커밋 |
|---|---|---|---|---|
| T3.1 | Codex | `uploadProjectImage` · `deleteProjectImage` — `uploadProfileImage`의 순서(네트워크 I/O가 tx 밖 · `FOR UPDATE` · 이전 이미지는 커밋 뒤에 삭제)를 따르되 **PII 봉투 없이**. ⚠️ **`archivedAt`을 안 본다** (D7, T3.2와 같은 주석) | `pnpm test` green + `pnpm test:projects:postgres` green | `feat(settings): upload and remove the project thumbnail` |
| T3.1a | Codex | **T2.1·T3.1 뒤**, design §3.1의 네 읽기 경로에 `Project.image`를 추가한다 — 설정·Home·초대 Project select와 목록 조회·`ProjectListRow`. 업로드·교체·삭제 성공 뒤 `revalidatePath("/", "layout")`로 캐시 갱신. 화면 props·렌더는 T5.2a가 잇는다 | 조회 테스트가 네 경로에서 저장된 URL·교체 URL·삭제 후 null을 반환함을 단언하고, Action 테스트가 성공 뒤 캐시 갱신을 단언한다. 기존 초대 조회·표시 조건 유지 | `feat(settings): expose project images to all four readers` |
| T3.2 | Codex | `updateProjectName` + `revalidatePath("/", "layout")`. ⚠️ **`archivedAt`을 안 본다** (D7) — 그 비대칭의 근거를 주석으로 남긴다: 안 남기면 다음 사람이 "빠진 가드"로 읽고 더한다 | `pnpm test` green. 저장 후 `slug` 불변 + **보관된 프로젝트에서도 성공**을 단언 | `feat(settings): rename a project` |
| T3.3 | Codex | `addSurfaces` — **all-or-nothing** (D4). 스냅샷·`readFiles`·`planConfirmedFormat`은 **tx 밖**, 검증된 blob 맵 N개의 쓰기만 **한 tx**. `addSurfacesFromSnapshot`이 `tx` 하나를 끝까지 넘긴다. 요청 전체 대상 경로의 합집합을 `readFiles` 한 번으로 읽어 파일 200개·합계 10MB(파일당 2MB) 예산을 적용한다. `$transaction`은 `maxWait: 10_000`·`timeout: 30_000` 상한 유지(design §3.3). **기존 `addSurface`·결과 타입·구현 의존성은 T5.6까지 유지** | `pnpm test:projects:postgres` green: 경로 충돌 시 전부 롤백·중복 템플릿 거부·적재 부분 실패는 커밋. 둘째 표면·마지막 쓰기·timeout 실패 주입 뒤 신규 Surface/Locale/StringKey/Translation/KeyRef 0건·기존 데이터 불변. 동시 경로 충돌은 하나만 성공·패자는 `path-conflict`. grep은 보조 점검이며 0건을 원자성 근거로 삼지 않는다. 오류 union의 `AddSurfaceErrorCode` 및 충돌 목록 반환 검사 | `feat(surfaces): add several translation sources atomically` |
| T3.3a | Codex | **T3.3의 요청 전체 예산·timeout 검증** — 예산 단위 테스트를 먼저 쓰고 Action·격리 PG 검증으로 연결한다. 선택 유지 UI는 T5.5에서 검증 | 각 소스는 개별 예산 안이나 합계가 초과하는 경우, 200/201파일·10MB 경계·size 불명·실제 바이트 초과를 검사한다. 사전 거부 시 `resource-limit`·blob 호출 0회·DB 쓰기 0건, 실제 바이트 초과 시 DB 쓰기 0건. PG에서 timeout 실패 뒤 신규 데이터 0건·기존 데이터 불변을 단언(C8d) | T3.3과 같은 커밋 |
| T3.4 | Codex | `runFirstIngest`에 `surfaceSlug?` 추가. `planSurfaceReadiness`로 판정하고 `not-awaiting` 규칙 유지 | `pnpm test` green: 생략 시 기본 표면·지정 시 해당 표면만 적재·기본 ready/지정 awaiting 성공·지정 ready 거부·타 프로젝트에만 있는 slug 거부·형제 표면의 키/상태 불변·보관 거부 | `feat(settings): retry the first import for one source` |
| T3.5 | Codex | `entry-points.test.ts` — 새 Action 넷이 가드를 **호출**하는지(이름이 아니라) | `pnpm test` green | 위 커밋들에 분산 |
| T3.6 | Codex | **D5 행 집계** — 표면별 키·언어 수를 **쿼리 하나**로 받는다. `lib/keys/query.ts`의 기존 술어 재사용, `orphaned` 제외. ⚠️ **행마다 따로 부르지 않는다** | `pnpm test:projects:postgres` green. design §3.5의 1/5표면 fixture·5회 반복·ANALYZE 전후 EXPLAIN (ANALYZE, BUFFERS), SQL 최대 500ms 이하. 빈 표면·orphaned·타 프로젝트의 집계 정답도 단언. 환경·측정치를 커밋 메시지에 기록 | `feat(surfaces): count keys and locales per source` |
| T3.7 | Codex | **T3.6이 합격선 미달이면** 그 줄을 내리고 측정치를 보고한다. C8c와 기능 완료 처리를 보류한다. 비정규화 컬럼은 범위 밖 | design §3.5 기준의 측정 기록과 미완료 표시 | — |

### Codex → Claude Code 인계 게이트

Phase 3까지 완료한 상태에서 `pnpm typecheck`·`pnpm test`·`pnpm test:projects:postgres`가 통과해야 한다.
기존 UI가 사용하는 `addSurface`·결과 타입·`Card`를 유지한다. 마지막 소비자 전환과 삭제는 같은
커밋이며, 삭제 전 실물 참조를 다시 검색한다. 각 전환 커밋도 타입 검사·관련 테스트를 통과시킨다.

## Phase 4 — 프리미티브 (Claude Code · `/design-sync` 루프 안에서)

⚠️ **`/design-sync`가 여기서부터 붙는다.** 값이 캔버스에서 오고, 실측이 눈이 아니라 computed
style + CDP 접근성 트리다.

| # | 담당 | 태스크 | 검증 | 커밋 |
|---|---|---|---|---|
| T4.1 | Claude Code | **소비자를 먼저 센다** — `grep -rln "from \"@/components/ui/card\"" app components` · `AccountCard`·`AccountRows`·`AccountRow`·`AccountFacts` 각각 | 네 숫자를 커밋 메시지에 적는다 (POSTMORTEM 2026-09-15 🔁) | — |
| T4.2 | Claude Code | `components/ui/panel-card.tsx` 신설 — account-section의 넷 승격 + 개명. 제목 없는 사용은 헤더·aria-labelledby 생략(design §7). `/account` 경로 전환 | `pnpm typecheck`·`pnpm test` green + `/account` 브라우저 확인. 제목 없는 형에 빈 헤더·끊어진 접근 이름이 없음을 단언 | `refactor(ui): promote the account card shell to a shared primitive` |
| T4.3 | Claude Code | `locales/page.tsx`를 제목 없는 `PanelCard`로 전환한다. 기존 `card.tsx`는 설정의 마지막 소비자가 전환될 때까지 유지(T5.9a) | `pnpm typecheck`·`pnpm test` green + `/locales` 브라우저 확인. 라벨 중복·빈 헤더 없음 | `refactor(ui): migrate locales to PanelCard` |
| T4.4 | Claude Code | `Alert`에 `inset` prop (D-없음, 핸드오프 §11) | `pnpm test` green. inset과 페이지 수준 형이 **같은 화면에** 서는 테스트 | `feat(ui): give Alert an inset form for use inside cards` |
| T4.5 | Claude Code | `FormGroup` 오류에 아이콘 14·role=alert·안정된 오류 ID. 필드의 aria-describedby/aria-invalid 연결은 소비자가 전달(design §9) | 기존 소비자 테스트 green + 오류 알림 역할·필드 연결·장식 아이콘 aria-hidden을 DOM 검사 | `feat(ui): make inline form errors accessible` |

## Phase 5 — 화면 (Claude Code · `/design-sync`)

| # | 담당 | 태스크 | 검증 | 커밋 |
|---|---|---|---|---|
| T5.1 | Claude Code | `messages/en.tsx` — 신규 문구(핸드오프 §12). **기존 키 재사용 가능성을 먼저 확인**. ⚠️ **A1**: `archive.archivedBy`는 `Archived on {date}`다 — 시안의 `by {name}`은 컬럼이 없어 쓰지 않는다 | `no-korean-ui.test.ts` · `brand-spelling.test.ts` green | `feat(i18n): add the project settings copy` |
| T5.2 | Claude Code | `General` 카드 — Thumbnail(56/radius 8/`object-contain`) · Name(320×36 + [Save]) · Address(읽기 전용 320, sans, [Copy] 없음) | 캔버스 `1a`·`1c`·`1d` 실측 일치 | `feat(settings): add the General card` |
| T5.2a | Claude Code | **T3.1a·T5.2 뒤**, 설정 미리보기·목록·Home·초대에 이미지 props·렌더를 연결한다. 목록은 `ProjectThumbnail.src`, Home은 `HomeTitle`을 거쳐 `src`로 전달한다. 초대의 `InviteProjectCard`에는 이미지 prop·렌더를 추가한다(현행은 `Box` 직접 렌더). URL이 null이면 각 화면의 기존 표시 유지 | DOM 테스트가 네 화면의 URL 전달·교체·null 표시를 단언한다. 브라우저에서 업로드→교체→삭제 후 네 화면을 다시 조회해 최신 이미지·삭제 반영 확인(C5). 초대의 이미지 배치·치수는 **캔버스 확인 필요** | `feat(settings): show project images across all four surfaces` |
| T5.3 | Claude Code | `Repository` 카드 — 건강성 일곱 갈래 + 브랜치 + **재인가 안내 한 줄 + `/account` 링크**. `GithubAccount`·`ReauthorizePrompt` import 제거 | 캔버스 `1e` 일곱 갈래 전부 · 설정 화면에 `GithubAccount`가 **없음**을 단언 | `feat(settings): fold the GitHub account card into a recovery hint` |
| T5.4 | Claude Code | `Translation sources` 카드 — 행마다 `planSurfaceImportStatus` · **T3.6의 키·언어 수**(D5) · 재시도 대상 하나 · 빈 상태. **독립 `Status` 카드 삭제**. ⚠️ **재시도 결과 문구는 행이 아니라 카드 수준 inset Alert다**(POSTMORTEM 2026-09-07 — `revalidatePath`가 행을 다시 그리며 방금 받은 결과를 지운다) | 캔버스 `1f` 다섯 갈래 · C7. design §1.1의 설치·보관·pending 결합 및 카드 수준 결과 유지 DOM 검증 | `feat(settings): move import status onto the source rows` |
| T5.5a | Claude Code | **T1.6 뒤·T5.5 전**, `FilesStep`에 `selection.locked`·`pending` 추가(design §7.1). 잠긴 체크박스는 체크+비활성, pending은 내부 Portal Select까지 직접 전달한다. 생략 시 기존 동작 유지 | DOM 테스트를 먼저 추가: 기존 단일·다중 선택 회귀, 잠긴 체크박스의 상태·마우스·키보드 토글 차단, pending 중 열린 Select를 포함한 입력 차단. 브라우저에서 동일 동작 확인 | `feat(onboarding): support locked selections and pending controls` |
| T5.5 | Claude Code | **T5.5a 뒤**, Add sources **모달 1024** — `FilesStep` `selection` 모드 재사용 · 이미 소스인 파일 체크+잠금 · `addSurfaces` 호출(잠긴 항목은 `picks`에서 제외). ⚠️ **D4라 실패 화면이 하나다** — "아무것도 추가되지 않았다" + 충돌 경로 목록이고, 모달은 **열린 채 선택을 유지한다**(닫으면 다시 고르게 된다) | 캔버스 `1h` · C4·C8·C8d. DOM 테스트가 잠긴 항목의 요청 제외와 실패 뒤 선택 유지·pending 해제·기존 소스 잠금 유지를 단언. `resource-limit` 거부에도 선택 유지·사유 표시 확인 | `feat(settings): add translation sources from a modal` |
| T5.6 | Claude Code | **T5.5 뒤**, `/surfaces/new`를 D3대로 redirect. 마지막 소비자 `add-surface.tsx`와 기존 `addSurface`·전용 결과 타입·전용 고아 구현을 같은 커밋에서 삭제한다. 다른 소비자가 있는 공용 헬퍼는 유지 | `pnpm typecheck`·`pnpm test` green, 참조 검색으로 삭제 대상 소비자 0 확인. OAuth 복귀가 모달에 도착 | `refactor(surfaces): retire the standalone add-surface page` |
| T5.7 | Claude Code | `CI integration` 카드 — 토큰(현행 그대로) + 워크플로 **모달 1024**(훅 안내 포함) + stale 줄 | 캔버스 `1g` · 카드 안에 `<pre>` 없음. 서버 첫 적재 후 stale 목록이 비어도 소스 추가 결과의 YAML 반영 안내가 남는 DOM 테스트(design §3.6) | `feat(settings): open the workflow file in a modal` |
| T5.8 | Claude Code | `Archive project` 카드 — 삼상태 Dialog(포커스 [Cancel]) · 보관된 프로젝트에서 **복원 카드가 첫 자리** + 나머지 컨트롤 비활성 + 사유 | 캔버스 `1i` · C1의 보관 상태 카드 다섯·복원 우선 순서를 DOM 단언 | `feat(settings): rework the archive card` |
| T5.9 | Claude Code | 반응형 — `PanelCard`에 `container-type: inline-size`, 640 분기. ⚠️ **임계값을 실제로 넘나드는지 브라우저로 잰다**(POSTMORTEM 2026-09-15) | 캔버스 `1b` · 640 전후 computed style | `feat(settings): respond to card width, not viewport` |
| T5.9a | Claude Code | **T4.3과 설정의 Card 소비자 전환 완료가 선행**. 설정의 마지막 Card를 PanelCard로 옮기는 Phase 5 커밋에 `components/ui/card.tsx` 삭제를 포함한다(이 행을 위해 삭제만 따로 미루지 않는다) | 삭제 전 참조 검색, 삭제 후 `pnpm typecheck`·`pnpm test` green. 활성/보관 카드 다섯의 이름·순서 및 locales 회귀 확인 | 마지막 설정 카드 전환과 같은 커밋 |

## Phase 6 — 검증·문서 (Claude Code)

| # | 담당 | 태스크 | 검증 | 커밋 |
|---|---|---|---|---|
| T6.1 | Claude Code | `/design-sync` 루프 — 수정→실측→리뷰를 일치할 때까지 | 캔버스 `1k` 교차 검증 표 전항목 | — |
| T6.2 | Claude Code | `/bugshot-qa` — 권한별 UI·거부 문구·입력값 유지. ⚠️ **설치 왕복은 로컬에서 못 밟는다** | 리포트 + 이슈 | — |
| T6.3 | Claude Code | `docs/PRODUCT.md` — §4.1에 썸네일·이름 수정 등재 · §7.7 IA 표의 `/surfaces/new` 행 · 소스별 적재 상태 | `/doc-check` 또는 `/push` 4단계 | `docs(PRODUCT): put the project thumbnail and rename in scope` |
| T6.4 | Claude Code | `docs/DESIGN.md` — §6.6 전면 개정 + §6.67의 "중복이 셋이 되면" 문단 갱신 + 새 raw 색 있으면 §6.2 등재 | 같음 | `docs(DESIGN): rewrite the project settings section` |
| T6.5 | Claude Code | `docs/DIRECTORY.md` — `components/ui/panel-card.tsx` 신설 · `card.tsx` 삭제 · `add-surface.tsx` 삭제 | 같음 | `docs(DIRECTORY): record the settings rework file moves` |
| T6.6 | Claude Code | `docs/ARCHITECTURE.md` — `addSurfaces`의 부분 성공 계약이 불변식 9의 새 소비자임을 적는다 | 같음 | `docs(ARCHITECTURE): record the multi-source add contract` |

## 손으로 돌리는 것 (`pnpm test` 밖)

- `pnpm test:projects:postgres` — `lib/surfaces/**`·`lib/import/**`·`app/(edit)/projects/**`가 움직인다
- `pnpm smoke:blob` — T2.3에서(T1.5·T2.1 뒤). ⚠️ `NODE_OPTIONS=--conditions=react-server`가 붙어 있다
- `/l10n-roundtrip` — **안 돈다.** 어댑터·export를 건드리지 않는다
