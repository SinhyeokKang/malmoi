# tasks — Projects 목록 재설계

**순서는 순수 함수 → 조회 → UI다.** 역순은 테스트 못 하는 코드를 먼저 쌓는 것이다.
⚠️ **기존 결정은 design §9에 있다.** 검수에서 새 키의 정의·첫 pull 전 처리·기존 키 backfill은 확정했다.
CI 파싱 실패 포함과 GitHub 조회의 보관 제외·전수 조회·동시 프로젝트 최대 3개도 확정했다.
Summary 네 항목에서도 보관 프로젝트를 제외하며, 보관 행·Meter·목록 총계는 유지한다.
대기·설정 안내 문장은 좁은 화면에서 남은 폭으로 줄여 우측 상태 배지를 보존한다.
문서 정확성 오류는 일괄 반영했고, Meter의 추가 스크린리더 설명은 사용자 결정으로 제외했다.
이번 검수의 항목별 결정은 모두 끝났다.
**T0b(스키마) → T0c(임포트 기록)** 순서를 지키며 T0c·T3(집계)·T3b(원격)가 T5의 입력이다.
T1 → T2 → T3 → T3b → T4 → T5 → T6 → T7 순서로 검증한다.
T8의 계약·시각 규칙 갱신은 해당 구현 전에 먼저 수행하고, 디렉터리 문서는 파일 추가와 함께 갱신한다.

각 태스크의 `검증:`이 그 태스크의 완료 판정이다. `커밋:`이 `/ship`이 지키는 경계다.

---

## T0. 확정된 설계 입력 (2026-09-13 사용자)

확정한 답은 `design.md` §9의 표에 있다. 주요 구현 범위는 아래와 같다:
**additive 마이그레이션 셋(T0b)** · **원격 신호 전수 조회(T3b)** · **DESIGN §6.63 치수표(T8)**.

---

## T0b. 마이그레이션 셋 — `/db`

- `StringKey.createdAt DateTime @default(now())` + **backfill**:
  기존 키는 `COALESCE(Project.lastPulledAt, Project.createdAt)`으로 채운다.
  기존 키를 초기 기준으로 취급하며 실제 생성 시각을 복원하지 않는다.
  pull 이력이 없는 프로젝트는 승인된 정의에 따라 활성 키 전체를 센다.
- `Project.lastImportStartedAt DateTime?` · `Project.lastImportError String?`.
- 스키마·마이그레이션만 이 태스크에서 변경한다. 쓰기 구현·테스트는 T0c가 맡는다.

**검증**: `pnpm db:migrate` 뒤 `pnpm db:status` · 기존 키의 backfill 값이
`COALESCE(Project.lastPulledAt, Project.createdAt)`과 다른 행이 0 ·
`lastCommitAt > lastPulledAt`인 기존 프로젝트도 backfill 직후 신규 집계 0 ·
첫 pull 전 프로젝트는 활성 키 전체(키가 없으면 0)를 집계.
**커밋**: `feat(db): record key creation and last import outcome` (스키마 + 마이그레이션만)
⚠️ **프로덕션 반영은 `/merge` 1단계다.**

---

## T0c. 임포트 기록 — CI 파싱 실패 보고 포함

T0b 뒤에 수행한다. **계약·상태 전이 테스트를 먼저 작성**하고 `design.md` §3.35를 구현한다.

- `lib/projects/import-status.ts`(신규): 제한된 실패 보고 스키마, 대표 오류 코드 판정,
  완전 성공·부분 실패·실패 판정과 표시 문구의 코드 계약. I/O 없는 순수 함수로 둔다.
- `lib/projects/import-status-store.ts`(신규): 인가된 프로젝트의 진행·결과 기록.
  실패 보고는 id·토큰 해시·보관·커밋 시각 조건을 UPDATE에서도 확인하며 기준 커밋은 전진시키지 않는다.
  서버 적재 종료는 자기 시작 시각을 대조해 다른 실행의 진행 표시를 지우지 않는다.
