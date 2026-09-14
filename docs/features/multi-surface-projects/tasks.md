# Multi-surface projects — Tasks

## T17–T21 인계 체크포인트 (2026-09-14)

**구현·자동 검증·커밋까지. 원격 push 앞에서 중단하며 기능 완료로 통합·삭제하지 않는다.**

- [x] 착수 게이트: baseline `8511d37`(PR #40), 해당 SHA의 CI·Preview/Production 배포 success와
  dev/prod 각 19 migration을 직접 확인했다. 이전 완료 주장만으로 진행하지 않았다.
- [x] T17: NOT NULL·Locale PK·StringKey unique·Translation 복합 FK 교체와 writer 변경을 같은 커밋에 반영.
  locale 임시 ownership preflight 제거. 새 Surface 상태를 덮는 재백필 실행 0회.
- [x] T18: Project 잠금 후 인가·리포·경로 재검사, 표면 생성+첫 적재 원자성, 부분 실패 보존.
  동일 경로 동시 요청의 Project 잠금을 제거하면 P2002로 새어 red, 복원 뒤 path-conflict green.
- [x] T19: Settings 목록·고유 Add URL·수동 확인·결과 step·서명된 OAuth 복귀, 제품 not-found.
  셀 surfaceArchivedAt 생산과 선택기 경로 보조 줄, 추가 화면의 죽은 sidebar 링크도 수정.
- [x] T20 자동: typecheck·전체 Vitest **3,638 passed**·build·격리 PostgreSQL. PostgreSQL은 38 tests이며 실제 createProject
  Action도 실행한다. 기존 fixture가 ID를 직접 넣어 놓친 Prisma 기본 ID 누락을 브라우저에서 발견해 수정.
- [x] 다섯 adapter 계약, 동일 key/locale 공존·A/B push 격리·교차 FK 거부·다섯 쓰기 단계 rollback·예산 초과.
  40표면·20,000키/번역 EXPLAIN에서 목록·미발송 범위가 자연스럽게 새 복합 인덱스를 사용한다.
- [x] 브라우저 로컬 QA: 상주 QA 정상 재생성, 기존 903키 표면의 중복 추가 거부/입력 유지,
  4키 표면 추가·결과 유지, 두 표면 전환, Add 직접 진입·새로고침 draft 초기화·취소 Settings 복귀,
  제품 404 안내. 캡처: `/tmp/malmoi-add-surface-before.png`, `/tmp/malmoi-selector.png`, `/tmp/malmoi-surface-not-found.png`.
- [x] 실제 GitHub 읽기 전용 검증: base `e778cdbaed82b9a6d3651b320e7bf4c8313e3022`,
  namespaces 8파일 + _locales 3파일, 바이트 변경 0·경로 충돌 0·경고 0, 렌더/비교 100.57ms.
  DB/원격 쓰기 0이며 실물 PR 왕복의 대체 근거가 아니다.
- [x] T21: 정본의 현재 구현 경계·운영 순서·왕복 입력을 최신화하고 Codex 미러 동기화.
- [x] Claude Code 인계 검토(2026-09-14): 같은 체크아웃·HEAD 확인, 16커밋 전수 대조.
  **단계 B가 뗀 `Project` 열 여섯을 `scripts/smoke-github.ts`가 그대로 고르고 있었다** —
  `pnpm smoke:github`이 첫 쿼리에서 죽는데 게이트 넷이 전부 green이었다(`tsc`는 Prisma `select` 키를
  검증하지 않고 `scripts/`는 `pnpm test` 밖이다). red 테스트 → 기본 표면 조회로 수정 → POSTMORTEM.
  나머지 세 자리(트랜잭션 두 진입점의 근거 주석, 첫 적재의 `failed` 선계산 근거, 중복 adapter 검사)는
  표현 수정이다. 떨어진 컬럼·옛 복합키(`projectId_code`·`projectId_key`)·삭제된 관계의 전수 검색은 0건.
- [x] **비기본 표면의 workflow step 회수 경로**(2026-09-14 사용자 승인). Settings의 workflow 블록이
  `renderProjectWorkflowYaml`로 **활성 표면마다 step 하나**를 낸다. step 생산자는
  `renderSurfaceWorkflowStep` 하나로 모았고, 표면 행 → step 입력 변환은 `workflowSurfaceOf`가 받아
  6b-3의 대기 규칙이 화면 밖에서 측정된다. 실물 확인: dev DB의 QA 프로젝트가 `_locales`·`namespaces`
  두 step을 낸다.
- [x] **브라우저 게이트 셋**(2026-09-14, 로컬·dev DB, ego-browser):
  ① `reauthorize` → [Reconnect GitHub] → GitHub authorize → `/surfaces/new` 복귀, 후보 재탐지 정상.
  ② Settings → Add → 초안 입력 → 뒤로(Settings) → 앞으로: 초안이 초기화되고 화면은 정상.
  ③ 세션 쿠키를 지운 채 [Check files]: "Sign in again and come back" Alert + **입력 유지**, 쿠키 복원 확인.
  그 과정에서 결함 둘을 잡았다 — `checkout` 뒤 빈 줄 소실(테스트 3,657 green이었다)과
  Alert가 가리키는 버튼 이름 불일치. 둘 다 red→green + POSTMORTEM.
- [ ] 시안 대조: 미수행. 기존 T16의 시안 부재 판정을 새 화면의 통과로 재사용하지 않는다.
  ⚠️ **새 화면(Add surface·표면 not-found·Settings의 표면 카드)에도 Claude Design 핸드오프가 없다** —
  `/design-sync`의 SoT가 존재하지 않으므로 그 루프를 돌 수 없다. 시안을 만들거나, T16처럼 건너뛰기로
  판정하거나 둘 중 하나가 필요하다(사용자 결정).
- [ ] 실물 두 표면 push→각 편집→단일 PR→merge→두 표면 재push→값 유지→2층/1층 skip.
  이번 세션은 원격 push·태그·대상 workflow·prod 배포를 수행하지 않는다.

DB 현황: dev 20 migrations / drift 없음, Project 1·Surface 2·Translation 2,721.
`bugshot-i18n-test-qa`는 namespaces(903키/3언어)·_locales(4키/3언어)로 복구했고 보존한다.
prod는 19 migrations, Project/Surface/Translation 0. 단계 B migration 1건 pending은 의도된 상태다.
양쪽 null 자식·교차 key/locale FK·잘못된 기본 표면·공개 권한 0건.
**dev Preview는 아직 baseline 코드이므로 B writer 배포 전 쓰기 요청을 재개하지 않는다.**

Claude Code 인계 순서: 같은 체크아웃과 HEAD 확인(중복 cherry-pick 금지) → 전수 검토·필요 수정 →
dev `/push`/Preview SHA 검증 → 브라우저·시안 QA → `/merge` 1단계에서 prod B migration과 writer 동시 전환 →
태그 실제 생산 코드 확인/필요 시 릴리스 → 대상 workflow의 실제 surface/path-template 전환 → 실물 왕복.
모든 완료 조건을 충족한 뒤에만 기능 문서를 정본으로 통합하고 제거한다.

---

## T16 체크포인트 (2026-09-14)

아래는 배포 1 당시 기록이다. 이후 상태와 잔여 게이트는 위 T17–T21 체크포인트가 우선한다.
배포 1 시점에는 Add surface·단계 B·실물 다중 표면 왕복이 미진행이었다.

- [x] T1–T2: 정본 계약과 red 순수 인터페이스 테스트.
- [x] T3–T4: dev additive migration/backfill·drift·권한 검사, 실제 PostgreSQL과 하네스 계약.
- [x] T5–T9: 도메인·인가·필수 payload 생산자·표면 가드·push 격리.
- [x] T10–T13: 활성 표면 pull, 단일 snapshot/tree/commit/PR, 프로젝트 단위 run·skip 유지.
- [x] T14–T16: route 이관·legacy redirect·표면 범위 저장/집계·선택기·Home/목록 링크.
- [x] 수동 게이트: `/bugshot-qa` 5/5 통과 (2026-09-14, 로컬·dev DB). 시안 대조는 **건너뛴다** —
      이 화면들에 Claude Design 핸드오프가 없어 `/design-sync`의 SoT가 존재하지 않는다(사용자 판정).
- [x] push 게이트: typecheck·test 3,622·build green으로 dev 배포.

**QA에서 나온 결함 하나 — T17이 받는다 (2026-09-14, 이슈 미제출).**

존재하지 않는 표면 URL(`/projects/<slug>/surfaces/nope/translations`)이 **제품 문구 없는 빈 404**를 낸다.
셸 사이드바만 남고 본문은 Next 기본 `404 | This page could not be found.`이며(`main`의 `innerHTML` 47자,
`innerText` 빈 문자열) `app/not-found.tsx`가 리포에 없다.

⚠️ **T16이 연 경로다** — `git grep -n "notFound()" 99fd556`이 0건이다. `notFound()`는 이 기능이 처음
들여왔고, URL에 `surfaceSlug` 세그먼트가 생기면서 임의 값으로 도달할 수 있게 됐다. 그전
`/projects/<slug>/translations`는 slug가 틀리면 `requireProjectAccess`가 redirect로 처리했다.

⚠️ **표면 보관 UI는 2라운드다.** 이번 라운드는 직접 입력한 미지 표면의 복구 경로를 완성한다:
`getSurfaceAccess`의 거부 모양(이미 union 반환으로 고쳤다)과 `not-found` UI를 **한 벌로** 설계해야
같은 자리를 두 번 만지지 않는다. 이 리포의 거부 문구는 전부 `messages/en.tsx`를 지나며 "무엇을 하면
되는지"를 말하는데(`access`·`invite`·`connect` 사전) 이 화면만 사전을 안 지나고 돌아갈 길도 없다.

자리: `lib/surfaces/access.ts:14`(페이지 래퍼) · `app/(edit)/projects/[slug]/{translations,locales}/page.tsx`.

**검증 범위 보정:** 단계 A의 옛 Locale PK·StringKey unique 때문에 T15의 동일 key/locale 이름 공존은
실 DB에서 아직 불가능하다. 이번 PostgreSQL 검증은 이름이 다른 A/B의 격리와 교차 FK 거부이며,
동일 이름 공존은 T17에서 검증한다. 별도 PostgreSQL 스위트/include를 늘리지 않고 기존 integration 파일에 넣었다.
배포 1 old-writer 창의 재백필은 T17까지 미루지 않는다. `prisma/maintenance/backfill-surfaces.sql`의 실행 전제와
태그 호환성 전환은 OPERATIONS의 배포 1 절을 따른다. dev만 배포하고 prod는 별도 `/merge` 요청 전까지 유지한다.

최종 자동 검증: Vitest **3,622 passed / 0 failed**, `tsc --noEmit --incremental false` 통과,
격리 PostgreSQL **18 passed**, `sync:agents:check`·`git diff --check` 통과.
dev는 **19 migrations up to date / empty drift**, null 자식·null 기본 표면·새 테이블 공개 권한 모두 0.
`pnpm build`, push, 브라우저 시안 대조와 실물 다중 표면 왕복은 실행하지 않았다.

각 단계는 앞 단계의 검증이 끝난 뒤 진행한다. 스키마 변경은 `/db`, 순수 인터페이스는 `/tdd interface`, 구현은
`/implement`가 받는다.

**라운드 1이 이 문서의 범위**다(spec §0). 라운드 1 안에서도 **배포가 둘**이다 — `/db` 규칙(additive → 코드 배포 →
destructive)을 지키려면 제약 교체가 코드 뒤에 와야 하고, 두 번째 표면을 만들 수 있으려면 그 교체가 Add surface
앞에 와야 한다.

| 배포 | 커밋 | 무엇 |
|---|---|---|
| **배포 1** | Commit 1~6 | 문서·red 테스트 · 스키마 단계 A · surface 도메인 · push 격리 · pull 단일 PR · 편집 화면 이관 (Add surface 진입점은 닫힘) |
| **배포 2** | Commit 7~9 | 스키마 단계 B(제약 교체·옛 컬럼 제거) · 후보 하나짜리 Add surface · 전체 검증 |

**prod 마이그레이션 반영은 각 배포의 `/merge` 1단계다.** `/push` 시점으로 당기지 않는다.

⚠️ **postgres 스위트를 셋째로 만들지 않는다.** 기존 `vitest.projects.config.ts`의 include를 넓혀 쓴다 — 스위트를
늘리면 `pnpm test` 밖의 사각지대가 하나 더 생기고, POSTMORTEM 2026-09-10(1042행)이 정확히 그 모양이다.

---

# 배포 1

## Commit 1 — 제품·인터페이스 계약

### T1. 정본 변경 준비

- `docs/PRODUCT.md` §7.1을 "1 repository + N non-overlapping surfaces"로 갱신한다.
- `docs/PRODUCT.md` §7.3은 **유지**하고(탐지기 순위 그대로), 이 기능이 그것을 지킨다는 사실을 §7.1 옆에 적는다.
- `docs/PRODUCT.md` §3의 `pathTemplate` 항목에 "표면이 둘 이상일 때 선택기 보조 줄로 노출된다" 단서를 단다.
- `docs/PRODUCT.md` §7.8과 §10(한 리포 2프로젝트 secret 배선)을 이 기능의 결론으로 갱신한다.
- `docs/ARCHITECTURE.md` §0에 surface 경계를, §5.5.5의 409 표에 "표면 불일치" 행을, §7에 배포 2단계 근거를 올린다.
- `docs/DESIGN.md`에 표면 선택기 규칙(패널 머리 · 라벨은 마지막 경로 조각 · sans · 표면 하나면 안 그림 · 미발송
  배지)을 올린다.
- `docs/DIRECTORY.md`에 새 surface 모듈과 route 소유권을 등록한다.
- `CLAUDE.md`의 명령어 표와 `README.md`를 갱신한다 — `pnpm test:projects:postgres`가 **무엇을 단언하므로 언제
  손으로 돌리는지**를 그 줄에 쓴다(`lib/keys/**`에 더해 `lib/surfaces/**`·`lib/push/apply.ts`).
- 검증: `grep -rn "1 translation surface" docs/ README.md`가 0건이고, PRODUCT/ARCHITECTURE/DESIGN/DIRECTORY/
  CLAUDE 각각에 소유권·비중첩·프로젝트 단위 Publish·409·선택기 규칙의 필수 단언이 존재한다.

### T2. 순수 인터페이스 테스트

- `planSurfaceSlug`: 디렉터리형·파일형·글롭형 세 입력과 `-2`/`-3` suffix, 라우트 예약어 차단 테스트를 먼저 쓴다.
- `selectDefaultSurface`(탐지 1순위), `compareSurfaces`(키 추출 셋), `surfaceOwnership`(경로 중복 오류 모델),
  `planMultiSurfacePull`(평탄화), `renderSurfaceWorkflowStep`(pathTemplate 포함 결정적 YAML) 테스트를 먼저 쓴다.
- 검증: 새 테스트가 구현 부재로 red이고 각 실패가 목표 인터페이스 하나를 가리킨다.

**커밋 경계:** 문서 + red interface tests. 구현 코드 없음.
⚠️ **이 커밋 단독은 `pnpm test` red다** — `/push`는 배포 1의 전 커밋이 끝난 뒤에만 부른다.

## Commit 2 — 스키마 단계 A (additive + backfill)

### T3. TranslationSurface와 nullable FK 추가·backfill

- `TranslationSurface` 모델과 Project relation, `Project.defaultSurfaceId`, Surface `archivedAt`을 추가한다.
- Locale, StringKey, Translation에 nullable `surfaceId`를 추가한다. KeyRef는 기존 단일 컬럼 FK를 유지한다.
- 기존 Project마다 `default` 표면을 만들고 포맷·push 상태와 자식 행을 backfill하는 SQL을 작성한다.
- **옛 제약(Locale PK · StringKey unique · Translation unique)은 전부 그대로 둔다.** nullable 상태에서 가능한
  새 복합 unique/index/FK와 Surface별 `(projectId, surfaceId, ...)` 인덱스만 추가하고,
  `Translation(projectId, updatedAt)`는 유지한다.
- ⚠️ `prisma/__tests__/schema-contract.test.ts`의 "모든 `@@index` 선두는 projectId"가 새 인덱스에서 red가 될 수
  있다 — 선두를 `projectId`로 두어 통과시키고, 계약을 넓혀야 하면 그 변경이 의도임을 테스트에 적는다.
- dev 마이그레이션 SQL에서 테이블·시퀀스 기본 권한과 lock 범위를 검토한다.
- 검증: `/db`의 dev 적용·drift 통과, backfill 뒤 `surfaceId` null 행 0건, **새 테이블의 `anon`·`authenticated`
  권한이 0건**(`/db` 5단계 쿼리 출력에서 읽는다).

### T4. 인메모리 하네스와 스키마 계약 테스트

- `app/(edit)/__tests__/harness.ts`에 `TranslationSurface` 델리게이트와 새 복합 unique/FK 흉내를 넣는다.
  ⚠️ 소비자가 13개 + `app/api/__tests__/route-diagnostics.test.ts`다. **여기가 실제 제약보다 관대하면 이 라운드의
  Action·라우트 테스트가 새 제약을 원리적으로 재현하지 못한다**(POSTMORTEM 2026-09-05 356행).
- 기존 1프로젝트 데이터가 정확히 한 `default` 표면으로 이관되는 fixture를 고정한다.
- `vitest.projects.config.ts`의 include를 넓혀 surface 통합 테스트가 같은 실제 DB 스위트를 쓰게 한다.
- 검증: `pnpm test`, `pnpm test:projects:postgres` green, `harness.test.ts`의 계약 검사가 새 델리게이트를 센다.

**커밋 경계:** schema + additive migration + harness + schema tests. dev 적용은 `/push` 전, prod는 `/merge` 1단계.

## Commit 3 — surface 도메인과 인가

### T5. 순수 surface 모듈 구현

- T2의 slug/default/정렬/소유권/평탄화/YAML 판정을 구현한다.
- 클라이언트가 읽는 판정은 server I/O를 import하지 않는 잎 모듈로 둔다.
- 검증: T2의 red tests green, `components/__tests__/client-graph.test.ts` green.

### T6. 프로젝트 인가 뒤 surface 좁힘

- 페이지용·Action용 껍데기 둘을 만들고 모든 결과가 인가된 `projectId`와 `surfaceId`를 함께 반환하게 한다.
- 다른 프로젝트 표면 slug와 없는 slug와 비활성 slug를 같은 `notFound()`로 접는다.
- 검증: OWNER/EDITOR/비멤버/타 프로젝트/없는 표면/비활성 표면 인가 매트릭스 green.

**커밋 경계:** surface 순수 모듈 + 인가 껍데기 + tests.

## Commit 4 — push 격리

### T7. payload와 workflow 계약 확장

- `PushPayload`에 **필수** `surfaceSlug`를 추가하고 `z.infer` 타입을 **생산자 둘**에 붙인다:
  `lib/push/payload.ts`의 `buildPushPayload`, 그리고 ⚠️ **`scripts/push-local.ts`가 `/api/push/failure`로 보내는
  리터럴 페이로드**(수신부가 `lastImportError`를 쓰는데 그 컬럼이 Surface로 내려간다).
- composite action에 `surface`(**`action.yml` 기본값 `"default"`**)와 `pathTemplate` input을 추가한다.
  **서버 스키마는 필수를 유지한다** — `z.default`를 쓰지 않는다.
- `pathTemplate` 방어를 두 층에 건다: zod의 `lib/locale-code.ts` 경로 안전성 + 서버 등록값과의 `checkFormat` 대조.
- 첫 workflow와 추가 surface step renderer를 분리하고, **추가 step YAML의 줄 단위 대조 상대를 만든다**
  (지금 `lib/onboarding/__tests__/workflow.test.ts`는 `docs/ACTIONS.md`의 첫 ```yaml 블록만 읽는다).
- ⚠️ `docs/ACTIONS.md`의 예시 `concurrency` group이 하드코딩돼 렌더러와 다른 것을 함께 고친다.
- 검증: CLI·action·첫 적재·실패 보고·수동 workflow fixture가 모두 surface slug와 path template을 전달하고,
  `scripts/__tests__/workflow-pins.test.ts`(SHA 핀·태그) · `lib/onboarding/__tests__/workflow.test.ts`(줄 대조) ·
  `lib/pull/__tests__/sync-branch-consumers.test.ts`(action.yml ↔ 코드 ↔ 문서) 셋이 green이다.
- 검증: 경로를 조작한 `pathTemplate`이 **두 층 각각에서** 거부된다(한 층만 끄고도 red인지 확인).

### T8. push 인증·가드

- 토큰으로 Project를 정한 뒤 `(projectId, surfaceSlug)`를 조회한다.
- `checkFormat`, commit order, base 선언, import 상태를 Surface 기준으로 옮긴다. `checkFormat`은 **입력 타입만
  넓힌다**(새 이름을 만들지 않는다).
- 없는 표면·비활성 표면·타 프로젝트 표면을 **구별할 수 없는 409 하나**로 거부하고 본문에 표면 목록을 싣지 않는다.
- base 선언은 `baseChanged`가 참인 push에서만 해당 Surface 값을 비우고, 미소비 push와 다른 Surface 선언은 유지한다.
- 검증: 오배송·표면 교체·역행·누락·비활성 surface route tests가 **세 갈래의 상태 코드와 본문이 바이트 단위로
  같음**을 단언하고, A/B Surface의 선언 소비/유지와 pending 배너를 함께 고정한다.

### T9. applyPush surface 격리

- 모든 ORM/raw SQL 조건, unnest 열과 FK 입력에 `projectId` + `surfaceId`를 넣는다.
- orphan/unorphan, strict Translation overwrite, KeyRef 교체가 대상 표면만 바꾸게 한다.
- ⚠️ 이 커밋에서 **Project 옛 컬럼을 지우지 않는다.** 제거는 배포 2의 T17이다. 그때까지 Project 컬럼은 읽지 않을 뿐
  남아 있고, dual-write는 하지 않는다(backfill된 Surface 행이 정본이다).
- 검증: `lib/push/__tests__/flow.test.ts`의 SQL 인자 캡처가 **먼저 red**였고, unnest 컬럼 목록과 값 배열 개수가
  새 열 하나만큼 늘어난 것을 단언한다.
- 검증: A/B 표면 fixture에서 A push 전후 B의 네 모델과 상태 snapshot이 완전히 같다 (`pnpm test:projects:postgres`
  에서 실제 제약과 함께).

**커밋 경계:** 외부 계약 + push route/plan/apply + action + tests. 대상 리포 workflow는 아직 바꾸지 않는다.

## Commit 5 — pull과 단일 PR

### T10. 다중 표면 load/plan

- 표면을 slug 코드포인트 순으로 읽고 각 행을 surfaceId로 분리한다.
- 1층 skip은 **비활성 포함 프로젝트 전체** Translation 최대 `updatedAt`으로 유지한다(비활성만 편집된 프로젝트가
  매일 밤 1층을 깨우지 않게).
- 렌더 대상은 **활성 표면만**이다. 프로젝트 전체 `(projectId, updatedAt)` 인덱스와 Surface별 목록 인덱스를 각각 쓴다.
- **프로젝트 readiness를 "활성 표면 중 하나라도 첫 적재 성공"으로 다시 정의하고 한 곳이 소유한다.**
  소비자: `selectPullTargets`, `lib/onboarding/readiness.ts`, `lib/home/overview.ts`, `lib/projects/list.ts`.
- resolved path 소유 맵과 충돌 오류를 구현한다.
- 검증: 등록·DB 반환 순서를 섞은 property fixture에서 같은 plan과 같은 충돌 결과가 나온다.
- 검증: readiness 술어를 부르는 네 소비자가 **같은 함수**를 부르는 소스 스캔이 green이다.

### T11. 단일 snapshot·렌더·충돌 거부

- GitHub base snapshot을 한 번 읽어 각 표면 writer에 같은 원본을 제공한다. 표면 A의 결과를 B의 original로 넘기지 않는다.
- 충돌을 렌더 전에 거부하고, 변경을 path 코드포인트 순으로 평탄화한다.
- warning에 surface slug를 붙인다.
- 검증: 두 표면 변경이 tree 하나·commit 하나·PR 하나를 만들고, 표면 등록 순서를 뒤집어도 같은 tree SHA다.
- 검증: 같은 경로를 소유하는 두 표면이 GitHub write **전에** 실패하고 오류가 경로와 상대 surface를 든다.

### T12. skip 두 층과 해시 골든

- 기존 blob SHA, `base_tree`, parent, `[skip-malmoi-i18n]`, force branch, 열린 PR 재사용 함수를 그대로 쓴다.
- 검증: 모든 표면의 blob이 base와 같으면 stale sync branch를 base head로 되돌린 뒤 commit·PR 갱신 없이
  `skipped`이고, 성공 뒤에만 `lastPulledAt`이 전진한다.
- 검증: 즉시 재실행은 1층 GitHub API **0회**(`expect(calls).toEqual([])`), 값 불변 push 뒤 재실행은 2층 blob skip이다.
- 검증: `git hash-object`와 비ASCII fixture SHA가 일치하고 기존 adapter contract matrix green.
- 검증: 2표면 fixture의 렌더+비교 소요를 기록한다 — pull `maxDuration`이 60초이고 blob 동시성이 8 고정이라
  **읽고 쓰는 blob 수가 표면 합산으로 배가된다**. 측정값을 ARCHITECTURE에 남긴다.

### T13. SyncRun과 cron

- SyncRun은 프로젝트 단위로 유지하고 실패한 표면이 있으면 전체 run을 FAILED로 닫는다.
- cron target 수가 표면 수가 아니라 프로젝트 수를 계속 세는지 고정한다.
- 검증: 2표면 프로젝트 하나가 cron 결과 한 항목과 SyncRun 한 행만 만든다.

**커밋 경계:** pull load/plan/render/run + GitHub orchestration + tests.

## Commit 6 — 편집 화면 이관

### T14. route와 legacy redirect

- translations/locales를 `/surfaces/:surfaceSlug` 아래로 옮긴다. route 생성기는 `lib/routes.ts` 한 곳만 수정하고
  그 파일은 **import 0인 잎**을 유지한다.
- 기존 URL과 표면을 모르는 진입은 저장된 `defaultSurfaceId`로 redirect한다.
- ⚠️ **`lib/shell/nav.ts`의 활성 판정과 href를 함께 고친다** — 지금 `exact: false` 접두 매칭이라 새 URL에서 두
  항목이 항상 비활성이고, 표면 B에서 누르면 default A로 점프한다.
- ⚠️ **새 세그먼트가 `export const maxDuration = 60`을 든다** — 없으면 기본 300이 `STALE_AFTER_SECONDS`와 같아져
  정상 실행이 스스로를 stale로 본다.
- ⚠️ **`revalidatePath` 전수 확인**: `grep -rn "revalidatePath" app lib`의 각 자리가 이관된 화면을 덮는지 본다.
- 검증(자동): legacy URL이 `defaultSurfaceId` 경로로 redirect하는 **목적지 문자열**을 단언하고(`redirect` mock의
  `rejects.toThrow("redirect:/…")`), 비활성·없는 surface가 `notFound()`이며, `entry-points.test.ts`의 죽은 라우트·
  쿼리 수신자·진입점 인가 전수와 `lib/shell/__tests__/nav.test.ts`의 6구역 href가 green이다.
- 검증(수동): 직접 진입·새로고침·뒤로가기는 **`/bugshot-qa` 항목**이다. 이 리포에 e2e 프레임워크가 없어 자동으로
  판정할 수단이 없다.

### T15. 쿼리·저장 범위

- 번역, 로케일, 진행률을 projectId + surfaceId로 좁힌다.
- ⚠️ **미발송 술어 셋과 이웃 둘에 "비활성 표면 제외"를 동시에 넣는다** — `isUnpublished`(`lib/keys/view.ts`),
  `countUnpublished`·목록 raw SQL·신규 키 raw·`loadLocaleCounts`(`lib/keys/query.ts`).
- `saveTranslation`은 key·locale·surface의 소속을 같은 프로젝트 안에서도 다시 검증한다.
- ProjectMember 권한은 재사용하고 표면별 역할은 만들지 않는다.
- 검증: 같은 key/locale 이름을 가진 두 표면에서 한쪽 저장이 다른 쪽 값을 바꾸지 않는다.
- 검증: `pnpm test:projects:postgres`가 **세 술어가 같은 행을 세는지**를 실제 DB에서 확인한다. ⚠️ 그 스위트의
  기존 픽스처는 `pathTemplate`·`baseLocale`·`lastCommitSha`를 **Project 행으로 세우므로 먼저 red가 된다** —
  Surface 행으로 옮겨 고친다.

### T16. 표면 선택기와 프로젝트 단위 링크

- Translations·Locales의 **패널 머리**에만 현재 표면과 이동 목록을 둔다. 사이드바는 건드리지 않는다.
- 라벨은 마지막 경로 조각(sans), 전체 path template은 보조 줄·tooltip. **표면이 하나면 아무것도 그리지 않는다.**
- 각 항목 옆에 그 표면의 미발송 수 배지. Publish 버튼 문구는 `Send changes (N)` 그대로 둔다.
- 전환을 막지 않는다. **유효하지 않은 필터만** 떨어뜨리고, 선택기는 툴바·칩과 같은 pending·이동 함수를 공유한다.
- **Home의 최근 활동·로케일 진행률 링크와 `/projects` 목록 띠가 표면을 실어 정확히 보낸다.**
- 새 문구(선택기 라벨·배지·빈 상태)를 `messages/en.tsx`에 등재한다.
- 검증: 프로젝트 단위 화면에 selector가 없고, 1개/2개 Surface DOM, 필터 유지·폐기, 이동 중 툴바·칩 잠금,
  Tab·포커스 링·접근 이름 DOM tests green. `no-korean-ui`·`brand-spelling` green.
- 검증: Home의 두 링크와 목록 띠가 **해당 행의 표면 URL**을 만든다(생성 문자열 단언).

**커밋 경계:** routes + queries/actions + selector UI + tests. → 여기서 `/push` → `/merge`(배포 1).

---

# 배포 2

## Commit 7 — 스키마 단계 B (제약 교체)

### T17. NOT NULL·제약 교체·옛 컬럼 제거

- **재백필을 무조건 재실행하지 않는다.** 새 writer는 Surface만 쓰므로 옛 Project 값은 정본이 아니다.
  null 행·기본 포인터 불일치가 있으면 migration을 중단하고 소유권을 조사한다.
- 마이그레이션 안에서 사전조건을 검사한다: `LOCK TABLE` + `DO $$ … RAISE EXCEPTION 'precondition failed'`로
  `surfaceId` null 0건·모든 Project의 default 표면 1건·`defaultSurfaceId` 비어 있지 않음.
  (선례: `20260910060000_finalize_credential_storage`)
- `surfaceId`를 NOT NULL로 바꾼다.
- ⚠️ **순서**: `Translation_projectId_localeCode_fkey`를 먼저 DROP한 뒤 `Locale` PK를 교체한다. 먼저 안 지우면
  *other objects depend on it*으로 실패한다.
- `StringKey` unique/FK를 새 복합 제약으로 교체한다. ⚠️ **`Translation`의 `[keyId, localeCode]` unique는 바꾸지
  않는다**(design §2.2).
- 같은 커밋에서 코드를 함께 고친다: `lib/push/apply.ts`의 `ON CONFLICT ("projectId","code")`와
  `WHERE projectId AND key` UPDATE 3문, `app/(edit)/actions.ts`의 `projectId_code` 복합 선택자.
- Project의 이동 대상 컬럼(`adapterName`·`pathTemplate`·`nested`·`nestedByPath`·`baseLocale`·`declaredBaseLocale`·
  `lastCommitSha`·`lastCommitAt`·`lastImportStartedAt`·`lastImportError`)을 제거한다.
  ⚠️ 읽는 쪽이 전부 Surface로 옮겨진 것을 먼저 확인한다: `grep -rn "project\.\(pathTemplate\|baseLocale\|lastCommitSha\|adapterName\)" app lib scripts` 0건.
- 검증: 다른 project/surface의 key와 locale을 조합한 Translation이 FK에서 거부되고, 같은 키·locale code가 다른
  표면에는 공존한다 (`pnpm test:projects:postgres`).
- 검증: `pnpm typecheck`·`pnpm test`·`pnpm db:status` green, 새 테이블·컬럼의 `anon` 권한 0건,
  `EXPLAIN`에서 목록·미발송 쿼리가 **Seq Scan 없이 새 복합 인덱스를 탄다**.

**커밋 경계:** destructive migration + 그 제약에 매달린 코드. prod 반영은 `/merge` 1단계.

## Commit 8 — Add surface (후보 하나)

### T18. Add surface 서버 흐름

- 기존 repository snapshot과 detect/sample/confirm을 재사용하고 리포 선택·Project 생성·token 발급은 부르지 않는다.
- **후보 순위는 탐지기 순위 그대로**이고 키 수는 표시만 한다.
- slug는 마지막 디렉터리 조각 + 충돌 시 `-2`/`-3`, 라우트 예약어 차단.
- ⚠️ **`Project` 행 `FOR UPDATE` 락을 잡은 뒤에** 활성 표면을 다시 읽어 repository identity·경로 충돌을 재검사한다.
  GitHub 호출은 락 밖이다.
- 원자성 단위는 **표면 하나**다. 실패하면 그 Surface 행과 자식 넷만 롤백하고 **기존 표면은 건드리지 않는다.**
  한 표면 안의 일부 파일 실패는 현행 `partial-import` 그대로 드러낸다.
- 적재 예산은 표면마다 `readFiles` 호출 하나씩 각자 적용한다(합산 함수를 만들지 않는다).
- 검증: 후보/수동/0후보/예산 초과/경로 충돌/repo-replaced/부분 파일 실패/쓰기 단계별 실패/동시 요청 매트릭스가
  green이며, 각 실패 뒤 **새 Surface와 그 자식 행이 0건이고 기존 표면의 snapshot이 그대로**임을
  `pnpm test:projects:postgres`에서 확인한다.
- 검증: 동시에 같은 경로를 추가하는 두 요청 중 하나만 성공한다(락 없이는 red인지 확인).

### T19. Add surface UI

- Settings에 활성 Surface 목록과 **고유 URL을 가진** Add surface 화면을 만든다. 새로고침·직접 진입·OAuth 복귀가
  같은 서버 상태를 복원한다.
- 결과에는 새 token 대신 기존 workflow에 붙일 action step을 보인다.
- 새 세그먼트가 `maxDuration = 60`을 든다.
- 오류 뒤 현재 화면의 입력은 유지하되 새로고침하면 draft 없이 다시 탐지한다.
- 새 문구를 `messages/en.tsx`에 등재한다.
- 검증(자동): 선택·오류·결과 DOM tests, 진입 URL route test, `no-korean-ui`·`brand-spelling`·포커스 링 green.
- 검증(수동): 직접 진입·새로고침·취소·재시도와 실제 GitHub snapshot 흐름은 `/bugshot-qa` 항목이다.

**커밋 경계:** Add surface action + UI + tests.

## Commit 9 — 전체 검증

### T20. 전체 게이트와 실물 왕복

- `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:projects:postgres`를 통과한다.
- 다섯 adapter 계약을 모두 재검한다.
- action 태그의 **실제 생산 코드**를 확인하고 서버 필수 계약과 맞춘다. 2026-09-14 확인: 삭제된 옛
  `l10n-push-v1`(bc3615c4)은 surfaceSlug를 생산하지 않았고 새 `malmoi-i18n-push-v1`(8511d37)은 생산한다.
  무조건 태그를 옮기지 않는다. 필요 시 서버 배포 → 릴리스 검증 → 실제 등록 surface/path-template으로
  대상 workflow 전환 순서를 따른다. 이번 세션은 원격 작업 없이 인계한다.
- `/l10n-roundtrip`의 **전제 3("그 리포를 가리키는 Project가 하나뿐")을 개정**하고 스킬 입력에 surface/pathTemplate을
  추가한다. Codex 미러(`.agents/skills/source-command-l10n-roundtrip/SKILL.md`)도 같이 고친다.
- 폐기용 다중 표면 리포(`bugshot-i18n-test` — ts-dict 903키 + `_locales` 4키)에서 두 Surface push → 각 편집 →
  단일 Publish → PR 확인·merge → checkout 갱신 → 두 Surface 재push → 값 유지 → re-pull no-edits로 왕복한다.
- 기존 단일 표면 프로젝트의 legacy URL·workflow·Publish 회귀를 확인한다.
- 엣지 케이스를 이름으로 확인한다: 0키 표면 / 대량 키 표면 / `orphaned` 키·로케일이 표면 경계에서 집계되는 방식 /
  같은 키 이름이 두 표면에 있을 때 검색·refs / 세션 만료 중 저장 / 없는·비활성·타 프로젝트 표면 셋이 같은 409 /
  기본 표면이 가리키는 표면이 사라진 경우의 legacy URL.
- dev DB 점검 명령을 적어 둔다: `surfaceId IS NULL` 카운트, 부모와 다른 surface를 가진 자식 카운트, 활성 표면의
  resolved path 중복 — 셋 다 **0이어야 통과**다.
- 검증: `/l10n-roundtrip` 결과가 값·구조·표현·merge 뒤 1층 skip과 값 불변 push 뒤 2층 skip을 모두 통과한다.

### T21. 문서 신선도

- PRODUCT, ARCHITECTURE, DESIGN, DIRECTORY, ACTIONS, CLAUDE.md, README와 workflow 예시를 실제 구현에 맞춘다.
- 프로젝트/표면 용어와 Publish 소유권이 문서마다 같은지 대조한다.
- 검증: `pnpm sync:agents:check`와 변경 문서 신선도 검사 통과.

**커밋 경계:** 검증에서 드러난 기능 범위 수정 + 정본 문서. → `/push` → `/merge`(배포 2).

---

# 라운드 2 (후속, 별도 문서로 연다)

- **다중 후보 선택**: `components/ui/checkbox.tsx` 신설(Radix). Checkbox와 텍스트 영역 button이 **형제**이고
  접근 이름이 둘(`Include {path}` / `Preview {path}`), 선택 배경은 상세만 말한다. 초기 체크는 **1순위 하나**.
  ⚠️ 부수 계약: 프리미티브 19→20(DESIGN §6.4), `radix-ui` 소비 목록, `focus-ring.test.ts`의 `RADIX_FIXTURES` 등재
  (Radix는 소스 스캐너가 못 본다), `slottable-item.test.ts`, 16px 상자 안 체크 글리프의 아이콘 치수 예외.
  ⚠️ ②의 후보 행은 Claude Design 핸드오프가 px까지 고정한 자리이고 시안에 "체크됨 ≠ 상세"의 표현이 없다 —
  **시안 갱신 + `/design-sync` 라운드가 태스크에 들어간다.**
- **비활성화와 되돌리기**: `archivedAt` 기록/해제를 같은 목록에서. 확인 Dialog의 세 문장(되돌릴 수 있다 /
  workflow step을 지우지 않으면 다음 CI push가 409 / 미발송 N건이 비활성 동안 빠진다)은 **실제 조회한 값**을 싣는다.
  기본 표면을 비활성화하면 slug 알파벳순 첫 활성 표면으로 `defaultSurfaceId`를 같은 트랜잭션에서 바꾼다.
- **다중 표면 첫 적재의 시간 예산**: 표면 N개를 한 화면에서 만들 때 `maxDuration` 안에 드는지 실측한다.
