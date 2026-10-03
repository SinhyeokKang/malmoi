# project-card-tabs — design

⚠️ **시각·행 구성의 정본은 Claude Design `Project Home Meta Tabs v3.dc.html`이고, 그와 다르게 확정한 것은 spec "결정"이 이긴다**
(2026-10-04 수령·리뷰 — `Members (0)` 상시 · Sync 탭 시각 출처 · Publish `Changed`의 데이터 · 바닥 링크 `Sync logs ›`·`Publish logs ›`와 `kind` 필터 목표).
**디자인 정본**: [Project Home Meta Tabs v3](https://claude.ai/design/p/b99d54cd-3034-44f1-8446-0a864da9d767?file=Project+Home+Meta+Tabs+v3.dc.html) — Claude Design 프로젝트 `b99d54cd-3034-44f1-8446-0a864da9d767`, 파일 `Project Home Meta Tabs v3.dc.html` (`/design-sync`는 DesignSync `get_file`로 이 경로를 읽는다). **이 기능은 정본 구현이다** — `/design-sync`(tasks T10)를 건너뛰지 않는다(2026-10-04 사용자).
⚠️ 메모리·DESIGN의 "Claude Design은 신규 페이지 초기 구현만 SoT" 규칙의 **명시 예외**다 — 이미 있는 Home 화면의 일부지만 사용자가 이 시안을 정본으로 지정했다(`/ship` 6.5의 "신규 페이지만" 조건도 이 기능엔 적용하지 않는다).
이 문서는 그 결론을 코드로 옮기는 배선·판정·함정을 적는다.

## 1. 영향 받는 흐름

**편집 UI의 Home 한 화면 + Publish 실행의 기록 한 칸 + Logs의 Publish 행 한 칸**이다. push·export·`/api/*`·MCP 경로는 건드리지 않는다.

| 파일 | 변경 |
|---|---|
| `prisma/schema.prisma` · 마이그레이션 · `lib/privacy/collected.ts` | `SyncRun.changedValues Int?` 추가 (additive · §6). `collected.ts`의 `CLASSIFIED`(:258-270)에 `"SyncRun.changedValues"` 등재 — 없으면 typecheck red(`SyncRunScalarFieldEnum`, :98) |
| Publish 실행 — `lib/pull/run.ts` · `lib/sync/plan.ts` · `lib/sync/run.ts` | `runPull`(`lib/pull/run.ts:238`)이 `PullResult.committed`(:128-)에 수를 싣고 → `SyncFinish`·`planSyncFinish`(`lib/sync/plan.ts:188`)가 필드를 받고 → 종료 `update`(`lib/sync/run.ts:67-80`)가 `SyncRun.changedValues`에 쓴다(§2.3). 커밋·스킵은 수, 실패는 `null` |
| Logs Publish 상세 — `lib/events/query.ts` · `components/logs/event-detail.tsx` | 조인은 이미 있다(`query.ts:93`) — select · `PublishRun` 타입(:55-63) · `present()`(:207-216)에 `changedValues`를 더하고, 상세 `fields`(`event-detail.tsx:270-276`, 지금은 IMPORT만)에서 `changedValuesText`(`lib/events/view.ts:386`)로 그린다. 자리는 **상세만**(보조줄 `eventMeta`엔 넣지 않는다 — `N files` 옆에 수가 둘이 된다). `null`은 기존 관례대로 `—` + `notRecordedForRun`(`event-detail.tsx:238-240`). PUBLISH payload에 복제하지 않는다(logs-rework 결정 1) |
| `lib/home/meta.ts` | `metaRows` → **탭별 행을 내는 `metaTabs`**로 교체. `SUCCESSFUL_IMPORT_RESULTS`·`advancedSyncTime`은 그대로 |
| `lib/home/runs.ts` | `loadHomeRuns`가 **"마지막으로 시각을 전진시킨 IMPORT 사건"** 과 **"마지막 성공 PUBLISH 사건 + 그 `SyncRun`"** 을 고른다(§2.2). 반환형이 `HomeTriggers`에서 넓어진다. **행위자 컬럼을 넣지 않는다** |
| `lib/home/sync-time.ts` | **파일은 남는다** — `SyncTime` 타입을 `lib/home/cards.ts:84`·`meta.ts`가 쓴다. `lastSyncTime` 함수가 다른 소비자 없이 남으면 내 변경이 만든 고아로 지운다(T8) |
| 대기 초대 술어 | `acceptedAt: null` + `expiresAt > now`를 **공유 헬퍼로 추출**한다 — 그대로 된 사본은 `lib/auth/query.ts:151`(`loadPendingInvitations`) 하나이고 Home이 둘째 소비자다. `lib/invitation-email/issue.ts:198`·`app/invite/actions.ts:102`는 `expiresAt: { equals, gt }` CAS 갱신이라 같은 술어가 아니다(범위 밖) · `lib/mcp/tools/project.ts:113`은 사본이 아니라 `loadPendingInvitations` 호출이다 |
| Home `project` select | `pushTokenHash`(값이 아니라 `!== null`만 — 화면·props로 넘기지 않는다) · `_count.invitations`(위 술어). ⚠️ **`now`가 project 조회 뒤에 만들어진다**(`page.tsx:129`) — `_count` where에 넣으려면 앞으로 옮긴다 |
| `components/ui/facts.tsx` | `Fact`에 값 **오른쪽 정렬** 옵션(소비자 = 메타 열) |
| `components/ui/segment.ts` | **신규 헬퍼(문자열 상수만)** — 트랙·칸·선택·비선택 클래스 (§3) |
| `components/ui/segmented-control.tsx` | 상수를 `segment.ts`에서 import, `SegmentBody`를 **export** — 동작 불변 |
| `components/ui/tabs.tsx` | **신규 프리미티브** (§3) |
| `components/home/meta-column.tsx` | 머리 `h2` 제거 → 탭 머리 + 패널 셋 + 탭별 바닥 링크. 값 렌더(`value()`)는 kind별 재사용 |
| `app/(edit)/projects/[slug]/(home)/page.tsx` | `metaRows(...)` → `metaTabs(...)`. 로케일 합집합·`lastSyncTime` 계산 제거 |
| `app/(edit)/projects/[slug]/(home)/loading.tsx` | 탭 머리(실물) + Project 탭 8행 스켈레톤 + 바닥은 `canOpenSettings`일 때만 |
| `messages/en.tsx` | `m.home.meta.tabs.*` · 바닥 링크 `Sync logs`·`Publish logs` · 새 행 라벨(`Connection`·`CI`·`Result`·`Changed`·`Keys seen`·`PR state`) · `Configured`/`Not set up` · `Not open` · `N values` · 기록 없음 갈래 |

## 2. 순수 함수 (`/tdd` 진입점)

### 2.1 `metaTabs(input) → { project: MetaRow[][]; sync: MetaRow[][]; publish: MetaRow[][] }`

패널마다 **묶음 배열**(구분선 단위)을 낸다 — 시안의 묶음 셋/둘이 판정이다. 입력:

```ts
type MetaTabsInput = {
  state: HomeState;                         // not_connected · archived 등 — 지금 판정 그대로
  repository: { owner: string; name: string; branch: string; connection: ConnectionState };
  ciConfigured: boolean;                    // pushTokenHash !== null — 해시는 입력에 없다
  surfaceCount: number;                     // 비보관 표면 수 (Sources 행 · Sync/Publish Sources 행의 "둘 이상" 판정)
  keys: number;
  members: number;
  pendingInvites: number;                   // 0도 값이다 — `(0)`
  createdAt: Date;
  archivedAt: Date | null;
  lastSync: SyncRun | "unrecorded" | null;  // null = 첫 Sync 전 · "unrecorded" = 성공 사건 없음 + 어느 소스든 lastImportedAt 있음
  lastPublish: PublishRun | null;           // null = 발송 전
  held: HoldReason | null;                  // 첫 렌더에 아는 값 — 늦게 오는 것은 껍데기가 든다(§3)
  prState: "pending" | "absent";            // 조회하는 갈래면 pending(스켈레톤 자리), 아니면 absent(행 없음)
};
type SyncRun = { trigger: Trigger; at: Date /* 종료 시각 */; result: "imported" | "partial"; changedValues: number | null; keys: number | null; surfaceSlugs: readonly string[] };
type PublishRun = { trigger: Trigger; at: Date /* SyncRun.finishedAt */; prUrl: string | null; changedValues: number | null; surfaceSlugs: readonly string[] };
```

- **로케일 입력이 없다** — 로케일 행이 어느 입력에서도 나오지 않는다(spec 문제 2의 회귀).
- **소스별 적재 입력이 없다** — Sync 탭은 실행 하나의 사실이고, 실패·진행 중은 입력조차 받지 않는다(배너가 든다). 그래서 문제 3이 구조로 막힌다.
- **역할 입력이 없다** — 행은 역할과 무관하다(spec). 바닥 링크는 `MetaColumn`이 `canOpenSettings`로 고른다.
- `"unrecorded"` = 성공 사건이 없는데 어느 소스든 `lastImportedAt !== null`(사건 기록 2026-09-20 이전 적재) — `notSyncedYet`으로 접으면 거짓이다. `Last sync` 한 행 회색 평문. ⚠️ **지금 `lastSyncTime`의 `"unrecorded"`(`lastImportedAt` 없음 + `lastCommitAt` 있음, `sync-time.ts:11-18`)와 이름만 같은 별개 판정이다** — 같은 타입을 재사용하지 않는다.
- `Synced` = 그 IMPORT 실행의 **종료 시각**(2026-10-04 사용자 — 지금 `lastImportedAt`과 같은 의미). 사건에 종료 시각이 없으면 T6에서 출처를 확정한다(사건 `occurredAt`은 시작이다).
- Publish `surfaceSlugs`는 **실행 시작 때의 비보관 소스 전부**다(`lib/sync/run.ts:187-203`) — "그 PR에 실린 소스"가 아니다. 라벨·설명을 그에 맞추고, 백필된 옛 사건의 `[]`(ARCHITECTURE §5.7.5)는 행을 숨긴다.
- `null` 수치(`changedValues`·`keys`)는 행을 숨긴다 — `0`으로 접지 않는다(malmoi#81과 같은 원칙).
- 상태 매트릭스(`not_connected`면 Repository·Pull request 평문, `archived`면 `Archived` 행)를 JSX의 `&&`로 흩지 않는다(지금 `metaRows` 머리 주석의 이유 그대로).

### 2.2 `loadHomeRuns`의 고르기

- **Sync**: 지금은 "마지막 IMPORT 사건"을 고른 뒤 `advancedSyncTime`을 지나지 못하면 주체를 `null`로 버리고 **더 옛 사건으로 물러나지 않는다**(`meta.ts:139-147` · ARCHITECTURE §5.7.7 `:2077`). 그 금지의 근거는 "주체(사건)와 시각(`lastImportedAt` 최댓값)이 다른 실행을 가리킨다"였는데, 이제 시각도 사건에서 읽으므로 근거가 사라진다 → **시각을 전진시킨 마지막 사건을 SQL 한 번에 고른다**: `result = 'imported' OR (result = 'partial' AND payload의 surfaces에 imported가 하나라도 있음)`(Prisma `payload: { path: ["surfaces"], array_contains: [...] }` — 실행 확인은 T6). `result`는 컬럼이고(`schema.prisma:483`) 야간 보류·스킵은 이미 `result IN (imported, partial)` 필터에서 빠진다(`runs.ts:22`). **최신 N건 + 상한 방식은 쓰지 않는다** — 상한 안이 전부 실패 partial이면 사건이 있는데 `"unrecorded"`로 떨어지는 거짓이 생긴다. SQL 조건이 `advancedSyncTime`과 같은 술어임을 통합 테스트로 대조한다.
  ⚠️ **ARCHITECTURE §5.7.7과 `meta.ts:139-142` 주석을 개정한다**(T11) — 지금 문서가 이 후퇴를 금지한다.
- 인덱스는 지금과 같다 — `kind`·`result` 인덱스가 없어 `[projectId, occurredAt, id]`(`schema.prisma:531`)를 역방향으로 훑는다.
- **Publish**: 마지막 성공 PUBLISH 사건과 조인한 `SyncRun { finishedAt, prUrl, changedValues }`(복합 FK 조인 `schema.prisma:522`, 성공 술어 `runs.ts:26`). 지금의 `Project.lastPublishedAt`·`lastPrUrl`을 쓰지 않는다 — 한 실행의 사실만 한 탭에 선다(spec).
- 둘 다 `loadHomeRuns` 안의 `Promise.all`이고 그 함수는 바깥 `Promise.all`(page.tsx:139) 안이다 — 라운드 불변. 전부 `projectId`로 좁힌다.

### 2.3 Publish `changedValues` 집계 (2026-10-04 사용자 — 정의 (b))

- 정의: **바뀐 파일마다 base 원문과 새 원문을 그 어댑터의 `read`로 파싱해 견준 엔트리 차이 — 수정 + 추가**(삭제는 세지 않는다 — DB에만 있는 키·`orphaned` 키가 빠지는 것은 사람의 편집이 아니다). 새 순수 함수 `countChangedValues(oldRead, newRead) → number`.
  - 왜 (b)인가: 실행은 미전달 셀이 아니라 활성 키 전체의 DB 스냅샷을 렌더한다(`lib/pull/run.ts:173` `renderProject`) — CI 보류 중 리포에서 바뀐 값을 DB 값이 되돌리는 셀은 "실린 편집" 비교(미리보기 `same`, `lib/publish/diff.ts:23` 인라인 · `PREVIEW_LIMIT` 200)로는 안 잡힌다. 미리보기와 공유하지 않는다.
  - SHA가 같은 파일은 렌더 목록(`run.ts:216`)에 없으므로 구조적으로 0이다 — blob SHA 판정과 어긋나지 않는다. 수술적·재생성 어댑터 모두 `read` 하나로 맞는다. GitHub 추가 호출 0(옛 원문은 이미 읽은 `current`, :202-207) · CPU 파싱만 는다.
  - **PR 누적치다** — 열린 PR을 갱신하는 실행은 sync 브랜치를 base에서 다시 뽑으므로 "이번 실행의 증분"이 아니라 "PR 전체 vs base"다. `SyncRun.changed`(파일 수)와 같은 의미 — 스키마 주석과 PRODUCT Logs 절에 적는다.
- ⚠️ **관측값이다 — 판정에 쓰지 않는다.** 이 수로 무엇을 보내거나 건너뛸지 고르는 순간 병합이다(IMPORT `changedValues`의 같은 주석). 실행의 판정은 지금처럼 파일 blob SHA다.
- 값: 커밋(SUCCEEDED)은 센 수 — **표현만 바뀐 파일(`placeholders: null` 왕복 · 키 순서 · description)이면 `0`이 정상 관측값이다**. 스킵(SKIPPED)은 `0`(바뀐 파일 0 — 상세의 `0 files`와 나란히 맞는다). 실패는 `null`. 거부(refusal)는 `SyncRun` 행이 없다(`lib/sync/run.ts:116,152-160`). 기록 이전 행은 `null`.

테스트(`lib/home/__tests__/meta.test.ts` 갱신 · `lib/home/__tests__/sync-time.test.ts:42-44`의 `metaRows` 참조 정리 · `runs.test.ts` · 새 집계 함수 테스트):
- 시안 보드 11개(`1a`~`2h`)를 입력으로 옮겨 탭마다 묶음·행 kind를 전수 고정.
- Sync 탭의 모든 값이 같은 `SyncRun`에서 온다 — 다른 소스의 더 최근 `lastImportedAt`이 `Synced`를 바꾸지 않는다(문제 3의 회귀).
- 실패·진행 중 입력이 없음을 타입으로 고정(카드 불변) · `partial`이면 `Result`만 호박.
- `"unrecorded"` · 첫 Sync 전 · 발송 전 · `null` 수치(행 없음) · `pendingInvites: 0`이 `(0)` · 소스 1개면 Sync/Publish `Sources` 행 없음, Project `Sources` 행은 있음 · `prState` 두 갈래.
- 소스 0개는 `planProjectReadiness`가 `ProjectNotReady`로 먼저 끊으므로(`page.tsx:125`) 대상이 아니다.
- `advancedSyncTime`을 못 지난 partial·보류 사건을 건너뛰고 그 앞 실행을 고른다(§2.2).

## 3. 탭 프리미티브 — `components/ui/tabs.tsx`

**지금 리포에 탭 프리미티브는 없다.** 모양은 세그먼트 형을 쓴다(시안이 그대로 확정 — 트랙 `canvas` · radius 12 · padding 4 · gap 4 · 칸 radius 10 · `4px 8px` · 14 · 선택 흰 면 + `shadow-low` + 500).

| 선례 | 언제 · 어디 | 형 |
|---|---|---|
| **프로젝트 오른쪽 패널** `ProjectPanel` | 2026-09-11 Stage 8 (`23f0f503`) · `components/shell/project-panel.tsx` — 지금 없다 | 320px `<aside>` 위 `General` · `Changes` `SegmentedControl` 전폭. ⚠️ 의미는 radiogroup이었고, aside와 radiogroup이 둘 다 `Project panel`로 읽힌 이름 충돌이 있었다 |
| `/projects` 필터 탭 여섯 | 2026-09-11~13 (`eeff006c` 사용처 제거 · `6003fb8f` export 삭제) | `SegmentedLinks`(URL 판) — 같은 트랙·칸 형 |

형(`components/ui/segmented-control.tsx`의 상수 — 지금은 export되지 않은 로컬 `:23-27`):

| 부분 | 클래스 |
|---|---|
| 트랙(`TabsList`) | `bg-canvas flex items-center gap-1 rounded-lg p-1` — **항상 전폭** |
| 칸(`TabsTrigger`) | `inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-md px-2 py-1 text-center text-sm flex-1` — `rounded-md` = 10px(트랙 12 = 칸 10 + `p-1` 4 동심, `segmented-control.tsx:16-21`) |
| 선택 | `bg-background shadow-low font-medium` — ⚠️ **`data-[state=active]:`로 걸지 않는다**(아래) |
| 비선택 | `text-muted-foreground hover:text-foreground` |
| 포커스 | `focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none` — **리터럴로 `tabs.tsx`에 둔다**(focus-ring 스캐너 `focus-ring.test.ts:225`가 소스의 리터럴을 센다, DESIGN §7) |
| 칸 내용 | `SegmentBody`(export해서 재사용) |

- ⚠️ **형을 손으로 베끼지 않는다** — 문자열 상수를 `components/ui/segment.ts`로 꺼내 둘이 같은 상수를 import한다. `SegmentBody`는 JSX라 `.ts`에 둘 수 없다 — `segmented-control.tsx`에서 export한다(`.tsx`를 새로 만들면 프리미티브가 49개가 되고 focus-ring 스캐너 `FILES`에 걸린다).
- ⚠️ **선택 스타일은 제어 컴포넌트로 건다** — `Tabs`가 `value` 상태를 들고 `SegmentedControl`(`:105`)처럼 같은 `SELECTED` 상수를 **JS로 조건부** 붙인다. `data-[state=active]:${SELECTED}`는 Tailwind가 CSS를 만들지 않는데 jsdom 테스트는 class 문자열만 봐서 green이 난다(POSTMORTEM 2026-09-24 "jsdom에서만 참" 부류).
- ⚠️ **`SegmentedControl`을 탭으로 쓰지 않는다** — 그것은 `radiogroup`이고 패널 연결이 없다(DESIGN §6.4 :721). 시안 메모의 "탭 의미는 코드에 없음"이 이 프리미티브로 채워진다. DESIGN §6.4에 경계를 한 줄로 적는다.
- **Radix `Tabs`를 `radix-ui` 단일 패키지에서 쓴다** — `@radix-ui/react-tabs` 1.1.21이 `radix-ui@1.6.7`의 전이 의존성으로 이미 설치돼 있다(새 의존성 0). Radix 부품 일곱 → **여덟**, 프리미티브 모듈 47 → **48**(CLAUDE.md:75 · DESIGN.md:52 스택 표).
- API는 소비자 하나가 쓰는 만큼만: `Tabs`(Root, 제어) · `TabsList`(`label`) · `TabsTrigger` · `TabsContent`. 다른 축을 열지 않는다.
- ⚠️ **Radix Tabs는 비활성 패널을 언마운트한다** — `useArrived`는 `useState(null)`로 시작해 effect에서 값을 받으므로(`components/use-arrived.ts:18-25`) 다시 마운트되면 한 프레임은 값 없이 그려진다. → **늦게 오는 promise(보류 판정 · PR state)는 항상 마운트된 탭 껍데기에서 한 번 구독하고 값을 패널로 내린다.** 시안의 자리 규칙: Hold는 자리를 잡지 않고 묶음 끝에 붙는다 · PR state는 조회하는 갈래면 56px 스켈레톤이 자리를 잡는다. `forceMount`를 쓰지 않는다.
- ⚠️ **비활성 탭의 `aria-controls`는 없는 id를 가리킨다** — 언마운트의 알려진 결과다. CDP 실측 표에 미리 적는다.
- ⚠️ **jsdom + Radix + `user-event`는 실시간 지연이 있다** (POSTMORTEM 2026-09-13) — 탭 DOM 테스트 파일 머리에만 `vi.setConfig({ testTimeout: 20_000 })`. Radix `TabsTrigger`는 `onMouseDown`으로 선택하므로 **`user-event`를 쓴다.**
- ⚠️ **focus-ring 스캐너**: `radix-ui`를 import하는 `ui/` 파일은 `RADIX_FIXTURES`(`focus-ring.test.ts:156`) 등록이 필수다 — `tabs.tsx` 픽스처를 추가한다.

## 4. 서버/클라이언트 경계

- **탭 껍데기만 `"use client"`** 로 두고, 패널 내용과 탭별 바닥 링크는 서버가 렌더한 `ReactNode`를 넘긴다. 바닥 링크 목표는 `routes.logs(slug, { kind: "imports" })` · `routes.logs(slug, { kind: "publish" })` — `kind` 값은 `LOG_KINDS`(`lib/events/payload.ts:300`)의 화면 낱말이고 손 문자열이 아니라 그 상수에서 고른다(⚠️ `app/__tests__/entry-points.test.ts`는 `app/`과 `EXTRA_EMITTERS`(:671-)만 훑는다 — `components/home/meta-column.tsx`를 그 목록에 더해야 새 `routes.logs` 호출이 검사된다, T8). `relativeTime(row.at, now)`·`pullNumberFrom` 등이 서버에 남는다.
- **탭 라벨도 서버가 props로 넘긴다** — 껍데기는 `components/ui/tabs`와 `components/use-arrived`만 import한다.
- 늦게 오는 promise는 껍데기가 props로 받아 구독한다(§3) — 지금 `HoldLater`와 같은 RSC 직렬화 경로.
- ⚠️ **클라이언트 그래프에 `lib/**`를 끌어들이지 않는다** (POSTMORTEM 2026-09-07). `components/__tests__/client-graph.test.ts`가 지킨다.
- `now`는 서버에서 한 번 만든 것을 쓴다.

## 5. 접근성

- 머리 `h2#home-meta-title`가 사라지므로 aside 이름은 **`aria-label="Project"`** 로 옮긴다. `home-landmarks.test.tsx`의 `labelledBy` 헬퍼(`:25-30`, `aria-labelledby`만 읽는다)를 고친다 — 기대값 `Project`는 그대로.
- 접근 이름: aside `Project` · 탭 목록 `Project details` · 탭 `Project`/`Sync`/`Publish`. 첫 탭과 aside 이름이 같지만 역할이 달라(랜드마크 vs 탭) 스크린리더가 "Project, complementary" / "Project, tab, 1 of 3"으로 가른다 — CDP 실측으로 확인한다.
- 패널 안은 지금처럼 `<dl>`(`Fact`) — 탭 패널이 `tabpanel` 역할과 탭 이름 라벨을 갖는다. 값 오른쪽 정렬은 시각만이다(`dir` 아님).
- CDP 접근성 트리 실측 표(DESIGN §6.64)에 탭 행을 추가한다. jsdom은 accname을 계산하지 않는다.

## 6. 스키마 · 환경변수 · 불변식

- **스키마: `SyncRun.changedValues Int?` 하나 — additive.** 기존 행은 `null`(기록 이전 = 행 없음). 배포 순서: dev는 `/push` 전 `/db`, prod는 `/merge` 1단계 `db:deploy` — 코드는 컬럼을 읽기만/쓰기만 하므로 컬럼이 먼저 있어야 한다(additive-first). 새 마이그레이션 뒤 dev·prod `has_schema_privilege` false 확인(`/db` 5단계).
  스키마 주석: "Publish가 리포 파일에서 바꾼 번역 엔트리 수(수정+추가, 삭제 제외) — 열린 PR 갱신이면 PR 전체 vs base 누적. 관측값 — 판정에 쓰지 않는다. 스킵은 0, 실패·기록 이전은 null".
- **새 GitHub 호출 없음** — PR state는 `planHomeHold`가 이미 부르는 `loadOpenPrUrlMemo`의 결과만 쓴다.
- ⚠️ **`pushTokenHash`는 해시라도 RSC 페이로드에 싣지 않는다** — 서버에서 boolean으로 접는다. 정적 검사로 고정한다(tasks T6).
- ⚠️ **대기 초대 수는 추출한 공유 술어**(수락·만료 둘 다 제외)를 쓴다(POSTMORTEM 2026-09-10).
- **새 환경변수 없음.**
- **불변식**: export 결정성·blob SHA는 그대로다 — `changedValues`는 커밋 판정 뒤에 세는 관측값이고 무엇을 쓸지에 들어가지 않는다(코어 원칙 "병합 없음"). 인가: Home `requireProjectAccess` 그대로. **EDITOR에게 새로 보이는 사실**(CI 설정 여부 · Connection)은 2026-10-04 사용자가 허용했다 — 행은 역할과 무관하다. PRODUCT 권한표에 Home 메타 열 한 줄을 남긴다(T8).
- **사건 행위자를 싣지 않는다** (POSTMORTEM 2026-09-29 #146) — `loadHomeRuns`에 select를 더할 때 `actor`·`actorUserId`를 넣지 않는다. `Archived`도 행위자 없음.

## 7. 문서 갱신 (태스크로 남긴다)

- DESIGN §6.64: 메타 열 행 · 주체 행 · 로딩 골격 행(:1261 "메타 9" → 8) · 접근성 표 · 이탈 표 · 실측 보드 표 · 값 오른쪽 정렬과 바닥 링크 둘.
- DESIGN §6.4: `Tabs` 프리미티브 행과 `SegmentedControl`과의 경계 · `Fact` 정렬 옵션. DESIGN.md:52 스택 표의 Radix 부품 수.
- ARCHITECTURE: 스키마 절에 `SyncRun.changedValues`(정의 (b) · PR 누적 · 관측값, 판정 금지) · **§5.7.7(`:2077`) "더 옛 사건으로 물러나지 않는다" 개정**(시각을 사건에서 읽으므로 후퇴가 정합하다).
- CLAUDE.md:75 스택 표: 프리미티브 47 → 48, Radix 일곱 → 여덟(목록에 Tabs).
- DIRECTORY: `components/ui/tabs.tsx` · `components/ui/segment.ts` · 대기 초대 술어 헬퍼 · Publish 집계 함수.
- PRODUCT §4.1(:292 근처) "Home `Last sync` 행에 `held until…`이 붙는다" 문장(보류가 Sync 탭 `Hold` 행으로) · 권한표에 메타 열 노출 · Logs Publish 행의 `Changed`.
- 가이드: tasks T10.
- 범위 밖 언급만: `lib/home/cards.ts:89,158` 주석의 "Suspense"는 실제로 `useArrived` effect 구독이다 · 카운트 카드 골격 `gap-1.5`(`loading.tsx:59`) vs 실물 `gap-0.5`(`count-cards.tsx:106`).