- `app/api/push/failure/route.ts`(신규): 기존 프로젝트 Bearer 인증 → 제한된 본문·Zod 검증 →
  조건부 실패 기록. 상태만 쓰며 정상 push 페이로드나 GitHub 자격증명을 요구하지 않는다.
- `scripts/push-local.ts`: 토큰·slug·커밋 확보 후 탐지·조립 예외와 `read.errors`를 종료 전에 보고한다.
  요청 5초 제한·재시도 없음. 보고 실패에도 기존 진단·exit 1 유지, 실패 시 정상 `/api/push` 무호출.
  CLI 동작은 실행 가능한 테스트 하네스에서 가짜 HTTP 서버와 잘못된 JSON fixture로 검증한다.
- `/api/push`와 `runFirstIngest`: 인증·가드 통과 후 진행 기록, 모든 조기 실패 반환과 부분 실패 기록.
  `applyPush`에 완전 성공/부분 실패 결과를 전달해 데이터와 오류 해제·보존을 같은 트랜잭션에서 확정한다.
  기존 호출부와 flow 테스트를 모두 갱신한다. 신규 키의 `createdAt`은 INSERT에서만 채우고
  기존·복구 키의 별도 UPDATE에서는 보존한다.
- OWNER 설정 화면: 저장된 실패 코드를 조회해 안전한 사유와 복구 안내를 렌더한다.
  첫 적재 대기면 기존 재시도, 이미 적재됐다면 CI 수정·재실행을 안내한다.
  `View details`는 OWNER만 노출하고 EDITOR에는 OWNER에게 연락하라는 문구를 표시한다.
- 이 태스크가 사용하는 실패 문구는 `messages/en.tsx`에 같은 커밋으로 추가한다.
- 결과 기록 후 `/projects`·`/projects/new`·해당 설정을 무효화한다.
  CI와 서버 간 새 계약은 T8 문서 갱신 및 T9 릴리스 의존성까지 포함한다.

**검증**: `pnpm test` + `pnpm typecheck` — 무효 토큰·오배송·보관·잘못된 본문 거부 및 무변경,
오래된 실패와 새 성공의 경쟁에서 조건부 UPDATE 거부, 같은 커밋 실패 수락,
정상 보고·404·타임아웃 모두 원래 CLI exit 1 유지, 보고 본문에 파서 원문·토큰·소스 문자열 없음,
완전 성공 시 오류 해제와 데이터 적재의 원자성, 부분 실패 코드 보존, 타 실행 진행 표시 보존,
신규 INSERT의 createdAt 입력 및 재push·복구 UPDATE의 createdAt 보존.
수동 확인: CI 파싱 실패 → 목록 → OWNER 설정의 사유 표시, EDITOR 링크 비노출,
파일 수정 후 push 성공 → 실패 띠 해제. 코드 없는 초기 데이터에서도 첫 적재 실패 문구가 보인다.
**커밋**: `test(projects): pin import failure reporting and outcome transitions` →
`feat(projects): report CI parse failures and persist import outcomes`

---

## T1. 필터 축 제거 — 순수 함수 · 라우트 · 문구

- `lib/projects/list.ts`에서 `PROJECT_FILTERS`·`ProjectFilter`·`parseProjectFilter`·`filterProjects` 삭제.
- `lib/routes.ts`의 `projects`·`newProject`에서 `filter` 인자 삭제.
- 목록·모달·OAuth 복귀 경로 갱신(`design.md` §1.2) — **한 커밋에서** (POSTMORTEM 2026-09-05).
  `lib/github-connect/state.ts`의 새 프로젝트 복귀 상태에서 filter를 제거하고 기존 state의 q는 보존한다.
- `m.projects.filter.*`·`narrowed.byFilter` 삭제, `narrowed.reset` → `Clear search`.
- `lib/projects/__tests__/list.test.ts`의 해당 블록 삭제, `projects-query.test.tsx:26`·
  `lib/__tests__/routes.test.ts:11` 갱신.
- `components/__tests__/projects-screen.test.ts`의 filter 판정 단언은 이 태스크에서 제거하고,
  탭 링크 단언은 `components/projects/search-input.tsx`를 직접 읽는 검색 라우트 검사로 바꾼다.
  `entry-points.test.ts` 및 OAuth state·callback·모달 복귀 테스트도 같은 변경에 맞춘다.

**검증**: `grep -rn "parseProjectFilter\|filterProjects\|PROJECT_FILTERS" app components lib --include="*.ts*" | grep -v __tests__` → **0건** ·
`pnpm test` + `pnpm typecheck` green · `/projects?filter=active`가 전체 목록을 준다(리다이렉트 없음) ·
검색한 상태에서 모달 열기·닫기·OAuth 복귀 후 q 유지, 예전 filter 무시.
**커밋**: `refactor(projects): drop the six filter tabs and the ?filter= query`

---

## T2. 판정 순수 함수 — `/tdd`가 먼저 (red)

`lib/projects/list.ts`에 `design.md` §4의 여섯을 테스트 먼저 박는다.

- `projectGroup` — `design.md` §5 상태표의 유효 행과 1:1. 삭제한 Editor 전용 행을 세지 않는다.
- `rowBanner` — 보관이면 항상 null, 나머지는 우선순위(끊김·실패가 덮고, 발송 > 원격 변경 > 검토),
  겹칠 때 **하나만**. 역할별 링크는 T5 렌더 테스트가 담당한다.
- `meterSlot` — `setup`·`awaiting_first_sync`가 바를 그리지 않는다(0% 바를 금지하는 것이 계약이다).
- `rowLocaleProgress` — base 먼저 → 코드순 → **`slice(0,3)`** · `percent` **내림**.
  `percent`는 done/total이며 review를 완료로 세지 않는다. 분모 0이면 비율 0이다.
- `summaryQueue` — 검색 전 전체 멤버십 중 **보관하지 않은 프로젝트**의 네 값 합.
  `New from GitHub`는 **마지막 pull 이후 추가된 활성 키**이며,
  마지막 pull이 있으면 `orphaned = false AND createdAt > lastPulledAt`으로 센다.
  첫 pull 전에는 활성 키 전체를 센다. 기준 시각 전·동일·후, orphaned 제외,
  `lastPulledAt = null`일 때 활성 키 전체 및 빈 키 목록 0을 검증한다.
  전체 활성 로케일로 미번역·검토 수를 계산하며 Meter 3개 제한을 집계에 적용하지 않는다.
  orphaned 로케일의 셀, 빈 값, 키 0, 로케일 0, 59개 로케일을 포함한다.
  활성+보관 혼합에서 보관분이 네 값 모두에서 빠지고, 보관 프로젝트만 있으면 네 값 모두 0인지 검증한다.
- `groupProjects` — trim 후 질의가 있으면 `flat: true`, 공백만이면 그룹 목록.
  검색 전 Summary와 총계는 동일하고 입력 배열을 변경하지 않는다.

⚠️ **`projectStatus`·`searchProjects`는 손대지 않는다** — 기존 테스트가 그대로 green이어야 한다.
⚠️ **`lib/projects/list.ts`는 잎이어야 한다**(`client-graph.test.ts`).

**검증**: `pnpm test` — 새 스위트가 red → green, 기존 `list.test.ts` 잔여 블록 green.
**커밋**: `test(projects): pin grouping, banner priority, and meter slot rules` → `feat(projects): decide row group, banner, and meter slot`

---

## T3. 집계 조회 — 왕복 수가 상수다

`lib/keys/query.ts`에 `loadProjectListAggregates(prisma, projectIds)`.

- `design.md` §3.1의 ①②③ + §3.2의 **신규 키 raw ④·미발송 raw ⑤**, 다섯을 `Promise.all`로 병렬 실행.
- `loadProjectList`의 멤버십 조회에 서버 내부 id·원격/상태 판정 입력을 추가하고 집계·원격 조회를
  연결한다. 원격 판정의 전체 저장 로케일 code도 서버 입력으로 읽는다.
  멤버십 0건이면 둘 다 무호출이며, `loadMemberships`를 넓히지 않는다.
- Prisma 조회는 `projectId: { in: ids }`, raw는 파라미터화한 `ANY(ids::text[])`로 좁힌다.
  `ids`는 `loadProjectList`가 인가한 집합 하나다. 문자열 연결·unsafe raw는 금지한다.
- ③을 ①의 전체 활성 (projectId, code)로 먼저 걸러 집계한다. ⑤의 미발송 술어는 그대로 유지한다.
- ①②③은 보관 행의 Meter를 위해 전체 멤버십으로 조회한다. Summary 접기와 raw ④⑤는
  `Project.archivedAt === null`인 프로젝트만 포함한다. 목록 제목·그룹 카운트는 이 필터를 적용하지 않는다.
- 미발송 술어는 `countUnpublished`·`isUnpublished`와 **같은 문장**이고, 세 자리가 서로를 주석으로 가리킨다.
- ⚠️ **`loadMemberships`를 넓히지 않는다**(셸이 매 페이지에서 부른다).
- ⚠️ **`ProjectListRow`에 `Project.id`를 싣지 않는다** — 서버 안에서만 쓴다.
- raw SQL 결과의 동일성은 격리 Postgres에서 검증한다. 기존 credentials 통합 테스트의 로컬
  임시 클러스터 패턴을 참고해 `lib/keys/__tests__/list-aggregates.integration.ts`와
  `vitest.projects.config.ts`, `package.json`의 `test:projects:postgres` 명령을 추가한다.
  기본 `pnpm test`와 분리하고 공유 dev/prod 접속 변수는 읽지 않는다. 기존 credentials 스위트는 수정하지 않는다.

**검증**: `pnpm test` + `pnpm typecheck` — 프로젝트 1개와 5개 모두 멤버십 1+집계 5회,
0개는 멤버십 1회만 · 타 프로젝트·orphaned 로케일 제외, 59로케일 전체 집계, 조회 결과 없는 수치 0.
**별도 검증**: 신규 `pnpm test:projects:postgres` — 같은 DB fixture에서 ⑤와 `countUnpublished` 및
행별 `isUnpublished` 합 일치(보관하지 않은 프로젝트에서 저자 null·시각 전/동일/후·첫 pull 전 포함),
④와 보관 제외 활성 키 기준 집계 일치, 보관 프로젝트의 ④⑤ 기여 0.
가짜 클라이언트의 호출 수 검사만으로 raw SQL 결과가 맞다고 판정하지 않는다.
**커밋**: `feat(projects): aggregate locale progress and queue counts in one round per axis`

---

## T3b. GitHub 전수 조회 — 보관 제외, 동시 프로젝트 최대 3개

`lib/projects/remote.ts` (신설) — `loadRemoteSignals(projects)`.

- 보관 프로젝트를 제외한 전체 목록을 처리한다. 프로젝트 작업은 동시에 최대 3개이며,
  하나가 끝나면 바로 다음 작업을 시작한다. 입력 목록을 3개로 자르거나 3개 묶음 전체를 기다리지 않는다.
- 프로젝트 안에서는 `GET /compare/{lastCommitSha}...{baseBranch}`와 `GET /pulls/{n}`을 병렬 호출한다.
  마지막 커밋이 없으면 compare를, PR 번호가 없으면 PR 조회를 생략한다.
- 신규 `lib/projects/remote-plan.ts`의 `changedLocaleFileCount`를 테스트 먼저 작성한다.
  `design.md` §3.4대로 변경 경로만 매칭하고 저장 경로와 신규 탐지 경로를 합친다.
  rename의 이전·새 경로 중 하나가 매칭되면 파일 레코드당 한 번, 일치 0이면 정상 0이다.
  `resolveLocalePaths`를 필터로 쓰지 않고 `list.ts`에 어댑터 import를 추가하지 않는다.
- 보관·설치 ID 없음·`repositoryId` 없음·조회할 신호 입력 없음이면 **호출하지 않는다**.
  행 자체는 목록에서 제거하지 않는다.
- 클라이언트는 `createGitClient`(installation 토큰) — ⚠️ user-to-server 토큰을 쓰지 않는다.
- `lib/pull/client.ts`·`lib/github.ts`·fake에 필요한 compare/PR 조회 계약을 테스트 먼저 추가한다.
  클라이언트는 프로젝트당 한 번 생성하고, 토큰 발급·리포 확인부터 완료까지 동시 작업 수에 포함한다.
- 실패는 **값으로 흐른다**(`lib/failure.ts`) — 해당 띠만 빠진다.

**검증**: `pnpm test` — 실패 주입 시 목록이 여전히 렌더되고 `pr_open`·`repo_ahead`만 사라진다 ·
`credential-separation.test.ts` green · 보관 제외 10개 모두에 신호 입력이 있으면 신호 호출 20회,
클라이언트 생성·토큰 발급·리포 확인은 별도 집계 · 제어 가능한 promise로 실행 중 프로젝트 최대 3개,
하나만 완료해도 다음 작업 시작, 실패 후에도 나머지 전부 처리, 완료 순서와 무관한 결과 매핑 검증 ·
보관 프로젝트와 입력 없는 신호 요청 0. 제한 테스트에 실제 시간 대기는 쓰지 않는다.
경로 fixture: README만 변경 0, 신규 fr 로케일 추가·기존 로케일 삭제 각 1,
rename 진입·이탈·내부 이동 각 1, 중복 locale 자리 불일치 0, multi-locale 불일치 0,
숫자·긴 코드의 저장 로케일 경로 유지, main이 아닌 base 문구.
**커밋**: `feat(projects): read remote drift and pull request state for the list`

---

## T4. Meter 컴포넌트 — 시안 치수 그대로

`components/projects/locale-meter.tsx` (서버 컴포넌트).

- `design.md` §11.3의 Meter 블록을 **리터럴 그대로**: `w-25` · `gap-1.5` · `h-1` · `rounded-full` ·
  `bg-foreground/[0.08]` · `bg-foreground/85` · `bg-amber-500`. 국기 치수·radius는 `LocaleFlag`가 소유한다.
- 폭은 `style={{ width }}`로만 준다(퍼센트는 데이터다).
- 국기는 **`LocaleFlag`를 재사용한다**(`components/translations/locale-badge.tsx`) — 리포에 253개가
  이미 있고 매핑은 `flagFor`(잎)다. 치수·radius가 시안과 이미 같다(`design.md` §11.35).
  **결정할 것이 없다** — 새 자산도, 새 매핑도, `rounded-[2px]`도 만들지 않는다.

**검증**: `pnpm test`(치수 리터럴 소스 검사) · 브라우저에서 바 높이 4 · 칸 100 실측.
**커밋**: `feat(projects): add the locale meter`

---

## T5. 목록 본문 재조립

`components/projects/project-list.tsx`.

1. 머리: 검색을 제목 줄로 올리고, 둘째 줄을 Summary로 교체(`design.md` §11.3).
2. 본문: 그룹 셋 + 그룹마다 카드. 검색 중에는 결과 줄 + 평평한 목록.
3. 행: §11.2의 P1~P6 + §11.3의 행 블록. `divide-y`를 버리고 행마다 `border-t`.
4. 띠: 행의 **형제**로. 링크는 하나까지. ⚠️ **역할로 갈리는 것은 `Reconnect`·`Continue setup`·`View details` 셋**이고
   (`project:settings`) 그 판정은 호출부가 `row.role`로 한다 — `rowBanner`는 역할을 안 받는다.
5. 빈 상태 둘: `1a`는 KV 합성(검색·Summary·머리 버튼을 그리지 않는다), `3b`는 `EmptyState` + 액션 둘.
6. `?e=` Alert는 제목 줄 **아래** · Summary **위**.
7. 본문이 참조하는 신규 `messages/en.tsx` 키는 이 태스크에 함께 추가한다. T0c의 실패 문구는 재사용한다.
8. 번역 저장·Publish·push 후 목록 두 경로가 새 집계 소비자라는 점을 무효화 범위에 반영한다.
   주기적 캐시와 쓰기 후 `revalidatePath`를 혼동하지 않는다.

⚠️ **`/projects/new`가 같은 본문을 그린다** — props가 바뀌면 그 페이지도 같은 커밋에서 움직인다.
⚠️ **`"use client"`를 만들지 않는다**(`projects-screen.test.ts:36`).
⚠️ **`<form>`을 만들지 않는다** — 검색은 `SearchInput` 그대로(POSTMORTEM 2026-09-08).

**검증**: `pnpm test` + `pnpm typecheck` — T1에서 교체한 필터 검사를 제외한 기존 화면 계약 유지.
신규 소스·렌더 검사: Summary 링크 0, 그룹·검색 평면 목록, 제목→Alert→Summary 순서,
상태별 빈 화면·실패/부분 실패 띠, OWNER/EDITOR 링크 차이, 중첩 링크 없음, 치수 리터럴 전수.
수동 확인: 번역 저장·Publish 뒤 목록 및 새 프로젝트 모달 배경으로 복귀해 Summary·Meter·띠 최신성.
보관하면 Summary에서만 해당 수치가 빠지고 보관 행·Meter가 남는다. 보관 해제하면 Summary에 복귀한다.
보관 프로젝트만 있어도 목록·검색·Summary 0을 유지하며 프로젝트 0건용 빈 화면을 그리지 않는다.
**커밋**: `feat(projects): group the list, add summary queues and row banners`

---

## T6. 스켈레톤 · 문구 · 폭 축소

- `loading.tsx`: 제목 줄 · **Summary 넷** · 그룹 헤더 · 행 둘. `motion-safe:` 유지.
- 문구는 사용하는 T0c·T5에서 이미 추가한다. 이 단계에서는 스켈레톤·검색 상태 문구 누락을 확인한다.
- 폭 축소: `@container` + `nth-child` 숨김(§6). 1120 / 940 / 760.
- Meter 대체 문장도 `w-[332px] min-w-0 shrink truncate`로 축소 가능하게 만든다.
  넓은 화면의 332px, 이름 칸 420px, 우측 배지·화살표 폭은 유지하고 문구는 DOM에 온전히 남긴다.

**검증**: `pnpm test` green · 컨테이너를 1000·840·680으로 줄여 Meter가 2·1·0이 되는지 실측 ·
940 미만에서 남는 하나가 **base 로케일**인지.
추가 실측: 840·680px의 setup·첫 적재 대기·진행·실패 행에서 가로 overflow 0,
우측 상태 배지·화살표가 카드 안에 보이고 키보드 포커스 링이 잘리지 않음.
**커밋**: `feat(projects): match the skeleton to the new layout`

---

## T7. 시안 대조 게이트 (`/bugshot-qa`)

`design.md` §11.5의 네 항목을 실제로 돌린다 — 소스 검사 · 넓은 화면 실측 · 캔버스 비교 · 좁은 화면 문장 검증.

**검증**: 실측값이 캔버스 값과 같다(승인된 검색 폭 256px 예외는 design §9-H 적용).
임포트 실패 문구·Editor 권한 등 승인된 제품 계약은 시안보다 우선한다. 그 밖의 차이는 T5로 돌아가 수정한다.
**커밋**: 없음(리포트). 발견된 이탈의 수정은 T5 커밋에 들어간다.

---

## T8. 문서 갱신

| 문서 | 무엇 |
|---|---|
| `docs/PRODUCT.md` §7.7 | "필터는 쿼리 상태다" 문단에서 **목록의 `?filter=`를 뺀다**(`?q=`만 남는다) |
| `docs/PRODUCT.md` §7.9 | 보관 프로젝트의 행·Meter는 유지하고 목록 Summary 네 항목에서는 제외하는 계약 |
| `docs/DESIGN.md` §6.4 | 빈 상태 예외 둘(0건 KV · 결과 0건 액션 둘) |
| `docs/DESIGN.md` §6.2 | 미등재 색 둘(`red-800` 실패 띠 · `amber-700` Summary `To review` 아이콘) 등재 |
| `docs/DESIGN.md` §6.63 | **이 화면의 치수표**(design §11) — 420 · 200 · 100 · 332 · 1120/940/760 · radius 4 · 바 4 · 검색 폭 예외(H) · 대체 문장의 축소·말줄임(I). 기능 디렉터리는 끝나면 지우므로 **여기가 정본이 된다** |
| `docs/PRODUCT.md` §4.1 | `SyncRun` 항목에 한 줄 — 임포트 결과는 당분간 `Project` 컬럼 둘이 든다(이력이 아니다) |
| `docs/ARCHITECTURE.md` | `/api/push/failure`의 토큰 인가·조건부 쓰기·수신 순서 의미·부분 실패와 성공 원자성 |
| `docs/ACTIONS.md` | CI 파싱 실패 보고 계약·5초 제한·보고 실패에도 기존 red 유지·서버와 Action 릴리스 순서 |
| `docs/DIRECTORY.md` | `components/projects/locale-meter.tsx` · `lib/projects/remote.ts` · `lib/projects/remote-plan.ts` · `lib/projects/import-status.ts` · `lib/projects/import-status-store.ts` · `app/api/push/failure/route.ts` · 신규 테스트·`vitest.projects.config.ts`·격리 Postgres 검증 명령 |

⚠️ **문서별 별도 커밋**(`docs(PRODUCT): …` 꼴).
**검증**: `/doc-check` 또는 `/push` 4단계.

---

## T9. 실패 보고 계약 릴리스 — 서버 선배포 후 Action

- dev 마이그레이션 → 서버 preview 검증 → prod 마이그레이션과 서버 배포 → 검토된 Action 버전 릴리스 →
  대상 리포 참조 적용 순서다. 새로운 endpoint가 먼저 준비돼야 한다.
- `@l10n-push-v1`을 쓰는 대상은 서버 배포만으로 새 스크립트를 받지 않는다. 기존 불변 태그를
  임의로 옮기지 않고, 릴리스 절차에 따라 새 버전과 소비자 참조를 반영한다.
- 원격 push·merge·태그·소비자 참조 변경은 Claude Code에서 수행한다. 이 검수에서는 실행하지 않는다.

**검증**: 기존 Action의 정상 push 유지, 새 스크립트→옛 서버에서 보고 404와 원래 exit 1 유지,
새 서버+새 Action을 적용한 폐기용 리포의 잘못된 JSON이 목록에 실패로 표시되고 수정 후 성공하면 해제.
**커밋**: 릴리스 창구에서 버전·소비자 변경 범위별로 처리. 문서 검수 커밋에는 포함하지 않는다.

---

## 이 사이클에서 하지 않는 것

- **push를 `SyncRun`에 넣는 것** — 임포트 결과는 `Project` 컬럼 둘이 든다(D). 이력이 필요해지면 별도 feature.
- 계정 단위 큐 화면 · 그룹 접기 — design §9의 남은 열린 결정 둘.
- `SegmentedLinks` 삭제 — 소비자가 0이 되지만 프리미티브는 남긴다(§1.3).
- Meter의 완료율·검토 대기율을 함께 읽는 추가 스크린리더 설명 — 사용자 제외 결정(design §9-J).
